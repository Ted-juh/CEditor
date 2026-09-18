# The open-source landscape — what already exists that CEditor could stand on

> Status: **survey, 2026-09-18. Nothing here is built or vendored.** A companion to
> [`midi-frontier.md`](midi-frontier.md) and [`product-ideas.md`](product-ideas.md): those two say what
> this program *could* do; this one says which of it somebody else has already written, under what
> licence, and where it would land in the tree. Where a licence is marked **(verified)** it was read off
> the project's own page during this pass; **(from memory)** means it was not, and should be checked
> before anything is copied. The first sweep ran out of search budget partway through a per-manufacturer
> pass; a [second pass](#second-pass) the same day went through the GitHub search API, npm, crates.io,
> GitLab and the curated lists instead, closed most of that gap, and read the licence files the first pass
> had marked *check*. Where the two passes disagree, the second is right.

## How to read this

Each entry says four things: what the project is, its licence, what it gives *this* program, and what
is awkward about taking it. "Reference" means read the code and take the idea, not the bytes. "Data"
means the value is in what the project *knows* (a parameter map, a font, a scale archive), which can be
converted without taking a dependency. "Dependency" means link it or `npm install` it.

**Licence ground rules.** CEditor is AGPLv3. That is the most demanding common licence, which makes it
the easiest to *receive* into: MIT, BSD, ISC, Apache 2.0, LGPL, GPLv2-or-later, GPLv3 and AGPLv3 code
can all be combined with it. The two things to watch are the other direction — nothing here can be
handed to a *non*-AGPL exported panel unless it is also permissively licensed — and assets:
`CC BY-NC` artwork (some VCV component libraries) cannot ship in a redistributable panel, and a Ctrlr
panel is somebody's authored work whatever its file format is.

---

## 1. Device profiles — the gap that matters most

`CE/dpd/library/` holds five profiles. The engine behind them — seven codecs, checksum families,
dump parsing, byte-diff inference — is the most complete part of the program, and the library that
feeds it is the least. Everything below is a place to get profiles from without a hardware session.
Three importers already exist (`import-ins.mjs`, `import-midici.mjs`, `tools/ctrlr-import/`); the
first two entries here would be the fourth and fifth.

### 1.1 Parameter maps with the SysEx encoding written down

| Project | Licence | What it knows | Take it as |
|---|---|---|---|
| [Edisyn](https://github.com/eclab/edisyn) (Sean Luke) | Apache 2.0 (verified) | A hundred-plus models (the README's own list, read on the second pass): Casio CZ family, DSI Prophet '08/Tetra/Mopho/Prophet 12, the whole E-mu Proteus and Morpheus line, Kawai K1/K4/K5/K5000, Korg Wavestation SR, microKorg, Microsampler and the volcas, Novation A/D Station and ReMOTE SL, Oberheim Matrix 6/1000, Roland D-110, JV-80/880, U-20/110/220, Sequential Rev2, Waldorf Blofeld/Kyra/M/Microwave II/XT/Pulse 2/Rocket, Yamaha DX7 family, 4-op FM, FB-01, FS1R, TG33/SY22/SY35, the ASM Hydrasynth, plus generic CC/NRPN/RPN and microtuning editors. Each a Java class that names every parameter, its range, its option labels, and the exact bytes that set it — DSI/Sequential, Kawai K1/K4/K5, E-mu Proteus and Morpheus, Yamaha FS1R, Waldorf Blofeld, Korg, Roland and more. Also patch *merging, morphing, nudging* between four patches, which `midi-frontier.md` §4.1 proposes as "patch algebra". | **Data.** The single richest source of complete, tested profiles. A converter from Edisyn's `Synth` subclasses to `.dpd.json` is a parsing job over structured Java, not a rewrite. |
| [KnobKraft Orm](https://github.com/christofmuc/KnobKraft-orm) (Christof Ruch) | AGPLv3, MIT on request (verified) | Python "adaptations", one per synth: identity request and reply matching, bank/program dump requests, patch-name extraction from bytes, bank layout, `isEditBuffer`. The `MidiKraft-*` C++ libraries beneath it (Rev2, DW8000, and others) hold the same in C++. | **Data + reference.** Exactly the *dump layer* of a DPD profile — the part `import-midici.mjs` says MIDI-CI cannot supply. Same licence as this repo; the adaptations are small and readable. |
| [Patch Base synths](https://github.com/coffeeshopped/patch-base-synths) (Coffeeshopped) | Unstated on the repo page; check | Spreadsheets transcribed from manuals — SysEx address tables for the JD-800 and others. Patch Base itself is commercial; this repo is the technical notes behind it. | **Data**, after a licence check. |
| [midi.guide](https://midi.guide/) | CC BY-SA 4.0 (verified) | 124 manufacturers, 413 devices: every CC and NRPN with its name and range. No SysEx. | **Data.** Directly a `generic.cc.json`-shaped profile per device. CC BY-SA on data is fine for an AGPL program; attribute it in the profile. |
| [mlazarev/midi](https://github.com/mlazarev/midi) | Check | Tutorial-grade SysEx documentation with complete implementations for the Korg MS2000 and Roland JP-8080/JP-8000, including decoders. | **Data + reference** for two profiles and for the "SysEx X-ray" idea. |
| [ltgcgo/midi-db](https://github.com/ltgcgo/midi-db) | Check | GM, GM2, XG and GS voice maps as TSV: program and bank-MSB tables for the Yamaha MU series and Roland Sound Canvas line. | **Data** for every GM/GS/XG module at once. |
| [starfishmod/MIDI-Implementations-Schema](https://github.com/starfishmod/MIDI-Implementations-Schema) | Check | A JSON schema for the MMA's own MIDI Implementation Chart 2.0 (RP-028). | **Reference.** If the DPD ever emits a chart, this is the shape somebody already agreed on. |
| [francoisgeorgy/midi-manufacturers](https://github.com/francoisgeorgy/midi-manufacturers), [insolace/MIDI-Sysex-MFG-IDs](https://github.com/insolace/MIDI-Sysex-MFG-IDs) | Check | The MMA manufacturer-ID list as JSON and as tables. | **Data.** The monitor and identity matcher can name the manufacturer of any SysEx it sees. |

### 1.2 Real Ctrlr panels, for an importer that has never seen one

[`ctrlr-import-plan.md`](ctrlr-import-plan.md) is explicit: "never run on a real community panel;
nobody here has a `.panel` or a `.bpanelz`." These are where they are.

- [unityconstruct/CtrlrPanels](https://github.com/unityconstruct/CtrlrPanels) — "Ctrlr Panel Library Collected from Various Sources", built precisely to archive panels after the forum closed.
- [synthmutt/CtrlrPanelSequential](https://github.com/synthmutt/CtrlrPanelSequential) — free editor/librarian panels for DSI and Sequential synths.
- [ctrlr.martintarenskeen.nl](https://ctrlr.martintarenskeen.nl/) — a curated download list.
- [RomanKubiak/ctrlr](https://github.com/RomanKubiak/ctrlr) itself ships sample panels, and its GitHub Discussions are where the community moved when the forum locked; [sgorpi/CtrlrX](https://github.com/sgorpi/CtrlrX) is the maintained community fork.

**The awkward part.** A panel is an authored work. The archive's existence does not license
redistribution of what is in it; the importer can be *tested* on them, but a converted panel shipped
with CEditor needs its author's say-so. The MIDI-map layer (addresses, ranges) is closer to fact than
to expression and is the layer the plan calls "the valuable one" anyway.

### 1.3 Patch-name and bank definitions from the DAWs

Structural-only, but there are thousands of them and the importer for one format already exists.

- **Cakewalk `.ins`** — `import-ins.mjs` handles it. Individual files keep appearing on GitHub ([RD-2000](https://github.com/yapweiliang/RD-2000.INS), a MiniDexed one); the old lilchips.com master collection is the big one and is not on GitHub.
- **Rosegarden `.rgd`** — bank selects, program changes, controllers and percussion maps, all user-contributed, shipped inside the [Rosegarden](https://www.rosegardenmusic.com/wiki/dev:device_files) source tree (GPL). A second importer of the same shape as the `.ins` one.
- **`.midnam`** — the XML patch-name format Ardour and Logic share. `product-ideas.md` already notes there are three importers and no *exporters*; a `.midnam` writer would put a CEditor profile in front of every Ardour user.
- **Cubase MIDI Device panels** are XML too, but exported as a whole setup and shared informally on the Steinberg forums; no archive surfaced.

### 1.4 One-synth open-source editors, as profile donors

Each of these is a working, tested SysEx implementation for one device, and each is a profile
CEditor does not have. Listed by what turned up; the per-manufacturer sweep was cut short.

| Device | Project | Language, licence |
|---|---|---|
| Waldorf Blofeld | [Bigglesworth](https://github.com/MaurizioB/Bigglesworth), [polluxsynth/xtor](https://github.com/polluxsynth/xtor) | Python / C++, check |
| Novation Bass Station II | [BS2-SysEx](https://github.com/francoisgeorgy/BS2-SysEx) (reverse-engineered format), [BS2-Web](https://github.com/francoisgeorgy/BS2-Web) | JS, check |
| Roland JV-1080 | [jv1080-sysex-manager](https://github.com/sonic-codex/jv1080-sysex-manager) — YAML parameter definitions, tests | Python, check |
| Roland Alpha Juno | [alpha.ctrl](https://github.com/banjomasterpete/alpha.ctrl) | check |
| Roland JD-Xi | [JDXI-Editor](https://github.com/markxbrooks/JDXI-Editor), [brasno/JD-Xi-manager](https://github.com/brasno/JD-Xi-manager) | Python, check |
| Roland MT-32 / SC-55 (GS) | [MT32Editor](https://github.com/sfryers/MT32Editor), [SoundPalette](https://github.com/hikari-no-yume/SoundPalette) | check |
| Behringer DeepMind | [deepmind-midi](https://github.com/MysteriousWolf/deepmind-midi) — SysEx, NRPN, CC, dumps | Rust, check |
| Behringer, 71 models | [SynthHUB](https://github.com/utajum/SynthHUB) — browser editor over WebMIDI/WebUSB | JS, check |
| Oberheim Matrix-1000 | [Matrix-Control](https://github.com/tensquaresoftware/Matrix-Control) | C++, check |
| Moog Matriarch | [matriarch-editor](https://github.com/mreid/matriarch-editor) | JS, check |
| E-mu Proteus family | [prodatum](https://github.com/haxorhax/prodatum), [proteusctrl](https://github.com/dangermccann/proteusctrl), [Proteusific](https://github.com/adamjansch/Proteusific), [morphedit](https://github.com/SaintFlipper/morphedit) | various |
| Alesis Micron | [micronux](https://github.com/bergamote/micronux) | check |
| Akai S1000/S3000 | [s3ked](https://github.com/lentferj/s3ked) — every documented header parameter over SysEx | Python, check |
| Yamaha Montage/MODX | [arachsys/montage](https://github.com/arachsys/montage), [YSFC-Forge](https://github.com/itbmusiconline/YSFC-Forge) | Python / JS, check |
| Yamaha reface DX | [reface-dx-lib](https://github.com/SpotlightKid/reface-dx-lib) | Python, check |
| Elektron Digitone | [libdigitone](https://github.com/d-huck/libdigitone); [Elektroid](https://github.com/dagargo/elektroid) for the whole Digi line | Python / C, check |
| Kawai K5000 | [k5ktools](https://github.com/coniferprod/k5ktools) | check |
| Sequential Prophet 6 / 2000 | [Prophet6SoundLibrarian](https://github.com/eclewlow/Prophet6SoundLibrarian), [SCIProphetSamplerEditor](https://github.com/xStudioTools/SCIProphetSamplerEditor) | check |
| 110+ vintage synths | [bipluk](https://github.com/maxcomperatore/bipluk) — a browser librarian whose `sysex_adapters/` carry manufacturer/model IDs and name-parsing offsets per synth | JS, check |
| Many (Java) | [JSynthLib](https://github.com/jpcaruana/jsynthlib) — the old universal librarian; its drivers are a second, older corpus of dump layers | Java, check |

Two things stand out. **Kurzweil is thin but not empty**: the first pass repeated a forum claim that
nothing exists; the second found [psobot/k2000](https://github.com/psobot/k2000), an MIT Python package
for the K2000/K2500/K2600, so the coverage view can say "partial" rather than "none". And the [Electra One](https://docs.electra.one/developers/presetformat.html)
community library is a large JSON corpus of exactly this shape (controls, SysEx templates, parsers)
with a public web app, but each preset's licence is its author's; it is a place to *ask*, not to
scrape.

---

## 2. Device simulators — hardware in the loop, without hardware

This is the entry with the best ratio of leverage to cost in the whole document, and nobody has
proposed it yet. The DPD's SysEx path (compile, checksum, send, dump, parse, diff) has never been
exercised against a device that answers back, because every device that answers back is a piece of
hardware on somebody's desk. Several open-source emulators answer back *exactly as the hardware
does*, run headless, and take MIDI from a virtual port.

| Emulator | Licence | Responds to | Use |
|---|---|---|---|
| [Dexed](https://github.com/asb2m10/dexed) | GPLv3, msfa engine Apache 2.0 (verified) | Full DX7/TX7 SysEx in and out — 32-voice bulk dumps, single-voice dumps, and per-parameter change messages; "controller change" too. Runs as VST3/LV2 and standalone. | A DX7 profile can be authored, dumped, diffed and round-tripped end to end on the Linux CI box. Also the reference implementation for the `midi-frontier.md` "Ghost" idea. |
| [munt](https://github.com/munt/munt) | LGPL 2.1 for `mt32emu` (verified: multiple licences in-tree) | Roland MT-32/CM-32L: addressed SysEx with Roland checksums, timbre and patch memory, the whole Roland DT1/RQ1 shape that `roland.json` describes. | The Roland codec and checksum family, tested against a Roland. Needs the ROMs, which are not redistributable. |
| [Nuked-SC55](https://github.com/nukeykt/Nuked-SC55) | Check (the [jcmoyer fork](https://github.com/jcmoyer/Nuked-SC55) is a library build) | GS SysEx, decapped-chip accurate. | GS profiles from `midi-db`, verified. Same ROM caveat. |
| [FluidSynth](https://github.com/FluidSynth/fluidsynth) | LGPL (verified) | MIDI Tuning Standard SysEx; GS rhythm-part messages. | The one device that will *answer* `Microtuning.h`'s MTS bulk dumps. No ROMs needed. |
| [Ultramaster KR-106](https://synthanatomy.com/2026/03/ultramaster-kr-106-an-open-source-roland-juno-106-synthesizer-emulation.html) | Open source per the announcement; check the repo | Juno-106 with the 128 factory patches decoded from real SysEx. | A Juno-106 profile with a device to test it on. |
| [ADLplug / OPNplug](https://github.com/jpcima/ADLplug), [OPL3BankEditor](https://github.com/Wohlstand/OPL3BankEditor) | Check | OPL3/OPN2 FM chips; bank formats, not vendor SysEx. | Lower value; listed for completeness. |
| [S3000XL-VST](https://github.com/Tuth/S3000XL-VST) | GPLv3 (verified) | Headless MAME running real Akai firmware — every SysEx the sampler ever spoke. | The Akai profile from `s3ked`, verified against the actual firmware. ROMs not included. |

**How it fits the tree.** `CLAUDE.md` already stands the app up under Xvfb on Linux, and the instrument
host's guard — the disposable worker owns the only third-party plug-in constructor — means the app
itself will not load Dexed as a plug-in off Windows. That is fine: run Dexed *standalone*, give it an
ALSA virtual port (`snd-virmidi`; PipeWire bridges it), and point a profile at that port. Nothing in
the product's word is bent. [jazz-soft/midi-test](https://github.com/jazz-soft/midi-test) exists for
exactly this — virtual MIDI ports for testing MIDI applications — and Geert Bevin's
[SendMIDI](https://github.com/gbevin/SendMIDI) / [ReceiveMIDI](https://github.com/gbevin/ReceiveMIDI)
are the command-line harness: `receivemidi` output is `sendmidi` input, so a captured dump becomes a
replayable fixture.

**The awkward part.** Dexed is the only one that needs no ROM. munt and Nuked-SC55 need firmware images
that cannot go in the repo, so they are a developer's local fixture, not a CI job. And an emulator
proves the *protocol*; it cannot tell you a Juno-106 self-oscillates where the next one does not.

---

## 3. MIDI-CI without a MIDI-CI device

`midi2-integration-plan.md` M1 is wired and has never met a CI-capable device. It does not need one.

- [MIDI2.0Workbench](https://github.com/midi2-dev/MIDI2.0Workbench) (midi2-dev, the AMEI/MMA consortium) — a free tool that acts as a MIDI-CI Initiator *and Responder*: Discovery, Property Exchange, Profiles, Process Inquiry, Protocol Negotiation. Point `startMidiCiDiscovery` at it and `midiCiDiscoveryComplete` fires for the first time.
- [ktmidi-ci-tool](https://github.com/atsushieno/ktmidi) (Atsushi Eno) — the other fully featured responder, with an in-place property editor; Eno's [notes on MIDI-CI tools](https://atsushieno.github.io/2024/01/26/midi-ci-tools.html) compare them.
- JUCE's own `CapabilityInquiryDemo` in `JUCE/examples/` is a third responder and is already in the tree.
- [ni-midi2](https://github.com/midi2-dev/ni-midi2) — C++17, UMP 1.1 and MIDI-CI 1.2 (verified). The reference library if `juce_midi_ci` turns out to be incomplete for Property Exchange resources.
- [microsoft/MIDI](https://github.com/microsoft/MIDI) — Windows MIDI Services: the new Windows MIDI API, the AMEI-donated USB MIDI 2.0 class driver, *multi-client* ports, and a MIDI 2.0 monitor. Open source. This is where M3 (UMP transport) lands on Windows, and multi-client ports quietly fix a whole class of "port in use" support tickets.
- [libremidi](https://github.com/celtera/libremidi) — C++20, MIDI 1 and 2, eighteen backends including Windows MIDI Services and WebMIDI, UMP converted automatically when sent to a MIDI 1 API (verified). If JUCE's MIDI layer ever becomes the limit, this is the replacement, and it is compatible with `ni-midi2`'s types.

---

## 4. MIDI, timing and music-theory libraries

| Project | Licence | Gives | Lands in |
|---|---|---|---|
| [Surge tuning-library](https://github.com/surge-synthesizer/tuning-library) | MIT (verified) | Header-only `.scl`/`.kbm` parsing and frequency lookup, used by Surge XT and Dexed. `Microtuning.h` is a from-scratch "dependency-free core"; this is the same thing with years of edge cases. | `CE/src/Performance/` |
| [MTS-ESP client](https://github.com/ODDSound/MTS-ESP) | Free client library (verified: "include the two files") | The exported plugin follows a DAW-wide tuning master. [simple-mts-main](https://github.com/baconpaul/simple-mts-main) is a free master to test against. | Player |
| [Scala scale archive](https://github.com/narenratan/scala_scale_archive) mirror | Freely downloadable per Huygens-Fokker (verified) | 5,350 scales, a few megabytes. A tuning browser with content on day one. | assets |
| [Ableton Link](https://github.com/Ableton/link) | GPLv2+ / proprietary dual (verified) | Tempo and phase sync with every Link app on the network. `Transport.h` follows MIDI clock and the DAW playhead; Link is the third clock, and the one musicians on iPads use. GPLv2-or-later is combinable with AGPLv3. | `CE/src/Performance/Transport.h` |
| [tonal](https://github.com/tonaljs/tonal) | MIT (verified) | Scales, chords, keys, and `Chord.detect()` from note sets — `midi-frontier.md` §5.4 "follow the band". `musicTheory.js` exists; check what it duplicates. | `CE/web/src/.../scripting/musicTheory.js` |
| [@tonejs/midi](https://github.com/Tonejs/Midi) / [midi-file](https://www.npmjs.com/package/midi-file) | MIT (from memory) | Read and write Standard MIDI Files in JS. The phrase sequencer and the capture journal have no `.mid` export today. | web |
| [midijitter](https://github.com/martinsolberg/midijitter), [jack-midi-timing](https://github.com/falkTX/jack-midi-timing) | Check | Measured BPM, fitted period, phase jitter (RMS, P95, P99), missing and duplicate clocks. The whole of "the clock doctor" (§2.4), already written as a Linux CLI. | reference for `Transport` diagnostics |
| [mpe-emulator](https://github.com/attilammagyar/mpe-emulator) | Check | Rules for turning non-MPE streams into MPE. `MpeTransformer.h` goes the same way; compare. | reference |
| [arpligner](https://github.com/YPares/arpligner) | Check (JUCE 7) | A polyphonic, multi-track arpeggiator that takes chords *and* patterns as live MIDI. A different arpeggiator model than the one in the tree, worth a look. | reference |
| [Strudel](https://codeberg.org/uzu/strudel) | AGPLv3 (verified) | The TidalCycles mini-notation in JavaScript, with WebMIDI output. Same licence as this repo, so it could be embedded outright: a pattern language for the phrase sequencer that a whole live-coding community already knows. | scripting / Player |
| [Orca](https://github.com/hundredrabbits/Orca) | MIT (verified) | The esoteric grid sequencer; as a reference for what a *generative* panel component can be. | reference |
| [roland-checksum](https://www.npmjs.com/package/roland-checksum), [sysex-checksum](https://github.com/shingo45endo/sysex-checksum) | Check | Tiny; `ProfileChecksums.h` already covers this. Listed so nobody adds them. | — |

---

## 5. The Svelte editor

The web side is deliberately thin on dependencies (five runtime packages). These are the ones
that would pay their way, and the ones that would not.

**Would pay their way**

- [regl-scatterplot](https://github.com/flekschas/regl-scatterplot) — WebGL scatter plot, pan/zoom/rotate, lasso selection, twenty million points (verified). Preset Constellation and Timbre Space over a 3,600-program library is exactly its problem; over a 30,000-program library it is the only thing that will still draw at 60 fps.
- [umap-js](https://github.com/PAIR-code/umap-js) (Google PAIR) and [DruidJS](https://github.com/saehm/DruidJS) — UMAP, t-SNE, PCA and seven other reductions with one interface. Timbre Space today projects `SonicProfile`'s handful of axes; these turn *any* feature vector into a map.
- [svelte-moveable](https://github.com/daybrush/moveable/tree/master/packages/svelte-moveable) — drag, resize, rotate, warp, group, *snap* handles. The designer canvas has its own; compare the snapping and group behaviour before deciding.
- [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) — production-grade, accessible drag and drop; Svelte 5 confirmed.
- [Bits UI](https://sveltekitui.com/libraries/bits-ui/) — the headless primitive set rewritten for Svelte 5 runes; its `Command` component replaced `cmdk-sv`. A command palette over the 214 property sections is a cheap win.
- [dockview-core](https://github.com/mathuo/dockview) — zero-dependency docking with floating and pop-out panels and serialised layouts. The dock is built and works; this is only relevant if pop-out windows (a panel on a second monitor) become a goal.
- [webaudio-controls](https://github.com/g200kg/webaudio-controls) and [WebKnobMan](https://www.g200kg.com/en/webknobman/) — the filmstrip-knob convention CEditor's Assets tab already speaks, and the gallery that supplies them. [KnobMan3D](https://github.com/g200kg/knobman3d) is MIT with CC0 sample knobs (verified); [StripKit](https://github.com/Vybecode-LTD/stripkit) (MIT, verified) turns one transparent PNG into a frame-perfect strip. Between them, a "generate a filmstrip from this SVG" button.
- [WEBMIDI.js](https://github.com/djipco/webmidi) — makes the browser-only mode at `localhost:5173` talk to real ports instead of mock data. A panel author on a Mac could then test bindings without the JUCE app existing for their platform.
- [osc.js](https://github.com/colinbdclark/osc.js) — OSC in browser and Node. Only if the tablet idea speaks OSC to third parties.

**Testing**

- [vitest-browser-svelte](https://github.com/vitest-community/vitest-browser-svelte) — component tests in a real browser with Svelte 5 runes; requires Vitest 4. The current `node --test` suite plus `browser-checks/` covers this ground already; the gain is locators and auto-retry, not coverage.
- Storybook with [Chromatic](https://delta-qa.com/en/blog/chromatic-vs-percy-comparison-2026/) — free for open-source projects; per-component visual regression on the 14 designers and their mockups.
- [@axe-core/playwright](https://playwright.dev/docs/accessibility-testing) — automated WCAG checks inside the existing Playwright runs. `product-ideas.md` §3 has an accessibility section with nothing measuring it.

**Reference only.** [Tweakpane](https://github.com/cocopon/tweakpane) (MIT) and lil-gui are property panels; the one in the tree is more specific than either. [Konva](https://konvajs.org/docs/svelte/index.html) and PixiJS are canvas engines; the designer is DOM and should stay DOM until it cannot.

---

## 6. Displays, fonts, glyphs

`LcdDisplay` and `PixelDisplay` draw character cells and pixels; the fonts they draw with are the
whole of their credibility.

- [DSEG](https://github.com/keshikan/DSEG) — 7-segment and 14-segment families, fifty-plus variants, SIL OFL 1.1 (verified). Bundleable without the licence text per its terms. The one font every hardware synth screen from 1985 wants.
- [u8g2 fonts](https://github.com/olikraus/u8g2/wiki/fntgrp) — the largest curated bitmap-font corpus in existence, in BDF, with licence *per group*: the `efont`/`5x7.bdf` set is public domain, Open Iconic is OFL, WenQuanYi is GPLv2 with the font-embedding exception, others GPLv3 (verified per wiki). Take the public-domain and OFL groups; skip the GPL ones for anything that ends up inside a user's panel.
- [Adafruit GFX](https://github.com/adafruit/Adafruit-GFX-Library) — the classic 5x7 `glcdfont.c` (BSD) and the FreeFont-derived bitmap set (OFL, verified). The literal HD44780-alike glyphs.
- [Press Start 2P, VT323, Silkscreen](https://fonts.google.com/specimen/VT323) — OFL pixel fonts on Google Fonts, for panels that want a screen without emulating one.
- [Piskel](https://github.com/piskelapp/piskel) — reference for the CGRAM glyph editor's interaction model, not a dependency.

The repo ships Archivo and JetBrains Mono today and nothing for a display.

---

## 7. Scripting engines

Seven languages, each run as itself. The interesting libraries are the ones that make the exported
panel smaller or the editor's preview truer.

- [Tracktion choc](https://github.com/Tracktion/choc) — header-only, ISC (verified), by the author of JUCE. A cross-engine JavaScript API over QuickJS, Duktape and V8 (QuickJS and Duktape as single headers), plus its own webview, MIDI and audio-file helpers. The JS engine wrapper is the relevant part: the same script API against a smaller engine for the exported player.
- [quickjs-ng](https://github.com/quickjs-ng/quickjs) — the maintained QuickJS fork: ES2023, modules, BigInt, fast start (verified). Compare with whatever `Scripting/` embeds today.
- [pocketpy](https://github.com/pocketpy/pocketpy) — Python 3.x in a single C11 header, no dependencies, pybind11-compatible bindings, MIT (verified). A Python-authored panel could export without carrying CPython; `moduleCost.generated.js` would show the difference.
- [esbuild-wasm](https://www.npmjs.com/package/esbuild-wasm) — TypeScript to JavaScript in the browser; about 10 MB of WASM (verified). [Sucrase](https://github.com/alangpierce/sucrase) is far smaller if type-stripping is all the preview needs.
- [Luau](https://github.com/luau-lang/luau) — Roblox's typed Lua, MIT (from memory). Only if the Lua block editor spike in `tools/scripts/spikes/lua-blocks/` wants types.
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) — one parser family for all seven languages' highlighting and structure; `acorn` and `luaparse` cover two today.
- [Protoplug](http://www.osar.fr/protoplug/) is the prior art for "Lua scripts as audio/MIDI plugins", worth a look for its API shape (GPL, from memory).

---

## 8. Plugin formats, hosting, validation, build

- [free-audio/clap-wrapper](https://github.com/free-audio/clap-wrapper) — wraps a CLAP into VST3, AUv2, AUv3, AAX and standalone; MIT with Apache 2.0 for the AUv2 part (verified). The player already exports four formats through JUCE plus `clap-juce-extensions`; if the JUCE licence or an AU build ever becomes the obstacle, this is the other path: build CLAP once, wrap the rest.
- [pluginval](https://github.com/Tracktion/pluginval) — GPLv3 (verified), headless, strictness 1–10, active in 2026. Run at level 5 on every exported format in CI; the `panel-export-pipeline-plan.md` has no validation step.
- Steinberg's `validator` from the [VST3 SDK](https://github.com/steinbergmedia/vst3sdk) — the SDK's `LICENSE.txt` now reads MIT (verified on the second pass), so the validator and the SDK's own test host are free to run in CI and free to link.
- [Pamplejuce](https://github.com/sudara/pamplejuce) — the reference CI for JUCE 8: Catch2, pluginval, Azure Trusted Signing, notarisation, three-platform matrix (verified). Not a dependency, a crib for `.github/workflows/`.
- [Carla](https://github.com/falkTX/Carla) (GPLv2+) and [Element](https://github.com/kushview/element) (GPLv3) — plugin hosts with out-of-process bridges. `IsolatedPluginProxy` and `plugin-process-isolation.md` are solving Carla's `carla-bridge-*` problem; its bridge protocol is a second opinion. Ardour's [`vst3_scan.cc`](https://github.com/Ardour/ardour/blob/master/libs/ardour/vst3_scan.cc) is the reference for scanner timeouts and cancellation.
- [melatonin_inspector](https://github.com/sudara/melatonin_inspector) and [melatonin_perfetto](https://github.com/sudara/melatonin_perfetto) — a component inspector and Perfetto tracing for JUCE. The UI here is a webview, so the inspector is for the native windows only; Perfetto traces across the audio thread, the message thread and the worker process are the thing.
- [readerwriterqueue](https://github.com/cameron314/readerwriterqueue) — the lock-free SPSC queue everybody uses. `MidiCaptureJournal.h` hand-rolls a ring; this one has a blocking variant and a decade of fuzzing.
- [CPM.cmake](https://github.com/cpm-cmake/CPM.cmake) — FetchContent with versions and a cache. `CMakeLists.txt` fetches Lua and sol2 by hand; CPM is what Pamplejuce does instead.
- Cousins to study, not take: [HISE](https://github.com/christophhart/HISE) (GPLv3, its export pipeline and floating-tile UI), [foleys_gui_magic](https://github.com/ffAudio/foleys_gui_magic) (BSD-3, a JUCE GUI built from a DOM plus a stylesheet — the same idea as `.cepanel`, in native), [Faust](https://faust.grame.fr/)'s `faust2juce`, [Cabbage](https://cabbageaudio.com/), [plugdata](https://plugdata.org/), [DPF](https://github.com/DISTRHO/DPF). Each has a working "author in one thing, export as a plugin" pipeline and each has solved the licence-of-the-exported-artefact question one way or another.

---

## 9. Shipping, updating, signing, telling people

`RELEASE-NOTES.md` says "Windows only for now, and unsigned". Three of these fix a word each.

- [SignPath Foundation](https://signpath.io/solutions/open-source-community) — free OV code signing for qualifying open-source projects, run through their CI pipeline; DB Browser for SQLite and Super Productivity use it (verified). Removes "unsigned" and the SmartScreen wall with it.
- [Velopack](https://github.com/velopack/velopack) — installer plus delta auto-update, Rust core with a C/C++ SDK, Windows/macOS/Linux, MIT (verified). [WinSparkle](https://winsparkle.org/) (MIT, verified) is the smaller, Windows-only, appcast-based alternative with Ed25519-signed updates. `product-ideas.md` proposes self-updating *panels*; either of these does the *app*.
- [winget-releaser](https://github.com/vedantmgoyal9/winget-releaser) — publishes each GitHub release to `winget` from an Action (from memory).
- [Crashpad](https://chromium.googlesource.com/crashpad/crashpad) — minidumps from the plugin worker and the scanner, the two processes that are *supposed* to crash; symbolicate with `dump_syms`. Self-hosted receivers exist ([GlitchTip](https://glitchtip.com/), Sentry's own).
- [Aptabase](https://aptabase.com/) — opt-in, privacy-first analytics for desktop apps, open source (from memory: Apache/AGPL; check). Only the coverage question "which profiles do people actually load" needs it.
- [Weblate](https://weblate.org/) — free hosting for libre projects, git-native, opens PRs. There is no translation system at all today; when there is, this is where the strings go.
- [Starlight](https://starlight.astro.build/) or [VitePress](https://vitepress.dev/) — a docs site with built-in search; `docs/` is thirty markdown files and an `api-explorer.html` with no navigation between them.
- [Patchstorage](https://patchstorage.com/docs/) — the community patch platform with a public API and a "request a platform" process; VCV, Cardinal, TouchOSC and Eventide live there. The cheapest possible "share a panel" backend, and the community is already on it.
- [Freesound](https://freesound.org/) — CC audio with an API and Essentia-powered similarity; relevant only if the sound library grows samples.

---

## 10. The tablet, and remote control

`product-ideas.md` §1 sizes the remote panel as a WebSocket replacement for one bridge object plus a
small web server. The pieces:

- [cpp-httplib](https://github.com/yhirose/cpp-httplib) — single-header HTTP/HTTPS server *and* RFC 6455 WebSocket, MIT (verified). Explicitly "small- to mid-scale"; a tablet or two is that.
- [mjansson/mdns](https://github.com/mjansson/mdns) — public-domain, single-file mDNS/DNS-SD in C, no allocations (verified). The tablet finds the PC by name instead of by IP.
- [Open Stage Control](https://github.com/jean-emmanuel/open-stage-control) — GPLv3 (verified), Electron server, any browser as client, bidirectional OSC and MIDI. It is the product the tablet idea most resembles; its pairing, reconnection and touch-target decisions are all made and documented.
- [rtpmidid / librtpmidid](https://github.com/davidmoreno/rtpmidid) — RTP-MIDI (AppleMIDI), LGPL 2.1 (verified). Only if the remote should carry *MIDI* rather than UI state, which §1 argues it should not.

---

## 11. Hearing the synth — measurement

`SonicProbe.h` measures brightness, attack, tail, width, noisiness and dynamics from audio. The
libraries that do more of that:

- [Essentia](https://github.com/MTG/essentia) — the MTG's C++ MIR library: spectral, temporal, tonal and high-level descriptors, AGPLv3 (verified). Same licence as this repo, so it can be linked outright. Heavy; a build-time option, not a default.
- [Gist](https://github.com/adamstark/Gist) — a small C++ real-time analysis library: centroid, flatness, crest, MFCC, onsets. GPLv3 (verified). Closer to `SonicProbe`'s size.
- [aubio](https://aubio.org/) — pitch, onset, tempo, MFCC in C, GPL (from memory). Pitch tracking is the piece `SonicProbe` lacks and "velocity calibration by playing" wants.
- [Meyda](https://github.com/meyda/meyda) — the same features in JavaScript over Web Audio (MIT, from memory). For the browser-only mode.
- [FluCoMa](https://www.flucoma.org/) — corpus manipulation: descriptors, dimensionality reduction, nearest-neighbour over sound banks, in C++ with Max/SC/Pd/CLI front ends. Its *pipeline* (analyse, reduce, neighbour, map) is Timbre Space; `flucoma-core` is BSD-3 (verified).

---

## 12. Community models worth copying

- [norns.community](https://norns.community/) — every script is a git repository; contributors add one JSON entry by pull request and it appears on the site. This is the panel catalogue with the least infrastructure it could possibly have.
- [Mutable Instruments' alternative-firmware catalogue](https://github.com/timchurches/Mutable-Instruments-alternative-firmware-catalogue) and [Deluge Community](https://delugecommunity.com/) — what happens after a hardware company open-sources: a catalogue, a Patreon fund distributed to contributors, and a Discourse. Both are recent and both worked.
- Ctrlr's GitHub Discussions, [KnobKraft's Gearspace thread](https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/1332629-knobkraft-open-source-easy-extensible-sysex-librarian.html) and Edisyn's issues are where the people who own the hardware — and have written the profiles once already — actually are. A profile-conversion tool is also an introduction.

---

## The shortlist (first pass)

Kept as written, so the revision below can be argued with. The [second pass](#second-pass) changes
the top of it.

1. **Convert Edisyn and KnobKraft into DPD profiles.** Two importers, a hundred-plus profiles, both licences compatible.
2. **Dexed as a CI device.** No ROMs, full SysEx, runs headless on the box `CLAUDE.md` already describes.
3. **MIDI2.0Workbench as the MIDI-CI counterpart.**
4. **DSEG and the public-domain u8g2 groups.**
5. **SignPath.**
6. **regl-scatterplot plus umap-js under Constellation and Timbre Space.**
7. **Real Ctrlr panels for the importer's first run** — with the authors asked before anything ships.
8. **Surge tuning-library and MTS-ESP.**
9. **pluginval in the export pipeline.**
10. **Strudel's mini-notation in the phrase sequencer.**

---

## Second pass

Same day, different method. With no search budget left, this pass queried the GitHub search API
directly (by keyword, by manufacturer, by language and by topic), the npm registry, crates.io and
GitLab, read the "awesome" lists (awesome-juce, awesome-audio-dsp, awesome-musicdsp, awesome-osc,
OpenAudio, awesome-music, SpotlightKid's list), and read the licence files of everything the first
pass had marked *check*. Codeberg, midi2.dev, soundprogramming.net and the Linux Audio wiki are
blocked by the network proxy and were not reached; Strudel's home is on Codeberg, so it was read
through its npm package instead.

### S1. One corpus is bigger than all the others together

[**roomi-fields/osc-bridge**](https://github.com/roomi-fields/osc-bridge) — GPL-3.0-or-later
(verified) — carries **849 device drivers as JSON**, one file per device under
`devices/<vendor>/<model>.json`, across 140-plus vendor directories. Roland alone has 72 files
(D-50, D-550, JX-8P, JX-3P with the Kiwi and Tauntek retrofits, JV-1080 as a 114-command patch
editor, XV-5080, the whole Boutique and AIRA lines, SH-4d, TR-8S); Yamaha 37 (DX7, DX7II, TX7,
TX802, TX81Z, FS1R, TG33, TG77, AN1x, FB-01, the reface family, Montage M, SEQTRAK); Korg 52
(M1, DW-8000, EX-8000, MS2000, microKORG, minilogue/monologue/prologue, opsix, wavestate, the
volcas, NTS-1/3, Kronos). A driver file has `device`, a `sysex` header/footer, `cc_params` (CC or
NRPN with a range) and `commands` (a SysEx `frame` with `{val}`, `{function}` and `{checksum}`
placeholders), plus `_sources`, `_limitations` and `_coverage` blocks. Two JV-1080 entries, verbatim:

```json
"/sync":          { "frame": [65, "{function}", 106, 18, 0, 0, 0, 12, "{val}", "{checksum}"] }
"/default_tempo": { "frame": [65, "{function}", 106, 18, 3, 0, 0, 44, "{function}", "{function}", "{checksum}"] }
```

That is a Roland DT1 with its address bytes and checksum written down — the same thing
`compileSysex` produces — and the format maps onto a DPD profile almost field for field.

**Now the awkward part, which is real.** The README marks provenance per driver, and the two files
read here both say *"imported from an Electra One community preset"*, with the author's name and
the preset id. Most of the corpus is that: community presets from the Electra One library plus
`pencilresearch` (midi.guide) CSVs, converted. The repository licenses the whole under GPL-3.0, and
says it inherits GPL obligations from `sysex-controls`, but the preset authors' terms are not stated
anywhere in the files. The *facts* (which byte sets which parameter) are not copyrightable; the
*selection and labelling* of a 114-parameter layout arguably is. The same question the Ctrlr archive
raised, at ten times the scale. A converter is still worth writing, because the corpus is the fastest
way to get to a first draft of several hundred profiles, but each profile should carry the source
preset's author and id through into its own metadata, and the Electra One community should be told.
Also note `_limitations: untested on hardware` on both files read: this is a *draft* corpus, not a
verified one, and the DPD's `completeness` field is exactly the right place to say so.

Two smaller corpora in the same spirit:

- [**jazz-soft/JZZ-midi-Gear**](https://github.com/jazz-soft/JZZ-midi-Gear) — the npm package `jzz-midi-gear` maps Identity Reply SysEx to vendor, model and category from two text files, about 200 devices, Roland-heavy (~120), then Yamaha (~40), Korg, BOSS and boutique makers. This is the lookup table `matchIdentityReply` does not have. JZZ is MIT; the data files' licence line was not found (check).
- [**pencilresearch/midi**](https://github.com/pencilresearch/midi) — the CSVs behind midi.guide, with `template.csv` for CC/NRPN and `template.triggers.csv` for notes, contributions by pull request or email. CC BY-SA 4.0 per the site.

### S2. Corrections to the first pass

- **Edisyn** covers a hundred-plus models, not sixty; the table in §1.1 now lists them.
- **KnobKraft** also lists 100-plus synths (Access to Zoom). Its [adaptation guide](https://github.com/christofmuc/KnobKraft-orm/blob/master/docs/programming-guide.md) is effectively a specification of the dump layer: `createDeviceDetectMessage` / `channelIfValidDeviceResponse`, `createEditBufferRequest` / `isEditBufferDump` / `convertToEditBuffer`, `createProgramDumpRequest` / `isSingleProgramDump` / `numberFromDump`, `createBankDumpRequest` / `isPartOfBankDump` / `extractPatchesFromBank`, `nameFromDump` / `renamePatch`, `calculateFingerprint`, `numberOfLayers` / `layerName`, `generalMessageDelay` / `messageTimings` / `expectsUploadReply`, `loadPatchesFromLegacyData`. That list is a checklist for what a DPD `dumps` block should be able to express; three of those (handshake timings, upload replies, legacy file formats) it may not.
- **bipluk** is GPLv3 (verified), 110-plus synths, and each `sysex_adapters/` entry records manufacturer and model id, name offsets, the 7-bit unpacking scheme, the checksum rule, *and a raw `.syx` from real hardware as test data*. Those test dumps are the fixtures the DPD parser has never had.
- **Ctrlr panels.** The official archive is [RomanKubiak/Panels](https://github.com/RomanKubiak/Panels) (a `DEMO` folder and per-contributor folders, no licence file). `unityconstruct/CtrlrPanels` is BSD-3 (verified). Others with licences: [keinstein/ctrlrpanels](https://github.com/keinstein/ctrlrpanels) GPLv3, [FRDTom/TR-Rack-Editor](https://github.com/FRDTom/TR-Rack-Editor) GPLv3, [ngeiswei/ctrlr-roland-a30-panel](https://github.com/ngeiswei/ctrlr-roland-a30-panel) GPLv3, [eokuwwy/juno-66-ctrlr-panel](https://github.com/eokuwwy/juno-66-ctrlr-panel) MIT, [dnaldoog/CtrlrDemoPanels](https://github.com/dnaldoog/CtrlrDemoPanels) BSD-3 (a how-to archive), [sgorpi/sgorpi_CtrlrX_panels](https://github.com/sgorpi/sgorpi_CtrlrX_panels) GPLv2. Unlicensed but public: Roland Boutique, D-20, Kawai K1, Lexicon MPX100, Yamaha PLG100-SG, Hughes & Kettner. The licensed ones are the importer's first test set.
- **`.midnam`** has a corpus after all: [lacojim/Ardour-MIDI-Patch-Files](https://github.com/lacojim/Ardour-MIDI-Patch-Files) is 202 files converted from Cakewalk `.ins` by a Tcl script (licence unstated), and [midnamaker](https://github.com/MichaelGJennings/midnamaker) is a browser editor for `.midnam`/`.middev` with WebMIDI auditioning. [Schmitty2005/SY85-Sysex-to-Midnam](https://github.com/Schmitty2005/SY85-Sysex-to-Midnam) is the one-off that shows the pattern.
- **Licences resolved** (all verified from the file): VST3 SDK MIT; Gist GPLv3; FluCoMa core BSD-3; Bigglesworth GPLv2; SoundPalette MPL-2.0; matriarch-editor CC0; jv1080-sysex-manager MIT; midi-db CC BY-SA 4.0; Gearmulator GPLv3; spessasynth Apache 2.0; signal MIT; Woyten/tune MIT; osc-bridge GPL-3.0. Still unread: Nuked-SC55 (no `LICENSE` at either branch name tried), patch-base-synths (README says "email to contribute", no licence), midi-manufacturers (no licence file), JZZ-midi-Gear data.

### S3. The manufacturer sweep the first pass did not finish

Everything below is a working open-source SysEx implementation for a device CEditor has no profile
for. Licence from the repository's own metadata where it declares one.

| Maker | Projects |
|---|---|
| Korg | [m4l-microkorg-editor](https://github.com/p3r7/m4l-microkorg-editor) MIT (bidirectional), [NEW_microKORG_Program_Decoder](https://github.com/frgonzalezb/NEW_microKORG_Program_Decoder) MIT, [monologue-extract](https://github.com/Windfisch/monologue-extract) MIT, `@julzelements/monologue-midi` (npm, CC + SysEx codec), [minilogue-editor](https://github.com/jeffkistler/minilogue-editor) (React + WebMIDI), `minilogue-xd` (Rust crate, the full MIDI implementation), [volcafm2-tools](https://github.com/mosynthkey/volcafm2-tools) MIT (volca fm2 → DX7 SysEx), [microsampler-editor-librarian](https://github.com/benjamindehli/microsampler-editor-librarian) GPLv3, [e2-scripts](https://github.com/bangcorrupt/e2-scripts) AGPL (electribe 2), [KORG_Read_DS8syx](https://github.com/OlimilO1402/KORG_Read_DS8syx) GPLv3, [Korg-DW6000-editor](https://github.com/craigyjp/Korg-DW6000-editor), Christof Ruch's DW8000 converters (AGPL), [nts-web](https://github.com/oscarrc/nts-web) MIT (NTS-1), [kronut](https://github.com/jimm/kronut) (Kronos set lists) |
| Roland | [JDTools](https://github.com/sagamusix/JDTools) (JD-800/JD-990 patch conversion, 72 stars), [sysex-mapatron](https://github.com/asutherland/sysex-mapatron) Apache 2.0 — *derives* SysEx maps for ZenCore synths (Jupiter-X, Juno-X, Fantom) by probing, which is `midi-frontier.md` §3.2 "the address-space probe" already written, [roland-sysex.js](https://github.com/motiz88/roland-sysex.js) MIT, [SC-88-Pro-Toolkit](https://github.com/FlashlightET/SC-88-Pro-Toolkit) WTFPL, [sc88sysex](https://github.com/pedrolcl/sc88sysex) GPLv3, [TR-8S-SysEx](https://github.com/compuphonic/TR-8S-SysEx), [tr8s-studio](https://github.com/ideaCompany/tr8s-studio), [S1Utility](https://github.com/denzlobin/S1Utility) GPLv3 (AIRA S-1), [RolandFP30xController](https://github.com/aortegaCampanillas/RolandFP30xController) MIT, [Roland-SE-02-SYSEX-controller](https://github.com/PeZiK73/Roland-SE-02-SYSEX-controller) (with a reverse-engineering whitepaper), [D50SysexBinConverter](https://github.com/wonst719/D50SysexBinConverter) MIT, [RoMi](https://github.com/DrHardReset/RoMi) GPLv3, [fsex](https://github.com/cmatsuoka/fsex) (Fantom S/X, Juno-G), [jamrouter](https://github.com/williamweston/jamrouter) (Juno-106 SysEx translator) |
| Yamaha | [Sysex77](https://github.com/nseaSeb/Sysex77) (SY77/TG77/SY99, JUCE), [dxsyx](https://github.com/rogerallen/dxsyx) GPLv3 (DX7 C++), [DX7Dump](https://github.com/francoiswnel/DX7Dump) GPLv3, [dvisti](https://github.com/duvha/dvisti) GPLv3 (DX range editor), [dxwire](https://github.com/alexferl/dxwire) MIT (web DX7 editor), `dxex` (npm, DX SysEx create/parse), `dx7-patches` (npm, the classic bank as JSON), [MDX_Tool](https://github.com/BobanSpasic/MDX_Tool) (DX7 and 4-op repair), [XFM](https://github.com/wrightflyer/XFM) Apache 2.0 (Sonicware Liven XFM), [cp-liveset](https://github.com/michiel-dewilde/cp-liveset) MIT (CP88/CP73), [fs1r-wav2syx](https://github.com/quadratschulz/fs1r-wav2syx) MIT and [fs1r-live](https://github.com/tekfunk/fs1r-live), [portasound-js](https://github.com/mmontag/portasound-js), [motif-rack-xs-editor](https://github.com/CommmandrCody/motif-rack-xs-editor) (C++, VST3), [qy100-toolkit](https://github.com/afbecerra7-netizen/qy100-toolkit), [MidiKraft-yamaha-refacedx](https://github.com/christofmuc/MidiKraft-yamaha-refacedx) AGPL |
| Arturia | [microdude](https://github.com/dagargo/microdude) GPLv3 (MicroBrute editor, by the Elektroid author), [mf-utils](https://github.com/dcower/mf-utils) MIT and [microfreak-reader](https://github.com/francoisgeorgy/microfreak-reader) and [managefreak](https://github.com/GiovanniBitbyBit/managefreak) GPLv3 (MicroFreak), [keylab-essential-mk3-accessible-editor](https://github.com/aefren/keylab-essential-mk3-accessible-editor) MIT — a *screen-reader* editor, which is the accessibility argument made by somebody who needed it |
| Novation | [circuit_samples](https://github.com/mungewell/circuit_samples) GPLv2, [NovationCircuitTracksPatchEditor](https://github.com/0mandrock1/NovationCircuitTracksPatchEditor) MIT (tested SysEx codec) and its browser sibling, [xkey](https://github.com/darkarnium/xkey) AGPL (Launchkey/FLKey), [NovationSLmk3-SysEx](https://github.com/cbradburne/NovationSLmk3-SysEx) CC0 (the SL mk3 *display* protocol — a screen-builder target like the CTRL49), `ncc` (Rust, a compiler for Novation custom modes), [launchkey-sdk](https://github.com/bornacvitanic/launchkey-sdk) MIT |
| Elektron | [libanalogrytm](https://github.com/bsp2/libanalogrytm) MIT (portable C SysEx library, 71 stars) and `rytm-rs`, [libdigitone](https://github.com/d-huck/libdigitone) MIT, [elektron-analog-four-sound-sysex](https://github.com/kimasendorf/elektron-analog-four-sound-sysex) (byte tables), [syxgrid-digitone-ii](https://github.com/xrcstrecords/syxgrid-digitone-ii) AGPL, [elektron-sysex-processor](https://github.com/rmoetwil/elektron-sysex-processor) MIT, [Elektroid](https://github.com/dagargo/elektroid) |
| Kawai | `ksynth` (Rust, "patch manipulation for Kawai digital synths", by the k5ktools author), [k4edit](https://gitlab.com/schessman/k4edit) (Rust/Slint K4 editor and librarian, GitLab) |
| Kurzweil | [psobot/k2000](https://github.com/psobot/k2000) MIT |
| Akai | [aksy](https://github.com/watzo/aksy) (Python, samplers over USB), [s3ked](https://github.com/lentferj/s3ked), [AKAISDS](https://github.com/martincurkovic/AKAISDS), [ewi-usb-config-cli](https://github.com/SpotlightKid/ewi-usb-config-cli) MIT, [MPK249](https://github.com/dobemad/MPK249), [MPC-Studio-Mk2-Midi-Sysex-Charts](https://github.com/bcrowe306/MPC-Studio-Mk2-Midi-Sysex-Charts) |
| Casio | [VZenit](https://github.com/innerrecess/VZenit) (Swift, VZ-1/VZ-10M/VZ-8M), [ajwills72/cz101](https://github.com/ajwills72/cz101) |
| E-mu, Ensoniq, Alesis | [eosed](https://github.com/lentferj/eosed) (E-mu EOS samplers, terminal), [EnsoniqEPS16Plus](https://github.com/summitt/EnsoniqEPS16Plus), [midiverb3](https://github.com/violet-black/midiverb3) MIT, [Ensoniq-ESQ-M-Cartridge-Dumps](https://github.com/livvy94/Ensoniq-ESQ-M-Cartridge-Dumps) |
| Access, Clavia | [virusc-max-midi-editor](https://gitlab.com/npes/virusc-max-midi-editor) (GitLab), [nord-lead-viewer](https://github.com/larme/nord-lead-viewer), [g2-webeditor](https://github.com/ty-art-ty/g2-webeditor) (browser SPA over a headless Java/USB bridge — the tablet idea, built for one synth) |
| Waldorf | [wave2blofeld](https://github.com/clrnd/wave2blofeld) Apache 2.0, [WaldorfRocketController](https://github.com/OceanSwift/WaldorfRocketController) |
| Deluge, Dirtywave | [cyface/deluge-editor](https://github.com/cyface/deluge-editor) MIT — **Svelte 5 + Web MIDI SysEx**, the closest thing to CEditor's stack found anywhere; [deluge-extensions](https://github.com/silicakes/deluge-extensions) MIT (the Deluge's SysEx/USB feature layer, 50 stars); [awesome-m8](https://github.com/v3rm0n/awesome-m8) |
| Pedals and amps | [mercury7-web-editor](https://github.com/francoisgeorgy/mercury7-web-editor) and [enzo-web-editor](https://github.com/francoisgeorgy/enzo-web-editor) GPLv3 (Meris), [valeton-gp50](https://github.com/drewmerc302/valeton-gp50) MIT, [fcbtool](https://github.com/trafficpest/fcbtool) MIT (FCB1010), [FreeMajor](https://github.com/linuxmao-org/FreeMajor) BSL-1.0 (TC G-Major), [g1on](https://github.com/SysExTones/g1on) AGPL (Zoom), `fractal-midi` (npm, TypeScript codec for Axe-Fx/FM3/FM9), [fm3-cli](https://gitlab.com/biblesword/fm3-cli), [Kemper-Live-Companion](https://github.com/edmei014/Kemper-Live-Companion), [mvave-blackbox-edit](https://github.com/jvsobrinho/mvave-blackbox-edit) MIT (Web *Bluetooth*), [midiverb3](https://github.com/violet-black/midiverb3) MIT |
| Controllers | [sysex-controls](https://github.com/soyersoyer/sysex-controls) GPLv3 (154 stars; Akai MPK mini, Arturia BeatStep/KeyStep/KeyLab/MiniLab, Korg nano series, Moog Matriarch — device *settings* over SysEx, Libadwaita), [mft-editor](https://github.com/BrettKinny/mft-editor) LGPL-3 (MIDI Fighter Twister, **Svelte**), `pmtc` and `mft-config` (npm), [Freepad](https://github.com/GeoDF/Freepad) GPLv3 (LPD8), [kenton-freak-studio](https://github.com/kerouanton/kenton-freak-studio) GPLv3, [BCR2000_Master](https://github.com/christofmuc/BCR2000_Master), `@misofm/control-surface` (npm, typed control-surface drivers over Web MIDI) |
| Misc. hardware | [orba-protocol](https://github.com/holofermes/orba-protocol), [blocksd](https://github.com/hyperb1iss/blocksd) ISC (ROLI Blocks topology and LEDs), [iconnectivity-js](https://github.com/leolabs/iconnectivity-js) (interface routing), [reveng-mutantbrain](https://github.com/noriah/reveng-mutantbrain), `exquis-midi` (npm, MPE controller) |

Two general-purpose tools from the same sweep: [sysexxer-ng](https://github.com/linuxmao-org/sysexxer-ng)
(BSL-1.0, "a universal tool to exchange MIDI system-exclusive data") and
[sysex-drop](https://github.com/sourcebox/sysex-drop) (MIT, drag-and-drop SysEx sender) are the two
small things people reach for when a librarian is too much; CEditor's monitor could absorb both.

### S4. More devices that answer back

- [**Gearmulator**](https://github.com/dsp56300/gearmulator) — GPLv3 (verified). DSP56300 emulation of the Access Virus A/B/C and TI, Waldorf microQ and Microwave II/XT, Clavia Nord Lead 2/2X, Roland JP-8000 and the Sound Canvas family. Needs the original ROMs, which is the same caveat as munt. Whether it accepts each synth's native SysEx patch format was not confirmed; discoDSP's commercial Retromulator, built on it, advertises loading Virus and Nord Lead SysEx, which suggests the layer is there.
- [**Octavia**](https://github.com/ltgcgo/octavia) — LGPL-3 (verified), browser JavaScript, "event-driven multi-standard MIDI tool chain" with *state tracking* for MT-32, GM, GS, XG and GM2 and their plug-in boards. Not a synth: a model of what a GS or XG module's state *is* after a stream of messages. That is the shadow state `midi-frontier.md` §1.2 wants for drift detection, already written for the one family of devices whose SysEx is fully public — and it runs in the same JavaScript the panel does.
- [**spessasynth**](https://github.com/spessasus/spessasynth_core) — Apache 2.0 (verified). A SoundFont2/DLS synthesiser in JavaScript with a MIDI implementation. A General MIDI *device* for the browser-only mode at `localhost:5173`, which today has no sound at all.
- [**moont**](https://gitlab.gnome.org/geoffhill/moont) — a CM-32L in Rust, on GitLab; listed for completeness next to munt.

### S5. Libraries the first pass missed

- [**Woyten/tune**](https://github.com/Woyten/tune) — MIT (verified), Rust. Scala `.scl`/`.kbm`, *and a generator for the MTS SysEx messages themselves*: Single Note Tuning Change, Scale/Octave Tuning in both forms, plus MOS-based isomorphic keyboard layouts. [scala2mts](https://github.com/unremarkablegarden/scala2mts) (GPLv3) does the narrow version for the Prophet Rev2 and the Cirklon. Between them and Surge's library, every tuning message a hardware synth understands is already encoded somewhere.
- [**helgoboss-learn**](https://github.com/helgoboss/helgoboss-learn) — the DAW-agnostic MIDI-learn model extracted from ReaLearn, in Rust: sources, modes, relative-encoder encodings, takeover. Not on crates.io yet and the licence was not stated; the *design* (`midi-pickup.md` covers the same ground) is the reference.
- [**JZZ**](https://github.com/jazz-soft/JZZ), [**midi-test**](https://github.com/jazz-soft/midi-test) and [**web-midi-test**](https://github.com/jazz-soft/web-midi-test) — all MIT, all by the same author. `web-midi-test` is a *fake Web MIDI API* for test runners: the Playwright `browser-checks/` could drive real MIDI paths through a mock port with no hardware and no ALSA. `midi-test` does the same for Node.
- [**MidiExplorer**](https://github.com/EMATech/MidiExplorer) — GPL-3.0-or-later, Python: monitor, analyser and SysEx decoder with manufacturer identification, aiming at MIDI 2.0. A reference for what the monitor's SysEx column should decode.
- [**midimonster**](https://github.com/cbdevnet/midimonster) — a translation hub between MIDI, OSC, ArtNet, sACN and others; [**Birdhouse**](https://github.com/madskjeldgaard/Birdhouse) — an OSC-to-MIDI bridge as VST/CLAP/standalone (JUCE). The OSC end of the tablet idea, twice.
- [**LinkBridge**](https://github.com/Benceking24/LinkBridge) MIT and [**x42/jack_midi_clock**](https://github.com/x42/jack_midi_clock) — Ableton Link to MIDI DIN clock, and JACK transport to MIDI clock. Small, and the second is by the person who wrote most of Ardour's MIDI clock handling.
- MIDI effects with a JUCE pedigree, for the modular chain: [QMidiArp](https://github.com/emuse/qmidiarp) (arp, sequencer and MIDI LFO in one), [ripchord](https://github.com/trackbout/ripchord) (chord progressions), [stochas](https://github.com/surge-synthesizer/stochas) (probabilistic polyrhythmic sequencer), [b-step](https://github.com/surge-synthesizer/b-step) (chord sequencer), [LibreArp](https://gitlab.com/LibreArp/LibreArp), [Topiary](https://github.com/tomto66/Topiary-Beatz) (drum patterns, riffs, preset variations), [Midi-Transposer](https://github.com/stfufane/Midi-Transposer) (chords from a bass pedal), [polyrhythmix](https://github.com/dredozubov/polyrhythmix) (drum generator), [mididings](https://github.com/mididings/mididings) (a Python MIDI router that is the reference for "rules engine").
- Audio to MIDI: [**basic-pitch**](https://github.com/spotify/basic-pitch) (Apache 2.0, Spotify) and [**NeuralNote**](https://github.com/DamRsn/NeuralNote) (Apache 2.0, a JUCE plugin around it). "Velocity calibration by playing" and "Sonic Capture" both need to know what note the hardware played; these do that from the exported plugin's audio input.
- Sequencer UI: [**signal**](https://github.com/ryohey/signal) — MIT (verified), TypeScript, an online MIDI editor with a piano roll; [efflux-tracker](https://github.com/igorski/efflux-tracker) MIT. If the phrase sequencer ever needs a piano roll, signal's is the one to read.
- Rust, since the crate search was cheap: `midi2` (midi2-dev's own MIDI 2.0 message types), `midi-msg` (complete MIDI 1.0), `midir`, `sim-lib-midi-sysex` (checksums and device payload helpers), `midilab` (SysEx controller programming), `phosphor` (a terminal DAW). None is a dependency for a C++/JS project; all are readable specifications.

### S6. Svelte and the web side

- [**cyface/deluge-editor**](https://github.com/cyface/deluge-editor) — Svelte 5, Web MIDI, SysEx, MIT. The only project found that is the same stack as CEditor's panel. Read its SysEx-over-Web-MIDI code before writing the browser-mode bridge.
- [**mochreach/midi-surf**](https://github.com/mochreach/midi-surf) — a browser MIDI controller as an installable PWA for tablets and phones: buttons, faders, isomorphic and chord keyboards, presets shared as links, automatic parameter detection. Licence unstated. It is the tablet idea's *client* as somebody else shipped it.
- [**conormkelly/reamo**](https://github.com/conormkelly/reamo) — MIT. A phone/tablet remote for REAPER: WebSocket server (in Zig), React client, **QR-code pairing**, and the honest latency note that USB tethering beats Wi-Fi for touch instruments. The pairing and transport decisions `product-ideas.md` §1 leaves open are made here.
- npm packages worth a look: `@xyflow/svelte` (node-graph UI, for the modular MIDI chain), `vanilla-jsoneditor` / `svelte-jsoneditor` (for the API tab's JSON), `svelte-highlight`, `@svelte-put/shortcut`, `svelte-floating-ui`, `svelte-sonner`, `@svar-ui/svelte-menu`, `midiwire` (declarative browser MIDI), `midi-ports` (typed Web MIDI ports by name), `kommidi` (pipeline-style MIDI processing in TypeScript), `@wcstack/midi` (declarative Web MIDI as a web component). Svelte-specific *audio* widgets, by contrast, barely exist on npm; the knob and slider components in the tree are not reinventing something available.

### S7. JUCE-side additions (from awesome-juce)

- [**nectar**](https://github.com/blackboxaudio/nectar) — MIT, framework-agnostic TypeScript wrapper over JUCE's WebView JavaScript: a `Result` type, a global event manager, typed Boolean/Choice/Float parameter bindings. The `bridge.js` file is CEditor's own version of this; compare.
- [**juce-end-to-end**](https://github.com/FocusriteGroup/juce-end-to-end) (Focusrite) — end-to-end functional testing of JUCE apps *driven from JavaScript*; [**straw**](https://github.com/kunitoki/straw) — a JUCE automation framework for integration tests. The native side has no equivalent of `browser-checks/` today.
- [**Gin**](https://github.com/FigBug/Gin) has a WebSockets module; [**juce_bluetooth**](https://github.com/genkiinstruments/juce_bluetooth) is BLE for macOS and Windows (BLE MIDI); [**juce_serialport**](https://github.com/cpr2323/juce_serialport) for serial MIDI; [**juce-utils**](https://github.com/christofmuc/juce-utils) is Christof Ruch's MIDI and i18n helpers; [**cello**](https://github.com/bgporter/cello) is "ValueTrees for humans"; [**JIVE**](https://github.com/ImJimmi/JIVE) builds JUCE GUIs from declarative markup.
- [**Chataigne**](https://github.com/benkuper/Chataigne) — a JUCE application whose whole purpose is routing and mapping between MIDI, OSC, DMX, serial and more, with a module and mapping model that has been used on stage for years. The modular MIDI chain's closest living relative.
- [**yup**](https://github.com/kunitoki/yup) — a permissively licensed JUCE 7 fork with a modern renderer; [**juce_emscripten**](https://github.com/Casperaki/juce_emscripten) — JUCE in the browser. Neither is a plan; both are options if the JUCE licence question ever bites.
- [**popsicle**](https://github.com/kunitoki/popsicle) bridges JUCE to Python, which is a different answer to "Python panels" than embedding an interpreter.

### S8. Sound analysis additions

[**librosa.cpp**](https://github.com/olilarkin/librosa.cpp) (a C++ port of librosa with WASM and Swift
packages) and [**audioFlux**](https://github.com/libAudioFlux/audioFlux) (MIT, built for deep-learning
features) sit between Gist and Essentia in size and in licence. [**pitch_detector**](https://github.com/adamski/pitch_detector)
is a YIN pitch estimator as a JUCE module.

### The shortlist, revised

1. **A converter from the osc-bridge corpus** — 849 draft profiles, GPL-compatible, with provenance to carry through and a `completeness: draft` to be honest about. Followed immediately by the Edisyn and KnobKraft converters, which are the *verified* layer over the same synths.
2. **Dexed as a CI device**, now with **bipluk's real-hardware `.syx` fixtures** as the parser's test set and **Octavia** as the GS/XG shadow-state model.
3. **web-midi-test in `browser-checks/`** — real MIDI paths under Playwright with no hardware, today.
4. **MIDI2.0Workbench** for M1.
5. **JZZ-midi-Gear's identity table** behind `matchIdentityReply`.
6. **DSEG plus the public-domain u8g2 groups.**
7. **SignPath.**
8. **regl-scatterplot and umap-js.**
9. **The licensed Ctrlr panels** (BSD, MIT, GPL ones first) for the importer.
10. **Woyten/tune's MTS generator, Surge's tuning library and MTS-ESP** together, and **cyface/deluge-editor** as the reference before any Web MIDI SysEx is written for browser mode.

### Still unchecked after two passes

The licence of the JZZ-midi-Gear data files, of Nuked-SC55, of patch-base-synths and of
midi-manufacturers; whether Gearmulator accepts each synth's native SysEx; the terms the Electra One
community presets were shared under, which decides how much of the osc-bridge corpus can be
redistributed rather than merely learned from; and everything on Codeberg, midi2.dev and the Linux
Audio wiki, which the proxy would not fetch.
