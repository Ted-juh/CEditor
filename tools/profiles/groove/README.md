# Groove Synthesis device profiles

The Groove Synthesis 3rd Wave, read from the **3rd Wave MIDI CC + SysEx Spec v2.0** that Groove
Synthesis publishes on `groovesynthesis.com/support/` (a download, `3rdWave_MIDI_SPEC_v2a.pdf`,
behind a per-visit link). As with the other brands, the spec is not committed: what is committed is
what was read from it, with the file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Document | What it gives |
| --- | --- |
| 3rd Wave MIDI CC + SysEx Spec v2.0 | Global MIDI settings; a CC table for each model (24K keyboard, 24M and 8M desktop), mapping its panel's controls; **every setting of a program as an NRPN** (`NRPN  Category  Range  Description`, 469 rows), with the values each takes; the mod sources (30), mod destinations (127) and analog waveforms (7); the SysEx that carries a program as a run of the same NRPNs |
| 3rd Wave 24K, 24M, 8M User Manuals v1.9 | the instruments; their MIDI chapters point to the spec |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-groove-spec.mjs` | The NRPN table → its rows as printed, and the value lists after it. A row's description is set over several lines around its number, the next row's title straight after the last row's values, with no more space between; so the lines between two rows are read in order, a value (`N: …`) or a run-on staying with the row before, a new title starting the next. A range cell set over lines above its row (`0-2 (0: off, 1:` / `CC, 2:` / `NRPN)`) is that row's. |
| 2 | `import-groove.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/3rd-wave.mjs` | The layout: the spec, the pages of the table and lists, NRPN 0's name, the pages of the edit buffer's SysEx. |
| 4 | `build-groove-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/groove-synthesis-3rd-wave.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its NRPN**, the value 14 bits (CC 6 then CC 38), as the spec's "Transmitted NRPN
  messages" prints them; its range as printed (`200-2400` for the tempo in tenths).
- **Values a description lists** (`0: velocity off`, `0=last`, `0 = exponential`) are a choice where
  they cover the range one each; the mod slots' sources and destinations and the pitch wheel's are
  the spec's lists. The sources print a range of 0 - 26 and the list has 30 (the MPE axes and
  breath added since); they are laid out as the list, and the profile says so.
- **A signed amount** (`LPF envelope amount, -127 to 127` over 0 - 254) is that range shown so.
- **A Multi parameter** (273 of them) has a value for each of a program's four parts and goes to the
  parts NRPN 0 (Edit part, a bitmap) selects. With the global MIDI include part in NRPN on, parts 2
  - 4 have their own NRPNs, 1000 apart; those are not laid out.
- **Left out, and named:** the program name's 32 characters, one an NRPN; the deprecated rows
  (written `DEPRECATED`; NRPN 460, which replaces one, is kept); the bit-packed rows (`See descrip`:
  the oscillators' wavetables, three bits of type and seven of index; the 24 song parts' play count
  and pattern); NRPN 444, not settable.
- **Pull** sends the spec's edit buffer request (`F0 00 02 4A id 06 F7`) and reads its reply, Edit
  buffer data (`id 03`): every setting of the program as a record of four bytes, the NRPN's MSB and
  LSB then the value's, NRPN 0 set to each part before that part's Multi settings. The dump is read
  by record, not by offset (`payload.records`; each mapping names its NRPN, a Multi one with
  `scope: { record: 0, value: 1 }`), so it holds whatever order and count the firmware sends. A
  Multi parameter reads part 1's value; Edit part itself is not read, since the dump sets it once
  for each part. `id` is the variable `productId`: 1 for the 24K and 24M, 2 for the 8M, which the
  instrument answers with (it takes either in a request).

## The profile

| Profile | Rows | Parameters | Choices |
| --- | ---: | ---: | ---: |
| `groove-synthesis-3rd-wave` | 469 | 403 | 79 |

Pull reads 402 of the 403 back (all but Edit part), from the edit buffer.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Parts 2 - 4 in a Pull | the panel lays out one value a Multi parameter; the dump carries four | parts as their own parameters (below), each read with its part's scope |
| A saved program by slot | the program data request names a bank and a slot; the profile asks for the edit buffer | a request with the slot as variables |
| Parts 2 - 4 as their own parameters | they need the global MIDI include part in NRPN on | a profile variant with the +1000 offsets |
| The wavetables and song parts | two fields in one value | a codec for the packed fields |
| The per-model CC tables | they map each model's panel, and the NRPNs cover every setting | a CC profile for each model, if wanted |
