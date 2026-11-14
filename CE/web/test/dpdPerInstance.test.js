// The Designer's per-instance values (editor/dpd/perInstance.js): an instance's own name or default
// is kept in the parameter's perInstance arrays, reaches that instance alone through the resolver,
// and an instance set back to the block's value leaves the model as it was.
import assert from 'node:assert/strict';
import test from 'node:test';
import { hasOwn, setInstanceValue } from '../src/CE_Application/editor/dpd/perInstance.js';
import { resolveParams } from '../src/CE_Application/generated/dpd/resolve.mjs';

const where = { count: 3, first: 36 };
const keyParam = () => ({ id: 'level', name: 'Key {n} Level', valueType: 'continuous', range: { min: 0, max: 127 }, default: 100, wires: [{ dir: 'write', msg: 'cc', cc: 7 }] });
const names = (param) => resolveParams({ scopes: { key: { instances: 3, first: 36, idTemplate: 'key{n}.{id}', parameters: [param] } } }).map((r) => [r.name, r.default]);

test('an instance\'s own name and default reach it alone', () => {
  const p = keyParam();
  setInstanceValue(p, 'name', 1, where, 'Snare Level');
  setInstanceValue(p, 'default', 2, where, 64);
  assert.deepEqual(p.perInstance, { name: ['Key {n} Level', 'Snare Level', 'Key {n} Level'], default: [100, 100, 64] });
  assert.deepEqual(names(p), [['Key 36 Level', 100], ['Snare Level', 100], ['Key 38 Level', 64]]);
  assert.equal(hasOwn(p, 'name', 1, 36), true);
  assert.equal(hasOwn(p, 'name', 0, 36), false);
  assert.equal(hasOwn(p, 'default', 2, 36), true);
});

test('set back to the block\'s value, the model is as it was', () => {
  const p = keyParam();
  setInstanceValue(p, 'name', 1, where, 'Snare Level');
  setInstanceValue(p, 'default', 0, where, 64);
  setInstanceValue(p, 'name', 1, where, 'Key 37 Level'); // the block's name, filled for key 37
  setInstanceValue(p, 'default', 0, where, null); // emptied
  assert.deepEqual(p, keyParam());
});

test('values of its own from the converter are kept beside an edit', () => {
  const p = { ...keyParam(), perInstance: { wires: [[{ dir: 'write', msg: 'cc', cc: 7 }], [{ dir: 'write', msg: 'cc', cc: 9 }], [{ dir: 'write', msg: 'cc', cc: 12 }]] } };
  setInstanceValue(p, 'name', 0, where, 'Kick Level');
  setInstanceValue(p, 'name', 0, where, null);
  assert.deepEqual(Object.keys(p.perInstance), ['wires']);
  // A parameter with no default: the instances without one of their own carry null, as the converter writes it.
  const q = { ...keyParam(), default: undefined };
  setInstanceValue(q, 'default', 1, where, 5);
  assert.deepEqual(q.perInstance.default, [null, 5, null]);
});
