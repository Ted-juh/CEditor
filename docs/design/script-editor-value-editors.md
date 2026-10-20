# Editing values in place in the script editor

Status: **the Values sidebar is built**, 2026-10-19: steps 0 to 7 of the order of work, in the
script editor and the panel file view ([Built](#built)). The record was a
proposal on 2026-10-18. The silent failures it found, and four more found on the way, were then
fixed in the script runtimes; [Fixed since, and decided](#fixed-since-and-decided) lists them.
The edit surface was decided on 2026-10-19: a Values sidebar
([Decided](#decided-a-values-sidebar-is-where-values-are-shown-and-edited)).

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

- **shows** it in a sidebar, as a row with what it means, and highlights it in the text
- **explains** it, in its row and on hover
- **checks** it, through the editor's existing diagnostics
- **edits** it, where the app already has an editor for that kind of value. The editor opens on the
  value and writes the result back into the script as text.

The script stays the truth. The editor only ever changes characters in it, through the same edit
path as typing.

## Decided: a Values sidebar is where values are shown and edited

*Decided by the owner, 2026-10-19.* The edit surface is a sidebar, not marks to click in the text.
It lists the values in the statement the caret is in that the editor can read, and each row shows
its value and opens its editor. The text itself stays plain. The gutter glyph this record first
made the click target (constraint 1) is no longer needed for that, and nothing in the editor's own
column has to change to make room for it. Three decisions shape it:

1. **It is a tab of the script editor's own dock.** `BehaviorDesigner.svelte` already has a
   right-hand dock with Insert, Library and History tabs; Values is a fourth. Hiding the dock hides
   it, which makes it the least intrusive place for it: nothing appears unless it is open.
2. **A colour's or a gradient's swatch opens the display panel.** The rule recorded in
   `stores/colorTarget.js` stands: one place to edit colour, everywhere. The row shows the swatch,
   and a click opens the display panel's Colors or Gradient tab on that value through a callback
   target, with its label, Done and Cancel. It is the app's shared display panel, the one the panel
   editor docks, not a second copy: the owner chose it on 2026-10-19. The script workspace hid it,
   because `utils/workspaceChrome.js` counts `'script'` among the workspaces that own their layout
   (constraint 2), so that rule changed to let the display panel, and only it, show in the script
   workspace. It shows there by a switch of its own, off until the viewer or a swatch turns it on
   ([Built](#built)). No colour chooser opens in the sidebar.
3. **It covers the whole statement, not the line.** A call often runs over several lines: a
   gradient's stops, or an options table with one key per line. So the sidebar shows every call in
   the statement the caret is in, and when a line holds several statements, all of them. A call
   inside another (`set(path, ce.math.lighten("red", 0.2))`) has rows of its own, indented under the
   call it sits in. For JavaScript, TypeScript and Lua the statement comes from the parse
   `languageService.analyze` already makes; for the other languages, from the caret's line widened
   until its brackets balance.

### A row

Each row is one argument or one key of an options table, in the call's order:

```
Statement at line 14 · ce.anim.to
  path       "Cutoff.value"     ● Cutoff (Knob), now 0.42
  target     0.8                0 to 1
  opts
    duration 250                [ 250 ] ms
    curve    "outBack"          [curve picture]  ▾
  ⚠ easing   …                  not an option of ce.anim.to
```

- **The name** comes from the schema: the parameter's name, or the option's key.
- **The value** is shown as it is written, and beside it what its reader will make of it: a swatch
  painted as the reader paints it, a note's number for its name, a curve's picture, a control's
  current value, a SysEx message's byte count and checksum.
- **The edit**, by kind:
  - a fixed list (divisions, scales, chords, blend modes, value forms, option keys): a dropdown in
    the row;
  - a colour or gradient: the swatch, which opens the display panel;
  - a curve, a font, an image: a preview in the row, which opens the editor the app already has (the
    Animation tab's curve editor, the Text tab's family list, the Assets tab);
  - a number with a unit and a range: a field with the unit beside it, written on Enter or when the
    field is left. Dragging numbers is not planned (see [What not to build](#what-not-to-build));
  - none: a fact to read (a note's number, a CC's name, a device parameter's range).
- **A value that is not written out** (a variable, a call, arithmetic) is listed as computed, with
  the expression and no editor. That is honest, and it says why nothing can be changed there.
- **A problem** is shown on its row, in the words the runtime would use: an unknown option, a
  division that is not one, a colour the panel cannot read. These are the editor's diagnostics,
  shown where the value is.

With the caret on a statement that has nothing the editor can read, the tab says so. It follows the
caret as it moves, except while an edit is open (below).

### Highlighting in the text what the sidebar is about

The text shows which characters the sidebar is talking about, without changing a single width. The
editor already draws two such layers: the occurrence marks (`ce-occ`) and the active line
(`ce-activeline`), boxes placed by line and column behind the transparent `<textarea>`
(`CodeEditor.svelte`, the `ce-area` block). The sidebar adds three more, the same way:

| When | What is marked | How |
|---|---|---|
| The Values tab is showing | the statement it lists | a faint band over the statement's lines, as the active line is drawn but over every line the statement covers |
| The pointer is over a row | that value's characters | a light box around them, as an occurrence mark is drawn |
| An edit is open from a row (the display panel is on that colour, a dropdown is open, a field is being typed in) | that value's characters | a stronger box with an outline in the accent colour, which stays while the edit is open, wherever the caret goes |

- **A value that runs over several lines** (a stop list, a table) gets one box per line it covers.
- **Clicking a row** scrolls its value into view and moves the caret to it. Clicking a marked value
  in the text selects its row.
- **The box follows the text.** A write-back can change the value's length (`"red"`, recoloured to
  a blue with no name, is written as `"#4A7FB0"`), so the range is moved with the edit that changed
  it, and the box with it.
- **A long script** is drawn a window at a time; the boxes are placed through the same offset the
  occurrence marks use (`windowStart`). **A folded view** draws none, and folding ends an open edit
  (rule 5).
- **Colour and contrast:** the box uses its own theme variable beside `--ce-occ` and `--ce-sel`, so
  the edited value, an occurrence and the selection can be told apart when all three are on screen.

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

**Values chosen from a fixed list, so their row has a dropdown**

- Note divisions, scales, chords, event names and a control's animation names.
- The 16 parameters whose allowed values the API already lists, such as blend modes, line caps and
  image fit, and the keys of an options table, which the contract lists for every call.
- Control names and property paths.

The completion list (Ctrl+Space) also reopens over a value that is already there and offers the
same alternatives, for someone who keeps their hands on the keyboard.

**Numbers with a known unit and range, so you type them in a field with the unit beside it**

- Angles, milliseconds and opacity, in the sidebar row, written on Enter. Dragging them in place,
  first proposed here, is not planned (see [What not to build](#what-not-to-build)).

**Values worth reading and checking but not editing**

- **SysEx**: the bytes that will actually be sent, and the checksum where it can be known.
- **Note numbers**: `60` reads as C4, and `"C4"` as 60.
- **Device parameters**: the range and the CC number.

**Not worth doing:** true/false values, free text such as labels and log messages, and numbers with
no unit or range.

## What looking into it showed

1. **The checks may matter more than the editors.** Several mistakes in a script failed with no
   error at all. Each of these was traced through the WebView runtime (`panelRuntime.js`) on this
   date. All five were then fixed in the runtimes (see
   [Fixed since, and decided](#fixed-since-and-decided)):
   - `ce.midi.sendNote(1, "c4", 100)` played note 0, C-1. The name parser wants a capital letter,
     and `sendNote` turned a name it could not read into 0.
   - `ce.midi.sendSysex("F0411000")` sent `F0 FF F7`. Hex text is split on spaces and commas, so
     the whole string was read as one number and clamped to 255. The player kept the low byte
     instead and sent `F0 00 F7`.
   - `ce.time.step(beats, "1/8t")` returned nothing, because divisions were case-sensitive: the
     table spells it `"1/8T"`.
   - `ce.draw.image("knob-cap", …)` drew nothing, because it wants the image data and not an
     asset's name.
   - A Roland SysEx template with `$checksum` and no `$checksumStart` sums the header as well, and
     *"a message the synth rejects silently"* is the result (`deviceDefinitions.js`). It now warns.

   Others report themselves, but only when the script runs: `ce.draw.blend` with an unknown mode,
   `ce.text.style` with a font that is not available, and now the ones fixed above. A check moves
   the same message to the moment it is typed. The checks for lists of names are also the cheapest
   to build, which makes them the best next step after colour.
2. **A value is recognised by where it is, not by what it looks like.** `"F0411000"` is a colour
   when it is set on a property and SysEx when it is passed to `sendSysex`. So the order is: what
   the API says that argument is, then a property path or key name, and only then the text itself.
   Only `#RRGGBB` is clear enough to recognise on its own.
3. **The API description needs work first.** It calls most of these parameters `string`. One
   parameter is typed `colour`. Scales and divisions have their own tables, and the parameters do
   not point at them. Units were uneven too. `ce.draw.arc`'s angles were degrees in the summary and
   carried no `unit` (they do now), and two neighbouring commands read `opacity` on different
   scales, `ce.image.set` from 0 to 100 and `ce.image.icon` from 0 to 1 (each now warns about the
   other's numbers). So for most kinds the first change is giving parameters real types and units
   in `panelApi.js`. That also improves the scripting manual, completion and checking, which all
   read the same description.
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
- **A glyph in the gutter** beside the line number, as JetBrains IDEs do for colours. This was the
  first plan for the click target, because a click on the text has to keep placing the caret. The
  Values sidebar ([Decided](#decided-a-values-sidebar-is-where-values-are-shown-and-edited)) is the
  click target now, so a glyph is optional.
- **Hover text**, through the path `getHover` already uses.

The sidebar's highlights are boxes of the second kind.

### 2. The display panel is not on screen while you script

`utils/workspaceChrome.js:18` counts `'script'` among the workspaces that own their own layout, so
the App-level dock is hidden in the script editor. Two ways round it were weighed. The Custom
Component Designer puts a `DisplayPanel` of its own in its layout
(`sections/CustomDesignSurfaceEditor.svelte:4194`), and the script editor could have done the same.
The owner chose the other on 2026-10-19: the shared display panel, which is there already, is
allowed in the script workspace, so `resolveWorkspaceChrome` lets the display panel, and not the
tree or the properties panel, show there. Either way it is the same component, so the rule recorded
in `stores/colorTarget.js:20–37` still holds: colour and gradient editing happen in the display
panel, and there is one place to edit colour everywhere. That rule is the owner's. A pop-up editor
beside the text would mean reopening it on purpose. For lists of names, a dropdown in the sidebar's
row and the editor's own completion list do the job instead, so no second surface is needed there.

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
| show | What its row in the Values sidebar shows (a swatch, a curve, a label) |
| explain | The hover text |
| check | A diagnostic, or nothing |
| edit | Which surface edits it, or none |
| write | The new text, in the original's form and the script's language |

Everything except *edit* is a pure function from source text to answers, so it can be tested with
`node --test` without a browser, the way `utils/midiMonitor.js` is.

### Where an edit starts, and what it opens

Every edit starts from a row of the Values sidebar. What the row opens depends on the kind:

- **A dock tab**, when choosing the value needs a picture: colour, gradient, easing curve, font,
  image. Colour and gradient open the display panel embedded in the script editor; the others open
  the editor the app already has for them. Each goes through a callback target, with the dock's
  Done and Cancel.
- **A dropdown in the row**, for a value chosen from a fixed list. The editor's own completion list
  (Ctrl+Space, reopened over a value that is already there and showing the alternatives) offers the
  same choices to someone who keeps their hands on the keyboard.
- **A field in the row**, for a number whose unit and range are known.
- **None.** Some kinds are worth showing and checking but not editing: a SysEx message, a note
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

Both readers have since changed: `ce.draw` now paints the panel's own forms, and a property writes
CSS's short forms out in full and refuses what it cannot read.
[Fixed since, and decided](#fixed-since-and-decided) has the detail. The
eight-digit trap itself remains, because each reader keeps its own meaning for `#` with eight digits.

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

| Kind | In a script | Context | Shown in its row | What the row opens | What the check catches |
|---|---|---|---|---|---|
| Colour | `"#5B9BD5"`, `"FF5B9BD5"` | schema, path or key, `#` form | swatch | the display panel's Colors tab | see above |
| Gradient | `ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180)` | the call | strip | the display panel's Gradient tab, linear only | fewer than two usable colours |
| Easing curve | `curve = "outBack"`, or four numbers | `ce.anim.to`'s `opts.curve`, `ANIM_CURVE_NAMES` | curve picture (`EasingCurve`) | Animation tab's `BezierEditor`; names through a dropdown | an unknown name, which the runtime reports before running a straight line |
| Note division | `"1/8T"` | `division` parameters, `DIVISIONS` | the label (*8th T*) | a dropdown | an unknown division, which `stepAt` answers with nothing and no error |
| Scale, chord | `"harmonicMinor"`, `"maj7"` | `scale` and `chord` parameters | the notes | a dropdown | an unknown name |
| Note | `"C3"`, `60` | `note` and `root` (a number or a name) | the name for a number and the number for a name | none | out of range |
| Fixed list | `"multiply"`, `"round"`, `"cover"` | the 16 `values` lists | the value | a dropdown | a value not in the list |
| Font family | `"Inter Tight"` | `textStyle`, `drawMeasure`, `textFont` | "Aa" in that face | Text tab's `TypeFamilies` | a family that is not available, which `textStyle` refuses |
| Image | `ce.image.asset("knob-cap")` | `imageAsset`, `imageSet`, `drawImage` | thumbnail | Assets tab | a name not in the library; an asset's name passed as `src`, which draws nothing |
| Control | `ce.anim.play("Cutoff", …)`, `on("Cutoff", …)` | `targetRef` and `control` parameters | its type and current value | a dropdown of the panel's controls; a click selects it on the canvas | no control of that name |
| Property path | `"Cutoff.Background.Fill.colour"` | the 13 `path` parameters | the current value | completion one segment at a time | a path that leads nowhere |
| Animation | `ce.anim.play("Cutoff", "Pulse")` | that control's keyframe animations | the value | a dropdown of that control's | not one of its keyframe animations (the runtime returns false and logs the list) |
| Event | `on(target, "valueChanged", fn)` | `eventName` parameters | the value | a dropdown | an unknown event |
| Number with a unit | angle `180`, `ms` `250`, opacity `0.5` | the parameter's `unit` and range | the unit and range | a field, written on Enter | out of range |
| Dash | `dash = { 3, 3 }` | `ce.draw.stroke`'s `opts.dash` | a dashed line | none | negative lengths, which are clamped to 0 |
| SysEx | `sendSysex("F0 41 10 42 F7")` | `bytes` parameters | byte count, checksum | none | a wrong checksum (`computeChecksum`), a missing `F0` or `F7` |
| Device parameter | `ce.device.bind("Cutoff", "cutoff")` | `bind`'s `parameterId`, the `id` of `write`, `read` and `parameter` | name, group and range (a profile's parameter has no CC of its own: that is its recipe's) | a dropdown from the device profile | a parameter the profile does not have |
| Envelope | `ce.anim.envelope(path, { {x=0,y=0}, … })` | `points`, typed `envelope` | the shape, as the runtime samples it | a point editor under the row: drag a point, add one, take one out | fewer than two points, a point that is not one, an x outside 0 to 1 (a y past 0 to 1 is a level past `from` or `to`) |

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
  run the script most often, which is why dragging is not planned: a number with a unit and range
  gets a field in its row, written on Enter, so it runs the script once per change. A number with
  no unit and no range gets nothing to edit it with: any step would be a guess.
- **Control names and property paths are about keeping scripts correct.** The check is the point,
  and the row's dropdown or the completion list is the edit. A click going to the control on the
  canvas or in the properties panel is the natural extra.
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
- **Editing.** The row's swatch opens the Colors tab. Line 3 is written back as `#RRGGBBAA`,
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
The `gradient` key gives the whole object a strip in its row, which opens the Gradient tab with every
control it has, because this is a stored gradient and not a `ce.draw` one.

### 4. A gradient with no angle

```lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))
```

- **Shown.** A strip in the row running top to bottom, because the runtime's default angle is 180.
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

- **`"outBack"`** gets a curve picture in its row (`EasingCurve`), overshoot included. A click opens
  the Animation tab's `BezierEditor` at outBack's numbers, `0.175, 0.885, 0.32, 1.275`
  (`utils/easing.js:38`). Dragging a handle writes four numbers, `curve = { 0.2, 0.9, 0.3, 1.4 }` in
  Lua and `curve: [0.2, 0.9, 0.3, 1.4]` in JavaScript, and writes a name back if the numbers land on
  a named curve. Through the completion list, the value can also be swapped for any other name in
  `ANIM_CURVE_NAMES`, from the row's dropdown or the completion list.
- **Typing `"outBak"`** gets a warning: *"Not a curve name. The move would run in a straight
  line."* The runtime reports the same thing, but only when the move starts.
- **`500`** is a number in milliseconds (`duration` carries `unit: 'milliseconds'`). Hover: *"500 ms,
  1 beat at the current 120 BPM"*, using `ce.time.msToBeats`. Its row has a field in milliseconds.

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
local step = ce.time.step(beats, "1/6")
local notes = ce.music.scale("C3", "harmonicMinr")
```

- **`"1/6"`** is not a division. The runtimes now say so when the script runs: *"ce.time.step:
  "1/6" is not a division, so there is no answer. The divisions are 1/1, 1/2, …"*. When this was
  written, `"1/8t"` was refused the same way, without the message. Any case is read now, so that
  one is simply right. The check says the same as it is typed, and completion lists the fourteen,
  each with its label from `DIVISION_LABELS`: *1/8T, 8th T*.
- **`"harmonicMinr"`** is checked against `SCALE_NAMES`. The runtimes now refuse it with the list
  of scales, where `ce.music.scale` used to return nothing silently.
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

- **Shown.** An "Aa" in its row, drawn in the family's own face, or in the fallback face with a warning
  when no such font is available: *"Not an available font. ce.text.style will refuse it."*
- **Editing.** The "Aa" opens the Text tab's family list. Picking a family writes
  `family = "Inter Tight"`.
- **`size = 18`** is in pixels (the option carries `unit: 'pixels'`), and its row has a field in
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
- **Line 2** gets a thumbnail in its row when the library or the panel has an image of that name, and a
  warning when neither has. Clicking the thumbnail opens the Assets tab, and choosing another image
  writes its name.

### 12. Two scales for one word

```lua
ce.image.set("Logo", logoData, { opacity = 0.5 })
ce.image.icon("Badge", "star", { opacity = 0.5 })
```

- **Line 1** is on the 0 to 100 scale, so 0.5 is almost invisible. The runtime now applies it and
  warns: *"ce.image.set("Logo"): opacity runs from 0 to 100 here, so 0.5 is almost invisible. If
  you meant 0.5 out of 1, write 50."* The hover would say the same.
- **Line 2** is on the 0 to 1 scale, so 0.5 is half. Writing 50 there now warns the other way.
- **Each row's field** reads its option's own `unit`, so the first takes whole numbers up to 100 and
  the second hundredths up to 1. None of this works unless the unit is in the schema. Here it is.

### 13. Angles the schema does not know are angles

```lua
ce.draw.arc(cx, cy, 40, -135, 135)
```

`from` and `to` are degrees, with 0 at twelve o'clock and increasing clockwise. When this was
written only the summary said so. The parameters carried no `unit`, so they were plain numbers and
would get no field. They carry `unit: 'degrees'` now, which was step zero for this kind: their rows
take whole degrees, and can say where 0 is.

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

## Fixed since, and decided

Eight silent failures were fixed in the script runtimes on 2026-10-18: the four this record found,
then the four it first left open as decisions. Two smaller gaps followed, and then the rest of the
API was gone through (the end of this section). Each follows the rule the runtimes already used for
an unknown blend mode: say what was wrong, and send or draw nothing rather than something
plausible. Where a value had to be read rather than refused, it is applied as written, with a
warning. Each was fixed in every runtime that has the call, in the same words, so the editor and
the exported player agree. `scriptPreludeAgreement.test.js` now compares the refusals word for word
across the WebView runtime and the Lua, JavaScript and Python preludes.

| Was | Now | Where |
|---|---|---|
| `sendNote(1, "c4", 100)` played C-1 (also `sendNoteOff`, and `sendAftertouch` with a note) | refused with an error naming the note | WebView runtime; Lua, JavaScript and Python preludes |
| `sendSysex("F0411000")` sent `F0 FF F7` (`F0 00 F7` from the player) | refused, with the spaced form to copy | WebView runtime (every call that reads hex text); `BridgeScriptHost` |
| a Roland template without `$checksumStart` was silently wrong | defined, with a warning | `deviceDefinitions.js`; `ScriptRuntime::defineDeviceParameter` |
| `ce.draw.image("knob-cap", …)` drew nothing | refused, with the call to use when it is an icon's name | WebView runtime (the verb is panel-view only) |
| `ce.time.step(beats, "1/8t")` returned nothing, with no message | any case is read (the names differ only by D and T); a name that is not a division is reported, with the list | WebView runtime; the three preludes |
| `ce.music.scale("c4")` gave the scale on C-1; an unknown scale or chord returned nothing silently | both answer nothing and say why, listing the scales or chords | WebView runtime; the three preludes (the generator now emits the name lists in order) |
| `sendMidi("90 3C 64")` sent a note from the editor and nothing from the player; `feedMidi`, `applyDump` and `checksum` read text in the editor only | the player reads hex text in all of them, by the same rule | `BridgeScriptHost::bytesFromScript`; each prelude's `checksum` |
| `opacity = 0.5` on a layer was almost invisible, and `opacity = 50` on an icon fully solid, both silently | applied as written, with a warning giving the other scale's number | WebView runtime (both verbs are panel-view only) |

`ce.draw.arc`'s `from` and `to`, and `ce.draw.gradient`'s `angle`, now carry `unit: 'degrees'` in
the schema, which is the step zero the number kind needs.

Two small gaps noticed on the way were then closed as well. A note left out altogether
(`sendNote(1)`, `ce.music.scale(nil)`) was still read as note 0 by the numeric path, and is now
refused like an unreadable name, everywhere but aftertouch, where no note means channel pressure.
And the player now says "no bytes given" for an empty `sendMidi`, `sendSysex` or `feedMidi`, as the
editor always did, instead of handing its callback nothing to send.

The drawing and colour parts of the API were then gone through the same way, and six more were
fixed on the same rule:

| Was | Now | Where |
|---|---|---|
| a colour property took any string: `"#000"`, `"red"` and `"rgb(0,0,0)"` were stored and painted white, through `set()`, `ce.panel.patch` and both image tints; `"#000"` as an icon tint was stored as `"000"`, no tint at all | refused, with the six- or eight-digit form to write (`"#000000"`, and `"#FF0000"` for `"red"`); since then, by the owner's decision, stored in that form instead (see the colour bullet below). Which properties are colours comes from the section templates, not from names (`scriptColours.js`) | WebView runtime |
| `ce.draw.fill("FF5B9BD5")`, the panel's own form and what `get()` returns, painted nothing, as did a bare `"5B9BD5"`, a number or an unknown name; gradient stops the same | the panel's forms are turned into CSS, with `rgba()` where there is alpha; what CSS reads is kept as written; anything else is refused and the style in force stays | WebView runtime (the verbs are panel-view only) |
| a number on a 0..1 scale written out of 100 was clamped or used as it was: `ce.draw.opacity(50)` was solid and `("50%")` switched it off, `ce.math.alpha(c, 128)` was solid, `lighten(c, 40)` white, and a gradient stop's `at: 50` went to the end | refused, with the number out of 100 when that lands inside the scale. The icon-opacity warning no longer offers 1.5 for 150 | WebView runtime; `lighten`, `darken` and `alpha` in the three preludes |
| the `ce.math` colour readers took the last six characters of anything, so `"x5B9BD5"`, `"#12#34#56"` and `0xFF0000` were colours | 6 or 8 hex digits, the 8 being AARRGGBB, with one `#` at most; anything else is refused | WebView runtime; the three preludes |
| `ce.draw.text` drew `"center"`, `"centre"` and `"Right"` left-aligned | any case, and all three spellings of centre the app uses mean `"middle"`; another word is refused | WebView runtime |
| `ce.anim.to(path, "full")` moved the value to 0 (the Python prelude raised), and a colour path had the number written into it | refused; text that is a number is still read as one; a colour property as the path is refused | WebView runtime; the three preludes (the colour path in the WebView only) |

An audit of the rest of the API then found about forty more, and they were fixed on the same rule,
in every runtime that has the call. The senders and the bytes first, since what they got wrong
reached a synth:

| Was | Now | Where |
|---|---|---|
| a list item was clamped by every send (300 inside a SysEx went out as FF, a System Reset), read modulo 256 by the byte helpers, and read as decimal when it was text (`"41"` went out as 29); a number where a list belonged was an empty list | one rule: an item is a whole number from 0 to 255 or text that is one hex byte, anything else is refused, naming it and where it is. Hex text splits on the same characters everywhere | WebView runtime; the three preludes; `BridgeScriptHost::bytesFromScript` |
| what an `interceptMidiOut` filter returned was clamped, so `"903C7F"` replaced the message with FF | read as a send reads it; if it is not bytes, the message goes nowhere and the console says why | WebView runtime |
| CC 200 went out as CC 127 (Poly Mode On), `"cutoff"` as CC 0, channel 0 or 17 as 1 or 16, `"C10"` as note 132 (a status byte in a data slot), NaN or a table as C-1 | an address (channel, controller, program, bank, parameter number) or note outside its range, or anything that is not a number, is refused. Text that is a number is read as one, as it always was | WebView runtime; the three preludes; `BridgeScriptHost` for a native handler's CC |
| a missing velocity sent a note off; `"500ms"` sent the note on and never its note off; any transport action but stop and continue sent Start; `panic` with channel `"all"` silenced channel 1 | each is refused, and nothing is sent | WebView runtime; the three preludes |
| a value left out printed as undefined, nil or None, and Python raised a TypeError for an argument left out | named ("no division given", "the value to write is missing"); Python's helpers take None and refuse | WebView runtime; the three preludes |

The device definitions next (`defineParameter`, `defineDump`), whose parsers were their own:

| Was | Now | Where |
|---|---|---|
| a dump request written `"F07D00F7"` sent FF; a bad token was dropped; an unspaced prefix matched every SysEx and decoded garbage | the senders' byte rule, refused when the definition is made | `deviceDefinitions.js`; `ScriptRuntime.cpp` |
| `$vaule` sent 00, a template written as numbers was encoded wrongly (0x41 as 0x65), and the Roland warning missed it | an unknown `$token` is refused; numbers are bytes; the warning fires | both |
| `checksum` knew three names and computed Roland for the rest; `"to14bit"`, the summary's own sample, was 7-bit; choices given as text sent 0; a boolean of 127 sent off; a dump checksum given as text never verified | the shared checksum table and every name; the encodings by name, `to14bit` an alias of `u14`; choices by position; booleans read by a fixed set; the text checksum read | both |
| a refused write to a declared parameter fell through to the device profile in the player | it ends there | `BridgeScriptHost::deviceWrite` |

And the options, timers and panel commands:

| Was | Now | Where |
|---|---|---|
| an option a call does not have was ignored almost everywhere (`easing` for `curve`, `rotation` for `rotate`) | it refuses the call: nothing is done, the console names it and lists the call's options, which come from the contract, and the call answers as for any other refusal | WebView runtime; the three preludes, from lists generated out of the contract |
| `saveSetting(k, v, {scop="script"})` stored the value where every script reads it | the storage calls refuse any key but `scope` | WebView runtime; the three preludes |
| a timer given `"fast"` or -100 fired every millisecond, and `after("1s")` at once | refused; a musical length may be a division's name | WebView runtime; the three preludes |
| `get()` of a control or property that is not there answered nil without a word | reports it in `set()`'s words | WebView runtime; every player engine |
| `ce.panel.find` with an unknown key returned every control; `patch` counted keys it did not apply; `match` with a `to` not in the list used the first | each refuses or reports, and counts only what it did | WebView runtime |
| the contract said `repeat` is the runs in all, 0 forever, and `done(completed)`; every runtime ran n as n more times (0 once, 1 twice) and passed `done` a table, which is always true | by the owner's decision, the runtimes do what the contract said: 1 runs once, 3 three times, 0 or less until stopped, and `done` gets one boolean, for one path and for a list | WebView runtime; `ScriptRuntime`; the three preludes |
| `ce.midi.write`'s options were "the same as read's" in its summary and listed nowhere, so `{ bit = 8 }` was not looked at and 300 went to the synth as 02 2C, not 01 2C | read and write share one definition of `bits` and `order`, so write is checked like read: an unknown key refuses the call, and it answers nothing | WebView runtime; the three preludes, from the generated lists |
| `ce.panel.define` checked a state's keys and no other section's: `{ durration = 400 }` made a 120 ms animation, and define answered true | every section refuses a key its entries do not have, in the unknown-option words with the call before them, defines nothing and answers false. What a section takes is read off the entry the app makes for it, plus what its readers read beyond that, listed with the reader; keys are matched with their capitals, as stored | WebView runtime (define is panel-window only) |
| `get(path, form)` and `set(path, value, form)` dropped a form that is not one, so `get("cutoff", "normalisedValue")` answered the raw value; in the player set's text form never reached the host, right or wrong | text that is not a form refuses the call, names the three, and names the one meant when it is a form written another way ("Write normalizedValue."); a right text form now works in the player's set as in the editor's, and Lua's `self.set` passes its options on instead of dropping them; a table or a number is still not a form | WebView runtime; `BridgeScriptHost`, so every player engine and a native handler |

For the owner to decide, and each decided since:

- ~~**Values at the edge of their range**~~ *Decided: clamp, and say so once.* A CC value of 128
  goes out as 127, a velocity of 200 as 127, a bend of -1 as 0, as before, and the first time for
  each command a warning names the value ("the value 200 is outside 0 to 127, so 127 was sent").
  Such a value comes from a script's own arithmetic (a 0..1 value times 128, an offset added, a
  curve that overshoots its end), so the warning points at it without filling the console when an
  animation sends sixty a second. In every runtime, and in `BridgeScriptHost` for a native handler.
- **An unknown option** — decided: it refuses the call. Nothing is done, the console says so in
  the storage calls' words (`ce.anim.to: "easing" is not one of its options, so nothing was done.
  Its options are: …`, every unknown key named, sorted), and the call answers what the member
  answers for any other refusal: nothing, false, 0, an empty list, recallPreset's `{ ok = false }`,
  or false from a dialog after its callback has run unanswered (`refusalOf` in `panelApi.js`). The
  same in every runtime that implements the member: `gen-script-modules.mjs` writes the contract's
  lists and the check into the three preludes, and `scriptPreludeAgreement.test.js` holds their
  words and answers to the editor's. Every committed panel's scripts and every written example
  passed the check before it became a refusal. ce.text.style and ce.image.set read their own
  keys (image.set in any case) and refuse the whole call in the same words; they used to drop the
  unknown option alone and apply the rest. The two this first left unchecked, because the contract
  listed no fields for them, are checked since (the table above): `ce.midi.write`'s options, which
  now share `ce.midi.read`'s definition, and `ce.panel.define`'s spec in every section. Found on the
  way: the `when` the define examples used, `valueGreaterThan`, is a key nothing evaluates, so the
  state they made never applied. The examples use `{ pressed = true }` now. A comparison on a
  plain control's value, which that key was reaching for, is a state's `rule` since:
  `rule = "value > 64"` ([Built](#built)).
- **A colour property: decided, accept.** The short forms with one reading are stored written out
  in the panel's form, the conversion the refusal used to print: `"#RGB"` as `"#RRGGBB"`, a CSS
  name in any case as its `"#RRGGBB"` (and `transparent` as `"00000000"`), and `rgb()`, `rgba()`,
  `hsl()` and `hsla()` as `"#RRGGBB"`, or AARRGGBB when the alpha is below 1. `set()`,
  `ce.panel.patch` and both image tints read through the one function (`scriptColours.panelColour`),
  nothing is written to the console when a form is expanded, and `get()` returns the stored form.
  Still refused, with the messages they had: a number (is `0xFF0000FF` AARRGGBB?), `"#"` with four
  digits (RGBA or ARGB?), three digits without the `"#"` (not CSS, and as likely a number),
  `currentColor`, text with space around it, and anything unreadable. `#` with eight digits
  means AARRGGBB in a property and in `ce.math`, and RRGGBBAA in a drawing, CSS's own meaning,
  which was kept. *Decided by the owner, 2026-10-19: a script says which it meant.*
  `ce.math.fromARGB("#80123456")` and `ce.math.fromRGBA("#12345680")` take 8 hex digits or 4,
  with or without `"#"`, read with the alpha first or last as they name, and answer in the form
  every reader reads one way: `"#RRGGBB"` when solid, AARRGGBB when not, so the colour is the same
  in a property, in `ce.math` and in a drawing. Anything else is refused in the `ce.math` words. In
  the WebView and all three preludes (`scriptColours.orderedColour`, each prelude's `__corder`),
  held to one answer by `scriptPreludeAgreement.test.js`. The Values tab reads their argument in
  its order (its swatch, and an edit written back with the alpha where the call has it), and the
  warning on a `#` with eight digits in a property or `ce.math` now ends by naming the two.
- **The `ce.math` colour readers: decided with the properties, they read the short forms too.**
  `lighten`, `darken`, `mix`, `alpha`, `rgb` and `hsl` read a colour as if the long form a property
  would store for it had been given (`scriptColours.storedColour`), in the WebView and the three
  preludes, and then do what they did with that long form: `"red"` is `"#FF0000"`, and
  `rgba(255, 0, 0, 0.5)` is `"80FF0000"`, its alpha set aside as an AARRGGBB's always was. What a
  property refuses they refuse, ending with the property's hint (`colourHint`), and the sentence
  that every colour refusal ends with now names the short forms: *A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with
  or without "#", or "#RGB", a CSS colour name, rgb() or hsl().* The names table is generated into
  each prelude from `CSS_NAMED_COLOURS` (`gen-script-modules.mjs`, "colour names"); the rest of the
  reading is ported by hand, Lua's as a tokenizer, each rounding as `Math.round` does, and
  `scriptPreludeAgreement.test.js` runs 140 inputs through every helper in all four runtimes. The
  port found two faults in the property path, both fixed: `"constructor"` and `"__proto__"` threw,
  and `hsl(1e400, …)` was stored as `"#NANNANNAN"`. The hint for `"#5B9BD580 "` now reads it as
  AARRGGBB, as the property does, rather than as CSS's RRGGBBAA.
- **A colour property with the plug-in's window shut: the editor's rule.** With the window open the
  panel view runs every script, so the rule above held there already. With it shut, the plug-in's
  own engines run them, and a script's `set()` reached the C++ panel model and was written as it
  came: `"red"`, `"#000"` and numbers were stored and handed back by `get()`, and `ce.anim` swept
  colours through numbers. Every door now passes through `BridgeScriptHost::setValue`, which reads
  each colour by `CE/src/Scripting/ScriptColours.h`, a function-for-function port of
  `scriptColours.js`: each engine's `set()`, Lua's `self.set`, a native handler's set, `compute()`,
  `ce.panel.restore` and `ce.anim`'s ticks. What it stores, writes out or refuses, and the sentence
  it refuses in, are the editor's. `ScriptRuntime::startAnimation` refuses a colour property as a
  move's path in the editor's words. Which properties are colours is said once:
  `gen-colour-fields.mjs` writes the C++ tables from the section templates and `scriptColours.js`,
  and `colourPropertyCases.json` (163 cases) holds both runtimes to the same answers. A control-set
  reference is taken where the panel's carried sets, or the built-in set it names, resolve it, as
  the player's page does. Found on the way: `ce.anim.envelope` sampled its shape with `map()`, which
  no prelude defines, so in the plug-in Lua and JavaScript stopped with an error and Python's own
  `map()` made every sample 0; the three preludes call `mapCurve()` now, and each engine's tests run
  an envelope through it.
- **Decisions the device-definition fix made** — decided: all kept. They change what a definition
  means: a variable's text is hex (`"10"` is 0x10, not 10), `$channel` follows the parameter's
  channel, `$deviceId` defaults to 16 in the player as in the editor, a layout with no prefix is
  refused, and a text parameter refuses writes.
- **One stored value** in `Yamaha AN1x.cepanel` — decided and fixed: a shared drawing's border
  colour was `"FF11151800"`, ten digits, so 34 sliders painted that border white. It is
  `"FF111518"` now, fixed in the shared component it is generated from
  (`tools/scripts/gaia-panel/components.mjs`) and the panel regenerated
  (`tools/scripts/an1x-panel/make-an1x-panel.mjs`).
- **The places the colour rule did not reach: all read by it now.** What this list used to name as
  not checked, and what checking it turned up:
  - *The panel's own colours, in both runtimes.* `bgColour`, `bgImageTint`, `bgTextureTint`,
    `gridColour`, `gridSubColour` and the background gradient's stops took anything from `set()`, so
    `"red"` was stored as `"red"` and the background painted nothing. They are read from the
    document a new panel starts as (`models/panelDefaults.js`, which `createPanel` is now made from)
    by the rule the section templates are read by, and `gen-colour-fields.mjs` carries the list to
    the player. Three panel readers did not take the `"#"` that `set()` stores for `"red"` (the solid
    background, the two tints, which also read an AARRGGBB's alpha as its red, and the gradient's
    stops, which CSS read as RRGGBBAA); each drops one `"#"` and reads AARRGGBB now. No panel reader
    resolves a control-set reference, so one is refused on the panel's colours.
  - *`ce.panel.create`, `clone` and the component verbs.* A colour in create's or clone's props was
    stored as written; the component verbs wrote through `set()`, which read their colours in its
    own name while the verb logged the change and answered true. Create and clone now read their
    props' sections as `set()` reads a section written whole, and refuse the whole call over a colour
    they cannot read, naming it by its path (`ce.panel.create("Meter"): at "Meter.trackColour",
    "redd" is not a colour the panel can read, so nothing was created.`). Every verb built from the
    component spec writes through one function, `writeComponentFields`, which reads every colour
    field in what it writes, typed by the templates rather than the verb, and refuses before writing
    any of it (`ce.components.drumpads.colour("Kit"): in pad 3, …`, and false).
    `ce.components.drumpads.colour`, the one verb whose value is a colour, was read by nothing, since
    the Drum Pads' `pads` starts empty; `scriptColours.LIST_ITEMS` types it, for `set()` too.
  - *A gradient's stops, the panel's and every control's: a stop's own form.* A stop is RRGGBB with
    no `"#"` and no alpha, which is what the gradient editors store and most of its readers take, so a
    script's stop is read by the colour rule and stored that way: `"red"` is `"FF0000"`. An alpha is
    refused, since the gradient's opacity is its layer's, and the refusal says a stop takes none and
    names the colour without it. A stop is known by where it sits, `color` in an item of `stops`; a
    control's gradient, which its template gives as null, is typed by `scriptColours.GRADIENT`, and
    the player's table carries a `stop` mark. A path into a gradient a control does not have yet
    threw from `set()` in the editor, and the player's walk did not step into a list by a lower-case
    path; both are fixed.
  - *A section's child inside create's props.* `{ Background = { Fill = { colour = "red" } } }` was
    stored beside Background's `_children`, where nothing reads it. A section's children are merged
    into at every depth now, matched in any case as a path is, and a key the section does not have is
    written with `set()`'s warning for a new property. A section the new control does not have
    (`{ Meter = … }` on a Button), or one given as anything but a table, used to be passed over without
    a word, and now refuses the call.
  - *A list move with a colour in it.* `ce.anim.to({ "cutoff", "lbl.background.fill.colour" }, …)`
    started the rest and waited for a `done` that never came. Such a list is refused whole in every
    runtime: each colour is named in the words one path is refused in, nothing starts, `done` is not
    called, and the call answers false. In the player the preludes now hand back the host's answer,
    so `ce.anim.to` answers true or false there too, where it used to answer nothing.

  `colourPropertyCases.json` holds the two runtimes to the same answers for all of it. Left as they
  are: the five hand-written component families (split, phrase, recorder, harmony, setlist) write
  through `set()` and are refused in its name, since none takes a colour from a script; and an object
  given for a plain field of a section (Border's `top`) replaces it whole, as `set()` does.

## Rules every edit session follows

1. **Keep the form.** The written text has the original's notation, quotes and case, and the
   script's own syntax. Where the form cannot carry the new value, the nearest one that can is
   written: a CSS colour name recoloured to something that has no name is written as `"#RRGGBB"`,
   and `rgb()` and `hsl()` keep their function with new numbers.
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
7. **The text shows what is being edited.** While an edit is open from a row, its value's
   characters carry the strong box described under
   [Decided](#decided-a-values-sidebar-is-where-values-are-shown-and-edited), and the box moves with
   the text when a write-back changes the value's length.
8. **Structured kinds wait for a parser.** Kinds that are one string or one number work in all seven
   languages through the highlighter's tokens. Kinds that are a list or a table (gradients, bezier
   numbers, dash lists, envelope points, byte lists) need a parse, so JavaScript, TypeScript and Lua
   come first. One inherited caveat: `codeHighlight.languageKey` has no Python entry and tokenises
   Python as Lua, so a `#` comment in Python is not recognised as a comment. A colour string inside
   one would be marked.

## What not to build

- **Booleans.** Typing `true` is faster than any widget.
- **Free text**, such as labels, messages and log lines. There is nothing to choose from.
- **Numbers without a unit or a range.**
- **Dragging numbers.** Proposed first (Alt-drag in place), and not planned: the owner is not sure
  of it, and with Live on it runs the script at every release of a drag. A number with a unit gets
  a field in its row instead, which runs the script once per change.
- **Anything inside the text** (constraint 1).
- **A pop-up editor per kind beside the text, or in the sidebar.** The colour rule stands: a row's
  swatch opens the display panel, and no colour chooser opens anywhere else.

## Order of work

0. **The registry and the context resolver**, with colour as the first kind. Pure functions with
   tests: for a statement, its calls, their arguments and options, and what each value is.
1. **The Values sidebar, display only, in the script editor and the panel file view.** The fourth
   dock tab, its rows for the statement the caret is in (in the panel file view, for the object the
   caret is in), and the three highlights in the text. Nothing is edited yet, and every kind the
   registry knows is already worth seeing.
2. **Colour editing through the shared display panel**, allowed in the script workspace and opened
   from a row's swatch, with the session rules above.
3. **Lists of names.** Type the parameters in `panelApi.js`, add the row's dropdown and reopen
   completion over an existing value, add the checks. Divisions, scales, chords, the 16 `values`
   lists, events, animation names, and the option keys the contract already lists.
4. **Easing curves**, through the Animation tab's components.
5. **Gradients**, for JavaScript, TypeScript and Lua.
6. **Numbers with units**, as a field in the row.
7. **The rest:** font, image, control names and property paths, SysEx, notes, device parameters.
   Each is a small change once the registry exists.

Each step after the first works in the panel file view too, wherever a property name gives the
context.

## Built

*2026-10-19: steps 0 to 7 of the order of work, in the script editor and the panel file view.*

- **The core** (`scripting/scriptValues.js`, over `scriptValueScan.js`, `scriptValueKinds.js` and
  `scriptValueWrite.js`). `readStatement(source, language, caret, context)` gives the statement the
  caret is in, its calls, and for each argument and option what kind of value it is, what it means,
  and what the runtime would refuse, in the runtime's words. `readJsonValues` does the same for the
  panel file view's object, and `writeValue` gives the characters for a new value, spelled as the
  language spells it. 94 parameters in `panelApi.js` carry a `kind` (step zero). For each refusal,
  `test/scriptValues.test.js` calls the runtime and compares what it writes to the console.
- **The tab** (`editor/ValuesSidebar.svelte`, rows laid out by `editor/valueRows.js`). The dock's
  fourth tab, loaded the first time it is shown. A header names the lines, the call as written and
  its summary. Rows follow the call's order, an options table's keys sit under `opts`, and a call
  inside another is indented under it. Each row shows the value in the editor's colours, what it
  means, its problem, and its editor. While an edit is open the tab stays on that statement rather
  than following the caret.
- **The highlights** (`editor/codeMarks.js`, CodeEditor's `marks`): the statement band with its bar
  at the left, a box round the value under the pointer, and an outlined box round the value being
  edited, which follows the value as its length changes.
- **The editors.** A colour opens the shared display panel's Colors tab, and a gradient its Gradient
  tab, through callback targets labelled with the script and the line ("Script · Title text colour,
  line 3"). A choice is a dropdown, a curve's with its picture, and a number with a unit is a field.
  A font family's dropdown lists the fonts the runtime checks against, an image's the library's
  and the panel's images by name; `ce.draw.image` takes the picture itself, so its image has none.
  A curve drawn as four numbers has the Animation tab's `BezierEditor` under its row, written once
  a handle is let go or a number entered, in the form it was written in. A script's gradient opens
  the Gradient tab told it is linear only (`gradientTarget.js`'s `linearOnly`), so the tab offers
  the angle and the stops and no type, centre, radius, edge or presets. Paths, notes, bytes and
  computed values are shown, not edited.
- **The session rules** (`editor/valueEditSession.js`) keep rules 2 to 7. A value is written when
  the gesture settles (350 ms with no pointer held, or Done). Each write is one `replaceRange`
  through the editor, so one undo step. Cancel, through a target's own `cancel`, puts back the
  characters there were, not a colour re-formed from them. Any text the session did not write
  (typing, an undo, a fold, another script) ends it.
- **The display panel in the script workspace** has a switch of its own (`stores/panelVisibility.js`,
  `ce.ui.showDisplayPanel.script`), off until the viewer turns it on or a swatch opens it. A panel
  the swatch opened is hidden again when the edit ends. As first built it shared the panel
  editor's switch, so a dock left open there took a third of the script editor's height.
- **Completion over a value already written** (`scripting/valueCompletions.js`, CodeEditor's
  `valueCompletions`). With the caret anywhere between the quotes of a value the core has
  `meaning.choices` for (a curve, a division, a scale or a chord, one of the 16 `values` lists, an
  event, a control's name, a keyframe animation, a font, an image), Ctrl+Space lists those choices
  in their own order, the one written selected, and the one accepted replaces the whole value
  between the quotes, as one edit. Typing in the value filters the list by the text before the
  caret and opens it once something is typed, as word completion does; a value the runtime reads as
  a choice but written another way (`"1/8t"`, an event by its id) is listed as written, so Enter
  keeps it, and one it refuses only for its case has the choice selected, so Enter corrects it. A
  value not written out gets none, and outside a known value completion is word completion as it
  was. It reads with the same core as the tab, which BehaviorDesigner loads on its own once a script
  is open, so it works whichever tab the dock shows. Checked by `test/valueCompletions.test.js` and
  `browser-checks/valueCompletion.mjs`.
- **The dock remembers its tab** per viewer (`editor/dockTabMemory.js`, `ce-script-dock-tab`).
- **In the panel file view** the dock has the Values tab alone. A control's colour row edits the
  item's text as typing would, and Apply puts it on the control. Every field and the whole file are
  shown to read.
- **Checked by** `test/valuesSidebar.test.js`, and by `browser-checks/valuesSidebar.mjs` in
  `runAll.mjs`, which drives the tab in Lua and JavaScript and in the panel file view as a person
  would, and measures the highlights against the text under them.

Driving it in all seven languages showed the rows, the colour swatch, the dropdowns and the fields
work in each, written back in each language's spelling. It also found things the core did not yet
say. Each is now said, in the runtime's words where the runtime has them:

- **A value that is not a number where a MIDI number goes**: `sendNote("C4", 100, 1)` sends nothing,
  because the channel comes first.
- **`ce.anim`'s target and path.** `ce.anim.to` and `ce.anim.spring` refuse a target that is not a
  number. They, and `ce.anim.envelope`, also refuse a colour property as the path.
- **`ce.anim`'s duration.** The runtime ran a duration under 1 ms as 1 ms and a duration written as
  text as its default, and said nothing about either. The row said what happens; both runtimes now
  say it too (below).
- **The time arguments.** `ce.time.after`'s delay, `startTimer`'s interval, the beats `syncTimer`
  and `afterBeats` take as a number, and `sendNote`'s length are now refused in the runtime's words
  (its `timeRefused` and `noteLength`). The core had a generic range of its own for them, "the ms is
  at least 0, and -5 is not", which no runtime says. It also called `ce.ui.notify`'s
  `duration = -1` out of range, though 0 or less is how a message is kept up. That field now says
  `min: null` in the contract.
- **How rows are shown.** A call is headed by its name as written (`ce.core.set`, `ctx.SendCC`), not
  by the contract's id for it. A property holding a control set's token says "now {text.primary}
  from the control set", where it showed the token as a quoted string. A see-through drawn colour
  reads "#FFAA00 at 50% opacity", not as `rgba(…)`.

Then, on the owner's word the same day:

- **`ce.anim`'s timing, in both runtimes.** A duration or a delay that is not a number (text that
  is one is read as one), or is below 0, and beats that are not a number above 0, are said once per
  command, in the same words in the WebView (`animTiming`, `animBeats`) and in the plug-in's
  `ScriptRuntime`, and the move goes ahead as it always did: a duration in its default time, or
  1 ms below 0; a delay of none; the length its duration gives. The plug-in had read `"1/4"` with
  `String::getDoubleValue`, as 1 ms, where the WebView moved it in 300; both read it as text now.
  The rows say what the runtime does, word for word, and `beats` is read as a number of beats.
- **A call the module does not have**, `ce.<module>.<name>`, is an error in the editor's problems
  list and on its call in the Values tab, with what was meant: the same name in the module that has
  it (`ce.panel.on` is `ce.core.on`), the camelCase of a snake_case name (Python's `send_note`), or
  the nearest spelling (`unknownCalls.js`). Every member the WebView runtime defines is in the
  contract's map, so a call it has is never named (a test holds that). The problems list's check of
  `on()` read `ce.panel.on` as `on()`; it reads `on`, `ce.core.on` and `ctx.on` alone now.

- **The rest of `ce.anim`'s options.** `stagger`, `damping` and `frequency` had been read with
  `Number()`, so text that is not a number was 0 or the default without a word. They are read as
  the timing is, and what is not a number is said once per command in both runtimes
  (`animOption`); a number below 0 is used as it is, since a stagger below 0 runs a list back to
  front behind a delay.
- **A field's or a dropdown's edit ends when the caret leaves its statement**, as well as on blur.
  Driving the new dropdowns found an edit that never ended: a pick writes, the row is drawn again,
  and a focused element that is taken away gives no blur, so the tab stayed on that statement with
  the caret long gone.
- **The last editors** (fonts, images, drawn curves), the Gradient tab's linear-only mode and
  completion over a value are in the Built list above.

And on the owner's word on 2026-10-20, the two things the review of the above left over:

- **A state's rule reads the control's value.** `when` could ask for the value to be one number
  (`{ value = 64 }`), and `rule` could compare (`level > 0.5`) but saw only custom channels and
  flags, so on a plain knob `rule = "value > 64"` compared nothing and was never true, without a
  word. A rule now reads `value`, `valueNormalized` and `valueEnum`, the names `when` reads them by
  (`interactionRuntime.js`, `STATE_RULE_VALUE_NAMES`), with a channel of the same name kept over
  them: 490 custom controls in the committed panels have a `value` channel, and to them `value`
  means it, as it always did; no committed panel has a rule. The States tab's rule builder offers
  the names after the channels. The Animation tab's preview of a state sets the value that makes
  it true (`statePatch`): for `when` on the value, and for a rule, from the range's ends and
  middle and each number the rule compares the value with, a hundredth of the range either side;
  a list's choice, or a value no range holds, stays inexact, as before. `ce.panel.define`'s
  summary and example show it. Checked end to end in `test/animationPlayback.test.js`, which
  fails without the runtime's change.
- **The code editor's lists follow the arrow keys.** A value's list kept its selected row in view;
  the word list and Go to symbol's did not, so ArrowUp from the first word selected the last one
  out of sight. All three now scroll to it. Driving that found the pointer taking the selection
  back: a list the keys scroll moves rows under a resting pointer, the browser says each was
  entered, and a row took the selection on mouseenter, so fifteen ArrowDowns moved seven rows. A
  row now takes it on a move with a distance, which a scroll has none of. Checked in
  `browser-checks/valueCompletion.mjs`.

Then, on the owner's word the same day, the kinds the table above still had unbuilt, after the
Values tab's first version was merged:

- **Device parameters.** The `id` of `ce.device.write`, `read` and `parameter`, and `bind`'s
  `parameterId`, are read against the profile behind the call's device (read's and parameter's
  second argument, write's third, bind's `opts.role`; a role nothing is mapped to reads the main
  synth's, as the runtime does). The row names the parameter, its group and its range, and is a
  dropdown of the profile's parameters, each by its id and name; completion inside the quotes lists
  the same. An id the profile does not have is said as its call does it: write refuses it, bind
  binds it anyway, each in its runtime's words (`scripting/deviceWords.js`), and read and parameter
  answer nothing. A row says nothing of an id while the table loads, which the tab has asked for,
  or of one the panel's scripts declare with `defineParameter`; with no profile chosen only bind's
  says anything, as bind does, since then nothing but a declaration knows the id.

  Reading it found the table it needs was never there. Every reader asked the Device Profile
  Designer's page: 160 parameters by default, and after a search in the Designer only what matched,
  with nothing more to load. So on a profile longer than a page, or one searched in the Designer, a
  send to a parameter that was there was refused as "not in profile", `ce.device.parameter()`
  answered nothing for it, and `bind` called it unknown; and the script runtime asked the host for
  the list with one object where the request takes the id and the role, so a profile the Designer
  had not listed was never loaded for a script at all. `stores/deviceParameterTable.js` now loads a
  profile's whole table, 500 a page with no filter, under requests of its own the Designer's page
  never sees, and forgets it when the profile's source is saved; the send check, `parameters()`,
  `parameter()`, `bind`, `write` and the rows all ask it. And `ce.device.write` of an id the profile
  lacks was logged as sent and answered true in the editor, the host's "Not sent" going to the MIDI
  preview, and answered false without a word in the plug-in: both now refuse it, nothing sent, in
  the same words. Checked by `test/deviceParameterTable.test.js`, which also holds the plug-in's
  sentence (`PluginProcessor.h`) to the editor's.
- **Property paths, a segment at a time.** Inside a path's quotes completion lists the segment
  under the caret, from what the segments before it lead to (`pathSegmentChoices` in
  `scriptValueKinds.js`, walking as `readPath` resolves): at the start the panel's controls, each
  with its type, and `panel`; after a control its value's three forms, the shorthands (`opacity`,
  `x`…), its own sections and then the sections its templates have that it has not made (a knob
  draws with parts, and `Cutoff.Background` is still a path); after a section its sections and its
  settings, each with what it holds now. The one accepted replaces that segment alone, up to the
  next dot, and after a dot the list opens with nothing typed, as member completion does after one.
  A `self.set` path starts at the script's own control. Checked by `test/valueCompletions.test.js`
  and a row of `browser-checks/valueCompletion.mjs` that builds `Cutoff.Transform.x` from the
  keyboard.
- **An envelope's points have an editor.** `ce.anim.envelope`'s `points` is typed `envelope`, read
  by the runtime's own reader (`scripting/animEnvelope.js`, through `scriptValueKinds`'
  `readEnvelope`). Points written out that the runtime would play have the shape under their row,
  at its whole width, drawn by the runtime's own sampling (`sampleEnvelope`), so a curve a point
  carries bends the line there as it bends the move. A point is dragged, added with a double-click
  on the shape's ground and taken out with Remove, and the selected one's x and y have fields; each
  is written once, when the drag is let go or the field written, as one undo step. Only the x and y
  of the point that moved change, as numbers in the form they had: a pair stays a pair, a key stays
  where it was, a curve and the comments around it stay, and a point added is a copy of the one
  after it, taking the curve of the segment it splits, as the Envelope component's added nodes do.
  A point stays between the two either side of it in x, and in 0 to 1. `EnvelopeDesigner` was not
  used: it edits a control's points through the store, with a sustain node and presets a script's
  envelope does not have. The editor is `editor/EnvelopePointsEditor.svelte`, over the pure
  `editor/envelopePointEdit.js`, and the write is `writeValue`'s envelope.
- **A point the runtimes could not place now starts nothing, and says why.** Every runtime dropped
  a point it could not read (a y left out, text that is not a number) without a word; with fewer
  than two left the move was a flat line, and with none a straight ramp from `from` to `to`. A point
  whose x is outside 0 to 1 was never reached, since the shape is sampled from 0 to 1: written in
  milliseconds or out of 100, the move played a sliver of the shape written. Each of these is now
  refused in the WebView and in the Lua, JavaScript and Python preludes, in the same words: "the x
  of point 2 of 3 is a number from 0 to 1, and 50 is not, so nothing was started. If you meant 50
  out of 100, write 0.5." A y past 0 to 1 is read as it is, a level past `to` above 1 and past
  `from` below 0, as a target past a control's range is for `ce.anim.to`, and an overshoot is a
  shape someone may mean; the row's line says so. The note for fewer than two points was spelled
  three ways (Lua's `{ x = , y = }`, Python's hyphen), and is one now; the JavaScript prelude read
  text as a list of its characters, and takes a list alone, as the WebView does. The plug-in's
  `ScriptRuntime` is given the samples alone, and is unchanged. Checked in every engine by
  `test/scriptPreludeAgreement.test.js` (and the real ones by `ScriptRuntimeTests.cpp` and
  `PythonScriptEngineTests.cpp`), the row's words against the runtime's by
  `test/scriptValues.test.js`, and the editor driven by `browser-checks/valuesSidebar.mjs`.

Still open: nothing from this record.

## Open questions for the owner

None left from this record. Decided on 2026-10-19:

- **The edit surface** is the Values sidebar, and it covers the whole statement the caret is in
  ([Decided](#decided-a-values-sidebar-is-where-values-are-shown-and-edited)).
- **A row's swatch opens the shared display panel**, which the script workspace is allowed to show.
- **Dragging numbers** is not planned.
- **The dock remembers its tab, per viewer.** It opens on the tab last used, kept in local storage
  as the minimap's toggle is (`ce-minimap`), and on Insert the first time. Someone who works with
  Values gets Values, and someone browsing the API gets Insert.
- **The panel file view gets the sidebar in the first version.** Tools → Panel file shows the
  panel's file in the same code editor. It has keys and no calls, so its rows come from property
  names alone (`colour`, `tint`, a stop's `color`, a `gradient`), for the object the caret is in:
  with the caret in a `Fill`, its colour and its gradient's stops. A swatch opens the display panel
  there too.
