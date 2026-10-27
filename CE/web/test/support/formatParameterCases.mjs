// ce.format.parameter's table: a parameter as a device profile describes it, a stored value, and the
// text every runtime must write for it. test/formatParameterParity.test.js runs it through the panel
// view's formatDescribed and through formatParameter in the Lua, JavaScript and Python preludes,
// with the host's parameter query answering from PARAMETERS.

export const PARAMETERS = {
  // The GAIA's own two: stored 61..67 read -3..+3, and 24..2024 read -100.0..+100.0 cent.
  octaveShift: { id: 'octaveShift', type: 'integer', range: { min: 61, max: 67 }, display: { mode: 'number', min: -3, max: 3 } },
  masterTune: { id: 'masterTune', type: 'bipolar', range: { min: 24, max: 2024 }, display: { mode: 'number', unit: 'cent', min: -100, max: 100, precision: 1 } },
  plain: { id: 'plain', type: 'integer', range: { min: 0, max: 127 }, display: { mode: 'number' } },
  remain: { id: 'remain', type: 'choice', choices: [{ id: 'off', label: 'OFF', value: 0 }, { id: 'on', label: 'ON', value: 1 }], display: { mode: 'choice' } },
  name: { id: 'name', type: 'text', display: { mode: 'text' } },
  cutoff: { id: 'cutoff', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'hz', min: 20, max: 20000 } },
  level: { id: 'level', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'db', min: -60, max: 6 } },
  release: { id: 'release', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'time', min: 0, max: 5000 } },
  depth: { id: 'depth', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'percent' } },
  pan: { id: 'pan', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'pan' } },
  panShown: { id: 'panShown', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'pan', min: -64, max: 63 } },
  split: { id: 'split', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'note', middleC: 3 } },
  rate: { id: 'rate', type: 'integer', range: { min: 0, max: 3 }, display: { table: ['Slow', 'Mid', 'Fast', 'Sync'] } },
  rateFrom1: { id: 'rateFrom1', type: 'integer', range: { min: 1, max: 3 }, display: { table: ['One', 'Two', 'Three'] } },
  sync: { id: 'sync', type: 'integer', range: { min: 0, max: 127 }, display: { table: [{ upTo: 63, text: 'Free' }, { upTo: 127, text: 'Sync' }] } },
  ratio: { id: 'ratio', type: 'integer', range: { min: 1, max: 20 }, display: { format: 'ratio' } },
  length: { id: 'length', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'division', min: 0, max: 4 } },
  // What the engine gives every parameter of a profile with display.middleC: the note's option on a
  // frequency, which hz does not take and must never be handed.
  cutoffC: { id: 'cutoffC', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'hz', min: 20, max: 20000, middleC: 3 } },
  levelC: { id: 'levelC', type: 'integer', range: { min: 0, max: 127 }, display: { format: 'db', min: -60, max: 6, middleC: 3, precision: 0 } },
};

/** [parameter id, stored value, opts or null, the text] */
export const PARAMETER_CASES = [
  ['octaveShift', 61, null, '-3'], ['octaveShift', 64, null, '0'], ['octaveShift', 67, null, '3'],
  ['octaveShift', 61, { decimals: 1 }, '-3.0'], ['octaveShift', 67, { sign: 'always' }, '+3'],
  ['masterTune', 1024, null, '0.0 cent'], ['masterTune', 2024, null, '100.0 cent'], ['masterTune', 24, null, '-100.0 cent'],
  ['masterTune', 1024, { decimals: 0 }, '0 cent'], ['masterTune', 1024, { unit: false }, '0.0'],
  ['masterTune', 1034, { role: 'mainSynth' }, '1.0 cent'],
  ['plain', 64, null, '64'], ['plain', '64', null, '64'], ['plain', 'abc', null, '--'], ['plain', 'abc', { placeholder: '?' }, '?'],
  ['remain', 1, null, 'ON'], ['remain', 0, null, 'OFF'], ['remain', 'off', null, 'OFF'], ['remain', 5, null, '5'],
  ['name', 'Bright Pad', null, 'Bright Pad'], ['name', 'Pad', { width: 5 }, '  Pad'],
  ['cutoff', 0, null, '20 Hz'], ['cutoff', 127, null, '20 kHz'], ['cutoff', 64, null, '10.1 kHz'],
  ['level', 127, null, '6.0 dB'], ['level', 0, null, '-60.0 dB'],
  ['release', 127, null, '5 s'], ['release', 0, null, '0 ms'],
  ['depth', 127, null, '100%'], ['depth', 0, null, '0%'], ['depth', 64, null, '50%'],
  ['pan', 0, null, 'L64'], ['pan', 64, null, 'C'], ['pan', 127, null, 'R63'],
  ['panShown', 0, null, 'L64'], ['panShown', 64, null, 'C'], ['panShown', 127, null, 'R63'],
  ['split', 60, null, 'C3'], ['split', 61, null, 'C#3'],
  ['rate', 2, null, 'Fast'], ['rate', 0, null, 'Slow'], ['rate', 9, null, '--'],
  ['rateFrom1', 1, null, 'One'], ['rateFrom1', 3, null, 'Three'],
  ['sync', 100, null, 'Sync'], ['sync', 10, null, 'Free'],
  ['ratio', 4, null, '4:1'],
  ['length', 127, null, '1/1'],
  ['cutoffC', 127, null, '20 kHz'], ['levelC', 127, null, '6 dB'],
  // A shared option the command behind it does not take (a note has no decimals) is no refusal.
  ['split', 60, { decimals: 1 }, 'C3'], ['remain', 1, { decimals: 2 }, 'ON'], ['rate', 2, { sign: 'always' }, 'Fast'],
  ['missing', 3, null, '--'],
];
