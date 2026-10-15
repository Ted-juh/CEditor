import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveExportParameters, collectExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { controlIdForParameter } from '../src/CE_Application/utils/panelValueAccess.js';

function combobox(name, core = {}) {
  return {
    _children: {
      Core: { id: `id_${name}`, name, ...core },
      Behavior: { family: 'select', valueType: 'enum', buttonType: 'combobox' },
      Value: { rows: [{ id: 'a', displayText: 'A' }, { id: 'b', displayText: 'B' }] },
    },
  };
}

function tabs(name, children) {
  return {
    _children: {
      Core: { id: `id_${name}`, name, controlType: 'TabContainer' },
      TabContainer: { pageIndex: 0, pages: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] },
      Children: { _children: Object.fromEntries(children.map((child) => [child._children.Core.id, child])) },
    },
  };
}

test('a control inside a container is exported, after its container', () => {
  // The GAIA panel's envelope faders sit on a tab page. The loop used to read only the top level,
  // so they never reached a DAW while the page selector above them did.
  const panel = { controls: [tabs('view', [combobox('attack'), tabs('inner', [combobox('deep')])])] };
  assert.deepEqual(deriveExportParameters(panel).map((p) => p.id),
    ['view.page', 'attack.value', 'inner.page', 'deep.value']);
});

test('hostAutomation: false keeps a control out of the derived list, nested or not', () => {
  const panel = { controls: [
    combobox('cutoff'),
    combobox('midiChannel', { hostAutomation: false }),
    tabs('system', [combobox('writeProtect', { hostAutomation: false }), combobox('tune')]),
  ] };
  assert.deepEqual(deriveExportParameters(panel).map((p) => p.id), ['cutoff.value', 'system.page', 'tune.value']);
});

test('hostAutomation: false also drops the control from a stored list', () => {
  // A stored list is written once and kept; switching the flag off afterwards must still win,
  // the same way a control that later became a display does.
  const stored = deriveExportParameters({ controls: [combobox('cutoff'), tabs('system', [combobox('tune')])] });
  const panel = {
    controls: [combobox('cutoff'), tabs('system', [combobox('tune', { hostAutomation: false })])],
    exportParameters: stored,
  };
  assert.deepEqual(collectExportParameters(panel).map((p) => p.id), ['cutoff.value', 'system.page']);
});

test('a parameter finds its control inside a container', () => {
  // Snapshots, morph and the Randomizer resolve through this; a top-level scan answered '' and
  // the value was skipped without a word.
  const panel = { controls: [tabs('view', [combobox('attack')])] };
  const [, attack] = deriveExportParameters(panel);
  assert.equal(controlIdForParameter(attack, panel), 'id_attack');
});

test('an explicit list with two entries of one id exports the first: two host parameters with one id is a broken plug-in', () => {
  // QA-08 carries two controls named Cutoff, and its explicit list one Cutoff.value for each. The
  // host keys automation and saved state by id, so a project restored one and left the other at its
  // default (clap-validator's state-reproducibility tests).
  const panel = {
    controls: [],
    exportParameters: [
      { id: 'Cutoff.value', path: 'Cutoff.value', min: 20, max: 20000, defaultValue: 440, unit: 'Hz' },
      { id: 'Cutoff.value', path: 'Cutoff.value', min: 20, max: 20000, defaultValue: 440, unit: '' },
      { id: 'Res.value', path: 'Res.value', min: 0, max: 1 },
    ],
  };
  const params = collectExportParameters(panel);
  assert.deepEqual(params.map((p) => p.id), ['Cutoff.value', 'Res.value']);
  assert.equal(params[0].unit, 'Hz', 'the first one is the one kept');
});
