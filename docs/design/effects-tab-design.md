# The Effects tab

Status: **a design, not a commitment.** Nothing is built.

Candidate 1 from [`display-panel-candidates.md`](display-panel-candidates.md). Drawn in
[`effects-tab-mockups.html`](effects-tab-mockups.html).

## Scope

The largest measured relocation: **1,902px over four owners.**

| Owner | Section | Height |
|---|---|---:|
| `TextEditor` | Effects | 1,067px |
| `EffectsEditor` | Component / Text / Icon Effects | 321px |
| `DisplayEditor` | Lighting | 257px |
| `PixelDisplayEditor` | Lighting | 257px |

`Text.Effects` alone carries **eleven effects and 63 leaf fields**: outline, second stroke, shadow,
glow, inner glow, inner shadow, blur, motion, bevel, reflection, copy, plus a knockout flag.

## Two findings that decide the design

### 1. The stack already exists — it is just invisible

Every text effect carries an `*Order` number: `reflectionOrder: 5`, `shadowOrder: 10`,
`glowOrder: 20`, `motionOrder: 30`, `outlineOrder: 40`, `stroke2Order: 45`, `innerShadowOrder: 60`,
`bevelOrder: 60`, `innerGlowOrder: 80`. Today an author sets stacking by typing eleven numbers into
eleven fields in different collapsed sections, and there is nothing anywhere that shows the
resulting order.

But the renderer already computes it. `CanvasControl.svelte:2023` builds
`sortTextVisualLayers([...])` from `{ key, order, priority }` entries — and the **fill is in that
list too** (`{ key: 'fill', order: textFillOrder, priority: 80 }`), which is how an outline can sit
behind or in front of the letterform.

**So the tab can render the renderer's own stack, and dragging a row writes the order numbers back.
No data model change, no renderer change, and eleven number fields disappear.**

It also surfaces a defect. `bevelOrder` and `innerShadowOrder` both default to **60** — a tie,
resolved silently by the hidden `priority` field (90 vs 100). Nothing in the UI can express or
explain that today.

### 2. The app already knows the better pattern

`Background.Fill.layerOrder` is an **array** — `['solid', 'gradient', 'image', 'overlay']` — with
up/down buttons in `BackgroundEditor.svelte:334`. Fills got a reorderable list; text effects got
eleven magic numbers. The precedent is in the same codebase, one section away.

Solo, mute and reset per layer also already ship: `LayerEffectsSection.svelte:59-61` draws `S` / `M`
/ `R` buttons. Reusing them for effects is consistency, not invention.

## No sliders — and no loss

The constraint is that there are no horizontal, vertical or radial sliders. Every value in this tab
is one of four things, and none of them is a slider:

| Kind | Control | Already exists |
|---|---|---|
| A number (blur, distance, size, opacity) | **`NumberCell`** — the label is a horizontal drag handle, the steppers give exact single increments (Shift = ×10), the text is always typeable | `properties/NumberCell.svelte` |
| A choice (join, placement, style, blend) | **Segmented chips** | `properties/Segmented.svelte` |
| A colour | **Chip that opens the Colors tab** | `SwatchCluster`, 53 call sites |
| A whole look | **Preset thumbnail** | new |

`NumberCell` is the important one, and it is better than a slider for this content, not a compromise
for it. A slider trades precision for a rough gesture and cannot be typed into. NumberCell gives
three ways in — scrub the label, click a stepper, type the number — with no track eating horizontal
space. Its own comment calls this "three ways in, no modes".

For an angle (bevel 135°, motion 0°, reflection 90°) it is a number field with a small orientation
glyph beside it, **not** a dial.

## Layout

Four columns across the dock, about 1,264px:

```
  THE STACK          THE SPECIMEN            THIS EFFECT           LOOKS
  ~230px             ~400px                  ~330px                ~200px

  ⠿ ◉ Inner Glow ▣   ┌──────────────────┐    Outline              [thumbnails
  ⠿ ◉ Bevel      ▣   │                  │    Colour   ▣ 5B9BD5     of the same
  ⠿ ◉ Inner Shad ▣   │     CUTOFF       │    Thickness  1.4        text under
  ⠿ ─ Fill       ▣   │                  │    Placement  ▢▣▢        named looks:
  ⠿ ◉ 2nd Stroke ▣   └──────────────────┘    Join       ▢▣▢        Engraved
  ⠿ ◉ Outline    ▣   ┌──┐┌──┐┌──┐┌──┐        Dash       off        Neon
  ⠿ ◉ Motion     ▣   │ba││ho││pr││di│        Order    (drag ↖)     Letterpress
  ⠿ ◉ Glow       ▣   └──┘└──┘└──┘└──┘                              Long shadow
  ⠿ ◉ Shadow     ▣    base hover press dis                        Chrome …
  ⠿ ◉ Reflection ▣
```

**Column 1 — the stack.** Top is drawn in front. Each row: a drag handle, an on/off dot, the name, a
`S`/`M` pair, and a **thumbnail of that effect alone**. Dragging writes the order numbers. The fill
sits in the list because the renderer puts it there.

**Column 2 — the specimen.** The control's own text, at size, live. Underneath, a strip of four
smaller specimens: **base, hover, pressed, disabled.** Holding the compare button shows the
specimen with all effects off.

**Column 3 — the selected effect.** Only the selected row's fields, five or six of them, as
NumberCells and chips. No `Order` field: the stack is the order.

**Column 4 — looks.** Named presets rendered as the specimen's own text. Click applies the whole
stack. Most people want a look, not eleven parameters.

## The four things worth calling innovative

Each has to earn it — novelty for its own sake is how the deleted `effects` tab happened.

1. **Per-effect thumbnails in the stack.** Each row shows what *that layer alone* contributes, the
   way a mixer shows a meter per channel. With nine effects live it is otherwise impossible to tell
   which one is producing what you are looking at. I have not seen this in Photoshop, Figma or
   Illustrator, and it is cheap here because each effect is already a separately rendered layer.
2. **The state strip.** Effects in this app are state-scoped — `States`, `acceptsStatePatches` — so
   a shadow can exist on `base` and vanish on `pressed`. Today the only way to discover that is to
   hover the real control. Four small specimens make it visible while editing. This is specific to
   this application; a general graphics tool has no states to show.
3. **Drag to stack.** Ordinary in a graphics editor, and new here — with the twist that the fill is
   a row in the list, so "outline behind the letters" becomes a drag rather than a number
   comparison.
4. **Looks as the specimen's own text.** A preset gallery that renders *your* label, not the word
   "Sample", so what you click is what you get.

Deliberately **not** included: a draggable shadow on the specimen. It is Photoshop's Layer Style
gesture and it is the same fiddliness already rejected for arc handles — the offset is two numbers
and two NumberCells beat chasing a blurred copy with the pointer.

## What stays in the properties panel

The open question from the space plan, answered for this candidate.

The panel keeps **one row**: the existing effect-toggle chips (`Outline · 2nd Stroke · Shadow · Glow
· Inner · Emboss`), which is a single `span={4}` cell at 77px, plus an **Effects…** button that opens
the tab. So with the dock hidden you can still turn an effect on and off; you cannot tune it.

That is 77px against 1,067px, and it means the group is relocated rather than lost.

## Search

`propertyFilter` feeds every `PropertyCell`, so relocating this group would drop 63 field labels out
of the panel's search. The tab must register its fields in the same index, and a hit must offer to
open the Effects tab with that effect selected. **This ships with the tab or the tab does not ship** —
a user who types "glow" and gets nothing concludes the feature was removed.

## Cost

- `EffectsTab.svelte` — the four columns.
- `effectStack.js` — a pure module deriving the ordered stack from the `*Order` fields and writing
  new orders on drop. Mirrors `sortTextVisualLayers` so the two cannot disagree; testable without a
  browser.
- A per-effect thumbnail renderer. The most uncertain piece: it needs each effect rendered in
  isolation at ~28px. `effectsCSS.js` already builds the CSS, so this may be a matter of applying
  one layer's CSS to a small specimen.
- A `looks` preset table.
- Registering `effects` in the dock tab list, and the panel's one-row summary.

The tab does the editing. That is the rule the deleted `effects` placeholder broke, and the reason
`DisplayPanel.svelte` still carries a comment about it.

## Open questions

1. **Does the tab follow the selection?** Colour clears its target on a selection change. Effects
   probably wants to follow instead — select another control, the tab retargets. That makes it a
   second properties panel in one respect, which needs to be a deliberate answer rather than a
   default.
2. **Component effects and Lighting in the same tab?** Component `Effects` is a different shape
   (`Shadows.items[]` is an array, plus `Filters` — brightness, contrast, saturation, hue, grayscale,
   sepia, invert — and `Blend.mode`). Filters are a colour grade, not a stack. Probably a second
   mode in the same tab rather than a second tab, but it may be cleaner to ship text effects first
   and decide after.
3. **Should the tie be fixed?** `bevelOrder` and `innerShadowOrder` both default to 60. Once the
   stack is draggable the tie is expressible, but existing documents carry it. Leaving it and
   letting `priority` resolve it keeps them rendering identically, which argues for leaving it.

## Notes

- 2026-09-10: Written. Nothing built.
