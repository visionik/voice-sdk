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
  private readonly _videoFrameCallbacks: Array<(frame: Buffer, timestamp: number) => void> = [];

  /**
   * @param call - The call this bridge is attached to.
   *   Used by {@link BaseAgentBridge.play} and
   *   {@link BaseAgentBridge.say} to deliver synthesised media.
   */
  constructor(private readonly call: Call) {}

  /** @inheritdoc */
  onSpeech(callback: (transcript: string, confidence: number, metadata?: unknown) => void): void {
    this._voiceInputCallbacks.push(callback);
  }

  /** @inheritdoc */
  onFrame(callback: (frame: Buffer, timestamp: number) => void): void {
    this._videoFrameCallbacks.push(callback);
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

  /** @inheritdoc */
  setSTT(provider: STTProvider): void {
    this._sttProvider = provider;
  }

  /** @inheritdoc */
  setTTS(provider: TTSProvider): void {
    this._ttsProvider = provider;
  }

  // ---------------------------------------------------------------------------
  // Internal API — used by mock/provider implementations
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a voice transcript to all registered `onSpeech` callbacks.
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

  /**
   * Dispatch a video frame to all registered `onFrame` callbacks.
   *
   * @internal
   */
  _triggerVideoFrame(frame: Buffer, timestamp: number): void {
    for (const cb of this._videoFrameCallbacks) {
      cb(frame, timestamp);
    }
  }
}
