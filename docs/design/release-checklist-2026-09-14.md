# Release checklist — the gates, and where each one stands

Compiled 14 September 2026. Companion to two documents that answer different questions:
`release-readiness-2026-09-13.md` is the execution record of what was *done*;
`residual-issues-2026-09-14.md` is what is *known and not fixed*. This one is the gate list — what
must be true before a first public release, and which gates are currently met.

**Nothing here is an approval.** Of twenty-one gates: sixteen are met, one is met in part, two are
open, none hold stale evidence, and two cannot be assessed from this environment at all. The counts
are written out rather than summarised as "most" because the last
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
| A1. Every component family measured against its promised effect, not its property value | **MET** | Twelve suites, all re-run 14 Sep: curves 146, notes 204, motion 113, clock 81, harmony 82, steps 71, phrase 50, recorder 42, outbound 53, links 33, inbound 19, custom 32 / export 51. The additional adversarial custom stress ledger contributes 17 verified rows. Zero open defects |
| A2. Every defect found carries a regression that fails on revert | **MET** | D-1 … D-19. D-15's revert was run explicitly and fails as predicted; so were all three of D-16, D-17 and D-18, each one reverted on its own so the failing row names the fix it belongs to. The same was done for the four §1d implementation groups of 14 Sep — reverting the link gate fails 7 of its tests, the asset strip 4, the font collector 5, and in each case the pre-existing tests still pass, so the change is additive. Claude also reverted the tooltip/accessibility resolvers: two unit tests and the first shared browser row failed |
| A3. Remaining unverified rows are honest and individually reasoned | **MET** | Six rows. Four are inspector actions the rendered control never performs; one is a runtime conditional; one is a statement of fact |
| A4. No declared option silently does nothing | **OPEN**, with the authorized release blockers closed | `Icon.tint`, child-click handling, all five Behavior emit flags, `allowMixed`, `looper.quantize`, `constellation.showField` and `meter.showScaleLabels` now have measured effects and save/reopen coverage. The residual six unreachable document fields in `residual-issues` §1 remain an explicit cleanup decision rather than a hidden release claim. The published-verb audit no longer reports the three script commands; its four Drum Pads candidates are computed-reader false positives |
| A5. Save/reopen in a fresh runtime for every family | **MET** | `kit.reopen()` clears storage, reloads the page and imports the document; every suite carries reopen rows |
| A6. The unit suite still passes with the behaviour fixes in | **MET** | Windows integration re-run on 14 Sep: **4,876 tests, 4,876 pass, 0 fail, 0 skipped**, exit 0; script-export checks 7 pass / 2 environment skips; frontend production build passed. Eight affected browser ledgers passed with **390 verified rows and zero defects**, plus the 17-row release walkthrough, the focused first-use workflow and 17-row adversarial custom stress ledger; see `integration-status-2026-09-14.md` |

## B. The editor and the authoring stages

| Gate | State | Owner |
| --- | --- | --- |
| B1. Property-by-property coverage matrix exists and is reproducible | **MET** | `tools/scripts/qa/coverage-matrix.mjs`, documented in `coverage-matrix-2026-09-14.md` |
| B2. Every registered type reached by at least one half | **MET** | 58/58; `TestBox` is internal and not user-reachable |
| B3. The 241 unreached properties closed or consciously deferred | **OPEN**, with the user-visible release set completed | **59** now, and **the editor-and-shared half is closed**. The matrix cannot see an `inert`/`closed elsewhere` note or every scripted/computed access, so most of the 59 have an individual answer in `residual-issues-2026-09-14.md` §1a–1d, plus the `Designer` block already ruled out of the denominator. `Icon.tint`, container child-click handling and the Behavior/script-command set are implemented. The 59 is a reproduced Windows source-scan count, not a count of behavioural failures |
| B4. Authoring stages driven, not just renderers | **MET** | All six areas the row names are now driven. **Three already were, and the row understated it** — the same mistake C2's premise made: the panel editor by `editorWorkflows`/`editorAcceptance` (plus `insertFlyout`, `panelStrip`, `layers`, `controlPages`, `propertyFilter`, `dockOpeners`), the Screen Builder by `screenDock`/`screenTab`/`screenAnimation`/`screenRuntime`/`pixelSelection`, the Sequencer and Envelope designers by `designerTab`, and the Player/export half by `releaseWorkflow` and `behaviourWalkthrough`. **Three were genuinely undriven and are new, 14 Sep** — all three had heavy MODEL coverage and no browser coverage at all, which is the distinction this gate exists for: `authoringScripts.mjs` (7 rows) drives the Behavior Designer, which thirty-five script suites had never opened; `authoringSurface.mjs` (7) draws on the custom component design surface, which thirty-five custom-component suites had never drawn on; `authoringLinks.mjs` (4) builds a route through the Route Builder, which `behaviourLinks` and `behaviourCombined` both bypass by calling the engine directly. 18 verified, 0 defects |
| B5. A decision on `Designer` and `Assets` — session state, not behaviour | **MET** | Ruled 14 Sep. `Designer` (13 keys) struck as authoring-surface state; `Assets` (5) **kept** — `images`/`filmstrips`/`thumbnails` have 95/58/11 readers and `packagePolicy` decides whether a shared panel carries its artwork. See the matrix document |

## C. The combined panel

| Gate | State | Note |
| --- | --- | --- |
| C1. A panel carrying every built-in | **MET** | `CE/qa/QA-01-components.cepanel`, all 58 types over 125 controls, regenerated and server-rendered by `qaPanels.test.js` |
| C2. …carrying all 14 custom starters | **MET, by a different route than this row assumed** | The row said to extend `make-qa-panels.mjs` so QA-01 carries them. **That premise was wrong and the generator says why**: QA-01 is every component TYPE at its authored defaults, there is one `CustomComponent` type, and it renders as whatever package it carries — so placing it proves nothing about the real starters. QA-07 exists for exactly that and already builds all fourteen through `createCustomComponentStarterPatch`, the patch the designer's Starters flyout applies. Two sheets is right for looking at; it is not enough for asking whether the two KINDS interfere, so `behaviourCombined.mjs` builds that panel at run time — QA-01 plus the fourteen, 139 controls, using the sheet's own builder verbatim. All 139 mount and draw, and driving a built-in leaves every custom component untouched |
| C3. Interaction on that panel: independent gestures, linked outputs, several clocks at once, undo/redo, save/reopen, responsiveness | **MET** | `browser-checks/behaviourCombined.mjs` — **29 verified, 0 defects**. All 125 controls mount, draw and keep a box; dragging one moves one; the clock-driven components run together under one transport with no page error; undo takes back one control's move and leaves its neighbour alone, and redo returns it; a panel link built through the Links editor's own two functions carries 0.87 from one custom component's channel to another's; the whole panel serialises and reopens with the same 125 controls and 58 types still drawing. Then the same again with the fourteen starters added — 139 controls — where driving a built-in leaves every custom component untouched. Measured on the Linux container: opening 2,346ms, entering preview 3,183ms — reported rather than asserted, because the threshold is the owner's call |
| C4. A real create → configure → bind → preview → save/share → export walkthrough | **MET for the stated Windows VST3 scope** | `browser-checks/behaviourWalkthrough.mjs` re-ran with **17 verified, 0 defects** through create, configure, bind, preview, parameter derivation, share and reopen. The installed compiler-free exporter then produced a current 61-parameter VST3 using only the Program Files Node/scripts/templates. CEditor's installed scanner/worker loaded it out of process, processed 64 blocks and restored 4,840 bytes of state. A second scripted export exposed two automation parameters and emitted CC 20/21/22 window-closed. Native dialogs themselves remain the explicitly partial D3 gate below |

Additional adversarial C2/C3 evidence: `QA-09-custom-stress.cepanel` contains fourteen dense package
instances. `behaviourCustomStress.mjs` verifies 17 rows covering real gestures, generated piano and
matrix hit zones, pixel changes, exact public-channel values, an XY-to-meter route, JavaScript
waveform selection, Lua LED-ladder mirroring and the same chain after save/reopen. The complete
custom command runs **100 verified rows, zero defects**; the deterministic generator reproduces all
nine QA sheets.

## D. Native, packaging and the candidate itself

| Gate | State | Note |
| --- | --- | --- |
| D1. Windows Release build and native tests | **MET** | Fresh Release build from `43d50bc4`; 34/34 native tests passed. The unchanged native tree was re-tested after the custom stress addition: 34/34 passed. Scripting was ON and dev mode OFF |
| D2. The installed bundle carries the current frontend | **MET** | Installer built and upgraded in place with exit 0. Installed editor SHA-256 matches staging (`04AA9528…45255`), as does the bundled VST3 template; the Program Files app starts and loads WebView2 |
| D3. Native save / open / share / recovery | **PART MET** | Current 17-row save/share/reopen walkthrough and focused first-use workflow pass; the refreshed installed app starts and closes cleanly. The supported native-window automation service was not configured on this host, so the Program Files file-dialog/recovery walkthrough and malformed-package refusal could not be repeated unattended; the 13 Sep native evidence remains the last direct dialog run |
| D4. Exported Player behaviour | **MET** | Installed template export produced two VST3s with regenerated identities/manifests. Both passed isolated scan, worker launch, 64-block processing and state restore; the scripted panel exposed 2 parameters and emitted CC 20/21/22. The generic Player and the built standalone both started responsive with packaged WebView2 content. QA-09 was additionally exported from the staged compiler-free template as a distinct 25-parameter VST3; isolated processing completed 64 blocks and restored 3,072 bytes of state |
| D5. Physical instrument MIDI, session restore, host performance | **OFF-SITE** | Every inbound check here injects at `latestMidiInputMessage`. That is the right seam for panel behaviour and says nothing about drivers, ports or timing |
| D6. macOS, Linux, other DAWs, other export formats | **OFF-SITE** | Not covered by the Windows evidence, and must not be implied by it |

## E. Decisions that block a truthful release note

These need a ruling rather than a test, and each is small.

| Item | Why it blocks | Smallest honest treatment |
| --- | --- | --- |
| The `show*` derivation itself | `derivedFlagVerbs` mints a script verb for every `show*` boolean in a section | The two formerly silent derived commands now have readers and measured effects. Keep the reproducible published-verb audit as the guard; it currently has no genuine silent verb after manual computed-reader review |
| `Recorder.snapToScale` | An out-of-key note plays back exactly as recorded whatever it says — all four quantise arguments reach `quantizeTake`, whose only caller is the Quantise button | A line in the release notes. The design is defensible; the name is not self-explanatory |
| `Core.alwaysOnTop`, `ContentLayout.textAboveIcon`, `ChordPad.fieldColour`, `Envelope.xLabel`/`yLabel`, `StepSequencer.position` | Declared, unreachable, no symptom | Delete or implement. No urgency, but they should not ship undecided a second time |

---

## What "validated candidate" would require

Every **OPEN** gate closed or explicitly deferred with a reason; every **STALE** gate re-run against
the refreshed bundle (D2 first, since the others are quoted against it); and the **OFF-SITE** pair
either performed on real hardware or stated as an explicit limit in the release notes rather than
left for a user to discover.

The authorized behaviour and Windows export work is complete. The remaining local release choices
are the six unreachable declarations and the Recorder wording in E; D3 still needs one attended
Program Files dialog/recovery walkthrough. Physical MIDI and the broader DAW/platform/format matrix
remain explicit scope limits, not implied failures.
