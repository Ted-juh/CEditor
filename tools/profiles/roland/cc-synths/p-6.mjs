// P-6 (AIRA Compact). "Control change message" in the P-6 Owner's Manual (version 1.02), p149-150:
// every number in decimal and hexadecimal (which agree throughout), the parameter and the page
// that explains it. They are received on the Granular MIDI Channel (version 1.02 and later).

export default {
  id: 'roland-p-6',
  name: 'Roland P-6',
  family: 'AIRA Compact',
  chart: 'p-6',
  description: 'Roland AIRA Compact P-6 Creative Sampler, granular engine and effects, from the Control change message list in its Owner\'s Manual.',
  documentTitle: 'Owner\'s Manual, Control change message',
  groups: [
    ['Granular', /^GRANULAR\s+/],
    ['Delay/Reverb', /^DELAY\/REVERB\s+/],
  ],
  presets: {
    banks: [{ id: 'pattern', label: 'Pattern', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 }],
    recall: { kind: 'pc' },
  },
  notes: ['Program Change 0 - 63 changes the pattern, on the Program Change Channel (Pc.Ch) set on the instrument (chart and p146).'],
};
