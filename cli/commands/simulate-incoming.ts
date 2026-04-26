import type { CallMode, EndpointType, MediaType } from "../../src/types.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

/** Options accepted by the simulate-incoming command. */
export type SimulateIncomingOptions = {
  /** Endpoint string, e.g. `whatsapp:+15550001234` or bare `+15550001234`. */
  from: string;
  /** Comma-separated media types, e.g. `audio` or `audio,video`. */
  media: string;
  /** Call participation mode. */
  mode: CallMode;
  /** If true, automatically accept the call and then hang up. */
  autoAccept: boolean;
};

/**
 * Parse a `type:id` endpoint string, defaulting to `whatsapp` if no type prefix.
 */
function parseEndpoint(raw: string): { type: EndpointType; id: string } {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    return { type: "whatsapp", id: raw };
  }
  return {
    type: raw.slice(0, colonIdx) as EndpointType,
    id: raw.slice(colonIdx + 1),
  };
}

/**
 * Action function for the `simulate-incoming` command.
 *
 * Exported separately from Commander setup so it can be unit-tested
 * without spawning a process.
 *
 * @param options - Parsed CLI options.
 * @param log     - Output function (defaults to stdout; override in tests).
 */
export async function simulateIncomingAction(
  options: SimulateIncomingOptions,
  log: (msg: string) => void = (msg) => process.stdout.write(msg + "\n"),
): Promise<void> {
  const { type, id } = parseEndpoint(options.from);
  const mediaTypes = options.media.split(",").map((m) => m.trim()) as MediaType[];

  const provider = new MockVoiceProvider();

  return new Promise<void>((resolve) => {
    provider.onCall(async (call) => {
      log(`[${call.provider}] Incoming call from ${call.endpoint.id}`);
      log(`  endpoint type : ${call.endpoint.type}`);
      log(`  media types   : ${mediaTypes.join(", ")}`);
      log(`  mode          : ${options.mode}`);
      // Log the current state immediately — 'ringing' is set before onCall fires.
      log(`  → state: ${call.state}`);

      call.on("state", (state) => {
        log(`  → state: ${state}`);
        if (state === "ended" || state === "failed") {
          resolve();
        }
      });

      if (options.autoAccept) {
        await call.accept({ mediaTypes });
        // Auto-hang-up to complete the lifecycle demonstration.
        await call.hangup("auto-hangup");
      } else {
        // Without --auto-accept, reject immediately (non-interactive mode).
        await call.reject("not-accepted");
      }
    });

    // Trigger the simulated inbound call.
    provider.triggerIncoming({ type, id });
  });
}
