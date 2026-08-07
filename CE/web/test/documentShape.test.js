// documentShape.test.js — the document is a diff; this is the proof it is a lossless one.
//
// createControl() materializes every section a type declares, at its defaults, and that is the
// right in-memory model — everything that reads a control reads deep paths off it. It was also
// what got written to disk, so an untouched Knob cost 100 KB and a 162-control synth editor came
// to 28 MB. Documents now store each control as a diff against the pristine control of its type,
// and deserializePanel applies the diff back.
//
// Which means the whole change rests on ONE property, and nearly every test here is a restatement
// of it with a different edit in the middle:
//
//     expandControl(shrinkControl(c))  deep-equals  c
//
// If that holds for every component type and every edit anyone can make, the file being smaller is
// a free consequence. If it does not hold, the size does not matter, because the panel is wrong.
//
// The failure mode worth naming, because it is the one a size-based test would miss entirely: a
// missing key means two things — "unchanged, take the default" and "the author deleted it". A diff
// that cannot tell them apart resurrects deleted states and layers on the next load, silently, on
// a panel that had been working. `_removed` exists for that, and it is tested harder than the rest.

import test from 'node:test';
import assert from 'node:assert/strict';

import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import {
  expandControl, NEVER_ELIDED_TYPES, REMOVED_KEY, shrinkControl,
} from '../src/CE_Application/stores/documentShape.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Deep equality that ignores key order, and says where it first differs. */
function difference(left, right, path = '$') {
  if (left === right) return null;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return left === right ? null : `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return `${path}: array vs object`;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (!Object.hasOwn(left, key)) return `${path}.${key}: appeared out of nowhere`;
    if (!Object.hasOwn(right, key)) return `${path}.${key}: lost`;
    const problem = difference(left[key], right[key], `${path}.${key}`);
    if (problem) return problem;
  }
  return null;
}

/** Through the real save/load path, not just shrink/expand — the wiring is part of the contract. */
function roundTrip(...controls) {
  const panel = createPanel('round-trip');
  panel.controls = controls;
  const json = serializePanel(panel);
  return { json, document: JSON.parse(json), loaded: deserializePanel(json, null, 'round-trip').controls };
}

const assertSurvives = (control, note) => {
  const { loaded } = roundTrip(control);
  assert.equal(difference(control, loaded[0]), null, `${note} — ${difference(control, loaded[0])}`);
};

/* ------------------------------------------------------------------ the one property */

test('every component type survives a save/load round-trip unchanged', () => {
  // The load-bearing test. 49 types, each at its authored defaults, each compared field by field
  // against what the editor had before it was written down.
  const broken = [];
  for (const type of Object.keys(COMPONENT_TYPES)) {
    const control = createControl(type, { Core: { id: `rt_${type}` } });
    const { loaded } = roundTrip(control);
    const problem = difference(control, loaded[0]);
    if (problem) broken.push(`${type}: ${problem}`);
  }
  assert.deepEqual(broken, [], `types that did not survive being written down:\n  ${broken.join('\n  ')}`);
});

test('shrink and expand are inverses without going near a file', () => {
  for (const type of Object.keys(COMPONENT_TYPES)) {
    const control = createControl(type, { Core: { id: `pair_${type}` } });
    assert.equal(difference(control, expandControl(shrinkControl(control))), null, `${type} did not survive shrink/expand`);
  }
});

/* ------------------------------------------------------------------ removals */

test('a deleted state stays deleted', () => {
  // The bug this prevents: Hover comes back on the next load, on a panel that had been working,
  // with nothing to suggest the file was involved.
  const button = createControl('ToggleButton', { Core: { id: 'del_state' } });
  delete button._children.States._children.Hover;

  const { document, loaded } = roundTrip(button);
  assert.deepEqual(document.controls[0]._children.States._children[REMOVED_KEY], ['Hover'],
    'the removal has to be recorded — "absent" on its own means "unchanged"');
  assert.ok(!('Hover' in loaded[0]._children.States._children), 'Hover came back from the dead');
  assert.equal(difference(button, loaded[0]), null);
});

test('a deleted section stays deleted', () => {
  const button = createControl('Button', { Core: { id: 'del_section' } });
  delete button._children.Icon;

  const { loaded } = roundTrip(button);
  assert.ok(!('Icon' in loaded[0]._children), 'a removed section reappeared');
  assert.equal(difference(button, loaded[0]), null);
});

test('a deleted slider part stays deleted', () => {
  const knob = createControl('Knob', { Core: { id: 'del_part' } });
  delete knob._children.Parts._children.tickMinor;

  const { loaded } = roundTrip(knob);
  assert.ok(!('tickMinor' in loaded[0]._children.Parts._children));
  assert.equal(difference(knob, loaded[0]), null);
});

test('deleting everything in a section is not the same as leaving it alone', () => {
  const button = createControl('ToggleButton', { Core: { id: 'del_all' } });
  button._children.States._children = {};

  const { loaded } = roundTrip(button);
  assert.deepEqual(loaded[0]._children.States._children, {}, 'an emptied section refilled itself');
});

/* ------------------------------------------------------------------ edits */

test('a single deep field is stored as a single deep field', () => {
  const knob = createControl('Knob', { Core: { id: 'deep' } });
  knob._children.Parts._children.labelTitle._children.Text.content = 'CUTOFF';

  const { document, loaded } = roundTrip(knob);
  assert.deepEqual(document.controls[0]._children.Parts,
    { _children: { labelTitle: { _children: { Text: { content: 'CUTOFF' } } } } },
    'one edited label should not drag the other sixteen parts onto disk');
  assert.equal(difference(knob, loaded[0]), null);
});

test('arrays are stored whole, and shortening one works', () => {
  // Row lists, layer orders and gradient stops are edited as units. An element-wise patch of them
  // would be unreadable in a diff and wrong the moment something was inserted rather than changed.
  const combobox = createControl('Combobox', { Core: { id: 'rows' } });
  combobox._children.Value.rows = combobox._children.Value.rows.slice(0, 1);

  const { loaded } = roundTrip(combobox);
  assert.equal(loaded[0]._children.Value.rows.length, 1, 'a shortened array grew its old elements back');
  assert.equal(difference(combobox, loaded[0]), null);
});

test('setting a field to a falsy value is an edit, not an absence', () => {
  // 0, '' and false are the values a "store it only if truthy" bug loses, and they are also the
  // values people actually set: opacity 0, an emptied label, a switch turned off.
  const label = createControl('Label', { Core: { id: 'falsy' } });
  label._children.Transform.opacity = 0;
  label._children.Transform.rotation = 0;   // already the default — should NOT be stored
  label._children.Text.content = '';
  label._children.Background._children.Border.enabled = false;

  const { document, loaded } = roundTrip(label);
  assert.equal(loaded[0]._children.Transform.opacity, 0);
  assert.equal(loaded[0]._children.Text.content, '');
  assert.equal(loaded[0]._children.Background._children.Border.enabled, false);
  assert.ok(!('rotation' in (document.controls[0]._children.Transform ?? {})),
    'a field set back to its default should stop being stored');
});

test('identity is never elided', () => {
  // expandControl looks the pristine up by controlType, and everything else addresses a control by
  // id. Neither can be reconstructed from anything.
  for (const type of ['Knob', 'Label', 'Container']) {
    const { document } = roundTrip(createControl(type, { Core: { id: `id_${type}` } }));
    const core = document.controls[0]._children.Core;
    assert.equal(core.id, `id_${type}`);
    assert.equal(core.controlType, type);
  }
});

/* ------------------------------------------------------------------ nesting */

test('controls nested three deep are shrunk and restored', () => {
  // A Container's pristine has an empty child map, so without recursing into children every
  // nested control would be stored whole and a container-based panel would save nothing.
  const outer = createControl('Container', { Core: { id: 'outer' } });
  const middle = createControl('Container', { Core: { id: 'middle' } });
  const inner = createControl('Knob', { Core: { id: 'inner' } });
  inner._children.Transform.x = 42;
  middle._children.Children._children = { inner };
  outer._children.Children._children = { middle };

  const { document, loaded } = roundTrip(outer);
  const storedInner = document.controls[0]._children.Children._children.middle._children.Children._children.inner;
  assert.ok(!('Parts' in storedInner._children), 'the nested knob still wrote its default parts');
  assert.equal(difference(outer, loaded[0]), null);
  assert.equal(loaded[0]._children.Children._children.middle._children.Children._children.inner._children.Transform.x, 42);
});

/* ------------------------------------------------------------------ what is left alone */

test('a custom component keeps everything authored and drops the boilerplate', () => {
  // This test used to assert the opposite — that CustomComponent was held out of the diff on the
  // grounds that diffing it "would save nothing". That was measurably false: a custom component
  // carries the same defaulted Background, Effects, Mouse, States and Animations every control
  // does, and Background alone is 4.8 KB. The GAIA panel, which is 370 hand-drawn controls, was
  // 45 MB. So the rule is gone, and what replaces it is this: the authored halves survive whole.
  assert.equal(NEVER_ELIDED_TYPES.size, 0);

  const custom = createControl('CustomComponent', { Core: { id: 'cc' } });
  custom._children.Parts = {
    _type: 'Parts',
    _children: {
      body: createPartNode('body', { layout: { x: 3, y: 4 }, sections: { Background: clone(SECTION_DEFAULTS.Background) } }),
      // A part left entirely at its defaults, which is the case that cannot be stored as "nothing"
      // — "no keys" and "no Background at all" are different states of a part.
      plain: createPartNode('plain', { sections: { Background: clone(SECTION_DEFAULTS.Background) } }),
    },
  };
  custom._children.Parts._children.body._children.Background._children.Fill.colour = 'FF102030';
  custom._children.ValueChannels = { _type: 'ValueChannels', _children: { value: { min: 0, max: 7 } } };

  const { document, loaded } = roundTrip(custom);
  assert.equal(difference(custom, loaded[0]), null);

  const stored = document.controls[0]._children;
  assert.ok(!('Effects' in stored), 'a defaulted Effects section should not be written down');
  assert.equal(stored.Parts._children.body._children.Background._children.Fill.colour, 'FF102030',
    'the one colour the author changed has to survive the part diff');
  assert.ok(!('Border' in stored.Parts._children.body._children.Background._children),
    'the defaulted half of an edited part section should not be written down');
  // `_type` is the marker that the section exists at all; `Corners.linked` is written even at its
  // default so a build without the normalizeCorner fix still reads the section as linked rather
  // than rendering every rounded part square. Both are deliberate, so both are pinned.
  assert.deepEqual(stored.Parts._children.plain._children.Background,
    { _type: 'Background', _children: { Corners: { linked: true } } },
    'a fully defaulted part section should keep only its _type marker and Corners.linked');
  assert.deepEqual(stored.ValueChannels._children.value, { min: 0, max: 7 },
    'authored value channels are not in the shell, so they are written whole');
});

test('a part whose section is deleted stays deleted', () => {
  // The `_removed` failure, one level further down than the rest of this file tests it. A part
  // with its Background taken off is a real thing to author — a text-only label layer — and it is
  // indistinguishable from "Background at defaults" unless the removal is recorded.
  const custom = createControl('CustomComponent', { Core: { id: 'cc2' } });
  const part = createPartNode('bare', { sections: { Background: clone(SECTION_DEFAULTS.Background) } });
  delete part._children.Background;
  custom._children.Parts = { _type: 'Parts', _children: { bare: part } };

  const { loaded } = roundTrip(custom);
  assert.ok(!('Background' in loaded[0]._children.Parts._children.bare._children),
    'the deleted part section came back on load');
});

test('a native control with an extra authored part round-trips', () => {
  // Type parts (a Knob's track, fill, pointer) are covered by the control diff; a part someone
  // ADDED is not in the pristine and takes the part diff. Both in one control, because getting the
  // split wrong means diffing a sparse part against a full one, which is a diff of nothing.
  const knob = createControl('Knob', { Core: { id: 'k' } });
  knob._children.Parts._children.badge = createPartNode('badge', {
    layout: { x: 2, y: 2, width: 9, height: 9 },
    sections: { Background: clone(SECTION_DEFAULTS.Background) },
  });
  knob._children.Parts._children.badge._children.Background._children.Fill.colour = 'FFAA0000';

  const { document, loaded } = roundTrip(knob);
  assert.equal(difference(knob, loaded[0]), null);
  assert.equal(document.controls[0]._children.Parts._children.badge._children.Background._children.Fill.colour, 'FFAA0000');
});

test('a control of an unknown type is passed through untouched', () => {
  // Forward compatibility: a document from a newer build, or a hand-edited one, must not be
  // quietly rewritten against a pristine that does not exist.
  const alien = { _type: 'Control', _children: { Core: { id: 'alien', controlType: 'NotAThing' }, Transform: { x: 1, y: 2 } } };
  assert.deepEqual(shrinkControl(alien), alien);
  assert.deepEqual(expandControl(alien), alien);
});

test('the reserved key is not a name the model uses', () => {
  const seen = new Set();
  (function walk(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of Object.keys(value)) { seen.add(key); walk(value[key]); }
    }
  })(Object.fromEntries(Object.keys(COMPONENT_TYPES).map((type) => [type, createControl(type)])));

  assert.ok(!seen.has(REMOVED_KEY), `"${REMOVED_KEY}" is both a marker and a real model key — they would be indistinguishable`);
});

/* ------------------------------------------------------------------ compatibility */

test('a panel saved by the old code still opens, and shrinks when saved again', () => {
  // Every .cepanel in existence stores its controls in full. They have to keep working, and they
  // should get the benefit without anyone converting anything.
  const knob = createControl('Knob', { Core: { id: 'legacy' } });
  knob._children.Parts._children.labelUnit._children.Text.content = 'Hz';

  const legacy = JSON.stringify({ ...createPanel('legacy'), controls: [knob] }, null, 2);
  const loaded = deserializePanel(legacy, null, 'legacy');

  assert.ok(loaded, 'an old document must still open');
  assert.equal(difference(knob, loaded.controls[0]), null, 'an old document must load to exactly what it described');
  assert.equal(loaded.controls[0]._children.Parts._children.labelUnit._children.Text.content, 'Hz');

  const resaved = serializePanel(loaded);
  assert.ok(resaved.length < legacy.length / 10, `re-saving should shrink it: ${legacy.length} -> ${resaved.length}`);
  assert.equal(difference(loaded.controls[0], deserializePanel(resaved, null, 'legacy').controls[0]), null);
});

test('save, load, save is byte-stable', () => {
  // A document that changes every time it is written makes every autosave look like an edit.
  const knob = createControl('Knob', { Core: { id: 'stable' } });
  knob._children.Parts._children.labelTitle._children.Text.content = 'CUTOFF';

  const panel = createPanel('stable');
  panel.controls = [knob];
  const once = serializePanel(panel);
  const twice = serializePanel(deserializePanel(once, null, 'stable'));
  assert.equal(once, twice);
});

test('the export payload is written in full, because C++ reads it', () => {
  // The exported plugin never runs deserializePanel: Player/PanelValueModel.h parses the .cepanel
  // and reads Core, Behavior and Scripts straight off controls[]. A field elided out of the
  // authoring document is simply absent to it, so the build payload opts out of eliding.
  const panel = createPanel('export');
  panel.controls = [createControl('Knob', { Core: { id: 'x' } })];

  const authored = JSON.parse(serializePanel(panel));
  const exported = JSON.parse(serializePanel(panel, { elide: false }));

  assert.ok(!('Parts' in authored.controls[0]._children), 'the authoring document should be a diff');
  assert.equal(Object.keys(exported.controls[0]._children.Parts._children).length, 17,
    'the export payload must carry every section in full');
  assert.equal(difference(panel.controls[0], exported.controls[0]), null,
    'the un-elided form should be the control itself');
});

/* ------------------------------------------------------------------ the payoff */

/** Marginal cost of one more control, with the panel's own header divided out. */
function bytesPerControl(type) {
  const build = (count) => {
    const panel = createPanel('cost');
    panel.controls = Array.from({ length: count }, (_, i) => createControl(type, { Core: { id: `c_${i}` } }));
    return serializePanel(panel).length;
  };
  return (build(30) - build(10)) / 20;
}

test('controls cost a fraction of what they did to write down', () => {
  // Guarded as numbers because a change that re-materialized defaults on save would have no other
  // symptom. Thresholds are alarms with room in them, not targets. A Knob was ~100,000 bytes
  // before any of this, and ~12,000 after the slider parts alone were elided.
  const knob = bytesPerControl('Knob');
  const button = bytesPerControl('Button');

  assert.ok(knob < 2_000, `a knob now serializes to ${Math.round(knob)} bytes; it was ~100,000`);
  assert.ok(button < 1_000, `a button now serializes to ${Math.round(button)} bytes`);
});
