# Animation overhaul — handoff

Branch: `claude/animation-overhaul-phase-1-cdk65v`, which continues `animation-overhaul` (the WIP
commit `1a74eb0` and this file). **Phases 1–5 are done, verified and pushed**, one commit each (4 is
two: keyframes, then `ce.anim.play`), except Phase 5's item K, which assumes a feature that does not
exist. "Remaining work" below records what each phase did and found, and ends with what is still
open. Start by reading this file, then the files listed under "What is on the branch".

Paste the section [Prompt for Claude Code](#prompt-for-claude-code) to start the next session.

---

## Why this exists

An audit of the Animations feature (2026-10-03) found the editor in good shape and the runtime
ignoring half of what the editor lets you set:

1. **Triggers were dead data.** `buildTransitionCatalog` (utils/interactionRuntime.js) never read
   `trigger.type / from / to / source`. Every animation's timing went onto every change of the
   properties it targets, last animation in the document winning a shared bucket. `pressIn` (80ms)
   and `hoverIn` (120ms) on the same scale could never differ. The default Knob/Slider setups ship
   `valueChange` triggers that meant nothing.
2. **Last-writer-wins clashes** on a shared part+bucket, with no warning.
3. **Three renderers, three motions.** `SliderFamilyRenderer` wrote `transition: all <one timing>`
   (so colour DID animate on sliders, contradicting the tab's "does nothing" warning);
   `InteractivePartRenderer` listed per property; the root (`CanvasControl`) did transform+opacity.
4. **Reduced motion and drag suppression only on sliders.** The OS `prefers-reduced-motion` was
   read by nothing; transitions stayed on during drags elsewhere.
5. **Found while fixing:** a part is placed with `left/top`, so `Layout.x/y/offsetX/offsetY`
   targets (bucket "transform") never moved anything. And slider/knob pointers are SVG attributes,
   which CSS cannot transition, so the default `pointerSlide` animation never did anything either.
6. Small: `Animations.debug` in the defaults is read by nothing; From/To are free text, not checked
   against the control's States; rename is two writes (check whether that is two undo steps —
   `stores/history.js` has `beginHistoryTransaction`); no colour bucket anywhere (panel or ce.anim).

The plan the owner approved, in this order:

| Phase | Items |
|---|---|
| 1 Correctness | A: triggers real · C: one transition rule, reduced motion + drag everywhere · E: clash warnings · small fixes above |
| 2 Visible wins | B: colour animation · D: live preview in the Animation tab (play, slow-mo, "which animation just fired") |
| 3 Expressiveness | F: more easings + custom bezier editor · G: spring as a panel easing (CSS `linear()`) |
| 4 New capability | H: second kind, looping **keyframes** · I: new trigger sources (MIDI/external, transport beat, `ce.anim.play` from scripts) |
| 5 Polish | J: preset recipes, apply to multi-selection · K: animated layer-state changes (Layers tab named states) · L: cost hints · M: remove the old Animations rows from the properties panel (`sections/AnimationsEditor.svelte`), feed its search from `allAnimationFieldLabels()` |

Repo rules that apply: read `CLAUDE.md` first. Verify locally before pushing; batch commits;
commit trailer `Co-authored-by: Claude <noreply@anthropic.com>`, no model names; do not open a PR
unless asked. Tests in this repo pin behaviour on purpose and are written to fail when the thing
they describe changes — update them deliberately, with the reason in the test's comment.

---

## What is on the branch

### New files

- **`CE/web/src/CE_Application/utils/easing.js`** — single home for every curve. `EASING_BEZIERS`
  (now 9: adds `inCubic`, `inOutCubic`, `inBack`, `outBack`, `inOutBack`), `EASING_NAMES`,
  `OVERSHOOTING_EASINGS`, `cubicBezierEase` (same fixed-iteration solver as panelRuntime/C++),
  `springEase` (= `ce.anim.spring` formula), `readEasing(animation)` (handles `easing: 'custom'`
  + `bezier: [x1,y1,x2,y2]` and `easing: 'spring'` + `spring: {damping, frequency}`),
  `easeAt`, `easingToCss` (spring → CSS `linear(…)`, falls back to `outBack` bezier when
  `CSS.supports` says no — old WebKitGTK), `parseTiming("140ms cubic-bezier(…) 0ms")` →
  `{duration, delay, ease}` for JS glides.
- **`utils/transitionSelection.js`** — the trigger rules (read the header comment; it is the spec).
  `describeChange`, `matchStrength`, `selectTransitions`, `selectionToTransitions`,
  `createTransitionTracker({ now })`. Default state = empty set ("default"). Forward match on a
  named `to` state 4 > forward on `*` 3 > valueChange 2 > reverse 1; ties → later animation.
  On a state change unmatched buckets snap EXCEPT picks still in flight (`until = now + span`);
  value-only changes keep previous picks; dragging drops `valueChange` picks; reduced motion → none.
  `trigger.reverse` (default true) and `trigger.origin` (`any|user|external`) are new fields.
- **`utils/transitionCss.js`** — `BUCKET_PROPERTIES` per target kind (`part` includes `left/top` in
  transform; `root` does not; `svg` uses fill/stroke), `transitionDeclaration`,
  `rootTransitionDeclaration`, `colourTransitionVar` → `--ce-colour-transition` custom property
  that inner painting elements read via `transition: var(--ce-colour-transition, none)`.
- **`stores/reducedMotion.js`** — `systemReducedMotion` readable over `matchMedia`.
- **`stores/animationActivity.js`** — `noteAnimationsFired(controlId, names)`; for the tab's
  live "just fired" lights (phase 2 D). Written by CanvasControl in an `$effect`, not read yet.

### Changed files

- **`utils/interactionRuntime.js`** — easing table moved out and re-exported (identity preserved:
  `scriptAnim.test.js` asserts `EASING_BEZIERS === <panel table>`). New exports:
  `readSignalSource`, `PART_PATH_BUCKETS`, `ROOT_PATH_BUCKETS` (both gain colour paths),
  `BUCKET_HINTS` (`background-color`, `color`, `border-color` → `colour`, so controls saved with the
  panel's old colour choices start working), `ROOT_BUCKETS`, `ANIMATION_BUCKETS`, `targetBuckets`,
  `readTrigger`, `animationTiming(animation, timeScale)`. `buildTransitionCatalog` now also returns
  `entries[]` (`{name, order, css, span, trigger, root:Set, parts:Map}`) and `reducedMotion`;
  `rootTransitions/partTransitions` remain the union (what COULD animate) for old readers.
  Skips `kind: 'keyframes'`. Honours `previewSession.animationTimeScale` (slow-mo, phase 2).
- **`editor/CanvasControl.svelte`** — one `createTransitionTracker()` per control;
  `activeTransitions` derived from `interactionRuntime` + `$systemReducedMotion`; root uses
  `rootTransitionDeclaration` + colour var; passes tracked buckets to SliderFamilyRenderer and
  InteractivePartRenderer; `.control-content` and `.text-span.ce-colour-anim` follow colour timing.
- **`editor/InteractivePartRenderer.svelte`** — shared declaration + colour var; simple background,
  vector shape and part text get `ce-colour-anim`.
- **`editor/SliderFamilyRenderer.svelte`** — shared SVG declaration; value-drawn parts (track fill,
  selected range, pointers) keep only opacity/colour transitions; **value glide**: `$effect.pre`
  + rAF tween of `normalizedValues` when pointer parts carry a timing (drag gets none from the
  tracker). `glideFrame` is cancelled on change and teardown.
- **`CE_Panel/components/BackgroundRenderer.svelte`** — fill/border layers read the colour var.
- **`utils/animationModel.js`** — top half rewritten on the runtime's tables (no copy):
  colour targets now "work", `OFFERED_PROPERTIES` gains Border colour, new
  `OFFERED_ROOT_PROPERTIES`, `targetCost` (composite/paint/layout), `VALUE_ORIGINS`. Phase 1 added
  `findClashes`/`triggersTie`/`clashesFor`, `controlStateNames`/`triggerStateChoices`/
  `unknownTriggerStates`/`toggleTriggerState`, `PANEL_EASING_OPTIONS`; `easingPoints` draws any
  easing (name or node, so custom and spring draw their own shape) through `readEasing`+`easeAt`;
  `newAnimationShape` writes `trigger.reverse: true`.

### Smoke-checked only — superseded

The WIP was smoke-checked with a scratch run of the tracker. That is now covered properly by
`test/transitionSelection.test.js` (rules and real controls) and `browser-checks/panelMotion.mjs`
(the real renderers in Chromium).

---

## Remaining work, phase by phase — now a record of what was done

### Phase 1 — done

Verified with `npm run test:all` (all green), `npm run build`, `npm run test:browser`'s two animation
checks, `svelte-check` (0 errors) and `CEditorScriptingTests` (C++, with `CEDITOR_SCRIPTING=ON`).

- **Pinned tests updated deliberately**, each with the reason in its comment:
  `animationModel.test.js` (colour works now; ten easings; `ANIMATION_KINDS` stays `['transition']`
  until keyframes play — the WIP had set it to include `keyframes`, which nothing played),
  `scriptAnim.test.js` (overshooting curves exempt from "never goes backwards", plus a test that the
  exemption list is exactly the curves that leave [0, 1]; thirteen curve names),
  `browser-checks/animationTab.mjs` (+ entry: the control has real Hover/Pressed states now).
- **Preludes regenerated** (`gen-script-modules.mjs --write`): table rows only, plus the cost table.
  **Finding:** nothing tested the music/time/easing tables, the stub lists or the host easing table
  for staleness — only the namespace block. `panelApiParity.test.js` now does (checked to fail on the
  stale file). The comment in `easing.js` that named a non-existent test now names this one.
- **One solver:** `panelRuntime.js` re-exports `cubicBezierEase` from `utils/easing.js`.
- **Tracker fixes** (`transitionSelection.js`), both found by the new tests: turning reduced motion
  on mid-hover (the preview switch) did nothing until the next change, because the "quiet frame"
  shortcut handed back the old transitions; and a pick held across frames kept its old timing after
  the animation was edited, deleted or switched off in the tab. Now a catalog key decides "quiet",
  and carried picks are re-read from the current catalog.
- **New tests:** `transitionSelection.test.js` (every rule, injected clock, plus a real Range and Knob
  through the runtime), `transitionCss.test.js`, `easing.test.js`.
- **Clash warnings (E):** `findClashes` reports only true TIES — same part+bucket, same strength for
  the same change — because a named state outranking `*` is a fallback someone built, not a fight.
  Shown on the list row (swords icon, loser only), the header count, and a note under the trigger.
- **Trigger editing:** From/To are chips (`components/animation/StateChips.svelte`) of the control's
  States keys plus `*` and `default`; a name the control lacks is shown as typed, marked, and one
  click from gone; header and row count unknown states. "Leaving: Snap back / Play back" writes
  `trigger.reverse`; value triggers get Origin (Any / Mine / Outside).
- **Value glide** also starts from the track fill's size timing (`rangeSlide`), and a re-render
  mid-glide no longer restarts it.
- **Rename** is one explicit history transaction (browser check: one undo takes it back whole).
- **`Animations.debug` stays** (decided, not forgotten): `createControl` merges the schema default,
  serialization strips values equal to it, and custom-component package fingerprints cover the
  section — removing it rewrites saved documents and every package fingerprint for an inert field.
  The comment at `SECTION_DEFAULTS.Animations` says so.
- **Seen in a browser:** `browser-checks/panelMotion.mjs` (new; in `test:browser`) mounts the real
  preview surface: hover 400ms vs press 80ms on one property, the fill colour mid-fade at 100ms,
  pressIn reversing on release, a knob gliding to an outside value and tracking a drag 1:1, and both
  reduced-motion switches. It stands in for "look at it in the app"; the full app under Xvfb was not
  run, and MIDI/CC was simulated through the preview session rather than a real device.

**Open, for the owner:** two custom-component starters — `starter.statusLamp` and
`starter.tabGroup` — inherit the generic `pressMotion` (to: pressed) but have no Pressed state, so it
never plays on them (and never visibly did). Either drop the animation or give them a Pressed state;
both change a shipped starter's package fingerprint and regenerate QA-07/QA-09, so it was left.
`animationModel.test.js` lists them as known exceptions so the list cannot grow.

### Phase 2 — done

- **B, colour:** the runtime and renderers already animated it after phase 1. A working colour
  target now carries `note` (`COLOUR_NOTE` in `animationModel.js`): only a solid colour fades; a
  gradient, image or material switches at the end. TargetList shows it as "solid only".
- **D, live preview:** a **stage** in the tab (`components/animation/AnimationStage.svelte`) draws the
  armed control with the real renderers (`InteractiveTestSurface`, compact) on a preview session of
  its own — you can hover, press and drag it in place, and nothing reaches the panel's sessions.
  **Play** runs `utils/animationPlayback.js`'s plan: the state the trigger starts from (a press
  starts from hover, as a real one does, so a hover animation beside it does not tie), the change,
  and the way back when `reverse` is on; a value trigger sweeps the value low → high → low with the
  pointer on or off the control by Origin. What Play cannot do it says (no such state, a channel
  source, a control without a settable value). **0.25×** sets `animationTimeScale: 4` on the stage
  session only. **Lamps** on the list rows light from `stores/animationActivity.js` as animations
  fire, on the stage or in Preview.
- Tests: `test/animationPlayback.test.js` (plans, then run through the real runtime + tracker to
  check the right animation fires); `animationTab.mjs` plays hoverGlow on the stage and checks the
  stage control's computed transition (0.14s, then 0.56s slowed) and the lamp.

### Phase 3 — done

- **F, more easings:** the table grew in phase 1 (ten named curves, generated into every runtime).
  The tab's easing row now offers all ten plus **custom** and **spring** (`EASING_CHOICES`), each
  drawn by `EasingCurve` — which now takes a whole node, so a drawn curve or a spring shows its own
  shape, and leaves room above and below so an overshoot is not clipped into looking like none.
- **Custom bezier editor** (`components/animation/BezierEditor.svelte`): the curve with two
  draggable control points; x kept in [0, 1] (CSS refuses time running backwards), y within the
  view's [-0.5, 1.5]; rounded to three places; drawn live, written once on release (one undo step);
  four number cells for exact values. Choosing custom starts from the curve the animation had
  (`easingPatch`), so the handles begin where the motion was.
- **G, spring:** damping and bounce cells (`cleanSpring` keeps them where a spring settles and does
  not buzz); `easing.js` writes it as CSS `linear()` with an `outBack` fallback where `linear()` is
  unsupported. Switching easing keeps the other kinds' fields, so going back loses nothing.
- **ce.anim:** named curves reach every runtime through the generator. custom and spring are
  panel-only — the tab says so — and `ce.anim` reports them as unknown curves rather than going
  linear, as it does any name it does not know. C++ parity for them was not added.
- Tests: model (`easingPatch`, `cleanSpring`, `moveBezierHandle`); `animationTab.mjs` picks custom
  (starts from inQuad's points), drags a handle with pointer events and checks one write, picks
  spring; `panelMotion.mjs` checks the computed `transition-timing-function` is a real `linear()`
  that overshoots, and a drawn curve's own `cubic-bezier`.

### Phase 4 — keyframes done; `ce.anim.play` is its own commit

The node, as built (`utils/keyframeAnimation.js` has it in its header):

```
{ kind: 'keyframes', duration, delay, easing,
  iterations: <n> | 'infinite',            // default: infinite for always/stateChange, 1 otherwise
  direction: 'normal' | 'alternate',
  trigger: { type: 'always'|'stateChange'|'valueChange'|'beat'|'script',
             to, from,         // stateChange: a loop plays WHILE a To state holds; a count plays on entering
             source, origin,   // valueChange: once per change, not again mid-run, never during a drag
             every },          // beat: once every N transport beats while it runs
  targets: [{ path }],         // only the part matters: 'Parts.<name>', else the control ('Transform')
  frames: [{ at: 0..1, scale, rotate, x, y, opacity }] }
```

- **Runtime:** `buildKeyframeCatalog` in `interactionRuntime.js` (same switches as transitions,
  including slow motion) → `runtime.keyframes`. A `createKeyframePlayer()` per control in
  CanvasControl decides what plays and restarts; it reports firings to `animationActivity`.
- **Drawing:** CSS animations on the **individual transform properties** (`scale`, `rotate`,
  `translate`), so a pulse composes with a control's own turn instead of replacing it (checked in
  Chromium on a control rotated 20°). `@keyframes ce-kf-<hash>-a|b` go into a `<style>` in the
  control's root — numbers and a hash only, nothing from document text. A one-shot restarts by
  flipping between the two names. SVG parts get `transform-box: fill-box; transform-origin: center`.
  Fill mode `none`, so a control is its own style again when a run ends.
- **Where:** keyframes play only where a control is previewed (`previewSessionOverride` set — the
  panel's Preview and the tab's stage), never on the design canvas. Only a control with a beat
  animation subscribes to the transport, and only one with keyframes listens for play requests.
- **Beat:** fires on integer crossings of `beats / every` while the transport runs; stopping and
  starting counts afresh. Value triggers with `origin: 'external'` cover MIDI coming back.
- **Tab:** Kind (Transition / Keyframes, `kindPatch` keeps the other kind's fields); keyframe
  triggers in a select; In/From chips for states; Repeat (Count / Loop), Times, Direction; "Plays
  on" a part or the control; `components/animation/FramesEditor.svelte` (a strip of frame marks and
  a row of cells per frame, empty cell = property left out). Play on the stage: loops shown for two
  cycles; beat and script ones played by a request (`requestAnimationPlay`, the store
  `animationPlays` in `stores/animationActivity.js`).
- **Not done, said in the tab:** colour and text frames. The layers that paint a control's colour
  carry inline styles a keyframe on the control cannot reach; a registered custom property read by
  those layers would be the way.
- The properties panel's Kind hint now names keyframes and points here (its pinned test updated).
- **`ce.anim.play(control, animation)`** (its own commit): declared in `panelApi.js` as WebView-only
  (it is drawn, so there is nothing to play with the window shut), implemented in `panelRuntime.js`
  as the same `requestAnimationPlay` the stage uses; refuses a transition or a typo with the names
  of the keyframe animations the control has. **C++ touched only through regenerated regions** —
  the namespace map and the window-closed stub list in the three preludes (`gen-script-modules.mjs
  --write`); no hand-written C++ changed, and `CEditorScriptingTests` passes (504). Manual, API
  explorer, cost table and the written example regenerated/added. Checked end to end in Chromium:
  a script's `ce.anim.play` starts the keyframe animation on a previewed control.

### Phase 5 — done, except K, which has no model to build on

- **J, presets** (`utils/animationPresets.js`): hover lift, press squish, fade when disabled, blink
  while on, beat pulse, value glide. A preset writes the animation **and the state change it
  animates** — a transition eases a change, it does not make one — merged into a state of the same
  name (matched ignoring case) rather than replacing it, and a value the state already sets is left
  as the author's. The panel's old Quick buttons replaced the state, so pressing one on a button
  threw away its own Pressed colour. Each preset says when it cannot go on a control (no pointer
  part for value glide, or a pointer glide already there — Knobs and Sliders ship `pointerSlide`,
  and a second would only clash with it; never checked for blink while on). The tab's picker adds to the armed
  control or to every selected control, one history transaction either way. Tests apply each preset
  with the real tree writer and run the control through the runtime, tracker and player.
- **K, animated layer-state changes: not built — the feature it assumes does not exist.** The
  Layers tab has no named states: a layer carries `visible`, `locked`, `kind` and a colour, all
  editor-side (`utils/panelLayers.js`; `utils/sceneryModel.js` is the scenery bake). Nothing at
  runtime switches a layer. The nearest real thing is a custom component's page layers, swapped by
  rule-driven states (`customComponentFactory.js`, the tab-group starter) — those are part state
  patches, which transitions already animate when the patch is opacity and cannot when it is
  visibility (CSS does not transition `display`). Deciding what a "layer state" should be is the
  owner's call; it is a feature, not a polish item.
- **L, cost hints:** each working target row carries cheap / paint / layout (`targetCost`), with
  the reason in its tooltip.
- **M, panel cleanup:** `sections/AnimationsEditor.svelte` is now a summary — each animation's
  kind, trigger in words and duration, the dead/clash/unknown counts — and the one way into the tab
  (`OpenInDock`; the openers check counts eight). The panel search was already fed from
  `allAnimationFieldLabels()`; the list now names every field the tab edits, and a test checks it.
  The test that pinned the panel's old shape now pins the summary, so the rows cannot creep back.
  Not carried over: the panel's "Debug animation" JSON dump. `animation-tab-design.md` updated.

### Still open, for whoever picks this up

1. **K** — needs a decision on what a layer state is (see above).
2. **Two starters** (`statusLamp`, `tabGroup`) name a Pressed state they do not have (Phase 1).
3. **Keyframe colour and text frames** — needs a way for a keyframe to reach the painting layers
   (a registered custom property they read, say).
4. **custom/spring easings in ce.anim** — panel-only today; C++ parity would be a runtime change.
5. **A timeline across animations** — who plays when, on one axis. The frames editor has a strip
   per animation; there is nothing that lays several out together.
6. **The full app was not run under Xvfb.** `panelMotion.mjs` mounts the real preview surface in
   Chromium and stands in for it; MIDI was simulated through preview sessions, not a device.

---

## Prompt for Claude Code

```
Read CLAUDE.md, then docs/design/animation-overhaul-handoff.md, and check out the branch
claude/animation-overhaul-phase-1-cdk65v. Phases 1 to 5 of the animation overhaul are done and
pushed; "Still open" at the end of the Remaining work section lists what is left and why. Pick
from that list only what the owner has decided on — K in particular needs a decision first.
Verify locally before pushing (npm run test:all, npm run build, npm run test:browser), commit in
the repo's voice, and ask before anything that widens CI or changes the C++ script runtime beyond
regenerated regions.
```
