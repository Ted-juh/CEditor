// One table of ce.format calls and the text each must give, in every runtime
// (test/formatParity.test.js runs it through the panel view and the JS, Lua and Python preludes).
// [function, args, expected]. Options are plain objects; a list argument is a plain array.
export const FORMAT_CASES = [
  // number
  ['formatNumber', [0.5], '0.5'], ['formatNumber', [12, { sign: 'always' }], '+12'], ['formatNumber', [3], '3'],
  ['formatNumber', [3, { decimals: 1 }], '3.0'], ['formatNumber', [2.50], '2.5'], ['formatNumber', [1234.5], '1235'],
  ['formatNumber', [-0.004], '-0.004'], ['formatNumber', [-0.0004, { decimals: 2 }], '0.00'], ['formatNumber', ['440'], '440'],
  ['formatNumber', [2.675, { decimals: 2 }], '2.68'], ['formatNumber', [-2.5, { decimals: 0 }], '-3'], ['formatNumber', [1.005, { decimals: 2 }], '1.01'],
  ['formatNumber', [null], '--'], ['formatNumber', ['abc', { placeholder: '..' }], '..'], ['formatNumber', [7, { width: 4 }], '   7'],
  ['formatNumber', [-3, { unicode: true }], '−3'], ['formatNumber', [12.5, { unit: 'st' }], '12.5 st'], ['formatNumber', [12.5, { unit: 'st', space: false }], '12.5st'],
  ['formatNumber', [0.123456, { digits: 2 }], '0.12'], ['formatNumber', [0], '0'],
  // hz, time
  ['formatHz', [1250], '1.25 kHz'], ['formatHz', [1234], '1.23 kHz'], ['formatHz', [440], '440 Hz'], ['formatHz', [999], '999 Hz'],
  ['formatHz', [1000], '1 kHz'], ['formatHz', [0.25], '0.25 Hz'], ['formatHz', [12300, { space: false }], '12.3kHz'],
  ['formatHz', [500, { scale: 'kHz' }], '0.5 kHz'], ['formatHz', [-5], '--'], ['formatHz', [20000, { unit: false }], '20'],
  ['formatTime', [850], '850 ms'], ['formatTime', [1200], '1.2 s'], ['formatTime', [0.5], '0.5 ms'], ['formatTime', [2500, { scale: 'ms' }], '2500 ms'],
  // db
  ['formatDb', [-6], '-6.0 dB'], ['formatDb', [0], '0.0 dB'], ['formatDb', [3, { sign: 'always' }], '+3.0 dB'],
  ['formatDb', [0, { fromGain: true }], '-inf dB'], ['formatDb', [0.5, { fromGain: true }], '-6.0 dB'], ['formatDb', [1, { fromGain: true }], '0.0 dB'],
  ['formatDb', [-90, { floor: -80 }], '-inf dB'], ['formatDb', [-12.25, { decimals: 2 }], '-12.25 dB'],
  // percent
  ['formatPercent', [0.5], '50%'], ['formatPercent', [64, { max: 127 }], '50%'], ['formatPercent', [1.2], '120%'],
  ['formatPercent', [0.333, { decimals: 1 }], '33.3%'], ['formatPercent', [0.5, { min: 1, max: 1 }], '--'],
  // pan
  ['formatPan', [-0.5], 'L25'], ['formatPan', [0], 'C'], ['formatPan', [1], 'R50'], ['formatPan', [-1], 'L50'],
  ['formatPan', [0, { min: 0, max: 127, center: 64 }], 'L64'], ['formatPan', [127, { min: 0, max: 127, center: 64 }], 'R63'],
  ['formatPan', [64, { min: 0, max: 127, center: 64 }], 'C'], ['formatPan', [-0.5, { style: '50L' }], '25L'],
  ['formatPan', [0.5, { style: '<50' }], '>25'], ['formatPan', [-0.5, { style: '50>' }], '25<'], ['formatPan', [0.004], 'C'],
  // ratio
  ['formatRatio', [4], '4:1'], ['formatRatio', [1.5], '1.5:1'], ['formatRatio', [2, { style: 'x' }], 'x2.00'], ['formatRatio', [0], '--'],
  // clock
  ['formatClock', [83450], '1:23.4'], ['formatClock', [3723400], '1:02:03.4'], ['formatClock', [5000, { decimals: 0 }], '0:05'],
  ['formatClock', [59999], '0:59.9'], ['formatClock', [61000, { hours: true }], '0:01:01.0'], ['formatClock', [1234, { decimals: 3 }], '0:01.234'],
  // note
  ['formatNote', [60], 'C4'], ['formatNote', [60, { middleC: 3 }], 'C3'], ['formatNote', [61], 'C#4'], ['formatNote', [61, { flats: true }], 'Db4'],
  ['formatNote', [70, { flats: true, unicode: true }], 'B♭4'], ['formatNote', [66, { unicode: true }], 'F♯4'], ['formatNote', [0], 'C-1'],
  ['formatNote', [127], 'G9'], ['formatNote', [61, { octave: false }], 'C#'], ['formatNote', [128], '--'], ['formatNote', [59.6], 'C4'],
  // division
  ['formatDivision', [0.25], '1/16'], ['formatDivision', [1 / 3], '1/8T'], ['formatDivision', [1.5], '1/4D'], ['formatDivision', [4], '1/1'],
  ['formatDivision', [0.3], '0.3 beats'], ['formatDivision', [0.252], '1/16'], ['formatDivision', [0], '--'],
  // table
  ['formatTable', [2, ['Off', 'I', 'II', 'I+II']], 'II'], ['formatTable', [0, ['Off', 'I']], 'Off'], ['formatTable', [4, ['Off', 'I']], '--'],
  ['formatTable', [1, ['A', 'B'], { start: 1 }], 'A'], ['formatTable', [40, [{ upTo: 63, text: 'Free' }, { upTo: 127, text: 'Sync' }]], 'Free'],
  ['formatTable', [64, [{ upTo: 63, text: 'Free' }, { upTo: 127, text: 'Sync' }]], 'Sync'], ['formatTable', [200, [{ upTo: 63, text: 'Free' }]], '--'],
  ['formatTable', [1, []], '--'], ['formatTable', [1, [10, 2.5, 'x']], '2.5'], ['formatTable', [0, [2, 'x']], '2'],
  // fit
  ['formatFit', ['Filter Envelope', 10], 'Filter Env'], ['formatFit', ['Resonance', 4], 'Reso'], ['formatFit', ['Cutoff', 8], 'Cutoff  '],
  ['formatFit', ['Filter', 4], 'Fltr'], ['formatFit', ['Osc Detune Amount', 8], 'OscDtnAm'], ['formatFit', ['Hi', 4, { align: 'right' }], '  Hi'],
  ['formatFit', ['Hi', 5, { align: 'center' }], ' Hi  '], ['formatFit', ['Cutoff Frequency', 8, { pad: false }], 'Ctff Frq'],
  ['formatFit', ['Cutoff', 3, { abbreviations: { Cutoff: 'Cut' } }], 'Cut'], ['formatFit', ['Brightness', 4, { steps: 1 }], 'Brig'],
  ['formatFit', [12.5, 6], '12.5  '], ['formatFit', ['x', 0], ''],
  // line
  ['formatLine', ['Cutoff', '12.3k', 16], 'Cutoff     12.3k'], ['formatLine', ['Resonance', '64%', 8], 'Reso 64%'],
  ['formatLine', ['Level', '1234567890', 8], '34567890'], ['formatLine', ['Level', '1234567', 8], ' 1234567'], ['formatLine', ['A', 'B', 5, { gap: 2 }], 'A   B'],
  // parse
  ['formatParse', ['1.2k'], 1200], ['formatParse', ['1.2 s'], 1200], ['formatParse', ['50%'], 0.5], ['formatParse', ['-6dB'], -6],
  ['formatParse', ['C4', { kind: 'note' }], 60], ['formatParse', ['c3', { kind: 'note', middleC: 3 }], 60], ['formatParse', ['Bb3', { kind: 'note' }], 58],
  ['formatParse', ['1/8T', { kind: 'division' }], 1 / 3], ['formatParse', ['L25', { kind: 'pan' }], -0.5], ['formatParse', ['C', { kind: 'pan' }], 0],
  ['formatParse', ['4:1', { kind: 'ratio' }], 4], ['formatParse', ['x2', { kind: 'ratio' }], 2], ['formatParse', ['5', { kind: 'time' }], 5],
  ['formatParse', ['50', { kind: 'percent' }], 0.5], ['formatParse', ['30k', { kind: 'hz', min: 20, max: 20000 }], 20000],
  ['formatParse', ['5ms', { kind: 'hz' }], null], ['formatParse', ['hello'], null], ['formatParse', [''], null], ['formatParse', ['12.5 kHz'], 12500],
  ['formatParse', [' 440 '], 440], ['formatParse', ['L64', { kind: 'pan', min: 0, max: 127, center: 64 }], 0],
];
