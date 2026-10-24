// scriptApprovalGuard.test.js — the guard every running script's API calls through: a call made
// after the approval the API was built under has expired throws instead of running
// (panelRuntime.js, approvalGuard).
//
// The guard is one wrapper per function per approval, shared by every script and every spelling of
// the function. It used to be one per spelling, per script, wrapped twice, and on GAIA that alone
// was tens of megabytes of the player page. These pin both halves: the guard still holds, and it is
// built once.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resetScriptStateForTesting, scriptApiForTesting, setRuntimeHost,
} from '../src/CE_Application/scripting/panelRuntime.js';

const EXPIRED = /Script approval expired/;

/** Run `fn` with a panel whose scripts have `modules` turned on. */
function withModules(modules, fn) {
  setRuntimeHost({ panel: { id: 'p', name: 'P', width: 100, height: 100, scripting: { modules }, controls: [] } });
  try { return fn(); } finally { setRuntimeHost(null); }
}

test('a guarded API runs while its approval stands and refuses every call once it expires', () => {
  withModules(['ce.midi', 'ce.music'], () => {
    const api = scriptApiForTesting('', 'guard-a', true);
    assert.equal(api.noteNumber('C4'), 60);
    assert.equal(api.ce.music.number('C4'), 60);

    resetScriptStateForTesting();

    assert.throws(() => api.noteNumber('C4'), EXPIRED, 'a flat name');
    assert.throws(() => api.ce.music.number('C4'), EXPIRED, 'the namespaced spelling');
    assert.throws(() => api.self.get('value'), EXPIRED, 'a nested object');
    assert.throws(() => api.log('hello'), EXPIRED, "the script's own functions");
  });
});

test('every spelling of a function, in every script, calls through the same guard', () => {
  withModules(['ce.midi', 'ce.music'], () => {
    const a = scriptApiForTesting('', 'guard-a', true);
    const b = scriptApiForTesting('', 'guard-b', true);
    assert.equal(a.sendCC, a.ce.midi.sendCC, 'the flat alias and ce.midi.sendCC');
    assert.equal(a.noteNumber, b.noteNumber, 'a helper handed to two scripts');
    assert.notEqual(a.log, b.log, "each script's own log stays its own");
  });
});

test('a gated member is one stub, shared, and guarded like the rest', () => {
  withModules(['ce.music'], () => {
    const a = scriptApiForTesting('', 'guard-a', true);
    const b = scriptApiForTesting('', 'guard-b', true);
    assert.equal(a.sendCC, b.sendCC);
    assert.equal(a.sendCC(1, 2, 3), undefined, 'a gated member explains itself instead of throwing');
    resetScriptStateForTesting();
    assert.throws(() => a.sendCC(1, 2, 3), EXPIRED);
  });
});

test('an API built after the approval changes gets guards of its own', () => {
  withModules(['ce.music'], () => {
    const before = scriptApiForTesting('', 'guard-a', true);
    resetScriptStateForTesting();
    const after = scriptApiForTesting('', 'guard-a', true);
    assert.notEqual(after.noteNumber, before.noteNumber);
    assert.equal(after.noteNumber('C4'), 60);
    assert.throws(() => before.noteNumber('C4'), EXPIRED, 'the old one stays expired');
  });
});

test('an unguarded API is handed the functions themselves', () => {
  withModules(['ce.music'], () => {
    const api = scriptApiForTesting('', 'parity-probe');
    resetScriptStateForTesting();
    assert.equal(api.noteNumber('C4'), 60);
  });
});
