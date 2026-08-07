# CEditor first-beta smoke test

Date: 2026-08-06 (Europe/Amsterdam)  
Tester: Codex, operating the installed desktop application through its visible UI  
Build tested: `c2d65937 · main · 2026-08-05 22:05 UTC`  
Application version shown in the status bar: `0.1.0`  
Executable: `C:\Program Files\CEditor\CEditor.exe`

## Executive result

**Recommendation: do not ship this build as the first public beta yet.**

The core editor is already usable enough to create and interact with a realistic panel. Panel components, transforms, colors, gradients, an imported image, preview interaction, Lua editing/validation, and much of the custom-component designer all worked. However, the pass found three high-severity stability/state failures, including two `structuredClone` renderer crashes and a saved panel becoming blank after switching workspaces. The saved panel was recoverable, but only after closing its tab and reopening the file; a normal application UI reload did not restore it.

No source code was changed during this test. The only repository-level addition is this report. The test panel is in the repository's ignored `tmp` directory.

## Scope and approach

This was an exploratory smoke and bug-hunting pass, not a scripted unit or integration test. The installed application was launched and driven through the same visible controls and native file dialogs a user would use.

Covered:

- New panel creation, panel sizing, naming, saving, closing, reopening, and reload recovery
- Component insertion and transforms
- Background, label, knob, linear slider, toggle, combobox, and image components
- Solid colors, gradients, gradient-stop editing, gradient angle, and background-image controls
- Image import from a local PNG
- Edit mode and panel Preview mode
- Mouse drag, click, keyboard, wheel, toggle, and dropdown interaction
- Export-parameter serialization for value controls
- Lua 5.4 Ready-event script creation, editing, validation, running, error reporting, and correction
- Custom-component shapes, gradients, generated value controls, hit zones, visual states, and Preview mode
- Crash recovery and persistence verification

Not covered or only partially covered:

- Real MIDI/DAW/device hardware, discovery, synchronization, and live device output
- Audio behavior and performance under load
- Final plugin/export artifacts, because the custom-component packaging workflow was blocked
- Long-session soak testing, large panels, localization, accessibility, or installer/update flows
- Persistence of the separate script workspace across a full application restart

## Test artifact

Saved panel: `C:\dev\Projects\CEditor\tmp\qa-beta-smoke.cepanel`

- Size on disk: 550,171 bytes (the UI displayed approximately 537.3 KB)
- Canvas: 600 × 400
- Serialized controls: 7
- Controls: background, label, knob, linear slider, toggle, combobox, and image
- Image source used: `C:\dev\Projects\CEditor\CE\web\public\logo.png`
- The JSON artifact remained parseable after the failures and still contained all seven controls.

## Findings summary

| ID | Severity | Result | Area | Summary |
|---|---|---|---|---|
| CE-BETA-001 | High | Fail | Display panel / gradient | Editing an applied gradient crashes the Display panel with a `structuredClone` error. |
| CE-BETA-002 | High | Fail | Workspace creation | `New` → `+ Component` can crash the whole canvas with the same `structuredClone` error. |
| CE-BETA-003 | High | Fail | Tabs / persistence | Returning from the custom-component designer can leave a saved panel completely blank; UI reload does not recover it. |
| CE-BETA-004 | Medium | Fail | Background image | The Background Image layer's advertised left-click/right-click actions did not respond. |
| CE-BETA-005 | Medium | Fail | Combobox | Multiple rows can simultaneously be marked as the default item. |
| CE-BETA-006 | Medium | Fail | Value controls | Knob and slider `Default Current` values serialized correctly but were not reflected in edit/preview initial values. |
| CE-BETA-007 | Medium | Fail / blocked | Custom components | Packaging reports one blocking issue, but `Fix` exposes no usable explanation/remediation and saving remains unavailable. |
| CE-BETA-008 | Medium | Suspected fail | Custom components | Generated Dial Control reports a hit zone but did not respond in Preview to drag or wheel input. |
| CE-BETA-009 | Medium | Fail | Gradient workflow | Changing a stop in Gradient Studio did not update the already-applied background; the applied layer retained its old colors. |
| CE-BETA-010 | Low | Fail | Gradient workflow | `Back to Gradient` did not respond to click, Enter, or Escape. |
| CE-BETA-011 | Low | Fail | Combobox canvas | The edit canvas continued to show `Option 1` after rows were configured; Preview showed the configured item. |
| CE-BETA-012 | Low | Inconsistency | Panel identity | The saved JSON retained the internal name `Untitled 2`, while the reopened UI showed `qa-beta-smoke`. |

## Detailed defects

### CE-BETA-001 — Applied-gradient editor crashes the Display panel

Severity: **High**

Reproduction:

1. Create a panel and add a full-canvas Background component.
2. Apply a gradient.
3. In the right-side Background inspector, click `Edit` for the applied Gradient.

Expected: the applied gradient opens for editing and the panel continues rendering.

Actual: the Display panel is replaced by an error state:

```text
The display panel stopped rendering
Failed to execute 'structuredClone' on 'Window': [object Object] could not be cloned.
```

Recovery: `Try again` repeated the same failure. Closing the Display panel through its toggle allowed the rest of the editor to continue.

### CE-BETA-002 — Creating a custom component can crash the whole canvas

Severity: **High**

Reproduction observed:

1. Work in the styled/saved panel and enter/leave Preview.
2. Click `New` and then `+ Component`.

Expected: a new custom-component designer tab opens.

Actual: the whole canvas enters an error state with the same `structuredClone` message as CE-BETA-001.

Recovery: `Try again` loops back to the error. File-menu attempts to create a different workspace did not escape it. `Ctrl+R` was required to reload the application frontend. After reload, the existing tabs were restored. Running `New` → `+ Component` later from the Script workspace succeeded, so the failure appears state-dependent.

### CE-BETA-003 — Saved panel becomes blank after custom-component tab switch

Severity: **High**

Reproduction observed:

1. Save the populated panel.
2. Work in a custom-component designer tab.
3. Switch back to the saved panel tab.

Expected: the previously visible seven-component panel renders unchanged.

Actual: only the empty 600 × 400 grid appears. Component layers and the background are absent.

Persistence/recovery evidence:

- `Ctrl+R` did not restore the panel.
- Choosing Open Panel for the same file while the blank tab remained open did not restore it or create a second tab.
- The saved JSON was still valid and contained seven controls plus four export parameters.
- Closing the blank tab and reopening the file restored the complete panel, including its image.

This did not destroy the saved file, but it presents like data loss and has a non-obvious recovery path. The application should either rebuild the rendered state on tab activation/reload or visibly explain and offer a safe recovery action.

### CE-BETA-004 — Background Image layer does not open or toggle

Severity: **Medium**

The panel Background inspector labels Image with the instruction that left-click toggles it and right-click edits it. Both left- and right-click attempts produced no visible enabled state, editor, layer controls, or image-selection path. A standalone Image component could load and display the same PNG successfully, so local image access itself works.

### CE-BETA-005 — Combobox permits multiple default rows

Severity: **Medium**

Rows were configured as `Clean/clean`, `Crunch/crunch`, and `Space/space`. The editor allowed both the first and second rows to remain checked as `Default` at the same time. A single-select combobox should enforce exactly one default or clearly define how multiple defaults are resolved.

### CE-BETA-006 — Default-current values are ignored visually

Severity: **Medium**

- Knob range: -60 to 12, step 0.5, requested default -6, suffix ` dB`
- Slider range: 0 to 100, step 1, requested default 50, suffix `%`

The serialized `exportParameters` correctly contain defaults of -6 and 50. The edit canvas and a fresh Preview nevertheless began around 0.5 dB and 1%. This makes the saved/default state disagree with what the user sees and interacts with.

### CE-BETA-007 — Custom-component validity blocker has no actionable path

Severity: **Medium**

The custom-component designer showed `Not reusable yet: Package Validity — 1 blocking issue(s)`. Clicking `Fix` and the package-validity area did not reveal which rule failed or take the user to a field. File Save/Save As and keyboard save shortcuts remained unavailable. Because the component could not be packaged, this workflow could not be completed.

### CE-BETA-008 — Generated Dial Control is noninteractive in Preview

Severity: **Medium (suspected)**

A generated `Dial Control` was inserted. It reported four layers and one zone, had a 0–127 range, 11 ticks, and displayed 64. In custom-component Preview, repeated vertical drags and wheel input over the dial did not change the value or pointer. If the generated control is intentionally visual-only, the UI should not imply an active hit zone without explaining the binding required.

### CE-BETA-009 — Gradient Studio changes do not update the applied layer

Severity: **Medium**

After applying a red-to-blue gradient, the first Gradient Studio stop was changed to cyan (`00D4FF`) and the studio preview correctly changed to cyan-to-blue. The panel's applied background remained red/magenta-to-blue. The saved panel also reopened with the old applied visual. If re-application is required by design, the studio needs an explicit Apply/Update action and dirty-state feedback.

### CE-BETA-010 — `Back to Gradient` is unresponsive

Severity: **Low**

While editing a gradient color stop, `Back to Gradient` did not respond to mouse click, Enter, or Escape. Switching the lower studio tabs was the available workaround.

### CE-BETA-011 — Combobox edit canvas is stale

Severity: **Low**

After configuring three rows, the edit canvas continued to display `Option 1`. Preview displayed `Clean` and the dropdown correctly showed all configured rows. This looks like edit-mode rendering not refreshing from the row model.

### CE-BETA-012 — Panel identity differs between file and UI

Severity: **Low**

The reopened UI displayed the identity/name `qa-beta-smoke`, while the saved JSON still held `name: "Untitled 2"`. This may be a deliberate filename-based display convention, but the visible Identity field should not imply that a value was persisted when the serialized name differs.

## Passing checks

### Panel and component authoring

- Created a fresh 600 × 400 panel without disturbing the pre-existing unsaved `Untitled 4` tab.
- Added, renamed, moved, and resized seven controls.
- Label text, 32 px size, bold weight, and centered alignment rendered correctly.
- Solid ARGB color `FF16213E` was accepted and displayed.
- Gradient enablement and angle adjustment rendered immediately.
- Knob range, step, precision, and suffix controls accepted input.
- Slider range, step, precision, and suffix controls accepted input.
- Toggle caption rendered correctly.
- Combobox rows and values were editable.
- A local PNG loaded through the native file picker and rendered on the panel.
- The panel saved successfully to a `.cepanel` file.
- Closing and reopening the file restored all seven controls and the embedded/referenced image content.

### Panel Preview

- Knob drag changed the displayed value from about 0.5 dB to -24.5 dB.
- Slider click, Right Arrow, and wheel input changed the value (approximately 1% to 74%, then 72%) and focus was visible.
- Toggle click changed its selected visual state.
- Combobox opened with `Clean`, `Crunch`, and `Space`; selecting `Crunch` worked.
- The imported image rendered in Preview.
- Leaving Preview reset transient interaction values, which is reasonable for a non-running edit preview.

### Lua scripting

- Created a new Script Workspace and added a Ready / `onPanelReady` Lua 5.4 handler.
- The default function skeleton was generated.
- Added `print(1)` inside the `firstTime` branch.
- Valid code showed `No problems` and Run recorded a successful `onPanelReady()` execution.
- Inserting an invalid `@` produced an immediate line-specific diagnostic: `Line 3: unexpected symbol '@' near 'then'`.
- Removing the invalid symbol cleared the diagnostic; running again succeeded.
- Enable/run/log/history controls were present and usable in this pass.

### Custom-component designer

- Created a 200 × 200 custom component after recovering from CE-BETA-002.
- Drew a rectangle and applied a grayscale gradient.
- Drew a ring visual with a 4 px blue stroke and rounded/circular geometry.
- Inserted a generated Dial Control with track, pointer, readout, ticks, channel/range data, and one hit zone.
- Added a second visual state; a `Hover` interaction state was created and the state count updated to two.
- Custom-component Preview rendered the composed visuals.
- Layer and generator palettes, Assets tab, state system, and range/readout inspectors were present.

### Stability and data integrity observations

- A full frontend reload recovered the application after the whole-canvas renderer crash.
- The pre-existing unsaved `Untitled 4` panel survived reloads and was not overwritten.
- The saved smoke-test file remained unchanged on disk during the later blank-canvas failure (same creation and modification timestamp).
- The file parsed as JSON and contained the expected control and export-parameter records.

## Suggested release gate

Before a first public beta, I would require:

1. Fix or defensively handle the two `structuredClone` failures.
2. Fix panel-state reconstruction when changing tabs and reloading; add a regression test that saves, switches workspace types, returns, reloads, closes, and reopens.
3. Make the custom-component validation blocker explain itself and provide a functioning save/package path.
4. Resolve the default-value and combobox-default inconsistencies to prevent panels from behaving differently from their serialized settings.
5. Repeat this pass with a real MIDI device and complete at least one exported plugin/package once packaging is unblocked.

## Overall assessment

The editor's happy path is promising: a visually varied, interactive panel can be assembled quickly, the local image path works, Preview supports several input methods, and Lua feedback is useful. The current build's main risk is state management across editors and tabs. The repeated `structuredClone` exception, ineffective in-app recovery buttons, and blank saved panel are severe enough that early users could reasonably believe their work was lost. Those should be treated as beta blockers.
