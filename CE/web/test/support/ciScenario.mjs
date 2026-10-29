// One fake device layer and one list of calls for ce.ci, run through the panel view's ciCore.js and
// the JavaScript, Lua and Python preludes by test/ciParity.test.js.
//
// The fake answers every "ci" command as the device layer does: a command that waits for the device
// gets the next token (1, 2, ...), muid 999 is a device nobody found, and each command is written to
// the log as one line, its fields in a fixed order. A call whose command starts with "__" is the
// fake's: __reply(reply) hands ce.ci a device's answer, as the "__ciReply" event does, and __got()
// gives every value the functions were called with. "__fn" in a call is a function that keeps them.

export const DEVICES = [{ muid: 7, role: 'mainSynth', manufacturer: '42', family: '01 00', model: '02 00', version: '01 00 00 00', propertyExchange: true, profiles: true, matchesProfile: false }];
export const PROFILES = [{ id: '7E 21 09 01 00', address: 'device', enabled: true }];
export const FIELD_ORDER = ['op', 'role', 'muid', 'resource', 'id', 'on', 'channel', 'ask', 'timeoutMs'];

export const CALLS = [
  ['ciDiscover', ['__fn']],
  ['ciDiscover', [{ role: 'aux', timeoutMs: 500 }, '__fn']],
  ['ciDiscover', [{}]],
  ['__reply', [{ token: 1, final: true, result: [{ muid: 7, model: '02 00' }] }]],
  ['ciDevices', []],
  ['ciDevices', ['aux']],
  ['ciGet', [7, 'ProgramList', '__fn']],
  ['ciGet', [7, 'ProgramList', { resId: 'a', offset: 0, limit: 10, timeoutMs: 1000 }, '__fn']],
  ['ciGet', ['x', 'ProgramList', '__fn']],
  ['ciGet', [7, '', '__fn']],
  ['ciGet', [7, 'ProgramList']],
  ['ciGet', [999, 'DeviceInfo', '__fn']],
  ['ciSet', [7, 'X-Name', { name: 'Warm' }, '__fn']],
  ['ciSet', [7, 'X-Text', 'Warm', { mediaType: 'text/plain' }, '__fn']],
  ['ciSet', [7, 'X-Name', null, '__fn']],
  ['ciSubscribe', [7, 'ProgramList', '__fn']],
  ['ciSubscribe', [7, 'ProgramList']],
  ['__reply', [{ token: 7, final: false, result: { command: 'full', body: [1, 2] } }]],
  ['__reply', [{ token: 7, final: false, result: { command: 'notify' } }]],
  ['ciUnsubscribe', [7]],
  ['__reply', [{ token: 7, final: false, result: { command: 'full' } }]],
  ['ciUnsubscribe', [7]],
  ['ciUnsubscribe', []],
  ['ciProfiles', [7]],
  ['ciProfiles', [7, '__fn']],
  ['ciProfiles', ['seven']],
  ['ciSetProfile', [7, '7E 21 09 01 00', true]],
  ['ciSetProfile', [7, '7E 21 09 01 00', false, { channel: 3 }]],
  ['ciSetProfile', [7, '7E 21 09 01 00', true, { channel: 17 }]],
  ['ciSetProfile', [7, '', true]],
  ['ciSetProfile', [7, '7E 21 09 01 00', 'yes']],
  ['ciSetProfile', [999, '7E 21 09 01 00', true]],
  ['__reply', [{ token: 3, final: true, result: { ok: true, status: 200, body: { name: 'Init' } } }]],
  ['__reply', [{ token: 3, final: true, result: { ok: true } }]],
  ['__reply', [{ token: 8, final: true, result: [{ id: '7E 21 09 01 00', address: 'device', enabled: false }] }]],
  ['__got', []],
];
