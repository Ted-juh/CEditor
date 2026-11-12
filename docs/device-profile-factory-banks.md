# Reading the makers' own sounds through the profiles

A profile's Pull was written from a document and has never been shown a dump the instrument made.
The makers publish such dumps: factory sounds and sound sets, made on the instrument or with the
maker's own tools, voiced and played by people who would have noticed a broken one. Read through a
profile, each should match one of its dump definitions, pass its checksum, and give every parameter
a value the profile allows: a number in its range, a choice in its list, a name that is text.

A field read at the wrong offset or width rarely survives a bank of real sounds; a checksum computed
over the wrong bytes fails nearly every one. Neither check proves a reading right (a byte that
happens to fit passes), and neither replaces an instrument, but between them they test the part of a
profile the document alone cannot: whether the document matches what the instrument writes.

The banks are the makers' files and are not committed; the tool reads them from wherever they were
downloaded.

## Running it

```bash
node tools/profiles/check-factory-banks.mjs <profile id> <bank file>...            # .syx or .mid
node tools/profiles/check-factory-banks.mjs waldorf-blofeld "Blo Factory 2012.mid" --as blofeld-sound
node tools/profiles/check-factory-banks.mjs korg-monologue Prog_*.prog_bin --payload
```

A bank addressed to memories, or sent whole, where the profile reads the edit buffer needs an
adapter (`--as`), which turns each message into the one the profile reads and says from which
document it knows they hold the same data: `blofeld-sound`, `microwave2-sound`, `microwave-bank`,
`pulse-bulk`, `deepmind-program`. `--payload` reads each file as a dump's data as a maker's library
stores it (Korg's `prog_bin`, unpacked) and packs and frames it as the profile's dump. `--detail`
lists every value refused.

## November 2026

Banks found on the makers' own sites, and what reading them showed:

| Profile | The maker's files | Sounds | Read | What it showed |
| --- | --- | --- | --- | --- |
| `waldorf-blofeld` | Factory 2008, Factory 2012, Easter set (waldorfmusic.com) | 3,072 | all, every checksum | Names with a byte below 32 (2), values neither document lists (below) |
| `waldorf-microwave-2` | Factory 9712, 9806, 2000-08 and user sets | 2,024 | all, once the checksum was corrected | **The checksum excludes the location**, values the spec does not list (below) |
| `waldorf-microwave` | Sound sets 1 - 4 (cartridge dumps) | 256 | all | Sounds older than system software 2.00; names with bytes below 20h (60) |
| `waldorf-pulse` | Sound sets Waldorf hosts (Papen, Nagle, Hoenig, …) | 125 | all | **Cutoff Mod Source and Amount are swapped in the manual's table** |
| `behringer-deepmind-12` | Retro Electro, Synth Wizards (behringer.com) | 256 | all, with the version byte set to 06 | **Protocol version 07, 245 bytes**; names padded with 00 (122) |
| `korg-monologue` | Four sound packs (korg.com) | 400 (183 the packs' own, the rest empty slots) | all | Nothing out of place |
| `korg-minilogue-xd` | HARETOKI SYNTHS (korg.com, Japan) | 50 | all | Nothing out of place; the files hold 1,024 bytes where the document prints 336 |
| `korg-nts-1-mk2` | Sample programs (korg.com) | 12 | all, once the size was corrected | **The document prints 505 bytes; the instrument sends 504** |
| `korg-ps-3300` | AtomTM sound pack (korg.com) | 16 | all | Nothing out of place |

### What was wrong, and is fixed

- **Names (both engines).** A name byte outside 32 - 127 failed the whole dump, taking every other
  parameter of the sound with it. Waldorf's Blofeld and Microwave sounds put display characters
  below 32 into names; Behringer's DeepMind sounds pad names with 00. A 00 now ends a name and any
  other such byte reads as `?`, in the C++ and JavaScript engines alike.
- **Microwave II/XT checksum.** The spec's dump tables print `(BB+NN+SDATA)&7Fh`; its general section
  says the IDs are not counted. Of 2,017 sound dumps in Waldorf's downloads, 2,000 carry the data's
  sum alone and none the location's where the two differ, the edit buffer dumps (BB 20h) among them.
  The profile summed from the location, so a Pull of the edit buffer would have failed its checksum
  whenever the two sums differ, which is almost always. It sums the data now, and its request sends
  7Fh, which the spec says is always accepted.
- **Pulse, bytes 65 and 66.** The manual's Program Dump table puts Cutoff Mod Source at 65 and Cutoff
  Mod Amount at 66. In all 125 programs byte 66 is 0 - 15 and byte 65 spreads around 64, as an amount
  does, and the dump puts an amount before its source everywhere else (Pitch Mod 39 and 40). The
  layout corrects the two.
- **NTS-1 mkII size.** The MIDI implementation prints the program as 505 bytes from 576 packed; 576
  packed bytes hold 504, and Korg's own sample programs end there ('PRED' at 500 - 503, where the
  table prints 501 - 504). The engines refuse a payload larger than the message, so every Pull of a
  real dump would have failed. The Korg builder now takes the size the packed bytes hold.

### What is recorded, not changed

- **DeepMind 12, protocol 07.** Behringer's banks are program dumps with Comms Protocol Version 07 and
  245 bytes packed into 280; the manual (2022) prints 06 and 242 into 278. With the version byte set
  to 06, all 256 line up with the profile's layout. A DeepMind on the firmware that wrote them likely
  answers the edit buffer request with 07, which the profile does not match; supporting both needs a
  matcher that accepts either byte, a change to how Pull matches its answer, and is not made here. The
  profile says so.
- **Values the documents do not list**, in the profiles' notes: the Blofeld's modulation destinations
  54 - 57 (29 times, slots 9 - 16 only) and octaves between the steps of 12; the Microwave II/XT's
  destinations 34 and 35 (525 times), Arpeggiator Tempo 0 (469; printed 1 - 127), filter types 10 -
  12 and chorus 2 and 3; the DeepMind's Pitch Bend Depth 234 in about 190 of 256 sounds (printed 0 -
  24) and FX types 34 and 35. Most are likely later system software. A Pull of such a sound shows the
  number.
- **The Microwave's old sounds.** Waldorf's sound sets predate system software 2.00: bytes 144 and
  169 - 174, unused before it, hold what was left there, so the LFO 2 phase shift and the mixer's
  level modifiers read out of range in most of them. The profile reads the 2.00 layout, as its
  document does.
- **minilogue xd.** Its document prints the program as 336 bytes and its own table runs to 1023; the
  library files hold 1,024. The profile reads offsets up to 153, which both agree on, and the engines
  read a longer dump than they need.

## What was not found, or could not be read

- **Yamaha**: the download lists on its support pages load from a host this environment's network
  does not reach. **Roland**: sound libraries are on Axial, likewise unreachable; the support pages
  carry firmware, editors, and librarian or backup formats that are not SysEx. **Novation** (Circuit
  Tracks) packs come through Components, unreachable and behind an account. **Groove Synthesis**: the
  3rd Wave banks need an account. **Gamechanger**: no preset files published. **Korg** minilogue and
  prologue: factory programs only inside the Sound Librarian installers.
- **TWISTfm**: its factory presets are a memory image, not the SysEx editor protocol the profile
  speaks, and nothing documents a map between the two. **Waldorf Wave**: a format of its own, not
  SysEx. **KRONOS**: the preload is a PCG file, not SysEx.

Each of these could be read with the instrument, or with its maker's files where they can be reached.
