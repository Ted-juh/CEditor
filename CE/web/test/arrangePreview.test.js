// arrangePreview.test.js — the Values tab's row for an arrangement verb (ce.panel.align, distribute,
// match, grid, circle, flip) draws the named controls where they are and where the verb puts them
// (scripting/arrangePreview.js). What it draws is the verb's own plan (utils/arrangement.js's
// arrangementPlan, which the runtime applies), so this file runs each call through the runtime on
// the same panel and holds the row's "after" to where the controls really went, containers
// included; and the row says what the runtime says of a name that is not a control and of a `to`
// that is not one of the names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { arrangementView, labelFits } from '../src/CE_Application/scripting/arrangePreview.js';
import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const btn = (name, x, y, w = 40, h = 20) => createControl('Button', { name, Transform: { x, y, width: w, height: h } });

/** A panel with a nested control, made fresh each time: the runtime writes to the one it is given. */
function makePanel() {
  const inner = btn('inner', 5, 5, 30, 30);
  const box = createControl('Container', {
    name: 'box', Transform: { x: 300, y: 200, width: 200, height: 200 }, Children: { _children: { inner } },
  });
  return {
    id: 'p', name: 'P', width: 800, height: 600, scripting: { modules: ['ce.panel'] },
    controls: [btn('a', 10, 10), btn('b', 70, 40, 60, 30), btn('c', 200, 25, 20, 50), box, btn('far', 700, 500)],
  };
}

/** The arrangement the Values tab reads off `source`'s first call. */
function previewOf(source, language = 'lua', panel = makePanel()) {
  const statement = readStatement(source, language, 2, { panel });
  return { call: statement.calls[0], arrange: statement.calls[0].arrange };
}

/** Where the runtime puts each control when `run` calls the verb, panel coordinates. */
function runtimeRects(run, names) {
  const panel = makePanel();
  setRuntimeHost({ panel });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'arrange-preview');
    run(api);
    const said = get(scriptTrace).map((e) => e.message ?? e.text ?? '');
    return { rects: Object.fromEntries(names.map((n) => [n, api.panelRect(n)])), said };
  } finally {
    setRuntimeHost(null);
  }
}

const CASES = [
  ['ce.panel.align({ "a", "b", "c" }, "top")', (api) => api.panelAlign(['a', 'b', 'c'], 'top')],
  ['ce.panel.align({ "a", "b", "inner" }, "right", { to = "b" })', (api) => api.panelAlign(['a', 'b', 'inner'], 'right', { to: 'b' })],
  ['ce.panel.align({ "a", "inner" }, "vCenter")', (api) => api.panelAlign(['a', 'inner'], 'vCenter')],
  ['ce.panel.distribute({ "a", "b", "c" }, "hSpacing")', (api) => api.panelDistribute(['a', 'b', 'c'], 'hSpacing')],
  ['ce.panel.distribute({ "c", "a", "b" }, "vSpacing", { gap = 6, align = true })', (api) => api.panelDistribute(['c', 'a', 'b'], 'vSpacing', { gap: 6, align: true })],
  ['ce.panel.distribute({ "a", "b", "c", "inner" }, "hCenters")', (api) => api.panelDistribute(['a', 'b', 'c', 'inner'], 'hCenters')],
  ['ce.panel.match({ "a", "b", "c" }, "both", { to = "c" })', (api) => api.panelMatch(['a', 'b', 'c'], 'both', { to: 'c' })],
  ['ce.panel.match({ "b", "a" })', (api) => api.panelMatch(['b', 'a'])],
  ['ce.panel.grid({ "c", "b", "a", "inner" }, { columns = 2, gapX = 4, gapY = 8 })', (api) => api.panelGrid(['c', 'b', 'a', 'inner'], { columns: 2, gapX: 4, gapY: 8 })],
  ['ce.panel.grid({ "a", "b", "c" })', (api) => api.panelGrid(['a', 'b', 'c'])],
  ['ce.panel.circle({ "a", "b", "c", "inner" }, { radius = 50, startAngle = 90 })', (api) => api.panelCircle(['a', 'b', 'c', 'inner'], { radius: 50, startAngle: 90 })],
  ['ce.panel.flip({ "a", "b", "inner" }, "vertical")', (api) => api.panelFlip(['a', 'b', 'inner'], 'vertical')],
  ['ce.panel.flip({ "a", "c" })', (api) => api.panelFlip(['a', 'c'])],
];

test('the row draws each control where the runtime puts it, nested ones included', () => {
  for (const [source, run] of CASES) {
    const { arrange } = previewOf(source);
    assert.ok(arrange, `${source} has an arrangement`);
    const names = arrange.items.map((i) => i.name);
    const { rects } = runtimeRects(run, names);
    for (const item of arrange.items) {
      const r = rects[item.name];
      assert.deepEqual(item.after, { x: r.x, y: r.y, w: r.width, h: r.height }, `${source}: ${item.name}`);
    }
    const before = makePanel();
    setRuntimeHost({ panel: before });
    try {
      const api = scriptApiForTesting('', 'arrange-preview');
      for (const item of arrange.items) {
        const r = api.panelRect(item.name);
        assert.deepEqual(item.before, { x: r.x, y: r.y, w: r.width, h: r.height }, `${source}: ${item.name} before`);
        assert.equal(item.moved, JSON.stringify(item.before) !== JSON.stringify(item.after));
      }
    } finally {
      setRuntimeHost(null);
    }
  }
});

test('every language\'s list and options are read', () => {
  for (const [language, source] of [
    ['javascript', 'ce.panel.grid(["a", "b", "c"], { columns: 2 });'],
    ['typescript', 'ce.panel.grid(["a", "b", "c"], { columns: 2 });'],
    ['python', 'ce.panel.grid(["a", "b", "c"], {"columns": 2})'],
  ]) {
    const { arrange } = previewOf(source, language);
    assert.deepEqual(arrange?.items.map((i) => i.name), ['a', 'b', 'c'], language);
    const { rects } = runtimeRects((api) => api.panelGrid(['a', 'b', 'c'], { columns: 2 }), ['a', 'b', 'c']);
    for (const item of arrange.items) assert.equal(item.after.x, rects[item.name].x, `${language}: ${item.name}`);
  }
});

test('it says what moves, what stays, and when nothing does', () => {
  assert.equal(previewOf('ce.panel.align({ "a", "b", "c" }, "top")').arrange.said, 'Moves 2 of 3; "a" stays where it is.');
  assert.equal(previewOf('ce.panel.match({ "a", "b", "c" }, "both", { to = "c" })').arrange.said, 'Resizes 2 of 3; "c" keeps its size.');
  assert.equal(previewOf('ce.panel.align({ "a", "a" }, "left")').arrange.said, 'Nothing moves: they are already where it puts them.');
  assert.equal(previewOf('ce.panel.flip({ "a" }, "vertical")').arrange.said,
    'ce.panel.flip needs at least two controls, and only "a" is one, so nothing moves.');
  const key = previewOf('ce.panel.match({ "a", "b", "c" }, "width", { to = "c" })').arrange;
  assert.deepEqual(key.items.filter((i) => i.key).map((i) => i.name), ['c'], 'the control the others take their size from');
});

test('a name that is not a control and a `to` that is not one of the names are said in the runtime\'s words', () => {
  const { call, arrange } = previewOf('ce.panel.align({ "a", "b", "ghost" }, "left")');
  const { said } = runtimeRects((api) => api.panelAlign(['a', 'b', 'ghost'], 'left'), []);
  assert.ok(said.some((m) => call.problem.message.startsWith(m)), `the runtime said ${JSON.stringify(said)}`);
  assert.equal(call.problem.severity, 'warning');
  assert.deepEqual(arrange.items.map((i) => i.name), ['a', 'b'], 'the others still move');

  const refused = previewOf('ce.panel.align({ "a", "b" }, "left", { to = "c" })');
  const to = refused.call.args.find((a) => a.param?.name === 'opts').options.find((o) => o.name === 'to');
  const ran = runtimeRects((api) => api.panelAlign(['a', 'b'], 'left', { to: 'c' }), ['a', 'b']);
  assert.deepEqual(to.problem, { severity: 'error', message: ran.said.at(-1) });
  assert.equal(refused.arrange.said, 'Nothing moves.');
  assert.ok(refused.arrange.items.every((i) => !i.moved));

  const matched = previewOf('ce.panel.match({ "a", "b" }, "both", { to = "zz" })');
  const ranMatch = runtimeRects((api) => api.panelMatch(['a', 'b'], 'both', { to: 'zz' }), []);
  assert.equal(matched.call.args.find((a) => a.param?.name === 'opts').options.find((o) => o.name === 'to').problem.message, ranMatch.said.at(-1));
});

test('nothing is drawn for what is not known until it runs', () => {
  for (const source of [
    'ce.panel.align(pads, "left")',
    'ce.panel.align({ "a", name }, "left")',
    'ce.panel.align({ "a", "b" }, edge)',
    'ce.panel.grid({ "a", "b" }, { columns = n })',
    'ce.panel.align({ "a", "b" }, "sideways")',
  ]) {
    assert.equal(previewOf(source).arrange, undefined, source);
  }
  // …nor with no panel to read the controls off.
  assert.equal(readStatement('ce.panel.align({ "a", "b" }, "left")', 'lua', 2, {}).calls[0].arrange, undefined);
});

test('the map holds every box before and after, the others that fall in it, and align\'s line', () => {
  const { arrange } = previewOf('ce.panel.align({ "a", "b", "c" }, "top")');
  const view = arrangementView(arrange, { maxW: 200, maxH: 110 });
  const [vx, vy, vw, vh] = view.viewBox.split(' ').map(Number);
  for (const item of arrange.items) {
    for (const b of [item.before, item.after]) {
      assert.ok(b.x >= vx && b.y >= vy && b.x + b.w <= vx + vw && b.y + b.h <= vy + vh, `${item.name} is in view`);
    }
  }
  assert.ok(view.width <= 200 && view.height <= 110 && (view.width === 200 || view.height === 110), 'fitted to the room');
  assert.deepEqual([view.line.y1, view.line.y2], [10, 10], 'the top edge the group lines up on');
  assert.ok(view.line.x1 <= vx && view.line.x2 >= vx + vw, 'across the whole map');
  assert.deepEqual(view.others.map((o) => o.name), [], '"far" and the container lie outside the map');

  // "far" goes up beside "a", across the panel: the map spans both, and what lies between is drawn.
  const grid = previewOf('ce.panel.grid({ "a", "far" }, { columns = 2, gapX = 300 })').arrange;
  assert.deepEqual(arrangementView(grid).others.map((o) => o.name).sort(), ['b', 'box', 'c', 'inner'], 'the controls the grid lands among');
  assert.equal(arrangementView(grid).line, null, 'only align has a line');
  assert.equal(labelFits('a', { w: 40, h: 20 }, 1), true);
  assert.equal(labelFits('a very long name', { w: 40, h: 20 }, 1), false);
});
