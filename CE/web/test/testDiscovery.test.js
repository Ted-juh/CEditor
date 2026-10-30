// testDiscovery.test.js — `npm test` runs `node --test` with no file arguments, so node decides what
// a test file is, by name, anywhere in the package. A script outside test/ that happens to match
// is run as a test.
//
// That happened: scripts/test-everything.mjs, the command that runs every web test in turn,
// matched test-*.mjs. `npm test` started it, the suite it started in turn was skipped as a
// recursive run, and from 2026-10-28 CI's web-tests job ran the browser checks and the
// component-behaviour harness in the suite's place, until its 30-minute limit. Not one node test
// ran, and a failing one (the help bundle's size) went unseen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// node --test's default patterns (Node 22), with node_modules left out as node leaves it out.
const NODE_TEST_PATTERNS = [
  '**/*.test.{cjs,mjs,js}',
  '**/*-test.{cjs,mjs,js}',
  '**/*_test.{cjs,mjs,js}',
  '**/test-*.{cjs,mjs,js}',
  '**/test.{cjs,mjs,js}',
  '**/test/**/*.{cjs,mjs,js}',
];

test('node --test finds test files in test/ and nowhere else', () => {
  const found = NODE_TEST_PATTERNS.flatMap((pattern) => globSync(pattern, {
    cwd: WEB,
    exclude: (name) => path.basename(String(name)) === 'node_modules',
  })).map((file) => file.split(path.sep).join('/'));
  const elsewhere = [...new Set(found.filter((file) => !file.startsWith('test/')))].sort();
  assert.deepEqual(elsewhere, [],
    'node --test would run these as test files; rename them so no default pattern matches');
  assert.ok(found.some((file) => file === 'test/testDiscovery.test.js'), 'the patterns no longer find the suite itself');
});
