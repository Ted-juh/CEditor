# LCD Display — Component Design Notes

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

---

## Open questions / parking lot

- Express motion via `Animations` section vs first-class field props?
- How are CGRAM glyphs authored & stored (reuse `Assets`)?
- Should fields be a new section or sit inside `Parts` / `Generators`?
- Default port set for `LcdDisplay` in `componentPorts.js` (page index, field
  values, brightness, etc.).

## Add your ideas below
<!-- New ideas go here; promote them into the sections above once fleshed out. -->
