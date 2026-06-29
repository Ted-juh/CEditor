# Verifying the export toolchain end-to-end

A gated checklist: each gate has an **action**, the **expected result**, and **what it proves**. Run
top-to-bottom; if a gate fails, capture the noted output before moving on. Two tracks:

- **Track A — from a source checkout** (your `C:\dev\projects\ceditor`): verifies the new in-app
  features *and* a real test-panel compile, because the build environment is present.
- **Track B — from the installer**: verifies build-installer → install → launch → toolchain management.
  (A GUI-only install can manage toolchains but a full VST3 export still needs the build env — see
  `docs/scripting-language-options-and-shippable-export.md` §3a.)

---

## Gate 0 — Sync + prerequisites (1 min)

```powershell
git pull
node --version          # Node.js on PATH (the app shells it for export + provisioning)
```
Visual Studio (Desktop C++) **or** the bundled LLVM-MinGW is needed to compile a plugin. If you have VS,
nothing else is required for C++; C#/Java/Python toolchains are fetched on demand.

**Proves:** you're on the latest branch and Node is reachable.

---

## Gate 1 — Node engine (fast, no build) (1 min)

```powershell
node tools\scripts\nativeHandlers\verify-all.mjs
node tools\toolchains\languages.mjs status
node tools\toolchains\languages.mjs preflight tools\scripts\nativeHandlers\selftest.cepanel
```
**Expected:** `verify-all` reports each language check ✓ (or "skipped" where a toolchain is absent — not a
failure). `status` prints a JSON list of languages with `installed` true/false + sizes. `preflight` lists
the selftest's 7 languages and which toolchains are missing.

**Proves:** the provisioning engine + language map + the native-handler generators are intact before any
heavy build. **If this fails, stop here** — fix the node side first (cheapest to debug).

---

## Track A — source checkout

### Gate A1 — Rebuild the app (C++ changes) (2–5 min)

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\scripts\build-native.ps1 -Configuration Debug
```
**Expected:** compiles with no errors. This includes the new bridge handlers
(`toolchainStatus`/`provisionToolchains`/`removeToolchains`, `ceditorSourceRoot()`).

**Proves:** the Settings-panel backend + the install-dir exporter resolution compile.
**If it fails:** capture the compiler error (file:line) — it's in `ValueTreeBridgeHandlers.cpp` /
`ValueTreeBridge.h`.

### Gate A2 — Launch + open the Scripting Toolchains panel

```powershell
# Terminal 1
cd CE\web ; npm run dev
# Terminal 2
.\build\native\CEditor_artefacts\Debug\CEditor.exe
```
In the app: **Settings → Scripting Toolchains**.

**Expected:** Lua/JavaScript/TypeScript = "Built in"; Python/C++/C#/Java show "Installed" or
"Not installed (+size)" matching Gate 1's `status`. Click **Install** on a not-installed language → a
progress log streams and it flips to "Installed". Click **Remove** → it flips back (shared C++ toolchain
is never removed).

**Proves:** Step 2 (in-app toolchain management) end-to-end through the C++ bridge.

### Gate A3 — Compile the test panel *from the program*

In the app: **File → Open** → `tools\scripts\nativeHandlers\selftest.cepanel`, then click **Build /
Export VST3**. Watch the build console.

**Expected, in order:**
- `Native handlers: ... panel uses [cpp, csharp, java]`
- If a toolchain is missing: `Toolchains: panel needs [...]; installing missing: ... (one-time)...`
  then download progress (first run only).
- `Web bundle: up-to-date ... skipping Vite build.` **or** `Building web bundle...` (first run / after a
  UI change). Re-export immediately → second time it should say **skipping**.
- `✓ cpp: +~0.5 MB`, `✓ csharp: +~22 MB`, `✓ java: +~31 MB`, Python `+~56 MB`.
- `EXPORTED: ...\export-out\SelfTest.vst3` and `buildComplete` ok.

**Proves:** Steps 1 (on-demand provisioning), 3 (Vite-skip on re-export), and in-app export of all seven
languages. **If a language is skipped:** the console prints the exact reason (missing toolchain / build
error) — capture that line.

### Gate A4 — Load in the DAW

```powershell
xcopy /E /I /Y export-out\SelfTest.vst3 "C:\Program Files\Common Files\VST3\SelfTest.vst3"
```
In Reaper: add the **SelfTest** VST3 to a track, route its MIDI out to a MIDI monitor/recorder, open the
plugin window.

**Expected:** CC **20–26** all fire on window-open: lua=20, js=21, ts=22, python=23, cpp=24, csharp=25,
java=26. Put the plugin on a **second track** too → CC 25/26 fire there as well (the multi-instance fix).

**Proves:** the shipped plugin actually runs every language, incl. C#/Java on multiple instances.

---

## Track B — installer

### Gate B1 — Build the installer (5–10 min)

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\scripts\package-installer.ps1
```
**Expected:** builds the frontend + native app (DEV_MODE OFF), stages to `build\package-stage\CEditor`
(including `tools\` — verify `build\package-stage\CEditor\tools\toolchains\languages.mjs` exists and that
`tools\toolchains\` has **no** `llvm-mingw/dotnet/jdk` binary subdirs), and compiles
`build\installer\CEditor-Setup-0.2.0.exe` (needs Inno Setup 6; otherwise it stops at "staged").

**Proves:** Step 4 staging (the export pipeline + toolchain scripts are in the install tree; binaries are
not bundled).

### Gate B2 — Install with a language selection

Run `CEditor-Setup-0.2.0.exe`. On **Select Components**, choose **Custom** and tick e.g. **C#** only (or
**Full**).

**Expected:** install completes; if Node is on PATH you'll see "Installing .NET scripting toolchain…"
during install (best-effort — if it's skipped, it's fetched on demand later). Installed tree under
`%ProgramFiles%\CEditor` contains `CEditor.exe`, `web\dist\`, and `tools\`.

**Proves:** the installer language-component page provisions the chosen toolchain.

### Gate B3 — Installed app: toolchain management

Launch the installed CEditor → **Settings → Scripting Toolchains**.

**Expected:** the languages you ticked show "Installed"; others "Not installed" with working Install
buttons. (This is the same panel as A2, now running from the install dir — proving `ceditorSourceRoot()`
finds `tools\` beside the exe.)

**Proves:** the installed app manages toolchains.

> **Export from the installed app:** a full VST3 export needs the C++ build environment (source + CMake +
> compiler) because each panel needs a unique compile-time FUID. A GUI-only install therefore cannot do a
> full VST3 export by itself — run exports from the source checkout (Track A) until the standalone/CLAP
> compiler-free path lands. The installer's job here is the editor + toolchain management.

---

## Quick triage

| Symptom | Where to look |
|---|---|
| `verify-all` fails | the named sub-check under `tools/scripts/nativeHandlers/**` |
| App won't build | `ValueTreeBridgeHandlers.cpp` / `ValueTreeBridge.h` compiler error |
| Toolchain panel empty | Node not on PATH, or `tools\toolchains\languages.mjs` missing from the run dir |
| A language skipped at export | the `⚠ <lang>: NOT built — <reason>` console line |
| Re-export still rebuilds Vite | a `CE/web/src` file changed (expected); else check `forceWebBuild` |
| CC 25/26 missing in DAW | the export console's csharp/java lines; multi-instance → confirm the build is post-`650530f` |
