# Beta differentiation — what actually sets CEditor apart

> Status: **product strategy, 2026-08-11.** Written against the code and the design records as
> they stand at `e007732`. Companion to the
> program completeness review (`program-completeness-review-2026-08-03.md`) — that document asked
> *what is missing*; this one asks *what is unmatched*, and what it would take to make the
> difference visible to somebody who has never opened the program.

## The question

Closing in on the first beta: what does CEditor carry that the alternatives don't? What is the
unique selling point — the thing that makes a musician choose this over Ctrlr, over Midi Quest,
over the editor that shipped in the box?

## The short answer

**The component-level differentiation is already built, and it is undersold. The remaining moat is
not a component at all — it is everything that happens *before* a panel exists.**

Three findings, in order of how much money is on the table:

1. ~~**You are shipping a live instrument and describing it as a UI builder.**~~ ***(done)*** The
   README's first line used to sell "a visual editor for designing and building audio plugin UIs" —
   the one thing in this space with real competition — while `groundbreaking-components.md` listed
   nineteen 🟢 shipped components no competing editor has in any form. It now leads on the
   instrument layer: the note players, the four modulation sources, the live rig, the patch-space
   navigation. This finding is the one that cost nothing and it was taken.
2. **The category's true bottleneck is profile acquisition, and nobody has automated it.** Every
   editor ever written — including Ctrlr — begins with a human transcribing a MIDI implementation
   chart out of a manual. Automating that is the one advantage a competitor cannot copy by adding
   a widget, because it compounds: every device profiled makes the next panel cheaper.
3. **The export half is where the promise breaks.** Hardware users want their synth to behave like
   a plugin. Three specific stubs in `CE/src/Player/` stand between the program and that claim.

---

## 0. What is already differentiated (and undersold)

This is not a proposal. It is an inventory of shipped capability that the front door does not
mention.

### The panel is a performance instrument, not a remote control

Every competing editor stops at "move a control, send a message." CEditor ships, per
`groundbreaking-components.md`:

| Family | Shipped | What it means to a musician |
|---|---|---|
| **Note players** | Chord Pad, Arpeggiator, Ribbon Keyboard, Drum Pads, Harmoniser, Phrase Sequencer, Phrase Recorder | The panel *plays* the synth. No other editor emits notes at all. |
| **Motion sources** | Orbit (geometric), Gesture Looper (human), Turing (generative), Kinetic (physical) | Four philosophically distinct modulators, on hardware that has none. |
| **Live rig** | Transport (MIDI-clock *and* DAW-playhead following, with loop points and count-in), Setlist, Zone Splitter, Song Mode, Panic | A stage rig. Split the keyboard, chain patterns, advance songs on a footswitch. |
| **Patch navigation** | Preset Constellation, Timbre Space, Constraint Cell | The library as a map; control by musical intention rather than by parameter. |
| **Input** | Note input echo, Expression Router with drawable transfer curves and MIDI learn | The panel reads as well as writes. |

The engineering rigour behind these is itself a selling point and is currently invisible: position
recomputed from the start instant so nothing drifts, note-offs replaying the *remembered* note-on
so a live edit cannot leave a note ringing, reference-counted pitches in the Harmoniser, rising-edge
detection on footswitches. That is the difference between a demo and a thing you take on stage,
and it is worth one sentence in the marketing copy.

### Seven real scripting languages

Lua, JavaScript, TypeScript, Python, C++, C# and Java — each stored and executed in the language it
was written in, over one shared API, with a generated manual, a browsable API explorer, a cookbook,
and live Test/Trace. Competing editors offer one embedded language or none. This is a headline and
it reads as a footnote.

### The device layer is an intent compiler, not a SysEx generator

The architectural decision in
`device-profile-engine-mvp-plan.md` — a panel
emits *"set mainSynth.filter.cutoff to 64"* and the device layer decides whether that becomes CC,
NRPN, RPN, SysEx, a multi-message transaction, or a no-op — is why half the list above is even
possible. Morphing a whole patch, diffing two patches semantically, randomizing within musical
bounds: all of it needs a semantic parameter model, and a SysEx-template program cannot retrofit
one.

**Recommended framing for the beta:** *the only hardware-synth editor that is also an instrument.*
Or, for the shorter version: **your synth, playable.**

---

## Tier 1 — the three that would define the product

### 1. Learn-the-synth: capture-and-infer profiling

*Working name: the Capture Session. The single largest moat available.*

> **Built, 2026-08-23/24 — all five stages.** This section was written as a proposal and, by the
> document's own rule about undated verdicts, kept reading as one for a week after the work
> landed. The engine is `utils/captureInference.js`, the state machine `utils/captureSession.js`,
> the conversation `editor/dpd/DpdCaptureScreen.svelte` (the Designer's fourth mode, "Capture"),
> and the answer key `test/support/fakeSynth.js` with forty-six tests over it. What was built, and
> the four rulings the plan did not have to make, are in
> [`capture-session-plan.md`](design/capture-session-plan.md#what-was-built-2026-08-23). The
> disabled "MIDI learn" button this section names below was removed rather than wired (see
> `known-issues.md`); the Capture screen is the entry point. The text below is left as the
> rationale it was.

**The problem it kills.** Somebody has to know the byte layout. Today that somebody is a human with
a PDF, and the category's entire history is a handful of such people. When they stop, the device is
unsupported forever. This is why there are thousands of synths and a few hundred editors.

**The feature.** Put the device in the room. Press Learn. Turn a knob on the *hardware*. CEditor
tells you what parameter that was and writes it into the profile.

- **CC / NRPN / RPN** — trivial: watch the monitor stream, take the controller that moved the most
  rather than the one that spoke first. The Expression Router already performs exactly this
  reduction for its MIDI learn; the logic is written and lives in the wrong place.
- **SysEx — the valuable case.** Take a full dump. Have the user change one thing on the front
  panel. Take a second dump. **Diff the bytes.** The changed offset is the parameter's address; a
  handful of values across its travel gives the range and, from the value/byte relationship, the
  codec — `u7`, `s7`, `u14`, `nibbled`, `packed8to7`, `bitslice`, all already implemented in
  `DeviceProfileEngine.cpp`. A trailing byte that changes when nothing else does is a checksum, and
  the engine already knows the common checksum shapes.
- **Write the finding into the DPD with a generated test vector**, so the inferred parameter is
  self-verifying from the moment it exists. Anything the engine is unsure of lands as a draft with
  a confidence note rather than a silent guess.

**Why it is feasible here and nowhere else.** The substrate is already in the tree:

| Needed | Status |
|---|---|
| Incoming MIDI ingest, monitor feed | `ingestIncomingMidiMessage`, `getMidiMonitorEvents` — built |
| Dump request / parse / checksum classification | `parseDumpMessage`, dump definitions — built |
| Address-range bookkeeping across multi-message dumps | Dump collections track received / missing / **duplicate address ranges** — built |
| Value codecs to infer *into* | Seven codecs + dump text codecs — built |
| Profile schema, validators, test-vector runner | Built |
| The UI entry point | `DpdParametersScreen.svelte:81` — `◉ MIDI learn`, `disabled title="Coming soon"` |

The genuinely new work is the **inference engine** (byte-diff → address/codec/range/checksum
hypothesis, with confidence) and the **capture-session UI** (a guided loop: baseline, change one
thing, confirm, name it, next). Everything it stands on exists and is tested.

**The claim it earns:** *CEditor learns synths nobody has ever written an editor for.* That is the
mission statement in `midi2-integration-plan.md` — "control and automate almost any hardware synth"
— made literal.

The three capture modes, the byte-diff inference table, the confidence model, the staging and the
simulated-synth test strategy are in [**capture-session-plan.md**](design/capture-session-plan.md).
One detail from it worth repeating here: the DPD schema already defines `provenance.source` as
`official | community | imported | **learn**`. The place to put a learned parameter was reserved
before anyone proposed learning one.

**Sharp edges to design for, not around:**
- Devices with no full-dump support: fall back to single-parameter request/response, or to
  CC-only capture, and say which mode you are in.
- Bit-packed parameters sharing a byte: two parameters that move the same byte are the signal, not
  a failure — surface them as a bit-field candidate.
- Panel-echo confusion: the runtime already has outbound origin tracking and echo suppression;
  the capture session must reuse it or it will "learn" its own transmissions.
- Timing: some devices need a pause between dump requests. Profile timing metadata already exists.

### 2. Total Recall — hardware that behaves like a plugin

**The problem it kills.** You open a six-month-old session and the synth is on whatever patch it
was left on. This is the single most-complained-about fact of hardware-in-a-DAW life, and it is
precisely what an exported CEditor panel is positioned to fix and currently does not.

**One finding first, because it changes the shape of the work.** The session already remembers more
than the completeness review implied: `getStateInformation` (`PluginProcessor.h:222`) saves the APVTS
values, the device role→port mapping, script state and `ce.storage` panel settings, and
`setStateInformation` restores all four. ~~What it never does is **tell the hardware** — the values
are restored and the ports reconnected, and nothing is transmitted. The state is known and not sent,
which from the user's chair is indistinguishable from not being saved at all.~~ *(fixed, S2 —
`setStateInformation` now arms a pending restore and the message-thread timer pushes it once the
device reports ready, under an Ask / Always / Never policy authored in the Export tab. The rules are
a pure function in `CE/src/Player/RestorePolicy.h` with their own test, because they are all
ordering and timing and `PluginProcessor.h` does not build off Windows.)* That restore push, with
an Ask / Always / Never policy so the plugin isn't blasting SysEx at whatever is plugged in, was the
smallest change here and the one that delivers the headline.

**The stubs**, found by the completeness review and all still present at `e007732`:

| Location | Current | Needed |
|---|---|---|
| ~~`CE/src/Player/PluginProcessor.h:213`~~ | ~~`getNumPrograms() { return 1; }`~~ | *(done, S4 — the bank size, off a librarian bank baked into the panel)* |
| ~~`CE/src/Player/PluginProcessor.h:215`~~ | ~~`setCurrentProgram (int) {}`~~ | *(done, S4 — queues the recall; the timer sends it, because a host may call this from the audio thread)* |
| ~~`CE/src/Player/PluginProcessor.h:809`~~ | ~~`cb.buildDump = [] (const juce::String&) { return juce::var(); }`~~ | *(done, S3 — the codec, plus `<DeviceDumps>` in the saved state and a dump-before-values restore)* |
| ~~`CE/src/Player/PanelParameters.h:71-84`~~ | ~~every parameter → `AudioParameterFloat`~~ | *(done, S1 — `AudioParameterChoice` / `AudioParameterBool` / `AudioParameterFloat` off an explicit `valueKind`)* |

The last one is cosmetic but it is the one a reviewer screenshots: a combobox that reads
`0.4700` in the automation lane instead of `Saw` makes the whole export look like a debug build.

**The claim it earns:** *save the session, close the lid, come back next year — the synth comes
back too.* All four stages are done. Nothing here has yet been run against real hardware. Pair it with Panic and the Setlist and the story is complete: your hardware is a
session-recallable, automatable, stage-ready instrument.

Staged, with the ordering rules and the failure modes to test:
[**total-recall-plan.md**](design/total-recall-plan.md).

### 3. Auto-Panel — profile in, working editor out

**Built** — File → New Panel from Device Profile; see
`auto-panel.md`. It is three things at once and
each alone would justify it:

- **The adoption unlock.** Hours of layout become seconds.
- **The onboarding fix.** New Panel is a blank canvas in a program with four designers behind it,
  no templates, no welcome, no tour. Generating a real, populated, fully-editable panel is the
  best possible tour: the user's first screen is *their synth*, and every control on it is a worked
  example of a binding.
- **The demo.** See below — it is the last link in the chain.

The three questions that kept it unbuilt — mapping policy, layout strategy, and
**regenerate-versus-merge** — are answered in the *Resolved design* section now appended to
`auto-panel.md`: a complete `valueType` → control
table, sectioned-by-group layout with one page per scope instance, and a three-way merge over
provenance-tagged controls so a regenerate never discards the user's styling. That last one is the
difference between a party trick and a tool — and it is what stops the Capture Session and the
generator from being hostile to each other as a profile grows over several sittings.

### The chain — why these three are one feature

Individually they are good. Chained they are a category shift, and they should be demonstrated as
one continuous take:

> Plug in a synth nobody has ever written an editor for. **Capture** — turn twenty knobs, answer
> twenty prompts. **Generate** — a complete, grouped, bound editor panel appears. **Export** — a
> VST3 that automates, recalls with the session, and plays itself.
>
> Total elapsed time: an afternoon. Prior art: a week with a manual, or nothing at all.

No competitor can show that video. That is the beta's headline if it wants one.

---

## Tier 2 — cheap, loud, disproportionate

### 4. Harvest the Ctrlr corpus

Ctrlr's moat was never the editor — it was fifteen years of community panels covering hundreds of
devices. Those panels are XML property bags, and **the MIDI half of one is a device profile**.

The reframing that makes this tractable: *do not write a UI converter, write a profile harvester.*
Extract the modulators, their ranges, and their message definitions into a `.ceditor-device`
profile, then let **Auto-Panel** rebuild the interface natively. One evening of work per hundred
devices instead of one week per device.

This deserved its own record — the difficulty analysis, the stage plan, and the mapping tables are
in [**ctrlr-import-plan.md**](design/ctrlr-import-plan.md). Short version: the geometry and
the MIDI map are a data-mapping problem and genuinely easy; the Lua is hard and should be
quarantined rather than translated; nothing about it requires porting JUCE.

### 5. Verified profiles — a trust signal nobody else can offer

Because profiles carry **test vectors** that actually run, CEditor can state something no other
editor can: whether a profile is *known correct*.

**This is far more built than it looks, and cheaper than anything else on this list.** The
`provenance` and `completeness` fields are in the schema, and `CE/dpd/tools/library.mjs` already
implements the curation layer around them: `roundTripCheck` as a **hard gate** — its own comment
says *"a profile that doesn't pack/unpack never enters the library"* — `dumpCheck`, whose comment
says *"`verifiedFullDump` is earned, not declared"*, an id-keyed structured diff in domain language
rather than byte noise, and a `Library` with versioning, revert, pin, confirm-versus-fork and
reputation. `server.mjs` puts an HTTP service over it, with integration tests.

So the rigour exists and **the user cannot see any of it**: the DPD Designer's Share screen renders
*not built yet* (`DeviceProfileDesignerV2.svelte:213`). The work is a badge and a panel, not an
engine. In a category whose folklore is *"that panel works except for the filter section,"* showing
whether a profile is verified — and how — is worth more than most features.

### 6. MIDI-CI discovery (M1) — ***wired since this was written***

`CE/src/DeviceProfile/MidiCiSession.cpp` calls `startDiscovery()`, `DeviceProfileServiceMidiCi.cpp`
emits `midiCiDiscoveryComplete`, and `DeviceRuntimeBridge.cpp:153` exposes
`startMidiCiDiscovery` to the panel. The paragraph below describes the state before that and is kept
for the argument it makes about *why* discovery is worth having, which is unchanged.

~~`juce_midi_ci` is vendored and compiled in but unwired.~~ `CE/dpd/tools/import-midici.mjs` already
converts Property Exchange JSON into a partial profile, offline, today. M1 of
[`midi2-integration-plan.md`](design/midi2-integration-plan.md) connects the two.

The honest limit is already documented in the importer: Property Exchange describes controllers,
programs and identity — never SysEx addresses, bit-packing or dump layouts. So CI gives you the CC
layer for free and the Capture Session (Tier 1 #1) fills in the rest. **They are the same feature
arriving by two roads**, and shipping them together is what makes "plug it in and it profiles
itself" true for modern gear and *nearly* true for a 1987 rack unit.

It also converts the MIDI 2.0 story from aspiration to fact, which matters for press.

### 7. Patch Diff / Compare

Designed in `patch-diff.md`; cheap on top of
snapshots + DPD. Two audiences at once: sound designers get the hardware **Compare** button they
have missed since 1990 (A/B against the stored patch), and profile authors get the byte-level
pairing that makes reverse-engineering legible. It is the natural companion to the Capture Session
— the same diff, shown to a different reader.

### 8. A panel exchange

Split this in two, because the halves are in very different states.

**Profiles are nearly there** — Layer 3 above is the flywheel, and it only needs surfacing.
**Panels have nothing**: custom components have a package format with metadata and versioning, and
the panel level has no package, no sharing and no import at all. That is the half to build, and even
a plain Git-backed index would give the community flywheel somewhere to start. Two things it must carry from
day one: the FUID identity policy from the export plan (D1) so shared panels do not collide in a
DAW, and an explicit statement of what AGPL means for a distributed panel — which the program does
not currently surface at export time at all.

---

## Tier 3 — after the beta

Designed in [**tier-3-moonshots.md**](design/tier-3-moonshots.md), which ranks them by
whether they compound or merely impress. Summary:

- **Manual → profile.** Feed the synth's MIDI implementation chart PDF; get a draft DPD; verify it
  against hardware with the Capture Session. This is the category's holy grail, and the pairing is
  what makes it safe: a language model is allowed to be wrong when a test vector adjudicates.
  Optional and bring-your-own-key, so it is never a dependency and never a privacy question.
- **Cross-device patch translation.** Because DPD parameters are semantic, *"take this Juno patch
  to the Blofeld"* is expressible: match on parameter meaning, rescale through both ranges, report
  what had no counterpart. Imperfect by nature, unforgettable as a demo, and impossible for anyone
  whose device layer is a SysEx template.
- **Modulation node-graph** (`node-graph.md`) —
  the flashiest unbuilt item, and the single best screenshot the program could have.
- **Snapshot Morph** (`macro-and-morph.md`)
  — the piece that finishes the turn from editor to instrument.

---

## Ranking

| # | Feature | Moat | Cost | Ship |
|---|---|---|---|---|
| 0 | Reposition around the instrument layer | Already earned | ~zero | **Beta** |
| 1 | ~~Capture-and-infer profiling~~ **built** (S1–S5; never run on a real synth) | **Highest — structurally uncopyable** | Medium | Beta headline |
| 2 | Total Recall (**all four stages done**) | High — the #1 user pain | Low–medium | **Beta** |
| 3 | ~~Auto-Panel~~ **built** | High — adoption + onboarding | Medium | **Beta** |
| 4 | ~~Ctrlr harvest → profiles~~ **built** (never run on a real panel) | High — network effect, migration | Low (staged) | **Beta** |
| 5 | Verified-profile badge | Medium — trust | **Very low** | Beta |
| 6 | MIDI-CI discovery | Medium — first mover, press | Low (code exists) | Beta+1 |
| 7 | Patch Diff / Compare | Medium — daily driver | Low | Beta+1 |
| 8 | Panel exchange | High long-term — ecosystem | Medium | Beta+2 |

## What to do for this beta

The 2026-08-06 first-beta smoke pass said do not ship — **but that verdict was stale before it was
written down, and this document repeated it for several rounds before anyone checked.** The pass ran
against a build from 2026-08-04; all three High-severity findings were fixed on 2026-08-06, most
within hours of the report, and the report was committed afterwards without a status.

That report has since been retired: all twelve of its findings were verified closed in the code, and
the ones worth pinning are pinned by tests that name them — `deepCloneProxySafety.test.js` for the
three High findings (one `structuredClone` root cause behind all of them, plus a sweep that fails on
a new unguarded call anywhere in `src`), `comboboxDefaults.test.js`, `sliderDefaultCurrent.test.js`,
`packageReadinessDetail.test.js` and `panelIdentityAndVersion.test.js` for the rest.

The lesson is worth more than the fix: **a QA report is a snapshot, and an undated verdict outlives
the build it describes.** Every finding table in this repository should carry a status column from
the day it is written.

~~What remains is four open Medium/Low workflow defects (004, 008, 009, 010) and half of 007~~ —
**all twelve are now closed in code.** 004 and 007b landed after this was written; 009 and 010 never
needed a patch, sharing the `DataCloneError` root cause fixed in `4f02a12`. What is left of them is a
**re-test** of 009/010 against a build containing the fix, which is confirmation rather than work,
and is tracked in `beta-readiness-review-2026-08-10.md` §3. Given that, the recommendation is
deliberately narrow:

1. **Run a fresh QA pass against a current build.** Not a code change — the open findings are
   workflow bugs that can only be judged in the running application, and the last pass tested a
   two-day-old installer.
2. **Reposition** — the README, the site copy, and the first-run screen should say what the program
   is. This costs an afternoon and is the highest-return item on the list.
3. **Ship the verified-profile badge** — very low cost, and it makes the device layer's rigour
   visible.
4. **Pick exactly one Tier-1 item as the headline.** Take the **Capture Session**: it is the only
   one a competitor cannot answer by adding a widget, it multiplies the value of everything already
   built, and most of its plumbing is already in the tree. *(Since built — see the note under §1.
   What it has not had is a real synth; that is the beta's job.)*

Everything else is a stronger release *after* people are using this one.

---

# Appendix — the plain-English version

Everything above is written for the people building the program. This is the same three Tier-1
features written for everyone else: the seed for release notes, site copy, and the answer to *"so
what does it do?"* No file paths, no schema, no acronyms.

## 1. Teach the program your synth by playing with it

**The problem today.** Before CEditor can control a synth, someone has to tell it what messages that
synth understands. Right now that means a person sits down with the manual and types in hundreds of
numbers by hand. It takes days, it's boring, and for old synths the manual often doesn't even have
the information. That's why most synths in the world have no editor at all — nobody was willing to
do the typing.

**What it does.** You plug the synth in and press Learn. Then you turn a knob on the synth itself.
The program watches what the synth says and works out which parameter you moved and how it's stored.
You type a name — "Filter Cutoff" — and move on to the next knob.

**The clever bit** is for older synths that say nothing when you turn a knob. For those, the program
asks the synth for a copy of its current sound, has you change one thing, then asks for another copy
— and compares the two. Whatever changed between them *is* the parameter you moved. Spot the
difference, with bytes.

**Why it matters.** Days of typing become an afternoon of turning knobs, and it works on synths
nobody has ever written an editor for. Competitors can't copy this by adding a feature — their
programs don't understand parameters, only raw messages, so they'd have to rebuild their
foundations.

## 2. Your synth comes back with the project

**The problem today.** You finish a track, close it, come back six months later — and your hardware
synth is sitting on whatever sound it was last used for. Everything else in the project remembers
itself. The hardware doesn't.

**What we found.** This is closer to working than expected. When you save a project, an exported
panel already writes down every knob position, which synth was plugged into which port, and what
your scripts were doing. Reopen it and all of that comes back.

**What's missing.** It never actually tells the synth. It quietly remembers everything and then says
nothing to the hardware — so from where you're sitting it looks like nothing was saved, even though
it was.

**The fix.** Send the remembered settings back to the synth when the project opens — asking first,
because a plugin that starts firing messages at whatever's plugged in the moment you open a project
is a menace. It might be a different synth today. You might be mid-take.

**Why it matters.** "Open the project and your hardware is exactly where you left it" is what
hardware owners want most, and it's mostly finishing work that's already half done.

## 3. Press a button, get the whole editor

**The problem today.** Once the program knows your synth, you still build the screen by hand — drag
out a knob, connect it, label it, position it, two hundred times.

**What it does.** One button. The program already knows every parameter your synth has, what kind of
control each needs, and how they group into sections like Filter and Oscillator — so it builds the
screen for you. Knobs for the knobby things, dropdowns for the list-y things, toggles for the on/off
things, labelled and grouped and already connected. Then you rearrange and restyle it however you
like, because it's a normal panel like any other.

**The part that took the most thought** is what happens when you press it *again*. You'll learn more
parameters later, so you'll want to regenerate — but by then you've spent an evening making it look
nice. So the rule is: add the new controls, leave anything you've touched completely alone, and say
afterwards exactly what changed. Without that rule, features 1 and 3 would fight each other and
you'd stop using one of them.

## All three are one story

> Plug in a synth nobody has ever made an editor for. Turn some knobs — the program learns it. Press
> a button — the editor appears. Export it — now it's a plugin in your DAW that automates, and your
> synth comes back every time you open the project.

That's an afternoon. Today it's a week with a manual, or it's simply impossible. And it's a video
nobody else can make.
