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
| 2 | **Note repeat** on the KIT pads | approved with mockups, 2026-11-19 | `hostage-kit-design.md` |
| 3 | **A kit from anywhere**: each drum from a different instrument | approved with mockups, 2026-11-19 | `hostage-kitbuild-design.md` |
| 4 | **Split a kit onto mixer strips** | approved with mockups, 2026-11-19 | `hostage-kitbuild-design.md` |
| 5 | **An energy knob** that thins a pattern out or fills it in | taken; design to come | |
| 6 | **Drop a MIDI file on the grid** | taken; design to come | |
| 7 | **Take the groove from your playing** | taken; design to come | |
| 8 | **Beatbox it in** | taken; design to come | |
| 9 | **Step effects**: a lane that changes an effect's setting step by step | approved with mockups, 2026-11-19 | `hostage-steps-design.md` |
| 10 | **The kick ducks the bass**, from the pattern's own hits | taken; design to come | |
| 11 | **A line machine**: the drum grid's twin for basslines and synth lines | approved with mockups, 2026-11-19 | `hostage-line-design.md` |
| 12 | **Samples, on pads and keys**: a built-in one-shot sampler, the file player made playable | approved with mockups, 2026-11-19 | `hostage-sampler-design.md` |
| 13 | **Full strength**: every pad hit at full velocity | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |
| 14 | **One drum on every pad**, at eight strengths or eight pitches | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |
| 15 | **Erase while it plays**: hold ERASE and a pad to clear that drum's hits | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |
| 16 | **Mute drums from the pads** | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |
| 17 | **Pad response**: changed by the owner: no curve when the pads send velocity; a fixed strength only for pads without it | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |
| 18 | **Double the pattern**: one bar copied to two, ready to vary | approved with mockups, 2026-11-19 (MPK-style playing) | `hostage-kit-design.md` |

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

## Where the line is

Written on 2026-11-19, when the owner asked whether all this gets into DAW territory. Every feature
here passes the first round's question, "does it make the next sound better, or the last sound
editable?" Five sit close to the line, and each has an obvious next step that would cross it,
written down, as the first round does, so nobody takes it by accident:

| Feature | Why it is fine | The step that would cross the line | Keep it as |
| --- | --- | --- | --- |
| **The drum machine, the line machine** (1, 11) | patterns are loops you perform | patterns chained into a song timeline; long parts | loops of up to 64 steps, started by sections as cues |
| **Recording into patterns** (KIT's record, 7, 8) | what you play lands on the grid as one loop | takes kept and compared; long recordings not snapped to the grid | written onto the grid, one loop, nothing kept beside it |
| **A MIDI file on the grid** (6) | a drum loop becomes a pattern | a whole song's part imported as one long part | only the bars that fit a pattern; a whole song's file plays as a MIDI backing file, play-only |
| **Step effects** (9) | a setting moves inside a loop | automation drawn across a whole song | inside the pattern's loop |
| **Samples** (12) | files are played, not made | cutting, slicing or normalising a file; recording or bouncing samples | start, end and fades only say how it plays; the file never changes |

The closest is Samples' TRIM page, because it looks like waveform editing, which the first round
keeps out for good. It is not: nothing is cut or saved, the file stays as it arrived, and only where
playing starts and stops is stored.

## MPK-style playing

Written on 2026-11-19 at the owner's request ("document the missing features for MPK machines"),
after the owner noted that the drum machine and Samples reach into Akai's territory.

**What that territory is.** Akai's MPK keyboards (MPK Mini, MPK249, MPK261, MPK Road) are MIDI
controllers like the CTRL49: they make no sound themselves (the MPK Mini Play, with sounds and a
speaker, is the exception), and their sound comes from software on the computer, Akai's bundled MPC
Beats or anything else. Akai's MPC machines (MPC One, Live, X) are another line: standalone, with
their own sound engine, sampler and sequencer. An MPC is two things: a **performance instrument**
(pads, note repeat, patterns, one-shots, swing) and a **production workstation** (sampling and
chopping, song mode, audio tracks, mixdown). **HoSTage takes the playing side and never the
production side**, which is the DAW the first round keeps out. Put plainly: the CTRL49 with HoSTage
is what an MPK is with its bundled software, played live, with any plug-in or hardware synth as the
sound and a colour screen to show it.

**Our own words.** Common terms (note repeat, swing, choke, pad banks) are used as everyone uses
them; Akai's own names (MPC, Full Level, 16 Levels) and Akai's look are not copied. The features
below are named for what they do.

**Already covered**, by approved designs or by what exists:

- **Note repeat**: feature 2, done by HoSTage, so no button is needed on the controller.
- **Pad banks**: the CTRL49 has four (A to D), and HoSTage already lights its pads.
- **Assignable knobs, faders and buttons**: control pages (Controller design), with commands on
  pads.
- **The arpeggiator**, and **chords on the pads** (today, in the CTRL49's own bank, from a part's
  Chords module).
- **Swing**: the pattern's groove (the drum machine, PATTERN).
- **Tap tempo**: a command on a pad (Controller design).
- **Undo of a recording pass**: undo that covers everything (first round, Build tools design).

**Missing, now features 13 to 18, all approved by the owner on 2026-11-19 ("All approved"):**

13. **Full strength.** A switch on KIT: every hit at full velocity, whatever the touch, for programming
    a beat evenly.
14. **One drum on every pad.** The selected drum spread over all eight pads, at eight strengths
    (softest to hardest) or, for a sample, at eight pitches: to play a roll that swells, or a tuned
    hit as a bassline.
15. **Erase while it plays.** Hold ERASE and press a pad while the pattern plays: that drum's hits are
    cleared as the playhead passes them, the way a drum machine is tidied without stopping.
16. **Mute drums from the pads.** A KIT pad layer where each pad mutes or unmutes its drum, for
    dropping the kick out of a groove and back in.
17. **Pad response.** A soft, normal or hard curve for the pads alone, or one fixed strength, set
    apart from the keys, since pads and keys rarely feel alike. *Changed when drawn (the owner,
    2026-11-19: "If the pads have velocity, no"): pads that send velocity play as hit, with no curve;
    only pads without velocity get one fixed strength (`hostage-kit-design.md`, decision 2).*
18. **Double the pattern.** One bar copied to make two, ready to vary the second, the quick way to a
    longer loop (still within the line's 64 steps).

**What the CTRL49 itself can and cannot do**, from the repository's hardware notes
(`tools/ctrl49/README.md`) and the Screen Builder design:

- **Eight pads** (2 × 4) where an MPK249 has sixteen: the real difference. A sixteen-step lane is
  played in two halves (DRUMS: Shift for the other half), and KIT shows eight drums a bank.
- **Four pad banks**, its own colours on each pad, **eight encoders, nine faders** (the faders suit
  drum levels better than knobs), **49 keys**, and a **480 × 272 colour screen** that an MPK does not
  have: the grid, the kit and the waveforms can be seen on the keyboard itself.
- **Hardware-identical to Akai's Advance keyboards** (Screen Builder design), so these pages would
  apply there too.
- **Pad pressure: not known.** The repository records the pads' colours and banks, but not whether
  they send pressure (aftertouch) when pressed harder. Note repeat's "how hard is set by how hard it
  is held" needs it; without it, a repeat takes its strength from the first hit. **To test on the
  owner's CTRL49**: in Audio & MIDI, which shows the last message received, tap a pad softly and hard
  (does the velocity change?), then hold one and press harder (does pressure arrive?).

