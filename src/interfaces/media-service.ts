import type { MediaSource } from "../types.js";

/** Options for recording a call segment. */
export type RecordOptions = {
  /** Maximum recording duration. The recording stops automatically at this limit. */
  maxDurationMs?: number;
  /** Output audio format. Defaults to `"wav"` if not specified. */
  format?: "wav" | "opus";
};

/** Options for collecting a caller's speech or DTMF input. */
export type CollectOptions = {
  /** Stop collecting after this many milliseconds of silence. */
  maxSilenceMs: number;
  /** Hard limit on collection time regardless of silence detection. */
  maxDurationMs: number;
  /** If `true`, also capture DTMF key presses. */
  dtmf?: boolean;
};

/** A completed recording segment. */
export type Recording = {
  /** The recorded audio as a {@link MediaSource} stream. */
  audio: MediaSource;
  /** Actual recording duration in milliseconds. */
  durationMs: number;
};

/** The result of a {@link MediaService.collect} operation. */
export type CollectionResult = {
  /** The captured audio. */
  audio: MediaSource;
  /** DTMF digits pressed (if DTMF collection was enabled), or `undefined`. */
  dtmf?: string;
  /** `true` if collection ended because `maxDurationMs` was reached. */
  timedOut: boolean;
};

/**
 * Higher-level media operations on an active call.
 *
 * `MediaService` is not part of the {@link Call} interface directly — it is an
 * optional capability that concrete providers may expose alongside a `Call`.
 *
 * @example
 * ```ts
 * const svc: MediaService = call.getService('media');
 * await svc.play(ttsAudioStream);
 * const result = await svc.collect({ maxSilenceMs: 1000, maxDurationMs: 10_000 });
 * console.log('caller said:', result.audio);
 * ```
 */
export interface MediaService {
  /**
   * Play a {@link MediaSource} audio stream into the call.
   *
   * @param stream - The audio to play.
   */
  play(stream: MediaSource): Promise<void>;

  /**
   * Record the incoming media for a segment.
   *
   * @param options - Optional recording constraints.
   * @returns A {@link Recording} when the segment ends.
   */
  record(options?: RecordOptions): Promise<Recording>;

  /**
   * Collect caller speech and/or DTMF input, stopping on silence.
   *
   * @param options - Collection constraints (required).
   * @returns The captured audio and optional DTMF digits.
   */
  collect(options: CollectOptions): Promise<CollectionResult>;
}
