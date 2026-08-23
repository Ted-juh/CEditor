// autoPanel.test.js — a whole editor, generated from a device profile.
//
// The adoption case for this feature is that a profile already knows everything: every parameter,
// its range, its choices, its group, and the bytes to send. So the thing worth testing is not that
// controls appear — it is that what appears CARRIES that knowledge. A panel of 793 knobs all
// reading 0.00–1.00 is exactly the failure QA-06 shipped its first draft with, and it looks
// completely finished.
//
// The second theme is silence. A generated panel is the kind of artefact whose gaps have no
// symptom: 793 controls appear, one parameter is missing, and nobody notices until they reach for
// it on the hardware. Everything the generator declines to place has to come back in a list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  AUTO_PANEL_DENSITY,
  FALLBACK_COMPONENT,
  autoPanelPlan,
  componentForParameter,
  profileGroups,
} from '../src/CE_Application/utils/autoPanel.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const loadProfile = (name) =>
  JSON.parse(readFileSync(join(REPO, 'CE/profiles/test', `${name}.ceditor-device.json`), 'utf8'));

const GAIA = loadProfile('roland-gaia-sh01');
const SMALL = loadProfile('roland-gaia-dpd');

const controlsById = (plan) => new Map(plan.controls.map((c) => [c._children.Core.id, c]));
const bindingOf = (control) => control._children.DeviceBindings?.bindings?.[0] ?? null;

// --- what the profile asked for -----------------------------------------------------------------

test('the profile chooses the component, and says so', () => {
  const { type, reason } = componentForParameter({ type: 'integer', ui: { preferredComponent: 'Slider' } });
  assert.equal(type, 'Slider');
  assert.match(reason, /profile asked for it/);
});

test('"ComboBox" and "Combobox" are the same component, because the shipped profiles use both', () => {
  // 72 parameters say Combobox and 53 say ComboBox. Only one of those is a component this build
  // has; refusing the other would put a knob where a dropdown belongs over a capital letter.
  const asked = componentForParameter({ type: 'choice', ui: { preferredComponent: 'ComboBox' } });
  assert.equal(asked.type, 'Combobox');
  assert.match(asked.reason, /profile asked for it/);
});

test('a component this build does not have falls back, and the substitution is named', () => {
  const { type, reason } = componentForParameter({ type: 'integer', ui: { preferredComponent: 'Theremin' } });
  assert.equal(type, 'Knob');
  assert.match(reason, /Theremin/);
});

test('a profile that names no component still gets one', () => {
  for (const [parameterType, expected] of Object.entries(FALLBACK_COMPONENT)) {
    assert.equal(componentForParameter({ type: parameterType }).type, expected, parameterType);
  }
});

test('a parameter type nothing fits is refused rather than guessed at', () => {
  const { type, reason } = componentForParameter({ type: 'quantum-flux' });
  assert.equal(type, null);
  assert.match(reason, /quantum-flux/);
});

test('a radio group with thirty options becomes a dropdown', () => {
  // The editor already warns at eight on a drop. Generating something it would immediately warn
  // about is a strange thing for the editor to build itself.
  const choices = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, value: i }));
  const { type, reason } = componentForParameter({ type: 'choice', choices, ui: { preferredComponent: 'RadioButtonGroup' } });
  assert.equal(type, 'Combobox');
  assert.match(reason, /30 choices/);

  // Eight is still fine — the limit is a limit, not a ban.
  const few = choices.slice(0, 8);
  assert.equal(componentForParameter({ type: 'choice', choices: few, ui: { preferredComponent: 'RadioButtonGroup' } }).type,
    'RadioButtonGroup');
});

// --- what the controls carry ---------------------------------------------------------------------

test('every parameter in a real profile is placed, and none silently', () => {
  const plan = autoPanelPlan(GAIA);
  assert.equal(plan.placed, GAIA.parameters.length, 'a parameter that reaches no control must be listed');
  assert.deepEqual(plan.skipped, []);
});

test('a knob adopts its range, not 0..1 — the failure QA-06 shipped with', () => {
  const plan = autoPanelPlan(GAIA);
  const numeric = GAIA.parameters.find((p) => p.type === 'integer' && p.range && p.range.max > 1);
  const control = controlsById(plan).get(`roland_gaia_sh01__${numeric.id.replace(/\W+/g, '_').toLowerCase()}`);
  assert.ok(control, `no control generated for ${numeric.id}`);
  assert.equal(control._children.Behavior.min, numeric.range.min);
  assert.equal(control._children.Behavior.max, numeric.range.max);
  assert.notEqual(control._children.Behavior.max, 1);
});

test('a choice control gets the profile\'s options, not "Option 1"', () => {
  const plan = autoPanelPlan(GAIA);
  const choice = GAIA.parameters.find((p) => p.type === 'choice' && p.choices?.length > 2);
  const control = controlsById(plan).get(`roland_gaia_sh01__${choice.id.replace(/\W+/g, '_').toLowerCase()}`);
  const rows = control._children.Value.rows;
  assert.equal(rows.length, choice.choices.length);
  assert.deepEqual(rows.map((r) => r.displayText), choice.choices.map((c) => c.label));
  assert.deepEqual(rows.map((r) => r.sendValue), choice.choices.map((c) => c.value));
});

test('every generated control is bound, on a port that accepts its parameter', () => {
  const plan = autoPanelPlan(SMALL);
  const bound = plan.controls.filter((c) => bindingOf(c));
  assert.equal(bound.length, SMALL.parameters.length, 'one bound control per parameter');
  for (const control of bound) {
    const binding = bindingOf(control);
    assert.equal(binding.kind, 'deviceParameter');
    assert.ok(binding.parameterId, 'a binding with no parameterId binds nothing');
    assert.ok(binding.port, 'a binding with no port cannot deliver a value');
    assert.equal(binding.deviceRole, 'primary');
  }
});

test('a boolean gets a state port and a choice gets a choice port', () => {
  const plan = autoPanelPlan(GAIA);
  const byId = controlsById(plan);
  const idFor = (p) => `roland_gaia_sh01__${p.id.replace(/\W+/g, '_').toLowerCase()}`;

  const bool = GAIA.parameters.find((p) => p.type === 'boolean');
  const choice = GAIA.parameters.find((p) => p.type === 'choice' && p.ui?.preferredComponent === 'Combobox');
  if (bool) assert.equal(bindingOf(byId.get(idFor(bool))).port, 'state');
  if (choice) assert.equal(bindingOf(byId.get(idFor(choice))).port, 'selectedChoice');
});

test('every control has a caption saying which parameter it is', () => {
  // A wall of unlabelled knobs is not an editor. The caption carries the name because a knob has
  // no room for one — the control itself shows the value.
  const plan = autoPanelPlan(SMALL);
  const ids = new Set(plan.controls.map((c) => c._children.Core.id));
  for (const parameter of SMALL.parameters) {
    const id = `roland_gaia_dpd__${parameter.id.replace(/\W+/g, '_').toLowerCase()}`;
    assert.ok(ids.has(`${id}_cap`), `${parameter.id} has no caption`);
  }
});

// --- the panel around them -----------------------------------------------------------------------

test('the panel declares the profile it needs', () => {
  // Otherwise opening it renders a wall of controls bound to nothing, with no explanation.
  const plan = autoPanelPlan(GAIA);
  assert.deepEqual(plan.requiredProfiles, [{ role: 'primary', profileId: GAIA.id, version: '*' }]);
});

test('groups come out in the order the profile author wrote them', () => {
  assert.deepEqual(autoPanelPlan(GAIA).groups, profileGroups(GAIA));
  assert.equal(profileGroups(SMALL)[0], SMALL.parameters[0].group);
});

test('a group filter restricts what is generated, and nothing else changes', () => {
  const only = autoPanelPlan(GAIA, { groups: ['Patch Common'] });
  assert.deepEqual(only.groups, ['Patch Common']);
  assert.equal(only.placed, GAIA.parameters.filter((p) => p.group === 'Patch Common').length);
  assert.ok(only.height < autoPanelPlan(GAIA).height);
});

test('nothing overlaps: no two controls share a rectangle', () => {
  // The cheapest thing that makes a generated panel obviously broken, and the easiest to get wrong
  // when a group wraps.
  const plan = autoPanelPlan(SMALL);
  const seen = new Set();
  for (const control of plan.controls) {
    const t = control._children.Transform;
    const key = `${t.x},${t.y},${t.width},${t.height}`;
    assert.ok(!seen.has(key), `two controls at ${key}`);
    seen.add(key);
  }
});

test('every control is inside the panel', () => {
  const plan = autoPanelPlan(GAIA);
  for (const control of plan.controls) {
    const t = control._children.Transform;
    assert.ok(t.x >= 0 && t.x + t.width <= plan.width, `${control._children.Core.id} is off the right edge`);
    assert.ok(t.y >= 0 && t.y + t.height <= plan.height, `${control._children.Core.id} is below the bottom`);
  }
});

test('compact really is smaller', () => {
  const comfortable = autoPanelPlan(GAIA);
  const compact = autoPanelPlan(GAIA, { density: 'compact' });
  assert.ok(compact.height < comfortable.height);
  assert.equal(compact.placed, comfortable.placed, 'density changes the size, not the coverage');
  assert.ok(AUTO_PANEL_DENSITY.compact.cellWidth < AUTO_PANEL_DENSITY.comfortable.cellWidth);
});

test('two runs over the same profile produce the same ids', () => {
  // Not tidiness: minted ids would make two generated panels un-diffable, which forecloses any
  // future "regenerate and merge" — the open question this feature deliberately did not answer.
  const a = autoPanelPlan(GAIA).controls.map((c) => c._children.Core.id);
  const b = autoPanelPlan(GAIA).controls.map((c) => c._children.Core.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'and they are unique');
});

test('a generated panel survives being saved and opened', () => {
  const plan = autoPanelPlan(SMALL);
  const panel = { ...createPanel('Generated'), controls: plan.controls, width: plan.width, height: plan.height };
  const reopened = deserializePanel(serializePanel(panel), null, 'Generated');
  assert.ok(reopened);
  assert.equal(reopened.controls.length, plan.controls.length);
  const stillBound = reopened.controls.filter((c) => bindingOf(c)?.parameterId);
  assert.equal(stillBound.length, SMALL.parameters.length, 'bindings must survive the document round trip');
});

test('a generated panel exports host-automatable parameters', () => {
  // The point of binding controls is that the exported plugin can be automated. A generated panel
  // that produces no exportParameters would export a plugin with nothing on it.
  const plan = autoPanelPlan(SMALL);
  const panel = { ...createPanel('Generated'), controls: plan.controls };
  const doc = JSON.parse(serializePanel(panel));
  assert.ok(doc.exportParameters.length > 0, 'no parameter reached the export list');
});

test('an empty or broken profile produces an empty plan, not a crash', () => {
  for (const junk of [null, {}, { parameters: [] }, { id: 'x', parameters: null }]) {
    const plan = autoPanelPlan(junk);
    assert.deepEqual(plan.controls, []);
    assert.equal(plan.placed, 0);
  }
});
