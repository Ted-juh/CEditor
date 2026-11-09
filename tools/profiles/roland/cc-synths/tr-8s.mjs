// TR-8S. MIDI Implementation Chart, version 1.10, Oct. 4, 2018.

export default {
  id: 'roland-tr-8s',
  name: 'Roland TR-8S',
  family: 'TR',
  chart: 'tr-8s',
  description: 'Roland TR-8S Rhythm Performer, from the control changes in its MIDI Implementation Chart.',
  groups: [
    ...['BD', 'SD', 'LT', 'MT', 'HT', 'RS', 'HC', 'CH', 'OH', 'CC', 'RC'].map((inst) => [inst, new RegExp(`^${inst}\\s+`)]),
    ['Effects', /^(MASTER FX \[ON\]|MASTER FX CTRL|DELAY LEVEL|DELAY TIME|DELAY FEEDBACK|REVERB LEVEL|EXTERNAL IN LEVEL)$/],
    ['Common', /^(SHUFFLE|ACCENT|AUTO FILL IN .*)$/],
  ],
  presets: {
    banks: [{ id: 'pattern', label: 'Pattern', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
