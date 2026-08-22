// workspaceSwapMotion.test.js — switching workspace looks like navigation, not like a glitch.
//
// Review finding E4, remaining clause: "Workspace switching is still instantaneous. Switching
// to a device/script/screen/component tab removes the context bar, tree, dock and (except in
// component mode) the properties panel in a single frame. The persistence of rail/menubar/
// tabbar/statusbar is real and deliberate now; what is missing is that the change has no
// transition at all."
//
// Three things have to hold and each has bitten somebody somewhere: the app must not animate
// its own startup (a first paint is not a transition from anywhere), a second switch inside
// the animation window must still animate (which is why the phase alternates — a CSS
// animation restarts on a change of NAME, not of a counter), and reduced motion must be
// honoured in a way that survives the user changing the setting while the app is open.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

import {
  WORKSPACE_SWAP_MS,
  advanceWorkspaceSwap,
  workspaceSwapPhase,
} from '../src/CE_Application/utils/chromeMotion.js';

const here = dirname(fileURLToPath(import.meta.url));
const appPath = join(here, '..', 'src', 'App.svelte');
const app = readFileSync(appPath, 'utf8');

test('App.svelte still compiles', () => {
  const { warnings } = compile(app, { filename: 'App.svelte' });
  const real = warnings.filter((w) => !w.code.startsWith('a11y'));
  assert.deepEqual(real.map((w) => w.code), [], real.map((w) => w.message).join('\n'));
});

test('the first observed workspace is not a swap', () => {
  const first = advanceWorkspaceSwap({ kind: 'script', previousKind: null, swapCount: 0 });
  assert.deepEqual(first, { swapCount: 0, changed: false });
  assert.equal(workspaceSwapPhase(0), '', 'and it carries no animation class');
});

test('changing workspace advances the counter; staying put does not', () => {
  let state = { swapCount: 0 };
  state = advanceWorkspaceSwap({ kind: 'panel', previousKind: 'script', swapCount: state.swapCount });
  assert.deepEqual(state, { swapCount: 1, changed: true });
  state = advanceWorkspaceSwap({ kind: 'panel', previousKind: 'panel', swapCount: state.swapCount });
  assert.deepEqual(state, { swapCount: 1, changed: false });
});

test('consecutive swaps alternate the phase, so the second one still plays', () => {
  const phases = [1, 2, 3, 4].map(workspaceSwapPhase);
  assert.deepEqual(phases, ['a', 'b', 'a', 'b']);
});

test('App.svelte drives the two phase classes and nothing else', () => {
  assert.match(app, /class:workspace-swap-a=\{workspaceSwapClass === 'a'\}/);
  assert.match(app, /class:workspace-swap-b=\{workspaceSwapClass === 'b'\}/);
  assert.match(app, /advanceWorkspaceSwap\(/, 'the counter comes from chromeMotion.js');
});

test('both phases carry a real animation, of the duration the module advertises', () => {
  const styles = app.slice(app.lastIndexOf('<style'));
  assert.match(styles, /\.workspace-swap-a[\s\S]{0,200}animation: workspace-swap-a/);
  assert.match(styles, /\.workspace-swap-b[\s\S]{0,200}animation: workspace-swap-b/);
  assert.match(styles, /@keyframes workspace-swap-a/);
  assert.match(styles, /@keyframes workspace-swap-b/);
  assert.ok(styles.includes(`${WORKSPACE_SWAP_MS}ms`), `the stylesheet uses ${WORKSPACE_SWAP_MS}ms`);
});

test('reduced motion drops it, and does so in CSS so the setting can change live', () => {
  const styles = app.slice(app.lastIndexOf('<style'));
  const block = styles.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(block, 'there is a reduced-motion block');
  assert.match(block[0], /animation: none/);
  assert.match(block[0], /workspace-swap-a/);
  assert.match(block[0], /workspace-swap-b/);
});

test('the transition never gates input', () => {
  // An animation that disabled the arriving workspace for 160ms would be worse than no
  // animation. Nothing may hide the pointer from it or defer a handler behind it.
  const styles = app.slice(app.lastIndexOf('<style'));
  const swapRules = styles.match(/\.workspace-swap-[ab][\s\S]*?@keyframes/)?.[0] ?? '';
  assert.ok(!/pointer-events/.test(swapRules), 'no pointer-events on the swap rules');
  assert.ok(!/setTimeout\([^)]*workspaceSwap/.test(app), 'nothing waits on the swap in script');
});
