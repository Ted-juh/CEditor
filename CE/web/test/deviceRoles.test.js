// deviceRoles.test.js — which synths a session is actually talking to.
//
// Two synths at once was never missing from the model. A device "role" is a name; control bindings
// carry one, every send carries one, and deviceRoleMappings is a map from role to profile-and-ports.
// What was missing is that every mapDeviceRole call in the UI passed the DEFAULT_DEVICE_ROLE
// constant, so `mainSynth` was the only role anything could configure.
//
// And the roles in the data did not even agree with it. The GAIA panel binds 365 controls to a role
// called `primary`. Sending one looks up deviceRoleMappings['primary'], finds nothing, and gives up
// with "Not sent: unresolved profile for primary" — so the panel could not reach a synth whichever
// port you picked, because the port was attached to a different name than its controls asked for.
//
// Hence reading the roles out of the panels instead of asking anyone to guess them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { countRolesInControls, countRolesInPanels, deviceRoleRows } from '../src/CE_Application/utils/deviceRoles.js';
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
    ['mainSynth'],
  );

  const primary = rows.find((row) => row.role === 'primary');
  assert.ok(primary, 'a role the panel binds to was left out of the settings list');
  assert.equal(primary.configured, false);
  assert.equal(primary.usedBy, 2);

  const main = rows.find((row) => row.role === 'mainSynth');
  assert.equal(main.configured, true);
  assert.equal(main.usedBy, 0, 'nothing binds to mainSynth in this panel');
});

test('the default role is always listed, even on a session that never touched it', () => {
  const rows = deviceRoleRows({}, [], ['mainSynth']);
  assert.deepEqual(rows.map((row) => row.role), ['mainSynth']);
});

test('configured roles keep their order and are not duplicated by usage', () => {
  const rows = deviceRoleRows(
    { mainSynth: { profileId: 'a' }, drums: { profileId: 'b' } },
    [{ controls: [bound('x', 'drums')] }],
    ['mainSynth'],
  );
  assert.deepEqual(rows.map((row) => row.role), ['mainSynth', 'drums']);
  assert.equal(rows.find((row) => row.role === 'drums').usedBy, 1);
});

test('the GAIA panel names a device that is not the default one', () => {
  // Asserted against the shipped panel because this is the specific disagreement that made the
  // feature unreachable: the panel says `primary`, the settings only ever said `mainSynth`.
  const panel = JSON.parse(readText(fileURLToPath(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url))));
  const counts = countRolesInControls((panel.controls ?? []).map(expandControl));

  assert.ok(counts.get('primary') > 100, `expected the GAIA to bind many controls to "primary", got ${counts.get('primary')}`);
  assert.equal(counts.get('mainSynth'), undefined, 'the GAIA does not bind to mainSynth — that is the point');

  const rows = deviceRoleRows({ mainSynth: { profileId: 'x' } }, [panel], ['mainSynth']);
  assert.ok(rows.some((row) => row.role === 'primary' && !row.configured),
    'the GAIA\'s device must show up in settings as needing ports');
});
