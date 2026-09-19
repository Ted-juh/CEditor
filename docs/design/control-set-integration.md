# Control sets in the Windows editor

The September 2026 integration brings Claude's control-set branch into the same source tree as
the local GAIA panel and preview preparation work. Previously `main` was at `f1039c91`, while
the thirty-set catalogue lived only on `claude/ceditor-open-source-contributions-74hkqy`, ending
at `3d9a14d2`. Updating that branch alone did not update the installed Windows application.

## What exists

The original implementation supplied colour tokens, panel materials and lighting, set import /
export, embedded fonts, eleven button archetypes and eleven slider archetypes. Its structural
recipes covered eight types: Knob, Slider, Button, MomentaryButton, ToggleButton, Combobox,
Number and Range. The illustration gallery in Claude also showed imagined interaction states
and other instruments. Those pictures were not evidence that the same shapes existed in CEditor.

The integrated catalogue keeps all thirty sets and presents twelve starting points in
**Panel → Background → Control set → Browse 12 starter designs**. The gallery draws actual
CEditor controls. **Open editable starter** opens an ordinary panel, with gradients, parts,
corners, text and effects materialized into the properties the inspector edits.

| Starter | Distinguishing design |
| --- | --- |
| Graphite | Flat pills, round handles, continuous meters; compatibility baseline |
| Blueprint | Transparent square keys, hairlines, hollow handles, numerical scales |
| Pop | Bold outlines, hard shadows, large round caps and rounded pads |
| Soft | Raised domes, soft shadows, pale recessed surfaces |
| Frost | Translucent faces, broad corners, white rings and reflections |
| Obsidian | Dark glass, illuminated lenses, glowing fills and segmented lights |
| Console | Blade faders, square slots, engraved keys and stepped meters |
| Carbon | Matte rubber faces, grooved caps and inset pads |
| Machined | Billet caps, bevelled keys, deep slots and graduated meters |
| Tolex | Bakelite faces, brass rails, jewel lamps and mechanical wheels |
| Field | Chamfered keys, block caps, stencilled legends and clear scales |
| Phosphor | Open wire shapes, dot scales, ring handles and LED segments |

Across non-default sets, structural recipes now cover 29 types: the original eight plus
CyclicButton, TimedButton, OneShotButton, RadioButtonGroup, TextInput, Listbox, Group, Container,
TabContainer, ScrollArea, Meter, ProgressBar, Ribbon, PitchWheel, ModWheel, Crossfader, DrumPads,
Numpad, Matrix, Envelope and VectorJoystick. Label typography follows the set too. Graphite
retains its default appearance. Each design uses existing editable properties, plus the new
Drum Pads **Pad design** and Crossfader **Handle design** fields.

This does not claim complete anatomical redesigns for all 58 types. Keyboard, StepSequencer,
Transport, Panic, ChordPad, the other musical generators and specialized displays still need
their own family design work. Even covered families reuse anatomy where appropriate: a list
changes its row treatment, whereas a slider changes its cap and scale. The thirty catalogue
names are finishes and combinations, not thirty independent mechanisms.

## Editing and mixing

Core → **Control design** selects a built-in design for one control or a multi-selection.
**Follow panel** follows the panel choice. A pinned design survives copying and save/reopen;
individual property edits take precedence. Starters come with pinned, materialized designs so
their properties can be inspected directly and copied between panels. Applying a set to a panel
does not overwrite pinned controls or explicit property edits.

The same resolution runs in the editor, preview and export. Cached scenery now carries its
panel's set and includes it in the cache identity, preventing text and plates from retaining the
previous design after a switch. Background preparation uses the same resolved parts.

## What remains a design proposal

Future directions worth developing are controls with distinct physical behavior: a detented
rotary selector, a thumbwheel, a rocker, a stepped resistor ladder, a pressure ribbon and an
analogue needle meter. Their interaction geometry and keyboard operation must match their
appearance. The illustrated guards, fingerprint overlays, motion blur, drawer-style menus and
photographic casing details in Claude's gallery are not shipped features here. They should be
built as editable parts and verified in the editor before being advertised.

## Source and verification

- `models/controlSetDesigns.js`: button and slider archetypes.
- `models/controlSetCoverage.js`: curated directions and broader family recipes.
- `models/controlSetStarter.js`: the actual editable sample panels.
- `models/controlSetFamilies.js`: property inheritance and per-control selection.
- `panels/ControlSetGallery.svelte`: gallery and creation actions.
- `CE/sets/`: importable definitions; `CE/panels/Control set starters/`: editable samples.

Regenerate definitions with `node scripts/export-control-sets.mjs` from `CE/web`. Regenerate
starters with `node --import ./test/support/register-svelte.mjs scripts/export-control-set-starters.mjs`.
Run `npm run test:all`, `npm run test:browser`, and `node browser-checks/controlSetStarters.mjs`
(with `CHROMIUM_PATH` set). Build Windows with `tools/scripts/build-native.ps1 -Configuration Release`.
Use CMake's `CEditor` install component to update the installed executable and web bundle together.

The pre-integration local GAIA state was preserved before regenerating the repository example.
The old example's exports still referred to the removed top page selector. The regenerated one
uses the current generator and linked envelope bindings. No live MIDI device is needed or used
by the design gallery's static preview.
