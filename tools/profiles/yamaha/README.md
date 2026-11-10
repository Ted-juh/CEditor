# Yamaha profiles, read from Yamaha's data lists

```bash
node tools/profiles/yamaha/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/yamaha/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/yamaha/import-yamaha.mjs <name> <data-list.pdf>   # re-read the data list
cd CE/web && node --test test/yamahaProfiles.test.js
```

The rules every profile here follows are in [../README.md](../README.md); what the library as a whole
holds is [docs/device-profile-library.md](../../../docs/device-profile-library.md).

Yamaha prints each instrument's MIDI in a **Data List** beside its manuals: the MIDI data format
(identity reply, parameter change, bulk dump, dump and parameter requests), a MIDI PARAMETER CHANGE
TABLE for each block of the instrument's memory, the bulk dump blocks, a control change table and
the implementation chart. They are on each product's Downloads page on usa.yamaha.com and served from
`data.yamaha.com`. They are Yamaha's copyright and are not committed; the rows read from them are,
with the file's name, SHA-256 and address. Importing needs poppler's `pdftotext`.

| Step | File | What it does |
|---|---|---|
| 1 | `read-yamaha-pdf.mjs` | A data list's pages → its parameter change tables as printed, its bulk dump blocks, and its identity reply, model ID and group number. Decides nothing. |
| 2 | `import-yamaha.mjs` | Writes `tables/<name>.json`: those, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document and which of its pages are this instrument's. |
| 4 | `build-yamaha-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## Reading the tables

Yamaha has set these tables the same way for twenty years: a title (`MIDI PARAMETER CHANGE TABLE
(VOICE Common)`), the headings `Address (hex)`, `Size`, `Data Range (hex)`, `Parameter Name`,
`Description` (`Settings` on some of the MX's pages), sometimes `Default (HEX)`, `Notes`, and rows
set from the top. The reader works from
the word positions: a table is found at each `Parameter Name` heading with `Size`, `Data`/`Range` and
`Address` on its band, and runs to the next table's title in its span or `Total Size`. What the data
lists do that it copes with, each found on a real page:

- two tables side by side, a title over two lines (`… TABLE` over `(VOICE Common)`), `Parameter`
  over `Name`, `Data` over `Range` over `(hex)`;
- headings centred over cells that start left of them, so each column starts in the widest gap the
  body's words leave between its heading and the one before;
- the address printed in full on a block's first row and its low byte alone after, and carried
  over a page; an address byte printed as a placeholder (`31 op 00`) with its meaning in a note under
  the title (`op = operator number`, `00 – 03 (hex)`, `OP1 – OP4`);
- a value over several bytes, one data range a line (`00 – 00`, `00 – 07`, `00 – 0F`, `00 – 0F`
  beside `1st bit 3-0 : bit 15-12` …); a byte printed with one digit (the MX's `0 – 2`);
- a name printed once beside the rows that share it (`MTC strat offset` beside `0 .. 23 (Hour)`,
  `0 .. 59 (Minute)` …), each row taking it with the word its description ends on;
- an address of four bytes where the data format prints `Address 1st` … `4th` (the MODX M's `06 00
  02 06`), its leading bytes carried down as a three-byte one's are, a placeholder byte with a capital
  (`L0`, `Lm`), and a title with `Group Number =7F 1C, Model ID = 0D` set beside it;
- several tables down one column under one heading, each ending at its own `Total Size` (the MO's
  Normal Voice Common): the rows go on to the next table's title, and the text after a Total Size is
  notes until a row printed in full; the column's tables read top to bottom before the next column's;
- names set 28 points left of a centred `Parameter Name` (the Motif XF's arpeggio tables), and a
  first row set inside a tall heading's band (the YC's `50 00 00` beside `(HEX)`).
- a table run on from the page before whose every row prints its address's low byte alone, under
  the right of `Address`: the size column, a digit under its heading, does not start left of them;
- `〃` for a description, as the row above.
- a column with rows and no headings over them, read under the other column's headings moved
  across by as far as its sizes stand from theirs: the MOTIF ES heads its left column alone (p. 77),
  the S90 ES runs its System on at the top of the right column above the Master's heading (p. 62),
  the MOTIF-RACK XS sets the rows level with the other column's headings (p. 74; its Multi Chorus and
  EQ, 40 rows, were missed before this);
- a table across the whole page under two columns of the one before (the MOTIF ES's MIX PART): its
  columns are read first, and its headings 42 points right of their cells, as far as its names lag;
- a column's side taken from its `Address` heading (the MOTIF ES's right column sets it 14 points
  right of the page's middle, its left edge a point left of it); the columns measured over every
  row, past the first Total Size too (the S90 ES's Slider Setting sets its names a point and a half
  further left), but not over the notes under one;
- a row printed without its address, read as the row's before it past its size, and named in the
  profile's notes (the MOTIF ES's `1 01 reserved` between EQ Q2 at `06` and EQ Gain3 at `08`; the
  MODX M's Voltage Drift after OSC Reset at `14`, two bytes); before this such a row ran into the
  row above, and both were lost;
- `TOTAL = 30` for `TOTAL SIZE = 30`, `Prameter Name` for `Parameter Name` (the MOTIF-RACK XS's Micro
  Tuning Table Name), and a title broken inside its brackets (the S90 ES's `(NORMAL` over `VOICE
  COMMON)`).

The bulk dump block table is read the same way, a column of a page at a time where it is set in two
(the MOXF's): each line ending in a byte count and an address, and a series printed first and last
with `:` between, its last printed with the middle byte alone (`Part 1 62 3E 31 00 00`, `:`, `Part 4
03`) or in full (the Motif XF's `Zone 8 … 32 07 00`), a group of blocks at a time (the MO's drum key:
Oscillator, Amplitude, Pitch, Filter, EQ). A block printed with only the bytes that change (the CP88's
`E.Piano Common … 01` under `Piano Common … 50 00 00`; the YC's `Organ Section Part Upper 20 14 50 10`)
takes the rest from the block above, and a placeholder printed a letter short (the MONTAGE M's `04 ll
m nn`) is still one. A series runs on over a column's foot (the MOTIF's drum keys, `KEY C 0` and `: 73
Blocks` at the foot of the left column, the page's number under them, `KEY C 6` at the head of the
right): the columns are read in turn, the open series carried. The CP5/CP50 prints its columns in
another order, the address first (`SYSTEM 00 00 00 40 28 Utility`), and another table's headings
under it end the bulk table.

## What the builder takes as settled

- **Every row with a data range is a parameter**, sent as the parameter change the data format
  prints: `F0 43 1n 7F 1C <model ID> <address> <data> F7`, n the device number (the `deviceId`
  variable is 1n, 10H for device number 1). The bytes between the device number and the address are
  read from the data format a line each: the group number and model ID (`7F 1C 03`, the reface), or
  a model ID of two bytes (`7F 17`, the MX), or of one (`6B`, the MOTIF of 2001); where the data
  format prints an XG parameter change before the native one (the MOTIF ES's `4C`), the native one's.
  `reserved` and `NOT USED` rows are not parameters.
- **The description says what each value shows, in order.** A list of names exactly as long as the
  range is a choice (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`; `0: Voice, 1: Performance, …`
  without the numbers); a range of numbers as long as the data range is what the values show (`28 –
  58` beside `-24 – +24 (semitones)`, or `[semitones]` as the MOXF prints it); a range in parts is
  matched part for part (`00 – 0F, 7F` beside `1 – 16, off`) or counted out over them in turn (`00 –
  10, 7F` beside `1 – 16, omni, off`; `0 = Preset, 1 = User, 2 = Library1...9 = Library8`). A range
  may be printed with dots (`1..16`, `5 ... 300`, `-120 … +120`), or with a hyphen between spaces (the
  MOTIF's `1 - 16`, `L63 - C - R63`), and over two lines, the first ending on its comma (`00 - 10,`
  over `7F`). Anything else (`0: Poly, 1 – 127: Mono with Portamento Time`) is a number, with the
  description said.
- **A value printed two 7-bit bytes a line** (the MODX M's `Data Range MSB/LSB`: `00 00 – 00 7F`,
  `00 00 – 00 11, 00 7F`) is one value over both, read as a one-byte row's is: a choice, or a number
  showing what its description says. A choice goes out as `00` and the choice, by a second recipe, and
  is read back from the second byte; one with a value over 127 is a number. U+2212 is a minus sign,
  and `semi` a semitone (`−24 – +24 semi`). Over a range in parts the numbers a list prints are the
  values (`0: Part 1, 1: Part 2 – 15: Part 16, 16: A/D, 17: Master, 127: Off`).
- **An address the data list misprints** and the rows either side pin down is taken from them, and the
  profile's notes say so: the MODX M prints Key Controller Set 2 Switch `00` between Set 1 Ratio at
  `0E` (two bytes) and Set 2 Destination at `12`; it is `10`. A table heading's address or a bulk
  block's that the data list prints otherwise elsewhere is corrected by the layout, named in the notes:
  the Motif XF heads the Multi's Insertion B `46 04 00` (its base address table: `36 04 00`). A series
  whose last block is misprinted is ended by the layout where the data list prints it elsewhere: the
  MOTIF ES's and S90 ES's Multi print their last Plug-in Part `37 44 00` after `37 60 00`; their
  Performance's are `31 60` … `31 62`.
- **What a data list prints for another model it shares** is left out by the layout, by the address's
  first byte, and named in the notes: the CP5/CP50's `(CP5 only)` blocks (34, 36), on the CP50.
- **Two bytes printed as one range** are read as one value: `0005 – 022C` (the Motif XS's, `00 05` to
  `02 2C`), and a fixed high byte over the low byte's range (the CP4 STAGE's `00` over `00 – 1D`).
- **A placeholder that stands for two things in one table** is given by the layout by the address's
  first byte or two (the Motif XF's `31 pp 00`, a part, and `35 pp 00`, an audio input at 40 and 41).
- **A value over several bytes** is split as its description says: `1st bit 3-0 : bit 15-12` is four
  nibbles, `1st bit 6-0 : bit 13-7` two 7-bit halves (Tempo, 30 - 300). Two bytes printed as a high
  and a low range with no such words are two 7-bit halves when the description counts out exactly
  the values between them (the MOXF's and MX's Tempo, `00 – 02` over `05 – 2C` beside `5 ... 300`;
  Wave Number, `00 – 1F` over `01 – 09` beside `1 – 3977`), and their printed defaults agree (`01 00`
  for an offset of 0).
- **A name printed a character a row** (`Voice Name1` … `Voice Name10`, `32 – 126 (ASCII)`) is one
  text parameter, read back but not written: a parameter change carries one parameter, and the data
  list does not say ten characters may go in one.
- **Pull** asks for each block the Bulk Dump Block table lists: a block on its own at its address
  (System), when it holds a parameter laid out here, and a Bulk Header's blocks with one request at
  the header's address, read as one collection (header, Common, the operators, footer), complete
  when its Bulk Footer arrives: the data lists say the blocks between may come in any order and not
  all of them, and a MODX part sends the blocks of its type. A header is at `0E`, a footer at `0F`,
  whatever the row is called (the reface YC's prints its footer `Bulk`). Where the table prints the
  header `0E mm nn`, the layout picks the edit buffer from the Bulk Control table (the MOXF's Normal
  Voice Edit Buffer, `0E 0F 00`). A block printed with placeholders (`41 ep 00 [p: Part No., e:
  Element No.]`) is one for each value the layout gives them; one with a placeholder the layout does
  not give is not read, and its messages are let pass. A collection or block holding no parameter
  laid out here (the MODX's curves, Live Sets, micro tunings) is not asked for. The byte count is what the data list says it
  counts: `from Model ID onward` on the reface (the data and four bytes more), `the data size` on the
  MOXF and MX (a header's is 0). The checksum is the one the data format prints: over the model ID,
  the address and the data, or, on the MX, from the byte count. Requests go out as 2n and dumps come
  back as 0n, both taken as device number 1.
- **Identity** is the reply the data list prints (`F0 7E 7F 06 02 43 00 41 51 06 …`), with `dd dd`
  filled in where one code is printed under it (the MX's `47 06`); a code for each model (the MOXF6's
  and MOXF8's) leaves it unchecked. Where the data list prints a byte for each model and the profile
  is one model's (the CP4 STAGE's and CP40 STAGE's model ID `7F 1A`, `7F 1B`, and identity `49 06`,
  `4A 06`; the YC61's `5C 06`), the layout gives that model's.
- **An edit buffer sent only in its own mode** (`The Edit Buffer data … will be transmitted/received
  only in the corresponding Mode`, the MOXF's, Motif XS's and XF's, Rack XS's and S90 XS's data lists)
  is asked for once, not retried: the others go unanswered.

## The profiles

| Profile | Read from | Parameters | Choices | Pull |
|---|---|---:|---:|---|
| `yamaha-reface-cs` | reface Data List (B0), pp. 2-5 | 30 | 11 | System, TG Common |
| `yamaha-reface-dx` | reface Data List (B0), pp. 6-10 | 135 | 39 | System, Voice Common and four operators |
| `yamaha-reface-cp` | reface Data List (B0), pp. 11-14 | 22 | 11 | System, TG Common |
| `yamaha-reface-yc` | reface Data List (B0), pp. 15-19 | 27 | 11 | System, TG Common |
| `yamaha-modx` | MODX6/MODX7/MODX8 Data List (D0), pp. 188, 192-222 | 4,527 | 890 | System, Performance Common, Part 1 |
| `yamaha-modx-plus` | MODX6+/MODX7+/MODX8+ Data List (A0), pp. 188, 192-222 | 4,527 | 890 | System, Performance Common, Part 1 |
| `yamaha-modx-m` | MODX M6/M7/M8 Data List (B0), pp. 214-215, 220-256 | 6,776 | 1,917 | System, Performance Common, Part 1 |
| `yamaha-montage-m` | MONTAGE M6/M7/M8x Data List (H0), pp. 214-215, 220-256 | 6,783 | 1,919 | System, Performance Common, Part 1 |
| `yamaha-montage` | MONTAGE6/7/8 Data List (J0), pp. 192, 196-226 | 4,530 | 898 | System, the Performance Edit Buffer |
| `yamaha-moxf` | MOXF6/MOXF8 Data List (A0), pp. 121, 124-146 | 5,317 | 1,216 | the five edit buffers, the System's blocks |
| `yamaha-mox` | MOX6/MOX8 Data List (C0), pp. 102, 105-126 | 5,227 | 1,107 | the five edit buffers, the System's blocks |
| `yamaha-motif-xf` | MOTIF XF6/XF7/XF8 Data List (C0), pp. 125, 128-146 | 5,309 | 1,096 | the five edit buffers, the System's blocks |
| `yamaha-motif-xs` | MOTIF XS6/XS7/XS8 Data List (C0), pp. 54, 57-73 | 5,274 | 980 | the five edit buffers, the System's blocks |
| `yamaha-motif-rack-xs` | MOTIF-RACK XS Data List (C0), pp. 60, 63-75 | 4,819 | 867 | the Voice and Multi edit buffers, the System's blocks |
| `yamaha-s90xs` | S90 XS/S70 XS Data List (C0), pp. 100, 103-125 | 4,922 | 1,016 | the five edit buffers, the System's blocks |
| `yamaha-mo` | MO6/MO8 Data List, pp. 60, 63-77 | 3,143 | 587 | the five edit buffers, the System's blocks |
| `yamaha-mx` | MX49/MX61/MX88 Data List (C0), pp. 55, 57-66 | 3,880 | 736 | the three edit buffers, the System's blocks |
| `yamaha-motif-es` | MOTIF ES6/ES7/ES8 Data List, pp. 66, 68-85 | 4,183 | 719 | the six edit buffers, the System's blocks |
| `yamaha-s90-es` | S90 ES Data List, pp. 57-58, 60-77 | 4,207 | 718 | the six edit buffers, the System's blocks |
| `yamaha-motif-rack-es` | MOTIF-RACK ES Owner's Manual (B0) pp. 96-98; Data List pp. 58-73 | 3,971 | 604 | the five edit buffers, the System's blocks |
| `yamaha-motif` | MOTIF6/MOTIF7/MOTIF8 Data List, pp. 45-46, 47-59 | 4,910 | 952 | the six edit buffers, the System's blocks |
| `yamaha-cp1` | CP1 Data List (D0), pp. 11-18 | 120 | 43 | System, the Performance Edit Buffer |
| `yamaha-cp5`, `yamaha-cp50` | CP5/CP50 Data List (C0), pp. 33-40 | 299, 200 | 75, 53 | System, the Performance Edit Buffer |
| `yamaha-cp4-stage`, `yamaha-cp40-stage` | CP4 STAGE/CP40 STAGE Data List (A0), pp. 36-41 | 274 | 99 | System, the Performance Edit Buffer |
| `yamaha-cp88-cp73` | CP88/CP73 Supplementary Manual V2.00 (H0), pp. 20-25 | 268 | 102 | System, the Current Sound Buffer |
| `yamaha-yc61` | YC61 Owner's Manual (C0) pp. 63-64; YC Supplementary Manual V2.00 (E0) pp. 13-17 | 263 | 108 | System, the Current Sound Buffer |
| `yamaha-yc88-yc73` | YC88/YC73 Owner's Manual (B0) pp. 63-64; YC Supplementary Manual V2.00 (E0) pp. 18-22 | 264 | 108 | System, the Current Sound Buffer |

The MODX's tables repeat for each of its 16 parts, at addresses a part apart, and a part's 8
elements, 73 drum keys and 8 FM-X operators are laid out the same way (`41 ep 00`, `5p kk 00`, `49 op
00`: the part in a nibble, the element or operator in the other, or a key in a byte of its own). Laid
out in full that is some 85,000 parameters; these profiles lay out the Performance and Part 1 with
all of its elements, keys and operators, and say so. The placeholders' meanings are the Bulk Dump
Block table's notes (`[p: Part No. (0...15), e: Element No. (0...7)]`), given in the layout.

What the MODX's data list leaves out or the reader does not take:

- **The identity reply** is printed with its family and model bytes as `dd dd`: no identity check.
- **The model ID** is printed 07 in hex and 00000010 in binary; the hex is taken.
- **Effect parameters** (Reverb, Variation, Insertion Parameter 1 - 32) print their two bytes with
  `:` for a description, the meaning depending on the effect type: left out.
- **Bit-packed rows** (`Receive Pitch Bend … Receive Control Change`, a bit each) are left out:
  sending one means knowing the others.
- **Micro tunings, curves and Live Sets** are user data, not part of a Performance: left out.
- **Motion sequences and the Super Knob sequence** (`30 lm 00`, `32 sp 00`, `30 6m 00`) are not laid
  out, and their blocks are not read.

Pull asks for the Performance Edit Buffer Common (`0E 53 00`) and the Performance Edit Buffer Part 1
(`0E 52 00`), the two halves these profiles lay out, rather than the whole Performance (`0E 25 00`),
which would send all 16 parts. Part 1 answers with its part blocks and the blocks of its type: a
Normal part's elements, a Drum part's keys or an FM-X part's operators, which is why the collection
is complete at its footer and not at a count. Every one of the 4,527 parameters falls in a block
asked for.

The MODX M and MONTAGE M are the next generation of the same format, read with the same reader and
laid out the same way: model ID `0D`, every address four bytes (`2p 01 ee 00`: the part in the first
byte's low nibble, the element in the third), every value of a 2-byte table two 7-bit bytes, and AN-X
parts beside the AWM2 and FM-X ones. The profiles lay out the Performance Common and Part 1 with its
first 8 elements of an AWM2 part's 128 (laid out in full a part would be some 18,000 parameters), its
73 drum keys, 8 FM-X operators, and 3 AN-X oscillators and 2 filters. Pull asks for the Performance
Edit Buffer Common (`04 04 02 00`) and Part 1 (`04 04 01 00`); the blocks of elements 9 to 128 are let
pass. 6,659 of the MODX M's 6,776 parameters are read back. The rest are in no block the data list
prints: the Temporary Setup, the parameters the base address table calls Bulk Unsupported (`7p`),
and the rows a block's printed size leaves out (an element's 1byte block is printed 36 bytes, its
table runs to `2A`; a common controller box 16, its Ratio at `10`). The two data lists differ in a
few settings each (the MONTAGE M's knob functions, the MODX M's knob mode), as the instruments do.
The identity reply prints a family code for each model, so neither checks identity.

The MOXF's tables are laid out in full: the System with its six Quick Setups and their audio and
MIDI configs, the Master's four zones, the Performance and its four parts, the Song/Pattern mixing
and its sixteen parts, the Normal Voice and its eight elements, the Drum Voice and its 73 keys (C0 –
C6, as the bulk dump table names them). The placeholders (`31 pp 00`, `41 ee 00`, `47 ee 00`, `32 nn
00`, `00 5n 00`) are the Parameter Base Address table's, given in the layout. Pull asks for the
Normal Voice, Drum Voice, Performance, Multi and Master edit buffers, whichever mode the instrument
is in, and the System's blocks one at a time: 5,314 of the 5,317 parameters are read back (Mode
Change, Master Number Select and Part Set Control are in no block). Left out, as on the MODX: the
effect parameters (two bytes whose meaning depends on the effect type), the bit-packed rows (the
Master zones' transmit switches), and the arpeggio Assign Types, whose two bytes are printed over
four ranges. The identity reply is printed with its family as `dd dd` (4C 06 for the MOXF6, 4D 06
for the MOXF8): no identity check.

The MX is the MOXF's format with less in it, and its tables read the same: the System, the
Performance (the MX's multi) and its sixteen parts, the Normal Voice and its eight elements, the
Drum Voice and its 73 keys, each part's, element's and key's rows printed under its block's common
table, untitled. Its header is `7F 17` where the MOXF's is `7F 1C 00`, its bulk dumps carry no model
ID after the byte count, and its checksum adds up from the byte count; all three are read from its
data format. Pull asks for the Performance, Normal Voice and Drum Voice edit buffers and the
System's blocks: 3,879 of 3,880 parameters are read back. Its identity is checked: the data list
prints the one code all three keyboards answer with, `47 06`.

The MONTAGE (2016) is the MODX's format and layout, read from its own data list. Its bulk dump table
does not list the Performance Edit Buffer Common the Bulk Control table names, so its Pull asks for
the whole Performance Edit Buffer (`0E 25 00`) and reads the Common and Part 1 from it, the other
parts' blocks let pass; the whole Performance's list prints Motion Seq Part/Lane Settings at `34 1p
00` where the part's list and the tables put it at `31 1p 00`, corrected.

The Motif family (`motif-family.mjs`): the MOTIF XS and XF, MOTIF-RACK XS, MOX, S90 XS/S70 XS and
MO6/MO8 data lists set the MOXF's tables at the MOXF's addresses, with a model ID of two bytes as the
MX's (`7F 03`, `7F 12`, `7F 14`, `7F 0D`, `7F 00`). Each is laid out in full with its own counts:
zones (8 on the Motif XF and XS, 4 on the others), the Performance's 4 parts, the Multi's 16, 8
elements a voice (4 on the MO), the 73 drum keys and its audio inputs; the Rack XS has no Master or
Performance. Left out across them, as on the MOXF: the effect parameters, the bit-packed rows, the
arpeggio Assign Types and the micro tunings.

The MOTIF ES, S90 ES and MOTIF-RACK ES (`esLayout` in `synths/motif-es.mjs`) are the generation
before: the same tables at the same addresses, model ID `7F 00`, four elements a voice, three
Plug-in Parts beside the Performance's four parts and the Multi's sixteen (`pp` 60-62; the Rack ES
has two), the A/D or Audio Input Parts at 34 and 38 (`pp` 40-44), and the Plug-in Voice at 4C, whose
edit buffer Pull asks for too (`0E 1F 00`); what a PLG board holds goes unanswered without one. The
MOTIF-RACK ES's data list prints no data format, so it is read from its owner's manual, identity and
all (`19 06`); its data list heads the Plug-in Voice's Audition `46 06 00`, the Drum Voice's, where
its bulk table puts it at `4C 06 00`, corrected. The MOTIF of 2001 is laid out the same way, with the
model ID `6B` alone and its System's Sequencer Remote settings (`02 tt 00`, a track each). The ES
generation's identity request is received only and no reply printed, so no identity check; the
MOTIF prints a code for each model. On the S90 ES, 8 element settings run past their block's
printed size (Half Damper Switch, AEG Sustain Time) and are not read back.

The CP1 is laid out in full: the System, and the Performance's two layers, each a Part, Pre-Amp,
Modulation and Power-Amp block (`31 0p`, `1p`, `2p`, `3p`), and four zones; its data list prints
only the addresses that hold a setting, and its identity code as `CP1: 3B 06`, given in the layout.
The CP5 and CP50 share a data list as the CP4 STAGE and CP40 STAGE do, with a model ID byte (`10`,
`11`) and an identity code (`3F 06`, `40 06`) each, and mark what the CP5 alone has: its four parts
to the CP50's two, the Power-Amplifier/Insertion 2 blocks and the A/D (mic) input, left out of the
CP50's profile.

The CP4 STAGE and CP40 STAGE share a data list and differ in the model ID's second byte and the
identity code: two profiles, each with its model's. Every table is laid out: the System, the
Performance and its three parts and four zones. The CP88/CP73's data list is the V2.00
supplementary manual's, which supersedes the owner's manual's; it titles only its first table, the
rest under section headings the reader does not take, so its rows are named by the bulk block they
fall in. The YC61's and YC88/YC73's data tables are the V2.00 supplement's, the data format their
owner's manuals': each profile reads both documents. Their bulk dump table prints the Live Set Sound
Common as 1 byte where its table runs to `46 00 40`, so those 48 settings are not read back; the
CP88/CP73 Tempo (`01 – 12` over `00 – 7F` beside `42.0 – 240.0`) is left out, its ends not counting
out the span.

The reface's control changes (MIDI Control on) are not mapped: every setting they reach is a
parameter change here too, and the panel's CCs would be a second parameter for each.

## Survey: what else Yamaha publishes

Every data list found is read. All of them have a text layer; none needed OCR.
