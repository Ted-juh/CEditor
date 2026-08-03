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
      const live = l.live ? (l.subset ? '✅ (interpreted subset)' : '✅') : '⬜ preview via WebView only';
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

A script is **an action plus the moment it runs** — a lifecycle hook, or an event handler that
reacts while the panel is in use. Every language calls the same panel API described below; a
script is stored and run in the language it was written in, never converted.

## Languages

${languages}

## Where things run: preview vs export

Some of the API is further along in one runtime than the other. Members below carry a badge
when they deviate from "available everywhere":

- **preview** — the editor's live preview (the JS panel runtime, also used by the exported
  player's window).
- **export** — the exported standalone/VST3 plugin (the C++ host engines, alive even with the
  window closed).

✅ = works today, ⬜ = not yet there (the note says why). No badge = works in both.

## The same script in every language

One handler, written as real source in every language — these exact snippets are validated
against each language's real toolchain by \`npm run test:script-exports\`. Two API shapes:

- **Lua / JavaScript / TypeScript / Python** — the API is injected as globals: \`set()\`,
  \`sendCC()\`, …
- **C++ / C# / Java** *(ctx-based)* — handlers take \`(ctx, event)\` and reach the same API
  through \`ctx\` (C# uses .NET naming: \`ctx.SetValue\`, \`ctx.SendCC\`).

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

**Handles** are the convenience form of the same operation: \`panel.get("cutoff")\` returns a
handle that remembers the prefix — \`h.set("value", 8000)\` (Lua: \`h:set("value", 8000)\`),
\`h.get("value")\`, and \`h.on("valueChanged", fn)\`. \`self\` is the same kind of handle, bound
to the control the script is attached to. *(The spec's dot-object form — \`panel.cutoff.value\` —
remains optional planned sugar.)*

A control's value has three faces — suffix the path with the one you need. (**DPD** = the
Device Profile Designer: the device map that knows each parameter's bytes, ranges, and enums,
and converts between these representations for you.)

${accessors}

**\`${SELF.id}\`** — ${SELF.summary}

## Lifecycle hooks

Named functions the host calls at fixed moments. Define the ones you need; leave the rest out.

${LIFECYCLE_HOOKS.map(memberSection).join('\n')}
## Events

Two ways to subscribe:

- **A control's own events**: just define the named function (\`function onValueChanged(value) … end\`)
  in the script attached to that control — the target is implicitly the control itself.
- **Anything else** (another control, the panel, the device, or a custom \`emit\`): register
  explicitly with \`on(target, event, handler)\`.

Payloads are passed directly with a descriptive name — one obvious datum comes as itself
(\`onValueChanged(value)\`), several fields come as one named object (\`onClick(mouse)\` →
\`mouse.x\`). The Payload column lists each object's fields.

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

Host-provided and identical in every language. Only what the language lacks or what must be
domain-consistent — plain math (\`min\`/\`max\`/\`abs\`/\`sin\`) stays with the language's own library.

${[...helpersByCategory.entries()].map(([category, items]) => `### ${category}\n\n${helperTable(items)}`).join('\n\n')}

## When things go wrong

The design rule (spec Q11): **a broken script never crashes the panel.** What that means in
practice:

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
  unknown preset) → a deliberate no-op, with a console line so it never looks like a dead
  footswitch.
- **Runaway scripts** → loop, depth, and MIDI-flood guards plus an infinite-loop watchdog trip
  invisibly and log when they do. Scripts see only this API — no filesystem, network, or OS.

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
