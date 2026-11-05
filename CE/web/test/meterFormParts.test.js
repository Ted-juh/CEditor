// The meter forms become the meter's own parts (docs/design/changeable-control-sets.md, piece B),
// as the knob, button and switch forms did.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { readControlPath, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { EDITOR_PATHS } from '../src/CE_Application/models/controlSetDesigns.js';
import { CONTROL_FORMS, FORM_SETS, setAnatomy } from '../src/CE_Application/models/controlAnatomy.js';
import { METER_DEVICE_PARTS, METER_DEVICE_TYPES, meterDeviceDrawn, meterNeedsPeak } from '../src/CE_Application/models/meterDeviceParts.js';
import { METER_FORMS_AS_PARTS, meterFormFamily } from '../src/CE_Application/models/meterFormParts.js';
import { deviceShapePath, devicePatternCells } from '../src/CE_Application/utils/deviceShapes.js';
import { meterFigures, meterPartDrawing, meterScaleNumeral } from '../src/CE_Application/utils/meterParts.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { applyFormAsParts } from '../src/CE_Application/stores/controlSets.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
// A part in the recipes' terms: a box in % of the 160 by 100 frame, and its keys.
const part = (x, y, w, h, keys = {}) => ({
  visible: true,
  ...keys,
  _children: { Layout: { x: (x / 160) * 100, y: (y / 100) * 100, width: (w / 160) * 100, height: (h / 100) * 100, rotation: keys.rotation ?? 0 } },
});

test('the new shapes: an arch, a pinked tally and a pointer; columns lay cells edge to edge', () => {
  // The radio's cabinet: shoulders at 35, the top through 8.5.
  assert.equal(deviceShapePath('arch', 6, 8.5, 148, 75.5, { depth: 35.1 }), 'M6 84 V35 Q80 -18 154 35 V84 Z');
  // The tally: teeth 16 wide and 5 high from the left, the last half running out to the edge.
  const ticket = deviceShapePath('ticket', 5, 18, 150, 62, { depth: 8.0645 });
  assert.match(ticket, /^M5 23 L13 18 L21 23 /);
  assert.match(ticket, /L141 18 L155 23 L155 80 L5 80 Z$/);
  assert.equal(deviceShapePath('pointer', 3, 25, 14, 14), 'M3 25 L17 25 L10 39 Z');
  // Fifteen strokes four wide at a nine pitch, as the tally drew them.
  const strokes = devicePatternCells('columns', 13, 39, 130, 26, { count: 15, cellWidth: 44.444 });
  assert.equal(strokes.length, 15);
  assert.deepEqual([strokes[0].x, Math.round(strokes[0].w * 100) / 100, Math.round(strokes[14].x)], [13, 4, 139]);
  assert.deepEqual([strokes[3].col, strokes[3].cols], [3, 15]);
  // A button's grid and lines are as they were.
  assert.deepEqual(devicePatternCells('grid', 0, 0, 40, 10, { count: 3, rows: 1 })[1], { x: 15, y: 0, w: 10, h: 10, col: 1, cols: 3, row: 0, rows: 1 });
  assert.deepEqual(devicePatternCells('lines', 0, 0, 10, 40, { count: 2 })[1], { x: 0, y: 25, w: 10, h: 10, col: 0, cols: 1, row: 1, rows: 2 });
});

test('a part answers the reading: it fills, slides, swings or lights its cells', () => {
  const bar = meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill' }), { p: 0.5 });
  assert.equal(bar.paths[0].d, 'M8 34 L80 34 L80 64 L8 64 Z');
  const column = meterPartDrawing('indicator', part(55, 14, 50, 66, { motion: 'fill', fillFrom: 'bottom' }), { p: 0.5 });
  assert.equal(column.paths[0].d, 'M55 47 L105 47 L105 80 L55 80 Z');
  assert.deepEqual(meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill' }), { p: 0 }).paths, [], 'empty: nothing');
  const cursor = meterPartDrawing('marker', part(3, 25, 14, 14, { motion: 'slide', travelX: 87.5 }), { p: 0.5 });
  assert.equal(cursor.transform, 'translate(70 0)');
  const needle = meterPartDrawing('indicator', part(79, 30, 2, 50, { motion: 'swing', rotation: -65, swing: 130, pivotX: 50, pivotY: 100 }), { p: 0.5 });
  assert.equal(needle.transform, '', 'at half scale the needle stands upright');
  assert.equal(meterPartDrawing('indicator', part(79, 30, 2, 50, { motion: 'swing', rotation: -65, swing: 130, pivotX: 50, pivotY: 100 }), { p: 1 }).transform, 'rotate(65 80 80)');
  // Cells light up to the value, the first at the empty mark, as the forms lit them.
  const tally = meterPartDrawing('indicator', part(13, 39, 130, 26, { motion: 'light', pattern: 'columns', patternCount: 15, cellWidth: 44.444 }), { p: 0.5 });
  const count = (d) => (d.match(/M/g) ?? []).length;
  assert.deepEqual(tally.paths.map((path) => [path.role, count(path.d)]), [['base', 7], ['lit', 8]]);
});

test('a scale: major ticks with minor ones between, each its own length and width; an arc with its top fifth in the zone', () => {
  const ruler = meterPartDrawing('scale', part(10, 43, 140, 21, { pattern: 'ticks', majorCount: 5, minorCount: 4, majorLength: 100, minorLength: 42.86, majorWidth: 1, minorWidth: 1 }));
  const ticks = ruler.paths[0].d.split(' M').length;
  assert.equal(ticks, 21);
  assert.match(ruler.paths[0].d, /^M9\.5 43 H10\.5 V64 H9\.5 Z M16\.5 55 H17\.5 V64/, 'a long tick, then a short one');
  const heavy = meterPartDrawing('scale', part(10, 43, 140, 21, { pattern: 'ticks', majorCount: 3, minorCount: 1, majorLength: 100, minorLength: 50, majorWidth: 2, minorWidth: 0.5 }));
  assert.match(heavy.paths[0].d, /^M9 43 H11 V64 H9 Z M44\.75 53\.5 H45\.25 V64/, 'each kind its own width and length');
  const vu = meterPartDrawing('scale', part(26, 26, 108, 108, { pattern: 'arc', majorCount: 11, minorCount: 0, swing: 130, majorLength: 12.96, majorWidth: 1.5, zoneFrom: 0.8 }));
  assert.deepEqual(vu.paths.map((path) => [path.role, path.d.split(' M').length]), [['base', 9], ['zone', 2]]);
  // The first tick stands straight up from the centre, 54 out and 7 long.
  assert.match(vu.paths[0].d, /^M80\.75 33 L80\.75 26 L79\.25 26 L79\.25 33 Z/);
});

test('a legend says its words, the percentage, or the figures one to a cell', () => {
  assert.deepEqual(meterPartDrawing('legend', part(13, 47, 134, 10, { legendText: 'VU', fontSize: 10 })).texts, [{ x: 80, y: 57, text: 'VU', size: 10 }]);
  assert.equal(meterPartDrawing('legend', part(28, 36, 104, 24, { textSource: 'percent', fontSize: 24 }), { p: 0.625 }).texts[0].text, '63');
  assert.equal(meterFigures(0.6249, 2), '0.62');
  assert.equal(meterFigures(12.5, 9), '12.500', 'three places at most');
  const counter = meterPartDrawing('legend', part(8, 29, 141, 33, { pattern: 'digits', cellWidth: 92, textSource: 'value', fontSize: 33 }), { figures: '0.62' });
  assert.deepEqual(counter.texts.map((text) => text.text), ['0', '.', '6', '2']);
  assert.equal(counter.texts[0].y, 62);
  assert.ok(counter.texts[3].x > 130 && counter.texts[3].x < 135, `the last figure in the last cell: ${counter.texts[3].x}`);
  const wheels = meterPartDrawing('face', part(8, 27, 141, 48, { pattern: 'digits', cellWidth: 92 }), { figures: '0.62' });
  assert.equal(wheels.paths[0].d.split(' M').length, 4, 'a wheel per figure');
});

test('every meter has the nine parts, hidden, so it draws as it always did', () => {
  for (const type of METER_DEVICE_TYPES) {
    const control = createControl(type);
    const parts = control._children.Parts._children;
    assert.deepEqual(Object.keys(parts), METER_DEVICE_PARTS, type);
    for (const name of METER_DEVICE_PARTS) assert.equal(parts[name].visible, false, `${type}.${name}`);
    assert.equal(meterDeviceDrawn(control), false, type);
  }
  const vu = resolveControlForSet(createControl('Meter'), getControlSet('console'));
  assert.equal(meterDeviceDrawn(vu), true, 'Console draws its studio needle with parts');
  vu._children.Core.controlForm = 'original';
  assert.equal(meterDeviceDrawn(vu), false, '"Original parts" is the meter of its own');
  const [a, b] = [createControl('Meter'), createControl('Meter')];
  a._children.Parts._children.indicator.visible = true;
  assert.equal(b._children.Parts._children.indicator.visible, false, 'two meters do not share one parts object');
});

test('every recipe writes only what a set may write, and lands on a factory meter', () => {
  assert.deepEqual(METER_FORMS_AS_PARTS, CONTROL_FORMS.Meter.slice(0, 12).map(([id]) => id));
  for (const type of ['Meter', 'ProgressBar']) {
    for (const form of METER_FORMS_AS_PARTS) {
      const family = meterFormFamily(type, form, { face: 'FF333333' });
      for (const path of Object.keys(family.component)) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${path}`);
      for (const [name, patch] of Object.entries(family.parts)) {
        assert.ok(METER_DEVICE_PARTS.includes(name), `${form}: ${name} is a part`);
        for (const path of Object.keys(patch)) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${name}.${path}`);
      }
      const drawn = resolveControlForSet(createControl(type), { ...getControlSet('graphite'), id: `test-${form}`, families: { [type]: family } });
      assert.equal(meterDeviceDrawn(drawn), true, `${form}: drawn with its parts`);
      for (const [name, patch] of Object.entries(family.parts)) {
        for (const path of Object.keys(patch)) assert.notEqual(readControlPath(drawn, `Parts.${name}.${path}`), undefined, `${form}: ${name}.${path} lands`);
      }
    }
  }
  assert.equal(meterFormFamily('Meter', 'new-studio'), null, 'a direction form is still drawn by code');
  assert.equal(meterFormFamily('Knob', 'vu'), null, 'a knob is not a meter');
  // The needle scale takes the divisions the set gave the form.
  assert.equal(meterFormFamily('Meter', 'vu', { divisions: 24 }).parts.scale.majorCount, 25);
  // The capsule's sheen runs through the face's colour where it is known, and over it where not.
  assert.equal(meterFormFamily('Meter', 'capsule', { face: 'FF123456' }).parts.cover['Background.Fill.gradient'].stops[1].color, 'FF123456');
  assert.equal(meterFormFamily('Meter', 'capsule').parts.cover['Background.Fill.colour'], '{surface}');
});

test('the sets that drew these forms draw them with parts, and name no form', () => {
  let drawn = 0;
  for (const id of FORM_SETS.slice(0, 12)) {
    const set = getControlSet(id);
    if (!set || !setAnatomy('Meter', id)) continue;
    const control = resolveControlForSet(createControl('Meter'), set);
    if (!meterDeviceDrawn(control)) continue;
    assert.equal(control._children.Core.controlForm || '', '', `${id}: no form`);
    drawn += 1;
  }
  assert.ok(drawn >= 10, `${drawn} sets' meters are drawn with parts`);
  // Console: the studio needle, its case edge the set's ink a little through.
  const parts = resolveControlForSet(createControl('Meter'), getControlSet('console'))._children.Parts._children;
  assert.equal(parts.indicator.motion, 'swing');
  assert.equal(parts.legend.legendText, 'VU');
  assert.match(parts.housing._children.Background._children.Border.colour, /^59[0-9A-F]{6}$/i);
  // Machined: the instrument dial, at 24 divisions.
  assert.equal(resolveControlForSet(createControl('Meter'), getControlSet('machined'))._children.Parts._children.scale.majorCount, 25);
});

test('Convert to Parts on a meter writes the parts in one step and turns off the rest', () => {
  panels.set([{ id: 'meters', name: 'Meters', width: 400, height: 300, controlSet: { id: 'console' }, controlSets: [],
    controls: [createControl('Meter', { Core: { id: 'm1', controlForm: 'vu' } })] }]);
  activePanelId.set('meters');
  try {
    assert.equal(applyFormAsParts(['m1'], 'counter'), 1);
    let meter = get(panels)[0].controls[0];
    assert.equal(meter._children.Core.controlForm, '');
    assert.equal(meter._children.Parts._children.legend.textSource, 'value');
    assert.equal(meter._children.Parts._children.indicator.visible, false, 'a counter has no indicator');
    assert.equal(meterDeviceDrawn(meter), true, 'the figures are enough');
    // Pinned: Console's own needle does not draw over it.
    assert.equal(resolveControlForSet(meter, getControlSet('console'))._children.Parts._children.indicator.visible, false);
    // Then the bar: the counter's figures go, the needle's swing does not linger.
    assert.equal(applyFormAsParts(['m1'], 'bar'), 1);
    meter = get(panels)[0].controls[0];
    assert.equal(meter._children.Parts._children.legend.visible, false);
    assert.equal(meter._children.Parts._children.indicator.motion, 'fill');
  } finally {
    panels.set([]);
    activePanelId.set(null);
  }
});

test('the form frame draws a meter\'s parts and its readout, and the canvas treats them as a form', () => {
  const anatomy = source('editor/ControlAnatomy.svelte');
  assert.match(anatomy, /\{:else if meter && meterPartsDrawn\}\s*<MeterDeviceParts /);
  assert.match(anatomy, /data-form=\{partsDrawn \|\| meterPartsDrawn \? 'parts' : form\}/);
  const canvas = source('editor/CanvasControl.svelte');
  assert.match(canvas, /buttonDeviceDrawn\(renderControl\) \|\| meterDeviceDrawn\(renderControl\)/);
  assert.match(canvas, /METER_DEVICE_TYPES\.has\(String\(core\?\.controlType \?\? ''\)\)\s*\? renderPartEntries\.filter\(\(\[partName\]\) => !isMeterDevicePart\(partName\)\)/);
});

const ZONES = { zones: [{ from: 0, colour: 'FF39D98A' }, { from: 0.7, colour: 'FFF2C94C' }, { from: 0.9, colour: 'FFEB5757' }], gradient: false };

test('colour zones: a fill by position, lit cells and ticks in the zone they sit in, a needle by level', () => {
  const bar = meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill', zoneColours: 'position' }), { p: 0.82, meter: ZONES });
  // Stepped: green to 70%, amber to 90%, red from there, across the whole box.
  assert.deepEqual(bar.zoneFill, { x1: 8, y1: 34, x2: 152, y2: 34, stops: [
    { offset: 0, colour: 'FF39D98A' }, { offset: 0.7, colour: 'FF39D98A' }, { offset: 0.7, colour: 'FFF2C94C' },
    { offset: 0.9, colour: 'FFF2C94C' }, { offset: 0.9, colour: 'FFEB5757' }] });
  assert.equal(meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill', zoneColours: 'position' }), { p: 0.5, meter: { ...ZONES, gradient: true } }).zoneFill.stops.length, 3, 'blended');
  const ladder = meterPartDrawing('indicator', part(10, 10, 20, 80, { motion: 'light', lightFrom: 'bottom', pattern: 'lines', patternCount: 10, zoneColours: 'position' }), { p: 0.95, meter: ZONES });
  assert.deepEqual(ladder.paths.filter((path) => path.role === 'lit').map((path) => [path.colour, path.d.split(' M').length]),
    [['FFEB5757', 1], ['FFF2C94C', 2], ['FF39D98A', 7]], 'lit from the foot: seven green, two amber, the top one red');
  const needle = meterPartDrawing('indicator', part(79, 30, 2, 50, { motion: 'swing', swing: 130, rotation: -65, pivotY: 100, zoneColours: 'level' }), { p: 0.95, meter: ZONES });
  assert.equal(needle.paths[0].colour, 'FFEB5757', 'past 90%: red');
  const ticks = meterPartDrawing('scale', part(10, 43, 140, 21, { pattern: 'ticks', majorCount: 11, zoneColours: 'position' }), { meter: ZONES });
  assert.deepEqual(ticks.paths.map((path) => [path.colour, path.d.split(' M').length]), [['FF39D98A', 7], ['FFF2C94C', 2], ['FFEB5757', 2]]);
  assert.equal(meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill' }), { p: 0.82, meter: ZONES }).zoneFill, null, 'off: its own colour');
});

test('a part can follow the held peak, and a clip lamp lights at its level while the peak holds', () => {
  const peakLine = meterPartDrawing('marker', part(9.5, 25, 1, 50, { motion: 'slide', travelX: 87.5, source: 'peak' }), { p: 0.2, peak: 0.6 });
  assert.equal(peakLine.transform, 'translate(84 0)', 'at the peak, not the reading');
  assert.equal(meterPartDrawing('marker', part(9.5, 25, 1, 50, { motion: 'slide', travelX: 87.5, source: 'peak' }), { p: 0.3 }).transform, 'translate(42 0)', 'no peak kept: the reading');
  const lamp = (p, peak) => meterPartDrawing('lamp', part(140, 5, 10, 10, { motion: 'clip', clipFrom: 0.9, shape: 'ellipse' }), { p, peak }).paths[0].role;
  assert.equal(lamp(0.95, 0.95), 'lit');
  assert.equal(lamp(0.4, 0.93), 'lit', 'held after the reading drops');
  assert.equal(lamp(0.4, 0.5), 'base');
  const lit = meterPartDrawing('lamp', part(140, 5, 10, 10, { motion: 'clip', clipFrom: 0.9, zoneColours: 'level' }), { p: 0.95, meter: ZONES });
  assert.equal(lit.paths[0].colour, 'FFEB5757', 'by level: the red zone');
});

test('fills from any edge; numerals on the major ticks, in the reading, decibels or percent', () => {
  const right = meterPartDrawing('indicator', part(8, 34, 144, 30, { motion: 'fill', fillFrom: 'right' }), { p: 0.25 });
  assert.equal(right.paths[0].d, 'M116 34 L152 34 L152 64 L116 64 Z');
  const top = meterPartDrawing('indicator', part(55, 14, 50, 66, { motion: 'fill', fillFrom: 'top' }), { p: 0.5 });
  assert.equal(top.paths[0].d, 'M55 14 L105 14 L105 47 L55 47 Z');
  const scale = meterPartDrawing('scale', part(10, 43, 140, 21, { pattern: 'ticks', majorCount: 3, numerals: true, numeralSize: 7 }), { meter: { valueMin: 0, valueMax: 10 } });
  assert.deepEqual(scale.labels.map((label) => label.text), ['0', '5', '10']);
  assert.equal(scale.labels[1].x, 80);
  assert.ok(scale.labels[1].y < 43, 'outside: above the ticks');
  assert.equal(meterScaleNumeral(1, 'db', { scale: 'db', dbFloor: -20, dbCeil: 3 }), '+3');
  assert.equal(meterScaleNumeral(0, 'db', {}), '-∞');
  assert.equal(meterScaleNumeral(0.5, 'db', {}), '-6');
  assert.equal(meterScaleNumeral(0.25, 'percent'), '25');
  // Round an arc turned -65°: its numerals stand upright where the turn puts them.
  const vu = meterPartDrawing('scale', part(26, 26, 108, 108, { pattern: 'arc', rotation: -65, swing: 130, majorCount: 3, numerals: true }), { meter: { valueMin: 0, valueMax: 2 } });
  assert.deepEqual(vu.labels.map((label) => label.text), ['0', '1', '2']);
  assert.equal(vu.labels[1].x, 80, 'the middle numeral straight above the centre');
  assert.ok(vu.labels[0].x < 80 && vu.labels[2].x > 80);
});

test('the clip lamp and a peak part make the preview keep the peak', () => {
  const meter = createControl('Meter');
  assert.equal(meterNeedsPeak(meter), false);
  meter._children.Parts._children.lamp.visible = true;
  meter._children.Parts._children.lamp.motion = 'clip';
  assert.equal(meterNeedsPeak(meter), true);
  assert.equal(meter._children.Parts._children.lamp.activeColour, '{accent.hot}', 'a lamp lights in the set\'s hot accent');
  assert.match(source('editor/PanelPreviewSurface.svelte'), /if \(meter\.peakHold === true \|\| meterNeedsPeak\(base\)\)/);
});

test('the Meter tab edits every part, each field naming its property, beside the meter\'s own zones and peak', () => {
  const tab = source('sections/MeterEditor.svelte');
  assert.match(tab, /<MeterPartsEditor \{control\} \/>/);
  // While parts draw it, the plain meter's orientation, fill, arc, ticks and marker colour go.
  assert.match(tab, /let partsMode = \$derived\(!anatomyForm\(core\?\.controlType, core\?\.controlForm\) && meterDeviceDrawn\(control\)\);/);
  assert.match(tab, /\{#if !partsMode\}\s*<PropertySection title="Fill"/);
  assert.match(tab, /without\(METER_READOUT_FIELDS, \['showTicks', 'tickCount'\]\)/);
  // Its reading and caption are Labels of its own: the tab's Labels section adds them.
  assert.match(tab, /<AttachedLabelsEditor \{control\} \/>/);
  // The zones in %, Steps or Blend between them.
  assert.match(tab, /<PropertySection title="Colour Zones"/);
  assert.match(tab, /updateZone\(i, 'from', Math\.max\(0, Math\.min\(100, Number\(v\) \|\| 0\)\) \/ 100\)/);
  assert.match(tab, /aria-label="Between zones" value=\{m\.gradient === false \? 'steps' : 'blend'\}/);
  const editor = source('sections/MeterPartsEditor.svelte');
  assert.match(editor, /\{#each METER_DEVICE_PARTS as name \(name\)\}/);
  assert.match(editor, /name === 'lamp' \? 'Clip Lamp'/);
  const keys = ['visible', 'shape', 'shapeDepth', 'Background.Corners.radius', 'pattern', 'patternCount', 'patternRows', 'cellWidth', 'cellHeight',
    'motion', 'source', 'Layout.rotation', 'swing', 'fillFrom', 'lightFrom', 'travelX', 'travelY', 'clipFrom', 'activeOpacity', 'activeColour',
    'pivotX', 'pivotY', 'zoneColours', 'majorCount', 'minorCount', 'majorLength', 'minorLength', 'majorWidth', 'minorWidth', 'zoneFrom',
    'numerals', 'numeralSize', 'numeralPlacement', 'numeralUnits', 'Layout.x', 'Layout.y', 'Layout.width', 'Layout.height', 'zIndex',
    'Background.Fill.solidEnabled', 'opacity', 'Background.Effects.Material.kind', 'Background.Border.thickness', 'Background.Fill.gradientEnabled',
    'textSource', 'legendText', 'fontSize', 'fontFamily'];
  for (const key of keys) assert.ok(editor.includes(`path={\`\${prefix}.${key}\`}`), key);
  for (const key of ['Background.Fill.colour', 'Background.Border.colour', 'activeColour']) assert.ok(editor.includes(`\`\${prefix}.${key}\``), key);
  const cells = editor.match(/<PropertyCell /g).length;
  assert.equal((editor.match(/<PropertyCell [^>]*(path=|\{path\})/g) ?? []).length, cells, 'every cell names its path');
  // Colours through the Colors dock, a gradient through the Gradient dock; no picker of their own.
  assert.doesNotMatch(editor, /type="color"/);
  assert.match(editor, /openFillGradientEditor\(\{/);
  assert.match(source('panels/sectionEditorLoaders.js'), /meter: \(\) => import\('\.\.\/sections\/MeterEditor\.svelte'\)/);
});

test('a clip lamp starts as one: round, in the top right corner, lit in the set\'s hot accent', () => {
  const lamp = createControl('Meter')._children.Parts._children.lamp;
  assert.deepEqual([lamp.shape, lamp.motion, lamp.clipFrom, lamp.activeColour], ['ellipse', 'clip', 0.9, '{accent.hot}']);
  assert.deepEqual([lamp._children.Layout.x, lamp._children.Layout.y, lamp._children.Layout.width, lamp._children.Layout.height], [87.5, 6, 6.25, 10]);
  // Minor ticks added to a needle scale come out shorter than its majors.
  const scale = meterFormFamily('Meter', 'vu').parts.scale;
  assert.ok(scale.minorLength < scale.majorLength);
});
