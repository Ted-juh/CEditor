# The device profile library

A **device profile** describes one synth to CEditor: its parameters, the MIDI message that changes
each one, how it sends a whole sound (a dump), and its presets. The
[CEditor manual](editor-manual.md#6-describing-a-synth-device-profiles) explains how to use one.
This page is about the profiles that come with CEditor: where they come from, what they can be
trusted for, and what is known to be missing.

Until November 2026 there were three real ones (the Roland GAIA SH-01 and SH-201, the Yamaha
AN1x). There are now over a hundred, from Roland, Korg, Sequential, Dave Smith Instruments and Oberheim, most of them
read out of the manufacturer's own MIDI documentation by tools in
[`tools/profiles/`](../tools/profiles/README.md). The full list is the
[catalogue](#catalogue) at the end of this page, written from the profiles themselves.

## Where they live

Every profile is a `.ceditor-device.json` file in `CE/profiles/test/`. The folder's name is
historical: the installer ships the whole of `CE/profiles` beside the program, and the program loads
every profile in that folder, so all of them are available in the Device tool and to bindings.
Generated profiles are rebuilt from committed sources, never edited by hand: each one's first
authoring note names the tool that made it.

## How the program lists them

Ninety-odd profiles do not fit a dropdown, so every place that chooses one opens the same picker
(the manual's [Choosing a profile](editor-manual.md#choosing-a-profile) shows it): brands in a row,
most profiles first; a search across model, brand and family; the list grouped by brand and family;
and a pane that says what the chosen profile can do. That pane reads a summary the program makes of
each profile when it lists them (`DeviceProfileEngine::getCatalogSummary`), so choosing does not
open a hundred profiles' parameters.

Two profiles are kept but not offered: `roland-gaia` (15 parameters, made by hand) and
`roland-gaia-dpd` (the Device Profile Designer's 40), both earlier versions of `roland-gaia-sh01`,
which covers the whole SH-01 and is now named plainly **Roland GAIA SH-01**. Panels that name the
older two still load them. The internal test profiles are not offered either.

## What every generated profile is

- **Read from the manufacturer's own document.** Each profile's `sources` names the document, its
  version and date, the page, the file's SHA-256 and where it was downloaded. What is committed is
  the transcription (`tools/profiles/roland/maps/` and `charts/`, `tools/profiles/sequential/tables/`),
  not the PDF, which is the
  manufacturer's copyright. Anyone with the same PDF can re-run the reader and compare.
- **The manual's names, numbers and ranges, and nothing it does not say.** Where a manual is wrong
  (it happens: examples that contradict their own tables, a model ID misprinted, the same name
  printed for two controllers), the layout that builds the profile says so with the reason, and
  the profile's authoring notes repeat it. A name is corrected only when the page itself shows the
  right one; anything inferred stays as printed with the inference written beside it.
- **Experimental, and never sent to a real instrument.** Every one has `status: experimental` and
  `coverage.verifiedOnHardware: false`. The first person to connect one of these synths is the first
  real test; please report what happens.

## How they are checked

None of these checks depends on trusting the code that wrote the profile:

- **The manual's own checks on itself.** A Roland address map's rows must add up to the block size
  it prints; a Roland chart's list must name the numbers its chart counts; an older DSI table's dump
  positions must not repeat, and its layer B numbers must sit one fixed offset above layer A's.
  Where they do not, the reader has misread the page or the manual is wrong, and either way it is
  reported.
- **The manual's own example messages.** Roland prints worked SysEx examples in most MIDI
  Implementations. Each address-map profile carries its manual's example as a test vector, and
  both of CEditor's engines (the C++ one the program uses, and the JavaScript one behind previews)
  must produce it byte for byte. Where a manual's example contradicts its own tables, the profile
  says so instead.
- **Every parameter, through the app's engine.** Each controller of each Control Change profile is
  compiled at both ends of its range and must come out as exactly that controller number on the
  channel the profile says. Every address-map parameter must sit at a 7-bit address in exactly one
  dump, and a dump read back must give back the values that were written.
- **The reader, on fixtures.** Each table style a manual uses has a test written in that style,
  including the ones that once broke the reader.
- **Freshness.** A committed profile that no longer matches what its generator makes fails a test,
  so a layout change cannot ship without its profile.
- **A second source, where one exists.** The Control Change lists were compared with
  [midi.guide](https://midi.guide), the community CC database. Where they disagree, the profile
  follows the manufacturer and the disagreement is recorded in the
  [Roland README](../tools/profiles/roland/README.md#the-instruments-whose-midi-is-a-control-change-list).
  On eighteen instruments midi.guide put a controller on the wrong number four times.

The tests are `CE/web/test/rolandManualProfiles.test.js`, `rolandCcProfiles.test.js`,
`sequentialProfiles.test.js`,
`profilesLoad.test.js` and `profileCatalogue.test.js`; the C++ engine runs every profile's test
vectors in `CE/tests/DeviceProfileEngineTests.cpp`.

## The three kinds of profile

### SysEx address-map profiles

Most Roland synths since the late 1990s print a **Parameter Address Map**: every setting of the
sound being edited, at a fixed SysEx address, with its range. A profile read from one covers the
whole edit buffer, block by block:

- every parameter, sent as a Roland DT1 message with its checksum;
- one RQ1 request per block, and the dump that answers it mapped back to parameters, so **Pull**
  reads the synth's current sound into the panel;
- the identity reply, so CEditor can tell which synth is connected;
- the preset banks, recalled by Bank Select and Program Change.

What they do not cover, each listed in the profile's `coverage`:

- **What the front panel transmits.** Turning a knob on most of these synths sends a CC or NRPN from
  a separate table, which these profiles do not map yet. A panel follows the synth through Pull,
  not through its knobs.
- **What an effect parameter means.** Roland's effect slots are numbered containers whose meaning
  depends on the effect type selected; the MIDI Implementation does not say what each one does.
- **Parts that play another kind of tone.** On a workstation, a part's piano, organ or drum blocks
  answer only when the part is playing that kind of tone, so they are read on request rather than at
  startup.

### Control Change profiles

The Roland Boutiques, AIRA and TR boxes and grooveboxes publish no address map, only which
controller does what. A profile read from that list:

- has one parameter per listed controller, 0 - 127 on its number, named as printed, with the
  manual's note on which panel control edits it;
- makes a controller the instrument only sends read-only, so a panel can follow it and never sends
  it;
- **does not know where a switch's positions fall.** Roland does not print how a Boutique divides
  0 - 127 between a switch's settings, so a switch is a plain number until a manual or an instrument
  says. The exceptions are values a manual does print (the VT-4's on/off pairs, the SE-02's bank
  select, the JD-08's waveform range);
- **cannot read the synth back.** There is nothing to request, so **Pull** does nothing.

The JP-08 has two parts, Upper and Lower, and sends the Lower part's controllers one channel above
the Upper's. Its profile has both, on the variables `channel` and `lowerChannel`, which must be set
to match the instrument (and `lowerChannel` to 1 when `channel` is 16).

### NRPN profiles (Sequential, Dave Smith Instruments and Oberheim)

Every Sequential and DSI instrument since the Prophet '08, and the OB-6, OB-X8 and TEO-5 that
Sequential makes for Oberheim, takes its parameters as NRPNs, and its manual prints them as a table of number, range and name, often with what each value means. A
profile read from those tables:

- has every program, global and control parameter, sent as the manual prints the format: NRPN on
  CC 99/98, value on CC 6/38, most significant byte first;
- is a choice where the manual labels every value of a range (`0 = Off`, `1 = Master`, …), and a
  number otherwise;
- has both layers of a layered instrument (Prophet Rev2, 12, X and '08, Tetra), as `A:` and `B:`;
- knows the identity reply, and recalls presets by Bank Select (CC 32) and Program Change where the
  manual's bank line is unambiguous. The OB-6 and OB-X8 manuals print a sibling's identity (the
  Prophet-6's and the Prophet-5's), so those two profiles do not try to recognise the instrument;
- **needs the instrument set to receive NRPNs** (Global: MIDI Param Receive = NRPN or All);
- **cannot read the synth back yet.** The manuals describe the program dump, but which byte holds
  which parameter is not mapped, so **Pull** does nothing. The program name is not editable either:
  it is one character per NRPN, which CEditor cannot edit as text.

### Korg profiles

Korg publishes each instrument's MIDI Implementation as a plain-text file, read by
[`tools/profiles/korg/`](../tools/profiles/korg/README.md). A Korg profile:

- has every control change the document says the instrument recognises, and every row of its NRPN
  table that has a range;
- is a choice where the document names a controller's values and its receive and transmit tables
  agree on them; where they disagree, or the list depends on another setting, a number with both
  readings in its description;
- sends a value wider than 7 bits as Korg prints the format, its low bits first on CC 63;
- recalls presets by the document's own Bank Select and Program Change lines, and knows the identity
  reply, except on the first volcas, which have no MIDI Out;
- **reads the current program back (Pull)** on the minilogue, minilogue xd, monologue, prologue,
  NTS-1 mkII and miniKORG 700Sm: the
  documents print the program dump byte by byte, and each setting found there under the parameter's
  name is read from it, a controller as the top seven bits of its 10-bit field. The prologue's is
  read from its first timbre, taken to be the main one; the volcas send no dump. The request
  carries the instrument's global MIDI channel; the profiles assume channel 1.

## Things to know before relying on one

These are recorded in [known issues](known-issues.md#device-profiles) with what would close them.

- **Korg's Pull assumes global MIDI channel 1.** The dump request and the dump carry the global
  channel in their header (`3g`); the profiles' `deviceId` variable is that byte, 30H. An instrument
  set to another global channel ignores the request until the variable is changed to match.
- **Sequential profiles assume NRPN.** The instrument's Global setting decides whether it listens to
  NRPNs, CCs or neither; set to CC, it ignores everything these profiles send.
- **Sibling instruments answer with the same identity.** Several pairs print the same identity
  reply, differing at most in a revision byte, which profiles deliberately do not compare (a
  firmware update is not a different instrument): FANTOM-6/7/8 and FANTOM EX; Fantom-X and
  Fantom-XR; V-Synth and V-Synth XT; XV-5080, XV-3080 and XV-88; RD-2000 and RD-2000EX; RD-88,
  RD-88EX and RD-08. CEditor cannot warn when the wrong one of a pair is chosen.
- **The startup read stops at the first request that is not answered.** That is why a workstation's
  optional blocks are read on request, and why a synth set to a different device ID will appear to
  answer nothing after the identity request.
- **The library is large.** The profiles total about 234 MB, the largest workstation profiles about
  9 MB each, and the program parses every one when it first needs a profile. How long that takes on
  a typical Windows machine has not been measured.
- **Korg's wide NRPN values are send-only.** A minilogue xd value wider than 7 bits goes out low bits
  first on CC 63, as Korg prints it; when the instrument sends one, CEditor does not put the halves
  back together.
- **The preview engine does not check ranges.** The JavaScript engine compiles a value outside a
  parameter's range where the C++ engine refuses it, so a preview can show a message the program
  would not send.
- **Reading controllers back ignores the channel.** When a synth sends a controller, CEditor finds
  the parameter by its message with the channel masked out. For a profile with two parts on two
  channels (the JP-08), a knob turned on the Lower part is read as the Upper part's.
- **The Device Profile Designer** can show and edit only the profiles it was built with (see the
  manual's "Not finished yet" note). The others work in the Device tool and in bindings.

## Adding to it

[`tools/profiles/README.md`](../tools/profiles/README.md) has the rules every profile here follows
and the steps for a new brand. The Roland pipeline and its findings are in
[`tools/profiles/roland/README.md`](../tools/profiles/roland/README.md) and the Sequential one and its
findings in [`tools/profiles/sequential/README.md`](../tools/profiles/sequential/README.md). Both list
what is still to read and why: tables that read with problems, scanned manuals with no text, and
instruments for which no MIDI list was found.

## Catalogue

Written by `node tools/profiles/catalogue.mjs` from the profiles in `CE/profiles/test` (the
internal test profiles are left out). "Made by" is the generator named in the profile's first
authoring note.

<!-- catalogue:start (generated by tools/profiles/catalogue.mjs; do not edit by hand) -->

106 profiles, 340,077 parameters between them; none yet checked on a real instrument.

### Dave Smith Instruments (5)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `sequential-mopho` | DSI Mopho | Mopho | NRPN | 117 | Mopho Manual (version 1.2) | `sequential/make-profiles.mjs` |
| `sequential-mopho-keyboard` | DSI Mopho Keyboard | Mopho | NRPN | 126 | Mopho Keyboard Manual (version 1.1) | `sequential/make-profiles.mjs` |
| `sequential-mopho-x4` | DSI Mopho x4 | Mopho | NRPN | 127 | Mopho x4 Operation Manual (version 1.0) | `sequential/make-profiles.mjs` |
| `sequential-prophet-08` | DSI Prophet '08 | Prophet | NRPN | 350 | Prophet '08 Manual (version 1.3) | `sequential/make-profiles.mjs` |
| `sequential-tetra` | DSI Tetra | Tetra | NRPN | 370 | Tetra Manual (version 1.3) | `sequential/make-profiles.mjs` |

### Generic (1)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `generic-cc-dpd` | Generic MIDI CC (from DPD) | — | Control changes | 10 | — | Device Profile Designer |

### Korg (12)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `korg-minilogue` | Korg minilogue | logue | Control changes | 39 | minilogue MIDI Implementation (Revision 1.10, 2016.07.10) | `korg/make-profiles.mjs` |
| `korg-minilogue-xd` | Korg minilogue xd | logue | CC, NRPN | 101 | minilogue xd MIDI Implementation (Revision 1.01, 2020.2.10) | `korg/make-profiles.mjs` |
| `korg-monologue` | Korg monologue | logue | Control changes | 24 | monologue MIDI Implementation (Revision 1.00, 2019.02.19) | `korg/make-profiles.mjs` |
| `korg-prologue` | Korg prologue | logue | Control changes | 57 | prologue MIDI Implementation (Revision 1.01, 2020.2.10) | `korg/make-profiles.mjs` |
| `korg-minikorg-700sm` | Korg miniKORG 700Sm | miniKORG | Control changes | 29 | miniKORG 700Sm MIDI Implementation (Revision 1.00, 2024.10.07) | `korg/make-profiles.mjs` |
| `korg-nts-1-mk2` | Korg NTS-1 mkII | NTS | CC, NRPN | 62 | NTS-1 digital kit mkII MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-volca-bass` | Korg volca bass | volca | Control changes | 12 | volca bass MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-beats` | Korg volca beats | volca | Control changes | 20 | volca beats MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-fm2` | Korg volca fm2 | volca | Control changes | 13 | volca fm2 MIDI Implementation (Revision 1.00, 2022.11.17) | `korg/make-profiles.mjs` |
| `korg-volca-keys` | Korg volca keys | volca | Control changes | 16 | volca keys MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-kick` | Korg volca kick | volca | Control changes | 10 | volca kick MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-volca-nubass` | Korg volca nubass | volca | Control changes | 11 | volca nubass MIDI Implementation | `korg/make-profiles.mjs` |

### Oberheim (3)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `oberheim-ob-6` | Oberheim OB-6 | OB | NRPN | 872 | OB-6 Operation Manual (version 1.2) | `sequential/make-profiles.mjs` |
| `oberheim-ob-x8` | Oberheim OB-X8 | OB | NRPN | 113 | OB-X8 Manual (version 2.2) | `sequential/make-profiles.mjs` |
| `oberheim-teo-5` | Oberheim TEO-5 | TEO | NRPN | 184 | TEO-5 MIDI Implementation Document (version 2) | `sequential/make-profiles.mjs` |

### Roland (75)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `roland-system-1` | Roland SYSTEM-1 | AIRA | Control changes | 54 | SYSTEM-1 MIDI Implementation Chart (version 1.10, Jul. 25, 2014) | `roland/make-cc-profiles.mjs` |
| `roland-vt-4` | Roland VT-4 | AIRA | Control changes | 20 | VT-4 MIDI Implementation Chart (version 1.02, Nov. 16. 2018) | `roland/make-cc-profiles.mjs` |
| `roland-p-6` | Roland P-6 | AIRA Compact | Control changes | 40 | P-6 Owner's Manual, Control change message (version 1.02, Aug. 29, 2024) | `roland/make-cc-profiles.mjs` |
| `roland-s-1` | Roland S-1 | AIRA Compact | Control changes | 54 | S-1 Owner's Manual, Control change list (version 1.02, Apr. 18, 2023) | `roland/make-cc-profiles.mjs` |
| `roland-ax-edge` | Roland AX-Edge | AX | SysEx parameters and dumps | 1,991 | AX-Edge MIDI Implementation (version 1.01, Jul 1, 2020) | `roland/make-profiles.mjs` |
| `roland-jd-08` | Roland JD-08 | Boutique | Control changes | 85 | JD-08 Reference Manual, MIDI Implementation Chart (version 1.00, Oct. 13, 2021) | `roland/make-cc-profiles.mjs` |
| `roland-jp-08` | Roland JP-08 | Boutique | Control changes | 85 | JP-08 MIDI Implementation Chart (version 1.01, Aug. 03, 2016) | `roland/make-cc-profiles.mjs` |
| `roland-ju-06` | Roland JU-06 | Boutique | Control changes | 34 | JU-06 MIDI Implementation Chart (version 1.01, Aug. 03, 2016) | `roland/make-cc-profiles.mjs` |
| `roland-ju-06a` | Roland JU-06A | Boutique | Control changes | 39 | JU-06A MIDI Implementation Chart (version 1.01, Sep. 5, 2019) | `roland/make-cc-profiles.mjs` |
| `roland-jx-08` | Roland JX-08 | Boutique | Control changes | 49 | JX-08 Reference Manual, MIDI Implementation Chart (version 1.00, Oct. 13, 2021) | `roland/make-cc-profiles.mjs` |
| `roland-se-02` | Roland SE-02 | Boutique | Control changes | 59 | SE-02 MIDI Implementation Chart (version 1.00) | `roland/make-cc-profiles.mjs` |
| `roland-sh-01a` | Roland SH-01A | Boutique | Control changes | 42 | SH-01A MIDI Implementation Chart (version 1.00, Aug. 8, 2017) | `roland/make-cc-profiles.mjs` |
| `roland-tr-06` | Roland TR-06 | Boutique | Control changes | 42 | TR-06 MIDI Implementation Chart (version 1.00, July. 28, 2020) | `roland/make-cc-profiles.mjs` |
| `roland-tr-08` | Roland TR-08 | Boutique | Control changes | 38 | TR-08 MIDI Implementation Chart (version 1.00, Aug. 8, 2017) | `roland/make-cc-profiles.mjs` |
| `roland-fa-06` | Roland FA-06/07/08 | FA | SysEx parameters and dumps | 11,054 | FA-06/07/08 MIDI Implementation (version 1.01, June 1, 2017) | `roland/make-profiles.mjs` |
| `roland-fantom-ex` | Roland FANTOM EX 6/7/8 | FANTOM | SysEx parameters and dumps | 11,982 | FANTOM EX 6/7/8 MIDI Implementation (version 1.00, Nov 1, 2023) | `roland/make-profiles.mjs` |
| `roland-fantom-0` | Roland FANTOM-06/07/08 | FANTOM | SysEx parameters and dumps | 11,919 | FANTOM-06/07/08 MIDI Implementation (version 1.00, Feb 1, 2022) | `roland/make-profiles.mjs` |
| `roland-fantom` | Roland FANTOM-6/7/8 | FANTOM | SysEx parameters and dumps | 11,852 | FANTOM-6/7/8 MIDI Implementation (version 1.00, Nov 1, 2020) | `roland/make-profiles.mjs` |
| `roland-fantom-g` | Roland Fantom-G6/G7/G8 | FANTOM | SysEx parameters and dumps | 11,047 | Roland Fantom-G6/G7/G8 MIDI Implementation (version 1.00, Feb. 1, 2008) | `roland/make-profiles.mjs` |
| `roland-fantom-x` | Roland Fantom-X6/X7/X8 | FANTOM | SysEx parameters and dumps | 10,926 | Fantom-X6/X7/X8 MIDI Implementation (version 1.00, Feb. 2, 2004) | `roland/make-profiles.mjs` |
| `roland-fantom-xr` | Roland Fantom-XR | FANTOM | SysEx parameters and dumps | 10,549 | Fantom-XR MIDI Implementation (version 1.00, Mar. 3, 2004) | `roland/make-profiles.mjs` |
| `roland-gaia-2` | Roland GAIA-2 | GAIA | SysEx parameters and dumps | 497 | GAIA2 MIDI Implementation (version 1.00, Sep. 1, 2023) | `roland/make-profiles.mjs` |
| `roland-integra-7` | Roland INTEGRA-7 | INTEGRA | SysEx parameters and dumps | 11,651 | INTEGRA-7 MIDI Implementation (version 1.00, September 1, 2012) | `roland/make-profiles.mjs` |
| `roland-jd-xa` | Roland JD-XA | JD | SysEx parameters and dumps | 3,683 | JD-XA MIDI Implementation (version 1.00, May 13, 2015) | `roland/make-profiles.mjs` |
| `roland-jd-xi` | Roland JD-Xi | JD | SysEx parameters and dumps | 6,199 | JD-Xi MIDI Implementation (version 1.00, May 1, 2015) | `roland/make-profiles.mjs` |
| `roland-juno-d` | Roland JUNO-D | JUNO | SysEx parameters and dumps | 1,094 | JUNO-D MIDI Implementation (version 1.00, April 1, 2004) | `roland/make-profiles.mjs` |
| `roland-juno-d6` | Roland JUNO-D6/D7/D8 | JUNO | SysEx parameters and dumps | 5,083 | JUNO-D6/D7/D8 MIDI Implementation (version 1.10, Sep. 24, 2024) | `roland/make-profiles.mjs` |
| `roland-juno-di` | Roland JUNO-Di | JUNO | SysEx parameters and dumps | 12,004 | Roland JUNO-Di MIDI Implementation (version 1.00, May 1, 2009) | `roland/make-profiles.mjs` |
| `roland-juno-ds` | Roland JUNO-DS | JUNO | SysEx parameters and dumps | 11,918 | JUNO-DS61/DS88 MIDI Implementation (version 1.01, Feb 15, 2018) | `roland/make-profiles.mjs` |
| `roland-juno-g` | Roland JUNO-G | JUNO | SysEx parameters and dumps | 10,626 | JUNO-G MIDI Implementation (version 1.00, Feb. 1, 2006) | `roland/make-profiles.mjs` |
| `roland-juno-gi` | Roland JUNO-Gi | JUNO | SysEx parameters and dumps | 3,230 | JUNO-Gi MIDI Implementation (version 1.00, June 1, 2010) | `roland/make-profiles.mjs` |
| `roland-juno-stage` | Roland JUNO-STAGE | JUNO | SysEx parameters and dumps | 10,674 | JUNO-STAGE MIDI Implementation (version 1.00, May 1, 2008) | `roland/make-profiles.mjs` |
| `roland-juno-x` | Roland JUNO-X | JUNO | SysEx parameters and dumps | 2,668 | JUNO-X MIDI Implementation (version 1.10, April 26, 2022) | `roland/make-profiles.mjs` |
| `roland-jupiter-50` | Roland JUPITER-50 | JUPITER | SysEx parameters and dumps | 1,993 | JUPITER-50 MIDI Implementation (version 1.00, April 30, 2012) | `roland/make-profiles.mjs` |
| `roland-jupiter-80` | Roland JUPITER-80 | JUPITER | SysEx parameters and dumps | 2,916 | JUPITER-80 MIDI Implementation (version 1.00, June 30, 2011) | `roland/make-profiles.mjs` |
| `roland-jupiter-x` | Roland JUPITER-X/Xm | JUPITER | SysEx parameters and dumps | 2,773 | JUPITER-X/Xm MIDI Implementation (version 1.06, Apr 19, 2022) | `roland/make-profiles.mjs` |
| `roland-mc-101` | Roland MC-101 | MC | Control changes | 25 | MC-101 MIDI Implementation Chart (version 1.60, Sep. 25, 2020) | `roland/make-cc-profiles.mjs` |
| `roland-mc-707` | Roland MC-707 | MC | Control changes | 25 | MC-707 MIDI Implementation Chart (version 1.60, Sep. 25, 2020) | `roland/make-cc-profiles.mjs` |
| `roland-mc-808` | Roland MC-808 | MC | SysEx parameters and dumps | 4,106 | MC-808 MIDI Implementation | `roland/make-profiles.mjs` |
| `roland-mc-909` | Roland MC-909 | MC | SysEx parameters and dumps | 4,130 | MC-909 (sampling groovebox) MIDI Implementation (version 1.00, Sep. 20, 2002) | `roland/make-profiles.mjs` |
| `roland-rd-08` | Roland RD-08 | RD | SysEx parameters and dumps | 698 | RD-08 MIDI Implementation (version 1.00, Mar.19,2024) | `roland/make-profiles.mjs` |
| `roland-rd-2000` | Roland RD-2000 | RD | SysEx parameters and dumps | 4,873 | RD-2000 MIDI Implementation (version 1.01, Jan. 1, 2018) | `roland/make-profiles.mjs` |
| `roland-rd-2000ex` | Roland RD-2000EX | RD | SysEx parameters and dumps | 4,873 | RD-2000EX MIDI Implementation (version 1.00, Jan. 1, 2024) | `roland/make-profiles.mjs` |
| `roland-rd-300gx` | Roland RD-300GX | RD | SysEx parameters and dumps | 977 | RD-300GX MIDI Implementation (version 1.00, Feb. 1, 2008) | `roland/make-profiles.mjs` |
| `roland-rd-300nx` | Roland RD-300NX | RD | SysEx parameters and dumps | 926 | RD-300NX MIDI Implementation (version 1.00, Dec. 10, 2010) | `roland/make-profiles.mjs` |
| `roland-rd-700` | Roland RD-700 | RD | SysEx parameters and dumps | 973 | RD-700 MIDI Implementation (version 1.00, Mar. 1, 2001) | `roland/make-profiles.mjs` |
| `roland-rd-700gx` | Roland RD-700GX | RD | SysEx parameters and dumps | 3,782 | RD-700GX MIDI Implementation (version 1.00, Feb. 1, 2008) | `roland/make-profiles.mjs` |
| `roland-rd-700nx` | Roland RD-700NX | RD | SysEx parameters and dumps | 1,577 | RD-700NX MIDI Implementation (version 1.00, Oct. 10, 2010) | `roland/make-profiles.mjs` |
| `roland-rd-800` | Roland RD-800 | RD | SysEx parameters and dumps | 2,581 | RD-800 MIDI Implementation (version 1.00, Jan. 1, 2014) | `roland/make-profiles.mjs` |
| `roland-rd-88` | Roland RD-88 | RD | SysEx parameters and dumps | 717 | RD-88 MIDI Implementation (version 1.12, Jul. 22, 2020) | `roland/make-profiles.mjs` |
| `roland-rd-88ex` | Roland RD-88EX | RD | SysEx parameters and dumps | 717 | RD-88EX MIDI Implementation (version 1.00, Jan. 1, 2024) | `roland/make-profiles.mjs` |
| `roland-sd-90` | Roland SD-90 | SD | SysEx parameters and dumps | 10,124 | SD-90 MIDI Implementation (version 1.02, December 12, 2001) | `roland/make-profiles.mjs` |
| `roland-gaia-sh01` | Roland GAIA SH-01 | SH | SysEx parameters and dumps | 882 | Roland SH-01 GAIA MIDI Implementation (v1.01, Sep 2010) | before these tools |
| `roland-gaia` | Roland GAIA SH-01 | SH | SysEx parameters | 15 | Roland SH-01 GAIA MIDI Implementation (v1.01, Sep 2010) | before these tools |
| `roland-gaia-dpd` | Roland GAIA SH-01 (from DPD) | SH | SysEx parameters | 40 | — | Device Profile Designer |
| `roland-sh-201` | Roland SH-201 | SH | SysEx parameters and dumps | 766 | Roland SH-201 MIDI Implementation | before these tools |
| `roland-sh-32` | Roland SH-32 | SH | SysEx parameters and dumps | 4,827 | SH-32 MIDI Implementation (version 1.00, Dec. 12, 2001) | `roland/make-profiles.mjs` |
| `roland-sh-4d` | Roland SH-4d | SH | Control changes | 32 | SH-4d Owner's Manual, MIDI implementation chart (version 2.00) | `roland/make-cc-profiles.mjs` |
| `roland-soniccell` | Roland SonicCell | SonicCell | SysEx parameters and dumps | 11,269 | SonicCell MIDI Implementation (version 1.00, 2007.6.15) | `roland/make-profiles.mjs` |
| `roland-tr-1000` | Roland TR-1000 | TR | Control changes | 66 | TR-1000 MIDI Implementation Chart (version 1.50, Oct.1 2026) | `roland/make-cc-profiles.mjs` |
| `roland-tr-6s` | Roland TR-6S | TR | Control changes | 34 | TR-6S MIDI Implementation Chart (version 1.00, Apr. 22, 2020) | `roland/make-cc-profiles.mjs` |
| `roland-tr-8s` | Roland TR-8S | TR | Control changes | 55 | TR-8S MIDI Implementation Chart (version 1.10, Oct. 4, 2018) | `roland/make-cc-profiles.mjs` |
| `roland-v-synth` | Roland V-Synth | V-Synth | SysEx parameters and dumps | 5,688 | V-Synth MIDI Implementation (version 1.00, Nov. 20, 2002) | `roland/make-profiles.mjs` |
| `roland-v-synth-gt` | Roland V-Synth GT | V-Synth | SysEx parameters and dumps | 11,196 | V-Synth GT MIDI Implementation (version 1.00, April 1, 2007) | `roland/make-profiles.mjs` |
| `roland-v-synth-xt` | Roland V-Synth XT | V-Synth | SysEx parameters and dumps | 5,971 | V-Synth XT MIDI Implementation (version 1.00, Mar. 24, 2005) | `roland/make-profiles.mjs` |
| `roland-vr-700` | Roland VR-700 | VR | SysEx parameters and dumps | 248 | Roland VR-700 MIDI Implementation (version 1.00, Jan. 1, 2010) | `roland/make-profiles.mjs` |
| `roland-xps-10` | Roland XPS-10 | XPS | SysEx parameters and dumps | 11,899 | XPS-10 MIDI Implementation (version 1.00, April 1, 2014) | `roland/make-profiles.mjs` |
| `roland-xps-10x` | Roland XPS-10X | XPS | SysEx parameters and dumps | 5,059 | XPS-10X MIDI Implementation (version 1.00, Aug. 20, 2025) | `roland/make-profiles.mjs` |
| `roland-xps-30` | Roland XPS-30 | XPS | SysEx parameters and dumps | 11,918 | XPS-30 MIDI Implementation (version 1.01, Feb 15, 2018) | `roland/make-profiles.mjs` |
| `roland-xps-60` | Roland XPS-60 | XPS | SysEx parameters and dumps | 5,091 | XPS-60 MIDI Implementation (version 1.02, Jan. 14, 2025) | `roland/make-profiles.mjs` |
| `roland-xv-2020` | Roland XV-2020 | XV | SysEx parameters and dumps | 8,726 | XV-2020 MIDI Implementation (version 1.00, June 4, 2002) | `roland/make-profiles.mjs` |
| `roland-xv-3080` | Roland XV-3080 | XV | SysEx parameters and dumps | 8,704 | XV-3080 MIDI Implementation (version 1.0, December 18, 1999) | `roland/make-profiles.mjs` |
| `roland-xv-5050` | Roland XV-5050 | XV | SysEx parameters and dumps | 8,842 | XV-5050 MIDI Implementation (version 1.00, October 4, 2001) | `roland/make-profiles.mjs` |
| `roland-xv-5080` | Roland XV-5080 | XV | SysEx parameters and dumps | 10,233 | XV-5080 MIDI Implementation (version 1.00, May 20, 2000) | `roland/make-profiles.mjs` |
| `roland-xv-88` | Roland XV-88 | XV | SysEx parameters and dumps | 8,919 | XV-88 MIDI Implementation (version 1.00, February 15, 2000) | `roland/make-profiles.mjs` |

### Sequential (9)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `sequential-fourm` | Sequential Fourm | Fourm | NRPN | 116 | Fourm MIDI Implementation Document (version 1.1) | `sequential/make-profiles.mjs` |
| `sequential-pro-2` | Sequential Pro 2 | Pro | NRPN | 843 | Pro 2 Operation Manual (version 1.2) | `sequential/make-profiles.mjs` |
| `sequential-prophet-12` | Sequential Prophet 12 | Prophet | NRPN | 474 | Prophet 12 Operation Manual (version 1.0) | `sequential/make-profiles.mjs` |
| `sequential-prophet-rev2` | Sequential Prophet Rev2 | Prophet | NRPN | 1,961 | Prophet Rev2 User's Guide (version 1.2.4) | `sequential/make-profiles.mjs` |
| `sequential-prophet-x` | Sequential Prophet X/XL | Prophet | NRPN | 503 | Prophet X User's Guide (version 1.3) | `sequential/make-profiles.mjs` |
| `sequential-prophet-5` | Sequential Prophet-5/10 | Prophet | NRPN | 70 | Prophet-5 MIDI Implementation (version 1.4) | `sequential/make-profiles.mjs` |
| `sequential-prophet-6` | Sequential Prophet-6 | Prophet | NRPN | 876 | Prophet-6 Operation Manual (version 2.1) | `sequential/make-profiles.mjs` |
| `sequential-take-5` | Sequential Take 5 | Take | NRPN | 158 | Take 5 MIDI Implementation (version V2) | `sequential/make-profiles.mjs` |
| `sequential-trigon-6` | Sequential Trigon-6 | Trigon | NRPN | 563 | Trigon-6 MIDI Implementation (version 1.1) | `sequential/make-profiles.mjs` |

### Yamaha (1)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `yamaha-an1x-dpd` | Yamaha AN1x (from DPD) | AN | SysEx parameters and dumps | 1,296 | — | Device Profile Designer |

<!-- catalogue:end -->
