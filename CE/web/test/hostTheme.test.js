import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const section = (name) => fs.readFileSync(
  new URL(`../src/CE_Application/sections/${name}`, import.meta.url), 'utf8');
const theme = fs.readFileSync(
  new URL('../src/CE_Application/styles/hostage-theme.css', import.meta.url), 'utf8');

test('the Hostage theme is global only inside the instrument workspace', () => {
  assert.match(section('InstrumentHostView.svelte'), /import '\.\.\/styles\/hostage-theme\.css'/);
  assert.match(theme, /\.host-workspace \{[\s\S]*?--host-bg:/);
  assert.doesNotMatch(theme, /(?:^|\n)\s*:root\s*\{/,
    'the host must not repaint the panel editor or runtime player');
  assert.match(theme, /color-scheme: dark/,
    'native form widgets receive the same dark appearance');
});

test('one token set owns common controls and semantic states', () => {
  for (const token of [
    '--host-surface', '--host-field', '--host-line', '--host-text', '--host-accent',
    '--host-active', '--host-pending', '--host-danger', '--host-radius-control',
  ]) assert.ok(theme.includes(token), `missing ${token}`);

  assert.match(theme, /button\.toggle\.on/);
  assert.match(theme, /button\.ghost/);
  assert.match(theme, /button\.danger/);
  assert.match(theme, /button\.confirming/);
  assert.match(theme, /\.state-pill\.assigned/);
  assert.match(theme, /\.state-pill\.problem/);
});

test('shared range controls preserve the square fader language', () => {
  assert.match(theme, /slider-runnable-track[\s\S]{0,180}border-radius: 0/);
  assert.match(theme, /slider-thumb[\s\S]{0,220}border-radius: 0/);
  assert.match(theme, /input\.fader::-[\s\S]*?width: 22px/);
});

test('piano keys keep their authored white and black appearance', () => {
  const keyboard = section('HostKeyboard.svelte');
  assert.match(keyboard, /class="piano-key white"/);
  assert.match(keyboard, /class="piano-key black"/);
  assert.match(theme, /button:not\(\.ctl\):not\(\.step\):not\(\.piano-key\)/,
    'piano keys must not inherit the standard dark button palette');
});

test('child panels no longer copy a private standard-control theme', () => {
  for (const name of [
    'InstrumentHostView.svelte', 'PerformancePanel.svelte', 'ProductPanel.svelte',
    'ReliabilityPanel.svelte', 'LicencePanel.svelte',
  ]) {
    const source = section(name);
    assert.doesNotMatch(source, /\n\s{2}button \{\s*\n\s*background:/,
      `${name} still owns a generic button palette`);
  }

  assert.match(section('HostMixerPanel.svelte'), /var\(--host-surface-raised\)/);
  assert.match(section('MidiChainPanel.svelte'), /var\(--host-accent-surface\)/);
  assert.match(section('HostSurfacePanel.svelte'), /var\(--host-radius-panel\)/);
});
