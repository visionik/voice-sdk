/**
 * The types of media that can flow over a call session.
 *
 * "Voice" in the SDK name is used in the telecom tradition — this covers
 * audio, video, screen sharing, and arbitrary data channels.
 */
export type MediaType = "audio" | "video" | "screen" | "data";

/**
 * The lifecycle state of a call.
 *
 * Transitions: `initialized` → `ringing` → `connecting` → `connected`
 * ↔ `held` → `ended` | `failed`
 */
export type CallState =
  | "initialized"
  | "ringing"
  | "connecting"
  | "connected"
  | "held"
  | "ended"
  | "failed";

/**
 * The participation mode for a call.
 *
 * - `listen-only`  — receive media but do not transmit
 * - `talkback`     — transmit only when explicitly invited (push-to-talk style)
 * - `full-duplex`  — bidirectional media at all times
 */
export type CallMode = "listen-only" | "talkback" | "full-duplex";

/** Transport-layer endpoint type. */
export type EndpointType = "whatsapp" | "phone" | "discord" | "sip" | "webrtc";

/**
 * A Node-native media stream: an async iterable of raw `Buffer` chunks.
 *
 * For audio this is typically PCM or encoded audio frames; for video,
 * individual encoded frames; for data, arbitrary byte payloads.
 * Using `AsyncIterable<Buffer>` keeps the SDK free of DOM dependencies.
 *
 * @example
 * ```ts
 * for await (const chunk of call.receive('audio') ?? []) {
 *   processAudioChunk(chunk);
 * }
 * ```
 */
export type MediaSource = AsyncIterable<Buffer>;

/**
 * Per-call retry policy for transient failure recovery.
 */
export type RetryPolicy = {
  /** Maximum number of recovery attempts before raising a fatal error. */
  maxAttempts: number;
  /** Base back-off delay between attempts in milliseconds. */
  backoffMs: number;
};

/**
 * Identifies a communication endpoint on a specific transport.
 */
export type Endpoint = {
  /** The transport/channel type. */
  type: EndpointType;
  /** Transport-specific identifier (phone number, JID, user ID, etc.). */
  id: string;
  /** Optional provider-specific metadata. */
  metadata?: Record<string, unknown>;
};

/**
 * A text message sent or received during an active call session.
 */
export type CallTextMessage = {
  /** Unique message identifier. */
  id: string;
  /** Message body. */
  text: string;
  /** Sender identifier (endpoint ID or display name). */
  from: string;
  /** UTC timestamp when the message was created. */
  timestamp: Date;
  /** Optional list of mentioned participant IDs. */
  mentions?: string[];
};

/**
 * Options for text-to-speech synthesis.
 */
export type TTSOptions = {
  /** Voice identifier (provider-specific, e.g. `"en-US-Neural2-A"`). */
  voice?: string;
  /** Speech rate multiplier (1.0 = normal speed). */
  speed?: number;
  /** BCP-47 language tag (e.g. `"en-US"`). */
  language?: string;
};

/**
 * DTMF (Dual-Tone Multi-Frequency) tone — standard telephone keypad.
 */
export type DtmfTone =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "*"
  | "#"
  | "A"
  | "B"
  | "C"
  | "D";

/**
 * Whether a call was received (inbound) or initiated (outbound).
 */
export type CallDirection = "inbound" | "outbound";

/**
 * A participant in a multi-party call or meeting.
 * Does not include the local party (the agent itself).
 */
export type Participant = {
  /** Stable identifier for this participant within the call. */
  id: string;
  /** Optional display name. */
  name?: string;
  /** The participant's endpoint (transport + address). */
  endpoint: Endpoint;
  /** Whether the participant's microphone is currently muted. */
  muted: boolean;
  /** Whether the participant has an active video channel. */
  hasVideo: boolean;
};

/**
 * Options provided when creating or joining a call.
 */
export type CallOptions = {
  /** The media types to activate for this call. */
  mediaTypes: MediaType[];
  /** Initial participation mode. */
  mode: CallMode;
  /** Requested media quality. Providers may ignore if unsupported. */
  quality?: "low" | "standard" | "hd";
  /** If `true`, automatically join when the call reaches `ringing` state. */
  autoJoin?: boolean;
  /** If `true`, record the call (subject to provider support). */
  record?: boolean;
  /** Configures automatic retry behaviour for transient errors. */
  retryPolicy?: RetryPolicy;
};
