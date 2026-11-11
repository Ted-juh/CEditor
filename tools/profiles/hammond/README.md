# Hammond device profiles

The SK1/SK2, SKX and XK-1c, read from the MIDI INFORMATION appendix of each owner's manual, which
Hammond links from its Legacy SK page (`https://hammondorganco.com/legacy-sk`). As with the other
brands, the manuals are not committed: what is committed is what was read from them, with each
file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| SK1 / SK2 | Owner's Manual V1.50 (2013), pp. 140 - 148 | **every global, patch and Leslie parameter**: its NRPN, SysEx address and length, data and value names, and for the globals a default; the drawbar controllers; the SysEx formats and the Identity Reply. **Built.** |
| SKX | Owner's Manual V1.01 (2018), pp. 140 - 148 | the same, for its two manuals' extra voice zones and the Prochord. **Built.** |
| XK-1c | Owner's Manual V1.00 (2013), pp. 124 - 132 | the same, without the extra voice. **Built.** |
| XK-5, XK-4, SK PRO, SKX PRO, SK-1/SK-2 (2026), SKX (2024), M-solo | Reference Guides | the same kinds of tables, but printed as pictures with no text layer; OCR gives noisy rows. Not built. |
| SK PRO, SKX PRO, XK-4, XK-7 | newer owner's manuals | linked from Hammond's pages but hosted on `www.suzuki-music.co.jp`, which this environment cannot reach. Not built. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-hammond-tables.mjs` | The Global, Patch and Leslie tables from the PDF's word positions: the columns from each table's header (centred over its column), a row by its run of two-character codes (NRPN LSB and MSB, SysEx address and length; eight codes for Leslie's two NRPNs), its data going on below in lines of its own (a list printed in two columns kept as two, a wrapped label joining its own column's item). And the examples under the tables, what their placeholders stand for (`“n” means Zone number`), the Drawbar Data List 2 and the Identity Reply. |
| 2 | `import-hammond.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, its pages, and the one thing the tables cannot say (a category printed over two rows, `Upper` then `Registration`). |
| 4 | `build-hammond-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/hammond-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its NRPN on the Upper channel**, as the examples send it: the table prints the LSB first
  (`Bx 62 01 63 00` for `01 00`); a one-byte value goes out on CC 6 alone, a two-byte one as its two
  7-bit bytes on CC 6 and CC 38 (Master Tune `0338` is 3 × 128 + 56 = 440).
- **The NRPN is the SysEx address's last two bytes** on every row but a few. Where they differ, the
  one no other row has is taken: Vibrato On Swell prints Vibrato Mode's NRPN (`09 04`; its address is
  `09 02`, which the SKX's manual prints as its NRPN), the extra voice's EQ Tone Control prints the
  organ's (`30`, its address `3p`), and on the SKX the extra voice's rows print an address without
  their zone (`50` for `5n`) and Balance prints Volume's address. Each is named in its profile.
- **Placeholders** are each value the notes give them: `4n` the external zones 1 - 3, `3p` the organ
  and the extra voice.
- **The data**: a list naming every value of its range is a choice (Organ Type, Reverb Type); a
  pair with names is a choice of two (`00, 01 (Slow / Fast)`); a range whose shown values are integers
  as wide as it is shown so (`(1 - 16)` over `00 - 0F`); anything else is a number with the printed
  data in its description. `same as above` and `same as FS Tip mode` are the rows they name.
- **The drawbars**, which have no NRPN, are the Drawbar Data List 2's controllers (Upper 12 - 20,
  Lower 21 - 29, Pedal 33 and 35), each level sent as the first value of its band.
- **Left out, and named:** the rows with no NRPN (the patch and Leslie names, the Display settings),
  Min. Limit HF (whose data cell it shares with Min. Limit LF), and the Leslie rows' second NRPN, the
  one the instrument switches to itself when a Leslie is connected. The Leslie rows print no data and
  are laid out 0 - 127.
- **Not by SysEx.** Every row has a Data Set address (`F0 55 dd 10 <model> 13 <address> <data> F7`),
  but the manual gives the device ID as a setting (1 - 32) and not the byte it sends, and its examples
  carry other models' IDs (the SK manual's `10 1D`, the XK-1c's `10 1F`).

## The profiles

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `hammond-sk1-sk2` | 194 | 241 |
| `hammond-skx` | 210 | 273 |
| `hammond-xk-1c` | 178 | 204 |

(More parameters than rows: the zone and section rows are one per zone or section, and the drawbars
are added from their own list.)

## Not done

- **Pull.** The dumps are packets of nibblized ASCII data whose layout the manuals do not print.
- **SysEx editing**, for the names: the device ID's byte is not printed.
- **The newer models**, whose guides print these tables only as pictures.
