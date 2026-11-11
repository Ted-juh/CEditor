// Black Corporation Deckard's Dream MK2: the MIDI CC chart of its operation manual, 2.3.0.

const SECTIONS = [
  [/^(?:PWM|PW|SQUARE|SAW|NOISE|SINE)\b/, 'VCO'], [/^VCF/, 'VCF'], [/^VCA/, 'VCA'], [/^TR /, 'Touch Response'],
  [/^SUBOSC/, 'Sub-Oscillator'], [/^KBRD/, 'Keyboard Control'], [/^(?:FEET|COARSE|FINE|DETUNE)/, 'Pitch'],
];

export default {
  id: 'black-corporation-deckards-dream-mk2',
  name: 'Black Corporation Deckard\'s Dream MK2',
  family: 'Deckard\'s Dream',
  description: 'Black Corporation Deckard\'s Dream MK2 eight-voice analog synthesizer: every controller of its manual\'s MIDI CC chart, with the ranges it prints.',
  document: { title: "DECKARD'S DREAM MK2 Operation Manual 2.3.0", file: 'deckards_dream_mk2_manual_2.3.0_eng_3b68bdb.pdf', url: 'https://black-corporation.com/m/assets/support/5/deckards_dream_mk2_manual_2.3.0_eng_3b68bdb.pdf' },
  pages: [54, 55, 56],
  // The chart's A and B are the two layers, I and II.
  groupOf: (name) => {
    const layer = / A$/.test(name) ? ' I' : / B$/.test(name) ? ' II' : '';
    return `${SECTIONS.find(([re]) => re.test(name))?.[1] ?? 'Global'}${layer}`;
  },
  // The bands' settings, as the manual describes each control (its items 30 - 32 and the PATCH
  // PROGRAMMING section), top to bottom.
  labels: {
    'SUSTAIN SWITCH': ['I', 'II'],
    'SLIDER FEET1': ["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"],
    'SLIDER FEET2': ["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"],
    'SLIDER SUBOSC FUNC': ['Sine', 'Saw', 'Reverse Saw', 'Square', 'Random', 'Sample & Hold'],
  },
  notes: [
    'The chart prints six bands for FEET 1, FEET 2 and the sub-oscillator\'s FUNCTION, and the manual lists their settings from the top of the slider to the bottom (16\' to 2\'; sine, saw, reverse saw, square, random, sample & hold, the MK1\'s external input not on the MK2). The profile takes the first band, 0 - 21, as the top setting, which neither says: check it on the instrument. SUSTAIN SWITCH\'s two bands are taken as I and II, the switch\'s own order, likewise.',
    'The two-band switches (SQUARE, SAW) are taken as off and on; the chart prints only the bands.',
    'The manual\'s MOD WHEEL DESTINATION list gives DETUNE as CC 95; the chart gives SLIDER DETUNE as CC 32 and has no CC 95. The profile follows the chart.',
  ],
};
