import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url),
  'utf8',
);
const theme = fs.readFileSync(
  new URL('../src/CE_Application/styles/hostage-theme.css', import.meta.url),
  'utf8',
);

test('rack parts separate identity, live controls and secondary actions', () => {
  assert.match(source, /class="part-head"/);
  assert.match(source, /class="part-performance"/);

  // The actions are a strip in the row head, not a menu: the two most-used ones (the
  // plug-in's interface, here or in its own window) and the one that must never be a
  // surprise (remove) are visible at the same place on every row. A ••• button hiding
  // six things was the complaint that removed it, so its absence is asserted, not assumed.
  assert.doesNotMatch(source, /<details class="part-actions"/);
  assert.doesNotMatch(source, /part-action-menu/);
  const strip = source.match(/<div class="part-actions"[\s\S]*?\n {12}<\/div>/)?.[0] ?? '';
  assert.ok(strip, 'the action strip is in the part head');
  for (const id of ['part-move-up', 'part-move-down', 'part-open-editor', 'part-float-editor',
                    'part-unload', 'part-remove']) {
    assert.match(strip, new RegExp(`data-testid="${id}"`), id);
  }
  // Every word the menu carried is still there for the tooltip and the screen reader.
  assert.match(strip, /title="Show the plug-in's own interface in the native pane"/);
  assert.match(strip, /own window/);
  assert.match(strip, /aria-label=\{`Move \$\{partTitle\(part\)\} up`\}/);
  // The two destructive ones keep click-again-to-confirm through the same guard the menu
  // used; with no words to change, the button says so in its tooltip and turns red.
  assert.match(strip, /guardedAction\(`unload:\$\{part\.partId\}`/);
  assert.match(strip, /guardedAction\(`part:\$\{part\.partId\}`/);
  assert.match(strip, /Click again to confirm unload/);
  assert.match(strip, /Click again to confirm removal/);
  assert.match(strip, /class:confirming=\{pendingDestructive === `part:\$\{part\.partId\}`\}/);
  assert.match(source, /\.part-actions button\.icon\.confirming \{[^}]*--host-danger/);
  // The theme pads every button 4px 10px at (0,2,1); anything weaker leaves 8px for the
  // glyph inside a 30px square. The strip's rule has to outrank it, and is asserted to.
  assert.match(source, /\.host-workspace\.host-workspace \.part-actions button\.icon \{[^}]*padding: 0/);
});

test('rack parts expose plain-language performance controls and exception states', () => {
  assert.match(source, />Active<\/button>/);
  assert.match(source, />Mute<\/button>/);
  assert.match(source, />Solo<\/button>/);
  assert.match(source, /part-state problem">Missing/);
  assert.match(source, /part-state off">Off/);
});

test('host sliders use rectangular tracks and fader caps', () => {
  assert.match(theme, /slider-runnable-track[\s\S]{0,180}border-radius: 0/);
  assert.match(theme, /slider-thumb[\s\S]{0,220}border-radius: 0/);
  assert.match(theme, /input\.fader::-webkit-slider-thumb[\s\S]{0,120}width: 22px/);
});
