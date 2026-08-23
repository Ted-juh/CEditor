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

**Three of these did not need a controlType, and minting one would have made the codebase worse.**
A progress bar is a Meter reading a known quantity instead of a live level — no peak hold, no
threshold zones, one flat fill. A pitch wheel is a Ribbon with `style: 'wheel'`, `bipolar` and a
spring to centre; a mod wheel is the same Ribbon that latches, and *the difference between the two
wheels is entirely whether they spring back*. The shape primitives are Backgrounds: a rectangle is
one already, and a corner radius larger than half the box makes a circle. So the insert catalog now
carries `overrides` — a section patch applied at insert time — and a preset is a catalog entry. This
note itself offered the choice ("its own entry if wanted, else a Meter preset"); taking it avoided
three duplicate engines.

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
