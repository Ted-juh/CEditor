// followGraph.test.js — the song form as it is actually drawn.
//
// The rules are pinned in instrumentHost.test.js against what PerformanceEngine was measured to
// do. What is pinned here is that the drawing tells the truth about them, because a graph is only
// worth having if the thing on screen and the thing in the engine are the same shape — and every
// way of getting that wrong (an arrow drawn for a follow that never fires, a stop drawn as a
// hand-off, a warning computed and never shown) leaves every other check passing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import FollowGraph from '../src/CE_Application/sections/FollowGraph.svelte';
import { mockHostState } from '../src/CE_Application/stores/instrumentHost.js';

const draw = (clips) => render(FollowGraph, { props: { clips } }).body;
const count = (html, testid) => (html.match(new RegExp(`data-testid="${testid}"`, 'g')) ?? []).length;

/** One node's group as rendered, sliced by position rather than matched whole: Svelte appends a
    scoped class to every element and the hash moves whenever the stylesheet does. */
const nodeAt = (html, index) => {
  const parts = html.split('data-testid="graph-node"');
  return parts[index + 1] ?? null;
};

test('the demo song draws every kind of hand-off it has', () => {
  const html = draw(mockHostState().performance.clips);

  assert.match(html, /data-testid="follow-graph"/);
  assert.equal(count(html, 'graph-node'), 4, 'one box per clip');

  // Two arrows, not five: the Random follow is a fan to every other clip, and four more arrows
  // out of one box would say less than the count does.
  assert.equal(count(html, 'graph-edge'), 2);
  assert.equal(count(html, 'graph-fan'), 1, 'the fan is drawn as a fan');
  assert.equal(count(html, 'graph-stop'), 1, 'and the end is drawn as an end');

  assert.match(nodeAt(html, 0), /→ Verse, after 2/, 'a named target says where it goes');
  assert.match(nodeAt(html, 1), /next: Chorus, after 4/, 'Next says which clip that turns out to be');
  assert.match(nodeAt(html, 2), /any of 3, after 2/, 'Random says how wide it is');
  assert.match(nodeAt(html, 3), /stops after 1 loop/);

  assert.ok(!html.includes('data-testid="follow-graph-warnings"'),
    'a form that works is drawn without a complaint on it');
});

test('a Next arrow is drawn differently from a named one', () => {
  // Next means "the next row", so it is the one edge whose meaning is the layout itself. If the
  // two ever drew identically, the graph would be claiming a target that was never chosen.
  const html = draw(mockHostState().performance.clips);

  assert.equal(count(html, 'graph-edge'), 2);
  assert.equal((html.match(/class="edge svelte-[^"]* next"/g) ?? []).length, 1,
    'exactly one of the two is marked as a Next — the other names its target');
});

test('a follow that never fires is drawn as no arrow at all, and named', () => {
  // Loop off with a follow count above 1: the engine ends the clip at its first pass and the
  // hand-off never happens (probe Q1). Drawing the arrow would be the panel repeating the lie
  // the dropdown already tells.
  const html = draw([
    { clipId: 'a', name: 'Hit', loop: false, followAction: 'clip', followClipId: 'b',
      followAfterLoops: 4 },
    { clipId: 'b', name: 'Groove', loop: true },
  ]);

  assert.equal(count(html, 'graph-edge'), 0, 'no arrow for a hand-off that does not happen');
  assert.match(nodeAt(html, 0), /never fires/, 'the box says so where the destination would be');
  assert.match(html, /data-testid="graph-warning-dead-follow"/);
  assert.match(html, /Loop is off/);
  assert.match(html, /data-testid="follow-graph-warn-count"/, 'and the collapsed header carries a count');
});

test('a Target clip with nothing chosen is drawn as the stop it really is', () => {
  const html = draw([
    { clipId: 'a', name: 'Hit', loop: true, followAction: 'clip', followClipId: '',
      followAfterLoops: 2 },
    { clipId: 'b', name: 'Groove', loop: true },
  ]);

  assert.equal(count(html, 'graph-stop'), 1, 'it ends the set, so it is drawn ending it');
  assert.match(nodeAt(html, 0), /no clip chosen/);
  assert.match(html, /data-testid="graph-warning-silent-stop"/);
});

test('a ring that never lands is one warning on the graph', () => {
  const html = draw([
    { clipId: 'a', name: 'A', loop: true, followAction: 'next', followAfterLoops: 1 },
    { clipId: 'b', name: 'B', loop: true, followAction: 'next', followAfterLoops: 1 },
    { clipId: 'c', name: 'C', loop: true, followAction: 'next', followAfterLoops: 1 },
  ]);

  assert.equal(count(html, 'graph-edge'), 3, 'including the wrap from the last row to the first');
  assert.equal(count(html, 'graph-warning-no-way-out'), 1);
  assert.match(html, /A → B → C/);
  assert.equal(count(html, 'graph-stop'), 0, 'there is no end to draw, which is the point');
});

test('a clip nothing leads to is labelled rather than complained about', () => {
  // It is how a set starts. Marking it is useful; calling it a mistake would be wrong.
  const html = draw([
    { clipId: 'a', name: 'Intro', loop: true, followAction: 'clip', followClipId: 'b',
      followAfterLoops: 2 },
    { clipId: 'b', name: 'Groove', loop: true },
  ]);

  assert.equal(count(html, 'graph-entry'), 1);
  assert.match(nodeAt(html, 0), /by hand/);
  assert.ok(!html.includes('data-testid="follow-graph-warnings"'));
});

test('no clips draws nothing at all', () => {
  const html = draw([]);
  assert.ok(!html.includes('data-testid="follow-graph"'),
    'an empty graph is absent, not an empty box');
});
