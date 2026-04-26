import { EventEmitter } from "node:events";
import { BaseAgentBridge } from "../../agent-bridge/base-agent-bridge.js";
import { CallError } from "../../errors.js";
import type { AgentBridge } from "../../interfaces/agent-bridge.js";
import type { Call } from "../../interfaces/call.js";
import type {
  CallDirection,
  CallMode,
  CallState,
  CallTextMessage,
  DtmfTone,
  Endpoint,
  MediaSource,
  MediaType,
  Participant,
} from "../../types.js";
import type { WhatsAppCallEvent } from "./connection-manager.js";
import type { WhatsAppConnectionManager } from "./connection-manager.js";
import { MediaStreamQueue } from "./media-stream-queue.js";

/**
 * A WhatsApp call session backed by a {@link WhatsAppConnectionManager}.
 *
 * All lifecycle operations (`accept`, `reject`, `hangup`) delegate to the
 * manager, which in turn drives the underlying WASocket. Inbound audio is
 * exposed as a push-fed {@link MediaSource} via `stream()`.
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
  private readonly _direction: CallDirection;
  private _connectedAt?: number;
  private readonly _activeMedia = new Set<MediaType>();
  private readonly _mutedChannels = new Set<MediaType>();
  private readonly _bridge: BaseAgentBridge;
  private readonly _mediaQueues = new Map<MediaType, MediaStreamQueue>();
  private readonly _manager: WhatsAppConnectionManager;
  private readonly _dtmfCallbacks: Array<(t: DtmfTone) => void> = [];

  constructor(
    event: WhatsAppCallEvent,
    manager: WhatsAppConnectionManager,
    direction: CallDirection = "inbound",
  ) {
    super();
    this.id = event.callId;
    this._manager = manager;
    this.endpoint = { type: "whatsapp", id: event.from };
    this._direction = direction;
    this._bridge = new BaseAgentBridge(this);

    // Wire inbound audio from the manager into the media queue.
    manager.onAudio?.((callId, chunk) => {
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

  get direction(): CallDirection {
    return this._direction;
  }

  get duration(): number {
    if (!this._connectedAt || this._state === "ended" || this._state === "failed") return 0;
    return Date.now() - this._connectedAt;
  }

  get participants(): ReadonlyArray<Participant> {
    // Participant awareness is provider-specific — not yet wired for WhatsApp.
    return [];
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
      await this._manager.answer(this.id, { video: wantsVideo });
    } catch (err) {
      this._transitionState("failed");
      throw CallError.mediaFailure(err instanceof Error ? err.message : "answer failed");
    }

    for (const m of media) {
      this._activeMedia.add(m);
      this._mediaQueues.set(m, new MediaStreamQueue());
      this.emit("media", m, true);
    }

    this._connectedAt = Date.now();
    this._transitionState("connected");
  }

  async hold(): Promise<void> {
    if (this._state !== "connected") {
      return Promise.reject(
        CallError.unauthorized(`Cannot hold: call is in state "${this._state}"`),
      );
    }
    this._transitionState("held");
  }

  async resume(): Promise<void> {
    if (this._state !== "held") {
      return Promise.reject(
        CallError.unauthorized(`Cannot resume: call is in state "${this._state}"`),
      );
    }
    this._transitionState("connected");
  }

  async mute(type: MediaType): Promise<void> {
    this._mutedChannels.add(type);
  }

  async unmute(type: MediaType): Promise<void> {
    this._mutedChannels.delete(type);
  }

  muted(): ReadonlySet<MediaType> {
    return this._mutedChannels;
  }

  async transfer(_endpoint: Endpoint): Promise<void> {
    // TODO: implement via manager.transfer() when added to WhatsAppConnectionManager.
  }

  async dtmf(tone: DtmfTone): Promise<void> {
    // TODO: implement via manager.sendDTMF() when added to WhatsAppConnectionManager.
    void tone;
  }

  onDTMF(callback: (tone: DtmfTone) => void): void {
    this._dtmfCallbacks.push(callback);
  }

  onJoin(_callback: (p: Participant) => void): void {}
  onLeave(_callback: (p: Participant, reason?: string) => void): void {}
  onSpeaking(_callback: (p: Participant, isSpeaking: boolean) => void): void {}
  async raise(): Promise<void> {}
  async lower(): Promise<void> {}

  async reject(reason?: string): Promise<void> {
    await this._manager.reject(this.id, reason);
    this._transitionState("ended");
  }

  async hangup(_reason?: string): Promise<void> {
    this._connectedAt = undefined;
    await this._manager.end(this.id);
    this._transitionState("ended");
  }

  mode(): CallMode;
  mode(newMode: CallMode): Promise<void>;
  mode(newMode?: CallMode): CallMode | Promise<void> {
    if (newMode === undefined) return this._mode;
    if (this._state !== "connected") {
      return Promise.reject(
        CallError.unauthorized(`Cannot set mode: call is in state "${this._state}"`),
      );
    }
    this._mode = newMode;
    return Promise.resolve();
  }

  channels(): ReadonlySet<MediaType>;
  channels(newMedia: MediaType[]): Promise<void>;
  channels(newMedia?: MediaType[]): ReadonlySet<MediaType> | Promise<void> {
    if (newMedia === undefined) return this._activeMedia;
    if (this._state !== "connected") {
      return Promise.reject(
        CallError.mediaFailure(`Cannot set media: call is in state "${this._state}"`),
      );
    }
    for (const m of newMedia) {
      if (!this._activeMedia.has(m)) {
        this._activeMedia.add(m);
        this._mediaQueues.set(m, new MediaStreamQueue());
        this.emit("media", m, true);
      }
    }
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  receive(type: MediaType): MediaSource | null {
    return this._mediaQueues.get(type) ?? null;
  }

  async send(data: MediaSource, type: MediaType): Promise<void> {
    if (type === "audio" && this._manager.send) {
      for await (const chunk of data) {
        await this._manager.send(this.id, chunk);
      }
    }
    // Non-audio media types or managers without send: no-op for now.
  }

  // -------------------------------------------------------------------------
  // Text channel
  // -------------------------------------------------------------------------

  async text(_message: string, _options?: { mentions?: string[] }): Promise<void> {
    // Text channel within a WhatsApp call is not yet implemented in the SDK.
    // Placeholder for future extension.
  }

  onText(callback: (msg: CallTextMessage) => void): void {
    this.on("text", callback);
  }

  onAudio(callback: (stream: MediaSource) => void): void {
    // Deliver the existing queue if audio is already active.
    const existing = this._mediaQueues.get("audio");
    if (existing) {
      callback(existing);
      return;
    }
    // Otherwise, wait for activation (single-consumer until media-pipeline tee).
    this.on("media", (type: MediaType, active: boolean) => {
      if (type === "audio" && active) {
        const q = this._mediaQueues.get("audio");
        if (q) callback(q);
      }
    });
  }

  onVideo(callback: (stream: MediaSource) => void): void {
    const existing = this._mediaQueues.get("video");
    if (existing) {
      callback(existing);
      return;
    }
    this.on("media", (type: MediaType, active: boolean) => {
      if (type === "video" && active) {
        const q = this._mediaQueues.get("video");
        if (q) callback(q);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Agent bridge
  // -------------------------------------------------------------------------

  get agent(): AgentBridge {
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
   * Called by {@link WhatsAppVoiceProvider} when `onState` fires.
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
