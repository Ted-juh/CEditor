// sectionValueOverrides.test.js — the third export door, which used to lead nowhere.
//
// THE DEFECT. `deriveExportParameters` has three doors: a control's `Behavior` value, a
// CustomComponent's value channels, and a type's own `exportValues` declaration naming a field on
// one of its sections. The first two land somewhere the player already writes — `valueOverride`
// and `customValues`. The third had nowhere to land: the parameter appeared in the DAW, automated,
// saved with the session, and the component never moved.
//
// It survived because only four types used that door and three of their parameters had never been
// automated by anyone. Ruling on the eight deferred types took it from four types to eleven, which
// is what made it worth fixing rather than noting.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applySectionValues,
  sectionValueOf,
  sectionValuePatch,
} from '../src/CE_Application/utils/sectionValueOverrides.js';
import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const PLAYER = readFileSync(join(SRC, 'Player.svelte'), 'utf8');
const SURFACE = readFileSync(join(SRC, 'CE_Application/editor/PanelPreviewSurface.svelte'), 'utf8');

const arp = () => createControl('Arp', { Core: { id: 'a1', name: 'a1' } });

test('an override lands on the control section the renderer reads', () => {
  const control = applySectionValues(arp(), { Arp: { rate: 12 } });
  assert.equal(control._children.Arp.rate, 12);
  assert.equal(control._children.Arp.gate, 0.6, 'the other fields are untouched');
});

test('the source control is not mutated', () => {
  // It is the document. An automation lane rewriting it would make a host parameter edit the panel.
  const original = arp();
  applySectionValues(original, { Arp: { rate: 12 } });
  assert.equal(original._children.Arp.rate, 6);
});

test('nothing to overlay returns the same object', () => {
  // The common path: most controls have no automation on a section field, and this runs per render.
  const control = arp();
  assert.equal(applySectionValues(control, undefined), control);
  assert.equal(applySectionValues(control, {}), control);
  assert.equal(applySectionValues(control, { Arp: {} }), control);
});

test('a field the section does not have is ignored', () => {
  // A stale override from a control whose type changed must not invent a field the renderer would
  // then read as real.
  const control = applySectionValues(arp(), { Arp: { notAField: 5 } });
  assert.ok(!('notAField' in control._children.Arp));
});

test('a section the control does not have is skipped, not created', () => {
  const control = applySectionValues(arp(), { Joystick: { x: 0.5 } });
  assert.ok(!control._children.Joystick, 'a Joystick section must not appear on an Arp');
});

test('undefined clears nothing and writes nothing', () => {
  const control = applySectionValues(arp(), { Arp: { rate: undefined } });
  assert.equal(control._children.Arp.rate, 6);
});

test('patching one field keeps the others — an Arp has four', () => {
  let values = sectionValuePatch(undefined, 'Arp', 'rate', 12);
  values = sectionValuePatch(values, 'Arp', 'gate', 0.25);
  values = sectionValuePatch(values, 'Turing', 'length', 16);
  assert.deepEqual(values, { Arp: { rate: 12, gate: 0.25 }, Turing: { length: 16 } });
  assert.equal(sectionValueOf(values, 'Arp', 'gate'), 0.25);
  assert.equal(sectionValueOf(values, 'Arp', 'swing'), undefined);
  assert.equal(sectionValueOf(undefined, 'Arp', 'rate'), undefined);
});

test('a round trip: overlay what the player would write, read what it would read back', () => {
  const param = deriveExportParameters({ controls: [arp()] }).find((p) => p.field === 'rate');
  assert.ok(param, 'the Arp exports no rate parameter');

  const values = sectionValuePatch(undefined, param.section, param.field, 20);
  assert.equal(sectionValueOf(values, param.section, param.field), 20);
  assert.equal(applySectionValues(arp(), values)._children[param.section][param.field], 20);
});

// --- the wiring, which is the part that was missing -------------------------------------------

test('every parameter from the type-declaration door carries where it lives', () => {
  // Without `section`/`field` the player has no way to tell this door from the other two, and the
  // value goes to customValues, where nothing reads it.
  for (const [name, type] of Object.entries(COMPONENT_TYPES)) {
    const specs = type.exportValues ?? [];
    if (specs.length === 0) continue;
    const control = createControl(name, { Core: { id: `x_${name}`, name: `x_${name}` } });
    for (const param of deriveExportParameters({ controls: [control] })) {
      assert.ok(param.section && param.field,
        `${name}: ${param.id} says nothing about where its value lives`);
    }
  }
});

test('the player writes and reads through sectionValues', () => {
  assert.match(PLAYER, /sectionValuePatch/, 'automation playback does not write section values');
  assert.match(PLAYER, /sectionValueOf/, 'and does not read them back');
  assert.match(PLAYER, /sectionField/, 'the parameter map does not carry the section and field');
});

test('the overlay happens before the value-source chain, not inside it', () => {
  // Several apply*ValueSource functions read the ORIGINAL control rather than the resolved one, so
  // an overlay applied later would be visible to some of them and not others.
  const body = SURFACE.slice(SURFACE.indexOf('function resolvedPreviewFor'));
  const overlay = body.indexOf('applySectionValues');
  const chain = body.indexOf('applySetlistValueSource');
  assert.ok(overlay > -1, 'the surface never applies section values');
  assert.ok(overlay < chain, 'the overlay must come before the chain');
});
