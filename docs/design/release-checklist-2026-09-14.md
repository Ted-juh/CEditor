# Release checklist — the gates, and where each one stands

Compiled 14 September 2026. Companion to two documents that answer different questions:
`release-readiness-2026-09-13.md` is the execution record of what was *done*;
`residual-issues-2026-09-14.md` is what is *known and not fixed*. This one is the gate list — what
must be true before a first public release, and which gates are currently met.

**Nothing here is an approval.** Of twenty-one gates: twelve are met, one is met in part, three are
open, three hold evidence that predates the fixes since, and two cannot be assessed from this
environment at all. The counts are written out rather than summarised as "most" because the last
version of this line said "three gates are unmet" while four were open, and a number nobody can
check against the table below is worse than no number.

---

## Legend

| | |
| --- | --- |
| **MET** | Evidence exists and was re-run against the current tree, or a decision has been taken |
| **PART MET** | One half of the gate is met and re-run; the other is named, with what it needs |
| **STALE** | Evidence exists but predates changes since; needs re-running, not re-doing |
| **OPEN** | Known work, owner named |
| **OFF-SITE** | Cannot be established here; needs the Windows machine or hardware |

---

## A. Behaviour of the shipped components

| Gate | State | Evidence |
| --- | --- | --- |
| A1. Every component family measured against its promised effect, not its property value | **MET** | Twelve suites, all re-run 14 Sep: curves 146, notes 204, motion 113, clock 81, harmony 82, steps 71, phrase 50, recorder 42, outbound 53, links 33, inbound 19, custom 32 / export 51. Zero open defects |
| A2. Every defect found carries a regression that fails on revert | **MET** | D-1 … D-19. D-15's revert was run explicitly and fails as predicted; so were all three of D-16, D-17 and D-18, each one reverted on its own so the failing row names the fix it belongs to. The same was done for the three §1d implementations of 14 Sep — reverting the link gate fails 7 of its tests, the asset strip 4, the font collector 5, and in each case the pre-existing tests still pass, so the change is additive |
| A3. Remaining unverified rows are honest and individually reasoned | **MET** | Six rows. Four are inspector actions the rendered control never performs; one is a runtime conditional; one is a statement of fact |
| A4. No declared option silently does nothing | **OPEN**, and seven fewer | The nine in `residual-issues` §1 stand, three of them live script verbs giving callers silence — see section E. **Seven of §1d's are now closed by implementation** (ruled 14 Sep): both `ExternalAPI` link switches, all three `linkPolicy` options, `Assets.packagePolicy.embedAssets` and `warnMissingFonts`, then `Core.tooltip` and `Core.screenReaderText` — the two a user is most likely to try, one of them an accessibility promise. `behaviourShared.mjs` went 4 verified / 5 inert → **14 / 1**, and `behaviourAssets.mjs` 1 / 2 → 6 / **0 inert**. Each fix reverted on its own and fails only its own rows |
| A5. Save/reopen in a fresh runtime for every family | **MET** | `kit.reopen()` clears storage, reloads the page and imports the document; every suite carries reopen rows |
| A6. The unit suite still passes with the behaviour fixes in | **MET** | 4,822 tests, 4,821 pass, 0 fail, exit 0 — re-run 14 Sep after D-15 changed `PanelPreviewSurface.svelte`. Matches the pre-change figure, so nothing regressed. The rehearsal tests, which cover the preview-session-versus-document distinction D-15 turns on, are green |

## B. The editor and the authoring stages

| Gate | State | Owner |
| --- | --- | --- |
| B1. Property-by-property coverage matrix exists and is reproducible | **MET** | `tools/scripts/qa/coverage-matrix.mjs`, documented in `coverage-matrix-2026-09-14.md` |
| B2. Every registered type reached by at least one half | **MET** | 58/58; `TestBox` is internal and not user-reachable |
| B3. The 241 unreached properties closed or consciously deferred | **OPEN**, pending §1d rulings | **66** now, and **the editor-and-shared half is closed**: nine suites (`behaviourMouse`, `behaviourTrack`, `behaviourButtons`, `behaviourScreens`, `behaviourLayout`, `behaviourWidgets`, `behaviourLists`, `behaviourShared`, `behaviourAssets`) — the last two re-run 14 Sep after five of §1d's inert options were implemented. The matrix cannot see an `inert`/`closed elsewhere` note, so most of the 66 are rows that HAVE an answer — recorded with their reasons in `residual-issues-2026-09-14.md` §1a–1d — plus the `Designer` block already ruled out of the denominator. Status changes to **MET** once the owner has ruled on §1d |
| B4. Authoring stages driven, not just renderers | **MET** | All six areas the row names are now driven. **Three already were, and the row understated it** — the same mistake C2's premise made: the panel editor by `editorWorkflows`/`editorAcceptance` (plus `insertFlyout`, `panelStrip`, `layers`, `controlPages`, `propertyFilter`, `dockOpeners`), the Screen Builder by `screenDock`/`screenTab`/`screenAnimation`/`screenRuntime`/`pixelSelection`, the Sequencer and Envelope designers by `designerTab`, and the Player/export half by `releaseWorkflow` and `behaviourWalkthrough`. **Three were genuinely undriven and are new, 14 Sep** — all three had heavy MODEL coverage and no browser coverage at all, which is the distinction this gate exists for: `authoringScripts.mjs` (7 rows) drives the Behavior Designer, which thirty-five script suites had never opened; `authoringSurface.mjs` (7) draws on the custom component design surface, which thirty-five custom-component suites had never drawn on; `authoringLinks.mjs` (4) builds a route through the Route Builder, which `behaviourLinks` and `behaviourCombined` both bypass by calling the engine directly. 18 verified, 0 defects |
| B5. A decision on `Designer` and `Assets` — session state, not behaviour | **MET** | Ruled 14 Sep. `Designer` (13 keys) struck as authoring-surface state; `Assets` (5) **kept** — `images`/`filmstrips`/`thumbnails` have 95/58/11 readers and `packagePolicy` decides whether a shared panel carries its artwork. See the matrix document |

## C. The combined panel

| Gate | State | Note |
| --- | --- | --- |
| C1. A panel carrying every built-in | **MET** | `CE/qa/QA-01-components.cepanel`, all 58 types over 125 controls, regenerated and server-rendered by `qaPanels.test.js` |
| C2. …carrying all 14 custom starters | **MET, by a different route than this row assumed** | The row said to extend `make-qa-panels.mjs` so QA-01 carries them. **That premise was wrong and the generator says why**: QA-01 is every component TYPE at its authored defaults, there is one `CustomComponent` type, and it renders as whatever package it carries — so placing it proves nothing about the real starters. QA-07 exists for exactly that and already builds all fourteen through `createCustomComponentStarterPatch`, the patch the designer's Starters flyout applies. Two sheets is right for looking at; it is not enough for asking whether the two KINDS interfere, so `behaviourCombined.mjs` builds that panel at run time — QA-01 plus the fourteen, 139 controls, using the sheet's own builder verbatim. All 139 mount and draw, and driving a built-in leaves every custom component untouched |
| C3. Interaction on that panel: independent gestures, linked outputs, several clocks at once, undo/redo, save/reopen, responsiveness | **MET** | `browser-checks/behaviourCombined.mjs` — **29 verified, 0 defects**. All 125 controls mount, draw and keep a box; dragging one moves one; the clock-driven components run together under one transport with no page error; undo takes back one control's move and leaves its neighbour alone, and redo returns it; a panel link built through the Links editor's own two functions carries 0.87 from one custom component's channel to another's; the whole panel serialises and reopens with the same 125 controls and 58 types still drawing. Then the same again with the fourteen starters added — 139 controls — where driving a built-in leaves every custom component untouched. Measured on the Linux container: opening 2,346ms, entering preview 3,183ms — reported rather than asserted, because the threshold is the owner's call |
| C4. A real create → configure → bind → preview → save/share → export walkthrough | **PART MET** — everything up to the compiler; the plugin half is open | `browser-checks/behaviourWalkthrough.mjs` — **17 verified, 0 defects**, one panel walked end to end, each step reading the output of the one before it. Create and configure; bind to `mainSynth`/`filter.cutoff` without the range being rewritten; preview, where dragging the control lands 114 in the bound device parameter (`recordDeviceParameterValue` runs only after `resolveParameterSend` succeeds, so a recorded value is proof the binding resolved rather than being refused) as a whole number, and the raw MIDI door stays shut because the role's destination is `previewOnly`; export, where `deriveExportParameters` describes it as 0..127, default 64, unit Hz, kind `float`, naming `filter.cutoff`; then File → Share Panel… through `sharePanelToFile`, with the author's file path and MIDI port name PUT on the panel first and both absent from the bytes handed to the bridge, and the package reopened into its own tab where the control still carries the range, the binding and its `kind`, and mounts at 300×70 in the real renderer. **What is still open is the plugin itself**: `tools/scripts/export-panel-vst3.mjs` and the build that wraps those parameters into a VST3 need Windows, and the 13 Sep native walkthrough predates D-1…D-19. The parameters are the half a DAW reads and they are now verified against the current code; the binary is not. |

## D. Native, packaging and the candidate itself

| Gate | State | Note |
| --- | --- | --- |
| D1. Windows Release build and native tests | **STALE** | 34 native tests passed; predates the later frontend fixes |
| D2. The installed bundle carries the current frontend | **OPEN** | RC3 is older than every fix from D-1 to D-19. Refresh before quoting any acceptance against it |
| D3. Native save / open / share / recovery | **STALE** | Walked 13 Sep, including malformed-package refusal |
| D4. Exported Player behaviour | **STALE** | VST3 export and the isolated native host passed 13 Sep |
| D5. Physical instrument MIDI, session restore, host performance | **OFF-SITE** | Every inbound check here injects at `latestMidiInputMessage`. That is the right seam for panel behaviour and says nothing about drivers, ports or timing |
| D6. macOS, Linux, other DAWs, other export formats | **OFF-SITE** | Not covered by the Windows evidence, and must not be implied by it |

## E. Decisions that block a truthful release note

These need a ruling rather than a test, and each is small.

| Item | Why it blocks | Smallest honest treatment |
| --- | --- | --- |
| `looper.quantize`, `constellation.showField`, `meter.showScaleLabels` | All three are **published script verbs with no reader**. A script author calls them and gets silence | Implement, or stop the API promising it. For the latter two the verb is *generated* from the section declaration, so removing the key removes the verb |
| The `show*` derivation itself | `derivedFlagVerbs` mints a script verb for **every** `show*` boolean in a section, read or not. This is a standing mechanism, not three accidents | Decide whether that derivation should require a reader |
| `Recorder.snapToScale` | An out-of-key note plays back exactly as recorded whatever it says — all four quantise arguments reach `quantizeTake`, whose only caller is the Quantise button | A line in the release notes. The design is defensible; the name is not self-explanatory |
| `Core.alwaysOnTop`, `ContentLayout.textAboveIcon`, `ChordPad.fieldColour`, `Envelope.xLabel`/`yLabel`, `StepSequencer.position` | Declared, unreachable, no symptom | Delete or implement. No urgency, but they should not ship undecided a second time |

---

## What "validated candidate" would require

Every **OPEN** gate closed or explicitly deferred with a reason; every **STALE** gate re-run against
the refreshed bundle (D2 first, since the others are quoted against it); and the **OFF-SITE** pair
either performed on real hardware or stated as an explicit limit in the release notes rather than
left for a user to discover.

The behaviour half (section A) is the closest to done and is the part this pass owned. Sections B
through D are where the remaining work is, and none of it is blocked on anything except the bundle
refresh and the decisions in E.
