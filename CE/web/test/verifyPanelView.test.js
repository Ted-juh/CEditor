// ce.verify in the panel view: the host panelRuntime.js gives verifyCore.js reads the GAIA profile's
// dumps, requests and encodings as the plug-in's "dumpLayout" query does, so coverage answers from a
// real profile; and a check on a synth that is not connected does not start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { profileParameterTables } from '../src/CE_Application/stores/deviceParameterTable.js';

const here = dirname(fileURLToPath(import.meta.url));
const GAIA = JSON.parse(readFileSync(join(here, '..', '..', 'profiles', 'test', 'roland-gaia-sh01.ceditor-device.json'), 'utf8'));

function withGaia(fn) {
  resetScriptStateForTesting();
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core', 'ce.device', 'ce.time', 'ce.verify'] } }]);
  activePanelId.set('p');
  profileSources.set({ [GAIA.id]: { profileId: GAIA.id, source: JSON.stringify(GAIA) } });
  deviceRoleMappings.set({ mainSynth: { role: 'mainSynth', profileId: GAIA.id, variables: {}, timingOverrides: {} } });
  // The parameter table as the host's pages bring it: the descriptors ce.device.parameters() gives.
  profileParameterTables.set({ [GAIA.id]: { complete: true, parameters: GAIA.parameters.map((p) => ({
    id: p.id, name: p.name, group: p.group, type: p.type, range: p.range, choices: p.choices, access: p.access })) } });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'verify-script');
    const result = fn(api.ce.verify, api);
    return { result, lines: get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => t.message) };
  } finally {
    panels.set([]); profileSources.set({}); deviceRoleMappings.set({}); profileParameterTables.set({});
  }
}

test.after(() => resetScriptStateForTesting());

test('coverage reads the profile the panel uses, and every GAIA dump adds up', () => {
  const { result, lines } = withGaia((verify) => verify.coverage());
  assert.deepEqual(lines, []);
  const inDumps = new Set(GAIA.dumpDefinitions.flatMap((d) => d.mappings.map((m) => m.parameter)));
  const expectedCheckable = GAIA.parameters.filter((p) => p.type !== 'action' && inDumps.has(p.id)).length;
  assert.ok(result.total > 0);
  assert.equal(result.checkable, expectedCheckable);
  assert.equal(result.dumps.length, 26);
  for (const d of result.dumps) assert.equal(d.layoutBytes, d.expectedBytes, d.kind);
});

test('a check does not start on a synth that is not connected, and says nothing about it', () => {
  const { result, lines } = withGaia((verify) => [verify.check(() => {}), verify.running(), verify.cancel()]);
  assert.deepEqual(result, [false, null, false]);
  assert.deepEqual(lines, []);
});

test('an option a check does not take refuses it, in the panel view as in the preludes', () => {
  const { result, lines } = withGaia((verify) => verify.check({ idz: ['x'] }, () => {}));
  assert.equal(result, false);
  assert.match(lines.join('\n'), /ce\.verify\.check: "idz" is not one of its options, so nothing was done\./);
});
