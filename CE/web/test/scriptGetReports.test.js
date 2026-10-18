// scriptGetReports.test.js — get() says why it has no answer when the script asked for something
// that is not there, in set()'s words, and still returns nothing.
//
// set() always reported a control it could not find and a path that led nowhere. get() returned
// nothing for both, which is also what it returns for a value that is simply unset, so a misspelled
// control or property surfaced wherever that nothing was used. The exported plug-in's engines say
// the same thing through PanelValueModel::whyNoAnswer (PlayerScriptIntegrationTests.cpp).
//
// What must stay quiet is as important: a knob's live value, a custom component's channel nobody
// has written, a property a section's type has, the runtime's own reads, and a watch on a path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost, readWatch, resetScriptStateForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';

// The player's host in miniature: a live value goes through the session (here, nowhere), anything
// else is read from and written to the control.
function withPanel(controls, fn) {
  const panel = { id: 'p', name: 'P', width: 400, height: 300, controls, scripting: { modules: ['ce.core', 'ce.panel'] } };
  setRuntimeHost({
    panel,
    scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => setNestedValue(control, path, value),
  });
  try { return fn(scriptApiForTesting('', 'get-probe'), panel); } finally { setRuntimeHost(null); resetScriptStateForTesting(); }
}

const errorsOf = (fn) => {
  clearScriptTrace();
  const value = fn();
  return { value, errors: get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message) };
};

test('a control that is not there, or a path that leads nowhere on it, is reported and answers nothing', () => {
  withPanel([createControl('Label', { name: 'title' })], (api) => {
    assert.deepEqual(errorsOf(() => api.get('titel.text.content')), {
      value: undefined,
      errors: ['get: control "titel" not found on the active panel, so there is no answer.'],
    });
    // No reading of "Text.contnet" resolves: not a shorthand, not a section, nothing in any section.
    assert.deepEqual(errorsOf(() => api.get('title.contnet')), {
      value: undefined,
      errors: ['get("title.contnet"): "contnet" does not lead anywhere on "title", so there is no answer.'],
    });
    // An explicit section path that names a property the section does not have.
    assert.deepEqual(errorsOf(() => api.get('title.Text.contnet')).errors,
      ['get("title.Text.contnet"): "Text.contnet" does not lead anywhere on "title", so there is no answer.']);
    assert.deepEqual(errorsOf(() => api.get('title.Transform.opcity')).errors,
      ['get("title.Transform.opcity"): "Transform.opcity" does not lead anywhere on "title", so there is no answer.']);
    // …or names a section the control does not have.
    assert.deepEqual(errorsOf(() => api.get('title.Behavior.min')).errors,
      ['get("title.Behavior.min"): "Behavior.min" does not lead anywhere on "title", so there is no answer.']);
    // The second-argument form and the accessor suffix name the path without the accessor.
    assert.deepEqual(errorsOf(() => api.get('title.contnet', 'normalizedValue')).errors,
      ['get("title.contnet"): "contnet" does not lead anywhere on "title", so there is no answer.']);
    // self.get says the same.
    assert.deepEqual(errorsOf(() => api.self.get('nobody.value')).errors,
      ['get: control "nobody" not found on the active panel, so there is no answer.']);
  });
});

test('what is there is answered without a word, set or not', () => {
  const knob = createControl('Knob', { name: 'cutoff' });
  withPanel([createControl('Label', { name: 'title' }), knob], (api) => {
    const quiet = [
      () => api.get('title.text.content'),
      () => api.get('title.Text.content'),
      () => api.get('title.opacity'),
      () => api.get('title.Transform.opacity'),
      () => api.get('title.visible'),
      // A knob's value is live, and lives in the session, not in a Value section it does not have.
      () => api.get('cutoff'),
      () => api.get('cutoff.value'),
      () => api.get('cutoff', 'normalizedValue'),
      // The panel takes any key, so panel.* is not checked.
      () => api.get('panel.nothingHere'),
    ];
    for (const read of quiet) assert.deepEqual(errorsOf(read).errors, [], String(read));
  });
});

test('a property its section type has but the document left out is not a misspelling', () => {
  const label = createControl('Label', { name: 'title' });
  delete label._children.Transform.opacity;
  withPanel([label], (api) => {
    assert.deepEqual(errorsOf(() => api.get('title.Transform.opacity')), { value: undefined, errors: [] });
  });
});

test('the runtime\'s own reads, and the debugger\'s, stay quiet', () => {
  withPanel([createControl('Label', { name: 'title' })], (api) => {
    // watch() on a path that is not there yet, snapshot and restore over names the panel lost, and
    // the watch panel reading whatever was typed into it.
    const { errors } = errorsOf(() => {
      api.watch('ghost.value', () => {});
      api.panelRestore({ ghost: 1 });
      api.panelSnapshot();
      readWatch('ghost.value');
    });
    assert.deepEqual(errors, []);
  });
});
