# teenage engineering device profiles

Profiles for teenage engineering instruments, read from the MIDI tables of their guides on
`teenage.engineering/guides`. The guides are web pages, not PDFs: what is committed is the tables as
printed, with each page's address, the day it was saved and the SHA-256 of the saved HTML. The pages
are not committed, and are live: a later one may differ, which a re-import shows as a changed table.

## Survey (November 2026)

| Guide | Its MIDI table |
| --- | --- |
| OP-Z, `/guides/op-z/midi` | **incoming midi table**: 18 parameters a track, each on the track's channel (absolute 1 - 18, relative 32 - 49), and system, track, real-time and UI rows |
| OP-1 field, `/guides/op-1` | **incoming midi control change messages**: the mixer on the four tracks' channels, the sound, patch fx and lfo, master, tape |
| OP-XY, `/guides/op-xy/midi-references` | **midi cc reference table**: twelve rows, the track's on its channel |
| TX-6, `/guides/tx-6` | **incoming midi control messages** for the six channels and the master (on 7); and what it sends in controller mode |
| EP-133 K.O. II and EP-40 Riddim, `…/system` | **midi cc map**: four rows; the EP-40's ranges printed `1-27` where the EP-133's read `1-127` |
| EP-1320 | a table of which messages it sends and receives, no controllers |
| OP-1 (original), pocket operators, the others | no controller table |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-te-guide.mjs` | A saved guide page → its tables as printed. The guides set their tables as grids of boxes, differently from guide to guide; what each keeps is a cell's text in a `txt` div, in reading order. So the page is read as that run of cells: a run of header cells (`name  cc  channel  range`, `MIDI cc number  range  function`) starts a table, and its rows follow, as many cells each, while the controller cell holds one. |
| 2 | `import-te.mjs` | Writes `tables/<name>.json`, the tables the layout picks by the text before them. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the page, its tables, a fixed channel's variable, its groups. |
| 4 | `build-te-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
curl -sSL https://teenage.engineering/guides/op-z/midi -o op-z-midi.html
node tools/profiles/teenage/import-te.mjs op-z op-z-midi.html
node tools/profiles/teenage/make-profiles.mjs            # or --check
```

## What the builder takes as settled

- **A row is its controller.** Where the channel column is a range (`1-16`, `1 - 4 *`) it is the
  track's channel, and the channel variable is set to the track to edit; the TX-6's master, on 7, has
  a variable of its own.
- **A run of controllers** (`54 - 57  patch fx parameters 1 - 4`) is a parameter each.
- **Values:** `0 - 127`, `0-15` a range; `≥ 64 = muted`, `< 64 = synth, ≥ 64 = drum`, `on / off` a
  choice of two, sent at 0 and 127; `≥ 64` alone an action, sent as 127; anything else (the OP-1
  field's tempo, `0–5 → 40–50 BPM, …`) 0 - 127 with the text in its description.
- **Not laid out:** the OP-Z's relative controllers (32 - 49, steps of the same parameters) and its
  UI rows; a second row on a controller already laid out (its next and previous pattern, values of
  its pattern select); the TX-6's controller-mode table (what it sends); the sustain pedal and
  channel mode messages.
- **Corrected by a layout:** the EP-40's `1-27`, read as `1-127`.

## The profiles

| Profile | Guide | Rows | Parameters | Choices |
| --- | --- | ---: | ---: | ---: |
| `te-op-z` | OP-Z, midi | 35 | 30 | 0 |
| `te-op-1-field` | OP-1 field | 37 | 47 | 15 |
| `te-op-xy` | OP-XY, midi reference | 12 | 12 | 0 |
| `te-tx-6` | TX-6 | 20 | 20 | 1 |
| `te-ep-133` | EP-133 K.O. II, system | 4 | 3 | 0 |
| `te-ep-40` | EP-40 Riddim, system | 4 | 3 | 0 |

None reads anything back.
