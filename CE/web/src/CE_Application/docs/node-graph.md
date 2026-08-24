# Modulation Node-Graph — Component Design

> Status: **design.** The visual/third tier of routing — a patch-cord canvas.
> Part of the [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What

A visual canvas of **nodes** wired with **cables**: **sources** (LFO, envelope,
macro, MIDI-in, snapshot morph) → **destinations** (any parameter / component
input), each cable with **depth** and optional curve. The modular paradigm as a
panel object. The third authoring tier of routing, after the properties-panel
link and the [Link Mapper](./link-mapper-component.md).

## How

- **Same route model + engine** as the Mapper/properties links
  (`utils/panelCustomComponentLinks.js`) — one model, three editors. A cable *is*
  a route (`source → target`, range/depth/curve).
- **Source nodes** reuse the breakpoint/LFO engine
  ([envelope-curve-editor.md](./envelope-curve-editor.md)) and the generative
  sources.
- **New:** the **canvas UI** — node placement, drag-to-connect cables, live signal
  flow visualization, node palette. This is the biggest UI lift of the tier.

## Where

- A **workspace** or large component; the **route store is shared** with the
  Mapper (edit the same routes visually).
- Reuses: routing engine · `ExternalAPI.addressableName` (node identity) ·
  breakpoint/LFO engine.

## When

- Complex modulation patches where a tabular Mapper is too dense — see the whole
  signal flow at a glance; ideal for modular-style sound design.

## New work

The cable canvas (placement, connection, hit-testing, rendering), node types, and
live-flow viz. The routing/depth/curve math is already the Mapper's.

## Open questions

- Shared route store shape (Mapper + node-graph + properties = one model).
- Node taxonomy (sources/processors/destinations).
- Performance with many nodes/cables (rendering).

---

## Built, 2026-08-23

The canvas view of the Routes tab — the same routes the list view edits, drawn as patch cords. It
was built with the Link Mapper rather than after it, because building them separately is the mistake
the Mapper's own open question was warning about: they are two views of one list, and switching
between them changes nothing but the drawing.

**Nodes are laid out source-left, target-right rather than at the controls' panel positions.** A
canvas that mirrored the layout would put two knobs sitting side by side on top of one another and
draw a cable of no length. Readable beats faithful.

**Cables are cubic with horizontal handles.** A straight line between two rows in the same column
would vanish behind the nodes, and the sag is what makes crossing cables followable. Inverted routes
(negative depth) are drawn in a different colour, disabled ones dashed, and any cable inside a cycle
is highlighted — the loop is refused when drawn, and the ones already in the file are marked rather
than silently dropped.

See [link-mapper-component.md](./link-mapper-component.md) for the route model itself.
