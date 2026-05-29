# @openclaw/voice-sdk

> ⚠️ **VERY EARLY DRAFT — DO NOT TREAT AS FINAL** ⚠️
>
> This document is a rough sketch. The API names, object model, and scope are all provisional and actively under discussion. Nothing here is committed. We are sharing early to get feedback before writing more code — please push back on anything that feels wrong.

---

## TL;DR

`@openclaw/voice-sdk` is a provider-agnostic TypeScript SDK that gives OpenClaw agents a single, clean API for real-time calls — whether the call comes from WhatsApp, Google Meet, a SIP trunk, or any future transport. The SDK is in active development; this document is a design proposal and we are actively looking for feedback on the API shape, naming, and scope before we commit to v1.

---

## Problem

OpenClaw handles dozens of messaging channels uniformly. Real-time calls are different today — each transport (WhatsApp calling, the in-progress Google Meet integration, Twilio voice) has its own ad-hoc wiring. There is no shared call lifecycle, no standard way for an agent to receive audio, speak back, or know who is in the room. Every new transport requires reinventing the same patterns.

Specifically:
- No shared `Call` abstraction — each provider reimplements lifecycle management
- No standard `AgentBridge` — STT/TTS providers are wired differently (or not at all) per transport
- No participant awareness — agents cannot see who joined, left, or is speaking
- The Google Meet preflight work (`feat/googlemeet-audio-ingest`) lands OAuth and meeting resolution but deliberately stops short of audio capture — there is nowhere clean to plug that in yet

---

## Solution

A single `Call` object that every transport implements. A single `AgentBridge` every agent consumes. The transport is a plugin; everything above it is shared.

```
VoiceProvider (WhatsApp / Google Meet / SIP / Discord / …)
    └── Call (accept / reject / hangup / hold / mute / transfer / dtmf / …)
            └── AgentBridge (ear / mouth / eyes → onHeard / onSeen / say)
```

The name "voice" follows the telecom tradition — it covers **audio, video, screen, and data** channels. Any real-time media flowing over a call is in scope.

---

## How It Fits Into OpenClaw

OpenClaw already has:
- `voice-call` extension — Twilio/Telnyx/Plivo PSTN calls, webhook-driven
- `realtime-voice` — STT/TTS AI speech provider registry
- `talk-voice` extension — TTS voice selection for the Talk feature

None of these share an abstraction. `@openclaw/voice-sdk` is the missing shared layer:

```
OpenClaw plugin-sdk
    ↓ (VoiceProvider registered like any other capability provider)
@openclaw/voice-sdk
    ↓ (Call + AgentBridge)
WhatsApp extension     Google Meet plugin     voice-call extension
```

The `realtime-voice` registry maps directly: `STTProvider` and `TTSProvider` in the SDK are the equivalent of `RealtimeVoiceBridge` callbacks — a thin adapter bridges them with no changes to either.

---

## How It Works With the Google Meet Work

Vincent Koc and Peter Steinberger's `feat/googlemeet-audio-ingest` branch is the **control plane** for Google Meet. The SDK is the **call abstraction layer** above it. They plug together without overlap:

```
feat/googlemeet-audio-ingest (exists today)       @openclaw/voice-sdk (exists today)
───────────────────────────────────────           ────────────────────────────────────
OAuth login + token refresh                  →    GoogleMeetConnectionManager
Space resolution (URL → spaces/id)           →    .join(meetingUrl)
Preflight checks (preview enrollment)        →    call.accept()
Meet Media API audio (pending)               →    MediaStreamQueue → call.receive('audio')
                                                  call.agent.ear(stt) → onHeard(transcript)
                                                  call.agent.say(reply)
```

The branch's `fetchGoogleMeetSpace` and `resolveGoogleMeetAccessToken` functions slot directly into a `GoogleMeetConnectionManager` implementation. Once the Meet Media API WebRTC audio surface is accessible, each audio chunk pushes into a `MediaStreamQueue`, which satisfies `MediaSource = AsyncIterable<Buffer>`, and the full agent pipeline works without changes to the SDK core.

---

## API Reference

### Core Types

| Type | Values / Shape |
|---|---|
| `MediaType` | `'audio' \| 'video' \| 'screen' \| 'data'` |
| `CallState` | `'initialized' \| 'ringing' \| 'connecting' \| 'connected' \| 'held' \| 'ended' \| 'failed'` |
| `CallMode` | `'listen-only' \| 'talkback' \| 'full-duplex'` |
| `CallDirection` | `'inbound' \| 'outbound'` |
| `DtmfTone` | `'0'–'9' \| '*' \| '#' \| 'A'–'D'` |
| `MediaSource` | `AsyncIterable<Buffer>` — Node-native, zero DOM dependency |
| `Endpoint` | `{ type: EndpointType; id: string; metadata? }` |
| `Participant` | `{ id: string; name?; endpoint: Endpoint; muted: boolean; hasVideo: boolean }` |

---

### VoiceProvider

The factory. One implementation per transport (WhatsApp, Google Meet, Twilio, …).

| Method | Description |
|---|---|
| `dial(endpoint, opts?)` | Initiate an outbound call → `Call` |
| `join(groupId, opts?)` | Join an existing meeting or group call → `Call` |
| `onCall(call => { })` | Register a handler for inbound calls |
| `connect?(manager)` | Inject a shared connection (e.g. WASocket, OAuth manager) |

---

### Call

The session. Every transport implements this same interface.

**Identity**

| Property / Method | Description |
|---|---|
| `id` | Unique call identifier |
| `provider` | Transport name (`'whatsapp'`, `'google-meet'`, …) |
| `endpoint` | Remote party |
| `direction` | `'inbound'` or `'outbound'` |
| `duration` | Milliseconds since connected (0 if not yet connected) |
| `state` | Current `CallState` |

**Lifecycle**

| Method | Description |
|---|---|
| `accept(opts?)` | Answer an inbound call |
| `reject(reason?)` | Decline before answering |
| `hangup(reason?)` | End an active call |
| `hold()` | Pause — transitions to `held` |
| `resume()` | Unpause — returns to `connected` |

**Participation**

Both `mode` and `channels` are getter/setter overloads — call with no argument to read, with an argument to write.

`mode` controls **how you transmit** on an active call:

| Method | Description |
|---|---|
| `mode()` | Returns current `CallMode` — one of `'listen-only'`, `'talkback'`, or `'full-duplex'` |
| `mode('listen-only')` | Receive audio/video but send nothing (observer / lurker) |
| `mode('talkback')` | Receive, and transmit only when explicitly invited — push-to-talk style, useful for large group calls |
| `mode('full-duplex')` | Normal two-way — always transmitting and receiving |

Note: `mode` is about transmit *permission/behaviour*, not muting. `mute('audio')` silences your mic on an already full-duplex call without changing the mode.

`channels` controls **which media types are active** on the call:

| Method | Description |
|---|---|
| `channels()` | Returns `ReadonlySet<MediaType>` of currently active channels, e.g. `Set { 'audio' }` |
| `channels(['audio', 'video'])` | Opens or negotiates the listed channels — e.g. upgrade an audio-only call to include video mid-call |

For example: `accept({ mediaTypes: ['audio'] })` starts an audio-only call. Later, `channels(['audio', 'video'])` adds video without re-answering. `channels()` at any point tells you what is actually live.

**Media**

| Method | Description |
|---|---|
| `receive(type)` | Get inbound stream → `AsyncIterable<Buffer> \| null` |
| `send(stream, type)` | Send outbound media |
| `mute(type)` | Silence a channel (channel stays active) |
| `unmute(type)` | Un-silence |
| `muted()` | Current `ReadonlySet<MediaType>` of muted channels |
| `onAudio(stream => { })` | Fires when audio channel activates; delivers a fresh stream |
| `onVideo(stream => { })` | Fires when video channel activates; delivers a fresh stream |

**Text**

| Method | Description |
|---|---|
| `text(msg, opts?)` | Send a text message in the call's text channel |
| `onText(msg => { })` | Receive text messages |

**Telephony**

| Method | Description |
|---|---|
| `transfer(endpoint)` | Blind transfer — route remote party to new destination |
| `dtmf(tone)` | Send a DTMF tone (IVR navigation) |
| `onDTMF(tone => { })` | Receive DTMF tones from remote party |

**Meeting signals**

| Property / Method | Description |
|---|---|
| `participants` | `ReadonlyArray<Participant>` — current remote participants |
| `onJoin(p => { })` | Fires when someone joins |
| `onLeave((p, reason?) => { })` | Fires when someone leaves |
| `onSpeaking((p, isSpeaking) => { })` | Active speaker changes |
| `raise()` | Raise hand |
| `lower()` | Lower hand |

**Agent**

| Property | Description |
|---|---|
| `agent` | The `AgentBridge` attached to this call |

---

### AgentBridge

The AI layer. One per call. Access via `call.agent`.

**Senses — getter/setter overloads**

| Method | Description |
|---|---|
| `ear()` | Get current `STTProvider \| undefined` |
| `ear(provider)` | Set STT provider; auto-wires `call.receive('audio')` → `onHeard` *(auto-wiring pending)* |
| `mouth()` | Get current `TTSProvider \| undefined` |
| `mouth(provider)` | Set TTS provider; affects subsequent `say()` calls |
| `eyes()` | Get current `VisionProvider \| undefined` *(future)* |
| `eyes(provider)` | Set vision provider; auto-wires video → `onSeen` *(future)* |

**Perception callbacks**

| Method | Description |
|---|---|
| `onHeard(cb)` | Fires when STT produces a transcript: `(text, confidence) => void` |
| `onSeen(cb)` | Fires when vision model produces a description *(future)* |
| `onRead(msg => { })` | Inbound text messages — auto-wired from `call.onText` |

**Output**

| Method | Description |
|---|---|
| `say(text, opts?)` | Synthesise via `mouth` provider and inject into call audio |

---

### Provider interfaces

| Interface | Key method |
|---|---|
| `STTProvider` | `transcribe(audio: MediaSource)` → `AsyncIterable<{ transcript, confidence, isFinal }>` |
| `TTSProvider` | `synthesize(text, opts?)` → `MediaSource` |
| `VisionProvider` | `describe(frames)` → `AsyncIterable<{ description, timestamp }>` *(future)* |

---

### MockVoiceProvider — test helpers

| Method | Description |
|---|---|
| `ring(endpoint)` | Simulate an inbound call; returns `MockCall` |
| `speak(callId, text, confidence?)` | Fire `onHeard` callbacks |
| `setState(callId, state)` | Force a state transition |
| `triggerJoin(callId, participant)` | Add participant; fires `onJoin` |
| `triggerLeave(callId, id, reason?)` | Remove participant; fires `onLeave` |
| `triggerSpeaking(callId, id, isSpeaking)` | Fire `onSpeaking` |
| `call.sent()` | Recorded outbound media chunks |
| `call.sentDTMF()` | Recorded sent DTMF tones |
| `call._simulateDTMF(tone)` | Deliver an inbound DTMF tone to `onDTMF` callbacks |

---

## Key Concepts

**Call is the unit of abstraction.** Not the transport, not the room, not the stream — the call. The transport is a plugin.

**Sensory organ model.** The AgentBridge exposes `ear` (STT), `mouth` (TTS), and `eyes` (vision, future). These are pluggable at runtime and mirror how agents perceive and speak in the world.

**`MediaSource = AsyncIterable<Buffer>`.** Audio and video are Node-native async iterables. No DOM, no WebRTC browser dependencies in core. Composable with standard async generators.

**`MediaStreamQueue`.** A push-based `AsyncIterable<Buffer>` that bridges callback-style transport events (WASocket audio chunks, Meet Media API frames) into the SDK's pull-based stream model.

**Tee / fan-out.** `call.receive('audio')` returns a fresh independent stream per caller. The bridge's `ear` and a custom consumer can both read audio simultaneously without competing. *(Pending: `media-pipeline` scope.)*

**`onAudio` / `onVideo` are reactive stream subscriptions.** They fire when a channel activates, delivering a `MediaSource` — equivalent to WebRTC's `ontrack`. Multiple subscribers each get an independent stream once fan-out lands.

**Direction + participants.** Every call knows if it was inbound or outbound, and group calls expose a live participant list with join/leave/speaking events — the minimum an agent needs to be a good meeting citizen.

---

## Examples

### Inbound WhatsApp call

```ts
const provider = new WhatsAppVoiceProvider(connectionManager);

provider.onCall(async (call) => {
  await call.accept({ mediaTypes: ['audio'] });

  call.agent.ear(deepgram);
  call.agent.mouth(elevenlabs);

  call.agent.onHeard(async (text) => {
    const reply = await llm.complete(text);
    await call.agent.say(reply);
  });
});
```

### Join a Google Meet (agent listens, then speaks when summoned)

```ts
const call = await provider.join('meet.google.com/abc-defg-hij', {
  mediaTypes: ['audio'],
  mode: 'listen-only',
});

const transcript: string[] = [];
call.agent.ear(mySTT);
call.agent.onHeard((text) => transcript.push(text));

call.onText(async (msg) => {
  if (msg.text.includes('@agent')) {
    await call.mode('talkback');
    const summary = await llm.summarize(transcript.join(' '));
    await call.agent.say(summary);
    await call.mode('listen-only');
  }
});
```

### Escalate to a human agent

```ts
call.agent.onHeard(async (text) => {
  if (sentiment.isAngry(text)) {
    await call.agent.say('Let me transfer you to a specialist.');
    await call.transfer({ type: 'sip', id: 'support@example.com' });
  }
});
```

### IVR navigation

```ts
await call.dtmf('1');   // press 1 for sales
call.onDTMF((tone) => {
  console.log('remote pressed:', tone);
});
```

### Testing without a real network

```ts
const provider = new MockVoiceProvider();
const call = provider.ring({ type: 'whatsapp', id: '+1234' });
await call.accept();

call.agent.mouth({ synthesize: vi.fn(() => audioStream) });
call.agent.onHeard(async (t) => call.agent.say(`You said: ${t}`));

provider.speak(call.id, 'book me a flight');
await new Promise((r) => setImmediate(r));

expect(call.sent()).toHaveLength(1);
```

---

## Summary

`@openclaw/voice-sdk` gives OpenClaw agents a single, clean, testable API for real-time calls across any transport. The transport is a plugin. The agent always sees the same `Call` object with the same lifecycle, media access, participant awareness, and `AgentBridge`. The Google Meet audio work has a clean home to land in. The existing `realtime-voice` providers adapt with a thin wrapper.

What we have today: WhatsApp provider, mock provider, full agent bridge, CLI harness, 161 tests, 95%+ coverage. What is missing before production use: fan-out tee, `bridge.ear` auto-wiring, VAD/turn detection, chat context, interruption handling.

---

## Next Steps — Phased Implementation

### Google Meet

| Phase | What | Prerequisite |
|---|---|---|
| **GM-1** (exists) | OAuth, token refresh, space resolution, preflight | `feat/googlemeet-audio-ingest` |
| **GM-2** | `GoogleMeetConnectionManager` wraps GM-1 utilities | GM-1 merged |
| **GM-3** | `GoogleMeetCall` + `MediaStreamQueue` wired to Meet Media API WebRTC | GM-2 + Meet Media API access |
| **GM-4** | `GoogleMeetVoiceProvider.join(meetUrl)` → `GoogleMeetCall` in `connecting` | GM-3 |
| **GM-5** | `bridge.ear` auto-wiring + fan-out tee (`media-pipeline` scope) | GM-4 |
| **GM-6** | Participant list from Meet roster API | GM-4 |

GM-1 is the only prerequisite outside this SDK. GM-2 through GM-4 can be a single `@openclaw/google-meet-provider` package with no changes to SDK core.

### WhatsApp

| Phase | What | Status |
|---|---|---|
| **WA-1** | `WhatsAppConnectionManager` interface | ✅ done |
| **WA-2** | `WhatsAppCall` + `MediaStreamQueue` + `WhatsAppVoiceProvider` | ✅ done |
| **WA-3** | Fan-out tee so `bridge.ear` and custom consumers share audio | Pending `media-pipeline` scope |
| **WA-4** | `bridge.ear` auto-starts STT pipeline when call is connected | Pending `media-pipeline` scope |
| **WA-5** | `hold`/`transfer`/`dtmf` wired to actual manager methods | Needs `holdCall?`, `transferCall?`, `sendDTMF?` on `WhatsAppConnectionManager` |
| **WA-6** | Participant list for WhatsApp group calls | Provider-specific, low priority |

### Cross-cutting (both transports)

| Scope | What |
|---|---|
| `media-pipeline` | `MulticastMediaQueue` fan-out; `bridge.ear` auto-wiring; `onAudio`/`onVideo` reactive subscriptions |
| `vad-integration` | Voice Activity Detection gate before STT (stops transcribing silence) |
| `chat-context` | `call.agent` carries conversation history per session |
| `interruption-handling` | Cancels active `say()` when new `onHeard` fires |

---

*Questions, naming suggestions, and scope feedback welcome — ping **@visionik** or **@guti** on Discord, or open a discussion on the voice-sdk repo.*
