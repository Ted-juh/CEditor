# Component behavior investigation — in progress

This supersedes any interpretation of the earlier field-edit counts as functional coverage.
No release sign-off and no claim that every property has passed.

Codex owns layout/display, buttons/choices, values/sliders and shared appearance. Claude owns
the 23 music/modulation types plus all 14 custom starters and custom authoring. Each result
must describe an expected visible result or runtime output; mutation/mount counts are not passes.

The new `CE/web/browser-checks/componentBehavior.mjs` runs the real App. It edits properties
through the inspector, drives actual pointer/keyboard input, measures meaningful geometry/text,
and captures outgoing payloads at the frontend/native boundary without sending to hardware.
Round trips save through `serializePanel`, reload the browser to discard runtime state, then
reopen through `deserializePanel` and repeat behavioral checks. Native file dialogs remain a
separate gate, not implied by this document round trip.

## Confirmed defects

| ID | Property / contract | Reproduction and observed failure | Fix / current validation |
| --- | --- | --- | --- |
| B01 | Meter.thickness | Set 12 on a horizontal bar: bar still fills available height. | Apply thickness to horizontal/vertical smooth and segmented tracks. Actual geometry and reopen pass. |
| B02 | Meter.showValue with segments | Enable numeric readout and 10 segments: number disappears. | Render readout in segmented mode too. Five of ten segments lit at 0.5, exact prefix/precision/suffix and reopen pass. |
| B03 | Meter.showTicks / tickCount | Six marks on continuous bar disappear when segments or arc selected. | Tick geometry now drawn in both modes. UI orientation changes and reopen pass. |
| B04 | TextInput Behavior.valueFlow=display | Native text input stays editable and remains a tab stop despite read-only promise. | Explicit native readonly/tabindex plus commit guard. Actual editable state and reopen pass. |
| B05 | Numpad value binding | Enter 12 with offset 1: display and document say 11 but no MIDI leaves the component. | Use existing single-value binding emission instead of unsupported fan-out call. Real CC output exactly B2 4A 0B, no pending digit sends, repeat after reopen passes. |
| B06 | Momentary Behavior.fireOn | onPressStart still emits only on release. | Trigger binding respects configured edge. Hold emits once, release no duplicate, reopen passes. |
| B07 | Momentary repeating keyboard | Pointer path wired repeat controller, keyboard path did not. | Keyboard begins/releases existing repeat controller; blur stops it too. Actual Space hold/release output test passes. |
| B08 | OneShot disableAfterUse / lockoutDuration | Two real clicks send twice; both options have no runtime reader. | Session execution/disable and bounded reset timer, cleanup on removal/teardown. Second click suppressed, disabled appearance, timed reuse and reopen pass. |
| B09 | TextInput keyboardEnabled / focusable | Editable off still permits typing; native input ignores Focusable. | Native input properties follow options. Enter commits once; Escape restores committed text without output; reopen passes. |
| B10 | TabContainer pageIndex | Clicking the tab strip does not change child-page visibility. | Real strip hit selects a runtime page; only its children render. Reopen passes. |
| B11 | TabContainer edge / stripSize | Page children overlap the strip rather than starting in the content area. | Rendering and containment origins account for all four strip edges. Actual child bounds pass. |
| B12 | ScrollArea wheel / scrollbar | Wheel and scrollbar gestures have no effect on child positions. | Wire wheel and thumb drag to clamped runtime offsets and clip the viewport. Relative child displacement and reopen pass. |
| B13 | ScrollArea direction / smooth | Vertical mode moves horizontally; smooth mode caps a 200px delta at 120. | Respect axis and full pixel delta. Actual 200px motion and thumb drag pass. |
| B14 | Combobox searchable | Mode offers no search field. | Search input filters enabled rows; selection changes visible text; reopen passes. |
| B15 | Meter arcSweep / orientation | 360° gives an empty path; arc radius/centre can clip the stroke. | Full circles use two SVG arcs; geometry fits viewport. Path length, bounds, reopen pass. |
| B16 | Meter gradient / arc segments | Segmented gradient stays one hard colour; arc ignores segment count. | Sample alpha-aware zone colours and render discrete arc LEDs. Colour and geometry checks pass. |
| B17 | Meter peakDecayPerSec | Repeated frames subtract the cumulative elapsed interval again, collapsing a 0.5/s peak to zero within 0.5s. | Subtract only each update interval; retain hold timing. Linked slider, timed marker position, colour and reopen pass. |
| B18 | Button script firing | Press-start scripts fire on release; short unconfirmed TimedButton holds execute scripts. | Runtime click event follows configured press edge or confirmed execution. Actual pointer and listener checks pass. |
| B19 | Crossfader / Joystick returnValue | “A set value” return mode has no input to set that value. | Add conditional Rest input in existing properties-panel style. Crossfader configured return geometry and reopen pass; joystick behavioral check pending. |
| B20 | Final parameter send ordering | Crossfader visibly snaps to 0.25, then queued earlier drag output sends 0.964 after the final commit. | Final commit discards older queued values for the destination. Actual outgoing boundary order and reopen pass. |
| B21 | Joystick cornerLabels | Reusing the same corner caption creates duplicate Svelte keys and removes/crashes the renderer. | Key by stable corner index. Four identical captions and reopen pass. |
| B22 | Listbox typeAhead / confirmMode | Typing B sends Beta immediately even in Enter-confirm mode. Generic keyup can also recommit after keydown confirmation. | Search arms deferred choices; Listbox owns its confirmation key. No early send, one Enter send, visible selection and reopen pass. |
| B23 | Listbox highlightMatch | Turning highlight off leaves matching text marked. | Renderer respects the switch; filter results unchanged and marked spans follow the flag, including reopen. |
| B24 | Listbox filterBox / keyboard | Filter keystrokes bubble into component type-ahead/selection. | Native search field retains its own key events. Real typed query filters rows without sending a selection. |
| B25 | Listbox momentum | Smooth drag stops immediately on release with Momentum enabled; flag has no reader. | Bounded decaying scroll after flick; a new grab or wheel stops it. Actual delayed child-offset check passes. |
| B26 | Pointer cancellation | Repeating button keeps sending after a cancelled pointer (8 outputs vs 4 at cancellation). | Cancellation stops timers and completes release cleanup outside hitbox. Actual pointercancel/output test passes. |
| B27 | PitchWheel / ModWheel output | Ribbon emits values; wheels draw and move but emit nothing through the same fan-out path. | Register the complete existing Ribbon family. Snapped bipolar values, touch gate, final return and reopen pass for all three types. |
| B28 | Ribbon label / showValue | Caption extends past the bottom clip; readout extends above the top. | Reserve text space in shared drawing/hit geometry and align baselines inside the clip. Measured text bounds pass. |
| B29 | Wheel showGlow / indicatorColour | Flat/realistic wheel ignores Touch glow off; realistic wheel omits the position indicator. | Respect glow switch in both wheel styles; draw the configured notch. Colour and position changes plus reopen pass. |
| B30 | Numeric Behavior.keyboardEnabled / navigation flags | Number changes 40 to 100 on End with Keyboard disabled. Shared arrow/Home-End/Page toggles lack guards. | Input and adjustment guards apply across Number, Slider, Knob, Range. Keyboard-off/no-output and individual navigation checks pass. |

## Current behavioral checks

- Meter value/min/max actually control fill extent and clamp outside bounds; orientations,
  thickness, LED count/lit count, scale ticks, caption position and persisted rendering.
- Numpad digits, offset, out-of-range refusal (red readout), Clear, auto-commit at length,
  read-only input rejection, exact committed display and exact outbound MIDI.
- Text Input display mode plus native editable/focus settings, Enter commit and Escape cancellation.
- Momentary press edge and repeating keyboard output; One-Shot permanent/temporary lockout.
- Shape's 14 kinds and conditional stroke/fill/rotation settings produce their expected SVG geometry.
- Crossfader's three laws send matching gains and draw matching gain bars; bipolar output,
  labels, detent, vertical position, editable guard, configured return and final-send ordering.
- Tab page visibility and strip layout; ScrollArea wheel, axis, smooth delta and scrollbar drag;
  searchable Combobox filtering and selection.

Local validation milestone: **all 4,813 Node tests pass, no skips; all 32 new real-App behavioral
scenarios pass together, with no browser errors.** This is not an exhaustive-property count.
Production frontend build also passes for this checkpoint.

The scripting-size table was regenerated after its parity test caught the runtime change. The
Windows generator had silently done nothing because its entrypoint comparison split only forward
slashes; fixed separator handling. No generated C++ source changed.

Run the new scenarios with `npm run test:component-behavior` from CE/web. Windows uses installed
Edge; `CHROMIUM_PATH` can select an executable elsewhere. `CEDITOR_BEHAVIOR_OUT` selects the
evidence directory; `CEDITOR_BEHAVIOR_CASE` filters by scenario-name substring. Keep source files
stable while running: a Vite hot reload deliberately resets the application being measured.

Still to execute: remaining component-specific properties, conditional settings, shared
appearance combinations, routing and script consumers, custom package behavior (Claude), and
native/hardware gates. This list is an active work record, not a completion report.

## Remaining breadth at this checkpoint

| Root-owned family | Behavioral coverage in this pass | Remaining work |
| --- | --- | --- |
| Meter / ProgressBar | Meter geometry, levels, ranges, arc/segments, colours, readout, linked peak timing | ProgressBar explicit checks, all remaining combinations and source/zone events |
| TextInput | Display/editable/focus settings, commit/cancel, output, reopen | Remaining formatting and placeholder properties |
| Shape | All 14 kinds, fill/stroke, corner/rotation/line settings | Shared appearance/effects combinations |
| TabContainer / ScrollArea | Page click/visibility, four strip edges, wheel/drag/axis/delta and clipping | Nested layout, negative content bounds, bindings and remaining settings |
| Numpad | Entry, bounds, offset, digits, clear, auto-commit, editable guard and MIDI | Remaining readout/key appearance combinations |
| Momentary / Timed / OneShot | Press edge, repeating keyboard, cancellation, one-shot lockout, script confirmation | Remaining modes/settings and output combinations |
| Combobox / Listbox | Search/filter, confirmation, highlighting, momentum, native typing | Remaining selection, row style, data-source and navigation settings |
| Crossfader / VectorJoystick | Gains/axes/corners/output, major display settings, rest target/axis and final send | Timed curve variants, trails and remaining colours/layout combinations |
| Ribbon / PitchWheel / ModWheel | Value/touch/return output, snapped bipolar behavior, wheel indicator/glow/text | Remaining presets, time/curve/appearance and vertical gesture combinations |
| Number / Slider / Knob / Range | Keyboard disable and navigation switches | All other numeric interaction, layout, formatting and multi-handle settings |
| Background / Label / Image / Container / Group / LcdDisplay / PixelDisplay / Macro / ToggleButton / RadioButtonGroup / CyclicButton | Not yet covered by this new pass beyond fixtures or earlier separate tests | Property-by-property functional investigation still open |
