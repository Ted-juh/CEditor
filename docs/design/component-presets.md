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


## The Slider (2026-11-26)

The owner's next component after the Knob: the linear slider, read as a fader. Built on the Knob's
decisions as they stand (eight panels, every preset in the library under the component, a set a
panel, what plays today first), so nothing new was put to the owner; what differs is recorded here.

**Its presets** (`utils/sliderPresets.js`, ids `ce:slider:<name>`, category Slider) are the Knob's
groups, read for a control that travels along a line: its cap is the pointer (`pointerCurrent`), its
fill the arc (`bodyTrackFill`), its readout rides beside the cap, and its ticks, and the numbers it
prints with its big ticks (`Behavior.tickNumerals: 'value'`), stand along the track. Both components
are written with one kit (`utils/componentPresetKit.js`: the shapes, the triggers, the name ↔ value
and Decode recipes, and the catalogue they are built into); the Knob's came out byte for byte as
before. The library lists **Slider** after **Knob**.

| Group | Slider preset | How it differs from the Knob's |
|---|---|---|
| Numbers | Fly-out, Name ↔ value, Decode, Cap label, MAX stamp, From the synth, Number stream, Odometer, Delta, Units, Big number, Choice names | Cap label is the Knob's Tip label; words are thrown out beside the cap; Odometer, Units and Choice names read beside the cap (there is no cap to sit in); Choice names **rolls** up and down, the way a fader's choices go |
| Ticks | Big then small, Grow, Middle out, Countdown, Ripple, Burst, Fly away, **Unfold** | Middle out is Centre out; Burst flies each tick in from the side; Unfold is Fan in on a line: every tick slides up the track out of the first one |
| Touch | Lift, Grip, Glow, Readout, Focus ring, **Nod** | Lift and Grip move the cap through `Layout.lift`; Glow breathes the fill (a slider lights it while dragged already); Nod replaces Sheen, which a fader's drawn caps have no gradient for |
| Moving | Glide, Snap, Spring, Overload, Modulated, Detent | the Knob's Turning |
| Attention | Fill sweep, Rise to value, Fall to value, Reach full, Wiggle, Beat pulse | Fill sweep is Ring sweep |
| Gestures | Reset flash, **Throw**, Notch, Pop, Nudge, Default stamp | Throw replaces Spin: on a flick the drawing overshoots along the track and settles; Nudge shakes sideways |
| Words | Scale types in, Numbers roll, Scale counts up, Readout doors, Shimmer | on the numbers printed with the big ticks |

| Panel | Set | Why that set |
|---|---|---|
| Numbers | Soft, on its own light panel | a round cap and a fill the readout reads against; its readout is its label ink, which reads on its panel and not on a dark one |
| Ticks | Dual Scale (small ticks turned on) | a long scale of ticks, a billet cap |
| Touch | Broadcast | a console cap big enough to see it lift |
| Moving | Frost | a bold fill, so the way it moves is all there is, and yellow, so Overload's red reads (on Pop's coral it barely did) |
| Attention | Backlit | a glowing fill whose sweeps read from across the panel |
| Gestures | Carbon (ticks turned on) | an orange fill and ticks for Notch; a dark cap, so Reset flash's white reads; an orange readout for Default stamp (Anodised's, its cap colour, is near-black, so the stamp went on unseen) |
| Words | Blueprint | numbers printed up the scale |
| Together | Aerospace | a mixing desk's row of faders |

None is a set the Knob's panels use.

### As built

What a line needed, each found by watching a preset not play, or play wrong, in Preview:

- **A readout clears the cap.** On a vertical slider the readout was centred a fixed 22 px right of
  the cap, so a word ran under a wide fader cap ("Pulse" read "ulse"). It now starts just past the
  cap's edge and reads away from it (SliderFamilyRenderer `labelAnchors`, `align: start`); a
  horizontal slider's stays centred above it.
- **And clears the scale.** A vertical slider's ticks stand right of its track, and a numeral past
  each big tick that is one; Readout doors, on the Words panel, printed 0.51 over the scale's own 0.5.
  The readout starts past whichever reaches further, the cap or the scale (`scaleReach`: the ticks
  drawn outside or across the track, a numeral's text at its font size); ticks drawn inside leave it
  at the cap. It was as close before: centred 22 px right of the cap, it stood on the numbers too.
- **A fader cap lifts.** Lift and Grip patched a scale nothing drew on a linear cap. Not
  `Layout.scale`, though: every slider and knob ships states that patch its pointer's scale (1.08
  while it is the active handle, which a single value always is), never drawn on a fader cap, and
  drawing them would have enlarged every slider there is. A cap's **`Layout.lift`** is drawn as a
  scale about its centre, with its own transition (`capLiftStyle`), in a group round the cap that
  only a cap with a lift gets: no shipped state touches it, and Lift and Grip set it to 1 at rest (a
  preset field). Keyed on the field, not on a transform transition, which every slider's own glide
  is; and a cap without it is drawn straight into the SVG as before, which the component harness's
  cases rely on (they found the first version, which wrapped every cap). It is a transform to the
  Animation tab (`PART_PATH_BUCKETS`).
- **Words are thrown on a line.** The renderer threw words round a dial only. On a slider a word
  leaves the cap's outer edge (or the cap, `centre`) and flies away from the track, sideways on a
  vertical fader and up on a horizontal one, or up; beside a vertical cap it reads away from it, as
  the readout does.
- **Ticks fly and unfold on a line.** `markGeometry` takes a slider's marks with the points on the
  track they stand at: a fly comes in from 40 px out along the line from the track through the mark
  and goes out that way; a fan slides each mark from the first one's place (`--ce-fan-x/-y`, the fan's
  pose now a translate and a turn, which round a dial is the turn alone).
- **A gesture plays a value effect, and words.** A click, a flick or a long press played keyframes and
  text effects only; the Animation tab offers the Value and Words kinds every gesture, and those never
  played. Throw found it (`gestureEvents.js` `GESTURE_KINDS`).
- **Two panels' sets, changed after watching them.** Overload turns the fill red, and the Moving
  panel's Pop draws a coral fill, against which it barely showed; Frost's is yellow. A fader's
  readout is drawn beside the cap, on the panel, and was in the cap's colour (`{control.cap}`):
  Anodised's is near-black, a colour for its own light grey panel, and on the Gestures panel's dark
  ground Default stamp played and nobody could see it (the Knob's sits in the cap, where the cap's
  colour reads). Carbon's is orange, and its dark cap shows Reset flash's white, which Anodised's
  pale one hid. A test holds every readout a showcase fader shows to 3:1 against its panel's ground.
- **A fader readout colour in every set** (the owner's decision 9 in changeable-control-sets.md).
  Measured against each set's own panel, which is the ground a set is made for, 35 of the 79
  built-ins put the cap-coloured readout under 3:1 (an earlier count here, 28 of 69, measured every
  set against one dark ground, which is not the question). A set now holds `control.readout`, which
  reads on its panel as drawn, and a fader draws its readout in it; a knob too, and in its cap a
  knob's readout is lettered to read on the knob (decisions 9 and 10 there). Soft is a set for a light panel, so its readout is its dark label
  ink, and the Numbers panel, whose readouts are the point, is on Soft's own panel colour with dark
  captions; the other panels' sets read on their dark grounds as before.
- **The showcase's set check compared objects.** A panel stores its set as `{ id }`, and both
  components' tests put those in a `Set`, so two panels in one set always passed; the Slider's
  Numbers panel was in the Knob's Numbers set. Compared by id, and moved.

Verified locally:
- `test/sliderAnimationPresets.test.js` (new): the catalogue; every preset survives its file; each fits a
  fader, one in its panel's set, and in the other sets fits or says what is missing; Lift and Grip
  through `Layout.lift` and the shipped scale left alone; the readout presets; Unfold, Throw, the
  stream; loops; the library; the panels, a set each and none the Knob's; every readout a showcase
  fader shows reads against its panel's ground.
- `test/anatomyWords.test.js`: marks on a track, the readout past the cap and past the scale (its
  ticks, its numbers; ticks inside leave it at the cap), a cap's lift (and nothing
  at rest), words thrown beside a fader. `test/gestureEvents.test.js`: a value effect and words on a
  gesture.
- The browser check `sliderShowcase` (new): Unfold, Fly away, Lift and Grip (and no scale at rest),
  the readout past the cap, Number stream, Delta, Choice names both ways, Throw, Follow the leader.
  `animationTab`: the library's two sections.
- WebKitGTK 2.52 draws Unfold, the flights, a lifted cap, the readout and a thrown word as Chromium
  does, posed part-way through each.

## The Button (2026-11-26)

The owner's third component, and the first whose drawing the Knob's groups do not fit: a button has
no pointer, no fill and no readout, and most sets draw it as a device key built from parts (a
housing, a key, a symbol, an indicator lamp and a legend, `models/buttonDeviceParts.js`), a few as a
flat face (the Graphites, Ceramic) and two as an illustration (Iris, Satellite). Put to the owner
with a catalogue of eight groups, in two phases, and the owner chose both:

1. **What plays today**: motion of the whole button, which every one of the three drawings shows.
   Press, Attention and Gestures, and Together.
2. **What a key's parts need the engine to learn**: on a device key only the whole control moves
   today (`ButtonDeviceParts.svelte` takes no animation of its parts), so the lamp, the legend's
   words and the key itself cannot be animated apart from the rest. Light (the lamp), On/off (a
   toggle's latch), Words (the legend), Signals (sent, done, refused), a word thrown from a button,
   a hold's progress, and Together's Chase and Radio follow.

**Its presets** (`utils/buttonPresets.js`, ids `ce:button:<name>`, category Button), phase 1:

| Group | Presets |
|---|---|
| Press | Sink, Lift, Bounce back, Jelly, Tilt, Focus nod |
| Attention | Pulse, Breathe, Wiggle, Beat pulse, Look here, Alarm, Pop in |
| Gestures | Double flash, Pop, Nudge, Spin, Wheel bump |

Written with the Knob's and the Slider's kit; each entry names the kind of button the showcase puts
it on (`type`, `MomentaryButton` for all of these). Every one goes on a momentary button and a
toggle in every set the showcase uses. The library lists **Button** after **Slider**.

| Panel | Set | Why that set |
|---|---|---|
| Press | Tolex | a round cream cap on a dark tolex panel, whose sink and lift read |
| Attention | Pop | a paper slip with a hard shadow, which shows a pulse and a pop in |
| Gestures | Machined | a hex key with a lit lamp, whose turn shows in a spin |
| Together | Rackmount | a row of legend-bar keys, a drum machine's |

None is a set the Knob's or the Slider's panels use. Each panel is on its set's own panel colour,
since a key's legend is lettered for it; Machined's and Rackmount's are lightened (C4C8CE and
BFC2C6), because a mid grey under their finish leaves black at 5:1 at best and no coloured caption
at 4.5:1. Every caption reads at 4.96:1 or better on its panel as drawn.

### As built: phase 1

- **A preset's state no longer keeps what the button's type made.** Sink deepens a press, and on
  every button it pressed to 0.985, a pixel and a half on a 100 px key. A preset merges its states
  into the control's and keeps every value the control already sets, so that an author's number
  wins (`applyPresetPatch`, and the Animation tab's own presets in `animationPresets.js`), and every
  button is made with a Pressed state that scales to 0.985 (`componentTypes.js`
  `createButtonStates`). That 0.985 was kept as if somebody had chosen it. The Animation tab's
  **Press squish** has always done the same on a button: it asked for 0.94 and kept 0.985. A value
  still at what the type made the state with is now the type's, and gives way
  (`utils/authorsStateValue.js`); a value anyone has changed is kept, as before. No other showcase
  panel changed.
- **Together** plays Pop in (each key hidden until its turn, then grown in past its size), Wave (the
  keys rise in turn) and Ripple, a scene whose trigger is a click on the first key, a press passed
  along the row. The proposal's Chase and Radio follow light lamps and follow a toggle, which is
  phase 2.
- **Focus nod plays when Tab reaches the key.** Tab moves on from wherever focus is, and from the
  editor's own toolbar it walks a dozen of the editor's controls before it reaches the panel, so the
  manual says to click the panel first; from there the keys are tab stops in their order.
- A key is 200 by 100: the legend sits under the key in every set the showcase uses, and the key is
  large enough to see a sink of a tenth.

Verified locally:
- `test/buttonAnimationPresets.test.js` (new): the catalogue; every preset survives its file and
  fits a momentary button and a toggle in every set the showcase uses; a state's value replaces the
  type's and never an author's (Sink, and Lift and Tilt beside what is there); loops; the library;
  the panels, a set each and none the Knob's or the Slider's, Ripple on a click on the first key, a
  script for Look here; every caption at 4.5:1 on its panel as drawn. `test/animationPresets.test.js`:
  Press squish on a button. `test/showcaseCollections.test.js` now holds the Slider's and the
  Button's committed panels to their script as well (the Slider's were held by
  `export-showcases.mjs --check` only).
- The browser check `buttonShowcase` (new): Sink at 0.9 while held, Lift, Focus nod on Tab, Spin on
  a flick, Wheel bump, Pop in hidden until its turn, Ripple on a click. `animationTab`: the library's
  three sections.
- Every preset driven by hand in Preview, in Chromium; no drawing code changed, so WebKitGTK was not
  asked.

### As built: phase 2, a key's own parts

**The engine.** A device key drew its parts and played nothing on them: `ButtonDeviceParts.svelte`
took only the parts and whether the key was down, and the canvas handed `ControlAnatomy` only the
text effects of a knob's words. Now:

- A **keyframe animation on a part** (`Parts.indicator`, `Parts.key`, …) moves and fades it about
  its own centre, on a group of its own inside the part's travel, so a lamp that flares still rides
  a key that goes down.
- A **colour frame on a part** recolours every shape that part paints with (the shape channel,
  `--ce-kf-shape`), and no other part: every part sets all its channels, `none` where it has
  nothing, as the knob's parts do.
- A **state change eases a part's colour and opacity** on the part's own timing (a lamp that fades
  up as the toggle goes on). The fill is a style now, not an attribute, so a transition can reach
  it. A part's travel (`travelX`, `travelY`, `swing`) is still an SVG transform attribute, which no
  transition moves; a preset that wants a key to go over slowly cannot ask for it yet.
- The **legend plays a text effect** on its words, whole (SVG text has no letters to move one at a
  time), in a box of its own for a roll or a push.
- A **button's caption plays the control's own text effects**, whole, and its text colour frames
  (`--ce-kf-text`). On a key the caption is the only place the button's words are drawn, and no
  effect on them played before.
- **A preset on a part a set does not draw is refused, saying why**, judged as the panel's set
  draws the button (`keyPartsNotDrawn`, given the drawn control by the library). A button keeps its
  six parts hidden in the document whatever its set draws, so the stored control cannot say: a lamp
  preset on Graphite's flat face, or on Tolex's key, which has no lamp, is refused; on Stompbox's it
  goes on.

**The presets**, 23 more (41 in all):

| Group | Presets | On |
|---|---|---|
| Light | Lamp fade, Afterglow, Flare, Breathe while on, Beat blink, From the synth | the lamp |
| Switch | Kick, Key lights, Housing flash, Guard glow, Caption turns | the key, its plate, its guard, the caption |
| Words | Roll in, Push on press, O / I roll, Hover fade, Ink flash, Wipe | the caption, the legend |
| Signals | Sent, Refused, Pending, Done, Working, Alert | the lamp, the key, the caption |

"On/off" in the proposal is **Switch**: a slash cannot go in the panel's file name.

| Panel | Set | Why that set |
|---|---|---|
| Light | Stompbox | an amber lamp on the key that lights on a momentary button and a toggle alike |
| Switch | Bakelite | a rocker that tilts over, with a guard round it and a lamp that lights |
| Words | Neon | a toggle whose legend reads O and I, on a dark panel |
| Signals | Porcelain | a lamp on a light key, where green, amber and red read |

**Together** gains **Chase**: a light runs along the bars printed on the keys, a clip on each key's
`Parts.symbol`. A clip waiting for its turn shows its first frame, so its first frame names no
colour and the light comes on just after.

**Found while building it:**

- From the synth's stand-in script did not load: it named a variable `on`, which the script API
  already passes every script, and the console said "invalid redefinition of parameter name". The
  browser check now opens the Light and Signals panels with their scripts trusted and fails on any
  script error.
- **Left for the owner, then fixed at their word:** in three sets (Ivory, Pop, Atelier) a toggle's
  caption is white once it is on, on a light panel, and cannot be read (1.2 to 1.4:1). The type's
  Selected state letters the text in the set's inverse colour, made for a filled face; on a key the
  caption stands on the panel. The other 58 sets that draw a toggle as a key happen to have an
  inverse that reads there. See "A toggle's caption when on", below.
- **Not built in this half:** a word thrown from a button (emitted words were a knob's and a
  slider's, from a pointer a button does not have) and a hold's progress on a timed button. Both
  were in the proposal, and neither had an engine to play on. The owner asked for them next: see
  "What the second half left", below.

Verified locally:
- `test/buttonDeviceAnimation.test.js` (new) renders keys through `ControlAnatomy`: every part's
  channels `none` at rest and its shapes painting through them; a part's keyframes on its own group
  and its colour on it alone; a part's colour and opacity eased on its timing, and not its travel;
  the legend's words with an effect, in a box when it moves them; the caption with the control's
  effect, and its colour frames otherwise; a knob's caption untouched. All five fail on the
  renderer as it was.
- `test/buttonAnimationPresets.test.js`: seven groups; each key-part preset goes on its panel's set
  as drawn; refused on Graphite's flat face and on Tolex's lampless key, through the library too;
  loops; the panels, Chase on `Parts.symbol`, the scripts, a toggle that starts on.
- The browser check `buttonShowcase`: Lamp fade eases, Flare grows and whitens the lamp, From the
  synth flashes under its script and the script loads, Key lights eases, the O / I legend rolls, Ink
  flash colours the caption, Alert's script blinks the lamp red, Chase lights a few bars at a time.
  `animationTab`: the library's Button section in seven groups, 41 presets.
- Every second-half preset driven by hand in Preview, and its part read as it played.
- WebKitGTK 2.52 against Chromium, on live loops on a key's parts (a lamp that grows, a key that
  changes colour, a lamp that fades amber, a caption and a legend that roll): the same values
  computed through the loop in both, and drawn the same.

### As built: what the second half left (2026-11-27)

The owner: "Build what is not built yet." The two pieces the second half recorded as not built.

**Words thrown from a button.** Thrown words (the emit kind) were a knob's and a slider's: the
value, or how far it moved, from the pointer's tip. A button has neither a value to speak of nor a
pointer.

- An emit now also throws **words of its own** (`shows: 'words'`, `words` up to 24 characters:
  "+1", "SENT") or **a count** of how many times it has thrown (`shows: 'count'`), and neither
  needs a value (`keyframeAnimation.js`). A knob or a slider can say these too.
- On a button a word **rises from the key** (`from: 'centre'`) or from its top edge (`'tip'`), in its
  caption's colour and face, drawn by CanvasControl in a layer beside the control's content, not in
  it, so the box does not cut it off as it rises. Over a device key and a flat face alike.
- A button is offered the Words kind in the Animation tab, as words or a count, from the key or
  above it, always rising; a preset that throws the value is refused on a button, saying why.

**A timed button's hold.** A timed button marks itself `pending` while it is held to confirm (or
waits for its second click) and `executed` when it fires (`utils/timedButtonPreview.js`), but nothing
knew how far through the hold it was.

- A keyframe animation can now play on **`hold`**: from the moment the button is held, once, over
  exactly as long as that button must be held (or, for a double-click one, its wait for the next
  click), stopping where it is if the button is let go early. The runtime gives the entry the
  button's own hold time (`interactionRuntime.js`), so a preset need not know it: the same preset
  fills over 1.5 seconds on one button and 3 on another. Offered in the Animation tab on a timed
  button only, as "While held to confirm"; the stage's Play holds the button that long and lets it
  fire.
- A timed button has no state for having fired, so a preset that plays when it fires brings an
  Executed state with no look of its own, as presets bring states a control lacks.

**The presets**, 11 more (52 in all):

| Group | Presets |
|---|---|
| Thrown | +1, Count, Says so (ON and OFF), Sent word, Times two, Held |
| Hold | Lamp fills, Key fills, Swell, Tremble, Confirmed |

| Panel | Set | Why that set |
|---|---|---|
| Thrown | Switchboard | a caption that reads on a dark panel, which a thrown word takes the colour of |
| Hold | Hi-Fi | a key with a lamp that can fill, on a timed button |

Verified locally:
- `test/buttonThrownAndHold.test.js` (new): words of their own and a count, needing no value, a count
  counting; a button offered words or a count and refused the value, the Words kind starting from
  "+1", rising from the key; the hold trigger playing from the hold, over the button's own hold time
  (a double-click one's wait, slowed with the preview), one run while held, gone when let go early,
  again when held again; the preset's Executed state firing what plays then; the stage's Play
  holding for the button's hold; a slider saying words and counting.
- `test/buttonAnimationPresets.test.js`: nine groups; a timed button for the Hold group and only
  there; Thrown throwing words or a count, rising; Hold playing over the hold or as it fires, and
  bringing an Executed state exactly when it plays on one.
- `test/keyframeAnimation.test.js`: the trigger list and an emit's fields, with `hold` and `words`.
- The browser check `animationTab`: a timed button offered the Words kind, as words or a count from
  the key, and the hold trigger, which a knob is not offered; the library's nine Button groups.
- The browser check `buttonShowcase`: "+1" rising and fading on a click, Count counting 1, 2, 3; the
  lamp filling steadily over the hold, back as it was when let go early, OK thrown when it fires.
- Every new preset driven by hand in Preview. The hold draws through the same part animations
  WebKitGTK was checked on above; the thrown words are plain HTML with the slider's thrown words'
  CSS, and were not re-checked in WebKitGTK.

### A toggle's caption when on (2026-11-27)

The owner: "Fix the toggle caption in those three sets."

Every toggle is made with a Selected state that letters its caption in the set's inverse text
colour (`componentTypes.js` `createButtonStates`). That is for a flat face, which the same state
fills with the checked colour: the words sit on the fill. A set that draws the toggle as a key fills
no face; the caption stands on the panel beside the key, where the inverse colour is the one made
not to read. In Ivory, Pop and Atelier, light panels whose inverse text is white, the caption went
white as the toggle went on.

On a key, a Selected caption colour still at what the type made the state with is now dropped, and
the caption keeps its own colour on or off (`models/keyCaption.js`, applied in
`resolveControlFamily`). A colour an author chose is kept; a flat face, which fills, keeps the
inverse colour. Measured over every set: the caption changed colour as the toggle went on in those
three and no other, and it now changes in none. Ivory's, Pop's and Atelier's read at 12.0 to 13.6:1
on their panels, on or off.

It is in the family step rather than with the colours because Preview applies a control's states to
its family-patched self (a set may replace a state), and a caption colour a state has written there
is one nothing afterwards can take back: the first version, applied with the colours, gave the
right colour to a test that resolved in that order and left Preview's caption white.

Five starter panels store the change as data: Pop's (white to its caption's dark ink), and Arc Line,
Diesel, Recessed and Touch Encoder, whose inverse colour was already their caption's, so nothing
there looks different.

A toggle's Mixed state letters its caption the same way, and this first change left it for the
owner: on a key it read under 3:1 in 26 sets, and fixing it changes 33 sets' look.

Verified locally: `test/keyCaption.test.js` (new) holds every set's key caption the same colour on as
off, in Preview's order (family, states, colours) as well as the canvas's; Ivory's, Pop's and
Atelier's at 4.5:1 or better on their panels; a flat face untouched, Graphite's on caption still its
inverse; an author's colour kept; the stored control untouched. Three of its tests fail on the code
as it was. Seen in Preview: the three sets' toggles, off and on.

### A toggle's caption when mixed (2026-11-27)

The owner, shown every affected set at rest, mixed as it was and mixed with the rule: "Yes, apply
it."

The Mixed state is made the way Selected is, its caption in the set's inverse text colour for a face
it fills with the mixed colour, and on a key it went wrong in more sets than Selected did, since a
set's inverse text is so often its own panel's colour. Measured on each set's panel, in Preview:

| Before | Sets | Mixed caption before → after |
|---|---|---|
| Unreadable | 26 | 1.0 to 2.6:1 → 5.2 to 17.9:1. Most were the panel's own colour (Neon, Blueprint, Phosphor, Backlit at 1.00:1; Tolex 1.01:1): the word was simply gone |
| Weak | 3 | Flightdeck 3.38 → 4.16, Obsidian 3.47 → 4.05, Machined 3.88 → 4.02. No better than their caption at rest, which is itself about 4:1 on those panels: a matter for those sets' own caption colour, not for this rule |
| Readable | 4 | Rackmount 6.41 → 5.57, Console 6.83 → 6.21, Aerospace 14.31 → 14.83, Ember 17.22 → 16.11 |

So `keyCaption.js` drops a Mixed caption colour still at what the type made it with, as it does
Selected's, and the caption is one colour on, off and mixed. What is given up: Obsidian and
Aerospace tinted the mixed caption light cyan, a sign of the state in the word itself, and it is now
the caption's colour at rest. In every other set the colour Mixed gave the word was the panel's or
near it, so there was no sign to lose. The key and its lamp still show the state, as they do on.

46 starter panels store the change as data, one line each: Mixed's caption colour removed. 22 of
them are of the 33 sets and look different; in the other 24 the inverse colour was already the
caption's, and nothing there looks different.

Verified locally: `test/keyCaption.test.js` holds every key's caption the same mixed as off, in
Preview's order as well; all 26 that were unreadable at 4.5:1 or better on their panels; Graphite's flat face
still inverse when mixed; an author's mixed colour kept; the stored control untouched. Three of its
tests fail on the rule as it was. Seen in Preview: all 33 sets, at rest, mixed before and mixed
after.

### Left open (2026-11-27)

The owner asked for what still needs doing on the Button to be written down before the next
component. Everything asked for is built and verified locally; these were not done.

1. **Thrown words, on Linux.** A button's thrown words (+1, a count, ON and OFF, SENT, ×2, HELD) are
   drawn in a layer of their own beside the control's content (`CanvasControl.svelte`, `.key-words`),
   with the slider's thrown words' CSS, which WebKitGTK draws as Chromium does. The button's layer
   itself has not been watched in WebKitGTK. To do: open the Thrown panel in a WebKit2 4.1 `WebView`
   under Xvfb (CLAUDE.md, "WebKitGTK draws SVG differently", says how), click each key, and compare
   with Chromium.
2. **A toggle made to start on, in an exported plug-in.** Fixed in Preview by `ba23459`
   (animation-designer.md, "Corrected: the wipe, and a toggle made to start on"). The player uses
   the same surface and store (`Player.svelte` reuses `PanelPreviewSurface` and
   `stores/interactionPreview.js`), so the fix reaches it, but no exported plug-in has been clicked.
   To do: export a panel with Breathe while on or Key lights, load it in a host (or the standalone
   player), and switch the toggle off and on again.
3. **Three sets' captions at rest, for the owner.** In Flightdeck, Obsidian and Machined a key's
   caption reads at about 4.0 to 4.2:1 on its set's panel at rest, under the 4.5:1 the other sets
   reach, and so on and mixed too, since a key's caption is now one colour in every state. That is
   each set's own caption colour, not the Button's animation, and changing it changes those sets'
   look: the owner's call. The Button's panels are not in those sets, except Gestures in Machined,
   whose panel colour was lightened so its captions read (see the table above).
4. **Windows CI on `ba23459`.** Running when this was written. The run on `457bfe1` failed one
   browser check, `profileDesigner` (a device profile of 7,710 parameters, its last row reached by
   scrolling), which neither the Button nor the caption touches; the next run, on `9406d2d`, passed
   every job. If `ba23459` fails, it is read and reproduced here before anything is pushed again.

## The Choice group (2026-11-27)

The owner's fourth component, chosen after the Button over the Meter, the LCD and the wheels: the
choice group (`RadioButtonGroup`, redesigned on this branch, [choice-group.md](choice-group.md)). Put
to the owner as a catalogue of eight panels in two phases, with a set for each; the owner chose both.

**What it draws.** One of five styles, the control's own (`Behavior.visualStyle`, not the set's):
segmented, buttons, radio, LED and tabs. CanvasControl places and resolves each option
(`choiceGroupLayout.js`, `choiceGroupStyle.js`) and `ChoiceGroup.svelte` draws them: a body, an
indicator (a ring and dot, a lamp, an underline) and a label. The control's interaction states are
its options' (hover, pressed, chosen, focused), evaluated for each option and patching that option.

**What plays today, and what does not.** Everything that moves the whole control: its keyframes
play on the group as on any control. Its value triggers fire: the runtime gives the chosen option's
place along the options as the value (`interactionRuntime.js`), so On change fires on a new choice
and Each step knows whether the choice went on or back. Nothing reaches an option on its own: no
keyframes, no eased change of look, no text effect on its label, and no thumb, since each option
paints its own body and the chosen one's simply appears where the last disappears.

1. **Phase 1, what plays today**: the whole group. Attention, and Choosing, which needed one thing
   the engine did not have: a keyframe animation that goes the way the step went (below).
2. **Phase 2, options as parts**: what needs the engine to animate one option, or something that
   travels between them. Thumb, The chosen, Appear, Hover, New options, and Together.

| Group | Phase | Presets |
|---|---|---|
| Attention | 1 | Pulse, Breathe, Wiggle, Beat pulse, Look here, Pop in |
| Choosing | 1 | Lean (the group leans the way the choice went), Blink (once on any new choice), Tick (a knock at each new choice) |
| Thumb | 2 | Slide, Spring, Stretch (segmented and buttons); Underline glide (tabs); Dot hop (radio); Lamp run (LED: the light runs through the options between) |
| The chosen | 2 | Pop, Press in, Glow, Label roll, Ink flash, on the option just chosen |
| Appear | 2 | Cascade, Fan out from the chosen, Typewriter labels, Drop in |
| Hover | 2 | Lift, Spotlight (the others dim), Grow label |
| New options | 2 | When a dependent group's list changes: Roll over, Crossfade, Cascade the new ones |
| Together | 2 | Scenes over a row of groups: Cascade in, Ripple, Wave |

| Panel | Set | Why that set |
|---|---|---|
| Attention | Atelier | a black thumb on cream, bold enough to read a pulse from across the panel |
| Choosing | Ember | copper keys on a dark brown panel, whose lean and tick read in the buttons style |
| Thumb | Eurorack | a bright green thumb on brushed grey, the one most worth watching travel |
| The chosen | Chrome | a glossy blue thumb on navy, for a pop and a glow |
| Appear | Satellite | pale pill outlines on a blueprint grid, options that read as they arrive |
| Hover | Ceramic | a flat light face, where a lift and a spotlight show without a finish in the way |
| New options | Studio White | white keys with a teal thumb, words easy to watch change |
| Together | Receiver | blue on brushed silver, a hi-fi's row of selectors |

None is a set the Knob's, the Slider's or the Button's panels use. Chosen from Preview renders of
the five styles in each of the 40 sets none of them uses; Satellite and Gemstone drew alike, so Hover
went to Ceramic.

### As built: phase 1 (2026-11-27)

**Its presets** (`utils/choicePresets.js`, ids `ce:choice:<name>`, category Choice group), written
with the kit the Knob, the Slider and the Button use, each on a `RadioButtonGroup`. Every one goes on
a choice group in each of the five styles, as Atelier and Ember draw it. The library lists **Choice
group** after **Button**.

| Group | Presets |
|---|---|
| Attention | Pulse, Breathe, Wiggle, Beat pulse, Look here, Pop in |
| Choosing | Lean, Blink, Tick |

Two panels, `CE/panels/Components/Choice group/`: Attention in Atelier's segmented strip, Choosing
in Ember's keys, each on its set's own panel colour with captions at 4.5:1 or better as drawn.
Look here plays from a script, as the Button's does. Lean starts on its middle option, so it can
step either way.

**A keyframe animation that follows the turn.** Each step already knew which way the value went, and
a text effect could go that way; a keyframe animation could not, so a lean toward the next option
leaned the same way whichever option was chosen. A keyframe animation on Each step may now be set
to follow the turn (`followTurn`; in the Animation tab, **Step back: Mirrored**, under Steps): a
step back plays it mirrored side for side, every sideways move and turn the other way, from a rule
of its own (`keyframeAnimation.js` `mirroredEntry`). Up and down, size and fade stay as written.
On any other trigger it means nothing: On change does not know which way it went.

Verified locally:
- `test/choicePresets.test.js` (new): the catalogue, each preset surviving its own file and going on
  a group in every style; a choice is a step the way it went (the option's place along the options);
  Lean leans right going on and left going back, a rule of its own, and Tick the same both ways;
  nothing loops but Pulse and Breathe; the library; the panels, their sets (none another component's)
  and styles, the presets they carry, Look here's script; every caption at 4.5:1.
- The browser check `choiceShowcase` (new): Lean leans right toward a later option and left toward an
  earlier one, and settles; Blink dims and comes back; Tick knocks down; Pop in is hidden as Preview
  opens and grows in; Pulse keeps on; Look here jumps under its script; Beat pulse swells on the
  transport's beats. `animationTab`: the library's Choice group section, and Step back offered on Each
  step for keyframes, written as `followTurn`, and not on On change or for thrown words.
- Both panels seen in Preview.

### As built: phase 2 (2026-11-27)

**The options as parts.** A choice group now has five parts of its own, drawn from its rows rather
than stored under `Parts` (`choiceGroupLayout.js` `CHOICE_PARTS`): **Thumb** (`thumb`), the mark of
the choice; **Chosen option** and **Chosen label** (`chosen`, `chosenLabel`), the option just
chosen and its word; **Every option** and **Every label** (`option`, `optionLabel`). The Animation
tab's path bar, a preset's fit check and the target tree offer them on a choice group and on nothing
else, so a Slide preset applied to a knob is refused with "does not have: thumb".

- **The thumb** (`utils/choiceGroupMotion.js`). Unanimated, each option draws its own mark of being
  chosen, and a new choice moves it at once. Anything played on `Parts.thumb` draws the chosen
  option's mark apart, on a layer of its own, and the option draws itself as if not chosen: the
  strip's thumb or the chosen key's colour (segmented, buttons), under the words, over a key that
  stays a key (a strip's options have no face of their own); the radio's dot and the lit lamp over
  their rings, every lamp drawing unlit; the tab's underline. It stands as four edges, and a
  transition eases them: the edge ahead (as it travels) on the timing of `Parts.thumb.Layout.x`, the
  edge behind on that of `Parts.thumb.Layout.width`, the cross axis with the edge ahead. Equal
  timings slide it whole; a slower one behind stretches it toward the new option and draws it in.
  Keyframes on the thumb (Dot hop's hop, Lamp run's flare) play on that layer.
- **The chosen**: keyframes, colour frames and text effects on `chosen` or `chosenLabel` play on
  the chosen option alone. Glow flashes the face's fill, which a face painting a solid colour shows.
- **Every option, one after another** (`utils/optionStagger.js`). An animation on `option` or
  `optionLabel` may take **Each option** so many ms after the last (`optionStagger`, 0 to 2000) in
  an order (`optionOrder`: **In order**, **Last first**, **Out from the chosen**). The player writes
  one rule for all the options; each option carries its rank as custom properties
  (`--ce-rank-forward`, `-reverse`, `-chosen`), and the delay is `calc()` over the one the order
  reads, so the player never counts options. A staggered keyframe animation fills backwards, so an
  option waits unseen for its turn; a text effect's pieces add the option's delay to their own.
- **An option's motion in its states** (`choiceGroupStyle.js`). A state's options patch
  (`patches.segments.shared`) may now carry `whole.scale`, `whole.opacity` and `label.scale`; it
  applies to the option the state is about, eased by a transition on `Parts.option` or
  `Parts.optionLabel`. A new option signal, `peerHover` ("another option hovered" in the States tab),
  is true on every option but the one under the pointer: Spotlight's dimming. The timings come from
  every transition on those parts, whichever state they are written for, so an option eases back
  out as it eased in.
- **When its options change** (`optionsChange`). A group whose rows follow another group's choice
  (`Value.dependsOn`, rows tagged with `parentValue`) gets a new list when that choice changes.
  CanvasControl notices the list it draws is different and asks for a play, as a script asks with
  `ce.anim.play`, once per change: keyframes and text effects can wait for it. The trigger is
  offered on a choice group only.
- **Presets carry state motion**. A preset's state may carry its options patch (`segments`, the
  shared layer only: a preset names no group's rows), and applying it fills in what the group's
  state lacks without overwriting what an author set (`mergedSegments`).

The player draws with the same Preview surface (`Player.svelte` uses `PanelPreviewSurface`), so all
of it plays in the exported plug-in. A script's `define` takes `optionStagger` and `optionOrder`.

**Its presets**, 21 more, with the same kit and ids:

| Group | Presets |
|---|---|
| Thumb | Slide, Spring (an overshooting curve), Stretch (the edge ahead in 180 ms, the one behind in 420), Underline glide, Dot hop, Lamp run |
| The chosen | Pop, Press in, Glow, Label roll, Ink flash |
| Appear | Cascade, Fan out (from the chosen), Typewriter labels (each label after the one before), Drop in (the last first) |
| Hover | Lift, Spotlight, Grow label |
| New options | Roll over, Crossfade, Cascade the new |

Each is shown in the style its group reads best in (`knob: { 'Behavior.visualStyle': … }`), and
plays in every style that draws what it moves.

Six panels more: Thumb (Eurorack), The chosen (Chrome), Appear (Satellite), Hover (Ceramic),
New options (Studio White) and Together (Receiver), each on its set's panel colour, Eurorack's and
Receiver's lightened from the brushed metal so every caption reads at 4.5:1. New options puts a
**Section** group over three that depend on it; choose Filter and the three take LP, BP and HP,
each playing its preset over them. Together is three scenes over rows of five segmented groups:
**Cascade in** (each group 140 ms after the last as the panel opens), **Wave** (the groups rise in
turn, always) and **Ripple** (a pulse along the row from a click on the first).

Verified locally:
- `test/choiceGroupParts.test.js` (new): the parts on a choice group and not on a knob; the thumb's
  box in every style, its direction and its two edges' timings; the stagger's `calc()` and the rank
  variables, the fill held backwards, and a text effect's pieces staggered by option; an option's
  scale and fade from its state, and from `peerHover`; a preset's state motion surviving its file
  and leaving an author's alone; `optionsChange` as a trigger of both kinds.
  `test/choicePresets.test.js`: the catalogue's 30, the library's seven groups, the eight panels.
- The browser check `choiceShowcase`, extended: each thumb travels through the options between and
  ends on the chosen one, Stretch more than twice its width on the way, and Spring's four keys all
  keep their faces while the colour travels (the key it went to first drew none, a hole in the row,
  until the recording showed it); Pop and Press in scale the
  chosen option alone, Label roll rolls it in pieces, Ink flash changes its ink; Cascade, Fan out
  and Drop in arrive in their orders and Typewriter labels finishes the first word before the last
  begins; Lift and Grow label grow the hovered option only, Spotlight dims the others to 0.35; a new
  section gives the three groups its options and plays them in; Cascade in, Wave and Ripple each go
  along the row in turn. `animationTab`: the five places on a choice group, Each option and Order
  on every option and not on the whole group, written as `optionStagger` and `optionOrder`, and
  When its options change offered on a choice group and not on a timed button.
- In WebKitGTK 2.52: a `calc()` delay over a custom property resolves per option (0, 0.11, 0.22,
  0.33 s), each held unseen until its turn; a transition with one timing per edge eases the edge
  ahead in its 150 ms and the one behind over its 600, as in Chromium.

## The Meter (2026-11-27)

The owner's fifth component, chosen after the Choice group over the LCD display, the pitch and
mod wheels and the keyboard. Put to the owner as eight panels in two phases, with a set for each;
the owner chose both.

**What it draws.** A meter shows a level that arrives from elsewhere: a route, a binding on its
`level` port or raw MIDI, another control named by `Meter.valueSourceId`, or a script
(`ce.components.meter.value`); else its own `Meter.value` (PanelPreviewSurface's
`applyMeterValueSource`, which the player shares). Nothing moves one on its own. The plain look
(`MeterRenderer.svelte`) is a bar, LED segments or an arc, with zones, a peak marker, ticks and
scale labels. Most sets draw it as device parts instead (`models/meterDeviceParts.js`: housing,
face, track, scale, indicator, marker, cover, legend, lamp; a needle that swings, a bar that fills,
lamps that light, a clip lamp). It prints no reading of its own: its reading is a Label showing its
value (`utils/labelShows.js`).

**What plays today, and what does not.** Keyframes on the whole meter. Value effects
(`utils/valueDrawn.js`): what the level draws moves and is handed back, the reading and what the
meter reports staying the level. Text effects on its reading's Label, as its words change. A
gesture (a click, a double-click) on it. Not:
- its parts: they are offered as places, and nothing they are given plays (`ControlAnatomy.svelte`
  hands the meter's parts no animations);
- its level as its value: a plain control's value signal is read from its Behavior, which a meter
  has not got, so On change and Each step never hear it, and nothing hears a clip;
- anything over the pointer: a meter has no States;
- how a needle moves: a bar or needle jumps to each new level, its peak marker the only thing eased;
- one lamp of a row, or the peak marker, alone;
- a level in Preview with nothing connected.

| Group | Phase | Presets |
|---|---|---|
| Attention | 1 | Pulse, Breathe, Knock (a click), Beat pulse, Look here, Pop in |
| Needle | 1 | Self-test (a full-scale sweep as the panel opens), Wake up, Beat kick, Tap sweep (a click), Shiver, Drop out (a double-click) |
| Readout | 1 | On its reading: Odometer, Reel, Roll, Push, Crossfade |
| Together | 1 | Scenes over rows of meters: Power-on, Spectrum, Chase, Beat bounce |
| Parts | 2 | Lamp flash, Face glow, Needle glow, Cover glint, Scale light-up |
| Level | 2 | Clip flash, Clip shake, Red wash, Peak flare, "OVER" thrown |
| Ballistics | 2 | VU, PPM, Bouncy, Lazy, Sticky peak |
| Segments | 2 | Cascade, Ripple, Sparkle, Peak drop |

Phase 2's engine work: a meter's parts that animate (as the Button's key parts do); its level as its
value, with triggers When it clips and When it crosses a level; a needle's ballistics (rise and fall
times, overshoot) as settings the Ballistics presets set; each lamp of a row, and the peak marker, a
part of its own, one after another as the Choice group's options are; and a test signal, so a meter
moves in Preview with nothing connected.

| Panel | Set | Why that set |
|---|---|---|
| Attention | Graphite Classic | the plain look: a bar in zones, segments and an arc, the meter every set starts from |
| Needle | Valve | a brown valve VU with its needle, where a sweep reads best |
| Readout | Ivory | a ruler and a pointer on cream: the reading under it reads plainly |
| Together | Phosphor | green lamps on black: a bank of them, an analyser |
| Parts | Anodised | a VU with a coloured scale, a lamp and a cover |
| Level | Carbon Pro | two rows of amber lamps, a clip worth seeing |
| Ballistics | Valve Console | a large cream VU, a needle worth watching move |
| Segments | Gimbal Ring | rows of lamps like a spectrum |

None is a set the Knob's, the Slider's, the Button's or the Choice group's panels use: chosen from
Preview renders of a meter, wide, in segments and as an arc, in each of the 32 sets none of them uses.

### As built: phase 1 (2026-11-27)

**Its presets** (`utils/meterPresets.js`, ids `ce:meter:<name>`, category Meter), with the kit the
other components' use. The library lists **Meter** after **Choice group**.

| Group | Presets |
|---|---|
| Attention | Pulse, Breathe, Knock, Beat pulse, Look here, Pop in |
| Needle | Self-test, Wake up, Beat kick, Tap sweep, Shiver, Drop out |
| Readout | Odometer, Reel, Roll, Push, Crossfade |

A meter has no States, so nothing waits for the pointer to be over it: what a hand plays, a click
(Knock, Tap sweep) or a double-click (Drop out) plays. A Needle preset is a value effect, refused on
a control that draws no value; each ends on the level. A Readout preset goes on the meter's reading,
a Label showing its value (`on: 'label'`), and plays on each new reading (`textChange`).

Four panels, `CE/panels/Components/Meter/`: Attention on Graphite Classic's plain bar, Needle on
Valve's VU, Readout on Ivory's ruler with each meter's reading under it, and Together in Phosphor.
Look here plays from a script. Readout's meters run from -48 to 0 dB, and a script stands in for a
signal, wandering each level every 1.2 s, so each reading changes and plays its effect; the panel's
scripts run once trusted. Together's rows are six meters side by side: Phosphor draws a meter as a
block of lamps of one shape, about 2.3 times as wide as tall, whatever the meter's box, so a tall
narrow one is a speck. Its scenes are value clips: Power-on as the panel opens, each meter 120 ms
after the last; Spectrum and Chase always; Beat bounce on the transport's beats.

Verified locally:
- `test/meterPresets.test.js` (new): the catalogue; each preset surviving its own file; every one
  going on a meter as each panel's set draws it, or on its reading; the Needle's refused on a button;
  each needle preset ending on the level; none waiting for a state; nothing looping but Pulse,
  Breathe and Shiver; the library; the panels, their sets (none another component's), what each
  meter or reading wears, Look here's script and Readout's signal; every caption at 4.5:1.
- The browser check `meterShowcase` (new): Self-test and Wake up move Valve's needle as Preview opens
  and hand it back; a click sends Tap sweep up and back to where it was, a double-click drops Drop out;
  Shiver keeps moving; Beat kick kicks on the transport's beats; Pop in is hidden as Preview opens and
  grows in; Pulse swells; a click knocks Knock; Look here jumps under its script; Beat pulse swells on
  the beats; each reading changes and starts its effect again with each new reading; Power-on reaches
  each meter of its row in turn; Spectrum and Chase keep moving; Beat bounce kicks its row.
  `animationTab`: the library's Meter section.
- All four panels watched in Preview.

**Found recording them, and fixed.**
- *A swap's words leaving were set flush left.* A Label that swaps its words (a reading, Name ↔
  value) draws the words leaving as a ghost while the new ones come in. The live words of a single
  line take their alignment from a style folded onto the line's span, and the ghost's lines were
  drawn without it: on a centred Label the old reading sat left of the new, "-8.9 dB-11.1 dB", in
  place of one fading over the other. The ghost now keeps each line's alignment and spacing from when
  its words were drawn (`CanvasControl.svelte`, `lineStyles`). Every swap on a centred or
  right-aligned Label had it; `meterShowcase` holds a crossfade's two readings centred on each other.
- *The Reel spun through letters.* A reel rolls through capitals, digits and signs unless it names its
  own; a reading's now rolls through digits.
