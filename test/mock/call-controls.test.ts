import { describe, expect, it } from "vitest";
import { CallError } from "../../src/errors.js";
import type { CallState, DtmfTone, Endpoint } from "../../src/types.js";
import { MockCall } from "../../src/providers/mock/mock-call.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

const ENDPOINT: Endpoint = { type: "whatsapp", id: "+15550001234" };

function makeCall(direction: "inbound" | "outbound" = "inbound"): MockCall {
  return new MockCall("test-1", ENDPOINT, undefined, direction);
}

async function makeConnectedCall(): Promise<MockCall> {
  const call = makeCall();
  call._transitionState("ringing");
  await call.accept();
  return call;
}

// ---------------------------------------------------------------------------
// hold / resume
// ---------------------------------------------------------------------------

describe("hold / resume", () => {
  it("hold() transitions connected → held", async () => {
    const call = await makeConnectedCall();
    const states: CallState[] = [];
    call.on("state", (s) => states.push(s));
    await call.hold();
    expect(call.state).toBe("held");
    expect(states).toContain("held");
  });

  it("resume() transitions held → connected", async () => {
    const call = await makeConnectedCall();
    await call.hold();
    await call.resume();
    expect(call.state).toBe("connected");
  });

  it("hold() rejects when not connected", async () => {
    const call = makeCall();
    await expect(call.hold()).rejects.toBeInstanceOf(CallError);
  });

  it("hold() rejects when already held", async () => {
    const call = await makeConnectedCall();
    await call.hold();
    await expect(call.hold()).rejects.toBeInstanceOf(CallError);
  });

  it("resume() rejects when not held", async () => {
    const call = await makeConnectedCall();
    await expect(call.resume()).rejects.toBeInstanceOf(CallError);
  });
});

// ---------------------------------------------------------------------------
// mute / unmute / muted
// ---------------------------------------------------------------------------

describe("mute / unmute / muted", () => {
  it("muted() is empty initially", async () => {
    const call = await makeConnectedCall();
    expect(call.muted().size).toBe(0);
  });

  it("mute('audio') adds to muted set", async () => {
    const call = await makeConnectedCall();
    await call.mute("audio");
    expect(call.muted().has("audio")).toBe(true);
  });

  it("mute multiple channels independently", async () => {
    const call = await makeConnectedCall();
    await call.mute("audio");
    await call.mute("video");
    expect(call.muted().has("audio")).toBe(true);
    expect(call.muted().has("video")).toBe(true);
  });

  it("unmute removes from muted set", async () => {
    const call = await makeConnectedCall();
    await call.mute("audio");
    await call.unmute("audio");
    expect(call.muted().has("audio")).toBe(false);
  });

  it("unmute is a no-op when not muted", async () => {
    const call = await makeConnectedCall();
    await expect(call.unmute("audio")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transfer
// ---------------------------------------------------------------------------

describe("transfer", () => {
  it("resolves without error (mock no-op)", async () => {
    const call = await makeConnectedCall();
    await expect(call.transfer({ type: "whatsapp", id: "+19999999999" })).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DTMF
// ---------------------------------------------------------------------------

describe("dtmf / onDTMF", () => {
  it("onDTMF fires when _simulateDTMF is called", async () => {
    const call = await makeConnectedCall();
    const received: DtmfTone[] = [];
    call.onDTMF((t) => received.push(t));
    call._simulateDTMF("5");
    expect(received).toEqual(["5"]);
  });

  it("multiple onDTMF callbacks all fire", async () => {
    const call = await makeConnectedCall();
    const a: DtmfTone[] = [];
    const b: DtmfTone[] = [];
    call.onDTMF((t) => a.push(t));
    call.onDTMF((t) => b.push(t));
    call._simulateDTMF("*");
    expect(a).toEqual(["*"]);
    expect(b).toEqual(["*"]);
  });

  it("dtmf() resolves (sends tone)", async () => {
    const call = await makeConnectedCall();
    await expect(call.dtmf("1")).resolves.toBeUndefined();
  });

  it("dtmf records sent tones", async () => {
    const call = await makeConnectedCall();
    await call.dtmf("3");
    await call.dtmf("#");
    expect(call.sentDTMF()).toEqual(["3", "#"]);
  });
});

// ---------------------------------------------------------------------------
// direction
// ---------------------------------------------------------------------------

describe("direction", () => {
  it("defaults to inbound", () => {
    expect(makeCall("inbound").direction).toBe("inbound");
  });

  it("outbound when constructed with outbound", () => {
    expect(makeCall("outbound").direction).toBe("outbound");
  });

  it("ring() creates inbound calls", () => {
    const provider = new MockVoiceProvider();
    const call = provider.ring(ENDPOINT);
    expect(call.direction).toBe("inbound");
  });

  it("dial() creates outbound calls", async () => {
    const provider = new MockVoiceProvider();
    const call = await provider.dial(ENDPOINT);
    expect(call.direction).toBe("outbound");
  });

  it("join() creates outbound calls", async () => {
    const provider = new MockVoiceProvider();
    const call = await provider.join("group@g.us");
    expect(call.direction).toBe("outbound");
  });
});

// ---------------------------------------------------------------------------
// duration
// ---------------------------------------------------------------------------

describe("duration", () => {
  it("is 0 before connected", () => {
    expect(makeCall().duration).toBe(0);
  });

  it("is >= 0 after connected", async () => {
    const call = await makeConnectedCall();
    expect(call.duration).toBeGreaterThanOrEqual(0);
  });

  it("is 0 after call ends", async () => {
    const call = await makeConnectedCall();
    await call.hangup();
    expect(call.duration).toBe(0);
  });
});
