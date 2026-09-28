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
| `led`, `lamp`, `light`, `indicator` | Round lamp (see below) | magenta |
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

### Limits

- **Only rectangles, circles and ellipses are measured.** A path, line, polygon, text or `<use>` in
  the placeholder layer is reported and skipped; convert it to a rectangle or circle.
- **There is no LED control yet**, so LEDs are placed as round red lamps (a Shape). The report says so.
- The import always makes a **new** panel. Copy controls across if you want them in an existing one.
- To discard an import, close its tab without saving. It is a new, unsaved panel until you save it.

## Linked components

A custom component placed from the library remembers which package and version it came from. The
**Source** card in its Public API properties now compares it with the library and acts on the result.

| Card says | Meaning | Offered |
|---|---|---|
| Up to date | Same design as the library version it came from | Detach |
| Update available | The library has a newer version, and this copy has no design edits | **Update**, Reset, Detach |
| Edited on this copy | This copy's design was changed; the library has nothing newer | Reset, Detach |
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

**Reset to library** returns a copy to the library version exactly, keeping only placement and wiring.
**Detach** keeps the component as it is and stops it tracking the library.

The comparison finds the exact version a copy was placed from by its fingerprint, so it can tell a
library change from an edit on the copy. If that version is no longer in the library, it can only
compare with the latest one. Differences are then marked `?`, and a plain update is refused for the
same reason.
