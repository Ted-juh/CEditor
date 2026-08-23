# Panel parts — what shipped, and what is still an idea

Design notes for the panel and editor: components, subsystems, capabilities and
ideas. This began as a design-only backlog and is no longer only that — twenty-eight
components have since shipped, and their notes live here beside the ideas that
never left the page. The first table is what you can actually script today; the
backlog below it is what is still design.

> **Start here:** [roadmap.md](./roadmap.md) sequences everything by dependency
> (engines → capabilities → components → features) and names the two prerequisites
> that gate the most (inbound MIDI wiring + Timer backing).

## Components you can script

Each of these is a real component with a `ce.components.*` module behind it. The
member count is what that module gives a script; the full signatures, options and
worked examples are in the [scripting manual](../../../../../docs/scripting-manual.md)
and `docs/api-explorer.html`, which also shows a screenshot of every one.

The design doc is the *why* — several were written before the component existed and
say so at the top, keeping their original notes underneath.

| Module | What it is | Members | Design doc |
|---|---|---|---|
| `ce.components.arp` | The pattern engine on top of held notes | 29 | [arpeggiator.md](./arpeggiator.md) |
| `ce.components.chordpad` | Play the synth from the panel | 21 | [chord-pad.md](./chord-pad.md) |
| `ce.components.constellation` | Your sound library as a map | 13 | [preset-constellation.md](./preset-constellation.md) |
| `ce.components.constraint` | Relationships the synth cannot express on its own | 11 | [constraint-cell.md](./constraint-cell.md) |
| `ce.components.crossfader` | A↔B blend fader with crossfade curves and a centre detent | 13 | [crossfader-component.md](./crossfader-component.md) |
| `ce.components.drumpads` | A grid of fixed-note triggers, with choke groups and corner zones | 37 | [drum-pads.md](./drum-pads.md) |
| `ce.components.envelope` | Breakpoint curves — ADSR is one preset of the family | 23 | [envelope-curve-editor.md](./envelope-curve-editor.md) |
| `ce.components.harmony` | One finger in, a full chord out | 15 | [harmoniser.md](./harmoniser.md) |
| `ce.components.joystick` | A 2D pad giving four corner blend weights | 14 | [vector-joystick-component.md](./vector-joystick-component.md) |
| `ce.components.kinetic` | Physics you fling | 12 | [kinetic-modulator.md](./kinetic-modulator.md) |
| `ce.components.lcd` | A hardware-style display: character, dot-matrix, segment, VFD, OLED | 35 | [lcd-display-component.md](./lcd-display-component.md) |
| `ce.components.looper` | Record your motion, loop it into the synth | 17 | [gesture-looper.md](./gesture-looper.md) |
| `ce.components.macro` | One knob driving many parameters | 16 | [macro-and-morph.md](./macro-and-morph.md) |
| `ce.components.matrix` | A modulation grid over the routing model | 11 | [meter-and-mod-matrix.md](./meter-and-mod-matrix.md) |
| `ce.components.meter` | A read-only display driven by an incoming value | 25 | [meter-and-mod-matrix.md](./meter-and-mod-matrix.md) |
| `ce.components.noteribbon` | A strip of pitch | 19 | [ribbon-keyboard.md](./ribbon-keyboard.md) |
| `ce.components.orbit` | A spatial poly-LFO | 20 | [orbit-modulator.md](./orbit-modulator.md) |
| `ce.components.panic` | Silence everything | 9 | [panic.md](./panic.md) |
| `ce.components.phrase` | A step grid whose rows are scale degrees | 9 | [phrase-sequencer.md](./phrase-sequencer.md) |
| `ce.components.pixel` | A pixel display driven from a script | 19 | — *(shipped without one)* |
| `ce.components.recorder` | The note twin of the Gesture Looper | 15 | [phrase-recorder.md](./phrase-recorder.md) |
| `ce.components.ribbon` | A 1D touch strip: jump on press, spring return | 14 | [ribbon-component.md](./ribbon-component.md) |
| `ce.components.router` | Make any incoming signal feel bespoke | 21 | [expression-router.md](./expression-router.md) |
| `ce.components.setlist` | Scenes on a footswitch | 7 | [setlist.md](./setlist.md) |
| `ce.components.split` | One keyboard, several synths | 6 | [zone-splitter.md](./zone-splitter.md) |
| `ce.components.timbre` | Control a synth by meaning | 15 | [timbre-space.md](./timbre-space.md) |
| `ce.components.transport` | The master clock | 15 | [transport.md](./transport.md) |
| `ce.components.turing` | A stepped sequence you lock or let evolve | 16 | [turing-modulator.md](./turing-modulator.md) |

## Status legend

| Mark | Meaning |
|------|---------|
| 💡 | Idea — captured, not yet designed in depth |
| 📝 | Designing — has a design doc being fleshed out |
| 🟡 | Partially exists — some support already in the codebase |
| 🔵 | In progress — implementation started |
| 🟢 | Implemented |

## Backlog

| Part | Type | Status | Summary | Doc |
|------|------|--------|---------|-----|
| LCD Display | Component | 🟢 shipped | Ready-made-but-flexible hardware display (character / dot-matrix / segment / VFD / OLED), MIDI text+graphics I/O, device-bound fields, scriptable internals. | [lcd-display-component.md](./lcd-display-component.md) |
| Timer System | Subsystem | 🔵 implemented (unbuilt) | A `TimerManager` on top of `juce::Timer` backing `startTimer`/`stopTimer`/`onTimer` — repeating, fixed-rate, message-thread. Wired into the Player runtime (JS+Lua engines). ⚠️ Code written, not compiled/tested. Additive commands + serialization still TODO. | [timer-system.md](./timer-system.md) |
| Scripting Runtime gaps | Findings | 🔵 partly wired | Inbound `onParameterReceived`/`onMidiIn`/`onCcIn`/`onSysexIn` + `onTimer` now dispatched in the Player runtime (code written, unverified by build). Device-connect + editor-preview parity still open. | [scripting-runtime-gaps.md](./scripting-runtime-gaps.md) |
| JUCE capabilities | Survey | 💡 backlog | Broad sweep of JUCE classes/modules a no-audio MIDI editor could use (OSC, MIDI 2.0/UMP, Bluetooth MIDI, ThreadPool, ZipFile, crypto, ValueTreeSynchroniser, …); most live in already-linked modules. | [juce-capabilities.md](./juce-capabilities.md) |
| Note input echo | Mechanism | 🟢 shipped | Not a component: the shared mechanism that lets every note control double as a monitor of what is arriving. | [note-input-echo.md](./note-input-echo.md) |
| Song mode | Mechanism | 🟢 shipped | A chain of patterns, shared by the Phrase Sequencer and the components that step through scenes. | [song-mode.md](./song-mode.md) |
| MIDI Workbench | Workspace | 🟡 mostly-plumbed | First-class `tabType: 'midi'` workspace, 3 tabs: Connections · Console (monitor+test+learn) · Dumps (analyzer+presets). Foundational live-MIDI session the DPD derives from. Backend (~70%) exists; gap is the unified UI. | [midi-workbench.md](./midi-workbench.md) |

| Meter & Mod Matrix | Investigation | 🟢 both shipped | Both are presets/configs over existing engines (read-only slider / Generator grid). Surfaces the two cross-cutting gaps: read-only value-driven display + multi-parameter fan-out binding. | [meter-and-mod-matrix.md](./meter-and-mod-matrix.md) |
| Envelope / Curve editor | Component | 🟢 core shipped | ADSR is one preset of a family (AR/DAHDSR/MSEG/LFO-shape/step/response curves). One breakpoint-curve engine + presets; reuse gradient-stop + flow-path editing; real lift is multi-parameter per-node binding. | [envelope-curve-editor.md](./envelope-curve-editor.md) |
| Remaining components | Components | 📝 mini-specs | Keyboard · Step Sequencer · Pitch/Mod wheel · Tabbed container · Group/Frame · Scroll area · Progress bar · Image · Shape primitives — each reusing documented engines/capabilities. Keyboard + Sequencer are the only substantial new work. | [remaining-components.md](./remaining-components.md) |
| Conventional components | Components | 🟢 all four shipped | Ribbon/touch-strip · vector joystick (4-corner morph) · drum-pad grid · crossfader — each its own `controlType` reusing slider/xy/generator engines; lean on fan-out binding + note-emit. | [conventional-components.md](./conventional-components.md) |
| Ribbon component | Component | 🟢 shipped | Thin 1D touch-to-position controller (absolute, spring-return) reusing the slider engine. New: jump-on-press + spring return (+ optional touch gate). Full what/how/where/when. | [ribbon-component.md](./ribbon-component.md) |
| Vector Joystick component | Component | 🟢 shipped | 2D pad → 4 corner blend weights (vector synthesis), reusing the XY-pad engine + shared return behavior. Flagship: snapshot-per-corner morph of the whole patch. | [vector-joystick-component.md](./vector-joystick-component.md) |
| Pad Grid component | Component | 🟢 shipped as Drum Pads | Versatile performance grid: drum / scale-locked melodic / trigger pad modes, velocity, choke groups, banks, pad-LED feedback. Reuses generator-grid + note-emit; touches all three enablers. | [pad-grid-component.md](./pad-grid-component.md) |
| Musical Context (key/scale) | Capability | 📝 design | Panel-level key + scale that chord gen / pad grid / keyboard / arp read, re-harmonizing together; local override allowed. Scale library + helpers. | [musical-context.md](./musical-context.md) |
| Blend / Morph | Capability | 📝 note | position→weights→targets; mostly a small weight helper + the Link Mapper (params) + Snapshots (states). No separate engine. | [blend-morph.md](./blend-morph.md) |
| Return-to-Rest behavior | Capability | 📝 design | Shared spring-back on release (returnMode/value/time/curve) over Behavior + Timer. Reused by ribbon, vector joystick, pitch/mod wheel. | [return-to-rest.md](./return-to-rest.md) |
| Value-driven Display | Capability | 📝 design | Read-only / value-driven mode = the feedback direction of binding + a read-only toggle. Reuses Bindings + feedback ports; needs `onParameterReceived` wired. Unlocks Meter, LCD fields, pad LEDs. | [value-driven-display.md](./value-driven-display.md) |
| Snapshots & Morph | Capability | 📝 design | Capture/recall/interpolate full device states over the value layer, with DPD-correct interpolation + MIDI throttling. Foundation for Macro/Snapshot-Morph, vector pad, crossfader, scenes, Diff, Randomizer. | [snapshots-morph.md](./snapshots-morph.md) |
| Link Mapper / Router component | Component | 📝 design | Placeable fan-out routing: one source → many targets with per-link range/scale/invert/offset/curve. The middle tier between properties-panel links and the node-graph; the Macro control's brain. | [link-mapper-component.md](./link-mapper-component.md) |
| Crossfader component | Component | 🟢 shipped | A↔B blend fader (bipolar slider + inverse fan-out), crossfade curves, center detent, morph mode. 1D sibling of the Vector Joystick; shared blend/morph capability. | [crossfader-component.md](./crossfader-component.md) |
| Chord Generator | Component | 🟢 shipped as Chord Pad + Harmoniser | Generative MIDI source (chord pad / scale-locked strip / harmonizer), sibling to the arpeggiator. Reuses arp note model + Timer; new = chord/scale theory + a shared panel key/scale context. | [chord-generator.md](./chord-generator.md) |
| Groundbreaking components | Ideation | 💡 ideas | Differentiating, no-audio components leveraging the value layer + DPD + routing: Macro/Snapshot-Morph, modulation node-graph, Auto-Panel generator, Patch Diff/Compare, constrained Randomizer. Each now has a full design doc (next rows). | [groundbreaking-components.md](./groundbreaking-components.md) |
| Macro & Snapshot-Morph | Component | 🟢 Macro shipped | Macro = Knob + Mapper; Snapshot-Morph = blend control + Snapshots. Both emergent from the foundations (mostly packaging + assign UI). | [macro-and-morph.md](./macro-and-morph.md) |
| Modulation node-graph | Component | 📝 design | Visual patch-cord canvas; the 3rd routing tier over the same route model. New work is the cable canvas UI. | [node-graph.md](./node-graph.md) |
| Auto-Panel generator | Feature | ✅ built | File → New Panel from Device Profile: control-per-param, grouped, type-chosen, bound and adopted. `utils/autoPanel.js` + `stores/autoPanelActions.js`. | [auto-panel.md](./auto-panel.md) |
| Patch Diff / Compare | Feature | 📝 design | Semantic A/B "what changed" + hardware Compare; over snapshots + DPD + dump analyzer. | [patch-diff.md](./patch-diff.md) |
| Constrained Randomizer | Component | 📝 design | Generate patches within DPD ranges + locks (full/humanize/scoped); undo via snapshots. | [randomizer.md](./randomizer.md) |
| Ready-made vs custom | Principle | 💡 note | When to ship a set component vs use the custom creator. Findings: XY pad primitives already exist (ship as library preset); ADSR genuinely missing (new capability). | [ready-made-vs-custom.md](./ready-made-vs-custom.md) |
| Component gaps | Survey | 💡 backlog | Missing placeable components for a MIDI/synth editor (Knob, Listbox, Number/Text input, XY pad, ADSR, mod matrix, Meter, Keyboard); many are presets over existing engine support. | [component-gaps.md](./component-gaps.md) |
| Knob component | Component | 🟢 implemented | New `controlType` reusing the slider family's circular geometry. Integration spec: 4 files change (`componentTypes`, `interactionDefaults`, `componentPorts`, `IconPanel`), ~19 touchpoints unchanged. | [knob-component.md](./knob-component.md) |
| Listbox component | Component | 🟢 implemented (single-select MVP) | New `controlType` sharing Combobox's data model + a new `ListboxRenderer` (always-open, scrollable, click/wheel). Multi-select deferred (new port + export strategy). | [listbox-component.md](./listbox-component.md) |
| Text Input component | Component | 🟢 implemented (single-line MVP) | New `controlType`; `valueType:'text'`, the first TEXT/PATCH_NAME port, keyboard text entry (commit on Enter/blur → `Behavior.defaultValue`). Device SysEx patch-name emit is the C++ path (unverified by build); multi-line deferred. | [text-input-component.md](./text-input-component.md) |
| Number Field component | Component | 🟢 implemented | Number entry + steppers already exists as the Range/spinbox; gap is naming + a bare variant. Own `Number` `controlType` reusing the Range engine (its own palette entry, not a Range preset). | [number-field-component.md](./number-field-component.md) |
| Preset / Patch model | Findings | 🟢 built (core) | Factory vs user presets & patch names. The DPD data model (`presets`: slot map with factory/user writability, banks, factory catalog, recall action, name request) is in `dpd.schema.json` + validators, emitted to the engine profile, with a persisted librarian (`stores/presetLibrarian.js`) and the Designer's Presets screen. Selectors are wired: Listbox `choiceSource devicePresets/factoryCatalog` with live rows + recall-on-select; Value editor "Fill from" materializes rows for Combobox. Remaining: PATCH_NAME wiring, inbound preset-change feedback. | [preset-model.md](./preset-model.md) |

## Parking lot (not yet doc'd — promote when fleshed out)

Ideas that came up while designing the above and deserve their own row/doc later:

- **Bargraph / Meter** ready-made part (segment bars, VU/peak, EG display).
- **Scope / Waveform / Envelope** mini-visualizer part.
- **Soft-key label strip** (row of fields aligned to physical buttons/knobs).
- **MIDI protocol adapter library** (Sound Canvas / Push / MCU-HUI parsers) as
  shareable scripts/presets.
- **Custom glyph (CGRAM) authoring** UX for bitmap fonts / icons.

## How to use this backlog

1. Capture an idea as a row (status 💡) or in the parking lot.
2. When it has real shape, give it a design doc and bump to 📝.
3. Note what already exists in the codebase (status 🟡) so we don't rebuild it.
4. Only move to 🔵 / 🟢 when we deliberately decide to implement.
5. When a component ships, put a `> Status: **shipped 🟢**` line at the top of its
   design doc, keeping the original notes underneath, and add it to the table at
   the top of this page. Both drifted badly once — twenty design docs described
   shipped components while this index still called them ideas.
