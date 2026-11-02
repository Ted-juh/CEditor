// The Core tab opens on what the control IS (Identity: its name and handle), and its look (Control
// design: the set and form it is drawn with) comes after. The owner asked for this order; Control
// design used to come first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Core: Identity first, Control design beneath it', () => {
  const source = readFileSync(new URL('../src/CE_Application/sections/CoreEditor.svelte', import.meta.url), 'utf8');
  const titles = [...source.matchAll(/<PropertySection title="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(titles.slice(0, 2), ['Identity', 'Control design']);
});
