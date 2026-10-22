# Plain descriptions for the scripting API — handoff

Every scripting command has a description: the `summary` in its API entry. It is the text under a
command in the Insert picker, in the hover card, in the scripting manual and in the API explorer.
Too many of them read badly. This file says what to change, where the text lives, how to check it
and in what order to work.

To start a session on it, paste [the prompt at the end](#prompt-for-claude-code).

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

Next: `ce.anim`, the same way: one command at a time.

How many descriptions each module has, and how many need the most work (first sentence built on
parameter names, with a bracketed aside, or over 25 words):

| Module | Descriptions | Need most work |
| --- | --- | --- |
| ce.midi | 44 | 29, all done |
| ce.math | 61 | 35, all done |
| ce.anim | 12 | 12 |
| ce.draw | 27 | 18 |
| ce.time | 22 | 15 |
| ce.components.lcd | 37 | 22 |
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
Read docs/design/api-descriptions-handoff.md and follow it. The first batch, ce.midi and ce.math are
done; rewrite the ce.anim descriptions by its rules and fields (summary, example, params[].summary,
returns, notes). Before changing any file, show me one command at a time, its text now and every
field as proposed, and wait for my answer before the next.
```
