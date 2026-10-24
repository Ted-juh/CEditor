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
//  elem   one property of one element of a pixel display's scene, addressed BY NAME
//  cell   one entry of a flat row-major grid (the Matrix), addressed 1-BASED
//  line   one entry of an array of strings (the LCD), addressed 1-BASED
//
// 1-based indexing throughout, on purpose: it is what the editor's own lists show, and a script
// that says "scene 3" should mean the third one whichever language it is written in.

import { scriptRangeOf } from '../models/inspectorFieldSets.js';
import { VERB_VALUES } from './componentTables.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { SOURCE_KINDS } from '../utils/controlSources.js';
import {
  drumPadCount, resolveDrumPads, PAD_CORNERS, PAD_CORNER_LABELS, cornerField,
} from '../utils/drumPadLayout.js';
import { elementSites, elementAt, elementsPatch, elementLists, elementLabel } from '../utils/pixelElements.js';
import { shownValue } from './shownValue.js';

const NUM = 'num', INT = 'int', BOOL = 'bool', STR = 'str', ENUM = 'enum';
const XY = 'xy', ITEM = 'item', CELL = 'cell', LINE = 'line';
// One property of one element of a pixel display's scene, addressed by the NAME the author typed
// beside it. Not `item`, and the two reasons are written out in utils/pixelElements.js: the list
// starts empty, so an index addresses nothing on a fresh display; and the index is the paint order,
// which the inspector's own ▲/▼ buttons rewrite. A name survives both.
const ELEM = 'elem';
export const ELEM_KIND = ELEM;
// A sorted list of INDICES that are on — the Arpeggiator stores its muted steps that way,
// as a set rather than a boolean per step, so neither `item` nor `cell` fits it.
const INDEXSET = 'indexset';
// …and the five every family gets for free, appended below rather than declared per family.
const READ = 'read', SIZE = 'size', FILL = 'fill', INSERT = 'insert', REMOVE = 'remove';
// A field holding the ID of ANOTHER control that drives this one. Not a reducer kind: resolving a
// name needs the panel, which the reducer deliberately never sees, so it dispatches in the runtime
// beside read/size/fill. The verb takes a NAME and stores an id, because a script addresses controls
// by name and an opaque `ctl_…` is not something it could have got hold of.
const LINK = 'link';
export const LINK_KIND = LINK;
export const READ_KINDS = [READ, SIZE];
export const ARRAY_KINDS = [FILL, INSERT, REMOVE];
/** The kinds that address an array by a verb name — what `size`, `fill`, `insert` and `remove`
 *  take, and what `read` returns a list for.
 *
 *  `elem` is deliberately NOT one of them. Those four all speak in positions — fill writes the
 *  n-th value, size answers how many there are — and a name-addressed scene has no n-th anything.
 *  Their answers would be about the stored array rather than about what a script can address, which
 *  is worse than not answering: `size` would report a number no verb takes. `read` has its own
 *  branch for it instead, keyed by name. */
export const LIST_KINDS = [ITEM, CELL, LINE];

/** A verb: v = name inside the namespace, f = the field it writes, k = kind. `doc` is its one
 *  sentence where the generated one (verbSummary) is not enough, `ex` its example's arguments and
 *  gloss, `argDocs` a parameter's text by name where the generated one (verbParamSummary) is not. */
const v = (name, field, kind, extra = {}) => ({ v: name, f: field, k: kind, ...extra });

/** "scrollSpeed" -> "scroll speed": a field's name in words, for the generated texts. */
const fieldWords = (field) => String(field ?? '').replace(/(SourceId|ControlId|Id|On)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
/** What a boolean's example says it does: a show flag shows or hides, the rest switch on or off. */
const toggleGloss = (field) => (/^show[A-Z]/.test(String(field ?? ''))
  ? `shows the ${fieldWords(String(field).slice(4))} if it is hidden, and hides it if it is shown`
  : `switches the ${fieldWords(field)} on if it is off, and off if it is on`);

// A verb whose field the inspector draws from data takes its range from that field set instead of
// repeating it here (models/inspectorFieldSets.js), so a script and the inspector cannot disagree.
const FIELD = scriptRangeOf;

const RATE = { min: 0.01, max: 200 };
const UNIT = { min: 0, max: 1 };
const NOTE = { min: 0, max: 127 };
const CHANNEL = { min: 1, max: 16 };
const VELOCITY = { min: 1, max: 127 };

/**
 * The Drum Pads' per-pad override array, which is the only list here that is SPARSE.
 *
 * Every other `item` list is the list — six orbit nodes are six stored objects. `DrumPads.pads` is
 * index-aligned with a grid whose size is `rows` x `cols`, and it starts EMPTY: a pad with no entry
 * takes its note, name and choke group from the generated map. Two consequences the generic reducer
 * cannot guess, so they are declared:
 *
 *   count    how many pads there are, which is the grid rather than the array's length. Without it
 *            every per-pad verb is a silent no-op on a fresh control, because the index it is given
 *            is out of range of an array of zero.
 *   resolve  what a pad actually plays. Reading the raw list back would answer `undefined` sixteen
 *            times over — true of the storage and useless as an answer.
 *   fixed    this list does not grow from a script. Its length is decided by the `rows` and `cols`
 *            verbs, so an insert here would fight them — the same reason `cell` and `line` lists
 *            have never had insert/remove.
 */
const PADS = {
  fixed: true,
  count: drumPadCount,
  resolve: resolveDrumPads,
};
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
      v("followPanelKey", "followPanelKey", BOOL, { toggle: true, doc: "Follow the panel shared key and scale. Off lets this control hold its own key while the rest re-harmonise." }),
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
      // The Chord Pad the arp takes its notes from, while `source` is "link".
      v('link', 'linkId', LINK, { sourceKind: 'chordPad' }),
    ],
  },
  {
    id: 'chordpad', section: 'ChordPad', prefix: 'chordPad', label: 'Chord Pad',
    summary: 'Re-key, re-voice and re-channel the Chord Pad without touching the layout.',
    verbs: [
      v('mode', 'mode', ENUM),
      v('key', 'key', INT, { min: 0, max: 11 }),
      v('scale', 'scale', ENUM),
      v("followPanelKey", "followPanelKey", BOOL, { toggle: true, doc: "Follow the panel shared key and scale. Off lets this control hold its own key while the rest re-harmonise." }),
      v('chordType', 'chordType', ENUM),
      v('voicing', 'voicing', ENUM),
      v('inversion', 'inversion', INT, FIELD('ChordPad', 'inversion')),
      v('octave', 'octave', INT, FIELD('ChordPad', 'octave')),
      v('velocity', 'velocity', INT, FIELD('ChordPad', 'velocity')),
      v('channel', 'channel', INT, FIELD('ChordPad', 'channel')),
      v('strum', 'strumMs', NUM, { ...FIELD('ChordPad', 'strumMs'), doc: 'Spread the chord over this many milliseconds.' }),
      v('latch', 'latch', BOOL, { toggle: true }),
      // The coverage audit's crop: layout and range were inspector-only, and echo is the same
      // monitor the Drum Pads got — light the pads from what a sequencer is playing.
      v('layout', 'layout', ENUM, { doc: 'Wheel or grid.' }),
      v('baseOctave', 'baseOctave', INT, { min: -1, max: 8 }),
      v('noteSpan', 'noteSpan', INT, { ...FIELD('ChordPad', 'noteSpan'), doc: 'How many octaves the pads cover.' }),
      v('gridCols', 'gridCols', INT, { ...FIELD('ChordPad', 'gridCols'), doc: 'Columns, while the layout is a grid.' }),
      v('echo', 'echo', BOOL, { toggle: true, doc: 'Light the pads from incoming MIDI as well as from taps.' }),
      v('echoChannel', 'echoChannel', INT, { ...FIELD('ChordPad', 'echoChannel'), doc: 'Which channel the echo listens to. 0 means omni.' }),
    ],
  },
  {
    id: 'noteribbon', section: 'NoteRibbon', prefix: 'noteRibbon', label: 'Note Ribbon',
    summary: 'Re-key and re-range the Note Ribbon: scale, span, bend depth, channel.',
    verbs: [
      v('mode', 'mode', ENUM),
      v('key', 'key', INT, { min: 0, max: 11 }),
      v('scale', 'scale', ENUM),
      v("followPanelKey", "followPanelKey", BOOL, { toggle: true, doc: "Follow the panel shared key and scale. Off lets this control hold its own key while the rest re-harmonise." }),
      v('baseNote', 'baseNote', INT, FIELD('NoteRibbon', 'baseNote')),
      v('octaves', 'octaves', INT, FIELD('NoteRibbon', 'octaves')),
      v('bendRange', 'bendRange', NUM, FIELD('NoteRibbon', 'bendRange')),
      v('velocity', 'velocity', INT, FIELD('NoteRibbon', 'velocity')),
      v('channel', 'channel', INT, FIELD('NoteRibbon', 'channel')),
      v('latch', 'latch', BOOL, { toggle: true }),
      v('orientation', 'orientation', ENUM),
      v('velocityFrom', 'velocityFrom', ENUM,
        { doc: 'Fixed, or from where along the ribbon the touch landed.' }),
      v('modAxis', 'modAxis', ENUM, { doc: 'What the cross-axis of a touch sends: nothing, or a CC.' }),
      v('modCc', 'modCc', INT, { ...FIELD('NoteRibbon', 'modCc'), doc: 'Which CC the cross-axis sends.' }),
      v('echo', 'echo', BOOL, { toggle: true }),
      v('echoChannel', 'echoChannel', INT, { ...FIELD('NoteRibbon', 'echoChannel'), doc: '0 means omni.' }),
    ],
  },
  {
    id: 'drumpads', section: 'DrumPads', prefix: 'drumPads', label: 'Drum Pads',
    summary: 'Re-map the Drum Pads — the grid, the kit, and each pad\'s own note, name and choke group.',
    verbs: [
      v('map', 'map', ENUM),
      v('baseNote', 'baseNote', INT, NOTE),
      v('mode', 'mode', ENUM),
      v('gate', 'gateMs', NUM, { min: 1, max: 5000 }),
      v('velocity', 'velocity', INT, VELOCITY),
      v('channel', 'channel', INT, CHANNEL),
      v('rows', 'rows', INT, { min: 1, max: 8 }),
      v('cols', 'cols', INT, { min: 1, max: 8 }),
      // `map` and `baseNote` were here and `origin` was not, so a script could re-map the grid and
      // could not say which corner pad 1 sits in — the third leg of the same decision.
      v('origin', 'origin', ENUM, { doc: 'Which corner pad 1 sits in. Hardware grids number from the bottom-left.' }),
      v('velocityFrom', 'velocityFrom', ENUM,
        { doc: 'Where a hit\'s velocity comes from: the fixed `velocity`, or how high up the pad it landed.' }),
      // Echo lights the pads from INCOMING MIDI, which turns the grid into a monitor for whatever a
      // sequencer is playing — a thing you switch on mid-set, not once in the inspector.
      v('echo', 'echo', BOOL, { toggle: true, doc: 'Light the pads from incoming MIDI as well as from hits.' }),
      v('echoChannel', 'echoChannel', INT, { min: 0, max: 16, doc: 'Which channel the echo listens to. 0 means omni.' }),
      // The per-pad overrides. `pads` is index-aligned with the grid and SPARSE — anything omitted
      // falls back to the generated map — so these four carry `count` (how many pads there are,
      // whatever the stored array's length) and `resolve` (what a pad actually plays, read through
      // the component's own resolver rather than reported as a hole).
      v('note', 'pads', ITEM, { item: 'note', kind: INT, ...NOTE, ...PADS,
        doc: 'Re-point one pad, 1-based. Reads back what the pad plays, generated map included.' }),
      v('label', 'pads', ITEM, { item: 'label', kind: STR, ...PADS,
        doc: 'Rename one pad, 1-based. Empty restores the name the map gives it.' }),
      v('choke', 'pads', ITEM, { item: 'choke', kind: INT, min: 0, max: 8, ...PADS,
        doc: 'Put one pad in a choke group, 1-based — pads sharing a non-zero group cut each other. 0 is none.' }),
      // A colour is read as set() reads one, by the shared component writer (panelRuntime's
      // writeComponentFields), because `pads.*.colour` is a colour field (scriptColours.LIST_ITEMS).
      v('colour', 'pads', ITEM, { item: 'colour', kind: STR, ...PADS,
        doc: 'Tint one pad, 1-based. The colour is stored as `set()` stores one ("red" as "#FF0000"), '
          + 'and one it would refuse changes nothing and answers false. "" returns the pad to the section accent.' }),
      // ROLL — a pad restrikes for as long as it is on. Per-pad, because a kick that buzzed every
      // time you leant on it would be unplayable, and because "the snare rolls and nothing else
      // does" is the whole shape of the feature.
      v('roll', 'pads', ITEM, { item: 'roll', kind: BOOL, ...PADS,
        doc: 'Make one pad roll, 1-based — it restrikes for as long as it is held or latched.' }),
      v('rollRate', 'rollRate', ENUM,
        { doc: 'How fast a rolling pad restrikes, as a note value against the panel transport.' }),
      v('rollSync', 'rollSync', BOOL,
        { toggle: true, doc: 'Follow the transport. Off runs the roll at `rollHz` instead.' }),
      v('rollHz', 'rollHz', NUM, { min: 0.5, max: 50, doc: 'Free-running roll speed, in strikes per second.' }),
      v('rollDelay', 'rollDelay', NUM,
        { min: 0, max: 4000, doc: 'How long a pad is held before its roll begins, in ms. 0 rolls from the first strike.' }),
      v('rollVelocity', 'rollVelocity', NUM,
        { ...UNIT, doc: 'Repeats strike at this fraction of the opening hit, so the first one is an accent.' }),
      // CORNER ZONES — a second vocabulary under the same sixteen pads. Grid-level: a corner is a
      // gesture the hand learns once, and per-pad corners would make one movement mean different
      // things on adjacent pads.
      v('zones', 'zones', BOOL, { toggle: true, doc: 'Let the corners of a pad carry their own actions.' }),
      v('cornerSize', 'cornerSize', NUM,
        { min: 0.05, max: 0.45, doc: 'How much of a pad each corner claims, from both edges.' }),
      ...PAD_CORNERS.map((corner) => v(cornerField(corner), cornerField(corner), ENUM,
        { doc: `What a strike in the ${PAD_CORNER_LABELS[corner].toLowerCase()} corner of a pad does.` })),
      v('flamMs', 'flamMs', NUM, { min: 1, max: 500, doc: 'How early a flam\'s grace note lands, in ms.' }),
      v('ghostVelocity', 'ghostVelocity', NUM,
        { ...UNIT, doc: 'A ghost strike\'s velocity, as a fraction of the hit it replaces.' }),
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
      v('gravity', 'gravity', NUM, FIELD('Kinetic', 'gravity')),
      v('bounce', 'restitution', NUM, FIELD('Kinetic', 'restitution')),
      v('friction', 'friction', NUM, FIELD('Kinetic', 'friction')),
      v('keepAlive', 'keepAlive', NUM, FIELD('Kinetic', 'keepAlive')),
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
      v('axisX', 'axisX', STR, { doc: 'What the horizontal axis is called — it is a label, and a performer reads it.' }),
      v('axisY', 'axisY', STR),
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
      // The transfer curve. It is sampled by envValueAt — the ENVELOPE's evaluator — so these are
      // envelope breakpoints wearing another name, and the shape vocabulary is the envelope's own
      // table rather than a second list that could disagree with it.
      v('curveX', 'curve', ITEM, { item: 'x', kind: NUM, ...UNIT }),
      v('curveY', 'curve', ITEM, { item: 'y', kind: NUM, ...UNIT }),
      v('curveShape', 'curve', ITEM, { item: 'curve', kind: ENUM,
        doc: 'How one segment of the transfer curve bends, 1-based.' }),
      v('sourceControl', 'sourceControlId', LINK, { sourceKind: 'range',
        doc: 'Name the control this Router follows, while `source` is "link" — a knob, slider or '
          + 'other range control. No argument, or an empty name, unlinks it. Reads back as the '
          + 'name, never as an id.' }),
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
      v('label', 'label', STR),
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
      // A step in amount units, as the inspector's Snap writes it: 0.25 snaps every cell to quarters.
      // This was an integer 0..64, so a script could set no snap but 0 or 1.
      v('step', 'step', NUM, { ...FIELD('Matrix', 'step'), doc: 'Snap cell amounts to multiples of this. 0 is free.' }),
      v('cellStyle', 'cellStyle', ENUM, { doc: 'How a crosspoint is drawn: bar, fill or dot.' }),
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
      v('addOnDoubleClick', 'addOnDoubleClick', BOOL, { toggle: true,
        doc: 'Whether a double-click on the curve adds a breakpoint.' }),
      v('snapX', 'snapX', NUM, { min: 0, max: 1, doc: 'Snap step for time, 0..1. 0 is free.' }),
      v('snapY', 'snapY', NUM, { min: 0, max: 1, doc: 'Snap step for level. 0 is free.' }),
      v('fillUnder', 'fillUnder', BOOL, { toggle: true }),
      v('phaseSource', 'phaseSourceId', LINK, { sourceKind: 'range' }),
    ],
  },

  /* -------------------------------------------------------------------- hands-on values */
  {
    id: 'ribbon', section: 'Ribbon', prefix: 'ribbon', label: 'Ribbon',
    summary: 'Drive a Ribbon, and change what it does when you let go.',
    verbs: [
      v('value', 'value', NUM, FIELD('Ribbon', 'value')),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('returnMode', 'returnMode', ENUM),
      v('returnValue', 'returnValue', NUM, FIELD('Ribbon', 'returnValue')),
      // The unified spring's fields. `returnRate` was this component's own word for it and is
      // still READ from old panels by normalizeReturnBehavior — but a verb writes, and a verb
      // writing a field nothing reads back is a verb that appears to work.
      v('returnTime', 'returnTime', NUM, { ...FIELD('Ribbon', 'returnTime'), doc: 'Milliseconds for the whole travel. 0 snaps.' }),
      v('returnCurve', 'returnCurve', ENUM, { doc: 'linear | exp | ease.' }),
      v('snap', 'snap', NUM, FIELD('Ribbon', 'snap')),
      v('orientation', 'orientation', ENUM),
      v('style', 'style', ENUM, { doc: 'Ribbon, wheel, or the 3D wheel.' }),
      v('label', 'label', STR),
      v('valuePrecision', 'valuePrecision', INT, { min: 0, max: 6, doc: 'Decimal places on the readout.' }),
    ],
  },
  {
    id: 'crossfader', section: 'Crossfader', prefix: 'crossfader', label: 'Crossfader',
    summary: 'Drive a Crossfader and change its law.',
    verbs: [
      v('mix', 'mix', NUM, FIELD('Crossfader', 'mix')),
      v('law', 'law', ENUM),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('detent', 'detent', NUM, FIELD('Crossfader', 'detent')),
      v('returnMode', 'returnMode', ENUM, { doc: 'none | center | min | max | rest.' }),
      v('returnValue', 'returnValue', NUM, FIELD('Crossfader', 'returnValue')),
      // The unified spring's fields. `returnRate` was this component's own word for it and is
      // still READ from old panels by normalizeReturnBehavior — but a verb writes, and a verb
      // writing a field nothing reads back is a verb that appears to work.
      v('returnTime', 'returnTime', NUM, { ...FIELD('Crossfader', 'returnTime'), doc: 'Milliseconds for the whole travel. 0 snaps.' }),
      v('returnCurve', 'returnCurve', ENUM, { doc: 'linear | exp | ease.' }),
      v('orientation', 'orientation', ENUM),
      v('labelA', 'labelA', STR),
      v('labelB', 'labelB', STR),
    ],
  },
  {
    id: 'joystick', section: 'Joystick', prefix: 'joystick', label: 'Vector Joystick',
    summary: 'Move a Vector Joystick puck, and change what it does when released.',
    verbs: [
      v('move', '', XY, { fx: 'x', fy: 'y', ...UNIT, flat: true }),
      v('bipolar', 'bipolar', BOOL, { toggle: true }),
      v('returnMode', 'returnMode', ENUM, { doc: 'none | center | min | max | rest.' }),
      v('returnValue', 'returnValue', NUM, { min: 0, max: 1 }),
      v('returnAxes', 'returnAxes', ENUM, { doc: 'both | x | y — which axes spring back.' }),
      // The unified spring's fields. `returnRate` was this component's own word for it and is
      // still READ from old panels by normalizeReturnBehavior — but a verb writes, and a verb
      // writing a field nothing reads back is a verb that appears to work.
      v('returnTime', 'returnTime', NUM, { min: 0, max: 5000, doc: 'Milliseconds for the whole travel. 0 snaps.' }),
      v('returnCurve', 'returnCurve', ENUM, { doc: 'linear | exp | ease.' }),
      v('cornerLabel', 'cornerLabels', LINE, { doc: 'Name one corner, 1-based, clockwise from the top left.' }),
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
      v('orientation', 'orientation', ENUM, { doc: 'Horizontal, vertical, or an arc.' }),
      v('gradient', 'gradient', BOOL, { toggle: true }),
      v('label', 'label', STR),
      v('valuePrecision', 'valuePrecision', INT, FIELD('Meter', 'valuePrecision')),
      v('valuePrefix', 'valuePrefix', STR),
      v('valueSuffix', 'valueSuffix', STR, { doc: 'What follows the number — "dB", "%", "ms".' }),
      v('zoneAt', 'zones', ITEM, { item: 'from', kind: NUM, ...UNIT,
        doc: 'Where one colour zone starts, 0..1, 1-based.' }),
      v('source', 'valueSourceId', LINK, { sourceKind: 'range' }),
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
      v('clockDevice', 'clockDevice', STR, {
        doc: 'Which device receives clock, start, stop and song position. Empty uses the panel\'s own device when it names exactly one.',
      }),
      v('runOnLoad', 'runOnLoad', BOOL, { toggle: true, doc: 'Start the transport as soon as the panel loads.' }),
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
      v('label', 'label', STR),
    ],
  },
  {
    id: 'lcd', section: 'Display', prefix: 'lcd', label: 'LCD Display', sample: 'Screen', article: 'an',
    summary: 'Write to a character LCD: a line at a time, plus backlight, brightness and scrolling.',
    verbs: [
      v('text', 'lines', LINE, { valueKind: 'lcdLine', doc: 'Write one line of the display.',
        ex: ['1, "PATCH 12"', 'writes PATCH 12 on the first row'] }),
      v('clear', 'lines', LINE, { clear: true, doc: 'Blank every line.', ex: ['', 'blanks the display'] }),
      v('backlight', 'backlightOn', BOOL, { toggle: true, doc: 'Switch the backlight on or off.' }),
      v('brightness', 'brightness', NUM, { min: 0, max: 100, doc: 'Set the brightness of the lit segments or pixels.', ex: ['80', 'sets the brightness to 80'] }),
      v('contrast', 'contrast', NUM, { min: 0, max: 100, doc: 'Set the contrast, which is how visible the unlit segments are.', ex: ['55', 'sets the contrast to 55'] }),
      v('scroll', 'scroll', ENUM, { doc: 'Set which way the lines scroll, or stop them scrolling.', ex: ['"left"', 'scrolls the lines to the left'] }),
      v('scrollSpeed', 'scrollSpeed', NUM, { min: 0, max: 60, doc: 'Set the scrolling speed, in characters per second.',
        argDocs: { scrollSpeed: 'Characters per second.\nRange: 0 ↔ 60.\n0: no scrolling.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('blink', 'blink', BOOL, { toggle: true, doc: 'Switch blinking of the whole display on or off.' }),
      v('cursor', 'cursor', ENUM, { doc: 'Set the cursor\'s shape, or hide it.', ex: ['"block"', 'shows a block cursor'] }),
      // `fit`: a cell of the display, so 1 to its columns and rows, not to 256. Column 40 of a
      // 16-column display was stored without a word and the cursor was drawn nowhere.
      v('cursorAt', '', XY, { fx: 'cursorCol', fy: 'cursorRow', min: 1, max: 256, flat: true, oneBased: true,
        fit: { cursorCol: 'cols', cursorRow: 'rows' },
        args: ['col', 'row'], doc: 'Put the cursor on a cell.', ex: ['5, 2', 'puts the cursor on column 5 of row 2'],
        notes: ['The cursor shows only when `cursor()` is set to "block" or "underline". Default: "off".'] }),
      v('value', 'value', NUM, { min: -1e9, max: 1e9, doc: 'Set the value the {value}, {pct} and {bar} tokens show.', ex: ['64', 'shows 64 wherever a line has {value}'] }),
      v('anim', 'animMode', ENUM, { doc: 'Set the animation behind the text of a graphic display: off, a file, or a preset.', ex: ['"preset"', 'plays the chosen preset animation'] }),
      v('animPreset', 'animPreset', STR, { doc: 'Choose the preset animation.', ex: ['"rain"', 'plays the rain animation'],
        argDocs: { animPreset: 'The preset\'s name: "wave", "scanner", "rain", "starfield", "spinner" or "plasma".' } }),
      v('animSpeed', 'animSpeed', NUM, { min: 0, max: 16, doc: 'Set the speed of the preset animation, as a multiple of its normal speed.', ex: ['2', 'plays the preset animation at twice its normal speed'],
        // The graphic canvas reads it as Math.max(0.05, Number(animSpeed) || 1): 0 is normal speed,
        // not a pause, and anything below 0.05 is 0.05.
        argDocs: { animSpeed: 'Speed factor.\nRange: 0 ↔ 16.\n1: normal; 0 is read as 1.\nBelow 0.05: 0.05.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('animFps', 'animFps', NUM, { min: 1, max: 120, doc: 'Set the frame rate of a sprite-sheet animation.', ex: ['24', 'plays the sheet at 24 frames per second'] }),
      v('animLoop', 'animLoop', BOOL, { toggle: true, doc: 'Switch looping of the animation on or off.',
        argDocs: { animLoop: 'Left out: toggles.\nfalse: the last frame holds.\n0 or "": false; any other value: true.' } }),
      v('scrollMode', 'scrollMode', ENUM, { doc: 'Set whether scrolled text loops round or bounces.', ex: ['"bounce"', 'bounces the text between its ends'] }),
      v('scrollRepeat', 'scrollRepeat', INT, { min: 0, max: 999, doc: 'Set how many times the text scrolls through.', ex: ['3', 'scrolls the text through three times, then stops'],
        argDocs: { scrollRepeat: 'Number of times.\nRange: 0 ↔ 999, whole.\n0: forever.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('blinkRate', 'blinkRate', NUM, { min: 50, max: 5000, doc: 'Set the blink period.', ex: ['250', 'blinks four times a second'],
        argDocs: { blinkRate: 'Period in milliseconds.\nRange: 50 ↔ 5000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('cursorBlink', 'cursorBlink', BOOL, { toggle: true, doc: 'Switch blinking of the cursor on or off.' }),
      v('valueMin', 'valueMin', NUM, { min: -1e9, max: 1e9, doc: 'Set the low end of the value\'s range, for the {pct} and {bar} tokens.', ex: ['0', 'makes 0 the empty end of the bar'] }),
      v('valueMax', 'valueMax', NUM, { min: -1e9, max: 1e9, doc: 'Set the high end of the value\'s range, for the {pct} and {bar} tokens.', ex: ['127', 'makes 127 the full end of the bar'] }),
      v('valuePrecision', 'valuePrecision', INT, { min: 0, max: 6, doc: 'Set how many decimal places the value shows.', ex: ['2', 'shows the value with two decimal places'] }),
      v('valuePrefix', 'valuePrefix', STR, { doc: 'Set the text written before the value.', ex: ['"Vol "', 'shows the value as Vol 64'] }),
      v('valueSuffix', 'valueSuffix', STR, { doc: 'Set the text written after the value.', ex: ['" dB"', 'shows the value as 64 dB'] }),
      v('valueSource', 'valueSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the value.' }),
      v('brightnessSource', 'brightnessSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the brightness.' }),
      v('backlightSource', 'backlightSourceId', LINK, { sourceKind: 'any', doc: 'Name the control that drives the backlight.' }),
      // CGRAM, 1-based. This one CAN be an `item` verb where Pixel.elements could not, and the
      // difference is the hardware: a display has exactly eight glyph slots and always has, so
      // slot 1 is always there to write to. `Pixel.elements` starts empty, which is what made the
      // same mechanism a silent no-op there. See display-component-futures.md, proposal 2.
      //
      // `fixed`, for the same reason the Drum Pads' override array is: this list does not grow from
      // a script. CGRAM is eight slots on the hardware and eight here, always — an insert would
      // mint a ninth that nothing can address, since the addressing is \\x00..\\x07. Without it the
      // family picks up insert/remove for free, which scriptComponents.test.js catches.
      v('glyph', 'glyphs', ITEM, { item: 'bits', kind: STR, fixed: true,
        doc: 'Define one of the eight user glyphs.',
        ex: ['1, ".#.#.|#####|#####|.###.|..#..|.....|.....|....."', 'puts a heart in slot 1, shown in a line by \\x00'],
        argDocs: { index: 'Glyph slot.\nRange: 1 ↔ 8.\nOutside the range: rejected with a console error.',
          bits: 'Eight rows of five: "#" lit, "." unlit, rows separated by "|".\nShown in a line by \\x00 to \\x07 for slots 1 to 8.' } }),
      // The on-screen editable field — the buffer a zone with show:'edit' bound to '@edit' shows,
      // and the one genuinely EDITABLE value a display owns. It was reachable by typing at the
      // screen and by a device binding on the `text` port, and by nothing else: no script could
      // read the patch name the user had just entered, which is the obvious thing to want.
      v('editText', 'editText', STR, { doc: 'Set the text in the display\'s editable field.', ex: ['"INIT VOICE"', 'puts INIT VOICE in the field'],
        notes: ['`read(target, "editText")` gives what is in the field, typed at the screen or set here.'] }),
    ],
  },
  {
    id: 'pixel', section: 'Pixel', prefix: 'pixel', label: 'Pixel Display',
    summary: 'Drive a pixel display: its elements\' text, visibility and position, plus backlight, brightness and animation.',
    verbs: [
      // THE SCENE, ADDRESSED BY NAME. These eight are why the `elem` kind exists; the reasoning is
      // in utils/pixelElements.js and the short version is that neither of the two obvious keys
      // works. An index addresses nothing on a display whose elements have not been drawn yet, and
      // it is the paint order, which the inspector's ▲/▼ buttons rewrite under any script holding
      // one. An id is stable and unreachable: `el_9f3a` is never shown anywhere in the UI.
      //
      // So the element carries a `name` the author types, beside its group, and these address that.
      // The four names below are the same four the index-addressed attempt used and failed with —
      // pixelText, pixelShow, pixelX, pixelY — which is the neatest way to say what changed.
      v('text', 'elements', ELEM, { item: 'text', kind: STR,
        doc: 'The text of one element, by name. What a `static` element draws.' }),
      v('label', 'elements', ELEM, { item: 'label', kind: STR,
        doc: 'The caption under one element, by name — or the name override on a `name` element.' }),
      v('show', 'elements', ELEM, { item: 'visible', kind: BOOL,
        doc: 'Show or hide one element, by name. No third argument toggles.' }),
      v('blink', 'elements', ELEM, { item: 'blink', kind: BOOL,
        doc: 'Blink one element, by name. No third argument toggles.' }),
      // Position and size in GRID pixels, which is what the inspector's X/Y/W/H columns are. The
      // range is wider than any panel in both directions on purpose: sliding an element off the
      // left edge and back is how a script animates one in, and clamping that to 0 would park it.
      v('x', 'elements', ELEM, { item: 'x', kind: INT, min: -4096, max: 4096,
        doc: 'Move one element, by name, to an x in grid pixels.' }),
      v('y', 'elements', ELEM, { item: 'y', kind: INT, min: -4096, max: 4096,
        doc: 'Move one element, by name, to a y in grid pixels.' }),
      v('w', 'elements', ELEM, { item: 'w', kind: INT, min: 0, max: 4096,
        doc: 'The width of one element, by name, in grid pixels. For text kinds this is the align/clip box.' }),
      v('h', 'elements', ELEM, { item: 'h', kind: INT, min: 0, max: 4096,
        doc: 'The height of one element, by name, in grid pixels. For text kinds this is the font height.' }),
      // Three element properties are STILL NOT HERE, each for a reason rather than by omission.
      // `kind` and `sourceId` are authoring choices — what an element IS and what drives it — and
      // rewriting those mid-song is a different panel, not a performance. `colour` is styling,
      // which this file does not cross.

      // The on-screen editable field, as on the LCD: the buffer an `edit` element bound to '@edit'
      // shows. It was reachable by typing at the screen and by a device binding, and by nothing
      // else — so no script could read the patch name the user had just entered.
      v('editText', 'editText', STR,
        { doc: 'The screen\'s editable text field (a patch name). Reads back what is in it.' }),
      v('backlight', 'backlightOn', BOOL, { toggle: true }),
      v('brightness', 'brightness', NUM, { min: 0, max: 100 }),
      v('contrast', 'contrast', NUM, { min: 0, max: 100 }),
      v('gamma', 'gamma', NUM, { min: 0.1, max: 4 }),
      v('glow', 'glow', NUM, UNIT),
      v('anim', 'animMode', ENUM),
      v('animPreset', 'animPreset', STR),
      v('animSpeed', 'animSpeed', NUM, { min: 0, max: 16 }),
      v('animLoop', 'animLoop', BOOL, { toggle: true }),
      v('animFps', 'animFps', NUM, { min: 1, max: 120 }),
      v('layoutTransition', 'layoutTransition', ENUM, { doc: 'How one layout gives way to the next.' }),
      v('transitionMs', 'transitionMs', NUM, { min: 0, max: 5000 }),
      v('brightnessSource', 'brightnessSourceId', LINK, { sourceKind: 'range' }),
      v('backlightSource', 'backlightSourceId', LINK, { sourceKind: 'any' }),
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
// What a call gives back, as every component verb's notes say it. A list that cannot grow is
// refused with a console error like any other refusal, so `insert` says the same.
const RETURNS_TRUE = ['Returns true.', 'Rejected: false, with a console error. Nothing changes.'];
const RETURNS_SET = ['Returns true. Already set: true, with a console line.', 'Rejected: false, with a console error. Nothing changes.'];
const RETURNS_VALUE = (what) => [`Returns the ${what}.`, 'Rejected: no result, with a console error.'];

const FAMILY_VERBS = [
  { v: 'read', k: READ, doc: 'Read back a setting, or every setting.',
    notes: ['`read(target)`: every setting as a table, by verb name. `read(target, "step")`: the whole list of a list verb; `read(target, "step", 3)`: one element, counted from 1.',
      ...RETURNS_VALUE('value')] },
  { v: 'size', k: SIZE, doc: 'Read how many elements a list has.',
    notes: ['`size(target)`: every list as a table, by verb name; `size(target, "node")`: one number. The Mod Matrix answers { rows, cols }.',
      ...RETURNS_VALUE('number')] },
  { v: 'fill', k: FILL, doc: 'Write a whole list in one call.',
    notes: ['One document change and one undo step, instead of one per element.',
      ...RETURNS_TRUE] },
  { v: 'insert', k: INSERT, doc: 'Add one element to a list.',
    notes: ['The new element is the canvas\'s own template. Appended; with an index, inserted before that position, counted from 1.',
      ...RETURNS_TRUE] },
  { v: 'remove', k: REMOVE, doc: 'Remove one element from a list.',
    notes: ['The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.',
      ...RETURNS_TRUE] },
];

/* ------------------------------------------------- the two every component spells the same
 *
 * `editable` and the `show*` flags are not per-component ideas. Twenty-two sections carry an
 * `editable` with one meaning — whether the control answers a finger — and every section that draws
 * something optional spells the toggle for it `showX`. Written out per family that is sixty lines
 * of the same line, which is how the Recorder ends up with a clamp the Harmoniser never got; and
 * the audit that found them found the same field missing from twenty-two families at once, which is
 * the signature of a rule rather than of twenty-two oversights.
 *
 * So they are DERIVED from the model. A component added later with a `showFoo` gets its verb
 * without anybody remembering to add one, and componentCoverage.test.js holds every family to that.
 *
 * Only booleans: `labelPosition` is a display setting and an enum, so it belongs to whichever
 * family declares it by hand with its own value table.
 */
function derivedFlagVerbs(fam) {
  const defaults = SECTION_DEFAULTS[fam.section] ?? {};
  const already = new Set(fam.verbs.map((verb) => verb.f).filter(Boolean));
  const out = [];
  const flag = (field, doc) => {
    if (already.has(field) || typeof defaults[field] !== 'boolean') return;
    out.push(v(field, field, BOOL, { toggle: true, doc }));
  };
  flag('editable', `Allow or lock touch control of the ${fam.label}.`);
  for (const field of Object.keys(defaults)) {
    if (!/^show[A-Z]/.test(field)) continue;
    // "showPlayhead" -> "the playhead". Read from the field rather than written per component.
    const what = field.slice(4).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    flag(field, `Show or hide the ${what}.`);
  }
  return out;
}

for (const fam of COMPONENT_FAMILIES) {
  fam.verbs.push(...derivedFlagVerbs(fam));
}

for (const fam of COMPONENT_FAMILIES) {
  const lists = fam.verbs.filter((verb) => LIST_KINDS.includes(verb.k) && !verb.clear);
  // insert/remove need an element TEMPLATE, so they only apply to `item` lists — collections of
  // objects the canvas can genuinely grow (nodes, slots, destinations, points). A `cell` or `line`
  // list is fixed-length and sized by a verb of its own — the Turing's step count is `length`, the
  // LCD's row count is the display's `rows` — so growing one from here would fight that verb.
  //
  // …and an `item` list can be in that position too, which the kind alone could not say: the Drum
  // Pads' overrides are sized by `rows` x `cols`. `fixed` is how such a list opts out, rather than
  // carrying two verbs that would report "cannot be grown" every time they were called.
  const growable = lists.some((verb) => verb.k === ITEM && !verb.fixed);
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
    sample: fam.sample,
    article: fam.article,
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

/**
 * The range one axis of an XY verb takes: the spec's own, or, for an axis that addresses a cell of
 * the control (`fit`: the LCD's cursor), 1 to the size the control has, read as the renderer reads
 * it. Without the control's settings, the spec's own.
 */
function axisRange(verb, field, c) {
  const sizeField = verb.fit?.[field];
  if (!sizeField || !c || typeof c !== 'object') return verb;
  const own = Number(c[sizeField]);
  const size = Number.isFinite(own) ? own : Number(SECTION_DEFAULTS[verb.section]?.[sizeField]);
  return Number.isFinite(size) ? { ...verb, max: Math.max(1, Math.round(size)) } : verb;
}

// An XY call's two numbers: either may be left out, but not both, and one that is given has to be
// a number. `cursorAt(t, "x", 2)` moved the row and dropped the "x" without a word.
const xyGiven = (x) => x !== undefined && x !== null;
const xyNumber = (x) => Number.isFinite(Number(x));
const xyLegal = (a, b) => (xyGiven(a) || xyGiven(b)) && [a, b].every((x) => !xyGiven(x) || xyNumber(x));

/** Coerce one argument to the kind a verb (or an array item) declares. null means "no-op". */
function coerce(kind, value, spec, current) {
  switch (kind) {
    case NUM: return clampNum(value, spec);
    case INT: return clampInt(value, spec);
    case BOOL:
      // No argument toggles, so one footswitch can do both jobs. `current` is what it toggles from.
      if (value === undefined || value === null) return !(current === true);
      return value !== false && value !== 0 && value !== '';
    // Text left out is refused, as every required value left out is: it was written as "".
    case STR: return value === undefined || value === null ? null : String(value);
    case ENUM: {
      // An unrecognised value is a NO-OP, never a silently wrong setting: a typo that leaves the
      // arpeggiator alone is debuggable, one that quietly sets it to "up" is not.
      const want = typeof value === 'number' ? value : String(value ?? '');
      return spec.values.some((x) => x === want) ? want : null;
    }
    default: return null;
  }
}

/**
 * How many elements an `item` verb can address, and the array it writes into.
 *
 * For every list but one these are the same thing: the array is the list. A list declaring `count`
 * is SPARSE — as long as the component says, however much of it happens to be stored — so the
 * addressable length comes from the component and the array is grown on demand, only as far as the
 * index being written.
 */
export function itemListLength(verb, cfg) {
  if (verb.count) return Math.max(0, Math.round(Number(verb.count(cfg)) || 0));
  return Array.isArray(cfg[verb.f]) ? cfg[verb.f].length : null;
}

function itemListFor(verb, cfg, at) {
  const stored = Array.isArray(cfg[verb.f]) ? cfg[verb.f] : (verb.count ? [] : null);
  if (!stored || stored.length > at) return stored;
  return [...stored, ...Array.from({ length: at + 1 - stored.length }, () => ({}))];
}

/**
 * What the component currently ANSWERS for one element — not what is stored for it.
 *
 * The two differ only for a sparse list, and there the difference is the whole point: pad 3 of a
 * fresh grid plays note 38 and is stored as nothing at all. Comparing a write against the stored
 * hole would make `note(kit, 3, 38)` write an override that pins the pad to the value it was
 * already going to take, and a pad pinned that way stops following `baseNote`.
 */
export function itemCurrent(verb, cfg, at) {
  if (!verb.resolve) {
    const list = Array.isArray(cfg[verb.f]) ? cfg[verb.f] : [];
    const row = list[at];
    return row && typeof row === 'object' ? row[verb.item] : undefined;
  }
  const resolved = verb.resolve(cfg);
  const row = Array.isArray(resolved) ? resolved[at] : null;
  return row && typeof row === 'object' ? row[verb.item] : undefined;
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
      // the x of a puck should not have to know where the y currently is. One given that is not a
      // number refuses the whole call (xyLegal), rather than moving the other axis alone.
      if (!xyLegal(a, b)) return {};
      const patch = {};
      const put = (field, value) => {
        if (value === undefined || value === null) return;
        const n = clampNum(value, axisRange(verb, field, c));
        if (n === null) return;
        // A one-based axis addresses a cell, which is whole: 2.6 was stored, read back as 2.6 and
        // drawn at 3.
        const stored = verb.oneBased ? Math.round(n) - 1 : n;
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
      const length = itemListLength(verb, c);
      if (length === null) return {};
      const at = indexOf(a, length);
      if (at === null) return {};
      const list = itemListFor(verb, c, at);
      if (!list) return {};
      const row = list[at] && typeof list[at] === 'object' ? list[at] : {};
      const current = itemCurrent(verb, c, at);
      const next = coerce(verb.kind, b, verb, current);
      if (next === null || next === current) return {};
      return { [verb.f]: list.map((x, i) => (i === at ? { ...row, [verb.item]: next } : x)) };
    }

    case ELEM: {
      // One property of every element answering to a name — across the flat scene AND every
      // layout, because a display with pages does not draw the flat list at all and a verb that
      // only knew about it would work on simple screens and silently fail on real ones.
      //
      // The FIRST match decides what a toggle toggles from. Two elements of the same name are the
      // same element on two pages (duplicating a layout keeps names and re-mints ids), so letting
      // each flip from its own state would drive them apart on the first `show` with no argument.
      const sites = elementSites(c, a);
      if (!sites.length) return {};
      const next = coerce(verb.kind, b, verb, elementAt(c, sites[0])?.[verb.item]);
      if (next === null) return {};
      return elementsPatch(c, sites, verb.item, next);
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
    case BOOL:
      return true;                                    // anything coerces; no argument toggles
    case STR:
      return a !== undefined && a !== null;
    case NUM: case INT:
      return a === undefined || a === null ? false : Number.isFinite(Number(a));
    case ENUM:
      return coerce(ENUM, a, verb, c[verb.f]) !== null;
    case XY:
      // At least one axis, and no axis given that is not a number — moving neither is not a move.
      return xyLegal(a, b);
    case INDEXSET:
      return Number.isFinite(Number(a)) && Math.round(Number(a)) - 1 >= 0;
    case ITEM: {
      const length = itemListLength(verb, c);
      if (length === null) return false;
      const at = indexOf(a, length);
      if (at === null) return false;
      return coerce(verb.kind, b, verb, itemCurrent(verb, c, at)) !== null;
    }
    case ELEM: {
      // A name this display has nothing under is a REFUSAL, not a no-op, and that is the whole
      // difference between this and the index-addressed attempt: "there is no element called
      // tempo" is something the console can say and a script can branch on. An index past the end
      // of an empty list said nothing at all.
      const sites = elementSites(c, a);
      if (!sites.length) return false;
      return coerce(verb.kind, b, verb, elementAt(c, sites[0])?.[verb.item]) !== null;
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

/* ------------------------------------------------------- what an index addresses, and why not */

// What each list verb's index addresses, by name. Every list here counts from 1, and a refusal
// says which ones there are: an index past the end refused "nothing changed" and nothing more, so
// `note(kit, 0, 36)` read exactly like a footswitch that did nothing.
const LIST_NOUNS = {
  'DrumPads.pads': 'pad', 'Turing.steps': 'step', 'Looper.lanes': 'lane', 'Orbit.nodes': 'node',
  'Timbre.anchors': 'anchor', 'Router.destinations': 'destination', 'Router.curve': 'point',
  'Macro.slots': 'slot', 'Constraint.members': 'member', 'Envelope.points': 'point',
  'Joystick.cornerLabels': 'corner', 'Meter.zones': 'zone', 'Display.lines': 'line', 'Display.glyphs': 'glyph',
  'Arp.mutes': 'step',
};

/** The name of what a list verb's index addresses: "pad", "lane", "point". */
export function listNoun(verb) {
  return LIST_NOUNS[`${verb.section}.${verb.f}`] ?? 'item';
}

/** A list verb's index arguments, by position after the target: 'index', 'row' or 'col', or
 *  'name' for an element addressed by its name; and read's index into the list it names. Empty for
 *  every other verb. */
export function verbIndexArgs(verb) {
  switch (verb.k) {
    case READ: return ['index'];
    case ITEM: case INDEXSET: return ['index'];
    case ELEM: return ['name'];
    case CELL: return verb.clear ? [] : (verb.grid ? ['row', 'col'] : ['index']);
    case LINE: return verb.clear ? [] : ['row'];
    default: return [];
  }
}

/** How many there are for an index to address: `{ count }`, or `{ rows, cols }` for a grid, or
 *  `{ names }` for named elements; null when the component has no such list. */
export function componentIndexRange(verb, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  switch (verb.k) {
    case ITEM: { const count = itemListLength(verb, c); return count === null ? null : { count }; }
    case CELL:
      if (verb.grid) return { rows: Array.isArray(c.rows) ? c.rows.length : 0, cols: Array.isArray(c.cols) ? c.cols.length : 0 };
      return Array.isArray(c[verb.f]) ? { count: c[verb.f].length } : null;
    case LINE: return Array.isArray(c[verb.f]) ? { count: c[verb.f].length } : null;
    case ELEM: {
      const names = [];
      for (const { elements } of elementLists(c)) for (const el of elements) { const n = elementLabel(el); if (n && !names.includes(n)) names.push(n); }
      return { names };
    }
    case INDEXSET: return { count: null };
    default: return null;
  }
}

/** Why one index addresses nothing ("There is no pad 99: the pads are 1 to 16."), or null. */
export function indexRefusal(value, count, noun) {
  if (indexOf(value, count) !== null) return null;
  return count > 0 ? `There is no ${noun} ${shownValue(value)}: the ${noun}s are 1 to ${count}.` : `It has no ${noun}s.`;
}

/**
 * Why a call `componentRequestLegal` refuses was refused, in a sentence, or null when the verb's
 * values say it (an unknown word, which the refusal follows with "One of: …"). The index first, as
 * the reducer reads it, then the value.
 */
export function componentRefusalReason(verb, cfg, args = []) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const [a, b] = args;
  const noun = listNoun(verb);
  const notNumber = (value) => (value === undefined || value === null ? 'No number was given.' : `${shownValue(value)} is not a number.`);
  const valueOf = (kind, value) => ((kind === NUM || kind === INT) && clampNum(value, verb) === null ? notNumber(value)
    : kind === STR && (value === undefined || value === null) ? 'No text was given.' : null);
  switch (verb.k) {
    case NUM: case INT: return Number.isFinite(Number(a)) && a !== null && a !== undefined ? null : notNumber(a);
    case STR: return a === undefined || a === null ? 'No text was given.' : null;
    case ITEM: {
      const range = componentIndexRange(verb, c);
      if (!range) return `It has no ${noun}s.`;
      return indexRefusal(a, range.count, noun) ?? valueOf(verb.kind, b);
    }
    case CELL: {
      if (verb.clear) return null;
      if (verb.grid) {
        const { rows, cols } = componentIndexRange(verb, c);
        return indexRefusal(a, rows, 'row') ?? indexRefusal(b, cols, 'column') ?? valueOf(NUM, args[2]);
      }
      const range = componentIndexRange(verb, c);
      if (!range) return `It has no ${noun}s.`;
      return indexRefusal(a, range.count, noun) ?? valueOf(NUM, b);
    }
    case LINE: {
      if (verb.clear) return null;
      const range = componentIndexRange(verb, c);
      return range ? indexRefusal(a, range.count, noun) : `It has no ${noun}s.`;
    }
    case INDEXSET: {
      const n = Number(a);
      return Number.isFinite(n) && Math.round(n) >= 1 ? null : `${shownValue(a)} is not a ${noun}: the ${noun}s count from 1.`;
    }
    case XY: {
      const bad = [a, b].find((x) => xyGiven(x) && !xyNumber(x));
      return bad !== undefined ? `${shownValue(bad)} is not a number.` : xyGiven(a) || xyGiven(b) ? null : 'No number was given.';
    }
    case ELEM: {
      if (elementSites(c, a).length) return null;
      const { names } = componentIndexRange(verb, c);
      return `There is no element called ${shownValue(a)}.${names.length ? ` The elements are ${names.map((n) => `"${n}"`).join(', ')}.` : ' It has none yet.'}`;
    }
    default: return null;
  }
}

/**
 * The number a verb was given past its range, which it uses as the nearest end, said as the console
 * says it (once per verb) and a Values row says it; null when there is none. A note of 200 was
 * stored as 127 without a word, and the row said "the note is from 0 to 127, and 200 is not", as
 * though the call had been refused.
 */
export function componentClampWarning(verb, path, args = [], cfg = null) {
  const names = verbArgs(verb);
  const given = [];
  // A refused call used nothing, so it has no nearest end to say.
  if (verb.k === XY && !xyLegal(args[0], args[1])) return null;
  if (verb.k === NUM || verb.k === INT) given.push([names[0], args[0]]);
  else if (verb.k === ITEM && (verb.kind === NUM || verb.kind === INT)) given.push([names[1], args[1]]);
  else if (verb.k === CELL && !verb.clear) given.push(verb.grid ? ['amount', args[2]] : [names[1], args[1]]);
  else if (verb.k === XY) given.push([names[0], args[0], verb.fx], [names[1], args[1], verb.fy]);
  for (const [name, value, field] of given) {
    if (value === undefined || value === null || typeof value === 'boolean') continue;
    const n = Number(value);
    if (!isFinite_(n)) continue;
    const spec = field ? axisRange(verb, field, cfg) : verb;
    const lo = isFinite_(spec.min) ? spec.min : -Infinity;
    const hi = isFinite_(spec.max) ? spec.max : Infinity;
    if (n >= lo && n <= hi) continue;
    const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
    const span = isFinite_(spec.min) && isFinite_(spec.max) ? `outside ${spec.min} to ${spec.max}`
      : n < lo ? `below ${spec.min}` : `above ${spec.max}`;
    return `${verb.family} ${path}: ${verb.v}(${shown}) — the ${name} ${shownValue(n)} is ${span}, so ${n < lo ? lo : hi} was used.`;
  }
  return null;
}

// The five every family gets take the NAME of one of the family's verbs: read any of them, and size,
// fill, insert and remove one of its lists. The names, and what each says of one it does not have,
// for the runtime (panelRuntime's componentReadAction and its siblings) and the Values tab alike.
const VERBS_BY_FAMILY = COMPONENT_VERBS.reduce((acc, verb) => {
  (acc[verb.family] ??= {})[verb.v] = verb;
  return acc;
}, {});

const EVERY_FAMILY = [READ, SIZE, FILL, INSERT, REMOVE];

/** The verb names `read` (every verb that sets something) or `size`, `fill`, `insert` and `remove`
 *  (the list verbs) of a family take, sorted as the refusal lists them. */
export function familyVerbNames(family, forWhat) {
  const specs = VERBS_BY_FAMILY[family] ?? {};
  if (forWhat === 'read') return Object.entries(specs).filter(([, s]) => !EVERY_FAMILY.includes(s.k)).map(([k]) => k).sort();
  return Object.entries(specs).filter(([, s]) => LIST_KINDS.includes(s.k) && !s.clear).map(([k]) => k).sort();
}

/** What `read`, `size`, `fill`, `insert` or `remove` says of a name it has no verb by, or null. */
export function familyVerbRefusal(family, forWhat, name) {
  const spec = (VERBS_BY_FAMILY[family] ?? {})[String(name ?? '')];
  if (forWhat === 'read') {
    const names = familyVerbNames(family, 'read').join(', ');
    if (!spec) return `${family}.read: "${name}" is not a verb of this component. One of: ${names}.`;
    // read("fill") gave nothing back without a word, as though fill had set nothing yet.
    return EVERY_FAMILY.includes(spec.k) ? `${family}.read: "${name}" sets nothing, so there is nothing to read back. One of: ${names}.` : null;
  }
  // size takes a list's clear verb as well; the rest do not.
  const ok = spec && LIST_KINDS.includes(spec.k) && (forWhat === 'size' || !spec.clear);
  return ok ? null : `${family}.${forWhat}: "${name}" does not address a list. One of: ${familyVerbNames(family, 'list').join(', ')}.`;
}

/**
 * What read says of an index that addresses nothing in the list the verb it names writes, or null:
 * read("step", 99) gave nothing back without a word. A grid takes a row and then a column.
 */
export function readIndexRefusal(named, cfg, index, index2) {
  if (!LIST_KINDS.includes(named.k) || index === undefined || index === null) return null;
  const range = componentIndexRange(named, cfg);
  if (!range) return null;
  const grid = named.k === CELL && named.grid;
  const second = grid && index2 !== undefined && index2 !== null;
  const head = `${named.family}.read("${named.v}", ${[index, ...(second ? [index2] : [])].map(shownValue).join(', ')})`;
  const why = grid ? indexRefusal(index, range.rows, 'row') ?? (second ? indexRefusal(index2, range.cols, 'column') : null)
    : indexRefusal(index, range.count ?? 0, listNoun(named));
  return why ? `${head}: ${why}` : null;
}

/** The argument of a verb that names one of its family's verbs: 'name' for the five every family
 *  gets, else none. */
export function verbNameArgs(verb) {
  return [READ, SIZE, FILL, INSERT, REMOVE].includes(verb.k) ? ['name'] : [];
}

/** The runtime's line for a refused call, in full: what the console says and a Values row says. */
export function componentRefusalLine(verb, path, args, cfg) {
  const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
  const reason = componentRefusalReason(verb, cfg, args);
  return `${verb.family} ${path}: ${verb.v}(${shown}) — refused, nothing changed`
    + (reason ? `. ${reason}` : verb.values ? `. One of: ${verb.values.join(', ')}.` : '');
}

/* ---------------------------------------------------------------------- signature text */
// The contract wants a human-readable signature per verb. Deriving it from the spec is what keeps
// the documentation from disagreeing with the implementation — there is only one description.

/** Argument names for a verb, after the mandatory `target`. */
export function verbArgs(verb) {
  switch (verb.k) {
    case XY: return verb.args ?? ['x', 'y'];
    case ITEM: return ['index', verb.item];
    case ELEM: return ['name', verb.item];
    case CELL: return verb.clear ? [] : (verb.grid ? ['row', 'col', 'amount'] : ['index', 'value']);
    case LINE: return verb.clear ? [] : ['row', 'text'];
    case INDEXSET: return ['index', 'on'];
    case BOOL: return [verb.v];
    // The five every family gets. Their optional arguments are rendered in verbSignature, which is
    // why they read as a plain list here.
    case LINK: return ['name'];
    case READ: return ['name', 'index'];
    case SIZE: return ['name'];
    case FILL: return ['name', 'values'];
    case INSERT: case REMOVE: return ['name', 'index'];
    default: return [verb.v];
  }
}

/**
 * The KIND of each argument, one per name `verbArgs` gives.
 *
 * It exists because the descriptor generator had been taking every argument's type from the verb's
 * own kind, and an addressed verb has two different ones: `drumPadsLabel(target, index, label)` was
 * published with `index` typed as a string, because the label is a string. Nobody noticed, because
 * the signature line beside it was right — which is the argument for deriving both from one place.
 */
export function verbArgKinds(verb) {
  switch (verb.k) {
    case XY: return [NUM, NUM];
    case ITEM: return [INT, verb.kind];
    case ELEM: return [STR, verb.kind];
    case CELL: return verb.clear ? [] : (verb.grid ? [INT, INT, NUM] : [INT, NUM]);
    case LINE: return verb.clear ? [] : [INT, STR];
    case INDEXSET: return [INT, BOOL];
    case LINK: return [STR];
    case READ: return [STR, INT];
    case SIZE: return [STR];
    case FILL: return [STR, 'list'];
    case INSERT: case REMOVE: return [STR, INT];
    default: return [verb.k];
  }
}

/**
 * Which arguments may be left out, one per name `verbArgs` gives.
 *
 * Kept beside verbArgKinds and asserted against verbSignature, because the two used to disagree:
 * every generated descriptor marked every argument required, including the ones the signature line
 * showed in brackets. A toggling boolean is the case that matters — `looperLane(t, 1)` flips the
 * lane, and the reference said the second argument was mandatory.
 */
export function verbArgOptional(verb) {
  const boolValue = (verb.k === ITEM || verb.k === ELEM) && verb.kind === BOOL;
  switch (verb.k) {
    case READ: return [true, true];
    case SIZE: case LINK: return [true];
    case FILL: return [false, false];
    case INSERT: case REMOVE: return [false, true];
    case INDEXSET: return [false, true];
    case ITEM: case ELEM: return [false, boolValue];
    case BOOL: return [Boolean(verb.toggle)];
    case XY: return [true, true];                     // either axis alone; both left out is refused
    default: return verbArgs(verb).map(() => false);
  }
}

export function verbSignature(verb) {
  const args = verbArgs(verb);
  switch (verb.k) {
    case LINK: return `${verb.id}(target [, name]) -> boolean`;
    case READ: return `${verb.id}(target [, name [, index]]) -> value`;
    case SIZE: return `${verb.id}(target [, name]) -> number|table`;
    case FILL: return `${verb.id}(target, name, values) -> boolean`;
    case INSERT: return `${verb.id}(target, name [, index]) -> boolean`;
    case REMOVE: return `${verb.id}(target, name [, index]) -> boolean`;
    default: break;
  }
  // Every WRITE verb reports whether the component now holds what was asked (§44), so the signature
  // has to say so — a reference generated from these would otherwise tell a script author the call
  // answers nothing, which is what they all used to do.
  //
  // A boolean with no argument toggles, and an index set does the same with its second, so both
  // show that argument as optional.
  let call;
  //
  // …and an addressed verb whose VALUE is a boolean toggles the same way — `lane(t, 1)` flips the
  // lane, `show(scr, "title")` flips the element — so the brackets are derived from verbArgOptional
  // rather than from the verb's own kind, which only knew about the scalar case.
  const optional = verbArgOptional(verb);
  if (verb.k === INDEXSET) call = `${verb.id}(target, index [, on])`;
  else {
    const head = ['target', ...args.filter((_, i) => !optional[i])].join(', ');
    const tail = args.filter((_, i) => optional[i]).map((name) => ` [, ${name}]`).join('');
    call = `${verb.id}(${head}${tail})`;
  }
  return `${call} -> boolean`;
}

const article = (label) => (/^[AEIOU]/i.test(label) ? 'an' : 'a');

/** The name of what an ITEM or ELEM verb's list holds, singular: "glyph", "pad". */
const itemNoun = (verb) => (LIST_NOUNS[`${verb.section}.${verb.f}`] ?? String(verb.f ?? '').replace(/s$/, '') ?? 'item');

/** A verb's one sentence: its own `doc`, else one made from its kind and the field it writes. */
export function verbSummary(verb) {
  if (verb.doc) return verb.doc;
  const words = fieldWords(verb.f);
  switch (verb.k) {
    case BOOL: return `Switch the ${words} on or off.`;
    case XY: return `Set the ${words || (verb.args ?? ['x', 'y']).join(' and ')}.`;
    case ITEM: return `Set the ${verb.item} of one ${itemNoun(verb)}.`;
    case ELEM: return `Set the ${verb.item} of an element, by its name.`;
    case CELL: return verb.clear ? 'Set every cell to 0.' : verb.grid ? 'Set one cell of the grid.' : `Set one ${itemNoun(verb)}.`;
    case LINE: return verb.clear ? 'Blank every line.' : 'Write one line.';
    case INDEXSET: return `Switch one ${itemNoun(verb)} on or off.`;
    case LINK: return `Name the control that drives the ${words || 'input'}.`;
    default: return `Set the ${words}.`;
  }
}

/** A sample value for a verb's own value, for its example: a number inside its range, the first of
 *  an enum's words, text. */
function sampleValue(verb, kind) {
  const spec = verb.k === ITEM || verb.k === ELEM ? { ...verb, min: verb.min, max: verb.max } : verb;
  switch (kind) {
    case NUM: case INT: {
      const lo = Number.isFinite(spec.min) ? spec.min : 0;
      const hi = Number.isFinite(spec.max) ? spec.max : 100;
      if (Math.abs(lo) >= 1e6 || Math.abs(hi) >= 1e6) return '64';
      const mid = lo + (hi - lo) / 2;
      return String(kind === INT ? Math.round(mid) : Math.round(mid * 10) / 10);
    }
    case BOOL: return '';
    case ENUM: return Array.isArray(verb.values) && verb.values.length ? `"${verb.values[Math.min(1, verb.values.length - 1)]}"` : '"…"';
    case STR: return '"text"';
    default: return '1';
  }
}

/** The first list verb of a verb's family, with the noun of what it holds, for the examples of the
 *  list verbs every family gets; `growable` asks for an item list that insert and remove take. */
function firstList(verb, growable = false) {
  const specs = Object.values(VERBS_BY_FAMILY[verb.family] ?? {})
    .filter((spec) => LIST_KINDS.includes(spec.k) && !spec.clear && (!growable || (spec.k === ITEM && !spec.fixed)))
    .sort((a, b) => a.v.localeCompare(b.v));
  const first = specs[0];
  return first ? [first.v, itemNoun(first)] : ['step', 'step'];
}

/** The family's sample control name for examples: "Screen" for the LCD, else the label as one word. */
const sampleTarget = (verb) => verb.sample ?? String(verb.label ?? 'Control').replace(/\s+/g, '');

/** A verb's example: `ce.components.lcd.brightness("Screen", 80)` sets the brightness to 80. The
 *  verb's own `ex` is [the arguments after the target, the gloss]; else one is made from its kind. */
export function verbExample(verb) {
  const call = `ce.components.${verb.family}.${verb.v}`;
  const target = `"${sampleTarget(verb)}"`;
  if (verb.ex) {
    const [args, gloss] = verb.ex;
    return `\`${call}(${[target, args].filter(Boolean).join(', ')})\` ${gloss}.`;
  }
  const words = fieldWords(verb.f);
  switch (verb.k) {
    case BOOL: return `\`${call}(${target})\` ${toggleGloss(verb.f)}.`;
    case NUM: case INT: { const n = sampleValue(verb, verb.k); return `\`${call}(${target}, ${n})\` sets the ${words} to ${n}.`; }
    case ENUM: { const w = sampleValue(verb, ENUM); return `\`${call}(${target}, ${w})\` sets the ${words} to ${w}.`; }
    case STR: return `\`${call}(${target}, "text")\` sets the ${words} to text.`;
    case LINK: return `\`${call}(${target}, "Cutoff")\` makes the control called Cutoff drive the ${words}.`;
    case READ: return `\`${call}(${target})\` gives every setting as a table.`;
    case SIZE: return `\`${call}(${target})\` gives the length of every list as a table.`;
    case FILL: { const [name, noun] = firstList(verb); return `\`${call}(${target}, "${name}", values)\` writes the ${noun}s from the first, one value per element.`; }
    case INSERT: { const [name, noun] = firstList(verb, true); return `\`${call}(${target}, "${name}")\` adds ${article(noun)} ${noun} at the end.`; }
    case REMOVE: { const [name, noun] = firstList(verb, true); return `\`${call}(${target}, "${name}")\` removes the last ${noun}.`; }
    case ITEM: return verb.kind === BOOL
      ? `\`${call}(${target}, 1)\` switches ${verb.item} of ${itemNoun(verb)} 1 on or off.`
      : `\`${call}(${target}, 1, ${sampleValue(verb, verb.kind)})\` sets the ${verb.item} of ${itemNoun(verb)} 1.`;
    case ELEM: return verb.kind === BOOL
      ? `\`${call}(${target}, "title")\` switches ${verb.item} of the element called title on or off.`
      : `\`${call}(${target}, "title", ${sampleValue(verb, verb.kind)})\` sets the ${verb.item} of the element called title.`;
    case CELL: return verb.clear ? `\`${call}(${target})\` sets every cell to 0.`
      : verb.grid ? `\`${call}(${target}, 1, 2, 0.5)\` sets the cell at row 1, column 2 to 0.5.` : `\`${call}(${target}, 1, 0.5)\` sets ${itemNoun(verb)} 1 to 0.5.`;
    case LINE: return verb.clear ? `\`${call}(${target})\` blanks every line.` : `\`${call}(${target}, 1, "text")\` writes text on the first line.`;
    case INDEXSET: return `\`${call}(${target}, 3)\` switches ${itemNoun(verb)} 3 on if it is off, and off if it is on.`;
    case XY: { const [x, y] = verb.args ?? ['x', 'y']; return `\`${call}(${target}, 1, 1)\` sets ${x} and ${y} to 1.`; }
    default: return `\`${call}(${target})\``;
  }
}

/** A verb's notes: what it returns, and a line of its own where it has one. */
export function verbNotes(verb) {
  const own = Array.isArray(verb.notes) ? verb.notes : [];
  switch (verb.k) {
    case READ: case SIZE: case FILL: case INSERT: case REMOVE: return own;
    case LINK: return [...own, ...RETURNS_SET, '`read(target, "' + verb.v + '")` gives the control\'s name.'];
    default: return [...own, ...RETURNS_SET];
  }
}

const RANGE_LINES = (verb, kind) => {
  const lo = verb.min;
  const hi = verb.max;
  const big = (n) => Number.isFinite(n) && Math.abs(n) >= 1e6;
  const whole = kind === INT ? ', whole' : '';
  const lines = [];
  if (Number.isFinite(lo) && Number.isFinite(hi) && !big(lo) && !big(hi)) lines.push(`Range: ${lo} ↔ ${hi}${whole}.`);
  else if (Number.isFinite(lo) && !big(lo)) lines.push(`Range: ≥ ${lo}${whole}.`);
  else if (Number.isFinite(hi) && !big(hi)) lines.push(`Range: ≤ ${hi}${whole}.`);
  else if (kind === INT) lines.push('A whole number.');
  if (kind === INT) lines.push('A fraction: rounded.');
  if (lines.some((l) => l.startsWith('Range'))) lines.push('Outside the range: the nearest end.');
  lines.push('Invalid: rejected with a console error.');
  return lines;
};
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const AXIS_WORDS = { col: 'column', row: 'row', x: 'x', y: 'y' };
/** The size an axis with `fit` is held to, in words. */
const FIT_WORDS = { cols: 'the display\'s columns', rows: 'the display\'s rows' };
/** `"off", "left" or "right"`: an enum's words as a list. */
const oneOfWords = (values) => {
  const quoted = (values ?? []).map((x) => `"${x}"`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}` : quoted.join('');
};

/**
 * A parameter's text, by the verb's kind and the argument's place: what it is, its range, what is
 * left out means, and what is rejected, one rule per line. `name` is the argument's name as
 * verbArgs gives it, `kind` its kind as verbArgKinds does; 'target' is the control. A verb's own
 * `argDocs[name]` wins.
 */
export function verbParamSummary(verb, name, kind) {
  if (verb.argDocs?.[name]) return verb.argDocs[name];
  if (name === 'target') return `The ${verb.label}'s control, by name.\nNot ${verb.article ?? article(verb.label)} ${verb.label}: rejected with a console error.`;
  const words = cap(fieldWords(verb.f) || name);
  const noun = itemNoun(verb);
  const indexLines = (what, plural) => `${cap(what)} number, counted from 1.\nNot one of the ${plural}: rejected with a console error.`;
  switch (verb.k) {
    case NUM: case INT: return [`${words}.`, ...RANGE_LINES(verb, verb.k)].join('\n');
    case BOOL: return verb.toggle ? 'Left out: toggles.\n0 or "": false; any other value: true.' : '0 or "": false; any other value: true.';
    case ENUM: return `One of ${oneOfWords(verb.values)}. Case-sensitive.\nInvalid: rejected with a console error.`;
    case STR: return `${words}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case XY: {
      const size = verb.fit?.[name === verbArgs(verb)[0] ? verb.fx : verb.fy];
      const range = size ? [`Range: ${verb.min} ↔ ${FIT_WORDS[size]}.`, ...(verb.oneBased ? ['A fraction: rounded.'] : []), 'Outside the range: the nearest end.']
        : RANGE_LINES(verb, NUM).filter((l) => !l.startsWith('Invalid'));
      return [`${cap(AXIS_WORDS[name] ?? name)}${verb.oneBased ? ', counted from 1' : ''}.`, ...range,
        'Left out: unchanged.', 'Invalid: rejected with a console error.', 'Both left out: rejected with a console error.'].join('\n');
    }
    case LINE:
      if (name === 'row') return `Row, counted from 1.\nNot a row the display has: rejected with a console error.`;
      return 'The line.\nLonger than the display: cut at its width unless it scrolls, with a console warning the first time.\nA character the display cannot draw: a blank cell, with a console warning the first time.\nA number: written as text.';
    case ITEM:
      if (name === 'index') return indexLines(noun, `${noun}s`);
      return kind === NUM || kind === INT ? [`${cap(verb.item)}.`, ...RANGE_LINES(verb, kind)].join('\n')
        : kind === BOOL ? 'Left out: toggles.\n0 or "": false; any other value: true.'
        : kind === ENUM ? `One of ${oneOfWords(verb.values)}. Case-sensitive.\nInvalid: rejected with a console error.`
        : `${cap(verb.item)}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case ELEM:
      if (name === 'name') return 'The element\'s name, as given in the inspector.\nNot an element of this display: rejected with a console error.';
      return kind === NUM || kind === INT ? [`${cap(verb.item)}.`, ...RANGE_LINES(verb, kind)].join('\n')
        : kind === BOOL ? 'Left out: toggles.\n0 or "": false; any other value: true.'
        : kind === ENUM ? `One of ${oneOfWords(verb.values)}. Case-sensitive.\nInvalid: rejected with a console error.`
        : `${cap(verb.item)}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case CELL:
      if (name === 'row') return 'Row, counted from 1.\nNot a row the grid has: rejected with a console error.';
      if (name === 'col') return 'Column, counted from 1.\nNot a column the grid has: rejected with a console error.';
      if (name === 'index') return indexLines(noun, `${noun}s`);
      return [`${cap(name)}.`, ...RANGE_LINES(verb, NUM)].join('\n');
    case INDEXSET:
      if (name === 'index') return `${cap(noun)} number, counted from 1.\nBelow 1, or invalid: rejected with a console error.`;
      return 'Left out: toggles.\n0 or "": off; any other value: on.';
    case LINK: return `The driving control's name.\nLeft out, or "": unlinked.\nNot on this panel, or not ${SOURCE_KINDS[verb.sourceKind]?.label ?? 'a usable source'}: rejected with a console error.`;
    case READ:
      if (name === 'name') return 'A verb of this component, by name.\nLeft out: every setting, as a table.\nNot a verb that sets something: rejected with a console error.';
      return 'Element number of a list verb, counted from 1.\nLeft out: the whole list.\nNot one the list has: rejected with a console error.';
    case SIZE: return 'A list verb of this component, by name.\nLeft out: every list, as a table.\nNot a list verb: rejected with a console error.';
    case FILL:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb: rejected with a console error.';
      return 'A list, one value per element from the first.\nLonger than the list: rejected with a console error.\nNot a list: rejected with a console error.';
    case INSERT:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb, or a list that cannot grow: rejected with a console error.';
      return 'Position of the new element, counted from 1.\nLeft out: after the last.\nNot one the list has: rejected with a console error.';
    case REMOVE:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb, or a list that cannot shrink: rejected with a console error.';
      return 'Element number, counted from 1.\nLeft out: the last.\nNot one the list has: rejected with a console error.';
    default: return `${words}.`;
  }
}
