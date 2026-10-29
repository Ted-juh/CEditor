// layout.mjs — where the SH-201 draft puts each Upper-tone parameter.
//
// Two rows, in the order a sound is built: the sources and their modulators on top (OSC 1, OSC 2,
// Mix/Mod, LFO 1, LFO 2), then what shapes them (Pitch Env, Filter with its envelope, Amp with its
// envelope, Performance, Effects). Every item names a profile parameter by id; the generator refuses
// one the profile does not have. Coordinates are inside the section, whose header tab takes the
// top 20 pixels.
//
//   knob    the SH-201 Knob package, caption under it
//   fader   the SH-201 Fader package, caption under it
//   switch  the SH-201 LED Switch package, caption over it
//   combo   a stock list whose rows are the profile's choices, caption over it

export const SKIN = {
  knob: 50,
  faderW: 28,
  faderH: 120,
  panelBg: 'FF1A1D21',
  sectionFill: 'FF22262B',
  caption: 'FFB9C2CA',
  dim: 'FF6D7781',
  tabText: 'FF121518',
  brand: 'FFE6E9EC',
  model: 'FFE2513C',
  buttonOff: 'FF2C3238',
  toneLit: 'FFE2513C',
};

const TINT = {
  source: 'FF5FA8D3',
  mix: 'FF8DB4C8',
  lfo: 'FF9D90D6',
  filter: 'FFE0A44A',
  amp: 'FFD9705F',
  play: 'FF80BF90',
  effects: 'FFB2BAC2',
};

export const PANEL = { width: 1660, inset: 16, gap: 10, upperTop: 52, sectionTop: 60 };

const oscillator = (n) => ({
  title: `OSC ${n}`,
  tint: TINT.source,
  about: `Oscillator ${n}: its waveform, pitch and pulse width.`,
  w: 306,
  h: 214,
  items: [
    { p: `upper.osc${n}.waveform`, kind: 'combo', x: 12, y: 42, w: 118, label: 'WAVE' },
    { p: `upper.osc${n}.pitchWide`, kind: 'switch', x: 148, y: 38, label: 'WIDE' },
    { p: `upper.osc${n}.coarseTune`, kind: 'knob', x: 20, y: 100, label: 'PITCH' },
    { p: `upper.osc${n}.fineTune`, kind: 'knob', x: 92, y: 100, label: 'DETUNE' },
    { p: `upper.osc${n}.pulseWidth`, kind: 'knob', x: 164, y: 100, label: 'PW' },
    { p: `upper.osc${n}.pitchEnvDepth`, kind: 'knob', x: 236, y: 100, label: 'ENV DEPTH' },
  ],
});

const lfo = (n) => ({
  title: `LFO ${n}`,
  tint: TINT.lfo,
  about: `LFO ${n}: a slow wave that moves the pitch, pulse width, filter or level of this tone.`,
  w: 386,
  h: 214,
  items: [
    { p: `upper.lfo${n}.shape`, kind: 'combo', x: 12, y: 42, w: 92, label: 'WAVE' },
    { p: `upper.lfo${n}.tempoSyncNote`, kind: 'combo', x: 116, y: 42, w: 70, label: 'NOTE' },
    { p: `upper.lfo${n}.tempoSync`, kind: 'switch', x: 200, y: 38, label: 'TEMPO SYNC' },
    { p: `upper.lfo${n}.keyTrigger`, kind: 'switch', x: 284, y: 38, label: 'KEY TRIG' },
    { p: `upper.lfo${n}.rate`, kind: 'knob', x: 20, y: 100, label: 'RATE' },
    { p: `upper.lfo${n}.fadeTime`, kind: 'knob', x: 92, y: 100, label: 'FADE' },
    { p: `upper.lfo${n}.depth1`, kind: 'knob', x: 186, y: 100, label: 'DEPTH 1' },
    { p: `upper.lfo${n}.depth2`, kind: 'knob', x: 298, y: 100, label: 'DEPTH 2' },
    { p: `upper.lfo${n}.destination1`, kind: 'combo', x: 164, y: 182, w: 96, label: 'DEST 1' },
    { p: `upper.lfo${n}.destination2`, kind: 'combo', x: 276, y: 182, w: 96, label: 'DEST 2' },
  ],
});

const envelopeFaders = (prefix, x0) => ['attack', 'decay', 'sustain', 'release'].map((stage, i) => ({
  p: `${prefix}.${stage}`, kind: 'fader', x: x0 + i * 38, y: 40, label: stage[0].toUpperCase(),
}));

export const SECTIONS = {
  osc1: oscillator(1),
  osc2: oscillator(2),
  mixMod: {
    title: 'MIX/MOD',
    tint: TINT.mix,
    about: 'How the two oscillators are combined — mixed, synced or ring-modulated — and their balance.',
    w: 200,
    h: 214,
    items: [
      { p: 'upper.mixMod.type', kind: 'combo', x: 12, y: 42, w: 110, label: 'MOD' },
      { p: 'upper.mixMod.lowFreq', kind: 'combo', x: 12, y: 112, w: 110, label: 'LOW FREQ' },
      { p: 'upper.mixMod.balance', kind: 'knob', x: 136, y: 100, label: 'OSC BAL' },
    ],
  },
  lfo1: lfo(1),
  lfo2: lfo(2),
  pitchEnv: {
    title: 'PITCH ENV',
    tint: TINT.source,
    about: 'The pitch envelope both oscillators follow, by their ENV DEPTH.',
    w: 120,
    h: 196,
    items: [
      { p: 'upper.pitchEnv.attack', kind: 'fader', x: 26, y: 40, label: 'A' },
      { p: 'upper.pitchEnv.decay', kind: 'fader', x: 70, y: 40, label: 'D' },
    ],
  },
  filter: {
    title: 'FILTER',
    tint: TINT.filter,
    about: 'The filter, and the envelope that moves its cutoff by ENV DEPTH.',
    w: 530,
    h: 196,
    items: [
      { p: 'upper.filter.type', kind: 'combo', x: 12, y: 42, w: 100, label: 'TYPE' },
      { p: 'upper.filter.slope', kind: 'combo', x: 126, y: 42, w: 90, label: 'SLOPE' },
      { p: 'upper.filter.cutoff', kind: 'knob', x: 20, y: 100, label: 'CUTOFF' },
      { p: 'upper.filter.resonance', kind: 'knob', x: 88, y: 100, label: 'RESONANCE' },
      { p: 'upper.filter.cutoffKeyfollow', kind: 'knob', x: 156, y: 100, label: 'KEY FOLLOW' },
      { p: 'upper.filter.cutoffVelocity', kind: 'knob', x: 224, y: 100, label: 'VELO SENS' },
      { p: 'upper.filterEnv.depth', kind: 'knob', x: 292, y: 100, label: 'ENV DEPTH' },
      ...envelopeFaders('upper.filterEnv', 372),
    ],
  },
  amp: {
    title: 'AMP',
    tint: TINT.amp,
    about: 'The level, its overdrive, its pan, and the envelope that shapes it.',
    w: 452,
    h: 196,
    items: [
      { p: 'upper.amp.overdriveSwitch', kind: 'switch', x: 12, y: 38, label: 'OVERDRIVE' },
      { p: 'upper.amp.overdriveDrive', kind: 'knob', x: 20, y: 100, label: 'DRIVE' },
      { p: 'upper.amp.level', kind: 'knob', x: 88, y: 100, label: 'LEVEL' },
      { p: 'upper.amp.velocitySens', kind: 'knob', x: 156, y: 100, label: 'VELO SENS' },
      { p: 'upper.amp.pan', kind: 'knob', x: 224, y: 100, label: 'PAN' },
      ...envelopeFaders('upper.ampEnv', 300),
    ],
  },
  performance: {
    title: 'PERFORMANCE',
    tint: TINT.play,
    about: 'How the tone plays: its voice mode, portamento, bend range and octave.',
    w: 300,
    h: 196,
    items: [
      { p: 'upper.portamento.switch', kind: 'switch', x: 12, y: 38, label: 'PORTAMENTO' },
      { p: 'upper.monoSolo', kind: 'combo', x: 96, y: 42, w: 130, label: 'MODE' },
      { p: 'upper.pitchBend.range', kind: 'knob', x: 20, y: 100, label: 'BEND RANGE' },
      { p: 'upper.octaveShift', kind: 'knob', x: 100, y: 100, label: 'OCTAVE' },
      { p: 'upper.portamento.time', kind: 'knob', x: 180, y: 100, label: 'PORTA TIME' },
    ],
  },
  effects: {
    title: 'EFFECTS',
    tint: TINT.effects,
    about: 'How much of this tone goes to the delay and the reverb.',
    w: 182,
    h: 196,
    items: [
      { p: 'upper.delay.depth', kind: 'knob', x: 32, y: 100, label: 'DELAY' },
      { p: 'upper.reverb.depth', kind: 'knob', x: 102, y: 100, label: 'REVERB' },
    ],
  },
};

export const SECTION_ROWS = [
  { h: 214, sections: ['osc1', 'osc2', 'mixMod', 'lfo1', 'lfo2'] },
  { h: 196, sections: ['pitchEnv', 'filter', 'amp', 'performance', 'effects'] },
];

/* ------------------------------------------------------------------ the hardware look */

// What the tutorial in the draft's notepad ends at: the same parameters on the same packages, in
// the SH-201's own colours and arrangement. The top row is the silver signal path — OSC 1, OSC 2,
// Mix/Mod, Filter, Amp — with Effects on the black body beside it; the bottom row is the black
// modulation row — Pitch Env, the LFOs, and the two envelopes, which on the instrument are sections
// of their own rather than part of Filter and Amp.

export const HARDWARE_SKIN = {
  ...SKIN,
  panelBg: 'FF121314',
  plate: 'FF1B1C1E',
  plateEdge: 'FF2E3033',
  silver: 'FFCBCCC7',
  black: 'FF1E1F21',
  blackEdge: 'FF45484C',
  onSilver: 'FF141516',
  onBlack: 'FFE6E7E8',
  flow: 'FFD9402B',
  brand: 'FFF2F3F4',
  model: 'FFF2F3F4',
  toneLit: 'FFE8432D',
};

const pick = (key, overrides) => ({ ...SECTIONS[key], ...overrides });
const stages = ['attack', 'decay', 'sustain', 'release'];

export const HARDWARE_SECTIONS = {
  osc1: pick('osc1', { surface: 'silver', h: 196 }),
  osc2: pick('osc2', { surface: 'silver', h: 196 }),
  mixMod: pick('mixMod', { surface: 'silver', h: 196 }),
  filter: {
    title: 'FILTER',
    surface: 'silver',
    about: 'The filter. Its envelope is the FILTER ENV section below, as on the instrument.',
    w: 300,
    h: 196,
    items: [
      { p: 'upper.filter.type', kind: 'combo', x: 12, y: 42, w: 100, label: 'TYPE' },
      { p: 'upper.filter.slope', kind: 'combo', x: 126, y: 42, w: 90, label: 'SLOPE' },
      { p: 'upper.filter.cutoff', kind: 'knob', x: 20, y: 100, label: 'CUTOFF' },
      { p: 'upper.filter.resonance', kind: 'knob', x: 88, y: 100, label: 'RESONANCE' },
      { p: 'upper.filter.cutoffKeyfollow', kind: 'knob', x: 156, y: 100, label: 'KEY FOLLOW' },
      { p: 'upper.filter.cutoffVelocity', kind: 'knob', x: 224, y: 100, label: 'VELO SENS' },
    ],
  },
  amp: {
    title: 'AMP',
    surface: 'silver',
    about: 'The level, its overdrive and its pan. Its envelope is the AMP ENV section below.',
    w: 300,
    h: 196,
    items: SECTIONS.amp.items.filter((item) => item.kind !== 'fader'),
  },
  effects: pick('effects', { surface: 'black', w: 166, h: 196, items: [
    { p: 'upper.delay.depth', kind: 'knob', x: 24, y: 100, label: 'DELAY' },
    { p: 'upper.reverb.depth', kind: 'knob', x: 92, y: 100, label: 'REVERB' },
  ] }),
  pitchEnv: pick('pitchEnv', { surface: 'black', h: 214 }),
  lfo1: pick('lfo1', { surface: 'black' }),
  lfo2: pick('lfo2', { surface: 'black' }),
  filterEnv: {
    title: 'FILTER ENV',
    surface: 'black',
    about: 'The envelope that moves the filter\'s cutoff, by DEPTH.',
    w: 214,
    h: 214,
    items: [
      ...stages.map((stage, i) => ({ p: `upper.filterEnv.${stage}`, kind: 'fader', x: 16 + i * 38, y: 40, label: stage[0].toUpperCase() })),
      { p: 'upper.filterEnv.depth', kind: 'fader', x: 170, y: 40, label: 'DEPTH' },
    ],
  },
  ampEnv: {
    title: 'AMP ENV',
    surface: 'black',
    about: 'The envelope that shapes the level.',
    w: 172,
    h: 214,
    items: stages.map((stage, i) => ({ p: `upper.ampEnv.${stage}`, kind: 'fader', x: 16 + i * 38, y: 40, label: stage[0].toUpperCase() })),
  },
  performance: pick('performance', { surface: 'black', h: 214 }),
};

export const HARDWARE_ROWS = [
  { h: 196, sections: ['osc1', 'osc2', 'mixMod', 'filter', 'amp', 'effects'], flow: true },
  // As tall as the draft's LFO row: the LFOs' destination lists sit under their depth knobs.
  { h: 214, sections: ['pitchEnv', 'lfo1', 'lfo2', 'filterEnv', 'ampEnv', 'performance'] },
];
