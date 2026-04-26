// @openclaw/voice-sdk
// "Voice" is used in the telecom sense: covers audio, video, screen, and data
// channels — any real-time media that flows over a call session.

// Types
export type {
  CallMode,
  CallOptions,
  CallState,
  CallTextMessage,
  Endpoint,
  EndpointType,
  MediaSource,
  MediaType,
  RetryPolicy,
  TTSOptions,
} from "./types.js";

// Errors
export { CallError } from "./errors.js";
export type { CallErrorCode } from "./errors.js";

// Agent bridge (concrete implementation)
export { BaseAgentBridge } from "./agent-bridge/base-agent-bridge.js";

// WhatsApp provider types (interface + events — no baileys dependency)
export type {
  WhatsAppCallEvent,
  WhatsAppCallStateEvent,
  WhatsAppConnectionManager,
} from "./providers/whatsapp/connection-manager.js";

// Interfaces
export type { AgentBridge, STTProvider, TTSProvider } from "./interfaces/agent-bridge.js";
export type { Call } from "./interfaces/call.js";
export type { VoiceProvider } from "./interfaces/voice-provider.js";
export type {
  CollectOptions,
  CollectionResult,
  MediaService,
  RecordOptions,
  Recording,
} from "./interfaces/media-service.js";
