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
import { pitchClassOf } from './musicTheory.js';
import { SCALES as CHORD_SCALES } from '../utils/chordPadLayout.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { SOURCE_KINDS } from '../utils/controlSources.js';
import {
  drumPadCount, resolveDrumPads, PAD_CORNERS, PAD_CORNER_LABELS, cornerField,
} from '../utils/drumPadLayout.js';
import { elementSites, elementAt, elementsPatch, elementsUpdate, elementNames } from '../utils/pixelElements.js';
import { shownValue } from './shownValue.js';
import { listWord } from '../utils/wordLists.js';
import { glyphBitsRefusal } from '../utils/lcdUserGlyphs.js';
import { lcdWriteAt, lcdClearAt, lcdRows, lcdLayoutIndex, lcdLayoutCount, lcdZonePlace } from './lcdPositions.js';

const NUM = 'num', INT = 'int', BOOL = 'bool', STR = 'str', ENUM = 'enum';
// What reads as off for an on/off verb: false, 0, "", and the words "false", "off" and "0" in any
// case. Any other text was on, so blink(t, "false") and blink(t, "OFF") switched it on.
const OFF_WORDS = new Set(['', 'false', 'off', '0']);
const isOff = (value) => value === false || value === 0 || (typeof value === 'string' && OFF_WORDS.has(value.trim().toLowerCase()));
const OFF_RULE = '0, "", "false", "off" or "0": false. Case-insensitive.\nAny other value: true.';
// The Arpeggiator's own chord (item 8 of the owner's review of the arp): what its key, scale, degree,
// chord type and octave set, and only while it plays that chord.
const OWN_CHORD = 'Its own chord only.';
const OWN_CHORD_ONLY = 'Its own chord only: with `source()` "link" or "input" the notes come from there.';
const FOLLOWER_REPLACED = 'Following the panel\'s key: replaced at its next change.';
/** How many notes a chord scale has, the most a degree can be: 7, 6 for blues, 5 for the pentatonics. */
const scaleNoteCount = (scale) => (CHORD_SCALES[String(scale ?? 'minor')] ?? CHORD_SCALES.minor).length;
const XY = 'xy', ITEM = 'item', CELL = 'cell', LINE = 'line';
// The kind of LINE's first argument: a row number, or a table of layout, row and col (lcdPositions.js).
const POSITION = 'position';
// The LCD's lines are addressed by position, on a layout (lcdPositions.js); the Joystick's corner
// labels, the other LINE verb, by a plain number into its list, as before.
const lcdLines = (verb) => verb.k === LINE && verb.section === 'Display';
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
// Which layout a display shows (the LCD's and the Pixel Display's). Not a field either: the layout
// showing is the preview's, transient, as a soft key's is (stores/displayLayouts.js), so it
// dispatches in the runtime, and read(t, "layout") answers it there.
const LAYOUT = 'layout';
export const LAYOUT_KIND = LAYOUT;
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
// A plural name takes "they" and "them": "shows the scanlines if they are hidden".
const toggleGloss = (field) => {
  const show = /^show[A-Z]/.test(String(field ?? ''));
  const words = fieldWords(show ? String(field).slice(4) : field);
  const [is, it] = /[^s]s$/.test(words) ? ['they are', 'them'] : ['it is', 'it'];
  return show
    ? `shows the ${words} if ${is} hidden, and hides ${it} if ${is} shown`
    : `switches the ${words} on if ${is} off, and off if ${is} on`;
};

// A verb whose field the inspector draws from data takes its range from that field set instead of
// repeating it here (models/inspectorFieldSets.js), so a script and the inspector cannot disagree.
const FIELD = scriptRangeOf;

// The Arpeggiator's rate, the inspector's range (item 2 of the owner's review of the arp): it took
// 0.01 to 200, the engine plays nothing slower than 0.1, and above about 60 the preview, moving once
// a frame, skips steps.
const RATE = { min: 0.1, max: 40 };
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
      // Item 1 of the owner's review: "random" and "asPlayed" played as "up" (every note set was
      // sorted, and nothing chose at random); arpLayout.arpSequence and arpStepCell now play them.
      v('pattern', 'pattern', ENUM, { doc: 'Set the order the notes are played in.',
        ex: ['"updown"', 'plays the notes low to high, then back down'],
        argDocs: { pattern: ['"up": low to high.', '"down": high to low.', '"updown": up, then down; the top and bottom notes once.',
          '"downup": down, then up; the same.', '"asPlayed": in the order the notes were pressed. Its own chord: as "up".',
          '"random": one note at random each step.', '"chord": every note at once, each step.',
          'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: "up".'] }),
      v('rate', 'rate', NUM, { ...RATE, doc: 'Set how many steps a second it plays, while not synced.',
        ex: ['8', 'plays eight steps a second'],
        argDocs: { rate: ['Steps per second.', 'Range: 0.1 ↔ 40.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['While synced to the Transport: no effect; `division()` sets the step.', 'Default: 6.'] }),
      v('division', 'division', ENUM, { doc: 'Note value per step while synced to the transport.' }),
      v('sync', 'syncToTransport', BOOL, { toggle: true }),
      // Item 3: 1 to 4, what plays (expandOctaves) and what the inspector offers; 5 and 6 played as 4.
      v('octaves', 'octaves', INT, { min: 1, max: 4, doc: 'Set how many octaves the notes are repeated over, upward.',
        ex: ['2', 'plays the notes, then the same notes an octave up'],
        argDocs: { octaves: ['Octaves, from the notes up.', '1: the notes only.', 'Range: 1 ↔ 4, whole.', 'A fraction: rounded.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['A note above 127 is left out.', 'With "chord": every octave at once.', 'Default: 1.'] }),
      // Item 4: the inspector's 0.05 to 1. 0 played a 10 ms blip (gateSeconds' floor), and 1 holds 99%.
      v('gate', 'gate', NUM, { min: 0.05, max: 1, doc: 'Set how long each note is held, as a part of its step.',
        ex: ['0.5', 'holds each note for half its step'],
        argDocs: { gate: ['Part of the step.', '1: held to the next step; 99% of it, so a repeated note sounds again.',
          'Range: 0.05 ↔ 1.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: 0.6.'] }),
      // Item 5: 0 to 1, as the engine reads it (a negative swing played straight) and the inspector
      // offers; and whose swing a synced arp plays, which only the inspector's "Swing from" could set.
      v('swing', 'swing', NUM, { min: 0, max: 1, doc: 'Set how far every second step is delayed.',
        ex: ['0.5', 'delays every second step by a quarter of a step'],
        argDocs: { swing: ['Part of half a step: 1 delays every second step by half a step.', '0: straight.', 'Range: 0 ↔ 1.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['While synced: the Transport\'s swing, unless `swingSource()` is "own".', 'Default: 0.'] }),
      v('swingSource', 'swingSource', ENUM, { doc: 'Set whose swing a synced arp plays: the Transport\'s or its own.',
        ex: ['"own"', 'plays its own swing while synced'],
        argDocs: { swingSource: ['"transport": the Transport\'s swing, while synced.', '"own": `swing()`, always.',
          'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Not synced: its own swing, either way.', 'Default: "transport".'] }),
      // Item 9: what latch keeps, and that it is for a linked Chord Pad or MIDI input only.
      v('latch', 'latch', BOOL, { toggle: true, doc: 'Keep playing the last notes held after they are let go.',
        ex: ['true', 'keeps playing the last chord held on the linked Chord Pad after it is let go'],
        argDocs: { latch: `true: the last notes held keep playing.\nfalse: it stops when they are let go.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['With `source()` "link" or "input" only: its own chord always plays.', 'Notes held again replace the latched ones.',
          'A Panic lets them go.', 'Default: false.'] }),
      // Item 8, its own chord. `key` reads a note name or wraps a number round the octave
      // (`readValue`, pitchClassOf), as phrase.key wraps; `degree` counts from 1 as
      // ce.music.degreeChord does, stored one lower, to the scale's own length (`rangeFrom`);
      // followPanelKey(true) takes the panel's key at once, as the inspector's toggle does (the
      // runtime's panelKeyCatchUp, for every family's).
      v('key', 'key', INT, { min: 0, max: 11, readValue: pitchClassOf, argKind: 'pitchClass',
        valueRefusal: (value) => `${shownValue(value)} is not a note: a name such as "C", "F#" or "Eb", or 0 to 11.`,
        doc: 'Set the key of its own chord.', ex: ['"F#"', 'builds its chord in F♯'],
        argDocs: { key: ['The key\'s note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B.', 'Past 11 or below 0: round the octave; 12 is C.',
          'A fraction: rounded.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [OWN_CHORD_ONLY, FOLLOWER_REPLACED, 'Default: 0 (C).'] }),
      v('scale', 'scale', ENUM, { doc: 'Set the scale of its own chord.', ex: ['"dorian"', 'builds its chord from the Dorian scale'],
        notes: [OWN_CHORD, FOLLOWER_REPLACED, 'Default: "minor".'] }),
      v("followPanelKey", "followPanelKey", BOOL, { toggle: true, doc: 'Follow the panel\'s key and scale, or keep its own.',
        ex: ['true', 'takes the panel\'s key and scale, and changes with them'],
        argDocs: { followPanelKey: `true: the panel's key and scale, at once and at every change.\nfalse: its own.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('degree', 'degree', INT, { min: 1, max: 7, oneBased: true, rangeFrom: (c) => ({ max: scaleNoteCount(c.scale) }),
        doc: 'Set which step of the scale its chord is built on.', ex: ['5', 'builds its chord on the fifth step'],
        argDocs: { degree: ['Step of the scale, counted from 1: 1 is the key\'s own chord.', 'Range: 1 ↔ the scale\'s notes: 7, 6 for "blues", 5 for the pentatonics.',
          'A fraction: rounded.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [OWN_CHORD, 'A scale changed to a shorter one: its last step.', 'Default: 1.'] }),
      v('chordType', 'chordType', ENUM, { doc: 'Set how many notes its chord has.', ex: ['"seventh"', 'adds the seventh: four notes'],
        argDocs: { chordType: ['"triad": three notes.', '"seventh": four, the seventh added.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [OWN_CHORD, 'Default: "triad".'] }),
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
      // Item 6: a seek (stores/componentPhases.js). It wrote the stored phase, which the preview
      // reads only when it opens, so a running arp never moved and read gave the number written.
      // `seek.clock` is the field that hands the position to the Transport, when nothing can move it.
      v('phase', 'phase', NUM, { ...UNIT, seek: { clock: 'syncToTransport' }, doc: 'Move the arp to a point in its sequence.',
        ex: ['0.5', 'moves it halfway through its sequence'],
        argDocs: { phase: ['Where in the sequence: 0 the start, 0.5 halfway.', '1: the start again.', 'Range: 0 ↔ 1.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Running: the next step plays from there. Stopped: it starts from there.',
          'While synced: no effect; the Transport\'s position decides.', '`read(target, "phase")` gives where it is now.',
          'Nothing is written to the panel.'] }),
      // Item 7: what "on" means, a step past the end kept, and read counting from 1 (panelRuntime).
      v('mute', 'mutes', INDEXSET, { doc: 'Mute or unmute one step.',
        ex: ['3', 'mutes step 3 if it plays, and lets it play if it is muted'],
        argDocs: {
          index: ['Step number, counted from 1, as the cells are drawn from the left.', 'A fraction: rounded.',
            'Past the last step: kept, for when the sequence grows.', 'Below 1, or invalid: rejected with a console error.'].join('\n'),
          on: `true: muted.\nfalse: plays.\nLeft out: toggles.\n${OFF_RULE}`,
        },
        notes: ['A step is a place in the sequence, not a note: the mute stays on step 3 when the notes change.',
          '`read(target, "mute")`: the muted steps, counted from 1; `read(target, "mute", 3)`: true if step 3 is muted.',
          'Default: none muted.'] }),
      v('inputChannel', 'inputChannel', INT, { min: 0, max: 16, doc: 'Which channel it takes notes from. 0 means omni.' }),
      v('baseOctave', 'baseOctave', INT, { min: -1, max: 8, doc: 'Set the octave its chord starts in.',
        ex: ['4', 'puts the chord\'s root in octave 4, as in C4, middle C'],
        argDocs: { baseOctave: ['The root\'s octave, as in C3. Middle C is C4.', 'Range: -1 ↔ 8, whole.', 'A fraction: rounded.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [OWN_CHORD, 'A note above 127 is left out.', 'Default: 3.'] }),
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
    summary: 'Write to a character LCD by layout, row and column, plus backlight, brightness and scrolling.',
    verbs: [
      // A row of a layout, or the display's lines when it has none: the owner's script model,
      // docs/design/api-descriptions-handoff.md ("The LCD's script model"), and lcdPositions.js.
      v('text', 'lines', LINE, { valueKind: 'lcdLine', doc: 'Write one row of the display.',
        ex: ['1, "PATCH 12"', 'writes PATCH 12 on the first row'],
        notes: ['On a display with layouts: written on the layout, shown where no zone paints.'] }),
      v('clear', 'lines', LINE, { clear: true, doc: 'Blank the layout showing, or part of it.', ex: ['', 'blanks the display'],
        notes: ['Only text is blanked: a zone still shows its control.'] }),
      v('backlight', 'backlightOn', BOOL, { toggle: true, doc: 'Switch the backlight on or off.' }),
      // Brightness 0 is not dark: the renderer draws the lit text at 35% + 65% of it. And while a
      // control is linked as the source, that control sets what is shown (PanelPreviewSurface).
      v('brightness', 'brightness', NUM, { min: 0, max: 100, doc: 'Set the brightness of the lit segments or pixels.', ex: ['80', 'sets the brightness to 80'],
        argDocs: { brightness: 'How bright the lit characters are.\nRange: 0 ↔ 100.\n0: the dimmest, still lit.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While `brightnessSource()` links a control, that control sets the brightness.'] }),
      // Contrast is the unlit cells' visibility, and the backlight glow's strength (35% + 50% of it).
      v('contrast', 'contrast', NUM, { min: 0, max: 100, doc: 'Set the contrast, which is how visible the unlit segments are.', ex: ['55', 'sets the contrast to 55'],
        argDocs: { contrast: 'How visible the unlit segments are.\nAlso how strongly the backlight glows.\nRange: 0 ↔ 100.\n0: unlit segments hidden.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      // A row moves only when it is longer than the display (linePeriod in the renderer), and a
      // layout's rows are composed at the display's width, so on one this does nothing: a zone
      // scrolls by its own Overflow setting, at scrollSpeed.
      v('scroll', 'scroll', ENUM, { doc: 'Set which way the rows scroll, or stop them scrolling.', ex: ['"left"', 'scrolls the rows to the left'],
        notes: ['Only a row longer than the display moves.', 'On a display with layouts: no effect. A zone set to scroll does so at `scrollSpeed()`.'] }),
      v('scrollSpeed', 'scrollSpeed', NUM, { min: 0, max: 60, doc: 'Set the scrolling speed, in characters per second.',
        argDocs: { scrollSpeed: 'Characters per second.\nRange: 0 ↔ 60.\n0: no scrolling.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      // Only the lit text blinks: the renderer hides the glyphs on the off phase and draws the
      // unlit segments, the backlight, the cursor, images and animations throughout.
      v('blink', 'blink', BOOL, { toggle: true, doc: 'Switch the text blinking on or off.', ex: ['true', 'makes the text blink'],
        argDocs: { blink: `true: the text blinks.\nfalse: the text is steady.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Only the text blinks: the backlight, the unlit segments, the cursor, images and animations stay.',
          'The speed is set by `blinkRate()`. Default: 500 ms on, then 500 ms off.'] }),
      v('cursor', 'cursor', ENUM, { doc: 'Set the cursor\'s shape, or hide it.', ex: ['"block"', 'shows a block cursor'] }),
      // `fit`: a cell of the display, so 1 to its columns and rows, not to 256. Column 40 of a
      // 16-column display was stored without a word and the cursor was drawn nowhere.
      v('cursorAt', '', XY, { fx: 'cursorCol', fy: 'cursorRow', min: 1, max: 256, flat: true, oneBased: true,
        fit: { cursorCol: 'cols', cursorRow: 'rows' },
        args: ['col', 'row'], doc: 'Put the cursor on a cell.', ex: ['5, 2', 'puts the cursor on column 5 of row 2'],
        notes: ['The cursor shows only when `cursor()` is set to "block" or "underline". Default: "off".'] }),
      v('value', 'value', NUM, { min: -1e9, max: 1e9, doc: 'Set the value the {value}, {pct} and {bar} tokens show.', ex: ['64', 'shows 64 wherever a row has {value}'],
        argDocs: { value: 'The number shown.\nOutside valueMin ↔ valueMax: shown as it is; `{pct}` and `{bar}` stop at the ends.\nInvalid: rejected with a console error.' },
        notes: ['While `valueSource()` links a control, that control sets the value and its range.'] }),
      v('anim', 'animMode', ENUM, { doc: 'Set the animation behind the text of a graphic display: off, a file, or a preset.', ex: ['"preset"', 'plays the chosen preset animation'] }),
      // A list of names, as scroll and cursor are: any word was stored, and the display drew nothing
      // for one it did not know.
      v('animPreset', 'animPreset', ENUM, { doc: 'Choose the preset animation.', ex: ['"rain"', 'plays the rain animation'],
        notes: ['Plays only on a graphic display, while `anim()` is "preset".'] }),
      // The inspector's range (its preset Speed is 0.1 to 5), at the owner's word. A script could set
      // 0 to 16, and the graphic canvas reads it as Math.max(0.05, Number(animSpeed) || 1): 0 played
      // at normal speed and anything below 0.05 at 0.05, neither of which the inspector could show.
      v('animSpeed', 'animSpeed', NUM, { min: 0.1, max: 5, doc: 'Set the speed of the preset animation, as a multiple of its normal speed.', ex: ['2', 'plays the preset animation at twice its normal speed'],
        argDocs: { animSpeed: 'Speed factor.\nRange: 0.1 ↔ 5.\n1: normal.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('animFps', 'animFps', NUM, { min: 1, max: 120, doc: 'Set the frame rate of a sprite-sheet animation.', ex: ['24', 'plays the sheet at 24 frames per second'],
        argDocs: { animFps: 'Frames per second.\nOnly for a sprite sheet: a GIF or APNG plays at its own speed.\nRange: 1 ↔ 120.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('animLoop', 'animLoop', BOOL, { toggle: true, doc: 'Switch looping of the animation on or off.',
        argDocs: { animLoop: `Left out: toggles.\nfalse: the last frame holds.\n${OFF_RULE}` } }),
      v('scrollMode', 'scrollMode', ENUM, { doc: 'Set whether scrolled text loops round or bounces.', ex: ['"bounce"', 'bounces the text between its ends'] }),
      v('scrollRepeat', 'scrollRepeat', INT, { min: 0, max: 999, doc: 'Set how many times the text scrolls through.', ex: ['3', 'scrolls the text through three times, then stops'],
        argDocs: { scrollRepeat: 'Number of times.\nRange: 0 ↔ 999, whole.\n0: forever.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      // Time lit, then the same time dark: the renderer's half-cycle, so 250 blinks twice a second.
      // 60 is the fastest it draws (LcdDisplayRenderer) and the inspector's minimum; 50 was stored
      // and read back as 50 and drawn as 60.
      v('blinkRate', 'blinkRate', NUM, { min: 60, max: 5000, doc: 'Set how fast the text blinks.',
        ex: ['250', 'shows the text for 250 ms, then hides it for 250 ms: two blinks a second'],
        argDocs: { blinkRate: 'Time on, then the same time off, in milliseconds.\nRange: 60 ↔ 5000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Has an effect only while `blink()` is on. Default: off.', 'The cursor blinks at its own fixed speed.'] }),
      v('cursorBlink', 'cursorBlink', BOOL, { toggle: true, doc: 'Switch blinking of the cursor on or off.' }),
      v('valueMin', 'valueMin', NUM, { min: -1e9, max: 1e9, doc: 'Set the low end of the value\'s range, for the {pct} and {bar} tokens.', ex: ['0', 'makes 0 the empty end of the bar'] }),
      v('valueMax', 'valueMax', NUM, { min: -1e9, max: 1e9, doc: 'Set the high end of the value\'s range, for the {pct} and {bar} tokens.', ex: ['127', 'makes 127 the full end of the bar'] }),
      v('valuePrecision', 'valuePrecision', INT, { min: 0, max: 6, doc: 'Set how many decimal places the value shows.', ex: ['2', 'shows the value with two decimal places'],
        argDocs: { valuePrecision: 'Decimal places `{value}` shows. `{pct}` is always whole.\nRange: 0 ↔ 6, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('valuePrefix', 'valuePrefix', STR, { doc: 'Set the text written before the value.', ex: ['"Vol "', 'shows the value as Vol 64'],
        argDocs: { valuePrefix: 'Text before the number in `{value}`. Not used by `{pct}` or `{bar}`.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('valueSuffix', 'valueSuffix', STR, { doc: 'Set the text written after the value.', ex: ['" dB"', 'shows the value as 64 dB'],
        argDocs: { valueSuffix: 'Text after the number in `{value}`. Not used by `{pct}` or `{bar}`.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('valueSource', 'valueSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the value.' }),
      v('brightnessSource', 'brightnessSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the brightness.' }),
      // Any control: on while it is on, or past halfway along its range (lcdZones' backlightOnFrom).
      v('backlightSource', 'backlightSourceId', LINK, { sourceKind: 'any', doc: 'Name the control that drives the backlight.',
        ex: ['"Light"', 'makes the control called Light switch the backlight'], linkRule: 'On while the control is on, or past halfway.' }),
      // CGRAM, 1-based. This one CAN be an `item` verb where Pixel.elements could not, and the
      // difference is the hardware: a display has exactly eight glyph slots and always has, so
      // slot 1 is always there to write to. `Pixel.elements` starts empty, which is what made the
      // same mechanism a silent no-op there. See display-component-futures.md, proposal 2.
      //
      // `fixed`, for the same reason the Drum Pads' override array is: this list does not grow from
      // a script. CGRAM is eight slots on the hardware and eight here, always — an insert would
      // mint a ninth that nothing can address, since the addressing is \\x00..\\x07. Without it the
      // family picks up insert/remove for free, which scriptComponents.test.js catches.
      v('glyph', 'glyphs', ITEM, { item: 'bits', kind: STR, fixed: true, refuseValue: glyphBitsRefusal,
        doc: 'Define one of the eight user glyphs.',
        ex: ['1, ".#.#.|#####|#####|.###.|..#..|.....|.....|....."', 'puts a heart in slot 1, shown in a row by \\x00'],
        argDocs: { index: 'Glyph slot.\nRange: 1 ↔ 8.\nA fraction: rounded.\nOutside the range: rejected with a console error.',
          bits: 'Eight rows of five: "#" lit, "." unlit, rows separated by "|".\nShown in a row by \\x00 to \\x07 for slots 1 to 8.\n'
            + '"1" and "0": the same as "#" and ".".\nFewer than eight rows, or fewer than five cells in a row: the rest unlit.\n'
            + 'Empty, or nothing lit: the slot is cleared.\nOther characters: rejected with a console error.\n'
            + 'More than eight rows, or a row longer than five: rejected with a console error.' } }),
      // The on-screen editable field — the buffer a zone with show:'edit' bound to '@edit' shows,
      // and the one genuinely EDITABLE value a display owns. It was reachable by typing at the
      // screen and by a device binding on the `text` port, and by nothing else: no script could
      // read the patch name the user had just entered, which is the obvious thing to want.
      // A script's text is stored as given: the field's character set and length govern typing.
      v('editText', 'editText', STR, { doc: 'Set the text in the display\'s editable field.', ex: ['"INIT VOICE"', 'puts INIT VOICE in the field'],
        argDocs: { editText: 'The text in the field.\nNot held to the field\'s characters or length: those apply to typing.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['`read(target, "editText")` gives what is in the field, typed at the screen or set here.'] }),
      // ZONES, BY NAME (the owner's decision after the LCD's review): a layout's zones, addressed as
      // a Pixel Display's elements are (utils/pixelElements.js with `list: 'zones'`). The name is
      // the one typed in the zone table, matched in any case, and it reaches every zone carrying it
      // on every layout, as duplicating a layout keeps the names. Prefixed `zone`, because `text`
      // and the rest already mean the display's own.
      v('zoneText', 'layouts', ELEM, { list: 'zones', item: 'text', kind: STR, doc: 'Set the text of a fixed-text zone, by its name.',
        ex: ['"Title", "VOL"', 'writes VOL in the zone called Title'],
        argDocs: { text: 'The text.\nShown by a zone that shows fixed text.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('zoneLabel', 'layouts', ELEM, { list: 'zones', item: 'label', kind: STR, doc: 'Set the name a name zone shows in place of its control\'s, by its name.',
        ex: ['"Cutoff", "CUT"', 'shows CUT in the zone called Cutoff, in place of the control\'s name'],
        argDocs: { label: 'The name shown.\n"": the control\'s own name.\nShown by a zone that shows a name.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('zoneShow', 'layouts', ELEM, { list: 'zones', item: 'visible', arg: 'on', kind: BOOL, absent: true, doc: 'Show or hide a zone, by its name.',
        ex: ['"Cutoff"', 'hides the zone called Cutoff if it is shown, and shows it if it is hidden'],
        argDocs: { on: `true: shown.\nfalse: hidden; the layout's text shows through.\nLeft out: toggles.\n${OFF_RULE}` } }),
      v('zoneAt', 'layouts', ELEM, { list: 'zones', item: 'at', arg: 'place', kind: POSITION, place: true, doc: 'Move a zone, by its name.',
        ex: ['"Cutoff", {row = 2, col = {1, 8}}', 'moves the zone called Cutoff to columns 1 to 8 of row 2'],
        argDocs: { place: ['A table: {row = 2, col = {1, 8}}, each part optional.', '`row`: one row, counted from 1.',
          '`col`: the first column, the zone keeping its width up to the display\'s edge; or a range {1, 8}.',
          'A row number alone: the row.', 'A part left out: unchanged.', 'A fraction: rounded.',
          'A range past the display: to its last column.', 'Not on the display: rejected with a console error.'].join('\n') } }),
      v('zoneSource', 'layouts', ELEM, { list: 'zones', item: 'sourceId', arg: 'control', kind: STR, link: true, doc: 'Link a zone to another control, by its name.',
        ex: ['"Cutoff", "Resonance"', 'makes the zone called Cutoff show the control called Resonance'],
        argDocs: { control: ['The control\'s name. Case-insensitive.', '"": unlinked.',
          '"@active": the control last touched.', '"@active#value", "@active#switch" or "@active#choice": the last of that kind.',
          '"@edit": the display\'s editable field.', 'This display, or not on this panel: rejected with a console error.',
          'Left out: rejected with a console error.'].join('\n') },
        notes: ['`read(target, "zoneSource", "Cutoff")` gives the control\'s name.'] }),
      v('zoneKind', 'layouts', ELEM, { list: 'zones', item: 'show', arg: 'kind', kind: ENUM, doc: 'Set what a zone shows, by its name.',
        ex: ['"Cutoff", "bar"', 'makes the zone called Cutoff show its control as a bar'] }),
      v('layout', 'layouts', LAYOUT, { flat: 'its own rows', doc: 'Show one of the display\'s layouts.', ex: ['2', 'shows layout 2'],
        notes: ['Shown as a soft key shows it: until a soft key, an overlay or the Selector changes it, or its own timeout returns it.'] }),
      // The four overlays, declared here rather than derived (derivedFlagVerbs) for what each is.
      v('showGlass', 'showGlass', BOOL, { toggle: true, doc: 'Show or hide the glass: a sheen across the screen.',
        notes: ['Its tint is set in the inspector, under Colour ▸ Glass. Default: shown.'] }),
      v('showGhost', 'showGhost', BOOL, { toggle: true, doc: 'Show or hide the ghost: the faint unlit cells behind the text.',
        notes: ['How faint is set by `contrast()`. Default: shown.'] }),
      v('showScanlines', 'showScanlines', BOOL, { toggle: true, doc: 'Show or hide the scanlines: thin horizontal lines across the screen.',
        notes: ['Default: hidden.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the grid: faint lines between the cells or pixels.',
        notes: ['Default: hidden.'] }),
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
      v('animPreset', 'animPreset', ENUM),
      v('animSpeed', 'animSpeed', NUM, { min: 0.1, max: 5 }),   // the inspector's range, as the LCD's
      v('animLoop', 'animLoop', BOOL, { toggle: true }),
      v('animFps', 'animFps', NUM, { min: 1, max: 120 }),
      v('layoutTransition', 'layoutTransition', ENUM, { doc: 'How one layout gives way to the next.' }),
      v('transitionMs', 'transitionMs', NUM, { min: 0, max: 5000 }),
      v('brightnessSource', 'brightnessSourceId', LINK, { sourceKind: 'range' }),
      v('backlightSource', 'backlightSourceId', LINK, { sourceKind: 'any',
        ex: ['"Light"', 'makes the control called Light switch the backlight'], linkRule: 'On while the control is on, or past halfway.' }),
      v('layout', 'layouts', LAYOUT, { flat: 'its elements', doc: 'Show one of the display\'s layouts.', ex: ['2', 'shows layout 2'],
        notes: ['Shown until an overlay or the Selector changes it.'] }),
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
  // read's, size's and fill's notes name the family's own lists (familyNotes, below): they named a
  // "step" and a "node" list and the Mod Matrix on every component, and only one had each.
  { v: 'read', k: READ, doc: 'Read back a setting, or every setting.' },
  { v: 'size', k: SIZE, doc: 'Read how many elements a list has.' },
  { v: 'fill', k: FILL, doc: 'Write a whole list in one call.' },
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

/**
 * A number verb as it reads one call: its range, or the range the control gives it (`rangeFrom`: the
 * Arpeggiator's degree, to its scale's length), and the value as the verb reads it (`readValue`: the
 * Arpeggiator's key, a note name or a number round the octave). `value` is null when it cannot be read.
 */
function scalarCall(verb, c, given) {
  const spec = verb.rangeFrom ? { ...verb, ...verb.rangeFrom(c && typeof c === 'object' ? c : {}) } : verb;
  const value = verb.readValue && given !== undefined && given !== null ? verb.readValue(given) : given;
  return { spec, value };
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
      return !isOff(value);
    // Text left out is refused, as every required value left out is: it was written as "".
    case STR: return value === undefined || value === null ? null : String(value);
    case ENUM: {
      // An unrecognised value is a NO-OP, never a silently wrong setting: a typo that leaves the
      // arpeggiator alone is debuggable, one that quietly sets it to "up" is not. A word in another
      // case is the word: "LEFT" is "left", stored as the list spells it.
      if (typeof value === 'number') return spec.values.some((x) => x === value) ? value : null;
      return listWord(spec.values, value);
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
      const { spec, value } = scalarCall(verb, c, a);
      const next = value === null ? null : coerce(verb.k, value, spec, c[verb.f]);
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
      // A value the component cannot use as written (a glyph it cannot draw) is refused, not stored.
      if (next === null || next === current || verb.refuseValue?.(next)) return {};
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
      const list = verb.list ?? 'elements';
      const sites = elementSites(c, a, list);
      if (!sites.length) return {};
      // zoneAt moves each zone by the place given, keeping its own width (lcdPositions.js).
      if (verb.place) {
        const { place, refusal } = lcdZonePlace(c, b);
        return refusal ? {} : elementsUpdate(c, sites, place, list);
      }
      // A zone without `visible` is shown (`absent`), so a toggle starts from there.
      const next = coerce(verb.kind, b, verb, elementAt(c, sites[0], list)?.[verb.item] ?? verb.absent);
      if (next === null) return {};
      if (verb.absent !== undefined) {
        return elementsUpdate(c, sites, (el) => ((el[verb.item] ?? verb.absent) === next ? el : { ...el, [verb.item]: next }), list);
      }
      return elementsPatch(c, sites, verb.item, next, list);
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
      const want = b === undefined || b === null ? !on : !isOff(b);
      if (want === on) return {};
      const next = want ? [...list, at].sort((x, y) => x - y) : list.filter((n) => n !== at);
      return { [verb.f]: next };
    }

    case LINE: {
      if (lcdLines(verb)) {
        // Where on the display, and on which layout: lcdPositions.js reads a row number or a table
        // of layout, row and col, and writes the layout's own text (the display's lines when it has
        // no layouts). A section with neither lines nor rows is not a display, and has nothing.
        if (!Array.isArray(c.lines) && !isFinite_(Number(c.rows))) return {};
        return verb.clear ? lcdClearAt(c, a).patch : lcdWriteAt(c, a, b).patch;
      }
      const list = Array.isArray(c[verb.f]) ? c[verb.f] : null;
      if (!list) return {};
      if (verb.clear) {
        if (list.every((x) => x === '')) return {};
        return { [verb.f]: list.map(() => '') };
      }
      const at = indexOf(a, list.length);
      // Text left out is refused, as every text verb's is; "" blanks the line on purpose.
      if (at === null || b === undefined || b === null) return {};
      const text = String(b);
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
    case NUM: case INT: {
      if (a === undefined || a === null) return false;
      const { value } = scalarCall(verb, c, a);
      return value !== null && Number.isFinite(Number(value));
    }
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
      const next = coerce(verb.kind, b, verb, itemCurrent(verb, c, at));
      return next !== null && !verb.refuseValue?.(next);
    }
    case ELEM: {
      // A name this display has nothing under is a REFUSAL, not a no-op, and that is the whole
      // difference between this and the index-addressed attempt: "there is no element called
      // tempo" is something the console can say and a script can branch on. An index past the end
      // of an empty list said nothing at all.
      const list = verb.list ?? 'elements';
      const sites = elementSites(c, a, list);
      if (!sites.length) return false;
      if (verb.place) return !lcdZonePlace(c, b).refusal;
      return coerce(verb.kind, b, verb, elementAt(c, sites[0], list)?.[verb.item]) !== null;
    }
    case LAYOUT: return !lcdLayoutIndex(c, a, verb.flat).refusal;
    case LINE: {
      if (lcdLines(verb)) return !(verb.clear ? lcdClearAt(c, a) : lcdWriteAt(c, a, b)).refusal;
      const list = listOf(verb.f);
      return verb.clear ? Boolean(list) : Boolean(list) && indexOf(a, list.length) !== null && b !== undefined && b !== null;
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
  'Joystick.cornerLabels': 'corner', 'Meter.zones': 'zone', 'Display.lines': 'row', 'Display.glyphs': 'glyph',
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
    case LINE: return lcdLines(verb) ? ['at'] : (verb.clear ? [] : ['row']);
    case LAYOUT: return ['layout'];
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
    case LAYOUT: return { count: lcdLayoutCount(c) };
    case LINE:
      if (lcdLines(verb)) return { count: lcdRows(c) };
      return Array.isArray(c[verb.f]) ? { count: c[verb.f].length } : null;
    case ELEM: {
      return { names: elementNames(c, verb.list ?? 'elements') };
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
    case NUM: case INT: {
      if (a === undefined || a === null) return notNumber(a);
      const { value } = scalarCall(verb, c, a);
      if (value !== null && Number.isFinite(Number(value))) return null;
      return verb.valueRefusal ? verb.valueRefusal(a) : notNumber(a);
    }
    case STR: return a === undefined || a === null ? 'No text was given.' : null;
    case ITEM: {
      const range = componentIndexRange(verb, c);
      if (!range) return `It has no ${noun}s.`;
      return indexRefusal(a, range.count, noun) ?? valueOf(verb.kind, b)
        ?? (b === undefined || b === null ? null : verb.refuseValue?.(coerce(verb.kind, b, verb)) ?? null);
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
    case LAYOUT: return lcdLayoutIndex(c, a, verb.flat).refusal ?? null;
    case LINE: {
      if (lcdLines(verb)) return (verb.clear ? lcdClearAt(c, a) : lcdWriteAt(c, a, b)).refusal ?? null;
      if (verb.clear) return null;
      const range = componentIndexRange(verb, c);
      return range ? indexRefusal(a, range.count, noun) ?? valueOf(STR, b) : `It has no ${noun}s.`;
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
      const noun = verb.list === 'zones' ? 'zone' : 'element';
      if (elementSites(c, a, verb.list ?? 'elements').length) {
        if (verb.place) return lcdZonePlace(c, b).refusal ?? null;
        if (verb.link) return b === undefined || b === null ? 'No control was given: a control\'s name, or "" to unlink.' : null;
        return verb.kind === STR && (b === undefined || b === null) ? 'No text was given.' : null;
      }
      const { names } = componentIndexRange(verb, c);
      return `There is no ${noun} called ${shownValue(a)}.${names.length ? ` The ${noun}s are ${names.map((n) => `"${n}"`).join(', ')}.` : ' It has none yet.'}`;
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
  // A range of rows or columns that runs past the display's edge stops at it.
  if (verb.place) {
    if (!elementSites(cfg, args[0], verb.list).length) return null;
    const said = lcdZonePlace(cfg, args[1]).clamped;
    return said ? `${verb.family} ${path}: ${verb.v}(${args.map((x) => JSON.stringify(x) ?? 'nil').join(', ')}) — ${said}` : null;
  }
  if (lcdLines(verb)) {
    const said = (verb.clear ? lcdClearAt(cfg, args[0]) : lcdWriteAt(cfg, args[0], args[1])).clamped;
    return said ? `${verb.family} ${path}: ${verb.v}(${args.map((x) => JSON.stringify(x) ?? 'nil').join(', ')}) — ${said}` : null;
  }
  if (verb.k === NUM || verb.k === INT) given.push([names[0], scalarCall(verb, cfg, args[0]).value]);
  else if (verb.k === ITEM && (verb.kind === NUM || verb.kind === INT)) given.push([names[1], args[1]]);
  else if (verb.k === CELL && !verb.clear) given.push(verb.grid ? ['amount', args[2]] : [names[1], args[1]]);
  else if (verb.k === XY) given.push([names[0], args[0], verb.fx], [names[1], args[1], verb.fy]);
  for (const [name, value, field] of given) {
    if (value === undefined || value === null || typeof value === 'boolean') continue;
    const n = Number(value);
    if (!isFinite_(n)) continue;
    const spec = field ? axisRange(verb, field, cfg) : scalarCall(verb, cfg, value).spec;
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

/** A family's verb by the name a script wrote, in any case: `read(t, "SCROLLSPEED")` reads
 *  scrollSpeed. null when it has none by that name (and never one of Object's own, "toString"). */
export function familyVerbNamed(family, name) {
  const specs = VERBS_BY_FAMILY[family] ?? {};
  const want = String(name ?? '').trim();
  if (Object.hasOwn(specs, want)) return specs[want];
  return Object.values(specs).find((s) => s.v.toLowerCase() === want.toLowerCase()) ?? null;
}

/** What `read`, `size`, `fill`, `insert` or `remove` says of a name it has no verb by, or null. */
export function familyVerbRefusal(family, forWhat, name) {
  const spec = familyVerbNamed(family, name);
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
    case ELEM: return ['name', verb.arg ?? verb.item];
    case CELL: return verb.clear ? [] : (verb.grid ? ['row', 'col', 'amount'] : ['index', 'value']);
    case LINE: return lcdLines(verb) ? (verb.clear ? ['at'] : ['at', 'text']) : (verb.clear ? [] : ['row', 'text']);
    case INDEXSET: return ['index', 'on'];
    case BOOL: return [verb.v];
    // The five every family gets. Their optional arguments are rendered in verbSignature, which is
    // why they read as a plain list here.
    case LINK: return ['name'];
    case LAYOUT: return ['layout'];
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
    case LINE: return lcdLines(verb) ? (verb.clear ? [POSITION] : [POSITION, STR]) : (verb.clear ? [] : [INT, STR]);
    case INDEXSET: return [INT, BOOL];
    case LINK: return [STR];
    case LAYOUT: return ['layoutRef'];
    case READ: return [STR, INT];
    case SIZE: return [STR];
    case FILL: return [STR, 'list'];
    case INSERT: case REMOVE: return [STR, INT];
    // A value read some other way than its kind says (the arp's key: a note's name, or a number).
    default: return [verb.argKind ?? verb.k];
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
    case LINE: return lcdLines(verb) && verb.clear ? [true] : verbArgs(verb).map(() => false);
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
    case LAYOUT: return 'Show one of the display\'s layouts.';
    default: return `Set the ${words}.`;
  }
}

/** A sample value for a verb's own value, for its example: a number inside its range, the first of
 *  an enum's words, text. */
/** A family's list verbs, in the order they are declared: what fill's example writes. */
function declaredLists(verb) {
  return Object.values(VERBS_BY_FAMILY[verb.family] ?? {}).filter((spec) => LIST_KINDS.includes(spec.k) && !spec.clear);
}

/** A few values a list takes, written out as a script would: `{0.25, 0.5, 0.75}`. */
function sampleList(spec) {
  if (spec.k === CELL && spec.grid) return { text: '{{0.5, 0}, {0, 0.5}}', count: 2 };
  if (spec.k === LINE) return spec.section === 'Display' ? { text: '{"PATCH 12", "VOL 100"}', count: 2 } : { text: '{"One", "Two"}', count: 2 };
  const kind = spec.k === ITEM ? spec.kind : NUM;
  if (kind === BOOL) return { text: '{true, false, true}', count: 3 };
  if (kind === ENUM && Array.isArray(spec.values) && spec.values.length > 1) return { text: `{"${spec.values[0]}", "${spec.values[1]}"}`, count: 2 };
  if (kind === STR || kind === ENUM) return { text: '{"One", "Two"}', count: 2 };
  const lo = Number.isFinite(spec.min) && Math.abs(spec.min) < 1e6 ? spec.min : 0;
  const hi = Number.isFinite(spec.max) && Math.abs(spec.max) < 1e6 ? spec.max : 1;
  const at = (t) => (kind === INT ? Math.round(lo + (hi - lo) * t) : Math.round((lo + (hi - lo) * t) * 100) / 100);
  return { text: `{${[0.25, 0.5, 0.75].map(at).join(', ')}}`, count: 3 };
}

/** What read's index is for a family whose elements or zones are addressed by name. */
function elementReadLines(verb) {
  const named = Object.values(VERBS_BY_FAMILY[verb.family] ?? {}).filter((spec) => spec.k === ELEM);
  const element = named.find((spec) => spec.v === 'text' || spec.v === 'zoneText') ?? named[0];
  if (!element) return [];
  const noun = element.list === 'zones' ? 'zone' : 'element';
  return [`For ${noun === 'zone' ? 'a' : 'an'} ${noun} verb, such as "${element.v}": the ${noun}'s name, case-insensitive.`];
}

/** read's and size's notes, from the family's own lists: the first by name, as firstList takes it. */
function familyNotes(verb) {
  const lists = Object.values(VERBS_BY_FAMILY[verb.family] ?? {})
    .filter((spec) => LIST_KINDS.includes(spec.k) && !spec.clear).sort((a, b) => a.v.localeCompare(b.v));
  const named = Object.values(VERBS_BY_FAMILY[verb.family] ?? {}).filter((spec) => spec.k === ELEM).sort((a, b) => a.v.localeCompare(b.v));
  const first = lists[0];
  const grid = lists.find((spec) => spec.k === CELL && spec.grid);
  if (verb.k === SIZE) {
    if (!first) return [];
    const one = first === grid ? `\`size(target, "${first.v}")\`: { rows, cols }.` : `\`size(target, "${first.v}")\`: one number.`;
    const rows = grid && grid !== first ? ` \`size(target, "${grid.v}")\`: { rows, cols }.` : '';
    return [`\`size(target)\`: every list as a table, by verb name; ${one}${rows}`];
  }
  const all = '`read(target)`: every setting as a table, by verb name.';
  // An element's text is what a reader of a pixel display reads first, and a zone's of an LCD.
  const element = named.find((spec) => spec.v === 'text' || spec.v === 'zoneText') ?? named[0];
  const noun = element?.list === 'zones' ? 'zone' : 'element';
  const byName = element ? `\`read(target, "${element.v}")\`: every ${noun}'s, by name; \`read(target, "${element.v}", "${noun === 'zone' ? 'Title' : 'title'}")\`: one ${noun}'s.` : '';
  if (first === grid && first) return [`${all} \`read(target, "${first.v}")\`: the whole grid, as rows; \`read(target, "${first.v}", 2, 3)\`: row 2, column 3.`];
  if (first) return [`${all} \`read(target, "${first.v}")\`: the whole list; \`read(target, "${first.v}", 3)\`: one ${itemNoun(first)}, counted from 1.${byName ? ` ${byName}` : ''}`];
  if (element) return [`${all} ${byName}`];
  return [all];
}

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
    case LAYOUT: return `\`${call}(${target}, 2)\` shows layout 2.`;
    case READ: return `\`${call}(${target})\` gives every setting as a table.`;
    case SIZE: return `\`${call}(${target})\` gives the length of every list as a table.`;
    case FILL: {
      // A list written out, as ce.draw's examples write theirs, rather than a `values` never shown.
      const spec = declaredLists(verb)[0];
      if (!spec) break;
      const { text, count } = sampleList(spec);
      const noun = spec.k === CELL && spec.grid ? 'row' : itemNoun(spec);
      return `\`${call}(${target}, "${spec.v}", ${text})\` writes ${noun}s 1 ${count === 2 ? 'and 2' : `to ${count}`}${spec.k === CELL && spec.grid ? ' of the grid' : ''}.`;
    }
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
    case READ: return [...familyNotes(verb), ...RETURNS_VALUE('value')];
    case SIZE: return [...familyNotes(verb), ...RETURNS_VALUE('number')];
    case FILL: return ['One undo step for the whole list, instead of one per element.', ...RETURNS_TRUE];
    case INSERT: case REMOVE: return own;
    case LINK: return [...own, ...RETURNS_SET, '`read(target, "' + verb.v + '")` gives the control\'s name.'];
    case LAYOUT: return [...own, ...RETURNS_SET, '`read(target, "layout")` gives the number of the layout showing.'];
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
  const indexLines = (what, plural) => `${cap(what)} number, counted from 1.\nA fraction: rounded.\nNot one of the ${plural}: rejected with a console error.`;
  switch (verb.k) {
    case NUM: case INT: return [`${words}.`, ...RANGE_LINES(verb, verb.k)].join('\n');
    case BOOL: return verb.toggle ? `Left out: toggles.\n${OFF_RULE}` : OFF_RULE;
    case ENUM: return `One of ${oneOfWords(verb.values)}. Case-insensitive.\nInvalid: rejected with a console error.`;
    case STR: return `${words}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case XY: {
      const size = verb.fit?.[name === verbArgs(verb)[0] ? verb.fx : verb.fy];
      const range = size ? [`Range: ${verb.min} ↔ ${FIT_WORDS[size]}.`, ...(verb.oneBased ? ['A fraction: rounded.'] : []), 'Outside the range: the nearest end.']
        : RANGE_LINES(verb, NUM).filter((l) => !l.startsWith('Invalid'));
      return [`${cap(AXIS_WORDS[name] ?? name)}${verb.oneBased ? ', counted from 1' : ''}.`, ...range,
        'Left out: unchanged.', 'Invalid: rejected with a console error.', 'Both left out: rejected with a console error.'].join('\n');
    }
    case LINE:
      if (name === 'row') return `Row, counted from 1.\nA fraction: rounded.\nNot a row the display has: rejected with a console error.`;
      if (name === 'at' && verb.clear) {
        return ['Row, counted from 1, of the layout showing.',
          'Or a table: {layout = 2, row = 4, col = 15}, each part optional.',
          '`layout`: its number, counted from 1, or its name. Left out: the layout showing.',
          '`row`, `col`: a number, or a range {5, 10}. Left out: every row, every column.',
          'A fraction: rounded.', 'A range past the display: to its last row or column.',
          'Left out: the whole layout showing.', 'Not on the display: rejected with a console error.'].join('\n');
      }
      if (name === 'at') {
        return ['Row, counted from 1, of the layout showing.',
          'Or a table: {layout = 2, row = 4, col = 15}, `layout` and `col` optional.',
          '`layout`: its number, counted from 1, or its name. Left out: the layout showing.',
          '`col`: written from that column on, the rest of the row kept.',
          '`col` as a range {5, 10}: written into those columns, padded with blanks or cut.',
          'A fraction: rounded.', 'A range past the display: to its last column.',
          'Not on the display: rejected with a console error.'].join('\n');
      }
      return 'The text.\nLonger than the display: cut at its width, with a console warning the first time.\nOn a display without layouts that scrolls: scrolled in instead.\nA character the display cannot draw: a blank cell, with a console warning the first time.\nA number: written as text.\nLeft out: rejected with a console error.';
    case ITEM:
      if (name === 'index') return indexLines(noun, `${noun}s`);
      return kind === NUM || kind === INT ? [`${cap(verb.item)}.`, ...RANGE_LINES(verb, kind)].join('\n')
        : kind === BOOL ? `Left out: toggles.\n${OFF_RULE}`
        : kind === ENUM ? `One of ${oneOfWords(verb.values)}. Case-insensitive.\nInvalid: rejected with a console error.`
        : `${cap(verb.item)}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case ELEM:
      if (name === 'name' && verb.list === 'zones') {
        return 'The zone\'s name, as given in the zone table. Case-insensitive.\nEvery zone with that name, on every layout.\nNot a zone of the display: rejected with a console error.';
      }
      if (name === 'name') return 'The element\'s name, as given in the inspector.\nNot an element of this display: rejected with a console error.';
      return kind === NUM || kind === INT ? [`${cap(verb.item)}.`, ...RANGE_LINES(verb, kind)].join('\n')
        : kind === BOOL ? `Left out: toggles.\n${OFF_RULE}`
        : kind === ENUM ? `One of ${oneOfWords(verb.values)}. Case-insensitive.\nInvalid: rejected with a console error.`
        : `${cap(verb.item)}.\nA number: written as text.\nLeft out: rejected with a console error.`;
    case CELL:
      if (name === 'row') return 'Row, counted from 1.\nA fraction: rounded.\nNot a row the grid has: rejected with a console error.';
      if (name === 'col') return 'Column, counted from 1.\nA fraction: rounded.\nNot a column the grid has: rejected with a console error.';
      if (name === 'index') return indexLines(noun, `${noun}s`);
      return [`${cap(name)}.`, ...RANGE_LINES(verb, NUM)].join('\n');
    case INDEXSET:
      if (name === 'index') return `${cap(noun)} number, counted from 1.\nA fraction: rounded.\nBelow 1, or invalid: rejected with a console error.`;
      return 'Left out: toggles.\n0, "", "false", "off" or "0": off. Case-insensitive.\nAny other value: on.';
    case LAYOUT:
      return ['Its number, counted from 1, or its name.', 'A name: case-insensitive.', 'A fraction: rounded.',
        `A display without layouts: 1, ${verb.flat}.`, 'Not a layout of the display: rejected with a console error.'].join('\n');
    case LINK: {
      // A source any control can be needs no kind in its refusal: "not a control on this panel"
      // only repeated "not on this panel".
      const what = verb.sourceKind === 'any' ? '' : `, or not ${SOURCE_KINDS[verb.sourceKind]?.label ?? 'a usable source'}`;
      return ['The driving control\'s name.', 'Left out, or "": unlinked.', ...(verb.linkRule ? [verb.linkRule] : []),
        `Not on this panel${what}: rejected with a console error.`].join('\n');
    }
    case READ:
      if (name === 'name') return 'A verb of this component, by name.\nLeft out: every setting, as a table.\nNot a verb that sets something: rejected with a console error.';
      return ['Element number of a list verb, counted from 1.', 'A fraction: rounded.',
        ...(verb.family === 'lcd' ? ['For "text": a row or a table, as `text()` takes it.'] : []),
        ...elementReadLines(verb),
        'Left out: the whole list.', 'Not one the list has: rejected with a console error.'].join('\n');
    case SIZE: return 'A list verb of this component, by name.\nLeft out: every list, as a table.\nNot a list verb: rejected with a console error.';
    case FILL:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb: rejected with a console error.';
      return 'A list, one value per element from the first.\nLonger than the list: rejected with a console error.\nNot a list: rejected with a console error.';
    case INSERT:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb, or a list that cannot grow: rejected with a console error.';
      return 'Position of the new element, counted from 1.\nA fraction: rounded.\nLeft out: after the last.\nNot one the list has: rejected with a console error.';
    case REMOVE:
      if (name === 'name') return 'A list verb of this component, by name.\nNot a list verb, or a list that cannot shrink: rejected with a console error.';
      return 'Element number, counted from 1.\nA fraction: rounded.\nLeft out: the last.\nNot one the list has: rejected with a console error.';
    default: return `${words}.`;
  }
}
