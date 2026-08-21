import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWheelZoom } from '../src/CE_Application/utils/canvasInteractions.js';
import { createZoomController } from '../src/CE_Application/utils/zoomController.js';

function makeViewport({
  clientWidth = 800,
  clientHeight = 600,
  scrollLeft = 0,
  scrollTop = 0,
  rectLeft = 0,
  rectTop = 0,
} = {}) {
  return {
    clientWidth,
    clientHeight,
    scrollLeft,
    scrollTop,
    getBoundingClientRect() {
      return { left: rectLeft, top: rectTop };
    },
  };
}

function contentOffsets(panel, viewport, zoom) {
  const scale = zoom / 100;
  return {
    left: Math.max(40, (viewport.clientWidth - panel.width * scale) / 2),
    top: Math.max(40, (viewport.clientHeight - panel.height * scale) / 2),
  };
}

function panelPointFromCursor(viewport, panel, zoom, scrollLeft, scrollTop, cursorVpX, cursorVpY) {
  const off = contentOffsets(panel, viewport, zoom);
  const scale = zoom / 100;
  return {
    x: (cursorVpX + scrollLeft - off.left) / scale,
    y: (cursorVpY + scrollTop - off.top) / scale,
  };
}

function cursorFromPanelPoint(viewport, panel, zoom, scrollLeft, scrollTop, point) {
  const off = contentOffsets(panel, viewport, zoom);
  const scale = zoom / 100;
  return {
    x: point.x * scale + off.left - scrollLeft,
    y: point.y * scale + off.top - scrollTop,
  };
}

test('computeWheelZoom keeps the hovered panel point under the cursor', () => {
  const viewport = makeViewport({
    clientWidth: 900,
    clientHeight: 700,
    scrollLeft: 160,
    scrollTop: 120,
    rectLeft: 20,
    rectTop: 30,
  });
  const panel = { width: 1400, height: 900 };
  const event = { clientX: 280, clientY: 250, deltaY: -120, ctrlKey: true };
  const cursorVpX = event.clientX - 20;
  const cursorVpY = event.clientY - 30;

  const anchoredPoint = panelPointFromCursor(
    viewport,
    panel,
    100,
    viewport.scrollLeft,
    viewport.scrollTop,
    cursorVpX,
    cursorVpY,
  );

  const result = computeWheelZoom(viewport, event, 100, panel);

  assert.ok(result);

  const nextCursor = cursorFromPanelPoint(
    viewport,
    panel,
    result.zoom,
    result.scrollLeft,
    result.scrollTop,
    anchoredPoint,
  );

  assert.equal(nextCursor.x, cursorVpX);
  assert.equal(nextCursor.y, cursorVpY);
});

test('computeWheelZoom keeps the cursor anchor stable while centered offsets change', () => {
  const viewport = makeViewport({
    clientWidth: 1000,
    clientHeight: 700,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const panel = { width: 300, height: 180 };
  const event = { clientX: 560, clientY: 360, deltaY: -120, ctrlKey: true };
  const cursorVpX = event.clientX;
  const cursorVpY = event.clientY;

  const anchoredPoint = panelPointFromCursor(
    viewport,
    panel,
    100,
    viewport.scrollLeft,
    viewport.scrollTop,
    cursorVpX,
    cursorVpY,
  );

  const result = computeWheelZoom(viewport, event, 100, panel);

  assert.ok(result);

  const nextCursor = cursorFromPanelPoint(
    viewport,
    panel,
    result.zoom,
    result.scrollLeft,
    result.scrollTop,
    anchoredPoint,
  );

  assert.equal(nextCursor.x, cursorVpX);
  assert.equal(nextCursor.y, cursorVpY);
});

test('createZoomController composes repeated wheel zooms against the pending view state', () => {
  const viewport = makeViewport({
    clientWidth: 800,
    clientHeight: 600,
    scrollLeft: 120,
    scrollTop: 90,
  });
  const panel = { width: 1400, height: 1000 };
  let zoom = 100;
  let frameCallback = null;

  const originalRAF = globalThis.requestAnimationFrame;
  const originalCancelRAF = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    frameCallback = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    frameCallback = null;
  };

  try {
    const controller = createZoomController({
      getViewport: () => viewport,
      getPanel: () => panel,
      getSelection: () => new Set(),
      editorZoom: { set(value) { zoom = value; } },
      getZoom: () => zoom,
    });

    const firstEvent = {
      clientX: 260,
      clientY: 220,
      deltaY: -120,
      ctrlKey: true,
      preventDefault() {},
    };
    const secondEvent = {
      clientX: 260,
      clientY: 220,
      deltaY: -120,
      ctrlKey: true,
      preventDefault() {},
    };

    const firstResult = computeWheelZoom(viewport, firstEvent, 100, panel);
    const secondResult = computeWheelZoom(viewport, secondEvent, firstResult.zoom, panel, 1.1, firstResult);

    controller.handleWheel(firstEvent);
    controller.handleWheel(secondEvent);

    assert.equal(zoom, secondResult.zoom);
    assert.equal(viewport.scrollLeft, 120);
    assert.equal(viewport.scrollTop, 90);
    assert.ok(frameCallback);

    frameCallback();

    assert.equal(viewport.scrollLeft, secondResult.scrollLeft);
    assert.equal(viewport.scrollTop, secondResult.scrollTop);
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCancelRAF;
  }
});

test('plain wheel is left to the browser (scroll), only ctrl/cmd wheel zooms', () => {
  const viewport = makeViewport();
  const panel = { width: 1400, height: 1000 };
  let zoom = 100;
  let prevented = false;
  const originalRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;

  const controller = createZoomController({
    getViewport: () => viewport,
    getPanel: () => panel,
    getSelection: () => new Set(),
    editorZoom: { set(value) { zoom = value; } },
    getZoom: () => zoom,
  });

  controller.handleWheel({ clientX: 100, clientY: 100, deltaY: -120, ctrlKey: false, preventDefault() { prevented = true; } });
  assert.equal(zoom, 100, 'plain wheel must not zoom');
  assert.equal(prevented, false, 'plain wheel must not be preventDefaulted');

  try {
    controller.handleWheel({ clientX: 100, clientY: 100, deltaY: -120, ctrlKey: true, preventDefault() { prevented = true; } });
    assert.equal(zoom, 110, 'ctrl+wheel zooms multiplicatively (100 × 1.1)');
    assert.equal(prevented, true);
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
  }
});

test('zoom steps are anchored at the viewport centre', () => {
  const viewport = makeViewport({ clientWidth: 800, clientHeight: 600, scrollLeft: 200, scrollTop: 150 });
  const panel = { width: 2000, height: 1500 };
  let zoom = 100;
  let frameCallback = null;
  const originalRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { frameCallback = cb; return 1; };
  try {
    const controller = createZoomController({
      getViewport: () => viewport,
      getPanel: () => panel,
      getSelection: () => new Set(),
      editorZoom: { set(value) { zoom = value; } },
      getZoom: () => zoom,
      getZoomIncrement: () => 20,
    });

    // The panel point at the viewport centre before the step...
    const centreBefore = panelPointFromCursor(viewport, panel, 100, 200, 150, 400, 300);
    controller.zoomStep(1);
    assert.equal(zoom, 120, 'step uses the configured increment');
    frameCallback();
    // ...is still at the viewport centre after it.
    const centreAfter = cursorFromPanelPoint(viewport, panel, 120, viewport.scrollLeft, viewport.scrollTop, centreBefore);
    assert.equal(Math.round(centreAfter.x), 400);
    assert.equal(Math.round(centreAfter.y), 300);
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
  }
});
