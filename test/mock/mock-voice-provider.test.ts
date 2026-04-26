import { describe, expect, it, vi } from "vitest";
import type { Call, Endpoint } from "../../src/index.js";
import { MockCall } from "../../src/providers/mock/mock-call.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

const WA_ENDPOINT: Endpoint = { type: "whatsapp", id: "+15550001234" };

// ---------------------------------------------------------------------------
// createCall
// ---------------------------------------------------------------------------

describe("MockVoiceProvider.createCall", () => {
  it("returns a MockCall in ringing state", async () => {
    const provider = new MockVoiceProvider();
    const call = await provider.createCall(WA_ENDPOINT);
    expect(call).toBeInstanceOf(MockCall);
    expect(call.state).toBe("ringing");
  });

  it("returns a call with the correct provider name", async () => {
    const call = await new MockVoiceProvider().createCall(WA_ENDPOINT);
    expect(call.provider).toBe("mock");
  });

  it("returns a call with the correct endpoint", async () => {
    const call = await new MockVoiceProvider().createCall(WA_ENDPOINT);
    expect(call.endpoint).toEqual(WA_ENDPOINT);
  });

  it("each call gets a unique id", async () => {
    const provider = new MockVoiceProvider();
    const a = await provider.createCall(WA_ENDPOINT);
    const b = await provider.createCall(WA_ENDPOINT);
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// joinGroupCall
// ---------------------------------------------------------------------------

describe("MockVoiceProvider.joinGroupCall", () => {
  it("returns a call in connecting state", async () => {
    const provider = new MockVoiceProvider();
    const call = await provider.joinGroupCall("group-jid@g.us");
    expect(call.state).toBe("connecting");
  });

  it("uses the groupId as endpoint id", async () => {
    const provider = new MockVoiceProvider();
    const call = await provider.joinGroupCall("group-jid@g.us");
    expect(call.endpoint.id).toBe("group-jid@g.us");
  });
});

// ---------------------------------------------------------------------------
// triggerIncoming
// ---------------------------------------------------------------------------

describe("MockVoiceProvider.triggerIncoming", () => {
  it("fires all registered onCall handlers", () => {
    const provider = new MockVoiceProvider();
    const received: Call[] = [];
    provider.onCall((c) => received.push(c));
    provider.onCall((c) => received.push(c));

    provider.triggerIncoming(WA_ENDPOINT);

    expect(received).toHaveLength(2);
  });

  it("passes a MockCall in ringing state to the handler", () => {
    const provider = new MockVoiceProvider();
    let call: Call | undefined;
    provider.onCall((c) => (call = c));

    provider.triggerIncoming(WA_ENDPOINT);

    expect(call).toBeInstanceOf(MockCall);
    expect(call!.state).toBe("ringing");
  });

  it("returns the MockCall directly", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT);
    expect(call).toBeInstanceOf(MockCall);
    expect(call.state).toBe("ringing");
  });

  it("no handlers registered — does not throw", () => {
    const provider = new MockVoiceProvider();
    expect(() => provider.triggerIncoming(WA_ENDPOINT)).not.toThrow();
  });

  it("uses the provided options mode", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT, {
      mediaTypes: ["audio"],
      mode: "listen-only",
    });
    expect(call.mode).toBe("listen-only");
  });
});

// ---------------------------------------------------------------------------
// simulateStateChange
// ---------------------------------------------------------------------------

describe("MockVoiceProvider.simulateStateChange", () => {
  it("transitions the named call to the new state", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT);

    provider.simulateStateChange(call.id, "connected");

    expect(call.state).toBe("connected");
  });

  it("emits state events on the call", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT);
    const spy = vi.fn();
    call.on("state", spy);

    provider.simulateStateChange(call.id, "failed");

    expect(spy).toHaveBeenCalledWith("failed");
  });

  it("throws for an unknown call id", () => {
    const provider = new MockVoiceProvider();
    expect(() => provider.simulateStateChange("no-such-id", "ended")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// simulateVoiceInput
// ---------------------------------------------------------------------------

describe("MockVoiceProvider.simulateVoiceInput", () => {
  it("fires onVoiceInput with transcript and confidence", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT);

    const captured: Array<{ transcript: string; confidence: number }> = [];
    call.getAgentBridge().onVoiceInput((t, c) => captured.push({ transcript: t, confidence: c }));

    provider.simulateVoiceInput(call.id, "hello world", 0.97);

    expect(captured).toEqual([{ transcript: "hello world", confidence: 0.97 }]);
  });

  it("defaults confidence to 1.0", () => {
    const provider = new MockVoiceProvider();
    const call = provider.triggerIncoming(WA_ENDPOINT);

    let capturedConfidence = 0;
    call.getAgentBridge().onVoiceInput((_t, c) => (capturedConfidence = c));

    provider.simulateVoiceInput(call.id, "test");

    expect(capturedConfidence).toBe(1.0);
  });

  it("throws for an unknown call id", () => {
    const provider = new MockVoiceProvider();
    expect(() => provider.simulateVoiceInput("no-such-id", "hello")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

describe("MockVoiceProvider metadata", () => {
  it("name is 'mock'", () => {
    expect(new MockVoiceProvider().name).toBe("mock");
  });

  it("supportedMedia includes all four types", () => {
    const media = new MockVoiceProvider().supportedMedia;
    expect(media).toContain("audio");
    expect(media).toContain("video");
    expect(media).toContain("screen");
    expect(media).toContain("data");
  });
});
