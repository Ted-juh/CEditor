import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { setNestedValue, probeNestedWrite, valueAtPath } from '../src/CE_Application/stores/controlTreeUtils.js';
import { plainFillCSS } from '../src/CE_Application/utils/plainFillCSS.js';
import { EFFECT_SURFACES, effectSurfacePatch, resolvedSurfaceEffects, hasBackgroundEffects, surfaceShadows } from '../src/CE_Application/utils/surfaceEffects.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { resolveStateScopedControl } from '../src/CE_Application/utils/interactionRuntime.js';

const fixture = () => ({ _children: { Background: structuredClone(SECTION_DEFAULTS.Background), Effects: structuredClone(SECTION_DEFAULTS.Effects) } });

test('optional target nodes materialise on writes without modifying other targets', () => {
  for (const { id, root } of EFFECT_SURFACES.filter((s) => s.id !== 'component')) {
    const control = fixture(), before = structuredClone(control);
    const path = `${root}.Shadows.items.0.blur`;
    assert.equal(probeNestedWrite(control, path, 17).writes, true, root);
    assert.deepEqual(control, before, 'probing leaves the document unchanged');
    const patch = effectSurfacePatch(control, id, { 'Effects.Shadows.items.0.blur': 17, 'Effects.Shadows.items.0.enabled': true });
    for (const [key, value] of Object.entries(patch)) assert.equal(setNestedValue(control, key, value), true, key);
    assert.equal(valueAtPath(control, path), 17);
    assert.equal(valueAtPath(control, `${root}.Shadows.items.0.colour`), '66000000');
    assert.deepEqual(control._children.Effects, before._children.Effects);
    assert.equal(hasBackgroundEffects(control._children.Background), true);
    assert.equal(plainFillCSS(control._children.Background, 240, 160), null, 'scoped paint is never absorbed into the text wrapper');
    const loaded = JSON.parse(JSON.stringify(control));
    assert.equal(resolvedSurfaceEffects(loaded, id)._children.Shadows.items[0].blur, 17);
  }
});

test('editing a colour first creates all defaults, including a real shadow array', () => {
  const control = fixture();
  assert.equal(setNestedValue(control, 'Background.Fill.ImageEffects.Shadows.items.0.colour', '80123456'), true);
  assert.equal(valueAtPath(control, 'Background.Fill.ImageEffects.Shadows.items.0.blur'), 4);
  assert.equal(valueAtPath(control, 'Background.Fill.ImageEffects.Shadows.items.0.enabled'), false);
  assert.equal(hasBackgroundEffects(control._children.Background), false);
  assert.notEqual(plainFillCSS(control._children.Background, 240, 160), null);
});

test('shadow rendering preserves alpha, spread and inner/outer glow semantics', () => {
  const effects = { _children: { Shadows: { items: [
    { enabled: true, type: 'outer-glow', offsetX: 30, offsetY: 40, blur: 12, spread: 3, colour: '80123456' },
    { enabled: true, type: 'inner', offsetX: -4, offsetY: 2, blur: 5, spread: -2, colour: 'FFABCDEF' },
    { enabled: false, type: 'drop' },
  ] } } };
  assert.deepEqual(surfaceShadows(effects), [
    { inner: false, x: 0, y: 0, blur: 12, spread: 3, colour: '#123456', alpha: 128 / 255 },
    { inner: true, x: -4, y: 2, blur: 5, spread: -2, colour: '#ABCDEF', alpha: 1 },
  ]);
});

test('surface effects and state-only targets survive the actual panel file round trip', () => {
  const panel = createPanel('Surface effects');
  const control = createControl('Button');
  panel.controls.push(control);
  for (const { id } of EFFECT_SURFACES) {
    const patch = effectSurfacePatch(control, id, { 'Effects.Shadows.items.0.enabled': true, 'Effects.Shadows.items.0.blur': 19 });
    for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  }
  const other = createControl('Button');
  other._children.States._children.Hover.patches.component = effectSurfacePatch(other, 'image', {
    'Effects.Shadows.items.0.enabled': true, 'Effects.Shadows.items.0.blur': 27,
  });
  panel.controls.push(other);
  const loaded = deserializePanel(serializePanel(panel), null, 'Surface effects');
  for (const { id } of EFFECT_SURFACES) assert.equal(resolvedSurfaceEffects(loaded.controls[0], id)._children.Shadows.items[0].blur, 19);
  const hover = resolveStateScopedControl(loaded.controls[1], 'Hover');
  assert.equal(resolvedSurfaceEffects(hover, 'image')._children.Shadows.items[0].blur, 27);
  assert.equal(hasBackgroundEffects(loaded.controls[1]._children.Background), false, 'state-only effects leave the base untouched');
});
