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
| Microwave (1989) | MicrowaveSysex 1.0 and 2.0, and their 1.25 and 2.00 addenda (plain text) | Legacy, Microwave, Documentation zip, `s/weTqE3SkZzocxYe` | the sound dump (BPRD) byte by byte, its request (BPRR), the real-time sound edit (RTBP); the arrangement, wave, table and global messages |
| Wave | Waldorf Wave System Exclusive Description, OS 1.400 (19 pages), and a MIDI implementation chart | Legacy, Wave, Documentation zip, `s/ytFDr27HtKRYBia` | the Soundprogram dump (SBPR) byte by byte, its request (RQBPR), the sound parameter dump (SBPRPAR); performance, wave, table and global dumps |
| Pulse, Pulse+ | User's Manual Pulse • PulsePlus, version 2.0 (68 pages): controller assignments (appendix B, pp. 58 - 60), SysEx (appendix C, pp. 61 - 67); also a System Exclusive Format 1.1 sheet | Legacy, Pulse series, Documentation zip (`Documentation EN/Manual_v2_0_eng.pdf`) | every sound parameter's controller and its byte in the program dump; the program dump's request by number |
| micro Q (Omega, lite, keyboard) | User's Manual (158 pages): MIDI Controller list p. 152, implementation chart p. 156 | Legacy, micro Q series, Documentation zip | controllers only; its SysEx format is not in the zip |
| Rocket, Streichfett | each instrument's manual | its Legacy page | their controller charts |
| Iridium, Iridium Core, Iridium MK2, STVC, Zarenbourg | each instrument's manual | its product or Legacy page | no profile: see the end of this README |

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
| 1 | `read-waldorf-cc.mjs` | A manual's controller chart, or the Pulse's numbered tables and lists, → their rows as printed. Decides nothing. |
| 1 | `read-waldorf-text.mjs` | A sound dump typed byte by byte (the Microwave's text file, the Wave's PDF) and its modifier table → the rows as printed. Decides nothing. |
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
| `waldorf-microwave-2` | Microwave 2 System Exclusive Specifications 2.16 (Microwave II, XT, XTk) | 203 | 84 | the Sound mode edit buffer, every parameter read back |
| `waldorf-microq` | microQ Omega/lite/Keyboard User's Manual, controller chart pp. 151 - 155 | 103 | 16 | none: no SysEx format published |
| `waldorf-microwave` | Microwave System Exclusive Documentation, system software 2.00 | 151 | 57 | the sound playing, every parameter read back |
| `waldorf-pulse` | User's Manual Pulse • PulsePlus 2.0, appendices B and C | 68 | 22 | a stored program by number, every parameter read back |
| `waldorf-rocket` | Rocket User's Manual, controller chart p. 34 | 19 | 7 | none |
| `waldorf-streichfett` | Streichfett Reference Manual, controller chart p. 21 | 17 | 5 | none |
| `waldorf-wave` | Wave System Exclusive Description, OS 1.400 | 225 | 88 | instrument 1's sound, every parameter read back |

Left out of the Blofeld's: the arpeggiator's 16 steps (32 bytes of bit fields with no lists), the
global parameters (a dump, with no parameter change), and the other Multi instruments' sounds (the
same parameters at locations 01 - 0F).

The Microwave II/XT's specification is the Blofeld's ancestor and reads the same way, with its own
habits: ranges printed `0-127`, lists referred to as `see List 3.11` and printed after the sound data
table, lists separated by `/` (`normal/dual/unisono`) or mixing numbers among the names (`off,1-5`),
and seven lists whose tab collapsed into the name (`sin,tri,sqr,saw,rnd,S&H LFO 1 Shape`), split where
their commas count out the range and every name is one word. Its checksum covers the location as
well as the data (`(BB+NN+SDATA)&7Fh`), and its request carries `(BB+NN)&7Fh`. It names the fourth
modifier's rows (188 - 191) `Modifier 3` a second time; the layout corrects them. No identity check:
its member code is a bitmask of the hardware fitted (a Microwave 2, one with the XT mainboard, an XT,
the expansions), and a profile takes one. Left out: the sound format version (index 0), and, as on
the Blofeld, the other Multi instruments and the global, multi and wave messages.

## The controller charts

The micro Q, Rocket and Streichfett are edited by control change, and their manuals print a chart of
the controllers (`read-waldorf-cc.mjs`): the micro Q's `Ctrl #`, `Controller Range`, `Controller Name
or Sound Parameter`, `Value Range`; the Streichfett's with no range column (each controller 0 - 127);
the Rocket's with an `Alt Ctrl #` column beside the standard one. The Streichfett and Rocket set the
chart in two columns with headings over the left only: the right is read under the same headings,
moved across by as far as its controller numbers stand from the left's (medians, since a value cell
can start with a number). A controller that sets no part of the sound is left out: the micro Q marks
them `*`, the other two leave them unmarked, so the wheels, pedals and channel mode messages are known
by name. A value column naming every value is a choice, at the values printed beside the names where
it prints them (`0 = Off, 64 = On`, `0: Saw, 1: Pulse`), otherwise a band each over 0 - 127, the
first value of it sent (`serial/parallel`: 0, 64), as the Moog profiles do.

Not laid out: the micro Q's Glide Mode and filter types (numbers here; the manual lists their values
in its chapters, not the chart), and the Rocket's alternative assignment. The Iridium, Iridium Core
and Quantum have no fixed controller map (the user assigns each controller, and they ignore incoming
NRPN), and the STVC's manual is German only: none of them has a profile. The Zarenbourg's manual
prints no chart, and has none either.

## The Pulse

The Pulse's manual (version 2.0, English) prints its MIDI as tables with their headings once and
then none, each page at its own indent: appendix B, the controller assignments, and appendix C, the
program dump byte by byte (`readNumberedTable`). A row is a number, a range (`0...127`, `16...112`,
or one value), the parameter's name and its values, apart at the widest gap after the range; the
lines under it run its values on (`0: Pulse`, then `1: Sawtooth` …). A range in hex (`$F0`) is the
message's framing, not read. The modulation sources and destinations are Tables 1 and 3 in the
manual's text (`readNumberedList`), a number and a name each; a row whose values say `see Table`
takes them by its name (`… Source`, `… Destination`).

The two tables name each parameter the same way, so each controller is read back from the program
dump at the byte its name has there: 68 of 68. The dump is `F0 3E 0B <dev> 00 <program> <data> <CHK>
F7`, its checksum bytes 6 to 74 with bit 7 cleared, and a checksum of 127 always accepted. The Pulse
has no request for its edit buffer: the request (`F0 3E 0B <dev> 40 <program> F7`) is for a stored
program, the `program` variable (0 for P.1 … 98 for P.99, 99 for P.rn). So Pull reads that program
as stored, and nothing is read on connect, which would put P.1 on the panel whatever the Pulse is
playing. A program dump sent from the Pulse's panel is the current program, edits and all, and is read
as it arrives. Its Controller Dump (and the request for it, `$4B`) sends the program as these same
control changes; a request answered by control changes is not something a profile can wait for, so
it is not laid out, but CEditor follows the controllers as they come.

The performance controllers (Mod Wheel, Breath Control, Main Volume, Sustain Switch) and the channel
mode messages are left out by name, as on the other charts.

The manual's System Exclusive Format 1.1 sheet, the older document, prints the same program dump;
the manual is read because it has the controllers too.

## The Microwave (1989) and the Wave

Their System Exclusive documents predate the Blofeld's tables: the sound dump is typed out byte by
byte, a byte number (or a run, `153-168`), the parameter's name and its values in brackets
(`read-waldorf-text.mjs`). The Microwave's is a plain-text file; the Wave's a PDF of the same kind,
read through `pdftotext -layout`. Brackets run onto the lines below while they are open, even onto
one that starts with a number (the Wave's `12 means global. )`); brackets with no number in them are
the name's (`Filter Resonance (Q)`). The Microwave marks the rows its system software 2.0 changed:
`*` new, `+` a wider range; each such parameter says so.

What the brackets say (`readValues`):

- values named one by one (`0=sin, 1=saw`, `0: off, 1: on`) naming every value of the range are a
  choice, and so are those named with no range printed, which are all there are (the octaves, `0=-2,
  10h=-1, 20h=0, 30h=+1, 40h=+2`, in hex); a run counted out (`1-4: random 1-4`) is a name each; a run
  named in words (`2...127=delay&retrig`) leaves the parameter a number, the brackets said;
- `see Modifier Table` is that table, as far as the range goes (the Microwave's 24 sources, the
  Wave's 39);
- `equals -64...+63`, `represents 1-128`, `=> -7...+7`, as wide as the data range, is what the values
  show; narrower by a whole step (`0...112, in steps of 16, => 0...7`, `8...120 equals -7...+7`), a
  choice at each step; `equals L64...M00...R63` is -64 to +63;
- a row printed without values (`Osc 2 Octave`) has those of the row it repeats: the one named the
  same with the number before (`Osc 1 Octave`), or else the one as far into the block before (`Wave 2
  startwave` and `Wave 1 wave pos` each begin theirs); `see above` and a ditto mark are the row
  above's;
- the name (`Sound Name`, `Name`, ASCII) is one text parameter, read back and not written; unused
  bytes and the valid flag (always 55h) are not parameters.

Both edit a sound one parameter at a time with the same message, `F0 3E <id> <dev> <IDM> <instrument>
<parameter> <value> <CHK> F7`: the parameter its byte in the dump in two nibbles (the documents'
`BYTE` format, high nibble first), the checksum the 7-bit sum of instrument, nibbles and value. The
Microwave's is the Real Time BPR Edit (`00`, IDM `60`), its parameter the byte less 5; the Wave's the
Sound Parameter dump (`03`, IDM `09`), its parameter the byte itself. Both are sent to instrument 1.
The recipe is the shape the engine reads back as well as sends (header, address, value, checksum), so
what the instruments send when a parameter is edited on their panels is read by byte.

Pull: the Microwave answers its Sound Dump Request (`F0 3E 00 <dev> 02 00 F7`, the checksum of no data
being 00) with the sound playing, edits and all; in Multi mode that is the last instrument selected,
so its document says to switch to Single mode first. The Wave answers its Soundprogram Dump Request
(`F0 3E 03 <dev> 40 00 00 F7`, instrument 1) with that instrument's sound, its location (instrument,
bank, sound number) ahead of the data and inside the checksum. Neither document says a checksum of 7F
is always accepted, so neither profile takes one. Neither prints an identity reply.

Corrected by the layouts, each noted in the profile: the Microwave's Osc 1 Modifier 2 Source (printed
`0...15`, without the `+` its Osc 2 row carries) and Osc 1 Modifier 2 Amount (`equals 64...+63`, the
minus lost); the Wave's Dual mode highpass envelope select (`1: Free` for 3) and its third control
mixer input, printed as `source 2` and `amount 2` a second time.

The Microwave's profile follows the document for system software 2.00 (its 2.00 addendum is folded
into it). An earlier Microwave has the same sound dump with narrower ranges where the rows are marked.

## What is left out, and what would read it

Every profile names what it leaves out in its own notes. Across the eight:

| Left out | Where | Rows | What would read it |
| --- | --- | ---: | --- |
| The other instruments of a Multi | Blofeld (2 - 16), Microwave II/XT (2 - 8), Wave and Microwave (2 - 8) | the whole sound again for each | a repeated group in the profile format: a block of parameters, the location or instrument byte as its stride, a count |
| The arpeggiator pattern's bit fields (`0sssgaaa`, `0lll0ttt`) | Blofeld | 32 bytes | a bit-field encoding written from the byte's last read value; or the fields' values, which the specification describes but does not list |
| What an effect parameter shows for each effect type | Blofeld (laid out as 0 - 127, each type's meaning described) | 28 | a parameter set chosen by another parameter's value |
| The program playing, as control changes (Controller Dump, `4B`) | Pulse | — | a request whose response is controllers |
| The global, multi, wave, wavetable and display messages | Blofeld, Microwave II/XT, Microwave, Wave | — | each a profile block of its own; the global ones have no parameter change, so they would be dump-only |
| Identity | Microwave II/XT (a bitmask of the hardware fitted), Microwave and Wave (none printed) | — | `identity.modelNumber` taking a list, for the Microwave II/XT |
| The micro Q's Glide Mode and filter types as choices | micro Q | 3 | reading the lists from the manual's chapters, not the chart |
| The Rocket's alternative controller assignment (`Alt Ctrl`, 12 of its 19 differ) | Rocket | 19 | a second profile, or a variable choosing the column |
| Note names (`represents C-2...G9`) | Wave's key centres | 5 | a note display mode |

None of it is a reading problem: every row of every document read here is either laid out or named
in its profile's notes with the reason. Four rows were misprinted and are corrected in the layouts
(see above).

Instruments with no profile, and why:

| Instrument | Why |
| --- | --- |
| Iridium, Iridium Core, Iridium MK2, Quantum MK2, M | no fixed controller map: each controller is assigned by the user, and incoming NRPN is ignored |
| STVC | its manual is German only |
| Zarenbourg | its manual prints no controller chart |
| Q, micro Q (SysEx) | no SysEx format on Waldorf's site (the micro Q profile is its controller chart) |
| Kyra | no documents on Waldorf's site |
| Microwave on system software 1.x | the 1.0 document reads the same way; the profile is for 2.00, and says what differs |
