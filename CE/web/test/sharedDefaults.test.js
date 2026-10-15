// sharedDefaults.test.js — what a loaded panel holds in memory (stores/documentShape.js).
//
// A loaded control is the full control, but the parts of it still at their defaults are the
// defaults themselves: one frozen copy per type, shared by every control built from it. GAIA held
// 25 MB loaded; 11 MB of it was 4,159 Corners sections in 13 distinct forms. These tests pin the
// sharing, the freezing that makes it safe, the writers that have to copy because of it, and the
// one V8 detail that undid it on the first attempt.

import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { expandControl, shrinkControl } from '../src/CE_Application/stores/documentShape.js';
import { setNestedValueShared } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';
const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);

/** Two buttons as a document stores them and the editor loads them: A with a coloured fill. */
function twoButtons() {
  const a = createControl('Button');
  a._children.Background._children.Fill.colour = 'FF336699';
  const b = createControl('Button');
  return [expandControl(shrinkControl(a)), expandControl(shrinkControl(b))];
}

function* objectsIn(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  yield value;
  for (const child of Object.values(value)) yield* objectsIn(child, seen);
}

test('two controls of a type share the sections they leave at their defaults, frozen', () => {
  const [a, b] = twoButtons();
  for (const section of ['Behavior', 'States', 'Effects']) {
    assert.equal(a._children[section], b._children[section], `${section} is one object for both`);
    assert.ok(Object.isFrozen(a._children[section]), `${section} is frozen`);
  }
});

test('what a document changes is the control\'s own, and so is the way down to it', () => {
  const [a, b] = twoButtons();
  assert.equal(a._children.Background._children.Fill.colour, 'FF336699');
  assert.notEqual(b._children.Background._children.Fill.colour, 'FF336699');
  assert.notEqual(a._children.Background, b._children.Background, 'the changed section is A\'s own');
  assert.ok(!Object.isFrozen(a._children.Background._children.Fill));
  // ...while what sits beside the change is still shared.
  assert.equal(a._children.Background._children.Corners, b._children.Background._children.Corners);
});

test('writing into a shared default throws instead of repainting every control of the type', () => {
  const [a, b] = twoButtons();
  assert.throws(() => { a._children.Behavior.defaultCurrentValue = 99; }, TypeError);
  assert.notEqual(b._children.Behavior.defaultCurrentValue, 99);
});

test('the editor\'s write path copies what it walks, so one control changes and the other does not', () => {
  const [a, b] = twoButtons();
  const { control } = setNestedValueShared(b, 'Behavior.defaultCurrentValue', 42);
  assert.equal(control._children.Behavior.defaultCurrentValue, 42);
  assert.notEqual(a._children.Behavior.defaultCurrentValue, 42);
  assert.notEqual(b._children.Behavior.defaultCurrentValue, 42, 'the original is left as it was, for undo');
});

test('a player script\'s write changes its own control only', () => {
  const [a, b] = twoButtons();
  a._children.Core.name = 'a';
  b._children.Core.name = 'b';
  const before = b._children.Background._children.Corners.radius;
  const host = createPlayerHost({ id: 'p', controls: [a, b], scripts: [] });
  assert.equal(host.writeValue(b, 'Background.Corners.radius', before + 7), true);
  assert.equal(b._children.Background._children.Corners.radius, before + 7);
  assert.equal(a._children.Background._children.Corners.radius, before, 'A shared that Corners and keeps it');
  const [, fresh] = twoButtons();
  assert.equal(fresh._children.Background._children.Corners.radius, before, 'and so does the next button loaded');
});

test('deepClone copies two references to one object as two objects, so a draft can write anywhere', () => {
  const shared = { radius: 1 };
  const clone = deepClone({ first: shared, second: shared });
  assert.notEqual(clone.first, clone.second);
  clone.first.radius = 5;
  assert.equal(clone.second.radius, 1);
  const [, b] = twoButtons();
  const draft = deepClone(b);
  assert.ok(!Object.isFrozen(draft._children.Behavior), 'a draft is the control\'s own to write into');
});

test('deepClone still copies what is not plain data the old way', () => {
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  const clone = deepClone(cyclic);
  assert.equal(clone.self, clone, 'a cycle is kept, as structuredClone keeps it');
  const when = new Date(0);
  assert.equal(deepClone({ when }).when.getTime(), 0);
});

test('every object of a loaded GAIA keeps V8\'s compact layout', () => {
  // Built one key at a time through a computed key, an object of more than a dozen keys becomes a
  // hash table in V8, about three times the size: the first version of the sharing doubled what
  // GAIA held that way. expand() copies objects that already have their keys instead.
  v8.setFlagsFromString('--allow-natives-syntax');
  const hasFastProperties = new Function('o', 'return %HasFastProperties(o)');
  const panel = open(GAIA);
  const slow = [];
  for (const object of objectsIn(panel.controls)) {
    if (!Array.isArray(object) && !hasFastProperties(object)) slow.push(Object.keys(object).slice(0, 4).join(','));
  }
  assert.deepEqual(slow.slice(0, 5), [], `${slow.length} objects are hash tables`);
});

test('a loaded GAIA holds a fraction of what it did', () => {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  const text = readText(path.join(REPO, GAIA));
  gc(); gc();
  const before = process.memoryUsage().heapUsed;
  const panel = deserializePanel(text, GAIA, null);
  gc(); gc();
  const held = process.memoryUsage().heapUsed - before;
  // 25 MB before the defaults were shared, 9.9 MB after; the margin is for the collector.
  assert.ok(held < 16e6, `GAIA holds ${(held / 1e6).toFixed(1)} MB loaded`);
  assert.ok(panel.controls.length > 0);
});

test('saving straight after loading writes what it always did', () => {
  // Byte-for-byte what the code before the sharing wrote, which was checked on all eleven panels
  // in the tree; here, that a second save of a loaded panel is the first one exactly.
  const text = readText(path.join(REPO, GAIA));
  const once = serializePanel(deserializePanel(text, GAIA, null));
  assert.equal(serializePanel(deserializePanel(once, GAIA, null)), once);
});
