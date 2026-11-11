# Korg profiles, read from Korg's own MIDI Implementation documents

```bash
node tools/profiles/korg/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/korg/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/korg/import-korg.mjs <MIDIImp.txt> <name>   # re-read a document
node tools/profiles/korg/import-korg.mjs microKORG_MIDIimp.TXT microkorg microKORG_OM_E2.pdf   # + its Owner's Manual (pdftotext)
cd CE/web && node --test test/korgProfiles.test.js
```

The rules every profile here follows are in [../README.md](../README.md); what the library as a whole
holds is [docs/device-profile-library.md](../../../docs/device-profile-library.md).

Korg publishes a **MIDI Implementation as a plain-text file** beside each instrument's manual, on its
support download page, and has written them the same way for twenty years: boxed ASCII tables, a
heading above each, and footnotes after. The control changes an instrument recognises are table
2-1, the ones it sends 1-1, its NRPNs a table under `*3`, and what a value means is in a footnote
(`*6-01 : vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH`) or a numbered list (`*note P6`).

| Step | File | What it does |
|---|---|---|
| 1 | `read-korg-text.mjs` | The text → its tables (with the rows that continue a row above) and its footnotes: marks with text, lists of values under a mark or a note. Decides nothing. |
| 2 | `import-korg.mjs` | Writes `tables/<name>.json`: the received and transmitted control changes, the NRPN table, the Device Inquiry reply, and every footnote and list, as printed, with the file's name, SHA-256 and download page. **This is what is committed. The text file is Korg's copyright and is not.** |
| 3 | `synths/<name>.mjs` | The layout: the document, groups, corrections with their reasons, what to leave out. |
| 4 | `build-korg-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |
| 5 | `build-korg-dump.mjs` | Pull: the program table → the dump request, the dump definition and its field mappings, and a packed test dump (see [Pull](#pull)). |
| — | `read-korg-om-cc.mjs`, `build-korg-knobs.mjs` | The microKORG (2002) only: its Owner's Manual page of knob control changes, and those knobs as parameters (see [The Owner's Manual's knobs](#the-owners-manuals-knobs-microkorg-2002)). |

What the builder takes as settled, and what it does not:

- **A controller is a choice only where the document names its values.** The receive footnote gives
  each name a range; the transmit footnote, the value the instrument sends for it. The value a
  profile sends is the one the instrument itself sends, and only when it falls in the receive
  table's range for the same name. Where the two tables disagree, the controller stays a number and
  its description quotes both. Where the instrument sends nothing for it, the lower bound of the
  receive range is sent. A list that depends on another setting ("When MOD FX TYPE is CHORUS") is a
  number with the list in its description.
- **Every NRPN with a printed range is a parameter**, its value on CC 6. A value wider than 7 bits goes
  as the document prints the format: its low 3 bits first on CC 63, then the rest on CC 6. Both
  engines learned that format for these profiles (`lowBitsController`, `lowBits` on the recipe).
  CEditor sends it; it does not yet put the two halves together when the instrument sends them.
- **Preset recall** comes from the document's own Bank Select and Program Change lines.
- **Plumbing is not a parameter**: Bank Select, Data Entry, the NRPN and RPN selectors, Korg's
  `LSB VALUE` and the channel mode messages, recognised by the name the document prints for them.

## The profiles

| Profile | Read from | Parameters | Choices | Presets | Identity |
|---|---|---:|---:|---|---|
| `korg-minilogue-xd` | minilogue xd MIDI Implementation 1.01 | 101 | 34 | 500 | 51H 01H |
| `korg-prologue` | prologue MIDI Implementation 1.01 (prologue-8 and -16) | 57 | 19 | 500 | 4BH 01H |
| `korg-minilogue` | minilogue MIDI Implementation 1.10 | 39 | 13 | 200 | 2CH 01H |
| `korg-monologue` | monologue MIDI Implementation 1.00 | 24 | 10 | 100 | 44H 01H |
| `korg-nts-1-mk2` | NTS-1 digital kit mkII MIDI Implementation 1.00 | 62 | 7 | — | 73H 01H |
| `korg-microkorg-s` | microKORG S MIDI Implementation 1.01 | 205 | 78 | 128 | 40H 01H |
| `korg-kingkorg` | KingKORG MIDI Implementation 1.00 | 210 | 60 | — | 18H 01H |
| `korg-microkorg2` | microKORG 2 MIDI Implementation 1.0 | 180 | 40 | — | 71H 01H |
| `korg-microkorg` | micro KORG MIDI Implementation 1.4, with the Owner's Manual p. 56 | 77 | 21 | — | 58H 00H |
| `korg-ps-3300` | PS-3300 MIDI Implementation 1.00 | 142 | 30 | 256 | 6EH 01H |
| `korg-nts-1` | NTS-1 digital kit MIDI Implementation 1.00 | 29 | 8 | — | 57H 01H |
| `korg-vox-continental` | VOX Continental MIDI Implementation 1.00 (Continental 61 and 73) | 18 | 4 | 16 | — |
| `korg-kingkorg-neo` | KingKORG NEO MIDI Implementation 1.00 (same tables, same product ID) | 210 | 60 | — | 18H 01H |
| `korg-minikorg-700sm` | miniKORG 700Sm MIDI Implementation 1.00 | 29 | 15 | 14 | 62H 01H |
| `korg-volca-fm2` | volca fm2 MIDI Implementation 1.00 | 13 | 2 | — | 2FH 01H |
| `korg-volca-keys` | volca keys MIDI Implementation 0.01 | 16 | 2 | — | — |
| `korg-volca-bass` | volca bass MIDI Implementation 0.01 | 12 | 1 | — | — |
| `korg-volca-beats` | volca beats MIDI Implementation 0.01 | 20 | 0 | — | — |
| `korg-volca-kick` | volca kick MIDI Implementation 1.00 | 10 | 0 | — | — |
| `korg-volca-nubass` | volca nubass MIDI Implementation 1.00 | 11 | 0 | — | — |
| `korg-kronos` | KRONOS MIDI Implementation archive (2025-07-24): `Prog_HD-1.txt` 1.01, `KRONOS_MIDI_SysEx.txt` 1.27, `Effect.txt` | 2,862 | 392 | 3,968 | 68H 00H |
| `korg-kronos-exi` | the KRONOS archive: `Prog_EXi_Common.txt` 1.01, `Prog_EXi.txt`, `Effect.txt` | 9,205 | 819 | 3,968 | 68H 00H |
| `korg-kronos-combination` | the KRONOS archive: `CombiAndSongTimbreSet.txt` 1.01, `Effect.txt` | 7,181 | 2,155 | 1,792 | 68H 00H |
| `korg-kronos-global` | the KRONOS archive: `Global.txt` 1.01 | 481 | 24 | — | 68H 00H |
| `korg-kronos-wave-sequence` | the KRONOS archive: `WaveSequence.txt` | 975 | 132 | — | 68H 00H |
| `korg-kronos-drum-kit` | the KRONOS archive: `DrumKit.txt` | 20,352 | 2,560 | — | 68H 00H |
| `korg-nautilus` | NAUTILUS MIDI Implementation archive (2022-09-22): `SysExDumps/Prog_HD-1.txt`, `NAUTILUS_MIDI_SysEx.txt` 1.0, `Effect.txt` | 5,540 | 3,499 | 3,968 | 00H 01H 5DH 00H |
| `korg-nautilus-exi` | the NAUTILUS archive: `Prog_EXi_Common.txt`, `Prog_EXi.txt`, `Effect.txt` | 11,883 | 4,025 | 3,968 | 00H 01H 5DH 00H |
| `korg-nautilus-combination` | the NAUTILUS archive: `CombiAndSongTimbreSet.txt`, `Effect.txt` | 7,039 | 4,184 | 1,792 | 00H 01H 5DH 00H |
| `korg-nautilus-global` | the NAUTILUS archive: `Global.txt` | 599 | 24 | — | 00H 01H 5DH 00H |
| `korg-nautilus-wave-sequence` | the NAUTILUS archive: `WaveSequence.txt` | 975 | 132 | — | 00H 01H 5DH 00H |
| `korg-nautilus-drum-kit` | the NAUTILUS archive: `DrumKit.txt` | 20,352 | 2,560 | — | 00H 01H 5DH 00H |

The first volcas have no MIDI Out, so they cannot answer a Device Inquiry and their profiles do not
try to recognise them. The VOX Continental prints its reply inline with two member codes, 05 for the
61 and 0E for the 73; one profile serves both and does not check. Its footnotes are numbered afresh
under each table (`*1` is Slow/Fast under the transmit table, OFF/ON under the receive one) and give
values in hex (`*1 00:OFF, 7F:ON`): the importer keeps the receive table's, and a list of hex values
and names is a choice.

## Three units on one NRPN table (PS-3300)

The PS-3300 is three PSU-3301 synthesizer units under a PSU-3302. In single channel mode the
PSU-3302's switches and levels are control changes, and a unit's settings are NRPNs whose MSB picks
the unit (`*2`: `vv : 0~2 = PSU-3301 RIGHT, PSU-3301 CENTER, PSU-3301 LEFT`) and whose LSB, from a
table printing the LSB alone (`*3`, in sections headed `<<< SIGNAL GENERATORS >>>`), the setting:
43 settings, so 129 NRPN parameters, named `PSU-3301 LEFT : SIGNAL GENERATORS : PWM INTENSITY`. A
footnote prints both directions at once (`*3-1 : WAVE FORM / TRANSMIT 0,25,51,… = TRI, SAW, … /
RECEIVE 0~21,22~42,… = TRI, SAW, …`), a choice when each value sent falls in its name's range.

Its program dump places one table three times: TABLE 1 puts `PSU-3301 RIGHT PARAMTER  TABLE 2` at
64~255, CENTER at 256~447 and LEFT at 448~639, so the importer keeps the tables a program table
places, and Pull reads TABLE 2's fields at each block, named for it. Every 10-bit level (L then H) is
read as the top seven bits, as its controller or NRPN sends it; 141 of 142 parameters are read back.

## SysEx parameter change (microKORG S)

The microKORG S keeps every setting of its program, its two timbres and its vocoder in SysEx: one
PARAMETER CHANGE message per setting, `F0 42 3g 00 01 40 41 pp PP vv VV F7` (NOTE 5), the Param ID
and the value 14 bits each, low seven first. `build-korg-sysex.mjs` reads the tables that give each
setting its Param ID (TABLE 1 for the program, TABLE 2 for a timbre with one ID column per timbre,
TABLE 3 for the vocoder), with the section rows that head their parts:

- a VALUE of `0~127` is a number; `0,1,2=Mono,Poly,Unison` and `0~3=24LPF,12LPF,12BPF,12HPF` are
  choices; `0~7=Saw~Audio In *T-2` is a choice from the list *T-2, which the document prints in
  columns;
- a value printed `64+/-50=0+/-50[cent]` is stored as 64 +/- 50, and NOTE 5 calls the message's value
  "signed", so it is sent as the signed value, -50 as two's complement over 14 bits (`4E 7F`). Both
  engines learned that encoding (`s14-lsb-msb`) for these profiles. This is a reading of NOTE 5, not
  something tried on an instrument;
- left out and said: the program name and the trigger pattern (a run of IDs for the bits of one
  setting), Vel.Sense (`64=0`), and the vocoder's odd channels, printed `= CH LEVEL [0]` (they follow
  the even ones).

Its NRPNs reach settings the parameter change reaches in full, in an older notation, and are left
out. No Pull yet: its program dump is printed differently from the logue family's.

## SysEx parameter change with an ID and a sub-ID (KingKORG, KingKORG NEO)

The KingKORG's message is `F0 42 3g 00 01 18 41 pp PP qq QQ vvl vvm vvh F7` (NOTE 4): an ID and a
sub-ID of 14 bits and a value of 21, each low seven bits first, the value again called signed and
sent here as two's complement (-48 as `50 7F 7F`; both engines learned `s21-lsb-msb`).
`build-korg-sysex-id.mjs` follows its tables' nesting: TABLE 1 gives each block an ID
(`TIMBRE A DATA ... (TABLE 2) | 02:00~`), a row inside is relative to it (`+0:04`), and a block
inside that makes both relative (`OSC 2 DATA (TABLE 7) | +0:11~15`, then `+0:+1`); `same as V.PATCH
1` reuses the block above's table. Its values print `:` where the microKORG S prints `=`. A list
makes a choice only up to 32 names; longer ones are readouts (`0.01~100[kHz]`) and go in the
description. Left out and said: the program name, the oscillators' CTRL1 and CTRL2 (their range
depends on the oscillator type), and the vocoder's formant-hold bands printed `same as Band1`.
The KingKORG NEO's document has the same tables and the same product ID, and the two answer with the
same identity.

## Hex notation (microKORG2)

The microKORG2 lists its panel's control changes as a footnote table (`*3 : Parameter Edit`) and its
NRPNs in another (`*4`), every value in hex with what it means after a colon: `00~7F:0~127`,
`00,01:Off,On`, `00~3F/40~7F:Fingered/Always`, `00~7F:Saw~OneShot *3-1` with the list
`00~15 : Saw  16~2A : Square …`. `build-korg-hex.mjs` reads that notation: a name per range is a
choice sending the first value of its range; a value printed over two bytes (`7F 41~7F,00 00,00
01~3F:-63~0~63`) is 14 bits on CC 6 and 38, two's complement below zero, so -63 goes out `7F 41`
as the document prints it. Its footnotes are printed side by side, two or three to a line
(`*3-1 : 00~15 : Saw      *3-2 : 00~1F : LPF`); the reader takes them apart by column. Left out:
Vocoder E.F.Sens (`00~7E,7F:0~126,Hold`).

The same reader serves the microKORG (2002)'s NRPNs, which print the older forms of the notation: a
cell that is only a mark (`*2-1`, whose footnote is `00~15 : Up  16~2A : Down …`), a centred value
(`00,01~40~7F = L63,L63~CNT~R63`: 1~127 shown as -63~+63, 00 the same as 01, a `bipolar` parameter),
and a footnote that tabulates every value (`00~07 :  0,  0,  1, …`), a number whose first, middle and
last the description gives. After a `(Synth Mode /Vocoder Mode )` row each row prints the two modes
apart at a `/` (`Patch1 Source/Fc Mod Source | *2-3 / *2-3`, `/BAND[1] LEVEL | / 00~7F:0~127`): one
parameter where both read it alike, a `Vocoder …` one where only the vocoder has it.

## The Owner's Manual's knobs (microKORG (2002))

The microKORG's MIDI Implementation names its 41 panel knobs and switches (`*3 :Panel Knob & Switch
Control (assignable)`), each in its section and with what it means in a synth and a vocoder program,
and prints no control change numbers: they are assignable, kept in GLOBAL. The ones they leave the
factory with are in the **Owner's Manual, p. 56** ("Messages transmitted and received by the
microKORG"), with the values each knob sends and takes, in decimal. `import-korg.mjs` reads that page
with `pdftotext -layout` when the layout names it (`ownersManual`), and keeps its rows in the
transcription with the PDF's name, SHA-256 and address; the PDF, like the text, is not committed.

`read-korg-om-cc.mjs` reads the page. Its headings are centred over their columns, so the columns are
where the rows start them; a value that wraps onto the line above or below its row, and the
`Synth; …` and `Vocoder; …` lines of a knob that means two things, go to the nearest row not already
whole on its own line. `build-korg-knobs.mjs` then:

- finds each of the manual's rows in the Implementation's table **by name**, not by position: the
  manual prints the filter EG before AMP and the table after it, and a first attempt that paired them
  by row put Amp Level on CC 23. The two name two knobs differently (`Filter EG Int` and `EG1 Int`,
  matched by its vocoder name; `Sync Ctrl` and `Sync Control`, by abbreviation), which the profile
  says;
- takes the values from the manual: `0...127` a number; `0 / 1: –63, …, 64: 0, …, 127: +63` centred
  on 64; a list a choice that sends what the knob itself sends (`0: Saw, 18: Square, …`), checked to
  fall in the range the manual says is received under the same name;
- makes a knob that reads alike in both modes one parameter, named as the synth calls it, and says
  the vocoder's name for it where that differs (`OSC2 Level`: Inst Level). Six (CC 18, 19, 83, 74,
  85, 10) mean something else in a vocoder program — Filter Type is Formant Shift, the synth's
  Cutoff 0~127 is the vocoder's -63~+63 — and are two parameters each, the second a `Vocoder …` one.
  Two parameters on one controller are not attributed when the instrument sends it.

No Pull: its program dump lays a program out two ways, a synth's two timbres or the vocoder, chosen by
the Voice Mode inside it, and a dump definition has one layout.

## A table per object (KRONOS, NAUTILUS)

Korg publishes the KRONOS's and the NAUTILUS's MIDI Implementations as ZIP archives of plain text
(`KRONOS_MIDIimp.zip`, 2025-07-24; `NAUTILUS_MIDIimp.zip`, 2022-09-22), not as one document: the
messages in `KRONOS_MIDI_SysEx.txt` (`NAUTILUS_MIDI_SysEx.txt`), and a table per object
(`Prog_HD-1.txt`, `Prog_EXi_Common.txt`, `CombiAndSongTimbreSet.txt`, `Global.txt`, `DrumKit.txt`,
`WaveSequence.txt`, …) giving every setting a row:

```
| OFS  | bit | parameter      | parameter | data(hex) | value     |TYP|SOC|SUB|PID|IDX|
|   92 |     | Insert Effect1 | Panpot    | 00~7F     | L000~R127 |  7|  0|  0|  6|  0|
|      | 6   | Insert Effect1 | Switch    | 00~01     | Off~On    |  6|  0|  0|  0|  0|* -> bypass, Invert Value
```

its byte in the object and its bits, its range in hex and as shown, and the bytes its parameter
change takes. `read-kronos-table.mjs` reads the tables (and `Effect.txt`, `Prog_EXi.txt`, the
keyed tables of drum kits and wave sequences); `import-kronos.mjs` keeps them, with the blocks of
the messages the profiles use, the KRONOS voice model's message format and AMS source list, the
Device Inquiry reply and the bank map, each file with its SHA-256 (the effect types once per
instrument, `tables/kronos-effects.json`); `build-kronos-profile.mjs` builds a profile per object.
Every reading below that the archive does not state is said in the profile it shapes, and the
builder checks what each rests on, stopping where the archive no longer reads that way.

**Sending.** Every row with a parameter id is a parameter, sent by Parameter Change: the exclusive
header the archive prints (`F0 42 3g 68` on the KRONOS, `F0 42 3g 00 01 5D` on the NAUTILUS), `43
TYP SOC SUB PID IDX`, and the value as 21 bits, two's complement, high byte first (`*4`; both engines
learned `s21-msb-lsb` for it); a PID above 126 in the message's second form, `7F PIDH PIDL`. A
choice goes as the low byte after `00 00`, or, past 127 (an Effect Type's 186 types), as 14 bits
after `00`. The table prints no message per row, and some groups go by a parameter change of their
own (`functions` in the layout), the profile saying per group what decides it:

- the KRONOS's KARMA rows by KARMA Parameter Change (6D), its Drum Track rows by Drum Track
  Parameter Change (6E): KARMA Common (24 of its 527 rows), KARMA Module (13 of 219) and Drum Track
  Common (11 of 11) have ids Parameter Change takes for other rows, so cannot go by it; the group
  Drum Track (22 rows) has none and goes by 6E on the message's name;
- the NAUTILUS's Scene Common by Scene Parameter Change (6D): it takes the KRONOS KARMA Common's ids
  for its own settings (Tempo PID 0, Latch Switch PID 3, the arpeggiator's switch PID 4 where KARMA
  Fx Switch is, in the program and the combination alike, which the builder checks), and KARMA
  Common goes by 6D; the scenes' arpeggiator and drum track rows and the step sequencers by
  Arp/Drum Track Parameter Change (6E), by its name;
- a drum kit by Drum Kit Parameter Change (`53 VSP note PID`), a wave sequence by Wave Seq Parameter
  Change (`55 step PID`), their fields checked against the message blocks as printed.

Every id is then unique per message, which the builder checks.

**Values.** A range whose first value is the larger is two's complement over its bytes (`9D~63` is
-99~+99). A choice: a row naming both of two values (`Off~On`); a value printed as its whole list
(`Multisample,Rest,Tie`, wrapped over two lines); or ends that are the ends of a list the archive
prints in full: the KRONOS voice model's AMS sources (`Off~Tempo`, 0~48), the EXi engines by number,
the effect types (`No Effect~Multitap`, the column cutting type 185's name at a word). The value
column is 19 characters wide; a name it cuts short keeps its cut, with an ellipsis. A switch marked
`* -> bypass, Invert Value` is sent as its effect's bypass, On as 0.

**Reading back.** Each profile asks for its object with Current Object Dump Request (74) and reads
the Current Object Dump (75) that answers, in Korg's 8-in-7 packing (`*3`), its length fixed (an EXi
program's dump is not an HD-1 program's). A field is read at its row's offset and bits. Values over
whole bytes are read low byte first, and a field that runs on into the next byte has its low bits
in the earlier one: the tables fill each byte from bit 0 upward (Bypass is bit 0 of every effect's
first byte, Wet/Dry bits 7~1 beside it) and continue a field crossing a byte upward in the next
(an EXi engine's Start Phase at bits 7~5, then 3~0), the layout of a little-endian structure; the
one exception marked, the KARMA Start Seed (`* Big Endian`), is left out.

**EXi programs** (`Prog_EXi_Common.txt`) hold two slots, each with the engine chosen for it (AL-1,
CX-3, STR-1, MS-20EX, PolysixEX, MOD-7, SGX-2, EP-1). Each engine's own settings (`Prog_EXi.txt`,
every engine's row count matching its heading's `Number Of Param.`) are in the profile once per slot,
sent by TYP 11 for EXi1 and 12 for EXi2 as the program table's own slot rows take them. They are
read back from the slot's engine block: the run of reserved bytes after the slot's own rows (EXi1
2908~3908, EXi2 3960~4959 on the KRONOS), which starts 51 bytes after the slot's Algorithm Type in
both slots, every engine's table fitting it. A setting is read only when its slot's Algorithm Type
holds its engine: both engines learned the mapping's `when` for it. The Algorithm Type has no id;
it is read and not sent. The EP-1 prints the same ids for its eight effects' settings, one meaning
per effect chosen: those are left out.

**Effects.** Each effect slot (twelve insert, two master, two total) gets a parameter per pid of
`Effect.txt` (`Insert Effect1 Parameter 5`), sent as the TYP the slot's switch row goes out with for
its bypass (`6` in a program, `23` in a combination), the slot in SOC, the pid in PID: pid 0 is
Bypass in every effect type, which the builder checks. A pid means what the slot's type makes it, so
its range is the widest any type gives it (its description names some), and it is not read back:
each type lays the slot's bytes out its own way. Effect Type is a choice of the types its printed
range reaches; the KRONOS's `Effect.txt` lists twelve more (186~197) beyond its `00~B9`.

**Combinations** (object 01): sixteen timbres (the timbre in SOC), the effects and controllers, the
KRONOS's four KARMA modules and the NAUTILUS's scenes and step sequencers. **Global** (object 03): its
forms read as printed (bits low first, a control and its attributes in one name column, a heading
wrapped over two rows, `0 ~ 5C`); the External Sets print one id per control for all 128 sets, the
set being the one Ext Mode Set Select selects, and are left out; the KRONOS's Note Receive, printed
`bit 0` for `00~02`, is sent and not read back.

**Drum kits and wave sequences** print a block once in full and then by the first and last rows of
each repeat: a drum kit's eight velocity zones (34 bytes apart) and 128 notes (300 apart), a wave
sequence's 64 steps (34 apart). The builder fills them in from the printed block (`repeats` in the
layout, `expandRepeats`), checking every printed first and last row against the stride, offset, name
and keys; the KRONOS's Note128 is printed `High DS` where the stride gives `Zone1 DS`, said in the
profile. A drum kit is 20,352 settings and 17 MB, the library's largest profile.

**Preset recall** comes from the implementation's receive table of banks when Global's Bank Map is
KORG: 31 program banks (the GM ones `factory`, read-only by `*2`) and 14 combination banks.

**Identity.** The KRONOS's reply is `F0 7E 0g 06 02 42 68 00 mm 00 …` (KRONOS and KRONOS 2 05, 0E,
17; KRONOS 3 1D, 26, 2F): the family is checked, not the member. The NAUTILUS prints 17 bytes,
`…42,00,01,5D,00,mm,00,…`, two more than the universal form; bytes 7~10 are checked as printed.

Left out, each with its reason in the profile: rows printing a fixed value, Chain Switch and Chain
To or Level (one id between them), the Tone Adjust assigns (the id depends on the value), UUIDs
(Parameter Change (binary)), ids a table prints for two unmarked rows (found by the builder), and
the RT parameters' Param.Assign (no range printed). The NAUTILUS's `ArpPattern.txt` is not built:
its object is not in the archive's object list, and no message takes its `STEP PID TONE`.

## Pull

`build-korg-dump.mjs` reads the program table (`TABLE 2 : PROGRAM PARAMETER`) into fields and asks
for the current program with CURRENT PROGRAM DATA DUMP REQUEST. The dump comes back in Korg's 8-in-7
packing (NOTE 1: each group of seven bytes behind one holding their top bits, byte k's in bit k),
which both engines unpack before reading a field. A field is read into the parameter of the same
name, through a `bitfields` codec both engines learned for these profiles:

- a whole byte, or some of its bits (the minilogue keeps VCO 1 OCTAVE in bits 4~5 of byte 52, beside
  three other settings);
- a 10-bit value in two places, named by the bits each holds (`VCO 1 PITCH (bit2~9)` at byte 20, `(bit0~1)`
  in byte 52);
- a block printed once for several copies (the prologue's `TIMBRE 1 PARAMETERS`, `+0`, `+1`, … from
  byte 80), read for the copy the layout names (`dumpBlock`);
- a table the program table places a block at a time (the PS-3300's TABLE 2, for each of its three
  units), read at every block;
- a value over two bytes marked H and L (minilogue xd, prologue, miniKORG 700Sm). The xd and prologue
  print H first, the 700Sm L first. The prologue's TEMPO settles which is which, 300~6000 printed as
  `H:0~7` then `L:0~4`, so the first byte is the low eight bits; the 700Sm, printing L first,
  agrees.

A controller parameter (0 - 127) is read as the top seven bits of a 10-bit field, the value its
controller sends; an NRPN parameter with the field's own range, as it is; a choice, by matching the
field's printed names to the choice's, value for value. Where the document names a setting
differently in the two places (the minilogue xd's dump calls MULTI SHAPE NOISE `SHAPE NOISE`), the
layout says so in `dumpNames`. Every profile carries a packed test dump both engines read back, and
korgProfiles.test.js reads a minilogue dump packed by hand from the document.

| Profile | Read back | Not read back, and why |
|---|---:|---|
| `korg-minilogue` | 38 of 39 | DELAY OUTPUT ROUTING: the dump names its values PRE FILTER and POST FILTER where the controller has PRE HPF and POST HPF |
| `korg-monologue` | 23 of 24 | EG TARGET: the dump's list prints `PICTH 2` |
| `korg-prologue` | 44 of 57 | read from TIMBRE 1, taken to be the main timbre (the document numbers its two timbres and does not name them); RING-SYNC, DELAY/REVERB TYPE, MULTI TYPE and PITCH EG, whose dump names differ (`RING ON`, `OFF`, `USER`, `+`); MOD EFFECT TYPE, still a number; the sub types, which depend on a type |
| `korg-nts-1-mk2` | 20 of 62 | the type selectors and the arpeggiator, which its dump does not hold; the OSC and FX edit parameters, 14-bit on NRPN and 10-bit in the dump; EG TYPE and FILTER TYPE, whose dump names differ (`ASR`, `Thru`) |
| `korg-minikorg-700sm` | 27 of 29 | the joystick's Modulation1 and 2, not part of a program; its dump names the panel more fully (`EXPAND Switch`, `REVERB Level`), aliased in `dumpNames` |
| `korg-ps-3300` | 141 of 142 | DAMPER, which is not part of a program. The dump's names for some unit settings differ from the NRPN table's (`VCO WAVE` for WAVE FORM), aliased in `dumpNames` |
| `korg-minilogue-xd` | 79 of 101 | the performance controllers, which are not part of a program; SYNC and RING, still numbers; VOICE MODE TYPE, whose dump list prints 2 twice; PORTAMENTO, PROGRAM LEVEL and Program Transpose, whose dump ranges differ from their controllers' (0,1; 0~132; 0~25) |

The request and the dump carry the global MIDI channel (`3g`); the profiles' `deviceId` variable is
that byte, 30H for channel 1.

## What the documents print wrong

Kept as printed and said where it applies:

- **minilogue xd**: the receive table puts SYNC and RING ON at 0~63 and OFF at 64~127, the transmit
  table sends OFF as 0 and ON as 127, so both are numbers. REVERB SUB TYPE points at footnote `*6-14`,
  printed as `*5-14`. MOD FX TYPE's receive ranges overlap at 102 (`77~102,102~127`). The USER sub
  types' transmitted values end at 128, which is not a MIDI value.
- **monologue**: LFO MODE points at receive footnote `*5-6`, which is not printed; it takes the values
  the instrument sends. VCO 1 OCTAVE is not in the transmit table at all.
- **prologue**: MOD EFFECT TYPE names four types in the receive table and five in the transmit table.
- **miniKORG 700Sm**: VCO1 SCALE's transmit footnote prints `2` for `2'`.
- **volca fm2**: ARP TYPE and ARP DIV print hex and decimal bounds that disagree (`40 (58)`,
  `74 (104)`, `22 (35)`); each value sent is one both readings give the same name.
- **volca bass**: `EG DECAT/RELEASE`, which the volca keys prints as EG DECAY/RELEASE.
- **NTS-1 mkII**: DELAY TYPE's footnote prints `TAPE BPM DOUBLING` for two names, thirteen ranges
  for twelve; the profile reads the comma back in. EG TYPE is `AHR` in the controller footnote and
  `ASR` in the program dump; FILTER TYPE's last value is OFF in one and Thru in the other.
- **PS-3300**: the multi channel table prints the decimal of 39H~3EH as `(56)`; the NRPN MSB numbers
  the units RIGHT, CENTER, LEFT and the multi channel mode's channels LEFT, CENTER, RIGHT. Both
  documents spell `ENVEPOLE MODIFIERS` and `PARAMTER`, kept as printed.
- **The program tables**: the minilogue xd's VOICE MODE TYPE list prints `2 : CHORD` and `2 : UNISON`
  for a 1~4 value; its PORTAMENTO row prints the range `0,1` beside a description of `0~127`; its
  PROGRAM LEVEL is 0~132 in the dump and 0~120 on its NRPN, Program Transpose 0~25 and 1~25. The
  monologue's EG TARGET list prints `PICTH 2`.

## Not done

- **The prologue's second timbre**: Pull reads TIMBRE 1 only. The volcas send no dump at all.
- **The NTS-1 mkII's fine controllers.** Its finer settings are pairs named alike, `EG ATTACK (MSB)`
  on 16 and `(LSB)` on 48, paired by name rather than by 32. The document does not say how many of
  the LSB's bits count, so the profile offers the coarse controller alone and leaves the fine one
  out.
- **The PS-3300 in multi channel mode**: the same unit settings as control changes on a channel per
  unit; the profile sends the single channel mode's NRPNs.
- **The microKORG's and microKORG S's Pull**: their program tables print offsets and bits in a form
  of their own (`+1 B6,7`), and lay the timbres or the vocoder over the same bytes by Voice Mode.
- **The KRONOS's and NAUTILUS's readings** are said in each profile and want an instrument to
  confirm: the byte order of values over two bytes, where an EXi engine's table starts in its
  slot's block, the effects' own parameters under the bypass row's TYP, and the messages of the
  KARMA, Drum Track and NAUTILUS scene rows. The effects' parameters are not read back (each type
  lays its slot out its own way), and their names and ranges per type wait for a parameter set
  chosen by another parameter in the profile format. The NAUTILUS's arp patterns have no object
  number or message in its archive.
- **opsix, wavestate, modwave, multi/poly**: Korg publishes a MIDI 2.0 Property Exchange document
  for these, not a parameter table.
- **MS-20 mini** receives notes and the channel mode messages only; **KAOSSILATOR PRO+** lets you
  assign its controllers, so the document names no fixed numbers; the ARP
  2600 and Odyssey, MS-20 FS, minilogue bass and drumlogue have no MIDI Implementation text on Korg's
  site (a chart, or nothing).
