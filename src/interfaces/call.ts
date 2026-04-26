import type { EventEmitter } from "node:events";
import type { AgentBridge } from "./agent-bridge.js";
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
} from "../types.js";

/**
 * A real-time call session with full lifecycle management, media streams,
 * an in-session text channel, and an AI {@link AgentBridge}.
 *
 * `Call` extends `EventEmitter` so callers can listen for state transitions
 * and media changes without polling.
 *
 * ## Lifecycle
 *
 * ```
 * initialized → ringing → connecting → connected ↔ held → ended
 *                                                        → failed
 * ```
 *
 * ## Example
 *
 * ```ts
 * call.on('state', (state) => console.log('call state:', state));
 *
 * await call.accept({ mediaTypes: ['audio'] });
 *
 * const agent = call.agent;
 * agent.onHeard((transcript) => {
 *   void agent.say('You said: ' + transcript);
 * });
 * ```
 */
export interface Call extends EventEmitter {
  /** Unique call identifier. */
  readonly id: string;

  /** Name of the {@link VoiceProvider} that created this call. */
  readonly provider: string;

  /** The remote endpoint this call is connected to. */
  readonly endpoint: Endpoint;

  /** Current lifecycle state. */
  readonly state: CallState;

  /** Whether the call was received (`'inbound'`) or initiated (`'outbound'`). */
  readonly direction: CallDirection;

  /** Elapsed milliseconds since the call was connected. `0` if not yet connected or after ended. */
  readonly duration: number;

  // -------------------------------------------------------------------------
  // Control
  // -------------------------------------------------------------------------

  /**
   * Accept an incoming call, optionally constraining the active media types.
   *
   * @param options.mediaTypes - Subset of supported media to activate.
   *   Defaults to the full set offered by the caller.
   * @throws {@link CallError} with code `"media-failure"` if media setup fails.
   */
  accept(options?: { mediaTypes?: MediaType[] }): Promise<void>;

  /**
   * Reject an incoming call before it is answered.
   *
   * @param reason - Optional human-readable rejection reason.
   */
  reject(reason?: string): Promise<void>;

  /**
   * Terminate an active or ringing call.
   *
   * @param reason - Optional human-readable hang-up reason.
   */
  hangup(reason?: string): Promise<void>;

  /**
   * Put the call on hold. Transitions `connected` → `held`.
   * @throws {@link CallError} `"unauthorized"` if not in `connected` state.
   */
  hold(): Promise<void>;

  /**
   * Resume a held call. Transitions `held` → `connected`.
   * @throws {@link CallError} `"unauthorized"` if not in `held` state.
   */
  resume(): Promise<void>;

  /**
   * Silence a specific media channel without deactivating it.
   * The channel remains established; the local source is simply muted.
   */
  mute(type: MediaType): Promise<void>;

  /** Restore a previously muted channel. No-op if the channel is not muted. */
  unmute(type: MediaType): Promise<void>;

  /** Return the set of currently muted media types. */
  muted(): ReadonlySet<MediaType>;

  /**
   * Blind-transfer this call to `endpoint`.
   * The local leg ends and the remote party is connected to the target.
   */
  transfer(endpoint: Endpoint): Promise<void>;

  /**
   * Send a DTMF tone to the remote party (e.g. to navigate an IVR).
   */
  dtmf(tone: DtmfTone): Promise<void>;

  /**
   * Register a callback for incoming DTMF tones from the remote party.
   */
  onDTMF(callback: (tone: DtmfTone) => void): void;

  /**
   * Get the current participation mode (no args) or set it (with arg).
   *
   * - `call.mode()` — returns current {@link CallMode}
   * - `call.mode(m)` — changes mode; throws {@link CallError} `"unauthorized"` if denied
   */
  mode(): CallMode;
  mode(newMode: CallMode): Promise<void>;

  /**
   * Get the active media set (no args) or activate new types (with arg).
   *
   * - `call.channels()` — returns current `ReadonlySet<MediaType>`
   * - `call.channels(types)` — activates channels; throws {@link CallError} `"media-failure"` if denied
   */
  channels(): ReadonlySet<MediaType>;
  channels(newMedia: MediaType[]): Promise<void>;

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  /**
   * Get the inbound media stream for a given type.
   *
   * @param type - The media type to retrieve.
   * @returns A {@link MediaSource} stream, or `null` if that type is not active.
   */
  receive(type: MediaType): MediaSource | null;

  /**
   * Send an outbound media stream into the call.
   *
   * @param data - The stream to inject.
   * @param type - The media type being sent.
   * @throws {@link CallError} with code `"media-failure"` on send error.
   */
  send(data: MediaSource, type: MediaType): Promise<void>;

  // -------------------------------------------------------------------------
  // Text channel
  // -------------------------------------------------------------------------

  /**
   * Send a text message in the call's text channel.
   *
   * @param message           - The message body.
   * @param options.mentions  - Optional list of participant IDs to mention.
   */
  text(message: string, options?: { mentions?: string[] }): Promise<void>;

  /**
   * Register a callback for incoming text messages.
   *
   * @param callback - Invoked for each received {@link CallTextMessage}.
   */
  onText(callback: (msg: CallTextMessage) => void): void;

  /**
   * Subscribe to inbound audio. Fires when the audio channel activates,
   * delivering an independent {@link MediaSource} stream to consume.
   *
   * Multiple subscribers each receive their own independent stream
   * (fan-out via {@link MulticastMediaQueue} — see media-pipeline scope).
   *
   * @param callback - Called with a fresh `MediaSource` when audio is active.
   */
  onAudio(callback: (stream: MediaSource) => void): void;

  /**
   * Subscribe to inbound video. Fires when the video channel activates,
   * delivering an independent {@link MediaSource} stream to consume.
   *
   * @param callback - Called with a fresh `MediaSource` when video is active.
   */
  onVideo(callback: (stream: MediaSource) => void): void;

  // -------------------------------------------------------------------------
  // Participants (group calls / meetings)
  // -------------------------------------------------------------------------

  /** Current list of remote participants. Does not include the local agent. */
  readonly participants: ReadonlyArray<Participant>;

  /** Fires when a participant joins the call. */
  onJoin(callback: (participant: Participant) => void): void;

  /** Fires when a participant leaves the call. */
  onLeave(callback: (participant: Participant, reason?: string) => void): void;

  /**
   * Fires when the active speaker changes.
   * `isSpeaking: true` — participant started speaking.
   * `isSpeaking: false` — participant stopped speaking.
   */
  onSpeaking(callback: (participant: Participant, isSpeaking: boolean) => void): void;

  /** Signal intent to speak (raise hand) in a group call. */
  raise(): Promise<void>;

  /** Lower a raised hand. */
  lower(): Promise<void>;

  // -------------------------------------------------------------------------
  // Agent bridge
  // -------------------------------------------------------------------------

  /**
   * The {@link AgentBridge} attached to this call.
   * Each call has exactly one bridge instance for its lifetime.
   */
  readonly agent: AgentBridge;

  // -------------------------------------------------------------------------
  // Events (typed EventEmitter overloads)
  // -------------------------------------------------------------------------

  /** Fired when the call {@link CallState} changes. */
  on(event: "state", listener: (state: CallState) => void): this;
  /** Fired when a media type becomes active or inactive. */
  on(event: "media", listener: (type: MediaType, active: boolean) => void): this;
  /** Fired when a call error occurs. */
  on(event: "error", listener: (error: Error) => void): this;
  /** Fired when a text message is received. */
  on(event: "text", listener: (msg: CallTextMessage) => void): this;
  /** Catch-all overload required for EventEmitter compatibility. */
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;

  /** @see {@link Call.on} */
  off(event: "state", listener: (state: CallState) => void): this;
  /** @see {@link Call.on} */
  off(event: "media", listener: (type: MediaType, active: boolean) => void): this;
  /** @see {@link Call.on} */
  off(event: "error", listener: (error: Error) => void): this;
  /** @see {@link Call.on} */
  off(event: "text", listener: (msg: CallTextMessage) => void): this;
  /** Catch-all overload required for EventEmitter compatibility. */
  off(event: string | symbol, listener: (...args: unknown[]) => void): this;

  /** Subscribe to the next occurrence of an event, then automatically unsubscribe. */
  once(event: "state", listener: (state: CallState) => void): this;
  /** @see {@link Call.once} */
  once(event: "media", listener: (type: MediaType, active: boolean) => void): this;
  /** @see {@link Call.once} */
  once(event: "error", listener: (error: Error) => void): this;
  /** @see {@link Call.once} */
  once(event: "text", listener: (msg: CallTextMessage) => void): this;
  /** Catch-all overload required for EventEmitter compatibility. */
  once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}
