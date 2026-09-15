// performancePatternControls.test.js — the pattern controls, rendered.
//
// Companion to soundBrowserRefusals.test.js, and there for the same reason: two features were
// added to this panel with the store and the bundle checked and the drawn markup never looked at.
//
// The two properties pinned here are the ones a user would notice being wrong:
//
//   The seed shows the pattern's ACTUAL seed. A field that always read 1 would look broken and
//   be indistinguishable from one that works, since the number means nothing on its own.
//   The seed says when it is inert. It governs probability alone — a condition is loop
//   arithmetic, and 0 or 100 answer before the dice are reached — so on a pattern of plain
//   always-on steps it changes nothing, and must say so rather than let somebody conclude the
//   control is broken.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import PerformancePanel from '../src/CE_Application/sections/PerformancePanel.svelte';
import {
  hostState, mockHostState, applyMockCommand,
} from '../src/CE_Application/stores/instrumentHost.js';

function renderWith(state) {
  hostState.set(state);
  return render(PerformancePanel, { props: {} }).body;
}

/** The seed input as rendered, sliced by test id — the scoped class hash is not pinned. */
const seedInput = (html) => {
  const start = html.indexOf('data-testid="pattern-seed"');
  if (start < 0) return null;
  const from = html.lastIndexOf('<input', start);
  return html.slice(from, html.indexOf('>', start) + 1);
};

test('the seed field shows the pattern its own seed, not a placeholder', () => {
  const state = mockHostState();
  const seed = state.performance.patterns[0].seed;

  assert.ok(seed > 1, 'the preview mints a real seed rather than leaving every pattern at 1');

  const input = seedInput(renderWith(state));
  assert.ok(input, 'the seed field is drawn');
  assert.match(input, new RegExp(`value="${seed}"`),
    "the field shows this pattern's seed, so it can be written down and typed back");
});

test('a pattern where nothing rolls says the seed is inert', () => {
  // The preview's steps are all plain, so no probability is ever rolled.
  const input = seedInput(renderWith(mockHostState()));

  assert.match(input, /class="[^"]*\binert\b/,
    'a seed with nothing to decide is dimmed rather than left looking active');
});

test('one step with a real probability makes the seed live again', () => {
  let state = mockHostState();
  const pattern = state.performance.patterns[0];
  state = applyMockCommand(state, {
    cmd: 'setStep', patternId: pattern.patternId, laneId: pattern.lanes[0].laneId,
    index: 0, active: true, probability: 50,
  });

  const input = seedInput(renderWith(state));
  assert.ok(!/class="[^"]*\binert\b/.test(input),
    'a single step between 1 and 99 is enough for the seed to decide something');
});

test('a probability of 0 or 100 does not wake the seed', () => {
  // Both short-circuit before the roll (CompiledPattern.h): 100 always fires, 0 never does.
  for (const probability of [0, 100]) {
    let state = mockHostState();
    const pattern = state.performance.patterns[0];
    state = applyMockCommand(state, {
      cmd: 'setStep', patternId: pattern.patternId, laneId: pattern.lanes[0].laneId,
      index: 0, active: true, probability,
    });

    assert.match(seedInput(renderWith(state)), /class="[^"]*\binert\b/,
      `probability ${probability} answers before the dice, so the seed is still inert`);
  }
});

test('the feel of a pattern can be stolen from the panel', () => {
  const html = renderWith(mockHostState());

  const start = html.indexOf('data-testid="steal-groove"');
  assert.ok(start > 0, 'the button is drawn');
  const button = html.slice(html.lastIndexOf('<button', start), html.indexOf('</button>', start));

  assert.ok(!/\bdisabled\b/.test(button), 'and is offered, since the preview is well short of 32 grooves');
  assert.match(button, /Steal this feel/);
  assert.match(button, /velocity is kept as a multiplier/,
    'and says what it cannot do, because the timing round trips and the velocity does not');
});
