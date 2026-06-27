# Timer System — Design Notes

> Status: **design / partially exists.** A basic timer already ships
> (`startTimer` / `stopTimer` / `onTimer`); this doc designs the full,
> extendable subsystem it should grow into. **Design-only — no implementation.**
> Part of the [panel parts backlog](./README.md).

## Decision: no custom timer *class*

Use JUCE's `juce::Timer` as the underlying primitive (it's already the house
pattern — `DeviceProfileService` runs `startTimerHz(60)`, the Player
`PluginProcessor` `startTimerHz(30)`, etc.). Do **not** reimplement a low-level
timer. What we add is a thin **`TimerManager`** on top that delivers the
named-timer feature the panel/scripting layer wants.

Out of scope for this system: tempo / MIDI-clock sync and sample-accurate MIDI
timing. Those are not timer concerns and live elsewhere (the MIDI/audio path).

## Why

Timing is a cross-cutting UI need, not an LCD-only one. Marquee scroll, blink,
cursor, page auto-advance, warm-up fades, and debounced value commits all want a
dependable timer. A small primitive exists; this promotes it to a reusable part
any component or script can lean on.

## What already exists (baseline — don't rebuild)

From `scripting/scriptCommandRegistry.js`, `scripting/panelApi.js`,
`scripting/scriptEmitters.js`, `scripting/scriptRuntime.js`:

- `startTimer(id, ms)` — start a named timer (category "Timers";
  scopes: component / panel / project; portable + exportSafe).
- `stopTimer(id)` — stop a named timer.
- `onTimer` event with `info.id` — fires when a timer elapses.
- The `Animations` section — declarative, property-level motion (separate path).

**Note:** these script commands appear to have **no live C++ backing** yet —
they exist in the JS preview simulator (`scriptRuntime.js`) and the code
exporters (`scriptEmitters.js`), but `CE/src/Scripting/*` has no timer wiring.
The `TimerManager` is what makes them real. One-shot vs repeating is therefore
unconfirmed — define it explicitly (add a `repeat` arg).

## Goals

- One coherent, **scriptable + property-configurable** timing subsystem.
- Backward compatible: existing `startTimer(id, ms)` + `onTimer` keep working;
  everything new is additive (options object / new commands).
- Usable declaratively (a Timer part with properties) **and** imperatively
  (script commands).

## TimerManager (the thing we build)

A small manager on the **message thread**, multiplexing many logical timers onto
one heartbeat. **Proposed default:** drive it with a single plain `juce::Timer`;
reserve `VBlankAttachment` only for parts that genuinely need frame-synced
animation (e.g. smooth LCD scroll), rather than as the global heartbeat. Message-thread callbacks can touch the `ValueTree` /
`ValueTreeBridge` / WebView directly — no locking — which is exactly what
scroll / blink / page-advance need.

### Timer instance
- `id` / `name` — stable key (multiple concurrent timers).
- `mode` — `oneShot` | `repeating` | `countdown` | `stopwatch`.
- `interval` (ms) — period or delay.
- `repeat` — `0`/`false` (none), `n` (count), or `infinite`.
- `autostart` — start with the panel / on a state.
- `runInPreview` — fire while editing (mirrors `Scripts.runInPreview`).
- Runtime state — `idle` | `running` | `paused` | `elapsed`; plus `elapsed` /
  `remaining` / `count`.

### Timer modes
- **One-shot** — fire once after `interval` (debounce / timeout).
- **Repeating / interval** — fire every `interval`, optional max `repeat`.
- **Countdown** — from N→0, emits ticks + a final `done`.
- **Stopwatch** — count up; queried for elapsed (no auto-fire).

## Scripting API (extend, don't replace)

Existing (keep): `startTimer(id, ms)`, `stopTimer(id)`, event `onTimer`.

Proposed additions (additive):
- `startTimer(id, { ms, mode, repeat, autostart })` — options form alongside the
  legacy `(id, ms)` form.
- `pauseTimer(id)` / `resumeTimer(id)` / `restartTimer(id)` / `resetTimer(id)`.
- `setTimerInterval(id, ms)` — retune a running timer.
- Queries: `isTimerRunning(id)`, `getTimerElapsed(id)`, `getTimerRemaining(id)`,
  `getTimerCount(id)`.
- Richer payload: `onTimer` → `info.id`, `info.count`, `info.elapsed`,
  `info.remaining`; plus `onTimerDone` (countdown / final repeat).

## Declarative form (a Timer "part")

**Proposed default:** implement the declarative Timer as a **section** (not its
own `controlType`). It's lighter than a full control and composes into any part
that needs its own timing, rather than forcing a separate component on the
canvas. Revisit only if a standalone, canvas-placed timer turns out to be
needed.

A panel part you add and configure without scripting:
- Properties: `name`, `mode`, `interval`, `repeat`, `autostart`, `runInPreview`.
- Emits an event other parts can route to (ties into the panel routing layer,
  `utils/panelCustomComponentLinks.js`) — e.g. a Timer drives an LCD's
  `scrollOffset` or `pageIndex` directly via a link, no script needed.

## Semantics to nail down

- **Scheduling discipline** — fixed-rate (compensate for drift) vs fixed-delay.
  Pick fixed-rate with drift compensation and document the guarantee.
- **Resolution & limits** — minimum interval, max concurrent timers, behavior
  under load (coalesce missed fires?).
- **Lifecycle** — what happens on panel state change, preview↔runtime, panel
  close, and export. Timer *definitions* serialize; *runtime* state does not.
- **Preview vs live parity** — the trace simulator (`scriptRuntime.js`) and the
  `TimerManager` must agree on fire timing and repeat semantics.

## Integration points

- **LCD display** (`lcd-display-component.md`) — scroll / blink / cursor / page
  auto-advance / warm-up fade.
- **Animations section** — could use the timer as its tick driver.
- **Value commits** — debounce / throttle rapid changes.

## Open questions / parking lot

- Confirm / define repeat semantics; add an explicit `repeat` arg. *(still open)*
- ~~Declarative Timer as its own `controlType` vs a section~~ → **default: section**
  (see Declarative form).
- ~~`juce::Timer` heartbeat vs `VBlankAttachment`~~ → **default: plain
  `juce::Timer`**, `VBlankAttachment` reserved for frame-synced animation parts
  (see TimerManager).
- Lifecycle/serialization edge cases (panel close, state change, preview↔runtime
  parity). *(still open)*

## Add your ideas below
<!-- New timer ideas go here; promote into the sections above once fleshed out. -->
