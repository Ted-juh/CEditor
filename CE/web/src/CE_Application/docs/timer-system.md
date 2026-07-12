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
The `TimerManager` is what makes them real. Because there is no legacy live
behavior to preserve, we are free to *define* the semantics outright — see
**Repeat & scheduling semantics** and **Lifecycle & serialization** below. The
preview sim and the `TimerManager` implement that same spec.

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

## Repeat & scheduling semantics (spec)

- **Bare `startTimer(id, ms)` repeats** (mode `repeating`, infinite). This
  matches the house mental model (existing `startTimerHz` heartbeats) and the
  common panel uses (scroll / blink / refresh). One-shot is the explicit case.
- **`repeat`** = max number of fires for `repeating`: `0` / omitted = infinite;
  `n` = fire `n` times, then stop and emit `onTimerDone`. `repeat: 1` is
  equivalent to `mode: 'oneShot'`.
- **`mode` summary:**
  - `oneShot` — fire once after `ms`, emit `onTimer` then `onTimerDone`, stop.
  - `repeating` — fire every `ms`; honor `repeat`; `onTimerDone` after the last.
  - `countdown` — tick every `ms` decrementing a remaining count; `onTimer` each
    tick (with `info.remaining`); `onTimerDone` at zero.
  - `stopwatch` — no auto-fire; counts up; read via `getTimerElapsed`.
- **Scheduling = fixed-rate with drift compensation.** Fire times are anchored
  to the start, not to the previous (possibly late) callback, so a 100 ms timer
  averages 100 ms even if the heartbeat jitters.
- **Late/under-load = coalesce, never burst.** If several periods elapse between
  heartbeats, fire **once** and realign to the schedule — no backlog flood.
- **Restart-on-reuse.** `startTimer` on an existing `id` reconfigures and
  restarts it (idempotent replace), rather than stacking a second timer.
- **Reentrancy-safe.** A timer's callback may `stop` / `restart` itself or others;
  structural changes are applied at the end of the current tick, not mid-iteration.
- **Resolution / limits.** Practical floor ~1 ms (message-thread bound); set a
  sane minimum interval and document that sub-frame intervals coalesce.

## Lifecycle & serialization (spec)

- **Editor (design / preview):** a timer fires only if `runInPreview` is true.
- **Runtime (Player / exported panel):** timers fire normally and are
  **independent of the editor window** being open or closed — mirroring how
  scripts already keep running window-closed in `PluginProcessor`.
- **Panel state change** does **not** reset running timers (they are component /
  panel / project scoped, not state-scoped). Scripts may start/stop them on a
  state if desired.
- **Scope = lifetime:** a component-scoped timer dies with its component;
  panel/project-scoped timers live with the panel/project.
- **Serialization:** timer **definitions** (declarative section props — `name`,
  `mode`, `interval`, `repeat`, `autostart`, `runInPreview`) persist in the
  ValueTree and export (`portable` + `exportSafe`). **Runtime state**
  (`running` / `paused` / `elapsed` / `count`) does **not** serialize.
- **On load / reopen:** `autostart` timers start fresh from zero; all others sit
  idle. No attempt to restore mid-flight runtime state.
- **Pause/resume:** `pauseTimer` freezes `elapsed`; `resumeTimer` continues from
  the frozen value (it does not realign to wall-clock).
- **Preview vs live parity:** the trace simulator (`scriptRuntime.js`) and the
  `TimerManager` implement this same spec, so design-time and runtime agree.

## Integration points

- **LCD display** (`lcd-display-component.md`) — scroll / blink / cursor / page
  auto-advance / warm-up fade.
- **Animations section** — could use the timer as its tick driver.
- **Value commits** — debounce / throttle rapid changes.

## Decisions (resolved)

All major design questions are now settled in this doc:

- ~~Custom timer primitive?~~ → **No** — `TimerManager` over `juce::Timer`.
- ~~Repeat semantics~~ → **defined** (see Repeat & scheduling semantics).
- ~~Lifecycle / serialization edge cases~~ → **defined** (see Lifecycle &
  serialization).
- ~~Declarative Timer: `controlType` vs section~~ → **section**.
- ~~Heartbeat: `juce::Timer` vs `VBlankAttachment`~~ → **plain `juce::Timer`**,
  `VBlankAttachment` reserved for frame-synced animation parts.

Remaining is implementation, not design — see below.

## Implementation TODO

✅ **Live C++ backing implemented** (unverified by build — no toolchain in the
authoring environment). `startTimer(id, ms)` / `stopTimer(id)` now run real timers
and dispatch `onTimer({ id })`.

- [x] **`TimerManager`** (`CE/src/Scripting/TimerManager.h`) — one `juce::Timer`
  multiplexing named timers on the message thread; repeating; fixed-rate with
  drift compensation (coalesce, never burst); reentrancy-safe.
- [x] **Wired into the runtime** — `startTimer`/`stopTimer` added to
  `ScriptHostApi` (default no-op) + `BridgeScriptHost` callbacks; registered as
  globals in the JS (`JsScriptEngine`) and Lua (`LuaScriptEngine`) engines; wired
  in `PluginProcessor::setupScripting`, which dispatches `onTimer` on the message
  thread and stops all timers on teardown.
- [ ] **Additive commands** (`pauseTimer` / `resumeTimer` / `restartTimer` /
  `resetTimer` / `setTimerInterval`, queries, options form, `onTimerDone`) — not
  yet; MVP is repeating start/stop + `onTimer`.
- [ ] **Serialize timer definitions** (declarative Timer section) — not yet.
- [ ] **Python engine** registration + editor-preview parity — not yet.

## Add your ideas below
<!-- New timer ideas go here; promote into the sections above once fleshed out. -->
