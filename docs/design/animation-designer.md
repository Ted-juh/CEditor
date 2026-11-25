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
slider's handle label or a control's own anatomy (a knob's tick labels; built since, below), and
shimmer as anything but a sweep, once or looped. Saving an effect as a preset is step 4.

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
Linux plug-ins are not. Fixed in the two commits after this one: the fill is drawn with no layer of its
own and cut by an SVG clip (`utils/shapeClip.js`, `editor/SliderShapeFill.svelte`), and `CLAUDE.md`
now has the rules WebKit taught; a plate's material and shadows became SVG filters on groups round
it, so all 1,515 slider fills of the 79 built-in sets draw in order. A third commit drew what a set
gave a shadow — LCDs, group frames, the Macro, XY pads, dropdowns, blank on Linux until the shadow
filter's region was given in fractions of its box — and every one of the 79 sets now draws in
WebKitGTK as in Chromium.

## As built: step 5b (2026-11-24)

Panel scenes play by themselves where the panel is live: the editor's Preview and the exported
plug-in, which are the same surface (`PanelPreviewSurface`, which `Player.svelte` mounts).

- **The runtime** (`utils/sceneRuntime.js`) says which scenes run and in which phase; each clip is
  the CSS animation its control already plays (`sceneControlOutput`, step 5a). Starting a scene flips
  its phase, which restarts all its animations. The surface owns one (`createSceneRunStore`,
  `stores/sceneStage.js`) and hands it to its controls as the context the Designer's stage uses, now
  holding a list of plays; every control draws each scene running on it.
- **Triggers.**
  - **Panel opens:** when the surface first shows a panel, and when it shows another. Preview mounts
    the surface each time it starts, so starting Preview plays the opening again.
  - **A control enters a state:** reported by the control itself, but only when some scene waits on
    it (`listeners.state`). It fires on each state that starts to hold, and `default` when the last
    one stops ("Back to Base"). Not on the first look, as the keyframe player does not.
  - **A gesture:** the Events row's recogniser (`utils/gestureEvents.js`) tells the surface through a
    new `onGesture` (click, flick, and a long press at the usual hold), and the surface reports the
    double-click and the wheel itself.
  - **The beat:** every so many beats while the transport runs, heard only when some scene waits on
    it. Not on the first look, so a transport already running does not set off every beat scene.
  - **A script:** waits for step 5c; the runtime's `start(idOrName)` is there for it.
- **The defaults put to the owner with step 5b's questions**, to be changed in `sceneRuntime.js` if
  the answers differ:
  - a scene that ends holds its last frame, posed and paused, so nothing keeps running;
  - a trigger that comes again restarts it from the top;
  - a loop starts again each time its length has passed;
  - with reduced motion, a scene goes straight to its last frame;
  - entering Preview plays the opening.
- **Not inside the Designer.** Its stage is a live surface too. A surface inside another's stage makes
  no runtime of its own, so there a scene still moves only under the playhead.
- **The Designer** now says what a scene waits for. A state scene picks its control and the state
  (the control's own list, from `buildStateTargetOptions`, plus Back to Base). An event scene picks
  its gesture, and a beat scene how many beats. Each scene's row names its trigger in words: "Cutoff
  enters Hover", "Click on Start", "Every 4 beats".
- **The loop budget** counts a looping scene's clips, 1 each and 2 for one that turns a gradient, as
  the controls' own loops are counted. Its click-through opens the Designer for a scene's loop.
- **Into the plug-in.** The export payload is the editor's own serialised panel, so it carries
  `animationScenes`. The C++ player hands the panel to the page as the JSON text it is, and the page
  reads it with `deserializePanel`. `test/sceneExport.test.js` holds both ends.

Verified locally: `npm run test:all`, `npm run build`, `npm run lint`, svelte-check, and the browser
checks, among them a new one, `scenePlayback`, run in Chromium and in WebKitGTK 2.52. It checks
that the opening scene runs by itself and then holds its end, posed; that a click and a hover start
their scenes, and a second click restarts one; that a loop restarts; that the Designer's stage stays
still; and that reduced motion goes straight to the end. `test/sceneRuntime.test.js` holds the
runtime's timing on a fake clock. No C++ changed.

## As built: step 5c, the script calls (2026-11-25)

Scripts reach the scenes, as the Scripting section proposed. Every call is drawn, not computed, so
it works only while the panel's window is open (`runtime: 'webview'`). The C++ preludes carry stubs
for them, regenerated by `gen-script-modules.mjs`. With no window, a call returns false and nothing
waits.

- **`ce.anim.play(scene [, opts])`.** One name is a panel scene, whatever its trigger.
  `opts.done(completed)` is true at the end, and false when the run is cut short by another start,
  a seek, or the scene going. The two-name form is unchanged, and a control's name alone still says
  that it wants an animation's name too.
- **`ce.anim.seek(scene, position)`.** Holds a scene, paused, at 0 to 1 of its length, so a script
  can be the scene's clock.
- **`ce.anim.effect(target, effect [, opts])`.** Plays a library effect, or one of the panel's
  presets, by name on a control, its `.Text` or a part. There is at most one such effect per place,
  so a new one replaces the last, and it holds its last frame. "Mine" presets are left out on
  purpose: they live on one machine, and a script naming one would fail in the plug-in.
- **`ce.anim.swap(target, text [, effect [, opts]])`.** The old words play the effect's "out"; then
  the new text is written and plays its "in". Cut short, it writes nothing and reports done(false).
- **`ce.anim.pattern(target, opts)`.** A pattern's tint, opacity, speed or direction, written as
  `set()` would write it.
- **How a script finds the surface.** The runtime gained done callbacks, `seek` and one-off effects
  (`utils/sceneRuntime.js`). A registry keyed by panel id (`registerSceneRun` in
  `stores/sceneStage.js`) lets a script, which knows its panel and not the surface, reach the live
  surface drawing it. The resolving of effects, targets and swaps is in `utils/sceneScript.js`.
- **The bundle.** `main` had crept back to its size limit (4,001 kB of 4,000), which exists to catch
  that. Two things every start parsed and few sessions use now load when asked: the Ctrlr panel
  importer, and the custom-component stress panel. `main` is 3,795 kB.

Verified locally:
- the full node suite, with the API's own checks passing: examples, the refusal table, the cost
  table, the scripting manual and the member count;
- `test/sceneScripts.test.js` and `test/sceneRuntime.test.js`;
- the browser checks this touches — `scenePlayback`, now including a script that plays, seeks,
  places an effect and swaps words; `animationDesigner`; `valuesSidebar`; and
  `behaviourCustomStress`, which opens the now-lazy stress panel.

Not run: the C++ engines with their regenerated stub lists (CI's Windows job compiles them).

## As built: step 5c, gestures that drive a scene (2026-11-25)

A scene's playhead can be a hand on a control instead of time, as "Gestures that drive a scene"
above planned.

- **The clock.** A scene has an optional `clock` (`cleanClock` in `utils/sceneFormat.js`):
  - `source`: `value`, `drag`, `wheel`, `pointerX` or `pointerY`. Time is stored as no clock;
  - `controlId`: the control it listens to;
  - `span`: pixels for the whole scene for a drag (130 by default), notches for the wheel (10);
  - `direction`: up, down, left or right, for a drag;
  - `follow`: exact, smooth or spring;
  - `release`: what a drag does when let go (stay, back or carry on), and what the pointer clocks
    do when the pointer leaves (stay or back).
- **The maths** is `utils/sceneClock.js`, pure. An input sets where the scene should be, 0 to 1;
  each frame moves what is shown towards it. Smooth closes about 63 % of the gap in 90 ms. The
  spring is damped a little under critical, so it overshoots by about 1 % and settles. A drag let go
  with **carry** keeps its speed, which falls to about 37 % in 300 ms.
- **The runtime** (`utils/sceneRuntime.js`) takes `input(controlId, kind, payload)`. A driven scene
  is always on show, posed at its clock's position. It is held at its start until the hand first
  moves it, and its value clock starts where the value already is. It never answers a trigger,
  `start` or a loop. It runs a frame loop only while some clock is still catching up, and stops
  when they have all settled. `seek` from a script puts a driven scene where it says, until the
  hand moves it again.
- **The inputs:**
  - a control reports its value when a scene listens to it (`CanvasControl.svelte`);
  - the preview reports the pointer over a control and its leaving, and wheel notches;
  - `watchGesture` gained `onDrag`: press, drag offsets in the panel's pixels, and the release
    speed. The press tracker's result now carries `vx` and `vy`.

  Each input is sent only for a control some scene listens to.
- **Shared, never taken.** Dragging a knob still turns it, and the scene on that drag follows
  along. The Designer says so when a drag or the wheel is picked on a control with a value.
- **Reduced motion.** A driven scene still follows the hand, since it is the hand, but exactly,
  and a drag let go does not carry on.
- **The Designer.** It has a **Driven by** select, with time first. Choosing a control replaces the
  trigger fields with the control, the span and direction, **Follows**, and what happens when let
  go. **Loop** is hidden for a driven scene, and the loop budget does not count one, since it moves
  only while the hand does.

Left out, for now:
- **A gesture heard on one part** rather than the whole control. The path bar already picks parts
  for clips; a clock on a part needs the part's own hit area, which the preview does not report.
- **The wheel switch** the plan mentions. The one controls have, `Behavior.wheelEnabled` on a
  range control, decides whether the wheel changes its value, and still does. A scene driven by the
  wheel on a control is an opt-in of its own: it hears the wheel on any control that is not
  read-only, and takes it there, so the page does not scroll under it.

Verified locally:
- `test/sceneClock.test.js` (new): the format, drag, release, follow and the runtime with frames
  that come only when told;
- `test/gestureEvents.test.js`, `test/loopBudget.test.js`, `test/sceneRuntime.test.js`,
  `test/sceneModel.test.js`;
- the browser checks `scenePlayback`, now with a drag that moves a scene 400 ms of 1,000 for 40 px of
  100 and keeps it there when let go, and a knob whose value moves another; and
  `animationDesigner`, which drives a scene by a drag and sets it back to time;
- the same drag in WebKitGTK 2.52 under Xvfb, posed exactly as in Chromium.

## As built: step 6, value-drawn, knobs first (2026-11-25)

The fifth engine: an effect that moves what a knob's value draws (its arc, its ring, its pointer)
for a moment, then hands back to the value.

- **Where it enters.** Every knob is drawn from the same value signals: the default knob and the
  control sets' knobs by `SliderFamilyRenderer`, which already chose the drawn value in one place
  (`glide ?? targetValues`, for the value glide), and the knob forms by `ControlAnatomy` (`p`, which
  the illustrated forms take too). Both now take a `drawnValue`, and `CanvasControl` works it out.
  Not "42 renderers five ways" for knobs, then: two, reading one number. Linear sliders draw
  through the same renderer, so they get it too.
- **The clip.** A new place, `Value` ("what the value draws"), and a new kind, `value`, which go
  together and only together (`cleanClip`). Frames are `{ at, value }` (a point of the range),
  `{ at, by }` (so far from the live value) or `{ at }` (the live value), eased per stretch as a
  keyframe animation is.
- **The engine** is `utils/valueDrawn.js`, pure. Drawn values are SVG attributes CSS cannot animate,
  so it is worked out a frame at a time, as the value glide already was. A running play's clock
  starts when the control first sees it, as its CSS animations do, and starts again when the play
  is restarted (its phase flips). Posed plays — the Designer's playhead, a seek, a scene a hand
  drives — give their moment themselves. The frame loop runs only while a value clip is ahead.
- **The promises.** It moves the drawing, never the value: nothing is sent, the readout says what
  the value is. A clip hands back when it ends, whatever the scene's last frame (a finished scene
  holds its last frame; a value clip's last frame is the value). Before it starts, it holds its first
  frame, as every clip does. While the control is dragged, the hand wins. With reduced motion a scene
  goes to its end, which is the value.
- **The library**, a **Value** category: Ring sweep, Rise to value, Fall to value, Reach full and
  back, and Wiggle. Each ends on the live value, which a test holds for every one.
- **The Designer.** A value effect goes on the control's Value track. It is refused, with the
  reason, on a control that draws no value (a range slider's two handles included). Its settings
  have a frame editor of their own (`ValueFramesEditor.svelte`), which warns when the last frame is
  not the value.
- **Scripts.** `ce.anim.effect("Cutoff", "Ring sweep")`: the control alone, or `Cutoff.Value`, is
  what its value draws. A value effect anywhere else, or another effect on `.Value`, is refused with
  the reason.
- **The loop budget** counts a looping value clip as two, since it is redrawn every frame, as a
  moving gradient is repainted. That is reasoning, not a measurement.

Left out, for now (the first two are built since: see "As built: value effects, finished"):
- **Saving a value clip as a preset.** Presets hold a control's own animations, and a value effect
  is not one of those yet; the button is hidden on a value clip rather than saving something that
  would not apply.
- **A control's own value animations** (the Animation tab's rows, on Hover or a click). A scene
  with a state or gesture trigger on the knob does the same today.
- **The other families:** the Macro's ring, meters, XY pads, envelopes, and custom components that
  carry knobs. Each draws its value its own way.
- **Scene presets**, such as a ring sweep over every knob 0.15 s apart.

Verified locally:
- `test/valueDrawn.test.js` (new): the format, frames, the sweep's shape, every library effect ending
  on the value, plays posed and running, the hand winning, which controls draw a value, and the loop
  budget; `test/sceneScripts.test.js` for the script call;
- the browser checks `scenePlayback`, where a script's ring sweep takes a knob drawn from parts, one
  drawn as a form and a linear slider from nothing to full and back to exactly the value, their
  handles moving with it, a seek holds it at full, and with reduced motion it goes straight to the
  value; and `animationDesigner`, where a ring sweep placed on a knob poses the stage where the
  engine says, and is refused on a Label;
- the checks over what the change touched: `anatomyForms`, `macroSetKnob`, `shapeClip`, `panelMotion`,
  `animationTab` and `playerInbound`, and the component harness's knob and slider cases;
- the same sweep in WebKitGTK 2.52 under Xvfb: 0.5, 0.999 at the peak, 0.5 after, for both knobs.

## As built: value effects, finished (2026-11-25)

The first of the things step 6 left out, taken up one at a time at the owner's request.

- **A control's own value animations.** The Animation tab offers a fifth kind, **Value**, on a
  control that draws a value (`animationKindsFor`); on anything else it is not offered.
  - It plays on the triggers a keyframe animation does, except "all the time", which would never
    let the value be seen. Switching to it makes a ring sweep on the place `Value`.
  - Repeat is a count or a loop, so a wiggle can run while the knob is hovered.
  - Its frames use the Designer's value frame editor.
  - The runtime reads it into the control's keyframe catalogue (`readValueAnimation`), and the keyframe
    player plays it like any other entry. It reports each value animation playing with the moment its
    run began. `CanvasControl` turns those into plays of a one-clip scene (`ownValuePlay`) and draws
    them under any scene's value clips.
  - The engine gained repeats for this: a clip may run a number of times, or loop.
  - `ce.anim.play("Cutoff", "sweep")` plays one, as it plays a keyframe animation; the script
    console's value check knows it.
  - The Designer shows each one under **Controls' own**, on the knob's Value track.
- **Presets.** The preset format holds the value kind. A CEditor from before step 6 refuses such a
  file, as the format means it to.
  - A value preset fits only a control that draws a value, and says so on anything else.
  - The Designer's **Save as preset** works on a value clip (category Value), and **Mine** gives it
    back as a value effect.
- **The loop budget** counts a looping value animation as two, as it does a looping value clip.

Verified locally:
- `test/valueDrawn.test.js`: the kind offered and switched to, the player reporting a run and its
  start, a delay then a sweep then the hand-back, a loop's third run, the Designer's view, a preset
  fitting a knob and a slider and refusing a Label, and the loop weight;
- `test/animationPresetFormat.test.js`: the preset kinds are the model's, the value kind included;
- the browser checks `animationTab` (a knob is offered Value and a custom component is not; picking it
  makes a ring sweep with its three frames in the value editor) and `scenePlayback` (Cutoff's own
  wiggle loops while hovered, within its 6 %, and hands back exactly when the pointer leaves); and
  `panelMotion`, `animationDesigner` and `anatomyForms`, which exercise the keyframe player and the
  knob drawers.

## As built: scene presets (2026-11-25)

The third size of preset, the one step 4 and step 5a left out: a whole scene, kept to use again.
The record's example is "a ring sweep over any knobs, 0.15 s apart".

- **Slots, not controls.** A scene names its controls by id, and a preset is for any panel, so a
  preset names slots (`utils/scenePreset.js`). There is one slot per control the scene used, in the
  order they first play; the trigger's and the clock's control get slots too. Each slot keeps what
  the control was (its type and name, for choosing) and what its clips need of whichever control
  takes it: words for a text effect, a value for a value effect, the parts a clip plays on. A slot
  fits a control that has what it needs, whatever its type.
- **Two ways back onto a panel:**
  - **Mapped:** a control per slot. `defaultMapping` offers one of the same type first, in reading
    order, and never the same control twice.
  - **Repeated:** a preset of one slot, on every control that fits, left to right, each a gap after
    the last (150 ms unless changed). This is allowed only when nothing on a control starts or
    drives the preset: a hover on which knob would start them all?

  Either way the result is an ordinary new scene, which the panel carries, so a panel needs no copy
  of the preset.
- **The library** is `stores/scenePresetLibrary.js`: yours, in this machine's storage, as your
  animation presets are. Two are built in: **Knobs sweep in** (the ring sweep, repeated) and
  **Labels type in** (the typewriter, on everything with words of its own).
- **The Designer.** The scene row has **Save as preset**. The library has a **Scenes** category,
  whose cards open a small panel to map or repeat (`ScenePresetPanel.svelte`); one of yours can be
  removed there, and scenes already made from it stay.

Left out: scene presets in files and carried by a panel, as animation presets are (.ceanim, "This
panel"). A scene preset's place for that is the same typed-document route; nothing has needed it
yet. (Built since: "As built: scene presets as files and carried by a panel", below.)

Verified locally:
- `test/scenePreset.test.js` (new): slots and their needs, no control ids left in a preset, fitting by
  what a control has, a mapping same type first, a trigger following its slot, a refusal that names
  the control, a repeat left to right 150 ms apart, and a hover-started preset refusing to repeat;
- the browser check `animationDesigner`: the built-in **Knobs sweep in** makes a new scene on the
  panel's one knob, and a scene saved as a preset comes back as a new scene with its clips on the same
  controls, offered same type first.

## As built: value effects on the Macro and meters (2026-11-25)

Step 6 did knobs first, and sliders came with them. The two other families that draw a value of
their own now take the same effects:

- **The Macro.** It has no Behavior section; its position is `Macro.__value`, or `value`.
  `MacroRenderer` takes `drawnValue` for its ring, its pointer and its lanes' bars. A Macro that
  hosts its control set's knob passes the drawn value to that knob's runtime.
  - Its numbers do not move: the figure under the knob and each lane's percentage keep reading
    the real position. WebKitGTK showed the figure at 99 mid-sweep before that was separated,
    which broke the promise the other families keep.
- **Meters and progress bars.** Their position is `meterPosition` of `Meter.__value` or `value`,
  on a linear or decibel scale. `MeterRenderer`, and the meter forms and meter parts the anatomy
  draws, take the drawn value as the needle's or the bar's place, 0 to 1 of the scale. A sweep
  up and back is the power-up needle test. The meter draws no reading of its own; its labels are
  controls of their own, so nothing there changes.
- **Which controls.** `controlDrawsValue` takes the Macro, the Meter and the ProgressBar by type.
  `liveDrawnValue` says what each draws now, to start from and hand back to: the Macro's position,
  the meter's place on its scale, or a knob's or slider's signals. Every refusal now names the four
  families.
- **Their own animations.** These work as on a knob: the keyframe catalogue does not care which
  family it is.

Verified locally:
- `test/valueDrawnFamilies.test.js` (new): the families, and each one's live value, a decibel scale
  included;
- `scenePlayback`: the Macro and a meter sweep with a scene and hand back exactly, the Macro's number
  unchanged at the peak. A meter's own value animation plays from `ce.anim.play` and returns to its
  reading;
- `macroSetKnob`, `anatomyForms`, `panelMotion` and `animationDesigner`;
- WebKitGTK 2.52: the Macro 0.28 → 0.998 → 0.28 and the meter 0.72 → 0.997 → 0.72, the number holding at
  28.

## As built: pattern clips (2026-11-25)

Step 5a left pattern clips out: a pattern's scroll was set on its layer, and the timeline could not
reach it. It can now.

- **The place.** A clip may play on `Patterns.<name>`, one of the control's own background
  patterns. Only a keyframe effect plays there (`cleanClip`), and only its moves and fades show: a
  pattern has no fill or gradient of its own to recolour (`effectOnlyMoves`).
- **How it draws.** `sceneControlOutput` gives a pattern's clips as `patterns`, by name, beside
  `parts`, and `mergeKeyframeOutputs` carries them. `CanvasControl` hands them to
  `BackgroundRenderer`, and to the front `PatternLayers`.
  - Each pattern layer has a wrapper, `.pattern-clip`, between the layer and its movers. The
    clip's CSS animation plays there: its fade multiplies the pattern's own opacity, and its moves
    carry the scrolling tile, so the scroll goes on underneath.
  - The wrapper is always there, so a clip starting does not rebuild the movers and make the
    scroll jump.
  - These are HTML layers, not inside an SVG, so none of the WebKitGTK `foreignObject` rules
    apply. WebKitGTK draws the pulse held half way as Chromium does.
- **The library**, a **Pattern** category: fades in, fades out, rises in, pulse and flicker. Their
  target is `Patterns`, meaning the control's first pattern, unless the effect is dropped on
  another pattern's track. Any move from **Move** can be put on a pattern under **Plays on**.
  - On a control with no pattern the effect is refused, with the way to add one.
  - A paint effect is refused on a pattern track; words and values go to their own places.
- **Scripts.** `ce.anim.effect("Wave", "Pattern pulse")` goes on Wave's first pattern. A pattern is
  named by its path, `Wave.Patterns.pattern1`.
- **Scene presets.** A slot needs the patterns its clips play on, and a control without them does
  not fit it.

Left out: patterns on a control's parts (`Parts.<p>.Background.Patterns`). The Pattern tab can put
them there, but the timeline reaches only the control's own. (Built since: "As built: a part's
patterns on the timeline", below.)

Verified locally:
- `test/patternClips.test.js` (new): the place and what plays there, the library, a scene's output
  per pattern with nothing on the control itself, merging, a script's path, and a preset's needs;
- the browser checks:
  - `scenePlayback`: a script-started scene pulses Wave's pattern, running, and its scroll keeps
    running. A seek holds it paused half way;
  - `animationDesigner`: a Pattern effect on a knob with no pattern is refused with the reason, and
    on Wave it lands on `Patterns.pattern1`;
  - `panelMotion` and `effectsTab`;
- WebKitGTK 2.52: the pulse held half way, larger and fainter, its scroll running.

## As built: MIDI in as a scene trigger (2026-11-25)

The model's trigger list has always included "MIDI in", and step 5b built the others. It is built
now.

- **The trigger** (`cleanTrigger`, type `midi`): a note-on of a note or any, a controller `cc` going
  past `above`, or a program change to one program or any; on `channel` 1 to 16, or 0 for any.
- **A controller fires as it passes its point going up**, and not again while it stays above it: a
  sustain pedal held down sends the same value again and again, and each must not restart the scene.
  The reader (`createMidiTriggerReader`, `utils/sceneMidi.js`) keeps each controller's last value per
  channel, and an event carries where it was before.
- **Decoding** is its own, small and pure: the expression decoder the panel's bindings use drops a
  note-on's number and program changes, which a trigger needs. A note-on at velocity 0 is a release,
  as MIDI says.
- **Where it comes from.** Both surfaces hear MIDI through `latestMidiInputMessage`:
  `initDeviceProfileBridge` sets it in the editor and in the plug-in alike, after `ce.midi.interceptIn`'s
  filter. So `PanelPreviewSurface`'s existing subscription hands each message to the run store's `midi`,
  which reads it only while some scene waits on MIDI. `Player.svelte` needs nothing of its own;
  feeding it there too would have fired every scene twice.
- **The Designer** offers MIDI in among the triggers. Its fields are the message, the note by name
  (60 is C4, as elsewhere in CEditor), the controller and its point, or the program, and the channel.
  The scene list says it in words: "Note C2", "CC 64 past 63".

Verified locally:
- `test/sceneMidi.test.js` (new): the trigger read with defaults, what a trigger hears and what it
  does not, a note by number and channel, a controller passing its point once per press, the words,
  and the runtime starting only the scene a message is for;
- the browser checks `scenePlayback` (a kick drum's note starts its scene and another note does not;
  the pedal starts its own going down, not while held, and again after it is let up and pressed) and
  `animationDesigner` (the trigger set to a note, saved, and named in the scene list).

## As built: a clock heard on one part (2026-11-25)

The record's rule "a gesture is heard on the part picked, with the same path bar, or on the whole
control" was left out of step 5c's clocks. It is built now.

- **The clock** may name a `part` (`cleanClock`). A clock on the whole control stores nothing, so
  every clock saved before reads as it did. A value clock has no part: the value is the control's.
- **Where a part is.** `partRectOf` (`utils/sceneClock.js`) uses the part's layout and the control's
  size, through `resolvePartPixelRect`, the same sum the custom components lay out with. A part with
  no area of its own (no layout, or none in size) cannot be chosen.
- **Routing.** The runtime gives an input marked with a part to that part's clocks, and an unmarked
  one to the whole control's. The preview decides what to send, against the control as it is drawn,
  with its set applied:
  - the pointer, measured across the part, 0 to 1, and whether it is over it;
  - the wheel, only over the part;
  - a drag, to the parts it was pressed on. The press now carries where it was, in the control's
    pixels (`watchGesture`'s `onDrag`).

  The whole control's clocks hear everything, as before.
- **The Designer** has **Heard on** beside the clock's control, offering the parts with an area of
  their own. The scene list names the part: "Drag on Knock › Key".

Verified locally:
- `test/sceneClock.test.js`: a clock naming a part, but not a value clock; a button's key area and a
  point in its margin; the runtime moving only the clocks of the part an input was on;
- the browser checks `scenePlayback` (a drag pressed on Knock's margin moves nothing, the same drag
  on its key moves the scene 400 ms of 1,000) and `animationDesigner` (Heard on offers the control's
  parts, the choice is saved, and the scene list names it).

## As built: a part's patterns in front (2026-11-25)

Step 3 left one place out: a pattern set **in front of the content** on a part drew nothing, since
only the control drew its front patterns, and a part's background (through its own
`BackgroundRenderer`) drew only the ones behind.

`InteractivePartRenderer` now draws its background's front patterns after the rest of its content,
over its words and its picture. They are clipped to the part's shape: its traced outline where it
has one, and its corners otherwise, as its background is. A square part needs no clip, since the
layer's box is the part's and hides what spills over it.

Verified locally:
- `test/partFrontPatterns.test.js` (new): a front pattern drawn after a part's words and not behind
  as well, clipped to rounded corners; a pattern behind still before the words, with nothing in front;
- the browser checks `panelMotion`, `fromSelection` and `anatomyForms`, and the component harness's 96
  cases (the renderer draws every part).

## As built: a pattern's opacity, size and speed ease between states (2026-11-25)

Step 3 left these switching: a state that made a pattern fainter, larger or faster changed it at
once, and only its tint faded, on the control's colour timing. All four now ease on that timing.

- **Opacity** is a transition on the pattern's layer.
- **Size** is transitions on the painted area, its mask's tile and position, and the movers' tile.
- **Speed** cannot be a CSS transition. A running CSS animation given a new duration keeps its
  elapsed time, and so jumps to another place. A Svelte action on each mover (`steadyScroll` in
  `PatternLayers.svelte`) puts the scroll back at the same place in the new duration's terms, through
  the Web Animations API (`currentTime`). It then ramps the animation's `playbackRate` from the old
  speed to the new over the same timing. It picks the scroll itself out of `getAnimations()`, which
  also lists the size's transitions.
- **Where the timing comes from.** `PatternLayers` takes the control's or the part's colour timing as
  a prop and writes each transition into the same style attribute as the value it eases. The first
  version read it as a custom property (`--ce-colour-timing`, which `colourTransitionVar` now also
  sets). Chromium eased with it, but WebKitGTK 2.52 settled the new opacity at once in the panel.
  - The same CSS transitioned in WebKitGTK in every isolated reduction: the timing on the element or
    on its parent, set in the same write or before it, inline or in a stylesheet.
  - So the cause is in how the panel's writes interleave, likely a style read between the two
    writes, and not in the CSS.
  - Writing the timing beside the value removes the dependence on order. The variable stays as the
    fallback for a caller that passes no timing.

Verified locally:
- `test/transitionCss.test.js` (the timing variable);
- the browser check `scenePlayback`: Glow's pattern, made fainter, larger and faster on Hover with a
  600 ms colour timing. Mid-way it is fading and growing and its rate is easing; at the end it is at
  30 %, twice the size and the new speed, and its scroll never jumped. Also `panelMotion`,
  `effectsTab`, `animationTab` and `anatomyForms`;
- WebKitGTK 2.52, the same hover: opacity 1 → 0.86 → 0.54 → 0.3, tile 64 → 77 → 106 → 128 px, rate
  0.55 → 0.77 → 1, the place kept.

## As built: image fills that animate (2026-11-25)

Paint's last item, left out of step 3. A fill's background image now moves under keyframes, inside
its clip, while the control stays put.

- **Frames** may set `panX` and `panY` (percent of the box, ±200), `zoom` (0.1 to 10) and `spin`
  (degrees), kept in range by `cleanFrames` like the rest (`FRAME_IMAGE`).
- **The sixth channel**, `image` (`IMAGE_CHANNEL`), beside the four colours and the gradient. Its
  keyframes animate the picture's own `translate`, `scale` and `rotate`.
  - These are individual properties, so they add to the rotation and flips the image is set with.
  - No registered property is needed, unlike the gradient's.
  - A frame that pans writes both axes; one that only zooms or spins leaves `translate` out, so the
    pan eases through it.
- **Drawing.** `BackgroundRenderer` draws a moving image as its clip with the picture inside
  (`.bg-fill-paint.image`, which plays `--ce-kf-image`). That is the two-element form a rotated or
  flipped image already had, so the picture moves and the clip does not.
  - A control or a part with a moving image does not absorb its fill onto its content element:
    moving it there would move the words with it.
  - Both cases switch back when the animation is gone.
- **The editors.** The frames editor shows image pan, zoom and spin where the place paints an
  image (the Animation tab and the Designer's clip settings), or where a frame already sets one,
  as it does the gradient's.
- **The library** gains **Image drift** (a slow push in and pan over six seconds) and **Image spin**
  (a turn over eight), under Paint.
- **Scenes** carry the channel like the others (`sceneControlOutput`, `mergeKeyframeOutputs`).

Verified locally:
- `test/imageMotion.test.js` (new): the frames and their limits, the channel's keyframes and value,
  a spin-only frame leaving the pan alone, and the library's drift in a scene with nothing on the
  control itself;
- `test/keyframeAnimation.test.js` and `test/gradientPaint.test.js`, updated for the sixth channel's
  variable;
- the browser checks `scenePlayback` (a script-started drift plays on the picture and not the label,
  and a seek holds it half way, zoomed part way), `panelMotion`, `animationTab`, `effectsTab`,
  `animationDesigner` and `anatomyForms`;
- WebKitGTK 2.52: the drift held near its end, scale 1.149 and pan −4 % −3 %. The checker image moved
  inside the label's border while the label and its words stayed put.

## As built: text effects on a knob's own words (2026-11-25)

Step 2 left out "text drawn by a slider's handle label or a control's own anatomy (a knob's tick
labels)". A knob has no words of its own: its name, value and unit are Labels beside it. What it
draws itself takes the text effects a Label takes, from the same engine (`utils/anatomyWords.js`
over `textEffects.js`).

- **Where.** The scale's numbers (`Parts.tickNumber`) and ticks (`Parts.tickMajor`, `tickMinor`),
  drawn in the knob's SVG, and the labels on a slider's handles (`Parts.labelStart`,
  `labelCurrent`, `labelEnd`), which are HTML. **Plays on** already offered these places; nothing
  drew an effect there.
- **One piece a mark.** On a scale each number or tick is one piece, round it in order, whatever
  the split, because a scale's pieces are its marks; **Whole** plays them together.
  - A typewriter writes 0 2 4 6 8 10 round the dial; an explosion gathers the numbers in from all
    sides.
  - Ticks drawn as lines or dots take an effect too: a scale lit a tick at a time.
  - The second scale's ticks follow the first's of their kind.
  - Handle labels are cut as a Label's words are.
- **Drawing a mark in an effect.**
  - It paints with `currentColor`, its colour in `color`, so the engine's colour keyframes (a
    typewriter's arriving colour, a shimmer's light) reach SVG as they reach HTML.
  - It moves about its own box (`transform-box: fill-box`), not the drawing's.
  - The part's opacity goes on a group around it, so the effect's own fades run to full and land
    on that opacity rather than snapping to it at the end.
  - A roll or a push clips each mark to a box about itself, as a Label's box clips its words: an
    SVG `clipPath` (`markClipBox`, from the number's size and length or the tick's ends).
  - A mark with no effect is drawn exactly as before.
- **Where an effect is put.**
  - A text effect dropped on a knob in the Designer goes to its numbers, else its numeral ticks,
    its handle labels or its plain ticks, whichever it shows (`sliderWordsPlace`).
  - Where it draws none, the Designer says why.
  - The Animation tab marks a text effect aimed at the knob's own words, at a part that draws none
    (its cap, its title label) or at numbers it does not show as doing nothing, with the reason
    (`sliderWordsRefusal`, reason `no words`).
  - A part added to a knob is drawn as a part, words and all, and is left alone.
- **Found on the way, and fixed: `ce.anim.seek` landed late after a run.** A CSS animation paused
  by its play state keeps the time it has already run, and a new delay counts from there. So a seek
  into a running or finished scene showed it later by the time it had played: 2 s into a 6 s drift,
  a seek to half way showed 5 s. A seek now makes the scene's animations afresh (the other phase),
  paused from their first moment at the point sought. A seek from an earlier hold keeps them, since
  an animation paused since it was made has run no time of its own.

Left out: a knob drawn as a form (`Core.controlForm`, ControlAnatomy) and a knob carried inside a
component's part. Both draw their scales elsewhere, and neither plays these effects yet.

**Scripts too (a commit of its own, after).**
- `ce.anim.effect` put a text effect only on a control's own words, so
  `ce.anim.effect("Cutoff", "Typewriter in")` was refused although the Designer now plays it on the
  knob's numbers.
  - The knob alone now goes where the Designer puts it, and a part's words (`Cutoff.tickNumber`,
    `Strip.band`) are accepted.
  - The refusals are `sliderWordsRefusal`'s, so a script hears the same reason the Designer gives.
- **Found on the way, and fixed: every script text effect lasted 600 ms.**
  - `textSpanFor` summed a library effect's stagger and duration, which it does not carry (it names
    only the effect and the way), so the sum was NaN and the one-off scene fell back to 600 ms.
  - A typewriter over a long label was cut off, and `done` came before its last letter.
  - It now reads the effect with its defaults, and counts a scale's marks (`sliderMarkCount`)
  rather than its letters.
- Held by `test/sceneScripts.test.js`: six numbers at 525 ms, eleven ticks at 750, "Hello" at 480,
  and a knob's cap refused with the reason.

Verified locally:
- `test/anatomyWords.test.js` (new):
  - which words a knob shows, and where a dropped effect goes;
  - the refusals;
  - one piece a mark, and Whole;
  - the clip boxes;
  - a scene clip reaching the part;
  - the knob rendered with effects on its numbers, ticks and a handle label;
  - the Animation tab's reason.
- `test/sceneRuntime.test.js`: a seek into a run, after a finished play, and from a hold.
- The browser checks:
  - `scenePlayback`: a script-started typewriter on a knob's numbers, held at 100 ms with three
    typed and three to come, in the part's colour; a roll held half way, each number part way up
    inside its own box;
  - `animationDesigner`: a roll dropped on a knob lands on its ticks;
  - `panelMotion`, `animationTab`, `anatomyForms` and `macroSetKnob`.
- WebKitGTK 2.52: the same two holds, the opacities and the transform as in Chromium, and
  screenshots with the rolled numbers cut by their boxes.

## As built: a part's patterns on the timeline (2026-11-25)

Pattern clips (above) reached only a control's own background patterns. The Pattern tab can put
patterns on a part too (a component's stripe, a panel's band), and a clip now plays on those.

- **The place** is `Parts.<part>.Patterns.<name>`, keyframes only, as on the control's own
  (`PATTERN_PLACE` and `patternPlace` in `sceneFormat.js`). The timeline names it by the part
  (**band › Pattern › Pattern 1**).
- **What is offered.** `patternPlacesOf` lists the control's own patterns first, then each part's.
  - A Pattern effect dropped on the control goes on its first pattern, or a part's first when it
    has none of its own.
  - Plays on lists them all.
  - A part the control's own renderer draws (a knob's, a button's, a meter's anatomy) is not
    offered. Those draw a pattern of their own kind, or none, and a clip there would play on
    nothing.
- **Drawing.**
  - A scene's output gains `partPatterns`, part → pattern name → animations, merged as the rest
    are.
  - CanvasControl hands each part its own to InteractivePartRenderer, which gives them to its
    BackgroundRenderer and its front PatternLayers.
  - The clip's animation plays on the pattern's clip wrapper, as the control's do, so the scroll
    goes on underneath and the part itself does not move.
  - A part with a pattern is never baked into the static SVG (`staticPartBaking.js`), so it is
    always there to animate.
- **Scripts** name a part's pattern as `Strip.band.Patterns.pattern1` (or `Strip.Parts.band…`).
  A Pattern effect on a control with no pattern of its own goes on a part's first.
- **Scene presets** ask for the part and its pattern (`needs.parts`, and `needs.patterns` as
  `band.pattern1`), and a control without them is refused with the pattern named.

Verified locally:
- `test/partPatternClips.test.js` (new):
  - the place and what plays there, and its label;
  - the order things are offered in, and that a button's key and a knob's cap are not offered;
  - a scene's output per part, with nothing on the part or the control, and through two merges;
  - script paths;
  - a preset's needs and its refusal.
- The browser checks `scenePlayback` (a script-started pulse on Strip's band's pattern: the
  pattern's clip animating, its scroll running, the label still, held half way by a seek) and
  `animationDesigner`.
- WebKitGTK 2.52: the same hold, at -0.4 s with the scroll running. The screenshot shows the band's
  wave fainter and larger and the label unchanged.

## As built: scene presets as files and carried by a panel (2026-11-25)

The scene presets' left-out item. A scene preset now has an animation preset's two other homes.

- **A file of its own, `.cescene`.**
  - What a preset is, read and checked, and written to and read from its file, moved to
    `utils/scenePresetFormat.js`. It imports only the scene format, which imports nothing, so a
    panel can read the presets it carries where only plain Node runs: the export tools load
    `panelModel.js`, as `animationPresetFormat.js` is kept for the same reason.
  - A file that is not JSON, not a scene preset, from a newer CEditor, too large, or with nothing
    playable in it, is refused with that reason.
  - It goes through the typed-document route a `.ceanim` takes: a native dialog in the app (one
    more kind in `typedDocumentKind`, `ValueTreeBridgeHandlers.cpp`), a download and a file input
    in a browser.
- **This panel.**
  - `panel.scenePresets` is carried in the document, checked as it is read (`scenePresetsOf`), and
    written only when there is one (`panelModel.js`). A broken one is ignored when the panel opens
    and dropped when it is saved.
  - A panel needs no copy to play what a preset made, which is an ordinary scene. Carrying one is
    for handing the preset on, so it is a choice: **Carry on this panel**, or an import there.
- **The Designer's Scenes.**
  - Each card says where its preset lives: **Built in**, **Mine** or **This panel**, and
    **· on this panel** when the panel carries a copy of one of yours.
  - The picked preset's panel has **Export…**, **Carry on this panel**, **Keep in my library** (for
    one only the panel has), and **Remove** or **Not on this panel**.
  - **Import…** heads the list.
  - Panel commands take the Designer's own panel by id, which need not be the active one.
- **Found on the way, and fixed: undo could not take back a panel field that was new.**
  - A panel restore spread the snapshot over the live panel. A key the snapshot did not have, such
    as `animationScenes` on a panel that had none, was left in place.
  - So the first scene the Designer added to a new panel could not be undone, nor the first
    animation preset or text style a panel carried, nor the first scene preset.
  - A restore now drops what the snapshot does not have, and keeps the fields kept out of history
    (`OUTSIDE_PANEL_HISTORY`: id, file path, background images…).
  - Held by `test/history.test.js`.

Verified locally:
- `test/scenePresetFiles.test.js` (new):
  - a .cescene round trip and every refusal;
  - a panel carrying one through undo, a save and an open, with a broken one ignored and dropped;
  - the library's order and places;
  - keeping one a panel carries, and removing yours while the panel keeps its copy;
  - importing into the library and the panel.
- `test/history.test.js`: a new field undone, the file path left alone, redo.
- `test/exportToolsPlainNode.test.js`.
- The `animationDesigner` browser check: Export downloads a .cescene of the preset; Carry puts it in
  the saved panel and the card says so; Import through the file picker adds one.
- The C++ change compiled with GCC (`-fsyntax-only`, as `CLAUDE.md` gives it). Not run: MSVC, which
  CI's Windows build gives it, and the app's own file dialogs.

## Open

Nothing for the owner at present.
