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

---

## Built, 2026-08-23

`utils/routeModel.js`, `utils/routeAdapters.js`, `stores/routes.js` and the Routes tab, pinned by
`test/routeModel.test.js`.

**The open question answered itself: one model, and the components are read rather than copied.**
The note asked whether routes live on the Mapper or in a shared store. Neither, quite — they live on
the DOCUMENT, and the two things that already fan a value out to several destinations with a depth
and a curve, the Macro's `slots` and the Router's `destinations`, are *read as routes* by
`routeAdapters.js`. A third store would have left a Macro's assignments invisible to the node-graph,
which is exactly the failure the question was about. The canvas draws a Macro's four assignments as
four cables and nothing had to be migrated to make that true. A derived route carries where its real
record lives, so an editor offers to edit it in place instead of writing a stale copy.

**Fan-in needed a decision the note glossed.** "Sum when multiple sources hit one target" is right,
but summing *absolute* values is not what summing means here: two routes each mapping to half a
target's range would together reach the top of it, so adding a second modulator would slam a
parameter both sources are only nudging. So `mode` is part of a route. `add` contributes a signed
offset around the target's own value — a mod matrix row. `set` replaces it — a macro, where the knob
*is* the value. Where both reach one target the `set` is the base and the `add` routes sum on top,
because a macro that sets a parameter and a wheel that nudges it is the normal case and the nudge
belongs above.

**But the DEFAULT was wrong, and is `add` now (2026-08-24).** Having both modes was right; starting
a new route on `set` was not. The note said sum, a route drawn by hand on a canvas is a modulation
far more often than a replacement, and a matrix whose rows replace each other by default is not a
matrix. Nothing saved moves: `makeRoute` writes a complete record, so every route in every panel
file already carries an explicit mode. The Macro and Router adapters still say `set` for themselves,
because a macro knob really *is* the value.

**Two `set` routes onto one target now warn.** Last-wins is deterministic and it is also silent —
two macros wired to one cutoff means one of them is a knob that turns while nothing moves.
`contestedTargets` names them and the Mapper marks the rows, dimmer than the loop mark and in a
different colour, because a shadowed route is inert rather than broken. Not refused: a converter or
an older file can hold this and should still load.

**Cycle detection is not in the note and is what would have taken the feature down.** Fan-out plus a
canvas makes a loop trivially easy to draw — A modulates B, B modulates A, or a longer ring nobody
can see at once — and the runtime would chase it forever. `routeCycles` finds them, `wouldCycle`
answers before the cable is drawn, and a cycle is reported from where the ring *closes* rather than
from where the walk began, so the author is sent to a wire that is actually part of it. A fan-out
that reconverges is not a cycle, which is the obvious false positive and is pinned.

**And the refusal is only half of it, 2026-08-24.** `wouldCycle` guards one door — the editor's. A
panel file can carry a ring that door never saw: hand-edited, written by an older build, produced by
a converter. `routeCycleWarnings` shows an author that ring and does not stop the runtime walking
it. So `settleRoutes` holds the loop now, capped at `ROUTE_PASS_LIMIT`, and hands back the rings it
found instead of a bare failure.

The cap paid for itself on something unrelated to loops. `evaluateRoutes` reads every source once,
so one pass moves a chain by one link: A→B→C left C reading B's *old* value, and the far end caught
up only when something happened to re-trigger. Settling means one source change produces one settled
panel rather than a result that depends on how many times it fired.

**The Router's transfer curve is declared, not flattened.** Its curve is a breakpoint list with
per-segment shapes; a route's single `curve` name cannot express that, so the derived route says
`linear` and carries `shapedBySource: true`. Calling it "exp" would be a lie the canvas then draws
confidently.

**An inverted input window is a feature.** `inputMin: 127, inputMax: 0` reverses the source, which
people set up deliberately, so nothing validates it away.
