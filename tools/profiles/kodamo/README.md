# Kodamo device profiles

The MASK1 (and the MASK1 EX and EX mk2, whose pages link the same manual), read from the MIDI
implementation at the end of its user manual, which Kodamo links from `https://kodamo.org/mask1` (the
file under `https://kodamo.org/downloads/`). As with the other brands, the manual is not committed:
what is committed is what was read from it, with the file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| MASK1, MASK1 EX, EX mk2 | Kodamo MASK1 User Manual (49 pp), pp. 39 - 42 | the **MIDI implementation**: 82 controllers, 73 of them mapped to a named voice parameter (`Mapped to Filter > CUTF`), a few with a centre (`middle is 64`) or a range (the mask's 512 values as four controllers of 128); the channel mode messages; SysEx messages named without their format. Four parts on four channels from the base channel. **Built.** |
| MASK1 EX, EX mk2 | quick start guides | "All parameters are CC-mapped (see full user manual)". |
| EssenceFM | web manual | about 19 controllers (performance select, effects); the sound's parameters have no fixed controller. Not built. |

Kodamo's firmware notes add controllers the manual does not list (CC 16, 17, 58 - 63 among them).

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-kodamo-manual.mjs` | The controllers from `pdftotext -layout`: `CC n  Name  Remark`, a remark going on below, the list ending at `Other CCs`. |
| 2 | `import-kodamo.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, where it is linked from, the pages. |
| 4 | `build-kodamo-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/kodamo-*.ceditor-device.json`. |

## What the builder takes as settled

- **A controller mapped to a voice parameter is that parameter**, 0 - 127 on the channel variable (the
  part), grouped by the page it names; `middle is 64` is its default. CC 10's pan, which no page shows,
  is laid out too.
- **Lists without values** (filter mode, LFO wave and destination, play mode, FX and arp type) are sent
  0 - 127: the manual names the settings in its chapters but not the controller values for them.
- **Left out, and named:** bank select, the mod wheel and sustain pedal, and the channel mode messages.

## The profiles

| Profile | Parameters |
| --- | ---: |
| `kodamo-mask1` | 73 |

## Not done

- **The controllers the firmware notes add**, which an updated manual would list.
- **Read-back.** The SysEx voice messages are named without their format.
