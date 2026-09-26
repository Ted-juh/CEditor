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

  // A new mode starts here: set_mode's byte, then whatever calls the page takes, before draw().
  custom: {
    mode: 1,
    calls: 'set_labels s"CUSTOM" s"one" s"two" s"" s"" s"" s"" s"" s""\nset_values 1 10 64 127 0 0 0 0 0',
  },
});
