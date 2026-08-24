# Remaining Component Gaps — Mini-Specs

> Status: **specs.** The rest of the [component-gaps.md](./component-gaps.md)
> backlog, each its own palette entry reusing now-documented engines/capabilities.
> Part of the [panel parts backlog](./README.md).

By this point most "new" components are configurations of existing engines +
the cross-cutting capabilities. Tags: `[new]` = needs new code; `[engine-reuse]`.

---

## Generative-MIDI family

### On-screen Keyboard `[new]`
- **What:** a piano keyboard (key range) that sends notes on click/touch;
  velocity from vertical hit position; optional **scale highlight/snap** (shared
  [musical context](./musical-context.md)); octave range; latch; **incoming notes
  light keys** ([value-driven display](./value-driven-display.md)).
- **Reuse:** note-emit substrate · musical context · value-driven display ·
  position-velocity (like pads).
- **New:** white/black key layout + hit detection; a keyboard renderer.
- **Files:** `componentTypes` (Keyboard), `interactionDefaults`, `componentPorts`
  (note outputs + lit input), `IconPanel`, `PanelPreviewSurface`, renderer.

### Step Sequencer `[engine-reuse]`
- **What:** steps × tracks grid; toggle cells → pattern; a **playhead** steps
  through (Timer) emitting notes/triggers; per-step velocity / probability /
  length; loop + transport.
- **Reuse:** generator-grid (steps×tracks) · [Timer](./timer-system.md)
  (playhead) · note-emit · the Pad Grid fire/velocity concepts.
- **New:** transport (play/stop), playhead, per-step params, pattern storage.
- **Caveat:** Timer is wall-clock (no tempo-sync) — tempo-locked sequencing needs
  a clock source.
- **Separate** from Pad Grid / Mod matrix (same grid engine, different kind:
  timed playback).

---

## Input

### Pitch / Mod Wheel `[engine-reuse]`
- **What:** a vertical wheel — **pitch** = bipolar + spring-to-center; **mod** =
  unipolar latch.
- **Reuse:** slider (vertical) + **[return-to-rest](./return-to-rest.md)** (pitch
  centers). Mostly a slider+return configuration, its own palette entry.
- **New:** wheel/groove visual styling.

---

## Layout / container

### Tabbed Container / Pages `[new]`
- **What:** a container with multiple **pages** + a tab strip to switch.
- **Reuse:** Container + Children layout; tab strip (buttons/radio); page
  show/hide by active index.
- **New:** page model, tab strip, active-page state. **`pageIndex` is a bindable
  input** (device-driven page switch — like the LCD `pageIndex`).
- **Files:** `componentTypes` (TabContainer), Children/layout, `componentPorts`
  (pageIndex), `IconPanel`, renderer.

### Group / Frame (titled) `[engine-reuse]` — **implemented (model)**
- **What:** a Container with a **titled border/chrome** (a labeled box).
- **Reuse:** Container + Background/Border + a title label inset into the border.
- **New:** title-chrome rendering. Its own entry reusing the Container engine.
- **Done:** `Group` controlType (Background+Text+Icon+Effects+ContentLayout+Grid+
  Children; border on, title "Group", top-left) + `IconPanel` entry. Title
  inset-into-border chrome is a later renderer polish; the bordered titled box
  works via existing sections.

### Scroll Area `[new]`
- **What:** a clipping container with a scrollbar for oversized content.
- **Reuse:** Container + clip; child offset.
- **New:** scroll mechanics (scrollbar, wheel/drag, clip + offset).

---

## Display / decoration

### Progress Bar `[engine-reuse]`
- **What:** a read-only bar showing a value (load / scan / level).
- **Reuse:** read-only slider fill = the **[value-driven display](./value-driven-display.md)**
  capability; effectively the **Meter in determinate mode**. Its own entry if
  wanted, else a Meter preset.

### Image Display `[engine-reuse]` — **implemented (model)**
- **What:** a standalone image (logo, device photo, decoration).
- **Reuse:** the existing image-fill rendering (`Background`/`Icon`,
  `ImageFileFormat`/`PNGImageFormat` in C++). `Icon` is a section today; surface a
  placeable Image.
- **New:** just a placeable wrapper.
- **Done:** `Image` controlType (Background+Effects; Fill `imageEnabled:true`,
  `solidEnabled:false`, `imageFit:'contain'`, no border) + `IconPanel` entry. User
  sets `imageSrc`.

### Shape Primitives `[engine-reuse / partly exists]`
- **What:** vector shapes (rect / ellipse / line / polygon / path) for decoration
  & diagrams.
- **Status:** the Custom Component Designer already added **vector shapes** —
  surface them as placeable decorative components.

---

## Note

Several of these are thin configurations of things now documented — **Progress bar**
= read-only slider, **Pitch/Mod wheel** = slider + return-to-rest, **Group/Frame**
= Container + title, **Image** = image-fill. They're cheap once the engines and
capabilities exist; **Keyboard** and **Step Sequencer** are the only substantial
new work here (both generative-MIDI family).

---

## Built, 2026-08-23

All nine. Four became components; three became catalog **presets** of components that already
existed; two (Group, Image) had shipped already.

**All nine are real controlTypes — and three of them got there the long way.**

Progress Bar, Pitch Wheel and Mod Wheel shipped first as *catalog presets*: the insert catalog grew
an `overrides` field and a preset was an entry that applied a section patch. The argument was that a
progress bar is a Meter reading a known quantity, a pitch wheel is a Ribbon that springs to centre,
and a controlType each would be three duplicate engines. This note had offered exactly that ("its
own entry if wanted, else a Meter preset").

**The owner's call was to promote them, and the reason is the half the preset argument missed: a
preset forgets itself the moment it is inserted.** The engine really is shared — that part was
right — but the *identity* has to survive into the inspector, into the saved file, and into
anything that walks a panel asking what is on it. A Pitch Wheel that reports itself as a Ribbon is a
Pitch Wheel only until somebody looks. So they are types now, the way `Knob` is its own type over
the slider family, and `overrides` is gone because nothing used it any more.

What makes that cheap rather than three copies is `componentFamilies.js`: `METER_FAMILY` and
`RIBBON_FAMILY` say which types one engine draws, and the five places that used to compare a type
name to `'Meter'` or `'Ribbon'` ask the family instead. Adding a member is one edit there rather
than a grep. It is its own module and not a corner of `componentTypes.js` because that file and
`componentPorts.js` already import each other — put the sets in either and they resolve only
because of the order the declarations happen to be in, which works until somebody moves a block and
gets an empty Set at import time, silently.

**Shape is the one where a type bought more than identity.** As a Background preset it could be a
rectangle and, past half its width, a stadium — never an ellipse at an arbitrary aspect ratio, a
line at an angle, or a polygon. Those need a path, so `shapePrimitives.js` builds one. It does *not*
define the polygons: `shapeGeometry.js` already held twelve of them as normalized vertex lists for
the custom-component designer's draw tools and palette glyphs, so the placeable Shape reads that and
gets triangle, diamond, pentagon, hexagon, star, chevron, arrow and plus for free. A second table
would have been twelve shapes that drift from the twelve in the palette. (Found the hard way: the
first attempt overwrote `shapeGeometry.js` and broke its five existing consumers.)

Shape also joined **scenery** without being told to — `sceneryModel` derives that from the sections
a type declares, and Shape's three are all inert. A decorative primitive folding like a Background
is the right answer, and arriving at it through the ratchet rather than an edit is the point of
having one.

**The keyboard's key geometry was already written.** `splitZoneLayout.js` grew `keyRect`,
`whiteKeyCount`, `isBlackKey` and `noteAtPoint` for the Zone Splitter's keyboard strip, and geometry
does not care what it is drawn for. Reusing it was not a shortcut: two keyboards on one panel that
disagree about where middle C is would be a genuinely maddening bug, and a second implementation is
the only way to get one. What the keyboard actually needed was the part a splitter never did —
latch (a chord is impossible with one pointer without it, and a chord is most of the point),
scale-lock that **refuses or quantises and says which** rather than silently moving somebody's
finger, and a glissando that **releases before it presses**, because emitting note-ons first is how
an on-screen keyboard ends up with six stuck notes after one swipe.

**The sequencer's hard part is the transport, not the grid.** Three rulings: the pattern is stored
sparsely (a 64 × 16 grid is a thousand cells, and a panel file carrying a thousand `false`s would be
mostly punctuation); the gate is a percentage capped under 100, so two consecutive steps on one
track are two notes rather than one long one; and ping-pong turns **without repeating the ends**,
because the naïve version makes a sixteen-step pattern sound thirty steps long with two stutters in
it. The clock is wall-clock and the inspector says so in the UI rather than leaving it in a design
doc — somebody would otherwise discover it during a take.

**Both containers hide children by MODEL, not by rendering.** A child on another page or scrolled
out of view must not be selectable, must not take the pointer and must not export as visible; a
renderer that hid it itself would leave all three reading the unmoved positions. The tab container
reads a child's page from the CHILD (`Core.tabPageId`) rather than from a list on the container — a
list goes stale the moment a control is deleted — and a child whose page was removed comes back on
page one, because a control you cannot see and cannot reach is indistinguishable from one that was
destroyed. The scroll area measures its extent from its children for the same class of reason: an
author-set extent goes stale the moment a control moves, and the scrollbar then either stops short
of a control that is really there or scrolls past the end into nothing.

**One export ruling.** A tab container's page reaches a DAW as a `choice` with the page names as its
labels, which needed `paramFromTypeSpec` to learn a fourth way of finding a range — from an authored
LIST on the section. Without it a page selector arrives as an anonymous 0..1 float, which is exactly
what `valueKind: 'choice'` exists to prevent. A keyboard exports nothing (a DAW automating "note"
would be a DAW playing it) and neither does a scroll position (where somebody is looking is not a
parameter of the instrument, and a host writing it would move the view under their hands).
