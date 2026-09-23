import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render } from 'svelte/server';
import PropertySelect from '../src/CE_Application/properties/PropertySelect.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const source = (relative) => readFileSync(resolve(here, '..', 'src', relative), 'utf8');

test('PropertyColor restores the canonical controlled value after rejected or exact-echo input', () => {
  const text = source('CE_Application/properties/PropertyColor.svelte');
  assert.match(text, /import \{ tick \} from 'svelte'/);
  assert.match(text, /const generation = \+\+valueGeneration/);
  assert.match(text, /await tick\(\)/);
  assert.match(text, /generation === valueGeneration && input\.isConnected/);
  assert.match(text, /input\.value = String\(value \?\? ''\)/);
});

test('PropertyText restores rejected commits and Escape cancels without committing', () => {
  const text = source('CE_Application/properties/PropertyText.svelte');
  assert.match(text, /import \{ tick \} from 'svelte'/);
  assert.match(text, /const generation = \+\+valueGeneration/);
  assert.match(text, /await tick\(\)/);
  assert.match(text, /generation === valueGeneration && input\.isConnected/);
  const escape = text.slice(text.indexOf("if (event.key !== 'Escape') return"));
  assert.match(escape, /suppressCommit = true/);
  assert.match(escape, /input\.value = String\(value \?\? ''\)/);
  assert.match(escape, /event\.preventDefault\(\)/);
  assert.match(escape, /event\.stopPropagation\(\)/);
});

test('PropertySelect compares option values using the DOM string representation', () => {
  const text = source('CE_Application/properties/PropertySelect.svelte');
  assert.match(text, /String\(option\.value\) === String\(value\)/);

  const html = render(PropertySelect, {
    props: { value: '1', options: [{ value: 1, label: 'One' }] },
  }).body;
  assert.doesNotMatch(html, /\(missing\)/,
    'a numeric option and the equivalent controlled DOM string are the same selection');
});

test('BorderCornerWidget invalidates stale file reads and aborts one on teardown', () => {
  const text = source('CE_Application/properties/BorderCornerWidget.svelte');
  assert.match(text, /import \{ onDestroy \} from 'svelte'/);
  assert.match(text, /onDestroy\(\(\) => \{[\s\S]*?fileReadGeneration \+= 1;[\s\S]*?activeReader\?\.abort\(\)/);
  assert.match(text, /const generation = \+\+fileReadGeneration/);
  assert.match(text, /if \(generation !== fileReadGeneration\) return/);
});

test('drag scrub closes an active host gesture when its action is destroyed', () => {
  const text = source('CE_Application/scrub/dragScrubAction.ts');
  const destroy = text.slice(text.indexOf('destroy()'));
  assert.match(destroy, /if \(activePointer !== null\)/);
  assert.match(destroy, /scrub\.end\(\)/);
  assert.match(destroy, /current\.onDragEnd\?\.\(\)/);
  assert.match(destroy, /document\.pointerLockElement === node/);
});
