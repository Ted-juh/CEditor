import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCustomLinks } from '../src/CE_Application/utils/customComponentInteraction.js';

// Build a control whose single condition-type link writes `trueValue`/`falseValue`
// to `out` based on the link expression. This exercises the compound condition
// evaluator (conditionMatches) through the public applyCustomLinks API.
function makeControl(expression) {
  return {
    _children: {
      Core: { id: 'c1' },
      ValueChannels: { _children: {} },
      Links: {
        enabled: true,
        _children: {
          L: { enabled: true, type: 'condition', target: 'out', expression, trueValue: 'T', falseValue: 'F' },
        },
      },
    },
  };
}

function evalExpr(expression, values) {
  return applyCustomLinks(makeControl(expression), { ...values, out: '' }).values.out;
}

test('AND condition requires every clause to match', () => {
  assert.equal(evalExpr("a == 1 && b == 2", { a: 1, b: 2 }), 'T');
  assert.equal(evalExpr("a == 1 && b == 2", { a: 1, b: 9 }), 'F');
  assert.equal(evalExpr("a == 1 && b == 2", { a: 9, b: 2 }), 'F');
});

test('OR condition matches when any clause matches', () => {
  assert.equal(evalExpr("a == 1 || b == 2", { a: 9, b: 2 }), 'T');
  assert.equal(evalExpr("a == 1 || b == 2", { a: 1, b: 9 }), 'T');
  assert.equal(evalExpr("a == 1 || b == 2", { a: 9, b: 9 }), 'F');
});

test('OR has lower precedence than AND', () => {
  // a || (b && c)
  assert.equal(evalExpr("a == 1 || b == 1 && c == 1", { a: 1, b: 0, c: 0 }), 'T');
  assert.equal(evalExpr("a == 1 || b == 1 && c == 1", { a: 0, b: 1, c: 1 }), 'T');
  assert.equal(evalExpr("a == 1 || b == 1 && c == 1", { a: 0, b: 1, c: 0 }), 'F');
});

test('legacy single comparisons and quoting still work', () => {
  assert.equal(evalExpr("mode == 'A'", { mode: 'A' }), 'T');
  assert.equal(evalExpr("mode == 'A'", { mode: 'B' }), 'F');
  assert.equal(evalExpr("level >= 3", { level: 5 }), 'T');
  assert.equal(evalExpr("level >= 3", { level: 1 }), 'F');
});

test('empty condition always matches', () => {
  assert.equal(evalExpr('', { a: 0 }), 'T');
});
