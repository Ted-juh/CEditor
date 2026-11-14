# Elektron device profiles

Profiles for Elektron instruments, read from the user manuals Elektron publishes on its support
pages (`www.elektron.se/support-downloads/<product>`, the PDFs under `wp-content/uploads`). As with
the other brands, the manuals are not committed: what is committed is what was read from them, with
each file's name, SHA-256 and address.

## Survey (November 2026)

Every Elektron manual ends with an appendix of the CC and NRPN numbers its parameters answer to, in
small tables: a title over each (`SYN1`, `FILTER`, `LFO PARAMETERS`), a header line (`Parameter
CC MSB CC LSB NRPN MSB NRPN LSB`), and a row a parameter. Every manual has a text layer; none needs
OCR. The appendix gives numbers only: no ranges, and no values. What a parameter's values show is in
its chapter of the manual, in words (`Algorithm selects … (1–8)`, a bulleted list of an LFO's trig
modes), under the front panel's abbreviation (`11.3.1 ALGO`) rather than the appendix's name.

| Instrument | Manual | Appendix | What it gives |
| --- | --- | --- | --- |
| Digitone, Digitone Keys | User Manual, OS 1.44 (106, 112 pages) | B, pp. 96 - 99 | CC and NRPN for every parameter; a few NRPN only |
| Digitone II | User Manual, OS 1.12 (122 pages) | C, pp. 112 - 117 | the same; its source knobs `machine dependent` |
| Digitakt | User Manual, OS 1.54 (97 pages) | B, pp. 89 - 92 | CC and NRPN |
| Digitakt II | User Manual, OS 1.17 (118 pages) | B, pp. 109 - 113 | CC and NRPN; Euclidean sequencer NRPN only |
| Syntakt | User Manual, OS 1.42 (126 pages) | B, pp. 115 - 118 | CC and NRPN; its source knobs `Data entry knob A` - `H` |
| Analog Four MKII, Analog Four, Analog Keys | User Manuals, OS 1.56 | D | an `Encoder` column, each value's range in brackets (`94 (0–127)`); about two thirds NRPN only; the Analog Keys' CC and NRPN in separate tables |
| Analog Rytm MKII, Analog Rytm | User Manuals, OS 1.74 | C | CC and NRPN; each machine's table of what Synth Parameter 1 - 8 set |
| Analog Heat MKII, Analog Heat, Analog Heat +FX | User Manuals | A | CC and NRPN, and a `Specific values info` column naming a setting's values |
| Model:Cycles, Model:Samples | User Manuals, OS 1.13 | A | CC only, two tables side by side |
| Octatrack MKII, Octatrack | User Manuals, OS 1.40C and 1.40A | C | a table of its own: `HEX DEC CTRL PARAMETER TRN REC`, playback, amp, LFO and effect parameters numbered (`Playback param #1`), the audio tracks' (C.7) and the MIDI mode's (C.8; numbered C.3 in the MKI's manual) |
| Tonverk | User Manual, OS 1.4.1 | D | a table of its own: a CC, then what it sets on each kind of track (audio, bus, FX send, mix); NRPN tables for audio tracks and the Subtracks machine's eight subtracks |

Not read yet: the Machinedrum and Monomachine (manuals for OS 1.63 and 1.32 are on their pages) and
the Analog Drive.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-elektron-midi.mjs` | A manual's MIDI appendix → its rows as printed: section, table, name, encoder, CC MSB/LSB, NRPN MSB/LSB, values info; the Octatrack's (`readCtrlChangeTables`) and Tonverk's (`readTrackColumnTables`) in their own shapes. Decides nothing. |
| 2 | `import-elektron.mjs` | Writes `tables/<name>.json`: those, with the manual's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the manual, which tables go on which channel, the rows the manual misprints, the tables it mistitles. |
| 4 | `build-elektron-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
node tools/profiles/elektron/import-elektron.mjs digitone Digitone-User-Manual_ENG_OS1.44_260930.pdf
node tools/profiles/elektron/make-profiles.mjs            # or --check
```

## Reading the appendix

The reader works from the words' positions (`pdftotext -bbox`). A header line, the word `Parameter`
with `CC MSB` or `NRPN MSB` after it, gives a table's columns; its title is the capitals over its
columns, its section the capitals line before that (`B.3 FM PARAMETERS`). Each table holds its own
stretch of the page across, so the Model:Cycles' two tables side by side go on apart, one's next
header not ending the other. A table carried onto a facing page moves with that page's margin. A cell
may carry its range (`94 (0–127)`) or its fine controller (`109 (LSB: 110)`); a dash is an empty cell.
A line with no name runs the row above on (the Heats' values over two lines) or is another encoder of
it (the Analog Four's `B - - 1`), kept as `more`. Running headers and footers, page numbers and the
prose between tables are not rows.

The Octatrack's tables are a controller in hex and decimal, the parameter, and an X under TRN where
the Octatrack sends it and under REC where it takes it. A page sets the table at its own indent (its
margins are the same, so the reader measures the X columns from each row's hex number). A value note
printed in the name (`Track Mute [0]=Unmuted, [1-127]=Muted`) is kept apart.

The Tonverk's CC table puts what a controller sets on each kind of track in a column of its own. Its
column titles are set in from their cells, so a line is split into cells at its wide gaps and each
cell goes to the nearest title; a line with no number runs its cells' names on (`(machine
dependent)`). Its NRPN tables are a number, the parameter and, for the Subtracks machine, a run of
MSBs (`1–8`), a subtrack each; a second name on the next line (`VOICE LFO1 slew` under `VOICE LFO1
start phase /`) is the same row's.

## What the builder takes as settled

- **A row with a CC is that controller**, a 14-bit pair (0 - 16383, MSB first) where it prints a CC
  LSB; a row with an NRPN and no CC is that NRPN, its value 7 bits on data entry (CC 6); a row with
  neither is not a parameter.
- **A value is what the controller carries**, 0 - 127 or 0 - 16383. The appendix prints no ranges,
  and the chapters name parameters differently and print ranges in prose, so a setting chosen from a
  list is a number here, not a choice; the profile says so. Where the appendix names values (the
  Heats' `0=CB, 1=SA …`, `1=LP2, 3=LP1 …`), the parameter is a choice of them.
- **The channel.** A track's parameters go on the `channel` variable (track 1's channel by default;
  the AUTO channel edits the active track). The layout sends the tables the instrument takes on
  another channel to its variable: `fxChannel` (the Digitone's FX CHANNEL; FX CONTROL CH; the Rytm's
  and Analog Four's FX track; the Model:Cycles' FX IN; the Heat +FX's MIDI CH FX), `perfChannel` (PERF
  CHANNEL), `cvChannel` (the Analog Four's CV track) and `midiChannel` (a MIDI track's, for its CC VAL
  parameters); the Octatrack's MIDI mode on `autoChannel`; the Tonverk's bus, FX send and mix tracks on
  `busChannel`, `sendChannel` and `mixChannel`. The manuals print the tracks' default channels (1 - N)
  but none of these; each is a placeholder, named in the profile's notes as a setting to match.
- **A parameter printed in a CC table and an NRPN table** (the Analog Keys' `OSC 1 CC` and `OSC 1
  NRPN`, the Tonverk's CC table and its audio tracks' NRPN table) is one parameter, where the second
  row brings what the first lacks and contradicts nothing; a dash in one table is the other's row.
- **The Octatrack's bands** (`[0]=Unmuted, [1-127]=Muted`) are a choice, a band's first value sent,
  where they cover 0 - 127; `[0]=C-1, 127=G9` names the ends of a range and stays a number. A
  controller it marks TRN alone (it sends it and does not take it) would be left out; none is.
- **The Tonverk's Subtracks machine** is laid out for subtrack 1, NRPN MSB 1; subtracks 2 - 8 are the
  same at MSB 2 - 8.
- **A machine's table** (the Rytm's `BD PLASTIC`, `SD NATURAL` …) says what the general Synth
  Parameter 1 - 8 set for that machine: each parameter's description lists them.
- **A row on the same message as one before it** (`Chorus Send L/R` and `Chorus Send L`, CC 26/58
  both) is laid out once; **two different rows on one controller** (the Digitone's CC 13, Filter Trig
  and Delay Send) are both laid out, as printed, and named in the notes: CEditor sends either, but
  follows neither when the instrument sends it.
- **The wheels, pedals and breath controller** (Sustain, Sostenuto, Modwheel, Breath Controller) are
  left out.
- **A group** is its table's title; a title printed under several sections is named by both (the
  Analog Four's `LFO1` of the synth, FX and CV tracks: `FX Track LFO1`). The Heats' one table is
  grouped by the block a name begins with (`VCF Mode`, `DELAY Time`).

Corrected by the layouts, each named in the profile: the Digitone II's Amp Sustain Level, printed on
CC 86 (Decay Time's) between 86 and 88, its NRPN between theirs, laid out on 87; the Digitakt II's and
Digitone II's Euclidean and FX tables, titled `AMP` in the manual; the Analog Four MKI's track table,
titled `PERFORMANCE`; the Tonverk's CC 31, printed `SRC 1 Data entry knob H` as CC 23 is, between
SRC 2's knob G (30) and nothing, laid out as SRC 2's.

## The profiles

| Profile | Read from | Rows | Parameters | 14-bit pairs | NRPN only | Choices | Other channels |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `elektron-analog-four-mkii` | Analog Four MKII User Manual, OS 1.56 | 230 | 227 | 12 | 157 | 0 | FX, CV, performance |
| `elektron-analog-four` | Analog Four User Manual, OS 1.56 | 230 | 228 | 12 | 157 | 0 | FX, CV, performance |
| `elektron-analog-heat-fx` | Analog Heat +FX User Manual, OS 1.01 | 109 | 109 | 20 | 0 | 8 | FX |
| `elektron-analog-heat-mkii` | Analog Heat MKII User Manual, OS 1.21C | 42 | 42 | 13 | 0 | 4 | — |
| `elektron-analog-heat` | Analog Heat User Manual, OS 1.21C | 42 | 42 | 13 | 0 | 4 | — |
| `elektron-analog-keys` | Analog Keys User Manual, OS 1.56 | 330 | 227 | 12 | 160 | 0 | FX, CV, performance |
| `elektron-analog-rytm-mkii` | Analog Rytm MKII User Manual, OS 1.74 | 319 | 99 | 1 | 0 | 0 | FX, performance |
| `elektron-analog-rytm` | Analog Rytm User Manual, OS 1.74 | 319 | 99 | 1 | 0 | 0 | FX, performance |
| `elektron-digitakt-ii` | Digitakt II User Manual, OS 1.17 | 144 | 137 | 6 | 15 | 0 | FX, MIDI track |
| `elektron-digitakt` | Digitakt User Manual, OS 1.54 | 99 | 95 | 2 | 0 | 0 | FX, MIDI track |
| `elektron-digitone-ii` | Digitone II User Manual, OS 1.12 | 167 | 162 | 0 | 15 | 0 | FX, MIDI track |
| `elektron-digitone-keys` | Digitone Keys User Manual, OS 1.44 | 124 | 118 | 40 | 5 | 0 | FX, MIDI track |
| `elektron-digitone` | Digitone User Manual, OS 1.44 | 124 | 118 | 40 | 5 | 0 | FX, MIDI track |
| `elektron-model-cycles` | Model:Cycles User Manual, OS 1.13 | 24 | 24 | 1 | 0 | 0 | FX |
| `elektron-model-samples` | Model:Samples User Manual, OS 1.13 | 24 | 24 | 1 | 0 | 0 | FX |
| `elektron-octatrack-mkii` | Octatrack MKII User Manual, OS 1.40C | 115 | 113 | 0 | 0 | 41 | auto |
| `elektron-octatrack` | Octatrack User Manual, OS 1.40A | 115 | 113 | 0 | 0 | 41 | auto |
| `elektron-syntakt` | Syntakt User Manual, OS 1.42 | 107 | 105 | 4 | 0 | 0 | FX, MIDI track |
| `elektron-tonverk` | Tonverk User Manual, OS 1.4.1 | 242 | 229 | 0 | 79 | 0 | bus, FX send, mix |

None reads anything back: Elektron publishes no SysEx format for a sound, so there is no Pull. A
panel follows the instrument through the controllers (or NRPNs, as its PARAM OUTPUT setting says) it
sends when its knobs are turned.

## What is left out, and what would read it

| Left out | Where | What would read it |
| --- | --- | --- |
| What a value shows, and a list setting's values | every profile but the Heats' and the Octatrack's bands | the parameter's chapter: a heading-to-row map for each manual, written by hand, and its range in brackets or its bulleted list read as the values (see below) |
| What a machine-dependent knob sets | Digitone II (`Data entry knob A (machine dependent)`), Syntakt (`Data entry knob A` - `H`), Digitakt II, Tonverk; the Octatrack's numbered parameters (`Playback param #1`) | each manual's machines appendix (Digitone II's appendix A), read the way the Rytm's machine tables are: a description on the knob, or a parameter set chosen by the machine |
| Which of two parameters on one controller the instrument means | Digitone, Digitone Keys (CC 13, 14, 16) | nothing in the format: the appendix prints them so |
| The other tracks | every multi-track instrument | the channel variables: one track at a time, set to the track's channel (or AUTO for the active one) |

**Why the chapters are not read.** Matching the appendix's names to the chapters' parameter headings
was tried, by the abbreviation (`ATK` for `Attack`) and by the subject of the paragraph's first
sentence (`Algorithm selects …`), within the chapter whose title names the table. On the Digitone and
Digitakt it matched about half the rows, some of them wrongly (`Mute` to the pattern's Mute Mode,
`Track level` to a filter's sustain), and left a quarter ambiguous; the Syntakt's chapters print 3
ranges in all, the Rytm's none and the Analog Four's one. A value range taken from a wrong paragraph
would be sent as a wrong value, so the profiles keep the controller's own range until each manual has
a map written for it.
