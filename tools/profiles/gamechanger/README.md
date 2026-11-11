# Gamechanger Audio device profiles

The Motor Synth MKII and the first Motor Synth, read from Gamechanger Audio's own documents: the
MKII's NRPN map and MIDI SysEx PDFs (linked from its web manual's MIDI page,
`https://gamechangeraudio.com/msmkii-manual/midi/`, all last revised April 2023), and the MKI's user
manual, which prints the same two at its end (pages 143 - 155). As with the other brands, the
documents are not committed: what is committed is what was read from them, with each file's name,
SHA-256 and where to get it.

## Survey (November 2026)

| Product | Document | What it gives |
| --- | --- | --- |
| Motor Synth MKII | NRPN map (20 pp) | **every sound and global parameter** as an NRPN: type (unipolar or bipolar, float or integer), the value's range, the MIDI data range (14 bits) and whether it is retained; 464 rows. **Built.** |
| | MIDI SysEx (2 pp) | the general info request and reply, and the **global and sound parameter requests and dumps**, every value in 14 bits ordered by NRPN. **Built** (Pull). |
| | CC map (4 pp), basic MIDI implementation (3 pp) | 128 controllers, many a 14-bit pair (CC n, its LSB on n + 32), no ranges; the channels and message filters. Not laid out: the NRPNs cover every parameter. |
| Motor Synth (MKI) | User Manual (156 pp) | the same CC map (pp. 139 - 142), NRPN map (pp. 143 - 152, a row a line, 368 rows) and SysEx pages (pp. 152 - 155). **Built.** |
| PLUS Pedal II | Manual, p. 22 | 12 controllers with 14-bit pairs and named values; the text layer drifts from its rows. Not built yet. |
| Bigsby, Motor Pedal, Plasma Rack, Plasma Voice | their manuals and CC/PC maps | controller lists of 9 - 31 rows. Not built yet. |
| Recoder | MIDI implementation | lettering drawn as shapes, no text. Not built. |
| AUTO series, PLUS Pedal, Light Pedal, Plasma Pedal, Plasma Coil, Plasma Module | — | no MIDI table, or no MIDI. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-motor-maps.mjs` | The NRPN map from the PDF's word positions: the columns where the header puts them, a row its number, and a line without one the row's whose number is nearest (the MKII sets each cell vertically centred on its row: `UNIPOLAR` above the number, `FLOAT` below; a value range that does not fit wraps the same way). And the SysEx pages: a heading, then a field a line, its name and its bytes. |
| 2 | `import-gamechanger.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the documents, where each is linked from, and the pages of each part. |
| 4 | `build-gamechanger-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/gamechanger-motor-synth*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its NRPN**, the value 14 bits on data entry (CC 6, then CC 38, as the CC map gives data
  entry for NRPN), its range the row's MIDI DATA RANGE.
- **The value range is shown** where it is what the MIDI range reads as: a FLOAT's (`0 ... 20` over
  `0 ... 16383`), or an INTEGER's that is as wide as its MIDI range (`-12 ... 0 ... 12` over
  `8180 ... 8192 ... 8204`). A bipolar row's default is its middle.
- **Left out, and named:** the rows whose MIDI data range is not one of 14-bit values: DETUNE MIN
  (`0 ... -1`), PWH R LOW (`0 ... 0`) and INIT PRESET REF (`0 ... 0x00FFFFFF`). DETUNE MAX and the step
  modulators' STEPS print a value range narrower than their MIDI range (`1 ... 12` over `0 ... 12`); they
  are laid out with the MIDI range, and the profile says so.
- **Pull** sends the sound parameter request (`F0 7E 7F 07 02 00 21 6D F7`, 7F the "general channel"
  any channel answers) and the global one (`07 01`), and reads each dump, whose values are "in 14b
  format (MSB, LSB) ordered by NRPN ID [size: parameter count x 2 bytes]": the map's k-th row in NRPN
  order at bytes 2k and 2k + 1, the rows left out above counted in that order. The MKII's sound rows
  are NRPN 0 - 380 without a gap, so there the order and the number agree; the MKI's skip numbers, so
  its reading rests on the document's words. A dump of any other length than the map's rows make is
  refused (`expectedBytes` and `maxBytes`), so a firmware with other parameters is not misread.

## The profiles

| Profile | Rows | Parameters | Read back |
| --- | ---: | ---: | ---: |
| `gamechanger-motor-synth-mkii` | 464 | 461 | 461 |
| `gamechanger-motor-synth` | 368 | 365 | 365 |

## Not done

- **Value names.** The map prints enumerations as numeric ranges (`V1 WAVE 0 ... 3`); the manuals'
  chapters name the settings, and a map from one to the other would be written by hand.
- **Telling the two apart.** Both print the same family and member codes in the general info
  response. (The MKII's basic MIDI implementation says Device Inquiry "No"; its SysEx document prints
  the request and the reply.)
- **The pedals.** The PLUS Pedal II, Bigsby, Motor Pedal, Plasma Rack and Plasma Voice charts are small
  controller lists in their manuals, next in line.
