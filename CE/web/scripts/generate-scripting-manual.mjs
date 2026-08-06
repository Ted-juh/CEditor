// generate-scripting-manual.mjs — emit the user-facing scripting reference manual.
//
// panelApi.js is the single source of truth for the panel API (it already drives the
// picker, validation, and the host bindings); this script projects the same data into
// one readable markdown page, so the manual can never drift from what the editor shows.
// The freshness test (test/scriptingManual.test.js) fails when the committed page is stale.
//
// Output: docs/scripting-manual.md (repo root). Regenerate: `npm run docs:manual`.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  SCRIPT_LANGUAGES, TIER1_LANGUAGES, SELF, VALUE_ACCESSORS,
  LIFECYCLE_HOOKS, CONTROL_EVENTS, PANEL_EVENTS, DEVICE_EVENTS,
  COMMANDS, HELPERS,
} from '../src/CE_Application/scripting/panelApi.js';
// The canonical handler in every language — REAL, toolchain-validated source (the fixture
// behind `npm run test:script-exports`), so the cross-language section can never drift.
import { SOURCES, CTX_LANGUAGES } from './script-export-corpus.mjs';

export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/scripting-manual.md');

/* ------------------------------------------------------------------ helpers */

// Turn an editor snippet into display code: fill tab-stop placeholders, drop the
// final-cursor marker (leaving `…` where a block body goes).
function displaySnippet(s) {
  if (!s) return '';
  let out = s
    .replace(/\$\{\d+:([^}]*)\}/g, '$1') // ${1:path} -> path
    .replace(/\$\{(\w+)\}/g, '$1');      // ${e}      -> e
  out = out.replace(/^(\s*)\$0(\s*)$/gm, '$1…'); // $0 alone on a line -> …
  out = out.replace(/\$0/g, '');                 // trailing $0 on a call line
  return out.trimEnd();
}

function scopeLine(member) {
  if (!member.scopes || member.scopes === 'any') return '';
  return `\n*Valid in ${member.scopes.join(' / ')} scripts only.*\n`;
}

// Availability badge (see the legend in the intro). Absent = available everywhere, no line.
function availabilityLine(member) {
  const a = member.availability;
  if (!a) return '';
  const mark = (ok) => (ok ? '✅' : '⬜');
  return `\n*Availability: preview ${mark(a.preview)} · export ${mark(a.export)}${a.note ? ` — ${a.note}` : ''}*\n`;
}

function availabilityCell(e) {
  const a = e.availability;
  if (!a) return 'everywhere';
  const mark = (ok) => (ok ? '✅' : '⬜');
  return `preview ${mark(a.preview)} · export ${mark(a.export)}${a.note ? ` — ${a.note}` : ''}`;
}

function payloadCell(e) {
  if (!e.payload) return '—';
  const fields = e.fields?.length ? ` (${e.fields.map((f) => `\`.${f}\``).join(' ')})` : '';
  return `\`${e.payload}\`${fields}`;
}

function codeBlocks(member) {
  const lua = displaySnippet(member.snippet?.lua);
  const js = displaySnippet(member.snippet?.javascript);
  if (!lua && !js) return '';
  if (lua === js) return `\n\`\`\`lua\n${lua}\n\`\`\`\n`;
  return `\n\`\`\`lua\n-- Lua\n${lua}\n\`\`\`\n\`\`\`js\n// JavaScript\n${js}\n\`\`\`\n`;
}

function memberSection(member) {
  return `### \`${member.signature}\`\n\n${member.summary}\n${scopeLine(member)}${availabilityLine(member)}${codeBlocks(member)}`;
}

function eventTable(events) {
  const withWhere = events.some((e) => e.availability);
  const rows = events.map((e) => {
    const base = `| \`"${e.id}"\` | \`${e.fn}(${e.payload ?? ''})\` | ${payloadCell(e)} | ${e.summary} |`;
    return withWhere ? `${base} ${availabilityCell(e)} |` : base;
  });
  const head = withWhere
    ? ['| Event | Handler | Payload | Fires when | Where |', '|---|---|---|---|---|']
    : ['| Event | Handler | Payload | Fires when |', '|---|---|---|---|'];
  return [...head, ...rows].join('\n');
}

function helperTable(helpers) {
  const rows = helpers.map((h) => `| \`${h.signature}\` | ${h.summary} |`);
  return ['| Helper | What it does |', '|---|---|', ...rows].join('\n');
}

/* ------------------------------------------------------------------ sections */

export function generateManual() {
  const languages = [
    '| Language | Version | Runs live in the editor | Runtime |',
    '|---|---|---|---|',
    ...SCRIPT_LANGUAGES.map((l) => {
      const live = l.live ? (l.subset ? '✅ (interpreted subset)' : '✅') : '⬜ preview only';
      return `| **${l.label}**${TIER1_LANGUAGES.includes(l.id) ? ' (Tier 1)' : ''} | ${l.version} | ${live} | ${l.host} |`;
    }),
  ].join('\n');

  // "The same script in every language" — straight from the validated corpus fixture.
  const FENCE_TAGS = { lua: 'lua', javascript: 'js', typescript: 'ts', python: 'python', cpp: 'cpp', csharp: 'csharp', java: 'java' };
  const crossLanguage = SCRIPT_LANGUAGES
    .filter((l) => SOURCES[l.id])
    .map((l) => {
      const ctx = CTX_LANGUAGES.includes(l.id) ? ' *(ctx-based)*' : '';
      return `**${l.label}**${ctx}\n\n\`\`\`${FENCE_TAGS[l.id] ?? ''}\n${SOURCES[l.id].trimEnd()}\n\`\`\``;
    })
    .join('\n\n');

  // One line of context for the component-command categories: what the component is,
  // and where its full story lives. `target` semantics are shared by all of them.
  const COMPONENT_DOCS = '../CE/web/src/CE_Application/docs';
  const CATEGORY_NOTES = {
    'Zone Splitter': `Drive the [Zone Splitter](${COMPONENT_DOCS}/zone-splitter.md) — keyboard zones with per-zone routing. \`target\` is the component's control name.`,
    'Phrase Sequencer': `Drive the [Phrase Sequencer](${COMPONENT_DOCS}/phrase-sequencer.md) — a step grid whose rows are scale degrees. \`target\` is the component's control name.`,
    'Phrase Recorder': `Drive the [Phrase Recorder](${COMPONENT_DOCS}/phrase-recorder.md) — the note looper. \`target\` is the component's control name.`,
    'Harmoniser': `Drive the [Harmoniser](${COMPONENT_DOCS}/harmoniser.md) — one finger in, a full chord out. \`target\` is the component's control name.`,
    'Setlist': `Drive the [Setlist](${COMPONENT_DOCS}/setlist.md) — scenes on a footswitch. \`target\` is the component's control name.`,
    'Arpeggiator': `Drive the [Arpeggiator](${COMPONENT_DOCS}/arpeggiator.md) — held notes walked as a pattern. \`target\` is the component's control name.`,
    'Turing Modulator': `Drive the [Turing Modulator](${COMPONENT_DOCS}/turing-modulator.md) — the locking random looper. \`target\` is the component's control name.`,
    'Gesture Looper': `Drive the [Gesture Looper](${COMPONENT_DOCS}/gesture-looper.md) — recorded control motion on a loop. \`target\` is the component's control name.`,
  };

  const commandsByCategory = new Map();
  for (const c of COMMANDS) {
    if (!commandsByCategory.has(c.category)) commandsByCategory.set(c.category, []);
    commandsByCategory.get(c.category).push(c);
  }

  const helpersByCategory = new Map();
  for (const h of HELPERS) {
    if (!helpersByCategory.has(h.category)) helpersByCategory.set(h.category, []);
    helpersByCategory.get(h.category).push(h);
  }

  const accessors = [
    '| Accessor | What you get |',
    '|---|---|',
    ...VALUE_ACCESSORS.map((a) => `| \`${a.label}\` | ${a.summary} |`),
  ].join('\n');

  return `# CEditor Scripting Manual

> **Generated file — do not edit by hand.**
> Source of truth: \`CE/web/src/CE_Application/scripting/panelApi.js\` (the same data that drives
> the editor's picker and validation). Regenerate with \`npm run docs:manual\` in \`CE/web\`.
> First script? Start with [getting started](scripting-getting-started.md), then the
> [cookbook](scripting-cookbook.md); reading order for everything is in the [docs index](README.md).

A script is a piece of code plus the moment it runs. That moment is either a lifecycle hook
(like "the panel just loaded") or an event (like "this knob moved"). Every language uses the
same commands, described below. A script is stored and run in the language you wrote it in.
It is never converted.

## Languages

${languages}

## Where scripts run

Your scripts can run in two places:

- **preview** — the panel window. This is the editor's live preview, and also the window of
  the exported plugin. Scripts run here while the window is on screen.
- **export** — the exported standalone or VST3 plugin itself. Its script engines keep running
  even when the window is closed. Timers keep ticking. MIDI keeps arriving.

Most commands work the same in both places. Those carry no badge. A command carries a badge
only when the two places differ: ✅ means it works there today, ⬜ means it does not yet, and
the note says why. Commands that need the window (drawing, dialogs, the on-screen components)
do nothing with the window closed, and a note goes to the log.

If your script must keep working with the window closed, for example a timer that keeps
sending MIDI, check the badges and use only commands that work in both places.

A script can also ask at run time. \`ce.has("ce.draw")\` is true only when that module is both
switched on and reachable from where the script is running, so a panel-view module answers false
with the window closed. \`ce.modules\` lists what this script has, \`ce.runtime\` says which of
the two places it is in, and \`ce.language\` names the language it is written in. All four are on
the \`ce\` namespace itself rather than inside a module, so they have no reference entry below.

## The same script in every language

The same handler, written out in every language. These are real files: each one is put through
that language's own toolchain by \`npm run test:script-exports\`, so none of them can go stale.
The commands reach your handler in one of two ways:

- **Lua / JavaScript / TypeScript / Python** — every command is a plain global function:
  \`set()\`, \`sendCC()\`, …
- **C++ / C# / Java** *(ctx-based)* — your handler takes \`(ctx, event)\`, and the same commands
  hang off \`ctx\` (C# uses .NET naming: \`ctx.SetValue\`, \`ctx.SendCC\`).

${crossLanguage}

The reference sections below show Lua and JavaScript. Python and TypeScript make the same
global calls with their own function syntax; C++/C#/Java prefix them with \`ctx.\` as above.

### What the C++ / C# / Java preview subset covers

True C++/C#/Java is compiled into the plugin at export. In the editor these languages run
through the CeScript interpreter — a large practical subset, so handlers move real controls
live without a compiler. It covers functions and lambdas, structs with methods, enums,
control flow (\`if\`/\`for\`/\`while\`/\`switch\`, range-for), the common \`std::\` containers
(\`vector\`/\`array\`/\`map\`/\`string\`) with their everyday methods, \`<algorithm>\`/\`<numeric>\`
over iterators, \`try\`/\`catch\`, casts, and \`printf\`/\`std::cout\` (to the script console).
It does **not** run templates you define yourself, classes (use structs), pointer arithmetic,
\`goto\`, or arbitrary third-party headers — those raise a clear error instead of mis-running,
and all numbers are doubles (integer division is not truncated). The definitive list lives at
the top of \`CE/web/src/CE_Application/scripting/cppPreview.js\` (C# and Java mirror it); the
export-side design is \`CE/src/Scripting/native-handlers-design.md\`.

## Conventions

The numbers the API expects, everywhere:

| What | Range / form |
|---|---|
| MIDI channel | **1–16** (the runtime converts to wire format) |
| CC number / 7-bit value | 0–127 |
| NRPN value | 0–16383 (14-bit) |
| Note number | 0–127, middle C = **C4 = 60** |
| \`normalizedValue\` | 0–1 |
| Colours | \`"#rrggbb"\` strings |
| Times | milliseconds |
| Scale degrees / keys | key: 0 = C … 11 = B; degrees are 1-based |
| Slots / scenes | 1-based (or by name where the signature says so) |

## Addressing: paths and values

Everything on the panel is reachable by a **dot-path** rooted on a control's name:
\`"cutoff.value"\`, \`"button2.background.fill.colour"\`. Read and write them with \`get\`/\`set\`
(below). Renaming a control automatically updates its name in every script.

A **handle** remembers the control name so you do not type it again.
\`panel.get("cutoff")\` gives you one, and then \`h.set("value", 8000)\`
(Lua: \`h:set("value", 8000)\`), \`h.get("value")\` and \`h.on("valueChanged", fn)\` all act on
that control. \`self\` is the handle for the control your script is attached to.
*(\`panel.cutoff.value\` is in the spec but is not built yet.)*

A control's value can be read three ways. Add the one you want to the end of the path.

The table below mentions the **DPD**, the Device Profile Designer. That is the device map: it
knows each parameter's bytes, ranges and enums, and converts between these three forms for you.

${accessors}

**\`${SELF.id}\`** — ${SELF.summary}

## Lifecycle hooks

Named functions the host calls at fixed moments. Define the ones you need; leave the rest out.

${LIFECYCLE_HOOKS.map(memberSection).join('\n')}
## Events

Two ways to subscribe:

- **A control's own events** — write the named function in the script attached to that control
  (\`function onValueChanged(value) … end\`). There is nothing else to set up: the control it
  listens to is the one it is attached to.
- **Anything else** — another control, the panel, the device, or your own \`emit\` — needs
  \`on(target, event, handler)\`, where you name what to listen to.

Your handler is passed the data directly. When there is one thing to pass, you get that thing:
\`onValueChanged(value)\`. When there are several, you get one object holding them:
\`onClick(mouse)\`, then \`mouse.x\`. The Payload column lists what is in each object.

### Control events

${eventTable(CONTROL_EVENTS)}

### Panel events

${eventTable(PANEL_EVENTS)}

### Device events

${eventTable(DEVICE_EVENTS)}

## Commands

${[...commandsByCategory.entries()].map(([category, items]) =>
  `### ${category}\n\n${CATEGORY_NOTES[category] ? `${CATEGORY_NOTES[category]}\n\n` : ''}${items.map((m) => `#### \`${m.signature}\`\n\n${m.summary}\n${scopeLine(m)}${availabilityLine(m)}${codeBlocks(m)}`).join('\n')}`
).join('\n')}
## Helpers

The app provides these, and they give the same answer in every language. They exist only where
a language has nothing of its own, or where all the languages must agree on the answer. Plain
maths (\`min\`/\`max\`/\`abs\`/\`sin\`) stays with your own language's library.

${[...helpersByCategory.entries()].map(([category, items]) => `### ${category}\n\n${helperTable(items)}`).join('\n\n')}

## When things go wrong

One rule holds everywhere: **a broken script never takes the panel down with it.** What that
means in practice:

- **A handler throws** → that handler stops; every other handler and the panel keep running.
  The error is printed in the editor's script console (script name + message) and, in an
  exported plugin, written to the log file. Never silent, never a dialog.
- **\`set()\` on an unknown control** → an error line in the script console
  (\`set: control "…" not found on the active panel\`); the script continues.
- **\`get()\` on an unknown control or path** → returns nothing (\`nil\`/\`undefined\`/\`None\`) —
  guard before doing math with it.
- **A component command aimed at the wrong component** (e.g. \`phraseSeed\` on a knob) → an
  error line naming what was expected; nothing changes.
- **A valid command with an unknown argument** (an unknown seed name, an out-of-grid cell, an
  unknown preset) → nothing happens, on purpose, and a line goes to the console so it never
  looks like a dead footswitch.
- **Runaway scripts** → guards on loops, recursion depth and MIDI flooding, plus a watchdog for
  a script that never finishes. They stop it without disturbing the panel, and log that they
  did. A script sees only this API — no files, no network, no operating system.

## Further reading

- [Getting started](scripting-getting-started.md) — your first script, step by step.
- [Scripting cookbook](scripting-cookbook.md) — task-based recipes.
- [Panel API spec](../tools/docs/panel-api-spec.md) — the design decisions behind this API.
- [Docs index](README.md) — reading order for all scripting docs.
`;
}

/* --------------------------------------------------------------------- main */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, generateManual());
  console.log(`wrote ${OUT}`);
}
