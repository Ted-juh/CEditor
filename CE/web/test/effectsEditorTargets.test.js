import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import EffectsEditor from '../src/CE_Application/sections/EffectsEditor.svelte';

function controlWith(sections = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'effects-target', controlType: 'CustomComponent' },
      Effects: {
        _type: 'Effects',
        _children: { Shadows: { items: [] }, Filters: {}, Blend: {} },
      },
      ...sections,
    },
  };
}

test('effects target picker only offers effect sections that exist on the control', () => {
  const body = render(EffectsEditor, { props: { control: controlWith() } }).body;
  assert.match(body, /Edit component effects/);
  assert.doesNotMatch(body, /Edit text effects/);
  assert.doesNotMatch(body, /Edit icon effects/);
});

test('effects target picker exposes authored text and icon effect sections', () => {
  const body = render(EffectsEditor, { props: { control: controlWith({
    Text: { _type: 'Text', _children: { Effects: { _type: 'Effects' } } },
    Icon: { _type: 'Icon', _children: { Effects: { _type: 'Effects' } } },
  }) } }).body;
  assert.match(body, /Edit text effects/);
  assert.match(body, /Edit icon effects/);
});
