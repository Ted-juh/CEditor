# Moving, resizing and checking components at every size

Two parts of the editor that were reworked together: how the panel canvas snaps while you drag, and
a sheet that shows a custom component's every state at several sizes.

## Snapping on the panel canvas

Hold **Ctrl** (**Cmd** on a Mac) while dragging to turn snapping off, as before. What changed is
what snaps.

- **Resizing snaps the edge you are dragging, and nothing else.** Drag a right edge up to a
  neighbour and the box widens to meet it; the left edge stays where it was. Previously a resize
  could shove the whole box sideways, or snap the edge you weren't holding.
- **Rotated controls snap by what you see.** A control rotated 90° lines up by its visible edges,
  and so do rotated neighbours, instead of by an unrotated box nobody can see.
- **Aspect lock holds on every handle.** With *Transform › Aspect Lock* on, the side handles keep
  the ratio too, growing the other side about its centre. When a resize with the aspect locked
  snaps, one side meets the guide and the other follows the ratio.
- **Group resize respects each member's rotation.** Widening a selection that contains a bar
  rotated 90° thickens the bar rather than lengthening it. A member at an angle other than a
  multiple of 90° is scaled evenly, so it keeps its shape, with its centre kept in place relative
  to the group.

The panel's centre and edges are snap targets as well as other controls and ruler guides. When two
are equally close, the panel's own lines win.

## States × sizes

In the Component Designer, the **States** strip along the bottom has a **Sizes…** button. It opens
a sheet with one row per state (Base first) and one column per size:

| Column | Size |
|---|---|
| Current | The size the component is now |
| Half | Half of it both ways |
| Double | Twice it both ways |
| Wide | Twice as wide, same height |
| Tall | Same width, twice as tall |

**Why sizes matter.** A component's parts are laid out against the size it is placed at, not
scaled from the size it was drawn at. Parts sized in percent follow the box; parts sized in pixels
keep their size. So a component that looks right on the artboard can break when somebody places
it smaller, or stretches it. (A component whose *Transform › Resize* is set to *Scale internals*
scales its pixel sizes too, and the sheet draws it that way.)

Each cell is drawn by the renderer the panel uses, with that state's changes applied, at the
preview's test value. The dashed line is the component's edge. Anything drawn past it is shown,
not clipped, so you can see what spills.

**What it warns about**, under the cell and in the count at the top:

- *spills outside the component*: a part that fits at the current size and hangs out at this one.
- *now overlaps*: two parts that are apart at the current size and collide at this one, typically
  one anchored to each side of a box that got narrower.
- *has no size left*: a part that shrank to nothing.

Only changes are reported. A part that already hangs out at the current size, or two parts that
already overlap there, were drawn that way on purpose. Each state is compared with itself at the
current size, so a state that moves a part deliberately is not flagged for it. Parts that are
rotated or scaled are not checked, because their drawn box is not their layout box. They are still
drawn.

Click any cell to close the sheet and edit that state.

**Variants.** If the component has variants, the sheet has a **Variant** picker. It opens on the
variant the component is showing, and redraws every cell in the one you pick, with each state on
top of it, as a placed copy would draw it.

## Variants

A variant is a named look for a component, such as Compact, Dark or Light. It is defined in the
Component Designer under **Publish › Variants**, and each placed copy picks one on its
**Properties** tab (a script or the published `variant` property can pick one too). The variant is
the copy's base look: bindings and states still act on top of it.

A variant can change the component's **parts** (colours, visibility, size and position within the
component, text styling) and the root's **Background**, **Text**, **Effects** and **Image**. It
cannot change how the component **behaves** (hit zones, value channels, bindings, links, states), because
clicks are tested against the component's own hit zones and a variant that moved one would draw in
one place and respond in another. It cannot change the copy's **Transform** either, because the
copy's size and position belong to whoever placed it. The Variants tab marks an override it will
not apply, and one that names a path the component does not have, and says why.

The artboard always shows the base you are editing, so an edit is never hidden under a variant.
To see a variant, pick it on a placed copy, or in the States × sizes sheet.
