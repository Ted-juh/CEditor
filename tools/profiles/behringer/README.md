# Behringer device profiles

Profiles for Behringer instruments, read from the quick start guides and manuals Behringer
publishes on each product's page at `www.behringer.com` (the PDFs themselves on
`cdn-media.empowertribe.com`). As with the other brands, the documents are not committed: what is
committed is what was read from them, with each file's name, SHA-256 and address.

## Survey (November 2026)

Behringer's site lists 75 synthesizer products; 67 English guides or manuals were downloaded (the
colour variants of the TD-3, MS-1 and DeepMind share theirs). Each has a text layer; none needs OCR.
Where an instrument's sound can be set over MIDI, the guide prints a table of its controllers, each
guide in its own way:

| Instrument | Document | Its table |
| --- | --- | --- |
| UB-1 Micro | Quick Start Guide, pp. 40 - 41 | `CC Number  Acts on  Range`, two side by side; value bands in the range (`0-63 off, 64-127 on`) |
| JT-4000 Micro | Quick Start Guide, p. 27 | `CC #  Affects`; one value note in a name (`Ring Modulation on/off (0-64 = off / 65 – 127 = on)`) |
| PRO-VS Mini | Quick Start Guide, p. 86 | `CC #  Affects  Range`; FX Engine's bands a line each under it |
| Spice | Quick Start Guide, p. 21 | `CC  Action  Range`; six 14-bit pairs (`VCO 1 Frequency MSB (use with CC 36)`), one list for two sub-oscillators |
| JT Mini, D Mini, AKS Mini | Quick Start Guides, pp. 58 - 59, 47, 56 | `CC Number  Acts on  Range`; Voice Mode's and Octave's bands a line each, around a number set alone |
| PRO-800 | Quick Start Guide V 4.0, pp. 54 - 55 | `CC Num  Hex  Continuous - Coarse  Continuous - Fine tune  Stepped params  MIDI standard`: every controller 0 - 127 in one of four columns, no values |
| JN-80 | Manual, pp. 13 - 14 | `CC Num  Hex  Parameter  MIDI standard`, every controller 0 - 127, no values |
| CZ-1 Mini | Manual, pp. 57 - 59 | `CC NUM  PARAMETERS  VALUES`, the values column empty |
| Wave | Manual, pp. 34 - 41 | `Control #  Range  Function  Transmit  Receive  Remarks`, an NRPN table `MSB  LSB  14-bit  Parameter Name  Range  Notes`, and its SysEx: the preset's 121 bytes, a request for the edit buffer and its answer |
| PolyEight | Manual, pp. 33 - 36 | NRPN mappings (`NRPN  HEX  DESCRIPTION  STORAGE  RANGE`), and its SysEx preset dump |
| DeepMind 12 (and 6, 12D, 12X) | Manual, chapter 17 | NRPN commands; the quick start guides have no table |
| JN-80 (again) | Quick Start Guide | three tables side by side under one header, with values (`0 = Off  64 = On`, `0 = 1/4 Triplet  18 = 1/4 …`) |

The rest print no controller table. The Model D, Poly D, Odyssey, Wasp Deluxe, Cat, Crave, Grind,
MS-1, MonoPoly and VC340 guides give SysEx commands for settings (MIDI channel, note priority,
calibration), not the sound; the Neutron's manual the same. The Proton, 2600s, K-2s, TD-3s, Edge,
Kobol Expander, 2-XM, BQ-10, Toro, Syncussion, UB-Xa, UB-Xa D, BDS-3, JT-2, Solina and MS-5 guides
have none at all.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-behringer-cc.mjs` | A guide's controller table → its rows as printed: CC, hex, name (or the PRO-800's coarse, fine, stepped and MIDI standard columns), range, value bands. Decides nothing. |
| 1 | `read-behringer-tables.mjs` | A manual's tables that print a row a line (the Wave's controllers, NRPNs and preset bytes) → their rows as printed. |
| 2 | `import-behringer.mjs` | Writes `tables/<name>.json`: those, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, the pages the table is on, the rows the guide prints wrongly. |
| 4 | `build-behringer-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |
| 4 | `build-behringer-dump-profile.mjs` | The same for a manual that prints its preset's bytes: every parameter written, and read back. |

```bash
node tools/profiles/behringer/import-behringer.mjs ub-1-micro QSG_BE_0722-ABS_UB-1-MICRO_2025-04-02_Rev.0.pdf
node tools/profiles/behringer/make-profiles.mjs            # or --check
```

## Reading the table

The reader works from the words' positions (`pdftotext -bbox`). A header line gives each table its
columns: a CC column (`CC`, `CC #`, `CC Num`, `CC NUM`, `CC Number`, `Controller`), then the titles
after it, each set close together (`Acts on`, `Continuous - Coarse`); a word that begins a title
(`Range`, `Values`, `Parameters`, `Hex` …) begins one however close it is set, as the CZ-1 Mini's small
type runs `CC NUM PARAMETERS VALUES` together. A line with a number in it is not a header (`84
Portamento CC Control`, a row of the JN-80's). Two or three headers on one line are tables side by
side, each holding its stretch of the page; the last stops a little right of its last column (the JT
Mini's specifications are beside it).

Under a header, a line splits into cells at its gaps. Which column a cell is in:

- where the cells start at as many aligned places as there are titles (the PRO-800's and D Mini's,
  whose titles are set off their cells), those places are the columns, in order;
- else a cell set flush under a title is that column's, however much wider the title (the PRO-800's
  `Glide` under `Continuous - Coarse`);
- else the column whose title's centre is nearest the cell's.

A number under the CC column (`39`, the D Mini's `MIDI CC 39`) is a row. The guides centre a row's
cells on its number, so a name or a list may be set over lines above and below it; a run of lines in
one column (7 or 8 points apart; rows are 10 or more) is one cell, given to the row whose number is
nearest its middle. A run beside two numbers and longer than either row is theirs alike (the Spice's
divide-by list, printed once for both of an oscillator's sub-oscillators). A line with a name and a
range and no number is a value band: of the nearest row whose own line is its number alone (the JT
Mini's Voice Mode, its bands set above and below the number), else of the row above (the PRO-VS
Mini's `Chorus 0 – 42` under `FX Engine 0 – 127`). A dash is an empty cell.

## What the builder takes as settled

- **A row naming a parameter is that controller**, sent as a control change on the channel variable.
  The PRO-800's coarse, fine and stepped columns each name one (the fine half its own controller,
  `OSC A Freq Fine` on CC 80, not a 14-bit pair); a row naming only the MIDI standard's meaning (the
  PRO-800's and JN-80's last column: `Main volume`, `Sound Controller 1`, `Undefined`) is not a setting
  of the instrument and is left out, listed in the notes.
- **A pair the guide names** (`VCO 1 Frequency MSB (use with CC 36)`, then `VCO 1 Frequency LSB`) is
  one 14-bit parameter, 0 - 16383, the MSB sent first.
- **Values are as printed.** A range (`0 - 99`) is the parameter's range where it fits a controller;
  one that does not (`20-240`, the UB-1 Micro's arpeggiator BPM) is 0 - 127 with the printed range in
  its description. Bands (`0-63 off, 64-127 on`), named values (`0 = Off  64 = On`) and bands a line
  each (`0-12  Voice Mode – Poly`, their common first words the parameter's name) are a choice, a
  band's first value sent; a label keeps its sign (the UB-1 Micro's octaves, `-2` … `+2`). A value note
  printed in a name (`(0-64 = off / 65 – 127 = on)`) is the range. Bands that overlap or run out of
  order are not a choice: the parameter is a number, and the notes name it. The guides do not say
  whether a range like `0 - 99` is what the controller takes or what the panel shows for it; every
  profile says so.
- **Left out**: the wheels, pedals, bank select, NRPN and RPN controllers and the channel mode
  messages, by name; the controllers that set the instrument's own MIDI channels (the UB-1 Micro's
  `MIDI Tx Channel`, `MIDI Rx Channel`).
- **A group** is the block a name begins with (`VCF`, `OSC 1`, `DCA_`, `Aux/`), `LFO1` and `LFO 1`
  alike, spelt as it first is (the UB-1 Micro's `OSC1 Wave` and `Osc 1 Fine Tune` are one group).
  The CZ-1 Mini's `Param ` before every name is dropped.
- **A hex column that disagrees with its decimal** (the PRO-800's CC 79, printed `AF`) is a misprint:
  the decimal is taken, and the notes say so.

Corrected by the layouts, each named in the profile: the UB-1 Micro's OSC2 Wave, printed `0-32 off,
32-63 sawtooth` (OSC1 Wave's is `0-31`), and Arpeggiator Scale's last band, printed `87-127` after
`86-106`; the D Mini's Voice Mode, its last band printed `112-127` after `88-112`; the PRO-800's CC 49,
printed `OSC A Saw` as CC 48 is, between Saw and Square (`OSC A Tri`), and CC 52 and 53, printed `OSB
B …`; the PRO-VS Mini's CC 118, printed `Voice C Coarse Tuning` as CC 117 is (Voice D's: the fine
tunings are A - D); the CZ-1 Mini's CC 14, printed `DCO WF2` between `DCO 1 WF1` and `DCO 1 DCW`.

## The WAVE

The WAVE's manual is the one Behringer document here that says how to read a sound back. Its MIDI
chapter has three tables, each a row a line: the controllers (`Control #  Range  Function  Transmit
Receive  Remarks`), the NRPNs (`MSB  LSB  14-bit  Parameter Name  Range  Notes`) and the preset's
bytes (`Byte  Group  Menu  Parameter Name  Range  Notes`), and a SysEx section with a request for the
edit buffer (`F0 00 20 32 00 01 39 00 74 07 F7`) answered by its 121 bytes, a version byte before
them and a checksum after (`(D0 + … + Dn) & 7F`). `read-behringer-tables.mjs` reads the tables: the
headers are repeated on each page, the titles are not over their columns (`Notes` stands 90 points
right of the notes), so the columns are where the rows' cells line up.

Every preset byte is a parameter, named by its notes (`Filter Frequency`), grouped by its group and
menu (`A Analog`), and sent as the controller whose function is its printed name (`VCF-CUTOFF`, CC
74), or else the NRPN of that name (`UW`, NRPN 0:12, its value on CC 6 as the manual's data change
commands show). The name and the mod wheel's position have neither and are read back only. The NRPNs
that are not preset bytes are the instrument's settings and the arpeggiator's. Pull asks for the
edit buffer on connect and reads all 106 bytes.

Group A and group B are sent on the same controllers: the WAVE applies one to the group its Group
Select (CC 31: A, B, A+B) chooses, so a panel editing B's sound sets Group Select to B first. Pull
reads both groups as they are. The WAVE takes sound parameters only when PAR-COM, in its MIDI
settings, is 2 or 3.

Corrected by the layout, and named in the profile: A's `EO`, printed 0 - 1 where B's and the NRPN's
are 0 - 9; B's `SW`, printed 0 - 3 where A's and the NRPN's are 0 - 6; the last semitone offset,
printed `SEMIT V7` in both groups, its notes `Voice 8`. Left out: the arpeggiator's speed (NRPN 0:46,
40 - 240, `MSB/LSB` with no word on how the value is split).

## The profiles

| Profile | Read from | Rows | Parameters | 14-bit pairs | Choices | Rows corrected |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `behringer-aks-mini` | AKS MINI Quick Start Guide, p. 56 | 7 | 6 | 0 | 1 | — |
| `behringer-cz-1-mini` | CZ-1 MINI Manual, pp. 57 - 59 | 94 | 92 | 0 | 0 | 14 |
| `behringer-d-mini` | D MINI Quick Start Guide, p. 47 | 13 | 12 | 0 | 2 | 40 |
| `behringer-jn-80` | JN-80 Manual, pp. 13 - 14 | 128 | 63 | 0 | 0 | — |
| `behringer-jt-4000-micro` | JT-4000 MICRO Quick Start Guide, p. 27 | 26 | 25 | 0 | 1 | — |
| `behringer-jt-mini` | JT MINI Quick Start Guide, pp. 58 - 59 | 15 | 14 | 0 | 2 | — |
| `behringer-pro-800` | PRO-800 Quick Start Guide V 4.0, pp. 54 - 55 | 112 | 98 | 0 | 0 | 49, 52, 53 |
| `behringer-pro-vs-mini` | PRO-VS MINI Quick Start Guide, p. 86 | 34 | 33 | 0 | 1 | 118 |
| `behringer-spice` | SPICE Quick Start Guide, p. 21 | 17 | 11 | 6 | 5 | — |
| `behringer-ub-1-micro` | UB-1 MICRO Quick Start Guide, pp. 40 - 41 | 44 | 42 | 0 | 13 | 25, 106 |
| `behringer-wave` | WAVE User Manual, pp. 34 - 38, and its SysEx section | 189 | 122 | 0 | 2 | bytes 22, 31, 82, 106 |

Only the WAVE reads anything back: the guides publish no SysEx format for a sound, so the others
have no Pull. A panel follows them through the controllers they send when their knobs are turned,
where their MIDI settings send them.

## What is left out, and what would read it

| Left out | Where | What would read it |
| --- | --- | --- |
| The WAVE's arpeggiator speed, its wavetables and sequences | NRPN 0:46 (40 - 240, `MSB/LSB` unexplained); the wavetable and sequencer dumps (`74 0F`, 7-in-8 packed PCM) | the instrument, for the speed; the sequencer dump's byte table, read as the preset's is |
| The PolyEight | its manual's NRPN mappings (ranges up to 65535) and SysEx preset dump | an NRPN table reader and 14-bit NRPN values; the dump's structure for a Pull |
| The DeepMind 12, 6, 12D, 12X | the DeepMind 12 manual's NRPN chapter (the reader finds no CC header there) | an NRPN table reader for its shape |
| The JN-80's values | its quick start guide's three tables side by side, with values (`0 = Off  64 = On`); the manual's table, read here, prints none | the reader with one header over three tables |
| What a range means on the panel | every profile (`0 - 99`: the controller's values, or the display's?) | the instrument: sending 99 and 127 and looking |
| Settings by SysEx | Model D, Poly D, Odyssey, Wasp Deluxe, Cat, Crave, Grind, MS-1, MonoPoly, VC340, Neutron | nothing to do: they set the instrument's MIDI and calibration, not a sound |
