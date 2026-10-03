# Animation overhaul — handoff

Branch: `claude/animation-overhaul-phase-1-cdk65v`, which continues `animation-overhaul` (the WIP
commit `1a74eb0` and this file). **Phase 1 is done and verified** — see
[Phase 1 — done](#phase-1--done) for what it changed and found. Phases 2–5 are below, in order.
Start by reading this file, then the files listed under "What is on the branch".

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

## Remaining work, phase by phase

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

### Phase 4 — keyframes and new triggers (design, not started)

Animation node with `kind: 'keyframes'`:

```
{ kind: 'keyframes', duration, delay, easing,
  iterations: <n> | 'infinite',            // default: infinite for always/stateChange, 1 otherwise
  direction: 'normal' | 'alternate',
  trigger: { type: 'always'|'stateChange'|'valueChange'|'beat'|'script',
             to: [...],        // stateChange: plays WHILE a to-state is active
             source, origin,   // valueChange: one shot per change
             every },          // beat: one shot every N transport beats
  targets: [{ path }],         // only the part ('' = control) matters
  frames: [{ at: 0..1, scale, rotate, x, y, opacity, fill, text }] }
```

- Render as CSS animations using the **individual transform properties** (`scale`, `rotate`,
  `translate`) so keyframes compose with the existing `transform` instead of replacing it.
  Generate `@keyframes ce-kf-<hash>` (+ an `-b` twin) into a `<style>` in CanvasControl; restart
  a one-shot by alternating the two names (the trick `utils/chromeMotion.js` already uses).
  SVG parts need `transform-box: fill-box; transform-origin: center`.
- A keyframe player beside the transition tracker decides playing/restart per entry; report
  firings to `animationActivity`.
- Beat: subscribe to `stores/transport.js` (`beats`, `running`); fire on integer crossings of
  `every`. External/MIDI: `trigger.origin: 'external'` on a value trigger (already implemented
  for transitions).
- Script: `ce.anim.play(control, animationName)`. Declare in `scripting/panelApi.js` with a
  runtime badge (it is visual, so preview-only); implement in `panelRuntime.js` as a store event
  CanvasControl reads. Check the cross-runtime/prelude agreement tests before adding a member —
  the C++ preludes must at least forward or no-op it. Regenerate the manual (`npm run docs:manual`).
- Tab: Kind becomes a real choice; keyframe editor (frame list + a small timeline, which the
  original design doc deferred "until animations get keyframes").

### Phase 5

- J: `utils/animationPresets.js` (hover lift, press squish, fade when disabled, LED blink while
  checked, beat pulse, value glide); apply to every selected control in one history transaction.
- K: per-layer `transition` for state-driven layer visibility/z-order (Layers tab named states) —
  find the model in `utils/panelLayers.js` / `utils/sceneryModel.js` first.
- L: `targetCost` is written; show it on TargetList rows.
- M: replace the Animations rows in `sections/AnimationsEditor.svelte` with a summary and an
  "Open in Animation tab" button (`properties/OpenInDock.svelte`); feed the panel search from
  `allAnimationFieldLabels()` (`utils/dockFieldIndex.js`); rewrite the test that pins the panel's
  old shape. Update `docs/design/animation-tab-design.md`.

---

## Prompt for Claude Code

```
Read CLAUDE.md, then docs/design/animation-overhaul-handoff.md, and check out the branch
animation-overhaul. Continue the animation overhaul from where the handoff says it stopped:
finish and verify Phase 1 first (update the pinned tests deliberately, add the new tests, clash
warnings, trigger chips, reverse/origin controls, regenerate the script preludes, run
npm run test:all, npm run build and npm run test:browser). Commit per phase with messages in the
repo's voice and push when green. Then do Phases 2 to 5 in order, keeping the handoff file's
"Remaining work" section up to date as you go. Ask me before anything that widens CI or changes
the C++ script runtime beyond regenerated tables.
```
