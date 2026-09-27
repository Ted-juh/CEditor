import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrangementBlocks, formatDuration, parseSongLength, pushHistory, stageKeyAction, stageTimers, stageTroubles,
} from '../src/CE_Application/utils/stageScreen.js';

test('durations read the way a stage clock does', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65_400), '1:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(-5), '0:00');
});

test('the song and the set against their plan', () => {
  const t0 = 1_000_000;
  const setlist = {
    items: [{ plannedSeconds: 240 }, { plannedSeconds: 300 }, { plannedSeconds: 0 }],
    currentIndex: 1, startedAtMs: t0, songStartedAtMs: t0 + 250_000,
  };
  const timers = stageTimers(setlist, t0 + 250_000 + 60_000);
  assert.equal(timers.setMs, 310_000);
  assert.equal(timers.songMs, 60_000);
  assert.equal(timers.songLeftMs, 240_000);
  assert.equal(timers.ahead, -10_000, 'the first song ran ten seconds long');
  assert.equal(timers.over, false);
  assert.equal(stageTimers(setlist, t0 + 250_000 + 301_000).over, true, 'past its planned length');
  assert.equal(timers.totalPlannedMs, 0, 'a set with an unplanned song has no total');
  assert.equal(stageTimers({ ...setlist, currentIndex: 2 }, t0 + 600_000).plannedMs, 0);
  assert.equal(stageTimers({ items: [], currentIndex: -1 }).setMs, 0, 'no set, no clock');
});

test('an arrangement reads as blocks with the current one filling', () => {
  const arrangement = {
    playing: true, currentIndex: 1, queuedIndex: -1, progress: 0.25, bar: 5, loop: false, ending: false,
    items: [{ itemId: 'a', name: 'Intro', bars: 8 }, { itemId: 'b', name: 'Verse', bars: 16 }, { itemId: 'c', name: 'Chorus', bars: 16 }],
  };
  const view = arrangementBlocks(arrangement);
  assert.deepEqual(view.blocks.map((b) => b.state), ['done', 'now', 'later']);
  assert.equal(view.blocks[1].progress, 0.25);
  assert.equal(view.barsLeft, 12);
  assert.equal(view.nextName, 'Chorus');
  assert.equal(arrangementBlocks({ ...arrangement, currentIndex: 2 }).nextName, 'the end');
  assert.equal(arrangementBlocks({ ...arrangement, currentIndex: 2, loop: true }).nextName, 'Intro');
  assert.equal(arrangementBlocks({ ...arrangement, queuedIndex: 0 }).blocks[0].state, 'queued');
  assert.equal(arrangementBlocks({ ...arrangement, playing: false }).playing, false);
});

test('trouble on stage comes with the fix, most urgent first', () => {
  const troubles = stageTroubles({
    automaticFailover: { events: [
      { targetId: 'fx-1', name: 'Reverb', state: 'recovered' },
      { targetId: 'part-3', name: 'Lead', state: 'failed', error: 'It crashed.' },
    ] },
    midi: { issues: [
      { kind: 'programChange', key: 'pc', text: 'advisory' },
      { kind: 'heldNote', key: 'held', noteName: 'E2', text: 'held', parts: [] },
      { kind: 'stuckNote', key: 'stuck', noteName: 'C4', text: 'stuck', parts: [{ partId: 'p2', name: 'Strings' }] },
    ] },
  });
  assert.deepEqual(troubles.map((t) => t.kind), ['failover', 'note', 'note'], 'recovered and advisory items are not stage news');
  assert.equal(troubles[0].actions[0].kind, 'retry');
  const stuck = troubles.find((t) => t.title.startsWith('Stuck'));
  assert.deepEqual(stuck.actions, [{ kind: 'panicPart', label: 'Silence Strings', partId: 'p2' }], 'the fix is aimed at the part');
  assert.equal(troubles.find((t) => t.title.startsWith('Held')).actions[0].kind, 'panic', 'with no part named, silence everything');
  assert.deepEqual(stageTroubles({}), []);
});

test('the CPU history keeps the last minute', () => {
  let h = [];
  for (let i = 0; i < 70; i += 1) h = pushHistory(h, i / 100);
  assert.equal(h.length, 60);
  assert.equal(h[59], 0.69);
  assert.equal(pushHistory([], 7)[0], 1, 'clamped');
});

test('the stage keys: the ones a pedal or page turner sends run the set', () => {
  assert.deepEqual(stageKeyAction({ key: 'PageDown' }), { kind: 'next' });
  assert.deepEqual(stageKeyAction({ key: 'ArrowLeft' }), { kind: 'previous' });
  assert.deepEqual(stageKeyAction({ key: ' ' }), { kind: 'playStop' });
  assert.deepEqual(stageKeyAction({ key: '3' }), { kind: 'scene', index: 2 });
  assert.deepEqual(stageKeyAction({ key: 'N', shiftKey: true }), { kind: 'notesSize', delta: -2 });
  assert.equal(stageKeyAction({ key: 'x' }), null);
});

test('a song length types as m:ss or as minutes', () => {
  assert.equal(parseSongLength('4:30'), 270);
  assert.equal(parseSongLength('4'), 240);
  assert.equal(parseSongLength('4.5'), 270);
  assert.equal(parseSongLength('3 min'), 180);
  assert.equal(parseSongLength('none'), 0);
  assert.equal(parseSongLength('soon'), null);
  assert.equal(parseSongLength('90:00'), 3600, 'at most an hour');
});
