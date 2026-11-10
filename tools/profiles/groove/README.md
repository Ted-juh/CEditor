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
| 3 | `synths/3rd-wave.mjs` | The layout: the spec, the pages of the table and lists, NRPN 0's name. |
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

## The profile

| Profile | Rows | Parameters | Choices |
| --- | ---: | ---: | ---: |
| `groove-synthesis-3rd-wave` | 469 | 403 | 79 |

It reads nothing back.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| Pull | the spec's SysEx carries a program as its NRPNs; reading one needs a parser for that stream | the SysEx section, read as a dump of NRPN-value pairs |
| Parts 2 - 4 as their own parameters | they need the global MIDI include part in NRPN on | a profile variant with the +1000 offsets |
| The wavetables and song parts | two fields in one value | a codec for the packed fields |
| The per-model CC tables | they map each model's panel, and the NRPNs cover every setting | a CC profile for each model, if wanted |
