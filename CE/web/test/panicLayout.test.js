import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PANIC_SCOPES, panicScope, panicChannel, panicChannels, panicMessages,
  panicLabel, panicSummary, panicGeometry, panicHit,
} from '../src/CE_Application/utils/panicLayout.js';

function pc(c) { return { _children: { Core: { controlType: 'Panic' }, Panic: c } }; }

test('scope defaults to every channel', () => {
  assert.equal(panicScope(pc({})), 'all');
  assert.equal(panicScope(pc({ scope: 'nope' })), 'all');
  assert.equal(panicChannels(pc({})).length, 16);
  assert.deepEqual(panicChannels(pc({ scope: 'channel', channel: 10 })), [10]);
  assert.deepEqual(panicChannels(pc({ scope: 'channel', channel: 99 })), [16]);
  assert.equal(panicChannel(pc({ channel: 0 })), 1);
  assert.deepEqual(PANIC_SCOPES, ['all', 'channel']);
});

test('the silence set is sound-off BEFORE notes-off', () => {
  const m = panicMessages(pc({ scope: 'channel', channel: 1 }));
  // 120 first: all-notes-off only lifts the keys, so on a long release the tail
  // would still be ringing if 123 came first.
  assert.deepEqual(m[0], [0xB0, 120, 0]);
  assert.deepEqual(m[1], [0xB0, 123, 0]);
  assert.deepEqual(m[2], [0xB0, 121, 0]);        // reset controllers
  assert.deepEqual(m[3], [0xE0, 0x00, 0x40]);    // bend centred
  assert.equal(m.length, 4);
});

test('the optional parts can be turned off', () => {
  const bare = panicMessages(pc({ scope: 'channel', channel: 1, resetControllers: false, centreBend: false }));
  assert.deepEqual(bare, [[0xB0, 120, 0], [0xB0, 123, 0]]);
  const noBend = panicMessages(pc({ scope: 'channel', channel: 1, centreBend: false }));
  assert.deepEqual(noBend, [[0xB0, 120, 0], [0xB0, 123, 0], [0xB0, 121, 0]]);
});

test('all-channel panic covers 1..16 with the right status bytes', () => {
  const m = panicMessages(pc({ scope: 'all' }));
  assert.equal(m.length, 16 * 4);
  assert.deepEqual(m[0], [0xB0, 120, 0]);          // channel 1
  assert.deepEqual(m[60], [0xBF, 120, 0]);         // channel 16
  assert.deepEqual(m[63], [0xEF, 0x00, 0x40]);
  // every channel appears exactly once in the sound-off pass
  const soundOff = m.filter((b) => b[1] === 120 && (b[0] & 0xF0) === 0xB0);
  assert.equal(soundOff.length, 16);
  assert.equal(new Set(soundOff.map((b) => b[0] & 0x0F)).size, 16);
});

test('label and summary', () => {
  assert.equal(panicLabel(pc({})), 'PANIC');
  assert.equal(panicLabel(pc({ label: '  ' })), 'PANIC');
  assert.equal(panicLabel(pc({ label: 'All Off' })), 'All Off');
  assert.equal(panicSummary(pc({})), 'all ch · reset CC · centre bend');
  assert.equal(panicSummary(pc({ scope: 'channel', channel: 10 })), 'ch 10 · reset CC · centre bend');
  assert.equal(panicSummary(pc({ resetControllers: false, centreBend: false })), 'all ch');
});

test('geometry + hit-test', () => {
  const g = panicGeometry(120, 44, 6);
  assert.deepEqual(g, { x: 6, y: 6, w: 108, h: 32 });
  assert.equal(panicHit(g, 10, 10), true);
  assert.equal(panicHit(g, 2, 10), false);
  assert.equal(panicHit(g, 10, 42), false);
});
