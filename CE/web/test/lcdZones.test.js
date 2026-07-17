import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveZoneContent,
  fitToRegion,
  composeLayout,
  resolveActiveLayoutId,
  collectSourceIds,
  noteName,
  isActiveSource,
  activeFilterOf,
} from '../src/CE_Application/utils/lcdZones.js';

const slider = { present: true, name: 'Cutoff', value: 62, min: 0, max: 127 };

test('resolveZoneContent renders each show kind', () => {
  assert.equal(resolveZoneContent({ show: 'static', text: 'VOL' }, null, 4), 'VOL');
  assert.equal(resolveZoneContent({ show: 'name' }, slider, 12), 'Cutoff');
  assert.equal(resolveZoneContent({ show: 'value' }, slider, 6), '62');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, slider, 6), '49%');
  assert.equal(resolveZoneContent({ show: 'midiValue' }, slider, 4), '62');
  assert.equal(resolveZoneContent({ show: 'midiValue', radix: 'hex' }, slider, 4), '3E');
  assert.equal(resolveZoneContent({ show: 'note' }, { present: true, value: 60 }, 4), 'C4');
  assert.equal(resolveZoneContent({ show: 'text' }, { present: true, text: 'On' }, 4), 'On');
  assert.equal(resolveZoneContent({ show: 'value' }, { present: false }, 6), '');
});

test('bar zone fills to the value fraction across the region width', () => {
  assert.equal(resolveZoneContent({ show: 'bar' }, { present: true, value: 0, min: 0, max: 100 }, 8), '        ');
  assert.equal(resolveZoneContent({ show: 'bar' }, { present: true, value: 100, min: 0, max: 100 }, 8), '████████');
});

test('fitToRegion aligns and truncates', () => {
  assert.equal(fitToRegion('AB', 5, 'left'), 'AB   ');
  assert.equal(fitToRegion('AB', 5, 'right'), '   AB');
  assert.equal(fitToRegion('AB', 5, 'center'), ' AB  ');
  assert.equal(fitToRegion('ABCDEF', 4), 'ABCD');
});

test('composeLayout paints zones into a grid by region', () => {
  const getInfo = (id) => (id === 'S1' ? slider : null);
  const zones = [
    { row: 1, colStart: 1, colEnd: 5, show: 'static', text: 'COMP' },
    { row: 1, colStart: 6, colEnd: 12, show: 'name', sourceId: 'S1' },
    { row: 2, colStart: 8, colEnd: 12, show: 'value', sourceId: 'S1' },
    { row: 3, colStart: 6, colEnd: 8, show: 'midiValue', radix: 'hex', sourceId: 'S1' },
  ];
  const grid = composeLayout(zones, 3, 12, getInfo);
  assert.equal(grid[0], 'COMP Cutoff ');
  assert.equal(grid[1], '       62   ');
  assert.equal(grid[2], '     3E     ');
});

test('higher priority zones paint over lower ones', () => {
  const zones = [
    { row: 1, colStart: 1, colEnd: 6, show: 'static', text: 'AAAAAA', priority: 0 },
    { row: 1, colStart: 1, colEnd: 3, show: 'static', text: 'BBB', priority: 1 },
  ];
  assert.equal(composeLayout(zones, 1, 6, null)[0], 'BBBAAA');
});

test('resolveActiveLayoutId prefers overlay, then selector, then default', () => {
  const layouts = [{ id: 'main' }, { id: 'edit' }, { id: 'flash' }];
  const pages = { defaultLayoutId: 'main', selectorMap: [{ when: '1', layoutId: 'edit' }] };
  assert.equal(resolveActiveLayoutId(pages, layouts, {}), 'main');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '1' }), 'edit');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '9' }), 'main');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '1', activeOverlayLayoutId: 'flash' }), 'flash');
});

test('collectSourceIds gathers zone + selector + overlay sources', () => {
  const display = {
    layouts: [{ zones: [{ sourceId: 'A' }, { sourceId: 'B' }, { sourceId: '' }] }],
    pages: { selectorSourceId: 'C', overlays: [{ sourceId: 'D' }] },
  };
  assert.deepEqual(collectSourceIds(display).sort(), ['A', 'B', 'C', 'D']);
});

test('isActiveSource / activeFilterOf parse @active kind filters', () => {
  assert.equal(isActiveSource('@active'), true);
  assert.equal(isActiveSource('@active#value'), true);
  assert.equal(isActiveSource('S1'), false);
  assert.equal(isActiveSource(''), false);
  assert.equal(activeFilterOf('@active'), '');
  assert.equal(activeFilterOf('@active#switch'), 'switch');
  assert.equal(activeFilterOf('S1'), '');
});

test('empty zones do not clobber overlapping zones (per-kind @active share a region)', () => {
  // Two zones share R1 C4-6: a slider-scoped value and a button-scoped state.
  // Only the active kind resolves to live info; the other is empty and must not
  // paint spaces over the one that did.
  const zones = [
    { row: 1, colStart: 1, colEnd: 3, show: 'static', text: 'ID' },
    { row: 1, colStart: 4, colEnd: 6, show: 'value', sourceId: '@active#value' },
    { row: 1, colStart: 4, colEnd: 6, show: 'state', sourceId: '@active#switch' },
  ];
  // Button active: only the switch source has info -> 'On' shows, value stays out.
  const btnActive = (id) => (id === '@active#switch' ? { present: true, on: true, value: 1 } : null);
  assert.equal(composeLayout(zones, 1, 6, btnActive)[0], 'ID On ');
  // Slider active: only the value source has info -> '62' shows.
  const sliderActive = (id) => (id === '@active#value' ? { present: true, value: 62, min: 0, max: 127 } : null);
  assert.equal(composeLayout(zones, 1, 6, sliderActive)[0], 'ID 62 ');
});

test('an absent bar zone leaves the region blank rather than a full-width gutter', () => {
  const zones = [
    { row: 1, colStart: 1, colEnd: 4, show: 'static', text: 'AAAA' },
    { row: 1, colStart: 1, colEnd: 4, show: 'bar', sourceId: 'S1' },
  ];
  assert.equal(composeLayout(zones, 1, 4, () => null)[0], 'AAAA');
});

test('noteName maps MIDI note numbers', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(69), 'A4');
});
