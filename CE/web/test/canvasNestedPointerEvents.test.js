// canvasNestedPointerEvents.test.js — a nested control has to be reachable by the pointer.
//
// The bug this pins was a comment that described behaviour nobody wrote. CanvasControl puts its
// children inside `.children-clip` / `.children-origin`, both `pointer-events: none`, above the
// note "children re-enable interaction via their own .canvas-control". They did not: nothing in
// the file set `pointer-events` back to `auto`, and the property INHERITS — so every nested
// control was pointer-transparent and its container swallowed the lot. A button parented into a
// Group with ce.panel.parent() could not be hovered, pressed or focused in preview. It rendered
// perfectly, which is why it read as a scripting fault rather than a CSS one.
//
// The rule is deliberately scoped to `.preview-interactive`. Outside preview the transparency is
// wanted: clicking a child selects its container, which is how a group is dragged as a unit. So
// the fix must NOT be a blanket `pointer-events: auto` on nested controls, and the scoping is
// asserted here rather than left to a reviewer to notice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'CanvasControl.svelte'), 'utf8',
);

/** The CSS block only, so a `pointer-events:none` written inline on an SVG layer is not counted. */
const styles = source.slice(source.lastIndexOf('<style'));

test('the layers that hold nested children are transparent to the pointer', () => {
  // The premise. If these ever stop being none the rule below is pointless, and this test should
  // fail loudly rather than keep passing while guarding nothing.
  for (const layer of ['.children-clip', '.children-origin']) {
    const block = styles.slice(styles.indexOf(`${layer} {`));
    assert.ok(/^[^}]*pointer-events:\s*none/m.test(block.slice(0, block.indexOf('}'))),
      `${layer} no longer sets pointer-events: none — is the re-enabling rule still needed?`);
  }
});

test('a nested control takes its own pointer events back when it is interactive in preview', () => {
  assert.match(styles, /\.children-origin\s+:global\(\.canvas-control\.preview-interactive\)\s*\{[^}]*pointer-events:\s*auto/,
    'nothing re-enables pointer events on a nested preview-interactive control — a button inside '
    + 'a Group is unreachable again');
});

test('and only then — the editor still wants an unselected child click to land on its container', () => {
  // A blanket re-enable would change selection behaviour on the canvas, which is a different
  // feature with its own expectations. Every pointer-events:auto in the file must be qualified
  // by one of the three deliberate exceptions:
  //   - .preview-interactive — preview mode hands nested controls their events back;
  //   - .selected            — the drill-down: double-clicking a container selects the child
  //                            under the pointer, and a SELECTED child is directly draggable
  //                            (an unselected child still clicks through to its container);
  //   - .inline-text-editor  — the in-place text editor must be typeable wherever it opens.
  const enabling = [...styles.matchAll(/([^{}]*)\{[^}]*pointer-events:\s*auto[^}]*\}/g)]
    .map((m) => m[1].trim());
  assert.ok(enabling.length > 0, 'expected at least the nested-child rule');
  for (const selector of enabling) {
    assert.match(selector, /preview-interactive|\.selected|\.inline-text-editor/,
      `"${selector}" turns pointer events on for UNSELECTED children outside preview — that would `
      + 'break click-selects-the-container');
  }
});

test('the drill-down rule waits for the selection class the component actually applies', () => {
  assert.match(styles, /\.children-origin\s+:global\(\.canvas-control\.selected\)\s*\{[^}]*pointer-events:\s*auto/,
    'nothing re-enables pointer events on a SELECTED nested child — after double-click drill-down '
    + 'the child could be selected but not dragged');
  assert.match(source, /class:selected=\{editorInteractionEnabled && isSelected && !panelLocked\}/,
    'the rule targets .selected but the markup no longer applies that class in the editor');
});

test('the class the rule waits for is the class the component actually applies', () => {
  // The two halves are written in different languages a thousand lines apart. Renaming one and
  // not the other leaves a selector that matches nothing and a bug that looks like scripting.
  assert.match(source, /class:preview-interactive=\{previewInteractive\}/,
    'the rule targets .preview-interactive but the markup no longer applies that class');
});
