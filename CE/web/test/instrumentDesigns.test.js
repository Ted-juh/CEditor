// instrumentDesigns.test.js — every set reaches the twenty instruments it used to leave alone
// (models/instrumentDesigns.js).
//
// The Macro, Turing, Arp, Transport, Keyboard and the rest drew one design in one palette under
// every set. These pin what the sets now do to them: each wears its set's display window, its
// voices come from the set's own colours and read on that window, Graphite is untouched, and a
// panel's palette-driven lanes follow the set as well.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, CONTROL_SET_TOKEN_NAMES, getControlSet, isTokenReference, makeTokenReference, resolveControlTokens, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { GRAPHITE_SERIES, INSTRUMENT_TYPES, SERIES_ROLES, chromeTone, contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const others = BUILT_IN_CONTROL_SETS.filter((s) => s.id !== 'graphite');
const face = (set) => resolveToken('instrument.face', set);

// Every part of a dotted name must start with a letter: `{series.1}` would not be a reference.
// Nothing fails when one is written. The resolver keeps the text, the renderer falls back to its
// own colour, and the set looks as if it had dressed its instruments.
test('every role a set names can be written as a reference, and resolves', () => {
  for (const name of CONTROL_SET_TOKEN_NAMES) {
    assert.ok(isTokenReference(makeTokenReference(name)), `{${name}} is not a reference`);
  }
  for (const set of others) {
    for (const type of INSTRUMENT_TYPES) {
      const own = resolveControlTokens(resolveControlForSet(createControl(type), set), set)._children[type] ?? {};
      for (const [key, value] of Object.entries(own)) {
        assert.ok(!/^\{.*\}$/.test(String(value)), `${set.id} ${type}.${key} is still ${value}`);
      }
    }
  }
});

test('Graphite\'s instruments are what they always were, and its series is the old palette', () => {
  const graphite = getControlSet('graphite');
  assert.deepEqual(SERIES_ROLES.map((role) => resolveToken(role, graphite)), GRAPHITE_SERIES);
  for (const type of INSTRUMENT_TYPES) {
    assert.equal(familyPatchFor(graphite, type), null, `${type} gets no design from Graphite`);
  }
  // The palettes the renderers fell back to, in the order Macro used them: the series reproduces them.
  assert.deepEqual(GRAPHITE_SERIES.map((c) => c.slice(2)), ['39D98A', 'F2C94C', '5B9BD5', '9B8AFF', 'F2994A', 'EB5757']);
});

test('every other set dresses every instrument, face and voices, from its own colours', () => {
  for (const set of others) {
    for (const type of INSTRUMENT_TYPES) {
      const designed = resolveControlForSet(createControl(type), set);
      const factory = createControl(type);
      assert.equal(designed._children.Background._children.Fill.colour, face(set), `${set.id} ${type} wears the display window`);
      const changed = Object.keys(designed._children[type] ?? {}).filter((key) => /Colour$/.test(key) && designed._children[type][key] !== factory._children[type][key]);
      assert.ok(changed.length >= 1, `${set.id} ${type}: no colour of its own changed`);
    }
  }
});

test('every voice reads on its face, the captions read, and no voice is a grey or a Graphite leftover', () => {
  const luminance = (hex) => {
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16) / 255);
    return [r, g, b];
  };
  for (const set of others) {
    const f = face(set);
    assert.ok(contrast(resolveToken('instrument.ink', set), f) >= 4.5, `${set.id} ink`);
    assert.ok(contrast(resolveToken('instrument.text', set), f) >= 4.5, `${set.id} text`);
    for (const role of SERIES_ROLES) {
      const c = resolveToken(role, set);
      assert.ok(contrast(c, f) >= 3, `${set.id} ${role} ${c} on ${f} is ${contrast(c, f).toFixed(2)}:1`);
    }
    for (const role of SERIES_ROLES.slice(0, 5)) {
      const c = resolveToken(role, set);
      assert.ok(!GRAPHITE_SERIES.includes(c), `${set.id} ${role} fell back to Graphite's ${c}`);
      const [r, g, b] = luminance(c);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const lettering = resolveToken('text.primary', set);
      assert.ok(chroma > 0.06 || c === lettering, `${set.id} ${role} ${c} is a grey`);
    }
  }
});

test('the voices of a set are told apart', () => {
  const distance = (a, b) => Math.hypot(...[0, 2, 4].map((i) => parseInt(a.slice(-6).slice(i, i + 2), 16) - parseInt(b.slice(-6).slice(i, i + 2), 16)));
  for (const set of others) {
    const voices = SERIES_ROLES.slice(0, 5).map((role) => resolveToken(role, set));
    for (let i = 0; i < voices.length; i++) for (let j = i + 1; j < voices.length; j++) {
      assert.ok(distance(voices[i], voices[j]) >= 60, `${set.id}: ${SERIES_ROLES[i]} ${voices[i]} and ${SERIES_ROLES[j]} ${voices[j]} are too alike`);
    }
  }
});

test('the instruments differ from set to set, not only from Graphite', () => {
  const look = (id, type) => JSON.stringify(resolveControlForSet(createControl(type), getControlSet(id))._children[type]);
  for (const type of INSTRUMENT_TYPES) {
    assert.notEqual(look('tolex', type), look('neon', type), `${type}: Tolex and Neon are the same`);
    assert.notEqual(look('machined', type), look('ivory', type), `${type}: Machined and Ivory are the same`);
  }
});

test('a lane, slot or scene in a palette colour takes the set\'s voice for it; one the author chose stays', () => {
  const graphite = getControlSet('graphite');
  const macro = createControl('Macro');
  assert.equal(resolveControlForSet(macro, graphite)._children.Macro, macro._children.Macro, 'Graphite leaves the slots alone, same object');
  for (const set of others) {
    const slots = resolveControlForSet(macro, set)._children.Macro.slots;
    macro._children.Macro.slots.forEach((factory, i) => {
      const voice = SERIES_ROLES[GRAPHITE_SERIES.indexOf(factory.colour)];
      assert.equal(slots[i].colour, resolveToken(voice, set), `${set.id} slot ${i} speaks ${voice}`);
    });
  }
  const chosen = createControl('Macro');
  chosen._children.Macro.slots = chosen._children.Macro.slots.map((slot, i) => (i === 0 ? { ...slot, colour: 'FF123456' } : slot));
  assert.equal(resolveControlForSet(chosen, getControlSet('tolex'))._children.Macro.slots[0].colour, 'FF123456');
  // Every instrument that carries coloured items has them move, so none is left in Graphite's.
  for (const type of ['Constellation', 'Timbre', 'Router', 'Looper', 'SplitZone', 'Constraint', 'Orbit', 'StepSequencer']) {
    const factory = createControl(type)._children[type];
    const dressed = resolveControlForSet(createControl(type), getControlSet('neon'))._children[type];
    const lists = Object.keys(factory).filter((key) => Array.isArray(factory[key]) && factory[key].some((item) => GRAPHITE_SERIES.includes(item?.colour)));
    assert.ok(lists.length, `${type} has palette-coloured items`);
    for (const key of lists) {
      assert.ok(dressed[key].every((item) => !GRAPHITE_SERIES.includes(item.colour)), `${type}.${key} kept a Graphite colour`);
    }
  }
});

test('an instrument\'s chrome sits on the set\'s face, and its lettering reads on its plate', () => {
  const graphiteTone = chromeTone(resolveToken('instrument.face', getControlSet('graphite')), resolveToken('instrument.text', getControlSet('graphite')));
  for (const grey of ['rgba(20,20,32,1)', 'rgba(42,42,54,1)', 'rgba(90,90,100,1)', 'rgba(232,232,238,1)', '#0b0b10']) {
    assert.equal(graphiteTone(grey), grey, `Graphite draws ${grey} as itself`);
  }
  const hex = (css) => {
    const [r, g, b] = css.match(/\d+/g).map(Number);
    return 'FF' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  for (const set of others) {
    const tone = chromeTone(face(set), resolveToken('instrument.text', set));
    // The header lettering is the set's instrument lettering, exactly.
    assert.equal(hex(tone('rgba(232,232,238,1)')), resolveToken('instrument.text', set), set.id);
    const plate = hex(tone('rgba(20,20,32,1)'));
    assert.ok(contrast(hex(tone('rgba(232,232,238,1)')), plate) >= 7, `${set.id} header lettering on its plate`);
    // An idle lamp is still told from its plate, and no plate is Graphite's navy.
    assert.ok(contrast(hex(tone('rgba(90,90,100,1)')), plate) >= 1.8, `${set.id} idle lamp`);
    assert.notEqual(plate, 'FF141420', set.id);
    assert.equal(tone('rgba(42,42,54,0.5)').endsWith(',0.5)'), true, 'alpha is kept');
  }
});
