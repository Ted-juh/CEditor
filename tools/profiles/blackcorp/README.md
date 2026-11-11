# Black Corporation device profiles

Profiles for Black Corporation instruments, read from the operation manuals on each product's support
section of `black-corporation.com` (the files under `/m/assets/support/`). As with the other brands,
the manuals are not committed: what is committed is what was read from them, with each file's name,
SHA-256 and address.

## Survey (November 2026)

Every manual of an instrument with MIDI ends on a `MIDI CC CHART`, a row a controller, its number
first (`CC48`).

| Manual | Its chart |
| --- | --- |
| Deckard's Dream MK2 2.3.0 | `MIDI CC  RANGE  FUNCTION`: ranges (`0-127`), centred ranges (`0-64-127`), bands (`0-64 / 65-127`, six for FEET and the sub-oscillator's function) |
| Kijimi MK2 2.0.0 | `MIDI CC  FUNCTION`, no values |
| Xerxes MK2 1.1.1 | the function alone, the pots under `CHANNEL 1`, the buttons under `CHANNEL 2` (the same numbers on both), no values |
| Ise-Nin 1.1.4 | `CC NUMBER  FUNCTION  LAYER` (`UPPER`, `LOWER` or blank), no values |
| Deckard's Voice, Ise-Non Voice, Rachael | none: Eurorack modules without MIDI |

The MK1 instruments' documents are not on the site (`deckardsdream.com`, where the first Deckard's
Dream's MIDI chart was, is now someone else's).

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-black-chart.mjs` | The chart from the PDF's word positions: a row is a line whose first cell is `CCn`; the cells after it (words less than 12 points apart) are told apart by what they hold, a range digits, dashes and slashes, a layer `UPPER` or `LOWER`, the rest the function. A `CHANNEL n` heading is the block the rows under it are in. Lines a few points apart are one, and a name made of underscores loses its spaces: the Xerxes's names are set above their number and broken inside a word. |
| 2 | `import-black.mjs` | Writes `tables/<name>.json`, the chart as printed. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the manual, its chart's pages, the groups, the bands' settings, the channels. |
| 4 | `build-black-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, named as printed less the control's kind (`SLIDER`, `POT`, `KNOB`,
  `BUTTON`, `SWITCH`, kept in the description), the Xerxes's underscores read as spaces. A name the
  chart prints on two controllers (the Kijimi's `MOD LFO2 TO LPF`, CC 14 and 114; the Xerxes's
  `POT_LFO2_FREQ`, CC 60 and 81) is laid out twice, each named with its number.
- **Values as printed:** `0-127` a range; `0-64-127` a range centred on 64, shown -64 - 63; bands a
  choice, each band's first value sent, named as the layout says from the manual's own description of
  the control (`Off` and `On` for a switch it says nothing more about). No values printed: 0 - 127.
- **Channels:** the Xerxes's `CHANNEL 2` block is on `secondChannel` (2), everything else on
  `channel`. The Ise-Nin's layers share the channel, each with controllers of its own.
- **Left out:** bank select, the wheel, the sustain pedal, and CC 74, the MPE controllers' slide,
  whose destination the instrument's `CC74 REPLACE` setting chooses.

## The profiles

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `black-corporation-deckards-dream-mk2` | 80 | 76 |
| `black-corporation-kijimi-mk2` | 88 | 84 |
| `black-corporation-xerxes-mk2` | 68 | 68 |
| `black-corporation-ise-nin` | 98 | 94 |

None reads anything back.

## What is open, and what would settle it

| Open | Why | What would settle it |
| --- | --- | --- |
| Which end of the Deckard's Dream's six bands is 16′ (and sine) | the manual lists the settings top to bottom, the chart its bands from 0; the profile takes 0 - 21 as the top | sending CC 102 = 0 to the instrument |
| The Xerxes's two channels | the chart says `CHANNEL 1` and `CHANNEL 2` and nothing more | the instrument, set to another channel |
| The Kijimi's, Xerxes's and Ise-Nin's values | their charts print none | each manual's chapters, or the instrument |
| The Deckard's Dream's DETUNE | the manual's mod wheel list gives CC 95, the chart CC 32 | the instrument |
