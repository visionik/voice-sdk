import { describe, expect, it } from "vitest";
import { CallError } from "../../../src/errors.js";
import type { CallState } from "../../../src/types.js";
import { WhatsAppCall } from "../../../src/providers/whatsapp/whatsapp-call.js";
import { makeCallEvent, MockWhatsAppConnectionManager } from "./mock-connection-manager.js";

function makeCall(manager?: MockWhatsAppConnectionManager): {
  call: WhatsAppCall;
  manager: MockWhatsAppConnectionManager;
} {
  const mgr = manager ?? new MockWhatsAppConnectionManager();
  const event = makeCallEvent();
  const call = new WhatsAppCall(event, mgr);
  return { call, manager: mgr };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("WhatsAppCall initial state", () => {
  it("starts in ringing state (inbound)", () => {
    expect(makeCall().call.state).toBe("ringing");
  });

  it("provider name is 'whatsapp'", () => {
    expect(makeCall().call.provider).toBe("whatsapp");
  });

  it("endpoint reflects the call event", () => {
    const mgr = new MockWhatsAppConnectionManager();
    const event = makeCallEvent({ from: "+1987654321@s.whatsapp.net" });
    const call = new WhatsAppCall(event, mgr);
    expect(call.endpoint.type).toBe("whatsapp");
    expect(call.endpoint.id).toBe("+1987654321@s.whatsapp.net");
  });

  it("default mode is full-duplex", () => {
    expect(makeCall().call.mode()).toBe("full-duplex");
  });

  it("no active media initially", () => {
    expect(makeCall().call.media().size).toBe(0);
  });

  it("id is derived from the callId in the event", () => {
    const event = makeCallEvent({ callId: "wa-xyz" });
    const call = new WhatsAppCall(event, new MockWhatsAppConnectionManager());
    expect(call.id).toBe("wa-xyz");
  });
});

// ---------------------------------------------------------------------------
// accept()
// ---------------------------------------------------------------------------

describe("WhatsAppCall accept()", () => {
  it("calls manager.answer with the callId", async () => {
    const { call, manager } = makeCall();
    await call.accept();
    expect(manager.answeredCalls).toHaveLength(1);
    expect(manager.answeredCalls[0]!.callId).toBe("call-abc123");
  });

  it("passes video:false by default", async () => {
    const { call, manager } = makeCall();
    await call.accept();
    expect(manager.answeredCalls[0]!.opts).toEqual({ video: false });
  });

  it("passes video:true when mediaTypes includes video", async () => {
    const { call, manager } = makeCall();
    await call.accept({ mediaTypes: ["audio", "video"] });
    expect(manager.answeredCalls[0]!.opts).toEqual({ video: true });
  });

  it("transitions to connecting then connected", async () => {
    const { call } = makeCall();
    const states: CallState[] = [];
    call.on("state", (s) => states.push(s));
    await call.accept();
    expect(states).toEqual(["connecting", "connected"]);
    expect(call.state).toBe("connected");
  });

  it("activates audio by default", async () => {
    const { call } = makeCall();
    await call.accept();
    expect(call.media().has("audio")).toBe(true);
  });

  it("activates the specified mediaTypes", async () => {
    const { call } = makeCall();
    await call.accept({ mediaTypes: ["audio", "video"] });
    expect(call.media().has("audio")).toBe(true);
    expect(call.media().has("video")).toBe(true);
  });

  it("throws CallError when already connected", async () => {
    const { call } = makeCall();
    await call.accept();
    await expect(call.accept()).rejects.toBeInstanceOf(CallError);
  });

  it("wraps manager errors as CallError.mediaFailure", async () => {
    const { call, manager } = makeCall();
    manager.answerError = new Error("network unavailable");
    await expect(call.accept()).rejects.toSatisfy(
      (e: unknown) => e instanceof CallError && e.code === "media-failure",
    );
  });
});

// ---------------------------------------------------------------------------
// reject()
// ---------------------------------------------------------------------------

describe("WhatsAppCall reject()", () => {
  it("calls manager.reject with callId", async () => {
    const { call, manager } = makeCall();
    await call.reject("busy");
    expect(manager.rejectedCalls).toHaveLength(1);
    expect(manager.rejectedCalls[0]!.callId).toBe("call-abc123");
    expect(manager.rejectedCalls[0]!.reason).toBe("busy");
  });

  it("transitions to ended", async () => {
    const { call } = makeCall();
    await call.reject();
    expect(call.state).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// hangup()
// ---------------------------------------------------------------------------

describe("WhatsAppCall hangup()", () => {
  it("calls manager.end", async () => {
    const { call, manager } = makeCall();
    await call.accept();
    await call.hangup();
    expect(manager.endedCalls).toContain("call-abc123");
  });

  it("transitions to ended", async () => {
    const { call } = makeCall();
    await call.accept();
    await call.hangup();
    expect(call.state).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// mode / media
// ---------------------------------------------------------------------------

describe("WhatsAppCall mode/media", () => {
  it("mode changes the mode", async () => {
    const { call } = makeCall();
    await call.accept();
    await call.mode("listen-only");
    expect(call.mode()).toBe("listen-only");
  });

  it("mode throws when not connected", async () => {
    const { call } = makeCall();
    await expect(call.mode("talkback")).rejects.toBeInstanceOf(CallError);
  });

  it("media adds new types", async () => {
    const { call } = makeCall();
    await call.accept({ mediaTypes: ["audio"] });
    await call.media(["audio", "video"]);
    expect(call.media().has("video")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// External state changes (remote hangup, etc.)
// ---------------------------------------------------------------------------

describe("WhatsAppCall external state changes", () => {
  it("_notifyExternalStateChange('ended') transitions to ended", () => {
    const { call } = makeCall();
    call._notifyExternalStateChange("ended");
    expect(call.state).toBe("ended");
  });

  it("_notifyExternalStateChange('failed') transitions to failed", () => {
    const { call } = makeCall();
    call._notifyExternalStateChange("failed");
    expect(call.state).toBe("failed");
  });

  it("emits state event on external transition", () => {
    const { call } = makeCall();
    const spy: CallState[] = [];
    call.on("state", (s) => spy.push(s));
    call._notifyExternalStateChange("ended");
    expect(spy).toContain("ended");
  });
});

// ---------------------------------------------------------------------------
// Media streams
// ---------------------------------------------------------------------------

describe("WhatsAppCall media streams", () => {
  it("stream returns null before accept", () => {
    expect(makeCall().call.stream("audio")).toBeNull();
  });

  it("stream returns a stream after accept", async () => {
    const { call } = makeCall();
    await call.accept({ mediaTypes: ["audio"] });
    expect(call.stream("audio")).not.toBeNull();
  });

  it("pushed audio chunks can be read from the stream", async () => {
    const { call, manager } = makeCall();
    await call.accept({ mediaTypes: ["audio"] });

    const stream = call.stream("audio");
    expect(stream).not.toBeNull();

    // Push a chunk and then end the stream
    manager.triggerAudioData("call-abc123", Buffer.from("hello-audio"));
    call._endMediaStream("audio");

    const chunks: Buffer[] = [];
    for await (const chunk of stream!) {
      chunks.push(chunk);
    }
    expect(chunks[0]!.toString()).toBe("hello-audio");
  });

  it("send delegates to manager.send", async () => {
    const { call, manager } = makeCall();
    await call.accept();

    async function* gen(): AsyncGenerator<Buffer> {
      yield Buffer.from("outbound-audio");
    }

    await call.send(gen(), "audio");
    expect(manager.sentAudio).toHaveLength(1);
    expect(manager.sentAudio[0]!.chunk.toString()).toBe("outbound-audio");
  });
});

// ---------------------------------------------------------------------------
// Text channel
// ---------------------------------------------------------------------------

describe("WhatsAppCall text channel", () => {
  it("sendText resolves without error", async () => {
    await expect(makeCall().call.sendText("hello")).resolves.toBeUndefined();
  });

  it("onText fires when text event is emitted internally", () => {
    const { call } = makeCall();
    const msgs: string[] = [];
    call.onText((m) => msgs.push(m.text));
    call.emit("text", {
      id: "m1",
      text: "hi",
      from: "+1234",
      timestamp: new Date(),
    });
    expect(msgs).toEqual(["hi"]);
  });
});

// ---------------------------------------------------------------------------
// Agent bridge
// ---------------------------------------------------------------------------

describe("WhatsAppCall agent bridge", () => {
  it("agent returns the same instance", () => {
    const { call } = makeCall();
    expect(call.agent()).toBe(call.agent());
  });
});
