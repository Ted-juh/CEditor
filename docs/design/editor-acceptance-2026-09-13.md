# Editor release acceptance — automated pass complete; native acceptance open

This supersedes the earlier narrow candidate sign-off. The user requested a comprehensive editor
pass by Codex and the existing Claude Code task. A passing build is not an acceptance verdict.
Baseline: main `00c6bf12`. Codex owns full-editor/native workflows and integration; Claude owns
component/model, custom-package and music/modulation runtime probes. Neither is publishing an
official release during this pass.

## Confirmed defects

| ID | Reproduction | Correction / verification |
| --- | --- | --- |
| E1 | Type a different X position, press Escape: the new value is committed | NumberCell blur no longer commits a cancelled edit; full-App regression passes |
| E2 | Type 50, press Up, then Tab: value is 50 rather than 51 | NumberCell and PropertyScrub step from the current draft and preserve the step on blur |
| E3 | Type 1e309 into X and Enter: Transform.x becomes Infinity | Reject non-finite typed numbers; the previous position survives |
| E4 | Type an opacity value and Escape: opacity changes | PropertyScrub cancellation fixed; keyboard, Shift stepping, precision and undo/redo pass |
| E5 | Insert a control, rename it, undo: selection disappears and panel properties replace control properties | Pending history snapshots now retain the resulting selection; failing regression now passes, along with all 28 history tests |
| E6 | Recorder → Sync to transport does nothing | Corrected the shared switch props; toggle, bars/seconds visibility and undo pass |
| E7 | Blank Setlist program/bank/tempo fields display zero and silently write zero on focus/blur; cannot clear a value | Optional fields stay blank, accept explicit zero, can be cleared to null, and undo cleanly |
| E8 | Nine of twenty template/size combinations place controls outside the chosen panel | Shrink template arrangements proportionally when needed; backgrounds fill the canvas; all twenty combinations and custom-size model checks pass |
| E9 | Reloading a session with twenty starter panels loses all unsaved panels: the expanded snapshot is 7.6 MB and exceeds browser storage | Recovery uses existing lossless default elision; full editor reload passes. A real quota failure now displays persistent save-to-file guidance; previous recovery snapshot is retained |
| E10 | Focus then leave a high-precision opacity value: it is rounded despite no edit | PropertyScrub ignores an unchanged display draft; full-App regression fails before and passes after |
| C1 | A non-finite custom response-curve point yields non-finite MIDI output | Integrated Claude's fix at 3780344b; Codex review also preserved null/undefined identity fallback, with explicit regression |
| C2 | All 14 untouched custom-component starters report edited after package insertion | Integrated fingerprint correction and regressions at 3780344b |
| C3 | Multi-selection size fields silently drop the tooltip explaining why they are disabled | NumberCell now forwards title to its wrapper |
| C4 | Malformed device-profile range can adopt NaN into a control | Integrated at 8c9770e7; Codex review also preserved missing/null range defaults versus explicit zero, with regression |
| C5 | Releasing a Timbre Space or Preset Constellation drag throws before committing the edited position | Integrated at 8c9770e7; actual pointer regressions fail before and pass after the fix |
| C6 | A properties-panel Open in Dock button selects a tab but leaves the dock hidden | Full-App button regression independently reproduced; DisplayPanel now opens the dock before consuming the request; regression passes |
| C7 | Keyboard key presses do nothing despite playable keyboard/latch/scale settings | Wired existing key hit testing and note rules into the preview surface and note-output path; actual key, glide, latch, cancel, transpose/channel and exit cleanup pass. Local key/scale controls, panel-key following and advertised note/velocity binding resolution also restored |

## Actual execution so far

- Full App, compiled Svelte, Windows Edge: all 56 public types inserted through the search flyout,
  renamed and positioned through visible fields; every exposed property tab opened and expanded.
  No page exceptions. This is rendering/navigation coverage, not proof of every property behavior.
- Full-App numeric regression: cancel, commit, typed Up/Down, Shift increments, finite values,
  fractional precision, invalid text, undo and redo.
- Full-App canvas workflow: pointer drag, exact keyboard nudge, multi-select, unique duplicate
  identities, group/ungroup, lock protection, copy/paste, delete, undo/redo, real preview toggle and
  knob gestures, authored-state restoration, all 21 docks, unsaved recovery across page reload,
  and the New Panel dialog with independent document history.
- Completed exposed-field sweep: 4,244 probes, of which 3,501 changed the document and undid
  exactly, 242 had only one selectable choice, and 501 were unchanged. These are input probes,
  not 4,244 unique model properties: shared fields repeat across component types. Unchanged
  fields were reviewed as preset drafts, binding/animation drafts, minimum clamps, selection
  controls, and optional numeric blanks (covered separately by explicit numeric tests).
- Completed 729 visible switch probes across all 56 types / 480 tabs. Initially 728 changed and
  undid; Recorder sync was the sole no-op and passes after E6. No page exceptions.
- Additional dropdown sweep completed across all 56 types: 770 alternative choices, 735
  document changes with exact undo restoration and 35 non-document selector/draft choices.
  Every choice in the exposed type-specific selectors was tried; shared selectors were also
  exercised on Label/Knob representatives. This does not exhaust combinations of dependent fields.
- Preview interactions pass for Knob, Slider, Number, Range (both endpoints), Crossfader, Ribbon,
  PitchWheel (including return to centre), CyclicButton, Combobox and ToggleButton. Tests use
  actual pointer/keyboard input, read the resulting UI/runtime values, and verify exit restores
  authored controls. Range and spring controls require their own contract, not a generic slider test.
- Text card preset save/apply/update/delete, undo/redo, and reload persistence pass. All twenty
  New Panel template/size combinations and dialog cancellation pass.
- Focused full-App Text and shape-effects tests passed, including all text flow modes, state
  isolation, effect targets and pixel checks. Screen runtime/GIF/selection tests also pass.
- Claude has independently checked all 56 types' scalar persistence and all eight QA sheets
  (2,943 controls), including sparse-document expansion and package export/reimport. His detailed
  ledger and tests are being integrated separately.
- Local integrated Node suite: 4,810 tests, all pass, zero fail or skipped. Windows Python
  discovery now checks python.exe as well as python3, so the prelude agreement checks execute. Script
  export validation: seven passes; C# SDK and javac validation skipped because unavailable.
- Full existing `npm run test:browser` passed, including assets, typography, effects, screens,
  API, library, animations, designer, filtering, insert flyout, panel strip, inbound player MIDI,
  783-control panel geometry and first-use binding/send workflow.
- Local MSVC Release build (scripting ON, dev mode OFF) and all 34 native tests passed. This is
  build/test evidence, not a substitute for the still-blocked native GUI acceptance below.
- A captioned laboratory panel contains all 56 public types and 14 custom starters (146 nodes
  including captions). It was loaded in the full editor and scrolled across both axes for visual
  inspection. Companion property, state, script, verb and custom-package fixtures are supplied.
- Claude's final gesture batch at a85ecb06 was integrated and rerun locally: Envelope, Orbit,
  DrumPads, NoteRibbon, the Step Sequencer grid, Dual Slider Switch, Triple Value Slider and Tab
  Group pass. His initially failing Keyboard regression now passes with the integrated fix.
- Additional full-App Keyboard checks prove white/black key presses, real note output, glissando,
  latch chords, pointer cancellation, transpose/channel, exit cleanup, own key/scale, pentatonic
  refusal, panel-key broadcast and quantization. Note/velocity binding values have a unit regression.

## Test instrumentation and honest limits

`browser-checks/editorAcceptance*` mounts the actual App. Hooks create/load fixtures, read state,
and flush history timing. Test actions use DOM keyboard/pointer/form controls; the native backend
is absent in these browser runs. Native file-dialog, MIDI hardware and installed-build results
must therefore be recorded independently.

The initial all-types probe incorrectly looked only at top-level controls after insertion into a
selected container. Clearing selection between independent specimens corrected that harness error.
An empty native number input also needed a numeric test value, not the text-field probe string.
Neither is a product defect. E5 was independently reproduced in a dedicated failing store test.

Native CEditor currently cannot be activated by the Windows automation helper after a refreshed
handle retry. File → Open Panel also did not expose a picker during that attempt. The user has
been asked to bring it forward and try Open Panel; this remains an unresolved native acceptance
item, not a diagnosed application defect. Existing user work is preserved.
Native close/reopen paths (title-bar X, Alt+F4 and Close Program), including closing before the
20-second autosave timer, must also be exercised. Browser reload recovery is verified, but the
native window's shutdown and its file picker cannot be inferred from that result.

## Remaining acceptance requirements

- Repeat installed native acceptance when accessible: file dialogs and close/reopen remain open.
- Eleven custom starters have model/package/rendering coverage but no individual runtime gesture;
  the three multipart starters above have targeted gesture coverage. Conditional property combinations
  are not exhaustively enumerated. These limits must not be described as every feature certified.
- Physical instrument acceptance and any unverified platform/runtime scope remain explicit gates.

## Running the new full-editor checks locally

From CE/web, build `npx vite build --config browser-checks/editorAcceptance.config.mjs`, then
run `node browser-checks/editorAcceptance.mjs`. `CEDITOR_ACCEPTANCE_MODE` selects `properties`,
`booleans`, `numeric`, `optional`, `workflows`, `creation`, `gestures`, `recovery`, or `visual`.
Use `choices` for the additional dropdown option sweep.
Use `keyboard` for the extended piano gesture checks and `dock-opener` for the closed-dock regression.
The default mode inserts and inventories all public components. Set `CEDITOR_ACCEPTANCE_OUT`
to an evidence directory; optional `CEDITOR_ACCEPTANCE_TYPES` is a comma-separated retry filter.
Visual mode takes `CEDITOR_ACCEPTANCE_PANEL` and captures every viewport position across both
axes. CHROMIUM_PATH can override the Windows Edge executable. These checks are local and do
not expand CI.
