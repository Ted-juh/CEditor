# Alesis device profiles

The Alesis A6 Andromeda, read from the **A6 Midi Sysex Specification** that Alesis still links from
the instrument's page (`https://www.alesis.com/products/view/a6-andromeda`, the file
`https://www.alesis.com/rscdn/1571/documents/a6syx.pdf`, 38 pages, printed 5/23/02). As with the
other brands, the specification is not committed: what is committed is what was read from it, with
the file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| A6 Andromeda | A6 Midi Sysex Specification (`a6syx.pdf`) | the SysEx opcodes (program, mix and global dumps and their requests, bank requests, mode select, **MIDI Editing**); the program, mix and global data formats byte by byte; the Device Inquiry reply; and the **SYSEX AND NRPN PARAMETER CHART** (pages 18 - 38, dated 07/12/2001): 1,042 indices, each a parent page and child ID, whether it is an NRPN, and for SysEx its default and range. **Built.** |
| A6 Andromeda | Reference Manual, A6 notes (OS 1.40.01) | the panel's MIDI pages, and NRPN control of the panel; neither prints the NRPN value format |
| Fusion 6HD / 8HD | Reference Manual, Manual Addendum, Quick Start | the MIDI chapters name the controllers a mix answers to, and print no parameter map; not built |
| Micron, Ion, QS series, Akira | the product pages | no MIDI parameter document found on alesis.com; not built |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-a6-chart.mjs` | The chart, as `pdftotext -layout` prints it: one row a line (`Index  Name  Parent  Child  NRPN  Default  Range`), the range `a to b`, `any`, `Depends on effect config` or nothing; `(not used)` indices; the page footers taken out. And a block of the opcodes' section, as printed. |
| 2 | `import-alesis.mjs` | Writes `tables/<name>.json`: the chart's rows, and the MIDI Editing, Mode Select, Device Inquiry and Program Dump blocks. **This is what is committed.** |
| 3 | `synths/a6.mjs` | The layout: the document and the blocks to keep. |
| 4 | `build-alesis-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/alesis-a6-andromeda.ceditor-device.json`. |

## What the builder takes as settled

- **A chart row with a range is a parameter**, sent by the MIDI Editing message (opcode 0E):
  `F0 00 00 0E 1D 0E <parent page> <child ID> <data2> <data1> <data0> F7`. The value is "a 17-bit
  number 2's complement signed number": `<data2>` is `0xxx xyyy`, the mix channel and bits 14 - 16;
  `<data1>` bits 7 - 13; `<data0>` bits 0 - 6. Both engines learned that encoding for this profile
  (`s17-msb-lsb`), the specification's own examples its test vectors. The mix channel is sent as 0:
  in Program mode the A6 ignores it; in Mix mode the edit goes to mix channel 1.
- **The range and default are the chart's** ("Sysex Only Fields"), the default the range's first
  value where the printed one is outside it (24 rows: `1 to 79` with a default of 0, and the like).
  CLOCK TEMPO POT's `60 to 65335` is laid out as printed.
- **The names are the firmware's** (`OSC_1 TUNESEMITONE POT`): the first word the group, the rest the
  name, `POT` and `SWITCH` dropped, underscores as spaces. The chart names no values (a mod source is
  `1 to 79`), so every parameter is a number.
- **Mode** is the Mode Select (opcode 0D), a choice of Program and Mix.
- **Left out, and named in the profile:** the 280 rows whose range is `any` (panel buttons and page
  tabs: a press, not a setting; a button's setting, where it has one, is the POT row beside it); the
  two with no range (OSC_1 and OSC_2 PWMMODDEST); the digital effect's 33 parameters, whose range
  "Depends on effect config"; the unused indices.

## The profile

| Profile | Chart rows | Parameters |
| --- | ---: | ---: |
| `alesis-a6-andromeda` | 1,042 (1,011 in use) | 697 (696 chart rows and Mode) |

## Not done

- **NRPN.** The chart marks most rows NRPN ON, the parent and child the NRPN's MSB and LSB, and the
  A6 sends its panel as NRPNs when its Global PANEL TXMODE says so. Neither the specification nor the
  manual prints the NRPN value format (the chart's ranges are "Sysex Only"), so the profile neither
  sends by NRPN nor follows the panel back. The instrument would say.
- **Pull.** The program, mix and global dumps are printed byte by byte, but in the engine's own
  values (Oscillator 1 Semitone at bytes 958 - 959 is `-32768 to +32767`, where the chart's
  TUNESEMITONE is -60 to 60), and nothing maps one to the other.
- **Mix channels 2 - 16.** `<data2>`'s channel bits share a byte with the value; the engines encode
  the value's three bytes alone, so a channel would need the encoding to take it.
- **The digital effect's parameters**, whose meaning and range depend on the effect configuration:
  the specification prints neither.
