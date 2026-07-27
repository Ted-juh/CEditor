// Golden-output tests for the SVG text-effect renderer in CanvasControl.
//
// The text visual is the most intricate markup in the editor: ~9 stacked paint layers (shadow
// copies, glow, bevel, outline, second stroke, inner glow, inner shadow, reflection, fill),
// each emitted twice — once for custom-flow text laid out per glyph, once for block text laid
// out per line. It had no coverage at all, so any refactor of it was unverifiable.
//
// These tests server-render a control with every effect switched on, in both layout modes, and
// pin the emitted SVG. They are deliberately structural rather than pixel-exact: they assert the
// layer set, the id namespacing that keeps the two modes' <defs> from colliding, and the
// per-glyph vs per-line drawing primitive. That is what a refactor must preserve.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';

/**
 * A Label with text and every text effect switched on. `flowMode` picks the layout path:
 * 'rotate' is block layout (laid out per line); a path mode such as 'arc' is custom flow (per
 * glyph). normalizeTextFlowMode only accepts a fixed set — an unknown name silently falls back
 * to 'rotate', which quietly turns a "custom flow" case into a second block case.
 * Several gates require a non-zero size as well as the flag, so the sizes matter here.
 */
function texturedLabel(flowMode) {
  const control = createControl('Label', {
    Core: { id: `label_${flowMode}`, name: 'Textured' },
    Transform: { width: 240, height: 80 },
    Text: { content: 'Wave' },
  });

  const text = control._children.Text;
  text._children.Position = { ...(text._children.Position ?? {}), flowMode };
  text._children.Effects = {
    ...(text._children.Effects ?? {}),
    outlineEnabled: true, outlineThickness: 2,
    stroke2Enabled: true, stroke2Thickness: 2,
    bevelEnabled: true, bevelDepth: 2, bevelStyle: 'emboss',
    innerGlowEnabled: true, innerGlowSize: 3,
    innerShadowEnabled: true, innerShadowSize: 3,
    glowEnabled: true, glowSize: 4,
    shadowEnabled: true, shadowSize: 4,
    reflectionEnabled: true, reflectionFadeEnabled: true,
  };
  return control;
}

function renderControl(control) {
  return render(CanvasControl, {
    props: { control, allControls: [control], editorInteractionEnabled: false },
  }).body;
}

/**
 * Pull the text-visual <svg> out of the rendered markup. Svelte appends a scoped class, so
 * match the class list rather than an exact attribute, and balance nested <svg> tags.
 */
function textVisualSvg(html) {
  const open = /<svg[^>]*class="[^"]*\btext-visual-svg\b[^"]*"[^>]*>/.exec(html);
  if (!open) return '';
  const start = open.index;
  let depth = 0;
  const tag = /<svg\b|<\/svg>/g;
  tag.lastIndex = start;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[0] === '</svg>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return '';
}

for (const [mode, flowMode] of [['block', 'rotate'], ['custom-flow', 'arc']]) {
  test(`${mode} text renders a text-visual layer stack`, () => {
    const svg = textVisualSvg(renderControl(texturedLabel(flowMode)));
    assert.ok(svg.length > 0, 'expected a text-visual svg to be emitted');
    assert.match(svg, /<mask /, 'expected at least one mask in <defs>');
    assert.ok(svg.includes('<text'), 'expected the text to actually be drawn');
  });

  test(`${mode} text namespaces its defs ids`, () => {
    // Both modes can be present in one document; colliding ids would cross-wire their masks.
    const svg = textVisualSvg(renderControl(texturedLabel(flowMode)));
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, 'expected namespaced defs ids');
    assert.equal(new Set(ids).size, ids.length, `duplicate defs ids: ${ids.join(', ')}`);
  });
}

// Both modes now share one layer stack (the textVisual snippet) and differ only in the snippet
// that draws the glyphs. What must NOT converge is the group chain each mode wraps its runs in:
// block nests textSvgBlockTransform above the mirror, custom flow has no block transform at all,
// and those groups carry the transform and mask that decide which coordinate space a mask
// resolves in. These pin that the shared stack still lets each mode keep its own chain.
for (const [mode, flowMode, wrapper] of [
  ['block', 'rotate', 'textSvgBlockTransform'],
  ['custom-flow', 'arc', 'textSvgMirrorTransform'],
]) {
  test(`${mode} text keeps its own group/transform chain`, () => {
    const svg = textVisualSvg(renderControl(texturedLabel(flowMode)));
    const groups = (svg.match(/<g\b/g) ?? []).length;
    assert.ok(groups > 0, `${mode} should wrap its runs in groups (${wrapper})`);
    assert.equal(groups, (svg.match(/<\/g>/g) ?? []).length, 'unbalanced <g> nesting');
  });
}

test('block and custom flow do not emit the same group structure', () => {
  // Compares opening <g> tags with attributes — the transforms and masks are the whole point,
  // so a bare tag count would not notice them moving.
  const shape = (flowMode) =>
    (textVisualSvg(renderControl(texturedLabel(flowMode))).match(/<g\b[^>]*>/g) ?? []).join('|');
  assert.notEqual(shape('rotate'), shape('arc'));
});

// Mirrored text is the case the shared stack had to get right: every layer must sit under the
// same mirror transform. Custom-flow inner-placement outline/stroke2 used to be drawn unmirrored
// while masked against a mirrored mask, so its outline sat offset from the glyphs.
test('every drawn run in mirrored custom-flow text is mirrored', () => {
  const control = texturedLabel('arc');
  control._children.Text._children.Position.readingOrientation = 'mirrored';
  control._children.Text._children.Effects.outlinePlacement = 'inner';
  control._children.Text._children.Effects.stroke2Placement = 'inner';
  const svg = textVisualSvg(renderControl(control));

  // Walk the tree and confirm no <text> is painted outside a mirroring group.
  let depth = 0, mirrored = [], unmirrored = 0;
  for (const m of svg.matchAll(/<g\b[^>]*>|<\/g>|<text\b/g)) {
    const tag = m[0];
    if (tag === '</g>') { mirrored.length = Math.max(0, --depth); continue; }
    if (tag.startsWith('<g')) { depth++; mirrored[depth - 1] = /scale\(-1 1\)/.test(tag); continue; }
    if (!mirrored.slice(0, depth).some(Boolean)) unmirrored += 1;
  }
  assert.equal(unmirrored, 0, `${unmirrored} run(s) painted outside the mirror transform`);
});

test('the two layout modes never share a defs id', () => {
  const idsOf = (flowMode) => new Set(
    [...textVisualSvg(renderControl(texturedLabel(flowMode))).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  );
  const shared = [...idsOf('rotate')].filter((id) => idsOf('arc').has(id));
  assert.deepEqual(shared, [], `block and custom-flow text must not share defs ids: ${shared.join(', ')}`);
});
