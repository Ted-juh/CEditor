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
| **C++** | `llvm-mingw` (`+ninja`) | (shared w/ base) | **same compiler the base plugin build uses** — effectively free once you can build a plugin at all |
| **C#** | `dotnet` SDK **+** `llvm-mingw` (shim) | ~230 MB | Roslyn + self-contained CoreCLR |
| **Java** | `jdk` (javac/jlink) **+** `llvm-mingw` (shim) | ~195 MB | bytecode + jlink'd JRE |
| *(base plugin build)* | Visual Studio **or** `llvm-mingw` + `ninja` + Node.js | (varies) | required to export ANY plugin |

Two facts that shape everything below:
1. **C++ is "free"** — its toolchain (`llvm-mingw`) is the same one that builds the plugin shell when
   there's no Visual Studio. If you can export at all, you can export C++ handlers.
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

### 3a. Decouple the base plugin from a per-panel native compile (the big one)

Today every export **recompiles the native player** because the plugin **identity** (GUID, plugin code,
product name) is **baked in at compile time**, so each panel needs its own binary.

**Make the player a runtime-parameterized template.** Ship ONE prebuilt player binary per format
(VST3 / standalone / CLAP) inside the install. To export a panel:
1. **Copy** the template binary into the `.vst3` bundle (no compile).
2. Write the panel's **identity + `.cepanel` + assets** as **resources beside the binary** (the player
   already loads `.cepanel`/web from disk at runtime — extend that to identity).
3. Bundle Python / native-handler modules as today (these are separate files the player `dlopen`s).

Result: exporting a **Lua / JS / TS / Python** panel needs **no C++ compiler and no `vite build`** — the
web bundle is panel-independent and already prebuilt as `web/dist` (reuse it; stop rebuilding per
export). This covers the majority of users with a **compiler-free, seconds-long** export from the
installed app.

Caveat: VST3/AU/CLAP each require a *unique, stable* plugin ID per product. Runtime-loaded identity is
fine for the host's plugin-instance routing **as long as the ID is stable per product** — which it is
(derived from the panel GUID, as the exporter already does). Hosts cache by the binary's reported ID, so
the template must report the *panel's* ID at load, read from the sidecar resource. This is the one real
engineering risk to validate per format.

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
