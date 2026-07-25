# Harmoniser — one finger in, a full chord out

> Status: **shipped 🟢**. Part of the [panel parts backlog](./README.md).

## What it is

Play one note; hear a chord.

It is mostly **assembly**, and that's the point: the [Chord Pad](./chord-pad.md)'s
scale engine builds the chord, the [note-input](./note-input-echo.md) path
supplies the played note, and the note-output path sends the result. Three things
that already worked, wired together into the classic "make me sound like a
keyboard player" box.

What it *adds* is two rules, and they are the two every naive implementation
gets wrong.

## Two modes that differ more than they look

**Diatonic** builds the chord that belongs to the played note's **degree in the
key**. Play the second degree of C major and you get D minor, because that is the
chord on that degree:

```
 C  -> C E G    C · I
 D  -> D F A    Dm · ii
 E  -> E G B    Em · iii
 F  -> F A C    F · IV
 G  -> G B D    G · V
 A  -> A C E    Am · vi
 B  -> B D F    B° · vii°
```

The harmony is correct **by construction**. It isn't "usually right"; there is no
note you can play that produces a chord outside the key.

**Chord memory** transposes a **fixed shape** to whatever you played, in key or
out of it. Play C♯ with a major shape and you get C♯ major, in a piece that has
no C♯ major in it. That is not a bug — it is exactly what a hardware chord-memory
button does, parallel fifths and all, and it is what people reach for it
expecting. The two modes are for different jobs and neither is the "correct" one.

The shape lists semitones from the played note, and **0 is in the list rather
than implied** — so you can leave it out and send harmony only, with the note you
played going somewhere else.

## A note outside the key is a stated rule, not a guess

In diatonic mode a note that isn't in the scale has no degree, so there is no
chord for it. None of the three possible answers is obviously right, so it's a
setting:

| | |
|---|---|
| **Play the note alone** *(default)* | no harmony, but you still hear what you played |
| Harmonise the nearest scale tone | C♯ is treated as C |
| Silent | the note doesn't sound at all |

The default keeps you **audible**, because "I played a note and nothing happened"
reads as broken, whereas "I played a note and got no harmony on it" reads as the
passing tone it probably was.

## The rule that has now bitten four components

**A note-off must release what its note-on sent.**

Change the key, the mode, the voicing or the inversion while a finger is down,
and a re-derived release lets go of pitches that were never started — leaving the
real ones ringing with nothing left that could stop them. So the press
**remembers** what it sent and the release replays it, as a pure reducer, exactly
as in the [Zone Splitter](./zone-splitter.md) and the
[Phrase Sequencer](./phrase-sequencer.md).

## The rule that is specific to this one

**Two fingers can produce the same pitch.**

In C major, C and E are a third apart and their chords overlap: C E G and E G B
share E and G. Play both and G is being held by two keys at once.

Release C naively and you send a note-off for G — silencing a note that E is
still holding. The chord develops a hole in it, and nobody traces that back to
the harmoniser, because it only happens when you play more than one note, which
is most of the time.

So sounding pitches are **reference counted**. A second holder doesn't re-send
the note-on (most synths answer a duplicate by retriggering the envelope
mid-chord), and the note-off goes out when the **last** holder lets go:

```js
press(C)   // → on C, on E, on G
press(E)   // → on B only. E and G are already sounding.
release(C) // → off C only. E and G are still held by E.
release(E) // → off E, off G, off B
```

That's the test that matters most in this component.

## Voicing

**Inversion** lifts the lowest voice up an octave, one per step — the way an
inversion actually works, rather than rotating the list and hoping.

**Open** lifts the middle voice an octave, which is what opens the sound.
**Drop 2** drops the second voice from the top. Both need at least three notes,
and with fewer they do nothing rather than something arbitrary.

A voice that lands outside 0–127 is **dropped, not clamped**. Clamping stacks
strays onto one pitch, which sounds like a stuck key rather than like nothing.

## Velocity

`0` follows the velocity you played; anything else is fixed — an organ-like part
that ignores how hard you hit it. One number rather than a flag plus a number,
which could disagree with each other.

## Display

A keyboard that **fits what is sounding** rather than a fixed range, so a wide
voicing isn't cropped. The key you pressed and the notes the harmoniser added are
drawn in **different colours** — telling those apart is the one thing this
display exists for.

The header names the chord. With two fingers down there are two chords and no
single name, so it names the lowest and says `+1`: the useful lie rather than a
blank.

Clicking a key auditions it, because most of the editor's life is spent with no
keyboard plugged in.

## Compatibility

Any synth that responds to MIDI notes, on the `mainSynth` device role. Unlike the
[Phrase Sequencer](./phrase-sequencer.md) it generates nothing of its own, so it
needs a MIDI **input** selected to do anything in a live rig — see
[expression-router.md](./expression-router.md) for the same caveat about input in
an exported Player. The click-to-audition path works without one.

[Panic](./panic.md) releases everything it is holding, using the same reference
counts. Nothing here touches the DPD profile.

## Driving it from a script

A harmoniser fixed to one key only works for songs in that key, so the whole
config is reachable — through the same pure reducer the inspector uses:

```lua
harmonyKey("Harm", 5)              -- move it to F
harmonyScale("Harm", "dorian")
harmonyMode("Harm", "memory")
harmonyShape("Harm", "min7")       -- a preset name, or a list of semitones
harmonySize("Harm", 4)             -- triads → sevenths
harmonyVoicing("Harm", "drop2")
harmonyInversion("Harm", 1)
harmonyOctave("Harm", -1)
harmonyOutOfKey("Harm", "mute")
harmonyKeepPlayed("Harm", false)   -- harmony only
harmonyChannel("Harm", 3)
```

Pair it with the [Setlist](./setlist.md) and each scene can carry its own key —
which is most of the reason to want this at all.

The key **wraps** rather than clamping: twelve steps of one semitone come back to
where they started instead of piling up on B.

An unknown shape preset is a **no-op**, deliberately unlike the inspector's
dropdown, which falls back to the first preset because it has to show something.
A script typo should not quietly rewrite your chord shape.

Everything else follows the house rules: bad arguments are no-ops with a trace
line rather than throws, only changed fields are written, and the command is
portable but not export-safe.

## What it doesn't do

- **No per-degree chord overrides.** Diatonic mode stacks thirds; you cannot say
  "the vi should be a sus4". The Chord Pad is the component for arbitrary chords
  you choose one by one.
- **No inversion following.** It does not pick the inversion that moves least
  from the last chord — good voice leading is a genuinely harder problem than it
  looks and a bad automatic answer is worse than none.
- **No strum.** The Chord Pad has one; here every voice starts together.
- **It harmonises notes, not expression.** Pitch bend and aftertouch arriving on
  the input pass through untouched rather than being applied to each voice.
