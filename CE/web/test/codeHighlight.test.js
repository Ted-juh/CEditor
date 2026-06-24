import test from 'node:test';
import assert from 'node:assert/strict';

import { highlight, lineCommentToken, languageKey } from '../src/CE_Application/editor/codeHighlight.js';

test('languageKey maps javascript to itself and everything else to lua', () => {
  assert.equal(languageKey('javascript'), 'javascript');
  assert.equal(languageKey('lua'), 'lua');
  assert.equal(languageKey('python'), 'lua');
  assert.equal(languageKey(undefined), 'lua');
});

test('lineCommentToken is language-aware', () => {
  assert.equal(lineCommentToken('javascript'), '//');
  assert.equal(lineCommentToken('lua'), '--');
});

test('highlight escapes all HTML metacharacters in plain text and strings', () => {
  const out = highlight('a < b && c > d', 'javascript');
  assert.ok(!out.includes('<b'), 'raw < must be escaped');
  assert.ok(out.includes('&lt;') && out.includes('&gt;') && out.includes('&amp;'));
  // angle brackets inside a string literal are escaped too
  const str = highlight('x = "<tag>"', 'javascript');
  assert.ok(str.includes('&lt;tag&gt;'));
});

test('highlight classifies JavaScript keywords, strings, numbers and comments', () => {
  const out = highlight('// note\nconst n = 42;', 'javascript');
  assert.ok(out.includes('<span class="tok-com">// note</span>'));
  assert.ok(out.includes('<span class="tok-kw">const</span>'));
  assert.ok(out.includes('<span class="tok-num">42</span>'));
});

test('highlight classifies Lua keywords, literals and comments distinctly', () => {
  const out = highlight('-- c\nlocal ok = true', 'lua');
  assert.ok(out.includes('<span class="tok-com">-- c</span>'));
  assert.ok(out.includes('<span class="tok-kw">local</span>'));
  assert.ok(out.includes('<span class="tok-lit">true</span>'));
});

test('group-2 differs per language: JS block comment vs Lua long string', () => {
  assert.ok(highlight('/* blk */', 'javascript').includes('tok-com'));
  // Lua [[ ]] is a string, not a comment
  const lua = highlight('s = [[long]]', 'lua');
  assert.ok(lua.includes('<span class="tok-str">[[long]]</span>'));
});

test('highlight returns empty string for empty input and never throws on odd input', () => {
  assert.equal(highlight('', 'javascript'), '');
  assert.equal(highlight(null, 'lua'), '');
  // unterminated string should still be tokenized without error
  assert.doesNotThrow(() => highlight('x = "open', 'javascript'));
});
