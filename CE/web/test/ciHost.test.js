// ce.ci in the panel view, over a fake native side: what goes out as "ciCommand", the answers that
// come back under each command's token, what devices and profiles answer from what the page has
// heard, a refusal that arrives after the call, and the events the scripts are raised.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCiBridge } from '../src/CE_Application/scripting/ciHost.js';

function harness({ native = true } = {}) {
  const sent = [];
  const raised = [];
  const said = [];
  const bridge = createCiBridge({
    send: (name, payload) => { if (!native) return false; sent.push({ name, ...payload }); return true; },
    raise: (name, payload) => raised.push([name, payload]),
  });
  const ci = bridge.forScript({ say: (level, text) => said.push(`${level}: ${text}`), call: (fn, value) => fn(value) });
  return { bridge, ci, sent, raised, said };
}
const SYNTH = { muid: 7, role: 'mainSynth', manufacturer: '42', model: '02 00', propertyExchange: true, profiles: true, matchesProfile: true };

test('discover goes out with its own token, and the devices found are remembered', () => {
  const { bridge, ci, sent, raised } = harness();
  let found;
  assert.equal(ci.discover({ timeoutMs: 500 }, (list) => { found = list; }), true);
  assert.deepEqual(sent[0], { name: 'ciCommand', op: 'discover', role: 'mainSynth', timeoutMs: 500, token: 'w1', requestId: 'w1' });
  bridge.heard('ciCommandAnswered', { requestId: 'w1', answer: { ok: true, token: 'w1' } });
  bridge.heard('ciDiscovered', SYNTH);
  assert.deepEqual(raised, [['onCiDiscovered', SYNTH]]);
  bridge.heard('ciReply', { token: 'w1', final: true, result: [SYNTH] });
  assert.deepEqual(found, [SYNTH]);
  assert.deepEqual(ci.devices().map((d) => d.muid), [7]);
  assert.deepEqual(ci.devices('aux'), []);
  bridge.heard('ciDeviceRemoved', { muid: 7, role: 'mainSynth' });
  assert.deepEqual(ci.devices(), []);
});

test('get, set and subscribe reach only a device that was found, with property exchange', () => {
  const { bridge, ci, sent, said } = harness();
  assert.equal(ci.get(7, 'ProgramList', () => {}), false);
  assert.match(said[0], /no MIDI-CI device 7 has answered/);
  bridge.heard('ciDiscovered', SYNTH);
  let got;
  assert.equal(ci.get(7, 'ProgramList', { resId: 'a' }, (r) => { got = r; }), true);
  assert.deepEqual(sent[0], { name: 'ciCommand', op: 'get', muid: 7, resource: 'ProgramList', opts: { resId: 'a' }, token: 'w1', requestId: 'w1' });
  bridge.heard('ciReply', { token: 'w1', final: true, result: { ok: true, status: 200, body: [{ title: 'Init' }] } });
  assert.equal(got.body[0].title, 'Init');
  const updates = [];
  const id = ci.subscribe(7, 'ProgramList', (u) => updates.push(u.command));
  assert.equal(id, 'w2');
  bridge.heard('ciReply', { token: 'w2', final: false, result: { command: 'full' } });
  bridge.heard('ciReply', { token: 'w2', final: false, result: { command: 'notify' } });
  assert.equal(ci.unsubscribe(id), true);
  assert.equal(sent[sent.length - 1].op, 'unsubscribe');
  bridge.heard('ciReply', { token: 'w2', final: false, result: { command: 'full' } });
  assert.deepEqual(updates, ['full', 'notify']);
  assert.equal(ci.unsubscribe(id), false);
  bridge.heard('ciDiscovered', { ...SYNTH, muid: 8, propertyExchange: false });
  assert.equal(ci.get(8, 'DeviceInfo', () => {}), false);
  assert.match(said[said.length - 1], /does not support property exchange/);
});

test('a refusal that arrives after the call reaches the function, and the console', () => {
  const { bridge, ci, said } = harness();
  let found = 'not called';
  ci.discover((list) => { found = list; });
  bridge.heard('ciCommandAnswered', { requestId: 'w1', answer: { ok: false, error: '"mainSynth" has no hardware MIDI output to ask on' } });
  assert.deepEqual(found, []);
  assert.match(said[0], /ce\.ci\.discover: "mainSynth" has no hardware MIDI output to ask on\./);
});

test('profiles answer from what was heard; a profile change is remembered and raised', () => {
  const { bridge, ci, sent, raised } = harness();
  bridge.heard('ciDiscovered', SYNTH);
  assert.deepEqual(ci.profiles(7), []);
  let fresh;
  ci.profiles(7, (list) => { fresh = list; });
  assert.equal(sent[0].ask, true);
  bridge.heard('ciReply', { token: 'w1', final: true, result: [{ id: '7E 21 09 01 00', address: 'device', enabled: false }] });
  assert.equal(fresh.length, 1);
  assert.equal(ci.profiles(7)[0].enabled, false);
  assert.equal(ci.setProfile(7, '7E 21 09 01 00', true), true);
  assert.deepEqual({ op: sent[1].op, id: sent[1].id, on: sent[1].on, channel: sent[1].channel }, { op: 'setProfile', id: '7E 21 09 01 00', on: true, channel: 0 });
  bridge.heard('ciProfileChanged', { muid: 7, id: '7E 21 09 01 00', address: 'device', enabled: true });
  assert.equal(ci.profiles(7)[0].enabled, true);
  assert.equal(raised[raised.length - 1][0], 'onCiProfileChanged');
});

test('draftProfile asks for the four resources and builds a draft, naming what the device did not say', () => {
  const { bridge, ci, sent } = harness();
  bridge.heard('ciDiscovered', SYNTH);
  let draft;
  assert.equal(ci.draftProfile(7, (d) => { draft = d; }), true);
  const answer = (resource, result) => {
    const asked = sent.find((s) => s.resource === resource);
    bridge.heard('ciReply', { token: asked.token, final: true, result });
  };
  answer('DeviceInfo', { ok: true, body: { manufacturerId: [0, 33, 9], family: [2, 1], model: [0, 0], version: [1, 0, 0, 0], model_name: 'X' } });
  answer('AllCtrlList', { ok: true, body: [{ title: 'Filter Cutoff', ctrlType: 'cc', ctrlIndex: [74] }] });
  answer('ChCtrlList', { ok: false, status: 404 });
  answer('ProgramList', { ok: true, body: [{ title: 'Init', bankPC: [0, 0, 0] }] });
  assert.ok(draft.profile, 'a draft profile');
  assert.deepEqual(draft.summary.missing, ['ChCtrlList']);
  assert.equal(draft.profile.scopes.global.parameters.find((p) => p.id === 'filter-cutoff').wires[0].cc, 74);
});

test('without the native side nothing is sent, and the console says why', () => {
  const { ci, said } = harness({ native: false });
  assert.equal(ci.discover(() => {}), false);
  assert.match(said[0], /MIDI-CI needs the app or the plug-in/);
});
