import test from 'node:test';
import assert from 'node:assert/strict';

import { panelScriptLanguages, shouldEmbedPython, isRunnableSource, normalizeLanguage }
  from '../../../tools/scripts/pythonEmbed.mjs';

// Embedding native CPython adds ~tens of MB to the export, so the auto-detection must match what the
// shipped C++ host actually runs (non-empty source + language) — an empty Python stub must NOT embed.

test('isRunnableSource requires non-empty source AND language', () => {
  assert.equal(isRunnableSource({ language: 'python', source: 'x = 1' }), true);
  assert.equal(isRunnableSource({ language: 'python', source: '' }), false);
  assert.equal(isRunnableSource({ language: 'python', source: '   ' }), false);
  assert.equal(isRunnableSource({ language: '', source: 'x = 1' }), false);
  assert.equal(isRunnableSource(null), false);
});

test('normalizeLanguage folds the py alias onto python', () => {
  assert.equal(normalizeLanguage('py'), 'python');
  assert.equal(normalizeLanguage('PYTHON'), 'python');
  assert.equal(normalizeLanguage(' Lua '), 'lua');
});

test('an empty Python stub does NOT trigger embed (no 56 MB cost for a skipped script)', () => {
  const doc = { scripts: [{ language: 'python', source: '', enabled: true }] };
  assert.equal(panelScriptLanguages(doc).has('python'), false);
  assert.equal(shouldEmbedPython(doc, 'auto'), false);
});

test('a real Python script triggers embed; py alias counts too', () => {
  assert.equal(shouldEmbedPython({ scripts: [{ language: 'python', source: 'def f():\n  pass' }] }, 'auto'), true);
  assert.equal(shouldEmbedPython({ scripts: [{ language: 'py', source: 'x = 1' }] }, 'auto'), true);
});

test('disabled scripts are ignored; control-level Scripts sections are scanned', () => {
  assert.equal(shouldEmbedPython({ scripts: [{ language: 'python', source: 'x=1', enabled: false }] }, 'auto'), false);
  const withControl = {
    controls: [{ _children: { Scripts: { enabled: true, scripts: [{ language: 'python', source: 'x=1' }] } } }],
  };
  assert.equal(shouldEmbedPython(withControl, 'auto'), true);
  const disabledSection = {
    controls: [{ _children: { Scripts: { enabled: false, scripts: [{ language: 'python', source: 'x=1' }] } } }],
  };
  assert.equal(shouldEmbedPython(disabledSection, 'auto'), false);
});

test('mode on/off override detection', () => {
  assert.equal(shouldEmbedPython({ scripts: [] }, 'on'), true);
  assert.equal(shouldEmbedPython({ scripts: [{ language: 'python', source: 'x=1' }] }, 'off'), false);
});
