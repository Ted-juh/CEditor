# HoSTage: Build features, second round

*Started 2026-11-19 at the owner's request: "another build features document (not the old one)".
Nothing in it built. The first round, with the rules everything here follows, is
`hostage-wider-not-a-daw.md`: [the line](hostage-wider-not-a-daw.md#the-line) that keeps HoSTage
from becoming a DAW, its numbered decisions, and its order of work. Each feature here gets a design
record with mockups, drawn the same way: the dock and the CTRL49 show the same pages, in the
original look (Midnight), with the other skins as colour. When this and the code disagree, the code
is right.*

## Read this first

- **What this record is**: the list of the second round's Build features, each with its status and
  its design record. The decisions are in the design records; this record says where they are.
- **The rules carried over**: Build mode first, Stage last (the owner, 2026-11-18); a page's knobs
  set values and its pads switch options; which knob and pad does what is checked against the rest
  of the keyboard when a page is built (the owner, 2026-11-18); built-ins are utilities only, no
  synths or reverbs (first round, decision 3).

## The features

| # | Feature | Status | Design |
| --- | --- | --- | --- |
| 1 | **A drum machine**: a drum part's patterns as a grid in the dock and three pages on the CTRL49 | approved with mockups, 2026-11-19; it plays the drum instrument you load and has no sounds of its own | `hostage-drums-design.md` |
| 2 | **Note repeat** on the KIT pads | taken, 2026-11-19; design to come | |
| 3 | **A kit from anywhere**: each drum from a different instrument | taken; design to come | |
| 4 | **Split a kit onto mixer strips** | taken; design to come | |
| 5 | **An energy knob** that thins a pattern out or fills it in | taken; design to come | |
| 6 | **Drop a MIDI file on the grid** | taken; design to come | |
| 7 | **Take the groove from your playing** | taken; design to come | |
| 8 | **Beatbox it in** | taken; design to come | |
| 9 | **Step effects**: a lane that changes an effect's setting step by step | taken; design to come | |
| 10 | **The kick ducks the bass**, from the pattern's own hits | taken; design to come | |
| 11 | **A line machine**: the drum grid's twin for basslines and synth lines | taken; design to come | |
| 12 | **Samples, on pads and keys**: a built-in one-shot sampler, the file player made playable | approved with mockups, 2026-11-19 | `hostage-sampler-design.md` |

## 1. A drum machine

The owner, 2026-11-19: "a drum-sequencer, drum machine like dock instrument, same as other pages
for the CTRL49".

HoSTage can already sequence drums: its patterns have drum lanes with everything a drum machine
needs (`PatternModel.h`). What it lacks is the drum machine's face: a grid where a drum part is
built hit by hit, and pages that let the CTRL49 be played like a drum machine. The design gives a
drum part a **DRUMS** block at the head of its chain, the grid below it, and three CTRL49 pages:
**DRUMS** (the grid), **KIT** (the pads are the drums) and **PATTERN** (which pattern, its
variations, the groove, the fill).

**Approved, 2026-11-19.** It plays the drum instrument you load, a plug-in or a hardware drum
machine, and has no sounds of its own, so the first round's decision 3 stands. It is built on the
existing patterns, and the three CTRL49 pages are as drawn.

## 2 to 11. More in the drum machine's spirit

Proposed on 2026-11-19, when the owner asked for more Build features "along the way like drum
machines, effects, etc". **The owner took all ten**: "All good ideas.. document them along with
the drum machine." Each was checked on `main` first, and none needs sounds or effects of HoSTage's
own, so the first round's decision 3 stands. Suggested first, because the engine underneath already
exists: 2, 3, 9, 11 and 6.

**Around the drum machine**

2. **Note repeat.** Hold a pad on KIT and it repeats at a chosen rate (1/8, 1/16, triplets), how
   hard set by how hard it is held: the drum machine's way to play rolls and hats. HoSTage's Echo
   module (`NoteModules.h`) repeats a note decaying; that is a different thing, so this is new.
3. **A kit from anywhere.** Each drum lane plays a different instrument: the kick from one plug-in,
   the snare from another, a clap from a hardware drum machine. The pattern model already lets each
   lane target its own part (`Lane::targetPartId`); the DRUMS grid shows them together as one kit.
4. **Split a kit onto mixer strips.** A drum plug-in with several outputs gives each drum its own
   strip and its own effects. HoSTage already routes the extra outputs of a multi-output instrument
   (`ExtraOut`, `RackModel.h`); this makes it one click from the kit.
5. **An energy knob.** One knob per pattern that thins it out or fills it in, bringing in the hits
   of variations B, C and D bit by bit, so a verse builds towards the chorus without a change of
   pattern. Built on the variations that exist (`makePatternVariation`).

**Getting patterns in**

6. **Drop a MIDI file on the grid.** A drum loop's file becomes a pattern, each note on its lane.
   It shares the MIDI file reader with Practice mode and the MIDI backing files (first round).
7. **Take the groove from your playing.** Play freely on the KIT pads; HoSTage turns the timing and
   the strength of what you played into a groove, to put on any pattern. Groove templates exist
   (`GrooveTemplate`); this fills one from your hands instead of from a file.
8. **Beatbox it in.** Beatbox into a microphone and the kick, hat and snare sounds become hits in a
   pattern. Uses the live inputs (first round, decision 2). Telling the three sounds apart is the
   hard part, so this one is the most adventurous.

**Effects in time**

9. **Step effects.** A lane that changes an effect's setting step by step: a gate chopping a pad
   into sixteenths, a filter opening every fourth beat. Patterns already have parameter lanes
   (`LaneType::parameter`), with parameter locks; this is their face, as the drum grid is the drum
   lanes'.
10. **The kick ducks the bass.** The bass and the pads dip on each kick. The first round has
    sidechain ducking as later (effects 6); with a drum machine it can be done from the pattern's own
    kick hits, as MIDI, without an audio sidechain.

**The melodic counterpart**

11. **A line machine.** The drum grid's twin for basslines and synth lines: each step a note, an
    accent and a slide, the notes able to follow the chord being played. Note lanes exist; this is
    their face, built the way the drum machine is.

## 12. Samples, on pads and keys

The owner, 2026-11-19: "What about a sampler?", then "Give me a proposal". HoSTage plays no sound
files of its own today. A full sampler instrument (many samples across keys and velocities, loops,
envelopes, filters) would be a synth and is ruled out by the first round's decision 3; sample pads,
one file a pad played as it is, are the file player that decision already allows, made playable.
The proposal draws sample pads only: sixteen pads a bank in the dock, each trimmed on its waveform,
files dropped one by one or as a folder, collected into the show, and SAMPLES and TRIM pages on the
CTRL49. **Approved, 2026-11-19**, with the owner's change: "It shouldn't just be tied to drum
pads.. the keys could also work or be assignable." Every sample plays from the keys as well, on one
key or across a range of keys, pitched from a root, and a keyboard map shows which keys play what.

