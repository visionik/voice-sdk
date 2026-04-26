import { describe, expect, it } from "vitest";
import type { Call } from "../../../src/interfaces/call.js";
import { WhatsAppCall } from "../../../src/providers/whatsapp/whatsapp-call.js";
import { WhatsAppVoiceProvider } from "../../../src/providers/whatsapp/whatsapp-voice-provider.js";
import { makeCallEvent, MockWhatsAppConnectionManager } from "./mock-connection-manager.js";

function makeProvider(): {
  provider: WhatsAppVoiceProvider;
  manager: MockWhatsAppConnectionManager;
} {
  const manager = new MockWhatsAppConnectionManager();
  const provider = new WhatsAppVoiceProvider(manager);
  return { provider, manager };
}

// ---------------------------------------------------------------------------
// Constructor / single-socket invariant
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider constructor", () => {
  it("calls manager.registerVoiceProvider exactly once", () => {
    const { provider, manager } = makeProvider();
    expect(manager.registeredProviders).toHaveLength(1);
    expect(manager.registeredProviders[0]).toBe(provider);
  });

  it("single-socket invariant: two providers on the same manager each register once", () => {
    const manager = new MockWhatsAppConnectionManager();
    const p1 = new WhatsAppVoiceProvider(manager);
    const p2 = new WhatsAppVoiceProvider(manager);
    // Two registrations total (each provider calls register once)
    expect(manager.registeredProviders).toHaveLength(2);
    expect(manager.registeredProviders[0]).toBe(p1);
    expect(manager.registeredProviders[1]).toBe(p2);
  });

  it("subscribes to manager.onCallEvent", () => {
    // Verified indirectly: triggerCallEvent fires onCall handlers
    const { provider, manager } = makeProvider();
    const received: Call[] = [];
    provider.onCall((c) => received.push(c));
    manager.triggerCallEvent(makeCallEvent());
    expect(received).toHaveLength(1);
  });

  it("subscribes to manager.onCallStateChange", () => {
    // Verified indirectly: triggerStateChange updates a call's state
    const { provider, manager } = makeProvider();
    let call: WhatsAppCall | undefined;
    provider.onCall((c) => {
      call = c as WhatsAppCall;
    });
    manager.triggerCallEvent(makeCallEvent({ callId: "call-1" }));
    expect(call?.state).toBe("ringing");
    manager.triggerStateChange({ callId: "call-1", state: "ended" });
    expect(call?.state).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider metadata", () => {
  it("name is 'whatsapp'", () => {
    expect(makeProvider().provider.name).toBe("whatsapp");
  });

  it("supportedMedia includes audio, video, screen", () => {
    const { provider } = makeProvider();
    expect(provider.supportedMedia).toContain("audio");
    expect(provider.supportedMedia).toContain("video");
    expect(provider.supportedMedia).toContain("screen");
  });
});

// ---------------------------------------------------------------------------
// Incoming calls (triggerCallEvent)
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider incoming calls", () => {
  it("fires all onCall handlers when a call event arrives", () => {
    const { provider, manager } = makeProvider();
    const received: Call[] = [];
    provider.onCall((c) => received.push(c));
    provider.onCall((c) => received.push(c));

    manager.triggerCallEvent(makeCallEvent());
    expect(received).toHaveLength(2);
  });

  it("delivers a WhatsAppCall in ringing state to handlers", () => {
    const { provider, manager } = makeProvider();
    let call: Call | undefined;
    provider.onCall((c) => (call = c));

    manager.triggerCallEvent(makeCallEvent());

    expect(call).toBeInstanceOf(WhatsAppCall);
    expect(call!.state).toBe("ringing");
  });

  it("call endpoint matches the event's 'from' field", () => {
    const { provider, manager } = makeProvider();
    let call: Call | undefined;
    provider.onCall((c) => (call = c));

    manager.triggerCallEvent(makeCallEvent({ from: "+1999888777@s.whatsapp.net" }));

    expect(call!.endpoint.id).toBe("+1999888777@s.whatsapp.net");
  });

  it("no handlers registered — does not throw", () => {
    const { manager } = makeProvider();
    expect(() => manager.triggerCallEvent(makeCallEvent())).not.toThrow();
  });

  it("group call event sets endpoint type correctly", () => {
    const { provider, manager } = makeProvider();
    let call: Call | undefined;
    provider.onCall((c) => (call = c));

    manager.triggerCallEvent(makeCallEvent({ isGroup: true }));
    // Group calls still have type 'whatsapp' endpoint
    expect(call!.endpoint.type).toBe("whatsapp");
  });
});

// ---------------------------------------------------------------------------
// Outbound: createCall
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider createCall", () => {
  it("returns a WhatsAppCall in ringing state", async () => {
    const { provider } = makeProvider();
    const call = await provider.createCall({
      type: "whatsapp",
      id: "+15550001234@s.whatsapp.net",
    });
    expect(call).toBeInstanceOf(WhatsAppCall);
    expect(call.state).toBe("ringing");
  });

  it("call endpoint matches the provided endpoint", async () => {
    const { provider } = makeProvider();
    const call = await provider.createCall({
      type: "whatsapp",
      id: "+15559876543@s.whatsapp.net",
    });
    expect(call.endpoint.id).toBe("+15559876543@s.whatsapp.net");
  });
});

// ---------------------------------------------------------------------------
// Outbound: joinGroupCall
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider joinGroupCall", () => {
  it("delegates to manager.joinGroupCall", async () => {
    const { provider, manager } = makeProvider();
    await provider.joinGroupCall("group-jid@g.us");
    expect(manager.joinedGroupCalls).toHaveLength(1);
    expect(manager.joinedGroupCalls[0]!.groupJid).toBe("group-jid@g.us");
  });

  it("returns a WhatsAppCall in connecting state", async () => {
    const { provider } = makeProvider();
    const call = await provider.joinGroupCall("group@g.us");
    expect(call).toBeInstanceOf(WhatsAppCall);
    expect(call.state).toBe("connecting");
  });
});

// ---------------------------------------------------------------------------
// Remote state changes routed to the correct call
// ---------------------------------------------------------------------------

describe("WhatsAppVoiceProvider state change routing", () => {
  it("routes ended state to the matching call", () => {
    const { provider, manager } = makeProvider();
    let call: WhatsAppCall | undefined;
    provider.onCall((c) => {
      call = c as WhatsAppCall;
    });

    manager.triggerCallEvent(makeCallEvent({ callId: "call-99" }));
    expect(call!.state).toBe("ringing");

    manager.triggerStateChange({ callId: "call-99", state: "ended" });
    expect(call!.state).toBe("ended");
  });

  it("ignores state changes for unknown call IDs", () => {
    const { manager } = makeProvider();
    // Should not throw even if no call matches
    expect(() =>
      manager.triggerStateChange({ callId: "unknown-id", state: "ended" }),
    ).not.toThrow();
  });

  it("routes failed state correctly", () => {
    const { provider, manager } = makeProvider();
    let call: WhatsAppCall | undefined;
    provider.onCall((c) => {
      call = c as WhatsAppCall;
    });

    manager.triggerCallEvent(makeCallEvent({ callId: "call-fail" }));
    manager.triggerStateChange({ callId: "call-fail", state: "failed" });
    expect(call!.state).toBe("failed");
  });
});
