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

/* ------------------------------------------------- an explicit form that is not one of the three */
// get(path, form) and set(path, value, form) take the value form as an argument as well as a path
// suffix. One that was not value, normalizedValue or midiValue was dropped without a word, so
// get("cutoff", "normalisedValue"), spelled as this codebase spells colour, answered the raw value,
// and set("cutoff", 0.5, "normalisedValue") wrote 0.5 into a 0..200 control. Both refuse it now, and
// name the form meant when the text is one written another way. The exported plug-in says the same
// words (BridgeScriptHost::formRefusal; PlayerScriptIntegrationTests.cpp holds them to these).

const FORMS = 'The forms are value, normalizedValue and midiValue.';

function rangedControl(value) {
  return { _type: 'Control', _children: {
    Core: { _type: 'Core', id: 'c1', name: 'cutoff' },
    Behavior: { _type: 'Behavior', family: 'range', role: 'knob', min: 0, max: 200 },
    Value: { _type: 'Value', value },
  } };
}

test('a form that is not one refuses get and set, and names the form meant', () => {
  withPanel([rangedControl(100)], (api, panel) => {
    const value = () => panel.controls[0]._children.Value.value;
    assert.deepEqual(errorsOf(() => api.get('cutoff', 'normalisedValue')), {
      value: undefined,
      errors: [`get("cutoff"): "normalisedValue" is not a value form, so there is no answer. ${FORMS} Write normalizedValue.`],
    });
    assert.deepEqual(errorsOf(() => api.set('cutoff', 0.5, 'normalisedValue')).errors,
      [`set("cutoff"): "normalisedValue" is not a value form, so nothing was set. ${FORMS} Write normalizedValue.`]);
    assert.equal(value(), 100, 'nothing was written');

    // A form written another way: the label's leading dot, "normalise" and "normalize". Other capitals
    // are the form itself now (a word from a list is read in any case), and are not refused.
    for (const [given, meant] of [['.normalizedValue', 'normalizedValue'],
      ['normaliseValue', 'normalizedValue'], ['normalizeValue', 'normalizedValue'], ['.MIDIValue', 'midiValue']]) {
      assert.deepEqual(errorsOf(() => api.get('cutoff', given)).errors,
        [`get("cutoff"): "${given}" is not a value form, so there is no answer. ${FORMS} Write ${meant}.`], given);
    }
    // Text that is no form at all is named, with the forms, and no guess.
    assert.deepEqual(errorsOf(() => api.set('cutoff', 50, 'percent')).errors,
      [`set("cutoff"): "percent" is not a value form, so nothing was set. ${FORMS}`]);
    // The explicit form wins over a suffix, so a wrong one refuses even beside a right suffix.
    assert.deepEqual(errorsOf(() => api.get('cutoff.normalizedValue', 'raw')).errors,
      [`get("cutoff.normalizedValue"): "raw" is not a value form, so there is no answer. ${FORMS}`]);
    // self says the same.
    assert.deepEqual(errorsOf(() => api.self.get('cutoff', 'normalisedvalue')).errors,
      [`get("cutoff"): "normalisedvalue" is not a value form, so there is no answer. ${FORMS} Write normalizedValue.`]);
    assert.deepEqual(errorsOf(() => api.self.set('cutoff', 1, 'Normalized')).errors,
      [`set("cutoff"): "Normalized" is not a value form, so nothing was set. ${FORMS}`]);
    assert.equal(value(), 100, 'nothing was written');
    for (const given of ['NormalizedValue', ' MIDIValue ', 'Value']) {
      assert.deepEqual(errorsOf(() => api.get('cutoff', given)).errors.filter((e) => /not a value form/.test(e)), [], given);
    }
    assert.equal(api.get('cutoff', 'NormalizedValue'), 0.5);
    assert.equal(api.get('cutoff.NORMALIZEDVALUE'), 0.5, 'and as the path\'s suffix');
  });
});

// The sequence PlayerScriptIntegrationTests.cpp runs in the exported plug-in's Lua and JavaScript,
// by a panel script whose `self` is the control, with the lines it expects: the same, word for word.
test('the plug-in\'s sequence gives the same lines here', () => {
  withPanel([rangedControl(100)], () => {
    const api = scriptApiForTesting('cutoff', 'form-probe');
    clearScriptTrace();
    const lines = [];
    const say = (text) => lines.push(text);
    const shown = (v) => (v === undefined || v === null ? 'nothing' : String(v));
    say(`a ${shown(api.get('cutoff', 'normalisedValue'))}`);
    api.set('cutoff', 0.5, 'normalisedValue');
    say(`b ${shown(api.get('cutoff'))}`);
    say(`c ${shown(api.get('cutoff', 'NormalizedValue'))}`);
    api.set('cutoff', 50, 'percent');
    api.self.set('value', 1, 'Normalized');
    say(`d ${shown(api.self.get('value', '.normalizedValue'))}`);
    say(`e ${shown(api.get('cutoff'))}`);
    api.set('cutoff', 0.25, 'normalizedValue');
    say(`f ${shown(api.get('cutoff'))}`);
    api.self.set('value', 0.75, 'normalizedValue');
    say(`g ${shown(api.get('cutoff', 'normalizedValue'))}`);
    api.set('cutoff', 120, { transmit: false });
    say(`h ${shown(api.get('cutoff', { transmit: false }))}`);
    // c: a form in any case is that form; "NormalizedValue" was refused with "Write normalizedValue".
    assert.deepEqual(lines, ['a nothing', 'b 100', 'c 0.5', 'd nothing', 'e 100', 'f 50', 'g 0.75', 'h 120']);
    assert.deepEqual(get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message), [
      `get("cutoff"): "normalisedValue" is not a value form, so there is no answer. ${FORMS} Write normalizedValue.`,
      `set("cutoff"): "normalisedValue" is not a value form, so nothing was set. ${FORMS} Write normalizedValue.`,
      `set("cutoff"): "percent" is not a value form, so nothing was set. ${FORMS}`,
      `set("cutoff.value"): "Normalized" is not a value form, so nothing was set. ${FORMS}`,
      `get("cutoff.value"): ".normalizedValue" is not a value form, so there is no answer. ${FORMS} Write normalizedValue.`,
    ]);
  });
});

test('the forms spelled right, set\'s options, and what is not text, work as they did', () => {
  withPanel([rangedControl(100)], (api, panel) => {
    const value = () => panel.controls[0]._children.Value.value;
    assert.deepEqual(errorsOf(() => api.get('cutoff', 'normalizedValue')), { value: 0.5, errors: [] });
    assert.deepEqual(errorsOf(() => api.get('cutoff', 'value')), { value: 100, errors: [] });
    assert.deepEqual(errorsOf(() => api.set('cutoff', 0.25, 'normalizedValue')).errors, []);
    assert.equal(value(), 50);
    // An empty form is no form, as it always was.
    assert.deepEqual(errorsOf(() => api.get('cutoff', '')), { value: 50, errors: [] });
    // set's third argument may be its options table instead of a form.
    assert.deepEqual(errorsOf(() => api.set('cutoff', 120, { transmit: false })).errors, []);
    assert.equal(value(), 120);
    // get takes no options; a table where its form goes is not a form, and is passed by as before.
    assert.deepEqual(errorsOf(() => api.get('cutoff', { transmit: false })), { value: 120, errors: [] });
  });
});
