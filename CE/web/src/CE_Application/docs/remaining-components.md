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
