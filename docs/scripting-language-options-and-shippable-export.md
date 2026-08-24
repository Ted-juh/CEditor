# Scripting-language options + shippable export — design

How to (a) let users **choose which scripting languages** they install (so unused toolchains aren't
bloat), and (b) make **export work from an installed CEditor**, not only from a source checkout.

These two are intertwined: language selection only matters once the installed app can export at all.

---

## 1. Where we are today

- **Lua / JavaScript / TypeScript** ship inside the plugin via embedded interpreters / transpiled JS.
  No toolchain. Always available.
- **Python** ships an embedded CPython (provisioned `python-embed`, bundled into the plugin). No
  *compile* toolchain at export — the exporter just copies the runtime in.
- **C++ / C# / Java** are compiled at export into native handler modules, each needing a toolchain
  (verified, hosted-runtime model — see `CE/src/Scripting/native-handlers-design.md`).
- The **installed app cannot export**. The installer (`tools/installer/CEditor.iss`) stages only
  `CEditor.exe` + a prebuilt `web/dist`. Export (`tools/scripts/export-panel-vst3.mjs`) runs from a
  **source checkout**: it does a `vite build` of the web bundle **and** a CMake build of the native
  player. None of that is in the install tree.

### The language → toolchain map (the load-bearing table)

| Language | Toolchain needed at export | Size (download) | Notes |
|---|---|---|---|
| Lua | — | — | embedded interpreter |
| JavaScript | — | — | embedded (QuickJS) |
| TypeScript | — | — | transpiled to JS at export |
| Python | `python-embed` | ~11 MB | bundled INTO the plugin; no compiler |
| **C++** | `llvm-mingw` (`+ninja`) | ~178 MB | builds the ~100-line C shim, which contains no JUCE |
| **C#** | `dotnet` SDK **+** `llvm-mingw` (shim) | ~230 MB | Roslyn + self-contained CoreCLR |
| **Java** | `jdk` (javac/jlink) **+** `llvm-mingw` (shim) | ~195 MB | bytecode + jlink'd JRE |
| *(base plugin build)* | **Visual Studio Build Tools** + Node.js — or **nothing at all**, with a prebuilt template | (varies) | see §3a: the compiler is no longer required to export |

Two facts that shape everything below:
1. **C++ handlers need `llvm-mingw`** for their C shim. It was long believed that the same toolchain
   could build the plugin shell without Visual Studio; it cannot, and §3a explains why. The shim has
   no JUCE in it and is unaffected.
2. **C# and Java are the only heavy, optional downloads** (~230 / ~195 MB). These are the real "bloat"
   a user would want to opt out of. Python is tiny.

---

## 2. The question: how to offer language *options*

Three delivery models. They are **not exclusive** — the recommendation is a hybrid.

### Option A — Installer components (Inno Setup `[Types]` / `[Components]`)

A checkbox page at install time: *"Which scripting languages do you want?"* Each ticked box pulls in its
toolchain (downloaded during install, or bundled in a "full" installer variant).

```ini
[Types]
Name: "standard"; Description: "Standard (Lua, JavaScript, TypeScript, Python)"
Name: "full";     Description: "Everything (adds C++, C#, Java)"
Name: "custom";   Description: "Choose languages"; Flags: iscustom

[Components]
; Lua/JS/TS/Python are built in to the editor + the player; no component needed.
Name: "cpp";    Description: "C++ scripting (native handlers)";          Types: full custom
Name: "csharp"; Description: "C# scripting (.NET runtime, ~230 MB)";     Types: full custom
Name: "java";   Description: "Java scripting (JDK + jlink JRE, ~195 MB)"; Types: full custom

[Run]
; Each component triggers provisioning of its toolchain (provision.mjs already does the download).
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "llvm-mingw ninja"; Components: cpp csharp java; \
  StatusMsg: "Installing C/C++ build toolchain..."; Flags: runhidden
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "dotnet"; Components: csharp; \
  StatusMsg: "Installing .NET toolchain (~230 MB)..."; Flags: runhidden
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "jdk"; Components: java; \
  StatusMsg: "Installing Java toolchain (~195 MB)..."; Flags: runhidden
```

- **Pros**: familiar UX; "leave out the bloat" is explicit and up-front; offline after install.
- **Cons**: a 200 MB+ download *inside* the installer is slow and failure-prone (no good progress UI in
  Inno `[Run]`); the user must decide before they've even opened a panel; adding a language later means
  re-running the installer; needs Node present at install time (provision.cmd shells Node).

### Option B — On-demand provisioning from the app (recommended primary)

Ship a lean installer. The **first time a user exports a panel that uses C#/Java/Python**, the app
detects the missing toolchain and offers to fetch it:

> *"This panel uses C# handlers. CEditor needs the .NET toolchain (~230 MB, one-time). Install now?"*
> `[Install]` `[Skip C# this export]`

The exporter already emits the exact missing-toolchain hint (e.g. *"dotnet SDK not found — run:
`provision.mjs dotnet`"`); on-demand just turns that into a prompt + a `provision.mjs` call (the app
already shells Node for export, so the same Node runs provisioning, with a real progress bar).

- **Pros**: zero up-front bloat; you only ever download what a panel actually uses; robust (runs from
  the app with Node + a progress UI, not Inno scripting); trivially add a language later; the installer
  stays small and fast.
- **Cons**: a one-time download wait on first use of a heavy language; needs network at that moment.

### Option C — Hybrid (recommended)

- **On-demand (Option B) is the engine.** Languages light up when first used.
- The installer offers a single optional page *"Pre-install scripting toolchains (otherwise downloaded
  on first use)"* with the C#/Java/Python checkboxes (Option A), for users who want an offline-ready box
  or a one-time setup. Internally that page just runs the same `provision.cmd <ids>` that on-demand
  uses, so there is **one** provisioning path.
- A **Settings → Scripting toolchains** panel in the app mirrors it: shows each language as
  Installed / Not installed with an Install / Remove button (Remove = delete `tools/toolchains/<id>`).

This gives the explicit "leave out bloat" control the user asked for **and** keeps the installer lean
and the mechanism singular. Provisioning UI lives in one place; the installer page and the in-app panel
are thin front-ends over `provision.mjs`.

---

## 3. The prerequisite: make export work from an installed app

Language options are moot until the installed app can export. Today export needs a full source/build
tree. The fix has two independent wins; the first is large and unlocks the common case.

### 3a. Reduce per-export cost — what's actually feasible (corrected twice)

The original hope was "one prebuilt template binary, identity loaded from a sidecar, zero compiler."
A 2026-08 code audit **killed** that idea for VST3. A second look **revived it**, because the audit's
premise was right and its conclusion was not. Both rounds are kept here, because the shape of the
mistake is more useful than the answer.

**What the first audit found, and it was correct:**

- **VST3 FUID is compile-time.** JUCE derives the VST3 class id (FUID) from `PLUGIN_CODE` +
  `MANUFACTURER_CODE` (`#define`s baked at link time, `CMakeLists.txt` → `juce_add_plugin`; the FUID is a
  `const` in the VST3 wrapper). A single template binary would report the **same FUID for every panel**,
  so a DAW would treat all exported panels as one plugin and **break session loading**.
- **The per-panel build is already incremental.** Panel **data** is already runtime-loaded — the
  player reads the `.cepanel` from a path at load (`CEDITOR_PLAYER_PANEL_PATH`) and the web UI is embedded
  once. Only a handful of identity-dependent translation units change per panel (`[51/52] Linking`).
- **The avoidable cost was the web bundle.** **Done:** the exporter skips the Vite build when
  `CE/web/dist` is newer than the web sources.

**Where it went wrong.** From "JUCE derives the FUID from `#define`s" it concluded "each VST3 product
genuinely needs a unique *compile-time* identity". That does not follow. **The VST3 class id is
whatever the module's factory reports** — a `const` from `#define`s is JUCE's implementation choice,
not a VST3 requirement. The audit even listed "sidecar FUID via a custom VST3 factory" as a future
win two paragraphs later, without noticing it contradicted the conclusion above it.

**Done, and it removes the compiler entirely.** `getInterfaceId()` in JUCE's VST3 wrapper now
consults a runtime identity first (a four-line patch, `JUCE/VENDORED.md`), and
`CEDITOR_TEMPLATE_PLAYER=ON` builds a panel-agnostic player that reads both its identity and its
panel from the single `.cepanel` beside it. Exporting becomes a file copy:
`tools/scripts/export-panel-template.mjs`.

The ids it reports are **byte-identical** to the ones the relinking path produced, which is the part
that matters — a host keys plugins by FUID, so a session saved against a compile-per-panel export
must keep finding its plugin. `CE/tests/PanelIdentitySidecarTests.cpp` asserts that against JUCE's
own `convertJucePluginId`, for every interface type. It holds because only the last eight bytes of
the id carry identity, and they are literally the two four-character codes.

One trap worth knowing about, because it would have made the whole thing quietly wrong: JUCE writes
`Contents/Resources/moduleinfo.json` after linking, and that file **lists the class CIDs**. A copied
template ships its own manifest, so a host trusting it would see every panel claiming one FUID — the
exact collision this design prevents, reintroduced through a cache file. The template exporter
regenerates it (still compiler-free: `juce_vst3_helper` is a prebuilt executable that asks the
factory, which by then has the panel) or deletes it.

**The compiling path stays and stays the default on a source checkout.** It has the mileage, and a
checkout is a developer machine by definition. What has changed is that it is no longer the *only*
path, so "export runs from a source checkout" is a preference rather than a limitation.

Still true, and not fixed by any of this:

- **`llvm-mingw` cannot build the plugin shell.** The old "no Visual Studio" story rested on it and
  was never validated. JUCE `#error`s on `__MINGW32__` and `WebView2LoaderStatic.lib` is MSVC-mangled
  — see `tools/toolchains/README.md`. Where a compiler IS wanted, it is MSVC (Build Tools suffice).
- **Standalone / CLAP templating.** A *standalone* app has no FUID contract, so a single prebuilt
  standalone binary + a sidecar `.cepanel` + identity **is** viable — a compiler-free path for users who
- **Sidecar FUID via a custom VST3 factory.** The VST3 class id is whatever the module's factory reports;
  JUCE hard-codes it, but a patched factory could read it from a sidecar at module load. This removes the
  per-panel link for VST3 too — but it means maintaining a fork of JUCE's VST3 client wrapper (fragile;
  needs careful per-host validation). High-value, high-risk; deferred.

### 3b. Native handlers still compile per-panel (unavoidable, and that's fine)

C++/C#/Java handlers are the user's code — they must be compiled at export, needing the language's
toolchain. But this now only affects panels that **use** those languages, and slots straight into the
on-demand model: a Lua/JS/TS/Python panel exports compiler-free; a C#/Java panel triggers the one-time
toolchain fetch.

So the tiers the user experiences:

| Panel uses… | Export from installed app needs | Download |
|---|---|---|
| Lua / JS / TS / Python only | nothing (template player + bundled CPython) | — |
| + C++ handlers | `llvm-mingw` (+ninja) | base build toolchain |
| + C# handlers | `dotnet` (+ llvm-mingw) | ~230 MB, on first use |
| + Java handlers | `jdk` (+ llvm-mingw) | ~195 MB, on first use |

This is exactly the "only download what you script in" model.

---

## 4. What the installer must stage (for any of the above)

To export from `{app}`, the installer has to ship the export pipeline, not just the editor:
- `tools/scripts/**` (exporter + `nativeHandlers/**`) and `tools/toolchains/**` (scripts/manifest;
  binaries are provisioned, not committed).
- The exporter's Node dependencies. Audit `export-panel-vst3.mjs`'s imports: today it pulls `typescript`
  (TS transpile) from `CE/web/node_modules` and shells `vite`. Decoupling 3a removes the `vite`
  dependency; the residual (e.g. `typescript`) should be vendored into a small `tools/` `node_modules`
  staged with the app, **not** the full `CE/web/node_modules`.
- The prebuilt **template player binaries** (3a) per format.
- Point the app at the installed tools: `findExporter()` resolves from `CEDITOR_SOURCE_ROOT` or cwd —
  add `{app}` (the exe dir) to the search so the installed layout works.
- **Node.js**: the app already requires `node.exe` on PATH (it errors clearly if absent). Keep that as a
  documented prerequisite, or bundle a portable Node in the install (≈30 MB) so users are truly
  done-at-install.

---

## 5. Recommended staging

1. **On-demand provisioning (Option B)** — highest value, smallest change. Map language→toolchain (table
   in §1, already encoded in `index.mjs` guards), turn the exporter's missing-toolchain errors into a
   prompt + `provision.mjs` call with a progress UI. Languages light up when first used. *(Works even in
   the current source-tree workflow — immediate benefit.)*
2. **Settings → Scripting toolchains panel** — Installed/Not-installed + Install/Remove per language;
   thin front-end over `provision.mjs`. Gives explicit "leave out bloat" control.
3. **Export decoupling 3a (template player)** — the big unlock for installed-app export of the common
   (compiler-free) case; also makes *every* re-export much faster (no `vite`/CMake). Validate the
   runtime-identity-per-format risk first (VST3, then standalone, then CLAP/AU).
4. **Installer staging (§4) + optional component page (Option A inside Option C)** — once 3a lands, the
   installer can ship the template player + export pipeline and offer the pre-install language checkboxes.

Steps 1–2 are pure wiring over existing infra and pay off immediately in the current workflow. Step 3 is
the real productization effort and the prerequisite for a self-contained installed app. Step 4 is the
packaging layer on top.

---

## 6. Direct answer to "can the installer offer language options?"

**Yes.** Inno Setup `[Types]`/`[Components]` (Option A, sketch in §2) gives an explicit
choose-your-languages page, and each component runs the existing `provision.cmd <ids>` to fetch only
that language's toolchain. But the **better** mechanism is **on-demand** (Option B): the app downloads a
language's toolchain the first time a panel uses it — zero up-front bloat, only ever what you script in,
and adding a language later is automatic. The recommendation is the **hybrid** (Option C): on-demand as
the engine, with the installer page + an in-app Settings panel as thin, optional front-ends over the
same `provision.mjs`. Either way, only **C#** (~230 MB) and **Java** (~195 MB) are heavy; Python is
~11 MB and C++ rides on the base build toolchain.

---

## 7. Implementation status (this branch)

| Step | What | Status |
|---|---|---|
| 1 | **On-demand provisioning** | ✅ `tools/toolchains/languages.mjs` (lang→toolchain map, status, preflight, ensure/remove) + the exporter installs only the toolchains a panel's languages need, when missing (`autoProvisionToolchains` opt-out). Node-side verified (status/preflight + freshness checks run). |
| 1/3 | **Skip the panel-independent Vite build** | ✅ exporter rebuilds `dist` only when web sources changed (`webBundleFresh`); `forceWebBuild`/`CE_FORCE_WEB=1` overrides. Verified fresh↔stale flips. |
| 2 | **In-app Scripting Toolchains panel** | ✅ Settings → Scripting Toolchains (Installed / Install / Remove per language). C++ bridge (`toolchainStatus`/`provisionToolchains`/`removeToolchains` via a `ToolchainJob` mirroring `VstBuildJob`) + `bridge.js` wrappers + `ToolchainsSettings.svelte`. Web bundle builds clean; C++ compiles with the app. |
| 3 | **Template player** | ● Done (§3a). The sidecar-FUID route works and produces byte-identical ids; `CEDITOR_TEMPLATE_PLAYER=ON` + `export-panel-template.mjs`. Unvalidated in a real host — that needs Windows and a DAW. |
| 4 | **Installer language options + staging** | ✅ `CEditor.iss` `[Types]`/`[Components]` (Python/C++/C#/Java) with per-component `provision.cmd` `[Run]`; `package-installer.ps1` stages `tools/` (scripts only, binaries on demand); the app resolves the exporter from the install dir (`ceditorSourceRoot()` checks the exe dir). Inno/PowerShell not runnable in CI — needs a Windows packaging run to validate. |

**Caveat carried by 3 + 4:** a GUI-only install can *manage toolchains* (Settings panel) and the
installer can *provision* them, but a full **VST3 export still needs the C++ build environment** (source
+ CMake + a compiler) on a source checkout; an install with a prebuilt template exports with no
compiler at all (§3a). Historically a compiler-free path was thought to exist
only for **standalone/CLAP** (future 3a work). This is a JUCE/VST3 ecosystem constraint, not a CEditor
limitation.
