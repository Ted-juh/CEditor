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
| 1 | **A drum machine**: a drum part's patterns as a grid in the dock and three pages on the CTRL49 | design with mockups for approval, 2026-11-19; one question open: whether it has sounds of its own | `hostage-drums-design.md` |

## 1. A drum machine

The owner, 2026-11-19: "a drum-sequencer, drum machine like dock instrument, same as other pages
for the CTRL49".

HoSTage can already sequence drums: its patterns have drum lanes with everything a drum machine
needs (`PatternModel.h`). What it lacks is the drum machine's face: a grid where a drum part is
built hit by hit, and pages that let the CTRL49 be played like a drum machine. The design gives a
drum part a **DRUMS** block at the head of its chain, the grid below it, and three CTRL49 pages:
**DRUMS** (the grid), **KIT** (the pads are the drums) and **PATTERN** (which pattern, its
variations, the groove, the fill).

**Open:** whether it plays only drum instruments you load (a plug-in or a hardware drum machine), as
the first round's decision 3 says, or has drum sounds of its own, which would change that decision.
See the design record, decision 1.
