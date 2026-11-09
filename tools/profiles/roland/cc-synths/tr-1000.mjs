// TR-1000. MIDI Implementation Chart, version 1.50.

export default {
  id: 'roland-tr-1000',
  name: 'Roland TR-1000',
  family: 'TR',
  chart: 'tr-1000',
  description: 'Roland TR-1000 Rhythm Creator, from the control changes in its MIDI Implementation Chart.',
  groups: [
    ...['BD', 'SD', 'LT', 'HT', 'RS', 'HC', 'CH', 'OH', 'CC', 'RC'].map((inst) => [inst, new RegExp(`^${inst}\\s+`)]),
    ['Effects', /^(MASTER FX .*|ANALOG FX ON|FILTER|DRIVE|DELAY .*|REVERB .*|EXT IN)$/],
    ['Common', /^MORPH$/],
  ],
  presets: {
    banks: [{ id: 'pattern', label: 'Pattern', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
