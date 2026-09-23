import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { cerror, clog, clearConsole, consoleEntries } from '../src/CE_Application/stores/console.js';

test('console capture formats circular values without throwing', () => {
  clearConsole();
  const value = { label: 'loop' };
  value.self = value;

  assert.doesNotThrow(() => clog(value));
  assert.match(get(consoleEntries).at(-1)?.message ?? '', /\[Circular\]/);
});

test('console capture preserves useful Error details', () => {
  clearConsole();

  cerror(new Error('captured failure'));

  const message = get(consoleEntries).at(-1)?.message ?? '';
  assert.match(message, /Error: captured failure/);
  assert.notEqual(message, '{}');
});
