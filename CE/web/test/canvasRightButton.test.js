// canvasRightButton.test.js — the right mouse button behaves conventionally.
//
// Review finding A13, two clauses that were really one bug:
//
//   (7) "Right-drag pans (nonstandard)" — canvasInteractions.js:61 started a pan on button 2,
//       although middle-drag and Space+drag already pan and nothing else wanted the binding.
//   (8) "a 3px twitch during right-click swallows the context menu" — because the pan's end
//       decided click-vs-drag on a 2px threshold and only a "click" showed the menu, while
//       EditorCanvas had already suppressed the native one. A slightly shaky right-click
//       therefore produced NO menu, from either source, silently.
//
// No threshold fixes (8) while (7) stands: the two gestures share a button and the wrong guess
// is invisible. Dropping the pan is what makes the menu unconditional, so both are pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createPanController } from '../src/CE_Application/utils/canvasInteractions.js';

const here = dirname(fileURLToPath(import.meta.url));
const editorCanvas = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'EditorCanvas.svelte'), 'utf8',
);

function panController() {
  const listeners = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const viewport = { scrollLeft: 0, scrollTop: 0, clientWidth: 800, clientHeight: 600 };
  const state = { isPanning: false, spaceHeld: false };
  const ctrl = createPanController(state, { getViewport: () => viewport });
  return {
    ctrl, state, viewport, listeners,
    restore() { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; },
  };
}

test('the right button does not pan', () => {
  const h = panController();
  try {
    const handled = h.ctrl.handleMouseDown({ button: 2, clientX: 100, clientY: 100, preventDefault() {} });
    assert.equal(handled, false, 'the press is not claimed, so the contextmenu event can have it');
    assert.equal(h.state.isPanning, false);
    assert.equal(h.listeners.size, 0, 'no drag listeners were installed');
  } finally {
    h.restore();
  }
});

test('middle-drag still pans, so the gesture is not lost', () => {
  const h = panController();
  try {
    assert.equal(h.ctrl.handleMouseDown({ button: 1, clientX: 100, clientY: 100, preventDefault() {} }), true);
    assert.equal(h.state.isPanning, true);
    h.listeners.get('mousemove')({ clientX: 60, clientY: 70 });
    assert.equal(h.viewport.scrollLeft, 40);
    assert.equal(h.viewport.scrollTop, 30);
    h.listeners.get('mouseup')({});
    assert.equal(h.state.isPanning, false);
  } finally {
    h.restore();
  }
});

test('Space+drag still pans', () => {
  const h = panController();
  try {
    h.state.spaceHeld = true;
    assert.equal(h.ctrl.handleMouseDown({ button: 0, clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }), true);
    assert.equal(h.state.isPanning, true);
  } finally {
    h.restore();
  }
});

test('the pan controller no longer takes an onRightClick route at all', () => {
  const source = readFileSync(
    join(here, '..', 'src', 'CE_Application', 'utils', 'canvasInteractions.js'), 'utf8',
  );
  assert.ok(!/onRightClick/.test(source), 'the click-vs-drag guess is gone, not merely bypassed');
  assert.ok(!/panDidMove/.test(source), 'and so is the 2px threshold that swallowed the menu');
});

test('the canvas opens its menu from the contextmenu event, which a twitch cannot suppress', () => {
  const handler = editorCanvas.match(/function handleContextMenu\(e\) \{[\s\S]*?\n  \}/);
  assert.ok(handler, 'handleContextMenu still exists');
  assert.match(handler[0], /preventDefault/, 'the native menu is still replaced, not shown as well');
  assert.match(handler[0], /showContextMenuAt\(e\.clientX, e\.clientY\)/,
    'and ours opens right there, with no movement test in between');
  assert.ok(!/onRightClick/.test(editorCanvas), 'nothing still routes the menu through the pan');
});
