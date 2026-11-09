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
`Description`, sometimes `Default (HEX)`, `Notes`, and rows set from the top. The reader works from
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
  beside `1st bit 3-0 : bit 15-12` …).

## What the builder takes as settled

- **Every row with a data range is a parameter**, sent as the parameter change the data format
  prints: `F0 43 1n 7F 1C <model ID> <address> <data> F7`, n the device number (the `deviceId`
  variable is 1n, 10H for device number 1). `reserved` rows are not.
- **The description says what each value shows, in order.** A list of names exactly as long as the
  range is a choice (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`); a range of numbers as long as
  the data range is what the values show (`28 – 58` beside `-24 – +24 (semitones)`); a range in parts
  is matched part for part (`00 – 0F, 7F` beside `1 – 16, off`). Anything else (`0: Poly, 1 – 127:
  Mono with Portamento Time`) is a number, with the description said.
- **A value over several bytes** is split as its description says: `1st bit 3-0 : bit 15-12` is four
  nibbles, `1st bit 6-0 : bit 13-7` two 7-bit halves (Tempo, 30 - 300).
- **A name printed a character a row** (`Voice Name1` … `Voice Name10`, `32 – 126 (ASCII)`) is one
  text parameter, read back but not written: a parameter change carries one parameter, and the data
  list does not say ten characters may go in one.
- **Pull** asks for each block the Bulk Dump Block table lists: a block on its own at its address
  (System), and a Bulk Header's blocks with one request at the header's address, read as one
  collection (header, Common, the operators, footer). The checksum is the one the data format
  prints, over the model ID, the address and the data. Requests go out as 2n and dumps come back as
  0n, both taken as device number 1.
- **Identity** is the reply the data list prints (`F0 7E 7F 06 02 43 00 41 51 06 …`).

## The profiles

| Profile | Read from | Parameters | Choices | Pull |
|---|---|---:|---:|---|
| `yamaha-reface-cs` | reface Data List (B0), pp. 2-5 | 30 | 11 | System, TG Common |
| `yamaha-reface-dx` | reface Data List (B0), pp. 6-10 | 135 | 39 | System, Voice Common and four operators |
| `yamaha-reface-cp` | reface Data List (B0), pp. 11-14 | 22 | 11 | System, TG Common |
| `yamaha-reface-yc` | reface Data List (B0), pp. 15-19 | 27 | 11 | System, TG Common |
| `yamaha-modx` | MODX6/MODX7/MODX8 Data List (D0), pp. 188, 193-222 | 4,521 | 858 | — |
| `yamaha-modx-plus` | MODX6+/MODX7+/MODX8+ Data List (A0), pp. 188, 193-222 | 4,521 | 858 | — |

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
- **Pull** is not mapped yet: the Performance's bulk dump is a header, a block per part and element,
  and a footer, as the reface's are, but larger.

The reface's control changes (MIDI Control on) are not mapped: every setting they reach is a
parameter change here too, and the panel's CCs would be a second parameter for each.

## Survey: what else Yamaha publishes

Data lists downloaded and read so far, for the work still to do: MODX M (B0, 261 pp.) and MONTAGE M
(H0), model ID 0D, whose tables address a part with more bytes than the MODX's and read with empty
addresses here; MOXF6/8 (A0, 148 pp.) and MX49/61/88 (C0, 69 pp.), the Motif-era format.
