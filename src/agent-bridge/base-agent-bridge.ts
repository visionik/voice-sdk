import type { AgentBridge, STTProvider, TTSProvider } from "../interfaces/agent-bridge.js";
import type { Call } from "../interfaces/call.js";
import type { MediaSource, TTSOptions } from "../types.js";

/**
 * Concrete implementation of {@link AgentBridge} that wires pluggable
 * {@link STTProvider} and {@link TTSProvider} instances to a {@link Call}'s
 * media streams.
 *
 * Each {@link Call} implementation creates exactly one `BaseAgentBridge`
 * instance and returns it from `getAgentBridge()`. The bridge holds a
 * reference back to the call so it can inject media via `sendMedia`.
 *
 * @example
 * ```ts
 * // Inside a Call implementation:
 * private readonly _bridge = new BaseAgentBridge(this);
 *
 * getAgentBridge(): AgentBridge {
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
  private readonly _videoFrameCallbacks: Array<(frame: Buffer, timestamp: number) => void> = [];

  /**
   * @param call - The call this bridge is attached to.
   *   Used by {@link BaseAgentBridge.injectAudio} and
   *   {@link BaseAgentBridge.injectTTS} to deliver synthesised media.
   */
  constructor(private readonly call: Call) {}

  /** @inheritdoc */
  onVoiceInput(
    callback: (transcript: string, confidence: number, metadata?: unknown) => void,
  ): void {
    this._voiceInputCallbacks.push(callback);
  }

  /** @inheritdoc */
  onVideoFrame(callback: (frame: Buffer, timestamp: number) => void): void {
    this._videoFrameCallbacks.push(callback);
  }

  /** @inheritdoc */
  async injectTTS(text: string, options?: TTSOptions): Promise<void> {
    if (!this._ttsProvider) return;
    const stream = this._ttsProvider.synthesize(text, options);
    await this.call.sendMedia(stream, "audio");
  }

  /** @inheritdoc */
  async injectAudio(stream: MediaSource): Promise<void> {
    await this.call.sendMedia(stream, "audio");
  }

  /** @inheritdoc */
  async injectSyntheticVideo(stream: MediaSource): Promise<void> {
    await this.call.sendMedia(stream, "video");
  }

  /** @inheritdoc */
  setSTTProvider(provider: STTProvider): void {
    this._sttProvider = provider;
  }

  /** @inheritdoc */
  setTTSProvider(provider: TTSProvider): void {
    this._ttsProvider = provider;
  }

  // ---------------------------------------------------------------------------
  // Internal API — used by mock/provider implementations
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a voice transcript to all registered `onVoiceInput` callbacks.
   *
   * Called by {@link MockVoiceProvider.simulateVoiceInput} and by real
   * provider implementations when STT output is available.
   *
   * @internal
   */
  _triggerVoiceInput(transcript: string, confidence: number, metadata?: unknown): void {
    for (const cb of this._voiceInputCallbacks) {
      cb(transcript, confidence, metadata);
    }
  }

  /**
   * Dispatch a video frame to all registered `onVideoFrame` callbacks.
   *
   * @internal
   */
  _triggerVideoFrame(frame: Buffer, timestamp: number): void {
    for (const cb of this._videoFrameCallbacks) {
      cb(frame, timestamp);
    }
  }
}
