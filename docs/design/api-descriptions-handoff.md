# Plain descriptions for the scripting API — handoff

Every scripting command has a description: the `summary` in its API entry. It is the text under a
command in the Insert picker, in the hover card, in the scripting manual and in the API explorer.
Too many of them read badly. This file says what to change, where the text lives, how to check it
and in what order to work.

To start a session on it, paste [the prompt at the end](#prompt-for-claude-code).

---

## State on 2026-10-24: what is done, what it built, what is left

For thinking about what comes next. The sections further down hold the detail, module by module.

### Done

Five modules, 166 of the 783 command descriptions, each merged to `main` through a pull request the
owner asked for and merged when CI was green:

| Module | Commands | Merged as | Runtime fixes that came with it |
| --- | --- | --- | --- |
| `ce.midi` | 44 | `a4f5920` (the rest of ce.midi, and code marks drawn as code) | none; the older helpers' silent answers are deferred, below |
| `ce.math` | 61 | `8274838` (six wrong answers fixed in every runtime) | negative hue, `random` ends, `randomFloat` with one number, `angleOf`, text as numbers, `snap`/`lerp` without a number |
| `ce.anim` | 12 | #63, `b75ff53` | a control the panel does not have, empty paths, curve/damping/stagger/from/repeat/done fallbacks said once, envelope points |
| `ce.draw` | 27 | #65, `b13f8fa` | 25 silences: a required argument left out, a size below 0, every option with a wrong value, stroke's fallbacks as warnings |
| `ce.time` | 22 | #66, `9f13990` | a required number left out, a timer with no id, a one-shot with no function, no tempo, tap and clock lists; in all four runtimes |

The format itself is settled and approved: one sentence, an `example`, every parameter and option
with its type and whether it is required (from the data), its range and what an invalid value
gives, **one rule per line**, the notes with what the call returns, and the rules a module shares
said once in its introduction. [Write technical English, not prose](#write-technical-english-not-prose)
is the table of wording the owner rejected and what replaced it; read it before writing a word.

### What was built to carry it, and is there for the next modules

- **Type lines from the data.** `paramTypeLabel` / `paramTypeLine` in `panelApi.js`: the manual,
  the hover card, the sidebar hint and the API explorer show `(number, required)` beside each
  parameter, so no text says "Required". `manualReference.test.js` fails on a type with no word.
- **Line breaks render everywhere.** A `\n` in a text is a rule of its own: `<br>` in the manual
  and the explorer, `pre-line` in the hover card, as it is in the hint. The option-values list sits
  on its own line.
- **Hover card and hint by dotted path.** `ce.midi.sendCC(...)` finds its command as `sendCC` does
  (`API_BY_PATH`, `apiCommandAt` in `languageService.js`); 677 commands had no hint in that form.
- **Module introductions** (`MODULE_INTROS` in `generate-scripting-manual.mjs`) for ce.midi,
  ce.math, ce.anim, ce.draw and ce.time, with the shared rules and the colour tables.
- **One-time warnings, per command and argument**, so a fallback is said once and not every frame:
  `warnAnimTiming` (ce.anim), `drawSaid` and `warnDrawStroke` (ce.draw), `timeArg` / `timeSaid`
  (ce.time), and their equivalents in the three preludes. `resetScriptState` clears them.
- **Shared readers**, so the runtime and the Values sidebar say the same words: `drawShapes.js`
  (`drawNumber`, `drawMissing`, `drawOption`, `textSize`, `polygonSides`, `gridCount`, `gridStep`,
  `flatPointList`, `segmentList`), `drawDash.js`, `timeWords.js` (`TIME_NUMBERS` with `optional`
  and `rejected`), `animEnvelope.js`.
- **Four runtimes held to one set of words.** `scriptPreludeAgreement.test.js` runs the Lua,
  JavaScript and Python preludes extracted from `CE/src/Scripting/*ScriptEngine.cpp` under
  wasmoon, node:vm and python3, against the WebView runtime: answers, refusals and one-time
  warnings. Its sandboxes report a tempo now, so musical timers arm there. A change to a prelude is
  verified by the web suite alone; the C++ test targets (`CEditorScriptingTests`,
  `CEditorPythonScriptTests`, `CEditorPlayerScriptTests`) pin a few messages and were rebuilt for
  ce.anim and ce.time.
- **Regeneration after a text change**: `npm run docs:manual`, `npm run docs:help` (the release
  notes are bundled too, so run it after editing them), `gen-api-explorer.mjs`,
  `gen-script-modules.mjs --write` (the module cost table weighs the preludes and
  `panelRuntime.js`). `helpDocs.test.js` and `panelApiParity.test.js` fail on a stale bundle or
  table.

### Decisions that hold for every module to come

- A required value left out, or of the wrong type: rejected with a console error. A query with no
  result for a legitimate reason (nothing animated, no tempo, too few taps) returns nothing without
  a word. An error always means the call did nothing.
- An option or number with a wrong value: the fallback in its row, with a console warning the
  first time only. `Invalid: default.` in the row; the rule once in the introduction.
- A value outside its range: the nearest end, said once, where the helper is the transport's or
  the panel's own arithmetic; rejected where the result would be meaningless.
- Text that is a number is read as one, except a timer's interval or delay (two runtimes could not
  read it, so "250" is refused everywhere).
- A word from a list the app defines is read in any case, and with spaces around it, everywhere
  (the owner, 2026-10-24, on `ce.components.lcd.animPreset`), and stored or used as the list spells
  it: `listWord` in `utils/wordLists.js`, `__word` in each prelude. A name an author makes up is
  matched as it was: this rule does not reach it. (A control's name and a pixel element's were
  matched in any case and trimmed already, `nameIndexFor` and `elementAnswersTo`; the records
  below said "exact" of them until 2026-10-24, which was never so.) The text says
  `Case-insensitive.` on the line that lists the words; the manual and the API explorer add it to
  a list they print from `values`.
- Shown to the owner one item at a time for a new module, until the owner says to continue without
  showing each item (said on `ce.draw.gradient`); then the rest of the module in one pass, with
  the decisions recorded in this file for review.
- The process per command: probe its edges in the runtime first (a probe script in the scratchpad
  against `scriptApiForTesting`), decide each silence by the rules above, write the text, add the
  edge to the module's test file, regenerate, run the full suite, one commit per module, push,
  pull request, merge when green, rebuild the branch from `main`.

### Deferred, for the owner to decide

- `ce.midi`'s older helpers answer outside their range without a word: `to7bit(20000, 2)`,
  `to14bit(20000)`, `fromNibbles(16, 0)`, `nibblize({300})`, `denibblize` with an odd count,
  `toSigned(-200, 8)`, `from7bit("02 2C")`, `toAscii` not cutting long text. Their parameters say
  the ranges, not that a value outside them goes unnoticed. Rejecting them is the rule above; it
  was left for the owner since it is behaviour older scripts may lean on.
- `ce.time`'s helpers took a required number left out as its default (bar 1, 0 ms) by an earlier
  session's decision; `ce.time` reversed it under the rule above. If the owner prefers the old
  behaviour for the transport helpers, it is `optional: true` on those arguments in `timeWords.js`
  and the three `__TIME_NUMBERS` tables.

- `ce.device`, which runs in four runtimes, answers without a word: `deviceParameter()` and
  `deviceRead()` with no id give nothing, `deviceParameters(5)` an empty list, `devicePorts` with a
  `direction` that is not "in" or "out" every port, `deviceSetTiming` with a name the profile does
  not have stores it, and `deviceBind` binds to a parameter the profile does not have. The rules say
  a required value left out, or a wrong option, is refused or said; each would be a change in the
  panel runtime, `ScriptRuntime.cpp` and the three preludes, so they are left for the owner. The
  texts say what each does now.

### Left

The table under [The branch](#the-branch): 580 descriptions in the modules not yet done, of which
154 need the most work by the 2026-10-21 measure (every component verb already has the generated
form; see [`ce.components.lcd`: done](#cecomponentslcd-done-and-the-component-generator-with-it)). The `ce.components.*` modules are the bulk
(roughly 400 descriptions over 20 components); they are panel-window only, so their runtime is
`panelRuntime.js` and the C++ engines define them as explaining stubs: no prelude work, and the
sidebar's `readDrawShape`-style readers do not apply. Then `ce.panel`, `ce.device`, `ce.music`,
`ce.core`, `ce.storage`, `ce.image`, `ce.text`, `ce.ui` and the lifecycle hooks. After the
commands: the module descriptions (41, the picker's group headings) and the event descriptions
(38), with the same rules. Next by the table: `ce.components.arp` (30 descriptions, 15 that need
the most work), once the owner's review of `ce.components.lcd` is finished: it was merged without
the owner seeing each item, and [its queue](#the-owners-review-one-item-at-a-time) says what is left.

---

## Why

The owner, looking at the Values tab on 2026-10-21, about the line under `ce.midi.setBits`:

> the text looks very AI, not clear, maybe even not necessary … we really need to re-consider that
> kind of language because it is not clear, very artificial and does not have any purpose right now
> than being clutter.

That line was the first sentence of `setBits`' description:

> Write `bits` into the `count` bits starting at bit `start`, and return the result: a number for a
> number, a new list for a list (the one passed in is not changed).

It describes the arguments instead of saying what the command is for. Without the code marks, as
the Values tab showed it, it reads as nonsense: "Write bits into the count bits starting at bit
start". The Values tab no longer shows descriptions at all (PR #59). The text is still what every
other place shows.

How widespread it is, measured on 2026-10-21 over the 783 command descriptions: 342 have a first
sentence that leans on parameter names in code marks, has a bracketed aside, or runs past 25 words.
The rest are mostly fine. "Work out the checksum a synth expects at the end of a SysEx message." is
the kind of sentence to aim for.

## The rules

1. **Open with what the command does, in everyday words, in one short sentence.** Use the imperative
   the good ones already use: "Send…", "Read…", "Draw…".
2. **Do not build that sentence out of parameter names.** "the `count` bits starting at bit `start`"
   means nothing to someone who has not read the signature yet.
3. **A fixed example goes in `example`, not in the description.** `setBits(0xB4, 4, 3, 5)` gives
   0xD4 is clearer than any sentence about bit positions, but only where there is no script to
   show: the Insert picker, the hover card, the manual and the API explorer. The Values sidebar
   shows the script's own values instead, and the owner does not want an example there that has
   nothing to do with the script. So the description has no example, and the member's `example`
   field holds it (see [The fields](#the-fields)).
4. **Move the detail to the parameters.** Ranges, counting from 0 or 1, defaults, what is refused
   and what comes back on a refusal belong in each parameter's or option's own description. Most of
   that is already written there. Check before you delete a fact from a description, and move it if
   it is not.
5. **No asides.** No brackets in the first sentence, no "the way synths…", no dashes leading off
   into a second thought, no "Be aware that…", no "so that…, which is…" chains.
6. **Two or three short sentences at most.** If a command needs more, the rest belongs in the
   parameters or in the manual's written part.
7. **A musician's words, not the program's.** Not "runtime", "prelude", "WebView", "reducer",
   "contract". "With the panel window closed" is fine; "in the player runtime" is not.
8. **Keep the words people search for.** The Insert picker's search matches description text
   (`ScriptPicker.svelte`), so "SysEx", "CC", "NRPN", "LFO" and so on should stay where they are
   the point.

9. **Short and clear, not childish.** The reader is a musician who scripts a little: they know what
   a CC is and what a byte is, and may not know two's complement. Encourage them with the purpose
   and the script's own values, not with friendly words. Never "simply", "just", "easy", "don't
   worry", "think of it as…", exclamation marks or metaphors.
10. **Plain English for readers who learned it as a second language.** No idioms: not "a hair
    apart", "carry on", "set aside", "take care". Use the plain word.

### Approved descriptions

The owner approved these on 2026-10-21, with the sidebar and hint format below. They are the model
for the rest.

| Command | Description | `example` |
| --- | --- | --- |
| `ce.midi.setBits` | Change a setting in a byte. | `setBits(0xB4, 4, 3, 5)` gives 0xD4. |
| `ce.midi.getBits` | Read a setting from a byte. | `getBits(0xB4, 4, 3)` gives 3. |
| `ce.midi.to7bit` | Split a number into SysEx bytes. | `to7bit(1000, 2)` gives {7, 104}. |
| `ce.midi.read` | Read a number from a SysEx message. | `bytesRead(msg, 6, 2)` reads bytes 6 and 7. |
| `ce.midi.sendNRPN` | Send an NRPN message. | `sendNRPN(1, 0, 5, 9000)` |
| `ce.midi.checksum` | Work out the checksum a synth expects at the end of a SysEx message. | |
| `ce.math.scale` | Move a value from one range to another. | `scale(64, 0, 127, 0, 100)` gives about 50. |
| `ce.panel.batch` | Make a set of changes count as one step, so one undo takes them all back. | |
| `ce.midi.interceptIn` | See every MIDI message from the synth before the panel uses it. | |
| `ce.anim.stop` | Stop an animation where it is. | |
| `ce.time.now` | A clock in milliseconds, for measuring how long something takes. | |

Where a rewrite drops a fact, the fact moves to a parameter's `summary`, to `notes` or to
`returns` (see [The fields](#the-fields)). `ce.panel.batch`'s "the exported plugin has no undo"
becomes a note, for example.

Already fine, leave alone: `ce.midi.checksum`, `ce.panel.grid` ("Arrange controls in a grid of equal
cells, each as big as the largest control."), `ce.device.write`, `ce.midi.toNibbles`.

## The fields

A command's text is spread over these fields of its entry in `panelApi.js`. All but `summary` are
optional.

| Field | What it holds | Shown in |
| --- | --- | --- |
| `summary` | The one plain sentence (two or three at most). No example, no parameter names. | Everywhere |
| `example` | One call with fixed values and what it gives: "`getBits(0xB4, 4, 3)` gives 3." | Insert picker, hover card, manual, API explorer. Never the sidebar. |
| `params[].summary` | A parameter's facts: its range, counting from 0 or 1, its default, what is refused. A full sentence, capital first, full stop at the end, three words or more, not repeating the name. Not its type or whether it is required: those are shown beside it from `type` and `required` (below). | Hover card, manual, API explorer, the sidebar hint (on the parameter's name) |
| `returns` | A choice the command makes from what a function gives back: `[{ when, then }]`, e.g. `{ when: 'false', then: 'The message is dropped.' }`. | Manual, sidebar ("What fn returns") |
| `notes` | "Good to know": at most three short sentences that change what you write. | Manual, hover card, sidebar |

## The Values sidebar and the hint

Approved by the owner on 2026-10-21 from mockups. The sidebar explains the statement the caret is
in, using the script's own values. Nothing in it is a fixed example.

**The hint.** The code editor's signature hint (`editor/signatureHint.js`) sits against the right
edge of the script page, on the caret's line, as long as it does not cover code; otherwise it goes
above or below the line, as before. Its parameter names are coloured. The same colours are used for
the arguments in the code (an underline, drawn as a mark: `editor/codeMarks.js`), for the hint at
the top of the sidebar and for the values in the sidebar's rows, so the colour says which value is
which parameter.

**Colours.** Three colour groups at most: blue, amber and green (`--blue`, `--amber`, `--accent`).
Parameters that work together share a colour, such as `start` and `count` in `getBits`. The rest
are grey. Colour is never the only clue: the names are always in the hint and in the rows. The
groups are in `scripting/paramColours.js`; a command not listed there gets the three colours in the
order of its parameters.

**The sidebar, top to bottom:**

1. `Line 12`, then the hint (the call's name as it is typed in a script, its parameters coloured,
   the one at the caret underlined), then the description.
2. The value rows, as before.
3. Under the rows, what the call does with these values, when that can be drawn
   (`scripting/callExplainers.js`):
   - **Bits** (`getBits`, `setBits`): the byte in binary with the bit numbers under it, counted from
     the right; the field marked, with an arrow from the start bit for the count; for `setBits` the
     new bits under the field and the new byte; the hex value of each row at its left.
   - **7-bit bytes** (`to7bit`): the number in binary, split into groups of 7, and the bytes they
     become.
   - **Bytes in a message** (`bytesRead`): the message as hex cells numbered from 0, the bytes read
     marked with an arrow to the right, and how they make the number.
   - **The messages a command sends** (`sendNRPN`, `sendRPN`): each message as bytes, with what it
     is.
   - **A checksum** (`checksum`): the bytes added up and the steps to the checksum byte.
   - **Two ranges** (`scale`): two number lines with the value on one and the result on the other.
4. Text, only when a drawing cannot say it:
   - A fact about one parameter goes in that parameter's row.
   - A choice becomes a small table: "What fn returns", with the lines of the script's own function
     that give each answer.
   - A difference with another command becomes a small picture (`animateStop` and `animateFinish`).
   - "Good to know": at most three short lines. A line with ✓ is about this script and was checked
     (`panelBatch`: nothing in the function waits). A failed check is an amber warning in the same
     place. A line with a dot is a general fact.

## Edge cases

| Case | What the sidebar does |
| --- | --- |
| A value only exists when the script runs (`msg`, a knob's value) | The drawing has empty cells where the value goes; the field and the arrow still show. |
| Start or count is a variable | No drawing, only the rows. |
| A call the runtime refuses (`wave` does not fit in 3 bits, a read past the end) | No result row; the runtime's own sentence is shown, as before. |
| A long bulk dump | A window of bytes around the offset, with "…" before and after. |
| `setBits` on a list of bytes | The field can cross from one byte into the next; both bytes are drawn. |
| Input written as text (`"F0 41 10"`), in decimal or as a note name | The row shows it as written; the drawing is always in hex. |
| Lua counts lists from 1 | A Lua script gets a note on `bytesRead`: offset 6 is `msg[7]`. |
| A call inside another call | The header explains the call the caret is in; the drawing is under that call's rows. |
| More than three parameters | Three colour groups at most; the rest are grey. |
| A ✓ check that cannot see the code (a function passed by name) | A dot, never an unchecked ✓. |
| Places with no script (picker, manual, API explorer) | The description and `example`. That is the only place for a fixed example. |

Not done yet, and worth doing next:

- **A variable set earlier to a literal** (`local wave = 0x05`, then `setBits(byte, 4, 3, wave)`):
  the sidebar only knows values written in the call itself. Following a local set once, above the
  call, in the same function, would make most drawings show real values.
- **The last value from a Test run**, labelled "last run", for values that only exist when the
  script runs.
- **More drawings**, by the same pattern: `from7bit`, `to14bit` and `from14bit`, `nibblize`,
  `toSigned` and `toOffset` (a number line from −64 to +63 above 0 to 127), `bytesWrite`,
  `bytesSlice`, `bytesPut` and `bytesFind` (as `bytesRead`), `wrap`, `fold`, `clamp`, `snap` and
  `quantize` (a number line or a ring of steps), `sendProgramChange` (program 0 is "1" on the
  synth), `sendPitchBend` (8192 is the centre) and `syncTimer` (ticks on a beat grid).

## Where the text lives

A command's description is its `summary`. Most are written out in full; some are built from a
template, and changing the template changes every command made from it.

| File (under `CE/web/src/CE_Application/`) | What |
| --- | --- |
| `scripting/panelApi.js` | Most commands, every module's and event's description, and the parameters and options. Shared option fields come from `optionFields([...])`. |
| `scripting/componentVerbs.js` | The component commands (`ce.components.arp.rate` and the like), several from templates such as "Show or hide the … No argument toggles." |
| `models/componentFamilies.js` | Component descriptions the verbs reuse. |
| `scripting/midiFilters.js`, `scripting/deviceDefinitions.js` | A handful each. |

To list every description with its module, so a batch can be reviewed as a table:

```bash
cd CE/web
cat > list-descriptions.tmp.mjs <<'EOF'
import { ALL_MEMBERS, memberModule, memberPath } from './src/CE_Application/scripting/panelApi.js';
const mod = memberModule();
const want = process.argv[2];
for (const m of ALL_MEMBERS) {
  const module = mod[m.id]?.module ?? '';
  if (want && module !== want) continue;
  console.log(`| \`${memberPath(m.id)}\` | ${String(m.summary ?? '').replace(/\|/g, '\\|')} |`);
}
EOF
node --import ./test/support/register-svelte.mjs list-descriptions.tmp.mjs ce.midi
rm list-descriptions.tmp.mjs
```

Leave the module name off to list all of them.

To find which file holds one: `git grep -n -F "the first few words"` from the repository root.

## Where it shows up

One source; every one of these reads it:

- **The Insert picker** (`editor/ScriptPicker.svelte`): the description and the example under each
  command; its search reads the notes too, so a word moved into a note is still found.
- **The hover card and completion** (`scripting/languageService.js`): the description, the example,
  the parameters with their type, and the notes, each on its own line in the card. The card and
  the code's signature hint find a command by its path (`ce.anim.to`) as well as by its short name
  (`animateTo`); the middle of a path (`anim`) shows the module's description.
- **The Values sidebar** (`editor/ValuesSidebar.svelte`, from `scripting/scriptValues.js`'s
  `call.doc`, `call.explain`, `call.returns` and `call.notes`): the description, the returns table
  and the notes, never the example.
- **The scripting manual**, `docs/scripting-manual.md`, generated by `npm run docs:manual` (in
  `CE/web`), with the example, the parameters, the returns table and the notes under the
  description. `test/scriptingManual.test.js` fails when it is stale.
- **The app's Help**, `src/CE_Application/generated/helpDocs.js`, which bundles the manual, generated
  by `npm run docs:help`. `test/helpDocs.test.js` fails when it is stale.
- **The API explorer**, `docs/api-explorer.html`, generated from the repository root by
  `node --import ./CE/web/test/support/register-svelte.mjs tools/scripts/gen-api-explorer.mjs`.
  `--check` says whether it is stale. No test does, so regenerate it every time.

The descriptions are not compiled into the plug-in or the C++ engines. Changing them changes no
behaviour.

## Tests that read the wording

These assert on description text. When one fails after a rewrite, decide whether it pins a fact
(keep the fact, in the description or a parameter, and point the test at it) or only a phrasing
(update the test):

`test/manualReference.test.js` (option descriptions must start with a capital, end with a full stop,
have three words or more and not repeat the option's name), `presetRecallApi.test.js`,
`apiContractRuntimes.test.js`, `scriptNoteIn.test.js`, `scriptMath.test.js`,
`scriptComponentEvents.test.js`, `deviceReadWrite.test.js`, `customComponentPackage.test.js`,
`scriptTeardown.test.js`, `componentEnums.test.js`, `animationPresets.test.js`.

## Order of work

One module per commit, with the before and after in the commit message.

**Done on 2026-10-21, with the sidebar and the hint:** the first batch, the commands in [Approved
descriptions](#approved-descriptions) (`getBits`, `setBits`, `to7bit`, `bytesRead`, `sendNRPN`,
`checksum`, `scale`, `panelBatch`, `interceptMidiIn` and `interceptMidiOut`, `animateStop`,
`nowMs`). The owner approved the format and these texts, so the rest of `ce.midi` no longer needs a
before/after table first: go on module by module, and show the owner the table for each module
before it is committed. `test/callExplainers.test.js` checks that the facts the old descriptions
held are still said somewhere; add each rewritten command to its list.

**Done on 2026-10-21, the rest of `ce.midi`:** its other 36 commands, approved by the owner as a
table. `ce.midi` is finished. Decided with it, and to follow in the modules after it:

- **Rules a whole module shares are said once, in the manual.** What every send refuses, rounds and
  sends as the nearest end is a paragraph in the `ce.midi` chapter's introduction (`MODULE_INTROS`
  in `scripts/generate-scripting-manual.mjs`), not a sentence on each of fifteen parameters.
- **A long name goes in a note.** "CC means Control Change", "SysEx means System Exclusive", as
  NRPN's does. The picker searches notes, so the long name still finds the command.
- **A helper with only a signature gets a parameter list**, type `value`, as `to7bit`'s, so its
  parameters can be described. Thirteen in `ce.midi` had none.

Found on the way and left for the owner, since it is behaviour: the older helpers give an answer
without a message where the byte-list helpers refuse. `to7bit(20000, 2)`, `to14bit(20000)`,
`from14bit(128, 0)` and `fromNibbles(16, 0)` answer outside their range, `nibblize({300})` gives
`{2, 12}`, `denibblize` drops an odd last half, `toSigned(-200, 8)` gives 56, `from7bit("02 2C")`
gives the text "41943296C", and `toAscii` does not cut text longer than its length. Their
parameters say the ranges, not that a value outside them goes unnoticed.

**Done on 2026-10-21, `ce.math`:** its 60 commands (`scale` was in the first batch). The owner
reviewed the first twenty one at a time and asked for the rest to follow them. What was decided on
the way, for the modules after it:

- **Show the owner one item at a time.** A table of sixty was too much to answer at once.
- **Parameters are written schematically**, not as sentences of options:
  `Range: 0 ↔ 1 (black ↔ unchanged). Default: 0.55. Outside the range: an error in the console and no result.`
  The parts, in this order, where they apply: what it is, `Range: a ↔ b (what a means ↔ what b
  means)`, `Default: x` or `Left out: x`, `Must be below hi.`, `Outside the range: …` (held at 0
  or 1, not held, or an error in the console and no result). Use ↔, not `<->`, which a page could
  read as the start of a tag.
- **Plain technical wording.** Not "nothing comes back" or "gives nothing": "returns no value", "an
  error in the console and no result", "Empty: no result".
- **Rules a module shares can be a table.** How a colour is read is two tables in the manual's
  `ce.math` introduction (what is read, with an example and what it is read as; what is not
  accepted), and the random rules are a short list there.
- **Say what the runtime does at the edges**, checked, not assumed: a value left out, outside the
  range, or a range given the wrong way round. Where the result is meaningless (NaN), the parameter
  is required (`required: true`), and the type line says so.

**Decided on 2026-10-22, starting `ce.anim`:**

- **The type and whether a parameter is required are shown from the data**, not written in its
  text: the manual, the hover card and the API explorer show `` `target` (number, required): The
  end value. ``, and the sidebar hint shows "number, required. The end value." on the parameter's
  name. The words come from `paramTypeLabel` in `panelApi.js`, a short plain list (number, text,
  true or false, list, options, control name, any value…), and `manualReference.test.js` fails on
  a type that has none. So a parameter's text never says "Required", "Must be given" or "Number
  required". The 187 parameters typed only as `value` were given their real type where it is
  known; `value` is left only where any value is taken (`set`, `log`, `saveSetting`…).
- **A refused call is "rejected with a console error".** Not "nothing starts", "the animation is
  not started" or "none of the list starts". What happens on a required value that is missing or
  wrong can be said once in the module's introduction when it is the same for every command.
- **Normal technical English throughout.** "Required", "rejected", "converted", "a console
  warning": the words technical documentation uses, not a paraphrase of them.

Found on the way and fixed at the owner's word, in all four runtimes (the WebView's and the Lua,
JavaScript and Python preludes), with a case for each in `scriptPreludeAgreement.test.js` and the
right answer pinned in `scriptMath.test.js`:

- `hslToHex` with a negative hue gave the wrong colour in the two JavaScript runtimes (-120 gave
  "#FF00FF", not "#0000FF"): their % keeps the sign, Lua's and Python's do not, so the runtimes
  disagreed. A negative saturation or lightness was not held at 0 (-10 gave "#738C8C").
- `random(1.5, 3.5)` could return 1, below lo: the ends were floored. Only whole numbers inside the
  range now, and a range with none (1.2 to 1.8) is refused.
- `randomFloat` with one number was between it and 1. It is now the top of a range from 0.
- `angleOf` of the same point twice gave 180 in JavaScript and 0 in Lua. It is 0.
- `mixColour`, `rgbToHex` and `hslToHex` read a value that is not a number as 0, and Python read
  "128" as 0 where the others read 128. Text that is a number is read as one everywhere, and
  anything else is refused. Left out is still 0.
- `snap` without a step and `lerp` without t returned NaN here and raised a Lua error there. They
  are refused, as is any of their numbers that is not one.

The refusals share one helper per runtime (`mathNumber` here, `__mnum` in each prelude), worded
"ce.math.hex: the red part is a number, and "x" is not, so there is no answer."

## `ce.anim`: state on 2026-10-22, for whoever continues

The owner reviewed `ce.anim` one item at a time and is tired of correcting the same wording again
and again. Read this section before writing a word.

### Write technical English, not prose

The owner rejected each of these, some more than once. Use the right-hand column.

| Not this | This |
| --- | --- |
| "nothing comes back", "gives nothing" | "returns no value", "no result" |
| "It must be given", "Required.", "Number required." | nothing: the type line beside the name shows "number, required" |
| "nothing starts", "the animation is not started", "none of the list starts" | "rejected with a console error"; "the entire list is rejected" |
| "Text containing a number is converted" | said once in the module introduction: "Number options also accept text that is a number, such as "500"." |
| "Not a number: the default, with a console warning" in every row | "Invalid: default." in the row; the warning rule once in the module introduction |
| "The shape of the move" | "Easing curve" |
| "How quickly the wobble dies away", "how fast it wobbles" | "Spring damping", "Spring oscillation frequency" |
| "Higher: settles sooner", "the wobble grows" | "0: undamped.", "Below 0: oscillation grows." |
| a sentence listing cases ("one below 0 is a jump of 1 ms, and anything else moves in the default time") | schematic parts, each "Label: value.", **one per line** (a `\n` in the text): `Range: ≥ 0.` / `0 or below: immediate jump.` / `Invalid: default.` |
| "Range: 0 or more", "Range: above 0" | `Range: ≥ 0.`, `Range: > 0.`, `Range: 0 ↔ 1.` (symbols, not words) |
| "Other values: "butt"", "Any other word draws…" | `Invalid: default.` (the owner: "The invalid:default is better") |
| several rules in one paragraph | one rule per line. The owner: "Short. Viewable in a glance. Users don't want to read whole texts. Every new rule must be on a new line." |

Two more rules from the same review:

- **Show the range whenever there is one:** `Range: 0 ↔ 1`, `Range: ≥ 0`, `Range: > 0`,
  `Range: x1, x2: 0 ↔ 1; y1, y2: -2 ↔ 3`.
- **A line break in a text is a rule of its own**, and every place renders it: the manual writes
  it as `<br>` in a cell or a list item (`cell()` and `lines()` in `generate-scripting-manual.mjs`),
  which GitHub renders and the app's Help lets through as the one tag (`utils/markdown.js`); the
  hover card uses `white-space: pre-line`; the API explorer turns it into `<br>`; the sidebar hint's
  tooltip shows it as it is. The schematic parameters of `ce.math` and `ce.midi` were split the
  same way, mechanically, before each "Label: value" sentence (63 texts).
- **Use the term the field uses** (easing, Bézier control points, damping, frequency, transport,
  tempo), not a description of it.

The module introduction (`MODULE_INTROS['ce.anim']` in `generate-scripting-manual.mjs`) now says
the rules every command shares, so no row repeats them:

- A required value that is missing or of the wrong type: the call is rejected with a console error.
- An option with a wrong value: a console warning, the first time only, and the fallback in its
  row is used.
- Number options also accept text that is a number, such as "500".

### Done and approved

| Item | Where |
| --- | --- |
| `ce.anim.to`: description, example, `path`, `target`, `opts`, two notes | `panelApi.js`, `animateTo` |
| `duration`, `beats`, `sync`, `delay`, shared by `to`, `spring` and `envelope` | `SHARED_OPTION_FIELDS` |
| `ce.anim.stop` | approved in the first batch |

`path` reads: "The value to animate, or a list of values. Colour property, or a control not on the
panel: rejected with a console error. List containing either: the entire list is rejected."

The owner was shown these in the running editor (Help, the hover card, the Values sidebar) before
approving. When the owner asks for a mockup, put the text into the working tree, regenerate the
manual and Help, and take screenshots with Playwright through `browser-checks/behaviourKit.mjs`
(`boot`, `fresh`, `make`; the hover card is `.ce-hover`, the sidebar `.bd-app`, Help
`.overlay-panel`).

### Made on the way, at the owner's word

- **Every parameter shows its type and whether it is required**, from the data (see "Decided on
  2026-10-22" above).
- **The hover card and the code's signature hint find a command written by its path**
  (`ce.anim.to`), not only by its short name (`animateTo`): 677 of the 774 commands had neither in
  the form scripts use. The card shows the description, the example, the parameters and the notes
  as separate parts.
- **ce.anim rejects a control the panel does not have**, which used to start a move that wrote an
  error on every tick and called `done` with true, and **says so for an empty path or list**, which
  returned false without a word. The fix is in both runtimes that run ce.anim: `startAnimationImpl`
  in `panelRuntime.js` and `ScriptRuntime::startAnimation` (through the host's new
  `namesMissingControl`, answered by `PanelValueModel`). The Lua, JavaScript and Python preludes
  pass a missing path as empty. Tests: `scriptAnim.test.js`, `PythonScriptEngineTests.cpp`,
  `PanelValueModelTests.cpp`. The release notes say it.

### Item 3: done

`animateTo`'s `curve`, `damping` and `frequency` rows, approved by the owner:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `curve` | text or list | "linear" | Easing curve: a name, or cubic Bézier control points {x1, y1, x2, y2}. Range: x1, x2: 0 ↔ 1; y1, y2: -2 ↔ 3. Invalid: linear. |
| `damping` | number | 6 | Spring damping (curve = "spring"). Range: 0 or more. 0: undamped. Invalid: default. |
| `frequency` | number | 12 | Spring oscillation frequency (curve = "spring"). 0: no oscillation. Invalid: default. |

The old `curve` text said x1 and x2 "are kept between 0 and 1". They are not: numbers outside the
range are rejected and the move is linear (`bezierOf` in `easingTables.js`).

Three decisions the owner made, each applied in both runtimes (the editor's `startAnimationImpl`
and `ScriptRuntime::startAnimation`), with the release notes saying so:

1. An invalid `curve` is a console warning, once per command, as every other option is
   (`warnAnimTiming` / `warnTiming`). It was an ordinary console line on every call.
2. `damping` below 0 is invalid: a warning, and the default 6. It made the oscillation grow without
   limit.
3. A `curve` that is neither text nor a list (`curve = 5`) warns the same way. It was linear in
   silence.

`ce.anim.spring`'s own `damping` and `frequency` rows take the same text without the "(curve =
"spring")" part, and both `frequency` rows say `Range: ≥ 0.` and `Below 0: sign ignored.` (the
formula is 1 - e^(-damping·x)·cos(frequency·x) in both runtimes, and cos is even).

### Item 4: done

`from`, `stagger`, `repeat`, `pingpong` and `done`, approved by the owner, in `SHARED_OPTION_FIELDS`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | number | current value | Start value.<br>Default: the current value.<br>Invalid: default. |
| `stagger` | number (ms) | 0 | Delay added per list entry: entry n starts n × stagger after the first.<br>Lists only.<br>Range: ≥ 0.<br>Invalid: 0. |
| `repeat` | number | 1 | Number of runs.<br>A fraction is rounded.<br>0 or below: repeats until stopped.<br>Invalid: 1.<br>Lua: `["repeat"] = 3` (repeat is a keyword). |
| `pingpong` | true or false | false | `true`: alternate runs play in reverse.<br>Requires repeat 0, or ≥ 2.<br>Invalid: false. |
| `done` | function | — | Callback at the end: done(completed).<br>completed: true after the last run or `ce.anim.finish()`; false after `ce.anim.stop()` or replacement.<br>List: called once, after the last entry; true only if every entry completed.<br>Invalid: no callback. |

Four edges where both runtimes were silent, unlike every other option, each decided by the owner
and applied in both runtimes with the module's one-time warning and the fallback in its row
(`scriptAnim.test.js`, `ScriptRuntimeTests.cpp`, `PythonScriptEngineTests.cpp`; the release notes
say so):

1. `from` = "abc" or `true` started from 0 or 1 (`Number()`). Warned; the current value is used.
2. `stagger` below 0 gave each entry a delay below 0, held at 0, and the warning named `delay`.
   Warned as a stagger; 0 is used.
3. `repeat` = "x" or `true` ran once in silence. Warned.
4. `done` = "x" or 5 was dropped in silence. Warned. The preludes own the functions and strip
   `done` before the call, so they pass one that is not a function to the runtime as `__badDone`,
   and the runtime says it (`ScriptRuntime::startAnimation`).

### `ce.anim.spring`: done

Approved as "Move a value to a new number with a spring motion.", with the example
`` `animateSpring("cutoff", 127)` moves cutoff to 127 with a spring, in 600 ms. ``, `to`'s `path`,
`target` and notes, an `opts` row that names what is left out (`Left out: duration 600, damping 6,
frequency 12.`, and `to`'s now says `Left out: curve "linear", duration 300.`), and every option
shown to the owner with its range. The owner asked to see every option of a command in its item,
the shared ones included, each with its range: do that for the commands left.

### `ce.anim.envelope`: done

Approved as "Move a value through a shape given as points.", with an example, `to`'s `path` and
notes, a `points` text of six lines (the shape, x with its range, y with its range and "not held",
a point's curve and the names it takes, the sorting and what is before the first and after the
last point, and fewer than 2 points), an `opts` row, `from` and `to` rows, and every shared option
with its range. A point's curve shapes the segment leading to it; an unknown name is linear, as
`ce.math.map` reads it, and that is documented rather than changed. Two decisions the owner made,
both applied in both runtimes and all three preludes, with the release notes saying so:

1. A `from` or `to` that is not a number was 0 or 1 in silence (and raised in Python). It is the
   default, with the warning; the preludes pass what they could not read as `__badFrom` /
   `__badTo`, as they pass `__badDone`.
2. Fewer than two points was a plain console line. It is an error, as every other rejection is.

### The eight small commands: done

`running`, `value`, `list`, `pause`, `resume`, `reverse`, `finish` and `play`, approved as one
table since each has one parameter: one sentence, an example, the parameter's text, and what the
call returns as the first note. `play` with a name left out said `no control named "undefined"`;
it says that no name was given, in the editor (the command is panel-window only).

**`ce.anim` is done.**

## `ce.draw`: done

Every command was probed at its edges first (the probe is the pattern of `drawShapes.test.js`'s
`run()`: a host panel with a Knob `K`, `scriptApiForTesting('K', …)`, then `drawCommandsFor('K')`
and the trace). The module introduction (`MODULE_INTROS['ce.draw']`) says once what every command
shares: commands add to what is there; a coordinate or size that is not a number is 0 with a
one-time warning; a shape wholly outside the control is a one-time warning; an option with a
wrong value is a one-time warning and its fallback; a required value missing or wrong is rejected
with an error.

Done, approved by the owner:

- `clear`: "Erase everything drawn on a control.", the example, `target` ("The control's name. /
  Left out: the control the script is attached to."), two notes. Two decisions: an unknown
  control, or no control to draw on, is rejected with an error (both returned false in silence),
  and `stroke`'s `dash`, `cap` and `join` with a wrong value are warnings, not errors, since the
  default is drawn: an error always means the call did nothing (`drawDash.js` severities).

- `fill`: "Set the fill colour for the shapes drawn after it.", the example, `colour` (a colour
  or a gradient; left out, "" or "none": no fill; not a colour: rejected, the fill stays), two
  notes. The colour forms every drawing command reads are one table in the introduction, shared
  by `fill`, `stroke` and `gradient`; the eight-digit panel form keeps its alpha here, unlike in
  `ce.math`.

- `stroke`: "Set the line colour and width for the shapes drawn after it.", the example, `colour`
  as `fill`'s, `width` with its range, `opts`, and the four options. The owner asked what "Other
  values: "butt"" meant and chose **`Invalid: default.`** for that case everywhere: a value that
  is not one of the words listed (a different word, the same word in capitals, a number) draws
  the default, with the one-time warning. ce.anim's `sync` and `pingpong` say `Invalid: false.`
  the same way. Two edges, warned about once now where they were silent: a `width` that is not a
  number above 0 (drawn as 1), and a `dashOffset` that is not a number (none).

- `rect`: "Draw a rectangle.", the example, `x`, `y`, `w`, `h`, `radius` with their ranges, two
  notes. Two decisions, for every shape command (`drawShapes.js`: `DRAW_REQUIRED`, `DRAW_SIZES`,
  `drawMissing`; `drawRejected` in the runtime): a required coordinate, size or text left out is
  rejected with an error (it drew at 0, or wrote no text, in silence), and a size or radius below
  0 is 0 with the one-time warning (it drew nothing in silence). The introduction says both.

- `circle`, `line`, `ellipse`: approved as one table (no decisions left: `rect`'s two rules cover
  them). One sentence, an example, each coordinate "in pixels from the control's left / top", each
  radius with `Range: ≥ 0.` / `< 0, or invalid: 0.`, and the two notes; `line`'s first note says
  the fill does not apply.

- `arc`: "Draw part of a circle.", the example, the centre and radius as `circle`'s, `from` (0 at
  twelve o'clock, clockwise, as the Meter's arcStart) and `to` (above from: clockwise; below:
  anticlockwise; 360 or more apart: a full circle, as `ScriptDrawOverlay`'s arcPath draws it), and
  the notes (a fill makes a pie slice through the centre).

- `gradient`: approved with two decisions, and then the owner said "I think you get the idea.
  Continue without abruption": the rest of the module was done the same way, without showing each
  item. "Make a gradient to use as a fill or stroke colour.", the example, `stops` (colours, { at,
  colour, opacity } tables, or a mix; at and opacity `Range: 0 ↔ 1`; fewer than two, not a list, a
  colour that is not one, or a position outside its range: rejected) and `angle` (0 up, 90 right,
  as the Background section's gradients; `Default: 180 (top to bottom).` / `Invalid: default.`),
  one note (returns a gradient for `fill()` or `stroke()`; rejected: no result). The two
  decisions: `stops` left out, not a list (text was read as its letters) or fewer than two colours
  is rejected with an error where it returned nothing in silence, in the sidebar's words too
  (`readDrawGradient` said it as a warning); an `angle` that is not a number is 180 with the
  one-time warning.

- The rest, in the same form (`panelApi.js`, and `drawShapes.js` for the readers: `drawOption`,
  `textSize`, `polygonSides`, `gridCount`, `gridStep`, `flatPointList`, `segmentList`;
  `drawShapes.test.js` for each edge; `RELEASE-NOTES.md` for the list a user reads). What was
  silent and is said now, as warnings where the default is drawn and errors where the call did
  nothing: `transform`'s options that are not numbers (the default), and `cx` without `cy` or the
  reverse (about the top-left corner); `image`'s `fit` that is not one of its words ("fill");
  `text`'s and `measure`'s `size` not above 0 (12); `measure` with no text (rejected; it measured
  "") and a pixel `scale` it cannot use (1); `polygon`'s `sides` below 3, a fraction or no number
  (3, or rounded) and a `rotation` that is not a number (0); `grid`'s count given with a spacing
  (the count wins), a fraction of a count (rounded), a count or spacing it cannot use (ignored),
  and its box numbers (read as every shape's); `path` with fewer than two points or no list
  (rejected), a pair that is not two numbers or a trailing value (left out); `lines`' item that is
  not a segment (left out); `batch` with no function (rejected); `redraw` with a name the panel
  does not have (named); `blend` with no mode (rejected; it was "normal"); `clip` with some of its
  four numbers left out (rejected; the missing ones were 0, which hid everything after it).
  `opacity`'s `a` is optional in the data now, as it always was in the runtime (left out: solid).
  `curve`'s and `path`'s `closed` say `Invalid: false.`; `blend` and `image`'s `fit` say
  `Case-sensitive.` as `stroke`'s `cap` does. The phrase "with a console warning the first time"
  is not repeated in the option rows: the introduction says it once, and the rows say the fallback.

`ce.draw` is done.

## `ce.time`: done

Done the same way, without showing each item (the owner's "continue without abruption" on
`ce.draw`): the 22 commands in the module's form, every parameter and option with its range, and
the module introduction (`MODULE_INTROS['ce.time']`) saying once what every command shares: beats
are quarter notes and bars and beats count from 1; a required value left out is rejected; a number
outside its range is the nearest end, and one that is not a number the fallback in its row, each
with the one-time warning; number arguments take text that is a number, a timer's interval or
delay does not (`timeRefused` refuses "250", since two runtimes could not read it).

The silences ended, in all four runtimes (`panelRuntime.js`, and the Lua, JavaScript and Python
preludes in `CE/src/Scripting/*ScriptEngine.cpp`; `scriptPreludeAgreement.test.js` holds the four
to the same words, with the sandboxes given a tempo so an accepted sync timer arms):

- A number a helper cannot do without, left out, is rejected with an error (`timeWords.js`:
  `rejected`, and `optional` on `beatsPerBar`, `max` and `bpm`, which keep their defaults). It
  was the default without a word: `position()` was bar 1, `beatsToMs()` 0 ms, `swing(1)` no
  swing. The first argument left out is said, alone. This reverses a decision an earlier session
  recorded in `timeWords.js` ("an argument left out is its default without a word"); the owner's
  rule for a required value left out is the one followed.
- `startTimer` and `syncTimer` with no id (or "") are rejected; `syncTimer` started a timer called
  "". `stopTimer` with no id is rejected; an id that is not running is not a mistake.
- `after` and `afterBeats` with no function say so in the call's own name, as an error; it was a
  plain line in `after`'s words. No tempo to work from is an error for `syncTimer` and
  `afterBeats`; it was a plain line, and the call did nothing.
- `tap` and `clockTempo` reject a list that is not one; an item that is not a number above 0 is
  left out and said once, and `tap`'s `resetMs` that is not a number above 0 is 2000 and said once
  (0 or below made every gap "after a pause", so there was never a result).

Not changed, and documented as it is: a query with no result (`tempo()` with nothing supplying
one, `tap` with fewer than two usable taps, `clockTempo` with an empty list, the conversions with
no tempo) returns nothing without a word; `stopTimer` with an id that is not running says nothing;
`syncTimer`'s `follow` that is not true or false is true (`Invalid: true.`).

## `ce.components.lcd`: done, and the component generator with it

The component modules are data, not prose: `componentVerbs.js` declares each family's verbs (field,
kind, range) and `panelApi.js` expands them into members, so their texts are generated. Rewriting
`ce.components.lcd` meant rewriting the generator, and every component verb (about 400) took the
form at once:

- `verbSummary`: one sentence from the kind and the field's name in words ("Set the scroll speed.",
  "Switch the backlight on or off.", "Name the control that drives the value."), a verb's own `doc`
  winning. The five every family gets (`read`, `size`, `fill`, `insert`, `remove`) have one sentence
  each and their detail in `notes`.
- `verbExample`: `` `ce.components.lcd.brightness("Screen", 80)` sets the brightness to 80. `` from
  the kind and a sample inside the range, a verb's own `ex` ([arguments, gloss]) winning; the
  family's `sample` names the control in them ("Screen" for the LCD).
- `verbNotes`: what the call returns, a verb's own `notes` first. Reworded at the owner's word on
  2026-10-24 (`RETURNS_SET`, `RETURNS_TRUE`, `RETURNS_VALUE`): "Returns true. Already set: true,
  with a console line." / "Rejected: false, with a console error. Nothing changes." for a verb that
  sets something; "Returns the value." / "Rejected: no result, with a console error." for `read`
  and `size`. It said "Returns true; already that way: true, with a line in the console."
- `verbParamSummary`: each parameter's text, one rule per line, by kind and place: the target
  ("The LCD Display's control, by name. / Not an LCD Display: rejected…"), a number's `Range: lo ↔
  hi.` with "Outside the range: the nearest end." (the reducer clamps) and "Invalid: rejected",
  a whole number's "A fraction: rounded.", an enum's `One of "off", "left" or "right". Case-sensitive.`,
  a toggle's "Left out: toggles.", an index's "counted from 1", a link's "Left out, or "":
  unlinked.", the LCD line's cut and blank-cell warnings; a verb's own `argDocs[name]` winning. A
  range of ±1e9 (the LCD's value) is shown as none.
- The LCD's 37 verbs have their own `doc` (and `ex`, `argDocs` where the generated text is not
  enough), from the renderer's reading of each field: scrollSpeed in characters per second,
  blinkRate in milliseconds, animSpeed as a multiple of normal speed, the value tokens.
- One silence ended, for every family: a text verb called with no text wrote "" (`coerce` STR);
  it is rejected ("No text was given."), and "" given on purpose is still written.

The manual's component chapter lists each family's summary and its verb names only (the texts show
in the picker, the hover card, the sidebar hint and the API explorer), so no `MODULE_INTROS` entry
was needed. `componentVerbs.test.js` holds every component verb to the form (an example in code
marks, a note on what it returns, a text per parameter whose every line is a rule) and the LCD's
texts to their words; the one-sentence check is on the generated sentences and the LCD's, since the
other families' hand-written `doc`s are the modules still to do.

**For the remaining component modules**, the work is therefore per family: read its `doc`s and
replace the prose ones (`verbSummary` already covers a verb with none), add `ex` where the generated
example reads mechanically, `argDocs` where a parameter means more than its name, and a `sample`
control name; probe its reducer edges (they share `componentScriptPatch`, so most are done); then
widen the one-sentence check in `componentVerbs.test.js` to that family. Next by the table:
`ce.components.arp` (30 descriptions, 15 that need the most work).

### The owner's review, one item at a time

`ce.components.lcd` was merged (#69) without the owner seeing its items; the owner's "Ok, next
module?" was taken as the "continue without abruption" of `ce.draw`. On 2026-10-24 the owner asked
for it to be gone through one item at a time, as a new module is. The queue, from a read of every
LCD text against the rules above and a probe of each verb's edges in the runtime:

1. `cursorAt`: done, below.
2. `blinkRate`: done, below.
3. `blink`: done, below.
4. `animPreset`: done, below.
5. `valueMin` and `valueMax`: kept as merged, below.
6. `glyph`: done, below.
7. `text`: done, below.
8. Parameter texts that are only the name: done, below.
9. `showGhost`, `showGlass`, `showScanlines`, `showGrid`: done, below.
10. The notes every family shares: done, below.
11. `backlightSource`: done, below.
12. The manual: done, below.
13. Case "everywhere": done, below.
14. `animSpeed`: done, below.
15. `clear`: done, by the LCD's script model, below: `clear("Screen", 2)` blanks row 2. That
    every verb drops an argument it does not take, without a word, is wider than the LCD and is
    not on this queue unless the owner puts it there.

**Item 1, `cursorAt`: done.** Three decisions the owner made, from the probe:

- A column or row past the display (`cursorAt("Screen", 40, 9)` on 2 x 16) was stored and the
  cursor drawn nowhere; the range was 1 to 256 whatever the display. It is the display's last
  column or row now, with the one-time warning, rather than refused as `text` refuses a row the
  display does not have: a script stepping the cursor right stops at the last column. The spec
  says so with `fit: { cursorCol: 'cols', cursorRow: 'rows' }`, which `axisRange` reads in the
  reducer, in `componentClampWarning` (which the runtime now hands the control's settings) and in
  the parameter's text ("Range: 1 ↔ the display's columns.").
- One number given that is not a number (`cursorAt("Screen", "x", 2)`) moved the row, dropped the
  "x" without a word and returned true. The call is refused with a console error ("\"x\" is not
  a number.") and moves nothing. This is the XY kind's rule, so `joystick.move`, `timbre.move`,
  `kinetic.launch`, `kinetic.velocity` and `constellation.probe` follow it too. Either number may
  still be left out, so both are optional in the data (`verbArgOptional`): the type line said
  "number, required" beside "Left out: unchanged."
- A fraction (2.6) was stored as 2.6, read back as 2.6 and drawn at 3. A one-based axis is rounded
  when written.

The inspector's Cursor Row and Cursor Col counted from 0 ("0-based") where the script counts from
1; at the owner's word they count from 1 now and stop at the display's size (`DisplayEditor.svelte`).

The owner asked why the text as merged was better than the one proposed. It was better in two
ways, both kept: every rule about a parameter sat in its own row, where the sidebar hint shows it
on the parameter's name (the proposal had moved "Both left out" into the notes, which the hint does
not show), and its range line had no bracket ("16 by default" went). It was wrong in four, after
the decisions: "required", "1 ↔ 256", "invalid: unchanged", and no word on a fraction. As written:

| Field | Text |
| --- | --- |
| `col` (number, optional) | Column, counted from 1. / Range: 1 ↔ the display's columns. / A fraction: rounded. / Outside the range: the nearest end. / Left out: unchanged. / Invalid: rejected with a console error. / Both left out: rejected with a console error. |
| `row` (number, optional) | The same, with "Row" and "the display's rows". |
| notes | The cursor shows only when `cursor()` is set to "block" or "underline". Default: "off". Then the two every verb has. |

**Item 2, `blinkRate`: done.** The text said "Period in milliseconds" and its example "250 blinks
four times a second". The renderer lights the text for `blinkRate` ms and darkens it for as long
(`Math.floor(frameTime / rate) % 2`; the inspector's hint said "half-cycle"), so 250 blinks twice a
second. What the number means is kept: the full cycle would make every saved panel blink twice as
fast. Two decisions the owner made: the range is 60 ↔ 5000, since the renderer draws nothing faster
than 60 and the inspector's minimum was 60 (55 was stored, read back as 55 and drawn as 60; it is
60 with the one-time warning now), and the inspector's Blink Rate stops at 5000 as a script does.

| Field | Text |
| --- | --- |
| Description | Set how fast the text blinks. |
| Example | `ce.components.lcd.blinkRate("Screen", 250)` shows the text for 250 ms, then hides it for 250 ms: two blinks a second. |
| `blinkRate` (number, required) | Time on, then the same time off, in milliseconds. / Range: 60 ↔ 5000. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| notes | Has an effect only while `blink()` is on. Default: off. / The cursor blinks at its own fixed speed. / Then the two every verb has. |
| Inspector hint | Time on, then off, in milliseconds. |

**Item 3, `blink`: done.** "Switch blinking of the whole display on or off." was wrong: the
renderer hides only the lit glyphs on the off phase, and draws the unlit segments, the backlight,
the cursor, images and animations throughout. The owner's decision, for every on/off verb of every
component (134, through `coerce` BOOL and the Arpeggiator's `mute` set; `isOff` in `componentVerbs.js`): the
text "false", "off" and "0", in any case and with spaces around it, is off, as `false`, 0 and ""
are. Any text but "" was on, so `blink(t, "false")` and `blink(t, "OFF")` switched it on. Every
on/off parameter's text says it: `0, "", "false", "off" or "0": false. Case-insensitive.` / `Any
other value: true.` (`OFF_RULE`).

| Field | Text |
| --- | --- |
| Description | Switch the text blinking on or off. |
| Example | `ce.components.lcd.blink("Screen", true)` makes the text blink. |
| `blink` (true or false, optional) | true: the text blinks. / false: the text is steady. / Left out: toggles. / 0, "", "false", "off" or "0": false. Case-insensitive. / Any other value: true. |
| notes | Only the text blinks: the backlight, the unlit segments, the cursor, images and animations stay. / The speed is set by `blinkRate()`. Default: 500 ms on, then 500 ms off. / Then the two every verb has. |

**Item 4, `animPreset`: done.** Any word was stored ("bogus", "RAIN", 5) and returned true, and
the display drew nothing for a name `presetInto` does not know. Two decisions the owner made:

- An unknown name is refused with a console error that lists the six, as `scroll` and `cursor`
  refuse one: `animPreset` is an enum now, for the LCD and the Pixel Display alike, its list
  `ANIM_PRESETS` in `componentTables.js`.
- Case does not matter, "everywhere". For the component verbs that is every list of words
  (`coerce` ENUM through `wordIn`: any case, spaces trimmed, stored as the list spells it; the text
  says `Case-insensitive.` where it said `Case-sensitive.`), and the verb names `read`, `size`,
  `fill`, `insert` and `remove` take (`familyVerbNamed`, which also stops "toString" finding
  Object's own). The Values sidebar takes "LEFT" for a component verb (`readEnum`'s `anyCase`).
  Control names and element names are not touched by it. (This said they "stay exact"; they were
  matched in any case already, and still are.) The rest of the API is the next item.

| Field | Text |
| --- | --- |
| `animPreset` (options, required) | One of "wave", "scanner", "rain", "starfield", "spinner" or "plasma". Case-insensitive. / Invalid: rejected with a console error. |
| notes | Plays only on a graphic display, while `anim()` is "preset". / Then the two every verb has. |

Found on the way, for the queue: `animSpeed`'s range is 0 ↔ 16 in a script and 0.1 ↔ 5 on the
inspector's preset Speed.

**Item 5, `valueMin` and `valueMax`: kept as merged**, at the owner's word: the parameter lines
proposed ("The value at 0 % and an empty bar.", the reversed range, the equal pair) and the notes
on {value} and a value outside the range were worse than the text as it stands. Texts and
behaviour are unchanged: a minimum above the maximum is still a reversed range, accepted without a
word, and an equal pair still gives {pct} 0 and an empty bar.

**Item 6, `glyph`: done.** Three decisions the owner made, from the probe:

- A character that is not a cell ("abc", "#x###") was stored and the slot drew nothing. It is
  refused with a console error that names it.
- The "|" was dropped and the rest read five at a time, so a short row ran into the next: "#|#|#"
  lit three cells of the top row. Each row between "|" is read on its own and padded to five
  (`parseGlyph`). A flat string without "|" is read five at a time, as before; the inspector writes
  full rows, so no saved panel draws differently.
- More than eight rows, or a row longer than five, was cut off without a word. It is refused with a
  console error ("It has 9 rows, and a glyph has 8.", "Row 1 has 6 cells, and a row has 5.").

The three refusals are `glyphBitsRefusal` in `utils/lcdUserGlyphs.js`, which the verb names as its
`refuseValue`; an ITEM verb with one refuses, in the reducer, the legality check and the reason
alike, what it names.

| Field | Text |
| --- | --- |
| `bits` (text, required) | Eight rows of five: "#" lit, "." unlit, rows separated by "\|". / Shown in a line by \x00 to \x07 for slots 1 to 8. / "1" and "0": the same as "#" and ".". / Fewer than eight rows, or fewer than five cells in a row: the rest unlit. / Empty, or nothing lit: the slot is cleared. / Other characters: rejected with a console error. / More than eight rows, or a row longer than five: rejected with a console error. |

Description, example and `index` unchanged.

**Item 7, `text`: done.** Two decisions the owner made, from the probe:

- A fraction of a row was rounded without the text saying so: 1.5 wrote row 2, 0.5 row 1, and 2.5
  on two rows was refused. `indexOf` does it for every number counted from 1, so a glyph slot, a
  pad, a step and a lane round alike. Kept, as `cursorAt` rounds, and every such parameter says
  "A fraction: rounded." after its first line: the 37 indexed verbs (line, item, cell, the
  Arpeggiator's `mute` set, and the glyph slot's own text) and each family's `read`, `insert` and
  `remove`, which take a position counted from 1 and round it too. The hand-written families'
  zones, slots and cells are their modules' reviews.
- Text left out (`text("Screen", 1)`, or nil/None/null) blanked the row and returned true under a
  type that says "required". It is refused with "No text was given.", as every text verb's is;
  `""` still blanks a row on purpose.

| Field | Text |
| --- | --- |
| `row` (number, required) | Row, counted from 1. / A fraction: rounded. / Not a row the display has: rejected with a console error. |
| `text` (text, required) | The four lines as merged, then: Left out: rejected with a console error. |

Description and example unchanged.

**Item 8, texts that were only the name: done.** Eight parameters said their own name and nothing
else ("Brightness.", "Value prefix."); `valueMin` and `valueMax` stay as merged (item 5). Each first
line now says what the setting is, and the probe added what it found unsaid. Three decisions the
owner made, each the recommendation, all texts and no change to behaviour:

- `editText` from a script is stored as given: the field's character set (upper case by default)
  and its length (16) govern typing at the screen. A script may set a name read from the synth.
- A linked control wins: while `brightnessSource()` or `valueSource()` links one, the script's
  `brightness()` or `value()` is stored and the control sets what is shown. Said in a note.
- Brightness 0 is not dark (the lit text is drawn at 35% + 65% of it), and the text says so; the
  drawing is as it was.

| Parameter | Text |
| --- | --- |
| `brightness` | How bright the lit characters are. / Range: 0 ↔ 100. / 0: the dimmest, still lit. / Outside the range: the nearest end. / Invalid: rejected with a console error. Note: While `brightnessSource()` links a control, that control sets the brightness. |
| `contrast` | How visible the unlit segments are. / Also how strongly the backlight glows. / Range: 0 ↔ 100. / 0: unlit segments hidden. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| `value` | The number shown. / Outside valueMin ↔ valueMax: shown as it is; `{pct}` and `{bar}` stop at the ends. / Invalid: rejected with a console error. Note: While `valueSource()` links a control, that control sets the value and its range. |
| `valuePrecision` | Decimal places `{value}` shows. `{pct}` is always whole. / then its range lines. |
| `valuePrefix`, `valueSuffix` | Text before (after) the number in `{value}`. Not used by `{pct}` or `{bar}`. / A number: written as text. / Left out: rejected with a console error. |
| `editText` | The text in the field. / Not held to the field's characters or length: those apply to typing. / A number: written as text. / Left out: rejected with a console error. |
| `animFps` | Frames per second. / Only for a sprite sheet: a GIF or APNG plays at its own speed. / then its range lines. |

The Pixel Display's `brightness`, `contrast`, `editText` and `animFps` say only their names too;
they are that module's review.

**Item 9, the four overlays: done.** "Show or hide the ghost." said nothing of what the ghost
is, and `showScanlines`' example said "if it is hidden" of a plural. The four are declared in the
LCD's family now, rather than derived from the model (`derivedFlagVerbs`), for what each is. Two
decisions the owner made, each the recommendation:

- The example generator (`toggleGloss`) gives a plural name "they" and "them": "shows the
  scanlines if they are hidden, and hides them if they are shown", "switches the zones on if they
  are off". Thirty-one examples across the components changed, in grammar only.
- The grid is "between the cells or pixels": a graphic display draws it between pixels.

| Command | Description | Note |
| --- | --- | --- |
| `showGlass` | Show or hide the glass: a sheen across the screen. | Its tint is set in the inspector, under Colour ▸ Glass. Default: shown. |
| `showGhost` | Show or hide the ghost: the faint unlit cells behind the text. | How faint is set by `contrast()`. Default: shown. |
| `showScanlines` | Show or hide the scanlines: thin horizontal lines across the screen. | Default: hidden. |
| `showGrid` | Show or hide the grid: faint lines between the cells or pixels. | Default: hidden. |

The Pixel Display's four are still derived, and say only their names: that module's review.

**Item 10, the notes every family shares: done.** `read`'s note named a `"step"` list, `size`'s a
`"node"` one and the Mod Matrix, on all 23 components, and only the Turing Machine, the Orbit and
the Mod Matrix have each; eight components have no lists at all and their `read` note described
reading one. `fill`'s example passed a `values` never shown, and its note said "One document
change". Two decisions the owner made, each the recommendation:

- The texts are made from each component's own lists, for all 23 (`familyNotes` and `sampleList`
  in `componentVerbs.js`): `read` and `size` name the first list by name, a grid answers in rows
  and columns, a Pixel Display's elements are read by name, and a component without lists has only
  the first sentence of `read`'s note.
- `fill`'s example writes its list out, as `ce.draw`'s do, in the first list's own kind of value:
  `{"PATCH 12", "VOL 100"}` on the LCD, `{0.25, 0.5, 0.75}` for steps, `{true, false, true}` for
  lanes, `{{0.5, 0}, {0, 0.5}}` for the Mod Matrix.

| Field, on the LCD | Text |
| --- | --- |
| `read` note | `read(target)`: every setting as a table, by verb name. `read(target, "glyph")`: the whole list; `read(target, "glyph", 3)`: one glyph, counted from 1. |
| `size` note | `size(target)`: every list as a table, by verb name; `size(target, "glyph")`: one number. |
| `fill` example | `ce.components.lcd.fill("Screen", "text", {"PATCH 12", "VOL 100"})` writes rows 1 and 2. |
| `fill` note | One undo step for the whole list, instead of one per element. |

**Item 11, `backlightSource`: done.** Its refusal line said "Not on this panel, or not a control
on this panel": any control can drive the backlight, so the second half only repeated the first.
The text never said when the backlight is on, and the example drove it with a knob called Cutoff.
Two decisions the owner made, each the recommendation:

- A control lights the backlight while it is on, or at or past halfway along its range
  (`backlightOnFrom` in `utils/lcdZones.js`, which the preview uses for the LCD and the Pixel
  Display alike). It was 0.5 of the control's own number, so a knob from 0 to 127 lit it at 1 and
  one from -64 to 63 stayed dark up to 0. A saved panel that links a knob switches at a different
  point; a switch or a button is as it was. The inspector's hint says the same.
- The example is a switch called Light, on both displays.

| Field | Text |
| --- | --- |
| Example | `ce.components.lcd.backlightSource("Screen", "Light")` makes the control called Light switch the backlight. |
| `name` | The driving control's name. / Left out, or "": unlinked. / On while the control is on, or past halfway. / Not on this panel: rejected with a console error. |

**Item 12, the manual: done.** Its component chapter gave each component one line, a summary and
its commands' names, so the texts the picker, the hover card and the API explorer show were in the
manual nowhere. At the owner's word ("Full entries"), every component command has a full entry now,
as every other module's has: 499 of them, under a heading per component (`#### ce.components.lcd:
LCD Display`) inside its group (`componentChapter` in `generate-scripting-manual.mjs`). The ones
not yet reviewed print what the generator writes for them today, which is what the picker shows.

What it costs: the manual went from 256 KB to 568 KB, and the in-app help bundle from about 470 KB
to about 780 KB. The help overlay loads the bundle the first time it opens, not at start-up, so
`helpDocs.test.js`'s guard (which said the bundle sat in the eager entry chunk) was corrected and
raised from 600 KB to 1 MB.

**Item 14, `animSpeed`: done.** A script could set the preset speed from 0 to 16, and the
inspector's preset Speed (and a Pixel element's speed) runs from 0.1 to 5. The graphic canvas reads
it as `Math.max(0.05, Number(animSpeed) || 1)`, so 0 played at normal speed and 0.02 at 0.05, which
the text had to say and the inspector could not show. At the owner's word scripts take the
inspector's range, 0.1 ↔ 5, on the LCD and the Pixel Display alike; past it, the nearest end with
the one-time warning. A script that set 8 plays at 5. The text loses its two lines about the low
end: "Speed factor. / Range: 0.1 ↔ 5. / 1: normal. / Outside the range: the nearest end. /
Invalid: rejected with a console error."

**After the queue: "line" wording, done.** The model says "row", and five texts still said "line":
`scroll`'s description and example ("the rows"), `value`'s and `glyph`'s examples and `glyph`'s
`bits` ("in a row"), `layout`'s "A display without layouts: 1, its own rows." (and its refusals),
and the family's summary, "Write to a character LCD by layout, row and column, plus backlight,
brightness and scrolling." `scroll` gained two notes, because "the rows scroll" would have been
untrue on a display with layouts: "Only a row longer than the display moves." and "On a display
with layouts: no effect. A zone set to scroll does so at `scrollSpeed()`." (A layout's rows are
composed at the display's width, and the renderer moves only a row longer than that.)

**Item 13, case everywhere: done**, module by module, one commit each (ce.ui, ce.draw, ce.image
and ce.text, ce.panel with the hand-written component verbs, ce.anim, ce.math, ce.midi, ce.music
with ce.time, ce.storage with ce.device and ce.core), the owner having agreed the split: a word
from a list the app defines is read in any case; a name an author makes up is matched as it was.

- One helper per runtime: `listWord(values, value)` in `utils/wordLists.js` (the list's spelling,
  or null), `__word` beside `__steps` in each prelude, and `animCurveName` / `formWord` on the C++
  side (`ScriptRuntime.cpp`, `BridgeScriptHost.h`). Where every word in a list is lower-case
  (`ce.math`'s names, the storage scope, the byte order), the runtimes compare trimmed and
  lower-cased.
- Reversed on the way: `ce.draw`'s "Case-sensitive." on `cap`, `join`, `fit` and `blend`, which the
  owner had approved; note names' "a capital letter" (the refusal says "a letter from A to G" in
  every runtime, and "H4" is the unreadable example in the tests where "c4" was); `get`'s form in
  another case, refused with "Write normalizedValue" (another spelling, ".normalizedValue" or
  "normalised", still is).
- Already any case, and left: `ce.time`'s divisions, `ce.device`'s type, encoding, direction and
  filters, crossfade's law, a checksum's name, `sendTransport`'s action, the image layer, colour
  names.
- The Values tab reads every list in any case (`readEnum`'s `anyCase` defaults to true), except a
  value written straight into a property, which the renderer reads only as it is spelled.
- Verified: the full web suite, `scriptPreludeAgreement.test.js` for every prelude change, and the
  C++ targets that run the preludes and the host (ScriptRuntime, PlayerScriptIntegration,
  PythonScriptEngine with Python 3.13, PanelValueModel), built and run with GCC. MSVC has not seen
  the C++ changes; CI will.

Not done, and noted for the owner: an unknown `ce.ui` kind still falls back to "info" without a
word, and `ce.image.icon`'s fit still stores an unknown word as it is; both are those modules'
reviews.

### The LCD's script model

Item 15 raised it. The owner read `clear("System1", 2)` as "page 2" as readily as "row 2", and
asked for the whole of the LCD's scripting to be rethought as display → page → row → character.
The owner's five decisions, 2026-10-24, from the proposal:

1. Every display has pages. A display without layouts has one: its lines.
2. A script writes a page's own text, drawn where no zone paints. Zones keep showing their
   controls.
3. A position is one table, every part optional: `{page = 2, row = 4, col = 15}` in Lua,
   `{page: 2, row: 4, col: 15}` in JavaScript, `{"page": 2, "row": 4, "col": 15}` in Python. The
   bare forms stay: `text(t, row, text)`, `clear(t)`, `clear(t, row)`.
4. A page left out is the page showing.
5. The Pixel Display has the same pages.

The facts it is built on. A display without layouts draws `lines`, one text per row. A display
with layouts draws the page showing from its zones (`composeLayout`, which starts from a blank grid
and paints each zone's region) and never shows `lines`. A page stores no characters. Which page
shows is decided as the panel runs: a soft key's `{ layout }` press (`lcdPressedLayout` in
`PanelPreviewSurface.svelte`, transient), an overlay, the Selector's value, the default, with a
page's `timeoutMs` returning it; in design mode, the inspector's Edit/Preview layout. Component
verbs run only with the panel window open (the preludes' webview-only stubs), so the page showing
is always there to ask.

Then, from the owner's later answers: **the word is "layout"**, the inspector's own, so nothing in
it was renamed (its Layouts are the screens and its Pages the rules that switch between them, and
"page" in a script would have meant the one while the inspector said the other); and **a range is
a list**, `col = {5, 10}`, because "col = 5, 10" cannot be written in a table (Lua reads the 10 as
an entry of its own; JavaScript and Python refuse it). Open points a to e below were not answered
one by one: the owner's go-ahead was on the summary that carried them, so their recommendations
hold.

**The model, as built** (`scripting/lcdPositions.js`):

- **A layout** is addressed by its number in the inspector (counted from 1) or its name (in any
  case and trimmed, as a control's name and a pixel element's are matched). A number is a
  position, text a name, and text that names no layout but reads as a number is that number. A
  display without layouts has layout 1: an LCD's lines, a Pixel Display's elements.
- **A layout's text** is stored on the layout as `lines`, one string per row, saved as the
  display's `lines` are. `composeLayout` starts from it, so a cell no zone paints shows it, with
  `{value}`, `{pct}` and `{bar}` filled in. It never scrolls: a layout's rows are composed at the
  display's width. Panels that already have layouts are not changed (they carry default lines
  nobody sees, which would appear under their zones); "+ Enable" gives the first layout the lines,
  so the screen does not go blank when an author turns layouts on.
- **The position** is a row number, or a table of `layout`, `row` and `col` (the names in any
  case). `row` and `col` are a number or a range; each counted from 1, a fraction rounded. A part
  the display does not have is refused with why; a range past its edge stops there, said once.
  Another key (`{pg = 2}`), an entry without a name (Lua's `{row = 2, col = 5, 10}`), a list for
  the whole position, a range that is not two numbers or runs backwards: refused with why.
- **The layout showing** comes from the preview, through `stores/displayLayouts.js`, which the
  preview provides while it is mounted: the same answer it gives the renderer. With no preview,
  the layout the design canvas shows (the inspector's Edit / Preview Layout).

| Call | Does |
| --- | --- |
| `text(t, 2, "VOL")` | Row 2 of the layout showing: replaced. On a display without layouts, as before. |
| `text(t, {layout = 2, row = 4}, "VOL")` | Row 4 of layout 2: replaced. |
| `text(t, {row = 4, col = 15}, "X")` | From column 15 of row 4: written over, the rest of the row kept, as a hardware LCD prints at its cursor. |
| `text(t, {row = 4, col = {5, 10}}, "VOL")` | Into columns 5 to 10: padded with blanks, or cut at 10. |
| `text(t, {layout = 2}, "VOL")`, `text(t, {row = {1, 2}}, "VOL")` | Rejected: text writes one row. |
| `clear(t)` | The layout showing's text: blanked. |
| `clear(t, 4)`, `clear(t, {row = 4})` | Row 4 of the layout showing. It blanked every row, the 4 dropped. |
| `clear(t, {layout = 2})`, `clear(t, {col = {1, 3}})` | All of layout 2's text; columns 1 to 3 of every row. |
| `clear(t, {layout = 2, row = 4, col = 15})` | One character. |
| `read(t, "text")`, `read(t, "text", 2)`, `read(t, "text", {row = 4, col = {5, 10}})` | Every row, one row, columns of one; one `col` is one character. |
| `layout(t, 2)`, `layout(t, "Edit")` | Shows it as a soft key does (`lcdPressedLayout`, and the layout's timeout), until a soft key, an overlay or the Selector changes it. Not written to the panel. New, on the LCD and the Pixel Display. |
| `read(t, "layout")` | The number of the layout showing; 1 without layouts. New. |
| `fill(t, "text", {...})`, `size(t, "text")` | The layout showing's rows. |

`clear` takes away only text: a zone still shows its control. On a display with layouts,
`text(t, 2, "VOL")` wrote `lines` nobody saw and warned so; it writes the layout showing now. The
Joystick's `cornerLabel`, the other LINE verb, is as it was. The Values tab reads a position and a
layout as the runtime does.

**The open points, as built:** (a) the inspector's Text rows (Row 1, Row 2, ...) edit the text of
the layout being edited once there are layouts, and every list of layouts shows its number
("1 · Home"); (b) `read(t, "layout")` gives a number, as names can repeat; (c) tokens filled in,
no scrolling; (d) the cursor stays one per display and `cursorAt` is as it was; (e) the Pixel
Display's element verbs stay by name.

| Field | Text |
| --- | --- |
| `text` description | Write one row of the display. |
| `text` `at` (number or table, required) | Row, counted from 1, of the layout showing. / Or a table: {layout = 2, row = 4, col = 15}, `layout` and `col` optional. / `layout`: its number, counted from 1, or its name. Left out: the layout showing. / `col`: written from that column on, the rest of the row kept. / `col` as a range {5, 10}: written into those columns, padded with blanks or cut. / A fraction: rounded. / A range past the display: to its last column. / Not on the display: rejected with a console error. |
| `text` `text` | The text. / Longer than the display: cut at its width, with a console warning the first time. / On a display without layouts that scrolls: scrolled in instead. / The other three lines as they were. |
| `text` notes | On a display with layouts: written on the layout, shown where no zone paints. |
| `clear` description | Blank the layout showing, or part of it. |
| `clear` `at` (number or table, optional) | As `text`'s, with `row`, `col`: a number, or a range {5, 10}. Left out: every row, every column. / Left out: the whole layout showing. |
| `clear` notes | Only text is blanked: a zone still shows its control. |
| `layout` `layout` (number or name, required) | Its number, counted from 1, or its name. / A name: case-insensitive. / A fraction: rounded. / A display without layouts: 1, its lines (its elements). / Not a layout of the display: rejected with a console error. |
| `layout` notes | Shown as a soft key shows it: until a soft key, an overlay or the Selector changes it, or its own timeout returns it. (Pixel: until an overlay or the Selector changes it.) / `read(target, "layout")` gives the number of the layout showing. |
| `read` `index`, the LCD's | One line more: For "text": a row or a table, as `text()` takes it. |

Then items 8 to 14, one at a time.

### Zones by name

**Built, 2026-10-25**, after the owner's "1, 2 and 3 as recommended" on the proposal: six commands,
one per property, and a name reaches every zone carrying it on every layout, as a Pixel Display's
element names do. The Pixel's helpers (`utils/pixelElements.js`) take the list's key, `elements` or
`zones`, so one set of rules decides what a name reaches on both displays; the verbs are ELEM verbs
with `list: 'zones'` in `componentVerbs.js`.

- **The zone table has a Name column**, after the zone's number. The name is never drawn.
- **Names match in any case.** "Cutoff" on one layout and "cutoff" on another are one zone to a
  script, so `read` lists the name once, as first spelled, and so does a refusal's list of the
  names there are. (This was not true of the Pixel's elements either; it is now, for both.)
- **An unnamed zone answers to its id** (`z_…`), the Pixel's rule. The proposal said such a zone
  "can't be reached"; the id is shown nowhere in the inspector, so in practice it cannot, but
  `read(t, "zoneText")` lists it under its id.

| Command | Does |
| --- | --- |
| `zoneText(t, "Title", "VOL")` | A fixed-text zone's text. |
| `zoneLabel(t, "Cutoff", "CUT")` | The name a name zone shows in place of its control's; `""`: the control's own. |
| `zoneShow(t, "Cutoff" [, on])` | Shown or hidden; left out, toggles from the first zone's state. A zone without `visible` is shown. |
| `zoneAt(t, "Cutoff", {row = 2, col = {1, 8}})` | Moves it. `col` alone keeps its width up to the edge; a range is exact; `layout` is refused, a zone stays on its layout. |
| `zoneSource(t, "Cutoff", "Resonance")` | Links it to a control by name, stored by id as the picker stores it; `""` unlinks. |
| `zoneKind(t, "Cutoff", "bar")` | What it shows: one of the zone table's sixteen kinds (`lcd.zoneKind` in `componentTables.VERB_VALUES`, the table's own list). |
| `read(t, "zoneText")`, `read(t, "zoneText", "Title")` | Every zone's, by name, or one zone's. `zoneAt` reads as `{row, col = {first, last}}`, which `zoneAt` takes back; `zoneSource` as the control's name. |

**Made on the way, kept at the owner's word** ("Keep @active and @edit"): `zoneSource` also takes
the picker's other two entries, `"@active"` (with `"#value"`, `"#switch"` or `"#choice"`) and
`"@edit"`, as the picker writes them. Without them `read(t, "zoneSource")` would answer `""` for a
zone following the active control, which reads as unlinked.

| Field | Text |
| --- | --- |
| `name` (every zone command) | The zone's name, as given in the zone table. Case-insensitive. / Every zone with that name, on every layout. / Not a zone of the display: rejected with a console error. |
| `zoneText` `text` | The text. / Shown by a zone that shows fixed text. / A number: written as text. / Left out: rejected with a console error. |
| `zoneLabel` `label` | The name shown. / "": the control's own name. / Shown by a zone that shows a name. / A number: written as text. / Left out: rejected with a console error. |
| `zoneShow` `on` | true: shown. / false: hidden; the layout's text shows through. / Left out: toggles. / The usual false words. |
| `zoneAt` `place` | A table: {row = 2, col = {1, 8}}, each part optional. / `row`: one row, counted from 1. / `col`: the first column, the zone keeping its width up to the display's edge; or a range {1, 8}. / A row number alone: the row. / A part left out: unchanged. / A fraction: rounded. / A range past the display: to its last column. / Not on the display: rejected with a console error. |
| `zoneSource` `control` | The control's name. Case-insensitive. / "": unlinked. / "@active": the control last touched. / "@active#value", "@active#switch" or "@active#choice": the last of that kind. / "@edit": the display's editable field. / This display, or not on this panel: rejected with a console error. / Left out: rejected with a console error. |
| `read` `index`, the LCD's and the Pixel's | One line more: For a zone verb, such as "zoneText": the zone's name, case-insensitive. (Pixel: an element verb, such as "text".) |

Tests: `test/lcdZonesByName.test.js` (places, sources, every command and `read` through the runtime,
refusals); the catch-all in `componentVerbs.test.js` gives the probe LCD a zone called "probe".

### The branch

Everything above is on `main`, merged through three pull requests the owner asked for and merged
when CI was green: #63 (`ce.anim`, the type labels, the hover card and hint by path), #65
(`ce.draw`) and #66 (`ce.time`). After each merge the session's branch, `ccr-d7809877-w74329`,
was rebuilt from `main`, so it carries nothing that `main` does not. The owner merges through a
pull request when asked; "Merge and then next module" was the standing instruction for these
three.

Still deferred from `ce.midi`, by the owner's choice: the older helpers' silent wrong answers
(`to7bit(20000, 2)`, `to14bit(20000)`, `fromNibbles(16, 0)`, `nibblize({300})`, `denibblize` with
an odd count, `toSigned(-200, 8)`, `from7bit("02 2C")`, `toAscii` not cutting long text).

How many descriptions each module has, and how many need the most work (first sentence built on
parameter names, with a bracketed aside, or over 25 words):

| Module | Descriptions | Need most work |
| --- | --- | --- |
| ce.midi | 44 | 29, all done |
| ce.math | 61 | 35, all done |
| ce.anim | 12 | 12, all done |
| ce.draw | 27 | 18, all done |
| ce.time | 22 | 15, all done |
| ce.components.lcd | 37 | 22, all done |
| ce.components.arp | 31 | 15, all done |
| ce.components.pixel | 28 | 13 |
| ce.components.meter | 25 | 11 |
| ce.components.chordpad | 22 | 11 |
| ce.components.noteribbon | 20 | 11 |
| ce.components.drumpads | 37 | 10 |
| ce.components.transport | 16 | 10 |
| ce.panel | 25 | 8 |
| ce.components.envelope | 23 | 8 |
| ce.components.turing | 16 | 8 |
| ce.components.crossfader | 15 | 8 |
| ce.device | 24 | 7 |
| ce.components.router | 21 | 7 |
| ce.components.ribbon | 15 | 7 |
| ce.components.kinetic | 12 | 7 |
| ce.components.orbit, looper, constellation, panic | 20, 17, 13, 9 | 6 each |
| ce.music | 13 | 5 |
| ce.core, ce.storage, ce.components.recorder, timbre, joystick | 15, 10, 15, 15, 16 | 4 each |
| ce.image, ce.text, ce.components.macro, constraint | 8, 7, 16, 11 | 3 each |
| ce.ui, ce.components.matrix | 9, 11 | 2 each |
| lifecycle hooks, ce.components.harmony, phrase, setlist, split | 9, 15, 9, 7, 6 | 1 each |

After the commands: the module descriptions (41, the picker's group headings) and the event
descriptions (38), with the same rules. Parameter and option descriptions only where they are
unreadable or wrong; that is where the detail lives now, and it can be longer.

Not in scope: names, signatures, behaviour, and the console messages a refused call writes. Those
are the runtime's words and their tests pin them.

## `ce.components.arp`: the owner's review

Started 2026-10-25, one item at a time as the LCD's was. The queue, from a read of the 30 texts
against the engine (`utils/arpLayout.js`, the preview's ticker in `PanelPreviewSurface.svelte`) and
the inspector (`ArpEditor.svelte`), and a probe of each command's edges in the runtime:

1. `pattern`: done, below.
2. `rate`: done, below.
3. `octaves`: done, below.
4. `gate`: done, below.
5. `swing`: done, below, with `swingSource`.
6. `phase`: done, below.
7. `mute`: done, below.
8. The own chord (`key`, `scale`, `degree`, `chordType`, `baseOctave`, `followPanelKey`): done,
   below.
9. `latch`: done, below.
10. `source`, `link`, `inputChannel`: done, below.
11. `run`, `sync`, `division`: done, below.
12. `euclid`, `euclidSteps`, `euclidPulses`, `euclidRotate`: done, below.
13. `velocity`, `channel`: done, below.
14. `editable`, `showNotes`, `showHeader`: done, below.
15. The family: done, below. The arp's review is done.

**Item 1, `pattern`: done.** "random" and "asPlayed" played exactly as "up" for as long as they
were offered: every note set was sorted on the way (`arpBaseNotes`, `expandOctaves`, and the
preview's linked and MIDI notes), and nothing chose at random. No test covered either. At the
owner's word ("As recommended") both work:

- "random": each step plays a cell picked at random (`arpStepCell`, its randomness passed in as
  the file's other functions take theirs). The cells are drawn low to high; the playhead shows the
  cell that played (`__head`, `arpHead`); `onStep` names it; a hand mute silences the cell, and
  swing still follows the step.
- "asPlayed": the preview hands a linked Chord Pad's notes over in the order the pads went down
  and MIDI input in the order it arrived (`heldNotesInOrder`, by the arrival time the store
  already kept), and `arpSequence` walks them in that order, repeated an octave up per octave. Its
  own chord has no order but its own: as "up".

Checked in a running preview (a scratch Playwright probe): a "random" arp's playhead went
1 4 0 5 1 4 1 2 … while an "up" one walked 0 to 5 in turn, and an "asPlayed" arp on MIDI input
laid out G4 C4 E4 as the keys went down, C4 E4 G4 once switched to "up".

| Field | Text |
| --- | --- |
| Description | Set the order the notes are played in. |
| Example | `ce.components.arp.pattern("Arpeggiator", "updown")` plays the notes low to high, then back down. |
| `pattern` (string, required) | "up": low to high. / "down": high to low. / "updown": up, then down; the top and bottom notes once. / "downup": down, then up; the same. / "asPlayed": in the order the notes were pressed. Its own chord: as "up". / "random": one note at random each step. / "chord": every note at once, each step. / Case-insensitive. / Invalid: rejected with a console error. |
| notes | Default: "up". / Then the two every command has. |

**Item 2, `rate`: done.** It took 0.01 to 200. The engine plays nothing slower than 0.1 (`arpRate`),
so 0.05 was stored and played at 0.1 without a word; and the preview moves once a frame and does
not play the steps it slept through, so above about 60 steps a second steps were skipped. The
inspector offers 0.1 to 40. At the owner's word ("As recommended") a script takes the inspector's
range, as the LCD's `animSpeed` does: outside it, the nearest end with the one-time warning.
`RATE` in `componentVerbs.js` is the arp's alone.

| Field | Text |
| --- | --- |
| Description | Set how many steps a second it plays, while not synced. |
| Example | `ce.components.arp.rate("Arpeggiator", 8)` plays eight steps a second. |
| `rate` (number, required) | Steps per second. / Range: 0.1 ↔ 40. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| notes | While synced to the Transport: no effect; `division()` sets the step. / Default: 6. / Then the two every command has. |

**Item 3, `octaves`: done.** It took 1 to 6; the engine repeats the notes over at most four octaves
(`expandOctaves`, and `arpSequence`'s "asPlayed" walk), so 5 and 6 were stored and played as 4
without a word. The inspector offers 1 to 4. At the owner's word ("As recommended") a script takes
1 to 4: past it, the nearest end with the one-time warning.

| Field | Text |
| --- | --- |
| Description | Set how many octaves the notes are repeated over, upward. |
| Example | `ce.components.arp.octaves("Arpeggiator", 2)` plays the notes, then the same notes an octave up. |
| `octaves` (number, required) | Octaves, from the notes up. / 1: the notes only. / Range: 1 ↔ 4, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| notes | A note above 127 is left out. / With "chord": every octave at once. / Default: 1. / Then the two every command has. |

**Item 4, `gate`: done.** It took 0 to 1. The engine holds a note for at least 10 ms and at most
99% of its step (`gateSeconds`: a repeated note at a full gate would race its own note-off), so 0
played a 10 ms blip. The inspector offers 0.05 to 1. At the owner's word ("As recommended") a
script takes 0.05 to 1: past it, the nearest end with the one-time warning.

| Field | Text |
| --- | --- |
| Description | Set how long each note is held, as a part of its step. |
| Example | `ce.components.arp.gate("Arpeggiator", 0.5)` holds each note for half its step. |
| `gate` (number, required) | Part of the step. / 1: held to the next step; 99% of it, so a repeated note sounds again. / Range: 0.05 ↔ 1. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| notes | Default: 0.6. / Then the two every command has. |

**Item 5, `swing`: done, and `swingSource` added.** It took -1 to 1; the engine reads it from 0 to 1
(`effectiveSwing`), so a negative swing was stored and played straight. The inspector offers 0 to 1.
And while synced an arp plays the Transport's swing unless the inspector's "Swing from" is "Its
own": a script's `swing()` on a synced arp did nothing, and no script could change that. At the
owner's word ("Do recommended") a script takes 0 to 1, and `swingSource(t, "transport" | "own")`
sets whose swing a synced arp plays, read back by `read(t, "swingSource")`. `swingSource` joins the
Arp's section defaults as "transport", which is what an absent one always read as, so no saved
panel changes; its words are `SWING_SOURCES`, the module's own (`componentTables.VERB_VALUES`).

| Field | Text |
| --- | --- |
| `swing` description | Set how far every second step is delayed. |
| `swing` example | `ce.components.arp.swing("Arpeggiator", 0.5)` delays every second step by a quarter of a step. |
| `swing` (number, required) | Part of half a step: 1 delays every second step by half a step. / 0: straight. / Range: 0 ↔ 1. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| `swing` notes | While synced: the Transport's swing, unless `swingSource()` is "own". / Default: 0. / Then the two every command has. |
| `swingSource` description | Set whose swing a synced arp plays: the Transport's or its own. |
| `swingSource` example | `ce.components.arp.swingSource("Arpeggiator", "own")` plays its own swing while synced. |
| `swingSource` (string, required) | "transport": the Transport's swing, while synced. / "own": `swing()`, always. / Case-insensitive. / Invalid: rejected with a console error. |
| `swingSource` notes | Not synced: its own swing, either way. / Default: "transport". / Then the two every command has. |

**Item 6, `phase`: done, as a seek.** It wrote the stored phase, which the preview reads only when
it opens (`arpPhaseFor`: its own state wins from the first frame). Checked in a running preview: an
arp on cell 2 of 6 took `phase("Arp", 0.5)`, returned true, stayed on cell 2 and walked on to 4;
stopped, `phase("Arp", 0)` and started again, it went on from 4; `read(t, "phase")` gave the 0.5
written. At the owner's word ("As recommended") `phase()` is a seek, as `layout()` is the LCD's:
`stores/componentPhases.js` asks the preview, which moves a running arp at once (its next step
plays from there) and a stopped one where it starts, redrawn there; `read(t, "phase")` answers
where it is. Nothing is written to the panel. A synced arp's position is the Transport's, so it is
not moved, with a console warning. With no preview a seek waits for the next one to open. The verb
says so with `seek: { clock: 'syncToTransport' }`; the value is read as any number verb's (range,
nearest end, refusals) against no stored value, so seeking to the stored number still seeks. The
same check in the preview afterwards: cell 2, `phase(0.5)`, cell 4 at once; `read` 0.76 a moment
later; stopped, `phase(0)` drew it on cell 1 and it started there.

The Orbit's and the Looper's `phase` keep their position the same way and are likely as dead;
that is their reviews', and `componentPhases.js` is where their preview code would answer.

| Field | Text |
| --- | --- |
| Description | Move the arp to a point in its sequence. |
| Example | `ce.components.arp.phase("Arpeggiator", 0.5)` moves it halfway through its sequence. |
| `phase` (number, required) | Where in the sequence: 0 the start, 0.5 halfway. / 1: the start again. / Range: 0 ↔ 1. / Outside the range: the nearest end. / Invalid: rejected with a console error. |
| notes | Running: the next step plays from there. Stopped: it starts from there. / While synced: no effect; the Transport's position decides. / `read(target, "phase")` gives where it is now. / Nothing is written to the panel. / Then the two every command has. |

**Item 7, `mute`: done.** `mute(t, 3)` muted step 3 as it should, and clicking a cell does the
same; but "on" meant muted and nothing said so (the example read "switches step 3 on"),
`read(t, "mute")` gave the stored steps, counted from 0 (`[2]` after `mute(t, 3)`), and
`read(t, "mute", 1)` the list's first entry rather than whether step 1 was muted. A step past the
sequence is stored without a word, and plays once the sequence reaches it. At the owner's word
("As recommended") `read(t, "mute")` gives the muted steps counted from 1 and `read(t, "mute", 3)`
true or false (panelRuntime's read, for the one `indexset` verb there is); a step past the end is
kept, since the sequence grows with the notes held, and the text says so. `scriptComponents.test.js`
held the script and the grid's toggle to one shape through the old read; it does now through the
new one.

| Field | Text |
| --- | --- |
| Description | Mute or unmute one step. |
| Example | `ce.components.arp.mute("Arpeggiator", 3)` mutes step 3 if it plays, and lets it play if it is muted. |
| `index` (number, required) | Step number, counted from 1, as the cells are drawn from the left. / A fraction: rounded. / Past the last step: kept, for when the sequence grows. / Below 1, or invalid: rejected with a console error. |
| `on` (true or false, optional) | true: muted. / false: plays. / Left out: toggles. / 0, "", "false", "off" or "0": false. Case-insensitive. / Any other value: true. |
| notes | A step is a place in the sequence, not a note: the mute stays on step 3 when the notes change. / `read(target, "mute")`: the muted steps, counted from 1; `read(target, "mute", 3)`: true if step 3 is muted. / Default: none muted. / Then the two every command has. |

**Item 8, its own chord: done.** Six commands that matter only while it plays its own chord
(the inspector hides them for a linked Chord Pad or MIDI input). Four decisions, at the owner's word
("As recommended"):

- `degree` counts from 1, as `ce.music.degreeChord` does, stored one lower (`oneBased`), so saved
  panels are unchanged; the inspector's "Deg" counts from 1 too. It counted from 0.
- Its range is the scale's own length (`rangeFrom`, the new hook for a number verb whose range
  the control gives): 1 to 7, 6 for "blues", 5 for the pentatonics, past it the nearest end with the
  one-time warning. It took 0 to 6 on any scale, and degrees 5 and 6 of a pentatonic played as 4.
- `key` takes a note's name too, "C", "F#", "Eb", in any case (`pitchClassOf` in `musicTheory.js`,
  by `ce.music`'s own note reading; a name it cannot read is refused, not taken as C as the panel
  key's `rootFrom` takes it), and a number goes round the octave, 12 is C, as `phrase.key` does.
  `key(t, 12)` was B, the nearest end. The hooks: `readValue` reads the value before the verb's
  range, `valueRefusal` says why one cannot be read, `argKind` types the parameter "number or name".
- `followPanelKey(t, true)` takes the panel's key and scale at once, in the same write, as the
  inspector's toggle does (`setFollowsPanelKey`); it set the flag alone, and the control kept its
  own key until the panel's next change. Again when already following, so a `key()` written on a
  follower since is brought back. The runtime's `panelKeyCatchUp` does it for every family's
  `followPanelKey` (the Chord Pad's, the Note Ribbon's and the rest), whose texts are their reviews'.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `key` | Set the key of its own chord. · `key("Arpeggiator", "F#")` builds its chord in F♯. | The key's note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B. / Past 11 or below 0: round the octave; 12 is C. / A fraction: rounded. / Invalid: rejected with a console error. | Its own chord only: with `source()` "link" or "input" the notes come from there. / Following the panel's key: replaced at its next change. / Default: 0 (C). |
| `scale` | Set the scale of its own chord. · `scale("Arpeggiator", "dorian")` builds its chord from the Dorian scale. | (the list) | Its own chord only. / Following the panel's key: replaced at its next change. / Default: "minor". |
| `degree` | Set which step of the scale its chord is built on. · `degree("Arpeggiator", 5)` builds its chord on the fifth step. | Step of the scale, counted from 1: 1 is the key's own chord. / Range: 1 ↔ the scale's notes: 7, 6 for "blues", 5 for the pentatonics. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Its own chord only. / A scale changed to a shorter one: its last step. / Default: 1. |
| `chordType` | Set how many notes its chord has. · `chordType("Arpeggiator", "seventh")` adds the seventh: four notes. | "triad": three notes. / "seventh": four, the seventh added. / Case-insensitive. / Invalid: rejected with a console error. | Its own chord only. / Default: "triad". |
| `baseOctave` | Set the octave its chord starts in. · `baseOctave("Arpeggiator", 4)` puts the chord's root in octave 4, as in C4, middle C. | The root's octave, as in C3. Middle C is C4. / Range: -1 ↔ 8, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Its own chord only. / A note above 127 is left out. / Default: 3. |
| `followPanelKey` | Follow the panel's key and scale, or keep its own. · `followPanelKey("Arpeggiator", true)` takes the panel's key and scale, and changes with them. | true: the panel's key and scale, at once and at every change. / false: its own. / Left out: toggles. / The usual false words. | Default: false. |

Each ends with the two notes every command has.

**Item 9, `latch`: done, texts only.** It does what it should (`arpSourceNotes`): with a linked
Chord Pad or MIDI input, the last notes held keep playing after they are let go, notes held again
replace them, turning it off while nothing is held stops it, and a Panic with "clear local" (its
default) lets them go. With its own chord it does nothing, which the inspector's hint said and the
script's text did not. Approved as proposed ("As recommended").

| Field | Text |
| --- | --- |
| Description | Keep playing the last notes held after they are let go. |
| Example | `ce.components.arp.latch("Arpeggiator", true)` keeps playing the last chord held on the linked Chord Pad after it is let go. |
| `latch` (true or false, optional) | true: the last notes held keep playing. / false: it stops when they are let go. / Left out: toggles. / The usual false words. |
| notes | With `source()` "link" or "input" only: its own chord always plays. / Notes held again replace the latched ones. / A Panic lets them go. / Default: false. / Then the two every command has. |

**Item 10, `source`, `link` and `inputChannel`: done.** `link`'s text was the generic link's
("Name the control that drives the link.", its example naming "Cutoff", which it refuses), and its
refusals were worded unlike every other command's: `arp.link("Knob"): refused — it is not a Chord
Pad.` and `arp.link: no control named "Nope" on this panel.` At the owner's word ("As
recommended"): `link` and `source` stay apart, the text saying the Chord Pad plays only while
`source()` is "link"; and a refused link, on all nine link verbs of every family, says so as every
verb does (`componentLinkAction`): `arp Arp: link("Knob") — refused, nothing changed. "Knob" is not
a Chord Pad.`, `… There is no control called "Nope" on this panel.`, `… A control cannot drive
itself.` `scriptControlSources.test.js` asked every link's summary to name "a name" and its
parameter to say "unlink"; it takes the name in the parameter's first line and "": none too, which
is where the approved text says both.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `source` | Set where the notes come from. · `source("Arpeggiator", "input")` plays the notes held on the MIDI input. | "chord": its own chord, from `key()`, `scale()` and `degree()`. / "link": the notes held on the Chord Pad set by `link()`. / "input": the notes held on the MIDI input, on `inputChannel()`. / Case-insensitive. / Invalid: rejected with a console error. | Default: "chord". |
| `link` | Set the Chord Pad it plays from. · `link("Arpeggiator", "Pads")` plays the chords held on the Chord Pad called Pads. | The Chord Pad's name. Case-insensitive. / Left out, or "": none. / Not on this panel, or not a Chord Pad: rejected with a console error. | Played only while `source()` is "link". / The Chord Pad stays silent while the arp plays from it. / `read(target, "link")` gives the Chord Pad's name. / Default: none. |
| `inputChannel` | Set which MIDI channel it takes notes from. · `inputChannel("Arpeggiator", 2)` plays only the notes held on channel 2. | Channel 1 ↔ 16, or 0: any channel. / Range: 0 ↔ 16, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Only while `source()` is "input". / Default: 0, any channel. |

Each ends with the two notes every command has.

**Item 11, `run`, `sync` and `division`: done, texts only.** All three do what they should:
stopped, a free-running arp holds its place and starts again from there; synced, it takes one step
per division at the Transport's tempo, in step with its position, silent while the Transport is
stopped, `rate()` and `phase()` without effect and the Transport's swing played unless
`swingSource()` is "own"; "D" is dotted (x1.5) and "T" a triplet (x2/3), `DIVISIONS` in
`transportLayout.js`. Approved as proposed ("Approved"). The division's list in its text is the
transport's own (`DIVISION_WORDS`, from `DIVISION_IDS`).

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `run` | Start or stop the arp. · `run("Arpeggiator", false)` stops it. | true: plays. / false: stops. / Left out: toggles. / The usual false words. | Free-running: it starts again where it stopped. / Synced: it plays only while the Transport runs. / Default: true. |
| `sync` | Follow the Transport's tempo, or run at its own rate. · `sync("Arpeggiator", true)` steps in time with the Transport, one step per `division()`. | true: one step per `division()` at the Transport's tempo, in step with its position. / false: `rate()` steps a second. / Left out: toggles. / The usual false words. | Synced: silent while the Transport is stopped. / Synced: `rate()` and `phase()` have no effect, and the Transport's swing plays unless `swingSource()` is "own". / Default: false. |
| `division` | Set how long each step is while synced. · `division("Arpeggiator", "1/8T")` plays eighth-note triplets. | A note value, "1/1" a whole note to "1/32". / "D" after it: dotted, half as long again. / "T" after it: a triplet, two-thirds as long. / One of "1/1", … "1/16T". Case-insensitive. / Invalid: rejected with a console error. | While synced only: free-running, `rate()` sets the step. / Default: "1/16". |

Each ends with the two notes every command has.

**Item 12, the Euclidean rhythm: done.** `euclidPulses()` hits spread over `euclidSteps()` steps,
turned by `euclidRotate()` (`arpLayout.euclid`), measured in the free-running step number so a
rhythm of one length runs against a note set of another. Two decisions, at the owner's word ("As
recommended"): pulses take 0 to the rhythm's own steps (`rangeFrom`), as the inspector's do,
past them the nearest end with the one-time warning (20 on 8 steps was stored and played every
step); and a rotation goes round the steps, as the engine already did (`readValue`, now handed
the control's settings too): -1 is the last, 40 on 8 steps is 0, no warning since nothing is cut
off (it took -32 to 32 and stopped there). Checked in the engine: rotate 1 moves hits 3 6 8 to
2 5 7, each a step earlier.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `euclid` | Switch the Euclidean rhythm on or off. · `euclid("Arpeggiator", true)` plays only the steps the rhythm hits. | true: the rhythm decides which steps sound. / false: every step sounds. / Left out: toggles. / The usual false words. | The rhythm: `euclidPulses()` hits spread evenly over `euclidSteps()` steps, turned by `euclidRotate()`. / It runs against the notes: an 8-step rhythm over a 3-note chord lands on different notes each time round. / Hand mutes stay silent either way. / Default: false. |
| `euclidSteps` | Set how many steps the rhythm is long. · `euclidSteps("Arpeggiator", 8)` makes an 8-step rhythm. | Steps in the rhythm. / Range: 1 ↔ 32, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Default: 8. |
| `euclidPulses` | Set how many of the rhythm's steps sound. · `euclidPulses("Arpeggiator", 3)` sounds 3 steps, spread as evenly as they go. | Hits, spread as evenly as they go. / 0: none sound. / Range: 0 ↔ `euclidSteps()`, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Steps lowered below it later: every step sounds. / Default: 5. |
| `euclidRotate` | Turn the rhythm by a number of steps. · `euclidRotate("Arpeggiator", 1)` moves every hit a step earlier. | Steps to turn it: each hit that many steps earlier. / Past the steps, or below 0: round them; -1 is the last. / A fraction: rounded. / Invalid: rejected with a console error. | Default: 0. |

Each ends with the two notes every command has.

**Item 13, `velocity` and `channel`: done, texts only.** Every note plays at the arp's own
velocity (`arpFireStep` reads `arpVelocity`), the velocity a linked Chord Pad or the MIDI input held
it at not used, on its own channel. Approved as proposed ("Item 13 approved").

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `velocity` | Set how hard every note it plays is struck. · `velocity("Arpeggiator", 110)` plays every note at velocity 110. | MIDI velocity. / Range: 1 ↔ 127, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | The same for every note: the velocity the notes were held at is not used. / Default: 96. |
| `channel` | Set which MIDI channel it plays on. · `channel("Arpeggiator", 10)` plays its notes on channel 10. | MIDI channel. / Range: 1 ↔ 16, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Default: 1. |

Each ends with the two notes every command has.

**Item 14, `editable`, `showNotes` and `showHeader`: done, texts only.** They were derived
(`derivedFlagVerbs`: "Allow or lock touch control of the Arpeggiator.", "Show or hide the notes.")
and are declared now, at the end of the family where the derived ones came, as the LCD's overlays
are. A click on a step mutes it unless `editable` is off, `mute()` working either way; a step
narrower than 22 or shorter than 26 pixels shows no note name whatever `showNotes` says; the strip
`showHeader` hides gives the steps its room. Approved as proposed ("Approved").

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `editable` | Let a click on a step mute it, or not. · `editable("Arpeggiator", false)` stops clicks muting steps. | true: a click on a step mutes or unmutes it. / false: clicks do nothing. / Left out: toggles. / The usual false words. | Only clicks are locked: `mute()` still works. / Default: true. |
| `showNotes` | Show or hide the note names in the steps. · `showNotes("Arpeggiator", false)` hides the note names. | true: each step shows its note, "C3", or a chord's count, "3♪". / false: hidden. / Left out: toggles. / The usual false words. | A step narrower than 22 or shorter than 26 pixels shows no name either way. / Default: true. |
| `showHeader` | Show or hide the strip above the steps. · `showHeader("Arpeggiator", false)` hides the strip, and the steps take its room. | true: the strip shows the pattern, where the notes come from and the rate. / false: hidden; the steps take its room. / Left out: toggles. / The usual false words. | Default: true. |

Each ends with the two notes every command has.

**Item 15, the family: done.** At the owner's word ("Arp it is") every example names the control
"Arp", the component's name in the type list, rather than its label: the tables above, written
before, say "Arpeggiator" where the texts now say "Arp". The summary and `read`'s texts were
proposed with it; `read` takes its own index text and notes from the family (`readIndex`,
`readNotes`), since the arp has no lists and its only index is `read(t, "mute", 3)`.

| Field | Text |
| --- | --- |
| Summary | Play notes one at a time from its own chord, a Chord Pad or the MIDI input: their order, speed, length, swing and rhythm. (Then "Panel view only", as every module's.) |
| `read` `index` | For "mute": a step number, counted from 1; true if that step is muted. / A fraction: rounded. / Below 1, or invalid: rejected with a console error. |
| `read` notes | `read(target)`: every setting as a table, by verb name. / `read(target, "phase")`: where it is now. / `read(target, "mute")`: the muted steps; `read(target, "mute", 3)`: whether step 3 is. / Then the two `read` always has. |

**CI, 2026-10-25.** From 19:02 UTC Microsoft's download host refused .NET 10.0.403 and the
10.0.14 runtime (HTTP 409 from `dotnetorigin.blob.core.windows.net`) to `actions/setup-dotnet`, and
`web-tests` and `windows` failed before building or testing anything, three runs in a row. At the
owner's word ("Do what is necessary to get it through") `ci.yml`'s two `setup-dotnet` steps carry
on past a failed download, and a step after each lists the runner image's SDKs, failing when there
is no .NET at all and saying in the annotations when the fallback was used; both C# checks take the
newest SDK present when 10 is not. When the download works again, nothing is to undo. It did on the
next run (44710fd, 20:11 UTC): `setup-dotnet` installed 10.0.x and the fallback was not used.

## `ce.components.pixel`: the owner's review

Started 2026-10-25, one item at a time as the arp's was. The queue, from a read of the 29 texts
against the renderer (`PixelDisplayRenderer.svelte`, `LcdGraphicCanvas.svelte`) and the inspector
(`PixelDisplayEditor.svelte`), and a probe of each command's edges in the runtime:

1. `show`, `blink`, and the `name` all eight element commands take: done, below.
2. `x`, `y`, `w`, `h`: done, below.
3. `text`, `label`: done, below.
4. Parity with the LCD's zones: an element's `kind` and `source`: done, below.
5. `brightness`, `contrast`: done, below.
6. `gamma`: done, below.
7. `glow`: done, below.
8. The animation: `anim`, `animPreset`, `animSpeed`, `animLoop`, `animFps`: done, below.
9. `layoutTransition`, `transitionMs`: done, below.
10. `editText`: done, below.
11. `backlight`, `brightnessSource`: done, below.
12. The overlays: `showGlass`, `showGhost`, `showScanlines`, `showGrid`: done, below.
13. `layout`: done, below.
14. The family: its summary, the name in the examples (`"PixelDisplay"`), and `read`'s texts: done,
    below. The pixel's review is done.

**Item 1, `show`, `blink` and `name`: done.** The renderer draws an element unless its `visible`
is false, and the inspector's Vis toggle reads it the same way, but a bare `show()` toggled from
the value stored, so on an element without one the first call wrote the true it already was and
nothing hid; `read(t, "show")` gave nil for it. At the owner's word ("As recommended") an element
without `visible` counts as shown (`absent: true`, as the LCD's zones), and one without `blink` as
steady (`absent: false`), so `read` answers false rather than nil. The third argument is named
`on`, as `lcd.zoneShow`'s. The blink rate stays the renderer's, 530 ms each way on one clock for
every element (`blinkPhase`), and is written down. The name was matched in any case and on every
layout, and the text said neither.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `show` | Show or hide an element, by its name. · `show("PixelDisplay", "Title")` hides the element called Title if it is shown, and shows it if it is hidden. | `on`: true: shown. / false: hidden. / Left out: toggles. / The usual false words. | |
| `blink` | Make an element blink, by its name. · `blink("PixelDisplay", "Title")` makes the element called Title blink if it is steady, and steady if it blinks. | `on`: true: blinks: 530 ms shown, 530 ms hidden. / false: steady. / Left out: toggles. / The usual false words. | Every blinking element blinks in step. A hidden element does not blink. |

`name`, on all eight: The element's name, as given in the element table. Case-insensitive. / Every
element with that name, on every layout. / Not an element of the display: rejected with a console
error.

Each ends with the two notes every command has. The examples say "PixelDisplay" until item 14.

**Item 2, `x`, `y`, `w` and `h`: done.** A number past the range was used as its nearest end
without a word, and a refusal gave no reason (`x("Title", "big")`: "refused, nothing changed"),
where every other number command says both. At the owner's word ("As recommended") they say both
(`componentClampWarning` and `componentRefusalReason` take an element's number), and the ranges
stay: -4096 to 4096 for a position, 0 to 4096 for a size, wider than any grid (the inspector's is
8 to 1024, and its X/Y/W/H cells have no limit) so an element can be parked off the screen. What
each draws is the renderer's: a text kind's `w` is the box it is aligned and cut in, 0 as wide as
the text and neither wrapped nor scrolled; its `h` sizes the letters (`pixelTextMetrics`: the
built-in font 1× below 16, then by 8); any other kind draws at least 1, `anim` at least 4.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `x` | Set an element's left edge, by its name. · `x("PixelDisplay", "Title", 10)` puts the element called Title 10 pixels from the screen's left edge. | Pixels of the grid, from the screen's left edge; 0: at the edge. / Range: -4096 ↔ 4096, whole. / A fraction: rounded. / Outside the range: the nearest end. / Invalid: rejected with a console error. | Off the screen, wholly or in part: that part is not drawn. The grid is set in the inspector, under Grid: 128 × 64 by default. |
| `y` | Set an element's top edge, by its name. · `y("PixelDisplay", "Title", 20)` puts the element called Title 20 pixels below the screen's top edge. | As `x`, from the screen's top edge. | As `x`. |
| `w` | Set an element's width, by its name. · `w("PixelDisplay", "Title", 64)` makes the element called Title 64 pixels wide. | Pixels of the grid. / A text kind: the box its text is aligned and cut in; 0: as wide as the text. / Any other kind: its width; drawn at least 1 wide, 4 for "anim". / Range: 0 ↔ 4096, whole. / Then as `x`. | The text kinds: "static", "name", "value", "pct", "midiValue", "note", "text", "state", "edit", "icon" and "clock". / A text kind 0 wide is not wrapped or scrolled. |
| `h` | Set an element's height, by its name. · `h("PixelDisplay", "Title", 16)` draws the text of the element called Title at twice the size. | Pixels of the grid. / A text kind: the size of its letters. The built-in font: 1× below 16, 2× from 16, 3× from 24, and on by 8. A custom font: by its glyph height. / Any other kind: its height; drawn at least 1 high, 4 for "anim". / Range: 0 ↔ 4096, whole. / Then as `x`. | The text kinds, as `w`. |

Each ends with the two notes every command has.

**Item 3, `text` and `label`: done, texts only.** Which kinds draw each was nowhere: `text` is
drawn by "static" between its prefix and suffix, by "name" while it has no label and no control,
and by "edit" while its control has no text (`resolveZoneContent`); `label` by "name" in place of
its control's name, and by the eight widget kinds as a caption 7 pixels high under the widget, or
above it with no room below. The built-in font has no glyph for `` $ & ^ ` { | } ~ ``, letters with
accents, "€", "♯", "♭" or a tab, and draws each as a blank. At the owner's word ("As
recommended") both are written down and neither is said in the console, as the LCD's `zoneText`
and `zoneLabel`: a check against the font would need each element's, built-in or a custom sheet.
A text on a kind that does not draw it is stored, as there. A test holds the list to the font.

| Command | Description · Example | Parameter |
| --- | --- | --- |
| `text` | Set the text of a "static" element, by its name. · `text("PixelDisplay", "Title", "INIT VOICE")` writes INIT VOICE in the element called Title. | The text. / Shown by "static", between its prefix and suffix. / Shown by "name" while it has no label and no control, and by "edit" while its control has no text. / "\n": a new line while the element wraps; a blank otherwise. / A character the font cannot draw: a blank. The built-in font has none for $ & ^ \` { \| } ~ and letters with accents. / A number: written as text. / Left out: rejected with a console error. |
| `label` | Set an element's caption, or the name a "name" element shows, by its name. · `label("PixelDisplay", "Cutoff", "CUT")` shows CUT under the element called Cutoff. | The text. / "name": shown in place of its control's name; "": the control's name. / "hbar", "vbar", "hslider", "vslider", "needle", "wave", "scope" and "adsr": a caption 7 pixels high, centred under it, or above it when there is no room below; "": none. / Other kinds: not shown. / A character the font cannot draw: a blank. / A number: written as text. / Left out: rejected with a console error. |

Each ends with the two notes every command has.

**Item 4, `kind` and `source`: done.** Neither existed: the spec left them out as authoring
choices ("what an element IS and what drives it"), and the LCD's zones have had `zoneKind` and
`zoneSource` since "Zones by name". At the owner's word ("As recommended") an element has both,
by its name on every layout, as a zone does. The 21 kinds moved from the inspector into
`utils/pixelElements.js` (`PIXEL_ELEMENT_KINDS`, with `PIXEL_TEXT_KINDS` and `PIXEL_BAR_KINDS`),
which the inspector's kind list and `componentTables`' `pixel.kind` both read; `w`'s and `h`'s
text-kinds note is built from the same list. `source` takes what the element's picker offers and
`zoneSource` takes, through the same resolver (`lcdZoneSourceFor`, whose refusal now says "in an
element" for one), is stored by id, and `read` gives the control's name; both share the parameter
text (`SOURCE_BY_NAME`). `colour` stays out as styling, and so do "wave"'s cutoff, resonance, LFO
and pitch sources and "adsr"'s four.

| Command | Description · Example | Parameter | Notes |
| --- | --- | --- | --- |
| `kind` | Set what an element is, by its name. · `kind("PixelDisplay", "Cutoff", "vbar")` makes the element called Cutoff a vertical bar. | One of the 21, the inspector's. Case-insensitive. / Invalid: rejected with a console error. | Its other settings are kept: its place, size, text and source. |
| `source` | Link an element to a control, by its name. · `source("PixelDisplay", "Cutoff", "Resonance")` makes the element called Cutoff show the control called Resonance. | As `lcd.zoneSource`'s `control`. | Shown by the text kinds but "static", "icon" and "clock"; drives the bars, sliders and "needle", "wave"'s level and "scope". Not used by "adsr", "anim" or "bitmap". / "wave"'s cutoff, resonance, LFO and pitch, and "adsr"'s four: set in the inspector. / `read(target, "source", "Cutoff")` gives the control's name. |

Each ends with the two notes every command has.

**Items 5 to 14: done in one pass**, at the owner's word on 2026-10-26 ("I think you know what to
do, could you just continue through the modules and finish it?"): each item's recommendation
taken, as item 5 was shown, and recorded here for review. The texts say what the canvas
(`LcdGraphicCanvas.svelte`) and the renderer draw:

- **5, `brightness` and `contrast`**, as shown: lit pixels at 10% + 90% of the brightness through
  the gamma, so 0 is dim and lit; a linked `brightnessSource` sets it; the contrast is the unlit
  pixels' visibility (half of it, never below 3%) and the backlight wash's strength.
- **6, `gamma`: 0.2 ↔ 4**, the canvas's and the inspector's; 0.1 was stored and drawn as 0.2.
  Above 1 lifts the lower brightnesses.
- **7, `glow`**: a halo under each lit pixel, at most 2.6 times its size.
- **8, the animation**: the LCD's approved texts, "behind the elements"; `animFps` keeps the LCD's
  1 ↔ 120 (both inspectors stop at 60), for one range on the one engine.
- **9, `layoutTransition` and `transitionMs`**: what each word does (a CSS fade, or a fade and a
  10% slide from the right, on a change of layout); `transitionMs` takes the inspector's 0 ↔ 2000,
  whole, where it took 5000.
- **10, `editText`**: the LCD's text, and that an "edit" element linked to "@edit" shows it.
- **11, `backlight` and `brightnessSource`**: a linked control wins over the script, said; the
  source's range maps to 0 ↔ 100.
- **12, the overlays**: declared as the LCD's; the grid is the editor's only (`editable` in the
  renderer), never drawn in the preview or a plug-in, its spacing the inspector's Snap or 8.
- **13, `layout`**: as made in "The LCD's script model"; nothing to change.
- **14, the family**: "Screen" in every example, as the LCD's (the inspector's section is called
  Screen too); the summary says what the module does; `read`'s index is a name (`readIndexKind`,
  so it is typed "string"), and its notes name the element tables and the layout.

Defaults are given in each note ("Default: 55."), as the arp's are.

## The remaining modules, in one pass

At the owner's word on 2026-10-26 ("I think you know what to do, could you just continue through the
modules and finish it?"), each module after the pixel is done in one pass: its texts read against
its renderer, layout engine and inspector, each command probed at its edges in the runtime (a probe
that calls every verb of a family with nothing, a word, numbers past both ends, a fraction, its
range's ends and a number as text), every silence or wrong answer decided by the rules above with
the recommendation taken, and the texts pinned in `componentVerbs.test.js`. What was decided is
listed here per module, for review; the texts themselves are in `componentVerbs.js` and the manual.

### `ce.components.meter`

- **Texts** for all 26: what `MeterRenderer.svelte` and `utils/meterLayout.js` draw. "db" places the
  value's part of its range as decibels, the top of the range being 0 dB, between `dbFloor()` and
  `dbCeil()` (so a ceiling above 0 leaves headroom); `decay()` is in lengths of the meter per
  second; the readout shows the value as it is, never in decibels; a zone colours from its start to
  the next, and the lowest from 0; a linked `source()` sets the value and its range.
- **`labelPosition`, new.** The caption is drawn only above or below (`labelPosition`, "none" by
  default), and only the inspector could set where, so `label()` on a new meter showed nothing.
  `componentTables.METER_LABEL_POSITIONS`, which the inspector's select now names as its table.
- **Kept**: `valueMin` above `valueMax` fills the other way, and `dbFloor` above `dbCeil` too, as
  the LCD's value range was kept; the texts say so. The styling fields (segments, thickness, arc
  angles, colours, tick count) stay the inspector's, as styling does.
- **Defaults** differ by type: a Progress Bar has no gradient and shows its readout; the notes say
  both.

### `ce.components.chordpad`

- **Texts** for all 22, from `utils/chordPadLayout.js`, `ChordPadRenderer.svelte` and the preview's
  `chordNoteOn`. The wheel always plays chords, whatever `mode()` says; `inversion()` stops at 2 on
  a triad; a voicing is applied after the inversion; a note past the MIDI range sounds at 0 or 127
  (`chordNotes` clamps, it does not leave the note out); while an Arp takes the pad's chords
  (`arp.link()`) the pads sound nothing themselves.
- **`strum`'s text was wrong**: it said the chord is spread over this many milliseconds, and it is
  the time from one note to the next, lowest first. The inspector's hint had it right.
- **`key` reads as the arp's** (its item 8): a note's name, in any case, or a number round the
  octave, where 12 and above were stored as 11. Its texts and the arp's now share `KEY_NOTE` and
  `FOLLOW_PANEL_KEY`, and velocity, channel and the echo channel share theirs.

### `ce.components.noteribbon`

- **Texts** for all 20, from `utils/noteRibbonLayout.js` and the preview: "snap" has a zone per note
  of the scale, "chromatic" per semitone, "glide" bends and starts a new note past `bendRange()`;
  across the strip (velocity from position, the CC) runs from the bottom edge to the top, or a
  vertical strip's left to its right; the strip stops at note 127.
- **`key`** reads as the arp's and the Chord Pad's; **`bendRange`** is whole semitones, as
  `ribbonBendRange` and the inspector read it (a fraction was stored).

### `ce.components.drumpads`

- **Texts** for all 37, from `utils/drumPadLayout.js` and the preview's `drumStrike`. Every map
  plays pad 1 = `baseNote()` and a semitone a pad (`resolveDrumPads`); the maps differ in the names
  and the choke groups the pads start with ("gm" chokes the hi-hats, "custom" names as "gm" and
  chokes nothing). "centre" velocity falls to 28% at the edges; "accent" strikes at `velocity()`
  wherever the pad is hit; "choke" silences the group and plays nothing; a flam's grace note is at
  `ghostVelocity()`.
- **`gate` takes 5 ↔ 2000**, whole, as `drumGateMs` plays it and the inspector offers it (it took 1
  to 5000); `rollDelay` and `flamMs` are whole milliseconds, as the engine rounds them.
- **Noticed, not changed**: a colour `colour()` cannot read is refused by the shared colour writer
  (`writeComponentFields`), whose console line names the call differently from the other refusals
  (`ce.components.drumpads.colour("Kit"): in pad 2, … so nothing was set.`). It is the line `set()`
  writes too, so changing it belongs with `ce.panel`.

### `ce.components.transport`

- **The ranges are the clock's own**, imported from `utils/transportLayout.js` (`MIN_BPM`,
  `MAX_BPM`, `MIN_BARS`, `MAX_BARS`, `MAX_LOOP_BAR`, `MAX_COUNT_IN_BARS`): the tempo 20 ↔ 300 (it
  took 400), the swing 0 ↔ 1 (below 0 played straight), the loop's start 1 ↔ 999 (9999), its length
  0.25 ↔ 64 bars in any fraction (whole bars 1 to 9999, where the inspector takes quarters), the
  count-in 0 ↔ 8 (16).
- **Texts** for all 16: a beat is a quarter note whatever `beatUnit()` says, which is shown only;
  following an external clock or the host, the tempo, tapping and clock out are not used; a count-in
  holds every follower quiet; `clockDevice("")` is the panel's own device when it names exactly one.

### `ce.panel`

Panel view only (`RUNTIME_WEBVIEW`), so no prelude changed. Every command's text rewritten to the
form: one sentence, an example, the rules a line each, and what it returns; the shared `props`
options (`controlName` and the rest) and every option field likewise. Decided by the rules:

- **A type is a word from a list the app defines**, so `create("knob")` and `find({ type = "knob" })`
  read it in any case (`typeNamed`); a type that is not one refuses `find` with why (it found
  nothing without a word). `find`'s `parent` filter reads a name in any case, as names are.
- **An error means the call did nothing**: `create` and `clone` with a `parent` that is not there,
  or not a container, made the control at the top level and said an error (`create`), or said
  nothing (`clone`). Both now refuse, and nothing is made (`containerRefusal`).
- **A value used as its default is said once**: `x`, `y`, `width` and `height` that are not numbers,
  or a size not above 0, keep the control's own (`applyControlProps`, `panelSaid`); `distribute`'s
  `gap`, `grid`'s `columns`, `gapX` and `gapY`, `circle`'s `radius` and `startAngle` that are not
  numbers fall back to their defaults, and `columns` below 1 is 1, each said
  (`arrangementPlan`'s `said`, which the Values tab shares).
- **Refused with why, where it did nothing without a word**: no control named, or one where the
  verb needs two (`distribute`, `match`, `grid`, `circle`, `flip`); a radius below 0 (it put each
  control on the far side of the circle); `destroy()`, `info()`, `clone()` with no name;
  `restore()` with no snapshot, or not a table.
- **One name is a list of one** for the arranging commands: a text was read letter by letter, six
  "no control named" lines for "Cutoff".
- **Kept**: `destroy("Nobody")`, `info("Nobody")`, `entry` and `undefine` of an entry that is not
  there answer false or nothing without a word, as a query with no result does; the texts say so.
  The arranging commands return how many controls they placed or sized, moved or not, which the
  texts now say rather than "moved".
- `test/panelReview.test.js` pins each.

### `ce.components.envelope`

- **`preset()` seeds the shape**, points and sustain point, as the inspector's Preset does
  (`applyPreset`); it wrote the name only, and the canvas then locked the new preset's levels on the
  old points. A verb hook, `alsoWrites`, writes the other fields a setting brings with it.
- **`pointX` keeps a point between its neighbours**, the first at 0 and the last at 1, as a drag
  does (`envDragNode`): a point moved past the next was drawn re-sorted, under the numbers a script
  went on using. A verb hook, `itemRange(c, at)`, gives an item its own range; the clamp warning
  names it ("outside 0 to 0.5").
- **`sustain`, `loopStart` and `loopEnd` count to the points there are** (`rangeFrom`); the loop's
  start at 1, where 0 was taken and stored as -1. `sustain` 0 or -1 is none, as it was.
- **Texts**: `timeMax` is the readout's only; the loop is marked on the curve; the snaps are a drag's.

### `ce.components.turing`

- **`phase()` is a seek**, as the arp's (its item 6): the preview keeps the Turing Machine's position
  in its ticker, and `provideComponentPhases` now answers and moves it too.
- **A change to the stored steps starts the running register from them** (an `$effect` in the
  preview): once the register had mutated, the preview played its own copy and a script's `step()`
  or `fill()`, or the inspector, was never heard.
- **`length` takes 2 ↔ 64**, as the engine plays it (`turingLength`); 1 was stored and played as 2.
  The texts give the rest: 0 or 1 levels is no quantizing; a longer loop's new steps start at 0.
- The examples name the control "Turing", the type list's name.

### `ce.components.crossfader`

- **Texts** for all 15, from `crossfaderLayout.js`; the detent snaps a drag, not `mix()`. The four
  return-spring verbs are one helper, `returnVerbs`, worded for each control's range, for the
  Ribbon and the Vector Joystick to use too.

### `ce.device`

Runs in the panel window (`panelRuntime.js`) and in the plug-in (`ScriptRuntime.cpp` and the three
preludes), so its texts were rewritten to the form and say what each does now, and its silences are
left for the owner, below, since each one is a change in four runtimes. The option fields of
`deviceDefineParameter` and `deviceDefineDump` keep their prose, which was already full.

### `ce.components.router`

- **Texts** for all 17, from `routerLayout.js`: each source's CC, the dead zone spread over the rest,
  a negative depth turns the curve upside down.
- **`curveX` keeps a point between its neighbours**, as the Envelope's do: the curve is sampled by
  the Envelope's own `envValueAt`.

### `ce.components.ribbon`

- **Texts** for all 14, from `ribbonLayout.js` and the preview: a Pitch Wheel and a Mod Wheel are
  Ribbons with other defaults, which each note gives; `bipolar` sends -1 to 1 and fills from the
  middle; `snap()` steps a drag, not `value()`. The four return-spring verbs are the Crossfader's
  `returnVerbs`, worded for a strip.
- `editable`, `showGlow` and `showValue`, which were derived with a generic line, have texts of
  their own.

### `ce.components.kinetic`

- **`gravity` takes 0 ↔ 4 and `bounce` 0 ↔ 1**, what the physics plays (`kineticParams`): the
  inspector's field set widened both for a script (gravity -4, to pull up; bounce 1.5, for a wall
  that adds speed), and the engine played an upward pull as none and 1.5 as 1. The widening is gone
  from `inspectorFieldSets.js`, with a comment saying why.
- **A change to the launch throws the ball again** (an `$effect` in the preview): the running ball
  read `initial` only before its first frame, so `launch()` and `velocity()` were never seen once
  it ran. Same class as the Turing Machine's register.
- **Texts** for all 11: the units (boxes a second), the speed limit of 2.5, what `keepAlive` kicks.

### `ce.components.orbit`

- **`phase()` is a seek**, as the arp's and the Turing Machine's: the preview keeps the Orbit's
  position, and `provideComponentPhases` now answers and moves it. A stopped Orbit is drawn there
  and sends what its satellites say there at once (a counter, `sourceSought`, redraws it).
- **`bars` takes 0.25 ↔ 64 in quarters**, as `orbitCycleBars` plays it (whole bars 1 to 64 could
  not reach below 1); **`nodeDepth` takes 0 ↔ 1**, as `orbitNodes` clamps it (-1 to 0 was taken
  and sent 0).
- **Kept**: `nodeRatio` -16 ↔ 16 and `nodeAngle` -360 ↔ 360, wider than the inspector's, since the
  engine plays any; the texts say where the inspector stops.
- **Noticed, not changed**: what a node sends (its height, its place across, a sine of its angle,
  or its radius) and whether it is turned upside down have no verbs; the depth note says they are
  set in the inspector.

### `ce.components.looper`

- **`phase()` is a seek**, as the Orbit's.
- **`bars` takes 0.25 ↔ 64 in quarters**, as `looperLoopBars` plays it and the inspector offers it.
- **Texts** for all 12: a lane that is off, or has no recording, sends its rest value; `quantize`
  rounds the played length to whole beats and keeps the number set; a drag records a lane, replacing
  what it had.

### `ce.components.constellation`

- **`blend` takes 0.5 ↔ 16**, as `blendWeights` plays it (0.1 to 0.5 was taken and blended as 0.5);
  **`bars` takes 0.25 ↔ 64 in quarters**, as `constellationWanderBars` plays it.
- **Texts** for all 12. The probe's text said "the targets follow, which is the whole point", and
  in the preview they did not: see the next section.

### A script's write to a source is sent

Found on the Constellation, and true of every source: a script's `macro.value()`, `ribbon.value()`,
`crossfader.mix()`, `joystick.move()`, `timbre.move()`, `constellation.probe()`, a Mod Matrix cell or
an Envelope point moved what was drawn and left every bound parameter where it was. Only a drag, a
running ticker or an incoming signal sent a source's ports (`emitControlPortFanout`,
`emitClockFanout`). An `$effect` in the preview now sends a change to what a stored source sends,
once, as a commit:

- Not on opening, as before: what is stored was never sent on opening.
- Not what a drag has just sent and committed (`portsSentAs`), so a release is not sent twice.
- Not a running Orbit, Looper, Kinetic or wandering Constellation, whose ticker sends what it plays,
  nor a Router or a Turing Machine, which send on their own clock.

`browser-checks/componentBehavior.mjs` ("A script write to a source reaches its bound parameter
once") checks it on a Crossfader: it fails without the effect. That file is run by hand, not by
`runAll.mjs`; adding it to CI is the owner's call.

### `ce.components.panic`

- **Texts** for all 8, from `panicLayout.js` and the preview's `firePanic`: All Sound Off then All
  Notes Off on each channel; Reset All Controllers after them; a centred bend; `clearLocal` stops
  the panel's own note controls; `""` writes PANIC; the summary line is drawn on a button 46 pixels
  tall or more; the panic key works whether or not the button can be pressed, and sends the most.
- The summary no longer says pressing it is the global `panic()`, which sends no pitch bend and
  stops nothing on the panel.

## Checking each batch

From `CE/web`:

```bash
npm run docs:manual && npm run docs:help
(cd ../.. && node --import ./CE/web/test/support/register-svelte.mjs tools/scripts/gen-api-explorer.mjs)
npm run lint
npm test
```

`npm test` takes about four minutes. Then read the changed descriptions where people meet them:
`npm run dev` and the Insert picker, or the regenerated `docs/scripting-manual.md`.

CLAUDE.md's rules apply. `panelApi.js` is code, so no `[skip ci]` on a push that changes it.
Commit messages say what changed and why, end with the `Co-authored-by: Claude
<noreply@anthropic.com>` trailer, and name no model. Work on the branch the session is given and do
not open a pull request unless asked.

---

## Prompt for Claude Code

```
Read docs/design/api-descriptions-handoff.md and follow it, above all the sections "ce.anim: state
on 2026-10-22", "ce.draw: done", "ce.time: done" and "ce.components.lcd: done". ce.midi, ce.math,
ce.anim, ce.draw, ce.time and ce.components.lcd are done; the LCD's item-by-item review is done
too ("The owner's review, one item at a time", and "The LCD's script model", which changed what a
script can address), and so is its "line" wording. So are the LCD's script commands for a layout's
zones, by name as a Pixel Display's elements are ("Zones by name" in this file), and so is
ce.components.arp ("ce.components.arp: the owner's review" in this file, all fifteen items).
ce.components.pixel is done too ("ce.components.pixel: the owner's review" in this file). The
owner then said to continue through the modules and finish them without showing each item: take
each recommendation, record it here, and carry on with the next module by the table,
technical English, schematic, one rule per line, with ranges, as its table says, showing every
parameter and option of the command in its item. The component texts are generated from
componentVerbs.js (see the lcd section): a family's own doc, ex and argDocs are what to write. Check
each command at its edges in the runtime first, and put what is silent or wrong to me as a decision.
Show me one item at a time, its text now and every field as proposed, and wait for my answer before
the next.
```
