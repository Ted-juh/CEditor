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

## Value tables

Many rows point to a table of what their values mean: the Circuit Tracks' `See Osc Waveform Table`,
the MiniNova's `See Table 1: Waveforms`, the Circuit Mono Station's `(see table)` beside tables titled
for each parameter. `read-novation-values.mjs` reads those from the word positions too: a `Value` or
`… Index` heading with the names' heading beside it, sub-lists under headings in the number column
(the Filter Table's Drive Type and Type, the Mod Matrix Table's Source and Destination), names wrapped
onto the next line, a number and its name set a space apart (`0 Sine`), and a table's right-hand half
(the MiniNova's 126 tweak assignments). A parameter is a choice when the table it points to numbers
every value of its range, no more and no fewer; a sub-list is chosen by the parameter's name (`drive
type`, `source`), or all of them taken together (the Tracks' Waveforms then Wavetables). Where a
table falls short the parameter stays a number and the profile says why.

## Pull (Circuit Tracks)

The Circuit Tracks' reference prints the Current Patch Dump Request (`F0 00 20 29 01 64 40`, a
location, `F7`), the Replace Current Patch it is answered with (the same location, then 340 bytes
of plain 7-bit data) and the patch format, address by address with each byte's default, min and
max, and the flags that share a byte by bit (`LFO1_OneShot (bit 0), …, LFO1_FadeMode (bits 4-5)`).
`read-novation-sysex.mjs` reads the messages and the format; `build-novation-dump.mjs` makes a
request and a dump definition per synth (layout `parts[].location`), each matched on its location
byte, and reads a byte into the synth's parameter of the same name. The format writes
`Envelope1_Attack` where the MIDI table writes `env 1 attack` under Envelope, so names are compared
as words, a few spelt alike (envelope/env, equaliser/eq, frequency/freq, pos/position). A byte is read
only where its range is the parameter's; a flag's bits go into a choice with as many values, in order
(`LFO1_OneShot` 0/1 into the NRPN's `12=OFF, 13=ON`). 274 parameters a synth are read back. The
reference says the reply goes to the USB port only.

## Older manuals: the controller list (K-Station, KS series)

The K-Station's and KS series' manuals print a **MIDI Controller List** and a **MIDI NRPN List** in an
appendix, and their own key above them: values run 0-127 unless noted; `***` is "a signed value where
64 represents zero", -64..+63 stored as 0..127, or as noted (`-12..+12` stored as 52..76); `—-` is a
controller not used. `read-novation-cclist.mjs` reads the lists (`pdftotext -layout`; the use starts
at the first word in capitals, a use wrapped onto the next line while a bracket is open continues)
and reads a use in that key: `0..5 = up, down, …` and `(0=internal 1=external)` are choices,
`(64..191 bpm)` is 0-127 shown as 64-191, and `(0=off 64=full vocoder 127=modulator only)`, points
on a scale, stays a number. The instruments send and read only the NRPN LSB; the manual says to
assume an MSB of 0, which CEditor sends. The **packed parameters** (several settings in one value's
bits, `see packed parameter 2`) are left out: sending one means knowing the others' bits.

## The profiles

| Profile | Read from | Parameters | Choices | Pull |
|---|---|---:|---:|---|
| `novation-peak` | Peak User Guide 1.2, pp. 40-43, and the Summit and Peak 2.1 addendum, p. 18 | 246 | 0 | — |
| `novation-summit` | Summit User Guide 1.1, pp. 47-49, and the 2.1 addendum | 184 | 0 | — |
| `novation-bass-station-ii` | Bass Station II User Guide v5, pp. 71-74 | 27 | 2 | — |
| `novation-circuit-mono-station` | Circuit Mono Station MIDI Parameters v1 | 73 | 11 | — |
| `novation-circuit-tracks` | Circuit Tracks Programmer's Reference Guide v3, pp. 3-22 | 618 | 67 | 548 read back |
| `novation-circuit-rhythm` | Circuit Rhythm Programmer's Reference Guide v5.2, pp. 3-5 | 231 | 0 | — |
| `novation-mininova` | MiniNova Extended CC & NRPN Map, Version 0002 | 374 | 104 | — |
| `novation-k-station` | K-Station User Manual, pp. 44-47 | 130 | 7 | — |
| `novation-ks-series` | KS Series User Manual (KS4, KS5, KS Rack), pp. 62-65 | 162 | 4 | — |

## What the documents leave out

- **Summit**: its guide prints no NRPN numbers for the mod matrix rows (the Peak's prints them).
  Left out.
- **Bass Station II**: most of its ranges are printed as the value shown (`-63 to +63*`, `-127 to
  127*`), and several settings name their values without numbering them; `LFO 1 Sync value` and two
  more print an NRPN without its MSB. All left out and said; 27 of its 98 rows remain.
- **Circuit Tracks**: the audio table (p. 9) prints no channel; left out. Its Mod Matrix Table prints
  no sources 1 - 3, so the sources stay numbers. Keyboard Octave is 58-69 in the patch and three
  values on its NRPN, so Pull leaves it out; mod matrix slots 13-20 are in the patch and not in the
  MIDI table.
- **Circuit Mono Station**: its Filter Slope Table reprints the shape table's three names for a 0 - 1
  control, and its glide table numbers 16 values for a 0 - 127 controller; both stay numbers.
- **Circuit Rhythm**: its effects and global tables print no channel; the profile sends them on its
  global channel, which the guide's note table gives as 16. Its macro knobs repeat the sampler
  parts' controllers and are left out.
- **MiniNova**: KeyboardOctave runs 124 - 4, two's complement, which CEditor cannot send yet;
  Tempo Rate (40 - 240) is wider than its NRPN's one data byte.

## Not done

- **UltraNova**: its MIDI implementation prints names and numbers but no ranges, and the user guide
  on its download page is the German one; the MiniNova shares its engine, but its chart is not the
  UltraNova's.
- **The original Circuit**: its download page offers a 7-page 1.8 addendum, no MIDI table.
- **X-Station, A-Station, Supernova, Nova, Bass Station (1993)**: no manual with a MIDI list on their
  download pages (the Supernova II's manual has none).
- **The K-Station's and KS series' packed parameters**, as above.
- **Pull** for the others: none of their documents prints a program dump.
- **Launchkey, Launchpad, SL**: controllers, not synths.
