# HoSTage, wider — and the line before a DAW

*Discussion record, started 2026-11-16. Nothing in it is built. One decision is taken: **HoSTage is
for anyone on stage** (decision 2, 2026-11-16; see
[Decision 2, taken](#decision-2-taken-anyone-on-stage)). The other decisions at the end are the
owner's. Written from `main`: the owner's Linux standalone port of
HoSTage is not pushed yet, so where this says something is Windows-only or missing, that branch may
already have moved it. When this and the code disagree, the code is right.*

## The intention, in the owner's words

> I want to extend Hostage beyond what it is now. It could be very wide.. but I DON'T want it to be
> a daw.

From the same message: HoSTage now also runs as a standalone program of its own, and stays in
CEditor exactly as before, the two sharing the code.

## Where HoSTage is today

From `docs/hostage-manual.md`: a rack of parts (VST3 instruments and hardware synths) with zones,
layers, a MIDI chain of thirteen module kinds, inserts, buses, returns and macros; a sound library
with an auditioner; patterns, a clip launcher, a looper, gestures, a recorder and a modulation
matrix; songs, sections and setlists; control pages and the CTRL49's screen; a Stage screen with
Stage Lock; shows, players and products; every plug-in in a process of its own, with failover.
That is already wider than most live hosts.

What it does not have, read from the code rather than the manual:

- **Audio comes in only as a hardware synth's return** (`RackPart::audioReturnChannel`,
  `RackModel.h`). There is no part for a microphone or a guitar.
- **The standalone plays to one stereo pair.** The VST3 has up to eight (the Product utility).
- **VST3 only.** The scanner knows one format (`ScannerWorkerMain.cpp`).
- **No clock out, no Link, no OSC.** EXT follows an incoming clock (`Performance/Transport.h`);
  nothing sends one. There is no Ableton Link, and no OSC in the host.
- **No built-in audio processors** of any kind.
- **Every plug-in on a path adds a block of latency, and the whole rig waits for the slowest
  path.** Each isolated plug-in reports its own latency plus one block
  (`IsolatedPluginProxy.cpp`, `setLatencySamples (metadata.latencySamples + blockSize)`), a part's
  inserts add up in series (`InstrumentRackHost::partLatencySamples`), and JUCE's graph delays every
  shorter path to meet the longest (`modular-chain.md`, pinned by
  `RackHostTests::testLatencyCompensation`). Hardly noticed on a synth; decisive for a voice. *The
  first version of this record said "one block" in total; it is one block per plug-in.*
- **No insert receives MIDI.** The graph wires MIDI into a part's filter, its MIDI send and its
  instrument, nothing else (`InstrumentRackHost.cpp`, the connections around lines 2223-2255). A
  vocoder or a harmoniser in an insert slot hears no notes.
- **No ASIO.** `JUCE_ASIO` is set nowhere outside the vendored JUCE, so on Windows HoSTage plays
  through WASAPI or DirectSound. And only the output device is chosen; the buffer size and sample
  rate are the device's own, and inputs are not chosen at all (`hostage-manual.md`, Known limits).
- **The looper records MIDI.** It is a pattern layer (`looperLayer`, `PatternModel.h`), not audio.
- **A hardware part has no panel.** It sends and captures patches, but nothing opens a CEditor
  panel for it the way a plug-in part opens its plug-in's window.

## The line

A DAW is three things at once:

1. **Its document is a timeline.** Everything has a position in minutes, and editing means moving
   things along it.
2. **It records in order to edit.** A take is raw material: cut, comp, quantise, move.
3. **Its product is a file.** The performance happened earlier; what leaves the program is a
   render.

HoSTage's document is a **rig and a set**: an instrument, and the order you will play it in. Its
product is **sound in the room, now**. So one question, for every feature that comes up:

> **Does it make the next sound better, or the last sound editable?**

If it helps you play, prepare to play, or recover when playing goes wrong, it belongs here. If its
main purpose is to rework what already happened into a file, it belongs in a DAW, and HoSTage's job
is to hand it over cleanly.

Three corollaries make the question usable:

- **Recording is allowed when it is the end of the road or a handoff.** Capture last becomes a clip
  you *play*. A black box writes what happened and never edits it. A `.mid` or `.wav` exported to
  a DAW is a handoff. Editing recorded audio is not allowed.
- **Time is allowed as a cue, not as a canvas.** "Four bars to Chorus", a follow action, a section
  that fires a scene: cues. A clip placed at bar 33 of a song: canvas.
- **Audio files are allowed when they are played, not when they are made.** A backing track
  imported finished is a player's job. Cutting one, stretching it into place, or bouncing one is a
  DAW's.

### Where HoSTage already stands close to the line

Closer than "not a DAW" suggests. Each of these passes the question today, and each has an obvious
next step that fails it. Writing them down is the cheapest defence:

| Already there | The step that would cross | Keep it as |
|---|---|---|
| Patterns: piano roll, up to 64 steps, parameter locks | Long MIDI parts; CC drawn across a whole song; a score view | A loop you perform. Longer than 64 steps is a backing track or a DAW. |
| Song sections on a timeline | Clips placed inside sections at bar positions: an arrangement | Blocks that fire scenes and cues. They hold no material. |
| Recorder and Instant Replay | Multitrack audio recording, then editing it | Write-only. Play it back, export it, never cut it. |
| Gestures: recorded control movements, editable | Automation lanes running the length of a song | Short movements, put on a pattern lane or fired from a cue. |
| Capture last | Keeping several takes and comping them | One capture becomes one clip. |
| Looper | A timeline of loop layers to rearrange | Record, overdub, undo, clear. |

The right-hand column is also the answer to give anyone who asks for something in the middle one:
export it, and here is how (see [What stays out](#what-stays-out)).

## Where it can widen

Nine directions. None needs a timeline, none edits a recording, none renders a file. Each says what
it builds on, because most of them are half there already.

### 1. More of the stage goes through it: live inputs and more outputs

**Live input parts.** A part whose source is an audio input (a vocal mic, a guitar, a bass, a
hardware synth with no MIDI to send) through an insert chain to the mixer. A vocal chain per song,
an amp simulator per scene, a harmoniser that follows the keyboard. This is the one change that
moves HoSTage from *the keyboard player's* program to *anyone on the stage's*.

It is smaller than it sounds. A hardware part already takes an audio return into its strip
(`audioReturnChannel`), and the rack graph already has its audio input node
(`InstrumentRackHost.cpp`). A live input part is a hardware part without the MIDI half.

The hard part is latency, and it is harder than the first version of this record said: one block
*per plug-in* on the path, and the rest of the rig held back to match. It has a section of its own
under [Decision 2, taken](#decision-2-taken-anyone-on-stage), because it decides whether an input
part is worth having at all.

Checked since: no insert receives MIDI today (see the list above), so a vocoder or a harmoniser on a
vocal part needs MIDI wired to inserts first.

**Outputs beyond one pair.** A stage has more than one destination: front of house, the in-ear
mix, a click only the drummer hears. The standalone should get the VST3's output pairs, plus a
**monitor mix**: per-output sends, so the click and the cue voice reach the in-ears and never the
PA. A router with levels, not a mixing console.

**A tuner and a safety limiter**, see direction 8.

### 2. Backing tracks and the click: the borderline, on purpose

The direction most likely to be asked for, and the closest to the line. Many live acts play to
stems. A **stem player per song**: the song's audio files start with the song (or with a section),
and each appears in the mixer with a fader of its own; a click and a count-in, spoken or beeped,
go to the monitor output only.

It passes the question only under rules written into the feature, not remembered:

- Files arrive finished. HoSTage reads them and never writes them.
- The only edits are a start point, an end point and a loop, nothing between them.
- No recording into a stem. No stretching to fit: a stem at the wrong tempo means the song's
  tempo is wrong.
- A song's stems are one block on its sections, not clips placed along them.

If those rules feel tight, that is the line doing its job: the request on the other side of them is
a DAW.

Builds on: songs and sections; Preload, since a stem player's files want loading ahead exactly as
a rig does; the Soundcheck measurement, which already taps the master. Decision 1.

### 3. Show control: a song is a cue, and the cue fires everywhere

When a song, a scene or a section starts, HoSTage changes its own rig. Let the same moment change
the rest of the stage:

- **Program changes to gear that is not a part**: the guitar modeller, the drum machine, the pedal
  board, the other keyboard. A hardware part does this for one synth today.
- **MIDI clock out and Ableton Link**, so the drum machine and a bandmate's laptop follow HoSTage's
  tempo. Neither exists; EXT only follows.
- **Lights and words**: MIDI to a lighting desk, OSC to a lyrics or teleprompter app.
  `ce-osc-module.md` has the OSC design for panels, with its rule that nothing reaches the network
  until the user says yes; the host should take the same rule.
- **MIDI Show Control**, for theatre, where it is the standard.

Why it is not a DAW: messages fire at cues (a song, a scene, a section, "bar 3 of Chorus"), never
along lanes. No message has a position on a timeline; each has a cause.

Builds on: songs, sections and scenes; the MIDI LFO's hardware outputs (CC, NRPN, SysEx); and the
Pro edition's script actions, which already give a scripted route to all of it and would stay the
escape hatch for what a table does not cover.

### 4. The whole rig, not only the plug-ins: what nobody else has

Gig Performer, MainStage and Camelot host plug-ins well. None of them knows a synth the way
CEditor does: thirty-three makers' device profiles, patch capture, total recall, a read-back
designed in `ce-verify-module.md`. HoSTage sits beside all of that and uses a corner of it.
Use the rest:

- **A CEditor panel as a hardware part's window.** A plug-in part opens its plug-in's editor; a
  hardware part should open its panel. Then a Juno in the rack is edited the way a plug-in is,
  which is `total-recall-plan.md`'s promise ("hardware that behaves like a plugin") carried into
  the rack.
- **Auto pages from a device profile.** Auto pages groups a plug-in's parameters eight to a page;
  a device profile has groups too. A CTRL49 page for a synth with no screen of its own, which is
  what the Screen Builder was first meant for, then comes for nothing.
- **Total recall that checks.** A song sends every hardware part its patch, then reads it back
  where the synth allows (`ce.verify`, designed, not built), and the Stage screen says "the Juno is
  not where the song left it" before the first chord does.
- **The rig as one instrument**: `raising-the-bar.md`'s Thesis D (rig polyphony, one patch across
  five machines) belongs here more than anywhere else.

This is the direction with the most of HoSTage's identity in it. Any host can add a tuner. Only
this one can open a panel for a 1987 synth beside a VST3 and recall both.

### 5. Where you play it from

- **A tablet or phone as a remote.** The UI is already a web page. Serve a cut-down stage page on
  the local network: setlist, notes, the current control page, big buttons. The same page gives
  bandmates the setlist and lyrics, following the current song. The Raspberry Pi needs this anyway
  (`hostage-creator-editor-player.md` step 7: WebKitGTK is heavy for a Pi). Network off until the
  user says yes.
- **Foot controllers as first-class.** Describe controller counts knobs, faders and pads. Add
  footswitches and expression pedals, with what a foot needs: tap for next song, hold for panic, a
  long press that does not misfire. For a player with both hands busy, the feet are the controller.
- **More surfaces with screens.** Already proposed (`product-ideas.md` §8, "Generalise the CTRL49
  work"); not repeated here.
- **Headless.** A box with no screen that boots into a player and is run from the CTRL49 or a
  tablet. The Pi's natural form.

### 6. The band, not only the player

- **Setlist follow.** Several HoSTage instances on one network: one leads, the rest follow song,
  scene and tempo (Link carries the tempo; song and scene need a small message of our own). The
  keyboard player's Next sets the guitarist's rig. No shared timeline, only shared cues.
- **A spare that is already playing.** Two machines, the same show, the same MIDI in; the spare
  follows every song and scene change, and a switch (or HoSTage itself, when the main goes quiet)
  hands front of house over. People do this today with hardware A/B switchers and hope.
  `product-ideas.md` §7 has the one-machine halves (survive a dead laptop, a dumb fallback); this
  is the two-machine version.

### 7. Rehearse: a mode between Build and Stage

Build is for making and Stage for playing; rehearsal is neither. A **Rehearse** mode:

- loop a section of a song, with a count-in;
- backing tracks at a slower speed for learning a part (only if direction 2 happens, and only as
  playback speed);
- a black box recording all the time, so the last run-through can be heard back
  (`midi-frontier.md` §6.3 designs the MIDI one; this is the same with audio);
- notes pinned to a section ("chorus too loud") that come back in Stage as cues;
- the existing Measure, song by song, as part of the run.

Not a DAW, because listening back is where it ends. Export the take if it is worth more.

### 8. A few built-ins, on purpose few

"HoSTage has no built-in effects" is a clean rule, and on Windows with a full plug-in folder it
costs nothing. On Linux and on a Pi, where the plug-in pool is small, it costs a lot. A short list,
all utilities, none of them sound design:

- a **safety limiter** on every output, on by default, because a plug-in that jumps to full scale
  on a PA is the one failure isolation cannot catch;
- a **tuner**, for input parts;
- a **click and count-in**, for directions 2 and 7;
- a **file player** that plays a file on a trigger: a one-shot on a pad, a sound effect in a song,
  a stem;
- a **gain and EQ trim** for input parts.

No synths, no reverbs, no mastering chain. Once the list grows a reverb it is a plug-in collection,
and that is a different product. Decision 3.

### 9. Linux as a home, not a port

Now that the standalone runs on Linux:

- **LV2 hosting.** Most open-source Linux instruments are LV2 or have it. The vendored JUCE 8.0.7
  already has `juce_LV2PluginFormat`; the work is in the scanner and the worker, not the format.
- **CLAP** is where much new open-source work goes (Surge XT ships it), but the vendored JUCE has
  no CLAP host; that would be code of our own, and more of it.
- **JACK and PipeWire.** As a JACK client, HoSTage is one box in a bigger patch: other programs
  send it audio and MIDI and take its outputs. Direction 1's extra outputs come almost for free.
- **The worker on Linux.** The one item between Linux and loading a plug-in at all
  (`hostage-creator-editor-player.md`, step 7). The owner's branch may already have it.
- **Health that knows Linux.** Most Linux dropouts come from the setup, not the program: no
  real-time priority for the user, a CPU governor scaling down mid-song. Health already explains
  Windows problems; it should check these and say what to change.

## Decision 2, taken: anyone on stage

> Live inputs: yes, HoSTage is for anyone on stage.
>
> — the owner, 2026-11-16

Until now HoSTage was a keyboard player's program that could also play a hardware synth. From here
it is for whoever stands on the stage. What that asks for, by who is standing there:

| Who | What they need from HoSTage | Built on |
|---|---|---|
| Singer | A vocal chain per song, a harmoniser that follows the keys, an in-ear mix with the click, lyrics on a tablet | Input part, MIDI to inserts, outputs, direction 5 |
| Guitarist, bassist | Amp and pedal chains per song and scene, switched by foot; a tuner; an audio looper | Input part, foot controllers, built-ins |
| Keyboard player | What HoSTage already is | — |
| Drummer | Click and count-in in the ears only; pads that fire samples; the drum machine on the set's tempo | Outputs, file player, show control |
| Whoever runs the set | The setlist the others follow; the cues for lights and words | Directions 3 and 6 |

### First, latency, because it decides whether an input part is worth having

A pedal adds next to nothing. An input part adds three things, and the third is easy to miss:

1. **The interface's round trip**, in and out, at the chosen buffer.
2. **One block per isolated plug-in on the path**, in series. A vocal chain of EQ, compressor and
   reverb at 128 samples and 48 kHz is three blocks: 8 ms before the interface's own share.
3. **The rest of the rig, held back to match.** The graph aligns every path to the slowest, so
   that vocal chain also delays the keyboard player's piano by two more blocks than it costs on
   its own. This is already true between keyboard parts today; inputs make it matter.

For a scale: sound travels about 34 cm in a millisecond, so 15 ms is a guitarist standing five
metres from the amp. Guitarists put up with a few metres. A singer on in-ears is the hard case: they
hear their own voice through the bone at once, and a late copy in their ears colours it, so the
budget there is a few milliseconds, not fifteen.

The ways out, which are not exclusive:

- **(a) Same-block processing for an input part's plug-ins.** The proxy hands block N to the worker
  and waits for block N back, behind a deadline, instead of returning block N−1 at once.
  `plugin-process-isolation.md` rule 3 forbids waiting *without* a deadline, not waiting; rule 2
  (a worker per instance) still holds. What it costs: the workers on that path run one after
  another inside the callback rather than side by side, so less of the block is left over, and a
  missed deadline is an audible dry block rather than nothing. The pipeline was chosen because it
  keeps the audio thread from waiting at all; this spends some of that margin where latency
  matters more.
- **(b) One worker for a whole chain.** One block for the chain instead of one per plug-in. It
  gives up rule 2's exact identity: a crash takes the chain, and the evidence has to say which.
- **(c) Built-ins, which run in HoSTage's own process.** No isolation, so no block. A gate, an EQ
  and a compressor of HoSTage's own on a vocal cost nothing; direction 8 gets a second reason to
  exist.
- **(d) Do not align paths that are not one sound.** A singer and a keyboard part are different
  people metres apart; lining them up to the sample helps nobody and delays one of them. Alignment
  matters where two paths *are* one sound: a layer, parallel processing on a bus. The rule would
  be: **an input never waits for the rig, and the rig never waits for an input** (and a reverb on a
  return no longer holds back the dry voice it is fed from). JUCE's graph aligns every path into a
  node, so this is work at the graph, not a setting. `testLatencyCompensation` keeps its job for
  layered parts and gets a sibling proving an input path is not delayed.

The plug-in stays in its worker whichever way this goes: `hostProductBuild.test.js` holds that, and
a "trusted, in-process" exception for inputs would be the first crack in it.

**Before anything is built, a measurement.** The round trip on two or three common interfaces, at
64, 128 and 256 samples, through 0, 1 and 3 isolated inserts, pipelined and same-block. That one
table decides the design. My expectation is (a), (c) and (d) together, but the table should say so,
not this paragraph.

And the number should be on the screen afterwards: each input part's strip saying how late its
player hears themselves. Devices often report their own latency wrongly, so the honest figure comes
from a loopback: a cable from an output to an input, a click out, the time it takes to come back.

### The audio set-up it needs

- **Inputs, buffer and rate.** Today only the output device is chosen. An input part needs the input
  device and its channels, and a buffer size the player picks, because the buffer is the latency.
- **Output pairs in the standalone** (direction 1), for front of house, in-ears and the click.
- **ASIO on Windows.** It is how most interfaces reach their small buffers there, and it is not
  enabled. JUCE also has WASAPI's low-latency mode; whether that is good enough for a singer belongs
  in the measurement. ASIO's SDK comes from Steinberg on its own terms, so enabling it is a
  decision of its own (decision 8).
- **JACK and PipeWire on Linux** (direction 9) give inputs, outputs and small buffers natively.

### The input part itself

- **Its source** is one input channel (mono) or a pair (stereo). Mono stays mono until a stereo
  plug-in widens it.
- **No Zone and no MIDI chain of its own, but MIDI to its inserts.** "MIDI from" chooses whose notes
  its inserts hear (the keyboard part's, for a harmoniser or a vocoder). Not wired for any insert
  today.
- **When a plug-in fails.** A failed effect passes its dry input today. Right for a vocal reverb;
  wrong for an amp simulator, where "dry" is a thin, harsh DI straight into the PA. Per insert:
  pass through, or go quiet.
- **Opening a show.** A show that opens with a live microphone into a big reverb can howl before
  anyone touches anything. Input parts open muted, until the song starts or the player unmutes them.
- **Mute inputs.** Panic silences notes, and an input has none. A separate **mute inputs** (on the
  Stage screen, a key, a footswitch) is for the howl Panic cannot stop. Stage Lock keeps input
  levels and mutes available, as it does part levels.
- **The output limiter** (direction 8) stops being an extra once there are microphones: it is
  protection for ears and speakers.

### Tools for whoever is not at the keyboard

- **A tuner** that mutes the part's output while it is open, as a pedal does; shown on the Stage
  screen, the CTRL49 and the remote; opened by a footswitch.
- **Stomp mode:** a footswitch on an insert's **Byp**. The manual's list of what a control can move
  (a part's gain, pan, morph and sends, a MIDI module's amount, a macro, a plug-in parameter) has
  no insert bypass in it. A plug-in's own bypass parameter can be learned where it has one, but that
  is a different switch from the one HoSTage shows and controls.
- **An audio looper.** It passes the question under the looper's existing row: record, overdub,
  undo, clear, in time with the transport. Never a set of takes to arrange.
- **A pedalboard on the Stage screen:** big switches for the input part's inserts. And the keyboard
  strip, which sits above four workspaces, can be hidden; for a guitarist it is clutter.

### In the library

- A chain preset already keeps an instrument, its modules and its inserts; an **input chain** is a
  chain with no instrument. A guitarist's tones and a singer's vocal chains live in the library like
  any other sound.
- **Auditioning has nothing to play.** The auditioner plays notes into an instrument; an input chain
  takes no notes. It needs a reference signal: a phrase of the player's own guitar or voice,
  recorded once in HoSTage and played through every chain. Previews made that way are in the
  player's own sound, which is the point.

### A second line: not a mixing desk

"Anyone on stage" can slide into "everyone's sound goes through HoSTage", and that is a mixing
console: channel strips for the whole band, a console's scene recall, the band recorded on many
tracks (which is the DAW line again).

The proposed line: **HoSTage processes the sound of the people who play through it.** One machine
can serve several players (a singer and a keyboard player on one laptop, say). It does not take the
drum microphones and mix the band. Front of house belongs to the desk, and HoSTage sends it a pair
or stems. HoSTage's monitor outputs are its own players' in-ear mix: their sound, the click, the
cues, and at most a feed back from the desk. Decision 9.

### What it does to the other decisions

- **Decision 3 (built-ins) is pushed.** A tuner and an output limiter are hard to do without once
  there are microphones and guitars, and built-ins are the zero-latency answer for a vocal chain.
  The rest of the list stays open.
- **Decision 6 (editions) has a hole in it.** The Free edition limits instrument plug-ins and lets
  effects through. A singer or a guitarist has no instruments, so the Free edition is their whole
  HoSTage. That may be the right answer, a generous free tier for everyone who is not at a
  keyboard, but it should be chosen, not stumbled into.

## What stays out

Said once, plainly, so nobody has to argue it again:

- audio tracks, recording in order to edit, comping, waveform editing, stretching to fit;
- an arrangement: clips at positions, automation lanes across a song;
- bounce, mixdown, render, or stem export as a product feature;
- a MIDI editor beyond the pattern's loop;
- video, and sync to picture;
- any offline processing.

**Instead, hand off.** The player's VST3 inside a DAW is already the bridge. Add to it: export a
capture or a pattern as a `.mid` file (`ce-file-module.md` designs the MIDI file writer), export a
black-box take as a `.wav`, and give a DAW a song's tempo and sections as markers. HoSTage is the
instrument; the DAW is where its recordings go.

## Decisions for the owner

1. **Backing tracks.** In, under direction 2's rules, or out?
2. ~~**Live inputs.** Is HoSTage for the keyboard player, or for anyone on the stage?~~ **Decided,
   2026-11-16: anyone on stage.** See [Decision 2, taken](#decision-2-taken-anyone-on-stage).
3. **Built-ins.** Keep "no built-in effects", or allow direction 8's short list? Decision 2 pushes
   this toward at least a tuner and an output limiter.
4. **The network.** A remote page, band follow and OSC all open a port. The same rule as `ce.osc`:
   nothing until the user says yes, once?
5. **Linux formats.** LV2 (JUCE has it), CLAP (our own code), both, or neither for now?
6. **Editions.** Which of these are Pro? Pro today is patterns, scenes, setlists, buses and script
   actions. Show control and band follow look like Pro; live inputs and the limiter look like
   everyone's. And, since decision 2: the Free edition's limit counts instruments only, so a
   singer or a guitarist never meets it. Intended?
7. **Aligning paths.** Should an input stop waiting for the rig, and the rig for an input (way (d)
   under latency)? It changes a behaviour a test pins today, for layers' sake, so it is the owner's
   call, not a refactor.
8. **ASIO.** Enable it on Windows, with Steinberg's SDK and its terms, or rely on WASAPI's
   low-latency mode if the measurement says that is enough?
9. **Not a mixing desk.** Confirm the second line: HoSTage processes the sound of the people who
   play through it, and front of house belongs to the desk.

## Where to start

Revised after decision 2. A recommendation, not a ranking of everything:

1. **The latency measurement.** Not a feature: the table under
   [latency](#first-latency-because-it-decides-whether-an-input-part-is-worth-having) that decides
   whether an input part is worth having and which of (a) to (d) it needs. Small, and nothing else
   in decision 2's section should start before it.
2. **Audio & MIDI:** inputs, buffer size and rate chosen; output pairs in the standalone; ASIO after
   decision 8.
3. **The input part**, with MIDI to inserts, the tuner, mute inputs and the output limiter.
4. **Foot controllers and stomp mode** (direction 5 and the tools above).
5. **The audio looper, and input chains in the library** with their reference signal.

Alongside, because they do not depend on any of that: **show control (3)**, cheap and built almost
entirely on what exists (MIDI clock out and Link first), and **the whole rig (4)**, which only this
program can do. **The remote page (5)** follows; singers want their lyrics on it, and the Pi needs
it anyway.

Backing tracks wait for decision 1. Everything under "What stays out" waits for good.

## Where this comes from

The owner's message of 2026-11-16. What exists: `docs/hostage-manual.md` and the code cited above.
Earlier ideas this builds on rather than repeats: `hostage-creator-editor-player.md` (the tiers and
the Pi), `product-ideas.md` §7, §8 and §14, `midi-frontier.md` §6, `raising-the-bar.md` Thesis D,
`total-recall-plan.md`, `plugin-process-isolation.md`, and the `ce.osc`, `ce.verify` and `ce.file`
module designs.
