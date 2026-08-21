// deviceIdentity.test.js — reading a synth's answer to "who are you?".
//
// The handshake is MIDI's own: a Universal Device Inquiry, F0 7E <id> 06 01 F7, which any compliant
// instrument answers with its manufacturer, family, model and firmware. All of it already existed —
// DeviceProfileEngine::compileIdentityRequest builds the message, startDeviceSync sends it, and C++
// emits deviceIdentityReply, deviceIdentityMismatch or deviceRequestTimedOut. Nothing ever asked.
//
// Why this is worth its own module and its own tests: everything built for MIDI in this session is
// unverified against hardware, because there is no hardware here to verify it against. This is the
// one thing that answers the question for someone who does have a synth — so the reading of the
// answer had better be right, and it is the only part that can be tested without one.
//
// There are five outcomes and only one is good. Conflating them is the failure mode: "no answer"
// sends someone to check a cable, "wrong instrument" means the cable is fine and the profile is
// wrong, and "could not ask" means nothing was sent at all. Telling someone to check a cable when
// the profile is at fault is worse than saying nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeIdentity, identityEventMatches, identityOutcome, identityTestBlocker } from '../src/CE_Application/utils/deviceIdentity.js';

const reply = (over = {}) => ({
  ok: true,
  deviceRole: 'Roland GAIA SH-01',
  isIdentityReply: true,
  matched: true,
  manufacturerId: '41',
  familyCode: '00 41',
  modelNumber: '02 00',
  revision: '00 01 00 00',
  ...over,
});

test('the right instrument answering is the one good outcome', () => {
  const result = identityOutcome({ reply: reply() });
  assert.equal(result.outcome, 'replied');
  assert.equal(result.ok, true);
  assert.match(result.detail, /mfr 41/);
});

test('a wrong instrument is reported as wrong, not as silence', () => {
  // The distinction that earns this module. Something IS connected and the ports ARE right; what is
  // wrong is the profile. Reporting a timeout here would send someone to check a cable that works.
  const result = identityOutcome({ reply: reply({ matched: false, ok: false }) });
  assert.equal(result.outcome, 'mismatch');
  assert.equal(result.ok, false);
  assert.match(result.detail, /not the one this profile expects/);
  assert.match(result.detail, /mfr 41/, 'say what DID answer, or there is nothing to go on');
});

test('silence is a timeout, and says what to check', () => {
  const result = identityOutcome({ timedOut: true });
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.ok, false);
  assert.match(result.detail, /ports/);
});

test('the UI losing patience is not the instrument being silent', () => {
  // Found by testing, on hardware. The card gives up after 4s so "Asking…" is never a resting state,
  // and it reported that as a timeout — "No answer. Check the output and input ports, the cable…" —
  // for a GAIA that had answered correctly a build earlier. The real cause was the backend blocking
  // the message thread. Checking a cable would never have found it, and the wording sent us there.
  const result = identityOutcome({ gaveUp: true });
  assert.equal(result.outcome, 'stalled');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.detail, /cable/, 'this outcome knows nothing about the cable');
  assert.match(result.detail, /monitor/, 'point at the one place that shows what actually happened');
});

test('a real timeout outranks the UI giving up', () => {
  // Both can be true at once — the backend times out at 1s, the card at 4s. The backend's verdict is
  // the one with evidence behind it: the request went out and the window closed with nothing back.
  const result = identityOutcome({ timedOut: true, gaveUp: true });
  assert.equal(result.outcome, 'timeout');
});

test('an answer outranks both, however late it is', () => {
  // The backstop must not lock out a reply that arrives after it fires, or a slow instrument would
  // be permanently reported as absent.
  const result = identityOutcome({ reply: reply(), timedOut: true, gaveUp: true });
  assert.equal(result.outcome, 'replied');
  assert.equal(result.ok, true);
});

test('a request that never went out says so', () => {
  // compileIdentityRequest refuses a profile with no identity block. That is not the instrument
  // being quiet — nothing was ever sent, and no amount of cable-checking would help.
  const result = identityOutcome({ error: 'Profile has no identity declaration' });
  assert.equal(result.outcome, 'refused');
  assert.equal(result.detail, 'Profile has no identity declaration');
});

test('nothing yet is waiting, not failure', () => {
  const result = identityOutcome({});
  assert.equal(result.outcome, 'waiting');
  assert.equal(result.ok, false);
});

test('an error outranks a reply', () => {
  // If the send was refused, whatever is sitting in the reply store belongs to an earlier test.
  const result = identityOutcome({ reply: reply(), error: 'Profile has validation errors' });
  assert.equal(result.outcome, 'refused');
});

test('the identity reads as a synth manual writes it', () => {
  assert.equal(describeIdentity(reply()), 'mfr 41 · family 00 41 · model 02 00 · rev 00 01 00 00');
  assert.equal(describeIdentity({ manufacturerId: '0x41' }), 'mfr 41', 'a 0x prefix is not part of the byte');
  assert.equal(describeIdentity({ manufacturerId: '41', modelNumber: '' }), 'mfr 41',
    'an absent field is left out rather than printed empty');
  assert.equal(describeIdentity({}), '');
  assert.equal(describeIdentity(null), '');
});

test('a reply answers for the device it names and no other', () => {
  // Several synths can be connected, and each Test is per device — matching on anything looser
  // would report one instrument's answer against another's card.
  assert.equal(identityEventMatches(reply(), 'Roland GAIA SH-01'), true);
  assert.equal(identityEventMatches(reply(), 'Elektron Digitakt'), false);
  assert.equal(identityEventMatches(null, 'Roland GAIA SH-01'), false);
  assert.equal(identityEventMatches(reply({ deviceRole: ' Roland GAIA SH-01 ' }), 'Roland GAIA SH-01'), true);
});

test('Test refuses to ask when nothing can leave the app', () => {
  // Found on hardware. The card was left on Preview Only, so the engine compiled the inquiry and
  // then declined to send it — "Not sent: MIDI destination is preview-only" — into the MIDI monitor,
  // on another tab. The card said "Asking…", then that nothing came back. Every word true, the sum
  // misleading: it reads as a synth that stayed quiet, and it was an app that never asked.
  const blocked = identityTestBlocker({
    midiDestination: { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' },
    midiInput: { type: 'hardwareInput', id: 'ctrl49', name: 'CTRL49 MIDI' },
  });
  assert.match(blocked, /Preview Only/);
  assert.match(blocked, /never leaves the app/);
});

test('and when there is nothing to hear the answer on', () => {
  // An identity reply arrives on the MIDI input or not at all, so this is four seconds of waiting
  // for a message with nowhere to land.
  const blocked = identityTestBlocker({
    midiDestination: { type: 'hardwareOutput', id: 'ctrl49', name: 'CTRL49 MIDI' },
    midiInput: { type: 'none', id: 'none', name: 'No MIDI Input' },
  });
  assert.match(blocked, /Listen To/);
});

test('a device wired both ways has nothing standing in the way', () => {
  assert.equal(identityTestBlocker({
    midiDestination: { type: 'hardwareOutput', id: 'ctrl49out', name: 'CTRL49 MIDI' },
    midiInput: { type: 'hardwareInput', id: 'ctrl49in', name: 'CTRL49 MIDI' },
  }), '');
});

test('an unconfigured device is blocked, not crashed', () => {
  // The state a freshly seeded card is in — the panel named a device, nobody has chosen its ports.
  assert.match(identityTestBlocker({}), /Preview Only/);
  assert.match(identityTestBlocker(), /Preview Only/);
  assert.match(identityTestBlocker(null), /Preview Only/);
});

test('the destination is judged on its type, not its name', () => {
  // A port called "Preview Only" that is genuinely hardware must not be refused, and the reverse.
  assert.equal(identityTestBlocker({
    midiDestination: { type: 'hardwareOutput', id: 'x', name: 'Preview Only' },
    midiInput: { type: 'hardwareInput', id: 'y', name: 'anything' },
  }), '');
});
