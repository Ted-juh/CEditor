# Release checklist — the gates, and where each one stands

Compiled 14 September 2026. Companion to two documents that answer different questions:
`release-readiness-2026-09-13.md` is the execution record of what was *done*;
`residual-issues-2026-09-14.md` is what is *known and not fixed*. This one is the gate list — what
must be true before a first public release, and which gates are currently met.

**Nothing here is an approval.** Three gates are unmet and two cannot be assessed from this
environment at all.

---

## Legend

| | |
| --- | --- |
| **MET** | Evidence exists and was re-run against the current tree, or a decision has been taken |
| **STALE** | Evidence exists but predates changes since; needs re-running, not re-doing |
| **OPEN** | Known work, owner named |
| **OFF-SITE** | Cannot be established here; needs the Windows machine or hardware |

---

## A. Behaviour of the shipped components

| Gate | State | Evidence |
| --- | --- | --- |
| A1. Every component family measured against its promised effect, not its property value | **MET** | Twelve suites, all re-run 14 Sep: curves 146, notes 204, motion 113, clock 81, harmony 82, steps 71, phrase 50, recorder 42, outbound 53, links 33, inbound 19, custom 32 / export 51. Zero open defects |
| A2. Every defect found carries a regression that fails on revert | **MET** | D-1 … D-15. D-15's revert was run explicitly and fails as predicted |
| A3. Remaining unverified rows are honest and individually reasoned | **MET** | Six rows. Four are inspector actions the rendered control never performs; one is a runtime conditional; one is a statement of fact |
| A4. No declared option silently does nothing | **OPEN** | Nine inert options. Three are live script verbs giving callers silence — see section E |
| A5. Save/reopen in a fresh runtime for every family | **MET** | `kit.reopen()` clears storage, reloads the page and imports the document; every suite carries reopen rows |

## B. The editor and the authoring stages

| Gate | State | Owner |
| --- | --- | --- |
| B1. Property-by-property coverage matrix exists and is reproducible | **MET** | `tools/scripts/qa/coverage-matrix.mjs`, documented in `coverage-matrix-2026-09-14.md` |
| B2. Every registered type reached by at least one half | **MET** | 58/58; `TestBox` is internal and not user-reachable |
| B3. The 241 unreached properties closed or consciously deferred | **OPEN** | 112 in the editor half — see `assignment-codex-2026-09-14.md` |
| B4. Authoring stages driven, not just renderers | **OPEN** | Panel editor, Custom designer, Screen Builder, Sequencer/Envelope designers, scripting/routing, Player/export. `designerTab.mjs` already covers the Sequencer designer writing a pattern |
| B5. A decision on `Designer` and `Assets` — session state, not behaviour | **MET** | Ruled 14 Sep. `Designer` (13 keys) struck as authoring-surface state; `Assets` (5) **kept** — `images`/`filmstrips`/`thumbnails` have 95/58/11 readers and `packagePolicy` decides whether a shared panel carries its artwork. See the matrix document |

## C. The combined panel

| Gate | State | Note |
| --- | --- | --- |
| C1. A panel carrying every built-in | **MET** | `CE/qa/QA-01-components.cepanel`, all 58 types over 125 controls, regenerated and server-rendered by `qaPanels.test.js` |
| C2. …carrying all 14 custom starters | **OPEN** | It carries one `CustomComponent`. Extend `tools/scripts/qa/make-qa-panels.mjs`; **do not hand-edit the `.cepanel`**, it is generated |
| C3. Interaction on that panel: independent gestures, linked outputs, several clocks at once, undo/redo, save/reopen, responsiveness | **OPEN** | QA-01 is a render sheet. Nothing on it is touched |
| C4. A real create → configure → bind → preview → save/share → export walkthrough | **STALE** | Walked on Windows 13 Sep; predates D-1…D-15 |

## D. Native, packaging and the candidate itself

| Gate | State | Note |
| --- | --- | --- |
| D1. Windows Release build and native tests | **STALE** | 34 native tests passed; predates the later frontend fixes |
| D2. The installed bundle carries the current frontend | **OPEN** | RC3 is older than every fix from D-1 to D-15. Refresh before quoting any acceptance against it |
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
