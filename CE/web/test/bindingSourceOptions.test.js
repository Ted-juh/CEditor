// bindingSourceOptions.test.js — a binding's Source shows what the binding reads, and offers the
// component's channels.
//
// A knob made from a panel control reads `channel.Cutoff.raw`; the factory's knobs read
// `channel.mainValue.normalized`. The Source list held only value.* and state.*, so every such
// binding showed a blank Source, and picking anything from the list disconnected the part.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import BindingsEditor from '../src/CE_Application/sections/BindingsEditor.svelte';
import { bindingSourceGroups, choiceGroups, defaultBindingSource, MAP_MODES } from '../src/CE_Application/utils/bindingSourceOptions.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const component = (bindings, channels = { Cutoff: { type: 'float' }, Steps: { type: 'array' } }) => ({
  _children: {
    Core: { id: 'filter', controlType: 'CustomComponent', name: 'Filter' },
    ValueChannels: { _children: channels },
    Bindings: { _children: bindings },
  },
});

const values = (groups) => groups.flatMap((group) => group.options.map((entry) => entry.value));

test("a component's channels come first, in the three forms the runtime gives each", () => {
  const groups = bindingSourceGroups(component({}));
  assert.equal(groups[0].label, 'Channels');
  assert.deepEqual(values([groups[0]]), [
    'channel.Cutoff.raw', 'channel.Cutoff.normalized', 'channel.Cutoff.display',
    'channel.Steps.raw', 'channel.Steps.normalized', 'channel.Steps.display', 'channel.Steps.items', 'channel.Steps.count',
  ]);
  assert.ok(values(groups).includes('value.normalized'));
  assert.ok(values(groups).includes('state.hover'));
});

test('a source no list holds is offered as it is, first, so it is never blank and never lost', () => {
  const groups = bindingSourceGroups(component({}), 'channel.Gone.raw');
  assert.equal(groups[0].label, 'This binding');
  assert.deepEqual(values([groups[0]]), ['channel.Gone.raw']);
  assert.equal(bindingSourceGroups(component({}), 'channel.Cutoff.raw')[0].label, 'Channels', 'a known source adds nothing');
  assert.equal(choiceGroups(MAP_MODES, 'spline')[0].options[0].value, 'spline');
});

test('a new binding starts from the first channel, or from the value on a control without channels', () => {
  assert.equal(defaultBindingSource(component({})), 'channel.Cutoff.normalized');
  assert.equal(defaultBindingSource(createControl('Slider')), 'value.normalized');
});

test('the React tab shows a converted knob\'s source selected, and a text binding\'s settings', () => {
  const body = render(BindingsEditor, { props: { control: component({
    CutoffValue: { _type: 'Binding', name: 'CutoffValue', enabled: true, source: 'channel.Cutoff.raw', mapMode: 'direct', target: 'Parts.Cutoff.meta.sliderControl.value' },
  }) } }).body;
  assert.match(body, /<option value="channel\.Cutoff\.raw"[^>]*selected[^>]*>Cutoff: value<\/option>/);

  const text = render(BindingsEditor, { props: { control: component({
    valueLabel: { _type: 'Binding', name: 'valueLabel', enabled: true, source: 'channel.Cutoff.display', mapMode: 'format', prefix: '~', precision: 1, target: 'Parts.valueText.Text.content' },
  }) } }).body;
  assert.match(text, /<option value="format"[^>]*selected[^>]*>Text<\/option>/);
  assert.match(text, /Prefix/);
  assert.match(text, /Decimals/);
  assert.doesNotMatch(text, /Direct Map/);
});
