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
import { commandBounds, outsideWords, shapeOutline, polygonPoints } from '../src/CE_Application/scripting/drawShapes.js';

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
