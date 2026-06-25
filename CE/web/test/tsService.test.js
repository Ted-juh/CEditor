import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTs, transpileTs, analyzeTs, foldTs } from '../src/CE_Application/scripting/tsService.js';

const TS = `const BASE: number = 10;
function helper(x: number): number { return x * 2; }
function onValueChanged(info: { value: number }): void {
  let y: number = helper(info.value) as number;
  set("out", y + BASE);
}`;

test('transpileTs strips types to runnable JS (after the compiler loads)', async () => {
  await ensureTs();
  const js = transpileTs(TS);
  assert.ok(js && !/:\s*number/.test(js));     // type annotations gone
  assert.ok(/function helper/.test(js));
  assert.ok(!/as number/.test(js));            // `as` assertion gone
});

test('analyzeTs yields function/variable symbols', async () => {
  await ensureTs();
  const { symbols } = analyzeTs(TS);
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes('helper'));
  assert.ok(names.includes('onValueChanged'));
  assert.ok(names.includes('BASE'));
});

test('clean TypeScript has no diagnostics', async () => {
  await ensureTs();
  assert.deepEqual(analyzeTs(TS).diagnostics, []);
});

test('analyzeTs reports a syntax error with a line', async () => {
  await ensureTs();
  const bad = `function onClick(info): void {\n  let x: number = ;\n}`;
  const { diagnostics } = analyzeTs(bad);
  assert.ok(diagnostics.length >= 1);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].line, 2);
});

test('foldTs folds brace blocks (and ignores braces in strings/templates)', () => {
  const src = 'function f() {\n  const s = "a { b }";\n  const t = `x ${1} y`;\n  return 1;\n}';
  const folds = foldTs(src);
  assert.equal(folds.length, 1);
  assert.equal(folds[0].startLine, 1);
  assert.equal(folds[0].endLine, 5);
});

test('symbol fallback works before the compiler is loaded (regex scan)', () => {
  // analyzeTs is synchronous; before ensureTs resolves it still surfaces symbols via regex.
  const { symbols } = analyzeTs('function quickLook(a) { return a; }');
  assert.ok(symbols.some((s) => s.name === 'quickLook'));
});
