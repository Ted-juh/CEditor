// documentEntries.test.js — the entries of a control's lists, written as what they change.
//
// documentEntries.js writes six lists' entries as diffs against fixed baselines in a saved document,
// and readPanelDocument puts the defaults back. What has to hold: an entry reads back as it was,
// whatever it held or lacked; only those entries are touched; only a saved document of format 4 or
// later is read this way; the plug-in's payload is written this way too, carrying its baselines,
// and read from what it carries; and it is worth it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, exportFormDocument, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { serializePanelForExport } from '../src/CE_Application/stores/panels.js';
import {
  ENTRY_BASELINES, ENTRY_DIFF_FORMAT, restoreDocumentEntries, restoreEntries, shrinkEntries,
} from '../src/CE_Application/stores/documentEntries.js';
import { expandControl, shrinkControl } from '../src/CE_Application/stores/documentShape.js';
import { panelDocumentText } from '../src/CE_Application/stores/documentLayout.js';
import { PANEL_FORMAT_VERSION, readPanelDocument } from '../src/CE_Application/utils/panelFormat.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PANELS = [
  'CE/panels/Roland GAIA SH-01.cepanel',
  'CE/panels/Yamaha AN1x.cepanel',
  'CE/panels/Roland SH-201.cepanel',
  'CE/qa/QA-06-roland-gaia.cepanel',
  'CE/qa/QA-08-export.cepanel',
  'CE/qa/QA-09-custom-stress.cepanel',
];
const json = (value) => JSON.parse(JSON.stringify(value));
const throughFile = (control) => restoreEntries(json(shrinkEntries(control)));

/** A document-form control holding one of each list, children included. */
function listsControl(id, overrides = {}) {
  return {
    _type: 'Control',
    _children: {
      Core: { id, controlType: 'CustomComponent' },
      Bindings: { _children: { led: { ...ENTRY_BASELINES.Bindings, name: 'led', mapMode: 'enum', enumMap: { 0: 'FF000000' } } } },
      HitZones: { _children: { grab: { ...ENTRY_BASELINES.HitZones, name: 'grab', bounds: { ...ENTRY_BASELINES.HitZones.bounds, width: 50 } } } },
      ValueChannels: { _children: { value: { ...ENTRY_BASELINES.ValueChannels, name: 'value', type: 'int', max: 127, step: 1 } } },
      Behaviors: { _children: { drive: { ...ENTRY_BASELINES.Behaviors, name: 'drive', role: 'knob' } } },
      DeviceBindings: { bindings: [{ ...ENTRY_BASELINES.DeviceBindings, parameterId: 'cutoff', parameterType: 'integer' }] },
      Value: { rows: [{ ...ENTRY_BASELINES.Value, id: 'a', displayText: 'A', internalValue: 'a', sendValue: 0, receiveValue: 0 }] },
      ...overrides,
    },
  };
}

test('each list entry comes back from the file as it went in', () => {
  const control = listsControl('k');
  assert.deepEqual(throughFile(control), json(control));
  // Written as what it changes, nothing more.
  const written = shrinkEntries(control)._children;
  assert.deepEqual(written.Bindings._children.led, { _type: 'Binding', name: 'led', mapMode: 'enum', enumMap: { 0: 'FF000000' } });
  assert.deepEqual(written.HitZones._children.grab, { _type: 'HitZone', name: 'grab', bounds: { width: 50 } });
  assert.deepEqual(written.Value.rows[0], { id: 'a', displayText: 'A', internalValue: 'a', sendValue: 0, receiveValue: 0 });
  assert.deepEqual(written.DeviceBindings.bindings[0], { parameterId: 'cutoff', parameterType: 'integer' });
});

test('an entry the same as its baseline is written as nothing but what marks it', () => {
  const control = listsControl('k', {
    Bindings: { _children: { plain: { ...ENTRY_BASELINES.Bindings } } },
    Value: { rows: [{ ...ENTRY_BASELINES.Value }] },
  });
  const written = shrinkEntries(control)._children;
  assert.deepEqual(written.Bindings._children.plain, { _type: 'Binding' });
  assert.deepEqual(written.Value.rows[0], {});
  assert.deepEqual(throughFile(control), json(control));
});

test('a field an entry lacks stays lacking, and one it adds stays added', () => {
  // A device binding a script makes (panelRuntime.js) has four fields, not the baseline's eight; a
  // row may carry a Listbox's extras. Neither may come back as anything else.
  const control = listsControl('k', {
    DeviceBindings: { bindings: [{ kind: 'deviceParameter', port: 'value', parameterId: 'x', deviceRole: 'synth' }] },
    Value: { rows: [{ id: 'h', displayText: 'Header', isHeader: true, badge: 'A' }] },
    ValueChannels: { _children: { notes: { _type: 'ValueChannel', name: 'notes', type: 'array', size: 4, items: [0, 0, 0, 0] } } },
  });
  const written = shrinkEntries(control)._children;
  assert.deepEqual(written.DeviceBindings.bindings[0]._removed, ['parameterType', 'adoptMetadata', 'dryRun', 'feedback']);
  const back = throughFile(control)._children;
  assert.deepEqual(back.DeviceBindings.bindings[0], control._children.DeviceBindings.bindings[0]);
  assert.deepEqual(back.Value.rows[0], control._children.Value.rows[0]);
  assert.deepEqual(back.ValueChannels._children.notes, control._children.ValueChannels._children.notes);
  // Inside a nested object as well: a feedback block without its echo window keeps going without one.
  const partial = listsControl('k', { DeviceBindings: { bindings: [{ ...ENTRY_BASELINES.DeviceBindings, feedback: { receiveUpdates: false } }] } });
  assert.deepEqual(throughFile(partial), json(partial));
});

test('a field holding undefined is read back absent, as a whole entry was', () => {
  const control = listsControl('k', { HitZones: { _children: { grab: { ...ENTRY_BASELINES.HitZones, name: 'grab', cursor: undefined } } } });
  const back = throughFile(control)._children.HitZones._children.grab;
  assert.equal(Object.hasOwn(back, 'cursor'), false, 'the baseline cursor came back in place of none');
});

test('only whole entries of the listed kinds are touched', () => {
  const foreign = { _type: 'Something', name: 'x', enabled: true };
  const untyped = { name: 'y', enabled: true, mapMode: 'range' };
  const control = listsControl('k', {
    Bindings: { _children: { foreign, untyped, _removed: ['old'] } },
    Text: { _children: { Fill: { colour: 'FF000000' } } },
  });
  const written = shrinkEntries(control);
  assert.deepEqual(written._children.Bindings._children, { foreign, untyped, _removed: ['old'] });
  assert.equal(written._children.Text, control._children.Text);
});

test('an entry the type itself has is a diff against that entry already, and is left alone', () => {
  // A custom component starts with a mainValue channel. One that changed it and added another:
  // the first is written by documentShape's diff, the second by this one.
  const control = createControl('CustomComponent');
  control._children.Core.id = 'cc';
  control._children.ValueChannels._children.mainValue.max = 5;
  control._children.ValueChannels._children.extra = createValueChannel('extra', { type: 'int', max: 127, step: 1 });
  const sparse = shrinkControl(control);
  const written = shrinkEntries(sparse);
  assert.deepEqual(written._children.ValueChannels._children.mainValue, sparse._children.ValueChannels._children.mainValue);
  assert.equal(written._children.ValueChannels._children.extra._type, 'ValueChannel');
  assert.ok(JSON.stringify(written).length < JSON.stringify(sparse).length);
  assert.deepEqual(json(expandControl(restoreEntries(json(written)))), json(control));
});

test('a nested control\'s lists are written the same way', () => {
  const child = listsControl('child');
  const parent = listsControl('parent', { Children: { _children: { child, _removed: ['gone'] } } });
  const written = shrinkEntries(parent)._children.Children._children;
  assert.deepEqual(written.child._children.HitZones._children.grab, { _type: 'HitZone', name: 'grab', bounds: { width: 50 } });
  assert.deepEqual(written._removed, ['gone']);
  assert.deepEqual(throughFile(parent), json(parent));
});

test('only a saved document of format 4 or later has its defaults put back', () => {
  // A version-3 entry missing a field means whatever its reader makes of the absence. Filling in the
  // baseline's would change it.
  const sparseRow = { id: 'a', displayText: 'A' };
  const doc = (formatVersion, extra = {}) => ({ formatVersion, ...extra, controls: [listsControl('k', { Value: { rows: [sparseRow] } })] });
  assert.equal(ENTRY_DIFF_FORMAT, 4);
  assert.ok(PANEL_FORMAT_VERSION >= ENTRY_DIFF_FORMAT);
  const rowOf = (d) => d.controls[0]._children.Value.rows[0];
  assert.deepEqual(rowOf(restoreDocumentEntries(doc(3), 3)), sparseRow);
  assert.deepEqual(rowOf(restoreDocumentEntries(doc(4, { documentForm: 'complete' }), 4)), sparseRow);
  assert.deepEqual(rowOf(restoreDocumentEntries(doc(4, { documentForm: 'export' }), 4)), sparseRow);
  assert.equal(rowOf(restoreDocumentEntries(doc(4), 4)).enabled, true);
  assert.equal(rowOf(restoreDocumentEntries(doc(5), 5)).enabled, true, 'a newer document is read as well as this build can');
  // And through the loader.
  assert.equal(rowOf(readPanelDocument(JSON.stringify(doc(3))).doc).enabled, undefined);
  assert.equal(rowOf(readPanelDocument(JSON.stringify(doc(4))).doc).enabled, true);
});

test('every panel in the tree opens to the controls its entries written whole would give', () => {
  // The committed panels are format 4. With their entries put back and stamped 3, each is the file
  // the previous format wrote; both have to open to the same panel.
  for (const rel of PANELS) {
    const text = readText(path.join(REPO, rel));
    const doc = JSON.parse(text);
    assert.equal(doc.formatVersion, PANEL_FORMAT_VERSION, `${rel} is not regenerated`);
    const whole = { ...restoreDocumentEntries(doc, doc.formatVersion), formatVersion: 3 };
    const before = deserializePanel(JSON.stringify(whole), rel, null);
    const after = deserializePanel(text, rel, null);
    assert.deepEqual(json(after.controls), json(before.controls), rel);
    // Read and saved again, the same text.
    const saved = serializePanel(after);
    assert.equal(serializePanel(deserializePanel(saved, rel, null)), saved, `${rel}: a second save differs from the first`);
  }
});

test('the plug-in\'s payload writes its entries the same way, and carries the baselines it used', () => {
  const panel = deserializePanel(readText(path.join(REPO, 'CE/panels/Roland GAIA SH-01.cepanel')), 'gaia.cepanel', null);
  const payload = exportFormDocument(JSON.parse(serializePanelForExport(panel)));
  // The very diff a saved document writes (exportForm.test.js compares the whole of it).
  let zones = 0;
  const visit = (control) => {
    for (const zone of Object.values(control?._children?.HitZones?._children ?? {})) {
      if (zone?._type !== 'HitZone') continue;
      zones += 1;
      assert.ok(!Object.hasOwn(zone, 'enabled') || zone.enabled !== ENTRY_BASELINES.HitZones.enabled, 'a payload grab area carries a default');
    }
    for (const child of Object.values(control?._children?.Children?._children ?? {})) if (child?._children) visit(child);
  };
  payload.controls.forEach(visit);
  assert.ok(zones > 100, `only ${zones} grab areas found`);
  // Only the baselines some entry was written against, each as it is here, in this order.
  const carried = payload.controlDefaults.entries;
  assert.deepEqual(Object.keys(carried), Object.keys(ENTRY_BASELINES).filter((section) => section in carried));
  assert.ok('HitZones' in carried && 'ValueChannels' in carried, `GAIA uses grab areas and channels: ${Object.keys(carried)}`);
  for (const [section, base] of Object.entries(carried)) assert.deepEqual(base, json(ENTRY_BASELINES[section]), section);
  // A payload with no entries in any list still says how they would be written.
  const bare = exportFormDocument({ documentForm: 'complete', controls: [] });
  assert.deepEqual(bare.controlDefaults.entries, {});
});

test('a payload is read against the baselines it carries, and one that carries none as it is', () => {
  // The C++ does the same (Player/PanelValueModel.h, restoreEntries): what a payload was written
  // against travels with it, so a reader of another build reads it as it was written.
  const row = { id: 'a', displayText: 'A' };
  const payload = (controlDefaults) => ({ formatVersion: 4, documentForm: 'export', controlDefaults, controls: [listsControl('k', {
    Value: { rows: [row] },
    HitZones: { _children: { grab: { _type: 'HitZone', name: 'grab' }, inherited: { cursor: 'move' }, _removed: ['main'] } },
  })] });
  const rowOf = (d) => d.controls[0]._children.Value.rows[0];
  const zonesOf = (d) => d.controls[0]._children.HitZones._children;

  const carried = { Value: { ...json(ENTRY_BASELINES.Value), enabled: false }, HitZones: json(ENTRY_BASELINES.HitZones) };
  const read = restoreDocumentEntries(payload({ entries: carried }), 4);
  assert.equal(rowOf(read).enabled, false, 'the carried baseline, not this build\'s');
  assert.deepEqual(Object.keys(rowOf(read)), Object.keys(ENTRY_BASELINES.Value), 'in the baseline\'s order');
  assert.equal(zonesOf(read).grab.cursor, 'pointer', 'a whole grab area has its defaults back');
  assert.deepEqual(zonesOf(read).inherited, { cursor: 'move' }, 'one without the baseline\'s _type is a diff against its type\'s own, and left to expandControl');
  assert.deepEqual(zonesOf(read)._removed, ['main']);
  assert.deepEqual(read.controls[0]._children.Bindings, payload({}).controls[0]._children.Bindings, 'a list the payload has no baseline for is left as it came');

  const untyped = restoreDocumentEntries(payload({ entries: { HitZones: { ...carried.HitZones, _type: undefined } } }), 4);
  assert.deepEqual(zonesOf(untyped).grab, { _type: 'HitZone', name: 'grab' }, 'a baseline without a _type marks no entry whole');

  const old = payload({ types: {} });
  assert.equal(restoreDocumentEntries(old, 4), old, 'a payload from before payloads carried baselines is whole already');
  // And through the loader the player page uses.
  assert.equal(rowOf(readPanelDocument(JSON.stringify(payload({ entries: carried }))).doc).enabled, false);
  assert.deepEqual(rowOf(readPanelDocument(JSON.stringify(old)).doc), row);
});

test('the point of it: the saved GAIA and AN1x are a good deal smaller', () => {
  for (const [rel, atMost] of [['CE/panels/Roland GAIA SH-01.cepanel', 0.9], ['CE/panels/Yamaha AN1x.cepanel', 0.8]]) {
    const text = readText(path.join(REPO, rel));
    const doc = JSON.parse(text);
    const whole = `${panelDocumentText({ ...restoreDocumentEntries(doc, doc.formatVersion), formatVersion: 3 })}\n`;
    assert.ok(text.length <= whole.length * atMost, `${rel}: ${text.length} bytes against ${whole.length} with its entries whole`);
  }
});

test('the baselines are part of the format and do not move', () => {
  // Every format-4 file reads through these. A change to one is a new format version, with a
  // migration that writes the old values into the old documents; a change to the functions that
  // make a new entry is not a reason to change them.
  assert.deepEqual(json(ENTRY_BASELINES), {
    Bindings: { _type: 'Binding', name: '', enabled: true, source: 'value.normalized', mapMode: 'range', target: '', outputUnit: 'percent', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 100, falseValue: 0, trueValue: 100, enumMap: {}, clamp: true, round: false, invert: false },
    HitZones: { _type: 'HitZone', name: '', shape: 'rectangle', enabled: true, visibleInEditor: true, priority: 0, cursor: 'pointer', targetBehavior: 'mainSlider', targetValueChannel: 'mainValue', targetValueChannelX: '', targetValueChannelY: '', action: 'dragValue', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' }, source: 'independent', inflate: { x: 0, y: 0, unit: 'px' }, minTouch: 0, condition: '', meta: {} },
    ValueChannels: { _type: 'ValueChannel', name: '', label: '', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0, currentValue: 0, publicInput: true, publicOutput: true, deviceBindable: true, format: { precision: 2, prefix: '', suffix: '', unit: '' }, snap: { enabled: true, mode: 'step' }, curve: { mode: 'linear', deadZone: 0, hysteresis: 0 }, constraints: { enabled: true, normalizedMin: 0, normalizedMax: 1 } },
    Behaviors: { _type: 'BehaviorModule', name: '', type: 'slider', role: 'custom', enabled: true, valueChannel: 'mainValue', valueChannels: ['mainValue'], geometry: 'linear', dragMode: 'auto', reverseMouseDirection: false, interaction: { pointer: true, keyboard: true, wheel: false, snap: true } },
    DeviceBindings: { kind: 'deviceParameter', port: 'value', deviceRole: 'mainSynth', parameterId: '', parameterType: '', adoptMetadata: true, dryRun: false, feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 } },
    Value: { id: '', displayText: '', internalValue: '', sendValue: '', receiveValue: '', selectedByDefault: false, enabled: true, visualOverrides: {} },
  });
  assert.ok(Object.isFrozen(ENTRY_BASELINES.HitZones.bounds));
});
