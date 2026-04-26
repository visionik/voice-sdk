/**
 * Test helper: a fully controllable WhatsAppConnectionManager for unit tests.
 *
 * Not a test file itself — imported by whatsapp-call.test.ts and
 * whatsapp-voice-provider.test.ts.
 */
import type { VoiceProvider } from "../../../src/interfaces/voice-provider.js";
import type {
  WhatsAppCallEvent,
  WhatsAppCallStateEvent,
  WhatsAppConnectionManager,
} from "../../../src/providers/whatsapp/connection-manager.js";

export class MockWhatsAppConnectionManager implements WhatsAppConnectionManager {
  // Captured interactions — read by tests to assert correct delegation.
  readonly registeredProviders: VoiceProvider[] = [];
  readonly answeredCalls: Array<{ callId: string; opts?: { video?: boolean } }> = [];
  readonly rejectedCalls: Array<{ callId: string; reason?: string }> = [];
  readonly endedCalls: string[] = [];
  readonly joinedGroupCalls: Array<{
    groupJid: string;
    opts?: { video?: boolean };
  }> = [];
  readonly sentAudio: Array<{ callId: string; chunk: Buffer }> = [];

  // Controls whether answer rejects (to test error propagation).
  answerError: Error | undefined = undefined;

  private readonly _callEventCbs: Array<(event: WhatsAppCallEvent) => void> = [];
  private readonly _stateChangeCbs: Array<(event: WhatsAppCallStateEvent) => void> = [];
  private readonly _audioCbs: Array<(callId: string, chunk: Buffer) => void> = [];

  // -------------------------------------------------------------------------
  // WhatsAppConnectionManager interface
  // -------------------------------------------------------------------------

  register(provider: VoiceProvider): void {
    this.registeredProviders.push(provider);
  }

  onCall(cb: (event: WhatsAppCallEvent) => void): void {
    this._callEventCbs.push(cb);
  }

  onState(cb: (event: WhatsAppCallStateEvent) => void): void {
    this._stateChangeCbs.push(cb);
  }

  onAudio(cb: (callId: string, chunk: Buffer) => void): void {
    this._audioCbs.push(cb);
  }

  async answer(callId: string, opts?: { video?: boolean }): Promise<void> {
    if (this.answerError) throw this.answerError;
    this.answeredCalls.push({ callId, opts });
  }

  async reject(callId: string, reason?: string): Promise<void> {
    this.rejectedCalls.push({ callId, reason });
  }

  async end(callId: string): Promise<void> {
    this.endedCalls.push(callId);
  }

  async join(groupJid: string, opts?: { video?: boolean }): Promise<void> {
    this.joinedGroupCalls.push({ groupJid, opts });
  }

  async send(callId: string, chunk: Buffer): Promise<void> {
    this.sentAudio.push({ callId, chunk });
  }

  // -------------------------------------------------------------------------
  // Test helpers — programmatic event injection
  // -------------------------------------------------------------------------

  /** Simulate an inbound call arriving from WhatsApp. */
  triggerCallEvent(event: WhatsAppCallEvent): void {
    for (const cb of this._callEventCbs) cb(event);
  }

  /** Simulate a remote call state change (answered, ended, failed). */
  triggerStateChange(event: WhatsAppCallStateEvent): void {
    for (const cb of this._stateChangeCbs) cb(event);
  }

  /** Simulate inbound audio data from the WASocket. */
  triggerAudioData(callId: string, chunk: Buffer): void {
    for (const cb of this._audioCbs) cb(callId, chunk);
  }
}

/** Builds a canonical inbound call event for tests. */
export function makeCallEvent(partial?: Partial<WhatsAppCallEvent>): WhatsAppCallEvent {
  return {
    callId: "call-abc123",
    from: "+15550001234@s.whatsapp.net",
    isGroup: false,
    isVideo: false,
    timestamp: new Date("2026-04-26T20:00:00Z"),
    ...partial,
  };
}
