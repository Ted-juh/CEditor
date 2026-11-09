# Moog profiles, read from Moog's manuals

```bash
node tools/profiles/moog/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/moog/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/moog/import-moog.mjs <name> <manual.pdf>   # re-read the manual
cd CE/web && node --test test/moogProfiles.test.js
```

The rules every profile here follows are in [../README.md](../README.md); what the library as a whole
holds is [docs/device-profile-library.md](../../../docs/device-profile-library.md).

Moog prints each instrument's MIDI controllers as a table in its manual, most often in a chapter on
MIDI near the end. The manuals are listed on [moogmusic.com](https://www.moogmusic.com/) under each
product's downloads and served from `cdn.inmusicbrands.com`. They are Moog's copyright and are not
committed; the rows read from them are, with each file's name, SHA-256 and address. Importing needs
poppler's `pdftotext`.

| Step | File | What it does |
|---|---|---|
| 1 | `read-moog-pdf.mjs` | A table's pages → its rows as printed, a cell per column the layout names. Decides nothing. |
| 2 | `import-moog.mjs` | Writes `tables/<name>.json`: those rows, and the value tables the layout names, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, its tables' pages and their column headings as printed, what to leave out and why. |
| 4 | `build-moog-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

## Reading the tables

The layout names each table's columns by their headings as printed (`CONTROL/PARAMETER`, `MIDI CC
#`, `CC VALUE RANGE`; `Parameter`, `CC Number (MSB)`, `CC Number (LSB)`, `Values`), and the reader
finds them in poppler's word positions (`-bbox-layout`): the first place on the page where all of
them stand in order on one band, so prose above a table that happens to say `Parameter` is not
taken for it. A heading may be a run of words on a line or lines stacked (`CC Number` over `(MSB)`).
A column starts in the widest gap the body leaves between its heading and the one before, since a
heading is often centred over cells that start well left of it. Then a row is anchored on its
controller cell, and takes the cells of the other columns that reach its line. What the manuals do
that it copes with, each found on a real page:

- a value list wrapped onto the lines under its row (the Sub 37's), and the row's name and
  controller set in the middle of a tall value cell (the Muse's, the Subsequent 25's);
- an MSB with its LSB on the line below (`19(MSB)` over `51(LSB)`, `MSB 10` over `LSB 42`,
  `4 (coarse)` over `36 (fine)`);
- a section label in a column of its own, set in the middle of its rows, sometimes on its side (the
  Little Phatty's, the Sirin's, the Taurus 3's): the labels split the rows into runs so that each
  sits as near the middle of its run as can be, all taken together;
- a row printing a dash or `Varies` where its controller would be, which still takes its place
  among the rows a label is centred on;
- two manual pages printed on one sheet (the Minitaur's), a table running over pages, a value
  table in two columns (the Grandmother's clock divisions), one value cell printed across two rows
  (the Sirin's and Minitaur's bend amounts, which the layout says);
- a word broken over two lines (`TRIP-` over `LET`), ligatures (`ﬁ`), the page number at the foot.

## What the builder takes as settled

- **A knob is its MSB.** Most knobs are printed as an MSB and an LSB, 0 - 16383 together. The manuals
  say to send the MSB alone for 7-bit control ("Note that when MSB-only messages are issued, the
  value range is always 0-127", the Minitaur's and the Sirin's), and CEditor's CC message carries
  one controller, so the parameter is the MSB, 0 - 127, and its LSB is said.
- **A value list is a choice**, the first value of each band sent: `0-63 = OFF, 64-127 = ON`,
  `0-24: TRIANGLE`, `0-63(SAW) 64-127(SQR)`, `0 = 16', 32 = 8'`, `0 (OFF), 64 (ON)`. A list whose
  bands run backwards or overlap is a misprint (the Muse's `5-99: SQUARE` after `50-74`, the
  Subsequent 25's `4 3-85`, the Messenger's `32-64` then `64-95`): the parameter stays a number and
  the profile says why. Names that are numbers moving with the values (`0 = -12 SEMITONES, 1 = -11
  … 24 = +12`) are a scale, not a list.
- **`See table`** beside a value table the layout names for that controller is a choice from it.
- **An NRPN is one 14-bit value.** The Sub 37's chart prints each NRPN's number, its MSB and LSB,
  and how many values it takes (16384 for a knob); every one is sent as one 14-bit value, data entry
  MSB on CC 6 then LSB on CC 38. The Claravox prints a CC and an NRPN for each setting: a range of 0 -
  16383 goes on the NRPN, the rest on the CC.
- **MIDI's own controllers are left out**: bank select (0, 32) and the channel mode messages (120 -
  127: Local Control, All Notes Off). A row naming a controller MIDI reserves elsewhere is what it
  says: CC 6 is the Little Phatty's modulation amount and the Taurus 3's filter modulation.
- **Rows sharing a controller** are left out but for the first, unless each prints one value of it
  (the Taurus 3's LFO waves on CC 68: 31, 63, 95, 127), which become one choice.

None of these manuals prints a Device Inquiry reply, so no profile here checks identity.

## The Matriarch's global settings

The Matriarch's manual prints a SysEx message for its global settings, `F0 04 17 23 [Parameter ID]
[value MSB] [value LSB] 00 00 00 00 00 00 00 00 [Unit ID] F7`, a table of them (pp. 76-79), and a
request, `F0 04 17 3E [Parameter ID] 00 … 00 [Unit ID] F7`, which it answers with the set message,
the byte before the Unit ID set to 1. The profile has each setting as a SysEx parameter (a value
under 128 sends `00` and then itself, as the manual says), addressed to Unit ID 7F, "any Unit ID",
and a request and a reply for each, so Pull reads them back one at a time.

## The profiles

| Profile | Read from | Parameters | Choices | Talks in |
|---|---|---:|---:|---|
| `moog-sub-37` | Sub 37 Manual v1.1, pp. 53-59 | 164 | 29 | CC, NRPN |
| `moog-subsequent-37` | Subsequent 37 Manual, pp. 53-59 | 164 | 29 | CC, NRPN |
| `moog-subsequent-25` | Subsequent 25 Manual, pp. 46-49 as printed | 73 | 28 | CC |
| `moog-matriarch` | Matriarch Manual (01/2023), pp. 74-79 as printed | 110 | 85 | CC, SysEx (read back) |
| `moog-grandmother` | Grandmother Manual, Version 2, pp. 43-44 | 22 | 17 | CC |
| `moog-messenger` | Messenger User Manual (2025-06-18), pp. 35-37 | 55 | 21 | CC |
| `moog-muse` | Muse Manual 1.4.0, Appendix A | 102 | 36 | CC |
| `moog-subharmonicon` | Subharmonicon Manual, pp. 41-43 | 11 | 5 | CC |
| `moog-sirin` | Sirin User Manual v2.1, pp. 22-24 as printed | 36 | 14 | CC |
| `moog-minitaur` | Minitaur Manual, pp. 21-24 as printed, and its v2.1 addendum's corrections | 36 | 14 | CC |
| `moog-little-phatty` | LP Stage II User's Manual, pp. 55-57 as printed | 51 | 25 | CC |
| `moog-slim-phatty` | Slim Phatty User's Manual | 51 | 25 | CC |
| `moog-taurus-3` | Taurus 3 User's Manual, pp. 51-52 as printed | 29 | 11 | CC |
| `moog-claravox-centennial` | Claravox Centennial User Guide, pp. 55-62 as printed | 49 | 16 | CC, NRPN |

## What the manuals leave out, or get wrong

- **Sub 37, Subsequent 37**: the NRPN chart's value counts for NRPNs 486-490 are printed out of step
  with their rows (OSC 1 ON with 21 values, OSC 1 LEVEL with 2); left out. FILTER RESONANCE (NRPN
  500) prints no count. KB TRANSPOSE (CC 119) is printed only as the value shown, -12…+13. The table
  of LFO clock divisions (p. 52) is what the LFO rate controllers select when synced, not a setting
  of its own.
- **Minitaur**: two of its value lists are corrected in the firmware v2.1 addendum bound into the
  same PDF (p. 18), and the profile takes the corrections. The v2.2 addendum names CC 80, 85 and 112
  without their values; they are not here.
- **Little Phatty**: ten rows print a name another row of their section has (WAVE, OCTAVE, ATTACK
  …); the layout names them from their function column, which on some rows is set in a font whose
  text poppler cannot read (the page shows `Adjusts the filter envelope attack time`).
- **Claravox Centennial**: its ♯ and ♭ are in a font whose signs the PDF's text leaves out (`11 = C
  (D )`); the layout restores them. `Fixec` is printed so.
- **Muse**: the appendix does not say which timbre a controller edits.

## Not done

- **14-bit CCs.** CEditor's CC message carries one controller, so a knob's LSB is said, not sent.
  Sending both halves would take a CC pair in both engines, and reading one back.
- **Sub Phatty**: its CC table pages are drawn as outlines, with no text to read.
- **Moog One**: its CCs are mapped by the player (Learn MIDI CC); the manual prints no table.
- **Mother-32**: four CCs, three of them for its assignable output; DFAM, Labyrinth, Model D,
  Theremini, Etherwave, Spectravox, Mavis, Werkstatt: no CC table.
- **Pull** for the rest: none of their manuals prints a program dump.
