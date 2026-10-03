// designedGraphite.test.js — new panels start on a designed Graphite; every document that names no
// set stays on Graphite Classic, exactly as it was (models/controlSets.js).
//
// Graphite was the least designed set on purpose: it is the base set, the look of every document
// from before sets, so it takes none of the designs. That also made it the look of every new panel.
// These pin the split: the base set is untouched and still unnamed in a file, a new panel names the
// designed one, and the designed one is Graphite with the forms its starter already drew with.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_CONTROL_SET, DEFAULT_CONTROL_SET_ID, NEW_PANEL_CONTROL_SET_ID, getControlSet, normalizeControlSet, resolveToken, serializeControlSet,
} from '../src/CE_Application/models/controlSets.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { labelTreatmentFor } from '../src/CE_Application/models/labelDesigns.js';
import { sectionTreatmentFor } from '../src/CE_Application/models/sectionDesigns.js';
import { displayTreatmentFor } from '../src/CE_Application/models/displayDesigns.js';
import { grammarFor } from '../src/CE_Application/models/designGrammar.js';
import { DERIVED_ROLES } from '../src/CE_Application/models/personalSetDesigns.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { DEFAULT_GENERAL_SETTINGS, defaultControlSetId } from '../src/CE_Application/stores/runtimePreferences.js';
import { normalizeGeneralSettings } from '../src/CE_Application/stores/appSettingsSchema.js';
import { createPanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const classic = getControlSet('graphite');
const designed = getControlSet(NEW_PANEL_CONTROL_SET_ID);
const form = (type, set) => resolveControlForSet(createControl(type), set)._children.Core.controlForm || '';

test('Graphite Classic is still the base set, takes no designs, and a file never names it', () => {
  assert.equal(DEFAULT_CONTROL_SET_ID, 'graphite');
  assert.equal(BASE_CONTROL_SET, classic);
  assert.equal(classic.name, 'Graphite Classic');
  assert.deepEqual(normalizeControlSet(undefined), { id: 'graphite' }, 'a document that names no set is on Classic');
  assert.equal(serializeControlSet({ id: 'graphite' }), null);
  assert.equal(labelTreatmentFor(classic), null);
  assert.equal(sectionTreatmentFor(classic), null);
  assert.equal(displayTreatmentFor(classic), null);
  assert.equal(grammarFor(classic), null);
  assert.deepEqual(Object.keys(classic.families).sort(), ['Button', 'Combobox', 'Knob', 'MomentaryButton', 'Slider', 'ToggleButton'],
    'Classic carries only the families it always had');
  assert.equal(form('Knob', classic), '', 'its knob is the one it always drew');
});

test('a new panel starts on the designed Graphite and its file says so', () => {
  assert.notEqual(NEW_PANEL_CONTROL_SET_ID, DEFAULT_CONTROL_SET_ID);
  assert.ok(designed, 'the new-panel default is a built-in');
  assert.equal(designed.name, 'Graphite');
  assert.equal(DEFAULT_GENERAL_SETTINGS.defaultControlSetId, NEW_PANEL_CONTROL_SET_ID);
  assert.equal(normalizeGeneralSettings({}).defaultControlSetId, NEW_PANEL_CONTROL_SET_ID);
  assert.equal(normalizeGeneralSettings({ defaultControlSetId: '' }).defaultControlSetId, NEW_PANEL_CONTROL_SET_ID);
  assert.equal(normalizeGeneralSettings({ defaultControlSetId: 'graphite' }).defaultControlSetId, 'graphite',
    'a settings file that names Classic keeps it');

  defaultControlSetId.set(DEFAULT_GENERAL_SETTINGS.defaultControlSetId);
  const panel = createPanel();
  assert.deepEqual(panel.controlSet, { id: NEW_PANEL_CONTROL_SET_ID });
  assert.deepEqual(panel.controlSets, [], 'a built-in is named, not carried');
  assert.deepEqual(JSON.parse(serializePanel(panel)).controlSet, { id: NEW_PANEL_CONTROL_SET_ID },
    'the file names it, so it keeps its look whatever the base set is');
});

test('the designed Graphite is Graphite: its colours, lettering, lamp, buttons and slider', () => {
  for (const [name, value] of Object.entries(classic.tokens)) {
    if (name.startsWith('display.') || name === 'panel.surface' || DERIVED_ROLES.includes(name)) continue;
    assert.equal(designed.tokens[name], value, name);
  }
  assert.deepEqual(designed.type, classic.type);
  assert.deepEqual(designed.lamp, classic.lamp);
  assert.deepEqual(designed.families.Slider, classic.families.Slider);
  for (const type of ['Button', 'MomentaryButton', 'ToggleButton', 'TimedButton', 'OneShotButton']) {
    assert.equal(form(type, designed), '', `${type}: Graphite's flat button, its legend on its face`);
  }
});

test('it draws the knob and the meter Graphite\'s starter already drew with', () => {
  const starter = createControlSetStarter('graphite');
  const starterForm = (type) => starter.controls.find((c) => c._children.Core.controlType === type)._children.Core.controlForm;
  for (const type of ['Knob', 'Meter']) {
    assert.ok(starterForm(type), `the starter draws a ${type} form`);
    assert.equal(form(type, designed), starterForm(type), type);
  }
});

test('it takes every design the other sets take, from Graphite\'s own colours', () => {
  assert.ok(labelTreatmentFor(designed), 'labels');
  assert.ok(sectionTreatmentFor(designed), 'sections');
  assert.ok(grammarFor(designed), 'a grammar');
  assert.ok(displayTreatmentFor(designed), 'displays');
  for (const type of ['Macro', 'Turing', 'Keyboard', 'LcdDisplay', 'PixelDisplay', 'Shape']) assert.ok(familyPatchFor(designed, type), type);
  assert.equal(resolveToken('panel.surface', designed), designed.panel.colour, 'its labels sit on its own panel');
  // Its display is in its own blue, and reads.
  assert.equal(resolveToken('display.lit', designed), resolveToken('accent.hot', designed));
  assert.ok(contrast(resolveToken('display.lit', designed), resolveToken('display.screen', designed)) >= 4.5);
});
