import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericDraft } from '../src/CE_Application/utils/numericDraft.js';

test('numeric property drafts accept either decimal separator', () => {
  assert.equal(parseNumericDraft('0,5'), 0.5);
  assert.equal(parseNumericDraft('0.5'), 0.5);
  assert.equal(parseNumericDraft('-1,25'), -1.25);
});

test('numeric property drafts reject incomplete values instead of committing a prefix', () => {
  for (const draft of ['', '1,2.3', '12foo', '1,2,3']) {
    assert.ok(Number.isNaN(parseNumericDraft(draft)), draft);
  }
});
