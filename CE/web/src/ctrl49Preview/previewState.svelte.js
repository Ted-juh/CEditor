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
    page: 2,
    pages: 5,
    slots: [
      slot('Cutoff', 88, { valueText: '2.40 kHz' }), slot('Resonance', 34, { valueText: '27 %' }),
      slot('Env Amt', 64, { valueText: '+0.6' }), slot('Key Track', 100, { valueText: '79 %' }),
      slot('Drive', 12, { valueText: '1.2 dB' }), slot('Filter Type', 0, { resolved: false, valueText: '' }),
      slot('', 0, { assigned: false, valueText: '' }), slot('HP Cutoff', 20, { valueText: '42 Hz' }),
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
    names: 'Wool Pad | STAGE KEYS\nGlass Choir | DIVA\n!Missing Plugin Pad | ANALOG LAB\nSlow Strings Ensemble | STAGE KEYS\nNight Drive\nVapour | HW - JUNO-106\nFelt Keys\nAir',
    cursor: 1,
    columns: 12,
  },

  // The two stage pages (Ctrl49StagePages.h): the rack's zones over the keys, and the set checked.
  layers: {
    focused: 1,
    held: '43 70, 64 112, 67 96',
    parts: [
      { name: 'Sub Bass', keyLow: 24, keyHigh: 54, velocityLow: 1, velocityHigh: 127, transpose: 0 },
      // Glass Pad and Strings share layer group 1 by velocity, crossfading around 75.
      { name: 'Glass Pad', keyLow: 48, keyHigh: 96, velocityLow: 1, velocityHigh: 127, transpose: 12,
        group: 1, source: 0, layerLow: 0, layerHigh: 70, layerFade: 12 },
      { name: 'Strings', keyLow: 48, keyHigh: 96, velocityLow: 1, velocityHigh: 127, transpose: 0,
        group: 1, source: 0, layerLow: 80, layerHigh: 127, layerFade: 12 },
      { name: 'Brass Stabs', keyLow: 60, keyHigh: 84, velocityLow: 100, velocityHigh: 127, transpose: -12 },
      // A key layer: its band ramps in over the crossfade rather than stopping at a key.
      { name: 'Choir', keyLow: 55, keyHigh: 96, velocityLow: 1, velocityHigh: 127, transpose: 0,
        group: 2, source: 1, layerLow: 72, layerHigh: 127, layerFade: 6 },
      { name: 'Arp Lead', keyLow: 0, keyHigh: 127, velocityLow: 1, velocityHigh: 127, transpose: 0, fromKeyboard: false },
    ],
  },

  soundcheck: {
    selected: 1,
    current: 0,
    basis: 'Current rig at check time',
    seconds: 42,
    preloadOff: true,
    songs: [
      { name: 'Glass Harbour', checked: true, problems: [], measured: true, rmsDb: -18.4, peakDb: -3.2, loadSeconds: 0.4 },
      { name: 'Salt Road', checked: true, problems: ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing'],
        measured: true, rmsDb: -22.0, peakDb: -6.5, loadSeconds: 7.8 },
      { name: 'Night Bus', checked: false, problems: [] },
      { name: 'Paper Lanterns', checked: true, problems: [], measured: true, rmsDb: -14.1, peakDb: -1.0, loadSeconds: 2.1,
        preloaded: true },
      { name: 'Encore', checked: true, problems: [] },
    ],
  },

  // The focused part's sound against a save of it (state: 0 a problem, 1 nothing changed, 2 changed).
  changes: {
    state: 2, selected: 1, total: 312, listen: 100, back: 0, saves: 3, putBack: 0,
    sound: 'Glass Pad', against: 'your last save', when: '05 Oct 18:42',
    problemText: 'Load a sound from the library to compare against its save.',
    rows: [
      { name: 'Cutoff', savedText: '2.1 kHz', nowText: '4.8 kHz', saved: 40, now: 62 },
      { name: 'Resonance', savedText: '12 %', nowText: '30 %', saved: 12, now: 30 },
      { name: 'Env Amount', savedText: '+20', nowText: '+45', saved: 60, now: 72 },
      { name: 'Attack', savedText: '4 ms', nowText: '120 ms', saved: 5, now: 38 },
      { name: 'Chorus Mix', savedText: 'Off', nowText: '35 %', saved: 0, now: 35 },
      { name: 'Drive', savedText: '0.0 dB', nowText: '3.5 dB', saved: 0, now: 18 },
    ],
  },

  // The setlist's cue screen. `sections` off shows the song's notes and its clock instead.
  cue: {
    sections: true,
    picked: false,
    view: {
      songs: 6, current: 1, picked: 2, song: 'Night Bus', tempo: 124, songSeconds: 252, setSeconds: 2282,
      plannedSeconds: 300, notes: ['Capo 2. Long intro.', 'Watch the drummer for the stop.'],
      section: 'Bridge', sectionBar: 1, sectionBars: 4, nextSection: 'Chorus', nextSong: 'Glass Harbour',
      nextReady: 30, pickedSong: 'Paper Lanterns',
    },
  },

  // What you own and have never opened, nearest to what you load (state: 0 not enough to go on,
  // 1 suggestions, 2 nothing new). Points are brightness across, attack up, 0-100.
  discover: {
    state: 1,
    selected: 1,
    neverOpened: 11903,
    regularsCounted: 14,
    kind: '',
    centre: { x: 46, y: 52 },
    likeName: 'Lush Pad 19',
    likeLoads: 11,
    sounds: [
      { name: 'Wide Pad 68', instrument: 'Nebula', at: { x: 44, y: 58 }, percent: 91 },
      { name: 'Gritty Strings 62', instrument: 'Nebula', at: { x: 55, y: 49 }, percent: 89, kept: true },
      { name: 'Thin FX 19', instrument: 'Nebula', at: { x: 38, y: 44 }, percent: 86 },
      { name: 'Soft FX 13', instrument: 'Nebula', at: { x: 52, y: 63 }, percent: 84 },
      { name: 'Lush Brass 6', instrument: 'Brasswork', at: { x: 61, y: 40 }, percent: 80 },
      { name: 'Hollow Strings 61', instrument: 'Stringfield', at: { x: 35, y: 61 }, percent: 78 },
      { name: 'Broken Keys 54', instrument: 'Keys 73', at: { x: 58, y: 30 }, percent: 75 },
      { name: 'Bright Strings 12', instrument: 'Nebula', at: { x: 70, y: 52 }, percent: 71 },
      { name: 'Glass Bells 3', instrument: 'Nebula', at: { x: 80, y: 22 }, percent: 66 },
    ],
    regulars: Array.from({ length: 40 }, (_, i) => ({
      x: Math.round(46 + 22 * Math.sin(i * 2.4) * ((i % 7) / 7)),
      y: Math.round(52 + 22 * Math.cos(i * 2.4) * ((i % 5) / 5)),
    })),
  },

  // A new mode starts here: set_mode's byte, then whatever calls the page takes, before draw().
  custom: {
    mode: 1,
    calls: 'set_labels s"CUSTOM" s"one" s"two" s"" s"" s"" s"" s"" s""\nset_values 1 10 64 127 0 0 0 0 0',
  },
});
