// One list of calls for ce.file's byte commands, run through the panel view's fileCore.js and the
// JavaScript, Lua and Python preludes by test/fileParity.test.js. The MIDI files are built here by
// hand, byte by byte, so what they hold is known without the code that reads them.

const vlq = (n) => {
  const groups = [n & 0x7F];
  let v = n >> 7;
  while (v > 0) { groups.unshift((v & 0x7F) | 0x80); v >>= 7; }
  return groups;
};
const chunk = (id, body) => [...[...id].map((c) => c.charCodeAt(0)), (body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255, ...body];
const header = (format, tracks, division) => chunk('MThd', [0, format, 0, tracks, (division >> 8) & 255, division & 255]);

// Track 1, the conductor: 120 BPM, 3/4, then 100 BPM at beat 2 (96 ticks a beat).
const CONDUCTOR = [
  0, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,
  0, 0xFF, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08,
  ...vlq(192), 0xFF, 0x51, 0x03, 0x09, 0x27, 0xC0,
  0, 0xFF, 0x2F, 0x00,
];
// Track 2: a name, a program change, two notes (one by running status, one ended by velocity 0),
// a controller, a SysEx message, and a note that never ends.
const BASS = [
  0, 0xFF, 0x03, 0x04, 0x42, 0x61, 0x73, 0x73,
  0, 0xC0, 0x05,
  0, 0x90, 0x24, 0x64,
  48, 0x3C, 0x50,
  48, 0x24, 0x00,
  0, 0x80, 0x3C, 0x40,
  24, 0xB0, 0x07, 0x64,
  0, 0xF0, 0x03, 0x41, 0x10, 0xF7,
  24, 0x91, 0x30, 0x70,
  48, 0xFF, 0x2F, 0x00,
];
// Track 3: a name in Latin-1 ("Bäss" as one byte per letter), and nothing else.
const LATIN = [0, 0xFF, 0x03, 0x04, 0x42, 0xE4, 0x73, 0x73, 0, 0xFF, 0x2F, 0x00];
// Track 4: the same name in UTF-8.
const UTF8 = [0, 0xFF, 0x03, 0x05, 0x42, 0xC3, 0xA4, 0x73, 0x73, 0, 0xFF, 0x2F, 0x00];

export const SONG_FILE = [...header(1, 4, 96), ...chunk('MTrk', CONDUCTOR), ...chunk('MTrk', BASS), ...chunk('MTrk', LATIN), ...chunk('MTrk', UTF8)];
const TYPE2 = [...header(2, 1, 96), ...chunk('MTrk', [0, 0xFF, 0x2F, 0x00])];
const SMPTE = [...header(0, 1, 0xE728), ...chunk('MTrk', [0, 0xFF, 0x2F, 0x00])];
const CUT = [...header(0, 1, 96), ...chunk('MTrk', [0, 0x90, 0x3C])];

export const CLOCK = { tempo: null, beatsPerBar: 4 };

export const CALLS = [
  // SysEx
  ['syxSplit', [[0xF0, 1, 2, 0xF7, 0xF0, 0x41, 3, 0xF7]]],
  ['syxSplit', ['F0 41 10 F7 00 F0 42 F7']],
  ['syxSplit', ['0xF04110F7']],
  ['syxSplit', [[0xF0, 1, 0xF0, 2, 0xF7, 0xF0, 3]]],
  ['syxSplit', [[0xF0, 1, 0xF0, 2, 0xF7, 0xF0, 3], { partial: true }]],
  ['syxSplit', [[0xF0, 0x41, 1, 0xF7, 0xF0, 0x43, 2, 0xF7, 0xF0, 0x41, 3, 0xF7], { prefix: [0xF0, 0x41] }]],
  ['syxSplit', [[0xF0, 0x41, 1, 0xF7], { prefix: 'F0 4' }]],
  ['syxSplit', [[1, 2, 3]]],
  ['syxSplit', [[]]],
  ['syxSplit', ['xyz']],
  ['syxSplit', [[0xF0, 300]]],
  ['syxJoin', [[[0xF0, 1, 0xF7], 'F0 02 F7']]],
  ['syxJoin', [[]]],
  ['syxJoin', [[[0xF0, 1, 0xF7], [0xF0, 1]]]],
  ['syxJoin', ['F0 F7']],

  // reading MIDI files
  ['midiRead', [SONG_FILE]],
  ['midiRead', [SONG_FILE, { track: 2 }]],
  ['midiRead', [SONG_FILE, { track: 5 }]],
  ['midiRead', [SONG_FILE, { track: 1.5 }]],
  ['midiRead', [TYPE2]],
  ['midiRead', [SMPTE]],
  ['midiRead', [CUT]],
  ['midiRead', [[1, 2, 3]]],
  ['midiRead', ['not hex']],

  // writing MIDI files
  ['midiWrite', [[{ beat: 0, note: 60, velocity: 100, length: 1 }, { beat: 1, note: 64, length: 0.5, channel: 2 }], { tempo: 100, name: 'Lead' }]],
  ['midiWrite', [[{ beat: 0, note: 60 }, { beat: 0.25, note: 60, length: 0.25 }], { name: 'Bäss', channel: 10 }]],
  ['midiWrite', [{
    ticksPerBeat: 96, tempo: 120, tempos: [{ beat: 0, bpm: 120 }, { beat: 2, bpm: 100 }], timeSignature: [3, 4],
    tracks: [
      { name: '', notes: [], events: [] },
      { name: 'Bass', notes: [{ beat: 0, note: 36, velocity: 100, length: 1, channel: 1 }], events: [{ beat: 0, bytes: [0xC0, 5] }, { beat: 1.25, bytes: [0xF0, 0x41, 0x10, 0xF7] }] },
    ],
  }]],
  ['midiWrite', [{ bars: 1, channel: 3, take: { events: [{ t: 0, note: 60, velocity: 90, dur: 0.25 }, { t: 0.5, note: 62, dur: 0.125 }] } }]],
  ['midiWrite', [{ bars: 2, take: { events: [{ t: 0.25, note: 67, velocity: 80, dur: 0.5 }] } }, { tempo: 90 }]],
  ['midiWrite', [42]],
  ['midiWrite', [[{ note: 60 }]]],
  ['midiWrite', [{ tracks: [{ notes: [], events: [{ beat: 0 }] }] }]],
  ['midiWrite', [[]]],
];
