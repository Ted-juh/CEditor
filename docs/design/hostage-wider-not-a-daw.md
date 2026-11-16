# HoSTage, wider — and the line before a DAW

*Discussion record, started 2026-11-16. Nothing in it is built. Four decisions are taken, all on
2026-11-16: **HoSTage is for anyone on stage** (decision 2, see
[Decision 2, taken](#decision-2-taken-anyone-on-stage)), and decisions 11 to 13 on step 2, where the
owner took the recommendations: mappings per interface, an input bus on the VST3, and waiting for
the interface on stage (see [Decisions for the owner](#decisions-for-the-owner)). Step 2 of the work, Audio & MIDI, is
[worked through](#step-2-worked-through-audio--midi), not built. The other decisions at the end are
the owner's. Written from `main`: the owner's Linux standalone port of
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

### The Mixer: meters, and what else changes

*Added after the owner asked whether this means extra meters in the Mixer. It does, and Solo has to
change too.*

**What is there** (`mixer-metering.md`): one stereo peak meter per strip, read after the strip's
inserts, fader and pan (`GainPanProcessor`), on parts, buses, returns and the master. The master
meter covers output 1–2 only; a part routed to another pair is metered nowhere at the output, and
sends and extra-output gain nodes are not metered. Peak only, with OVER latched at 0 dBFS, which on
a floating-point bus means "reached full scale", not "clipped". Soundcheck measures peak and RMS on
output 1–2 only.

**What decision 2 adds:**

1. **An input meter on every input part, before anything else.** The strip's meter is after the
   chain and the fader, so turning the fader down hides an input that is clipping. The input meter
   is the one a singer's preamp gain is set by. OVER means something else here, too: at the input,
   0 dBFS is the converter's ceiling, a real clip nothing downstream can undo. Show it as **CLIP**,
   not OVER. It reads *before* the mute, so a muted mic (input parts open muted) still shows it is
   arriving: the singer checks the mic without the PA hearing it.
2. **A meter per output pair**, front of house, in-ears and click each, at the very end where the
   signal leaves for the interface. There, too, 0 dBFS is a real clip.
3. **The limiter's gain reduction** on each output strip, and a count per song ("limited 14 times
   in Song 3"). A limiter that works silently hides a gain problem; one that says how often it
   worked turns it into a soundcheck note.
4. **Numbers beside the meters:** each input strip's latency in milliseconds, the way buses and the
   master already show theirs.
5. **The tuner** on the input strip, as well as on the Stage screen.

**What else changes:**

- **Solo becomes listen.** Today Solo is solo-in-place: any soloed part silences every other part at
  its gain node (`InstrumentRackHost::applyMixerState`), which is every output, front of house
  included, and Stage Lock allows it (`setPartMixer` is on `stageLock.js`'s allow-list). On a
  keyboard rig that is one stray click from silence; with a singer in the rig, soloing a synth takes
  the voice out of the PA. Once there is a monitor output, Solo should send the soloed strip to the
  in-ears and leave front of house alone, as on any live desk. Decision 10.
- **A monitor mix is a view of the mixer.** Sends to returns are knobs on each strip today. A monitor
  mix wants faders, because "more me" is adjusted mid-song: one view per output (Main, In-ears,
  Click) with each strip's send to that output on its fader.
- **Input strips look different**: an input trim, the input meter, the latency, the tuner; no
  instrument, no MIDI.
- **The Meters page** on the CTRL49 and the Stage screen gets the inputs and the output pairs. "Is
  my mic arriving?" is a stage question.
- **Soundcheck** measures per input and per output pair, not only output 1–2: how hard the singer
  sings in the loudest song is what the input gain should be set for, not the first song. Still
  measurement, never automatic gain (`setlist-soundcheck.md`).

**What stays out**, the line applied to meters: LUFS loudness, spectrum analysers, phase
correlation, loudness history. They are for making a file, or the engineer's job at the desk
(decision 9). Ringing out the monitors belongs to the desk too.

**Cost.** Small per meter. `StereoPeakMeter` is a lock-free atomic per point, and the
`instrumentHostMeters` event already carries the whole roster at UI rate, so more points are more
entries, not a new mechanism. The new tap points are before an input part's chain, and after each
output pair's gain node, which `mixer-metering.md` says does not measure today. The input meters
come with the input part, the output meters with the output pairs.

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

### Everywhere else it reaches

*Added after the owner asked whether there is more than the Mixer, Solo and the rig waiting. There
is: an input part touches almost every workspace, the files, both command lists and the manual.*

**Needed** means an input part is broken, unsafe or misleading without it; **follows** means it
makes the input part good. What the sections above already cover is only pointed at.

**The model and the files**

| Where | What changes | |
|---|---|---|
| `RackPart` | A part gets a kind: instrument, hardware, or input. Today it is an instrument or `hardware` (a flag). Old sessions lack the field and read back as they are. | Needed |
| Channels | **By name, not by number.** A hardware part keeps its MIDI output by id and name (`midiOutputId`, `midiOutputName`) but its audio return as a bare channel index (`audioReturnChannel`). A show moved to another interface (a USB-stick player on a venue's laptop) plays whatever is on that channel there. Inputs and output pairs should be named in the show ("Vocal mic", "Guitar DI", "In-ears") and mapped to channels once per machine, as plug-ins are scanned once per machine. This fixes the hardware return too, which has the same weakness today. | Needed |
| Shows and Check setlist | Opening a show names the inputs and outputs it needs that this machine has not mapped, as it names missing plug-ins. Check setlist checks the mappings, as it checks hardware MIDI outputs. | Needed |
| Session recovery, Safe startup | An input part comes back muted, whichever way the rig was restored. | Follows |

**The Rack and the dock**

| Where | What changes | |
|---|---|---|
| + Add part, Canvas | Choose instrument, hardware or input. On the canvas, inputs are boxes in a column before the parts. | Needed |
| Part rows | The preset walker, the key-range button and Load mean nothing for an input part. It shows its input's name, a signal light, its latency and a tuner button instead. | Needed |
| Dock | Zone and MIDI hidden for an input part; an **Input** tab (channel, mono or stereo, trim, "MIDI from" for its inserts, each insert's failure behaviour). **Params** lists the plug-in's parameters today; for an input part it lists its inserts'. | Needed |
| The keyboard strip | Can be hidden (see Tools above). | Follows |

**Effects**

| Where | What changes | |
|---|---|---|
| MIDI to inserts | Not wired today (see the list near the top). | Follows: harmoniser, vocoder |
| Sidechain | Nothing in the rack routes a sidechain (`RackModel.h` and `InstrumentRackHost.cpp` never mention one), though the worker's data plane can carry one when asked. A vocoder wants the voice and the synth on two inputs; a ducker wants the voice on its sidechain. | Follows |
| On failure | Pass through or go quiet, per insert (see The input part). | Needed |
| Latency | Same-block processing, not aligning independent paths (see latency above). | Needed |

**Layers, patterns and MIDI routing.** Every picker that lists parts must leave input parts out
where they make no sense: a layer takes instruments; a pattern's note lane plays a part; "MIDI
from" lists sources, and an input part has no MIDI chain to be one. Parameter lanes and parameter
locks on an input part's inserts work as they do for any plug-in. **Needed**, small.

**Performance**

| Where | What changes | |
|---|---|---|
| Instant Replay, Recorder, Capture last | All MIDI. Instant Replay is a deterministic replay of what was played *through the rig* (`startPerformanceReplay`): the keys come back, the voice and the guitar do not. It must say so, until the audio black box of direction 7 exists. | Needed (honesty) |
| Looper | MIDI today; an audio looper (see Tools). | Follows |
| Modulation | An input's level as a source in the Matrix (an envelope follower): the singer's voice opens the pad's filter. Within the line; it is played, not edited. | Follows |
| Scenes and morph | An input part's inserts are plug-in parameters, so scenes and morph already reach them. Whether a scene recalls an insert's bypass ("Chorus: drive on") needs checking; a guitarist's scene is mostly that. | Follows |

**The Controller workspace and the CTRL49**

| Where | What changes | |
|---|---|---|
| Control targets | An insert's bypass, an input's trim and mute. None is on the manual's list today. | Needed for stomp mode |
| Describe controller | Footswitches and expression pedals as kinds of control. `ControlSlot::kind` is encoder, fader, pad or button. | Needed for foot control |
| Auto pages | Built from the selected part's plug-in; for an input part, from its inserts. | Follows |
| CTRL49 stage pages | Meters with inputs and output pairs; the tuner; pads as stomp switches. | Follows |

**Stage, and the two command lists**

| Where | What changes | |
|---|---|---|
| Stage Lock | Every new command (mute inputs, the tuner, stomp bypass, input trim, the input mapping) needs a yes or no. `stageSafeParity.test.js` holds the browser's copy to `isStageSafeCommand`, so none can be left undecided. | Needed |
| Player role | The same for the editor-only list; `hostagePlayerRole.test.js` fails until each is placed. The input mapping must be the player's: a stick player on a new computer has to map its inputs. | Needed |
| Stage screen | A signal light and CLIP per input, the tuner, mute inputs, the pedalboard view; banners for an input gone quiet and an interface unplugged, beside the existing MIDI ones. | Needed (banners), follows (the rest) |

**Utilities**

| Where | What changes | |
|---|---|---|
| Audio & MIDI | Input device and channels, buffer, rate, the named inputs and outputs and their mapping, the loopback measurement, ASIO (decision 8). | Needed |
| Health | "MIDI, right now" (`evaluateMidiHealth`) gets an audio counterpart: an input gone silent, an interface unplugged, clipping at an input, the rate changed under the rig, dropouts rising. Linux's real-time checks belong here too (direction 9). | Needed (interface gone), follows (the rest) |
| Support bundle | The audio set-up and the input mapping go in it. | Follows |
| Product, and the VST3 | In a DAW an input part reads the plug-in's input bus, which is the DAW track's audio; the Product utility's output pairs get input pairs beside them. Monitoring latency there is the DAW's. | Follows |
| Edition | The Free edition's hole (below), and whether the audio looper is Pro as the looper is. | Decision 6 |

**Scripting.** Script actions (Pro) that address a part's instrument have to cope with a part that
has none. **Follows**, but it is a change to what a script can rely on, so it wants saying in the
scripting manual when it lands.

**The manual and the tests.** The manual changes in nearly every chapter: 4 (the rack), 5 (input
chains), 6 (the Mixer), 7 (layers take no inputs), 8 (what Replay and the looper do), 9 (footswitch,
stomp), 10 (the CTRL49 pages), 11 (Stage), 12 (Audio & MIDI, Health), 13 (editions) and 15 (known
limits). The tests that hold lines and will need siblings: `testLatencyCompensation` (layers stay
aligned, inputs do not wait), `mixerMeters.test.js` (input and output points), the two parity tests
above, and `hostProductBuild.test.js`, which built-ins do not break: they are HoSTage's own code,
in-process like `GainPanProcessor` already is, held to the same rules on the audio thread.

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
10. **Solo.** Once there is a monitor output, should Solo become listen-in-the-ears and never touch
    front of house? Today it silences everything else at every output, under Stage Lock too.
11. ~~**Mappings per interface or per computer?**~~ **Decided, 2026-11-16: per interface**, as
    recommended. See [2b](#2b-name-what-the-show-needs-map-it-once-per-interface).
12. ~~**The VST3's input bus.** Add one, and when?~~ **Decided, 2026-11-16: add it, and early**,
    before products sit in many people's projects, as recommended. See [2e](#2e-the-vst3).
13. ~~**When the interface goes on stage.** Wait, or fall back to the default device?~~ **Decided,
    2026-11-16: wait for that interface and reopen it**, as recommended. See
    [2d](#2d-the-device-on-stage), which also says what has to keep running while it waits.

The owner's words for 11 to 13: "So the recommendations and document it."

## Where to start

Revised after decision 2. A recommendation, not a ranking of everything:

1. **The latency measurement.** Not a feature: the table under
   [latency](#first-latency-because-it-decides-whether-an-input-part-is-worth-having) that decides
   whether an input part is worth having and which of (a) to (d) it needs. Small, and nothing else
   in decision 2's section should start before it. *Found in step 2: it cannot run until HoSTage
   can be told a buffer size and a device type, which is step 2a. So 2a goes first of all.*
2. **Audio & MIDI**, [worked through below](#step-2-worked-through-audio--midi): the set-up
   remembered (2a); inputs, outputs and MIDI ports named in the show and mapped once per interface
   (2b, which fixes the hardware return's channel number and its port id too); output strips and
   monitor mixes (2c); the device watched on stage (2d); the VST3 (2e); JACK and ASIO (2f).
3. **The input part**, with its input meter, MIDI to inserts, the tuner, mute inputs and the output
   limiter with its gain reduction; Solo as listen (decision 10) once the in-ears exist.
4. **Foot controllers and stomp mode** (direction 5 and the tools above).
5. **The audio looper, and input chains in the library** with their reference signal.

Alongside, because they do not depend on any of that: **show control (3)**, cheap and built almost
entirely on what exists (MIDI clock out and Link first), and **the whole rig (4)**, which only this
program can do. **The remote page (5)** follows; singers want their lyrics on it, and the Pi needs
it anyway.

Backing tracks wait for decision 1. Everything under "What stays out" waits for good.

## Step 2, worked through: Audio & MIDI

*Worked through on 2026-11-16 at the owner's request ("go to step 2"), read from the code first,
as decision 2 was. Nothing built. Step 1, the latency measurement, needs the owner's interfaces;
and, as it turned out, the first part of this step.*

### What is there today

- **Nothing about the device is remembered.** `startAudio` calls
  `initialiseWithDefaultDevices (neededInputChannels(), 2)` on every start: the system's default
  device, two outputs, and only as many inputs as hardware returns need. Choosing an output in the
  utility (`setAudioDevice`) lasts until the program closes. The code says as much: "explicit
  device selection is a later step".
- **The device type is never chosen.** On Windows JUCE offers Windows Audio (shared), Windows Audio
  (Exclusive Mode), Windows Audio (Low Latency Mode) and DirectSound
  (`juce_AudioDeviceManager.cpp`), and the first is the default: the one that goes through Windows'
  own mixer, with the most latency of the four. The utility lists the output devices of whichever
  type opened. ASIO is not built (`JUCE_ASIO` defaults to 0 and nothing sets it); on Linux only
  ALSA is (`JUCE_JACK` defaults to 0).
- **The buffer size and the sample rate are the device's own**, and shown only in the header's
  status line.
- **The MIDI input switches are forgotten.** Nothing saves them, and `startAudio` switches on every
  input it finds. Strictly, that is a bug today.
- **A hardware part's MIDI port is found by its system id alone** (`openHardwareMidi`); the port's
  name is kept only for the error message. Port ids differ between computers (and on Windows not
  always only between computers), so a show opened elsewhere fails each hardware part with "Cannot
  open MIDI output. (Juno)". Its audio return is a bare channel number (see the inventory above).
- **Outputs.** The rack has one to eight output pairs (`RackModel::outputPairs`). A part on any
  pair but the first leaves through it directly, past the master chain and fader: written for a
  DAW's stems (`RackModel.h`). The standalone opens two outputs, so whatever is on pair two or
  above goes nowhere there. Routing is exclusive, one pair per part; returns always feed the
  master (`ReturnChain` has no destination); sends tap after the fader.
- **The VST3 takes no audio in.** `HostPluginProcessor::isBusesLayoutSupported` refuses any main
  input, so a hardware part's return cannot work in a DAW today, and neither could an input part.
- **Nothing watches the device.** The service registers for none of the device manager's
  notifications. If the interface is unplugged mid-song, whatever JUCE's device manager does
  happens, and nothing tells the player. MIDI inputs, by contrast, have "MIDI, right now".
- **Stage Lock** allows `getAudioDevices` and refuses `setAudioDevice` and `setMidiInputEnabled`.
  Right as it is.
- **One thing to keep:** `neededInputChannels` opens no input when nothing needs one, so a keyboard
  player's HoSTage never asks the system for the microphone. Input parts keep that rule: inputs
  open when an input part or a hardware return asks for them.

### 2a. Remember the machine's audio set-up

The device type, the input and output device, the sample rate and the buffer size, saved in the
data folder (a portable player's in its `Data/`) and restored at start. The default device only on
a first start, so HoSTage still makes sound out of the box. The MIDI input switches saved the same
way, which fixes the bug above.

The utility shows the type, with a line saying what each means ("shared with other programs",
"this program only, lower latency"), the sample rate, and the buffer **in milliseconds as well as
samples**, because milliseconds are what a singer feels.

No change to the rack model; small. **It comes before step 1**: the latency measurement needs
HoSTage at a chosen buffer and a chosen device type, and today it can be told neither.

### 2b. Name what the show needs; map it once per interface

The show stops holding channel numbers and port ids. It names its **connections**: inputs ("Vocal
mic", "Guitar DI", "Juno return"), output pairs ("Main", "In-ears", "Click") and MIDI ports ("Keys",
"Juno"). The data folder holds the mapping, and holds it **per interface, not per computer**: "on
this Scarlett, Vocal mic is input 1". The same interface on another computer then needs nothing; a
different interface asks once. A portable player carries its mappings on the stick. *Decided
(decision 11), 2026-11-16.*

What "an interface" is, precisely, because the system does not hand over one name for it:

- **The key is the name the device type reports**: the input device's name for input connections,
  the output device's for output connections. Under Windows Audio one interface is two devices (a
  "Microphone (…)" and a "Speakers (…)"), so its inputs and outputs are mapped under two names;
  under ASIO it is one.
- **The same interface under another device type has another name**, so switching from Windows
  Audio to ASIO maps once more. Said in the mapping screen, so it does not look like the mapping
  was lost.
- **Two interfaces of the same model share a name**, and so a mapping. That is what a spare wants:
  the backup interface of the same model works at once.
- **MIDI ports** are keyed by name in the same way, after the id (resolve by id, then by name, then
  ask).

- **Opening a show** whose connections this interface has not mapped: one screen, the show's
  connections on one side and the interface's channels on the other, each input with a signal
  light. **Map by playing**: sing into the mic, and the channel that lights is chosen, the way
  "Count them for me" counts a controller's knobs. For an output, a short, quiet ident on the pair
  being mapped, never on Main without asking.
- **MIDI ports** resolve by id, then by name, then ask. Two ports with the same name always ask.
- **Check setlist** checks every connection the set uses, as it checks plug-ins.
- **Old shows**: a hardware part's return and port become connections named after the part, mapped
  to what they held on this machine. An addition to the show format; nothing old breaks.
- **Roles**: mapping is the player's (a stick player on a new computer must map), and Stage Lock
  refuses it, as it refuses `setAudioDevice` now.

### 2c. Outputs a stage can use

- **The standalone opens as many outputs as the mapped pairs need**, as it already opens only the
  inputs it needs.
- **Every pair ends in an output strip**: level, the safety limiter, the meter. Pair one's master
  chain and fader stay ahead of its strip. Today pairs two and up have no gain node at all
  (`mixer-metering.md`).
- **A mix, not only a route.** A part going to one pair is what a DAW stem wants. A monitor mix
  needs the same part on Main and in the ears, at different levels. The machinery nearly exists: a
  return is a bus fed by sends. Two changes make it a monitor mix. A return may leave through a
  pair of its own instead of the master. A send may tap before the fader, so moving the PA fader
  leaves the singer's ears alone. "In-ears" is then a return with no effects, on the In-ears pair,
  fed by pre-fader sends. Whether a part's mute reaches its pre-fader sends is a choice; on most
  desks it does.
- **The click** goes to its pair by exclusive routing, as parts are routed today, so it can never
  reach Main.
- **Solo as listen** (decision 10) needs one pair marked as the listen output: the in-ears.
- **The Mixer's new meters** (above) hang off the output strips.

### 2d. The device on stage

An audio counterpart to "MIDI, right now":

- **The interface goes**: a Stage banner, and HoSTage waits for *that* interface (the same type and
  name, as in 2b), reopening it when it is back, inputs muted, outputs fading in. Never a jump to
  the laptop's speakers mid-song, and never staying on them when the interface returns. In Build,
  offer the switch instead. *Decided (decision 13), 2026-11-16.*

  **What has to keep running while it waits.** A hardware part's notes go out from a node in the
  graph (`MidiSendProcessor`, `RackProcessors.h`), so they leave only while the audio device runs
  the graph; only bank and program changes go out from the controlling thread (`sendNow`). So
  today, when the interface goes, the hardware synths stop hearing the keyboard too, although
  their own sound may reach the desk without passing through the interface at all. While HoSTage
  waits, it should keep the graph running on a clock of its own with no device behind it: audio
  thrown away, MIDI still flowing to every hardware part, the transport still counting so the
  rig comes back in time. JUCE does not do this by itself; it is HoSTage's own small piece, and it
  is the first half of `product-ideas.md` §7's "dumb fallback that cannot fail".
- **An input that opens but sends only digital silence.** On Windows, when microphone access is off
  for desktop programs, a shared-mode input opens and delivers zeros. Health says where the switch
  is.
- **Dropouts per song**, so a Soundcheck run says which song is too heavy for this buffer.
- **Another program holds the interface.** In exclusive mode or under ASIO, CEditor's tab and a
  product cannot both open it. Say so in those words, as the CTRL49's status does.

### 2e. The VST3

In a DAW the device is the DAW's; the connections map to the plug-in's buses instead, in the
Product utility. Input parts and hardware returns need an input bus, which the plug-in refuses
today. Adding one changes how some DAWs list the plug-in (as an effect, or as an instrument with an
input). *Decided (decision 12), 2026-11-16: add it, and early, before products sit in many
people's projects.*

The shape that changes least for a project that never uses it:

- **One stereo input bus, off by default.** A plain project then sees the plug-in it sees today: a
  stereo instrument with optional extra outputs. `isBusesLayoutSupported` accepts the input
  disabled or stereo, where today it accepts only disabled.
- **Every product gets it at once**, since every product is the same plug-in to a DAW
  (`hostage-creator-editor-player.md`, step 4). Another reason to do it while there are few.
- **Its channels feed the rack's input node** (`prepareRuntime` gains the input count it does not
  pass today), so hardware returns and input parts work in a DAW exactly as in the standalone.
- **Connections map to it** in the Product utility once 2b exists; until then, the bus's two
  channels are the rack's inputs 1 and 2, numbered as a standalone numbers its device's first two.
- **Proved before it ships**: the hosts' conformance suites over the HoSTage VST3 with the bus off
  and on (`docs/plugin-validation.md` says where to get them), and the DAWs the owner uses checked
  by hand for how they list it.

### 2f. Backends

- **JACK on Linux.** `JUCE_JACK=1` needs the JACK headers to build (`libjack-dev`;
  `juce_audio_devices.cpp` says so where it includes them) and loads `libjack` at run time
  (`dlopen` in `juce_JackAudio.cpp`), so a machine without JACK simply does not list it. Under
  PipeWire, HoSTage then appears as a JACK client beside everything else. The Linux build notes in
  `CLAUDE.md` gain the package.
- **ASIO on Windows**, after decision 8.

### Tests it brings

- **The mapping is a pure function**: the show's connections, the interface's channels and the
  saved mappings in; a resolution, or the list of what to ask, out. Testable on any machine without
  a device, like Soundcheck's reference walk.
- **The device needs a hook.** The service already takes its MIDI ports through hooks
  (`options.listMidiOutputs`, `options.openMidiOutput`) so tests need no devices. The audio device
  wants the same, so that "the interface went and came back" is a test and not a hope.
- **Outputs**: in `RackHostTests`, a tone through a part with its fader at zero still reaching the
  in-ears through a pre-fader send, and a click never reaching Main.
- **The two command lists**: every new command placed (`stageSafeParity.test.js`,
  `hostagePlayerRole.test.js`).

### Order inside step 2

**2a first**, before step 1: small, no model change, fixes a bug, and it is what the measurement
needs. **2e's bus beside it**, now that decision 12 says early: it does not depend on the rest, and
every week it waits is more projects that saved the old layout. Then 2b (the model and the show),
2c (outputs), 2d alongside 2c (its silent clock first, since it protects every rig with hardware
in it, input parts or not), 2e's mapping to connections once 2b exists, and 2f whenever.

## Where this comes from

The owner's message of 2026-11-16. What exists: `docs/hostage-manual.md` and the code cited above.
Earlier ideas this builds on rather than repeats: `hostage-creator-editor-player.md` (the tiers and
the Pi), `product-ideas.md` §7, §8 and §14, `midi-frontier.md` §6, `raising-the-bar.md` Thesis D,
`total-recall-plan.md`, `plugin-process-isolation.md`, and the `ce.osc`, `ce.verify` and `ce.file`
module designs.
