import { describe, expect, it, vi } from "vitest";
import { CallError } from "../../src/errors.js";
import type { CallState, Endpoint } from "../../src/types.js";
import { MockCall } from "../../src/providers/mock/mock-call.js";

const ENDPOINT: Endpoint = { type: "whatsapp", id: "+15550001234" };

function makeCall(id = "test-1"): MockCall {
  return new MockCall(id, ENDPOINT);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe("MockCall state machine", () => {
  it("starts in initialized state", () => {
    expect(makeCall().state).toBe("initialized");
  });

  it("accept() transitions initialized → connecting → connected", async () => {
    const call = makeCall();
    const states: CallState[] = [];
    call.on("state", (s) => states.push(s));

    await call.accept();

    expect(call.state).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
  });

  it("accept() from ringing also succeeds", async () => {
    const call = makeCall();
    call._transitionState("ringing");
    await call.accept();
    expect(call.state).toBe("connected");
  });

  it("accept() throws CallError when already connected", async () => {
    const call = makeCall();
    await call.accept();
    await expect(call.accept()).rejects.toBeInstanceOf(CallError);
  });

  it("reject() transitions to ended", async () => {
    const call = makeCall();
    call._transitionState("ringing");
    await call.reject("busy");
    expect(call.state).toBe("ended");
  });

  it("hangup() transitions to ended from any state", async () => {
    const call = makeCall();
    await call.accept();
    await call.hangup();
    expect(call.state).toBe("ended");
  });

  it("mode() updates the mode", async () => {
    const call = makeCall();
    await call.accept();
    await call.mode("listen-only");
    expect(call.mode()).toBe("listen-only");
  });

  it("mode() throws when not connected", async () => {
    const call = makeCall();
    await expect(call.mode("talkback")).rejects.toBeInstanceOf(CallError);
  });

  it("media() adds new media types", async () => {
    const call = makeCall();
    await call.accept({ mediaTypes: ["audio"] });
    await call.media(["audio", "video"]);
    expect(call.media().has("video")).toBe(true);
  });

  it("media() emits media events for newly added types", async () => {
    const call = makeCall();
    await call.accept({ mediaTypes: ["audio"] });

    const mediaEvents: Array<{ type: string; active: boolean }> = [];
    call.on("media", (t, a) => mediaEvents.push({ type: t, active: a }));

    await call.media(["audio", "video"]);
    expect(mediaEvents).toContainEqual({ type: "video", active: true });
    // audio was already active — no duplicate event
    expect(mediaEvents.filter((e) => e.type === "audio")).toHaveLength(0);
  });

  it("_transitionState() emits state event", () => {
    const call = makeCall();
    const states: CallState[] = [];
    call.on("state", (s) => states.push(s));
    call._transitionState("ringing");
    expect(states).toEqual(["ringing"]);
  });
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

describe("MockCall media", () => {
  it("stream returns null for inactive type", () => {
    expect(makeCall().receive("audio")).toBeNull();
  });

  it("stream returns a stream after accept()", async () => {
    const call = makeCall();
    await call.accept({ mediaTypes: ["audio"] });
    const stream = call.receive("audio");
    expect(stream).not.toBeNull();
  });

  it("stream stream yields Buffer chunks", async () => {
    const call = makeCall();
    await call.accept({ mediaTypes: ["audio"] });
    const stream = call.receive("audio");
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toBeInstanceOf(Buffer);
  });

  it("send records sent chunks", async () => {
    const call = makeCall();
    await call.accept();

    async function* gen(): AsyncGenerator<Buffer> {
      yield Buffer.from("chunk-a");
      yield Buffer.from("chunk-b");
    }

    await call.send(gen(), "audio");

    const sent = call.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("audio");
    expect(sent[0]!.chunks).toHaveLength(2);
    expect(sent[0]!.chunks[0]!.toString()).toBe("chunk-a");
  });

  it("accept() emits media events for activated types", async () => {
    const call = makeCall();
    const mediaEvents: Array<{ type: string; active: boolean }> = [];
    call.on("media", (t, a) => mediaEvents.push({ type: t, active: a }));

    await call.accept({ mediaTypes: ["audio", "video"] });

    expect(mediaEvents).toContainEqual({ type: "audio", active: true });
    expect(mediaEvents).toContainEqual({ type: "video", active: true });
  });
});

// ---------------------------------------------------------------------------
// Text channel
// ---------------------------------------------------------------------------

describe("MockCall text channel", () => {
  it("onText fires when _simulateText is called", () => {
    const call = makeCall();
    const msgs: string[] = [];
    call.onText((msg) => msgs.push(msg.text));

    call._simulateText({
      id: "m1",
      text: "hello",
      from: "+15550001234",
      timestamp: new Date(),
    });

    expect(msgs).toEqual(["hello"]);
  });

  it("sendText resolves without error", async () => {
    const call = makeCall();
    await expect(call.sendText("hi")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Agent bridge
// ---------------------------------------------------------------------------

describe("MockCall agent bridge", () => {
  it("agent returns the same instance each call", () => {
    const call = makeCall();
    expect(call.agent()).toBe(call.agent());
  });

  it("_triggerVoiceInput fires onSpeech callbacks via bridge", () => {
    const call = makeCall();
    const transcripts: string[] = [];
    call.agent().onSpeech((t) => transcripts.push(t));

    call._triggerVoiceInput("hello there", 0.95);

    expect(transcripts).toEqual(["hello there"]);
  });

  it("error event can be emitted and caught", () => {
    const call = makeCall();
    const errs: Error[] = [];
    call.on("error", (e) => errs.push(e));
    call.emit("error", new CallError("media-failure"));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toBeInstanceOf(CallError);
  });
});

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

describe("MockCall constructor options", () => {
  it("defaults mode to full-duplex", () => {
    expect(makeCall().mode()).toBe("full-duplex");
  });

  it("respects provided mode option", () => {
    const call = new MockCall("x", ENDPOINT, {
      mediaTypes: ["audio"],
      mode: "listen-only",
    });
    expect(call.mode()).toBe("listen-only");
  });
});

// ---------------------------------------------------------------------------
// EventEmitter overloads (typed)
// ---------------------------------------------------------------------------

describe("MockCall event typing", () => {
  it("once() fires exactly once", async () => {
    const call = makeCall();
    let count = 0;
    call.once("state", () => count++);
    call._transitionState("ringing");
    call._transitionState("connecting");
    expect(count).toBe(1);
  });

  it("off() removes a listener", () => {
    const call = makeCall();
    const spy = vi.fn();
    call.on("state", spy);
    call.off("state", spy);
    call._transitionState("ringing");
    expect(spy).not.toHaveBeenCalled();
  });
});
