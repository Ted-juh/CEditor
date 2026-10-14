// scriptMemoryBudget.test.js — the memory all of a panel's JavaScript sandboxes share.
//
// Its own file because node runs each test file in a process of its own, and this needs a heap no
// other test has grown: everything another test freed is room the hog below could take without
// growing the heap, and growth is what the budget is enforced on (boundedJavascript.js says why).

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoundedJavascript as evaluate, disposeJavascriptSandboxes, initialiseJavascriptSandbox,
  scriptHeapBytesForTesting, setPanelMemoryBudgetForTesting } from '../src/CE_Application/scripting/boundedJavascript.js';
await initialiseJavascriptSandbox();

afterEach(() => { disposeJavascriptSandboxes(); setPanelMemoryBudgetForTesting(); });

// The heap has room to spare, at the start and after a test frees its sandboxes. Hold 4 MB at a time
// until it has to grow: what is left free then is one growth step, smaller than a hog's 14 MB. Then
// set the budget just above it, so the hog's allocation is growth past the budget.
function budgetJustAboveTheHeap() {
  const start = scriptHeapBytesForTesting();
  for (let i = 0; i < 64 && scriptHeapBytesForTesting() === start; i++) evaluate('globalThis.keep = new Uint8Array(4 * 1024 * 1024);', {}, []);
  assert.ok(scriptHeapBytesForTesting() > start, 'the free space filled and the heap grew');
  setPanelMemoryBudgetForTesting(scriptHeapBytesForTesting() + 1024 * 1024);
}
test('a script that grows the shared heap past the panel budget is stopped, and the others carry on', () => {
  const bystander = evaluate('function ok() { return 1; }', {}, ['ok']);
  budgetJustAboveTheHeap();
  // 14 MB, inside its own 16 MB ceiling: it is the budget all scripts share that stops it.
  const hog = evaluate('const keep = []; function grow() { for (let i = 0; i < 14; i++) keep.push(new Uint8Array(1024 * 1024)); }',
    {}, ['grow'], { milliseconds: 2000 });
  assert.throws(hog.grow, /memory limit exceeded/);
  assert.throws(hog.grow, /stopped/);
  assert.equal(bystander.ok(), 1, 'a script that took nothing is not blamed for the heap being large');
  // The heap stays grown, but what the hog held is free inside it: a new script loads into that
  // without growing the heap, so the budget does not turn away everything after one runaway.
  assert.equal(evaluate('function ok() { return 2; }', {}, ['ok']).ok(), 2);
});
test('a script that grows the heap past the budget and then throws is stopped all the same', () => {
  // Leaving by an error of its own must not let it keep the memory and take it again next call.
  budgetJustAboveTheHeap();
  const hog = evaluate('const keep = []; function grow() { for (let i = 0; i < 14; i++) keep.push(new Uint8Array(1024 * 1024)); throw new Error("mine"); }',
    {}, ['grow'], { milliseconds: 2000 });
  assert.throws(hog.grow, /memory limit exceeded/);
  assert.throws(hog.grow, /stopped/);
});

