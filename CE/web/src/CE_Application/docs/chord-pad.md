# Chord Pad — play the synth from the panel

> Status: **shipped 🟢**. A **new category**: every other native control here
> modulates *parameters*; this one emits **MIDI notes**. The panel stops being
> only a control surface and becomes an instrument. Part of the
> [panel parts backlog](./README.md).

## What it is

Pick a **key** and **scale**; the pads auto-fill with the in-key chords (or scale
notes). Tap to play, hold to sustain, slide across pads for a legato progression.
A piano strip shows exactly what's sounding.

Two layouts share one engine:

- **Wheel (default) — the circle of fifths.** Majors on the outer ring, each
  **relative minor tucked inside**. The in-key chords light up as **one connected
  wedge**, so the **V is one step clockwise** and the **IV one step
  anti-clockwise** — the two commonest moves are physical neighbours. Everything
  outside the wedge is a **borrowed chord**, one step away. This is why the wheel
  is the better default for *playing*.
- **Grid** — one pad per scale degree, compact, in-key only.

## How it works

- **Pure engine** `utils/chordPadLayout.js` (+ `test/chordPadLayout.test.js`,
  16 tests): scales → diatonic chords by **stacking scale thirds** (so it works
  for any 7-note mode), chord-quality classification (maj/min/dim/aug/7ths),
  **roman numerals spelled against the major scale** so borrowed degrees read as
  ♭III / ♭VI / ♭VII, flat-vs-sharp spelling chosen from the *relative major*
  (C minor spells E♭, not D♯), voicings (close / spread / drop-2) + inversions,
  and pitch-class → **MIDI note number** resolution. Plus both geometries
  (grid cells, circle-of-fifths slots) with hit-tests, and pure note-on/off byte
  building.
- **Conventional wheel spelling** — the flat side always reads G♭ D♭ A♭ E♭ B♭ F
  (never F♯ C♯ G♯), matching a printed circle of fifths, whatever the key.
- **`ChordPadRenderer.svelte`** — draws either layout from the same data: lit
  wedge, held-pad glow, roman numerals placed *outside* their ring so the two
  rings never collide, and the sounding-notes piano strip.
- **Model** — `ChordPad` controlType + section. Note the sections list has **no
  `DeviceBindings`**: it plays notes, so there's nothing to bind to a parameter.
- **Note output** (`PanelPreviewSurface`) — the genuinely new path. Pressing a pad
  sends **note-on** for each chord tone (optionally **strummed** by N ms),
  releasing sends **note-off**; notes go out as raw MIDI via the same
  `triggerRawMidiAction` bridge the scripting runtime uses, on the `mainSynth`
  role. **Latch** keeps pads ringing; sliding across pads re-triggers legato.
  Note-off only silences notes no *other* held pad is still sounding.
- **`ChordPadEditor.svelte`** — layout, mode, key, scale, chord type, voicing,
  inversion, octave, velocity, channel, strum, latch, display toggles, a live
  preview of what the pads spell, and appearance colours.

## Compatibility

Works with any synth that responds to MIDI notes — which is **all of them** — as
long as a hardware output is selected on the `mainSynth` device role (the same
requirement as the scripting runtime's MIDI out). Unlike the parameter controls,
it does **not** depend on the DPD profile at all: notes are notes.

## Why this unlocks a family

The note-output path is the expensive part, and it now exists. An **Arpeggiator**
(hold notes → pattern on the clock), a **Ribbon keyboard** (continuous pitch with
scale-snap), and a **Strum pad** all reuse it plus the scale engine — each is
cheap from here.

Three of those now exist: the **[Arpeggiator](./arpeggiator.md)** (link a pad to
it and the pad goes silent while the arp plays its held notes), the
**[Ribbon Keyboard](./ribbon-keyboard.md)** (continuous pitch with scale-snap
and glide) and the **[Drum Pads](./drum-pads.md)** (fixed-note triggers with
choke groups).

## Possible next steps

- **Velocity from tap position** (top of pad = harder) and **humanize** jitter.
- **Per-pad overrides** — pin a custom chord, rename, recolour.
- **Note input echo** — light the pads from incoming MIDI so it doubles as a
  chord *analyser*.
