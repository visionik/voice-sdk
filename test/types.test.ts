/**
 * Core types and interfaces test suite.
 *
 * Behavioral tests: CallError class (runtime)
 * Structural tests: type assertions via `satisfies` and `@ts-expect-error` —
 * these are validated by `task typecheck`, not at runtime.
 */
import { describe, expect, it } from "vitest";
import { CallError } from "../src/errors.js";
import type { AgentBridge, STTProvider, TTSProvider } from "../src/interfaces/agent-bridge.js";
import type { Call } from "../src/interfaces/call.js";
import type { VoiceProvider } from "../src/interfaces/voice-provider.js";
import type {
  CallErrorCode,
  CallMode,
  CallOptions,
  CallState,
  CallTextMessage,
  Endpoint,
  MediaSource,
  MediaType,
  RetryPolicy,
  TTSOptions,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Behavioral: CallError
// ---------------------------------------------------------------------------

describe("CallError", () => {
  it("extends Error", () => {
    const err = new CallError("timeout");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CallError);
  });

  it("sets name to CallError", () => {
    expect(new CallError("rejected").name).toBe("CallError");
  });

  it("stores the code", () => {
    const codes: CallErrorCode[] = [
      "timeout",
      "rejected",
      "media-failure",
      "unauthorized",
      "group-full",
    ];
    for (const code of codes) {
      expect(new CallError(code).code).toBe(code);
    }
  });

  it("uses code as message when no message provided", () => {
    expect(new CallError("timeout").message).toBe("timeout");
  });

  it("uses custom message when provided", () => {
    expect(new CallError("rejected", "call declined").message).toBe("call declined");
  });

  describe("factory methods", () => {
    it("timeout()", () => {
      const err = CallError.timeout();
      expect(err.code).toBe("timeout");
      expect(err).toBeInstanceOf(CallError);
    });

    it("timeout() with message", () => {
      expect(CallError.timeout("timed out").message).toBe("timed out");
    });

    it("rejected()", () => {
      expect(CallError.rejected().code).toBe("rejected");
    });

    it("mediaFailure()", () => {
      expect(CallError.mediaFailure().code).toBe("media-failure");
    });

    it("unauthorized()", () => {
      expect(CallError.unauthorized().code).toBe("unauthorized");
    });

    it("groupFull()", () => {
      expect(CallError.groupFull().code).toBe("group-full");
    });
  });
});

// ---------------------------------------------------------------------------
// Structural: type shapes (compile-time only — validated by tsc)
// ---------------------------------------------------------------------------

// MediaSource must be AsyncIterable<Buffer>
function _acceptsMediaSource(_s: MediaSource): void {}
async function* _bufferGen(): AsyncGenerator<Buffer> {
  yield Buffer.from("test");
}
_acceptsMediaSource(_bufferGen());

// CallState exhaustive check
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

// CallMode exhaustive check
const _modes: CallMode[] = ["listen-only", "talkback", "full-duplex"];
void _modes;

// MediaType exhaustive check
const _mediaTypes: MediaType[] = ["audio", "video", "screen", "data"];
void _mediaTypes;

// RetryPolicy shape
const _retry: RetryPolicy = { maxAttempts: 3, backoffMs: 500 };
void _retry;

// Endpoint shape
const _endpoint: Endpoint = { type: "whatsapp", id: "+15550001234" };
void _endpoint;

// CallTextMessage shape
const _msg: CallTextMessage = {
  id: "msg-1",
  text: "hello",
  from: "+15550001234",
  timestamp: new Date(),
};
void _msg;

// TTSOptions shape
const _ttsOpts: TTSOptions = { voice: "en-US", speed: 1.0, language: "en" };
void _ttsOpts;

// CallOptions shape
const _callOpts: CallOptions = {
  mediaTypes: ["audio"],
  mode: "talkback",
  quality: "standard",
  autoJoin: false,
  record: false,
  retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
};
void _callOpts;

// VoiceProvider structural check — a minimal conforming object
const _provider = {
  name: "mock",
  supportedMedia: ["audio", "video"] as const satisfies readonly MediaType[],
  dial: async (_endpoint: Endpoint, _opts?: CallOptions): Promise<Call> =>
    Promise.reject(new Error("not implemented")),
  join: async (_groupId: string, _opts?: CallOptions): Promise<Call> =>
    Promise.reject(new Error("not implemented")),
} satisfies VoiceProvider;
void _provider;

// STTProvider structural check
const _stt = {
  transcribe: async function* (_audio: MediaSource) {
    yield { transcript: "hello", confidence: 0.9, isFinal: true };
  },
} satisfies STTProvider;
void _stt;

// TTSProvider structural check
const _tts = {
  synthesize: (_text: string, _opts?: TTSOptions): MediaSource => _bufferGen(),
} satisfies TTSProvider;
void _tts;

// AgentBridge structural check
const _bridge = {
  onSpeech: (_cb: (t: string, c: number, m?: unknown) => void): void => {},
  say: async (_text: string, _opts?: TTSOptions): Promise<void> => {},
  play: async (_stream: MediaSource): Promise<void> => {},
  setSTT: (_p: STTProvider): void => {},
  setTTS: (_p: TTSProvider): void => {},
} satisfies AgentBridge;
void _bridge;
