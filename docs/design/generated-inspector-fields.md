# Generated inspector fields — 2026-09-29

Handoff item 4 asked whether the inspector's repeated property editors can be generated from
metadata while specialised controls still plug in. It asked to start with one low-risk section,
not a rewrite, and to check how much of the property model a JSON Schema form library
(svelte-jsonschema-form) could take before adopting it.

**Built:** `properties/FieldList.svelte` draws ordinary fields from data (`utils/inspectorFields.js`
describes the kinds, `models/inspectorFieldSets.js` holds the sets). The kinds are switch,
slider, number and select. The **Kinetic** editor and three of **Crossfader**'s four sections use
it. Anything that is not ordinary stays the editor's own, as a Svelte snippet
placed by a `slot` entry.

**Not adopted:** the JSON Schema form library, for the reasons below.

## How much of the inspector is ordinary

Counted across the 72 section editors (`sections/*Editor.svelte`), 1,340 `PropertyCell`s:

| Cell holds | Cells | Share |
|---|---|---|
| a lone number or scrub field (`NumberCell`, `PropertyScrub`) | 406 | 30% |
| a lone select | 232 | 17% |
| a lone switch (`PropertyToggle`) | 187 | 14% |
| a lone text input | 109 | 8% |
| anything else: combined widgets, buttons, pickers, swatches, previews | 405 | 30% |

So about 70% of cells are one widget writing one value, the part data can describe. The other 30%
is why generated fields have to have a slot for the editor's own markup, and why a whole-section
generator would not fit.

## Why not a JSON Schema form library

The parts of the property model JSON Schema expresses (`type`, `minimum`, `maximum`, `enum`,
`default`, `description`) are the easy half. Every one of these is a convention CEditor relies on
that it does not express:

- **Writes are paths into a section tree**, `updateControlProperty(id, 'Kinetic.gravity', v)` into
  a `_children` structure, not two-way binding to a plain object. Undo, history labels and the
  shared-path write all hang off that call.
- **Default-on switches.** Most booleans read a missing value as ON (`value !== false`). JSON
  Schema's `default` is a value to fill in, which would write a key the document never had.
- **Display scaling.** 0..1 values are shown and dragged as 0..100 %.
- **Colours are AARRGGBB strings** edited through the shared swatch and Colors tab, not a colour
  input.
- **Layout is a four-column span grid** with a hint per cell, written to the rules in
  `docs/property-hints.md`.
- **A third of cells are custom.** The library would render its own markup. Matching the existing
  widgets means writing a theme that implements every one of them, which is the renderer written
  here, plus a dependency.

The schema here keeps JSON Schema's vocabulary where it overlaps (`min`, `max`, `default`, and
`hint` for `description`), so an export to JSON Schema stays a small mapping if it is ever wanted.
Nothing was added to `package.json`.

## What the Kinetic move proves

- **Nothing visible changed.** The editor was rendered on the server before and after with the
  same control, in three states: defaults, set values, and an emptied section. The markup was
  identical except for whitespace between grid cells, which a CSS grid does not draw.
- **The fields work in the real editor.** `browser-checks/inspectorFields.mjs` flips the Run
  switch, drags a plain and a percent slider, and uses the Sync control in its slot, then reads
  the stored values. The acceptance harness's properties mode could not show this: it fills only
  text and number inputs, and edited 0 Kinetic fields before and after.
- **One source for ranges.** `test/inspectorFields.test.js` checks each field's writable range
  against the scripting API's range for the same field (`scripting/componentVerbs.js`). The rule:
  the inspector may offer less than a script (gravity is 0..4 by hand and −4..4 from a script),
  never more. That compared two hand-kept lists at first; the verbs now read the field sets
  (step 3 below).

## Extending it, if it is wanted

In order, each a small step that pays for itself:

1. **Number and select kinds.** *Done, 2026-09-29, with Crossfader as the section that proves
   them.* A number field is a `NumberCell` in the three arrangements the editors use: a compact
   cell, a cell whose label differs from the number's own, or the NumberCell alone. It can clamp
   on write to its range or only to its minimum. A select lists `[value, label]` options in the
   order it presents them, and may name the `table` its component reads (`componentTables.js` and
   the layout modules it imports). A test holds such a select to exactly that set of values. Order
   is left to the inspector, because Crossfader's Law is presented as Equal power, Linear, Sharp
   while the table reads linear, equalPower, sharp. Any field can carry `when`, which is how
   Crossfader's Rest and Time appear only once "On release" asks for them.
   Crossfader's Handle design, Crossfader and Return to rest sections are data now; Labels &
   colours stays hand-written (text inputs and the swatch cluster). Its render was identical
   before and after in four states, including both conditional layouts. The acceptance harness's
   properties mode edits the same 9 Crossfader fields as before, each with a full undo round trip.
   `componentEnums.test.js` used to parse the Crossfader editor's source for its orientation
   options; it now reads the field set. It still parses seven other editors (LCD, Pixel, Chord Pad,
   Ribbon, Note Ribbon, Meter, Matrix), and each of those ends when its section moves.
2. **Move sections as they are next edited**, not in a sweep. Each move gets the same before/after
   render comparison the Kinetic move had.
3. **One range for the inspector and the scripting API.** *Done, 2026-09-29.* A ranged field is
   now also where a script verb gets its range: `componentVerbs.js` reads `scriptRangeOf(section,
   key)` from `models/inspectorFieldSets.js` instead of repeating the numbers. A script reaches the
   field's own range unless the field declares a wider `script` range. Three do, as they always
   did: Kinetic's gravity (−4..4 against the inspector's 0..4), its bounce (up to 1.5 against
   100 %), and Crossfader's detent (0..1 against 0..0.5). A test holds that a script range is never
   narrower than the inspector's. All eight verbs over these fields (Kinetic gravity, bounce,
   friction, keep alive; Crossfader mix, detent, rest value, return time) read from here. The
   serialised metadata of all 445 verbs was identical before and after, so no script sees a
   different range. Changing a field's range moves its verb with it. A verb naming a field that is
   not in a set throws at load, the same rule the enum tables follow.

Not recommended: generating whole sections, or folding the custom 30% into ever more field kinds.
A field kind that only one section uses is a snippet with extra steps.
