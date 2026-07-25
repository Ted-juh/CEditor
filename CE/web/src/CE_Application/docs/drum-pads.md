# Drum Pads — a grid of fixed-note triggers

> Status: **shipped 🟢**. The fourth member of the note-playing family, after the
> [Chord Pad](./chord-pad.md), the [Arpeggiator](./arpeggiator.md) and the
> [Ribbon Keyboard](./ribbon-keyboard.md). Part of the
> [panel parts backlog](./README.md).

## What it is

The MPC / Push idiom: a grid where **every pad is pinned to one note**. That's
the difference from the Chord Pad, which *computes* its notes from a key and a
scale. Here the mapping is fixed and explicit, which is what a drum kit, a
sampler's key map, or any set of trigger notes actually needs.

Three maps: the **GM drum kit** (named from the General MIDI percussion table,
with the hi-hat choke group set up for you), **chromatic** (labelled by pitch),
or **custom**. Any pad can be re-pointed, renamed and recoloured on its own.

## The two things a drum grid needs that a chord grid doesn't

- **Choke groups.** Pads sharing a non-zero group number cut each other, so a
  closed hi-hat silences a ringing open one — the single most audible detail in
  a drum map. The GM map wires 42 / 44 / 46 into group 1 by default; a small
  numbered badge on the pad shows which group it's in.
- **Velocity from the strike position.** Hit near the top of a pad for a harder
  note, the bottom for a softer one. It's the closest a mouse gets to dynamics,
  and it's off by default (fixed velocity) so it never surprises you.

## How it works

- **Pure engine** `utils/drumPadLayout.js` (+ `test/drumPadLayout.test.js`,
  9 tests): the GM percussion table with short pad-sized labels, pad resolution
  with sparse per-pad overrides, grid geometry with hit-testing, strike-height →
  velocity, and choke resolution.
  - **Pad 1 sits bottom-left by default** — where your left thumb lands on
    hardware — with `topLeft` available for plain reading order. Both directions
    are covered by a round-trip test, because getting this backwards is an easy
    and very confusing bug.
  - **Overrides are sparse and index-aligned**, so renaming one pad doesn't mean
    hand-writing all sixteen. Anything omitted falls back to the generated map.
- **`DrumPadsRenderer.svelte`** — the grid, with each pad's accent stripe (its
  own colour or the section default), drum name, MIDI note, choke badge, and a
  glow on whatever is sounding. Labels and note numbers drop out automatically
  as the pads get small rather than overflowing.
- **Model** — `DrumPads` controlType + section. **No `DeviceBindings`**: it plays
  notes. Default channel is **10**, the GM percussion channel.
- **Output** (`PanelPreviewSurface`) — three trigger modes: **momentary** (held
  while pressed), **one-shot** (a short fixed gate, which is what a sampler
  wants), and **toggle**. Dragging across the grid strikes each pad you cross —
  the finger-roll gesture. A hit chokes its group-mates first, then restrikes
  cleanly if the pad was already sounding.
- **`DrumPadsEditor.svelte`** — grid size, map, base note, origin, channel,
  trigger mode and gate, velocity source, plus a **per-pad table** (label, note,
  choke group, colour) with a reset button per row and one for the lot.

## Compatibility

Any synth, sampler or drum machine that responds to MIDI notes. It doesn't touch
the DPD profile — notes are notes. The GM names are a *labelling* convenience:
if your device uses a different drum map, set the map to Custom (or Chromatic)
and rename the pads. The notes sent are always exactly what each pad shows.

## Possible next steps

- **Note input echo** — light the pads from incoming MIDI, so the grid doubles
  as a monitor for what a sequencer is playing.
- **Per-pad channel** — for multi-timbral rigs where the kick and the snare live
  on different channels.
- **Velocity layers** — a second row of pads, or a modifier, for accent hits.
- **Pad banks** — A/B/C/D pages of sixteen, the hardware convention.
- **Step-sequence a pad** — the [Turing Modulator](./turing-modulator.md)'s gate
  output could trigger one, which would make the panel a drum machine.
