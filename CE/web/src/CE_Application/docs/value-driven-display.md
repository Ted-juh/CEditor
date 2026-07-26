# Value-driven Display / Read-only Mode — Capability Design

> Status: **design / capability.** Make a control *show* an inbound value instead
> of being user-driven. A foundation several components consume. Part of the
> [panel parts backlog](./README.md).

## Why

Unlocks the output/feedback half of the catalog:

- **Meter / bargraph** (read-only slider showing a level),
- **LCD bound fields** (show patch name / parameter value),
- **Pad-grid LEDs** (cells light from incoming notes),
- **progress bars, status indicators, value readouts**.

All "reflect a device value visually" — no audio.

## What — it's the feedback direction of binding

A control's visible state is driven by an **inbound value** (from a device
parameter / input port / bound source) rather than user interaction. Two facets:

1. **Read-only / non-interactive** — input disabled (no drag/click changes value);
   the control only reflects the bound value.
2. **Value-driven visuals** — the value maps to fill / position / lit cells /
   text / color.

Reframe: this is the **feedback** side of binding (device→control). A *normal*
control is two-way (feedback reflects the device **and** user input drives it); a
**display** uses feedback only (input off). So the capability = robust feedback
binding + a read-only toggle.

## How

- **Value-driven visuals largely exist:** the `Bindings` section already does
  "value-driven mappings into root or part properties" (e.g. value →
  `bodyTrackFill.width`), and `componentPorts` models **feedback** ports
  (`defaultBindingMode: 'feedback'`, `direction: 'output'`). Reuse these.
- **New work:**
  1. **Read-only mode** — a `Behavior` flag (`readOnly` / `role: 'display'`) that
     turns off `Mouse.interceptClicks` / `draggable` / `focusable`, and sources
     the value from an **inbound** binding instead of user input.
  2. **Inbound feedback wiring** — the value must arrive from the device:
     `onParameterReceived` / port feedback. This is currently **unwired in the
     live runtime** (see [scripting-runtime-gaps.md](./scripting-runtime-gaps.md))
     — the dependency to close.
  3. **New value→visual maps** for display-only visuals not yet covered (lit grid
     cells, segment/LED states, text from a value).

## Where (integration)

- **`Behavior`** — `readOnly` flag (+ `role: 'display'`).
- **`Mouse`** — interception/focus/drag off in read-only mode.
- **Ports** — bind the value port in **feedback/input** direction (device→control).
- **`Bindings`** — value→property maps (reuse) + new display maps.
- **Dependency:** inbound event dispatch (`onParameterReceived`) wired in the C++
  runtime.

## Consumers

Meter (read-only slider) · LCD bound fields · Pad-grid LEDs (per-cell value→lit) ·
progress bar · status indicators.

## When / semantics

- **Input vs display vs two-way:** a control can be input-only, display-only
  (read-only), or **two-way** (reflects device + accepts input). Display mode is
  the feedback-only case.
- Per the separate-components principle, **Meter is its own component** that *uses*
  this mode; the capability is shared, not a Meter-only feature.
- Feedback must be **rate-limited/coalesced** for high-rate inbound values (same
  concern as morph) so the UI doesn't thrash.

## Open questions / future

- Where the read-only flag lives (Behavior `readOnly` vs `role: 'display'`).
- Wiring `onParameterReceived` is the blocking dependency — sequence this with the
  scripting-runtime gap fix.
- New display visual maps (lit cells, segment states, text-from-value) — define
  the binding targets.
