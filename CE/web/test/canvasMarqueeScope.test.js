// canvasMarqueeScope.test.js — the marquee can finally reach nested controls.
//
// Review finding A9, last clause: "Marquee cannot select inside containers, so there is no
// rubber-band selection of nested controls, ever." The flat top-level loop was documented as
// intent, which made the limitation permanent rather than explaining it away.
//
// The fix gives the marquee a SCOPE that follows the drill-down the canvas already has
// (double-click a container to select the child under the pointer, Escape to step back out).
// There is no separate "inside this group" flag to read — the drill state IS the selection —
// so these tests pin both halves: that the scope is derived correctly from a selection, and
// that a scoped marquee selects children in the container's own coordinate frame.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { findControlsInRect, marqueeScopeId } from '../src/CE_Application/utils/canvasSelection.js';
import { getSection } from '../src/CE_Application/models/componentTypes.js';

const leaf = (id, x, y, w, h, extra = {}) => ({
  _children: { Core: { id }, Transform: { x, y, width: w, height: h, ...extra } },
});

/**
 * Panel:
 *   TOP        top-level at (0,0) 40x40
 *   BOX        container at (100,100) 200x200, padding 10 → children origin (110,110)
 *     A        local (0,0)   50x20  → panel (110,110)..(160,130)
 *     B        local (0,60)  50x20  → panel (110,170)..(160,190)
 *     OUT      local (0,400) 50x20  → panel (110,510)… well outside the marquees below
 */
function panel() {
  const a = leaf('A', 0, 0, 50, 20);
  const b = leaf('B', 0, 60, 50, 20);
  const out = leaf('OUT', 0, 400, 50, 20);
  const box = {
    _children: {
      Core: { id: 'BOX' },
      Transform: { x: 100, y: 100, width: 200, height: 200 },
      Children: { _type: 'Children', padding: 10, _children: { A: a, B: b, OUT: out } },
    },
  };
  return [leaf('TOP', 0, 0, 40, 40), box];
}

test('marqueeScopeId is null with nothing selected, or with a top-level control selected', () => {
  assert.equal(marqueeScopeId(panel(), new Set()), null);
  assert.equal(marqueeScopeId(panel(), new Set(['TOP'])), null);
  assert.equal(marqueeScopeId(panel(), new Set(['BOX'])), null);
});

test('marqueeScopeId names the container a drilled-into child lives in', () => {
  assert.equal(marqueeScopeId(panel(), new Set(['A'])), 'BOX');
  // Several children of the same container — what a previous scoped marquee leaves behind.
  assert.equal(marqueeScopeId(panel(), new Set(['A', 'B'])), 'BOX');
});

test('marqueeScopeId refuses a selection that straddles the container boundary', () => {
  assert.equal(marqueeScopeId(panel(), new Set(['A', 'TOP'])), null);
  assert.equal(marqueeScopeId(panel(), new Set(['A', 'BOX'])), null);
});

test('an unscoped marquee still selects top-level controls only', () => {
  // A rect covering the whole panel: the container is selected, its children are not.
  const ids = findControlsInRect(panel(), { x: 0, y: 0, w: 1000, h: 1000 }, getSection);
  assert.deepEqual([...ids].sort(), ['BOX', 'TOP']);
});

test('a scoped marquee selects the container\'s children and nothing else', () => {
  // Panel-space rect over both A and B, which live at (110,110) and (110,170).
  const ids = findControlsInRect(panel(), { x: 105, y: 105, w: 100, h: 100 }, getSection, 'BOX');
  assert.deepEqual([...ids].sort(), ['A', 'B']);
  assert.ok(!ids.has('BOX'), 'the container the marquee runs inside is not itself a result');
  assert.ok(!ids.has('TOP'), 'top-level controls are out of scope');
});

test('a scoped marquee translates the rect into the container frame', () => {
  // The same rect in the container's LOCAL coordinates would cover A and B too — proving the
  // conversion happened rather than the numbers coincidentally lining up, this rect is placed so
  // that it only hits B in panel space (y 165..195) and would hit nothing if used unconverted.
  const ids = findControlsInRect(panel(), { x: 105, y: 165, w: 100, h: 30 }, getSection, 'BOX');
  assert.deepEqual([...ids], ['B']);
});

test('a scoped marquee misses children outside it, and never leaves the one level', () => {
  const ids = findControlsInRect(panel(), { x: 105, y: 105, w: 100, h: 100 }, getSection, 'BOX');
  assert.ok(!ids.has('OUT'));
});

test('scoping is skipped for a rotated container rather than guessing where its children are', () => {
  const tree = panel();
  tree[1]._children.Transform.rotation = 30;
  const ids = findControlsInRect(tree, { x: 0, y: 0, w: 1000, h: 1000 }, getSection, 'BOX');
  assert.equal(ids.size, 0);
});

test('an unknown or childless scope selects nothing rather than falling back to top level', () => {
  assert.equal(findControlsInRect(panel(), { x: 0, y: 0, w: 1000, h: 1000 }, getSection, 'NOPE').size, 0);
  assert.equal(findControlsInRect(panel(), { x: 0, y: 0, w: 1000, h: 1000 }, getSection, 'TOP').size, 0);
});

test('the canvas actually scopes its marquee, and can start one inside the container', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    join(here, '..', 'src', 'CE_Application', 'editor', 'EditorCanvas.svelte'), 'utf8',
  );
  assert.match(source, /marqueeScopeId\(canvasPanel\.controls, \$selectedComponentIds\)/);
  assert.match(source, /findControlsInRect\(canvasPanel\.controls, rect, getSection, scopeId\)/);
  // A container fills the space its children sit in, so a scoped marquee has to be able to begin
  // on the container's own body — otherwise the feature only works for containers small enough to
  // sweep past from outside.
  assert.match(source, /alsoStartsOn: \(target\) => isDrilledScopeBody\(target\)/);
  assert.match(source, /function isDrilledScopeBody\(target\)/);
});
