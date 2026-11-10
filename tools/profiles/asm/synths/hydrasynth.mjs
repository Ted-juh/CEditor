// ASM Hydrasynth (Keyboard and Desktop): the MIDI NRPN & CC Communication Spec, firmware 1.5.

export default {
  id: 'asm-hydrasynth',
  name: 'ASM Hydrasynth',
  family: 'Hydrasynth',
  description: 'ASM Hydrasynth Keyboard and Desktop wave-morphing synthesizer: every parameter of ASM\'s MIDI NRPN specification, sent as NRPN (the instrument\'s Param RX set to NRPN).',
  document: { title: 'Hydrasynth MIDI NRPN & CC Communication Spec, firmware 1.5', file: 'Hydrasynth_KB_DR_MIDI_Spec_1.5.0.pdf', url: 'https://www.mecldata.com/download/asm/legacy/Hydrasynth_KB_DR_MIDI_Spec_1.5.0.pdf' },
  pages: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
  listPages: [26, 27],
  // The spec's category column is set in the middle of each group of rows, with nothing between
  // groups that the text shows: `ARP Chance`, the ARP group's last row, is nearer the Macro label
  // than its own. So the layout names the first row of each group, in the spec's order.
  groups: [
    ['All OSC Cent', 'OSC'],
    ['OSC1 Type', 'OSC 1'], ['OSC2 Type', 'OSC 2'], ['OSC3 Type', 'OSC 3'],
    ['Mutator Mode', 'Mutator'],
    ['Mutator1 Ratio', 'Mutator 1'], ['Mutator2 Ratio', 'Mutator 2'], ['Mutator3 Ratio', 'Mutator 3'], ['Mutator4 Ratio', 'Mutator 4'],
    ['Type of noise', 'Ring-Noise'],
    ['MIXER SOLO', 'Mixer'],
    ['Filter routing selector', 'Filter'],
    ['Filter1 Position of Drive', 'Filter 1'], ['Filter2 Position of Drive', 'Filter 2'],
    ['Amp Level', 'Amp'],
    ['PRE-FX type', 'Pre-FX'], ['Delay BPMsync', 'Delay'], ['Reverb Dry/Wet', 'Reverb'], ['POST-FX type', 'Post-FX'],
    ['LFO1 Gain', 'LFO 1'], ['LFO2 Gain', 'LFO 2'], ['LFO3 Gain', 'LFO 3'], ['LFO4 Gain', 'LFO 4'], ['LFO5 Gain', 'LFO 5'],
    ['ENV1 Delay(BPM Sync off)', 'ENV 1'], ['ENV2 Delay(BPM Sync off)', 'ENV 2'], ['ENV3 Delay(BPM Sync off)', 'ENV 3'], ['ENV4 Delay(BPM Sync off)', 'ENV 4'], ['ENV5 Delay(BPM Sync off)', 'ENV 5'],
    ['ARP Division', 'Arp'],
    ['Macro1 Target', 'Macro 1'], ['Macro2 Target', 'Macro 2'], ['Macro3 Target', 'Macro 3'], ['Macro4 Target', 'Macro 4'],
    ['Macro5 Target', 'Macro 5'], ['Macro6 Target', 'Macro 6'], ['Macro7 Target', 'Macro 7'], ['Macro8 Target', 'Macro 8'],
    ['marco1 panel value', 'Macros'],
    ['ModMatrix Mod Source', 'Mod Matrix'],
    ['Ribbon Mode', 'Ribbon'],
    ['Detune', 'Voice'],
    ['All notes off', 'Global'],
    ['CVSource', 'System'],
  ],
  // Words a line break split, and two misspellings.
  rename: [
    [/\bBP M\b/g, 'BPM'], [/One- Shot/g, 'One-Shot'], [/\bBMP Sync\b/g, 'BPM Sync'], [/^marco(\d)/, 'Macro$1'],
  ],
  renameNotes: { 'BMP Sync': 'printed `BMP Sync` (LFO 1 - 5)', marco: 'printed `marco1 panel value` … `marco8 panel value`' },
  // Each LFO's Smooth is VV=06H and Steps VV=07H (LFO 1 - 3); LFO4 prints Smooth on Steps' VV, and
  // LFO5 prints both on 08H.
  fix: {
    'LFO4 Smooth': { note: 'VV=06H set Smooth to WW' },
    'LFO5 Smooth': { note: 'VV=06H set Smooth to WW' },
    'LFO5 Steps': { note: 'VV=07H set Steps to WW' },
  },
  fixNotes: {
    'LFO4 Smooth': 'printed VV=07H, as Steps is: 06H, as LFO 1 - 3',
    'LFO5 Smooth': 'printed VV=08H: 06H, as LFO 1 - 3',
    'LFO5 Steps': 'printed VV=08H: 07H, as LFO 1 - 3',
  },
  // A value list in a comment, split by a line break.
  cleanNote: (note) => note.replace(/\bLF O5\b/g, 'LFO5'),
  // ARP Division's twelve values are the ARP rhythm list.
  lists: { 'ARP Division': 'ARP' },
  tests: [
    { group: 'Filter 1', name: 'Filter1 Cutoff', value: 4096 },
    { group: 'OSC', name: 'OSC2 Mode', label: 'WaveScan' },
    { group: 'OSC', name: 'OSC1 Semi', label: '-12' },
    { group: 'Arp', name: 'ARP Swing', value: 2 * 128 + 60 },
    { group: 'LFO 1', name: 'LFO1 Rate(BPM Sync on)', label: '1/4' },
    { group: 'Mutator', name: 'Mutator Mode 3', label: 'OSC Sync (Sync)' },
  ],
  leaveOut: {
    'All notes off': 'commands, not settings',
    'All notes off and effect silence': 'commands, not settings',
  },
};
