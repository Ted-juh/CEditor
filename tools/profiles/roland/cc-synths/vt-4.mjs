// VT-4 Voice Transformer. The MIDI Implementation Chart (version 1.02, Nov. 16, 2018) at the end
// of the VT-4 MIDI Implementation, p7. Its circle extracts as `6` in this document's font; the
// chart's own legend says `6 : Yes`, which is how the reader knows.
//
// The chart prints `(0, 127)` beside the effect switches: the two values they take, which become
// the parameter's two choices.

export default {
  id: 'roland-vt-4',
  name: 'Roland VT-4',
  family: 'AIRA',
  chart: 'vt-4',
  description: 'Roland VT-4 Voice Transformer, from the control changes in its MIDI Implementation Chart.',
  groups: [
    ['Effects', /^(ROBOT|MEGAPHONE|VOCODER|HARMONY|BYPASS|REVERB)\b/],
    ['Voice', /^(KEY|FORMANT|AUTO PITCH|BALANCE)$/],
    ['Common', /^(VOLUME|MIC SENS|LINE OUT SELECT|MODULATION|MODULATION RATE)\b/],
  ],
  presets: {
    banks: [{ id: 'scene', label: 'Scene', role: 'user', writable: false, startSlot: 0, slotCount: 9, programBase: 0, names: ['MANUAL', 'Scene 1', 'Scene 2', 'Scene 3', 'Scene 4', 'Scene 5', 'Scene 6', 'Scene 7', 'Scene 8'] }],
    recall: { kind: 'pc' },
  },
  notes: ['Program Change 0 - 8 recalls MANUAL and Scenes 1 - 8 (chart, Program Change remarks); the VT-4 itself sends 0 - 4.'],
};
