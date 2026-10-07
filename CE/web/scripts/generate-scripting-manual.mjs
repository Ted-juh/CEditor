// generate-scripting-manual.mjs — emit the user-facing scripting manual.
//
// panelApi.js is the single source of truth for the panel API (it already drives the
// picker, validation, and the host bindings); this script projects the same data into
// one readable markdown page, so the reference half of the manual can never drift from what
// the editor shows. The freshness test (test/scriptingManual.test.js) fails when the
// committed page is stale.
//
// THE PAGE IS A MANUAL, NOT A DUMP. Customers said the old page read like a specification: it
// opened on runtimes and toolchains, talked about "Phase 1b" and "the DPD", headed every entry with
// a spelling the examples underneath did not use, and promised availability badges the data never
// produced. So it is two parts. Part 1 is written prose — what a script is, when it runs, how it
// talks to the synth — in the words a musician uses. Part 2 is the generated reference, filed by
// module under the names the picker inserts (`ce.midi.sendCC`), with each member's option table
// and a plain note where it only works with the panel window open.
//
// The prose lives here rather than in a separate hand-written file because it quotes the data —
// the language table, the accessor table, the module groups — and a second file would let the two
// disagree.
//
// Output: docs/scripting-manual.md (repo root). Regenerate: `npm run docs:manual`.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  SCRIPT_LANGUAGES, SELF, VALUE_ACCESSORS,
  LIFECYCLE_HOOKS, CONTROL_EVENTS, PANEL_EVENTS, TIME_EVENTS, DEVICE_EVENTS, COMPONENT_EVENTS,
  MODULE_GROUPS, COMPONENT_GROUPS, moduleById, membersByModule, memberPath, memberRuntime,
  memberMapFor, namespacedSnippet, RUNTIME_ANY, RUNTIME_WEBVIEW, RUNTIME_PLAYER,
} from '../src/CE_Application/scripting/panelApi.js';
import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
// The canonical handler in every language — REAL, toolchain-validated source (the fixture
// behind `npm run test:script-exports`), so the cross-language appendix can never drift.
import { SOURCES, CTX_LANGUAGES } from './script-export-corpus.mjs';

export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/scripting-manual.md');

/* ------------------------------------------------------------------ hand-written data */
// Each of these is checked against the data it describes and throws when they disagree, so adding
// a language or a module without saying a word about it here fails the generator rather than
// leaving a silent hole in the page.

/** Where each language runs, in plain words. */
const LANGUAGE_NOTES = {
  lua: { editor: 'Yes', plugin: 'Yes', note: 'Small and quick. A good first choice.' },
  javascript: { editor: 'Yes', plugin: 'Yes', note: 'A good first choice if you already know it.' },
  typescript: { editor: 'Yes', plugin: 'Yes', note: 'JavaScript with types. Converted to JavaScript when you export.' },
  python: { editor: 'Yes', plugin: 'Yes', note: 'The export includes a Python interpreter when a script needs one, which makes the plugin larger.' },
  cpp: { editor: 'Yes, a large part of the language', plugin: 'Yes, compiled — the core commands only', note: 'See [Appendix B](#appendix-b-c-c-and-java).' },
  csharp: { editor: 'Yes, a large part of the language', plugin: 'Yes, compiled — the core commands only', note: 'See [Appendix B](#appendix-b-c-c-and-java).' },
  java: { editor: 'Yes, a large part of the language', plugin: 'Yes, compiled — the core commands only', note: 'See [Appendix B](#appendix-b-c-c-and-java).' },
};

/** One paragraph per module, introducing the chapter in Part 2. */
const MODULE_INTROS = {
  'ce.core': 'The commands nearly every script uses: reading and changing values, deciding whether a change is sent to the synth, listening for events, and printing to the script console. These are always available and are written without a `ce.` prefix: `set(…)`, `get(…)`, `on(…)`, `log(…)`. Three are the exception, because their short names would clash with words the languages already use: `ce.core.action`, `ce.core.warn` and `ce.core.error`, also known as `defineAction`, `logWarn` and `logError`.',
  'ce.midi': 'Sending MIDI yourself, and catching MIDI on its way in or out. Most panels do not need these, because a control bound to a synth parameter sends its own MIDI. Reach for them for messages the device profile does not cover: notes, program changes, clock, hand-built SysEx. Channels are always counted 1 to 16. The last part of this chapter is a set of helper functions for packing values into SysEx bytes.',
  'ce.device': 'Working with the synth through its device profile — the description of the synth\'s parameters, messages and dumps that you build in the Device Profile Designer. With a profile you work in parameter names and real values, and the profile turns them into MIDI. These commands ask the synth for its settings, recall presets, read and change parameters by name, and describe a synth from a script when it has no profile. `role` picks which device to talk to when a panel uses more than one; it defaults to "mainSynth".',
  'ce.music': 'Helper functions for notes and harmony: note names and numbers, scales, chords, keeping a note in key, and building arpeggios. They only calculate — nothing is sent anywhere.',
  'ce.time': 'Timers, and the musical clock. A timer runs your code later or repeatedly; the musical commands read the tempo and the song position, convert between beats and milliseconds, and help you step a sequence in time. Musical timing here is accurate to about a thirtieth of a second: right for lights, displays and stepping patterns, not for timing audio.',
  'ce.math': 'Helper functions for working out values: scaling a value from one range to another, curves, snapping, decibels, random numbers you can repeat, and colours. They only calculate — nothing changes on the panel until you pass the result to `set`.',
  'ce.anim': 'Moving a value smoothly over time instead of jumping: to a target, with a spring, or through a shape you draw. Moves can wait, repeat, follow the tempo, and call you back when they finish. These keep working when the plugin window is closed, so they can also sweep a synth parameter.',
  'ce.panel': 'Changing the panel itself from a script: creating, copying and removing controls, finding them, lining them up, and editing the lists inside a control such as its states and animations. Most of these need the panel window; each entry says so. While you preview, everything a script changes is put back when the preview stops — `ce.panel.keep` is how you keep it.',
  'ce.storage': 'Three ways to keep values for later. `state` holds them between one run of a handler and the next. Settings outlive the session: they can be stored with the panel, kept private to one script, or kept on this computer only. The JSON helpers turn a value into text and back.',
  'ce.draw': 'Drawing your own graphics on top of a control, from its script\'s onDraw. Set the colours and line style first, then draw shapes and text; everything is measured in pixels from the control\'s top-left corner.',
  'ce.image': 'The pictures a control shows — its background image and overlay, an image inside its text, and its icon — and the icon library they come from. These commands also tell you whether a picture will still be there after you export.',
  'ce.text': 'Fonts and lettering: which fonts are available, setting a control\'s type in one call, variable-font settings, and measuring text so it fits.',
  'ce.ui': 'Talking to the person using the panel: short messages, a line in the status bar, questions with buttons, a line of text to type, a pick from a list, and copying to the clipboard. For messages meant for you while you build the panel, use `log` instead.',
};

/** The five component families described by hand rather than by componentVerbs.js. */
const HAND_WRITTEN_COMPONENTS = {
  split: { label: 'Zone Splitter', summary: 'Splits the keyboard into zones, each with its own channel and transpose.' },
  phrase: { label: 'Phrase Sequencer', summary: 'A step grid whose rows are the notes of a scale.' },
  recorder: { label: 'Phrase Recorder', summary: 'Records what you play and loops it back.' },
  harmony: { label: 'Harmoniser', summary: 'Turns one played note into a whole chord.' },
  setlist: { label: 'Setlist', summary: 'Scenes you step through, for example from a footswitch.' },
};

/** A heading a reader can recognise for each module, after its ce.* name. */
const MODULE_TITLES = {
  'ce.core': 'values, events and the console',
  'ce.midi': 'sending and filtering MIDI',
  'ce.device': 'your synth',
  'ce.music': 'notes, scales and chords',
  'ce.time': 'timers and musical time',
  'ce.math': 'numbers, ranges and colours',
  'ce.anim': 'smooth movement',
  'ce.panel': 'building and arranging the panel',
  'ce.storage': 'remembering things',
  'ce.draw': 'drawing',
  'ce.image': 'images and icons',
  'ce.text': 'fonts and lettering',
  'ce.ui': 'messages and questions',
};

/* ------------------------------------------------------------------ helpers */

// Turn an editor snippet into display code: fill tab-stop placeholders, mark the places where the
// reader's own code goes with `…`.
function displaySnippet(s) {
  if (!s) return '';
  let out = s
    .replace(/\$\{\d+:([^}]*)\}/g, '$1') // ${1:path} -> path
    .replace(/\$\{\d+\}/g, '…')          // ${1}      -> …
    .replace(/\$\{(\w+)\}/g, '$1');      // ${e}      -> e
  out = out.replace(/^(\s*)\$0(\s*)$/gm, '$1…'); // $0 alone on a line -> …
  out = out.replace(/\$0/g, '');                 // trailing $0 on a call line
  out = out.replace(/\$[1-9]/g, '…');            // a bare tab stop is where your code goes
  out = out.replace(/\breturn\s*$/gm, 'return …');
  return out.trimEnd();
}

function codeBlocks(member) {
  const lua = displaySnippet(namespacedSnippet(member, 'lua') === (member.signature ?? '') ? '' : namespacedSnippet(member, 'lua'));
  const js = displaySnippet(namespacedSnippet(member, 'javascript') === (member.signature ?? '') ? '' : namespacedSnippet(member, 'javascript'));
  if (!member.snippet) return '';
  if (!lua && !js) return '';
  if (lua === js) return `\n\`\`\`lua\n${lua}\n\`\`\`\n`;
  return `\n\`\`\`lua\n-- Lua\n${lua}\n\`\`\`\n\`\`\`js\n// JavaScript\n${js}\n\`\`\`\n`;
}

/** The in-page anchor of a heading — GitHub's rule, which the in-app viewer shares. */
const anchor = (text) => String(text).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/ /g, '-');
const moduleHeading = (id) => `${id}: ${MODULE_TITLES[id]}`;
const moduleLink = (id) => `[${id}](#${anchor(moduleHeading(id))})`;

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The value list a field accepts, as a sentence fragment. */
function valuesText(values) {
  const quoted = values.map((v) => `"${v}"`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}` : quoted.join('');
}

/** A table of the fields an object argument holds. */
function fieldTable(param, lifecycle) {
  const intro = lifecycle
    ? `**\`${param.name}\`** holds:`
    : `**\`${param.name}\`** can contain:`;
  const withDefault = !lifecycle && param.fields.some((f) => f.default || f.required);
  const head = withDefault
    ? ['| Name | Type | Default | What it does |', '|---|---|---|---|']
    : ['| Name | Type | What it is |', '|---|---|---|'];
  const rows = param.fields.map((f) => {
    const type = f.unit ? `${f.type} (${f.unit})` : f.type;
    // The list, unless the description already names every value in it.
    const named = f.values?.every((v) => f.summary.includes(`"${v}"`));
    const values = f.values?.length && !named ? ` One of ${valuesText(f.values)}.` : '';
    const what = `${f.summary}${values}`;
    if (!withDefault) return `| \`${f.name}\` | ${cell(type)} | ${cell(what)} |`;
    const def = f.required ? 'required' : (f.default ?? '—');
    return `| \`${f.name}\` | ${cell(type)} | ${cell(def)} | ${cell(what)} |`;
  });
  return `\n${intro}\n\n${[...head, ...rows].join('\n')}\n`;
}

function fieldTables(member) {
  const lifecycle = member.kind === 'lifecycle';
  return (member.params ?? []).filter((p) => p.fields?.length).map((p) => fieldTable(p, lifecycle)).join('');
}

const PANEL_WINDOW_ONLY = 'Panel window only.';
const PLUGIN_ONLY = 'Exported plugin only — never runs in the editor.';

/** The notes line under a heading: short name and where it works. */
function notesLine(member, { moduleRuntime = RUNTIME_ANY } = {}) {
  const notes = [];
  const path = member.kind === 'lifecycle' ? member.id : memberPath(member.id);
  if (path !== member.id) notes.push(`Short name: \`${member.id}\``);
  const rt = memberRuntime(member);
  if (rt === RUNTIME_WEBVIEW && moduleRuntime !== RUNTIME_WEBVIEW) notes.push(PANEL_WINDOW_ONLY);
  if (rt === RUNTIME_PLAYER) notes.push(PLUGIN_ONLY);
  return notes.length ? `\n*${notes.join(' · ').replace(/([^.])$/, '$1.')}*\n` : '';
}

/** The signature as the reader types it: the module path in place of the flat name. */
function headingSignature(member) {
  const sig = member.signature ?? member.id;
  if (member.kind === 'lifecycle') return sig;
  const path = memberPath(member.id);
  return sig.startsWith(member.id) ? path + sig.slice(member.id.length) : sig;
}

function memberEntry(member, level, opts) {
  return `${'#'.repeat(level)} \`${headingSignature(member)}\`\n\n${member.summary}\n${notesLine(member, opts)}${fieldTables(member)}${codeBlocks(member)}`;
}

function helperTable(helpers) {
  const rows = helpers.map((h) => {
    const short = memberPath(h.id) !== h.id ? ` Short name: \`${h.id}\`.` : '';
    return `| \`${cell(headingSignature(h))}\` | ${cell(h.summary)}${short} |`;
  });
  return ['| Function | What it does |', '|---|---|', ...rows].join('\n');
}

function eventTable(events) {
  const rows = events.map((e) => `| \`${e.fn}(${e.payload ?? ''})\` | \`"${e.id}"\` | ${cell(e.summary)} |`);
  return ['| Handler | Name for `on` | When it fires, and what you get |', '|---|---|---|', ...rows].join('\n');
}

/* ------------------------------------------------------------------ the reference */

function languageTable() {
  const rows = SCRIPT_LANGUAGES.map((l) => {
    const n = LANGUAGE_NOTES[l.id];
    if (!n) throw new Error(`generate-scripting-manual: no LANGUAGE_NOTES entry for "${l.id}"`);
    return `| **${l.label}** | ${n.editor} | ${n.plugin} | ${n.note} |`;
  });
  return [
    '| Language | Runs in the editor | Runs in the exported plugin | Notes |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function moduleChapter(module, members) {
  const intro = MODULE_INTROS[module.id];
  const title = MODULE_TITLES[module.id];
  if (!intro || !title) throw new Error(`generate-scripting-manual: no intro or title for module "${module.id}"`);
  const windowOnly = module.runtime === RUNTIME_WEBVIEW
    ? `\n\nEverything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.`
    : '';
  const commands = members.filter((m) => m.kind !== 'helper');
  const helpers = members.filter((m) => m.kind === 'helper');
  const entries = commands.map((m) => memberEntry(m, 4, { moduleRuntime: module.runtime })).join('\n');
  const helperPart = helpers.length
    ? `\n#### Helper functions in ${module.id}\n\n${helperTable(helpers)}\n`
    : '';
  return `### ${moduleHeading(module.id)}\n\n${intro}${windowOnly}\n\n${entries}${helperPart}`;
}

function componentChapter(byModule, label) {
  const famById = Object.fromEntries(COMPONENT_FAMILIES.map((f) => [f.id, f]));
  const sections = COMPONENT_GROUPS.map((group) => {
    const items = group.modules.map((short) => {
      const id = `ce.components.${short}`;
      const fam = famById[short] ?? HAND_WRITTEN_COMPONENTS[short];
      if (!fam) throw new Error(`generate-scripting-manual: no description for component "${short}"`);
      if (!byModule.get(id)) throw new Error(`generate-scripting-manual: component module "${id}" has no members`);
      const names = Object.keys(memberMapFor(id)).map((n) => `\`${n}\``).join(', ');
      return `- **${fam.label}** — \`${id}\`. ${fam.summary} Commands: ${names}.`;
    });
    return `### ${group.label}\n\n${group.blurb}\n\n${items.join('\n')}`;
  });
  return `## Commands: ${label}

Many of CEditor's ready-made components — the Arpeggiator, the Envelope, the LCD and the rest —
can be driven from a script. Each component has a module of its own, named after it:
\`ce.components.arp.pattern("myArp", "up")\` sets the pattern of the arpeggiator called
\`myArp\`. They all follow the same pattern:

- The first argument is always the name of the component's control.
- A command that changes a setting tells you whether it took: true if it did, false — with a line
  in the script console saying why — if it did not, because the control is the wrong kind or the
  value is not one it accepts.
- Most commands that switch something on or off toggle it when you leave the value out:
  \`ce.components.arp.run("myArp")\` starts a stopped arpeggiator and stops a running one.
- \`read\` gives you the component's current settings.

Components live in the panel window, so these commands need the window open. The Script Editor's
picker lists every one of them with its description; here is what each component offers.

${sections.join('\n\n')}
`;
}

function reference() {
  const byModule = new Map(membersByModule().filter((g) => g.module).map((g) => [g.module.id, g.members]));
  const groups = MODULE_GROUPS.filter((g) => !g.componentGroups).map((group) => {
    const chapters = group.modules.map((id) => moduleChapter(moduleById(id), byModule.get(id) ?? []));
    return `## Commands: ${group.label}\n\n${group.blurb}\n\n${chapters.join('\n')}`;
  });
  const components = MODULE_GROUPS.some((g) => g.componentGroups)
    ? componentChapter(byModule, MODULE_GROUPS.find((g) => g.componentGroups).label)
    : '';
  return [...groups, components].join('\n');
}

/* ------------------------------------------------------------------ the page */

export function generateManual() {
  const FENCE_TAGS = { lua: 'lua', javascript: 'js', typescript: 'ts', python: 'python', cpp: 'cpp', csharp: 'csharp', java: 'java' };
  const crossLanguage = SCRIPT_LANGUAGES
    .filter((l) => SOURCES[l.id])
    .map((l) => `**${l.label}**\n\n\`\`\`${FENCE_TAGS[l.id] ?? ''}\n${SOURCES[l.id].trimEnd()}\n\`\`\``)
    .join('\n\n');
  const ctxLabels = SCRIPT_LANGUAGES.filter((l) => CTX_LANGUAGES.includes(l.id)).map((l) => l.label);

  const accessors = [
    '| Add to the path | What you get |',
    '|---|---|',
    ...VALUE_ACCESSORS.map((a) => `| \`${a.label}\` | ${cell(a.summary)} |`),
  ].join('\n');

  const hookRows = [
    ['onPanelLoad', 'The panel is opening; no controls exist yet.', 'Send the synth a start-up message.'],
    ['onPanelBuild', 'Before the controls appear.', 'Create or arrange controls from a script.'],
    ['onPanelReady', 'The controls exist. Runs again each time a plugin window reopens.', 'Ask the synth for its settings; fill the controls.'],
    ['onDraw', 'A control needs repainting.', 'Draw your own graphics on a control.'],
    ['onError', 'Any script on the panel failed.', 'Show the problem on the panel.'],
    ['onPanelClose', 'The panel window closes. Scripts keep running.', 'Stop things that only matter on screen.'],
    ['onPanelDestroy', 'The scripts are about to stop for good.', 'Send a final message to the synth.'],
    ['onDawSaveState', 'The DAW saves the project (exported plugin only).', 'Return what you want saved.'],
    ['onDawRestoreState', 'The DAW reopens the project (exported plugin only).', 'Read back what you saved.'],
  ];
  for (const [id] of hookRows) {
    if (!LIFECYCLE_HOOKS.some((h) => h.id === id)) throw new Error(`generate-scripting-manual: hook table names "${id}", which is not a hook`);
  }
  for (const h of LIFECYCLE_HOOKS) {
    if (!hookRows.some(([id]) => id === h.id)) throw new Error(`generate-scripting-manual: hook "${h.id}" is missing from the hook table`);
  }
  const hookTable = [
    '| Hook | When it runs | Typical use |',
    '|---|---|---|',
    ...hookRows.map(([id, when, use]) => `| \`${id}\` | ${when} | ${use} |`),
  ].join('\n');

  const hooks = LIFECYCLE_HOOKS.map((h) => memberEntry({ ...h, kind: 'lifecycle' }, 3)).join('\n');

  return `# CEditor Scripting Manual

This manual explains how to add behaviour to a CEditor panel with scripts, and describes every
command a script can use.

It has two parts. **Part 1** explains scripting from the ground up: what a script is, when it
runs, how it changes controls, and how it talks to your synth. Read it in order the first time.
**Part 2** is the reference: every hook, event and command, grouped by what it is for, so you can
look things up as you work.

Never written a CEditor script before? [Getting started](scripting-getting-started.md) walks you
through the screens step by step, and the [cookbook](scripting-cookbook.md) has ready-made
recipes for common jobs.

## Contents

**Part 1: Using scripts**

1. [What scripts are for](#1-what-scripts-are-for)
2. [Where scripts live](#2-where-scripts-live)
3. [When a script runs](#3-when-a-script-runs)
4. [Reading and changing the panel](#4-reading-and-changing-the-panel)
5. [Talking to your synth](#5-talking-to-your-synth)
6. [Hearing from your synth](#6-hearing-from-your-synth)
7. [Timers and musical time](#7-timers-and-musical-time)
8. [Remembering things](#8-remembering-things)
9. [When the plugin window is closed](#9-when-the-plugin-window-is-closed)
10. [Command names and modules](#10-command-names-and-modules)
11. [Choosing a language](#11-choosing-a-language)
12. [When something goes wrong](#12-when-something-goes-wrong)

**Part 2: Reference**

- [How to read the reference](#how-to-read-the-reference)
- [Numbers and units](#numbers-and-units)
- [Hooks](#hooks)
- [Events](#events)
${MODULE_GROUPS.map((g) => `- [Commands: ${g.label}](#${anchor(`Commands: ${g.label}`)})`).join('\n')}
- [Appendix A: The same script in every language](#appendix-a-the-same-script-in-every-language)
- [Appendix B: C++, C# and Java](#appendix-b-c-c-and-java)

---

# Part 1: Using scripts

## 1. What scripts are for

Most of a panel needs no code at all. You place a knob, bind it to a parameter of your synth, and
moving the knob changes the sound. A script is for everything the ordinary settings cannot do:

- making one control move another — a macro knob that turns three filters at once;
- reacting to the synth — showing the name of the patch it just switched to;
- asking the synth for all its settings when the panel opens, and filling every control;
- sending messages the device profile does not cover — notes, clock, a hand-built SysEx message;
- doing things on a timer — blinking a light, stepping through a pattern;
- changing how the panel looks while it runs, or asking the user a question.

Every script answers two questions: **when** should it run, and **what** should it do? The "when"
is a hook or an event, explained in [chapter 3](#3-when-a-script-runs). The "what" is your own
code plus the commands in Part 2.

Here is a complete script. It belongs to a knob, and whenever the knob is let go it sets two other
controls and sends a MIDI message:

\`\`\`lua
-- Lua
function onValueChanged(value)
  set("cutoff.value", scale(value, 0, 1, 80, 12000))
  set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
  sendCC(1, 74, round(value * 127))
end
\`\`\`
\`\`\`js
// JavaScript
function onValueChanged(value) {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
\`\`\`

\`onValueChanged\` is the moment: the knob was let go. \`set\` changes another control, \`scale\` turns
the knob's value — which runs from 0 to 1 on this knob — into a frequency, and \`sendCC\` sends a
Control Change on MIDI channel 1.

## 2. Where scripts live

A script belongs either to **one control** or to **the whole panel**.

- A control's script reacts to that control: it was turned, clicked, hovered over.
- A panel script looks after the panel as a whole: what happens when it opens, MIDI arriving from
  the synth, timers.

You write scripts in the **Behavior Designer**. Select a control and press **Script Editor** in the
Scripts / Logic area of the top bar. The left-hand side groups the scripts by when they run —
Startup, Ready, Runtime, DAW state and Shutdown — and the right-hand side is the code editor.
Two things help while you type:

- **The picker** lists every control on the panel with its properties, and every command with its
  description. Click an entry and the call is written into your script, in your language.
- **Checking as you type.** A misspelled control name, a command used where it cannot work, or a
  handler that will never be called shows up in the problems list straight away.

Scripts are saved inside the panel file and travel with it, into the exported plugin as well. Each
script is written in one language and is stored and run in that language; CEditor never converts
it.

### Trying a script out

Turn on the panel **preview** and use the panel: your scripts run straight away, as you type, with
nothing to build or save first. If something does not happen, open **Test / Trace**. It shows every
event, every value a script set, every MIDI message, every error and every \`log(…)\` line, in the
order they happened.

Preview is a rehearsal. When you turn it off, everything it changed is put back — a knob you
turned, a colour a script set, a control a script created — so you can run a script a hundred
times without it slowly rewriting the panel you are building. To keep something a script did, say
so with \`ce.panel.keep()\`. Two things cannot be put back: MIDI that was already sent, and
settings saved with \`ce.storage.saveSetting\`.

## 3. When a script runs

A script does nothing until something calls it. There are two kinds of moment that can.

### Hooks: moments in the panel's life

A hook is a function with a fixed name that CEditor calls at a fixed moment. Write the ones you
need and leave the rest out. Roughly in the order they happen:

${hookTable}

The two that matter most are \`onPanelLoad\` and \`onPanelReady\`. During \`onPanelLoad\` the controls
do not exist yet, so do not read or set them there. By \`onPanelReady\` they do. In a plugin,
\`onPanelReady\` runs again each time the window is reopened, so put work that should happen only
once inside \`if info.firstTime\`:

\`\`\`lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    ce.device.requestDump("patch")   -- ask the synth for its current sound
  end
end
\`\`\`
\`\`\`js
// JavaScript
function onPanelReady(info) {
  if (info.firstTime) {
    ce.device.requestDump("patch");  // ask the synth for its current sound
  }
}
\`\`\`

### Events: something happened

An event is something happening: a knob moved, a button was clicked, a note arrived from the synth,
a timer went off. There are two ways to react to one.

**A control's own events.** In a script that belongs to a control, write a function named after the
event. Nothing else is needed — the script already knows which control it belongs to:

\`\`\`lua
-- Lua, in the script of a button
function onClick(mouse)
  log("clicked at " .. mouse.x .. ", " .. mouse.y)
end
\`\`\`

**Anything else.** To react to another control, the panel, the synth, or a custom event, use
\`on(target, event, fn)\` and say what to listen to. \`"*"\` means "from anywhere":

\`\`\`lua
-- Lua
on("cutoff", "valueChanged", function(value)
  set("resonance.value", value * 0.5)
end)

on("*", "noteIn", function(note)
  log("note " .. note.note .. " on channel " .. note.channel)
end)
\`\`\`
\`\`\`js
// JavaScript
on("cutoff", "valueChanged", (value) => {
  set("resonance.value", value * 0.5);
});

on("*", "noteIn", (note) => {
  log("note " + note.note + " on channel " + note.channel);
});
\`\`\`

\`off(target, event)\` stops listening again.

Your function is given what it needs to know. When that is one thing, you get it directly:
\`onValueChanged(value)\`. When it is several things, you get one object that holds them:
\`onClick(mouse)\`, then \`mouse.x\` and \`mouse.y\`. The [events tables](#events) in Part 2 list
what each event gives you.

**Moving or let go?** Turning a knob raises two events. \`valueChange\` fires again and again while
it moves; \`valueChanged\` fires once when it settles. Use \`onValueChange\` for things on screen that
should follow the knob, and \`onValueChanged\` to tell the synth, so it is not flooded with every
step along the way.

**Your own events.** Scripts can talk to each other. One announces an event with
\`emit("name", data)\`; any script listening with \`on("*", "name", fn)\` is called with the data.
When you need an answer back, give a function a name with \`defineAction\` in one script and call it
with \`run\` from another.

## 4. Reading and changing the panel

Everything on the panel has an address, called a **path**: the control's name, then the property,
joined by dots. \`get\` reads a path and \`set\` changes it:

\`\`\`lua
-- Lua
local hz = get("cutoff.value")
set("cutoff.value", 8000)
set("button2.background.fill.colour", "#5B9BD5")
\`\`\`

Upper and lower case do not matter in a path. When you rename a control, CEditor updates the
name in every script for you. A path that leads nowhere is not an error: \`get\` returns nothing,
and \`set\` writes a line to the script console and carries on. So check what \`get\` gave you before
doing arithmetic with it.

### Three ways to read a value

A control's value can be read and written in three forms. Add the one you want to the end of the
path:

${accessors}

\`.normalizedValue\` is what you want most often in scripts that link controls. A filter cutoff
from 20 to 20000 Hz and a resonance from 0 to 100 do not share units, but both run from 0 to 1 as
positions:

\`\`\`lua
set("resonance.normalizedValue", get("cutoff.normalizedValue"))
\`\`\`

### The script's own control: self

${SELF.summary}

\`self.get("value")\` reads the value of the script's own control, and \`self.set("value", 0.5)\`
sets it. Write it with a dot, not a colon, in Lua as well.

### The panel itself

Paths that start with \`panel\` reach the panel rather than a control: \`get("panel.width")\`,
\`set("panel.bgColour", "FF202020")\`. Its name, size and background can be read and changed this
way; the things that identify the panel, such as its file path, can only be read.

## 5. Talking to your synth

### Controls send their own MIDI

A control that is bound to a parameter of your synth sends MIDI when its value changes — and that
includes changes made by a script. \`set("cutoff.value", 8000)\` moves the knob *and* sends the new
cutoff to the synth. The **device profile** works out the message: it is the description of your
synth's parameters, messages and dumps that you make in the Device Profile Designer. So a script
deals in parameter names and real values, and never needs to know the bytes.

### When nothing is sent

There is one exception, and it is deliberate. While a script is reacting to MIDI that came *from*
the synth, the values it sets are not sent back — otherwise the synth would receive its own
values as an echo, and a loop could start. You can change this either way for a block of code:

- \`noTransmit(fn)\` runs \`fn\` without sending anything. Use it when one click sets many controls,
  such as an Init Patch button, and you would rather send one dump at the end than fifty
  separate messages.
- \`transmit(fn)\` runs \`fn\` and sends its changes even while reacting to the synth.

\`\`\`lua
-- Lua
function onClick(mouse)
  noTransmit(function()
    set("cutoff.value", 8000)
    set("resonance.value", 20)
    set("envAmount.value", 0)
  end)
  ce.device.sendDump("patch")   -- one message with everything
end
\`\`\`
\`\`\`js
// JavaScript
function onClick(mouse) {
  noTransmit(() => {
    set("cutoff.value", 8000);
    set("resonance.value", 20);
    set("envAmount.value", 0);
  });
  ce.device.sendDump("patch");  // one message with everything
}
\`\`\`

### Sending MIDI yourself

For anything the device profile does not cover, send the message directly: \`sendCC\`,
\`sendNRPN\`, \`sendNote\`, \`sendProgramChange\`, \`sendSysex\` and the rest of
${moduleLink('ce.midi')}. MIDI channels are always numbered 1 to 16, as on the
synth's display; CEditor does the conversion.

\`\`\`lua
sendCC(1, 74, 100)          -- CC 74, value 100, on channel 1
sendNote(1, "C4", 100, 500) -- play middle C for half a second
\`\`\`

### Presets, dumps and parameters

- \`ce.device.requestDump("patch")\` asks the synth for all its current settings in one message.
  When it arrives, the controls bound to those parameters are filled in for you.
- \`ce.device.sendDump("patch")\` sends the panel's current values to the synth in one message.
- \`ce.device.recallPreset(slot)\` switches the synth to a stored preset, using whatever message that
  synth needs.
- \`ce.device.write(id, value)\` changes a parameter by name without needing a control for it, and
  \`ce.device.read(id)\` gives you the last value the synth reported.

A panel can talk to more than one device. Each one is given a **role**, such as "mainSynth" (the
default). Commands that take a \`role\` argument use it to pick the device; \`ce.midi.route(role, fn)\`
sends everything inside \`fn\` to another device.

## 6. Hearing from your synth

When the synth sends something, CEditor raises an event. Start with the events at the top of this
list — they arrive already decoded by the device profile — and use the raw ones only for things the
profile does not describe:

- \`onParameterReceived(info)\` — the synth reported a parameter: \`info.parameter\`, \`info.value\`.
- \`onDumpReceived(dump)\` — a whole dump arrived; the bound controls are already filled in.
- \`onPresetChange(preset)\` — the synth switched preset, or the panel switched it.
- \`onNoteIn(note)\`, \`onNoteOffIn(note)\`, \`onCcIn(cc)\` — notes and controllers, decoded from MIDI.
- \`onMidiIn(midi)\`, \`onSysexIn(bytes)\` — any message, exactly as it arrived.

Each of these is a panel event: write the function in a panel script, or listen with
\`on("*", "presetChange", fn)\` from anywhere.

\`\`\`lua
-- Lua, in a panel script
function onPresetChange(preset)
  ce.ui.status("Preset: " .. preset.name)
end
\`\`\`
\`\`\`js
// JavaScript, in a panel script
function onPresetChange(preset) {
  ce.ui.status("Preset: " + preset.name);
}
\`\`\`

Remember the rule from the previous chapter: anything you \`set\` while handling one of these
events is not sent back to the synth.

## 7. Timers and musical time

To run code later, or again and again, use a timer:

\`\`\`lua
-- Lua
local lit = false

function onPanelReady(info)
  ce.time.startTimer("blink", 500)        -- every half second
end

function onTimer(info)
  if info.id == "blink" then
    lit = not lit
    set("led.background.fill.colour", lit and "#FF4000" or "#301000")
  end
end
\`\`\`
\`\`\`js
// JavaScript
let lit = false;

function onPanelReady(info) {
  ce.time.startTimer("blink", 500);       // every half second
}

function onTimer(info) {
  if (info.id === "blink") {
    lit = !lit;
    set("led.background.fill.colour", lit ? "#FF4000" : "#301000");
  }
}
\`\`\`

- \`ce.time.startTimer(id, ms)\` repeats every \`ms\` milliseconds and calls \`onTimer\` with
  \`info.id\` set to the name you gave it. \`ce.time.stopTimer(id)\` stops it.
- \`ce.time.after(ms, fn)\` runs \`fn\` once, later.
- \`ce.time.syncTimer(id, beats)\` and \`ce.time.afterBeats(beats, fn)\` do the same in beats, and
  follow the tempo.
- \`onBeat\`, \`onBar\` and \`onTransport\` tell you when a beat or bar passes and when playback
  starts or stops.

Musical timing is accurate to about a thirtieth of a second. That is plenty for lights, displays
and stepping a pattern, but not for timing audio: leave that to the synth.

## 8. Remembering things

Variables in your script last only as long as the script does. CEditor gives you three places to
keep things for longer:

- **\`ce.storage.state\`** keeps values between one run of a handler and the next — a counter, the
  last note played. It is private to the script and starts empty whenever the script is reloaded.
- **Settings** — \`ce.storage.saveSetting(key, value)\` and \`ce.storage.loadSetting(key, fallback)\` —
  last beyond the session. A setting can be stored with the panel (the default), kept private to one
  script, or kept on this computer only.
- **The DAW project.** In an exported plugin, \`onDawSaveState\` lets you add your own values to the
  project when the DAW saves it, and \`onDawRestoreState\` gives them back when the project is
  reopened.

## 9. When the plugin window is closed

Your scripts can run in two places:

1. **With the panel window open.** That is the editor's preview, and the plugin's window when
   someone has it open in their DAW.
2. **With the window closed.** In a DAW, people close plugin windows all the time. The plugin
   keeps working, and so do your scripts: timers keep ticking and MIDI keeps arriving. There is
   just nothing on screen.

Most commands work the same in both places. A few need the window, because they deal with what
is on screen: drawing, images and fonts, messages and questions, the ready-made components, and
building the panel. With the window closed they do nothing and write a note to the log instead.
In the reference these are marked **${PANEL_WINDOW_ONLY.replace(/\.$/, '')}**, or the whole
chapter says so. Two hooks work the other way round: \`onDawSaveState\` and \`onDawRestoreState\`
only run in the exported plugin, because only a DAW saves projects.

So if a script must keep working with the window closed — a timer that keeps sending MIDI, for
example — use only commands without that mark. A script can also check while it runs:
\`ce.has("ce.draw")\` is true only when drawing is available right now.

## 10. Command names and modules

Commands are grouped into **modules** by what they are for: \`ce.midi\` for MIDI, \`ce.device\` for
the synth, \`ce.time\` for timers, and so on. A command's full name says which module it is in:
\`ce.midi.sendCC\`, \`ce.time.startTimer\`. The picker writes these full names for you, and Part 2
is organised by them.

The basic commands — \`set\`, \`get\`, \`on\`, \`log\` and the others in
${moduleLink('ce.core')} — are used so often that they have no prefix.

Most commands also have a **short name** that works on its own: \`sendCC\` for \`ce.midi.sendCC\`,
\`startTimer\` for \`ce.time.startTimer\`. Both names do exactly the same thing, so use whichever
you prefer. Where the short name is different from the end of the full name, the reference says
what it is — \`deviceRead\` for \`ce.device.read\`, for example.

You do not normally need to think about modules: CEditor switches on the ones your scripts use.
If you choose them by hand instead, in the **Scripting Modules** list on the Export tab, a command
from a module you left out does nothing and prints a message naming the module to add. Leaving the
list empty lets CEditor choose again.

## 11. Choosing a language

The commands are the same in every language. Choose the one you are most comfortable with; if
you have no preference, Lua and JavaScript are the simplest and run everywhere.

${languageTable()}

In Lua, JavaScript, TypeScript and Python every command is a plain function: \`set(…)\`,
\`sendCC(…)\`. In ${ctxLabels.join(', ').replace(/, ([^,]*)$/, ' and $1')}, a handler is given an object called \`ctx\` and
the commands are reached through it: \`ctx.set(…)\`, \`ctx.sendCC(…)\` — in C#, \`ctx.SetValue(…)\`
and \`ctx.SendCC(…)\`. [Appendix A](#appendix-a-the-same-script-in-every-language) shows one script
in every language. The examples in this manual are in Lua and JavaScript.

## 12. When something goes wrong

One rule holds everywhere: **a broken script never takes the panel down with it.** In practice:

- **A script fails.** That one handler stops; every other script and the panel carry on. The error
  is shown in the editor's script console with the script's name, and in an exported plugin it is
  written to the log file. It is never silent, and it never pops up a dialog. If you want the panel
  to show it, write an \`onError\` hook.
- **\`set\` names a control that does not exist.** A line appears in the script console
  (\`set: control "…" not found on the active panel\`) and the script continues.
- **\`get\` names a control or property that does not exist.** It returns nothing — \`nil\` in Lua,
  \`undefined\` in JavaScript, \`None\` in Python — so check before doing arithmetic with it.
- **A component command is aimed at the wrong kind of control** (an arpeggiator command at a knob,
  say). A line in the console says what was expected, and nothing changes.
- **A command is given a value it does not know** — an unknown scene name, a step outside the grid.
  Nothing happens, and a line in the console says why, so a button never just seems dead.
- **A script runs away** — an endless loop, a function that calls itself forever, a flood of MIDI.
  Safety limits stop it without disturbing the panel, and say so in the console.

Scripts can only reach the panel and the commands in this manual: no files, no network, nothing
else on your computer.

---

# Part 2: Reference

## How to read the reference

Each command is shown the way you type it, with its arguments:

- **\`[ ]\`** marks an argument you can leave out: \`ce.time.after(ms, fn)\` needs both, while
  \`ce.ui.dismiss([id])\` works with or without one.
- **\`->\`** says what the command gives back: \`ce.midi.checksum(…) -> number\`. "Returns nothing"
  means \`nil\` in Lua, \`undefined\` in JavaScript and \`None\` in Python.
- **\`opts\`** is a table (Lua) or object (JavaScript) of optional settings, such as
  \`{ duration = 500 }\` or \`{ duration: 500 }\`. When a command takes one, a table lists what it can
  contain and what each setting is when you leave it out.
- ***Short name*** gives the other name a command answers to (see
  [chapter 10](#10-command-names-and-modules)).
- ***${PANEL_WINDOW_ONLY.replace(/\.$/, '')}*** means the command needs the panel window
  ([chapter 9](#9-when-the-plugin-window-is-closed)).

Examples are in Lua and JavaScript; when the two are written the same way, there is one example.
A \`…\` in an example is where your own code goes.

## Numbers and units

The same conventions hold everywhere:

| What | Range or form |
|---|---|
| MIDI channel | **1 to 16**, as on the synth (CEditor converts it for the wire) |
| CC number, 7-bit value | 0 to 127 |
| NRPN value | 0 to 16383 (14-bit) |
| Note number | 0 to 127; middle C is **C4 = 60** |
| \`.normalizedValue\` | 0 to 1 |
| Colours | \`"#RRGGBB"\` text, such as \`"#5B9BD5"\` |
| Times | milliseconds |
| Keys and scale degrees | key: 0 = C … 11 = B; degrees count from 1 |
| Scenes and sequencer steps | count from 1, or by name where the command says so |
| Preset slots | count from 0, across all banks, as the device profile numbers them |

## Hooks

Hooks are the functions CEditor calls at fixed moments; [chapter 3](#3-when-a-script-runs) explains
them. Define the ones you need and leave the rest out.

${hooks}
## Events

To handle one of a control's own events, write the handler function in that control's script. To
handle anything else, use \`on(target, "name", fn)\` with the name from the second column.
[Chapter 3](#3-when-a-script-runs) explains both.

### Control events

Raised by the control the script belongs to.

${eventTable(CONTROL_EVENTS)}

### Panel events

${eventTable(PANEL_EVENTS)}

### Time events

Raised while the transport plays. Accurate to about a thirtieth of a second — right for lights and
displays, not for timing audio.

${eventTable(TIME_EVENTS)}

### Synth and MIDI events

Raised when something arrives from a device. Values you \`set\` while handling these are not sent
back to the synth ([chapter 5](#5-talking-to-your-synth)).

${eventTable(DEVICE_EVENTS)}

### Component events

Raised by the ready-made components. Listen with \`on("*", "step", fn)\` to hear from every
component, or put the component's name in place of \`"*"\`. These need the panel window.

${eventTable(COMPONENT_EVENTS)}

${reference()}
---

# Appendix A: The same script in every language

The script from [chapter 1](#1-what-scripts-are-for), written in every language CEditor supports.
These are not hand-copied: each one is checked by that language's own tools whenever CEditor is
built, so they always work as shown.

${crossLanguage}

# Appendix B: C++, C# and Java

In the editor, C++, C# and Java scripts are run directly from their source, so a handler moves real
controls as you type, without a compiler. This covers a large part of each language: functions and
lambdas, structs with methods, enums, \`if\`, \`for\`, \`while\` and \`switch\`, range-for, the
common containers (\`vector\`, \`array\`, \`map\`, \`string\`) and their everyday methods, the
\`<algorithm>\` and \`<numeric>\` functions, \`try\`/\`catch\`, casts, and \`printf\` and
\`std::cout\`, which print to the script console.

It does not cover templates you write yourself, classes (use structs instead), pointer arithmetic,
\`goto\`, or other libraries. Using one of those gives a clear error rather than a wrong result.
Note that every number is a decimal number in the editor, so dividing two whole numbers is not
rounded down.

**In the exported plugin these scripts are compiled**, and only the core commands are available
there: \`set\` and \`get\` (also spelled \`setValue\` and \`getValue\`), \`log\`, \`sendCC\`,
\`sendNRPN\`, \`sendSysex\` (a list of bytes or hex text), and \`clamp\`, \`scale\`, \`round\`,
\`snap\`, \`lerp\` and \`curve\`, which give exactly the same answers as in the editor. In C# each of
these also has its capitalised .NET name (\`SetValue\`, \`Log\`, \`SendCC\`, \`Scale\` …), the event's
fields are \`e.Value\` and \`e.FirstTime\`, and the handler may be called \`OnValueChanged\`.
Everything else that \`ctx\` offers works in the editor but not in the exported plugin — so keep a
script you mean to export to this core, or write it in Lua or JavaScript.

Two more things to know:

- In Java, \`ctx.get\` returns an \`Object\`, because a value can be a number, text or true/false.
  Read it as the type you want with \`ctx.getDouble\`, \`ctx.getInt\`, \`ctx.getString\` or
  \`ctx.getBoolean\`, which work the same in the editor and the plugin and never fail:
  \`getDouble\` gives a number as it is, true/false as 1 or 0 and anything else as 0; \`getInt\` is
  the same with the fraction dropped; \`getString\` gives text, or \`""\` for anything else;
  \`getBoolean\` gives true/false, or whether a number is not zero. Do not write
  \`(int) ctx.get(…)\` or \`(Integer) ctx.get(…)\`: it compiles, then fails, because a number comes
  back as a \`Double\`. The editor points out such a read, with the typed read to use instead.
- Only the handler for the script's own event is compiled, and \`setup\` is not called, so listeners
  added there with \`on(…)\` work in the editor only.

---

*This manual is generated from the same list of commands the editor uses, so it always matches
your version of CEditor. To change it, edit \`CE/web/src/CE_Application/scripting/panelApi.js\` or
\`CE/web/scripts/generate-scripting-manual.mjs\` and run \`npm run docs:manual\` in \`CE/web\`.*
`;
}

/* --------------------------------------------------------------------- main */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, generateManual());
  console.log(`wrote ${OUT}`);
}
