// propertiesPanelWidth.test.js — the properties panel can be dragged down to 420 pixels, and its tabs
// stay readable there (item 2 of the editor-space list).
//
// The splitter stopped at 600 and the panel clamped itself to 600 in script and in CSS besides, so
// it could only be made wider: at 1366 x 768 with the tree open the canvas column was 502 pixels,
// less than the panel. Narrowed as it was, the panel cut values in four-to-a-row number fields,
// pushed Test Bench's buttons past its edge and cut Publish's contract table. Measured in the
// browser on every tab; this pins the numbers and the rules that made 420 clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MIN_PROPERTIES_PANEL_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
  NARROW_PROPERTIES_CONTENT,
  clampPropertiesPanelWidth,
} from '../src/CE_Application/utils/propertiesPanelWidth.js';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const src = (path) => readFileSync(join(srcRoot, path), 'utf8');

function svelteFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return name.endsWith('.svelte') ? [path] : [];
  });
}

test('the panel goes down to 420 and still opens at 600', () => {
  assert.equal(MIN_PROPERTIES_PANEL_WIDTH, 420);
  assert.equal(DEFAULT_PROPERTIES_PANEL_WIDTH, 600);
  assert.equal(clampPropertiesPanelWidth(300), 420, 'nothing below the floor, whatever was stored');
  assert.equal(clampPropertiesPanelWidth(436), 436);
  assert.equal(clampPropertiesPanelWidth(800), 800);
  assert.equal(clampPropertiesPanelWidth(undefined), 600, 'nothing stored: the width it always opened at');
  assert.equal(clampPropertiesPanelWidth('x'), 600);
});

test('the splitter, the panel\'s clamp and its CSS all use the one floor', () => {
  const app = src('App.svelte');
  assert.doesNotMatch(app, /const MIN_PROPERTIES_PANEL_WIDTH = /, 'no second copy of the number');
  assert.match(app, /min: MIN_PROPERTIES_PANEL_WIDTH,/);
  assert.match(app, /clampPropertiesPanelWidth\(readStoredNumber\(UI_STORAGE_KEYS\.propertiesPanelWidth, DEFAULT_PROPERTIES_PANEL_WIDTH\)\)/);
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.doesNotMatch(panel, /const MIN_PROPERTIES_PANEL_WIDTH = /);
  assert.match(panel, /let clampedWidth = \$derived\(clampPropertiesPanelWidth\(width\)\);/);
  assert.match(panel, new RegExp(`\\.properties-panel \\{[^}]*min-width: ${MIN_PROPERTIES_PANEL_WIDTH}px;`));
  assert.doesNotMatch(panel, /min-width: 600px/);
});

test('the tab\'s content area is the container the narrow rules go by', () => {
  assert.match(src('CE_Application/panels/TabContentArea.svelte'), /\.tab-sections-scroll \{[^}]*container: properties-tab \/ inline-size;/);
  // Every rule that goes by it switches at the same width, and that width is the module's.
  const queries = svelteFiles(join(srcRoot, 'CE_Application')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/@container properties-tab \(max-width: (\d+)px\)/g)].map((m) => [file, Number(m[1])]));
  assert.ok(queries.length >= 5, `${queries.length} rules: the two grids, the cell, Test Bench and Publish`);
  for (const [file, width] of queries) assert.equal(width, NARROW_PROPERTIES_CONTENT, file);
});

test('narrow, property grids are two columns and a wide field takes the row', () => {
  for (const file of ['CE_Application/properties/PropertySection.svelte', 'CE_Application/properties/PropertyGrid.svelte']) {
    assert.match(src(file), /@container properties-tab \(max-width: 460px\) \{\s*\.property-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, file);
  }
  assert.match(src('CE_Application/properties/PropertyCell.svelte'),
    /@container properties-tab \(max-width: 460px\) \{\s*\.property-cell\.span-3,\s*\.property-cell\.span-4 \{ grid-column: 1 \/ -1; \}/);
});

test('narrow, Test Bench\'s fixed-width rows take two lines and Publish\'s contract one column', () => {
  const bench = src('CE_Application/sections/CustomTestBenchEditor.svelte');
  const narrow = bench.slice(bench.lastIndexOf('@container properties-tab'));
  assert.match(narrow, /\.rig-row \{[^}]*grid-template-areas: "name note reset" "control control control";/);
  assert.match(narrow, /\.state-head \{[^}]*grid-template-areas: "name preview edit" "group when when";/);
  assert.match(narrow, /\.generated-source-row \{[^}]*grid-template-areas: "name name generator detach" "parts zones samples samples";/);
  assert.match(narrow, /\.probe-groups \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  // Their wide layouts need more than a 420 panel's 355 pixels, which is why they change at all.
  const minimums = (rule) => [...bench.match(new RegExp(`\\.${rule} \\{[^}]*grid-template-columns: ([^;]+);`))[1].matchAll(/minmax\((\d+)px|(?:^|\s)(\d+)px/g)].reduce((sum, m) => sum + Number(m[1] ?? m[2]), 0);
  assert.ok(minimums('rig-row') > 300 && minimums('state-head') > 300 && minimums('generated-source-row') > 355);
  assert.match(src('CE_Application/sections/CustomPublishedPropertiesEditor.svelte'),
    /@container properties-tab \(max-width: 460px\) \{\s*\.contract-board \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
