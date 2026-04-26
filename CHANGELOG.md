# Changelog

All notable changes to `@openclaw/voice-sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## [Unreleased]

## [0.1.0] - 2026-04-26

### Added

- **Core types** (`src/types.ts`): `MediaType`, `CallState`, `CallMode`, `Endpoint`, `CallOptions`, `RetryPolicy`, `CallTextMessage`, `TTSOptions`
- **`MediaSource`** type alias: `AsyncIterable<Buffer>` — Node-native, zero DOM dependency
- **`CallError`** class with typed `code` union and static factory methods (`timeout`, `rejected`, `mediaFailure`, `unauthorized`, `groupFull`)
- **`VoiceProvider`** interface: channel-specific factory for `Call` instances
- **`Call`** interface: full lifecycle state machine, typed EventEmitter overloads, media streams, text channel, `AgentBridge` accessor
- **`AgentBridge`** interface: pluggable STT/TTS bridge; `onVoiceInput`, `injectTTS`, `injectAudio`, `setSTTProvider`, `setTTSProvider`
- **`STTProvider`** / **`TTSProvider`** interfaces for pluggable speech processing
- **`MediaService`** interface: `play`, `record`, `collect` (DTMF + speech)
- **`BaseAgentBridge`** class: concrete `AgentBridge` implementation used by all provider `Call` classes
- **`MockVoiceProvider`** + **`MockCall`**: deterministic test harness with `triggerIncoming`, `simulateStateChange`, `simulateVoiceInput`
- **`WhatsAppVoiceProvider`** + **`WhatsAppCall`**: reference implementation; DI constructor, single-socket invariant enforced via `registerVoiceProvider`
- **`WhatsAppConnectionManager`** interface: contract for the OpenClaw WhatsApp extension (no `@whiskeysockets/baileys` runtime dependency in this package)
- **`MediaStreamQueue`**: push-based `AsyncIterable<Buffer>` bridging WASocket callbacks to the media model
- **CLI harness** (`openclaw-voice`): `simulate-incoming --auto-accept`, `dial --to`, `--help`; built with Commander 14
- **Project scaffold**: pnpm, TypeScript 6, tsdown, vitest 4, oxlint, oxfmt, Taskfile

### Notes

- "Voice" is used in the telecom sense — this SDK covers audio, video, screen, and data channels
- Exports available at `@openclaw/voice-sdk`, `@openclaw/voice-sdk/providers/mock`, `@openclaw/voice-sdk/providers/whatsapp`
