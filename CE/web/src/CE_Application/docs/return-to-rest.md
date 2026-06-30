# Return-to-Rest (Spring-back) — Capability Design

> Status: **design / capability.** A shared behavior that returns a control to a
> rest value on release. Used by several components — factor once. Part of the
> [panel parts backlog](./README.md).

## Why

Expressive hardware behavior: **pitch/mod wheels** (spring to center), **ribbons**
(spring to center/rest), **vector joysticks** (return to center), **spring
faders**. Each [component](./component-gaps.md) was about to reinvent this — make
it one shared `Behavior` capability ("one capability, many components").

## What — the model

Return fields on `Behavior` (shared across the slider/xy families):

- **`returnMode`** — `none` (latch/hold) · `center` · `min` · `max` · `rest`
  (a configured value). 2D controls return to a **center point**.
- **`returnValue`** — the rest value when `returnMode: rest`.
- **`returnTime`** — ms; `0` = instant snap, `>0` = glide.
- **`returnCurve`** — linear / exp / ease.

Trigger: on pointer release (and optionally blur).

## How

- On release, if `returnMode != none`: animate the value from current → rest over
  `returnTime` via the [Timer](./timer-system.md) (`returnCurve` shapes it), or
  snap instantly when `returnTime == 0`.
- **Emit along the glide** (continuous) so the device follows the spring-back;
  rate-limit/coalesce if needed.
- Reuse the value model + Timer + the runtime emit path. No new engine.

## Where (integration)

- **`Behavior`** (`models/sectionDefaults.js`) — add `returnMode` / `returnValue`
  / `returnTime` / `returnCurve` (benefits any slider/xy-family control).
- **Interaction/preview** (`editor/PanelPreviewSurface.svelte`) — release handler
  starts the return; Timer drives the glide.

## Consumers

Ribbon ([ribbon-component.md](./ribbon-component.md)) · Vector Joystick
([vector-joystick-component.md](./vector-joystick-component.md)) · Pitch/Mod wheel
· optional spring Crossfader/Slider.

## When / semantics

- Use for momentary/expressive controls that snap back (pitch bend); `none` for
  set-and-hold controls.
- 1D returns to a value; 2D returns to a point.
- Interacts with `snapToStep` (snap the rest value too).

## Open questions / future

- Curve set (linear/exp/ease — enough?).
- 2D return path (straight to center vs per-axis).
- Emit cadence during glide (coalesce + rate-limit).
