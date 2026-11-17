# HoSTage dock: the Chain tab, the arpeggiator and the step sequencer

*Design with mockups, **approved by the owner on 2026-11-17** ("Approved.."). Nothing built. It works out "a better
effects screen in the dock" (`hostage-wider-not-a-daw.md`, Effects, 8), taken on 2026-11-16,
starting with the arpeggiator, as the owner asked. Mockups: `hostage-dock-chain-mockups.html`, and
the same four frames as pictures in `docs/media/hostage-dock-chain-1.png` to `-4.png`. When this
and the code disagree, the code is right.*

![The arpeggiator in the dock: its six CTRL49 pages](../media/hostage-dock-chain-1.png)

## Why, and what the owner decided along the way

The owner: the dock's effects screens "could be improved a lot". Today a part's effects are spread
over two tabs, and the arpeggiator's editor does not match the CTRL49 pages designed for it. Three
decisions, all 2026-11-17, shaped the rest:

1. **Two modules.** "This the step sequencer.. I also want a fully fledged arpeggiater which we had
   designs for in the skin sets." Today's one Arpeggiator module becomes an **Arpeggiator** and a
   **Step sequencer**.
2. **Almost identical on the dock and the CTRL49.** "They should have almost identical Gui's."
3. **The skin applies to both, and can be just a colour change.** "The whole idea of a skin is that
   it also applies to the arpeggiater and step sequencer.. but that could be just a "color"
   change." Proven here on the original CTRL49 look only: "there are fourteen skin sets, they can be
   done later. Just a proof of concept on the original ctrl49 set."

## What is there today

- **The MIDI tab** lists a part's MIDI modules (up to eight): a grip to reorder, ▲▼, Byp, presets,
  and each module's editor (`MidiChainPanel.svelte`, `sections/midiModules/`).
- **The Inserts tab** lists the audio effects: reorder, Byp, Editor (the plug-in's window), P (its
  parameters), remove (`InstrumentHostView.svelte`).
- **One Arpeggiator module** does both jobs (`ArpEngine.h`, settings `ArpSettings` in
  `PatternModel.h`, editor `midiModules/ArpEditor.svelte`). Seven modes walk the held keys (up,
  down, up-down, down-up, as played, random, chord); **Drawn** gives every step a note, which is the
  step sequencer. Rate in steps per beat with a straight, triplet or dotted feel; octaves 1 to 4;
  gate; swing; latch; scale lock. A step lane of up to 32 steps with velocity (0 is a rest), tie,
  ratchet ×1 to ×4, octave −2 to +2 and chance. The playhead is the engine's own step.
- **CTRL49 designs** for both:
  - **The Live page**, a real HoSTage page (`tools/ctrl49/README.md`, "The stage pages"): sixteen
    steps over the zones and the keys, eight knobs, the pads turning steps on and off. Its layout is
    the step sequencer's first page.
  - **The six-page arpeggiator** (commit `5d72504`, "a full arpeggiator on six pages", in the
    Rhythm Box 1980 look, since removed from the tree; its pictures are restored as
    `docs/media/hostage-arp-ctrl49-*.png`): PLAY, MOTION, STEPS, VELOCITY, OCTAVE, CHANCE. Its
    layout is the arpeggiator's.
  - **The era designs' Arp Edit page** (`tools/ctrl49/screen-lab/era-presets`): a piano roll of
    sixteen steps. Its layout is the step sequencer's second page.
  - **The original look**, Midnight 2020 (`make_era_designs.py`, class `Midnight`): navy
    background, navy cards, teal, violet, pink and amber.

## One Chain tab

The MIDI and Inserts tabs become one **Chain** tab. Zone, Routing, Params and the rest stay.

At the top, the **chain strip**: the part in signal order, as blocks, grouped MIDI, Instrument,
Audio and Out (fader and sends). Each block shows:

- its name and an on/off switch (bypass);
- a line saying what it is set to (the arpeggiator's mode, rate and octaves);
- for audio blocks, dry/wet and one or two main knobs (Effects, 1);
- its latency, and its state: running, restarting (amber), failed.

Click a block and its editor opens underneath. A **+** at the end of the MIDI and Audio groups adds
one. Dragging to reorder and between parts, and trying a module before adding it, work here (More
ease of use, 1, 2 and 5). **Fold the chain** shrinks the strip to one line of names when an editor
needs the room (frames 2 and 3).

## The same picture on both screens

The proof of concept is in how the mockups are made: **each CTRL49 page is drawn once, at the
keyboard's 480 × 272, and the dock shows that same drawing scaled.** Frame 4 is the pages at the
keyboard's own size; frames 1 and 2 are the same pages in the dock.

- **The CTRL49 page is the master.** Its screen is the stricter one: eight knobs, and text the
  tightest budget (`tools/ctrl49/screen-lab/feature-mockups/README.md` measured it). A layout that
  works there is drawn larger in the dock, not the other way round.
- **The keyboard shows one page at a time** (Page ◀ ▶); **the dock shows them all**, and the mouse
  works on them: drag a bar, click a step, scrub a cell.
- **Knob N is cell N** on every page, and on the pattern pages also step N.
- **One layout, coloured by the skin**, on the keyboard and in the dock. The mockups use the
  original look only; the other skins come later. Colour is cheap on the keyboard: its pages draw
  colour as rectangles and as grey sprites it tints as it draws (`tint.png`, "The sound's colour"
  in the feature mockups' README). The owner's Linux branch already recolours the Meters, Cue and
  Browse pages; these pages should use the same mechanism. It is not on `main`, so it is not
  described here.
- **Labels short enough for the keyboard**, so the two screens say the same words.

## The arpeggiator: six pages

The Rhythm Box design's six pages, in the original look (frame 1, and frame 4 at size):

- **PLAY**: the keyboard with the held chord lit and the sounding note in teal; NOW (the note, its
  velocity, its step type, the place in the pattern); and a roll of the next sixteen steps,
  combining every lane. Height is pitch, thickness velocity, width gate. A tie joins its neighbour,
  a ratchet splits its step; accents are pink, chord steps white, and a step its chance left out is
  a dashed ghost. Knobs: mode, rate, octaves, gate, swing, tempo, **latch**, **scale lock**. In the
  Rhythm Box design knobs 7 and 8 chose a chord and a root to stand in for held keys; in HoSTage
  the held keys do that, so those knobs are free.
- **MOTION**: the walk as a contour of thirty-two notes, with a mark where the cycle starts again.
  Knobs: octave order, repeat, transpose, inversion, length, accent, random, reset.
- **STEPS, VELOCITY, OCTAVE, CHANCE**: the pattern, one lane per page, eight columns over the eight
  knobs, so knob N sets step N. Type is rest, note, accent, tie, ×2, ×3, ×4 or chord, each drawn
  and coloured its own way; velocity shows the accent's amount on top; octave is −2 to +2; chance
  is a column of dots. The pads turn steps on and off.

**Only in the dock**: a pattern longer than eight steps (up to 32, the engine's limit; the keyboard
shows eight at a time), patterns, and dragging across several steps at once.

### NOTES mode: the notes you place yourself

**Decided, 2026-11-17.** The owner: "the arpeggiater should also be assignable instead of just the
up/down etc modes.. all the keys to the left to see the range of the keyboard." So besides the
twelve walks there is a thirteenth mode, **NOTES** (frame 2):

- **Each step's note is set by hand** on a piano roll, with the whole keyboard on its side down the
  left, as on the era designs' Arp Edit page. Knob 2 sets the selected step's note; knob 3 scrolls
  the roll through the keyboard's whole range. A note outside the view is marked at the top or
  bottom edge of its step.
- **It still plays like an arpeggiator.** The key you hold moves the pattern from its **root**
  (knob 5), so one finger transposes it (**follow: key**). The pattern pages still apply: a step's
  type (accent, tie, ratchet, chord, rest), velocity, octave and chance.
- **The NOTES page takes MOTION's place as page 2** in this mode, because octave order, repeat,
  inversion and random shape a walk, and NOTES mode has none. So the arpeggiator has six pages in
  every mode.
- **PLAY** says NOTES as its mode, and its roll and NOW show the placed notes.
- **The sounding note is lit** on the side keyboard as well as on PLAY's.

The engine needs, for this: per-step notes over the whole MIDI range rather than today's free rows
(one octave either side of the lowest key held, `ArpEngine.h`, Drawn mode), a root, and follow.

### What the engine needs for it

What the six pages ask for and `ArpSettings` does not have yet:

- **Modes**: up+down (the ends played twice), converge, diverge, pinky (every note answered by the
  top one) and thumb (by the bottom one). With today's seven walk modes, twelve.
- **Octave order**: up, down, up-down, or interleaved (each note through every octave first).
- **Repeat**: each note of the walk played 1 to 4 times.
- **Transpose** ±12 and **inversion** (the chord's lowest notes lifted an octave), inside the arp.
- **Accent**, as a step type with an amount added to the velocity, and **chord** as a step type
  (every held note at once).
- **Random**: a share of the walk's notes swapped for others from it.
- **Reset**: the walk and the pattern restart every 1, 2 or 4 bars.
- **The walk moves on only on note, accent and ratchet steps**, so rests, ties and chord steps
  leave it where it was, and a pattern drifts against the walk as on a hardware arpeggiator. Check
  what today's engine does here before changing it.

The type lane needs little new storage: rest is velocity 0, tie and ×2 to ×4 are today's tie and
ratchet rows. Only accent and chord are new kinds of step.

## The step sequencer: two pages

Today's Drawn mode as a module of its own: every step carries a note (frame 3, and frame 4 at
size).

- **SEQ**: the Live page's layout. Sixteen steps (velocity as the bar, repeat dots above, the
  octave or chance below, the playhead under the step sounding), the zones, and the keys held and
  sounding. Knobs: step, velocity, octave, ratchet, chance, **tie**, gate, rate. On today's Live
  page knob 6 is gate, 7 rate and 8 the arpeggiator's mode; tie takes knob 6 so a step's settings
  are all on knobs 1 to 6, and the mode leaves with the arpeggiator.
- **NOTES**: the melody, on **the same piano roll as the arpeggiator's NOTES page**: the whole
  keyboard on its side down the left, sixteen steps, the selected step outlined, scrolled through
  the keyboard's range by knob 3. **Follow** says what the key you hold does: **key** moves the line
  from its root (today's free rows, widened from one octave either side to the whole range),
  **chord** fits its notes to the chord held (today's chord rows), **off** plays it as written.
  Knobs: step, note, scroll, follow, swing, feel, steps, scale lock.

So every setting has a knob on the keyboard. **Only in the dock**: painting across the grid or the
bars, and more than sixteen steps (up to 32).

A sequence that plays without keys held is a **pattern** in the Performance workspace, which
already has note, drum, CC and parameter lanes. Neither module repeats it.

## The Chords module: six pages

*Added 2026-11-17, when the owner asked for "the Chords module, same way". Proposed, not yet
approved. Mockups: `hostage-dock-chords-mockups.html`, pictures `docs/media/hostage-dock-chords-1.png`
(the dock) and `-2.png` (the pages at the keyboard's size).*

![The Chords module in the dock](../media/hostage-dock-chords-1.png)

**What it is today** (`MidiFxSettings` in `PatternModel.h`, editor `midiModules/ChordsEditor.svelte`):
one **set** of up to 32 chords, built (root, shape, inversion, voicing, bass) or learned by playing,
and four **layers** that play them, each with its own on/off:

- **Follow**: every key in a range plays a shape built on itself.
- **Key map**: chosen keys play chosen set chords exactly, and win over everything.
- **Pads**: 8 pads × 4 banks, each a set chord. A CTRL49 pad with nothing else to do already plays
  them (`pressSurfacePad`).
- **Progression**: keys in a range play the set's chords in order, stepping on each press or on the
  sustain pedal.

There is no CTRL49 page for it yet, only a mockup: the Chords page of the feature mockups
(`tools/ctrl49/screen-lab/feature-mockups/hostage-features/preview-5-chords.png`), in the original
look.

**The pages** follow the module's own shape: one to play from, one for the set, one per layer.

1. **CHORDS**, after the feature mockup: the chord playing, large, with its numeral and its job in
   the key ("VImaj7, submediant"); the key, with a light per layer; the keyboard with the notes
   playing and the scale marked; the eight pads of the bank. Knobs: key, scale, bank, then the four
   layers on and off, then whether the module follows the song's key.
2. **SET**: eight of the set's chords at a time, the selected one large with its notes on the
   keyboard. Knobs: chord, root, shape, inversion, voicing, bass, **learn** (play a chord and it is
   kept), and the top voice's accent.
3. **FOLLOW**: the shape, the range as a band over the keyboard, and an example of what one key
   plays. Knobs: shape, inversion, voicing, motion (voice leading), bass, lowest, highest, top.
4. **KEYS**: the key map, each mapped key labelled with its chord, the selected key outlined. Knobs:
   the key, and the chord it plays.
5. **PADS**: the bank's eight pads, each with its chord and its notes. Knob N chooses pad N's chord,
   as on the pattern pages; Shift and the bank buttons choose the bank, as now.
6. **PROG**: the progression as a row of chords, the current one lit, and the range the left hand
   steps it from. Knobs: step, chord, next on (key or pedal), lowest, highest, length.

**Only in the dock**: naming a chord; dragging a chord from SET onto a pad, a key or a progression
step; removing a chord (it asks first).

**What it needs.** No engine work: every setting shown exists. New are the pages themselves, the
numeral and job of a chord in the key (worked out from its notes, which `chordNameOf` already
names), and learning from the keyboard's knob 7. The feature mockup also ringed "the likeliest next
chord" on the pads; that needs a model of which chord follows which, and is left out.

**Decisions for the owner:**

1. **These six pages**, in this order?
2. **The layers switched on CHORDS' knobs 4 to 7**, rather than one switch on each layer's page?
3. **The likeliest next chord** from the feature mockup: leave it out, as here?

## What changes from today

- **Unchanged**: everything today's arpeggiator can do; the playhead from the engine.
- **Split**: one Arpeggiator module becomes two. An arpeggiator saved in Drawn mode opens as a step
  sequencer; one in any other mode opens as an arpeggiator, its lane kept.
- **Moved**: the MIDI and Inserts tabs into one Chain tab; the pattern chips into a menu; tie, gate
  and rate on the Live page's knobs 6 to 8.
- **New**: the chain strip; the arpeggiator's six pages, with its motion settings, five modes, two
  step types and NOTES mode needing engine work (above); the step sequencer's NOTES page, on the
  same piano roll; both modules' editors in the dock drawn from the keyboard's pages.

## Decisions

All settled on 2026-11-17. The owner approved the design as drawn, which settles the five that were
still open the way the mockups show them:

1. **One Chain tab** in place of the MIDI and Inserts tabs.
2. **The arpeggiator's PLAY knobs 7 and 8** are latch and scale lock.
3. **The arpeggiator's pattern** is up to 32 steps in the dock, eight at a time on the keyboard.
4. **The step sequencer's two pages**: SEQ with tie, gate and rate on knobs 6 to 8, and NOTES with
   the melody and the sequence's settings.
5. **Patterns as a menu** in place of a row of chips.

Decided before that, also 2026-11-17: two modules; almost identical on the dock and the CTRL49; the
skin applies to both (the other thirteen skins later); the arpeggiator's NOTES mode, with the whole
keyboard down the left.

## Next

The other thirteen skins on these pages. The same frame for the other MIDI modules (Echo, Strum,
Humanize and the rest, in `sections/midiModules/`); Chords is above. Then an audio insert: dry/wet, its main
knobs, latency and state in the block, its parameters below, and the plug-in's own window one click
away.

## Mockups

`hostage-dock-chain-mockups.html`, static, with invented data. The CTRL49 pages are drawn by one
function each at 480 × 272, in the original look; the dock around them is in HoSTage's own colours.

1. **The arpeggiator in the dock**: the chain strip, then its six pages side by side
   (`docs/media/hostage-dock-chain-1.png`).
2. **The arpeggiator in NOTES mode**: PLAY and the NOTES page, larger (`-2.png`).
3. **The step sequencer in the dock**: the chain folded, then its two pages, larger (`-3.png`).
4. **The nine pages at the keyboard's own size** (`-4.png`).

The Rhythm Box pictures of the arpeggiator's design are `docs/media/hostage-arp-ctrl49-1-play.png`
to `-6-chance.png`.
