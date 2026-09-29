// inspectorFieldSets.js — the inspector fields of the sections that are drawn from data.
//
// Each set is what the section's editor used to spell out by hand, field for field: the same label,
// span, hint, range, step, default and display. utils/inspectorFields.js describes the kinds and
// properties/FieldList.svelte draws them. `slot` entries are the editor's own snippets, kept in place.
//
// These are also the scripting API's ranges. componentVerbs.js reads each of these fields' min/max
// through scriptRangeOf() below instead of repeating the numbers, so the inspector and a script
// cannot disagree about a field. `script: { min, max }` marks the few where a script deliberately
// reaches further than the inspector; test/inspectorFields.test.js holds that it is never narrower,
// and holds every select that names a `table` to exactly the values the component reads.

import { CROSSFADER_LAWS } from '../utils/crossfaderLayout.js';
import { RETURN_CURVES, RETURN_MODES } from '../utils/returnToRest.js';
import {
  CHORDPAD_LAYOUTS, CROSSFADER_ORIENTATIONS, MATRIX_CELL_STYLES, METER_ORIENTATIONS, NOTERIBBON_MOD_AXES, NOTERIBBON_ORIENTATIONS, NOTERIBBON_VELOCITY_SOURCES,
  RIBBON_ORIENTATIONS, RIBBON_STYLES,
} from '../scripting/componentTables.js';
import { METER_SCALES } from '../utils/meterLayout.js';
import { RIBBON_MODES, RIBBON_MODE_LABELS } from '../utils/noteRibbonLayout.js';
import {
  CHORDPAD_MODES, CHORDPAD_VOICINGS, CHORD_TYPES, SCALES, SCALE_LABELS,
} from '../utils/chordPadLayout.js';
import { SCALE_NAMES } from '../scripting/musicTheory.js';
import { scriptRange } from '../utils/inspectorFields.js';

export const KINETIC_FIELDS = [
  { key: 'running', kind: 'toggle', label: 'Run', span: 1, defaultOn: true, hint: 'Integrate the physics in preview / player.' },
  { slot: 'sync' },
  { key: 'editable', kind: 'toggle', label: 'Fling', span: 1, defaultOn: true, hint: 'Drag the ball to throw it in preview.' },
  { slot: 'reset' },
  {
    key: 'gravity', kind: 'range', label: 'Gravity', span: 4, min: 0, max: 4, step: 0.05, default: 0, decimals: 2,
    // A script can turn gravity round (−4..4); the inspector only offers a downward pull.
    script: { min: -4, max: 4 },
    hint: 'Downward pull. 0 = zero-g; higher makes the ball fall and settle.',
  },
  {
    key: 'restitution', kind: 'range', label: 'Bounce', span: 4, percent: true, default: 0.92,
    // A script can make a wall add energy (up to 1.5); the inspector stops at 100 %.
    script: { min: 0, max: 1.5 },
    hint: 'Wall restitution — energy kept on each bounce. 100% = perpetual motion; lower = the ball loses energy and slows.',
  },
  {
    key: 'friction', kind: 'range', label: 'Drag', span: 4, min: 0, max: 1, step: 0.01, default: 0.04, decimals: 2,
    hint: 'Air resistance — how quickly the ball loses speed over time (0 = frictionless).',
  },
  {
    key: 'keepAlive', kind: 'range', label: 'Keep alive', span: 4, percent: true, default: 0.35,
    hint: 'When the ball nearly stalls, give it a random kick this strong to keep it moving. 0 = let it settle.',
  },
  { key: 'showTrail', kind: 'toggle', label: 'Trail', span: 1, defaultOn: true, hint: 'Comet trail behind the ball.' },
  { key: 'showWalls', kind: 'toggle', label: 'Walls', span: 1, defaultOn: true, hint: 'Draw the box walls.' },
];

// Crossfader: three of its four sections. Labels & colours stays hand-written (text inputs and the
// shared swatch cluster). The handle shapes have no table of their own; the renderer's switch on
// `handleStyle` is the only reader.
export const CROSSFADER_HANDLE_FIELDS = [
  { key: 'handleStyle', kind: 'select', label: 'Shape', span: 2, default: 'default', options: ['default', 'round', 'ring', 'blade', 'block'] },
  { key: 'trackSize', kind: 'number', label: 'Track', numberLabel: 'Width', span: 2, min: 2, max: 20, step: 1, default: 10 },
];

export const CROSSFADER_FIELDS = [
  {
    key: 'law', kind: 'select', label: 'Law', span: 2, default: 'equalPower', table: CROSSFADER_LAWS,
    hint: 'Equal-power = constant loudness. Linear = −6 dB dip at centre. Sharp = both full through the middle.',
    options: [['equalPower', 'Equal power (−3 dB)'], ['linear', 'Linear (−6 dB)'], ['sharp', 'Sharp']],
  },
  {
    key: 'orientation', kind: 'select', label: 'Orientation', span: 2, default: 'horizontal', table: CROSSFADER_ORIENTATIONS,
    hint: 'Horizontal or vertical fader.', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']],
  },
  { key: 'mix', kind: 'number', label: 'Mix', span: 1, compact: true, min: 0, max: 1, step: 0.01, default: 0.5, clamp: true, hint: 'Position: 0 = full A, 1 = full B.' },
  { key: 'bipolar', kind: 'toggle', label: 'Bipolar', span: 1, defaultOn: false, hint: 'Mix port emits −1..1.' },
  { key: 'editable', kind: 'toggle', label: 'Editable', span: 1, defaultOn: true, hint: 'Drag the handle in preview.' },
  {
    key: 'detent', kind: 'number', label: 'Detent', span: 1, compact: true, min: 0, max: 0.5, step: 0.01, default: 0.03, clamp: true,
    hint: 'Snap-to-centre threshold (0 = off).',
    script: { min: 0, max: 1 },   // the script verb has always taken the whole 0..1
  },
  { key: 'showGains', kind: 'toggle', label: 'Gain bars', span: 1, defaultOn: false, hint: 'Draw per-side gain indicators.' },
];

const springing = (values) => String(values.returnMode ?? 'none') !== 'none';

export const CROSSFADER_RETURN_FIELDS = [
  {
    key: 'returnMode', kind: 'select', label: 'On release', span: 2, default: 'none', table: RETURN_MODES,
    hint: 'Where the handle goes when you let go. Shared with the ribbon and the joystick, so an end is reachable now and not only the centre.',
    options: [['none', 'Latch (stay put)'], ['center', 'Centre'], ['min', 'Minimum'], ['max', 'Maximum'], ['rest', 'A set value']],
  },
  {
    key: 'returnValue', kind: 'number', label: 'Rest', span: 1, compact: true, min: 0, max: 1, step: 0.01, default: 0.5, clamp: true,
    hint: 'Mix to return to (0 = A, 1 = B).', when: (values) => values.returnMode === 'rest',
  },
  { key: 'returnTime', kind: 'number', label: 'Time (ms)', bare: true, min: 0, max: 5000, step: 10, default: 250, clamp: 'min', reset: false, when: springing },
  {
    key: 'returnCurve', kind: 'select', label: 'Curve', span: 2, default: 'linear', table: RETURN_CURVES, when: springing,
    hint: 'Linear is the constant-speed walk these controls always had. Exp covers most of the distance early, which is what a real spring does.',
    options: [['linear', 'Linear'], ['exp', 'Spring (exp)'], ['ease', 'Ease']],
  },
];

// Ribbon: the ordinary fields of all three sections. The preset buttons are the editor's own slot;
// the Label text and the colour swatches stay hand-written after the Display toggles.
export const RIBBON_FIELDS = [
  { slot: 'presets' },
  {
    key: 'style', kind: 'select', label: 'Style', span: 2, default: 'ribbon', table: RIBBON_STYLES,
    hint: 'Flat touch strip or a 3-D wheel.',
    options: [['ribbon', 'Ribbon (strip)'], ['wheel', 'Wheel (flat)'], ['wheel3d', 'Wheel (realistic)']],
  },
  {
    key: 'orientation', kind: 'select', label: 'Orientation', span: 2, default: 'vertical', table: RIBBON_ORIENTATIONS,
    hint: 'Vertical or horizontal.', options: [['vertical', 'Vertical'], ['horizontal', 'Horizontal']],
  },
  { key: 'value', kind: 'number', label: 'Value', numberLabel: 'Val', span: 1, compact: true, min: 0, max: 1, step: 0.01, default: 0.5, clamp: true, hint: 'Current / rest position (0–1).' },
  { key: 'bipolar', kind: 'toggle', label: 'Bipolar', span: 1, defaultOn: false, hint: 'Value port emits −1..1 (pitch bend).' },
  { key: 'editable', kind: 'toggle', label: 'Editable', span: 1, defaultOn: true, hint: 'Touch/drag in preview.' },
];

export const RIBBON_RETURN_FIELDS = [
  {
    key: 'returnMode', kind: 'select', label: 'Mode', span: 2, default: 'none', table: RETURN_MODES,
    hint: 'What the value does on release. Centre = pitch wheel; None = latch (mod wheel / ribbon).',
    options: [['none', 'None (latch)'], ['center', 'Centre'], ['min', 'Min'], ['max', 'Max'], ['rest', 'Rest value']],
  },
  {
    key: 'returnValue', kind: 'number', label: 'Rest', span: 1, compact: true, min: 0, max: 1, step: 0.01, default: 0.5, clamp: true,
    hint: 'Rest value (0–1).', when: (values) => values.returnMode === 'rest',
  },
  { key: 'returnTime', kind: 'number', label: 'Time (ms)', bare: true, min: 0, max: 5000, step: 10, default: 125, clamp: 'min', reset: false, when: springing },
  {
    key: 'returnCurve', kind: 'select', label: 'Curve', span: 2, default: 'linear', table: RETURN_CURVES, when: springing,
    hint: 'Linear is the constant-speed walk these controls always had. Exp covers most of the distance early, which is what a real spring does.',
    options: [['linear', 'Linear'], ['exp', 'Spring (exp)'], ['ease', 'Ease']],
  },
  { key: 'snap', kind: 'number', label: 'Snap', span: 1, compact: true, min: 0, max: 1, step: 0.01, default: 0, clamp: true, hint: 'Value snap step (0 = continuous).' },
];

export const RIBBON_DISPLAY_FIELDS = [
  { key: 'showGlow', kind: 'toggle', label: 'Touch glow', span: 1, defaultOn: true, hint: 'Glow while held.' },
  { key: 'showValue', kind: 'toggle', label: 'Readout', span: 1, defaultOn: false, hint: 'Show the numeric value.' },
];

// Note Ribbon. The key picker (its note names follow the scale's sharps or flats, and it stores a
// number), the shared panel-key cell, the range preview, the bend note, the echo swatch and the
// MIDI summary are the editor's own slots. The whole numbers read and write as the editor always
// did: a stored "60" shows 60, junk shows the default, and a write is rounded and clamped.
export const NOTERIBBON_KEYBOARD_FIELDS = [
  {
    key: 'mode', kind: 'select', label: 'Mode', span: 2, default: 'snap', table: RIBBON_MODES,
    hint: 'Scale snap = in-key notes only. Chromatic = every semitone. Glide = continuous pitch via pitch bend.',
    options: RIBBON_MODES.map((mode) => [mode, RIBBON_MODE_LABELS[mode] ?? mode]),
  },
  {
    key: 'orientation', kind: 'select', label: 'Orientation', span: 2, default: 'horizontal', table: NOTERIBBON_ORIENTATIONS,
    hint: 'Vertical strips run low-at-the-bottom.', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']],
  },
  { slot: 'panelKey' },
  { slot: 'key' },
  {
    key: 'scale', kind: 'select', label: 'Scale', span: 1, default: 'major', table: SCALE_NAMES,
    hint: 'Which notes count as in key.', options: Object.keys(SCALES).map((scale) => [scale, SCALE_LABELS[scale] ?? scale]),
  },
  { key: 'baseNote', kind: 'number', integer: true, label: 'Lowest', numberLabel: 'Note', span: 1, compact: true, min: 0, max: 127, step: 1, default: 48, reset: false, hint: 'MIDI note at the low end of the strip (48 = C3, 60 = middle C).' },
  { key: 'octaves', kind: 'number', integer: true, label: 'Octaves', numberLabel: 'Oct', span: 1, compact: true, min: 1, max: 5, step: 1, default: 2, reset: false, hint: 'How far the strip reaches. Wider = more range, narrower = more precision per pixel.' },
  { slot: 'span' },
];

const glide = (values) => String(values.mode ?? 'snap') === 'glide';

export const NOTERIBBON_PERFORMANCE_FIELDS = [
  { key: 'bendRange', kind: 'number', integer: true, label: 'Bend range', numberLabel: 'Bend', span: 1, compact: true, min: 1, max: 48, step: 1, default: 2, reset: false, when: glide, hint: 'Semitones of pitch bend. Must match the synth\'s own bend range; 2 is the common default.' },
  { slot: 'bendNote', when: glide },
  { key: 'velocity', kind: 'number', integer: true, label: 'Velocity', numberLabel: 'Vel', span: 1, compact: true, min: 1, max: 127, step: 1, default: 96, reset: false, hint: 'Note-on velocity (1–127) when velocity is fixed.' },
  {
    key: 'velocityFrom', kind: 'select', label: 'Vel. from', span: 1, default: 'fixed', table: NOTERIBBON_VELOCITY_SOURCES,
    hint: 'Position takes velocity from where on the short axis you touched — the closest a mouse gets to dynamics.',
    options: [['fixed', 'Fixed'], ['position', 'Touch position']],
  },
  { key: 'channel', kind: 'number', integer: true, label: 'Channel', numberLabel: 'Ch', span: 1, compact: true, min: 1, max: 16, step: 1, default: 1, reset: false, hint: 'MIDI channel for notes, bend and the CC (1–16).' },
  { key: 'latch', kind: 'toggle', label: 'Latch', span: 1, defaultOn: false, hint: 'The note keeps sounding after release; touch again to silence it.' },
  {
    key: 'modAxis', kind: 'select', label: 'Cross axis', span: 2, default: 'none', table: NOTERIBBON_MOD_AXES,
    hint: 'The short axis as a second expression dimension — standing in for the pressure a real ribbon senses.',
    options: [['none', 'Off'], ['cc', 'Send a CC']],
  },
  { key: 'modCc', kind: 'number', integer: true, label: 'CC', span: 1, compact: true, min: 0, max: 127, step: 1, default: 1, reset: false, when: (values) => String(values.modAxis ?? 'none') === 'cc', hint: 'Which controller that axis sends (1 = mod wheel, 74 = filter cutoff on many synths).' },
  { key: 'echo', kind: 'toggle', label: 'Echo MIDI in', span: 1, defaultOn: false, hint: 'Outline the matching zones from notes arriving on the hardware MIDI input.' },
  { key: 'echoChannel', kind: 'number', integer: true, label: 'In channel', numberLabel: 'Ch', span: 1, compact: true, min: 0, max: 16, step: 1, default: 0, reset: false, when: (values) => values.echo === true, hint: 'Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.' },
  { slot: 'echoColour', when: (values) => values.echo === true },
  { key: 'editable', kind: 'toggle', label: 'Playable', span: 1, defaultOn: true, hint: 'Allow playing the strip in preview / the player.' },
  { slot: 'info' },
];

export const NOTERIBBON_APPEARANCE_FIELDS = [
  { key: 'showHeader', kind: 'toggle', label: 'Header', span: 1, defaultOn: true, hint: 'Show the key / mode / current-note strip.' },
  { key: 'showNames', kind: 'toggle', label: 'Note names', span: 1, defaultOn: true, hint: 'Print note names on the zones (hidden automatically when they\'re too narrow).' },
];

// Chord Pad. The key picker, the panel-key cell, the pad preview, the echo swatch and the MIDI note
// are the editor's own slots. Octave and Octaves are the ranges chordPadLayout.js clamps to; a script
// used to be offered −4..4 and 1..8 and had the ends clamped away. Columns and Strum are not clamped
// by the component above their minimum, and a script keeps the wider reach it always had.
const chords = (values) => String(values.mode ?? 'chords') === 'chords';

export const CHORDPAD_FIELDS = [
  {
    key: 'layout', kind: 'select', label: 'Layout', span: 2, default: 'wheel', table: CHORDPAD_LAYOUTS,
    hint: 'Wheel = circle of fifths, with relative minors inside their majors. Grid = compact, in-key only.',
    options: [['wheel', 'Wheel (circle of fifths)'], ['grid', 'Grid']],
  },
  {
    key: 'mode', kind: 'select', label: 'Mode', span: 2, default: 'chords', table: CHORDPAD_MODES,
    hint: 'Chords = one chord per pad. Notes = one scale note per pad (isomorphic).', options: [['chords', 'Chords'], ['notes', 'Notes']],
  },
  { slot: 'panelKey' },
  { slot: 'key' },
  {
    key: 'scale', kind: 'select', label: 'Scale', span: 2, default: 'major', table: SCALE_NAMES,
    hint: 'Determines which chords are in key.', options: Object.keys(SCALES).map((scale) => [scale, SCALE_LABELS[scale] ?? scale]),
  },
  {
    key: 'chordType', kind: 'select', label: 'Chords', span: 2, default: 'triad', table: CHORD_TYPES, when: chords,
    hint: 'Triads or four-note sevenths.', options: [['triad', 'Triads'], ['seventh', 'Sevenths']],
  },
  {
    key: 'voicing', kind: 'select', label: 'Voicing', span: 1, default: 'close', table: CHORDPAD_VOICINGS, when: chords,
    hint: 'Close = tight stack. Spread = alternate notes up an octave. Drop-2 = the 2nd-from-top drops an octave.',
    options: [['close', 'Close'], ['spread', 'Spread'], ['drop2', 'Drop 2']],
  },
  { key: 'inversion', kind: 'number', integer: true, label: 'Inversion', numberLabel: 'Inv', span: 1, compact: true, min: 0, max: 3, step: 1, default: 0, when: chords, hint: 'Rotate the chord tones upward.' },
  { key: 'noteSpan', kind: 'number', integer: true, label: 'Octaves', numberLabel: 'Oct', span: 1, compact: true, min: 1, max: 3, step: 1, default: 2, when: (values) => !chords(values), hint: 'How many octaves of scale notes to lay out.' },
  {
    key: 'gridCols', kind: 'number', integer: true, label: 'Columns', numberLabel: 'Cols', span: 1, compact: true, min: 1, max: 8, step: 1, default: 4,
    script: { min: 1, max: 12 }, when: (values) => String(values.layout ?? 'wheel') === 'grid', hint: 'Grid width.',
  },
  { slot: 'preview' },
];

export const CHORDPAD_PERFORMANCE_FIELDS = [
  { key: 'octave', kind: 'number', integer: true, label: 'Octave', numberLabel: 'Oct', span: 1, compact: true, min: -3, max: 3, step: 1, default: 0, hint: 'Transpose the whole pad in octaves.' },
  { key: 'velocity', kind: 'number', integer: true, label: 'Velocity', numberLabel: 'Vel', span: 1, compact: true, min: 1, max: 127, step: 1, default: 96, hint: 'Note-on velocity (1–127).' },
  { key: 'channel', kind: 'number', integer: true, label: 'Channel', numberLabel: 'Ch', span: 1, compact: true, min: 1, max: 16, step: 1, default: 1, hint: 'MIDI channel the notes go out on (1–16).' },
  {
    key: 'strumMs', kind: 'number', integer: true, label: 'Strum', span: 1, compact: true, min: 0, max: 200, step: 2, default: 0,
    script: { min: 0, max: 2000 }, hint: 'Milliseconds between chord notes (0 = block chord).',
  },
  { key: 'latch', kind: 'toggle', label: 'Latch', span: 1, defaultOn: false, hint: 'Pads keep sounding until tapped again (hands-free auditioning).' },
  { key: 'editable', kind: 'toggle', label: 'Playable', span: 1, defaultOn: true, hint: 'Allow playing the pads in preview / the player.' },
  { key: 'showPiano', kind: 'toggle', label: 'Piano', span: 1, defaultOn: true, hint: 'Show the sounding-notes keyboard strip.' },
  { key: 'showRomans', kind: 'toggle', label: 'Numerals', span: 1, defaultOn: true, hint: 'Show roman numerals (I, ii, ♭VII…) on the pads.' },
  { key: 'echo', kind: 'toggle', label: 'Echo MIDI in', span: 1, defaultOn: false, hint: 'Outline the pads and piano strip from notes arriving on the hardware MIDI input.' },
  { key: 'echoChannel', kind: 'number', integer: true, label: 'In channel', numberLabel: 'Ch', span: 1, compact: true, min: 0, max: 16, step: 1, default: 0, when: (values) => values.echo === true, hint: 'Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.' },
  { slot: 'echoColour', when: (values) => values.echo === true },
  { slot: 'note' },
];

// Meter. Most of its numbers have no range in the inspector — a dB floor, a value in the meter's own
// units, an arc angle — so they stay unclamped here as they were, and the script verbs over them keep
// their own limits. The value source (a list of the panel's controls), the swatches and the text
// inputs are the editor's own slots; the Zones list and the Peak hold header switch stay hand-written.
export const METER_FIELDS = [
  {
    key: 'orientation', kind: 'select', label: 'Orientation', span: 2, default: 'horizontal', table: METER_ORIENTATIONS,
    hint: 'Horizontal / vertical bar, or a radial arc.', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['arc', 'Arc']],
  },
  {
    key: 'scale', kind: 'select', label: 'Scale', span: 2, default: 'linear', table: METER_SCALES,
    hint: 'Linear, or decibel (0 dB near full scale).', options: [['linear', 'Linear'], ['db', 'Decibel']],
  },
  { key: 'dbFloor', kind: 'number', label: 'dB floor', numberLabel: 'Floor', span: 1, compact: true, default: -60, when: (values) => String(values.scale) === 'db', hint: 'Decibels at the bottom of the meter.' },
  { key: 'dbCeil', kind: 'number', label: 'dB ceil', numberLabel: 'Ceil', span: 1, compact: true, default: 6, when: (values) => String(values.scale) === 'db', hint: 'Decibels at the top of the meter.' },
];

export const METER_VALUE_FIELDS = [
  { slot: 'source' },
  { key: 'value', kind: 'number', label: 'Value', numberLabel: 'Val', span: 1, compact: true, default: 0, when: (values) => !values.valueSourceId, hint: 'Static/test value shown when nothing drives the meter.' },
  { key: 'valueMin', kind: 'number', label: 'Min', span: 1, compact: true, default: 0, hint: 'Value at empty.' },
  { key: 'valueMax', kind: 'number', label: 'Max', span: 1, compact: true, default: 1, hint: 'Value at full.' },
];

export const METER_FILL_FIELDS = [
  { key: 'segments', kind: 'number', label: 'Segments', numberLabel: 'Seg', span: 1, compact: true, min: 0, max: 64, default: 0, round: true, clamp: 'min', hint: '0 = smooth continuous fill; N = N discrete LED segments.' },
  { key: 'gradient', kind: 'toggle', label: 'Gradient', span: 1, defaultOn: true, hint: 'Blend zone colours smoothly vs hard steps.' },
  { key: 'rounded', kind: 'number', label: 'Rounded', numberLabel: 'Rad', span: 1, compact: true, min: 0, default: 3, clamp: 'min', hint: 'Fill corner radius (px).' },
  { key: 'thickness', kind: 'number', label: 'Thickness', numberLabel: 'Thick', span: 1, compact: true, min: 0, default: 0, clamp: 'min', hint: 'Bar/arc thickness in px (0 = fill the box).' },
  { slot: 'track' },
];

const peakHold = (values) => values.peakHold === true;

export const METER_PEAK_FIELDS = [
  { key: 'peakHoldMs', kind: 'number', label: 'Hold (ms)', numberLabel: 'Hold', span: 1, compact: true, min: 0, default: 1200, clamp: 'min', when: peakHold, hint: 'How long the marker holds before falling.' },
  { key: 'peakDecayPerSec', kind: 'number', label: 'Decay/s', numberLabel: 'Decay', span: 1, compact: true, min: 0, step: 0.05, default: 0.4, clamp: 'min', when: peakHold, hint: 'Normalized units per second the marker falls.' },
  { slot: 'peakColour', when: peakHold },
];

const readout = (values) => values.showValue === true;

export const METER_READOUT_FIELDS = [
  { key: 'showTicks', kind: 'toggle', label: 'Ticks', span: 1, defaultOn: false, hint: 'Draw scale tick marks along the meter.' },
  { key: 'tickCount', kind: 'number', label: 'Tick count', numberLabel: 'Ticks', span: 1, compact: true, min: 1, max: 20, default: 4, round: true, clamp: 'min', when: (values) => values.showTicks === true, hint: 'Number of divisions (marks = count + 1).' },
  { key: 'showValue', kind: 'toggle', label: 'Readout', span: 1, defaultOn: false, hint: 'Show the numeric value overlaid on the meter.' },
  { key: 'valuePrecision', kind: 'number', label: 'Precision', numberLabel: 'Prec', span: 1, compact: true, min: 0, max: 6, default: 0, round: true, clamp: 'min', when: readout, hint: 'Decimal places in the readout.' },
  { slot: 'suffix', when: readout },
  { slot: 'caption' },
  {
    key: 'labelPosition', kind: 'select', label: 'Position', span: 1, default: 'none',
    hint: 'Where the caption sits.', options: [['none', 'None'], ['above', 'Above'], ['below', 'Below']],
  },
];

export const METER_ARC_FIELDS = [
  { key: 'arcStart', kind: 'number', label: 'Start°', numberLabel: 'Start', span: 1, compact: true, default: 135, hint: 'Arc start angle (clockwise from 3 o\'clock).' },
  { key: 'arcSweep', kind: 'number', label: 'Sweep°', numberLabel: 'Sweep', span: 1, compact: true, default: 270, hint: 'Degrees the arc sweeps.' },
];

// Mod Matrix. The Clear button is the editor's slot; the source and destination lists and the amounts
// grid stay hand-written. Snap is a step in amount units (0.25 snaps cells to quarters), which the
// script verb used to take as a whole number 0..64 — so a script could set no step but 0 or 1.
export const MATRIX_FIELDS = [
  {
    key: 'cellStyle', kind: 'select', label: 'Cell style', span: 2, default: 'bar', table: MATRIX_CELL_STYLES,
    hint: 'How each cell shows its amount.', options: [['bar', 'Bar'], ['fill', 'Fill'], ['dot', 'Dot']],
  },
  { key: 'bipolar', kind: 'toggle', label: 'Bipolar', span: 1, defaultOn: true, hint: 'Amounts range −1..1 (vs 0..1).' },
  { key: 'editable', kind: 'toggle', label: 'Editable', span: 1, defaultOn: true, hint: 'Drag cells in preview.' },
  { key: 'showLabels', kind: 'toggle', label: 'Labels', span: 1, defaultOn: true, hint: 'Show source/destination labels.' },
  { key: 'showValues', kind: 'toggle', label: 'Values', span: 1, defaultOn: false, hint: 'Print the amount in each cell.' },
  { key: 'step', kind: 'number', label: 'Snap', span: 1, compact: true, min: 0, max: 1, step: 0.05, default: 0, clamp: true, hint: 'Cell amount snap step (0 = free).' },
  { slot: 'clear' },
];

/** Every field set, by the model section it edits. */
export const FIELD_SETS = {
  Kinetic: KINETIC_FIELDS,
  Crossfader: [...CROSSFADER_HANDLE_FIELDS, ...CROSSFADER_FIELDS, ...CROSSFADER_RETURN_FIELDS],
  Ribbon: [...RIBBON_FIELDS, ...RIBBON_RETURN_FIELDS, ...RIBBON_DISPLAY_FIELDS],
  NoteRibbon: [...NOTERIBBON_KEYBOARD_FIELDS, ...NOTERIBBON_PERFORMANCE_FIELDS, ...NOTERIBBON_APPEARANCE_FIELDS],
  ChordPad: [...CHORDPAD_FIELDS, ...CHORDPAD_PERFORMANCE_FIELDS],
  Matrix: MATRIX_FIELDS,
  Meter: [...METER_FIELDS, ...METER_VALUE_FIELDS, ...METER_FILL_FIELDS, ...METER_PEAK_FIELDS, ...METER_READOUT_FIELDS, ...METER_ARC_FIELDS],
};

/**
 * The range a script verb for `section.key` uses — read by componentVerbs.js. Throws for a field
 * that is not here or has no range, so a verb pointing at the wrong name fails at load rather than
 * quietly losing its clamp.
 */
export function scriptRangeOf(section, key) {
  const field = (FIELD_SETS[section] ?? []).find((entry) => entry.key === key);
  const range = field ? scriptRange(field) : null;
  if (!range) throw new Error(`inspectorFieldSets: no ranged field ${section}.${key} for a script verb to read`);
  return range;
}
