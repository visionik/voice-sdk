/**
 * Error codes that identify the reason a call operation failed.
 *
 * - `timeout`       — the operation did not complete within the allowed time
 * - `rejected`      — the remote party explicitly declined the call
 * - `media-failure` — a media stream could not be established or was interrupted
 * - `unauthorized`  — the caller lacks permission to initiate the operation
 * - `group-full`    — the target group call has reached its participant limit
 */
export type CallErrorCode =
  | "timeout"
  | "rejected"
  | "media-failure"
  | "unauthorized"
  | "group-full";

/**
 * Error thrown by SDK operations when a call lifecycle event fails.
 *
 * @example
 * ```ts
 * try {
 *   await call.accept();
 * } catch (err) {
 *   if (err instanceof CallError && err.code === 'media-failure') {
 *     // handle media setup failure
 *   }
 * }
 * ```
 */
export class CallError extends Error {
  /** Typed reason code for the failure. */
  readonly code: CallErrorCode;

  constructor(code: CallErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CallError";
    this.code = code;
    // Restore prototype chain (required when extending built-ins in ES5 targets).
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Creates a {@link CallError} with code `"timeout"`. */
  static timeout(message?: string): CallError {
    return new CallError("timeout", message);
  }

  /** Creates a {@link CallError} with code `"rejected"`. */
  static rejected(message?: string): CallError {
    return new CallError("rejected", message);
  }

  /** Creates a {@link CallError} with code `"media-failure"`. */
  static mediaFailure(message?: string): CallError {
    return new CallError("media-failure", message);
  }

  /** Creates a {@link CallError} with code `"unauthorized"`. */
  static unauthorized(message?: string): CallError {
    return new CallError("unauthorized", message);
  }

  /** Creates a {@link CallError} with code `"group-full"`. */
  static groupFull(message?: string): CallError {
    return new CallError("group-full", message);
  }
}
