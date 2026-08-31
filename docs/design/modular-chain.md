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

Bus latency is reported, not compensated. `busLatencySamples` tells the truth about what the
longest path costs; making the shorter paths wait for it is not built.

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

## What this deliberately does not do

- **No MIDI routing between parts.** A part's MIDI chain feeds that part's instrument. One part
  driving another's is not built.
- **No latency compensation on buses.** Reported, as above, not corrected.
- **A chain preset is a voice, not a mixer scene.** It does not carry the part's fader, pan, sends,
  name or output routing, and dropping one never moves a part.
- **Chains are per-part.** Capturing several parts and their bus as one record is what a rack
  capture already is; there is no middle format between the two.
