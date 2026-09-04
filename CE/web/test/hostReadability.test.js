import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../src/CE_Application/sections/${name}`, import.meta.url), 'utf8');
const theme = fs.readFileSync(
  new URL('../src/CE_Application/styles/hostage-theme.css', import.meta.url), 'utf8');

test('the host gives ordinary controls a useful target and visible keyboard focus', () => {
  const source = read('InstrumentHostView.svelte');
  assert.match(source, /import '\.\.\/styles\/hostage-theme\.css'/);
  assert.match(theme, /--host-control-height: 30px/);
  assert.match(theme, /button:not\(\.ctl\):not\(\.step\)[\s\S]{0,120}min-height: var\(--host-control-height\)/);
  assert.match(theme, /input\[type='range'\][\s\S]{0,120}min-height: 28px/);
  assert.match(theme, /button:focus-visible[\s\S]{0,400}outline: 2px solid/);
});

test('dense host workspaces retain readable rows and values', () => {
  const mixer = read('HostMixerPanel.svelte');
  const performance = read('PerformancePanel.svelte');
  const controller = read('HostSurfacePanel.svelte');

  assert.match(mixer, /min-width: 98px/);
  assert.match(mixer, /\.db \{ font-size: 12px/);
  assert.match(performance, /\.step \{[\s\S]{0,80}height: 28px/);
  assert.match(controller, /\.param-chip \{[\s\S]{0,100}min-height: 30px/);
});

test('the reliability panel explains the real plug-in process boundary', () => {
  const reliability = read('ReliabilityPanel.svelte');
  assert.match(reliability, /Each plug-in runs in its own worker process/);
  assert.match(reliability, /crashes, disconnects or stops meeting[\s\S]{0,80}audio deadlines/);
  assert.match(reliability, /never silently reloads the plug-in in its own process/);
});
