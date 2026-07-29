#!/usr/bin/env node
// gen-api-explorer.mjs — the contract, as a page you can read and search.
//
// The scripting surface is 39 modules and 538 members. That is past the size where a hand-written
// reference stays true: the last one was written by hand, and by the time six phases had landed it
// claimed ce.math had eight members (it has 59) and argued in its "deliberately absent" section
// against component reads that had since been built.
//
// So this emits the DATA from panelApi.js — the same module the five runtimes are tested against —
// and the page renders it. Nothing about the API is typed twice. The prose (the tutorial, the
// notes) is hand-written and lives in the template; the tables cannot go stale.
//
//   node tools/scripts/gen-api-explorer.mjs            → writes docs/api-explorer.html
//   node tools/scripts/gen-api-explorer.mjs --json      → prints the contract JSON only
//   node tools/scripts/gen-api-explorer.mjs --check     → non-zero if the page is out of date

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const apiDir = join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting');

const api = await import(join(apiDir, 'panelApi.js'));

const {
  MODULES, ALL_MEMBERS, ALL_EVENTS, LIFECYCLE_HOOKS, MODULE_COST, MODULE_COST_LANGUAGES,
  CE_API_VERSION, RUNTIME_ANY, COST_SHARED_KEY,
  moduleMemberMap, memberRuntime, memberPath, isValueMember, MEMBER_BY_ID,
} = api;

/** The shape the page renders. Everything here comes from the contract; nothing is retyped. */
function contract() {
  const modules = MODULES.map((mod) => {
    const map = moduleMemberMap(mod.id);
    const members = Object.entries(map).map(([shortName, memberId]) => {
      const member = MEMBER_BY_ID[memberId];
      return {
        name: shortName,                       // what it is called inside the module
        flat: memberId,                        // …and its global alias
        path: memberPath(memberId),            // ce.<module>.<name>
        sig: member?.signature ?? memberId,
        doc: member?.summary ?? '',
        value: isValueMember(member),          // `state` is a table, not a call
        rt: memberRuntime(member),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const cost = MODULE_COST[mod.id] ?? {};
    return {
      id: mod.id,
      version: mod.version,
      runtime: mod.runtime,
      global: mod.global === true,
      summary: mod.summary,
      requires: mod.requires ?? [],
      // The measured weight, per language, of everything this module adds to a prelude.
      cost: Object.fromEntries(MODULE_COST_LANGUAGES.map((lang) => [lang, cost[lang] ?? 0])),
      members,
    };
  });

  return {
    apiVersion: CE_API_VERSION,
    languages: MODULE_COST_LANGUAGES,
    shared: MODULE_COST[COST_SHARED_KEY] ?? {},
    totals: {
      modules: modules.length,
      members: ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle').length,
      events: ALL_EVENTS.length,
      hooks: LIFECYCLE_HOOKS.length,
      crossRuntime: modules.filter((m) => m.runtime === RUNTIME_ANY).length,
    },
    modules,
    hooks: LIFECYCLE_HOOKS.map((h) => ({
      id: h.id, sig: h.signature, doc: h.summary, rt: memberRuntime(h),
    })),
    events: ALL_EVENTS.map((e) => ({
      id: e.id, fn: e.fn, group: e.group, payload: e.payload ?? null,
      doc: e.summary, rt: memberRuntime(e),
    })),
  };
}

const data = contract();

// --json prints the contract and stops. Deliberately NOT process.exit(): on a redirected stdout
// that cuts the write off mid-flush, which is how this printed an empty file the first time.
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
} else {
  const template = readFileSync(join(here, 'apiExplorer.template.html'), 'utf8');
  const MARK = '/*__CONTRACT__*/';
  if (!template.includes(MARK)) {
    console.error(`apiExplorer.template.html has no ${MARK} marker to inject the contract into`);
    process.exitCode = 2;
  } else {
    // JSON inside a <script type="application/json"> block: the only sequence that could close it
    // early is "</", so that is the one thing escaped.
    const page = template.replace(MARK, JSON.stringify(data).replace(/<\//g, '<\\/'));
    const out = join(repo, 'docs', 'api-explorer.html');

    if (process.argv.includes('--check')) {
      let current = '';
      try { current = readFileSync(out, 'utf8'); } catch { /* absent counts as stale */ }
      if (current === page) {
        console.log('ok docs/api-explorer.html');
      } else {
        console.error('stale docs/api-explorer.html — run: node tools/scripts/gen-api-explorer.mjs');
        process.exitCode = 1;
      }
    } else {
      writeFileSync(out, page);
      console.log(`wrote docs/api-explorer.html — ${data.totals.modules} modules, `
        + `${data.totals.members} members, ${data.totals.events} events, ${data.totals.hooks} hooks`);
    }
  }
}
