# Ready-made Components vs the Custom Component Creator

> Status: **principle + findings.** When to ship a first-class "set" component vs
> letting users build it in the custom creator. Part of the
> [panel parts backlog](./README.md).

## The principle

The custom component creator is **maximally flexible** but has a steep floor
(behaviors, hit zones, value channels, generators, links, parts). A **set
(ready-made)** component trades flexibility for:

1. **Instant use** — one click, working, no meta-system to learn.
2. **Correct defaults** — channels/ports pre-wired, sensible interaction, labels,
   states baked in.
3. **Discoverability** — it's in the palette; users know it exists.
4. **Consistency + central upgrades** — every instance follows conventions and
   improves when the component improves; custom builds are frozen copies.

The 90/10 split: set component for the common case, custom creator as the escape
hatch for the bespoke 10%. This is the "ready-made but flexible" goal.

**Cheap path:** when the primitives already exist, ship a set component as a
**library preset authored in the custom creator** (`customComponentLibrary`) —
ready-made + still-tweakable + centrally upgradeable, with no new engine.

## Findings: XY Pad vs ADSR (two different cases)

### XY Pad — primitives already exist → ship as a library preset
The custom creator already has first-class XY support:
- behavior `type: 'xy-pad'` / `role: 'xy-pad'`, `geometry: 'xy'` (and `'grid'`),
- a ready `xyPad` behavior module (`utils/customComponentFactory.js`),
- an `xy` hit-zone geometry (dual-axis "face").

So a "set XY Pad" needs **no new engine** — author one good XY pad in the custom
creator, save it to the library, and ship it as a palette default. Benefit over
the raw custom route: speed, correct X/Y ports out of the box, discoverability,
central upgrades.

### ADSR / Envelope — genuinely missing (not a wrapper)
There is **no envelope editor anywhere**. The `breakpoint` references are
*debugger* breakpoints in `BehaviorDesigner` ("run until…"); the `envelope`
references are the *package export envelope* (`createCustomComponentExportEnvelope`).
The custom creator cannot easily express a draggable breakpoint envelope today.

So a set ADSR is **new capability** (draggable nodes, segment curves, time/level
math + per-segment value channels), not packaging of something that exists. It
sits a tier up in effort.

## Implications for the backlog

- **XY Pad** → re-tag from `[new]` to `[ready-made]`: build it as a library
  preset over the existing xy-pad primitives (cheap).
- **ADSR / Envelope** → stays `[new]`/genuinely-missing: needs a real envelope
  editor; not derivable from current primitives.

## Notes

- General rule for the `component-gaps.md` survey: before speccing a "set"
  component, check whether the custom creator already has the primitives. If yes,
  a library preset is the cheap win; if no, it's real new capability.
