# CEditor Project Review — 2026-07-02

> **Status update (2026-07-02, end of day): the entire "order of attack" table is DONE.**
> 1–7: CI workflow + CTest wiring, `deserializePanel` guard (+tests), `utils/primitives.js` dedup
> (25 copies across 23 files), ScriptRuntime message-thread asserts, failed-script tracking,
> bridge path validation + `setPropertyRejected` requestId ack with JS auto-resync, empty
> `CE_VST_PANEL_PATH` default, LICENSE = AGPLv3 (owner decision; see docs/license-decision.md).
> 8: CanvasControl 5,714→4,100 lines (3 pure-JS modules); CustomDesignSurfaceEditor 8,800→7,550
> (2 geometry/helper modules + CustomArpeggiatorEditor + CustomStateFilmstrip children).
> 9: DeviceProfileService.cpp 3,597→7 per-concern translation units behind the unchanged facade;
> deviceProfiles.js 2,733→97-line re-export facade over 7 modules with one-way imports.
> 10: local profile saves now run full schema/reference validation (surfaced, non-blocking);
> echo window honors role `timingOverrides.echoWindowMs` → profile `timing.echoWindowMs` → 500ms
> default; `stores/deviceConstants.js` replaces ~100 inline `'mainSynth'` literals in 26 files.
> All verified: 358/358 JS tests, Vite build, full C++ Debug build, 6/6 CTest, browser smoke
> (panel editing + custom-component designer). Layer-dock/palette extraction from the surface
> editor was deliberately skipped (too entangled to extract safely — documented by the refactor).

Honest assessment of the codebase as it stands (branch `claude/project-notes-local-pc-3wgy46`, ~103k lines frontend, ~13k lines C++). No changes made — this is a notes file. Items marked **[verified]** were checked directly in source; the rest come from a deep review pass and are believed accurate but re-check line numbers before acting.

**Overall verdict:** The architecture is genuinely good — uniform section/dot-path component model, clean bridge abstraction, correct threading model, disciplined Svelte 5 usage, serious tests, and a production-grade export pipeline. The problems are almost all *scale debt* (files that grew past maintainability), *missing safety nets* (no CI, no input validation at trust boundaries), and *silent-failure paths*. Nothing here is a rewrite; it's targeted hardening and decomposition.

---

## Top priorities (highest impact first)

1. **No CI at all** — no `.github/workflows/`, nothing. For a product whose core promise is "compile-per-panel export works on a clean machine," every toolchain/installer/export regression is currently caught only by you, manually, after the fact. One Windows GitHub Actions workflow (configure + build, run the C++ test exes, `npm test`, smoke-export a sample panel and verify the PLUGIN_CODE identity self-check) would be the single highest-ROI change in this list.

2. **Unguarded `JSON.parse` on panel open** **[verified]** — `deserializePanel()` at [panelModel.js:184](../CE/web/src/CE_Application/stores/panelModel.js#L184) calls `JSON.parse(json)` with no try/catch, and the call site in the `onPanelOpened` flow at [panels.js:1101](../CE/web/src/CE_Application/stores/panels.js#L1101) doesn't guard it either. A corrupted or hand-edited `.cepanel` file throws mid-listener: no user feedback, file appears unopenable. Wrap it, return a structured error, and surface "file is corrupted" in the UI.

3. **Silent script-load failures (C++ runtime)** — in `ScriptRuntime::loadScripts()` ([ScriptRuntime.cpp](../CE/src/Scripting/ScriptRuntime.cpp) ~line 60–89), a script that fails to compile/load is reported to the error sink but then simply dropped from the runtime. In an exported plugin the user's controls just stop working with no indication why. Track failed scripts and expose them (e.g. `getFailedScripts()`) so the player/editor can warn.

4. **No input validation on the JS→C++ bridge boundary** — `setPropertyFromPath()` ([ValueTreeBridgeState.cpp](../CE/src/ValueTreeBridgeState.cpp)) walks whatever dot-path JS sends and sets whatever property is named, with silent no-op on a bad path and no schema check on a "valid-looking" one. Two consequences: typo'd paths from the frontend fail silently (see also item 7), and once user Lua/JS scripts can drive properties, arbitrary tree writes become possible. Validate paths (reject empty/`..`/non-identifier segments), return an error to JS instead of silently ignoring, and consider a per-node-type property whitelist.

5. **The two giant Svelte files** — [CustomDesignSurfaceEditor.svelte](../CE/web/src/CE_Application/sections/CustomDesignSurfaceEditor.svelte) (8,804 lines) and [CanvasControl.svelte](../CE/web/src/CE_Application/editor/CanvasControl.svelte) (5,718 lines). Internals are actually clean (listeners cleaned up, runes idiomatic), but the size itself costs you: slow HMR on every touch, everything coupled to everything (layer dock, arp editor, hit zones, paint mode all share one scope), and no way to test concerns in isolation. Natural split for the surface editor: layer panel, part renderer, hit-zone editor, arpeggiator editor, interaction state machine, look/paint bar, thin shell. For CanvasControl: extract per-control-type rendering logic into pure JS modules and keep the component as an orchestrator. This is a 2–3 day job, best done before the files grow further.

---

## Frontend — state & data layer

6. **`deviceProfiles.js` is a god-store (2,733 lines)** — profile CRUD, MIDI routing, MIDI-CI discovery, preset scans, bulk dumps, echo suppression, conflict detection, and parameter compilation in one module, importing from two other stores. Hard to test and every new MIDI feature ripples through it. Split direction: `deviceProfileCatalog` (CRUD), `midiRuntime` (I/O + echo/conflict), `presetScans` (jobs).

7. **Fragile dot-path plumbing** — hard-coded prefixes/paths like `'Background.'` and `'Transform.scale'` scattered through [controls.js](../CE/web/src/CE_Application/stores/controls.js) and utils. A rename in `SECTION_DEFAULTS` breaks them silently (writes route nowhere — same silent-no-op behavior as the C++ side, item 4). Add a `validatePropertyPath(control, path)` used in dev builds at minimum, and pull magic strings (section names, device roles like `'mainSynth'`, profile statuses) into a constants module.

8. **Echo-suppression default may be tight** **[verified nuance]** — the window is `options.echoWindowMs ?? 250` ([deviceProfiles.js:363](../CE/web/src/CE_Application/stores/deviceProfiles.js#L363), and `1934`), so it *is* configurable per call — but nothing sets it, so effectively everything runs at 250ms. Slow/busy devices ACKing later than that will be misread as conflicts. Make it a per-profile timing field with a more conservative default, and log when suppression fires.

9. **No schema validation for device profiles** — profile JSON is parsed but not validated (missing `parameters[]`, dangling recipe references, etc. surface later as cryptic MIDI errors). A small hand-rolled validator (or Zod) that checks required fields and reference integrity at load would move failures to load time with a clear message.

10. **No request/ack correlation on `setProperty`** — JS sends, C++ applies (or silently doesn't), JS assumes success. Combined with items 4 and 7 this is how JS and C++ state can quietly diverge. An optional `requestId` echoed back in `propUpdate` would let the frontend detect rejected writes.

11. **Smaller maintenance items** — duplicate deep-clone implementations (panelModel's JSON round-trip, `utils/deepClone.js`, componentTypes' own) — standardize on one; `customComponentFactory.js` (2,136 lines) builds nested `Parts`/`ValueChannels`/`Behaviors` structures with magic keys and no validation — a typo'd key succeeds and does nothing; coordinate-mapping math duplicated between `sliderGeometry.js` and `customComponentMaterializer.js`; error conventions mixed (`{ok, error}` objects vs exceptions vs console.error-and-continue) — pick one.

---

## Frontend — UI components

12. **Small-utility duplication across ~8 files** — `numberOr()`, `clamp()`, `argbToCss()`, `safeSvgId()` are locally redefined in SliderFamilyRenderer, InteractivePartRenderer, PanelPreviewSurface, CanvasControl, SliderShapeFill, CustomDesignSurfaceEditor, NumberInput, SliderEditor. Thirty-minute fix: `utils/primitives.js`, import everywhere. Do this before the next NaN-handling bug gets fixed in only three of the eight copies.

13. **Fill/gradient editing logic triplicated** — BackgroundEditor, TextEditor, and CustomDesignSurfaceEditor each carry ~100–150 lines of near-identical `openGradientEditor` / `ensureFillGradient` / fill-mode / image-browse-requestId plumbing. Extract a shared fill-editor helper/factory.

14. **Other oversized editors** — CustomDesignerEditor (3,468), CustomTestBenchEditor (2,424), TextEditor (2,351). Lower urgency than item 5, but TextEditor splits naturally into font controls / fill-layer panel / flow panel.

15. **Potential perf hotspot on large custom components** — `kitEntries` in CustomDesignSurfaceEditor (~lines 113–156) rebuilds a Map over all parts *and* hit zones on relevant updates, with several downstream `$derived` filters. Fine at current sizes; profile before optimizing, but worth knowing about if components with hundreds of parts appear.

16. **What's good here (worth preserving)**: Svelte 5 idiom compliance is essentially perfect across the sampled codebase — no legacy syntax, proper keyed each blocks, no effect abuse. Document/window listener hygiene is excellent (every drag flow adds and removes its listeners correctly). The Property* widget layer is genuinely reusable across 30+ editors.

---

## C++ / JUCE backend

17. **DLL pinning is documented design debt, not a bug** **[verified]** — `pinModuleResident()` ([NativeHandlerEngine.cpp:218](../CE/src/Scripting/NativeHandlerEngine.cpp#L218)) intentionally leaks a `DynamicLibrary` handle per C#/Java module because CoreCLR/JVM can't re-bootstrap in-process. The comment is honest and the leak is bounded (one per module path). Still, the cleaner shape is an explicit persistent-module lifecycle: init those runtimes once at plugin instantiation, make `reset()` a no-op for them, and log when a pin happens (currently silent — a failed pin produces the exact "second open is dead" symptom the recent commits were chasing).

18. **Message-thread contract is implicit** — `ScriptRuntime`'s header documents "message thread only," and current callers comply (MIDI callbacks marshal via `MessageManager::callAsync`), but nothing enforces it. One future direct call from the MIDI thread = intermittent crash. Cheap fix: `jassert(MessageManager::getInstance()->isThisTheMessageThread())` at the top of `dispatchEvent()` and other public entry points.

19. **Bridge callback lifetime** — the WebBrowserComponent native functions capture `this` (the bridge) raw. Teardown ordering currently protects you, but that's an unstated invariant; if the browser ever outlives the bridge during shutdown, a late JS event dereferences a dangling pointer. Either enforce destruction order explicitly with a comment, or have callbacks check a shared alive-flag / `Component::SafePointer`-style token.

20. **`DeviceProfileService.cpp` monolith (3,597 lines)** — MIDI I/O lifecycle, profile loading, MIDI-CI, sysex dump assembly, transaction queueing, preset-scan and bulk-send job state machines, persistence, and monitoring in one class. Same medicine as the JS twin (item 6): extract MidiIO / ProfileLoad / Transaction / Dump / Job sub-services behind the existing facade. High effort; do it before the next big feature lands in this file rather than after.

21. **C++ tests exist but aren't wired into CTest** — the six test executables build via CMake but there's no `enable_testing()` / `add_test()`, so nothing can run `ctest --output-on-failure`. Trivial to add and a prerequisite for item 1 (CI).

22. **What's good here**: the threading split (audio thread only drains an atomic MIDI collector; scripts on message thread) is correct and documented; every bridge property write goes through `UndoManager` with echo suppression during undo/redo; [NativeHandlerAbi.h](../CE/src/Scripting/NativeHandlerAbi.h) is exemplary ABI design (fixed-width types, explicit padding, `struct_size` versioning, no exceptions across the boundary, clear ownership rules); the tests validate real behavior contracts, not just smoke.

---

## Build, tooling, repo hygiene

23. **CI** — see item 1. This is the big one.

24. **`CE_VST_PANEL_PATH` defaults to a personal path** **[verified]** — [CMakeLists.txt:137](../CMakeLists.txt#L137) defaults to `C:/tmp/gaia-filter.cepanel`. Anyone (including future-you on a new machine) building without `-D` gets a plugin that silently looks for a file that doesn't exist. Default to empty and emit a clear CMake warning/`message(FATAL_ERROR)` when building the VST target without it.

25. **Governance files missing** — no LICENSE, CONTRIBUTING, or SECURITY (README says "to be implemented"). LICENSE matters most: without one, nobody can legally use or contribute to the code, and JUCE's GPL/commercial dual licensing constrains your choice — decide deliberately.

26. **Tracked artifacts** — `tmp/custom-component-preview-qa.md` is tracked; `CE/dpd/build/` and `CE/dpd/samples/` look like generated outputs under version control. Either gitignore them or add a note saying why they're intentionally committed.

27. **Python export is Windows-complete only** — the exporter links libpython on macOS/Linux but doesn't bundle the runtime, so Python-scripted panels exported there fail at runtime with no export-time warning. Until the bundlers exist, print an explicit warning at export time on those platforms.

28. **No formatter configs** — no `.clang-format`, `.prettierrc`, or `.editorconfig`. Solo project so low urgency, but adding them now costs nothing and prevents a giant whitespace commit later.

29. **What's good here**: git history is clean and readable with consistent message prefixes; dependency footprint is minimal (4 runtime npm deps); build artifacts and node_modules are properly ignored; the export pipeline self-checks JS-derived plugin identity against the C++ canonical implementation on every run — that's a great invariant; installer PowerShell uses `Set-StrictMode` + `$ErrorActionPreference = "Stop"`.

---

## Suggested order of attack

| # | Item | Effort | Why first |
|---|------|--------|-----------|
| 1 | Guard `JSON.parse` in `deserializePanel` + user-facing error | ~1 hr | Real crash path on corrupt files |
| 2 | `utils/primitives.js` dedup (item 12) | ~30 min | Zero risk, kills 8-way duplication |
| 3 | Threading asserts in ScriptRuntime (item 18) | ~30 min | Cheap insurance against a nasty class of bug |
| 4 | CTest wiring + minimal Windows CI (items 21, 1) | ~1 day | Everything after this is protected |
| 5 | Surface failed scripts to the UI (item 3) | ~half day | Ends the worst silent-failure mode |
| 6 | Bridge path validation + requestId ack (items 4, 10) | ~1 day | Closes the JS/C++ divergence gap |
| 7 | Fix `CE_VST_PANEL_PATH` default, add LICENSE (items 24, 25) | ~1 hr | Small, unblocking |
| 8 | Split CustomDesignSurfaceEditor / CanvasControl (item 5) | 2–3 days | Do before they grow more |
| 9 | Split deviceProfiles.js / DeviceProfileService (items 6, 20) | multi-day | Schedule around a quiet period |
| 10 | Profile-schema validation, echo-window config, constants module (items 7–9) | incremental | Fold into MIDI feature work |
