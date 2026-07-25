# Note input echo — the note controls become monitors

> Status: **shipped 🟢**. Not a component: one shared mechanism that gives every
> member of the note-playing family a second job. Part of the
> [panel parts backlog](./README.md).

## What it is

The [Chord Pad](./chord-pad.md), [Arpeggiator](./arpeggiator.md),
[Ribbon Keyboard](./ribbon-keyboard.md) and [Drum Pads](./drum-pads.md) all
**send** MIDI notes. Echo makes them **read** them too: switch it on and the
control lights up from whatever is arriving on the hardware MIDI input.

Four features, one mechanism:

| Control | With echo on |
|---|---|
| Chord Pad | A **chord analyser**. A pad lights when *every* one of its notes is sounding, so an incoming triad names itself on the circle of fifths. The piano strip shows the raw pitches. |
| Ribbon Keyboard | A **pitch monitor** — the matching zones outline as notes arrive. |
| Drum Pads | A **sequencer monitor** — see which drum a pattern is hitting, with the GM name attached. |
| Arpeggiator | A **keyboard-fed arp**: set its note source to *Incoming MIDI notes* and hold keys on an external keyboard to drive it. |

Echoed notes are always drawn as a **green outline**, never as a fill, so
external play can't be confused with what you pressed yourself. Both can show at
once — a locally struck pad and an incoming one sit side by side and read
differently.

## How it works

There was already an unused pipe. The JUCE side has always emitted
`midiInputMessage` for every non-SysEx byte it receives, and
`stores/deviceProfiles.js` has always parked the latest one in
`latestMidiInputMessage` — **with no consumers at all**. This is the consumer.

- **Pure engine** `utils/midiNoteInput.js` (+ `test/midiNoteInput.test.js`,
  14 tests). Raw bytes in, held-note state out (and, for the
  [Expression Router](./expression-router.md), continuous-controller levels):
  - `parseMidiHex` takes the bridge's `"90 3C 60"` and the shapes humans write.
  - `splitMidiMessages` handles **running status** (hardware drops the repeated
    status byte on a fast run — without this a chord arrives as one note plus
    garbage), skips SysEx wholesale, and drops realtime clock bytes so they
    can't be mistaken for data.
  - `noteEvent` treats **note-on with velocity 0 as a note-off**, which is how
    most hardware releases a key, and understands CC 120/123 (all sound / all
    notes off) and system reset.
  - The reducer is pure and **returns the same object when nothing changed**, so
    a stream of duplicate messages causes no re-renders.
  - The same pitch on two channels stays distinct, but display dedupes it.
- **`stores/noteInput.js`** — one listener for the whole app (notes are global;
  four controls watching the same stream should agree about it). It's started
  lazily by the preview surface, so importing the module headless never attaches
  anything.
- **Wiring** — `echoNotesFor()` in `PanelPreviewSurface` returns `[]` when a
  control has echo off, so the common case costs nothing and the store isn't
  even read.

## Caveats

- **Needs a MIDI input selected** on a device role — the same requirement as the
  Dump Analyzer. No input, no echo.
- **Omni by default.** Each control has its own channel filter (0 = omni), so a
  drum grid can watch channel 10 while a chord pad watches everything.
- **A stuck note stays lit.** If a keyboard is unplugged mid-note its note-off
  never arrives, and MIDI has no way for us to know. Leaving preview clears the
  echoed state; within a session, an all-notes-off (CC 123) from the device
  clears it too.
- Echo is **display only** — it never re-sends anything, so it cannot create a
  MIDI loop.

## Possible next steps

- **A panic control** — a panel button that clears both the echoed state and any
  notes the panel itself is holding.
- **Velocity in the echo** — the held state already carries velocity; the
  renderers currently ignore it and could vary brightness.
- ~~Feed the other controls~~ — **done**: the same listener now drives the
  [Expression Router](./expression-router.md)'s mod-wheel / aftertouch / breath /
  expression / foot / velocity sources. The parser gained a second reducer for
  continuous controllers, kept in a separate store so a CC sweep never
  re-renders the note displays.
