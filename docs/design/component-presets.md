# Components: each control's own animation presets, the Knob first

*Decided 2026-11-26 by the owner; the first half built the same day.*

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

Built: 39 presets, and the Together scenes. *Phase 2* is what needs engine work, with what it needs.

| Group | Preset | Plays on | What you see | |
|---|---|---|---|---|
| Numbers | Fly-out | let go | the value floats up off the pointer and fades | built |
| | Name ↔ value | while turning | the name Label pushes over to the value, and types the name back | built |
| | Decode | let go | the name Label shows the value while turning; let go, the name decodes back through glyphs | built |
| | Tip label | while turning | the value rides at the pointer's tip | built |
| | MAX stamp | at an end | MAX or MIN stamps on in red: two states with rules | built |
| | From the synth | MIDI in | a value from outside flashes the arc; your own turns do not | built |
| | Number stream | each step | every step throws its value out along the pointer | *phase 2:* a text emitter |
| | Odometer | each new value | only the digits that changed roll | *phase 2:* a per-digit reel |
| | Delta | each change | "+0.4" pops beside it and fades | *phase 2:* the change as words |
| | Units | hover | the unit slides in after the value | *phase 2:* part of the words changing |
| | Big number | press | the value fills the cap | *phase 2:* a readout placed in the cap |
| | Choice names | stepped knob | the new name pushes in the way you turned | *phase 2:* the turn's direction |
| Ticks | Big, then small | panel opens | the big ticks in order, then the small ones, then the numbers | built |
| | Grow | panel opens | each tick pops in, in order, the big ones first | built |
| | Centre out | panel opens | from the top outward both ways, the big ones first | built |
| | Countdown | double-click | the ticks go out from the top end down as it resets, and come back | built |
| | Ripple | hover | a warm light runs round the ticks | built |
| | Fly-out, Fly-away | panel opens; reset | each tick flies along its own line from the centre, or away | *phase 2:* a mark's own radial direction |
| | Fan in | panel opens | the ticks turn into place round the dial's centre | *phase 2:* a mark turned about the dial |
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
| | Detent | each step | the pointer pulses once per step | *phase 2:* a step as a trigger |
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

Left out, besides phase 2: Follow the leader as a library scene preset (a scene preset repeats one
slot over many controls; this one needs a leader and a slot per follower), and a value effect on a
knob's click (the click's own value change wins, which is worth a look of its own).
