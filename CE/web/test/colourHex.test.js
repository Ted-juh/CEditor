import test from 'node:test';
import assert from 'node:assert/strict';
import { aarrggbbToHex, mergeHexKeepAlpha } from '../src/CE_Application/utils/colourHex.js';

test('aarrggbbToHex strips alpha and lowercases', () => {
  assert.equal(aarrggbbToHex('FF2BE86A'), '#2be86a');
  assert.equal(aarrggbbToHex('2BE86A'), '#2be86a');       // 6-digit RRGGBB
  assert.equal(aarrggbbToHex('#FF2BE86A'), '#2be86a');    // leading hash
  assert.equal(aarrggbbToHex(''), '#000000');             // empty -> black
  assert.equal(aarrggbbToHex('nonsense'), '#000000');     // invalid -> black
});

test('mergeHexKeepAlpha preserves the previous alpha', () => {
  assert.equal(mergeHexKeepAlpha('4D0E5A2E', '#ff0000'), '4DFF0000');
  assert.equal(mergeHexKeepAlpha('2BE86A', '#123456'), 'FF123456'); // no alpha -> FF
  assert.equal(mergeHexKeepAlpha('', '#abcdef'), 'FFABCDEF');
  assert.equal(mergeHexKeepAlpha('80FFFFFF', '000000'), '80000000'); // hash optional
});
