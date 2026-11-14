# Dexibell device profiles

Five Dexibell instruments with a tonewheel organ section, read from the "Received data" of their
MIDI Implementation documents, which Dexibell links from each product's page
(`https://www.dexibell.com/en/prodotti/<model>/`, the files under
`https://www.dexibell.com/wp-content/uploads/`). As with the other brands, the documents are not
committed: what is committed is what was read from them, with each file's name, SHA-256 and where to
get it.

## Survey (November 2026)

| Instruments | Document | What it gives |
| --- | --- | --- |
| VIVO S8, S8M, S4, S2 | S8_S8M_S4_S2_Midi-Implementation.pdf | the general controllers; the tonewheel organ's 27 drawbars (Main, Lower, Pedal), percussion, overdrive, rotary, vibrato and presets, on the organ's channel (14 by default). **Built.** |
| VIVO S10, S10L | S10_S10L_Midi-Implementation.pdf | the same. **Built.** |
| VIVO S9 | S9_Midi_Implementation.pdf | the same, without the organ presets. **Built.** |
| VIVO SX8 | SX8_Midi-Implementation.pdf | the same, the drawbars as Upper, Lower and Pedal. **Built.** |
| COMBO J7 | J7_Midi_Implementation_Ver_1.02.pdf | Upper, Lower and Pedal drawbars and the organ controls, without presets. **Built.** |
| VIVO S1, S3/S7, S3 PRO/S7 PRO, SX7, P3/P7, H1/H3/H5/H7, H6, H10, CLASSICO L3, L4 | their MIDI Implementations | only the general controllers (bank, modulation, volume, pan, expression, pedals, reverb), most of them performance controllers. Not built. |

Every document marks System Exclusive as neither sent nor received. No NRPN.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-dexibell-midi.mjs` | The blocks, from the PDF's word positions: two side by side on a page (split where a line's second `Status` starts), each a heading `Name (Controller number N)`, its channel line, its `vv=` line, what its values mean and its notes; a footage's fraction set just below its heading joined to it. The document prints the received messages and then the same as transmitted, with no heading of its own: the second half starts on the first page whose notes say "Not transmitted". |
| 2 | `import-dexibell.mjs` | Writes `tables/<name>.json`, the received blocks. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the document and where it is linked from; the J7's note. |
| 4 | `build-dexibell-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/dexibell-*.ceditor-device.json`. |

## What the builder takes as settled

- **A block is its controller**: the organ's (`default midi ch.14`) on the variable `organChannel`, set
  to 14, the others on the channel variable. Each is received only while its RX setting is on.
- **Values:** points named one each (`0H = 0, 10H = 1, … 7FH = 8`, `00H = Off, 7FH = On`, `00H=V1,
  08H=C1, …`) are a choice of those values; bands (`0~63= OFF, 64~127= ON`) a choice, a band's first
  value sent; two numbered ends (`00H = 00, 7FH = 100`) the range shown so; otherwise the byte range.
- **The drawbars' levels.** Every list prints `60H = 7` as well as `70H = 7` and no level 6; 60H is read
  as 6, the level its place in the order shows. That is an inference, and each profile says so.
- **Left out, and named:** bank select, the performance controllers (modulation, expression, hold,
  sostenuto, soft) and the channel mode messages.
- **The J7's Vibrato Mode** prints `00H = 2nd, 7FH = 3rd`, the percussion harmonic's values, where the
  S8's prints V1 - C3; it is laid out as printed and its profile says so.

## The profiles

| Profile | Parameters | Choices |
| --- | ---: | ---: |
| `dexibell-s8`, `dexibell-s10`, `dexibell-sx8` | 48 | 38 |
| `dexibell-s9` | 43 | 36 |
| `dexibell-j7` | 43 | 40 |

The organ presets print a byte range (`00H~17H`) beside numbers of another width (`1~23`); they are
laid out as the byte range.

## Not done

- **The instruments with only general controllers**, whose profiles would hold little but volume, pan
  and reverb.
- **Read-back.** System Exclusive is not received; the instrument transmits the same controllers when
  their TX settings are on.
