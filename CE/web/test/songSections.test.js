import test from 'node:test';
import assert from 'node:assert/strict';
import { barsFromDrag, dropIndex, rulerMarks, sceneColour, songSummary, totalBars } from '../src/CE_Application/utils/songSections.js';

test('dragging a section edge changes it by whole bars, 1 to 128', () => {
  assert.equal(barsFromDrag(8, 45, 10), 13);
  assert.equal(barsFromDrag(8, -44, 10), 4);
  assert.equal(barsFromDrag(2, -500, 10), 1, 'never shorter than a bar');
  assert.equal(barsFromDrag(120, 900, 10), 128, 'nor longer than 128');
  assert.equal(barsFromDrag(8, 4, 10), 8, 'less than half a bar is no change');
  assert.equal(barsFromDrag(8, 30, 0), 38, 'a zero scale does not divide by zero');
});

test('a dragged item lands where the pointer has passed the others', () => {
  const mids = [10, 30, 50, 70];
  assert.equal(dropIndex(mids, 5, 2), 0, 'before the first');
  assert.equal(dropIndex(mids, 80, 0), 3, 'after the last');
  assert.equal(dropIndex(mids, 55, 2), 2, 'past its own centre only: stays');
  assert.equal(dropIndex(mids, 35, 3), 2, 'dragged back one place');
});

test('a song reads as its sections, or the scene it plays', () => {
  assert.equal(songSummary({ sections: [{ bars: 8 }, { bars: 16 }], plannedSeconds: 245, tempo: 118 }),
    '2 sections · 24 bars · 4:05 · 118 BPM');
  assert.equal(songSummary({ sections: [] }, 'Break'), 'plays Break');
  assert.equal(songSummary({}), 'no scene yet');
  assert.equal(totalBars([{ bars: 4 }, { bars: '8' }]), 12);
});

test('the ruler and the colours', () => {
  assert.deepEqual(rulerMarks(24).marks, [1, 5, 9, 13, 17, 21]);
  assert.equal(rulerMarks(64).step, 8);
  assert.equal(rulerMarks(0).marks.length, 1);
  assert.equal(sceneColour(0), sceneColour(8), 'the palette repeats');
  assert.notEqual(sceneColour(-1), sceneColour(0), 'a missing scene is grey');
});
