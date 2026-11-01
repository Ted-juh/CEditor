// paletteFolded.test.js — the Component Designer's Shapes palette opens folded, in two columns, and
// stays the way the author leaves it (item 7 of the editor-space list).
//
// Open, the palette took 149 pixels at 1366 x 768 (219 at 1920) for 28 tools. It could be folded,
// but it opened unfolded every time, and its fold was one column of 1,125 pixels: at 768 tall the
// Value Controls and the Pen were below the edge, and the three pane toggles under it were cut off by
// the 46-pixel column because the rule meant to stack them never reached them. Folded in two
// columns it is 84 pixels with every tool in sight, at 1366 and at 1920, and the artboard is 66 and
// 136 pixels wider. Measured in the browser; this pins what makes it so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const designer = src('sections/CustomDesignSurfaceEditor.svelte');
const palette = src('sections/SurfacePalette.svelte');

test('it opens folded, and the author\'s choice is kept', () => {
  assert.match(designer, /const PALETTE_FOLDED_KEY = 'ce\.ui\.designerPaletteFolded';/);
  assert.match(designer, /let paletteCollapsed = \$state\(readStoredBool\(PALETTE_FOLDED_KEY, true\)\);/, 'folded unless the author unfolded it');
  assert.match(designer, /function setPaletteFolded\(value\) \{\s*paletteCollapsed = value === true;\s*writeStoredJson\(PALETTE_FOLDED_KEY, paletteCollapsed\);/);
  assert.match(designer, /setPaletteCollapsed=\{setPaletteFolded\}/, 'the palette\'s own button goes through it');
  assert.match(palette, /title=\{paletteCollapsed \? 'Expand the Shapes palette' : 'Collapse the Shapes palette'\} onclick=\{\(\) => setPaletteCollapsed\(!paletteCollapsed\)\}/);
});

test('folded, it is two columns of every tool, 84 pixels wide', () => {
  assert.match(designer, /\$\{paletteCollapsed \? '--palette-w:84px;' : ''\}/);
  assert.match(designer, /\.surface-shell\.palette-collapsed :global\(\.palette-scroll \.palette-grid\) \{\s*grid-template-columns: 1fr 1fr;/);
  assert.match(designer, /\.surface-shell\.palette-collapsed :global\(\.palette-scroll \.palette-grid button\) \{\s*height: 29px;/);
  // Only the heading and the group captions go; no tool is hidden.
  const hidden = designer.match(/([^}]*)\{\s*display: none;\s*\}/g).find((rule) => rule.includes('palette-collapsed')) ?? '';
  assert.match(hidden, /:global\(\.palette-header\)/);
  assert.match(hidden, /:global\(\.palette-group > span\)/);
  assert.doesNotMatch(hidden, /palette-grid|button/);
  // Every tool names itself, which is all a folded one has to say.
  const tools = [...palette.matchAll(/<button type="button"(?:=>|[^>])*>/g)].map((m) => m[0]).filter((b) => !/palette-toggles/.test(b));
  assert.ok(tools.length >= 10);
  for (const button of tools) assert.match(button, /title=/, button);
});

test('the three pane toggles fit the folded column, by a rule that reaches them', () => {
  // SurfacePalette owns the toggles, so the shell's rule has to be :global to apply at all.
  assert.match(palette, /<div class="palette-toggles"/);
  assert.doesNotMatch(designer, /\.palette-collapsed \.palette-toggles \{/, 'not the scoped rule that never matched');
  assert.match(designer, /\.surface-shell\.palette-collapsed :global\(\.palette-panel \.palette-toggles button\) \{\s*width: 24px;/);
  // Three 24-pixel buttons and two 2-pixel gaps: 76 of the column's 84.
  assert.ok(3 * 24 + 2 * 2 <= 84);
});
