# HoSTage, wider — and the line before a DAW

*A handover record. Started 2026-11-16 in a discussion with the owner; nothing in it is built. It
says what HoSTage should grow into, what it must not become, what was decided and why, what the
code does today, and the order to build it in. Written from `main`: the owner's Linux standalone
port of HoSTage was not pushed when this was written, so check that branch before trusting a
"missing" below. When this and the code disagree, the code is right.*

## Read this first

- **The goal**, in the owner's words: "I want to extend Hostage beyond what it is now. It could be
  very wide.. but I DON'T want it to be a daw."
- **The rule that keeps it from becoming a DAW**: [The line](#the-line).
- **What is decided**: all thirteen questions, each with its reason, in
  [Decisions](#decisions).
- **What to do next**: [Order of work](#order-of-work). The first items fix things that are wrong
  today.
- **Words used here**: the [Glossary](#glossary) at the end.

## HoSTage today, in one paragraph

HoSTage is the live instrument host built into CEditor, and since the owner's port also a
standalone program; both share the code in `CE/src/InstrumentHost/` and the web UI in
`CE/web/src/CE_Application/`. You build a **rack** of **parts**, each holding one instrument (a VST3
plug-in or a hardware synth), with key zones, MIDI effects, audio effects, a mixer, layers,
patterns, a clip launcher, songs and setlists, control pages for MIDI controllers (and the CTRL49's
screen), and a **Stage** screen with **Stage Lock** against accidental changes. Every plug-in runs
in a process of its own, so one crash takes only itself down. Racks travel as **shows**; a
**player** is a copy of HoSTage that plays shows but cannot make control pages.
`docs/hostage-manual.md` describes all of it.

## The line

A DAW is three things at once. Its document is a **timeline**: everything has a position in time.
It **records in order to edit**: takes are cut, comped and moved. Its product is a **file**: a
mixdown, rendered after the playing is over.

HoSTage is the opposite on all three. Its document is a **rig and a set**: an instrument, and the
order you play it in. Its product is **sound in the room, now**. So every proposed feature gets one
question:

> **Does it make the next sound better, or the last sound editable?**

The first belongs in HoSTage. The second belongs in a DAW, and HoSTage's job is to hand it over
cleanly.

"Never record" or "nothing in time" would be too strict, so three rules say where the edge is:

- **Recording is fine when nothing edits it afterwards.** A looper layer is played, a black box is
  listened back to, an export goes to a DAW. A take that gets cut and comped is a DAW's.
- **Time is fine as a cue, not as a canvas.** "4 bars to Chorus", or a section that starts a scene,
  is a cue. A clip placed at bar 33 of a song is a canvas.
- **Audio files are fine when played, not when made.** A backing track imported finished is a
  player's job; cutting or bouncing one is a DAW's.

**Where HoSTage is already close to the line.** Each of these passes the question today, and each
has an obvious next step that would fail it. Written down so nobody takes the step by accident:

| Already there | The step that would cross the line | Keep it as |
|---|---|---|
| Patterns (piano roll, up to 64 steps) | Long MIDI parts; controller curves drawn across a song | A loop you perform |
| Song sections | Clips placed inside sections: an arrangement | Blocks that start scenes and cues |
| Recorder and Instant Replay | Multitrack recording that is then edited | Play back, export, never cut |
| Gestures (recorded knob movements) | Automation lanes across a whole song | Short movements on a pattern or a cue |
| Capture last, Looper | Takes kept, compared and arranged | One capture is one clip; record, overdub, undo, clear |

**Stays out for good:** audio tracks, comping, waveform editing, an arrangement, bounce or mixdown,
a long MIDI editor, video, offline processing. **What to offer instead:** export a capture as
`.mid`, a recording as `.wav`, a song's sections as DAW markers; and the player's VST3 already runs
inside a DAW.

## Decisions

All taken by the owner on 2026-11-16. "Recommended" means the owner took the recommendation as it
stood.

1. **Backing tracks: in, play-only** (recommended). Many bands play to stems, and decision 2 makes
   them HoSTage's users. Play-only keeps it on the right side of the line: files arrive finished,
   the only edits are start, end and loop, nothing records into them and nothing stretches them.
2. **HoSTage is for anyone on stage**, not only the keyboard player. A singer, guitarist or bassist
   plays through it too. This brings live audio inputs, and most of this record follows from it.
3. **Built-ins: yes, utilities only**: an output limiter, a tuner, a click and count-in, a file
   player, an input trim. HoSTage had no built-in processing at all. A stage needs these whatever
   plug-ins someone owns; they add no latency, because only third-party plug-ins are isolated (see
   the latency finding); and on Linux the choice of plug-ins is small. No synths or reverbs: those
   would turn HoSTage into a plug-in collection.
4. **The network: nothing opens a port until the user agrees once.** A tablet remote, band follow
   and OSC all need one. It is the rule CEditor's OSC design (`ce-osc-module.md`) already set for
   panels.
5. **Linux plug-in formats: LV2 and CLAP.** Most open-source Linux instruments are LV2, and much new
   work is CLAP. LV2 first: the vendored JUCE already hosts it. CLAP hosting would be our own code.
6. **Editions: everything this record adds is Pro.** Fixes to existing behaviour are not features
   and go to every edition. This also closes a hole: the Free edition limits instrument plug-ins
   only, so a singer or guitarist, who has none, would otherwise never meet a limit.
7. **Live inputs do not wait for slower parts.** Today the rack delays every sound to line up with
   the slowest one (see the latency finding). For two instruments layered into one sound that is
   right; between a singer and a keyboard player it only adds delay. So paths that are not one sound
   are not lined up; layers still are.
8. **ASIO on Windows: yes.** Most audio interfaces reach their low latencies on Windows through
   ASIO, and HoSTage does not build it today.
9. **HoSTage is not a mixing desk** (recommended; the owner: "b, and document what it needs"). It
   handles the sound of the people who play through it; the venue's desk mixes the band. Mainly
   because of the size of a failure: a laptop that fails should silence only its own players, not
   the whole band. What this needs, and what a desk would have needed, is below.
10. **Solo stays; Listen is a separate headphone button.** The owner: "I liked the fact you could
    solo a channel/ instrument that would mute all the others. So, instead of "solo" i would prefer
    a headphone icon as an extra button." Solo keeps silencing every other part. Listen lets one
    player hear one strip in their in-ears without changing what the audience hears.
11. **Input and output mappings are kept per audio interface** (recommended), not per computer. The
    same interface on another computer then needs no set-up, a spare of the same model works at
    once, and a USB-stick player carries its mappings with it.
12. **The VST3 gets an audio input, early** (recommended). Without one, live inputs and hardware
    returns cannot work inside a DAW. Early, because every HoSTage product is the same plug-in to a
    DAW, and every project saved before the change keeps the old shape.
13. **When the interface disconnects on stage, HoSTage waits for that interface** (recommended) and
    reopens it, instead of switching to the laptop's speakers mid-song.

### Decision 9: what "not a mixing desk" needs

The test for any sound on stage: **does HoSTage change it from song to song, or only its level?**
If it changes it (a vocal chain per song, an amp per scene), the sound goes through HoSTage. If only
its level would change, it belongs to the desk.

**What HoSTage needs to work well beside a desk:**

1. **Stems or a stereo pair to the desk.** Output pairs already exist in the rack, and a part on its
   own pair skips the master, which is what an engineer wants from a stem. Needed: the standalone
   opening those outputs, and the outputs named (step 2b and 2c).
2. **A desk feed.** One input carrying a mix from the desk ("more drums, more bass") into HoSTage's
   players' in-ears. It is an input part with no effects, sent only to the in-ear mix. This is how
   HoSTage's players hear the band without HoSTage taking the band's microphones.
3. **In-ear mixes for HoSTage's own players only** (step 2c). Everyone else's monitors are the
   desk's.
4. **An input list for the sound engineer.** A sheet saying which HoSTage output carries what ("1–2
   Main, 3–4 Keys, 5 Vocal"), made from the show's named connections (step 2b). Small, and it is
   what an engineer asks for first.
5. **Soundcheck measuring HoSTage's own inputs and outputs.** Today it measures outputs 1–2 only.
6. **Designed for a handful of inputs**, not 32: the input part, the Mixer and the mapping screen are
   laid out for the people who play through HoSTage.

**What stays out because of it:** the drum microphones and any other source HoSTage would only set
the level of; a fixed channel strip on every input; monitor mixes for players not on HoSTage;
feedback suppression; talkback; recording every input.

**What a desk would have needed**, kept so the decision can be revisited: a built-in channel strip
(gate, EQ, compressor) on every input, because isolated plug-ins add a block each and that is too
slow for every channel; 16 to 32 inputs, with a Mixer and CPU to match; in-ear mixes for the whole
band; feedback control and talkback; and the whole band's sound depending on one laptop.

## What the code does today

What the plans rest on, checked on `main`. Paths are under `CE/src/InstrumentHost/` unless given in
full.

**Audio and MIDI set-up**

- **The audio device is never remembered.** `InstrumentHostService::startAudio` opens the system
  default with two outputs on every start. On Windows that is "Windows Audio" in shared mode, the
  slowest of JUCE's Windows types, and the type is never offered. Buffer size and sample rate are
  whatever the device uses. *So:* nobody can set HoSTage up for low latency, and the latency
  measurement in the order of work cannot be run yet.
- **No ASIO and no JACK.** Both are off by JUCE's defaults, and nothing turns them on.
- **The MIDI input switches are forgotten.** `startAudio` switches every input on at each start. *A
  bug:* the Audio & MIDI page offers switches that do not last.
- **A hardware synth's MIDI port is opened by its system id only** (`openHardwareMidi`); the port's
  name appears only in the error message. *So:* ids differ between computers, and a show opened
  elsewhere loses its hardware synths.
- **Audio input exists only as a hardware synth's return**, stored as a bare channel number
  (`RackModel.h`, `audioReturnChannel`). There is no part for a microphone or a guitar.
- **Output pairs exist in the rack** (1 to 8, `RackModel::outputPairs`; a part on a pair other than
  the first skips the master, as a DAW stem should), **but the standalone opens two outputs**, so
  anything on another pair goes nowhere outside a DAW. A part goes to one pair only; returns always
  feed the master; sends tap after the fader.
- **The VST3 accepts no audio input** (`HostPluginProcessor::isBusesLayoutSupported`).
- **Nothing watches the device.** If the interface is unplugged, nobody is told. And a hardware
  synth's notes are sent from inside the audio processing (`MidiSendProcessor`,
  `RackProcessors.h`), so **when the audio device stops, the hardware synths stop receiving notes
  too**.

**Latency**

- **Every isolated plug-in adds one block of latency, and they add up in series**
  (`IsolatedPluginProxy.cpp`; `InstrumentRackHost::partLatencySamples`). Isolation hands the
  plug-in's process block N and takes back block N−1; that is what keeps the audio thread from ever
  waiting (`plugin-process-isolation.md`).
- **JUCE's graph delays every path to match the slowest** (`modular-chain.md`, pinned by
  `RackHostTests::testLatencyCompensation`).
- *So:* a vocal chain of three plug-ins at 128 samples and 48 kHz adds 8 ms before the interface's
  own delay, and delays every other part by the same. A singer on in-ears notices a few
  milliseconds. Hence decision 7.

**Effects and performance**

- **No insert receives MIDI**: the graph wires MIDI only to a part's filter, MIDI send and
  instrument (`InstrumentRackHost.cpp`). A vocoder or harmoniser cannot follow the keys. **No
  sidechain routing** either.
- **The looper, Capture last, the Recorder and Instant Replay are MIDI only.** Instant Replay
  replays what was played through the rig, so a voice or a guitar would not come back in it.
- **VST3 is the only plug-in format** (`ScannerWorkerMain.cpp`). **No MIDI clock out, no Ableton
  Link, no OSC** in the host.

**Mixer and Solo**

- **Meters**: one per strip, after its effects and fader; the master's covers outputs 1–2 only;
  sends and other outputs have none (`mixer-metering.md`).
- **Solo silences every other part at every output**, the PA included
  (`InstrumentRackHost::applyMixerState`), and Stage Lock allows it. That is intended, and stays
  (decision 10). What is wrong:
  - **it is saved with the rack, and nothing clears it** (`RackModel.cpp`; scenes recall mute but
    not solo), so a part soloed while setting up is still soloed in the saved show at the gig;
  - **the Stage screen labels the parts it silences LIVE**
    (`CE/web/src/CE_Application/sections/stage/StageRig.svelte`).
- **The headphone icon** already means "silenced by another part's Solo"
  (`CE/web/src/CE_Application/sections/HostPartIssueIcons.svelte`).

## What to build

### Directions

The wider HoSTage, in nine directions. None needs a timeline, edits a recording or renders a file.

1. **Live inputs and outputs**: mic, guitar or bass through effects; separate outputs for the PA,
   the in-ears and the click. (Decision 2; detailed below.)
2. **Backing tracks**, play-only. (Decision 1.)
3. **Show control**: when a song or scene starts, HoSTage also tells the rest of the stage: program
   changes to other gear, MIDI clock out and Ableton Link for the tempo, MIDI to the lights, OSC to
   a lyrics app. Not a DAW, because messages fire at cues, never along a timeline.
4. **The whole rig**: HoSTage's own advantage, because CEditor already knows hardware synths. A
   CEditor panel opens as a hardware part's window, the way a plug-in opens its editor; Auto pages
   are built from a device profile; a recall reads the synth back to check the sound arrived.
5. **Where you play from**: a tablet or phone as a remote (the UI is already a web page);
   footswitches and expression pedals as proper controls.
6. **The band**: one HoSTage leads the setlist and others follow; a spare laptop follows along,
   ready to take over.
7. **Rehearse mode**, between Build and Stage: loop a section, hear the last run-through back, pin
   notes to a section.
8. **Built-ins**, the utility list. (Decision 3.)
9. **Linux**: LV2 and CLAP (decision 5), JACK, and Health checks for real-time settings, the usual
   cause of dropouts on Linux.

### Live inputs (decision 2)

**Latency first.** An input part is only worth having if the player hears themselves in time.
Decision 7 removes the waiting for other parts. The plug-ins' own cost remains, with three ways out
to choose between once measured: (a) process an input's plug-ins in the same block, waiting behind
a deadline instead of returning the previous block; (b) run a whole chain in one worker process, one
block instead of one per plug-in; (c) use built-ins, which add nothing. **The measurement**:
round-trip latency on two or three common interfaces, at 64, 128 and 256 samples, through 0, 1 and
3 effects. It needs step 2a first.

**The input part.** A part gets a kind: instrument, hardware or input. An input part takes one
input (mono) or two (stereo), runs it through inserts to a mixer strip, and has no key zone or MIDI
chain. Beyond that:

- its inserts can receive another part's MIDI, so a harmoniser or vocoder follows the keyboard;
- it opens muted when a show loads, so a microphone into a big reverb cannot howl before anyone is
  ready;
- **Mute inputs** sits beside Panic, because Panic stops notes and an input has none;
- each insert says what happens if it fails: pass the signal dry (right for a reverb) or go quiet
  (right for an amp simulator, whose dry signal is harsh in a PA).

**The Mixer** gains an input meter before the effects and the mute (it sets the preamp gain, and
shows a muted mic is arriving; at an input 0 dBFS is a real clip, so it says CLIP), a meter per
output pair, the limiter's gain reduction, and each input strip's latency in milliseconds.

**Tools for players who are not at a keyboard**: a tuner that mutes the part while open, as a pedal
does; stomp mode, where a footswitch bypasses an insert; an audio looper, under the looper's
existing rule; and effect chains in the sound library, auditioned with a recorded phrase of the
player's own instrument, since a chain has no notes to play.

**What else it touches.** Places that assume every part has an instrument:

- the part pickers for layers, pattern note lanes and "MIDI from" must leave input parts out;
- the Params tab and Auto pages should use an input part's inserts;
- Instant Replay must say it does not replay inputs.

New control targets: insert bypass, input trim, input mute, Solo and Listen. Footswitch and
expression pedal become control kinds. Health watches inputs (gone silent, clipping).

Every new command must be marked as allowed or not under Stage Lock and in a player:
`stageSafeParity.test.js` and `hostagePlayerRole.test.js` fail until it is. Most chapters of the
manual change.

### Step 2: Audio & MIDI

The set-up everything above needs, in six parts:

- **2a. Remember the set-up.** Device type (ASIO included), devices, sample rate, buffer (shown in
  milliseconds as well as samples) and the MIDI input switches, saved in the data folder and
  restored at start. The default device is used only on a first start. Small, and no change to the
  rack model.
- **2b. Name the connections.** A show stops storing channel numbers and port ids. It names what it
  needs ("Vocal mic", "In-ears", "Juno"), and each interface maps those names to its channels once
  (decision 11), so shows move between computers. MIDI ports are found by id, then by name, and
  otherwise the user is asked. Old shows convert: a hardware part's port and return become
  connections named after the part.
- **2c. Outputs a stage can use.** The standalone opens as many outputs as the show's pairs need,
  and every pair ends in a level, the limiter and a meter. A monitor mix reuses what exists: a
  return that leaves through its own pair instead of the master, fed by sends that tap before the
  fader, so turning down the PA does not change the singer's ears. The click goes to its own pair
  only, so it can never reach the PA.
- **2d. The interface on stage.** If it disconnects: a banner on the Stage screen, and HoSTage
  waits for that interface and reopens it with inputs muted (decision 13). Meanwhile a silent clock
  of HoSTage's own keeps the rack running, so hardware synths keep receiving notes and the
  transport keeps time.
- **2e. The VST3's input.** One stereo input bus, off by default, so a project that does not use it
  sees the plug-in it sees today (decision 12).
- **2f. JACK on Linux.** Needs `libjack-dev` to build; JUCE loads JACK at run time, so a machine
  without it simply does not list it.

### Solo and Listen (decision 10)

**Solo** keeps silencing every other part. Three fixes make sure it can no longer surprise anyone:
it is not saved into a show or restored at start; the Stage screen says **SOLOED OUT** instead of
LIVE for the parts it silences; and a banner on stage clears it in one tap.

**Listen** is a headphone button on every strip. It sends that strip to the listen output (the
in-ears, or the interface's headphone socket) and never touches what the audience hears. It listens
before the fader, so a part can be checked before it is faded in. It ignores Mute and Solo, so a
muted mic can be checked before it is opened. It dims the rest of the in-ear mix instead of
replacing it, because the player is playing with those in-ears, and it never dims the click. It is
never saved.

The "silenced by Solo" warning, which uses the headphone icon now, gets another icon.

## Order of work

1. **Fixes, any time, every edition**: Solo not saved, SOLOED OUT and the banner; the MIDI input
   switches remembered. They need nothing else, and fix things that are wrong today.
2. **2a, then the latency measurement.** The measurement needs a chosen buffer and device type, and
   the owner's interfaces.
3. **2e**, early, before more projects save the old plug-in shape.
4. **2b, 2c with Listen, 2d.** 2d's silent clock first: it protects every rig with a hardware synth,
   live inputs or not. With 2b, the input list for the sound engineer (decision 9).
5. **The input part**, with its meters, tuner, limiter, Mute inputs and MIDI to inserts; the desk
   feed is one of these with no effects (decision 9).
6. **Foot controllers and stomp mode.**
7. **Audio looper, effect chains in the library, backing tracks.**

**Alongside, independent of all that:** show control (MIDI clock out and Ableton Link first, the
two everyone asks for) and the whole rig. **Later:** the tablet remote, LV2 and CLAP, JACK.

## Glossary

- **Part**: one slot in the rack, holding an instrument, a hardware synth or (planned) an input.
- **Insert**: an audio effect in a part's chain.
- **Bus**: several parts summed and processed together.
- **Return**: a bus fed by sends, usually for a shared reverb.
- **Send**: a copy of a part's signal, at its own level, to a return. Pre-fader taps it before the
  part's volume fader, post-fader after.
- **Output pair**: two output channels (left and right) of the audio interface.
- **Front of house**: the main PA the audience hears.
- **In-ears**: the players' own earphones, fed a monitor mix.
- **Block**: one buffer of audio processed at a time; 128 samples is 2.7 ms at 48 kHz.
- **Isolation**: each third-party plug-in runs in a separate process, so a crash takes only itself
  down.
- **Stage Lock**: Stage mode's protection against changing the rig by accident.
- **Player**: a copy of HoSTage made to play shows, which cannot make control pages.
- **Show**: one file holding a whole evening: the rig, songs, setlist and pages.

## Sources

The owner's messages of 2026-11-16; `docs/hostage-manual.md`; the code cited above. Related
records: `hostage-creator-editor-player.md` (the editor, player and Raspberry Pi tiers),
`plugin-process-isolation.md`, `modular-chain.md`, `mixer-metering.md`, `setlist-soundcheck.md`,
`total-recall-plan.md`, `product-ideas.md` §7, §8 and §14, `midi-frontier.md` §6,
`raising-the-bar.md` Thesis D, and the `ce.osc`, `ce.verify` and `ce.file` module designs.
