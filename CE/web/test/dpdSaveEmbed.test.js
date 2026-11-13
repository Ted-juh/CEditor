import test from 'node:test';
import assert from 'node:assert/strict';
import { modelToEmbed } from '../src/CE_Application/editor/dpd/saveEmbed.js';

test('a profile converted on opening and saved unedited does not carry a copy of its model', () => {
  const model = { id: 'x', scopes: { global: { parameters: [{ id: 'a' }] } } };
  const openingJson = JSON.stringify(model);
  assert.equal(modelToEmbed({ converted: true, openingJson, model }), undefined);
  // Edited, it does: the designer opens the edits next time.
  const edited = { ...model, label: 'Edited' };
  assert.equal(modelToEmbed({ converted: true, openingJson, model: edited }), edited);
  // A hand-made or adopted model always does.
  assert.equal(modelToEmbed({ converted: false, openingJson, model }), model);
});
