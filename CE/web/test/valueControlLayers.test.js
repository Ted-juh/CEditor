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
  // Atlas is drawn in a control form, not parts.
  for (const [setId, words, control] of [['atlas', 'control form', knob()]]) {
    const result = plan([control], setId);
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
});

test('a meter on a decibel scale comes in as layers that read its value on that scale', async () => {
  const { decibelPosition, meterPosition } = await import('../src/CE_Application/utils/meterLayout.js');
  const { resolveInteractiveControl } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const cfg = { scale: 'db', dbFloor: -40, dbCeil: 6, value: 0.5, valueMin: 0, valueMax: 1, peakHold: true };
  const result = plan([createControl('Meter', { Core: { id: 'm1', name: 'Level' }, Transform: { x: 0, y: 0, width: 200, height: 125 }, Meter: cfg })], 'graphite');
  assert.ok(result.ok, JSON.stringify(result.refused));
  const component = result.component;
  const bindings = Object.values(component._children.Bindings._children);
  const placing = bindings.filter((binding) => binding.mapMode === 'range' && /\.(normalized|peak)$/.test(binding.source));
  assert.ok(placing.length > 0);
  for (const binding of placing) assert.deepEqual([binding.scale, binding.dbFloor, binding.dbCeil], ['db', -40, 6], binding.name);
  // The held peak falls on the same scale.
  const channel = Object.values(component._children.ValueChannels._children)[0];
  assert.equal(channel.peakHold.scale, 'db');
  // Half the range is -6 dB: on a -40..+6 scale, 34/46 of the way along, as the meter places it.
  assert.ok(Math.abs(decibelPosition(0.5, -40, 6) - meterPosition(0.5, cfg)) < 1e-12);
  const one = placing.find((binding) => binding.mapMode === 'range' && !binding.band && binding.inputMin === 0 && binding.inputMax === 1);
  assert.ok(one, 'a binding over the whole travel');
  const drawn = resolveInteractiveControl(component, { customValues: { [channel.name]: 0.5 } }).control;
  const [, part, ...path] = one.target.split('.');
  let node = drawn._children.Parts._children[part];
  for (const key of path) node = node?._children?.[key] ?? node?.[key];
  const expected = one.outputMin + (one.outputMax - one.outputMin) * meterPosition(0.5, cfg);
  assert.ok(Math.abs(Number(node) - expected) < 0.01, `${one.target}: ${node} where the meter puts ${expected}`);
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

test('a knob\'s track, value arc and dot pointer in a gradient, a riding label and a synth readout come in as layers', () => {
  const gradient = { type: 'linear', angle: 45, stops: [{ color: 'FFFF3030', position: 0 }, { color: 'FF3060FF', position: 100 }] };
  const rich = knob();
  for (const name of ['bodyTrackBase', 'bodyTrackFill', 'pointerCurrent']) {
    Object.assign(rich._children.Parts._children[name]._children.Background._children.Fill, { gradientEnabled: true, gradient });
  }
  rich._children.Parts._children.pointerCurrent.kind = 'dot';
  Object.assign(rich._children.Behavior, { showHandleLabels: true, displayFormat: 'pan', min: 0, max: 127 });
  const result = plan([rich], 'graphite');
  assert.ok(result.ok);
  assert.equal(result.asParts.length, 0, result.asParts[0]?.reason);
  const parts = Object.values(result.component._children.Parts._children);
  // The arcs paint their gradient through themselves, over their box and a pixel, as the panel does.
  const arcs = parts.filter((part) => part.kind === 'arcTrack' && part.meta.arcTrack.paint === 'background');
  assert.ok(arcs.length >= 2, 'the track and the value arc');
  for (const arc of arcs) {
    assert.equal(arc.meta.arcTrack.paintPad, 1);
    assert.equal(arc._children.Background._children.Fill.gradientEnabled, true);
  }
  // The dot goes round upright; so does the riding label, which reads the channel's display text.
  assert.ok(parts.some((part) => part.meta?.orbit === true && part._children.Background?._children?.Fill?.gradientEnabled === true));
  const label = parts.find((part) => part._children.Text && part.meta?.orbit === true);
  assert.ok(label, 'a riding label');
  const bindings = Object.values(result.component._children.Bindings._children);
  assert.ok(bindings.some((binding) => binding.target === `Parts.${label.name}.Text.content` && /\.display$/.test(binding.source)));
  assert.ok(bindings.some((binding) => binding.target === `Parts.${label.name}.Layout.rotation`));
  // The channel writes its value as the synth does.
  const channel = Object.values(result.component._children.ValueChannels._children)[0];
  assert.equal(channel.format.display.displayFormat, 'pan');
});

test('a knob whose display range was cleared to null gets no display scale on its channel', () => {
  // Both writers store a cleared bound as null; Number(null) is 0, and a 0..0 display range would
  // read every value as 0 (utils/valueDisplayScale.js).
  const cleared = knob();
  Object.assign(cleared._children.Behavior, { displayMin: null, displayMax: null });
  const result = plan([cleared], 'graphite');
  assert.ok(result.ok);
  const channel = Object.values(result.component._children.ValueChannels._children)[0];
  assert.equal(channel.format.displayMin, undefined);
  assert.equal(channel.format.displayMax, undefined);
});

test('a knob that shows a plus on positive values writes one on its channel too', async () => {
  const { formatChannelValue } = await import('../src/CE_Application/utils/valueDisplayScale.js');
  const signed = knob();
  Object.assign(signed._children.Behavior, { showSign: true, min: -10, max: 10, precision: 0 });
  const channel = Object.values(plan([signed], 'graphite').component._children.ValueChannels._children)[0];
  assert.equal(formatChannelValue(channel, 3), '+3');
  assert.equal(formatChannelValue(channel, -3), '-3');
  assert.equal(formatChannelValue(channel, 0), '0');
});

// --- Ranges: a knob's or a slider's two handles (a band's three) -------------------------------------

const rangeOf = (type, behavior) => createControl(type, {
  Core: { id: 'r1', name: 'Range' },
  Transform: { x: 40, y: 60, width: type === 'Knob' ? 120 : 240, height: type === 'Knob' ? 140 : 70 },
  Behavior: { min: 0, max: 100, valueMode: 'range', defaultStartValue: 20, defaultEndValue: 70, ...behavior },
});
const rectOf = (component) => {
  const { width, height } = component._children.Transform;
  return { left: 0, top: 0, width, height, right: width, bottom: height };
};
const zonePoint = (component, zone, across, along = 0.5) => {
  const { width, height } = component._children.Transform;
  const b = zone.bounds;
  return { x: ((b.x + b.width * across) / 100) * width, y: ((b.y + b.height * along) / 100) * height };
};

test('a range knob comes in as layers: a value for each handle, kept in order, its arc from one to the other', async () => {
  const { resolveInteractiveControl } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const result = plan([rangeOf('Knob', { showHandleLabels: true })]);
  assert.ok(result.ok);
  assert.equal(result.asParts.length, 0, result.asParts[0]?.reason);
  const component = result.component;
  const channels = component._children.ValueChannels._children;
  // The start and the end are values of their own; the control's own keeps what the panel's sends.
  assert.equal(channels.RangeStart.defaultValue, 20);
  assert.equal(channels.RangeEnd.defaultValue, 70);
  assert.ok(channels.Range, 'the control\'s own value');
  assert.equal(channels.RangeStart.constraints.normalizedMax, 'channel.RangeEnd.normalized');
  assert.equal(channels.RangeEnd.constraints.normalizedMin, 'channel.RangeStart.normalized');
  const zone = Object.values(component._children.HitZones._children)[0];
  assert.deepEqual(zone.targetValueChannels, ['RangeStart', 'RangeEnd']);
  assert.equal(Object.values(component._children.Behaviors._children)[0].frame, 'zone');
  // Drawn at its values: the arc from 20 to 70 of a 270-degree sweep, the readout the panel's.
  const drawn = resolveInteractiveControl(component, { customValues: {} }).control._children.Parts._children;
  assert.equal(drawn.Range_range.meta.arcTrack.sweepAngle, 135);
  assert.equal(drawn.Range_readout._children.Text.content, '20.00 - 70.00');
  assert.ok(drawn.Range_start && drawn.Range_end, 'a dot for each handle');
  assert.equal(drawn.Range_startLabel._children.Text.content, '20.00');
  // Moved: the arc follows both ends.
  const moved = resolveInteractiveControl(component, { customValues: { RangeStart: 40, RangeEnd: 60 } }).control._children.Parts._children;
  assert.equal(moved.Range_range.meta.arcTrack.sweepAngle, 54);
  assert.equal(moved.Range_readout._children.Text.content, '40.00 - 60.00');
});

test('a band slider comes in with three caps; a press takes the nearest and a drag stops at the next', async () => {
  const { resolveCustomHitZoneAtPoint, resolveCustomInteractionPatch } = await import('../src/CE_Application/utils/customComponentInteraction.js');
  const { resolveInteractiveControl } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const result = plan([rangeOf('Slider', { valueMode: 'band', defaultCurrentValue: 40 })]);
  assert.ok(result.ok);
  assert.equal(result.asParts.length, 0, result.asParts[0]?.reason);
  const component = result.component;
  const channels = component._children.ValueChannels._children;
  assert.equal(channels.Range.constraints.normalizedMin, 'channel.RangeStart.normalized');
  assert.equal(channels.Range.constraints.normalizedMax, 'channel.RangeEnd.normalized');
  const parts = component._children.Parts._children;
  for (const name of ['Range_startCap', 'Range_cap', 'Range_endCap']) assert.ok(parts[name], name);
  const zone = Object.values(component._children.HitZones._children)[0];
  const rect = rectOf(component);
  const at = (across) => zonePoint(component, zone, across);
  assert.equal(resolveCustomHitZoneAtPoint(component, rect, at(0.1).x, at(0.1).y, {}).zone.targetValueChannel, 'RangeStart');
  assert.equal(resolveCustomHitZoneAtPoint(component, rect, at(0.45).x, at(0.45).y, {}).zone.targetValueChannel, 'Range');
  assert.equal(resolveCustomHitZoneAtPoint(component, rect, at(0.9).x, at(0.9).y, {}).zone.targetValueChannel, 'RangeEnd');
  // The end, dragged far to the left, stops at the value.
  const pressed = resolveCustomHitZoneAtPoint(component, rect, at(0.7).x, at(0.7).y, {});
  const patch = resolveCustomInteractionPatch(component, {}, pressed, {
    rect, clientX: at(0).x - 200, clientY: at(0).y, startClientX: at(0.7).x, startClientY: at(0.7).y, startValues: {},
  });
  assert.equal(patch.customValues.RangeEnd, 40);
  // The fill runs from the start to the end, its length moved by both.
  const fill = (values) => resolveInteractiveControl(component, { customValues: values }).control._children.Parts._children.Range_range._children.Layout;
  const wide = fill({ RangeStart: 0, RangeEnd: 100 });
  const narrow = fill({ RangeStart: 50, RangeEnd: 100 });
  assert.ok(Math.abs((wide.width - narrow.width) - (narrow.x - wide.x)) < 0.01, 'the start moves the near edge and shortens it as much');
  assert.equal(resolveInteractiveControl(component, { customValues: {} }).control._children.Parts._children.Range_readout._children.Text.content, '20.00 | 40.00 | 70.00');
});

test('handles that may pass each other or wrap round are refused by name; as one exact part a range is refused', () => {
  assert.match(plan([rangeOf('Slider', { allowHandleCross: true })]).refused?.[0]?.reason ?? '', /pass each other/);
  assert.match(plan([rangeOf('Knob', { allowWrapAround: true })]).refused?.[0]?.reason ?? '', /wrap round/);
  assert.match(plan([rangeOf('Knob', {})], 'graphite', 'part').refused?.[0]?.reason ?? '', /two handles/);
});

test('two knobs in one component each turn about their own centre', async () => {
  const { resolveCustomHitZoneAtPoint, resolveCustomInteractionPatch } = await import('../src/CE_Application/utils/customComponentInteraction.js');
  const a = knob({ Core: { id: 'k1', name: 'A' }, Behavior: { min: 0, max: 100 } });
  const b = knob({ Core: { id: 'k2', name: 'B' }, Transform: { x: 200, y: 60, width: 120, height: 140 }, Behavior: { min: 0, max: 100 } });
  const component = plan([a, b]).component;
  const behaviour = component._children.Behaviors._children.B;
  const zone = component._children.HitZones._children.BZone;
  const rect = rectOf(component);
  // Straight above the second knob's centre: half way round its sweep.
  const centre = zonePoint(component, zone, behaviour.centerX / 100, behaviour.centerY / 100);
  const hit = resolveCustomHitZoneAtPoint(component, rect, centre.x, centre.y - 30, {});
  assert.equal(hit.name, 'BZone');
  const patch = resolveCustomInteractionPatch(component, {}, hit, { rect, clientX: centre.x, clientY: centre.y - 30 });
  assert.equal(Math.round(patch.customValues.B), 50);
});

test('each handle of a range glides to a value it is given, as the panel moves all three on one curve', () => {
  const component = plan([rangeOf('Slider', { valueMode: 'band', defaultCurrentValue: 40 })]).component;
  const animations = Object.values(component._children.Animations._children);
  const sources = animations.map((animation) => animation.trigger.source).sort();
  assert.deepEqual(sources, ['channel.Range.normalized', 'channel.RangeEnd.normalized', 'channel.RangeStart.normalized']);
  const start = animations.find((animation) => animation.trigger.source === 'channel.RangeStart.normalized');
  assert.ok(start.targets.some((target) => target.path === 'Parts.Range_startCap.Layout.offsetX'));
  assert.ok(!start.targets.some((target) => target.path === 'Parts.Range_endCap.Layout.offsetX'), 'only what the start moves');
});

test('a meter part coloured by the zones comes in as layers: by position each cell and the fill, by level a copy per zone', () => {
  const zones = [{ from: 0, colour: 'FF39D98A' }, { from: 0.6, colour: 'FFFFC107' }, { from: 0.85, colour: 'FFFF3B30' }];
  // A set's meter, its part coloured by the zones as the Meter tab sets it.
  const withZones = (set, part, mode, extra = {}) => {
    const control = createControl('Meter', { Core: { id: 'm1', name: 'Level' }, Transform: { x: 0, y: 0, width: 200, height: 125 } });
    Object.assign(control._children.Meter, { zones, ...extra });
    control._children.Parts._children[part] = { ...(control._children.Parts._children[part] ?? {}), zoneColours: mode };
    return plan([control], set);
  };
  // Lit cells by position: each lit cell in the zone it sits in (Ember's ladder; stepped zones, so
  // each cell takes its zone's own colour).
  const lit = withZones('ember', 'indicator', 'position', { gradient: false });
  assert.ok(lit.ok, JSON.stringify(lit.refused));
  const litColours = new Set(Object.values(lit.component._children.Parts._children)
    .filter((part) => /indicator\d+lit$/.test(part.name)).map((part) => part._children.Background._children.Fill.colour));
  for (const zone of zones) assert.ok(litColours.has(zone.colour), `a lit cell in ${zone.colour}`);
  // A fill by position: the box in the zones' gradient, shown through a mask as wide as the reading.
  const fill = withZones('graphite-studio', 'indicator', 'position');
  assert.ok(fill.ok, JSON.stringify(fill.refused));
  const fillLayer = Object.values(fill.component._children.Parts._children).find((part) => part.mask);
  assert.ok(fillLayer?._children.Background._children.Fill.gradientEnabled);
  assert.ok(Object.values(fill.component._children.Bindings._children).some((binding) => binding.target === `Parts.${fillLayer.name}.mask.width`));
  // A needle by level, stepped: a copy in each zone's colour, each shown inside its zone.
  const needle = withZones('tolex', 'indicator', 'level', { gradient: false });
  assert.ok(needle.ok, JSON.stringify(needle.refused));
  const bands = Object.values(needle.component._children.Bindings._children).filter((binding) => /InZone$/.test(binding.name));
  assert.deepEqual(bands.map((binding) => [binding.inputMin, binding.band]), [[0, true], [0.6, true], [0.85, true]]);
  // Still refused, by name: blended level colour on lit cells.
  assert.match(withZones('ember', 'indicator', 'level').refused?.[0]?.reason ?? '', /blended/);
});

test('the designer shows and edits what ranges and decibel meters made as layers use', () => {
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  const bindings = read('sections/BindingsEditor.svelte');
  // Combine: a binding sets its target or adds to what the bindings before it wrote.
  assert.match(bindings, /label="Combine"[\s\S]*?value=\{selectedBinding\.add === true \? 'add' : 'set'\}[\s\S]*?setBindingProp\('add', e\.target\.value === 'add'\)/);
  // Scale: linear or decibels, with the decibel scale's floor and ceiling.
  assert.match(bindings, /label="Scale"[\s\S]*?setBindingProp\('scale', e\.target\.value === 'db' \? 'db' : ''\)/);
  assert.match(bindings, /\{#if selectedBinding\.scale === 'db'\}[\s\S]*?setBindingProp\('dbFloor', value\)[\s\S]*?setBindingProp\('dbCeil', value\)/);
  const interact = read('sections/CustomInteractEditor.svelte');
  // Measured in: the behaviour's frame, its grab area or the whole component.
  assert.match(interact, /<em>Measured in<\/em>[\s\S]*?setBehaviorField\(behaviorName, 'frame', event\.currentTarget\.value === 'zone' \? 'zone' : ''\)/);
  // Takes: a grab area over several values names them.
  assert.match(interact, /\(zone\.targetValueChannels \?\? \[\]\)\.filter\(Boolean\)\.length > 1[\s\S]*?<em>Takes<\/em>/);
});

test('a meter that shows another control\'s value shows it as layers: the knob it came in with, or a panel control', async () => {
  const { resolveInteractiveControl } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const { sourcedCustomValues } = await import('../src/CE_Application/utils/customComponentInteraction.js');
  const cutoff = knob({ Behavior: { min: 0, max: 200, defaultValue: 50, defaultCurrentValue: 50 } });
  const meterOn = (id) => {
    const meter = createControl('Meter', { Core: { id: 'm1', name: 'Level' }, Transform: { x: 200, y: 60, width: 200, height: 40 } });
    Object.assign(meter._children.Meter, { valueSourceId: id, showValue: true });
    return meter;
  };
  // Both in the selection: the meter's value follows the knob's inside the component.
  const together = plan([cutoff, meterOn('k1')]);
  assert.ok(together.ok, JSON.stringify(together.refused));
  const level = together.component._children.ValueChannels._children.Level;
  assert.equal(level.valueSource, 'channel:Cutoff');
  // Over the knob's range, as the panel's meter is while the knob drives it; where nothing drives
  // it, at the meter's own test value (0.75 of the way), as the panel's stands in the editor.
  const own = createControl('Meter')._children.Meter;
  const fraction = (Number(own.value) - Number(own.valueMin ?? 0)) / (Number(own.valueMax ?? 1) - Number(own.valueMin ?? 0));
  assert.deepEqual([level.min, level.max, level.defaultValue], [0, 200, fraction * 200]);
  const drawn = resolveInteractiveControl(together.component, { customValues: { Cutoff: 150 } }).control._children.Parts._children;
  const readout = Object.values(drawn).find((part) => part.name.startsWith('Level') && /readout/i.test(part.name));
  assert.equal(readout?._children?.Text?.content, '150');
  // The knob left on the panel: the meter's value names it, and the panel reads it there.
  const panel = { id: 'p', controlSet: { id: 'graphite' }, controlSets: [], controls: [cutoff, meterOn('k1')] };
  const outside = planComponentFromSelection(panel, ['m1'], { set: getControlSet('graphite'), name: 'T', valueControlsAs: 'layers' });
  assert.ok(outside.ok, JSON.stringify(outside.refused));
  const channel = outside.component._children.ValueChannels._children.Level;
  assert.equal(channel.valueSource, 'k1');
  assert.deepEqual([channel.min, channel.max, channel.defaultValue], [0, 200, fraction * 200]);
  const read = (id) => (id === 'k1' ? { value: 30, min: 0, max: 200 } : null);
  assert.equal(sourcedCustomValues(outside.component, {}, read).Level, 30);
  // A source that cannot be read leaves the value as it is.
  assert.equal(sourcedCustomValues(outside.component, { Level: 70 }, () => null).Level, 70);
});
