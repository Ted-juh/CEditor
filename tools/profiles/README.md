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
| [`novation/`](novation/README.md) | 9 profiles from the MIDI tables in Novation's user guides, programmer's references and older manuals: Peak, Summit, Bass Station II, Circuit Mono Station, Circuit Tracks (with Pull), Circuit Rhythm, MiniNova, K-Station and KS series, read from the PDFs' word positions. |
| [`moog/`](moog/README.md) | 14 profiles from the MIDI CC tables in Moog's manuals: Sub 37, Subsequent 37 and 25 (with the Sub 37's NRPN chart), Matriarch (with its global settings by SysEx, read back), Grandmother, Messenger, Muse, Subharmonicon, Sirin, Minitaur, Little and Slim Phatty, Taurus 3 and Claravox Centennial, read from the PDFs' word positions; knobs as 14-bit CC pairs. |
| [`yamaha/`](yamaha/README.md) | 29 profiles from Yamaha's data lists: the reface CS, DX, CP and YC; the MODX, MODX+, MODX M, MONTAGE and MONTAGE M (the Performance and Part 1); the MOTIF XS and XF, MOTIF-RACK XS, MOXF, MOX, MX, S90 XS and MO, and before them the MOTIF ES, S90 ES, MOTIF-RACK ES and MOTIF (every table); the CP1, CP5, CP50, CP4 STAGE, CP40 STAGE, CP88/CP73, YC61 and YC88/YC73 stage keyboards. Pull from their bulk dumps throughout; every parameter change table read from the PDF's word positions. |
| [`korg/`](korg/README.md) | 20 profiles from Korg's plain-text MIDI Implementations: minilogue, minilogue xd, monologue, prologue, PS-3300, NTS-1 and NTS-1 mkII, microKORG (2002, its knobs' control changes from the Owner's Manual), microKORG S, microKORG2, KingKORG, KingKORG NEO, miniKORG 700Sm, VOX Continental, and the volca bass, beats, keys, kick, nubass and fm2. |
| [`waldorf/`](waldorf/README.md) | 8 profiles: the Blofeld and the Microwave II/XT from Waldorf's System Exclusive Specifications, every sound parameter, with Pull from the edit buffer; the Microwave of 1989 and the Wave from their typed SysEx documents, with Pull of the sound playing; the micro Q, Rocket and Streichfett from their manuals' controller charts; the Pulse from its manual's controller assignments and program dump, with Pull by program number. The survey of Waldorf's other documents is in its README. |
| [`elektron/`](elektron/README.md) | 19 profiles from the MIDI appendices of Elektron's manuals: Digitone, Digitone Keys, Digitone II, Digitakt, Digitakt II, Syntakt, Analog Four MKII and MKI, Analog Keys, Analog Rytm MKII and MKI, Analog Heat MKII, MKI and +FX, Model:Cycles, Model:Samples, Octatrack MKII and MKI, and Tonverk. Every row as the CC (a 14-bit pair where an LSB is printed) or NRPN it prints, on the channel of the kind of track it belongs to; values 0 - 127, the appendices printing no ranges. Read from the PDFs' word positions. |
| [`behringer/`](behringer/README.md) | 13 profiles from the MIDI tables of Behringer's quick start guides and manuals: UB-1 Micro, JT-4000 Micro, PRO-VS Mini, Spice, JT Mini, D Mini, AKS Mini, PRO-800, JN-80 and CZ-1 Mini from their controller tables, the WAVE from its controller, NRPN and preset byte tables, and the DeepMind 12 from its NRPN table, both with Pull from the edit buffer; the PolyEight from its NRPN mappings, with value lists from its preset table. Every row as the controller it prints (a 14-bit pair where the guide names one), its values as printed: ranges, and bands and named values as choices. Read from the PDFs' word positions; the survey of Behringer's other 57 guides is in its README. |
| [`arturia/`](arturia/README.md) | 5 profiles from the MIDI CC charts of Arturia's user manuals: MiniFreak, MicroFreak, MatrixBrute, PolyBrute and PolyBrute 12. Every row as the controller it prints, values 0 - 127, the charts printing none. Read from the PDFs' word positions; the survey of Arturia's other manuals is in its README. |
| [`asm/`](asm/README.md) | 5 profiles: the ASM Hydrasynth (Keyboard and Desktop) from ASM's MIDI NRPN specification, 888 parameters as 14-bit NRPNs with their ranges and value lists, several parameters on one NRPN told apart by the data MSB; the Hydrasynth Explorer and Deluxe and the Leviasynth Keyboard and Desktop from their manuals' CC charts. Read from the PDF's word positions; the survey of ASM's other documents is in its README. |
| [`nord/`](nord/README.md) | 29 profiles from the MIDI controller lists of Nord's user manuals: Lead A1, 4, 3, 2X, 2 and the first Lead; Wave 2 and Wave; Stage 4, 3, 2 and 2 EX; Electro 7, 6, 5, 4 HP/SW, 4D and 3; Piano 6, 5, 4 and 3; Grand 2 and Grand; Organ 3, C2D and C1 (each row on the channels of its manuals); Drum 3P and Drum 2. Every row as the controller it prints, or the NRPN the newer ones print as `2:22`; values 0 - 127, the lists printing none. Read from the PDFs' word positions; the survey of Nord's manuals is in its README. |
| [`modal/`](modal/README.md) | 15 profiles from the MIDI CC implementation charts of Modal's user manuals: Argon8, 8X and 8M; Cobalt8, 8X, 8M and Cobalt5S; Carbon8, 8X and 8M; Element One (no values printed); and the 002, 008, SKULPTsynth SE and CRAFTsynth 2.0, whose charts print each controller's values, read as ranges and choices. Read with the Nord and Behringer readers from the PDFs' word positions. |
| [`dreadbox/`](dreadbox/README.md) | 3 profiles from Dreadbox's CC lists: the Nymphes (its owner's manual, the values the controller's own), the Artemis (its own CC list, values spread over 0 - 127 as it says) and the Murmux Adept (taken the same way). Read with the Behringer anchored-row reader. |
| [`udo/`](udo/README.md) | 3 profiles from the MIDI specifications of UDO's manuals: Super 6, Super 8 and Super Gemini (each layer on its channel). Every parameter the NRPN table gives as its 14-bit NRPN, every other as the controller and values the controller table prints. Read with the Behringer anchored-row reader. |
| [`groove/`](groove/README.md) | The Groove Synthesis 3rd Wave from its MIDI CC + SysEx Spec: 403 parameters as 14-bit NRPNs, with the ranges and value lists the spec prints and its mod source and destination lists. Read from the PDF's word positions. |
| [`teenage/`](teenage/README.md) | 6 profiles from the MIDI tables of teenage engineering's guides (web pages): OP-Z, OP-1 field, OP-XY, TX-6, EP-133 K.O. II and EP-40 Riddim. Every row as the controller it prints, the per-track ones on the track's channel; switches and actions as choices. |
| [`sonicware/`](sonicware/README.md) | 11 profiles from the MIDI implementation charts Sonicware publishes for each instrument: the LIVEN XFM, Bass & Beats, Mega Synthesis, 8bit warps, Ambient Ø, Lofi-12, Lofi-6 and Texture Lab, the CyDrums, Lofi-12 XT and SmplTrek. Every control change the chart marks recognized, grouped by its block, on its block's channel; values 0 - 127. |
| [`blackcorp/`](blackcorp/README.md) | 4 profiles from the MIDI CC charts at the end of Black Corporation's operation manuals: Deckard's Dream MK2 (with the ranges it prints: bands as choices, centred ranges), Kijimi MK2, Xerxes MK2 (its two channels) and Ise-Nin (its Upper and Lower layers). Read from the PDFs' word positions. |
| [`sequential/`](sequential/README.md) | 17 profiles from the NRPN tables of Sequential's, Dave Smith Instruments' and Oberheim's manuals: Prophet-6, Rev2, 12, X, '08 and 5/10, Pro 2, Trigon-6, Take 5, Fourm, Tetra, the three Mophos, and the OB-6, OB-X8 and TEO-5. |
| `catalogue.mjs` | The catalogue at the end of the docs page, written from the profiles themselves. |

**Makers looked at and not built** (November 2026), each for want of its own documents reachable
from here: Access (the Virus manuals; `access-music.de` failed its TLS handshake), IK Multimedia (the
UNO Synth; its download list is drawn by a script), Studiologic (the Sledge; likewise) and Kurzweil
(`kurzweil.com` refuses automated requests, its PDFs included). Retailers' copies exist for each and
are not used: a profile cites its maker's own file.

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

## The message recipes

A parameter names a recipe in `messageRecipes`, and both engines build its message from it. The
fields a generator here can use, every one of them run by both engines with tests:

| Kind | Fields | What goes out |
|---|---|---|
| `cc` | `channel`, `controller` | One control change, the value's single byte. |
| `cc` with `lsbController` | `channel`, `controller`, `lsbController` | A 14-bit pair: the MSB on `controller`, then the LSB on `lsbController` (usually `controller` + 32), as two messages. The parameter takes a 14-bit encoder (`u14-msb-lsb`) and a range up to 0 - 16383; a 7-bit value goes out as the MSB with an LSB of 0. `lsbController` must be 0 - 127 and not `controller`. |
| `nrpn`, `rpn` | `channel`, `parameterMsb`, `parameterLsb`, `valueResolution` (7 or 14), `nullAfterSend` | CC 99/98 (101/100 for an RPN) select the parameter, then the value on CC 6, and its LSB on CC 38 when `valueResolution` is 14; `nullAfterSend` closes the selection with 127/127. |
| `nrpn` with `lowBitsController` | `lowBitsController`, `lowBits` (1 - 7) | Korg's wide value: its low `lowBits` bits first on `lowBitsController`, then the rest on CC 6. |
| `sysex` | `template`, `checksum` | The template's bytes, with `$encodedValue`, `$address`, `$size`, `$checksum` and any variable (`$deviceId`, `$unitId`) filled in. |

**Following the instrument back.** `CE/web/src/CE_Application/utils/inboundParameterIndex.js`
finds which parameter an incoming message belongs to by compiling each one, so a new recipe needs
nothing there unless its message arrives in pieces. A 14-bit CC pair does: it is indexed on both of
its controllers. The MSB is a value on its own (MIDI has a receiver reset the fine half when the
coarse one arrives), so an instrument that sends only 7 bits is still followed; the LSB is put
together with the value the parameter already has, and ignored when there is none yet. Use a pair
only where the document says which controller carries the low bits: the Moog manuals print `MSB` and
`LSB`; Novation's guides print `CC pair 14,46` without saying, so those profiles send the first
controller alone.

**Reading a dump back.** A dump definition matches a message by its `matcher` prefix and reads each
mapping at its offset into the payload. Several dumps answering one request share
`completion.collectionId`, and the collection is complete at `completion.expectedMessages`, or,
where the instrument decides how many it sends, when the dump named by `completion.endsWith` arrives
(a Yamaha Bulk Footer: a MODX part sends its elements, keys or operators as its type has). A member
of a collection may have no mappings (a Bulk Header or Footer): it counts toward the collection and
reads nothing; alone, a definition without mappings is refused. A message that matches no definition
is let pass, so a collection can name only the blocks a profile lays out.

## About midi.guide

[midi.guide](https://midi.guide) (`github.com/pencilresearch/midi`) is licensed CC BY-SA 4.0. It is
used here only to compare against, which copies nothing from it. If a profile were ever built from
its data, the profile would need to credit it and carry the same licence, so do not do that by
accident: build from the maker's document and compare.
