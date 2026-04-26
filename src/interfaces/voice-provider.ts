import type { Call } from "./call.js";
import type { CallOptions, Endpoint, MediaType } from "../types.js";

/**
 * A channel-specific factory that creates and manages {@link Call} instances.
 *
 * Implement this interface to add a new transport (WhatsApp, Twilio, Discord,
 * WebRTC, SIP, …) to the SDK. Providers register themselves with OpenClaw
 * and receive incoming call events from the channel.
 *
 * ## Single-socket constraint
 *
 * Providers that share an underlying connection (e.g. WhatsApp requires a
 * single WASocket) should accept a connection manager via their constructor
 * rather than opening a new connection themselves. The optional
 * {@link VoiceProvider.connect} method is available for late
 * injection if constructor injection is not feasible.
 *
 * @example
 * ```ts
 * class WhatsAppVoiceProvider implements VoiceProvider {
 *   readonly name = 'whatsapp';
 *   readonly supportedMedia = ['audio', 'video', 'screen'] as const;
 *
 *   constructor(private manager: WhatsAppConnectionManager) {
 *     manager.register(this);
 *   }
 *   // ...
 * }
 * ```
 */
export interface VoiceProvider {
  /**
   * A stable identifier for this provider (e.g. `"whatsapp"`, `"twilio"`).
   * Used in {@link Call.provider}.
   */
  readonly name: string;

  /**
   * The set of {@link MediaType}s this provider supports.
   * Consumers can use this to check capability before negotiating media.
   */
  readonly supportedMedia: readonly MediaType[];

  /**
   * Initiate an outbound call to `endpoint`.
   *
   * @param endpoint - The remote endpoint to call.
   * @param options  - Optional call configuration.
   * @returns A {@link Call} in `initialized` or `ringing` state.
   * @throws {@link CallError} with code `"unauthorized"` if not permitted.
   */
  dial(endpoint: Endpoint, options?: CallOptions): Promise<Call>;

  /**
   * Join an existing group call.
   *
   * @param groupId - Provider-specific group call identifier (JID, room ID, etc.).
   * @param options - Optional call configuration.
   * @returns A {@link Call} in `connecting` or `connected` state.
   * @throws {@link CallError} with code `"group-full"` if the group has no capacity.
   */
  join(groupId: string, options?: CallOptions): Promise<Call>;

  /**
   * Late-inject a shared connection manager.
   *
   * Providers that need a pre-existing connection (e.g. a single WASocket)
   * may implement this to receive the manager after construction.
   *
   * @param manager - The provider-specific connection manager instance.
   */
  connect?(manager: unknown): void;
}
