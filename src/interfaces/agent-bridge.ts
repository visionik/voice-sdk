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
 * {@link AgentBridge.setSTT} and {@link AgentBridge.setTTS}.
 *
 * @example
 * ```ts
 * const bridge = call.agent();
 * bridge.setSTT(mySTT);
 * bridge.setTTS(myTTS);
 *
 * bridge.onSpeech((transcript) => {
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
   * {@link AgentBridge.setSTT}.
   *
   * @param callback - Receives the transcript, confidence score, and optional metadata.
   */
  onSpeech(callback: (transcript: string, confidence: number, metadata?: unknown) => void): void;

  /**
   * Register a callback that fires for each incoming video frame.
   * Only available when the call has an active `"video"` media stream.
   *
   * @param callback - Receives the raw frame buffer and a UTC timestamp.
   */
  onFrame?(callback: (frame: Buffer, timestamp: number) => void): void;

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
   * Replace the active STT provider.
   * Affects all subsequent calls to {@link AgentBridge.onSpeech}.
   *
   * @param provider - The new STT provider.
   */
  setSTT(provider: STTProvider): void;

  /**
   * Replace the active TTS provider.
   * Affects all subsequent calls to {@link AgentBridge.say}.
   *
   * @param provider - The new TTS provider.
   */
  setTTS(provider: TTSProvider): void;
}
