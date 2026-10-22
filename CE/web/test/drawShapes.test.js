// drawShapes.test.js — where a ce.draw shape lands on the control it is drawn on: what the runtime
// says of one that lies wholly outside it and of a coordinate that is not a number, and the Values
// row that draws the shape on the control's outline and says the same.
//
// A drawing is clipped at the control's box, so a shape at 5000, 5000 on a 100 x 100 knob was drawn
// and showed nothing, without a word; and a coordinate was read with Number(x) || 0, so "fast" was
// 0 and true was 1, without a word either.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { commandBounds, outsideWords, shapeOutline, polygonPoints, curvePathData } from '../src/CE_Application/scripting/drawShapes.js';
import { drawingFor } from '../src/CE_Application/stores/scriptDraw.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';

const ONCE = ' This is said only the first time.';

/** A 100 x 100 knob, a runtime drawing on it, and what `fn` makes it say. */
function run(fn) {
  resetScriptStateForTesting();
  const knob = createControl('Knob', { name: 'K' });
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [knob], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    fn(scriptApiForTesting('K', 'draw-probe'));
    return { panel, lines: get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error').map((t) => t.message) };
  } finally { setRuntimeHost(null); }
}
const PANEL = { controls: [createControl('Knob', { name: 'K' })] };
const callOf = (src, ctx = { panel: PANEL, selfControl: 'K' }) => readStatement(src, 'lua', src.indexOf('(') + 1, ctx).calls[0];

test('a size below 0 is 0 and said once; a required argument left out is rejected', () => {
  // Both were silent: a rect -10 wide drew nothing, and drawRect(0, 0) drew a 0 × 0 rect at the
  // corner. The owner's two decisions on ce.draw.rect, for every shape command.
  const { lines } = run((api) => {
    assert.equal(api.drawRect(0, 0, -10, 5), true);
    api.drawRect(0, 0, -10, 5);
    api.drawCircle(5, 5, -3);
    assert.equal(api.drawRect(0, 0), false);
    assert.equal(api.drawCircle(5, 5), false);
    assert.equal(api.drawLine(0, 0, 10), false);
    assert.equal(api.drawArc(5, 5, 4, 0), false);
    assert.equal(api.drawEllipse(5, 5, 4), false);
    assert.equal(api.drawPolygon(5, 5, 4), false);
    assert.equal(api.drawText(0, 10), false);
    assert.equal(api.drawPixelText('A', 0), false);
    assert.equal(api.drawImage('data:image/png;base64,AAAA', 0, 0, 10), false);
  });
  assert.deepEqual(lines, [
    `ce.draw.rect: w is -10, which is less than 0, so 0 was used.${ONCE}`,
    `ce.draw.circle: r is -3, which is less than 0, so 0 was used.${ONCE}`,
    'ce.draw.rect: w was not given, so nothing was drawn.',
    'ce.draw.circle: r was not given, so nothing was drawn.',
    'ce.draw.line: y2 was not given, so nothing was drawn.',
    'ce.draw.arc: to was not given, so nothing was drawn.',
    'ce.draw.ellipse: ry was not given, so nothing was drawn.',
    'ce.draw.polygon: sides was not given, so nothing was drawn.',
    'ce.draw.text: text was not given, so nothing was drawn.',
    'ce.draw.pixelText: y was not given, so nothing was drawn.',
    'ce.draw.image: h was not given, so nothing was drawn.',
  ]);
});

test.after(() => resetScriptStateForTesting());

test('a shape wholly outside its control is said, once, and is still drawn', () => {
  const { lines } = run((api) => {
    api.drawRect(5000, 5000, 10, 10);
    api.drawRect(5000, 5000, 10, 10);
    api.drawCircle(-50, -50, 10);
    api.drawRect(10, 10, 20, 20);
    api.drawLine(0, 0, 10, 0);
  });
  assert.deepEqual(lines, [
    `ce.draw.rect: the shape at 5000, 5000, 10 × 10 lies wholly outside the control, which is 100 × 100, so none of it shows.${ONCE}`,
    `ce.draw.circle: the shape at -60, -60, 20 × 20 lies wholly outside the control, which is 100 × 100, so none of it shows.${ONCE}`,
  ], 'a line on the edge is half inside it, and says nothing');
  // Under a transform, where it lands is not known, so nothing is said.
  assert.deepEqual(run((api) => { api.drawTransform({ x: -5000, y: -5000 }); api.drawRect(5000, 5000, 10, 10); api.drawTransform({}); }).lines, []);
});

test('a coordinate that is not a number is 0, and said once', () => {
  const { lines } = run((api) => {
    api.drawRect('fast', 0, 10, 10);
    api.drawRect('fast', 0, 10, 10);
    api.drawLine(0, 0, 10, true);
    api.drawRect('12', 0, 10, 10);
  });
  assert.deepEqual(lines, [
    `ce.draw.rect: x is "fast", which is not a number, so 0 was used.${ONCE}`,
    `ce.draw.line: y2 is true, which is not a number, so 0 was used.${ONCE}`,
  ], 'text that is a number is one');
});

test('the bounds and outline of each shape', () => {
  assert.deepEqual(commandBounds({ op: 'rect', x: 10, y: 10, w: -5, h: 5 }), { x: 5, y: 10, w: 5, h: 5 }, 'a negative width counts back');
  assert.deepEqual(commandBounds({ op: 'line', x1: 0, y1: 10, x2: 30, y2: 0 }), { x: 0, y: 0, w: 30, h: 10 });
  assert.deepEqual(commandBounds({ op: 'path', points: polygonPoints(50, 50, 10, 4) }).w.toFixed(6), '20.000000');
  assert.equal(outsideWords('drawRect', { x: 100.4, y: 0, w: 5, h: 5 }, { w: 100, h: 100 }, 1), null, 'inside by half a stroke');
  assert.match(outsideWords('drawRect', { x: 101, y: 0, w: 5, h: 5 }, { w: 100, h: 100 }, 1), /lies wholly outside/);
  assert.equal(shapeOutline('drawRect', { x: 1, y: 2, w: 3, h: 4 }).d, 'M1 2h3v4h-3Z');
  assert.equal(shapeOutline('drawLine', { x1: 0, y1: 0, x2: 5, y2: 5 }).d, 'M0 0L5 5');
});

test('a drawing call\'s row draws the shape on the control\'s outline, and says what the runtime says', () => {
  const inside = callOf('ce.draw.rect(10, 10, 20, 20)');
  assert.deepEqual([inside.shape.d, inside.shape.box, inside.problem], ['M10 10h20v20h-20Z', { w: 100, h: 100 }, null]);
  const outside = callOf('ce.draw.rect(5000, 5000, 10, 10)');
  const said = run((api) => api.drawRect(5000, 5000, 10, 10)).lines[0];
  assert.deepEqual(outside.problem, { severity: 'warning', message: said.slice(0, -ONCE.length) });
  // A coordinate's own row says it is not a number, in the runtime's words.
  const fast = callOf('ce.draw.rect("fast", 0, 10, 10)').args.find((a) => a.name === 'x');
  assert.deepEqual(fast.problem, { severity: 'warning', message: 'ce.draw.rect: x is "fast", which is not a number, so 0 was used.' });
  assert.equal(callOf('ce.draw.rect(10, 0, 10, 10)').args.find((a) => a.name === 'x').editable, 'number', 'a coordinate is a field the row writes');
  // Each shape has its outline, and a path its points.
  for (const src of ['ce.draw.circle(30, 30, 10)', 'ce.draw.ellipse(30, 30, 10, 5)', 'ce.draw.arc(30, 30, 24, 135, 405)',
    'ce.draw.line(0, 0, 50, 50)', 'ce.draw.polygon(30, 30, 20, 5)', 'ce.draw.path({ 0, 0, 40, 20, 80, 0 }, true)']) {
    const call = callOf(src);
    assert.ok(call.shape?.d?.startsWith('M'), src);
    assert.equal(call.problem, null, src);
  }
  // A coordinate built from parts is not known until it runs: no shape, and nothing claimed.
  assert.equal(callOf('ce.draw.rect(x, 0, 10, 10)').shape, undefined);
  // A panel's script draws on no control the row knows: the shape, with no outline to put it on.
  const loose = callOf('ce.draw.rect(5000, 5000, 10, 10)', { panel: PANEL });
  assert.deepEqual([loose.shape.box, loose.problem], [null, null]);
});

test('points and a curve say an item that is not a point, a radius and a tension not used as given, once', () => {
  let drawn;
  const { panel, lines } = run((api) => {
    api.drawPoints([[10, 10], ['x', 1], [20, 20]], -2);
    api.drawPoints([[10, 10], ['x', 1]], -2);
    api.drawCurve([[0, 0], [50, 50], [90, 10]], { tension: 'smooth' });
    api.drawCurve([[0, 0], [50, 50]], { tension: 2 });
    api.drawPoints([[5000, 5000]]);
  });
  drawn = drawingFor(panel.controls[0]._children.Core.id);
  assert.deepEqual(lines, [
    'ce.draw.points: a list at position 2 of points is not a point, so it was left out.' + ONCE,
    'ce.draw.points: radius -2 is not above 0, so 1.5 was used.' + ONCE,
    'ce.draw.curve: tension "smooth" is not a number, so 0.5 was used.' + ONCE,
    'ce.draw.points: the shape at 4998.5, 4998.5, 3 × 3 lies wholly outside the control, which is 100 × 100, so none of it shows.' + ONCE,
  ], 'a tension past 1 is its nearest end, said with the first tension said; the second is not said again');
  // A tension that is not a number is 0.5: it was NaN, and the curve was not drawn.
  const curve = drawn.find((c) => c.op === 'curve');
  assert.equal(curve.tension, 0.5);
  assert.doesNotMatch(curvePathData(curve.points, curve.tension, false), /NaN/);
  assert.deepEqual(drawn.find((c) => c.op === 'dots').points, [[10, 10], [20, 20]]);
});

test('pixel text says a scale not used as given, a character with no glyph, and a coordinate that is not a number', () => {
  const { lines } = run((api) => {
    api.drawPixelText('A&B', 'fast', 0, 0.4);
    api.drawPixelText('A&B', 0, 0, 2.5);
    api.drawPixelText('OK', 0, 0);
  });
  assert.deepEqual(lines, [
    'ce.draw.pixelText: scale 0.4 is below 1, so 1 was used.' + ONCE,
    'ce.draw.pixelText: the pixel font has no glyph for "&", so nothing is drawn in its place.' + ONCE,
    'ce.draw.pixelText: x is "fast", which is not a number, so 0 was used.' + ONCE,
  ]);
  assert.deepEqual(commandBounds({ op: 'pixelText', text: 'AB', x: 1, y: 2, scale: 2 }), { x: 1, y: 2, w: 22, h: 14 }, 'two glyphs of 5, one gap of 1, at scale 2');
});

test('a clip that leaves the control nothing to draw in is said once, and clearing it says nothing', () => {
  assert.deepEqual(run((api) => { api.drawClip(0, 0, -20, 40); api.drawClip(0, 0, -20, 40); api.drawClip(); }).lines,
    ['ce.draw.clip: the clip is 0 × 40, so nothing drawn after it shows until ce.draw.clip() clears it.' + ONCE]);
  assert.deepEqual(run((api) => api.drawClip(500, 0, 40, 40)).lines,
    ['ce.draw.clip: the clip at 500, 0, 40 × 40 lies wholly outside the control, which is 100 × 100, so nothing drawn after it shows until ce.draw.clip() clears it.' + ONCE]);
  assert.deepEqual(run((api) => api.drawClip(10, 10, 40, 40)).lines, []);
});

test('the four new shapes are drawn under their call, and each argument says what the runtime says of it', () => {
  const said = (fn) => run(fn).lines.map((l) => l.slice(0, -ONCE.length));
  const pts = callOf('ce.draw.points({ {10, 10}, {"x", 1}, {20, 20} }, -2)');
  assert.ok(pts.shape.d.startsWith('M 8.5 10'), 'circles at the radius the runtime draws');
  const [itemSaid, radiusSaid] = said((api) => api.drawPoints([[10, 10], ['x', 1], [20, 20]], -2));
  assert.equal(pts.args.find((a) => a.name === 'points').problem.message, itemSaid);
  assert.equal(pts.args.find((a) => a.name === 'radius').problem.message, radiusSaid);

  const curve = callOf('ce.draw.curve({ {0, 0}, {50, 50} }, { tension = 2 })');
  assert.equal(curve.shape.d, curvePathData([[0, 0], [50, 50]], 1, false));
  const tension = curve.args.find((a) => a.name === 'opts').options.find((o) => o.name === 'tension');
  assert.deepEqual(tension.problem, { severity: 'warning', message: 'ce.draw.curve: tension 2 is outside 0 to 1, so 1 was used.' });

  const text = callOf('ce.draw.pixelText("A&B", 10, 10, 2)');
  assert.ok(text.shape.d.length > 0);
  assert.equal(text.args.find((a) => a.name === 'text').problem.message, 'ce.draw.pixelText: the pixel font has no glyph for "&", so nothing is drawn in its place.');

  const clip = callOf('ce.draw.clip(500, 0, 40, 40)');
  assert.equal(clip.problem.message, said((api) => api.drawClip(500, 0, 40, 40))[0]);
  assert.equal(callOf('ce.draw.clip()').shape, undefined, 'a clip cleared draws nothing');
  // Built from parts, a curve's options are not known: no shape, nothing claimed.
  assert.equal(callOf('ce.draw.curve({ {0, 0}, {50, 50} }, opts)').shape, undefined);
});

test('ce.panel.create\'s type is one of the types there are, refused in the runtime\'s words', () => {
  const row = (src) => callOf(src).args.find((a) => a.name === 'type');
  const knob = row('ce.panel.create("Knob", {})');
  assert.deepEqual([knob.kind, knob.editable, knob.problem, meaningLine(knob)], ['componentType', 'choice', null, 'made 100 × 100 unless props say otherwise']);
  assert.ok(knob.meaning.choices.includes('SplitZone'));
  const slip = row('ce.panel.create("knob", {})');
  const said = run((api) => api.ce.panel.create('knob', {})).lines[0];
  assert.deepEqual(slip.problem, { severity: 'error', message: said });
  assert.equal(meaningLine(slip), 'did you mean "Knob"?');
});

/* ---------------------------------------------------------------- the rest of ce.draw's edges */

test('gradient rejects stops left out, not a list, or fewer than two, and says an angle that is not a number once', () => {
  let got;
  const { lines } = run((api) => {
    got = [api.drawGradient(), api.drawGradient('red'), api.drawGradient(['#000']), api.drawGradient([]),
      api.drawGradient(['#000', '#fff'], 'x')?.angle, api.drawGradient(['#000', '#fff'], 'x')?.angle,
      api.drawGradient(['#000', '#fff'], '90')?.angle];
  });
  assert.deepEqual(got, [undefined, undefined, undefined, undefined, 180, 180, 90], 'text that is a number is read as one');
  assert.deepEqual(lines, [
    'ce.draw.gradient: stops was not given, so there is no gradient.',
    'ce.draw.gradient: stops is "red", not a list of colours, so there is no gradient.',
    'ce.draw.gradient: stops has one colour, and a gradient needs at least two, so there is no gradient.',
    'ce.draw.gradient: stops has no colours, and a gradient needs at least two, so there is no gradient.',
    'ce.draw.gradient: angle is "x", which is not a number, so 180 was used.' + ONCE,
  ]);
});

test('transform says an option that is not a number, and a centre half given, once', () => {
  let transforms;
  const { panel, lines } = run((api) => {
    api.drawTransform({ rotate: 45, cx: 5 });
    api.drawRect(0, 0, 10, 10);
    api.drawTransform({ rotate: 'x', scale: 'big', x: 'x', y: '5' });
    api.drawRect(0, 0, 10, 10);
    api.drawTransform({ rotate: 'x', cy: 5 });
    api.drawRect(0, 0, 10, 10);
    api.drawTransform({ rotate: 10, cx: 'a', cy: 2, scale: -1 });
    api.drawRect(0, 0, 10, 10);
  });
  transforms = drawingFor(panel.controls[0]._children.Core.id).map((c) => c.transform);
  assert.deepEqual(transforms, ['rotate(45)', 'translate(0 5)', null, 'rotate(10 0 2) scale(-1)']);
  assert.deepEqual(lines, [
    'ce.draw.transform: cx was given without cy, so the rotation is about the top-left corner.' + ONCE,
    'ce.draw.transform: x is "x", which is not a number, so 0 was used.' + ONCE,
    'ce.draw.transform: rotate is "x", which is not a number, so 0 was used.' + ONCE,
    'ce.draw.transform: scale is "big", which is not a number, so 1 was used.' + ONCE,
    'ce.draw.transform: cx is "a", which is not a number, so 0 was used.' + ONCE,
  ], 'the centre is said once for cx without cy and cy without cx alike');
});

test('a fit that is not one, a text size that cannot be used, and measure\'s size and scale are said once', () => {
  let measured;
  const { panel, lines } = run((api) => {
    const src = 'data:image/png;base64,AAAA';
    api.drawImage(src, 0, 0, 10, 10, { fit: 'COVER' });
    api.drawImage(src, 0, 0, 10, 10, { fit: 'stretch' });
    api.drawText(0, 10, 'a', { size: 0 });
    api.drawText(0, 10, 'a', { size: 'x' });
    api.drawText(0, 10, 'a', { size: '14' });
    measured = [api.drawMeasure(), api.drawMeasure('Hi', { size: 'x' }).height, api.drawMeasure('Hi', { pixel: true, scale: 0 }),
      api.drawMeasure(5).width > 0, api.drawMeasure('').width];
  });
  const drawn = drawingFor(panel.controls[0]._children.Core.id);
  assert.deepEqual(drawn.map((c) => c.fit ?? c.size), ['fill', 'fill', 12, 12, 14], 'text that is a number is read as one');
  assert.deepEqual(measured, [undefined, 12, { width: 11, height: 7, exact: true }, true, 0]);
  assert.deepEqual(lines, [
    'ce.draw.image: fit is "COVER", not "fill", "contain" or "cover", so "fill" was used.' + ONCE,
    'ce.draw.text: size 0 is not above 0, so 12 was used.' + ONCE,
    'ce.draw.measure: text was not given, so there is no result.',
    'ce.draw.measure: size "x" is not a number, so 12 was used.' + ONCE,
    'ce.draw.measure: scale 0 is below 1, so 1 was used.' + ONCE,
  ]);
});

test('polygon says sides below 3, a fraction or no number, and a rotation that is not a number, once', () => {
  const { panel, lines } = run((api) => {
    api.drawPolygon(5, 5, 4, 2);
    api.drawPolygon(5, 5, 4, 'x');
    api.drawPolygon(5, 5, 4, 5.5);
    api.drawPolygon(5, 5, 4, 6, { rotation: 'x' });
  });
  assert.deepEqual(drawingFor(panel.controls[0]._children.Core.id).map((c) => c.points.length), [3, 3, 6, 6]);
  assert.deepEqual(lines, [
    'ce.draw.polygon: sides 2 is below 3, so 3 was used.' + ONCE,
    'ce.draw.polygon: rotation is "x", which is not a number, so 0 was used.' + ONCE,
  ], 'sides is said once per call, so "x" and 5.5 are not said after 2');
  assert.deepEqual(run((api) => { api.drawPolygon(5, 5, 4, 'x'); api.drawPolygon(5, 5, 4, 5.5); }).lines,
    ['ce.draw.polygon: sides "x" is not a number, so 3 was used.' + ONCE]);
  assert.deepEqual(run((api) => api.drawPolygon(5, 5, 4, 5.5)).lines,
    ['ce.draw.polygon: sides 5.5 is not a whole number, so 6 was used.' + ONCE]);
});

test('grid says a count that wins over a spacing, a count or spacing it cannot use, and a box number that is not one', () => {
  const segments = (fn) => { const { panel, lines } = run(fn); return [drawingFor(panel.controls[0]._children.Core.id).map((c) => c.segments.length), lines]; };
  assert.deepEqual(segments((api) => { api.drawGrid({ step: 10, columns: 4 }); api.drawGrid({ step: 10, columns: 4 }); }),
    [[16, 16], ['ce.draw.grid: columns was given, so step was ignored across.' + ONCE]], '5 lines across from the count, 11 down from the step');
  assert.deepEqual(segments((api) => api.drawGrid({ rows: 2, stepY: 5, columns: 2, stepX: 5 })),
    [[6], ['ce.draw.grid: columns was given, so stepX was ignored across.' + ONCE, 'ce.draw.grid: rows was given, so stepY was ignored down.' + ONCE]]);
  assert.deepEqual(segments((api) => api.drawGrid({ columns: 2.5 })),
    [[4], ['ce.draw.grid: columns 2.5 is not a whole number, so 3 was used.' + ONCE]], 'a fraction of a column drew no closing line');
  assert.deepEqual(segments((api) => assert.equal(api.drawGrid({ rows: -1 }), false)),
    [[], ['ce.draw.grid: rows -1 is below 1, so it was ignored.' + ONCE, 'ce.draw.grid: needs a spacing or a count — { step }, { stepX, stepY } or { columns, rows }.']]);
  assert.deepEqual(segments((api) => api.drawGrid({ columns: 2, rows: 'x' })),
    [[3], ['ce.draw.grid: rows "x" is not a number, so it was ignored.' + ONCE]]);
  assert.deepEqual(segments((api) => assert.equal(api.drawGrid({ stepX: 0, stepY: 'y', step: 50 }), false)),
    [[], ['ce.draw.grid: stepX 0 is not above 0, so it was ignored.' + ONCE, 'ce.draw.grid: stepY "y" is not a number, so it was ignored.' + ONCE,
      'ce.draw.grid: needs a spacing or a count — { step }, { stepX, stepY } or { columns, rows }.']],
    'stepX and stepY are read where given, so step is not the fallback for one that cannot be used');
  assert.deepEqual(segments((api) => api.drawGrid({ width: 'w', height: -5, x: 'x', step: 50 })),
    [[2], ['ce.draw.grid: x is "x", which is not a number, so 0 was used.' + ONCE,
      'ce.draw.grid: width is "w", which is not a number, so 0 was used.' + ONCE,
      'ce.draw.grid: height is -5, which is less than 0, so 0 was used.' + ONCE]]);
});

test('path rejects points left out, not a list, or fewer than two, and says a pair that is not a point or an odd count once', () => {
  let got;
  const { panel, lines } = run((api) => {
    got = [api.drawPath(), api.drawPath('abc'), api.drawPath([]), api.drawPath([0, 0]),
      api.drawPath([0, 0, 10, 10, 20]), api.drawPath([0, 0, 'x', 1, 5, 5, 7], 'yes'), api.drawPath([0, 0, 10, 10], true)];
  });
  assert.deepEqual(got, [false, false, false, false, true, true, true]);
  assert.deepEqual(drawingFor(panel.controls[0]._children.Core.id).map((c) => [c.points, c.closed]),
    [[[[0, 0], [10, 10]], false], [[[0, 0], [5, 5]], false], [[[0, 0], [10, 10]], true]], 'closed is true or false, and anything else is false');
  assert.deepEqual(lines, [
    'ce.draw.path: points was not given, so nothing was drawn.',
    'ce.draw.path: points is "abc", not a list of numbers, so nothing was drawn.',
    'ce.draw.path: points has no points, and a path needs at least two, so nothing was drawn.',
    'ce.draw.path: points has one point, and a path needs at least two, so nothing was drawn.',
    'ce.draw.path: points has an odd number of values (5), so the last one was left out.' + ONCE,
    'ce.draw.path: point 2 of points ("x", 1) is not a point, so it was left out.' + ONCE,
  ]);
});

test('lines says an item that is not a segment once; batch, redraw, blend and clip reject what they cannot use', () => {
  let got;
  const { panel, lines } = run((api) => {
    got = [api.drawLines([[0, 0, 10, 10], [1, 2, 3], 'x', { x1: 1, y1: 1, x2: 2, y2: 2 }]), api.drawLines('abc'),
      api.drawBatch('x'), api.drawRedraw('nosuch'), api.drawBlend(), api.drawBlend('Multiply'),
      api.drawClip(0, 0), api.drawClip(0, 0, 10, 10), api.drawClip(0, 0, 10), api.drawClip()];
    api.drawRect(0, 0, 5, 5);
  });
  assert.deepEqual(got, [true, false, false, false, false, false, false, true, false, true]);
  const drawn = drawingFor(panel.controls[0]._children.Core.id);
  assert.deepEqual(drawn[0].segments, [[0, 0, 10, 10], [1, 1, 2, 2]]);
  assert.equal(drawn[1].clip, null, 'a clip half given leaves the clip as it was, and no arguments clears it');
  assert.deepEqual(lines, [
    'ce.draw.lines: a list at position 2 of segments is not a segment, so it was left out.' + ONCE,
    'ce.draw.lines: no segments. Pass a list of [x1, y1, x2, y2] — one command for all of them, which is the point of this over a loop of line().',
    'ce.draw.batch: fn is "x", not a function, so nothing ran.',
    'ce.draw.redraw: no control named "nosuch".',
    'ce.draw.blend: mode was not given, so the blend stays as it was.',
    'ce.draw.blend("Multiply"): not a blend mode. One of: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion.',
    'ce.draw.clip: w was not given, so the clip stays as it was.',
    'ce.draw.clip: h was not given, so the clip stays as it was.',
  ]);
});
