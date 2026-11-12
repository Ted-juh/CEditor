# Gotharman device profiles

Five Gotharman instruments, read from their user manuals, which Gotharman links from each
instrument's manual page (`https://gotharman.dk/ld3_manual`, `/ldzero_manual`, `/tiny_ld_manual`) and,
for the older designs, from `https://gotharman.dk/earlier_designs` (the files under
`https://gotharman.dk/onewebmedia/`). As with the other brands, the manuals are not committed: what is
committed is what was read from them, with each file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| Anamono | Anamono User Manual, pp. 78 - 95 | the **parameter list**: 244 parameters by section, each with its NRPN (CC 99/98 in hex), what its value means, and a hard-wired controller for 140 of them (some only in the primary or secondary controller set). NRPN values are 8 bits in the 14-bit mode. **Built.** |
| LD3, LD3 MkII PolyTouch | user manuals 14.19 and 15.93, pp. 551 - 553 and 617 - 619 | `PARAMETER  CC#  PART NUMBER`: 101 parameters, 36 of them each part's on its own channel. The two lists are the same. **Built**, one profile. |
| LD Zero | user manual 1.57, pp. 579 - 581 | the same form, 84 parameters. **Built.** |
| Tiny LD | user manual 15.82, pp. 563 - 565 | the same form, 75. **Built.** |
| SpazeBoard6 | user manual 82.03, pp. 374 - 376 | the same form, 75, parts on 8, 6 or 16 channels. **Built.** |
| deMOON, SpazeDrum, Urano, Zaturn, Zaturn Zero, Little deFormer 2, FX deFormer, Anamono X and Xmini, PolySpaze | their manuals | controllers as modulation sources or assignable edit knobs, or a numbered list without ranges (deMOON); no parameter map. Not built. |
| Tuul, Touch Tuul, EuroBoard MkII | their manuals | Eurorack; no MIDI parameters. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-gotharman-manual.mjs` | The Anamono's list from the PDF's word positions: a section a title, a header (`Parameter  Values  MIDI ctrl  NRPN 99  NRPN 98`), a row on the line with its NRPN numbers and its cells wrapping below it; a word is the column its left edge falls in, a cell starting left of its centred title (a controller's `Secondary` under `MIDI`). The MIDI page's sections have no numbers. And an LD list from `pdftotext -layout`: a row a line, a name going on below. |
| 2 | `import-gotharman.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, where it is linked from, its pages and its form. |
| 4 | `build-gotharman-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/gotharman-*.ceditor-device.json`. |

## What the builder takes as settled

- **The Anamono: every numbered row is its NRPN, its 8-bit value on data entry.** The manual's 14-bit
  mode takes "the LSB bit from the controller 6 value and the 7 LSB bits from the controller 38 value"
  as "a complete 8 bit value", which is data entry's MSB and LSB for a value up to 255. The instrument's
  NRPN mode must be set to 14b.
- **What a value means**, from its Values cell: a range from 0 is that range; a range that starts
  elsewhere (`-128 to +127`, `-32 to +31`, `1 to 256`) is counted from 0 at its low end and shown as
  printed; a list of names (`Lpf, Bpf, Hpf`, `On/Off`, `Sustain, Continue, Loop`) is a choice counted
  from 0 in the order printed; the modulation sources are 0 - 15, `Off` first where the cell offers
  it; anything else (`Morph from sine to …`) is the whole byte. The manual does not say how values are
  numbered, so all but the first are an inference, and the profile says so.
- **The LD instruments: every row is its controller, 0 - 127.** A part's parameter is sent on the
  variable `partChannel` ("MIDI channel are equal to part number"), the instrument's on the channel
  variable. The instrument answers only with its MIDI In mode set to Omni or Multi-Timbral and PccIN on.
- **Left out, and named:** the Anamono's MIDI page (channel, NRPN mode, controller set, the edit knobs'
  assignments), which has no NRPNs.

## The profiles

| Profile | Parameters |
| --- | ---: |
| `gotharman-anamono` | 244 (28 choices) |
| `gotharman-ld3` | 101 |
| `gotharman-ld-zero` | 84 |
| `gotharman-tiny-ld` | 75 |
| `gotharman-spazeboard6` | 75 |

## Not done

- **The LD instruments' ranges**: the manuals give the parameters' own ranges (0 - 511, -256 … +255)
  but not how a controller's 0 - 127 maps onto them.
- **Read-back.** None of the manuals prints a dump.
