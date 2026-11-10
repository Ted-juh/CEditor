# Waldorf device profiles

Profiles for Waldorf instruments, read from the documents Waldorf publishes on its own download
server (`downloads.waldorfmusic.com`, linked from each product's page at waldorfmusic.com). As with
the other brands, the documents are not committed: what is committed is what was read from them,
with each file's name, SHA-256 and address.

## Survey (November 2026)

Waldorf prints its instruments' MIDI in two ways: a **System Exclusive specification** for the
SysEx-programmed instruments, a plain-text document with a sound data table (index, range, value,
parameter) and the messages that carry it, and a **controller chart** in the manual for the
instruments edited by control change. Every document below has a text layer; none needs OCR.

| Instrument | Document | Where | What it gives |
| --- | --- | --- | --- |
| Blofeld (desktop and keyboard) | Blofeld System Exclusive Specifications, software release 1.04 (35 pages) | the Blofeld pages, `s/ybExJgT4TzqT8ir` | every sound parameter by index (0 - 382), its range and value list; a parameter change a parameter (SNDP); the sound dump (SNDD, 383 bytes) and its request (SNDR); the global dump; identity |
| Microwave II, XT, XTk | Microwave 2 System Exclusive Specifications, software release 2.16 (26 pages) | Legacy, Microwave II/XT/XTk, Documentation zip | the same form as the Blofeld's, its ancestor: sound, multi, wave, wavetable, global and display messages |
| Microwave (1989) | MicrowaveSysex 1.0 and 2.0, and their 1.25 and 2.00 addenda (plain text) | Legacy, Microwave, Documentation zip | the Microwave's dumps and parameter changes by operating system |
| Wave | Waldorf Wave System Exclusive Description, OS 1.400 (19 pages), and a MIDI implementation chart | Legacy, Wave, Documentation zip | the Wave's dumps and parameters |
| Pulse, Pulse+ | Waldorf Pulse System Exclusive Format 1.1 (7 pages) | Legacy, Pulse series, Documentation zip | the program dump, byte by byte |
| micro Q (Omega, lite, keyboard) | User's Manual (158 pages): MIDI Controller list p. 152, implementation chart p. 156 | Legacy, micro Q series, Documentation zip | controllers only; its SysEx format is not in the zip |
| Iridium, Iridium Core, Iridium MK2, STVC, Rocket, Streichfett, Zarenbourg | each instrument's manual | its product or Legacy page | to be read for their controller charts |

Not found on the site: a SysEx format for the Q and micro Q (the Q's Legacy page has system files
and tools but no documentation), the Quantum MK2 and M (no documents linked on their pages), and the
Kyra.

The Blofeld's and Microwave II's messages:

```
parameter change   F0 3E <id> <dev> 20 <LL> <HH> <PP> <value> F7      Blofeld id 13, Microwave II 0E
sound request      F0 3E <id> <dev> 00 <BB> <NN> <CHK> F7               the edit buffer: Blofeld 7F 00, MW II 20 00
sound dump         F0 3E <id> <dev> 10 <BB> <NN> <data> <CHK> F7
```

`HH PP` is the parameter's index in two 7-bit bytes, which is also its offset in the sound dump; `LL`
is 00 for the Sound mode edit buffer. The checksum is the data's sum masked to 7 bits, and `7F` is
always accepted. The Blofeld's spec prints its request's checksum both ways (the format line has
one, the table and its note leave it out); the Microwave II's, its ancestor, prints `(BB+NN) & 7F`,
which for the Blofeld's edit buffer is `7F`, the value always accepted.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-waldorf-sysex.mjs` | A specification's pages → its sound data table, value lists, effect parameters and messages, as printed. Decides nothing. |
| 2 | `import-waldorf.mjs` | Writes `tables/<name>.json`: those, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, the rows the reader cannot split, the choices the specification describes in words, the groups. |
| 4 | `build-waldorf-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |

```bash
node tools/profiles/waldorf/import-waldorf.mjs blofeld Blofeld_sysex_v1_04.pdf
node tools/profiles/waldorf/make-profiles.mjs            # or --check
```

## Reading the specification

The tables were set with tabs in a proportional font, so the reader works from the words' positions:
a row is its index, its range (`0..127`, or the Microwave 2's `0-127`), then the value column and
the parameter's name, apart where the widest gap between their words is. A first word set far from
the range is the name, with no value printed. Where a tab collapsed to a space there is no such gap
(the Blofeld's `0..3 Up,Down,Alt Up,Alt Down Arpeggiator Direction`): the row is marked `unsure`, not
guessed, and the layout splits it. The value lists are read under their numbered headings (`4.1
Oscillator Shapes and Waves`), a run of values an item (`0..1 1280 bars`), and a bit-field byte's
parts (`0uuu000a`, `uuu:`, `a:`) kept apart. The effect parameters are read by type (`5.2 Chorus
Effect Parameters`, the first unit's index then the second's). The messages: the equipment ID, the
sound dump's data indices and what its checksum covers, the edit buffer's location, the identity.

## What the builder takes as settled

- **Every row with a range is a parameter**, sent as a Sound Parameter Change to the Sound mode edit
  buffer, `F0 3E <id> <dev> 20 00 <HH> <PP> <value> F7`, and read back from the sound dump at the same
  index. `reserved` rows are not.
- **The value column says what the values show.** `see 4.4` is that list, a choice; a list of names as
  long as the range (`off,on`, `parallel,serial`) a choice; a range of numbers as wide as the data
  range (`52..76 -12..+12`) what the values show; `F1 64..F2 63` and `left 64..right 63` -64 to +63;
  anything else (`-200%..+196%`, `40..300`) a number, with the column said. A list of runs (`0..1 1280
  bars`) applies under another setting (an LFO's speed, when it is clocked): a number, the list said.
- **A byte of bit fields with a list for each** (`0uuu000a`, unisono and allocation; `0ttmmmmm`,
  trigger and envelope mode) is a choice of every combination. One whose fields have no lists (the
  arpeggiator's steps, `0sssgaaa` and `0lll0ttt`, and the rows numbered on after them) is left out.
- **An effect parameter** (`see 5`) is a number 0 - 127, its meaning for each effect type in its
  description; the effect type is a choice of the types its unit has (the first has no delay or
  reverb).
- **The name**, a character a row, is one text parameter, read back and not written.
- **Pull** asks for the Sound mode edit buffer (`SNDR`, `7F 00` on the Blofeld). The dump's checksum
  is the 7-bit sum of what the specification says it covers (the Blofeld's data; the Microwave 2's
  location and data), and `7F` is taken too: the specification says it is always accepted
  (`checksum.alsoAccept`, in both engines).
- **The device ID** is the `deviceId` variable (0 unless set otherwise) in everything sent and
  everything matched.

## The profiles

| Profile | Read from | Parameters | Choices | Pull |
| --- | --- | ---: | ---: | --- |
| `waldorf-blofeld` | Blofeld System Exclusive Specifications 1.04 | 258 | 97 | the Sound mode edit buffer, every parameter read back |

Left out of the Blofeld's: the arpeggiator's 16 steps (32 bytes of bit fields with no lists), the
global parameters (a dump, with no parameter change), and the other Multi instruments' sounds (the
same parameters at locations 01 - 0F).
