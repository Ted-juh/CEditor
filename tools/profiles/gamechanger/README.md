# Gamechanger Audio device profiles

The Motor Synth MKII and the first Motor Synth, read from Gamechanger Audio's own documents: the
MKII's NRPN map and MIDI SysEx PDFs (linked from its web manual's MIDI page,
`https://gamechangeraudio.com/msmkii-manual/midi/`, all last revised April 2023), and the MKI's user
manual, which prints the same two at its end (pages 143 - 155). And five pedals, from the MIDI CC
tables of their quick guides and manuals (the AUTO Delay, Chorus and Reverb, the Motor Pedal) and the
Bigsby's CC and PC map. As with the other brands, the documents are not committed: what is committed is what was read from them, with each file's name,
SHA-256 and where to get it.

## Survey (November 2026)

| Product | Document | What it gives |
| --- | --- | --- |
| Motor Synth MKII | NRPN map (20 pp) | **every sound and global parameter** as an NRPN: type (unipolar or bipolar, float or integer), the value's range, the MIDI data range (14 bits) and whether it is retained; 464 rows. **Built.** |
| | MIDI SysEx (2 pp) | the general info request and reply, and the **global and sound parameter requests and dumps**, every value in 14 bits ordered by NRPN. **Built** (Pull). |
| | CC map (4 pp), basic MIDI implementation (3 pp) | 128 controllers, many a 14-bit pair (CC n, its LSB on n + 32), no ranges; the channels and message filters. Not laid out: the NRPNs cover every parameter. |
| Motor Synth (MKI) | User Manual (156 pp) | the same CC map (pp. 139 - 142), NRPN map (pp. 143 - 152, a row a line, 368 rows) and SysEx pages (pp. 152 - 155). **Built.** |
| AUTO Delay, Chorus, Reverb | Quick Guide, p. 9 (linked from `https://gamechangeraudio.com/auto/`) | 21 - 22 controllers, each in 7 bits on CC n or 14 on n and n + 32, values named one each or swept. **Built.** |
| Motor Pedal | Manual (v05), p. 9 | 12 controllers in the same form. **Built.** |
| Bigsby | CC & PC map (linked from `https://gamechangeraudio.com/downloads/`) | 31 controllers, twenty of them the MSB and LSB rows of ten values; program changes for presets and settings. **Built.** |
| PLUS Pedal II | Manual, p. 22 | 12 controllers with 14-bit pairs and named values; the text layer drifts from its rows, and a band's range is missing (`8 Layers =`). Not built. |
| Plasma Rack | MIDI control table (1 p.) | 19 controllers and 39 program changes; the text is set twice, a point apart, and its knobs are `0 - 1023` over `CC 14 / CC 46` without saying how the ten bits divide between them. Not built. |
| Plasma Voice | Instructions (2 pp.) | "Full MIDI control: Notes, velocity, CC, PC, SysEx", no table. Not built. |
| Recoder | MIDI implementation | lettering drawn as shapes, no text. Not built. |
| PLUS Pedal, Light Pedal, Plasma Pedal, Plasma Coil, Plasma Module | — | no MIDI table, or no MIDI. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-motor-maps.mjs` | The NRPN map from the PDF's word positions: the columns where the header puts them, a row its number, and a line without one the row's whose number is nearest (the MKII sets each cell vertically centred on its row: `UNIPOLAR` above the number, `FLOAT` below; a value range that does not fit wraps the same way). And the SysEx pages: a heading, then a field a line, its name and its bytes. |
| 1 | `read-pedal-cc.mjs` | A pedal's CC table from the PDF's word positions. The band form (`CC  NAME  MSB value range  MSB and LSB value range`): a row its number, a word the column its left edge is in (a band can overrun into the next column, `[85...`), a line without a number the row's whose number is on the cell's last line (the AUTO guides) or its first (the Motor Pedal), as the layout says. The Bigsby's (`Adjustment  Address  Range`): a row a line. |
| 2 | `import-gamechanger.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the documents, where each is linked from, and the pages of each part; a pedal's form. |
| 4 | `build-gamechanger-profile.mjs`, `build-pedal-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/gamechanger-*.ceditor-device.json`. |

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

## What the pedal builder takes as settled

- **The band form** gives each row twice, in 7 bits and in 14 (`CC[n] = MSB, CC[n+32] = LSB`). A row
  whose values sweep (`[0...127] = [0...1]`, `[min MOD...max MOD]`) is a 14-bit value over CC n and
  n + 32, its range the 14-bit column's, shown as the sweep's numbers where they are numbers (an
  attenuverter's `-1 ... 1` resting at its middle). A row whose values are named one each (`[0...42] =
  FAST, [43...84] = SLOW, [85...127] = GATE`) is a choice, a band's first 7-bit value sent on CC n
  alone, which the 7-bit column allows. The two columns must name the same values, or nothing is
  built (they print one sweep's dots differently, `[min MOD ..max MOD]`, which counts as the same).
- **The Bigsby's map:** an `X MSB` row and the `X LSB` row 32 above it are one 14-bit value; `0-63 –
  OFF, 64-127 - ON` is a choice; `0 - 127 (0 deg - 180 deg)` is the byte, shown as degrees. Where the
  map sets one thing two ways (the pedal's position on CC 27 and on CC 28 and 60), both are laid out.
- **Not laid out:** the program changes, which load and save presets and set what the knobs set.

## The profiles

| Profile | Rows | Parameters | Read back |
| --- | ---: | ---: | ---: |
| `gamechanger-motor-synth-mkii` | 464 | 461 | 461 |
| `gamechanger-motor-synth` | 368 | 365 | 365 |
| `gamechanger-auto-delay`, `gamechanger-auto-reverb` | 22 | 22 | no |
| `gamechanger-auto-chorus` | 21 | 21 | no |
| `gamechanger-motor-pedal` | 12 | 12 | no |
| `gamechanger-bigsby` | 31 | 21 | no |

## Not done

- **Value names.** The map prints enumerations as numeric ranges (`V1 WAVE 0 ... 3`); the manuals'
  chapters name the settings, and a map from one to the other would be written by hand.
- **Telling the two apart.** Both print the same family and member codes in the general info
  response. (The MKII's basic MIDI implementation says Device Inquiry "No"; its SysEx document prints
  the request and the reply.)
- **The PLUS Pedal II and the Plasma Rack**, whose tables would be read by hand: one's text drifts from
  its rows and drops a range, the other does not say how its ten bits divide over two controllers.
