// canvasHiddenLockedPointer.test.js — what a hidden or locked control does to the pointer, and
// what a draggable one tells the cursor.
//
// Review findings A10 and A13 (last clause). Three complaints, one root: the canvas dressed
// controls up in state it then failed to act on.
//
//   - Hidden meant `opacity: 0.25` and nothing else. The control was still a full hit target, so
//     something you had deliberately made invisible ate the click meant for what was underneath it
//     and swallowed a marquee begun on top of it.
//   - Locked INTERCEPTED the press and then refused to use it (handleMouseDown returns early),
//     which is the worst of both: the click is spent and whatever is beneath never sees it. A
//     locked backdrop — the most common thing to lock — could not even be marquee'd across.
//   - Nothing on the surface said a control was draggable at all. The only cursors in the file
//     were the resize handles' and a blanket `default`.
//
// The pointer half is CSS, so these tests read the compiled component's <style> block, in the same
// spirit as canvasNestedPointerEvents.test.js (which pins the opposite rule and must keep passing:
// pointer-events INHERITS, and that file is the record of what happens when a blanket `none`
// reaches a nested control that needed its events back). The class half is asserted against real
// server-rendered markup, because a rule matching a class nobody applies is a rule that does
// nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render } from 'svelte/server';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'CanvasControl.svelte'), 'utf8',
);
/** The CSS block only, so a `pointer-events:none` written inline on an SVG layer is not counted. */
const styles = source.slice(source.lastIndexOf('<style'));

/** The declaration block of the first rule whose selector list matches `selector`. */
function ruleFor(selector) {
  const at = styles.indexOf(selector);
  assert.notEqual(at, -1, `no rule found for "${selector}"`);
  const open = styles.indexOf('{', at);
  return styles.slice(open + 1, styles.indexOf('}', open));
}

function label(core = {}) {
  return createControl('Label', {
    Core: { id: 'target', name: 'Target', ...core },
    Transform: { x: 10, y: 10, width: 80, height: 24 },
    Text: { content: 'Target' },
  });
}

/** Classes on the control root, as a Set. The root is the first .canvas-control in the markup. */
function rootClasses(control, props = {}) {
  const { body } = render(CanvasControl, {
    props: { control, allControls: [control], editorInteractionEnabled: true, ...props },
  });
  const match = body.match(/class="((?:[^"]*\s)?canvas-control(?:\s[^"]*)?)"/);
  assert.ok(match, 'no .canvas-control root in the rendered markup');
  return new Set(match[1].split(/\s+/));
}

// ---------------------------------------------------------------------------
// A10 — hidden controls stop taking the pointer
// ---------------------------------------------------------------------------

test('a hidden control is marked hidden and a visible one is not', () => {
  assert.ok(rootClasses(label({ visible: false })).has('hidden-component'));
  assert.ok(!rootClasses(label()).has('hidden-component'));
});

test('hidden turns pointer events off — for the control and for everything inside it', () => {
  const rule = ruleFor('.canvas-control.hidden-component,\n  .canvas-control.hidden-component :global(.canvas-control)');
  assert.match(rule, /pointer-events:\s*none/,
    'a hidden control is still a hit target — it will keep eating clicks and marquees');
  // The two deliberate re-enables (.preview-interactive, .selected) are more specific than the
  // host rule, so without !important a selected child would be the one clickable thing in an
  // invisible group.
  assert.match(rule, /pointer-events:\s*none\s*!important/,
    'the re-enabling rules will win and punch a hole back through a hidden subtree');
  // The premise the descendant half rests on: hiding really does dim the whole subtree, so
  // "invisible" is true of the children too and making them inert is coherent, not collateral.
  assert.match(ruleFor('.canvas-control.hidden-component {'), /opacity:\s*0\.25/);
});

// ---------------------------------------------------------------------------
// A10 — locked controls are click-through
// ---------------------------------------------------------------------------

test('a control locked on its own is click-through; a locked PANEL is not', () => {
  const locked = rootClasses(label({ locked: true }));
  assert.ok(locked.has('lock-click-through'));
  assert.ok(locked.has('locked'));

  // Panel lock is a different thing and must stay a different thing: making every control inert
  // at once would leave a canvas that ignores the mouse entirely, with nothing to click but the
  // background. It keeps the old swallow-and-refuse path and the not-allowed cursor.
  const panelLocked = rootClasses(label(), { panelLocked: true });
  assert.ok(panelLocked.has('locked'));
  assert.ok(!panelLocked.has('lock-click-through'),
    'panel lock made every control pointer-inert — the canvas is now unclickable');

  // And an unlocked control is neither.
  assert.ok(!rootClasses(label()).has('lock-click-through'));
});

test('the locked rule turns pointer events off through the subtree, like hidden', () => {
  const rule = ruleFor('.canvas-control.lock-click-through,\n  .canvas-control.lock-click-through :global(.canvas-control)');
  assert.match(rule, /pointer-events:\s*none\s*!important/,
    'a locked control still intercepts the click meant for what is beneath it');
});

test('neither rule is applied outside the editor', () => {
  // lock-click-through is gated on editorInteractionEnabled: in preview a control's Mouse section
  // owns whether it takes the pointer, and Core.locked is an authoring flag with no runtime meaning.
  assert.match(source, /class:lock-click-through=\{editorInteractionEnabled && isLocked\}/);
});

// ---------------------------------------------------------------------------
// A13 (last clause) — the drag cursor affordance
// ---------------------------------------------------------------------------

test('a draggable control gets the drag cursor, and a locked one never does', () => {
  assert.ok(rootClasses(label()).has('editor-draggable'));
  assert.ok(!rootClasses(label({ locked: true })).has('editor-draggable'),
    'a locked control claims to be draggable');
  assert.ok(!rootClasses(label(), { panelLocked: true }).has('editor-draggable'));
  assert.ok(!rootClasses(label(), { editorInteractionEnabled: false }).has('editor-draggable'),
    'preview/export markup must not carry an editor affordance');
  // Nothing is mid-drag in a server render, so the grabbing class must be absent by default.
  assert.ok(!rootClasses(label()).has('dragging'));
});

test('the cursor reflects the state: move to drag, grabbing while dragging, not-allowed locked', () => {
  assert.match(ruleFor('.canvas-control.editor-draggable {'), /cursor:\s*move/);
  assert.match(ruleFor('.canvas-control.editor-draggable.dragging {'), /cursor:\s*grabbing/);
  assert.match(ruleFor('.canvas-control.locked {'), /cursor:\s*not-allowed/);
  // The base rule stays `default`: it is what preview and export render with, and the Mouse
  // section's own cursor (inline) has to be free to override it.
  assert.match(ruleFor('.canvas-control {'), /cursor:\s*default/);
});

test('grabbing waits for the drag to ENGAGE, not for the mousedown', () => {
  // The first few screen pixels of a press are still a click (DRAG_ENGAGE_SCREEN_PX); swapping the
  // cursor there makes every ordinary selection twitch.
  assert.match(source, /class:dragging=\{isDragging && dragEngaged\}/);
});
