# Arpeggiator — the pattern engine on top of the notes

> Status: **shipped 🟢**. The second member of the note-playing family the
> [Chord Pad](./chord-pad.md) opened up. Part of the
> [panel parts backlog](./README.md).

## What it is

A lane of step cells. It takes a set of held notes and walks them one at a time
on the clock — up, down, up–down, down–up, as played, random, or the whole chord
as a block — spread across octaves, with a gate length, swing, and an optional
Euclidean rest pattern. The playhead lights the step that's sounding; each cell
prints its note.

Three ways to feed it:

- **Its own chord** — pick a key, scale and degree; it always has something to
  play, so it works as a standalone motif generator.
- **A linked Chord Pad** — it follows whatever pads that Chord Pad is holding.
  The pad then **goes silent** and lights up as usual while the arp does the
  playing, so you get a pad-triggered arpeggiator without hearing the block
  chord underneath. **Latch** keeps it running after you let go.
- **Incoming MIDI notes** — hold keys on an external keyboard and the arp runs
  them. See [note-input-echo.md](./note-input-echo.md).

## How it works

- **Pure engine** `utils/arpLayout.js` (+ `test/arpLayout.test.js`, 13 tests).
  It **reuses the Chord Pad's scale engine** (`SCALES`, `degreeChord`,
  `chordNotes`, `useFlats`) for its own chord, so spelling and voicing stay
  consistent across both controls. Every step in a sequence is a `number[]`, so
  block-chord mode shares one shape with the single-note patterns.
  - `orderNotes` — up-down / down-up don't repeat the endpoints (60 64 67 64,
    not 60 64 67 67 64).
  - `euclid(steps, pulses, rotation)` — a Bresenham spread, the standard stable
    Euclidean rhythm, as a rest mask.
  - `stepFires` — a **hand-mute wins over the Euclidean mask**; click a step in
    preview to toggle it.
  - `swingDelay` — delays the odd steps by up to half a step.
  - `gateSeconds` / `stepSeconds` — note length as a fraction of the step, never
    zero-length.
- **`ArpRenderer.svelte`** — the step lane. Block height tracks pitch, so the
  shape of the walk reads at a glance. Euclidean rests go dark; hand-mutes get a
  strike, so the two kinds of silence look different. A header strip shows the
  pattern, the source (with a `Linked · idle` state) and the rate.
- **Model** — `Arp` controlType + section. Like the Chord Pad it has **no
  `DeviceBindings`**: it plays notes, so there's nothing to bind to a parameter.
- **Clock + note output** (`PanelPreviewSurface`) — it rides the same shared rAF
  ticker the modulators use (self-stopping when nothing is running) and the same
  `triggerRawMidiAction` note path the Chord Pad built. Each fired step sends
  note-on for its notes and schedules the matching note-off a gate later; swing
  delays the odd steps. Stopping, or the source going empty, sends note-off for
  everything still ringing.
- **`ArpEditor.svelte`** — source + Chord Pad picker, pattern, key/scale/degree/
  chord type/octave, rate, octaves, gate, swing, latch, velocity, channel, the
  Euclidean settings with a live `● · ● ● ·` preview, the hand-mute list with a
  clear button, and appearance colours. A live readout spells the walk it will
  play.

## Compatibility

Any synth that responds to MIDI notes — all of them — provided a hardware output
is selected on the `mainSynth` device role. Like the Chord Pad it doesn't touch
the DPD profile at all.

One practical note: fast rates with a long gate stack overlapping notes, so on a
**limited-voice** synth prefer `gate < 1`. At `gate = 1` the arp is effectively
legato and each note runs into the next.

## Possible next steps

- ~~**Tempo sync**~~ — **done**. Turn on *Timing → Sync to transport* and the
  rate field becomes a note division locked to the panel's
  [Transport](./transport.md). The step index is derived from the transport's
  *position*, not from a rate, so a synced arp resumes mid-bar where the bar
  says it should and never drifts against anything else on the clock.
- **Per-step velocity / accent** — a second row you can paint, like the Turing
  Modulator's bars.
- **Ratchets** — repeat a step N times inside its slot.
- **Chord Pad note-order input** — an `asPlayed` order that reflects the actual
  press order rather than pitch order.
- **More link sources** — the [Ribbon Keyboard](./ribbon-keyboard.md) holds a
  note too; it could feed the arp the same way a Chord Pad does. (An external
  keyboard already can — see [note-input-echo.md](./note-input-echo.md).)
