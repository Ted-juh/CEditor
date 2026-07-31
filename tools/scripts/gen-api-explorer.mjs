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
const verbs = await import(join(apiDir, 'componentVerbs.js'));
const { PURE, WRITTEN } = await import(join(here, 'apiExamples.mjs'));

const {
  MODULES, ALL_MEMBERS, ALL_EVENTS, LIFECYCLE_HOOKS, MODULE_COST, MODULE_COST_LANGUAGES,
  CE_API_VERSION, RUNTIME_ANY, COST_SHARED_KEY,
  moduleMemberMap, memberRuntime, memberPath, isValueMember, MEMBER_BY_ID, moduleTree,
} = api;

/* ------------------------------------------------------------------ examples ------------------ */

/** Lua literal for a derived value. Lists are 1-based tables, maps are key = value. */
function luaLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (Array.isArray(v)) return `{ ${v.map(luaLiteral).join(', ')} }`;
  if (typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, x]) =>
      (/^[A-Za-z_]\w*$/.test(k) ? `${k} = ${luaLiteral(x)}` : `["${k}"] = ${luaLiteral(x)}`)).join(', ')} }`;
  }
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

const jsLiteral = (v) => (v === undefined ? 'undefined' : JSON.stringify(v));

/** A derived example: the call, and what the implementation actually returned. */
function pureExample(flat) {
  const entry = PURE[flat];
  if (!entry) return null;
  const [args, result] = entry;
  const path = memberPath(flat);
  return {
    lua: `${path}(${args.map(luaLiteral).join(', ')})\n--> ${luaLiteral(result)}`,
    js: `${path}(${args.map(jsLiteral).join(', ')})\n//> ${jsLiteral(result)}`,
    derived: true,
  };
}

/** A written example. `code` means both languages are identical apart from the comment marker,
 *  which is the one thing that genuinely differs in a single-call line. */
function writtenExample(flat) {
  const entry = WRITTEN[flat];
  if (!entry) return null;
  if (entry.code) {
    return { lua: entry.code, js: entry.code.replace(/(^|\s)--(?= )/g, '$1//'), derived: false };
  }
  return { lua: entry.lua, js: entry.js, derived: false };
}

/** A representative value for a component verb, taken from the app's OWN table for that verb.
 *  An example that picks a real pattern name out of the list the switch consumes cannot cite one
 *  that does not exist — which is the whole reason these are generated rather than written. */
function verbSampleValue(verb) {
  switch (verb.k) {
    case 'enum': {
      // Not values[0]: the first entry is usually the default, and an example that sets a control
      // to what it already is teaches nothing.
      const list = verb.values ?? [];
      return JSON.stringify(list[1] ?? list[0] ?? '');
    }
    case 'bool': return 'true';
    case 'num': {
      const lo = Number(verb.min ?? 0);
      const hi = Number(verb.max ?? 1);
      const mid = lo + (hi - lo) / 2;
      return String(Number.isInteger(mid) ? mid : Number(mid.toFixed(2)));
    }
    case 'int': {
      const lo = Math.round(Number(verb.min ?? 0));
      const hi = Math.round(Number(verb.max ?? 8));
      return String(Math.round(lo + (hi - lo) / 2));
    }
    case 'str': return '"A-01"';
    default: return '0';
  }
}

/** Generated examples for the component verbs — 302 of them, all regular. */
function componentExample(flat) {
  const verb = verbs.COMPONENT_VERB_BY_ID?.[flat];
  if (!verb) return null;
  const path = memberPath(flat);
  const target = JSON.stringify(verb.section);
  const listName = JSON.stringify(verb.list ?? verb.f ?? 'step');

  let lua;
  let js;
  switch (verb.k) {
    case 'read':
      lua = `${path}(${target}, ${JSON.stringify(verb.f ?? 'pattern')})\n-- no field name returns the whole component`;
      js = `${path}(${target}, ${JSON.stringify(verb.f ?? 'pattern')})\n// no field name returns the whole component`;
      break;
    case 'size':
      lua = `local n = ${path}(${target}, ${listName})`;
      js = `const n = ${path}(${target}, ${listName});`;
      break;
    case 'fill':
      lua = `${path}(${target}, ${listName}, { 0, 0.5, 1, 0.25 })`;
      js = `${path}(${target}, ${listName}, [0, 0.5, 1, 0.25]);`;
      break;
    case 'insert':
      lua = `${path}(${target}, ${listName})       -- append\n${path}(${target}, ${listName}, 2)   -- ...or at index 2`;
      js = `${path}(${target}, ${listName});      // append\n${path}(${target}, ${listName}, 2);  // ...or at index 2`;
      break;
    case 'remove':
      lua = `${path}(${target}, ${listName}, 2)`;
      js = `${path}(${target}, ${listName}, 2);`;
      break;
    case 'indexset':
      lua = `${path}(${target}, 3, true)   -- index 3 on; omit the last argument to toggle`;
      js = `${path}(${target}, 3, true);   // index 3 on; omit the last argument to toggle`;
      break;
    case 'cell':
      lua = `${path}(${target}, 2, 3, 0.75)   -- row, column, value`;
      js = `${path}(${target}, 2, 3, 0.75);   // row, column, value`;
      break;
    case 'item':
      lua = `${path}(${target}, 2, 0.75)   -- element 2`;
      js = `${path}(${target}, 2, 0.75);   // element 2`;
      break;
    case 'xy':
      lua = `${path}(${target}, 0.25, -0.5)   -- x, y`;
      js = `${path}(${target}, 0.25, -0.5);   // x, y`;
      break;
    case 'line':
      lua = `${path}(${target}, 1, ${JSON.stringify('SYNTH A')})`;
      js = `${path}(${target}, 1, ${JSON.stringify('SYNTH A')});`;
      break;
    case 'bool':
      lua = verb.toggle
        ? `${path}(${target})         -- no argument toggles\n${path}(${target}, true)`
        : `${path}(${target}, true)`;
      js = verb.toggle
        ? `${path}(${target});        // no argument toggles\n${path}(${target}, true);`
        : `${path}(${target}, true);`;
      break;
    default: {
      const value = verbSampleValue(verb);
      const legal = verb.k === 'enum' && (verb.values ?? []).length > 1
        ? `\n-- one of: ${verb.values.join(', ')}`
        : '';
      lua = `${path}(${target}, ${value})${legal}`;
      js = `${path}(${target}, ${value});${legal.replace('\n--', '\n//')}`;
      break;
    }
  }
  // Every write verb reports whether the component now holds what was asked (§44), and the example
  // is where that is easiest to show.
  if (!['read', 'size'].includes(verb.k)) {
    lua += `\n-- returns true when the component now holds it`;
    js += `\n// returns true when the component now holds it`;
  }
  return { lua, js, derived: false, fromTable: true };
}

function exampleFor(flat) {
  return pureExample(flat) ?? writtenExample(flat) ?? componentExample(flat);
}

/* ------------------------------------------------------- the options literal ------------------ */
// A reader who has just been told a call takes `opts` still has to work out how to WRITE one, and
// the two languages spell the same object differently: Lua uses `=` between key and value, JS uses
// `:`. Customers asked for exactly this — "it is not clear what the markup is to construct those
// opts" — so it is derived here from the same descriptors the table below it renders, rather than
// left to a reader to assemble from a list of names.

/** A representative value for one option field, in one language, and how concrete it is.
 *
 *  Concreteness ranks the fields: a literal reading `{ role = "…", query = "…" }` demonstrates
 *  where the commas go and nothing else, so a field the contract gives a real value for is worth
 *  more here than one whose only honest sample is a placeholder. */
function fieldSample(field, lang) {
  const type = String(field.type ?? '');
  const quoted = /^".*"$/.test(String(field.default ?? ''));
  const numeric = Number.isFinite(Number(field.default));
  const lua = lang === 'lua';

  if (field.sample) return { text: field.sample[lang] ?? field.sample, rank: 3 };
  if (Array.isArray(field.values) && field.values.length) {
    // Not values[0] when that IS the default: an example setting an option to what it already
    // holds demonstrates the syntax and nothing else.
    const first = field.values[0];
    const pick = quoted && field.default === `"${first}"` ? (field.values[1] ?? first) : first;
    return { text: JSON.stringify(pick), rank: 3 };
  }
  if (quoted) return { text: field.default, rank: 2 };
  if (type.includes('number') && numeric) return { text: String(Number(field.default)), rank: 2 };
  if (type.includes('true or false')) return { text: 'true', rank: 2 };
  if (type.includes('colour')) return { text: '"#39D98A"', rank: 2 };
  if (type.includes('list of text')) return { text: lua ? '{ "one", "two" }' : '["one", "two"]', rank: 1 };
  if (type.includes('list')) return { text: lua ? '{ 3, 3 }' : '[3, 3]', rank: 1 };
  if (type.includes('function')) return { text: lua ? 'function() end' : '() => {}', rank: 1 };
  if (type.includes('number')) return { text: '1', rank: 0 };
  return { text: '"…"', rank: 0 };
}

/** The literal you actually type, in one language. Capped at four fields: a twenty-field literal
 *  is not an example of anything, and the table underneath carries the rest. */
function optionLiteral(fields, lang) {
  // A nested object gets its own shape rather than a `{ }` nobody can act on, and `<section>` is a
  // stand-in for a name rather than a name — neither belongs in a one-line literal.
  const usable = fields.filter((f) => /^[A-Za-z_]\w*$/.test(f.name) && !String(f.type).includes('object'));
  if (!usable.length) return null;

  const scored = usable.map((f, i) => ({ f, i, ...fieldSample(f, lang) }));
  // Required first — a literal that omits one would not run — then the fields with a real value to
  // show, then the contract's own order so the result is stable between the two languages.
  scored.sort((a, b) =>
    (b.f.required === true) - (a.f.required === true) || b.rank - a.rank || a.i - b.i);

  const shown = scored.slice(0, 4);
  const pairs = shown.map((s) => `${s.f.name}${lang === 'lua' ? ' = ' : ': '}${s.text}`);
  const rest = usable.length - shown.length;
  const trail = rest ? `   ${lang === 'lua' ? '--' : '//'} …and ${rest} more, in the table below` : '';
  return `{ ${pairs.join(', ')} }${trail}`;
}

/** Structural validation. An example is documentation, and documentation that cites something that
 *  does not exist is worse than none — so the build refuses it rather than shipping it. */
function validateExamples(examples) {
  const problems = [];
  const modulePaths = new Set(MODULES.map((m) => m.id));
  const memberPaths = new Set(ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle').map((m) => memberPath(m.id)));
  // Every option field must say what it holds and what it does. A field list is documentation, and
  // a descriptor missing its summary would render as an empty table cell — the exact "the opts are
  // not defined" complaint this replaced, in a nicer-looking box.
  for (const member of ALL_MEMBERS) {
    for (const param of member.params ?? []) {
      for (const f of param.fields ?? []) {
        if (!f?.name || !f?.type || !f?.summary) {
          problems.push(`${member.id}: option field ${JSON.stringify(f?.name ?? f)} is not fully described`);
        }
      }
    }
  }
  const flatNames = new Set(ALL_MEMBERS.map((m) => m.id));

  for (const key of [...Object.keys(PURE), ...Object.keys(WRITTEN)]) {
    if (!flatNames.has(key)) problems.push(`example keyed to "${key}", which is not a member`);
  }
  for (const [flat, eg] of Object.entries(examples)) {
    for (const text of [eg.lua, eg.js]) {
      // Every ce.<something> reference in an example must resolve, whether to a module or a member.
      for (const [, cited] of String(text ?? '').matchAll(/\b(ce(?:\.[a-zA-Z_]\w*)+)/g)) {
        if (memberPaths.has(cited) || modulePaths.has(cited)) continue;
        // ce.storage.state is a value member; ce.x.y.z where the prefix is a module is a field read.
        if ([...modulePaths].some((m) => cited.startsWith(`${m}.`))
            && memberPaths.has(cited.split('.').slice(0, 3).join('.'))) continue;
        problems.push(`${flat}: cites "${cited}", which does not resolve`);
      }
    }
  }
  return problems;
}

/** One declared argument, with any object it carries written out.
 *
 *  `given` marks the objects a handler is HANDED rather than ones a caller builds — onError's
 *  `info`, onDraw's. Those get the same field table (knowing that info.phase is "load" or
 *  "dispatch" is worth as much as knowing what `scope` accepts) but no "written like this"
 *  literal, because you never write one. */
function describeArg(p, given = false) {
  const fields = Array.isArray(p.fields) && p.fields.length ? p.fields : null;
  return {
    name: p.name, type: p.type, required: p.required === true, fields, given,
    literal: fields && !given
      ? { lua: optionLiteral(fields, 'lua'), js: optionLiteral(fields, 'javascript') }
      : null,
  };
}

/** How many members a group holds, so a collapsed branch can say what is inside it. */
function countMembers(ids, modules) {
  return ids.reduce((n, id) => n + (modules.find((m) => m.id === id)?.members.length ?? 0), 0);
}

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
        // The declared arguments. A signature says `opts` and stops; animateTo's opts has TEN
        // fields, and until the contract carried them as descriptors the only place any of it was
        // written down was the summary prose. Each field now brings its type, what it does when
        // you leave it out, and the values it accepts where that is a closed list — plus the
        // literal you type, in both languages.
        // NOT .map(describeArg): map passes the INDEX as the second argument, which would mark
        // every argument after the first as one the handler is given — and silently drop its
        // literal, which is the one thing this whole block exists to produce.
        args: (member?.params ?? []).map((p) => describeArg(p)),
        eg: exampleFor(memberId),
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
    // How they are filed. The page renders the reference from this rather than from `modules`
    // order, so a module moves between groups by moving in the contract and nowhere else.
    tree: moduleTree().map((group) => ({
      ...group,
      members: countMembers(group.modules, modules),
      subgroups: group.subgroups.map((sub) => ({
        ...sub, members: countMembers(sub.modules, modules),
      })),
    })),
    hooks: LIFECYCLE_HOOKS.map((h) => ({
      id: h.id, sig: h.signature, doc: h.summary, rt: memberRuntime(h),
      // What the hook is handed. onPanelReady(info) told a reader `info` existed and left
      // `info.firstTime` — the whole reason to take the argument — to the summary prose.
      args: (h.params ?? []).map((p) => describeArg(p, true)),
    })),
    events: ALL_EVENTS.map((e) => ({
      id: e.id, fn: e.fn, group: e.group, payload: e.payload ?? null,
      doc: e.summary, rt: memberRuntime(e),
    })),
  };
}

const data = contract();

// Validate and report coverage. A gap is stated rather than implied: a page that shows examples for
// most members and nothing for the rest should say which, or it reads as "these have none".
{
  const examples = {};
  for (const mod of data.modules) for (const m of mod.members) if (m.eg) examples[m.flat] = m.eg;
  const problems = validateExamples(examples);
  if (problems.length) {
    console.error(`gen-api-explorer: ${problems.length} bad example(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exitCode = 2;
  }
  const total = data.modules.reduce((n, mod) => n + mod.members.length, 0);
  const have = Object.keys(examples).length;
  data.coverage = { examples: have, members: total, derived: Object.keys(PURE).length };
  if (have < total && !process.argv.includes('--json')) {
    const missing = data.modules.flatMap((mod) => mod.members.filter((m) => !m.eg).map((m) => m.path));
    console.error(`gen-api-explorer: ${total - have} member(s) with no example: ${missing.slice(0, 12).join(', ')}`
      + (missing.length > 12 ? ` … and ${missing.length - 12} more` : ''));
    process.exitCode = 3;
  }
}

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
    let page = template.replace(MARK, JSON.stringify(data).replace(/<\//g, '<\\/'));

    // The prose states three counts out loud. The page's own script overwrites them on load, so a
    // wrong number in the template is invisible in a browser and therefore rots unnoticed — it had
    // already drifted two phases, saying 536/40 for a surface of 555/41. Fill them here so the
    // written file agrees with the contract it ships, and fail rather than write if one goes
    // missing: a silently unfilled count is exactly the failure this is meant to end.
    const inline = {
      'i-mem': data.totals.members.toLocaleString('en-US'),
      'i-mod': String(data.totals.modules),
      'i-derived': String(data.coverage.derived),
    };
    for (const [id, value] of Object.entries(inline)) {
      const re = new RegExp(`(<b id="${id}">)[^<]*(</b>)`);
      if (!re.test(page)) {
        console.error(`apiExplorer.template.html has no <b id="${id}"> to fill`);
        process.exitCode = 2;
      }
      page = page.replace(re, `$1${value}$2`);
    }
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
