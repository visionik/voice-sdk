import type { CallMode, EndpointType, MediaType } from "../../src/types.js";
import { MockVoiceProvider } from "../../src/providers/mock/mock-voice-provider.js";

/** Options accepted by the dial command. */
export type DialOptions = {
  /** Endpoint string, e.g. `whatsapp:+15550001234` or bare `+15550001234`. */
  to: string;
  /** Comma-separated media types, e.g. `audio` or `audio,video`. */
  media: string;
  /** Call participation mode. */
  mode: CallMode;
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
 * Action function for the `dial` command.
 *
 * Exported separately from Commander setup so it can be unit-tested
 * without spawning a process.
 *
 * @param options - Parsed CLI options.
 * @param log     - Output function (defaults to stdout; override in tests).
 */
export async function dialAction(
  options: DialOptions,
  log: (msg: string) => void = (msg) => process.stdout.write(msg + "\n"),
): Promise<void> {
  const { type, id } = parseEndpoint(options.to);
  const mediaTypes = options.media.split(",").map((m) => m.trim()) as MediaType[];

  const provider = new MockVoiceProvider();

  log(`[mock] Dialling ${options.to}...`);

  const call = await provider.dial({ type, id });
  // Log initial state immediately — dial sets 'ringing' before we attach a listener.
  log(`  → state: ${call.state}`);

  return new Promise<void>((resolve) => {
    call.on("state", (state) => {
      log(`  → state: ${state}`);
      if (state === "ended" || state === "failed") {
        resolve();
      }
    });

    // Simulate the remote party answering then hanging up.
    void call
      .accept({ mediaTypes })
      .then(() => {
        log(`  connected to ${call.endpoint.id}`);
        return call.hangup("demo-complete");
      })
      .catch((err: unknown) => {
        log(`  error: ${err instanceof Error ? err.message : String(err)}`);
        resolve();
      });
  });
}
