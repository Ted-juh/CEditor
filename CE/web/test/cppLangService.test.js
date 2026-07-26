import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, getFoldRegions, getDefinition, getHover } from '../src/CE_Application/scripting/languageService.js';

const GOOD = `int helper(int x) { return x * 2; }
void onValueChanged(CeContext& ctx, const CeEvent& event) {
  ctx.setValue("out", helper(event.value));
}`;

test('analyze(cpp) reports a syntax error with a line', () => {
  const bad = `void onClick(CeContext& ctx, const CeEvent& event) {
  int x = ;
}`;
  const { diagnostics } = analyze(bad, 'cpp');
  assert.ok(diagnostics.length >= 1);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(typeof diagnostics[0].line, 'number');
});

test('analyze(cpp) yields function symbols', () => {
  const { symbols } = analyze(GOOD, 'cpp');
  const fns = symbols.filter((s) => s.kind === 'function').map((s) => s.name);
  assert.ok(fns.includes('helper'));
  assert.ok(fns.includes('onValueChanged'));
});

test('clean cpp source has no diagnostics', () => {
  assert.deepEqual(analyze(GOOD, 'cpp').diagnostics, []);
});

test('getFoldRegions(cpp) folds brace blocks', () => {
  const folds = getFoldRegions(GOOD, 'cpp');
  assert.ok(folds.length >= 1);
  assert.ok(folds.every((f) => f.endLine > f.startLine));
});

test('getDefinition(cpp) jumps to a function declaration', () => {
  const idx = GOOD.indexOf('helper(event.value)');
  const def = getDefinition(GOOD, 'cpp', idx);
  assert.ok(def);
  assert.equal(def.line, 1); // helper is declared on line 1
});

test('getHover(cpp) describes a known struct/type', () => {
  const src = `struct Point { double x; double y; };
void onClick(CeContext& ctx, const CeEvent& event) { Point p; }`;
  const idx = src.indexOf('Point p') ;
  const h = getHover(src, 'cpp', idx);
  assert.ok(h && /Point/.test(h.title));
});
