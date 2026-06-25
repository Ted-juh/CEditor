import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, getFoldRegions, getDefinition, getHover } from '../src/CE_Application/scripting/languageService.js';

const GOOD = `BASE = 10

def helper(x):
    return x * 2

def onValueChanged(info):
    set("out", helper(info.value) + BASE)
`;

test('analyze(python) yields def/class/variable symbols', () => {
  const { symbols } = analyze(GOOD, 'python');
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes('helper'));
  assert.ok(names.includes('onValueChanged'));
  assert.ok(names.includes('BASE'));
  assert.equal(symbols.find((s) => s.name === 'helper').kind, 'function');
  assert.equal(symbols.find((s) => s.name === 'BASE').kind, 'variable');
});

test('clean python has no diagnostics', () => {
  assert.deepEqual(analyze(GOOD, 'python').diagnostics, []);
});

test('analyze(python) flags a missing colon on a block header', () => {
  const bad = `def onClick(info)\n    pass\n`;
  const { diagnostics } = analyze(bad, 'python');
  assert.ok(diagnostics.some((d) => /expected ':'/.test(d.message)));
  assert.equal(diagnostics[0].line, 1);
});

test('analyze(python) flags unbalanced brackets', () => {
  const bad = `def f(info):\n    return foo(bar\n`;
  const { diagnostics } = analyze(bad, 'python');
  assert.ok(diagnostics.some((d) => /unclosed|unmatched/.test(d.message)));
});

test('colons inside dicts/slices/lambdas do not false-positive', () => {
  const ok = `def f(info):\n    d = {1: 2}\n    s = a[1:2]\n    g = lambda x: x\n    if info.value > 0:\n        return d\n`;
  assert.deepEqual(analyze(ok, 'python').diagnostics, []);
});

test('getFoldRegions(python) folds indented blocks', () => {
  const folds = getFoldRegions(GOOD, 'python');
  assert.ok(folds.length >= 2); // helper + onValueChanged bodies
  assert.ok(folds.every((f) => f.endLine > f.startLine));
});

test('getDefinition(python) jumps to a function declaration', () => {
  const idx = GOOD.indexOf('helper(info.value)');
  const def = getDefinition(GOOD, 'python', idx);
  assert.ok(def);
  assert.equal(def.line, 3); // def helper is on line 3
});

test('getHover(python) describes a local function', () => {
  const idx = GOOD.indexOf('helper(info.value)');
  const h = getHover(GOOD, 'python', idx);
  assert.ok(h && /helper/.test(h.title));
});
