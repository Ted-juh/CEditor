# The Animation tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

Candidate 8 from [`display-panel-candidates.md`](display-panel-candidates.md). Drawn in
[`animation-tab-mockups.html`](animation-tab-mockups.html).

## The space argument fails, and the number in the candidate list is wrong

The list said "about 870px over three owners: `Animations` 642px, plus the Animation section in
`Display` and `PixelDisplay` at 242px each." Two things are wrong with that.

**First, the Animations section is 712px, not 642px, and it does not grow.** Measured —
`AnimationsEditor` mounted in Chromium at four library sizes:

| Animations on the control | Section height |
|---:|---:|
| 0 | 121px |
| 1 | 712px |
| 3 | **712px** |
| 8 | **712px** |

It is flat, because the section picks one animation from a dropdown and only ever draws that one.
Eight animations take exactly as much room as one. So there is no runaway height here.

**Second, the other two sections are a different feature.** `Display` and `PixelDisplay` have a
section called "Animation", and it plays a GIF or a sprite sheet behind a dot-matrix screen:

```svelte
<PropertyCell label="Mode" hint="Dot-matrix animation played behind the zones/text.
                                File = GIF/APNG or a sprite sheet; Preset = built-in effects.">
```

That has nothing to do with state transitions. The candidate list grouped the three by name. This
tab covers `Animations` only, and those two stay where they are.

**So this is not built for the space.** It is built for four things the editor gets wrong, and the
first one is the reason.

## Four findings

### 1. Two of the seven properties on offer animate nothing

The editor's "Property" dropdown has seven choices:

```js
const TARGET_PROPERTIES = [
  { path: 'Layout.scale',            props: ['transform'],        label: 'Scale' },
  { path: 'Layout.rotation',         props: ['transform'],        label: 'Rotation' },
  { path: 'Layout.x',                props: ['transform'],        label: 'X Position' },
  { path: 'Layout.y',                props: ['transform'],        label: 'Y Position' },
  { path: 'opacity',                 props: ['opacity'],          label: 'Opacity' },
  { path: 'Background.Fill.colour',  props: ['background-color'], label: 'Fill Colour' },
  { path: 'Text.Fill.colour',        props: ['color'],            label: 'Text Colour' },
];
```

The runtime accepts a fixed list of paths and fills one of three buckets — transform, opacity,
size. There is no colour bucket. So the last two do nothing at all.

Measured, by running the real runtime (`resolveInteractiveControl`) over each of the seven and
reading back which buckets it filled:

| Property | What the runtime animates |
|---|---|
| Scale, Rotation, X Position, Y Position | transform |
| Opacity | opacity |
| **Fill Colour** | **nothing** |
| **Text Colour** | **nothing** |

Pick one of those two, click **Append target**, and you get an animation that never runs. Nothing
says so — not the dropdown, not the target list, not the preview.

That check is now a test. `animationModel.test.js` runs the real runtime over every property this
tab offers and asserts the tab's answer matches, so if the runtime ever grows a colour bucket the
warning stops being true and the test fails rather than the tab lying quietly.

### 2. The target list is a JSON textarea

What an animation actually changes lives in a twelve-row box of raw JSON:

```svelte
<textarea class="val code" rows="12" value={targetsDraft} …>
```

There is an **Append target** button, so adding one is fine. To delete a target, or to change the
order, you edit the JSON by hand. Get it wrong and the only feedback is a parse error.

### 3. Easing is four names, and the app already draws curves

```js
const EASING_OPTIONS = ['linear', 'outQuad', 'inOutQuad', 'outCubic'];
```

A dropdown of four words, with no picture of any of them. The difference between `outQuad` and
`outCubic` is exactly the kind of thing you cannot judge from a name.

The runtime knows **five**: `inQuad` is in `EASING_NAMES` and in `EASING_BEZIERS`, and the panel
never offers it. And `ResponseCurveDesigner.svelte` in this same app draws curves already, so
drawing one is not new ground.

### 4. Kind is a free text box

```svelte
<input class="val" type="text" value={selectedAnimation.kind ?? 'transition'} …>
```

`transition` is the only kind the runtime does anything with. This one is the mildest of the four,
and worth saying so: the cell's own hint reads *"Transition is the only runtime kind in this
slice"*, so the panel does warn you. It is a text box where a fixed choice would do, not a trap.

## Layout

```
  editing Big Knob  2 animations  [ 2 targets do nothing ]     All animations  Off|On   Use selection  Clear

  ANIMATIONS      2   PRESSMOTION                     CHANGES                        4 targets
  ● pressMotion  90ms⚠2   TIMING                      ⠿ background  Layout.scale              transform  ×
  ○ hoverGlow    140ms      Duration  [ 90 ] ms       ⠿ background  Background.Fill.colour ⚠ does nothing ×
                            Delay     [  0 ] ms       ⠿ background  opacity                     opacity  ×
                          RUNS WHEN                   ⠿ nosuchpart  Layout.rotation        ⚠ does nothing ×
                            Trigger   [State|Value]
                            From      [ *       ]     ┌──────────────────────────────────────────────┐
                            To        [ pressed ]     │ Part    [ background       ▾ ]               │
                          EASING                      │ Change  [ Scale            ▾ ]               │
                            ╱   ╱   ╱   ╱   ╱         │           + Add this change                  │
                          linear inQuad outQuad …     └──────────────────────────────────────────────┘
```

Left: every animation at once, with an on/off dot, how long it runs and how many of its targets do
nothing. Middle: timing, trigger and the five easings as drawn curves. Right: what the animation
changes, as a list you can delete from and drag to reorder, and a row to add one.

## The four things worth calling innovative

1. **A target that does nothing says so, on the row.** Two of the panel's own dropdown choices, and
   a target pointed at a part the control does not have, are both marked amber and both explain
   which kind of nothing they are. The header counts them across every animation.
2. **The warning comes before the click.** Pick "Fill colour" in the add row and the warning appears
   under the dropdown, with what the runtime *does* accept, while the button is still unpressed.
3. **The target list is a list.** Delete with a button, reorder by dragging. Same data, same write
   path as the panel — the whole array goes back in one go — but no JSON.
4. **Every easing is drawn, and there are five.** Same beziers the runtime hands to CSS, so the
   picture is the real curve. `inQuad` is offered here for the first time. Each has a dashed
   straight line behind it, so you can see how far it leans.

## No sliders

Same rule as the other six. Duration and delay are number cells with steppers; trigger is a
segmented control; easing is a row of pictures you click. There is no slider and no JSON box in the
tab, and the browser check asserts both.

## What was built

| Piece | File |
|---|---|
| The model — the runtime's rule written out, target editing, easing curve points | `utils/animationModel.js` |
| The tab | `components/AnimationTab.svelte` |
| Columns | `components/animation/AnimationList · TargetList · EasingCurve` |
| Registration | `stores/editorTarget.js`, `utils/displayDock.js`, `panels/DisplayPanel.svelte` |
| Tests | `test/animationModel.test.js` (24), `browser-checks/animationTab.mjs` (18) |

**Nothing was removed.** `AnimationsEditor` still draws every section, still edits every field, JSON
box and all, and still has its quick-add buttons. `allAnimationFieldLabels()` is ready for the day
the panel's rows do come out.

### Decisions and what the building turned up

- **Width and Height are offered here and not in the panel.** The runtime animates both — they fill
  the size bucket — and the panel's dropdown has never listed them. Adding them cost nothing, and
  the same test that pins the two dead ones pins the panel's list at seven, so if the panel ever
  grows this comment fails with it.
- **The dead properties are kept, not dropped.** The panel still offers them, so a control saved
  from the panel can already carry one. A tab that quietly hid them could not name the problem.
- **"Does nothing" has two causes and they are reported separately.** A path the runtime does not
  accept is one thing; a target on a part the control does not have is another — and the runtime
  happily builds a transition for the missing part rather than complaining, which is checked.
- **Finding 4 was written down softer after reading the source.** The first draft called the free
  text box a trap. The panel's own hint already says transition is the only kind that works, so the
  claim was wrong as written. The test now asserts the hint is there, so nobody can put it back.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **Adding, deleting and renaming an animation are built here now** (2026-09-10, step 3 of the
   panel cleanup). `newAnimationShape` is one definition of what a new animation is, so the panel's
   Add and this one make the same thing — and unlike the panel's, a duplicate name is suffixed
   rather than silently doing nothing. The panel's quick-add buttons stay where they are.
3. **No timeline.** The candidate list wanted one. With one duration, one delay and one easing per
   animation there is nothing to lay out along a time axis that the three numbers do not already
   say. If animations ever get keyframes, that changes.
4. **`kind` is not edited here at all.** Transition is the only one that works, so the tab writes it
   and does not offer the box. If a second kind ever ships, this needs a real choice.

## Notes

- 2026-09-10: Written and built together. The heights were measured first and the space argument
  rejected; all four findings were checked against the shipped code, and the fourth was corrected
  by that check before the document was written.
