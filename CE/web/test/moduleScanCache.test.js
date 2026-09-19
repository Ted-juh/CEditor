import test from 'node:test';
import assert from 'node:assert/strict';
import { modulesUsedBy, registerExtension, unregisterExtension, clearExtensions } from '../src/CE_Application/scripting/panelApi.js';

test('module scans follow source changes and callers cannot corrupt cached results', () => {
  const source = 'ce.midi.sendCC(1, 74, 80)';
  const first = modulesUsedBy(source);
  assert.deepEqual(first, ['ce.midi']);
  first.splice(0, first.length, 'broken');
  assert.deepEqual(modulesUsedBy(source), ['ce.midi']);
  assert.deepEqual(modulesUsedBy('ce.time'), ['ce.time']);
  assert.deepEqual(modulesUsedBy(source), ['ce.midi']);
});

test('installing, replacing, removing and clearing extensions invalidate module scans', () => {
  const source = 'perfExtensionVerb(1)';
  const id = 'ce.ext.perf_test';
  clearExtensions();
  try {
    assert.deepEqual(modulesUsedBy(source), []);
    registerExtension({ id, members: [{ id: 'perfExtensionVerb', name: 'perfVerb' }] });
    assert.deepEqual(modulesUsedBy(source), [id]);
    registerExtension({ id, members: [{ id: 'perfOtherVerb', name: 'otherVerb' }] });
    assert.deepEqual(modulesUsedBy(source), []);
    assert.deepEqual(modulesUsedBy('perfOtherVerb()'), [id]);
    unregisterExtension(id);
    assert.deepEqual(modulesUsedBy('perfOtherVerb()'), []);
    registerExtension({ id, members: [{ id: 'perfExtensionVerb', name: 'perfVerb' }] });
    assert.deepEqual(modulesUsedBy(source), [id]);
    clearExtensions();
    assert.deepEqual(modulesUsedBy(source), []);
  } finally { clearExtensions(); }
});
