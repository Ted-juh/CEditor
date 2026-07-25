# Groundbreaking Components — Ideas

> Status: **ideation.** Novel components that would *differentiate* a no-audio
> MIDI device editor, leveraging its unique substrate. Part of the
> [panel parts backlog](./README.md); the conventional gaps live in
> [component-gaps.md](./component-gaps.md).

## Why these are feasible here (no audio needed)

The app's substrate is what makes these possible — all parameter math + MIDI,
not DSP:

- **Value layer** (`Player/PanelValueModel.h`) — full live device state →
  snapshots, morph, diff.
- **DPD** — semantic per-parameter range/type/enum → correct interpolation,
  constrained randomize, auto-layout, semantic diff.
- **Routing layer** (`utils/panelCustomComponentLinks.js`) + **fan-out binding**
  (see [meter-and-mod-matrix.md](./meter-and-mod-matrix.md)) → one control drives
  many params.
- **Dump Analyzer** (see [midi-workbench.md](./midi-workbench.md)) → structural
  diffing.

> Each now has a full design doc: **Macro & Snapshot-Morph**
> ([macro-and-morph.md](./macro-and-morph.md)) · **Node-graph**
> ([node-graph.md](./node-graph.md)) · **Auto-Panel** ([auto-panel.md](./auto-panel.md))
> · **Patch Diff/Compare** ([patch-diff.md](./patch-diff.md)) · **Randomizer**
> ([randomizer.md](./randomizer.md)).

## The ideas

### 00. Chord Pad — PLAY the synth — **shipped 🟢** (new category)
- Every other control modulates parameters; this one emits **MIDI notes**. Key +
  scale aware pads in a **circle-of-fifths wheel** (V one step CW, IV one CCW,
  relative minors inside, borrowed chords one step outside the lit wedge) or a
  compact grid. See [chord-pad.md](./chord-pad.md).
- It also builds the **note-output path**, which an Arpeggiator / ribbon-keyboard
  / strum pad can now reuse cheaply.

### 00b. Arpeggiator — the pattern engine on the notes — **shipped 🟢**
- Walks a held note set on the clock (up / down / up–down / as played / random /
  block chord), across octaves, with gate, swing and a **Euclidean rest mask**.
  Fed by its own key/scale chord or by a **linked Chord Pad** — which then goes
  silent so the arp does the playing. See [arpeggiator.md](./arpeggiator.md).

### 0. Orbit Modulator — spatial poly-LFO — **shipped 🟢**
- A modulation **source that animates itself** and that you **choreograph in
  space**: satellites orbit a centre, each emitting a live 0–1 value from its
  position, each a bindable fan-out port. The first *time-based, self-running*
  native control here — see [orbit-modulator.md](./orbit-modulator.md).
- Substrate: pure position→value math + fan-out binding; a rAF clock in the
  preview surface. No DSP.

### 0b. Gesture Looper — record your motion, loop it — **shipped 🟢**
- The **human** counterpart to the Orbit: press-and-move in a lane to record a
  value-over-loop gesture, release and it loops into a bound parameter on the
  clock. See [gesture-looper.md](./gesture-looper.md). Works on essentially any
  MIDI synth (light traffic, no input dependency).

### 0c. Expression Router — shape any input, fan it out — **shipped 🟢**
- MIDI-learn an incoming signal (mod wheel / aftertouch / breath / a linked
  control), shape it through a **drawable transfer curve** (dead-zone, invert),
  and fan it to many parameters. See [expression-router.md](./expression-router.md).
- Output works anywhere; input availability is synth-dependent (aftertouch/breath).

### 0d. Timbre Space — control by meaning — **shipped 🟢 (v1)**
- A 2D "sound map": axes are musical intentions, anchors are patches, the puck
  **blends the whole patch** by inverse-distance weighting. One gesture over
  perceptual directions. See [timbre-space.md](./timbre-space.md). A corner
  readout reports how many targets are actually MIDI-addressable.

### 0e. Turing Modulator — lock or evolve a step sequence — **shipped 🟢**
- The **algorithmic** motion source: a looping shift-register whose single
  randomness knob goes from frozen loop to pure chaos. Value / gate / inverse
  fan-out ports. See [turing-modulator.md](./turing-modulator.md).

### 0f. Kinetic Modulator — physics you fling — **shipped 🟢**
- The **physical** motion source: a ball with gravity, wall-bounce and drag that
  you fling around a box, emitting X / Y / speed / bounce. Rounds out the motion
  family (geometric · human · generative · **physical**). See
  [kinetic-modulator.md](./kinetic-modulator.md).

### 1. Macro control → Snapshot Morph (headline)
- **Macro:** one knob drives **many** device parameters with per-target curves
  (modern soft-synth macros; rare in hardware editors).
- **Snapshot Morph:** a control that **interpolates the entire patch between two
  saved snapshots (A↔B)** using DPD ranges — stepping enums, skipping
  non-interpolatables. Turns a static editor into a performance instrument.
- Substrate: value layer (snapshots) + fan-out binding + DPD ranges.

### 2. Modulation node-graph (patch-cord canvas)
- Visual wiring of **sources** (LFO / envelope / macro / MIDI in) to
  **destinations** (any parameter) with cables + depth. The modular paradigm as a
  panel object.
- Substrate: routing layer + fan-out binding + the breakpoint/LFO engine
  ([envelope-curve-editor.md](./envelope-curve-editor.md)).

### 3. Auto-Panel generator ("instant editor")
- Drop a device profile → **generate a complete, grouped editor panel** (one
  control per parameter, sectioned by DPD structure, control type chosen by
  parameter type). Hours of layout → seconds. *Feature more than a single widget.*
- Substrate: the DPD (it already knows the device) + `componentTypes` factory.
- Biggest **adoption** unlock.

### 4. Patch Diff / Compare
- A/B **"what changed"** between current and stored patch (or two snapshots) — the
  hardware "Compare" button + a visual semantic diff.
- Substrate: value layer + DPD (semantic) + Dump Analyzer (byte-level pairing).
- Daily driver for sound design *and* reverse-engineering.

### 4b. Preset Constellation — your library as a map — **shipped 🟢**
- Presets as stars on a 2D field; a probe **recalls** (snap) or **morphs** (blend)
  between them; similarity **links** + **auto-arrange** turn the library into a
  navigable map; **wander** drifts through it. See
  [preset-constellation.md](./preset-constellation.md).

### 4c. Constraint Cell — musical relationships enforced — **shipped 🟢**
- Linked members that always preserve a rule (sum=100% / ordered / ratio /
  mirror) as you move them — e.g. resonance never exceeds cutoff. Each is a
  fan-out port. See [constraint-cell.md](./constraint-cell.md).

### 5. Constrained Randomizer / "Generate"
- Generate new patches **within DPD ranges and user locks** ("randomize all
  except the filter"). Only musical/safe because the DPD constrains it.
- Substrate: DPD ranges + value layer + per-param lock flags.

## Also missing (conventional, `[engine-reuse]`, each its own palette entry)

Ribbon / touch-strip · vector joystick (4-corner morph) · drum/performance pad
grid · crossfader · chord/scale trigger pad.

## Ranking

- **Define the product:** Macro / Snapshot-Morph (performance) + Auto-Panel
  generator (setup speed) — the two reasons to pick CEditor over a generic editor.
- **Flashiest:** Modulation node-graph.
- **Sound-designer daily drivers:** Patch Diff/Compare + Randomizer.

## Notes

- All five lean on two enablers already identified as high-leverage: **snapshots
  of the value layer** and **fan-out (multi-parameter) binding**. Building those
  unlocks most of this list — same conclusion as the synth-tier investigation.
