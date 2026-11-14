# Modor device profiles

The Modor NF-1 (and NF-1m), NF-1k and DR-2, read from the MIDI chapters of their user manuals, which
Modor links from its downloads page (`https://modormusic.com/downloads.html`, the files under
`https://modormusic.com/downloads/`). As with the other brands, the manuals are not committed: what is
committed is what was read from them, with each file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| NF-1, NF-1m | User manual version 6 (OS017), §12.2 (PDF pp. 71 - 74) and §4.4 (p. 31) | the **MIDI controller list**, all 128 rows (`Control  Function  Transmitted  Received  Remarks`), 106 received, with two footnotes; the preset vowels' values on the formant controllers. The downloads page gives the NF-1m the NF-1's manual. **Built**, one profile. |
| NF-1k | User manual version 1 (OS001), PDF pp. 75 - 77 and p. 32 | the same list; CC 1, 3, 4, 7 and 10 also transmitted. **Built.** |
| DR-2 | User manual version 6 (OS014), §7.4 (PDF p. 92) and §7.6 (pp. 93 - 97) | 72 drum controllers (six drums, twelve each), the sequencer's track switch; **NRPNs** (MSB the drum A - F, LSB one of 35 parameters, no ranges) for what the list gives no controller. **Built.** |
| DR-2 | Key Combos and Parameter card | drawn as pictures, no text. Not used. |

The manuals describe SysEx dumps (patch, bank, memory) without their format, and none prints
manufacturer SysEx; nothing is read back.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-modor-manual.mjs` | The controller list from the PDF's word positions: a row a line, a remark that does not fit going on below (`Digital patch vol-` / `ume`), and the footnotes. A footnote is marked by a raised digit set smaller than the text (`Bank Select¹`, `Instrument Enable/Disable³`), which is how it is told from a name ending in a digit (`ENV 1 T1`); its note is under the table. And from `pdftotext -layout`: the NF-1's formant table (`Formant 1  106-110-114  49 32 …`) and the DR-2's NRPN table, its instruments and parameters set side by side. |
| 2 | `import-modor.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, where it is linked from, the pages; for the DR-2, which NRPNs set what a controller sets. |
| 4 | `build-modor-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/modor-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row marked Received is its controller**, sent 0 - 127 on the channel variable. The manual gives
  the panel's ranges (`[0,127]`, `[-64,+63]`, coarse tuning `[-32,+31]`) but not how a controller's
  value maps onto them, so none is shown. Remarks and footnotes go into the description; the formant
  controllers carry the preset vowels' values (`A 49, E 32, …`).
- **The DR-2's NRPNs** are laid out for the parameters the list gives no controller, which is what the
  manual says they are for: 23 a drum, on data entry (CC 6), 0 - 127. The twelve that set what a
  controller sets (pitch, the pitch and amp envelopes, volume, pan, X, Y, Z, T) are matched to those
  controllers by name in the layout, and named in the profile.
- **Left out, and named:** the performance controllers (mod wheel, breath, CC 3, expression, sustain),
  MIDI's own (bank select, data entry and NRPN selection, all notes off), and the rows printed as not
  received (the DR-2's CC 44 start/stop, though its footnote says a setting enables it).

## The profiles

| Profile | Parameters |
| --- | ---: |
| `modor-nf-1` | 99 |
| `modor-nf-1k` | 99 |
| `modor-dr-2` | 211 |

## Not done

- **What a controller's value means on the panel's ranges**, and the DR-2's NRPN ranges: the
  instrument would say.
- **Read-back.** The instruments send their knobs' controllers (the list's Transmitted column); the
  profiles do not map them.
