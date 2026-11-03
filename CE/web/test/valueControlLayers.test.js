// valueControlLayers.test.js — Create Component from Selection makes a knob or a slider into layers
// (docs/design/changeable-control-sets.md, piece D2; utils/valueControlLayers.js). What it looks like
// is browser-checks/knobLayers.mjs's to compare; this pins what the layers are and how they are wired.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { BUILT_IN_CONTROL_SETS, getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { valueLayersRefusal } from '../src/CE_Application/utils/valueControlLayers.js';

const panelWith = (controls, setId = 'graphite') => ({ id: 'p', controlSet: { id: setId }, controlSets: [], controls });
const knob = (patch = {}) => createControl('Knob', { Core: { id: 'k1', name: 'Cutoff' }, Transform: { x: 40, y: 60, width: 120, height: 140 }, ...patch });
const plan = (controls, setId = 'graphite', valueControlsAs = 'layers') => planComponentFromSelection(panelWith(controls, setId), controls.map((c) => c._children.Core.id), { set: getControlSet(setId), name: 'T', valueControlsAs });

test('a knob comes in as layers wired to its value, and as one exact part when asked', () => {
  const layered = plan([knob()]);
  assert.ok(layered.ok);
  const parts = layered.component._children.Parts._children;
  assert.ok(!Object.values(parts).some((part) => part.kind === 'slidercontrol'), 'no frozen copy');
  assert.deepEqual(Object.keys(parts), ['Cutoff_track', 'Cutoff_value', 'Cutoff_cap', 'Cutoff_pointer', 'Cutoff_readout']);
  const bindings = layered.component._children.Bindings._children;
  assert.equal(bindings.Cutoff_pointerTurn.source, 'channel.Cutoff.normalized');
  assert.equal(bindings.Cutoff_pointerTurn.target, 'Parts.Cutoff_pointer.Layout.rotation');
  assert.equal(bindings.Cutoff_pointerTurn.outputMax - bindings.Cutoff_pointerTurn.outputMin, 270, 'turns through the knob\'s sweep');
  assert.equal(bindings.Cutoff_valueSweep.target, 'Parts.Cutoff_value.meta.arcTrack.sweepAngle');
  assert.equal(bindings.Cutoff_readoutText.source, 'channel.Cutoff.display');
  const behaviour = layered.component._children.Behaviors._children.Cutoff;
  assert.equal(behaviour.geometry, 'circular');
  assert.equal(behaviour.startAngle, 225, 'the designer counts from 12 o\'clock');
  // The channel prints as the knob's readout did: no unit twice.
  assert.equal(layered.component._children.ValueChannels._children.Cutoff.format.suffix, '');
  // Its interaction states, on the layers its parts became.
  const states = layered.component._children.States._children;
  assert.ok(states.CutoffDragging.patches.parts.Cutoff_value['meta.arcTrack.colour'], 'an arc keeps its colour in meta');
  const exact = plan([knob()], 'graphite', 'part');
  assert.equal(Object.values(exact.component._children.Parts._children)[0].kind, 'slidercontrol');
});

test('colours keep the set\'s colour roles, so the component follows the panel\'s set', () => {
  const layered = plan([knob()]);
  const parts = layered.component._children.Parts._children;
  assert.match(parts.Cutoff_value.meta.arcTrack.colour, /^\{.+\}$/, 'the value arc names a role');
});

test('a knob a layer cannot draw yet comes in as one exact part, named with the reason', () => {
  // Soft's cap turns under a fixed light; Atlas is drawn in a control form, not parts.
  for (const [setId, words] of [['soft', 'turns under a fixed light'], ['atlas', 'control form']]) {
    const result = plan([knob()], setId);
    assert.ok(result.ok, setId);
    assert.equal(result.asParts.length, 1);
    assert.match(result.asParts[0].reason, new RegExp(words));
    assert.equal(Object.values(result.component._children.Parts._children)[0].kind, 'slidercontrol');
  }
});

test('every built-in set\'s knob either converts or names why not', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const resolved = resolveControlForSet(createControl('Knob'), set);
    const why = valueLayersRefusal(resolved);
    assert.equal(typeof why, 'string', set.id);
    if (why) assert.ok(why.length > 10, `${set.id}: ${why}`);
  }
});

test('ticks, engraved and lit, turn about the knob\'s centre', () => {
  const result = plan([knob()], 'machined');
  const ticks = Object.values(result.component._children.Parts._children).filter((part) => /_tick\d+$/.test(part.name));
  assert.ok(ticks.length > 5);
  const at = (layout, axis, size, pivot) => (layout[axis] + layout[size] * layout[pivot] / 100).toFixed(1);
  const pivots = new Set(ticks.map(({ _children: { Layout: l } }) => `${at(l, 'x', 'width', 'pivotX')},${at(l, 'y', 'height', 'pivotY')}`));
  assert.equal(pivots.size, 1, 'one centre');
  assert.ok(Object.values(result.component._children.Bindings._children).some((binding) => /_tick\d+Lit$/.test(binding.name)), 'lit up to the value');
});

test('a slider comes in as a track, a fill that grows, and a cap that moves along it', () => {
  const slider = createControl('Slider', { Core: { id: 's1', name: 'Drive' }, Transform: { x: 10, y: 10, width: 240, height: 70 } });
  const result = plan([slider]);
  assert.ok(result.ok);
  const parts = result.component._children.Parts._children;
  assert.ok(parts.Drive_track && parts.Drive_value && parts.Drive_cap);
  const bindings = result.component._children.Bindings._children;
  assert.equal(bindings.Drive_valueLength.target, 'Parts.Drive_value.Layout.width');
  assert.equal(bindings.Drive_capMove.target, 'Parts.Drive_cap.Layout.offsetX');
  assert.ok(bindings.Drive_capMove.outputMax > 100, 'the length of the track');
  const zone = result.component._children.HitZones._children.DriveZone.bounds;
  assert.ok(zone.width < 100 && zone.x > 0, 'dragged along the track, not the whole box');
  assert.equal(result.component._children.Behaviors._children.Drive.geometry, 'linear');
});

test('the window offers layers or one exact part, and names what stays one part', () => {
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  const dialog = read('layout/ComponentFromSelectionDialog.svelte');
  for (const words of ['Create Component from Selection', 'Knobs, sliders, buttons, switches and meters', 'As layers', 'As one exact part', 'comes in as one exact part:', 'data-testid="as-one-part"']) {
    assert.ok(dialog.includes(words), words);
  }
  assert.match(read('stores/componentFromSelectionActions.js'), /componentFromSelectionRequest\.set\(\{ panelId, ids, suggestion/);
  assert.match(readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8'), /<ComponentFromSelectionDialog \/>/);
});

test('a switch comes in as layers: its device parts move and light when on, a toggle on a click', () => {
  const toggle = createControl('ToggleButton', { Core: { id: 't1', name: 'Hold' }, Transform: { x: 10, y: 10, width: 160, height: 100 }, Text: { content: 'HOLD' } });
  const result = plan([toggle], 'tolex');
  assert.ok(result.ok, JSON.stringify(result.refused));
  const parts = result.component._children.Parts._children;
  assert.ok(Object.values(parts).every((part) => part.kind !== 'slidercontrol'));
  assert.ok(parts.Hold_key && parts.Hold_caption, 'its key and its caption');
  assert.ok(result.component._children.Bindings._children.Hold_keySwing, 'its lever swings');
  // Console's switch lights its symbol when on.
  const lit = plan([toggle], 'console');
  const channel = result.component._children.ValueChannels._children.Hold;
  assert.equal(channel.type, 'bool');
  assert.equal(result.component._children.HitZones._children.HoldZone.action, 'toggleValue');
  const on = lit.component._children.States._children.HoldOn;
  assert.equal(on.rule, 'Hold == true', 'lit while on');
  assert.ok(on.patches.parts.Hold_symbol['Background.Fill.colour'], 'its symbol takes its lit colour');
});

test('a plain button is its plate and its text, held on while pressed', () => {
  const button = createControl('Button', { Core: { id: 'b1', name: 'Tap' }, Transform: { x: 10, y: 10, width: 90, height: 34 }, Text: { content: 'TAP' } });
  const result = plan([button], 'graphite');
  assert.ok(result.ok, JSON.stringify(result.refused));
  const parts = result.component._children.Parts._children;
  assert.deepEqual(Object.keys(parts), ['Tap_plate', 'Tap_text']);
  assert.equal(result.component._children.HitZones._children.TapZone.action, 'momentaryValue');
  const states = result.component._children.States._children;
  assert.equal(states.TapPressed.rule, 'Tap == true', 'its pressed look while held');
  assert.ok(states.TapHover.patches.parts.Tap_plate['Background.Fill.colour'], 'its hover look on its plate');
  // Asked for one exact part, a button is refused by name: only layers draw it.
  assert.match(plan([button], 'graphite', 'part').refused[0].reason, /ask for layers/);
});

test('a momentary channel is on while held and off once let go', async () => {
  const { momentaryChannelValue, resolveCustomHitZoneProbeValues, resolveCustomInteractionPatch } = await import('../src/CE_Application/utils/customComponentInteraction.js');
  const { createValueChannel } = await import('../src/CE_Application/utils/customComponentFactory.js');
  assert.equal(momentaryChannelValue(createValueChannel('b', { type: 'bool' }), true), true);
  assert.equal(momentaryChannelValue(createValueChannel('b', { type: 'bool' }), false), false);
  assert.equal(momentaryChannelValue(createValueChannel('v', { min: 0, max: 127, step: 1, defaultValue: 0 }), true), 127);
  const control = {
    _children: {
      Core: { controlType: 'CustomComponent' },
      ValueChannels: { _children: { b: createValueChannel('b', { type: 'bool', defaultValue: false }) } },
      Behaviors: { _children: {} },
      HitZones: { _children: { z: { action: 'momentaryValue', targetValueChannel: 'b' } } },
    },
  };
  const zone = { name: 'z', zone: control._children.HitZones._children.z };
  assert.equal(resolveCustomInteractionPatch(control, {}, zone, {}).customValues.b, true, 'pressed');
  assert.equal(resolveCustomInteractionPatch(control, { customValues: { b: true } }, zone, { release: true }).customValues.b, false, 'let go');
  assert.equal(resolveCustomHitZoneProbeValues(control, zone, {}).b, true, 'the Test Bench tries it held');
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  const preview = read('editor/PanelPreviewSurface.svelte');
  assert.match(preview, /action === 'momentaryvalue' && activeControl/);
  // Space and Enter hold it too: on at the key-down, off at the key-up, never left on.
  assert.match(preview, /if \(isCustomComponent\(control\)\) patchCustomKeyboardActivation\(control, event, 'down'\);/);
  assert.match(preview, /if \(phase === 'down' && !momentary\) return;/);
  assert.match(preview, /release: momentary && phase === 'up',/);
  assert.match(read('components/InteractiveTestSurface.svelte'), /action === 'momentaryvalue'/);
  assert.match(read('sections/CustomHitZonesEditor.svelte'), /'momentaryValue'/);
});

test('a meter comes in as layers: a needle swings, a bar\'s gradient is covered past the reading, segments light', () => {
  const meter = (patch = {}) => createControl('Meter', { Core: { id: 'm1', name: 'Level' }, Transform: { x: 0, y: 0, width: 200, height: 125 }, ...patch });
  // Tolex: a needle meter drawn with device parts.
  const needle = plan([meter()], 'tolex');
  assert.ok(needle.ok, JSON.stringify(needle.refused));
  const bindings = needle.component._children.Bindings._children;
  assert.ok(Object.keys(bindings).some((name) => /indicatorSwing$/.test(name)), 'the needle swings');
  assert.equal(bindings.Level_readoutText.source, 'channel.Level.display', 'the readout prints the value');
  assert.equal(Object.keys(needle.component._children.HitZones._children).length, 0, 'a meter takes no input');
  // Graphite: a plain bar; the cover runs from the reading to the end.
  const bar = plan([meter({ Transform: { x: 0, y: 0, width: 200, height: 40 } })], 'graphite');
  assert.ok(bar.ok, JSON.stringify(bar.refused));
  const cover = bar.component._children.Bindings._children.Level_coverWidth;
  assert.equal(cover.target, 'Parts.Level_cover.Layout.width');
  assert.ok(cover.outputMin > cover.outputMax, 'shorter as the reading rises');
  assert.ok(bar.component._children.Parts._children.Level_fill._children.Background._children.Fill.gradientEnabled, 'the zones as one gradient');
  // Saddle: segments, each lit from its middle.
  const leds = plan([meter({ Transform: { x: 0, y: 0, width: 200, height: 40 } })], 'saddle');
  assert.ok(Object.keys(leds.component._children.Bindings._children).filter((name) => /segment\d+litLit$/.test(name)).length >= 8);
  // What a layer does not draw yet is named.
  assert.match(plan([meter({ Meter: { peakHold: true } })], 'graphite').refused[0].reason, /peak hold/);
});

test('the knob\'s value glide comes with its layers: its pointer and its arc ease when the value changes', () => {
  // A Knob ships pointerSlide: 140 ms, outCubic, on a value change. The layers went straight to the
  // value; now the timing is an animation on the channel over what the knob's bindings move.
  const layered = plan([knob()]);
  const glide = layered.component._children.Animations._children.CutoffGlide;
  assert.ok(glide, 'an animation for the channel');
  assert.deepEqual(glide.trigger, { type: 'valueChange', source: 'channel.Cutoff.normalized', origin: 'any' });
  assert.equal(glide.duration, 140);
  assert.equal(glide.easing, 'outCubic');
  const paths = glide.targets.map((target) => target.path);
  assert.ok(paths.includes('Parts.Cutoff_pointer.Layout.rotation'), 'the pointer turns on it');
  assert.ok(paths.includes('Parts.Cutoff_value.meta.arcTrack.sweepAngle'), 'the value arc sweeps on it');
  assert.ok(!paths.some((path) => path.endsWith('Text.content')), 'a readout cannot ease, so it is not listed');
  // A knob without a glide brings none.
  const still = knob();
  still._children.Animations._children.pointerSlide.enabled = false;
  still._children.Animations._children.rangeSlide.enabled = false;
  assert.equal(plan([still]).component._children.Animations?._children?.CutoffGlide, undefined);
  // The arc's sweep eases in the renderer, on its size timing: CSS cannot ease an SVG attribute.
  const renderer = readFileSync(new URL('../src/CE_Application/editor/InteractivePartRenderer.svelte', import.meta.url), 'utf8');
  assert.match(renderer, /let arcTiming = \$derived\(transitionBucket\?\.size \? parseTiming\(transitionBucket\.size\) : null\);/);
  assert.match(renderer, /const angles = arcGlide \?\? arcTarget;/);
});
