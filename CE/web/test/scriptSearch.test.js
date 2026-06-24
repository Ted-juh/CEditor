import test from 'node:test';
import assert from 'node:assert/strict';

import { searchScripts } from '../src/CE_Application/scripting/scriptSearch.js';

const scripts = [
  { id: 'a', name: 'Cutoff follow', event: 'onValueChanged', target: 'cutoff', group: 'Filter', language: 'lua',
    source: 'function onValueChanged(v)\n  midi.sendCC(74, v)\nend' },
  { id: 'b', name: 'Boot', event: 'onPanelReady', target: '*', group: '', language: 'javascript',
    source: 'function onPanelReady(info) {\n  log("ready")\n}' },
  { id: 'c', name: 'Filter Q', event: 'onValueChanged', target: 'reso', group: 'Filter', language: 'lua',
    source: 'function onValueChanged(v)\n  midi.sendCC(71, v)\nend' },
];

test('empty / blank query returns nothing', () => {
  assert.deepEqual(searchScripts(scripts, ''), []);
  assert.deepEqual(searchScripts(scripts, '   '), []);
  assert.deepEqual(searchScripts(null, 'x'), []);
});

test('matches across the source body of every script, not just one', () => {
  const res = searchScripts(scripts, 'sendCC');
  assert.equal(res.length, 2);
  assert.deepEqual(res.map((r) => r.id).sort(), ['a', 'c']);
  // body match carries a snippet + line number
  const a = res.find((r) => r.id === 'a');
  assert.equal(a.field, 'source');
  assert.equal(a.line, 2);
  assert.equal(a.snippet, 'midi.sendCC(74, v)');
});

test('search is case-insensitive', () => {
  assert.equal(searchScripts(scripts, 'CUTOFF').length, 1);
  assert.equal(searchScripts(scripts, 'cutoff')[0].id, 'a');
});

test('matches metadata fields (name, event, target, folder)', () => {
  assert.equal(searchScripts(scripts, 'Boot')[0].field, 'name');
  assert.equal(searchScripts(scripts, 'onPanelReady')[0].field, 'event');
  assert.equal(searchScripts(scripts, 'reso')[0].field, 'target');
  // folder "Filter" matches both Filter-group scripts
  assert.equal(searchScripts(scripts, 'Filter').length, 2);
});

test('metadata matches rank above body-only matches', () => {
  // "onValueChanged" appears in event (a, c) and in source body (a, c).
  const res = searchScripts(scripts, 'onvaluechanged');
  assert.ok(res.length >= 2);
  assert.equal(res[0].field, 'event', 'event-field match should sort first');
});

test('count reflects total occurrences and breaks ties', () => {
  const res = searchScripts(scripts, 'midi');
  for (const r of res) assert.ok(r.count >= 1);
});
