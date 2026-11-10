// Elektron Tonverk: the MIDI appendix of its user manual, OS 1.4.1: a CC table with a column for each
// kind of track (audio, bus, FX send, mix), and NRPN tables for audio tracks and the Subtracks machine.

export default {
  id: 'elektron-tonverk',
  name: 'Elektron Tonverk',
  family: 'Tonverk',
  description: 'Elektron Tonverk sampler: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints for each kind of track, on the audio, bus, FX send and mix track channels.',
  document: { title: 'Tonverk User Manual, OS 1.4.1', file: 'Tonverk-User-Manual_ENG_OS1.4.1_260923.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/09/Tonverk-User-Manual_ENG_OS1.4.1_260923.pdf' },
  read: 'columns',
  appendix: '^APPENDIX D: MIDI',
  // TRACK/BUS/SEND/MIX CHANNEL: each kind of track on its own.
  channels: [[/ \/ Bus tracks \//, 'busChannel'], [/ \/ FX send tracks \//, 'sendChannel'], [/ \/ Mix track \//, 'mixChannel']],
  // The kind of track, then the block a name begins with (`SRC 1`, `FX 2`, `VOICE LFO1`, `AMP`).
  groupOf: (r) => {
    const kind = /Subtracks/.test(r.table) ? 'Subtrack 1' : r.table.replace(/ tracks?$/, '').replace(/^FX send$/, 'FX Send');
    const block = /^(SRC \d|FX \d|VOICE LFO\d|FX LFO\d|MOD ENV|FLTR|AMP|TRIG|SRC|In [AB]|Retrig)\b/.exec(r.name)?.[1];
    return `${kind}${block ? ` ${block.replace(/^In ([AB])$/, 'Input $1')}` : ''}`;
  },
  // CC 31 is printed `SRC 1 Data entry knob H`, as CC 23 is: between SRC 2's knob G (30) and nothing,
  // it is SRC 2's.
  fix: (r) => (r.cc === 31 && r.name === 'SRC 1 Data entry knob H (machine dependent)' ? { name: 'SRC 2 Data entry knob H (machine dependent)' } : null),
  variables: { busChannel: 13, sendChannel: 14, mixChannel: 16 },
  unprinted: ['busChannel', 'sendChannel', 'mixChannel'],
  settingOf: {
    busChannel: 'BUS CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS)',
    sendChannel: 'SEND CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS)',
    mixChannel: 'MIX CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
  notes: [
    'The Subtracks machine\'s parameters are laid out for subtrack 1 (NRPN MSB 1); subtracks 2 - 8 are the same at MSB 2 - 8.',
  ],
};
