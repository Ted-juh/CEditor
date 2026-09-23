import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFileSync(resolve(here, '..', 'src', 'CE_Application', 'settings', name), 'utf8');

test('control-set imports cannot select or report an obsolete async result', () => {
  const text = source('ControlSetsSettings.svelte');
  assert.match(text, /onDestroy\(\(\) => \{ importGeneration \+= 1; \}\)/);
  assert.match(text, /const generation = \+\+importGeneration/);
  assert.match(text, /importControlSetText\(await file\.text\(\), \{ carry: false \}\);[\s\S]*?if \(generation !== importGeneration\) return/);
});

test('deleting the default custom control set repairs the persisted default', () => {
  const text = source('ControlSetsSettings.svelte');
  const removal = text.slice(text.indexOf('function removeSelected()'), text.indexOf('function setToken'));
  assert.match(removal, /const wasDefault = \$generalSettings\.defaultControlSetId === draft\.id/);
  assert.match(removal, /if \(wasDefault\) updateGeneralSettings\(\{ defaultControlSetId: 'graphite' \}\)/);
  assert.match(removal, /choose\(wasDefault \? 'graphite'/);
});

test('icon imports suppress stale and post-destroy status updates', () => {
  const text = source('IconsSettings.svelte');
  assert.match(text, /onDestroy\(\(\) => \{ importGeneration \+= 1; \}\)/);
  assert.match(text, /const generation = \+\+importGeneration/);
  assert.match(text, /if \(generation !== importGeneration\) return/);
});

test('font imports guard both local and Google async completions', () => {
  const text = source('FontsSettings.svelte');
  assert.match(text, /localImportGeneration \+= 1/);
  assert.match(text, /googleImportGeneration \+= 1/);
  assert.match(text, /const generation = \+\+localImportGeneration/);
  assert.match(text, /const generation = \+\+googleImportGeneration/);
  assert.match(text, /try \{[\s\S]*?result = await addGoogleFont\(googleFamily\);[\s\S]*?\} catch \(error\)/);
});
