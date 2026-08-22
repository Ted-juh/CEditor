# CEditor Manual — snapshot of 2026-08-10

> **Historical snapshot, not a generated file.**
>
> This was produced by `tools/scripts/gen-editor-manual.mjs` on the
> `claude/beta-readiness-review-jc5boh` branch on 2026-08-10, from `COMPONENT_TYPES`,
> `SECTION_DEFAULTS` and the ~1,400 `hint="…"` strings in the properties panel.
>
> The generator is **not** in the tree, and this file is **not** regenerated or tested. It needed
> `CE/web/src/CE_Application/models/insertPalette.js` and `CE/web/src/CE_Application/sections/CoreEditor.svelte`,
> both of which the editor has since replaced — the insert palette is now `layout/InsertPanel.svelte`
> and the properties panel was restructured. Porting it is real work, not a copy.
>
> So read this as a record of what the editor looked like on that date. Anything it says about the
> component catalogue or a property's meaning may have moved. The **scripting** manual
> ([scripting-manual.md](scripting-manual.md)) *is* generated and *is* tested, and remains current.
>
> It is kept because the alternative was deleting 1,841 lines of user-facing documentation that
> mostly still applies, and because it is the specification for whoever ports the generator.

---


CEditor builds the control panel for a piece of hardware. You draw the knobs and switches, tell
them which MIDI messages your synth listens for, and export the result as a plugin you can open in
a DAW next to the track it is controlling.

This manual covers everything up to the point where you might want a script. It describes
49 component types, 57 property sections and 1283 property
descriptions.

## Contents

1. [The four workspaces](#the-four-workspaces)
2. [Build your first panel](#build-your-first-panel)
3. [Binding a panel to a synth](#binding-a-panel-to-a-synth)
4. [Custom components](#custom-components)
5. [Exporting](#exporting)
6. [Component catalog](#component-catalog)
7. [Property reference](#property-reference)
8. [Further reading](#further-reading)

---

## The four workspaces

CEditor is four editors sharing one window. Which one you are in decides what the left palette
inserts and what the properties panel on the right edits.

| Workspace | What it edits | How to open it |
|---|---|---|
| **Panel canvas** | A panel: the components, where they sit, how they look and what they send. | File → New Panel |
| **Custom component designer** | One reusable component, drawn from shapes and given its own behaviour. | File → New Custom Component |
| **Device Profile Designer** | What your synth listens for: its parameters, message shapes and bulk dumps. | File → New Device Profile |
| **Script workspace** | The scripts attached to a panel, in any of seven languages. | File → New Script Workspace |

The **tab bar** at the top carries one tab per open document, of any kind. The **properties panel**
on the right always edits whatever is selected; with nothing selected it edits the panel itself.
Hovering any property shows its description in the info bar — those descriptions are the same ones
collected in the [property reference](#property-reference) below.

---

## Build your first panel

**1. Make a panel.** File → New Panel. You get an empty canvas. Set its size in the properties
panel under **Core** — a panel roughly the size of the hardware's front section is a good start.

**2. Insert a component.** Use the palette on the left, or the Insert menu, which lists all
49 types. For a filter cutoff you want a **Knob**; the full list is in the
[catalog](#component-catalog).

**3. Give it a range.** Select it and open the **Behavior** section. Set Min, Max and the default —
if the synth expects 0–127, say so here. What you set as the default is what the control shows when
the panel opens and what a reset returns it to.

**4. Make it send something.** Two ways:

- **Bind it to a device profile** — the better path if the synth has a profile. See
  [binding a panel to a synth](#binding-a-panel-to-a-synth).
- **Send a raw message from a script** — right for one-offs. See the scripting manual.

**5. Try it.** Preview mode runs the panel as a user meets it: controls respond, scripts run, and
nothing you do changes the document. Leaving Preview puts everything back the way you left it.

**6. Save it.** Ctrl+S writes a `.cepanel` — one JSON file holding the whole panel, including any
images you imported. File → Open Recent brings back the last five.

---

## Binding a panel to a synth

A **device profile** describes your hardware once — every parameter, the MIDI message that carries
it, and the ranges it accepts — so panels can be built against it instead of against raw byte
strings.

**Getting a profile.** File → Import Device Profile if you have one. If the synth supports MIDI-CI,
File → Discover Device asks it to describe itself. Otherwise File → New Device Profile and enter
the parameters from the manufacturer's MIDI implementation chart.

**Using it.** With a profile loaded, the Parameters screen lists everything the synth understands.
**Drag a parameter onto a component** and it binds: the control adopts the parameter's range, an
enum parameter fills a combobox's rows, and moving the control sends the right message.

**Checking it.** The Device Insight strip shows the connection and what is being sent. Bulk dumps —
reading a whole patch out of the synth and writing one back — are on the Bulk dumps screen.

---

## Custom components

When no built-in component looks like the thing on your hardware, draw it. File → New Custom
Component opens a design surface with shape tools, and what you draw becomes a component you can
place on any panel.

A custom component is four things:

- **Parts** — the shapes: rectangles, rings, arcs, text, images.
- **Value channels** — the values it holds, each with a range and a default.
- **Behaviours** — how a gesture changes a channel. A dial is a behaviour with circular geometry.
- **Hit zones** — the regions that accept the pointer, each pointing at a behaviour.

The **Value Control** generators build all four at once for a dial or a scale, which is the fastest
way to a working control. **States** let the component change appearance as it is hovered, pressed
or disabled; **Publish** decides what a panel can set on it from outside.

Finished components go to the package library (Publish → Package Library → Save to library), and
appear in the palette for any panel.

---

## Exporting

A panel becomes a plugin. Panel Properties → **Export** carries the settings; Build → **Build
VST3**, **Build LV2** or **Build Standalone** produces the artefact in `export-out/`.

**Identity.** Every panel carries a GUID, and the plugin's identity derives from it. Re-exporting
the same panel produces the same plugin, so a DAW session reloads correctly. Two panels never
collide, even with the same name — which is the failure that made Ctrlr panels unusable in a DAW.
Regenerate the GUID only if you want a genuinely separate plugin.

**Formats.** VST3 and LV2 for hosts, Standalone for running without one. AU needs macOS, which
CEditor does not build for yet; CLAP needs a wrapper JUCE does not ship. The Export tab shows the
identity reserved for both.

**Two things to know before you share one.** Exports link JUCE under its free-tier licence and
inherit the **AGPL** — distributing one means offering its source, unless you hold a commercial
JUCE licence. And builds are **unsigned**, so Windows warns about them on first run.

Exporting compiles, so it needs the C++ build environment — run exports from a source checkout.

---

## Component catalog

Every component, filed the way the QA sheet files them, with the property sections each one
carries. A section name here is a heading in the properties panel and an entry in the
[reference](#property-reference).

### Structure — the furniture a panel is built out of

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Background** (`Background`) | Insert → Layout & Display | `Core` `Transform` `Background` `Effects` |
| **Container** (`Container`) | Insert → Layout & Display | `Core` `Transform` `Background` `Effects` `Grid` `Children` |
| **Group / Frame** (`Group`) | Insert → Layout & Display | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Grid` `Children` |
| **Image** (`Image`) | Insert → Layout & Display | `Core` `Transform` `Background` `Effects` |
| **TestBox** (`TestBox`) | _not in the palette_ | `Core` `Transform` `Background` `Effects` |

### Text & numeric entry

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Label** (`Label`) | Insert → Layout & Display | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` |
| **Text Input** (`TextInput`) | Insert → Layout & Display | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `DeviceBindings` |
| **Number** (`Number`) | Insert → Values & Sliders | `Core` `Transform` `Mouse` `Behavior` `Parts` `Bindings` `DeviceBindings` `States` `Animations` `Scripts` |
| **Range** (`Range`) | Insert → Values & Sliders | `Core` `Transform` `Mouse` `Behavior` `Parts` `Bindings` `DeviceBindings` `States` `Animations` `Scripts` |

### Buttons — every trigger variant, because they differ only in behaviour

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Button** (`Button`) | _not in the palette_ | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Momentary Button** (`MomentaryButton`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Toggle Button** (`ToggleButton`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Timed Button** (`TimedButton`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **One-Shot Button** (`OneShotButton`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Cyclic Button** (`CyclicButton`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Radio Button Group** (`RadioButtonGroup`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |

### Selection

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Combobox** (`Combobox`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `DeviceBindings` `Animations` `Scripts` |
| **Listbox** (`Listbox`) | Insert → Buttons & Choices | `Core` `Transform` `Background` `Text` `Icon` `Effects` `ContentLayout` `Behavior` `States` `Value` `Listbox` `DeviceBindings` `Animations` `Scripts` |

### Continuous controls

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Slider** (`Slider`) | Insert → Values & Sliders | `Core` `Transform` `Mouse` `Behavior` `Parts` `Bindings` `DeviceBindings` `States` `Animations` `Scripts` |
| **Knob** (`Knob`) | Insert → Values & Sliders | `Core` `Transform` `Mouse` `Behavior` `Parts` `Bindings` `DeviceBindings` `States` `Animations` `Scripts` |
| **Crossfader** (`Crossfader`) | Insert → Values & Sliders | `Core` `Transform` `Background` `Crossfader` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Ribbon / Wheel** (`Ribbon`) | Insert → Values & Sliders | `Core` `Transform` `Background` `Ribbon` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Vector Joystick** (`VectorJoystick`) | Insert → Values & Sliders | `Core` `Transform` `Background` `Joystick` `Text` `Effects` `DeviceBindings` `Scripts` |

### Displays — the read-only half, where "value arrived" becomes visible

| Component | Where to find it | Sections it carries |
|---|---|---|
| **LCD Display** (`LcdDisplay`) | Insert → Layout & Display | `Core` `Transform` `Background` `Display` `Effects` `DeviceBindings` `Scripts` |
| **Pixel Display** (`PixelDisplay`) | Insert → Layout & Display | `Core` `Transform` `Background` `Pixel` `Effects` `DeviceBindings` `Scripts` |
| **Meter** (`Meter`) | Insert → Layout & Display | `Core` `Transform` `Background` `Meter` `Text` `Effects` `DeviceBindings` `Scripts` |

### Modulation & mapping

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Macro** (`Macro`) | Insert → Values & Sliders | `Core` `Transform` `Background` `Macro` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Preset Constellation** (`Constellation`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Constellation` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Timbre Space** (`Timbre`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Timbre` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Expression Router** (`Router`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Router` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Turing Modulator** (`Turing`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Turing` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Kinetic Modulator** (`Kinetic`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Kinetic` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Orbit Modulator** (`Orbit`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Orbit` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Envelope** (`Envelope`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Envelope` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Mod Matrix** (`Matrix`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Matrix` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Constraint Cell** (`Constraint`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Constraint` `Text` `Effects` `DeviceBindings` `Scripts` |

### Performance & MIDI

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Chord Pad** (`ChordPad`) | Insert → Music & Performance | `Core` `Transform` `Background` `ChordPad` `Text` `Effects` `Scripts` |
| **Arpeggiator** (`Arp`) | Insert → Music & Performance | `Core` `Transform` `Background` `Arp` `Text` `Effects` `Scripts` |
| **Ribbon Keyboard** (`NoteRibbon`) | Insert → Music & Performance | `Core` `Transform` `Background` `NoteRibbon` `Text` `Effects` `Scripts` |
| **Drum Pads** (`DrumPads`) | Insert → Music & Performance | `Core` `Transform` `Background` `DrumPads` `Text` `Effects` `Scripts` |
| **Phrase Sequencer (note grid)** (`Phrase`) | Insert → Music & Performance | `Core` `Transform` `Background` `Phrase` `Text` `Effects` `Scripts` |
| **Gesture Looper** (`Looper`) | Insert → Modulation & Routing | `Core` `Transform` `Background` `Looper` `Text` `Effects` `DeviceBindings` `Scripts` |
| **Setlist (scenes on a footswitch)** (`Setlist`) | Insert → Music & Performance | `Core` `Transform` `Background` `Setlist` `Text` `Effects` `Scripts` |
| **Harmoniser (one finger, full chord)** (`Harmoniser`) | Insert → Music & Performance | `Core` `Transform` `Background` `Harmoniser` `Text` `Effects` `Scripts` |
| **Phrase Recorder (record + loop notes)** (`Recorder`) | Insert → Music & Performance | `Core` `Transform` `Background` `Recorder` `Text` `Effects` `Scripts` |
| **Zone Splitter (keyboard split)** (`SplitZone`) | Insert → Music & Performance | `Core` `Transform` `Background` `SplitZone` `Text` `Effects` `Scripts` |
| **Panic button** (`Panic`) | Insert → Music & Performance | `Core` `Transform` `Background` `Panic` `Text` `Effects` `Scripts` |
| **Transport (master clock)** (`Transport`) | Insert → Music & Performance | `Core` `Transform` `Background` `Transport` `Text` `Effects` `Scripts` |

### Custom components — the empty shell; QA-07 covers real packages

| Component | Where to find it | Sections it carries |
|---|---|---|
| **Custom Component** (`CustomComponent`) | Insert → Values & Sliders | `Core` `Transform` `Background` `Effects` `Mouse` `Designer` `Parts` `Assets` `ValueChannels` `Behaviors` `HitZones` `Generators` `Bindings` `Links` `States` `Animations` `DeviceBindings` `PublishedProperties` `ExternalAPI` `Variants` `Scripts` |


---

## Property reference

Every property section in the model, and every property described in the panel. These descriptions
are the ones the info bar shows on hover — collected here so they can be read without hunting for
the control that owns them.

### Core

_On every component._

> No property hints found in `CoreEditor.svelte`. Its properties are undocumented in the panel as well.

### Transform

_On every component._

> No property hints found in `TransformEditor.svelte`. Its properties are undocumented in the panel as well.

### Background

_On 45 components: `Background`, `Label`, `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `CustomComponent`, `Container`, `Group`, `Image`, `LcdDisplay`, `PixelDisplay`, `Macro`, `Constellation`, `Timbre`, `Router`, `Turing`, `Looper`, `ChordPad`, `Arp`, `NoteRibbon`, `DrumPads`, `Phrase`, `Setlist`, `Harmoniser`, `Recorder`, `SplitZone`, `Panic`, `Transport`, `Constraint`, `Kinetic`, `Orbit`, `Ribbon`, `Crossfader`, `VectorJoystick`, `Matrix`, `Envelope`, `Meter`, `TestBox`._

> No property hints found in `BackgroundEditor.svelte`. Its properties are undocumented in the panel as well.

### Text

_On 38 components: `Label`, `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Group`, `Macro`, `Constellation`, `Timbre`, `Router`, `Turing`, `Looper`, `ChordPad`, `Arp`, `NoteRibbon`, `DrumPads`, `Phrase`, `Setlist`, `Harmoniser`, `Recorder`, `SplitZone`, `Panic`, `Transport`, `Constraint`, `Kinetic`, `Orbit`, `Ribbon`, `Crossfader`, `VectorJoystick`, `Matrix`, `Envelope`, `Meter`._

| Property | What it does |
|---|---|
| **Text** | The text content displayed by this component |
| **Editable** | Let the user edit this label's text at runtime. Required before an LCD 'edit' zone can rewrite it. |
| **Font** | Choose the font family for this text |
| **Size** | Font size in pixels |
| **Typeface** | Quick typeface styling toggles |
| **Word Spacing** | Adjust spacing added to each whitespace character in pixels. |
| **Letter Spacing** | Adjust spacing between characters in pixels |
| **Case** | Apply text case transforms including title, sentence, and small caps modes. |
| **Script** | Shift the text into superscript or subscript styling. |
| **Baseline** | Additional baseline shift in pixels. Positive raises the text. |
| **Features** | OpenType feature toggles for ligatures, alternates, figures, fractions, and slashed zero. |
| **Justify Last** | When enabled, the final visible line is justified too instead of keeping the selected alignment. |
| **Last Line** | Override the last visible line alignment when the paragraph is not justified, or when Justify Last is off. |
| **Line Height** | Multiplier applied to the font size when spacing lines vertically. |
| **Position** | Anchor the text inside the component bounds |
| **Offset** | Horizontal uses left minus / right plus. Vertical uses up plus / down minus. |
| **Fill** | Choose the active text fill layer. |
| **Fit** | How the image should fit inside the text fill area. |
| **Offset X** | Horizontal offset of the image fill. |
| **Offset Y** | Vertical offset of the image fill. |
| **Opacity** | Opacity of the image fill. |
| **Tint** | Tint colour multiplied with the image fill. |
| **Fill Order** | Draw order of the main text fill layer. Lower draws earlier, higher draws later. |
| **Scale** | Tile scale for the texture pattern. |
| **Offset X** | Horizontal offset of the tiled pattern. |
| **Offset Y** | Vertical offset of the tiled pattern. |
| **Opacity** | Opacity of the texture fill. |
| **Tint** | Tint colour multiplied with the texture fill. |
| **Reading** | Choose the reading direction or mirror the text glyphs. |
| **Mode** | How the text flows: as a block, on a line, stepped, or bent onto an arc or circle. |
| **Distribution** | Natural uses measured advances, Fit stretches along the path, Justify expands spaces, Fixed uses a constant advance. |
| **Facing** | Rotate glyphs to the path, keep them upright, or turn them inward/outward. |
| **Side** | Offset the path to the inside or outside of its baseline. |
| **Reverse** | Reverse the path direction before distributing the text. |
| **Start Offset** | Offset the text run along the path before the first glyph is placed. |
| **Fixed Advance** | Advance used by Fixed distribution mode. |
| **Angle** | Set the exact angle in degrees. Rotate turns the text block; Line distributes letters across an angled baseline. |
| **Step X** | Horizontal shift applied to each successive character in stair mode. |
| **Step Y** | Vertical shift applied to each successive character in stair mode. |
| **Unit** | Apply stair stepping per character, per word, or per explicit line. |
| **Step Y** | Vertical advance between glyphs in true vertical typesetting. |
| **Step X** | Horizontal column offset between explicit lines in true vertical typesetting. |
| **Angle** | Centre angle for the arc in degrees. |
| **Radius** | Distance from the arc centre to the glyph baseline. |
| **Sweep** | How much of the circle the arc should cover, in degrees. Negative values reverse the direction. |
| **Angle** | Starting angle for the full-circle text run in degrees. |
| **Radius** | Distance from the circle centre to the glyph baseline. |
| **Amplitude** | Wave or zigzag height from the baseline. |
| **Frequency** | How many wave or zigzag cycles the run should cover. |
| **Turns** | How many turns the spiral should complete. |
| **Radius** | Base radius of the spiral. |
| **Inset** | Inset the text path from the component edge. |
| **Start X** | Bezier start X as a percentage of the text box. |
| **Start Y** | Bezier start Y as a percentage of the text box. |
| **End X** | Bezier end X as a percentage of the text box. |
| **End Y** | Bezier end Y as a percentage of the text box. |
| **Ctrl 1 X** | Bezier first control handle X. |
| **Ctrl 1 Y** | Bezier first control handle Y. |
| **Ctrl 2 X** | Bezier second control handle X. |
| **Ctrl 2 Y** | Bezier second control handle Y. |
| **Effects** | Apply text-specific effects to glyphs instead of the whole control box. |
| **Text Effects** | Detailed controls for the currently active text effects. |
| **Outline Thickness** | Extra outline thickness outside the glyph fill, in pixels. |
| **Outline Distance** | Gap between the glyph and the outline band, in pixels. |
| **Outline Fill** | Fill from the glyph edge outward, or show only the outer outline band. |
| **Outline Join** | Corner style of the expanded outline on angular glyphs. |
| **Outline Colour** | AARRGGBB outline colour. |
| **Placement** | Where the outline band should sit relative to the glyph edge. |
| **Dash** | Render the outline as a dashed stroke. |
| **Dash Len** | Length of each outline dash. |
| **Gap** | Gap between dashed outline segments. |
| **Order** | Draw order for the outline layer. Lower draws earlier, higher draws later. |
| **2nd Thickness** | Thickness of the secondary stroke. |
| **Placement** | Place the secondary stroke inside, centered on, or outside the glyph edge. |
| **Dash** | Render the secondary stroke as a dashed line. |
| **Dash Len** | Length of each secondary stroke dash. |
| **Gap** | Gap between secondary stroke dashes. |
| **Stroke Colour** | AARRGGBB colour for the secondary stroke. |
| **Order** | Draw order for the secondary stroke layer. Lower draws earlier, higher draws later. |
| **Style** | Soft uses blur, Long casts repeated flat copies, Extrude builds a hard stacked edge. |
| **Shadow X** | Horizontal shadow offset in pixels. |
| **Shadow Y** | Vertical shadow offset in pixels. |
| **Shadow Blur** | Blur radius for the text shadow. |
| **Shadow Colour** | AARRGGBB shadow colour. |
| **Distance** | Length used by long-shadow and extrude shadow styles. |
| **Steps** | Number of repeated copies used for long-shadow and extrude styles. |
| **Order** | Draw order for the shadow layer. Lower draws earlier, higher draws later. |
| **Glow Size** | Blur radius for the outer text glow. |
| **Glow Intensity** | Strength of the glow at the chosen size. Higher values stack a brighter halo. |
| **Glow Colour** | AARRGGBB glow colour. |
| **Order** | Draw order for the glow layer. Lower draws earlier, higher draws later. |
| **Inner Glow** | Blur radius for the inner glow clipped inside glyphs. |
| **Inner Glow Colour** | AARRGGBB inner glow colour. |
| **Order** | Draw order for the inner glow layer. Lower draws earlier, higher draws later. |
| **Inner X** | Horizontal offset of the inner shadow. |
| **Inner Y** | Vertical offset of the inner shadow. |
| **Inner Blur** | Blur radius for the inner shadow. |
| **Inner Colour** | AARRGGBB inner shadow colour. |
| **Order** | Draw order for the inner shadow layer. Lower draws earlier, higher draws later. |
| **Blur** | Blur applied to the main text fill and outline. |
| **Motion Angle** | Direction of the smear in degrees. |
| **Distance** | Total smear distance in pixels. |
| **Steps** | Number of layered copies used for the smear. |
| **Motion Colour** | AARRGGBB motion smear colour. |
| **Order** | Draw order for the motion layer. Lower draws earlier, higher draws later. |
| **Bevel Style** | Embossed highlight/shadow treatment. |
| **Depth** | Offset depth of the highlight/shadow copies. |
| **Highlight** | AARRGGBB highlight colour. |
| **Shadow** | AARRGGBB bevel shadow colour. |
| **Order** | Draw order for the bevel layer. Lower draws earlier, higher draws later. |
| **Angle** | Direction from the text toward the reflection, in degrees. 0=Up, 90=Right, 180=Down, 270=Left. |
| **Distance** | Distance from the text to the mirrored reflection. |
| **Intensity** | Opacity of the reflection layer. |
| **Blur** | Blur applied to the reflection. |
| **Fade** | Fade the reflection in, out, or not at all along the reflection distance. |
| **Fade Amount** | Measured from the near edge of the reflection. Fade Out starts dropping here; Fade In reaches full opacity here. |
| **Reflection Colour** | AARRGGBB colour for the mirrored reflection layer. |
| **Order** | Draw order for the reflection layer. Lower draws earlier, higher draws later. |
| **Type** | Toggle underline, strikethrough, and overline decorations. |

### Grid

_On 2 components: `Container`, `Group`._

| Property | What it does |
|---|---|
| **Name** | Display name of the panel |
| **Id** | Unique script identifier. Use camelCase or snake_case. |
| **Author** | Author of this panel |
| **Version** | Version string, e.g. 1.0.0 |
| **Description** | Optional description or notes about this panel |
| **Enabled** | Enable or disable all interaction on this panel at runtime |
| **Locked** | Lock panel to prevent editing in the designer |
| **Width** | Panel width in pixels |
| **Height** | Panel height in pixels |
| **Lock Ratio** | Keep width/height ratio when resizing |
| **Resizable** | Allow end-user to resize at runtime. When Off, min/max are set to current size. |
| **Panic key** | Keyboard shortcut for panel panic — click, then press the keys. Backspace clears it. |
| **Min W** | Minimum width when resizable |
| **Min H** | Minimum height when resizable |
| **Max W** | Maximum width when resizable. 0 = no limit. |
| **Max H** | Maximum height when resizable. 0 = no limit. |
| **Opacity** | Gradient layer opacity (0–100%) |
| **Show** | Show or hide the grid overlay |
| **Snap** | Snap components to grid when moving or resizing |
| **Size** | Grid cell size in pixels |
| **Thickness** | Grid line thickness in pixels |
| **Type** | Grid line style |
| **Colour** | Grid line colour (AARRGGBB hex) |
| **Divisions** | Group every Nth cell with a thicker border (1 = none) |
| **Colour** | Subdivision border colour (AARRGGBB hex) |
| **Centre** | Centre the grid on the panel — lines radiate from the middle |
| **Offset X** | Shift grid origin horizontally in pixels |
| **Offset Y** | Shift grid origin vertically in pixels |
| **Plugin Name** | Host-visible plugin name and .vst3 filename. Blank = use the panel name. |
| **Version** | Plugin version, e.g. 1.0.0 |
| **Vendor** | Company / manufacturer name shown by the host |
| **Mfr Code** | Exactly 4 characters, at least one uppercase (JUCE / AudioUnit requirement) |
| **Plugin GUID** | Stable per-panel id behind the plugin FUID. Change it and hosts treat a rebuild as a different plugin. |
| **Plugin Code** | Derived from the GUID — the VST3 plugin code (4 chars) |
| **AU Subtype** | Derived from the GUID — the AudioUnit subtype (4 chars). Reserved: AudioUnit is a macOS format and CEditor is Windows-only, so no build here can produce one. |
| **CLAP Id** | Derived reverse-DNS id for the CLAP format. Reserved: JUCE has no CLAP support, so producing one needs the clap-juce-extensions wrapper added to the build. |
| **LV2 URI** | Derived from the GUID — the URI an LV2 host identifies this plugin by. A URN rather than a URL, because no domain is claimed on your behalf. |
| **Modules** | Which parts of the scripting API this panel's scripts can reach. Auto follows the scripts — it is the right answer almost always. Manual pins an explicit list; anything left off logs a notice naming the module instead of acting. ce.core (set/get/log/on/run) is always on. |
| **Missing** | Modules this panel asks for that this install does not have. The rest of the panel is unaffected; calls into these log a notice naming the module instead of acting. |
| **Extensions** | Third-party modules (ce.ext.*) install into the APP, not into a panel — one copy, every panel can use it. An export always carries its own copy, so a shipped plugin never depends on what is installed here. |
| **Python** | Embed the CPython runtime so Python scripts run window-closed and offline. Auto = only when this panel uses Python. |
| **Plugin** | Builds the VST3 from this panel into export-out/. Progress streams into the Console panel. |
| **LV2** | Builds the same panel as an LV2 plugin — the open format Ardour, Reaper, Bitwig and most Linux hosts read. A .lv2 folder holding the binary and the manifest a host scans for. |
| **Application** | Builds the same panel as a standalone application — the same runtime as the plugin, without a DAW to host it. Lands in a folder of its own so the scripting runtime can sit beside the executable. |
| **Before you share** | Exported panels link JUCE under its free-tier licence, so they inherit the AGPL: distributing one means offering its source, unless you hold a commercial JUCE licence. |

### Mouse

_On 5 components: `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`._

| Property | What it does |
|---|---|
| **Cursor** | Pointer shape over this control in preview and in the plugin. 'default' leaves the surface's own cursor alone. |
| **Hit Shape** | rectangle uses the full box. ellipse inscribes an oval, so the corners of a round knob stop swallowing clicks meant for what is behind it — the artwork is clipped to match. |
| **Take Clicks** | Off makes the control transparent to the pointer: clicks land on whatever sits behind it. Controls nested inside keep working. |
| **Child Clicks** | On lets the parts inside become click targets in their own right, instead of the control being one opaque hit area. |
| **Raise On Click** | Bring the control in front of overlapping ones when pressed. Lasts for the preview session only — the authored order comes back when preview stops. |
| **Focusable** | Let the control take keyboard focus in preview and in the plugin. Off keeps it out of the tab order entirely. |
| **Tab Index** | Position in the tab order. -1 means reachable by click but skipped by Tab; 0 means natural order. Controls with a role of their own keep the order the surface assigns. |
| **Focus Ring** | Draw a ring when focus arrives by keyboard. Clicking never draws it, which is what a plugin UI wants. |
| **Drag Mode** | How pointer motion becomes value. auto follows the control's own geometry — the behaviour it had before this setting existed. vertical is the plugin-standard knob drag; circular follows rotation about the centre; free counts motion in every direction. |
| **Sensitivity** | Multiplier on the control's own drag rate. 1 leaves it exactly as it is; 2 makes the same travel cover twice the range; 0.5 halves it for fine work. |
| **Invert X** | Flip whatever this control already does horizontally — on a right-to-left slider it reverses that, rather than forcing one absolute direction. |
| **Invert Y** | Flip whatever this control already does vertically. |
| **Wheel** | Allow mouse-wheel scrubbing while the control is focused or hovered. Shared with the Slider tab — one setting, two places to reach it. |
| **Reverse Mouse** | Invert wheel and drag value direction without changing the visual track direction. Shared with the Slider tab. |

### Icon

_On 12 components: `Label`, `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Group`._

| Property | What it does |
|---|---|
| **Icon** | Choose an imported icon from the shared library |
| **Size** | Display size in pixels |
| **Tint** | Primary tint applied to the imported icon. |
| **Opacity** | Opacity applied to the icon image. |
| **Rotate** | Rotation applied to the icon layer. |
| **Preview** | Imported icons are managed globally in File -> Settings -> Icons |

### ContentLayout

_On 12 components: `Label`, `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Group`._

| Property | What it does |
|---|---|
| **Mode** | Choose how text and icon are arranged inside the component. |
| **Gap** | Space between text and icon when both are visible. |
| **H Align** | Horizontal alignment for the composed content block. |
| **V Align** | Vertical alignment for the composed content block. |
| **Left** | Left padding inside the button frame. |
| **Right** | Right padding inside the button frame. |
| **Top** | Top padding inside the button frame. |
| **Bottom** | Bottom padding inside the button frame. |
| **Text X** | Nudge the text content horizontally. |
| **Text Y** | Nudge the text content vertically. |
| **Icon X** | Nudge the icon content horizontally. |
| **Icon Y** | Nudge the icon content vertically. |
| **Text Z** | Text should usually stay above the icon in overlay mode. |
| **Icon Z** | Icon draw order inside overlay mode. |

### Effects

_On 45 components: `Background`, `Label`, `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `CustomComponent`, `Container`, `Group`, `Image`, `LcdDisplay`, `PixelDisplay`, `Macro`, `Constellation`, `Timbre`, `Router`, `Turing`, `Looper`, `ChordPad`, `Arp`, `NoteRibbon`, `DrumPads`, `Phrase`, `Setlist`, `Harmoniser`, `Recorder`, `SplitZone`, `Panic`, `Transport`, `Constraint`, `Kinetic`, `Orbit`, `Ribbon`, `Crossfader`, `VectorJoystick`, `Matrix`, `Envelope`, `Meter`, `TestBox`._

| Property | What it does |
|---|---|
| **Target** | Centralized effects editing for component, text, and icon. |
| **Shadow** | Enable the first component drop shadow. |
| **Blur** | Overall component blur. |
| **Bright** | Overall component brightness. |
| **Blend** | Blend mode for the component. |
| **Shadow** | Enable text shadow. |
| **Glow** | Enable text glow. |
| **Blur** | Enable text blur. |
| **Blur Amt** | Text blur amount. |
| **Shadow X** | Text shadow horizontal offset. |
| **Shadow Y** | Text shadow vertical offset. |
| **Glow Size** | Text glow size. |
| **Outline** | Enable text outline. |
| **Shadow** | Enable icon drop shadow. |
| **Glow** | Enable icon glow. |
| **Blur** | Enable icon blur. |
| **Amount** | Icon blur amount. |
| **Shadow X** | Icon shadow horizontal offset. |
| **Shadow Y** | Icon shadow vertical offset. |
| **Glow Size** | Icon glow size. |
| **Tint** | Primary icon tint still lives in Icon. |

### Children

_On 2 components: `Container`, `Group`._

> No properties editor is registered for this section, so it has no hints to collect.

### Display

_On 1 component: `LcdDisplay`._

| Property | What it does |
|---|---|
| **Panel Type** | Character cells, a 7/14/16-segment display, or a graphic (free-pixel) dot-matrix. |
| **Segment Type** | 7-segment (numeric), or 14/16-segment starburst (alphanumeric). |
| **Pixels W** | Graphic pixel columns (0 = auto from Columns). |
| **Pixels H** | Graphic pixel rows (0 = auto from Rows). |
| **Image** | Optional image dithered onto the grid (overrides text). Clear to show text. |
| **Dither** | Floyd–Steinberg dither vs hard threshold. |
| **Clear Image** | Remove the image and go back to showing text. |
| **Palette** | Ready-made lit/unlit/backlight colour set. You can still tweak colours below. |
| **Columns** | Characters per line. |
| **Rows** | Number of text lines. |
| **Source** | Drive the value live from another control (slider / knob / number) in preview. None = use the static value below. |
| **Value** | Static value that drives the tokens (ignored in preview when a Source is set). |
| **Min** | Value range minimum (for the pct and bar tokens). |
| **Max** | Value range maximum (for the pct and bar tokens). |
| **Precision** | Decimal places for the value token. |
| **Prefix** | Text before the value token. |
| **Suffix** | Text after the value token (e.g. dB, %). |
| **Fields** | Add an extra value field, addressed as v2/p2/b2, v3/... in the lines. |
| **Text** | Editable text such as a preset name. Bind a zone with Show = edit to '✎ This screen's text'. |
| **Charset** | Allowed characters. 'upper' auto-uppercases typed letters (classic patch-name set). |
| **Max Length** | Maximum characters (0 = unbounded). Usually match the zone width. |
| **Layouts** | Compose the display from bound regions instead of the lines above. Add a layout to switch modes. |
| **Edit / Preview Layout** | Which layout the Zones table edits and previews. Runtime switching is set by the Pages rules. |
| **Name** | Layout name (used by the Pages rules). |
| **Zones** | Add a region to this layout. |
| **Selector** | A control whose value selects the resting layout (e.g. a mode/preset combobox). |
| **Default** | Resting layout when no selector value matches. |
| **Map** | Add a selector value/range → layout rule. Rules match top-to-bottom; put specific ones first. |
| **Overlays** | Add a transient page shown on a control change (for N ms, or until a change). |
| **@active scope** | Restrict the @active source to these controls only. Empty = any control counts as active. |
| **Scope** | Add a control that @active is allowed to follow. |
| **Mode** | Dot-matrix animation played behind the zones/text. File = GIF/APNG or a sprite sheet; Preset = built-in effects. |
| **File** | Animated GIF/APNG/WebP (decoded frame-by-frame), or one image holding sprite frames side-by-side. |
| **Frames** | Sprite-sheet frame count (frames laid out horizontally). 0 = the file is an animated GIF/APNG. |
| **FPS** | Sprite-sheet playback rate (animated files use their own frame timing). |
| **Loop** | Loop forever, or hold the last frame. |
| **Clear** | Remove the animation file. |
| **Preset** | Built-in dot-matrix effect. |
| **Speed** | Preset speed multiplier. |
| **Lit** | Foreground (lit segment) colour, AARRGGBB. |
| **Unlit** | Faint unlit 'ghost' segment colour, AARRGGBB. |
| **Screen** | Screen substrate behind the pixels, AARRGGBB. |
| **Backlight** | Backlight wash colour, AARRGGBB. |
| **Glass** | Glass sheen overlay colour, AARRGGBB (low alpha = subtle). |
| **Reset** | Restore the default look (colours, brightness, ghost). Leaves layouts, zones and text untouched. |
| **Backlight** | Turn the backlight wash on or off. |
| **Brightness** | Foreground intensity (0–100). |
| **Contrast** | LCD trim-pot feel — ghost/backlight strength (0–100). |
| **Bright Src** | Drive Brightness live from a slider/knob/number in preview (its range maps to 0–100). |
| **Backlt Src** | Drive the backlight on/off live from a toggle/button in preview. |
| **Ghost dots** | Faint unlit cells behind the text (realism cue). |
| **Scanlines** | Horizontal scanline overlay. |
| **Cell grid** | Faint pixel/cell grid lines. |
| **Glass sheen** | Diagonal glass reflection overlay (colour set under Colour ▸ Glass). |
| **Dot Matrix** | Render character glyphs as a dot grid for a dot-matrix LCD look. |
| **Dot Pitch** | Dot spacing in px (0 = auto from cell size). |
| **Dot Shape** | Round (LCD/OLED) or square (blockier) dots. Applies to dot-matrix and graphic mode. |
| **Scroll** | Marquee a line that's longer than the column count. |
| **Scroll Mode** | Loop wraps around; bounce ping-pongs back and forth. |
| **Speed** | Scroll speed in characters per second. |
| **Gap** | Blank characters between loop repeats. |
| **Repeat** | Number of times to scroll, then settle. 0 = loop forever. |
| **Blink** | Blink the lit text on and off. |
| **Blink Rate** | Milliseconds per blink half-cycle. |
| **Cursor** | Show a cursor cell. |
| **Cursor Blink** | Blink the cursor. |
| **Cursor Row** | Cursor row (0-based). |
| **Cursor Col** | Cursor column (0-based). |
| **Padding** | Inset from the bezel to the screen (px). |
| **Font Scale** | Relative glyph size. |
| **Char Gap** | Extra spacing between characters (px). |
| **Line Gap** | Extra spacing between rows (px). |

### Pixel

_On 1 component: `PixelDisplay`._

| Property | What it does |
|---|---|
| **Pixels W** | Grid resolution: pixel columns. All element coordinates refer to this grid. |
| **Pixels H** | Grid resolution: pixel rows. |
| **Grid** | The working resolution all X/Y/W/H values refer to. |
| **Palette** | Ready-made lit/unlit/backlight colour set. Colours stay editable below. |
| **Image** | Static image dithered onto the grid (drawn behind the elements). Clear to remove. |
| **Dither** | Floyd–Steinberg dither vs hard threshold. |
| **Img Colour** | Keep the image's colours (posterized, LED-panel look) instead of 1-bit dots. |
| **Clear Image** | Remove the image. |
| **Layouts** | Multiple element scenes for one screen, switched by the Pages rules. Enabling moves current elements into Layout 1. |
| **Edit / Preview Layout** | Which layout the Elements table edits and previews. Runtime switching follows the Pages rules. |
| **Name** | Layout name (used by the Pages rules). |
| **Transition** | Animate the new layout in when switching (runtime preview). |
| **Duration** | Transition length (ms). |
| **Selector** | A control whose value selects the resting layout (e.g. a mode/preset combobox). |
| **Default** | Resting layout when no selector value matches. |
| **Map** | Add a selector value/range → layout rule. Rules match top-to-bottom; put specific ones first. |
| **Overlays** | Add a transient page shown on a control change (for N ms, or until a change). |
| **Elements** | Add a pixel-addressed element. Text kinds draw at X/Y with font height H; widgets fill the X/Y/W/H rect. |
| **@active scope** | Restrict the ★ Active source to these controls. Empty = any control counts. |
| **Scope** | Add a control that ★ Active may follow. |
| **Mode** | Dot-matrix animation played behind the elements. File = GIF/APNG or a sprite sheet; Preset = built-in effects. |
| **File** | Animated GIF/APNG/WebP (decoded frame-by-frame), or one image holding sprite frames side-by-side. |
| **Frames** | Sprite-sheet frame count. 0 = the file is an animated GIF/APNG. |
| **Cols** | Sprite columns. 0 = single horizontal strip; set for a grid or vertical (cols=1) sheet. |
| **FPS** | Sprite-sheet playback rate. |
| **Loop** | Loop forever, or hold the last frame. |
| **Colour** | Keep the animation's colours (posterized) instead of 1-bit dots. |
| **Clear** | Remove the animation file. |
| **Preset** | Built-in dot-matrix effect. |
| **Speed** | Preset speed multiplier. |
| **Colour** | Hue-cycling colour for the preset. |
| **Lit** | Lit dot colour, AARRGGBB. |
| **Unlit** | Faint unlit 'ghost' dot colour, AARRGGBB. |
| **Screen** | Screen substrate behind the dots, AARRGGBB. |
| **Backlight** | Backlight wash colour, AARRGGBB. |
| **Glass** | Glass sheen overlay colour, AARRGGBB. |
| **Reset** | Restore the default look (colours, brightness, dots, glass). Leaves elements, layouts and text untouched. |
| **Backlight** | Turn the backlight wash on or off. |
| **Brightness** | Dot intensity (0–100). |
| **Contrast** | Ghost/backlight strength (0–100). |
| **Ghost dots** | Faint unlit dots (realism cue). |
| **Design grid** | Show a grid overlay while editing (editor aid — never painted at runtime). |
| **Snap** | Snap element drags to this pixel step (0 = free). Also sets the grid spacing. |
| **Bright Src** | Drive Brightness live from a slider/knob/number in preview. |
| **Backlt Src** | Drive the backlight on/off live from a toggle/button in preview. |
| **Scanlines** | Horizontal scanline overlay. |
| **Glass sheen** | Diagonal glass reflection overlay. |
| **Dot Shape** | Round (LCD/OLED) or square (blockier) dots. |
| **Gamma** | Brightness response curve. 1 = linear; >1 lifts mid-tones, <1 crushes them. |
| **Glow** | Bloom halo under lit dots (0 = crisp, 1 = strong glow). |
| **Padding** | Inset from the bezel to the screen (px). |
| **Edit text** | The string shown by an 'edit' element bound to ✎ This screen's text. |
| **Charset** | Which characters new input is limited to. |
| **Max length** | Cap on the edited string (0 = unbounded). |
| **Glyph sheet** | An image of glyph cells in a grid, left-to-right then top-to-bottom. Text elements set Font → Custom to use it. |
| **Cell W** | Glyph cell width (px). |
| **Cell H** | Glyph cell height (px). |
| **Cols** | Glyph columns per row in the sheet. |
| **First** | Char code of the first glyph (32 = space, 65 = 'A'). |
| **Remove** | Drop the custom font (elements fall back to the built-in face). |

### Behavior

_On 14 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Range`, `Number`, `Slider`, `Knob`._

| Property | What it does |
|---|---|
| **Type** | Behavior is defined by the inserted button type. |
| **Subtype** | Choose the exact behavior variant for this button type. |
| **Initial text** | The field's starting value (Text section holds the empty-state placeholder). |
| **Editable** | Allow keyboard text entry in preview / player. |
| **Focusable** | Can receive keyboard focus (Tab). |
| **Variant** | Spinner = boxed [low] [− +] [high]; Slider = dual-handle min/max track. |
| **Min** | Lower bound the values are clamped to. |
| **Max** | Upper bound the values are clamped to. |
| **Step** | Increment per step / stepper click. |
| **Integer** | Round values to whole numbers. |
| **Low** | Default low (min) value of the range. |
| **High** | Default high (max) value of the range. |
| **Font Size** | Height (px) of the value and ± glyphs. |
| **Fire On** | Choose whether the action triggers on press start or on release. |
| **Mode** | Repeating buttons keep firing while the button is held. |
| **Delay** | Delay before repeating starts. |
| **Interval** | Repeat interval while the button is held. |
| **Mode** | Press-to-talk stays active only while the button is held. |
| **Allow Off** | Permit the active state to be switched back off. |
| **Default On** | Start this toggle in the active state. |
| **Style** | Choose the visual style for the group items. |
| **Layout** | Horizontal lays items in rows, vertical stacks them in one column by default. |
| **Columns** | Set to 0 for auto layout, or 2 for a 2 x 2 grid with four items. |
| **Select** | Single keeps one item active, multi allows several at once. |
| **Deselect** | Allow the selected item to be turned off again. |
| **Group ID** | Optional logical group id for external routing. |
| **Wrap** | Wrap to the first row after the last state. |
| **Mixed** | Allow a mixed state where the design calls for it. |
| **Mode** | Dropdown uses the value rows as selectable options. |
| **Default** | Internal value selected when the panel opens. |
| **Emit Value** | Expose selected value changes to the future scripting/runtime layer. |
| **Hold ms** | Required hold time for hold-to-confirm buttons. |
| **Clicks** | Required clicks for multi-click buttons. |
| **Window** | Allowed time window between required clicks. |
| **Disable** | Disable the button after the first successful use. |
| **Lockout** | Temporary lockout duration after firing. Zero keeps it disabled. |
| **Focusable** | Allow the control to receive keyboard focus in preview/runtime. |
| **Keyboard** | Enable keyboard activation. |
| **Emit Click** | Expose click events to the future scripting/runtime layer. |
| **Emit State** | Expose state changes to the future scripting/runtime layer. |

### Value

_On 9 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TimedButton`, `OneShotButton`._

| Property | What it does |
|---|---|
| **Mapping** | Reveal the row-based mapping editor when this button carries payload or send values. |
| **Rows** | Add or remove rows for cyclic values, radio groups, toggles, and mapped payloads. |
| **Store by name** | Save this choice by its stable name instead of a row index, so it survives changing rows. |
| **Fill from** | Replace the rows with the device's presets (latest scan + slot map) or the profile's shipped factory catalog. Rows become a snapshot you can still edit. |
| **Parent list** | Show only the rows that match another selector's current choice (bank → preset). |
| **Reset pick** | When the parent changes, jump this list to the first matching row. |
| **Label** | Keep simple momentary buttons label-first unless you need explicit payload mapping. |
| **Items** | Each row ties together display text, internal value, and send mapping. |

### Listbox

_On 1 component: `Listbox`._

| Property | What it does |
|---|---|
| **Row height** | Fixed row height in px (0 = auto from font size). |
| **Density** | Comfortable or compact auto row height. |
| **Icons** | Show per-row icons when set. |
| **Two-line** | Show the per-row subtitle on a second line. |
| **Badges** | Show per-row trailing badges. |
| **Swatch** | Show the per-row colour stripe. |
| **Zebra** | Alternating row stripes. |
| **Cards** | Gaps + rounded corners per row. |
| **Fade edges** | Top/bottom fade hinting more content. |
| **Scrollbar** | Scrollbar visibility. |
| **Empty text** | Shown when the list has no rows. |
| **Style** | How the selected row is marked. |
| **Accent** | Selection/highlight colour (empty = the Background border colour). |
| **Animate** | Slide/fade the selection indicator between rows. |
| **Multi-select** | Checkbox / ctrl-click multi-selection. |
| **Scroll** | Line-by-line snap, or smooth/pixel scrolling. |
| **Momentum** | Inertial flick scrolling (smooth mode). |
| **Drag scroll** | Grab and swipe the list. |
| **Keyboard** | Arrows / Page / Home / End move selection. |
| **Follow sel** | Keep the selected row scrolled into view. |
| **Type-ahead** | Focus + type to jump to a matching row. |
| **Filter box** | Header search field that live-filters rows. |
| **Highlight** | Highlight the matched substring. |
| **Hover** | Highlight the row under the pointer. |
| **Hover anim** | Animation on the hovered row. |
| **Commit** | When a pick 'commits' (fires recall / value-change). |
| **Source** | Rows from the Value editor, the device's live preset list, or the profile's shipped factory catalog. |
| **Rows** | Rebuild the preset rows from the profile (and latest scan) now. |
| **Recall** | Fire the bound recall action on select/confirm. |
| **Now playing** | Mark the live/recalled row distinct from selection. |

### Meter

_On 1 component: `Meter`._

| Property | What it does |
|---|---|
| **Orientation** | Horizontal / vertical bar, or a radial arc. |
| **Scale** | Linear, or decibel (0 dB near full scale). |
| **dB floor** | Decibels at the bottom of the meter. |
| **dB ceil** | Decibels at the top of the meter. |
| **Source** | A knob / slider / number whose live value drives the meter in preview (a bound device parameter drives it at runtime). |
| **Value** | Static/test value shown when nothing drives the meter. |
| **Min** | Value at empty. |
| **Max** | Value at full. |
| **Segments** | 0 = smooth continuous fill; N = N discrete LED segments. |
| **Gradient** | Blend zone colours smoothly vs hard steps. |
| **Rounded** | Fill corner radius (px). |
| **Thickness** | Bar/arc thickness in px (0 = fill the box). |
| **Track** | Unlit background colour. |
| **Enabled** | Show a marker at the recent maximum that holds then falls. |
| **Hold (ms)** | How long the marker holds before falling. |
| **Decay/s** | Normalized units per second the marker falls. |
| **Colour** | Peak marker colour. |
| **Ticks** | Draw scale tick marks along the meter. |
| **Tick count** | Number of divisions (marks = count + 1). |
| **Readout** | Show the numeric value overlaid on the meter. |
| **Precision** | Decimal places in the readout. |
| **Suffix** | Unit after the number (e.g. dB, %). |
| **Caption** | A text label shown with the meter. |
| **Position** | Where the caption sits. |
| **Start°** | Arc start angle (clockwise from 3 o'clock). |
| **Sweep°** | Degrees the arc sweeps. |

### Macro

_On 1 component: `Macro`._

| Property | What it does |
|---|---|
| **Position** | Knob value (0–1). Drag the knob in preview. |
| **Editable** | Turn the knob in preview. |
| **Lanes** | Show the assignment lanes beside the knob. |
| **Label** | Caption above the knob. |
| **Values** | Show live per-lane values. |
| **Divisions** | Draw value-scale ticks along each lane meter, using the same major/minor tick generator as the sliders. |
| **Major** | Major tick count (same as a slider's Major Count). |
| **Minor / gap** | Minor ticks between each pair of majors (same as a slider's Minor / Gap). |

### Constellation

_On 1 component: `Constellation`._

| Property | What it does |
|---|---|
| **Mode** | Snap = recall the nearest preset exactly (discrete). Blend = morph between nearby presets by distance (continuous). |
| **Editable** | Drag the probe / stars in preview. |
| **Wander** | Auto-drift the probe through the map on the clock. |
| **Wander (bars)** | How many bars one full pass through the map takes. |
| **Wander rate** | Wander speed (cycles per second). |
| **Blend** | Morph sharpness — higher makes the nearest preset dominate sooner. |
| **Links** | Draw constellation lines between sonically-similar presets. |
| **Neighbours** | How many nearest neighbours each preset links to. |
| **Labels** | Show preset names. |
| **Arrange** | Lay the presets out by sonic similarity (a best-effort 2D projection of their patches). Similar sounds cluster together. |
| **Field** | Map background colour. |
| **Probe** | Probe / readout colour. |
| **Links** | Link colour (stays faint — its transparency is kept). |
| **Labels** | Label colour. |

### Timbre

_On 1 component: `Timbre`._

| Property | What it does |
|---|---|
| **X axis** | Name the horizontal musical direction (e.g. dark → bright). |
| **Y axis** | Name the vertical musical direction (e.g. soft → aggressive). |
| **Blend** | Sharpness of the blend — higher makes the nearest anchor dominate sooner. |
| **Editable** | Drag the puck / anchors in preview. |
| **Field** | Show the colour heat field. |
| **Readout** | Show how many targets are actually MIDI-addressable (bound to a device parameter). |
| **Field** | Pad background colour (behind the anchor heat). |
| **Puck** | The blend puck colour. |
| **Labels** | Axis + anchor label colour. |

### Router

_On 1 component: `Router`._

| Property | What it does |
|---|---|
| **Source** | The incoming signal to shape. Aftertouch, Breath, Foot and Velocity only work if your gear sends them. |
| **Invert** | Flip the input before the curve. |
| **Editable** | Drag the transfer-curve nodes in preview. |
| **Linked** | The on-panel control whose value feeds the router in preview. |
| **Learn** | Press, then move the controller you want. It takes the one that moves most and pins its channel. |
| **CC number** | Which controller number to follow (0–127). |
| **Reduce by** | How to turn per-note pressure into one value. Highest = hardest-pressed key still down; Last = most recent. |
| **In channel** | Which MIDI channel to take this controller from. 0 = omni (any channel). |
| **Test in** | Stand-in value (0–1) until that controller sends something. The header reads Live once real data arrives. |
| **Dead-zone** | Ignore the bottom of the input range; the rest rescales to fill 0–1 (0 = off). |
| **Divisions** | Draw value-scale ticks along each destination meter, using the same major/minor tick generator as the sliders. |
| **Major** | Major tick count (same as a slider's Major Count). |
| **Minor / gap** | Minor ticks between each pair of majors (same as a slider's Minor / Gap). |
| **Curve** | The transfer-curve line colour. |
| **Input** | The live input bar + crosshair colour. |
| **Field** | Curve-area background colour. |
| **Grid** | Grid lines (stays faint — its transparency is kept). |
| **Labels** | Label colour. |

### Turing

_On 1 component: `Turing`._

| Property | What it does |
|---|---|
| **Run** | Advance the sequence in preview / player. |
| **Division** | Step length in musical time. |
| **Rate** | Steps per second. |
| **Length** | Loop length in steps (2–64). |
| **Randomness** | 0% = a locked loop; 100% = a new value every step; in between, the sequence slowly evolves. |
| **Quantize** | Snap step values to N discrete levels (0 = continuous). Try 2 for on/off, 5 for a scale-like feel. |
| **Gate at** | The Gate port fires when a step's value is at/above this threshold. |
| **Edit** | Drag the step bars in preview to seed the sequence. |
| **Gate row** | Show the gate dots below the bars. |
| **Divisions** | Draw value-scale lines across the bars, using the same major/minor tick generator as the sliders. |
| **Major** | Major division lines across the value range (same as a slider's Major Count). |
| **Minor / gap** | Minor lines inserted between each pair of majors (same as a slider's Minor / Gap). |
| **Seed** | Regenerate the step values. Drag the bars in preview for a hand-drawn sequence. |
| **Bars** | Step value bar colour. |
| **Head** | The live (current) step colour. |
| **Field** | Sequence background colour. |
| **Labels** | Hint text colour. |

### Looper

_On 1 component: `Looper`._

| Property | What it does |
|---|---|
| **Run** | Play the loops in preview / player. |
| **Loop (bars)** | Loop length in bars. 0.25 = one beat in 4/4. |
| **Loop (s)** | Loop length in seconds — how long one pass around takes. |
| **Record** | Press & move inside a lane in preview to record its motion. |
| **Playhead** | Show the sweeping playhead. |
| **Grid** | Show the quarter/half time grid lines. |
| **Divisions** | Draw value-scale lines across each lane, using the same major/minor tick generator as the sliders. |
| **Major** | Major value-division lines (same as a slider's Major Count). |
| **Minor / gap** | Minor lines between each pair of majors (same as a slider's Minor / Gap). |
| **Lane** | Lane background colour. |
| **Grid** | Grid lines (stays faint — its transparency is kept). |
| **Playhead** | The sweeping playhead colour. |
| **Labels** | Lane label colour. |

### ChordPad

_On 1 component: `ChordPad`._

| Property | What it does |
|---|---|
| **Layout** | Wheel = circle of fifths, with relative minors inside their majors. Grid = compact, in-key only. |
| **Mode** | Chords = one chord per pad. Notes = one scale note per pad (isomorphic). |
| **Key** | The tonic. Pads and the wheel's lit wedge follow it. |
| **Scale** | Determines which chords are in key. |
| **Chords** | Triads or four-note sevenths. |
| **Voicing** | Close = tight stack. Spread = alternate notes up an octave. Drop-2 = the 2nd-from-top drops an octave. |
| **Inversion** | Rotate the chord tones upward. |
| **Octaves** | How many octaves of scale notes to lay out. |
| **Columns** | Grid width. |
| **Octave** | Transpose the whole pad in octaves. |
| **Velocity** | Note-on velocity (1–127). |
| **Channel** | MIDI channel the notes go out on (1–16). |
| **Strum** | Milliseconds between chord notes (0 = block chord). |
| **Latch** | Pads keep sounding until tapped again (hands-free auditioning). |
| **Playable** | Allow playing the pads in preview / the player. |
| **Piano** | Show the sounding-notes keyboard strip. |
| **Numerals** | Show roman numerals (I, ii, ♭VII…) on the pads. |
| **Echo MIDI in** | Outline the pads and piano strip from notes arriving on the hardware MIDI input. |
| **In channel** | Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want. |
| **Echo colour** | Colour of the incoming-note outline. |
| **Pads** | Pad fill colour. |
| **In key** | Accent for in-key chords / major ring. |
| **Tonic** | Accent for the tonic + sounding notes. |
| **Minors** | Accent for the inner (relative minor) ring. |
| **Labels** | Label colour. |

### Arp

_On 1 component: `Arp`._

| Property | What it does |
|---|---|
| **Run** | Start / stop the clock. Stopped, the lane still shows the walk. |
| **Pattern** | How the held notes are walked. Chord (block) restates them all together on every step. |
| **Notes from** | Chord = its own key/scale chord. Linked = a Chord Pad on this panel (that pad goes silent). Incoming = keys from the MIDI input. |
| **In channel** | Which MIDI channel to take notes from. 0 = omni (any channel). |
| **Chord Pad** | The pad whose held notes feed the arp. |
| **Key** | Tonic of the arp's own chord. |
| **Scale** | Which chords are available. |
| **Degree** | Which scale degree the chord is built on (0 = tonic). |
| **Chord** | Triad or four-note seventh. |
| **Octave** | Octave of the chord root (3 → C3). |
| **Sync to transport** | Take the step length from the panel's Transport instead of a free rate. |
| **Division** | Step length in musical time. Gate and swing stay fractions of the step, so they follow the tempo too. |
| **Rate** | Steps per second. |
| **Octaves** | Repeat the note set upward this many octaves. |
| **Gate** | Note length as a fraction of the step (1 = legato). |
| **Swing from** | Transport = inherit the clock's swing. Own = this arp's own setting. Free-running always uses its own. |
| **Swing** | Delay every odd step, up to half a step (0 = straight). |
| **Latch** | External sources: keep arpeggiating the last chord after the pad (or the keyboard) is released. |
| **Velocity** | Note-on velocity (1–127). |
| **Channel** | MIDI channel the notes go out on (1–16). |
| **Editable** | Click a step in preview to mute / unmute it. |
| **Euclidean** | Spread N pulses evenly over M steps. |
| **Steps** | Length of the rest pattern. |
| **Pulses** | How many of those steps play. |
| **Rotate** | Shift the pattern's starting point. |
| **Muted** | Steps silenced by hand (click them in preview). A hand-mute wins over the Euclidean pattern. |
| **Header** | Show the pattern / source / rate strip. |
| **Note names** | Print the note in each step cell. |
| **Field** | Lane background colour. |
| **Steps** | Colour of the note blocks. |
| **Playhead** | Colour of the step currently sounding. |
| **Rests** | Fill for muted / rested steps. |
| **Labels** | Label colour. |

### NoteRibbon

_On 1 component: `NoteRibbon`._

| Property | What it does |
|---|---|
| **Mode** | Scale snap = in-key notes only. Chromatic = every semitone. Glide = continuous pitch via pitch bend. |
| **Orientation** | Vertical strips run low-at-the-bottom. |
| **Key** | Tonic. Roots are accented; in scale-snap mode only these notes are reachable. |
| **Scale** | Which notes count as in key. |
| **Lowest** | MIDI note at the low end of the strip (48 = C3, 60 = middle C). |
| **Octaves** | How far the strip reaches. Wider = more range, narrower = more precision per pixel. |
| **Bend range** | Semitones of pitch bend. Must match the synth's own bend range; 2 is the common default. |
| **Velocity** | Note-on velocity (1–127) when velocity is fixed. |
| **Vel. from** | Position takes velocity from where on the short axis you touched — the closest a mouse gets to dynamics. |
| **Channel** | MIDI channel for notes, bend and the CC (1–16). |
| **Latch** | The note keeps sounding after release; touch again to silence it. |
| **Cross axis** | The short axis as a second expression dimension — standing in for the pressure a real ribbon senses. |
| **CC** | Which controller that axis sends (1 = mod wheel, 74 = filter cutoff on many synths). |
| **Echo MIDI in** | Outline the matching zones from notes arriving on the hardware MIDI input. |
| **In channel** | Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want. |
| **Echo colour** | Colour of the incoming-note outline. |
| **Playable** | Allow playing the strip in preview / the player. |
| **Header** | Show the key / mode / current-note strip. |
| **Note names** | Print note names on the zones (hidden automatically when they're too narrow). |
| **Field** | Strip background colour. |
| **Zones** | Zone fill colour. |
| **In key** | Accent for in-key zones. |
| **Roots** | Accent for the tonic zones. |
| **Touch** | Colour of the played-position rail. |
| **Labels** | Label colour. |

### DrumPads

_On 1 component: `DrumPads`._

| Property | What it does |
|---|---|
| **Rows** | Grid height. |
| **Columns** | Grid width. |
| **Map** | GM = General MIDI kit names plus the hi-hat choke group. Chromatic = labelled by pitch. Custom = named by you. |
| **Pad 1 note** | The note the first pad sends; the rest run up chromatically from it. 36 = GM Bass Drum 1. |
| **Pad 1 at** | Hardware grids put pad 1 at the bottom-left, under your left thumb. Top-left is plain reading order. |
| **Channel** | MIDI channel (10 is the GM percussion channel). |
| **Mode** | Momentary = held while pressed. One-shot = a short fixed gate. Toggle = on until you hit the pad again. |
| **Gate** | Milliseconds the one-shot note is held before note-off. |
| **Velocity** | Note-on velocity (1–127) when velocity is fixed. |
| **Vel. from** | Position takes velocity from how high up the pad you strike — the top is hardest. |
| **Playable** | Allow striking the pads in preview / the player. Dragging across the grid rolls through them. |
| **Echo MIDI in** | Outline the matching pads from notes arriving on the hardware MIDI input. |
| **In channel** | Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want. |
| **Echo colour** | Colour of the incoming-note outline. |
| **Corners** | Give the four corners of every pad their own action, so the same sixteen triggers carry a second vocabulary — a roll under one thumb, a flam under the other. The map is the same on every pad on purpose: a corner is a gesture your hand learns once. |
| **Corner size** | How much of each pad a corner claims, measured in from both edges. The rest of the pad is the face and always plays a plain hit. |
| **Flam lead** | How far ahead of the main hit a flam's grace note lands, in milliseconds. |
| **Ghost level** | A ghost strike's velocity, as a fraction of the hit it replaces. Also the level a flam's grace note uses. |
| **Roll rate** | How fast a rolling pad restrikes, as a note value against the panel transport — so a roll stays in time when the tempo moves. |
| **Follow tempo** | Off runs the roll at a fixed speed instead, for a panel with no Transport to follow. |
| **Strikes / sec** | The free-running roll speed. |
| **Roll delay** | How long a pad is held before the roll begins, in milliseconds. 0 rolls from the first strike; a short delay lets you play single hits and roll only when you lean on it. |
| **Roll velocity** | Repeats strike at this fraction of the opening hit, so the first one reads as an accent and the roll sits under it. |
| **Header** | Show the map / size / last-hit strip. |
| **Labels** | Drum names on the pads (hidden automatically on small pads). |
| **Note nums** | The MIDI note number on each pad. |
| **Field** | Grid background colour. |
| **Pads** | Pad fill colour. |
| **Accent** | Default pad stripe, for pads with no colour of their own. |
| **Hit** | Colour of a sounding pad. |
| **Labels** | Label colour. |

### Phrase

_On 1 component: `Phrase`._

| Property | What it does |
|---|---|
| **Run** | Advance the sequence in preview / player. Stopped, the grid still shows the pattern. |
| **Rows are** | Scale degrees = the pattern transposes and re-harmonises with the key. Chromatic = a plain piano roll. |
| **Key** | Tonic. Row 0 is this note at the base octave. |
| **Scale** | Which degrees the rows step through. |
| **Octave** | Octave of row 0 (3 → C3). |
| **Transpose** | Semitones, applied after the row → pitch map. Use this to move the whole line without changing the key it is written in. |
| **Steps** | Pattern length. Shrinking never destroys cells — they are kept and come back if you grow it again. |
| **Rows** | How many degrees the grid shows. 8 gives an octave of a seven-note scale plus the tonic above. |
| **Direction** | Ping-pong turns round at the ends without repeating them. Random repeats identically each pass — change the seed. |
| **Seed** | Changes which order Random produces. Same seed, same order — every time. |
| **Cell** | Which cell the fields below edit. Step is 1-based, as the grid counts it. |
| **Chance** | How often the step plays, 0–100%. The same seed and position always give the same result. |
| **Ratchet** | How many times the step retriggers inside itself. A tied note is never ratcheted. |
| **Length** | This note's gate as a multiple of the step — 2 holds it for two steps. Blank uses the pattern gate. |
| **Tie** | Hold this note through from the step before. Needs a note on the same row in the previous step. |
| **Velocity** | This cell's own velocity. Blank follows the pattern's. |
| **Division** | Step length in musical time. |
| **Rate** | Steps per second. |
| **Gate** | Note length as a fraction of the step; 1 = legato. A note that the next step ties is exempt. |
| **Swing from** | Transport = inherit the clock's swing. Own = this sequencer's own setting. Free-running always uses its own. |
| **Swing** | Delays every odd step by up to half a step. Shares the Arpeggiator's swing setting. |
| **Velocity** | The default a cell uses when it has none of its own. |
| **Channel** | MIDI channel 1–16. |
| **Bar line** | Shade every Nth step, so 16 steps read as four beats. |
| **Start from** | A blank grid is a blank page. These replace the pattern — the hardest part of a step sequencer is the first four notes. |
| **Editable** | Click a cell in preview to toggle a note; drag across to paint a run of them. |
| **Header** | Show the key / length / rate strip. |
| **Row labels** | The degree (or pitch) labels down the left. |

### Setlist

_On 1 component: `Setlist`._

| Property | What it does |
|---|---|
| **Loop** | Next at the end goes back to the first scene. |
| **Send program** | Bank select then program change, in that order. |
| **Recall values** | Write each scene's captured panel values on recall. |
| **Recall tempo** | A scene's tempo drives the Transport. Songs have tempos; that is most of what a setlist is for. |
| **Crossfade** | Milliseconds to slide panel values on a recall; 0 snaps. Only numbers interpolate; the rest switch at halfway. |
| **PC channel** | Where program change is sent. |
| **CC** | Footswitch CC number. 64 is the sustain pedal, which most footswitches send. |
| **Channel** | 0 listens on every channel. |
| **Threshold** | Where 'pressed' starts. A sweeping expression pedal crosses it once on the way up, not thirty times. |
| **Back pedal** | A second CC for 'previous'. Blank means no back pedal. |
| **Scene** | 1-based, as the list shows it. |
| **Click a row** | Clicking a scene in preview jumps to it, through the same recall the pedal uses. |
| **Header** | Position, current scene name and the pedal CC. |

### Harmoniser

_On 1 component: `Harmoniser`._

| Property | What it does |
|---|---|
| **Mode** | Diatonic = the chord for the played note's degree in the key. Memory = a fixed shape transposed to whatever you play. |
| **Chord size** | Notes stacked in thirds up the scale. 3 is a triad, 4 a seventh, 5 a ninth. |
| **Out of key** | What to do with a note that has no degree in the scale. |
| **Shape** | Semitones from the played note, comma separated. 0 is the played note itself. |
| **Voicing** | Open lifts the middle voice an octave; drop 2 drops the second voice from the top. Both need at least three notes. |
| **Inversion** | Lifts the lowest voices up an octave, one per step. |
| **Octave** | Moves the added voices by whole octaves, leaving the played note where it is. |
| **Max voices** | A hard ceiling on how many notes one key can produce. |
| **Keep played note** | Send the played note along with the harmony. Off sends the harmony only. |
| **In channel** | 0 listens on every channel. |
| **Out channel** | Where the chord is sent. |
| **Velocity** | 0 follows the velocity you played. Any other value is fixed — an organ-like part that ignores how hard you hit it. |
| **Voice leading** | Pick the inversion closest to the previous chord. Closest = least total movement; Smooth = holds the top voice. |
| **Strum** | Spread the chord over this many milliseconds. Note-offs are never strummed. |
| **Direction** | Which end of the chord arrives first. |
| **Forward bend** | Pass incoming pitch bend to the chord's channel, all 14 bits. |
| **Forward pressure** | The same for channel aftertouch. |
| **Degree** | 1 is the tonic. |
| **Chord** | Semitones from the played note, comma separated. Blank uses the stacked thirds. |
| **Click to audition** | Click a key in preview to hear the chord. Most of the editor's life is spent with no keyboard plugged in. |
| **Header** | The chord name and mode strip. |
| **Low note** | The keyboard's resting low note when nothing is sounding. It stretches to fit whatever plays. |
| **Span** | How many semitones it shows at rest. |
| **You played** | The key you pressed, so it is distinct from what the harmoniser added. |

### Recorder

_On 1 component: `Recorder`._

| Property | What it does |
|---|---|
| **Capture** | Which sources feed the take. The panel source taps every note-emitting control here. |
| **One pass** | Stop at the end of the first lap instead of layering until you press stop. |
| **Count-in** | Bars to wait after arming before capture starts. It still begins on a loop boundary. |
| **Bars** | Loop length in bars. |
| **Length** | Loop length in seconds, free-running. |
| **Channel** | The channel playback sends on. Captured notes keep their own channel in the take; this is where they go out. |
| **Transpose** | Semitones. A note landing outside 0–127 is dropped, not clamped. |
| **Velocity ×** | Scales every recorded velocity on the way out. |
| **Grid** | Divisions per loop. 16 over one bar is sixteenth notes. |
| **Strength** | 0 keeps it exactly as played; 1 snaps hard to the grid. |
| **Lengths too** | Off by default: quantising lengths turns a legato line into blocks, which is a separate decision from fixing the timing. |
| **Into key** | Pitch-correct the take to the nearest note of the scale. Ties go down. |
| **Whole take** | Nudge moves everything; shift transposes the stored take, not only its playback. |
| **Note** | Which recorded note the fields below edit, in time order. |
| **Position** | Where in the loop it starts, as a percentage. |
| **Pitch** | MIDI note number. |
| **Length** | As a fraction of the loop. |
| **Click to arm** | Clicking the roll in preview arms and stops it. Turn off for a display-only recorder driven by a script. |
| **Header** | Show the state / count / length strip. |
| **Pitch labels** | The note names down the left. |
| **Min rows** | The roll fits itself to the take, but never shows fewer rows than this. |
| **Recording** | Also colours the newest overdub pass, so you can see what you just added. |

### SplitZone

_On 1 component: `SplitZone`._

| Property | What it does |
|---|---|
| **In channel** | Which MIDI channel to take notes from. 0 = omni (any channel). |
| **No zone** | What happens to a note no zone claims: drop it or pass it through. |
| **Pass ch** | The channel unclaimed notes are passed on. |
| **Show from** | Lowest note on the drawn keyboard. Snapped out to a white key, so it never starts on a floating black one. |
| **…to** | Highest note on the drawn keyboard. |
| **Preset** | Replace the zone list with a common arrangement, built from the drawn keyboard range. Overwrites what's there. |
| **Editable** | Drag split points on the keyboard in preview, and click a key to audition it. |
| **Header** | Show the 'Zone → channel' summary strip. |
| **Zone names** | Draw each zone's name on its band. |
| **Mark gaps** | Shade keys no zone claims. |
| **Face** | Panel behind the keyboard. |
| **Held** | Colour of a key currently sounding. |
| **Gap** | Colour of a key no zone claims. |

### Panic

_On 1 component: `Panic`._

| Property | What it does |
|---|---|
| **Label** | Text on the button. |
| **Scope** | Which MIDI channels the panic covers. All 16 is the default. |
| **Channel** | The single channel to silence. |
| **Reset CCs** | Also send CC 121 (reset all controllers), which releases a mod wheel or pedal left stuck up. |
| **Centre bend** | Also recentre pitch bend — a Ribbon glide interrupted mid-slide can leave the synth detuned. |
| **Stop panel** | Also silence this panel's own note controls — Chord Pad, Arp, Ribbon and Drum Pads — and clear the echoed note display. |
| **Pressable** | Allow firing it in preview / the player. |
| **Summary** | Show the second line saying what pressing it will do. |
| **Face** | Button fill. |
| **Border** | Button outline. |
| **Label** | Label colour. |
| **Flash** | The colour it flashes when fired. |

### Transport

_On 1 component: `Transport`._

| Property | What it does |
|---|---|
| **Source** | Internal = this is the master clock. MIDI clock in = follow an incoming clock. Host/DAW = follow the DAW playhead. Followers ignore the tempo box. |
| **Tempo** | Beats per minute ({MIN_BPM}–{MAX_BPM}). Changing it never jumps the position — only the rate ahead of the current beat. |
| **Beats/bar** | Time signature numerator — drives the bar.beat readout and the downbeat accent. |
| **Beat unit** | Time signature denominator (4 = quarter notes). |
| **Run on load** | Start the clock as soon as the panel opens, so an exported Player is already running. |
| **Count-in** | Bars of silence before the first step fires when you press play; 0 = off. Synced components hold and stay quiet. |
| **Clock out** | Send MIDI clock so hardware follows this panel — 24 messages per quarter note. |
| **Loop** | Fold the position into a bar range, so the clock comes back round instead of running on forever. |
| **From bar** | The first bar of the loop, counting from 1. |
| **Length (bars)** | How long the loop is. 0.25 = one beat in 4/4. |
| **Playable** | Allow play/stop and tap tempo in preview / the player. |
| **Position** | Show the bar.beat.tick readout and the beat pulse. |
| **Swing** | Shuffle for every follower on this clock — delays every odd step by up to half a step. |
| **Tap tempo** | Tapping the face sets the tempo. Inactive while following an external clock or the DAW. |
| **Face** | Background colour. |
| **Accent** | Play button / running colour. |
| **Beat** | Beat-pulse colour. |
| **Labels** | Label colour. |

### Constraint

_On 1 component: `Constraint`._

| Property | What it does |
|---|---|
| **Editable** | Drag the member bars in preview. |
| **Badge** | Show the rule badge on the cell. |
| **Min gap** | Minimum spacing kept between adjacent members (e.g. keep resonance a little below cutoff). |
| **Values** | Show live per-member values. |
| **Field** | Cell background colour. |
| **Track** | Empty bar track colour (stays faint — its transparency is kept). |
| **Link** | Link chain + badge colour. |
| **Labels** | Label colour. |

### Kinetic

_On 1 component: `Kinetic`._

| Property | What it does |
|---|---|
| **Run** | Integrate the physics in preview / player. |
| **Fling** | Drag the ball to throw it in preview. |
| **Reset** | Drop the ball back to a fresh start. |
| **Gravity** | Downward pull. 0 = zero-g; higher makes the ball fall and settle. |
| **Bounce** | Wall restitution — energy kept on each bounce. 100% = perpetual motion; lower = the ball loses energy and slows. |
| **Drag** | Air resistance — how quickly the ball loses speed over time (0 = frictionless). |
| **Keep alive** | When the ball nearly stalls, give it a random kick this strong to keep it moving. 0 = let it settle. |
| **Trail** | Comet trail behind the ball. |
| **Walls** | Draw the box walls. |
| **Field** | Box background colour. |
| **Ball** | Ball + trail colour. |
| **Walls** | Wall colour (stays faint — its transparency is kept). |
| **Labels** | Hint colour. |

### Orbit

_On 1 component: `Orbit`._

| Property | What it does |
|---|---|
| **Run** | Animate the satellites in preview / player. |
| **Cycle (bars)** | How many bars one global cycle takes. A satellite at ratio 2 then makes two turns per cycle, on the bar. |
| **Rate** | Global speed — cycles per second (all ratios are relative to this). |
| **Editable** | Drag satellites to a new radius/angle in preview. |
| **Rings** | Faint orbit rings. |
| **Spokes** | Line from centre to each satellite. |
| **Trails** | Comet trails behind satellites. |
| **Values** | Live per-satellite value readout. |
| **Field** | Background inside the pad. |
| **Rings** | Orbit rings (stays faint — its transparency is kept). |
| **Centre** | Centre hub colour. |
| **Labels** | Satellite label colour. |

### Ribbon

_On 1 component: `Ribbon`._

| Property | What it does |
|---|---|
| **Preset** | Quick-set for the common hardware controllers. |
| **Style** | Flat touch strip or a 3-D wheel. |
| **Orientation** | Vertical or horizontal. |
| **Value** | Current / rest position (0–1). |
| **Bipolar** | Value port emits −1..1 (pitch bend). |
| **Editable** | Touch/drag in preview. |
| **Mode** | What the value does on release. Centre = pitch wheel; None = latch (mod wheel / ribbon). |
| **Rest** | Rest value (0–1). |
| **Speed** | Glide speed (units/sec; 0 = instant snap). |
| **Snap** | Value snap step (0 = continuous). |
| **Touch glow** | Glow while held. |
| **Readout** | Show the numeric value. |
| **Label** | Caption under the strip/wheel. |
| **Fill** | Strip fill / notch accent. |
| **Indicator** | Position indicator colour. |
| **Track** | Strip groove colour. |
| **Wheel** | Wheel body colour. |

### Crossfader

_On 1 component: `Crossfader`._

| Property | What it does |
|---|---|
| **Law** | Equal-power = constant loudness. Linear = −6 dB dip at centre. Sharp = both full through the middle. |
| **Orientation** | Horizontal or vertical fader. |
| **Mix** | Position: 0 = full A, 1 = full B. |
| **Bipolar** | Mix port emits −1..1. |
| **Editable** | Drag the handle in preview. |
| **Detent** | Snap-to-centre threshold (0 = off). |
| **Gain bars** | Draw per-side gain indicators. |
| **Spring back** | Glide the handle back to centre when released. |
| **Speed** | Glide speed (units/sec). |
| **Labels** | Show the A/B end labels. |
| **A colour** | A-side fill. |
| **B colour** | B-side fill. |
| **Handle** | Handle colour. |
| **Track** | Groove colour. |

### Joystick

_On 1 component: `VectorJoystick`._

| Property | What it does |
|---|---|
| **Bipolar** | X/Y ports emit −1..1 (vs 0..1). Corner blends are always 0..1. |
| **Editable** | Drag the puck in preview. |
| **Rest X** | Resting puck X (0–1). |
| **Rest Y** | Resting puck Y (0–1, bottom = 0). |
| **Spring back** | Glide the puck back to centre when released (pitch/mod-wheel feel). |
| **Axes** | Which axes spring back. |
| **Speed** | Glide speed (units/sec). |
| **Show** | Draw corner markers + labels. |
| **Grid** | Background grid. |
| **Divisions** | Grid divisions per axis. |
| **Crosshair** | Lines through the puck. |
| **Puck size** | Puck radius (px). |
| **Trail** | Fading motion trail behind the puck. |
| **Trail length** | Number of trail points. |
| **Puck** | Puck colour. |
| **Pad** | Pad background. |
| **Corner mark** | Corner marker colour. |
| **Trail colour** | Motion-trail colour. |

### Matrix

_On 1 component: `Matrix`._

| Property | What it does |
|---|---|
| **Cell style** | How each cell shows its amount. |
| **Bipolar** | Amounts range −1..1 (vs 0..1). |
| **Editable** | Drag cells in preview. |
| **Labels** | Show source/destination labels. |
| **Values** | Print the amount in each cell. |
| **Snap** | Cell amount snap step (0 = free). |
| **Clear** | Reset all amounts to zero. |
| **Positive** | Colour for positive amounts. |
| **Negative** | Colour for negative amounts. |
| **Cell bg** | Cell background. |
| **Labels** | Label text colour. |

### Envelope

_On 1 component: `Envelope`._

| Property | What it does |
|---|---|
| **Preset** | Seed a shape. ADSR / AR / AD / DAHDSR keep stages; MSEG / Free let every node move. |
| **Sustain node** | Which node holds while a note is held (−1 = none). |
| **Editable** | Allow dragging / adding nodes in preview. |
| **Loop** | Cycle a section (function-generator / looping envelope). |
| **Loop start** | Node index the loop returns to. |
| **Loop end** | Node index the loop repeats from. |
| **Snap X** | Grid snap for time when dragging (0 = free). |
| **Snap Y** | Grid snap for level when dragging (0 = free). |
| **Show** | A moving dot along the curve at the current phase. |
| **Phase source** | A knob / slider whose 0–1 value drives the playhead in preview. |
| **Phase** | 0–1 position of the playhead. |
| **Grid** | Draw a background grid. |
| **Cols** | Vertical grid divisions. |
| **Rows** | Horizontal grid divisions. |
| **Fill** | Shade the area under the curve. |
| **Line** | Curve line colour. |
| **Fill colour** | Area fill colour. |
| **Nodes** | Node handle colour. |
| **Sustain** | Sustain marker + node colour. |

### Parts

_On 5 components: `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`._

> No property hints found in `CustomDesignSurfaceEditor.svelte`. Its properties are undocumented in the panel as well.

### Bindings

_On 5 components: `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create a new named binding. |
| **Bindings** | Select the binding to edit. |
| **Enabled** | Enable or disable this binding. |
| **Source** | Runtime signal used as the input for this mapping. |
| **Mode** | Mapping strategy used to convert input to output. |
| **Unit** | Display/runtime unit expected by the target property. |
| **Target** | Control or part path that receives the resolved output value. |
| **In Min** | Minimum input value for normalization. |
| **In Max** | Maximum input value for normalization. |
| **Out Min** | Minimum output value written to the target. |
| **Out Max** | Maximum output value written to the target. |
| **Clamp** | Clamp the output to the configured range. |
| **Round** | Round the resolved output value. |
| **Invert** | Invert the input range before output mapping. |
| **False** | Output used when the source resolves to false. |
| **True** | Output used when the source resolves to true. |
| **Map** | JSON object mapping enum names to output values. |
| **Pass-Through** | Write the source value directly to the target property without remapping. |

### DeviceBindings

_On 32 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`, `LcdDisplay`, `PixelDisplay`, `Macro`, `Constellation`, `Timbre`, `Router`, `Turing`, `Looper`, `Constraint`, `Kinetic`, `Orbit`, `Ribbon`, `Crossfader`, `VectorJoystick`, `Matrix`, `Envelope`, `Meter`._

| Property | What it does |
|---|---|
| **Enabled** | Enable semantic device parameter bindings for this component. |
| **Add** | Add a semantic parameter binding. |
| **Remove** | Remove the selected semantic parameter binding. |
| **Ports** | Value ports exposed by this component type. |
| **Binding** | Select which semantic binding to edit. |
| **Port** | Component value port that drives this binding. |
| **Role** | Logical device role used by the panel. |
| **Parameter** | Semantic parameter id from the device profile. |
| **Type** | Semantic parameter type. Dragging from the parameter browser fills this automatically. |
| **Adopt** | Allow this component to adopt compatible metadata from the parameter. |
| **Dry Run** | Compile and monitor the transaction without sending to hardware. |
| **Feedback** | Receive backend parameter updates for this binding. |
| **Echo** | Ignore obvious echoes of messages sent by CEditor. |

### States

_On 15 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TextInput`, `TimedButton`, `OneShotButton`, `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`._

| Property | What it does |
|---|---|
| **States** | Choose Base or a state you want to inspect and manage here. |
| **New** | Create a new visual state for this control. |
| **Mode** | Base is the unmodified control. Select a state chip to inspect that state directly. |
| **Target** | Choose whether visual tabs should currently edit Base or this state. |
| **Enabled** | Enable or disable this state rule. |
| **Group** | Grouping hint used by the runtime and future tooling. |
| **Name** | Display label used in the UI and debug tools. |
| **Desc** | Short note for what this state is meant to capture. |
| **Actions** | Duplicate, remove, or debug the selected state. |
| **Summary** | Visual tabs write overrides here when this state is targeted. |
| **Reset** | Clear all captured component or part overrides for this state. |
| **Raw Patches** | Optional JSON editing for advanced state patch work. |
| **Component** | Root-level patch map. Paths follow the normal section path format. |
| **Parts** | Per-part patch map keyed by part name. |

### Scripts

_On 42 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TimedButton`, `OneShotButton`, `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`, `LcdDisplay`, `PixelDisplay`, `Macro`, `Constellation`, `Timbre`, `Router`, `Turing`, `Looper`, `ChordPad`, `Arp`, `NoteRibbon`, `DrumPads`, `Phrase`, `Setlist`, `Harmoniser`, `Recorder`, `SplitZone`, `Panic`, `Transport`, `Constraint`, `Kinetic`, `Orbit`, `Ribbon`, `Crossfader`, `VectorJoystick`, `Matrix`, `Envelope`, `Meter`._

> No properties editor is registered for this section, so it has no hints to collect.

### Animations

_On 14 components: `Button`, `MomentaryButton`, `ToggleButton`, `RadioButtonGroup`, `CyclicButton`, `Combobox`, `Listbox`, `TimedButton`, `OneShotButton`, `Range`, `Number`, `Slider`, `Knob`, `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create a new animation node. |
| **Animations** | Select the animation to edit. |
| **Part** | Layer/part this animation target should affect. |
| **Property** | Common animatable property. |
| **Append** | Add this target to the selected animation target list. |
| **State** | State used by quick animation presets. |
| **Quick** | Create a state and animation preset for the chosen part. |
| **Enabled** | Enable or disable this animation. |
| **Kind** | Animation family. Transition is the only runtime kind in this slice. |
| **Duration** | Transition duration in milliseconds. |
| **Delay** | Transition delay in milliseconds. |
| **Easing** | Named easing curve, mapped to a CSS timing function. |
| **Trigger** | Trigger family that causes this transition to run. |
| **From** | Comma-separated previous states. Use * to match any state set. |
| **To** | Comma-separated next states that activate this animation. |
| **Source** | Value source that should be smoothed by this transition. |
| **Targets** | JSON array of target descriptors. Each item can provide a path and optional property hints. |

### Designer

_On 1 component: `CustomComponent`._

> No properties editor is registered for this section, so it has no hints to collect.

### Assets

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Embed** | Package images and filmstrips with saved components. |
| **Fonts** | Warn when downloaded components reference missing fonts. |
| **Images** | Image assets currently recorded in this component. |
| **Filmstrips** | Filmstrip assets currently recorded in this component. |
| **Add** | Create a reusable image asset slot for this component package. |
| **Selected** | Choose which image asset to inspect or replace. |
| **Export** | Download the selected image asset. |
| **Import** | Load a PNG/JPEG/WebP/GIF image and embed it into the package. |
| **Preview** | Visual check of the selected package image. |
| **Source** | Data URL or future packaged file reference. |
| **Size** | Imported image dimensions. |
| **Bytes** | Embedded source size estimate. |
| **Apply** | Use this image as the selected custom layer fill. |
| **Overlay** | Use this image as the selected custom layer overlay. |
| **Add** | Create a KnobMan-style filmstrip asset definition. |
| **Selected** | Choose which filmstrip to configure. |
| **Source** | Embedded filmstrip source size if this asset is baked or imported as a data URL. |
| **Export** | Download the selected generated or imported filmstrip image. |
| **Import** | Load a PNG/JPEG/WebP filmstrip from disk and embed it into the component package. |
| **Name** | Filmstrip asset name to create or replace. |
| **Value** | Value channel sampled from minimum to maximum while baking. |
| **Frames** | Number of frames to bake into the strip. |
| **Frame W** | Single-frame width. Zero uses the component width. |
| **Frame H** | Single-frame height. Zero uses the component height. |
| **Scale** | Output pixel scale. 2x gives crisper baked assets but larger strips. |
| **Axis** | Bake frames vertically or horizontally. |
| **Interp** | Runtime interpolation for this generated filmstrip. |
| **Bake** | Render the editable custom component into a reusable PNG filmstrip asset. |
| **Estimate** | Output strip size and approximate RGBA memory while baking. |
| **Mode** | Whether this bake will create a new asset or replace an existing one. |
| **Status** | Last bake result. |
| **Preview** | Visual check of the selected filmstrip asset. |
| **Frames** | Total frame count. |
| **Frame W** | Frame width. Zero means detect later. |
| **Frame H** | Frame height. Zero means detect later. |
| **Axis** | Filmstrip direction. |
| **Value** | Value channel that chooses the frame. |
| **Interp** | Frame interpolation mode. |

### ValueChannels

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create a named value channel for sliders, grids, modes, note selections, scroll offsets, and external links. |
| **Selected** | Choose which channel to edit. |
| **Signal** | Default value shown as normalized 0..1 signal. |
| **Surface** | Where this channel can be used outside and inside the custom component. |
| **Presets** | Apply common channel shapes without manually setting type, min/max, step, and formatting. |
| **Label** | Friendly label shown in the designer and public API. |
| **Type** | Controls value rules, formatting, and future device compatibility. |
| **Min** | Minimum numeric value. |
| **Max** | Maximum numeric value. |
| **Step** | Legal increment for snapping and keyboard changes. |
| **Default** | Initial value when the component is inserted. |
| **Default** | Initial value for this non-numeric channel. |
| **Values** | Comma-separated enum values used by cycle/switch controls. |
| **Enabled** | Clamp this channel before bindings, states, links, and preview output use the value. |
| **Lower From** | Optional channel this value cannot go below. Use this for value >= min. |
| **Upper From** | Optional channel this value cannot go above. Use this for min <= max. |
| **Range** | Raw normalized clamp range currently configured for this channel. |
| **Lower Gap** | Minimum normalized distance above the lower source. For max, set this to keep it above min. |
| **Upper Gap** | Minimum normalized distance below the upper source. For min, set this to keep it below max. |
| **Published** | Edited in the Publish tab. The channel flags follow it automatically. |
| **Device** | Allow MIDI/device binding for this value. |
| **Snap** | Snap this value to its defined step/ticks/grid. |
| **Precision** | Displayed decimal precision. |
| **Prefix** | Text before formatted values. |
| **Suffix** | Text after formatted values. |
| **Unit** | Optional unit label. |
| **Curve** | Mapping curve used by bindings and future device scaling. |
| **Dead Zone** | Optional dead-zone amount for value mapping. |
| **Hysteresis** | Optional hysteresis amount for stable stepped controls. |

### Behaviors

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create a behavior module such as slider, button, grid, piano bar, scroll, or filmstrip control. |
| **Selected** | Choose which behavior module to edit. |
| **Preview** | Visual sketch of how this behavior responds to input. |
| **Route** | Behavior type, target channel, and interaction support. |
| **Templates** | Apply common behavior types without guessing compatible geometry and interaction settings. |
| **Enabled** | Enable or disable this internal behavior module. |
| **Type** | Behavior type decides what interaction rules are available. |
| **Advanced Geo** | Show every geometry option for experimental/custom behavior pairings. |
| **Role** | Semantic role for runtime, debugging, and future accessibility. |
| **Channel** | Primary value channel changed by this behavior. |
| **Pointer** | Allow pointer or touch input. |
| **Keyboard** | Allow keyboard input. |
| **Wheel** | Allow mouse wheel input. |
| **Snap** | Use channel snap/tick/grid rules. |
| **Reverse Mouse** | Invert pointer and wheel value direction for this behavior module while leaving the artwork unchanged. |
| **Drag Mode** | How pointer movement changes value. Auto follows geometry; vertical is the usual knob/plugin drag. |
| **Sensitivity** | Multiplier for vertical, horizontal, or both drag modes. 1 means one control height/width covers the full value range. |
| **Invert X** | Flip the horizontal drag direction for this behavior only. |
| **Invert Y** | Flip the vertical drag direction for this behavior only. |
| **Advanced** | How the two drag axes merge into one value — combine mode, per-axis weights, and the increase direction. |
| **Combine** | projected never exceeds the pixels travelled; sum runs faster diagonally and cancels on the opposing diagonal; magnitude moves at the same rate in every direction, only the sign flips. |
| **Weight X** | Relative contribution of horizontal motion. |
| **Weight Y** | Relative contribution of vertical motion. |
| **Increase Angle** | Direction treated as increase, in degrees: 0 is right, 90 is up, 45 is the up-right default. |
| **X Channel** | Horizontal value controlled by this XY behavior. |
| **Y Channel** | Vertical value controlled by this XY behavior. Generated grid hit zones can target this as the Y value channel. |
| **Pointer Model** | Both axes update together from the pointer position in the target hit zone. |
| **Recommended** | Best defaults for an XY pad. |
| **Purpose** | Short design note for collaborators and downloaded components. |

### HitZones

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create an interaction area independent from visible layers. |
| **Selected** | Choose which hit zone to edit. |
| **Map** | Scaled overview of authored hit zones. |
| **Route** | What the selected zone controls. |
| **Templates** | Create common hit-zone shapes with sensible bounds and actions. |
| **Enabled** | Enable or disable this interaction zone. |
| **Editor** | Show this zone in designer/debug overlays. |
| **Shape** | Shape used for hit testing. |
| **Behavior** | Behavior module this hit zone controls. |
| **Value** | Value channel this hit zone changes. |
| **Action** | Action performed by this zone. |
| **Priority** | Higher priority wins overlapping hit zones. |
| **Cursor** | Cursor shown over this zone. |
| **X** | Zone X in its configured unit. |
| **Y** | Zone Y in its configured unit. |
| **W** | Zone width. |
| **H** | Zone height. |
| **Unit** | Percent keeps zones responsive; px keeps them fixed. |
| **Condition** | When this zone is active. Leave empty for always. |
| **Preview** | Selected zone bounds as percentages of the component area. |

### Generators

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Add** | Create rule-driven layers such as ticks, grids, piano keys, repeated LEDs, or segmented rings. |
| **Selected** | Choose which generator to edit. |
| **Preview** | Visual sketch of the selected generator family. |
| **Output** | Estimated output before materialization plus actual generated runtime output when available. |
| **Detach Plan** | What will be converted to editable custom component structure when this generator is detached. |
| **Live Parts** | Runtime parts currently generated from this rule. |
| **Live Zones** | Runtime hit zones currently generated from this rule. |
| **Enabled** | Enable this generator. |
| **Type** | Generator family. |
| **Geometry** | Layout geometry for the generated structure. |
| **Behavior** | Optional behavior module this generator follows. |
| **Prefix** | Prefix used for generated part names. |
| **Value** | Value channel for generated hit zones. |
| **Source** | Value source that drives generated visual output, for example mainValue or channel.mainValue.normalized. |
| **Y Value** | Optional second value channel for grid or XY-style generated hit zones. |
| **Action** | Interaction action used by generated hit zones. |
| **Mode** | Most generators can be scoped to a rectangular percentage area inside the component. |
| **Preset** | Quickly fill the whole component or leave a useful inset. |
| **X** | Left edge of the generated area. |
| **Y** | Top edge of the generated area. |
| **Width** | Generated area width. |
| **Height** | Generated area height. |
| **Count** | Primary generated item count. |
| **Minor** | Minor items between primary items, useful for ticks. |
| **Rows** | Rows for grid-like generators. |
| **Columns** | Columns for grid-like generators. |
| **Base Note** | First MIDI note for piano key generators. |
| **Radius** | Circular generator radius as a percentage from the centre. |
| **Start** | Circular generator start angle in degrees. |
| **End** | Circular generator end angle in degrees. |
| **LED Size** | Generated LED diameter in pixels. |
| **Active** | Colour used when an LED threshold is passed. |
| **Inactive** | Colour used before an LED threshold is reached. |
| **Mode** | Cumulative lights every LED below the value; single lights only the nearest LED. |
| **Hit Zones** | Generate matching hit zones where useful. |
| **Detach** | Allow future detach-to-layers conversion. |
| **Commit** | Convert generated output into normal editable layers and disable this generator. |

### Links

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Enabled** | Enable internal and external logic links for this component. |
| **Debug** | Show link debug information in the test bench later. |
| **Add** | Create a link between internal values, behaviors, visual properties, or external component API values. |
| **Selected** | Choose which link to edit. |
| **Flow** | Visual route for the selected link. |
| **Details** | Selected link summary. |
| **Metrics** | Quick overview of link coverage. |
| **Panel Flow** | Active panel-level routes connected to this custom component. |
| **Presets** | Apply a common routing pattern to the selected link or create one if none exists. |
| **Panel Routes** | Route this component output into another custom component's published input. |
| **Route Builder** | Create routes between published custom component outputs and inputs, including inbound routes into this component. |
| **Routes** | Select a link by its route. |
| **Enabled** | Enable this link. |
| **Type** | Link operation. |
| **Source** | Source channel, behavior, part path, or external input. |
| **Target** | Target channel, behavior, part path, or external output. |
| **Condition** | When this link runs. Leave empty to always run. |
| **Input Min** | Lowest source value for the mapping. |
| **Input Max** | Highest source value for the mapping. |
| **Output Min** | Lowest target value after mapping. |
| **Output Max** | Highest target value after mapping. |
| **Clamp** | Keep mapped values inside the output range. |
| **Round** | Round mapped values to whole numbers before snapping. |
| **Amount** | Amount added to the source before writing the target. |
| **Min** | Lowest allowed routed value. |
| **Max** | Highest allowed routed value. |
| **Expression** | Condition picking the true/false value below. |
| **True** | Channel name or literal value written when the expression is true. |
| **False** | Channel name or literal value written when the expression is false. |
| **Cases** | JSON object mapping source states to channel names or literal values. |
| **Invert** | Invert the boolean source before writing the target. |
| **Notes** | Freeform implementation notes for this link. |

### PublishedProperties

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Name** | Addressable name for external links and future scripts. |
| **Policy** | Published-only keeps internals private by default. |
| **Inputs** | Allow other components to drive published inputs. |
| **Outputs** | Allow this component to drive other components. |
| **Status** | Readiness of the public contract for library reuse and cross-component links. |
| **Surface** | What this component exposes to the rest of the panel. |
| **Contract** | Public routes that other components and panel properties can see. |
| **Quality** | Package warnings and issues for the public API. Click one to edit its source. |
| **Quick Publish** | Create common public contracts from the current value channels and parts. |
| **Property Suggestions** | Publish common user-editable properties from component parts. |
| **Add** | Add a public input by name. |
| **Selected** | Choose a published input to edit. |
| **Enabled** | Expose this input. |
| **Label** | Friendly name shown to users. |
| **Channel** | Internal channel driven by this public input. |
| **Type** | Public value type. |
| **Min** | Smallest value shown to users of this package. |
| **Max** | Largest value shown to users of this package. |
| **Step** | Increment used in normal properties. |
| **Default** | Reset value for this published input. |
| **Values** | Comma-separated public choices. |
| **Empty** | Expose value channels from the Values tab. |
| **Add** | Add a public output by name. |
| **Selected** | Choose a published output to edit. |
| **Enabled** | Expose this output. |
| **Label** | Friendly output name. |
| **Channel** | Internal channel emitted by this public output. |
| **Min** | Smallest emitted value shown in route previews. |
| **Max** | Largest emitted value shown in route previews. |
| **Step** | Increment for route previews and editors. |
| **Default** | Documented resting value for this output. |
| **Values** | Comma-separated emitted choices. |
| **Add** | Add a friendly editable property by name. |
| **Selected** | Choose an editable property to edit. |
| **Enabled** | Expose this editable property. |
| **Label** | Friendly name shown in normal panel properties. |
| **Type** | Property editor type. |
| **Part** | Optional shortcut target part. |
| **Path** | Internal path this property edits when the component is reused. |
| **Min** | Smallest value shown in normal properties. |
| **Max** | Largest value shown in normal properties. |
| **Default** | Reset value for this exposed property. |
| **Empty** | Expose friendly customization properties here. |

### ExternalAPI

_On 1 component: `CustomComponent`._

> No properties editor is registered for this section, so it has no hints to collect.

### Variants

_On 1 component: `CustomComponent`._

| Property | What it does |
|---|---|
| **Active** | Variant used by preview and normal panel properties. |
| **Selected** | Variant to inspect and edit. |
| **Add** | Add a named component variant such as compact, vertical, dark, or detailed. |
| **Summary** | Variant count and active state. |
| **Selected** | Selected variant patch size. |
| **Starter Variants** | Create common variant patches without hand-writing JSON. |
| **Enabled** | Enable this variant. |
| **Label** | Friendly variant label. |
| **Description** | Describe when this variant should be used. |
| **Overrides** | Properties this variant changes from the base component. Base value shown for reference. |


---

## Further reading

| Document | What it is |
|---|---|
| [Getting started with scripts](scripting-getting-started.md) | Your first script, end to end. |
| [Scripting manual](scripting-manual.md) | The API reference: every command, in seven languages. |
| [Scripting cookbook](scripting-cookbook.md) | Task-based recipes. |
| [API explorer](api-explorer.html) | The same API as a searchable page, with screenshots. |
| [Docs index](README.md) | Everything, including the design records. |
