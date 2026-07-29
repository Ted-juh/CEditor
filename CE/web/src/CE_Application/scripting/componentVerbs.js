// componentVerbs.js — phase 7: script verbs for the rest of the panel components.
//
// The first five families (Zone Splitter, Phrase, Recorder, Harmoniser, Setlist) each got a
// hand-written reducer, because each of their actions is genuinely structural: seed a grid, step an
// index through the enabled scenes, patch one zone in an array. Twenty-three more families in the
// same style would be several thousand lines of near-identical code, and near-identical code is how
// things drift apart — the Recorder growing a clamp the Harmoniser never got.
//
// So this file is DATA. Each family declares its section and its verbs; one generic reducer turns a
// verb call into a patch; and everything downstream is generated from the same spec:
//
//   panelApi.js       the member descriptors, the modules, the ce.components.<family>.<verb> map
//   panelRuntime.js   the implementations, in one loop
//   gen-script-modules.mjs   the window-closed stub names in all three C++ engines
//
// Adding a verb is one line here, and the parity tests fail until every runtime agrees about it.
//
// What is deliberately NOT here: colours, sizes, label text, and anything else you would set once
// in the inspector and never touch again. A script verb earns its place by being worth driving
// while somebody is playing — mid-song, from a footswitch, from an incoming CC.

/* --------------------------------------------------------------------------- verb kinds */
//
//  num    a number, clamped to [min, max]
//  int    a whole number, clamped
//  bool   true/false; calling with no argument TOGGLES, so one footswitch can do both
//  str    free text
//  enum   one of `values` — anything else is a no-op rather than a wrong setting
//  xy     two numbers at once (a probe, a puck), each clamped to [min, max]
//  item   one property of one element of an array field, addressed 1-BASED
//  cell   one entry of a flat row-major grid (the Matrix), addressed 1-BASED
//  line   one entry of an array of strings (the LCD), addressed 1-BASED
//
// 1-based indexing throughout, on purpose: it is what the editor's own lists show, and a script
// that says "scene 3" should mean the third one whichever language it is written in.

import { VERB_VALUES } from './componentTables.js';

const NUM = 'num', INT = 'int', BOOL = 'bool', STR = 'str', ENUM = 'enum';
const XY = 'xy', ITEM = 'item', CELL = 'cell', LINE = 'line';
// A sorted list of INDICES that are on — the Arpeggiator stores its muted steps that way,
// as a set rather than a boolean per step, so neither `item` nor `cell` fits it.
const INDEXSET = 'indexset';
// …and the five every family gets for free, appended below rather than declared per family.
const READ = 'read', SIZE = 'size', FILL = 'fill', INSERT = 'insert', REMOVE = 'remove';
export const READ_KINDS = [READ, SIZE];
export const ARRAY_KINDS = [FILL, INSERT, REMOVE];
/** The kinds that address an array by a verb name — what `size`, `fill`, `insert` and `remove`
 *  take, and what `read` returns a list for. */
export const LIST_KINDS = [ITEM, CELL, LINE];

/** A verb: v = name inside the namespace, f = the field it writes, k = kind. */
const v = (name, field, kind, extra = {}) => ({ v: name, f: field, k: kind, ...extra });

const RATE = { min: 0.01, max: 200 };
const UNIT = { min: 0, max: 1 };
const NOTE = { min: 0, max: 127 };
const CHANNEL = { min: 1, max: 16 };
const VELOCITY = { min: 1, max: 127 };
// NO enum values are written here. Every one comes from componentTables.js, which imports the
// table the component's own switch reads — see the note at the top of that file for the
// twenty-four verbs that were wrong before it existed. `values` is filled in below, once, from
// VERB_VALUES, and a verb with no entry there is a build error rather than a silent literal.

/**
 * The families. `id` is the namespace (ce.components.<id>), `section` the model section the verbs
 * write, `prefix` the flat member id prefix (ce.components.arp.rate is also `arpRate`).
 */
export const COMPONENT_FAMILIES = [
  /* ------------------------------------------------------------------ note generators */
  {
    id: 'arp', section: 'Arp', prefix: 'arp', label: 'Arpeggiator',
    summary: 'Drive the Arpeggiator: pattern, rate, gate, swing and the Euclidean generator.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the arpeggiator. No argument toggles.' }),
      v('pattern', 'pattern', ENUM),
      v('rate', 'rate', NUM, { ...RATE, doc: 'Free-running rate in steps per second. Ignored while synced.' }),
      v('division', 'division', ENUM, { doc: 'Note value per step while synced to the transport.' }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('octaves', 'octaves', INT, { min: 1, max: 6 }),
      v('gate', 'gate', NUM, { ...UNIT, doc: 'How much of each step is held, 0..1.' }),
      v('swing', 'swing', NUM, { min: -1, max: 1 }),
      v('latch', 'latch', BOOL, { toggle: true }),
      v('key', 'key', INT, { min: 0, max: 11, doc: 'Root as a pitch class, 0 = C.' }),
      v('scale', 'scale', ENUM),
      v('degree', 'degree', INT, { min: 0, max: 6 }),
      v('chordType', 'chordType', ENUM),
      v('velocity', 'velocity', INT, VELOCITY),
      v('channel', 'channel', INT, CHANNEL),
      v('euclid', 'euclidEnabled', BOOL, { toggle: true }),
      v('euclidSteps', 'euclidSteps', INT, { min: 1, max: 32 }),
      v('euclidPulses', 'euclidPulses', INT, { min: 0, max: 32 }),
      v('euclidRotate', 'euclidRotate', INT, { min: -32, max: 32 }),
      // The four the phase-7 spec skipped. `phase` was already a verb on the Orbit and the
      // Envelope, so a script could put those on the downbeat and not the Arpeggiator; `mutes`
      // was per-step muting reachable from the grid and nowhere else, while the Looper's lanes
      // and the Orbit's nodes both had one; and the two below are what the arp LISTENS to, which
      // is a performance choice rather than an inspector one.
      v('phase', 'phase', NUM, { ...UNIT, doc: 'Where in the sequence it is, 0..1 — 0 is the downbeat.' }),
      v('mute', 'mutes', INDEXSET, { doc: 'Mute or unmute one step, 1-based. No third argument toggles.' }),
      v('inputChannel', 'inputChannel', INT, { min: 0, max: 16, doc: 'Which channel it takes notes from. 0 means omni.' }),
      v('baseOctave', 'baseOctave', INT, { min: -1, max: 8 }),
      v('source', 'source', ENUM, { doc: 'Where the notes come from: its own chord, a linked Chord Pad, or incoming MIDI.' }),
    ],
  },
  {
    id: 'chordpad', section: 'ChordPad', prefix: 'chordPad', label: 'Chord Pad',
    summary: 'Re-key, re-voice and re-channel the Chord Pad without touching the layout.',
    verbs: [
      v('mode', 'mode', ENUM),
      v('key', 'key', INT, { min: 0, max: 11 }),
      v('scale', 'scale', ENUM),
      v('chordType', 'chordType', ENUM),
      v('voicing', 'voicing', ENUM),
      v('inversion', 'inversion', INT, { min: 0, max: 3 }),
      v('octave', 'octave', INT, { min: -4, max: 4 }),
      v('velocity', 'velocity', INT, VELOCITY),
      v('channel', 'channel', INT, CHANNEL),
      v('strum', 'strumMs', NUM, { min: 0, max: 2000, doc: 'Spread the chord over this many milliseconds.' }),
      v('latch', 'latch', BOOL, { toggle: true }),
    ],
  },
  {
    id: 'noteribbon', section: 'NoteRibbon', prefix: 'noteRibbon', label: 'Note Ribbon',
    summary: 'Re-key and re-range the Note Ribbon: scale, span, bend depth, channel.',
    verbs: [
      v('mode', 'mode', ENUM),
      v('key', 'key', INT, { min: 0, max: 11 }),
      v('scale', 'scale', ENUM),
      v('baseNote', 'baseNote', INT, NOTE),
      v('octaves', 'octaves', INT, { min: 1, max: 6 }),
      v('bendRange', 'bendRange', NUM, { min: 0, max: 24 }),
      v('velocity', 'velocity', INT, VELOCITY),
      v('channel', 'channel', INT, CHANNEL),
      v('latch', 'latch', BOOL, { toggle: true }),
    ],
  },
  {
    id: 'drumpads', section: 'DrumPads', prefix: 'drumPads', label: 'Drum Pads',
    summary: 'Re-map the Drum Pads: note map, base note, gate length, channel.',
    verbs: [
      v('map', 'map', ENUM),
      v('baseNote', 'baseNote', INT, NOTE),
      v('mode', 'mode', ENUM),
      v('gate', 'gateMs', NUM, { min: 1, max: 5000 }),
      v('velocity', 'velocity', INT, VELOCITY),
      v('channel', 'channel', INT, CHANNEL),
      v('rows', 'rows', INT, { min: 1, max: 8 }),
      v('cols', 'cols', INT, { min: 1, max: 8 }),
    ],
  },

  /* ------------------------------------------------------------------- moving sources */
  {
    id: 'turing', section: 'Turing', prefix: 'turing', label: 'Turing Machine',
    summary: 'Drive the Turing Machine: run, rate, length, randomness, and individual steps.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true }),
      v('rate', 'rate', NUM, RATE),
      v('division', 'division', ENUM),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('length', 'length', INT, { min: 1, max: 64 }),
      v('randomness', 'randomness', NUM, UNIT),
      v('quantize', 'quantizeLevels', INT, { min: 0, max: 32, doc: '0 leaves the steps continuous.' }),
      v('gate', 'gateThreshold', NUM, UNIT),
      v('step', 'steps', CELL, { ...UNIT, doc: 'Set one step of the sequence, 1-based.' }),
      v('phase', 'phase', NUM, { ...UNIT, doc: 'Where in the sequence it is, 0..1.' }),
    ],
  },
  {
    id: 'looper', section: 'Looper', prefix: 'looper', label: 'Looper',
    summary: 'Drive the Looper: run, loop length, sync, and per-lane enable.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true }),
      v('seconds', 'loopSeconds', NUM, { min: 0.05, max: 600 }),
      v('bars', 'loopBars', INT, { min: 1, max: 64 }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('quantize', 'quantizeLoop', BOOL, { toggle: true }),
      v('lane', 'lanes', ITEM, { item: 'enabled', kind: BOOL, doc: 'Enable or mute one lane, 1-based.' }),
      v('laneRest', 'lanes', ITEM, { item: 'rest', kind: NUM, ...UNIT }),
      v('phase', 'phase', NUM, { ...UNIT, doc: 'Where in the loop it is, 0..1.' }),
    ],
  },
  {
    id: 'orbit', section: 'Orbit', prefix: 'orbit', label: 'Orbit',
    summary: 'Drive the Orbit: run, rate, phase, and each node\'s radius, angle and depth.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true }),
      v('rate', 'rate', NUM, RATE),
      v('bars', 'cycleBars', INT, { min: 1, max: 64 }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('phase', 'phase', NUM, UNIT),
      v('node', 'nodes', ITEM, { item: 'enabled', kind: BOOL, doc: 'Enable or silence one node, 1-based.' }),
      v('nodeRadius', 'nodes', ITEM, { item: 'radius', kind: NUM, ...UNIT }),
      v('nodeAngle', 'nodes', ITEM, { item: 'angle', kind: NUM, min: -360, max: 360 }),
      v('nodeRatio', 'nodes', ITEM, { item: 'ratio', kind: NUM, min: -16, max: 16 }),
      v('nodeDepth', 'nodes', ITEM, { item: 'depth', kind: NUM, min: -1, max: 1 }),
    ],
  },
  {
    id: 'kinetic', section: 'Kinetic', prefix: 'kinetic', label: 'Kinetic',
    summary: 'Drive the Kinetic field: run, gravity, bounce, friction — and launch the ball.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('gravity', 'gravity', NUM, { min: -4, max: 4 }),
      v('bounce', 'restitution', NUM, { min: 0, max: 1.5 }),
      v('friction', 'friction', NUM, UNIT),
      v('keepAlive', 'keepAlive', NUM, UNIT),
      v('launch', 'initial', XY, { fx: 'x', fy: 'y', ...UNIT, args: ['x', 'y'],
        doc: 'Put the ball at (x, y) and let it go from there.' }),
      v('velocity', 'initial', XY, { fx: 'vx', fy: 'vy', min: -4, max: 4, args: ['vx', 'vy'],
        doc: 'Set the launch velocity, x and y.' }),
    ],
  },
  {
    id: 'constellation', section: 'Constellation', prefix: 'constellation', label: 'Constellation',
    summary: 'Move the Constellation probe, change how it blends, and let it wander.',
    verbs: [
      v('probe', '', XY, { fx: 'probeX', fy: 'probeY', ...UNIT, flat: true,
        doc: 'Move the probe. The targets follow, which is the whole point.' }),
      v('mode', 'mode', ENUM),
      v('blend', 'blendPower', NUM, { min: 0.1, max: 16 }),
      v('run', 'running', BOOL, { toggle: true, doc: 'Let the probe wander on its own.' }),
      v('rate', 'wanderRate', NUM, { min: 0, max: 4 }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      v('bars', 'wanderBars', INT, { min: 1, max: 64 }),
      v('links', 'linkCount', INT, { min: 0, max: 16 }),
    ],
  },
  {
    id: 'timbre', section: 'Timbre', prefix: 'timbre', label: 'Timbre Pad',
    summary: 'Move the Timbre puck and change how sharply it favours the nearest anchor.',
    verbs: [
      v('move', '', XY, { fx: 'x', fy: 'y', ...UNIT, flat: true }),
      v('power', 'power', NUM, { min: 0.1, max: 16 }),
      v('anchorX', 'anchors', ITEM, { item: 'x', kind: NUM, ...UNIT }),
      v('anchorY', 'anchors', ITEM, { item: 'y', kind: NUM, ...UNIT }),
    ],
  },

  /* ------------------------------------------------------------------- modulation maps */
  {
    id: 'router', section: 'Router', prefix: 'router', label: 'Router',
    summary: 'Re-point the Router: source, CC, channel, deadzone, and each destination\'s depth.',
    verbs: [
      v('source', 'source', ENUM),
      v('cc', 'ccNumber', INT, { min: 0, max: 127 }),
      v('channel', 'inputChannel', INT, { min: 0, max: 16, doc: '0 means omni.' }),
      v('poly', 'polyMode', ENUM),
      v('invert', 'invert', BOOL, { toggle: true }),
      v('deadzone', 'deadzone', NUM, UNIT),
      v('input', 'testInput', NUM, { ...UNIT, doc: 'Drive the router directly, as the test input does.' }),
      v('dest', 'destinations', ITEM, { item: 'enabled', kind: BOOL }),
      v('destDepth', 'destinations', ITEM, { item: 'depth', kind: NUM, min: -1, max: 1 }),
    ],
  },
  {
    id: 'macro', section: 'Macro', prefix: 'macro', label: 'Macro',
    summary: 'Turn the Macro, and re-weight what it drives.',
    verbs: [
      v('value', 'value', NUM, UNIT),
      v('slot', 'slots', ITEM, { item: 'enabled', kind: BOOL }),
      v('slotDepth', 'slots', ITEM, { item: 'depth', kind: NUM, min: -1, max: 1 }),
      v('slotCurve', 'slots', ITEM, { item: 'curve', kind: ENUM }),
      v('slotMin', 'slots', ITEM, { item: 'min', kind: NUM, ...UNIT }),
      v('slotMax', 'slots', ITEM, { item: 'max', kind: NUM, ...UNIT }),
    ],
  },
  {
    id: 'matrix', section: 'Matrix', prefix: 'matrix', label: 'Mod Matrix',
    summary: 'Patch the modulation matrix from a script: one cell at a time, or clear the lot.',
    verbs: [
      v('cell', 'amounts', CELL, { min: -1, max: 1, grid: true,
        doc: 'Set one crosspoint. Row and column are 1-based, as the grid shows them.' }),
      v('clear', 'amounts', CELL, { clear: true, doc: 'Zero every crosspoint.' }),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('step', 'step', INT, { min: 0, max: 64 }),
    ],
  },
  {
    id: 'constraint', section: 'Constraint', prefix: 'constraint', label: 'Constraint',
    summary: 'Move one member of a Constraint group — the others rebalance around it.',
    verbs: [
      v('mode', 'mode', ENUM),
      v('gap', 'minGap', NUM, UNIT),
      v('member', 'members', ITEM, { item: 'value', kind: NUM, ...UNIT }),
    ],
  },
  {
    id: 'envelope', section: 'Envelope', prefix: 'envelope', label: 'Envelope',
    summary: 'Reshape an Envelope: a preset, a single breakpoint, the sustain point, the loop.',
    verbs: [
      v('preset', 'preset', ENUM),
      v('pointX', 'points', ITEM, { item: 'x', kind: NUM, ...UNIT }),
      v('pointY', 'points', ITEM, { item: 'y', kind: NUM, ...UNIT }),
      v('pointCurve', 'points', ITEM, { item: 'curve', kind: ENUM }),
      v('sustain', 'sustainIndex', INT, { min: -1, max: 64, doc: '1-based; -1 for no sustain point.', oneBased: true }),
      v('loop', 'loopEnabled', BOOL, { toggle: true }),
      v('loopStart', 'loopStart', INT, { min: 0, max: 64, oneBased: true }),
      v('loopEnd', 'loopEnd', INT, { min: 0, max: 64, oneBased: true }),
      v('timeMax', 'timeMax', NUM, { min: 1, max: 600000 }),
      v('phase', 'phase', NUM, UNIT),
    ],
  },

  /* -------------------------------------------------------------------- hands-on values */
  {
    id: 'ribbon', section: 'Ribbon', prefix: 'ribbon', label: 'Ribbon',
    summary: 'Drive a Ribbon, and change what it does when you let go.',
    verbs: [
      v('value', 'value', NUM, UNIT),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('returnMode', 'returnMode', ENUM),
      v('returnValue', 'returnValue', NUM, UNIT),
      v('returnRate', 'returnRate', NUM, { min: 0, max: 100 }),
      v('snap', 'snap', NUM, UNIT),
    ],
  },
  {
    id: 'crossfader', section: 'Crossfader', prefix: 'crossfader', label: 'Crossfader',
    summary: 'Drive a Crossfader and change its law.',
    verbs: [
      v('mix', 'mix', NUM, UNIT),
      v('law', 'law', ENUM),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('detent', 'detent', NUM, UNIT),
      v('returnToCenter', 'returnToCenter', BOOL, { toggle: true }),
      v('returnRate', 'returnRate', NUM, { min: 0, max: 100 }),
    ],
  },
  {
    id: 'joystick', section: 'Joystick', prefix: 'joystick', label: 'Vector Joystick',
    summary: 'Move a Vector Joystick puck, and change what it does when released.',
    verbs: [
      v('move', '', XY, { fx: 'x', fy: 'y', ...UNIT, flat: true }),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('returnToCenter', 'returnToCenter', BOOL, { toggle: true }),
      v('returnAxes', 'returnAxes', ENUM),
      v('returnRate', 'returnRate', NUM, { min: 0, max: 100 }),
    ],
  },
  {
    id: 'meter', section: 'Meter', prefix: 'meter', label: 'Meter',
    summary: 'Drive a Meter from a script — a level a panel computes itself has nowhere else to go.',
    verbs: [
      v('value', 'value', NUM, { min: -1e9, max: 1e9, doc: 'In the meter\'s own units, between valueMin and valueMax.' }),
      v('scale', 'scale', ENUM),
      v('peakHold', 'peakHold', BOOL, { toggle: true }),
      v('holdMs', 'peakHoldMs', NUM, { min: 0, max: 60000 }),
      v('decay', 'peakDecayPerSec', NUM, { min: 0, max: 100 }),
      // `value` is documented as being in the meter's own units, between these two — and a
      // script could neither set them nor read them, so re-scaling a meter for a different
      // parameter meant editing the panel.
      v('valueMin', 'valueMin', NUM, { min: -1e9, max: 1e9 }),
      v('valueMax', 'valueMax', NUM, { min: -1e9, max: 1e9 }),
      v('dbFloor', 'dbFloor', NUM, { min: -200, max: 0, doc: 'The dB the bottom of the scale means.' }),
      v('dbCeil', 'dbCeil', NUM, { min: -200, max: 60, doc: 'The dB the top of the scale means.' }),
    ],
  },

  /* -------------------------------------------------------------------------- the rest */
  {
    id: 'transport', section: 'Transport', prefix: 'transport', label: 'Transport',
    summary: 'Set the panel Transport: tempo, swing, time signature, loop. Reading it is ce.time.',
    verbs: [
      v('bpm', 'bpm', NUM, { min: 20, max: 400 }),
      v('swing', 'swing', NUM, { min: -1, max: 1 }),
      v('source', 'source', ENUM),
      v('beatsPerBar', 'beatsPerBar', INT, { min: 1, max: 32 }),
      // Not an enum: the transport clamps ANY integer here, so a list of six refused 3, 12 and
      // every other unit it accepts.
      v('beatUnit', 'beatUnit', INT, { min: 1, max: 32 }),
      v('loop', 'loopEnabled', BOOL, { toggle: true }),
      v('loopStart', 'loopStartBar', INT, { min: 1, max: 9999 }),
      v('loopBars', 'loopLengthBars', INT, { min: 1, max: 9999 }),
      v('countIn', 'countInBars', INT, { min: 0, max: 16 }),
      v('clockOut', 'clockOut', BOOL, { toggle: true }),
    ],
  },
  {
    id: 'panic', section: 'Panic', prefix: 'panicSet', label: 'Panic',
    summary: 'Configure what a Panic button sends. Sending it is the global panic().',
    verbs: [
      v('scope', 'scope', ENUM),
      v('channel', 'channel', INT, CHANNEL),
      v('resetControllers', 'resetControllers', BOOL, { toggle: true }),
      v('centreBend', 'centreBend', BOOL, { toggle: true }),
      v('clearLocal', 'clearLocal', BOOL, { toggle: true }),
    ],
  },
  {
    id: 'lcd', section: 'Display', prefix: 'lcd', label: 'LCD Display',
    summary: 'Write to a character LCD: a line at a time, plus backlight, brightness and scrolling.',
    verbs: [
      v('text', 'lines', LINE, { doc: 'Write one line. The row is 1-based, as the display shows it.' }),
      v('clear', 'lines', LINE, { clear: true, doc: 'Blank every line.' }),
      v('backlight', 'backlightOn', BOOL, { toggle: true }),
      v('brightness', 'brightness', NUM, { min: 0, max: 100 }),
      v('contrast', 'contrast', NUM, { min: 0, max: 100 }),
      v('scroll', 'scroll', ENUM),
      v('scrollSpeed', 'scrollSpeed', NUM, { min: 0, max: 60 }),
      v('blink', 'blink', BOOL, { toggle: true }),
      v('cursor', 'cursor', ENUM),
      v('cursorAt', '', XY, { fx: 'cursorCol', fy: 'cursorRow', min: 1, max: 256, flat: true, oneBased: true,
        args: ['col', 'row'],
        doc: 'Put the cursor at (column, row), both 1-based.' }),
      v('value', 'value', NUM, { min: -1e9, max: 1e9 }),
    ],
  },
  {
    id: 'pixel', section: 'Pixel', prefix: 'pixel', label: 'Pixel Display',
    summary: 'Drive a pixel display\'s screen state: backlight, brightness, and its animation.',
    verbs: [
      v('backlight', 'backlightOn', BOOL, { toggle: true }),
      v('brightness', 'brightness', NUM, { min: 0, max: 100 }),
      v('contrast', 'contrast', NUM, { min: 0, max: 100 }),
      v('gamma', 'gamma', NUM, { min: 0.1, max: 4 }),
      v('glow', 'glow', NUM, UNIT),
      v('anim', 'animMode', ENUM),
      v('animPreset', 'animPreset', STR),
      v('animSpeed', 'animSpeed', NUM, { min: 0, max: 16 }),
      v('animLoop', 'animLoop', BOOL, { toggle: true }),
    ],
  },
];

/* ---------------------------------------------------------------------------- the spec */

/** Every verb, flattened, with the member id each one is reachable by. */
/* ---------------------------------------------------------------------- enum values
 * Filled in from componentTables.js, in one place, AFTER the families are declared — so the spec
 * above never spells a value and cannot drift from the component that reads it. A verb with no
 * entry throws at import: an enum with no source of truth is the bug this whole file just had
 * twenty-four instances of, and a missing table must fail loudly rather than become an empty list
 * that refuses everything.
 */
for (const fam of COMPONENT_FAMILIES) {
  for (const verb of fam.verbs) {
    // The kind that carries an enum may be the verb's own, or the item kind of an array property
    // (macro.slotCurve writes `curve` on one slot).
    if (verb.k !== ENUM && verb.kind !== ENUM) continue;
    const key = `${fam.id}.${verb.v}`;
    const values = VERB_VALUES[key];
    if (!Array.isArray(values) || !values.length) {
      throw new Error(`componentVerbs: ${key} is an enum with no entry in componentTables.VERB_VALUES`);
    }
    verb.values = values;
  }
}

/* --------------------------------------------------------- the five every family gets
 *
 * Appended once, here, rather than written into twenty-three family literals. All five were absent
 * for the same reason: the spec was built as a list of things to SET, and nothing else was asked.
 *
 *   read    every verb of this family had a write and no read, so a script could set the
 *           arpeggiator's pattern and could not ask what it was. "Next pattern" was impossible
 *           without a shadow copy in `state`, which desyncs the moment somebody touches the control.
 *   size    an `item` verb addresses element N and nothing said how many there are.
 *   fill    sixteen Turing steps were sixteen calls, an 8x8 matrix sixty-four — each its own
 *           reducer pass and its own store write.
 *   insert  the arrays could be edited and not grown. Adding a zone, an envelope point, an orbit
 *           node or a router destination was reachable from the canvas and from nowhere else.
 *   remove
 *
 * They address an array by its VERB name (`fill(t, "step", …)`, not `fill(t, "steps", …)`), so the
 * vocabulary a script learns for writing is the vocabulary it uses for everything else.
 */
const FAMILY_VERBS = [
  { v: 'read', k: READ, doc:
    'Read back what the other verbs set, by their own names. `read(target)` is every scalar verb of '
    + 'this component as a table; `read(target, "pattern")` is one; `read(target, "step")` is the '
    + 'whole list an indexed verb addresses, and `read(target, "step", 3)` is one element, 1-based '
    + 'as everywhere else. Nothing back when the target is not this kind of component.' },
  { v: 'size', k: SIZE, doc:
    'How many elements an indexed verb can address. `size(target)` is a table of every list this '
    + 'component has; `size(target, "node")` is one number. The Mod Matrix answers { rows, cols }, '
    + 'because a crosspoint is addressed by both.' },
  { v: 'fill', k: FILL, doc:
    'Write a whole list in one call — `fill(target, "step", {0, 0.5, 1})`. One document change and '
    + 'one undo step instead of one per element. A list longer than the component has is refused '
    + 'rather than truncated: silently dropping half a pattern is worse than not writing it.' },
  { v: 'insert', k: INSERT, doc:
    'Add one element to a list, using the same template the canvas uses. Appends by default, or '
    + 'inserts BEFORE a 1-based index. Returns whether it grew.' },
  { v: 'remove', k: REMOVE, doc:
    'Remove one element of a list, 1-based. Removes the last when no index is given. Refused when '
    + 'the component needs the element it was asked to drop — an envelope keeps its endpoints.' },
];

for (const fam of COMPONENT_FAMILIES) {
  const lists = fam.verbs.filter((verb) => LIST_KINDS.includes(verb.k) && !verb.clear);
  // insert/remove need an element TEMPLATE, so they only apply to `item` lists — collections of
  // objects the canvas can genuinely grow (nodes, slots, destinations, points). A `cell` or `line`
  // list is fixed-length and sized by a verb of its own — the Turing's step count is `length`, the
  // LCD's row count is the display's `rows` — so growing one from here would fight that verb.
  const growable = lists.some((verb) => verb.k === ITEM);
  for (const spec of FAMILY_VERBS) {
    if (spec.k === READ) { fam.verbs.push({ ...spec, f: '' }); continue; }
    // A verb that could never apply is worse than no verb: it reads as a capability and answers
    // nothing.
    if (!lists.length) continue;
    if ((spec.k === INSERT || spec.k === REMOVE) && !growable) continue;
    fam.verbs.push({ ...spec, f: '' });
  }
}

export const COMPONENT_VERBS = COMPONENT_FAMILIES.flatMap((fam) =>
  fam.verbs.map((verb) => ({
    ...verb,
    family: fam.id,
    // The label the editor shows, not the section name: somebody reading an error has a
    // "Arpeggiator" in front of them, not an "Arp".
    label: fam.label,
    section: fam.section,
    // `arp` + `rate` -> `arpRate`. The flat name still exists because every member has one; the
    // namespaced spelling ce.components.arp.rate is the one anybody would actually write.
    id: fam.prefix + verb.v.charAt(0).toUpperCase() + verb.v.slice(1),
  })));

export const COMPONENT_VERB_BY_ID = Object.fromEntries(COMPONENT_VERBS.map((x) => [x.id, x]));

/** Module id for a family: ce.components.arp. */
export const moduleIdFor = (familyId) => `ce.components.${familyId}`;

/* -------------------------------------------------------------------------- the reducer */

const isFinite_ = (n) => Number.isFinite(n);

function clampNum(value, spec) {
  const n = Number(value);
  if (!isFinite_(n)) return null;
  const lo = isFinite_(spec.min) ? spec.min : -Infinity;
  const hi = isFinite_(spec.max) ? spec.max : Infinity;
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(value, spec) {
  const n = clampNum(value, spec);
  return n === null ? null : Math.round(n);
}

/** Coerce one argument to the kind a verb (or an array item) declares. null means "no-op". */
function coerce(kind, value, spec, current) {
  switch (kind) {
    case NUM: return clampNum(value, spec);
    case INT: return clampInt(value, spec);
    case BOOL:
      // No argument toggles, so one footswitch can do both jobs. `current` is what it toggles from.
      if (value === undefined || value === null) return !(current === true);
      return value !== false && value !== 0 && value !== '';
    case STR: return String(value ?? '');
    case ENUM: {
      // An unrecognised value is a NO-OP, never a silently wrong setting: a typo that leaves the
      // arpeggiator alone is debuggable, one that quietly sets it to "up" is not.
      const want = typeof value === 'number' ? value : String(value ?? '');
      return spec.values.some((x) => x === want) ? want : null;
    }
    default: return null;
  }
}

/** 1-based index in, 0-based out. null when it is not a usable index. */
function indexOf(value, length) {
  const n = Number(value);
  if (!isFinite_(n)) return null;
  const i = Math.round(n) - 1;
  return i >= 0 && i < length ? i : null;
}

/**
 * Turn one verb call into a patch of `section` fields — the same shape the five hand-written
 * reducers return, so the runtime treats them identically. An empty patch means "nothing to
 * change", which is a legitimate outcome (an out-of-range index, an unknown enum, a value that
 * clamps to what it already was) and is reported as a no-op rather than as an error.
 */
export function componentScriptPatch(verb, cfg, args = []) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const [a, b] = args;

  switch (verb.k) {
    case NUM: case INT: case STR: case ENUM: case BOOL: {
      const next = coerce(verb.k, a, verb, c[verb.f]);
      if (next === null) return {};
      // oneBased verbs address a list position, so they are stored one lower than they are written.
      const stored = verb.oneBased && isFinite_(next) && next >= 0 ? next - 1 : next;
      return stored === c[verb.f] ? {} : { [verb.f]: stored };
    }

    case XY: {
      // Two numbers at once. Either may be omitted to move only the other axis — a script sweeping
      // the x of a puck should not have to know where the y currently is.
      const patch = {};
      const put = (field, value) => {
        if (value === undefined || value === null) return;
        const n = clampNum(value, verb);
        if (n === null) return;
        const stored = verb.oneBased ? n - 1 : n;
        if (verb.flat) { if (stored !== c[field]) patch[field] = stored; return; }
        patch.__nested = { ...(patch.__nested ?? {}), [field]: stored };
      };
      put(verb.fx, a);
      put(verb.fy, b);
      if (patch.__nested) {
        const base = c[verb.f] && typeof c[verb.f] === 'object' ? c[verb.f] : {};
        const merged = { ...base, ...patch.__nested };
        delete patch.__nested;
        patch[verb.f] = merged;
      }
      return patch;
    }

    case ITEM: {
      // One property of one element. The array is copied rather than mutated: the caller writes the
      // whole field back, and an in-place edit would make the write look like a no-op to any
      // change detection sitting between here and the store.
      const list = Array.isArray(c[verb.f]) ? c[verb.f] : null;
      if (!list) return {};
      const at = indexOf(a, list.length);
      if (at === null) return {};
      const row = list[at] && typeof list[at] === 'object' ? list[at] : {};
      const next = coerce(verb.kind, b, verb, row[verb.item]);
      if (next === null || next === row[verb.item]) return {};
      return { [verb.f]: list.map((x, i) => (i === at ? { ...row, [verb.item]: next } : x)) };
    }

    case CELL: {
      const list = Array.isArray(c[verb.f]) ? c[verb.f] : null;
      if (!list) return {};
      if (verb.clear) {
        if (list.every((x) => x === 0)) return {};
        return { [verb.f]: list.map(() => 0) };
      }
      // A grid addresses (row, col); a plain list addresses one index.
      let at = null, value;
      if (verb.grid) {
        const cols = Array.isArray(c.cols) ? c.cols.length : 0;
        const rows = Array.isArray(c.rows) ? c.rows.length : 0;
        const r = indexOf(a, rows), col = indexOf(b, cols);
        if (r === null || col === null) return {};
        at = r * cols + col;
        if (at >= list.length) return {};
        value = args[2];
      } else {
        at = indexOf(a, list.length);
        if (at === null) return {};
        value = b;
      }
      const next = clampNum(value, verb);
      if (next === null || next === list[at]) return {};
      return { [verb.f]: list.map((x, i) => (i === at ? next : x)) };
    }

    case INDEXSET: {
      // A SET of indices that are on, stored 0-based and sorted, addressed 1-based like everything
      // else here. No second argument toggles, so one footswitch mutes and unmutes.
      const list = (Array.isArray(c[verb.f]) ? c[verb.f] : [])
        .map((n) => Math.round(Number(n)))
        .filter((n) => Number.isFinite(n));
      const at = Math.round(Number(a)) - 1;
      // No length to bound against — the set is sparse and the sequence it indexes is built
      // elsewhere — so the only illegal index is one that is not a whole number at or above zero.
      if (!Number.isFinite(at) || at < 0) return {};
      const on = list.includes(at);
      const want = b === undefined || b === null ? !on : (b !== false && b !== 0 && b !== '');
      if (want === on) return {};
      const next = want ? [...list, at].sort((x, y) => x - y) : list.filter((n) => n !== at);
      return { [verb.f]: next };
    }

    case LINE: {
      const list = Array.isArray(c[verb.f]) ? c[verb.f] : null;
      if (!list) return {};
      if (verb.clear) {
        if (list.every((x) => x === '')) return {};
        return { [verb.f]: list.map(() => '') };
      }
      const at = indexOf(a, list.length);
      if (at === null) return {};
      const text = String(b ?? '');
      if (text === list[at]) return {};
      return { [verb.f]: list.map((x, i) => (i === at ? text : x)) };
    }

    default:
      return {};
  }
}

/**
 * Whether a call is one this component could honour — asked when the patch came back empty.
 *
 * `componentScriptPatch` returns nothing for two different reasons: the value asked for is already
 * the value held, or the value is one the component does not have. A script needs to tell those
 * apart (`if not arp.pattern(a, choice) then …` must not fire because the arp was already on that
 * pattern), and so does whoever is reading the console.
 *
 * This answers the second question without the reducer having to carry a second channel: an enum is
 * legal iff it is one of the component's own values, an index is legal iff it addresses an element
 * that exists, and a number is legal iff it is a number.
 */
export function componentRequestLegal(verb, cfg, args = []) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const [a, b] = args;
  const listOf = (field) => (Array.isArray(c[field]) ? c[field] : null);

  switch (verb.k) {
    case BOOL: case STR:
      return true;                                    // anything coerces; no argument toggles
    case NUM: case INT:
      return a === undefined || a === null ? false : Number.isFinite(Number(a));
    case ENUM:
      return coerce(ENUM, a, verb, c[verb.f]) !== null;
    case XY: {
      // At least one axis has to be a usable number — moving neither is not a move.
      const usable = (x) => x !== undefined && x !== null && Number.isFinite(Number(x));
      return usable(a) || usable(b);
    }
    case INDEXSET:
      return Number.isFinite(Number(a)) && Math.round(Number(a)) - 1 >= 0;
    case ITEM: {
      const list = listOf(verb.f);
      if (!list || indexOf(a, list.length) === null) return false;
      const row = list[indexOf(a, list.length)];
      return coerce(verb.kind, b, verb, (row && typeof row === 'object' ? row : {})[verb.item]) !== null;
    }
    case LINE: {
      const list = listOf(verb.f);
      return verb.clear ? Boolean(list) : Boolean(list) && indexOf(a, list.length) !== null;
    }
    case CELL: {
      const list = listOf(verb.f);
      if (!list) return false;
      if (verb.clear) return true;
      if (verb.grid) {
        const rows = Array.isArray(c.rows) ? c.rows.length : 0;
        const cols = Array.isArray(c.cols) ? c.cols.length : 0;
        const r = indexOf(a, rows), col = indexOf(b, cols);
        return r !== null && col !== null && r * cols + col < list.length
               && clampNum(args[2], verb) !== null;
      }
      return indexOf(a, list.length) !== null && clampNum(b, verb) !== null;
    }
    default:
      return false;
  }
}

/* ---------------------------------------------------------------------- signature text */
// The contract wants a human-readable signature per verb. Deriving it from the spec is what keeps
// the documentation from disagreeing with the implementation — there is only one description.

/** Argument names for a verb, after the mandatory `target`. */
export function verbArgs(verb) {
  switch (verb.k) {
    case XY: return verb.args ?? ['x', 'y'];
    case ITEM: return ['index', verb.item];
    case CELL: return verb.clear ? [] : (verb.grid ? ['row', 'col', 'amount'] : ['index', 'value']);
    case LINE: return verb.clear ? [] : ['row', 'text'];
    case INDEXSET: return ['index', 'on'];
    case BOOL: return [verb.v];
    // The five every family gets. Their optional arguments are rendered in verbSignature, which is
    // why they read as a plain list here.
    case READ: return ['name', 'index'];
    case SIZE: return ['name'];
    case FILL: return ['name', 'values'];
    case INSERT: case REMOVE: return ['name', 'index'];
    default: return [verb.v];
  }
}

export function verbSignature(verb) {
  const args = verbArgs(verb);
  // A boolean with no argument toggles, so its argument is shown as optional.
  if (verb.k === BOOL && verb.toggle) return `${verb.id}(target [, ${args[0]}])`;
  // An index set toggles when the second argument is left off, the same way a bool does.
  if (verb.k === INDEXSET) return `${verb.id}(target, index [, on])`;
  switch (verb.k) {
    case READ: return `${verb.id}(target [, name [, index]])`;
    case SIZE: return `${verb.id}(target [, name]) -> number|table`;
    case FILL: return `${verb.id}(target, name, values) -> boolean`;
    case INSERT: return `${verb.id}(target, name [, index]) -> boolean`;
    case REMOVE: return `${verb.id}(target, name [, index]) -> boolean`;
    default: return `${verb.id}(${['target', ...args].join(', ')})`;
  }
}

export function verbSummary(verb) {
  if (verb.doc) return verb.doc;
  const label = verb.k === ITEM ? `${verb.item} of one ${verb.f.replace(/s$/, '')}` : verb.f;
  switch (verb.k) {
    case BOOL: return `Set \`${label}\`. Calling it with no argument toggles.`;
    case ENUM: return `Set \`${label}\` — one of ${verb.values.map((x) => `"${x}"`).join(', ')}.`;
    case ITEM: return `Set the ${label}, 1-based.`;
    default: return `Set \`${label}\`.`;
  }
}
