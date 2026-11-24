// animationPresetLibrary.test.js — saving, applying, following and sharing animation presets, through
// the real panel and control stores (the Animation Designer's step 4).
//
// The promises: a preset saved from a control is carried by the panel and the animations it came from
// follow it; applied elsewhere it is linked; Apply to preset reaches every follower but what each
// overrode, in one undo step; a panel that carries presets you lack offers them; a .ceanim file comes
// in; and the panel's copy survives a save and an open.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { initHistory, flushHistory, undo } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel, updatePanel } from '../src/CE_Application/stores/panels.js';
import { addControl, updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import {
  animationPresetLibrary,
  panelAnimationPresets,
  presetsToAdopt,
  saveAnimationPreset,
  applyAnimationPreset,
  followedBy,
  revertAnimationOverride,
  clearAnimationOverrides,
  detachAnimation,
  applyToPreset,
  updatePanelPreset,
  removeFromPanel,
  removeFromLibrary,
  adoptPanelPresets,
  importPresetText,
  resetAnimationPresetLibraryForTesting,
} from '../src/CE_Application/stores/animationPresetLibrary.js';
import { presetLink, presetOverrides, presetFileText, presetWithAnimation } from '../src/CE_Application/utils/animationPresetModel.js';

const LIFT = {
  _type: 'Animation', name: 'lift', enabled: true, kind: 'transition', duration: 140, delay: 0, easing: 'outCubic',
  trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
  targets: [{ path: 'Transform.scale', properties: ['transform'] }],
};

function setUp() {
  componentWorkspaceMode.set('panel'); panels.set([]); activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null }); selectedComponentIds.set(new Set());
  resetAnimationPresetLibraryForTesting();
  initHistory(); addPanel(createPanel('Presets')); flushHistory();
  const [a, b, c] = ['Button', 'Button', 'Button'].map((type) => addControl(type)._children.Core.id);
  const label = addControl('Label')._children.Core.id;
  updateControlProperty(a, 'Animations.lift', LIFT);
  updateControlProperty(a, 'States.Hover.patches.component', { 'Transform.scale': 1.06 });
  flushHistory();
  return { a, b, c, label };
}
const panel = () => get(panels)[0];
const control = (id) => panel().controls.find((entry) => entry._children.Core.id === id);
const animation = (id, name) => control(id)._children.Animations._children[name];

test('saved: the panel carries it, your library keeps it, and the animation it came from follows it', () => {
  const { a } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift', category: 'Hover' });
  assert.ok(preset);
  assert.deepEqual(get(panelAnimationPresets).map((entry) => entry.id), [preset.id]);
  assert.deepEqual(get(animationPresetLibrary).map((entry) => entry.id), [preset.id]);
  assert.deepEqual(presetLink(animation(a, 'lift')), { id: preset.id, revision: 1, from: 'lift' });
  // "This panel only" leaves your library alone.
  const local = saveAnimationPreset(a, ['lift'], { name: 'Just here', where: 'panel' }).preset;
  assert.ok(get(panelAnimationPresets).some((entry) => entry.id === local.id));
  assert.ok(!get(animationPresetLibrary).some((entry) => entry.id === local.id));
});

test('applied: linked on the controls that can take it, refused with a reason on the one that cannot', () => {
  const { a, b, c, label } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  flushHistory();
  const result = applyAnimationPreset([b, c, label], preset.id);
  assert.deepEqual(result.applied.map((entry) => entry.controlId), [b, c]);
  assert.deepEqual(result.refused.map((entry) => entry.controlId), [label]);
  assert.match(result.refused[0].reason, /no states/);
  assert.equal(presetLink(animation(b, 'lift')).id, preset.id);
  assert.equal(control(b)._children.States._children.Hover.patches.component['Transform.scale'], 1.06, 'the change it eases came with it');
  flushHistory();
  undo();
  assert.equal(animation(b, 'lift'), undefined, 'one undo takes it off every control');
  assert.equal(animation(c, 'lift'), undefined);
});

test('Apply to preset reaches every follower but what each overrode, in one undo step', () => {
  const { a, b, c } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  applyAnimationPreset([b, c], preset.id);
  updateControlProperty(c, 'Animations.lift.duration', 600);          // c's own
  updateControlProperty(a, 'Animations.lift.easing', 'outBack');      // the change to share
  updateControlProperty(a, 'Animations.lift.delay', 40);
  flushHistory();
  assert.deepEqual(presetOverrides(animation(a, 'lift'), followedBy(a, 'lift').followed), ['delay', 'easing']);

  const result = applyToPreset(a, 'lift');
  assert.equal(result.preset.revision, 2);
  assert.equal(result.followers, 3);
  assert.deepEqual([animation(a, 'lift').easing, animation(b, 'lift').easing, animation(c, 'lift').easing], ['outBack', 'outBack', 'outBack']);
  assert.equal(animation(c, 'lift').duration, 600, 'c keeps what it changed itself');
  assert.equal(animation(b, 'lift').duration, 140);
  assert.deepEqual(presetOverrides(animation(a, 'lift'), followedBy(a, 'lift').followed), [], 'the source has nothing of its own now');
  assert.equal(get(animationPresetLibrary)[0].revision, 2, 'and your library has the new version');
  flushHistory();
  undo();
  assert.equal(animation(b, 'lift').easing, 'outCubic', 'one undo puts the followers back');
  assert.equal(get(panelAnimationPresets)[0].revision, 1, 'and the panel\'s copy');
});

test('revert one override, clear them all, detach', () => {
  const { a, b } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  applyAnimationPreset([b], preset.id);
  updateControlProperty(b, 'Animations.lift.duration', 600);
  updateControlProperty(b, 'Animations.lift.easing', 'linear');
  flushHistory();
  revertAnimationOverride(b, 'lift', 'duration');
  assert.equal(animation(b, 'lift').duration, 140);
  assert.equal(animation(b, 'lift').easing, 'linear');
  clearAnimationOverrides(b, 'lift');
  assert.equal(animation(b, 'lift').easing, 'outCubic');
  detachAnimation(b, 'lift');
  assert.equal(presetLink(animation(b, 'lift')), null);
  assert.equal(animation(b, 'lift').duration, 140, 'it keeps its settings');
});

test('a preset leaves the panel only when nothing follows it; your library loses one without the panel losing it', () => {
  const { a } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  assert.match(removeFromPanel(preset.id).reason, /1 animation follows it/);
  removeFromLibrary(preset.id);
  assert.equal(get(animationPresetLibrary).length, 0);
  assert.equal(get(panelAnimationPresets).length, 1, 'the panel keeps its copy');
  detachAnimation(a, 'lift');
  assert.deepEqual(removeFromPanel(preset.id), { removed: true });
  assert.equal(get(panelAnimationPresets).length, 0);
});

test('a panel that carries presets you lack offers them, and adds them only when asked', () => {
  const { a } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'From a friend', where: 'panel' });
  assert.deepEqual(get(presetsToAdopt).map((entry) => entry.id), [preset.id]);
  assert.equal(get(animationPresetLibrary).length, 0, 'opening it did not grow your library');
  assert.equal(adoptPanelPresets().length, 1);
  assert.deepEqual(get(presetsToAdopt), []);
  assert.equal(get(animationPresetLibrary)[0].name, 'From a friend');
});

test('a .ceanim file comes into your library, once per version', () => {
  const { a } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift', where: 'panel' });
  const text = presetFileText(preset);
  assert.equal(importPresetText(text).preset.id, preset.id);
  assert.match(importPresetText(text).error, /already/);
  const newer = presetWithAnimation(preset, 'lift', { ...preset.animations.lift, duration: 99 });
  assert.equal(importPresetText(presetFileText(newer)).replaced, true);
  assert.equal(get(animationPresetLibrary)[0].revision, 2);
  assert.match(importPresetText('{}').error, /not an animation preset/);
});

test('a newer version in your library brings the panel and its followers up to date', () => {
  const { a, b } = setUp();
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  applyAnimationPreset([b], preset.id);
  flushHistory();
  const newer = presetWithAnimation(preset, 'lift', { ...preset.animations.lift, easing: 'inOutQuad' });
  animationPresetLibrary.set([newer]);
  assert.deepEqual(updatePanelPreset(preset.id), { followers: 2 });
  assert.equal(animation(b, 'lift').easing, 'inOutQuad');
  assert.equal(get(panelAnimationPresets)[0].revision, 2);
  assert.match(updatePanelPreset(preset.id).reason, /newest version/);
});

test('the panel\'s presets survive a save and an open; a panel with none writes no key', () => {
  const { a } = setUp();
  const empty = JSON.parse(serializePanel(panel()));
  assert.equal('animationPresets' in empty, false);
  const { preset } = saveAnimationPreset(a, ['lift'], { name: 'Soft lift' });
  const text = serializePanel(panel());
  const saved = JSON.parse(text);
  assert.equal(saved.animationPresets[0].id, preset.id);
  const opened = deserializePanel(text, '/tmp/presets.cepanel', 'Presets');
  assert.equal(opened.animationPresets[0].animations.lift.duration, 140);
  const lift = opened.controls.find((entry) => entry._children.Core.id === a)._children.Animations._children.lift;
  assert.equal(presetLink(lift).id, preset.id, 'and the animation still follows it');
  // One that does not read as a preset is dropped, not written back half-understood.
  updatePanel(panel().id, { animationPresets: [...panel().animationPresets, { format: 'nonsense' }] });
  assert.equal(JSON.parse(serializePanel(panel())).animationPresets.length, 1);
});
