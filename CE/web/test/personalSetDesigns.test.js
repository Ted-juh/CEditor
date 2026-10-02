// personalSetDesigns.test.js — a personal set gets the designs the built-ins have, from its own
// colours (models/personalSetDesigns.js).
//
// A personal set is a copy of a built-in. Copies took the label, section and instrument designs as
// they stood the day they were made: one saved before those designs existed had none, one saved
// after kept the original's display face and voices as fixed colours, and "New Control Set", a
// copy of Graphite, never had any. The fixture is the Tolex set file as shipped before any of
// them, which is exactly what a copy saved then holds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BUILT_IN_CONTROL_SETS, builtInControlSetId, getControlSet, normalizeControlSetDefinition, resolveToken,
} from '../src/CE_Application/models/controlSets.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { INSTRUMENT_TYPES, SERIES_ROLES, contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { sectionTreatmentFor } from '../src/CE_Application/models/sectionDesigns.js';
import { labelTreatmentFor } from '../src/CE_Application/models/labelDesigns.js';
import { DERIVED_ROLES, lineageOf } from '../src/CE_Application/models/personalSetDesigns.js';
import { macroUsesSetKnob } from '../src/CE_Application/utils/macroKnob.js';

const OLD_TOLEX = JSON.parse(readFileSync(new URL('./fixtures/tolex-before-set-designs.ceditor-controlset.json', import.meta.url), 'utf8')).set;
const clone = (value) => JSON.parse(JSON.stringify(value));
const savedBefore = (id, name) => normalizeControlSetDefinition({ ...clone(OLD_TOLEX), id, name });

// The lettering in a Group, as the eye sees it: the Group's face over the panel.
function labelInGroup(set) {
  const label = resolveControlForSet(createControl('Label'), set)._children;
  const ink = label.Text._children.Fill.colour;
  const fill = String(resolveControlForSet(createControl('Group'), set)._children.Background._children.Fill.colour);
  const panel = resolveToken('panel.surface', set);
  const a = parseInt(fill.slice(0, 2), 16) / 255;
  const ch = (hex, at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16);
  const behind = 'FF' + [0, 2, 4].map((at) => Math.round(ch(fill, at) * a + ch(panel, at) * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return contrast(ink, behind);
}

test('a copy saved before the designs existed gets its original\'s, and says where it came from', () => {
  assert.equal(OLD_TOLEX.tokens['series.one'], undefined, 'the fixture predates the series');
  const set = savedBefore('tolex-copy', 'Tolex Copy');
  const tolex = getControlSet('tolex');
  assert.equal(set.basedOn, 'tolex');
  assert.equal(labelTreatmentFor({ ...set, id: set.basedOn }), labelTreatmentFor(tolex));
  assert.equal(sectionTreatmentFor({ ...set, id: set.basedOn }), 'piping');
  // Its sections are Tolex's piping, and a label in one reads.
  const group = resolveControlForSet(createControl('Group'), set)._children.Background._children;
  assert.equal(group.Border._children?.colour ?? group.Border.colour, resolveToken('text.primary', set));
  assert.ok(labelInGroup(set) >= 4.5, `a label in a Group reads at ${labelInGroup(set).toFixed(2)}:1`);
  // Its instruments wear its display and voices, from the same colours as Tolex's.
  for (const type of INSTRUMENT_TYPES) assert.ok(familyPatchFor(set, type), `${type} is dressed`);
  assert.deepEqual(SERIES_ROLES.map((role) => resolveToken(role, set)), SERIES_ROLES.map((role) => resolveToken(role, tolex)));
  assert.equal(macroUsesSetKnob(resolveControlForSet(createControl('Macro'), set)), true, 'its Macro draws its knob');
});

test('recolouring a personal set moves its display face and voices with it', () => {
  const copy = normalizeControlSetDefinition({ ...clone(getControlSet('tolex')), id: 'my-amp', name: 'My Amp', basedOn: 'tolex' });
  assert.deepEqual(SERIES_ROLES.map((role) => resolveToken(role, copy)), SERIES_ROLES.map((role) => resolveToken(role, getControlSet('tolex'))),
    'unchanged, it derives what Tolex does');
  // As the Settings editor saves it: the draft is the read set, edited, and read again.
  const edited = normalizeControlSetDefinition({
    ...clone(copy), tokens: { ...copy.tokens, 'display.screen': 'FF0B1A2E', 'display.lit': 'FF6FE3FF', accent: 'FFFF5FA2' },
  });
  const face = resolveToken('instrument.face', edited);
  assert.equal(face, 'FF0B1A2E', 'the face is its new display glass');
  assert.notEqual(resolveToken('series.one', edited), resolveToken('series.one', copy), 'its first voice follows its new display light');
  for (const role of SERIES_ROLES) assert.ok(contrast(resolveToken(role, edited), face) >= 3, `${role} reads on the new face`);
  // And on the next read nothing is stuck at the colours of the read before.
  const again = normalizeControlSetDefinition({ ...clone(edited), tokens: { ...edited.tokens, 'display.screen': 'FF2A0E0E' } });
  assert.equal(resolveToken('instrument.face', again), 'FF2A0E0E');
});

test('a set made from Graphite gets the general designs, and Graphite stays as it was', () => {
  const graphite = getControlSet('graphite');
  const made = normalizeControlSetDefinition({ ...clone(graphite), id: 'new-control-set', name: 'New Control Set', basedOn: 'graphite' });
  assert.equal(sectionTreatmentFor(made), 'well');
  assert.ok(familyPatchFor(made, 'Turing'), 'its instruments are dressed');
  assert.ok(labelInGroup(made) >= 4.5);
  // Its Macro keeps the Macro's own knob, as Graphite's does, until a Knobs design is picked.
  assert.equal(macroUsesSetKnob(resolveControlForSet(createControl('Macro'), made)), false);
  const picked = normalizeControlSetDefinition({ ...clone(made), families: { ...made.families, Knob: clone(getControlSet('tolex').families.Knob) }, chosenFamilies: { Knob: 'tolex' } });
  assert.equal(macroUsesSetKnob(resolveControlForSet(createControl('Macro'), picked)), true);
  // One saved before `basedOn` existed is recognised by the name Settings gives a new set.
  assert.equal(lineageOf({ id: 'new-control-set-2' }, builtInControlSetId), 'graphite');
  // Graphite itself is untouched, here and when a file carries a copy under its own id.
  assert.equal(sectionTreatmentFor(graphite), null);
  assert.equal(familyPatchFor(graphite, 'Turing'), null);
  assert.deepEqual(normalizeControlSetDefinition(clone(graphite)), clone(graphite));
});

test('every built-in read as a set file comes back exactly as the program makes it', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    assert.deepEqual(normalizeControlSetDefinition(clone(set)), clone(set), set.id);
  }
});

test('a Labels design picked in Settings is kept exactly as picked', () => {
  const walnutLabel = clone(getControlSet('walnut').families.Label);
  const chose = normalizeControlSetDefinition({
    ...clone(OLD_TOLEX), id: 'tolex-copy', name: 'Tolex Copy',
    families: { ...clone(OLD_TOLEX.families), Label: walnutLabel },
    chosenFamilies: { Label: 'walnut' },
  });
  assert.deepEqual(chose.families.Label, walnutLabel, 'Walnut\'s brass plate, not Tolex\'s silkscreen');
  assert.equal(chose.designed?.Label, undefined, 'nothing recorded as derived');
  assert.deepEqual(chose.chosenFamilies, { Label: 'walnut' }, 'the choice is kept for the next read');
});

test('turning a set\'s metal finish off takes the engraved lip with it', () => {
  const metal = normalizeControlSetDefinition({
    ...clone(OLD_TOLEX), id: 'my-panel', name: 'My Panel',
    panel: { ...clone(OLD_TOLEX.panel), material: { enabled: true, kind: 'brushed', strength: 50, shine: 40, grain: 100 } },
  });
  assert.equal(metal.families.Label.component['Text.Effects.shadowEnabled'], true, 'engraved while it is metal');
  const plain = normalizeControlSetDefinition({ ...clone(metal), panel: { ...metal.panel, material: { ...metal.panel.material, enabled: false } } });
  assert.equal(plain.families.Label.component['Text.Effects.shadowEnabled'], undefined, 'no shadow left under the silkscreen');
});

test('reading a personal set again changes nothing', () => {
  for (const set of [savedBefore('tolex-copy', 'Tolex Copy'), savedBefore('my-panel', 'My Panel'),
    normalizeControlSetDefinition({ ...clone(getControlSet('graphite')), id: 'new-control-set', basedOn: 'graphite' })]) {
    assert.deepEqual(normalizeControlSetDefinition(clone(set)), set, set.id);
  }
});

test('lineage: named, or matched from the id duplication made', () => {
  assert.equal(lineageOf({ id: 'whatever', basedOn: 'neon' }, builtInControlSetId), 'neon');
  assert.equal(lineageOf({ id: 'tolex-copy' }, builtInControlSetId), 'tolex');
  assert.equal(lineageOf({ id: 'tolex-copy-copy-2' }, builtInControlSetId), 'tolex');
  // Names and ids differ for some built-ins: "Vintage Mono" is brassworks.
  assert.equal(lineageOf({ id: 'vintage-mono-copy-3' }, builtInControlSetId), 'brassworks');
  assert.equal(lineageOf({ id: 'my-own-thing' }, builtInControlSetId), null);
  // A set with no lineage takes the general designs rather than none.
  const orphan = savedBefore('my-own-thing', 'Mine');
  assert.equal(orphan.basedOn, undefined);
  assert.ok(familyPatchFor(orphan, 'Group'));
  assert.ok(DERIVED_ROLES.every((role) => resolveToken(role, orphan)), 'every derived role has a value');
});
