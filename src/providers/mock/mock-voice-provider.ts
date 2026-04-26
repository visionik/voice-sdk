import type { Call } from "../../interfaces/call.js";
import type { VoiceProvider } from "../../interfaces/voice-provider.js";
import type { CallOptions, CallState, Endpoint, MediaType } from "../../types.js";
import { MockCall } from "./mock-call.js";

/** Callback invoked when an incoming call arrives. */
export type IncomingCallHandler = (call: Call) => void;

/**
 * In-memory {@link VoiceProvider} implementation for deterministic testing.
 *
 * `MockVoiceProvider` allows test code to simulate the full call lifecycle
 * without any real network or telephony connection:
 *
 * - {@link MockVoiceProvider.ring} — simulate an inbound call
 * - {@link MockVoiceProvider.setState} — force a call into any state
 * - {@link MockVoiceProvider.speak} — deliver a transcript to
 *   the call's {@link AgentBridge}
 *
 * @example
 * ```ts
 * const provider = new MockVoiceProvider();
 * provider.onCall(async (call) => {
 *   await call.accept();
 *   call.agent().onHeard((t) => console.log('heard:', t));
 * });
 *
 * const call = provider.ring({ type: 'whatsapp', id: '+1234' });
 * provider.speak(call.id, 'hello world');
 * ```
 */
export class MockVoiceProvider implements VoiceProvider {
  /** @inheritdoc */
  readonly name = "mock";

  /** @inheritdoc */
  readonly supportedMedia: readonly MediaType[] = ["audio", "video", "screen", "data"];

  private readonly _calls = new Map<string, MockCall>();
  private readonly _onCallHandlers: IncomingCallHandler[] = [];
  private _callCounter = 0;

  // -------------------------------------------------------------------------
  // VoiceProvider interface
  // -------------------------------------------------------------------------

  /** @inheritdoc */
  async dial(endpoint: Endpoint, options?: CallOptions): Promise<Call> {
    const call = this._makeCall(endpoint, options);
    call._transitionState("ringing");
    return call;
  }

  /** @inheritdoc */
  async join(groupId: string, options?: CallOptions): Promise<Call> {
    const endpoint: Endpoint = { type: "whatsapp", id: groupId };
    const call = this._makeCall(endpoint, options);
    call._transitionState("connecting");
    return call;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  /**
   * Register a handler to receive incoming calls simulated via
   * {@link MockVoiceProvider.ring}.
   *
   * Multiple handlers can be registered; all are called in registration order.
   *
   * @param handler - Callback invoked with each new incoming {@link Call}.
   */
  onCall(handler: IncomingCallHandler): void {
    this._onCallHandlers.push(handler);
  }

  /**
   * Simulate an inbound call arriving from `endpoint`.
   *
   * Creates a {@link MockCall} in `ringing` state, fires all registered
   * `onCall` handlers, and returns the call for direct manipulation.
   *
   * @param endpoint - The remote endpoint the call originates from.
   * @param options  - Optional call configuration.
   * @returns The created {@link MockCall} — typed as `MockCall` so callers
   *   can access test helpers (`_triggerVoiceInput`, `sent`, etc.).
   */
  ring(endpoint: Endpoint, options?: CallOptions): MockCall {
    const call = this._makeCall(endpoint, options);
    call._transitionState("ringing");
    for (const handler of this._onCallHandlers) {
      handler(call);
    }
    return call;
  }

  /**
   * Force the call with `callId` into `newState`.
   *
   * @param callId   - The {@link Call.id} to transition.
   * @param newState - The target {@link CallState}.
   * @throws `Error` if no call with the given ID is registered.
   */
  setState(callId: string, newState: CallState): void {
    const call = this._requireCall(callId);
    call._transitionState(newState);
  }

  /**
   * Deliver a voice transcript to the agent bridge of the call with `callId`.
   *
   * This simulates what would happen after STT processes the call's audio —
   * all callbacks registered via `onHeard` will fire.
   *
   * @param callId     - The {@link Call.id} to deliver transcript to.
   * @param transcript - The recognised speech text.
   * @param confidence - Recognition confidence score (0–1). Defaults to `1.0`.
   * @throws `Error` if no call with the given ID is registered.
   */
  speak(callId: string, transcript: string, confidence = 1.0): void {
    const call = this._requireCall(callId);
    call._triggerVoiceInput(transcript, confidence);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _makeCall(endpoint: Endpoint, options?: CallOptions): MockCall {
    const id = `mock-call-${(++this._callCounter).toString()}`;
    const call = new MockCall(id, endpoint, options);
    this._calls.set(id, call);
    return call;
  }

  private _requireCall(callId: string): MockCall {
    const call = this._calls.get(callId);
    if (!call) {
      throw new Error(
        `MockVoiceProvider: no call with id "${callId}". ` +
          `Known ids: ${[...this._calls.keys()].join(", ") || "(none)"}`,
      );
    }
    return call;
  }
}
