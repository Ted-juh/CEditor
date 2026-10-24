// canvasControlTextSettings.test.js — the text settings and content box CanvasControl lays a label
// out with, each resolved in one call that hands back the same object while nothing changed
// (canvasControlTextSettings.js, canvasControlContentBox.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveTextSettings } from '../src/CE_Application/editor/canvasControlTextSettings.js';
import { resolveContentBox } from '../src/CE_Application/editor/canvasControlContentBox.js';

test('no sections: the defaults a plain label is laid out with', () => {
  const set = resolveTextSettings(undefined, undefined, undefined);
  assert.equal(set.wrapMode, 'word');
  assert.equal(set.lineHeightMultiplier, 1.2);
  assert.equal(set.flowMode, 'rotate');
  assert.equal(set.usesCustomFlow, false);
  assert.equal(set.forceLineBoxWidth, true);
  assert.equal(set.rotationDegrees, 0);
  assert.equal(set.readingOrientation, 'ltr');
  assert.equal(set.scriptScale, 1);
});

test('settings are normalised as the label renderer reads them', () => {
  const set = resolveTextSettings(
    { scriptMode: 'superscript', size: 20, baselineShift: 1 },
    { readingOrientation: 'mirrored', orientation: 'rotate90' },
    { wrapMode: 'nonsense', lineHeight: 0.1, maxLines: 2.6, overflowMode: 'ellipsis', fitMode: 'shrink', fillWidthMode: 'fill' },
  );
  assert.equal(set.isMirrored, true);
  assert.equal(set.scriptScale, 0.72);
  assert.equal(set.wrapMode, 'word', 'an unknown wrap mode wraps by word');
  assert.equal(set.lineHeightMultiplier, 0.5, 'line height is clamped');
  assert.equal(set.maxLines, 3);
  assert.equal(set.paragraphMode, 'justify', 'the earlier fillWidthMode still reads');
  assert.equal(set.rotationDegrees, 90);
});

test('text on a path has no rotation and no line box to fill', () => {
  const set = resolveTextSettings(undefined, { flowMode: 'arc', orientation: 'rotate90' }, undefined);
  assert.equal(set.usesCustomFlow, true);
  assert.equal(set.rotationDegrees, 0);
  assert.equal(set.forceLineBoxWidth, false);
});

test('the same settings hand back the same object, so the layout that reads them does not re-run', () => {
  const font = { size: 14 }, position = { offsetX: 0 }, multiline = { wrapMode: 'none' };
  const first = resolveTextSettings(font, position, multiline);
  assert.equal(resolveTextSettings({ ...font }, { ...position }, { ...multiline }, first), first, 'equal sections, new objects');
  assert.equal(resolveTextSettings(font, { offsetX: 12 }, multiline, first), first, 'an offset is none of these settings');
  const changed = resolveTextSettings(font, position, { wrapMode: 'character' }, first);
  assert.notEqual(changed, first);
  assert.equal(changed.wrapMode, 'character');
});

test('the content box makes room for an icon on its side and for a lamp at its end', () => {
  const box = resolveContentBox({ paddingLeft: 6, gap: 4 }, undefined, 'icon_left_text_right', { source: 'library', size: 20 }, null);
  assert.equal(box.paddingLeft, 6);
  assert.equal(box.textPaddingLeft, 6 + 20 + 4);
  assert.equal(box.textPaddingRight, 4, 'the right side keeps the default padding');
  const lamp = resolveContentBox(undefined, undefined, 'text_only', undefined, { onRight: true, width: 10, gap: 3 });
  assert.equal(lamp.paddingRight, 4 + 10 + 3);
  assert.equal(lamp.paddingLeft, 4);
  const noIcon = resolveContentBox(undefined, undefined, 'icon_left_text_right', { source: 'none' }, null);
  assert.equal(noIcon.textPaddingLeft, noIcon.paddingLeft, 'an icon set to none takes no room');
});

test('the content box hands back the same object while nothing changed', () => {
  const layout = { paddingTop: 2 }, position = { offsetX: 1 };
  const first = resolveContentBox(layout, position, 'text_only', undefined, null);
  assert.equal(resolveContentBox({ ...layout }, { ...position }, 'text_only', undefined, null, first), first);
  assert.notEqual(resolveContentBox(layout, { offsetX: 2 }, 'text_only', undefined, null, first), first);
});

test('CanvasControl reads them from one derived each', () => {
  const source = readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8');
  assert.match(source, /let textSet = \$derived\(lastTextSet = resolveTextSettings\(/);
  assert.match(source, /let contentBox = \$derived\(lastContentBox = resolveContentBox\(/);
  for (const name of ['textWrapMode', 'usesCustomTextFlow', 'textRotationDegrees', 'layoutPaddingLeft', 'effectiveTextPaddingTop']) {
    assert.ok(!new RegExp(`let ${name} = \\$derived`).test(source), `${name} is a field now`);
  }
});
