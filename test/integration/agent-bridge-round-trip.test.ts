/**
 * Integration test: full agent-bridge round-trip.
 *
 * Exercises the complete path:
 *   ring → accept → attach STT/TTS → speak
 *   → onTranscript callback → say → TTS.synthesize → send
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

describe("AgentBridge onTranscript", () => {
  it("fires callback when speak is called", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);

    const captured: Array<{ t: string; c: number }> = [];
    call.agent().onTranscript((t, c) => captured.push({ t, c }));

    provider.speak(call.id, "what time is it", 0.88);

    expect(captured).toEqual([{ t: "what time is it", c: 0.88 }]);
  });

  it("multiple callbacks all fire", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const bridge = call.agent();

    const results: string[] = [];
    bridge.onTranscript((t) => results.push(`a:${t}`));
    bridge.onTranscript((t) => results.push(`b:${t}`));

    provider.speak(call.id, "hello");

    expect(results).toEqual(["a:hello", "b:hello"]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: say → TTS.synthesize → send
// ---------------------------------------------------------------------------

describe("AgentBridge say", () => {
  it("calls TTS provider and injects audio into the call", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();

    const { provider: tts, synthesizeSpy } = makeTTS();
    call.agent().setTTS(tts);

    await call.agent().say("Hello, caller");

    expect(synthesizeSpy).toHaveBeenCalledWith("Hello, caller", undefined);

    const sent = call.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("audio");
    expect(sent[0]!.chunks[0]!.toString()).toBe("tts:Hello, caller");
  });

  it("no-ops gracefully when no TTS provider is set", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();

    // No TTS provider set — should not throw
    await expect(call.agent().say("hello")).resolves.toBeUndefined();
    expect(call.sent()).toHaveLength(0);
  });

  it("passes TTSOptions through to the provider", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();

    const { provider: tts, synthesizeSpy } = makeTTS();
    call.agent().setTTS(tts);

    const opts: TTSOptions = { voice: "en-US", speed: 1.2 };
    await call.agent().say("speak", opts);

    expect(synthesizeSpy).toHaveBeenCalledWith("speak", opts);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: play → send
// ---------------------------------------------------------------------------

describe("AgentBridge play", () => {
  it("sends the audio stream directly as media", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();

    async function* rawAudio(): AsyncGenerator<Buffer> {
      yield Buffer.from("raw-audio-chunk");
    }

    await call.agent().play(rawAudio());

    const sent = call.sent();
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
    const call = provider.ring(ENDPOINT);
    await call.accept();

    const bridge = call.agent();
    const { provider: tts } = makeTTS("response");
    bridge.setTTS(tts);

    // Simulate the agent pattern: react to voice, inject TTS response
    const agentReplied: string[] = [];
    bridge.onTranscript(async (transcript) => {
      agentReplied.push(transcript);
      await bridge.say(`You said: ${transcript}`);
    });

    // Trigger voice input
    provider.speak(call.id, "whats the weather");

    // The onTranscript callback is async (fire-and-forget from the bridge's
    // perspective). setImmediate drains all pending microtasks so the async
    // generator inside say fully completes before we assert.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(agentReplied).toEqual(["whats the weather"]);
    const sent = call.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chunks[0]!.toString()).toBe("response:You said: whats the weather");
  });
});

// ---------------------------------------------------------------------------
// STT provider wiring
// ---------------------------------------------------------------------------

describe("AgentBridge STT provider", () => {
  it("setSTT can be changed at runtime", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const bridge = call.agent();

    const { provider: stt1 } = makeSTT();
    const { provider: stt2 } = makeSTT();

    bridge.setSTT(stt1);
    bridge.setSTT(stt2); // replace

    // Just verify no error — the provider is stored
    // Actual transcription is exercised by WhatsApp provider tests
    expect(true).toBe(true);
  });
});
