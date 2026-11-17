# HoSTage dock: the Chain tab, starting with the arpeggiator

*Design with mockups for the owner to approve, 2026-11-17. Nothing built. It works out "a better
effects screen in the dock" (`hostage-wider-not-a-daw.md`, Effects, 8), taken on 2026-11-16, and
starts with the arpeggiator, as the owner asked. Mockups: `hostage-dock-chain-mockups.html`, and
the same three frames as pictures in `docs/media/hostage-dock-chain-1.png` to `-3.png`. When this
and the code disagree, the code is right.*

![The Chain tab with the arpeggiator open](../media/hostage-dock-chain-1.png)

## Why

The owner: the dock's effects screens "could be improved a lot". Today a part's effects are spread
over two tabs, and the arpeggiator's editor does not match the CTRL49 page that shows the same
arpeggiator on the keyboard.

## What is there today

- **The MIDI tab** lists a part's MIDI modules (up to eight): a grip to reorder, ▲▼, Byp, presets,
  and each module's editor (`MidiChainPanel.svelte`, `sections/midiModules/`).
- **The Inserts tab** lists the audio effects: reorder, Byp, Editor (the plug-in's window), P (its
  parameters), remove (`InstrumentHostView.svelte`).
- **The arpeggiator's editor** (`midiModules/ArpEditor.svelte`) already does everything the engine
  can: eight modes drawn as shapes; rate, feel, octaves, gate, swing and hold; and a step lane with
  six stacked rows (melody in Drawn mode, velocity, repeats, tie, octave, chance), each edited on
  its own row; a row of pattern chips; up to 32 steps. The playhead is the engine's own step.
- **The engine** (`ArpEngine.h`, settings `ArpSettings` in `PatternModel.h`) needs no change for
  this design: everything shown here is already in its settings.
- **The CTRL49's Live page** shows the same arpeggiator on the keyboard: sixteen steps above the
  keys and zones, and eight encoder cells in a fixed order: step, velocity, octave, ratchet,
  chance, gate, rate, mode. The pads turn steps on and off. It is a real HoSTage page
  (`tools/ctrl49/README.md`, "The stage pages"); its mockup is
  `tools/ctrl49/screen-lab/feature-mockups/hostage-live/preview-1-live.png`.

## The design

### One Chain tab

The MIDI and Inserts tabs become one **Chain** tab. Zone, Routing, Params and the rest stay.

At the top, the **chain strip**: the part in signal order, as blocks, grouped MIDI, Instrument,
Audio and Out (fader and sends). Each block shows:

- its name and an on/off switch (bypass);
- one line saying what it is set to (the arp's mode, rate and length; a module's key setting);
- for audio blocks, dry/wet and one or two main knobs (Effects 1);
- its latency, and its state: running, restarting (amber), failed.

Click a block and its editor opens underneath. A **+** at the end of the MIDI and Audio groups
adds one. Dragging to reorder and between parts, and trying a module before adding it, work here
(More ease of use, 1, 2 and 5).

**Fold the chain** shrinks the strip to one line of names, when an editor needs the room
(frame 2).

### The arpeggiator

Laid out like the CTRL49's Live page, so one picture of it serves both screens.

1. **The header**: on/off, the eight modes as today's shape buttons, then Patterns (today's chips,
   as a menu), Latch, and a tag showing the CTRL49's Live page is connected.
2. **The steps.** One card per step, like the keyboard's. Each card has a bar, and small marks for
   the rest: repeat dots, the octave, the chance, a tie to the next step. **Bars show** chooses what
   the bars are: velocity (the default), octave, repeats, chance or tie. So one row is edited at a
   time, and the others stay visible as marks. Today's editor stacks six rows; this keeps the lane
   one row high.
   - Click a step to select it.
   - Drag across the bars to paint many steps at once.
   - The small square under each step turns it on or off, as the pads do.
   - The playhead is the engine's step, as now.
3. **The eight cells**, in the CTRL49's order: step, velocity, octave, ratchet, chance (the
   selected step), then gate, rate, mode (the whole arpeggiator). Each is scrubbed or typed, and
   says which knob it is.
4. **Also**: swing, feel, octaves, the number of steps and scale lock, which the keyboard's page
   does not have.
5. **The keyboard strip** above the workspace shows the keys held and marks the note the arp is
   playing, as the Live page does.

### Drawn mode: the step sequencer

In Drawn mode the steps also carry a note, and a melody grid appears above the bars (frame 2).
**Chord** rows are the notes of the chord held; **Free** rows are semitones around the lowest key
held, so one finger transposes the line. Both exist today; only the layout changes.

The arpeggiator follows the hand: it plays only while keys are held (or latched). A sequence that
plays by itself is a **pattern** in the Performance workspace, which already has note, drum, CC
and parameter lanes. The dock does not repeat it.

### The CTRL49, both ways

The eight cells are the keyboard's eight knobs, in the same order (frame 3). Selecting a step on
either selects it on both. The pads and the squares turn steps on and off. Both screens show the
same playhead and the same held and played keys. Only the dock has painting, the melody grid, the
extra settings, patterns and the rest of the chain.

## What changes from today, and what does not

- **Unchanged**: the engine and its settings; every setting the editor has now; the playhead from
  the engine; Drawn mode's chord and free rows.
- **Moved**: MIDI and Inserts into one tab; six stacked rows into one lane with "bars show"; the
  pattern chips into a menu.
- **New**: the chain strip; the selected step; the eight cells; the on/off square per step; the
  arp's note on the keyboard strip; the step shared with the CTRL49.

## Decisions for the owner

1. **One Chain tab** in place of the MIDI and Inserts tabs?
2. **One lane with "bars show"** in place of six stacked rows?
3. **The eight cells in the CTRL49's order**, with the selected step shared both ways?
4. **Patterns as a menu** in place of a row of chips?

## Next

The same frame for the other MIDI modules (Chords, Echo, Strum, Humanize and the rest, whose
editors are in `sections/midiModules/`), then an audio insert: dry/wet, its main knobs, latency and
state in the block, and its parameters, with the plug-in's own window one click away.

## Mockups

`hostage-dock-chain-mockups.html`, static, with invented data and HoSTage's own colours:

1. **The Chain tab, with the arpeggiator open** (`docs/media/hostage-dock-chain-1.png`).
2. **Drawn mode: the arpeggiator as a step sequencer**, chain folded, bars showing octave
   (`-2.png`).
3. **The same arpeggiator on the CTRL49**, the dock's cells under the Live page's
   (`-3.png`).
