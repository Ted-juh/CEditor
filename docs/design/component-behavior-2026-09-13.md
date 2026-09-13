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

### After integrating Claude at 95880d8a (in progress)

| ID | Setting / path | Observed defect | Correction / evidence |
| --- | --- | --- | --- |
| B38 | Number / Range keyboardEnabled and inline fields | With Keyboard off, typing 33 into Number still replaces 40. | Native inline fields become read-only and their input handlers respect the switch. Both Number and Range pass real typing attempts. |
| B39 | Image default contain fit | An Image with the shipped contain value crops and fills the intended letterbox. | New Image uses the background's fit name; renderer and picker accept legacy contain/cover aliases. Actual quadrant/letterbox pixels, flips, 50% compositing and reopen pass. |
| B40 | Background image rotation | At 135 degrees two corners expose the background; the coverage scale uses signed trigonometric lengths. | Use absolute projected extents. Actual red pixels cover all four corners at 45, 135, 225, 315 and -135 degrees, including reopen. |
| B41 | Numeric returnMode / returnTime / returnCurve | Slider released at 0.92 never returns to its 0.5 centre: its first return tick mistakes the released pointer for a new grab. Generic writes also bypass the selected handle. | Begin after clearing pointer state and write the active numeric handle. Snap, all three timed curves, interrupted return, final outbound value and fresh reopen pass. |
| B42 | Numeric outer keyboard target / Escape | Typing 23 on the Number wrapper immediately replaces 40 and sends it before Enter. | Buffer the draft until Enter; Escape discards it. Number, Slider and Knob committed values and outbound silence during drafts pass after reopen. |
| B43 | Slider / Knob remapped typed readout | On wire range 61–67 displayed as -3–3, typing -2 commits the minimum and displays -3. | Use the slider display-to-wire parser and active-handle setter. Both types display -2 and emit 62, including reopen. |
| B44 | ProgressBar default readout | The default requests showReadout, which the Meter renderer never reads; no number appears. | Use showValue. Displayed 35%/75% agrees with the visible clipped fill, and 75% survives reopen. |
| B45 | Leaving Preview during numeric return | Outbound calls continue after leaving rehearsal (21 becomes 44 in 400ms). | Cancel active return tokens on surface destruction and component removal. Real Preview-close check confirms output stops. |

New screen checks pass without product changes: Pixel bar placement/width in grid dots, source
changes, brightness and gamma are measured from the canvas pixels before/after reopening. LCD
value/pct/bar tokens, dimensions and known seven-segment glyphs are verified in the rendered screen.
The percentage token returns a number; a literal percent sign belongs in the authored line.
CyclicButton also passes actual disabled-choice skipping, wrap on/off, displayed-choice/output
agreement and fresh reopen. The ProgressBar test initially measured the full-width gradient layer;
corrected the assertion to measure its visible clipping window, and used the actual Val field.

Integration validation: 40 root scenarios and Claude's curves/notes/motion/custom suites pass on
Windows. All 4,814 Node tests pass after merging and adding the inline keyboard guard. GIF disposal,
timing and reduced-motion playback, screen soft keys/idle return/direct parameters and Pixel
selection/drag/layout checks also pass. All scripts in test:browser passed across a prefix run and
resumed tail: the first attempt lacked CHROMIUM_PATH, a concurrent server then occupied port 5173,
and the completed tail's shell invocation had misplaced log redirection. These invocation issues
are not component defects; no application assertion failed. Further image changes were made after
that suite and have their focused painted-pixel checks; final combined validation is still pending.

Next checkpoint: all **52 root behavioral scenarios pass together with no browser errors**.
All **4,814 Node tests pass with no skips**, and the production frontend build passes after
B38–B45. The two numeric return lifecycle cases include actual output after release/Preview exit.
This remains incomplete property coverage, not a release sign-off.

### Follow-up after checkpoint 55ab7e10 (in progress)

| ID | Setting / path | Observed defect | Correction / evidence |
| --- | --- | --- | --- |
| B31 | Toggle Allow Off / default on | An on toggle could switch off with Allow Off disabled. Default-on state styling could stay on after an allowed off action. | Selection action respects allowUncheck and runtime styling respects an explicit false session state. Real click/reopen check passes. |
| B32 | Radio Group multi / deselect | Second choice replaces the first; clearing the last selection visually restores the default; runtime converts arrays back to a scalar. | Preserve typed selection arrays and explicit empty state through selection, renderer and runtime context. Visible rows and frontend boundary output pass before/after reopen. |
| B33 | Scroll Area negative child positions | Child at y=-80 cannot be reached by scrolling up. | Scroll bounds and thumb mapping include negative positions while retaining authored origin. Real child-visibility check and wheel/clamp/thumb regression. |
| B34 | Scroll Area Content summary | Two real children reported as zero. | Count children in the model's Children map. |
| B35 | Number inline draft / Escape | Draft already changes the committed value; Escape leaves 12 instead of restoring 20. | Buffer typing until Enter/blur, avoid duplicate commit on later blur. Bounds, step, output, cancellation and reopen check passes. |
| B36 | Slider / Knob / Range accessibility value | Slider shows 2.5 but exposes 0.5 to assistive technology. | Resolve the active slider/spinner handle and formatted family readout. Default, keyboard-adjusted, emitted and reopened Slider/Knob values agree. |
| B37 | Multiple Macro instances / label clipping | A second, differently sized Macro resolves its label clip to the first Macro's geometry. | Namespace the face/label SVG references per control and rendering surface. Both controls resolve their own clips before/after reopen. |

Range spinner low/high direct entry was also exercised: cross prevention, maximum clamping,
both displayed values and fresh-document reopen pass. No fix required for those cases.

Macro's four curves, negative depth and mapped output range agree with visible lane proportions
and captured frontend binding payloads. Repeating after a fresh reopen passes; leaving rehearsal
correctly restores the authored 0.25 value. Lanes/values visibility and editable guard also pass.
The initial Macro persistence expectation incorrectly assumed that rehearsal edits were authored;
the test was corrected after checking the explicit previewRehearsal contract, without changing it.

Validation at this follow-up: all 38 then-current behavior scenarios pass together; the two added
Macro scenarios pass separately. All 4,814 Node tests and the production frontend build passed
before the Macro SVG namespace change. Combined validation follows integration with Claude.

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
