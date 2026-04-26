import { describe, expect, it } from "vitest";
import type { Endpoint, Participant } from "../../src/types.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

const ENDPOINT: Endpoint = { type: "whatsapp", id: "+15550001234" };

function makeParticipant(id: string): Participant {
  return {
    id,
    endpoint: { type: "whatsapp", id: `+1555${id}` },
    muted: false,
    hasVideo: false,
  };
}

// ---------------------------------------------------------------------------
// participants list
// ---------------------------------------------------------------------------

describe("call.participants", () => {
  it("starts empty", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    expect(call.participants).toHaveLength(0);
  });

  it("triggerJoin adds a participant", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    provider.triggerJoin(call.id, makeParticipant("p1"));
    expect(call.participants).toHaveLength(1);
    expect(call.participants[0]!.id).toBe("p1");
  });

  it("multiple triggerJoin calls accumulate", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerJoin(call.id, makeParticipant("p2"));
    expect(call.participants).toHaveLength(2);
  });

  it("triggerLeave removes by id", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerJoin(call.id, makeParticipant("p2"));
    provider.triggerLeave(call.id, "p1");
    expect(call.participants).toHaveLength(1);
    expect(call.participants[0]!.id).toBe("p2");
  });

  it("triggerLeave with unknown id does not throw", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    expect(() => provider.triggerLeave(call.id, "nobody")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onJoin
// ---------------------------------------------------------------------------

describe("onJoin", () => {
  it("fires when triggerJoin is called", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const joined: Participant[] = [];
    call.onJoin((p) => joined.push(p));
    provider.triggerJoin(call.id, makeParticipant("p1"));
    expect(joined).toHaveLength(1);
    expect(joined[0]!.id).toBe("p1");
  });

  it("multiple callbacks all fire", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    let a = 0;
    let b = 0;
    call.onJoin(() => a++);
    call.onJoin(() => b++);
    provider.triggerJoin(call.id, makeParticipant("p1"));
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("receives the correct Participant shape", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    let received: Participant | undefined;
    call.onJoin((p) => (received = p));
    const participant = makeParticipant("alice");
    provider.triggerJoin(call.id, participant);
    expect(received).toMatchObject({ id: "alice", muted: false, hasVideo: false });
  });
});

// ---------------------------------------------------------------------------
// onLeave
// ---------------------------------------------------------------------------

describe("onLeave", () => {
  it("fires when triggerLeave is called", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const left: Participant[] = [];
    call.onLeave((p) => left.push(p));
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerLeave(call.id, "p1");
    expect(left).toHaveLength(1);
    expect(left[0]!.id).toBe("p1");
  });

  it("receives optional reason", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const reasons: Array<string | undefined> = [];
    call.onLeave((_p, reason) => reasons.push(reason));
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerLeave(call.id, "p1", "network-error");
    expect(reasons).toEqual(["network-error"]);
  });
});

// ---------------------------------------------------------------------------
// onSpeaking
// ---------------------------------------------------------------------------

describe("onSpeaking", () => {
  it("fires when triggerSpeaking is called", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const events: Array<{ p: Participant; speaking: boolean }> = [];
    call.onSpeaking((p, speaking) => events.push({ p, speaking }));
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerSpeaking(call.id, "p1", true);
    expect(events).toHaveLength(1);
    expect(events[0]!.speaking).toBe(true);
    expect(events[0]!.p.id).toBe("p1");
  });

  it("isSpeaking=false when participant stops speaking", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    const events: boolean[] = [];
    call.onSpeaking((_p, s) => events.push(s));
    provider.triggerJoin(call.id, makeParticipant("p1"));
    provider.triggerSpeaking(call.id, "p1", true);
    provider.triggerSpeaking(call.id, "p1", false);
    expect(events).toEqual([true, false]);
  });
});

// ---------------------------------------------------------------------------
// raise / lower
// ---------------------------------------------------------------------------

describe("raise / lower", () => {
  it("raise() resolves without error", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();
    await expect(call.raise()).resolves.toBeUndefined();
  });

  it("lower() resolves without error", async () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    await call.accept();
    await expect(call.lower()).resolves.toBeUndefined();
  });
});
