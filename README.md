# Sor-Keung（傻強）

Sor-Keung is a **Cantonese-first, multilingual, cross-platform desktop AI assistant**.

## Current status

**Stage 3 — Desktop UI & Secure Settings**

- **FINAL STAGE 3 PHYSICAL-ACCEPTANCE FIXES IMPLEMENTED**
- **FINAL MANUAL CI VERIFICATION PENDING**
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
   ├─ chat UI / safe Markdown rendering
   │
   └─ narrow invoke commands
          │
          ▼
      Rust bridge
          │
          ├─ API key status/save/delete → OS credential store
          │                               (macOS Keychain)
          ├─ process-only credential cache
          ├─ all non-secret preferences ↔ Tauri Store
          ├─ trusted installed-app catalogue
          │   └─ local .app metadata / Info.plist
          │
          └─ run_sor_keung(input only)
                  │
                  ├─ use cached key or retrieve once from Keychain
                  ├─ reload persisted preferences
                  ├─ inject response settings + trusted app catalogue + policy
                  ├─ fixed bundled Node sidecar
                  └─ OPENROUTER_API_KEY in child environment only
                              │
                              ▼
                     Existing TypeScript/Node brain
                              │
                             Jev
                         ┌────┴────┐
                         ▼         ▼
                   open-app intent LLM
                         │         │
                  AppCatalog     OpenRouter
                    resolver       │
                         │       text only
                 typed open_app
                         │
                AppAccessPolicy
                         │
                    dispatcher
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
- safe common-Markdown rendering for assistant LLM messages
- plain-text rendering for user messages
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

Written mode explicitly requires standard Hong Kong Traditional Chinese written grammar and tells the model to avoid conversational Cantonese forms such as `係／唔／佢哋／點解／咁／嚟／嘅／喺／咗` except when quoting or discussing Cantonese. The runtime value is reloaded from the authoritative Tauri Store by the Rust backend for each request rather than trusted from frontend memory.

### Response language

Stage 3 retains:

- Follow input language
- fixed Traditional Chinese (Hong Kong)
- fixed English

The default remains **Follow input language**.

Action acknowledgements follow the resolved response language rather than the interface language. For example, with a Chinese UI, `Open Calculator` returns an English action result, while `開 Calculator` returns the configured Hong Kong Chinese action style.

### App access

Stage 3 now resolves applications from a trusted local installed-app catalogue instead of a permanent hard-coded list.

Default:

```text
Allow all installed applications: ON
```

When ON, any application that resolves to one trusted local catalogue entry may be opened.

When OFF, Settings displays the discovered installed applications and the user can enable or disable them individually. The persisted non-secret policy is conceptually:

```text
allowAllInstalledApps: true | false
allowedAppIds: [...]
```

Stable bundle identifiers are preferred as app IDs where available. The frontend receives display metadata for Settings but does not receive or choose executable filesystem paths.

The core abstractions are:

```text
AppCatalog
AppAccessPolicy
```

They are platform-neutral so a later Windows catalogue can implement the same contract without changing Sor-Keung brain semantics. Stage 3 does **not** implement Windows discovery or launching.

## Secure OpenRouter API-key storage

Stage 2.5 used session-only API-key entry. Stage 3 stores the OpenRouter credential using the Rust `keyring` 4.x OS-native credential abstraction.

On macOS this uses **macOS Keychain Services**. The same abstraction is suitable for future Windows support through the native Windows credential store.

Narrow Rust commands:

```text
has_api_key()
save_api_key(secret)
delete_api_key()
list_installed_apps()
run_sor_keung(request)
```

There is intentionally **no** command that returns the stored raw key to JavaScript.

After the first successful credential lookup in a running Sor-Keung process, the secret is cached only in trusted Rust process memory for that application session. Normal subsequent chat requests therefore perform **zero additional Keychain reads**. Replacing the API key updates both Keychain and the session cache; deleting it removes the Keychain credential and immediately clears the cache. Restarting Sor-Keung may require one fresh Keychain authorization, especially for a newly ad-hoc re-signed development build.

Normal chat flow:

```text
Frontend
   │ run_sor_keung({ input })
   ▼
Rust bridge
   ├─ cached key, or one Keychain lookup for this process
   ├─ load authoritative preferences from Tauri Store
   └─ inject trusted app catalogue + policy + response settings
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

The Tauri Store persists only non-secret preferences:

- UI language
- response style
- response-language preference
- `allowAllInstalledApps`
- `allowedAppIds`

The **Rust backend is the single authority** for loading and saving these values. Settings reloads persisted values every time it opens and shows a loading state until they are available. The frontend no longer has direct Tauri Store capability.

Secrets remain completely separate in the OS credential store.

Before every chat request, the Rust bridge reloads the same persisted preference object and injects the response settings and App Access policy into the sidecar. The JavaScript chat request supplies only the current user input and cannot override response style, response language, app catalogue, or App Access policy.

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

The frontend capability grants only:

```text
core:default
```

The frontend has neither direct Store capability nor shell execute/spawn permissions.

The only executable OS capability remains:

```text
open_app
```

Open-app requests now flow through:

```text
Jev
→ generic open_app intent
→ trusted local AppCatalog resolution
→ typed ActionRequest
→ validation
→ AppAccessPolicy
→ dispatcher
→ OS adapter
```

Jev no longer contains a permanent Spotify/Safari/Calculator catalogue. It only decides whether the user is clearly asking to open an application; deterministic local code resolves the requested name against the trusted installed-app catalogue.

Resolution rules are deliberately fail-safe:

- one confident installed-app match → continue
- multiple plausible matches → report ambiguity and launch nothing
- no installed-app match → report app not found
- model/user text never becomes an executable path

On macOS, the adapter prefers the resolved trusted bundle identifier:

```text
/usr/bin/open
["-b", bundleIdentifier]
shell: false
```

If a discovered app has no bundle identifier, Sor-Keung may use its trusted canonical app name:

```text
/usr/bin/open
["-a", canonicalAppName]
shell: false
```

No shell command is concatenated.

No filesystem deletion, arbitrary shell, browser automation, or additional OS action has been added.

## Safe Markdown rendering

Assistant responses from the LLM are parsed with maintained Markdown AST utilities and converted through an explicit allowlist sanitisation policy.

Supported presentation includes:

- paragraphs
- bold and italic text
- headings
- unordered and ordered lists
- inline code
- fenced code blocks
- blockquotes

Raw HTML is neutralised before Markdown parsing, dangerous HTML is disabled in the AST conversion, and the resulting HTML tree is sanitised to an allowlist containing only the presentation elements above. Script, image, event-handler, link and arbitrary-attribute content cannot become active DOM.

User messages are never Markdown-rendered; they remain literal plain text.

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
- Rust `plist`: `1.x` for local macOS app metadata
- Node sidecar packager: `@yao-pkg/pkg 6.22.0`
- sidecar target: `node24-macos-arm64`
- Tauri target: `aarch64-apple-darwin`

The end user does not need Node.js, npm, Rust, or Cargo installed.

## Build and automated verification

Workflow:

```text
.github/workflows/stage2-5-macos-build.yml
```

To conserve GitHub Actions minutes during final Stage 3 development, this workflow is now **manual-only**. It no longer runs on every feature-branch commit.

The final workflow is split into two gates:

```text
Ubuntu verification
  → npm install
  → TypeScript typecheck
  → full TypeScript tests
  → frontend production build

only if that succeeds:

macOS arm64 build
  → npm install
  → icon generation
  → Apple Silicon Node sidecar
  → arm64 / codesign verification
  → frontend build
  → Rust credential/settings/bridge tests
  → Tauri .app + .dmg
  → launch-metadata verification
  → direct-run app packaging
  → artifact upload
```

This prevents a TypeScript regression from consuming expensive macOS runner minutes.

The previous accepted Stage 3 base and installed-app implementation were built successfully before these final physical-acceptance fixes. The current final-fix branch is intentionally waiting for **one final complete manual CI run** after all source and documentation changes are finished.

The current regression suite contains approximately:

```text
TypeScript tests: 93
Rust credential/settings/bridge tests: 8
```

The final completion report uses the actual counts from that one final workflow run rather than treating these pre-run counts as verified.

No real OpenRouter API key or Apple Developer credential is required by CI.

Artifacts produced by a successful final run:

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

After the final CI build, only the focused acceptance areas that previously failed need to be repeated:

1. **Keychain behaviour**
   - launch the newly installed/re-signed build
   - grant any initial Keychain authorization required by the changed ad-hoc code identity
   - open several applications across several requests
   - confirm repeated double password prompts do not recur during the same app process

2. **App Access persistence**
   - set **Allow all installed applications = OFF**
   - enable only Calculator and Messages
   - navigate **Settings → Chat → Settings**
   - confirm allow-all remains OFF and exactly Calculator + Messages remain enabled
   - `Open Calculator` succeeds
   - `Open Messages` succeeds
   - `Open Safari` is blocked
   - switch allow-all ON and confirm Safari can open

3. **Follow-input action language**
   - with a Chinese UI, `Open Calculator` must receive an English success response
   - `開 Calculator` should receive the configured Hong Kong Chinese response style

4. **Markdown**
   - confirm real LLM output renders bold, headings, lists and code blocks without showing unnecessary Markdown markers
   - unsafe raw HTML must not create active DOM content

5. **Cantonese mode**
   - select `香港口語廣東話`
   - ask `解釋量子糾纏是甚麼`
   - confirm natural Hong Kong Cantonese

6. **Written mode**
   - select `香港繁體中文書面語`
   - ask the same question
   - confirm genuine written Hong Kong Traditional Chinese without conversational forms such as `係／唔／佢哋／點解`, except when explicitly quoting Cantonese

Only after these six areas pass should Stage 3 be considered ready for squash merge into `develop`.

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
