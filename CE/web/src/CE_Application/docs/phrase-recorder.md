# Phrase Recorder — the note twin of the Gesture Looper

> Status: **shipped 🟢**. Part of the [panel parts backlog](./README.md).

## What it is

Press record, play something, and it loops.

The [Gesture Looper](./gesture-looper.md) records your *motion* and replays it
into a parameter. This is the obvious sibling: it records your *notes* — played
on the panel or arriving on the MIDI input — and replays them on the clock. Same
interaction model (arm, lay a pass, overdub, undo the layer you regret),
different payload.

## Why it isn't just the Looper with notes in it

A gesture is a **sample stream**. You can interpolate it, drop half the samples,
resample it at a different rate, and it still sounds like the thing you did.

A phrase is a set of **events with duration**, and none of that is true. Miss a
note-on and there is silence where a note should be; send it twice and there is a
stuck note. So the engine is event bookkeeping rather than curve fitting, and the
things that get careful attention are different ones:

- **A note held across the loop seam** keeps its real length. Down at 0.9 and up
  at 0.1 next lap is a fifth of a loop, not minus four-fifths of one.
- **A retrigger with no note-off** closes the first note rather than dropping it.
  A lost note-off is a real thing on a real cable; the alternative is an event
  that never ends.
- **A note-off with no note-on** is ignored, not invented.
- **Stopping with keys down** closes them. An event with no end plays as a stuck
  note on every future lap.
- **The same pitch on two channels** is two notes. Collapsing them loses one.

Each of those is a test, because each is a bug you would only find on stage.

## Arming waits for the top of the loop

Pressing record mid-loop and having it start *there* gives you a take whose
downbeat is wherever your hand happened to be. Nobody has ever wanted that.

So record **arms**, and the loop boundary promotes it: `armed → recording` if the
take is empty, `armed → overdub` if there's already something there. Pressing
record again before the boundary means you changed your mind, and nothing was
captured.

`Once` stops at the end of the first lap instead of layering until you press
stop — the difference between capturing one idea and building a bed.

## Undo is per pass, not per note

Every note is stamped with the overdub pass that laid it down. **Undo pass**
drops a number, and with it the whole layer.

That's deliberately not a general undo stack. The thing you actually want after
an overdub is *"that layer was wrong, take it off"* — and one integer gives you
that for nothing, where a diff history would be both bigger and worse at the job.

## Two capture sources

| | |
|---|---|
| **MIDI input** | notes arriving from the hardware, off the shared [note-input](./note-input-echo.md) store |
| **Panel** | notes the panel itself plays |

The panel source is the interesting one, and it cost almost nothing: every
note-emitting control here — [Chord Pad](./chord-pad.md),
[Arpeggiator](./arpeggiator.md), [Ribbon Keyboard](./ribbon-keyboard.md),
[Drum Pads](./drum-pads.md), [Phrase Sequencer](./phrase-sequencer.md),
[Zone Splitter](./zone-splitter.md) — already sends through **one funnel**. A tap
on that funnel captures all six, and a note control added later is captured
without touching the recorder at all.

**A recorder never records a recorder.** Two of them pointed at each other would
feed each other forever, doubling the take every lap. The tap carries the type of
the control that played the note, and recorder output is skipped.

The input source is derived by **diffing held state**, the same reconcile the
Zone Splitter does, because the shared store answers *"what is held now"* rather
than *"what just arrived"*. One subscription feeds every recorder on the panel.

## Quantise is partial by default

Strength `0` — exactly as played — is the default, and full snap is one end of a
slider rather than a button.

Full quantise makes a human take sound like a step sequencer. If that is what you
wanted, the [Phrase Sequencer](./phrase-sequencer.md) already exists and is
better at it: it has a grid you can see and edit. The reason to *record* a phrase
instead of drawing one is the feel, so the default keeps it and half-strength
pulls the timing toward the grid without flattening it.

**Lengths are left alone unless asked.** Quantising them turns a legato line into
blocks, which is a separate decision from fixing the timing.

**Into key** snaps each pitch to the nearest note of the scale. Ties go **down**,
deterministically — a coin-flip there means the same take quantises two different
ways on two runs, which is the kind of bug nobody ever tracks down.

Quantise is applied on a button, not live. A live quantise would move notes under
the playhead while they are sounding.

## The take lives in the session while you record

Writing the model on every note would put a hundred undo steps in the history for
one four-bar phrase. So the live take is session state, and it is committed to
the model **once**, when recording ends — one undo step for the whole take, at
the moment it stops being edited.

## Sync

Free-running in seconds, or **synced to the [Transport](./transport.md)** in
**bars**. Bars, not a division, because the unit has to match the thing: a
sequencer has steps, a loop has a length.

The consequence is the whole reason to sync a recorded phrase rather than a
recorded gesture: change the tempo and the phrase stays the same number of
**bars**, so it still fits the music. Position-in/phase-out like every other
follower, so it cannot drift, and a locate re-baselines rather than replaying the
bars it skipped.

## The roll fits itself to the take

A fixed 128-row piano roll draws one recorded octave as three invisible pixels.
So the display finds the take's range and fits to it, with a floor (12 rows by
default) so a two-note take isn't two fat bars.

A note that wraps the seam is drawn as **two** bars — one running off the right
edge would look shorter than it sounds. The newest overdub pass is drawn in the
record colour, so you can see what you just added rather than hunting for it.

## Interaction

Clicking the roll **arms** it, and clicking again changes your mind. Everything
else is in the inspector on purpose: a transport you can mis-hit while playing is
worse than one you have to reach for.

## Compatibility

Any synth that responds to MIDI notes, on the `mainSynth` device role — the same
path every note control here uses. Capturing from the **input** additionally
needs a MIDI input selected; capturing from the **panel** does not, which makes
it the one recording path that works with nothing plugged in.

[Panic](./panic.md) releases everything it is playing and closes any note still
open in the take. Nothing here touches the DPD profile.

## Count-in, repair and take slots

**Count-in** waits a number of bars after arming before it starts capturing.
The [Transport](./transport.md) has one too, but it counts the whole panel in
*from a stop*; this one counts **this recorder** in from wherever the music
already is, which is what you want when the band is playing and you want to catch
the next four bars. It still starts on a loop boundary — just a later one — so
the take's downbeat is still the loop's downbeat.

**Repair** is a small set of fixes, not an editor. The Phrase Sequencer is the
editor; this is for a take you otherwise like:

- **Nudge** moves the whole take. *"It's consistently a hair late"* is the
  commonest thing wrong with a recording, and it's a one-click fix.
- **Shift** transposes the take **itself**, where the transpose setting only
  changes playback. Two operations because they are genuinely different: one
  rewrites what you recorded, the other leaves it alone. Shift uses playback's
  drop-don't-clamp rule, so the two can't disagree about what the take contains.
- **Per note**: position, pitch, velocity, length, delete. Notes are addressed by
  index in time order, because a take has no stable ids and adding them would
  only be for this.

Editing re-sorts, since everything downstream assumes time order, and returns the
**same object** when nothing actually moved.

**Take slots** hold eight recordings, so you can try an idea without losing the
one that worked. Storing and loading are **copies in each direction** — a
reference would mean editing the live take silently rewrote the stored one, which
is the kind of bug you only notice after you've lost the good take.

## Song mode

Takes can be **chained** — take 1 twice, take 2, take 3 — using the same engine
the [Phrase Sequencer](./phrase-sequencer.md) chains patterns with. See
[song-mode.md](./song-mode.md).

The chain **never advances while recording.** Swapping the take out from under a
pass would lose it, which is the one thing a recorder must not do.

## Driving it from a script

A big Record button on a panel is an obvious thing to want, and it needs the
recorder to be reachable from a script — so it is, through the same pure reducer
the inspector's own buttons use:

```lua
recorderRecord("Loop")          -- arm (toggles; pass true/false to be explicit)
recorderStop("Loop")
recorderPlay("Loop", false)     -- mute the loop without losing it
recorderUndo("Loop")            -- drop the last overdub pass
recorderClear("Loop")
recorderQuantize("Loop", 16, 0.5)          -- grid, strength
recorderQuantize("Loop", 16, 1, "minor", 0)  -- …and into a key
recorderTranspose("Loop", -12)
recorderBars("Loop", 4)
recorderSource("Loop", "panel")
recorderCountIn("Loop", 2)
recorderNudge("Loop", -0.01)     -- move the whole take earlier
recorderShift("Loop", 12)        -- transpose the take itself
recorderStore("Loop", 2, "Verse")
recorderLoad("Loop", 2)
```

**The take-editing actions refuse while it is capturing.** During a pass the live
take lives in the session and is committed when recording stops, so a scripted
`clear`, `undo` or `quantize` mid-take would be silently overwritten a moment
later. They return nothing and say so in the trace, rather than appearing to
work. `stop` is always allowed.

`recorderRecord` **toggles** when you don't say which way — what a footswitch
wants — and is **idempotent** when passed `true`/`false`, which is what a
MIDI-mapped switch wants, because it may fire twice.

A bad argument is a **no-op with a trace line**, not a throw. Only the fields
that actually change are written.

Like the other panel-editing commands this is portable but **not export-safe**:
it changes the panel's own model rather than sending MIDI, so it needs the panel
runtime. The exported Player has that; a bare device script doesn't.

## What it doesn't do

- **Note-off timing is still frame-resolution.** Note-ONs now carry an arrival
  stamp and are recorded where they happened, but a note-off has no held entry
  left to carry one. That moves a note's *length* by a frame at worst, where a
  missed onset moved the note itself.
- **No dragging notes on the roll.** Repair is numeric, in the inspector. The
  preview roll is a display.
