import test from 'node:test';
import assert from 'node:assert/strict';

import { deserializePanel, serializePanel, createPanel } from '../src/CE_Application/stores/panelModel.js';

test('deserializePanel returns null on malformed JSON instead of throwing', () => {
  assert.equal(deserializePanel('{ not valid json', 'C:/tmp/broken.cepanel', null), null);
  assert.equal(deserializePanel('', 'C:/tmp/empty.cepanel', null), null);
});

test('deserializePanel returns null when the JSON is not a panel object', () => {
  assert.equal(deserializePanel('42', 'C:/tmp/number.cepanel', null), null);
  assert.equal(deserializePanel('null', 'C:/tmp/null.cepanel', null), null);
  assert.equal(deserializePanel('[1,2,3]', 'C:/tmp/array.cepanel', null), null);
});

test('deserializePanel round-trips a valid panel document', () => {
  const json = serializePanel(createPanel());
  const panel = deserializePanel(json, 'C:/tmp/ok.cepanel', 'Round Trip');
  assert.ok(panel);
  assert.equal(panel.filePath, 'C:/tmp/ok.cepanel');
  assert.equal(panel.name, 'Round Trip');
  assert.equal(panel.modified, false);
});
