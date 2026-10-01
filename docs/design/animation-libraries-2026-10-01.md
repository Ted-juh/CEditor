# Animation: what exists, what is missing, and which library answers each gap

> Status: **review, 2026-10-01. Nothing here is built or vendored.** Asked for because the Animation
> tab reads as "non-existent", which is close to right: it edits one duration, one delay and one
> easing per animation, and the runtime turns those into a CSS `transition` string. This record says
> exactly what that is, names the three gaps between it and an animation feature, and weighs the
> libraries against each gap with their cost in the player measured. Where a verdict says "nothing
> new", the program already carries the thing.

## What the program has, measured against the code

Three separate things answer to the word "animation" today, and they do not know about each other.

**1. The Animations section, and the Animation tab over it.** `buildTransitionCatalog` in
`utils/interactionRuntime.js` reads each animation's duration, delay and easing and writes a CSS
`transition` for three buckets per part (transform, opacity, size) and two on the control root. A
state change then *smooths* whatever property moves; nothing is keyframed, timed, looped or
sequenced. The tab's own record (`animation-tab-design.md`) counts the limits: two of the seven
offered properties animate nothing because there is no colour bucket; `kind` has one value;
`trigger` has two names and the second (`valueChange`) is the same smoothing applied to a value
source; "No timeline — with one duration, one delay and one easing per animation there is nothing to
lay out along a time axis."

**2. The scripting API's animator**, which is a real tween engine and the part nobody counts.
`ce.anim.to(path, target, opts)` and `ce.anim.spring(path, target, opts)` in
`scripting/panelRuntime.js` move a control's *value* over time, with a curve, a delay, a list of
paths with `stagger`, a damped spring with `damping` and `frequency`, and a clock that can run in
beats and stretch with the host tempo (`sync`), which no animation library on this page offers. It
is reachable only from a script, it targets values (a knob's position, a slider's level), not parts, and it has no
authoring surface at all.

**3. Loops that already run every frame.** The preview's meter ballistics
(`PanelPreviewSurface.svelte`, `meterAnimationFrame`), the listbox fling, and the Kinetic and Orbit
sections' physics, each with its own `requestAnimationFrame`. The Display components play a GIF or a
sprite sheet behind the dot matrix. `Paper.js`, already a lazy dependency, carries
`Path.interpolate` for morphing one outline into another.

So the gap is not a missing engine. It is that the engine is script-only and value-only, the
declarative model stops at CSS smoothing, and nothing lets an author lay anything along time.

## The three gaps

| Gap | What an author cannot do today | What answers it |
| --- | --- | --- |
| **A. Keyframes along time** | A blink, a sweep, an intro, a pulse that repeats, a sequence across parts: anything with a middle. | A timeline *editor* in the tab, and a runtime that drives part properties and values from keyframes. |
| **B. Value-driven motion** | A needle that overshoots, an LED that decays, a filmstrip knob that eases into its frame instead of jumping. | A spring or tween on the value channel, declared on the control rather than written in a script. |
| **C. Colour** | Fill and text colour transitions, offered in the dropdown and silently dropped. | A colour bucket in `buildTransitionCatalog`. Not a library. A bug-sized fix. |

## Runtimes, with their cost in the player

Every exported plug-in ships the player, so a runtime library is paid for by every panel. Measured
by bundling each import with esbuild, minified, then gzipped:

| Library | Version, licence | Import measured | Minified | Gzipped | Targets plain objects? |
| --- | --- | --- | --- | --- | --- |
| anime.js | 4.5.0, MIT, 2026-06 | `animate, createTimeline, eases` | 35 KB | 13 KB | Yes |
| anime.js | | `animate, createTimeline, createSpring, utils` | 46 KB | 16 KB | Yes |
| motion | 13.5.0, MIT, 2026-10 | `animate, spring` | 53 KB | 19 KB | Yes |
| @tweenjs/tween.js | 25.0.0, MIT, 2024-07 | `Tween` | 12 KB | 3 KB | Yes |
| wobble | 1.5.1, MIT, 2018-12 | `Spring` | 4 KB | 1 KB | Scalar only |
| flubber | 0.4.2, MIT, 2018-03 | `interpolate` | 52 KB | 18 KB | Path morphing |
| polymorph-js | 1.0.2, MIT, 2019-10 | `interpolate` | 11 KB | 4 KB | Path morphing |
| Web Animations API | in WebView2 and WebKitGTK | `element.animate` | 0 | 0 | **No: DOM only** |
| GSAP | 3.15.0, "standard no-charge licence" | | | | Not open source; not weighed |

**The deciding question is the last column.** The things a synth panel most wants to animate are not
CSS properties: a filmstrip's frame index, a value channel, an LED's state, a display's text, the
needle a custom component draws from a value. The Web Animations API cannot reach them, which is why
"zero bytes" is not the answer it looks like. A tween engine that drives plain JavaScript objects
can, and the program's own script animator is already one.

**anime.js, run against the claim.** Bundled with esbuild and executed in Chromium: a labelled
timeline over a plain `{ needle, frame, led }` object, with `needle` eased over 400 ms, `frame`
stepped 0 to 31 with a rounding modifier, and `led` blinking at a label; plus a spring on a scalar.
After 900 ms the object read `needle 1, frame 31, led 0.88`, the timeline reported 1,100 ms, the
spring settled to 0.995 of its target with a reported 2,120 ms duration. It does what gap A and gap
B need, on the targets they need, for 16 KB gzipped.

**Verdict on runtimes: take anime.js for gap A if a timeline is built; take nothing for gap B.**
Gap B is a declared spring on a value channel, and `ce.anim.spring` already computes one. The work
is to let the Animations section declare what today only a script can call, through the same
`startAnimationImpl`. wobble and tween.js would each duplicate it for the sake of being a package.
Flubber and polymorph are not needed while Paper.js is in the tree: `Path.interpolate` morphs
between the outlines the Component Designer already computes, and the chunk is loaded lazily only
by panels that use combined shapes, which are the panels that would morph.

## The editor side: a timeline

The tab's record is right that three numbers do not need a time axis, and right that keyframes
change that. Candidates for the axis itself:

| Library | Licence, release | What it is | Verdict |
| --- | --- | --- | --- |
| **animation-timeline-js** 2.3.5 | MIT, 2024-07 | A canvas keyframe timeline: rows, keyframes, ranges, snap, zoom, pan, multi-select, drag, keyboard. Vanilla TypeScript, no dependencies, 78 KB minified, 17 KB gzipped. You hand it a model (`rows[].keyframes[]`) and it emits `keyframeChanged`, `drag`, `selected`, `timeChanged`. No value graph and no easing display: it is the axis, not the curve. | **Take, for gap A.** Mounted in Chromium with three rows and nine keyframes; it drew, took `setTime(650)` and reported it back. The editor's own `EasingCurve.svelte` is the curve; this is the axis it never had. Editor only, never in the player. |
| Theatre.js studio 0.7.2 | AGPL-3.0, 2024-05 | The whole motion-design editor: timeline, keyframes, easing editor, a sheet/object/prop model. The landscape called it "the single most relevant find for the Animation tab". | **Reference now, not a dependency.** 21 MB unpacked, React inside, and no release in seventeen months. Its *core* (Apache 2.0, 882 KB) is a runtime the player does not need beside anime.js. Read its keyframe and prop model before designing the document shape; do not link it. |
| Rive runtime (`@rive-app/canvas` 2.44.0) | MIT, 2026-09 | A state-machine animation runtime whose number, boolean and trigger inputs can be driven from parameter values, which is exactly gap B as a product. | **Reference.** The runtime is open; the editor that makes `.riv` files is not, and the format is not a document this program can author or diff. A panel author with Rive would import a finished animation as scenery, which is the Lottie verdict already given in `storage-validation-libraries-2026-09-30.md`. |
| dotLottie (`@lottiefiles/dotlottie-web` 0.80.0) | MIT, 2026-08 | A WebAssembly Lottie player, 7 MB unpacked. | Same verdict as lottie-web: declined until an artist asks, and then as a lazily loaded part. |

## What this adds up to

Items 1 and 2 were **built the same day**; `animation-tab-design.md` carries the as-built notes
under its finding 1 and open item 4. One thing came out differently from the plan: the spring is
not run through the script animator's loop but handed to CSS as a `linear()` timing function
sampled from the same formula, so it reaches every bucket (colour included) with no frame loop
of its own, and a spring in a script and a spring on a control are held to one path by test.

1. **Fix gap C now.** A `colour` bucket in `buildTransitionCatalog`, and `animationModel.test.js`
   changes from pinning two dead properties to pinning none. No library.
2. **Gap B next, no library.** The Animations section gets a third kind beside `transition`:
   `spring`, with `damping` and `frequency`, applied to the control's value through the script
   animator's `startAnimationImpl`. The tab offers the kind; the runtime already has the maths. The
   same path makes `to` with a curve declarative for filmstrip knobs that should ease into a frame.
3. **Gap A when someone asks for a middle.** Keyframes per target in the document, anime.js
   (16 KB gzipped) driving parts and values from them in the player, animation-timeline-js as the
   axis in the tab with `EasingCurve.svelte` beside it. Theatre.js's model is the reading before the
   document shape is decided. This is the only step that costs the player bytes, and it is the one
   the tab's record deferred for the right reason.

## As built: keyframes (2026-10-01, the same day)

Item 3 followed the same afternoon, so this section is the record of what shipped rather than
the plan above.

**The document.** A `keyframes` animation keeps its tracks on its targets: each target carries
`keyframes: [{ time, value, easing }]`, sorted by time, with `duration` the length of the axis
(never shorter than the last keyframe), `loop`, and `hold` (keep the last frame while the state
that fired it stays). Values are numbers, or AARRGGBB strings on a colour target. Switching an
animation to `keyframes` seeds every live track with one keyframe at 0 holding the value the control
has as authored, so the switch changes nothing on screen until a second keyframe is added; switching
away leaves the tracks in place.

**The runtime.** `utils/keyframeModel.js` turns an animation into one anime.js timeline over a
plain object (one key per track, segments between keyframes with the arriving keyframe's easing,
the same bezier the CSS transition gets) and reads it back as a patch map in document shape.
`utils/keyframePlayer.js` owns one player per mounted control: a `stateChange` trigger that fires
restarts the timeline, the last frame holds while the state stays and clears when it leaves, a
trigger on `*` plays through and clears, `loop` keeps going, and a `valueChange` trigger does not
play at all: the position follows the value, a sequence scrubbed by a knob. Every frame the
overlays of the control's running animations merge into `stores/keyframeOverlays.js`, and
`resolveInteractiveControl` applies that map after the state patches and before scaling, exactly
where a state's own patch lands. A keyframes animation builds no CSS transition, so nothing eases
what is already eased. anime.js is a dynamic import: the player chunk every export carries did not
grow, and a panel with no keyframes never loads it.

**The tab.** `animation-timeline-js` sits under the Changes list, one row per target, with the
labels in a column of the tab's own. Drag a keyframe and the drop is one store write for every
keyframe moved (and one undo step); click one and a box edits its time, value (a number cell, or
the hex of a colour) and the easing it arrives with; *Keyframe at N ms* adds one to the selected
track holding the pose there, which the same timeline samples; Delete removes it. The playhead
poses the control on the canvas in any view, through the same overlay store the player writes, and
Play runs the sequence there with the playhead following. Loop and After (hold or return) sit in
the Timing group; the properties panel offers the kind, Loop, Hold and a button to the tab.

**Measured.** The timeline is seeked in Node by the tests (anime.js's clock falls back to a timer
there), including a real play through the player: a state entering fills the overlay store, the
last frame holds, the state leaving empties it, a value trigger follows the value, a non-holding
sequence clears itself. The browser check switches a transition to keyframes, finds the seeded
tracks and the drawn axis, adds and deletes a keyframe, reads the pose off the overlay store, and
plays. Built: anime.js's timeline is its own chunk of 42 KB minified, fetched only by a panel
that has a keyframe animation (`utils/animeTimeline.js` re-exports the one function, so the rest
of the library is dropped); the player chunk every export carries grew by 18 KB (0.7%), which is
the keyframe runtime itself and the tab's model it shares; the timeline control is in the editor
chunk only.

**Limits, stated.** Tracks animate what the transition catalog can smooth: a part's transform,
opacity and colour, and the root's transform, opacity and colour. Value channels and filmstrip
frames, which the plan named as the reason for a value-driven engine, are not yet targets; the
engine and the overlay can carry them, the target list does not offer them yet. Keyframes cannot
be copied between tracks, there is no curve display between keyframes beyond the easing name, and
the axis has no markers or labels. The timeline control draws on a canvas and is not reachable
from the keyboard; the keyframe box beside it is.

## Looked at and dropped

| Project | Why not |
| --- | --- |
| svelte-motion 0.12.2, @mojs/core 1.7.1, kute.js 2.2.6, vivus 0.4.6 | A framework binding (the player's parts are not Svelte components to the animator), a declarative-DOM animator, a jQuery-era tween, and SVG line drawing. None reaches a value channel; anime.js does the DOM half smaller. |
| popmotion 11.0.5, wobble, tiny-spring | Springs the program already computes in `ce.anim.spring`. |
| GSAP 3.15.0 | Free of charge since 2025 and not open source. The project's own ground rules (`open-source-landscape.md`) take OSI licences; this is not one. |
| Theatre.js as a dependency | Above. |

## What this pass could not check

The GitHub API was not reachable, so release dates are the npm registry's. The Theatre.js and Rive
documentation sites were not fetched; the licence and size figures are from the registry and the
landscape's earlier verified entries. Nothing in the verdicts depends on either site.
