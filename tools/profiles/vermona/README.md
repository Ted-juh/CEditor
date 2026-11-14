# Vermona device profiles

Two Vermona instruments with control changes of their own, read from their user guides, which
Vermona links from each product's support page (`https://www.vermona.com/support/<product>`, the
files under `https://www.vermona.com/media/pages/support/`). As with the other brands, the guides are
not committed: what is committed is what was read from them, with each file's name, SHA-256 and where
to get it.

## Survey (November 2026)

| Instrument | Document | What it gives |
| --- | --- | --- |
| Mono Lancet '15 | ml15_manual_en.pdf, "MIDI Control Change Messages" (PDF page 17) | seven switches (pitch bender, modulation wheel, aftertouch, velocity, filter velocity, auto-glide, legato), each a controller, with its factory setting. **Built.** |
| Kick Lancet | kl_manual_web_en.pdf, "Using the analogue trigger-inputs" | what the GATE (CC 84, four values) and AUDIO (CC 85, two) inputs do. **Built.** |
| PERfourMER MKII, DRM1 MKIII and MKIV, Retroverb Lancet | their guides | notes, channels, clock, and on the PERfourMER the modulation wheel and aftertouch; the DRM1's say other controller data is not processed. No control change that sets anything. Not built. |

Neither guide gives a controller for the sound's knobs, a dump or System Exclusive.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-vermona.mjs` | The guide's table, from `pdftotext -layout`: the Mono Lancet's sentence saying what values mean and its `Function  CC#  Description  Factory Setting` rows, a name and description going on below; the Kick Lancet's `MIDI control command #84` and a value a line under it, its description going on below. |
| 2 | `import-vermona.mjs` | Writes `tables/<name>.json`. **This is what is committed.** |
| 3 | `synths/*.mjs` | The layout: the guide, where it is linked from, which form it is read as. |
| 4 | `build-vermona-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/vermona-*.ceditor-device.json`. |

## What the builder takes as settled

- **A row is its controller**, on the channel variable: the instruments receive on channel 1 until
  powered on with TRIG held and sent a note, whose channel they store.
- **The Mono Lancet's switches** are a choice of the two bands the guide gives every one (`0..63
  means OFF; 64..127 means ON`), a band's first value sent, the default its factory setting.
- **The Kick Lancet's inputs** are a choice of the values printed, the default the one marked
  `(factory default)`.

## The profiles

| Profile | Parameters |
| --- | ---: |
| `vermona-mono-lancet-15` | 7 |
| `vermona-kick-lancet` | 2 |

## Not done

- **Read-back.** Neither instrument sends anything but MIDI THRU.
