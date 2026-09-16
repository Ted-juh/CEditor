# Raising the bar — the features that need the program to listen, to know, and to promise

> Status: **idea record, 2026-09-16.** Not a plan, not a commitment, and nothing here is built.
> Written against the code as it stands at `f1039c9`.
>
> Fourth in a sequence. [`beta-differentiation.md`](../beta-differentiation.md) asked what is
> unmatched *today*. [`tier-3-moonshots.md`](tier-3-moonshots.md) took four bets already on the
> table. [`midi-frontier.md`](midi-frontier.md) asked what else the program could do *with a
> cable*. [`product-ideas.md`](product-ideas.md) covered everything that was not MIDI.
>
> This document was asked to **raise the bar** on all four, which is not a brief until somebody
> defines it. The definition is the first section, and it cost more thought than most of the
> entries did. Where an idea here touches one in an earlier record, it says so and adds only the
> part that is new; there is a table of those overlaps at the end, because the honest version of
> "this is new" is a list of the things it is new *against*.

---

## What "raising the bar" was taken to mean

The frontier record set three tests. They were good tests and every idea below still passes them.
They are not enough on their own, because an idea can need this program's architecture, stand on
shipped substrate, and survive an honest description, and still be a thing a reviewer would call
*nice*. Four more tests were added, and they are much harsher:

1. **Is it a sentence one musician says to another?** Not a feature name — a sentence. "It found
   the sound on my own Juno by listening to a record." "It told me which voice on my Six-Trak is
   sick." "My 1983 synth shows up in Live with real parameter names." If the idea cannot be said in
   one sentence to somebody who does not care about software, it is a feature, not a selling
   point, and this document does not want it.
2. **Could a competitor build it with unlimited engineers?** If the answer is yes, it is out. The
   only acceptable answer is *no, because their program structurally cannot* — and the reason has
   to be named. Two reasons recur. One is the frontier record's: the device layer compiles intent,
   not messages. The other is new here and is the reason this document exists at all: **this
   program is the only editor in the category that also hosts audio.** `PluginProcessor.h:75-76`
   declares a stereo *input* bus; `SonicProbe.h` measures eight perceptual axes off a render. An
   editor cannot hear. A DAW can hear but has no semantic model of the hardware. This program has
   both, and nobody else has both.
3. **Is the claim measurable?** A feature that can be demonstrated but not tested is out. This
   repository has a documented habit of writing the premise down so somebody can check it, and a
   feature should be held to the same standard as a `CLAUDE.md` section: if the pitch is "it makes
   the synth sound better", there is a number that says so or the pitch is decoration. Every entry
   below names what it would measure and what the measurement's own error bar is.
4. **Does it close a loop that is currently open?** This is the one that generated most of the
   list. It is developed in the next section.

Perfectly good ideas failed these. A MIDI-over-network jam feature fails 2 (anyone can build it)
and the licence promise (it needs a server). A "smart patch suggestion" feature fails 3 (there is
no measurement that says a suggestion was good). A hardware appliance build fails 1 by being a
product rather than a feature. They are not recorded individually; the last section records the
categories.

## The one sentence

**Every idea in the three earlier documents ends with the program sending something. Every idea
here ends with the program checking what came back — or making a promise that something else can
rely on.**

That is the whole of it. The frontier record extends what the program can *say* to hardware, and
it is a long list because saying things is what an editor does. This document extends what the
program can *know* — about the sound, about your particular unit, about the way you play — and
what it can *promise*, to a DAW, to another program, and to the person who has to decide whether
to trust a profile they did not write.

Open loops are everywhere in this category and nobody notices, because the whole category is
open-loop. You send a CC and hope. You load a patch and hope. You buy an editor and hope its
author got the SysEx right. You tune your analog polysynth by ear and hope it stays. Closing any
one of those is a feature nobody else in the category is positioned to ship, and closing them is
cheaper here than anywhere else because the two halves — a semantic parameter model and an audio
return — are already in the tree for other reasons.

## What is in the tree that the earlier documents did not spend

The frontier record has a table like this and it is the most useful thing in it. This is the
complement: assets that are built, tested, and **not** claimed by any of the four earlier
documents. Each is load-bearing for something below.

| Asset | Where | What it unlocks here |
|---|---|---|
| **Audio input on the exported plugin** | `CE/src/Player/PluginProcessor.h:75-76` | The return path. The frontier record names it and spends it twice — §2.1 measures latency with it, §3.1 sweeps a parameter and listens. Neither *aims*: both measure once and write the finding down. Theses A and B put a controller after the measurement. |
| **The probe and its eight axes** | `SonicProbe.h`, `SonicProfile` in `Library.h:46-66` | brightness, centroid, attack, tail, width, noisiness, dynamics, peak, plus a 48-point envelope — with `sonicDistance` as a weighted objective function and `sonicDifferences` as a per-axis explanation. An optimiser needs an objective; this is one, already written and already tested. |
| **The probe's constants** | `ProbeSpec` in `SonicProbe.h:32-53` | 1.2 s hold, 0.8 s tail, C3, velocity 100 and a 40 pass, and an 80 ms settle wait that exists because Surge XT loads programs on its own thread. Every cost estimate below is arithmetic on these numbers rather than a guess. |
| **MIDI-CI responder, vendored and unused** | `JUCE/…/juce_midi_ci/ci/juce_CIProfileHost.h`, `juce_CIPropertyHost.h`, `juce_CIResponderDelegate.h`, `juce_CISubscriptionManager.h` | `MidiCiSession.cpp:30` sets `withPropertyExchangeSupported (true)` and uses the *initiator* half only. The half that answers is sitting in the vendored tree with nothing calling it. Thesis C is almost entirely that discovery. |
| **Cross-part voice allocation** | `LayerRouter.h` — 64 parts, 32 groups, 8 members, `Allocation::{all, roundRobin, leastBusy}` | Round-robin and least-busy allocation across parts, with note-off routed to exactly the parts that won the note-on. Written for the internal rack. Thesis D is this pointed at hardware. |
| **The always-on journal** | `MidiCaptureJournal.h` — 32,768 events, 120 s, lock-free | Everything you play is already recorded, including while the transport is stopped. Thesis F is a statistics pass over a buffer that is already full. |
| **A simulated synth, in the test suite** | `CE/web/test/support/fakeSynth.js` | A fake with a known map, a checksum, a bit-field, a packed payload and a volatile counter. Thesis G's conformance runner can be tested in CI against it, on Linux, with no hardware — which is the difference between a feature that ships and a feature that is permanently "needs a Juno to test". |
| **Legal-range randomisation with locks** | `CE/web/src/CE_Application/utils/randomizer.js` | A candidate generator that already refuses to leave the profile's declared ranges and already honours per-parameter locks. A search over a synth's parameter space needs exactly that and nothing more. |
| **Soft takeover** | `CE/src/InstrumentHost/MidiPickup.h` | The mechanism that decides when a control may seize a value. Thesis A.4 needs it to guarantee a servo never fights the player's hand. |
| **Groove as data, applied** | `GrooveTemplate`, `factoryTemplates()`, `applyGrooveTemplate` in `PatternModel.h:95-141` | Built. `product-ideas.md` already corrected the frontier record on this. Thesis F supplies the one missing input: a template measured from you. |
| **Shared tuning** | `Microtuning.h`, `MicrotuningMidi.h` | One Scala/MTS table the whole rig subscribes to, so several machines can be made to agree on what a note is. Thesis D cannot work without it and it is finished. |

The pattern `product-ideas.md` identified at its end holds here too, and harder: **the engineering
is usually done and the spending is not.** Six of the eleven rows above are complete subsystems
with no consumer for the capability this document wants out of them.

---

# Thesis A — Close the loop. The program can hear the synth, so it can aim at a sound.

Every parameter move in every hardware editor ever written is fire-and-forget. The program sets
cutoff to 84 and has no idea what happened, because a program that cannot hear has no idea what
*anything* sounds like. This is so universal it reads as a law of nature rather than a limitation.

It is a limitation, and this program is one wire away from not having it. The exported plugin
declares a stereo input bus. The sound browser's probe plays a note and writes down eight numbers
about what came out. Put a controller between those two facts and the program stops setting values
and starts **aiming at sounds**.

Four things fall out, in increasing order of ambition. They share one piece of machinery, and
building A.2 gets most of the way to all four.

## A.0 The thing that has to be built first: measure the measurement

Everything in this thesis rests on `sonicDistance` meaning something, so the first job is to find
out how much it means. Play one patch, unchanged, ten times. Measure it ten times. The spread in
those ten answers is the **repeatability floor** — the distance below which two sounds are
indistinguishable *to this rig on this day*, including the converter, the room if there is one, the
machine's own noise and the analog drift that Thesis B is about.

Nothing below is trustworthy without this number and everything below is cheap once it exists:

- A search that converges to within the floor has *converged*, and can stop and say so honestly
  rather than grinding.
- A salience ranking whose deltas are under the floor is a ranking of noise, and should print
  "nothing here measurably changes this patch" rather than a confident list.
- A servo's deadband is the floor plus a margin, which is what stops it hunting.
- A conformance contract (Thesis G) that asserts a sonic property states its tolerance in these
  units and is therefore falsifiable.

It costs ten probes — about 25 seconds — and it is the single highest-leverage twenty lines in
this document. It is also the reason this thesis passes test 3 while "AI patch design" does not:
a generated patch cannot tell you how sure it is, and a measured one can.

## A.1 Find that sound, on the hardware you own

**The sentence:** *"I played it a record, and it found the sound on my own Juno."*

Give the program a target — an audio file, a sample, a bar of a track, a preset from the library,
or another synth's patch — and it searches your actual hardware's parameter space, listening after
every move, and hands back the patch that got closest. With the distance it achieved, the eight
axes ranked by how well each one matched, and a plain sentence about what you are giving up.

The pieces are all here. `randomizer.js` generates legal candidates and respects locks, so the
search never leaves the profile's declared ranges and the user can pin the oscillator selection
and search only the filter. `sonicDistance` is the objective. `SonicProbe` is the evaluation.
The device engine is what turns a candidate into whatever bytes the machine wants. What is
missing is the loop and the strategy, which is a few hundred lines of coordinate descent with
seeded restarts, and no new dependency.

**What it costs, in real numbers.** Hardware runs in real time and cannot be rendered faster, so
every candidate costs a parameter send, a settle, and the probe: 1.2 s hold plus 0.8 s tail plus
the settle, call it 2.5 s. Three hundred candidates is about twelve minutes. That is not a defect
to apologise for — it is a feature that runs while you make coffee, and a feature that can run
over a bank overnight and have a hundred starting points waiting in the morning. Say twelve
minutes in the UI and show the distance falling; a progress bar that is also a convergence plot is
an honest one.

**The limits, in the same breath.** It converges to a local optimum, and restarts are the only
answer, which is why the estimate is three hundred candidates and not thirty. It matches
*character* on eight perceptual axes, not identity — this is not a spectrogram fit and will never
reproduce a specific sample, and the UI must say "closest on brightness, attack and width; the
tail is 40% shorter than the target" rather than "match: 94%". It needs an audio return, which the
plugin declares and the standalone would have to grow. It works best on a patch whose character
survives one C3 at velocity 100, which is most subtractive sounds and not a sequenced arpeggio
preset. And A.0 governs: if the target is inside the repeatability floor of several different
patches, the program should hand back all of them and say they are indistinguishable, because that
is the true answer.

**Why nobody else can.** A plugin can do parameter search offline in seconds, and several do. On
hardware it needs real-time evaluation, a semantic model that knows which parameters are legal to
move, and an audio path back into the editor. No hardware editor has the audio. No DAW has the
model.

## A.2 The panel rearranges itself around the patch

**The sentence:** *"It greys out the sixty knobs that do nothing for this sound and gives me the
four that matter."*

This is the cheapest idea in the document and possibly the best one, and it is pure measurement.
It is also the one that reuses the most: the sweep-and-listen machinery is the frontier record's
§3.1, pointed at a different question. §3.1 sweeps an *unknown* parameter end to end to work out
what to call it. A.2 nudges a *known* parameter around the patch you are holding to work out
whether it currently matters. Same probe, same distance function, opposite use — and §3.1's table
already anticipated the answer without spending it, in the row that reads *"nothing moves at all —
inactive in this patch, itself a finding worth recording."* This is the entry that records it.

Take the current patch. Perturb one parameter by ±10% of its range, probe, and record the
`sonicDistance` from the unperturbed sound. Put it back. Do the next one. What comes out is a
**salience ranking**: a measured, per-patch, per-unit statement of which parameters actually move
this sound and which are inert right now. Not an opinion, not a heuristic, not an author's
guess — a number, with the A.0 floor underneath it as the threshold for "this does nothing".

Every synth editor ever written, including this one, draws all 128 parameters with equal weight
for ever. The instrument itself does too. But a patch with the filter wide open does not care
about resonance, an unrouted LFO's rate is decoration, and a single-oscillator patch has a whole
panel of dead controls. The machine cannot know this. This program can *measure* it.

**What you do with the ranking:**

- **Dim what does nothing.** The panel keeps its layout — moving controls around would be worse
  than useless — and simply lowers the contrast on the parameters whose measured effect is below
  the floor, with one click to restore. The panel stops lying about where the sound lives.
- **Generate macros that are musical.** The top axes, orthogonalised, are four knobs that each do
  something big and different. A "macro 1" that is 70% cutoff, 20% resonance and −15% envelope
  amount is not a preset author's taste; it is the measured principal direction of this patch's
  timbre. Every other program asks the user to build macros by hand and most users never do.
- **Explain a patch to somebody learning.** "These four things are what this sound is" is the
  single most useful sentence in synthesis teaching, and it has never been derivable before.
- **Aim A.1.** A three-hundred-candidate search over the eight parameters that matter beats one
  over all sixty, and this is how you find the eight.

**What it costs.** Two probes per parameter at 2.5 s each. A Juno-106's thirty-odd continuous
parameters is about two and a half minutes. Cheap enough to offer per patch, and cheap enough to
run over a whole bank overnight and store the ranking on every record in the library.

**The limits.** One-at-a-time perturbation is blind to interaction — resonance measures as inert
when the cutoff is at maximum, which is *correct for this patch* and misleading if the user then
lowers the cutoff. Two answers, both honest: re-rank when the patch changes materially, and run an
optional second pass over pairs of the top eight, which is 28 pairs, 56 probes, another two and a
half minutes, and catches the interactions that matter. The ranking is of a single C3 at velocity
100, so a parameter that only does something at the top of the keyboard measures as inert; the
velocity-40 pass already in `ProbeSpec` partly covers this and the honest UI line is "measured at
C3". And a parameter whose effect is not audible but is *structural* — a keyboard mode, a MIDI
channel — must be excluded by kind rather than measured, which the profile's parameter groups
already support.

## A.3 Automation that outlives the instrument

**The sentence:** *"The automation in my project says 'brighter', not 'CC 74 to 83', so it still
works after I sold the synth."*

Once A.2 has measured which parameter combinations move which perceptual axis, the exported plugin
can publish parameters that are **intentions** rather than addresses: `brightness`, `attack`,
`weight`, `motion`. The DAW automates those. The device layer, which already compiles intent to
messages, compiles them further — from a perceptual target down to the parameter moves that
achieve it on *this* machine, using the mapping A.2 measured.

The consequence is the sentence above. Automation written against an intention survives a patch
change on the same synth, and — with the canonical vocabulary that `midi-frontier.md` §4.2 needs
for rig unison, the one piece of groundwork two flagships share — it survives the *instrument*
changing. Your 2026 session opens in 2031 on different hardware and the filter sweep is still a
filter sweep.

**The limits.** The mapping is per-patch, so an intent parameter is only as stable as the patch
under it; changing the patch mid-project has to either re-measure or hold the last mapping and
say which. The perceptual axes are the probe's eight and no more, which is a deliberately small
vocabulary — it does not include "aggression". And this one is gated on A.2 in a hard way: without
a measured mapping it degrades to a hand-built macro, which is a thing that already exists.

## A.4 The servo — hold a measured target while the machine drifts

**The sentence:** *"It keeps the synth in tune while it warms up, because it can hear that it
isn't."*

A slow closed loop that holds a measured property at a target by trimming a parameter:

- Hold the filter's self-oscillation at the pitch you asked for on a machine whose filter tracking
  is a suggestion.
- Hold the output level constant across a bank, so auditioning patches stops being a volume
  rollercoaster — automatic gain staging for hardware, from `SonicProfile::peak`, which is already
  measured on every record in the library.
- Hold brightness constant as an analog machine warms and its filter corner walks (see B.2).

**This is the entry with the most ways to be dangerous, so it carries the most rules.** It must be
explicitly armed, per parameter, never on by default. Any manual move of that control disarms it
instantly — `MidiPickup.h` is the mechanism that already knows how to decide this and reusing it
means there is one answer to "who owns this value" rather than two. Its deadband must be the A.0
floor plus a margin, or it will hunt for ever and burn the machine's MIDI bandwidth doing it. It
must be rate-limited into the send queue that already coalesces one value per parameter per frame
(`stores/deviceMidiRuntime.js`), and it is one of the four features the frontier record's bandwidth
governor (§2.3) is silently waiting for. And it may only target a parameter whose measured
response is monotonic — which is a contract, which is Thesis G, which is the second time in this
document that these ideas turn out to need each other.

**The limit worth stating loudest:** a servo that is wrong is worse than no servo, because it
moves your sound while you are not looking. Everything above is the design that makes it safe, and
if any of it is cut, cut the feature instead.

---

# Thesis B — Your unit, not the model. An instrument has a body, and it ages.

A device profile describes a *model*. You own a *particular* Juno-106, and it is not the same
instrument as the next one off the line. `product-ideas.md` §22 found this gap by grepping for its
absence — there is no per-unit concept anywhere in the tree — and proposed the human half: a place
to keep the notes every hardware owner writes on paper, and per-unit calibration offsets somebody
types in.

This thesis is the half that cannot be typed in, because nobody knows the numbers. **The program
can measure them.** It is the same closed loop as Thesis A pointed at the instrument's body rather
than its patch, and it produces something no music software has ever produced: a document about
the physical condition of a specific machine.

## B.1 Per-voice calibration of an analog polysynth

**The sentence:** *"It told me voice 3 is fourteen cents flat and its filter tracks eight per cent
low. I'd been blaming the room for a year."*

Every owner of an analog polysynth knows the machine is really six or eight monosynths that are
supposed to agree and do not. It is most of what people mean when they say a Juno sounds like a
Juno. It is also, when one voice goes far enough out, the most frustrating fault in hardware to
diagnose, because it only appears on some notes of some chords.

**The problem that makes it interesting: you cannot address a voice.** There is no MIDI message
for "play this on voice 3". A few machines have test modes and unison settings that help, and most
have nothing.

**The solution, which is the good part of this idea.** You do not need to address the voices. Play
the same note sixty-four times, alone, with a gap, and measure each one. A polysynth's voices are a
*mixture distribution*, and sixty-four samples separate it: the measurements fall into clusters,
the number of clusters is the voice count, and the spread between cluster centres is the deviation
table. You learn how many voices the machine has and how far apart they are without knowing which
physical card is which — and on the very common machines that allocate round-robin in a fixed
order, the sequence of cluster memberships *is* the allocation order, so after that you can predict
which voice takes the next note.

That last step is what turns diagnosis into compensation, and it is the step that may not be
available, so the feature has to be honest about which mode it is in:

- **Diagnosis works on everything.** The table, the ranking, and a printable page.
- **Compensation works where allocation is predictable.** Pre-send a per-note pitch offset, or a
  per-note parameter trim on a machine that has one, ahead of the note that voice will take.
- **Playing to it works everywhere.** Voice-aware note allocation on the program's side: keep the
  exposed melody off the sick voice, or — because this is music and not a repair shop — put it
  *on* the sick voice deliberately, because the one weird voice is why the machine sounds like
  itself.

**What it costs.** Sixty-four probes at 2.5 s is under three minutes, and the probe is already
written. The clustering is a one-dimensional k-means over pitch and a handful of other axes; it is
fifty lines and it is testable off hardware against a simulated allocator with known offsets, which
means it can be a CI test rather than a story about a Juno.

**The limits.** It needs a clean signal path — one voice at a time, no effects, no reverb tail
overlapping the next measurement, which the 0.8 s tail in `ProbeSpec` mostly handles and a note gap
finishes. It measures what the probe measures, so it catches pitch, filter corner, level and
envelope timing, and does not catch a scratchy pot. A digital polysynth will come back with one
cluster and a flat table, which is the correct and slightly boring answer, and the UI should say
"all voices identical, as expected for a digital instrument" rather than showing an empty chart.
And allocation on some machines is deliberately not round-robin, in which case compensation is
unavailable and the feature says so instead of guessing.

## B.2 The warm-up curve — your synth is in tune before it is warm

**The sentence:** *"It knows my Prophet takes eleven minutes and it's in tune for all of them."*

Measure a reference note every thirty seconds from cold for half an hour. What comes back is a
curve, and it is *your unit's* curve, not a forum anecdote. Then two things become possible that
have never been possible: pre-compensate the master tune along the inverse of that curve so the
first ten minutes of a session are usable, and tell the user when the machine has actually
settled — defined as the derivative falling below the A.0 floor, which is a real definition rather
than a vibe.

Sixty probes over thirty minutes, entirely unattended, once. The limit is that the curve depends on
ambient temperature and the program does not have a thermometer, so it should record the curves it
has measured and say "this matches your February run" or "this is settling slower than usual" —
which is, incidentally, how a machine tells you something is wrong with it.

## B.3 The medical record, and the document you hand the next owner

**The sentence:** *"Here's eighteen months of measurements. The filter has drifted, and here's
the page for the tech."*

B.1 and B.2 produce numbers. Keep them. The library already versions records with retention rules
(`Library.{h,cpp}`, `SnapshotStore`), so storing a dated measurement set per unit is an existing
shape, not a new subsystem.

What longitudinal measurement gives you is the thing no music software has ever offered:

- **Drift you can see.** "Cutoff at maximum has fallen 400 Hz since March" is a trim pot walking or
  a capacitor aging, eighteen months before it becomes audible and a year before you would have
  blamed yourself.
- **A service sheet.** A generated page a technician can read: per-voice deviations, the warm-up
  curve, the drift history, the measurement method and its error bar. A music program that emits a
  repair document is not a category anybody has entered.
- **A condition report for a sale.** Hardware is bought and sold on photographs and trust. A
  measured, dated, method-stated condition report changes that transaction, and it costs nothing
  to generate because the measurements were taken for other reasons.

**The limits.** It is longitudinal, so it is worth nothing on the first day and a great deal in
year two, which is a hard thing to sell and an easy thing to build early. The measurements are
comparable only if the signal path is, so the record must store the interface, the levels and the
probe spec alongside the numbers, and refuse to draw a trend line across a converter change rather
than drawing a wrong one. And nothing here is a diagnosis — the page says what moved, not what is
broken, and the wording must keep that line because the alternative is a program telling somebody
to reflow a board.

---

# Thesis C — Retrofit the future. Make a 1983 synth a MIDI 2.0 citizen.

`midi2-integration-plan.md` sequences MIDI 2.0 by return on investment and its M1 is live
MIDI-CI discovery: broadcast an inquiry, and for each device that replies, run Property Exchange
and draft a profile from what it says about itself. That work has landed —
`CE/src/DeviceProfile/MidiCiSession.{h,cpp}` is the initiator, and `MidiCiSession.cpp:30` turns on
Property Exchange support and asks.

**M1 asks. This answers.**

Everything in `juce_midi_ci` that *responds* is vendored in this repository and called by nothing:
`juce_CIProfileHost.h`, `juce_CIPropertyHost.h`, `juce_CIResponderDelegate.h`,
`juce_CISubscriptionManager.h`. The class is the same class on both sides; `Device::getProfileHost()`
and `Device::getPropertyHost()` are sitting at `juce_CIDevice.h:255-270`. What is missing is the
decision to point them outward.

Do that, and CEditor becomes a MIDI-CI device on a virtual port, standing in front of a synth that
predates the standard by four decades and answering on its behalf. Anything else on the system —
a DAW, a hardware sequencer, a program written by somebody who has never heard of CEditor —
discovers a self-describing, modern instrument.

## C.1 The responder

A virtual port pair appears, named for the machine behind it: `Juno-106 (CEditor)`. Open it and:

- **Discovery** gets a real MUID and a product instance id. The machine exists as far as the
  protocol is concerned.
- **Property Exchange** hands over `DeviceInfo` and `ChannelList`, and then the valuable one — a
  resource listing every parameter the profile knows, with its real name, its group, its unit and
  its enum labels. Your DAW's parameter list for a Juno-106 is suddenly populated, correctly, with
  "Chorus: Off / I / II" rather than "CC 93". **The DPD already contains every byte of that.**
  This is a serialisation, not an invention.
- **Subscriptions** mean the host is told when a value changes, including when it changed because
  somebody moved a slider on the machine's own front panel — which the capture layer already
  watches for.

**Why it is bigger than it looks.** Every other idea in every one of these documents makes CEditor
a better application. This one makes it **infrastructure**. A profile authored here stops being
useful only inside this program and starts being useful to every piece of software on the machine,
including software whose authors will never know why their parameter list got good. That is a
different kind of moat: the Ctrlr corpus import (`beta-differentiation.md` §4) plus the manual
importer (`tier-3-moonshots.md` §1) plus this turns a library of profiles into a public good with
one program at the centre of it.

## C.2 High resolution in front of a seven-bit machine

MIDI 2.0's parameter values are 32-bit. The Juno's are seven. A responder can accept the former and
be the thing that turns it into the latter *well*: receive a smooth 32-bit automation ramp,
interpolate it in the program, and emit the seven-bit steps with the timing and the smoothing that
makes them inaudible, instead of the host emitting 128 steps and a staircase.

This is an honest claim and it needs an honest word. The resolution is **presentational**: you get
to write, store and edit automation at full resolution, and the wire is still seven bits. What
improves is the *stepping*, which is the thing people actually complain about, and it improves
because the program between the two ends has a value model, a coalescing send queue
(`stores/deviceMidiRuntime.js`) and — once the frontier record's §2.3 bandwidth governor exists —
a budget to spend the steps against. Without the governor this feature is a way to flood a 1983
serial port, which is the third time the governor has turned out to be load-bearing.

## C.3 Profiles the machine does not have, implemented in front of it

MIDI-CI Profile Configuration lets a device declare "I implement the Drawbar Organ profile" and a
controller then knows what every control does without configuration. No vintage machine declares
anything. CEditor can declare on its behalf — and then *implement* the profile, mapping its
required controls onto whatever the machine actually has, which is precisely the translation the
device layer already does.

The same mechanism answers per-note controllers: the host sends per-note pitch and timbre, and the
program allocates them across channels or voices on a multitimbral machine. That is
`midi-frontier.md` §5.2 (MPE on a multitimbral rack) reached through the protocol instead of
through a panel, and the two want the same allocator.

## The limits — and two corrections, both made within a day of writing this

**This section has been wrong twice, and both versions are kept because the way they were wrong is
the useful part.**

**Draft one** said Windows has no virtual MIDI ports, that JUCE cannot make one, and that C.1
therefore needed a third-party virtual cable (loopMIDI, teVirtualMIDI) or a signed kernel driver of
our own — "the single biggest obstacle in this document".

**Draft two** corrected the conclusion and kept the premise. It found that **Windows MIDI Services
reached general availability on Windows 11 in February 2026** — a rewritten MIDI stack with MIDI
2.0, UMP, multi-client ports and built-in loopback endpoints — and that those loopbacks are visible
to WinMM clients, so JUCE's bytestream ports could open one. C.1 became "a documented setup step".

**Draft three, which is this one, found that the premise itself expired eight months before the
document was written.** The thing every draft kept asserting — `MidiOutput::createNewDevice` is
absent from `juce_Midi_windows.cpp` — is still literally true, and it is now the wrong function to
be looking at. **JUCE 8.0.11 (December 2025) added a UMP device layer**, and it carries
`juce::universal_midi_packets::Session`, whose `createVirtualEndpoint()` creates an app-owned
virtual MIDI endpoint **on Windows, backed by Windows MIDI Services**. On that platform Windows
MIDI Services only permits UMP endpoints, so JUCE creates one carrying a single MIDI 1.0 Block —
which is exactly what a responder standing in front of a 1983 synth wants.

Checked against the 8.0.11 tag rather than inferred: `juce_MidiDevices.h` at that tag declares
`ump::EndpointId getEndpointId()` on both `MidiInput` and `MidiOutput` and holds a
`std::shared_ptr<ump::Session>`; the legacy `createNewDevice` is still documented Linux/macOS/iOS
only, which is why three drafts in a row read the old function and concluded the old thing.

**So the obstacle is gone entirely, and the shape of the thesis changes with it.** There is no
third-party cable, no driver, no WinRT code of our own and no user setup step: CEditor creates its
own endpoint named `Juno-106 (CEditor)` through JUCE. And C.2–C.3, which draft two called "a
Windows SDK project", are not one either — the UMP transport is in the framework now, so 32-bit
controllers and per-note messages can leave the program through JUCE like anything else.

**The whole of thesis C is now gated on one thing: a JUCE upgrade.** This tree vendors 8.0.7.

The lesson is the one `CLAUDE.md` records about the CI-minutes section, and it is worth the
repetition because this document reproduced the failure twice while quoting the file that warns
about it: **the premise was never written down, only the conclusion.** "Windows has no virtual
MIDI" was true for twenty years. "JUCE cannot make one on Windows" was true until December 2025.
Both were inherited rather than re-checked, and the second draft re-checked the platform without
re-checking the framework.

**What is actually left, stated as limits:**

- **The JUCE upgrade is the real cost now, and it is not free.** `JUCE/VENDORED.md` records the
  local patches this tree carries — the runtime VST3 identity hook that lets one prebuilt binary
  export per-panel FUIDs, the Windows named-pipe cancellation fix, and the Linux webview bridge
  byte-framing fix — each of which dies silently in a vendored tree the day somebody drops in a new
  JUCE, which is why `CE/web/test/vendoredJucePatches.test.js` exists. JUCE 9 also moves the
  WebBrowserComponent native-integration package, which this program is built on top of. None of
  that is hard; all of it is work that belongs in C's estimate rather than being discovered during
  it.
- **Windows 11 only.** Windows MIDI Services ships to in-support retail releases of Windows 11.
  Windows 10 users get nothing here, and the feature must degrade to absent rather than to broken.
- **Nothing here has been tested on a real Windows 11 box by this document.** It is read off
  Microsoft's documentation, the GA announcements and the JUCE source at the 8.0.11 tag. Before C
  is scheduled: upgrade JUCE on a branch, call `createVirtualEndpoint`, and send one SysEx through
  it from another application. That is an afternoon, and it is the difference between this section
  and the two it replaced.
- **Host support for MIDI-CI Property Exchange is thin today** and will stay thin for a few years.
  The feature is partly a bet on the ecosystem, and its value grows with somebody else's roadmap,
  which is the least comfortable kind of value. The counter is that the Property Exchange payload
  is also just JSON — the same data can be written as a `.midnam` and a Cubase map today, which
  `product-ideas.md` §23 already proposes, and which is the cheap version of this idea that works
  right now.
- **A responder is a surface.** Anything on the system can talk to it. It needs the same
  deny-by-default posture as the existing stage lock (`utils/stageLock.js`), and it should refuse
  to expose anything destructive over the port at all.

---

# Thesis D — The rig is one instrument

You own five machines. You play one of them at a time, because playing five means one keyboard
split five ways, five different tunings, five different latencies and five different volumes, and
the result sounds like five machines badly glued together — which is how it sounds because it is.

Everybody who has tried this has given up on it, and the reason is not the note routing. Note
routing is easy and several programs do it. The reason is that a rig has never been *aligned*,
because aligning it needs three measurements that nobody has had in one place.

This program is about to have all three.

| Alignment | What it needs | State |
|---|---|---|
| **Pitch** | One tuning table every device subscribes to | **Built.** `Microtuning.h`, `MicrotuningMidi.h` — Scala and MTS, one table, any number of parts. |
| **Time** | Per-device MIDI-to-sound latency | `midi-frontier.md` §2.1, which needs the audio return the plugin declares. |
| **Level and timbre** | Per-device measured output | **Built.** `SonicProfile::peak`, `brightness`, `tail` — measured by the same probe as everything else. |

And the allocator is built too: `LayerRouter.h` already runs one allocation decision per live note
across up to 64 parts in 32 groups, with `roundRobin` and `leastBusy` policies, and it already
remembers which parts won a note-on so the note-off reaches exactly those. It was written so the
internal rack could layer plugins. It has never been pointed at hardware.

## D.1 Rig polyphony

**The sentence:** *"Five synths, forty voices, one keyboard, and it sounds like one instrument."*

Play a chord too big for any one machine and it spreads across the rig. Each device gets the notes
it can take, at the tuning the whole rig agreed on, delayed so every note lands together despite
the Juno answering 4 ms later than the Blofeld, at a level the program measured rather than one you
guessed with a mixer fader.

The demo is trivially convincing and impossible to fake: play a ten-note chord on a six-voice
synth, hear it complete, and see which machine took which note.

## D.2 Voice stealing you cannot hear

**The sentence:** *"It steals the note you were least likely to miss, on the machine with the
shortest tail."*

Every polysynth steals voices and every one of them does it badly, because the machine knows
nothing about the music. A rig-level allocator knows two things a machine cannot:

- **Which note matters.** A held bass note under a phrase is not a passing sixteenth. Nothing
  stores a note's *importance* today and nothing needs to: it is derivable from what is already
  there — `PatternStep::gate`, `tie` and `velocity` say how long and how hard the sequencer meant
  it, and the live path knows which keys are still down. A held, loud, low, long note is the one
  you would miss.
- **Which device will be quietest about it.** `SonicProfile::tailSeconds` is measured on every
  sound the browser has probed. Stealing from the machine whose release is 80 ms is inaudible;
  stealing from the one with a 6-second tail is a hole in the music.

Nobody has done measured, musical voice stealing, because it needs the measurement and the
musical context in the same process, and nothing else has both.

## D.3 One patch across five machines

The rig's state as a single object: each device's part stored as intent rather than as bytes,
saved and recalled as one instrument. This is where Thesis D meets the canonical vocabulary that
`midi-frontier.md` §4.2 (rig unison) and `tier-3-moonshots.md` §2 (cross-device translation) both
already depend on — a third consumer for one piece of groundwork, which is an argument for building
the vocabulary rather than an argument for this.

**The limits of the whole thesis.** Latency alignment means delaying every device to match the
slowest, so the rig's total latency is the worst member's — fine in a studio, a judgement call on
stage, and something the user must be able to see and cap. Devices differ in more than level and
tuning: a chord split across a bright machine and a dark one sounds split, and the honest answer is
to show the measured difference and let the user decide rather than to "correct" timbre with EQ
this program does not have. And a machine with a slow or non-deterministic note-on response will
spoil the alignment for everybody; the measurement will say so, and the UI should let that device
be excluded from a group rather than degrading the group.

---

# Thesis E — Edit rules, not notes

Every sequencer in existence edits events. You place a note, you move a note, you delete a note,
and when the chorus changes key you do it again for every note that no longer fits.

This is so normal it is invisible, and it is the reason a hardware rig's sequenced parts are
brittle. The information that would fix it — that this bass line is *supposed to* follow the chord,
that this hat lane is *supposed to* stay out of the kick's way, that this part is *supposed to* be
about 40% dense and never leap more than a fifth — exists only in the musician's head. The
sequencer stores its consequences and throws away its causes.

The pattern engine here is unusually well placed to store the causes. `PatternModel.h` has typed
lanes with their own step counts and rates (polymeter falls out for free), steps carrying the full
vocabulary of gate, tie, probability, swing and microtiming, and `PatternCompiler` turns the
editable model into the flat preallocated form the audio thread reads. That compile step is the
opening: **make the compiler a solver.**

## E.1 The constraint layer

A lane gains rules alongside its steps. Harmonic ones ("fit the scene's chord", "chord tones on
strong beats" — `utils/musicalContext.js` already holds one key and scale for the whole panel),
rhythmic ones ("density 40%", "never two adjacent steps", "stay out of lane 3"), registral ones
("inside these two octaves", "no leap over a fifth"). Compile, and the solver fills the lane.

Two decisions make it an instrument rather than a toy:

**Every step is pinned or derived.** You placed it, or the solver did.

This is the part of the proposal that argues with the code, and the argument should be had before
anything is built rather than after. `Lane`'s Euclidean fill carries a comment that is a deliberate
decision, not an accident: *"Euclidean generation is a fill button, not a mode: it writes real steps
the user can then edit, so nothing downstream has to know a lane was generated."* That is the
opposite of what E.1 wants, and it is a good rule — it is why the compiler, the scheduler, the
serialiser and every editor can treat all steps alike. E.1 asks for one bit per step and claims the
rule still holds, because a derived step is still a real step and everything downstream still sees
one; only the editor and the solver read the bit. If that claim does not survive contact with
`PatternCompiler`, the honest outcome is to keep the existing rule and drop E.1, not to weaken it. Editing a derived step pins
it — the thing you just played is now a fact the solver has to work around, not something it will
overwrite on the next reflow. Deleting a rule reflows only the derived steps. This is the whole
interaction model and it is one bit per step.

**It is deterministic** — and half of that is already the house position. `PatternStep::probability`
is documented as *"0..100, rolled against a deterministic seed"*, so this engine already decided
that a chance-based step must play the same way twice. E.1 is that decision applied one level up:
(rules, seed) produces the same notes, today and in three years, on somebody else's machine. Almost every generative sequencer ever shipped rolls dice at *playback*
time, which is why generative parts cannot be relied on and cannot be handed to anybody. Seeding
the solve instead of the playback makes a generated part a *thing*: it can be exported inside a
panel, shipped to a user, and it will play what the author heard. **That is the structural argument
for doing this here rather than anywhere else** — this program exports a plugin, so a generative
part has to survive leaving the building, and determinism is the only way it does.
`product-ideas.md` §29 already asked for seeds to be something you can hold; this is what they
would be holding.

## E.2 Rules are performable

Rules are data on the pattern, so they are scene-able and automatable like everything else on it.
A scene change is a re-solve. Change the density from the panel and the part rewrites itself in
time. Point the harmonic rule at the frontier record's §5.4 key-and-chord detection and the
generated part follows the band — not by transposing what it has, which is what a transposer does,
but by *regenerating* against the chord that was just detected, which is what a player does.

## E.3 Failure has to be legible, and that is most of the work

"Density 90% and never-two-adjacent, on seven steps" has no solution, and a solver that shrugs is
worse than no solver. It must report the **minimal unsatisfiable subset** — the smallest set of
rules that cannot all hold — and offer to relax one, with a preview. This is a well-understood
problem for problems this small and it is the difference between a feature people use and a
feature people are frightened of.

**The limits.** The solving is genuinely easy — sixteen to sixty-four steps and a handful of rules
is a tiny search, a seeded backtracker with restarts, no SAT dependency, no new library. The work
is entirely in interaction design: how a rule is expressed without a syntax, how pinned steps are
shown, what happens visually when a lane reflows under your cursor, and how much motion is too
much. That is a hard design problem and it should be spiked on paper with a real pattern before a
line is written, the way the Lua block editor's round-trip was spiked before its proposal.
A second limit: rules that are easy to state are easy to overuse, and a lane with nine rules
produces exactly one legal answer and stops being music. The UI should say when a rule set has
collapsed the space, which is measurable — count the solutions found in the first N restarts.

---

# Thesis F — The machine learns you

Every groove template in every program is somebody else's feel. The MPC swing settings, the
"Bonham" preset, the humanise knob that adds uniform random jitter because uniform random jitter is
what a random number generator produces. All of it is a stranger's timing, or no timing at all,
applied to your music.

Your own feel has never been available as data, and the reason is that nobody was recording. This
program already is. `MidiCaptureJournal.h` writes every channel-voice message you play into a
lock-free ring — 32,768 events, 120 seconds, from the audio thread, **including while the transport
is stopped**, which is when most playing actually happens. The comment at the top of that file
names retrospective capture and the looper as its intended consumers. There is a third.

## F.1 Your feel, measured

Take the journal's snapshots over a few sessions and build a distribution: for each position in the
bar, how early or late you land and how hard you hit, conditioned on tempo band and on register.
Not a model of music — a model of *your hands*, and a small one. A few hundred numbers.

**It is deliberately statistics and not a network,** for three reasons that matter more than the
accuracy difference. It can be *drawn*, so you can look at your own feel as a chart and discover
that you rush the second sixteenth, which is worth the feature on its own. It can be *edited*,
so you can exaggerate it or dial it back. And it can be *tested* against a fixture in CI, which a
network cannot, and this repository does not ship things it cannot test.

## F.2 What you do with it

- **Quantise to me.** Snap to the grid, then re-apply your own measured offsets. Every quantiser
  ever written destroys feel and then offers you a percentage of it back; this one replaces the
  grid with you.
- **The arpeggiator plays like you.** The humanise module (`NoteModules.h`) already applies bounded
  jitter in PPQ to timing and velocity, and everything in that file is deliberately musical rather
  than in milliseconds. Replace its uniform RNG with your distribution, seeded, and machine parts
  stop announcing themselves as machine parts. This is a small change to a shipped module and it is
  the single most audible item in this document.
- **Fill in my hand.** A chord the sequencer generates is voiced and rolled the way you voice and
  roll chords.
- **Give it away.** The profile is a file. "Play my drummer's feel" becomes possible, and unlike a
  sampled groove template it carries velocity and register conditioning, and it was earned rather
  than extracted from somebody's record.

Everything here lands in `GrooveTemplate` and `applyGrooveTemplate` (`PatternModel.h:95-141`),
which are built, have a factory set, and are already applied by the pattern engine.
`product-ideas.md` §29 established that only *extraction* is missing. This says what to extract
from and why it should be you.

**The limits.** It needs a corpus — a few sessions, not a few bars — and the feature must say so
rather than producing a confident profile from ninety seconds. Feel is contextual: your timing on a
ballad is not your timing on a fast funk part, which is why the model is conditioned on tempo band
and why it should refuse to extrapolate to a tempo it has never seen you play. And it must never be
on silently; a program that quietly moves your notes toward a model of you is a program you will
eventually fight.

---

# Thesis G — A profile is a claim, and a claim can be checked

Every hardware editor ever sold asks for trust and offers nothing to back it. The author says
address 0x33 is the filter cutoff. Maybe it was, on their unit, on a firmware from 2004. You find
out it is not by debugging your *synth* for an evening before it occurs to you to suspect the
software — which is exactly the failure `captureInference.js` was written to avoid at authoring
time, and which nothing addresses at run time.

`captureInference.js` got the principle right and stated it in its own header: every inference
carries its confidence and its evidence, high confidence writes a parameter, low confidence writes
a candidate, and nothing writes silence. **Move that principle from authoring time to run time and
the whole trust problem changes shape.**

## G.1 Contracts in the profile

A profile already asserts things implicitly — this address, this codec, this range, this checksum
family. Make them explicit and executable:

- `roundTrip(parameter)` — write it, read it back, get it back.
- `monotonic(parameter)` — sweeping it moves a measured axis in one direction. (This is the
  contract Thesis A.4 requires before it will servo anything, and Thesis A.2's salience pass
  produces the evidence for free.)
- `enumLabelsMatch(parameter)` — the machine's own display says what the profile says it says,
  where the machine can be asked.
- `respondsWithin(parameter, ms)` — a bound the frontier record's §2.1 latency measurement checks.
- `dumpStable()` — two dumps with nothing changed between them are identical, which is how you
  discover the volatile counter that `fakeSynth.js` already simulates.

## G.2 The conformance run

Connect the hardware, press one button, get a report. Every contract in the profile, executed
against *your* unit, with a pass, a fail, or a "could not test and why". It takes minutes and it is
unattended.

This is the answer to a question every user of every editor has asked and none has been able to
answer: **is this profile right for my machine?** Not right in general — right here, on the unit in
front of me, on its firmware.

The report is a file. No server, no account, no telemetry — which is not squeamishness, it is the
licence document's promise that an expired entitlement never disables anything, and a feature that
phones home to work would contradict it.

## G.3 How the library gets better with nobody sending anything automatically

A failing contract is not a bug report. It is **data about hardware**.

Three users' reports disagreeing with the profile in the same way, at the same address, is not
three broken profiles — it is a board revision, or a firmware version, and the profile should grow
a `revisions` branch rather than being quietly "fixed" for one population and broken for the other.
The reports are files; they travel by whatever route a user chooses, including a forum post, and
the aggregation can be somebody reading ten of them.

This is how a profile library improves without telemetry, and it is a considerably better story
than telemetry gives you, because a conformance report says *what was tested and what the machine
answered*, where a crash statistic says a number.

It also finishes an idea `product-ideas.md` §24 raised and could not close: "this does not match my
synth" is a support ticket nobody can act on. A conformance report is the same complaint with
evidence attached.

## G.4 What makes it cheap

`CE/web/test/support/fakeSynth.js` is a simulated synth with a known map, a checksum, a deliberate
bit-field, a packed payload and a volatile counter, and it exists because the capture-session plan
was explicit that hardware is not a test. The conformance runner can be developed and regression
tested against it, in CI, on Linux, with no hardware in the room. That is the difference between a
feature that ships and one that is permanently blocked on somebody owning the right synth.

**The limits.** Contracts have to be written, and a profile with no contracts passes vacuously —
the report must show coverage ("11 of 340 parameters carry a contract") rather than a green tick,
or it becomes exactly the false assurance it exists to prevent. Sonic contracts are only as good as
the A.0 repeatability floor and must state their tolerance in those units. And a contract that
fails because the user's audio interface is muted must say *that* rather than condemning the
profile, which means the runner needs its own preflight — the same shape as the export preflight
`product-ideas.md` §17 proposes.

---

# Thesis H — The four unhinged ones

Per house style. These are real, they are cheap, and each is odd enough that nobody has done it.

## H.1 Every synth you own is now a control surface

The profile already knows which front-panel controls the machine *transmits* — that is Mode A of
the capture session, and it is how half the profiles get authored. So the moment a machine is
profiled, every knob and slider on its front panel is a named, ranged, labelled MIDI source that
can drive anything: another synth's parameter, a macro, a panel control, a scene morph.

Your Juno's cutoff slider is now a modulation source for your Blofeld. Your DX7's data entry slider
drives a filter sweep on the rig. The hardware you own doubles as the controller you were going to
buy, and the only work is a source list and a mapping UI, because the naming, the ranging and the
inbound watching are all built.

## H.2 The double-blind test

`product-ideas.md` §11 asks whether a plugin emulation is any good and cannot answer it. This
answers it, in your room, on your unit, with a protocol:

Level-match the two (the probe measures peak, so this is not a guess). Randomise the order. Hide
which is which. Play a phrase through both — the `RecentPlay` buffer already keeps your last few
bars, so it plays *your* line and not a middle C. Score twenty trials. Print the result.

The sting is the honest outcome: most of the time it will tell you that you cannot reliably tell,
and it will tell you with a confidence interval. A program that is prepared to disappoint its user
on purpose, with arithmetic, is a program people trust about other things.

## H.3 Hardware as a modulation source for other hardware

The plugin hears. So the amplitude of one machine can modulate a parameter on another, over MIDI:
envelope followers, ducking, and audio-derived modulation across devices that have no such input.

**Sidechain your Juno's filter to your drum machine's kick, on a synth with no sidechain and a
drum machine with no send.** It is an envelope follower, a rate limit, and the send queue — all
three of which exist — and it is a sound nobody with that hardware has been able to make.

## H.4 The patch that describes itself, in sentences that are true

Not a language model. Arithmetic, in English: *"Bright, slow to start, wide, and it rings for four
seconds. Four parameters do almost all of it: cutoff, envelope amount, LFO rate, chorus. It is 3 dB
louder than the median of your library, and its nearest neighbour is a patch you made in March."*

Every clause is a number from `SonicProfile`, a rank from A.2, or a query the library already
serves. It is generated, it is testable, it is never wrong in the way a generated description is
wrong, and it makes twelve thousand presets searchable in plain words without a model or a network
call — which is `product-ideas.md` §5's "search sounds in plain words", built out of measurements
instead of out of hope.

---

# Ranking

Cost is engineering effort at this codebase's grain, not calendar time. "Compounds" means it makes
the next thing cheaper. "Moat" is the answer to test 2 — how hard it would be for a competitor with
unlimited engineers, which for most of these is *impossible without rebuilding their program*.

| # | Idea | Moat | Compounds | Cost | Notes |
|---|---|---|---|---|---|
| A.0 | **Measure the measurement** | — | **Yes — six entries need it** | **Trivial** | Ten probes and twenty lines. Nothing else in Thesis A or G is honest without it. Build it first whatever else happens. |
| A.2 | **Panel rearranges itself around the patch** | **Very high** | **Yes — A.1, A.3, G.1 all read its output** | Low–med | The best ratio in the document. Two and a half minutes of measurement, and a screenshot nobody else can take. |
| G.1–G.2 | **Contracts and the conformance run** | High | **Yes — makes every other claim checkable** | Low–med | Testable in CI against `fakeSynth.js`. The trust story the whole category lacks. |
| C.1 | **The MIDI-CI responder** | **Very high** | **Yes — makes profiles useful outside this program** | **Low–med**, plus a JUCE upgrade | Strategy, not spectacle. Re-costed twice; see C's limits. JUCE 8.0.11's `ump::Session::createVirtualEndpoint()` makes the port a framework call on Windows, so the feature cost is low and the *dependency* is upgrading off 8.0.7 with this tree's three vendored patches carried forward. |
| B.1 | **Per-voice calibration** | **Very high** | Yes — feeds B.3 | Medium | The best demo in the document and the only music software that emits a repair document. Clustering is CI-testable against a simulated allocator. |
| F.1–F.2 | **Your feel, measured** | High | Yes — lands in a built subsystem | **Low** | The most *audible* item here, and the smallest diff: a distribution swapped into a shipped module. |
| A.1 | **Find that sound on your hardware** | **Very high** | No | Medium | The video. Twelve minutes is the honest number and it is fine. |
| D.1–D.2 | **Rig polyphony and measured stealing** | **Very high** | Yes — third consumer of the vocabulary | Medium | Allocator built, tuning built, level built; needs the frontier's §2.1 latency. |
| H.1 | **Every synth is a control surface** | Low | Yes — a source list everything can use | **Trivial** | An afternoon. Falls out of data the profile already has. |
| A.4 | **The servo** | High | No | Medium | Gated on A.0, G.1 and the bandwidth governor. Dangerous if any of the three is skipped. |
| H.3 | **Cross-device sidechain** | Medium | No | **Low** | An envelope follower and a rate limit over a return that already exists. |
| B.2 | **Warm-up curve** | High | Yes — feeds B.3 | **Low** | Sixty unattended probes, once. |
| A.3 | **Automation that outlives the instrument** | **Very high** | Yes — shares the vocabulary | Med–high | Gated hard on A.2 and on the canonical vocabulary. |
| E.1–E.3 | **The constraint sequencer** | **Very high** | Yes — determinism makes generative parts exportable | **High** | The solving is easy; the interaction design is the whole job. Spike it on paper first. |
| C.2–C.3 | **High resolution, profiles on the machine's behalf** | High | No | Medium | Gated on C.1 and on the bandwidth governor — no longer on a Windows SDK project, since the UMP transport arrived in the framework. |
| B.3 | **The medical record** | **Very high** | Yes | Low | Worth nothing on day one, a great deal in year two. Build it early *because* of that. |
| H.4 | **The patch that describes itself** | Medium | Yes — makes the library searchable in words | **Low** | Given A.2, it is a sentence template over numbers. |
| H.2 | **The double-blind test** | Low | No | **Low** | Reputation, and the answer to a thirty-year argument. |
| D.3 | **One patch across five machines** | High | Yes | Medium | Needs the canonical vocabulary first, like §4.2 and Tier 3's §2. |

## If you build three

**A.2, G.1–G.2, and C.1.**

One is a headline that costs two and a half minutes of measurement and produces a picture a
competitor cannot take — a panel that has dimmed the sixty knobs that do nothing and lit the four
that do, with the numbers underneath. One turns the category's oldest problem, *can I trust this
profile*, into a test you run on your own machine, and it is testable in CI against a fake synth
that already exists. One stops this being an application and makes it infrastructure, so that a
profile authored here is worth something in a program whose author has never heard of CEditor.

Build **A.0 first regardless**, because it is twenty lines and three of the three depend on it.

**For the video:** A.1. Drag a record onto a panel, walk away, come back to the Juno playing
something startlingly close, with a per-axis account of what it could not reach.

**For the press:** B.1. "This music program told me which voice of my polysynth is failing, and
printed a page for my technician." Nobody has written that sentence about any software, ever.

**For the smallest diff with the largest audible result:** F.2. One distribution swapped into
`NoteModules.h`'s humaniser, and every generated part in the program stops sounding generated.

## What these have in common

The frontier record ends by observing that all of its ideas descend from one decision: the device
layer compiles intent, not messages. That is still true, and every idea here inherits it.

But this document has a second parent, and it is the thing that raises the bar: **this program
hosts audio.** `PluginProcessor.h:75-76` declares a stereo input bus and `SonicProbe.h` turns a
render into eight numbers, and those two facts exist because somebody was building a sound browser.
They are the reason a hardware editor can, uniquely, *aim*.

The competitive shape of that is worth stating plainly. An editor cannot hear, so it can never do
Thesis A or Thesis B. A DAW can hear but has no semantic model, so it can never do them either — it
can record your synth and has no idea what a filter is. A plugin has both but has no hardware. The
overlap of "knows what a parameter means", "hears what came out" and "drives a physical
instrument" contains this program and nothing else, and that is not a feature anyone can add.

Thesis C is a different kind of moat and possibly a more durable one: it makes the program a
provider rather than a consumer. Theses E, F and G are the same argument as the rest of the
repository — determinism, measurement and testability as product features rather than as
engineering hygiene, which works here because the program already exports a plugin that has to
behave the same on somebody else's machine.

---

# Where this overlaps the earlier records, and what is actually new

Honesty requires this table. Several entries above are adjacent to something already written down,
and "adjacent" is how a document like this quietly repeats itself.

| This | Neighbour | What is new here |
|---|---|---|
| A.1 Find that sound | `midi-frontier.md` §7.3 patch by audio | §7.3 *searches an index* of sounds you already have. A.1 *synthesises* — it searches the hardware's parameter space with the hardware in the loop. Different feature, same distance function. |
| A.2 Salience | `midi-frontier.md` §3.1 Sonic Capture | The closest overlap in the document, and the machinery is nearly the same — §3.1 sweeps a parameter 0→127 and reads which axis moved. It does it to *name* an unknown parameter, once, at authoring time. A.2 perturbs a *known* parameter around the current patch to *rank* it, at playing time, and spends the ranking on the panel and on macros. The sharpest way to say it: §3.1's limits list "nothing moves at all" as a known blind spot, and note that its own table already calls that case "a finding worth recording". A.2 is the entry that records it. |
| A.4 Servo | `midi-frontier.md` §2.2 look-ahead | Look-ahead is open-loop compensation for a known delay. A servo is closed-loop correction of an unknown error. They compose and neither implies the other. |
| B.1–B.3 Per-unit measurement | `product-ideas.md` §22 per-unit calibration | §22 found the gap and proposed the half a human can type: notes, offsets, a place to put them. B measures the numbers nobody knows, and adds the voice-cluster method, the warm-up curve and the longitudinal record. |
| C The responder | `midi2-integration-plan.md` M1–M2 | M1 is the initiator: ask a device to describe itself. C is the responder: describe a device that cannot. Same vendored JUCE classes, opposite direction, and the responder half is currently called by nothing. |
| C.3 Per-note | `midi-frontier.md` §5.2 MPE on a rack | §5.2 reaches it from the panel. C.3 reaches it from the protocol, so a third-party host gets it too. One allocator serves both. |
| D Rig polyphony | `midi-frontier.md` §4.2 rig unison | §4.2 is one *gesture* across several machines — a parameter problem. D is one *chord* across several machines — a voice, timing and tuning problem. They share the vocabulary and nothing else. |
| E Constraint sequencer | `product-ideas.md` §29 variations, seeds | §29 asked for variations above a pattern and for seeds you can hold. E says what the seed should seed — a solve rather than a playback — and why determinism is the feature that makes a generative part exportable. |
| F Your feel | `midi-frontier.md` §5.3 groove transplant, corrected by `product-ideas.md` §29 | Groove application is built and extraction is missing. §5.3 proposed extracting from *a record*. F extracts from *you*, out of a journal that is already recording. |
| G Contracts | `beta-differentiation.md` §5 verified profiles | §5 is a trust *signal*: a badge somebody awards. G is a trust *test*: an executable claim the user runs on their own unit, whose failures are how the library learns about board revisions. |
| H.2 Double-blind | `product-ideas.md` §11 is the emulation any good | §11 asks the question. H.2 supplies the protocol, the level matching and the confidence interval — including the answer "you cannot tell". |
| H.4 Self-description | `product-ideas.md` §5 search in plain words | §5 wanted plain-word search. H.4 supplies the words, generated from measurements, with no model and no network. |

---

# What is deliberately not here

- **Anything needing a server, an account or a subscription.** Same reason as the frontier record:
  `licence-and-sunset-policy.md` promises an expired entitlement never disables anything, and a
  feature that phones home to work contradicts it. This is why G.3 aggregates *files* and why H.4
  generates sentences from arithmetic instead of calling an API.
- **A generative model anywhere in the audio or parameter path.** Every entry here that could have
  been a model is a measurement instead, and the reason is test 3: a measurement has an error bar
  and a generation does not. `tier-3-moonshots.md` already sets the terms under which a language
  model is acceptable in this program — optional, bring-your-own-key, schema-validated, never a
  silent network call — and nothing here needs to relax them.
- **Anything that widens CI.** Per `CLAUDE.md`, the shape of the automation is the owner's call.
  Note that this cuts the other way too: A.2's salience pass, B.1's clustering, E's solver, F's
  distribution fitting and G's conformance runner are all *pure functions over fixtures*, testable
  in the existing suite on Linux with no hardware and no new job.
- **Anything requiring the hardware to be more cooperative than it is.** Every entry works on a
  machine that transmits nothing and answers only a dump request, or says clearly which mode it is
  in when it cannot — B.1's diagnosis-versus-compensation split is the model for how to write that.
- **A kernel driver, or any transport code of our own.** The first draft put C.1 behind a driver
  and the second behind a WinRT setup step. It needs neither: `ump::Session::createVirtualEndpoint()`
  is a framework call. What stays out is writing a MIDI driver or a UMP transport of our own, which
  nothing here needs now. The cheap version of C's value — writing `.midnam` and Cubase maps, which
  `product-ideas.md` §23 already proposes — still works on every Windows version with no upgrade at
  all, and is the sensible thing to ship first.

## The categories that were rejected

Recorded so the answer can be "no" on purpose, which is the same reason `midi-frontier.md` keeps
§7.1 in its ranking table:

- **Networked collaboration and remote jamming.** Fails test 2 — anyone can build it — and needs a
  server. The remote *panel* in `product-ideas.md` §1 is a different thing and stays.
- **Suggestion features.** "Suggest a patch", "suggest a chord", "suggest a mapping". Fails test 3:
  there is no measurement that says a suggestion was good, so the feature can be demonstrated and
  never evaluated, and a feature that cannot be evaluated cannot be improved.
- **Hardware products.** A box, a controller, an appliance build. They may be good ideas and they
  are not features; they belong in a different document with a bill of materials in it.
- **Anything whose pitch was a genre.** "Make it good for techno." Fails test 1 by not being a
  sentence about what the program does.
