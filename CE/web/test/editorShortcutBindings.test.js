// editorShortcutBindings.test.js — the chords review findings D9, S4(2), A10 and A13 asked for.
//
// D9: "no Ctrl+[/] z-order, no Ctrl+L lock, ... no Tab-cycle." S4 second bullet: "bringToFront /
// sendToBack exist (alignment.js:543-583) — context-menu-only; no Ctrl+[/]." A10 last clause: "One
// locked item silently disables arrow-nudge for a whole 20-item selection." A13: "no Escape to
// cancel an in-flight drag or deselect, no Tab to cycle siblings."
//
// Every assertion here presses a key. Asserting that a binding is in the table would prove only
// that somebody typed it — the point is that the dispatcher reaches the command.

import test from 'node:test';
import assert from 'node:assert/strict';

import { EDITOR_SHORTCUTS, handleEditorShortcut } from '../src/CE_Application/utils/editorShortcuts.js';

/** A control node in the shape the tree uses: Core + Transform, Children only for containers. */
function control(id, { x = 0, y = 0, locked = false, children = null } = {}) {
  const node = {
    _children: {
      Core: { id, name: id, locked },
      Transform: { x, y, width: 40, height: 20 },
    },
  };
  if (children) {
    node._children.Children = { _children: Object.fromEntries(children.map((c) => [c._children.Core.id, c])) };
  }
  return node;
}

/** A ctx with every command a spy, so a press can be checked by what it called. */
function harness(panel, ids = [], overrides = {}) {
  const calls = [];
  const spy = (name) => (...args) => calls.push([name, ...args]);
  const ctx = {
    panel,
    panelLocked: false,
    gridSize: 10,
    selectedComponentIds: new Set(ids),
    zoomIn: spy('zoomIn'), zoomOut: spy('zoomOut'),
    fitToWindow: spy('fitToWindow'), zoomToSelection: spy('zoomToSelection'),
    selectAll: spy('selectAll'), pasteSelection: spy('pasteSelection'),
    pasteInPlace: spy('pasteInPlace'),
    copySelection: spy('copySelection'), cutSelection: spy('cutSelection'),
    duplicateControl: spy('duplicateControl'), removeControl: spy('removeControl'),
    updateControlProperty: (...args) => calls.push(['updateControlProperty', ...args]),
    deleteSelectedGuide: () => false,
    groupSelectionIntoContainer: spy('group'), ungroupContainer: spy('ungroup'),
    selectComponent: spy('selectComponent'), clearSelection: spy('clearSelection'),
    copyControlStyle: spy('copyControlStyle'), applyStyleToSelection: spy('applyStyleToSelection'),
    bringToFront: spy('bringToFront'), bringForward: spy('bringForward'),
    sendBackward: spy('sendBackward'), sendToBack: spy('sendToBack'),
    ...overrides,
  };
  return { ctx, calls };
}

function press(ctx, key, { ctrl = false, shift = false, alt = false, code = undefined } = {}) {
  let prevented = false;
  const e = {
    key, code, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: alt,
    preventDefault: () => { prevented = true; },
  };
  handleEditorShortcut(e, ctx);
  return prevented;
}

const names = (calls) => calls.map(([name]) => name);

// --- D9 / S4(2): z-order -----------------------------------------------------------------

test('Ctrl+] and Ctrl+[ reach bringForward and sendBackward', () => {
  const panel = { controls: [control('a'), control('b')] };

  const forward = harness(panel, ['a']);
  assert.equal(press(forward.ctx, ']', { ctrl: true }), true, 'the key is swallowed');
  assert.deepEqual(names(forward.calls), ['bringForward']);

  const backward = harness(panel, ['a']);
  press(backward.ctx, '[', { ctrl: true });
  assert.deepEqual(names(backward.calls), ['sendBackward']);
});

test('Ctrl+Shift+] and Ctrl+Shift+[ reach the extremes, through the shifted character', () => {
  const panel = { controls: [control('a'), control('b')] };

  // Shift turns ] into } on a US layout. Matching on e.key alone would miss both of these.
  const front = harness(panel, ['a']);
  press(front.ctx, '}', { ctrl: true, shift: true });
  assert.deepEqual(names(front.calls), ['bringToFront']);

  const back = harness(panel, ['a']);
  press(back.ctx, '{', { ctrl: true, shift: true });
  assert.deepEqual(names(back.calls), ['sendToBack']);

  // …and through the physical key, which is what a real KeyboardEvent carries.
  const byCode = harness(panel, ['a']);
  press(byCode.ctx, 'Dead', { ctrl: true, shift: true, code: 'BracketRight' });
  assert.deepEqual(names(byCode.calls), ['bringToFront']);
});

test('z-order does nothing with an empty selection', () => {
  const { ctx, calls } = harness({ controls: [control('a')] }, []);
  press(ctx, ']', { ctrl: true });
  assert.deepEqual(calls, []);
});

// --- D9: lock ----------------------------------------------------------------------------

test('Ctrl+L locks the whole selection, and unlocks only when all of it is locked', () => {
  const panel = { controls: [control('a'), control('b', { locked: true })] };

  // Mixed selection: the unlocked one joins the locked one rather than swapping places with it.
  const mixed = harness(panel, ['a', 'b']);
  assert.equal(press(mixed.ctx, 'l', { ctrl: true }), true);
  assert.deepEqual(mixed.calls, [
    ['updateControlProperty', 'a', 'Core.locked', true],
    ['updateControlProperty', 'b', 'Core.locked', true],
  ]);

  const allLocked = harness(panel, ['b']);
  press(allLocked.ctx, 'l', { ctrl: true });
  assert.deepEqual(allLocked.calls, [['updateControlProperty', 'b', 'Core.locked', false]]);
});

// --- D9 / A13(5): Tab cycles siblings ------------------------------------------------------

test('Tab and Shift+Tab walk the siblings of the current control, wrapping', () => {
  const panel = { controls: [control('a'), control('b'), control('c')] };

  const fwd = harness(panel, ['a']);
  assert.equal(press(fwd.ctx, 'Tab'), true, 'Tab is swallowed so focus stays on the canvas');
  assert.deepEqual(fwd.calls, [['selectComponent', 'b']]);

  const wrap = harness(panel, ['c']);
  press(wrap.ctx, 'Tab');
  assert.deepEqual(wrap.calls, [['selectComponent', 'a']]);

  const back = harness(panel, ['a']);
  press(back.ctx, 'Tab', { shift: true });
  assert.deepEqual(back.calls, [['selectComponent', 'c']]);
});

test('Tab stays inside the parent container', () => {
  const inner = [control('x'), control('y')];
  const panel = { controls: [control('outside'), control('group', { children: inner })] };

  const { ctx, calls } = harness(panel, ['x']);
  press(ctx, 'Tab');
  assert.deepEqual(calls, [['selectComponent', 'y']], 'next sibling, not the next control in the panel');

  const wrap = harness(panel, ['y']);
  press(wrap.ctx, 'Tab');
  assert.deepEqual(wrap.calls, [['selectComponent', 'x']], 'wraps within the container, never out of it');
});

test('Tab with nothing selected is left to the browser', () => {
  // This handler also runs from a window-level fallback, so an unconditional
  // preventDefault would take focus navigation away from the whole app.
  const panel = { controls: [control('a'), control('b')] };

  const fwd = harness(panel, []);
  assert.equal(press(fwd.ctx, 'Tab'), false, 'not swallowed');
  assert.deepEqual(fwd.calls, []);

  const back = harness(panel, []);
  assert.equal(press(back.ctx, 'Tab', { shift: true }), false);
  assert.deepEqual(back.calls, []);
});

test('Ctrl+Tab is left alone — it belongs to the tab strip, not the canvas', () => {
  const { ctx, calls } = harness({ controls: [control('a'), control('b')] }, ['a']);
  assert.equal(press(ctx, 'Tab', { ctrl: true }), false, 'not swallowed');
  assert.deepEqual(calls, []);
});

// --- A13(4): Escape --------------------------------------------------------------------

test('Escape aborts a gesture in flight and leaves the selection alone', () => {
  const panel = { controls: [control('a')] };
  let aborted = 0;
  const { ctx, calls } = harness(panel, ['a'], { abortGesture: () => { aborted += 1; return true; } });

  assert.equal(press(ctx, 'Escape'), true);
  assert.equal(aborted, 1);
  assert.deepEqual(calls, [], 'a cancelled drag must not also cost you the selection');
});

test('Escape with no gesture still steps out, and still deselects', () => {
  const inner = [control('x')];
  const panel = { controls: [control('group', { children: inner })] };

  const stepOut = harness(panel, ['x'], { abortGesture: () => false });
  press(stepOut.ctx, 'Escape');
  assert.deepEqual(stepOut.calls, [['selectComponent', 'group']]);

  const deselect = harness({ controls: [control('a'), control('b')] }, ['a', 'b']);
  press(deselect.ctx, 'Escape');
  assert.deepEqual(deselect.calls, [['clearSelection']]);
});

test('Escape with nothing selected and nothing dragging is left alone', () => {
  // A dialog or a popover may want it; the canvas has nothing to cancel.
  const { ctx, calls } = harness({ controls: [control('a')] }, []);
  assert.equal(press(ctx, 'Escape'), false);
  assert.deepEqual(calls, []);
});

test('Escape aborts a gesture even with nothing selected — a marquee is a gesture too', () => {
  let aborted = 0;
  const { ctx, calls } = harness({ controls: [control('a')] }, [], {
    abortGesture: () => { aborted += 1; return true; },
  });
  assert.equal(press(ctx, 'Escape'), true);
  assert.equal(aborted, 1, 'the old code returned on the empty selection before Escape was reached');
  assert.deepEqual(calls, []);
});

// --- A10: the nudge veto ---------------------------------------------------------------

test('a locked control no longer vetoes the nudge for everything selected with it', () => {
  const panel = {
    controls: [
      control('free1', { x: 10, y: 10 }),
      control('pinned', { x: 20, y: 20, locked: true }),
      control('free2', { x: 30, y: 30 }),
    ],
  };
  const { ctx, calls } = harness(panel, ['free1', 'pinned', 'free2']);

  assert.equal(press(ctx, 'ArrowRight'), true);
  assert.deepEqual(calls, [
    ['updateControlProperty', 'free1', 'Transform.x', 11],
    ['updateControlProperty', 'free2', 'Transform.x', 31],
  ], 'the two unlocked controls move; the locked one is skipped, not obeyed');
});

test('a wholly locked selection still nudges nothing', () => {
  const panel = { controls: [control('pinned', { locked: true })] };
  const { ctx, calls } = harness(panel, ['pinned']);
  press(ctx, 'ArrowUp');
  assert.deepEqual(calls, []);
});

test('a locked panel still refuses every nudge', () => {
  const panel = { controls: [control('a')] };
  const { ctx, calls } = harness(panel, ['a'], { panelLocked: true });
  press(ctx, 'ArrowDown');
  assert.deepEqual(calls, []);
});

test('Shift+Arrow nudges by the grid, plain Arrow by a pixel', () => {
  const panel = { controls: [control('a', { x: 5, y: 5 })] };
  const big = harness(panel, ['a']);
  press(big.ctx, 'ArrowDown', { shift: true });
  assert.deepEqual(big.calls, [['updateControlProperty', 'a', 'Transform.y', 15]]);
});

// --- E2(1): the paste-in-place binding ---------------------------------------------------

test('Ctrl+Shift+V is paste-in-place and Ctrl+V is still plain paste', () => {
  const panel = { controls: [control('a')] };

  const inPlace = harness(panel, []);
  assert.equal(press(inPlace.ctx, 'V', { ctrl: true, shift: true }), true);
  assert.deepEqual(names(inPlace.calls), ['pasteInPlace']);

  const plain = harness(panel, []);
  press(plain.ctx, 'v', { ctrl: true });
  assert.deepEqual(names(plain.calls), ['pasteSelection']);

  // Ctrl+Alt+V is still the format painter, and it needs a selection.
  const style = harness(panel, ['a']);
  press(style.ctx, 'v', { ctrl: true, alt: true });
  assert.deepEqual(names(style.calls), ['applyStyleToSelection']);
});

// --- the table itself ---------------------------------------------------------------------

test('every editor binding is documentable — the F1 overlay is generated from these rows', () => {
  assert.ok(EDITOR_SHORTCUTS.length > 0);
  for (const binding of EDITOR_SHORTCUTS) {
    assert.ok(binding.id, 'id');
    assert.ok(binding.section, `${binding.id} has a section`);
    assert.ok(binding.keys, `${binding.id} has a key label`);
    assert.ok(binding.description, `${binding.id} has a description`);
    assert.equal(typeof binding.match, 'function', `${binding.id} has a chord test`);
  }
  const ids = EDITOR_SHORTCUTS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
});
