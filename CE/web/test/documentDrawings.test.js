// documentDrawings.test.js — a drawing several controls use is written once, and each has it back.
//
// stores/documentDrawings.js is an encoding of the file: Save writes each drawing (a hand-drawn
// control's Parts section) that more than one control uses once, beside the controls, and loading
// puts it back into every control that names it. Nothing past the loader may be able to tell.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, panelOpenReport, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { DRAWING_KEY, resolveDrawings, shareDrawings } from '../src/CE_Application/stores/documentDrawings.js';
import { PANEL_FORMAT_VERSION, migratePanelDocument } from '../src/CE_Application/utils/panelFormat.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { setNestedValueShared } from '../src/CE_Application/stores/controlTreeUtils.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';
const AN1X = 'CE/panels/Yamaha AN1x.cepanel';
const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);

/** Every control, containers' children included. */
function* everyControl(controls) {
  for (const control of controls ?? []) {
    yield control;
    yield* everyControl(Object.values(control?._children?.Children?._children ?? {}).filter((c) => c?._children));
  }
}

/** A sparse control with a Parts section of `size` characters or so, distinct per `tag`. */
const drawn = (id, tag, size = 400) => ({
  _type: 'Control',
  _children: {
    Core: { id, controlType: 'CustomComponent' },
    Parts: { _children: { cap: { _type: 'Part', name: 'cap', _children: { Text: { content: `${tag}`.padEnd(size, '.') } } } } },
  },
});

test('GAIA and the AN1x save their shared drawings once, and open to exactly the controls they had', () => {
  for (const rel of [GAIA, AN1X]) {
    const panel = open(rel);
    const text = serializePanel(panel);
    const doc = JSON.parse(text);
    const names = Object.keys(doc.drawings ?? {});
    const refs = [...everyControl(doc.controls)].filter((c) => c._children.Parts?.[DRAWING_KEY]);
    assert.ok(names.length >= 10, `${rel}: ${names.length} drawings written once`);
    assert.ok(refs.length > 100, `${rel}: ${refs.length} controls refer to one`);
    assert.ok(refs.every((c) => names.includes(c._children.Parts[DRAWING_KEY])), `${rel}: every reference names a drawing in the table`);
    assert.deepEqual(Object.keys(doc).slice(Object.keys(doc).indexOf('controls'), Object.keys(doc).indexOf('controls') + 2),
      ['controls', 'drawings'], `${rel}: the table sits right after the controls that refer to it`);

    const reopened = deserializePanel(text, rel, null);
    assert.equal(JSON.stringify(reopened.controls), JSON.stringify(panel.controls), `${rel}: the controls are the ones the panel had`);
    assert.equal('drawings' in reopened, false, `${rel}: the table is the file's, not the panel's`);
    assert.equal(serializePanel(reopened), text, `${rel}: and saving again writes the same file`);
  }
});

test('controls opened with a shared drawing hold it frozen, and an edit to one reaches no other', () => {
  const reopened = deserializePanel(serializePanel(open(GAIA)), GAIA, null);
  const doc = JSON.parse(serializePanel(reopened));
  const name = Object.keys(doc.drawings)[0];
  const ids = [...everyControl(doc.controls)].filter((c) => c._children.Parts?.[DRAWING_KEY] === name).map((c) => c._children.Core.id);
  assert.ok(ids.length >= 2, `drawing ${name} is shared by ${ids.length} controls`);
  const [first, second] = ids.map((id) => [...everyControl(reopened.controls)].find((c) => c._children.Core.id === id));
  const [part] = Object.keys(first._children.Parts._children);
  // Equal parts are one object once loaded (expandControls in documentShape.js), and frozen: a
  // write into it in place throws instead of changing every control that has the drawing.
  assert.equal(first._children.Parts._children[part], second._children.Parts._children[part]);
  assert.throws(() => { first._children.Parts._children[part].name = 'changed in one'; }, TypeError);
  // The editor's write path copies what it walks, so the edit lands in one control.
  const { control } = setNestedValueShared(first, `Parts.${part}.name`, 'changed in one');
  assert.equal(control._children.Parts._children[part].name, 'changed in one');
  assert.notEqual(second._children.Parts._children[part].name, 'changed in one', 'an edit to one control reaches no other');
});

test('a drawing is named after what it is, so adding one elsewhere renames nothing', () => {
  const before = shareDrawings([drawn('a', 'x'), drawn('b', 'x'), drawn('c', 'y'), drawn('d', 'y')]);
  const after = shareDrawings([drawn('n', 'new'), drawn('m', 'new'), drawn('a', 'x'), drawn('b', 'x'), drawn('c', 'y'), drawn('d', 'y')]);
  assert.deepEqual(Object.keys(before.drawings), Object.keys(after.drawings).slice(1));
  assert.match(Object.keys(before.drawings)[0], /^[0-9a-f]{8}$/);
});

test('a drawing used once, or a small one, stays in its control', () => {
  assert.equal(shareDrawings([drawn('a', 'x'), drawn('b', 'y')]).drawings, null, 'used once each');
  assert.equal(shareDrawings([drawn('a', 'x', 10), drawn('b', 'x', 10)]).drawings, null, 'too small to be worth a reference');
  const input = [drawn('a', 'x'), drawn('b', 'x')];
  const copy = deepClone(input);
  shareDrawings(input);
  assert.deepEqual(input, copy, 'and the controls handed in are not changed');
});

test("a container's children share drawings with everything else", () => {
  const box = { _type: 'Control', _children: { Core: { id: 'box', controlType: 'Container' },
    Children: { _children: { inner: drawn('inner', 'x'), _removed: ['old'] } } } };
  const { controls, drawings } = shareDrawings([drawn('a', 'x'), box]);
  const [name] = Object.keys(drawings);
  assert.equal(controls[1]._children.Children._children.inner._children.Parts[DRAWING_KEY], name);
  assert.deepEqual(controls[1]._children.Children._children._removed, ['old'], 'a deletion in the child map is left as it is');
  const back = resolveDrawings({ controls, drawings }).doc;
  assert.deepEqual(back.controls, [drawn('a', 'x'), box]);
});

test('keys a reference carries of its own (what an older CEditor writes) go over the drawing', () => {
  const [name, drawing] = Object.entries(shareDrawings([drawn('a', 'x'), drawn('b', 'x')]).drawings)[0];
  const added = { _type: 'Part', name: 'badge', _children: { Layout: { x: 9 } } };
  const doc = { controls: [{ _type: 'Control', _children: { Core: { id: 'c', controlType: 'CustomComponent' },
    Parts: { [DRAWING_KEY]: name, _children: { badge: added } } } }], drawings: { [name]: drawing } };
  const parts = resolveDrawings(doc).doc.controls[0]._children.Parts;
  assert.deepEqual(Object.keys(parts._children), ['cap', 'badge']);
  assert.equal(parts[DRAWING_KEY], undefined);
});

test('a control naming a drawing the file lacks opens without it, and the person is told', () => {
  const doc = JSON.parse(serializePanel(open(GAIA)));
  delete doc.drawings[Object.keys(doc.drawings)[0]];
  const panel = deserializePanel(JSON.stringify(doc), 'broken.cepanel', null);
  assert.ok(panel, 'it still opens');
  assert.ok(panelOpenReport().warnings.some((w) => /drawing the file does not contain/.test(w)), panelOpenReport().warnings.join(' | '));
});

test('a document without drawings is handed back as it was', () => {
  const doc = { controls: [drawn('a', 'x')] };
  assert.equal(resolveDrawings(doc).doc, doc);
});

test('the format number moves, so an older CEditor says a newer one wrote the file', () => {
  // 3 brought the table; 4 (documentEntries.js) is later still, and a reader of either needs it.
  assert.ok(PANEL_FORMAT_VERSION >= 3);
  assert.equal(JSON.parse(serializePanel(open('CE/qa/QA-08-export.cepanel'))).formatVersion, PANEL_FORMAT_VERSION);
});

test('a document from a newer CEditor keeps its drawings table: what this build did not put back is written back', () => {
  // The loader's promise to a newer document is that what this build does not understand survives a
  // save (utils/panelFormat.js). Its table may hold such a thing: here, an entry no control names.
  const doc = JSON.parse(serializePanel(open(GAIA)));
  doc.formatVersion = 99;
  const unknown = { _children: { later: { _type: 'Part', name: 'later', _children: { Text: { content: 'from a newer build' } } } } };
  doc.drawings.ffffffff = unknown;
  const panel = deserializePanel(JSON.stringify(doc), 'newer.cepanel', null);
  assert.ok(panelOpenReport().warnings.some((w) => /newer CEditor/.test(w)), 'it opens with the newer-version warning');
  const [name] = Object.keys(doc.drawings);
  const user = [...everyControl(doc.controls)].find((c) => c._children.Parts?.[DRAWING_KEY] === name);
  const opened = [...everyControl(panel.controls)].find((c) => c._children.Core.id === user._children.Core.id);
  assert.ok(Object.keys(opened._children.Parts._children ?? {}).length, 'the drawings this build understands are drawn');

  const saved = JSON.parse(serializePanel(panel));
  assert.equal(saved.formatVersion, 99);
  assert.deepEqual(saved.drawings.ffffffff, unknown, 'the entry no control names is written back');
  for (const kept of Object.keys(doc.drawings)) assert.ok(kept in saved.drawings, `drawing ${kept} is still in the table`);
});

test('opening puts the table\'s own drawing in each control, and a migration still gets a copy each', () => {
  // resolveDrawings copies per control unless asked not to; readPanelDocument asks not to, because
  // expandControls shares what two controls hold anyway (copying 15 drawings into GAIA's controls
  // was 28 ms of opening it). What made the copy necessary was a migration writing into one
  // control's part in place: migratePanelDocument works on a deepClone, which keeps two references
  // to one object as two objects, so a step still reaches one control only.
  const { drawings, controls } = shareDrawings([drawn('a', 'x'), drawn('b', 'x')]);
  assert.ok(drawings, 'the two controls share a drawing');
  const doc = { formatVersion: PANEL_FORMAT_VERSION, controls, drawings };
  const shared = resolveDrawings(structuredClone(doc), { copy: false }).doc;
  const [a, b] = shared.controls;
  assert.equal(a._children.Parts._children.cap, b._children.Parts._children.cap, 'one object, not a copy each');
  const copied = resolveDrawings(structuredClone(doc)).doc;
  assert.notEqual(copied.controls[0]._children.Parts._children.cap, copied.controls[1]._children.Parts._children.cap, 'copies by default');

  const migrated = migratePanelDocument({ ...shared, formatVersion: PANEL_FORMAT_VERSION - 1 }, {
    migrations: { [PANEL_FORMAT_VERSION - 1]: (d) => { d.controls[0]._children.Parts._children.cap.name = 'only a'; return d; } },
  }).doc;
  assert.equal(migrated.controls[0]._children.Parts._children.cap.name, 'only a');
  assert.equal(migrated.controls[1]._children.Parts._children.cap.name, 'cap', 'the step reached one control');
});
