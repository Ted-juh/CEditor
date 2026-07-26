# LCD Display — Component Design Notes

> Part of the [panel parts backlog](./README.md). Timing for this component is
> designed separately in [timer-system.md](./timer-system.md).
>
> Status: **idea / design exploration** (no implementation yet).
> Purpose: capture the property/feature surface for a ready-made-but-flexible
> `LcdDisplay` component so we can keep extending the list before building.
> Working branch: `claude/lcd-display-component-cnti4r`.

## Goal

A "ready-made" display component that drops in like a Slider or Button, ships
with believable presets, but exposes enough properties to simulate the wide
variety of hardware screens found on synths and MIDI gear (character LCDs,
graphic dot-matrix, segment displays, VFD, OLED, LED matrix). For *this* app the
real payoff is binding display fields to device parameters (patch name, the
parameter currently being edited, value bargraphs, etc.).

## How it fits the existing component model

Components are assembled from **sections** (see
`models/sectionDefaults.js`). An LCD reuses a lot of what already exists and
only needs a small amount of genuinely new structure.

**Reuse as-is:**

- `Text` / `Font` / `Multiline` — content, fonts, wrapping.
- `Text._children.Effects` (`TextEffects`) — glow, shadow, bevel, reflection,
  outline. Much of the "lit phosphor" look comes free here.
- `Background` (`Fill` / `Border` / `Corners`) — glass, bezel, frame, image
  fills, overlays.
- `Effects` (`Shadows` / `Bevel` / `Filters` / `Blend`) — bloom, blur,
  brightness/contrast, vignette-ish filters.
- `Animations` — drive blink/scroll/flicker timelines.
- `DeviceBindings` + ports (`models/componentPorts.js`) — wire fields to device
  parameters.
- `Behavior` formatting fields already present: `prefix`, `suffix`, `unit`,
  `precision`, `showSign`, `rangeSeparator` — reuse for numeric field readouts.

**Genuinely new:**

1. A `Display` section — panel technology, dot/segment grid, palette, backlight,
   contrast, glass/realism.
2. A `Fields` model — multiple bound display zones, each with its own
   content, format, alignment, and motion.
3. Per-field **motion** (marquee/blink/cursor) — could be expressed via
   `Animations`, but likely cleaner as first-class field properties.

Suggested identity: `controlType: 'LcdDisplay'`.

---

## Property surface (the menu)

Items marked ✅ were in the original brief; the rest are the "what else".

### 1. Panel type (master switch)
One dropdown that reshapes the rest of the editor:

- Character LCD (HD44780-style cells, e.g. 16×2, 20×4) — fixed char grid
- Graphic dot-matrix LCD (free pixel grid, e.g. 128×64) — icons/waveforms
- 7- / 14- / 16-segment alphanumeric
- VFD (blue-green vacuum fluorescent)
- OLED (crisp, true black)
- LED matrix
- TFT / color

### 2. Dot / segment model (new)
- Grid: rows×cols (pixels) **or** chars-per-line × lines + cell matrix (5×7, 5×8)
- Dot shape (square / round), dot pitch & gap
- **Unlit "ghost" dots** faintly visible — the single most convincing realism cue
- Inter-character / inter-line spacing

### 3. Color & contrast
- Lit (foreground) + unlit (background) colors, glass tint
- **Contrast** control simulating the LCD trim pot (wash-out / over-darken)
- Preset palettes: green STN, blue/white, amber, red LED, VFD cyan, black-on-grey

### 4. Backlight & lighting ✅ (expanded)
- On/off, brightness, backlight **color**
- Edge-lit gradient / uneven **light bleed**
- Ambient **bloom spill** onto the bezel
- Warm-up fade-in, subtle flicker

### 5. Text & content
- Multiline ✅, fonts ✅
- **Bitmap / pixel fonts** in addition to vector fonts
- **Custom characters (CGRAM)** — user-defined glyphs, like real HD44780
- Per-field alignment, padding, truncation / auto-fit

### 6. Motion ✅ (expanded)
- Marquee scroll L/R/U/D ✅ — with **speed, loop vs bounce (ping-pong), repeat gap**
- **Blink** + **cursor** (block / underline / blinking)
- Typewriter reveal, per-field transitions

### 7. Graphics / picture ✅ (expanded)
- Bitmap import → **1-bit dither** onto the dot grid ✅ (the "picture converter")
- **Segment bargraphs / meters** built from cells (levels, EG, etc.)
- Mini **waveform / envelope** region; icon glyph slots

### 8. Realism overlays (mostly reuse `Effects` / `Background`)
- Glass **reflection / glare**, **scanlines**, pixel grid lines
- Bezel / frame, vignette, slight screen curvature
- **Persistence / ghosting smear** on scroll; optional dead/stuck pixels

### 9. Data binding — highest value for this app (new)
Model the display as **multiple bound fields/zones**, each wired to a device
parameter via the existing `DeviceBindings` / ports:

- e.g. top line = patch name, bottom line = the parameter being edited + value,
  plus a bargraph zone
- Reuse `Behavior` formatting (`prefix` / `suffix` / `unit` / `precision` /
  `showSign`), leading zeros
- **Page / screen system**: multiple layouts cycled by a bound value
  (mode / page index)

### 10. MIDI-driven display I/O (new — the screen as a MIDI endpoint)
This is the angle that makes an LCD more than decoration, and it has real
hardware precedent: a number of devices accept MIDI (usually SysEx) that pushes
**text and even graphics** onto their screen, and control surfaces use the
display as a live readout of incoming MIDI. We can model the LCD in **both
directions**:

- **Sink (incoming MIDI → screen):** the display renders content received over
  MIDI — SysEx text frames, dot-matrix bitmap frames, CC/NRPN values mapped to
  fields/bargraphs, MMC/transport state, etc. Useful for emulating a hardware
  screen or building a custom remote readout.
- **Source (interaction → outgoing MIDI):** menu navigation, soft-key presses,
  and field edits emit MIDI/SysEx (wire through existing ports + `DeviceBindings`
  / Scripts).

Real-world reference points worth supporting as presets / parsers:

- **Roland Sound Canvas (SC-55 / SC-88 / SC-88Pro):** SysEx writes a text line
  *and* a 16×16 dot-matrix graphic to the LCD — a clean example of "graphics
  over MIDI". Great template for a dot-matrix frame format.
- **Ableton Push:** one SysEx message per line (~68 chars/line, 4 lines) sets
  display text — simple line-addressed text protocol.
- **Mackie Control / Logic Control (MCU) & HUI:** the LCD message
  (header + `0x12` + position byte + ASCII) drives a 2×56 "scribble strip" split
  per channel; plus 7-segment time/assignment displays. Behringer X-Touch and
  many DAW surfaces speak this. Good model for **scribble strips** and
  **per-channel labels**.

Things to model for this:

- Frame/protocol adapters (text-line, dot-matrix bitmap, scribble-strip,
  CC/NRPN→field) — pluggable so users pick or define one
- Character offset / line addressing, partial updates
- Mapping table: incoming address/range → which field or pixel region updates

### 11. Character ROM & encoding (new)
- Selectable character ROM: HD44780 **A00** (Japanese / katakana) vs **A02**
  (European/Cyrillic), plus vendor tables (Roland/Yamaha custom glyph sets)
- Custom **CGRAM** glyph slots (reuse `Assets` for storage)
- Code page / encoding for incoming MIDI text

### 12. Refresh & timing realism (new)
- Refresh rate, partial-region updates, tearing on fast scroll
- Slow-LCD smear vs instant-OLED snap (ties into the persistence cue in §8)

### 13. Interactive / touch & soft-keys (new)
- Touchscreen mode (Korg Triton/Kronos-style menu diving)
- **Soft-key labels**: a row of fields aligned to physical buttons/knobs below
  the screen (Roland JD/JV "function" rows) — each emits MIDI when pressed
- Menu/page cursor navigation

### 14. Multi-display arrangement (new)
- Main display + sub-display (value box, octave indicator, etc.)
- Tiling several LCD instances that share one palette/backlight preset

---

## Reference catalog (to ground the presets)

A non-exhaustive taxonomy so "ready-made" presets mirror real gear. Treat model
names as illustrative; verify exact specs before claiming hardware accuracy.

- **7-segment LED:** drum machines / sequencers (TR-style), patch-number boxes
- **Character LCD (16×2 / 24×2):** classic FM & analog synths, workstation
  patch screens
- **Large custom-segment LCD:** late-80s flagships with bespoke iconography
- **Graphic dot-matrix LCD (e.g. 128×64):** rompler/workstation menus, modern
  desktop synths
- **VFD (blue-green):** grooveboxes, samplers, mixers
- **OLED (128×64 mono):** modern boutique/Eurorack and groovebox gear
- **Color TFT / touchscreen:** workstation flagships
- **LED / dot matrix:** step grids, monome-style surfaces
- **Plasma:** vintage high-end workstations

### 15. Color, sizing, segment interaction & cross-component linking (new)
Answers to recurring "can it still do X?" questions — all map onto existing
systems, so the LCD mostly needs to *expose the right channels*.

- **Per-element color (letters/numbers vs background, and per-segment).**
  Foreground = `Text._children.Fill.colour`; background =
  `Background._children.Fill.colour` (already independent). Per-character /
  per-field color comes from the **Fields model** (each field has its own
  `Fill`). Per-segment overrides already have a pattern in the `Value` section:
  `segmentStyle: { shared, rows }` — a shared style plus per-row overrides, so
  individual digits/segments can be colored independently.
- **Screen size — two independent axes.** Physical size via `Transform`
  (`width` / `height` / `aspectLock`); *resolution* via the `Display` section
  (rows×cols, dot pitch/gap). Same 16×2 panel can be 200px or 600px, and dot
  count can change without resizing the box.
- **Segments interacting with each other.** Use `Bindings` (value-driven
  mappings into other parts' properties) + `Links` + `States`: one segment's
  value can drive another's color / visibility / content — the same machinery
  custom components already use.
- **Linking other components → the LCD (strongest existing fit).** The
  panel-level routing layer (`utils/panelCustomComponentLinks.js`) lets a
  slider/button **publish an output endpoint** and route it to an LCD **input
  channel** (`createPanelCustomRouteLink`, `applyPanelCustomLinkRoutes`), with
  `endpointTypeCompatibility` + `convertPanelRouteValue` handling type/range
  conversion. `ExternalAPI.addressableName` gives components stable names to
  address. So "this knob's value shows as text/number on that LCD" is a route,
  not new code. **Design implication:** the LCD must publish sensible input
  channels — e.g. `text`, `value`, `field[n].text`, `foregroundColor`,
  `backgroundColor`, `brightness`, `pageIndex` — via `PublishedProperties`.

### 16. Scripting depth — go beyond properties (new)
The truly awesome interactions come from scripting, so the LCD must be designed
**script-first**: every visual/state aspect addressable by path, plus
LCD-specific events. The scripting surface is already strong (see
`scripting/panelApi.js`, `scripting/scriptCommandRegistry.js`):

- **Event hooks:** `onTimer`, `onMidiIn`, `onSysexIn`, `onCcIn`,
  `onParameterReceived`, `onDumpReceived`, `onControlChanged`, plus control
  events (press/hover/wheel/stateChanged).
- **Values:** `setValue` / `getValue` by path, with `.value` /
  `.normalizedValue` / `.midiValue` suffixes.
- **MIDI:** `sendCC`, `sendNRPN`, `sendSysex`, `buildSysex`, `checksum`,
  `to14Bit`, bulk `requestDump` / `applyDump` / `sendDump` / `buildDump`.
- **Flow:** `emitEvent`, animation start/stop, `startTimer` / `stopTimer`.
- **Scopes:** component / panel / project; multi-language export
  (Lua / JS / Python / CE).

**Design implication — expose scriptable internals as settable paths:**
per-field `text` / `value` / `color` / `visible`, per-cell / per-pixel set,
`brightness`, `contrast`, `backlightColor`, `pageIndex`, `scrollOffset`,
`cursor`. Consider LCD-specific emitted events (e.g. `onScrollWrap`,
`onPageChange`) so other components/scripts can react. If a script can set any
pixel and read any value, the property UI becomes just the convenient front end.

### 17. Timing & timers — see the Timer system
Scroll / blink / cursor / page auto-advance / warm-up fade all need timing. A
basic timer exists (`startTimer` / `stopTimer` / `onTimer`); the full design is
its own subsystem — see **[timer-system.md](./timer-system.md)** (a
`TimerManager` over `juce::Timer`). The LCD is a primary consumer: ideally a
Timer part drives `scrollOffset` / `pageIndex` directly via the panel routing
layer, with scripts for anything fancier.

---

## Feasibility

Verdict: **feasible to a high degree.** Roughly 70% of this rides on
infrastructure that already exists; the concentrated effort is one canvas
renderer plus a few bounded algorithms. The ambitious extremes (color
touchscreen, exhaustive protocol library) are optional and can be staged later.

### Already there — near-free
- **MIDI in *and* out, including SysEx.** The scripting runtime already exposes
  `sendSysex(bytes)`, `sendCC`, `sendNRPN`, `buildSysex`, `checksum`, `to14Bit`
  and inbound hooks `onMidiIn` (raw) and `onSysexIn` (raw SysEx) — see
  `scripting/panelApi.js` and `scripting/scriptEmitters.js`. So §10 (screen as a
  MIDI sink *and* source) is supported at the API level today; a Sound Canvas /
  Push / MCU adapter is "parse bytes in `onSysexIn` → write fields" — a script,
  not new engine code.
- **Device-bound fields.** `DeviceBindings` + ports (`models/componentPorts.js`)
  + the DPD device-parameter system already drive value / `.midiValue` / enum-name
  lookups (§9).
- **Text / fonts / multiline / glow-bevel-reflection / backgrounds / gradients /
  animations / image import** — all exist as reusable sections
  (`models/sectionDefaults.js`) and CSS builders (`utils/effectsCSS`,
  `utils/gradientCSS`). The lit-phosphor look and bezel/glass come mostly free.
- **The section/property model** is just data — adding a `Display` section is
  trivial.

### Feasible, but real net-new work
- **The dot/segment renderer (main piece).** Controls currently render as
  **DOM + CSS** (`editor/CanvasControl.svelte` → `BackgroundRenderer`,
  `SliderFamilyRenderer`). Fine for a 16×2 character LCD (~32 cells) but a
  128×64 graphic LCD is 8,192 dots — too many DOM nodes. A graphic display wants
  a real `<canvas>` renderer. Bounded and well-understood, but it is the core new
  engineering.
- **1-bit dithering** of imported images onto the grid (Floyd–Steinberg etc.) —
  straightforward.
- **Motion loop** (marquee / blink / cursor) — a requestAnimationFrame ticker.
- **7/14/16-segment geometry** — static per-segment path definitions; moderate.

### Harder / scope-creep (defer)
- Full **color TFT + touchscreen menu-diving** — large; likely out of scope for v1.
- **CGRAM custom-glyph authoring UX**, refresh/tearing/persistence realism —
  polish, fiddly.
- Shipping **many built-in hardware protocol adapters** — each needs the device
  spec; treat as ongoing, not a blocker.

### The key build decision
1. **Native `controlType: 'LcdDisplay'` with a canvas renderer** — best
   performance/polish; needs the new renderer + a `Display` section. Right call if
   high-res graphic dot-matrix matters.
2. **Compose from the existing CustomComponent designer** (`Generators` for the
   cell grid, `Bindings` to drive cells, `Assets` for glyphs, `Scripts` for
   SysEx) — almost no new engine code, credible character LCD + bound fields
   quickly, but high-res graphic mode strains the DOM.

**Recommended:** hybrid — a small native canvas "panel" primitive for the
dot/segment surface, leaning on existing sections (Text / Effects / Background /
Animations / DeviceBindings / Assets) + scripting for everything else. Keeps it
ready-made with presets while staying fully tweakable.

---

## Open questions / parking lot

- Express motion via `Animations` section vs first-class field props?
- How are CGRAM glyphs authored & stored (reuse `Assets`)?
- Should fields be a new section or sit inside `Parts` / `Generators`?
- Default port set for `LcdDisplay` in `componentPorts.js` (page index, field
  values, brightness, etc.).
- MIDI-driven display: where do incoming-SysEx parsers live (Scripting layer?
  a new adapter registry?), and how do we keep them sandboxed?
- Do we ship built-in protocol adapters (Sound Canvas, Push, MCU/HUI) or expose
  a generic frame-mapping editor and let users build them?
- CGRAM / custom glyph authoring UX — reuse the icon/asset pipeline?

## References

- Mackie/Logic Control LCD (`0x12`) scribble-strip protocol —
  https://github.com/NicoG60/TouchMCU/blob/main/doc/mackie_control_protocol.md
  and https://github.com/Silhm/bcf-scribble-strips/wiki/Understanding-Mackie-Control-Protocol
- Roland SC-88Pro LCD text + dot-matrix SysEx generator —
  http://robbi-985.homeip.net/blog/?p=1352
- Ableton Push LCD text via SysEx —
  https://cycling74.com/forums/how-to-control-the-push-lcd-with-sysex-messages

## Add your ideas below
<!-- New ideas go here; promote them into the sections above once fleshed out. -->
