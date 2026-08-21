// an1xFegBridge.test.js — the AN1x's Free EG curves, and the script that writes them out.
//
// WHY THE REAL RUNTIME. Both GAIA generator scripts were once tested by handing them fake
// get/set/watch and checking what they asked for. Both passed. Both were dead — one watched a path
// the runtime never writes, the other read a section its control does not have — because a stub
// answers whatever the test wants. So the bridge half of this file mounts the real AN1x panel, runs
// the generated script against the real panelRuntime, and commits envelope points the way
// PanelPreviewSurface does on pointer release.
//
// THE TRANSFORM half is a plain function with no imports, tested directly, and its agreement with
// the app's own easing is asserted rather than assumed: curveToPoints cannot import envWarp (a panel
// script has no module system), so the two are checked against each other across every curve name
// the app offers. A curve added to ENVELOPE_CURVES without being added to fegWarp fails here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FEG_MAX, FEG_POINTS, FEG_TRACKS, curveToPoints, fegBridgeScript, fegParam, fegWarp,
} from '../../../tools/scripts/an1x-panel/feg-bridge.mjs';
import { buildAn1xPanel } from '../../../tools/scripts/an1x-panel/make-an1x-panel.mjs';
import { ENVELOPE_CURVES, envWarp } from '../src/CE_Application/utils/envelopeLayout.js';
import { loadScript, mountPanel } from './support/gaiaScriptHarness.mjs';
import { updateControlProperty } from '../src/CE_Application/stores/controls.js';

const flat = (y = 0.5) => ([
  { id: 'p0', x: 0, y, curve: 'linear', tension: 0 },
  { id: 'p1', x: 1, y, curve: 'linear', tension: 0 },
]);

/* ------------------------------------------------------------------ the transform */

test('a flat curve at centre is 192 samples of 128, not of zero', () => {
  // 128 is where the parameter's own default sits. Zero is a real extreme of the modulation range,
  // so a flat track written as zeroes would be a track pinned to the bottom, silently.
  const points = curveToPoints(flat(0.5), FEG_POINTS);
  assert.equal(points.length, FEG_POINTS);
  assert.deepEqual([...new Set(points)], [128]);
});

test('an empty or unusable curve is also flat at centre', () => {
  assert.deepEqual([...new Set(curveToPoints([], FEG_POINTS))], [128]);
  assert.deepEqual([...new Set(curveToPoints([{ x: NaN, y: NaN }], FEG_POINTS))], [128]);
  assert.deepEqual([...new Set(curveToPoints(null, FEG_POINTS))], [128]);
});

test('the ends land exactly on the drawn values', () => {
  const points = curveToPoints([
    { x: 0, y: 0, curve: 'linear' },
    { x: 1, y: 1, curve: 'linear' },
  ], FEG_POINTS);
  assert.equal(points[0], 0);
  assert.equal(points[FEG_POINTS - 1], FEG_MAX);
});

test('a linear ramp is linear, to the sample', () => {
  const points = curveToPoints([
    { x: 0, y: 0, curve: 'linear' },
    { x: 1, y: 1, curve: 'linear' },
  ], FEG_POINTS);
  for (let i = 0; i < FEG_POINTS; i += 1) {
    assert.equal(points[i], Math.round((i / (FEG_POINTS - 1)) * FEG_MAX), `sample ${i}`);
  }
});

test('the curve and tension come from the node ENDING the segment', () => {
  // envelopeLayout.js states it, and reading them off the starting node instead would shift every
  // shape one segment to the left — which looks almost right, which is why it is pinned.
  const shaped = curveToPoints([
    { x: 0, y: 0, curve: 'linear' },
    { x: 1, y: 1, curve: 'exp', tension: 2 },
  ], 5);
  const expected = [0, 1, 2, 3, 4].map((i) => Math.round(envWarp(i / 4, 'exp', 2) * FEG_MAX));
  assert.deepEqual(shaped, expected);
});

test('a value outside the drawn span holds the nearest node rather than extrapolating', () => {
  const points = curveToPoints([
    { x: 0.25, y: 0.25, curve: 'linear' },
    { x: 0.75, y: 0.75, curve: 'linear' },
  ], 5);
  assert.equal(points[0], Math.round(0.25 * FEG_MAX), 'before the first node');
  assert.equal(points[4], Math.round(0.75 * FEG_MAX), 'after the last node');
});

test('coincident nodes are a step, not a division by zero', () => {
  const points = curveToPoints([
    { x: 0, y: 0, curve: 'linear' },
    { x: 0.5, y: 0, curve: 'linear' },
    { x: 0.5, y: 1, curve: 'linear' },
    { x: 1, y: 1, curve: 'linear' },
  ], FEG_POINTS);
  assert.ok(points.every(Number.isFinite), 'a NaN here would go into 192 addresses');
  assert.equal(points[0], 0);
  assert.equal(points[FEG_POINTS - 1], FEG_MAX);
});

test('unsorted points are sorted rather than drawn backwards', () => {
  const jumbled = curveToPoints([
    { x: 1, y: 1, curve: 'linear' },
    { x: 0, y: 0, curve: 'linear' },
  ], 5);
  assert.deepEqual(jumbled, curveToPoints([
    { x: 0, y: 0, curve: 'linear' },
    { x: 1, y: 1, curve: 'linear' },
  ], 5));
});

test('every sample is an integer inside the wire range', () => {
  const points = curveToPoints([
    { x: 0, y: -5, curve: 'linear' },
    { x: 0.5, y: 9, curve: 'exp', tension: 40 },
    { x: 1, y: 0.5, curve: 'log' },
  ], FEG_POINTS);
  for (const value of points) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= FEG_MAX, `${value} is not a wire value`);
  }
});

/* ------------------------------------------- the easing agrees with the app's own */

test('fegWarp agrees with envelopeLayout.envWarp for every curve the app offers', () => {
  // The one real risk in inlining a copy: a curve drawn as `scurve` sent as something else. A curve
  // added to ENVELOPE_CURVES without being added to fegWarp fails right here.
  for (const curve of ENVELOPE_CURVES) {
    for (const tension of [0, 0.5, 1, 2, 6]) {
      for (let i = 0; i <= 10; i += 1) {
        const t = i / 10;
        assert.equal(fegWarp(t, curve, tension), envWarp(t, curve, tension),
          `${curve} @ tension ${tension}, t=${t}`);
      }
    }
  }
});

/* ------------------------------------------------------------------- the addressing */

test('track 1 is unprefixed and the rest carry their scope', () => {
  // The emitter names scope instance 1 without a prefix. Getting this wrong would write every
  // track's samples into track 1.
  assert.equal(fegParam(1, 1), 'fegPoint1');
  assert.equal(fegParam(1, 192), 'fegPoint192');
  assert.equal(fegParam(2, 1), 'fegTrack2.fegPoint1');
  assert.equal(fegParam(4, 192), 'fegTrack4.fegPoint192');
});

/* ---------------------------------------------------- the script, against the runtime */

/** The generated script, mounted on the real AN1x panel with the real runtime behind it. */
function withBridge(fn) {
  const built = buildAn1xPanel({ slim: true });
  const panel = mountPanel(built, 'an1x');
  const script = loadScript(built.scripts.find((s) => s.id === 'an1x_free_eg_bridge').source);
  script.onPanelLoad();
  return fn(script, panel, built);
}

/** Commit envelope points the way PanelPreviewSurface does when a drag is released. */
function commitPoints(controls, name, points) {
  const control = controls.find((c) => c._children?.Core?.name === name);
  assert.ok(control, `no control named ${name}`);
  updateControlProperty(control._children.Core.id, 'Envelope.points', points);
}

test('the panel ships the bridge, and it names all four tracks', () => {
  const built = buildAn1xPanel({ slim: true });
  const script = built.scripts.find((s) => s.id === 'an1x_free_eg_bridge');
  assert.ok(script, 'the AN1x panel carries no Free EG bridge');
  assert.equal(script.scope, 'panel');
  assert.equal(script.enabled, true);
  for (let track = 1; track <= FEG_TRACKS; track += 1) {
    assert.match(script.source, new RegExp(`fegTrack${track}Curve`), `track ${track} is not watched`);
  }
});

test('drawing a curve writes that track\'s samples to the device', () => {
  withBridge((script, panel) => {
    commitPoints(panel.controls(), 'fegTrack1Curve', flat(1));
    script.settle();

    assert.ok(script.writes.length > 0, 'the curve was drawn and nothing was written');
    for (const [id, value] of script.writes) {
      assert.match(id, /^fegPoint\d+$/, `track 1 must be unprefixed, got ${id}`);
      assert.equal(value, FEG_MAX);
    }
  });
});

test('only the track that moved is written', () => {
  withBridge((script, panel) => {
    commitPoints(panel.controls(), 'fegTrack3Curve', flat(1));
    script.settle();

    assert.ok(script.writes.length > 0);
    for (const [id] of script.writes) {
      assert.match(id, /^fegTrack3\.fegPoint\d+$/, `expected only track 3, got ${id}`);
    }
  });
});

test('an unchanged sample is not written again', () => {
  // THE reason this is a script and not 768 bindings: a curve edit moves the samples inside one
  // segment, and resending all of them would be many seconds of MIDI for nudging a node.
  withBridge((script, panel) => {
    commitPoints(panel.controls(), 'fegTrack1Curve', flat(1));
    script.settle();
    const first = script.writes.length;
    assert.equal(first, FEG_POINTS, 'the first send should cover the track');

    script.writes.length = 0;
    commitPoints(panel.controls(), 'fegTrack1Curve', [
      { id: 'p0', x: 0, y: 1, curve: 'linear' },
      { id: 'p1', x: 1, y: 1, curve: 'linear' },
      { id: 'p2', x: 0.5, y: 1, curve: 'linear' },   // a node added on the same flat line
    ]);
    script.settle();
    assert.equal(script.writes.length, 0, 'a redraw that changed no sample still wrote');
  });
});

test('a partial edit writes only the samples that moved', () => {
  withBridge((script, panel) => {
    commitPoints(panel.controls(), 'fegTrack1Curve', flat(0.5));
    script.settle();
    script.writes.length = 0;

    // Move only the right-hand half.
    commitPoints(panel.controls(), 'fegTrack1Curve', [
      { id: 'p0', x: 0, y: 0.5, curve: 'linear' },
      { id: 'p1', x: 0.5, y: 0.5, curve: 'linear' },
      { id: 'p2', x: 1, y: 1, curve: 'linear' },
    ]);
    script.settle();

    assert.ok(script.writes.length > 0, 'half the curve moved and nothing was written');
    assert.ok(script.writes.length < FEG_POINTS,
      `expected a partial write, got all ${script.writes.length} samples`);
    const indices = script.writes.map(([id]) => Number(id.replace('fegPoint', '')));
    assert.ok(Math.min(...indices) > FEG_POINTS / 4,
      'the untouched left-hand half was rewritten');
  });
});
