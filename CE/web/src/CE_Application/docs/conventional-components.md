# Conventional Components — Mini-Specs

> Status: **specs.** Additional placeable components, each its **own palette
> entry / `controlType`** reusing an existing engine (per
> [ready-made-vs-custom.md](./ready-made-vs-custom.md)). Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

Common touchpoints (from the Knob/Listbox traces): `models/componentTypes.js`
(type entry), `models/interactionDefaults.js` (behavior/parts branch),
`models/componentPorts.js` (ports), `layout/IconPanel.svelte` (palette button),
and sometimes `editor/PanelPreviewSurface.svelte` (interaction).

---

## 1. Ribbon / Touch-strip

**Full design → [ribbon-component.md](./ribbon-component.md).** In brief: a thin
1D touch-to-position controller (absolute, no handle, optional spring-return),
reusing the slider engine. New work: absolute-jump-on-press (reuses the existing
pointer→value math) + a spring **return mode** (genuinely new — no return exists
in the slider engine). Own `controlType`; `value` port (+ optional `touch`
gate).

## 2. Vector Joystick (4-corner morph)

**Full design → [vector-joystick-component.md](./vector-joystick-component.md).**
In brief: a 2D pad whose position → **4 corner blend weights** (vector synthesis),
reusing the XY-pad engine + the Ribbon's return behavior. New: corner-weight math
(bilinear/radial) + spring-return + 4 fan-out outputs. Flagship use: **assign a
patch snapshot to each corner → morph the whole device state** (Snapshot-Morph).

## 3. Drum / Performance Pad Grid

**Full design → [pad-grid-component.md](./pad-grid-component.md).** In brief: a
**versatile** grid of pads (rows×cols) reusing the generator-grid engine +
note-emit substrate. Pad modes: **drum** (note+velocity), **melodic/scale-locked**
(shared key/scale, isomorphic layouts), **trigger** (CC/PC/SysEx/action). Plus
velocity modes, choke groups, banks, and **pad-LED feedback**. Separate component
from the Mod matrix / Step sequencer (same engine, different kinds). Touches all
three enablers: note-emit · fan-out binding · read-only display.

## 4. Crossfader

**Full design → [crossfader-component.md](./crossfader-component.md).** In brief:
an A↔B blend fader (bipolar slider engine) with crossfade curves (linear/
constant-power/sharp), center detent, optional N-way, and a **morph mode**
(snapshot A↔B). The **1D sibling of the Vector Joystick**; both share a
position→weights→targets blend/morph capability. New: blend math + inverse
**fan-out** A/B binding.

## 5. Chord / Scale Trigger Pad

- **Already specified** as a form of the chord generator — see
  [chord-generator.md](./chord-generator.md) (form 1: "chord pad"). It's its own
  palette entry in the generative-MIDI family; not duplicated here.

---

## Recurring theme

Vector joystick, crossfader, and the pad grid all lean on the two cross-cutting
enablers already flagged (see [component-gaps.md](./component-gaps.md)):
**fan-out (multi-target) binding** and the **note-emit substrate**. Building
those unlocks this set too — same conclusion as the synth-tier and groundbreaking
investigations.
