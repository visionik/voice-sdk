/**
 * CLI harness smoke tests.
 *
 * We test command action functions directly rather than spawning a child
 * process — no build required, no process.exit() complications.
 */
import { describe, expect, it } from "vitest";
import { createProgram } from "../../cli/index.js";
import { dialAction } from "../../cli/commands/dial.js";
import { simulateIncomingAction } from "../../cli/commands/simulate-incoming.js";

// ---------------------------------------------------------------------------
// Program metadata
// ---------------------------------------------------------------------------

describe("CLI program", () => {
  it("--help lists simulate-incoming command", () => {
    const help = createProgram().helpInformation();
    expect(help).toContain("simulate-incoming");
  });

  it("--help lists dial command", () => {
    const help = createProgram().helpInformation();
    expect(help).toContain("dial");
  });

  it("version is a non-empty string", () => {
    const ver = createProgram().version();
    expect(typeof ver).toBe("string");
    expect(ver!.length).toBeGreaterThan(0);
  });

  it("name is openclaw-voice", () => {
    expect(createProgram().name()).toBe("openclaw-voice");
  });
});

// ---------------------------------------------------------------------------
// simulate-incoming action
// ---------------------------------------------------------------------------

describe("simulate-incoming action", () => {
  it("runs to completion with --auto-accept (no error)", async () => {
    await expect(
      simulateIncomingAction(
        {
          from: "whatsapp:+15550001234",
          media: "audio",
          mode: "talkback",
          autoAccept: true,
        },
        () => {},
      ),
    ).resolves.toBeUndefined();
  });

  it("emits state lifecycle log lines", async () => {
    const lines: string[] = [];
    await simulateIncomingAction(
      {
        from: "whatsapp:+15550001234",
        media: "audio",
        mode: "talkback",
        autoAccept: true,
      },
      (msg) => lines.push(msg),
    );
    // Should contain state transition lines
    expect(lines.some((l) => l.includes("ringing"))).toBe(true);
    expect(lines.some((l) => l.includes("connected"))).toBe(true);
    expect(lines.some((l) => l.includes("ended"))).toBe(true);
  });

  it("logs the caller's endpoint", async () => {
    const lines: string[] = [];
    await simulateIncomingAction(
      {
        from: "whatsapp:+19998887777",
        media: "audio",
        mode: "full-duplex",
        autoAccept: true,
      },
      (msg) => lines.push(msg),
    );
    expect(lines.some((l) => l.includes("+19998887777"))).toBe(true);
  });

  it("runs without auto-accept (call is rejected)", async () => {
    await expect(
      simulateIncomingAction(
        {
          from: "whatsapp:+15550001234",
          media: "audio",
          mode: "talkback",
          autoAccept: false,
        },
        () => {},
      ),
    ).resolves.toBeUndefined();
  });

  it("parses endpoint without type prefix as whatsapp", async () => {
    const lines: string[] = [];
    await simulateIncomingAction(
      { from: "+15550001234", media: "audio", mode: "talkback", autoAccept: true },
      (msg) => lines.push(msg),
    );
    expect(lines.some((l) => l.includes("+15550001234"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dial action
// ---------------------------------------------------------------------------

describe("dial action", () => {
  it("runs to completion (no error)", async () => {
    await expect(
      dialAction(
        {
          to: "whatsapp:+15550009999",
          media: "audio",
          mode: "full-duplex",
        },
        () => {},
      ),
    ).resolves.toBeUndefined();
  });

  it("emits state lifecycle log lines", async () => {
    const lines: string[] = [];
    await dialAction({ to: "whatsapp:+15550009999", media: "audio", mode: "full-duplex" }, (msg) =>
      lines.push(msg),
    );
    expect(lines.some((l) => l.includes("ringing"))).toBe(true);
    expect(lines.some((l) => l.includes("ended"))).toBe(true);
  });

  it("logs the dialled endpoint", async () => {
    const lines: string[] = [];
    await dialAction({ to: "sip:user@example.com", media: "audio", mode: "talkback" }, (msg) =>
      lines.push(msg),
    );
    expect(lines.some((l) => l.includes("user@example.com"))).toBe(true);
  });
});
