// Editing a gradient stop's colour used to mean leaving the gradient editor:
// chip → the dock swaps to the Colors tab → edit → "Back to Gradient" → the
// dock swaps back, twice per stop. It is now edited in place, from two hosts
// (the thumb on the preview, the chip in the sidebar) that share one state
// machine — because the review also found the app holding two OPPOSITE
// abandonment rules at once, and the fix is not to pick a side per component.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { get } from 'svelte/store';

import {
  normalizeStopColour, beginStopEdit, previewStopColour, commitStopEdit, cancelStopEdit,
} from '../src/CE_Application/utils/stopColourEdit.js';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { gradientTarget } from '../src/CE_Application/stores/gradientTarget.js';
import { gradientShapeOverride } from '../src/CE_Application/stores/gradientProxyShape.js';
import GradientEditor from '../src/CE_Application/components/GradientEditor.svelte';
import GradientSettings from '../src/CE_Application/components/GradientSettings.svelte';
import StopColourPopover from '../src/CE_Application/components/StopColourPopover.svelte';

const stops = () => [
  { color: 'FF0000', position: 0 },
  { color: '0000FF', position: 100 },
];

const gradient = () => ({
  type: 'linear', angle: 90, edge: 0,
  centerX: 50, centerY: 50, radiusX: 50, radiusY: 50,
  stops: stops(),
});

test('the chooser speaks AARRGGBB and a stop is RRGGBB — the alpha is dropped once, here', () => {
  assert.equal(normalizeStopColour('FF4A90D9'), '4A90D9');
  assert.equal(normalizeStopColour('#4a90d9'), '4A90D9');
  assert.equal(normalizeStopColour('nope', 'ABCDEF'), 'ABCDEF');
  assert.equal(normalizeStopColour(null), 'FFFFFF');
});

test('beginStopEdit records the colour to come back to', () => {
  assert.deepEqual(beginStopEdit(stops(), 1), { index: 1, original: '0000FF' });
  assert.equal(beginStopEdit(stops(), 7), null, 'no such stop, nothing opened');
  assert.equal(beginStopEdit(null, 0), null);
});

test('a preview repaints the edited stop and touches nothing else', () => {
  const before = stops();
  const edit = beginStopEdit(before, 0);
  const after = previewStopColour(before, edit, 'FF00FF00');

  assert.equal(after[0].color, '00FF00');
  assert.equal(after[1].color, '0000FF');
  assert.equal(after[0].position, 0, 'the position survives a colour edit');
  assert.equal(before[0].color, 'FF0000', 'the input array is not mutated');
});

test('abandoning an edit COMMITS it — the same rule in both hosts', () => {
  const edit = beginStopEdit(stops(), 1);
  const result = commitStopEdit(stops(), edit, '00FF00');
  assert.equal(result.stops[1].color, '00FF00');
  assert.equal(result.edit, null, 'the edit is closed');
});

test('cancelling restores the colour the stop had, however far it was dragged', () => {
  let current = stops();
  const edit = beginStopEdit(current, 1);
  current = previewStopColour(current, edit, '112233');
  current = previewStopColour(current, edit, '445566');
  assert.equal(current[1].color, '445566');

  const result = cancelStopEdit(current, edit);
  assert.equal(result.stops[1].color, '0000FF', 'back to where it started');
  assert.equal(result.edit, null);
});

test('with no edit open, every operation is a no-op', () => {
  const current = stops();
  assert.equal(previewStopColour(current, null, 'FFFFFF'), current);
  assert.deepEqual(commitStopEdit(current, null, 'FFFFFF'), { stops: current, edit: null });
  assert.deepEqual(cancelStopEdit(current, null), { stops: current, edit: null });
});

test('a garbled colour during an edit falls back to the original, not to white', () => {
  const edit = beginStopEdit(stops(), 0);
  const after = previewStopColour(stops(), edit, 'not-a-colour');
  assert.equal(after[0].color, 'FF0000');
});

// --- The hosts --------------------------------------------------------------

test('the popover says which stop it edits and offers Cancel as well as Done', () => {
  const html = render(StopColourPopover, { props: { color: '4A90D9', label: 'Stop 2' } }).body;
  assert.match(html, /aria-label="Stop 2 colour"/);
  assert.match(html, />Stop 2</);
  assert.match(html, /#4A90D9/);
  assert.match(html, /Restore the colour this stop had \(Esc\)/);
  assert.match(html, /Keep this colour \(Enter\)/);
});

test('the stop thumb advertises the double-click that opens the editor in place', () => {
  gradientShapeOverride.set(null);
  const html = render(GradientEditor, { props: { gradient: gradient(), selectedStop: 0 } }).body;
  assert.match(html, /double-click to edit its colour/);
});

test('the sidebar chip edits in place and keeps the Colors tab one click away', () => {
  const html = render(GradientSettings, {
    props: { gradient: gradient(), selectedStop: 0, gradientSwatches: [] },
  }).body;

  assert.match(html, /title="Edit this colour here"/, 'the chip no longer throws the dock at another tab');
  assert.match(html, /aria-label="Open stop 1 in the Colors tab"/, 'the old cross-tab flow is still reachable');
});

// --- The proxy shape (B7) ---------------------------------------------------

test('the preview defaults to the target\'s real geometry, not to a rectangle', () => {
  panels.set([{
    id: 'p1', name: 'Main', width: 800, height: 480,
    controls: [{
      _children: {
        Core: { id: 'c1', name: 'Fader 1' },
        Transform: { x: 0, y: 0, width: 120, height: 48 },
        Background: { _children: { Corners: { radius: 6 } } },
      },
    }],
  }]);
  activePanelId.set('p1');
  activeEditorTab.set({ type: 'panel', id: 'p1' });
  gradientTarget.set({ type: 'control', controlId: 'c1', path: 'Background.Fill' });
  gradientShapeOverride.set(null);

  const settings = render(GradientSettings, {
    props: { gradient: gradient(), selectedStop: 0, gradientSwatches: [], shape: 'rectangle' },
  }).body;
  assert.match(settings, /Auto — from target/);
  assert.match(settings, /Fader 1 — 120 × 48/, 'the sidebar names the geometry it derived');
  const autoButton = settings.match(/<button[^>]*class="auto-shape-btn[^"]*"/)?.[0] ?? '';
  assert.match(autoButton, /\bactive\b/, 'auto is the default, even with shape="rectangle" passed in');

  const editor = render(GradientEditor, {
    props: { gradient: gradient(), selectedStop: 0, shape: 'rectangle' },
  }).body;
  assert.match(editor, /Fader 1 — 120 × 48/, 'the preview says what it is a proxy for');
  // 120 × 48 fitted into the pre-measure 100 × 100 editor: an aspect ratio,
  // not the old square.
  const box = editor.match(/style="width: (\d+)px; height: (\d+)px;"/);
  assert.ok(box, editor.slice(0, 400));
  assert.ok(Math.abs(Number(box[1]) / Number(box[2]) - 2.5) < 0.1, `${box[1]}x${box[2]} keeps 120:48`);
  assert.match(editor, /border-radius: [\d.]+px/, 'the control\'s corners are on the proxy');

  gradientTarget.set(null);
});

test('a manual override wins, and the caption stops claiming to be derived', () => {
  gradientShapeOverride.set('circle');
  const editor = render(GradientEditor, { props: { gradient: gradient(), selectedStop: 0 } }).body;
  assert.match(editor, /shape-circle/);
  assert.doesNotMatch(editor, /proxy-caption/, 'nothing is being derived, so nothing claims to be');

  const settings = render(GradientSettings, {
    props: { gradient: gradient(), selectedStop: 0, gradientSwatches: [] },
  }).body;
  const autoButton = settings.match(/<button[^>]*class="auto-shape-btn[^"]*"/)?.[0] ?? '';
  assert.doesNotMatch(autoButton, /\bactive\b/);
  assert.equal(get(gradientShapeOverride), 'circle');

  gradientShapeOverride.set(null);
});

test('with no target the proxy falls back to the panel it would paint', () => {
  gradientShapeOverride.set(null);
  gradientTarget.set(null);
  const editor = render(GradientEditor, { props: { gradient: gradient(), selectedStop: 0 } }).body;
  assert.match(editor, /Main — 800 × 480/);
  panels.set([]);
  activePanelId.set(null);
});
