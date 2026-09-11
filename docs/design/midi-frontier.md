# The MIDI frontier — what else this program could do with a cable

> Status: **idea record, 2026-09-11.** Not a plan, not a commitment, and nothing here is built.
> Written against the code as it stands at `310dba0`, in answer to a plain question: *what are the
> genuinely innovative things this program could do with MIDI that other programs cannot do, or can
> only do as a hassle?*
>
> Companion to [`beta-differentiation.md`](../beta-differentiation.md), which asked what is
> *unmatched today*, and [`tier-3-moonshots.md`](tier-3-moonshots.md), which took four bets already
> on the table. This document deliberately looks past both. Where an idea here overlaps one of
> those, it says so and adds only the part that is new.

---

## The three tests an idea had to pass to be in here

A list of clever MIDI features is easy to write and worth nothing. Everything below had to survive
three questions, and a lot of perfectly good ideas did not:

1. **Does it need something this program has and the competition structurally lacks?** Almost
   everything here is a consequence of one architectural decision — that the device layer is a
   *semantic parameter model* rather than a SysEx template. A panel says *"set
   `mainSynth.filter.cutoff` to 8 kHz"* and the engine decides whether that is a CC, an NRPN, an
   RPN, a checksummed SysEx transaction or a no-op. Every idea that follows is downstream of
   that sentence. A program whose device layer is a message template cannot retrofit it, which is
   why "add a widget" is not an available answer to any of them.
2. **Is there already substrate in the tree, or is it a blank page?** Ideas that reuse a shipped,
   tested subsystem are worth several times an idea of equal appeal that starts from nothing. Each
   entry names what it stands on, with file anchors, so the estimate can be argued with.
3. **Does it survive being described honestly?** Every entry carries its limits in the same
   breath as its pitch. An idea that only sounds good when you skip the hard part is not an idea,
   and this repository has a documented habit of writing down the premise so somebody can check it.

## What is already in the tree

The point of this table is that most of the work below is *wiring*, not invention. Nine of these
subsystems were built for some other reason and turn out to be exactly the half somebody else's
feature needs.

| Asset | Where | What it gives the ideas below |
|---|---|---|
| Semantic device model (DPD) | `CE/src/DeviceProfile/DeviceProfileEngine.cpp` | Parameters have ids, groups, units, real ranges, enum labels and seven value codecs. This is the load-bearing one. |
| Byte-diff inference | `CE/web/src/CE_Application/utils/captureInference.js` | Given two dumps and a changed parameter, work out address, codec, range and checksum. |
| Dump parse / checksum shapes | `parseDumpMessage`, `CE/src/DeviceProfile/ProfileChecksums.h` | Record boundaries, checksum families, address-range bookkeeping across multi-message dumps. |
| Device identity | `compileIdentityRequest`, `matchIdentityReply` (`DeviceProfileEngine.cpp:531,584`) | Ask a device who it is, and recognise the answer. |
| MIDI monitor | `DeviceProfileService::getMonitorEvents()` | A live, annotated in/out stream, already emitted to the browser. |
| Echo suppression + coalescing send queue | `CE/web/src/CE_Application/stores/deviceMidiRuntime.js` | Outbound origin tracking, conflict detection, and one value per parameter per frame. |
| Note capture journal | `CE/src/Performance/MidiCaptureJournal.h` | Lock-free ring, 32,768 events, 120 seconds, written from the audio thread. Its own header names "a future MIDI freeze command" as intended work. |
| Sonic measurement | `SonicProfile` in `CE/src/InstrumentHost/Library.h:46`, `SonicProbe.h` | Brightness, spectral centroid, attack, tail, stereo width, noisiness, dynamics — measured from audio, plus `sonicDistance` and `sonicDifferences`. |
| Audio **input** on the exported plugin | `CE/src/Player/PluginProcessor.h:74-76` | A stereo input bus. The exported panel can *hear* the hardware it drives. |
| MIDI health ledger | `CE/src/InstrumentHost/InstrumentHostService.h:774-791` | Stuck notes, jittering controllers, program changes, vanished inputs — judged twice a second. |
| Modular MIDI chain | `CE/src/Performance/MidiInsertRack.{h,cpp}`, `MidiSlot` in `PatternModel.h` | An ordered, hot-swappable chain of typed MIDI modules per part. New module types are cheap. |
| Transport | `CE/src/Performance/Transport.h` | Follows MIDI clock *and* the DAW playhead, with loop points and jump detection. |
| MPE transformer, microtuning | `CE/src/Performance/MpeTransformer.h`, `Microtuning.h` | Expression-format conversion; a shared Scala/MTS tuning table. |
| Patch diff | `CE/src/InstrumentHost/PatchDiff.h` | Two states compared by parameter, in domain language. |
| Librarian + versioning | `CE/src/InstrumentHost/Library.{h,cpp}`, `stores/presetLibrarian.js` | Records, versions, retention, query. |

---

# Thesis 1 — Hardware has no undo. This program can give it one.

Every piece of software written since about 1984 has Ctrl+Z. No hardware synthesiser has ever had
one. You turn the filter, it gets worse, and the sound you had ninety seconds ago is gone for good.
Musicians have simply accepted this for forty years.

The reason nobody has fixed it is not that it is hard. It is that fixing it requires a program that
knows what the last hundred messages *meant* — not that byte `B0 4A 5C` went out, but that
`filter.cutoff` moved from 64 to 92 on the synth called "the Juno", and therefore that sending 64
would put it back. That is the DPD, exactly.

## 1.1 The Time Machine — a scrubbable, semantic history of the whole rig

**What it is.** Every parameter transaction the program sends, and every parameter change it hears
back from the hardware, lands in a history that stores meaning rather than bytes. The UI is a
timeline you scrub:

```
14:32:07   Juno-106   Filter Cutoff        64 → 92
14:32:07   Juno-106   Filter Resonance     12 → 40
14:32:31   Blofeld    Osc 1 Waveform       Saw → Wavetable 43
14:33:02   (hardware) Juno-106   VCA Level  — changed on the front panel
```

Drag the playhead back thirty seconds and the rig goes back thirty seconds. Not the panel — the
*rig*. Branch from any point and carry on; the abandoned branch stays in the history because the
one thing worse than no undo is an undo that eats the good version.

**Why here.** The history is the monitor stream with the profile applied to it, which is a thing
the program already computes for display. What is missing is keeping it, indexing it by parameter,
and being able to run it backwards — and running it backwards is the same `setDeviceParameter` call
that ran it forwards.

**The limits, plainly.**

- `MidiCaptureJournal` packs a message into 32 bits and holds three data bytes, so SysEx does not
  fit in it and never will. Parameter history needs its own store on the message thread. That is
  fine: parameter edits happen at hand speed, not at audio rate, and the journal stays what it is.
- Undo is only as true as the device's obedience. A parameter the profile does not know about is
  invisible to the history; a device that ignores a write silently is not undone, only asked.
- Undo *across a program change* is a restore, not an undo, and must be labelled as one. Stepping
  back past a patch change means re-sending the whole patch, which is bandwidth and a moment of
  silence. Say so in the UI rather than making it look instantaneous and then stuttering.
- A device with no dump support cannot report the front-panel edits in the fourth line above, so on
  that hardware the history is of what *you* sent, and the UI must not imply otherwise.

**Cost.** Medium. The store is small and pure; the timeline UI is the work. The engine is done.

**The line:** *the first synthesiser with an undo button.*

## 1.2 `git status` for your synth — drift detection and reconciliation

**The problem.** The program believes it knows the hardware's state. Then somebody turns a knob on
the front panel, or loads a patch from the device's own menu, or the studio's other user was in
yesterday. From that moment the shadow state is a lie, and you find out when a morph starts from
somewhere unexpected or a snapshot recalls half a sound.

**The feature.** On a schedule, on window focus, or on demand: request a dump, diff it against what
the program last sent, and show the answer as a status line.

```
3 parameters differ from CEditor's state
  Filter Cutoff      CEditor 92   device 51
  LFO Rate           CEditor 40   device 40  (within tolerance)
  Chorus             CEditor Off  device II
       [ Take the device's ]  [ Push mine ]  [ Merge… ]
```

**Why here.** `parseDumpMessage`, the dump collections with their received/missing/duplicate
address bookkeeping, and `PatchDiff.h` all exist. The diff is written. What is new is running it
against a live device on a cadence and giving the answer somewhere to live.

**Limits.** Devices without dump support cannot be checked — say "cannot verify" rather than
"in sync", because a confident lie here is worse than no feature. Polling costs wire, which is why
it should be a client of the governor in 2.3 rather than a timer of its own. And tolerance matters:
a 14-bit parameter that reads back one LSB different is not drift, it is rounding.

**Cost.** Low-to-medium, and most of it is scheduling policy rather than code.

## 1.3 The passive librarian — the backup that happens because you played

**The problem.** "Back up your synth" is a chore that competes with making music and always loses.
People do it the week after the battery dies.

**The feature.** The program is already watching the MIDI stream, and it already notices program
changes — the health ledger counts them by name. So: when the device changes patch, quietly request
the patch, hash it, and if it is new, file it in the library with the date, the bank, the slot and
the name. Deduplicated by content, so playing the same sound for a month costs one record.

After a season of ordinary use you own a complete, dated, searchable library of every sound that
was ever loaded on that machine — including the factory bank you overwrote in 2019 and the patch
you ruined on Tuesday.

**Why here.** The program-change detection is built. `startPresetListScan` already does the active,
foreground version of this (walk the bank, dump each one). The librarian, its versioning and its
retention rules are built. The only new part is the *trigger* and the manners.

**Limits and manners.** It must never interrupt playing: the request queues behind notes and waits
for a gap, which is the governor again. It must be visibly switchable, because a dump request to a
device mid-take is a menace and some devices stall while answering one. And it should be honest
about devices that cannot dump a single patch — for those it is off, not silently doing nothing.

**Cost.** Low. This is the cheapest large-feeling idea in the document.

**The line:** *you never have to back up your synth, because you already did.*

## 1.4 Actual version control for sounds

Given 1.2 and a semantic diff, the rest of version control is not a metaphor — it is available.
Patches in a directed graph: branch a sound, try the aggressive filter on one branch and the long
release on another, and **merge the two**, because "take the filter section from here and the
envelope from there" is a well-defined operation when parameters have groups and meanings. A
three-way merge shows conflicts in parameter names: *both branches moved Cutoff; choose.*

**Why nobody has it.** Merging two patches requires knowing which numbers are comparable and which
are categorical, what a parameter's range means, and which parameters belong to the same section.
That is the DPD's whole job. A SysEx template can diff bytes and cannot merge sounds.

**Limits.** Conflicts in sound are not resolvable by rule and should not pretend to be — a merge UI
that asks is correct, one that picks is not. And the graph needs a story for what happens when the
profile changes underneath it; version the profile reference with the patch.

**Cost.** Medium, and it is mostly UI, because the diff and the librarian's versioning exist.

## 1.5 The Ghost — work with the synth unplugged, reconcile when it comes back

**The problem.** The hardware is in the studio. You are on a train.

**The feature.** A profile plus one captured dump is a complete description of the instrument's
state, so the panel can run against *nothing*: every edit applies to the shadow state and joins a
reconciliation queue. When the device reappears, you are shown the delta and choose to push it —
which is 1.2's merge, arriving by a different road.

**Why here.** The value layer already separates the panel's value from the wire
(`CE/src/Player/PanelValueModel.h` and its `README-value-layer.md`). Off-device operation is mostly
a matter of deciding what "connected" means and being honest in the UI about which mode you are in.

**Limits.** No audio, so no auditioning — the Ghost is for editing and organising, not for sound
design, and it should say so. The deferred push must be explicit: a plugin that floods a synth on
reconnect is precisely the menace the Total Recall plan wrote its Ask / Always / Never policy to
prevent, and this should reuse that policy rather than inventing a second one
(`CE/src/Player/RestorePolicy.h`).

**Cost.** Medium. The interesting work is the reconciliation UI, which is shared with 1.2.

---

# Thesis 2 — MIDI is late, and the entire industry just lives with it

Hardware MIDI latency is real, it is device-specific, it differs between message classes, and
essentially nobody measures it. The universal workaround is to nudge a track earlier by ear until it
sounds right, once, and then never revisit it. Meanwhile DIN MIDI carries 3,125 bytes per second and
a parameter sweep will happily ask for ten times that, which is why hardware morphs stutter and why
a big dump makes the timing fall apart.

This thesis is the unglamorous one. It is also the one that three other features on this list are
silently waiting for.

## 2.1 Measure the latency, per device, per message class

**The feature.** A calibration you run once per device, from the exported plugin or the app. Send a
note; listen on the audio input; time the gap. Repeat thirty times, take the median, and you have
`noteLatencyMs` as a *number* rather than a feeling. Then do it again for the parameter path: write
a cutoff change on a sustained note and time until the audio changes — because a device that
answers a note in 3 ms may take 11 ms to apply a SysEx parameter write, and that difference is the
whole of thesis 5.1.

**Why here, and nowhere else.** The exported plugin already declares a stereo **input** bus
(`PluginProcessor.h:74-76`), so the audio coming back from the synth is already in the process. And
`SonicProbe` already contains the tricky part — deciding, from a buffer, when a sound actually
started, and what changed about it. A hardware editor without an audio path cannot do this at all;
a DAW with an audio path does not know what a parameter is.

**Limits.** It needs the audio patched in, so it is opt-in and must degrade to a typed-in number.
Measured latency includes the interface's own round trip, which must be measured once and
subtracted (a loopback cable, or the host's reported round-trip). USB and DIN differ by several
milliseconds and so does every hub in between, so the number belongs to *this rig today*, not to the
device model — store it per project, offer it as a default.

**Cost.** Low-to-medium. Most of it exists in some form.

## 2.2 Look-ahead automation — send it early so it lands on time

**The problem.** DAW automation reaches hardware late, always, by the device's latency plus the
buffer. Everyone's hardware sits a few milliseconds behind their software, and they mix around it
without ever naming it.

**The feature.** The transport already follows the host playhead. Where the host gives look-ahead,
read the automation curve *ahead* of the playhead and schedule the parameter change to **leave**
early by the measured latency, so that it **lands** on the beat. A filter sweep that hits on the
downbeat instead of just after it is the difference between a part that sits in the track and one
that sounds bolted on.

**Why here.** `Transport.h` already reconciles MIDI clock and the DAW playhead and already detects
jumps (`consumeJumped`) so a scheduler can release what it was holding on a locate. The measured
number comes from 2.1. The sending discipline comes from 2.3.

**Limits, and they are real.** Hosts differ in how much look-ahead they will give, and some give
none; the honest fallback is a fixed offset with the plugin reporting its latency and letting the
host's own delay compensation do the rest — which works, is standard, and should be the default.
Look-ahead is undefined while the user is turning a knob live, so live gestures are sent
immediately and only *automation* is advanced. And a loop jump must flush the look-ahead queue or a
parameter from the future arrives in the past.

**Cost.** Medium. The value is high and the demo is instant: two bars, compensation off, then on.

**The line:** *the first hardware editor that knows how late your synth is, and fixes it.*

## 2.3 The bandwidth governor

**The problem, with the arithmetic.** DIN MIDI is 31,250 baud, ten bits per byte — 3,125 bytes per
second, about one three-byte CC every millisecond if nothing else is happening. A morph across
eighty parameters sent as checksummed SysEx transactions is several kilobytes: more than a second of
solid wire, during which every note-on is *behind it in the queue*. That is why hardware morphs
stutter, why notes hang during a bank send, and why "it worked in testing" stops being true the
moment somebody plays while it happens.

The current model is one number in the profile — `minDelayBetweenMessagesMs`, a fixed gap applied
whatever the traffic — plus per-frame coalescing in the browser
(`queueContinuousParameterSend`, one value per parameter per animation frame). Both are correct as
far as they go. Neither knows how full the wire is, and neither knows that a note matters more than
a knob.

**The feature.** A scheduler that owns the port and knows three things the current one does not:

1. **The budget.** Bytes per second for this port *kind* — DIN, USB, virtual — not a constant. A
   meter shows how full it is and goes red before you can hear it.
2. **Priority classes.** Notes and note-offs jump the queue, always and unconditionally. Then
   transport and clock. Then live parameter gestures. Then automation. Then bulk. A note-off is
   never, under any circumstance, behind a bank dump.
3. **Semantic coalescing.** If `filter.cutoff` moved three times before its first byte left, send
   the last value only. The browser does this per frame; the governor can do it per *budget window*
   and across the whole rig, and it can do it correctly because the DPD answers "are these two
   messages the same parameter?" with a yes or a no rather than a guess.

**Why this is the keystone.** Parameter locks (5.1), the passive librarian (1.3), drift polling
(1.2), morphs and rig unison (4.2) all put unusual amounts of traffic on a wire that also has to
carry the music. Each of them is a bad idea without a governor and a good idea with one.

**Limits.** USB-MIDI is far faster than DIN and sharing one budget number between them would be
wrong, so the budget comes from the port. More subtly, a device's *internal* parsing rate can be
well below its wire rate — plenty of vintage gear will accept bytes faster than it can act on them
and simply drop the difference. That, too, is measurable with 2.1's rig: send N messages at a rate,
read back, find the rate at which the device starts losing them, and record it as a profile fact
with a test vector. A number learned from the device beats a number typed from a manual.

**Cost.** Medium, and it is the highest-leverage medium on the list. It is also the item most likely
to be skipped because it does not screenshot.

## 2.4 The clock doctor

**The problem.** MIDI clock jitter is endemic, device-specific, and diagnosed almost entirely by
feel. "It sounds loose" is not a bug report.

**The feature.** Plot incoming clock intervals as a histogram with the standard deviation named, per
source, so the loose device is identified rather than suspected. Then offer a re-clocked output: a
phase-locked follower that tracks the average and refuses to chase a single late pulse.

**Why here.** The scripting API already ships the same mathematics for a different purpose —
`clockTempo` takes the *median* interval between `0xF8` pulses precisely so one late pulse does
not skew the answer. That is the estimator; the doctor is the estimator plus a display plus a
correction.

**Limits, stated honestly in the UI.** You cannot remove jitter from a clock you are *following*
without adding latency — smoothing means lagging. So the control is a single slider between "tight
to the source" and "smooth", with the added latency shown in milliseconds next to it. A feature
that pretends otherwise is selling a free lunch.

**Cost.** Low for the diagnosis, medium for the correction. The diagnosis alone is worth shipping.

---

# Thesis 3 — The synth will describe itself, if you ask it properly

The Capture Session already turned "read the manual and type" into "turn the knob and confirm". The
ideas here go a step further: get the device to volunteer things that are in *no* manual.

## 3.1 Sonic Capture — learn what a parameter *does*, not just where it lives ⭐

**The problem the Capture Session leaves behind.** Byte-diff inference finds the address, the codec,
the range and the checksum. It cannot find the *name*. So for a 300-parameter synth you still type
300 names, and for an address discovered by diffing you may genuinely not know what it is. The
tier-3 record states the division of labour as a rule: *hardware supplies the bytes, the manual
supplies the vocabulary.* That rule assumes there are only two sources of truth.

**There is a third: the sound.**

**The feature.** Sweep the unknown parameter and listen. `SonicProfile` (`Library.h:46`) already
measures brightness, spectral centroid, attack, tail, stereo width, noisiness, dynamics and peak
from audio, and `sonicDifferences` already orders those axes by how much two measurements disagree.
So: hold a note, write the parameter at 0, probe; write it at 127, probe; the axis that moved is
what the parameter *is*.

| What the sweep does to the measurement | The proposed classification |
|---|---|
| Brightness and centroid move monotonically, nothing else | A filter cutoff or a tone control |
| Attack moves alone | An amplitude or filter envelope attack |
| Tail moves alone | Release, or decay |
| Brightness moves with a peak near one end, non-monotonically | Resonance |
| Width moves | Chorus depth, unison detune, pan spread |
| Noisiness moves | Noise level, or an oscillator waveform |
| Dynamics moves | Velocity sensitivity or a level modulation depth |
| Peak moves alone, everything else still | A level or volume |
| Nothing moves at all | Inactive in this patch — itself a finding worth recording |

The output is a **proposed** name and group with the evidence attached — *"brightness +0.62,
everything else within noise; suggest `filter.cutoff`, group Filter"* — which the user confirms with
one keystroke instead of typing. Wrong guesses cost a correction; right guesses cost nothing.

**Why here and nowhere else.** This needs four things at once: a semantic parameter model to write
into, an audio return, a measured description of a sound, and something to drive the sweep. All four
are in this tree, and three were built for entirely other reasons — the sonic measurement exists
because the Sound Browser wanted to filter 12,000 presets by what they sound like. Nobody else has
this collection of parts in one process.

**Limits, and they matter.**

- It requires audio in, so it is an accelerator, not the path. Capture works without it.
- It classifies **families**, not exact names. "Something filter-ish" is the honest output and the
  UI must present it as a suggestion with evidence, never as a fact. The existing rule — *a capture
  never writes a confirmed parameter without hardware confirming it* — extends cleanly: a sonic
  classification is a hypothesis with a measurement attached.
- A parameter with no audible effect in the current patch reads as nothing. Run the sweep against
  two contrasting patches (a bright sustained one and a percussive one) and report agreement.
- On multitimbral hardware, the other parts must be silent or the measurement is somebody else's.
- Some parameters only matter in combination — a filter envelope amount does nothing at zero
  envelope depth. This is a known blind spot, not a bug, and it should be listed as one.

**Cost.** Medium. The measurement, the probe, the sweep and the profile-writing all exist; the new
code is the classifier, which is a pure function over two `SonicProfile`s and therefore exactly the
kind of thing this repo can test properly.

**The line:** *plug in a synth nobody ever documented, and the program writes the manual by
listening to it.*

## 3.2 The address-space probe — find the parameters the manual never mentioned

**The problem.** Manuals are incomplete, sometimes deliberately. Most classic synths have parameters
that the front panel cannot reach and the implementation chart does not list — the "hidden"
parameters that get traded in forums for twenty years.

**The feature.** For a device with addressable SysEx: walk the space. Write a value to an address,
dump, compare. An address that accepts a write and reads back changed is a parameter. One that
reads back clamped tells you its range. One whose write disturbs a neighbouring value is a bit-field
and should be surfaced as a bit-field candidate — which the capture plan already identifies as a
signal rather than a failure. Feed every discovery to 3.1 and the unknown address arrives with a
sonic classification already attached.

**Why here.** `captureInference.js` already does the hard half — byte-diff to
address/codec/range/checksum with a confidence. What is new is *driving* it actively rather than
waiting for a human to turn a knob.

**The safety section, which is not optional.** Writing to unknown addresses in a device you do not
have a map for can corrupt the current patch, corrupt a bank, or — on some hardware — reach
calibration or firmware regions. So:

- **Take a full backup first and restore it after.** Not a recommendation; a precondition. If the
  device cannot dump, the probe does not run.
- **Stay inside a declared safe window** derived from the address ranges the profile already knows
  about. Going outside it requires an explicit, typed acknowledgement, per session.
- **Never on by default**, never part of a "scan" the user thought was passive, and never without a
  sentence saying what could go wrong.
- Rate-limited through the governor, because a probe is exactly the kind of traffic that will hang
  a note if it is not.

**Cost.** Medium, and most of it is the safety rather than the search.

## 3.3 "What synth is this?" — identify a device by its answers

**The problem.** An unlabelled rack unit in a studio. A cable from a friend. An eBay find with no
manual and a front panel that says nothing useful.

**The feature.** Ask. Identity request first — `compileIdentityRequest` and `matchIdentityReply`
exist and the profiles carry identity data. If it says nothing, fingerprint it by *behaviour*: which
universal requests it answers at all, how long its dump is, which checksum shape closes that dump,
how it responds to a handful of safe standard queries. Match the fingerprint against the profile
library and offer the top candidates with a confidence.

**Why here.** Identity matching and the curated library exist; a fingerprint index is a small
addition to the curation layer that already implements round-trip gates and reputation.

**Limits.** Truly silent devices stay silent, and the answer must be "it will not say" rather than a
guess. The fingerprint is only ever as broad as the library — which makes it a feature that
improves on its own as the library grows, which is the good kind.

**Cost.** Low, given the library.

## 3.4 The SysEx X-ray — read any `.syx` file, profile or not

**The problem.** The internet holds tens of thousands of orphaned `.syx` files. Without an editor for
that synth they are unreadable, and frequently not even identifiable — people archive files whose
names they no longer know.

**The feature.** Drop a file in and get structure, with no profile required:

- The manufacturer byte is in a standard place; so is the device family for anything universal.
- **Repeating record lengths** give away the bank structure — 32 records of 128 bytes is a bank of
  32 patches, and the program can say so without knowing a thing about the synth.
- **Runs of printable ASCII at a constant offset within each record are the patch names.** This one
  finding is most of what anybody actually wants from an unknown bank file, and it falls out of a
  histogram over offsets.
- A trailing byte that satisfies one of the checksum shapes in `ProfileChecksums.h` over the rest
  of the record confirms the record boundary you inferred.
- Then match against the library, and if a profile is found, decode the whole thing properly.

**Why here.** `parseDumpMessage`, the checksum family table and the codecs are built. The structural
guesser is genuinely small — a few histograms and a checksum trial.

**Limits.** It reports structure and names; it does not invent parameter meaning, and should not
imply it has. But note where that lands: a bank file's **name list is exactly the vocabulary the
Capture Session cannot infer**. A `.syx` file from 1987 and a capture session in 2026 are two halves
of one profile, and this is the cheapest way anyone has of getting the first half.

**Cost.** Low. This is the best cost-to-spectacle ratio in the document: drag in a thirty-year-old
bank file and read the patch names out of it.

---

# Thesis 4 — Parameters mean things, so patches are data, so patches have arithmetic

Timbre Space and Preset Constellation already blend whole patches across DPD ranges, stepping enums
and skipping what cannot be interpolated. That machinery is more general than the two components
using it, and pointing it somewhere else is cheap.

## 4.1 Patch algebra

**The idea.** `B − A` is not a patch. It is a *change*: brighter, slower attack, more resonance.
Changes can be applied to other patches, scaled, inverted and averaged.

```
(Brass − Init) × 0.6 + Strings          →  Strings, made 60% more brass-like
(PadA + PadB + PadC) ÷ 3                →  the centroid of three pads
Current + (Current − Yesterday) × 2      →  keep going the way you were going
```

A formula bar over the librarian, with names rather than numbers, and a report of what could not be
computed.

**Why here.** The interpolation rules are written and shipping. This is those rules given an
expression to evaluate instead of a slider to follow.

**Limits.** Subtraction of enumerated values is nonsense — "Saw minus Square" has no meaning — and
must be *reported* rather than silently rounded to something. Non-linear parameters must go through
the DPD's curve rather than a straight lerp, or a "50% brighter" cutoff will be nothing of the sort.
And the result needs an audition before it is committed, because arithmetic on sound is a proposal.

**Cost.** Low-to-medium. The parser is the new part and it is small.

## 4.2 Rig unison — one gesture, every synth, each correctly

**The problem.** You own four synths. Layering them means four editors, four sets of knobs, and four
different numbers that all mean "cutoff" in four incompatible ways.

**The feature.** One control bound to the *meaning* `filter.cutoff` reaches every device in the rig
that has one. The Juno gets a CC, the Blofeld gets an NRPN, the D-50 gets a checksummed SysEx
transaction — each through its own profile, its own range and its own curve — and they all get
brighter together, in tune with each other, from one hand.

**Why here.** The Macro fan-out already does one knob to many destinations with per-destination
depth, curve and range. What is new is destinations in *different devices*, resolved through
*different profiles*, by shared parameter meaning.

**The dependency, and it is worth naming.** This needs the **canonical vocabulary** that
`tier-3-moonshots.md` already identified as the prerequisite for cross-device patch translation — an
agreed set of parameter meanings that profiles map onto, which the library's manufacturer-base
inheritance (`roland.json`, `yamaha.json`, `generic.cc.json`) is already the foundation for. Build
the vocabulary once and **two** flagship features fall out of it. That changes the vocabulary's
business case considerably, and it is the single most important sentence in this document for
planning purposes.

**Limits.** Devices have genuinely different filters; "the same cutoff" is a mapping, not an
identity, and the UI must say "matched", "approximated" or "no counterpart" per device — the same
three-way report the Ctrlr import and the Auto-Panel regenerate already use, for the same reason.
And four devices' worth of parameter traffic from one knob is exactly what the governor is for.

**Cost.** Medium, dominated by the vocabulary.

**The line:** *your rack, played as one instrument.*

## 4.3 Live translation — a Rosetta module in the MIDI chain

Cross-device translation as designed is offline: patch in, patch out. The same mapping table dropped
into the insert chain makes it **live**. `MidiSlot::types()` (`PatternModel.cpp:1280`) has grown
from the six the chain shipped with to fourteen — `arp`, `transpose`, `scale`, `chord`, `velocity`,
`fx`, `echo`, `strum`, `humanize`, `chance`, `length`, `latch`, `mpe`, `articulation` — which is the
evidence that adding a fifteenth is cheap. `translate` is one more entry with a settings block.

What that buys: your 2003 controller's CC map drives a synth that has never heard of it, correctly,
because both ends resolve through meaning. And a performance you recorded in 2009 on a Juno replays
into a Blofeld and still means the same things — the automation survives the instrument.

**Limits.** Same as 4.2, plus the real-time constraint: the mapping must be resolved on the message
thread and handed to the audio thread as a table, the way `MidiInsertRack` already swaps modules
under a spin lock and flushes what the old one was holding.

## 4.4 Patches as diffs — share 200 bytes instead of 20 kilobytes

A patch expressed as its difference from a named factory preset is small, readable and reviewable:
*"this is INIT with fourteen changes"* is a sentence a human can check before loading it. It is also
the honest form for a forum post, and it makes 7.2 possible.

**Cost.** Near zero given 4.1 and the existing diff.

---

# Thesis 5 — The panel already plays. Let it play like hardware that costs more.

The note players, the four modulation sources and the live rig are shipped and, per
`beta-differentiation.md`, undersold. These are the next rung: things that hardware from the last
decade does and hardware from the last century cannot — granted to the old hardware by the panel.

## 5.1 Parameter locks, on a synth from 1983

**The problem.** Per-step parameter locks are Elektron's signature feature and a large part of why
people buy those boxes. A Juno-106 will never have them.

**The feature.** The step sequencer holds, per step, a set of parameter values alongside the note.
Before the step's note goes out, its parameter changes go out. That is all a p-lock *is*.

**Why nobody does it for arbitrary hardware.** Two reasons, both of which this program has already
solved for other purposes. You need a semantic parameter model to store "cutoff = 8 kHz" rather than
a byte for one specific synth — that is the DPD. And you need the parameter messages to arrive
*before* the note without eating the wire — that is 2.1 and 2.3. Absent either one, p-locks on
hardware are a demo that falls apart at tempo, which is why the few attempts that exist are
per-device hacks.

**Limits, and the UI should state them rather than let the user discover them.**

- A device that takes 8 ms to apply a SysEx parameter write cannot lock at 32nd notes at 140 bpm.
  The measured latency from 2.1 says exactly how fast this device can lock; show it as a ceiling in
  the sequencer rather than letting steps silently misfire.
- Some parameters zipper or click when changed while a note sounds. That is measurable with 3.1's
  probe — sweep the parameter under a sustained note and look for a discontinuity in the envelope —
  so "safe to lock" can be a measured per-parameter flag rather than folklore.
- Locking more than a handful of parameters per step is a bandwidth question with an arithmetic
  answer, and the governor should refuse rather than degrade silently.

**Cost.** Medium, and almost all of it is the two dependencies, which are worth building anyway.

**The line:** *p-locks, on a synth from 1983.*

## 5.2 MPE on a multitimbral rack

**The problem.** MPE needs per-note expression. Your six-part multitimbral module has six parts, one
timbre each, and no idea what MPE is.

**The feature.** Allocate incoming MPE notes round-robin across parts, and translate each note's
expression axes into *parameter* changes on the part that took it: bend to bend, slide to whatever
the profile says is the timbre axis, pressure to level or filter. The result is an MPE instrument
assembled out of hardware that predates the specification by twenty-five years.

**Why here.** `MpeTransformer.h` already converts between MPE, poly aftertouch, channel pressure and
CC — that is the format half, shipped and tested. What is new is voice allocation across *device
parts* and expression routed to *semantic parameters* rather than to fixed controllers, which is
only expressible because the profile knows what each part's timbre axis is called.

**Limits.** Polyphony equals part count — six voices, and voice stealing that is audible when you
exceed it. Expression is parameter-rate traffic multiplied by the number of held notes, which is the
most demanding thing on the governor in this entire document; the honest configuration is a
per-axis rate limit with the cost shown. Parts must be identically configured or the notes will not
match each other, which is a setup step worth automating.

**Cost.** Medium-high. It is also a video nobody has made.

## 5.3 Groove transplant — steal the feel from anything

Capture the microtiming and velocity of a passage and turn it into a groove template that the arp,
the phrase sequencer and the step sequencer all wear. Extract from a MIDI file, from a recording of
your own playing, or live from the keyboard part arriving on an input right now.

**Why here.** `MidiCaptureJournal` already stores sample positions, which is the measurement.
`NoteModules.h` already has Humanize — bounded jitter on when a note lands and how hard — which is
the same knob with a random source instead of a stolen one. Replacing the source is a small change
to a shipped module.

**Cost.** Low.

## 5.4 Follow the band — key and chord detection driving the note players

Listen to whatever arrives on an input, detect the key and the current chord, and feed that to the
Harmoniser's scale, the Arp's constraint and the Constraint Cell. Play one finger over the top; the
rig stays in key with the keyboard player without anybody configuring a scale.

**Why here.** Every note player already takes a scale as an input. There is no detector today, and a
detector is a small, pure, thoroughly testable function over a note histogram with a decay — exactly
the shape this repository prefers, and easy to pin with fixtures.

**Limits.** Key detection is ambiguous by nature and wrong occasionally; the UI needs a visible
current guess, a lock, and a manual override, or one wrong bar becomes a wrong set.

**Cost.** Low.

## 5.5 Velocity calibration by playing

"Play twenty notes as evenly as you can." Build the transfer curve from what actually arrived, and
drop it into the Expression Router, which already has drawable transfer curves. The curve is filled
in from a measurement of your hands and your keyboard rather than from dragging a shape and hoping.

**Cost.** Very low.

---

# Thesis 6 — A rig is a system, and systems should verify themselves

## 6.1 Ports that heal themselves

**The problem.** USB MIDI port names and indices change — you unplug an interface, you reboot in a
different order, Windows renumbers something. Saved sessions then point at ports that do not exist,
panels fall silent, and the error message is "no MIDI output", which explains nothing.

**The feature.** Bind a role to the **device**, not to the port. Store a hash of the identity reply
— or, for a silent device, the behavioural fingerprint from 3.3 — alongside the port name. On load,
if the named port is missing or is answering with the wrong identity, probe the ports that *are*
there and reconnect by identity. Then say what moved, in a sentence, rather than silently.

**Why here.** Identity request and reply matching are built; the role→port mapping is already in the
saved plugin state.

**Limits.** Two identical units of the same model cannot be told apart by identity alone — most
devices do not report a serial number. Fall back to "two candidates, you choose", remember the
choice by position in the port list, and never guess between them silently.

**Cost.** Low. This is the least glamorous idea in the document and plausibly the one users would
thank you for most, because it turns a recurring twenty-minute mystery into a sentence.

## 6.2 Soundcheck — one button, the whole rig verified, before the gig

**The feature.** Every device in the project, in thirty seconds, in the dressing room:

```
Juno-106      port found · identity ok · note→audio 4.1 ms · param write verified · ✓
Blofeld       port found · identity ok · note→audio 2.8 ms · param write verified · ✓
TR-8          port found · clock in 119.98 bpm ±0.4 ms · ✓
Micromonsta   PORT MISSING — last seen "MIDIMATE II Out 2"        ✗
Master keys   input alive · 1 stuck note held 41 s — panic offered ⚠
```

**Why here.** Three shipped things, aimed at a new question. The health ledger already judges stuck
notes, jittering controllers, program changes and vanished inputs twice a second
(`InstrumentHostService.h:774-791`). `deviceDiagnostics` exists. The profile's **test vectors
already run** — the curation layer treats round-trip as a hard gate. Soundcheck is those three, one
button, and a result you can read at arm's length.

**Cost.** Low-to-medium, and it is nearly all presentation.

**The line:** *the only editor with a pre-flight check.*

## 6.3 The black box

Always-on, disk-backed, bounded: the last N minutes of everything in and out, with the semantic
annotation the monitor already computes. When something goes wrong on stage, or a user reports that
a profile misbehaves, the stream is there — and "send me your black box" is how a profile bug gets
diagnosed by somebody who does not own the synth.

**Why here.** The monitor is built and `MidiCaptureJournal` is the pattern for the lock-free half.
The new parts are spilling to disk off the audio thread and a clean export.

**Limits, and one of them is a policy.** Bounded by size and time, obviously. Never on the audio
thread. And it must **never transmit anything by itself** — the export is a file the user chooses to
send, with a visible summary of what is in it. A recording of everything you played is not something
to ship somewhere quietly, and the licence document's tone about promises applies here too.

**Cost.** Low-to-medium.

## 6.4 The loop guard

A MIDI feedback loop — out to thru to in — is a classic studio disaster that produces a wall of
nonsense and, often, a hung device. Fingerprint outbound messages and notice the same message
returning within a few milliseconds. Break the loop, and **name the two ports that made it**, which
is the part that saves the twenty minutes.

**Why here.** The runtime already tracks outbound origins and suppresses its own echoes
(`deviceMidiRuntime.js`) — this is that exact mechanism pointed at the rig instead of at the panel.

**Cost.** Low.

---

# Thesis 7 — The unhinged section

Each of these is real. Some are disproportionately expensive. They are here because the question
asked for wild, and because one or two of them are the kind of thing people tell each other about.

## 7.1 The synth as a filesystem

A virtual drive where every patch is a file. `D:\Juno-106\Bank A\` in Explorer. Copy a patch from
the Juno folder into the Blofeld folder and 4.3 translates it on the way. Drag a `.syx` in from a
download and it lands on the synth.

Enormous work on Windows (a shell namespace extension), impossible to justify on a spreadsheet, and
completely unforgettable. Listed because the *idea* is worth having on record even if the answer is
no, and because a much cheaper 80% — drag and drop between library panes — gets most of the feeling.

## 7.2 The patch QR

A patch-as-diff (4.4) compresses to a few hundred bytes, which fits in a QR code on screen. Point a
phone at a forum post, a magazine page, or a paused video frame, and the sound loads. Distribution
with no account, no server, no file and no login — which, for a program whose licence document makes
a point of never holding anything hostage, is on-message as well as fun.

**Cost.** Trivial, given 4.4. It is a rendering.

## 7.3 Patch by audio — "find me something that sounds like this"

`SonicProbe` measures a sound; `sonicDistance` compares two measurements; the library is already
indexed by measurement, and the Sound Browser already offers "sounds like" over that index. Point
the same measurement at eight seconds from a record, or at the microphone, and the librarian offers
the nearest thing **your rig can actually make**.

It is not transcription and must never be sold as one. It is nearest-neighbour in a space that is
already built and already populated. The machinery is shipped; the new part is where the eight
seconds come from.

**Cost.** Low. The demo is very large for the money.

## 7.4 Live coding your actual hardware

**(a) The command bar — build this one.** A single line at the bottom of the panel.
`cutoff 90`. `init`. `compare`. `a/b`. `dump`. Tab completion drawn from the DPD of the synth in
front of you, so `filt<tab>` completes to your JX-8P's real parameter names. Power users will use it
more than the mouse, and it is an afternoon's work over the existing `deviceWrite` and the parameter
list.

**(b) The REPL, and then the live-coding console.** Every live-coding environment in the world
targets software instruments, for the simple reason that none of them know what your hardware's
parameters are called. This program does. A console with hot-reload, over the shipped script sandbox
and its seven languages, with completion from the profile, is a live-coding environment whose
instrument is the rack in the room.

**Cost.** (a) is trivial. (b) is medium and mostly editor work, since the engines, sandbox and loop
guards exist.

## 7.5 Time-travel debugging for panels

Record the inbound stream with the black box, then **replay it deterministically against an edited
script**. Every panel bug that begins "it only happens when the synth sends…" becomes reproducible
on a machine that does not have the synth. This is the developer-facing twin of 6.3 and it is how
profile and script bugs get fixed by somebody who is not in the room with the hardware.

**Cost.** Low-to-medium given the black box, and it makes every *other* feature here cheaper to
support.

## 7.6 Teaching mode

Every message the panel sends, shown in English beside its bytes, with a link to the profile row
that produced it and a sentence about why it is shaped that way. Nobody has ever been able to write
this because nobody had a program that knew both halves at once; the annotation already exists for
the monitor and the profile row is already addressable.

The result is the best MIDI textbook in existence, and it is better than a textbook because it is
annotating *your* synth, live, while you turn the knob. It is also, incidentally, the best possible
recruitment device for people who go on to author profiles.

**Cost.** Low. It is a panel over data the program already has.

---

# Ranking

Cost is engineering effort at this codebase's grain, not calendar time. "Compounds" means it makes
the *next* feature cheaper or the product structurally better, as opposed to being a thing you can
show someone.

| # | Idea | Moat | Compounds | Cost | Notes |
|---|---|---|---|---|---|
| 2.3 | **Bandwidth governor** | Medium | **Yes — four features wait on it** | Medium | The keystone. Does not screenshot; will therefore be skipped unless somebody argues for it. |
| 3.1 | **Sonic Capture** | **Very high** | **Yes — multiplies profile acquisition** | Medium | Mostly wiring two shipped subsystems together. The headline. |
| 6.1 | **Self-healing ports** | Low | No | **Low** | Highest gratitude per engineer-hour on the list. |
| 3.4 | **SysEx X-ray** | Medium | Yes — supplies vocabulary | **Low** | Best spectacle-per-hour. Read a 1987 bank's patch names with no profile. |
| 1.1 | **Time Machine** | **High** | No | Medium | "The first synth with an undo button" is a sentence that sells itself. |
| 1.3 | **Passive librarian** | Medium | Yes — populates the library | **Low** | Needs the governor to be well-mannered. |
| 2.1 | **Latency measurement** | Medium | **Yes — 2.2 and 5.1 need it** | Low–med | Needs the audio return, which the plugin already declares. |
| 6.2 | **Soundcheck** | Medium | No | Low–med | Three shipped subsystems, one button, a printable result. |
| 1.2 | **Drift detection** | Medium | Yes — shares UI with 1.5 | Low–med | `git status` for your synth. |
| 2.2 | **Look-ahead automation** | **High** | No | Medium | Nobody else can even attempt it. Two-bar demo. |
| 4.2 | **Rig unison** | **High** | **Yes — shares the vocabulary with translation** | Medium | Changes the vocabulary's business case: build once, two flagships. |
| 5.1 | **Parameter locks** | **High** | No | Medium | Gated on 2.1 + 2.3. "P-locks on a Juno-106." |
| 7.4a | **Command bar** | Low | No | **Trivial** | An afternoon. Power users will live in it. |
| 5.3 | **Groove transplant** | Low | No | Low | A source swap on a shipped module. |
| 5.4 | **Follow the band** | Medium | No | Low | A pure function the note players already have a socket for. |
| 6.4 | **Loop guard** | Low | No | Low | Existing mechanism, new target. |
| 7.6 | **Teaching mode** | Medium | No | Low | Reputation feature. Makes profile authors. |
| 6.3 | **Black box** | Low | **Yes — support and 7.5** | Low–med | Never transmits by itself. |
| 4.1 | **Patch algebra** | Medium | Yes | Low–med | Shipped interpolation rules, given an expression. |
| 1.4 | **Version control for sounds** | **High** | No | Medium | Mostly UI, given the diff. |
| 7.3 | **Patch by audio** | Medium | No | Low | Existing index, new input. |
| 5.2 | **MPE on a rack** | **High** | No | Med–high | The most governor-hungry idea here. |
| 1.5 | **The Ghost (offline)** | Medium | Yes — shares 1.2's merge | Medium | Reuse the Total Recall policy; do not invent a second one. |
| 3.2 | **Address-space probe** | High | Yes | Medium | Do not ship without the backup step. |
| 7.5 | **Replay debugging** | Low | **Yes — supports everything** | Low–med | Developer-facing; makes the rest supportable. |
| 3.3 | **Device fingerprinting** | Medium | Yes | Low | Improves as the library grows. |
| 4.3 | **Live translation** | High | No | Medium | Needs the vocabulary. |
| 2.4 | **Clock doctor** | Low | No | Low/med | Ship the diagnosis; the correction is a lagging trade-off, say so. |
| 4.4 | **Patches as diffs** | Low | Yes — enables 7.2 | **Trivial** | Falls out of 4.1. |
| 5.5 | **Velocity calibration** | Low | No | **Trivial** | Fills in a curve that is already drawable. |
| 7.2 | **Patch QR** | Low | No | **Trivial** | Given 4.4, it is a rendering. |
| 7.1 | **Synth as a filesystem** | — | No | Very high | Recorded so the answer can be "no" on purpose. |

## If you build three

**2.3 the bandwidth governor, 3.1 Sonic Capture, 6.1 self-healing ports.**

One is infrastructure that four other features are silently waiting for; one is a headline that a
competitor cannot answer by adding a widget; one costs almost nothing and removes a recurring
twenty-minute mystery from every user's life. Between them they cover the three things a feature can
be: the thing that makes the next thing possible, the thing people talk about, and the thing people
are quietly grateful for.

**If you build one more for the demo reel:** 3.4, the SysEx X-ray. Drag a thirty-year-old bank file
onto the window and watch the patch names appear, for a synth the program has never heard of.

**If you build one more for the product:** 4.2 rig unison — because its dependency, the canonical
vocabulary, is *already* the prerequisite for cross-device translation in Tier 3. One piece of
groundwork, two flagship features, and neither is expressible by anybody whose device layer is a
SysEx template.

## What these have in common, and why it matters strategically

Every idea in this document is downstream of one decision: **the device layer compiles intent, not
messages.** Undo needs to know what a message meant. Drift detection needs to compare states by
parameter. Patch algebra needs ranges and curves. P-locks need a value that is "8 kHz" and not a
byte. Rig unison needs cutoff to mean cutoff on four machines. Sonic Capture needs somewhere to
write a finding that is not a byte offset.

A competitor can copy any single feature here in isolation, badly, for one device. They cannot copy
the property that makes all thirty of them cheap at once, because it is not a feature — it is the
shape of the program. That is the same argument `beta-differentiation.md` makes about the Capture
Session, and it holds for everything above, which is itself the evidence that the argument is right.

## What is deliberately not here

- **Anything requiring a server, an account or a subscription.** The licence document is explicit
  that an expired entitlement never disables anything; a feature that phones home to work would
  contradict it. 7.2 exists partly because it is distribution with no server in it.
- **AI-shaped features beyond the one already designed.** `tier-3-moonshots.md` puts a model behind
  manual import under strict constraints — optional, bring-your-own-key, schema-validated, never a
  silent network call. Nothing here needs to relax those, and 3.1 deliberately reaches the same goal
  by measurement instead, because a measurement can be tested and a generation cannot.
- **MIDI 2.0 features for their own sake.** They belong to
  [`midi2-integration-plan.md`](midi2-integration-plan.md) and its sequencing by ROI is right: most
  hardware in users' hands is MIDI 1.0, and every idea above is deliberately expressible without
  UMP. Where MIDI 2.0 helps, it helps quietly — per-note controllers would make 5.2 far less
  governor-hungry on devices that speak it.
- **Anything that widens CI or adds a job.** Per `CLAUDE.md`, that is the owner's call.
