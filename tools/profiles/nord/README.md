# Nord device profiles

Profiles for Nord (Clavia) instruments, read from the user manuals on `www.nordkeyboards.com` (each
link there redirects to `assets.nordkeyboards.com`). As with the other brands, the manuals are not
committed: what is committed is what was read from them, with each file's name, SHA-256 and address.

## Survey (November 2026)

Every Nord manual but the Modular's ends its MIDI chapter with a **MIDI controller list**: each
panel control and the controller it sends and answers to. None prints values: the older ones say an
on/off button is 0 and 127 and a selector steps up from 0, in equal steps or by 1. Thirty-two English
manuals are on the downloads pages, current and legacy; one profile is read from each list.

| Manual | The list |
| --- | --- |
| Lead A1 1.3x, Lead 4 1.3x | `Nord Lead A1 parameter  MIDI CC`, two lists, the left one under the paragraph that starts it |
| Lead 3 1.2x | `Nord Lead 3 Parameter  MIDI Controller #  MIDI Controller Name`, under section headings (`Voice mode parameters`), four pages; a SysEx implementation follows it |
| Lead 2X, Lead 2, Lead (OS 2.0) | `Nord Lead 2 Parameter  MIDI Controller #  MIDI Controller Name`, two pages |
| Wave 2 1.2x | three lists side by side under `Nord Wave 2 Parameter  MIDI CC #` |
| Wave 2.x | two lists, their headers over two lines (`Nord Wave` over `Parameter`), the left one under a paragraph |
| Stage 4 1.6x | `CC#/NRPN`: NRPNs printed `2:22`, the value on CC 38 with CC 6 at 0, as the manual says |
| Stage 3, Stage 2, Stage 2 EX | three lists side by side; the Stage 2's names start left of their header |
| Electro 7 (61 and 73 HP, one list), Piano 6, Grand 2 | as the Stage 4's, NRPNs among the controllers |
| Electro 6, 5, 4 HP/SW, 4D, 3; Piano 5, 4, 3; Grand | `MIDI CC #`; the Electro 3 and 4's two sets of drawbars under `Drawbars - Preset 2/Upper` and `Preset 1/Lower` |
| Organ 3, C2D | an asterisk for a row on more than one manual's channel |
| C1 | `Function  MIDI CC Number  Comment` over three lines, the comment naming the channels each row is on |
| Drum 3P, Drum 2 | `MIDI CC  Parameter`, the number first; the Drum 2's runs on in a column with no header |
| Modular G2 | no fixed list: a patch's knobs are assigned their controllers |
| Lead 3 Sound Manager | the librarian's manual |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-nord-cc.mjs` | A manual's controller list → its rows as printed: name, number column (`74`, `2:22`, `2:32-34`, `59, 65`), the column after it, the heading over it. Decides nothing. |
| 2 | `import-nord.mjs` | Writes `tables/<name>.json`: those, with the manual's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the manual, the pages its list is on, an organ's manuals and which rows are on which, notes. |
| 4 | `build-nord-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
node tools/profiles/nord/import-nord.mjs lead-a1 "Nord Lead A1 English User Manual v1.3x Edition F.pdf"
node tools/profiles/nord/make-profiles.mjs            # or --check
```

## Reading the lists

A header is a name column whose title ends in `Parameter` (or is `Function`) and a number column
(`MIDI CC`, `MIDI CC #`, `MIDI Controller #`, `CC#/NRPN`), either way round, and maybe a column after
it (`MIDI Controller Name`, `Comment`). Its words are grouped into columns by the gaps between them; a
header over two or three lines is read the same way, its lower lines' header words joined to the
column they stand under (the lists beside it may have rows on those lines). Each list starts at its
header: up to three stand side by side, and on the Lead A1's and Lead 4's pages the left one starts
lower, under its paragraph, than the right.

A row is a line's words in one list: the name, then the number after the widest gap that leaves only
numbers (`Organ Drawbar 9  24`: the `9` is the name's), or, the number first, the first word. A line
with no number is a heading where it ends in `parameters` or names a part (`Drawbars - Preset
1/Lower`), kept with every row after it and carried over a page break (the Lead 3 sets `Oscillator 1
parameters:` at a page's foot); the rest of the row above where it starts in lower case (`menu)`);
and otherwise not the list's. The running header and footer (`48 | Nord Lead 4 …`) are skipped.

## What the builder takes as settled

- **A row is the message it prints.** `74` is that control change; `2:22` the NRPN whose MSB (CC 99)
  and LSB (CC 98) those are, the value on CC 38 with CC 6 at 0. `2:32-34` under `Piano
  Type/Model/Variation` is three NRPNs, a name for each.
- **Values are 0 - 127**, the lists printing none, but for a value list in a name (the C2D's `Rotary
  Speaker Control (0 = Slow, 64 = Stop. 127 = Fast)`), which is a choice.
- **The channel is a variable.** Most Nords send their panel's controllers on the Global channel;
  the Lead A1's and Lead 4's go to the Slot in focus on it, or to one Slot on its own channel; the
  Drum 3P's to the drum channel selected. Each layout says what its manual says.
- **The organs' manuals each have a channel.** The Organ 3's asterisked drawbars are the Upper's and
  the Lower's, its two `Bass Pedal` rows the Pedal's; the C2D's drawbars are under `Drawbars - Sep.
  for Swell, Bass and Great MIDI CH` and laid out on all three, its other asterisked rows on the
  Swell and the Great; the C1's comment column names the channels of each row. A parameter for each.
- **A name printed twice** is told apart by the heading over it (`Drawbar 1 (Preset 1/Lower)`).
- **Two rows on one message** are both laid out, and the profile names them: the Electro 7's NRPN
  3:20 (`Synth FM Amount`, `Synth FM Spectra Env Amt`), the Wave 2's CC 94, the Wave's CC 17, the
  Electro 3's CC 117, the Organ 3's CC 44.
- **Left out by name:** the pedals (sustain, sostenuto, soft, control, volume, swell), the wheel,
  bank select. A setting named after a pedal (`Piano Sustain Pedal`, whether the piano takes it) is
  kept.

## The profiles

| Profile | Read from | Rows | Parameters | NRPNs | Left out, unreadable |
| --- | --- | ---: | ---: | ---: | --- |
| `nord-lead-a1` | Lead A1 User Manual 1.3x F, p. 34 | 61 | 54 | 0 | — |
| `nord-lead-4` | Lead 4 User Manual 1.3x H, p. 48 | 92 | 86 | 0 | — |
| `nord-lead-3` | Lead 3 User Manual 1.2x, pp. 145 - 148 | 90 | 89 | 0 | — |
| `nord-lead-2x` | Lead 2X User Manual 1.0x, pp. 105 - 106 | 42 | 42 | 0 | — |
| `nord-lead-2` | Lead 2 User Manual 1.0, pp. 91 - 92 | 42 | 42 | 0 | — |
| `nord-lead` | Lead User Manual 2.0, pp. 91 - 92 | 41 | 41 | 0 | — |
| `nord-wave-2` | Wave 2 User Manual 1.2x G, p. 36 | 87 | 83 | 0 | — |
| `nord-wave` | Wave User Manual 2.x, p. 61 | 69 | 69 | 0 | — |
| `nord-stage-4` | Stage 4 User Manual 1.6x N, pp. 68 - 69 | 145 | 139 | 50 | Organ Preset (`16-24`), Synth Sample Cat/Sample (`3:4:x:x`) |
| `nord-stage-3` | Stage 3 User Manual 2.6x N, p. 60 | 111 | 105 | 0 | — |
| `nord-stage-2` | Stage 2 User Manual 1.7x J, p. 52 | 112 | 104 | 0 | — |
| `nord-stage-2-ex` | Stage 2 EX User Manual 2.x B, p. 52 | 112 | 104 | 0 | — |
| `nord-electro-7` | Electro 7 61 User Manual 1.2x E, pp. 49 - 50 | 125 | 118 | 20 | Organ Preset Select (`59, 65`), Piano Select (`2:32-34`) |
| `nord-electro-6` | Electro 6 User Manual 2.6x J, p. 33 | 82 | 75 | 0 | — |
| `nord-electro-5` | Electro 5 User Manual 1.x E, p. 21 | 82 | 78 | 0 | — |
| `nord-electro-4-hp-sw` | Electro 4 HP/SW User Manual 1.1x F, p. 22 | 68 | 66 | 0 | — |
| `nord-electro-4d` | Electro 4D User Manual 1.1x D, p. 22 | 67 | 65 | 0 | — |
| `nord-electro-3` | Electro 3 User Manual 3.x, p. 25 | 67 | 65 | 0 | — |
| `nord-piano-6` | Piano 6 User Manual 1.1x C, p. 34 | 81 | 77 | 2 | — |
| `nord-piano-5` | Piano 5 User Manual 1.2x D, p. 27 | 71 | 61 | 0 | — |
| `nord-piano-4` | Piano 4 User Manual 2.5x E, p. 25 | 59 | 50 | 0 | — |
| `nord-piano-3` | Piano 3 User Manual 1.x D, p. 20 | 58 | 52 | 0 | — |
| `nord-grand-2` | Grand 2 User Manual 1.0x B, p. 33 | 78 | 74 | 2 | — |
| `nord-grand` | Grand User Manual 1.6x D, p. 25 | 59 | 50 | 0 | — |
| `nord-organ-3` | Organ 3 User Manual 1.0x C, p. 33 | 64 | 71 | 0 | — |
| `nord-c2d` | C2D User Manual 1.1x C, p. 23 | 50 | 86 | 0 | — |
| `nord-c1` | C1 User Manual 1.0x, p. 17 | 40 | 51 | 0 | — |
| `nord-drum-3p` | Drum 3P User Manual 1.x C, p. 15 | 36 | 34 | 0 | — |
| `nord-drum-2` | Drum 2 User Manual 3.0x F, p. 32 | 39 | 37 | 0 | — |

None reads anything back.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Pull, on every Nord | the manuals print program dumps as something to send and receive, not their bytes. The Lead 3's is the exception, and was read (November 2026): its requests (`F0 33 dev 09 30 slot 00 F7`), the dump's header, and a table of its bit fields, 114 of them from 1 to 208 bits, `viewed as a bit stream … most significant bit first` and `8 to 7 bit converted`. But the table's fields come to 1,340 data bits (192 bytes as 7-bit bytes, a 234-byte message), the message table prints 210 bytes of patch data (252), and the text says a dump is 261 bytes; nor does it say which 8-to-7 conversion it means (the bit stream cut into 7-bit bytes, or 7 bytes and a byte of their high bits) | one dump from the instrument, to see which of the three counts it sends and how its bits sit |
| Values | the lists print controller numbers only; a selector's steps are its settings spread over 0 - 127 | each manual's chapters, a list of settings for each selector |
| The Stage 4's organ presets (`16-24`) and sample choice (`3:4:x:x`), the Electro 7's organ preset (`59, 65`) and piano choice (`2:32-34` under one name) | not one message, and not explained | the instrument: send each and look |
| The Modular G2's controllers | assigned in each patch | a patch's own assignments |
