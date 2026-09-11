# Product ideas — everything that isn't MIDI

> Status: **idea record, 2026-09-11.** Nothing here is built. Companion to
> [`midi-frontier.md`](midi-frontier.md), which covers the MIDI side. This one covers everything
> else: the editor, the exported plugin, the rig, sound design, sharing, and getting new people in
> the door.
>
> Written in plain English on purpose. It is meant to be read by anyone, not just whoever ends up
> building it. Where a file is named, it is because that is where the thing you would build on
> already lives.

## How to read this

Every idea says four things: what it is, why anyone would care, what already exists in the tree that
it stands on, and what is awkward about it. The awkward part is not decoration — several of these
sound better than they are until you look at the hard bit.

Cost is rough engineering effort, not calendar time. "Low" means days. "Medium" means weeks.

At the end there is a shortlist and a section listing the things I nearly proposed and then found
were already built, which is worth reading on its own.

---

# 1. The panel on a tablet

This gets its own section because it is the biggest single idea here and because the obvious
objection to it is wrong.

## The objection, and why it doesn't apply

A tablet has no MIDI sockets. So how does it drive a synth?

**It doesn't.** The PC keeps every cable exactly as it does now. The tablet is a screen with fingers
on it, nothing more.

When you drag a knob on the tablet, what crosses the wifi is not MIDI. It's a short message saying
*"the user set cutoff to 92."* The PC receives that and sends the MIDI out of its own port, exactly
as if you had turned the knob on the PC screen. Values coming back from the synth travel the other
way — the PC tells the tablet "cutoff is now 8 kHz" and the tablet redraws the knob.

So the tablet needs no MIDI hardware, no drivers, no network-MIDI setup. Any device with a browser
works: iPad, Android tablet, an old laptop, a phone. Nothing to install, no app store.

## Why this is much closer than it sounds

The entire UI already talks to C++ through one object, `window.__JUCE__.backend`. It has two
methods: send a named message with a JSON payload, and listen for named messages coming back.

That's the whole conversation. And of the 283 places in the source that touch that object, **275 are
in one file** — `CE/web/src/CE_Application/bridge/bridge.js`.

So the mechanism is: write a replacement for that object that carries the same messages over a
WebSocket instead of through WebView2. Every feature in the app then works over the network without
one line of feature code changing. The panel does not know or care that it is running on a tablet in
another room.

You would also need a small web server inside the app to hand the page to the tablet. You already
serve the built UI from disk (the app walks up from the binary to find `CE/web/dist`), so that is a
short step rather than a new subsystem.

## The awkward parts, honestly

**Touch targets.** A panel designed for a mouse has 40-pixel knobs. On glass that is a thumb-sized
miss. You want a touch mode that scales controls up, or at minimum a warning to the panel author.

**Latency.** On decent wifi, finger to sound is roughly 5–20 ms. Completely fine for tweaking a
filter. Not fine for *playing notes* — tap a drum pad on glass over wifi and the timing feels soft.
The honest position is that the tablet is for control, and notes belong on something with keys.

**Reconnection.** Wifi drops. The panel must notice and resync. You can already do this —
`requestFullState()` pulls the whole state back from C++, and there is already a path that calls it
when a write is rejected.

**Security.** It is your home network, but it should not simply open a port to everything on it. A
pairing code shown on the PC screen, and off by default, is the right shape.

## The two things you get free

The same piece of plumbing gives you:

- **A browser demo of the editor.** Identical bundle, with a fake backend instead of a network one.
  This already works — it is how `npm run test:browser` drives the whole editor in headless
  Chromium. Putting it on the website means anyone can try CEditor without downloading anything,
  which for an unsigned Windows-only beta is the difference between "I'll have a look" and closing
  the tab at the security warning.
- **A second screen.** Same code again, in a browser window on your other monitor.

Three features, one piece of work.

**Cost.** Medium for the remote panel. The browser demo is genuinely low, because most of it exists.

---

# 2. Getting a panel built

## Build the panel from a photo of the synth

Take a photo of the front panel. The program finds the circles and the rectangles and lays knobs and
sliders on top of them.

You already generate panels from the device profile. This makes the generated panel *look like the
actual synth*, which is the difference between a working editor and one somebody wants to use.

Even the half-automatic version — it finds the knobs, you confirm or correct each one — saves hours
and is an extremely good thirty seconds of video.

**Awkward:** photos are taken at an angle, with glare, in bad light. You need perspective correction
before anything else, and the honest version asks the user to line up the corners rather than
guessing. Rotary knobs are easy (they're circles); sliders and buttons are harder; text is hardest
and should probably not be attempted.

**Cost:** medium. Do not start with the clever bit — start with "use the photo as the panel
background and let the user drop controls onto it", which is most of the value for a fraction of
the work.

## "Why isn't this knob doing anything?"

This is the worst moment in panel building, and right now the user has to guess.

An inspector that gives the actual reason: nothing is bound to this control / the device is not
connected / the port is there but the synth is not answering / the channel is wrong / your script
threw an error on line 12 / the parameter is fine but the synth is in a mode where it is ignored.

**Stands on:** the device runtime already tracks conflicts and echo suppression
(`stores/deviceMidiRuntime.js`), the script console already catches errors, and the health ledger
already knows whether an input is alive. The information exists in four places and is shown to the
user in none of them together.

**Cost:** low-to-medium, and mostly about collecting what is already known into one panel.

## Tidy up my panel

One button. Line up things that are nearly lined up, make similar controls the same size, even out
the spacing.

You have alignment tools (`stores/alignment.js`, `components/AlignmentPanel.svelte`) but they are
manual — select things, click align. This is the other thing: look at the whole panel and fix what
is obviously slightly wrong.

**Awkward:** it must be undoable in one step and it must not "fix" deliberate asymmetry. A preview
with a diff — here is what I am about to move — solves both.

**Cost:** low. People would use it every time.

## Tell people how heavy their panel is, while they build it

You measured the GAIA panel at 12,025 DOM nodes and got it down to 5,509 by baking the unchanging
parts to one SVG — load script 2,295 ms to 1,280 ms, heap 333 MB to 182 MB
(`utils/partsToSvg.js`). That is excellent work and the panel author has no idea any of it is
happening.

A small readout while they build: *"this panel will take about 1.3 seconds to open; the fader scale
marks are most of it."* Turns a mystery into a fixable thing. Right now they find out by shipping
it and getting a complaint.

**Cost:** low. The measurement already exists; this is a display.

## Notice when someone is repeating themselves

"You have made the same change to six knobs — want me to do the other fourteen?"

Most editors watch you do something forty times and say nothing.

**Awkward:** it must be easy to dismiss and must never do anything without being asked. Once it
annoys someone they will never trust it again.

**Cost:** low-to-medium.

## Colour-blind check

One button: here is your panel as roughly one man in twelve sees it.

Panel designers use red and green indicators constantly and almost never think about this. You
already have the colour machinery (`utils/colorMath.js`, `colorHarmony.js`, `paletteLibrary.js`).

**Cost:** low.

## Steal a colour scheme from a photo

You already have a screen eyedropper (`utils/screenEyedropper.js`) and a persisted named palette
library. Drop in a photo of the actual synth and get its palette as a swatch set, so the panel
matches the machine on the desk.

**Cost:** low.

## Record a test for a component, once

There is a component test bench (`sections/CustomTestBenchEditor.svelte`). Let someone record
themselves poking at a component — click here, drag there, check it looks like this — and replay
that every time the component changes.

Break something and find out immediately instead of three weeks later.

**Cost:** medium.

## Ship some beautiful example panels

New Panel currently gives you a handful of size presets and small templates that demonstrate the
component types (`models/panelTemplates.js`). That is a reasonable starting point and it is not an
advertisement.

The first thing a new user sees should be a finished, good-looking panel for a synth they recognise,
that they can pull apart to learn from. It is the cheapest tutorial you will ever write, and it is
the best possible answer to "what does this program actually make?"

**Cost:** low in code, real in design time. That is the point — it is a content problem, not an
engineering one.

---

# 3. Accessibility

Worth its own section because the situation is specific and the opportunity is unusual.

**Where it stands:** 33 of the 99 editor sections have some `aria-` attribute or `tabindex`. So the
editor is partly navigable. The **panel runtime has none at all** — no `aria-` attributes and no
`tabindex` anywhere in `CE/web/src/CE_Panel/` or `Player.svelte`.

That second half is the interesting one. It means an exported panel — the VST3 that goes in someone
else's DAW — cannot be used by anyone relying on a screen reader.

**Why you are better placed than anyone:** your entire UI is HTML. Every competitor draws their
interface with a graphics library, where accessibility means building a parallel description of the
screen from scratch. For you it means putting labels and roles on elements that already exist.

Blind musicians exist. Not one of them can use a hardware synth editor today. Even partial support —
a panel where you can tab between controls and hear what each one is and what it is set to — would
be a first in this category, and it is the kind of thing that gets written about.

**Awkward:** a knob is not a native control, so it needs a role, a value, a label and keyboard
handling, and it needs them from the panel author's data rather than hardcoded. The good news is
that the data is already there — every control has a name and a bound parameter with a range and
units.

**Cost:** medium, and it is the sort of thing that is far cheaper done early than retrofitted.

---

# 4. The exported plugin, and life in a DAW

## Freeze a hardware part to audio

Record what the synth played, and next time the project opens, play the recording instead. Unfreeze
whenever you want the hardware back.

This is *the* problem with hardware in a DAW. People want to work on a track on a laptop in a hotel
without hauling the rack out, and today the answer is "bounce it manually and remember what you
did."

**Stands on:** the exported plugin already declares a stereo input bus
(`CE/src/Player/PluginProcessor.h:74-76`), so it can already hear the synth. The saved state already
carries panel values, port mapping, script state and device dumps, so an unfreeze can put the rig
back where it was.

**Awkward:** the recording has to be timed correctly relative to the project, which is the same
latency measurement the MIDI document asks for. And the file has to live somewhere sensible — inside
the DAW project if the host allows it, beside it if not.

**Cost:** medium. High value.

## Fix the plugin scan

Scanning three thousand plugins is the worst first-run experience in all of music software. Twenty
minutes of a window that looks frozen.

You are already ahead — the scan runs in a separate process (`CEditorPluginScanner`,
`InstrumentHost/PluginScannerCoordinator.cpp`), which is why one bad plugin does not take the app
down with it. What is missing is the experience: progress that means something, the ability to use
the program while it runs, and never making the user do it twice.

**Cost:** low-to-medium, and almost entirely presentation.

---

# 5. Sound design

Two things already exist that most of this builds on, and they are better than they sound from their
names:

- `utils/randomizer.js` — generates patches **inside the profile's legal ranges**, with per-parameter
  locks, in three modes (full, humanize, and scoped). Its own comment makes the point: a randomiser
  that writes arbitrary bytes produces noise and a synth that needs a power cycle; this one's worst
  outcome is a patch nobody likes.
- `utils/snapshotModel.js` — capture a whole panel state, recall it, and blend between two, with an
  explicit policy per parameter kind so that halfway between Saw and Square is not "1.5".

## Breed patches

Put those two together. Show eight variations of the current patch in a grid. Click the two or three
you like. It makes the next eight from those. Repeat until you land somewhere good.

That is how people actually find sounds — by picking, not by understanding what each parameter does.
It is also the only patch-design method that works on a synth whose parameters you have never
learned.

**Awkward:** you need to audition eight patches quickly, which on hardware means loading each one
and playing a note. The existing sonic probe already plays a preset and measures it; the same loop
with a listen instead of a measure is what this needs. On a slow synth, eight is too many — offer
four.

**Cost:** low-to-medium. Both halves exist.

## "I like this, but…"

A row of one-word nudges: brighter, warmer, dirtier, longer, thinner, more aggressive.

Each one is a small coordinated move across several parameters at once. You can define them properly
because you know what the parameters *mean* — "brighter" is cutoff up a little, maybe resonance
down a touch, and it is a different set of parameters on every synth, resolved through the profile.

It is the randomiser's humanize mode, aimed by intent instead of by chance.

**Awkward:** the definitions have to live somewhere per-device or per-vocabulary, which is the same
canonical vocabulary the MIDI document keeps arriving at. A crude version that only uses parameters
whose meaning is known, and says how many it found, works today.

**Cost:** low-to-medium.

## Patch of the day

Open the app and one bred patch is waiting, already auditioned. Keep it or throw it away.

Costs almost nothing and it is exactly the sort of thing that makes people open the app on a day
they had no particular reason to.

**Cost:** low.

## Search sounds in plain words

"Warm." "Plucky." "Aggressive pad."

You already measure every sound in the library — brightness, spectral centroid, attack, tail, stereo
width, noisiness, dynamics (`SonicProfile` in `CE/src/InstrumentHost/Library.h:46`). Those
measurements are literally what those words mean. No model needed, just a mapping from words to
ranges, and a way for users to add their own.

**Awkward:** people disagree about what "warm" means. Show the measurement alongside the word so the
answer is explainable, and let users adjust.

**Cost:** low.

## "What did I use on that track?"

Six months later you want that bass sound back and cannot remember which preset it was. The program
could simply remember: which sounds were loaded in which project, and when.

**Cost:** low. The library already has records and versions; this is one more index.

---

# 6. Memory and history

## Panel history

You have been building this panel for three weeks. There is no way to see what changed since
Tuesday, or to get back to the version that looked better before you "improved" it.

**What exists:** unsaved work survives a crash — `stores/panelSessionPersistence.js` keeps a
snapshot of modified panels in local storage. That is recovery, not history. There is one previous
state and it is the one you did not save.

**What this is:** every save is a version. A list with dates, a thumbnail each, and the ability to
open an old one or pull one control back out of it.

**Cost:** medium, mostly UI. Panels are JSON, which makes the storage side easy.

## Back up the user's work quietly

People lose panels. Local, automatic, versioned, no configuration. Not a cloud feature — a folder.

**Cost:** low.

## Log the studio, not the track

What was plugged in, which patches were loaded, what you changed, when. Six months later you can
reconstruct how you got a sound instead of guessing.

This is the same underlying idea as the MIDI document's black box, pointed at the session rather
than at the wire.

**Awkward:** it must be bounded and it must never send anything anywhere by itself. It is a file the
user chooses to keep.

**Cost:** low-to-medium.

---

# 7. Live and on stage

## Survive a dead laptop

You have a stage lock already — `utils/stageLock.js` lists the commands that stay safe while the rig
is locked for performance, mirroring a deny-by-default boundary in the native service. That is the
hard thinking done.

The next step: keep writing the current rig state to disk continuously, so that if the machine
reboots mid-gig you are back on the same song in twenty seconds instead of starting from the top of
the set.

**Cost:** low-to-medium.

## A dumb fallback that cannot fail

A tiny separate process whose only jobs are to keep MIDI passing through and offer a panic button.
If the main program falls over during a show, the keyboard still makes noise.

You already run separate processes for the plugin scanner and the audition worker, so the shape is
familiar. This one is smaller than either.

**Awkward:** it has to own or share the MIDI ports, which on Windows is the whole difficulty. Worth
prototyping before committing to it.

**Cost:** medium, and it buys something no competitor offers: a failure mode that is not silence.

## A setlist that knows the show

Song lengths, running total, "you are eight minutes over", countdown to the next song. Every gigging
musician has a phone doing this badly next to a laptop already running your program.

**Cost:** low. The setlist and song chain already exist (`utils/setlistLayout.js`,
`utils/songChain.js`).

## What changed in the studio since last time

You came back and something is different. Which port moved, which plugin updated, which patch is not
where you left it.

**Cost:** low, and it shares most of its machinery with the MIDI document's drift detection.

---

# 8. Control surfaces

## Generalise the CTRL49 work

`screen-builder-design.md` proves something genuinely clever: a controller's screen can become the
missing front panel for a synth that has not got one — preset browser, parameter display, pages of
assigned knobs — without VIP and without touching firmware.

That shape is not CTRL49-specific. The document already keeps the door open ("the transport
abstraction keeps the door open; no Advance work until a capture proves the protocol"), and the
right next step is to make the layer above it describe a surface by **what it can do** rather than
by which keyboard it is: how many encoders, is there a screen, what can it draw, does it have LEDs.

Then a cheap controller with nothing but LED rings still gets parameter feedback, which is most of
the benefit for none of the reverse engineering.

**Awkward:** every surface has its own private protocol and some have none at all. The honest
version supports a handful properly and degrades to "knobs and LEDs" for the rest.

**Cost:** medium.

## Motorised faders

If someone owns a surface with motor faders, snapshot recall becomes physical — the faders move to
the patch. Narrow audience, enormous reaction from that audience.

**Cost:** low, if the surface layer above exists. It is a write path on a protocol you already speak.

---

# 9. Migration, sharing and trust

## Import from every dead editor, not just Ctrlr

You have three importers already — Cakewalk `.ins`, MIDI-CI Property Exchange, and the Ctrlr harvest
— and they all follow the same good rule: never claim more than you know, and emit a "what came
through / what needs you" summary.

Midi Quest, SoundDiver, Emagic's old files, and the various one-off editors people still run on a
Windows XP virtual machine are all just data in a documented or guessable format. Every importer is
a group of people whose work is currently stranded on a machine they are afraid to switch off.

**Cost:** low each, once the pattern is established — and the pattern is established.

## Put the promises on the front page

Two things about this product are genuinely unusual and both are currently buried in a documentation
file:

- **Basic hardware control is never behind a paywall.** Not a slogan — the list lives in the code as
  `neverGated()` in `CE/src/Licensing/Entitlements.h`, it is shown in the Licence panel, and the
  build fails if anyone moves an item behind a paid tier.
- **If the software is ever discontinued, a signed key unlocks every install.** Also implemented,
  also tested.

People have been burned repeatedly by music software that phoned home and then stopped. Saying this
where buyers can see it is worth more than most features, and it costs an afternoon of copywriting.

## A support bundle for the panel side

The instrument host has one, gathered by allowlist. The panel and device side does not. "Click here
and send me the file" beats twenty emails, and it is the difference between a bug you can fix and a
bug you argue about.

**Cost:** low. The host's version is the template.

---

# 10. The fun ones

## Two people on one panel, live

The same plumbing as the tablet. Producer and player both on the panel, each seeing the other's
hands move.

No music software does this at all. It is a strange thing to be first at, and it falls out of work
you would do anyway.

**Cost:** low **if** the remote panel exists. The PC is already the single source of truth, so two
clients is not much harder than one.

## Print the panel

Two uses. A poster of the thing you built, for the wall. And more usefully, a paper overlay for a
synth whose front panel has no labels, or a controller you have remapped — people do this with
masking tape and a marker today.

You already render controls to SVG (`utils/partsToSvg.js`), which is exactly what you want for
print.

**Cost:** low.

## Time-lapse

Every save is a frame. At the end you get a twenty-second video of your panel building itself. Pure
vanity, nearly free, and people post them.

**Cost:** low, and it needs panel history to exist first.

## Demo mode

The program plays itself. Orbit, Turing and the arpeggiator on a loop, panel animating, for a shop
counter or a trade stand or a screen behind you on stage.

**Cost:** low. Everything it needs is already a shipped component.

---

---

# 11. Turn the synth into something you can take with you

## Auto-sample a hardware synth into a playable instrument

**What it is.** Play every third note across the keyboard at three velocities, record each one,
trim it, and write out a sampled instrument — SFZ or DecentSampler or similar. Then repeat for the
next patch, overnight, unattended.

**Why anyone cares.** This is an entire product category. People pay real money for SampleRobot and
the Chicken Systems tools, and the reason is simple: hardware does not fit in a rucksack, and a
sampled copy of it does. It is also the only way to keep a sound after the hardware dies, gets
sold, or stops booting.

**What it stands on, and this is the point:** you already have every piece.

| Needed | Where it is |
|---|---|
| Play a note, hold it, release it | The note players, and `sendNote` in the panel API |
| Change patch between rounds | `recallPreset`, and the librarian's bank |
| Hear the result | Audio input on the exported plugin (`CE/src/Player/PluginProcessor.h:74-76`); `juce::AudioDeviceManager` in the host (`InstrumentHost/InstrumentHostService.h:1531`) |
| Know when the sound started and ended | `SonicProbe` already decides this from a buffer, and it already caught a bug where a note was measured before the plug-in had loaded |
| Do it without a person present | The audition worker already plays thousands of presets unattended, in a child process, surviving crashes |

**Awkward:**

- Sampling is long. A 61-key synth at every third note, three velocities, with a five-second tail
  is roughly forty minutes per patch. So it has to be a queue you leave running, with a progress
  view and the ability to stop and resume — not a modal dialog.
- Loop points are the hard part of sampling and always have been. The honest first version does not
  loop at all: record the full tail, accept the file size, and say so. Loop detection is a later
  stage and a genuinely difficult one.
- Anything that moves on its own — an LFO, a slow filter sweep, a chorus — samples badly, because
  every note freezes the modulation at a different point. Detect it (the sonic measurement can see
  a sound that changes over time) and warn rather than silently producing something that sounds
  wrong in chords.
- Noise floor and levels need a calibration pass, or the quiet samples come back with hiss baked
  into them.

**Cost:** medium-to-high, and it is the largest single item in either document. It is also the one
that produces a thing the user can hold — a folder of files that works in any sampler, forever,
with no CEditor and no hardware.

## Is the plugin emulation any good?

Measure your real Juno and a Juno emulation playing the same patch, on the axes you already
measure, and show the difference.

**Why:** it is fun, it is argumentative, people will post the results, and it genuinely helps
somebody decide whether a heavy and fragile thing has earned its space on the desk.

**Stands on:** `SonicProfile` and `sonicDistance` (`CE/src/InstrumentHost/Library.h:46-82`) —
measuring two sounds and reporting how far apart they are, per axis, is already written and is
already used to offer "the nearest thing you own" when a rack's plug-in has gone.

**Awkward:** the comparison is only as fair as the patch match, and "same patch" across hardware and
an emulation is exactly the cross-device translation problem. Start with the emulation's own factory
preset against the hardware preset it is named after, which is a fair test and needs no translation.

**Cost:** low. The measurement exists; this is a screen.

---

# 12. Scripting

This section is longer than the rest because the scripting system is the most capable thing in the
program and the least visible from outside it. Everything proposed here is small; what makes it
worth writing down is *what it is small on top of.*

## What is actually there, for anyone coming back to it

**A script is real source code in one language, stored and run as that language — never converted.**
That is the load-bearing decision and the rest follows from it. A script is
`{ id, name, language, source, scope, event, target, enabled, description }`
(`scripting/scriptModel.js`).

| | |
|---|---|
| **Languages** | Seven, each run as itself: Lua 5.4 (Sol3), JavaScript, TypeScript, Python, C++, C#, Java |
| **Scopes** | `component`, `panel`, `device`, `project`. In a component script `self` is the control it is attached to, so one script works on every copy of a reusable component without naming anything |
| **Events** | 32 in total — 9 lifecycle hooks, 11 control events, 2 panel events, 10 device events |
| **API** | One surface across all seven languages, in ~13 namespaces: `ce.core`, `ce.device`, `ce.midi`, `ce.math`, `ce.music`, `ce.time`, `ce.text`, `ce.ui`, `ce.draw`, `ce.image`, `ce.anim`, `ce.storage`, `ce.panel`, plus `ce.components.*` — one per panel component, twenty-eight of them |

**The lifecycle has a real order and the order matters.** `onPanelLoad` runs before the GUI exists
(MIDI setup and init SysEx only — the controls are not there yet), then `onPanelBuild` creates,
clones and parents controls, then `onPanelReady`. At the other end `onPanelClose` is the view
closing while scripts keep running, and `onPanelDestroy` is the scripts themselves being torn down —
the last place to restore the synth or send a final dump. There are also `onDraw`, `onError`, and
`onDawSaveState` / `onDawRestoreState` for the exported plugin.

**The API is declared as data, not written as prose.** `scripting/panelApi.js` is the single source:
the scripting manual is generated from it, so is the browsable API explorer, so are the per-language
snippets — and `CE/web/test/panelApiParity.test.js` fails when the runtime and the declaration drift
apart **in either direction**. The runtime's own header explains why that test exists: `on`, `emit`
and `run` were once empty stubs, eight declared events were missing from the handler probe list,
fourteen encoding helpers did not exist and a fifteenth was spelled differently, and forty-seven
panel verbs existed in the runtime and nowhere in the declaration.

**Two runtimes.** In the editor, `scripting/panelRuntime.js` runs scripts in the WebView where the
controls actually live, so `set("cutoff.value", 8000)` moves the real control with no round trip —
Lua through wasmoon, Python through Pyodide, JS and TS natively, and C++, C# and Java through subset
interpreters. In a shipped panel the C++ host is the engine, and those last three are compiled for
real at export (clang, Roslyn and a self-contained CoreCLR, javac with jlink and a JNI shim).

**Four things that exist and are probably forgotten:**

- **Cross-language messaging.** `emit` announces a custom event and any script listening with `on`
  reacts — "fire-and-forget, language-neutral". `run` calls a named action elsewhere and returns a
  value, host-dispatched, across languages. A Lua script can emit and a Python script can answer.
- **Watches.** `readWatch` plus a watcher table comparing value signatures, so a script can observe a
  path rather than poll it.
- **A script library** independent of any panel, copy-on-import so each panel owns its copy and
  panels stay portable (`stores/scriptLibrary.js`).
- **Per-script version history** — `utils/scriptHistory.js`, 25 versions per script in local
  storage, edits within 20 seconds coalescing into one snapshot, surviving a reload that the
  editor's own undo does not.

**And a measured cost model.** `scripting/moduleCost.generated.js` is produced by parsing the actual
preludes rather than by asserting numbers in a manifest: `ce.anim` is 4,469 bytes of scripting
surface in the JavaScript runtime and 21,412 in the WebView one. The Export tab shows it.

### One correction to an earlier draft of this document

An earlier version of this section said "you already have a condition builder" in the context of
building behaviours without code. **That was wrong.** `sections/ConditionBuilder.svelte` has nothing
to do with scripting — it is a structured editor for condition *strings* used by Links, Hit Zones
and component States in the component designer, turning `mode == 'A' && level > 3` into
channel/operator/value rows with an escape hatch back to raw text.

It is still worth naming, but as **prior art rather than as a starting point**: it is exactly the
shape of interface the no-code proposal below needs — structured rows, an AND/OR join, and a raw
escape hatch so nothing is ever locked out of editing — already built, already working, already
proven against three consumers, for a different feature.

## The three gaps

The engine is not the problem. The gaps are in three specific places, and each idea below exists to
close one of them.

### Gap 1 — Trust: is what I am seeing what ships?

C++, C# and Java are previewed through JavaScript subset interpreters and exported compiled. Two
implementations of one script can disagree, and when they do the script works in the editor and
misbehaves in somebody else's DAW — the worst possible place to find out, because by then it is on
a machine you cannot reach.

**The feature.** A check that builds the real module, runs it and the interpreter against the same
inputs, and reports either *for this script, the preview is telling you the truth* or the exact
handler and input where they part company.

**Stands on:** `tools/scripts/nativeHandlers/verify-all.mjs` already builds and dispatches all three
languages for real when the toolchain is present, and degrades to a structural check when it is not.
That harness is most of the work. What is new is running the interpreter beside it and diffing.

**Awkward:** the three toolchains are large and not everyone has them, so this is a check you run
rather than one that runs constantly. And not every difference is a bug — float formatting and
timing will differ legitimately — so the report has to be explainable rather than a red light.

**Cost:** low-to-medium. The design record already notes that building all three for real caught
bugs the type checks could not, including a load-bearing ABI fix. This points the same technique at
the user's code instead of at yours.

### Gap 2 — Entry: the ladder has no bottom rung

To do anything at all, you write a function. That is fine for a programmer and a wall for everybody
else — and the people this product is for are synth owners, not developers.

> An earlier draft answered this with "a small builder for the common cases": pick a trigger, pick
> an action, fill in the blanks. That is a template filler, and template fillers are abandoned the
> first time somebody wants something the templates do not cover. **The proposal below replaces it**
> and is the owner's idea rather than mine: a *block editor* — a general surface, not a form.

## The block editor

**What it is.** Build a function out of snap-together blocks, the way Scratch and Blockly do.
Lua first, and possibly only Lua.

**Why Lua first is exactly right**, in increasing order of importance:

1. It is already first in `SCRIPT_LANGUAGES` and the default language for a new script.
2. Its syntax is small, so the block set is small — far smaller than C++ or Java would need.
3. `acorn` and `luaparse` are both already dependencies, and `scripting/languageService.js` already
   parses Lua to a located AST **on every keystroke** for live error reporting. The hard direction
   is half-built, for an unrelated reason.
4. Lua runs live in the editor through wasmoon **and** is the C++ host's native engine through
   Sol3. So blocks → Lua → runs everywhere, with no compile step. C++, C# and Java would drag the
   whole export toolchain into the loop.

### The decision that decides everything else

**Are blocks the source of truth, or a view over Lua?**

A view. The architecture already says so — `scriptModel.js` states the rule the whole system rests
on: *"A script is REAL source code in one language, stored and run as-is — never converted."* A
stored block workspace would be a second source of truth, and the moment somebody edits the text by
hand the blocks are stale. That is the classic failure of every hybrid block editor ever shipped.

And the house pattern for this already exists one level down. `sections/ConditionBuilder.svelte`
reads and writes a plain condition string *"so storage stays unchanged"*, presents it as structured
rows, and drops to a raw-text escape hatch for anything it cannot parse *"so no expression is ever
locked out of editing."*

The block editor is that same design, one level up:

> **Lua stays the file. Blocks are a lens. Anything the lens cannot draw appears as a raw-Lua block,
> still editable, and the script still runs.**

That also disposes of the two-editor problem before it starts: there is one script, in one language,
and two ways of looking at it.

### The blocks generate themselves

There are 214 API commands, each already declared as data with typed parameters:

```js
{ id: 'sendCC', category: 'Device / MIDI', signature: 'sendCC(channel, cc, value)',
  summary: 'Send a raw MIDI CC.',
  params: [ { name: 'channel', type: 'number', required: true },
            { name: 'cc',      type: 'number', required: true },
            { name: 'value',   type: 'value',  required: true } ] }
```

That is a block definition already: label, palette category, typed sockets, tooltip. So the palette
is **generated from `panelApi.js`** — the same file that generates the manual, the API explorer and
the per-language snippets, and which `panelApiParity.test.js` refuses to let drift from the runtime.
Add a command to the API and its block appears. Nobody hand-maintains 214 blocks.

Hand-written blocks are the dozen or so structural ones: if/else, comparison, arithmetic, variables,
a bounded loop, `self`, and the raw-Lua escape block.

### Do not position this as a beginner mode

Worth stating because it changes the design. There are 214 commands across thirteen namespaces.
*Nobody* remembers `ce.device.setTiming(name, ms, role)`. A categorised palette with typed sockets
is **discoverability**, and a competent Lua programmer would use it to find a command and then drop
to text.

Calling it "easy mode" gets it dismissed by the people it would help most and makes everyone who
uses it feel like a beginner. Calling it a second way into a large API is both more accurate and
more appealing — and Max and Pure Data mean this market has no prejudice against visual programming
to overcome.

### It was tested before it was written up

The round-trip is the claim the whole feature stands on, and it is the one people assume rather than
check. So it was built: about 150 lines against the `luaparse` already in the tree, in
[`tools/scripts/spikes/lua-blocks/`](../../tools/scripts/spikes/lua-blocks/), with its own README.

Eleven cases — six scripts written against the real `ce.*` API, and **all five actual Lua files in
`tools/ctrl49/`**, 78 to 154 lines of working code. A case passes when Lua → blocks → Lua re-parses
to an AST identical to the original's once positions and literal spellings are stripped: same
meaning, not same string.

**Eleven of eleven pass.**

```
PASS  CEditor_Bridge.lua      154 lines,  38 top-level blocks, fallbacks: 0 stmt / 18 expr
PASS  CEditor_Knob_Test.lua    81 lines,  19 top-level blocks, fallbacks: 0 stmt /  5 expr
PASS  CEditor_MultiKnob.lua   114 lines,  24 top-level blocks, fallbacks: 0 stmt / 11 expr
PASS  CEditor_PresetList.lua   78 lines,  21 top-level blocks, fallbacks: 0 stmt /  7 expr
PASS  Hostage_MultiKnob.lua   131 lines,  29 top-level blocks, fallbacks: 0 stmt / 12 expr
```

So the two directions are **not equally unconditional**, and the difference matters:

- **blocks → Lua: yes, always.** Every arrangement produces valid Lua. There is no failure mode.
- **Lua → blocks: never rejected, but the fallback column is doing real work.** Zero
  statement-level fallbacks on real code — every statement became a block. But five to eighteen
  *expression*-level ones per file: table constructors, anonymous functions, `#args`. Those come
  back as a raw-Lua chip in the socket where a block would be. It round-trips perfectly and it is
  honest, and it is not a picture.

A deliberately hostile case — coroutines, metatables, varargs, `goto` — also passed, with four
expression fallbacks. It survives as blocks wrapped around mostly text.

**The honest summary: it never breaks, but how useful the view is varies with the code.** An
ordinary panel script — `onValueChanged`, set a control, send a CC, an if/else — comes back with
zero fallbacks of either kind and reads as pure blocks. The CTRL49 screen code comes back as blocks
with text in the gaps. Both are fine; only one is a demo.

### What the spike found in ten minutes

**On the first run, all five real files failed.** `local function foo()` regenerated as
`function foo()` — the block dropped `isLocal`.

That is not cosmetic. It turns a local into a global, which changes scope, and a block editor
shipping that bug would quietly break people's scripts in a way nobody would trace back to the
editor.

One line to fix. And it would have been **invisible behind a canvas**, found weeks later, after the
expensive part was built on top of it.

### Which is the staging argument

> Build the mapping headless and test it against real files **before anyone draws a block.**

Three pure functions over data — `panelApi` entry → block definition, blocks → Lua, Lua AST →
blocks — with round-trip tests over a corpus of real scripts. That is exactly the shape this
repository tests well, and it puts the expensive-to-reverse decision (the model) first and the
swappable one (the canvas) second.

If the round-trip holds on a real corpus, the idea is proven. If it does not, that is learned for
the price of an afternoon rather than after a canvas exists.

### The rest of the hard parts

- **Auto-layout of parsed blocks.** Generating Lua from blocks is easy; coming back you have an AST
  with no coordinates and must lay blocks out sensibly. Solvable — statement order, top to bottom —
  but a script that returns visibly rearranged *feels* broken even when it is provably not.
- **Publish the subset.** Closures, metatables, coroutines, varargs and multiple returns get no
  blocks. The rule to state up front, not discover: *if the lens cannot draw it, it shows as Lua,
  and nothing is ever locked out.*
- **Comments and blank lines.** An AST round-trip loses them unless they are deliberately carried.
  `luaparse` can retain comments; where they re-attach is a decision somebody has to make, and
  losing a user's comments once is unforgivable.
- **It is worse for screen readers.** Block canvases are notoriously bad for them, so this must
  never become the only way in. Given §3, that tension is worth stating rather than discovering.

### Build or buy

Blockly is the obvious candidate — mature, and it ships an official Lua generator. Two reservations:
its workspace model pushes towards "blocks are the source", which is the decision argued against
above, and it will always look slightly like Blockly inside this application's own design language.

But that is not the first decision, and treating it as one is how this feature goes wrong. Do the
mapping first. The canvas is the part you can defer, prototype, or buy.

**Cost.** The mapping is low — a spike reached eleven of eleven in an afternoon. The canvas is
medium-to-high and is most of the work. Generating the palette from `panelApi.js` is low and is the
part that makes the whole thing maintainable rather than a 214-block millstone.

### Gap 3 — Blame: nothing says which script made the panel feel bad

Scripts run where the interface runs. One greedy `onTimer` makes the whole panel feel broken, and
the user blames the program rather than the script.

**The feature.** A per-script cost readout: time per handler, how often each timer fires, and which
script was responsible when a frame was missed.

**Stands on:** `Scripting/TimerManager.h` and the sandbox's loop guards — the boundary already
exists, so this is measurement at a line that is already drawn. It is also the same idea as the
panel weight readout in section 2, and the two belong in the same place in the interface.

**Cost:** low.

## Five more, from reading the system properly

### Thirty-two events is a discovery problem

A newcomer does not know whether they want `onValueChange` or `onValueChanged`, or that
`onPanelBuild` is where you clone controls while `onPanelLoad` is too early to touch them at all.

Instead of a list, ask two questions — *what should happen, and when?* — and pick the event for
them. The data to drive that is already in the declaration, including the warnings: `onPanelLoad`'s
own summary says "do not touch controls; they do not exist yet."

**Cost:** low. It is a view over data that already exists and is already kept honest by a test.

### Ship the fake synth

`CE/web/test/support/fakeSynth.js` is a simulated device with a known parameter map, written
deliberately awkward "because the easy devices were never the problem", and it exists so the capture
inference has an answer key.

Give users the same thing and a script becomes testable with no hardware: *pretend CC 74 arrived at
value 90 — what does your script do?* On a train, at 2 a.m., with the synth in another building.

**Why this is nearly free:** you built the hard part for your own test suite, and its awkwardness —
the thing that makes it a good test fixture — is exactly what makes it a good teaching device.

**Awkward:** a fixture built for a test suite has sharp edges and no interface. Expect the wrapper to
cost more than the synth did.

**Cost:** low-to-medium.

### Autocomplete in all seven languages, from one declaration

Because the API is data, it can generate Lua annotations, Python `.pyi` stubs, TypeScript types and
C++ headers from the same source. Some of this already exists —
`tools/scripts/nativeHandlers/cpp/ce_runtime.h` for C++, `tsService.js` for TypeScript.

Doing it for all seven means the manual, the explorer, the snippets **and** editor completion all
come from one file that a parity test already refuses to let drift. That is a rare position to be
in, and it is currently only half spent.

**Cost:** low-to-medium per language, and each one is independent.

### Record and replay

Capture the event stream while a panel runs, then replay it against an edited script,
deterministically. Every bug that begins *"it only happens when the synth sends…"* becomes
reproducible on a machine that does not have the synth.

**Shares its format with** the black box in [`midi-frontier.md`](midi-frontier.md) §6.3 — one
recording, two uses, and the scripting one is where it pays off fastest because a script bug is
otherwise almost impossible to report.

**Cost:** low-to-medium, given the recording.

### Share behaviours, not just keep them

The script library is personal. What is missing is a behaviour arriving **from somebody else**: with
its metadata, the `ce.*` modules it needs, and a test that proves it works.

The module declarations and the measured costs already exist, so a shared script can state exactly
what it requires and exactly what it will add to the export — which is more than most plugin
ecosystems manage. Copy-on-import is already the library's rule, so the ownership question is
already answered.

**Awkward:** a shared script is code from a stranger running in the user's panel. The sandbox and
loop guards exist, but the trust model — what a shared script may reach, and what it must declare
before it runs — has to be decided before anything is shared, not after.

**Cost:** medium, and most of it is the trust question rather than the plumbing.

---

# 13. Authoring a device profile

## Show coverage as a picture

You have `deviceCoverage` in the panel API, and profiles carry test vectors that genuinely run — the
library's curation layer treats a round trip as a hard gate and its own comment says
`verifiedFullDump` is earned rather than declared.

**The user sees none of this.** A map would fix that: green for parameters verified against real
hardware, amber for typed in from a manual and never checked, grey for nobody knows.

Two things it gives you at once. It tells an author where to spend the next twenty minutes, and it
is the honest answer to the question every user of every editor has always asked — *does this
profile actually work?* In a category whose folklore is "that panel works except for the filter
section", being able to show which section is which is worth more than most features.

**Cost:** low. The data exists and the gate exists; this is a view.

## Record test vectors while people just use it

Every time a message goes out and a response comes back, that is a candidate test vector. Offer to
keep it — quietly, in a tray, reviewable later.

The profile then becomes self-verifying as a **side effect of somebody using it**, rather than as a
separate chore that nobody does. And a profile that accumulates evidence while being used is a
profile that gets more trustworthy over time without anybody deciding to make it so.

**Stands on:** the monitor stream, the existing test-vector runner, and the same echo-suppression
and origin tracking that keeps the panel from learning its own transmissions.

**Awkward:** most traffic is not worth keeping, so the filter matters more than the capture. Prefer
the first time a parameter is ever exercised, and anything where the response was a surprise.

**Cost:** low-to-medium.

## A device request board

"Nobody has profiled the Kawai K4." Somebody who owns one sees that, and an absence becomes a task
with a name on it.

This is the cheapest possible community feature and it points effort exactly where the product needs
it. Pair it with the coverage map above and a request can be partially answered — "three people have
started this one, the filter section is done."

**Awkward:** it needs somewhere to live that is not a server you have to run. A file in a Git
repository with a pull request per profile is a legitimate and free answer, and it matches how the
library is already curated.

**Cost:** low, and mostly not code.

---

# 14. Playing and performing

## Capture what you just played

You noodle for two minutes, something good happens, and it is gone.

Except it is not. `CE/src/Performance/MidiCaptureJournal.h` is already writing every channel-voice
message into a lock-free ring — 32,768 events, up to two minutes of history, from the audio thread,
**including while the transport is stopped.** Its own header names retrospective capture as one of
the things it exists for.

So: a button that turns the last eight bars into a clip. The pattern and clip model is already
there (`Performance/PatternModel.h` has `PatternStep`, `Pattern`, `Clip`, `Scene`).

**Why people love this.** Ableton and Logic both have it and it is one of those features that
changes how people work — you stop deciding in advance whether you are recording, because you always
were.

**Awkward:** "the last eight bars" needs a tempo and a bar line, which the transport has when it is
running and has to infer when it is not. Offer "the last N seconds" as the honest fallback rather
than guessing at bars.

**Cost:** low-to-medium. The hard half — the lock-free ring written from the audio thread — is done.

## Scenes that morph

Scenes already hold macro values and parameter values (`SceneMacroValue`, `SceneParameterValue` in
`PatternModel.h`), and you already blend between whole states with an explicit policy per parameter
kind (`utils/snapshotModel.js`).

So: move from one scene to the next over four bars instead of jumping. The interpolation rules are
written; what is missing is a duration and something to drive it.

**Cost:** low.

---

# 15. Who can use this at all

## There are no translations

**The finding:** there is no translation system anywhere in the tree. The only hits for anything
locale-shaped are `localeCompare`, used for sorting lists. Every string in the interface is English,
written inline.

**Why it matters here more than in most software.** The devices this program exists for are
disproportionately Japanese, and a large share of the people sitting on an un-editable 1987 synth do
not read English. They are also, by definition, people no existing editor serves — which is the
same audience the whole product is aimed at.

**Why it is cheap here.** The interface is HTML. Extracting strings and swapping them at runtime is
one of the best-understood problems in web development, with the entire industry's tooling available
to it. Every competitor draws their interface with a graphics library, where text layout and
translation are genuinely painful.

**Awkward:** doing it late is much more expensive than doing it early, because every new string
written between now and then is another one to extract. That argues for putting the mechanism in
before the strings multiply, even if no translation ever ships.

**Cost:** medium to put the mechanism in, low per language after that — and the per-language part
can be done by users who care, for free, if the files are plain.

## One-switch and large-target input

Separate from screen readers, and a separate audience: people with limited motor control. What they
need is scanning input (one switch cycles through controls, a second selects), large hit areas, and
dwell clicking.

**Why you are well placed:** your components already treat **hit zones** as a first-class concept
with their own editor (`sections/CustomHitZonesEditor.svelte`), which means "make the target bigger
without changing how it looks" is already an expressible idea in the model. That is normally the
hard part.

**Cost:** medium, and it shares most of its work with the keyboard navigation that screen-reader
support needs anyway.

## Teach synthesis on the user's own synth

"What does resonance actually do?"

Every synthesis tutorial ever written answers that with a software synth the reader does not own.
This program could answer it by sweeping the parameter on **the machine on their desk**, playing the
result, and showing the measurement move as it goes.

**Stands on:** the semantic parameter model knows which parameter is which; the sonic probe measures
what changed; the panel can play the note. All three exist for other reasons.

**Why it is worth more than it looks.** The people who most need this — somebody who bought a
second-hand synth with no manual and does not know what half the panel does — are exactly the people
the product is trying to reach, and they currently have no reason to believe a parameter editor will
help them. "It will teach you your synth" is a different and better promise than "it will let you
edit your synth."

**Cost:** low-to-medium. Mostly content and a screen, over machinery that exists.

---

# 16. Smaller things that remove real friction

## A real first run

Not a welcome screen. A job: find your synth, identify it, build a panel, play a note. Ten minutes
from installing to a working editor for *their* machine.

Every piece of this exists — port enumeration, identity request, MIDI-CI discovery, the Capture
Session, Auto-Panel. **Nothing sequences them.** A new user currently lands on a blank canvas in a
program with four designers behind it.

**Cost:** low-to-medium, and it is assembly rather than invention.

## Let the exported plugin say what is wrong

In somebody else's DAW, an exported panel has almost no way to complain. No console, no log the user
will ever find. It just quietly does nothing.

A status line in the plugin window: port missing, device not answering, script error on line 12,
restore refused by policy. One line, always visible, plain words.

**Cost:** low. Everything it would report is already known internally.

## Usage stats for your own rig

Which synth have you actually used this year? Which patches? People own gear they have not touched
since 2022 and genuinely do not know it.

It cuts both ways, which is what makes it honest rather than a nag: it also tells you which machine
has earned its space.

**Cost:** low.

## Workspace layouts per task

Building a panel, profiling a device and playing live want completely different screens. Saved
layouts you can switch between, rather than rearranging by hand every time.

**Stands on:** `utils/workspaceChrome.js` and `utils/tabViewState.js` already model the workspace.

**Cost:** low.

# The shortlist

If only a few of these ever happen:

| Do this | Because |
|---|---|
| **The browser demo** | It nearly works already. A marketing asset you cannot buy, for a build config and a fake backend. |
| **"Why isn't this knob doing anything?"** | It removes the moment where a new user quits. The information already exists in four places and is shown in none. |
| **The remote panel** | The biggest single idea here, and the plumbing is one file. Gives you the second screen and the two-person panel for free. |
| **Freeze a part to audio** | The actual daily problem with hardware in a DAW, and the plugin can already hear the synth. |
| **Fix the plugin scan** | Worst first impression in the category, and you are already halfway there. |
| **Auto-sampling** | The largest item in either document, and every piece it needs already exists for another reason. It is also the only feature here that survives the hardware being sold. |
| **The profile coverage map** | The rigour is built and invisible. This is a view over data you already have, and it answers the one question everybody asks about every editor ever written. |
| **Preview-versus-real script check** | Two implementations of one script can disagree, and today the user finds out after shipping. The build harness that would catch it already exists. |
| **The Lua block editor** | The round-trip is proven on real files, the palette generates itself from a file a test already guards, and it is discoverability for 214 commands rather than a beginner mode. Do the mapping first; the canvas is the deferrable half. |

**For the video:** panel from a photo.

**For the conscience, and possibly the press:** accessibility in the exported panel. Nobody in this
category has ever done it, and you are the only one whose architecture makes it cheap.

---

# Things I nearly proposed and found were already built

Worth recording, because each of these is a good idea that somebody else will also have, and because
the list says something about how much of this program is invisible from outside.

| I was going to suggest | It already exists |
|---|---|
| A constrained patch randomiser | `utils/randomizer.js` — legal ranges only, per-parameter locks, three modes |
| Blend between two saved states | `utils/snapshotModel.js`, with an explicit policy per parameter kind |
| One key and scale shared by every note component | `utils/musicalContext.js` |
| Panels you can hand to someone else | `utils/panelPackage.js` — and it was built because a `.cepanel` used to be full of absolute paths |
| Alignment tools | `stores/alignment.js` and `components/AlignmentPanel.svelte` |
| Recover unsaved work after a crash | `stores/panelSessionPersistence.js` |
| A performance lock that refuses dangerous commands | `utils/stageLock.js`, mirroring a native deny-by-default boundary |
| Making panel files plain text so they diff and can be fixed by hand | They already are — `.cepanel` is JSON, profiles are JSON |
| Out-of-process plugin scanning so one bad plugin cannot kill the app | `CEditorPluginScanner` and `PluginScannerCoordinator` |
| A support bundle | Built for the instrument host, gathered by allowlist |

The pattern is consistent: the engineering is usually done and the **surfacing** is not. That is
true of the performance work, the licence promises, the randomiser, the health ledger, and the sonic
measurements. If there is one cheap theme running through this whole document, it is that this
program does a lot of impressive things quietly and tells nobody.
