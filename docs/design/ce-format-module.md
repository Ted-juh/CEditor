# `ce.format`: a value as text, and text back as a value

*Designed and approved by the owner on 2026-10-27. Built on 2026-10-28 on the `script-modules-build` branch; what differs from this record is listed in [the roadmap](script-modules-roadmap.md).* The design for a scripting
module that turns a value into the text a person reads, and typed text back into a value: 15
commands, every one a plain function that sends nothing and gives the same text in all seven
languages. Every command entry is written in the scripting manual's form, so it can go into
`panelApi.js` as it stands. Second in [Script modules: what is missing](script-modules-roadmap.md),
after [`ce.patch`](ce-patch-module.md).

## Why it is needed

A script that writes "12.3 kHz" on an LCD today builds the text itself, in its own language:
`string.format` in Lua, `toFixed` in JavaScript, an f-string in Python. The seven give different
roundings and different text for the same number, so a panel exported to C++ can show something
other than the editor did. And the synths' own readouts are not linear: a Roland LFO rate, a Juno
chorus mode, a pan of 0 to 127 that reads L64 to R63.

## What it builds on

| Exists | Where | What `ce.format` takes from it |
|---|---|---|
| `textFromValue`: decimals, prefix, unit, choices, a placeholder for "no reading" | `CE/web/src/CE_Application/utils/displayMaps.js` | The placeholder rule (no value is not zero), choices by label. |
| A wire range mapped to the range the synth's front panel reads, from the profile's `display.min` and `display.max` | `utils/valueDisplayScale.js` | `parameter`'s scaling. 144 parameters carry the pair; the GAIA's Octave Shift is stored 61 to 67 and reads -3 to +3. |
| Note names, divisions, gain to dB | `ce.music.noteName`, `ce.time.divisionNames` and `beatsPerDivision`, `ce.math.gainToDb` | The same names and conversions; `ce.format` adds the synth's octave numbering and the display rules. |
| Typography and measuring in a control's own font | `ce.text.measure`, `ce.text.fit` | The proportional-font case; `fit` and `line` here count characters. |

The profiles say little about display. Measured on the 18 profiles on 2026-10-27: of 881 parameters
with a `unit`, 875 leave it empty; the rest are BPM (2), cent, dB, % and semitones.

## Every command at a glance

| Command | Gives | Example |
|---|---|---|
| `number(v)` | A number with the decimals it needs | `number(0.5)` → `0.5`; `number(12, { sign = "always" })` → `+12` |
| `hz(v)` | A frequency | `hz(1250)` → `1.25 kHz` |
| `time(ms)` | A duration | `time(850)` → `850 ms`; `time(1200)` → `1.2 s` |
| `db(v)` | A level | `db(-6)` → `-6.0 dB`; `db(0, { fromGain = true })` → `-inf dB` |
| `percent(v)` | A share | `percent(0.5)` → `50%` |
| `pan(v)` | A position left to right | `pan(-0.5)` → `L25`; `pan(0)` → `C` |
| `ratio(v)` | A ratio | `ratio(4)` → `4:1`; `ratio(2, { style = "x" })` → `x2.00` |
| `clock(ms)` | A time on a clock | `clock(83450)` → `1:23.4` |
| `note(n)` | A note name, in the synth's octave numbering | `note(60)` → `C4`; `note(60, { middleC = 3 })` → `C3` |
| `division(beats)` | The note length nearest to a number of beats | `division(0.25)` → `1/16`; `division(1/3)` → `1/8T` |
| `parameter(id, v)` | A synth parameter, as the synth's own display reads it | `parameter("octaveShift", 61)` → `-3` |
| `table(v, table)` | Text from a lookup table | `table(2, {"Off", "I", "II", "I+II"})` → `II` |
| `fit(text, width)` | Text shortened and padded to a display's width | `fit("Resonance", 4)` → `Reso` |
| `line(left, right, width)` | One display line, a label on the left and a value on the right | `line("Cutoff", "12.3k", 16)` → `Cutoff     12.3k` |
| `parse(text)` | A number from typed text | `parse("1.2k")` → `1200`; `parse("C4", { kind = "note" })` → `60` |

## Rules every command keeps

- **The same text in every language.** Rounding is half away from zero, written out by `ce.format`
  itself, never by the language's own formatting.
- **A point for decimals, always.** The text does not change with the computer's language settings,
  so a panel shows the same on every machine.
- **Plain ASCII by default.** LCD fonts have no `−`, `∞`, `µ` or `♯`: the text uses `-`, `inf`, `us`
  and `#`. `unicode = true` gives the typographic forms for a label or a readout drawn in a normal font.
- **No value is not zero.** A missing value (nil, NaN, not a number) gives `placeholder`, `--` by
  default, never `0`: a readout showing 0 for "no reading" is wrong.
- **A space before a unit**, as in "12 kHz", and none before `%`, as in "50%". `space = false` packs
  it for a narrow display: "12kHz".
- **Three significant digits by default** for numbers with a fractional part: `hz(1234)` →
  `1.23 kHz`, `hz(440)` → `440 Hz`. `decimals` fixes the number of decimal places instead.

## The options every command shares

| Name | Type | Default | What it does |
|---|---|---|---|
| `decimals` | number (0 to 6) | as the command decides | Exactly this many decimal places. |
| `digits` | number (1 to 6) | 3 | Significant digits, when `decimals` is left out. |
| `sign` | text | `"auto"` | `"auto"`: a minus when below 0. `"always"`: a plus too, as in "+12". |
| `unit` | on/off or text | on | Off: no unit. Text: this unit instead, such as `"st"`. |
| `space` | on/off | on | The space between the number and its unit. |
| `width` | number | none | Pad to this many characters, the text on the right; longer text is not cut (that is `fit`). |
| `placeholder` | text | `"--"` | The text for a missing value. |
| `unicode` | on/off | off | The typographic characters: `−`, `∞`, `µ`, `♯`, `♭`. |

Good to know:

- A value that is text where a number is expected, such as `"440"`, is read as the number, as
  `ce.math` reads it.
- An option a command does not take refuses the call, as every other module's options do: the
  command returns its placeholder and the console names the key. A misspelt option is then found at
  once instead of being quietly ignored. (An earlier draft ignored such keys; that was changed when
  it was built, to match the rest of the API.)

## Units

Each of these takes a value in a stated unit and picks how to write it. A value in another range (a
0 to 127 knob, say) goes through `ce.math.scale` first, or through `parameter`, which reads the
range from the profile.

### `ce.format.number(v [, opts]) -> text`

A number, with as many decimals as it needs.

Example: `ce.format.number(12, { sign = "always" })` gives "+12".

- `v` (number, required): The number.
- `opts` (options, optional): The options every command shares.

Good to know:

- A whole number has no decimals unless `decimals` asks for them: `number(3)` → "3", `number(3, { decimals = 1 })` → "3.0".
- Trailing zeros are dropped under `digits`: `number(2.50)` → "2.5".

### `ce.format.hz(v [, opts]) -> text`

A frequency, in Hz or kHz, whichever reads shorter.

Example: `ce.format.hz(1250)` gives "1.25 kHz".

- `v` (number, required): The frequency in hertz.<br>Below 0: rejected, with `placeholder` and a console error.
- `opts` (options, optional): The options every command shares, and the one below.

Good to know:

- kHz from 1000 Hz up: `hz(999)` → "999 Hz", `hz(1000)` → "1 kHz".
- Below 1 Hz, as an LFO rate can be: `hz(0.25)` → "0.25 Hz".

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scale` | text | `"auto"` | `"auto"`, `"Hz"` or `"kHz"`: keep one so a column of values lines up. |

```lua
-- Lua
ce.components.lcd.text("Display", 1, ce.format.hz(cutoffHz, { space = false }))
```
```js
// JavaScript
ce.components.lcd.text("Display", 1, ce.format.hz(cutoffHz, { space: false }));
```

### `ce.format.time(ms [, opts]) -> text`

A duration, in ms or s, whichever reads shorter.

Example: `ce.format.time(1200)` gives "1.2 s".

- `ms` (number, required): The duration in milliseconds.<br>Below 0: rejected, with `placeholder` and a console error.
- `opts` (options, optional): The options every command shares, and `scale`: `"auto"`, `"ms"` or `"s"`.

Good to know:

- Seconds from 1000 ms up. Below 1 ms: `time(0.5)` → "0.5 ms".
- For a length in beats, use `division`; for minutes, use `clock`.

### `ce.format.db(v [, opts]) -> text`

A level in decibels, always with one decimal.

Example: `ce.format.db(-6)` gives "-6.0 dB".

- `v` (number, required): The level in dB, or a gain when `fromGain` is on.
- `opts` (options, optional): The options every command shares, and the ones below.

Good to know:

- The level `ce.math.gainToDb` gives for silence, -144 dB, and anything at or below `floor`, is written "-inf dB".
- One decimal by default, because a dB readout jumping between "-6 dB" and "-5.9 dB" reads as a fault.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `fromGain` | on/off | off | `v` is a gain (1 = 0 dB), converted as `ce.math.gainToDb` does. |
| `floor` | number (dB) | -144 | At or below this: "-inf dB". A mixer fader often wants -80. |

### `ce.format.percent(v [, opts]) -> text`

A share, as a percentage.

Example: `ce.format.percent(0.5)` gives "50%".

- `v` (number, required): The share, 0 to 1 by default.
- `opts` (options, optional): The options every command shares, and the ones below.

Good to know:

- Whole percentages unless `decimals` asks for more.
- Outside the range: written as it is, "120%". Use `ce.math.clamp` first to hold it.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `min` | number | 0 | The value that is 0%. |
| `max` | number | 1 | The value that is 100%. `max = 127` reads a knob's raw value. |

### `ce.format.pan(v [, opts]) -> text`

A position from left to right, as a synth's display writes it.

Example: `ce.format.pan(-0.5)` gives "L25"; `ce.format.pan(0)` gives "C".

- `v` (number, required): The position, -1 (left) to 1 (right) by default.
- `opts` (options, optional): The options every command shares, and the ones below.

Good to know:

- With the default range, the number runs from 0 to `steps`: `pan(1)` → "R50", so halfway left, `pan(-0.5)`, is "L25".
  (An earlier draft gave "L50" for `pan(-0.5)`, which this rule does not give; the rule stands.)
- With a range of your own, the number is the distance from the centre as it is, which is what synths show: `pan(v, { min = 0, max = 127, center = 64 })` reads 0 as "L64" and 127 as "R63".

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `min`, `max` | number | -1, 1 | The range of `v`. |
| `center` | number | halfway | The value that is "C". |
| `steps` | number | 50 | What the far left and far right read, for the default range. With `min` and `max` of your own: the distance from `center`, unscaled. |
| `style` | text | `"L50"` | `"L50"`, `"50L"`, or `"<50"` and `"50>"` for a display with no letters to spare. |

### `ce.format.ratio(v [, opts]) -> text`

A ratio, as a compressor or an FM operator shows it.

Example: `ce.format.ratio(4)` gives "4:1".

- `v` (number, required): The ratio, above 0.<br>0 or below: rejected, with `placeholder` and a console error.
- `opts` (options, optional): The options every command shares, and `style`: `":"` ("4:1", the default) or `"x"` ("x2.00", as an FM ratio reads, two decimals).

Good to know:

- A ratio of infinity, as a limiter has, is written "inf:1".

### `ce.format.clock(ms [, opts]) -> text`

A time as a clock shows it: minutes, seconds and tenths.

Example: `ce.format.clock(83450)` gives "1:23.4".

- `ms` (number, required): The time in milliseconds.
- `opts` (options, optional): `decimals` for the seconds (0 to 3, default 1), and `hours` on to always show hours.

Good to know:

- Hours appear from 60 minutes on: "1:02:03.4".
- The last digit is cut, not rounded, as a clock does: 83,450 ms is "1:23.4", and 59,999 ms is
  "0:59.9", never "1:00.0" before the minute has come.
- For a song position in bars and beats, use `ce.time.barBeatAt`.

## Music

### `ce.format.note(n [, opts]) -> text`

A MIDI note number as a note name, in the octave numbering the synth uses.

Example: `ce.format.note(60, { middleC = 3 })` gives "C3", as a Yamaha's display reads middle C.

- `n` (number, required): The MIDI note, 0 to 127.<br>A fraction: rounded.<br>Outside the range: `placeholder`, with a console error.
- `opts` (options, optional): The options every command shares, and the ones below.

Good to know:

- The same names as `ce.music.noteName`, which stays for music: this one is for display, so it takes the synth's numbering and the ASCII rule.
- Makers disagree on middle C: Roland and most software say C4, Yamaha says C3, some old gear says C5. Get it wrong and every note on the display is an octave off.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `middleC` | number | 4, or the profile's `display.middleC` | The octave number middle C (note 60) is written with: 3, 4 or 5. |
| `flats` | on/off | off | "Db4" rather than "C#4". |
| `octave` | on/off | on | Off: the letter alone, "C#", for a key or a chord root. |

### `ce.format.division(beats [, opts]) -> text`

The note length nearest to a number of beats, by the names the sequencer components use.

Example: `ce.format.division(0.25)` gives "1/16"; `ce.format.division(1/3)` gives "1/8T".

- `beats` (number, required): The length in beats; a quarter note is 1.<br>0 or below: `placeholder`, with a console error.
- `opts` (options, optional): The options every command shares, and the one below.

Good to know:

- The names are those of `ce.time.divisionNames()`: "1/1" to "1/32", with "D" for dotted and "T" for triplet. `ce.time.beatsPerDivision` turns a name back into beats.
- A length near no division (more than `tolerance` away) gives the beats as a number, "0.3 beats", rather than the wrong name.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `tolerance` | number (0 to 0.5) | 0.02 | How far from a division, as a part of it, still counts as that division. |

## As the synth shows it

### `ce.format.parameter(id, v [, opts]) -> text`

A synth parameter's value, written the way the synth's own display writes it, from the device profile.

Example: `ce.format.parameter("octaveShift", 61)` gives "-3" on a GAIA, where the value is stored 61 to 67 and the panel reads -3 to +3.

- `id` (text, required): The parameter, by its id in the device profile.<br>Not one of its parameters: `placeholder`, with a console error.
- `v` (number or text, required): The value as the synth stores it, as `ce.device.read()` gives it.
- `opts` (options, optional): The options every command shares, and `role`. What the call passes wins over what the profile says.

Good to know:

- What it reads from the profile, in order: a choice's label; `display.table`; `display.min` and `display.max` to scale the stored range to the shown one; `display.format` to pick the command (`hz`, `time`, `db`, `pan` and the rest); `display.unit`; `display.precision`.
- A parameter the profile says nothing about is written as its number, which is what the panel shows today.
- The one command most panels need: `lcd.text("Display", 1, ce.format.parameter(id, value))` shows any parameter correctly once the profile says how.

### `ce.format.table(v, table [, opts]) -> text`

Text from a lookup table, for a value whose display follows no formula.

Example: `ce.format.table(2, {"Off", "I", "II", "I+II"})` gives "II".

- `v` (number, required): The value.
- `table` (list or table, required): Either a list, its first entry for value 0; or a list of ranges, `{ upTo, text }`, read in order, the first whose `upTo` the value does not pass.<br>Neither: `placeholder`, with a console error.
- `opts` (options, optional): The options every command shares, and `start`, the value the first entry of a list is for (default 0).

Good to know:

- The first entry is for value 0 in every language, Lua included, because synths count from 0. `start = 1` changes that.
- A value past the end of the table: `placeholder`, with a console warning.
- For a parameter, put the table in the profile (`display.table`) rather than in the script, so every panel for that synth gets it.

```lua
-- Lua
local rate = ce.format.table(v, {
  { upTo = 63, text = "Free" },
  { upTo = 127, text = "Sync" },
})
```
```js
// JavaScript
const rate = ce.format.table(v, [
  { upTo: 63, text: "Free" },
  { upTo: 127, text: "Sync" },
]);
```

### What the profile's `display` field gains

The profile already has `display.mode`, `shortLabel`, `unit`, `min`, `max` and `precision`. Two
optional fields let `parameter` write any parameter as the synth does, and the same fields serve the
inspector and the value readouts, which show raw numbers today. They go into `dpd.schema.json` as
optional fields; no profile needs them to load.

| Field | What it says | Example |
|---|---|---|
| `display.format` | Which kind of value it is: `"number"`, `"hz"`, `"time"`, `"db"`, `"percent"`, `"pan"`, `"ratio"`, `"note"`, `"division"` or `"table"`. | A filter cutoff stored 0 to 127 that reads 20 Hz to 20 kHz: `"format": "hz"` with a `table`, or with `min` and `max` and the profile's curve. |
| `display.table` | The table `ce.format.table` takes, for a display that follows no formula. | An LFO rate stored 0 to 127 whose display reads 0.05 Hz to 1/32 notes. |

And one profile-wide default: `display.middleC` at the top of the profile, for `note` (3 on a Yamaha).

## Fitting a display

A character display has a fixed number of characters a line: 16 or 20 on most LCDs, 40 on the large
ones. These two count characters, which is right for an LCD and for any monospaced font. For text
in a proportional font, measure it with `ce.text.measure`.

### `ce.format.fit(text, width [, opts]) -> text`

Text made exactly `width` characters long: shortened the way a synth's display shortens it, then padded.

Example: `ce.format.fit("Filter Envelope", 10)` gives "Filter Env".

- `text` (text, required): The text. A number is written as text first.
- `width` (number, required): The number of characters, from 1.
- `opts` (options, optional): The options below.

Good to know:

- How it shortens, one step at a time until the text fits:
    1. the words in the abbreviation list: Oscillator → Osc, Envelope → Env, Resonance → Reso, Frequency → Freq, Attack → Atk, Release → Rel, Velocity → Vel, Modulation → Mod, and about 40 more;
    2. vowels from the ends of the longest words, never a word's first letter: "Filter" → "Fltr";
    3. the spaces between words;
    4. the end, cut.
- Text that fits as it is stays as it is, only padded.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `align` | text | `"left"` | `"left"`, `"right"` or `"center"`, for the padding. |
| `pad` | on/off | on | Off: shortened but not padded, so the text may be shorter than `width`. |
| `abbreviations` | table | none | More words to shorten, or the built-in ones changed: `{ Cutoff = "Cut", Detune = "Dtn" }`. |
| `steps` | number (1 to 4) | 4 | The last shortening step allowed: 1 for abbreviations only, so a name is never mangled. |

### `ce.format.line(left, right, width [, opts]) -> text`

One display line: a label on the left and a value on the right, with spaces between.

Example: `ce.format.line("Cutoff", "12.3k", 16)` gives "Cutoff     12.3k".

- `left` (text, required): The label.
- `right` (text, required): The value, usually from another `ce.format` command.
- `width` (number, required): The line's width in characters.
- `opts` (options, optional): `gap`, the fewest spaces between the two (default 1); and `abbreviations`, as `fit` takes them.

Good to know:

- When the two do not fit, the label is shortened with `fit`, never the value: a wrong-looking value is worse than a short name.
- A value wider than the line is cut from the left, so its end, where the unit is, stays.

```lua
-- Lua
ce.components.lcd.text("Display", 1, ce.format.line("Cutoff", ce.format.hz(cutoffHz, { space = false }), 16))
ce.components.lcd.text("Display", 2, ce.format.line("Reso", ce.format.percent(reso), 16))
```
```js
// JavaScript
ce.components.lcd.text("Display", 1, ce.format.line("Cutoff", ce.format.hz(cutoffHz, { space: false }), 16));
ce.components.lcd.text("Display", 2, ce.format.line("Reso", ce.format.percent(reso), 16));
```

## Reading typed text

### `ce.format.parse(text [, opts]) -> number`

A number from text a person typed, in the forms the other commands write.

Example: `ce.format.parse("1.2k")` gives 1200; `ce.format.parse("C4", { kind = "note" })` gives 60.

- `text` (text, required): What was typed. Spaces and case do not matter.<br>Nothing it can read: no result, and no console line, because a person typing is not a script's mistake.
- `opts` (options, optional): The options below.

Good to know:

- What it reads with `kind` left out: a number, with `k` for thousands ("1.2k"), and `Hz`, `kHz`, `ms`, `s`, `dB`, `%` as units, each turned into the unit its command takes: "1.2 s" → 1200 (ms), "50%" → 0.5, "-6dB" → -6.
- With a `kind`, it also reads that kind's own forms: a note name, a division ("1/8T" → 0.333 beats), a pan ("L25" → -0.5), a ratio ("4:1" → 4).
- "inf" and "-inf" are read as the number, so "-inf dB" gives the floor `db` writes it from.
- Returns the number. Nothing readable: no result; check for it before using it.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | `"auto"` | `"auto"`, or one of `"hz"`, `"time"`, `"db"`, `"percent"`, `"pan"`, `"ratio"`, `"note"`, `"division"`: what the value is, so "5" in a time field is 5 ms and in a frequency field 5 Hz. |
| `min`, `max` | number | none | The range the result is held to. |
| `middleC` | number | 4 | For notes, as `note` takes it. |
| `parameter` | text | none | A parameter id: read as `ce.format.parameter` writes that parameter, and turned back into its stored value. |

```lua
-- Lua
local hz = ce.format.parse(typed, { kind = "hz", min = 20, max = 20000 })
if hz then ce.device.write("cutoff", hz) else ce.ui.status("Not a frequency") end
```
```js
// JavaScript
const hz = ce.format.parse(typed, { kind: "hz", min: 20, max: 20000 });
if (hz !== undefined) ce.device.write("cutoff", hz); else ce.ui.status("Not a frequency");
```

## Build steps

Two steps. Every command is pure, so each is written once in `panelApi.js` and in all seven
preludes, with a table of inputs and expected text that the parity tests run in every language;
that table is what proves "the same text everywhere". The plain-description rules in
[api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | Commands | Builds on |
|---|---|---|
| 1. Formatting | `number`, `hz`, `time`, `db`, `percent`, `pan`, `ratio`, `clock`, `note`, `division`, `table`, `fit`, `line`, `parse` | `utils/displayMaps.js` (`textFromValue`), `ce.music.noteName`, `ce.time.divisionNames`, `ce.math.gainToDb` |
| 2. The profile | `parameter`; `display.format`, `display.table` and `display.middleC` in `dpd.schema.json`; the inspector and the value readouts reading them | `utils/valueDisplayScale.js` |

## Open decisions

- [ ] Whether the LCD and Pixel Display components should format their own value with
  `display.format` (a "show as Hz" setting in the inspector), so a panel needs no script for it.
- [ ] Whether `fit`'s abbreviation list should be one list for every language, or per language once
  the program is translated.
- [ ] Whether to fill `display.format` in the existing profiles from their parameter names
  (cutoff → hz, attack → time), with each guess marked for a person to confirm.
