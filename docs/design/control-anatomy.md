# Control anatomy: the second design pass

The first twelve starters relied too heavily on the same circular knobs and rectangular
keys. This pass adds twelve rotary forms, twelve action-key forms, twelve switch forms
and twelve meter layouts. They are vector controls rendered by the same editor and player.
The gallery includes a grayscale comparison switch.

| Set | Rotary construction | Action / switch construction | Meter |
| --- | --- | --- | --- |
| Graphite | Flat disc | Tile / sliding tab | Continuous bar |
| Blueprint | Exposed pointer and reference cross | Crosshair key / knife switch | Ruler cursor |
| Pop | Rotating folded tab | Folded key / bookmark | Tally ticket |
| Soft | Asymmetric moulded pebble | Cushion / oval rocker | Capsule |
| Frost | Open ring with moving bead | Glass disc / orbit switch | Glass column |
| Obsidian | Lens with central readout | Touch strip / split field | Digit drums |
| Console | Skirt and raised pointer | Piano key / latching cap | VU needle |
| Carbon | Grooved roller | Recessed pad / bending strap | Raised blocks |
| Machined | Graduated vernier dial | Hexagonal plunger / sliding bolt | Instrument needle |
| Tolex | Arched tuning window and wheel | Typewriter key / Bakelite lever | Radio needle |
| Field | Scalloped grip | Guarded key / guarded toggle | Flag indicator |
| Phosphor | Segmented encoder | Pixel key / binary cells | Dot array |

## Editing

Core → Control design → Form selects a mechanism independently of the set. Size, depth,
scale divisions, readout, face, housing, ink, legends and indicator colours are editable
in the same card. The shape remains vector geometry; it scales with the control and saves
in `.cepanel`. Form choices and authored properties survive copying into another set.

The new parametric forms use their own geometry renderer. They do not claim to expose every
SVG vertex as an independent Part. **Original parts** explicitly restores the previous
Parts renderer; **Follow set** inherits the set's form. Sliders, pads, envelopes and other
families retain their existing editable renderers and earlier design recipes. This is a
focused reconstruction of the most visually defining controls, not 58 entirely new families.

## Behavior and states

The original control owns focus, keyboard, drag, wheel, disabled state and MIDI. Rotary
faces read the current normalized value; scales and readouts read the configured range.
Switches move with the checked state and action keys respond while pressed. Needle meters,
columns and counters follow the meter's live value. Their geometry is decorative and never
intercepts pointer input. No animations run at idle.

A vernier face represents one rotary value; it is not a new two-axis coarse/fine input.
Scale divisions are visual and do not quantize values. Set Behavior → step for discrete
values. The protective rails are visible housing, not safety interlocks. Rubber shapes do
not imply pressure-sensing hardware. The existing control behavior determines those functions.

Graphite remains the default compatibility appearance for existing documents. Its new flat
forms are explicitly selected in its starter. Other sets supply form defaults which can be
overridden with an individual form or Original parts.

## Verification

`controlSetStarters.mjs` exercises all twelve through the actual preview: keyboard value
changes, clicked switch states, pressed/released action faces, crossfader drag, disabled
controls, the Original parts escape hatch, gallery grayscale and starter creation.
`controlAnatomy.test.js` verifies saved overrides, value ranges and unchanged musical
configuration. Generated starters and importable set files are regenerated with the existing
export scripts. The QA-09 fixture must be refreshed when Core defaults change because its
embedded custom packages include those defaults in their fingerprints.
