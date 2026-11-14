# Sonicware device profiles

Profiles for Sonicware instruments, read from the MIDI implementation charts Sonicware publishes for
each, listed on `sonicware.jp/pages/downloads` (the files on `www.sonicware.co.jp/DL/`). As with the
other brands, the charts are not committed: what is committed is what was read from them, with each
file's name, SHA-256 and address.

## Survey (November 2026)

Every instrument has a chart of its own, `…_manual_MIDI_en.pdf`, in the standard form (`Function
Transmitted  Recognized  Remarks`), its control changes listed a row each: the number, a mark under
Transmitted and Recognized (〇 or ×), the parameter's name as the remark. They come in blocks, each
labelled down the left (`Control *1 Change (PATTERN)`, `Control Change (MIXER) Works in TRACK CH`),
with the channel each answers on in a footnote or the label. No chart prints values, and none a
SysEx format.

| Chart | Read here |
| --- | --- |
| LIVEN XFM, Bass & Beats, Mega Synthesis, 8bit warps, Ambient Ø, Lofi-12, Lofi-6, Texture Lab | yes |
| CyDrums (V2; the V1 chart is the same less one row), Lofi-12 XT, SmplTrek | yes |
| ELZ_1, ELZ_1 play (V2, V3) | no: their charts are set otherwise (the controllers named by a macro, without the remarks column) |
| deconstruct MINIMAL | no: a matrix, the tracks as columns |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-sonicware-chart.mjs` | A chart → its control changes as printed. The rows are read first (a number in its column, the marks, the remark); they fall into runs at the wider space between blocks; each run takes the label set beside it. The number column is found from the chart: where most of its lone numbers stand. |
| 2 | `import-sonicware.mjs` | Writes `tables/<name>.json`, the columns found from the chart's header. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the chart, and which blocks are on which channel. |
| 4 | `build-sonicware-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, its name the chart's remark, its group the word in its block's label
  (`(TRACK)` → Track); a row marked × under Recognized is left out, the instrument only sending it.
- **Values are 0 - 127**, the charts printing none.
- **Channels:** the XFM's and Bass & Beats' pattern block is on `patternChannel` (PT.CH), the rest on
  the track's; the CyDrums', Lofi-12 XT's and SmplTrek's project blocks on `projectChannel`, the rest
  on the track's (or the AUTO channel). The others print no channels: one channel variable.
- **Left out:** the wheel, the pedals, the channel mode messages (all sound off).

## The profiles

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `sonicware-liven-xfm` | 43 | 43 |
| `sonicware-liven-bass-and-beats` | 35 | 35 |
| `sonicware-liven-mega-synthesis` | 26 | 26 |
| `sonicware-liven-8bit-warps` | 37 | 37 |
| `sonicware-liven-ambient-0` | 45 | 45 |
| `sonicware-liven-lofi-12` | 43 | 43 |
| `sonicware-liven-lofi-6` | 43 | 43 |
| `sonicware-liven-texture-lab` | 51 | 51 |
| `sonicware-cydrums` | 123 | 122 |
| `sonicware-lofi-12-xt` | 101 | 100 |
| `sonicware-smpltrek` | 33 | 33 |

None reads anything back.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Values | the charts print none | each manual's chapters |
| The ELZ_1 and ELZ_1 play, the MINIMAL | their charts are set otherwise | a reader for each |
| The channels' defaults | not printed in the charts | each manual's MIDI settings chapter |
