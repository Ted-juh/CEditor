# Jomox device profiles

Sixteen Jomox instruments, read from the MIDI implementation at the end of each operating manual
(or, for the Mod FM and SunSyn, the MIDI implementation document of its own), which Jomox links from
each product's support page (`https://www.jomox.de/support.php?lang=2&product_id=N`, the files under
`https://www.jomox.de/upload/manuals/`). As with the other brands, the manuals are not committed:
what is committed is what was read from them, with each file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | Pages | What it gives |
| --- | --- | --- | --- |
| Alpha Base Mk II | AlphaBaseMk2_E.pdf (OS 1.0 preliminary) | 118 - 124 | each instrument's controllers on its own channel (kick 1, MBrane 2, the samples 3 - 10, FM 11), the global ones on 16 |
| Alpha Base | AlphaBase_E.pdf (OS 1.2) | 111 - 117 | the same |
| XBASE 999 | XBASE999_E.pdf | 87 - 92 | every instrument, the filters, LFOs, mutes and pans; several settings on one controller, told apart by value range |
| XBASE 888 | XBASE888_E.pdf | 81 - 86 | the same, without the filters |
| XBase 09 | XBase09_209Engl.pdf | 35 | 21 controllers |
| AiRBase 99 | AirBase99_E.pdf | 29 - 31 | 52 controllers; then an LFO wave matrix (values by column), not read |
| MBase 01, MBase 11 | MBase01_E.pdf, MBase11_E.pdf | 14; 15 - 16 | 8 and 16 controllers |
| M.Brane 11, Mod.Brane 11 | MBrane11_E.pdf, ModBrane11_E.pdf | 25 - 27; 29 - 30 | the fine ones as MSB/LSB pairs (0 - 255) |
| ModBase 09, ModBase 09 Mk II | ModBase09_E.pdf, ModBase09Mk2_E.pdf | 27 - 28; 28 - 29 | 20 controllers each; LFO 2 Wave is CC 123 on the first and 118 on the Mk II |
| Mod FM | ModFM_MidiImplemtation.pdf (sic) | 3 - 8 | the FM engine, filter and effects (on 16) |
| SunSyn Mk2 | SunSyn_MidiImplementation.pdf | 1 - 4 | 50 controllers; CC 88 switches, a list of switch numbers, not read |
| Moonwind Mk II, Moonwind | MoonwindMk2_E.pdf, Moonwind_E.pdf | 67 - 69; 52 - 54 | the filter's controllers, the cutoffs also as MSB/LSB pairs (0 - 511) |
| JaZBase 03 | JaZBaseE.pdf | 57 - 60 | a full table, but its font has no Unicode map (the text comes out letter-shifted, the digits lost). Not built. |
| T-Resonator II, M-Resonator, T-Rackonizer | their manuals | — | no MIDI |
| Resonator Neuronium | its manual | 31 - 32 | seven cutoffs and key codes beside a patch bay diagram. Not built. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-jomox-cc.mjs` | The tables, as `pdftotext -layout` prints them: a row a line (name, controller, value range, internal range or resolution); a section a line in capitals, alone or leading the header, naming its channel where it does (`KICK DRUM CH1`); a line saying a channel (`Global Controllers on Channel 16`) for the sections after it; a name or an internal range going on below. |
| 2 | `import-jomox.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, where it is linked from, its pages; the AiRBase's stops before its LFO matrix. |
| 4 | `build-jomox-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/jomox-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, on the channel its section names, or the channel variable where none
  is named; `SAMPLE CH3-CH10` is a row for each of the eight sample channels.
- **Values:** a range named one each by the internal range beside it (`0/64  Off/On`, `32-34  Nor,
  Fil, Noi`, `0..7  Sup/Sdo/…`) is a choice; values printed without names (`13,14`) a choice of those
  values; a range otherwise a number, its internal range or resolution in its description.
- **An MSB row and the LSB row after it are one value** over both controllers, the MSB first, as the
  manuals ask a sequencer to send them ("define the controllers as 14 bit CCs with MSB and LSB").
- **Several rows on one controller** (the XBASE's CC 62, 63 and 93: the hi-hat source and each
  instrument's reverse, each its own band of values) are each their own parameter. Read back, the
  controller cannot say which row it is; nothing is read back here.
- **Left out, and named:** actions (storing a preset).

## The profiles

| Profile | Rows | Parameters |
| --- | ---: | ---: |
| `jomox-alpha-base-mk2`, `jomox-alpha-base` | 156 | 345 |
| `jomox-xbase-999` | 112 | 112 |
| `jomox-xbase-888` | 92 | 92 |
| `jomox-mod-fm` | 90 | 89 |
| `jomox-airbase-99` | 52 | 52 |
| `jomox-sunsyn-mk2` | 50 | 49 |
| `jomox-mbrane-11` | 36 | 27 |
| `jomox-moonwind-mk2`, `jomox-moonwind` | 32, 30 | 30, 28 |
| `jomox-modbrane-11` | 25 | 25 |
| `jomox-xbase-09` | 21 | 21 |
| `jomox-modbase-09`, `jomox-modbase-09-mk2` | 20 | 20 |
| `jomox-mbase-11`, `jomox-mbase-01` | 16, 8 | 16, 8 |

## Not done

- **Pull.** The manuals print a SysEx dump's header (`F0 31 7F <product> <preset> …`) but not what its
  bytes are.
- **The JaZBase 03**, whose PDF's text cannot be read without remapping its font.
- **The SunSyn's CC 88 switches and the AiRBase's LFO matrix**, each a table of another shape.
