// One fake synth and one list of calls for ce.verify, run through the panel view's verifyCore.js and
// the JavaScript, Lua and Python preludes by test/verifyParity.test.js.
//
// A call whose command starts with "__" is the fake synth's, not ce.verify's:
//   __reply(values)   the oldest open request is answered with these values, which fill the panel
//                     as a real dump does
//   __silence()       the oldest open request is answered with nothing (it timed out)
//   __tick()          every waiting after() runs, and what they start, until none is waiting
//   __move(id, value) the user turns a knob
//   __connected(on)   the synth is plugged in, or not
//   __last()          the last report a check handed its function
//   __summary(opts)   ce.verify.summary(the last report, opts)
// "__fn" in a call's arguments is a function that keeps the report it is given.

export const PARAMETERS = [
  { id: 'name', name: 'Name', group: 'Tone', type: 'text' },
  { id: 'level', name: 'Level', group: 'Tone', type: 'integer', range: { min: 0, max: 127 } },
  { id: 'wave', name: 'Wave', group: 'Tone', type: 'enum', choices: [{ id: 'saw' }, { id: 'square' }, { id: 'pulse' }] },
  { id: 'cutoff', name: 'Cutoff', group: 'Tone', type: 'integer', range: { min: 0, max: 255 } },
  { id: 'tune', name: 'Tune', group: 'Tone', type: 'integer', range: { min: -64, max: 63 }, access: { canWrite: false } },
  { id: 'fxOn', name: 'FX On', group: 'Effects', type: 'boolean' },
  { id: 'fxMix', name: 'FX Mix', group: 'Effects', type: 'float', range: { min: 0, max: 1 } },
  { id: 'arpRate', name: 'Arp Rate', group: 'Arp', type: 'integer', range: { min: 0, max: 10 } },
  { id: 'volume', name: 'Volume', group: 'System', type: 'integer', range: { min: 0, max: 127 } },
  { id: 'panic', name: 'Panic', group: 'System', type: 'action' },
];

export const LAYOUT = {
  gapMs: 20,
  encodings: {
    name: { type: 'text-ascii', length: 4, pad: 32 },
    level: { type: 'u7' },
    wave: { type: 'enum' },
    cutoff: { type: 'nibbled', nibbles: 2 },
    tune: { type: 's7' },
    fxOn: { type: 'boolean-u7' },
    fxMix: { type: 'u14-msb-lsb' },
    arpRate: { type: 'u7' },
  },
  dumps: [
    {
      id: 'common', name: 'Common', kind: 'sysex',
      matcher: { prefix: ['F0', '41', '10', '12', '00'], suffix: ['F7'] },
      payload: { offset: 5, size: 10 },
      checksum: { type: 'roland-7bit', fromOffset: 1, toOffset: 14, byteOffset: 15 },
      completion: { expectedMessages: 1, expectedBytes: 17 },
      mappings: [
        { parameter: 'name', offset: 0 }, { parameter: 'level', offset: 4 }, { parameter: 'wave', offset: 5 },
        { parameter: 'cutoff', offset: 6 }, { parameter: 'tune', offset: 8 },
      ],
    },
    {
      id: 'fx', name: 'Effects', kind: 'sysex',
      matcher: { prefix: ['F0', '41', '10', '13'], suffix: ['F7'] },
      payload: { offset: 4, size: 3 },
      checksum: { type: 'roland-7bit', fromOffset: 1, toOffset: 6, byteOffset: 7 },
      completion: { expectedMessages: 1, expectedBytes: 10 },
      mappings: [{ parameter: 'fxOn', offset: 0 }, { parameter: 'fxMix', offset: 1 }],
    },
    {
      id: 'arp', name: 'Arpeggio', kind: 'sysex',
      matcher: { prefix: ['F0', '41', '10', '14'], suffix: ['F7'] },
      payload: { offset: 4, size: 2, pack: { type: 'packed8to7', groupSize: 7 } },
      mappings: [{ parameter: 'arpRate', offset: 0, codec: { type: 'u14' } }],
    },
  ],
  requests: [
    { id: 'identityRequest', response: { kind: 'identity' } },
    { id: 'requestCommon', response: { kind: 'bulkDump', dump: 'common' }, timeoutMs: 1000, retries: 1 },
    { id: 'requestFx', response: { kind: 'bulkDump', dump: 'fx' }, timeoutMs: 1000 },
  ],
};

export const START = { name: 'INIT', level: 100, wave: 'square', cutoff: 64, tune: 0, fxOn: true, fxMix: 0.5, arpRate: 3, volume: 90 };

export const CALLS = [
  ['coverage', []],
  ['coverage', [{ group: 'tone' }]],
  ['coverage', [{ ids: ['level', 'nope', 'arpRate'] }]],
  ['coverage', [{ group: 'Nothing' }]],

  // check: the panel and the synth agree on most of it; the user turns FX Mix while it runs
  ['check', ['__fn']],
  ['running', []],
  ['check', ['__fn']],
  ['__reply', [{ name: 'INIT  ', level: 100, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__move', ['fxMix', 0.25]],
  ['__tick', []],
  ['running', []],
  ['__reply', [{ fxOn: 1, fxMix: 0.25 }]],
  ['__last', []],
  ['__summary', [null]],
  ['__summary', [{ width: 50 }]],
  ['__summary', [{ width: 30 }]],
  ['__summary', [{ width: 12 }]],
  ['summary', ['not a report']],
  ['running', []],

  // dump: asked three times, one value moves by itself
  ['dump', ['common', { times: 3, gapMs: 10 }, '__fn']],
  ['__reply', [{ name: 'INIT', level: 100, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__tick', []],
  ['__reply', [{ name: 'INIT', level: 101, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__tick', []],
  ['__reply', [{ name: 'INIT', level: 102, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__last', []],
  ['dump', ['arp', '__fn']],
  ['dump', ['zzz', '__fn']],
  ['dump', ['requestFx', '__fn']],
  ['__silence', []],
  ['__last', []],

  // write
  ['write', ['level', 90, '__fn']],
  ['__tick', []],
  ['__reply', [{ name: 'INIT', level: 90, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__last', []],
  ['write', ['tune', 3, '__fn']],
  ['__last', []],
  ['write', ['volume', 80, '__fn']],
  ['__last', []],
  ['write', ['level', 50, { settleMs: 5 }, '__fn']],
  ['__tick', []],
  ['__silence', []],
  ['__last', []],
  ['write', ['nope', 1, '__fn']],
  ['write', ['level', 1, 'not a function']],

  // probe: every choice, one comes back as a byte the profile does not name
  ['probe', ['wave', '__fn']],
  ['__tick', []],
  ['__reply', [{ wave: 'saw' }]],
  ['__tick', []],
  ['__reply', [{ wave: 'square' }]],
  ['__tick', []],
  ['__reply', [{ wave: 7 }]],
  ['__tick', []],
  ['__reply', [{ wave: 'saw' }]],
  ['__last', []],
  ['probe', ['level', { values: [0, 127] }, '__fn']],
  ['__tick', []],
  ['__reply', [{ level: 0 }]],
  ['running', []],
  ['cancel', []],
  ['__last', []],
  ['running', []],
  ['cancel', []],
  ['probe', ['arpRate', '__fn']],
  ['__last', []],
  ['probe', ['level', { values: 3 }, '__fn']],

  // patch
  ['patch', [{ via: 'parameters', group: 'Effects' }, '__fn']],
  ['__tick', []],
  ['__reply', [{ fxOn: true, fxMix: 0.2500305 }]],
  ['__last', []],
  ['patch', [{ via: 'dump', ids: ['level', 'tune'] }, '__fn']],
  ['__tick', []],
  ['__reply', [{ name: 'INIT', level: 50, wave: 'saw', cutoff: 64, tune: 0 }]],
  ['__last', []],
  ['patch', [{ via: 'sideways' }, '__fn']],

  // refused
  ['check', [{ role: 'aux' }, '__fn']],
  ['__connected', [false]],
  ['check', ['__fn']],
  ['__connected', [true]],
];
