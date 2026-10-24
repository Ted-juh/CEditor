// sharedAnimationFrame.test.js — the free-running controls' tickers step in one frame, and the clock
// their resolves read moves once a frame, not once per ticker.
//
// Each ticker in PanelPreviewSurface had a requestAnimationFrame loop of its own and moved the clock
// at the end of it. With QA-08's five running that was five updates a frame, and every running
// control was resolved again after each: an idle panel kept a core busy for every window it was open
// in, and the release checks' second process could not get the CPU to start
// (utils/sharedAnimationFrame.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { sharedAnimationFrame } from '../src/CE_Application/utils/sharedAnimationFrame.js';

const SURFACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/CE_Application/editor/PanelPreviewSurface.svelte');

/** A frame scheduler run by hand: `frames` is what is waiting, `runFrame()` runs one. */
function fakeFrames() {
  const frames = [];
  return { frames, schedule: (fn) => frames.push(fn), runFrame: () => frames.shift()() };
}

test('every ticker steps in one frame, and the clock moves once a frame', () => {
  const { frames, schedule, runFrame } = fakeFrames();
  let clock = 0;
  const request = sharedAnimationFrame(() => { clock++; }, schedule);
  const stepped = [];
  const ticker = (name, frameCount) => {
    let left = frameCount;
    const loop = () => { stepped.push(name); if (--left > 0) request(loop); };
    request(loop);
  };
  ticker('orbit', 3); ticker('arp', 3); ticker('turing', 3); ticker('kinetic', 3); ticker('phrase', 3);
  assert.equal(frames.length, 1, 'five tickers asked for one frame');
  runFrame();
  assert.deepEqual(stepped, ['orbit', 'arp', 'turing', 'kinetic', 'phrase']);
  assert.equal(clock, 1, 'the clock moved once for all five');
  runFrame(); runFrame();
  assert.equal(clock, 2, 'it moves while any ticker carries on, and not after the last frame of them');
  assert.equal(frames.length, 0, 'and with nothing running, no frame is asked for');
});
test('a ticker that finds nothing to run stops, and moves no clock', () => {
  const { frames, schedule, runFrame } = fakeFrames();
  let clock = 0;
  const request = sharedAnimationFrame(() => { clock++; }, schedule);
  request(() => {});
  runFrame();
  assert.equal(clock, 0);
  assert.equal(frames.length, 0);
});
test('a ticker that throws does not stop the others', () => {
  const { schedule, runFrame } = fakeFrames();
  const reported = [];
  let clock = 0;
  const request = sharedAnimationFrame(() => { clock++; }, schedule, (error) => reported.push(error.message));
  let orbitFrames = 0;
  const orbit = () => { orbitFrames++; request(orbit); };
  request(() => { throw new Error('turing broke'); });
  request(orbit);
  runFrame(); runFrame();
  assert.deepEqual(reported, ['turing broke']);
  assert.equal(orbitFrames, 2, 'the orbit kept going');
  assert.equal(clock, 2);
});
test('no ticker in the preview surface moves the clock from a loop of its own', () => {
  const source = readText(SURFACE);
  assert.doesNotMatch(source, /orbitClock = now;\s*requestAnimationFrame\(/,
    'a ticker that moves orbitClock and asks for its own next frame is the pattern this replaced');
  assert.ok((source.match(/orbitFrame\(loop\)/g) ?? []).length >= 16, 'the eight tickers ask the shared frame for theirs');
});
