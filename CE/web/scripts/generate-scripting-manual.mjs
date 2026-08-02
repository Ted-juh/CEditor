// generate-scripting-manual.mjs — emit the user-facing scripting reference manual.
//
// panelApi.js is the single source of truth for the panel API (it already drives the
// picker, validation, and the host bindings); this script projects the same data into
// one readable markdown page, so the manual can never drift from what the editor shows.
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

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/scripting-manual.md');

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

function codeBlocks(member) {
  const lua = displaySnippet(member.snippet?.lua);
  const js = displaySnippet(member.snippet?.javascript);
  if (!lua && !js) return '';
  if (lua === js) return `\n\`\`\`lua\n${lua}\n\`\`\`\n`;
  return `\n\`\`\`lua\n-- Lua\n${lua}\n\`\`\`\n\`\`\`js\n// JavaScript\n${js}\n\`\`\`\n`;
}

function memberSection(member) {
  return `### \`${member.signature}\`\n\n${member.summary}\n${scopeLine(member)}${codeBlocks(member)}`;
}

function eventTable(events) {
  const rows = events.map((e) => {
    const payload = e.payload ? `\`${e.payload}\`` : '—';
    return `| \`"${e.id}"\` | \`${e.fn}(${e.payload ?? ''})\` | ${payload} | ${e.summary} |`;
  });
  return ['| Event | Handler | Payload | Fires when |', '|---|---|---|---|', ...rows].join('\n');
}

function helperTable(helpers) {
  const rows = helpers.map((h) => `| \`${h.signature}\` | ${h.summary} |`);
  return ['| Helper | What it does |', '|---|---|', ...rows].join('\n');
}

/* ------------------------------------------------------------------ sections */

const languages = [
  '| Language | Version | Runs live in the editor | Runtime |',
  '|---|---|---|---|',
  ...SCRIPT_LANGUAGES.map((l) => {
    const live = l.live ? (l.subset ? '✅ (interpreted subset)' : '✅') : '⬜ preview via WebView only';
    return `| **${l.label}**${TIER1_LANGUAGES.includes(l.id) ? ' (Tier 1)' : ''} | ${l.version} | ${live} | ${l.host} |`;
  }),
].join('\n');

const accessors = [
  '| Accessor | What you get |',
  '|---|---|',
  ...VALUE_ACCESSORS.map((a) => `| \`${a.label}\` | ${a.summary} |`),
].join('\n');

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

const md = `# CEditor Scripting Manual

> **Generated file — do not edit by hand.**
> Source of truth: \`CE/web/src/CE_Application/scripting/panelApi.js\` (the same data that drives
> the editor's picker and validation). Regenerate with \`npm run docs:manual\` in \`CE/web\`.
> New to scripting here? Start with the [cookbook](scripting-cookbook.md); design background and
> reading order are in the [docs index](README.md).

A script is **an action plus the moment it runs** — a lifecycle hook, or an event handler that
reacts while the panel is in use. Every language calls the same panel API described below; a
script is stored and run in the language it was written in, never converted.

## Languages

${languages}

## Addressing: paths and values

Everything on the panel is reachable by a **dot-path** rooted on a control's name:
\`"cutoff.value"\`, \`"button2.background.fill.colour"\`. Read and write them with \`get\`/\`set\`
(below). Renaming a control automatically updates its name in every script.

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
\`mouse.x\`).

### Control events

${eventTable(CONTROL_EVENTS)}

### Panel events

${eventTable(PANEL_EVENTS)}

### Device events

${eventTable(DEVICE_EVENTS)}

## Commands

${[...commandsByCategory.entries()].map(([category, items]) =>
  `### ${category}\n\n${items.map((m) => `#### \`${m.signature}\`\n\n${m.summary}\n${scopeLine(m)}${codeBlocks(m)}`).join('\n')}`
).join('\n')}
## Helpers

Host-provided and identical in every language. Only what the language lacks or what must be
domain-consistent — plain math (\`min\`/\`max\`/\`abs\`/\`sin\`) stays with the language's own library.

${[...helpersByCategory.entries()].map(([category, items]) => `### ${category}\n\n${helperTable(items)}`).join('\n\n')}

## Errors & safety

A broken script never crashes the panel: runtime errors stop that handler only, are reported in
the editor's script console (and a log file in an exported plugin), and everything else keeps
running. Loop, depth, and MIDI-flood guards plus an infinite-loop watchdog run invisibly in the
background. Scripts see only this API — no filesystem, network, or OS access.

## Further reading

- [Scripting cookbook](scripting-cookbook.md) — task-based recipes.
- [Panel API spec](../tools/docs/panel-api-spec.md) — the design decisions behind this API.
- [Docs index](README.md) — reading order for all scripting docs.
`;

writeFileSync(OUT, md);
console.log(`wrote ${OUT}`);
