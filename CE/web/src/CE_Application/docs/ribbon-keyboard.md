# Ribbon Keyboard — a strip of pitch

> Status: **shipped 🟢**. The third member of the note-playing family the
> [Chord Pad](./chord-pad.md) opened up, after the
> [Arpeggiator](./arpeggiator.md). Part of the
> [panel parts backlog](./README.md).

## What it is

A strip you slide along to play pitch. Not a keyboard with gaps between the
notes — a continuous surface, which is what makes it worth having alongside one.

Three modes, one strip:

- **Scale snap** *(default)* — only in-key notes exist, one wide zone each. You
  physically cannot play a wrong note, and sliding is a legato run up the scale.
  This is the mode that makes a mouse or trackpad genuinely playable.
- **Chromatic** — every semitone. Out-of-key ones sink and darken, so the strip
  still reads as a keyboard rather than a row of identical cells.
- **Glide** — continuous pitch via **MIDI pitch bend**. The gesture a keyboard
  can't make: the Trautonium / ondes Martenot slide, portamento you steer with
  your hand rather than a rate knob. The header reads out cents as you move
  between the frets.

The **cross axis** is a second expression dimension: the short axis of the strip
can send a CC (mod wheel by default, or 74 for cutoff), standing in for the
pressure a real ribbon senses. It can also set note velocity from where you
land.

## How it works

- **Pure engine** `utils/noteRibbonLayout.js` (+ `test/noteRibbonLayout.test.js`,
  13 tests). Reuses the Chord Pad's scale engine and note bytes, so key spelling
  matches across the note-playing family (C minor spells E♭, not D♯).
  - `ribbonZones` — scale-snap keeps only in-key notes; chromatic and glide keep
    every semitone flagged in/out of scale.
  - `positionAlong` / `positionAcross` — pitch axis and expression axis, with
    **vertical strips running low-at-the-bottom** and the cross axis flipping to
    match.
  - `bendValue` — 14-bit bend, centred at 8192, saturating at the bend range.
  - `glideStep` — holds one sounding root and bends to the exact pitch, and
    **retriggers on a new root only when the finger travels past the bend
    window**. See the caveat below.
  - `touchLabel` — the note, plus the cents offset while gliding.
- **`NoteRibbonRenderer.svelte`** — the strip, with root zones accented so the
  octaves are findable, in-key stripes, note names that drop out automatically
  when the zones get too narrow, a touch rail with a bubble, and a bead on the
  expression axis. The header sheds its middle label on narrow (vertical) strips
  rather than overlapping itself.
- **Model** — `NoteRibbon` controlType + section. Like the Chord Pad and the Arp
  it has **no `DeviceBindings`**: it plays notes.
- **Output** (`PanelPreviewSurface`) — press to sound, slide to change pitch,
  release for note-off. Discrete modes retrigger legato only when the zone
  actually changes, so a slow slide doesn't machine-gun note-ons. Glide streams
  pitch bend, **rate-capped to ~50 Hz and change-filtered**, the same discipline
  the self-running modulators use. Releasing always recentres the bend, so the
  ribbon never leaves the synth detuned.
- **`NoteRibbonEditor.svelte`** — mode, orientation, key/scale, lowest note and
  span (with a live `C3 → C5 · 15 zones` readout), bend range, velocity and its
  source, channel, latch, the cross-axis CC, and appearance colours.

> **Naming note:** the existing `Ribbon` control is the *touch-strip parameter*
> control (a mod-wheel-like value source). This one is `NoteRibbon` — it plays
> notes. They are different components and both are in the palette.

## Compatibility

Notes and CC work on any MIDI synth. **Glide mode has one real caveat**: pitch
bend only reaches ±the synth's bend range, so the `Bend range` setting **must
match what the synth is configured for** or the slide will be the wrong
distance. At the near-universal default of ±2 semitones a glide retriggers every
couple of notes; raise it on both sides (many synths allow ±12 or ±24) for long
unbroken slides. The component does **not** try to set the synth's bend range
for you over RPN — too many devices ignore or mis-handle it.

## Possible next steps

- **RPN bend-range send** — an opt-in button that transmits RPN 0 to try to set
  the synth's range to match, for the devices that honour it.
- **MPE mode** — one channel per touch, which removes the retrigger problem
  entirely on MPE-capable synths.
- **Multi-touch** — real touch hardware can hold two points on the strip.
- **Feed the Arpeggiator** — the Arp's `link` source currently accepts a Chord
  Pad; a held ribbon note could feed it too.

The strip can also **echo incoming MIDI** as a pitch monitor — see
[note-input-echo.md](./note-input-echo.md).
