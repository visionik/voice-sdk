import type { AgentBridge, STTProvider, TTSProvider } from "../interfaces/agent-bridge.js";
import type { Call } from "../interfaces/call.js";
import type { MediaSource, TTSOptions } from "../types.js";

/**
 * Concrete implementation of {@link AgentBridge} that wires pluggable
 * {@link STTProvider} and {@link TTSProvider} instances to a {@link Call}'s
 * media streams.
 *
 * Each {@link Call} implementation creates exactly one `BaseAgentBridge`
 * instance and returns it from `agent()`. The bridge holds a
 * reference back to the call so it can inject media via `send`.
 *
 * @example
 * ```ts
 * // Inside a Call implementation:
 * private readonly _bridge = new BaseAgentBridge(this);
 *
 * agent(): AgentBridge {
 *   return this._bridge;
 * }
 * ```
 */
export class BaseAgentBridge implements AgentBridge {
  private _sttProvider?: STTProvider;
  private _ttsProvider?: TTSProvider;
  private readonly _voiceInputCallbacks: Array<
    (transcript: string, confidence: number, metadata?: unknown) => void
  > = [];

  /**
   * @param call - The call this bridge is attached to.
   *   Used by {@link BaseAgentBridge.play} and
   *   {@link BaseAgentBridge.say} to deliver synthesised media.
   */
  constructor(private readonly call: Call) {}

  /** @inheritdoc */
  onTranscript(
    callback: (transcript: string, confidence: number, metadata?: unknown) => void,
  ): void {
    this._voiceInputCallbacks.push(callback);
  }

  /** @inheritdoc */
  async say(text: string, options?: TTSOptions): Promise<void> {
    if (!this._ttsProvider) return;
    const stream = this._ttsProvider.synthesize(text, options);
    await this.call.send(stream, "audio");
  }

  /** @inheritdoc */
  async play(stream: MediaSource): Promise<void> {
    await this.call.send(stream, "audio");
  }

  /** @inheritdoc */
  async show(stream: MediaSource): Promise<void> {
    await this.call.send(stream, "video");
  }

  ear(): STTProvider | undefined;
  ear(provider: STTProvider): void;
  ear(provider?: STTProvider): STTProvider | undefined | void {
    if (provider === undefined) return this._sttProvider;
    this._sttProvider = provider;
  }

  mouth(): TTSProvider | undefined;
  mouth(provider: TTSProvider): void;
  mouth(provider?: TTSProvider): TTSProvider | undefined | void {
    if (provider === undefined) return this._ttsProvider;
    this._ttsProvider = provider;
  }

  // ---------------------------------------------------------------------------
  // Internal API — used by mock/provider implementations
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a voice transcript to all registered `onTranscript` callbacks.
   *
   * Called by {@link MockVoiceProvider.speak} and by real
   * provider implementations when STT output is available.
   *
   * @internal
   */
  _triggerVoiceInput(transcript: string, confidence: number, metadata?: unknown): void {
    for (const cb of this._voiceInputCallbacks) {
      cb(transcript, confidence, metadata);
    }
  }
}
