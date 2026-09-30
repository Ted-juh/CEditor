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
- **Subtract** cuts the front shapes out of the back one — a plate with a hole, a notched pointer.
- **Intersect** keeps only where they overlap.
- **Exclude** keeps where they do not overlap.

The result is one part, keeping the name, fill, border and bindings of the part that owns it: the
back one for Subtract, the front one otherwise. The other parts are removed. The whole thing is one
undo step.

Rectangles (rounded or not, per-corner radii included), ellipses, rings, capsules, the polygons,
closed pen shapes and earlier combined shapes can be combined, turned and scaled ones included.
Anything else is refused with the reason rather than approximated: text, arcs, open lines, bevelled
or notched corners, a part that is hidden, and the owning part if its fill is a gradient, image or
texture or its border is not solid. So is removing a part that something still points at — a hit
zone, a binding, a state, a published property or a variant — since that would leave the reference
dangling. Shapes that do not overlap give nothing to Intersect, and it says so.

## Smooth

Select a pen shape and the point toolbar offers **Smooth**, which replaces the corners with a curve
through the same points. Open shapes stay open.

## Combined and smoothed shapes are outlines, not points

Both results are stored as an SVG outline (`meta.pathData`, again from 0 to 1 across the part's
box) rather than as points, because a hole or a curve is not a list of corners. They scale, fill,
stroke, animate and bind like any part, and render the same everywhere, but they have **no point
handles**: to change the outline, undo and edit the originals.
