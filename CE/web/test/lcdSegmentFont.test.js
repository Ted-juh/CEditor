import test from 'node:test';
import assert from 'node:assert/strict';

import { getSegmentGlyph, SEGMENT_VIEWBOX } from '../src/CE_Application/utils/lcdSegmentFont.js';

test('every mode returns geometry + a lit Set for digits', () => {
  for (const mode of ['7', '9', 'curved9', '14', '16']) {
    for (const ch of '0123456789') {
      const { geometry, lit } = getSegmentGlyph(mode, ch);
      assert.ok(geometry && typeof geometry === 'object', `${mode} ${ch} geometry`);
      assert.ok(lit instanceof Set, `${mode} ${ch} lit is Set`);
      // Every lit segment names a real geometry key.
      for (const seg of lit) assert.ok(seg in geometry, `${mode} ${ch}: unknown segment ${seg}`);
    }
  }
});

test('14-segment is a distinct glyph set from 16-segment', () => {
  // 16-seg splits the top bar into a1/a2; 14-seg uses a single "a".
  const zero16 = getSegmentGlyph('16', '0').lit;
  const zero14 = getSegmentGlyph('14', '0').lit;
  assert.ok(zero16.has('a1') && zero16.has('a2'), '16-seg has split top');
  assert.ok(zero14.has('a') && !zero14.has('a1'), '14-seg has single top bar');
  assert.ok(zero14.has('d') && !zero14.has('d1'), '14-seg has single bottom bar');
  // Centre stays split in both.
  assert.ok(getSegmentGlyph('14', 'E').lit.has('g1'), '14-seg keeps split centre');
});

test('colon and semicolon render a dedicated two-dot cell in every mode', () => {
  for (const mode of ['7', '9', 'curved9', '14', '16']) {
    for (const ch of [':', ';']) {
      const { geometry, lit } = getSegmentGlyph(mode, ch);
      assert.deepEqual([...lit].sort(), ['cb', 'ct'], `${mode} ${ch}`);
      assert.ok(geometry.ct.kind === 'dot' && geometry.cb.kind === 'dot');
    }
  }
});

test('decimal point / comma light the dp dot', () => {
  for (const ch of ['.', ',']) {
    assert.deepEqual([...getSegmentGlyph('7', ch).lit], ['dp']);
  }
});

test('degree renders on every family (was missing from 16-seg)', () => {
  for (const mode of ['7', '9', '14', '16']) {
    assert.ok(getSegmentGlyph(mode, '°').lit.size > 0, `${mode} degree`);
  }
});

test('lowercase folds to uppercase; unknown chars are blank', () => {
  assert.deepEqual([...getSegmentGlyph('16', 'a').lit].sort(), [...getSegmentGlyph('16', 'A').lit].sort());
  assert.equal(getSegmentGlyph('7', '☃').lit.size, 0); // snowman -> blank
});

test('viewbox is exported and sane', () => {
  assert.equal(SEGMENT_VIEWBOX.width, 100);
  assert.equal(SEGMENT_VIEWBOX.height, 180);
});
