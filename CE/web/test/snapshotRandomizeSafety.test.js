import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'components', 'SnapshotsTab.svelte'), 'utf8');

test('randomize skips no-op snapshots and still captures undo before applying values', () => {
  assert.match(source, /const result = randomizeValues[\s\S]*?if \(result\.changed === 0\)[\s\S]*?const before = captureSnapshot/,
    'a roll that changes nothing must not clutter the snapshot list');
  assert.match(source, /const before = captureSnapshot[\s\S]*?if \(!before\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?applyValues/,
    'randomization must not write after its promised undo capture fails');
});
