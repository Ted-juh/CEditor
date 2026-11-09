// TR-6S. MIDI Implementation Chart, version 1.00, Apr. 22, 2020.

export default {
  id: 'roland-tr-6s',
  name: 'Roland TR-6S',
  family: 'TR',
  chart: 'tr-6s',
  description: 'Roland TR-6S Rhythm Performer, from the control changes in its MIDI Implementation Chart.',
  groups: [
    ...['BD', 'SD', 'LT', 'HC', 'CH', 'OH'].map((inst) => [inst, new RegExp(`^${inst}\\s+`)]),
    ['Effects', /^(MASTER FX|MASTER FX CTRL|DELAY LEVEL|DELAY TIME|DELAY FEEDBACK|REVERB LEVEL)$/],
    ['Common', /^(BEAT|SHUFFLE|FILL IN TRIG|ACCENT)$/],
  ],
  presets: {
    banks: [{ id: 'pattern', label: 'Pattern', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
