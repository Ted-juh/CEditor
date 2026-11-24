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
root beside `scripts`, `fonts` and `icons` (`utils/panelDocumentSchema.js`) as `scenes`, and the
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

| Slot | Plays | Stored as (exists today) |
|---|---|---|
| Entering | when the state starts: mouse over, for Hover | a transition with `trigger.to` the state |
| While in | the whole time the state holds | a keyframes loop with a `stateChange` trigger, which already plays while its To state holds |
| Leaving | when it ends: mouse exit, for Hover | Entering played backwards (`trigger.reverse`, the default), or one with `trigger.from` the state |

So nothing new goes into the file; the same triggers get a place where they make sense. A preset
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

## Open

- The file extension of an exported preset.
- Whether the dock tab's preview loops by itself or plays only on Play.
- A performance budget, measured: how many looping effects a panel may carry before the editor
  warns, in the plug-in, on the slowest machine supported.
- Whether `@property` and animated `clip-path` behave the same in WebKitGTK as in WebView2; both
  are needed by steps 2 and 3.
