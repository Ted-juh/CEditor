// animationPresetFormat.test.js — the preset format module imports nothing, and agrees with the model.
//
// stores/panelModel.js reads the presets a panel carries, and the export tools run it under plain
// Node (exportToolsPlainNode.test.js). When it imported the animation model to do so, preparing an
// export failed: the model brings the interaction runtime, which has an import only the bundler
// resolves. So the format is a module of its own with two things copied from the model — and these
// hold the copies to the originals.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRESET_KINDS, cleanPresetAnimationName, cleanPreset, PRESET_FORMAT } from '../src/CE_Application/utils/animationPresetFormat.js';
import { ANIMATION_KINDS, VALUE_KIND, EMIT_KIND, cleanAnimationName } from '../src/CE_Application/utils/animationModel.js';

test('the format module imports nothing, so plain Node can read a panel\'s presets', () => {
  const source = readFileSync(new URL('../src/CE_Application/utils/animationPresetFormat.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(source), false);
  assert.equal(/^export .* from /m.test(source), false);
});

test('its copies are the model\'s: the kinds, and the rule for an animation\'s name', () => {
  assert.deepEqual([...PRESET_KINDS], [...ANIMATION_KINDS, VALUE_KIND, EMIT_KIND], 'every kind a control may have, the value and emit kinds included');
  for (const name of ['lift', ' hover lift ', 'fade.slower', 'x-y_z9', '', null, 'É', 'a/b']) {
    assert.equal(cleanPresetAnimationName(name), cleanAnimationName(name), String(name));
  }
});

test('a state keeps its rule; the fields are only those a recipe owns', () => {
  const preset = cleanPreset({
    format: PRESET_FORMAT, version: 1, id: 'ap_rules', name: 'Rules',
    animations: { glow: { kind: 'transition', trigger: { type: 'stateChange', to: ['overload'] }, targets: [] } },
    states: {
      Overload: { when: {}, rule: '  valueNormalized > 0.9\n', patches: { parts: { bodyTrackFill: { 'Background.Fill.colour': 'FFFF0000' } } } },
      Plain: { when: { hover: true } },
    },
    fields: {
      'Text.shows': 'nameValue',
      'Behavior.showHandleLabels': true,
      'Parts.labelCurrent.opacity': 3,
      'Behavior.min': -10,
      'Parts.labelCurrent.Text.content': 'x',
      'Behavior.showHandleLabels ': 'yes',
    },
  });
  assert.equal(preset.states.Overload.rule, 'valueNormalized > 0.9', 'trimmed, kept');
  assert.equal('rule' in preset.states.Plain, false, 'none where it had none');
  assert.deepEqual(preset.fields, { 'Text.shows': 'nameValue', 'Behavior.showHandleLabels': true, 'Parts.labelCurrent.opacity': 1 });
});
