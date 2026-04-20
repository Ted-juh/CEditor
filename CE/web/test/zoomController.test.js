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
  const event = { clientX: 280, clientY: 250, deltaY: -120 };
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
  const event = { clientX: 560, clientY: 360, deltaY: -120 };
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
      preventDefault() {},
    };
    const secondEvent = {
      clientX: 260,
      clientY: 220,
      deltaY: -120,
      preventDefault() {},
    };

    const firstResult = computeWheelZoom(viewport, firstEvent, 100, panel);
    const secondResult = computeWheelZoom(viewport, secondEvent, firstResult.zoom, panel, 10, firstResult);

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
