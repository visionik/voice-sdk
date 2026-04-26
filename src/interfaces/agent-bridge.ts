import type { MediaSource, TTSOptions } from "../types.js";

/**
 * A speech-to-text provider that transcribes a {@link MediaSource} audio stream.
 *
 * Providers should stream partial results as they become available, with
 * `isFinal: true` marking the last segment for each utterance.
 */
export interface STTProvider {
  /**
   * Transcribe an audio stream, yielding incremental transcript segments.
   *
   * @param audio - Raw audio stream to transcribe.
   * @returns An async iterable of transcript segments.
   */
  transcribe(audio: MediaSource): AsyncIterable<{
    transcript: string;
    confidence: number;
    isFinal: boolean;
  }>;
}

/**
 * A vision provider that describes video frames.
 *
 * Receives individual frames and yields structured descriptions,
 * enabling agents to understand what is happening visually on a call.
 */
export interface VisionProvider {
  /**
   * Describe a sequence of video frames, yielding descriptions as they are ready.
   *
   * @param frames - Stream of `{ frame: Buffer, timestamp: number }` objects.
   * @returns An async iterable of description segments.
   */
  describe(frames: AsyncIterable<{ frame: Buffer; timestamp: number }>): AsyncIterable<{
    description: string;
    timestamp: number;
  }>;
}

/**
 * A text-to-speech provider that synthesises speech from text.
 */
export interface TTSProvider {
  /**
   * Synthesise text into an audio stream.
   *
   * @param text    - The text to synthesise.
   * @param options - Optional voice/speed/language parameters.
   * @returns A {@link MediaSource} audio stream.
   */
  synthesize(text: string, options?: TTSOptions): MediaSource;
}

/**
 * The AI agent bridge attached to every {@link Call}.
 *
 * Provides a standard interface for agents to:
 * - receive transcribed voice input via an STT provider
 * - inject synthesised speech via a TTS provider
 * - inject raw audio or synthetic video streams directly
 *
 * STT and TTS providers are pluggable at runtime via
 * {@link AgentBridge.ear} and {@link AgentBridge.mouth}.
 *
 * @example
 * ```ts
 * const bridge = call.agent();
 * bridge.ear(mySTT);
 * bridge.mouth(myTTS);
 *
 * bridge.onHeard((transcript) => {
 *   // Send to LLM, then reply:
 *   void bridge.say("Hello, I heard you say: " + transcript);
 * });
 * ```
 */
export interface AgentBridge {
  /**
   * Register a callback that fires whenever a voice transcript is ready.
   *
   * Requires an {@link STTProvider} to have been set via
   * {@link AgentBridge.ear}.
   *
   * @param callback - Receives the transcript, confidence score, and optional metadata.
   */
  onHeard(callback: (transcript: string, confidence: number, metadata?: unknown) => void): void;

  /**
   * Synthesise `text` via the current TTS provider and inject it into the call.
   *
   * @param text    - Text to speak.
   * @param options - Optional TTS synthesis parameters.
   */
  say(text: string, options?: TTSOptions): Promise<void>;

  /**
   * Inject a pre-encoded audio stream directly into the call.
   *
   * @param stream - Audio stream to inject.
   */
  play(stream: MediaSource): Promise<void>;

  /**
   * Inject a synthetic video stream (e.g. an avatar) into the call.
   * Only available when the call has an active `"video"` media stream.
   *
   * @param stream - Video stream to inject.
   */
  show?(stream: MediaSource): Promise<void>;

  /**
   * Get the current STT provider (no args) or set it (with arg).
   *
   * - `bridge.ear()` — returns current {@link STTProvider} or `undefined`
   * - `bridge.ear(p)` — sets the provider; affects subsequent {@link AgentBridge.onHeard} callbacks
   */
  ear(): STTProvider | undefined;
  ear(provider: STTProvider): void;

  /**
   * Get the current TTS provider (no args) or set it (with arg).
   *
   * - `bridge.mouth()` — returns current {@link TTSProvider} or `undefined`
   * - `bridge.mouth(p)` — sets the provider; affects subsequent {@link AgentBridge.say} calls
   */
  mouth(): TTSProvider | undefined;
  mouth(provider: TTSProvider): void;

  /**
   * Get the current vision provider (no args) or set it (with arg).
   *
   * - `bridge.eyes()` — returns current {@link VisionProvider} or `undefined`
   * - `bridge.eyes(p)` — sets the provider; auto-wires `call.receive('video')` → descriptions → `onSeen`
   */
  eyes(): VisionProvider | undefined;
  eyes(provider: VisionProvider): void;

  /**
   * Register a callback that fires when the vision provider produces a description.
   *
   * Requires a {@link VisionProvider} set via {@link AgentBridge.eyes}.
   *
   * @param callback - Receives the description and the source timestamp.
   */
  onSeen(callback: (description: string, timestamp: number) => void): void;
}
