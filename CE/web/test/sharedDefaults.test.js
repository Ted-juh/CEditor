// sharedDefaults.test.js — what a loaded panel holds in memory (stores/documentShape.js).
//
// A loaded control is the full control, but the parts of it still at their defaults are the
// defaults themselves: one frozen copy per type, shared by every control built from it. GAIA held
// 25 MB loaded; 11 MB of it was 4,159 Corners sections in 13 distinct forms. These tests pin the
// sharing, the freezing that makes it safe, the writers that have to copy because of it, and the
// one V8 detail that undid it on the first attempt.
//
// The same goes, once a panel is loaded (expandControls), for what its controls change the same
// way: one frozen object for all the controls that have it, which took GAIA from 8.6 MB to 1.6.

import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { expandControl, expandControls, shrinkControl } from '../src/CE_Application/stores/documentShape.js';
import { setNestedValueShared } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { resolveDrawings } from '../src/CE_Application/stores/documentDrawings.js';

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

/** Three buttons loaded together: A and B with the same fill, C with one of its own. */
function threeButtons() {
  const made = ['FF336699', 'FF336699', 'FF993366'].map((colour, i) => {
    const button = createControl('Button');
    button._children.Core.name = `b${i}`;
    button._children.Background._children.Fill.colour = colour;
    return shrinkControl(button);
  });
  return expandControls(made);
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

test('controls loaded together share the sections they change the same way, frozen', () => {
  const [a, b, c] = threeButtons();
  assert.equal(a._children.Background, b._children.Background, 'the same change is one object');
  assert.ok(Object.isFrozen(a._children.Background));
  assert.throws(() => { a._children.Background._children.Fill.colour = 'FF000000'; }, TypeError);
  // A change only one control has is its own, and stays writable as it always was.
  assert.notEqual(c._children.Background, a._children.Background);
  assert.ok(!Object.isFrozen(c._children.Background));
  assert.equal(c._children.Background._children.Fill.colour, 'FF993366');
});

test('a control, and the way from it to its parts and children, is never shared or frozen', () => {
  const panel = open(GAIA);
  const controls = flatControls(panel.controls);
  assert.ok(controls.length > 800);
  for (const control of controls) {
    const name = control._children.Core.name;
    assert.ok(!Object.isFrozen(control) && !Object.isFrozen(control._children), name);
    const { Parts, Children } = control._children;
    if (Parts && Object.keys(Parts._children ?? {}).length) assert.ok(!Object.isFrozen(Parts) && !Object.isFrozen(Parts._children), `${name} Parts`);
    if (Children && Object.keys(Children._children ?? {}).length) assert.ok(!Object.isFrozen(Children) && !Object.isFrozen(Children._children), `${name} Children`);
  }
  assert.equal(new Set(controls).size, controls.length, 'no control is another\'s object');
});

test('two controls equal down to their id are still two controls', () => {
  // A document is not supposed to repeat an id, and a pasted or hand-edited one can. Each control is
  // its own object whatever the document says, because the editor and the player write into it.
  const button = shrinkControl(createControl('Button'));
  const [a, b] = expandControls([button, structuredClone(button)]);
  assert.notEqual(a, b);
  assert.notEqual(a._children, b._children);
  assert.ok(!Object.isFrozen(a) && !Object.isFrozen(a._children));
  assert.equal(a._children.Core, b._children.Core, 'below the control, equal is shared as anywhere');
});

test('a player script\'s write into a section controls share changes its own control only', () => {
  const [a, b] = threeButtons();
  const host = createPlayerHost({ id: 'p', controls: [a, b], scripts: [] });
  assert.equal(host.writeValue(b, 'Background.Fill.colour', 'FF000000'), true);
  assert.equal(b._children.Background._children.Fill.colour, 'FF000000');
  assert.equal(a._children.Background._children.Fill.colour, 'FF336699');
});

test('a loaded GAIA is a sixth of the objects it would be without sharing equal changes', () => {
  // GAIA's 818 controls are a few dozen designs, repeated with their own ids, names and bindings.
  const sparse = () => resolveDrawings(JSON.parse(readText(path.join(REPO, GAIA)))).doc.controls;
  const count = (controls) => [...objectsIn(controls)].length;
  const alone = count(sparse().map(expandControl));
  const together = count(expandControls(sparse()));
  assert.ok(together * 4 < alone, `${together} objects loaded together, ${alone} one control at a time`);
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
  // 25 MB before the defaults were shared, 9.9 MB after, 1.6 MB once equal changes were shared
  // too; the margin is for the collector.
  assert.ok(held < 3e6, `GAIA holds ${(held / 1e6).toFixed(1)} MB loaded`);
  assert.ok(panel.controls.length > 0);
});

test('saving straight after loading writes what it always did', () => {
  // Byte-for-byte what the code before the sharing wrote, which was checked on all eleven panels
  // in the tree; here, that a second save of a loaded panel is the first one exactly.
  const text = readText(path.join(REPO, GAIA));
  const once = serializePanel(deserializePanel(text, GAIA, null));
  assert.equal(serializePanel(deserializePanel(once, GAIA, null)), once);
});

test('a save compares a loaded panel against the very defaults it shares, and a shared drawing once', () => {
  // Saving GAIA took most of a second, autosave included, because every control was compared with
  // a pristine parsed afresh for it and every part with section baselines rebuilt for it. A loaded
  // control's untouched sections ARE the shared defaults, and the parts of one drawing are one
  // frozen object between the controls drawn with it, so neither needs walking twice.
  const panel = open(GAIA);
  const drawn = flatControls(panel.controls).filter((control) => control._children.Core.controlType === 'CustomComponent');
  const byPart = new Map();
  for (const control of drawn) {
    for (const part of Object.values(control._children.Parts?._children ?? {})) {
      if (Object.isFrozen(part)) byPart.set(part, [...(byPart.get(part) ?? []), control]);
    }
  }
  const [sharedPart, holders] = [...byPart].find(([, list]) => list.length > 1) ?? [];
  assert.ok(sharedPart, 'no part is shared between two loaded GAIA controls');
  const formOf = (control) => Object.values(shrinkControl(control)._children.Parts?._children ?? {})
    .find((part) => part?.name === sharedPart.name);
  const first = formOf(holders[0]);
  assert.equal(formOf(holders[1]), first, 'the shared part was diffed again for the second control');
  assert.ok(Object.isFrozen(first), 'a part form two controls are given is not frozen');
  // And the forms read back as what was saved.
  assert.deepEqual(expandControl(shrinkControl(holders[0])), holders[0]);
});
