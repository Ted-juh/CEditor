// NumberCell — the label-inside number well: [label | live input | ▴▾].
// The label is the scrub drag handle, the input is always a real text field,
// and the steppers give exact one-click increments. These tests pin that
// structure and the display rules; drag behavior itself lives in
// scrub/dragScrub.ts and is covered by scrubRuntime.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import NumberCell from '../src/CE_Application/properties/NumberCell.svelte';

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
});

test('disabled state disables the input and steppers', () => {
  const html = renderCell({ value: 5, label: 'W', disabled: true });

  assert.match(html, /<input[^>]*disabled/);
  assert.match(html, /number-cell[^"]*disabled/);
});
