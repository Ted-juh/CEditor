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
  assert.match(source, /<details class="part-actions"/);

  const menu = source.match(/<div class="part-action-menu">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(menu, />Editor<\/button>/);
  assert.match(menu, />Floating editor<\/button>/);
  assert.match(menu, /'Unload instrument'/);
  assert.match(menu, /'Remove part'/);
  assert.match(menu, /Confirm unload/);
  assert.match(menu, /Confirm remove/);
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
