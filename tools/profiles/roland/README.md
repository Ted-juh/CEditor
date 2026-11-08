# Roland device profiles, read from Roland's own manuals

```bash
node tools/profiles/roland/make-profiles.mjs            # rebuild every profile from maps/ + synths/
node tools/profiles/roland/make-profiles.mjs --check    # fail if a committed profile is stale
node tools/profiles/roland/import-manual.mjs <MIDI_Imple.pdf> <name> --url <where it came from>
cd CE/web && node --import ./test/support/register-svelte.mjs --test test/rolandManualProfiles.test.js
```

Roland has printed the **Parameter Address Map** in its MIDI Implementations in one fixed-width
table grammar for twenty years. So a profile is not retyped from the manual; the manual is *read*:

| Step | File | What it does |
|---|---|---|
| 1 | `extract-text.mjs` | PDF → text, one column after another (`pdftotext` from poppler-utils). Two-column pages are cropped and read half by half, so a table running down one column and on into the next comes out in order. |
| 2 | `parse-address-map.mjs` | Text → tables: offsets, bit layouts, `#` multi-packet values, `(min - max)`, the display line beneath, `(reserve)` rows, Total Size. Fills in "and so on" (`:`) runs **only** when the arithmetic closes. A transcription — it decides nothing. |
| 3 | `import-manual.mjs` | Writes `maps/<name>.json`: the transcription, plus the source file's name, SHA-256, model, date, version and URL. **This is what is committed. The PDF is Roland's copyright and is not.** |
| 4 | `interpret.mjs` | What each display line means: choice labels (only when they count out to the wire range), display ranges, units, pan, precision. Anything that does not count out stays a number with the manual's line as its description. |
| 5 | `synths/<name>.mjs` | The layout the tables do not state: which blocks make up the edit buffer, the address path to each, what to call it, the identity reply, the bank table, and the manual's **own printed example messages**. |
| 6 | `build-profile.mjs`, `make-profiles.mjs` | Layout + map → `CE/profiles/test/<id>.ceditor-device.json`: parameters, DT1/RQ1 recipes, one RQ1 and one parsed dump per block, startup pull, presets. Refuses to build if its bytes disagree with a printed example. |

## Is the reading right? Checked against the two maps transcribed by hand

Before trusting the parser with a synth nobody here has typed in, it was run on the two manuals
whose address maps this repository already has, transcribed by hand and used against real
hardware:

| Manual | Parameters compared | Offsets, ranges, packets, labels | Differences |
|---|---|---|---|
| SH-01 GAIA MIDI Implementation 1.01 (`SH-01_MI.pdf`) vs `tools/scripts/qa/roland-gaia/address-map.mjs` + `system-map.mjs` | 307 | **all agree** | 6, all cosmetic: the hand map drops `(CC# 0)` from three names, spells out "Sens", and writes a trailing `[dB]`/`[min]` onto each label |
| SH-201 MIDI Implementation (`SH-201_MI.pdf`) vs `CE/profiles/test/roland-sh-201.ceditor-device.json` | 762 | 740 agree outright | 22: the same trailing-unit labels, and the profile's 16 arpeggio *request actions*, which share an address with a parameter by design |

No disagreement in an address, a range, a nibble count or a label set, in either direction. The
SH-201 document also proved the reader against an older typesetting: every dash in it is an em
dash and its headings are marked `❍` rather than `**`.

## What the profiles are, and are not

- **Every block of the edit buffer, at the manual's addresses, with the manual's names.** One RQ1
  per block, every parameter mapped into that block's reply, the startup pull, bank/program recall.
- **Not yet sent to a real instrument.** `coverage.verifiedOnHardware` is `false` and `status` is
  `experimental` until someone's synth answers. The identity reply is the manual's, not a capture.
- **Front-panel controllers are not modelled.** What a knob *transmits* (CC/NRPN) is a separate
  table in the manual; the GAIA profile shows the shape (`inbound`), and the generator does not
  write it yet.
- **Effect parameter meanings are type-dependent.** Roland's MFX/EFX slots are a 4-nibble container
  (12768–52768, shown −20000…+20000). What each slot *does* depends on the selected type and is not
  in the MIDI Implementation; the GAIA profile narrows them from the owner's manual, these do not.

## The profiles

| Profile | Manual | Parameters | Blocks | Example messages reproduced |
|---|---|---|---|---|
| `roland-jd-xi` | JD-Xi MIDI Implementation 1.00 (May 2015) | 6,199 | 67 (program, 4 parts, 2 SuperNATURAL tones, analog tone, drum kit with 37 keys) | 1 of 1 (p18) |

## Which Roland manuals can be read this way (surveyed November 2026)

From `www.roland.com/<region>/support/by_product/<model>/owners_manuals/`, PDFs on
`static.roland.com`. Older models are listed on the `us` and `uk` sites but not `global`.

| State | Models |
|---|---|
| **Parsed cleanly** | JD-Xi ✓ (0 issues), SH-01 GAIA (0), SH-201 (0), JUNO-DS (0), XPS-30 (0), XPS-10 (1) |
| **Nearly** | JD-XA (4): its Analog Partial table closes at a page foot and reopens with no heading, so the reader sees an unnamed second table — the parser needs to join a headless table onto the open one; and two Keyboard Fade Width rows whose range is not in brackets |
| **Newer table style — needs parser work** (hundreds of issues) | GAIA-2, JUNO-X, JUPITER-X/Xm, FANTOM-6/7/8, AX-Edge; FA-06/07/08 extracts almost nothing |
| **Not yet tried** | SH-32, JUNO-D, JUNO-Di, JUNO-Gi, V-Synth GT, V-Synth XT (MIDI Implementations on the US site) |
| **Scanned, no text** — needs OCR first | JV-1080, JV-2080, JV-1010, XV-5080/3080/5050/2020, XP-30/50/60/80, JP-8000, JP-8080 (MIDI Implementation is in the owner's manual) |
| **No address map published** | The Boutiques (JP-08, JU-06/06A, JX-03, SE-02, SH-01A, …) and the AIRA/TR line: one-page MIDI charts only; their CCs are a different, simpler source |

## Adding a synth

1. Download its MIDI Implementation PDF, and `import-manual.mjs` it. Read the issues it prints:
   a row with no range, or a block whose rows do not add up to its Total Size, is the parser
   misreading something, or the manual being wrong — either way, look before going on.
2. Write `synths/<name>.mjs` from the map's offset tables (`synths/jd-xi.mjs` is the model). The
   path names must match the map exactly; the generator refuses one that matches nothing or more
   than one entry.
3. Copy the manual's example messages (usually the last pages, "Examples of Exclusive Messages")
   into `examples`. They are the check that does not depend on any of this code.
4. `make-profiles.mjs`, then add the profile to `runProfileTests`' list in
   `CE/tests/DeviceProfileEngineTests.cpp` so the C++ engine checks the same bytes.
