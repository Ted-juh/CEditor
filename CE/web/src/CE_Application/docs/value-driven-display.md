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

---

## Built, 2026-08-23

`utils/displayMode.js` + `utils/displayMaps.js`, pinned by `test/displayMode.test.js`.

**Three things the design note asked for turned out to be two.** The inbound dependency was already
closed: `PluginProcessor.h` dispatches `onParameterReceived` (verified in
[scripting-runtime-gaps.md](./scripting-runtime-gaps.md)), and in the editor
`followInboundMessage` decodes a live CC against the profile's `inbound` declaration and
`queueDeviceParameterPanelPreviewSync` writes it into the control's session — coalesced per
animation frame, keyed by role and parameter. The rate limiting this note asked for was already
there and had been for a while.

**The flag is `Behavior.valueFlow`, not `role: 'display'`.** The note offered both. `role` already
names the control's kind — `slider`, `knob`, `button` — so `role: 'display'` would leave a display
unable to say *which kind* of display it is. `readOnly: true` is accepted as an older spelling.
There are three values, not two: `input` (sends, is not moved by feedback) falls out for free and is
what a trigger button actually is.

**Pointer events are deliberately NOT turned off**, and the note asked for them. `interceptClicks:
false` is `pointer-events: none`, which also kills hover — so a meter you can hover to read would
lose its tooltip, and clicks would start landing on whatever sits behind it, which is a layout
change nobody asked for. Read-only means "your input does not change the value", not "you cannot
point at it". What it *does* turn off: drag, wheel, keyboard, focus and tab order — and the host
parameter, which is the one that would otherwise have been found last. A DAW automation lane on a
meter records perfectly and moves nothing, because the next feedback frame overwrites every value
it writes.

**The drag guard needed the flow.** `syncDeviceParameterToPanelPreview` skips a control the user is
dragging, so a device echo does not fight the hand on a knob. On a display that guard can only
misfire: a stale `dragging: true` would freeze the meter for the rest of the session. It now asks
`shouldAcceptFeedback(behavior, session)` instead.

**The new maps are the ones where the arithmetic is the feature** — the rest was already covered by
`Bindings`. `litCells` (bar / point / centre), `peakHold` (rises instantly, falls slowly — a marker
that smoothed its rise would defeat its own purpose), `segmentStates` (by choice index, not by
level: a five-way's third position is segment 2, not "40% along"), `textFromValue`, `barGeometry`
and `bandFor`. Every one of them distinguishes **no reading** from **a zero reading**, which is the
trap the whole module is built around: a meter with nothing connected and a meter reading silence
look identical the moment `undefined` coerces to 0.
