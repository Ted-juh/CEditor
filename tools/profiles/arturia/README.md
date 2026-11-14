# Arturia device profiles

Profiles for Arturia's hardware synthesizers, read from the user manuals on each product's
resources page at `www.arturia.com` (the PDFs themselves on `dl.arturia.net`). As with the other
brands, the manuals are not committed: what is committed is what was read from them, with each
file's name, SHA-256 and address.

## Survey (November 2026)

Arturia's site lists 22 hardware synthesizer products; the colour and edition variants (MicroFreak
Stellar and Vocoder, MiniFreak Stellar and Vocoder, DrumBrute Impact 1984) share their instrument's
manual, and the RackBrute cases and AstroLab keyboards were not read. Eleven English manuals were
downloaded; each has a text layer. Arturia publishes no SysEx format for any of them, and none of
the charts prints values: a controller number and a name is all there is.

| Instrument | Manual | Its chart |
| --- | --- | --- |
| MiniFreak | User Manual 4.0.1, 16.2.5 (PDF pp. 121 - 122) | `Section  Parameter  CC`, the section printed once for the rows under it |
| MicroFreak | User Manual 5.0.1, Appendix D (PDF pp. 146 - 147) | `Parameter  CC number`, no sections |
| MatrixBrute | User Manual 2.0.3, 7.1 (PDF pp. 55 - 58) | a block for each section, `VCO 1 Parameters  MIDI CC  Resolution`, one under another; `7-bit` or `7-bit/14-bit` on every row |
| PolyBrute, PolyBrute 12 | User Manuals 3.0.1 and 3.1.0, 13.1 | three blocks side by side, `VCO 1 Parameter  MIDI CC`, the `CC` and `Parameter` of some titles on the line below; the two charts are the same |
| MiniFreak 49 | User Manual 1.0.0 | none: it says the knobs send controllers and does not list them |
| MiniBrute 2, MiniBrute 2S | User Manuals 1.0 | none: the mod wheel's and transport's assignable controllers only |
| DrumBrute, DrumBrute Impact | User Manuals 1.2 and 1.0 | none: the touch strip's and transport's controllers only |
| MicroBrute | User Manual | none |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-arturia-cc.mjs` | A manual's CC chart → its rows as printed: the block's title or section, the name, the controller, the resolution where printed. Decides nothing. |
| 2 | `import-arturia.mjs` | Writes `tables/<name>.json`: those, with the manual's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the manual, the chart's pages, a group for a chart without sections, a row grouped elsewhere. |
| 4 | `build-arturia-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
node tools/profiles/arturia/import-arturia.mjs minifreak minifreak_Manual_4_0_1_EN.pdf
node tools/profiles/arturia/make-profiles.mjs            # or --check
```

## Reading the chart

The reader works from the words' positions (`pdftotext -bbox`). A header line gives each block its
CC column: `CC`, `CC number`, `MIDI CC`, or `MIDI` alone with `CC` on the line below (the
PolyBrute's). Each CC column ends a block, and the words before it are the block's title (`VCO 1
Parameters` → `VCO 1`); `MIDI` before `Parameter` is a title, the PolyBrute's MIDI block. Where the
words before it are `Section` and `Parameter` set apart (the MiniFreak's), they are a section column
and a name column, and a section printed on one row holds for the rows under it. `Resolution` after
the CC column is a column of its own (the MatrixBrute's).

A line with a number under a block's CC column is a row of that block: its name the words before
the number, its resolution the words after. Blocks side by side are read one after the other. A
header's second line (`Parameter  CC`), a numbered heading (`16.2.5. MIDI Control Change
Messages`), the prose around the chart and the running footer are not rows; the PolyBrute 12's
footer, whose `12` stands under a CC column, is skipped by its words.

## What the builder takes as settled

- **A row is its controller**, sent as a control change on the `channel` variable, grouped under its
  block's title or section (`LADDER FILTER`, `Analog Filter`). The MicroFreak's chart has no
  sections; its layout groups a row by the words its name begins with (`Oscillator`, `Cycling Env`).
- **Every value is the controller's 0 - 127.** The charts print no ranges and no values, so a
  setting chosen from a list (a waveform, an oscillator type, a filter mode) is a number here.
- **The MatrixBrute's `7-bit/14-bit` rows are sent as 7 bits.** The chart prints no controller for
  their fine half and the manual describes no setting for it; each says so in its description.
- **The wheels, ribbon and pedals are left out**: Mod Wheel, Modulation and Sustain under Pedals,
  MIDI or WHEELS, the expression pedals, the PolyBrute's ribbon. An envelope's Sustain is a
  parameter. Where a pedal shares a controller with a knob (the MatrixBrute's expression pedals on
  CC 3 and 4, its macro knobs M4 and M3), the knob is laid out and the notes say so.

Grouped by the layout, and named in the profile: the MiniFreak's Glide (CC 5), its section cell
blank under Pedals' Sustain.

## The profiles

| Profile | Read from | Rows | Parameters |
| --- | --- | ---: | ---: |
| `arturia-matrixbrute` | MatrixBrute User Manual 2.0.3 | 80 | 76 |
| `arturia-microfreak` | MicroFreak User Manual 5.0.1 | 21 | 21 |
| `arturia-minifreak` | MiniFreak User Manual 4.0.1 | 41 | 39 |
| `arturia-polybrute` | PolyBrute User Manual 3.0.1 | 74 | 70 |
| `arturia-polybrute-12` | PolyBrute 12 User Manual 3.1.0 | 74 | 70 |

None reads anything back: Arturia publishes no SysEx format for a sound. A panel follows the
instrument through the controllers it sends when its knobs are turned (where its MIDI settings send
them: the MiniFreak's Knob Send CC, the MIDI Control Center's settings for the others).

## What is left out, and what would read it

| Left out | Where | What would read it |
| --- | --- | --- |
| A value's meaning, and a list setting's values | every profile | each parameter's chapter, in prose; the MicroFreak's Appendix A prints the Speech oscillator's word categories against CC 10 values |
| The MatrixBrute's fine halves | 29 controllers printed `7-bit/14-bit` | the instrument: whether it sends the LSB on CC n + 32, as the MIDI convention has it |
| The MiniFreak 49 | its manual prints no chart | the instrument: its knobs are presumably the MiniFreak's, which the MiniFreak's profile would then serve |
| Everything not on a knob | the sequencer, the mod matrix, the presets | nothing published |
