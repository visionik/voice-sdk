import type { VoiceProvider } from "../../interfaces/voice-provider.js";

/**
 * An incoming call notification pushed by the WhatsApp socket.
 */
export type WhatsAppCallEvent = {
  /** Provider-internal call identifier (from the WASocket event). */
  callId: string;
  /** Caller's JID or phone number (e.g. `"+15550001234@s.whatsapp.net"`). */
  from: string;
  /** `true` if this is a group call. */
  isGroup: boolean;
  /** `true` if the call includes video. */
  isVideo: boolean;
  /** UTC timestamp when the event was received. */
  timestamp: Date;
};

/**
 * A state change notification for an in-progress call.
 *
 * Emitted by the manager when the remote party answers, hangs up,
 * or a network failure occurs.
 */
export type WhatsAppCallStateEvent = {
  /** The call whose state has changed. */
  callId: string;
  /**
   * New state reported by the WASocket.
   *
   * - `connecting` — remote is answering
   * - `connected`  — call is established (bidirectional media flowing)
   * - `ended`      — remote hung up or call timed out
   * - `failed`     — irrecoverable error (network, permissions, etc.)
   */
  state: "connecting" | "connected" | "ended" | "failed";
};

/**
 * Contract between `@openclaw/voice-sdk` and the OpenClaw WhatsApp extension.
 *
 * The WhatsApp extension implements this interface and passes an instance to
 * {@link WhatsAppVoiceProvider} via constructor injection. This keeps the SDK
 * completely free of `@whiskeysockets/baileys` or any WhatsApp-specific
 * runtime dependency (NFR-4).
 *
 * ## Single-socket guarantee
 *
 * A single `WhatsAppConnectionManager` wraps one WASocket. Multiple
 * {@link WhatsAppVoiceProvider} instances can be registered on the same
 * manager (each calls {@link WhatsAppConnectionManager.register}
 * once), but the underlying socket is never duplicated.
 *
 * @example
 * ```ts
 * // In the OpenClaw WhatsApp extension:
 * class WaBaileysManager implements WhatsAppConnectionManager {
 *   constructor(private readonly socket: WASocket) {
 *     socket.ev.on('call', (events) => this._handleCallEvents(events));
 *   }
 *   register(provider: VoiceProvider): void { ... }
 *   // ...
 * }
 * ```
 */
export interface WhatsAppConnectionManager {
  /**
   * Register a {@link VoiceProvider} that will receive incoming call events.
   *
   * Called once per provider in the provider's constructor. The manager
   * does NOT open a new socket per registration — it routes existing events
   * to the newly registered provider.
   *
   * @param provider - The provider to register.
   */
  register(provider: VoiceProvider): void;

  /**
   * Subscribe to inbound call events from the WASocket.
   *
   * @param cb - Called for each incoming call.
   */
  onCall(cb: (event: WhatsAppCallEvent) => void): void;

  /**
   * Subscribe to call state changes (remote answer, hangup, failure).
   *
   * @param cb - Called when a call's state changes.
   */
  onState(cb: (event: WhatsAppCallStateEvent) => void): void;

  /**
   * Subscribe to inbound audio chunks from the WASocket.
   *
   * @param cb - Called with the callId and each raw audio Buffer.
   */
  onAudio?(cb: (callId: string, chunk: Buffer) => void): void;

  /**
   * Answer an incoming call.
   *
   * @param callId - The call to answer.
   * @param opts.video - If `true`, activate the video channel.
   */
  answer(callId: string, opts?: { video?: boolean }): Promise<void>;

  /**
   * Reject an incoming call before answering.
   *
   * @param callId - The call to reject.
   * @param reason - Optional machine-readable rejection reason.
   */
  reject(callId: string, reason?: string): Promise<void>;

  /**
   * End an active call.
   *
   * @param callId - The call to terminate.
   */
  end(callId: string): Promise<void>;

  /**
   * Join an existing WhatsApp group call.
   *
   * @param groupJid - The group's JID.
   * @param opts     - Optional call options (e.g. video).
   */
  join(groupJid: string, opts?: { video?: boolean }): Promise<void>;

  /**
   * Send an outbound audio chunk into an active call.
   *
   * @param callId - The target call.
   * @param chunk  - Raw audio buffer to transmit.
   */
  send?(callId: string, chunk: Buffer): Promise<void>;
}
