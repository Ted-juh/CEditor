import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  clampDockHeight,
  dockHeightBounds,
  normaliseDockHeights,
  preferredDockHeight,
  restoreDockHeights,
  storeDockHeights,
} from '../src/CE_Application/utils/hostDockSizing.js';

test('dock bounds preserve most of the workspace and remain usable in a short window', () => {
  assert.deepEqual(dockHeightBounds(1000), { minimum: 140, maximum: 480 });
  assert.deepEqual(dockHeightBounds(500), { minimum: 140, maximum: 240 });
  assert.equal(clampDockHeight(600, 500), 240);
  assert.equal(clampDockHeight(20, 500), 140);
});

test('short tabs stay compact while content-heavy tabs fit up to the safe limit', () => {
  assert.equal(preferredDockHeight('zone', 40, 700), 170);
  assert.equal(preferredDockHeight('params', 80, 700), 240);
  assert.equal(preferredDockHeight('midi', 400, 700), 336);
  assert.equal(preferredDockHeight('rack', 900, 500), 240);
});

test('manual heights are remembered per tab and hostile values are ignored', () => {
  assert.deepEqual(normaliseDockHeights({ zone: 210.4, midi: '300', bad: 400, rack: null }), {
    zone: 210,
    midi: 300,
  });

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  storeDockHeights({ zone: 205, params: 390 }, storage);
  assert.deepEqual(restoreDockHeights(storage), { zone: 205, params: 390 });
});

test('the host measures real dock content and exposes drag plus fit-to-content', () => {
  const source = fs.readFileSync(
    new URL('../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url),
    'utf8',
  );
  assert.match(source, /bind:clientHeight=\{buildContentHeight\}/);
  assert.match(source, /dock-body-content" bind:this=\{dockContentElement\}/);
  assert.match(source, /ondblclick=\{resetDockHeight\}/);
  assert.match(source, /dockHeights = \{ \.\.\.dockHeights, \[dockTab\]: dockHeight \}/);
});
