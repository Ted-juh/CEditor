// deviceRoles.test.js — which synths a session is actually talking to.
//
// Several synths at once was never missing from the model. A device is a NAME: control bindings
// carry one, every send carries one, and the mappings are a map from name to profile-and-ports.
// What was missing is that every mapDeviceRole call in the UI passed one hardcoded constant,
// `mainSynth`, so that was the only device anything could configure.
//
// And the names in the data did not agree with it. All 183 of the GAIA panel's bindings name a
// device called `primary`. Sending one looks it up, finds nothing, and gives up with "Not sent:
// unresolved profile for primary" — so the panel could not reach a synth whichever port you picked,
// because the port was attached to a different name than its controls asked for.
//
// There are no slots and no fixed number of them. The name the user gives a device IS its identity,
// which is why renaming has to rewrite the bindings rather than update a label beside them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { countRolesInControls, countRolesInPanels, deviceRoleRows, renameRoleInControls } from '../src/CE_Application/utils/deviceRoles.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';
import { readText } from './support/readText.mjs';

function bound(id, role, parameterId = 'p1') {
  const control = createControl('Knob', { Core: { id } });
  control._children.DeviceBindings.bindings = [{ kind: 'deviceParameter', port: 'value', deviceRole: role, parameterId }];
  return control;
}

test('roles are counted from the bindings, not guessed', () => {
  const counts = countRolesInControls([bound('a', 'primary'), bound('b', 'primary'), bound('c', 'drums')]);
  assert.deepEqual([...counts.entries()].sort(), [['drums', 1], ['primary', 2]]);
});

test('a binding with no role of its own is not counted', () => {
  // An unset role falls back to the default at send time; counting it as a device would invent one.
  const control = createControl('Knob', { Core: { id: 'a' } });
  control._children.DeviceBindings.bindings = [{ kind: 'deviceParameter', port: 'value', parameterId: 'p' }];
  assert.equal(countRolesInControls([control]).size, 0);

  control._children.DeviceBindings.bindings = [{ deviceRole: '   ', parameterId: 'p' }];
  assert.equal(countRolesInControls([control]).size, 0, 'a blank role is not a device');
});

test('roles are summed across every open panel', () => {
  const counts = countRolesInPanels([
    { controls: [bound('a', 'primary')] },
    { controls: [bound('b', 'primary'), bound('c', 'drums')] },
  ]);
  assert.deepEqual([...counts.entries()].sort(), [['drums', 1], ['primary', 2]]);
});

test('a role a panel binds to but nothing configured is listed, and flagged', () => {
  // The failure this exists for. Without it the role never appears in settings, so nobody can point
  // it at a port, so the panel's sends are dropped with no visible cause.
  const rows = deviceRoleRows(
    { mainSynth: { profileId: 'test-cc-synth' } },
    [{ controls: [bound('a', 'primary'), bound('b', 'primary')] }],
  );

  const primary = rows.find((row) => row.role === 'primary');
  assert.ok(primary, 'a role the panel binds to was left out of the settings list');
  assert.equal(primary.configured, false);
  assert.equal(primary.usedBy, 2);

  const main = rows.find((row) => row.role === 'mainSynth');
  assert.equal(main.configured, true);
  assert.equal(main.usedBy, 0, 'nothing binds to mainSynth in this panel');
});

test('nothing configured and nothing bound means no devices', () => {
  // No invented slots. A device exists because the user made one or a panel names one.
  assert.deepEqual(deviceRoleRows({}, []), []);
});

test('renaming a device renames every control that names it', () => {
  // The name IS the identity — there is no hidden id underneath — so a rename that left the
  // bindings alone would leave them asking for a device that no longer exists.
  const controls = [bound('a', 'primary'), bound('b', 'primary'), bound('c', 'drums')];
  const next = renameRoleInControls(controls, 'primary', 'Roland GAIA');

  assert.deepEqual(next.map((c) => c._children.DeviceBindings.bindings[0].deviceRole),
    ['Roland GAIA', 'Roland GAIA', 'drums']);
  assert.deepEqual(controls.map((c) => c._children.DeviceBindings.bindings[0].deviceRole),
    ['primary', 'primary', 'drums'], 'the original controls were mutated');
});

test('renaming reaches controls nested inside a container', () => {
  const child = bound('inner', 'primary');
  const container = createControl('Container', { Core: { id: 'box' } });
  container._children.Children = { _type: 'Children', _children: { inner: child } };

  const [next] = renameRoleInControls([container], 'primary', 'Juno');
  assert.equal(next._children.Children._children.inner._children.DeviceBindings.bindings[0].deviceRole, 'Juno');
});

test('renaming to a name nothing uses changes nothing, and says so by identity', () => {
  const controls = [bound('a', 'primary')];
  assert.equal(renameRoleInControls(controls, 'absent', 'x'), controls,
    'callers skip writing a panel they did not change, so an untouched array must come back as-is');
  assert.equal(renameRoleInControls(controls, 'primary', 'primary'), controls);
  assert.equal(renameRoleInControls(controls, 'primary', ''), controls);
});

test('configured roles keep their order and are not duplicated by usage', () => {
  const rows = deviceRoleRows(
    { mainSynth: { profileId: 'a' }, drums: { profileId: 'b' } },
    [{ controls: [bound('x', 'drums')] }],
  );
  assert.deepEqual(rows.map((row) => row.role), ['mainSynth', 'drums']);
  assert.equal(rows.find((row) => row.role === 'drums').usedBy, 1);
});

test('the GAIA panel names a device that is not the default one', () => {
  // Asserted against the shipped panel because this is the specific disagreement that made the
  // feature unreachable: the panel says `primary`, the settings only ever said `mainSynth`.
  const panel = JSON.parse(readText(fileURLToPath(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url))));
  const counts = countRolesInControls((panel.controls ?? []).map(expandControl));

  assert.equal(counts.get('primary'), 183, 'the GAIA binds every one of its controls to a device called "primary"');
  assert.equal(counts.get('mainSynth'), undefined, 'the GAIA does not bind to mainSynth — that is the point');

  const rows = deviceRoleRows({ mainSynth: { profileId: 'x' } }, [panel]);
  assert.ok(rows.some((row) => row.role === 'primary' && !row.configured),
    'the GAIA\'s device must show up in settings as needing ports');
});
