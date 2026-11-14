# Radikal Technologies device profiles

The Delta CEP A and A2, read from the MIDI controller table of their shared manual (version 2),
which Radikal Technologies links from `https://www.radikaltechnologies.com/delta-cep-a-a2-version-2-new-manuals/`
and its firmware and manual downloads page. As with the other brands, the manual is not committed:
what is committed is what was read from it, with the file's name, SHA-256 and where to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| Delta CEP A, A2 | DELTA_CEP_A2_US_UK-1.pdf (71 pp), pp. 54 - 55 | the **MIDI controller table** (`CC  Bereich  Neutral  Parameter`): 66 rows, each with its range and, where it has one, its neutral value; value names in the parameter's text; the swarm's tune as an MSB and LSB pair, the delay time as a coarse value and a 3-bit LSB; program changes. No NRPN, no SysEx. **Built.** The German manual prints the same table. |
| RT-311 Swarm | its manual | Eurorack, CV only. |
| Spectralis 2 | its manual | MIDI as modulation sources and targets only; no controller table. |
| Accelerator | its manuals | on `www.media.radikaltechnologies.com`, which this environment's network does not reach. Not built. |

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-radikal-manual.mjs` | The table from `pdftotext -layout`, each cell where its page's header puts it (the header moves between pages); a row without a range (CC 90) or a neutral value kept so; the page's number skipped. The PDF's text layer loses the `ff` ligature (`VCF Cuto`); the layout names the word it breaks. |
| 2 | `import-radikal.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the manual, where it is linked from, the pages, the broken words. |
| 4 | `build-radikal-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/radikal-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, its range the `Bereich` printed, its default the `Neutral` value.
- **Values named in the parameter's text** (`VCF Filter Type (0=Multimode, 1=LP24, 2=Analog)`, `FX
  Type (0:TapeDly, …)`, `Paraphonic OFF/ON1/ON2` over 0 - 2) are choices; `(+/- 6 halftones)` over
  58 - 70 around 64 is shown as -6 … +6. The filter band is a bit field, kept as 0 - 7.
- **SWARM Tune MSB and LSB** (CC 47, 48) are one 14-bit value, the MSB sent first.
- **The delay time stays two parameters** (CC 89, the coarse 7 bits, and CC 90, the low 3 bits, 0 -
  7): the manual has the LSB sent before the coarse value, the opposite of how a pair is sent.

## The profiles

| Profile | Parameters |
| --- | ---: |
| `radikal-delta-cep-a` | 65 (3 choices) |

## Not done

- **The Accelerator**, whose manuals are on a host this environment does not reach.
- **Read-back.** The desktop version sends the same controllers; the profile does not map them.
