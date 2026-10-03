# The Animation tab

Status: **built**, 2026-09-10; **overhauled** 2026-10-03 — triggers are real, keyframes, a stage, and
the properties panel's rows are gone. See [The overhaul](#the-overhaul-2026-10-03) and
[`animation-overhaul-handoff.md`](animation-overhaul-handoff.md), which has the detail phase by phase.

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

The timeline under the columns is not a slider either: it is a drawing of every animation's delay
and duration on one axis, from the moment its trigger fires, and its bars are buttons you can nudge
— drag a bar to move its start, its right edge to resize a cycle, or use the arrows. The numbers are
still edited in the number cells; a drag writes once, on release, as one undo step. The JSON the
properties panel's "Debug animation" button used to show is the setting column's Debug button now:
it sends the node, as stored, to the Console tab's debug pane and opens that tab.

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

## The overhaul (2026-10-03)

An audit found the tab honest about targets and the runtime ignoring half of what it let you set:
triggers were dead data, so `pressIn` and `hoverIn` on one property could never differ. Five phases
later (the handoff has each one's files, tests and findings):

| What changed | Where |
|---|---|
| Triggers decide which animation plays; reverse, origin, ties | `utils/transitionSelection.js` |
| One transition writer; a colour bucket; left/top glide with a part's transform | `utils/transitionCss.js` |
| Every curve in one file; ten named easings, custom bezier, spring as CSS `linear()` | `utils/easing.js` |
| The slider value glide (SVG attributes cannot be transitioned) | `editor/SliderFamilyRenderer.svelte` |
| Keyframes: a second kind, played as CSS animations on the individual transform properties | `utils/keyframeAnimation.js` |
| `ce.anim.play(control, animation)` | `scripting/panelApi.js`, `scripting/panelRuntime.js` |
| Clash and unknown-state warnings, state chips, a stage with Play and 0.25×, fired lamps | `components/AnimationTab.svelte`, `components/animation/*` |
| Presets that write the state change with the animation, and merge into existing states | `utils/animationPresets.js` |
| Cost tags on target rows (cheap · paint · layout) | `components/animation/TargetList.svelte` |
| The properties panel's Animations rows replaced by a summary and the way into this tab | `sections/AnimationsEditor.svelte` |

**The panel's rows came out.** Everything they did, this tab does, and their Quick buttons are the
presets — which merge into a state of the same name instead of replacing it. The panel's search is
fed from `allAnimationFieldLabels()`, so typing "easing" still finds it and offers this tab. The one
thing not carried over is the panel's "Debug animation" button, which dumped the node as JSON into
the Debug dock; the tab shows every field, and the stage shows what it does.

Findings 1, 3 and 4 above are history now: colour animates, every easing is drawn (and two you
shape), and Kind is a real choice between two kinds that both play. Finding 2's JSON box is gone.

## Still open

1. ~~Nothing is relocated yet~~ — done in the overhaul: the panel shows a summary.
2. **Adding, deleting and renaming an animation are built here now** (2026-09-10, step 3 of the
   panel cleanup). `newAnimationShape` is one definition of what a new animation is, so the panel's
   Add and this one make the same thing — and unlike the panel's, a duplicate name is suffixed
   rather than silently doing nothing. The panel's quick-add buttons stay where they are.
3. **No timeline.** The candidate list wanted one. With one duration, one delay and one easing per
   animation there is nothing to lay out along a time axis that the three numbers do not already
   say. Keyframes changed that: their frames editor has a strip showing where each frame sits in a
   cycle. A timeline across animations (who plays when, on one axis) is still not built.
4. ~~`kind` is not edited here at all~~ — it is a real choice now, transition or keyframes.
5. **Keyframes cannot animate colour or text yet** — the layers that paint a control's colour carry
   inline styles a keyframe on the control cannot reach.

## Notes

- 2026-10-03: The overhaul, phases 1–5. See the handoff file.
- 2026-09-10: Written and built together. The heights were measured first and the space argument
  rejected; all four findings were checked against the shipped code, and the fourth was corrected
  by that check before the document was written.
