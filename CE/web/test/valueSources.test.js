// The designer's words for where a value is taken from (utils/valueSources.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { describeValueSource, panelValueSources, valueSourceChoices } from '../src/CE_Application/utils/valueSources.js';

const component = (channels) => ({ _children: { Core: { id: 'comp' }, ValueChannels: { _children: channels } } });
const knob = createControl('Knob', { Core: { id: 'k1', name: 'Cutoff' } });
const slider = createControl('Slider', { Core: { id: 's1', name: 'Volume' } });
const label = createControl('Label', { Core: { id: 'l1', name: 'Title' } });

test('a value follows a knob or slider on the panel, or another value of the component', () => {
  const comp = component({
    Level: { type: 'float', min: 0, max: 1, valueSource: 'k1' },
    Drive: { type: 'float', label: 'Drive', min: 0, max: 1 },
    Mode: { type: 'enum', values: ['A', 'B'] },
  });
  assert.deepEqual(panelValueSources([knob, slider, label]).map((s) => `${s.name}:${s.noun}`), ['Cutoff:knob', 'Volume:slider']);
  assert.deepEqual(valueSourceChoices(comp, 'Level', [knob, slider, label]), [
    { value: '', label: 'Its own value' },
    { value: 'channel:Drive', label: 'Drive (a value of this component)' },
    { value: 'k1', label: 'Cutoff (a knob on the panel)' },
    { value: 's1', label: 'Volume (a slider on the panel)' },
  ]);
  assert.equal(describeValueSource(comp, 'Level', [knob, slider]), 'follows Cutoff, a knob on the panel');
  assert.equal(describeValueSource(comp, 'Drive', [knob]), '');
  // A source the panel does not have is still shown, and said to be missing.
  assert.equal(describeValueSource(comp, 'Level', [slider]), 'follows a control that is not on this panel');
  assert.deepEqual(valueSourceChoices(comp, 'Level', [slider]).at(-1), { value: 'k1', label: 'k1 (not on this panel)' });
  const inner = component({ Level: { type: 'float', valueSource: 'channel:Drive' }, Drive: { type: 'float', label: 'Drive' } });
  assert.equal(describeValueSource(inner, 'Level', []), 'follows Drive, a value of this component');
});
