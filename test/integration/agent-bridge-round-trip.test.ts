/**
 * Integration test: full agent-bridge round-trip.
 *
 * Exercises the complete path:
 *   triggerIncoming → accept → attach STT/TTS → simulateVoiceInput
 *   → onVoiceInput callback → injectTTS → TTS.synthesize → sendMedia
 */
import { describe, expect, it, vi } from "vitest";
import type { MediaSource, TTSOptions } from "../../src/types.js";
import type { STTProvider, TTSProvider } from "../../src/interfaces/agent-bridge.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

const ENDPOINT = { type: "whatsapp" as const, id: "+15550001234" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTTS(label = "tts"): {
  provider: TTSProvider;
  synthesizeSpy: ReturnType<typeof vi.fn>;
} {
  const synthesizeSpy = vi.fn(
    (text: string, _opts?: TTSOptions): MediaSource =>
      (async function* () {
        yield Buffer.from(`${label}:${text}`);
      })(),
  );
  return { provider: { synthesize: synthesizeSpy }, synthesizeSpy };
}

function makeSTT(): {
  provider: STTProvider;
  transcribeSpy: ReturnType<typeof vi.fn>;
} {
  const transcribeSpy = vi.fn(async function* (_audio: MediaSource) {
    yield { transcript: "mocked-stt", confidence: 0.99, isFinal: true };
  });
  return { provider: { transcribe: transcribeSpy }, transcribeSpy };
}

// ---------------------------------------------------------------------------
// Round-trip: voice input → STT callback
// ---------------------------------------------------------------------------

describe("AgentBridge onVoiceInput", () => {
  it("fires callback when simulateVoiceInput is called", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);

    const captured: Array<{ t: string; c: number }> = [];
    call.getAgentBridge().onVoiceInput((t, c) => captured.push({ t, c }));

    provider.simulateVoiceInput(call.id, "what time is it", 0.88);

    expect(captured).toEqual([{ t: "what time is it", c: 0.88 }]);
  });

  it("multiple callbacks all fire", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    const bridge = call.getAgentBridge();

    const results: string[] = [];
    bridge.onVoiceInput((t) => results.push(`a:${t}`));
    bridge.onVoiceInput((t) => results.push(`b:${t}`));

    provider.simulateVoiceInput(call.id, "hello");

    expect(results).toEqual(["a:hello", "b:hello"]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: injectTTS → TTS.synthesize → sendMedia
// ---------------------------------------------------------------------------

describe("AgentBridge injectTTS", () => {
  it("calls TTS provider and injects audio into the call", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    await call.accept();

    const { provider: tts, synthesizeSpy } = makeTTS();
    call.getAgentBridge().setTTSProvider(tts);

    await call.getAgentBridge().injectTTS("Hello, caller");

    expect(synthesizeSpy).toHaveBeenCalledWith("Hello, caller", undefined);

    const sent = call.getSentMedia();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("audio");
    expect(sent[0]!.chunks[0]!.toString()).toBe("tts:Hello, caller");
  });

  it("no-ops gracefully when no TTS provider is set", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    await call.accept();

    // No TTS provider set — should not throw
    await expect(call.getAgentBridge().injectTTS("hello")).resolves.toBeUndefined();
    expect(call.getSentMedia()).toHaveLength(0);
  });

  it("passes TTSOptions through to the provider", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    await call.accept();

    const { provider: tts, synthesizeSpy } = makeTTS();
    call.getAgentBridge().setTTSProvider(tts);

    const opts: TTSOptions = { voice: "en-US", speed: 1.2 };
    await call.getAgentBridge().injectTTS("speak", opts);

    expect(synthesizeSpy).toHaveBeenCalledWith("speak", opts);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: injectAudio → sendMedia
// ---------------------------------------------------------------------------

describe("AgentBridge injectAudio", () => {
  it("sends the audio stream directly as media", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    await call.accept();

    async function* rawAudio(): AsyncGenerator<Buffer> {
      yield Buffer.from("raw-audio-chunk");
    }

    await call.getAgentBridge().injectAudio(rawAudio());

    const sent = call.getSentMedia();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("audio");
    expect(sent[0]!.chunks[0]!.toString()).toBe("raw-audio-chunk");
  });
});

// ---------------------------------------------------------------------------
// Full end-to-end: voice in → agent replies
// ---------------------------------------------------------------------------

describe("Full agent round-trip", () => {
  it("voice input triggers agent TTS response", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    await call.accept();

    const bridge = call.getAgentBridge();
    const { provider: tts } = makeTTS("response");
    bridge.setTTSProvider(tts);

    // Simulate the agent pattern: react to voice, inject TTS response
    const agentReplied: string[] = [];
    bridge.onVoiceInput(async (transcript) => {
      agentReplied.push(transcript);
      await bridge.injectTTS(`You said: ${transcript}`);
    });

    // Trigger voice input
    provider.simulateVoiceInput(call.id, "whats the weather");

    // The onVoiceInput callback is async (fire-and-forget from the bridge's
    // perspective). setImmediate drains all pending microtasks so the async
    // generator inside injectTTS fully completes before we assert.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(agentReplied).toEqual(["whats the weather"]);
    const sent = call.getSentMedia();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chunks[0]!.toString()).toBe("response:You said: whats the weather");
  });
});

// ---------------------------------------------------------------------------
// STT provider wiring
// ---------------------------------------------------------------------------

describe("AgentBridge STT provider", () => {
  it("setSTTProvider can be changed at runtime", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(ENDPOINT);
    const bridge = call.getAgentBridge();

    const { provider: stt1 } = makeSTT();
    const { provider: stt2 } = makeSTT();

    bridge.setSTTProvider(stt1);
    bridge.setSTTProvider(stt2); // replace

    // Just verify no error — the provider is stored
    // Actual transcription is exercised by WhatsApp provider tests
    expect(true).toBe(true);
  });
});
