# HoSTage, wider — and the line before a DAW

*Discussion record, started 2026-11-16. Nothing in it is built and nothing in it is decided; the
decisions at the end are the owner's. Written from `main`: the owner's Linux standalone port of
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
- **Isolation adds one block of latency** (`plugin-process-isolation.md`, rule 6). Irrelevant for a
  synth; relevant for a voice.
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

The hard part is latency, and the number should be known before anything is promised. Isolation
adds one block: at 128 samples and 48 kHz that is 2.7 ms on top of the interface's own round trip,
which a singer will not notice; at 512 samples it is 10.7 ms more, which they will. The plug-in must
stay in its worker: `hostProductBuild.test.js` holds that line, and a "trusted, in-process"
exception for inputs would be the first crack in it. So: measure the real round trip on the
interfaces people use, show it on the input part's strip, and say plainly that a vocalist on
in-ears wants a small buffer.

To check before designing: whether an insert receives the part's MIDI. A vocoder or a harmoniser
on a vocal part needs the keyboard's notes.

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
2. **Live inputs.** Is HoSTage for the keyboard player, or for anyone on the stage? This sets the
   order of nearly everything above.
3. **Built-ins.** Keep "no built-in effects", or allow direction 8's short list?
4. **The network.** A remote page, band follow and OSC all open a port. The same rule as `ce.osc`:
   nothing until the user says yes, once?
5. **Linux formats.** LV2 (JUCE has it), CLAP (our own code), both, or neither for now?
6. **Editions.** Which of these are Pro? Pro today is patterns, scenes, setlists, buses and script
   actions. Show control and band follow look like Pro; live inputs and the limiter look like
   everyone's.

## Where to start

A recommendation, not a ranking of everything:

1. **Show control (3).** The cheapest, it builds almost entirely on what exists, and it turns
   HoSTage from the thing that plays into the thing that runs the stage. MIDI clock out and Link
   first: they are the two everyone asks for.
2. **The whole rig (4).** The panel as a hardware part's window, and Auto pages from a profile.
   This is what only this program can do, and it ties CEditor's two halves together.
3. **Live inputs and outputs (1)**, after the latency is measured on real interfaces and after
   decision 2.
4. **The remote page (5)**, because the Pi needs it anyway.

Backing tracks wait for decision 1. Everything under "What stays out" waits for good.

## Where this comes from

The owner's message of 2026-11-16. What exists: `docs/hostage-manual.md` and the code cited above.
Earlier ideas this builds on rather than repeats: `hostage-creator-editor-player.md` (the tiers and
the Pi), `product-ideas.md` §7, §8 and §14, `midi-frontier.md` §6, `raising-the-bar.md` Thesis D,
`total-recall-plan.md`, `plugin-process-isolation.md`, and the `ce.osc`, `ce.verify` and `ce.file`
module designs.
