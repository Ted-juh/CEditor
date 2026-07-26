# Link Mapper / Router — Component Design

> Status: **design.** A placeable component that authors **fan-out binding**
> (one source → many targets, with per-link transforms) — a UI face for the
> routing engine, beside the properties panel. Part of the
> [panel parts backlog](./README.md).

## Context — three tiers of one routing engine

Linking already exists in two forms; this adds the missing middle:

1. **Properties-panel link** — per-component, simple (exists).
2. **Link Mapper component** — *this doc*: placeable, **many links** with range /
   scale / invert / offset / curve, optionally live-rideable.
3. **Modulation node-graph** — the full visual canvas (see
   [groundbreaking-components.md](./groundbreaking-components.md)).

All three sit on the same engine: `utils/panelCustomComponentLinks.js`
(`listPanelCustomApiEndpoints`, `createPanelCustomRouteLink`,
`convertPanelRouteValue`, `applyPanelCustomLinkRoutes`) +
`ExternalAPI.addressableName` for stable target names. The Mapper is the
**fan-out binding capability made tangible** — it doesn't replace the underlying
capability work, it's a UI/authoring surface on top.

## What

A component that holds a set of **routes**. Each route:

- **source → target** (one component/parameter to another),
- **input range** (the source domain that maps),
- **output range** (min/max the target sweeps),
- **depth / scale** (amount — **negative = inverted/“positive-negative
  alterations”**),
- **offset**,
- **curve** (linear / exp / log / S — reuses the breakpoint-curve engine),
- **enabled**, optional **condition** (gate the route on another value).

Topologies: **one source → many targets** (fan-out / macro), **many sources → one
target** (fan-in / sum), or a full mesh.

## Forms (one component, in-category presets)

- **Invisible logic node** — no visual; just holds routes, configured in its
  properties. A reusable "patch-cord bundle" you drop once.
- **Visible mixer strip** — each route as a row: depth slider + invert toggle +
  range; ride the amounts live.

(The full visual cable canvas is the separate node-graph component.)

## How

- Reuse the routing engine for endpoint discovery, type compatibility, and value
  conversion; **extend the route model** (and `convertPanelRouteValue`) with
  per-link **depth / invert / offset / curve** and multi-link management.
- Evaluate on source change: for each enabled route, map source → output via
  range + curve + depth(±) + offset, write to the target (fan-out). Sum when
  multiple sources hit one target (fan-in).
- Shares math with the **blend/morph** capability (position→weights→targets) and
  the **breakpoint-curve** engine (per-link curve).

## Where (integration)

- **controlType:** `LinkMapper` (or `Router`); palette entry (logic/utility group).
- **Files:** `models/componentTypes.js` (LinkMapper), `models/componentPorts.js`
  (a `source` input + dynamic target routing), `utils/panelCustomComponentLinks.js`
  (extend route model + conversion with depth/invert/offset/curve),
  `layout/IconPanel.svelte`, a route-list editor section.
- **Reuses:** routing layer · ExternalAPI addressable names · breakpoint-curve.

## When

- Use when you want **reusable, visible, or complex** routing beyond a single
  property-panel binding: multiple targets, inversion, scaling, curves,
  live-rideable depths.
- **It is the Macro control's brain:** a *Macro knob* = a Knob feeding a Mapper
  (one source → many params with curves). Build the Mapper and Macro is cheap.
- Target-aware: targets can be panel components or device parameters (the routes
  ultimately drive params → MIDI out).

## Properties (editor)

route list (add/remove) · per-route source/target · input/output range · depth(±)
· offset · curve · enabled · condition · form (invisible/mixer).

## Verification

1. Insert a Mapper; add a route source→target → moving the source drives the
   target through the mapped range.
2. Negative depth inverts; curve shapes the response; offset shifts.
3. One source → 3 targets (fan-out) updates all three.
4. Mixer form: ride each route's depth live.
5. A Knob → Mapper (3 routes) = a working macro.

## Open questions / future

- Route storage: on the Mapper, or a shared panel route store the node-graph also
  reads? (Ideally one model, three editors.)
- Conditions/logic depth (simple gate vs expressions — scripting overlaps).
- Relationship to the node-graph (same route model, visual editor).
