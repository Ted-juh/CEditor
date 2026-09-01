# The modular chain: instruments, MIDI modules and inserts as separate things

Status: **as built**, in three phases, on top of the Stage 5–8 rack. Where this document and the
code disagree, the code is right.

## The problem it solves

The rack started with a part's MIDI processing welded shut. Every part had exactly one
`MidiFxSettings` and exactly one `ArpSettings`, in that order, for ever: note shaping into the
arpeggiator, no other arrangement expressible. You could not put a chorder *before* the arp — the
single most common reason to own a chorder — and you could not have two transposers, or an arp
feeding a second arp, or none at all.

The audio side had the opposite half of the same problem. A part's inserts belonged to the part,
and a part was one instrument, so two instruments could never become one signal that then went on
through shared effects. The mixer offered sends and returns, which take a *copy*; there was no way
to say "these two go here, and here is where the pair keeps going".

And there was no way to keep the result. A user preset captured the instrument's state alone: not
the modules ahead of it, not the inserts behind it, not the zone it played in. Rebuilding a voice
meant rebuilding it by hand.

## What was built

**Phase 1 — the MIDI insert chain.** `perf::MidiSlot` (in `CE/src/Performance/PatternModel.h`) is
one module: an id, a type from `MidiSlot::types()` — `arp`, `transpose`, `scale`, `chord`,
`velocity`, `fx` — a bypass flag, and both settings blocks, of which the type decides what is read.
`RackPart::midiChain` is an ordered array of them, capped at `perf::MidiInsertRack::maxSlots`.

`perf::MidiInsertRack` (`CE/src/Performance/MidiInsertRack.{h,cpp}`) is the runtime: one module
object per slot, built on the message thread, swapped in under a `juce::SpinLock`, and freed
outside it. A rebuild leaves notes stranded in whatever the old modules were holding, so the swap
raises `pendingFlush` and the next `process` call flushes them — a rebuilt chain never hangs a
note.

Migration is by construction. `migrateLegacyEventChain (fx, arp)` turns a pre-chain part's two
settings blocks into the two slots that describe them, and part serialization still *writes* the
legacy blocks so an older build can open a newer session. The proof that it works is that every
test written before the chain existed passes unchanged.

The part-level commands — `setPartMidiFx`, `setPartArp`, and everything on the control pages and
the CTRL49 that calls them — still mean "this part's FX" and "this part's arp". They write the
first slot of their family, minting one if the chain has none.

**Phase 2 — group buses.** `BusChain` is a named destination with its own insert chain, its own
fader, and its own destination: the master, or another bus. `RackPart::destinationBusId` says where
a part leaves. A bus differs from a return in exactly the way that matters here: a part *sends* a
copy to a return and still reaches the master itself, while a part *routed* to a bus goes there and
nowhere else.

Cycles are refused where they are made. `busRoutingWouldLoop` is checked by the command, not
discovered by the audio thread walking the graph; a bus fed back into itself or into its own
ancestor is an error with a sentence in it. A manifest that arrives with a dangling or looping
destination — a hand-edited file, a bus deleted elsewhere — falls back to the master rather than
refusing to load.

**Bus latency is compensated, and this document used to say it was not.** Corrected on
2026-09-01, after the compensation pass this note called for was written, measured, and found
to be a second one: `juce::AudioProcessorGraph` has done plug-in delay compensation all along.
`RenderSequenceBuilder::createRenderingOpsForNode` takes `getInputLatencyForNode` over each
node's inputs and inserts `DelayChannelOp`s for the shorter ones
(`juce_AudioProcessorGraph.cpp`, JUCE 8.0.7, lines 1136-1258). Two parts layered into a bus
through unequal inserts have always arrived together; adding a pass on top made the fast one
arrive *late*, compensated twice.

The evidence is a test rather than a reading of the source:
`RackHostTests::testLatencyCompensation` plays a note through two parts of different latency
into one bus and asserts the summed output has ONE step in it, not two. It uses an effect stub
that reports its latency *and* incurs it — against one that only reports, the graph would
align paths that were never misaligned and the test would prove nothing.

The lesson is the one this repo keeps relearning: the premise was never written down, only the
conclusion, so nobody could check it. Hence the line numbers above.

`busLatencySamples` and `partLatencySamples` still exist and still report what the PLUG-INS
cost, which is what the mixer wants to show — they name the thing to blame. What the rig costs
end to end is `InstrumentRackHost::graphLatencySamples()`, the graph's own number.

**Phase 3 — chain presets.** `saveChainToLibrary` captures one part as a `LibraryRecord` of type
`chain`: the instrument and its state blob, the MIDI modules ahead of it, the inserts behind it,
and the zone it played in. The manifest is a `Performance` carrying exactly one part, so it reuses
the serialization the rack already proves rather than inventing a second document format.

Loading one replaces the *voice* and nothing else. The part keeps its identity — pages and
bindings still address it — its position in the rack, and its fader. The old inserts are removed
through the same path every other removal uses, so their editors and nodes die with them.

Two honesty rules decide what happens when something is missing, and they are different on
purpose:

- **A missing effect is named, and the rest still loads.** You get an error naming the plug-in and
  a voice that plays without it.
- **A missing instrument refuses, and changes nothing.** The instrument is resolved before anything
  is torn down, because half a chain over the previous sound looks like it worked.

For the same reason the library marks a chain unavailable only when its *instrument* is gone:
flagging the whole record for one absent reverb would be a lie told before you asked.

## Six more MIDI modules

Added 2026-09-01. The chain had modules that transform or reorder what you play — transpose,
scale, chorder, velocity, and the arpeggiator. It had nothing that puts a note somewhere the
keyboard did not.

| Module | What it does |
| --- | --- |
| Echo | each note repeats, quieter each time, optionally climbing |
| Strum | a chord spread in pitch order, up or down |
| Humanize | bounded jitter on when a note lands and how hard |
| Chance | a note passes, or it does not |
| Note length | every note the same length, or held until the next |
| Latch | the chord keeps sounding after you let go |

**Echo is not the arpeggiator.** The arp reorders notes you are *holding*; echo repeats *each*
note through time. Nothing here did that, which is why it was the first one built.

**Everything is timed in beats, never milliseconds.** Milliseconds would need a sample rate
this layer does not have, and would make a strum that is right at 90bpm wrong at 160. Beats put
every module on the same grid the arp and the pattern lanes already share — the one timing
authority — and they free-count from the same tempo when the transport is parked, exactly as
the arp does, so a rig that is not running still plays.

**Every default is transparent**, which is a rule this chain already had and these six nearly
broke: *an inserted module must not change the sound by existing*. A fresh echo repeats
nothing, a fresh strum spreads nothing. Latch is the one that cannot be transparent while doing
its job, so it has a switch of its own and starts off.

**Strum collects before it deals, and that costs a sixty-fourth note.** You cannot strum a
chord you have not finished hearing: the notes arrive over a few milliseconds, so emitting each
as it lands can only ever strum in *arrival* order — which is not pitch order and cannot go
downwards at all. The collection window is what buys pitch order and both directions, it is
deliberately small, and it is skipped entirely when the spread is zero.

**What every one of them owns.** Each either invents notes or swallows the note-off for one it
passed on, so each owns something that must be releasable: panic reaches all six, and so does
retyping or removing a slot. A module that emits and forgets is a stuck note, which on stage is
the only bug that matters — so the tests assert note-on/note-off balance on every path,
including the half-chance one where which notes sound is random.

## What this deliberately does not do

- **No MIDI routing between parts.** A part's MIDI chain feeds that part's instrument. One part
  driving another's is not built.
- ~~**No latency compensation on buses.**~~ Wrong when written; the graph always did it. See
  above, and the test that pins it.
- **A chain preset is a voice, not a mixer scene.** It does not carry the part's fader, pan, sends,
  name or output routing, and dropping one never moves a part.
- **Chains are per-part.** Capturing several parts and their bus as one record is what a rack
  capture already is; there is no middle format between the two.
