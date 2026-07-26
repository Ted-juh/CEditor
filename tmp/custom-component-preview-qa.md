# Custom Component Stress Preview QA

This is a component-by-component QA pass for the 12 generated custom components in `?custom_component_stress=...`.

Scope checked:
- package validation
- materialized preview parts/hit zones
- binding target existence
- state patch target existence
- generated part overflow
- basic preview interaction patch behavior
- obvious visual/function mismatches from the authored fixture

## Overall Findings

The package model is strong enough to represent the 12 components. After the follow-up fix pass, all 12 generated packages validate with zero warnings and the previously static readouts/arcs now have runtime bindings where the renderer supports them. The designer now exposes the important runtime truth directly in the tooling: live channel readouts, active hit-zone/drag-mode details, grouped/generated hit-zone overlays, grouped generated layer tree output, generator bounds controls, enum grouping, enum state coverage, dedicated arpeggiator tools, first-class XY behavior semantics, ADSR path rendering, and waveform icon rendering.

- Preview mode is labelled on the main canvas as static preview, and Live Test Surface is the interactive runtime simulator.
- Generated controls create many hidden/generated hit zones; these are grouped/probeable in the test bench and folded by source in the layer/hit-zone tree.
- Drag/click behavior works only when a proper pointer event is used; simple non-pointer inspection cannot prove drag behavior.
- State authoring has an enum coverage matrix, plus enum-group diagnostics for mutually exclusive controls.

## 1. Neon Dial

Intended: circular cutoff dial. Drag the circular hit zone; pointer rotates; radial ticks frame the ring.

Status: works.

Works:
- Valid package.
- 28 materialized parts, including generated circular ticks.
- Dial hit zone and pointer binding are valid.
- No layout overflow detected.

Resolved:
- Live Test Surface shows the current channel value/normalized value plus active zone/drag mode while testing.

## 2. Triple Macro Rings

Intended: three nested ring controls with independent values.

Status: works.

Works:
- Valid package.
- Three channels, three behaviors, three hit zones.
- Three pointer bindings are valid.
- Generated ticks render without overflow.

Resolved:
- Live Test Surface now draws hit-zone overlays, including compact grouped overlays for generated zones.

## 3. Fine Horizontal Scale

Intended: horizontal gain scale. Drag rail; thumb and fill follow value.

Status: works.

Works:
- Valid package.
- Thumb X and fill-width bindings are valid.
- Generated ticks render without overflow.

Resolved:
- Tick generator controls now have a clearer generator editor with type labels, output preview, and first-class bounds controls.
- Live Test Surface reports changing values and shows hit-zone/active input feedback while dragging.

## 4. Bipolar Vertical Scale

Intended: vertical balance scale with center marker.

Status: works as a basic vertical value control.

Works:
- Valid package.
- Vertical thumb binding is valid.
- Generated vertical ticks render without overflow.

Resolved:
- Live Test Surface shows drag mode and normalized channel values while interacting.

## 5. Segment Meter

Intended: horizontal 16-segment level meter; click a segment to set level.

Status: works.

Works:
- Valid package.
- 16 generated LEDs and 16 generated segment hit zones.
- Generated zones correctly map to level thresholds.
- No overflow detected.

Resolved:
- Generated hit zones are grouped/probeable in the test bench and folded by generator/source in the layer/hit-zone tree.

## 6. Vertical LED Ladder

Intended: single-active vertical stage selector.

Status: works as a generated LED selector.

Works:
- Valid package.
- 12 generated LEDs and 12 generated hit zones.
- Single-active generator mode is configured.
- Generated zones map to stage thresholds.

Resolved:
- Dense generated LED zones are summarized as grouped overlays in the Live Test Surface.
- Pointer testing is supported by Live Test Surface; non-pointer probe samples remain available in the bench.

## 7. XY Pad

Intended: 2D pad. Drag/click to set X/Y; dot and crosshair move inside field.

Status: works after fixes.

Works:
- Valid package.
- Grid generator is now scoped inside the pad field.
- Generated cell zones now map X and Y separately.
- Dot and cursor bindings are valid.

Resolved:
- Behavior editing now exposes explicit XY semantics with X/Y channel selectors and XY defaults.
- Live Test Surface updates and displays X/Y raw and normalized channel values while dragging.

## 8. Label Above Button

Intended: static bordered label above a two-state button, all inside one outlined background.

Status: works.

Works:
- Valid package.
- Button cycles A/B.
- State patches only change button fill.
- Label text and label border remain unchanged.
- No overflow detected.

Resolved:
- State A/B coverage is visible in the State Coverage matrix.
- Label border and container outline are exposed as editable public properties for panel instances.

## 9. Transport Cluster

Intended: Stop/Play/Record segmented command control.

Status: works after fixes.

Works:
- Valid package.
- Stop, Play, Record zones now set explicit enum values.
- All three modes now have visual state patches.
- No overflow detected.

Resolved:
- Enum Groups now show the Stop/Play/Record zones as one mutually exclusive enum channel.
- State Coverage shows whether each enum value has a state and reachable zone. Live Test Surface shows the active enum value while testing.

## 10. Arpeggiator Sequencer

Intended: 32-step arp editor with note blocks and generated draw/move/resize zones.

Status: visually impressive, but this exposes major UX/runtime complexity.

Works:
- Valid package.
- 32 steps and generated note lanes render.
- Arpeggiator generated hit zones exist.
- Pattern notes now fit in the visible 12-note window.

Resolved:
- Arpeggiator edit mode now has explicit Select, Draw, Move, Resize, and Velocity tools on the design surface.
- Generated arpeggiator hit zones are grouped/probeable in the test bench.
- Specialized Inspectors now identify arpeggiator components and point to the dedicated surface tooling.
- The stress arpeggiator now has a normal arpeggiator behavior module and surface hit zone.

## 11. ADSR Envelope

Intended: envelope display with attack/sustain editable zones.

Status: visually renders, but runtime feedback is incomplete.

Works:
- Valid package.
- Grid generator is scoped inside the envelope display.
- Attack and sustain hit zones/behaviors are valid.
- No overflow detected.

Resolved:
- ADSR now uses an SVG-backed envelope path renderer driven by attack, decay, sustain, and release bindings.
- Decay and release now have hit zones, dots, labels, and visual bindings alongside attack/sustain.

## 12. Waveform Selector

Intended: four-segment waveform selector.

Status: works after fixes.

Works:
- Valid package.
- All four zones now set explicit enum payloads.
- All four enum options now have visual active states.
- No overflow detected.

Resolved:
- Waveform selector now renders actual sine, saw, square, and noise icons through the waveform icon renderer.
- State Coverage and Live Test Surface show the current enum value prominently.

## Fixes Applied During This QA Pass

- Added payload/X/Y/meta support to `createHitZone()`.
- Fixed enum `setValue` zones so they do not get overridden by cycle behavior.
- Fixed enum denormalization so normalized generated zones can choose the right enum index.
- Fixed grid/LED/tick generators to support scoped `bounds`.
- Updated XY, ADSR, Transport, Waveform, and Arpeggiator stress fixtures.
- Removed bogus hover-state patching when a component has no `background` part.
- Added default values for generated editable label properties.
- Added live bindings for dial value arc/readout, macro ring arcs, scale readouts, meter/ladder values, XY readouts, and ADSR labels/dots.
- Added format/template-capable binding output for runtime readouts.
- Added Live Test Surface channel readouts with raw/display/normalized values and active hit-zone/drag-mode feedback.
- Added enum State Coverage matrix to verify reachable enum values and visual state coverage.
- Made state preview matching account for enum channel values driven through the channel rig.
- Added Live Test Surface hit-zone overlays, including grouped summaries for dense generated zones.
- Added generated source folding/collapse in the layer and hit-zone tree.
- Added first-class generator bounds controls and clearer generator type labels.
- Added explicit XY behavior semantics with X/Y channel selectors and an XY defaults action.
- Added Enum Groups diagnostics for mutually exclusive enum controls.
- Added Specialized Inspectors for XY pads, meters, segmented enums, arpeggiators, and envelopes.
- Added dedicated arpeggiator tool modes: select, draw, move, resize, and velocity.
- Added renderer support for SVG-backed envelope paths and waveform icons.
- Updated ADSR stress fixture with a bound envelope path plus attack/decay/sustain/release dots, labels, and hit zones.
- Updated waveform stress fixture with actual waveform icons.
- Published label border/container outline properties in stress components when those parts exist.

## Recommended Next UX Work

No blocking QA problems remain from this pass.

Future polish — **all three shipped (2026-07-05)**:
1. ~~Add richer visual state-rule authoring for non-enum compound conditions.~~ Done — states carry an optional `rule` (compound channel/flag condition, same language as links/hit zones) with a ConditionBuilder in the States inspector tab; the filmstrip badge shows rule triggers.
2. ~~Add optional color/shape presets for the new waveform and envelope renderers.~~ Done — preset strips (6 color presets; 4 waveform shapes; 5 ADSR silhouettes) appear when a waveformIcon/envelopePath part is selected.
3. ~~Add keyboard shortcuts for the arpeggiator tool modes.~~ Done — keys 1–5 switch Select/Draw/Move/Resize/Velocity; shown on the toolbar buttons and the `?` cheatsheet.
