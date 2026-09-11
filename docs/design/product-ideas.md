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

---

# 17. Shipping a panel, and keeping it alive afterwards

The export half of the product has had more engineering than any user can see, and two of its
decisions turn out to enable features nobody has named yet.

## A shipped panel can update itself, and it costs a file copy

**The fact this rests on.** `CEDITOR_TEMPLATE_PLAYER=ON` builds a panel-agnostic player that reads
**both its identity and its panel** from the single `.cepanel` beside it, which is what made
compiler-free export possible (`tools/scripts/export-panel-template.mjs`, and §3a of
[`scripting-language-options-and-shippable-export.md`](../scripting-language-options-and-shippable-export.md)).

**What nobody has said out loud:** if the panel is a *file* the player reads, then **updating a
shipped panel is replacing that file.** Not rebuilding a plugin. Not redistributing a binary. Not
asking fifty people to uninstall anything.

So: a panel that checks for a newer `.cepanel` — beside it, or at a URL its author chose — and
offers to take it. You ship a panel, somebody finds a bug in your filter section, you fix it, and
every user gets the fix without a new VST3 existing anywhere.

**Why no competitor can copy this.** Their exports are binaries; the panel *is* the compiled thing.
Here the binary is generic and the panel is data, which was done for a build-cost reason and turns
out to be a distribution capability.

**Awkward, and these are not optional:**

- **A panel that fetches code is a panel that can fetch bad code.** Scripts run in the sandbox, but
  the trust question is the same one raised in §12 for shared behaviours: the author must be
  identified, the user must consent, and the default must be to ask rather than to take. The
  `UpdateCheck.h` precedent is exactly right — a check that sends this machine's IP to a server is
  *"not something a program should do on its own the first time it starts"*, so the setting defaults
  off and choosing the menu item **is** the consent.
- **The identity must not move.** A panel update must keep the same FUID or a DAW session stops
  finding its plugin. Since identity is in the sidecar, an update that changes it is a different
  plugin wearing the same name — so the updater must refuse an identity change rather than apply it.
- **Rollback.** Replacing a working panel with a broken one, on stage, with no way back, is the
  worst outcome. Keep the previous file.

**Cost:** low-to-medium. The mechanism exists; the work is consent, identity checking and rollback —
which is to say the work is all in the manners.

## Ship a standalone to somebody who does not have CEditor

The same fact, pointed the other way. A standalone app has no FUID contract at all — §3a already
says a prebuilt standalone plus a sidecar is viable — so a panel becomes **a folder you send
somebody**. They double-click it. They do not install CEditor, do not buy anything, and do not need
to know what CEditor is.

That is a distribution story for panel authors: build an editor for a synth, hand it to everybody
else who owns that synth. It is also, incidentally, the best possible advertisement, since the
program's name is on a working editor in the hands of somebody who never downloaded it.

**Cost:** low, given the template player.

## Preflight, before the build starts

Today a bad export fails partway through, in a compiler.

Check first, in two seconds: assets over the thresholds the package format already defines
(`CUSTOM_COMPONENT_ASSET_WARNING_BYTES` is 2 MB, the package warning 8 MB); scripts that do not
validate; an identity that collides with something already shipped; and — the one that actually
bites — whether the toolchain for the languages this panel uses is installed at all.

**Cost:** low. Every check exists somewhere already; none of them is wired to the moment before a
build.

## A toolchain doctor

C# pulls roughly 230 MB of .NET and Java roughly 195 MB of JDK, installed as optional components by
the installer (`tools/installer/CEditor.iss` triggers `provision.cmd` per component). When that goes
wrong — and a 230 MB download during setup sometimes goes wrong — the user meets it as a failed
export with a compiler error.

`node tools/toolchains/languages.mjs status` already answers the question on a command line. Put it
on a screen: what is installed, what is missing, how big it is, what it is for, and a button to
fetch it.

**Cost:** very low. The command exists; this is a view.

## Optimise assets on the way out

Panels get fat quickly because people drop in 4-megapixel photographs of front panels. Convert to
WebP, strip camera metadata, downscale to the size actually displayed, and report what was saved.

The package format already *warns* about size. This fixes it instead of mentioning it.

**Awkward:** never touch the source assets, only the exported copy, and never silently — a panel
author who chose a lossless PNG deserves to be told what happened to it.

**Cost:** low.

## Say what AGPL means, at the moment it starts mattering

**The finding:** there is no licence text anywhere near the export path. Checked — no mention of
AGPL, licence or source offer in the export settings or in `panelPackage.js`.

A panel somebody distributes carries obligations under AGPLv3, and the person distributing it
almost certainly does not know that. `beta-differentiation.md` already flagged this for the unbuilt
panel exchange; it applies to plain export today.

An export-time notice, and a generated licence and written-offer file in the output folder, is
cheap, honest, and protects the user rather than the project. It also fits the tone of
[`licence-and-sunset-policy.md`](../licence-and-sunset-policy.md), which is the most trustworthy
document in the repository and should not have an unexplained gap next to it.

**Cost:** very low, and it is mostly writing.

## An export diff

What changed in this VST3 since the last one you shipped: identity, panel, scripts, modules, size.
Release notes for your own export, generated rather than remembered.

Pairs with the self-update above — if users are taking new panels from you, you want to be able to
say what is in one.

**Cost:** low.

## Reproducible export

Same panel in, byte-identical plugin out.

Two things it buys. "Did anything actually change?" becomes answerable without reading a diff. And
for anybody distributing panels, a build that reproduces is a build somebody else can verify — which
matters more the moment panels start being shared.

**Awkward:** timestamps and build paths are the usual culprits and both are solvable; the toolchain
version is not, and the honest claim is "reproducible on the same toolchain", stated rather than
implied.

**Cost:** medium, and worth doing before a panel exchange exists rather than after.

---

# 18. Knowing what you have

## "Where is this used?"

Custom component packages already carry a **stable content hash** — a deterministic stringify and an
FNV-1a over it (`utils/customComponentPackage.js`). So identity across copies is already a solved
problem, and nothing uses it to answer the obvious question.

Which panels use this component. Which panels run this script. Which controls bind this device
parameter. Change a shared thing and see what you are about to break, instead of finding out by
breaking it.

**Cost:** low-to-medium. The hash exists; this is an index and a panel.

## "What is in this file?"

Drag a `.cepanel` onto the window and see, without opening it: which device it is for, how many
controls, which languages it scripts in, which modules it needs, how much it weighs, and whether
anything it depends on is missing.

Useful for a panel somebody sent you, and more useful for one you made in 2025 and cannot remember.

**Cost:** low. Panels are JSON and the package format already knows how to read one.

## Back up and move your whole setup

Panels, profiles, the sound library, settings, scan paths, the licence file. One file out, one file
in.

Moving to a new machine currently means finding things in AppData and guessing what matters. The
support bundle already demonstrates the allowlist pattern this needs — gather what is named, nothing
else.

**Cost:** low-to-medium.

---

# 19. Quality, for the user's work rather than yours

Everything in this section already exists as internal tooling and is pointed at the project's own
code. Pointing it at the user's work is the idea.

## Visual regression for components

There is a headless-browser harness (`CE/web/browser-checks/`) and a panel screenshot tool that
renders at a device pixel ratio so legends stay readable. Both are aimed at the project's own QA
panels.

Aim them at the user's components: *this component renders differently from last version — here is
the pixel diff.* A component author currently has no way to know that a change to a shared part
broke a variant they were not looking at.

**Awkward:** a pixel diff has false positives (anti-aliasing, font fallback), so the threshold and
the "accept this as the new truth" button matter more than the diff itself.

**Cost:** medium. The harness exists; the per-user framing is the work.

## Track panel weight over time, not only now

§2 proposes showing what a panel weighs while you build it. The version of that idea with teeth is
recording it **per save**, so the question is not "is this panel heavy" but "which change made it
heavy" — which is the question somebody can actually act on.

Pairs with panel history (§6).

**Cost:** low, given either of the two things it sits on.

## An editor crash should produce an editor bundle

The instrument host has a support bundle gathered by allowlist. The editor does not, and the editor
is where people spend their time.

**Cost:** low. The host's version is the template, including the allowlist discipline.

---

# 20. Jobs that take a long time

Several ideas across both documents are slow by nature: probing a library of thousands of presets,
scanning plugins, auto-sampling a synth (§11), verifying profiles against hardware, rendering
audition clips.

Each of them currently implies a progress dialog and a person waiting.

**The feature is one queue.** Add jobs, go to bed, read the log in the morning. Jobs survive a
restart, report what they did, and say what failed and why rather than stopping at the first
problem.

**Stands on:** the out-of-process worker pattern is already established three times over — the
plugin scanner, the audition worker, and the sonic analysis worker, the last of which already
reports a line per preset so that a crash at preset 300 keeps the 299 before it.

**Why it is worth naming separately:** without it, four separate features each grow their own
half-finished progress UI. With it, they are all just jobs.

**Cost:** medium, and it gets cheaper for every slow feature that comes after it.

---

# 21. Print the synth's reference sheet

Every parameter, its range, its unit, its enum labels, and its CC or NRPN number or SysEx address —
laid out and printable, generated from the profile.

People have been making these by hand in spreadsheets for thirty years. Yours would be generated,
correct, and updated when the profile learns something.

Two audiences: somebody programming the synth from its own front panel and wanting the numbers, and
somebody profiling a device who wants to see the map they have built so far — which is the coverage
map from §13 wearing different clothes.

**Cost:** low. The data is the profile, and SVG rendering already exists for panel parts.

---

# 22. A profile describes a model. A musician owns a particular one.

## Per-unit calibration

**The gap, checked rather than assumed.** There is no per-unit concept anywhere — no calibration,
no serial, nothing in `dpd.schema.json` or the engine that distinguishes *a* Juno-106 from *your*
Juno-106. A profile is per-model, and that is correct as far as it goes.

**But two units of the same model are not the same instrument.** Filter chips drift, pots wear,
one unit self-oscillates at a cutoff of 100 and the next does not, a voice card is slightly out.
That is the ordinary condition of forty-year-old hardware and every owner knows it about their own
machine.

**The feature.** A thin calibration layer over the profile, keyed to the unit rather than the model:
per-parameter offsets or range trims, the notes below, and anything measured about *this* box.
Identity reply gives a key where the device offers one; where it does not, the user names the unit
and the port binding remembers it (which is §6.1's self-healing ports doing double duty).

**Why it belongs on this architecture.** A calibration is only expressible because the parameter
layer is semantic — you can say "this unit's cutoff reads 6 % high across its top third" because
cutoff is a thing with a range rather than a byte. On a SysEx-template editor there is nothing to
hang it on.

**Awkward:** it must never silently change what a shared patch sounds like. A calibration is a
property of the rig, not of the sound, so it applies on the way to the hardware and is stripped from
anything exported or shared — otherwise a patch that sounds right on your unit arrives wrong on
everybody else's and nobody can work out why.

**Cost:** medium. The layer is small; keeping it out of everything it must not contaminate is the
design work.

## Parameter notes — the paper everyone already keeps

Every hardware owner has these. *"Cutoff above 100 self-oscillates on this one." "Patch 47 is
corrupt, do not save over it." "LFO rate is non-linear past 90." "Needs a warm-up."* They live on
paper, in a text file, or in somebody's head until they forget.

Attach them to the parameter, visible in the panel, at the moment you are looking at the thing they
are about.

**Why this is more than a convenience.** The honest, hard-won notes are the most valuable content
in any profile and there is currently nowhere to put them. They are also exactly what a new owner of
the same model wants, which makes them the most shareable thing here — and the clearest argument for
separating *unit* notes (yours) from *model* notes (everybody's), which is the same split as the
calibration above.

**Cost:** low. A string on a parameter, a place to show it, and a rule about which notes travel.

## Localised parameter names

Tied to the translation finding in §15. A profile could carry parameter names in more than one
language — and for Roland and Yamaha gear the Japanese names are the vocabulary of the original
manual, not a translation of an English one.

It also gives the community something useful to contribute that needs no hardware and no byte-level
knowledge.

**Cost:** low on the schema, and the work is contribution rather than engineering.

---

# 23. Make the profile useful to people who never install this program

## Write the formats you already read

There are three importers — Cakewalk `.ins`, MIDI-CI Property Exchange, and the Ctrlr harvest — and
**no exporters**. The asymmetry is worth staring at: the program can read a `.ins` file and cannot
write one.

Every DAW has a format for naming a device's controllers and patches: `.midnam`, Cubase device maps,
Reaper's own, and `.ins` itself. People hand-build these in text editors today, badly, one device at
a time. A DPD already contains everything those formats want — names, CC numbers, ranges, enum
labels, bank-select behaviour, program lists.

So generating them is close to free, and it does something strategically useful: **it puts this
program's output in front of people who have never installed it.** A guitarist who downloads a
`.midnam` for their JV-1080 and finds it was generated by CEditor is a better advertisement than
any page on a website.

Plain CSV and JSON belong in the same menu, for the spreadsheet half of the world.

**Awkward:** every target format has a smaller vocabulary than a DPD, so each exporter must report
what it could not carry — which is the same "what came through / what needs you" summary the
importers already emit, pointed the other way.

**Cost:** low each, and they share a shape.

## Print the synth's reference sheet

Kept from §21 and belongs here too: every parameter, its range, its unit, its enum labels and its CC
number or SysEx address, laid out and printable, generated from the profile. People have built these
by hand in spreadsheets for thirty years.

---

# 24. Feedback loops that do not exist

## "This does not match my synth"

A wrong profile does not read as a wrong profile. It reads as *this program is broken*, and the
person leaves without telling anybody.

**The feature.** A button on the panel. The user says the filter section is wrong; it becomes a
structured report against the specific parameters, with the monitor stream attached and the
device identity recorded. The author of that profile gets something they can act on instead of a
forum post that says "doesn't work".

**Stands on:** the monitor, the profile's parameter identity, the identity reply, and the support
bundle's allowlist discipline — nothing leaves without being named and shown.

**Cost:** low-to-medium, and it converts the product's worst silent failure into its best source of
profile corrections.

## Which parameters do people actually bind?

Across every panel ever built, some parameters are bound constantly and some are never touched. That
distribution is not knowable from a manual and is extremely useful:

- It ranks the Auto-Panel layout, so the generated panel puts the twenty parameters people use where
  they can be seen.
- It tells a profile author which parameters to get right first, and which to leave as candidates.
- It answers "what should the Capture Session ask me about next?" with evidence.

**The conditions, and they are not negotiable.** Opt-in, aggregate, no panel contents, no patch
data, no identifiers, and a plain statement of exactly what a submission contains — shown, not
linked. A program whose licence document makes a point of never phoning home cannot acquire a
telemetry habit quietly. The honest framing is that this is a *survey* somebody chooses to answer,
not instrumentation.

**Cost:** low technically. The cost is the trust design, and if that cannot be made comfortable the
right answer is not to build it.

---

# 25. For the person building the panel

## A quality audit

Controls with no accessible label. Text that fails contrast against what is behind it. States that
cannot be reached by any interaction. Controls bound to nothing at all. A tab order that jumps
around the panel.

An author sees their own panel every day and stops seeing it. A list is worth more than good
intentions, and this shares most of its machinery with §3 and with the colour-blind check in §2.

**Cost:** low-to-medium.

## The panel's own manual, generated

A panel is a device with controls, sections and behaviours, so it can document itself — what each
control does, what it is bound to, which scripts react to it.

Whoever receives a shared panel currently gets no explanation of what they have. This is the
generated answer, and the generator pattern is well established here: the scripting manual, the API
explorer and the help bundle are all generated from their source of truth already.

**Cost:** low.

## Onboarding for the person who *receives* a panel

They have never seen CEditor. They have a VST3 somebody sent them and a synth on the desk. Their
first run has nothing in common with the author's — no designers, no profile editing, no export.
What they need is: which port is your synth on, does it answer, here is what this panel does.

Worth separating explicitly, because §16's first-run proposal is written for the author and would be
the wrong thing to show this person.

**Cost:** low-to-medium, and it is the half of onboarding that reaches people who did not choose
this program.

## Show what the scenery inference decided

The scenery fold is **inferred, not declared** — `utils/sceneryModel.js` says so plainly, and
explains why: nothing in the panel format marks a control as scenery. On the GAIA it correctly finds
216 of 409 controls to be printed matter, which is most of why that panel opens at a reasonable
speed.

When it gets one wrong, the author has no way to see it. A toggle that tints what got folded makes a
silent optimisation inspectable, which is what every silent optimisation eventually needs.

**Cost:** very low.

## Surface the filmstrip bake ceiling

`FILMSTRIP_BAKE_WARN_PIXELS` is 32 million and `FILMSTRIP_BAKE_MAX_PIXELS` is 96 million. An author
who is heading for the ceiling should meet it while designing, with the reason, rather than when a
bake fails.

Same idea as the panel weight readout in §2, and it should live next to it.

**Cost:** very low.

---

# 26. Reuse in the component designer

## A cluster library

A "cluster" is what Make Interactive builds: a value channel, the behaviours that drive it, and the
hit zones that feed them — and `utils/customComponentClusters.js` makes the point that **membership
in the cluster is the wiring.** That makes a cluster a genuinely reusable unit rather than a
selection.

So: a library of the common ones. A knob that sends a CC and lights an indicator. A button that
latches. An encoder that wraps. A fader with a detent. Each one assembled once and dropped in
afterwards, instead of the same three-part assembly being rebuilt every time.

**Cost:** low-to-medium. The unit already exists and is already coherent; this is storage, naming
and a picker.

## A contact sheet for variants

A component with several variants across several states is a matrix nobody ever looks at whole —
they check the two they were working on. Render all of them at once, as one sheet.

**Stands on:** the filmstrip baker, and the headless browser harness in `CE/web/browser-checks/`.
Both exist; neither is pointed at this.

It also pairs with the visual regression idea in §19 — the contact sheet is what a regression diff
compares against.

**Cost:** low, given the baker.

---

# 27. The Custom Component designer

The largest subsystem in the program — eighteen editors and around 16,000 lines in
`sections/Custom*.svelte` alone, on top of sixteen pure modules in `utils/customComponent*.js` and two more for the design surface. It
is a design tool inside a design tool, and it is more complete than anything else here.

## What a custom component is, for anyone coming back to it

| Piece | What it is |
|---|---|
| **Parts** | The visual layers — backgrounds, text, shapes, images. Each carries a semantic `role`: `background`, `track`, `fill`, `handle`, `label`, `dial`, `button`, `indicator`, `meter`, `keyboard`, `matrix` |
| **Generators** | Produce parts at runtime rather than by hand — circular arrays, repeats, waveform icons, envelope paths. `customComponentMaterializer.js` resolves them |
| **Hit zones** | Interaction regions, with conditions authored through `ConditionBuilder` |
| **Behaviors** | What a hit zone does to a value channel |
| **Value channels** | The component's own values, normalised, with types |
| **Clusters** | A channel plus the behaviours driving it plus the hit zones feeding them. `customComponentClusters.js` makes the point that **membership in the cluster is the wiring** |
| **Links / States / Variants** | Conditional wiring, conditional patches, alternative configurations |
| **Public API** | `ExternalAPI` with an `addressableName`, published inputs and outputs — what the panel and its scripts can reach |
| **Editable properties** | What an *instance* may change without editing the component |
| **Assets** | Images and baked filmstrips, with a manifest and size thresholds |
| **Package** | Format v1, a content fingerprint, validation, and an eight-step readiness checklist with one-click fixes |
| **Scale policy** | `contentScaleMode` — stretch, or scale internals against a design size stamped at instantiation |

Two details worth knowing because ideas below depend on them: the readiness checklist grades
`required` / `recommended` / `optional` and offers a fix **only where it is mechanically safe**,
leaving anything that encodes design intent navigate-only. And `fingerprintCustomComponent` hashes
the whole control minus its id — a stable content address for a component.

## 27.1 Instances and packages: the primitive is built, the operations are missing

**What exists.** `Designer.sourcePackage` records where a component came from — name, version,
fingerprint, readiness score, asset counts. `CustomPublicPropertiesEditor.svelte` computes the live
fingerprint and compares it:

```js
let sourceMatches = $derived(!!sourcePackage?.fingerprint && sourcePackage.fingerprint === currentFingerprint);
```

**What it does with the answer.** Renders a card that says *"matches source package"* or *"edited
since source package load"*. There is no action attached to it — no update from source, no push to
source, no detach, no diff. Grepping for a re-sync path finds nothing.

So the program **knows** an instance has drifted from its package and can only mention it.

**The feature.** This is the symbol/instance problem, settled a decade ago by every serious design
tool, and the operations are not in doubt:

| Operation | What it means here |
|---|---|
| **Pull** | The package has a newer version — take it, keeping this instance's published-property overrides |
| **Push** | These edits are the improvement — write them back as the package's next version |
| **Detach** | Stop being an instance; keep the parts, drop the link |
| **Reset** | Throw my overrides away, return to the package exactly |
| **Diff** | Before any of the above: show what actually differs |

**Why this matters more here than in a drawing tool.** A panel for a synth is dozens of instances of
a handful of components. Improve your knob and today you improve it once, in one place, and every
other copy stays as it was. That is the difference between a component system and a clipboard.

**Diff is the one to build first**, and not only because the others need it: "edited since source
package load" is a statement nobody can act on, and *"the handle colour and two hit-zone bounds
differ"* is one they can.

**Awkward:** overrides have to be separable from edits, or a pull discards the instance
customisation it was supposed to keep. `InstanceProperties` and the published-property model already
draw most of that line — the work is deciding what falls outside it and refusing to pull over it
rather than silently winning.

**Cost:** medium, and unusually well-defined for its size. The identity primitive exists, the
override model exists, and the operations have known-good semantics to copy.

## 27.2 Accessibility is already half-authored, and nobody spent it

§3 makes the case that the panel runtime has no accessibility at all — no `aria-` attributes, no
`tabindex`, anywhere in `CE/web/src/CE_Panel/` or `Player.svelte`. For custom components that is
much cheaper to fix than it looks, because **the semantic information is already in the model.**

Every part carries a `role`, authored for rendering and layout reasons: `handle`, `track`, `fill`,
`label`, `indicator`, `meter`, `dial`, `button`. Alongside it the component has a primary kind, and
the value channel has a type and a range.

That is enough to derive, with no new authoring whatsoever:

- a part with `role: 'handle'` on a dial, driven by a channel with a range → an ARIA slider with a
  current value, a minimum and a maximum;
- `role: 'label'` → the accessible name for the cluster it sits in;
- `role: 'indicator'` on a boolean channel → a switch with a state;
- `role: 'meter'` → a meter with its range.

**Keyboard handling comes from the same place.** A behaviour already says what a hit zone does to a
channel; arrow keys are that behaviour invoked with a step instead of a drag.

**Awkward:** `role` defaults to `'custom'`, so components built before anyone cared will carry no
useful roles and must degrade to "a control, unnamed" rather than to a lie. And a role is a
rendering hint today — making it accessibility-load-bearing means the field's meaning is now a
contract, which should be said out loud in the same breath.

**Cost:** low-to-medium, and it is the cheapest accessibility work available anywhere in the
program.

## 27.3 Readiness counts things; it does not know whether the thing works

The checklist is well made — eight steps, three severities, fixes offered only where they are
mechanically safe. But **every step is a count.** One value channel present, so the Value Model step
passes. Two behaviours, so Interaction passes. Nothing in it asks whether the component behaves.

Meanwhile the test bench is 1,541 lines and **persists nothing**: you poke at the component live,
and the poking evaporates when you navigate away.

**The feature.** Record the poking. A short sequence of interactions with expected outcomes, saved
with the component and replayed on demand — then a ninth readiness step: *has a passing test.*

Two things change. Readiness stops meaning *assembled* and starts meaning *works*. And a component
that ships with a test is a component somebody else can trust, which is the missing half of §12's
shared-behaviour proposal applied to components instead of scripts.

**Pairs with** the visual-regression idea (§19) and the variant contact sheet (§26): a recorded
interaction says the behaviour is right, a rendered sheet says the appearance is.

**Cost:** medium. The bench exists; recording, storage and replay are the work.

## 27.4 Design at one size, ship at every size

`contentScaleMode` decides whether an instance stretches or scales its internals against a design
size stamped at instantiation (`utils/customComponentScale.js`). It is a real policy with very
visible consequences — a 2× knob that looks like a 2× knob, versus a knob lost in a big box.

The author designs at exactly one size and finds out about the others later.

**The feature.** A strip beside the canvas showing the component at 0.5×, 1×, 2×, and at a couple of
deliberately unkind aspect ratios, under the scale mode currently chosen. Layout breakage becomes
visible while it is cheap to fix.

**Cost:** low. Rendering a component at a size is what the materializer and the thumbnail already do.

## 27.5 Extract to component

You can place a package on a panel. You cannot select three shapes and a hit zone **on a panel** and
say *this is a component now.* `makeComponent` exists only inside the stress-test generator.

That is the most natural gesture in a tool like this, and it is the one that turns incidental work
into reusable work. It is also how most component libraries actually start: somebody builds
something good by accident and then wants it again.

**Awkward:** the selection has to be promoted into the component model — parts keep their geometry
relative to a new origin, any bindings become published inputs or are reported as lost, and a value
channel has to be invented or chosen. The honest version reports what it could not carry, in the
same shape as every importer in this repository.

**Cost:** medium.

## 27.6 A component cannot carry its own script

Behaviours and links are declarative, and there is no escape hatch. A component is addressable
*from* panel scripts through `ExternalAPI` and its published inputs and outputs — but it cannot hold
a script of its own; nothing in the package format carries one.

So the moment a component needs one conditional the declarative model does not express, that logic
moves out to the panel, where it **no longer travels with the component.** Share the component and
the behaviour stays behind.

**The feature.** A component-scoped script, in the languages the panel already supports, packaged
with the component and running against its own channels and parts rather than the panel's controls.
`scope: 'component'` already exists in the scripting model — it currently means a script attached to
a control, and this is the same word meaning the same thing one level in.

**Awkward, and it is the same question §12 raises for shared behaviours:** a component that arrives
from somebody else and carries code is code from a stranger. The sandbox exists; the trust model —
what a component script may reach, what it must declare, whether it runs at all before the user
says so — has to be decided before components are shared, not after.

**Cost:** medium.

## 27.7 Generators are invisible

The materializer turns a generator into concrete parts at runtime. The author sees the parts and not
the cause: there is no way to ask *which of these twenty-seven parts came from that generator*, or
to highlight a generator's output on the canvas.

For the thing that makes big components tractable — the GAIA's fader is 26 parts of which 22 are
printed scale marks — that is a surprising blind spot.

**Cost:** low. The materializer knows the answer while it works; it just does not keep it.

## 27.8 A small one with teeth

`createCustomComponentThumbnail` keeps `.slice(-18)` — the topmost eighteen parts by z-order. A
component with more layers than that has a thumbnail that is quietly missing pieces, which is
exactly the sort of thing that reads as "this tool is a bit broken" in a library view where the
thumbnail is all anybody sees.

Either raise the cap, or compose the remainder into a flattened backdrop rather than dropping it.

**Cost:** very low.

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
| **Instance/package pull, push and diff** | The program already knows an instance has drifted from its package and can only say so. The identity primitive is built; the five operations are not, and their semantics are settled prior art. |
| **Write the formats you already read** | Three importers, no exporters. A generated .midnam or Cubase map puts this program's output in front of people who never installed it, off data the profile already has. |
| **Parameter notes and per-unit calibration** | The notes every hardware owner keeps on paper, and the fact that two Juno-106s are not the same instrument. Neither has anywhere to live today. |
| **Self-updating panels** | A shipped panel is a file the generic player reads, so fixing it for everybody is a file copy. Nobody whose export is a binary can answer this. |
| **Export preflight + toolchain doctor** | Two low-cost screens that turn a four-minute compiler error into a two-second answer. |
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
