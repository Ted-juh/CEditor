# Checking the device profiles against an independent transcription

None of the device profiles has been tried on an instrument. What can be checked without one is
whether a document was read right, and the strongest check for that is a second reading made by
someone else. [MIDI Guide](https://github.com/pencilresearch/midi) is one: a community dataset of
controller and NRPN numbers for several hundred instruments (CC BY-SA 4.0), transcribed from the
same kind of documents, independently of this project.

It is a check, never a source. A profile still cites only its maker's own document, and nothing
from the dataset is copied into a profile or committed here. Two readings made apart rarely misread
the same row the same way, so where they disagree one of them is wrong, or the document changed
between versions, or it is ambiguous; the maker's document then decides, row by row.

## Running it

```bash
git clone --depth 1 https://github.com/pencilresearch/midi /tmp/midi-guide
node tools/profiles/crosscheck-midi-guide.mjs /tmp/midi-guide            # a summary per device
node tools/profiles/crosscheck-midi-guide.mjs /tmp/midi-guide --detail   # and each disagreement
```

For each device both describe, it reports the numbers only one has and the numbers both have under
names that cannot be the same parameter. Names are compared with their abbreviations read out (`ENV
DEC` is envelope decay, `O1` oscillator 1) and one name's words all among the other's; sharing a word
is not enough, since `V3 VOL ENV DEC` and `Mod. Envelope decay` share two and are not the same
control. Channels are not compared, and a 14-bit pair counts as its MSB.

## November 2026

Against the dataset as of 7 November 2026 (commit `215c64e`), 124 profiles matched a device. Of the
6,258 controller and NRPN numbers both have, 464 were under names the comparison could not match;
reading them showed most to be naming (`Lforate` and `LFO Rate`, `VCF HPF A` and `High pass filter
brilliance I`, a sound engine's knob described one way and the other). The rest were looked up in
the makers' documents:

| Profile | Number | Here | MIDI Guide | The maker's document |
| --- | --- | --- | --- | --- |
| `arturia-matrixbrute` | CC 95, 105 - 107, 29 | ENV 2 (VCF), Velo / VCF | ENV 2 (VCA) velocity | The chart prints `ENV 2 (VCF)` and `Velo / VCF`; the manual's own text calls it ENV 2 (VCA), "Velo/VCA (ENV 2 only)". **Corrected here.** |
| `black-corporation-deckards-dream-mk2` | CC 70, 71 | SAW B, SQUARE B | Square II, Saw II | The chart prints them so, and prints layer A the other way (SQUARE A 43, SAW A 44). One of the layers is likely misprinted; **noted in the profile**. |
| `erica-lxr-02` | CC 55, 57, 73, 74 | voice 3 and 4 volume decay on 55 and 57; mod envelope decay on 73 and 74 | volume decay on 73 and 74 | The manual (p. 36) agrees with the profile. |
| `sequential-prophet-rev2` | NRPN 37, 49, 102 | LFO 1 Freq., LFO 3 Amt., Osc. 1 Shape Mod | VCA env release, LFO 2 amount, osc 1 pulse width | The User's Guide 1.2.4 (p. 100 - 101) agrees with the profile. |
| `moog-muse` | CC 80, 81, 87, 88 | decay, sustain | sustain, "delay" | The manual 1.4.0 (p. 122) agrees with the profile. |
| `arturia-polybrute` | CC 3, 10 | Morph Knob, Stereo | expression pedal, saw/tri mix | The manual 3.0.1 (pp. 122 - 123) agrees with the profile; an older firmware's map. |
| `roland-jp-08` | CC 30 | VCF LFO MOD | VCO LFO modulation | The chart's received list agrees with the profile. |
| `behringer-pro-800` | CC 49 | OSC A Tri | Osc A Saw | The guide prints OSC A Saw twice (48 and 49); the profile already corrects it, and says so. |
| `elektron-analog-four` | CC 87, 88 | vibrato speed, vibrato depth | vibrato speed on 88 | Both Analog Four manuals agree with the profile. |
| `roland-system-1` | CC 61 | OSC1 TYPE (CC 61), noted as probably OSC2 TYPE | Osc 2 type | The chart prints OSC1 TYPE twice; the profile's note already reads it as the second. |
| `twisted-electrons-megafm` | CC 13, 48 | Arp Depth, Arp Rate | vibrato depth, rate | The manual prints Arp under its VIBRATO block; the profile already says so. |
| `tasty-chips-gr-1`, `tasty-chips-gr-mega` | several | the manual's current assignments | earlier firmware's | The manuals follow firmware 2.2 and later (the GR-1's says CC 37 "used to be antialias toggle in firmware <2.2"). |

And a check the comparison suggested, run over every profile: a parameter laid out on a controller
MIDI keeps for itself (bank select 0 and 32, data entry 6 and 38, increment and decrement, NRPN and RPN
selection 96 - 101, the channel mode messages 120 - 127). Most are the maker's own use of the number
(the LXR-02's LFOs on 120 - 127, Nord's effects on 96 - 101). Three were not:

- **Bass Station II**: its guide's Other section prints `mod  cc 0`. CC 0 is bank select, so the
  profile would have changed banks; the mod wheel is CC 1. **Left out**, with the sustain pedal.
- **MiniNova**: its map lists data entry, increment, decrement and the NRPN numbers among its
  parameters; they are how NRPNs are sent, not settings. **Left out**, with bank select and the
  performance controllers.
- **SunSyn Mk2**: the table's last row, `AllNoteOff 123`, had taken the next table's `swctrl0 …
  swctrl7` lines as its name. **The reader now stops** before the CC 88 switch list, and AllNoteOff is
  left out as an action.

## What this does not check

- Anything only one transcription has: 1,706 controllers only the dataset has (mostly performance
  controllers, or a newer firmware's), and the many NRPNs only the profiles have (the dataset often
  lists only controllers).
- Value ranges and what values mean, which the dataset rarely gives in a comparable form.
- SysEx and dumps: the dataset has neither.
- What a document leaves out or gets wrong where both transcriptions read it the same way.

Only the instrument settles those.
