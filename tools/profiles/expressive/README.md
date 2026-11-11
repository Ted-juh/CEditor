# Expressive E device profiles

The Osmose's sound engine, read from the MIDI implementation chart Expressive E links from its help
center ("Osmose sound engine MIDI Implementation Chart", under 6. Advanced Users of the online
manual), a PDF on its own storage (`expressive-e.s3.us-east-1.amazonaws.com/CLA-Osmose/`). As with the
other brands, the chart is not committed: what is committed is what was read from it, with the
file's name, SHA-256 and address.

## Survey (November 2026)

| Document | What it gives |
| --- | --- |
| Osmose MIDI Implementation Chart, firmware 2.3.x rev. A | the MMA's chart form, v2.0: basic information, then `Control #  Function  Transmitted  Recognized  Remarks` for the controllers, for USB MIDI port 2 (the sound engine) |
| Osmose user manual for firmware 1.x (PDF) | an older CC chart; the 2.3 chart replaces it |

The chart's control table prints 0 - 62 and 64 - 126: CC 63 and 127 are not on it.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-mma-chart.mjs` | The control table of an MMA MIDI Implementation Chart v2.0 from the PDF's word positions: the header gives the columns, a row is a number left of `Function`, the function, `Yes` / `No` under Transmitted and Recognized, the remarks. Written for the form, not for the Osmose. |
| 2 | `import-expressive.mjs` | Writes `tables/<name>.json`, the table as printed. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the chart, its pages, the groups. |
| 4 | `build-expressive-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A row marked Recognized is its controller**, named as printed, its range the remarks' (`range:
  [0-127]`), on the channel variable: the remarks put every one on the master channel (channel 1,
  the MPE master).
- **Left out:** the wheel, the pedals, bank select and the MPE+ resolution byte, which are the
  player's; and the rows marked not recognized (EQ tilt and frequency), named.

## The profile

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `expressive-e-osmose` | 126 (34 with a function) | 14: six macros, pre and post gain, the global effect's four parameters and mix, the compressor mix |

It reads nothing back. The macros' destinations are set per preset, so what each changes depends on
the preset loaded.
