// panelIdentityAndVersion.test.js — CE-BETA-012, and the version mismatch the QA pass recorded
// without filing.
//
// 012: a panel saved as qa-beta-smoke.cepanel still said "Untitled 2" inside. Save As serialises
// the panel before the file dialog has returned a path, so the document carried the invented name
// the app had given it. Nothing broke, because deserializePanel prefers the name the host derives
// from the filename — which is exactly why it went unnoticed until someone read the file.
//
// Version: the report logged "Application version shown in the status bar: 0.1.0" while the
// installer it came from was CEditor-Setup-0.2.0.exe. StatusBar.svelte had a hardcoded string.
// CMakeLists' project() is what package-installer.ps1 reads to name the installer, so that is now
// the single source, injected by Vite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { serializePanel, deserializePanel, createPanel } from '../src/CE_Application/stores/panelModel.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// --- CE-BETA-012: the document never carries a misleading name ------------

test('a saved panel takes its name from its file', () => {
  const panel = { ...createPanel(), name: 'Untitled 2', filePath: 'C:\\dev\\Projects\\CEditor\\tmp\\qa-beta-smoke.cepanel' };
  const written = JSON.parse(serializePanel(panel));
  assert.equal(written.name, 'qa-beta-smoke');
});

test('both path separators work, and the extension is dropped', () => {
  const posix = { ...createPanel(), name: 'Untitled 9', filePath: '/home/user/panels/my-rig.cepanel' };
  assert.equal(JSON.parse(serializePanel(posix)).name, 'my-rig');
  // Case-insensitive on the extension, because Windows.
  const upper = { ...createPanel(), name: 'Untitled 9', filePath: '/home/user/panels/my-rig.CEPANEL' };
  assert.equal(JSON.parse(serializePanel(upper)).name, 'my-rig');
});

test('an unsaved panel writes no invented name at all', () => {
  // Better absent than wrong: whoever opens it names it from wherever it ended up.
  const panel = { ...createPanel(), name: 'Untitled 2', filePath: '' };
  assert.equal('name' in JSON.parse(serializePanel(panel)), false);
});

test('a name the author actually typed is kept, saved or not', () => {
  const named = { ...createPanel(), name: 'Gaia Live Rig', filePath: '' };
  assert.equal(JSON.parse(serializePanel(named)).name, 'Gaia Live Rig');
});

test('the file name wins over a typed name, because the file is the identity', () => {
  const panel = { ...createPanel(), name: 'Gaia Live Rig', filePath: '/panels/gaia-live-rig-v2.cepanel' };
  assert.equal(JSON.parse(serializePanel(panel)).name, 'gaia-live-rig-v2');
});

test('round trip: what is written is what comes back', () => {
  const panel = { ...createPanel(), name: 'Untitled 2', filePath: '/panels/qa-beta-smoke.cepanel' };
  const reopened = deserializePanel(serializePanel(panel), '/panels/qa-beta-smoke.cepanel', null);
  assert.equal(reopened.name, 'qa-beta-smoke');
});

test('a nameless document still opens, falling back to Untitled', () => {
  const panel = { ...createPanel(), name: 'Untitled 2', filePath: '' };
  const reopened = deserializePanel(serializePanel(panel), '', null);
  assert.match(reopened.name, /^Untitled \d+$/);
});

// --- The version, from one source ----------------------------------------

test('the status bar reads its version rather than hardcoding one', () => {
  const statusBar = readFileSync(join(repoRoot, 'CE/web/src/CE_Application/layout/StatusBar.svelte'), 'utf8');
  assert.doesNotMatch(statusBar, /CEditor v\d+\.\d+\.\d+/,
    'StatusBar has a hardcoded version again — it will drift from the installer, which is how it '
    + 'came to say 0.1.0 while the installer said 0.2.0');
  assert.match(statusBar, /CEditor v\{appVersion\}/);
});

test('vite injects the version from the same line the installer script reads', () => {
  const cmake = readFileSync(join(repoRoot, 'CMakeLists.txt'), 'utf8');
  const viteConfig = readFileSync(join(repoRoot, 'CE/web/vite.config.js'), 'utf8');
  const installer = readFileSync(join(repoRoot, 'tools/scripts/package-installer.ps1'), 'utf8');

  const version = cmake.match(/project\s*\(\s*CEditor\s+VERSION\s+([0-9]+\.[0-9]+\.[0-9]+)\s*\)/)?.[1];
  assert.ok(version, 'CMakeLists project(CEditor VERSION x.y.z) is gone or reshaped');

  // Both readers must still be looking at it, or one of them silently goes stale.
  assert.match(viteConfig, /project\\s\*\\\(\\s\*CEditor\\s\+VERSION/);
  assert.match(installer, /project\\s\*\\\(\\s\*CEditor\\s\+VERSION/);
});

test('package.json does not contradict the product version', () => {
  const cmake = readFileSync(join(repoRoot, 'CMakeLists.txt'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'CE/web/package.json'), 'utf8'));
  const version = cmake.match(/project\s*\(\s*CEditor\s+VERSION\s+([0-9]+\.[0-9]+\.[0-9]+)\s*\)/)?.[1];
  assert.equal(pkg.version, version,
    'CE/web/package.json disagrees with CMakeLists. Nothing displays it, but a second number in '
    + 'the repo is the thing that made the first one wrong.');
});
