# Blend / Morph (position → weights → targets) — Capability Note

> Status: **design / capability (mostly covered).** The shared math behind several
> controls. Part of the [panel parts backlog](./README.md).

## What

Turn a control **position** into a set of **weights** that distribute across
**targets** (params or snapshots). The common core of:

- **Crossfader** — 1D, 2 ends ([crossfader-component.md](./crossfader-component.md)).
- **Vector Joystick** — 2D, 4 corners
  ([vector-joystick-component.md](./vector-joystick-component.md)).
- **Macro** — 1 source, N targets (via the Mapper).

## Already covered by two existing pieces

This capability is **mostly the composition of two already-designed things**, so
it likely needs no separate engine:

- **Weighting math** = `position → weights` (bilinear / radial / curve) — lives in
  the components, sharing a small helper.
- **Distribution** = weights → targets — that's the **Link Mapper / fan-out
  binding** ([link-mapper-component.md](./link-mapper-component.md)).
- **When targets are full states** = **Snapshots & Morph**
  ([snapshots-morph.md](./snapshots-morph.md)).

## Recommendation

Don't build a separate "blend" subsystem. Factor a tiny shared
**`position → weights`** helper (curves: linear / constant-power / bilinear /
radial), and let the **Mapper** (params) and **Snapshots** (states) do the
distribution. The crossfader and vector joystick then differ only in their
weight function (1D-2pt vs 2D-4pt).

## Open questions

- Where the weight helper lives (a util shared by crossfader/vector/macro).
- Curve set (linear / constant-power / custom).
