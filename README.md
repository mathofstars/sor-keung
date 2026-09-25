# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant**.

## Current status

**Stage 2.5 — macOS Apple Silicon test package**

- **BUILD VERIFIED**
- **PHYSICAL MAC ACCEPTANCE PASSED**
- Target: `aarch64-apple-darwin` (Apple Silicon, including M1)
- Physical acceptance completed on an Apple Silicon M1 Mac running macOS 27 Golden Gate in a corporate-managed environment.
- This is a development/testing package, not a notarized public release.

Stage 2.5 wraps the existing Stage 2 TypeScript/Node.js core in a minimal Tauri v2 desktop shell. The Sor-Keung brain remains the source of truth; it has not been rewritten in Rust or moved into the webview.

## Architecture

```text
┌──────────────────────────────────────┐
│             Tauri .app               │
│                                      │
│   Minimal TypeScript UI              │
│          │                           │
│          ▼                           │
│   invoke("run_sor_keung")            │
│          │                           │
│          ▼                           │
│   Narrow Rust bridge                 │
│          │                           │
│          ▼                           │
│   Bundled Node sidecar               │
│          │                           │
│          ▼                           │
│   EXISTING Stage 2 Brain             │
│          │                           │
│       Jev Router                     │
│       /       \                      │
│ Action          LLM                  │
│   │              │                   │
│ validation    OpenRouter             │
│   │              │                   │
│ dispatcher    text only              │
│   │                                  │
│ macOS open_app                       │
└──────────────────────────────────────┘
```

The Tauri layer is only transport/UI. It does not duplicate Jev, LLM, validation, dispatcher, or action logic.

## Current functionality

The test app contains only:

- Sor-Keung / 傻強 title
- session-only OpenRouter API key password field
- one text input
- Send button
- loading/error/result state

Existing Stage 1/2 behaviour remains:

- `開 Spotify` / `Open Spotify` → Jev → validated `open_app` → macOS adapter
- general questions → Jev → configured LLM → text response
- LLM output is never converted into an executable action

Current executable app catalogue remains intentionally small:

- Spotify
- Safari
- Calculator

## macOS packaging

Current packaging versions:

- Tauri Rust crate: `2.11.6`
- Tauri CLI: `2.11.5`
- `@tauri-apps/api`: `2.11.1`
- `tauri-plugin-shell`: `2.3.6`
- Node sidecar packager: `@yao-pkg/pkg 6.22.0`
- sidecar target: `node24-macos-arm64`
- Tauri target: `aarch64-apple-darwin`

The standalone Node sidecar is named using Tauri's target-triple convention:

```text
src-tauri/binaries/sor-keung-sidecar-aarch64-apple-darwin
```

The end user does **not** need Node.js, npm, Rust, or Cargo installed to run the packaged app.

The app iconset is generated during CI from `app-icon.svg` using Tauri's own `tauri icon` command.

## API key handling

The OpenRouter API key is **session-only**.

```text
password input
    ↓
Tauri invoke
    ↓
Rust run_sor_keung command
    ↓
child-process environment
OPENROUTER_API_KEY=<session value>
    ↓
bundled Sor-Keung sidecar
```

The key is **not**:

- committed to Git
- bundled into the application
- stored in `.env` inside the app
- saved to `localStorage`, `sessionStorage`, preferences, JSON, or another settings file
- logged
- passed as a sidecar command-line argument
- required as a GitHub Actions secret

The user pastes the key again after relaunching the Stage 2.5 test app.

## Security boundary

The frontend has no generic shell or executable permission.

The Tauri capability grants only:

```text
core:default
```

It does **not** grant frontend `shell:allow-execute` or `shell:allow-spawn`.

The only frontend bridge is:

```text
invoke("run_sor_keung", ...)
```

The Rust bridge itself chooses the fixed bundled `sor-keung-sidecar`. The frontend cannot supply an executable path.

There is no:

- `run_shell`
- `run_arbitrary_shell_command`
- frontend → arbitrary executable route
- LLM → shell route
- model-output → exec route

Only the existing validated `open_app` pipeline can perform an OS action.

### macOS open_app

For packaged macOS execution the adapter uses the stable absolute system path:

```text
/usr/bin/open
["-a", appName]
shell: false
```

The application name remains a process argument, never concatenated shell syntax.

## OpenRouter providers

Decision layer:

```text
DECISION_PROVIDER=openrouter
DECISION_MODEL=typesafe/jev-1.13
```

General LLM:

```text
LLM_PROVIDER=openrouter
LLM_MODEL=openai/gpt-5.4-mini
```

Both reuse the same session OpenRouter API key.

## GitHub Actions macOS build

Workflow:

```text
.github/workflows/stage2-5-macos-build.yml
```

It supports `workflow_dispatch` and also verifies pushes to the Stage 2.5 feature branch.

The workflow performs:

```text
checkout
→ Node 24
→ Rust stable / aarch64-apple-darwin
→ npm install
→ Tauri icon generation
→ TypeScript typecheck
→ full automated tests
→ @yao-pkg/pkg arm64 sidecar build
→ sidecar architecture + codesign verification
→ Tauri app + DMG build
→ upload ordinary Actions artifacts
```

No OpenRouter credential is needed to build.

No Apple Developer credentials are needed at this stage.

### Verified build result

The Stage 2.5 workflow has successfully produced:

```text
Sor-Keung.app
Sor-Keung_0.2.5_aarch64.dmg
```

Uploaded artifact names:

```text
Sor-Keung-direct-app-aarch64-apple-darwin
Sor-Keung-dmg-aarch64-apple-darwin
```

The direct-run app artifact contains a `Sor-Keung.app.zip` created with macOS `ditto --keepParent`, preserving the complete `.app` bundle structure rather than exposing its internal `Contents/` directory.

Latest fully verified Stage 2.5 build run (#12) reported:

```text
TypeScript typecheck: PASS
Tests: 41 passed, 0 failed
Node sidecar: Mach-O 64-bit executable arm64
Sidecar codesign verification: PASS
Tauri .app build: PASS
Tauri .dmg build: PASS
Direct-run app packaging: PASS
Artifact uploads: PASS
```

## Signing / Gatekeeper

This internal test build uses macOS **ad-hoc signing**:

```text
signingIdentity: "-"
```

This is not Developer ID signing and the app is not notarized.

When downloading the test app from GitHub, macOS Gatekeeper may therefore block or translocate the first launch. This was reproduced during physical acceptance on a corporate-managed macOS 27 Golden Gate machine: the downloaded ad-hoc-signed app could remain stuck before Rust/Tauri `main()` at `_dyld_start`.

For this internal Stage 2.5 test package, the successful workaround was to create a fresh local copy without the downloaded extended attributes and then apply a fresh local ad-hoc signature:

```bash
cp -R -X ~/Applications/Sor-Keung.app ~/Applications/Sor-Keung-Local.app
codesign --force --deep --sign - ~/Applications/Sor-Keung-Local.app
codesign --verify --deep --strict --verbose=2 ~/Applications/Sor-Keung-Local.app
open ~/Applications/Sor-Keung-Local.app
```

This workaround does not disable Gatekeeper and does not require `sudo`. It is a development-only workaround, not a distribution solution.

Official Developer ID signing and notarization are intentionally deferred until Sor-Keung is ready for external distribution. A future public build should use Developer ID signing and notarization rather than requiring local re-signing.

## Download the M1 test build

From GitHub:

1. Open this repository.
2. Select **Actions**.
3. Open **Stage 2.5 macOS build**.
4. Open the latest successful run for `feature/stage-2-5-macos-test-app`.
5. Scroll to **Artifacts**.
6. Download **Sor-Keung-dmg-aarch64-apple-darwin**.
7. Unzip the GitHub Actions artifact.
8. Open `Sor-Keung_0.2.5_aarch64.dmg`.
9. Copy/open Sor-Keung and, if Gatekeeper blocks it, approve it in **System Settings → Privacy & Security**.

The separate `Sor-Keung-direct-app-aarch64-apple-darwin` artifact is available for direct app-bundle testing without using the DMG.

## Physical Mac acceptance

Physical acceptance is **complete** for Stage 2.5 on Apple Silicon M1 / macOS 27 Golden Gate.

Observed results:

- no API key → clear `請輸入 OpenRouter API Key。` configuration error
- `開 Calculator` → Calculator opened successfully
- `Open Safari` → Safari opened successfully
- `解釋量子糾纏是甚麼` → Jev routed to the LLM and returned a Hong Kong Traditional Chinese / spoken-Cantonese response
- `Explain quantum entanglement simply.` → English LLM response
- `開 ExampleNonexistentApp` → safe text response; no crash and no arbitrary execution
- `刪除 Downloads 入面所有檔案` → no filesystem action and no arbitrary shell execution

One physical acceptance session consumed approximately **US$0.0049** of OpenRouter usage. This is only an observed test-session cost; actual cost varies with model/provider pricing and request volume.

### Product language direction discovered during acceptance

The spoken-Cantonese style used in the Chinese LLM response was judged desirable for Sor-Keung's target audience rather than a regression.

Future product direction:

```text
Response language:
- follow input
- Chinese
- English

Chinese response style:
- Spoken Cantonese / 香港口語廣東話 (default)
- Written Traditional Chinese / 香港繁體中文書面語
```

The style selector is a future product setting and is **not implemented in Stage 2.5**. Stage 3 has not started.

## Automated tests

Run locally during development:

```bash
npm install
npm run typecheck
npm test
```

The test suite uses mocks and does not spend OpenRouter credits.

It covers Stage 1/2 regression behaviour plus Stage 2.5:

- action route preserved
- LLM text-only route preserved
- structured action / LLM / error responses
- missing API key handling
- frontend cannot invoke arbitrary binaries or shell
- key is transported via child environment, not command-line arguments
- key is not persisted by the frontend
- Tauri capability does not expose shell execute/spawn
- `/usr/bin/open` safe argument-array invocation

## Current limitations / non-goals

Stage 2.5 does not include:

- official Apple notarization
- Developer ID signing
- App Store distribution
- Intel or Universal macOS builds
- Windows/Linux packaging
- production chat/history UI
- menu bar/system tray mode
- settings system or Keychain integration
- persistent API key
- microphone, STT, TTS, Groq, Fish Audio
- wake word / always-listening
- streaming LLM responses
- persistent conversation memory
- database/vector store
- web/browser control
- new OS actions or filesystem actions
- arbitrary shell execution
- autonomous agents
- updater/auto-launch/installers for public distribution

Stage 3 has **not** started.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
