# Device profiles, read from the manufacturers' own manuals

The tools that build the device profiles in `CE/profiles/test/`. What the library holds, and what it
can be trusted for, is [docs/device-profile-library.md](../../docs/device-profile-library.md); this
page is for whoever adds to it.

```bash
node tools/profiles/roland/make-profiles.mjs --check       # Roland address-map profiles are current
node tools/profiles/roland/make-cc-profiles.mjs --check    # Roland Control Change profiles are current
node tools/profiles/sequential/make-profiles.mjs --check   # Sequential/DSI NRPN profiles are current
node tools/profiles/catalogue.mjs --check                  # the docs page's catalogue is current
cd CE/web && node --import ./test/support/register-svelte.mjs --test \
  test/rolandManualProfiles.test.js test/rolandCcProfiles.test.js test/sequentialProfiles.test.js \
  test/profilesLoad.test.js test/profileCatalogue.test.js
```

| Folder | What it builds |
|---|---|
| [`roland/`](roland/README.md) | 52 profiles from Roland's Parameter Address Maps (SysEx), and 19 from the Control Change lists of the instruments that have no address map. |
| [`korg/`](korg/README.md) | 20 profiles from Korg's plain-text MIDI Implementations: minilogue, minilogue xd, monologue, prologue, PS-3300, NTS-1 and NTS-1 mkII, microKORG (2002, its knobs' control changes from the Owner's Manual), microKORG S, microKORG2, KingKORG, KingKORG NEO, miniKORG 700Sm, VOX Continental, and the volca bass, beats, keys, kick, nubass and fm2. |
| [`sequential/`](sequential/README.md) | 17 profiles from the NRPN tables of Sequential's, Dave Smith Instruments' and Oberheim's manuals: Prophet-6, Rev2, 12, X, '08 and 5/10, Pro 2, Trigon-6, Take 5, Fourm, Tetra, the three Mophos, and the OB-6, OB-X8 and TEO-5. |
| `catalogue.mjs` | The catalogue at the end of the docs page, written from the profiles themselves. |

## The rules every profile here follows

They exist because each one was broken once, and the breakage looked like a working profile.

1. **The manufacturer's document first.** A profile is read from the maker's own MIDI
   Implementation, data list or owner's manual. Community databases (midi.guide, other editors'
   files) are a cross-check, never a source: on the Roland CC lists, midi.guide put a controller on
   the wrong number for four instruments out of eighteen, and on the Prophet Rev2's NRPNs it names
   two numbers after their neighbours.
2. **Read, do not retype.** A reader turns the document's tables into a transcription, which is
   committed with the document's file name, SHA-256, model, version, date, page and URL. The PDF is
   the maker's copyright and is not committed. Anyone with the same PDF can re-run the reader and
   diff. Retyping hides mistakes in the place nobody looks.
3. **Transcribe, then decide.** The reader records what is printed and decides nothing; a separate
   step decides what a display line means, and a layout file says what the tables cannot (which
   blocks make the edit buffer, what a part is called). Keeping these apart is what lets the reader
   be tested on fixtures and the meaning be tested on its own.
4. **Nothing invented.** A value range, a list of choices or a name is in the profile only if the
   document prints it. A switch whose positions are not printed is a number. Where a document is
   wrong, the layout records the error with its reason and the page; a correction is made only when
   the page itself shows the right answer, and an inference is written down as one.
5. **Checked against something that is not this code.** A manual's printed example messages, both
   of CEditor's engines (the C++ one and the JavaScript one must agree byte for byte), the
   document's own internal cross-references (a chart's numbers against its list, a hexadecimal
   column against the decimal), and a second source where there is one.
6. **Fresh, or the build fails.** Every generator has a `--check`, and a test compares each
   committed profile with what its generator makes now.
7. **Honest about what was not checked.** `status: experimental` and
   `coverage.verifiedOnHardware: false` until a real instrument has answered. What a profile
   leaves out goes in its `coverage`, with addresses where there are some.

## Adding a brand

1. **Survey first.** List every model the maker has documented and what kind of document each
   has: a parameter/address table (SysEx), a CC/NRPN list, a scanned manual with no text layer,
   nothing. Download into a scratch folder, never into the repository. Write the survey into the
   brand's README, including the models that cannot be done and why.
2. **Find the shapes.** Most makers print their tables in a handful of styles that stay stable for
   years (Roland's address-map grammar has not changed in twenty). Write the reader for those
   styles, with a fixture test in each style before trusting it on a real document.
3. **Check the reader against something transcribed by hand** before believing it on the rest. The
   Roland reader was checked against the hand-made GAIA and SH-201 profiles first.
4. **Generate, through the engine's existing recipe kinds** (`cc`, `nrpn`, `rpn`, `sysex` with a
   checksum the engines know). If a maker needs something the engines cannot express, that is an
   engine change with its own tests, made first.
5. **Add each profile to `runProfileTests` in `CE/tests/DeviceProfileEngineTests.cpp`** so the C++
   engine runs the same vectors, and build that target in Release before pushing (CLAUDE.md has
   the build commands).
6. **Regenerate the catalogue** (`node tools/profiles/catalogue.mjs`, then `npm run docs:help` in
   `CE/web`, because the library page ships in the program's help) and say in the brand's README
   what is done, what is not, and what the documents got wrong.

## About midi.guide

[midi.guide](https://midi.guide) (`github.com/pencilresearch/midi`) is licensed CC BY-SA 4.0. It is
used here only to compare against, which copies nothing from it. If a profile were ever built from
its data, the profile would need to credit it and carry the same licence, so do not do that by
accident: build from the maker's document and compare.
