// bridgeCallbackWiring.test.js — BridgeScriptHost::Callbacks must be wired end to end.
//
// `cb.deviceSet = ...` landed in PluginProcessor.h without the matching member on the Callbacks
// struct, and without the override that would dispatch it. That is a compile error, and it sat on
// main for six days:
//
//   * CEDITOR_SCRIPTING defaults to OFF, and package-installer.ps1 does not turn it on, so no
//     local build or installer ever compiled the block
//   * CI turns it ON, but CI could not get past CMake configure at all (JUCE/bin was gitignored),
//     so it never reached the compiler either
//
// Two independent blind spots lining up. A C++ header check does not belong in a Svelte test
// suite, but this is the only suite that runs on every push, and the alternative is waiting for a
// Windows compiler to notice.
//
// Three failure modes, all of which have now happened or nearly happened:
//   1. assigned but not declared  -> compile error (the deviceSet bug)
//   2. declared but not dispatched -> compiles, silently does nothing (the worse one)
//   3. declared but not assigned  -> legitimate; a host without that capability leaves it unset,
//      and the member reports rather than pretending. Not checked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(join(repoRoot, 'CE', 'src', ...p), 'utf8');

const bridge = read('Scripting', 'BridgeScriptHost.h');
const processor = read('Player', 'PluginProcessor.h');

/** The body of `struct Callbacks { ... }`, brace-matched so nested lambdas do not end it early. */
function callbacksBody() {
  const start = bridge.indexOf('struct Callbacks');
  assert.notEqual(start, -1, 'struct Callbacks is gone or renamed — this test cannot see it');
  let depth = 0;
  for (let i = start; i < bridge.length; i += 1) {
    if (bridge[i] === '{') depth += 1;
    else if (bridge[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: bridge.slice(start, i), rest: bridge.slice(i) };
    }
  }
  throw new Error('unterminated struct Callbacks');
}

const { body, rest } = callbacksBody();
const declared = [...new Set([...body.matchAll(/>\s*([A-Za-z_]\w*)\s*;/g)].map((m) => m[1]))];
const assigned = [...new Set([...processor.matchAll(/\bcb\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]))];

test('the struct parses into a plausible member list', () => {
  // If the regex stops matching, every assertion below passes vacuously.
  assert.ok(declared.length > 20, `only parsed ${declared.length} members — the parse is wrong`);
  assert.ok(assigned.length > 20, `only parsed ${assigned.length} assignments — the parse is wrong`);
  assert.ok(declared.includes('deviceSet'), 'deviceSet is missing from Callbacks again');
});

test('every callback PluginProcessor assigns is declared on Callbacks', () => {
  const missing = assigned.filter((name) => !declared.includes(name));
  assert.deepEqual(missing, [],
    `PluginProcessor assigns cb.${missing.join(', cb.')} but Callbacks does not declare `
    + `${missing.length === 1 ? 'it' : 'them'}. This is a hard compile error under `
    + 'CEDITOR_SCRIPTING=ON, which only CI builds — it will not show up locally.');
});

test('every declared callback is dispatched by an override', () => {
  // The quiet failure: a member that exists and gets assigned, but which no override ever calls.
  // It compiles, and the verb returns the base class default forever.
  const undispatched = declared.filter((name) => !rest.includes(`callbacks.${name}`));
  assert.deepEqual(undispatched, [],
    `Callbacks declares ${undispatched.join(', ')} but no method in BridgeScriptHost calls `
    + `callbacks.${undispatched[0] ?? 'x'}. The host assigns it and nothing ever runs it — the `
    + 'script verb silently returns the ScriptHostApi default instead.');
});

test('deviceSet is dispatched, and reports false when no host supplied one', () => {
  // The specific regression. Pattern-matched rather than eyeballed because the "&&" is what makes
  // an absent device host report itself rather than returning a quiet success.
  assert.match(bridge, /bool deviceSet \([^)]*\)\s*override/s,
    'BridgeScriptHost no longer overrides deviceSet — ScriptHostApi::deviceSet returns false '
    + 'unconditionally, so ce.device.setVariable / setTiming would silently stop working');
  assert.match(bridge, /callbacks\.deviceSet && callbacks\.deviceSet \(/,
    'deviceSet no longer guards on the callback being set');
});
