// The Phrase Sequencer's pattern-slot / song-mode script actions (store, load, chain,
// chainLoop) added to phraseScriptPatch. Pure: patch-only, and an unknown or out-of-range
// argument is a silent no-op (a typo on a footswitch must not fire).
//
// (The Arpeggiator / Turing / Looper reducers this file once covered were superseded by the
// declarative componentVerbs families, which cover those components with parity enforcement.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseScriptPatch } from '../src/CE_Application/utils/phraseLayout.js';

test('phraseScriptPatch: pattern slots and song mode', () => {
  const cfg = { steps: 4, rows: 8, pattern: { '0:0': {} }, patterns: [] };
  const stored = phraseScriptPatch(cfg, 'store', { slot: 1, name: 'Verse' });
  assert.equal(stored.patterns[0].name, 'Verse');
  assert.deepEqual(Object.keys(stored.patterns[0].cells), ['0:0'], 'the live pattern is copied into the slot');
  const loaded = phraseScriptPatch({ ...cfg, patterns: stored.patterns, pattern: {} }, 'load', { slot: 1 });
  assert.deepEqual(Object.keys(loaded.pattern), ['0:0']);
  assert.deepEqual(phraseScriptPatch(cfg, 'load', { slot: 3 }), {}, 'empty slot is a no-op');
  assert.deepEqual(phraseScriptPatch(cfg, 'store', { slot: 9 }), {}, 'slot beyond MAX_PATTERNS is a no-op');
  assert.deepEqual(phraseScriptPatch(cfg, 'chain', {}), { chainOn: true });
  assert.deepEqual(phraseScriptPatch(cfg, 'chain', { on: false }), { chainOn: false });
  assert.deepEqual(phraseScriptPatch(cfg, 'chainLoop', { loop: false }), { chainLoop: false });
});
