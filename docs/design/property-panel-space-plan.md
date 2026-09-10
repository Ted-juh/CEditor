# Making room in the properties panel

Status: **proposal only. Nothing here is built.**

Companion to [`widget-model-creator-plan.md`](widget-model-creator-plan.md), which this document
reorders and partly replaces. Read this one first.

## The request

> There are a lot of properties that are the same, repeated across numerous components. I already
> have the colour and gradient tabs in the display panel. Could more properties be done as a display
> panel tab, to make room in the properties panel or to group certain properties together? The
> amount of properties does not have to be downsized — it is the space it occupies. Think of border
> settings, fonts, and so on.

This is a better framing than the one in the widget plan, and the measurements below support it. The
widget plan proposed capping a panel at eight controls. That treats the count as the problem. The
count is not the problem — a font has legitimately got forty settings, and hiding thirty-two of them
behind a **More** button does not make the font easier to set. The problem is that all forty are
laid out in a 600px-wide portrait strip, four columns at a time, in a panel that is already 3,090px
tall for text.

## Three versions of this idea already work

Worth establishing first, because it changes the proposal from "build a mechanism" to "generalise a
mechanism that has shipped three times".

### 1. Handing a property off to the dock

`stores/colorTarget.js` and `stores/gradientTarget.js` define a **target**: a descriptor saying
where an edit should be written back to.

```
{ type: 'control', controlId: 'ctrl_1', path: 'Background.Fill.colour' }
{ type: 'panel',   prop: 'bgColour' }
{ type: 'callback', apply: (value) => … }
```

A swatch anywhere in the UI calls `activateColorTarget(target, currentValue)`. The DisplayPanel sees
the target, switches to the right tab (`utils/displayDock.js`, `impliedDockTab`), copies the initial
value in once (`utils/targetSync.js`), and writes changes back through `applyColorToTarget`. There
are eleven call sites across sections, panels, the canvas context menu and the design surface.

The decision is written down in `colorTarget.js`, and it is not an accident:

> One editing surface for colour, everywhere, is the rule.

That comment also records that the 2026-08-13 review argued for anchored popovers instead, that the
reading was accepted but the conclusion was not, and that the real complaints — no label saying what
was being edited, no Done or Cancel, a target outliving its selection, 44% of the viewport for a
colour picker — were fixed in place. So the dock is a deliberate choice, already defended once.

### 2. A compound widget replacing a wall of fields

`properties/BorderCornerWidget.svelte` is 683 lines and it is exactly the thing the request asks
about under "border settings". `Background.Border` has 67 leaf fields and `Background.Corners` has
111 — 178 between them, four sides and four corners each with style, thickness, dot radius, double
gap, colour and direction. The widget draws them as one diagram with a link/unlink cascade, and
`BorderEditor.svelte` is 37 lines because all it does is mount it.

It is already parameterised for reuse: `borderPath`, `cornersPath`, `buildColorTarget` and
`buildGradientTarget` are props, and `SegmentsEditor.svelte` mounts a second instance at a different
path.

### 3. One editor, many owners

`panels/LayerEffectsSection.svelte` takes a `prefix` prop (`'Image'` or `'Texture'`) and serves four
call sites across `BackgroundEditor` and `PanelCardContent`. One template, four owners.

**So the request is not asking for a new capability. It is asking for these three to be applied more
widely, and for the first one to stop being hand-written per property group.**

## The measured problem

Computed from the source and the stylesheet: a `PropertyCell` is a 10px label at line-height 1.1
(11px), a 2px gap and a 26px field (`--pp-field-height`), so 39px; the grid adds a 6px row gap and
12px of padding; a `PropertySection` header is about 26px with its rule. Cells are packed four
columns wide by their `span`. Conditional cells are counted, so these are heights with everything
visible.

| Editor | Cells | Rows | Sections | Height | Screens* |
|---|---:|---:|---:|---:|---:|
| Text | 136 | 58 | 17 | **3,090px** | 4.4 |
| Display | 64 | 39 | 11 | 2,107px | 3.0 |
| Pixels | 52 | 34 | 9 | 1,818px | 2.6 |
| Published properties | 59 | 29 | 5 | 1,465px | 2.1 |
| Behavior | 43 | 24 | 12 | 1,464px | 2.1 |
| Slider | 53 | 22 | 7 | 1,214px | 1.7 |

\* against a 700px panel viewport on a 1080p display. All 65 editors together come to 41,489px.

The panel is `min-width: 600px` with a four-column grid, and its tab rail carries 65 entries.

### Where the height actually is

Text, broken down:

| Section | Cells | Height | Share |
|---|---:|---:|---:|
| **Effects** | 58 | **1,067px** | 35% |
| **Flow** (reading direction, mirroring) | 34 | **662px** | 21% |
| Font Settings + Typography + Multiline | 20 | 501px | 16% |
| Fill stack (Solid, Gradient, Image ×2, Texture ×2) | 19 | 584px | 19% |
| Everything else | 5 | 276px | 9% |

Two sections are 56% of the tallest tab in the application. That is the shape of the problem, and it
is a much better target than an eight-control cap.

## The proposal

### The triage rule

Every property group gets sorted into one of three homes, and the rule has to be written down or the
sorting becomes taste.

**A group earns a dock tab when all three are true:**

1. **It is wide or visual.** It wants a preview, a stack, a specimen or a canvas, and reads badly in
   a 600px portrait strip four columns at a time.
2. **It has more than one owner.** `Text.Fill`, `Background.Fill` and the border gradient all want
   the same editor. A group with exactly one owner does not need a routing protocol — it needs a
   better layout, which is the next category.
3. **The tab does the editing.** Not a pointer to somewhere else. This one is a rule because the
   codebase already learned it: an `effects` tab existed, held the words "full editing coming soon",
   and was deleted. The comment in `DisplayPanel.svelte` is worth quoting because it is the
   strongest argument against doing this badly — *"a tab that only points elsewhere costs a slot and
   a click and teaches the user that the tabs here may be empty."*

**A group becomes a compound widget in the panel** when it is geometric and bounded, and one diagram
can replace N fields *and be a better control than the fields were*. Border and corners is the
worked example: 178 fields, one diagram, and the diagram is easier than the fields, not merely
smaller.

**Everything else stays as rows.** Most groups are five or six settings and are fine.

### Why the dock is the right shape

This is the part that makes the request work, and it is worth being explicit about.

The properties panel is **portrait**: 600px wide, roughly 700px of usable height, four columns.

The dock is **landscape**. It sits inside the centre column, so on a 1920px display it is about
1,264px wide, and `displayDock.js` reserves 260px of canvas, which puts its ceiling at about 820px
on a 1080p screen. Roughly 2.4× the usable area of the panel, in the aspect ratio that wide editors
actually want.

Text effects at 1,067px in the panel is a scroll. The same 58 controls in a 1,264px-wide dock, laid
out as a row of effect cards with a live specimen beside them, is one screen with the result visible
while you edit it. **That is the argument — not that the dock is bigger, but that it is the right
shape and it can show you what you are doing.**

### One target protocol, not four

`colorTarget.js` and `gradientTarget.js` are the same file twice. Both define a store, an activate
function, an apply function, a clear function, and an identical fourteen-line lifecycle block that
clears the target when the selection or the panel changes. `gradientTarget.js` says so in a comment:
*"mirror colorTarget.js"*.

Adding Effects and Typography as dock tabs by the current method means four copies of that block.
So the first piece of work is to collapse the two into one `editorTarget` store keyed by kind, with
one lifecycle, and let `impliedDockTab` read a registry instead of a hardcoded if-chain. After that,
adding a dock tab is registering a descriptor — kind, tab id, read path, write path — rather than
writing a fourth store.

This is worth doing even if nothing else here is built.

### Candidates, ranked by measured payoff

| Move | Group | Recovers | Why |
|---|---|---:|---|
| Dock tab | **Effects** (text glyph effects, layer effects) | ~1,067px from Text, plus the 20-field `Effects` section elsewhere | Outline, second stroke, shadow, glow — a stack you need to see. Restores the tab that was deleted, this time doing the editing. |
| Dock tab | **Typography** (Font, Typography, Multiline, Flow) | ~1,163px from Text | A font is chosen by looking at it. A specimen is the control. |
| Dock tab | **Image / Texture layers** | ~584px from Text, and the same shape in Background and the panel card | `LayerEffectsSection` is already shared; it wants a preview, not a file path in a 4-column grid. |
| Widget | **Padding / margin box** | small, but it appears on every part | A box diagram; the same argument as border and corners. |
| Widget | **Anchor / pivot** | ~2 rows per part | `AlignmentPicker` already exists; a 3×3 grid beats four dropdowns. |
| Stays | Behavior, Value, Bindings | — | Not visual. Rows are correct for them. |

Effects and Typography together take Text from 3,090px to about 860px — one screen instead of four
and a half — without removing a single property.

## What this does not fix

Being clear about this, because it decides what is left of the widget plan.

Relocating property groups fixes **density**. It does not fix **coherence**: the nine primitive
lists still reference each other by name string, a starter still leaves eleven anonymous nodes in
the tree, and a compound control still has no object you can select. Those are what the widget node
was for, and they stand.

But relocation is cheaper, needs no data model change, no migration and no version bump, and it
improves all 65 editors rather than only custom components. So it goes first, and the widget plan's
phases move behind it.

**And it removes the widget plan's worst idea.** With space no longer the binding constraint, the
eight-control cap has no justification left. A widget inspector should hold what the widget needs,
with the wide groups routed to the dock like everything else. That cap is withdrawn.

## Risks

Four, and the last two are the ones that would actually bite.

1. **A tab that points instead of editing.** Already covered — it has happened once here. A
   relocation that leaves a stub in the panel saying "edit this in the dock" is worse than the
   scroll it replaced.
2. **The dock is shared with the canvas.** Every tab added competes for the same 820px, and
   `displayDock.js` is explicit that a height the user has dragged wins permanently. A group that
   needs to be tall to be usable is not a good dock candidate.
3. **The panel's search box would stop finding relocated properties.** `stores/propertyFilter.js`
   feeds every `PropertyCell`, which reports its own visibility so a section can hide its header
   when nothing matches. Move a group out and it silently drops out of search — the user types
   "outline", gets nothing, and concludes the setting is gone. Any relocation has to keep the
   group's properties in the filter index and have a match offer to open the dock tab. This is not
   optional; it is the difference between relocating a group and losing it.
4. **The dock write path may not honour multi-selection.** In `BackgroundEditor.svelte` the field
   route writes through `updateSelectedProperty` when more than one control is selected (line 69),
   while `handleFillSwatchClick` builds a target carrying a single `controlId` (line 243), and
   `applyColorToTarget` writes with `updateControlProperty`. Read from the source that means: with
   three controls selected, typing a hex paints three and picking the same colour through the dock
   paints one. I have not run the app to confirm the behaviour, and it should be confirmed before
   anything is built on it — but if it holds, it is a bug today and it scales with every group moved
   to the dock. The target protocol needs to carry a selection, not a control id.

There is also a smaller one worth noting: `PropertyCell` hints feed the panel's Info bar, and
`docs/property-hints.md` governs them. A relocated editor needs its own answer for hints, or the
guidance in that file quietly stops applying to the properties it moved.

## Phases

| Phase | What | Value alone |
|---|---|---|
| 0 | Collapse `colorTarget` and `gradientTarget` into one `editorTarget` store with one lifecycle; make `impliedDockTab` read a registry. Fix the multi-selection write path if risk 4 confirms. | Removes a duplicated file and a real inconsistency. Worth doing on its own. |
| 1 | Extend the filter index so a relocated group is still findable, and a match can open its dock tab. | Nothing relocated yet, but nothing can be relocated safely until this exists. |
| 2 | **Effects** as a dock tab that does the editing. | The largest single win: ~1,067px off the tallest tab in the app. |
| 3 | **Typography** as a dock tab, with a specimen. | Text drops to roughly one screen. |
| 4 | Image / Texture layers into the dock, reusing `LayerEffectsSection`. | Removes the same block from three owners at once. |
| 5 | Padding and anchor compound widgets in the panel. | Small, but they appear on every part. |

Phase 2 is the one to judge this by, the same way phase 2 was in the widget plan. If Effects in the
dock is not obviously better than Effects in the panel, the triage rule is wrong and the rest should
not be built.

## Open questions

1. **Does a dock tab follow the selection, or pin to a target?** Colour clears its target when the
   selection changes. An Effects tab probably wants to follow the selection instead — but then it is
   a second properties panel, and the reason it is not one needs stating.
2. **What happens with the dock hidden?** The panel route has to still work, which argues that a
   relocated group keeps a compact in-panel form rather than being replaced by a button. That is in
   tension with recovering the space, and it is the main design decision here.
3. **Does the design surface's own docked DisplayPanel get the same tabs?** It mounts `DisplayPanel`
   in its bottom dock already, so it would — but its dock is shorter and the artboard is competing
   for the same pixels.

## Notes

- 2026-09-10: Written, after the widget plan was reordered behind it. The eight-control cap in that
  plan is withdrawn.
