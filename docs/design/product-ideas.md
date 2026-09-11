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

# The shortlist

If only a few of these ever happen:

| Do this | Because |
|---|---|
| **The browser demo** | It nearly works already. A marketing asset you cannot buy, for a build config and a fake backend. |
| **"Why isn't this knob doing anything?"** | It removes the moment where a new user quits. The information already exists in four places and is shown in none. |
| **The remote panel** | The biggest single idea here, and the plumbing is one file. Gives you the second screen and the two-person panel for free. |
| **Freeze a part to audio** | The actual daily problem with hardware in a DAW, and the plugin can already hear the synth. |
| **Fix the plugin scan** | Worst first impression in the category, and you are already halfway there. |

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
