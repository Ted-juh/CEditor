import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { listboxRowHeight, listboxRowTop, listboxScrollIntoView, listboxRowIndexAtPoint } from '../src/CE_Application/utils/listboxLayout.js';

test('touch-encoder list rows use drawn geometry for scrolling and picking', () => {
  const control = createControl('Listbox');
  control._children.Value.rows = Array.from({ length: 30 }, (_, i) => ({ internalValue: String(i) }));
  const drawn = resolveControlForSet(control, getControlSet('touch-encoder'));
  assert.notEqual(listboxRowHeight(drawn), listboxRowHeight(control));
  const scroll = listboxScrollIntoView(drawn, 29, 240, 0);
  const bottom = listboxRowTop(drawn, 29) + listboxRowHeight(drawn) - scroll;
  assert.ok(bottom <= 240);
  assert.equal(listboxRowIndexAtPoint(drawn, bottom - 1, scroll), 29);
  const stale = listboxScrollIntoView(control, 29, 240, 0);
  assert.ok(listboxRowTop(drawn, 29) + listboxRowHeight(drawn) - stale > 240);
});

test('native preview resolves Listbox geometry with the same control set as its renderer', () => {
  const source = readFileSync(new URL('../src/CE_Application/editor/PanelPreviewSurface.svelte', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('function lbControl(control)'), source.indexOf('function handleListboxFilterInput'));
  assert.match(helper, /resolveControlForSet\(resolvedPreviewFor\(control\)\?\.control \?\? control, controlSetForPanel\(panel\)\)/);
  assert.match(helper, /dependentControl\(drawn,/);
});
