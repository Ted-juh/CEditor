import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extensionForLanguage,
  languageFromFilename,
  baseName,
  filenameForScript,
  scriptOverridesFromFile,
  inferEventFromSource,
} from '../src/CE_Application/scripting/scriptFileIo.js';

test('extensionForLanguage maps known languages and defaults to lua', () => {
  assert.equal(extensionForLanguage('lua'), 'lua');
  assert.equal(extensionForLanguage('javascript'), 'js');
  assert.equal(extensionForLanguage('python'), 'py');
  assert.equal(extensionForLanguage('whatever'), 'lua');
});

test('languageFromFilename recognises extensions, null when unknown', () => {
  assert.equal(languageFromFilename('a.lua'), 'lua');
  assert.equal(languageFromFilename('Cutoff.JS'), 'javascript');
  assert.equal(languageFromFilename('mod.mjs'), 'javascript');
  assert.equal(languageFromFilename('hook.py'), 'python');
  assert.equal(languageFromFilename('notes.txt'), null);
  assert.equal(languageFromFilename('noext'), null);
});

test('baseName strips path and extension', () => {
  assert.equal(baseName('/home/me/Cutoff follow.lua'), 'Cutoff follow');
  assert.equal(baseName('C:\\scripts\\Boot.js'), 'Boot');
  assert.equal(baseName('plain'), 'plain');
});

test('filenameForScript builds a safe stem + correct extension', () => {
  assert.equal(filenameForScript({ name: 'Cutoff follow', language: 'lua' }), 'Cutoff_follow.lua');
  assert.equal(filenameForScript({ name: 'a/b:c?', language: 'javascript' }), 'a_b_c.js');
  assert.equal(filenameForScript({ name: '   ', language: 'python' }), 'script.py');
});

test('scriptOverridesFromFile infers language from extension', () => {
  const o = scriptOverridesFromFile('Boot.js', 'function onPanelReady() {}', 'lua');
  assert.equal(o.language, 'javascript');
  assert.equal(o.name, 'Boot');
  assert.equal(o.source, 'function onPanelReady() {}');
});

test('scriptOverridesFromFile falls back to editor language for unknown extensions', () => {
  const o = scriptOverridesFromFile('snippet.txt', 'print("x")', 'lua');
  assert.equal(o.language, 'lua');
  assert.equal(o.name, 'snippet');
  // unrunnable fallback is coerced to lua
  const o2 = scriptOverridesFromFile('snippet.txt', 'x', 'cobol');
  assert.equal(o2.language, 'lua');
});

test('scriptOverridesFromFile tolerates non-string text', () => {
  const o = scriptOverridesFromFile('a.lua', undefined, 'lua');
  assert.equal(o.source, '');
});

test('inferEventFromSource finds the first known handler (function or def)', () => {
  const known = ['onPanelReady', 'onValueChanged', 'onPanelClose'];
  assert.equal(inferEventFromSource('function onPanelReady(info)\nend', known), 'onPanelReady');
  assert.equal(inferEventFromSource('def onValueChanged(v):\n  pass', known), 'onValueChanged');
  // earliest match wins when several are present
  assert.equal(inferEventFromSource('function onPanelClose() end\nfunction onPanelReady() end', known), 'onPanelClose');
  assert.equal(inferEventFromSource('local x = 1', known), null);
  assert.equal(inferEventFromSource('', known), null);
});
