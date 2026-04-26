# @openclaw/voice-sdk

Provider-agnostic, media-rich, agent-first call SDK for [OpenClaw](https://github.com/openclaw/openclaw).

> **Note on the name:** "Voice" is used in the telecom tradition (think SIP, VoIP, Moho) — this SDK covers **audio, video, screen sharing, and data channels**. Any real-time media that flows over a call session is in scope.

## Overview

`@openclaw/voice-sdk` defines the shared `Call` abstraction layer that all OpenClaw channel providers (WhatsApp, Twilio, Discord, WebRTC) implement and that AI agents consume via a standardized `AgentBridge`. Inspired by [Voxeo Moho](https://github.com/voxeolabs/moho).

**Key concepts:**

- **`VoiceProvider`** — channel-specific factory that creates `Call` instances
- **`Call`** — full lifecycle (ringing → connected → ended), media streams, text channel
- **`AgentBridge`** — pluggable STT/TTS bridge on every `Call` for AI agent integration
- **`MockVoiceProvider`** — deterministic test harness, no real network required

## Install

```bash
pnpm add @openclaw/voice-sdk
```

## Quick Start

_Full API reference coming in v0.1.0._

## Development

```bash
task          # list all tasks
task build    # compile with tsdown
task test     # run vitest
task check    # full quality gate (lint + fmt + typecheck + build + test)
```

## License

MIT
