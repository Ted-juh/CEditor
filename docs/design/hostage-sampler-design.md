# HoSTage: samples, on pads and keys

*A proposal with mockups, approved by the owner on 2026-11-19 with one change: "It shouldn't just be
tied to drum pads.. the keys could also work or be assignable. But this is nice, document it." So a
sample plays from the keys as well as the pads, on one key or across a range. Nothing built. Feature 12 of
`hostage-build-features-2.md`, asked for as "what about a sampler?" and then "give me a proposal".
Mockups: `hostage-sampler-mockups.html`, pictures `docs/media/hostage-sampler-1.png` (the dock) and
`-2.png` (two CTRL49 pages). When this and the code disagree, the code is right.*

## What it is for

Playing short sound files from pads and from the keys: a horn stab, a riser, a vocal shout, a
count-in, an impact, your own drum hits. A sample can sit on one key or across a range of keys,
pitched, so a stab or a vocal shout can be played as a melody. The drum machine plays them like any
instrument.

## Why sample pads, and not a sampler

**Today** HoSTage plays no sound files of its own; the library reads files only for its sound
previews. The first round already allows two things close to this: a **file player** among the
built-in utilities (decision 3) and **backing tracks, play-only** (decision 1). Decision 3 rules
out built-in synths, and the drum machine's decision 1 kept it to the instruments you load.

A "sampler" is two different things:

- **Sample pads (one-shots)**: one file a pad, played as it is. This is the file player made
  playable: the files arrive finished and nothing is synthesised, so it is on the right side of the
  line. It also matters on Linux, where few sampler plug-ins exist, which was one of decision 3's
  reasons.
- **A full sampler instrument**: many samples across keys and velocities, loops, envelopes,
  filters. That is a synth in all but name; it stays with plug-ins (Kontakt, Decent Sampler, SFZ
  players).

This proposal is the first only. It is the one built-in that makes sound, and it extends the file
player decision 3 already allows rather than adding a synth.

## 1. In the dock

![Sample pads in the dock](../media/hostage-sampler-1.png)

- **A built-in instrument**, "Samples", in a part's chain like any instrument, before its effects.
  Its block says the kit's name, how many samples it has and how much memory it takes.
- **Sixteen pads a bank, four banks**, each pad one sample, with its name, its keys and its waveform.
- **Pads and keys alike** (the owner's change): every sample is on a pad and on the keys. **One
  key**, as a drum hit is; or **a range of keys, pitched** from a root key, so the brass stab plays
  as a melody from C3 to C5. A **keyboard map** under the pads shows which keys play what. Keys are
  set by **Play the keys** (the lowest, the highest, the root) or by dropping a file on the keys.
- **Getting files in**: drop files on pads, or a whole folder: each file on its own pad, named after
  the file, and a file whose name says kick, snare, hat or clap goes on that drum's General MIDI note.
  From the library too, where a set of pads is saved as a kit.
- **Each pad**, in words first ("Plays from the attack to just before the room noise, fading out over
  the last 40 ms, on every key from C3 to C5, pitched from C4. It stops when the next stab
  starts"), then: start and end on the waveform; a fade in and out; level (with **Even it**, as for
  parts); pitch in semitones; **plays to the end** or **while held**; how much a soft hit is quieter;
  **stops** itself or a group (the closed hat cuts the open one); its keys.
- **Nothing more**: no loops, no filter, no envelope beyond the fades, one file a sample. Many files
  across the keys and velocities is a sampler plug-in's job (decision 3).

## 2. On the CTRL49

![Two pages on the CTRL49](../media/hostage-sampler-2.png)

- **SAMPLES**: the bank on the pads, each with its waveform, and the keys playing what is mapped
  to them; play, or hold SELECT and press a pad or a key to edit its sample. Knobs: the bank, then
  each pad's level.
- **TRIM**: the selected sample on its waveform: start, end, the fades, level, pitch, strength and
  its keys on the knobs; pads to hear it, choose how it plays and its group.
- Which knob and pad does what is settled when the pages are built (the second round's rules).

## 3. Files that travel with the show

- The show names its files; **Collect files into the show** copies them into the show's folder, so a
  show, a USB stick player or another computer has them.
- A file that cannot be found is a red pad, "not on this computer · Find…", as a missing plug-in is
  named today, and the rest of the kit plays.
- **Every file is loaded into memory when the show opens**, never read from the disk while playing;
  the block shows how much memory the kit takes.

## What it needs

- **A built-in instrument** that plays files from memory: start, end, fades, level, pitch,
  held or to the end, choke groups, one key or a pitched range of keys; in the audio thread, no worker, so no isolation block
  (decision 7 applies to plug-ins only).
- **Reading sound files**: JUCE's audio format readers, as the library already uses for previews.
- **The kit's place in the show**, the collect command, and the missing-file state.
- **The dock view and the two pages.**

## Decisions (owner, 2026-11-19: "this is nice, document it", with the keys)

1. **One-shot samples, as the built-in file player made playable**: one file a sample, no loops,
   filters or envelopes, a full sampler left to plug-ins. **Yes**, and **not tied to the pads**:
   every sample plays from the keys too, on one key or across a range, pitched.
2. **The settings as listed**: start and end, fades, level, pitch, to the end or while held,
   strength, choke groups, and its keys. **Yes.**
3. **Files collected into the show**, missing ones shown like a missing plug-in, everything in
   memory when the show opens. **Yes.**
4. **SAMPLES and TRIM** on the CTRL49, as drawn, with the keys added. **Yes.**
