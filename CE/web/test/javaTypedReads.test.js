// Java's typed reads in the preview (javaTypedReads in panelRuntime.js). In an exported Java handler
// ctx.get returns Object, so these are how a handler reads at a type; CeRuntime.java has the same four,
// and validate-script-exports.mjs compares the two on every kind of value. This pins the conversions
// themselves, which are ce::Var's: a number as itself, a bool as 1 or 0, anything else as 0; text as
// itself, anything else as ""; a bool as itself, anything else as whether its number is non-zero; and
// getInt as Java's (int), toward zero, NaN as 0, held to the int range, never -0.
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';
import { previewContextFor } from '../src/CE_Application/scripting/panelRuntime.js';

const VALUES = {
  'cutoff.value': 42.5, 'label.text': 'Hello', 'led.on': true, 'zero.value': 0,
  'step.value': -3.7, 'neg0.value': -0, 'nan.value': NaN, 'big.value': 1e12, 'negbig.value': -1e12,
};

function readsOf(body) {
  const set = {};
  const forms = [];
  const api = {
    get: (path, ...rest) => { forms.push(rest); return Object.hasOwn(VALUES, path) ? VALUES[path] : null; },
    set: (path, value) => { set[path] = value; },
  };
  const { handlers, diagnostics } = compileJava(`void onValueChanged(CeContext ctx, CeEvent e) {\n${body}\n}`);
  assert.deepEqual(diagnostics, []);
  invokeJava(handlers.get('onValueChanged'), [previewContextFor('java', api), { value: 0.5 }]);
  return { set, forms };
}

test('getDouble: a number as itself, a bool as 1 or 0, anything else as 0', () => {
  const { set } = readsOf(`
    ctx.set("a", ctx.getDouble("cutoff.value")); ctx.set("b", ctx.getDouble("led.on"));
    ctx.set("c", ctx.getDouble("label.text")); ctx.set("d", ctx.getDouble("missing.value"));
    ctx.set("e", ctx.getDouble("neg0.value")); ctx.set("f", ctx.getDouble("nan.value"));`);
  assert.equal(set.a, 42.5);
  assert.equal(set.b, 1);
  assert.equal(set.c, 0);
  assert.equal(set.d, 0);
  assert.ok(Object.is(set.e, -0));
  assert.ok(Number.isNaN(set.f));
});

test('getInt is Java\'s (int): toward zero, NaN as 0, held to the int range, never -0', () => {
  const { set } = readsOf(`
    ctx.set("a", ctx.getInt("step.value")); ctx.set("b", ctx.getInt("big.value")); ctx.set("c", ctx.getInt("negbig.value"));
    ctx.set("d", ctx.getInt("nan.value")); ctx.set("e", ctx.getInt("neg0.value")); ctx.set("f", ctx.getInt("led.on"));`);
  assert.equal(set.a, -3);
  assert.equal(set.b, 2147483647);
  assert.equal(set.c, -2147483648);
  assert.equal(set.d, 0);
  assert.ok(Object.is(set.e, 0));
  assert.equal(set.f, 1);
});

test('getString gives text, and "" for anything else', () => {
  const { set } = readsOf(`
    ctx.set("a", ctx.getString("label.text")); ctx.set("b", ctx.getString("cutoff.value"));
    ctx.set("c", ctx.getString("led.on")); ctx.set("d", ctx.getString("missing.value"));`);
  assert.deepEqual([set.a, set.b, set.c, set.d], ['Hello', '', '', '']);
});

test('getBoolean gives a bool, or whether the number is non-zero', () => {
  const { set } = readsOf(`
    ctx.set("a", ctx.getBoolean("led.on")); ctx.set("b", ctx.getBoolean("cutoff.value")); ctx.set("c", ctx.getBoolean("zero.value"));
    ctx.set("d", ctx.getBoolean("nan.value")); ctx.set("e", ctx.getBoolean("label.text")); ctx.set("f", ctx.getBoolean("missing.value"));`);
  assert.deepEqual([set.a, set.b, set.c, set.d, set.e, set.f], [true, true, false, true, false, false]);
});

// The export passes "value" when no form is given, which the host reads as no form at all; so the
// preview asks with no form rather than passing "value", which the WebView would let override a
// path's .normalizedValue suffix.
test('a typed read without a form asks without one, and passes one it is given', () => {
  const { forms } = readsOf('double a = ctx.getDouble("cutoff.value"); double b = ctx.getDouble("cutoff.value", "normalizedValue");');
  assert.deepEqual(forms, [[], ['normalizedValue']]);
});

test('only Java has them', () => {
  const api = { get: () => 1, set: () => {} };
  assert.equal(typeof previewContextFor('java', api).getDouble, 'function');
  assert.equal(previewContextFor('cpp', api).getDouble, undefined);
  assert.equal(previewContextFor('csharp', api).getDouble, undefined);
});
