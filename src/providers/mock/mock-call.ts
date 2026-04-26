import { EventEmitter } from "node:events";
import { BaseAgentBridge } from "../../agent-bridge/base-agent-bridge.js";
import { CallError } from "../../errors.js";
import type { AgentBridge } from "../../interfaces/agent-bridge.js";
import type { Call } from "../../interfaces/call.js";
import type {
  CallDirection,
  CallMode,
  CallOptions,
  CallState,
  CallTextMessage,
  DtmfTone,
  Endpoint,
  MediaSource,
  MediaType,
  Participant,
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
  private readonly _direction: CallDirection;
  private _connectedAt: number | undefined = undefined;
  private readonly _activeMedia = new Set<MediaType>();
  private readonly _mutedChannels = new Set<MediaType>();
  private readonly _bridge: BaseAgentBridge;
  private readonly _sentMedia: SentMediaEntry[] = [];
  private readonly _sentDTMF: DtmfTone[] = [];
  private readonly _dtmfCallbacks: Array<(tone: DtmfTone) => void> = [];
  private readonly _participants: Participant[] = [];
  private readonly _joinCallbacks: Array<(p: Participant) => void> = [];
  private readonly _leaveCallbacks: Array<(p: Participant, reason?: string) => void> = [];
  private readonly _speakingCallbacks: Array<(p: Participant, isSpeaking: boolean) => void> = [];

  constructor(
    id: string,
    endpoint: Endpoint,
    options?: CallOptions,
    direction: CallDirection = "inbound",
  ) {
    super();
    this.id = id;
    this.endpoint = endpoint;
    this._mode = options?.mode ?? "full-duplex";
    this._direction = direction;
    this._bridge = new BaseAgentBridge(this);
  }

  // -------------------------------------------------------------------------
  // Call interface — readable properties
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
    return this._participants;
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
    this._connectedAt = Date.now();
    this._transitionState("connected");
    for (const m of this._activeMedia) {
      this.emit("media", m, true);
    }
  }

  async reject(_reason?: string): Promise<void> {
    this._transitionState("ended");
  }

  async hangup(_reason?: string): Promise<void> {
    this._connectedAt = undefined;
    this._transitionState("ended");
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
    // Mock: no-op. Real providers route via the connection manager.
  }

  async dtmf(tone: DtmfTone): Promise<void> {
    this._sentDTMF.push(tone);
  }

  onDTMF(callback: (tone: DtmfTone) => void): void {
    this._dtmfCallbacks.push(callback);
  }

  onJoin(callback: (p: Participant) => void): void {
    this._joinCallbacks.push(callback);
  }

  onLeave(callback: (p: Participant, reason?: string) => void): void {
    this._leaveCallbacks.push(callback);
  }

  onSpeaking(callback: (p: Participant, isSpeaking: boolean) => void): void {
    this._speakingCallbacks.push(callback);
  }

  async raise(): Promise<void> {}

  async lower(): Promise<void> {}

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

  async text(_message: string, _options?: { mentions?: string[] }): Promise<void> {
    // No-op: outbound text from the mock call side; tests use _simulateText
    // to push inbound text messages.
  }

  onText(callback: (msg: CallTextMessage) => void): void {
    this.on("text", callback);
  }

  onAudio(callback: (stream: MediaSource) => void): void {
    // If audio is already active, deliver a stream immediately.
    if (this._activeMedia.has("audio")) {
      callback(MockCall._makeTestStream("audio"));
      return;
    }
    // Otherwise, wait for the audio channel to activate.
    this.on("media", (type: MediaType, active: boolean) => {
      if (type === "audio" && active) callback(MockCall._makeTestStream("audio"));
    });
  }

  onVideo(callback: (stream: MediaSource) => void): void {
    if (this._activeMedia.has("video")) {
      callback(MockCall._makeTestStream("video"));
      return;
    }
    this.on("media", (type: MediaType, active: boolean) => {
      if (type === "video" && active) callback(MockCall._makeTestStream("video"));
    });
  }

  // -------------------------------------------------------------------------
  // Call interface — agent bridge
  // -------------------------------------------------------------------------

  get agent(): AgentBridge {
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
   * Trigger `onHeard` callbacks on the bridge — as if the STT provider
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

  /** Return all DTMF tones sent via {@link MockCall.dtmf}. @internal */
  sentDTMF(): ReadonlyArray<DtmfTone> {
    return this._sentDTMF;
  }

  /** Simulate receiving a DTMF tone — fires onDTMF callbacks. @internal */
  _simulateDTMF(tone: DtmfTone): void {
    for (const cb of this._dtmfCallbacks) cb(tone);
  }

  /** Add a participant and fire onJoin callbacks. @internal */
  _addParticipant(participant: Participant): void {
    this._participants.push(participant);
    for (const cb of this._joinCallbacks) cb(participant);
  }

  /** Remove participant by id and fire onLeave callbacks. @internal */
  _removeParticipant(id: string, reason?: string): void {
    const idx = this._participants.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [removed] = this._participants.splice(idx, 1);
    if (removed) {
      for (const cb of this._leaveCallbacks) cb(removed, reason);
    }
  }

  /** Fire onSpeaking callbacks for a participant. @internal */
  _notifySpeaking(id: string, isSpeaking: boolean): void {
    const participant = this._participants.find((p) => p.id === id);
    if (!participant) return;
    for (const cb of this._speakingCallbacks) cb(participant, isSpeaking);
  }
}
