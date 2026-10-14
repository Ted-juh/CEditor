// gaiaScriptsLoad.test.js — every one of the GAIA panel's scripts loads in the window-open runtime.
//
// The panel has 232 JavaScript scripts, one per patch-recall button among them, and each runs in a
// sandbox of its own (scripting/boundedJavascript.js). From 4 October those sandboxes were capped at
// 32, so in the editor's preview and in the plug-in with its window open the 33rd script onward
// failed to load with "Too many script instances" — two hundred buttons that did nothing — while the
// plug-in's window-closed runtime loaded all of them. Nothing failed: each script's own tests run it
// outside the sandbox, through the GAIA harness, and so never met the cap.
//
// This loads them the way the runtime does, through runScript and the sandbox, with a host set as the
// player sets one, and reads the console for load errors.
//
// With the time limit lifted. It is wall-clock: idle, the slowest of these takes about 200 ms
// against 250, and the full suite running beside a C++ build pushed one over, which stopped its
// sandbox and made the count 231. That is the time limit doing its job, not the cap this is about.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';

import { readText } from './support/readText.mjs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import * as rt from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { initialiseJavascriptSandbox, sandboxCountForTesting, setTimeLimitForTesting } from '../src/CE_Application/scripting/boundedJavascript.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';

test('all of the GAIA panel\'s scripts load, each in its own sandbox', async () => {
  const panel = deserializePanel(readText(path.join(REPO, GAIA)), GAIA, null);
  assert.equal(panel.scripts.length, 232, 'the panel this test is about');
  panels.set([]);
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost({ panel: { id: 'gaia' } });   // as the player does: a host means approved
  addPanel({ ...panel, id: 'gaia' });
  setActivePanel('gaia');
  await initialiseJavascriptSandbox();
  setTimeLimitForTesting(60_000);
  try {
    // The console keeps its last 1,000 lines, so errors are picked out by id, not by position. A
    // script stopped by a limit loses its sandbox without a load error, so those are named as well.
    const loadErrors = [];
    for (const script of panel.scripts) {
      const seen = get(scriptTrace).at(-1)?.id ?? 0;
      await rt.runScript(script);
      for (const line of get(scriptTrace)) {
        if (line.id > seen && line.kind === 'error' && /load error|Script stopped/.test(line.message)) loadErrors.push(`${script.id}: ${line.message}`);
      }
    }
    assert.deepEqual(loadErrors, [], `${loadErrors.length} scripts did not load or were stopped`);
    assert.equal(sandboxCountForTesting(), 232, 'each script keeps its sandbox, for its handlers to run in later');
  } finally {
    setTimeLimitForTesting();
    rt.resetScriptStateForTesting();
    rt.setRuntimeHost(null);
  }
});
