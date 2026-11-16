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
- **Seven more features**, taken after the decisions: [More features](#more-features).
- **Eight effect features**, taken after that: [Effects](#effects).
- **Four more features**: [Still more](#still-more).
- **Ten new ideas, parked for later**: [New ideas](#new-ideas-parked).
- **Four Build-mode features**, taken: [Build mode](#build-mode). The owner wants Build-mode
  features now rather than more for playing live.
- **Seven ease-of-use features**, taken: [Ease of use](#ease-of-use). The kind of feature the owner
  wants most.
- **Four more ease-of-use features**, taken: [More ease of use](#more-ease-of-use).
- **Eight more ease-of-use features**, taken: [Even more ease of use](#even-more-ease-of-use).
- **More Build mode, proposed but not decided**:
  [Build mode, further](#build-mode-further-proposed-not-decided).
- **A practice mode with falling notes**, for learning any song: [Practice mode](#practice-mode).
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
   would turn HoSTage into a plug-in collection. Decision 9 later adds a channel strip (gate, EQ,
   compressor) for the mixing desk.
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
9. **HoSTage becomes a mixing desk, as a future improvement.** The owner: "yes, make it a mixing
   desk with said features for future improvements". Live inputs, outputs and monitor mixes are
   being built anyway (decision 2), so the desk is the next step from there, not a separate
   program. It comes after the planned work, and its price is reliability: the whole band's sound
   then depends on one laptop. What it needs is below. *(The owner first chose "not a mixing desk",
   then corrected it the same day.)*
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

### Decision 9: what the mixing desk needs

**Why it is close already.** After the planned work HoSTage has live inputs, several outputs, monitor
mixes, Listen, input meters and a limiter. It already has faders, pan, mute, solo, meters, buses,
returns, sends and effects, and scenes recall each part's mute, volume and pan. A desk is that, made
to carry every microphone on stage.

**What it still needs, as future improvements, after the order of work below:**

1. **A built-in channel strip on every input**: gate, EQ and compressor. They must be built in,
   because each isolated plug-in adds a block of latency, and a block per effect on every channel is
   too slow for anyone's in-ears. This extends decision 3's built-ins beyond utilities.
2. **16 to 32 inputs**, with a Mixer screen that stays usable at that size and CPU to match.
3. **In-ear mixes for the whole band**, not only HoSTage's own players: one monitor mix per player,
   built the way step 2c builds them (a return on its own output pair, fed by pre-fader sends).
4. **Feedback control and talkback**: finding and notching a ringing frequency, and a talkback mic
   into the in-ears.
5. **Reliability for the whole band.** If the laptop fails, every microphone goes quiet, not just
   the keys. This makes direction 6's spare machine and step 2d's handling of a lost interface
   essential rather than nice to have.

**What it changes now, before any of that is built:** the input part, the Mixer and the mapping
screen should be designed so they can grow to 16 to 32 inputs later, even though they start with a
handful. Nothing else in the order of work changes.

**Still useful when the venue has its own desk:** stems or a stereo pair to that desk (output pairs
already exist; the standalone needs to open and name them, steps 2b and 2c), and a list for the
sound engineer of which output carries what, made from the show's named connections.

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

### More features

Proposed on 2026-11-16 after the decisions above. **The owner took all but 6** ("Everything besides
6"): all Pro (decision 6), each placed in the order of work. Each passes the line, and none exists
today (checked on `main`). A song's tempo can already change by section, because a section recalls
a scene and a scene can carry a tempo (`PatternModel.h`), so that was not listed.

1. **Song changes without a gap.** When the next song loads another rig, the last chord and the
   reverb tails of the old one keep ringing while the new one starts. Nothing in the code carries
   notes or tails across a song change today. It matters most in a set played without pauses.
2. **Lyrics and chord charts that follow the song.** Song notes exist (large type on the Stage
   screen). Lyrics and chords would move on with each section, at cues, not along a timeline, and
   show on the tablet remote for the singer and bandmates. For "anyone on stage" (decision 2).
3. **Transpose the whole set.** One setting that moves every instrument part up or down for a
   song or the whole night, when the singer's voice needs it. Backing tracks stay as they are,
   since changing their pitch means processing the file.
4. **MIDI backing files, play-only.** A `.mid` file per song played through the rig's own
   instruments and hardware synths, under the same rules as audio backing tracks (decision 1).
   Many keyboard players use these instead of audio stems.
5. **Line check before the doors open.** One walk through every connection of the show: speak into
   each mic and its input lights, send a short tone to each output and confirm it. Small with a
   handful of inputs; essential once HoSTage is the desk (decision 9).
6. ~~**Simple lights from the show.**~~ **Out.** A light scene per HoSTage scene over DMX or Art-Net
   was proposed for bands without a lighting operator. Lights stay with a lighting desk, which show
   control (direction 3) can still reach with MIDI.
7. **A guitar that plays a synth.** An input part's pitch-to-MIDI plug-in drives an instrument
   part, through the existing "MIDI from" choice. Needs MIDI out of an insert, the reverse of the
   MIDI-to-inserts gap above.
8. **Show history.** The show as it was played at each gig, kept, and what changed since: useful
   when a song sounded wrong, and when one band member hands the show to another.

### Effects

Proposed on 2026-11-16, when the owner asked for more on effects and said the dock's effects
screens could be much better. **Taken, all eight**: the owner answered "Document it.", read here as
taking the list as it stands (say so if not). All Pro (decision 6), each placed in the order of
work. HoSTage's audio effects are VST3 plug-ins, and decision 3 keeps
built-ins to utilities, so most of these are about how effects are *used* live, not new sounds.
None exists today (checked on `main`: an insert, `EffectSlot` in `RackModel.h`, has no dry/wet
setting; bypass has no crossfade; a part's inserts run in series only; no MIDI module remaps notes).

1. **Dry/wet on every insert**, done by HoSTage for plug-ins that have no mix knob. The dry signal
   must be delayed by the plug-in's latency (at least one block, from isolation), or the two
   halves phase against each other.
2. **Click-free bypass**: a few milliseconds of crossfade when an insert is bypassed or brought
   back. Stomp mode needs it; a footswitch that clicks is not usable on stage.
3. **Tails that ring out.** Bypassing a reverb or delay, or changing scene, stops feeding it new
   sound instead of cutting it, so the echoes die away naturally. The effect-level partner of "song
   changes without a gap".
4. **Effect throws.** Hold a pad and a part goes to a return (the vocal into the delay); let go and
   the echoes ring out. Built from what exists: a send, a return and a control target.
5. **Parallel chains inside a part.** The signal splits into two chains and is mixed back: clean and
   distorted guitar side by side, or a dry vocal beside a heavily treated one.
6. **Sidechain ducking.** A pad dips under the vocal or the kick. Needs the sidechain routing found
   missing above.
7. **A drum map MIDI module.** Remaps an electronic drum kit's notes to what a drum instrument
   expects. Small, and it is what a drummer on HoSTage needs first (decision 2).
8. **A better effects screen in the dock.** The chain shown as one row of blocks, in signal order:
   MIDI modules, instrument, inserts, fader, sends. Each block carries its bypass, dry/wet, its few
   most-used knobs (so the plug-in's window is rarely needed on stage), its latency and its state
   (running, restarting, failed). MIDI modules and audio inserts work the same way.

### Still more

Proposed on 2026-11-16, when the owner asked for more features beyond effects. Checked on `main`.
**The owner took 1, 2, 3 and 5** (all Pro; 5 a fix if it turns out missing) and **left out 4**.

1. **Two keyboards, each with its own parts.** A part filters incoming MIDI by channel, key and
   velocity, but not by which keyboard it came from (`PartMidiRules.h`). Two keyboards on the same
   channel, the usual stage set-up with an upper and a lower keyboard, cannot be split. A part
   should be able to listen to one keyboard only.
2. **Bluetooth MIDI**, for wireless foot pedals and controllers. On Windows it needs JUCE's WinRT
   MIDI, which is off (`JUCE_USE_WINRT_MIDI` defaults to 0 and nothing sets it).
3. **A gig-ready check of the computer.** Most dropouts on stage come from the computer's settings,
   not the program: on battery, a power plan that slows the processor, sleep, notifications,
   updates starting mid-set. One screen in Health that checks these and says what to change. The
   Windows partner of direction 9's Linux checks.
4. ~~**Stand-in sounds.**~~ **Out.** A part whose plug-in is missing on this computer would have
   played the nearest sound it has, marked as a stand-in. Such parts stay silent, as today, and
   the show says which plug-ins are missing.
5. **Back on the same song after a crash.** Recovery brings back a rig that is known to start
   (`SessionRecovery.h`); it should also land on the song and scene that were playing. **In.** The
   owner expects it to exist already, but a quick search did not find where the playing song is
   saved, so check it on a real crash first; if it is missing, it is a fix, not a feature
   (decision 6).

### New ideas, parked

Proposed on 2026-11-16, when the owner asked for features "much wider", that other programs do not
have. **Parked**: "None of them or as an afterthought, not right now." Kept here for later. The
owner also asked for fewer features for playing live and more for Build mode, which is where the
next section goes. Each builds on something HoSTage has and other live hosts lack: CEditor's knowledge of
hardware synths, plug-in isolation with restart, an auditioner that records and measures every
sound, a MIDI journal that is always recording (`MidiCaptureJournal.h`), and a web UI that can use a
camera, a microphone and motion sensors. None exists in HoSTage today; as far as known, none is in
the common live hosts either. Each passes the line.

1. **The set follows you.** HoSTage learns each song from rehearsal recordings (the MIDI journal),
   recognises where you are as you play, and moves to the next section and scene by itself. No
   pedal to press. The pedal still works, and wins when the two disagree.
2. **Crash cover.** When a plug-in crashes mid-song, the part falls silent until it restarts. With
   crash cover it plays a sampled copy of the current sound in the meantime, made by the
   auditioner when the sound was saved, so the audience hears no gap.
3. **Sound drift check.** Before a gig, HoSTage plays every song's sounds and compares them with how
   they sounded when saved. It flags the sound a plug-in update quietly changed, before the first
   song does.
4. **Backline mode.** At a festival the keyboard is the venue's. Make any keyboard usable in a
   minute: velocity calibrated by playing soft, medium and hard; controls found by moving each once
   ("Count them for me" already does this); splits found by playing the range.
5. **Stand-in musician.** When a bandmate is missing, HoSTage plays their part from the last
   rehearsal's MIDI, following the live tempo and sections (with idea 1). Play-only, like backing
   files, but it follows the band.
6. **Hands as a controller.** A webcam watches the hands above the keyboard: height as a filter,
   distance as volume, like a theremin. Hand tracking runs in the web page; no extra hardware.
7. **The phone as a controller.** Tilting the tablet or phone that runs the remote moves a macro.
   The remote is a web page, which can read motion sensors.
8. **Voice commands, push-to-talk on a footswitch.** "Next song", "more vocal in my ears", for a
   player with both hands busy. Push-to-talk, so the PA never triggers it.
9. **In-ear hearing dose.** HoSTage knows how loud the in-ear mix is all night. Calibrated once to
   the earphones, it can warn before the dose becomes harmful, as a noise dosimeter does.
10. **Dep mode.** A substitute player gets the show explained song by song: which keys play which
    sound, where the changes come, what the pedals do. Made from the show itself.

### Build mode

Proposed on 2026-11-16, when the owner asked to move from Stage features to Build mode: making the
rig, not playing it. Checked on `main`. **The owner took 1, 3, 6 and 7** (all Pro); 2, 4, 5 and 8
are out. "More like this" in Sounds already exists
(`SoundsInspector.svelte`, with the sound map and shootout beside it), so it is not listed.

1. **Undo that covers everything.** Loading a plug-in, a sound or a preset starts a new history
   today, so it cannot be undone, and there are 20 steps (`host-edit-history.md`). Those are the
   edits most worth undoing while building.
2. **Rig templates.** Start from "split", "layer", "piano and organ", "vocal chain" or "pedalboard":
   parts, zones and routing set up, sounds chosen afterwards.
3. **Even levels.** Sounds from different plug-ins differ wildly in loudness. The auditioner
   already measures each sound's level; one click sets a part's gain from it, so a new sound comes
   in as loud as the rest. Offered, never automatic.
4. **Edit across the whole set.** A song can load a rig of its own, so the same change often has to
   be made in twenty rigs. Replace a plug-in or a sound in every song, or change one setting
   everywhere, in one go.
5. **Set overview.** Every song's rig side by side (parts, sounds, levels, control pages) to see
   what differs between songs and what is the same.
6. **Control pages from what you use.** A page built from the parameters you actually moved, rather
   than from the plug-in's own groups. "Recently touched" already records them.
7. **A command palette.** Type "split at C3", "load Diva", "add a reverb return", instead of
   finding the button.
8. **Import from another live host**: at least the song list, tempos and program changes from
   MainStage, Gig Performer or a plain text list, so moving to HoSTage does not start from nothing.

### Ease of use

Proposed on 2026-11-16, when the owner asked about dragging instruments and effects onto the rack
instead of pressing Load, and for more ideas like it. **The owner took all seven** (all Pro): "All,
more like this.. this is what I meant.." This is the kind of feature the owner wants most: making
Build mode easier. Checked on `main`: only the Canvas view takes
drops (`HostRackCanvas.svelte`); in the List view, the default, an instrument is loaded with its
Load button, and the only drag reorders effects. Nothing duplicates a part, selects several, or
follows what is played.

1. **Drag and drop everywhere.** From the Instruments, Effects and Sounds lists onto a part's row
   in the List view, onto the dock's Inserts, onto a mixer strip, or onto empty space for a new
   part, as the Canvas already allows.
2. **Drop on the keyboard to split or layer.** Drop a sound on a key of the keyboard strip and it
   becomes a new part from that key up; drop it on another part's coloured band and it layers with
   that part. Splits and layers made the way a player thinks of them.
3. **Smart placement.** The library knows what kind of sound it is; a bass offers the left hand, a
   pad offers a layer over what is there. Offered, never forced.
4. **Duplicate a part**, with its effects and zone, to start a variation from it.
5. **Select several parts and change them together**: the channel, the transpose, an effect, the
   output.
6. **The dock follows what you play.** Play a key and the dock shows the part it sounds on, so
   editing what you hear needs no clicking around.
7. **Touch to find.** Move a knob on the controller and the screen shows what it controls.

### More ease of use

Proposed on 2026-11-16, more of the same kind. **The owner took 1, 2, 4 and 5** (all Pro); 3 and 6
are out. Checked on `main`: an effect can be dragged only
within its own chain (`fxDrop` in `InstrumentHostView.svelte` refuses anything else); part rows move
with up and down buttons, not by dragging; nothing accepts files dropped from the computer.

1. **Drag to reorder parts**, instead of the up and down buttons.
2. **Drag between parts.** Drag an effect or a MIDI module onto another part to move it there;
   hold Ctrl to copy it.
3. **Drag a part into the Sounds list to save it**, instead of pressing Save preset or Save chain.
4. **Drop files from the computer**: a preset file onto a part, a `.syx` patch onto a hardware
   part, a Scala `.scl` scale onto Tuning, a show file onto the window to open it.
5. **Try a MIDI module before adding it.** Hovering a module in "+ Add module…" plays it on the
   selected part while a chord is held, so the arpeggiator or strum is heard before it is chosen.
6. **Starred knobs on the part's row.** Parameters pinned with ☆ in the Params tab show as knobs on
   the part's row in the rack, so the few that matter are there without opening the dock.

### Even more ease of use

Proposed on 2026-11-16, when the owner asked to go the extra mile on the same kind. Each takes away
a slow or puzzling moment in Build. **The owner took all eight** (all Pro). Checked on `main`: modulation is set up only through the
Matrix's lists; songs and scenes accept no drops; plug-ins are scanned only when Scan is pressed
(`hostage-manual.md`, chapter 3); HoSTage never asks a synth who it is, though CEditor's device
profiles can (`DeviceProfileEngine.cpp`).

1. **Follow the note.** Play a key and see which parts received it and, for each part that stayed
   silent, why: outside its zone, wrong channel, outside its velocity range, muted, layered away.
   The most common question while building is "why is this not sounding?"
2. **Drag to modulate.** Drag an LFO, an envelope, a macro or the mod wheel onto any knob to
   modulate it, then drag on the knob to set the depth. The Matrix stays, as the list of what is
   connected.
3. **Ranges by showing.** Set the range a knob or macro covers by moving the plug-in's own control
   to each end, instead of typing numbers.
4. **Layers set by playing.** Play the softest note that should bring in the second sound, or the
   key where it should start, and the layer's switch point is set there.
5. **Hold to compare.** Hold a key to hear the part as it was before this round of editing; let go
   to come back. Uses the undo history (Build mode, 1).
6. **Plug in a synth, get a part.** When a synth is connected, HoSTage asks it who it is and offers
   a hardware part for it with the right port, channel and CEditor panel. Builds on the device
   profiles' identity request.
7. **New plug-ins noticed.** When a plug-in folder changes, HoSTage says "3 new plug-ins found" and
   offers to scan them, instead of the user having to remember Scan.
8. **Drag to assign in Performance.** Drop a saved rack or sound on a song to make it that song's
   rig; drop a control page on a scene to make it that scene's page.

### Build mode, further, proposed (not decided)

Proposed on 2026-11-16, when the owner asked for more Build-mode features, going the extra mile.
Checked on `main`: no CPU figure per part (only the whole program's, in the header), controller
knobs do not follow the selected part, a part whose plug-in is replaced leaves its control
assignments unresolved, and there is no search for sounds from an audio file.

1. **Knobs follow the selection.** Select a part and the controller's knobs control its main
   parameters at once, without making a page. Pages stay for the show; this is for building.
2. **A macro by moving.** Press "learn macro", turn several of the plug-in's knobs to where they
   should end up, and press again: one macro now moves all of them from where they were to there.
3. **Swap a plug-in, keep the mappings.** When a part's plug-in is replaced, its knob and macro
   assignments are offered to the new plug-in's parameters with the same or similar names
   ("Cutoff" to "Filter Cutoff"), instead of all becoming unresolved.
4. **Find a sound from a recording.** Drop a few seconds of audio (a song, a demo) and the library
   lists the sounds you own that are nearest to it. The library already compares sounds with each
   other; this compares them with a recording.
5. **What each part costs.** The processor load of each part shown on its row, so the heavy one is
   found without guessing. Each plug-in already runs in a worker of its own, so its time can be
   measured.
6. **Tidy the rig.** A list of what is not doing anything: parts no song plays, effects bypassed in
   every scene, control pages for plug-ins that are gone, the same sound loaded twice. Each with a
   button to remove it, and undo to bring it back.

### Practice mode

**Taken, 2026-11-16** (Pro): "General practice mode to learn songs in general." Not tied to the
set: for learning any song, the way piano-learning apps (Synthesia, Flowkey, Simply Piano) teach
with coloured bars falling onto a keyboard. The shape is decided; the details below are the
proposal.

**Why it fits.** It is playing and practising, and nothing is edited, so it passes the line. And
HoSTage has what those apps lack: the notes sound through the player's own rig, with their own
sounds, instead of a built-in piano.

**What it does:**

- **Falling notes onto the on-screen keyboard** (`HostKeyboard.svelte`). Each bar lands on its key
  when the note is due; its length is the note's length.
- **Songs from MIDI files.** Open any `.mid`. Each track can be a hand; a file with one track is
  split at a key the player chooses (middle C to begin with). HoSTage ships no songs: MIDI files of
  published songs have their own rights.
- **Tempo** adjustable from slow to full speed. MIDI changes tempo without changing pitch.
- **Wait mode.** The song waits until the right notes are played, then moves on.
- **One hand at a time.** The player chooses which hand or track they play; HoSTage plays the
  rest through the rig, as accompaniment.
- **Loop a passage**, with a count-in, as in Rehearse mode (direction 7).
- **Right and wrong.** Keys light green or red as they are played, early or late shown, and a short
  result after each run.

**What it needs.** A MIDI file reader: none exists in HoSTage today, and MIDI backing files (more
features, 4) need the same one, so they share it. What the player plays is already recorded all
the time (`MidiCaptureJournal.h`), which is what right and wrong are measured against.

## Order of work

1. **Fixes, any time, every edition**: Solo not saved, SOLOED OUT and the banner; the MIDI input
   switches remembered. They need nothing else, and fix things that are wrong today. Also check
   that a restart after a crash lands on the song that was playing (still more, 5).
2. **2a, then the latency measurement.** The measurement needs a chosen buffer and device type, and
   the owner's interfaces.
3. **2e**, early, before more projects save the old plug-in shape.
4. **2b, 2c with Listen, 2d.** 2d's silent clock first: it protects every rig with a hardware synth,
   live inputs or not. With 2b, the list for the sound engineer (decision 9), and the line check
   (more features, 5), which needs the named connections.
5. **The input part**, with its meters, tuner, limiter, Mute inputs and MIDI to inserts, designed
   to grow to a desk's channel count later (decision 9). Then a guitar that plays a synth (more
   features, 7), which needs MIDI out of an insert.
6. **Foot controllers and stomp mode**, with click-free bypass and dry/wet (effects 1 and 2),
   effect throws (effects 4), which need the new control targets, and Bluetooth MIDI (still more,
   2), since wireless pedals are the usual reason for it.
7. **Audio looper, effect chains in the library, backing tracks**, and MIDI backing files with them
   (more features, 4), under the same play-only rules. **Practice mode** after the MIDI backing
   files, since it uses the same MIDI file reader.

**Alongside, independent of all that:** show control (MIDI clock out and Ableton Link first, the
two everyone asks for), the whole rig, and three of the more features that need nothing else: song
changes without a gap (1), transposing the whole set (3) and show history (8). Lyrics and chords (2)
go with the tablet remote. From the effects: tails that ring out (3) beside song changes without a
gap, the drum map (7), and the new effects screen in the dock (8), which the owner already finds
lacking. From still more: two keyboards with their own parts (1) and the gig-ready check (3).
From Build mode: undo that covers everything (1), even levels (3), control pages from what you use
(6) and the command palette (7). All seven ease-of-use features, and the four taken from "more
ease of use"; they are mostly screen work and need nothing else. Of those, dropping files from the
computer (more ease of use, 4) also needs the native side to accept them. The eight from "even
more ease of use", with these exceptions: hold to compare (5) needs the undo that covers everything
first; plug in a synth (6) needs the device profiles' identity request brought into the host; and
new plug-ins noticed (7) needs a watch on the plug-in folders on the native side. **Later:** parallel chains (5) and sidechain ducking (6), which need new routing in the
rack. **Later:** the tablet remote, LV2 and CLAP, JACK. **After
that:** the mixing desk (decision 9).

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
