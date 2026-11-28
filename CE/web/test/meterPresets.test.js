// meterPresets.test.js — the Meter's built-in animation presets (utils/meterPresets.js) and the
// Components showcase's Meter panels (scripts/componentPanels.js, CE/panels/Components/Meter/):
// phase 1, what played on a meter before (docs/design/component-presets.md, The Meter), and phase 2,
// what plays on its parts, its level, its needle and its lamps (at the end of this file).
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
const SETS = {
  'meter-attention': 'graphite', 'meter-needle': 'valve', 'meter-readout': 'ivory', 'meter-together': 'phosphor',
  'meter-parts': 'anodised', 'meter-level': 'carbon-pro', 'meter-ballistics': 'valve-console', 'meter-segments': 'gimbal-ring',
  'meter-words': 'reel',
};
const PHASE_ONE = new Set(['attention', 'needle', 'readout']);

test('the catalogue: eight groups in order, each preset an ordinary preset under Meter, ids of its own', () => {
  assert.deepEqual(METER_PRESET_GROUPS.map((group) => group.id), ['attention', 'needle', 'readout', 'parts', 'level', 'ballistics', 'segments', 'words']);
  assert.deepEqual(METER_PRESETS.map((entry) => entry.slug), [
    'pulse', 'breathe', 'knock', 'beat-pulse', 'look-here', 'pop-in',
    'self-test', 'wake-up', 'beat-kick', 'tap-sweep', 'shiver', 'drop-out',
    'odometer', 'reel', 'roll', 'push', 'crossfade',
    'lamp-flash', 'face-glow', 'needle-glow', 'cover-glint', 'scale-light-up',
    'clip-flash', 'clip-shake', 'red-wash', 'peak-flare', 'over-thrown',
    'vu', 'ppm', 'bouncy', 'lazy', 'sticky-peak',
    'cascade', 'ripple', 'sparkle', 'peak-drop',
    'type-on', 'shimmer', 'shatter', 'roll-call', 'numbers-in-turn',
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
  assert.equal(byId('reel').preset.animations.reel.glyphs, '0123456789', 'a reading reels through digits, not letters');
});

test('every preset goes on a meter as each panel\'s set draws it, or on its reading; the Needle\'s on nothing that draws no value', () => {
  for (const setId of Object.values(SETS)) {
    const meter = createControl('Meter');
    const drawn = resolveControlForSet(meter, getControlSet(setId));
    for (const entry of METER_PRESETS.filter((e) => e.on !== 'label' && PHASE_ONE.has(e.group))) {
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
  const loops = new Set(['pulse', 'breathe', 'shiver', 'sparkle', 'shimmer']);
  for (const entry of METER_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      assert.equal(node.iterations === 'infinite', loops.has(entry.slug), `${entry.slug}: ${node.iterations === 'infinite' ? 'loops' : 'plays once'}`);
    }
  }
});

test('the library lists them under Meter, after the Choice group, by group', () => {
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob', 'Slider', 'Button', 'Choice group', 'Meter']);
  const meter = COMPONENT_PRESETS.find((entry) => entry.component === 'Meter');
  assert.deepEqual(meter.groups.map((group) => group.label), ['Attention', 'Needle', 'Readout', 'Parts', 'Level', 'Ballistics', 'Segments', 'Words']);
  assert.equal(meter.groups.reduce((n, group) => n + group.entries.length, 0), METER_PRESETS.length);
});

test('the showcase: one panel a group and Together, every meter (or its reading) wearing its preset, each panel in a set of its own', () => {
  assert.deepEqual(METER_PANELS.map(([id]) => id), ['meter-attention', 'meter-needle', 'meter-readout', 'meter-together', 'meter-parts', 'meter-level', 'meter-ballistics', 'meter-segments', 'meter-words']);
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
    // Settings alone (a needle's ballistics) leave nothing following the preset: the panel carries none.
    const animated = entries.filter((entry) => Object.keys(entry.preset.animations).length);
    assert.deepEqual((panel.animationPresets ?? []).map((preset) => preset.id).sort(), animated.map((entry) => entry.id).sort(), `${id} carries its presets`);
    const byName = Object.fromEntries(panel.controls.map((control) => [control._children.Core.name, control]));
    for (const entry of entries) {
      if (!Object.keys(entry.preset.animations).length) {
        const meter = byName[entry.slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())];
        for (const [path, value] of Object.entries(entry.preset.fields)) assert.equal(meter._children.Meter[path.slice('Meter.'.length)], value, `${entry.slug}: ${path}`);
        continue;
      }
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

// --- Phase 2: its parts, its level, its needle, its lamps (2026-11-27) ----------------------------

test('phase 2: each preset goes on a meter as its panel\'s set draws it, and is refused where a set draws no such part', () => {
  const PANEL_SET = { parts: 'anodised', level: 'carbon-pro', ballistics: 'valve-console', segments: 'gimbal-ring', words: 'reel' };
  for (const entry of METER_PRESETS.filter((e) => !PHASE_ONE.has(e.group))) {
    const drawn = resolveControlForSet(createControl('Meter'), getControlSet(PANEL_SET[entry.group]));
    const { patch, reason } = applyPresetPatch(createControl('Meter'), entry.preset, { drawn });
    assert.ok(patch, `${entry.slug} in ${PANEL_SET[entry.group]}: ${reason}`);
  }
  const valve = resolveControlForSet(createControl('Meter'), getControlSet('valve'));
  assert.match(applyPresetPatch(createControl('Meter'), byId('sparkle').preset, { drawn: valve }).reason, /every lamp, which this meter's set does not draw/);
  const graphite = resolveControlForSet(createControl('Meter'), getControlSet('graphite'));
  assert.match(applyPresetPatch(createControl('Meter'), byId('needle-glow').preset, { drawn: graphite }).reason, /draws it plain/);
  for (const entry of METER_PRESETS.filter((e) => !PHASE_ONE.has(e.group))) {
    assert.match(presetDoesNotFit(entry.preset, createControl('Knob')), /does not have|has none|is none of them|is no meter/, `${entry.slug} is a meter's`);
  }
});

test('phase 2: Level plays as the level clips or crosses a line, Lamp flash turns its lamp on, Peak drop makes its marker the peak lamp', () => {
  for (const slug of ['lamp-flash', 'clip-flash', 'clip-shake', 'red-wash', 'over-thrown', 'ripple']) {
    assert.deepEqual(Object.values(byId(slug).preset.animations)[0].trigger, { type: 'clip' }, slug);
  }
  assert.deepEqual(byId('peak-flare').preset.animations.peakFlare.trigger, { type: 'level', at: 0.8, way: 'up' });
  assert.deepEqual(byId('peak-drop').preset.animations.peakDrop.trigger, { type: 'level', at: 0.8, way: 'down' });
  assert.equal(byId('lamp-flash').preset.fields['Parts.lamp.visible'], true);
  assert.equal(byId('peak-drop').preset.fields['Parts.marker.source'], 'peak');
  const over = byId('over-thrown').preset.animations.over;
  assert.deepEqual([over.kind, over.shows, over.words], ['emit', 'words', 'OVER']);
  for (const slug of ['cascade', 'ripple', 'sparkle']) {
    const node = Object.values(byId(slug).preset.animations)[0];
    assert.equal(node.targets[0].path, 'Parts.cell', `${slug} plays on every lamp`);
    assert.ok(node.optionStagger > 0, `${slug}: one after another`);
  }
  assert.deepEqual(['cascade', 'ripple', 'sparkle'].map((slug) => Object.values(byId(slug).preset.animations)[0].optionOrder), ['forward', 'fromChosen', 'scattered']);
});

test('phase 2: Ballistics are settings alone, survive their own file, and set how the needle moves', () => {
  const expected = { vu: [300, 300, 0.015], ppm: [10, 1700, 0], bouncy: [180, 260, 0.25], lazy: [900, 1400, 0], 'sticky-peak': [15, 4000, 0] };
  for (const [slug, [rise, fall, overshoot]] of Object.entries(expected)) {
    const { preset } = byId(slug);
    assert.equal(preset.size, 'settings');
    assert.deepEqual(preset.animations, {});
    assert.deepEqual(preset.fields, { 'Meter.riseTime': rise, 'Meter.fallTime': fall, 'Meter.overshoot': overshoot });
    assert.deepEqual(readPresetFile(presetFileText(preset)).preset, preset);
  }
  assert.match(readPresetFile(JSON.stringify({ ...byId('vu').preset, fields: {} })).error ?? '', /./, 'nothing at all is not a preset');
});

test('phase 2: each panel\'s meters run a test signal, so they move in Preview with nothing plugged in', () => {
  for (const [id, make] of METER_PANELS.filter(([panelId]) => ['meter-parts', 'meter-level', 'meter-ballistics', 'meter-segments', 'meter-words'].includes(panelId))) {
    const meters = make().controls.filter((control) => control._children.Core.controlType === 'Meter');
    assert.ok(meters.length >= 4, id);
    for (const meter of meters) assert.ok(['program', 'bursts'].includes(meter._children.Meter.testSignal), `${id} ${meter._children.Core.name}`);
  }
  const ballistics = METER_PANELS.find(([panelId]) => panelId === 'meter-ballistics')[1]();
  const signals = new Set(ballistics.controls.filter((c) => c._children.Core.controlType === 'Meter').map((c) => c._children.Meter.testSignal));
  assert.equal(signals.size, 1, 'the five needles hear one signal, so they can be compared');
  const parts = METER_PANELS.find(([panelId]) => panelId === 'meter-parts')[1]();
  const lamp = parts.controls.find((c) => c._children.Core.name === 'LampFlash')._children.Parts._children.lamp;
  assert.deepEqual([lamp.visible, lamp._children.Layout.x, lamp._children.Layout.y], [true, 73, 20], 'its lamp, in the dial face');
});

// --- Words: on the words a meter draws itself (2026-11-28) -----------------------------------------

test('Words: text effects on its legend, a letter at a time, and on its scale\'s numbers, which Numbers in turn turns on', () => {
  const entries = METER_PRESETS.filter((e) => e.group === 'words');
  for (const entry of entries) {
    for (const node of Object.values(entry.preset.animations)) assert.equal(node.kind, 'text', entry.slug);
  }
  const target = (slug) => Object.values(byId(slug).preset.animations)[0].targets[0].path;
  assert.deepEqual(['type-on', 'shimmer', 'shatter', 'roll-call'].map(target), ['Parts.legend', 'Parts.legend', 'Parts.legend', 'Parts.legend']);
  assert.equal(target('numbers-in-turn'), 'Parts.scale');
  assert.equal(byId('numbers-in-turn').preset.fields['Parts.scale.numerals'], true);
  for (const slug of ['type-on', 'shimmer', 'shatter', 'roll-call']) assert.equal(Object.values(byId(slug).preset.animations)[0].split, 'letter', `${slug}: a letter at a time`);
  assert.deepEqual(Object.values(byId('shatter').preset.animations)[0].trigger, { type: 'clip' });
  assert.deepEqual(Object.values(byId('roll-call').preset.animations)[0].trigger, { type: 'level', at: 0.7, way: 'up' });
  // Refused where the set draws no legend, and on a scale with no numbers unless the preset turns them on.
  const carbon = resolveControlForSet(createControl('Meter'), getControlSet('carbon-pro'));
  assert.match(applyPresetPatch(createControl('Meter'), byId('type-on').preset, { drawn: carbon }).reason, /legend, which this meter's set does not draw/);
  const reel = resolveControlForSet(createControl('Meter'), getControlSet('reel'));
  const bare = { ...byId('numbers-in-turn').preset, fields: {} };
  assert.match(applyPresetPatch(createControl('Meter'), bare, { drawn: reel }).reason, /scale's numbers, and this meter's scale shows none/);
  assert.ok(applyPresetPatch(createControl('Meter'), byId('numbers-in-turn').preset, { drawn: reel }).patch);
  // The panel's numbers read as whole decibels.
  const words = METER_PANELS.find(([id]) => id === 'meter-words')[1]();
  const numbers = words.controls.find((c) => c._children.Core.name === 'NumbersInTurn')._children.Meter;
  assert.deepEqual([numbers.valueMin, numbers.valueMax], [-60, 0]);
});
