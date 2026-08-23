# Beta readiness review — 2026-08-10

**The question asked:** what is the program lacking before a first beta — features, unfinished
business? Then, on a second pass: *"I think a lot of 1 and 2 are done but not registered right in
the md files… go over it once again and report back for all the minor fixes."*

**That correction was right, and this document is the second pass.** The first pass leaned on the
planning docs where it should have leaned on the code, and two of its three headline findings were
wrong or overstated as a result. The corrections are recorded in §0 rather than quietly edited
away, because *the docs trailing the code* turned out to be the finding itself.

**Method.** A read of the tree at `e007732`, checked against the code and against CI rather than
against the planning docs. The web suite was run here: **2197 tests, 0 failures** at the time of
the review, **2233** after the fixes below; the script-export validator passes 7 of 9 languages
(Lua and C# skip for want of a local toolchain). CI on GitHub is **green on `main` at `e007732`**.

**This document is both the review and the record of acting on it.** §1 and §2 describe what was
wrong and, under each, what changed. §3 is what remains. §4 answers a follow-up question — what
about AU and CLAP? — which turns out to have three different answers.

---

## 0. Corrections to the first pass

| First pass said | Actually |
|---|---|
| "Phase 0 is paper-done — not compiled or tested." | **Wrong.** `ci.yml` configures with `CEDITOR_SCRIPTING=ON`, builds **all targets in Release**, and runs **six CTest suites** on every push to `main` and every PR — green at `e007732`. Inbound MIDI dispatches from `PluginProcessor.h:528-664`; `TimerManager` is held at `:1240` and `onTimer` dispatched at `:1185`. `ScriptRuntimeTests` covers timers crossing to the host, `PlayerScriptIntegrationTests` covers window-closed inbound MIDI and `onCcIn`. The roadmap banner claiming otherwise was written when there was no toolchain and never revised. **What is actually open is on-device verification — nothing has met a synth.** |
| "An installed CEditor cannot export — beta blocker." | **Overstated.** Export works, and is wired end to end from a source checkout: `Build → Build VST3` → `buildActivePanelVst3()` → bridge `buildVst3` → `ValueTreeBridgeHandlers.cpp:1173` → `export-panel-vst3.mjs` → a uniquely-identified VST3 in `export-out/`. The GUI-install refusal is a **deliberate, documented developer-install split** (`package-installer.ps1:163-167`, `windows-installer.md`), not a defect. It is a *decision to confirm* — which install do beta testers get? — not a bug to fix. |
| "Five smoke-test findings look untouched." | **Wrong — two.** Tracing each ID through the log: 001/002/003 fixed in `4f02a12`; 005, 007 (first half), 011, 012 in `4f16b59`; 006 in `02d3f10`. **009 and 010 need no patch** — `4f16b59` traces both to the same `DataCloneError` already fixed, and says so. Genuinely open: **004**, **008**, and the second half of **007**. |
| "42 component types." | **49.** The grep missed nested entries. The palette offers 47 of them (`Button` is a legacy base, `TestBox` is QA-only). This makes the Insert-menu gap *worse*, not better — see §2. |

Three of the five errors above came from trusting a status marker over the code. That is the
pattern worth fixing, and §1 is mostly that.

---

## 1. Minor fixes — the docs that no longer describe the program

All five were applied in this change; listed so the record shows what moved.

| # | File | Was | Now |
|---|---|---|---|
| 1.1 | `docs/roadmap.md:27,36-38` | Phase 0 "✅ DONE (code written, unverified by build)" + a ⚠️ banner saying "not compiled/tested (no build toolchain in the authoring environment)" | "built and tested in CI; not yet run against a synth", with the CI evidence and the real remaining gap named |
| 1.2 | `docs/roadmap.md:45-46` | Phase 1 "Visual QA pending a running build (no `node_modules` in this environment)" | QA-01 covers all four, and `qaPanels.test.js` fails if the sheet drifts |
| 1.3 | `docs/scripting-runtime-gaps.md` | Body said "✅ WIRED" while the **To-do checklist below it left the same three items unchecked**, and the JUCE table still read "**not** in the scripting layer yet" for timers | Checklist and table reconciled with the body; the two genuinely-open items (`buildDump` codec, `on()` in the C++/C#/Java preview interpreters) promoted out of a prose aside into the list |
| 1.4 | `tools/docs/panel-export-pipeline-plan.md:288` | C3 `getStateInformation`/`setStateInformation` "currently stubbed… **Deferred.**" | Shipped, and wider than the line asked for — APVTS state, device role→port mapping, script state and `ce.storage` in a sibling element |
| 1.5 | `CE/web/src/CE_Application/docs/component-gaps.md` | "Exists today" listed **14** component types | Snapshot banner: 49 exist, 47 in the palette, most tiers shipped; the four that genuinely remain are named |

Also: `docs/program-completeness-review-2026-08-03.md` now carries a superseded-in-part note, since
its headline finding (no preset layer) has since been built.

**And the reason they drifted:** nothing fails when they do. The repo already knows the answer to
this — `qaPanels.test.js`, `componentCoverage.test.js` and `panelApiParity.test.js` all exist
precisely because "a gap has no symptom, so the gap itself has to be the thing that fails."

**Done:** `insertPaletteCoverage.test.js` applies the same move to prose. It fails when
`component-gaps.md` or the QA README states a catalog size that is no longer true, and when a
design doc still claims Phase 0 is unverified by build while `ci.yml` builds and CTests it (the
test asserts CI still does, so if that ever stops being true the check retires with it). Writing it
found one more stale "unverified by build" that reading by hand had missed.

---

## 2. Minor fixes — the program (small, mechanical, high visibility)

> **Status: all of §2 is done** — §2.1–2.7 as listed, plus three that only surfaced while doing
> them: §2.8 (nine unbound shortcuts, the largest single thing in this pass), §2.9 (CE-BETA-004)
> and §2.10 (CE-BETA-008). Each entry keeps its original diagnosis and records what changed.
> Verified by the web suite and a production build; the C++ additions compile in CI, not locally.

Ordered by ratio of user-visible improvement to effort.

### 2.1 Five dead menu items — `MenuBar.svelte`

All five are `action: () => {}`. They open nothing and give no feedback. Three have their
implementation already sitting in the tree:

| Line | Item | Fix |
|---|---|---|
| 144 | `Export Settings…` | `requestPropertiesTab('export')` — the tab exists (`PropertiesPanel.svelte:175`) with plugin name, version, vendor, mfr code, GUID, derived plugin/AU/CLAP ids and the scripting-module list. One import, one call. |
| 143 | `Panel Properties…` | `requestPropertiesTab('core')` — same store (`stores/propertiesTab.js`), already used by `CanvasContextMenu` and `DeviceInsight`. |
| 155 | `Validate Active Script` | `validateScript(script, panel)` exists (`scripting/scriptValidate.js:63`) and already runs live in the Behavior Designer. Either jump to that problems list or drop the item as redundant. |
| 148 | `Build Standalone` | The target already exists — `CEditorPlayerVST` declares `FORMATS VST3 Standalone` (`CMakeLists.txt:219`), so JUCE emits `CEditorPlayerVST_Standalone`. The exporter builds only `CEditorPlayerVST_VST3` (`export-panel-vst3.mjs:370,380`). Adding the second target + copying the `.exe` is the smallest honest step toward the README's "or a standalone application". |
| 150 | `Build Settings…` | No backing feature. **Delete it** rather than ship a no-op. |

A dead menu item is worse than an absent one: it reads as a broken program rather than a scoped one.

**Done.** All five, as diagnosed. `Build Settings…` is gone; the other four do what they say.
Standalone builds land in `export-out/<name>/` so the Python runtime and any compiled handlers sit
beside the executable, the relationship they already have inside a VST3 bundle, and both formats
now appear in the Export tab as well as the Build menu. `Validate Active Script` became **Validate
Scripts** and checks every script in the workspace: which one is "active" is local state inside the
Behavior Designer, and the document's own `activeScriptId` can be empty, so the honest label is the
one describing what it can actually answer.

### 2.2 The Insert menu offers 11 of 47 components

`MenuBar.svelte:129-140` routes to 11 types. The palette (`IconPanel.svelte`) has 47. The 37 with
no menu route include Knob, Slider, Listbox, TextInput, Image, Meter, Envelope, Matrix,
CustomComponent and the entire generative-MIDI family. Anyone working from the menu bar concludes
the program has eleven components — which is roughly the 2024 answer.

Generate the menu from `COMPONENT_TYPES` (or from the palette's own grouping) rather than
maintaining a second hand-written list. That also stops it drifting again, which is how it got here.

**Done.** Both surfaces read `models/insertPalette.js`. Icons stayed in `IconPanel` keyed by type —
lucide icons are Svelte components importing TypeScript, which the node harness cannot resolve, so
holding them in the data module would have made the data untestable, and being testable is the
point of moving it. `insertPaletteCoverage.test.js` fails when a type has neither a palette entry
nor a written reason in `NOT_IN_PALETTE`, and when an icon is missing.

### 2.3 Help is two items, and the docs are unreachable

`Help` contains `Keyboard Shortcuts` (F1) and `About CEditor` (a `window.alert` with build sha,
branch and time). Meanwhile the repo carries a full scripting manual, a cookbook, a
getting-started, a generated API explorer with a screenshot of every component, and 56 design docs.
None is reachable from inside the program.

Two things are needed, both small:

1. **An open-external bridge.** There is none today — no `launchInDefaultBrowser`, no
   `revealToUser` anywhere in `CE/src` (grep confirms). A single bridge handler wrapping
   `juce::URL::launchInDefaultBrowser` unlocks every doc link, plus "Reveal in folder" after an
   export (pipeline E4) and the bug-report item in §2.5.
2. **Stage `docs/` in the installer.** `package-installer.ps1` stages `tools/` and the web bundle;
   `docs/` is not staged at all, so even a wired Help link would point at nothing in an installed
   build. One `Copy-Item` and one `[Files]` line.

Then: Help → Scripting Manual · API Explorer · Cookbook · Getting Started. The content is written.
It is a wiring job, not an authoring job.

**Done.** `openExternal` is a new bridge event — a `url` launches the browser (http/https only;
`file:` and shell handlers are a way to run something local through a link), a `path` reveals a
file relative to the install root and refuses anything escaping it. Refusals come back as
`openExternalFailed` and are shown, because a menu item that silently does nothing is the failure
this whole section is about. `package-installer.ps1` stages `docs/`, and `CEditor.iss` installs it.

### 2.4 No Recent Panels

Script workspaces track `recentFiles` twelve deep (`scriptWorkspace.js:149-157`). Panels do not, so
reopening yesterday's work means a file dialog every time. The persistence layer is already there
(`persistOpenPanelPaths` in `panels.js` writes open-panel paths to C++ settings) — this is the same
mechanism pointed at a different list.

**Done.** `recentPanelPaths` persists beside the two lists `AppSettings` already keeps; File shows
the five most recent under Open Panel with their containing folder beside them, since a panel and
its backup routinely share a name. One catch worth recording: the `menus` object was a `const`
built once at init, so a reactive list read as permanently empty — it is `$derived` now.

### 2.5 No bug-report path

Zero hits for Sentry, crash reporting or in-app feedback. For a beta this is the feedback loop
itself. Cheapest useful version, once §2.3's bridge exists: a Help item that opens a GitHub issue
URL prefilled with `buildInfo.sha`, branch and build time — the same three values `About` already
has in hand.

**Done.** Help → Report a Problem…, riding the same `openExternal` bridge.

### 2.6 Say the unsaid things

- **Unsigned.** No `signtool` / `codesign` / notarization anywhere. The installer and every
  exported `.vst3` will trip SmartScreen. Fine for a beta — not fine silently.
- **AGPL.** Exported panels link JUCE and inherit the obligation. Nothing in the app mentions it;
  `About` shows build metadata only. A line in About and a line on the Export tab.
- **Windows-only.** WebView2 and `dwmapi` link unconditionally on all three targets
  (`CMakeLists.txt:130-131, 180-181, 269-270`); the mac/Linux branches are marked UNVERIFIED.

**Done** for the first two, which are the ones a user can act on: About states the AGPL obligation
and the unsigned build, and the Export tab carries both as a "Before you share" note where someone
is actually about to ship something. Windows-only is left to the release notes — it is a fact about
the download, not about a panel.

### 2.7 Small remaining seams

- **Four DPD Designer screens are placeholders** — Packing Studio, Share & impact, Import result,
  Assignable list (`DeviceProfileDesignerV2.svelte:129, 209-214`). They sit in the navigation, so
  every DPD user finds them. Either build or hide.
- ~~**Two DPD Parameters buttons ship disabled** with `title="Coming soon"`~~ *(fixed 2026-08-23)* —
  both removed. Neither feature is built; both are recorded in `known-issues.md`, along with why
  MIDI learn here is not the same thing as `MidiLearnChips.svelte`.
- ~~**Display panel Effects tab** is a placeholder: "full editing coming soon"~~ *(fixed)* — the tab
  is real; `DisplayPanel.svelte:43` now carries only a comment recording that it used to say so.
- **`.gitignore` is 1925 lines / 140 KB**, most of it a dead `Source/CPanel_Build/modules/juce_*`
  list from a tree that no longer exists.

**Done.** The DPD screens are badged and dimmed in the tree, and each says what it will do and
where the same job can be done today — a dead end becomes a redirect. `.gitignore` is 1.5 KB;
`git ls-files 'Source/*'` returned nothing and `git status` is unchanged, so nothing relied on it.
The two "Coming soon" DPD buttons and the Effects placeholder are left as they are: they are
honest, in place, and inside sections that are otherwise working.

### 2.8 Nine of the menu's eighteen shortcuts were bound to nothing — including Ctrl+S

Not in the original list, because it took chasing CE-BETA-007 to find. The QA pass reported that
"File Save/Save As and keyboard save shortcuts remained unavailable" inside the custom-component
designer, which read as a designer problem. It was not.

`MenuBar.svelte` prints eighteen shortcuts. Nine had no handler anywhere in the web source:
**Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+W, Ctrl+A, Ctrl++, Ctrl+- and Ctrl+0.** `App.svelte`'s
global handler covered F1, Ctrl+Shift+P, Ctrl+, and undo/redo; `utils/editorShortcuts.js` covered
select-all, clipboard and zoom, but only while the canvas has focus. **Ctrl+S did nothing, on any
document type, in any tab.**

And where Save *was* reachable, it went to the wrong document: with a component tab in front, both
the menu item and any save path fell through to `saveActivePanel()` and silently wrote the panel.
That is the real CE-BETA-007 symptom — not that saving was unavailable, but that it saved something
else.

**Done.** The nine are bound, as a fallback *after* the canvas — the handler returns early on
`defaultPrevented`, so `editorShortcuts` still wins where it already handled a key. Ctrl+S is the
one exception to the typing guard: every other shortcut is suppressed while the caret is in a field
(Ctrl+A in a text box means select the text), but that is exactly when you reach for save, so it
blurs to commit the edit in progress and then saves. Save routes by tab type, and in a component
tab opens Publish → Package Library, where a custom component is actually saved, and says so.

`shortcutBindings.test.js` scrapes the shortcuts the menu prints and fails on any with nothing
listening. A missing binding has no symptom — no throw, no log, the key just does nothing — so the
absence has to be the thing that fails.

### 2.9 CE-BETA-004 — the panel's Background Image layer

Also not in the original list as a *fix*, only as an open finding. Turning the panel's Image layer
on set the flag and appeared to do nothing else: no enabled state, no editor, no way to pick an
image, and right-click inert although the tooltip promises it edits.

The cause is that there are two background inspectors. `sections/BackgroundEditor.svelte` serves
components; `panels/PanelCardContent.svelte` carries its own copy for the panel, against the older
flat `bg*` property model. The component one grew toggle-reveals-and-picks and right-click-to-edit;
the panel one kept a bare flag toggle, and the section that flag reveals defaults to collapsed and
renders below Z-Order and every other layer — so the only feedback was a collapsed header appearing
offscreen. The tooltip the report quotes belongs to the *component* inspector, which is why the
instruction on screen was true of one surface and not the other.

**Done.** Enabling a panel layer expands that layer's section, and an asset layer with no asset
opens the file picker — the only useful next step. Right-click edits, and reveals whether or not
the layer was already on. Merging the two inspectors is a bigger change than a QA fix should carry
(different property models), so `backgroundLayerParity.test.js` holds them to the same contract
instead: the same promise in the tooltip, and a handler behind each half of it, on both surfaces.
### 2.10 CE-BETA-008 — the generated Dial Control, and why it did not need the app

Filed as *suspected* and left open on the grounds that confirming it meant driving the running
program. It did not. The entire finding is the options object the Value Control kit hands
`createBehaviorModule`.

The dial was created with nothing but `geometry: 'circular'`, which leaves the factory defaults
`dragMode: 'auto'` and `wheel: false`. Auto resolves circular geometry to **absolute angle** mode —
the value is wherever the pointer sits relative to the centre. So the knob gesture (press at the
centre, drag straight down) jumps on press, then pins at the bottom of the angular sweep and reads
the same value for the rest of the drag. Driven through the real resolver, before the fix:

```
press 0.833 → 0.000 → 0.000 → 0.000 → 0.000
```

Not "no response": one jump, then dead. Which is what a tester sees and reasonably reports as
inert. After: `0.500 → 0.417 → 0.333 → 0.250 → 0.167`.

**Every hand-made dial in the repo already had this right** — the cutoff dial in
`customComponentStressTest.js` says `dragMode: 'vertical', interaction: { wheel: true }`. The
generator was the only dial that did not, so the control a user is most likely to reach for first
behaved unlike everything around it.

The config moved out of `CustomDesignSurfaceEditor.svelte` into
`customDesignSurfaceHelpers.valueControlBehaviorOptions`, because a config assembled by hand inside
a 4,000-line component is a config nothing can check. `generatedValueControl.test.js` drives the
real resolver through the real options; reverting the fix fails three of its five tests.

The scale styles are deliberately untouched — their geometry already resolves to a relative drag
mode, they were never in the report, and their wheel default is not mine to change. Pinned so the
dial fix cannot alter them.

---

## 3. What is genuinely still open (not minor)

Everything above is small. These are not, and they are what a beta decision actually turns on.

1. **On-device verification.** Nothing in the repo has met a synth. QA-06 says it of itself: it
   proves the bytes we would send, not that the synth liked them. This is the one item the
   authoring environment structurally cannot close.
2. **All twelve QA findings are now closed in code.** 004 and 007b in §2.9 and §2.8;
   **008 in §2.10** — and it did not need the running app after all, which is worth recording,
   because "this one needs a person" was the reason it stayed open for four days. What remains is
   a **re-test of 009 and 010**, whose root cause was fixed in `4f02a12` and which nobody has
   confirmed against a build containing the fix. That is confirmation of a fix, not an open defect.
3. **Which install do beta testers get?** A GUI install cannot export, by design. That is a fine
   answer if the beta is "design panels, report bugs" and a fatal one if it is "ship a plugin."
   Decide, then say so in the release notes.
4. **The QA sheet suite is 8 of 8.** *(closed)* QA-03 (15 stateful types × 7 states), QA-04
   (7 languages × 37 events), QA-05 (23 verb families / 426 verbs beside the components they
   drive), QA-07 (all 14 custom-component starters, built through the designer's own patch and
   printing their readiness verdicts) and QA-08 (the export parameter list) now sit alongside the
   original three. Each carries a coverage ratchet in `qaPanels.test.js` that reads its list from
   the model, so the suite cannot fall behind it.

   Two things the new sheets surfaced while being built, neither of them a sheet problem:

   - **Forty of the fifty component types export no host parameter**, and not all of that is
     deliberate. Five decline for a stated reason — a `Behavior` that calls itself a trigger or a
     text field. The other thirty-five have **no `Behavior` section at all**, so
     `deriveExportParameters` never looks at them, and the list includes `Crossfader`, `Ribbon`,
     `VectorJoystick`, `Meter`, `Macro`, `Envelope` and `Matrix` — things a user would plainly
     expect to automate. QA-08's third group is that list, and reading it is a judgement somebody
     has to make before the beta, because the failure is invisible in the editor and only appears
     in a host.
   - **`Numpad` carries a `Value` section and no `Behavior`**, which is the same gap with a
     sharper edge: it stores a value and still exports nothing.

   CI also does not run the export smoke test or the installer packaging, by `ci.yml`'s own
   header. That is unchanged.
5. **No way in, no way out.** New Panel is a blank canvas across four designers; no templates, no
   example panels, no first run. ~~The Auto-Panel generator (DPD → a bound working panel) is still
   unbuilt and would *be* the onboarding for the core use case.~~ *(fixed — File → New Panel from
   Device Profile turns a profile into a bound, adopted panel: 793 GAIA parameters become 1624
   controls, each with its real range, choices and label. See
   `CE/web/src/CE_Application/docs/auto-panel.md`.)* Outward: ~~no panel package format
   (custom components have one; panels do not)~~ *(fixed — File → Share Panel... writes a
   `.cepanelpkg` with every image embedded, File → Open Shared Panel... reads one back; the
   author's file path and bound MIDI ports are stripped on the way out)*, no Ctrlr
   `.panel`/`.bpanelz` importer, no update channel. The documentation half is closed: Help →
   Documentation carries the scripting manual, cookbook, getting-started, release notes and known
   issues, searchable and baked into the bundle.
6. **Export polish**: pipeline **D1** (GUID registry / "update vs new copy") unbuilt, so two panels
   can collide FUIDs; **E1–E5** unbuilt, so there is no build log surface, export history or
   "Reveal in folder"; ~~every parameter maps to `AudioParameterFloat`~~ *(fixed)* — the editor now emits a
   `valueKind` and `PanelParameters.h` branches on it, so a selector arrives as an
   `AudioParameterChoice` with its real option names and a toggle as an `AudioParameterBool`. The
   two shipped hardware panels gained 32 (GAIA) and 58 (AN1x) named menus that were anonymous
   numbers before; `getNumPrograms()` returns 1
   (`PluginProcessor.h:213`), so there are no host-visible programs; `buildDump` still returns an
   empty var (`:809`).

7. **Formats beyond VST3, LV2 and Standalone** — see §4. AU is blocked behind the macOS port; CLAP
   needs a third-party wrapper. LV2 shipped.

8. **Code signing — decided: unsigned for the beta, a certificate before v1.** §2.6 already covers
   the beta half, and it is covered properly: About states the unsigned build and the Export tab
   carries it as a "Before you share" note, so nobody meets SmartScreen without warning. What is
   recorded here is the other half, which was previously only a line in `known-issues.md` and would
   have retired with it. **An Authenticode certificate is a v1 blocker, not a beta one.** Unsigned
   is defensible while testers are people who chose to install a beta; it is not defensible for a
   download aimed at strangers, where a SmartScreen wall is indistinguishable from malware to the
   person reading it. The cert has to be in hand *before* the v1 packaging run, and OV validation
   takes days, so it is a lead-time item rather than a build item — which is exactly the kind that
   gets discovered on the day it blocks the release.

---

## 4. AU, CLAP and LV2 — what each actually needs

`PanelExportIdentity.h` derives an **AU subtype** and a **CLAP id** from the panel GUID, and the
Export tab shows both. Nothing consumes either. The identity work is real and correct — it is the
formats that are absent, and in three different ways.

### AU — blocked behind the macOS port, not behind the exporter

JUCE 8.0.7 supports AU natively: `JUCEUtils.cmake:2299` lists `AAX AU AUv3 LV2 Standalone Unity
VST3`. But AudioUnit is a **macOS format** — JUCE's AU plumbing is `if(NOT APPLE) return()`
throughout (`_juce_configure_bundle`, `_juce_add_xcode_entitlements`). No Windows build can produce
one, whatever the exporter asks for.

So AU is not an exporter flag. It sits behind the macOS port, which sits behind WebView2 and
`dwmapi` being linked unconditionally on all three targets (`CMakeLists.txt:130-131, 180-181,
269-270`) and the mac branches being marked UNVERIFIED. That is weeks of work on a platform the
project has never built for, and no part of it is small.

### CLAP — achievable on Windows, needs a dependency JUCE does not have

**JUCE has no CLAP support at all** — CLAP is absent from that format list, and there is no mention
of it anywhere under `JUCE/`. Producing one needs
[`free-audio/clap-juce-extensions`](https://github.com/free-audio/clap-juce-extensions), which is
not vendored here.

Verified against the real wrapper (cloned and read, not recalled):

- The entry point is `clap_juce_extensions_plugin(TARGET <juce_plugin_target> CLAP_ID "..."
  CLAP_FEATURES ...)` (`cmake/ClapTargetHelpers.cmake:192`). `CLAP_ID` is mandatory —
  `FATAL_ERROR` without it — and we already derive exactly that string.
- It creates a `<TARGET>_CLAP` target, so the exporter gains a third target name alongside
  `_VST3` and `_Standalone` rather than a second pipeline.
- On Windows the artefact is a single file: `<output dir>/CLAP/<product>.clap`
  (`PREFIX ""`, `SUFFIX ".clap"`), which fits the existing copy step.
- It is cross-platform and builds on Windows today.

What it costs: a third-party dependency fetched at configure time (the repo already does this for
Lua and sol2 via `FetchContent`, so the pattern exists) plus its `clap-libs` submodules, and CI
build time. The wrapper's own examples pin JUCE 7.0.6, so **JUCE 8.0.7 compatibility is the one
thing that has to be proven by building** — which this authoring environment cannot do.

### LV2 — free, available, and now shipped

Worth naming because it is the cheapest format on the list and did not appear in any plan. JUCE
8.0.7 supports LV2 natively and builds it on Windows, gated only on `JUCE_WINDOWS_HELPERS_CAN_RUN`
— and **`JUCE/bin/JUCE-8.0.7/juce_lv2_helper.exe` is already vendored and committed**, because the
CI fix that committed the JUCE helpers brought it along. (Belt and braces: the manifest-helper
*source* ships in the install too, and JUCE builds it if the target is absent — the same path VST3
already takes and proves green.)

**Done.** `FORMATS VST3 Standalone LV2` plus an `LV2URI`. LV2 identifies a plugin by URI rather
than a 4-char code, so `PanelExportIdentity` gained an `lv2Uri` derived from the same GUID as
everything else — a `urn:ceditor:<vendor>:<name>:<hash>`, a URN rather than a URL because no domain
is owned per panel and an http URI resolving to nothing is worse than one that never claimed to.
The exporter takes `--lv2` and builds `CEditorPlayerVST_LV2` into `export-out/<name>.lv2`; Build →
Build LV2 and the Export tab both reach it. Reaches Ardour, Reaper, Bitwig and the Linux hosts.

**And it surfaced a real bug that had been latent since `clapId` was written.** The C++ and JS
short-guid derivations disagreed for about one GUID in twenty. C++ took the first eight characters
of the *printed* hash and `toHexString` drops leading zeros, so a zero top nibble slid the window
one place; JS always shifted and zero-padded. Measured at 5.2% over 50k synthetic GUIDs —
`panel-3900` gives JS `0c37fa31` against C++ `c37fa31f`.

Nothing had noticed because `clapId` was the only consumer and no CLAP is built. LV2 makes it
load-bearing: the exporter passes the **JS** value to CMake, so the shipped plugin would have
carried one URI while the canonical C++ implementation and its own tests asserted another. C++ now
masks first. Pinned by value on both sides, because two derivations disagreeing is invisible from
either alone.

### Done: stop the Export tab implying the other two work

The AU Subtype and CLAP Id fields sat beside a working Plugin Code as populated read-only values,
which reads as "this build makes these". They are greyed, tagged (`macOS only` / `not built yet`),
and the section states plainly that this build exports VST3, LV2 and Standalone. The values
themselves stay visible and unchanged — they hang off the GUID, so a panel exported after the
formats land keeps the identity shown today.

---

## Suggested beta gate

1. **A re-test of 009/010** — all that is left of the twelve, and it is confirming a fix rather
   than finding one. CE-BETA-008 closed in code (§2.10).
2. **One session with a real synth.** Everything two-way is built and untested against hardware.
3. ~~**§2.1–2.7**~~ — done, plus §2.8, which was the largest single thing in this pass.
4. **Decide the installer question** (§3.3) and say it in the release notes.
5. **QA-03 and QA-08** — the two sheets covering where bugs actually get found. QA-03
   (states/interaction) is also what would have caught §2.8 and CE-BETA-008 without a person
   driving the app.

Deferred past first beta without much argument: AU (behind the macOS port), CLAP (needs the
clap-juce-extensions wrapper — §4), mac/Linux, the MIDI Workbench, the Auto-Panel generator, panel
sharing, the Ctrlr importer, i18n, accessibility, theming. LV2 was the exception and has shipped.

---

## One-line verdict

Further along than the planning docs said, and further along again after this pass: Phase 0 is
built and CI-tested, export works and now covers standalone, the preset librarian shipped, the menu
does what it advertises down to Ctrl+S, Help reaches the manual, and eleven of twelve QA findings
are closed. What is left is one bug that needs the app running, a decision about which install beta
testers get, and the one thing no amount of code review substitutes for — plugging in the synth.
