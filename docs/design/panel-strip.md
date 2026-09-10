# Taking rows out of the properties panel

Status: **started**, 2026-09-10. Step 4 of four, one section done and the rest queued.
Steps 1–3 are [`panel-to-dock-handoff.md`](panel-to-dock-handoff.md) and
[`panel-search-index.md`](panel-search-index.md).

## What had to be true first

The three earlier steps, in order, because each one is a way the strip could have gone wrong:

1. **A way in.** Eight tabs and no route to any of them from the panel. Take a row out and it is
   gone with nothing pointing at where it went.
2. **A search that still finds it.** The panel's filter only ever matched rows the panel was
   drawing, so a moved row became unfindable — and the filter was blowing up on every keystroke
   anyway.
3. **Coverage.** Anything the tab could not do had to be built or written down as deliberately
   staying.

## The first section: `Text` → Effects

The single tallest section in the application. Measured in a 340px panel with every text effect
switched on:

| | Height | Cells |
|---|---:|---:|
| Before | **1,127px** | 58 |
| After | **174px** | 2 |

953px, from one section.

### What was checked before anything was removed

The Effects tab's `text` domain against the panel's 58 cells, one effect at a time:

| Panel had | Tab has |
|---|---|
| Outline: thickness, distance, fill, join, colour, placement, dash, dash len, gap | all of them, plus `width` |
| 2nd Stroke, Shadow, Glow, Inner Glow, Inner Shadow, Motion, Bevel, Reflection | all of their fields |
| **Blur** | in `built.unordered`, which the tab's stack list renders below the ordered rows |
| **Order**, ten separate number cells | dragging the stack, which writes the same `*Order` numbers |
| **Hollow** (`knockout`) | **nothing** |

So one thing was not covered, and it is a toggle. Which is why what stays is the toggle row — the
shape the Effects design record proposed a month ago: *"stripping the panel's Effects sections down
to the toggle row plus an opener"*.

### What is left

Eleven buttons, one line saying where the settings went, and the opener in the header. Every effect
can still be switched on and off without leaving the panel, and Hollow is still fully editable
because a toggle is all it is.

Four helper functions and one derived went with the rows — `effectProp`, `setEffectNumber`,
`setEffectColor`, `handleEffectColorSwatch`, `textEffectControlsVisible` — along with an unused CSS
rule. `TextEditor.svelte` is 2,008 lines, down from 2,422.

`browser-checks/panelStrip.mjs` pins all of it: the height, the eleven toggles reading the control,
Hollow being present, the opener resolving to `effects:<id>:text`, and the other Text sections being
untouched.

## The queue

One section at a time, each with the same gate: check the tab covers the rows, keep whatever it does
not, leave a way in and a line saying where things went.

| Section | Tab | Notes |
|---|---|---|
| `Text` → Effects | Effects | **done**, 1,127px → 174px |
| `EffectsEditor` → Component / Text Effects | Effects | Icon Effects has no tab and must stay whole |
| `Display`, `PixelDisplay` → Lighting | Effects | the brightness and backlight *source* bindings stay: parameter wiring |
| `Text` → Font Settings, Typography, Multiline | Type | |
| `Text` → Flow | Type | |
| `Display`, `PixelDisplay` → Screen, Layouts, Pages | Screen | |
| `CustomAssets` → Images, Filmstrips | Assets | Packaging stays |
| `CustomPublicProperties`, `CustomPublishedProperties` | API | |
| `Animations` | Animation | the quick-add buttons stay |
| `StepSequencer` → Sequence, `Envelope`, `Turing` | Designer | only the content rows; the timing rows stay |
| `CustomPackageLibrary` | Library | **not stripping**: save, import, export, metadata and validation are the modal task the library record argued they were |

Eleven of the fourteen designer components have no designer yet, so their sections are not on this
list at all.

## Notes

- 2026-09-10: One section rather than all of them, because "one section at a time" is what the plan
  says and because the coverage check is per section — the Effects one turned up exactly one thing
  the tab does not do, and finding that took reading `effectStack.js` against 58 cells. Doing eleven
  sections in one change would mean doing that check eleven times without stopping.
