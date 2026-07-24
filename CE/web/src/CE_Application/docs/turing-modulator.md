# Turing Modulator — a stepped sequence you lock or let evolve

> Status: **shipped 🟢**. The **algorithmic** member of the clock-driven
> modulation family — after the Orbit (geometric) and the
> [Gesture Looper](./gesture-looper.md) (human). Part of the
> [panel parts backlog](./README.md).

## What it is

A looping **shift-register of stepped values** — the classic modular "Turing
Machine". A single **randomness** knob takes it from a **frozen loop** (0% —
plays the same sequence forever) to **pure chaos** (100% — a new value every
step), with everything in between a slowly *evolving* pattern you can enjoy and,
when it lands somewhere good, freeze. It outputs the current step's **value**, a
**gate**, and the **inverse** — three bindable ports (the fan-out).

Where the Orbit gives you perfect geometric motion and the Looper your own hand,
the Turing gives you **generative surprise you stay in control of**.

## How it works

- **Pure engine** `utils/turingLayout.js` (+ `test/turingLayout.test.js`, 8 tests):
  the register is `length` values 0..1; the clock phase picks the current step;
  `stepOutput` reads it (optionally **quantized** to N levels for musical
  stepped mod); `gateAt` thresholds it. The signature bit — `mutateStep` — is a
  **pure function**: it's handed a die-roll and a candidate value and mutates the
  step only when the roll is below `randomness`. Static `value` / `gate` /
  `inverse` ports + fan-out values. Geometry + column hit-test for editing.
- **`TuringRenderer.svelte`** — step value bars, the live step glowing with a
  column highlight, a gate-dot row, and a "locked ↔ evolve ↔ chaos" hint. Visual
  only.
- **Model** — `Turing` controlType + `Turing` section (`rate`, `length`,
  `randomness`, `quantizeLevels`, `gateThreshold`, the `steps[]` register).
  Static ports registered in `componentPorts`.
- **Self-running clock + mutation** (`PanelPreviewSurface`) — the same lazy rAF
  ticker as the Orbit/Looper advances the phase by `rate / length`; **when the
  step index advances**, the incoming step mutates (`Math.random` supplies the
  roll + new value; the pure `mutateStep` decides). The evolving register lives
  in the session and stays **ephemeral** (generative mutations are never saved —
  it re-seeds from the model on reload). Fan-out is rate-capped via the shared
  `emitClockFanout`. Step bars are **draggable** to seed/edit the sequence
  (committed to the model). Runs live in the exported Player (same surface).
- **`TuringEditor.svelte`** — run / rate / length, a **Randomness slider**
  (locked ↔ chaos), quantize levels, gate threshold, Randomize / Flatten seed
  buttons, and the three output-port chips. Loader, Properties tab and palette
  entry included.

## Compatibility

Works on **any** MIDI synth with a device profile — one bound `value` port is
light traffic. The `gate` port pairs naturally with a boolean/switch parameter;
`quantizeLevels` keeps 7-bit CC targets from zippering by design (values are
already stepped). No input dependency.

## Possible next steps

- **Tempo sync** — lock `rate` to host bars/beats and retrigger on transport.
- **Register length ≠ loop length** — the true Turing Machine trick where the
  pattern length and the read length differ, for phasing sequences.
- **Slew / glide** on the `value` output for a smoothed (non-stepped) variant.
- **Pulse taps** — extra gate outputs derived from step combinations (the
  hardware "pulse expander").
