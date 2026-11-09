# Roland device profiles, read from Roland's own manuals

```bash
node tools/profiles/roland/make-profiles.mjs            # rebuild every profile from maps/ + synths/
node tools/profiles/roland/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/roland/import-manual.mjs <MIDI_Imple.pdf> <name> --url <where it came from>
cd CE/web && node --import ./test/support/register-svelte.mjs --test test/rolandManualProfiles.test.js
```

Roland has printed the **Parameter Address Map** in its MIDI Implementations in one fixed-width
table grammar for twenty years. So a profile is not retyped from the manual; the manual is *read*:

| Step | File | What it does |
|---|---|---|
| 1 | `extract-text.mjs` | PDF → text, one column after another (`pdftotext` from poppler-utils). Two-column pages are cropped and read half by half, so a table running down one column and on into the next comes out in order. |
| 2 | `parse-address-map.mjs` | Text → tables: offsets, bit layouts, `#` multi-packet values, `(min - max)`, the display line beneath, `(reserve)` rows, Total Size. Fills in "and so on" (`:`) runs **only** when the arithmetic closes. A transcription — it decides nothing. |
| 3 | `import-manual.mjs` | Writes `maps/<name>.json`: the transcription, plus the source file's name, SHA-256, model, date, version and URL. **This is what is committed. The PDF is Roland's copyright and is not.** |
| 4 | `interpret.mjs` | What each display line means: choice labels (only when they count out to the wire range), display ranges, units, pan, precision. Anything that does not count out stays a number with the manual's line as its description. |
| 5 | `synths/<name>.mjs` | The layout the tables do not state: which blocks make up the edit buffer, the address path to each, what to call it, the identity reply, the bank table, and the manual's **own printed example messages**. |
| 6 | `build-profile.mjs`, `make-profiles.mjs` | Layout + map → `CE/profiles/test/<id>.ceditor-device.json`: parameters, DT1/RQ1 recipes, one RQ1 and one parsed dump per block, startup pull, presets. Refuses to build if its bytes disagree with a printed example. |

## Is the reading right? Checked against the two maps transcribed by hand

Before trusting the parser with a synth nobody here has typed in, it was run on the two manuals
whose address maps this repository already has, transcribed by hand and used against real
hardware:

| Manual | Parameters compared | Offsets, ranges, packets, labels | Differences |
|---|---|---|---|
| SH-01 GAIA MIDI Implementation 1.01 (`SH-01_MI.pdf`) vs `tools/scripts/qa/roland-gaia/address-map.mjs` + `system-map.mjs` | 307 | **all agree** | 6, all cosmetic: the hand map drops `(CC# 0)` from three names, spells out "Sens", and writes a trailing `[dB]`/`[min]` onto each label |
| SH-201 MIDI Implementation (`SH-201_MI.pdf`) vs `CE/profiles/test/roland-sh-201.ceditor-device.json` | 762 | 740 agree outright | 22: the same trailing-unit labels, and the profile's 16 arpeggio *request actions*, which share an address with a parameter by design |

No disagreement in an address, a range, a nibble count or a label set, in either direction. The
SH-201 document also proved the reader against an older typesetting: every dash in it is an em
dash and its headings are marked `❍` rather than `**`.

## What the profiles are, and are not

- **Every block of the edit buffer, at the manual's addresses, with the manual's names.** One RQ1
  per block, every parameter mapped into that block's reply, the startup pull, bank/program recall.
- **Not yet sent to a real instrument.** `coverage.verifiedOnHardware` is `false` and `status` is
  `experimental` until someone's synth answers. The identity reply is the manual's, not a capture.
- **Front-panel controllers are not modelled.** What a knob *transmits* (CC/NRPN) is a separate
  table in the manual; the GAIA profile shows the shape (`inbound`), and the generator does not
  write it yet.
- **Effect parameter meanings are type-dependent.** Roland's MFX/EFX slots are a 4-nibble container
  (12768–52768, shown −20000…+20000). What each slot *does* depends on the selected type and is not
  in the MIDI Implementation; the GAIA profile narrows them from the owner's manual, these do not.

## The profiles

Each is the instrument's edit buffer (its temporary area), read from the manual named in its
`sources`, and each carries the manual's printed example message as a test where the manual prints
a usable one. What a profile leaves out — other parts' tones, the rest of a large drum kit, user
memories — is listed with its addresses in that profile's `coverage`.

| Profile | Manual | Parameters | Blocks | Example |
|---|---|---|---|---|
| `roland-jd-xi` | JD-Xi 1.00 (May 2015) | 6,199 | 67 | p18 |
| `roland-jd-xa` | JD-XA 1.00 (May 2015) | 3,683 | 171 | none usable: p20 contradicts p10 |
| `roland-gaia-2` | GAIA2 1.00 (Sep 2023) | 497 | 19 | p102 |
| `roland-integra-7` | INTEGRA-7 1.00 (Sep 2012) | 11,651 | 216 | p29 |
| `roland-fa-06` | FA-06/07/08 1.01 (Jun 2017) | 11,054 | 241 | p36 |
| `roland-fantom` | FANTOM-6/7/8 1.00 (Nov 2020) | 11,852 | 441 | p66 |
| `roland-fantom-0` | FANTOM-06/07/08 1.00 (Feb 2022) | 11,919 | 441 | p71 |
| `roland-fantom-ex` | FANTOM EX 6/7/8 1.00 (Nov 2023) | 11,982 | 440 | p94 |
| `roland-fantom-g` | Fantom-G6/G7/G8 1.00 (Feb 2008) | 11,047 | 269 | p45 |
| `roland-ax-edge` | AX-Edge 1.01 (Jul 2020) | 1,991 | 63 | p21 |
| `roland-juno-x` | JUNO-X 1.10 (Apr 2022) | 2,668 | 80 | p91 |
| `roland-jupiter-x` | JUPITER-X/Xm 1.06 (Apr 2022) | 2,773 | 81 | p90 |
| `roland-jupiter-80` | JUPITER-80 1.00 (Jun 2011) | 2,916 | 94 | p25 |
| `roland-jupiter-50` | JUPITER-50 1.00 (Apr 2012) | 1,993 | 68 | p25 |
| `roland-juno-ds` | JUNO-DS 1.01 (Feb 2018) | 11,918 | 143 | p64 |
| `roland-xps-30` | XPS-30 1.01 (Feb 2018) | 11,918 | 143 | p64 |
| `roland-xps-10` | XPS-10 1.00 (Apr 2014) | 11,899 | 141 | p27 |
| `roland-juno-di` | JUNO-Di 1.00 (May 2009) | 12,004 | 154 | p24 |
| `roland-juno-gi` | JUNO-Gi 1.00 (Jun 2010) | 3,230 | 70 | p22 |
| `roland-juno-d` | JUNO-D 1.00 (Apr 2004) | 1,094 | 121 | p24 |
| `roland-juno-d6` | JUNO-D6/D7/D8 1.10 (Sep 2024) | 5,083 | 270 | p124-125 |
| `roland-xps-10x` | XPS-10X 1.00 (Aug 2025) | 5,059 | 269 | p112 |
| `roland-xps-60` | XPS-60 1.02 (Jan 2025) | 5,091 | 270 | none usable: p114 carries the JUNO-D6's model ID |
| `roland-mc-808` | MC-808 | 4,106 | 82 | p17 |
| `roland-mc-909` | MC-909 1.00 (Sep 2002) | 4,130 | 83 | p16 |
| `roland-sd-90` | SD-90 1.02 (Dec 2001) | 10,124 | 137 | none usable: p19 contradicts p7; p21 writes twelve values at once |
| `roland-v-synth-gt` | V-Synth GT 1.00 (Apr 2007) | 11,196 | 197 | p20 |
| `roland-vr-700` | VR-700 1.00 (Jan 2010) | 248 | 11 | p10 |
| `roland-xv-5080` | XV-5080 owner's manual, MIDI chapter 1.00 (May 2000) | 10,233 | 234 | p303 |
| `roland-xv-3080` | XV-3080 owner's manual, MIDI chapter 1.0 (Dec 1999) | 8,704 | 113 | p193 |
| `roland-xv-5050` | XV-5050 owner's manual, MIDI chapter | 8,842 | 101 | p174 |
| `roland-xv-2020` | XV-2020 owner's manual, MIDI chapter 1.00 (Jun 2002) | 8,726 | 98 | p159 |
| `roland-xv-88` | XV-88 owner's manual, MIDI chapter 1.00 (Feb 2000) | 8,919 | 131 | p294 |
| `roland-fantom-x` | Fantom-X6/X7/X8 owner's manual, MIDI chapter 1.00 (Feb 2004) | 10,926 | 158 | p329 |
| `roland-fantom-xr` | Fantom-XR owner's manual, MIDI chapter 1.00 (Mar 2004) | 10,549 | 141 | p269 |
| `roland-juno-g` | JUNO-G owner's manual, MIDI chapter 1.00 (Feb 2006) | 10,626 | 158 | p239 |
| `roland-juno-stage` | JUNO-STAGE owner's manual, MIDI chapter 1.00 (May 2008) | 10,674 | 156 | p242 |
| `roland-soniccell` | SonicCell owner's manual, MIDI chapter 1.00 (Jun 2007) | 11,269 | 118 | p275 |
| `roland-v-synth` | V-Synth owner's manual, MIDI chapter 1.00 (Nov 2002) | 5,688 | 104 | p169 |
| `roland-v-synth-xt` | V-Synth XT 1.00 (Mar 2005) | 5,971 | 107 | p19 |
| `roland-sh-32` | SH-32 1.00 (Dec 2001) | 4,827 | 160 | p12 |
| `roland-rd-2000` | RD-2000 1.01 (Jan 2018) | 4,873 | 54 | p16 |
| `roland-rd-2000ex` | RD-2000EX 1.00 (Jan 2024) | 4,873 | 54 | p16 |
| `roland-rd-800` | RD-800 1.00 (Jan 2014) | 2,581 | 36 | p15 |
| `roland-rd-88` | RD-88 1.12 (Jul 2020) | 717 | 26 | p23 |
| `roland-rd-88ex` | RD-88EX 1.00 (Jan 2024) | 717 | 26 | p23 |
| `roland-rd-08` | RD-08 1.00 (Mar 2024) | 698 | 26 | p22 |
| `roland-rd-700nx` | RD-700NX 1.00 (Oct 2010) | 1,577 | 50 | p13 |
| `roland-rd-300nx` | RD-300NX 1.00 (Dec 2010) | 926 | 28 | p14 |
| `roland-rd-700gx` | RD-700GX 1.00 (Feb 2008) | 3,782 | 116 | p14 |
| `roland-rd-300gx` | RD-300GX 1.00 (Feb 2008) | 977 | 45 | p11 |
| `roland-rd-700` | RD-700 owner's manual, MIDI chapter 1.00 (Mar 2001) | 973 | 55 | p160 |

Things the manuals got wrong, found while laying these out and recorded in each layout rather than
corrected — the reason every profile is checked against the manual's own example, not trusted:

- **Examples that contradict their own tables:** the JD-XA's and SD-90's write to the neighbouring
  block's or parameter's address; the XPS-60's carries the JUNO-D6's model ID.
- **Identity replies copied between manuals:** the GAIA-2's table prints the JUPITER-X's family
  code; the JUNO-DS and XPS-30 print the JUNO-Di's message line over byte tables that disagree with
  it; the SD-90 prints a family code of 10 01 against a byte table of 48 01. In each case the
  reading used is the one that tells the instruments apart.
- **Model IDs:** the JUPITER-X prints its last byte as 52H (the AX-Edge's) in two byte lists; the
  FA-06/07/08 names the INTEGRA-7's 64H once and uses 77H everywhere else; the Fantom-G's prose gives
  two bytes where its tables give three; the AX-Edge and JUPITER-X drop an H from the heading.
- **Identity collisions that are the instruments', not the manuals':** the FANTOM EX answers with
  the FANTOM-6/7/8's family code and number, the Fantom-XR with the Fantom-X's, told apart only by a
  revision byte, which profiles do not pin (a firmware update is not a different instrument); the
  V-Synth and V-Synth XT print the same reply byte for byte, revision included; the XV-5080, XV-3080
  and XV-88 all print family 10 01, number 00 00; the RD-2000 and RD-2000EX, and the RD-88, RD-88EX
  and RD-08, differ only by revision. Choosing any of these profiles for its sibling is
  therefore not flagged as a mismatch. (JUNO-STAGE and SonicCell share a model ID but not a family
  number, and are told apart.)
- **Cross-reference marks:** the XV owner's manuals end every address-table entry with the number of
  the table describing it (`*1-3-2-5`); read as part of the name, its last number stopped every
  elided run from filling — the first XV profiles had rhythm sets with no keys until the reader was
  taught to leave the mark out.

## The generator's rules, and why

- **A block bigger than one packet is requested in pieces.** "Data larger than 256 bytes will be
  divided into packets of 256 bytes or less" (128 in a few). A reply in several DT1s cannot be
  matched as one dump, so the request is cut — between parameters, never through one — into pieces
  that each come back whole, each ending after its last parameter so reserved bytes in between
  are never asked for. The packet size is read from the manual into the map.
- **`noPull` keeps a block out of the startup read.** A part holds one tone type at a time and the
  instrument does not answer requests for the others; the engine's startup chain stops at the first
  request that times out. Alternative tone types are therefore read when asked for, not on connect.
- **A run of ASCII rows is one text parameter** — however the manual spells it: `Name 1 … 12`,
  `NAME 1 … 16`, `Name` printed sixteen times, `Scene Memo 1 … 64`.
- **A name printed more than once in a block is numbered** in printed order (`LFO1 Step 1 … 16`),
  and `#` is spelled `Sharp` in ids, so ids can be templated across parts instead of carrying
  address suffixes.
- **A row with a range and no name** is named for its offset (`Unnamed (offset 00 11)`).
- **A row's printed default is its default** where the manual prints one (the SD-90's
  `default: (1024) 0`), instead of the bottom of its range.
- **A layout may state the manual's date and version** (`manual`) where the cover reads badly.
- **A wire range below zero on an unsigned encoding** is a display range printed in the wrong
  column; no byte can carry it, so the parameter is read-only and says why.

## Which Roland manuals can be read this way (surveyed November 2026)

Every product page on the global, US and UK sites was checked (1,104 of them). PDFs are on
`static.roland.com`; older models are listed on the `us` and `uk` sites only.

| State | Models |
|---|---|
| **Profiles** | the fifty-two above |
| **Reads with a few issues** | the original FANTOM (2001), Fantom-VS, VariOS, MC-09, TB-3, VR-09/730, V-STAGE, RD-700SX and RD-300SX (tables mixing full addresses with offsets) |
| **Address map in the owner's manual, still reading with issues** | XP-30, JV-1010 (no ModelID heading, appendix tables), VR-760 |
| **Scanned, no text** — OCR plus an independent transcription to check against | JV-1080, JV-2080, XP-10/50/60/80, JP-8000, MC-303, MC-505, MC-80, MC-50mkII |
| **No address map published** | The Boutiques, the AIRA and TR lines, the grooveboxes: a Control Change list instead. Nineteen are profiles, below |

OCR was tried on the JV-1080's: at 300 dpi it reads the tables but misreads offsets (`00 2B` as
`00 28`) and labels (`1600` as `2600`), and the 1994 table grammar differs. The address arithmetic
can catch the offsets; nothing automatic can catch a label, so the scanned machines wait for a second
source to check against.

## The instruments whose MIDI is a Control Change list

```bash
node tools/profiles/roland/make-cc-profiles.mjs            # rebuild every profile from charts/ + cc-synths/
node tools/profiles/roland/make-cc-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/roland/import-cc-chart.mjs <chart.pdf> <name> --format chart|list|hex --url <where it came from>
cd CE/web && node --test test/rolandCcProfiles.test.js
```

The Boutiques, the AIRA and TR boxes and the grooveboxes publish no address map. What they do
publish is which controller does what, and Roland prints that four ways, all of which
`read-cc-list.mjs` reads:

| Style | Where | Instruments |
|---|---|---|
| `chart` | the MIDI Implementation Chart's own Control Change rows, one number per row, the name in Remarks | JP-08, JU-06, JU-06A, JX-08, JD-08, SYSTEM-1, SH-4d, TR-6S, TR-8S, TR-1000, MC-101, MC-707, VT-4 |
| `list` | a "Control Change / Explanation" table beside or after the chart, often two side by side; the chart gives spans and points to it | SH-01A, TR-06, TR-08, S-1, SE-02 (`CC# / Patch parameter`) |
| `hex` | decimal and hexadecimal side by side, the hexadecimal checking the decimal | P-6 |

The chart is read in every case, for what it says each number does on the wire (sent, received,
both) and as a check: a list that names a number the chart does not count, or the other way
round, is reported. The chart's legend says which glyph is Yes, which is not always a letter: the
VT-4's font extracts its circle as `6`, and its legend says `6 : Yes`.

A profile is every controller the list names, 0 - 127 on its number, named as printed, with the
panel control the manual says edits it as the description. A controller the chart marks as sent
but not received is read-only, so a panel can follow it and never sends it. **No value range is
invented**: Roland does not print how a Boutique divides 0 - 127 among a switch's positions, so a
switch is a number until a manual or an instrument says. The exceptions are values the manual
prints itself: the VT-4's `ROBOT (0, 127)` is those two choices, the SE-02's Bank select is
0 - 3, the JD-08's WAVEFORM receives 0 - 108.

| Profile | Controllers | Read from |
|---|---:|---|
| `roland-jp-08` | 48 (85 parameters: Upper and Lower) | MIDI Implementation Chart 1.01 |
| `roland-ju-06` | 34 | MIDI Implementation Chart 1.01 |
| `roland-ju-06a` | 39 | MIDI Implementation Chart 1.01 |
| `roland-jx-08` | 49 | Reference Manual 1.00, p62 |
| `roland-jd-08` | 85 | Reference Manual 1.00, p59 |
| `roland-sh-01a` | 42 | MIDI Implementation Chart 1.00, Control change list |
| `roland-se-02` | 58 + Bank select | MIDI Implementation Chart 1.00, p2 |
| `roland-tr-06` | 42 | MIDI Implementation Chart 1.00, Control change list |
| `roland-tr-08` | 38 | MIDI Implementation Chart 1.00, Control change list |
| `roland-system-1` | 54 | MIDI Implementation Chart 1.10 |
| `roland-s-1` | 54 | Owner's Manual 1.02, p73-74 |
| `roland-p-6` | 40 | Owner's Manual 1.02, p149-150 |
| `roland-sh-4d` | 32 | Owner's Manual 2.00, p240 |
| `roland-tr-6s` | 34 | MIDI Implementation Chart 1.00 |
| `roland-tr-8s` | 55 | MIDI Implementation Chart 1.10 |
| `roland-tr-1000` | 66 | MIDI Implementation Chart 1.50 |
| `roland-mc-101` | 25 | MIDI Implementation Chart 1.60 |
| `roland-mc-707` | 25 | MIDI Implementation Chart 1.60 |
| `roland-vt-4` | 20 | MIDI Implementation 1.02, p7 |

The JP-08 is two parts, and its chart's note \*1 sends the Lower part's controllers one channel
above the Upper's (16 wraps to 1). Every row marked \*1 is therefore two parameters, on `channel`
and `lowerChannel`; the engine reads a channel from a variable, so `lowerChannel` is kept beside
`channel` and must be set to match.

**What the manuals print wrong**, kept visible with the reason in each layout:

- SYSTEM-1: `OSC1 TYPE` at both CC 46 and 61. By every other oscillator pair (RANGE 47/62, MOD
  60/63, COLOR 50/55), 61 is probably OSC2 TYPE; the parameter keeps the printed name with its
  number and says so, unconfirmed. `PORTAMNETO` (CC 5) is corrected.
- JX-08: `DCO-1 RANGE` at both CC 20 and 47, and `PORTAMENTO TIME` at both 5 (received only)
  and 117; kept, each with its number. `DCO-1 ENEV MOD` (CC 21) is corrected.
- JD-08 `TVF RESONANSE` and SH-01A `PORTAMENT MODE` are corrected.
- S-1: five entries print a waveform icon the text layer drops; read off the rendered page
  (pulse at CC 15, 19 and 102, sawtooth at 20 and 107).

**Checked against midi.guide** (the community CC database, CC BY-SA, `github.com/pencilresearch/midi`,
as of November 2026), which covers eighteen of the nineteen. It agrees with Roland on all but
these, where Roland's own chart says otherwise and the profile follows Roland:

| Instrument | midi.guide | Roland's chart |
|---|---|---|
| JP-08 | ENV-1 RELEASE on CC 5, which it also gives Portamento time; 54 missing | ENV-1 RELEASE is CC 54 |
| SH-4d | PAN on CC 11 | AMP PAN on CC 10; CC 65 (Porta Sw) also received |
| SE-02 | Oscillator 2 mix on CC 4; Filter 1 decay on CC 5, which it also gives Control glide | MIX OSC2 is CC 49, FLT DECAY 1 is CC 52 |
| TR-06 | cowbell on CC 86-88; DELAY TIME and DEPTH missing | no cowbell (the TR-606 has none); DELAY TIME 18, DELAY DEPTH 19 |
| SYSTEM-1 | Osc1/Osc2 variant toggles on CC 105/106 | not in the chart |
| MC-101 | Bank select MSB on CC 0; CC 84 missing | 84 Portamento control; 0/32 are a pair |
| JD-08 | CC 68-71 missing | TONE PALETTE A-D, sent only |

That is the case for reading the manual first: four of the eighteen put a controller on the wrong
number, which would have gone straight into a profile, and three more differ from the chart.

**No Control Change list found** in any English document Roland publishes for SYSTEM-8, SYSTEM-1m,
TB-03, VP-03, TR-09, D-05, TB-3, TR-8 or MV-1; JX-03, J-6, T-8 and E-4 receive only performance
controllers (modulation, expression, hold) or none, which is not an editor's worth. The SP-404MKII
lists its controllers per effect, which wants a layout of its own. And the JD-Xi's and JD-XA's
Control Change and NRPN lists, which their SysEx profiles do not map yet, read the same way.

## Adding a synth

1. Download its MIDI Implementation PDF, and `import-manual.mjs` it. Read the issues it prints:
   a row with no range, or a block whose rows do not add up to its Total Size, is the parser
   misreading something, or the manual being wrong — either way, look before going on.
2. Write `synths/<name>.mjs` from the map's offset tables (`synths/jd-xi.mjs` is the model). The
   path names must match the map exactly; the generator refuses one that matches nothing or more
   than one entry.
3. Copy the manual's example messages (usually the last pages, "Examples of Exclusive Messages")
   into `examples`. They are the check that does not depend on any of this code.
4. If a part can hold alternative tone types, list them in `noPull`.
5. `make-profiles.mjs`, then add the profile to `runProfileTests`' list in
   `CE/tests/DeviceProfileEngineTests.cpp` so the C++ engine checks the same bytes.
6. `ROLAND_SYNTH=<name>` limits `rolandManualProfiles.test.js` to that layout while you work.
