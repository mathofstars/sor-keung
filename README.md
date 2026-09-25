# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant** for macOS and Windows.

The project is currently at **Stage 2: text → Jev routing → either a validated OS action or a general LLM text response**.

## Product principles

- **Voice optional, text always available.**
- Default UI language: Traditional Chinese (Hong Kong), `zh-HK`.
- Default voice input/output language: Cantonese (Hong Kong), `yue-HK`.
- Written Chinese responses use clear Hong Kong Traditional Chinese rather than Simplified Chinese by default.
- Response language can follow the user's input or be configured explicitly.
- Decision, LLM, speech, and OS providers remain replaceable.
- Shared AI logic stays independent from OS-specific actions.
- No unrestricted shell execution.
- No real API keys or credentials in Git.

## Current architecture

```text
CLI / text input
      ↓
Sor-Keung Brain
      ↓
Jev decision provider
      │
      ├── action
      │     ↓
      │  typed ActionRequest
      │     ↓
      │  validation
      │     ↓
      │  ActionDispatcher
      │     ↓
      │  macOS adapter
      │     ↓
      │  open_app
      │     ↓
      │  localised text result
      │
      └── llm
            ↓
         LlmProvider
            ↓
      OpenRouter chat completion
            ↓
         text answer only
```

The two routes are deliberately separate:

- **Jev → validated action pipeline** is the only path that can reach an OS adapter.
- **Jev → LLM provider** returns text only. LLM output is never parsed back into an executable action.

If the Jev API itself fails, Sor-Keung fails safely. It does **not** assume the request is general text and silently send it to the LLM.

## Stage 1 action behaviour

Stage 1 behaviour remains intact. Only `open_app` is executable.

The initial application catalogue remains intentionally small:

- Spotify
- Safari
- Calculator

Both:

```text
開 Spotify
```

and:

```text
Open Spotify
```

are sent to Jev as natural-language state and should resolve to:

```text
open_app("Spotify")
```

No Cantonese-specific command parser is used.

The macOS adapter executes the allowlisted action through Node's process API using an argument array:

```text
executable: open
arguments: ["-a", appName]
shell: false
```

The application name is data, never shell syntax.

## Stage 2 general LLM fallback

Requests that Jev classifies as general/non-action requests are routed to the configured `LlmProvider`.

Examples:

```text
解釋量子糾纏是甚麼
```

and:

```text
Explain quantum entanglement simply.
```

go through:

```text
Jev → llm route → LlmProvider.generate(...) → text response
```

A supported OS action such as `開 Spotify` does **not** also invoke the general LLM.

Unsupported computer operations may be routed to the LLM so it can explain that the operation is not supported, but no action is executed.

For example, a request such as deleting files cannot bypass the action boundary because there is no allowlisted `delete_files` action and the LLM route is text-only.

## Sor-Keung system prompt

Stage 2 uses a deliberately short system prompt in `src/brain/system-prompt.ts`.

It establishes:

- assistant name: Sor-Keung / 傻強
- concise, useful answers
- multilingual behaviour
- follow-input response language by default
- Hong Kong Traditional Chinese for Chinese written responses
- no claim that unsupported computer actions were completed
- no ability for the LLM route to bypass action validation or OS adapters

This is intentionally not a large personality prompt. Persona can be separated later.

## Verified OpenRouter APIs

Verified on 25 September 2026 against current OpenRouter documentation.

### Jev / decision API

- Endpoint: `POST https://openrouter.ai/api/alpha/decisions`
- Authentication: `Authorization: Bearer <OPENROUTER_API_KEY>`
- Pinned decision model: `typesafe/jev-1.13`
- Stage 2 uses Jev's Choice primitive to distinguish `open_app` choices from the `llm` route.

Official references:

- TypeSafe System One: https://docs.typesafe.ai/concepts/system-one
- TypeSafe API reference: https://docs.typesafe.ai/api
- OpenRouter Jev 1.13: https://openrouter.ai/typesafe/jev-1.13

### General LLM / Chat Completions API

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Authentication: `Authorization: Bearer <OPENROUTER_API_KEY>`
- Request uses an OpenAI-compatible `messages` array plus a configurable `model`.
- Stage 2 explicitly uses non-streaming responses.
- Text is read from `choices[0].message.content`.
- Non-2xx responses are surfaced as safe provider errors using only the HTTP status; authorization headers/API keys are never included in user-facing errors.

Official references:

- OpenRouter developer platform / quickstart: https://openrouter.ai/developers
- OpenRouter GPT-5.4 Mini model page: https://openrouter.ai/openai/gpt-5.4-mini

## LLM model

The Stage 2 default is:

```text
openai/gpt-5.4-mini
```

It is configured through:

```text
LLM_MODEL=openai/gpt-5.4-mini
```

The model ID is not scattered through the brain or UI. Replacing the model does not require rewriting routing/action logic.

## Configuration

Copy the example file locally:

```bash
cp .env.example .env
```

Relevant Stage 2 settings:

```text
UI_LANGUAGE=zh-HK
INPUT_LANGUAGE=yue-HK
OUTPUT_LANGUAGE=yue-HK
RESPONSE_LANGUAGE_MODE=follow-input

DECISION_PROVIDER=openrouter
DECISION_MODEL=typesafe/jev-1.13

LLM_PROVIDER=openrouter
LLM_MODEL=openai/gpt-5.4-mini

OPENROUTER_API_KEY=
```

Jev and the general LLM reuse the same OpenRouter API key.

Never commit the populated `.env`. It remains ignored by Git.

The CLI currently reads environment variables from the process. On macOS:

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

Action example:

```text
傻強
輸入指令：開 Spotify
✓ 已開啟 Spotify
```

General request example:

```text
傻強
輸入指令：解釋量子糾纏是甚麼
量子糾纏是一種……
```

Stage 2 remains single-turn. There is no persistent chat history or memory.

## Security boundary

The general LLM is **not** an action generator.

Forbidden architecture:

```text
User → LLM → generated shell command → exec()
```

Actual architecture:

```text
Jev ── action ──→ typed validation → dispatcher → OS adapter

Jev ── llm ─────→ LLM provider → text only
```

Important safeguards:

- no `run_shell` action
- no `run_arbitrary_shell_command` capability
- only `open_app` is executable in the current action dispatcher
- LLM responses are never sent to the dispatcher
- user prompt-injection text cannot bypass the dispatcher boundary
- app names are passed as process arguments, not interpolated into a shell command
- Jev errors do not silently fall back to the LLM
- API keys and Authorization headers are not logged

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
│   ├── system-prompt.ts
│   ├── types.ts
│   └── validation.ts
├── providers/
│   ├── openrouter-jev.ts
│   ├── openrouter-llm.ts
│   └── types.ts
├── voice/
├── i18n/
│   └── locales/
│       ├── en-GB.json
│       └── zh-HK.json
├── cli.ts
└── index.ts

test/
├── brain-service.test.ts
├── dispatcher.test.ts
├── macos-adapter.test.ts
├── openrouter-jev.test.ts
├── openrouter-llm.test.ts
├── system-prompt.test.ts
└── validation.test.ts
```

## Tests

Run:

```bash
npm run typecheck
npm test
```

The full Stage 1 + Stage 2 test suite uses mocked external APIs and does not consume OpenRouter credits.

Coverage includes:

- Stage 1 `open_app` validation and dispatcher behaviour
- rejection of arbitrary shell actions
- safe macOS `open -a <app>` argument-array invocation
- Cantonese and English app commands
- action route does not invoke the LLM
- general request invokes LLM and does not reach the action adapter
- English general request routing
- unsupported/dangerous computer requests remain text-only
- Jev failure does not automatically invoke LLM
- OpenRouter Chat Completions request shape
- HTTP 401 / 429 / 500 handling
- malformed and empty LLM responses
- missing API key handling
- API key non-disclosure
- follow-input and fixed-language system-prompt behaviour

At Stage 2 implementation time, GitHub Actions verification passed:

```text
TypeScript typecheck: PASS
Tests: 32 passed, 0 failed
```

No real OpenRouter API smoke test is required for the automated suite.

## Current platform status

### macOS

`open_app` is implemented behind the macOS action adapter.

A physical Mac acceptance test is still required if the development environment cannot launch a macOS GUI application.

### Windows

The Windows adapter remains a non-executing placeholder. Windows action execution is a later stage.

## Current limitations / non-goals

Not implemented:

- speech-to-text
- text-to-speech
- microphone handling
- Groq / Whisper
- Fish Audio
- wake word / always-listening
- Tauri / GUI / menu bar UI
- streaming LLM responses
- Windows action execution
- new macOS actions beyond `open_app`
- arbitrary shell execution
- filesystem control
- web search
- browser control
- persistent conversation memory
- vector database
- autonomous agents/background actions
- scheduled tasks
- plugins / MCP
- startup/login launch
- installers

## Roadmap

1. **Stage 0 — complete:** repository bootstrap.
2. **Stage 1 — complete on feature branch:** text → Jev → validated `open_app` → macOS.
3. **Stage 2 — current feature branch:** general LLM fallback.
4. Stage 3 — desktop text UI.
5. Stage 4 — Cantonese STT.
6. Stage 5 — Cantonese TTS.
7. Stage 6 — Windows action adapter.
8. Stage 7 — wake word / always-listening behaviour.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
