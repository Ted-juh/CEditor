// sliderPartsElision.test.js — a knob costs 100 KB to write down, and 93 KB of that is nothing.
//
// A Knob is created with seventeen fully-materialized semantic parts, and every one of them
// carries a complete Background (a Fill with sixty-odd fields, a Border with a per-side object)
// and a Text at its defaults. Nothing elided defaults on save, so a knob nobody had styled still
// wrote 93 KB — and the QA-06 sheet, a *small* hardware editor at 162 bound controls, serialized
// to 28 MB. Autosave paid it again, and the undo stack paid it fifty times over.
//
// It was pure redundancy: SliderFamilyRenderer has always resolved parts through
// resolveSliderSemanticParts(), which rebuilds every default part whether the document carried it
// or not. So the document now stores only the parts that differ.
//
// The half that is easy to forget is the read side, and it is the half that would have hurt. Only
// the RENDERER resolves. The Slider and Slider-label editors, the Animations and Behavior editors,
// and interactionRuntime's hit-testing all read `getSection(control, 'Parts')` straight off the
// control. Eliding on save without restoring on load would have produced a knob that draws
// perfectly and has an empty Parts inspector — a worse bug than the one being fixed. So
// deserializePanel rehydrates, and the tests below check the in-memory model is unchanged rather
// than checking that the file got smaller.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { createSliderSemanticParts, stripDefaultSliderParts, usesSliderSemanticParts } from '../src/CE_Application/utils/sliderEntityFactory.js';

/** Deep equality that ignores key order — rebuilt objects order their keys differently. */
function deepEqual(left, right, path = '$') {
  if (left === right) return null;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return left === right ? null : `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return `${path}: array vs object`;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!Object.hasOwn(left, key)) return `${path}.${key}: missing before`;
    if (!Object.hasOwn(right, key)) return `${path}.${key}: missing after`;
    const problem = deepEqual(left[key], right[key], `${path}.${key}`);
    if (problem) return problem;
  }
  return null;
}

function roundTrip(control) {
  const panel = createPanel('round-trip');
  panel.controls = [control];
  const json = serializePanel(panel);
  return { json, document: JSON.parse(json), loaded: deserializePanel(json, null, 'round-trip').controls[0] };
}

/* ------------------------------------------------------------------ the contract */

test('a pristine slider control writes no Parts at all', () => {
  for (const type of ['Knob', 'Slider']) {
    const { document } = roundTrip(createControl(type, { Core: { id: `p_${type}` } }));
    assert.ok(!('Parts' in document.controls[0]._children), `${type} still writes a Parts section it does not need`);
  }
});

test('loading restores every part, so the in-memory model is unchanged', () => {
  // This is the assertion that matters. Everything except the renderer reads Parts directly.
  for (const type of ['Knob', 'Slider', 'Number', 'Range', 'Button', 'Label', 'Container']) {
    const control = createControl(type, { Core: { id: `r_${type}` } });
    const { loaded } = roundTrip(control);
    const problem = deepEqual(control, loaded);
    assert.equal(problem, null, `${type} did not survive a save/load round-trip — ${problem}`);
  }
});

test('a knob comes back with all seventeen parts', () => {
  const { loaded } = roundTrip(createControl('Knob', { Core: { id: 'k17' } }));
  const expected = Object.keys(createSliderSemanticParts()._children);
  assert.deepEqual(Object.keys(loaded._children.Parts._children).sort(), expected.sort());
});

test('only the parts that differ are written down', () => {
  const knob = createControl('Knob', { Core: { id: 'k_mod' } });
  knob._children.Parts._children.bodyTrackFill._children.Background._children.Fill.colour = 'FFFF0000';

  const { document, loaded } = roundTrip(knob);
  assert.deepEqual(Object.keys(document.controls[0]._children.Parts._children), ['bodyTrackFill'],
    'a single edited part should not drag the other sixteen onto disk with it');
  assert.equal(deepEqual(knob, loaded), null, 'the edited knob did not round-trip');
  assert.equal(loaded._children.Parts._children.bodyTrackFill._children.Background._children.Fill.colour, 'FFFF0000');
});

test('a part the author added is never elided', () => {
  // The resolver only knows how to rebuild the default part names. Anything else is the author's,
  // and dropping it would be losing their work rather than saving space.
  const knob = createControl('Knob', { Core: { id: 'k_custom' } });
  knob._children.Parts._children.myBadge = {
    _type: 'Part', name: 'myBadge', role: 'custom', visible: true,
    opacity: 1, zIndex: 9, acceptsStatePatches: true, clipChildren: false, _children: {},
  };

  const { document } = roundTrip(knob);
  assert.deepEqual(Object.keys(document.controls[0]._children.Parts._children), ['myBadge']);
});

test('Number and Range keep their parts on disk', () => {
  // They share Behavior.family 'range' but are role 'spinbox', so they render their Parts
  // directly instead of through the resolver. Eliding theirs would erase them.
  for (const [type, count] of [['Number', 3], ['Range', 4]]) {
    const { document } = roundTrip(createControl(type, { Core: { id: `s_${type}` } }));
    const parts = document.controls[0]._children.Parts;
    assert.ok(parts, `${type} must keep its Parts — nothing rebuilds them on read`);
    assert.equal(Object.keys(parts._children).length, count);
  }
});

test('usesSliderSemanticParts picks exactly the controls the renderer resolves', () => {
  const resolved = ['Knob', 'Slider'];
  const direct = ['Number', 'Range', 'Button', 'Label', 'Container', 'CustomComponent'];
  for (const type of resolved) assert.ok(usesSliderSemanticParts(createControl(type)), `${type} should be resolved`);
  for (const type of direct) assert.ok(!usesSliderSemanticParts(createControl(type)), `${type} must not be treated as a semantic-parts control`);
});

test('nested controls are elided and restored too', () => {
  const container = createControl('Container', { Core: { id: 'box' } });
  const knob = createControl('Knob', { Core: { id: 'inner' } });
  container._children.Children._children = { inner: knob };

  const { document, loaded } = roundTrip(container);
  assert.ok(!('Parts' in document.controls[0]._children.Children._children.inner._children),
    'a knob inside a container still wrote its default parts');
  assert.equal(deepEqual(knob, loaded._children.Children._children.inner), null,
    'the nested knob did not round-trip');
});

test('save, load, save is byte-stable', () => {
  // A document that changes every time it is written is a document nobody can review, and it
  // would make every autosave look like an edit.
  const knob = createControl('Knob', { Core: { id: 'k_stable' } });
  knob._children.Parts._children.labelTitle._children.Text.content = 'CUTOFF';

  const panel = createPanel('stable');
  panel.controls = [knob];
  const once = serializePanel(panel);
  const twice = serializePanel(deserializePanel(once, null, 'stable'));
  assert.equal(once, twice);
});

test('stripDefaultSliderParts returns null when there is nothing to store', () => {
  assert.equal(stripDefaultSliderParts(createSliderSemanticParts()), null);
  assert.equal(stripDefaultSliderParts(null), null);
  assert.equal(stripDefaultSliderParts({ _type: 'Parts', _children: {} }), null);
});

test('a panel saved by the old code still opens, and shrinks when it is saved again', () => {
  // Every .cepanel in existence carries all seventeen parts. They have to keep working, and they
  // should get the benefit without anyone converting anything: the resolver merges the stored
  // parts over the defaults, finds they match, and the next save writes only what differs.
  const knob = createControl('Knob', { Core: { id: 'legacy' } });
  knob._children.Parts._children.labelUnit._children.Text.content = 'Hz';

  const legacy = JSON.stringify({ ...createPanel('legacy'), controls: [knob] }, null, 2);
  assert.equal(Object.keys(JSON.parse(legacy).controls[0]._children.Parts._children).length, 17,
    'the fixture should be in the old full-parts form');

  const loaded = deserializePanel(legacy, null, 'legacy');
  assert.ok(loaded, 'an old document must still open');
  assert.equal(Object.keys(loaded.controls[0]._children.Parts._children).length, 17);
  assert.equal(loaded.controls[0]._children.Parts._children.labelUnit._children.Text.content, 'Hz',
    'the author\'s edit must survive the conversion');

  const resaved = serializePanel(loaded);
  assert.deepEqual(Object.keys(JSON.parse(resaved).controls[0]._children.Parts._children), ['labelUnit']);
  assert.ok(resaved.length < legacy.length / 4, `re-saving should shrink it: ${legacy.length} -> ${resaved.length}`);

  const reloaded = deserializePanel(resaved, null, 'legacy');
  assert.equal(deepEqual(loaded.controls[0], reloaded.controls[0]), null,
    'the converted document must load to the same control as the original');
});

/* ------------------------------------------------------------------ the payoff */

/** The MARGINAL cost of one more knob, with the panel's own ~5 KB of header divided out. */
function bytesPerKnob() {
  const build = (count) => {
    const panel = createPanel('cost');
    panel.controls = Array.from({ length: count }, (_, i) => createControl('Knob', { Core: { id: `cost_${i}` } }));
    return serializePanel(panel).length;
  };
  return (build(30) - build(10)) / 20;
}

test('a knob costs an order of magnitude less to write down', () => {
  // Guarding the number, not just the behaviour: this is the whole reason the change exists, and
  // a default that quietly re-materialized parts on save would put the 93 KB back with no other
  // symptom. Measured as a marginal cost so the panel header does not flatter the result.
  //
  // Was ~100,000 bytes. The 12,000 here is a regression alarm with room in it, not a target —
  // what is left is States, Behavior, Animations and the rest of the section tree, which is a
  // real cost but a much smaller one and not this change's to fix.
  const bytes = bytesPerKnob();
  assert.ok(bytes < 15_000, `a knob now serializes to ${Math.round(bytes)} bytes; it was ~100,000 and must stay far below that`);
});

test('the parts are what got cheaper, and they are most of what was there', () => {
  // Stated as a ratio against the un-elided cost so the claim in CE/qa/README.md is checked
  // rather than remembered.
  const withParts = JSON.stringify(createControl('Knob')._children.Parts).length;
  const bytes = bytesPerKnob();
  assert.ok(withParts > 80_000, `a knob's default Parts tree is ${withParts} bytes — if this shrank, revisit the numbers in CE/qa/README.md`);
  assert.ok(bytes < withParts / 5, `eliding the parts should save most of the document, saved ${withParts} -> ${Math.round(bytes)}`);
});
