// noteLists.test.js — ce.music's lists of notes and the words their helpers take, as the Values rows
// read them: the notes by name, and the runtime's own sentence for a list it refuses or a word it
// uses as its default. scriptPreludeAgreement.test.js holds the four runtimes to the same sentences.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { scriptApiForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const api = scriptApiForTesting('', 'notes-probe');
const ONCE = / This is said only the first time\.$/;

/** What the runtime says of a call, with the once-only tail taken off as the row writes it. */
function said(fn, ...args) {
  resetScriptStateForTesting();
  clearScriptTrace();
  api[fn](...args);
  return get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => ({ severity: t.kind === 'warn' ? 'warning' : 'error', message: t.message.replace(ONCE, '') }));
}
const rowOf = (src, name) => readStatement(src, 'lua', src.indexOf('(') + 1, {}).calls[0].args.find((a) => a.name === name);

test.after(() => resetScriptStateForTesting());

test('a list of notes reads by name, and its row names them', () => {
  assert.equal(api.chordQuality(['C4', 'Eb4', 'G4']), 'min');
  assert.deepEqual(api.voiceLead(['C4', 'E4', 'G4'], ['B3', 'D4', 'G4']), [60, 64, 67]);
  assert.deepEqual(api.arpOrder(['C4', 'E4'], 'down'), [[64], [60]], 'names come back as numbers');
  const row = rowOf('ce.music.quality({ "C4", "Eb4", 67 })', 'notes');
  assert.deepEqual([row.kind, meaningLine(row), row.problem], ['noteList', 'C4 D#4 G4', null]);
});

test('the rows say what the runtime says of a list or a word it cannot use', () => {
  const cases = [
    ['ce.music.quality({ 60, "X9" })', 'notes', ['chordQuality', [60, 'X9']]],
    ['ce.music.lead({ 60, 64 }, { 59, true })', 'previous', ['voiceLead', [60, 64], [59, true]]],
    ['ce.music.lead({ 60 }, { 59 }, "loose")', 'mode', ['voiceLead', [60], [59], 'loose']],
    ['ce.music.octaves({ 60 }, 7)', 'octaves', ['expandOctaves', [60], 7]],
    ['ce.music.octaves({ 60 }, 2.5)', 'octaves', ['expandOctaves', [60], 2.5]],
    ['ce.music.arp({ 60, 64 }, "sideways")', 'pattern', ['arpOrder', [60, 64], 'sideways']],
  ];
  for (const [src, name, [fn, ...args]] of cases) {
    const lines = said(fn, ...args);
    assert.equal(lines.length, 1, src);
    assert.deepEqual(rowOf(src, name).problem, lines[0], src);
  }
  // A word it takes says nothing, nor does a count from 1 to 4.
  for (const [src, name] of [['ce.music.lead({ 60 }, { 59 }, "smooth")', 'mode'], ['ce.music.arp({ 60 }, "updown")', 'pattern'], ['ce.music.octaves({ 60 }, 3)', 'octaves']]) {
    assert.equal(rowOf(src, name).problem, null, src);
  }
  // …and the words are offered.
  assert.deepEqual(rowOf('ce.music.arp({ 60 }, "up")', 'pattern').meaning.choices, ['up', 'down', 'updown', 'downup', 'asPlayed', 'random', 'chord']);
});
