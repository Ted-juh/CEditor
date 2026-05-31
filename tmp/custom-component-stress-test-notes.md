# Custom Component Designer Stress Notes

Generated 12 saved custom components and loaded package instances into one panel:

1. Neon Dial - circular arc/tick dial with pointer binding.
2. Triple Macro Rings - three independent circular channels and hit zones.
3. Fine Horizontal Scale - horizontal line, generated ticks, fill and thumb bindings.
4. Bipolar Vertical Scale - vertical ticks and reverse-direction slider behavior.
5. Segment Meter - repeated LED generator with generated segment hit zones.
6. Vertical LED Ladder - vertical single-active LED selector.
7. XY Pad - two-channel pad with generated grid and cursor bindings.
8. Label Above Button - bordered label plus two-state button inside one outlined shell.
9. Transport Cluster - multi-button enum component with mode states.
10. Arpeggiator Sequencer - generated runtime step editor with note blocks.
11. ADSR Envelope - multi-channel envelope display with draggable phase zones.
12. Waveform Selector - segmented enum selector with individual hit zones.

## What Looks Strong

- The same component package model can represent circular, horizontal, vertical, grid, button, meter, keyboard, and arpeggiator patterns.
- Generators are powerful: ticks, LEDs, grids, piano keys, and arpeggiator parts reduce manual layer work dramatically.
- ValueChannels, Behaviors, HitZones, States, Bindings, and PublishedProperties are enough to describe reusable working controls, not only static drawings.
- The package/library path can save reusable controls and instantiate them into a normal panel.

## GUI/UX Improvements

- The designer needs a first-class component test bench where a user can drag/click the component and see live ValueChannel changes without leaving the designer.
- Smart kits should stay selectable/resizable as one object, with an obvious Expand/Edit Internals action.
- Generator controls need friendlier editors: tick count, minor ticks, label sets, geometry, radius, start/end angle, LED mode, grid rows/columns, and previewed hit zones should not feel like raw data.
- State authoring needs a visual state matrix: pick state, see changed parts highlighted, and preview state combinations.
- Hit zones need clearer feedback and deletion affordances; generated hit zones should be folded under their kit/generator by default.
- Import vs create language still matters: the panel toolbar should insert saved packages, while the standalone designer should create/edit packages.
- Saving should show an explicit library result: package name, validation status, thumbnail, and where it can be inserted from.
- Components need resize policies: stretch, fixed aspect, scale internals, pin labels, and min/max size should be visible in the inspector.
- Bindings need a friendlier mapping editor with source, target, curve, clamp, and live sample value rather than path strings.
- The arpeggiator is powerful but needs a clearer mode switch between drawing notes, moving notes, resizing notes, and selecting notes.
- Preview mode should distinguish visual preview from runtime simulation, because users expect the latter when they see a Preview button.
- Large generated components need layer-tree grouping/collapse to avoid layer noise.
- There should be package validation warnings directly in the designer before save/export.
