import test from 'node:test';
import assert from 'node:assert/strict';
import { hostPartLabel, hostTargetContext } from '../src/CE_Application/utils/hostTargetContext.js';

test('duplicate plug-in names resolve by ID and reflect current part and insert ordering', () => {
  const effect = id => ({ effectId: id, pluginName: 'Delay' });
  const rack = { parts: [
    { partId: 'a', pluginName: 'Spire', hasInstrument: true, effects: [effect('a1')] },
    { partId: 'b', pluginName: 'Spire', hasInstrument: true, effects: [effect('b1'), effect('b2')] },
  ] };
  assert.equal(hostTargetContext(rack, 'b2').ownerId, 'b');
  assert.equal(hostTargetContext(rack, 'b2').ownerLabel, '02 · Spire');
  assert.equal(hostTargetContext(rack, 'b2').label, '02 · Delay');
  rack.parts.reverse();
  rack.parts[0].effects.reverse();
  assert.equal(hostTargetContext(rack, 'b2').ownerLabel, '01 · Spire');
  assert.equal(hostTargetContext(rack, 'b2').label, '01 · Delay');
  assert.equal(hostTargetContext(rack, 'removed'), null);
});

test('global insert ownership never inherits the focused instrument', () => {
  const rack = { parts: [{ partId: 'p', pluginName: 'Spire', hasInstrument: true }],
    focusedPartId: 'p', masterEffects: [{ effectId: 'm' }],
    buses: [{ busId: 'b', name: 'Synths', effects: [{ effectId: 'be' }] }],
    returns: [{ returnId: 'r', name: 'Space', effects: [{ effectId: 're' }] }] };
  for (const [id, ownerId, label] of [['m', '@master', 'Master'], ['be', 'b', 'Bus · Synths'], ['re', 'r', 'Return · Space']]) {
    const context = hostTargetContext(rack, id);
    assert.equal(context.ownerId, ownerId);
    assert.equal(context.ownerLabel, label);
    assert.equal(context.part, null);
  }
});

test('identity distinguishes empty, missing and hardware parts', () => {
  assert.equal(hostPartLabel({}, 0), '01 · Empty part');
  assert.equal(hostPartLabel({ unresolved: true, pluginName: 'Spire' }, 1), '02 · Spire (missing)');
  assert.equal(hostPartLabel({ hardware: true, midiOutputName: 'Moog' }, 2), '03 · Moog (HW)');
});
