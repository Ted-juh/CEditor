// displayMode.test.js — the read-only half of binding, and the maps a display needs.
//
// The capability is small; what it has to get right is the set of things "read-only" turns off. A
// meter that still takes the mouse wheel, still tab-stops, or still exports a host parameter is not
// read-only in the way anybody meant, and each of those is invisible until somebody meets it.
//
// The other recurring assertion here is that ABSENCE SURVIVES. A display with no reading yet and a
// display reading zero must not look the same, and every function that could coerce one into the
// other is pinned.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VALUE_FLOW, acceptsFeedback, acceptsInput, applyDisplayPolicy, interactionPolicy,
  isDisplayOnly, shouldAcceptFeedback, valueFlowOf,
} from '../src/CE_Application/utils/displayMode.js';
import {
  FILL_MODE, bandFor, barGeometry, litCells, normalizedLevel, peakHold, segmentStates, textFromValue,
} from '../src/CE_Application/utils/displayMaps.js';
import { isFocusableFor, resolveTabIndexFor } from '../src/CE_Application/utils/mouseBehavior.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';

// --- the flag ---------------------------------------------------------------------------------

test('every control is two-way until it says otherwise', () => {
  // The whole capability defaults off. A panel authored before this existed carries no valueFlow
  // and must behave exactly as it did.
  assert.equal(SECTION_DEFAULTS.Behavior.valueFlow, 'twoWay');
  assert.equal(valueFlowOf(null), VALUE_FLOW.twoWay);
  assert.equal(valueFlowOf({}), VALUE_FLOW.twoWay);
  assert.equal(valueFlowOf({ valueFlow: 'nonsense' }), VALUE_FLOW.twoWay);
  assert.equal(isDisplayOnly({}), false);
});

test('the older readOnly spelling still means display', () => {
  assert.equal(valueFlowOf({ readOnly: true }), VALUE_FLOW.display);
  assert.equal(isDisplayOnly({ readOnly: true }), true);
  assert.equal(valueFlowOf({ readOnly: false }), VALUE_FLOW.twoWay);
});

test('role: display is NOT the flag', () => {
  // `role` already names the control's kind — slider, knob, button. Overloading it would leave a
  // display unable to say which kind of display it is.
  assert.equal(isDisplayOnly({ role: 'display' }), false);
});

test('the three flows differ in which direction they allow', () => {
  assert.equal(acceptsInput({ valueFlow: 'twoWay' }), true);
  assert.equal(acceptsFeedback({ valueFlow: 'twoWay' }), true);

  assert.equal(acceptsInput({ valueFlow: 'display' }), false);
  assert.equal(acceptsFeedback({ valueFlow: 'display' }), true);

  assert.equal(acceptsInput({ valueFlow: 'input' }), true);
  assert.equal(acceptsFeedback({ valueFlow: 'input' }), false);
});

test('read-only turns off every input route, including the one that sends', () => {
  const policy = interactionPolicy({ valueFlow: 'display' });
  assert.equal(policy.readOnly, true);
  assert.equal(policy.draggable, false);
  assert.equal(policy.focusable, false);
  assert.equal(policy.keyboard, false);
  assert.equal(policy.wheel, false);
  // The one easiest to miss: a meter that echoed its own feedback back would be a loop.
  assert.equal(policy.sendsOnChange, false);
});

test('a two-way control gets no opinion at all, rather than a default', () => {
  // null, not false. A resolver that returned `draggable: false` here would clobber a control that
  // resolved draggable from its own geometry.
  const policy = interactionPolicy({});
  assert.equal(policy.readOnly, false);
  assert.equal(policy.draggable, null);
  assert.equal(policy.focusable, null);
  assert.equal(policy.sendsOnChange, true);
});

test('read-only wins over an author who ticked draggable', () => {
  // Not equals: one setting says what kind of control this is, the other configures how it drags.
  const resolved = { draggable: true, focusable: true, tabIndex: 3, wheelEnabled: true };
  assert.deepEqual(applyDisplayPolicy(resolved, { valueFlow: 'display' }), {
    draggable: false, focusable: false, tabIndex: -1,
    keyboardEnabled: false, wheelEnabled: false, dragEnabled: false,
  });
  assert.deepEqual(applyDisplayPolicy(resolved, {}), resolved, 'and leaves a normal control alone');
});

test('a display is not a tab stop, whatever the Mouse tab says', () => {
  const mouse = { focusable: true, tabIndex: 4 };
  assert.equal(isFocusableFor(mouse, null), true);
  assert.equal(resolveTabIndexFor(mouse, null), 4);
  assert.equal(isFocusableFor(mouse, { valueFlow: 'display' }), false);
  assert.equal(resolveTabIndexFor(mouse, { valueFlow: 'display' }), -1);
});

// --- feedback ---------------------------------------------------------------------------------

test('the drag guard applies to two-way controls and cannot freeze a display', () => {
  // A device echo must not fight the hand on a knob. A display has no hand on it, so a stale
  // `dragging` flag in its session could only stop it updating for the rest of the session.
  assert.equal(shouldAcceptFeedback({}, { dragging: true }), false);
  assert.equal(shouldAcceptFeedback({}, { dragging: false }), true);
  assert.equal(shouldAcceptFeedback({ valueFlow: 'display' }, { dragging: true }), true);
});

test('an input-only control is never moved by feedback', () => {
  assert.equal(shouldAcceptFeedback({ valueFlow: 'input' }, {}), false);
});

test('a display exports no host parameter', () => {
  // A DAW automation lane on a meter records fine and moves nothing, because the next feedback
  // frame overwrites every value it writes.
  const panel = {
    controls: [
      { _children: { Core: { id: 'a', name: 'Cutoff' }, Behavior: { family: 'range', role: 'slider', valueType: 'float', min: 0, max: 127 } } },
      { _children: { Core: { id: 'b', name: 'Level' }, Behavior: { family: 'range', role: 'slider', valueType: 'float', min: 0, max: 127, valueFlow: 'display' } } },
    ],
  };
  const names = deriveExportParameters(panel).map((p) => p.controlName);
  assert.deepEqual(names, ['Cutoff'], 'the display exported something');
});

// --- the maps ---------------------------------------------------------------------------------

test('no reading is not a zero reading', () => {
  // The trap the whole file is built around: a meter with nothing connected and a meter reading
  // silence look identical the moment undefined coerces to 0.
  assert.equal(normalizedLevel(undefined, { min: 0, max: 127 }), null);
  assert.equal(normalizedLevel(null, { min: 0, max: 127 }), null);
  assert.equal(normalizedLevel('', { min: 0, max: 127 }), null);
  assert.equal(normalizedLevel('nope', { min: 0, max: 127 }), null);
  assert.equal(normalizedLevel(0, { min: 0, max: 127 }), 0);
});

test('a level normalises into its range and clamps outside it', () => {
  assert.equal(normalizedLevel(64, { min: 0, max: 128 }), 0.5);
  assert.equal(normalizedLevel(200, { min: 0, max: 127 }), 1);
  assert.equal(normalizedLevel(-5, { min: 0, max: 127 }), 0);
  assert.equal(normalizedLevel(5, { min: 5, max: 5 }), null, 'a zero-width range has no position');
});

test('a bar lights at least one cell for any signal above silence', () => {
  // Rounding up on purpose: on an eight-cell meter, rounding down leaves the bottom eighth of the
  // scale showing nothing, which reads as a dead device.
  assert.deepEqual(litCells(0, { min: 0, max: 100, cells: 4 }), [false, false, false, false]);
  assert.deepEqual(litCells(1, { min: 0, max: 100, cells: 4 }), [true, false, false, false]);
  assert.deepEqual(litCells(50, { min: 0, max: 100, cells: 4 }), [true, true, false, false]);
  assert.deepEqual(litCells(100, { min: 0, max: 100, cells: 4 }), [true, true, true, true]);
});

test('no reading lights nothing, and that is different from a zero reading only in intent', () => {
  assert.deepEqual(litCells(undefined, { cells: 3 }), [false, false, false]);
  assert.deepEqual(litCells(5, { min: 0, max: 100, cells: 0 }), [], 'a run of no cells is not an error');
});

test('point mode lights exactly one cell, and the top value stays in range', () => {
  assert.deepEqual(litCells(0, { min: 0, max: 100, cells: 4, mode: FILL_MODE.point }), [true, false, false, false]);
  assert.deepEqual(litCells(100, { min: 0, max: 100, cells: 4, mode: FILL_MODE.point }), [false, false, false, true]);
  const lit = litCells(60, { min: 0, max: 100, cells: 5, mode: FILL_MODE.point });
  assert.equal(lit.filter(Boolean).length, 1);
});

test('centre mode grows from the middle both ways', () => {
  const middle = litCells(50, { min: 0, max: 100, cells: 5, mode: FILL_MODE.center });
  assert.deepEqual(middle, [false, false, true, false, false]);
  const right = litCells(100, { min: 0, max: 100, cells: 5, mode: FILL_MODE.center });
  assert.deepEqual(right, [false, false, true, true, true]);
  const left = litCells(0, { min: 0, max: 100, cells: 5, mode: FILL_MODE.center });
  assert.deepEqual(left, [true, true, true, false, false]);
});

test('a peak marker rises instantly and falls slowly', () => {
  // Rising slowly would defeat the point of it: the marker exists to catch a transient too short
  // to see.
  let peak = peakHold(null, 0.8, { elapsedMs: 16 });
  assert.equal(peak.value, 0.8);

  peak = peakHold(peak, 0.1, { elapsedMs: 1000, decayPerSecond: 0.4 });
  assert.ok(Math.abs(peak.value - 0.4) < 1e-9, `fell to ${peak.value}`);

  peak = peakHold(peak, 0.9, { elapsedMs: 16 });
  assert.equal(peak.value, 0.9, 'a new peak wins immediately');
});

test('a peak marker never falls below the current level', () => {
  const peak = peakHold({ value: 0.5, heldFor: 0 }, 0.45, { elapsedMs: 10000, decayPerSecond: 1 });
  assert.equal(peak.value, 0.45);
});

test('a hold time keeps the marker still before it starts falling', () => {
  let peak = peakHold(null, 1, { elapsedMs: 0 });
  peak = peakHold(peak, 0, { elapsedMs: 100, decayPerSecond: 1, holdMs: 500 });
  assert.equal(peak.value, 1, 'still held');
  peak = peakHold(peak, 0, { elapsedMs: 500, decayPerSecond: 1, holdMs: 500 });
  assert.ok(peak.value < 1, 'and then falls');
});

test('a segment display lights by choice index, not by level', () => {
  // A five-way selector's third position is segment 2, not "40% along" — feeding it through a
  // level rounds differently at the ends and lights the wrong one on a four-way.
  assert.deepEqual(segmentStates(2, { segments: 5 }), [false, false, true, false, false]);
  assert.deepEqual(segmentStates(0, { segments: 3 }), [true, false, false]);
});

test('a segment out of range lights nothing rather than clamping', () => {
  // A selector reporting a position the display has no segment for is a mapping bug; lighting
  // segment 0 for it hides that.
  assert.deepEqual(segmentStates(9, { segments: 3 }), [false, false, false]);
  assert.deepEqual(segmentStates(-1, { segments: 3 }), [false, false, false]);
  assert.deepEqual(segmentStates(undefined, { segments: 3 }), [false, false, false]);
});

test('a segment display can be driven by choice value as well as index', () => {
  const choices = ['saw', 'square', 'sine'];
  assert.deepEqual(segmentStates('square', { choices }), [false, true, false]);
});

test('a field with no reading shows a placeholder, not a zero', () => {
  // A blank field looks broken and a "0" is a lie.
  assert.equal(textFromValue(undefined), '—');
  assert.equal(textFromValue(null, { placeholder: '--' }), '--');
  assert.equal(textFromValue(0), '0');
});

test('text formats numbers, choices and booleans the way a readout wants', () => {
  assert.equal(textFromValue(3.14159, { decimals: 2 }), '3.14');
  assert.equal(textFromValue(7, { pad: 3 }), '007');
  assert.equal(textFromValue(64, { unit: ' Hz' }), '64 Hz');
  assert.equal(textFromValue(true), 'On');
  assert.equal(textFromValue(1, { choices: [{ label: 'Saw' }, { label: 'Square' }] }), 'Square');
  assert.equal(textFromValue('Init Patch'), 'Init Patch');
});

test('bar geometry moves the start as well as the length in centre mode', () => {
  // A caller that computes width itself gets this wrong the first time it meets a bipolar meter.
  assert.deepEqual(barGeometry(75, { min: 0, max: 100 }), { start: 0, length: 0.75, level: 0.75, empty: false });

  const right = barGeometry(75, { min: 0, max: 100, mode: FILL_MODE.center });
  assert.equal(right.start, 0.5);
  assert.ok(Math.abs(right.length - 0.25) < 1e-9);

  const left = barGeometry(25, { min: 0, max: 100, mode: FILL_MODE.center });
  assert.equal(left.start, 0.25);
  assert.ok(Math.abs(left.length - 0.25) < 1e-9);
});

test('an empty bar says so rather than reporting a zero-length fill at the origin', () => {
  assert.deepEqual(barGeometry(undefined, { min: 0, max: 100 }), { start: 0, length: 0, level: null, empty: true });
});

test('a threshold band is the last one reached, whatever order they were written in', () => {
  // An out-of-order band list would otherwise colour everything with the first entry.
  const bands = [{ from: 0.9, colour: 'red' }, { from: 0, colour: 'green' }, { from: 0.7, colour: 'amber' }];
  assert.equal(bandFor(0.1, bands).colour, 'green');
  assert.equal(bandFor(0.75, bands).colour, 'amber');
  assert.equal(bandFor(1, bands).colour, 'red');
  assert.equal(bandFor(null, bands), null);
  assert.equal(bandFor(0.5, []), null);
});
