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
starts listening. (Inside a DAW, prefer **Host / DAW** below — it's the same
idea done better.) The bytes were already arriving: `splitMidiMessages` has always
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

## Following the host (an exported plugin only)

The best of the three sources, and the one that only exists once the panel is a
plugin. Set the source to **Host / DAW** and the transport follows the DAW's
playhead.

Why it beats MIDI clock: a DAW reports a **position** — `ppqPosition`, quarter
notes since the start of the song — where MIDI clock reports a *stream of
pulses you have to count*. A dropped pulse puts a counter permanently a 24th of
a beat behind and it never recovers. A position can't go stale that way. You
also get the time signature and the play/record state for free, and locating in
the DAW takes the panel with it.

### How it gets here

`juce::AudioPlayHead` is only valid inside `processBlock`, so the position is
read **on the audio thread** into plain atomics — no allocation, no locking,
nothing that could block — in
[`PluginProcessor.h`](../../../../src/Player/PluginProcessor.h). The editor's existing
30 Hz timer reads those atomics back on the message thread and pushes to the
panel via `PlayerHost::pushHostTransport`. That's the same shape as the
parameter polling that was already there, for the same reason: the audio thread
must never touch the WebView.

Hosts disagree about what they report and when — no tempo until playback starts,
no ppq at all in some offline renders, a `bpm` of 0 on the first block. So every
field carries its own validity flag and **absent fields are omitted from the
payload** rather than sent as zero. `parseHostPosition` on the JS side is a
validator, not a cast: "no tempo yet" and "0 bpm" have to stay distinguishable,
or a panel would briefly run at zero every time a project loads.

### Smooth between updates

30 pushes a second is plenty for a DAW and visibly steppy for a readout, so the
panel **anchors** to each host position and extrapolates with the same
`beatsAt()` rule the internal clock uses. Every message re-anchors. The display
is smooth at frame rate and never more than one update out of step with the DAW.

### Locates are not playback

A jump — dragging the locator, a loop wrapping, hitting return-to-zero — bumps a
**jump counter** in the store. Followers watch it and re-baseline instead of
catching up. Without this, `crossedSteps` does exactly what it's designed to do
and fires every step between where you were and where you dropped the playhead:
move the locator from bar 2 to bar 40 and the Arp spits a burst of notes nobody
asked for. Playing on is a continuation; a locate is not, and the transport has
to know the difference. Rewind and an incoming MIDI `start`/`reset` bump the
same counter.

### What it doesn't do

The **editor preview and the standalone Player have no DAW to ask**. Set to
Host / DAW there, the transport parks and the face reads `HOST · no DAW` — the
editor says so too, rather than letting it look broken. Clock-out and tap tempo
are inactive while following, same as with MIDI clock in. And only **VST3** is
built today (`FORMATS VST3 Standalone` in `CMakeLists.txt`) — `AudioPlayHead` is
format-agnostic, so the same code covers AU and CLAP if those are ever added,
but that isn't a claim that they work now.

## Sending clock out

Optional, off by default, and the editor says why: at 120bpm it's **48 MIDI
messages a second** going down the wire alongside your notes. Worth it when
something downstream needs to follow the panel; not worth it otherwise.

Clock-out is suppressed while following an external clock. Echoing someone
else's clock back at them is how feedback loops start.

## Loop points

A bar range the position folds into: **Loop → on**, a start bar and a length.
The face shows `⟲ 5–9` so you can see it without opening the inspector.

The rule that keeps this safe is the one the whole clock rests on — the looped
position is a pure **function** of the un-looped one, not a counter we reset:

```js
loopedBeats(beats, start, len)   // beats < start ? beats : start + ((beats - start) % len)
```

The timeline keeps running monotonically underneath and the fold happens on
read. So there is no wrap handler that can miss a wrap, and a loop that has been
going for an hour is still exactly on the bar line — `loopedBeats(8 + 16*1000, 8, 16)`
is 8 on the nose, which is a test.

Below the loop start the position passes through untouched, so you can **run in**
to a loop from earlier in the song. That's also what makes a count-in work.

A wrap is a **discontinuity**, and gets reported as one — same jump counter a
host locate uses. Without that the Arp would fire every step between the loop
end and the loop start on the frame it came round.

Loop points are **master-clock only**. Following a DAW or an incoming clock, the
other end owns the position, and folding theirs into a loop of ours would put
the panel somewhere the master isn't. The inspector says so instead of silently
doing nothing; use the host's own loop.

## Count-in

Bars of silence before the first step fires, 0–8. Press play and the transport
**arms** rather than starting: the button becomes a pulsing ring, the position
readout becomes a countdown (`−2.4 −2.3 −2.2 …`, bars then beats, counting down
the way a drummer counts), and when it reaches zero the clock starts for real at
the position it was counting in to.

The implementation choice worth naming: during the count-in the transport is
deliberately **not running**. Every follower already holds its position and
stays silent when the transport is stopped, so a count-in needs *no change in
any of the six*. The alternative — letting the position go negative — would mean
asking six components to remember to check a sign, and one of them eventually
wouldn't.

Pressing play again during the count-in aborts it, as every DAW does. Zero bars
is an ordinary start. Following a master, there's nothing to count in to: when
the music begins is their decision, so the setting is ignored.

## Tap tempo

Click anywhere on the component that isn't the play button. Taps more than two
seconds apart start a new measurement rather than averaging across the pause —
otherwise the first tap after a break poisons the reading. Inactive when
following an external clock, since there's nothing to tap.

## What follows it

**Every self-clocked component in the panel follows it.** There are six, and
that is all of them — nothing here still runs on a private timer. Sync is off by
default on every one, so nothing changes until you ask for it, and each keeps
its free-running control for when you don't.

| | unit | what sync gives you |
|---|---|---|
| [Arpeggiator](./arpeggiator.md) | note division | steps land on the beat |
| [Turing Modulator](./turing-modulator.md) | note division | its *mutations* land on the beat |
| [Gesture Looper](./gesture-looper.md) | bars | the loop point is the bar line |
| [Preset Constellation](./preset-constellation.md) | bars | the wander cycle is an arrangement length |
| [Orbit Modulator](./orbit-modulator.md) | bars | every satellite ratio becomes turns per phrase |
| [Kinetic Modulator](./kinetic-modulator.md) | musical time | tempo scales the motion; stop freezes it |

Three units, because these are three kinds of thing. A sequencer has *steps*, so
its unit is a note division. A cycle has a *length*, so its unit is bars. And
the Kinetic has neither — see below.

### The Arpeggiator

Turn **Timing → Sync to transport** on and the Arp's steps-per-second field is
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

### The Turing Modulator

The same step-from-position rule (`turingSyncedStepAt`), and sync is worth *more*
here than on the Arp. The Turing's steps don't just play, they **mutate** as they
recycle. A shift register that lands its changes on the beat sounds composed; the
identical register free-running sounds like a fault. The header shows the
division alongside the lock/evolve readout.

Stopped, the register holds. It doesn't freeze mid-mutation at an arbitrary
point, because the step index is a function of the position and the position
isn't moving.

### The Gesture Looper

A take is a **loop**, so its unit is bars, not a note division — you record a
shape over two bars and want it back over two bars. Synced, the phase comes from
`cyclePhaseAt(beats, bars, beatsPerBar)`, so the loop point is the bar line
rather than wherever you happened to be when you hit record, and the loop is
still exactly on the bar an hour later.

The lane grid changes too, and this is the part that makes it readable: instead
of fixed quarters, the lines become **bar lines and beat lines** for the actual
loop length and meter. A two-bar take in 4/4 draws seven interior lines with the
bar line brighter. In 3/4 it draws two.

`looperLoopSecondsAt(control, bpm, beatsPerBar)` gives the duration when
something still needs one.

### The Preset Constellation

Bars again, but long ones — the wander is a slow drift across the preset map, so
the default is 8 bars a cycle. Synced, the probe passes the same point of the
field on the same bar every time round, which turns an ambient drift into
something you can write an arrangement against.

### The Orbit Modulator

This one needed **no new per-satellite setting**, which was not obvious until we
looked: `ratio` is already turns per *global cycle*. Give the cycle a length in
bars and every satellite inherits a musical rate from that one number — a
satellite at ratio 2 over a 4-bar cycle makes eight turns to the phrase, exactly.
The ratios between satellites were always exact; they just had nothing to be
exact *against*.

### The Kinetic Modulator — the one that doesn't fit

Be clear about this one: the Kinetic is an **integrator, not a phase**. There is
no closed form to recompute a bouncing ball from, so unlike everything else on
this page it *cannot* be made drift-free. Two synced Kinetics will not stay in
lockstep, and one that stalls will not re-align itself afterwards. Pretending
otherwise would be the easy thing to write here and wrong.

What sync does buy is real but narrower. The simulation advances in **musical
time** — `musicalDelta(prevBeats, nextBeats)` converts transport travel into a
simulation step at a 120bpm reference — so:

- tempo scales the motion: double the BPM and the ball moves twice as fast;
- a stopped transport freezes the ball mid-flight instead of letting it drift on;
- at 120bpm it behaves exactly as it does unsynced, so turning sync on doesn't
  silently change how an existing patch feels.

## Compatibility

| source | works in | needs |
|---|---|---|
| Internal | editor preview, standalone Player, plugin | nothing |
| MIDI clock in | anywhere a MIDI **input** is selected | a hardware input |
| Host / DAW | **exported plugin only** | a host that reports a playhead |

Clock-out and start/stop bytes need a hardware output on the `mainSynth` device
role, same as every other note-emitting component here. External sync needs a
MIDI input selected — see [expression-router.md](./expression-router.md) for the
same caveat about input in an exported Player.

Nothing about the transport touches the DPD profile.

## Possible next steps

- **Song position pointer** (`F2`) — currently ignored; it would let an external
  start mid-song land in the right place instead of at bar 1. The host source
  already gets this right, because a DAW reports a position; it's only the MIDI
  clock path that starts at bar 1 regardless.
