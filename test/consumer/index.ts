/**
 * Consumer import smoke test.
 *
 * Verifies that the public API surface is well-typed and all key symbols
 * are accessible. Compiled by `task typecheck` via tsconfig.test.json.
 * No vitest assertions needed — if this file compiles, the surface is correct.
 *
 * In a real consumer project this would be:
 *   import { ... } from '@openclaw/voice-sdk';
 * Here we use relative src/ paths (equivalent for type-checking purposes).
 */

// --------------------------------------------------------------------------
// Core types
// --------------------------------------------------------------------------
import type {
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
} from "../../src/types.js";

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------
import { CallError } from "../../src/errors.js";
import type { CallErrorCode } from "../../src/errors.js";

// --------------------------------------------------------------------------
// Interfaces
// --------------------------------------------------------------------------
import type { AgentBridge, STTProvider, TTSProvider } from "../../src/interfaces/agent-bridge.js";
import type { Call } from "../../src/interfaces/call.js";
import type { VoiceProvider } from "../../src/interfaces/voice-provider.js";
import type {
  CollectOptions,
  CollectionResult,
  MediaService,
  RecordOptions,
  Recording,
} from "../../src/interfaces/media-service.js";

// --------------------------------------------------------------------------
// Concrete implementations
// --------------------------------------------------------------------------
import { BaseAgentBridge } from "../../src/agent-bridge/base-agent-bridge.js";
import { MockCall } from "../../src/providers/mock/mock-call.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";
import { WhatsAppCall } from "../../src/providers/whatsapp/whatsapp-call.js";
import { WhatsAppVoiceProvider } from "../../src/providers/whatsapp/whatsapp-voice-provider.js";
import type {
  WhatsAppCallEvent,
  WhatsAppCallStateEvent,
  WhatsAppConnectionManager,
} from "../../src/providers/whatsapp/connection-manager.js";

// --------------------------------------------------------------------------
// Structural checks — these would be compile errors if the API breaks.
// --------------------------------------------------------------------------

// MockVoiceProvider satisfies VoiceProvider
const _mockProvider: VoiceProvider = new MockVoiceProvider();
void _mockProvider;

// CallError is an Error subclass
const _err = new CallError("timeout");
const _asError: Error = _err;
void _asError;

// All error codes are valid
const _codes: CallErrorCode[] = [
  "timeout",
  "rejected",
  "media-failure",
  "unauthorized",
  "group-full",
];
void _codes;

// CallState union is complete
const _states: CallState[] = [
  "initialized",
  "ringing",
  "connecting",
  "connected",
  "held",
  "ended",
  "failed",
];
void _states;

// MediaType union is complete
const _mediaTypes: MediaType[] = ["audio", "video", "screen", "data"];
void _mediaTypes;

// CallMode union is complete
const _modes: CallMode[] = ["listen-only", "talkback", "full-duplex"];
void _modes;

// MediaSource is AsyncIterable<Buffer>
function _acceptsSource(_s: MediaSource): void {}
async function* _gen(): AsyncGenerator<Buffer> {
  yield Buffer.from("test");
}
_acceptsSource(_gen());

// CallOptions shape
const _opts: CallOptions = {
  mediaTypes: ["audio"],
  mode: "talkback",
  retryPolicy: { maxAttempts: 3, backoffMs: 500 },
};
void _opts;

// Endpoint shape
const _endpoint: Endpoint = { type: "whatsapp" satisfies EndpointType, id: "+1234" };
void _endpoint;

// TTSOptions shape
const _ttsOpts: TTSOptions = { voice: "en-US", speed: 1.0, language: "en" };
void _ttsOpts;

// RetryPolicy shape
const _retry: RetryPolicy = { maxAttempts: 3, backoffMs: 1000 };
void _retry;

// CallTextMessage shape
const _msg: CallTextMessage = { id: "m1", text: "hi", from: "+1", timestamp: new Date() };
void _msg;

// STTProvider structural check
const _stt: STTProvider = {
  transcribe: async function* (_a: MediaSource) {
    yield { transcript: "hi", confidence: 1.0, isFinal: true };
  },
};
void _stt;

// TTSProvider structural check
const _tts: TTSProvider = {
  synthesize: (_text: string, _opts?: TTSOptions): MediaSource => _gen(),
};
void _tts;

// AgentBridge structural check
const _bridge: AgentBridge = {
  onTranscript: (_cb: (t: string, c: number) => void): void => {},
  say: async (_text: string): Promise<void> => {},
  play: async (_s: MediaSource): Promise<void> => {},
  setSTT: (_p: STTProvider): void => {},
  setTTS: (_p: TTSProvider): void => {},
};
void _bridge;

// MediaService structural check
const _svc: MediaService = {
  play: async (_s: MediaSource): Promise<void> => {},
  record: async (_o?: RecordOptions): Promise<Recording> => ({
    audio: _gen(),
    durationMs: 0,
  }),
  collect: async (_o: CollectOptions): Promise<CollectionResult> => ({
    audio: _gen(),
    timedOut: false,
  }),
};
void _svc;

// WhatsApp types are exported
const _waEvent: WhatsAppCallEvent = {
  callId: "c1",
  from: "+1@s.whatsapp.net",
  isGroup: false,
  isVideo: false,
  timestamp: new Date(),
};
void _waEvent;

const _waStateEvent: WhatsAppCallStateEvent = { callId: "c1", state: "ended" };
void _waStateEvent;

// Class exports are accessible
void MockCall;
void MockVoiceProvider;
void WhatsAppCall;
void WhatsAppVoiceProvider;
void BaseAgentBridge;

// Interface-only export (WhatsAppConnectionManager) compiles as a type
type _ManagerImpl = WhatsAppConnectionManager;
void (null as unknown as _ManagerImpl);
