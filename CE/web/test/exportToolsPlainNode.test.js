// exportToolsPlainNode.test.js — the export tools CI runs with plain Node load, without the test
// suite's loader hook.
//
// The suite runs under test/support/register-svelte.mjs, which resolves `.svelte` files and the
// extensionless `../scrub/dragScrub` import (a `.ts` file) that the interaction runtime makes. The
// Windows job runs tools/scripts/prepare-export-panel.mjs with plain `node`, which resolves
// neither. When set resolution (models/controlSetFamilies.js) began reading utils/labelShows.js, and
// that file read the interaction runtime for a Label's printed value, the tool stopped loading, and
// only the Windows job, which the suite does not stand in for, could have said so. The runtime half
// moved to utils/labelText.js; this runs the tool as CI does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

test('prepare-export-panel.mjs prepares the GAIA panel under plain Node, as the Windows job runs it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-export-'));
  try {
    const out = join(dir, 'gaia-export.cepanel');
    const run = spawnSync(process.execPath, ['tools/scripts/prepare-export-panel.mjs', 'CE/panels/Roland GAIA SH-01.cepanel', out], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' },
    });
    assert.equal(run.status, 0, run.stderr.split('\n').slice(0, 6).join('\n'));
    assert.ok(statSync(out).size > 100000, 'the export payload is written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a Label\'s model does not read the interaction runtime; its words do, apart', () => {
  assert.doesNotMatch(source('utils/labelShows.js'), /from '\.\/interactionRuntime\.js'/);
  assert.match(source('utils/labelText.js'), /from '\.\/interactionRuntime\.js'/);
  assert.match(source('models/controlSetFamilies.js'), /from '\.\.\/utils\/labelShows\.js'/);
  assert.doesNotMatch(source('models/controlSetFamilies.js'), /labelText\.js/);
});
