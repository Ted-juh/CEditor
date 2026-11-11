# Tasty Chips device profiles

The GR-2 and GR-MEGA granular synthesizers, read from the MIDI Command Table of each manual, which
Tasty Chips links from each instrument's support page (`https://www.tastychips.nl/gr-2-support-page/`,
`https://www.tastychips.nl/gr-mega-support-page/`). The table is "Generated from src/midi.rs enum Nrpn
(firmware 1.8.0)", and both manuals print it whole. As with the other brands, the manuals are not
committed: what is committed is what was read from them, with each file's name, SHA-256 and where to
get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| GR-2 | GR-2 Manual 1.8.f (170 pp), pp. 132 - 153 | the **MIDI Command Table** (`CC #  Name  Description  Range / notes  Curve`): 472 rows, the controllers 0 - 127 and the NRPNs above 127 up to 1154, with value names and curves; then the rate divisions (33), mod sources (24) and modulation destinations (165). No SysEx. **Built.** |
| GR-MEGA | GR-Mega Manual 1.8.d (179 pp), pp. 141 - 161 | the same table, broken over the same pages; 27 mod sources and 149 destinations. **Built.** |
| GR-1 | User manual 3.4.c (106 pp), pp. 89 - 94 | an older table, CC 1 - 117 and NRPN-only numbers to 217, with curves. Not built yet. |
| ST-4, SawBench, Arduino Piggyback | web pages | 44, 20 and 6 controllers. Not built yet. |
| Integral, ECR-1 | manuals | no parameter map (preset recall only; no MIDI). |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-gr-table.mjs` | The table from the PDF's word positions. Its cells are bottom-aligned: a cell that wraps puts its first lines above the row's number, which sits on its last, so the lines between two numbers are the second row's. Where a page breaks a row, its last lines land at the top of the next page, where they look exactly like the next row's first: they go to whichever row keeps every line break in each of its cells one that wrapping would make (the next word did not fit), the next row's where both do. Labels set across the range column between rows (`NRPN-only (> 127)`, `Macros` …) are sections, which the layout names. And the three tables after it. |
| 2 | `import-tastychips.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, its pages, the section labels, the rows that are the other model's. |
| 4 | `build-tastychips-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/tasty-chips-gr-*.ceditor-device.json`. |

Both manuals break the table over the same pages and read the same, which the tests check: the page
breaks were also worked through by hand (row 35's curve `see Rate` / `divisions table)`, CHORUS /
CENTER, LARGE REVERB DRY / WET, INVERT PITCH ENV) before the rule was trusted.

## What the builder takes as settled

- **A row 0 - 127 is that control change; one above 127 is that NRPN.** An NRPN's value is the 7-bit
  value its range prints, on CC 6 alone: the manual says NRPNs take "the normal 7 bit MIDI values, but
  also use 14 bit values if necessary", and does not say how a printed range maps onto 14 bits. A
  range past 127 (the scan positions' `0–16383`, the sequencer slew's `0–1000 ms`) goes out as 14 bits.
- **Values:** named one each (`0: disable, 1: enable, 2: enable & focus`), bands (`<64: OFF, ≥64: ON`),
  and the manual's own tables (`See Mod sources table`, `See Mod destinations table`, the rate
  divisions for `rate division index`) are choices; a range of numbers is that range; anything else
  (a unit, a sweep, `−1.0 … 0.0 … +1.0`, nothing printed: 327 rows) is sent 0 - 127, the printed range
  and curve in its description.
- **A controller reaches 0 - 127**, so CC 82's list of destinations stops at 127; the rest (128 - 164
  on the GR-2) are named in the profile.
- **Left out, and named:** MIDI's own messages (bank change, data entry, NRPN and RPN selection, the
  channel mode messages), the performance controllers (mod wheel, sustain, MPE timbre), an action
  (`Toggle (value ignored)`), and on the GR-2 the two rows marked GR-MEGA only.
- The manual's NRPN example (parameter 2 as "sample position", 16181) is the GR-1's; in this table 2
  is Pitchbend range, so it is not used.

## The profiles

| Profile | Rows | Parameters | Choices |
| --- | ---: | ---: | ---: |
| `tasty-chips-gr-2` | 472 | 451 | 40 |
| `tasty-chips-gr-mega` | 472 | 453 | 42 |

## Not done

- **What a printed sweep's 0 - 127 means** for the 327 rows sent 0 - 127, and whether an NRPN-only
  row wants 14 bits: the instrument would say.
- **The GR-1** and the older instruments' pages.
