# Twisted Electrons device profiles

Seven Twisted Electrons instruments, read from the MIDI tables of their manuals, all linked from the
support grid of `https://www.twisted-electrons.com`: four web manuals (TWISTfm, hapiNES L, deton8,
BlastBeats) and three PDFs (TherapSID MKIII, AY3 MKII, MEGAfm). As with the other brands, the
documents are not committed: what is committed is what was read from them, with each file's name,
SHA-256 and where to get it. A web manual is a live page, so its profile records the day it was saved
(11 November 2026); its address carries a cache key that changes, and a page fetched another day may
read otherwise.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| TWISTfm | web manual (MIDI Engine 3.0) | 29 direct performance controllers with value names, 84 main fader controllers, and a **SysEx editor protocol** (header `F0 7D 54 57 30`): 113 named editor parameters with their storage and range, set by SET editor parameter and all read with GET_ALL; raw preset and setting addresses. **Built**, with Pull. |
| hapiNES L | web manual (newer than the 2019 PDF) | 27 controllers, some with value meanings. **Built.** |
| deton8 | web manual | 12 rows, several a range of controllers, one per voice (`Voice volume 1-8 | 10-17`). **Built.** |
| BlastBeats | web manual | 35 drum voice and 28 synth voice controllers, the drums on channel 10 and each synth on its own (1 - 4), as the page's MIDI Channel Routing gives them. **Built.** |
| TherapSID MKII/MKIII | manual (PDF), pp. 26 - 28 | 57 controllers with ranges, switches and the filter mode's bands. **Built.** |
| AY3 MKII | manual (PDF), pp. 39 - 41 | 53 controllers, the voices' and noise's enables as bands. **Built.** |
| MEGAfm | manual (PDF), pp. 27 - 29 | 48 rows by section, no value names. **Built.** |
| FLEXFM | web manual | synth parameters by MIDI learn only; a mixer controller map. Not built. |
| therapKid | cheat sheet | 31 controllers, no ranges. Not built yet. |
| acid8, Crazy8, Octopus | manuals | no parameter map. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-twisted-page.mjs` | A web manual's tables, each under the heading above it, cells as text. |
| 1 | `read-twisted-pdf.mjs` | A PDF's table: TherapSID's and AY3's `Control CC#n  range  result  direction` rows read by their words (their headers are centred, and a range can hold spaces: `0=off   1=on`), a band or a note going on below; MEGAfm's `name  CC  range` lines under their sections. |
| 2 | `import-twisted.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the document, its address, the day a page was saved, the tables, the channel targets (BlastBeats), a stated default channel (deton8), a rename (MEGAfm). |
| 4 | `build-twisted-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/twisted-electrons-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, on the channel its target's routing gives (BlastBeats) or the channel
  variable (deton8's default the channel it states, 10); a range of controllers a row for each.
- **Values:** bands (`0-63 Off, 64-127 On`, `0-25=LP 26-50=BP …`) and names (`Poly 8=0, Unison=1 …`,
  `0=off 1=on`) are choices, a band's first value sent; a range that fits a controller is that range;
  `Continuous`, `0-127` or a description (`16 arp choices`) is 0 - 127. A range past 127 (TWISTfm's
  `Master vol 0-255`, `BPM 1-500`) is left out: a controller cannot carry it, and the editor
  parameters and raw addresses do.
- **TWISTfm's editor parameters** are sent by SET editor parameter (`03 id valueLSB valueMSB`, "value =
  LSB + (MSB * 128)"). Pull sends GET_ALL (`01`) and reads its answer, an INFO message and a VALUE
  message (`12 id valueLSB valueMSB`) for each of the 113 IDs; each parameter takes the VALUE whose id
  is its own (the engines' `when`), so the order they come in does not matter.
- **Left out, and named:** rows the instrument only sends (TherapSID's LFO values), a controller
  printed as `32+59` (TherapSID's filter cutoff, whose pairing the manual does not explain), MEGAfm's
  depths set by velocity, mod wheel and aftertouch, and the performance controllers of TWISTfm's Core
  MIDI table.
- **Corrected, from the block itself:** MEGAfm's OPERATOR 4 prints its first row as `Op3 Total Level`
  (CC 38); every other row of the block is Op4's and OPERATOR 3 has its own, so it is Op4 Total Level.
  Its VIBRATO block prints "Arp Rate" and "Arp Depth"; they are laid out as printed, in that group.

## The profiles

| Profile | Parameters | Read back |
| --- | ---: | --- |
| `twisted-electrons-twistfm` | 222 | the 113 editor parameters |
| `twisted-electrons-blastbeats` | 147 | no |
| `twisted-electrons-therapsid` | 53 | no |
| `twisted-electrons-ay3` | 53 | no |
| `twisted-electrons-megafm` | 45 | no |
| `twisted-electrons-deton8` | 33 | no |
| `twisted-electrons-hapines-l` | 27 | no |

## Not done

- **TWISTfm's raw preset and setting addresses** (commands 05 - 0A), which carry the same settings byte
  by byte, and its buffer commands.
- **The therapKid**, whose cheat sheet prints no ranges, and FLEXFM's mixer map.
