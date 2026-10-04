// exportParametersChannelBindings.test.js — each channel of a custom component exports ITS binding.
//
// THE BUG. deriveExportParameters computed one device wire per control — the first deviceParameter
// binding, else the first sendable MIDI binding — and spread it onto EVERY public channel's host
// parameter. A component with `cutoff` bound to filter.cutoff and `resonance` bound to
// filter.resonance exported two automation lanes that BOTH drove filter.cutoff with the plugin window
// closed. The live editor was right all along: deviceBindingSync.js indexes each binding by its
// `port`, which is the channel's name. Only the exported plugin was wrong, and only window-closed,
// which is exactly the case nobody looks at while building the panel.
//
// The fix picks the wire per channel by port. One public channel keeps the old rule — any binding
// drives it — because there is nothing to choose between and panels rely on it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';

function componentWith(channelNames, bindings, name = 'Filter') {
  const control = createControl('CustomComponent', { Core: { id: name, name } });
  control._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: Object.fromEntries(channelNames.map((ch) => [ch, createValueChannel(ch, { max: 127, step: 1 })])),
  };
  control._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, bindings };
  return control;
}

const paramsOf = (control) => Object.fromEntries(
  deriveExportParameters({ name: 'p', controls: [control] })
    .filter((p) => p.controlName === control._children.Core.name)
    .map((p) => [p.id, p]),
);

const bound = (port, parameterId) => ({ kind: 'deviceParameter', port, parameterId, deviceRole: 'mainSynth' });
const cc = (port, controller) => ({ kind: 'midiControl', port, message: 'cc', channel: 1, controller, deviceRole: 'mainSynth' });

test('two channels bound to two parameters export two lanes that drive two parameters', () => {
  const params = paramsOf(componentWith(['cutoff', 'resonance'], [bound('cutoff', 'filter.cutoff'), bound('resonance', 'filter.resonance')]));
  assert.equal(params['Filter.cutoff'].deviceParameterId, 'filter.cutoff');
  assert.equal(params['Filter.resonance'].deviceParameterId, 'filter.resonance', 'not the first channel\'s parameter');
});

test('a channel with no binding of its own sends nothing, rather than borrowing its neighbour\'s', () => {
  const params = paramsOf(componentWith(['cutoff', 'resonance'], [bound('cutoff', 'filter.cutoff')]));
  assert.equal(params['Filter.cutoff'].deviceParameterId, 'filter.cutoff');
  assert.equal(params['Filter.resonance'].deviceParameterId, '');
  assert.equal(params['Filter.resonance'].midiControl, undefined);
});

test('raw MIDI bindings are matched per channel the same way', () => {
  const params = paramsOf(componentWith(['cutoff', 'resonance'], [cc('resonance', 71), cc('cutoff', 74)]));
  assert.equal(params['Filter.cutoff'].midiControl.controller, 74);
  assert.equal(params['Filter.resonance'].midiControl.controller, 71);
});

test('per channel, a profile parameter still wins over a raw message, as it does per control', () => {
  const params = paramsOf(componentWith(['cutoff', 'resonance'], [cc('cutoff', 74), bound('cutoff', 'filter.cutoff')]));
  assert.equal(params['Filter.cutoff'].deviceParameterId, 'filter.cutoff');
  assert.equal(params['Filter.cutoff'].midiControl, undefined);
});

test('one public channel keeps the old rule: any binding drives it', () => {
  const params = paramsOf(componentWith(['level'], [bound('value', 'amp.level')], 'Amp'));
  assert.equal(params['Amp.level'].deviceParameterId, 'amp.level', 'a binding on port "value" still reaches the only channel');
});

test('a knob is untouched — the rule only concerns channels', () => {
  const knob = createControl('Knob', { Core: { id: 'k', name: 'k' } });
  knob._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, bindings: [bound('value', 'osc.pitch')] };
  const [param] = deriveExportParameters({ name: 'p', controls: [knob] });
  assert.equal(param.deviceParameterId, 'osc.pitch');
});
