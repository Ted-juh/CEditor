# The device profile library

A **device profile** describes one synth to CEditor: its parameters, the MIDI message that changes
each one, how it sends a whole sound (a dump), and its presets. The
[CEditor manual](editor-manual.md#6-describing-a-synth-device-profiles) explains how to use one.
This page is about the profiles that come with CEditor: where they come from, what they can be
trusted for, and what is known to be missing.

Until November 2026 there were three real ones (the Roland GAIA SH-01 and SH-201, the Yamaha
AN1x). There are now over a hundred, from Roland, Korg, Novation, Sequential, Dave Smith Instruments and Oberheim, most of them
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
- on the microKORG (2002), has the panel's knobs on the control changes the Owner's Manual gives
  them from the factory (the MIDI Implementation leaves them assignable). Six knobs mean one thing in
  a synth program and another in a vocoder program; each is two parameters, the second named
  `Vocoder …`, and CEditor does not attribute that controller when the instrument sends it;
- on the microKORG S, KingKORG and KingKORG NEO, reaches every setting of the program, the timbres,
  the effects, the vocoder and the arpeggiator by SysEx parameter change, a bipolar setting as a
  signed value (how the profiles read the documents' "signed value");
- recalls presets by the document's own Bank Select and Program Change lines, and knows the identity
  reply, except on the first volcas, which have no MIDI Out, and the VOX Continental, whose 61 and 73
  answer differently and share one profile;
- on the PS-3300, has each of its three PSU-3301 units' settings by NRPN, the MSB picking the unit,
  in single channel mode;
- **reads the current program back (Pull)** on the minilogue, minilogue xd, monologue, prologue,
  NTS-1 mkII, miniKORG 700Sm and PS-3300: the
  documents print the program dump byte by byte, and each setting found there under the parameter's
  name is read from it, a controller as the top seven bits of its 10-bit field. The prologue's is
  read from its first timbre, taken to be the main one; the volcas send no dump. The request
  carries the instrument's global MIDI channel; the profiles assume channel 1.

### Novation profiles

Novation prints each synth's MIDI parameters as a table in a PDF: a user guide's appendix, a
programmer's reference, a chart of its own. [`tools/profiles/novation/`](../tools/profiles/novation/README.md)
reads those tables from the PDFs' word positions. A Novation profile:

- has every row of the table that names a control change or an NRPN and prints the values sent for
  it, with what they show where the table says (`63-66 (-1 to +2)`);
- offers a CC pair (`CC pair 14,46`, 0 - 255) as its coarse controller alone, 0 - 127: no guide says
  which bit the second controller carries;
- is a choice only where the table numbers the values it names, in the row itself or in a value
  table the row points to (`See Osc Waveform Table`);
- on the Circuit Tracks, has both synths, the drums and the project, each on its own channel
  variable (1, 2, 10 and 16); on the Circuit Rhythm, its eight sampler parts on 1 to 8 and its
  effects on 16;
- on the K-Station and KS series, has each controller and NRPN of the manual's MIDI lists that is
  one setting; the packed ones, several settings in one value, are left out;
- does not check identity: none of these documents prints a Device Inquiry reply;
- **reads the current patch back (Pull) on the Circuit Tracks**, for each synth, from the patch
  format its programmer's reference prints; the reply comes over USB only. None of the others'
  documents prints a program dump.

### Moog profiles

Moog prints each instrument's MIDI controllers as a table in its manual, most often near the end:
a column for the name, one for the controller (or the MSB and the LSB), one for the values.
[`tools/profiles/moog/`](../tools/profiles/moog/README.md) reads those tables from the PDFs' word
positions, the columns found by their printed headings. A Moog profile:

- has every row of the table that prints a controller and the values it takes;
- offers a knob printed as an MSB and an LSB (`19 [MSB], 51 [LSB]`) as one 14-bit parameter, 0 -
  16383, sent as the MSB and then the LSB and followed on both when the instrument sends them; where
  the table prints the same LSB for two rows, those knobs are their MSB alone, 0 - 127;
- is a choice where the table names the values (`0-63 = OFF, 64-127 = ON`, `0 = 16', 32 = 8'`),
  the first value of each band sent, or where it points to a value table (the Grandmother's clock
  divisions, the Little Phatty's clock dividers); a list printed out of order stays a number;
- on the Sub 37 and Subsequent 37, also has the NRPN chart, every setting as one 14-bit value; on the
  Claravox Centennial, its 14-bit settings on their NRPNs and the rest on their CCs;
- on the Matriarch, has its global settings by SysEx, and **reads each one back** from the reply to
  a request for it; none of the others' manuals prints a dump;
- does not check identity: no manual prints a Device Inquiry reply.

### Yamaha profiles

Yamaha prints each instrument's MIDI in a data list: its message formats, a parameter change table
for each block of its memory, and the blocks of its bulk dump.
[`tools/profiles/yamaha/`](../tools/profiles/yamaha/README.md) reads those tables from the PDF's word
positions. A Yamaha profile:

- has every row of the parameter change tables that prints a data range, sent as a parameter change
  to its address;
- is a choice where the description names every value of the range in order, and shows the values
  as printed where the description gives a range of numbers as long as the data range
  (`-24 – +24 (semitones)`, `-12 – +12 [dB]`);
- checks identity against the reply the data list prints, where it prints one in full;
- **reads the synth back (Pull)** from its bulk dumps, a block at a time or a header's blocks as one
  collection, complete at its Bulk Footer, with the checksum the data list prints; the sound's name
  is read, not written;
- takes the device number to be 1 (parameter changes on 10H, requests on 20H);
- on the MODX and MODX+, lays out the Performance and Part 1 (its elements, drum keys and FM-X
  operators): the other 15 parts are the same parameters at their own addresses, which would make
  some 85,000 in all, and Pulls the Performance Common and Part 1 from their edit buffers. Their
  identity is not checked: the data list prints it with `dd dd`;
- on the MOXF, lays out every table in full (the Performance's 4 parts, the Song/Pattern mixing's
  16, the Normal Voice's 8 elements and the Drum Voice's 73 keys), and Pulls each edit buffer:
  Normal Voice, Drum Voice, Performance, Multi and Master, and the System's blocks;
- on the MX49/MX61/MX88, the same in the MX's smaller format (the Performance's 16 parts, the
  voices' elements and keys), with identity, and Pull from its three edit buffers;
- on the MODX M and MONTAGE M, lays out the Performance and Part 1 as on the MODX, with four-byte
  addresses and two-byte values, its first 8 of up to 128 elements and its AN-X oscillators, and
  Pulls the Performance Common and Part 1;
- on the MONTAGE (2016), as on the MODX, Pulling the whole Performance edit buffer;
- on the MOTIF XS and XF, MOTIF-RACK XS, MOX, S90 XS/S70 XS and MO6/MO8, lays out every table as on
  the MOXF, with each model's zones, parts, elements and audio inputs, and Pulls the edit buffers;
- on the MOTIF ES, S90 ES, MOTIF-RACK ES and the MOTIF of 2001, the generation before, the same:
  with their Plug-in Parts and Plug-in Voice (what a PLG board holds) and the A/D Parts, and Pull
  from each edit buffer, the Plug-in Voice's too;
- on the CP1, CP5, CP50, CP4 STAGE, CP40 STAGE, CP88/CP73, YC61 and YC88/YC73, lays out every table,
  with identity where one model's code is printed, and Pulls the current sound; the CP50's leaves
  out what the CP5/CP50 data list marks CP5 only.

### Waldorf profiles

Waldorf prints the MIDI of its SysEx-programmed instruments in a System Exclusive Specification: a
sound data table of every parameter by index, its range and what its values show, the value lists,
and the messages. [`tools/profiles/waldorf/`](../tools/profiles/waldorf/README.md) reads it from the
PDF's word positions. A Waldorf profile:

- has every row of the sound data table that prints a range, sent as a Sound Parameter Change to the
  Sound mode edit buffer, the parameter's index in two 7-bit bytes;
- is a choice where the value column names a value list or lists one name a value, and a byte the
  specification prints as bit fields with a list for each (the Blofeld's Allocation and Unisono, its
  envelope modes and triggers) a choice of every combination;
- lays out each effect parameter as a number, its meaning for each effect type in its description;
- checks identity against the reply the specification prints;
- **reads the synth back (Pull)** from the edit buffer's sound dump, its checksum the data's 7-bit sum
  or 7F, which the specification says is always accepted;
- takes the instrument's Device ID from its `deviceId` variable (0 unless set otherwise), for what it
  sends and for matching what comes back;
- for the Microwave of 1989 and the Wave, whose documents type the sound dump out byte by byte, has
  every byte that sets the sound, sent as the instrument's own parameter edit (the parameter in two
  nibbles, a 7-bit checksum) to instrument 1, and **reads the sound playing back (Pull)**;
- for the micro Q, Rocket and Streichfett, whose manuals print a controller chart and no SysEx format,
  has every controller that sets the sound as a control change, its values as the chart names them,
  without Pull; the wheels, pedals and channel mode messages are left out;
- for the Pulse, whose manual prints its controller assignments and its program dump byte by byte,
  has every controller as a control change and **reads a stored program back (Pull)** by its number,
  the `program` variable: the Pulse has no request for the sound it is playing, so nothing is read on
  connect.

### Elektron profiles

Elektron prints, at the end of each manual, an appendix of the CC and NRPN numbers its parameters
answer to: a table for each page of parameters, a row a parameter. [`tools/profiles/elektron/`](../tools/profiles/elektron/README.md)
reads it from the PDF's word positions. An Elektron profile:

- has every row of the appendix, sent on the CC it prints, as a 14-bit pair where it prints a CC LSB
  too, or on its NRPN where it prints no CC (the Analog Four's, two thirds of them);
- sends a track's parameters on the `channel` variable, and the effects, performance macros, CV
  track and MIDI tracks' CC values on the channels the instrument's MIDI settings give them
  (`fxChannel`, `perfChannel`, `cvChannel`, `midiChannel`), each a variable to set; the Octatrack's
  MIDI mode on its auto channel, and the Tonverk's bus, FX send and mix tracks on theirs;
- takes each value as the controller carries it, 0 - 127 (0 - 16383 for a pair): the appendices print
  no ranges, so a setting chosen from a list is a number, except the Analog Heat's, whose appendix
  names the values, and the Octatrack's mutes, solos and arms, which it prints as bands;
- describes the Analog Rytm's eight synth parameters by what each machine makes of them;
- reads nothing back: Elektron publishes no SysEx format for a sound.

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
  RD-88EX and RD-08; Korg's KingKORG and KingKORG NEO. CEditor cannot warn when the wrong one of a
  pair is chosen.
- **The startup read stops at the first request that is not answered.** That is why a workstation's
  optional blocks are read on request, and why a synth set to a different device ID will appear to
  answer nothing after the identity request.
- **The library is large.** The profiles total about 310 MB, the largest workstation profiles about
  9 MB each, and the program parses every one when it first needs a profile. How long that takes on
  a typical Windows machine has not been measured.
- **Yamaha's Pull assumes device number 1.** Parameter changes follow the `deviceId` variable, but
  the dump requests and the dumps they answer with are written for device number 1. An instrument set
  to another number ignores Pull whatever the variable says.
- **Yamaha's effect settings, bit switches and drum key voices are not in the profiles.** About
  7,000 effect parameters and EQ frequencies (each means what another setting selects), 1,250
  settings packed a bit each into one byte, and 360 drum key voice selections (three values in one
  message) are left out, each listed in its profile's notes. The tools' README tallies them, with
  what would read each.
- **The MODX and MONTAGE profiles are the Performance and Part 1.** Parts 2 to 16 are the same
  settings at their own addresses and are not laid out; on the MODX M and MONTAGE M, an AWM2 part's
  first 8 elements of 128.
- **Waldorf profiles edit one instrument.** In Multi mode, the Blofeld's and Microwave II/XT's
  parameter changes reach instrument 1's sound; the Wave's and the 1989 Microwave's go to instrument
  1 too. The other instruments are not laid out.
- **The 1989 Microwave is read in Single mode.** It answers Pull with the sound playing, which in
  Multi mode is the last instrument selected; its document says to switch to Single (MIDI-Poly) mode
  first.
- **The Pulse is pulled by program number.** It has no request for the sound it is playing, so Pull
  reads the stored program the `program` variable names (0 for P.1), and nothing is read when it
  connects. A program dump sent from the Pulse's panel is read as it arrives, edits and all.
- **The micro Q, Rocket and Streichfett are not read back.** Their manuals print controllers only,
  so a panel follows them through the controllers they send, not through Pull.
- **Elektron profiles edit one track at a time, in raw values.** A track's parameters go on the
  `channel` variable (track 1's channel, or the AUTO channel for the active track); the FX,
  performance, CV and MIDI track channels are variables whose defaults the manuals do not print, so
  they are placeholders to set. Values are 0 - 127 (0 - 16383 for a fine knob): what they show, and a
  list setting's values, are in the manual's chapters, not in the profile.
- **A 14-bit knob is followed from its coarse half.** A knob sent as two controllers (the Moog
  profiles' MSB and LSB) moves its control when either arrives: the coarse half on its own, the fine
  half together with the value the control already has. A fine half that arrives before any coarse
  one is ignored, so an instrument that sends only the fine half of a knob is not followed.
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
findings in [`tools/profiles/sequential/README.md`](../tools/profiles/sequential/README.md); each other
brand's folder has its own README beside its tools (`korg/`, `novation/`, `moog/`, `yamaha/`,
`waldorf/`, `elektron/`). They list what is still to read and why: tables that read with problems, scanned manuals
with no text, and instruments for which no MIDI list was found.

## Catalogue

Written by `node tools/profiles/catalogue.mjs` from the profiles in `CE/profiles/test` (the
internal test profiles are left out). "Made by" is the generator named in the profile's first
authoring note.

<!-- catalogue:start (generated by tools/profiles/catalogue.mjs; do not edit by hand) -->

193 profiles, 431,982 parameters between them; none yet checked on a real instrument.

### Dave Smith Instruments (5)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `sequential-mopho` | DSI Mopho | Mopho | NRPN | 117 | Mopho Manual (version 1.2) | `sequential/make-profiles.mjs` |
| `sequential-mopho-keyboard` | DSI Mopho Keyboard | Mopho | NRPN | 126 | Mopho Keyboard Manual (version 1.1) | `sequential/make-profiles.mjs` |
| `sequential-mopho-x4` | DSI Mopho x4 | Mopho | NRPN | 127 | Mopho x4 Operation Manual (version 1.0) | `sequential/make-profiles.mjs` |
| `sequential-prophet-08` | DSI Prophet '08 | Prophet | NRPN | 350 | Prophet '08 Manual (version 1.3) | `sequential/make-profiles.mjs` |
| `sequential-tetra` | DSI Tetra | Tetra | NRPN | 370 | Tetra Manual (version 1.3) | `sequential/make-profiles.mjs` |

### Elektron (19)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `elektron-analog-four` | Elektron Analog Four | Analog Four | CC, NRPN | 228 | Analog Four User Manual, OS 1.56 | `elektron/make-profiles.mjs` |
| `elektron-analog-four-mkii` | Elektron Analog Four MKII | Analog Four | CC, NRPN | 227 | Analog Four MKII User Manual, OS 1.56 | `elektron/make-profiles.mjs` |
| `elektron-analog-keys` | Elektron Analog Keys | Analog Four | CC, NRPN | 227 | Analog Keys User Manual, OS 1.56 | `elektron/make-profiles.mjs` |
| `elektron-analog-heat` | Elektron Analog Heat | Analog Heat | Control changes | 42 | Analog Heat User Manual, OS 1.21C | `elektron/make-profiles.mjs` |
| `elektron-analog-heat-fx` | Elektron Analog Heat +FX | Analog Heat | Control changes | 109 | Analog Heat +FX User Manual, OS 1.01 | `elektron/make-profiles.mjs` |
| `elektron-analog-heat-mkii` | Elektron Analog Heat MKII | Analog Heat | Control changes | 42 | Analog Heat MKII User Manual, OS 1.21C | `elektron/make-profiles.mjs` |
| `elektron-analog-rytm` | Elektron Analog Rytm | Analog Rytm | Control changes | 99 | Analog Rytm User Manual, OS 1.74 | `elektron/make-profiles.mjs` |
| `elektron-analog-rytm-mkii` | Elektron Analog Rytm MKII | Analog Rytm | Control changes | 99 | Analog Rytm MKII User Manual, OS 1.74 | `elektron/make-profiles.mjs` |
| `elektron-digitakt` | Elektron Digitakt | Digitakt | Control changes | 95 | Digitakt User Manual, OS 1.54 | `elektron/make-profiles.mjs` |
| `elektron-digitakt-ii` | Elektron Digitakt II | Digitakt | CC, NRPN | 137 | Digitakt II User Manual, OS 1.17 | `elektron/make-profiles.mjs` |
| `elektron-digitone` | Elektron Digitone | Digitone | CC, NRPN | 118 | Digitone User Manual, OS 1.44 | `elektron/make-profiles.mjs` |
| `elektron-digitone-ii` | Elektron Digitone II | Digitone | CC, NRPN | 162 | Digitone II User Manual, OS 1.12 | `elektron/make-profiles.mjs` |
| `elektron-digitone-keys` | Elektron Digitone Keys | Digitone | CC, NRPN | 118 | Digitone Keys User Manual, OS 1.44 | `elektron/make-profiles.mjs` |
| `elektron-model-cycles` | Elektron Model:Cycles | Model | Control changes | 24 | Model:Cycles User Manual, OS 1.13 | `elektron/make-profiles.mjs` |
| `elektron-model-samples` | Elektron Model:Samples | Model | Control changes | 24 | Model:Samples User Manual, OS 1.13 | `elektron/make-profiles.mjs` |
| `elektron-octatrack` | Elektron Octatrack | Octatrack | Control changes | 113 | Octatrack User Manual, OS 1.40A | `elektron/make-profiles.mjs` |
| `elektron-octatrack-mkii` | Elektron Octatrack MKII | Octatrack | Control changes | 113 | Octatrack MKII User Manual, OS 1.40C | `elektron/make-profiles.mjs` |
| `elektron-syntakt` | Elektron Syntakt | Syntakt | Control changes | 105 | Syntakt User Manual, OS 1.42 | `elektron/make-profiles.mjs` |
| `elektron-tonverk` | Elektron Tonverk | Tonverk | CC, NRPN | 229 | Tonverk User Manual, OS 1.4.1 | `elektron/make-profiles.mjs` |

### Generic (1)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `generic-cc-dpd` | Generic MIDI CC (from DPD) | — | Control changes | 10 | — | Device Profile Designer |

### Korg (20)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `korg-kingkorg` | Korg KingKORG | KingKORG | SysEx parameters | 210 | KingKORG MIDI Implementation (Revision 1.00, 2013.01.15) | `korg/make-profiles.mjs` |
| `korg-kingkorg-neo` | Korg KingKORG NEO | KingKORG | SysEx parameters | 210 | KingKORG NEO MIDI Implementation (Revision 1.00, 2022.09.09) | `korg/make-profiles.mjs` |
| `korg-minilogue` | Korg minilogue | logue | Control changes | 39 | minilogue MIDI Implementation (Revision 1.10, 2016.07.10) | `korg/make-profiles.mjs` |
| `korg-minilogue-xd` | Korg minilogue xd | logue | CC, NRPN | 101 | minilogue xd MIDI Implementation (Revision 1.01, 2020.2.10) | `korg/make-profiles.mjs` |
| `korg-monologue` | Korg monologue | logue | Control changes | 24 | monologue MIDI Implementation (Revision 1.00, 2019.02.19) | `korg/make-profiles.mjs` |
| `korg-prologue` | Korg prologue | logue | Control changes | 57 | prologue MIDI Implementation (Revision 1.01, 2020.2.10) | `korg/make-profiles.mjs` |
| `korg-microkorg` | Korg microKORG | microKORG | CC, NRPN | 77 | micro KORG MIDI Implementation (Revision 1.4, 2002.06.27) | `korg/make-profiles.mjs` |
| `korg-microkorg-s` | Korg microKORG S | microKORG | SysEx parameters | 205 | microKORG S MIDI Implementation (Revision 1.01, 2026.06.22) | `korg/make-profiles.mjs` |
| `korg-microkorg2` | Korg microKORG2 | microKORG | CC, NRPN | 180 | microKORG 2 MIDI Implementation (Revision 1.0, 2024.05.10) | `korg/make-profiles.mjs` |
| `korg-minikorg-700sm` | Korg miniKORG 700Sm | miniKORG | Control changes | 29 | miniKORG 700Sm MIDI Implementation (Revision 1.00, 2024.10.07) | `korg/make-profiles.mjs` |
| `korg-nts-1` | Korg NTS-1 | NTS | Control changes | 29 | NTS-1 digital kit MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-nts-1-mk2` | Korg NTS-1 mkII | NTS | CC, NRPN | 62 | NTS-1 digital kit mkII MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-ps-3300` | Korg PS-3300 | PS | CC, NRPN | 142 | PS-3300 MIDI Implementation (Revision 1.00, 2026.06.18) | `korg/make-profiles.mjs` |
| `korg-volca-bass` | Korg volca bass | volca | Control changes | 12 | volca bass MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-beats` | Korg volca beats | volca | Control changes | 20 | volca beats MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-fm2` | Korg volca fm2 | volca | Control changes | 13 | volca fm2 MIDI Implementation (Revision 1.00, 2022.11.17) | `korg/make-profiles.mjs` |
| `korg-volca-keys` | Korg volca keys | volca | Control changes | 16 | volca keys MIDI Implementation (Revision 0.01, 2013.06.23) | `korg/make-profiles.mjs` |
| `korg-volca-kick` | Korg volca kick | volca | Control changes | 10 | volca kick MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-volca-nubass` | Korg volca nubass | volca | Control changes | 11 | volca nubass MIDI Implementation | `korg/make-profiles.mjs` |
| `korg-vox-continental` | VOX Continental | VOX | Control changes | 18 | VOX Continental MIDI Implementation (Revision 1.00, 2018.02.07) | `korg/make-profiles.mjs` |

### Moog (14)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `moog-claravox-centennial` | Moog Claravox Centennial | Claravox | CC, NRPN | 49 | Claravox Centennial User Guide | `moog/make-profiles.mjs` |
| `moog-grandmother` | Moog Grandmother | Grandmother | Control changes | 22 | Grandmother Manual, Version 2 | `moog/make-profiles.mjs` |
| `moog-matriarch` | Moog Matriarch | Matriarch | SysEx parameters and dumps | 110 | Matriarch Manual (01/2023) | `moog/make-profiles.mjs` |
| `moog-messenger` | Moog Messenger | Messenger | Control changes | 55 | Messenger User Manual (2025-06-18) | `moog/make-profiles.mjs` |
| `moog-minitaur` | Moog Minitaur | Minitaur | Control changes | 36 | Minitaur Manual (with the Firmware v2.1 Addendum) | `moog/make-profiles.mjs` |
| `moog-muse` | Moog Muse | Muse | Control changes | 102 | Muse Manual 1.4.0 | `moog/make-profiles.mjs` |
| `moog-little-phatty` | Moog Little Phatty | Phatty | Control changes | 51 | LP Stage II User's Manual | `moog/make-profiles.mjs` |
| `moog-slim-phatty` | Moog Slim Phatty | Phatty | Control changes | 51 | Slim Phatty User's Manual | `moog/make-profiles.mjs` |
| `moog-sirin` | Moog Sirin | Sirin | Control changes | 36 | Sirin User Manual v2.1 | `moog/make-profiles.mjs` |
| `moog-sub-37` | Moog Sub 37 | Sub | CC, NRPN | 164 | Sub 37 Manual v1.1 | `moog/make-profiles.mjs` |
| `moog-subharmonicon` | Moog Subharmonicon | Subharmonicon | Control changes | 11 | Subharmonicon Manual | `moog/make-profiles.mjs` |
| `moog-subsequent-25` | Moog Subsequent 25 | Subsequent | Control changes | 73 | Subsequent 25 Manual | `moog/make-profiles.mjs` |
| `moog-subsequent-37` | Moog Subsequent 37 | Subsequent | CC, NRPN | 164 | Subsequent 37 Manual | `moog/make-profiles.mjs` |
| `moog-taurus-3` | Moog Taurus 3 | Taurus | Control changes | 29 | Taurus 3 User's Manual | `moog/make-profiles.mjs` |

### Novation (9)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `novation-bass-station-ii` | Novation Bass Station II | Bass Station | Control changes | 27 | Bass Station II User Guide v5 | `novation/make-profiles.mjs` |
| `novation-circuit-mono-station` | Novation Circuit Mono Station | Circuit | Control changes | 73 | Circuit Mono Station MIDI Parameters v1 | `novation/make-profiles.mjs` |
| `novation-circuit-rhythm` | Novation Circuit Rhythm | Circuit | CC, NRPN | 231 | Circuit Rhythm Programmer's Reference Guide v5.2 | `novation/make-profiles.mjs` |
| `novation-circuit-tracks` | Novation Circuit Tracks | Circuit | CC, NRPN | 618 | Circuit Tracks Programmer's Reference Guide v3 | `novation/make-profiles.mjs` |
| `novation-mininova` | Novation MiniNova | Nova | CC, NRPN | 374 | MiniNova Extended CC & NRPN Map, Version 0002 | `novation/make-profiles.mjs` |
| `novation-peak` | Novation Peak | Peak | CC, NRPN | 246 | Peak User Guide 1.2 | `novation/make-profiles.mjs` |
| `novation-summit` | Novation Summit | Peak | CC, NRPN | 184 | Summit User Guide 1.1 | `novation/make-profiles.mjs` |
| `novation-k-station` | Novation K-Station | Station | CC, NRPN | 130 | K-Station User Manual | `novation/make-profiles.mjs` |
| `novation-ks-series` | Novation KS series | Station | CC, NRPN | 162 | KS Series User Manual | `novation/make-profiles.mjs` |

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

### Waldorf (8)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `waldorf-blofeld` | Waldorf Blofeld | Blofeld | SysEx parameters and dumps | 258 | Blofeld System Exclusive Specifications, software release 1.04 | `waldorf/make-profiles.mjs` |
| `waldorf-microwave` | Waldorf Microwave | Microwave | SysEx parameters and dumps | 151 | Waldorf Microwave System Exclusive Documentation, system software version 2.00 revision 00 (1 March 1994) | `waldorf/make-profiles.mjs` |
| `waldorf-microwave-2` | Waldorf Microwave II/XT | Microwave | SysEx parameters and dumps | 203 | Microwave 2 System Exclusive Specifications, software release 2.16 | `waldorf/make-profiles.mjs` |
| `waldorf-pulse` | Waldorf Pulse | Pulse | Control changes | 68 | User’s Manual Pulse • PulsePlus, version 2.0 | `waldorf/make-profiles.mjs` |
| `waldorf-microq` | Waldorf micro Q | Q | Control changes | 103 | microQ Omega/lite/Keyboard User’s Manual | `waldorf/make-profiles.mjs` |
| `waldorf-rocket` | Waldorf Rocket | Rocket | Control changes | 19 | Rocket User’s Manual | `waldorf/make-profiles.mjs` |
| `waldorf-streichfett` | Waldorf Streichfett | Streichfett | Control changes | 17 | Streichfett Reference Manual | `waldorf/make-profiles.mjs` |
| `waldorf-wave` | Waldorf Wave | Wave | SysEx parameters and dumps | 225 | Waldorf Wave System Exclusive Description, operating system version 1.400 (21 September 1993) | `waldorf/make-profiles.mjs` |

### Yamaha (30)

| Profile | Instrument | Family | Talks in | Parameters | Read from | Made by |
|---|---|---|---|---:|---|---|
| `yamaha-an1x-dpd` | Yamaha AN1x (from DPD) | AN | SysEx parameters and dumps | 1,296 | — | Device Profile Designer |
| `yamaha-cp1` | Yamaha CP1 | CP | SysEx parameters and dumps | 120 | CP1 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-cp4-stage` | Yamaha CP4 STAGE | CP | SysEx parameters and dumps | 274 | CP4 STAGE/CP40 STAGE Data List (A0) | `yamaha/make-profiles.mjs` |
| `yamaha-cp40-stage` | Yamaha CP40 STAGE | CP | SysEx parameters and dumps | 274 | CP4 STAGE/CP40 STAGE Data List (A0) | `yamaha/make-profiles.mjs` |
| `yamaha-cp5` | Yamaha CP5 | CP | SysEx parameters and dumps | 299 | CP5/CP50 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-cp50` | Yamaha CP50 | CP | SysEx parameters and dumps | 200 | CP5/CP50 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-cp88-cp73` | Yamaha CP88/CP73 | CP | SysEx parameters and dumps | 268 | CP88/CP73 Supplementary Manual V2.00 (H0) | `yamaha/make-profiles.mjs` |
| `yamaha-mo` | Yamaha MO6/MO8 | MO | SysEx parameters and dumps | 3,143 | MO6/MO8 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-modx` | Yamaha MODX | MODX | SysEx parameters and dumps | 4,527 | MODX6/MODX7/MODX8 Data List (D0) | `yamaha/make-profiles.mjs` |
| `yamaha-modx-m` | Yamaha MODX M | MODX | SysEx parameters and dumps | 6,776 | MODX M6/MODX M7/MODX M8 Data List (B0) | `yamaha/make-profiles.mjs` |
| `yamaha-modx-plus` | Yamaha MODX+ | MODX | SysEx parameters and dumps | 4,527 | MODX6+/MODX7+/MODX8+ Data List (A0) | `yamaha/make-profiles.mjs` |
| `yamaha-montage` | Yamaha MONTAGE | MONTAGE | SysEx parameters and dumps | 4,530 | MONTAGE6/MONTAGE7/MONTAGE8 Data List (J0) | `yamaha/make-profiles.mjs` |
| `yamaha-montage-m` | Yamaha MONTAGE M | MONTAGE | SysEx parameters and dumps | 6,783 | MONTAGE M6/MONTAGE M7/MONTAGE M8x Data List (H0) | `yamaha/make-profiles.mjs` |
| `yamaha-motif` | Yamaha MOTIF | MOTIF | SysEx parameters and dumps | 4,910 | MOTIF6/MOTIF7/MOTIF8 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-motif-es` | Yamaha MOTIF ES | MOTIF | SysEx parameters and dumps | 4,183 | MOTIF ES6/MOTIF ES7/MOTIF ES8 Data List | `yamaha/make-profiles.mjs` |
| `yamaha-motif-xf` | Yamaha MOTIF XF | MOTIF | SysEx parameters and dumps | 5,309 | MOTIF XF6/MOTIF XF7/MOTIF XF8 Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-motif-xs` | Yamaha MOTIF XS | MOTIF | SysEx parameters and dumps | 5,274 | MOTIF XS6/MOTIF XS7/MOTIF XS8 Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-motif-rack-es` | Yamaha MOTIF-RACK ES | MOTIF | SysEx parameters and dumps | 3,971 | MOTIF-RACK ES Owner’s Manual | `yamaha/make-profiles.mjs` |
| `yamaha-motif-rack-xs` | Yamaha MOTIF-RACK XS | MOTIF | SysEx parameters and dumps | 4,819 | MOTIF-RACK XS Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-s90-es` | Yamaha S90 ES | MOTIF | SysEx parameters and dumps | 4,207 | S90 ES Data List | `yamaha/make-profiles.mjs` |
| `yamaha-mox` | Yamaha MOX | MOX | SysEx parameters and dumps | 5,227 | MOX6/MOX8 Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-moxf` | Yamaha MOXF | MOXF | SysEx parameters and dumps | 5,317 | MOXF6/MOXF8 Data List (A0) | `yamaha/make-profiles.mjs` |
| `yamaha-mx` | Yamaha MX49/MX61/MX88 | MX | SysEx parameters and dumps | 3,880 | MX49/MX61/MX88 Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-reface-cp` | Yamaha reface CP | reface | SysEx parameters and dumps | 22 | reface Data List (B0) | `yamaha/make-profiles.mjs` |
| `yamaha-reface-cs` | Yamaha reface CS | reface | SysEx parameters and dumps | 30 | reface Data List (B0) | `yamaha/make-profiles.mjs` |
| `yamaha-reface-dx` | Yamaha reface DX | reface | SysEx parameters and dumps | 135 | reface Data List (B0) | `yamaha/make-profiles.mjs` |
| `yamaha-reface-yc` | Yamaha reface YC | reface | SysEx parameters and dumps | 27 | reface Data List (B0) | `yamaha/make-profiles.mjs` |
| `yamaha-s90xs` | Yamaha S90 XS/S70 XS | S XS | SysEx parameters and dumps | 4,922 | S90 XS/S70 XS Data List (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-yc61` | Yamaha YC61 | YC | SysEx parameters and dumps | 263 | YC61 Owner's Manual (C0) | `yamaha/make-profiles.mjs` |
| `yamaha-yc88-yc73` | Yamaha YC88/YC73 | YC | SysEx parameters and dumps | 264 | YC88/YC73 Owner's Manual (B0) | `yamaha/make-profiles.mjs` |

<!-- catalogue:end -->
