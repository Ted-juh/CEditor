# Components: each control's own animation presets, the Knob first

*Decided 2026-11-26 by the owner; both halves built the same day.*

The owner asked for animations on a component itself to become a showcase of their own, beside the
Film Festival, the Song Book and the rest: named **Components**, with a part for every kind of
control, starting with the knob — and then for "fly out numbers, the name of the component switching
with a value, that kind of stuff", and ticks "appearing in order, big first, then the smaller ones".
A mockup of eight panels of knob presets came out of that (a scratch page, not kept); this records
what was decided about it, what is built, and what waits.

## Decided (2026-11-26, the owner)

1. **All eight panels stay**: Numbers, Ticks, Touch, Turning, Attention, Gestures, Words, Together.
2. **Every preset is also in the editor's library**, under a **Knob** heading, applied as any other.
3. **A different control set for each panel**, so the presets are seen on knobs of eight looks.
4. **Build what works with the existing engine first, show it moving, then the new capabilities**:
   a stream of numbers, a delta, an odometer, choice names pushed the way you turn, ticks flying
   along their own line, a fan of ticks turning into place, and a detent felt once per step.

## The shape of it

- **A preset is data.** The knob's presets are ordinary animation presets
  (`utils/animationPresetFormat.js`), written in `utils/knobPresets.js`, ids `ce:knob:<name>` so none
  can meet one of yours (`ap_…`). Category Knob, the group as the first tag.
- **The library lists them** (`stores/animationPresetLibrary.js` `COMPONENT_PRESETS`;
  `components/animation/PresetLibrary.svelte`) under the component, by group, each with what plays
  it and what it does, a preview where it has one, and **Apply**. Applied, it is linked and the
  panel carries it, as yours are. It comes with CEditor, so a panel that carries one never offers to
  add it to your library; a panel carrying an older revision is offered **Update panel**.
- **The showcase is the presets on knobs.** `scripts/componentPanels.js` lays the knob's presets out,
  one panel a group, each knob wearing one preset applied as Apply applies it, captioned with its
  name, what plays it and one line of what you see. `CE/panels/Components/Knob/`, a folder a
  component; installed with the Components folder whole (CMake and the Windows installer).
- **Together** is scenes, not presets on one knob: Sweep in (the built-in scene preset **Knobs sweep
  in**), Wave (now built in too, **Knobs wave**) and Follow the leader (a scene with the first knob's
  value as its clock and its four followers' value clips, on a spring).

| Panel | Set | Why that set |
|---|---|---|
| Numbers | Graphite | a value arc, a plain dial the readout reads against |
| Ticks | Precision (`chronograph`) | thirteen big ticks and a second scale of small ones, and numbers |
| Touch | Edge Light | a cap with a gradient (Sheen), a lit ring (Glow) |
| Turning | Arc Line | the arc alone, so the way it moves is all there is to see |
| Attention | Touch Encoder | a thin arc whose sweeps read from across the panel |
| Gestures | Hex Drive | a hexagonal cap, so a spin can be seen |
| Words | Heritage | scale numbers round a cream dial |
| Together | Modern Flat (`diesel`) | an arc on every knob of the row |

## The catalogue

49 presets, and the Together scenes. *Phase 2* marks the ten that needed the engine to learn
something first, and what that was; all are built.

| Group | Preset | Plays on | What you see | |
|---|---|---|---|---|
| Numbers | Fly-out | let go | the value floats up off the pointer and fades | built |
| | Name ↔ value | while turning | the name Label pushes over to the value, and types the name back | built |
| | Decode | let go | the name Label shows the value while turning; let go, the name decodes back through glyphs | built |
| | Tip label | while turning | the value rides at the pointer's tip | built |
| | MAX stamp | at an end | MAX or MIN stamps on in red: two states with rules | built |
| | From the synth | MIDI in | a value from outside flashes the arc; your own turns do not | built |
| | Number stream | each step | every step throws its value out along the pointer | *phase 2:* words thrown |
| | Odometer | each step | only the digits that changed roll, in the cap, the way you turned | *phase 2:* an odometer |
| | Delta | let go | how far you turned it rises out of the dial, "+2.4", and fades | *phase 2:* the change as words |
| | Units | hover | the unit rolls in after the value | *phase 2:* an odometer on the words that changed |
| | Big number | press | the value fills the dial while you hold it | *phase 2:* the readout in the cap |
| | Choice names | each step | a stepped knob: the next name pushes in the way you turned | *phase 2:* the turn's direction |
| Ticks | Big, then small | panel opens | the big ticks in order, then the small ones, then the numbers | built |
| | Grow | panel opens | each tick pops in, in order, the big ones first | built |
| | Centre out | panel opens | from the top outward both ways, the big ones first | built |
| | Countdown | double-click | the ticks go out from the top end down as it resets, and come back | built |
| | Ripple | hover | a warm light runs round the ticks | built |
| | Burst | panel opens | each tick flies out from the centre along its own line | *phase 2:* a mark's own way from the centre |
| | Fly away | double-click | the ticks fly off along their lines as it resets, and fly back | *phase 2:* the same, and two effects taking turns |
| | Fan in | panel opens | the ticks turn into place round the dial, as a fan opens | *phase 2:* a mark turned about the dial |
| Touch | Lift | hover | the cap rises toward you | built |
| | Grip | press | the cap squeezes under the finger | built |
| | Glow | while turning | the cap's rim lights and the arc breathes | built |
| | Readout | while turning | the value shows, and lingers 0.6 s after | built |
| | Focus ring | keyboard focus | the value arc breathes while it has the keys | built |
| | Sheen | hover | a glint crosses the cap | built |
| Turning | Glide | turn | eases into each new value | built |
| | Snap | turn | lands at once | built |
| | Spring | turn | overshoots, then settles | built |
| | Overload | above 90% | the arc turns red: a state with a rule | built |
| | Modulated | always | the drawing wobbles round the value, as if an LFO were on it | built |
| | Detent | each step | the pointer pulses once a step | *phase 2:* a step as a trigger |
| Attention | Ring sweep, Rise to value, Fall to value | panel opens | value effects that hand back to the value | built |
| | Reach full | a script plays it | to full and back: "look here" | built |
| | Wiggle | hover | a small shake: "turn me" | built |
| | Beat pulse | transport beat | a pulse on each beat | built |
| Gestures | Reset flash | double-click | the pointer flashes as it goes home | built |
| | Spin | flick | the cap spins once and settles | built |
| | Notch | wheel | a light runs round the ticks the way you turned | built |
| | Pop | long press | the knob pops when the press is held | built |
| | Nudge | click | a small wiggle on each click | built |
| | Default stamp | double-click | the default value stamps on as it resets | built |
| Words | Scale types in, Numbers roll, Scale counts up | panel opens | the scale's numbers typed, rolled, popped in | built |
| | Readout doors | wheel or keys | each new value closes in like doors | built |
| | Shimmer | hover | a light runs along the numbers | built |

## Where it differs from the mockup, and why

Each of these was found by watching the preset play, not by reading the code.

- **Decode** went from the knob's scale on hover to the name Label on letting go. A reel scrambles
  real text through other glyphs, and a knob's scale numbers are SVG, where it can only roll each
  number up into place; and a Label has no hover of its own in Preview. On the Label, as the name
  comes back, it scrambles as the mockup drew it.
- **Reach full** is played by a script (the Attention panel's "Look here" plays it every four
  seconds), not by a click: a click on a knob also sets its value, and the sweep never showed.
- **Glow** lights the cap's rim and breathes the arc. Every knob already lights its arc while it is
  dragged (its own Dragging state), so an arc colour was a preset that did nothing.
- **Focus ring** breathes the value arc, and **Reset flash** lights the pointer: many sets draw no
  separate track for a ring to be.
- **Grow** pops each tick from its own centre, in order. Growing outward from the dial is the same
  engine work as the ticks' fly-out.
- **Units** and **Big number** moved to phase 2: one changes part of the words, the other needs the
  readout somewhere other than the pointer's tip.
- The ticks' **Fly-out** is **Burst**: the Numbers group already has a Fly-out (the readout), and two
  presets of one name under Knob would be one too many.
- **Delta** plays as the knob is let go, not on each change: the change since the last word, which
  is how far you turned it. On each step it would say the size of a step every time.
- **Odometer**, **Choice names** and **Units** have the readout in the cap, still, where a number
  that changes a digit at a time can be read; at the tip it moves while it rolls.

## As built: the first half (2026-11-26)

What the existing engine needed to carry the presets, each found by a preset that did not play:

- **The preset format keeps a state's rule** (`rule`, as a state stores it): Overload and MAX stamp
  are states that hold above 90% and at the ends. And a preset may set two knob settings it owns:
  the readout shown (`Behavior.showHandleLabels`) and a part's resting opacity
  (`Parts.labelCurrent.opacity`), the readout hidden until a state shows it. An older CEditor reads
  the preset and ignores both, as it ignores any field it does not know.
- **A Glide takes the glide's place.** A knob ships two glides, `pointerSlide` and `rangeSlide`; a
  preset whose transition of the same name moves the same things on the same change takes that
  animation's place rather than adding a second that ties with it (`animationPresetModel.js`
  `replacedBy`). Not one that already follows the same preset: applying a preset twice still adds a
  copy, as it always did, and an animation of another name is never taken.
- **A text effect on words the knob does not show is refused**, with the anatomy's own reason
  (`sliderWordsRefusal`), judged as the knob will be once the preset's own fields are set.
- **A script can define what the knobs carry.** `ce.panel.define(…, "Animations", …)` refused a text
  effect's own settings (effect, way, split, stagger, colour…) and a preset link, because no
  committed panel had held either on a control's own animation; `panelCollections.test.js`, which
  holds every committed panel's keys to what define takes, found it on these.
- **A knob's readout moves.** Its handle labels are HTML beside the drawing and took neither their
  part's keyframes nor its transitions (`SliderFamilyRenderer` `labelMotion`): Fly-out and the stamps
  played in the runtime and drew nothing.
- **A knob's plates scale and move as a whole.** A plate (housing, skirt, cap, insert) is sized by
  its width and ignored its part's `Layout.scale`, so Lift and Grip patched a number nothing drew;
  and a keyframe on the cap turned the paint inside a hexagon and left its outline still. Each plate
  is now drawn in a group that carries its scale and its motion about the dial's centre
  (`plateScaleStyle`), written only when there is either, so a knob without them draws as before.
  WebKitGTK 2.52 draws a scaled gradient cap and a scaled hexagon as Chromium does.
- **A name ↔ value Label swaps once.** Waiting for "the value" meant any text change whose new
  words were a value, so on a Label that swaps the two, every step of a turn pushed the new number in
  over the last and two were drawn at once. It now means the words becoming the value: on such a
  Label a value that changes is the value following the knob. A Label that shows only the value
  plays on each change, as before. This was the shipped recipe's behaviour too.

Verified locally:
- `test/knobPresets.test.js` (new): the catalogue; every preset survives its own file; each fits the
  default knob and a knob in its panel's set, and in the other sets fits or says what is missing;
  the name Label ones fit a Label only; a refusal for numbers a knob does not show; the glides
  replaced, a Spring after a Glide, the same preset twice; rules kept and matched; the readout
  presets; a value effect handing back; nothing looping that does not say so; the library path; the
  showcase panels carrying and wearing every preset.
- `test/scenePreset.test.js`: Knobs wave. `test/showcaseCollections.test.js` and
  `test/showcaseInstall.test.js`: the Knob folder written as the script says, reopened with its
  presets, installed with Components whole.
- The browser checks `knobShowcase` (new: ticks arriving, Lift, Tip label, the stamps, the swap,
  Snap and Glide, Ring sweep, Spin, Follow the leader, in Preview), `animationTab` (the library's
  Knob section, a built-in applied linked and one refused), `animationDesigner` (the third built-in
  scene preset), and the checks over the knob's drawing.
- Every panel recorded in Preview and checked frame by frame, and the plates in WebKitGTK.

Left out: Follow the leader as a library scene preset (a scene preset repeats one
slot over many controls; this one needs a leader and a slot per follower), and a value effect on a
knob's click (the click's own value change wins, which is worth a look of its own).

## As built: the second half (2026-11-26)

Ten presets, each on what it needed:

- **A step of the value is a trigger** (`valueStep`, keyframeAnimation.js): once each time the value
  comes to another step, while it is dragged too, as many steps as the control has
  (interactionRuntime.js `stepsOfControl`: a knob of five choices has four; one with no step, twenty)
  or the number the trigger names. The player keeps which way it turned (`turn`), and a text
  effect's **Direction** can be the turn's (`direction: 'turn'`, `turnDirection`): a push or a wipe
  carries the old word off and brings the next in from the right as the value rises; a roll or an
  odometer rolls up. The Animation tab offers it with **Steps**; its stage's Play walks the value up
  three steps and down two (animationPlayback.js).
- **Words thrown** (`kind: 'emit'`, keyframeAnimation.js EMIT): each time it plays, the value, or the
  change since the last word, flies out of the dial from the pointer's tip or the centre, along the
  pointer or up, and fades; several in the air at once. The renderer draws them
  (SliderFamilyRenderer `emittedWords`) and drops each once it has flown, whenever the player is next
  asked. The Animation tab's **Words** kind; ce.panel.define takes `shows`, `from`, `travel`, `size`.
  They fly within the knob's own box, as its readout does, so the showcase gives such a knob room.
- **An odometer** (textEffects.js): only the letters that changed since the words before roll, the
  two texts lined up from the right (a value grows on the left), or from the left when one begins
  with the other (a unit arriving after the value), on a knob's readout and on a Label alike: each
  remembers the words before they last changed (`wordsHistory`), so a redraw mid-roll leaves it be.
  In the Designer's library it is a Swap. **Fly** and **Fan**: on a knob's scale, each
  mark flies from the dial's centre along its own line, or out along it, and a fan turns each mark
  about the centre from the first one (anatomyWords.js `markGeometry`); on a Label, a fly rises from
  just below and a fan turns each letter.
- **The readout in the cap** (`Parts.labelCurrent.anchor: 'centre'`): the Labels tab's **Sits**,
  a preset field, and a part key ce.panel.define takes. While a readout shows there, a line or bar
  pointer starts two thirds of the way out, a tick at the rim, so the number is not struck through.
  Big number also steps the pointer aside while it is held.
- **Two effects on the same marks take turns** (textEffects.js `effectInTurn`): the last to have
  started plays, and a later one takes over from its own start. Two CSS animations on one mark
  cannot share it: an out fills both ways and an in backwards, so whichever is on top hides the other
  from the start, and an in's empty last frame is filled from the one beneath it. Fly away needed
  this, and so did the first half's **Countdown**, which only ever showed its ticks coming back.

Found on the way, and fixed:

- **A value effect could stop on its first frame.** CanvasControl drew a running value effect a
  frame at a time, and asked for the next frame only when the time it last drew changed. Chromium
  can hand two callbacks the same frame time, and the effect's start was on `performance.now()`, a
  little ahead of the frame's: so the clock stood still, nothing asked for another frame, and the
  knob stayed where the effect began. Ring sweep was drawn at 0 instead of its value about one panel
  open in three; it was so before this work too. The clock is `performance.now()` and always moves.
- **The knobShowcase check's flick** was 17.5 px a step, about 600 px/s when moves took 30 ms to
  arrive, which is the speed a flick needs: one run in three was no flick at all, before this work
  too. It flicks 32 px a step.
- **A component's own keyframes put its scoping class on every element it drew** when one of them
  had a percentage stop (Svelte 5), so the thrown words' flight is two `from`/`to` animations, a move
  and a fade.

Verified locally:
- Unit tests: `keyframeAnimation.test.js` (the step trigger, words thrown and landing, the turn),
  `textEffects.test.js` (the odometer, fly and fan, effects taking turns), `anatomyWords.test.js`
  (marks about the dial, words thrown and drawn, the clock they land by), `knobPresets.test.js`
  (the ten presets, applied), `animationPlayback.test.js` (Play on a step).
- Browser checks: `knobShowcase` (Fan in, Fly away taking turns, Number stream, Delta, the Odometer,
  Choice names both ways, Big number, Units, Detent), `animationTab` (the Words kind and Steps, the
  Knob section's 49).
- WebKitGTK 2.52 draws the fan about the dial's centre, the flights, the thrown words and the
  odometer as Chromium does, posed part-way through each.

