import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, '..', 'src', 'CE_Application', 'components', relative), 'utf8');

test('focusable list rows ignore keyboard events bubbled from their action buttons', () => {
  for (const file of [
    'library/LibraryGrid.svelte',
    'animation/AnimationList.svelte',
    'animation/TargetList.svelte',
    'api/ContractTable.svelte',
  ]) {
    assert.match(read(file), /if \(event\.target !== event\.currentTarget\) return;/, file);
  }
});

test('target reordering keeps selection on the same logical target', () => {
  const source = read('animation/TargetList.svelte');
  assert.match(source, /if \(selectedIndex === from\) nextSelection = to/);
  assert.match(source, /from < to && selectedIndex > from && selectedIndex <= to/);
  assert.match(source, /to < from && selectedIndex >= to && selectedIndex < from/);
  assert.match(source, /onreorder\(from, to\);[\s\S]*?onselect\(nextSelection\)/);
});

test('library removal requires a second deliberate action for the same package', () => {
  const source = read('library/LibraryDetail.svelte');
  assert.match(source, /if \(confirmRemoveId !== row\.id\)[\s\S]*?confirmRemoveId = row\.id;[\s\S]*?return;/);
  assert.match(source, /confirmRemoveId = '';[\s\S]*?onremove\(row\)/);
  assert.match(source, /Confirm forget/);
});

test('API list fields immediately display their canonical comma-separated value', () => {
  const source = read('api/EntrySettings.svelte');
  assert.match(source, /const next = event\.currentTarget\.value\.split\(','\)\.map\(\(v\) => v\.trim\(\)\)\.filter\(Boolean\)/);
  assert.match(source, /onset\('values', next\);[\s\S]*?event\.currentTarget\.value = next\.join\(', '\)/);
});
