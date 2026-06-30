# Chord Generator — Design Notes

> Status: **idea / design.** A generative MIDI source: a trigger emits a chord.
> Sibling to the existing arpeggiator. Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

## What it is

A **generative MIDI source** — on a trigger it emits a *set* of note-ons (offs on
release). A different family from parameter controls and displays: it *produces*
MIDI. Output goes through the panel runtime MIDI path (target-aware: standalone
port vs plugin host bus — see [midi-workbench.md](./midi-workbench.md)).

## Forms (each its own palette component, per the separate-components principle)

1. **Chord pad** — press → a defined chord; release → note-offs.
2. **Chord bank / strip** — a row of chord pads (e.g. a I–IV–V–vi progression).
3. **Scale-locked diatonic strip** — pads auto-fill with the diatonic chords of a
   chosen key (I, ii, iii, IV…), so the strip stays in key.
4. **Chord harmonizer** — a *behavior*, not a pad: transforms *incoming* notes
   (play one note → adds chord tones; "chord memory"). A MIDI-transform node.

## Parameters

Root (fixed or from trigger note) · chord type (maj/min/7/sus/dim/aug/9/11/13/
custom intervals) · inversion · voicing (open/closed/drop-2/3, octave spread) ·
per-note velocity/accent · **strum/roll** (stagger note-ons over time → uses the
[Timer system](./timer-system.md)) · hold/latch · channel.

## Two ideas worth elevating

- **Shared panel "musical context" (key + scale).** A panel-level key/scale that
  chord pads, the arpeggiator, *and* the on-screen keyboard all read — so the
  whole panel stays in key, and changing the key re-harmonizes everything. The
  genuinely novel systemic piece (more than the chord pad itself).
- **A "generative MIDI" component family** — chord generator + arpeggiator +
  keyboard. The gaps survey only listed "keyboard"; these three share the
  note-emit substrate and the musical context, and deserve to be grouped.

## Reuse vs new

**Reuse:** `utils/customComponentArpeggiator.js` (note-block model, MIDI note
math, `noteNameFromMidi`, runtime values, emit path); the Timer (strum); the
panel runtime MIDI output path.

**New:** the music theory — chord types/intervals, scale/diatonic mapping,
voicings/inversions — none of which exists today; and the shared key/scale
context.

## Feasibility

Moderate, no audio needed (note math + MIDI out). The substrate (arp + Timer +
MIDI out) exists; the new work is the theory layer + musical context.

## Open questions

- Where does the shared key/scale live — a panel-level setting other components
  read (like a panel "musical context" store)?
- Chord pad vs harmonizer: separate component (pad) + behavior (harmonizer)?
- Voicing engine depth (basic triads/7ths first; drop voicings later).
