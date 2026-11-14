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
| JN-80 | Manual, pp. 13 - 14 | `CC Num  Hex  Parameter  MIDI standard`, every controller 0 - 127, no values; not read, the guide being fuller |
| CZ-1 Mini | Manual, pp. 57 - 59 | `CC NUM  PARAMETERS  VALUES`, the values column empty |
| Wave | Manual, pp. 34 - 41 | `Control #  Range  Function  Transmit  Receive  Remarks`, an NRPN table `MSB  LSB  14-bit  Parameter Name  Range  Notes`, and its SysEx: the preset's 121 bytes, a request for the edit buffer and its answer |
| PolyEight | Manual Rev. 3, pp. 33 - 41 (PDF 17 - 21, two pages a sheet) | NRPN mappings (`NRPN  HEX  DESCRIPTION  STORAGE  RANGE`), and its SysEx preset dump's structure and parameters, with their enum lists |
| DeepMind 12 (and 6, 12D, 12X) | Manual, chapter 17 | NRPN commands; the quick start guides have no table |
| JN-80 | Quick Start Guide, p. 12 | `CC Num  Hex  Parameter  Value`, four columns across the page under one header, a row's values set under it (`0 = Off` / `64 = On`); and an NRPN table, twenty parameters at 12 bits |

The rest print no controller table. The Model D, Poly D, Odyssey, Wasp Deluxe, Cat, Crave, Grind,
MS-1, MonoPoly and VC340 guides give SysEx commands for settings (MIDI channel, note priority,
calibration), not the sound; the Neutron's manual the same. The Proton, 2600s, K-2s, TD-3s, Edge,
Kobol Expander, 2-XM, BQ-10, Toro, Syncussion, UB-Xa, UB-Xa D, BDS-3, JT-2, Solina and MS-5 guides
have none at all.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-behringer-cc.mjs` | A guide's controller table → its rows as printed: CC, hex, name (or the PRO-800's coarse, fine, stepped and MIDI standard columns), range, value bands. Decides nothing. |
| 1 | `read-behringer-tables.mjs` | A manual's tables that print a row a line (the Wave's controllers, NRPNs and preset bytes; the DeepMind's NRPNs), and tables of rows anchored on a number with their cells set around it (the PolyEight's) → their rows as printed. |
| 2 | `import-behringer.mjs` | Writes `tables/<name>.json`: those, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, the pages the table is on, the rows the guide prints wrongly. |
| 4 | `build-behringer-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |
| 4 | `build-behringer-nrpn-profile.mjs`, `build-behringer-nrpn-table-profile.mjs` | The same for an NRPN table: with its program dump (the DeepMind 12's), or without one (the PolyEight's). |
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
  PRO-800's last column: `Main volume`, `Sound Controller 1`, `Undefined`) is not a setting
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

## The DeepMind 12

Its manual's chapter 17 is a table of every parameter's NRPN (`MSB  LSB  14-bit  Parameter Name  Range
Notes`), 242 of them, most 0 - 255, and its chapter 19 an edit buffer request (`F0 00 20 32 20 <dev>
03 F7`) answered with the program data, `each parameter … in its own byte`, in NRPN order, `packed MS
bit` seven bytes in eight. The table is read by the same line-table reader as the WAVE's; a note set
over two lines around its row (`Normal (0), Fingered (1) …`) is the row's, and a long name set close
to its range (`OSC 1 Aftertouch > Pitch Mod Depth 0-255`) is split where the range column starts.

Each row is its NRPN, the value 14 bits on data entry (CC 6, then CC 38), as the manual's sequence
`B0 63 aa 62 bb 06 cc 26 dd` shows. A list in the notes that covers the range (`Sine (0), Triangle (1)
…`, `0 ( OSC1+2), 1 (OSC 1 Only)`) is a choice; a scale (`-128 (0) to +127 (255)`, `20 bpm (0) to 275
bpm (255)`, `1 to 6 Octaves`) is how the value is shown; the lists printed as a pattern (LFO Mono
Mode's `SPREAD-1(2) to SPREAD-254(255)`, Arp Pattern's `Preset-1 (1) ... User-32 (64)`) are spelt out
by the layout. A run (`FX 1 Params`, LSB `39 - 50`) is a parameter each. The program name is read
back only. Pull asks for the edit buffer on connect; each parameter is the byte its 14-bit number
gives.

Two things are inferred, and the profile says so. The manual says 242 bytes are packed into 278, and
278 bytes carry 243: 243 are unpacked and the last, not in the table, is not read. And its diagram of
the packing does not number the bits: the top bit of the first of seven bytes is read from the
lowest bit of the eighth, as Korg's identical diagram is.

Corrected by the layout, and named in the profile: each envelope's fourth curve, printed `Attack
Curve` a second time where its Release Curve belongs (61, 70, 79); FX 2's and 3's output gains,
printed `—`, 0 - 150 as FX 1's and 4's; LFO 1's Mono Mode, printed 0 - 1, 0 - 255 as its notes and LFO
2's are. Left as numbers with their reference: the modulation matrix's sources and destinations, the
FX types and connection modes, the clock dividers and the program categories, whose lists the
manual names (`See FX Type list`) and does not print.

## The JN-80's guide

The JN-80's manual prints its controllers without values; its quick start guide prints the same
ones with their values, and one more (CC 36, VCF Resonance Factor), so the guide is what is read. Its
table is set in four columns across a wide page under a single header, each row's value list set
under its number, not around it. The layout gives the four columns' places (the number, hex +34,
name +73, value +162 points from each), the guide reader reads them as tables of their own, and a
line under a row is that row's. A word on a column starts a cell however close it is set (`ENV Decay
/ Release mode` runs into `0 = Exponential`); the fourth column stops at the NRPN table under it;
the page's running header (`22 JN-80 … 23`) is above where the tables start. Corrected by the layout:
CC 16's `VCF Resonace`. The hex column misprints CC 36 and 37 as 23 and 24, and the decimal is taken.

Beside the controllers, under `MIDI NRPNS`, the guide prints an NRPN table: `MSB  LSB  14-bit
Parameter Name  Range  Scope  Notes`, twenty rows, every value 0 - 4095, the notes a scale (`Approx. 10
Hz to 16000 Hz`, `0 = 3 ms; 2048 = 1 s; 4095 = 2 s`). Read by the anchored-row reader in the table's
own region (right of x 885, below its header), into the same transcription. Each NRPN has the number
and name of a controller, so the second profile, `behringer-jn-80-nrpn`, sends those twenty as their
NRPNs at 12 bits and every other parameter as the controller; the value goes on data entry as 14 bits
do, the high 7 on CC 6 and the low on CC 38 (the guide's `NRPN Data MSB` and `LSB`), the guide not
saying how its 12 bits are split.

## The PolyEight

Its manual is printed two pages to a sheet, and its MIDI chapter has the NRPN mappings (`NRPN  HEX
DESCRIPTION  STORAGE  RANGE`, 97 rows) and the SysEx preset dump: its structure and a table of the
preset's parameters, which gives the value lists the NRPN table leaves out (`VCO octave selection
**Enum Values:** LOW = 0, MID = 1, HIGH = 2`). Both tables set a row's long cells over as many lines
as they need, the NRPN table around its number and the preset table down from its name, and the
continuation pages repeat no header. `readAnchoredRows` reads them: the layout gives the columns'
places and where a sheet splits into its two pages; the NRPN table's cells run into cells of their
own (a cell's lines 10 points apart, rows' 13 or more), each the row whose number it holds or is
nearest; the preset table's rows run from their name down. The preset table's descriptions are
kept as one flow of text, its enum lists each straight after the description it belongs to.

Each NRPN row is its NRPN with a 14-bit value. A list in its description (`Portamento mode (0=speed,
1=time)`) covering the range is a choice; for a row whose description has none, the list that
follows the same description in the preset table is. The NRPN table prints `0–65535` where the
preset table gives the same parameters `0–16383`, and data entry carries 14 bits: they are sent as
0 - 16383. It prints `-32767–32767` where the preset table gives `-8192–8191` and does not say how a
negative value is carried: those are the 14 bits as sent, and say so. A row with no range and no
list (the portamento legato mode, the mod matrix's sources and destinations) is the data byte's 0 -
127. Two descriptions are given two NRPNs each (the modulation generator's frequency and output
level, 21 and 2307, 23 and 2309); both are laid out.

There is no Pull: the manual prints the preset dump's structure but no request for it, and gives the
PolyEight's device ID bytes only as `Device-specific`.

## The profiles

| Profile | Read from | Rows | Parameters | 14-bit pairs | Choices | Rows corrected |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `behringer-aks-mini` | AKS MINI Quick Start Guide, p. 56 | 7 | 6 | 0 | 1 | — |
| `behringer-cz-1-mini` | CZ-1 MINI Manual, pp. 57 - 59 | 94 | 92 | 0 | 0 | 14 |
| `behringer-d-mini` | D MINI Quick Start Guide, p. 47 | 13 | 12 | 0 | 2 | 40 |
| `behringer-deepmind-12` | DeepMind 12 User Manual, pp. 136 - 139, and its SysEx chapter | 182 | 226 | 0 | 38 | 5, 61, 70, 79, 219, 220 |
| `behringer-jn-80` | JN-80 Quick Start Guide, p. 12 | 78 | 64 | 0 | 23 | 16 |
| `behringer-jn-80-nrpn` | the same, and its NRPN table | 78 + 20 | 64 (20 of them NRPNs) | 0 | 23 | 16 |
| `behringer-jt-4000-micro` | JT-4000 MICRO Quick Start Guide, p. 27 | 26 | 25 | 0 | 1 | — |
| `behringer-jt-mini` | JT MINI Quick Start Guide, pp. 58 - 59 | 15 | 14 | 0 | 2 | — |
| `behringer-pro-800` | PRO-800 Quick Start Guide V 4.0, pp. 54 - 55 | 112 | 98 | 0 | 0 | 49, 52, 53 |
| `behringer-polyeight` | PolyEight User Manual Rev. 3, NRPN mappings and preset parameters | 97 | 97 | 0 | 18 | — |
| `behringer-pro-vs-mini` | PRO-VS MINI Quick Start Guide, p. 86 | 34 | 33 | 0 | 1 | 118 |
| `behringer-spice` | SPICE Quick Start Guide, p. 21 | 17 | 11 | 6 | 5 | — |
| `behringer-ub-1-micro` | UB-1 MICRO Quick Start Guide, pp. 40 - 41 | 44 | 42 | 0 | 13 | 25, 106 |
| `behringer-wave` | WAVE User Manual, pp. 34 - 38, and its SysEx section | 189 | 122 | 0 | 2 | bytes 22, 31, 82, 106 |

Only the WAVE and the DeepMind 12 read anything back: the guides publish no SysEx format for a sound, so the others
have no Pull. A panel follows them through the controllers they send when their knobs are turned,
where their MIDI settings send them.

## What is left out, and what would read it

| Left out | Where | What would read it |
| --- | --- | --- |
| The WAVE's arpeggiator speed, its wavetables and sequences | NRPN 0:46 (40 - 240, `MSB/LSB` unexplained); the wavetable and sequencer dumps (`74 0F`, 7-in-8 packed PCM) | the instrument, for the speed; the sequencer dump's byte table, read as the preset's is |
| The PolyEight's Pull, signed values, sources and destinations | no dump request and no device ID printed; how a negative value is carried; no source or destination list | the instrument: its own dump, and its answer to 0 and 16383 on a signed parameter |
| The DeepMind 6, 12D and 12X | quick start guides only; the DeepMind 12's manual is the one with the table | each's own manual, or the instrument: the 12D and 12X are presumably the 12's, the 6 is not |
| The DeepMind 12's lists | the mod matrix sources and destinations, FX types and routings, clock dividers, program categories: named, not printed | the instrument's screens, or another document of Behringer's |
| How the JN-80 splits a 12-bit NRPN value | its guide gives the range, 0 - 4095, and the data entry controllers, not the split; the NRPN profile takes the MIDI convention | the instrument: send 4095 and look |
| What a range means on the panel | every profile (`0 - 99`: the controller's values, or the display's?) | the instrument: sending 99 and 127 and looking |
| Settings by SysEx | Model D, Poly D, Odyssey, Wasp Deluxe, Cat, Crave, Grind, MS-1, MonoPoly, VC340, Neutron | nothing to do: they set the instrument's MIDI and calibration, not a sound |
