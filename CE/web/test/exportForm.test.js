// exportForm.test.js — the export payload: controls as a diff, carrying the defaults they are against.
//
// The plug-in's C++ rebuilds each control from `controlDefaults` as it loads (Player/
// PanelValueModel.h). It cannot run createControl, so the table has to be enough on its own, and
// the rebuild has to give back exactly the controls the payload used to carry whole. rebuild() below
// is that algorithm written in JavaScript, from the table alone: the C++ is the same steps, and its
// own tests check it against hand-made documents; this checks the table against real panels.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, exportFormDocument, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { serializePanelForExport } from '../src/CE_Application/stores/panels.js';
import { controlSetForPanel } from '../src/CE_Application/models/controlSets.js';
import { expandControl, shrinkAuthoredParts } from '../src/CE_Application/stores/documentShape.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PANELS = ['CE/panels/Roland GAIA SH-01.cepanel', 'CE/panels/Yamaha AN1x.cepanel',
  ...['01-components', '03-states', '07-packages', '08-export', '09-custom-stress'].map((n) => `CE/qa/QA-${n}.cepanel`)];

const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);
const complete = (panel) => JSON.parse(serializePanelForExport(panel));

// ---- the rebuild, from the carried table alone ------------------------------------------------
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v));

/** A sparse value over its default: the default's keys less `_removed`, the sparse value's keys over them. */
function merge(sparse, base) {
  if (!isObject(sparse) || !isObject(base)) return sparse;
  const out = { ...base };
  for (const key of sparse._removed ?? []) delete out[key];
  for (const [key, value] of Object.entries(sparse)) {
    if (key !== '_removed') out[key] = merge(value, base[key]);
  }
  return out;
}

function rebuildPart(sparse, defaults) {
  if (!isObject(sparse) || !isObject(sparse._children)) return sparse;
  const base = copy(defaults.part);
  for (const [key, section] of Object.entries(sparse._children)) {
    const baseline = defaults.partSections[section?._type];
    if (key !== 'Layout' && baseline) base._children[key] = copy(baseline);
  }
  return merge(sparse, base);
}

/** A drawing the payload carries once, put back into a control and its children (documentDrawings.js). */
function resolve(sparse, drawings) {
  const sections = sparse?._children;
  if (!isObject(sections)) return sparse;
  const out = { ...sparse, _children: { ...sections } };
  const parts = sections.Parts;
  if (isObject(parts) && '_drawing' in parts) {
    const { _drawing: name, ...own } = parts;
    out._children.Parts = isObject(drawings?.[name]) ? merge(own, copy(drawings[name])) : own;
  }
  const kids = sections.Children?._children;
  if (isObject(kids)) {
    out._children.Children = { ...sections.Children, _children: Object.fromEntries(Object.entries(kids)
      .map(([key, child]) => [key, isObject(child) ? resolve(child, drawings) : child])) };
  }
  return out;
}

function rebuild(sparse, defaults) {
  const pristine = defaults.types[sparse?._children?.Core?.controlType];
  const typeParts = new Set(Object.keys(pristine?._children?.Parts?._children ?? {}));
  const control = pristine ? merge(sparse, copy(pristine)) : sparse;
  const parts = control._children?.Parts?._children;
  if (isObject(parts)) {
    for (const [key, part] of Object.entries(parts)) if (!typeParts.has(key)) parts[key] = rebuildPart(part, defaults);
  }
  const kids = control._children?.Children?._children;
  if (pristine && isObject(kids)) {
    for (const [key, child] of Object.entries(kids)) kids[key] = rebuild(child, defaults);
  }
  return control;
}

/** Where two values first differ, as a path, or null. assert.deepEqual on a whole panel builds a
    diff message too large to hold when they do, so this names the place instead. */
function firstDifference(a, b, at = '') {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${at} (length ${a.length} vs ${b.length})`;
    for (let i = 0; i < a.length; i++) { const d = firstDifference(a[i], b[i], `${at}[${i}]`); if (d) return d; }
    return null;
  }
  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(key in a) || !(key in b)) return `${at}.${key} (only in ${key in a ? 'the first' : 'the second'})`;
      const d = firstDifference(a[key], b[key], `${at}.${key}`); if (d) return d;
    }
    return null;
  }
  return `${at} (${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)})`;
}
const same = (a, b, message) => { const d = firstDifference(a, b); assert.equal(d, null, `${message}: first difference at ${d}`); };

/** Every control, containers' children included. */
function* everyControl(controls) {
  for (const control of controls ?? []) {
    yield control;
    yield* everyControl(Object.values(control?._children?.Children?._children ?? {}));
  }
}

// ---- tests ---------------------------------------------------------------------------------------

test('rebuilt from the table it carries, every control is the one the complete form had', () => {
  for (const rel of PANELS) {
    const whole = complete(open(rel));
    const payload = exportFormDocument(whole);
    assert.equal(payload.documentForm, 'export');
    assert.equal(payload.controls.length, whole.controls.length);
    payload.controls.forEach((control, i) => {
      const rebuilt = rebuild(resolve(control, payload.drawings), payload.controlDefaults);
      // The complete form's authored parts travel sparse; compare in that form. Byte for byte, key
      // order included: the C++ finds a property named without its section by taking the first
      // section that has it, so a rebuilt control in another order could answer differently.
      if (JSON.stringify(shrinkAuthoredParts(rebuilt)) !== JSON.stringify(whole.controls[i])) {
        same(shrinkAuthoredParts(rebuilt), whole.controls[i], `${rel}: control ${i} rebuilds differently`);
        assert.fail(`${rel}: control ${i} rebuilds with its keys in another order`);
      }
      // …and the table agrees with the editor's own defaults, part by part included.
      same(rebuilt, expandControl(resolve(control, payload.drawings)), `${rel}: control ${i}, the table and expandControl disagree`);
    });
  }
});

test('made from the complete form, the diff is the one the panel itself gives', () => {
  // The complete form cannot say what an author deleted from a type's defaults (absent is absent),
  // but its controls still lack it, which is what a diff records. So converting the complete form
  // must give the same diff as shrinking the panel's own controls.
  for (const rel of PANELS) {
    const panel = open(rel);
    const direct = JSON.parse(serializePanel(panel, { bakeControlSet: controlSetForPanel(panel), elide: true, captureSession: null }));
    same(exportFormDocument(complete(panel)).controls, direct.controls, `${rel}: the converted diff differs`);
  }
});

test('an item the author deleted stays deleted through the payload', () => {
  const panel = open('CE/qa/QA-03-states.cepanel');
  const target = [...everyControl(panel.controls)].find((c) => Object.keys(c._children.States?._children ?? {}).length > 1);
  assert.ok(target, 'QA-03 has a control with states to delete one of');
  const [gone] = Object.keys(target._children.States._children).slice(-1);
  delete target._children.States._children[gone];
  const payload = exportFormDocument(complete(panel));
  const sparse = [...everyControl(payload.controls)].find((c) => c._children.Core.id === target._children.Core.id);
  assert.ok(sparse._children.States._children._removed?.includes(gone), `the deletion of ${gone} is written down`);
  assert.equal(rebuild(resolve(sparse, payload.drawings), payload.controlDefaults)._children.States._children[gone], undefined, 'and the rebuild leaves it out');
});

test('the payload is the saved size, not the complete one', () => {
  const panel = open('CE/panels/Roland GAIA SH-01.cepanel');
  const whole = JSON.stringify(complete(panel)).length;
  const doc = exportFormDocument(complete(panel));
  const payload = JSON.stringify(doc).length;
  const table = JSON.stringify(doc.controlDefaults).length;
  assert.ok(whole > 10e6, `the complete form is the old size, ${whole} bytes`);
  assert.ok(payload < whole / 6, `the payload is ${payload} bytes against ${whole}`);
  assert.ok(table < 300e3, `the table it carries is small: ${table} bytes`);
  // GAIA's 184 hand-drawn controls are made from a few dozen drawings, and those used more than once
  // travel once (documentDrawings.js).
  const drawings = Object.keys(doc.drawings ?? {}).length;
  assert.ok(drawings >= 10 && drawings < 40, `the drawings its controls share go once: ${drawings} of them`);
});

test('the player page loads the payload as the editor has the panel, deleted items included', () => {
  // The complete form could not say what an author had deleted from a type's defaults, so the page,
  // expanding it, gave it back: GAIA's gaia_tab_295 had both of a custom component's default value
  // channels deleted, the editor showed none, the plug-in's C++ read none, and the page with the
  // window open had both again. The payload's diff says `_removed`, and the page keeps them gone.
  const rel = 'CE/panels/Roland GAIA SH-01.cepanel';
  const panel = open(rel);
  const whole = complete(panel);
  const page = (doc) => deserializePanel(JSON.stringify(doc), rel, null);
  const fromPayload = page(exportFormDocument(whole));
  assert.equal('controlDefaults' in fromPayload, false, 'the table is for the C++, and is dropped on load');
  const channels = (p) => Object.keys([...everyControl(p.controls)]
    .find((c) => c._children.Core.id === 'gaia_tab_295')._children.ValueChannels?._children ?? {});
  assert.deepEqual(channels(panel), [], 'the author deleted both');
  assert.deepEqual(channels(fromPayload), [], 'and the page, from the payload, has neither');
  assert.deepEqual(channels(page(whole)), ['mainValue', 'mode'], 'where the complete form brought both back');
  // Otherwise the page builds what it built before, control for control.
  const before = page(whole).controls.length;
  assert.equal(fromPayload.controls.length, before);
});

test('a document already in the export form is left as it is, and anything but the complete form refused', () => {
  const payload = exportFormDocument(complete(open('CE/qa/QA-08-export.cepanel')));
  assert.equal(exportFormDocument(payload), payload);
  assert.throws(() => exportFormDocument(JSON.parse(readText(path.join(REPO, 'CE/qa/QA-08-export.cepanel')))),
    /complete document/, 'a saved document is a diff already, and converting it again would be nonsense');
});
