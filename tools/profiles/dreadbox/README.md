# Dreadbox device profiles

Profiles for Dreadbox instruments, read from the documents Dreadbox publishes: the manuals on
`dreadbox-fx.com/support/` (`wp-content/uploads`), the Artemis's CC list beside its manual, and the
Nymphes's v2.0 owner's manual on Dreadbox's own store (`cdn.shopify.com/s/files/1/0527/2557/9960`).
As with the other brands, the documents are not committed: what is committed is what was read from
them, with each file's name, SHA-256 and address.

## Survey (November 2026)

| Document | What it gives |
| --- | --- |
| Nymphes Owner's Manual v2.0 | `8. CC List`: `PARAMETER  CC#  VALUE  NOTES`, the values the controller's own (`0-127`, `0-5  Poly/Uni-A/…`) |
| Artemis CC List | `CC  PARAMETER  VALUE`: what the screen shows, "split in the whole CC range of 0-127", and CC 31's Selector, which turns the controllers after it to a modulation amount |
| Murmux Adept User Manual | `CC LIST`: a number, `PARAMETERS  VALUE` (`[0 - 99]`, `[SINE, TRI, …]`), `(POLY)` where a parameter answers per voice |
| Typhon User Manual (2026) | no list: its CC list is a page on the instrument's screen |
| Nyx, Erebus, Hades, Abyss and the Eurorack and effects manuals | no MIDI controllers |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `../behringer/read-behringer-tables.mjs` | Each list is read by the Behringer anchored-row reader (`readAnchoredRows`): a row is the line with its number, a long value over several lines around it. |
| 2 | `import-dreadbox.mjs` | Writes `tables/<name>.json`: the list as printed, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, its pages, its columns, whether its values are spread over 0 - 127. |
| 4 | `build-dreadbox-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, a control change on the channel variable.
- **The Nymphes's values are the controller's own**: `0-127` a range; `0-5` with six settings named
  beside it a choice, one value each.
- **The Artemis's are spread over 0 - 127**, as its list says: `0 - 100` is the controller's 0 - 127
  shown 0 - 100; a list of settings a choice, each sent at the middle of its equal share of 0 - 127
  (two settings: 32 and 96). **The Murmux Adept's are taken the same way**, its manual not saying;
  its profile says so, and it is the first thing to try on the instrument.
- **Left out by name:** the wheel, the pedals, bank select, the channel mode messages.

## The profiles

| Profile | Read from | Rows | Parameters | Choices |
| --- | --- | ---: | ---: | ---: |
| `dreadbox-nymphes` | Nymphes Owner's Manual v2.0, pp. 22 - 23 | 82 | 80 | 7 |
| `dreadbox-artemis` | Artemis CC List, pp. 1 - 3 | 86 | 82 | 19 |
| `dreadbox-murmux-adept` | Murmux Adept User Manual, p. 28 | 53 | 49 | 13 |

None reads anything back: no SysEx format is published.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| The Typhon | its CC list is on its screen, not in a document | the list, if Dreadbox prints it |
| How the Murmux Adept maps 0 - 127 | not said | the instrument: send 0, 64 and 127 to a selector and look |
| The Artemis's modulation amounts through the Selector | one controller does two things, depending on CC 31 | a parameter for each pair, sent as CC 31 then the controller |
