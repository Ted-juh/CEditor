import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { fileCache, loadFile, getFileUrl } from '../src/CE_Application/stores/fileCache.js';

test('inline shared-panel artwork loads in the native editor without filesystem requests', (t) => {
  const previousWindow = globalThis.window;
  const requests = [];
  globalThis.window = { __JUCE__: { backend: {
    emitEvent: (...args) => requests.push(args),
    addEventListener: () => {},
  } } };
  t.after(() => { globalThis.window = previousWindow; fileCache.set({}); });
  fileCache.set({});
  const image = 'data:image/svg+xml;base64,PHN2Zy8+';
  loadFile(image);
  assert.equal(get(fileCache)[image], image);
  assert.equal(getFileUrl(image), image);
  assert.deepEqual(requests, []);
});
