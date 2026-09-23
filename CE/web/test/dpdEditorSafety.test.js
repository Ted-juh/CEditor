import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(
  resolve(here, '..', 'src', 'CE_Application', 'editor', 'dpd', name),
  'utf8',
);

test('enum custom-value mode is derived per parameter and normalizes disabled wire values', () => {
  const source = read('DpdEnumInspector.svelte');
  assert.match(source, /customValues = p\?\.valueType === 'enum'[\s\S]*?Number\(entry\.wire \?\? index\) !== index/);
  assert.match(source, /if \(!enabled\) enumArr\(\)\.forEach\(\(entry, index\) => \{ entry\.wire = index; \}\)/);
  assert.match(source, /disabled=\{!customValues\}/);
});

test('preset scans and delayed imports stay scoped to the selected profile', () => {
  const source = read('DpdPresetsScreen.svelte');
  assert.match(source, /\$latestPresetListScan\?\.profileId === libraryKey \? \$latestPresetListScan : null/);
  assert.match(source, /const targetKey = libraryKey;[\s\S]*?await file\.text\(\)[\s\S]*?if \(targetKey !== libraryKey\) return;[\s\S]*?importLibraryBankJson\(targetKey, payload\)/);
  assert.match(source, /cancelPresetListScan\(\{ scanId: scan\.scanId \}\)/);
});

test('capture report feedback cannot update after destruction and its timer is cleaned up', () => {
  const source = read('DpdCaptureScreen.svelte');
  assert.match(source, /await navigator\.clipboard\?\.writeText\(text\);\s*if \(destroyed\) return;/);
  assert.match(source, /onDestroy\(\(\) => \{[\s\S]*?destroyed = true;[\s\S]*?clearTimeout\(reportTimer\);/);
});

test('listbox semantics and focus live with the option-owning renderer', () => {
  const surface = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'editor', 'PanelPreviewSurface.svelte'), 'utf8');
  const canvas = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'editor', 'CanvasControl.svelte'), 'utf8');
  const renderer = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'editor', 'ListboxRenderer.svelte'), 'utf8');

  assert.match(surface, /if \(buttonType === 'listbox'\) return ''/);
  assert.match(canvas, /tabindex=\{previewInteractive && !isListboxControl \? effectiveTabIndex : undefined\}/);
  assert.match(canvas, /<ListboxRenderer[\s\S]*?interactive=\{previewInteractive\}[\s\S]*?onfocus=\{onpreviewfocus\}[\s\S]*?onblur=\{onpreviewblur\}/);
  assert.match(renderer, /role="listbox"[\s\S]*?tabindex=\{interactive \? tabIndex : undefined\}/);
  assert.doesNotMatch(renderer, /tabindex="0"/);
});
