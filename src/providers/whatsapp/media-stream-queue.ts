/**
 * A push-based async iterable queue for bridging WASocket callback-style
 * audio/video events into the SDK's `AsyncIterable<Buffer>` media model.
 *
 * The queue is created when a call is accepted and a media type becomes active.
 * The manager's `onAudio` callback pushes chunks; when the call ends,
 * `end()` is called to close the iterator.
 *
 * @internal
 */
export class MediaStreamQueue implements AsyncIterable<Buffer> {
  private readonly _queue: Buffer[] = [];
  private _notify: (() => void) | null = null;
  private _done = false;

  /**
   * Push a new chunk into the queue.
   * Any suspended consumer will be resumed.
   */
  push(chunk: Buffer): void {
    this._queue.push(chunk);
    this._notify?.();
    this._notify = null;
  }

  /**
   * Signal that no more chunks will arrive.
   * The async iterator will drain remaining buffered chunks then return.
   */
  end(): void {
    this._done = true;
    this._notify?.();
    this._notify = null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
    while (true) {
      if (this._queue.length > 0) {
        // Drain all currently buffered chunks before waiting.
        while (this._queue.length > 0) {
          yield this._queue.shift()!;
        }
      } else if (this._done) {
        return;
      } else {
        // Wait until push() or end() is called.
        await new Promise<void>((resolve) => {
          this._notify = resolve;
        });
      }
    }
  }
}
