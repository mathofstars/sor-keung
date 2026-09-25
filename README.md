# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant**.

## Current status

**Stage 3 — Desktop UI & Secure Settings**

- **DEVELOPMENT IMPLEMENTED**
- **AUTOMATED BUILD VERIFIED**
- **PHYSICAL MAC ACCEPTANCE PENDING**
- Development branch: `feature/stage-3-desktop-ui`
- Target: `aarch64-apple-darwin` (Apple Silicon, including M1)
- This is an internal development/testing package, not a notarized public release.

Stage 3 turns the Stage 2.5 test shell into the first usable text-first desktop application. Voice remains a later-stage feature.

## Architecture

```text
Tauri frontend
   │
   ├─ chat UI / session transcript
   ├─ non-secret preferences → Tauri Store
   │
   └─ narrow invoke commands
          │
          ▼
      Rust bridge
          │
          ├─ API key status/save/delete → OS credential store
          │                               (macOS Keychain)
          │
          └─ run_sor_keung(request)
                  │
                  ├─ retrieve API key from Keychain
                  ├─ fixed bundled Node sidecar
                  └─ OPENROUTER_API_KEY in child environment only
                              │
                              ▼
                     Existing TypeScript/Node brain
                              │
                             Jev
                         ┌────┴────┐
                         ▼         ▼
                      action      LLM
                         │         │
                    validation  OpenRouter
                         │         │
                    dispatcher  text only
                         │
                    macOS adapter
```

The existing Sor-Keung brain remains the source of truth. Routing is not duplicated in the frontend, Rust bridge, or settings layer.

## Desktop UI

Stage 3 provides:

- chat-style session transcript
- user and Sor-Keung messages
- multiline input
- Enter to send
- Shift+Enter for a newline
- loading state
- duplicate-submit protection
- clear error presentation
- Settings view
- keyboard-accessible controls
- resizable desktop window with minimum usable dimensions

The transcript is **session-only UI state**. Closing the app may clear it.

The LLM remains deliberately **single-turn**:

```text
system prompt
+
current user message
```

The visible transcript is not silently sent back to the model and is not persistent AI memory.

## Settings

### Interface language

Supported:

- 繁體中文（香港） — `zh-HK`
- English — `en-GB`

UI language is independent from response style.

### Chinese response style

Default:

```text
香港口語廣東話
cantonese-hk
```

Alternative:

```text
香港繁體中文書面語
written-zh-hk
```

The system-prompt builder combines the common Sor-Keung instructions, language behaviour, and the selected response-style instruction without duplicating the whole prompt.

Conversational Cantonese aims for natural Hong Kong written Cantonese without forcing slang or sentence-final particles into every sentence.

### Response language

Stage 3 retains:

- Follow input language
- fixed Traditional Chinese (Hong Kong)
- fixed English

The default remains **Follow input language**.

## Secure OpenRouter API-key storage

Stage 2.5 used session-only API-key entry. Stage 3 stores the OpenRouter credential using the Rust `keyring` 4.x OS-native credential abstraction.

On macOS this uses **macOS Keychain Services**. The same abstraction is suitable for future Windows support through the native Windows credential store.

Narrow Rust commands:

```text
has_api_key()
save_api_key(secret)
delete_api_key()
run_sor_keung(request)
```

There is intentionally **no** command that returns the stored raw key to JavaScript.

Normal chat flow:

```text
Frontend
   │ run_sor_keung(request)
   ▼
Rust bridge
   │ retrieve API key from Keychain
   ▼
fixed bundled sidecar
   │ OPENROUTER_API_KEY=<secret> in child environment
   ▼
existing Sor-Keung core
```

The stored key is not:

- returned to the frontend
- displayed after saving
- placed in Tauri Store
- saved to localStorage/sessionStorage/IndexedDB
- passed as a sidecar command-line argument
- logged
- committed to Git
- required by CI

To configure it, open **Settings → OpenRouter API Key**, enter a new key and choose **Add / Replace key**. Settings exposes only configured/not-configured status. The key can also be removed from Settings.

## Non-secret settings persistence

The official Tauri Store plugin persists only non-secret preferences:

- `UI_LANGUAGE`
- `RESPONSE_STYLE`
- response-language preference

Secrets are kept completely separate in the OS credential store.

## Security boundary

Stage 1/2 boundaries remain unchanged.

Forbidden paths remain:

```text
frontend → arbitrary shell
frontend → arbitrary executable
LLM → shell
LLM → OS adapter
model output → exec()
```

The frontend capability grants:

```text
core:default
store:default
```

It does **not** grant frontend shell execute/spawn permissions.

The only executable OS capability remains:

```text
open_app
```

Actions still flow through:

```text
Jev
→ typed ActionRequest
→ validation
→ dispatcher
→ OS adapter
```

The macOS adapter continues to use:

```text
/usr/bin/open
["-a", appName]
shell: false
```

No filesystem deletion, arbitrary shell, browser automation, or additional OS action has been added.

## Providers

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

The same securely stored OpenRouter credential is supplied to the bundled sidecar at runtime.

## Current macOS packaging

Key versions:

- Tauri Rust crate: `2.11.6`
- Tauri CLI: `2.11.5`
- `@tauri-apps/api`: `2.11.1`
- `tauri-plugin-shell`: `2.3.6`
- Tauri Store plugin: `2.4.x`
- Rust `keyring`: `4.2.0`
- Node sidecar packager: `@yao-pkg/pkg 6.22.0`
- sidecar target: `node24-macos-arm64`
- Tauri target: `aarch64-apple-darwin`

The end user does not need Node.js, npm, Rust, or Cargo installed.

## Build and automated verification

Workflow:

```text
.github/workflows/stage2-5-macos-build.yml
```

The file name is retained from the earlier stage, but its workflow is now **Stage 3 macOS build** and targets `feature/stage-3-desktop-ui`.

It runs:

```text
checkout
→ Node 24
→ Rust stable / aarch64-apple-darwin
→ npm install
→ icon generation
→ TypeScript typecheck
→ full TypeScript tests
→ Node sidecar build
→ sidecar architecture + codesign verification
→ frontend build
→ Rust credential/bridge tests
→ Tauri app + DMG build
→ macOS launch-metadata verification
→ direct-run app packaging
→ artifact upload
```

No real OpenRouter API key or Apple Developer credential is needed in CI.

Verified Stage 3 implementation run:

```text
TypeScript typecheck: PASS
TypeScript tests: 52 passed / 0 failed
Rust credential/bridge tests: 2 passed / 0 failed
Node sidecar: Mach-O 64-bit executable arm64
Sidecar codesign verification: PASS
Tauri .app build: PASS
Tauri .dmg build: PASS
Direct-run app packaging: PASS
Artifact uploads: PASS
```

Artifacts:

```text
Sor-Keung-direct-app-aarch64-apple-darwin
Sor-Keung-dmg-aarch64-apple-darwin
```

The direct-run artifact contains a complete `Sor-Keung.app.zip`.

## Signing and enterprise-managed Mac note

Internal builds remain **ad-hoc signed**:

```text
signingIdentity: "-"
```

They are not Developer ID signed or notarized.

Stage 2.5 physical acceptance established that, on the current enterprise-managed macOS 27 Golden Gate Mac, a downloaded ad-hoc build may be held before application startup at `_dyld_start`.

The successful development-only workaround was:

```bash
cp -R -X ~/Applications/Sor-Keung.app ~/Applications/Sor-Keung-Local.app
codesign --force --deep --sign - ~/Applications/Sor-Keung-Local.app
codesign --verify --deep --strict --verbose=2 ~/Applications/Sor-Keung-Local.app
open ~/Applications/Sor-Keung-Local.app
```

This does not disable Gatekeeper and does not require `sudo`.

**Stage 3 does not claim to solve the enterprise macOS execution restriction.** The same workaround may still be required for physical acceptance.

A future public build should use proper Developer ID signing and notarization rather than local re-signing.

## Physical Mac acceptance — pending

Stage 3 must be tested on the existing Apple Silicon Mac before it can be considered accepted for merge.

Test the downloaded Stage 3 artifact as follows:

1. **First launch**
   - app opens normally (using the documented enterprise-Mac workaround if required)
   - no-key state clearly directs the user to Settings

2. **Secure API key**
   - add the OpenRouter key in Settings
   - quit Sor-Keung
   - reopen it
   - Settings still reports the key as configured
   - the raw key is never displayed

3. **Default Cantonese style**
   - ensure `香港口語廣東話` is selected
   - ask: `解釋量子糾纏是甚麼`
   - confirm natural Hong Kong Cantonese

4. **Written Chinese style**
   - switch to `香港繁體中文書面語`
   - ask the same question
   - confirm the response changes appropriately to Hong Kong written Traditional Chinese

5. **English follow-input**
   - ask: `Explain quantum entanglement simply.`
   - confirm an English response

6. **Actions**
   - `開 Spotify` → Spotify opens
   - `Open Safari` → Safari opens

7. **Invalid app**
   - confirm a safe response and no crash

8. **Security**
   - an unsupported dangerous computer instruction must not execute any filesystem or arbitrary shell action

Do not mark physical acceptance complete until these tests have been performed on the Mac.

## Running development checks

```bash
npm install
npm run typecheck
npm test
npm run build:sidecar
npm run build:frontend
cargo test --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin
```

## Current non-goals

Stage 3 does **not** add:

- microphone / voice input / voice output
- Groq / Whisper / Fish Audio / STT / TTS
- wake word / always-listening
- menu-bar or system-tray mode
- global hotkey / auto-start
- extra OS actions
- filesystem control
- arbitrary shell
- browser automation or web search
- persistent conversation history
- long-term memory / vector database
- MCP / plugins / autonomous agents
- scheduled tasks
- auto-update
- public release
- Apple notarization / Developer ID signing
- Windows build

Stage 4 has **not** started.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
