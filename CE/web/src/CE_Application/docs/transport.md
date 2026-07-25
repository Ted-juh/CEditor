# Transport — the master clock

> Status: **shipped 🟢**. The piece every time-based component here was missing.
> Part of the [panel parts backlog](./README.md).

## What it is

One clock for the whole panel: play / stop, a tempo, a bar-and-beat position,
and — the point — something for the other components to *follow*.

Before this, everything that moved kept its own timer. The
[Arpeggiator](./arpeggiator.md) ran at "6 steps per second". The
[Gesture Looper](./gesture-looper.md) had a loop length in seconds. The
[Turing Modulator](./turing-modulator.md), the
[Kinetic Modulator](./kinetic-modulator.md), the
[Preset Constellation](./preset-constellation.md) wander — all speeds, none
tempos. Two of them at "the same" rate drift apart within a bar, and none of
them line up with anything a musician would call beat 1.

## The one thing a clock must not do

**Drift.** So the position is never accumulated:

```js
export function beatsAt(startedAtMs, nowMs, bpm) {
  return (Math.max(0, nowMs - startedAtMs) / 60000) * bpm;
}
```

Every reading is recomputed from the instant the transport started. Nothing is
added to anything. The alternative — `phase += rate * dt`, which is what all the
existing tickers do — accumulates float error on every frame, and worse, every
one of those tickers *clamps* `dt` (`Math.min(0.1, …)`) so a stalled frame
silently throws away the time it slept through. That clamp is correct for a
smoothing filter and fatal for a clock: it makes the error one-directional.

There's a test that just demonstrates the difference — accumulate 60fps deltas
for an hour and compare against `beatsAt` over the same span. The accumulator is
visibly wrong; `beatsAt` is exact at any sampling interval, because it isn't
sampling anything.

Jitter is a different problem and we can't fully win it — a browser timer is not
a sample clock. A late frame gives a *late reading*, not a *wrong* one, and the
next reading is correct again.

## Never lose a step

A late frame must still fire the steps it slept through, or you get a hole in
the bar instead of a stutter. `crossedSteps(prev, next, division)` returns every
step boundary between two readings:

```js
crossedSteps(0.9, 1.35, '1/16')   // → { steps: [4, 5], dropped: 0 }
```

It's capped (16 by default). Coming back from a genuinely long stall — a
backgrounded tab, a breakpoint — you want to catch *up*, not to dump four
hundred queued notes at the synth. On an overrun it keeps the **most recent**
steps and reports how many it dropped, because where the music is now matters
more than replaying where it was.

## Two rates

The clock in [`stores/transport.js`](../stores/transport.js) runs on
`setInterval(4ms)`, not `requestAnimationFrame`. Two reasons:

- MIDI clock-out is 24 pulses per quarter — one every 21ms at 120bpm. Pacing
  that off the display refresh would jitter it audibly.
- Browsers throttle rAF the moment a window stops being visible. A transport
  that stops counting when you switch away from the panel is not a transport.

The **store** only publishes at ~30Hz, though. A Svelte store written 250 times
a second would re-render the panel for no benefit. Components that need the
exact position — the synced Arp does — call `transportBeatsNow()` from their own
ticker instead of reading the store, which would hand them a value up to a frame
stale.

## Following an external clock

Set the source to **MIDI clock in** and the transport stops generating and
starts listening. The bytes were already arriving: `splitMidiMessages` has always
recognised `F8`/`FA`/`FB`/`FC`/`FF` as single-byte realtime messages, and every
consumer so far dropped them because nothing wanted them. See
[note-input-echo.md](./note-input-echo.md) for the input pipe itself.

When following, the incoming pulses **are** the position — 24 of them to the
beat — rather than a tempo we then re-derive a position from. The displayed BPM
is estimated from the gaps between pulses, using the **median** and not the
mean: one late pulse from a USB hiccup drags an average around, and a BPM
readout that wobbles is worse than one that's slightly stale.

The tempo field goes read-only in this mode and shows what's being received. The
component draws a dashed border until pulses actually arrive, so "set to
external and nothing is plugged in" doesn't look identical to "locked and
running".

## Sending clock out

Optional, off by default, and the editor says why: at 120bpm it's **48 MIDI
messages a second** going down the wire alongside your notes. Worth it when
something downstream needs to follow the panel; not worth it otherwise.

Clock-out is suppressed while following an external clock. Echoing someone
else's clock back at them is how feedback loops start.

## Tap tempo

Click anywhere on the component that isn't the play button. Taps more than two
seconds apart start a new measurement rather than averaging across the pause —
otherwise the first tap after a break poisons the reading. Inactive when
following an external clock, since there's nothing to tap.

## What follows it: the Arpeggiator

Sync is off by default, so nothing changes until you ask for it. Turn
**Timing → Sync to transport** on and the Arp's steps-per-second field is
replaced by a **division** — 16ths, dotted 8ths, quarter triplets, and so on.

The interesting part isn't the tempo, it's *how* it follows. The Arp doesn't get
told a rate; it asks where the music is and works out which step that is:

```js
syncedStepAt(beats, control, length)   // floor(beats / beatsPerStep) mod length
```

Two consequences fall straight out of that. Switch a synced Arp off mid-bar and
back on, and it resumes at the step the bar is on — not at step 1. And two
synced Arps on different divisions stay in an exact ratio forever, because
neither is counting; both are reading the same number.

Gate and swing are already expressed as fractions of a step, so they follow the
tempo without any extra plumbing. The header shows `⧗ 16th` in place of `6.0/s`,
because showing both would be two different answers to the same question.

When the transport is stopped, a synced Arp holds its position and stays silent.
That's what a stopped transport means.

## Compatibility

The clock itself is pure UI state and needs no device at all. Clock-out and
start/stop bytes need a hardware output on the `mainSynth` device role, same as
every other note-emitting component here. External sync needs a MIDI **input**
selected — see [expression-router.md](./expression-router.md) for the same
caveat about input in an exported Player.

Nothing about the transport touches the DPD profile.

## Possible next steps

- **Sync the rest of them** — the Looper's loop length in bars, the Turing's
  clock, the Kinetic's step, the Constellation wander. The engine work is done;
  each is the same three-part change the Arp got.
- **Host tempo** — an exported VST3 can read the DAW's playhead. That's a third
  source alongside internal and external, and the obviously right default once
  it exists.
- **Loop points** — a bar range the position wraps inside.
- **Count-in** — N bars of nothing before the first step fires.
- **Song position pointer** (`F2`) — currently ignored; it would let an external
  start mid-song land in the right place instead of at bar 1.
