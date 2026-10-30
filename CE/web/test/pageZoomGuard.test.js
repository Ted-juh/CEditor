// pageZoomGuard.test.js — Ctrl+scroll and the zoom keys zoom the canvas, never the whole interface.
//
// The browser engine zoomed the whole page on any Ctrl+wheel or Ctrl+plus/minus/0 the page did not
// take itself: over the dock or the properties panel, Ctrl+scroll scaled everything, canvas
// included, with nothing on screen to say so. The canvas only takes them while it has the pointer
// or focus. Now the page cancels the engine's zoom everywhere, the zoom keys mean the canvas
// wherever focus is, and the size of the interface is a setting the native side applies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { blockPageZoom, installPageZoomGuard, INTERFACE_ZOOM_CHOICES, normalizeInterfaceZoom } from '../src/CE_Application/utils/pageZoomGuard.js';
import { canvasZoomCommand } from '../src/CE_Application/utils/editorShortcuts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (path) => readFileSync(join(here, '..', 'src', path), 'utf8');

function wheel(init = {}) {
  return { ctrlKey: false, metaKey: false, defaultPrevented: false, ...init, preventDefault() { this.defaultPrevented = true; } };
}

test('a Ctrl+wheel is kept from the engine, a plain wheel is not', () => {
  for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
    const e = wheel(init);
    blockPageZoom(e);
    assert.equal(e.defaultPrevented, true, JSON.stringify(init));
  }
  const plain = wheel();
  blockPageZoom(plain);
  assert.equal(plain.defaultPrevented, false, 'a plain wheel still scrolls');
});

test('the guard listens on the window, not passively, so it can cancel the engine zoom', () => {
  const added = [];
  const removed = [];
  const target = {
    addEventListener: (...args) => added.push(args),
    removeEventListener: (...args) => removed.push(args),
  };
  const off = installPageZoomGuard(target);
  assert.deepEqual(added, [['wheel', blockPageZoom, { passive: false }]]);
  off();
  assert.equal(removed.length, 1);
  assert.equal(removed[0][1], blockPageZoom);
});

test('the zoom keys are recognised as the canvas zoom', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra });
  assert.equal(canvasZoomCommand(key('=')), 'zoom-in');
  assert.equal(canvasZoomCommand(key('+', { shiftKey: true })), 'zoom-in', 'Ctrl+Shift+= types a plus');
  assert.equal(canvasZoomCommand(key('-')), 'zoom-out');
  assert.equal(canvasZoomCommand(key('0')), 'fit-to-window');
  assert.equal(canvasZoomCommand(key('0', { ctrlKey: false })), null, 'a plain 0 is typing');
  assert.equal(canvasZoomCommand(key('1')), null, 'Ctrl+1 is a tab');
});

test('the interface sizes on offer include 100%, and anything else reads as 100%', () => {
  assert.ok(INTERFACE_ZOOM_CHOICES.includes(100));
  assert.deepEqual([...INTERFACE_ZOOM_CHOICES].sort((a, b) => a - b), INTERFACE_ZOOM_CHOICES, 'smallest first');
  assert.equal(normalizeInterfaceZoom('125'), 125);
  assert.equal(normalizeInterfaceZoom(undefined), 100);
  assert.equal(normalizeInterfaceZoom(Number.NaN), 100);
});

test('the app installs the guard, takes the zoom keys wherever focus is, and sends the size on', () => {
  const app = src('App.svelte');
  assert.match(app, /const offPageZoomGuard = installPageZoomGuard\(window\);/);
  assert.match(app, /interfaceZoom\.subscribe\(\(percent\) => setInterfaceZoom\(percent\)\)/);
  // Before the editor fallback, which only runs while focus is in the canvas, the tree or the page.
  const keys = app.slice(app.indexOf('function handleGlobalKeyDown'));
  const zoom = keys.indexOf('canvasZoomCommand(e)');
  const fallback = keys.indexOf('isEditorShortcutFocus(e.target');
  assert.ok(zoom > 0 && zoom < fallback, 'the zoom keys are taken before the focus test that left them to the engine');
  assert.match(keys, /const zoomCommand = e\.defaultPrevented \? null : canvasZoomCommand\(e\);/,
    'the canvas wrapper takes them itself when it has focus; taking them again zooms twice');

  const bridge = src('CE_Application/bridge/bridge.js');
  assert.match(bridge, /emitEvent\('setInterfaceZoom', \{ factor: Number\(percent\) \/ 100 \}\)/);
});

test('in the Component Designer the zoom keys zoom its surface, and Ctrl+scroll over a component in Preview zooms too', async () => {
  // The designer had no keyboard zoom, and in its Preview the component took every scroll over it,
  // Ctrl+scroll included, so only the empty surface around it zoomed.
  const { surfaceZoomRequest, requestSurfaceZoom } = await import('../src/CE_Application/stores/componentWorkspace.js');
  const { get } = await import('svelte/store');
  const before = get(surfaceZoomRequest).n;
  requestSurfaceZoom('zoom-in');
  requestSurfaceZoom('zoom-in');
  assert.deepEqual(get(surfaceZoomRequest), { n: before + 2, command: 'zoom-in', value: undefined }, 'the same key twice is two requests');

  const app = src('App.svelte');
  assert.match(app, /if \(\$componentWorkspaceMode === 'surface'\) \{ requestSurfaceZoom\(zoomCommand\); return; \}/);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /onDestroy\(onSurfaceZoomRequest\(\{ 'zoom-in': \(\) => zoomStep\(surfaceZoomIncrement\), 'zoom-out': \(\) => zoomStep\(-surfaceZoomIncrement\), 'fit-to-window': \(\) => fitArtboardToView\(\), 'zoom-reset': \(\) => setZoom\(1\), 'zoom-set': \(percent\) => setZoom\(percent \/ 100\) \}\)\);/);
  const testSurface = src('CE_Application/components/InteractiveTestSurface.svelte');
  assert.match(testSurface, /function handleWheel\(event\) \{[\s\S]{0,400}if \(event\.ctrlKey \|\| event\.metaKey\) return;\s*if \(isReadOnly\) return;/,
    'Ctrl+scroll over a component in Preview is taken by the component again');
});

test('the designer hears only the zoom requests made while it is open', async () => {
  const { requestSurfaceZoom, onSurfaceZoomRequest } = await import('../src/CE_Application/stores/componentWorkspace.js');
  requestSurfaceZoom('zoom-in'); // before the designer opened
  const heard = [];
  const off = onSurfaceZoomRequest({ 'zoom-in': () => heard.push('in'), 'fit-to-window': () => heard.push('fit') });
  assert.deepEqual(heard, [], 'an earlier request zoomed a designer that was not open for it');
  requestSurfaceZoom('fit-to-window');
  requestSurfaceZoom('zoom-out'); // no action given for it: nothing, and no error
  requestSurfaceZoom('zoom-in');
  off();
  requestSurfaceZoom('zoom-in');
  assert.deepEqual(heard, ['fit', 'in']);
});

test('in the designer the status bar shows and drives the surface\'s grid, snap and zoom, not the hidden panel\'s', async () => {
  // It read "grid off · snap off" beside the designer's own Snap switched on, and its − and +
  // zoomed the panel behind the designer.
  const { requestSurfaceZoom, onSurfaceZoomRequest } = await import('../src/CE_Application/stores/componentWorkspace.js');
  const heard = [];
  const off = onSurfaceZoomRequest({ 'zoom-reset': () => heard.push('reset'), 'zoom-set': (percent) => heard.push(percent) });
  requestSurfaceZoom('zoom-set', 250);
  requestSurfaceZoom('zoom-reset');
  off();
  assert.deepEqual(heard, [250, 'reset'], 'a typed percentage reaches the designer');

  const bar = src('CE_Application/layout/StatusBar.svelte');
  assert.match(bar, /let designer = \$derived\(\$componentDesignerStatus\?\.kind \? \$componentDesignerStatus : null\);/);
  assert.match(bar, /grid \{designer\.snapSize\} · snap \{designer\.snapEnabled \? 'on' : 'off'\}/);
  assert.match(bar, /if \(designer\) requestSurfaceZoom\(direction > 0 \? 'zoom-in' : 'zoom-out'\);/);
  assert.match(bar, /if \(designer\) requestSurfaceZoom\('zoom-set', num\);/);
  assert.match(bar, /designer \? requestSurfaceZoom\('zoom-reset'\) : editorZoom\.set\(100\)/);
  assert.match(bar, /designer \? requestSurfaceZoom\('fit-to-window'\) : requestFitToWindow\(\)/);
  assert.match(bar, /\{zoomPercent\}%/);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /controlId: core\?\.id \?\? '', fill: selectedFill\?\.colour \?\? '', zoom: surfaceZoom, snapEnabled, snapSize: numberOr\(snapSize, 10\),/,
    'the designer reports its own zoom and snap');
});

test('Ctrl+scroll on the design surface keeps the point under the cursor where it was', async () => {
  const { surfaceWheelZoom, SURFACE_ZOOM_MAX } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  const at = { zoom: 2, deltaY: -100, pointerX: 300, pointerY: 120, scrollLeft: 40, scrollTop: 10 };
  const next = surfaceWheelZoom(at);
  assert.ok(next.zoom > at.zoom, 'scrolling up zooms in');
  // The content point under the cursor, in the design's own units, before and after.
  const cursorX = at.pointerX - at.scrollLeft;
  const cursorY = at.pointerY - at.scrollTop;
  assert.ok(Math.abs((next.scrollLeft + cursorX) / next.zoom - at.pointerX / at.zoom) < 1e-9);
  assert.ok(Math.abs((next.scrollTop + cursorY) / next.zoom - at.pointerY / at.zoom) < 1e-9);
  const top = surfaceWheelZoom({ ...at, zoom: SURFACE_ZOOM_MAX });
  assert.deepEqual(top, { zoom: SURFACE_ZOOM_MAX, scrollLeft: at.scrollLeft, scrollTop: at.scrollTop }, 'at the limit nothing moves');
});
