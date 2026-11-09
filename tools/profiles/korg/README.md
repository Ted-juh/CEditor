# Korg profiles, read from Korg's own MIDI Implementation documents

```bash
node tools/profiles/korg/make-profiles.mjs            # rebuild every profile from tables/ + synths/
node tools/profiles/korg/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/korg/import-korg.mjs <MIDIImp.txt> <name>   # re-read a document
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
| `korg-kingkorg-neo` | KingKORG NEO MIDI Implementation 1.00 (same tables, same product ID) | 210 | 60 | — | 18H 01H |
| `korg-minikorg-700sm` | miniKORG 700Sm MIDI Implementation 1.00 | 29 | 15 | 14 | 62H 01H |
| `korg-volca-fm2` | volca fm2 MIDI Implementation 1.00 | 13 | 2 | — | 2FH 01H |
| `korg-volca-keys` | volca keys MIDI Implementation 0.01 | 16 | 2 | — | — |
| `korg-volca-bass` | volca bass MIDI Implementation 0.01 | 12 | 1 | — | — |
| `korg-volca-beats` | volca beats MIDI Implementation 0.01 | 20 | 0 | — | — |
| `korg-volca-kick` | volca kick MIDI Implementation 1.00 | 10 | 0 | — | — |
| `korg-volca-nubass` | volca nubass MIDI Implementation 1.00 | 11 | 0 | — | — |

The first volcas have no MIDI Out, so they cannot answer a Device Inquiry and their profiles do not
try to recognise them.

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
- **The program tables**: the minilogue xd's VOICE MODE TYPE list prints `2 : CHORD` and `2 : UNISON`
  for a 1~4 value; its PORTAMENTO row prints the range `0,1` beside a description of `0~127`; its
  PROGRAM LEVEL is 0~132 in the dump and 0~120 on its NRPN, Program Transpose 0~25 and 1~25. The
  monologue's EG TARGET list prints `PICTH 2`.

## Not done

- **The prologue's second timbre**: Pull reads TIMBRE 1 only. The volcas send no dump at all.
- **The NTS-1 mkII's fine controllers.** Its finer settings are pairs named alike, `EG ATTACK (MSB)`
  on 16 and `(LSB)` on 48, paired by name rather than by 32. The document does not say how many of
  the LSB's bits count, so the profile offers the coarse controller alone and leaves the fine one
  out. **NTS-1**, **PS-3300**, **VOX Continental**: read, not yet
  reviewed.
- **microKORG, microKORG2**: few controllers and no parameter change; their documents edit by NRPN, in
  an older notation. **The microKORG S's Pull**: its
  program tables print offsets and bits in a form of their own (`+1 B6,7`).
- **KRONOS, NAUTILUS**: their MIDI Implementations are ZIP archives, not yet read.
- **opsix, wavestate, modwave, multi/poly**: Korg publishes a MIDI 2.0 Property Exchange document
  for these, not a parameter table.
- **MS-20 mini** receives notes and the channel mode messages only; **KAOSSILATOR PRO+** lets you
  assign its controllers, so the document names no fixed numbers; the ARP
  2600 and Odyssey, MS-20 FS, minilogue bass and drumlogue have no MIDI Implementation text on Korg's
  site (a chart, or nothing).
