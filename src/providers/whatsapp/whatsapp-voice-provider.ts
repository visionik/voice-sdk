import type { Call } from "../../interfaces/call.js";
import type { VoiceProvider } from "../../interfaces/voice-provider.js";
import type { CallOptions, Endpoint, MediaType } from "../../types.js";
import type { WhatsAppConnectionManager } from "./connection-manager.js";
import { WhatsAppCall } from "./whatsapp-call.js";

/** Callback invoked when an incoming WhatsApp call arrives. */
export type WhatsAppIncomingCallHandler = (call: Call) => void;

/**
 * WhatsApp implementation of {@link VoiceProvider}.
 *
 * Receives call events from a {@link WhatsAppConnectionManager} and converts
 * them into {@link WhatsAppCall} instances. Requires exactly one manager
 * instance (the shared WASocket wrapper) — no second socket is opened.
 *
 * @example
 * ```ts
 * const provider = new WhatsAppVoiceProvider(connectionManager);
 *
 * provider.onCall(async (call) => {
 *   await call.accept();
 *   call.getAgentBridge().onVoiceInput((transcript) => {
 *     void call.getAgentBridge().injectTTS(`You said: ${transcript}`);
 *   });
 * });
 * ```
 */
export class WhatsAppVoiceProvider implements VoiceProvider {
  /** @inheritdoc */
  readonly name = "whatsapp";

  /** @inheritdoc */
  readonly supportedMedia: readonly MediaType[] = ["audio", "video", "screen"];

  private readonly _manager: WhatsAppConnectionManager;
  private readonly _onCallHandlers: WhatsAppIncomingCallHandler[] = [];
  /** Registry of active calls keyed by callId — used to route state changes. */
  private readonly _calls = new Map<string, WhatsAppCall>();

  /**
   * @param manager - The shared connection manager wrapping the WASocket.
   *   `registerVoiceProvider(this)` is called immediately so the manager
   *   can route call events to this provider.
   */
  constructor(manager: WhatsAppConnectionManager) {
    this._manager = manager;

    // Single-socket contract: register once, never open a new socket.
    manager.registerVoiceProvider(this);

    // Subscribe to incoming calls.
    manager.onCallEvent((event) => {
      const call = new WhatsAppCall(event, manager);
      this._calls.set(event.callId, call);
      for (const handler of this._onCallHandlers) {
        handler(call);
      }
    });

    // Subscribe to remote state changes and route to the correct call.
    manager.onCallStateChange((event) => {
      const call = this._calls.get(event.callId);
      call?._notifyExternalStateChange(event.state);
    });
  }

  // -------------------------------------------------------------------------
  // VoiceProvider interface
  // -------------------------------------------------------------------------

  /** @inheritdoc */
  async createCall(endpoint: Endpoint, _options?: CallOptions): Promise<Call> {
    // WhatsAppCall initialises in `ringing` state — the correct state for an
    // outbound call waiting for the remote party to answer.
    const call = new WhatsAppCall(
      {
        callId: `out-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
        from: endpoint.id,
        isGroup: false,
        isVideo: false,
        timestamp: new Date(),
      },
      this._manager,
    );
    this._calls.set(call.id, call);
    return call;
  }

  /** @inheritdoc */
  async joinGroupCall(groupId: string, _options?: CallOptions): Promise<Call> {
    await this._manager.joinGroupCall(groupId);
    const call = new WhatsAppCall(
      {
        callId: `grp-${Date.now().toString()}`,
        from: groupId,
        isGroup: true,
        isVideo: false,
        timestamp: new Date(),
      },
      this._manager,
    );
    this._calls.set(call.id, call);
    call._notifyExternalStateChange("connecting");
    return call;
  }

  // -------------------------------------------------------------------------
  // Incoming call subscription
  // -------------------------------------------------------------------------

  /**
   * Register a callback to receive incoming WhatsApp calls.
   *
   * Multiple handlers can be registered; all are called in registration order.
   *
   * @param handler - Invoked with each new incoming {@link Call}.
   */
  onCall(handler: WhatsAppIncomingCallHandler): void {
    this._onCallHandlers.push(handler);
  }
}
