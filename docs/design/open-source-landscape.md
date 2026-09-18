# The open-source landscape — what already exists that CEditor could stand on

> Status: **survey, 2026-09-18. Nothing here is built or vendored.** A companion to
> [`midi-frontier.md`](midi-frontier.md) and [`product-ideas.md`](product-ideas.md): those two say what
> this program *could* do; this one says which of it somebody else has already written, under what
> licence, and where it would land in the tree. Where a licence is marked **(verified)** it was read off
> the project's own page during this pass; **(from memory)** means it was not, and should be checked
> before anything is copied. The sweep ran out of search budget partway through a per-manufacturer pass,
> so the device-profile section is thorough for the projects that came up and silent on the ones that
> did not — an absence below is not evidence of absence.

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
| [Edisyn](https://github.com/eclab/edisyn) (Sean Luke) | Apache 2.0 (verified) | Sixty-plus synths, each a Java class that names every parameter, its range, its option labels, and the exact bytes that set it — DSI/Sequential, Kawai K1/K4/K5, E-mu Proteus and Morpheus, Yamaha FS1R, Waldorf Blofeld, Korg, Roland and more. Also patch *merging, morphing, nudging* between four patches, which `midi-frontier.md` §4.1 proposes as "patch algebra". | **Data.** The single richest source of complete, tested profiles. A converter from Edisyn's `Synth` subclasses to `.dpd.json` is a parsing job over structured Java, not a rewrite. |
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

Two things stand out. **Kurzweil never published its SysEx**, so nothing exists and nothing will;
say so in the coverage view rather than listing an empty profile. And the [Electra One](https://docs.electra.one/developers/presetformat.html)
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
- Steinberg's `validator` from the VST3 SDK — the search reported the SDK relicensed to MIT with VST 3.8.0 in October 2025; check before relying on it. Either way it is free to run in CI.
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
- [Gist](https://github.com/adamstark/Gist) — a small C++ real-time analysis library: centroid, flatness, crest, MFCC, onsets (licence: check; one fork shows GPL). Closer to `SonicProbe`'s size.
- [aubio](https://aubio.org/) — pitch, onset, tempo, MFCC in C, GPL (from memory). Pitch tracking is the piece `SonicProbe` lacks and "velocity calibration by playing" wants.
- [Meyda](https://github.com/meyda/meyda) — the same features in JavaScript over Web Audio (MIT, from memory). For the browser-only mode.
- [FluCoMa](https://www.flucoma.org/) — corpus manipulation: descriptors, dimensionality reduction, nearest-neighbour over sound banks, in C++ with Max/SC/Pd/CLI front ends. Its *pipeline* (analyse, reduce, neighbour, map) is Timbre Space; its algorithms are BSD-3 (from memory; check).

---

## 12. Community models worth copying

- [norns.community](https://norns.community/) — every script is a git repository; contributors add one JSON entry by pull request and it appears on the site. This is the panel catalogue with the least infrastructure it could possibly have.
- [Mutable Instruments' alternative-firmware catalogue](https://github.com/timchurches/Mutable-Instruments-alternative-firmware-catalogue) and [Deluge Community](https://delugecommunity.com/) — what happens after a hardware company open-sources: a catalogue, a Patreon fund distributed to contributors, and a Discourse. Both are recent and both worked.
- Ctrlr's GitHub Discussions, [KnobKraft's Gearspace thread](https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/1332629-knobkraft-open-source-easy-extensible-sysex-librarian.html) and Edisyn's issues are where the people who own the hardware — and have written the profiles once already — actually are. A profile-conversion tool is also an introduction.

---

## The shortlist

Ranked by what it buys divided by what it costs, with the same honesty as the other two records.

1. **Convert Edisyn and KnobKraft into DPD profiles.** Two importers, sixty-plus profiles, both licences compatible. Nothing else in this document moves the library from five to sixty.
2. **Dexed as a CI device.** No ROMs, full SysEx, runs headless on the box `CLAUDE.md` already describes. The first end-to-end test of the SysEx path against something that talks back.
3. **MIDI2.0Workbench as the MIDI-CI counterpart.** M1 gets exercised this week instead of when a Roland turns up.
4. **DSEG and the public-domain u8g2 groups.** An afternoon, and every display component stops looking like a web page.
5. **SignPath.** Removes "unsigned" from the release notes for the cost of a form.
6. **regl-scatterplot plus umap-js under Constellation and Timbre Space.** The map stops being bounded by the DOM.
7. **Real Ctrlr panels from the two archives, for the importer's first run** — with the authors asked before anything ships.
8. **Surge tuning-library and MTS-ESP** in place of the hand-rolled tuning core.
9. **pluginval in the export pipeline.**
10. **Strudel's mini-notation in the phrase sequencer** — the one AGPL dependency that brings a community with it.

## What this pass could not check

The search budget ended during the manufacturer sweep, so Korg (logue, volca, Kronos), Roland's
current line, Arturia, Novation Peak/Summit, ASM, UDO and the guitar-pedal world got no dedicated
pass; the entries above for those brands are incidental. Licences marked *check* were not read. The
Steinberg validator's licence, the `.ins` master collection's whereabouts and the Gearmulator
(Virus/Nord Lead emulation) project were each one search short of an answer.
