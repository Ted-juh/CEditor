# Modal device profiles

Profiles for Modal Electronics instruments, read from the user manuals in the media library of
`modalelectronics.com` (the current instruments' manuals are not linked from their pages; the site's
`/wp-json/wp/v2/media` index lists them, and the manual archive the older ones). As with the other
brands, the manuals are not committed: what is committed is what was read from them, with each
file's name, SHA-256 and address.

## Survey (November 2026)

Every Modal manual ends with a **MIDI CC Implementation Chart**. No manual prints an NRPN list or a
SysEx format; the instruments' editor, MODALapp, talks to them in a protocol Modal does not publish.

| Manual | The chart |
| --- | --- |
| Argon8, Argon8X, Argon8M (v3); Cobalt8, 8X, 8M (v2); Cobalt5S; Carbon8, 8X, 8M; Element One | `CC  Function` four times across the page, every number 0 - 127 printed, `-` where unused; no values. The X and M models print their keyboard model's chart. The Carbon8's runs onto a page with text on MPE beside it. |
| 002, 008 (v1.03) | `Function  CC  Joystick Index  Sequence Index  Animator Index  Values` (the 008 without the indexes), two pages to a sheet, a value for each row: `0 - 127`, `OFF = 0 - ON = 127`, `0 - 48 (-24 OFFSET)`, `0 = LINEAR - 1 = EXPO` |
| SKULPTsynth SE (v2.1), CRAFTsynth 2.0 (v1.4) | `Function  CC  Values`, the values in words over several lines (`0 - 42 = Mono; 43 - 85 = Duo; 86 - 127 = Poly`, `0-32 Sine to Triangle / …`, `Dry - Wet`) |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `../nord/read-nord-cc.mjs`, `../behringer/read-behringer-tables.mjs` | The charts are read by the readers written for Nord's lists (the four-column charts, the number first) and the Behringer PolyEight's tables (`readAnchoredRows`: a value cell over several lines, set around its row). |
| 2 | `import-modal.mjs` | Writes `tables/<name>.json`: the chart's rows as printed, with the manual's name, SHA-256 and address. **This is what is committed.** A layout can clip a page to the chart (`clip`), stop above the folio (`bottom`), and keep one half of a sheet (`halves`). |
| 3 | `synths/<name>.mjs` | The layout: the manual, its pages, how its chart is set. |
| 4 | `build-modal-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
node tools/profiles/modal/import-modal.mjs argon8 argon8_MANUAL_v3.pdf
node tools/profiles/modal/make-profiles.mjs            # or --check
```

## What the builder takes as settled

- **A row is its controller**, a control change on the channel variable; `-` is a number unused.
- **Values, where the chart prints them**, read as the Behringer builder reads a range (`readRange`):
  a range is the parameter's; bands and named values a choice, a band's first value sent;
  `OFF = 0 - ON = 127` and `0 = LINEAR - 1 = EXPO` choices; `0 - 48 (-24 OFFSET)` the range sent,
  shown less the offset; `0 - 55 (0 - 63 in PW)` the wider. Bands that describe a sweep (`0-32 Sine to
  Triangle`, `64-127 PWM duty 50% - 5%`) are a continuous control in parts, so a number, the text in
  its description; so is anything else (`Dry - Wet`, `No Sync: 0 - 250 milliseconds / Sync: …`).
- **The 002's index columns** (the parameter's place in the joystick's, sequencer's and animator's
  destination lists) are kept in the description.
- **Left out by name:** the wheel, the pedals (the 002's and 008's `Sustain` on CC 64 among them),
  the joystick's axes, bank select, the 008's NRPN controllers (`NRPN MSB` on CC 6 and so on, its
  NRPN parameters not listed), and the channel mode messages.
- **Two rows on one controller** are both laid out and named: the SKULPTsynth SE prints its mod
  slots' sources and destinations both on 101 - 108 (the Argon8's are 100 - 107 and 108 - 115).

## The profiles

| Profile | Read from | Rows | Parameters | Choices |
| --- | --- | ---: | ---: | ---: |
| `modal-argon8`, `-argon8x`, `-argon8m` | ARGON8, 8X, 8M User Manual v3, p. 34 | 127 | 99 | 0 |
| `modal-cobalt8`, `-cobalt8x`, `-cobalt8m` | COBALT8, 8X, 8M User Manual v2, p. 33 | 127 | 98 | 0 |
| `modal-cobalt5s` | COBALT5S User Manual v1, p. 32 | 127 | 94 | 0 |
| `modal-carbon8`, `-carbon8x` | CARBON8, 8X User Manual v1, pp. 30 - 31 | 128 | 101 | 0 |
| `modal-carbon8m` | CARBON8M User Manual v1, p. 32 | 128 | 99 | 0 |
| `modal-element-one` | ELEMENT One User Manual, p. 28 | 127 | 98 | 0 |
| `modal-002` | MODAL 002 User Manual v1.03, pp. 47 - 49 | 127 | 107 | 56 |
| `modal-008` | MODAL 008 User Manual v1.03, pp. 46 - 48 | 127 | 61 | 16 |
| `modal-skulptsynth-se` | SKULPTsynth SE User Manual v2.1, pp. 19 - 21 | 101 | 93 | 15 |
| `modal-craftsynth-2` | CRAFTsynth 2.0 User Manual v1.4, pp. 21 - 22 | 74 | 66 | 7 |

None reads anything back.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Values on the newer instruments | their charts print controller numbers only | each manual's chapters, a list of settings for each selector |
| Pull | no SysEx format is published | Modal's own protocol, if it is published |
| The 008's NRPN parameters | the chart lists the NRPN controllers, not the parameters | a list of them, if Modal publishes one |
| The SKULPTsynth SE's true mod slot numbers | its chart prints sources and destinations on the same controllers | the instrument: send 101 and look |
