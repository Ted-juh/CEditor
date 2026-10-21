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
3. **Give one example with its result when it says more than words would.**
   `setBits(0xB4, 4, 3, 5)` gives 0xD4 is clearer than any sentence about bit positions.
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

### Before and after

| Command | Now | Plainer |
| --- | --- | --- |
| `ce.midi.setBits` | Write `bits` into the `count` bits starting at bit `start`, and return the result: a number for a number, a new list for a list (the one passed in is not changed). | Replace some of the bits in a byte. `setBits(0xB4, 4, 3, 5)` puts 5 into bits 4–6 and gives 0xD4. |
| `ce.midi.getBits` | Read `count` bits starting at bit `start` (counted from 0, lowest bit first), the way synths pack several settings into one byte: `getBits(0xB4, 4, 3)` is 3. | Read a group of bits from a byte. `getBits(0xB4, 4, 3)` reads bits 4–6 and gives 3. |
| `ce.midi.read` | Read the number stored in `count` bytes (1 to 4) starting at `offset`, which counts from 0 in every language, as dump layouts do. … | Read a number from a SysEx message. `ce.midi.read(msg, 23, 1)` reads byte 23. |
| `ce.math.clamp` | Keep a value inside a range: anything below `lo` becomes `lo`, anything above `hi` becomes `hi`, and anything in between comes back unchanged. | Keep a value inside a range. `clamp(140, 0, 127)` gives 127. |
| `ce.panel.batch` | Run `fn` so that everything it changes is undone in a single step, which is useful when a script builds or rearranges a whole page. The changes appear together when `fn` finishes, though code inside `fn` already sees its own earlier changes. … (five sentences) | Make a set of changes count as one step, so a single undo takes them all back. Useful when a script builds or rearranges a whole page. |

These are proposals, not final text: the first batch goes to the owner before the rest is done.
Where a rewrite drops a fact, the fact moves to a parameter. `ce.panel.batch`'s "`fn` must not
wait" and "the exported plugin has no undo" go to `fn`'s description, for example.

Already fine, leave alone: `ce.midi.checksum`, `ce.panel.grid` ("Arrange controls in a grid of equal
cells, each as big as the largest control."), `ce.device.write`, `ce.midi.toNibbles`.

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

- **The Insert picker** (`editor/ScriptPicker.svelte`): the whole description under each command, and
  its search.
- **The hover card and completion** (`scripting/languageService.js`): the whole description.
- **The scripting manual**, `docs/scripting-manual.md`, generated by `npm run docs:manual` (in
  `CE/web`). `test/scriptingManual.test.js` fails when it is stale.
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

One module per commit, with the before and after in the commit message. The first module, `ce.midi`,
goes to the owner as a before/after table before anything else is changed; their answer may change
the rules above.

How many descriptions each module has, and how many need the most work (first sentence built on
parameter names, with a bracketed aside, or over 25 words):

| Module | Descriptions | Need most work |
| --- | --- | --- |
| ce.midi | 44 | 29 |
| ce.math | 61 | 35 |
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
Read docs/design/api-descriptions-handoff.md and follow it. Rewrite the scripting API's command
descriptions in plain language by its rules, starting with ce.midi only. Before changing any file,
show me a before/after table for every ce.midi command, with anything you would move to a
parameter's description marked, and wait for my answer.
```
