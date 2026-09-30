# The Pen: drawing your own shapes in the Component Designer

The Component Designer's shapes (rectangles, ellipses, rings, arcs, lines and the fixed polygons)
cover a lot, but not a shape of your own: a tapered knob pointer, a notch, a bracket, a logo mark.
The **Pen** draws any outline point by point, and the result is an ordinary part. It scales with
its box, takes a fill and a border like any other part, and can be moved, resized, coloured,
animated and bound.

## Drawing

Press **P**, or pick the pen nib at the top of **Lines & Polygons** in the palette.

- **Click** to place each point. A dashed line follows the pointer to show the next segment.
- **Click the first point** (it fills in once there are three) to close the shape. A closed shape
  is **filled**.
- **Press Enter, double-click, or click the last point again** to finish an **open** shape. An open
  shape is a **stroked line**, drawn with the part's border.
- **Shift** keeps the next segment to 45° steps.
- **Backspace** takes back the last point. **Escape** abandons the drawing.

Points snap to the grid when snapping is on; hold **Alt** to place one freely.

## Editing the points

Select a pen shape with the Select tool (**V**) and each point gets a handle.

- **Drag a handle** to move that point. The part's box follows, so it always fits the shape.
- **Alt-click a handle** to remove that point. A closed shape keeps at least three and an open one
  at least two.
- **Double-click the outline** to add a point exactly there.
- **Drag the outline or the inside** to move the whole shape, as with any part.

Every edit is one undo step.

## How it is stored

A pen shape is a part of kind `path`. Its points are kept relative to the part's box, from 0 to 1
across and down, the same way the built-in triangle and star are. That is why it scales with its
box, and why a component set to *Scale internals* scales it with everything else. `meta.closed`
says whether it is filled or stroked. It is drawn by the same part renderer everywhere: the
designer, the panel, the States × sizes sheet and the exported plug-in.

## Combining shapes

Select two or more shapes in the Designer (click one, then **Add to selection** on the others in
the layer list) and the alignment toolbar gains four buttons:

- **Unite** merges them into one outline.
- **Subtract** cuts the front shapes out of the back one — a plate with a hole, a notched pointer, a
  legend knocked out of a badge.
- **Intersect** keeps only where they overlap.
- **Exclude** keeps where they do not overlap.

The result is a **combined shape**: a new layer, with the shapes it is made of listed beneath it in the
layer list. Nothing is deleted. The shape stays live:

- Move, resize or reshape a part inside it (select it in the layer list; it is shown faintly on the
  artboard while selected) and the shape follows. Hide one and it takes no part — hide the hole and
  the plate is whole again. The arrows on a part inside reorder it within the shape.
- Anything that names a part inside still works. A hit zone that follows the hole still follows the
  hole; a binding that slides the hole along with the value slides the cut with it, on the panel and
  in the exported plug-in.
- Drag or resize the shape itself and everything inside it moves and scales with it. Turning it turns
  the whole shape.
- Select the shape and its toolbar switches the operation, or **Release**s it — the parts draw as
  themselves again, exactly as they were — or **Flatten**s it into a single path.

**Paint.** A combined shape paints with the fill, border, effects and opacity of one of its parts: the
back one for Subtract (the one the others are cut from), the front one otherwise, as drawing tools
do. Restyling the shape restyles that part, and a state or binding that recolours that part recolours
the shape. Everything paints on the true outline: gradients, images, textures, overlays, every border
style (dashed, dotted, double, groove, ridge, inset, outset) and shadows follow the shape, not its box.
A border set per side has no sides to go to on an outline, so the thickest side is used; inset and
outset shade the edges that face up and left against those that face down and right.

**What can be combined.** Every shape, and text:

- rectangles with any corner — rounded outward or inward, chamfered, notched, straight, one per
  corner — ellipses, rings, capsules and the polygons;
- Pen shapes, open or closed (an open one, and a line, take part as the band its stroke paints), and
  arcs as the ring segment they draw, with their round or square ends;
- text, as its glyphs in its own font, weight and spacing — and its box too, if the box is painted;
- other combined shapes, and parts a generator made (they are detached from the generator first, as
  **Detach** does, and it leaves them alone from then on).

What cannot: a knob or slider carried as a part, an envelope display and a waveform icon, which are
drawn live by their own renderers and have no fixed outline. Text needs its font's file: the panel
fonts and fonts imported in Settings → Fonts always work; Arial, Times New Roman and Courier New work
everywhere (through Liberation Sans, Serif and Mono, which have the same letter widths); other system
fonts work in the app on Windows, which reads them from the Fonts folder. Where a font cannot be read
the combine is refused with its name, and picking a panel or imported font fixes it.

**Flatten** bakes the shape into one path and removes the parts it was made of. That breaks anything
that names those parts, so Flatten is refused while a hit zone, binding, state, published property or
variant still does — the refusal names them. Keeping the shape live is always the alternative.

## Smooth

Select a pen shape and the point toolbar offers **Smooth**, which replaces the corners with a curve
through the same points. Open shapes stay open.

## Flattened and smoothed shapes are outlines, not points

Both results are stored as an SVG outline (`meta.pathData`, again from 0 to 1 across the part's
box) rather than as points, because a hole or a curve is not a list of corners. They scale, fill,
stroke, animate and bind like any part, paint with every fill and border feature, and render the same
everywhere, but they have **no point handles**: to change the outline, undo and edit the originals —
or, better, keep the shape combined and live.
