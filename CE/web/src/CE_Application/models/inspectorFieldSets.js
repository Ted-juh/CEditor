// inspectorFieldSets.js — the inspector fields of the sections that are drawn from data.
//
// Each set is what the section's editor used to spell out by hand, field for field: the same label,
// span, hint, range, step, default and display. utils/inspectorFields.js describes the kinds and
// properties/FieldList.svelte draws them. `slot` entries are the editor's own snippets, kept in place.
//
// test/inspectorFields.test.js checks every range here against the scripting API's range for the
// same field (componentVerbs.js): the inspector may offer less than a script can reach, never more.
// It also holds every select that names a `table` to exactly the values the component reads.

import { CROSSFADER_LAWS } from '../utils/crossfaderLayout.js';
import { RETURN_CURVES, RETURN_MODES } from '../utils/returnToRest.js';
import { CROSSFADER_ORIENTATIONS } from '../scripting/componentTables.js';

export const KINETIC_FIELDS = [
  { key: 'running', kind: 'toggle', label: 'Run', span: 1, defaultOn: true, hint: 'Integrate the physics in preview / player.' },
  { slot: 'sync' },
  { key: 'editable', kind: 'toggle', label: 'Fling', span: 1, defaultOn: true, hint: 'Drag the ball to throw it in preview.' },
  { slot: 'reset' },
  {
    key: 'gravity', kind: 'range', label: 'Gravity', span: 4, min: 0, max: 4, step: 0.05, default: 0, decimals: 2,
    hint: 'Downward pull. 0 = zero-g; higher makes the ball fall and settle.',
  },
  {
    key: 'restitution', kind: 'range', label: 'Bounce', span: 4, percent: true, default: 0.92,
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
  { key: 'detent', kind: 'number', label: 'Detent', span: 1, compact: true, min: 0, max: 0.5, step: 0.01, default: 0.03, clamp: true, hint: 'Snap-to-centre threshold (0 = off).' },
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
