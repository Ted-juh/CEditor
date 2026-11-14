# Erica Synths device profiles

Profiles for Erica Synths instruments, read from the manuals on each product's page of
`ericasynths.lv` (served by its download service, `/service/file/download/product_id/…/file_id/…/`).
As with the other brands, the manuals are not committed: what is committed is what was read from
them, with each file's name, SHA-256 and address.

## Survey (November 2026)

| Instrument | Its manual's MIDI chart | Read here |
| --- | --- | --- |
| PĒRKONS HD-01 | `MIDI IMPLEMENTATION`: a parameter a row, a controller under each of its four voices (SINGLE MIDI CHANNEL mode) | yes |
| LXR-02 | `9.7 MIDI CC LIST` and `9.8 MIDI NRPN LIST`: `CC  Function  Voice`, `NRPN Nr.  Function  Voice`, three lists to a page | yes |
| Syntrx II | two assignable controllers (the joystick's X and Y), no chart | no |
| Steampipe | every control is on a controller, mapped in its MIDI CC MAP menu; the factory map is not printed | no |
| Bullfrog, Bullfrog XL, DB-01 | notes, the wheel and clock; no chart | no |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-erica-charts.mjs` | The chart from the PDF's word positions. The matrix: the `VOICE n` header gives the columns, a row is a name and a number under each. The lists: each `CC` / `NRPN Nr.  Function  Voice` header starts a list at its number column, a row is a number there, the function after it, the voice under the header; a page's footer (`36  LXR OWNERS MANUAL`) is passed over. |
| 2 | `import-erica.mjs` | Writes `tables/<name>.json`, the chart as printed. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the manual, its pages, its shape, what each switch selects. |
| 4 | `build-erica-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A cell or row is its controller or NRPN**, named as printed, grouped by its voice (`Voice 1` …;
  `all` is All voices, `-` the effects or Global).
- **An NRPN** goes out as the LXR's own list says: CC 99 (NRPN coarse), CC 98 (NRPN fine, the
  number), CC 6 (NRPN data entry, the value). Those three are not parameters.
- **Values are 0 - 127**, no chart printing any. The PĒRKONS's switches say in their description
  what the manual says they select (three algorithms, three modes, HP / BP / LP).
- **Left out:** numbers listed with no function (`-`).

## The profiles

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `erica-perkons-hd-01` | 44 | 44 |
| `erica-lxr-02` | 246 | 233 (123 controllers, 110 NRPNs) |

None reads anything back.

## What is open, and what would settle it

| Open | Why | What would settle it |
| --- | --- | --- |
| The switches' values | the chart prints none | the instrument |
| The PĒRKONS in MULTI MIDI CHANNEL mode | each voice answers Voice 1's controllers on its own channel: the profile's Voice 1 group, with the channel set | a variant with a channel variable for each voice |
| The LXR-02's values | its lists print none | the instrument, or the firmware's source |
