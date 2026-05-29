# @openclaw/voice-sdk

Provider-agnostic, media-rich, agent-first call SDK for [OpenClaw](https://github.com/openclaw/openclaw).

> **Note on the name:** "Voice" is used in the telecom tradition (SIP, VoIP, Moho) — this SDK covers **audio, video, screen sharing, and data channels**. Any real-time media flowing over a call session is in scope.

[![npm version](https://img.shields.io/npm/v/@openclaw/voice-sdk)](https://www.npmjs.com/package/@openclaw/voice-sdk)
[![license](https://img.shields.io/npm/l/@openclaw/voice-sdk)](./LICENSE)

## Overview

`@openclaw/voice-sdk` defines one `Call` abstraction for real-time communication across transports. Providers such as WhatsApp, SIP, Google Meet, Discord, or WebRTC implement `VoiceProvider`; agents interact with the same `Call` and `AgentBridge` regardless of the transport.

This repository also includes [`voice-sdk.md`](./voice-sdk.md), an early proposal document for API naming, scope, and OpenClaw integration. The README reflects the currently implemented TypeScript interfaces.

**Key concepts:**

| Concept | Description |
| --- | --- |
| `VoiceProvider` | Transport factory for dialing or joining calls |
| `Call` | Stateful real-time session with lifecycle, media, text, telephony controls, and participant signals |
| `AgentBridge` | Agent-facing bridge for STT, TTS, text, and future vision integration |
| `MediaSource` | Node-native `AsyncIterable<Buffer>` media stream; no DOM dependency in core |
| `WhatsAppVoiceProvider` | Reference provider using an injected `WhatsAppConnectionManager` |
| `MockVoiceProvider` | Deterministic in-memory provider for tests and local agent logic |

## Install

```bash
pnpm add @openclaw/voice-sdk
```

Requires **Node.js ≥ 22**.

## Quick Start

### Test an agent with `MockVoiceProvider`

```ts
import { MockVoiceProvider } from "@openclaw/voice-sdk/providers/mock";

const provider = new MockVoiceProvider();
const call = provider.ring({ type: "whatsapp", id: "+15550001234" });

console.log("Incoming from", call.endpoint.id);

await call.accept({ mediaTypes: ["audio"] });

call.agent.onHeard(async (transcript) => {
  console.log("User said:", transcript);
  await call.agent.say(`You said: ${transcript}`);
});

provider.speak(call.id, "hello world");
```

### Dial or join with a provider

```ts
const outbound = await provider.dial(
  { type: "phone", id: "+15550001234" },
  { mediaTypes: ["audio"], mode: "full-duplex" },
);

outbound.on("state", (state) => {
  console.log("call state:", state);
});

const meeting = await provider.join("group-or-room-id", {
  mediaTypes: ["audio"],
  mode: "listen-only",
});

meeting.on("state", async (state) => {
  if (state !== "connected") return;

  await meeting.mode("talkback");
  await meeting.agent.say("I can summarize what I heard.");
  await meeting.mode("listen-only");
});
```

### Connect to WhatsApp

```ts
import { WhatsAppVoiceProvider } from "@openclaw/voice-sdk/providers/whatsapp";
import type { WhatsAppConnectionManager } from "@openclaw/voice-sdk/providers/whatsapp";

// Your WhatsApp extension owns the underlying WASocket and implements this.
declare const manager: WhatsAppConnectionManager;

const provider = new WhatsAppVoiceProvider(manager);

provider.onCall(async (call) => {
  await call.accept({ mediaTypes: ["audio"] });

  call.agent.ear(mySTT);
  call.agent.mouth(myTTS);

  call.agent.onHeard(async (transcript) => {
    const reply = await myLLM.complete(transcript);
    await call.agent.say(reply);
  });
});
```

## API Reference

### Core types

| Type | Values / Shape |
| --- | --- |
| `MediaType` | `"audio"`, `"video"`, `"screen"`, `"data"` |
| `CallState` | `"initialized"`, `"ringing"`, `"connecting"`, `"connected"`, `"held"`, `"ended"`, `"failed"` |
| `CallMode` | `"listen-only"`, `"talkback"`, `"full-duplex"` |
| `CallDirection` | `"inbound"`, `"outbound"` |
| `DtmfTone` | `"0"`–`"9"`, `"*"`, `"#"`, `"A"`–`"D"` |
| `MediaSource` | `AsyncIterable<Buffer>` |
| `Endpoint` | `{ type: EndpointType; id: string; metadata?: Record<string, unknown> }` |
| `Participant` | `{ id; name?; endpoint; muted; hasVideo }` |

### `VoiceProvider`

```ts
interface VoiceProvider {
  readonly name: string;
  readonly supportedMedia: readonly MediaType[];

  dial(endpoint: Endpoint, options?: CallOptions): Promise<Call>;
  join(groupId: string, options?: CallOptions): Promise<Call>;
  connect?(manager: unknown): void;
}
```

`VoiceProvider` is the transport abstraction. A provider starts outbound calls with `dial()` and joins group calls or meetings with `join()`. Provider implementations may expose additional subscription methods for inbound calls, such as `onCall()` on the mock and WhatsApp providers.

### `Call`

```ts
interface Call extends EventEmitter {
  readonly id: string;
  readonly provider: string;
  readonly endpoint: Endpoint;
  readonly state: CallState;
  readonly direction: CallDirection;
  readonly duration: number;
  readonly participants: ReadonlyArray<Participant>;
  readonly agent: AgentBridge;

  accept(options?: { mediaTypes?: MediaType[] }): Promise<void>;
  reject(reason?: string): Promise<void>;
  hangup(reason?: string): Promise<void>;

  hold(): Promise<void>;
  resume(): Promise<void>;
  mute(type: MediaType): Promise<void>;
  unmute(type: MediaType): Promise<void>;
  muted(): ReadonlySet<MediaType>;
  transfer(endpoint: Endpoint): Promise<void>;
  dtmf(tone: DtmfTone): Promise<void>;
  onDTMF(callback: (tone: DtmfTone) => void): void;

  mode(): CallMode;
  mode(newMode: CallMode): Promise<void>;
  channels(): ReadonlySet<MediaType>;
  channels(newMedia: MediaType[]): Promise<void>;

  receive(type: MediaType): MediaSource | null;
  send(data: MediaSource, type: MediaType): Promise<void>;
  onAudio(callback: (stream: MediaSource) => void): void;
  onVideo(callback: (stream: MediaSource) => void): void;

  text(message: string, options?: { mentions?: string[] }): Promise<void>;
  onText(callback: (msg: CallTextMessage) => void): void;

  onJoin(callback: (participant: Participant) => void): void;
  onLeave(callback: (participant: Participant, reason?: string) => void): void;
  onSpeaking(callback: (participant: Participant, isSpeaking: boolean) => void): void;
  raise(): Promise<void>;
  lower(): Promise<void>;
}
```

Lifecycle transitions are:

```text
initialized → ringing → connecting → connected ↔ held → ended
                                                       → failed
```

`mode()` controls transmit behavior. `channels()` controls which media types are active. For example, an agent can start in `listen-only`, upgrade to `talkback` when summoned, and add a video channel later with `channels(["audio", "video"])`.

### `AgentBridge`

```ts
interface AgentBridge {
  onHeard(callback: (transcript: string, confidence: number, metadata?: unknown) => void): void;
  say(text: string, options?: TTSOptions): Promise<void>;

  ear(): STTProvider | undefined;
  ear(provider: STTProvider): void;

  mouth(): TTSProvider | undefined;
  mouth(provider: TTSProvider): void;

  eyes(): VisionProvider | undefined;
  eyes(provider: VisionProvider): void;

  onSeen(callback: (description: string, timestamp: number) => void): void;
  onRead(callback: (msg: CallTextMessage) => void): void;
}
```

`AgentBridge` is attached as `call.agent`. It gives agents consistent senses and outputs:

| Method | Purpose |
| --- | --- |
| `ear(stt)` | Set speech-to-text provider |
| `onHeard(cb)` | Receive speech transcripts |
| `mouth(tts)` | Set text-to-speech provider |
| `say(text)` | Speak into the call |
| `eyes(vision)` | Set future video/vision provider |
| `onRead(cb)` | Receive in-call text messages |

### Provider interfaces

```ts
interface STTProvider {
  transcribe(audio: MediaSource): AsyncIterable<{
    transcript: string;
    confidence: number;
    isFinal: boolean;
  }>;
}

interface TTSProvider {
  synthesize(text: string, options?: TTSOptions): MediaSource;
}

interface VisionProvider {
  describe(frames: AsyncIterable<{ frame: Buffer; timestamp: number }>): AsyncIterable<{
    description: string;
    timestamp: number;
  }>;
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
  mediaTypes: MediaType[];
  mode: CallMode;
  quality?: "low" | "standard" | "hd";
  autoJoin?: boolean;
  record?: boolean;
  retryPolicy?: RetryPolicy;
};
```

## Telephony and meeting controls

The `Call` interface includes controls needed by PSTN, SIP, WebRTC, and meeting-style providers:

| Capability | API |
| --- | --- |
| Hold/resume | `hold()`, `resume()` |
| Mute/unmute local media | `mute(type)`, `unmute(type)`, `muted()` |
| Blind transfer | `transfer(endpoint)` |
| IVR / touch-tone navigation | `dtmf(tone)`, `onDTMF(cb)` |
| Meeting participation | `mode()`, `raise()`, `lower()` |
| Participants | `participants`, `onJoin()`, `onLeave()`, `onSpeaking()` |
| Reactive media | `onAudio()`, `onVideo()` |

Example IVR navigation:

```ts
await call.dtmf("1"); // press 1 for sales
call.onDTMF((tone) => {
  console.log("remote pressed:", tone);
});
```

Example human escalation:

```ts
call.agent.onHeard(async (text) => {
  if (sentiment.isAngry(text)) {
    await call.agent.say("Let me transfer you to a specialist.");
    await call.transfer({ type: "sip", id: "support@example.com" });
  }
});
```

## WhatsApp Provider Guide

`WhatsAppVoiceProvider` implements `VoiceProvider` and wraps a `WhatsAppConnectionManager` supplied by the OpenClaw WhatsApp extension.

The connection manager owns the underlying WASocket. The SDK does not import Baileys or open a second socket.

```ts
import type { VoiceProvider } from "@openclaw/voice-sdk";
import type {
  WhatsAppCallEvent,
  WhatsAppCallStateEvent,
  WhatsAppConnectionManager,
} from "@openclaw/voice-sdk/providers/whatsapp";

class WaBaileysManager implements WhatsAppConnectionManager {
  register(provider: VoiceProvider): void {
    // Route existing socket events to this provider.
  }

  onCall(cb: (event: WhatsAppCallEvent) => void): void {
    // Subscribe cb to WASocket call events.
  }

  onState(cb: (event: WhatsAppCallStateEvent) => void): void {
    // Subscribe cb to call state changes.
  }

  async answer(callId: string, opts?: { video?: boolean }): Promise<void> {}
  async reject(callId: string, reason?: string): Promise<void> {}
  async end(callId: string): Promise<void> {}
  async join(groupJid: string, opts?: { video?: boolean }): Promise<void> {}
  async send(callId: string, chunk: Buffer): Promise<void> {}
}
```

## Testing Guide

Use `MockVoiceProvider` for agent and call-logic tests. No network is required.

```ts
import { MockVoiceProvider } from "@openclaw/voice-sdk/providers/mock";
import { expect, vi } from "vitest";

const provider = new MockVoiceProvider();
const call = provider.ring({ type: "whatsapp", id: "+1234" });

await call.accept({ mediaTypes: ["audio"] });

const ttsSpy = vi.fn((_text: string) =>
  (async function* () {
    yield Buffer.from("tts");
  })(),
);

call.agent.mouth({ synthesize: ttsSpy });
call.agent.onHeard(async (transcript) => {
  await call.agent.say(`You said: ${transcript}`);
});

provider.speak(call.id, "book me a flight");
await new Promise((resolve) => setImmediate(resolve));

expect(ttsSpy).toHaveBeenCalledWith("You said: book me a flight", undefined);
expect(call.sent()).toHaveLength(1);
```

Useful `MockVoiceProvider` helpers:

| Method | Purpose |
| --- | --- |
| `ring(endpoint, opts?)` | Simulate an inbound call and fire `onCall` handlers |
| `dial(endpoint, opts?)` | Create an outbound mock call |
| `join(groupId, opts?)` | Create a mock group/meeting call |
| `setState(callId, state)` | Force a lifecycle state |
| `speak(callId, transcript, confidence?)` | Fire `call.agent.onHeard()` callbacks |
| `triggerJoin(callId, participant)` | Add a participant and fire `onJoin()` |
| `triggerLeave(callId, participantId, reason?)` | Remove a participant and fire `onLeave()` |
| `triggerSpeaking(callId, participantId, isSpeaking)` | Fire `onSpeaking()` |

`MockCall` also records outbound media and DTMF for assertions via helper methods such as `sent()` and `sentDTMF()`.

## CLI Developer Harness

```bash
# Simulate an inbound call lifecycle in your terminal:
npx openclaw-voice simulate-incoming --from whatsapp:+15550001234 --auto-accept

# Dial an outbound call:
npx openclaw-voice dial --to whatsapp:+15550001234

# Full options:
npx openclaw-voice --help
```

## Current status

Implemented today:

- Core types and interfaces
- `Call` lifecycle, media, text, control, DTMF, participant, and meeting-signal surface
- `AgentBridge` with STT/TTS provider hooks and future vision hooks
- `MockVoiceProvider` and `MockCall`
- `WhatsAppVoiceProvider` and `WhatsAppConnectionManager` integration contract
- CLI developer harness

Pending or provider-specific:

- Google Meet provider package
- Media fan-out / multicast queue for multiple independent consumers
- Automatic STT wiring from `call.agent.ear(stt)` to call audio
- VAD / turn detection
- Chat context and interruption handling
- Provider-native implementations for hold, transfer, and DTMF where the transport supports them

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
