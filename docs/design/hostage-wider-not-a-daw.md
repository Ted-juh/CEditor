# HoSTage, wider — and the line before a DAW

*Discussion record, 2026-11-16. Nothing in it is built. Decisions are in the table below. Written
from `main`; the owner's Linux standalone port is not pushed yet. When this and the code disagree,
the code is right. Trimmed the same day at the owner's request: shorter, and nothing
overengineered.*

> I want to extend Hostage beyond what it is now. It could be very wide.. but I DON'T want it to be
> a daw.
>
> — the owner

## The line

A DAW's document is a timeline, it records in order to edit, and its product is a file. HoSTage's
document is a rig and a set, and its product is sound in the room, now. One question for every
feature:

> **Does it make the next sound better, or the last sound editable?**

- Recording is fine as the end of the road (a black box) or a handoff (export to a DAW); never to
  edit.
- Time is fine as a cue ("4 bars to Chorus"), not as a canvas (a clip at bar 33).
- Audio files are fine when played, not when made.

Already close to the line, and the step each must not take:

| Already there | Must not become |
|---|---|
| Patterns (64 steps) | Long MIDI parts, CC across a song |
| Song sections | An arrangement with clips placed in it |
| Recorder, Instant Replay | Multitrack recording that gets edited |
| Gestures | Automation lanes across a song |
| Capture last, Looper | Takes to comp or arrange |

**Stays out:** audio tracks, comping, an arrangement, bounce or mixdown, a long MIDI editor, video,
offline processing. **Instead, hand off:** `.mid` and `.wav` export, song sections as DAW markers,
and the player's VST3 inside a DAW.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Backing tracks | **In, play-only** (recommended): files arrive finished; start, end and loop are the only edits; never recorded into or stretched. |
| 2 | Who HoSTage is for | **Anyone on stage**, not only the keyboard player. |
| 3 | Built-ins | **Yes**, utilities only: output limiter, tuner, click and count-in, file player, input trim. No synths or reverbs. |
| 4 | Network | **Nothing opens a port until the user agrees once.** |
| 5 | Linux formats | **LV2 and CLAP.** LV2 first: the vendored JUCE hosts it; CLAP is our own code. |
| 6 | Editions | **Everything this record adds is Pro.** Fixes to existing behaviour are not features and go to every edition. |
| 7 | Do live inputs wait for slower parts? | **No.** Independent paths are not aligned; layers stay aligned. |
| 8 | ASIO on Windows | **Yes.** |
| 9 | Not a mixing desk | **Open**: see [the question](#open-decision-9). |
| 10 | Solo | **Solo stays** (silences every other part). **Listen** is a separate headphone button. |
| 11 | Mappings | **Per interface**, not per computer. |
| 12 | VST3 audio input | **Add it, early.** |
| 13 | Interface lost on stage | **Wait for that interface** and reopen it. |

All taken 2026-11-16. The owner's words for 1 and 11 to 13: "what is recommended", "So the
recommendations and document it". For 10: "I liked the fact you could solo a channel/ instrument
that would mute all the others. So, instead of "solo" i would prefer a headphone icon as an extra
button."

### Open: decision 9

The owner answered "Mixing desk, if we are already there, yes". Not yet settled which way that
reads: **HoSTage may become the band's mixing desk**, or **confirm the line, it is not one**.

What the line meant: HoSTage processes the sound of the people who play through it (a desk feed
into their in-ears, stems to the desk), and front of house is the desk's. The main reason was the
size of a failure: a dead laptop should silence only its own players, not the whole band. Becoming
a desk means channel strips on every input, 16 to 32 inputs, and the whole band on one laptop.

## Today, from the code

What the plans below rest on. File references are to `CE/src/InstrumentHost/` unless said.

- **Audio input** exists only as a hardware synth's return, kept as a bare channel number
  (`RackModel.h`, `audioReturnChannel`).
- **The device is never remembered.** Every start opens the system default with two outputs
  (`InstrumentHostService::startAudio`). On Windows that is shared mode, the slowest; the type is
  never offered. No ASIO, no JACK (JUCE defaults). Buffer and rate are the device's own.
- **MIDI input switches are forgotten**: `startAudio` switches every input on. A bug.
- **A hardware synth's MIDI port** is opened by system id only (`openHardwareMidi`), so a show on
  another computer loses it.
- **Output pairs** exist in the rack (1 to 8, `RackModel::outputPairs`), but the standalone opens
  two outputs. Routing is one pair per part; returns always feed the master; sends are post-fader.
- **The VST3 accepts no audio input** (`HostPluginProcessor::isBusesLayoutSupported`).
- **Nothing watches the device.** And a hardware synth's notes go out from a graph node
  (`MidiSendProcessor`, `RackProcessors.h`), so they stop when the audio device stops.
- **Latency**: each isolated plug-in adds a block (`IsolatedPluginProxy.cpp`), inserts add up in
  series, and JUCE's graph delays every path to the slowest (`modular-chain.md`). Three inserts at
  128 samples is 8 ms, and it holds the other parts back too.
- **No insert receives MIDI** (the graph's MIDI connections, `InstrumentRackHost.cpp`). **No
  sidechain routing.**
- **The looper, Capture last, Recorder and Instant Replay are MIDI only.**
- **VST3 is the only plug-in format** (`ScannerWorkerMain.cpp`). No clock out, no Ableton Link, no
  OSC in the host.
- **Solo** silences every other part at every output (`InstrumentRackHost::applyMixerState`), is
  saved with the rack and never cleared (`RackModel.cpp`; scenes recall mute, not solo), and the
  Stage screen labels the parts it silences LIVE
  (`CE/web/src/CE_Application/sections/stage/StageRig.svelte`). The headphone icon already marks
  "silenced by Solo" (`CE/web/src/CE_Application/sections/HostPartIssueIcons.svelte`).
- **Meters**: one per strip, after the fader; the master covers output 1–2 only; sends and other
  outputs have none (`mixer-metering.md`).

## Directions

None needs a timeline, edits a recording or renders a file.

1. **Live inputs and outputs.** Mic, guitar or bass through effects; separate outputs for front of
   house, in-ears and click.
2. **Backing tracks**, play-only (decision 1).
3. **Show control.** A song or scene change also sends program changes to other gear, MIDI clock
   out, Ableton Link, MIDI to lights, OSC to a lyrics app.
4. **The whole rig.** A CEditor panel as a hardware part's window; Auto pages from a device
   profile; recall that reads the synth back.
5. **Where you play from.** A tablet or phone as a remote; footswitches and expression pedals.
6. **The band.** One HoSTage leads the setlist, others follow; a spare machine follows along.
7. **Rehearse mode.** Loop a section, hear the last run-through back, pin notes to a section.
8. **Built-ins**, the short list (decision 3).
9. **Linux.** LV2 and CLAP (decision 5), JACK, Health checks for real-time setup.

## Live inputs (decision 2)

**Latency comes first.** Ways out, pending a measurement: (a) process an input's plug-ins in the
same block, behind a deadline; (b) one worker per chain; (c) built-ins, which add no block. Way (d),
independent paths not aligned, is decided (7). The measurement: round trip on two or three
interfaces, at 64, 128 and 256 samples, through 0, 1 and 3 inserts.

**The input part:**

- A part kind: instrument, hardware or input. Mono or stereo source, inserts, mixer strip; no Zone
  or MIDI tab.
- MIDI to its inserts, for a harmoniser or vocoder.
- Opens muted. **Mute inputs** beside Panic, since Panic only stops notes.
- Per insert: on failure, pass dry or go quiet (a dry amp sim is harsh in a PA).

**The Mixer:** an input meter before the effects and the mute (shows CLIP, a real clip); a meter
per output pair; the limiter's gain reduction; latency in ms on input strips.

**Tools:** tuner (mutes while open), stomp mode (a footswitch bypasses an insert), an audio looper,
input chains in the library (auditioned with a recorded phrase of the player's own instrument).

**Elsewhere it reaches:** part pickers for layers, note lanes and "MIDI from" leave input parts
out; Params and Auto pages use the inserts; control targets gain insert bypass, input trim and mute,
Solo and Listen; footswitch and expression pedal as control kinds; Instant Replay says it does not
replay inputs; Health watches inputs; every new command placed in `stageSafeParity.test.js` and
`hostagePlayerRole.test.js`; most manual chapters.

## Step 2: Audio & MIDI

- **2a. Remember the setup**: device type (ASIO included, decision 8), devices, rate, buffer (shown
  in ms too), and the MIDI input switches. Small, no model change. Needed before the latency
  measurement can run.
- **2b. Connections.** A show names what it needs ("Vocal mic", "In-ears", "Juno"); each interface
  maps them once (decision 11). MIDI ports: by id, then by name, then ask. Old shows convert.
- **2c. Outputs.** Every pair ends in level, limiter and meter. A monitor mix is a return that
  leaves through its own pair, fed by pre-fader sends. The click goes to its own pair only.
- **2d. On stage.** If the interface goes: a banner, wait for it, reopen with inputs muted
  (decision 13). Meanwhile a silent clock keeps the graph running, so hardware synths keep
  receiving MIDI.
- **2e. VST3**: one stereo input bus, off by default (decision 12).
- **2f. JACK on Linux** (needs `libjack-dev` to build; loaded at run time).

## Solo and Listen (decision 10)

- **Solo**: unchanged in behaviour. Fixed so it cannot surprise: not saved into a show or restored
  at start; the Stage screen says SOLOED OUT instead of LIVE; a stage banner clears it in one tap.
- **Listen** (headphone button) on every strip: the strip goes to the listen output (in-ears or the
  interface's headphone pair), pre-fader, front of house untouched. It ignores Mute and Solo, dims
  the rest of the in-ears rather than replacing them, never dims the click, and is never saved.
- The "silenced by Solo" warning gets another icon (an S badge).

## Order of work

1. **Fixes, any time, every edition**: Solo not saved, SOLOED OUT and the banner; MIDI input
   switches remembered.
2. **2a**, then **the latency measurement** (the owner's interfaces).
3. **2e**, early (decision 12).
4. **2b**, **2c** with Listen, **2d** (its silent clock first).
5. **The input part**, with its meters, tuner, limiter, mute inputs and MIDI to inserts.
6. **Foot controllers and stomp mode.**
7. **Audio looper, input chains, backing tracks.**

Alongside, independent: **show control** (clock out and Link first) and **the whole rig**. Then the
remote page, LV2 and CLAP, and JACK.

## Sources

The owner's messages of 2026-11-16; `docs/hostage-manual.md`; the code cited. Builds on
`hostage-creator-editor-player.md`, `product-ideas.md` §7, §8 and §14, `midi-frontier.md` §6,
`raising-the-bar.md` Thesis D, `total-recall-plan.md`, `plugin-process-isolation.md`,
`mixer-metering.md`, `setlist-soundcheck.md`, and the `ce.osc`, `ce.verify` and `ce.file` module
designs.
