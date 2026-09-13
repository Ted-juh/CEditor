import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import SoundBrowser from '../src/CE_Application/sections/SoundBrowser.svelte';
import { matchesPresetKind, presetWindow } from '../src/CE_Application/utils/soundBrowserLayout.js';
import { preferredDockHeight, normaliseDockHeights } from '../src/CE_Application/utils/hostDockSizing.js';
import { hostLibrary, hostLibraryLoad, normalizeLibraryLoad, normalizeHostLibrary } from '../src/CE_Application/stores/instrumentHost.js';

test('large libraries render a bounded window and retain the complete scroll range', () => {
  for (const height of [32, 42]) {
    for (const scroll of [0, 1000, 900000]) {
      const window = presetWindow(7854, scroll, 240, height);
      assert.ok(window.end - window.start <= Math.ceil(240 / height) + 12);
      assert.equal(window.before + (window.end - window.start) * height + window.after, 7854 * height);
      assert.ok(window.end <= 7854 && window.start >= 0);
    }
  }
  assert.deepEqual(presetWindow(0, 1000, 240), { start: 0, end: 0, before: 0, after: 0 });
  const shrunken = presetWindow(2, 90000, 240);
  assert.equal(shrunken.start, 0);
  assert.equal(shrunken.end, 2);
});

test('effect and instrument filters keep chains and racks out of preset-only results', () => {
  assert.equal(matchesPresetKind({ type: 'preset', isEffect: true }, 'effect'), true);
  assert.equal(matchesPresetKind({ type: 'preset', isEffect: true }, 'instrument'), false);
  assert.equal(matchesPresetKind({ type: 'preset', isEffect: false }, 'instrument'), true);
  assert.equal(matchesPresetKind({ type: 'rack' }, 'instrument'), false);
  assert.equal(matchesPresetKind({ type: 'chain' }, 'effect'), false);
});

test('preset count cannot force the dock to grow and Sounds remembers its own height', () => {
  assert.equal(preferredDockHeight('sounds', 100, 1000), preferredDockHeight('sounds', 500000, 1000));
  assert.deepEqual(normaliseDockHeights({ sounds: 350, midi: 200 }), { sounds: 350, midi: 200 });
});

test('the initial dock view has bounded rows, one load bar and no permanent tools or inspector', () => {
  hostLibrary.set(normalizeHostLibrary({ records: Array.from({ length: 7854 }, (_, i) => ({
    recordId: `preset-${i}`, type: 'preset', name: `Preset ${i}`, instrument: 'Spire', available: true,
  })), counts: { total: 7854, matched: 7854 } }));
  const { body } = render(SoundBrowser, { props: { focusedPart: { partId: 'part-1', hasInstrument: true }, partTitle: () => '01 · Spire' } });
  assert.ok((body.match(/data-testid="preset-row"/g) ?? []).length < 30);
  assert.equal((body.match(/data-testid="sound-load"/g) ?? []).length, 1);
  assert.ok(!body.includes('data-testid="browser-inspector"'));
  assert.ok(!body.includes('aria-label="Library tools"'));
  assert.ok(body.includes('01 · Spire'));
});

test('load feedback names the result, permits retry and does not follow selection to another preset', () => {
  hostLibrary.set(normalizeHostLibrary({ records: [{ recordId: 'sound', type: 'preset', name: 'Glass Keys', available: true }],
    counts: { total: 1, matched: 1 } }));
  hostLibraryLoad.set(normalizeLibraryLoad({ recordId: 'sound', phase: 'failed', message: 'The plug-in refused Glass Keys.' }));
  const props = { focusedPart: { partId: 'part-1' }, partTitle: () => '01 · Zebra3' };
  assert.ok(render(SoundBrowser, { props }).body.includes('The plug-in refused Glass Keys.'));
  hostLibraryLoad.set(normalizeLibraryLoad({ recordId: 'other', phase: 'failed', message: 'An older selection failed.' }));
  assert.ok(!render(SoundBrowser, { props }).body.includes('An older selection failed.'));
  hostLibraryLoad.set(normalizeLibraryLoad());
});

test('update results keep usable files, named programs and unavailable records distinct', () => {
  const result = normalizeHostLibrary({ updateFinished: true, scanReport: [{ name: 'Zebra3',
    count: 1355, files: 1355, programs: 0, unavailable: 2, unnamedPrograms: 128 }] });
  assert.equal(result.updateFinished, true);
  assert.deepEqual(result.scanReport[0], { name: 'Zebra3', kind: '', count: 1355, files: 1355,
    programs: 0, unavailable: 2, unnamedPrograms: 128, reason: '' });
  assert.equal(normalizeHostLibrary({}).updateFinished, false);
  assert.deepEqual(normalizeLibraryLoad(null), { phase: 'idle', recordId: '', name: '', partId: '', message: '' });
});
