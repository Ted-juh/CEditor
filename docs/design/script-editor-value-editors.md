# Editing values in place in the script editor

Status: **proposal, nothing built.** 2026-10-18. Four of the silent failures it found were then
fixed in the script runtimes, and [Fixed since, and still open](#fixed-since-and-still-open) says
which and what was left.

It started as a question about colour. A script's colours are typed out as hex, so why is there no
swatch beside them that opens the display panel's colour and gradient editors? Colour turned out to
be one case of something more general, and the decisions are in the general part. So this record
takes the general shape first, with the kinds at a glance and what looking into them showed. It
then works colour and gradient through as the example, lists the other kinds of value with what
each would need, and ends with fifteen examples in script form.

Where this names a file or a line, it was read in the tree on that date. Anything not built yet is
described as a proposal.

## The idea

A script is full of values the app already has a better way to choose than typing: colours,
gradients, easing curves, note divisions, scale names, font families, images, the names of controls
and the paths of their properties. The script editor shows all of them as plain text. The proposal
is that the editor recognises such a value and then:

- **marks** it with a tint, an underline or a glyph in the gutter
- **explains** it on hover
- **checks** it, through the editor's existing diagnostics
- **edits** it, where the app already has an editor for that kind of value. The editor opens on the
  value and writes the result back into the script as text.

The script stays the truth. The editor only ever changes characters in it, through the same edit
path as typing.

## The kinds at a glance

Grouped by how you would change each one. [The other kinds](#the-other-kinds) has the detail, and
[Examples](#examples) shows each one in a script.

**Values that need a picture to choose, so they open a tab in the display panel**

- **Colours** open the Colors tab.
- **Gradients** (`ce.draw.gradient`) open the Gradient tab.
- **Easing curves** (`curve = "outBack"`, or four numbers) open the Animation tab's curve editor.
  Its curve picture and editor already work on their own, and the API documentation already says
  the script and the tab use the same four numbers.
- **Font families** (`ce.text.style`, `ce.draw.measure`, `ce.text.font`) open the Text tab's family
  list, where each row is set in its own face.
- **Images and icons** (`ce.image.asset`) get a thumbnail and open the Assets tab.

**Values chosen from a fixed list, so they use the editor's own completion list**

- Note divisions, scales, chords, event names and a control's animation names.
- The 16 parameters whose allowed values the API already lists, such as blend modes, line caps and
  image fit.
- Control names and property paths.

The completion list (Ctrl+Space) reopens over a value that is already there and offers the
alternatives. That adds no pop-up, which keeps the recorded rule that colour editing happens only in
the display panel.

**Numbers with a known unit and range, so you drag them**

- Angles, milliseconds and opacity, by Alt-drag in place, with the drag code the app already has.

**Values worth reading and checking but not editing**

- **SysEx**: the bytes that will actually be sent, and the checksum where it can be known.
- **Note numbers**: `60` reads as C4, and `"C4"` as 60.
- **Device parameters**: the range and the CC number.

**Not worth doing:** true/false values, free text such as labels and log messages, and numbers with
no unit or range.

## What looking into it showed

1. **The checks may matter more than the editors.** Several mistakes in a script failed with no
   error at all. Each of these was traced through the WebView runtime (`panelRuntime.js`) on this
   date. The first, second, fourth and fifth were then fixed in the runtimes (see
   [Fixed since, and still open](#fixed-since-and-still-open)):
   - `ce.midi.sendNote(1, "c4", 100)` played note 0, C-1. The name parser wants a capital letter,
     and `sendNote` turned a name it could not read into 0.
   - `ce.midi.sendSysex("F0411000")` sent `F0 FF F7`. Hex text is split on spaces and commas, so
     the whole string was read as one number and clamped to 255. The player kept the low byte
     instead and sent `F0 00 F7`.
   - `ce.time.step(beats, "1/8t")` returns nothing, because divisions are case-sensitive: the
     table spells it `"1/8T"`.
   - `ce.draw.image("knob-cap", …)` drew nothing, because it wants the image data and not an
     asset's name.
   - A Roland SysEx template with `$checksum` and no `$checksumStart` sums the header as well, and
     *"a message the synth rejects silently"* is the result (`deviceDefinitions.js`).

   Others report themselves, but only when the script runs: `ce.draw.blend` with an unknown mode,
   `ce.text.style` with a font that is not available, and now the four fixed above. A check moves
   the same message to the moment it is typed. The checks for lists of names are also the cheapest
   to build, which makes them the best next step after colour.
2. **A value is recognised by where it is, not by what it looks like.** `"F0411000"` is a colour
   when it is set on a property and SysEx when it is passed to `sendSysex`. So the order is: what
   the API says that argument is, then a property path or key name, and only then the text itself.
   Only `#RRGGBB` is clear enough to recognise on its own.
3. **The API description needs work first.** It calls most of these parameters `string`. One
   parameter is typed `colour`. Scales and divisions have their own tables, and the parameters do
   not point at them. Units are uneven too. `ce.draw.arc`'s angles are degrees in the summary and
   carry no `unit`, and two neighbouring commands read `opacity` on different scales:
   `ce.image.set` from 0 to 100 and `ce.image.icon` from 0 to 1. So for most kinds the first change
   is giving parameters real types and units in `panelApi.js`. That also improves the scripting
   manual, completion and checking, which all read the same description.
4. **One set of editing rules covers every kind.** The script stays the truth, and only its text
   changes. A drag writes once, when you let go, because with Live on every change resets the
   script's running state and could fire handlers that send MIDI. Cancel puts the original text
   back exactly. The Animation tab's curve editor already works this way.

## What there is to build on

- **Write routes into any value.** `stores/colorTarget.js` and `stores/gradientTarget.js` accept
  `{ type: 'callback', apply }`, and about fifteen section editors use it already (Meter zones, drum
  pads, Pixel Display elements and others). `DisplayPanel` gives a callback target a label
  (`target.label`), Done, and a Cancel that restores the value from before the edit.
- **Editors that take plain props.** `ColorChooser` (`color`, `alpha`, `onchange`).
  `animation/BezierEditor.svelte` (`points`, `onchange`; its header says *"the drag draws live and
  writes once, on release, so one drag is one undo step and not sixty"*, which is the rule this
  record needs). `animation/EasingCurve.svelte` draws a named or custom curve at any size.
  `typography/TypeFamilies.svelte` (`family`, `onpick`). `controls/MiniKeys.svelte` (`marks`,
  `onkey`). The scrub core in `scrub/` (`dragScrub.ts`, `dragScrubAction.ts`).
- **A schema of the script API.** `scripting/panelApi.js` gives every parameter a name and a type,
  and some a `values` list, a `unit` and a default. On this date: 219 parameters typed `number`,
  157 `string`, 56 `text`, 31 `value`, 20 `list`, 13 `path`, 4 `bytes`, 3 `targetRef`,
  2 `eventName`, 1 `scriptRef`, 1 `colour`. There are 16 `values` lists. Units are `'pixels'` ×38,
  `'milliseconds'` ×5, `'degrees'` ×4, `'0 to 1'` ×2 and `'0 to 100'` ×1.
- **A way to find which argument a value is.** `getSignatureHelp` (`scripting/languageService.js:381`)
  takes a position in the source and finds the API call it sits in and which argument it is. It
  scans the text, so it works the same in every language. That is the context this needs, run once
  per value instead of once per caret.
- **Vocabularies that are already tables.** `SCALE_NAMES` and `CHORD_NAMES` (`musicTheory.js`),
  `DIVISION_NAMES` and `DIVISION_LABELS` (`timeTables.js`), `ANIM_CURVE_NAMES` (`easingTables.js`),
  the checksum algorithms and `computeChecksum` (`utils/checksums.js`), and the panel's own colours
  (`utils/documentColours.js`).
- **Parsers for values that are structures.** A list of stops, four bezier numbers or a byte list is
  not one token. `languageService.analyze` already parses JavaScript and TypeScript (acorn) and Lua
  (luaparse).

## Three constraints every kind inherits

### 1. Nothing can go inside the text

`editor/CodeEditor.svelte` is a transparent `<textarea>` over a highlighted `<pre>` (lines 938–939),
and the two are lined up character for character. Anything that takes width inside a line shifts
every character after it out of line with the caret. A VS Code-style inline chip is therefore out.
What can be drawn:

- **A tint.** A background and text colour on the value's own span in the highlight layer
  (`codeHighlight.js`), with the width unchanged. Only colours want this.
- **An underline or box**, placed by line and column over the text, the way the diagnostic squiggles
  and the occurrence marks already are (`CodeEditor.svelte:929–966`).
- **A glyph in the gutter** beside the line number, as JetBrains IDEs do for colours. This is the
  click target, because a click on the text has to keep placing the caret. Ctrl/Cmd-click on a
  marked value can open it as well. When a line holds several values, the glyph opens a short list
  of them.
- **Hover text**, through the path `getHover` already uses.

### 2. The display panel is not on screen while you script

`utils/workspaceChrome.js:18` counts `'script'` among the workspaces that own their own layout, so
the App-level dock is hidden in the script editor. The Custom Component Designer already solves the
same problem by putting a `DisplayPanel` of its own in its layout
(`sections/CustomDesignSurfaceEditor.svelte:4194`). The script editor could do the same in its
right-hand column, beside Insert / Library / History. It is the same component, so the rule recorded
in `stores/colorTarget.js:20–37` still holds: colour and gradient editing happen in the display
panel, and there is one place to edit colour everywhere. That rule is the owner's. A pop-up editor
beside the text would mean reopening it on purpose. For lists of names, the editor's own completion
list does the job instead (see the edit surfaces below), so no second surface is needed there.

### 3. A value means what its reader reads

The same characters can mean different things to different readers, and the mark has to show what
will actually happen, not what the text seems to say. The same characters can also belong to
different kinds of value. `"F0411000"` is a colour to a property, a SysEx message to `sendSysex`
(*"a list of bytes or as hex text such as "F0 41 10 42 F7""*), and nothing at all inside a log
message. So **a kind never claims a value from its form alone.** The one exception is a `#RRGGBB`
string.

## The model: a value kind

Each kind is one entry in a registry:

| Part | What it answers |
|---|---|
| claim | Does this value, here, belong to this kind? |
| read | The value the runtime will see, read by the runtime's own reader |
| mark | Tint, underline or gutter glyph |
| explain | The hover text |
| check | A diagnostic, or nothing |
| edit | Which surface edits it, or none |
| write | The new text, in the original's form and the script's language |

Everything except *edit* is a pure function from source text to answers, so it can be tested with
`node --test` without a browser, the way `utils/midiMonitor.js` is.

### Three edit surfaces, or none

- **A dock tab**, when choosing the value needs a picture: colour, gradient, easing curve, font,
  image. It goes through a callback target, with the dock's Done and Cancel.
- **The completion list**, for a value chosen from a fixed list. This is the editor's own list, the
  one Ctrl+Space opens, reopened over a value that is already there and showing the alternatives.
  It adds no new surface and leaves the colour rule alone.
- **A gesture in place.** Alt-drag on a number whose unit and range are known, using the scrub core
  that already exists.
- **None.** Some kinds are worth marking and checking but not editing: a SysEx message, a note
  number.

### Where context comes from, in the order it is tried

1. **The schema.** The resolver gives the call and the argument, and the schema gives that
   parameter's type, `values` and `unit`. `sendSysex("F0 …")` is SysEx because its parameter is
   typed `bytes`.
2. **A property path or table key.** For example `set("Cutoff.Background.Fill.colour", "FF5B9BD5")`,
   `patch(…, { ["Background.Fill.colour"] = … })`, or a table field named `colour`. The last segment
   names the property. `colou?r|tint` is the pattern `documentColours.js` already uses to decide
   what counts as a colour, so the editor and the Colors tab's "Panel" row would agree. The panel
   file view (`PanelFileView.svelte`, the same `CodeEditor` in JSON mode) has only this kind of
   context, and it is enough there.
3. **The form alone.** Only a `#RRGGBB` string is unambiguous enough to claim with no context.

The first kind to claim a value keeps it. A value belongs to at most one kind.

### Step zero for most kinds: give the parameters real types

The schema is where the context comes from, and today it says `string` for most of what this needs.
`colour` is the type of exactly one parameter (an image's tint), while the `ce.math` colour commands
type theirs `string`. Scale, chord, division, key and grid are all `string`, and their vocabularies
sit in `musicTheory.js` and `timeTables.js` with nothing linking them to the parameter. Some fixed
lists exist only as prose: `oneOf(HAND_WRITTEN_VALUES[…])` writes them into a summary, with no
`values` list to read. So for nearly every kind, the first change is in `panelApi.js`: a type that
says what the parameter is, or a `values` reference. That pays off elsewhere too, because the
scripting manual, completion and validation all read the same schema. The
[generated inspector fields](generated-inspector-fields.md) record already names *"one range source
shared with the scripting API"* as a next step, and the units and ranges here are the same wish
seen from the script side.

## Worked through: colour and gradient

### Two readers

| Where the value goes | Who reads it | `"#5B9BD580"` | `"FF5B9BD5"` |
|---|---|---|---|
| `ce.draw.fill` / `stroke` | The browser, as CSS. The string goes into SVG as it is (`ScriptDrawOverlay.svelte:58`) | translucent blue | not a CSS colour, so it does not paint as blue |
| Panel properties (`set`, `patch`) and the `ce.math` colour commands | The app's parser, which takes the last six characters (`panelRuntime.js:823`) | `9BD580`, a green | opaque blue |

The swatch shows what the reader will paint. Writing `#RRGGBBAA` into a property gives a green
swatch, which is the trap the `colourAlpha` documentation warns about, caught as it is typed.

### Claiming

- `#RRGGBB` anywhere.
- Six- or eight-digit hex without a `#` only with context: a property path or key matching
  `colou?r|tint`, or a parameter typed `colour`. Re-typing the colour parameters in `panelApi.js`
  is part of the change.

### Writing back

- **Keep the form.** `#RRGGBB` stays `#RRGGBB`, `AARRGGBB` stays `AARRGGBB`, and quotes and case
  stay as they were.
- **Alpha only where the form carries it.** For a `#RRGGBB` drawing colour, alpha is dropped, as
  `StopColourPopover.svelte:41` drops it for gradient stops. `ce.draw.opacity()` is the documented
  way to make a drawing see-through.
- **Free with it:** the Colors tab's "Panel" row and recent colours, so a script's colours can match
  the panel's without copying hex codes by hand.

### Gradients

`ce.draw.gradient(stops, angle)` maps onto the Gradient tab. Its angle runs the same way as the
Background section's on purpose (`drawGradientImpl`, `panelRuntime.js:3989`), and `at` from 0 to 1
maps to `position` from 0 to 100. The gaps:

- **It draws linear gradients only**, so the radial, edge and centre controls are hidden for a
  script target.
- **The default angles differ.** It is 180 in the runtime (`panelRuntime.js:4011`) and 90 in the
  editor (`gradientTarget.js:31`). A call with no angle has to open at 180, or the first edit
  rotates the gradient.
- **Per-stop `opacity`** exists in `ce.draw` and not in the editor's stops, so it is kept on
  write-back rather than dropped.
- **Only when every argument is literal text.** `gradient({ base, darken(base) })` gets swatches on
  any literal parts it has, but no gradient editor.
- **The write-back is rebuilt in the script's own syntax:** `{ }` in Lua, `[ ]` in JavaScript,
  keeping the bare-colour form when the stops are evenly spaced. It needs a parse, so JavaScript,
  TypeScript and Lua come first.

## The other kinds

One table, then notes on the kinds where there is something more to say.

| Kind | In a script | Context | Mark | Edit surface | What the check catches |
|---|---|---|---|---|---|
| Colour | `"#5B9BD5"`, `"FF5B9BD5"` | schema, path or key, `#` form | tint, gutter swatch | Colors tab | see above |
| Gradient | `ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180)` | the call | gutter strip | Gradient tab, linear only | fewer than two usable colours |
| Easing curve | `curve = "outBack"`, or four numbers | `ce.anim.to`'s `opts.curve`, `ANIM_CURVE_NAMES` | gutter curve (`EasingCurve`) | Animation tab's `BezierEditor`; names through completion | an unknown name, which the runtime reports before running a straight line |
| Note division | `"1/8T"` | `division` parameters, `DIVISIONS` | underline | completion | an unknown division, which `stepAt` answers with nothing and no error |
| Scale, chord | `"harmonicMinor"`, `"maj7"` | `scale` and `chord` parameters | underline; hover lists the notes | completion | an unknown name |
| Note | `"C3"`, `60` | `note` and `root` (a number or a name) | hover shows the name for a number and the number for a name | completion | out of range |
| Fixed list | `"multiply"`, `"round"`, `"cover"` | the 16 `values` lists | none, it is readable already | completion | a value not in the list |
| Font family | `"Inter Tight"` | `textStyle`, `drawMeasure`, `textFont` | gutter "Aa" in that face | Text tab's `TypeFamilies` | a family that is not available, which `textStyle` refuses |
| Image | `ce.image.asset("knob-cap")` | `imageAsset`, `imageSet`, `drawImage` | gutter thumbnail | Assets tab | a name not in the library; an asset's name passed as `src`, which draws nothing |
| Control | `ce.anim.play("Cutoff", …)`, `on("Cutoff", …)` | `targetRef` and `control` parameters | underline | completion from the panel's tree; Ctrl/Cmd-click selects it on the canvas | no control of that name |
| Property path | `"Cutoff.Background.Fill.colour"` | the 13 `path` parameters | underline; hover shows the current value | completion one segment at a time | a path that leads nowhere |
| Animation | `ce.anim.play("Cutoff", "Pulse")` | that control's keyframe animations | underline | completion from that control | not one of its keyframe animations (the runtime returns false and logs the list) |
| Event | `on(target, "valueChanged", fn)` | `eventName` parameters | none | completion | an unknown event |
| Number with a unit | angle `180`, `ms` `250`, opacity `0.5` | the parameter's `unit` and range | hover | Alt-drag in place | out of range |
| Dash | `dash = { 3, 3 }` | `ce.draw.stroke`'s `opts.dash` | gutter dashed line | none | negative lengths, which are clamped to 0 |
| SysEx | `sendSysex("F0 41 10 42 F7")` | `bytes` parameters | hover: byte count, checksum | none | a wrong checksum (`computeChecksum`), a missing `F0` or `F7` |
| Device parameter | `ce.device.bind("Cutoff", "cutoff")` | `parameterId` | hover: range and CC | completion from the device profile | a parameter the profile does not have |
| Envelope | `ce.anim.envelope(path, { {x=0,y=0}, … })` | `points` from 0 to 1 | gutter shape | a polyline editor like `EnvelopeDesigner`'s | points outside 0 to 1 |

### Notes

- **Lists of names first, because they catch silent mistakes.** `timeTables.js` explains why the
  division table is data: *"a mistyped DIVISION is silent. It does not fail to load; a sequencer
  just runs at the wrong rate."* The same is true of a mistyped division in a script. Scale, chord,
  event and animation names behave the same way. These kinds are the cheapest (the schema plus the
  completion list) and the ones most likely to catch a real mistake.
- **Easing is half built already.** The Animation tab's components take plain props, and the
  `opts.curve` documentation already promises that *"an animation's `bezier` can be passed straight
  in"*. The script and the tab already speak the same four numbers.
- **Numbers are the most tempting and the most dangerous.** Dragging a number with Live on and
  watching the panel follow is the most immediate thing on this list. It is also the one that would
  run the script most often, which is why the write-on-settle rule below matters most here. A number
  with no unit and no range gets nothing: dragging it would be a guess.
- **Control names and property paths are about keeping scripts correct.** The check is the point,
  and the completion list is the edit. Ctrl/Cmd-click going to the control on the canvas or in the
  properties panel is the natural extra.
- **SysEx is to read and check, not to edit.** A byte string with its checksum checked, and the
  algorithm named by the `checksum` call beside it, is worth more than any editor for it.

## Examples

Each example is a few lines of script as someone would write them today, followed by what the
editor would mark, explain, check and write. The examples are in Lua unless the JavaScript differs
in a way that matters. The hover and check wording is proposed. The behaviour it describes is the
runtime's, traced on this date.

### 1. One hex string, two readers

```lua
function onDraw(info)
  ce.draw.clear()
  ce.draw.fill("#5B9BD580")
  ce.draw.rect(0, 0, info.width, info.height)
end

ce.core.set("Cutoff.Background.Fill.colour", "#5B9BD580")
```

- **Line 3** is tinted blue at half strength over a checker. `ce.draw` hands the string to CSS,
  which reads the last pair, `80`, as alpha.
- **Line 7** is tinted green, `#9BD580`, because a property reads the last six digits. Hover:
  *"A panel colour reads the last six digits: 9BD580. A see-through property colour is AARRGGBB,
  "805B9BD5", which ce.math.alpha("#5B9BD5", 0.5) builds."* The same text is a warning in the
  diagnostics.
- **Editing.** The gutter swatch opens the Colors tab. Line 3 is written back as `#RRGGBBAA`,
  because CSS reads that alpha. Line 7 is written back as `AARRGGBB`. This is the one case where an
  edit changes the form, because the original form could not say what it meant.

### 2. The same characters, three meanings

```lua
ce.midi.sendSysex("F0411000")
ce.core.set("Pad1.Background.Fill.colour", "F0411000")
ce.core.log("F0411000")
```

- **Line 1 is SysEx**, because `sendSysex`'s parameter is typed `bytes`, and the schema is asked
  first. When this was written it went out as `F0 FF F7`. The runtimes now refuse it when the
  script runs: *"sendSysex: "F0411000" is not one byte, so nothing was sent. Put a space between the
  bytes: "F0 41 10 00"."* The check says the same thing as it is typed.
- **Line 2 is a colour**, from the path's last segment. The tint is a very dark red at 94% opacity
  (alpha `F0`, colour `411000`).
- **Line 3 is nothing.** `log` takes free text, and no kind claims it.

### 3. The panel file view

```json
"Fill": {
  "colour": "FF5B9BD5",
  "gradient": {
    "type": "linear", "angle": 90,
    "stops": [ { "color": "FFFFFF", "position": 0 }, { "color": "000000", "position": 100 } ]
  }
}
```

There is no API call here, only keys. `colour` and the stops' `color` match `colou?r|tint`, the
pattern `documentColours.js` uses, so all three values are tinted and each opens the Colors tab.
The `gradient` key gives the whole object a gutter strip, which opens the Gradient tab with every
control it has, because this is a stored gradient and not a `ce.draw` one.

### 4. A gradient with no angle

```lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))
```

- **Mark.** A gutter strip running top to bottom, because the runtime's default angle is 180.
- **Editing.** The Gradient tab opens at 180, not at its own default of 90, and with the radial
  controls hidden. Turning it to 135 and adding a stop at 30% writes:

  ```lua
  ce.draw.fill(ce.draw.gradient({
    { at = 0, colour = "#2A6BD4" }, { at = 0.3, colour = "#5B9BD5" }, { at = 1, colour = "#0A1830" },
  }, 135))
  ```

  ```javascript
  ce.draw.fill(ce.draw.gradient([
    { at: 0, colour: "#2A6BD4" }, { at: 0.3, colour: "#5B9BD5" }, { at: 1, colour: "#0A1830" },
  ], 135));
  ```

- **Form.** Once the stops are evenly spaced again, they are written back as bare colours. A stop
  that had `opacity = 0.5` keeps it, because the tab has no such field to change it with.

### 5. A computed value gets no editor

```lua
local base = "#2A6BD4"
ce.draw.fill(ce.draw.gradient({ base, ce.math.darken(base) }, 180))
```

- **Line 1** gets a swatch. That is where `base` is edited, and both stops follow when the script
  runs.
- **Line 2** gets no strip, because its second colour only exists at run time. An editor here would
  have to choose between overwriting the expression and editing nothing.

### 6. An easing curve, and a duration in milliseconds

```lua
ce.anim.to("cutoff", 127, { duration = 500, curve = "outBack" })
```

- **`"outBack"`** gets a gutter curve (`EasingCurve`), overshoot included. Ctrl/Cmd-click opens
  the Animation tab's `BezierEditor` at outBack's numbers, `0.175, 0.885, 0.32, 1.275`
  (`utils/easing.js:38`). Dragging a handle writes four numbers, `curve = { 0.2, 0.9, 0.3, 1.4 }` in
  Lua and `curve: [0.2, 0.9, 0.3, 1.4]` in JavaScript, and writes a name back if the numbers land on
  a named curve. Through the completion list, the value can also be swapped for any other name in
  `ANIM_CURVE_NAMES`.
- **Typing `"outBak"`** gets a warning: *"Not a curve name. The move would run in a straight
  line."* The runtime reports the same thing, but only when the move starts.
- **`500`** is a number in milliseconds (`duration` carries `unit: 'milliseconds'`). Hover: *"500 ms,
  1 beat at the current 120 BPM"*, using `ce.time.msToBeats`. Alt-drag changes it in steps of 10 ms.

### 7. Note names: what was the silent C-1

```lua
ce.midi.sendNote(1, "c4", 100, 250)
local triad = ce.music.chord("C4", "major")
```

- **`"c4"`** played note 0, C-1, when this was written. The runtimes now refuse it when the script
  runs: *"sendNote: "c4" is not a note name, so nothing was sent. A name is a capital letter, then
  # or b if it has one, then the octave: "C4", "Eb3", "F#-1"."* The check says the same thing as it
  is typed, and completion offers `"C4"`.
- **`"C4"`** on line 2 has hover text: *"MIDI note 60, middle C"*. A number in the same place, `48`,
  reads *"C3"*.
- **No editor** for a single note. A `MiniKeys` keyboard to pick one from is possible, but typing a
  name is as fast and is the thing being checked.

### 8. Divisions and scales

```lua
local step = ce.time.step(beats, "1/8t")
local notes = ce.music.scale("C3", "harmonicMinr")
```

- **`"1/8t"`** gets a warning: *"Not a division (they are case-sensitive). ce.time.step returns
  nothing."* Completion lists the fourteen, each with its label from `DIVISION_LABELS`: *1/8T, 8th
  T*.
- **`"harmonicMinr"`** gets the same kind of check against `SCALE_NAMES`, and the same consequence:
  `ce.music.scale` returns nothing for a scale it does not know.
- **Hover on `"harmonicMinor"`**, once it is spelled right, lists the notes from C3: *C D E♭ F G A♭
  B*.

### 9. A fixed list

```lua
ce.draw.blend("multipy")
```

Today this is refused when the script runs, with a console message listing the twelve modes, and
returns false. The check says the same thing as it is typed, and completion over the value offers
the twelve. The list is held twice, in the schema (`panelApi.js:1573`) and in the runtime
(`panelRuntime.js:6909`). The check reads the schema, so the two copies need a test that keeps them
equal.

### 10. A font family

```lua
ce.text.style("Title", { family = "Inter Tigt", size = 18 })
```

- **Mark.** A gutter "Aa", drawn in the family's own face, or in the fallback face with a warning
  when no such font is available: *"Not an available font. ce.text.style will refuse it."*
- **Editing.** The "Aa" opens the Text tab's family list. Picking a family writes
  `family = "Inter Tight"`.
- **`size = 18`** is in pixels (the option carries `unit: 'pixels'`) and can be Alt-dragged in
  whole pixels.

### 11. An image: a name or the data

```lua
ce.draw.image("knob-cap", 0, 0, 32, 32)
local cap = ce.image.asset("knob-cap")
```

- **Line 1** drew nothing and said nothing when this was written. The runtime now refuses it when
  the script runs, and when the name is an icon's it gives the call to use: *"ce.draw.image:
  "knob-cap" is an icon's name, not its image, so nothing was drawn. Pass
  ce.image.asset("knob-cap").dataUrl."* The check says the same thing as it is typed.
- **Line 2** gets a gutter thumbnail when the library or the panel has an image of that name, and a
  warning when neither has. Clicking the thumbnail opens the Assets tab, and choosing another image
  writes its name.

### 12. Two scales for one word

```lua
ce.image.set("Logo", logoData, { opacity = 0.5 })
ce.image.icon("Badge", "star", { opacity = 0.5 })
```

- **Line 1** is on the 0 to 100 scale. Hover: *"0.5 of 100: almost invisible. Did you mean 50?"*,
  as a warning.
- **Line 2** is on the 0 to 1 scale, so 0.5 is half.
- **Alt-drag** reads each option's own `unit`, so the first moves in whole numbers up to 100 and the
  second in hundredths up to 1. None of this works unless the unit is in the schema. Here it is.

### 13. Angles the schema does not know are angles

```lua
ce.draw.arc(cx, cy, 40, -135, 135)
```

`from` and `to` are degrees, with 0 at twelve o'clock and increasing clockwise, but only the
summary says so: the parameters carry no `unit`. Until they do, these are plain numbers and get no
drag. Step zero for this kind is one line in `panelApi.js` per parameter. After that, Alt-drag
moves them in whole degrees, and hover says where 0 is.

### 14. Controls, paths and animation names

```lua
ce.panel.keep("Cuttoff.Background.Fill.colour")
ce.anim.play("Cutoff", "Pluse")
```

- **`"Cuttoff…"`** gets a warning: *"No control named Cuttoff. Did you mean Cutoff?"* Completion
  over a path works one segment at a time: control, then section, then property. Today the
  console reports *control "Cuttoff" not found* when the script runs, and `ce.panel.keep` returns
  false. The check gives the same message while typing.
- **`"Cutoff"`** on line 2 is underlined, and Ctrl/Cmd-click selects that control on the canvas.
- **`"Pluse"`** is checked against the keyframe animations `Cutoff` actually has, and completion
  offers those names. Today, `ce.anim.play` returns false when the script runs.

### 15. A SysEx template and where its checksum starts

```lua
ce.device.defineParameter("level", {
  name = "Level", min = 0, max = 127,
  sysex = { "F0", "41", "10", "42", "12", "$checksumStart", "40", "01", "33", "$value", "$checksum", "F7" },
  checksum = "roland-7bit",
})
```

- **Hover on the template** shows the message the synth would receive, built by the same encoder
  the runtime uses (`encodeParameter`, `deviceDefinitions.js`): *"At 0, 64 and 127: … F0 41 10 42
  12 40 01 33 40 4C F7 …"*. The checksum of address and data for 64 is `4C`.
- **Remove `"$checksumStart"`** and the sum starts right after `F0`, header included, which gives
  `27`. Both runtimes now warn when the parameter is defined: *"defineParameter("level"): this is a
  Roland template (41 after F0) with $checksum and no $checksumStart, so the checksum includes the
  header, and a Roland synth ignores the message. Put $checksumStart where the address begins."*
  The check says the same thing as it is typed. Here a check really does matter more than an editor
  would.
- **A bare literal**, such as `sendSysex("F0 41 10 42 12 40 00 7F 00 41 F7")` (the GS reset),
  does not say where its checksum starts. So the editor shows the bytes as sent and leaves the
  checksum alone. The template form is the one that says.

## Fixed since, and still open

Four of the silent failures above were fixed in the script runtimes on 2026-10-18. The rule each
one follows is the one the runtimes already used for an unknown blend mode: refuse, say what was
refused, and send or draw nothing. Each was fixed in every runtime that has the call, in the same
words, so the editor and the exported player agree:

| Was | Now | Where |
|---|---|---|
| `sendNote(1, "c4", 100)` played C-1 (also `sendNoteOff`, and `sendAftertouch` with a note) | refused with an error naming the note | WebView runtime; Lua, JavaScript and Python preludes |
| `sendSysex("F0411000")` sent `F0 FF F7` (`F0 00 F7` from the player) | refused, with the spaced form to copy | WebView runtime (every call that reads hex text); `BridgeScriptHost::sendSysex` |
| a Roland template without `$checksumStart` was silently wrong | defined, with a warning | `deviceDefinitions.js`; `ScriptRuntime::defineDeviceParameter` |
| `ce.draw.image("knob-cap", …)` drew nothing | refused, with the call to use when it is an icon's name | WebView runtime (the verb is panel-view only) |

Still open, found on the way and left alone because each is a decision rather than a fix:

- **A division in the wrong case returns nothing**, with no message (`ce.time.step(beats, "1/8t")`).
  Reading it case-insensitively, or reporting it, means changing the generated division table in
  every prelude.
- **The music helpers still read an unreadable root as note 0.** `ce.music.scale("c4")` gives the
  scale from C-1, by the same fallback `sendNote` had. They are pure functions, and their comment
  chooses 0 over an unexplained nil list.
- **Hex text is read only by the editor in `sendMidi`, `feedMidi` and `checksum`.** The player's
  `sendMidi` takes a list of numbers and does nothing with text, and its preludes' `checksum` does
  not read text either. Only `sendSysex` is documented to take text.
- **Two scales for `opacity`** (`ce.image.set` from 0 to 100, `ce.image.icon` from 0 to 1), and
  **`ce.draw.arc`'s angles carry no unit**. Both are the schema work this record calls step zero.

## Rules every edit session follows

1. **Keep the form.** The written text has the original's notation, quotes and case, and the
   script's own syntax.
2. **Write when the gesture settles, not on every tick.** With Live on, every change to the source
   replaces the script set and resets script state (`setLiveScripts` → `resetScriptState`,
   `panelRuntime.js:8920`). A drag across a colour square writing on every tick would do that about
   sixty times a second, and could fire handlers that send MIDI to the synth. `BezierEditor` already
   draws live and writes once on release, and the same rule applies to every kind.
3. **One undo step per settled edit**, through `applyEdit` (`CodeEditor.svelte:562`), which keeps
   the native undo stack.
4. **Cancel restores the original characters exactly**, in one edit.
5. **A session ends when the text moves under it.** It holds a character range, so an edit outside
   that range, switching scripts, folding, or closing the editor ends it. This mirrors the way
   `colorTarget.js` clears a target when the selection or panel changes.
6. **Only literal text is edited.** A computed value gets a mark at most, never an editor.
7. **Structured kinds wait for a parser.** Kinds that are one string or one number work in all seven
   languages through the highlighter's tokens. Kinds that are a list or a table (gradients, bezier
   numbers, dash lists, envelope points, byte lists) need a parse, so JavaScript, TypeScript and Lua
   come first. One inherited caveat: `codeHighlight.languageKey` has no Python entry and tokenises
   Python as Lua, so a `#` comment in Python is not recognised as a comment. A colour string inside
   one would be marked.

## What not to build

- **Booleans.** Typing `true` is faster than any widget.
- **Free text**, such as labels, messages and log lines. There is nothing to choose from.
- **Numbers without a unit or a range.**
- **Anything inside the text** (constraint 1).
- **A pop-up editor per kind beside the text.** The colour rule stands, and the completion list
  covers the lists of names.

## Order of work

0. **The registry, the context resolver and the gutter column, display only, with colour as the
   first kind.** Pure functions with tests. Nothing is edited yet.
1. **Colour editing through a `DisplayPanel` embedded in the script editor**, with the session
   rules above.
2. **Lists of names.** Type the parameters in `panelApi.js`, reopen completion over an existing
   value, add the checks. Divisions, scales, chords, the 16 `values` lists, events, animation names.
3. **Easing curves**, through the Animation tab's components.
4. **Gradients**, for JavaScript, TypeScript and Lua.
5. **Numbers with units**, by Alt-drag.
6. **The rest:** font, image, control names and property paths, SysEx, notes, device parameters.
   Each is a small change once the registry exists.

The panel file view gets each kind for free wherever a property name gives the context.

## Open questions for the owner

- **A `DisplayPanel` embedded in the script editor, or the shared dock allowed in the script
  workspace?** The first follows the Component Designer's precedent. The second changes what
  `workspaceOwnsChrome` means.
- **On by default, or a toggle?** The minimap is a per-viewer toggle in the same editor
  (`ce-minimap` in local storage), and a "Value marks" toggle could sit beside it.
- **Alt-drag on numbers with Live on.** It re-runs the script once per release. Is that welcome,
  or should scrubbing pause Live while the drag is held?
- **The panel file view in the same change, or after?**
