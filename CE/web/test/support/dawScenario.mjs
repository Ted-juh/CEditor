// One list of calls for ce.daw, run through the panel view's dawCore.js and the JavaScript, Lua and
// Python preludes by test/dawParity.test.js, against one fake plug-in (ANSWERS). Every question the
// host is asked is written to the log, so a port that asks differently differs.
export const ANSWERS = {
  host: { name: 'Bitwig Studio', format: 'vst3', sampleRate: 48000, blockSize: 256, editorOpen: false },
  parameters: [
    { id: 'Cutoff.value', name: 'Cutoff', path: 'Cutoff.value', control: 'Cutoff', min: 20, max: 20000, default: 440, unit: 'Hz', kind: 'float', value: 440 },
    { id: 'Wave.value', name: 'Wave', path: 'Wave.value', control: 'Wave', min: 0, max: 2, default: 0, unit: '', kind: 'choice', choices: ['Saw', 'Square', 'Sine'], group: 'Osc', value: 1 },
    { id: 'spare1', name: 'Spare 1', min: 0, max: 1, default: 0, unit: '', kind: 'float', value: 0 },
  ],
  program: { index: 2, number: 3, name: 'Warm Pad', count: 8 },
  programs: [{ index: 0, number: 1, name: 'Init' }, { index: 1, number: 2, name: 'Bass' }],
  // A command: true when the path is a parameter the plug-in has, as it would answer.
  beginGesture: (f) => f.path === 'Cutoff.value',
  endGesture: (f) => f.path === 'Cutoff.value',
  rename: (f) => f.path === 'Cutoff.value',
  assign: (f) => f.slot === 1,
  markChanged: () => true,
};

export const CALLS = [
  ['dawHost', []],
  ['dawParameters', []],
  ['dawParameter', ['Wave.value']],
  ['dawParameter', ['Nothing.value']],
  ['dawParameter', [7]],
  ['dawProgram', []],
  ['dawPrograms', []],
  ['dawBeginGesture', ['Cutoff.value']],
  ['dawBeginGesture', ['Wave.value']],
  ['dawBeginGesture', ['']],
  ['dawEndGesture', ['Cutoff.value']],
  ['dawEndGesture', [null]],
  ['dawRename', ['Cutoff.value', 'Sync amount']],
  ['dawRename', ['Cutoff.value']],
  ['dawRename', ['Cutoff.value', 5]],
  ['dawRename', [{}, 'x']],
  ['dawAssign', [1, 'LfoRate.value']],
  ['dawAssign', [1, 'LfoRate.value', { name: 'LFO rate' }]],
  ['dawAssign', [1]],
  ['dawAssign', [2, 'LfoRate.value']],
  ['dawAssign', [0, 'LfoRate.value']],
  ['dawAssign', [1.5, 'LfoRate.value']],
  ['dawAssign', ['1', 'LfoRate.value']],
  ['dawAssign', [true, 'LfoRate.value']],
  ['dawAssign', [1, '']],
  ['dawAssign', [1, 'LfoRate.value', { name: 3 }]],
  ['dawMarkChanged', []],
];
