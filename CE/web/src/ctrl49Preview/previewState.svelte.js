// What the preview is showing. A module of its own so it outlives a hot reload: saving the Lua
// page reloads the component that imports it, and losing every label typed so far on each save
// would make the preview a chore to use.

const slot = (label, position, extra = {}) => ({ label, position, assigned: true, resolved: true, ...extra });

export const preview = $state({
  scene: 'control',
  scale: 2,

  control: {
    title: 'Diva Filter',
    active: 0,
    slots: [
      slot('Cutoff', 88), slot('Resonance', 34), slot('Env Amt', 64), slot('Key Track', 100),
      slot('Drive', 12), slot('Filter Type', 0, { resolved: false }), slot('', 0, { assigned: false }), slot('HP Cutoff', 20),
    ],
  },

  performance: {
    transport: { playing: true, bar: 3, beat: 2, tempo: 122, externalClock: false, clockLost: false },
    active: 0,
    clips: [
      { name: 'Bass A', active: true, pending: false, phase: 0.4 },
      { name: 'Bass B', active: false, pending: true, phase: 0 },
      { name: 'Keys', active: true, pending: false, phase: 0.75 },
      { name: 'Arp', active: false, pending: false, phase: 0 },
      { name: '', active: false, pending: false, phase: 0 },
      { name: '', active: false, pending: false, phase: 0 },
      { name: '', active: false, pending: false, phase: 0 },
      { name: '', active: false, pending: false, phase: 0 },
    ],
  },

  browse: {
    title: 'SOUNDS - Pads - 3/128',
    names: 'Wool Pad\nGlass Choir\n!Missing Plugin Pad\nSlow Strings Ensemble\nNight Drive\nVapour\nFelt Keys\nAir',
    cursor: 1,
    columns: 12,
  },

  // The two stage pages (Ctrl49StagePages.h): the rack's zones over the keys, and the set checked.
  layers: {
    focused: 1,
    held: '43 70, 64 112, 67 96',
    parts: [
      { name: 'Sub Bass', keyLow: 24, keyHigh: 54, velocityLow: 1, velocityHigh: 127, transpose: 0 },
      { name: 'Glass Pad', keyLow: 48, keyHigh: 96, velocityLow: 1, velocityHigh: 127, transpose: 12 },
      { name: 'Brass Stabs', keyLow: 60, keyHigh: 84, velocityLow: 100, velocityHigh: 127, transpose: -12 },
      { name: 'Choir', keyLow: 55, keyHigh: 96, velocityLow: 1, velocityHigh: 127, transpose: 0, muted: true },
      { name: 'Arp Lead', keyLow: 0, keyHigh: 127, velocityLow: 1, velocityHigh: 127, transpose: 0, fromKeyboard: false },
    ],
  },

  soundcheck: {
    selected: 1,
    current: 0,
    basis: 'Current rig at check time',
    seconds: 42,
    songs: [
      { name: 'Glass Harbour', checked: true, problems: [], measured: true, rmsDb: -18.4, peakDb: -3.2 },
      { name: 'Salt Road', checked: true, problems: ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing'],
        measured: true, rmsDb: -22.0, peakDb: -6.5 },
      { name: 'Night Bus', checked: false, problems: [] },
      { name: 'Paper Lanterns', checked: true, problems: [], measured: true, rmsDb: -14.1, peakDb: -1.0 },
      { name: 'Encore', checked: true, problems: [] },
    ],
  },

  // A new mode starts here: set_mode's byte, then whatever calls the page takes, before draw().
  custom: {
    mode: 1,
    calls: 'set_labels s"CUSTOM" s"one" s"two" s"" s"" s"" s"" s"" s""\nset_values 1 10 64 127 0 0 0 0 0',
  },
});
