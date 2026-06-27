# Timer System — Design Notes

> Status: **design / partially exists.** A basic timer already ships
> (`startTimer` / `stopTimer` / `onTimer`); this doc designs the full,
> extendable subsystem it should grow into. **Design-only — no implementation.**
> Part of the [panel parts backlog](./README.md).

## Why

Timing is a cross-cutting need, not an LCD-only one. Marquee scroll, blink,
cursor, page auto-advance, warm-up fades, debounced value commits, scheduled
SysEx / display refresh throttling, arpeggiator/sequencer timing, and animation
drivers all want a dependable timer. A small primitive exists; this promotes it
to a reusable **part** that any component or script can lean on.

## What already exists (baseline — don't rebuild)

From `scripting/scriptCommandRegistry.js`, `scripting/panelApi.js`,
`scripting/scriptEmitters.js`, `scripting/scriptRuntime.js`:

- `startTimer(id, ms)` — start a named timer (category "Timers";
  scopes: component / panel / project; portable + exportSafe).
- `stopTimer(id)` — stop a named timer.
- `onTimer` event with `info.id` — fires when a timer elapses.
- The `Animations` section — declarative, property-level motion (separate path).

**Known gaps in the baseline:**
- One-shot vs repeating is unconfirmed (args are only `id` + `ms`; no `repeat`).
  The visible runtime is the preview/trace simulator, not the live engine —
  verify against C++.
- No musical / tempo timing — wall-clock milliseconds only; no tempo / BPM /
  MIDI-clock (24 PPQN) primitive anywhere.

## Goals

- One coherent, **scriptable + property-configurable** timing subsystem.
- Backward compatible: existing `startTimer(id, ms)` + `onTimer` keep working;
  everything new is additive (options object / new commands).
- Usable declaratively (a Timer part with properties) **and** imperatively
  (script commands).
- Cover both **wall-clock** and **musical/tempo** timing.

## Concepts / classes

### Timer instance
- `id` / `name` — stable key (multiple concurrent timers).
- `mode` — `oneShot` | `repeating` | `countdown` | `stopwatch`.
- `interval` (ms) — period or delay.
- `repeat` — `0`/`false` (none), `n` (count), or `infinite`.
- `autostart` — start with the panel / on a state.
- `runInPreview` — fire while editing (mirrors `Scripts.runInPreview`).
- Runtime state — `idle` | `running` | `paused` | `elapsed`; plus `elapsed` /
  `remaining` / `count` (how many times fired).

### Timer modes
- **One-shot** — fire once after `interval` (debounce / timeout).
- **Repeating / interval** — fire every `interval`, optional max `repeat`.
- **Countdown** — from N→0, emits ticks + a final `done`.
- **Stopwatch** — count up; queried for elapsed (no auto-fire).

### Clock source (the tempo gap — likely its own part)
A timer needs a clock. Abstract the source:
- **Internal** — free-running wall-clock ms (today's behavior).
- **Tempo** — BPM-based; fire on musical divisions (1/4, 1/8, 1/16, dotted,
  triplets), bars, beats.
- **MIDI clock** — sync to incoming `0xF8` pulses (24 PPQN), with start/stop/
  continue.
- **Host transport** — follow DAW play/stop/position (where available).

Tempo & MIDI-clock sources require engine (C++) support — they can't be faked
purely in script. See the Clock source entry in the [backlog](./README.md).

## Scripting API (extend, don't replace)

Existing (keep):
- `startTimer(id, ms)`, `stopTimer(id)`, event `onTimer`.

Proposed additions (additive):
- `startTimer(id, { ms, mode, repeat, clock, division, autostart })` — options
  form alongside the legacy `(id, ms)` form.
- `pauseTimer(id)` / `resumeTimer(id)` / `restartTimer(id)` / `resetTimer(id)`.
- `setTimerInterval(id, ms)` — retune a running timer.
- Queries: `isTimerRunning(id)`, `getTimerElapsed(id)`, `getTimerRemaining(id)`,
  `getTimerCount(id)`.
- Richer event payload: `onTimer` → `info.id`, `info.count`, `info.elapsed`,
  `info.remaining`.
- New events: `onTimerDone` (countdown / final repeat); for tempo clocks
  `onClock` / `onBeat` / `onBar` / `onDivision`.

## Declarative form (a Timer "part")

A panel part you add and configure without scripting:
- Properties: `name`, `mode`, `interval`, `repeat`, `autostart`, `clockSource`,
  `division`, `runInPreview`.
- Emits an event other parts can route to (ties into the panel routing layer,
  `utils/panelCustomComponentLinks.js`) — e.g. a Timer drives an LCD's
  `scrollOffset` or `pageIndex` directly via a link, no script needed.

## Semantics to nail down

- **Scheduling discipline** — fixed-rate (compensate for drift) vs fixed-delay.
  Animations / MIDI want low jitter; pick fixed-rate with drift compensation and
  document the guarantee.
- **Resolution & limits** — minimum interval, max concurrent timers, behavior
  under load (coalesce missed fires?).
- **Lifecycle** — what happens on panel state change, preview↔runtime, panel
  close, and export. Timer *definitions* serialize; *runtime* state does not.
- **Preview vs live parity** — the trace simulator (`scriptRuntime.js`) and the
  live engine must agree on fire timing and repeat semantics.

## Integration points

- **LCD display** (`lcd-display-component.md`) — scroll / blink / cursor / page
  auto-advance / warm-up fade.
- **Animations section** — could use the timer as its tick driver.
- **MIDI** — sequencing, arpeggiator timing, throttled display refresh,
  debounced sends.
- **Value commits** — debounce / throttle rapid changes.

## Open questions / parking lot

- Confirm/define repeat semantics in the live engine; add an explicit `repeat`.
- Where does the clock source live (engine-provided tempo / MIDI clock)? Spin
  out a dedicated Clock source doc?
- Should the declarative Timer be its own `controlType` or a section other parts
  embed?
- Accuracy guarantees / jitter budget for tempo-synced motion.

## Add your ideas below
<!-- New timer ideas go here; promote into the sections above once fleshed out. -->
