import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { gaiaArpGrid } from '../../../tools/scripts/gaia-panel/components.mjs';
import { seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { gaiaSyncStatus, gaiaExpectedArpValues, gaiaPatternFingerprint } from '../src/CE_Application/utils/gaiaSyncStatus.js';
import { deviceSyncFeedback, resetDeviceSyncFeedbackForTesting, noteDeviceFeedbackWrite, noteDeviceFeedbackResult,
  noteDeviceFeedbackReceived, noteDeviceFeedbackRead, noteDeviceFeedbackIdentity, syncFeedbackRoutes, invalidateDeviceFeedback } from '../src/CE_Application/stores/deviceSyncFeedback.js';

const role = 'Roland GAIA SH-01';
const grid = gaiaArpGrid();
const values = seedCustomValues(grid);
const output = { type: 'midiOutput', id: 'gaia-output' }, input = { type: 'midiInput', id: 'gaia-input' };
const mapping = { profileId: 'gaia', midiDestination: output, midiInput: input };
const base = { grid, values, mapping, destinations: [output], inputs: [input], capabilities: { canSendSysex: true, canReceiveSysex: true } };
const status = (extra = {}) => gaiaSyncStatus({ ...base, feedback: get(deviceSyncFeedback)[role], ...extra });
const write = (value, requestId = 'edit') => noteDeviceFeedbackWrite({ deviceRole: role, parameterId: 'arp.endStep', value, requestId, dryRun: false });

test('offline, missing input, ready and editor-only are distinct; no invented initial synchronization', () => {
  resetDeviceSyncFeedbackForTesting();
  assert.match(status({ destinations: [] }).text, /MIDI OFFLINE/);
  assert.match(status({ inputs: [] }).text, /NO MIDI INPUT/);
  assert.match(status().text, /MIDI PORTS READY · NO REPLY YET.*EDITOR PATTERN · NOT READ FROM GAIA/);
  assert.equal(status().verified, false);
});

test('compilation success, stale results and an old equal read do not confirm a new edit', () => {
  resetDeviceSyncFeedbackForTesting();
  noteDeviceFeedbackReceived(role, gaiaExpectedArpValues(grid, values).expected);
  assert.equal(status().verified, true);
  write(32, 'edit1');
  noteDeviceFeedbackResult({ deviceRole: role, parameterId: 'arp.endStep', requestId: 'edit1', ok: true });
  assert.match(status().text, /1 PENDING \/ UNVERIFIED/);
  assert.equal(status().verified, false);
  write(16, 'edit2');
  noteDeviceFeedbackResult({ requestId: 'edit1', deviceRole: role, parameterId: 'arp.endStep', ok: false, error: 'old failure' });
  assert.equal(get(deviceSyncFeedback)[role].writes['arp.endStep'].requestId, 'edit2');
  noteDeviceFeedbackReceived(role, { 'arp.endStep': 32 });
  assert.equal(status().verified, false);
  noteDeviceFeedbackReceived(role, { 'arp.endStep': 16 });
  assert.equal(status({ values: { ...values, arpEndStep: 16 } }).verified, true);
});

test('partial readbacks cannot mark a pattern synced; all 529 values and current edits must match', () => {
  resetDeviceSyncFeedbackForTesting();
  const expected = gaiaExpectedArpValues(grid, values).expected;
  const ids = Object.keys(expected);
  noteDeviceFeedbackReceived(role, Object.fromEntries(ids.slice(0, 528).map(id => [id, expected[id]])));
  assert.match(status().text, /528\/529 RECEIVED/);
  assert.equal(status().verified, false);
  noteDeviceFeedbackReceived(role, { [ids[528]]: expected[ids[528]] });
  assert.match(status().text, /EDITOR PATTERN · SYNCED \(READBACK\)/);
  assert.equal(status().verified, true);
  const edited = structuredClone(values);
  edited.__arpeggiator.blocks[0].velocity = 50;
  assert.equal(status({ values: edited }).verified, false);
  assert.match(status({ values: edited }).text, /EDITED IN EDITOR/);
  const fromHardware = { ...values, __arpPatternSource: { kind: 'hardware', fingerprint: gaiaPatternFingerprint(values.__arpeggiator.blocks) } };
  assert.match(status({ values: fromHardware }).text, /GAIA-READ PATTERN/);
  assert.match(status({ values: { ...edited, __arpPatternSource: fromHardware.__arpPatternSource } }).text, /EDITED GAIA PATTERN/);
});

test('read progress, timeout and retry are correlated to the device and request', () => {
  resetDeviceSyncFeedbackForTesting();
  noteDeviceFeedbackRead({ deviceRole: role, requestId: 'one', deviceRequestId: 'requestPattern', pending: true });
  assert.match(status().text, /READING/);
  noteDeviceFeedbackRead({ deviceRole: 'another synth', correlationId: 'other', requestId: 'requestPattern' }, 'timeout');
  assert.match(status().text, /READING/);
  noteDeviceFeedbackRead({ correlationId: 'one', requestId: 'requestPattern' }, 'timeout');
  assert.match(status().text, /READ FAILED \/ TIMED OUT/);
  noteDeviceFeedbackRead({ deviceRole: role, requestId: 'two', deviceRequestId: 'requestPattern', pending: true });
  assert.match(status().text, /READING/);
  noteDeviceFeedbackRead({ deviceRole: role, correlationId: 'two', requestId: 'requestPattern' }, 'resolved');
  assert.doesNotMatch(status().text, /READING|TIMED OUT/);
  assert.equal(status().verified, false, 'completion alone is not readback verification');
});

test('send failure remains visible and is not swallowed by an ok runtime-state response', () => {
  resetDeviceSyncFeedbackForTesting();
  write(16, 'failed');
  noteDeviceFeedbackResult({ requestId: 'failed', ok: false, error: 'MIDI output unavailable' });
  assert.match(status().text, /1 SEND ERROR/);
  assert.match(status().detail, /MIDI output unavailable/);
  assert.equal(status().verified, false);
});

test('route changes, disconnect/reconnect and patch recalls invalidate old readback evidence', () => {
  resetDeviceSyncFeedbackForTesting();
  syncFeedbackRoutes({ [role]: mapping }, [output], [input]);
  const receive = () => noteDeviceFeedbackReceived(role, gaiaExpectedArpValues(grid, values).expected);
  receive(); assert.equal(status().verified, true);
  syncFeedbackRoutes({ [role]: mapping }, [], [input]);
  syncFeedbackRoutes({ [role]: mapping }, [output], [input]);
  assert.equal(status().verified, false);
  receive(); invalidateDeviceFeedback(role, 'PATCH CHANGED — READ REQUIRED');
  assert.equal(status().verified, false);
  assert.match(status().detail, /PATCH CHANGED/);
  receive();
  syncFeedbackRoutes({ [role]: { ...mapping, profileId: 'other' } }, [output], [input]);
  assert.equal(status().verified, false);
});

test('identity replies indicate a responding device, never a verified pattern', () => {
  resetDeviceSyncFeedbackForTesting();
  noteDeviceFeedbackIdentity({ deviceRole: role, matched: true });
  assert.match(status().text, /REPLY RECEIVED/);
  assert.match(status().text, /NOT READ FROM GAIA/);
  assert.equal(status().verified, false);
  noteDeviceFeedbackReceived(role, gaiaExpectedArpValues(grid, values).expected);
  noteDeviceFeedbackIdentity({ deviceRole: role, matched: false, error: 'Wrong model ID' });
  assert.match(status().text, /DEVICE IDENTITY MISMATCH/);
  assert.doesNotMatch(status().text, /SYNCED/);
  assert.equal(status().verified, false);
});

test('unplugging retains unverified edits and ignores a late timeout from the retired connection', () => {
  resetDeviceSyncFeedbackForTesting();
  syncFeedbackRoutes({ [role]: mapping }, [output], [input]);
  write(16);
  noteDeviceFeedbackRead({ deviceRole: role, requestId: 'old-read', pending: true });
  syncFeedbackRoutes({ [role]: mapping }, [], [input]);
  assert.match(status({ destinations: [] }).text, /MIDI OFFLINE · 1 PENDING \/ UNVERIFIED/);
  noteDeviceFeedbackRead({ deviceRole: role, correlationId: 'old-read' }, 'timeout');
  assert.doesNotMatch(status().text, /TIMED OUT/);
});
