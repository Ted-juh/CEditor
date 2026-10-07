// hostageFixes.test.js — product problems found while writing the HoSTage manual, and fixed.
//
//   - a scene or a song could call up only the rack's first three control pages;
//   - effects dropped on a bus could not be reordered, bypassed or removed anywhere;
//   - a Screen Builder tab ignored its ×, and Ctrl+W dropped its unsaved pages without a word;
//   - Build product said what it needs only after it failed.
//
// The CTRL49 stage pages that were forgotten at every launch are fixed in the host itself and
// tested in CE/tests/InstrumentHostServiceTests.cpp (testCtrl49StagePagesRemembered).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { render } from 'svelte/server';

import ControllerPagePick from '../src/CE_Application/sections/performance/ControllerPagePick.svelte';

const source = (file) => readFileSync(new URL(`../src/CE_Application/${file}`, import.meta.url), 'utf8');
const pages = (n) => Array.from({ length: n }, (_, i) => ({ pageId: `p${i + 1}`, name: `Page ${i + 1}` }));

test('scenes and songs can call up every control page, not just the first three', () => {
  const few = render(ControllerPagePick, { props: { pages: pages(3), value: 'p2', label: 'pick' } }).body;
  assert.doesNotMatch(few, /<select/, 'up to three pages, the one-click buttons stay');
  assert.match(few, /Page 3/);

  const many = render(ControllerPagePick, { props: { pages: pages(7), value: 'p6', label: 'pick' } }).body;
  assert.match(many, /<select/, 'past three, a list');
  const options = [...many.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(options, ['Keep', ...pages(7).map((p) => p.name)], 'Keep, then every page');

  for (const file of ['sections/PerformancePanel.svelte', 'sections/performance/SongsPage.svelte']) {
    const text = source(file);
    assert.match(text, /<ControllerPagePick pages=\{\$hostState\.rack\.pages\}/, `${file} offers every page`);
    assert.doesNotMatch(text, /rack\.pages\.slice\(0, 3\)/, `${file} no longer cuts the list at three`);
  }
});

test('a bus\'s effects can be reordered, bypassed and removed, in the dock\'s Rack tab', () => {
  const view = source('sections/InstrumentHostView.svelte');
  assert.match(view, /\{#each \$hostState\.rack\.buses as bus \(bus\.busId\)\}[\s\S]{0,200}\{@render effectChain\(bus\.effects, bus\.busId,/,
    'each bus gets the same effect chain as the master and the returns');
  // The host already took a bus id wherever it takes a chain (InstrumentRackHost::chainFor), so
  // the chain's add, move, bypass and remove reach it unchanged.
  assert.match(source('sections/HostMixerPanel.svelte'), /title="The bus's effects are listed in the dock's Rack tab"/);
});

test('a Screen Builder tab closes from its ×, and asks before throwing changes away', async () => {
  const { closeScreenTab, activeEditorTab } = await import('../src/CE_Application/stores/panels.js');
  const { createScreenDocument, screenDocuments, setScreenPageTitle } = await import('../src/CE_Application/stores/screenBuilder.js');

  const hadWindow = 'window' in globalThis;
  const previous = globalThis.window;
  const asked = [];
  let answer = false;
  globalThis.window = { ...(previous ?? {}), confirm: (message) => { asked.push(message); return answer; } };
  try {
    const untouched = createScreenDocument();
    assert.equal(closeScreenTab(untouched.id), true);
    assert.equal(asked.length, 0, 'nothing to lose, nothing asked');
    assert.ok(!get(screenDocuments).some((doc) => doc.id === untouched.id));

    const edited = createScreenDocument();
    activeEditorTab.set({ type: 'screen', id: edited.id });
    setScreenPageTitle(edited.id, 0, 'LEAD');
    assert.equal(closeScreenTab(edited.id), false, 'kept when the answer is no');
    assert.match(asked[0], /cannot save/, 'the question says why it matters');
    assert.ok(get(screenDocuments).some((doc) => doc.id === edited.id));

    answer = true;
    assert.equal(closeScreenTab(edited.id), true);
    assert.ok(!get(screenDocuments).some((doc) => doc.id === edited.id));
    assert.equal(get(activeEditorTab)?.type, 'panel', 'and the tab it leaves is not a closed screen');
  } finally {
    if (hadWindow) globalThis.window = previous; else delete globalThis.window;
  }

  assert.match(source('editor/TabBar.svelte'), /tab\.tabType === 'screen'\) \{\s*closeScreenTab\(tab\.id\)/,
    'the ×, middle click and Close in the tab menu reach it');
  assert.match(source('sections/ScreenBuilderEditor.svelte'), /navigator\.clipboard\.writeText\(exportJson\)/,
    'with no Save, the pages leave by Copy');
});

test('Build product says what it needs before it is pressed', () => {
  const view = source('sections/InstrumentHostView.svelte');
  const note = view.match(/data-testid="host-build-needs">([\s\S]*?)<\/p>/)?.[1] ?? '';
  assert.match(note, /Node\.js/);
  assert.match(note, /source checkout/);
  assert.match(note, /installed CEditor\s+cannot build a product yet/);
});
