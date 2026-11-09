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
  `0 .. 59 (Minute)` …), each row taking it with the word its description ends on.

The bulk dump block table is read the same way, a column of a page at a time where it is set in two
(the MOXF's): each line ending in a byte count and an address, and a series printed first and last
with `:` between (`Part 1 62 3E 31 00 00`, `:`, `Part 4 03`; `Key C0` … `Key C6 48`).

## What the builder takes as settled

- **Every row with a data range is a parameter**, sent as the parameter change the data format
  prints: `F0 43 1n 7F 1C <model ID> <address> <data> F7`, n the device number (the `deviceId`
  variable is 1n, 10H for device number 1). The bytes between the device number and the address are
  read from the data format a line each: the group number and model ID (`7F 1C 03`, the reface), or
  a model ID of two bytes (`7F 17`, the MX). `reserved` rows are not parameters.
- **The description says what each value shows, in order.** A list of names exactly as long as the
  range is a choice (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`; `0: Voice, 1: Performance, …`
  without the numbers); a range of numbers as long as the data range is what the values show (`28 –
  58` beside `-24 – +24 (semitones)`, or `[semitones]` as the MOXF prints it); a range in parts is
  matched part for part (`00 – 0F, 7F` beside `1 – 16, off`) or counted out over them in turn (`00 –
  10, 7F` beside `1 – 16, omni, off`; `0 = Preset, 1 = User, 2 = Library1...9 = Library8`). A range
  may be printed with dots (`1..16`, `5 ... 300`, `-120 … +120`). Anything else (`0: Poly, 1 – 127:
  Mono with Portamento Time`) is a number, with the description said.
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
  and MOXF8's) leaves it unchecked.

## The profiles

| Profile | Read from | Parameters | Choices | Pull |
|---|---|---:|---:|---|
| `yamaha-reface-cs` | reface Data List (B0), pp. 2-5 | 30 | 11 | System, TG Common |
| `yamaha-reface-dx` | reface Data List (B0), pp. 6-10 | 135 | 39 | System, Voice Common and four operators |
| `yamaha-reface-cp` | reface Data List (B0), pp. 11-14 | 22 | 11 | System, TG Common |
| `yamaha-reface-yc` | reface Data List (B0), pp. 15-19 | 27 | 11 | System, TG Common |
| `yamaha-modx` | MODX6/MODX7/MODX8 Data List (D0), pp. 188, 192-222 | 4,521 | 884 | System, Performance Common, Part 1 |
| `yamaha-modx-plus` | MODX6+/MODX7+/MODX8+ Data List (A0), pp. 188, 192-222 | 4,521 | 884 | System, Performance Common, Part 1 |
| `yamaha-moxf` | MOXF6/MOXF8 Data List (A0), pp. 121, 124-146 | 5,317 | 1,216 | the five edit buffers, the System's blocks |
| `yamaha-mx` | MX49/MX61/MX88 Data List (C0), pp. 55, 57-66 | 3,880 | 736 | the three edit buffers, the System's blocks |

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
is complete at its footer and not at a count. Every one of the 4,521 parameters falls in a block
asked for.

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

The reface's control changes (MIDI Control on) are not mapped: every setting they reach is a
parameter change here too, and the panel's CCs would be a second parameter for each.

## Survey: what else Yamaha publishes

Data lists downloaded and read so far, for the work still to do: MODX M (B0, 261 pp.) and MONTAGE M
(H0), model ID 0D, whose tables address a part with more bytes than the MODX's and read with empty
addresses here.
