#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { CallMode } from "../src/types.js";
import { dialAction } from "./commands/dial.js";
import { simulateIncomingAction } from "./commands/simulate-incoming.js";

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

function getPackageVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    // Works from both source (cli/) and built (dist/cli/) locations.
    const pkgPath = join(dir, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---------------------------------------------------------------------------
// Program factory (exported so tests can inspect metadata without running)
// ---------------------------------------------------------------------------

/**
 * Build and return the configured Commander program.
 *
 * Exported so tests can call `createProgram().helpInformation()` and
 * `createProgram().version()` without running `parseAsync` or triggering
 * `process.exit`.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("openclaw-voice")
    .description("@openclaw/voice-sdk developer harness — simulate and inspect call scenarios")
    .version(getPackageVersion());

  // -------------------------------------------------------------------------
  // simulate-incoming
  // -------------------------------------------------------------------------

  program
    .command("simulate-incoming")
    .description("Simulate an inbound call via MockVoiceProvider and display state transitions")
    .option(
      "--from <endpoint>",
      "Caller endpoint (e.g. whatsapp:+15550001234)",
      "whatsapp:+15550001234",
    )
    .option(
      "--media <types>",
      "Comma-separated media types to activate (audio, video, screen, data)",
      "audio",
    )
    .option("--mode <mode>", "Participation mode: listen-only | talkback | full-duplex", "talkback")
    .option("--auto-accept", "Automatically accept the call and hang up (non-interactive)", false)
    .action(async (opts: { from: string; media: string; mode: string; autoAccept: boolean }) => {
      await simulateIncomingAction({
        from: opts.from,
        media: opts.media,
        mode: opts.mode as CallMode,
        autoAccept: opts.autoAccept,
      });
    });

  // -------------------------------------------------------------------------
  // dial
  // -------------------------------------------------------------------------

  program
    .command("dial")
    .description("Dial an outbound call via MockVoiceProvider")
    .requiredOption("--to <endpoint>", "Destination endpoint (e.g. whatsapp:+15550001234)")
    .option("--media <types>", "Comma-separated media types (audio, video, screen, data)", "audio")
    .option(
      "--mode <mode>",
      "Participation mode: listen-only | talkback | full-duplex",
      "full-duplex",
    )
    .action(async (opts: { to: string; media: string; mode: string }) => {
      await dialAction({
        to: opts.to,
        media: opts.media,
        mode: opts.mode as CallMode,
      });
    });

  return program;
}

// ---------------------------------------------------------------------------
// Entry point guard
// ---------------------------------------------------------------------------

/**
 * Returns true only when this file is the direct entry point (not during
 * test imports). Compares the resolved file path against process.argv[1].
 */
function isDirectEntry(): boolean {
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  const prog = createProgram();
  await prog.parseAsync(process.argv);
}
