# @openclaw/voice-sdk

Provider-agnostic, media-rich, agent-first call SDK for [OpenClaw](https://github.com/openclaw/openclaw).

> **Note on the name:** "Voice" is used in the telecom tradition (SIP, VoIP, Moho) — this SDK covers **audio, video, screen sharing, and data channels**. Any real-time media flowing over a call session is in scope.

[![npm version](https://img.shields.io/npm/v/@openclaw/voice-sdk)](https://www.npmjs.com/package/@openclaw/voice-sdk)
[![license](https://img.shields.io/npm/l/@openclaw/voice-sdk)](./LICENSE)

## Overview

`@openclaw/voice-sdk` is the missing `Call` abstraction layer for OpenClaw. It defines a shared contract that all channel providers (WhatsApp, Twilio, Discord, WebRTC) implement and that AI agents consume via a standardised `AgentBridge`. Inspired by [Voxeo Moho](https://github.com/voxeolabs/moho).

**Key concepts:**

| Concept                 | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `VoiceProvider`         | Channel-specific factory; creates and manages `Call` instances            |
| `Call`                  | Full lifecycle (ringing → connected → ended), media streams, text channel |
| `AgentBridge`           | Pluggable STT/TTS bridge attached to every `Call` for AI agents           |
| `WhatsAppVoiceProvider` | Reference implementation; uses a shared WASocket via DI                   |
| `MockVoiceProvider`     | Deterministic test harness — no real network required                     |

## Install

```bash
pnpm add @openclaw/voice-sdk
```

Requires **Node.js ≥ 22**.

## Quick Start

### Simulate an incoming call (testing)

```ts
import { MockVoiceProvider } from "@openclaw/voice-sdk/providers/mock";

const provider = new MockVoiceProvider();

provider.onCall(async (call) => {
  console.log("Incoming from", call.endpoint.id);
  await call.accept({ mediaTypes: ["audio"] });

  const bridge = call.getAgentBridge();
  bridge.onVoiceInput((transcript) => {
    console.log("User said:", transcript);
    void bridge.injectTTS(`You said: ${transcript}`);
  });
});

// Simulate an inbound call in tests:
const call = provider.triggerIncoming({ type: "whatsapp", id: "+15550001234" });
provider.simulateVoiceInput(call.id, "hello world");
```

### Connect to WhatsApp (production)

```ts
import { WhatsAppVoiceProvider } from "@openclaw/voice-sdk/providers/whatsapp";
import type { WhatsAppConnectionManager } from "@openclaw/voice-sdk/providers/whatsapp";

// Your WhatsApp extension implements WhatsAppConnectionManager:
declare const manager: WhatsAppConnectionManager;

const provider = new WhatsAppVoiceProvider(manager); // registers once — no new socket

provider.onCall(async (call) => {
  await call.accept();
  const bridge = call.getAgentBridge();
  bridge.setSTTProvider(mySTT);
  bridge.setTTSProvider(myTTS);
  bridge.onVoiceInput(async (transcript) => {
    const reply = await myLLM.complete(transcript);
    await bridge.injectTTS(reply);
  });
});
```

## API Reference

### `VoiceProvider`

```ts
interface VoiceProvider {
  readonly name: string;
  readonly supportedMedia: readonly MediaType[];
  createCall(endpoint: Endpoint, options?: CallOptions): Promise<Call>;
  joinGroupCall(groupId: string, options?: CallOptions): Promise<Call>;
  setConnectionManager?(manager: unknown): void;
}
```

### `Call`

```ts
interface Call extends EventEmitter {
  readonly id: string;
  readonly provider: string;
  readonly endpoint: Endpoint;
  readonly state: CallState; // 'initialized' | 'ringing' | 'connecting' | 'connected' | 'held' | 'ended' | 'failed'
  readonly mode: CallMode; // 'listen-only' | 'talkback' | 'full-duplex'
  readonly activeMedia: ReadonlySet<MediaType>;

  // Control
  accept(options?: { mediaTypes?: MediaType[] }): Promise<void>;
  reject(reason?: string): Promise<void>;
  hangup(reason?: string): Promise<void>;
  upgradeMode(newMode: CallMode): Promise<void>;
  upgradeMedia(newMedia: MediaType[]): Promise<void>;

  // Media  (Node-native, no DOM dependency)
  getMediaStream(type: MediaType): MediaSource | null; // MediaSource = AsyncIterable<Buffer>
  sendMedia(data: MediaSource, type: MediaType): Promise<void>;

  // Text channel
  sendText(message: string, options?: { mentions?: string[] }): Promise<void>;
  onText(callback: (msg: CallTextMessage) => void): void;

  // Agent
  getAgentBridge(): AgentBridge;

  // Typed events
  on(event: "state", listener: (state: CallState) => void): this;
  on(event: "media", listener: (type: MediaType, active: boolean) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "text", listener: (msg: CallTextMessage) => void): this;
}
```

### `AgentBridge`

```ts
interface AgentBridge {
  onVoiceInput(
    callback: (transcript: string, confidence: number, metadata?: unknown) => void,
  ): void;
  injectTTS(text: string, options?: TTSOptions): Promise<void>;
  injectAudio(stream: MediaSource): Promise<void>;
  setSTTProvider(provider: STTProvider): void;
  setTTSProvider(provider: TTSProvider): void;
}
```

### `CallError`

```ts
class CallError extends Error {
  readonly code: "timeout" | "rejected" | "media-failure" | "unauthorized" | "group-full";

  static timeout(message?: string): CallError;
  static rejected(message?: string): CallError;
  static mediaFailure(message?: string): CallError;
  static unauthorized(message?: string): CallError;
  static groupFull(message?: string): CallError;
}
```

### `CallOptions`

```ts
type CallOptions = {
  mediaTypes: MediaType[]; // Which media to activate
  mode: CallMode; // Participation mode
  quality?: "low" | "standard" | "hd";
  autoJoin?: boolean;
  record?: boolean;
  retryPolicy?: RetryPolicy; // { maxAttempts, backoffMs }
};
```

## WhatsApp Provider Guide

The `WhatsAppVoiceProvider` implements `VoiceProvider` and wraps a `WhatsAppConnectionManager` — the interface your WhatsApp extension must implement.

**Single-socket contract:** constructing `WhatsAppVoiceProvider(manager)` calls `manager.registerVoiceProvider(this)` exactly once. No second WASocket is opened.

```ts
// packages/whatsapp-extension/src/connection-manager.ts
import type { WhatsAppConnectionManager } from "@openclaw/voice-sdk/providers/whatsapp";

export class WaBaileysManager implements WhatsAppConnectionManager {
  constructor(private socket: WASocket) {
    socket.ev.on("call", (events) => {
      /* ... */
    });
  }
  registerVoiceProvider(provider) {
    /* ... */
  }
  answerCall(callId, opts) {
    return this.socket.rejectCall(callId, 0); /* answer */
  }
  // ...
}
```

## Testing Guide

Use `MockVoiceProvider` for all agent/call logic tests. No network required.

```ts
import { MockVoiceProvider } from "@openclaw/voice-sdk/providers/mock";
import { vi } from "vitest";

const provider = new MockVoiceProvider();
const call = provider.triggerIncoming({ type: "whatsapp", id: "+1234" });
await call.accept();

// Simulate speech and assert TTS was called
const ttsSpy = vi.fn((_text: string) =>
  (async function* () {
    yield Buffer.from("tts");
  })(),
);
call.getAgentBridge().setTTSProvider({ synthesize: ttsSpy });

provider.simulateVoiceInput(call.id, "book me a flight");
await new Promise((r) => setImmediate(r)); // flush async callbacks

expect(ttsSpy).toHaveBeenCalledWith(expect.stringContaining("flight"), undefined);
```

Key `MockVoiceProvider` methods:

| Method                                                | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `triggerIncoming(endpoint, opts?)`                    | Simulate an inbound call (fires `onCall` handlers) |
| `simulateStateChange(callId, state)`                  | Force a call into any state                        |
| `simulateVoiceInput(callId, transcript, confidence?)` | Deliver a transcript to `AgentBridge.onVoiceInput` |

## CLI Developer Harness

```bash
# Simulate an inbound call lifecycle in your terminal:
npx openclaw-voice simulate-incoming --from whatsapp:+15550001234 --auto-accept

# Dial an outbound call:
npx openclaw-voice dial --to whatsapp:+15550001234

# Full options:
npx openclaw-voice --help
```

## Development

```bash
task          # list all tasks
task build    # compile with tsdown
task test     # run vitest
task check    # full quality gate (lint + fmt + typecheck + build + test)
task release  # dry-run npm publish (add LIVE=true to actually publish)
```

## Contributing

1. Fork and branch from `main`
2. Run `task check` before every commit
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
4. Open a PR — the `.github/PULL_REQUEST_TEMPLATE.md` checklist applies

## License

MIT — see [LICENSE](./LICENSE)
