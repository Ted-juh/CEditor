// designerChrome.test.js — controls in and around the Component Designer that pointed nowhere or
// sat on top of each other.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

test('the properties panel offers to open the designer only when it is not open', () => {
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panel, /\{#if \$componentWorkspaceMode !== 'surface'\}\s*<button[\s\S]{0,200}data-testid="properties-component-designer-launch"/);
});

test('the layer quick bar says what its buttons do with icons, not letters, and stays off the tool strip', () => {
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const bar = designer.match(/<div\s+class="selection-quickbar"[\s\S]*?\n {10}<\/div>/)?.[0] ?? '';
  assert.ok(bar, 'the quick bar is still in the designer');
  // C, P, F and B were Copy, Paste, Bring to front and Send to back.
  assert.doesNotMatch(bar, />\s*[CPFB]\s*</, 'no single-letter buttons');
  for (const icon of ['CopyPlus', 'Copy', 'ClipboardPaste', 'BringToFront', 'SendToBack']) {
    assert.match(bar, new RegExp(`<${icon} size=\\{13\\}`), icon);
  }
  // The tool strip is centred along the bottom of the canvas; on a narrow canvas the bar, at the
  // bottom right, covered half of it.
  const style = designer.match(/\.selection-quickbar \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(style, /top: 10px;/);
  assert.match(style, /bottom: auto;/);
});
