import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCustomInteractionPatch, resolveCustomHitZoneProbeValues } from '../src/CE_Application/utils/customComponentInteraction.js';

test('selector clicks and workshop probes accept scalar and structured choices, including zero and false', () => {
  for (const [type, payload, expected] of [
    ['int', 4, 4], ['int', 0, 0], ['int', { value: 3 }, 3],
    ['bool', false, false], ['bool', true, true],
    ['enum', 'square', 'square'],
  ]) {
    const control = { _children: {
      Core: { controlType: 'CustomComponent' },
      ValueChannels: { _children: { value: { type, min: 0, max: 6, step: 1,
        defaultValue: type === 'enum' ? 'saw' : 1, enumValues: ['saw', 'square'] } } },
      Behaviors: { _children: { drive: { type: 'selector', valueChannel: 'value' } } },
    } };
    const zone = { action: 'setValue', targetBehavior: 'drive', targetValueChannel: 'value', payload };
    const patch = resolveCustomInteractionPatch(control, {}, { name: 'pick', zone },
      { rect: { left: 0, top: 0, width: 100, height: 100 }, clientX: 95, clientY: 95 });
    assert.equal(patch.customValues.value, expected, `${type}: ${JSON.stringify(payload)}`);
    assert.equal(resolveCustomHitZoneProbeValues(control, { zone }).value, expected);
  }
});
