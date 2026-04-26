import { EventEmitter } from "node:events";
import { BaseAgentBridge } from "../../agent-bridge/base-agent-bridge.js";
import { CallError } from "../../errors.js";
import type { AgentBridge } from "../../interfaces/agent-bridge.js";
import type { Call } from "../../interfaces/call.js";
import type {
  CallMode,
  CallOptions,
  CallState,
  CallTextMessage,
  Endpoint,
  MediaSource,
  MediaType,
} from "../../types.js";

/**
 * A recorded outbound media send — stored for test assertions.
 */
export type SentMediaEntry = {
  /** The media type that was sent. */
  type: MediaType;
  /** All chunks received from the stream in order. */
  chunks: Buffer[];
};

/**
 * In-memory {@link Call} implementation for deterministic testing.
 *
 * `MockCall` exposes test-helper methods prefixed with `_` to allow
 * unit tests and {@link MockVoiceProvider} to drive the call without
 * a real network. These are intentionally NOT part of the {@link Call}
 * interface — do not use them in production code.
 *
 * @example
 * ```ts
 * const provider = new MockVoiceProvider();
 * const call = provider.ring({ type: 'whatsapp', id: '+1234' });
 * await call.accept();
 * call._triggerVoiceInput('hello', 0.95);
 * ```
 */
export class MockCall extends EventEmitter implements Call {
  readonly id: string;
  readonly provider = "mock";
  readonly endpoint: Endpoint;

  private _state: CallState = "initialized";
  private _mode: CallMode;
  private readonly _activeMedia = new Set<MediaType>();
  private readonly _bridge: BaseAgentBridge;
  private readonly _sentMedia: SentMediaEntry[] = [];

  constructor(id: string, endpoint: Endpoint, options?: CallOptions) {
    super();
    this.id = id;
    this.endpoint = endpoint;
    this._mode = options?.mode ?? "full-duplex";
    this._bridge = new BaseAgentBridge(this);
  }

  // -------------------------------------------------------------------------
  // Call interface — readable properties
  // -------------------------------------------------------------------------

  get state(): CallState {
    return this._state;
  }

  // -------------------------------------------------------------------------
  // Call interface — control
  // -------------------------------------------------------------------------

  async accept(options?: { mediaTypes?: MediaType[] }): Promise<void> {
    if (this._state !== "initialized" && this._state !== "ringing") {
      throw CallError.rejected(`Cannot accept: call is in state "${this._state}"`);
    }
    const media = options?.mediaTypes ?? ["audio"];
    this._transitionState("connecting");
    for (const m of media) {
      this._activeMedia.add(m);
    }
    this._transitionState("connected");
    for (const m of this._activeMedia) {
      this.emit("media", m, true);
    }
  }

  async reject(_reason?: string): Promise<void> {
    this._transitionState("ended");
  }

  async hangup(_reason?: string): Promise<void> {
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

  media(): ReadonlySet<MediaType>;
  media(newMedia: MediaType[]): Promise<void>;
  media(newMedia?: MediaType[]): ReadonlySet<MediaType> | Promise<void> {
    if (newMedia === undefined) return this._activeMedia;
    if (this._state !== "connected") {
      return Promise.reject(
        CallError.mediaFailure(`Cannot set media: call is in state "${this._state}"`),
      );
    }
    for (const m of newMedia) {
      if (!this._activeMedia.has(m)) {
        this._activeMedia.add(m);
        this.emit("media", m, true);
      }
    }
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Call interface — media
  // -------------------------------------------------------------------------

  receive(type: MediaType): MediaSource | null {
    if (!this._activeMedia.has(type)) return null;
    return MockCall._makeTestStream(type);
  }

  private static async *_makeTestStream(type: MediaType): AsyncGenerator<Buffer> {
    yield Buffer.from(`${type}-chunk-1`);
    yield Buffer.from(`${type}-chunk-2`);
  }

  async send(data: MediaSource, type: MediaType): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(chunk);
    }
    this._sentMedia.push({ type, chunks });
  }

  // -------------------------------------------------------------------------
  // Call interface — text channel
  // -------------------------------------------------------------------------

  async sendText(_message: string, _options?: { mentions?: string[] }): Promise<void> {
    // No-op: outbound text from the mock call side; tests use _simulateText
    // to push inbound text messages.
  }

  onText(callback: (msg: CallTextMessage) => void): void {
    this.on("text", callback);
  }

  // -------------------------------------------------------------------------
  // Call interface — agent bridge
  // -------------------------------------------------------------------------

  agent(): AgentBridge {
    return this._bridge;
  }

  // -------------------------------------------------------------------------
  // Internal test helpers
  // -------------------------------------------------------------------------

  /**
   * Force a state transition and emit the `"state"` event.
   * Used by {@link MockVoiceProvider} and in unit tests.
   *
   * @internal
   */
  _transitionState(newState: CallState): void {
    this._state = newState;
    this.emit("state", newState);
  }

  /**
   * Emit a text message as if it arrived from the remote party.
   *
   * @internal
   */
  _simulateText(msg: CallTextMessage): void {
    this.emit("text", msg);
  }

  /**
   * Trigger `onSpeech` callbacks on the bridge — as if the STT provider
   * produced a transcript for the call's audio stream.
   *
   * @internal
   */
  _triggerVoiceInput(transcript: string, confidence: number, metadata?: unknown): void {
    this._bridge._triggerVoiceInput(transcript, confidence, metadata);
  }

  /**
   * Return all media chunks sent via {@link MockCall.send}.
   * Useful for asserting that {@link AgentBridge.say} delivered the
   * expected audio.
   *
   * @internal
   */
  sent(): ReadonlyArray<SentMediaEntry> {
    return this._sentMedia;
  }
}
