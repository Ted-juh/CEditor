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
the most work).

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
- `verbNotes`: what the call returns (true; already that way: true with a console line; rejected:
  false), a verb's own `notes` first.
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
| ce.components.arp | 30 | 15 |
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
ce.anim, ce.draw, ce.time and ce.components.lcd are done; continue with ce.components.arp, in
technical English, schematic, one rule per line, with ranges, as its table says, showing every
parameter and option of the command in its item. The component texts are generated from
componentVerbs.js (see the lcd section): a family's own doc, ex and argDocs are what to write. Check
each command at its edges in the runtime first, and put what is silent or wrong to me as a decision.
Show me one item at a time, its text now and every field as proposed, and wait for my answer before
the next.
```
