import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterFeedback, parameterGroup, parameterAccent } from '../src/CE_Application/utils/parameterStatus.js';

const binding={deviceRole:'GAIA',parameterId:'cutoff'};
const feedback=(received,writes)=>({GAIA:{received:{cutoff:received},writes:{cutoff:writes}}});
test('parameter confirmation requires matching feedback newer than the latest write',()=>{
  assert.equal(parameterFeedback(binding,64).text,'NOT READ FROM SYNTH');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1})).text,'HARDWARE CONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1},{value:64,sequence:2,state:'unverified'})).text,'LOCAL / UNCONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:3},{value:64,sequence:2,state:'unverified'})).text,'HARDWARE CONFIRMED');
  assert.equal(parameterFeedback(binding,65,feedback({value:64,sequence:3})).text,'LOCAL / UNCONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1},{sequence:2,state:'error',error:'Failed'})).text,'SEND ERROR');
  assert.equal(parameterFeedback(binding,false,feedback({value:'off',sequence:1})).text,'HARDWARE CONFIRMED');
});
test('context and colours distinguish tones while grouping related controls',()=>{
  assert.equal(parameterGroup('tone2.filter.envAttackTime'),'tone2.filter');
  assert.equal(parameterGroup('system.masterTune'),'system');
  assert.equal(new Set([1,2,3].map(t=>parameterAccent(`tone${t}.filter.cutoff`))).size,3);
});

// --- One item per bound channel -------------------------------------------------------------------
//
// A custom component with `cutoff` and `resonance` bound to two synth parameters drives both and,
// since the export fix, exports both — but the Parameter Editor listed only the first. The first
// binding keeps the control's own id (every existing item, focus and recent list is keyed by it);
// each further channel binding is listed as `controlId::channel`.

import { parameterEntries, parameterBindingFor, splitParameterItemId, parameterStatusDesignModel } from '../src/CE_Application/utils/parameterStatus.js';

const bind = (port, parameterId) => ({ kind: 'deviceParameter', port, parameterId, deviceRole: 'GAIA' });
function componentWith(bindings, channels = ['cutoff', 'resonance']) {
  return { _children: {
    Core: { id: 'flt', name: 'Filter', controlType: 'CustomComponent' },
    ValueChannels: { _children: Object.fromEntries(channels.map((c) => [c, { name: c, label: c.toUpperCase(), min: 0, max: 127, defaultValue: 10 }])) },
    DeviceBindings: { bindings },
  } };
}

test('each bound channel of a component is its own item; the first keeps the control id', () => {
  const control = componentWith([bind('cutoff', 'filter.cutoff'), bind('resonance', 'filter.resonance')]);
  assert.deepEqual(parameterEntries(control).map((e) => [e.id, e.binding.parameterId]), [
    ['flt', 'filter.cutoff'],
    ['flt::resonance', 'filter.resonance'],
  ]);
  assert.equal(parameterBindingFor(control, 'flt::resonance').parameterId, 'filter.resonance');
  assert.deepEqual(splitParameterItemId('flt::resonance'), { controlId: 'flt', port: 'resonance' });
  assert.deepEqual(splitParameterItemId('flt'), { controlId: 'flt', port: '' });
});

test('a single binding, a knob, and bindings that name no channel are listed exactly as before', () => {
  assert.deepEqual(parameterEntries(componentWith([bind('cutoff', 'filter.cutoff')])).map((e) => e.id), ['flt']);
  const knob = { _children: { Core: { id: 'k' }, DeviceBindings: { bindings: [bind('value', 'osc.pitch'), bind('value', 'osc.fine')] } } };
  assert.deepEqual(parameterEntries(knob).map((e) => e.id), ['k'], 'a knob has one value, so one item');
  const stray = componentWith([bind('cutoff', 'a'), bind('nowhere', 'b'), bind('cutoff', 'c')]);
  assert.deepEqual(parameterEntries(stray).map((e) => e.id), ['flt'], 'no channel, or a repeated one, is not a new item');
});

test('the design preview lists every bound channel', () => {
  const control = componentWith([bind('cutoff', 'tone1.filter.cutoff'), bind('resonance', 'tone1.filter.resonance')]);
  control._children.Designer = { lcdReadout: { label: 'CUTOFF' } };
  const model = parameterStatusDesignModel([control]);
  const ids = model.items.map((i) => i.id);
  assert.deepEqual(ids, ['flt', 'flt::resonance']);
  assert.equal(model.items[0].title, 'CUTOFF', 'the first keeps the component readout');
  assert.equal(model.items[1].title, 'RESONANCE', 'a further channel is titled by its own label');
  assert.equal(model.items[1].parameterId, 'tone1.filter.resonance');
});
