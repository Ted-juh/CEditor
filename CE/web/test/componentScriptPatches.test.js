// The script-command reducers added for the Arpeggiator, Turing Modulator, Gesture Looper,
// and the Phrase Sequencer's pattern-slot/song-mode extension. All pure: patch-only, and an
// unknown or out-of-range argument is a silent no-op (a typo on a footswitch must not fire).

import test from 'node:test';
import assert from 'node:assert/strict';
import { arpScriptPatch } from '../src/CE_Application/utils/arpLayout.js';
import { turingScriptPatch } from '../src/CE_Application/utils/turingLayout.js';
import { looperScriptPatch } from '../src/CE_Application/utils/looperLayout.js';
import { phraseScriptPatch } from '../src/CE_Application/utils/phraseLayout.js';

test('arpScriptPatch: valid fields patch, junk is a no-op', () => {
  assert.deepEqual(arpScriptPatch({}, 'pattern', { pattern: 'updown' }), { pattern: 'updown' });
  assert.deepEqual(arpScriptPatch({}, 'pattern', { pattern: 'sideways' }), {});
  assert.deepEqual(arpScriptPatch({}, 'division', { division: '1/8T' }), { division: '1/8T' });
  assert.deepEqual(arpScriptPatch({}, 'division', { division: '1/7' }), {});
  assert.deepEqual(arpScriptPatch({}, 'octaves', { octaves: 9 }), { octaves: 4 });
  assert.deepEqual(arpScriptPatch({}, 'gate', { gate: 1.5 }), { gate: 1 });
  assert.deepEqual(arpScriptPatch({}, 'sync', {}), { syncToTransport: true });
  assert.deepEqual(arpScriptPatch({}, 'sync', { on: false }), { syncToTransport: false });
  // Setting the Arp's own swing also detaches it from the transport's shared swing.
  assert.deepEqual(arpScriptPatch({}, 'swing', { swing: 0.3 }), { swing: 0.3, swingSource: 'own' });
  assert.deepEqual(arpScriptPatch({}, 'source', { source: 'input' }), { source: 'input' });
  assert.deepEqual(arpScriptPatch({}, 'nonsense', {}), {});
});

test('turingScriptPatch: lock knob, register moves, deterministic seed', () => {
  assert.deepEqual(turingScriptPatch({}, 'randomness', { randomness: 2 }), { randomness: 1 });
  assert.deepEqual(turingScriptPatch({}, 'length', { length: 100 }), { length: 64 });
  assert.deepEqual(turingScriptPatch({ length: 4 }, 'clear', {}), { steps: [0, 0, 0, 0] });
  // seed uses the injected roll, so it's reproducible in tests.
  assert.deepEqual(turingScriptPatch({ length: 3 }, 'seed', {}, () => 0.25), { steps: [0.25, 0.25, 0.25] });
  assert.deepEqual(turingScriptPatch({}, 'quantize', { levels: 12 }), { quantizeLevels: 12 });
  assert.deepEqual(turingScriptPatch({}, 'division', { division: '1/8' }), { division: '1/8' });
  assert.deepEqual(turingScriptPatch({}, 'division', { division: 'x' }), {});
});

test('looperScriptPatch: lanes by index/id/label, loop length, sync', () => {
  const lanes = [
    { id: 'l0', label: 'Cutoff', points: [{ t: 0, v: 1 }], rest: 0, enabled: true },
    { id: 'l1', label: 'Reso', points: [{ t: 0.5, v: 0.2 }], rest: 0, enabled: true },
  ];
  const muted = looperScriptPatch({ lanes }, 'laneEnable', { lane: 2, enabled: false });
  assert.equal(muted.lanes[1].enabled, false);
  assert.equal(muted.lanes[0].enabled, true, 'other lanes untouched');
  const byLabel = looperScriptPatch({ lanes }, 'laneClear', { lane: 'cutoff' });
  assert.deepEqual(byLabel.lanes[0].points, []);
  assert.deepEqual(byLabel.lanes[1].points, lanes[1].points, 'only the named lane cleared');
  const wiped = looperScriptPatch({ lanes }, 'clear', {});
  assert.ok(wiped.lanes.every((l) => l.points.length === 0));
  assert.deepEqual(looperScriptPatch({ lanes }, 'laneEnable', { lane: 7 }), {}, 'missing lane is a no-op');
  assert.deepEqual(looperScriptPatch({}, 'bars', { bars: 2 }), { loopBars: 2 });
  assert.deepEqual(looperScriptPatch({}, 'seconds', { seconds: 0 }), {}, 'non-positive length is a no-op');
  assert.deepEqual(looperScriptPatch({}, 'sync', { on: false }), { syncToTransport: false });
});

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
