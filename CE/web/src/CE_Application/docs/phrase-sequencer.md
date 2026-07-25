# Phrase Sequencer — a step grid whose rows are degrees

> Status: **shipped 🟢**. The third of the note-generating components.
> Part of the [panel parts backlog](./README.md).

## What it is

Sixteen columns, eight rows, click to place a note. The clock walks the columns
and each lit cell plays.

The reason it exists is a gap rather than a feature: the
[Turing Modulator](./turing-modulator.md) sequences **values**, the
[Arpeggiator](./arpeggiator.md) walks notes you are **already holding**, and
nothing here sequenced **pitch**. This does — and because the
[Transport](./transport.md) and the Chord Pad's scale engine were already built,
it is a small component with a large payoff.

## Rows are scale degrees, not semitones

This is the one decision that makes it different from a piano roll, and
everything else follows from it.

Row 0 is the tonic. Row 1 is the second degree, row 2 the third, and row 7 is the
tonic an octave up. So a pattern is a **shape**, not a set of pitches:

| | |
|---|---|
| Change the key | it transposes |
| Change minor to major | it re-harmonises |
| Change the scale to pentatonic | rows 0–4 span the octave instead of 0–6 |

And a wrong note is **unreachable**. Not "discouraged" — there is no cell you can
click that is outside the key, because the grid has no rows for the notes that
aren't in it. That's worth more on a performance panel than any amount of
quantisation, because quantisation fixes a note after you've played it and this
never lets you draw it.

The trade is real, so there's a **chromatic mode** for when you want the piano
roll after all: rows become semitones, row labels become note names, and the key
and scale stop meaning anything. Use it for drum-ish parts, chromatic runs, and
anything where "in key" is not the goal.

Row labels tell you which mode you're in without your having to look: degree mode
shows `1 2 3 … 1+1` (1-based, as musicians count), chromatic shows `C3 C♯3 D3`.

## The pattern is a sparse map

Stored as `{"step:row": {velocity, tie}}`, not a dense array.

The consequence is worth stating because it's the kind of thing people discover
by accident and don't trust: **shrinking the grid doesn't delete anything.** Cut
16 steps to 8, change your mind, go back to 16 — the notes are still there. A
dense array would have thrown them away the moment you typed the smaller number.

Because that could equally be a nasty surprise ("why did notes reappear?"), the
inspector says so when it applies: *"6 notes are outside the current grid — they
are kept, not deleted."* with a **Delete them** link if you actually meant to.
Trimming is explicit; you have to ask.

## Ties, and the thing they're easy to get wrong

A tie holds the note through the step instead of retriggering it. That is the
difference between a line and a stutter, and it is the only way to write a note
longer than one step.

Two rules make it behave:

**A tie with a rest before it is not a tie.** There is nothing to hold, so it
retriggers, and the renderer doesn't draw the join. A tie box that silently did
nothing would be worse than one that plays.

**The gate must not cut a tie.** Gate is a fraction of a step — at 0.8 each note
is released four-fifths of the way through, which is what makes a sequence sound
articulated rather than smeared. But applying that to a note the *next* step is
about to hold would release it and immediately re-press it, which is exactly the
retrigger the tie exists to avoid. So `tiesForward()` is asked before the gate
timer is set, and a note about to be held is exempt.

That check has to look **forward** through the direction, not just at `step + 1`
— in ping-pong the next step is sometimes the previous one.

## A note-off must go where its note-on went

The same trap as the [Zone Splitter](./zone-splitter.md), and worth repeating
because the trigger here is different and easier to hit.

The obvious implementation works out the note to release from the row and the
current settings. That's fine right up until you **change the key, the scale, the
transpose or the base octave while it's playing** — all four change what a row
means, so the re-derived note-off releases a pitch that was never started and the
real one rings forever.

So every note-on records what it started, and the release replays that. It's a
pure reducer in [`phraseLayout.js`](../utils/phraseLayout.js), specifically so
the rule can be tested rather than hoped for:

```js
let s = playStep(EMPTY_SOUNDING, cMinor, 0);   // → on ch1 note 48
// …the key is dragged from C to F while it plays…
s = playStep(s.sounding, fMinor, 1);           // → off ch1 note 48, then the new note
```

`playStep` also handles the two neighbouring cases in one pass: anything tied and
already sounding on that row **carries over untouched**, and anything not
carrying over is released before the new notes start.

**Stopping releases too.** A stopped sequencer that left its last chord ringing
would be a hanging note you could only clear with [Panic](./panic.md).

## Direction

Forward is what everyone means by a sequencer. The other three cost one function
and turn one pattern into four:

| | |
|---|---|
| Forward | 0 1 2 3 0 1 2 3 |
| Reverse | 3 2 1 0 3 2 1 0 |
| Ping-pong | 0 1 2 3 2 1 0 1 — the endpoints aren't repeated |
| Random | a new step each tick, deterministic from the index |

Random is **deterministic from the index**, not `Math.random()`. Two sequencers
on the same clock with the same seed therefore agree with each other, and a
re-render of the same index is the same step rather than a fresh roll. Change the
seed for a different sequence of the same pattern.

All four are a pure fold of a monotonically rising index. Nothing is stored, so
nothing drifts, and changing direction mid-pattern can't corrupt a cursor —
there is no cursor.

## Clock

Free-running in steps per second, or **synced to the [Transport](./transport.md)**
at a division. Synced is position-in, index-out, exactly like the Arpeggiator:
the index is computed from the transport's beat position rather than accumulated,
so it cannot drift, and a jump — a locate, a rewind, a loop wrap — **re-baselines**
rather than firing every step it skipped.

The consequence worth knowing: with several sequencers synced to one transport at
the same division, they are sample-locked to each other by construction, not by
luck. Different divisions give you a polyrhythm that stays in phase over the bar.

## Swing

Delays every odd step by up to half a step, and it comes from **the
[Transport](./transport.md)** by default — swing belongs on the clock, so
everything synced to it shuffles together instead of you keeping two numbers in
step by hand. A sequencer can opt out ("swing from: its own") when a part wants
its own feel against the rest, and a free-running one always uses its own,
because there is no clock to inherit from.

The maths is the **Arpeggiator's own swing function**, not a copy — two
implementations of "delay the odd steps" would eventually disagree.

It's applied to the **running index**, not the pattern step, so reverse and
ping-pong stay an even shuffle rather than following the pattern back and forth.

The playing column still lights on the beat when a note is swung off it: the grid
shows where the sequence is, not where the shuffle put it.

## Velocity

The pattern has one velocity; a cell can override it. Cells above 100 get a
bright cap drawn on them and cells below 60 are dimmed, so the dynamics are
visible on the grid rather than hidden in a field you have to click a cell to
see.

## Starting patterns

Not "presets" in the splitter's sense — these are **seeds**, because a blank grid
is a blank page and the hardest part of a step sequencer is the first four notes.

| | |
|---|---|
| Clear | empty |
| Octave bass | tonic, tonic-up-an-octave, alternating |
| Arp up | a triad walked upward |
| Riff | a syncopated one-bar line, with ties |
| Random | one note per step, drawn from the scale |

They're built from the **current grid size**, so dropping a 16-step riff onto an
8-step pattern gives you eight steps of it rather than half of it hidden past the
end. There's a test that no seed ships a tie with a rest in front of it, for the
reason above: a default that quietly does nothing teaches the wrong thing about
what the box means.

## Interaction

- **Click a cell** to toggle it.
- **Drag across** to paint a run. One toggle per cell per drag — dragging back
  over a cell you just lit doesn't flicker it — and the first movement locks the
  direction, so a horizontal drag stays on its row.
- The **playing column** is lit under the cells rather than over them, so the
  notes stay readable as it passes.
- A **bar line** every N steps (4 by default), because sixteen identical boxes
  are much harder to read than four groups of four.

## Compatibility

Any synth that responds to MIDI notes, provided a hardware output is selected on
the `mainSynth` device role — the same path the [Chord Pad](./chord-pad.md),
[Arpeggiator](./arpeggiator.md) and [Zone Splitter](./zone-splitter.md) use.

It needs no MIDI **input**: unlike the Arpeggiator it generates its own notes
rather than rearranging yours. That makes it the one note component that works on
a panel with nothing plugged into it.

[Panic](./panic.md) releases everything it is holding, using the same remembered
routings. Nothing here touches the DPD profile.

## Driving it from a script

Swapping the riff from a footswitch is most of the point of putting a sequencer
on a panel, so the whole config is reachable — through the same pure reducer the
inspector's own buttons use, so the two can't diverge:

```lua
phraseSeed("Riff", "arpUp")        -- swap the pattern
phraseKey("Riff", 5)               -- move it to F
phraseScale("Riff", "dorian")      -- re-harmonise it
phraseTranspose("Riff", -12)
phraseDirection("Riff", "reverse")
phraseRun("Riff", false)           -- stop it (and release what it holds)
phraseCell("Riff", 6, 2)           -- toggle one cell
```

A bad argument is a **no-op, not a throw** — a misspelled scale name, a cell
outside the grid, an unknown seed. A script firing on a footswitch must not take
the panel down mid-song. The trace says *"nothing to change"* rather than staying
silent, so a dead footswitch is still diagnosable.

`phraseCell` **toggles** when you don't say which way — what a footswitch wants —
and is **idempotent** when you pass `true`/`false`, which is what a MIDI-mapped
switch wants, because it may well fire twice.

Only the fields that actually change are written, so an undo step says
*"direction"* rather than *"the sequencer"*.

Like `split`, the command is portable but **not export-safe**: it edits the
panel's own model rather than sending MIDI, so it needs the panel runtime. The
exported Player has that; a bare device script doesn't.

## What a cell can do besides play

Three per-cell fields, edited in the inspector by picking a step and a row —
the preview cell can be four pixels wide, so clicking it is not a way to select
it.

**Chance** is how often the cell plays. The roll is **deterministic** from the
lap, the position and the pattern seed rather than `Math.random()`. Three
consequences, and the third is the one that matters: two sequencers on one clock
with one seed agree; re-reading the same index doesn't re-roll, so the grid and
the notes never disagree; and a pattern sounds the same on the take you recorded
as on the take you play back. The next lap rolls again, which is what makes it
feel alive rather than static.

A maybe-note is drawn **hollow**, in proportion to how unlikely it is. A filled
cell that stays silent is a grid lying about the pattern.

**Ratchet** retriggers the note inside its own step — 3 is a triplet in the space
of one step, drawn as three ticks along the bottom of the cell so you can count
them without clicking. A **tied** note is never ratcheted: holding it and
retriggering it are opposite instructions, and the tie is the one you asked for
last.

**Length** is the note's own gate as a multiple of the **step**, so `2` holds it
for two steps and it is drawn as the bar it actually occupies. A multiple rather
than a fraction because this is how you write a long note without a chain of
ties — which was the previous answer, and a worse one.

The inspector lists every cell doing something other than playing normally, so
you can find what you set without hunting the grid.

## What it doesn't do

Named honestly, because each of these is a thing someone will look for:

- **One pattern, no chaining.** There is no song mode, no A/B, no pattern queue.
  A script can swap the seed on a footswitch, which covers the live case; it
  does not cover writing a verse and a chorus.
- **One pattern per sequencer.** Chaining lives on the Transport's song chain
  rather than here — see [song-mode.md](./song-mode.md).
