// ce.patch's shared test: one fake synth and one list of calls, which test/patchParity.test.js runs
// through the panel view's core and through the Lua, JavaScript and Python preludes, comparing what
// each gives back and what each says.
//
// The synth answers the host's parameter queries: its profile, its parameters, the values it last
// reported. `write`, `fill`, `sendDump` and `requestDump` are recorded, and each call's record is part
// of what is compared, so "what was sent" agrees as well as "what came back".

export const PROFILE = { id: 'test.synth', name: 'Test Synth' };

export const PARAMETERS = [
  { id: 'name', name: 'Patch Name', group: 'Common', type: 'text' },
  { id: 'cutoff', name: 'Cutoff', group: 'Filter', type: 'integer', range: { min: 0, max: 127 } },
  { id: 'reso', name: 'Resonance', group: 'Filter', type: 'integer', range: { min: 0, max: 127 } },
  { id: 'wave', name: 'Wave', group: 'Osc', type: 'choice', choices: [{ id: 'saw', label: 'Saw', value: 0 }, { id: 'square', label: 'Square', value: 1 }, { id: 'tri', label: 'Triangle', value: 2 }] },
  { id: 'detune', name: 'Detune', group: 'Osc', type: 'float', range: { min: -1, max: 1 } },
  { id: 'sync', name: 'Sync', group: 'Osc', type: 'boolean' },
  { id: 'attack', name: 'Attack', group: 'Amp Env', type: 'integer', range: { min: 0, max: 127 } },
  { id: 'level', name: 'Level', group: 'Amp Env', type: 'integer', range: { min: 0, max: 127 }, access: { canWrite: false } },
  { id: 'tune', name: 'Master Tune', group: 'System', type: 'bipolar', range: { min: 24, max: 2024 } },
  { id: 'init', name: 'Init', group: 'Common', type: 'action' },
];

export const KNOWN = { name: 'INIT  ', cutoff: 64, reso: 10, wave: 'saw', detune: 0, sync: false, attack: 5, level: 100, tune: 1024 };

export const PATCH_SECTION = {
  scopes: [{ id: 'voice', name: 'Voice', except: ['System'], dumps: ['common', 'tone'] }],
  deliver: 'parameters',
  write: { via: 'dump', dump: 'userVoice' },
};

const A = { device: 'test.synth', role: 'mainSynth', scope: 'voice', values: { cutoff: 0, reso: 20, wave: 'saw', detune: -1, sync: false, attack: 0, name: 'AAA' }, missing: [], source: 'made' };
const B = { device: 'test.synth', role: 'mainSynth', scope: 'voice', values: { cutoff: 100, reso: 40, wave: 'tri', detune: 1, sync: true, attack: 127, name: 'BBB' }, missing: [], source: 'made' };
const C = { device: 'test.synth', role: 'mainSynth', scope: 'voice', values: { cutoff: 50, wave: 'square' }, missing: [], source: 'made' };
const OTHER = { device: 'other.synth', role: 'mainSynth', scope: 'voice', values: { cutoff: 1 }, missing: [], source: 'made' };

/** [command, args]; `$current` stands for the patch current() gave in step 0. */
export const CALLS = [
  ['current', []],
  ['current', ['voice', { groups: ['Filter'] }]],
  ['current', ['nope']],
  ['scopes', []],
  ['morph', [A, B, 0.25]],
  ['morph', [A, B, 0.5]],
  ['morph', [A, B, 0.75, { switchAt: 0.8 }]],
  ['morph', [A, B, 1.5]],
  ['morph', [A, B, 0.5, { groups: ['Filter'] }]],
  ['morph', [A, B, 0.5, { lock: ['Filter'] }]],
  ['morph', [A, B, 0.5, { include: ['name'] }]],
  ['morph', [A, C, 0.5]],
  ['morph', [A, OTHER, 0.5]],
  ['morph', [A, B, 'x']],
  ['morph', [A, B, 0.5, { groups: ['Nothing'] }]],
  ['blend', [[A, B, C], [0.5, 0.3, 0.2]]],
  ['blend', [[A, B], [0, 0]]],
  ['blend', [[A, B], [1, 3], { only: ['cutoff', 'wave'] }]],
  ['random', [{ seed: 7 }]],
  ['random', [{ seed: 7, groups: ['Filter'], within: { cutoff: [40, 60] } }]],
  ['random', [{ seed: 'x' }]],
  ['mutate', [B, 0.1, { seed: 3 }]],
  ['mutate', [B, 1, { seed: 3 }]],
  ['mutate', [B, 0.3, { seed: 11, lock: ['Amp Env'] }]],
  ['merge', [A, B, { groups: ['Osc'] }]],
  ['merge', [A, B, {}]],
  ['diff', [A, B]],
  ['diff', [A, C, { except: ['Osc'] }]],
  ['diff', [A, A]],
  ['equal', [A, { ...A, values: { ...A.values, cutoff: 0.2, name: 'AAA   ' } }]],
  ['equal', [A, B]],
  ['apply', [B]],
  ['apply', [B, { changedOnly: false }]],
  ['apply', [B, { send: 'none' }]],
  ['apply', [B, { send: 'dump' }]],
  ['apply', [B, { send: 'sideways' }]],
  ['apply', [{ ...B, values: { ...B.values, level: 3, tune: 1000 } }]],
  ['apply', [OTHER]],
  ['apply', [B, { live: true }]],
  ['define', ['mini', { groups: ['Osc'], dumps: ['tone'] }]],
  ['current', ['mini']],
  ['define', ['bad', { colour: 'red' }]],
  ['save', ['Warm pad', A]],
  ['save', ['Warm pad', B, { replace: false }]],
  ['save', ['', A]],
  ['load', ['WARM PAD']],
  ['load', ['nothing']],
  ['list', []],
  ['forget', ['warm pad']],
  ['forget', ['warm pad']],
  ['list', []],
  ['write', [B, 130]],
  ['write', [B, -1]],
];
