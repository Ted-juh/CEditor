// choicePresets.test.js — the Choice group's built-in animation presets (utils/choicePresets.js), the
// one thing the engine learned for them (a keyframe animation on Each step that follows the turn,
// keyframeAnimation.js mirroredEntry), and the Components showcase that wears them
// (scripts/componentPanels.js, CE/panels/Components/Choice group/).
//
// The promises: every preset is an ordinary preset that survives its own file and goes on a choice
// group in every one of its five styles; a choice is a value step the way it went, so Lean leans
// toward the option chosen whichever side it is, and an animation that does not follow the turn
// plays the same both ways; nothing loops that does not say so; the library lists them under
// Choice group after the Button; and the showcase panels are those presets on choice groups, a set
// of their own each, none shared with the Knob's, the Slider's or the Button's, every caption
// readable on its panel as drawn.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CHOICE_PRESETS, CHOICE_PRESET_GROUPS, choicePresetId } from '../src/CE_Application/utils/choicePresets.js';
import { applyPresetPatch, presetFileText, readPresetFile, presetLink } from '../src/CE_Application/utils/animationPresetModel.js';
import { createKeyframePlayer, readKeyframes, mirroredEntry } from '../src/CE_Application/utils/keyframeAnimation.js';
import { resolveInteractionContext } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveColourLiteral } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { finishedColour } from '../src/CE_Application/utils/materialFilter.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { COMPONENT_PRESETS } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { BUTTON_PANELS, CHOICE_PANELS, KNOB_PANELS, SLIDER_PANELS } from '../scripts/componentPanels.js';

const byId = (slug) => CHOICE_PRESETS.find((entry) => entry.slug === slug);
const STYLES = ['segmented', 'buttons', 'radio', 'led', 'tab'];
const choiceGroup = (style = 'segmented', options = 4) => {
  const control = createControl('RadioButtonGroup');
  control._children.Behavior.visualStyle = style;
  const template = control._children.Value.rows[0];
  control._children.Value.rows = Array.from({ length: options }, (_, i) => ({ ...template, id: `o${i}`, displayText: `O${i}`, internalValue: `o${i}`, selectedByDefault: i === 0 }));
  control._children.Behavior.defaultValue = 'o0';
  return control;
};

test('the catalogue: seven groups in order, each preset an ordinary preset under Choice group, ids of its own', () => {
  assert.deepEqual(CHOICE_PRESET_GROUPS.map((group) => group.id), ['attention', 'choosing', 'thumb', 'chosen', 'appear', 'hover', 'new-options']);
  assert.deepEqual(CHOICE_PRESETS.map((entry) => entry.slug), [
    'pulse', 'breathe', 'wiggle', 'beat-pulse', 'look-here', 'pop-in', 'lean', 'blink', 'tick',
    'slide', 'spring', 'stretch', 'underline-glide', 'dot-hop', 'lamp-run',
    'pop', 'press-in', 'glow', 'label-roll', 'ink-flash',
    'cascade', 'fan-out', 'typewriter-labels', 'drop-in',
    'lift', 'spotlight', 'grow-label',
    'roll-over', 'crossfade', 'cascade-new',
  ]);
  for (const entry of CHOICE_PRESETS) {
    assert.equal(entry.id, choicePresetId(entry.slug));
    assert.equal(entry.preset.category, 'Choice group');
    assert.equal(entry.type, 'RadioButtonGroup');
    const back = readPresetFile(presetFileText(entry.preset));
    assert.deepEqual(back.preset ?? back, entry.preset, `${entry.slug} survives its own file`);
  }
});

test('every preset goes on a choice group in each of its five styles, as each panel\'s set draws it', () => {
  for (const setId of ['atelier', 'ember']) {
    for (const style of STYLES) {
      for (const entry of CHOICE_PRESETS) {
        const control = choiceGroup(style);
        const drawn = resolveControlForSet(control, getControlSet(setId));
        const { patch, reason } = applyPresetPatch(control, entry.preset, { drawn });
        assert.ok(patch, `${entry.slug} on ${style} in ${setId}: ${reason}`);
      }
    }
  }
});

test('a choice is a value step the way it went: the chosen option\'s place along the options', () => {
  const control = choiceGroup('buttons', 5);
  const at = (key) => resolveInteractionContext(control, { valueOverrideEnabled: true, valueOverride: key }).valueNormalized;
  assert.deepEqual(['o0', 'o1', 'o2', 'o3', 'o4'].map(at), [0, 0.25, 0.5, 0.75, 1]);
});

test('Lean leans toward the option chosen: as written going on, mirrored side for side going back', () => {
  const lean = readKeyframes(byId('lean').preset.animations.lean);
  assert.equal(lean.followTurn, true);
  const player = createKeyframePlayer({ now: () => 0 });
  const play = (v) => player.next({ keyframes: { enabled: true, entries: [lean] }, signals: { valueNormalized: v } });
  play(0.5);
  const onward = play(0.75);
  assert.deepEqual(onward.fired, ['lean']);
  assert.match(onward.rules, /translate:5px 0px;?[^}]*rotate:1.5deg|rotate:1.5deg;translate:5px 0px/, 'on to a later option: leans right');
  const back = play(0.25);
  assert.deepEqual(back.fired, ['lean']);
  assert.match(back.rules, /rotate:-1.5deg;translate:-5px 0px/, 'back to an earlier one: leans left');
  assert.notEqual(onward.parts.get('')[0].split(' ')[0], back.parts.get('')[0].split(' ')[0], 'a rule of its own');
  // Mirroring turns only what goes side to side: a knock up or down, a swell, a fade stay as written.
  const tick = readKeyframes(byId('tick').preset.animations.tick);
  assert.equal(tick.followTurn, false);
  assert.deepEqual(mirroredEntry(lean).frames.map((frame) => [frame.x, frame.rotate]), lean.frames.map((frame) => [-frame.x || 0, -frame.rotate || 0]));
});

test('an animation that does not follow the turn plays the same either way; followTurn means nothing off Each step', () => {
  const tick = readKeyframes(byId('tick').preset.animations.tick);
  const player = createKeyframePlayer({ now: () => 0 });
  const play = (v) => player.next({ keyframes: { enabled: true, entries: [tick] }, signals: { valueNormalized: v } });
  play(0.5);
  const onward = play(0.75);
  const back = play(0.25);
  assert.deepEqual([onward.fired, back.fired], [['tick'], ['tick']]);
  assert.equal(onward.parts.get('')[0].split(' ')[0].replace(/-[ab]$/, ''), back.parts.get('')[0].split(' ')[0].replace(/-[ab]$/, ''));
  const onChange = readKeyframes({ ...byId('blink').preset.animations.blink, followTurn: true });
  assert.equal(onChange.followTurn, false, 'On change does not know which way it went');
});

test('nothing loops that does not say so', () => {
  const loops = new Set(['pulse', 'breathe']);
  for (const entry of CHOICE_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.iterations === 'infinite', loops.has(entry.slug), `${entry.slug}: ${node.iterations === 'infinite' ? 'loops' : 'plays once'}`);
    }
  }
});

test('the library lists them under Choice group, after the Button, by group', () => {
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob', 'Slider', 'Button', 'Choice group']);
  const choice = COMPONENT_PRESETS.find((entry) => entry.component === 'Choice group');
  assert.deepEqual(choice.groups.map((group) => group.label), ['Attention', 'Choosing', 'Thumb', 'The chosen', 'Appear', 'Hover', 'New options']);
  assert.equal(choice.groups.reduce((n, group) => n + group.entries.length, 0), CHOICE_PRESETS.length);
});

test('the showcase: one panel a group and Together, every choice group wearing its preset, in a set of its own and the style the preset names', () => {
  assert.deepEqual(CHOICE_PANELS.map(([id]) => id), [...CHOICE_PRESET_GROUPS.map((group) => `choice-${group.id}`), 'choice-together']);
  const taken = new Set([...KNOB_PANELS, ...SLIDER_PANELS, ...BUTTON_PANELS].map(([, make]) => make().controlSet.id));
  const sets = { 'choice-attention': 'atelier', 'choice-choosing': 'ember', 'choice-thumb': 'eurorack', 'choice-chosen': 'chrome', 'choice-appear': 'satellite', 'choice-hover': 'ceramic', 'choice-new-options': 'studio-white', 'choice-together': 'receiver' };
  const seen = new Set();
  for (const [id, make] of CHOICE_PANELS) {
    const panel = make();
    assert.equal(panel.controlSet.id, sets[id], id);
    assert.ok(!taken.has(panel.controlSet.id) && !seen.has(panel.controlSet.id), `${id}: a set of its own`);
    seen.add(panel.controlSet.id);
    if (id === 'choice-together') {
      assert.deepEqual(panel.animationScenes.map((scene) => scene.name), ['Cascade in', 'Wave', 'Ripple']);
      const first = panel.controls.find((control) => control._children.Core.name === 'Ripple1');
      assert.deepEqual(panel.animationScenes[2].trigger, { type: 'event', controlId: first._children.Core.id, event: 'click' }, 'Ripple plays on a choice made on the first group');
      continue;
    }
    const groups = panel.controls.filter((control) => control._children.Core.controlType === 'RadioButtonGroup');
    const entries = CHOICE_PRESETS.filter((entry) => entry.group === id.slice('choice-'.length));
    assert.deepEqual(panel.animationPresets.map((preset) => preset.id).sort(), entries.map((entry) => entry.id).sort(), `${id} carries its presets`);
    for (const entry of entries) {
      const wearing = groups.find((control) => Object.values(control._children.Animations?._children ?? {}).some((node) => presetLink(node)?.id === entry.id));
      assert.ok(wearing, `${id}: a group wears ${entry.slug}`);
      const style = entry.knob?.['Behavior.visualStyle'];
      if (style) assert.equal(wearing._children.Behavior.visualStyle, style, `${entry.slug} in the ${style} style`);
    }
  }
  const attention = CHOICE_PANELS[0][1]();
  assert.match(attention.scripts.find((script) => script.name === 'Look here').source, /ce\.anim\.play\('LookHere', 'lookHere'\)/, 'a script plays Look here');
  const lean = CHOICE_PANELS[1][1]().controls.find((control) => control._children.Core.name === 'Lean');
  assert.equal(lean._children.Behavior.defaultValue, 'opt_3', 'Lean starts in the middle, so it can go either way');
  assert.equal(lean._children.Value.rows.length, 5);
  // New options: three groups take their options from the Section group's choice.
  const fresh = CHOICE_PANELS.find(([id]) => id === 'choice-new-options')[1]();
  const section = fresh.controls.find((control) => control._children.Core.name === 'Section');
  for (const name of ['RollOver', 'Crossfade', 'CascadeNew']) {
    const child = fresh.controls.find((control) => control._children.Core.name === name);
    assert.equal(child._children.Value.dependsOn, section._children.Core.id, `${name} depends on Section`);
    assert.deepEqual([...new Set(child._children.Value.rows.map((row) => row.parentValue))], ['osc', 'filter', 'amp']);
  }
});

const luminance = (argb) => [2, 4, 6].map((at) => parseInt(argb.slice(at, at + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every caption on a Choice group panel reads at 4.5:1 on the panel as its set draws it', () => {
  let captions = 0;
  for (const [id, make] of CHOICE_PANELS) {
    const panel = make();
    const set = getControlSet(panel.controlSet.id);
    const ground = finishedColour(panel.bgColour, set.panel?.material, set.lamp);
    for (const label of panel.controls.filter((c) => c._children.Core.controlType === 'Label')) {
      const ink = resolveColourLiteral(label._children.Text._children.Fill.colour, set);
      assert.ok(contrast(ink, ground) >= 4.5, `${id} ${label._children.Core.name}: ${ink} on ${ground} is ${contrast(ink, ground).toFixed(2)}`);
      captions += 1;
    }
  }
  assert.ok(captions > 25, `${captions} captions`);
});

test('applied as Apply applies it, a preset is linked to the library\'s', () => {
  const control = choiceGroup('led');
  const { patch } = applyPresetPatch(control, byId('blink').preset);
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  assert.equal(presetLink(control._children.Animations._children.blink)?.id, choicePresetId('blink'));
});
