// apiExamples.test.js — the manual's worked examples, checked against the code (design doc §47).
//
// The reference page shows one example per member, and for the 90 members that are a pure function of
// their arguments it also shows the RESULT. A documented result is a claim about the implementation,
// and a claim nobody checks is how a manual starts lying — so every one of them is re-run here
// against the live api and compared.
//
// This is the same discipline the rest of the suite follows: assert against the app's own functions
// rather than against numbers copied out of them. The difference is only that the "copy" being
// checked is the one the reader sees.
//
// Deriving these in the first place found three things wrong with the contract, which is the argument
// for doing it this way rather than hand-writing the numbers:
//
//   * blend()'s signature read `blend(a, b, t)` with no hint that a and b are LISTS. Two numbers
//     return an empty list, which is correct and completely baffling.
//   * decodeJson()'s summary never mentioned that JSON null reads as nothing — the one surprising
//     thing about it, and the reason encode-then-decode is not always identity.
//   * ce.text's write verbs had no return annotation at all (fixed in the previous phase).

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import {
  ALL_MEMBERS, MODULES, MEMBER_BY_ID, memberPath,
} from '../src/CE_Application/scripting/panelApi.js';
import { PURE, WRITTEN } from '../../../tools/scripts/apiExamples.mjs';

/** A panel with every module declared, so nothing is gated while the examples run. */
function withEverything(fn) {
  const control = createControl('Label', { name: 'L' });
  panels.set([{
    id: 'p', name: 'P', controls: [control],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('', 'examples')); } finally { panels.set([]); }
}

const NON_LIFECYCLE = ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle');

/* ------------------------------------------------------------------ the claims */

test('every documented result is what the implementation actually returns', () => {
  withEverything((api) => {
    const wrong = [];
    for (const [flat, [args, expected]] of Object.entries(PURE)) {
      const fn = api[flat];
      if (typeof fn !== 'function') { wrong.push(`${flat}: not a function on the api`); continue; }
      let got;
      try { got = fn(...args); } catch (e) { wrong.push(`${flat}: threw ${e.message}`); continue; }
      try {
        assert.deepEqual(got, expected);
      } catch {
        wrong.push(`${flat}(${args.map((a) => JSON.stringify(a)).join(', ')})`
          + ` documented ${JSON.stringify(expected)} but returns ${JSON.stringify(got)}`);
      }
    }
    // One list rather than one failure at a time: a change to a shared helper moves several at once,
    // and seeing all of them is what tells a deliberate change from a regression.
    assert.deepEqual(wrong, [],
      `the manual documents results the code no longer produces:\n  ${wrong.join('\n  ')}\n`
      + 'Re-derive them rather than editing a result to match.');
  });
});

/* ------------------------------------------------------------------ coverage and shape */

test('every member has an example, and none is keyed to something that does not exist', () => {
  const known = new Set(ALL_MEMBERS.map((m) => m.id));
  for (const key of [...Object.keys(PURE), ...Object.keys(WRITTEN)]) {
    assert.ok(known.has(key), `an example is keyed to "${key}", which is not a member`);
  }
  // The component verbs are generated in gen-api-explorer from COMPONENT_VERBS, so they are not in
  // either table — what is asserted here is that everything NOT generated is written down.
  const generated = new Set(NON_LIFECYCLE
    .filter((m) => memberPath(m.id).startsWith('ce.components.'))
    .map((m) => m.id));
  const authored = new Set([...Object.keys(PURE), ...Object.keys(WRITTEN)]);
  const missing = NON_LIFECYCLE
    .filter((m) => !authored.has(m.id) && !generated.has(m.id))
    .map((m) => memberPath(m.id));
  assert.deepEqual(missing, [], `members with no example: ${missing.join(', ')}`);
});

test('nothing is both derived and written — one source per example', () => {
  const both = Object.keys(PURE).filter((k) => k in WRITTEN);
  assert.deepEqual(both, [], `these have two examples: ${both.join(', ')}`);
});

test('a written example is either shared or has both languages', () => {
  for (const [flat, eg] of Object.entries(WRITTEN)) {
    if (eg.code) {
      assert.equal(eg.lua, undefined, `${flat}: code and lua together is ambiguous`);
      assert.equal(eg.js, undefined, `${flat}: code and js together is ambiguous`);
      assert.ok(eg.code.trim().length, `${flat}: empty example`);
    } else {
      assert.ok(eg.lua?.trim().length, `${flat}: no Lua example`);
      assert.ok(eg.js?.trim().length, `${flat}: no JavaScript example`);
    }
  }
});

test('a shared example carries no language-specific syntax', () => {
  // `code` renders in BOTH languages, so `local`, `then … end`, `#list` and Lua table literals are
  // not allowed in one — that is what the lua/js split is for. Comment markers are exempt: the
  // generator rewrites `--` to `//` for the JavaScript rendering, which is the one difference a
  // single call line legitimately has.
  const luaOnly = [/\blocal\s+\w/, /\bthen\b[\s\S]*\bend\b/, /\bnil\b/, /~=/, /#[a-zA-Z_]/];
  for (const [flat, eg] of Object.entries(WRITTEN)) {
    if (!eg.code) continue;
    const withoutComments = eg.code.replace(/--.*$/gm, '');
    for (const pattern of luaOnly) {
      assert.ok(!pattern.test(withoutComments),
        `${flat}: shared example matches ${pattern} — split it into lua/js instead:\n  ${eg.code}`);
    }
  }
});

test('every ce.* path an example cites resolves', () => {
  const paths = new Set(NON_LIFECYCLE.map((m) => memberPath(m.id)));
  const modules = new Set(MODULES.map((m) => m.id));
  const cited = [];
  for (const [flat, eg] of Object.entries(WRITTEN)) {
    for (const text of [eg.code, eg.lua, eg.js]) {
      for (const [, path] of String(text ?? '').matchAll(/\b(ce(?:\.[a-zA-Z_]\w*)+)/g)) {
        if (paths.has(path) || modules.has(path)) continue;
        // ce.storage.state.lastNote — a field read through a value member.
        if ([...modules].some((m) => path.startsWith(`${m}.`))
            && paths.has(path.split('.').slice(0, 3).join('.'))) continue;
        cited.push(`${flat} cites ${path}`);
      }
    }
  }
  assert.deepEqual(cited, [], `examples cite paths that do not exist:\n  ${cited.join('\n  ')}`);
});

test('the members an example claims to be pure really take no host', () => {
  // A member in PURE is documented with a result, which only makes sense if the answer depends on
  // nothing but the arguments. Every one of them must therefore be cross-runtime: a panel-view-only
  // member has a surface behind it, and its answer is not a property of its arguments alone.
  const notPure = Object.keys(PURE).filter((flat) => {
    const member = MEMBER_BY_ID[flat];
    return member?.runtime !== undefined && member.runtime !== 'any';
  });
  assert.deepEqual(notPure, [],
    `documented with a result but not cross-runtime: ${notPure.join(', ')}`);
});

test('a derived example is deterministic — running it twice gives the same answer', () => {
  // Anything seeded or stateful would pass the comparison above on its first call and drift on the
  // second, which is exactly the kind of example that rots quietly. Two calls, same answer.
  withEverything((api) => {
    const unstable = [];
    for (const [flat, [args]] of Object.entries(PURE)) {
      const fn = api[flat];
      if (typeof fn !== 'function') continue;
      const first = JSON.stringify(fn(...args) ?? null);
      const second = JSON.stringify(fn(...args) ?? null);
      if (first !== second) unstable.push(`${flat}: ${first} then ${second}`);
    }
    assert.deepEqual(unstable, [],
      `these are not functions of their arguments and should be WRITTEN, not PURE:\n  ${unstable.join('\n  ')}`);
  });
});
