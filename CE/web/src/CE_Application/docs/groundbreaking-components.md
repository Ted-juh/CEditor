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

### 00c. Ribbon Keyboard — a strip of pitch — **shipped 🟢**
- Slide for pitch: **scale-snap** (you can't play a wrong note), chromatic, or
  **glide** — continuous pitch via pitch bend, the Trautonium gesture a keyboard
  can't make. The cross axis is a second expression dimension (a CC). See
  [ribbon-keyboard.md](./ribbon-keyboard.md). Distinct from the `Ribbon`
  touch-strip, which drives a *parameter*.

### 00d. Drum Pads — a grid of fixed-note triggers — **shipped 🟢**
- The MPC/Push idiom: every pad pinned to one note, GM-named, with **choke
  groups** (a closed hat cuts a ringing open one) and **velocity from the strike
  height**. Momentary / one-shot / toggle. See [drum-pads.md](./drum-pads.md).

### 00e. Note input echo — the note controls read as well as write — **shipped 🟢**
- Not a component: one shared MIDI-input listener that lets all four note
  players **light up from incoming notes**. The Chord Pad becomes a chord
  analyser, the Drum Pads a sequencer monitor, the Ribbon a pitch monitor, and
  the Arp can be driven from an external keyboard. Brightness follows velocity
  and live poly pressure, so the echo shows dynamics. See
  [note-input-echo.md](./note-input-echo.md).

### 00f. Panic — silence everything — **shipped 🟢**
- Stops the panel's note controls, clears the echo, and sends the standard
  silence set (sound-off **before** notes-off) to the synth — the only cure for
  a note-off lost to a cable. Flashes, because the result is silence. Also on a
  **keyboard shortcut** (Escape by default, rebindable per panel so it travels
  with an exported Player), automatically when you leave the panel, and as a
  **script command** any button can fire. See [panic.md](./panic.md).

### 00g. Transport — the master clock — **shipped 🟢**
- Play / stop, tempo, bar-and-beat position, and something for everything else
  to follow. Position is **recomputed from the start instant**, never
  accumulated, so it cannot drift; a late frame fires the steps it slept through
  instead of leaving a hole in the bar. Runs on a 4ms interval (so MIDI
  clock-out isn't jittered by the display, and it survives a backgrounded
  window) but publishes to the UI at 30Hz. Follows **incoming MIDI clock** —
  bytes that were already arriving and being thrown away — including the **song
  position pointer**, so a sequencer that locates and continues resumes where it
  actually is rather than at bar 1 — or sends the same. In an
  exported plugin it follows the **DAW playhead** instead, read off
  `juce::AudioPlayHead` on the audio thread and pushed to the panel at 30Hz: a
  position rather than a pulse stream, so it cannot fall behind, and a locate in
  the DAW is recognised as a jump rather than replayed as sixteen notes. The
  [Arpeggiator](./arpeggiator.md), the
  [Phrase Sequencer](./phrase-sequencer.md) and the
  [Turing Modulator](./turing-modulator.md) follow it by note division, the
  [Gesture Looper](./gesture-looper.md), the
  [Preset Constellation](./preset-constellation.md) wander and the
  [Orbit Modulator](./orbit-modulator.md) by bars, and the
  [Kinetic Modulator](./kinetic-modulator.md) in musical time — with the honest
  caveat that a physics integrator can't be made drift-free the way a phase can.
  That is **every** self-clocked component in the panel; nothing here still runs
  on a private timer. Adds **loop points** (a bar range the position folds into,
  as a pure function of the timeline rather than a counter that resets) and a
  **count-in** (armed, not running — so every follower holds and stays silent
  with no change to any of them). See [transport.md](./transport.md).

### 00h. Zone Splitter — one keyboard, several synths — **shipped 🟢**
- A routing table: notes arriving on the hardware input are matched against key
  **zones**, each re-sending on its own channel, transposed, with its own
  velocity response. Lower half to the bass synth an octave down, upper half to
  the lead — the most-wanted thing here, and impossible before the note-input
  work made incoming notes visible. **Overlap is layering**; there is no separate
  layer mode to get wrong, and the inspector calls out both overlaps and gaps
  because both are silent-until-you-notice. A note-off replays the **remembered**
  routing of its note-on, so dragging a split point while a key is held can't
  leave it ringing. Controllers, the sustain pedal, **pitch bend** and channel
  pressure route too — and since a bend carries no note, which zone hears it is
  a stated **rule** (last played / while sounding / always / never) rather than
  a guess — while poly pressure, which does name its note, needs no rule at all.
  A footswitch can change the split live via `splitPreset` / `splitMute` /
  `splitPoint`. See [zone-splitter.md](./zone-splitter.md).

### 00i. Phrase Sequencer — a step grid whose rows are degrees — **shipped 🟢**
- The gap it fills is exact: the [Turing Modulator](./turing-modulator.md)
  sequences **values**, the [Arpeggiator](./arpeggiator.md) walks notes you are
  **already holding**, and nothing sequenced **pitch**. Sixteen columns, eight
  rows, click to place a note — but the rows are **scale degrees, not
  semitones**, so a pattern is a *shape*: change the key and it transposes,
  change minor to major and it re-harmonises, and there is no cell you can click
  that is out of key. A chromatic mode is there for when you want the piano roll
  after all. The pattern is a **sparse map**, so shrinking the grid never
  destroys anything (and the inspector says so, with a Delete-them link).
  **Ties** hold a note across steps and are exempt from the gate — a gate that
  cut a tie would be the retrigger the tie exists to avoid — and a tie with a
  rest in front of it is honestly nothing, in the seeds as well as in the grid.
  A note-off replays the **remembered** note-on, so changing key, scale or
  transpose mid-phrase can't leave a note ringing, and **stopping releases**.
  Synced it is position-in/index-out like the Arp, so it can't drift and a
  locate re-baselines instead of firing the steps it skipped; swing shares the
  Arp's own function so the two land together. Live from a script via
  `phraseSeed` / `phraseKey` / `phraseScale` / `phraseDirection` / `phraseCell`.
  See [phrase-sequencer.md](./phrase-sequencer.md).

### 00j. Phrase Recorder — the note twin of the Gesture Looper — **shipped 🟢**
- The Looper records your *motion*; this records your *notes* — played on the
  panel or arriving on the input — and loops them on the clock. Same interaction
  model, different payload, and the difference shapes the engine: a gesture is a
  sample stream you can interpolate, a phrase is events with duration where a
  missed note-on is silence and a doubled one is a stuck note. So the careful
  parts are the seam (a note held across it keeps its real length), the
  retrigger with no note-off (closes the first rather than dropping it), and
  stopping with keys down (closes them, or they ring forever).
  **Arming waits for the top of the loop**, so the take's downbeat is the
  loop's downbeat. **Undo is per overdub pass** — one integer per note, which
  beats a diff history at the only job anyone wants. Captures from the MIDI
  input *and* from the panel's own note controls, the latter through the single
  funnel all six of them already send on — so a note control added later is
  captured for free. A recorder never records a recorder. Quantise strength is
  **partial by default**, because full snap is what the Phrase Sequencer is for.
  See [phrase-recorder.md](./phrase-recorder.md).

### 00k. Harmoniser — one finger in, a full chord out — **shipped 🟢**
- Mostly assembly — the Chord Pad's scale engine, the note-input path, the
  note-output path — and none the worse for it: the classic "make me sound like
  a keyboard player" box. **Diatonic** mode builds the chord belonging to the
  played note's degree in the key (I ii iii IV V vi vii°), so the harmony is
  correct *by construction* rather than usually right. **Chord memory** mode
  transposes a fixed shape to whatever you play, in key or out of it — parallel
  fifths and all, which is exactly what people reach for it expecting. A note
  outside the key is a **stated rule** (play it alone / snap to the nearest
  scale tone / silent), defaulting to audible.
  Two bookkeeping rules: a note-off releases what its note-on **sent**, and —
  the one specific to this component — sounding pitches are **reference
  counted**, because two fingers a third apart produce overlapping chords and
  releasing one must not punch a hole in the other. See
  [harmoniser.md](./harmoniser.md).

### 00l. Setlist — scenes on a footswitch — **shipped 🟢**
- Unglamorous, and the thing people actually need on stage: an ordered list of
  panel states you advance with a pedal, each carrying a name, a cue note, an
  optional program change with bank, a tempo, and captured panel values.
  Nothing in it is novel — snapshots, program change and a footswitch CC all
  already existed — which is exactly why it was cheap.
  The rule that has to be right is the **rising edge**: a momentary pedal sends
  127 then 0, and acting on both steps twice per press, which on stage looks
  like the pedal skipping a song. Wrap is **off by default** (a setlist that
  jumps back to song one at the end of the night is a bad surprise), disabled
  scenes are **skipped rather than landed on**, and recall sends **MIDI before
  values** — a program change swaps the patch, and the stored values belong to
  the new one. Capture takes an **explicit path list**, never "everything",
  because the setlist's own index is a panel value too. A scene's tempo drives
  the [Transport](./transport.md), so everything synced follows the song. See
  [setlist.md](./setlist.md).

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
- Take an incoming signal (mod wheel / aftertouch / breath / expression / foot /
  velocity, straight off the **hardware MIDI input**, or a linked on-panel
  control), shape it through a **drawable transfer curve** (dead-zone, invert),
  and fan it to many parameters. See [expression-router.md](./expression-router.md).
- **MIDI learn**: press Learn and wiggle a control — it adopts whatever moved the
  most, not whatever spoke first. Any CC number is selectable.
- Sources include **per-note (poly) aftertouch**, reduced by hardest-held or
  most-recent key, with released keys dropped so nothing sticks.
- Output works anywhere; input availability is synth-dependent (aftertouch/breath),
  and the header reads LIVE vs TEST so a silent controller is obvious.

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

Strum pad. (Ribbon/touch-strip, vector joystick, crossfader, the chord/scale
trigger pad and the drum/performance pad grid are all shipped.)

## Ranking

- **Define the product:** Macro / Snapshot-Morph (performance) + Auto-Panel
  generator (setup speed) — the two reasons to pick CEditor over a generic editor.
- **Flashiest:** Modulation node-graph.
- **Sound-designer daily drivers:** Patch Diff/Compare + Randomizer.

## Notes

- All five lean on two enablers already identified as high-leverage: **snapshots
  of the value layer** and **fan-out (multi-parameter) binding**. Building those
  unlocks most of this list — same conclusion as the synth-tier investigation.
