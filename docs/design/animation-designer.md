# The Animation Designer

Status: **proposal, 2026-11-24. Nothing here is built.** Worked out with the owner over one session,
from two demo recordings of an earlier program to a mockup on a Design canvas (private to the owner:
https://claude.ai/artifact/KyDXe2GUJGeHdeue2pfUv3, seven boards). The decisions below were the
owner's, in that session; the rest is a proposal to be argued with. Read
[`animation-tab-design.md`](animation-tab-design.md) and
[`animation-overhaul-handoff.md`](animation-overhaul-handoff.md) first: this builds on what they
built and does not replace it.

## Why

Animation in CEditor is real and well tested, and it all belongs to one control. A control's
`Animations` section holds three kinds (`ANIMATION_KINDS` in `utils/animationModel.js`):
`transition` (a state change eased), `keyframes` (a loop of poses, CSS-played) and `sequence`
(tracks on a time axis, played by anime.js). They are edited in the dock's Animation tab, which
opens 420 px tall under the canvas. Three things follow from that, and the owner's examples showed
each of them.

1. **Nothing spans controls.** A sequence animates the parts of its own control. A panel intro, an
   idle loop, or the "demo mode" in [`product-ideas.md`](product-ideas.md) ("the program plays
   itself… panel animating") cannot be made.
2. **The dock is too small for timeline work.** The tab's own record says the tab never scrolls,
   seven tracks show before the list does, and the 2026-10-04 redesign dropped the overview
   timeline to make room. That redesign began with the owner calling the tab "quite shitty, not
   user friendly, too small letters".
3. **Text and images move only as whole blocks.** There is no letter-by-letter effect (typewriter,
   explode), no scrolling tiled image, and no wipe. The only scrolling text and waves are the
   dot-matrix Display's presets (`wave`, `scanner`, `rain`, `starfield`, `spinner`, `plasma` in
   `sections/DisplayEditor.svelte`).

The examples. A knob whose label swaps between its name and its value five ways — a crossfade on
press, the name typed back in on release with its letters arriving pale and turning red, a vertical
roll on hover in and out, a peek on resting hover, a horizontal push on press and release. And a
label, "Wave", over a chrome gradient with a sine wave behind and in front of the text. The owner
explained how the earlier program did it: the wave was **one short single-colour image, tiled,
tinted on the fly, scrolled in any direction, in front of or behind the text, several at once**;
the text was **real text**, which could fade, move in any direction at any speed and change colour
or gradient, from a large library of effects. Those two sentences are most of this design.

## Decided (2026-11-24, the owner)

| Question | Decision |
|---|---|
| A separate editor? | Yes, a document tab like the others: the **Animation Designer**, beside the Device Profile Designer, the Component Designer and the Behavior Designer. The dock tab stays for quick work on one control. |
| Does the design canvas play animations? | Only under the playhead. It never moves on its own; you cannot edit what will not sit still. |
| Today's transitions, keyframes and sequences | **Separate and as a scene.** They stay on the control, edited in the dock tab as now. The Designer also lists each as a scene of that control, and a panel scene can use one as a clip. One animation, two views, never a copy. |
| Picking a target | It must be easy to pick the control or any part of it: `Knob01 › Background`, `Knob01 › Text › Colour`. |
| Short paths in scripts | Accepted where one exists: `Knob01.Text.colour` beside `Knob01.Text.Fill.colour`. |
| Presets | Users save their own. Applied presets are **linked by default**, as controls follow a control set. |
| Mouse over, exit, press | Through **states**, not a new mouse layer (below). |
| Changing the C++ script runtime | Allowed where new events need it to reach scripts (`onLongPress`, `onFlick`), and beyond that where a step needs it. |
| How the work arrives | Step by step on the working branch, each verified locally, with a draft pull request at the end of each step. |
| The first text effects | Typewriter, explode, roll, push, wipe, crossfade and shimmer, each in and out. More later. |
| The dock tab's preview | Plays when Play is pressed. Loops by nature (While in, patterns) keep running once started. |
| The name for a user's preset | "Animation preset" in the interface, `.ceanim` as a file, because "preset" already means a synth's sound here (HoSTage's Save preset, program banks, `.vstpreset`). |
| How much looping is too much | Measured in step 3 (below); the owner chose **ten moving loops a panel**, a gradient loop counting two, warned about and never refused, with "moving patterns at 30 frames a second" a switch in the Export tab. |

## The model

Five words, one model under both editors.

| Word | What it is | Example |
|---|---|---|
| **Effect** | A recipe with settings, from the library or your own presets. | Typewriter, Roll, Scroll |
| **Clip** | An effect on one target, with a start and a length. | Typewriter on Cutoff › Labels › Title, 1.0 to 2.2 s |
| **Track** | One target: a text, an image layer, a fill, a part, a control. | Wave › Background › Pattern 1 |
| **Scene** | Tracks from any number of controls on one time axis. | Panel opens, 2.4 s |
| **Trigger** | What starts a scene, or what drives its playhead. | Panel opens, a state, an event, a value, the beat, MIDI in, a script |

The library is presets of five **engines**:

| Engine | What it moves | Today |
|---|---|---|
| Text | Real text, whole or split into letters, words or lines, each piece a little after the last: fade, move, scale, turn, colour, gradient. | Whole text only. |
| Pattern | One single-colour image, tinted, tiled and scrolled in any direction, in front of or behind the content. Several at once. | Image layers have a `tile` fit (`BACKGROUND_FITS` in `utils/imageLayers.js`); nothing scrolls them and they are not tinted. |
| Paint | Solid colours, a gradient's stops, angle and position, image fills. | Solid colours fade; a gradient jumps. |
| Move | Position, size, turn and opacity of a part or a whole control. | Works: the paths in `PART_PATH_BUCKETS` (`utils/interactionRuntime.js`). |
| Value-drawn | What the value draws: pointer, arc, ring, fill. Takes over from the value for a moment, then hands back. | Not reachable: 42 renderers draw controls five different ways. |

**Where it is stored.** Per-control animations stay where they are. Panel scenes go at the panel's
root beside `scripts`, `fonts` and `icons` (`utils/panelDocumentSchema.js`) as `animationScenes` —
not `scenes`, which HoSTage already means something by (step 5a says why) — and the
presets a panel uses as `animationPresets`, carried the way `utils/documentFonts.js` carries fonts.
The schema allows unknown keys, so an older CEditor opens such a panel and ignores both; a schema
entry is added when a field earns one, as that file's header asks.

**Who plays it.** The design canvas: never by itself, the playhead poses it. The Designer's stage,
the dock tab's preview and Preview (F5): everything. The exported plug-in and the standalone app:
everything, because the same web code draws it. The plug-in window closed: nothing is drawn, and
value moves from scripts (`ce.anim.to`, `spring`, `envelope`) keep running and keep sending MIDI,
as now.

## Mouse over, exit, press: through states

The question was whether mouse animations need a binding layer of their own. They do not, because
CEditor already has one place that says what the mouse is doing. A state's **When** has seven
switches — Hover, Pressed, Focused, Dragging, Disabled, Checked, Mixed — and an optional rule over
the value (editor manual, chapter 8). Animation adds what states lack: how the control gets there
and what moves while it is there.

Every state gets a **Motion** section on the States tab with three slots:

| Slot | Plays | Stored as |
|---|---|---|
| Entering | when the state starts: mouse over, for Hover | a transition with `trigger.to` the state |
| While in | the whole time the state holds | a keyframes loop with a `stateChange` trigger, which already plays while its To state holds |
| Leaving | when it ends: mouse exit, for Hover | Entering played backwards (`trigger.reverse`, the default), or one of its own with the state in `trigger.from` and `trigger.leaving: true` |

Almost nothing new goes into the file: the same triggers get a place where they make sense. The one
addition is `trigger.leaving`. Building it showed why: the first try stored Leaving as "entering
`default`", and that never fires on a knob, which rests in a state of its own (`ActiveHandleCurrent`)
and so never enters `default` when the pointer leaves. A preset
fills a slot in one click. A scene is for more than one control, and its trigger can be the same
state ("Knob01 enters Hover"). A state with a rule animates a threshold the same way: a state
`Hot`, rule `value > 100`, Entering Flash, While in a glow pulse. The owner's name ↔ value swap is
the Dragging state: Entering pushes the value in, While in follows the knob, Leaving types the name
back.

Gestures with no duration cannot be states: click, double-click, long press, flick, a wheel turn.
They get one slot each, **Plays on**, in an **Events** row under the states.

What does not change: the Interact tab's behaviours (Pointer, Keyboard, Wheel, Snap) and grab areas
turn the mouse into a value, as now. Animation only listens to the states and events they produce.

## Gestures that drive a scene

A scene's clock is time by default. It can instead be the control's value (today's sequences already
follow a value), the pointer's x or y over the control, a drag, or the wheel. The scene maps the
input to its own length ("drag up 0 → 130 px moves the scene 0 → 100 %"), follows it exactly,
smoothly or on a spring, and on letting go springs back, stays, or carries on with the drag's
speed. The mockup's example is a cover dragged up to show the controls under it.

Rules:

- A gesture the control already uses is **shared, never taken.** Dragging Knob01 still turns it; a
  scene on that drag follows along, and the editor says so when it is picked.
- A gesture is heard on the part picked, with the same path bar, or on the whole control.
- Wheel gestures need the control's Wheel switch on; it starts off on buttons, toggles and pads.
- Touch and pen give the same gestures as the mouse.
- With reduced motion on, a driven scene still follows the hand. Momentum after a flick does not
  play.

## Picking a target

A target is a path from the control down: control, then section or part, then property. The
sections and parts are the ones CEditor has — Background, Text, Layout, and a knob's Body (housing,
cap, track fill…), Pointer, Ticks and Labels (title, value, unit…), from `SLIDER_SEMANTIC_PARTS` in
`utils/sliderControlPart.js`. The same path is shown everywhere a target appears: the clip's
settings, each track header, the dock tab, the Values tab of the script editor.

Three ways to pick:

- **On the stage.** Hover outlines what is under the pointer and shows its path. Click picks the
  control; double-click goes one level in; Ctrl+click goes straight to the smallest part under the
  pointer; Esc goes one level out; Tab moves to the next part of the same control.
- **The path bar.** `Knob01 ▾ › Text ▾ › Colour ▾`, each step a list of its neighbours, and a field
  that takes a typed path ("knob01 text col").
- **The column browser.** Controls, then parts, then properties. Properties the chosen effect
  cannot drive are greyed with the reason.

Dropping an effect from the library onto the stage lights the part under the pointer with its path.
When the effect could mean more than one thing ("Flash" on a knob: which colour?), it asks once at
the drop.

In scripts the path is written with dots. A **short path** leaves out a step that can only be one
thing: `Knob01.Text.colour` for `Knob01.Text.Fill.colour`. A short path that could name two
properties is refused with a console error listing both, as other `ce.*` arguments are. Renaming a
control updates every scene that targets it.

## Presets

Saved at three sizes, from the Designer's clip settings or the dock tab:

- an **effect**: one clip's settings;
- a **recipe**: several clips on one control (the name ↔ value swap);
- a **scene**: several controls (a ring sweep over any knobs, 0.15 s apart).

The save dialog takes a name, a category and tags; where to keep it (my library, or this panel
only); whether to keep its colours or take the colours of the control it is applied to; and shows
what the targets become. Targets are saved relative to the control: "Cutoff › Labels › Title"
becomes "the control's title label", so the preset goes on any control that has one, and the dialog
says which kinds of control those are. A scene's controls become slots filled when it is applied.

**Linked, as control sets are** (editor manual, "Control sets"). A clip made from a preset follows
it. A setting changed on the clip is an override, marked with the bar and bold label the properties
panel already uses, with Revert beside it. **Apply to preset…** writes the overrides into the
preset, and every clip that follows it changes, in one undo step; **Clear overrides** and **Detach**
work as they do for a control set. Built-in presets are read-only; editing one saves a copy.

The library shows Built-in, Mine and This panel, each card with a preview recorded from the stage.
A panel carries every preset it uses, as it carries its fonts, so the exported plug-in and other
machines play it; opening a panel that carries presets you lack offers to add them to your library.
A preset exports and imports as a file of its own. Deleting a preset leaves each panel that carries
it its own copy.

## Scripting

What exists stays as it is: `ce.anim.to`, `spring`, `envelope`, `stop`, `pause`, `resume`,
`reverse`, `finish` move values and run with the window open or closed; `ce.anim.play(control,
animation)` plays one control's keyframe animation, panel window only.

Proposed:

| Call or event | Runs | Does |
|---|---|---|
| `ce.anim.play(scene [, opts])` | panel window | One argument plays a panel scene; `opts.done(completed)` as `ce.anim.to` has it. The two-argument form is unchanged. |
| `ce.anim.effect(target, effect [, opts])` | panel window | A library effect or a preset, by name, on any target, without a scene. |
| `ce.anim.swap(target, text, effect [, opts])` | panel window | Swaps a text with a transition (roll, push, wipe, crossfade). |
| `ce.anim.pattern(target, opts)` | panel window | A pattern layer's tint, speed and direction, live. |
| `ce.anim.seek(scene, position)` | panel window | Moves a scene's playhead, 0 to 1: a script-driven gesture. |
| `onLongPress(mouse)`, `onFlick(flick)` | panel window | Beside the existing `onClick`, `onDoubleClick`, `onPointerDown/Move/Up`, `onHoverStart/End`, `onWheel`. `flick.direction`, `flick.speed`. |
| Timeline markers | panel window | Call an action registered with `ce.core.action`. |

None of them sends MIDI. With the window closed the drawing calls return false and nothing waits
for later, which is what `ce.anim.play` does today. They are declared in `panelApi.js` and reach
all seven languages through `tools/scripts/gen-script-modules.mjs --write`; on the C++ side that is
the window-closed stub list in the preludes, a regenerated region. The Values tab offers library
effects and presets, each with its preview, for an effect's name, and the path bar for a target.
The scene, effect and path names are the same strings the Designer shows.

## Rules for every effect

1. A visual effect never sends MIDI. Only value moves do, and the editor marks them.
2. Effects on a control stand aside while it is dragged, as transitions already do.
3. Reduced motion is honoured; loops stop while the window is hidden; the frame rate is capped.
   One looping pattern is nothing, ten plug-in windows each with one are not.
4. Every clip shows what it costs to draw — cheap, paint or layout — as the Animation tab's target
   rows already do (`targetCost`).

## Hard, and left out

These need a way of drawing the plug-in does not use, look different in WebView2 and WebKitGTK, or
cost too much in a DAW with many instances open. The route for any of them is the one the 3D part
already takes (`utils/scene3dRender.js`: three.js in the editor only, flat layers in the player):
render in the editor, play images in the plug-in.

- Live GPU effects: glow and bloom, heat haze, liquid distortion, smoke, fire, lit 3D text.
- Pixel filters every frame: animated blur, motion blur, text that warps.
- Text shattered into fragments or particles. Letters flying apart is the Text engine; hundreds of
  shards is a particle renderer.
- One word's outlines morphing into another's.
- Reacting to the sound: nothing sends the plug-in's audio to the panel today.

Two costs that are not exotic but are real. Letter-by-letter effects break kerning, ligatures,
accents and emoji if text is split naively, and break Arabic and Hindi outright: split by grapheme
(`Intl.Segmenter`, unused in `CE/web/src` today), place each piece where the browser's layout put it,
and animate whole words in scripts whose letters join. And value-drawn effects are per drawing
technique, so they come one control family at a time.

## Order of work

Each step is usable on its own, verified locally before it is pushed (`CLAUDE.md`), and run in the
real app under Xvfb where it draws.

1. **Targets and states.** The path bar, the picker and short paths; the Motion slots on the States
   tab and the Events row, over the triggers that exist. No new runtime. Long press and flick as
   events, with `onLongPress` and `onFlick`.
2. **The Text engine and text swaps.** Split, stagger, from → to; typewriter, explode, roll, push,
   wipe, crossfade, shimmer; a label that clips what slides out of it. The name ↔ value swap as a
   recipe on the Dragging state.
3. **Pattern and Paint.** Tinted, tiled, scrolling image layers in front of or behind; gradient
   stops and angle that animate. Check WebKitGTK for each CSS feature used, as `easing.js` already
   does for `linear()`.
4. **Presets.** Save at three sizes, the library, linked with overrides, carried by the panel,
   export and import.
5. **The Animation Designer.** The document tab: library, stage, settings, timeline; panel scenes
   in `scenes`; scene triggers and gesture clocks; the player plays them; `ce.anim.play(scene)`,
   `effect`, `swap`, `pattern`, `seek`, regenerated into the seven preludes.
6. **Value-drawn**, knobs first: a ring sweep that hands back to the value.

## As built: step 1 (2026-11-24)

Built on the working branch, verified as the next paragraph says. What it is, where it lives, and
what building it found.

- **The path bar** (`components/animation/PathBar.svelte`, over `utils/targetPaths.js`) replaced
  the Animation tab's two flat lists, On (every part by its internal name) and Change. Steps are
  the place (Whole control, Background, Text, Channels, a knob's Body, Pointer, Ticks or Labels, or
  a part by its own name), the part in a role group, and the property; a typed search ("text col",
  "cap scale", "Text.colour"); and Browse, the same levels side by side. Results and the browser
  float over the rows below: the dock is too short for them to push. The keyframe kind's Plays on
  uses it too. Target rows read as paths, the stored path kept as their tooltip and `data-path`.
  Nothing stored changed: every entry is built with `buildTarget` from `offeredTargetsFor`.
- **Short paths** in the path bar's search and in scripts' `get`/`set`: the web runtime's
  `resolveModelPath` and its C++ mirror in `PanelValueModel.h` try one only where a path as written
  leads nowhere, and an ambiguous one is refused with its candidates (`get`/`set` say them).
- **Motion on the States tab** (`sections/StateMotionSection.svelte`, `utils/stateMotion.js`):
  Entering, While in and Leaving for the state being edited, each listing what fills it, a chip
  opening that animation in the Animation tab, and New writing one. A new Entering or Leaving
  transition starts out easing the state's own overrides, so it does something at once.
- **The Events row**: click, double-click, long press, flick, wheel up and wheel down, each a
  keyframe animation with `trigger: { type: 'event', event }` (flick: `direction`, `speed`; long
  press: `hold`). `utils/gestureEvents.js` recognises them on the Preview surface, the exported
  player and the Animation tab's stage, and plays them through the same request `ce.anim.play`
  makes. The Animation tab's keyframe trigger has the Event choice with those settings.
- **Script events** `onLongPress(mouse)` (`mouse.held`) and `onFlick(flick)` (`direction`, `speed`,
  `x`, `y`), raised from the Preview and the player. No C++ change was needed: the C++ runtime
  dispatches any event by name and raises no pointer event itself.

Found on the way, and fixed:

- **A sequence never started on a state.** The tab writes trigger states lower-cased (`hover`); the
  runtime reports the States section's keys as written (`Hover`); the sequence player compared them
  as written. Its tests passed lower case on both sides. `keyframeModel.js` now ignores case, as the
  other two players do, with a test on a real knob's states.
- **Leaving needed one new field.** Stored first as "entering `default`", it never fired on a knob,
  which rests in `ActiveHandleCurrent`. `trigger.leaving: true` plays when a state in `from` is
  left (`transitionSelection.js`, rule 1); `readTrigger` passes it on, clash detection keeps
  leaving and entering animations apart, and the Animation tab's Trigger choice is State, Leaving
  or Value for a transition.
- **A Knob has no Background or Text section** of its own (its words are its Labels parts), yet the
  old list offered "the control itself › Text colour" for it. The path bar offers a section only
  where the control has one.

Not built in this step: picking on a stage by click, double-click and Ctrl+click belongs to the
Designer's stage (step 5); the dock tab has the path bar and Browse.

Verified locally: `npm run test:all`, `npm run build`, svelte-check (one warning, there before),
`npm run lint`, the Animation tab and panel-motion browser checks (the second drives a real click,
long press, flick and wheel at a button in the Preview), the C++ tests with scripting on, and
`PanelValueModelTests` with the short-path cases the web test has. Not run: the app under Xvfb,
and Windows, whose compiler is CI's to give.

## As built: step 2 (2026-11-24)

The Text engine, verified as the last paragraph says.

- **A fourth kind, `text`** (`utils/textEffects.js`), beside transition, keyframes and sequence. An
  effect is `effect` (typewriter, explode, roll, push, wipe, crossfade, shimmer), `way` (in or
  out), `split` (letter, word, line or whole), `order` (forward, backward, from centre, random),
  `stagger` in ms between pieces, `duration` per piece, and only where the effect has one a
  `direction` (roll, push, wipe), `scatter` and `scale` (explode) or a `colour` (typewriter's
  arrival colour, shimmer's light). It plays on the control's own words (`Text`) or a part's
  (`Parts.<name>`). Its triggers are a keyframe animation's — always, state, value, beat, script,
  event — and one of its own, `textChange`: when the words change, or only when they change to
  the value or to the name.
- **Pieces, not characters.** Words are cut by grapheme (`Intl.Segmenter`), so an accented letter
  or an emoji is one piece; in scripts whose letters join (Arabic, Devanagari and the rest named
  in `JOINING`) a letter split falls back to words, since a letter cut out of its word changes
  shape. Each piece is an inline span with its own CSS animation and a delay from its rank; the
  keyframes are generated per effect, named `ce-tx-<hash>-…`, and an in effect fills backwards so
  nothing shows before its turn. Random order is seeded from the words, so it is the same every
  time those words play.
- **Where it draws.** A control's HTML text, line by line, and a custom component part's text
  (`InteractivePartRenderer`). Text the canvas draws as SVG — an outline, a glow, a gradient
  fill, text on a curve — plays the effect on the whole text block instead; the hint in the tab
  says so. The text box clips what an effect moves out of it (`overflow: hidden` on the content),
  which is the label clipping the plan asked for.
- **The player** draws with the same `PanelPreviewSurface`, so effects play in the plug-in as in
  the Preview. A Label with animations is not folded into static scenery (`staticPartBaking.js`
  already refused anything with an Animations section).
- **`ce.anim.play(control, name)`** plays a text effect as it plays a keyframe animation; its
  refusal names both ("The animations it can play: …"), and the Values tab's check agrees. The
  manual, help bundle and API explorer are regenerated; the seven preludes did not change, since
  the call did not.
- **The Animation tab**: Text is a fourth Kind. Its pane (`components/animation/TextEffectEditor`)
  has Effect with In/Out, Cut into, Order and ms apart, then what the effect has — Moves, Flies,
  Arrives in or Light — and Plays on, the path bar narrowed to the words and the parts with text.
  The duration reads "Each piece". The trigger list adds "Words change", with Waits for: any
  words, the value, the name.

**The name ↔ value swap is built on the words, not on the Dragging state**, which is a change from
the plan above, for a reason found in step 1: a knob draws no words. Its name and value are Labels
attached to it, and a Label has no Dragging state — the knob has. So:

- a Label gets a new `Text.shows` mode, `nameValue` ("Name, value while touched, of"): it shows its
  source's name, and its value while the source is pressed or dragged. The surface writes which
  one it is showing to `Text.shownAs` (`labelText.js` `shownAs`);
- the recipe (`nameValueSwapPatch`, the "Name ↔ value" button in the Presets strip) writes four
  effects onto that Label, each waiting for its words: on a press the value pushes in from the
  left as the name is pushed out to the right, and on release the value crossfades out while the
  name types back in, 150 ms later, each letter arriving pale pink and settling to the Label's
  colour. Every one of them is an ordinary text effect, editable in the tab afterwards;
- an out effect needs the words that are leaving, which are already gone from the model. The
  canvas keeps a snapshot of the old words and their styles — a ghost — plays the out effect on
  it over the new words, and drops it when the effect has run. Per-line styles on the ghost are
  approximate, which is visible only when the two sets of words are styled differently;
- the button works on the Label itself, or on the armed control's attached Label showing
  `nameValue` or its name; with neither it says what to make first, and writes nothing.

**Found on the way, and fixed: a Label could not be given an animation at all.** A Label has no
Animations section, and a write to `Animations.<name>` on a control without one was dropped without
a word — the tab's Add, the States tab's Motion slots and the recipe all silently did nothing on a
Label. `animationModel.js` `animationsPatch` writes the whole section from its defaults when it is
missing, and all three use it.

Not built: hover peeks (an effect shown while the pointer is over its row), text drawn by a
slider's handle label or a control's own anatomy (a knob's tick labels), and shimmer as anything
but a sweep, once or looped. Saving an effect as a preset is step 4.

Verified locally: `npm run test:all`, `npm run build`, svelte-check (the one warning from before),
`npm run lint`, and the Animation tab and panel-motion browser checks. The second plays a
typewriter from a script on a Label in the Preview and counts its animated letters, then presses
and releases a knob whose name Label carries the swap, and checks the value pushing in over the
name's ghost and the name typing back. Not run: the app under Xvfb, so WebKitGTK has not drawn an
effect yet (see Open), and Windows.

## As built: step 3 (2026-11-24)

Pattern and Paint, and the loop budget's measurement.

**Paint: a gradient that eases** (`utils/gradientPaint.js`). A fill gradient was one `background:
linear-gradient(…)`, which CSS cannot blend, so a state that turned it swapped the picture at the
end. It is now written with its angle, centre and stops in custom properties registered with a type
(`<angle>`, `<color>`, `<percentage>`, not inherited), which interpolate: a transition on the colour
timing glides the angle, the centre and every stop's colour and place. The stop list is padded with
copies of its last stop to 4, 8 or 12, so two states of one gradient share their declaration and only
the properties move. What still jumps: a change of type, a mesh or square ramp, more than twelve
stops (with edge hardness, which triples them, five stops is already thirteen). All three painters
write it — the background's gradient layer, a fill absorbed onto the control or a part, a round
shape's gradient layer — through `gradientBackgroundCSS`, which falls back to `gradientToCSS`.

- **A loop.** Keyframe frames gained `turn` (degrees added to the angle) and `shift` (percent added
  to every stop), played on a fifth channel, `gradient`, beside paint, shape, stroke and text, and
  carried as `--ce-kf-gradient` to the layer that paints the gradient. The frames editor shows them
  where the control's fill has a gradient. The **Gradient sheen** preset is the one-click use.
- **A target.** "Background › Gradient" for transitions, on the colour timing; the tab's note now
  says a gradient glides. Not offered to a sequence, which moves numbers and colours along a track:
  it says so if one is given.
- **The same picture.** The visual golden's summary puts the properties back before it compares,
  and the GAIA fader's gradient came out byte-identical: the eased form draws what the old one drew.
  `gradientPaint.test.js` holds every type to `gradientToCSS` the same way.

**Pattern: one tile, tinted, tiled, moving** (`utils/patternLayers.js`, `PatternLayers.svelte`,
`sections/PatternsEditor.svelte`). `Background.Patterns` holds any number, each a tile (ten built in:
four waveforms, dots, stripes, grid, checks, chevrons, scan lines; or an image read into the panel
as a data URL — never a path, which would not reach the plug-in), a tint, opacity, size, repeat
(everywhere, a row, a column), placement, offset, blend, flips, and **behind** the content or **in
front** of it. The owner's "Wave" is a sine row behind the word and dots in front of it.

- **Tinted** by being a mask: the element is filled with the tint and shows only where the tile is
  opaque, which is "a single-colour image, tinted on the fly". The tint is `background-color` on the
  colour timing, so it is a target too: "Background › Pattern 1 tint".
- **Moving** without repainting: a mover one tile in size slides by its own width and starts again,
  carrying a painted area a tile larger than the control on every side. A translate is composited;
  a diagonal is two movers, each looping on its own axis. A row moves only along itself, a column
  only down itself, and the editor says so when the direction would hold it still.
- **Where it moves**: in Preview, on the Animation tab's stage, in the player. On the design canvas
  it is drawn still (the owner's rule: the canvas never moves on its own), and under reduced motion,
  the operating system's or the Preview's own.
- **Never folded into a still.** A Label is scenery and scenery is a still picture; a Label with a
  pattern is kept live (`sceneryModel.js`), and a custom component's part with one is never baked
  (`staticPartBaking.js`).
- Saved whole, as Animations are: the type's defaults have no Patterns, so nothing else in a saved
  panel changed.

**WebKitGTK, checked.** A probe of each feature, read mid-animation rather than asked of
`CSS.supports`, in WebKitGTK 2.52.6 (Ubuntu 24.04's) and Chromium 158: registered properties
interpolate inside a gradient and in keyframes, `clip-path: inset()` and the `translate` property
animate, `mask-image` works both prefixed and not, `steps(n, jump-end)` is understood. Then the
panel-motion fixture itself in WebKitGTK, the real components: the chrome button's gradient was at
168.84° and a stop half-way to red mid-hover, then 270° and red; the conic gradient's turn moved; the
Wave's sine drew behind the word and the dots in front, both movers advancing. Where registration is
missing (WebKitGTK before 2.40) the same CSS draws the same gradient and jumps, as before.

**The loop budget, measured** (`tools/scripts/measure-loop-budget.mjs`). Pages of 200 × 60 labels,
each with one loop, written by the renderers' own functions; CPU of the browser's whole process tree
as a percentage of one core, 8 s a sample, on a 4-thread container with no GPU — both engines draw in
software here, which makes compositing dearer than on a desktop with a GPU, so read the numbers as an
upper bound and the ratios as what carries over. Idle: Chromium 4.9 %, WebKitGTK 3.5 %.

| Loops on a panel | 1 | 5 | 10 | 25 | 50 |
|---|---|---|---|---|---|
| Chromium, a moving pattern | 10.7 | 13.1 | 17.5 | 27.6 | 45.6 |
| Chromium, the same at 30 fps | 8.1 | 10.2 | 12.1 | 19.1 | 29.3 |
| Chromium, a diagonal (two movers) | 10.7 | 14.6 | 18.5 | 32.1 | 53.7 |
| Chromium, a turning gradient | 14.2 | 21.4 | 27.2 | 51.1 | 87.1 |
| Chromium, mask-position (not taken) | 13.9 | 22.7 | 29.4 | 47.5 | 82.8 |
| WebKitGTK, a moving pattern | 15.9 | 22.7 | 33.2 | 64.3 | 100.9 |
| WebKitGTK, the same at 30 fps | 10.7 | 14.5 | 19.5 | 34.5 | 58.5 |
| WebKitGTK, a turning gradient | 15.5 | 22.4 | 32.4 | 58.9 | 100.8 |

What it says. A still pattern costs nothing measurable, even fifty. The first moving loop costs the
most — it keeps the window drawing sixty frames a second: +6 % of a core in Chromium, +12 % in
WebKitGTK here — and each one after it about 0.7 % (Chromium) and 1.7 % (WebKitGTK). A 30 fps cap
saves about 40 % in both. In Chromium, moving by translate costs half what moving the mask does, which
is the reason for the movers; in software WebKitGTK they cost the same. A turning gradient is
repainted every frame and costs about twice a pattern. Frame rate held at 60 up to 25 loops in both,
and fell to 56 at 50 in WebKitGTK. And the rule the design began with holds: ten plug-in windows
each with one loop pay the first loop's cost ten times (60 % and 120 % of a core here), where one
window with ten pays it once.

**The number, for the owner to decide**: ten moving loops a panel, a turning gradient counting as
two. Under it the cost here is at most +13 % of a core in Chromium and +30 % in software WebKitGTK;
over it the editor would say so, not refuse. With it, two choices: whether the exported plug-in caps
loops at 30 frames a second (−40 %; the cap is built, `fps` on `PatternLayers`, and not switched on),
and whether the warning counts windows as well as loops. Nothing enforces a number until the owner
picks one.

Found on the way, and fixed:

- **The type check had stopped checking.** svelte-check, like TypeScript's editor service, disables a
  project whose `.js` and `.svelte` files pass 20 MB, then reports success on the few files it
  opened. This project was within a few hundred kilobytes of the line, and this step's code crossed it:
  "1921 FILES 0 ERRORS" became "73 FILES 0 ERRORS". `jsconfig.json` now sets `disableSizeLimit`, a
  test holds it there, and the first full run found a real slip in this step's own Patterns section.
- **A part's absorbed fill** spread a colour list that some callers leave unset; the panel-motion
  fixture failed to mount at all until it did not. An absorbed fill now plays the one channel its
  fill needs: a colour's, or a gradient's.

Not built: image fills that animate (Paint's last item), a pattern's opacity, size or speed easing
between states (they switch; its tint fades), patterns in front of a part's content (behind works,
through BackgroundRenderer), and `ce.anim.pattern` (step 5). A script can already set any pattern
field by path: `set("Wave.Background.Patterns.pattern1.tint", "FFFF0000")`.

Verified locally: `npm run test:all`, `npm run build`, `npm run lint`, svelte-check over the whole
project (1,925 files; the one warning from before), the Animation tab and panel-motion browser checks
in Chromium, the panel-motion fixture's Pattern and Paint controls in WebKitGTK, and the loop budget
in both. No C++ changed. Not run: Windows, and WebView2 itself — Chromium is its engine, not it.

## As built: step 4 (2026-11-24)

Animation presets of your own: saved, kept, applied linked, carried, shared as files.

- **The model** (`utils/animationPresetModel.js`). A preset is data, so it carries what its
  animations depend on: the animations themselves (as the control stores them, without the link),
  the state changes they ease — only those: a hover lift takes the Hover state's scale, not the fill
  colour Hover also sets — and the settings a recipe needs (the name ↔ value swap's
  `Text.shows`). Targets were already relative to the control, so "Cutoff › Labels › Title" is
  "the control's title label" with nothing to translate; `presetNeeds` names the states, parts and
  sections a control must have, and the save form says before saving which kinds of control those
  are. Two sizes: an **effect** (one animation) and a **recipe** (all of a control's). A **scene**
  waits for panel scenes, in step 5. **Colours**: keep them, or leave colour to the control, which
  carries no colour at all — no frame colour, no colour a state sets.
- **Linked, as a control set is, and as text styles are.** Applied linked, each animation is written
  whole, so the player and an export need nothing new, with `preset: { id, revision, from }`. An
  override is a setting that differs from the version it follows, worked out, not stored — the text
  styles' way rather than the control set's pins. A new version reaches every follower but what
  each overrode. Revert, Clear overrides, Detach and Apply to preset are each one undo step, which
  puts every follower and the panel's copy back together.
- **Where they live** (`stores/animationPresetLibrary.js`). Built-in: the code presets, applied as
  before. Mine: this machine's storage (localStorage, as control sets, card presets and saved scripts
  are; app settings drop keys they do not know). This panel: `animationPresets` at the document's
  root, written as soon as a preset is used there, because the panel's copy is what its linked
  animations follow — which is also how it reaches another machine and the plug-in, and why taking a
  preset out of your library leaves every panel its copy. Saved on the "right or absent" rule, each
  entry checked as it is read; declared in the document schema, the validator regenerated.
- **Shared as a file.** `.ceanim`, JSON, through the typed-document bridge the CTRL49 screen uses —
  one C++ line, the kind in `typedDocumentKind` — and in a plain browser a download and a file input.
  A file from a newer CEditor, or one with a kind this one cannot play, is refused with the reason.
  The same preset in the same or a newer version is not imported twice.
- **Offered, not taken.** No other carried thing (fonts, icons, card presets, control sets) offers
  itself to your library; the `adopt` functions that exist have no callers. A panel carrying presets
  you lack says so in the library, with **Add to my library**. Your library's newer version of a
  preset the panel carries is offered on the card ("Bring it in") and in the library ("Update
  panel"), never applied by itself.
- **The tab.** **Save as preset…** beside Debug; the card above Kind on a linked animation, its
  overrides marked as the properties panel marks a control set's (the bar, the bold name), each with
  Revert; **Library…** at the end of the presets, an overlay of Mine and This panel. And a Label,
  which starts with no Animations section, now gets **Give it animations** where the tab used to say
  only that it had none — steps 2 and 4 both put animations on Labels.

Found on the way, and fixed: **preparing an export broke under plain Node.** The saved document
reads every preset a panel carries, and the first version did it by importing the preset model —
which brings the interaction runtime, which has an import only the bundler resolves. The Windows
export job runs `prepare-export-panel.mjs` under plain Node, and it stopped at that import; the suite
caught it (`exportToolsPlainNode.test.js`). The format — reading, checking, writing a preset — is now
`utils/animationPresetFormat.js`, which imports nothing, with its two copied facts (the animation
kinds, the rule for a name) held to the model's by a test.

Not built: previews recorded from the stage on each card (the library shows name, category, size and
version), scene presets (step 5), and an offer at the moment a panel opens rather than in the
library. Built-in presets are not linkable; save the applied result as your own to link it.

Verified locally: `npm run test:all`, `npm run build`, `npm run lint`, svelte-check over the whole
project, the browser checks (the Animation tab check now saves a preset from the tab, overrides and
reverts a setting, applies a linked copy from the library, exports a real `.ceanim` download and
imports one through the file picker, and adopts a preset a panel carried), and the one C++ change
compiled with GCC (`-fsyntax-only`, as `CLAUDE.md` gives it). Not run: MSVC, and the app's own file
dialogs, which are the CTRL49 screen's already.

## As built: the loop budget (2026-11-24)

The owner's answer to step 3's measurement: ten, a warning and not a refusal, and asked how it is
given. Not a popup — that interrupts and is clicked away — but the three places CEditor already
says such things, each in its own words, each a click away from the loops themselves:

- **The status bar** (`layout/StatusBar.svelte`): `4 loops` while the panel has any, amber and
  `12 loops · 10 is the budget` above it, as the MIDI item turns amber when its port cannot send.
- **The Animation tab's chips**: `Panel: 12 loops`, beside "2 targets do nothing" and "1 clash".
- **The Export tab**, which Export Plugin opens: a section, Animation, whose note says the count —
  and above ten that each open plug-in window uses more processor time than ten would, and that the
  plug-in still builds.

Each one's tooltip lists the loops ("Wave › Pattern 1", "Chrome › sheen (counts 2)") and each click
selects the next looping control with the Animation tab open on it (`stores/loopBudgetStore.js`).
What counts is `utils/loopBudget.js`: a moving pattern, a looping keyframe animation (a gradient
loop counts two), a looping text effect or sequence; a loop that plays while a state holds counts,
since it is what the panel can be doing.

The owner's second question — count the plug-in windows? — has no number to count: the editor
cannot know how many windows someone opens, so the Export note says each open window pays it again.

**Patterns at 30 fps**, the Export tab's switch (`exportSettings.patternFps`): off by default. The
player reads it as it loads the panel (`stores/patternFrameCap.js`) and moving patterns step thirty
times a second, about 40 % less processor time in both engines; keyframe animations keep their
easing, which steps would break. The editor's Preview always moves them every frame.

## As built: step 5a (2026-11-24)

The Animation Designer, the document tab of its own. Step 5 is three: **5a** the Designer, where a
scene is made and posed under the playhead; **5b** panel scenes playing on their triggers in
Preview and the plug-in; **5c** the scripting calls and the gesture clocks.

- **A tab, one per panel** (`stores/panels.js`: `openAnimationDesigner`, `closeAnimationDesigner`).
  It is reached from File › Animation Designer, from the tab strip's **+** tray, and from the
  maximize button at the top of the dock's Animation tab. It shows as "Animation · Wave Demo", owns
  the window's chrome as the device profile designer does (`utils/workspaceChrome.js`), and closes
  with its panel. In front, it is **not the active panel**: `resolvePanelSelection` gives none, so
  paste, insert and Delete never reach a panel nobody can see, and every write goes by the panel's
  id (`updatePanel`, `applyControlPatchesById`). Save, with it in front, saves that panel.
- **The model** (`utils/sceneModel.js`). A scene is a name, a trigger (panel opens, a state, an
  event, the beat, a script — stored now, played in 5b), a length, a loop flag and clips; a clip is
  one effect on one place of one control (the whole control, its text, or a part) with a start and
  a length. The checking and the reading are `utils/sceneFormat.js`, which imports nothing, for the
  reason step 4 found: the saved document is read under plain Node by the Windows export job.
- **One animation, two views, never a copy.** The scenes list shows the panel's scenes and, under
  them, **Controls' own**: every control's existing keyframe and text animations, each as a scene of
  one clip (`controlScenes`). Moving or stretching that clip writes the animation's own delay and
  duration, its settings write the animation; it takes no new clips, and says so.
- **The library** is the built-in effects by category — Text, Swap, Move, Paint — and **Mine**, your
  presets. Drag a card onto a control on the stage or onto a track; click it to put it on the picked
  control. A text effect on a control with no text of its own is refused with the reason.
- **The stage** is the panel's own preview surface, with Preview mode off, so nothing on it turns,
  presses or sends; a layer above it picks controls and takes drops. **Try a trigger** holds Hover or
  Press for a moment, which is how a control's state animations are seen without Preview.
- **The timeline** (`SceneTimeline.svelte`): a ruler that scrubs, a track per place, clips that drag,
  copy with Alt, stretch by the grip, nudge with the arrows and go with Delete, all snapped (10, 50 or
  100 ms). A scene is never shorter than its clips.
- **Clip settings** (`ClipSettings.svelte`): where it plays, start, length, each piece's length for
  text, easing, and the effect itself in the same text effect editor and frames editor the dock tab
  uses. **Save as preset** keeps the clip's effect in your library (`saveEffectAsPreset`), unlinked.
- **Playing, which is only ever the playhead.** As the owner decided, the stage plays a scene by
  posing it: the playhead's time is handed to every control through a context (`stores/sceneStage.js`),
  and each clip becomes the same CSS keyframes the controls already play, held at that moment —
  `animation-delay` set back by the time and `paused`, so the browser draws the exact frame with no
  per-frame script (`timing(…, { at })` in `keyframeAnimation.js`, `textPieceStyles(…, { at })`). Play
  moves the playhead at ¼, ½ or full speed. A control a scene moves is never folded into the panel's
  still scenery, as a control a script touches is not.
- **Undo is the Designer's own** (`registerHistoryContext`, kind `animationDesigner`), over the scenes
  and the animations of the controls that have any — not the panel's whole history.

**Why `animationScenes` and not `scenes`.** HoSTage, the instrument host, already has scenes: a
snapshot of its parts. A panel key named `scenes` would read as one of those to anyone who met it in
a file, and would collide the day a panel carries host state. Saved on the "right or absent" rule:
a scene that does not read as one is not written, and a panel with none writes no key. Declared in
the document schema, the validator regenerated.

Not built in 5a: playing on a trigger outside the Designer (5b), the gesture clocks and
`ce.anim.play` (5c), pattern and value-drawn clips (a pattern's scroll is still set on its layer),
and scene presets.

Verified locally: `npm run test:all`, `npm run build`, `npm run lint`, svelte-check over the whole
project, and the browser checks, among them a new one, `animationDesigner` (12 checks): it makes a
scene, picks a control on the stage and puts an effect on it, has a text effect on a knob refused,
scrubs and finds the stage posed (paused, the delay moved back), drags a clip on the grid, undoes,
copies with Alt, plays, retimes a control's own animation in place, and finds the scene in the saved
document. The tab itself — opening, naming, closing with its panel, never the active panel — is held
by `test/animationDesignerTab.test.js`. The same page in WebKitGTK 2.52 under Xvfb: the stage posed
as in Chromium (the knob's fade paused 0.24 s in, each letter held the same way). No C++ changed.
Not run: the Designer inside the real app, which waits for 5b, when there is something on a trigger
to see.

Found there, and left for a change of its own: in WebKitGTK the default knob draws as squares — the
cap a square, the value arc a box. Its fills are HTML in an SVG `<foreignObject>` cut by an SVG
`<mask>` (`editor/SliderShapeFill.svelte`), and WebKit does not apply a mask to a foreignObject. It is
so before any scene touches the knob, and Chromium, so Windows, is unaffected; the Linux app and the
Linux plug-ins are not.

## Open

Nothing for the owner at present.
