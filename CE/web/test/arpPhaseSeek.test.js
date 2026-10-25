// arpPhaseSeek.test.js — ce.components.arp.phase is a seek (item 6 of the owner's review of the arp):
// (and, through the same runtime, item 7: mute's read counts from 1, as mute() does)
// it moves a running arp, or where a stopped one starts, through stores/componentPhases.js, and
// read(t, "phase") answers where it is. It wrote the stored phase, which the preview reads only
// when it opens, so a running arp never moved.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { provideComponentPhases, phaseNow, takePendingPhase } from '../src/CE_Application/stores/componentPhases.js';

/** A runtime over one Arp: what `fn` returns, the Arp's section after, its id, and what the console said. */
function run(arp, fn) {
  resetScriptStateForTesting();
  const control = createControl('Arp', { name: 'Arp' });
  Object.assign(control._children.Arp, arp);
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [control], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('Arp', 'arp-phase-probe').ce.components.arp, control._children.Core.id);
    return { result, arp: control._children.Arp, id: control._children.Core.id, said: get(scriptTrace).filter((t) => t.kind !== 'log').map((t) => t.message) };
  } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

test('a running preview is moved, and read answers where it is; nothing is written to the panel', () => {
  const sought = [];
  let at = 0.33;
  const withdraw = provideComponentPhases({ where: () => at, seek: (id, phase) => { sought.push([id, phase]); at = phase; } });
  try {
    const done = run({ phase: 0.5 }, (arp) => [arp.read('Arp', 'phase'), arp.phase('Arp', 0.5), arp.read('Arp', 'phase'), arp.read('Arp').phase]);
    assert.deepEqual(done.result, [0.33, true, 0.5, 0.5]);
    assert.deepEqual(sought, [[done.id, 0.5]], 'the stored 0.5 still seeks: it is where it starts, not where it is');
    assert.equal(done.arp.phase, 0.5, 'the stored phase untouched');
    assert.deepEqual(done.said, []);
  } finally { withdraw(); }
});

test('a phase is read as the verb reads it: the nearest end with a warning, a word refused', () => {
  const sought = [];
  const withdraw = provideComponentPhases({ where: () => 0, seek: (id, phase) => sought.push(phase) });
  try {
    const done = run({}, (arp) => [arp.phase('Arp', 1.5), arp.phase('Arp', 'half'), arp.phase('Arp')]);
    assert.deepEqual(done.result, [true, false, false]);
    assert.deepEqual(sought, [1]);
    assert.equal(done.said[0], 'arp Arp: phase(1.5) — the phase 1.5 is outside 0 to 1, so 1 was used. This is said only the first time.');
    assert.match(done.said[1], /^arp Arp: phase\("half"\) — refused, nothing changed\. "half" is not a number\.$/);
    assert.match(done.said[2], /^arp Arp: phase\(\) — refused, nothing changed/);
  } finally { withdraw(); }
});

test('a synced arp is not moved: the Transport\'s position decides', () => {
  const sought = [];
  const withdraw = provideComponentPhases({ where: () => 0.25, seek: (id, phase) => sought.push(phase) });
  try {
    const done = run({ syncToTransport: true }, (arp) => [arp.phase('Arp', 0.5), arp.read('Arp', 'phase')]);
    assert.deepEqual(done.result, [true, 0.25]);
    assert.deepEqual(sought, []);
    assert.deepEqual(done.said, ['arp Arp: phase(0.5) — synced to the Transport, whose position decides; nothing changed.']);
  } finally { withdraw(); }
});

test('with no preview, a seek waits for the next one, and read gives it until then', () => {
  const done = run({ phase: 0.1 }, (arp, id) => [arp.read('Arp', 'phase'), arp.phase('Arp', 0.75), arp.read('Arp', 'phase'), phaseNow(id)]);
  assert.deepEqual(done.result, [0.1, true, 0.75, 0.75]);
  assert.equal(takePendingPhase(done.id), 0.75, 'the preview that opens takes it');
  assert.equal(takePendingPhase(done.id), undefined, 'once');
  assert.equal(done.arp.phase, 0.1);
});

test('read gives the muted steps counted from 1, and one step as whether it is muted', () => {
  const done = run({}, (arp) => [
    arp.mute('Arp', 3), arp.mute('Arp', 9), arp.mute('Arp', 1), arp.read('Arp', 'mute'),
    arp.read('Arp', 'mute', 3), arp.read('Arp', 'mute', 2), arp.read('Arp', 'mute', 0), arp.mute('Arp', 3, false), arp.read('Arp', 'mute'),
  ]);
  assert.deepEqual(done.result, [true, true, true, [1, 3, 9], true, false, undefined, true, [1, 9]]);
  assert.deepEqual(done.arp.mutes, [0, 8], 'stored as the engine reads them, from 0; a step past the sequence kept');
  assert.deepEqual(done.said, ['arp.read("mute", 0): 0 is not a step: the steps count from 1.']);
});

