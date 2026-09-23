// NumberCell — the label-inside number well: [label | live input | ▴▾].
// The label is the scrub drag handle, the input is always a real text field,
// and the steppers give exact one-click increments. These tests pin that
// structure and the display rules; drag behavior itself lives in
// scrub/dragScrub.ts and is covered by scrubRuntime.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { render } from 'svelte/server';
import NumberCell from '../src/CE_Application/properties/NumberCell.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'properties', 'NumberCell.svelte'), 'utf8');

function renderCell(props) {
  return render(NumberCell, { props }).body;
}

test('renders label, live input, and both steppers', () => {
  const html = renderCell({ value: 24, label: 'X' });

  assert.match(html, /nc-label[^>]*>X</, 'label sits inside the well');
  assert.match(html, /<input[^>]*class="[^"]*nc-value/, 'value is a real <input>');
  assert.match(html, /aria-label="Increment"/);
  assert.match(html, /aria-label="Decrement"/);
});

test('input takes its accessible name from the label', () => {
  const html = renderCell({ value: 24, label: 'X' });
  assert.match(html, /<input[^>]*aria-label="X"/);
});

test('label is optional — steppers and input remain', () => {
  const html = renderCell({ value: 7 });

  assert.doesNotMatch(html, /nc-label/);
  assert.match(html, /<input[^>]*value="7"/);
  assert.match(html, /aria-label="Increment"/);
});

test('display is faithful to the stored value', () => {
  assert.match(renderCell({ value: 55.4, step: 1 }), /<input[^>]*value="55.4"/,
    'off-step values keep their precision');
  assert.match(renderCell({ value: 0.30000000000000004, step: 0.1 }), /<input[^>]*value="0.3"/,
    'float noise is stripped');
});

test('fill bar renders only for fully bounded ranges', () => {
  const bounded = renderCell({ value: 50, min: 0, max: 100 });
  assert.match(bounded, /nc-fill[^>]*style="width:50%"/, 'bounded → fill at range fraction');

  const halfBounded = renderCell({ value: 50, min: 0 });
  assert.doesNotMatch(halfBounded, /nc-fill/, 'min-only → no fill bar');

  const unbounded = renderCell({ value: 50 });
  assert.doesNotMatch(unbounded, /nc-fill/, 'unbounded → no fill bar');

  const emptyRange = renderCell({ value: 5, min: 5, max: 5 });
  assert.doesNotMatch(emptyRange, /nc-fill/, 'a zero-width range cannot produce a meaningful percentage');
});

test('disabled state disables the input and steppers', () => {
  const html = renderCell({ value: 5, label: 'W', disabled: true });

  assert.match(html, /<input[^>]*disabled/);
  assert.match(html, /number-cell[^"]*disabled/);
});

test('external values update a clean draft but never erase text the user has changed', () => {
  assert.match(source, /let draftDirty = \$state\(false\)/);
  assert.match(source, /const external = format\(value\);[\s\S]*?if \(!editing \|\| !draftDirty\) draft = external/);
  assert.match(source, /oninput=\{\(e\) => \{ draft = e\.target\.value; draftDirty = true; \}\}/);
  assert.match(source, /function beginEdit[\s\S]*?draftDirty = false/);
});

test('Escape restores the latest external value and cannot trigger a parent shortcut', () => {
  const escape = source.slice(source.indexOf("} else if (e.key === 'Escape')"));
  assert.ok(escape.indexOf('draft = format(value)') < escape.indexOf('e.target.blur()'));
  assert.match(escape, /draftDirty = false/);
  assert.match(escape, /e\.preventDefault\(\)/);
  assert.match(escape, /e\.stopPropagation\(\)/);
});
