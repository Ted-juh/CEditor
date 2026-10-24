// gaiaScriptsLoad.test.js — every one of the GAIA panel's scripts loads in the window-open runtime.
//
// The panel has 232 JavaScript scripts, one per patch-recall button among them, and each runs in a
// sandbox of its own (scripting/boundedJavascript.js). From 4 October those sandboxes were capped at
// 32, so in the editor's preview and in the plug-in with its window open the 33rd script onward
// failed to load with "Too many script instances" — two hundred buttons that did nothing — while the
// plug-in's window-closed runtime loaded all of them. Nothing failed: each script's own tests run it
// outside the sandbox, through the GAIA harness, and so never met the cap.
//
// This loads them the way the runtime does, through runScript and the sandbox, with the player's own
// host over the real panel, and reads the console for errors. (It used a stand-in host whose panel
// had no controls, so every set() a script made missed, and only load errors could be checked.)
//
// With the profile the panel requires (its requiredProfiles), mapped and loaded as an exported
// plug-in carries it. Running a script runs its handler, as the editor's Run does, and a preset
// button's recall with no profile chosen says it recalled nothing, which is an error line, though
// not a load error. The plug-in has the profile; so does this.
//
// With the time limit lifted. It is wall-clock, and when it was 250 ms the full suite running beside
// a C++ build pushed one of these over (the slowest took about 200 ms idle), which stopped its
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
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';
const GAIA_PROFILE = 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json';

test('all of the GAIA panel\'s scripts load, each in its own sandbox', async () => {
  const panel = { ...deserializePanel(readText(path.join(REPO, GAIA)), GAIA, null), id: 'gaia' };
  assert.equal(panel.scripts.length, 232, 'the panel this test is about');
  panels.set([]);
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost(createPlayerHost(() => panel));   // as the player does: a host means approved
  addPanel(panel);
  setActivePanel('gaia');
  for (const { role, profileId } of panel.requiredProfiles ?? []) {
    deviceRoleMappings.update((m) => ({ ...m, [role]: { role, profileId, variables: {}, timingOverrides: {} } }));
    profileSources.update((s) => ({ ...s, [profileId]: { profileId, source: readText(path.join(REPO, GAIA_PROFILE)) } }));
  }
  await initialiseJavascriptSandbox();
  setTimeLimitForTesting(60_000);
  try {
    // The console keeps its last 1,000 lines, so errors are picked out by id, not by position. Any
    // error at all: a script stopped by a limit loses its sandbox without a load error, and a set()
    // that misses its control is an error of its own.
    const errors = [];
    for (const script of panel.scripts) {
      const seen = get(scriptTrace).at(-1)?.id ?? 0;
      await rt.runScript(script);
      for (const line of get(scriptTrace)) {
        if (line.id > seen && line.kind === 'error') errors.push(`${script.id}: ${line.message}`);
      }
    }
    assert.deepEqual(errors, [], `${errors.length} errors while the scripts loaded`);
    assert.equal(sandboxCountForTesting(), 232, 'each script keeps its sandbox, for its handlers to run in later');
  } finally {
    setTimeLimitForTesting();
    rt.resetScriptStateForTesting();
    rt.setRuntimeHost(null);
    deviceRoleMappings.set({});
    profileSources.set({});
  }
});
