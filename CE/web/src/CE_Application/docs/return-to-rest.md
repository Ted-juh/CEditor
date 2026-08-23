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

---

## Built, 2026-08-23

`utils/returnToRest.js` plus four fields on `Behavior` (`returnMode` / `returnValue` / `returnTime`
/ `returnCurve`), pinned by `test/musicalCapabilities.test.js`.

**The glide emits.** That is the part that is not obvious and the reason this is a series of values
over time rather than one write: a spring-back that jumps the on-screen control to centre and tells
the device nothing leaves the synth bent. `returnFrames` states the cadence as a number — at 60fps a
120ms return is about eight values, which a DIN cable can carry and a synth can follow.

**`restValueFor` returns `null`, not `0`, for a control that does not return.** For a fader whose
minimum is zero those are opposite behaviours, and `Number(null)` is 0 — which had a latching
control springing to its floor the first time anybody let go of it, until the test caught it.

**`done` is part of the answer** rather than something the caller re-derives, because a curve can
land on the rest value before its time is up and a caller comparing floats would tick a finished
glide forever.

**A 2D return travels on one progress**, not one per axis, so a joystick's puck moves in a straight
line to the centre. Per-axis timing would make it curve, which looks like a bug in a control whose
whole job is to be a position.

`returnMode` defaults to `none`, so nothing existing started springing because this landed.

## Wired into the preview surface, 2026-08-23

`startValueReturn` in `PanelPreviewSurface.svelte`, driven by the `returnMode` fields on Behavior and
editable in the Behavior inspector's "Return to rest" section.

**The three existing springs stay.** The joystick, the crossfader and the ribbon each already had
one, and each has extras this cannot know about — the joystick's trail and per-axis return, the
ribbon's touch gate, the crossfader's detent. Replacing them would be a regression risk for no
user-visible gain. What landed is the generic one for everything else, so a plain slider or a
pitch/mod wheel can spring without becoming a fourth private implementation.

**Each frame emits.** The glide writes the session and fans out on every tick; only the last one
commits and raises `onSettled`. A spring-back that moved the on-screen control and told the device
nothing would leave the synth bent, which is the whole reason the capability produces a series of
values rather than one.

**A new grab cancels the glide** — the hand on the control wins over the spring — and a release
during a glide restarts it rather than racing a second one against the first.
