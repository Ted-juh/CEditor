# Sequential, Dave Smith Instruments and Oberheim profiles, read from their own manuals

```bash
node tools/profiles/sequential/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/sequential/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/sequential/import-manual.mjs <manual.pdf> <name>   # re-read a manual's tables
cd CE/web && node --test test/sequentialProfiles.test.js
```

The rules every profile here follows are in [../README.md](../README.md); what the library as a whole
holds is [docs/device-profile-library.md](../../../docs/device-profile-library.md).

Every Sequential and DSI instrument since the Prophet '08 takes its parameters as **NRPNs**: the
number on CC 99/98, the value on CC 6/38, most significant byte first, 14 bits throughout. Each
manual prints them as a table of NRPN number, range and name, often with what each value means on
the lines beneath (`0 = Off`). So a profile is read out of the manual, not retyped:

| Step | File | What it does |
|---|---|---|
| 1 | `read-nrpn-tables.mjs` | `pdftotext -layout` text → rows. A table is found by its header, and its columns by where its rows start (a header is centred over its column and a row is not). Reads tables side by side, two-page spreads, tables that run onto the next page without their header, footnotes printed beside a row, rows printed without a range. Each footnote mark is resolved against the footnote printed with that table. Decides nothing. |
| 2 | `import-manual.mjs` | Writes `tables/<name>.json`: the rows, plus the document's file name, SHA-256 and URL, and what the tables say about themselves (a dump position printed twice, a layer B number off its offset, a backward range). **This is what is committed. The PDF is Sequential's copyright and is not.** |
| 3 | `synths/<name>.mjs` | The layout: which pages hold which table, the order of its columns, how labels are printed, the identity reply, the bank table, what to leave out and why. `groups.mjs` groups names the same way for every model. |
| 4 | `build-nrpn-profile.mjs`, `make-profiles.mjs` | Layout + tables → `CE/profiles/test/<id>.ceditor-device.json`. A row whose labels name every value in its range is a choice; otherwise a number, with any partial labels in its description. A run of NRPNs (`256-319  Seq Step 1-64 Note 1`) is one parameter per number, only when a span in its name counts out to the run. |

## The profiles

| Profile | Read from | Parameters | Choices | Presets |
|---|---|---:|---:|---|
| `sequential-prophet-6` | Prophet-6 Operation Manual 2.1 | 876 | 12 | yes |
| `sequential-prophet-rev2` | Prophet Rev2 User's Guide 1.2.4 | 1,961 | 12 | — |
| `sequential-prophet-12` | Prophet 12 Operation Manual 1.0 | 474 | 103 | yes |
| `sequential-pro-2` | Pro 2 Operation Manual 1.2 | 843 | 69 | yes |
| `sequential-prophet-x` | Prophet X User's Guide 1.3 | 503 | 12 | — |
| `sequential-trigon-6` | Trigon-6 MIDI Implementation 1.1 | 563 | 12 | yes |
| `sequential-take-5` | Take 5 MIDI Implementation V2 | 158 | 0 | yes |
| `sequential-prophet-5` | Prophet-5 MIDI Implementation 1.4 (Prophet-5 and -10, Rev4) | 70 | 0 | — |
| `sequential-fourm` | Fourm MIDI Implementation Document 1.1 | 116 | 21 | — |
| `sequential-prophet-08` | Prophet '08 Manual 1.3 | 350 | 16 | yes |
| `sequential-tetra` | Tetra Manual 1.3 | 370 | 15 | yes |
| `sequential-mopho` | Mopho Manual 1.2 | 117 | 9 | yes |
| `sequential-mopho-keyboard` | Mopho Keyboard Manual 1.1 (also the Mopho SE) | 126 | 15 | yes |
| `sequential-mopho-x4` | Mopho x4 Operation Manual 1.0 | 127 | 17 | yes |
| `oberheim-ob-6` | OB-6 Operation Manual 1.2 | 872 | 12 | yes |
| `oberheim-ob-x8` | OB-X8 Manual V2.2 | 113 | 0 | — |
| `oberheim-teo-5` | TEO-5 MIDI Implementation Document v2 | 184 | 21 | — |

Sequential writes the Oberheim instruments' manuals too, in the same style, so the same reader takes
them; they are listed under Oberheim in the program, and the TEO-5 answers to Oberheim's own SysEx ID
(02) where the rest answer as DSI (01).

Each profile has every parameter of the manual's program, global and control tables; the identity
reply, so CEditor can tell which instrument is connected (except the OB-6 and OB-X8, below); and, where the manual's Bank Select line
is unambiguous, preset recall by Bank Select (CC 32) and Program Change. Layered instruments (Rev2,
Prophet 12, Prophet X, Prophet '08, Tetra) have every parameter twice, `A:` and `B:`.

What they do not have, said in each profile's notes:

- **Pull.** Each manual describes a program edit buffer dump, in the packed 8-bits-in-7 format the
  C++ engine can decode, but which byte holds which parameter is not mapped yet; and the preview
  engine cannot unpack that format at all.
- **The program name.** One character per NRPN; CEditor cannot edit text over NRPN.
- **Value meanings the tables do not print.** Most ranges carry no labels (a filter's 0 - 164, a
  bipolar amount's 0 - 254): they are numbers, as printed. Mod source and destination numbers refer
  to separate lists, not read yet.
- **Rows without a usable range**: the MSB halves of two-byte values (`n/a`, the Take 5's
  FilterFreqMSB), unused numbers (`---`), and the Take 5's fine tune printed as `-700-700`, whose
  wire form is not given.

The instrument must be set to receive NRPNs (Global: MIDI Param Receive = NRPN or All). That
setting is itself parameter 1030 or its equivalent, and the one every manual marks as ignored when
received, so it is read-only here.

## What the manuals print wrong

Recorded in the profiles rather than guessed at:

- **Mopho Keyboard**: NRPN 96 for both Unison Mode and Key Assign Mode (the Mopho x4's manual has
  Unison Mode on 95). The profile keeps Unison Mode and says on it that the manual contradicts itself.
  Its dump position 86 is printed twice (so is the Mopho x4's).
- **Prophet 12**: BPM is printed on NRPN 288, which is A/B Mode two rows above; layer B's BPM (800)
  is unique and kept.
- **Pro 2**: the sequencer table prints "Track 2, Step 1 Slew/Tie" at both 784 and 787.
- **Trigon-6**: the identity table prints its ID as `0b11 1001` (39H).
- **Rev2**: Sustain Polarity and MIDI Out Select print fewer values in their range than labels
  under them; the range is kept and the labels go to the description.
- **Bank Select**: the Rev2, Prophet X and Fourm print "1 - 4 select user banks" where their own
  transmitted list says 0 - 9, and the Prophet-5's Bank Select and Program Change lines disagree.
  No preset recall is offered for those four until an instrument settles which.
- **Identity replies copied from a sibling.** The OB-6's Device Inquiry reply prints its family code
  as 2DH, the Prophet-6's, where every other SysEx message on the same pages addresses it as 2EH;
  the OB-X8's prints 33H where its other messages use 31H, exactly as the Prophet-5's own document
  does (33H in the reply, 31H elsewhere), and the Trigon-6 User's Guide prints 2DH where its MIDI
  Implementation prints 39H. The OB-6 and OB-X8 profiles do not try to recognise the instrument
  until one settles it; the Prophet-5's keeps 33H, as printed and not someone else's.
- **OB-X8**: its NRPN chapter is the Prophet-5's, headings included ("not saved as part of a
  program" over every program parameter); NRPN 56 and 57 are both printed "MOD BOX LFO 2 DEST OSC
  2"; three ranges look misprinted and are kept, said on the parameter (CHORD KEY LIMIT 0-1207, PORTA
  MODE 0-66, LFO 1 MOD 2 RAMP UP 0-27 where MOD 1's is 0-127); two split rows print a second NRPN
  under the first (1090 under 1122, 1092 under 1123) without saying which half is which, and only
  the first is offered. Its Bank Select and Program Change lines are the Prophet-5's, and disagree
  the same way.
- **TEO-5**: Master Coarse Tune is printed 0-100 and Fine 0-24, the other way round from the OB-6
  and Prophet-6; Filter Res 0-265; the Program table is headed "parameters 0-352" and prints 1 - 187;
  and banks are numbered three ways (received 1 - 12, transmitted 0 - 9, a dump request 0 - 15), so
  it has no preset recall. Filter Cutoff and Filter State print their MSB halves (35, 39) as
  parameters of their own, which are left out: 34 and 38 carry the whole value.
- **Footnote marks change meaning by table**: the Pro 2's `†` is "transmitted, but ignored when
  received" under its globals and "the first 7 bits set the slew value" under its sequencer. Each
  mark is resolved against its own table's footnote.

## Checked against midi.guide

midi.guide has NRPN numbers for one of these, the Prophet Rev2: 111 of them, every one of which is
in the profile. Most names differ only in abbreviation (`Filter RES` for Filter Resonance), but
midi.guide puts VCA Env Release on NRPN 37 and LFO 2 Amount on 49, where the manual has LFO 1 Freq
and LFO 3 Amt: the same off-by-a-row slip its Roland CC lists showed.

## Not done

- **Pro 3**: its manual lists parameter names only, no ranges ("Subsequent parameters can be found
  on the Pro 3 Support page").
- **Evolver family** (Evolver, Mono Evolver, Poly Evolver): SysEx parameter numbers, not NRPN.
- **Tempest**: no NRPN table.
