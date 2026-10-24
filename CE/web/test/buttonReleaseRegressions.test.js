import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyInspectorResolvedValue } from '../src/CE_Application/stores/controls.js';
import { buildBorderSegments } from '../src/CE_Application/utils/borderSegments.js';
import { gradientToCSS } from '../src/CE_Application/utils/gradientCSS.js';
import { plainFillCSS } from '../src/CE_Application/utils/plainFillCSS.js';

function button() {
  return createControl('MomentaryButton', { Core: { id: 'release-button', name: 'Release' }, Transform: { width: 300, height: 40 } });
}
function html(control, props = {}) {
  return render(CanvasControl, { props: { control, allControls: [control], editorInteractionEnabled: false, previewRole: 'button', previewTabIndex: 0, ...props } }).body;
}
test('normal button has a tab stop without a Mouse section; explicit focus/display rules still win', () => {
  const control = button();
  assert.equal(control._children.Mouse, undefined);
  assert.match(html(control), /data-preview-role="button" tabindex="0"/);
  control._children.Behavior.focusable = false;
  assert.match(html(control), /data-preview-role="button" tabindex="-1"/);
  control._children.Behavior.focusable = true;
  control._children.Behavior.valueFlow = 'display';
  assert.match(html(control), /data-preview-role="button" tabindex="-1"/);
  control._children.Behavior.valueFlow = 'twoWay';
  control._children.Mouse = { focusable: true, tabIndex: 3 };
  assert.match(html(control), /data-preview-role="button" tabindex="3"/);
});
test('aspect-locked inspector edits resize both axes within their joint limits', () => {
  const control = button();
  const t = control._children.Transform;
  Object.assign(t, { aspectLock: true, minWidth: 200, maxWidth: 400, minHeight: 40, maxHeight: 80 });
  applyInspectorResolvedValue(control, 'Transform.width', 375, '');
  assert.equal(t.width, 375); assert.equal(t.height, 50);
  applyInspectorResolvedValue(control, 'Transform.height', 80, '');
  assert.equal(t.width, 400); assert.equal(t.height, 400 / 7.5);
  applyInspectorResolvedValue(control, 'Transform.width', 0, '');
  assert.equal(t.width, 300); assert.equal(t.height, 40);
  t.aspectLock = false;
  applyInspectorResolvedValue(control, 'Transform.width', 375, '');
  assert.equal(t.height, 40);
  t.aspectLock = true; t.minHeight = 100;
  const before = { width: t.width, height: t.height };
  assert.equal(applyInspectorResolvedValue(control, 'Transform.width', 380, ''), false);
  assert.deepEqual({ width: t.width, height: t.height }, before);
});
test('shaded borders retain cyan channels and alpha through segment conversion', () => {
  for (const style of ['outset', 'inset', 'groove', 'ridge']) {
    const segments = buildBorderSegments(160, 60, { enabled: true, linked: true, style, thickness: 8, colour: '6600FFFF' }, { linked: true, radius: 8, style: 'rounded', borderEnabled: true });
    assert.ok(segments.length);
    for (const segment of segments) {
      const c = segment.colour;
      assert.match(c, /^#[0-9a-f]{6}66$/i);
      const [r,g,b] = [1,3,5].map(i => parseInt(c.slice(i,i+2),16));
      assert.equal(g,b); assert.ok(r < g, `${style}: cyan became ${c}`);
    }
  }
});
test('Square Ramp target CSS uses colored raster pixels, including the absorbed fill path', () => {
  const previous = globalThis.document;
  let pixels;
  globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }), putImageData: image => { pixels=image.data; } }), toDataURL: () => 'data:image/png;base64,fixture' }) };
  try {
    const gradient = { type: 'squareRamp', stops: [{position:0,color:'FF0000'}, {position:100,color:'0000FF'}] };
    assert.match(gradientToCSS(gradient), /url\("data:image\/png/);
    assert.ok(pixels.some((v,i) => i%4===0 && v>0));
    assert.ok(pixels.some((v,i) => i%4===2 && v>0));
    assert.match(plainFillCSS({ _children: { Fill: { solidEnabled: false, gradientEnabled: true, gradient } } },375,80), /100% 100%/);
  } finally { globalThis.document=previous; }
});
for (const mode of ['line','stair','arc','circle','vertical','wave','zigzag','spiral','perimeter','polyline','bezier','freehand']) {
  test(`texture remains SVG paint in ${mode} flow`, () => {
    const control = button();
    const text=control._children.Text;
    text.content='Release'; text._children.Position.flowMode=mode;
    Object.assign(text._children.Fill,{ mode:'texture', textureSrc:'data:image/svg+xml,%3Csvg/%3E', textureTileScale:2, textureOpacity:50 });
    const markup=html(control);
    assert.match(markup, /<pattern[^>]*-texture"[^>]*width="128"/);
    assert.match(markup, /<text[^>]*fill="url\(#[^"]*-texture\)"/);
    assert.match(markup, /opacity="0.5"/);
  });
}
