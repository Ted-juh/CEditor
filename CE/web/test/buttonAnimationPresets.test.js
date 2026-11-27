// buttonAnimationPresets.test.js — the Button's built-in animation presets (utils/buttonPresets.js) and
// the Components showcase that wears them (scripts/componentPanels.js, CE/panels/Components/Button/).
//
// The promises: every preset is an ordinary preset that survives its own file and goes on a
// momentary or a toggle button in every set the showcase dresses one in; what a preset's state sets
// takes the place of what the button's type made the state with, never of what someone chose; a
// preset on a key's own parts (its lamp, its legend, the key) is refused where the button's set does
// not draw that part, and goes on in each of its own panel's sets; nothing loops that does not say
// so; the library lists them under Button after the Knob and the Slider; and the showcase panels are
// those presets on buttons, one panel a group, each in a set of its own and none shared with the
// Knob's or the Slider's, every caption readable on its panel as drawn.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUTTON_PRESETS, BUTTON_PRESET_GROUPS, buttonPresetId } from '../src/CE_Application/utils/buttonPresets.js';
import { KNOB_PRESETS } from '../src/CE_Application/utils/knobPresets.js';
import { SLIDER_PRESETS } from '../src/CE_Application/utils/sliderPresets.js';
import { applyPresetPatch, keyPartsNotDrawn, presetDoesNotFit, presetFileText, readPresetFile, presetLink, presetNeeds } from '../src/CE_Application/utils/animationPresetModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveColourLiteral } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { resolveInteractiveControl, targetBuckets } from '../src/CE_Application/utils/interactionRuntime.js';
import { finishedColour } from '../src/CE_Application/utils/materialFilter.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { COMPONENT_PRESETS } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { BUTTON_PANELS, KNOB_PANELS, SLIDER_PANELS } from '../scripts/componentPanels.js';
import { initHistory, flushHistory } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel } from '../src/CE_Application/stores/panels.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import { applyAnimationPreset, resetAnimationPresetLibraryForTesting } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { setActivePanelControlSet } from '../src/CE_Application/stores/controlSets.js';

const byId = (slug) => BUTTON_PRESETS.find((entry) => entry.slug === slug);
const applied = (control, preset) => {
  const { patch, reason } = applyPresetPatch(control, preset);
  assert.ok(patch, reason);
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  return control;
};
const scaleWhen = (control, session) => resolveInteractiveControl(control, session).control._children.Transform.scale;

test('the catalogue: nine groups in order, each preset an ordinary preset under Button, ids of its own', () => {
  assert.deepEqual(BUTTON_PRESET_GROUPS.map((group) => group.id), ['press', 'attention', 'gestures', 'light', 'switch', 'words', 'signals', 'thrown', 'hold']);
  for (const group of BUTTON_PRESET_GROUPS) assert.ok(BUTTON_PRESETS.some((entry) => entry.group === group.id), `${group.id} has presets`);
  const ids = BUTTON_PRESETS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  const others = new Set([...KNOB_PRESETS, ...SLIDER_PRESETS].map((entry) => entry.id));
  assert.equal(ids.filter((id) => others.has(id)).length, 0, 'none is a knob\'s or a slider\'s');
  for (const entry of BUTTON_PRESETS) {
    assert.equal(entry.id, buttonPresetId(entry.slug));
    assert.match(entry.id, /^ce:button:[a-z-]+$/);
    assert.equal(entry.preset.category, 'Button');
    assert.equal(entry.preset.tags[0], entry.groupLabel);
    assert.ok(['MomentaryButton', 'ToggleButton', 'TimedButton'].includes(entry.type), `${entry.slug}: the kind of button the showcase puts it on`);
    assert.equal(entry.type === 'TimedButton', entry.group === 'hold', `${entry.slug}: a timed button for the hold, and only there`);
    assert.ok(entry.how && entry.what, `${entry.slug} says what plays it and what it does`);
    assert.deepEqual(readPresetFile(presetFileText(entry.preset)).preset, entry.preset, `${entry.slug} survives its file`);
  }
});

test('every button preset goes on a momentary button and a toggle, in every set the showcase uses', () => {
  const sets = [...new Set(BUTTON_PANELS.map(([, make]) => make().controlSet.id))];
  for (const entry of BUTTON_PRESETS) {
    for (const type of ['MomentaryButton', 'ToggleButton', 'TimedButton']) {
      assert.equal(presetDoesNotFit(entry.preset, createControl(type)), '', `${entry.slug} fits a ${type}`);
      for (const set of sets) {
        assert.equal(presetDoesNotFit(entry.preset, resolveControlForSet(createControl(type), getControlSet(set))), '', `${entry.slug} on a ${set} ${type}`);
      }
    }
  }
});

test('what a preset\'s state sets takes the place of the type\'s own value, never an author\'s', () => {
  // A button is made pressing to 0.985 of its size: nobody chose it, so Sink's 0.9 replaces it.
  const button = createControl('MomentaryButton');
  assert.equal(button._children.States._children.Pressed.patches.component['Transform.scale'], 0.985);
  applied(button, byId('sink').preset);
  assert.equal(button._children.States._children.Pressed.patches.component['Transform.scale'], 0.9);
  assert.equal(button._children.States._children.Pressed.patches.component['Background.Fill.colour'], '{surface.pressed}', 'the rest of the state is kept');
  assert.equal(scaleWhen(button, { pressed: true }), 0.9, 'pressed, it is drawn at 0.9');
  // A press scale someone set is theirs.
  const chosen = createControl('MomentaryButton');
  chosen._children.States._children.Pressed.patches.component['Transform.scale'] = 0.95;
  applied(chosen, byId('sink').preset);
  assert.equal(chosen._children.States._children.Pressed.patches.component['Transform.scale'], 0.95);
  // Lift and Tilt set what the type's Hover and Pressed do not set: added beside what is there.
  const lifted = applied(createControl('MomentaryButton'), byId('lift').preset);
  assert.equal(scaleWhen(lifted, { hover: true }), 1.06);
  const tilted = applied(createControl('MomentaryButton'), byId('tilt').preset)._children.States._children.Pressed.patches.component;
  assert.deepEqual([tilted['Transform.rotation'], tilted['Transform.scale']], [-6, 0.985], 'its rotation added, the type\'s press kept');
  // The transitions ease what the states change: the whole button's transform.
  for (const slug of ['sink', 'lift', 'tilt']) {
    for (const node of Object.values(byId(slug).preset.animations)) {
      for (const target of node.targets) assert.deepEqual(targetBuckets(target)?.buckets, ['transform'], `${slug}: ${target.path}`);
    }
  }
});

// The second half plays on a key's own parts, which a set draws or does not.
const KEY_GROUPS = new Set(['light', 'switch', 'words', 'signals']);
const drawnIn = (type, setId) => resolveControlForSet(createControl(type), getControlSet(setId));

test('the second half plays on a key\'s own parts, and goes on in its own panel\'s set, drawn', () => {
  const setOf = Object.fromEntries(BUTTON_PANELS.map(([id, make]) => [id.slice('button-'.length), make().controlSet.id]));
  const onParts = BUTTON_PRESETS.filter((entry) => KEY_GROUPS.has(entry.group));
  assert.equal(onParts.length, 23);
  for (const entry of onParts) {
    assert.equal(keyPartsNotDrawn(entry.preset, drawnIn(entry.type, setOf[entry.group])), '', `${entry.slug} on a ${setOf[entry.group]} ${entry.type}`);
  }
  // A key part each group is about: the lamp, the key and its plate, the legend, the lamp.
  const parts = (group) => new Set(BUTTON_PRESETS.filter((entry) => entry.group === group).flatMap((entry) => presetNeeds(entry.preset).parts));
  assert.deepEqual([...parts('light')], ['indicator']);
  assert.deepEqual([...parts('switch')].sort(), ['guard', 'housing', 'key']);
  assert.deepEqual([...parts('words')], ['legend'], 'and the caption, which is the control\'s own text');
  assert.deepEqual([...parts('signals')].sort(), ['indicator', 'key']);
});

test('a preset on a key\'s part is refused, saying why, where the set draws no such part; judged as drawn', () => {
  const lamp = byId('flare').preset;
  assert.match(keyPartsNotDrawn(lamp, drawnIn('MomentaryButton', 'graphite')), /set draws it whole, with no parts to play on/);
  assert.match(keyPartsNotDrawn(lamp, drawnIn('MomentaryButton', 'tolex')), /^It plays on the key's indicator, which this button's set does not draw\.$/, 'Tolex\'s key has no lamp');
  assert.equal(keyPartsNotDrawn(lamp, drawnIn('MomentaryButton', 'stompbox')), '');
  assert.equal(keyPartsNotDrawn(byId('sink').preset, drawnIn('MomentaryButton', 'graphite')), '', 'what moves the whole button goes on any');
  assert.equal(keyPartsNotDrawn(lamp, createControl('Knob')), '', 'not a button: not this rule\'s');
  // Applying: refused with the reason when the drawn control is given, as the library gives it.
  const { patch, reason } = applyPresetPatch(createControl('MomentaryButton'), lamp, { drawn: drawnIn('MomentaryButton', 'graphite') });
  assert.equal(patch, null);
  assert.match(reason, /draws it whole/);
  assert.ok(applyPresetPatch(createControl('MomentaryButton'), lamp, { drawn: drawnIn('MomentaryButton', 'stompbox') }).patch);
});

test('in the library, a lamp preset is judged as the panel\'s set draws the button', () => {
  componentWorkspaceMode.set('panel'); panels.set([]); activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null }); selectedComponentIds.set(new Set());
  resetAnimationPresetLibraryForTesting();
  initHistory(); addPanel(createPanel('Keys')); flushHistory();
  const key = addControl('MomentaryButton')._children.Core.id;
  setActivePanelControlSet('graphite');
  const flat = applyAnimationPreset([key], byId('flare').id);
  assert.equal(flat.applied.length, 0);
  assert.match(flat.refused[0].reason, /draws it whole/, 'Graphite draws a flat face');
  assert.equal(applyAnimationPreset([key], byId('sink').id).applied.length, 1, 'the whole button moves on any');
  setActivePanelControlSet('stompbox');
  assert.equal(applyAnimationPreset([key], byId('flare').id).applied.length, 1, 'Stompbox draws a key with a lamp');
});

test('Thrown throws words of its own or a count from the key; Hold plays over the hold, and brings a state to fire into', () => {
  for (const entry of BUTTON_PRESETS.filter((e) => e.group === 'thrown')) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.kind, 'emit', entry.slug);
      assert.ok(['words', 'count'].includes(node.shows), `${entry.slug}: words a button can say`);
      assert.equal(node.direction, 'up', `${entry.slug}: rising from the key`);
    }
  }
  for (const entry of BUTTON_PRESETS.filter((e) => e.group === 'hold')) {
    const triggers = Object.values(entry.preset.animations).map((node) => node.trigger.type);
    const fires = Object.values(entry.preset.animations).some((node) => node.trigger.to?.includes('executed'));
    assert.ok(triggers.includes('hold') || fires, `${entry.slug}: plays over the hold, or as it fires`);
    assert.equal('Executed' in (entry.preset.states ?? {}), fires, `${entry.slug}: brings an Executed state exactly when it plays on one`);
  }
  // A timed button has no state for having fired; the preset's makes one, with no look of its own.
  const timed = applied(createControl('TimedButton'), byId('confirmed').preset);
  assert.deepEqual(timed._children.States._children.Executed.when, { executed: true });
  assert.deepEqual(timed._children.States._children.Executed.patches.component, {});
});

test('nothing loops that does not say so', () => {
  const loops = new Set(['pulse', 'breathe', 'alarm', 'breathe-while-on', 'pending', 'working']);
  for (const entry of BUTTON_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.iterations === 'infinite', loops.has(entry.slug), `${entry.slug}: ${node.iterations === 'infinite' ? 'loops' : 'plays once'}`);
    }
  }
});

test('the library lists them under Button, after the Knob and the Slider, by group', () => {
  const button = COMPONENT_PRESETS.find((entry) => entry.component === 'Button');
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob', 'Slider', 'Button', 'Choice group']);
  assert.deepEqual(button.groups.map((group) => group.label), BUTTON_PRESET_GROUPS.map((group) => group.label));
  assert.equal(button.groups.reduce((n, group) => n + group.entries.length, 0), BUTTON_PRESETS.length);
});

test('the showcase: one panel a group and Together, every button wearing its preset, a set of its own', () => {
  assert.deepEqual(BUTTON_PANELS.map(([id]) => id), [...BUTTON_PRESET_GROUPS.map((group) => `button-${group.id}`), 'button-together']);
  const taken = new Set([...KNOB_PANELS, ...SLIDER_PANELS].map(([, make]) => make().controlSet.id));
  const sets = new Set();
  for (const [id, make] of BUTTON_PANELS) {
    const panel = make();
    const set = panel.controlSet.id;
    assert.ok(!sets.has(set) && !taken.has(set), `${id}: a set of its own (${set})`);
    sets.add(set);
    if (id === 'button-together') {
      assert.deepEqual(panel.animationScenes.map((scene) => scene.name), ['Pop in', 'Wave', 'Ripple', 'Chase']);
      assert.ok(panel.animationScenes[3].clips.every((clip) => clip.target === 'Parts.symbol'), 'Chase lights a part of each key');
      const first = panel.controls.find((control) => control._children.Core.name === 'Ripple1');
      assert.deepEqual(panel.animationScenes[2].trigger, { type: 'event', controlId: first._children.Core.id, event: 'click' }, 'Ripple plays on a click on the first key');
      continue;
    }
    const entries = BUTTON_PRESETS.filter((entry) => entry.group === id.slice('button-'.length));
    assert.deepEqual(panel.animationPresets.map((preset) => preset.id).sort(), entries.map((entry) => entry.id).sort(), `${id} carries its presets`);
    const followed = new Set(panel.controls.flatMap((control) => Object.values(control._children.Animations?._children ?? {}).map((node) => presetLink(node)?.id).filter(Boolean)));
    for (const entry of entries) assert.ok(followed.has(entry.id), `${id}: a button wears ${entry.slug}`);
  }
  const scriptOf = (panelId, name) => BUTTON_PANELS.find(([id]) => id === panelId)[1]().scripts.find((script) => script.name === name).source;
  assert.match(scriptOf('button-attention', 'Look here'), /ce\.anim\.play\('LookHere', 'lookHere'\)/, 'a script plays Look here');
  assert.match(scriptOf('button-signals', 'Alert'), /ce\.anim\.play\('Alert', 'alert'\)/, 'and Alert');
  assert.match(scriptOf('button-light', 'The synth'), /set\('FromTheSynth\.normalizedValue', /, 'a script switches From the synth from outside');
  const light = BUTTON_PANELS.find(([id]) => id === 'button-light')[1]();
  const named = (name) => light.controls.find((control) => control._children.Core.name === name);
  assert.equal(named('BreatheWhileOn')._children.Behavior.defaultValue, true, 'a toggle that breathes while on starts on');
  assert.equal(named('BreatheWhileOn')._children.Core.controlType, 'ToggleButton');
});

// The panels stand on their sets' own panels, Machined's and Rackmount's lightened: a mid grey under
// a finish leaves black at 5:1 at best and no colour at all at 4.5. What each caption says is read
// against the panel as drawn, its finish counted (utils/materialFilter.js finishedColour).
const luminance = (argb) => [2, 4, 6].map((at) => parseInt(argb.slice(at, at + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every caption on a Button panel reads at 4.5:1 on the panel as its set draws it', () => {
  let captions = 0;
  for (const [id, make] of BUTTON_PANELS) {
    const panel = make();
    const set = getControlSet(panel.controlSet.id);
    const ground = finishedColour(panel.bgColour, set.panel?.material, set.lamp);
    for (const label of panel.controls.filter((c) => c._children.Core.controlType === 'Label')) {
      const ink = resolveColourLiteral(label._children.Text._children.Fill.colour, set);
      assert.ok(contrast(ink, ground) >= 4.5, `${id} ${label._children.Core.name}: ${ink} on ${ground} is ${contrast(ink, ground).toFixed(2)}`);
      captions += 1;
    }
  }
  assert.ok(captions > 60, `${captions} captions`);
});
