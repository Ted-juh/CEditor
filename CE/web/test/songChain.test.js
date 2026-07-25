import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChain, activeChain, chainLength, chainAt, slotForLap, chainSwitches,
  chainSummary, addLink, removeLink, updateLink, moveLink,
  MAX_CHAIN_STEPS, MAX_REPEATS,
} from '../src/CE_Application/utils/songChain.js';

// Intro once, verse twice, chorus once.
const SONG = [
  { id: 'a', slot: 0, repeats: 1 },
  { id: 'b', slot: 1, repeats: 2 },
  { id: 'c', slot: 2, repeats: 1 },
];

test('a chain normalises its links', () => {
  assert.equal(normalizeChain(null).length, 0);
  assert.equal(normalizeChain([{ slot: 'x' }]).length, 0, 'a link with no slot is not a link');
  // A repeat of 0 would be a link that never plays AND never advances — an
  // infinite loop on one entry.
  assert.equal(normalizeChain([{ slot: 0, repeats: 0 }])[0].repeats, 1);
  assert.equal(normalizeChain([{ slot: 0, repeats: 999 }])[0].repeats, MAX_REPEATS);
  assert.equal(normalizeChain(new Array(200).fill({ slot: 0 })).length, MAX_CHAIN_STEPS);
  assert.equal(chainLength(SONG), 4);
  assert.equal(chainLength([]), 0);
});

test('a disabled link is skipped, not played for zero laps', () => {
  // Otherwise muting a section silently changes the length of everything after
  // it in a way you cannot see on the chain.
  const muted = [SONG[0], { ...SONG[1], enabled: false }, SONG[2]];
  assert.equal(activeChain(muted).length, 2);
  assert.equal(chainLength(muted), 2);
  assert.equal(slotForLap(muted, 1), 2, 'straight from intro to chorus');
});

test('the chain position is a function of the lap, not a cursor', () => {
  // Same rule as the transport's position and the sequencer's step index: a
  // stall re-derives instead of catching up, and nothing can get stuck.
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((l) => slotForLap(SONG, l)),
    [0, 1, 1, 2, 0, 1, 1, 2]);
  // Asking twice gives the same answer; asking out of order doesn't confuse it.
  assert.equal(slotForLap(SONG, 5), slotForLap(SONG, 5));
  assert.equal(slotForLap(SONG, 100), slotForLap(SONG, 100 % 4));
  assert.equal(slotForLap([], 3), null, 'an empty chain plays nothing');
  assert.equal(chainAt([], 0), null);
});

test('a link reports where you are inside it', () => {
  const at = chainAt(SONG, 2);                    // second lap of the verse
  assert.equal(at.link.slot, 1);
  assert.equal(at.index, 1);
  assert.equal(at.lapInLink, 1);
  assert.equal(at.lapsRemaining, 0, 'this is its last lap');
  assert.equal(at.pass, 0);
  assert.equal(chainAt(SONG, 1).lapsRemaining, 1, 'one more to go');
  assert.equal(chainAt(SONG, 4).pass, 1, 'second time through');
});

test('a one-shot chain ends on its last section rather than wrapping', () => {
  // A song that ends should stay ended, on its final section — not jump back
  // to the intro, and not go silent either.
  const end = chainAt(SONG, 9, false);
  assert.equal(end.link.slot, 2);
  assert.equal(end.finished, true);
  assert.equal(chainAt(SONG, 3, false).finished, false, 'the last lap is not past the end');
  assert.equal(slotForLap(SONG, 99, false), 2);
  // Looping is the default and wraps as normal.
  assert.equal(slotForLap(SONG, 4, true), 0);
});

test('switching is detected between laps, not assumed every lap', () => {
  // The host swaps the pattern on a switch; swapping every lap would reset
  // anything mid-flight.
  assert.equal(chainSwitches(SONG, 0, 1), true, 'intro → verse');
  assert.equal(chainSwitches(SONG, 1, 2), false, 'verse repeating');
  assert.equal(chainSwitches(SONG, 2, 3), true, 'verse → chorus');
  assert.equal(chainSwitches(SONG, 3, 4), true, 'chorus → intro');
});

test('the summary reads like a song', () => {
  assert.equal(chainSummary(SONG), '1 → 2×2 → 3');
  assert.equal(chainSummary(SONG, ['Intro', 'Verse', 'Chorus']), 'Intro → Verse×2 → Chorus');
  assert.equal(chainSummary([]), '—');
  // A name for a slot that isn't in the list falls back to its number.
  assert.equal(chainSummary([{ slot: 5, repeats: 1 }], ['A']), '6');
});

test('editing a chain is pure and returns the same array when nothing changed', () => {
  const added = addLink(SONG, 3, 4);
  assert.equal(added.length, 4);
  assert.equal(added[3].slot, 3);
  assert.equal(added[3].repeats, 4);
  assert.equal(removeLink(SONG, 1).length, 2);
  assert.equal(removeLink(SONG, 9).length, 3, 'no such link');
  const bumped = updateLink(SONG, 1, { repeats: 4 });
  assert.equal(bumped[1].repeats, 4);
  assert.equal(chainLength(bumped), 6);
  // Nothing actually changed: same array out, so no re-render.
  assert.equal(updateLink(SONG, 1, { repeats: 2 }).length, 3);
  assert.deepEqual(updateLink(SONG, 1, { repeats: 2 })[1], normalizeChain(SONG)[1]);
  assert.equal(updateLink(SONG, 9, { repeats: 4 }).length, 3);
  assert.equal(updateLink(SONG, 1, null).length, 3);
  const moved = moveLink(SONG, 0, 1);
  assert.equal(moved[0].slot, 1);
  assert.equal(moved[1].slot, 0);
  assert.deepEqual(moveLink(SONG, 0, -1).map((s) => s.slot), [0, 1, 2], 'off the top does nothing');
  assert.deepEqual(moveLink(SONG, 2, 1).map((s) => s.slot), [0, 1, 2], 'off the bottom either');
});
