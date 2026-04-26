import { EventEmitter } from "node:events";
import { BaseAgentBridge } from "../../agent-bridge/base-agent-bridge.js";
import { CallError } from "../../errors.js";
import type { AgentBridge } from "../../interfaces/agent-bridge.js";
import type { Call } from "../../interfaces/call.js";
import type {
  CallMode,
  CallState,
  CallTextMessage,
  Endpoint,
  MediaSource,
  MediaType,
} from "../../types.js";
import type { WhatsAppCallEvent } from "./connection-manager.js";
import type { WhatsAppConnectionManager } from "./connection-manager.js";
import { MediaStreamQueue } from "./media-stream-queue.js";

/**
 * A WhatsApp call session backed by a {@link WhatsAppConnectionManager}.
 *
 * All lifecycle operations (`accept`, `reject`, `hangup`) delegate to the
 * manager, which in turn drives the underlying WASocket. Inbound audio is
 * exposed as a push-fed {@link MediaSource} via `getMediaStream()`.
 *
 * State transitions triggered externally (remote hangup, network failure)
 * are delivered via {@link WhatsAppCall._notifyExternalStateChange}.
 */
export class WhatsAppCall extends EventEmitter implements Call {
  readonly id: string;
  readonly provider = "whatsapp";
  readonly endpoint: Endpoint;

  private _state: CallState = "ringing";
  private _mode: CallMode = "full-duplex";
  private readonly _activeMedia = new Set<MediaType>();
  private readonly _bridge: BaseAgentBridge;
  private readonly _mediaQueues = new Map<MediaType, MediaStreamQueue>();
  private readonly _manager: WhatsAppConnectionManager;

  constructor(event: WhatsAppCallEvent, manager: WhatsAppConnectionManager) {
    super();
    this.id = event.callId;
    this._manager = manager;
    this.endpoint = { type: "whatsapp", id: event.from };
    this._bridge = new BaseAgentBridge(this);

    // Wire inbound audio from the manager into the media queue.
    manager.onAudioData?.((callId, chunk) => {
      if (callId === this.id) {
        this._mediaQueues.get("audio")?.push(chunk);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Readable properties
  // -------------------------------------------------------------------------

  get state(): CallState {
    return this._state;
  }

  get mode(): CallMode {
    return this._mode;
  }

  get activeMedia(): ReadonlySet<MediaType> {
    return this._activeMedia;
  }

  // -------------------------------------------------------------------------
  // Control
  // -------------------------------------------------------------------------

  async accept(options?: { mediaTypes?: MediaType[] }): Promise<void> {
    if (this._state !== "initialized" && this._state !== "ringing") {
      throw CallError.rejected(`Cannot accept: call is in state "${this._state}"`);
    }

    const media = options?.mediaTypes ?? ["audio"];
    const wantsVideo = media.includes("video");

    try {
      this._transitionState("connecting");
      await this._manager.answerCall(this.id, { video: wantsVideo });
    } catch (err) {
      this._transitionState("failed");
      throw CallError.mediaFailure(err instanceof Error ? err.message : "answerCall failed");
    }

    for (const m of media) {
      this._activeMedia.add(m);
      this._mediaQueues.set(m, new MediaStreamQueue());
      this.emit("media", m, true);
    }

    this._transitionState("connected");
  }

  async reject(reason?: string): Promise<void> {
    await this._manager.rejectCall(this.id, reason);
    this._transitionState("ended");
  }

  async hangup(_reason?: string): Promise<void> {
    await this._manager.endCall(this.id);
    this._transitionState("ended");
  }

  async upgradeMode(newMode: CallMode): Promise<void> {
    if (this._state !== "connected") {
      throw CallError.unauthorized(`Cannot upgrade mode: call is in state "${this._state}"`);
    }
    this._mode = newMode;
  }

  async upgradeMedia(newMedia: MediaType[]): Promise<void> {
    if (this._state !== "connected") {
      throw CallError.mediaFailure(`Cannot upgrade media: call is in state "${this._state}"`);
    }
    for (const m of newMedia) {
      if (!this._activeMedia.has(m)) {
        this._activeMedia.add(m);
        this._mediaQueues.set(m, new MediaStreamQueue());
        this.emit("media", m, true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  getMediaStream(type: MediaType): MediaSource | null {
    return this._mediaQueues.get(type) ?? null;
  }

  async sendMedia(data: MediaSource, type: MediaType): Promise<void> {
    if (type === "audio" && this._manager.sendAudio) {
      for await (const chunk of data) {
        await this._manager.sendAudio(this.id, chunk);
      }
    }
    // Non-audio media types or managers without sendAudio: no-op for now.
  }

  // -------------------------------------------------------------------------
  // Text channel
  // -------------------------------------------------------------------------

  async sendText(_message: string, _options?: { mentions?: string[] }): Promise<void> {
    // Text channel within a WhatsApp call is not yet implemented in the SDK.
    // Placeholder for future extension.
  }

  onText(callback: (msg: CallTextMessage) => void): void {
    this.on("text", callback);
  }

  // -------------------------------------------------------------------------
  // Agent bridge
  // -------------------------------------------------------------------------

  getAgentBridge(): AgentBridge {
    return this._bridge;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Transition to a new state and emit the `"state"` event.
   * @internal
   */
  private _transitionState(newState: CallState): void {
    this._state = newState;
    this.emit("state", newState);
  }

  /**
   * Apply a state change received from the manager (remote hangup, failure).
   * Called by {@link WhatsAppVoiceProvider} when `onCallStateChange` fires.
   *
   * @internal
   */
  _notifyExternalStateChange(state: "connecting" | "connected" | "ended" | "failed"): void {
    if (state === "ended" || state === "failed") {
      // End all media streams so consumers can drain cleanly.
      for (const queue of this._mediaQueues.values()) {
        queue.end();
      }
    }
    this._transitionState(state);
  }

  /**
   * Close a specific media stream queue (used in tests and on call teardown).
   * @internal
   */
  _endMediaStream(type: MediaType): void {
    this._mediaQueues.get(type)?.end();
  }
}
