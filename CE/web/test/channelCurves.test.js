// channelCurves.test.js — a value channel's Curve takes effect (docs/design/changeable-control-sets.md,
// piece D3): the control's travel maps to the value through it, everywhere a person moves it and
// everywhere the artwork reads it, and the plug-in's parameter carries it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CURVE_MODES, curveExportSpec, curveSpec, defaultCurveCentre, fractionToTravel, steppedFractionWithHysteresis, travelToFraction,
} from '../src/CE_Application/utils/channelCurves.js';
import {
  denormalizeCustomChannelValue, normalizeCustomChannelValue, resetCustomChannelToDefault, stepCustomChannelValue,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';
import { bindingSourceGroups } from '../src/CE_Application/utils/bindingSourceOptions.js';
import { resolveInteractionContext } from '../src/CE_Application/utils/interactionRuntime.js';
import { normalizeExportParameter } from '../src/CE_Application/utils/exportParameters.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const cutoff = (curve = {}) => createValueChannel('cutoff', { min: 20, max: 20000, step: 1, defaultValue: 1000, type: 'float', curve: { mode: 'exponential', ...curve } });

test('every curve maps the ends to the ends, and reads back the travel it gave', () => {
  for (const mode of CURVE_MODES) {
    const spec = curveSpec({ min: 0, max: 1, curve: { mode, deadZone: 0.1 } });
    assert.ok(near(travelToFraction(spec, 0), 0), `${mode} starts at the bottom`);
    assert.ok(near(travelToFraction(spec, 1), 1), `${mode} ends at the top`);
    if (mode === 'stepped' || mode === 'dead-zone' || mode === 'bipolar') continue;
    for (const p of [0.1, 0.33, 0.5, 0.8]) {
      assert.ok(near(fractionToTravel(spec, travelToFraction(spec, p)), p, 1e-9), `${mode} at ${p}`);
    }
  }
});

test('half way round an Exponential 20 Hz to 20 kHz knob is the geometric middle, and Centre moves it', () => {
  assert.ok(near(defaultCurveCentre(cutoff()), Math.sqrt(20 * 20000)), 'the default centre is the geometric middle');
  assert.ok(near(denormalizeCustomChannelValue(cutoff(), 0.5), Math.round(Math.sqrt(20 * 20000))), 'half travel is 632 Hz');
  assert.equal(denormalizeCustomChannelValue(cutoff({ centre: 1000 }), 0.5), 1000, 'Centre value is the value at half travel');
  assert.ok(near(normalizeCustomChannelValue(cutoff({ centre: 1000 }), 1000), 0.5, 1e-9), 'and that value is drawn at half travel');
  // Logarithmic bends the other way.
  const log = createValueChannel('x', { min: 0, max: 100, step: 0, curve: { mode: 'logarithmic' } });
  assert.ok(denormalizeCustomChannelValue(log, 0.5) > 80, 'half way round a Logarithmic knob is near the top');
  // A channel that says nothing is linear, as it was.
  const plain = createValueChannel('p', { min: 0, max: 10, step: 0 });
  assert.equal(denormalizeCustomChannelValue(plain, 0.5), 5);
  assert.equal(normalizeCustomChannelValue(plain, 2.5), 0.25);
});

test('Stepped clicks into its steps, and Hysteresis holds a step until the travel is past its edge', () => {
  const ch = createValueChannel('s', { min: 0, max: 4, step: 0, curve: { mode: 'stepped', steps: 5, hysteresis: 0.25 } });
  assert.equal(denormalizeCustomChannelValue(ch, 0.3), 1);
  assert.equal(denormalizeCustomChannelValue(ch, 0.4), 2);
  // From step 1, travel 0.4 is step 2's nearest, but not a quarter step past the edge (0.375 + 0.0625).
  assert.equal(denormalizeCustomChannelValue(ch, 0.4, { previous: 1 }), 1, 'held on the step it was on');
  assert.equal(denormalizeCustomChannelValue(ch, 0.45, { previous: 1 }), 2, 'and moves once past');
  const spec = curveSpec(ch);
  assert.equal(steppedFractionWithHysteresis(spec, 0.62, 0.75), 0.75, 'the same coming down');
});

test('Dead Zone holds the centre, and Bipolar rests at its centre', () => {
  const dz = createValueChannel('d', { min: -1, max: 1, step: 0, curve: { mode: 'dead-zone', deadZone: 0.2 } });
  for (const p of [0.41, 0.5, 0.59]) assert.equal(denormalizeCustomChannelValue(dz, p), 0, `travel ${p} is the centre`);
  assert.ok(denormalizeCustomChannelValue(dz, 0.7) > 0);
  const bi = createValueChannel('b', { min: 0, max: 127, step: 1, defaultValue: 0, curve: { mode: 'bipolar' } });
  const control = { _children: { ValueChannels: { _children: { b: bi } } } };
  assert.equal(resetCustomChannelToDefault(control, 'b', { b: 100 }).b, 64, 'double-click returns a Bipolar channel to its centre');
});

test('the wheel and keys move by travel where a curve bends it, and as before where none does', () => {
  const plain = createValueChannel('p', { min: 0, max: 1, step: 0.01 });
  assert.ok(near(stepCustomChannelValue(plain, 0.5, 1), 0.51), 'a linear channel moves by its step');
  const ch = cutoff();
  const low = stepCustomChannelValue(ch, 100, 1) - 100;
  const high = stepCustomChannelValue(ch, 10000, 1) - 10000;
  assert.ok(low >= 1 && high > low * 10, 'an Exponential knob moves a little at the bottom and a lot at the top');
  const steps = createValueChannel('s', { min: 0, max: 4, step: 0, curve: { mode: 'stepped', steps: 5 } });
  assert.equal(stepCustomChannelValue(steps, 1, 1), 2, 'a Stepped channel moves a step');
  assert.equal(stepCustomChannelValue(steps, 1, -1), 0);
});

test('the artwork reads travel, and a Bipolar channel offers -1 to 1 to bindings', () => {
  const ch = cutoff({ centre: 1000 });
  const control = { _children: { Core: { controlType: 'CustomComponent' }, ValueChannels: { _children: { cutoff: ch } } } };
  const signals = resolveInteractionContext(control, { customValues: { cutoff: 1000 } });
  assert.ok(near(signals.customChannels['channel.cutoff.normalized'], 0.5, 1e-9), 'a pointer bound to normalized sits at half travel');
  assert.ok(near(signals.customChannels['channel.cutoff.bipolar'], 0, 1e-9));
  const bi = createValueChannel('pan', { min: -1, max: 1, curve: { mode: 'bipolar' } });
  const labels = bindingSourceGroups({ _children: { ValueChannels: { _children: { pan: bi, cutoff: ch } } } })
    .flatMap((group) => group.options ?? []).map((option) => option.value);
  assert.ok(labels.includes('channel.pan.bipolar'), 'offered for the Bipolar channel');
  assert.ok(!labels.includes('channel.cutoff.bipolar'), 'not for the others');
});

test('the plug-in parameter carries the curve; a linear one carries none', () => {
  assert.deepEqual(curveExportSpec(cutoff({ centre: 630 })), { mode: 'exponential', centre: Math.round(((630 - 20) / 19980) * 1e6) / 1e6 });
  assert.equal(curveExportSpec(createValueChannel('p', {})), null);
  assert.equal(curveExportSpec(createValueChannel('b', { curve: { mode: 'bipolar' } })), null, 'Bipolar with no dead zone maps straight');
  const entry = normalizeExportParameter({ id: 'k.cutoff', path: 'k.cutoff', min: 20, max: 20000, curve: { mode: 'stepped', steps: 4 } });
  assert.deepEqual(entry.curve, { mode: 'stepped', steps: 4 });
  assert.equal(normalizeExportParameter({ id: 'a', path: 'a', curve: { mode: 'wobbly' } }).curve, undefined);
  const source = readFileSync(new URL('../src/CE_Application/utils/exportParameters.js', import.meta.url), 'utf8');
  assert.match(source, /\.\.\.curveField\(curveExportSpec\(channel\)\)/, 'every channel parameter is given its curve');
  const cpp = readFileSync(new URL('../../src/Player/PanelParameters.h', import.meta.url), 'utf8');
  assert.match(cpp, /parameterRange \(p\),/, 'the C++ builds the float parameter from the curved range');
});

test('the channel section shows the curve, Centre value and Steps', () => {
  const source = readFileSync(new URL('../src/CE_Application/sections/CustomValueChannelsEditor.svelte', import.meta.url), 'utf8');
  for (const words of ['label="Curve"', 'label="Centre value"', 'label="Steps"', 'data-testid="channel-curve"', 'Half way round:', '{CURVE_LABELS[option]}']) {
    assert.ok(source.includes(words), words);
  }
});
