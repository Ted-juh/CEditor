# Tasty Chips device profiles

The GR-2 and GR-MEGA granular synthesizers, read from the MIDI Command Table of each manual, which
Tasty Chips links from each instrument's support page (`https://www.tastychips.nl/gr-2-support-page/`,
`https://www.tastychips.nl/gr-mega-support-page/`). The table is "Generated from src/midi.rs enum Nrpn
(firmware 1.8.0)", and both manuals print it whole. And the GR-1, whose user manual (the last of
those on `https://www.tastychips.nl/gr-1-support/`) prints an older table of another shape, and the
ST-4 and the Arduino Piggyback, whose web manuals (linked from `https://www.tastychips.nl/legacy-products-2/`)
each give a table of controllers. A web manual is a live page: its profile records the day it was
saved (11 November 2026). As with the other brands, the manuals are not
committed: what is committed is what was read from them, with each file's name, SHA-256 and where to
get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| GR-2 | GR-2 Manual 1.8.f (170 pp), pp. 132 - 153 | the **MIDI Command Table** (`CC #  Name  Description  Range / notes  Curve`): 472 rows, the controllers 0 - 127 and the NRPNs above 127 up to 1154, with value names and curves; then the rate divisions (33), mod sources (24) and modulation destinations (165). No SysEx. **Built.** |
| GR-MEGA | GR-Mega Manual 1.8.d (179 pp), pp. 141 - 161 | the same table, broken over the same pages; 27 mod sources and 149 destinations. **Built.** |
| GR-1 | User manual 3.4.c (106 pp), pp. 89 - 93 | an older table (`MIDI msg.  GR-1 parameter  Command / CC  Value  Range/description  Control curve`): 178 rows, CC 1 - 117 and NRPN-only numbers to 217, with curves. **Built.** |
| ST-4 | ST4 user's manual (web page), "MIDI commands" | 43 rows: the controllers for each track on its channel (1 - 4), for all tracks on channel 5, or both (`chan + glob`), and the messages that are not settings. **Built.** |
| Arduino Piggyback | synthesizer manual (web page), "MIDI in" | 6 controllers with what their values mean. **Built.** |
| SawBench | product page | "MIDI controls of all digital features", no table. Not built. |
| Integral, ECR-1 | manuals | no parameter map (preset recall only; no MIDI). |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-gr-table.mjs` | The table from the PDF's word positions. Its cells are bottom-aligned: a cell that wraps puts its first lines above the row's number, which sits on its last, so the lines between two numbers are the second row's. Where a page breaks a row, its last lines land at the top of the next page, where they look exactly like the next row's first: they go to whichever row keeps every line break in each of its cells one that wrapping would make (the next word did not fit), the next row's where both do. Labels set across the range column between rows (`NRPN-only (> 127)`, `Macros` …) are sections, which the layout names. And the three tables after it. |
| 1 | `read-gr1-table.mjs` | The GR-1's table from the PDF's word positions: its header over three lines; a row a line with a number, a run of them (`140-143`) or `-` in the Command column; a cell that wraps set vertically centred on its row (`cubic` above `Attack time`, `(special)` below), so a line without a number is the nearest row's on its page. |
| 1 | `../twisted/read-twisted-page.mjs` | A web manual's tables, each under the heading above it; the ST-4's header is its first row. |
| 2 | `import-tastychips.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, its pages, the section labels, the rows that are the other model's; the GR-1's form. |
| 4 | `build-tastychips-profile.mjs`, `build-gr1-profile.mjs`, `build-page-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/tasty-chips-*.ceditor-device.json`. |

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

## What the GR-1 builder takes as settled

- **A CC row 0 - 127 is that control change; one above 127 is that NRPN**, its value on CC 6 alone, as
  for the GR-2: the manual's "Precision MIDI" page says the modulation matrix "also uses CC's that are
  only available as NRPN". A run (`Scan part 1..4  140-143`) is a row for each part.
- **Values:** named one each over the whole range (`0:SINE, 1:RAND, 2:SAW, 3:SQR`) or as bands (`0:OFF,
  >0:ON`) are choices; a list that stops short (the destinations' `0:TUNE, … 5:CUTOFF, ..` over 0 -
  10) is the range, the list in the description. A sweep in numbers on a linear row (`-1.0 .. +1.0`) is
  shown so; `Part number = value + 1` and the clock multipliers' and dividers' `- 1` are shown one up.
- **Left out, and named:** pitch bend, program change, the notes and the timing messages; MIDI's own
  controllers; the performance ones (mod wheel, sustain, note pressure, MPE timbre); recording.

## What the web-manual builder takes as settled

- **A `cc` row is its controller.** The ST-4's channel column says where: `chan` on each track's
  channel (1 - 4), `glob` on channel 5, which the page calls all tracks, `chan + glob` on both, a
  parameter for each. The page does not say on which channel a command that is only global goes; it
  is sent on channel 5. The Piggyback's on the channel variable (1, "changed by a single constant" in
  its sketch).
- **A value printed as a mapping** (`0..127 → -64..+63`, `0=0.0s .. 127=4.0s`) is shown so.
- **The ST-4 page gives CC 11 to two rows**, vca sustain and record sample; the first is laid out, the
  second is an action and left out, and the profile says so. Its vco mod is CC 0, laid out as printed.
- **Left out, and named:** pitch bend, program change, the beat clock and record sample.

## The profiles

| Profile | Rows | Parameters | Choices |
| --- | ---: | ---: | ---: |
| `tasty-chips-gr-2` | 472 | 451 | 40 |
| `tasty-chips-gr-mega` | 472 | 453 | 42 |
| `tasty-chips-gr-1` | 178 | 161 | 6 |
| `tasty-chips-st-4` | 43 | 141 | 0 |
| `tasty-chips-arduino-piggyback` | 6 | 6 | 0 |

## Not done

- **What a printed sweep's 0 - 127 means** for the 327 rows sent 0 - 127, and whether an NRPN-only
  row wants 14 bits: the instrument would say.
- **The SawBench**, whose page names no controllers.
