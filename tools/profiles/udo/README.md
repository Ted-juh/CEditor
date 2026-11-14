# UDO device profiles

Profiles for UDO Audio instruments, read from the owner's manuals on `udo-audio.com`'s support pages
(the files on UDO's Webflow host, `cdn.prod.website-files.com`). As with the other brands, the
manuals are not committed: what is committed is what was read from them, with each file's name,
SHA-256 and address.

## Survey (November 2026)

Each manual ends with **MIDI Specifications**: a table of continuous controllers (`CC #  Value Range
Parameter Name`, a value list over several lines around its row: `0 = Triangle  21 = Square …`), a
table of RPNs, and a table of NRPNs (`NRPN  NRPN MSB  NRPN LSB  Value Range  Parameter Name`), the
Super 6's in two parts, global settings and patch parameters. The NRPNs carry the continuous
parameters at 14 bits (`0-16383`); the switches and selectors are in the controller table only. The
manual's navigation runs down the left of every page. No SysEx format is published.

| Manual | Instruments |
| --- | --- |
| UDO Super 6 Owner's Manual | Super 6 (keyboard and desktop) |
| UDO Super Gemini & Super 8 Owner's Manual | Super 8 and Super Gemini, one set of tables; the Gemini's two layers on the base channel and the one above it |
| DMNO, RBN-1, SP8, SuperTouch 49 | not read here: a drum machine, effects and a controller |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `../behringer/read-behringer-tables.mjs` | Both tables are read by the Behringer anchored-row reader (`readAnchoredRows`), the navigation a column of its own, dropped. |
| 2 | `import-udo.mjs` | Writes `tables/<name>.json`: the controllers and NRPNs as printed, with the manual's name, SHA-256 and address. **This is what is committed.** A table can end at a heading on its last page (`until`: the Super 6's RPN table under its controllers). |
| 3 | `synths/<name>.mjs` | The layout: the manual, the pages and columns of each table, a model's own names for the rows the manual names for both, the Gemini's layers. |
| 4 | `build-udo-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A parameter the NRPN table gives is that NRPN, 14 bits**, its MSB and LSB as printed and checked
  against its number (1098 = 08H × 128 + 4AH). The manual: with MIDI CC Receive on, the instrument
  "will always respond to both parameter changes sent in 7 and 14 bit resolution", so the
  profile sends each parameter the finer way it has, and names the controller beside it.
- **Every other row of the controller table is its controller**, `0-127` a range, a value list a
  choice of the values printed (they are the thresholds, so each is that setting).
- **A value list printing its two ends** (`0 = MIDI Channel 1  15 = MIDI Channel 16`) is a range,
  shown as its labels number it.
- **The Super Gemini** has every parameter twice, the upper layer's on the channel variable and the
  lower's on `lowerChannel`, as the manual assigns them. A row the manual names for both models
  (`Lower Layer Detune (Super Gemini) Layer Detune (Super 8)`) is named by each layout for its own,
  and the Super 8's receive-only `Performance Detune` is left off the Gemini.
- **Left out by name:** the lever and wheel, the ribbon, the pedals, bank select, data entry, the
  NRPN and RPN controllers and the channel mode messages.

## The profiles

| Profile | Read from | Controllers | NRPNs | Parameters | Choices |
| --- | --- | ---: | ---: | ---: | ---: |
| `udo-super-6` | Super 6 Owner's Manual, pp. 121 - 132 | 128 | 101 | 82 | 38 |
| `udo-super-8` | Super Gemini & Super 8 Owner's Manual, pp. 116 - 128 | 128 | 112 | 87 | 36 |
| `udo-super-gemini` | the same | 128 | 112 | 172 | 72 |

None reads anything back.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Pull | no SysEx format is published | UDO's, if it publishes one |
| The modulation matrix's slots | neither table lists them | a list of them, if UDO publishes one |
| The RPNs (bend range, tuning) | channel settings, not the patch | an RPN recipe, if wanted |
