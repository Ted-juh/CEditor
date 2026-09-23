import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, '..', 'src', 'CE_Application', 'components', name), 'utf8');

test('parameter diagnostics inspect controls nested inside containers', () => {
  const source = read('ParameterBrowserTab.svelte');
  assert.match(source, /import \{ flatControls \} from '\.\.\/utils\/containment\.js'/);
  assert.match(source, /for \(const control of flatControls\(panel\.controls \?\? \[\]\)\)/);
});

test('viewer pan ends when the browser window loses focus', () => {
  const source = read('ViewerEditor.svelte');
  assert.match(source, /<svelte:window[^>]*onmouseup=\{handleMouseUp\}[^>]*onblur=\{handleMouseUp\}/);
});

test('Enter belongs to focused controls inside the stop colour dialog', () => {
  const source = read('StopColourPopover.svelte');
  assert.match(source, /event\.key === 'Enter' && !rootEl\?\.contains\(event\.target\)/);
});
