import test from 'node:test';
import assert from 'node:assert/strict';

import { computeHidden, projectFolds, pruneFolds } from '../src/CE_Application/editor/foldModel.js';
import { getFoldRegions } from '../src/CE_Application/scripting/languageService.js';

const regions = [{ startLine: 1, endLine: 4 }, { startLine: 6, endLine: 8 }];

test('computeHidden hides body lines, keeps headers', () => {
  const { hidden, activeStarts } = computeHidden(new Set([1]), regions);
  assert.deepEqual([...hidden].sort((a, b) => a - b), [2, 3, 4]);
  assert.deepEqual([...activeStarts], [1]);
});

test('projectFolds removes hidden lines and marks the header', () => {
  const src = 'function f()\n  a()\n  b()\nend\nx = 1\nfunction g()\n  c()\nend';
  const { text, displayToFull } = projectFolds(src, new Set([1]), regions, ' …');
  const out = text.split('\n');
  assert.equal(out[0], 'function f() …');     // header marked
  assert.equal(out[1], 'x = 1');               // body 2-4 hidden, line 5 shown next
  assert.deepEqual(displayToFull, [1, 5, 6, 7, 8]);
});

test('projectFolds with nothing folded is the identity', () => {
  const src = 'a\nb\nc';
  const { text, displayToFull } = projectFolds(src, new Set(), regions);
  assert.equal(text, src);
  assert.deepEqual(displayToFull, [1, 2, 3]);
});

test('two folds collapse independently', () => {
  const src = Array.from({ length: 8 }, (_, i) => `L${i + 1}`).join('\n');
  const { displayToFull } = projectFolds(src, new Set([1, 6]), regions);
  // lines 2-4 and 7-8 hidden → visible: 1,5,6
  assert.deepEqual(displayToFull, [1, 5, 6]);
});

test('pruneFolds drops start-lines no longer foldable', () => {
  const next = pruneFolds(new Set([1, 6, 99]), regions);
  assert.deepEqual([...next].sort((a, b) => a - b), [1, 6]);
});

test('getFoldRegions finds JS function/block spans', () => {
  const src = 'function add(a, b) {\n  const s = a + b;\n  return s;\n}';
  const regs = getFoldRegions(src, 'javascript');
  assert.ok(regs.length >= 1);
  assert.equal(regs[0].startLine, 1);
  assert.equal(regs[0].endLine, 4);
});

test('getFoldRegions finds Lua block spans and ignores single-line', () => {
  const src = 'local function f(x)\n  if x then\n    return 1\n  end\nend\nlocal y = 2';
  const regs = getFoldRegions(src, 'lua');
  const starts = regs.map((r) => r.startLine);
  assert.ok(starts.includes(1));       // the function
  assert.ok(starts.includes(2));       // the if-block
  assert.ok(regs.every((r) => r.endLine > r.startLine));
});

test('getFoldRegions returns [] on unparseable source', () => {
  assert.deepEqual(getFoldRegions('function f( {', 'javascript'), []);
  assert.deepEqual(getFoldRegions('x = 1', 'python'), []);
});
