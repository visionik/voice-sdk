import type {
  AgentBridge,
  STTProvider,
  TTSProvider,
  VisionProvider,
} from "../interfaces/agent-bridge.js";
import type { Call } from "../interfaces/call.js";
import type { CallTextMessage, TTSOptions } from "../types.js";

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
  private _visionProvider?: VisionProvider;
  private readonly _voiceInputCallbacks: Array<
    (transcript: string, confidence: number, metadata?: unknown) => void
  > = [];
  private readonly _seenCallbacks: Array<(description: string, timestamp: number) => void> = [];
  private readonly _readCallbacks: Array<(msg: CallTextMessage) => void> = [];

  /**
   * @param call - The call this bridge is attached to.
   *   Used by {@link BaseAgentBridge.say} to deliver synthesised media.
   */
  constructor(private readonly call: Call) {
    // Auto-wire incoming text messages to onRead subscribers.
    call.onText((msg) => {
      for (const cb of this._readCallbacks) cb(msg);
    });
  }

  /** @inheritdoc */
  onHeard(callback: (transcript: string, confidence: number, metadata?: unknown) => void): void {
    this._voiceInputCallbacks.push(callback);
  }

  /** @inheritdoc */
  async say(text: string, options?: TTSOptions): Promise<void> {
    if (!this._ttsProvider) return;
    const stream = this._ttsProvider.synthesize(text, options);
    await this.call.send(stream, "audio");
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

  eyes(): VisionProvider | undefined;
  eyes(provider: VisionProvider): void;
  eyes(provider?: VisionProvider): VisionProvider | undefined | void {
    if (provider === undefined) return this._visionProvider;
    this._visionProvider = provider;
    // Auto-wiring of eyes → receive('video') → onSeen is part of the
    // media-pipeline scope (tee fan-out). Placeholder for now.
  }

  onSeen(callback: (description: string, timestamp: number) => void): void {
    this._seenCallbacks.push(callback);
  }

  onRead(callback: (msg: CallTextMessage) => void): void {
    this._readCallbacks.push(callback);
  }

  /** @internal — called by the vision pipeline once implemented. */
  _triggerSeen(description: string, timestamp: number): void {
    for (const cb of this._seenCallbacks) {
      cb(description, timestamp);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal API — used by mock/provider implementations
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a voice transcript to all registered `onHeard` callbacks.
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
