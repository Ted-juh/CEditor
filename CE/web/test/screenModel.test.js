// screenModel.test.js — the Screen tab's model.
//
// The headline tests run the REAL renderer model. `placementIssue` claims that a zone past the last
// row never paints and that one past the last column paints clamped to the right edge; rather than
// trust that prose, the tests below feed the same zones to the shipped `composeLayout` and assert
// what actually comes out. If the placement rules in `lcdZones.js` ever change, these fail here
// rather than the tab quietly describing a screen nobody is looking at.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  SCREEN_SECTION_BY_KIND,
  SCREEN_KINDS,
  screenKindOf,
  screenSectionOf,
  screenGrid,
  layoutsOf,
  findScreenLayout,
  itemPathBase,
  itemRect,
  rectPatch,
  fitRect,
  placementIssue,
  placementIssues,
  unusedCells,
  reorderRules,
  liveRuleIndex,
  shadowedRuleIndex,
  itemFields,
  allScreenFieldLabels,
  cellGeometry,
  rectBox,
  pointToCell,
  renderedRect,
  offGridEdge,
} from '../src/CE_Application/utils/screenModel.js';
import { composeLayout, resolveActiveLayoutId } from '../src/CE_Application/utils/lcdZones.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const LCD_RENDERER = fileURLToPath(new URL('../src/CE_Application/editor/LcdDisplayRenderer.svelte', import.meta.url));

const zone = (over = {}) => ({ id: 'z', row: 1, colStart: 1, colEnd: 8, show: 'static', text: 'ABCDEFGH', align: 'left', ...over });
const element = (over = {}) => ({ id: 'e', kind: 'static', x: 0, y: 0, w: 30, h: 8, text: 'HI', ...over });
const lcdGrid = { unitsX: 16, unitsY: 2, unit: 'cell' };

// --- What the renderer really does ------------------------------------------

test('a zone past the last row never paints, exactly as the check says', () => {
  const off = zone({ row: 3, text: 'GHOST' });
  const issue = placementIssue(off, lcdGrid, 'lcd');
  assert.equal(issue.status, 'offGrid');

  const lines = composeLayout([off], 2, 16, () => null);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.trim() === ''), `the screen should be blank, got ${JSON.stringify(lines)}`);
});

test('a zone past the last column still paints, clamped to one cell at the right edge', () => {
  // This is the failure that reads as a rendering bug: the zone is not dropped, it is squeezed.
  const wide = zone({ row: 1, colStart: 20, colEnd: 28, text: 'RESONANCE' });
  const issue = placementIssue(wide, lcdGrid, 'lcd');
  assert.equal(issue.status, 'clipped');

  const lines = composeLayout([wide], 2, 16, () => null);
  assert.equal(lines[0].length, 16);
  assert.equal(lines[0].slice(0, 15).trim(), '', 'nothing should paint before the last column');
  assert.equal(lines[0][15], 'R', 'one character, hard against the right edge');
});

test('the repair the check offers actually clears it', () => {
  for (const bad of [zone({ row: 5 }), zone({ colStart: 20, colEnd: 28 }), zone({ colStart: -3, colEnd: 2 })]) {
    const issue = placementIssue(bad, lcdGrid, 'lcd');
    assert.ok(issue, 'expected an issue to repair');
    const repaired = { ...bad, row: issue.repair.y + 1, colStart: issue.repair.x + 1, colEnd: issue.repair.x + issue.repair.w };
    assert.equal(placementIssue(repaired, lcdGrid, 'lcd'), null, `still broken: ${JSON.stringify(repaired)}`);
  }
});

test('a zone that fits is not nagged at', () => {
  assert.equal(placementIssue(zone(), lcdGrid, 'lcd'), null);
  assert.equal(placementIssue(zone({ row: 2, colStart: 9, colEnd: 16 }), lcdGrid, 'lcd'), null);
});

test('placementIssues reports every offender with its index', () => {
  const issues = placementIssues([zone(), zone({ row: 9 }), zone({ colEnd: 99 })], lcdGrid, 'lcd');
  assert.deepEqual(issues.map((i) => i.index), [1, 2]);
  assert.deepEqual(issues.map((i) => i.status), ['offGrid', 'clipped']);
});

// --- Pixel elements ---------------------------------------------------------

const pixGrid = { unitsX: 128, unitsY: 64, unit: 'px' };

test('an element wholly outside the pixel screen is called out', () => {
  const issue = placementIssue(element({ x: 200, y: 0 }), pixGrid, 'pixel');
  assert.equal(issue.status, 'offGrid');
  assert.equal(placementIssue({ ...element(), ...issueRect(issue) }, pixGrid, 'pixel'), null);
});

test('an element hanging over the edge is a different fault from one off it', () => {
  const issue = placementIssue(element({ x: 120, w: 30 }), pixGrid, 'pixel');
  assert.equal(issue.status, 'clipped');
  assert.match(issue.message, /cut off/);
});

function issueRect(issue) {
  return { x: issue.repair.x, y: issue.repair.y, w: issue.repair.w, h: issue.repair.h };
}

test('fitRect keeps the size when it can and shrinks only when it must', () => {
  assert.deepEqual(fitRect({ x: 200, y: 0, w: 30, h: 8 }, pixGrid), { x: 98, y: 0, w: 30, h: 8 });
  assert.deepEqual(fitRect({ x: 0, y: 0, w: 400, h: 8 }, pixGrid), { x: 0, y: 0, w: 128, h: 8 });
  assert.deepEqual(fitRect({ x: -20, y: -5, w: 10, h: 4 }, pixGrid), { x: 0, y: 0, w: 10, h: 4 });
});

test('fitRect always produces something inside the grid', () => {
  for (const rect of [{ x: -99, y: -99, w: 1, h: 1 }, { x: 999, y: 999, w: 999, h: 999 }, { x: 5, y: 5, w: 0, h: 0 }]) {
    const fitted = fitRect(rect, pixGrid);
    assert.ok(fitted.x >= 0 && fitted.y >= 0, JSON.stringify(fitted));
    assert.ok(fitted.x + fitted.w <= pixGrid.unitsX && fitted.y + fitted.h <= pixGrid.unitsY, JSON.stringify(fitted));
  }
});

// --- Rects and paths --------------------------------------------------------

test('a zone converts to a rect and back without moving', () => {
  const z = zone({ row: 2, colStart: 9, colEnd: 16 });
  const rect = itemRect(z, 'lcd');
  assert.deepEqual(rect, { x: 8, y: 1, w: 8, h: 1 });
  const patch = rectPatch('lcd', 'Display.layouts.0.zones.3', rect, z);
  assert.deepEqual(patch, {}, 'a rect that has not moved must write nothing');
});

test('a moved zone writes 1-based inclusive columns, the way they are stored', () => {
  const z = zone({ row: 1, colStart: 1, colEnd: 8 });
  const patch = rectPatch('lcd', 'Z', { x: 4, y: 1, w: 6, h: 1 }, z);
  assert.deepEqual(patch, { 'Z.row': 2, 'Z.colStart': 5, 'Z.colEnd': 10 });
});

test('rowSpan is not invented for a one-row zone', () => {
  const patch = rectPatch('lcd', 'Z', { x: 0, y: 0, w: 8, h: 1 }, zone({ colEnd: 4 }));
  assert.ok(!Object.hasOwn(patch, 'Z.rowSpan'));
  const spanned = rectPatch('lcd', 'Z', { x: 0, y: 0, w: 8, h: 2 }, zone());
  assert.equal(spanned['Z.rowSpan'], 2);
});

test('an element converts to a rect and back', () => {
  const e = element({ x: 10, y: 20, w: 30, h: 12 });
  assert.deepEqual(itemRect(e, 'pixel'), { x: 10, y: 20, w: 30, h: 12 });
  assert.deepEqual(rectPatch('pixel', 'E', { x: 11, y: 20, w: 30, h: 12 }, e), { 'E.x': 11 });
});

test('the write path matches what the shipped editors already write', () => {
  const layout = { id: 'l1', name: 'Home', index: 2, flat: false, items: [] };
  assert.equal(itemPathBase('lcd', layout, 3), 'Display.layouts.2.zones.3');
  assert.equal(itemPathBase('pixel', layout, 0), 'Pixel.layouts.2.elements.0');
  assert.equal(itemPathBase('pixel', { flat: true, index: -1 }, 4), 'Pixel.elements.4');
});

// --- Reading a control ------------------------------------------------------

test('the kind comes from the section the control carries', () => {
  assert.equal(screenKindOf({ _children: { Display: {} } }), 'lcd');
  assert.equal(screenKindOf({ _children: { Pixel: {} } }), 'pixel');
  assert.equal(screenKindOf({ _children: { Text: {} } }), '');
  assert.equal(screenKindOf(null), '');
});

test('the sections named here are the sections that exist', () => {
  for (const kind of SCREEN_KINDS) {
    assert.ok(SECTION_DEFAULTS[SCREEN_SECTION_BY_KIND[kind]], `${SCREEN_SECTION_BY_KIND[kind]} is not a section`);
  }
});

test('the grid comes from the right pair of fields for each kind', () => {
  assert.deepEqual(screenGrid({ cols: 20, rows: 4 }, 'lcd'), { unitsX: 20, unitsY: 4, unit: 'cell' });
  assert.deepEqual(screenGrid({ pixelsW: 256, pixelsH: 64 }, 'pixel'), { unitsX: 256, unitsY: 64, unit: 'px' });
  // A graphic LCD has a pixel size too, and zones are still placed in CHARACTER cells on it.
  assert.deepEqual(screenGrid({ cols: 16, rows: 2, pixelWidth: 128, pixelHeight: 64 }, 'lcd'),
    { unitsX: 16, unitsY: 2, unit: 'cell' });
});

test('a pixel screen with no layouts still has one, over its flat element list', () => {
  const layouts = layoutsOf({ elements: [element()], layouts: [] }, 'pixel');
  assert.equal(layouts.length, 1);
  assert.equal(layouts[0].flat, true);
  assert.equal(layouts[0].items.length, 1);
  assert.equal(itemPathBase('pixel', layouts[0], 0), 'Pixel.elements.0');
});

test('layouts come back in order, named, with their items', () => {
  const layouts = layoutsOf({ layouts: [
    { id: 'l1', name: 'Home', zones: [zone(), zone()] },
    { id: 'l2', zones: [] },
  ] }, 'lcd');
  assert.deepEqual(layouts.map((l) => l.name), ['Home', 'l2']);
  assert.equal(layouts[0].items.length, 2);
  assert.equal(findScreenLayout(layouts, 'l2').index, 1);
  assert.equal(findScreenLayout(layouts, 'nope').id, 'l1', 'an unknown id falls back to the first');
});

test('screenSectionOf hands back the section itself', () => {
  const control = { _children: { Display: { cols: 20 } } };
  assert.equal(screenSectionOf(control).cols, 20);
});

// --- Page rules -------------------------------------------------------------

const rules = [
  { op: 'eq', when: '0', layoutId: 'l1' },
  { op: 'eq', when: '1', layoutId: 'l2' },
  { op: 'ge', when: '2', layoutId: 'l3' },
  { op: 'eq', when: '3', layoutId: 'l4' },
];

test('reorderRules moves one entry and leaves the rest in order', () => {
  assert.deepEqual(reorderRules(rules, 3, 0).map((r) => r.when), ['3', '0', '1', '2']);
  assert.deepEqual(reorderRules(rules, 0, 3).map((r) => r.when), ['1', '2', '3', '0']);
  assert.deepEqual(reorderRules(rules, 1, 1).map((r) => r.when), ['0', '1', '2', '3']);
});

test('reorderRules does not mutate the array it was given', () => {
  const before = rules.map((r) => r.when);
  reorderRules(rules, 0, 3);
  assert.deepEqual(rules.map((r) => r.when), before);
});

test('the live rule is the first match, the same one resolveActiveLayoutId takes', () => {
  assert.equal(liveRuleIndex(rules, '1'), 1);
  assert.equal(liveRuleIndex(rules, '5'), 2, 'the >= rule');
  assert.equal(liveRuleIndex(rules, ''), -1);
  const layouts = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }];
  const pages = { selectorMap: rules, defaultLayoutId: 'l1' };
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '5' }), 'l3');
  assert.equal(rules[liveRuleIndex(rules, '5')].layoutId, 'l3', 'the marker must agree with the renderer');
});

test('a rule an earlier one already claims is reported as unreachable', () => {
  // '>= 2' sits above '= 3', so '= 3' can never be the first match.
  assert.equal(shadowedRuleIndex(rules, 3), 2);
  assert.equal(shadowedRuleIndex(rules, 1), -1);
  assert.equal(shadowedRuleIndex(rules, 0), -1);
});

test('shadowing is only claimed where it is decidable', () => {
  // A range rule under another range rule is not answered, rather than guessed at.
  const ranges = [{ op: 'ge', when: '2' }, { op: 'between', when: '3', when2: '5' }];
  assert.equal(shadowedRuleIndex(ranges, 1), -1);
  assert.equal(shadowedRuleIndex([{ op: 'eq', when: '' }, { op: 'eq', when: '' }], 1), -1, 'an empty rule claims nothing');
});

// --- Cells and fields -------------------------------------------------------

test('unusedCells counts what no zone covers', () => {
  assert.equal(unusedCells([zone({ colStart: 1, colEnd: 16 }), zone({ row: 2, colStart: 1, colEnd: 16 })], lcdGrid, 'lcd'), 0);
  assert.equal(unusedCells([zone({ colStart: 1, colEnd: 8 })], lcdGrid, 'lcd'), 24);
  assert.equal(unusedCells([zone({ visible: false })], lcdGrid, 'lcd'), 32, 'a hidden zone covers nothing');
  assert.equal(unusedCells([], pixGrid, 'pixel'), null, 'meaningless for free pixels');
});

test('overlapping zones are counted once, not twice', () => {
  const cells = unusedCells([zone({ colStart: 1, colEnd: 8 }), zone({ colStart: 5, colEnd: 12 })], lcdGrid, 'lcd');
  assert.equal(cells, 32 - 12);
});

test('every item field carries a hint, and the labels are collected for the search index', () => {
  for (const kind of SCREEN_KINDS) {
    for (const field of itemFields(kind)) assert.ok(field.hint, `${kind}.${field.key} has no hint`);
  }
  const labels = allScreenFieldLabels();
  assert.ok(labels.includes('Align'));
  assert.ok(labels.includes('Row'));
  assert.equal(new Set(labels).size, labels.length, 'a duplicate label would double a search hit');
});

// --- The overlay geometry ---------------------------------------------------

test('cellGeometry still matches the arithmetic LcdDisplayRenderer uses', () => {
  const source = readFileSync(LCD_RENDERER, 'utf8');
  // If these move, a zone box would sit beside the letters instead of around them. Fix
  // cellGeometry to match; do not delete the assertion.
  assert.ok(source.includes('numberOr(width, 0) - padding * 2'), 'screen width');
  assert.ok(source.includes('(screenW - (cols - 1) * charSpacing) / cols'), 'cell width');
  assert.ok(source.includes('(screenH - (rows - 1) * lineSpacing) / rows'), 'cell height');
});

test('cellGeometry divides the screen the way the renderer does', () => {
  const geometry = cellGeometry({ width: 340, height: 100, grid: lcdGrid, kind: 'lcd', screen: { padding: 10, charSpacing: 1, lineSpacing: 3 } });
  assert.equal(geometry.screenW, 320);
  assert.equal(geometry.screenH, 80);
  assert.ok(Math.abs(geometry.cellW - (320 - 15) / 16) < 1e-9);
  assert.ok(Math.abs(geometry.cellH - (80 - 3) / 2) < 1e-9);
});

test('a rect becomes a box that lands back on the same cell', () => {
  const geometry = cellGeometry({ width: 340, height: 100, grid: lcdGrid, kind: 'lcd', screen: {} });
  for (const rect of [{ x: 0, y: 0, w: 1, h: 1 }, { x: 8, y: 1, w: 8, h: 1 }, { x: 15, y: 1, w: 1, h: 1 }]) {
    const box = rectBox(rect, geometry);
    const back = pointToCell(box.left + 1, box.top + 1, geometry, lcdGrid);
    assert.deepEqual(back, { x: rect.x, y: rect.y }, `round trip failed for ${JSON.stringify(rect)}`);
  }
});

test('a pointer outside the screen still lands on a cell inside it', () => {
  const geometry = cellGeometry({ width: 340, height: 100, grid: lcdGrid, kind: 'lcd', screen: {} });
  assert.deepEqual(pointToCell(-500, -500, geometry, lcdGrid), { x: 0, y: 0 });
  assert.deepEqual(pointToCell(9999, 9999, geometry, lcdGrid), { x: 15, y: 1 });
});

test('a pixel screen has no gaps between its units', () => {
  const geometry = cellGeometry({ width: 528, height: 272, grid: pixGrid, kind: 'pixel', screen: { padding: 8 } });
  assert.equal(geometry.gapX, 0);
  assert.equal(geometry.cellW, 512 / 128);
  assert.equal(geometry.cellH, 256 / 64);
});

// --- Where the renderer really paints ---------------------------------------

test('renderedRect agrees with composeLayout about the clamped zone', () => {
  const wide = zone({ row: 1, colStart: 20, colEnd: 28, text: 'RESONANCE' });
  const drawn = renderedRect(wide, lcdGrid, 'lcd');
  assert.deepEqual(drawn, { x: 15, y: 0, w: 1, h: 1 }, 'one cell at the last column');

  // And that is exactly where the shipped composer puts it.
  const lines = composeLayout([wide], 2, 16, () => null);
  assert.equal(lines[0].slice(0, drawn.x).trim(), '');
  assert.notEqual(lines[0][drawn.x], ' ');
});

test('a zone that paints nowhere has no rect to draw, and an edge instead', () => {
  const ghost = zone({ row: 5 });
  assert.equal(renderedRect(ghost, lcdGrid, 'lcd'), null);
  assert.equal(offGridEdge(ghost, lcdGrid, 'lcd'), 'bottom');
  assert.equal(offGridEdge(zone({ row: -3 }), lcdGrid, 'lcd'), 'top');
});

test('renderedRect keeps a zone that fits exactly as it is', () => {
  const good = zone({ row: 2, colStart: 9, colEnd: 16 });
  assert.deepEqual(renderedRect(good, lcdGrid, 'lcd'), itemRect(good, 'lcd'));
});

test('a pixel element hanging over the edge is drawn as the part that survives', () => {
  assert.deepEqual(renderedRect(element({ x: 120, y: 0, w: 30, h: 8 }), pixGrid, 'pixel'),
    { x: 120, y: 0, w: 8, h: 8 });
  assert.equal(renderedRect(element({ x: 500, y: 0 }), pixGrid, 'pixel'), null);
  assert.equal(offGridEdge(element({ x: 500, y: 0 }), pixGrid, 'pixel'), 'right');
});
