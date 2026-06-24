import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyze, getCompletions, getHover, getDefinition, getSignatureHelp, wordAt, languageKey,
} from '../src/CE_Application/scripting/languageService.js';

/* ------------------------------------------------------------- diagnostics */

test('analyze reports JS syntax errors with a location', () => {
  const { diagnostics } = analyze('function f( {', 'javascript');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].line, 1);
  assert.ok(typeof diagnostics[0].index === 'number');
  assert.ok(!/\(\d+:\d+\)/.test(diagnostics[0].message), 'message should be cleaned of the (l:c) suffix');
});

test('analyze reports Lua syntax errors with a location', () => {
  const { diagnostics } = analyze('function f( end', 'lua');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, 'error');
  assert.ok(diagnostics[0].line >= 1);
  assert.ok(!/^\[\d+:\d+\]/.test(diagnostics[0].message), 'message should be cleaned of the [l:c] prefix');
});

test('analyze does not parse Python as Lua (no bogus diagnostics)', () => {
  const py = 'def on_value(v):\n    set("a", v)';
  const { diagnostics, symbols } = analyze(py, 'python');
  assert.equal(diagnostics.length, 0);
  assert.equal(symbols.length, 0);
});

test('analyze returns no diagnostics for valid source', () => {
  assert.equal(analyze('function onValueChanged(v)\n  set("a", v)\nend', 'lua').diagnostics.length, 0);
  assert.equal(analyze('function onValueChanged(v) { set("a", v) }', 'javascript').diagnostics.length, 0);
});

/* ----------------------------------------------------------------- symbols */

test('analyze extracts JS functions, params, and variables', () => {
  const { symbols } = analyze('function add(a, b) {\n  var sum = a + b;\n  return sum;\n}', 'javascript');
  const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));
  assert.equal(byName.add.kind, 'function');
  assert.equal(byName.add.detail, 'function add(a, b)');
  assert.equal(byName.a.kind, 'parameter');
  assert.equal(byName.sum.kind, 'variable');
});

test('analyze extracts Lua functions, params, and locals', () => {
  const { symbols } = analyze('local function scaleIt(x)\n  local y = x * 2\n  return y\nend', 'lua');
  const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));
  assert.equal(byName.scaleIt.kind, 'function');
  assert.equal(byName.scaleIt.detail, 'function scaleIt(x)');
  assert.equal(byName.x.kind, 'parameter');
  assert.equal(byName.y.kind, 'variable');
});

test('analyze falls back to last good symbols while mid-edit', () => {
  analyze('local function good(z) return z end', 'lua');         // seeds last-good
  const { symbols, diagnostics } = analyze('local function good(z) retur', 'lua'); // broken
  assert.ok(diagnostics.length >= 1);
  assert.ok(symbols.some((s) => s.name === 'good'), 'stale symbols still offered');
});

/* ------------------------------------------------------------- completions */

test('getCompletions offers panel API + keywords filtered by prefix', () => {
  const src = 'se';
  const { from, to, options } = getCompletions(src, 'lua', 2);
  assert.equal(from, 0);
  assert.equal(to, 2);
  const labels = options.map((o) => o.label);
  assert.ok(labels.includes('set'), 'API function set() suggested');
  assert.ok(labels.includes('sendCC'), 'API function sendCC() suggested');
  assert.ok(options.every((o) => o.label.toLowerCase().includes('se')));
});

test('getCompletions includes document symbols', () => {
  const src = 'local function cutoffFollow(v) end\ncut';
  const caret = src.length;
  const { options } = getCompletions(src, 'lua', caret);
  assert.ok(options.some((o) => o.label === 'cutoffFollow' && o.kind === 'function'));
});

test('getCompletions after a dot offers value accessors', () => {
  const src = 'x.';
  const { options } = getCompletions(src, 'lua', 2);
  const labels = options.map((o) => o.label);
  assert.ok(labels.includes('value'));
  assert.ok(labels.includes('normalizedValue'));
  assert.ok(labels.includes('midiValue'));
});

/* ------------------------------------------------------------------- hover */

test('getHover describes panel API functions', () => {
  const src = 'sendCC(1, 74, 100)';
  const h = getHover(src, 'lua', 2); // inside "sendCC"
  assert.ok(h);
  assert.match(h.title, /sendCC/);
  assert.match(h.doc, /CC/);
});

test('getHover describes a local declaration', () => {
  const src = 'function add(a, b)\n  return a + b\nend';
  const h = getHover(src, 'lua', 10); // inside "add"
  assert.ok(h);
  assert.match(h.title, /function add\(a, b\)/);
});

test('getHover returns null for unknown words', () => {
  assert.equal(getHover('zzz unknownThing', 'lua', 5), null);
});

/* -------------------------------------------------------------- definition */

test('getDefinition jumps to a function declaration', () => {
  const src = 'local function helper(x)\n  return x\nend\nhelper(3)';
  const useIndex = src.lastIndexOf('helper'); // the call site
  const def = getDefinition(src, 'lua', useIndex + 1);
  assert.ok(def);
  assert.equal(def.index, src.indexOf('helper')); // the declaration offset
});

test('getDefinition returns null for API / unknown names', () => {
  assert.equal(getDefinition('set("a", 1)', 'lua', 1), null);
});

/* ----------------------------------------------------------- signature help */

test('getSignatureHelp resolves a panel API call and the active argument', () => {
  const s0 = getSignatureHelp('sendCC(', 'lua', 7);
  assert.ok(s0);
  assert.equal(s0.name, 'sendCC');
  assert.deepEqual(s0.params, ['channel', 'cc', 'value']);
  assert.equal(s0.activeParam, 0);

  const s2 = getSignatureHelp('sendCC(1, 74, ', 'lua', 14);
  assert.equal(s2.activeParam, 2);
});

test('getSignatureHelp works for helpers (params parsed from signature)', () => {
  const s = getSignatureHelp('scale(x, ', 'lua', 9);
  assert.equal(s.name, 'scale');
  assert.deepEqual(s.params, ['v', 'inLo', 'inHi', 'outLo', 'outHi']);
  assert.equal(s.activeParam, 1);
});

test('getSignatureHelp resolves a document function', () => {
  const src = 'local function add(a, b)\n  return a + b\nend\nadd(1, ';
  const s = getSignatureHelp(src, 'lua', src.length);
  assert.ok(s);
  assert.equal(s.name, 'add');
  assert.deepEqual(s.params, ['a', 'b']);
  assert.equal(s.activeParam, 1);
});

test('getSignatureHelp returns null outside any call', () => {
  assert.equal(getSignatureHelp('local x = 1', 'lua', 11), null);
  assert.equal(getSignatureHelp('set("a", 1);\n', 'lua', 13), null);
});

/* --------------------------------------------------------------- misc */

test('wordAt finds the identifier under an index', () => {
  assert.deepEqual(wordAt('foo bar', 1), { word: 'foo', start: 0, end: 3 });
  assert.equal(wordAt('   ', 1), null);
});

test('languageKey normalizes to lua for non-js', () => {
  assert.equal(languageKey('javascript'), 'javascript');
  assert.equal(languageKey('python'), 'lua');
});
