# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant** for macOS and Windows.

This repository is currently in the **Stage 0 bootstrap phase**. The architecture is being established before provider integrations, voice processing, GUI work, or computer-control functionality are added.

## Product principles

- **Voice optional, text always available.**
- Default UI language: Traditional Chinese (Hong Kong), `zh-HK`.
- Default voice input/output language: Cantonese (Hong Kong), `yue-HK`.
- Response language can follow input language or be configured explicitly.
- AI, speech, and operating-system providers remain replaceable.
- Shared AI logic stays independent from macOS- and Windows-specific actions.
- No unrestricted shell execution.
- No real API keys or credentials in Git.

## Intended architecture

```text
User
├─ Voice → STT ─┐
└─ Text ────────┤
                ↓
            Sor-Keung
                ↓
        Decision provider
        (Jev candidate)
          ├─ action → OS adapter
          └─ complex request → LLM
                ↓
             Response
          ├─ Text
          └─ TTS → Voice
```

## Provider direction

Architectural candidates only; nothing is hard-coded:

- Decision/router: TypeSafe Jev via a configurable provider such as OpenRouter.
- General LLM fallback: configurable; OpenRouter is the initial direction.
- STT: Groq + Whisper is a candidate.
- TTS: Fish Audio is a candidate.

Exact model identifiers are intentionally left blank until integrations are implemented and current provider documentation has been checked.

## Safe action model

The AI layer chooses from known, typed actions rather than arbitrary shell commands.

Initial allowlisted action concepts:

- `open_app`
- `close_app`
- `set_volume`
- `lock_screen`
- `get_time`
- `open_url`
- `play_pause_media`

The macOS and Windows adapters currently contain **non-executing placeholders only**.

## Project structure

```text
src/
├── actions/
│   ├── common/
│   ├── macos/
│   ├── windows/
│   └── types.ts
├── brain/
├── providers/
├── voice/
├── i18n/
│   └── locales/
│       ├── en-GB.json
│       └── zh-HK.json
└── index.ts
```

## Configuration

Copy `.env.example` to a local `.env` when integrations are added.

```text
UI_LANGUAGE=zh-HK
INPUT_LANGUAGE=yue-HK
OUTPUT_LANGUAGE=yue-HK
RESPONSE_LANGUAGE_MODE=follow-input

STT_PROVIDER=
DECISION_PROVIDER=openrouter
LLM_PROVIDER=openrouter
TTS_PROVIDER=
```

Real credentials must never be committed. `.env` and related local environment files are ignored by Git, while `.env.example` contains placeholders only.

## Localisation

UI text should go through the i18n layer rather than being hard-coded in UI components. Stage 0 includes `zh-HK` and `en-GB`.

## Roadmap

1. Stage 0 — repository bootstrap.
2. Stage 1 — text prototype and allowlisted macOS action routing.
3. Stage 2 — LLM fallback.
4. Stage 3 — desktop text UI.
5. Stage 4 — Cantonese STT.
6. Stage 5 — Cantonese TTS.
7. Stage 6 — Windows action adapter.
8. Stage 7 — wake word / always-listening behaviour.

## Security

Sor-Keung is intended to become public only after a security review. Before publication, audit secrets and personal information, including Git history where appropriate.

The project deliberately does **not** include unrestricted shell execution.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
