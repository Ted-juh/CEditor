// everySetAsLayers.test.js — Create Component from Selection, asked for layers, makes every offered
// set's knobs, sliders, buttons, switches and meters into layers (Iris and Satellite, drawn whole,
// aside): no knob or slider falls back to one exact part and nothing is refused
// (utils/valueControlLayers.js, utils/customComponentFromControls.js). What they look like is
// browser-checks/knobLayers.mjs's to compare (CE_KNOB_LAYERS_STRICT=1); this pins what the layers
// are and how they are wired, and the pieces they needed: a path layer whose light stays put while
// its outline turns, a path under any affine map, and a counter's figures as a binding.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { OFFERED_CONTROL_SETS, getControlSet, isIllustratedControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { figureLengths, knobLayers, meterDeviceLayers, sliderLayers } from '../src/CE_Application/utils/valueControlLayers.js';
import { rotatePathData, transformPathData } from '../src/CE_Application/utils/svgPathScale.js';
import { applyCustomBindings, resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { buildShadowCSS } from '../src/CE_Application/utils/effectsCSS.js';
import { MAP_MODES } from '../src/CE_Application/utils/bindingSourceOptions.js';

const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const SETS = OFFERED_CONTROL_SETS.filter((set) => !isIllustratedControlSet(set));
const BOXES = {
  Knob: { width: 120, height: 140 }, Slider: { width: 70, height: 200 }, Button: { width: 160, height: 100 },
  ToggleButton: { width: 160, height: 100 }, Meter: { width: 200, height: 125 },
};
const control = (type, patch = {}) => createControl(type, {
  Core: { id: 'c1', name: 'Part' }, Transform: { x: 40, y: 40, ...BOXES[type] }, ...patch,
});
const plan = (controls, setId) => planComponentFromSelection(
  { id: 'p', controlSet: { id: setId }, controlSets: [], controls },
  controls.map((c) => c._children.Core.id),
  { set: getControlSet(setId), name: 'T', valueControlsAs: 'layers' },
);
const partsOf = (result) => result.component._children.Parts._children;
const unique = () => {
  const taken = new Set();
  return (wanted) => { let name = wanted; let i = 2; while (taken.has(name)) name = `${wanted}${i++}`; taken.add(name); return name; };
};
const knobAs = (setId) => knobLayers({
  resolved: resolveControlForSet(createControl('Knob'), getControlSet(setId)), rect: { x: 0, y: 0, width: 120, height: 140 },
  channel: 'v', prefix: 'k', zIndex: 0, uniqueName: unique(),
});

test('every offered set\'s knob, slider, button, switch and meter becomes layers, none one exact part, none refused', () => {
  assert.ok(SETS.length >= 60);
  for (const set of SETS) {
    for (const [type, patch] of [['Knob'], ['Slider', { Behavior: { orientation: 'vertical' } }], ['Slider', { Behavior: { orientation: 'horizontal' } }], ['Button'], ['ToggleButton'], ['Meter']]) {
      const result = plan([control(type, patch)], set.id);
      const label = `${set.id} ${type}${patch ? ` ${patch.Behavior.orientation}` : ''}`;
      assert.ok(result.ok, `${label}: ${result.refused?.[0]?.reason ?? ''}`);
      assert.equal(result.asParts.length, 0, `${label}: ${result.asParts[0]?.reason ?? ''}`);
      assert.ok(!Object.values(partsOf(result)).some((part) => part.kind === 'slidercontrol'), `${label}: no frozen copy`);
    }
  }
});

test('a path under an affine map: every point moved, H and V as lines, an arc\'s ellipse mapped and its turn kept', () => {
  assert.equal(rotatePathData('M10 0 L20 0 h5 v5 Z', 90, 0, 0), 'M0 10 L0 20 L0 25 L-5 25 Z', 'clockwise on screen');
  assert.equal(transformPathData('M0 50 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0 Z', [1, 0, 0, 0.5, 0, 0]),
    'M0 25 A50 25 0 1 0 100 25 A50 25 0 1 0 0 25 Z', 'a circle squashed is an ellipse');
  const turned = transformPathData('M0 0 A20 10 30 0 1 10 10', [Math.cos(0.3), Math.sin(0.3), -Math.sin(0.3), Math.cos(0.3), 0, 0]);
  assert.match(turned, /^M0 0 A20 10 47\.189 0 1 /, 'an ellipse\'s turn grows by the map\'s');
  assert.match(transformPathData('M0 0 A5 5 0 0 1 10 0', [-1, 0, 0, 1, 0, 0]), /A5 5 0 0 0 -10 0$/, 'a mirror reverses the sweep');
});

test('a plate turns its outline under a light that stays put, casts its shadow as a layer under it, and keeps its grooves', () => {
  const bakelite = knobAs('bakelite');
  const names = bakelite.parts.map((part) => part.name);
  const housing = bakelite.parts.find((part) => part.name === 'k_housing');
  assert.equal(housing.meta.fixedLight, true, 'a turning gear keeps its light');
  assert.equal(bakelite.bindings.k_housingTurn.target, 'Parts.k_housing.Layout.rotation');
  assert.ok(names.indexOf('k_housingShadow') < names.indexOf('k_housing'), 'the shadow under it');
  const shadow = bakelite.parts.find((part) => part.name === 'k_housingShadow');
  assert.equal(shadow._children.Background._children.Fill.colour.length, 8);
  assert.ok(shadow._children.Layout.y > housing._children.Layout.y, 'lower');
  assert.ok(bakelite.bindings.k_housingShadowTurn, 'turning with it');
  // Precision's knurling: one layer of grooves round the housing.
  const chronograph = knobAs('chronograph');
  assert.ok(chronograph.parts.some((part) => part.name === 'k_housingGrooves'));
  assert.equal((chronograph.parts.find((part) => part.name === 'k_housingGrooves').meta.pathData.match(/M/g) ?? []).length, 48);
  // A skirt under the track and an insert in the cap.
  const hiFi = knobAs('hi-fi').parts.map((part) => part.name);
  assert.ok(hiFi.indexOf('k_skirt') < hiFi.indexOf('k_track') || !hiFi.includes('k_track'));
  assert.ok(hiFi.indexOf('k_insert') > hiFi.indexOf('k_cap'));
  // Seen in perspective: an oval, moved below the centre.
  const valve = knobAs('valve-console').parts.find((part) => part.name === 'k_housing');
  const [, rx, ry] = valve.meta.pathData.match(/A([\d.]+) ([\d.]+)/);
  assert.notEqual(Number(rx), Number(ry), 'squashed');
});

test('a bar pointer, its edge and its second bar; a second scale; the scale\'s numbers', () => {
  const dual = knobAs('dual-scale');
  const names = dual.parts.map((part) => part.name);
  assert.ok(names.includes('k_pointer') && names.includes('k_pointerMark'));
  assert.equal(dual.bindings.k_pointerMarkTurn.target, 'Parts.k_pointerMark.Layout.rotation');
  assert.ok(names.filter((name) => /^k_scale2Tick\d+$/.test(name)).length >= 5, 'the inner ring');
  assert.equal(names.filter((name) => /^k_number\d+$/.test(name)).length, 6);
  const pinstripe = knobAs('pinstripe').parts.map((part) => part.name);
  assert.ok(pinstripe.indexOf('k_pointerEdge') < pinstripe.indexOf('k_pointer'), 'the edge under the bar');
});

test('every fader cap kind: a block\'s sheen and plate, a lens\'s dome and light, a glass dot\'s halo, a glow softened', () => {
  const sliderAs = (setId) => sliderLayers({
    resolved: resolveControlForSet(createControl('Slider'), getControlSet(setId)), rect: { x: 0, y: 0, width: 70, height: 200 },
    channel: 'v', prefix: 's', zIndex: 0, uniqueName: unique(),
  }).parts;
  const block = sliderAs('aerospace').map((part) => part.name);
  for (const name of ['s_cap', 's_capSheen', 's_capPlate', 's_capPlateSheen', 's_capGroove']) assert.ok(block.includes(name), name);
  const lens = sliderAs('neon');
  const glow = lens.find((part) => part.name === 's_capGlow');
  assert.equal(glow._children.Effects._children.Filters.blur, 4);
  for (const name of ['s_capDome', 's_capLight', 's_capLightCore', 's_capSpark']) assert.ok(lens.some((part) => part.name === name), name);
  assert.equal(lens.find((part) => part.name === 's_capDome')._children.Background._children.Fill.gradient.type, 'radial');
  assert.ok(sliderAs('floating-halo').some((part) => part.name === 's_capHalo'));
  assert.ok(sliderAs('phosphor').some((part) => part.name === 's_capGlow'), 'a ring\'s glow');
  // The panel's glowing fill draws nothing (its blur's region is a straight line's empty box): none.
  assert.ok(!lens.some((part) => /valueGlow/.test(part.name)));
});

test('a counter: its figures as a binding, its windows and digits for each count of figures', () => {
  assert.deepEqual(figureLengths(0, 1, 2), [4]);
  assert.deepEqual(figureLengths(0, 100, 0), [1, 2, 3]);
  assert.deepEqual(figureLengths(-60, 6, 1), [3, 4, 5], 'a minus sign, -0.0 included');
  const figures = (binding, raw) => {
    const node = { _children: { Parts: { _children: { t: { _children: { Text: { content: 'x' } } }, o: { opacity: 0.5 } } }, Bindings: { _children: { b: { enabled: true, source: 'channel.v.raw', ...binding } } } } };
    applyCustomBindings(node, { customChannels: { 'channel.v.raw': raw } });
    return binding.target.includes('opacity') ? node._children.Parts._children.o.opacity : node._children.Parts._children.t._children.Text.content;
  };
  const text = { mapMode: 'figures', target: 'Parts.t.Text.content', precision: 1 };
  assert.equal(figures(text, 12.34), '12.3');
  assert.equal(figures({ ...text, character: 1 }, 12.34), '2');
  assert.equal(figures({ ...text, character: 9 }, 12.34), '');
  assert.equal(figures({ ...text, character: 0, length: 3 }, 12.34), '', 'shown only at three figures');
  assert.equal(figures({ mapMode: 'figures', target: 'Parts.o.opacity', precision: 0, length: 2, outputMax: 0.8, outputMin: 0 }, 42), 0.8);
  assert.equal(figures({ mapMode: 'figures', target: 'Parts.o.opacity', precision: 0, length: 2, outputMax: 0.8, outputMin: 0 }, 7), 0);
  // Neon's counter, its range 0 to 100: windows and digits for one, two and three figures.
  const meter = resolveControlForSet(createControl('Meter', { Meter: { valueMin: 0, valueMax: 100, value: 42 } }), getControlSet('neon'));
  const built = meterDeviceLayers({ resolved: meter, rect: { x: 0, y: 0, width: 200, height: 125 }, channel: 'v', prefix: 'm', zIndex: 0, uniqueName: unique() });
  const names = built.parts.map((part) => part.name);
  for (const n of [1, 2, 3]) assert.ok(names.includes(`m_face${n}`), `windows for ${n}`);
  assert.equal(built.bindings.m_face2Shown.mapMode, 'figures');
  assert.equal(built.bindings.m_face2Shown.length, 2);
  assert.ok(names.includes('m_legend3Figure2'), 'the third figure of three');
  assert.equal(built.bindings.m_legend3Figure2Text.character, 2);
  assert.equal(built.bindings.m_legend3Figure2Text.length, 3);
  // The Bindings editor offers it.
  assert.ok(MAP_MODES.some(([id]) => id === 'figures'));
  assert.match(read('sections/BindingsEditor.svelte'), /\{:else if selectedBinding\.mapMode === 'figures'\}/);
});

test('a key\'s and a meter case\'s shadow are layers under them; a switch\'s lamp lights while it is on', () => {
  const button = partsOf(plan([control('Button')], 'valve-console'));
  const names = Object.keys(button);
  const shadow = names.find((name) => /Shadow$/.test(name));
  assert.ok(shadow, 'a shadow layer');
  assert.ok(button[shadow]._children.Effects._children.Filters.blur >= 0);
  assert.ok(names.indexOf(shadow) < names.indexOf(shadow.replace(/Shadow$/, '')), 'under its part');
  const meter = partsOf(plan([control('Meter')], 'valve-console'));
  assert.ok(Object.keys(meter).some((name) => /housingShadow$/.test(name)));
  const ceramic = plan([control('ToggleButton')], 'ceramic');
  const lamp = Object.values(partsOf(ceramic)).find((part) => /_lamp$/.test(part.name));
  assert.ok(lamp, 'a lamp layer');
  assert.equal(lamp._children.Background._children.Border.thickness, 1, 'its bezel');
  assert.equal(lamp._children.Effects._children.Shadows.items[0].type, 'inner', 'set in, unlit');
  const lit = Object.values(ceramic.component._children.States._children).find((state) => /Lamp$/.test(state.name));
  // Lit, its colour is the set's (a colour role, kept as a role, so it follows the panel's set).
  assert.match(lit.patches.parts[lamp.name]['Background.Fill.colour'], /^(\{.+\}|[0-9A-F]{8})$/i);
  assert.notEqual(lit.patches.parts[lamp.name]['Background.Fill.colour'], lamp._children.Background._children.Fill.colour);
  assert.equal(lit.patches.parts[lamp.name]['Effects.Shadows.items'][0].type, 'outer-glow');
});

test('a layer\'s shadow keeps its colour\'s alpha; a path\'s light stays put while it turns', () => {
  const effects = { _children: { Shadows: { items: [{ enabled: true, type: 'inner', offsetX: 0, offsetY: 1, blur: 2, spread: 0, colour: '99000000' }] } } };
  assert.equal(buildShadowCSS(effects), 'box-shadow: inset 0px 1px 2px 0px rgba(0, 0, 0, 0.600);');
  const renderer = read('editor/InteractivePartRenderer.svelte');
  assert.match(renderer, /let fixedLight = \$derived\(shape\.rendersOutline && part\?\.meta\?\.fixedLight === true\);/);
  assert.match(renderer, /if \(Math\.abs\(partRotation\) > 0\.001 && !fixedLight\) transforms\.push/);
  assert.match(renderer, /const turn = \(d\) => \(d \? rotatePathData\(d, outlineTurn, px, py\) : d\);/);
});

test('a meter that holds its peak keeps it on its value: a clip lamp, a peak needle and Peak Hold\'s marker read it', () => {
  const meterIn = (setId, edit) => {
    const meter = control('Meter');
    edit(meter._children);
    return plan([meter], setId).component;
  };
  // A device meter's clip lamp: its own look, then lit, at its level of the held peak.
  const lamp = meterIn('brassworks', (k) => Object.assign(k.Parts._children.lamp, { visible: true }));
  const channel = lamp._children.ValueChannels._children.Part;
  assert.deepEqual(channel.peakHold, { holdMs: 1200, decayPerSec: 0.4, idle: 'value' });
  const lampBindings = lamp._children.Bindings._children;
  assert.equal(lampBindings.Part_lampLitLit.source, 'channel.Part.peak');
  assert.equal(lampBindings.Part_lampLitLit.inputMax, 0.9, 'at its level');
  assert.equal(lampBindings.Part_lampDim.source, 'channel.Part.peak');
  // A needle that shows the peak swings with it.
  const needle = meterIn('brassworks', (k) => Object.assign(k.Parts._children.indicator, { visible: true, source: 'peak', motion: 'swing', swing: 90 }));
  assert.ok(Object.values(needle._children.Bindings._children).some((b) => /indicatorSwing$/.test(b.name) && b.source === 'channel.Part.peak'));
  // A plain meter's Peak Hold: a line on a bar, an outline on the segment the peak is in, a mark on an arc.
  const bar = meterIn('graphite', (k) => { k.Meter.peakHold = true; });
  assert.equal(bar._children.ValueChannels._children.Part.peakHold.idle, 'none', 'no marker where nothing runs');
  assert.equal(bar._children.Bindings._children.Part_peakMove.source, 'channel.Part.peak');
  const segments = meterIn('graphite', (k) => { k.Meter.peakHold = true; k.Meter.segments = 10; });
  const band = segments._children.Bindings._children.Part_segment3peakPeak;
  assert.equal(band.band, true);
  assert.deepEqual([band.inputMin, band.inputMax], [0.35, 0.45], 'the peak rounds to the fourth segment');
  const arc = meterIn('graphite', (k) => { k.Meter.peakHold = true; k.Meter.orientation = 'arc'; });
  assert.equal(arc._children.Bindings._children.Part_peakTurn.source, 'channel.Part.peak');
});

test('the held peak as a signal, an inside-only range, the preview keeping each component\'s peak', () => {
  const run = (channel, session, binding) => {
    const node = {
      _children: {
        Core: { controlType: 'CustomComponent' },
        ValueChannels: { _children: { v: { _type: 'ValueChannel', name: 'v', type: 'float', min: 0, max: 1, currentValue: 0.3, defaultValue: 0.3, ...channel } } },
        Parts: { _children: { o: { opacity: 0.5, _children: {} } } },
        Bindings: { _children: { b: { enabled: true, mapMode: 'range', source: 'channel.v.peak', target: 'Parts.o.opacity', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, ...binding } } },
      },
    };
    return resolveInteractiveControl(node, session).control._children.Parts._children.o.opacity;
  };
  assert.equal(run({ peakHold: { idle: 'value' } }, {}, {}), 0.3, 'where nothing runs, the value');
  assert.equal(run({ peakHold: { idle: 'none' } }, {}, {}), 0, 'or none');
  assert.equal(run({ peakHold: { idle: 'none' } }, { customPeaks: { v: 0.8 } }, {}), 0.8, 'the preview\'s held peak');
  assert.equal(run({ peakHold: {} }, { customPeaks: { v: 0.8 } }, { band: true, inputMin: 0.75, inputMax: 0.85 }), 1, 'inside');
  assert.equal(run({ peakHold: {} }, { customPeaks: { v: 0.9 } }, { band: true, inputMin: 0.75, inputMax: 0.85 }), 0, 'outside');
  const surface = read('editor/PanelPreviewSurface.svelte');
  assert.match(surface, /const customPeaks = componentPeaks\(rawControl, keyed\);/);
  assert.match(surface, /holdMs: numberOr\(channel\.peakHold\.holdMs, 1200\), decayPerSec: numberOr\(channel\.peakHold\.decayPerSec, 0\.4\)/);
  assert.match(read('sections/BindingsEditor.svelte'), /<PropertyCell label="Inside Only"/);
});

test('a turned or scaled button, switch or meter of every set turns its layers, and each moving layer starts where it is drawn', () => {
  for (const set of SETS) {
    for (const type of ['Button', 'ToggleButton', 'Meter']) {
      const result = plan([control(type, { Transform: { rotation: 20, scale: 0.9 } })], set.id);
      const label = `${set.id} ${type}`;
      assert.ok(result.ok, `${label}: ${result.refused?.[0]?.reason ?? ''}`);
      const parts = partsOf(result);
      const bindings = result.component._children.Bindings._children;
      for (const binding of Object.values(bindings)) {
        const [, layer, , key] = String(binding.target).split('.');
        if (!/^Turned[XY]\d*$/.test(String(binding.name).slice(layer.length))) continue;
        // A button's reading starts at 0, off; a meter's layers are seeded at its reading, so only the axis is checked.
        assert.ok(['x', 'y'].includes(key), `${label} ${binding.name}`);
        assert.equal(parts[layer]._children.Layout.offsetX, 0);
        assert.equal(parts[layer]._children.Layout.offsetY, 0);
        if (type !== 'Meter') assert.ok(Math.abs(binding.outputMin - parts[layer]._children.Layout[key]) < 0.01, `${label} ${binding.name}: starts at ${binding.outputMin}, drawn at ${parts[layer]._children.Layout[key]}`);
      }
      for (const part of Object.values(parts)) {
        assert.equal(part._children.Layout.anchorX, 'left', `${label} ${part.name}`);
        assert.equal(part._children.Layout.xUnit, 'px', `${label} ${part.name}`);
      }
    }
  }
});
