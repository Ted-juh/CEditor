# The Effects tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

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

## Decisions taken

The three open questions, answered by the owner before building.

1. **The tab does NOT follow the selection.** It stays on the control you opened it with, and the
   header names that control at all times — with a "not selected" badge when the selection has moved
   on. Opening the tab is the one moment it arms itself, from whatever is selected then. The reason
   the header matters is in `stores/effectsTarget.js`: what made the old colour dock dangerous was a
   live write-route with nothing on screen saying what it was writing to.
2. **All three domains ship together**, switched by Text / Layer / Screen in the header, and a
   control only offers the ones it has. Layer effects keep their own shape rather than being forced
   into a stack — the shadow array drags, `Filters` and `Blend` do not, because a colour grade is
   not a layer.
3. **The order-60 tie is left alone.** `bevelOrder` and `innerShadowOrder` both ship at 60 and saved
   panels depend on `priority` resolving it, so the model reproduces the tie rather than fixing it.
   The stack shows a warning bar naming the two effects, and dragging either one separates them —
   which is the first time that has been expressible at all.

## What was built

| Piece | File |
|---|---|
| The model — descriptors, the derived stack, reorder patches, preview clones | `utils/effectStack.js` |
| Named looks | `utils/effectLooks.js` |
| The target store | `stores/effectsTarget.js` |
| The tab | `components/EffectsTab.svelte` |
| The four columns | `components/effects/EffectStackList · EffectSpecimen · EffectSettings · EffectLooks` |
| The shared preview renderer | `components/effects/EffectPreview.svelte` |
| In-place colour editing | `components/effects/EffectColourPopover.svelte` |
| Registration | `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/effectStack.test.js` (25), `browser-checks/effectsTab.mjs` (15) |

**The properties panel is untouched.** Every section this tab edits is still there and still works.
Nothing has been relocated, on purpose: the tab has to be shown to work before anything is taken
away. Until then the two are simply two ways into the same properties, which is also why the
measured 1,067px is not yet recovered — that comes with the later, separate change, and
`allEffectFieldLabels()` exists ready to keep the panel's search index whole when it does.

### Three things found while building

- **`structuredClone` would have blanked the dock.** The first draft used it for the preview clones.
  `test/deepCloneProxySafety.test.js` catches it: on a Svelte `$state` proxy it throws
  `DataCloneError` and takes out the render around it. All six calls are `deepClone` now.
- **Two tests pinned the Effects tab as deleted.** `editorChromeSurfaces.test.js` asserted no
  `id: 'effects'` and no branch to reach, from the B10 removal. They now pin the *rule* behind that
  removal instead — the tab must mount the four columns and write properties itself, rather than
  pointing at the properties panel. If it is ever reduced to a link again, they fail again.
- **A cover-fitted row thumbnail showed the control's own border** as two grey lines across a 22px
  box, which was the loudest thing in a picture meant to show one effect. `EffectPreview` takes a
  `zoom` that overshoots the fit so the crop eats the edges.

## Still open

1. **`Text` → Effects is stripped** (2026-09-10) to exactly that: the toggle row plus an opener,
   1,127px down to 174px. See [`panel-strip.md`](panel-strip.md). The Component/Text Effects
   sections in `EffectsEditor` and Lighting in the two display editors are still whole.
   Checking coverage first turned up one thing this tab does not do at all: **Hollow**
   (`knockout`), which `CanvasControl` reads and no row here writes. Its toggle stays in the
   panel, which is the whole of it.
2. **The opener is built** (2026-09-10). The Effects sections in `Text`, `EffectsEditor` and both
   display editors carry a button into this tab — see
   [`panel-to-dock-handoff.md`](panel-to-dock-handoff.md). Icon effects deliberately have none:
   this tab does not cover them.
3. **Lighting has the thinnest coverage.** `LIGHTING_GROUPS` carries backlight and dot matrix; the
   brightness/backlight *source* bindings stayed in the panel because they are parameter wiring, not
   something you judge by looking.

## Notes

- 2026-09-10: Written. Nothing built.
