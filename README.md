# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant** for macOS and Windows.

The project is currently at **Stage 1: text input → Jev decision → validated typed action → macOS adapter → text result**.

## Product principles

- **Voice optional, text always available.**
- Default UI language: Traditional Chinese (Hong Kong), `zh-HK`.
- Default voice input/output language: Cantonese (Hong Kong), `yue-HK`.
- Response language can follow the input language or be configured explicitly.
- AI, speech, and operating-system providers remain replaceable.
- Shared AI logic stays independent from OS-specific actions.
- No unrestricted shell execution.
- No real API keys or credentials in Git.

## Stage 1 pipeline

```text
CLI / text input
      ↓
Sor-Keung Brain
      ↓
OpenRouter Jev decision provider
      ↓
provider translation
      ↓
Sor-Keung typed ActionRequest
      ↓
validation
      ↓
ActionDispatcher
      ↓
macOS adapter
      ↓
open_app
      ↓
localised text result
```

For Stage 1, only `open_app` is executable. Other action types created during Stage 0 remain non-operational.

### Stage 1 application catalogue

Jev's Choice primitive returns one option from a predefined set rather than arbitrary generated text. Stage 1 therefore starts with this small application catalogue:

- Spotify
- Safari
- Calculator

Both `開 Spotify` and `Open Spotify` are sent to Jev as natural-language state. There are no Cantonese-specific command parsing rules in the application.

Requests outside the supported Stage 1 decision space return a safe unsupported response rather than being sent to an LLM.

## Verified Jev / OpenRouter integration

Verified on 25 September 2026 against the official TypeSafe and OpenRouter documentation.

- Jev is TypeSafe's System One structured-decision model. It accepts text state and returns typed decisions/probabilities rather than generated prose.
- TypeSafe documents the `choice`, `score`, and `noul` primitives.
- Sor-Keung Stage 1 uses the `choice` primitive only.
- OpenRouter Decisions API endpoint: `POST https://openrouter.ai/api/alpha/decisions`
- Authentication: `Authorization: Bearer <OPENROUTER_API_KEY>`
- Pinned Stage 1 model: `typesafe/jev-1.13`
- OpenRouter also exposes `~typesafe/jev-latest`, but Stage 1 pins the version for repeatable behaviour.
- The request supplies `model`, `state`, and a `questions` map.
- A Choice answer returns `type`, `choice`, `probabilities`, and `confidence`.

Official references:

- TypeSafe System One: https://docs.typesafe.ai/concepts/system-one
- TypeSafe API reference: https://docs.typesafe.ai/api
- OpenRouter Jev 1.13: https://openrouter.ai/typesafe/jev-1.13
- OpenRouter Jev / Decisions API example: https://openrouter.ai/blog/insights/what-is-jev/

Sor-Keung calls the OpenRouter Decisions API behind the `DecisionProvider` abstraction. Provider-specific response data is translated at the provider boundary and does not reach the OS adapter.

## Safe action model

The AI does not produce a shell command for execution.

Stage 1 follows this boundary:

```text
Jev typed choice
      ↓
provider translation
      ↓
validateActionCandidate(...)
      ↓
ActionDispatcher
      ↓
MacOsActionAdapter
```

The macOS adapter implements `open_app` with Node's process API and an argument array:

```text
executable: open
arguments: ["-a", appName]
shell: false
```

The application name is data. It is never concatenated into a shell command.

There is deliberately no `run_shell` or `run_arbitrary_shell_command` capability.

## Project structure

```text
src/
├── actions/
│   ├── common/
│   ├── macos/
│   ├── windows/
│   ├── dispatcher.ts
│   └── types.ts
├── brain/
│   ├── service.ts
│   ├── types.ts
│   └── validation.ts
├── providers/
│   ├── openrouter-jev.ts
│   └── types.ts
├── voice/
├── i18n/
│   └── locales/
│       ├── en-GB.json
│       └── zh-HK.json
├── cli.ts
└── index.ts

test/
├── dispatcher.test.ts
├── macos-adapter.test.ts
├── openrouter-jev.test.ts
└── validation.test.ts
```

## Configuration

Copy the example file locally:

```bash
cp .env.example .env
```

Stage 1 requires an OpenRouter API key:

```text
OPENROUTER_API_KEY=
DECISION_PROVIDER=openrouter
DECISION_MODEL=typesafe/jev-1.13
```

Never commit the populated `.env`. It remains ignored by Git.

The CLI reads environment variables from the process. On macOS, one simple way to load the local file before running is:

```bash
set -a
source .env
set +a
npm run cli
```

## Run the text prototype

Install dependencies:

```bash
npm install
```

Run:

```bash
npm run cli
```

Example:

```text
傻強
輸入指令：開 Spotify
✓ 已開啟 Spotify
```

The same decision path supports:

```text
Open Spotify
```

## Tests

```bash
npm run typecheck
npm test
```

Tests use mocked Jev/OpenRouter responses and an injected macOS process runner. Automated tests do not use OpenRouter credits and do not actually open desktop applications.

Coverage includes:

- valid `open_app` decision validation
- rejection of `run_shell`
- rejection of malformed parameters/responses
- Stage 1 dispatcher allowlisting
- safe `open -a <app>` argument-array construction
- application launch failure handling
- mocked Jev/OpenRouter request and response handling
- missing API key handling
- API error handling without exposing credentials
- Cantonese and English input flowing through the same provider path

## Current platform status

### macOS

Stage 1 `open_app` is implemented behind the macOS action adapter.

A real physical Mac acceptance test is still required wherever the development environment cannot launch a macOS GUI application.

### Windows

The Windows adapter remains a non-executing placeholder. Windows action execution is a later stage.

## Current limitations / non-goals

Not implemented in Stage 1:

- speech-to-text
- text-to-speech
- microphone handling
- wake word / always-listening
- Groq Whisper
- Fish Audio
- general LLM fallback
- web search
- Tauri / GUI / menu bar UI
- Windows action execution
- arbitrary shell commands
- persistent conversation memory
- autonomous background actions
- startup/login launch
- installers

Because Jev Choice selects from predefined criteria, Stage 1's executable app catalogue is intentionally small. Expanding app discovery/selection should be designed deliberately rather than weakening the action boundary.

## Roadmap

1. **Stage 0 — complete:** repository bootstrap.
2. **Stage 1 — current:** text → Jev → validated `open_app` → macOS.
3. Stage 2 — general LLM fallback.
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
