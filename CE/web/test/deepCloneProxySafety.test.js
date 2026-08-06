// deepCloneProxySafety.test.js — cloning must survive Svelte's $state proxy.
//
// structuredClone throws on a Svelte 5 state proxy:
//
//   DataCloneError: #<Object> could not be cloned.
//
// Reached from the UI that surfaces as "The display panel stopped rendering" or a canvas that
// goes blank, because the throw takes out whatever render or store update was in flight. A QA
// pass on 2026-08-06 filed three High-severity findings that all reduce to it — the applied
// gradient editor, New -> + Component, and a saved panel rendering empty after a tab switch.
//
// The project had already hit it twice and fixed it locally each time, by remembering to wrap the
// argument (see the comments in Player.svelte and DeviceProfileDesignerV2.svelte). Remembering is
// what fails. So deepClone falls back to the JSON round trip its own contract already promised,
// and the call sites route through it.
//
// The last test is the one that matters long-term: it fails on a NEW unguarded structuredClone
// anywhere in src, which is how the previous two fixes failed to prevent the third.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { proxy } from 'svelte/internal/client';

import { deepClone } from '../src/CE_Application/utils/deepClone.js';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('the premise: structuredClone really does reject a Svelte state proxy', () => {
  // If Svelte ever makes its proxy cloneable this fails, and the fallback below becomes dead
  // weight that should be reconsidered rather than silently kept.
  const state = proxy({ _children: { Core: { id: 'c1' } } });
  assert.throws(() => structuredClone(state), (error) => error.name === 'DataCloneError');
});

test('deepClone clones a state proxy instead of throwing', () => {
  const state = proxy({ _children: { Core: { id: 'c1', name: 'Knob' } }, list: [1, 2] });
  const clone = deepClone(state);
  assert.deepEqual(clone, { _children: { Core: { id: 'c1', name: 'Knob' } }, list: [1, 2] });
});

test('the clone is detached — mutating it does not write back through the proxy', () => {
  // The whole point of cloning before a mutator runs (componentWorkspace, presetLibrarian):
  // if the fallback returned anything still bound to the source, an aborted edit would leak.
  const state = proxy({ _children: { Core: { name: 'before' } } });
  const clone = deepClone(state);
  clone._children.Core.name = 'after';
  assert.equal(state._children.Core.name, 'before');
  assert.equal(clone._children.Core.name, 'after');
});

test('nested proxies and arrays of proxies survive', () => {
  const state = proxy({ controls: [proxy({ id: 'a' }), proxy({ id: 'b' })] });
  assert.deepEqual(deepClone(state), { controls: [{ id: 'a' }, { id: 'b' }] });
});

test('plain data is unaffected — the fallback only runs when the fast path throws', () => {
  const plain = { a: 1, b: [2, 3], c: { d: null }, e: '', f: false };
  assert.deepEqual(deepClone(plain), plain);
  assert.notEqual(deepClone(plain), plain, 'must be a copy, not the same reference');
});

test('a non-cloneable value that is not a proxy also falls back rather than throwing', () => {
  // Independent of Svelte internals: a function property makes structuredClone throw too.
  // JSON drops it, which is correct for the JSON-shaped data this helper is documented for.
  const withFunction = { keep: 1, drop() {} };
  assert.throws(() => structuredClone(withFunction), (error) => error.name === 'DataCloneError');
  assert.deepEqual(deepClone(withFunction), { keep: 1 });
});

// --- The guard ------------------------------------------------------------

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      yield* sourceFiles(full);
    } else if (/\.(js|ts|svelte)$/.test(entry)) {
      yield full;
    }
  }
}

test('no unguarded structuredClone call anywhere in src', () => {
  const offenders = [];
  for (const file of sourceFiles(srcRoot)) {
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    if (rel === 'CE_Application/utils/deepClone.js') continue;   // the one legitimate home
    const source = readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      if (!line.includes('structuredClone(')) return;
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
      // Explicitly snapshotting first is the other correct spelling.
      if (line.includes('$state.snapshot')) return;
      offenders.push(`${rel}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [],
    `these call structuredClone directly: ${offenders.join(', ')}. On a Svelte $state proxy that `
    + 'throws DataCloneError and takes out the render or store update around it. Use deepClone '
    + '(utils/deepClone.js), or structuredClone($state.snapshot(x)) where the rune is available.');
});
