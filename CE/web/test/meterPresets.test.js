// meterPresets.test.js — the Meter's built-in animation presets (utils/meterPresets.js) and the
// Components showcase's Meter panels (scripts/componentPanels.js, CE/panels/Components/Meter/), phase
// 1: what plays on a meter today (docs/design/component-presets.md, The Meter).
//
// The promises: three groups of ordinary presets under Meter, each surviving its own file; the whole
// meter's and its reading's go on any meter in any set, and the Needle's, which move what the level
// draws, on a meter and nothing that draws no value; a needle preset hands back to the level, never
// keeps it; nothing waits for a state, a meter having none; nothing loops that does not say so; the
// library lists them after the Choice group; and the four panels, each in a set no other component's
// panel uses, every meter (or its reading) wearing its preset, every caption readable.

import test from 'node:test';
import assert from 'node:assert/strict';

import { METER_PRESETS, METER_PRESET_GROUPS, meterPresetId } from '../src/CE_Application/utils/meterPresets.js';
import { applyPresetPatch, presetDoesNotFit, presetFileText, readPresetFile, presetLink } from '../src/CE_Application/utils/animationPresetModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveColourLiteral } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { finishedColour } from '../src/CE_Application/utils/materialFilter.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { COMPONENT_PRESETS } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { BUTTON_PANELS, CHOICE_PANELS, KNOB_PANELS, METER_PANELS, SLIDER_PANELS } from '../scripts/componentPanels.js';

const byId = (slug) => METER_PRESETS.find((entry) => entry.slug === slug);
const SETS = { 'meter-attention': 'graphite', 'meter-needle': 'valve', 'meter-readout': 'ivory', 'meter-together': 'phosphor' };

test('the catalogue: three groups in order, each preset an ordinary preset under Meter, ids of its own', () => {
  assert.deepEqual(METER_PRESET_GROUPS.map((group) => group.id), ['attention', 'needle', 'readout']);
  assert.deepEqual(METER_PRESETS.map((entry) => entry.slug), [
    'pulse', 'breathe', 'knock', 'beat-pulse', 'look-here', 'pop-in',
    'self-test', 'wake-up', 'beat-kick', 'tap-sweep', 'shiver', 'drop-out',
    'odometer', 'reel', 'roll', 'push', 'crossfade',
  ]);
  for (const entry of METER_PRESETS) {
    assert.equal(entry.id, meterPresetId(entry.slug));
    assert.equal(entry.preset.category, 'Meter');
    const back = readPresetFile(presetFileText(entry.preset));
    assert.deepEqual(back.preset ?? back, entry.preset, `${entry.slug} survives its own file`);
  }
  for (const entry of METER_PRESETS.filter((e) => e.group === 'readout')) {
    assert.equal(entry.on, 'label', `${entry.slug} goes on the meter's reading`);
    assert.equal(entry.preset.fields['Text.shows'], 'value');
  }
});

test('every preset goes on a meter as each panel\'s set draws it, or on its reading; the Needle\'s on nothing that draws no value', () => {
  for (const setId of Object.values(SETS)) {
    const meter = createControl('Meter');
    const drawn = resolveControlForSet(meter, getControlSet(setId));
    for (const entry of METER_PRESETS.filter((e) => e.on !== 'label')) {
      const { patch, reason } = applyPresetPatch(createControl('Meter'), entry.preset, { drawn });
      assert.ok(patch, `${entry.slug} in ${setId}: ${reason}`);
    }
  }
  for (const entry of METER_PRESETS.filter((e) => e.on === 'label')) assert.equal(presetDoesNotFit(entry.preset, createControl('Label')), '', entry.slug);
  for (const entry of METER_PRESETS.filter((e) => e.group === 'needle')) {
    assert.match(presetDoesNotFit(entry.preset, createControl('Button')), /draws none: it goes on a knob, a slider, a Macro or a meter/, entry.slug);
  }
});

test('a needle preset moves what the level draws and hands back to the level; nothing waits for a state a meter has not got', () => {
  for (const entry of METER_PRESETS.filter((e) => e.group === 'needle')) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.kind, 'value', entry.slug);
      const last = node.frames.at(-1);
      assert.equal(last.at, 1);
      assert.ok(!('value' in last) && !('by' in last), `${entry.slug} ends on the level`);
    }
  }
  for (const entry of METER_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) assert.notEqual(node.trigger?.type, 'stateChange', `${entry.slug}: a meter has no states`);
  }
  assert.deepEqual(byId('tap-sweep').preset.animations.tapSweep.trigger, { type: 'event', event: 'click' }, 'a hand plays it with a click');
  assert.deepEqual(byId('drop-out').preset.animations.dropOut.trigger, { type: 'event', event: 'doubleClick' });
});

test('nothing loops that does not say so', () => {
  const loops = new Set(['pulse', 'breathe', 'shiver']);
  for (const entry of METER_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.iterations === 'infinite', loops.has(entry.slug), `${entry.slug}: ${node.iterations === 'infinite' ? 'loops' : 'plays once'}`);
    }
  }
});

test('the library lists them under Meter, after the Choice group, by group', () => {
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob', 'Slider', 'Button', 'Choice group', 'Meter']);
  const meter = COMPONENT_PRESETS.find((entry) => entry.component === 'Meter');
  assert.deepEqual(meter.groups.map((group) => group.label), ['Attention', 'Needle', 'Readout']);
  assert.equal(meter.groups.reduce((n, group) => n + group.entries.length, 0), METER_PRESETS.length);
});

test('the showcase: one panel a group and Together, every meter (or its reading) wearing its preset, each panel in a set of its own', () => {
  assert.deepEqual(METER_PANELS.map(([id]) => id), [...METER_PRESET_GROUPS.map((group) => `meter-${group.id}`), 'meter-together']);
  const taken = new Set([...KNOB_PANELS, ...SLIDER_PANELS, ...BUTTON_PANELS, ...CHOICE_PANELS].map(([, make]) => make().controlSet.id));
  const seen = new Set();
  for (const [id, make] of METER_PANELS) {
    const panel = make();
    assert.equal(panel.controlSet.id, SETS[id], id);
    assert.ok(!taken.has(panel.controlSet.id) && !seen.has(panel.controlSet.id), `${id}: a set of its own`);
    seen.add(panel.controlSet.id);
    if (id === 'meter-together') {
      assert.deepEqual(panel.animationScenes.map((scene) => scene.name), ['Power-on', 'Spectrum', 'Chase', 'Beat bounce']);
      assert.deepEqual(panel.animationScenes[3].trigger, { type: 'beat', every: 1 });
      continue;
    }
    const entries = METER_PRESETS.filter((entry) => entry.group === id.slice('meter-'.length));
    assert.deepEqual(panel.animationPresets.map((preset) => preset.id).sort(), entries.map((entry) => entry.id).sort(), `${id} carries its presets`);
    const byName = Object.fromEntries(panel.controls.map((control) => [control._children.Core.name, control]));
    for (const entry of entries) {
      const wearing = panel.controls.find((control) => Object.values(control._children.Animations?._children ?? {}).some((node) => presetLink(node)?.id === entry.id));
      assert.ok(wearing, `${id}: something wears ${entry.slug}`);
      if (entry.on === 'label') {
        const meter = Object.values(byName).find((control) => control._children.Core.id === wearing._children.Text.showsControl);
        assert.equal(wearing._children.Text.shows, 'value');
        assert.equal(meter?._children.Core.controlType, 'Meter', `${entry.slug}: the reading of a meter`);
        assert.equal(wearing._children.Core.attachedTo, meter._children.Core.id);
      } else {
        assert.equal(wearing._children.Core.controlType, 'Meter', entry.slug);
      }
    }
  }
  const attention = METER_PANELS[0][1]();
  assert.match(attention.scripts.find((script) => script.name === 'Look here').source, /ce\.anim\.play\('LookHere', 'lookHere'\)/, 'a script plays Look here');
  // Readout: nothing is plugged in, so a script moves each meter's level, in decibels.
  const readout = METER_PANELS[2][1]();
  const signal = readout.scripts.find((script) => script.name === 'Signal').source;
  assert.match(signal, /ce\.components\.meter\.value\(name, next\)/);
  for (const name of ['Odometer', 'Reel', 'Roll', 'Push', 'Crossfade']) {
    assert.ok(signal.includes(`"${name}"`), `the signal moves ${name}`);
    const meter = readout.controls.find((control) => control._children.Core.name === name)._children.Meter;
    assert.deepEqual([meter.valueMin, meter.valueMax, meter.valueSuffix], [-48, 0, ' dB']);
  }
});

const luminance = (argb) => [2, 4, 6].map((at) => parseInt(argb.slice(at, at + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every caption on a Meter panel reads at 4.5:1 on the panel as its set draws it', () => {
  let captions = 0;
  for (const [id, make] of METER_PANELS) {
    const panel = make();
    const set = getControlSet(panel.controlSet.id);
    const ground = finishedColour(panel.bgColour, set.panel?.material, set.lamp);
    for (const label of panel.controls.filter((c) => c._children.Core.controlType === 'Label')) {
      const ink = resolveColourLiteral(label._children.Text._children.Fill.colour, set);
      assert.ok(contrast(ink, ground) >= 4.5, `${id} ${label._children.Core.name}: ${ink} on ${ground} is ${contrast(ink, ground).toFixed(2)}`);
      captions += 1;
    }
  }
  assert.ok(captions > 40, `${captions} captions`);
});

test('applied as Apply applies it, a preset is linked to the library\'s', () => {
  const meter = createControl('Meter');
  const { patch } = applyPresetPatch(meter, byId('self-test').preset);
  for (const [path, value] of Object.entries(patch)) setNestedValue(meter, path, value);
  assert.equal(presetLink(meter._children.Animations._children.selfTest)?.id, meterPresetId('self-test'));
});
