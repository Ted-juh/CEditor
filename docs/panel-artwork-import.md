# Panels from drawn artwork, and components that stay linked

Two editor workflows for building panels quickly and keeping them consistent. Both are in the web
editor and need nothing from the native build.

## New Panel from SVG Artwork

**File › New Panel from SVG Artwork…** turns an SVG drawn in Inkscape, Illustrator, Affinity or any
other vector editor into a new panel. The drawing becomes the background, and the placeholders
you drew become real controls on exactly the spots you drew them.

### Drawing the placeholders

The convention follows VCV Rack's, which has built thousands of module panels this way.

1. Draw the panel artwork as usual: faceplate, legends, scales and screws.
2. Add a layer named **`components`**. `controls`, `placeholders` and `ceditor` also work. Inkscape
   layer names, Illustrator layer names and plain group ids all count.
3. In that layer, draw one **rectangle, circle or ellipse** per control, covering the area the control
   should occupy. Hiding the layer is fine; it is read either way and is never drawn on the panel.
4. Say what each placeholder is, **either by name or by colour**:

| Name contains | Becomes | Colour, if unnamed |
|---|---|---|
| `knob`, `pot`, `rotary`, `encoder`, `dial` | Knob | red circle |
| `slider`, `fader` | Slider (vertical if taller than wide) | red long rectangle |
| `button`, `btn`, `momentary`, `trigger`, `pad` | Button | red square-ish rectangle, or green |
| `toggle`, `switch`, `latch` | Toggle button | — |
| `led`, `lamp`, `light`, `indicator` | LED (see below) | magenta |
| `label`, `text`, `caption`, `title`, `legend` | Label | blue |
| `display`, `lcd`, `screen`, `readout` | LCD display | yellow |
| `meter`, `vu` | Meter | — |
| `menu`, `combo`, `dropdown`, `select` | Combobox | — |

The keyword can sit anywhere in the name, and the other words become the control's name:
`knob-cutoff`, `Cutoff knob` and `knob cutoff` all produce a knob called `cutoff`. Names are read
from the Inkscape object label, then its Title, then the Illustrator layer name, then the id.
Names editors assign automatically (`rect12`, `circle4`) are ignored.

Colours can be approximate, since a hand-picked red is rarely exactly `#FF0000`. Fills set through
CSS classes, as Illustrator writes them, count.

### What you get

- A new panel sized to the drawing. Millimetres, inches and points are converted at 96 px per inch,
  so a 128.5 mm tall drawing makes a 486 px tall panel.
- The drawing, minus the placeholder layer, as the panel's background image (fit: fill). It is
  embedded in the panel, so it survives Save and Share Panel.
- One control per placeholder, positioned and sized on its bounding box after every group transform
  (translate, scale, rotate, matrix). Labels get a transparent background and type sized to the box.
  Buttons get no legend of their own, because the artwork prints it.
- A report in the Console. It lists every placeholder whose type came from its colour or shape
  rather than its name, and every one that could not be placed, with the reason.
- **Text in the artwork keeps its font.** A browser draws an SVG background without the page's
  fonts, so the fonts the artwork's text names are carried inside it: the panel fonts and any font
  you imported under Settings → Fonts, each cut down to the characters the artwork uses. The
  background is replaced with that copy a moment after the panel opens. Text in a font CEditor
  cannot supply draws in a fallback font and is reported. Import the font and import again, or
  convert the text to outlines in the drawing program.

### Limits

- **Only rectangles, circles and ellipses are measured.** A path, line, polygon, text or `<use>` in
  the placeholder layer is reported and skipped; convert it to a rectangle or circle.
- **LEDs** are placed as display-only lamps: a toggle showing only its lamp, dark red when off and
  glowing when on. A click doesn't light one; bind its `state` port to a synth parameter and the synth
  does. They export no host parameter, as an indicator shouldn't.
- **New Panel** always makes a new panel. To bring a revised drawing into a panel you have already
  worked on, use **Update Panel** (below).
- To discard an import, close its tab without saving. It is a new, unsaved panel until you save it.

## Update Panel from SVG Artwork

Artwork gets revised, and by then the panel has bindings, scripts and links. **File › Update Panel
from SVG Artwork…** brings the open panel up to date with a new version of its drawing, and keeps
that work. Before changing anything it shows what it will do and asks.

What it changes:

- **The background** is replaced with the new drawing, and the panel is resized if the drawing was.
- **A control moves only if its placeholder moved in the drawing.** A control you nudged in CEditor
  keeps your position while the drawing leaves it alone. If both moved, the drawing wins and the
  summary names the control.
- **A new placeholder becomes a new control.**

What it never does:

- **Delete a control.** A control whose placeholder is gone is kept, bindings and all, and listed so
  you can decide.
- **Re-add a control you deleted** from the panel while its placeholder is still in the drawing.
- **Change a control's type**, or anything about it except position and size. If a placeholder now
  says `slider` over a knob, the knob is moved and the mismatch is reported.

How controls are matched to placeholders:

1. **By the placeholder's name**, or its id if it has none. Renaming a control in CEditor does not
   break the match. Renaming the *placeholder* in the drawing does: it becomes a new placeholder, so
   the old control is kept and a new one is added.
2. **Unnamed placeholders** (common in Illustrator) are matched by overlap with where they were.
3. **A panel that was not made by an import** (built by hand, or imported before this existed)
   adopts controls whose names are the placeholders' names, and remembers the match from then on.

**Undo** puts the controls and the panel size back, but **not the previous background image**. Panel
background images are kept out of the undo history everywhere in the editor. The confirmation says
so before you commit. To go back fully, run Update again with the previous drawing.

## Linked components

A custom component placed from the library remembers which package and version it came from. The
**Source** card in its Public API properties now compares it with the library and acts on the result.

| Card says | Meaning | Offered |
|---|---|---|
| Up to date | Same design as the library version it came from | Detach |
| Update available | The library has a newer version, and this copy has no design edits | **Update**, Reset, Detach |
| Edited on this copy | This copy's design was changed; the library has nothing newer | **Save to library** as the next version, Reset, Detach |
| Library changed · copy edited | Both | Update (asks first), Reset, Detach |
| Not in this library | The package it came from is not saved here | Detach |

**What an update keeps:** position and size, name, layer, device bindings, panel routes to other
controls, the chosen variant, and every **published value** set on this copy (a published input or
editable property such as a label or accent colour). A published value this copy never changed takes
the library's new default.

**What an update refuses to do:** discard design edits made on this copy. It says how many there
are and needs a second click to go ahead.

**Update N copies on panel** updates every copy of the same package on the panel that can be
updated without losing anything, as one undo step. It leaves the others alone and says how many.

**Save to library as X.Y.Z** writes this copy's design edits back as the package's next version
(1.0.0 → 1.1.0; an existing version is never overwritten), then links the copy to it. Its position,
name, bindings and published values (its legend, say) stay its own, not the new default. Other
copies on the panel are then offered the update. It's only offered while the library hasn't moved on
since the copy was placed; otherwise update or reset first, so the library's newer changes aren't
saved over.

**Reset to library** returns a copy to the library version exactly, keeping only placement and wiring.
**Detach** keeps the component as it is and stops it tracking the library.

The comparison finds the exact version a copy was placed from by its fingerprint, so it can tell a
library change from an edit on the copy. If that version is no longer in the library, it can only
compare with the latest one. Differences are then marked `?`, and a plain update is refused for the
same reason.

## Create Component from Selection

Select some artwork on a panel (a plate, its legends, a scale, a logo), with or without the knobs and
sliders on it, and choose **Edit › Create Component from Selection…** or the same item on the canvas right-click menu. You're asked for a name
(the first label's text is suggested). The selection is saved to the library as a component, and
the panel gets a **linked copy** in its place, so the Source card and "Update N copies" above work on
it from then on.

Every label's text is published, so each copy can carry its own legend: place the plate three times
and label it CUTOFF, RESONANCE and DRIVE, and an update to the plate keeps all three.

### Faithful or refused

The command replaces what you selected, so the copy must look exactly like it. Each control either
converts through a path that draws the same way, or the command is refused, naming the control and
the reason. Nothing is converted partly.

| Converts | How |
|---|---|
| Background, Image | Its background (fill, gradient, image, border, corners) is carried as-is, and drawn by the same renderer. |
| Shape | The exact SVG the panel draws for it, as an image. |
| Label | Its plate, plus its text over the same padded box. Font, size, weight, style, case, colour and spacing are carried. |
| Knob, Slider | The knob itself, drawn and driven by the panel's own knob code, with its value as a channel of the component. Its device bindings and its host parameter id go with it. See [Knobs and sliders](#knobs-and-sliders). |

| Refused, with the reason given | Why |
|---|---|
| Buttons, and every other control with a value that is not a knob or slider | Not supported yet. A momentary button in particular has no equivalent: a component's hit zone can toggle or cycle a value, not release one. |
| A control a script mentions | The component can't keep the name the script uses. The script and line are named. |
| A knob anything else addresses | A route, a meter, LCD or envelope source, a link (anything that stores its id), a script's target, an LCD soft key, a setlist capture. The place is named. |
| A knob with two handles, a control form, a background plate, a caption, an icon or lamp, extra parts, rotation, a script of its own, its device bindings switched off, or a binding on a port other than its value | The part draws what the panel's knob renderer draws and nothing else, and holds one value. |
| A knob that is read-only, disabled, hidden, or kept out of host automation | It would behave differently as one part of a larger control. |
| Text wider than its box, or on more than one line | The panel wraps it; a component would not. |
| Underline, strikethrough, text aligned to the top or bottom, an icon, a lamp, effects, scaling | The component would draw them differently. |
| Controls inside a container, or across layers | Select the container's contents, or one layer at a time. |
| An unselected control painted *between* the selected ones and overlapping them | No single depth keeps it where it is. It is named; select it too, or move it. |

Measured on the QA panels: 1,984 of 1,985 labels pass the settings rules, and the width check then
refuses the ones whose text overflows its box. On the Roland Gaia sheet that leaves 909 of 924
labels converting; on the scripting sheet, 490 of 553. Browser checks draw those panels before and
after with the editor's own renderer and compare them pixel by pixel.

Undo puts the controls back. The saved component stays in the library, where you can remove it from
the Library tab.

### Knobs and sliders

Converting knobs and sliders was first scoped on 2026-09-28 and paused, for four reasons written
here at the time. It was built on 2026-09-29, and each of them is answered by what was built rather
than by a trade-off:

- **DAW automation.** A host parameter's id came from the control: knob `cutoff` exported as
  `cutoff.value`, and a channel `cutoff` of component `Filter` would export as `Filter.cutoff`. The
  plug-in names its parameters by that id, and a DAW saves automation lanes and the plug-in's state
  against it, so every saved session would have lost the knob. **Now the placed copy keeps the id**:
  it records `Core.hostParameters[channel] = { id: 'cutoff.value', label: 'cutoff' }`, and the export
  publishes the channel under the knob's own id and label, with its range, unit and device wire
  unchanged. Only the path the player uses to find the value is new. Snapshots are keyed by the same
  id, so they keep working too. A kept id is dropped rather than duplicated: if the copy is
  duplicated, or a new knob takes the old name, the later one exports under its own id.
- **The look.** Parts could only approximate a knob. So a knob is not rebuilt from parts: it becomes
  one part that carries the knob, drawn by the panel's own knob renderer through the panel's own
  state machine, fed what the panel would feed it: the value, and whether the knob is hovered,
  pressed or focused. The same knob code handles the drag, the wheel, the arrow keys and the
  double-click reset.
- **Momentary buttons** still have no equivalent, and buttons are still refused.
- **References.** Anything that addresses a knob by id or by name is found and named, and the
  command is refused. An explicit export list is pointed at the channel instead (same id), and
  snapshots need nothing.

The knob's device bindings move to the placed copy, onto the knob's channel, and its current value
comes along, so nothing moves on screen. The copy gets a name no other control has, because the
channel is addressed through it.

**How it is proved.** `browser-checks/knobsFromSelection.mjs` builds a panel of knobs and sliders,
and takes a cluster of the Roland GAIA sheet with its legends. It converts a copy of each and does
the same things to both in preview, the surface the exported plug-in mounts:
- the picture at rest and hovered;
- an absolute knob and a relative dial dragged past their ends and back;
- two sliders;
- the wheel;
- a double-click reset;
- a click, the wheel and arrow keys to move focus.

The pictures are identical to the pixel and the values identical to the last digit. A knob bound
to a raw CC sends the synth the same messages, one for one. The export publishes the same host
parameters.

That last comparison found a fault that predates the conversion. Every component's patch carries all
its channels, and raw CC bindings were sent from every patch. So moving one knob of a multi-knob
component re-sent every other knob's CC, and pressing one sent its value twice. Now a channel sends
when it changes, or when it is the one being driven, as a panel knob does. Profile-parameter
bindings follow the same rule. On the QA sheets, 772 of 774 top-level knobs and sliders pass the
rules. The two refused have a script of their own, and device bindings switched off.

**Two differences remain, both stated rather than hidden:**

- **The editor canvas, outside preview.** There a panel knob is drawn without a runtime, so its
  pointer sits at the minimum while its readout shows the default. A converted knob draws its
  default. Preview and the exported plug-in are identical.
- **Keyboard.** A component is one Tab stop where the panel had one per knob. Tab reaches the first
  knob, and the keys move the knob last pressed. The focus ring, and each knob's focus look, are
  drawn where the panel drew them.

A module that includes a button is still made the old way: an artwork component, with the button
placed beside it (and Duplicate for the whole group).
