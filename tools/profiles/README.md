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
| [`korg/`](korg/README.md) | 32 profiles from Korg's plain-text MIDI Implementations: minilogue, minilogue xd, monologue, prologue, PS-3300, NTS-1 and NTS-1 mkII, microKORG (2002, its knobs' control changes from the Owner's Manual), microKORG S, microKORG2, KingKORG, KingKORG NEO, miniKORG 700Sm, VOX Continental, and the volca bass, beats, keys, kick, nubass and fm2; and the KRONOS and NAUTILUS from the table their MIDI Implementation archives give each object: an HD-1 program, an EXi program (every engine in both slots), a combination (each with every effect slot's parameters), Global, a wave sequence and a drum kit (128 notes of eight zones), sent by parameter change and read back from the current object, with preset recall. |
| [`waldorf/`](waldorf/README.md) | 8 profiles: the Blofeld and the Microwave II/XT from Waldorf's System Exclusive Specifications, every sound parameter, with Pull from the edit buffer; the Microwave of 1989 and the Wave from their typed SysEx documents, with Pull of the sound playing; the micro Q, Rocket and Streichfett from their manuals' controller charts; the Pulse from its manual's controller assignments and program dump, with Pull by program number. The survey of Waldorf's other documents is in its README. |
| [`elektron/`](elektron/README.md) | 19 profiles from the MIDI appendices of Elektron's manuals: Digitone, Digitone Keys, Digitone II, Digitakt, Digitakt II, Syntakt, Analog Four MKII and MKI, Analog Keys, Analog Rytm MKII and MKI, Analog Heat MKII, MKI and +FX, Model:Cycles, Model:Samples, Octatrack MKII and MKI, and Tonverk. Every row as the CC (a 14-bit pair where an LSB is printed) or NRPN it prints, on the channel of the kind of track it belongs to; values 0 - 127, the appendices printing no ranges. Read from the PDFs' word positions. |
| [`behringer/`](behringer/README.md) | 14 profiles from the MIDI tables of Behringer's quick start guides and manuals: UB-1 Micro, JT-4000 Micro, PRO-VS Mini, Spice, JT Mini, D Mini, AKS Mini, PRO-800, JN-80 and CZ-1 Mini from their controller tables (the JN-80 a second time with its NRPN table's twenty parameters at 12 bits), the WAVE from its controller, NRPN and preset byte tables, and the DeepMind 12 from its NRPN table, both with Pull from the edit buffer; the PolyEight from its NRPN mappings, with value lists from its preset table. Every row as the controller it prints (a 14-bit pair where the guide names one), its values as printed: ranges, and bands and named values as choices. Read from the PDFs' word positions; the survey of Behringer's other 57 guides is in its README. |
| [`arturia/`](arturia/README.md) | 5 profiles from the MIDI CC charts of Arturia's user manuals: MiniFreak, MicroFreak, MatrixBrute, PolyBrute and PolyBrute 12. Every row as the controller it prints, values 0 - 127, the charts printing none. Read from the PDFs' word positions; the survey of Arturia's other manuals is in its README. |
| [`asm/`](asm/README.md) | 5 profiles: the ASM Hydrasynth (Keyboard and Desktop) from ASM's MIDI NRPN specification, 888 parameters as 14-bit NRPNs with their ranges and value lists, several parameters on one NRPN told apart by the data MSB; the Hydrasynth Explorer and Deluxe and the Leviasynth Keyboard and Desktop from their manuals' CC charts. Read from the PDF's word positions; the survey of ASM's other documents is in its README. |
| [`nord/`](nord/README.md) | 29 profiles from the MIDI controller lists of Nord's user manuals: Lead A1, 4, 3, 2X, 2 and the first Lead; Wave 2 and Wave; Stage 4, 3, 2 and 2 EX; Electro 7, 6, 5, 4 HP/SW, 4D and 3; Piano 6, 5, 4 and 3; Grand 2 and Grand; Organ 3, C2D and C1 (each row on the channels of its manuals); Drum 3P and Drum 2. Every row as the controller it prints, or the NRPN the newer ones print as `2:22`; values 0 - 127, the lists printing none. Read from the PDFs' word positions; the survey of Nord's manuals is in its README. |
| [`modal/`](modal/README.md) | 15 profiles from the MIDI CC implementation charts of Modal's user manuals: Argon8, 8X and 8M; Cobalt8, 8X, 8M and Cobalt5S; Carbon8, 8X and 8M; Element One (no values printed); and the 002, 008, SKULPTsynth SE and CRAFTsynth 2.0, whose charts print each controller's values, read as ranges and choices. Read with the Nord and Behringer readers from the PDFs' word positions. |
| [`dreadbox/`](dreadbox/README.md) | 3 profiles from Dreadbox's CC lists: the Nymphes (its owner's manual, the values the controller's own), the Artemis (its own CC list, values spread over 0 - 127 as it says) and the Murmux Adept (taken the same way). Read with the Behringer anchored-row reader. |
| [`udo/`](udo/README.md) | 3 profiles from the MIDI specifications of UDO's manuals: Super 6, Super 8 and Super Gemini (each layer on its channel). Every parameter the NRPN table gives as its 14-bit NRPN, every other as the controller and values the controller table prints. Read with the Behringer anchored-row reader. |
| [`groove/`](groove/README.md) | The Groove Synthesis 3rd Wave from its MIDI CC + SysEx Spec: 403 parameters as 14-bit NRPNs, with the ranges and value lists the spec prints and its mod source and destination lists; Pull from the edit buffer, its settings read as NRPN records. Read from the PDF's word positions. |
| [`teenage/`](teenage/README.md) | 6 profiles from the MIDI tables of teenage engineering's guides (web pages): OP-Z, OP-1 field, OP-XY, TX-6, EP-133 K.O. II and EP-40 Riddim. Every row as the controller it prints, the per-track ones on the track's channel; switches and actions as choices. |
| [`sonicware/`](sonicware/README.md) | 11 profiles from the MIDI implementation charts Sonicware publishes for each instrument: the LIVEN XFM, Bass & Beats, Mega Synthesis, 8bit warps, Ambient Ø, Lofi-12, Lofi-6 and Texture Lab, the CyDrums, Lofi-12 XT and SmplTrek. Every control change the chart marks recognized, grouped by its block, on its block's channel; values 0 - 127. |
| [`blackcorp/`](blackcorp/README.md) | 4 profiles from the MIDI CC charts at the end of Black Corporation's operation manuals: Deckard's Dream MK2 (with the ranges it prints: bands as choices, centred ranges), Kijimi MK2, Xerxes MK2 (its two channels) and Ise-Nin (its Upper and Lower layers). Read from the PDFs' word positions. |
| [`erica/`](erica/README.md) | 2 profiles from the MIDI charts of Erica Synths' manuals: the PĒRKONS HD-01 (a controller for each of a voice's knobs and switches, four voices) and the LXR-02 (its CC and NRPN lists, six voices and the effects). Read from the PDFs' word positions. |
| [`expressive/`](expressive/README.md) | The Expressive E Osmose's sound engine from its MIDI implementation chart (the MMA's v2.0 form, read by a reader written for the form): the macros, gains and global effects, on the MPE master channel. |
| [`sequential/`](sequential/README.md) | 17 profiles from the NRPN tables of Sequential's, Dave Smith Instruments' and Oberheim's manuals: Prophet-6, Rev2, 12, X, '08 and 5/10, Pro 2, Trigon-6, Take 5, Fourm, Tetra, the three Mophos, and the OB-6, OB-X8 and TEO-5. |
| [`alesis/`](alesis/README.md) | The Alesis A6 Andromeda from its MIDI Sysex Specification's parameter chart: every program and mix parameter the chart gives a range (696), sent by its MIDI Editing message, a 17-bit signed value; and its mode select. Read from the PDF's text lines. |
| [`gamechanger/`](gamechanger/README.md) | The Gamechanger Audio Motor Synth MKII (its NRPN map and SysEx PDFs) and the first Motor Synth (its manual's): every sound and global parameter as its 14-bit NRPN, with Pull from the sound and global parameter dumps, read by NRPN order. And five pedals' CC tables (AUTO Delay, Chorus, Reverb, Motor Pedal, Bigsby): swept values in 14 bits over CC n and n + 32, named ones as choices. Read from the PDFs' word positions. |
| [`hammond/`](hammond/README.md) | 3 profiles from the MIDI INFORMATION appendix of Hammond's owner's manuals: SK1/SK2, SKX and XK-1c. Every global, patch and Leslie parameter as its NRPN on the Upper channel, with its value names; the drawbars as their controllers. Read from the PDFs' word positions. |
| [`tastychips/`](tastychips/README.md) | The Tasty Chips GR-2 and GR-MEGA from their manuals' MIDI Command Table, the GR-1 from its manual's older one, and the ST-4 and Arduino Piggyback from their web manuals' tables: every control change and NRPN, with value names and the mod source, destination and rate division tables. Read from the PDFs' word positions, rows broken over a page assigned by where wrapping would break a line. |
| [`jomox/`](jomox/README.md) | 16 profiles from the MIDI implementation of Jomox's operating manuals: Alpha Base and Mk II, XBASE 999, 888 and 09, AiRBase 99, MBase 01 and 11, M.Brane 11, Mod.Brane 11, ModBase 09 and Mk II, Mod FM, SunSyn Mk2, Moonwind and Mk II. Every row as its controller on its section's channel; named values as choices, MSB/LSB rows as one value. Read from the PDFs' text lines. |
| [`twisted/`](twisted/README.md) | 7 profiles from Twisted Electrons' manuals: TWISTfm (its controllers and its SysEx editor parameters, with Pull), hapiNES L, deton8 and BlastBeats from their web manuals, TherapSID, AY3 and MEGAfm from their PDFs. Every row as its controller on its target's channel; value names and bands as choices. |
| [`dexibell/`](dexibell/README.md) | 5 profiles from Dexibell's MIDI Implementations: VIVO S8 (S8M, S4, S2), S10, S9, SX8 and COMBO J7, the tonewheel organ's drawbars and controls on the organ's channel and the general controllers, value names and drawbar levels as choices. Read from the PDFs' word positions, two blocks side by side. |
| [`vermona/`](vermona/README.md) | 2 profiles from Vermona's user guides: the Mono Lancet '15's seven MIDI switches with their factory settings, and the Kick Lancet's GATE and AUDIO input modes, as choices. |
| [`modor/`](modor/README.md) | 3 profiles from Modor's user manuals: NF-1 (and NF-1m), NF-1k and DR-2. Every received controller of the MIDI controller list, its footnotes told from its name by the raised marks' size; the DR-2's NRPNs for the drum parameters without a controller. Read from the PDFs' word positions. |
| [`gotharman/`](gotharman/README.md) | 5 profiles from Gotharman's manuals: the Anamono's parameter list (every parameter by NRPN, its 8-bit value in the 14-bit mode, value names as choices) and the CC lists of the LD3, LD Zero, Tiny LD and SpazeBoard6, a part's parameters on the part's channel. Read from the PDFs' word positions and text. |
| [`radikal/`](radikal/README.md) | The Radikal Technologies Delta CEP A / A2 from its manual's MIDI controller table: every row with its range and neutral value, named values as choices, the tune as a 14-bit pair. |
| [`kodamo/`](kodamo/README.md) | The Kodamo MASK1 (MASK1 EX, EX mk2) from its manual's MIDI implementation: every controller mapped to a voice parameter, grouped by its page. |
| `crosscheck-midi-guide.mjs` | Compares every profile's controller and NRPN numbers with a clone of the MIDI Guide dataset, as a check: never a source, and nothing from it is committed. [docs/device-profile-crosscheck.md](../../docs/device-profile-crosscheck.md) has the method and what the last run found. |
| `../../CE/dpd/tools/from-legacy.mjs` | `--check`: every generated profile converts to the DPD model the Device Profile Designer opens for it (`CE/dpd/from-legacy-core.mjs`), and emitting that model gives the profile back. Run it after regenerating profiles; a profile in a shape the converter does not know fails it. |
| `check-factory-banks.mjs` | Reads a maker's factory sounds (raw SysEx, a Standard MIDI File, or with `--payload` a library's raw program data) through a profile's dump definitions and reports what does not read: a message no definition matches, a failed checksum, a value outside a parameter's range or choices. `--as` names an adapter for a bank addressed to memories. The banks are the makers' files and are not committed; [docs/device-profile-factory-banks.md](../../docs/device-profile-factory-banks.md) has what they showed. |
| `catalogue.mjs` | The catalogue at the end of the docs page, written from the profiles themselves. |

**Makers looked at and not built** (November 2026), each for want of its own documents reachable
from here: Access (the Virus manuals; `access-music.de` failed its TLS handshake), IK Multimedia (the
UNO Synth; its download list is drawn by a script), Studiologic (the Sledge; likewise), Kurzweil
(`kurzweil.com` refuses automated requests, its PDFs included), Casio (`www.casio.com`, where its
manual lists now are, answers 403, and the MIDI implementation PDFs' old addresses are gone), Polyend
(`polyend.com` answers with a Cloudflare challenge), Kawai (its download list is drawn by a
script), Melbourne Instruments (the Delia's and Nina's manuals redirect to Squarespace's file host,
which this environment's network does not reach) and Synthstrom Audible (the Deluge's guidebook
documents no fixed controller map: its controllers are learned; the community firmware's default map
is on `synthstromaudible.github.io`, which this environment does not reach). Also MFB (`mfberlin.de` is
now an unrelated news site), Fred's Lab (`fredslab.de` does not answer), Schmidt (its domain redirects
to a shop host this environment's network does not reach), Nonlinear Labs (the C15 takes controllers
only for its pedals, ribbons and aftertouch; its 317 parameters have no MIDI address), Doepfer (the
Dark Energy's synth parameters are not on MIDI; its interfaces' controllers are user-assigned), the
Mutable Instruments archive (no Shruthi, Ambika or Anushri pages; Yarns' chart is on Google Sheets,
not reached), Kodamo's EssenceFM (no fixed controllers for its sound) and Radikal's Accelerator (its
manuals are on `www.media.radikaltechnologies.com`, not reached). Soulsby, MeeBlip, Sonic Potions,
Bastl, Analogue Solutions, Studio Electronics, Supercritical, Elta, Make Noise, Crumar, 1010music and
Critter & Guitari were not surveyed: this environment's network does not reach their sites, and the
change that would have allowed them was refused. Retailers' copies exist
for each and are not used: a profile cites its maker's own file.

## What is still open

Every brand's README names what its profiles leave out and why, and every profile names the rows it
leaves out in its own notes. This is the same, gathered across the brands and sorted by what would
close each item (November 2026). Nothing here is a reading error: each row of each document read is
either laid out or named with the reason.

### Readable now, from a document already in hand

Work for the generators alone: the document is downloaded and says what is needed.

| Open | Brand | What it takes |
| --- | --- | --- |
| The Yamaha rows the reading rules still leave (the S90 XS's arpeggio assign types and offsets, the MX's Wave Number, single-type EQ frequencies, a few hundred in all); five rules read 2,244 in November 2026 | [yamaha](yamaha/README.md) | each a rule of its own, or the instrument; the README says why each is left |
| The microKORG's and microKORG S's program tables (`+1 B6,7`, timbres and vocoder over the same bytes) | [korg](korg/README.md) | a reader for that table form: Pull for both |
| The ELZ_1, ELZ_1 play and MINIMAL charts | [sonicware](sonicware/README.md) | a reader for each form (a macro naming the controllers; a matrix of tracks) |
| Values where a chart prints controller numbers only (Modal's newer instruments, every Nord, Sonicware, the Kijimi, Xerxes and Ise-Nin, the micro Q's Glide Mode and filter types, the MicroFreak's Speech categories) | [modal](modal/README.md), [nord](nord/README.md), [sonicware](sonicware/README.md), [blackcorp](blackcorp/README.md), [waldorf](waldorf/README.md), [arturia](arturia/README.md) | each manual's chapters, a list of settings for each selector: a map from the chart's names to the chapters' headings, written by hand per manual |
| What an Elektron value shows | [elektron](elektron/README.md) | the same, a heading-to-row map per manual; matching them automatically was tried and matched wrongly |
| ASM's effect parameters per effect type, and the mod matrix's sources and targets | [asm](asm/README.md) | the manual's effect and mod matrix chapters, as lists |

### Needs the profile format or the engines

Each needs a change to what a profile can say, made in both engines with tests before any
generator uses it. Most are written up in [known issues](../../docs/known-issues.md#device-profiles)
with what closing them takes; those it does not have are marked new.

| Open | Where it bites | Recorded |
| --- | --- | --- |
| A repeated group: a block of parameters, a stride, a count | the MODX and MONTAGE parts 2 - 16 and MODX M elements 9 - 128; the Blofeld's, Microwaves' and Wave's multi instruments; the 3rd Wave's parts 2 - 4 | known issues |
| A parameter set chosen by another parameter's value | Yamaha effect parameters and EQ frequencies (about 7,000 rows); the Blofeld's effect parameters; the microKORG's two-meaning knobs; the Digitone's shared controllers; the KRONOS's and NAUTILUS's effects (sent by pid per slot, their meaning and read-back by type) | known issues |
| A bit-field encoding written from the byte's last read value | Yamaha receive and transmit switches (about 1,250); the Blofeld's arpeggiator pattern | known issues |
| A parameter of several fields in one message | the Motif family's drum key voice (about 360) | known issues |
| `identity.modelNumber` as a list | Yamaha ranges (MOXF, MODX M, MONTAGE, MOTIF); the Microwave II/XT | known issues |
| Yamaha requests and dumps taking the device number | every Yamaha Pull | known issues |
| Reading back: a channel other than `channel`; Korg's wide NRPN values; a controller two parameters share | the JP-08's Lower part; the minilogue xd; the microKORG, Digitone | known issues |
| The startup read going on past an unanswered request; the JavaScript engine checking a value's range | every profile | known issues |
| A preset name scan that sets a bank and a slot, and a text field read to the message's end | the 3rd Wave's program names | new |
| Reading back an NRPN by its number and its data MSB together | the Hydrasynth's VV-selected parameters | new |
| A request answered by control changes (a controller dump) | the Pulse's Controller Dump (`4B`) | new |
| A pair sent as a selector and then a controller | the Artemis's modulation amounts through CC 31 | new |
| A note-name display mode | the Wave's key centres | new |

### Needs the instrument

What only the instrument can answer: no profile here has been sent to one (`verifiedOnHardware` is
false in every profile), and these are the questions the documents leave.

| Open | Brand |
| --- | --- |
| Which end of the Deckard's Dream's six-way bands is the top setting; its DETUNE controller (the manual says 95, the chart 32); the Xerxes's two channels | [blackcorp](blackcorp/README.md) |
| What the 3rd Wave's dump writes for parts 3 and 4 (the part bitmap's 4 and 8, or 3 and 4) | [groove](groove/README.md) |
| The Nord Lead 3's program dump: its manual prints it in full, but its three byte counts disagree (234, 252 and 261 bytes) and its 8-to-7 conversion is not said | [nord](nord/README.md) |
| The PolyEight's dump and how it carries a negative value; whether a Behringer range is the controller's values or the display's | [behringer](behringer/README.md) |
| The Hydrasynth's LFO1 Smooth and Steps against ENV5 Loop and Legato (one NRPN printed for both) | [asm](asm/README.md) |
| Whether the MatrixBrute sends its fine halves on CC n + 32; how the JN-80 splits a 12-bit NRPN value | [arturia](arturia/README.md), [behringer](behringer/README.md) |
| The KRONOS's and NAUTILUS's readings, each said in its profile: values over two bytes low byte first (the tables' own bit layout implies it); where an EXi engine's table starts in its slot's block; the effects' own parameters under the bypass row's TYP; the KARMA, Drum Track and NAUTILUS scene rows' messages | [korg](korg/README.md) |
| How the Murmux Adept maps 0 - 127 | [dreadbox](dreadbox/README.md) |
| The SKULPTsynth SE's mod slot numbers | [modal](modal/README.md) |
| The Stage 4's organ presets and sample choice, the Electro 7's organ preset and piano choice | [nord](nord/README.md) |
| The values of every switch a chart prints no values for (Erica Synths, Black Corporation) | [erica](erica/README.md), [blackcorp](blackcorp/README.md) |

### Needs a document the maker has not published

No profile is made from anything but the maker's own document, so these wait for one: the makers
listed above as not built; and, within the brands here, Pull wherever no dump format is printed
(Modal, UDO, Moog, most of Nord and Novation), the Typhon, Pro 3, Evolver family, Tempest, Sub
Phatty, Moog One, MiniFreak 49, UltraNova, the DeepMind 6, 12D and 12X, and the instruments whose
controllers the player assigns (Waldorf's Iridium and Quantum, Nord's Modular G2, Korg's
KAOSSILATOR PRO+). Each brand's README says what it looked at.

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
8. **Each parameter says where it is printed.** `source: { doc, page }` (or `line`, for a text
   file): `doc` the index of its document in the profile's `sources`, left out for the first. The
   generator takes it from the row the parameter was read from, so anyone can open the page and
   check one parameter without reading the generator. The Device Profile Designer shows it beside
   the parameter. `page` is the PDF's page as a viewer counts it, not the number printed on it (the
   microKORG's knob table is PDF page 62, printed 56). `table` names the table or section as the
   document prints it (`Drawbar Data List 2`, `§7.4`, a web page's heading); with a page, where only
   the table's first page was recorded, it is the page the table starts on (Roland's address maps:
   `Program Common`, p. 44, the row perhaps overleaf). A parameter read from no one row (a KRONOS
   effect slot's pid, which stands for its row in every effect type) names its document alone. A
   generator whose reader keeps no page, line or printed heading gives none rather than a guess: the
   Gotharman LD lists, the Kodamo, the Radikal, Teenage Engineering's pages, three Twisted Electrons
   manuals and the Kick Lancet, until their readers keep one.

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

A dump that carries its settings as records rather than at fixed places (the 3rd Wave's edit
buffer: each setting its NRPN and value, four bytes) says so with `payload.records`: `size`, where
the key is and how wide (`keyAt`, `keyType` `u7` or `u14`), where the value is (`valueAt`,
`valueType`). Each mapping then names its `record` (the key) and is read at that record's value with
its parameter's own encoding; `scope: { record, value }` reads the one met while that other key last
held that value (the 3rd Wave sets the part being edited before each part's settings). A key the
dump does not carry leaves its parameter unread; records that do not fill the payload are refused.

A field whose meaning another byte of the payload selects says so with `when: { offset, value }` on
its mapping: it is read only when the payload byte at `offset` holds `value`, and a dump is built
with it only where that byte already does (the KRONOS's and NAUTILUS's EXi slots: a slot's engine
settings, AL-1's or MS-20EX's, read when the slot's Algorithm Type holds that engine).

## About midi.guide

[midi.guide](https://midi.guide) (`github.com/pencilresearch/midi`) is licensed CC BY-SA 4.0. It is
used here only to compare against, which copies nothing from it. If a profile were ever built from
its data, the profile would need to credit it and carry the same licence, so do not do that by
accident: build from the maker's document and compare.
