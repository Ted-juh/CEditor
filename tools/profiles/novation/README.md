# Novation profiles, read from Novation's user guides and programmer's references

```bash
node tools/profiles/novation/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/novation/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/novation/import-novation.mjs <name> <guide.pdf> [<addendum.pdf> …]   # re-read the documents
cd CE/web && node --test test/novationProfiles.test.js
```

The rules every profile here follows are in [../README.md](../README.md); what the library as a whole
holds is [docs/device-profile-library.md](../../../docs/device-profile-library.md).

Novation prints each synth's MIDI parameters as a table in its user guide (Peak, Summit, Bass
Station II), in a separate MIDI parameters document (Circuit Mono Station), in a programmer's
reference (Circuit Tracks, Circuit Rhythm) or in a chart of its own (MiniNova). The PDFs are on
[downloads.novationmusic.com](https://downloads.novationmusic.com/novation). They are Novation's
copyright and are not committed; the rows read from them are, with each file's name, SHA-256 and
download page. Importing needs poppler's `pdftotext`.

| Step | File | What it does |
|---|---|---|
| 1 | `read-novation-pdf.mjs` | A document's pages → their table rows as printed: section, parameter, CC/NRPN, control number, range, default, notes. Decides nothing. |
| 2 | `import-novation.mjs` | Writes `tables/<name>.json`: those rows, with each document's name, SHA-256, address and pages. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the documents and their pages, groups, parts and their channels, what to leave out and why. |
| 4 | `build-novation-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## Reading the tables

`pdftotext -layout` interleaves these tables: two are often set side by side, and a cell that does
not fit is wrapped onto lines above and below its row's middle. The reader works from poppler's word
positions (`-bbox-layout`) instead, where each cell's text comes as one block and every cell of a row
is centred on the same line. So a row is the cells whose middles line up with its CC/NRPN cell, and
the text that lines up with none is a section heading (`Envelopes`, `Filter`). What the documents do
that it copes with, each found on a real page:

- headings set over the start of a column (Peak) or centred over left-aligned cells (Bass Station II,
  whose layout gives its columns' starts in points);
- two tables side by side starting at different heights (Summit), two stacked on one page (Circuit
  Rhythm), a table that runs over the page break without its headings (Circuit Tracks, MiniNova);
- a whole column set as one block holding many rows (Circuit Mono Station), and a heading set in the
  same block as the column heading above it (Peak's `Control / Number. / Envelopes`);
- a CC/NRPN cell wrapped onto the line below (`prog` / `change`), a note wrapped onto the next line;
- the MiniNova's chart, with a column each for the CC, the NRPN MSB and LSB, the value sent (Input
  Range) and what it shows (Mapped Range), and a category on every row.

## What the builder takes as settled

- **A CC pair is its coarse controller.** Every pair is a controller and its partner 32 above
  (`CC pair 14,46`, `cc 16:48`, `CC(8) 27:59`), MIDI's coarse and fine, and the Circuit Mono
  Station's document says the second "is used to create an 8-bit message for a 0-255 value range".
  None says which bit the second carries, so the first is the parameter, 0 - 127, and the second is
  left out and said in every profile that has one. Two Mono Station "pairs" that are not n and n+32
  (`64:2`, `73:0`) are left out.
- **A range is the values sent**, shown as printed where the document says what they show
  (`63-66 (-1 to +2)`, the MiniNova's Mapped Range). A range printed only as the value shown
  (`-63 to +63*`, most of the Bass Station II's) is left out: what is sent for it is not printed.
- **A choice only where its values are numbered**: `0=Mono, 1=Mono AG, …` in the notes,
  `16’,8’,4’,2’ (MIDI val of 63, 64, 65, 66)`. Names without numbers (`sine, tri, saw, pulse`) are
  left out and said.
- **Switches can share an NRPN.** The MiniNova keeps many on 0:122, each with its own values
  (`42=FreqLink Off, 43=FreqLink On`, `0=Single, 1=Multi` for Envelope 1's trigger): a choice each on
  that NRPN. CEditor does not attribute that message to one of them when the instrument sends it.
- **A table played per part** goes out on each part's channel, a variable each (layout `parts`):
  the Circuit Tracks' synth table on 1 for Synth 1 and 2 for Synth 2, its drums on 10 and its project
  on 16; the Circuit Rhythm's sampler parts on 1 to 8, its effects and global controls on 16.

None of these documents prints a Device Inquiry reply, so no profile here checks identity.

## The profiles

| Profile | Read from | Parameters | Choices |
|---|---|---:|---:|
| `novation-peak` | Peak User Guide 1.2, pp. 40-43, and the Summit and Peak 2.1 addendum, p. 18 | 246 | 0 |
| `novation-summit` | Summit User Guide 1.1, pp. 47-49, and the 2.1 addendum | 184 | 0 |
| `novation-bass-station-ii` | Bass Station II User Guide v5, pp. 71-74 | 27 | 2 |
| `novation-circuit-mono-station` | Circuit Mono Station MIDI Parameters v1 | 73 | 0 |
| `novation-circuit-tracks` | Circuit Tracks Programmer's Reference Guide v3, pp. 3-12 | 618 | 31 |
| `novation-circuit-rhythm` | Circuit Rhythm Programmer's Reference Guide v5.2, pp. 3-5 | 231 | 0 |
| `novation-mininova` | MiniNova Extended CC & NRPN Map, Version 0002 | 374 | 79 |

## What the documents leave out

- **Summit**: its guide prints no NRPN numbers for the mod matrix rows (the Peak's prints them).
  Left out.
- **Bass Station II**: most of its ranges are printed as the value shown (`-63 to +63*`, `-127 to
  127*`), and several settings name their values without numbering them; `LFO 1 Sync value` and two
  more print an NRPN without its MSB. All left out and said; 27 of its 98 rows remain.
- **Circuit Tracks**: the audio table (p. 9) prints no channel; left out. The value tables on pp.
  9-10 (filter types, waveforms, mod matrix sources) are not yet read into choices.
- **Circuit Rhythm**: its effects and global tables print no channel; the profile sends them on its
  global channel, which the guide's note table gives as 16. Its macro knobs repeat the sampler
  parts' controllers and are left out.
- **MiniNova**: KeyboardOctave runs 124 - 4, two's complement, which CEditor cannot send yet;
  Tempo Rate (40 - 240) is wider than its NRPN's one data byte.

## Not done

- **UltraNova**: its MIDI implementation prints names and numbers but no ranges; the MiniNova shares
  its engine, but its chart is not the UltraNova's.
- **Pull**: the Circuit Tracks' reference prints its patch format; not yet read. None of the others
  prints a program dump.
- **Launchkey, Launchpad, SL**: controllers, not synths.
- **Legacy synths** (Supernova, Nova, K-Station, X-Station, Bass Station): not yet surveyed.
