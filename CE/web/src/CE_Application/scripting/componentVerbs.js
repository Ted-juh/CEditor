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
import { envelopePreset } from '../utils/envelopeLayout.js';
import { SCALES as CHORD_SCALES } from '../utils/chordPadLayout.js';
import { applyConstraint } from '../utils/constraintLayout.js';
import { DIVISION_IDS, MIN_BPM, MAX_BPM, MIN_BARS as LOOP_MIN_BARS, MAX_BARS as LOOP_MAX_BARS, MAX_LOOP_BAR, MAX_COUNT_IN_BARS } from '../utils/transportLayout.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { SOURCE_KINDS } from '../utils/controlSources.js';
import {
  drumPadCount, resolveDrumPads, PAD_CORNERS, PAD_CORNER_LABELS, cornerField,
} from '../utils/drumPadLayout.js';
import { elementSites, elementAt, elementsPatch, elementsUpdate, elementNames, PIXEL_TEXT_KINDS } from '../utils/pixelElements.js';
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
// What a display's zone or element is linked to (lcd.zoneSource, pixel.source): a control by name, or
// one of the picker's other entries (lcdPositions.lcdZoneSourceFor).
const SOURCE_BY_NAME = ['The control\'s name. Case-insensitive.', '"": unlinked.',
  '"@active": the control last touched.', '"@active#value", "@active#switch" or "@active#choice": the last of that kind.',
  '"@edit": the display\'s editable field.', 'This display, or not on this panel: rejected with a console error.',
  'Left out: rejected with a console error.'].join('\n');
// Shared by the components that play notes (their reviews, after the arp's item 8 and 13).
const KEY_NOTE = ['The key\'s note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B.', 'Past 11 or below 0: round the octave; 12 is C.',
  'A fraction: rounded.', 'Invalid: rejected with a console error.'].join('\n');
const FOLLOW_PANEL_KEY = `true: the panel's key and scale, at once and at every change.\nfalse: its own.\nLeft out: toggles.\n${OFF_RULE}`;
const VELOCITY_LINES = ['MIDI velocity.', 'Range: 1 ↔ 127, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n');
const CHANNEL_LINES = ['MIDI channel.', 'Range: 1 ↔ 16, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n');
const ECHO_CHANNEL_LINES = ['Channel 1 ↔ 16, or 0: any channel.', 'Range: 0 ↔ 16, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n');
const NOTE_PAST_MIDI = 'A note past the MIDI range sounds at its end, 0 or 127.';
const CHORDS_ONLY = 'Only in "chords" mode.';
// The Transport while it follows another clock (transportLayout.transportIsFollowing).
const TRANSPORT_FOLLOWING = 'While `source()` is "external" or "host": not used.';
// An Envelope's points (envelopeLayout.js): how many, and where one may go, between its neighbours with
// the first at 0 and the last at 1, as envDragNode keeps a drag.
const envelopePointCount = (c) => (Array.isArray(c?.points) && c.points.length ? c.points.length : 4);
const envelopePointRange = (c, at) => curvePointRange(c?.points, at);
/** Where breakpoint `at` of a curve may go: between its neighbours, the first at 0 and the last at 1
 *  (the Envelope's points, and the Router's transfer curve, which envValueAt samples the same way). */
function curvePointRange(points, at) {
  const pts = Array.isArray(points) ? points : [];
  if (at <= 0) return { min: 0, max: 0 };
  if (at >= pts.length - 1) return { min: 1, max: 1 };
  const x = (i) => Math.min(1, Math.max(0, Number(pts[i]?.x) || 0));
  return { min: x(at - 1), max: x(at + 1) };
}
// Where a control goes when it is let go (returnToRest.js), as the Crossfader, the Ribbon and the
// Vector Joystick share it: four verbs with the same rules, worded for each control's own range.
function returnVerbs(section, words) {
  // The ranges are the inspector's field set's, or given where it has none (the Vector Joystick).
  const range = (field) => words.ranges?.[field] ?? FIELD(section, field);
  return [
    v('returnMode', 'returnMode', ENUM, { doc: 'Set where it goes when it is let go.', ex: ['"center"', `springs back to ${words.centre} when let go`],
      argDocs: { returnMode: [`"none": it stays where it is let go.`, `"center": back to ${words.centre}.`, `"min": back to ${words.min}.`,
        `"max": back to ${words.max}.`, '"rest": back to `returnValue()`.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
      notes: ['On letting go of a drag: a script\'s value stays.', 'Default: "none".'] }),
    v('returnValue', 'returnValue', NUM, { ...range('returnValue'), doc: `Set ${words.rest} it goes back to with \`returnMode()\` "rest".`, ex: ['0.25', 'goes back to a quarter of the way'],
      argDocs: { returnValue: `${words.restLines}\nRange: ${range('returnValue').min} ↔ ${range('returnValue').max}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
      notes: ['Only while `returnMode()` is "rest".'] }),
    v('returnTime', 'returnTime', NUM, { ...range('returnTime'), doc: 'Set how long it takes to go back when let go.', ex: ['500', 'takes half a second to go back'],
      argDocs: { returnTime: `Milliseconds for the whole way back.\n0: at once.\nRange: ${range('returnTime').min} ↔ ${range('returnTime').max}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
      notes: ['Only while `returnMode()` is not "none".'] }),
    v('returnCurve', 'returnCurve', ENUM, { doc: 'Set how it moves on the way back.', ex: ['"exp"', 'springs back fast, then settles'],
      argDocs: { returnCurve: '"linear": at one speed.\n"exp": fast, then settling, as a spring.\n"ease": slow, fast, slow.\nCase-insensitive.\nInvalid: rejected with a console error.' },
      notes: ['Only while `returnMode()` is not "none".'] }),
  ];
}
// What a corner of a Drum Pad does (the preview's drumStrike).
const PAD_CORNER_ACTIONS = ['"none": a plain hit.', '"roll": rolls while held, as `roll()` does.',
  '"flam": a grace note `flamMs()` before the hit, at `ghostVelocity()`.', '"choke": silences the pad\'s choke group, and plays nothing.',
  '"accent": at `velocity()`, wherever the pad is struck.', '"ghost": at `ghostVelocity()`.',
  'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n');
// Across a Note Ribbon (noteRibbonLayout.positionAcross): 0 at the bottom edge to 1 at the top, or
// a vertical strip's left edge to its right.
const RIBBON_ACROSS = (low) => `${low} at the bottom edge to 127 at the top; a vertical strip's left edge to its right.`;
// A Chord Pad an Arp takes its notes from sounds nothing itself (the preview's chordNoteOn).
const CHORDPAD_TO_ARP = 'While an Arp plays its chords (`arp.link()`), the pads sound nothing themselves.';
// A Meter (its review): a linked control drives the value and its range in the preview
// (PanelPreviewSurface.applyMeterValueSource), and the readout's settings.
const METER_SOURCE_WINS = 'While `source()` links a control, that control sets the value and its range.';
const METER_READOUT = 'The readout shows while `showValue()` is on.';
// A Pixel Display element's position and size (item 2 of the owner's review of the pixel).
const PIXEL_RANGE = (min) => `Range: ${min} ↔ 4096, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.`;
const PIXEL_OFF_SCREEN = 'Off the screen, wholly or in part: that part is not drawn. The grid is set in the inspector, under Grid: 128 × 64 by default.';
const PIXEL_NO_GLYPH = 'A character the font cannot draw: a blank.';
const PIXEL_TEXT_KINDS_NOTE = `The text kinds: ${PIXEL_TEXT_KINDS.slice(0, -1).map((k) => `"${k}"`).join(', ')} and "${PIXEL_TEXT_KINDS.at(-1)}".`;
// The Arpeggiator's own chord (item 8 of the owner's review of the arp): what its key, scale, degree,
// chord type and octave set, and only while it plays that chord.
const OWN_CHORD = 'Its own chord only.';
const OWN_CHORD_ONLY = 'Its own chord only: with `source()` "link" or "input" the notes come from there.';
const FOLLOWER_REPLACED = 'Following the panel\'s key: replaced at its next change.';
/** The transport's note values, as an enum's text lists them: "1/1", "1/2", … or "1/16T". */
const DIVISION_WORDS = (() => {
  const quoted = DIVISION_IDS.map((id) => `"${id}"`);
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
})();
/** The Arpeggiator's rhythm length, as arpLayout.euclid reads it within the verb's own 1 to 32. */
const euclidStepCount = (c) => {
  const n = Math.round(Number(c?.euclidSteps ?? 8));
  return Number.isFinite(n) ? Math.min(32, Math.max(1, n)) : 8;
};
/** A rotation round the rhythm's steps: -1 is the last, a whole turn is none. null when not a number. */
const euclidRotation = (value, c) => {
  const n = Number(value);
  if (typeof value === 'boolean' || !Number.isFinite(n)) return null;
  const steps = euclidStepCount(c);
  return ((Math.round(n) % steps) + steps) % steps;
};
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
    // Item 15 of the owner's review: "Arp" in the examples, the component's name in the type list,
    // and read's texts for what this family reads: no lists, a seek's phase, and the mutes by step.
    id: 'arp', section: 'Arp', prefix: 'arp', label: 'Arpeggiator', sample: 'Arp',
    summary: 'Play notes one at a time from its own chord, a Chord Pad or the MIDI input: their order, speed, length, swing and rhythm.',
    readIndex: ['For "mute": a step number, counted from 1; true if that step is muted.', 'A fraction: rounded.',
      'Below 1, or invalid: rejected with a console error.'],
    readNotes: ['`read(target, "phase")`: where it is now.',
      '`read(target, "mute")`: the muted steps; `read(target, "mute", 3)`: whether step 3 is.'],
    verbs: [
      // Item 11: run, sync and division, texts only.
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the arp.', ex: ['false', 'stops it'],
        argDocs: { run: `true: plays.\nfalse: stops.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Free-running: it starts again where it stopped.', 'Synced: it plays only while the Transport runs.', 'Default: true.'] }),
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
      v('division', 'division', ENUM, { doc: 'Set how long each step is while synced.', ex: ['"1/8T"', 'plays eighth-note triplets'],
        argDocs: { division: ['A note value, "1/1" a whole note to "1/32".', '"D" after it: dotted, half as long again.',
          '"T" after it: a triplet, two-thirds as long.', `One of ${DIVISION_WORDS}. Case-insensitive.`, 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['While synced only: free-running, `rate()` sets the step.', 'Default: "1/16".'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Follow the Transport\'s tempo, or run at its own rate.',
        ex: ['true', 'steps in time with the Transport, one step per `division()`'],
        argDocs: { sync: `true: one step per \`division()\` at the Transport's tempo, in step with its position.\nfalse: \`rate()\` steps a second.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Synced: silent while the Transport is stopped.',
          'Synced: `rate()` and `phase()` have no effect, and the Transport\'s swing plays unless `swingSource()` is "own".', 'Default: false.'] }),
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
      // Item 13: every note at the arp's own velocity, on its own channel.
      v('velocity', 'velocity', INT, { ...VELOCITY, doc: 'Set how hard every note it plays is struck.',
        ex: ['110', 'plays every note at velocity 110'],
        argDocs: { velocity: ['MIDI velocity.', 'Range: 1 ↔ 127, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.',
          'Invalid: rejected with a console error.'].join('\n') },
        notes: ['The same for every note: the velocity the notes were held at is not used.', 'Default: 96.'] }),
      v('channel', 'channel', INT, { ...CHANNEL, doc: 'Set which MIDI channel it plays on.',
        ex: ['10', 'plays its notes on channel 10'],
        argDocs: { channel: ['MIDI channel.', 'Range: 1 ↔ 16, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.',
          'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: 1.'] }),
      // Item 12, the Euclidean rhythm (arpLayout.euclid). Pulses run to the rhythm's own steps, as the
      // inspector's do: 20 on 8 steps was stored and played every step. Rotate goes round the steps,
      // as the engine already did: it took -32 to 32 and stopped there.
      v('euclid', 'euclidEnabled', BOOL, { toggle: true, doc: 'Switch the Euclidean rhythm on or off.',
        ex: ['true', 'plays only the steps the rhythm hits'],
        argDocs: { euclid: `true: the rhythm decides which steps sound.\nfalse: every step sounds.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['The rhythm: `euclidPulses()` hits spread evenly over `euclidSteps()` steps, turned by `euclidRotate()`.',
          'It runs against the notes: an 8-step rhythm over a 3-note chord lands on different notes each time round.',
          'Hand mutes stay silent either way.', 'Default: false.'] }),
      v('euclidSteps', 'euclidSteps', INT, { min: 1, max: 32, doc: 'Set how many steps the rhythm is long.',
        ex: ['8', 'makes an 8-step rhythm'],
        argDocs: { euclidSteps: ['Steps in the rhythm.', 'Range: 1 ↔ 32, whole.', 'A fraction: rounded.', 'Outside the range: the nearest end.',
          'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: 8.'] }),
      v('euclidPulses', 'euclidPulses', INT, { min: 0, max: 32, rangeFrom: (c) => ({ max: euclidStepCount(c) }),
        doc: 'Set how many of the rhythm\'s steps sound.', ex: ['3', 'sounds 3 steps, spread as evenly as they go'],
        argDocs: { euclidPulses: ['Hits, spread as evenly as they go.', '0: none sound.', 'Range: 0 ↔ `euclidSteps()`, whole.', 'A fraction: rounded.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Steps lowered below it later: every step sounds.', 'Default: 5.'] }),
      v('euclidRotate', 'euclidRotate', INT, { readValue: (value, c) => euclidRotation(value, c),
        doc: 'Turn the rhythm by a number of steps.', ex: ['1', 'moves every hit a step earlier'],
        argDocs: { euclidRotate: ['Steps to turn it: each hit that many steps earlier.', 'Past the steps, or below 0: round them; -1 is the last.',
          'A fraction: rounded.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: 0.'] }),
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
      // Item 10: where the notes come from, the Chord Pad, and the MIDI input's channel.
      v('inputChannel', 'inputChannel', INT, { min: 0, max: 16, doc: 'Set which MIDI channel it takes notes from.',
        ex: ['2', 'plays only the notes held on channel 2'],
        argDocs: { inputChannel: ['Channel 1 ↔ 16, or 0: any channel.', 'Range: 0 ↔ 16, whole.', 'A fraction: rounded.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Only while `source()` is "input".', 'Default: 0, any channel.'] }),
      v('baseOctave', 'baseOctave', INT, { min: -1, max: 8, doc: 'Set the octave its chord starts in.',
        ex: ['4', 'puts the chord\'s root in octave 4, as in C4, middle C'],
        argDocs: { baseOctave: ['The root\'s octave, as in C3. Middle C is C4.', 'Range: -1 ↔ 8, whole.', 'A fraction: rounded.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [OWN_CHORD, 'A note above 127 is left out.', 'Default: 3.'] }),
      v('source', 'source', ENUM, { doc: 'Set where the notes come from.', ex: ['"input"', 'plays the notes held on the MIDI input'],
        argDocs: { source: ['"chord": its own chord, from `key()`, `scale()` and `degree()`.', '"link": the notes held on the Chord Pad set by `link()`.',
          '"input": the notes held on the MIDI input, on `inputChannel()`.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Default: "chord".'] }),
      // The Chord Pad the arp takes its notes from, while `source` is "link". Kept apart from
      // `source` at the owner's word: link() does not switch the source.
      v('link', 'linkId', LINK, { sourceKind: 'chordPad', doc: 'Set the Chord Pad it plays from.',
        ex: ['"Pads"', 'plays the chords held on the Chord Pad called Pads'],
        argDocs: { name: ['The Chord Pad\'s name. Case-insensitive.', 'Left out, or "": none.',
          'Not on this panel, or not a Chord Pad: rejected with a console error.'].join('\n') },
        notes: ['Played only while `source()` is "link".', 'The Chord Pad stays silent while the arp plays from it.', 'Default: none.'] }),
      // Item 14: declared rather than derived (derivedFlagVerbs), for what each is; at the end, where
      // the derived ones came.
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let a click on a step mute it, or not.', ex: ['false', 'stops clicks muting steps'],
        argDocs: { editable: `true: a click on a step mutes or unmutes it.\nfalse: clicks do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Only clicks are locked: `mute()` still works.', 'Default: true.'] }),
      v('showNotes', 'showNotes', BOOL, { toggle: true, doc: 'Show or hide the note names in the steps.', ex: ['false', 'hides the note names'],
        argDocs: { showNotes: `true: each step shows its note, "C3", or a chord's count, "3♪".\nfalse: hidden.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['A step narrower than 22 or shorter than 26 pixels shows no name either way.', 'Default: true.'] }),
      v('showHeader', 'showHeader', BOOL, { toggle: true, doc: 'Show or hide the strip above the steps.',
        ex: ['false', 'hides the strip, and the steps take its room'],
        argDocs: { showHeader: `true: the strip shows the pattern, where the notes come from and the rate.\nfalse: hidden; the steps take its room.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.chordpad"): what chordPadLayout.js builds and the preview plays for each.
    id: 'chordpad', section: 'ChordPad', prefix: 'chordPad', label: 'Chord Pad',
    summary: 'Play a chord, or a note of the scale, from each pad: the key and scale they are built from, their voicing, and what they send.',
    verbs: [
      v('mode', 'mode', ENUM, { doc: 'Set what a pad plays: a chord, or one note of the scale.', ex: ['"notes"', 'gives each pad one note of the scale'],
        argDocs: { mode: '"chords": one chord per step of the scale.\n"notes": one note of the scale per pad, over `noteSpan()` octaves.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['With `layout()` "wheel": chords either way.', 'Default: "chords".'] }),
      // As the arp's key (its item 8): a note's name, or a number round the octave.
      v('key', 'key', INT, { min: 0, max: 11, readValue: pitchClassOf, argKind: 'pitchClass',
        valueRefusal: (value) => `${shownValue(value)} is not a note: a name such as "C", "F#" or "Eb", or 0 to 11.`,
        doc: 'Set the key the pads are built in.', ex: ['"F#"', 'builds the pads in F♯'],
        argDocs: { key: KEY_NOTE },
        notes: [FOLLOWER_REPLACED, 'Default: 0 (C).'] }),
      v('scale', 'scale', ENUM, { doc: 'Set the scale the pads are built from.', ex: ['"dorian"', 'builds the pads from the Dorian scale'],
        notes: [FOLLOWER_REPLACED, 'Default: "major".'] }),
      v('followPanelKey', 'followPanelKey', BOOL, { toggle: true, doc: 'Follow the panel\'s key and scale, or keep its own.',
        ex: ['true', 'takes the panel\'s key and scale, and changes with them'],
        argDocs: { followPanelKey: FOLLOW_PANEL_KEY },
        notes: ['Default: false.'] }),
      v('chordType', 'chordType', ENUM, { doc: 'Set how many notes each chord has.', ex: ['"seventh"', 'adds the seventh: four notes'],
        argDocs: { chordType: ['"triad": three notes.', '"seventh": four, the seventh added.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: [CHORDS_ONLY, 'Default: "triad".'] }),
      v('voicing', 'voicing', ENUM, { doc: 'Set how each chord\'s notes are spread.', ex: ['"drop2"', 'drops each chord\'s second note from the top an octave'],
        argDocs: { voicing: '"close": stacked as built.\n"spread": every second note an octave up.\n"drop2": the second note from the top an octave down.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: [CHORDS_ONLY, 'Applied after `inversion()`.', 'Default: "close".'] }),
      v('inversion', 'inversion', INT, { ...FIELD('ChordPad', 'inversion'), doc: 'Set how many of each chord\'s lowest notes move up an octave.', ex: ['1', 'plays each chord in first inversion'],
        argDocs: { inversion: 'Inversions: each moves the lowest note up an octave.\n0: root position.\nRange: 0 ↔ 3, whole; a triad stops at 2.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: [CHORDS_ONLY, 'Default: 0.'] }),
      v('octave', 'octave', INT, { ...FIELD('ChordPad', 'octave'), doc: 'Transpose every pad by whole octaves.', ex: ['-1', 'plays every pad an octave lower'],
        argDocs: { octave: 'Octaves, up or down from `baseOctave()`.\nRange: -3 ↔ 3, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['With `baseOctave()`, stops at octaves -1 and 8.', NOTE_PAST_MIDI, 'Default: 0.'] }),
      v('velocity', 'velocity', INT, { ...FIELD('ChordPad', 'velocity'), doc: 'Set how hard every note is struck.', ex: ['110', 'plays every note at velocity 110'],
        argDocs: { velocity: VELOCITY_LINES },
        notes: [CHORDPAD_TO_ARP, 'Default: 96.'] }),
      v('channel', 'channel', INT, { ...FIELD('ChordPad', 'channel'), doc: 'Set which MIDI channel the pads play on.', ex: ['10', 'plays the pads on channel 10'],
        argDocs: { channel: CHANNEL_LINES },
        notes: [CHORDPAD_TO_ARP, 'Default: 1.'] }),
      // Between one note and the next, from the lowest (the preview's chordNoteOn): the old text said
      // the chord was spread over this many milliseconds, which is a chord's length less one gap.
      v('strum', 'strumMs', NUM, { ...FIELD('ChordPad', 'strumMs'), doc: 'Set the time between a chord\'s notes, lowest first.', ex: ['30', 'plays each chord\'s notes 30 ms apart, from the lowest'],
        argDocs: { strum: 'Milliseconds from one note to the next.\n0: all at once.\nRange: 0 ↔ 2000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The inspector stops at 200.', 'Default: 0.'] }),
      v('latch', 'latch', BOOL, { toggle: true, doc: 'Keep a pad sounding after it is let go, until it is tapped again.',
        argDocs: { latch: `true: a tap starts a pad, the next tap stops it.\nfalse: a pad sounds while it is held.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('layout', 'layout', ENUM, { doc: 'Set how the pads are laid out: a circle of fifths, or a grid.', ex: ['"grid"', 'lays the pads out in rows'],
        argDocs: { layout: '"wheel": the circle of fifths, each major chord with its relative minor inside; the chords in the key lit.\n"grid": one pad per chord or note of the key, `gridCols()` to a row.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "wheel".'] }),
      v('baseOctave', 'baseOctave', INT, { min: -1, max: 8, doc: 'Set the octave the key\'s root is in.', ex: ['3', 'puts the key\'s root in octave 3, as in C3'],
        argDocs: { baseOctave: 'The root\'s octave, as in C4: middle C.\nRange: -1 ↔ 8, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['`octave()` moves the pads from here.', 'Default: 4.'] }),
      v('noteSpan', 'noteSpan', INT, { ...FIELD('ChordPad', 'noteSpan'), doc: 'Set how many octaves of the scale the pads cover.', ex: ['3', 'lays out three octaves of the scale'],
        argDocs: { noteSpan: 'Octaves.\nRange: 1 ↔ 3, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only in "notes" mode.', 'Default: 2.'] }),
      v('gridCols', 'gridCols', INT, { ...FIELD('ChordPad', 'gridCols'), doc: 'Set how many pads a row of the grid has.', ex: ['7', 'puts seven pads in a row'],
        argDocs: { gridCols: 'Pads to a row.\nRange: 1 ↔ 12, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `layout()` is "grid".', 'The inspector stops at 8.', 'Default: 4.'] }),
      v('echo', 'echo', BOOL, { toggle: true, doc: 'Light the pads from the notes held on the MIDI input, as well as from taps.',
        argDocs: { echo: `true: a pad is ringed while its notes are held on the input.\nfalse: only taps light it.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('echoChannel', 'echoChannel', INT, { ...FIELD('ChordPad', 'echoChannel'), doc: 'Set which MIDI channel the echo listens to.', ex: ['2', 'lights the pads from channel 2 only'],
        argDocs: { echoChannel: ECHO_CHANNEL_LINES },
        notes: ['Only while `echo()` is on.', 'Default: 0, any channel.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the pads be played by touch, or not.',
        argDocs: { editable: `true: a tap plays a pad.\nfalse: taps do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showPiano', 'showPiano', BOOL, { toggle: true, doc: 'Show or hide the keyboard strip of the notes sounding.', notes: ['Default: shown.'] }),
      v('showRomans', 'showRomans', BOOL, { toggle: true, doc: 'Show or hide the roman numerals on the pads, such as "I", "ii" and "♭VII".', notes: ['Default: shown.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.noteribbon"): what noteRibbonLayout.js and the preview do with each.
    id: 'noteribbon', section: 'NoteRibbon', prefix: 'noteRibbon', label: 'Note Ribbon',
    summary: 'Play notes, or glide between them, along a strip: its key and range, how it is touched, and what it sends.',
    verbs: [
      v('mode', 'mode', ENUM, { doc: 'Set how the strip plays: the notes of the scale, every semitone, or a gliding pitch.', ex: ['"glide"', 'bends the pitch as the finger moves'],
        argDocs: { mode: '"snap": the notes of the scale only, one zone each.\n"chromatic": every semitone, one zone each.\n"glide": the pitch follows the finger, by pitch bend; past `bendRange()` the note starts again from a new one.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "snap".'] }),
      v('key', 'key', INT, { min: 0, max: 11, readValue: pitchClassOf, argKind: 'pitchClass',
        valueRefusal: (value) => `${shownValue(value)} is not a note: a name such as "C", "F#" or "Eb", or 0 to 11.`,
        doc: 'Set the key whose scale is in key on the strip.', ex: ['"F#"', 'puts the strip in F♯'],
        argDocs: { key: KEY_NOTE },
        notes: ['The notes in key: the zones of "snap", the marked ones otherwise.', FOLLOWER_REPLACED, 'Default: 0 (C).'] }),
      v('scale', 'scale', ENUM, { doc: 'Set the scale whose notes are in key.', ex: ['"dorian"', 'puts the Dorian scale\'s notes in key'],
        notes: [FOLLOWER_REPLACED, 'Default: "major".'] }),
      v('followPanelKey', 'followPanelKey', BOOL, { toggle: true, doc: 'Follow the panel\'s key and scale, or keep its own.',
        ex: ['true', 'takes the panel\'s key and scale, and changes with them'],
        argDocs: { followPanelKey: FOLLOW_PANEL_KEY },
        notes: ['Default: false.'] }),
      v('baseNote', 'baseNote', INT, { ...FIELD('NoteRibbon', 'baseNote'), doc: 'Set the note at the low end of the strip.', ex: ['60', 'starts the strip at middle C'],
        argDocs: { baseNote: 'MIDI note: 60 is middle C.\nRange: 0 ↔ 127, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 48 (C3).'] }),
      v('octaves', 'octaves', INT, { ...FIELD('NoteRibbon', 'octaves'), doc: 'Set how many octaves the strip covers, up from `baseNote()`.', ex: ['3', 'spreads three octaves along the strip'],
        argDocs: { octaves: 'Octaves.\nRange: 1 ↔ 5, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The strip stops at note 127.', 'Default: 2.'] }),
      // Whole semitones, as the engine (ribbonBendRange) and the inspector read it: a fraction was
      // stored and played rounded.
      v('bendRange', 'bendRange', INT, { ...FIELD('NoteRibbon', 'bendRange'), doc: 'Set the synth\'s pitch-bend range, which "glide" bends within.', ex: ['12', 'bends up to an octave either way before a new note'],
        argDocs: { bendRange: 'Semitones: the synth\'s own bend range. Set to match it, or the glide is the wrong distance.\nRange: 1 ↔ 48, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only in "glide" mode.', 'Default: 2.'] }),
      v('velocity', 'velocity', INT, { ...FIELD('NoteRibbon', 'velocity'), doc: 'Set how hard every note is struck.', ex: ['110', 'plays every note at velocity 110'],
        argDocs: { velocity: VELOCITY_LINES },
        notes: ['While `velocityFrom()` is "position": not used.', 'Default: 96.'] }),
      v('channel', 'channel', INT, { ...FIELD('NoteRibbon', 'channel'), doc: 'Set which MIDI channel the notes, the bend and the CC go out on.', ex: ['2', 'plays on channel 2'],
        argDocs: { channel: CHANNEL_LINES },
        notes: ['Default: 1.'] }),
      v('latch', 'latch', BOOL, { toggle: true, doc: 'Keep the note sounding after the finger lifts, until the strip is touched again.',
        argDocs: { latch: `true: it keeps sounding; the next touch silences it.\nfalse: it stops when the finger lifts.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('orientation', 'orientation', ENUM, { doc: 'Set which way the strip runs.', ex: ['"vertical"', 'runs the strip from low at the bottom to high at the top'],
        argDocs: { orientation: '"horizontal": low at the left.\n"vertical": low at the bottom.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "horizontal".'] }),
      v('velocityFrom', 'velocityFrom', ENUM, { doc: 'Set where each note\'s velocity comes from: fixed, or where across the strip it is touched.', ex: ['"position"', 'plays harder the nearer the top edge it is touched'],
        argDocs: { velocityFrom: `"fixed": \`velocity()\`.\n"position": ${RIBBON_ACROSS(8)}\nCase-insensitive.\nInvalid: rejected with a console error.` },
        notes: ['Default: "fixed".'] }),
      v('modAxis', 'modAxis', ENUM, { doc: 'Set what a touch across the strip sends: nothing, or a CC.', ex: ['"cc"', 'sends `modCc()` from where across the strip it is touched'],
        argDocs: { modAxis: `"none": nothing.\n"cc": \`modCc()\`, ${RIBBON_ACROSS(0)}\nCase-insensitive.\nInvalid: rejected with a console error.` },
        notes: ['Default: "none".'] }),
      v('modCc', 'modCc', INT, { ...FIELD('NoteRibbon', 'modCc'), doc: 'Set which CC a touch across the strip sends.', ex: ['74', 'sends CC 74, often a synth\'s filter'],
        argDocs: { modCc: 'Controller number: 1 is the mod wheel.\nRange: 0 ↔ 127, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `modAxis()` is "cc".', 'Default: 1.'] }),
      v('echo', 'echo', BOOL, { toggle: true, doc: 'Outline the zones of the notes held on the MIDI input.',
        argDocs: { echo: `true: a zone is outlined while its note is held on the input.\nfalse: not.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('echoChannel', 'echoChannel', INT, { ...FIELD('NoteRibbon', 'echoChannel'), doc: 'Set which MIDI channel the echo listens to.', ex: ['2', 'outlines the notes held on channel 2 only'],
        argDocs: { echoChannel: ECHO_CHANNEL_LINES },
        notes: ['Only while `echo()` is on.', 'Default: 0, any channel.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the strip be played by touch, or not.',
        argDocs: { editable: `true: a touch plays it.\nfalse: touches do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showNames', 'showNames', BOOL, { toggle: true, doc: 'Show or hide the note names on the zones.',
        notes: ['A zone too narrow for its name shows none either way.', 'Default: shown.'] }),
      v('showHeader', 'showHeader', BOOL, { toggle: true, doc: 'Show or hide the strip above the zones: the key, the mode and the note playing.',
        notes: ['Default: shown.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.drumpads"): what drumPadLayout.js resolves and the preview's drumStrike plays.
    id: 'drumpads', section: 'DrumPads', prefix: 'drumPads', label: 'Drum Pads',
    summary: 'Play a fixed note from each pad of a grid: the notes and their names, how a hit is struck, rolls, and what the corners of a pad do.',
    verbs: [
      // Every map runs pad 1 = baseNote up a semitone a pad (resolveDrumPads); they differ in the names
      // and the choke groups a pad starts with.
      v('map', 'map', ENUM, { doc: 'Set how the pads are named, and whether the hi-hats choke each other.', ex: ['"chromatic"', 'names the pads by pitch'],
        argDocs: { map: '"gm": General MIDI drum names; the closed, pedal and open hi-hats choke each other.\n"chromatic": named by pitch.\n"custom": named as "gm", no choke groups.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['In every map pad 1 plays `baseNote()` and each pad after it a semitone higher; `note()`, `label()` and `choke()` change one pad.', 'Default: "gm".'] }),
      v('baseNote', 'baseNote', INT, { ...NOTE, doc: 'Set the note pad 1 plays; each pad after it plays a semitone higher.', ex: ['36', 'starts the pads at 36, the GM bass drum'],
        argDocs: { baseNote: 'MIDI note: 36 is the GM bass drum.\nRange: 0 ↔ 127, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A pad past 127 plays 127.', 'Default: 36.'] }),
      v('mode', 'mode', ENUM, { doc: 'Set how long a hit sounds.', ex: ['"toggle"', 'keeps a pad sounding until it is hit again'],
        argDocs: { mode: '"momentary": while the pad is held.\n"oneShot": for `gate()` milliseconds.\n"toggle": until the pad is hit again.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "momentary".'] }),
      // The engine's and the inspector's 5 to 2000 (drumGateMs): 1 was drawn as 5 and 5000 as 2000.
      v('gate', 'gateMs', INT, { min: 5, max: 2000, doc: 'Set how long a one-shot hit sounds.', ex: ['200', 'holds each one-shot note for 200 ms'],
        argDocs: { gate: 'Milliseconds from the note-on to the note-off.\nRange: 5 ↔ 2000, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `mode()` is "oneShot".', 'Default: 60.'] }),
      v('velocity', 'velocity', INT, { ...VELOCITY, doc: 'Set how hard a hit is struck.', ex: ['110', 'strikes every pad at velocity 110'],
        argDocs: { velocity: VELOCITY_LINES },
        notes: ['With `velocityFrom()` "position": not used; with "centre": a hit in the middle of a pad.', 'Default: 100.'] }),
      v('channel', 'channel', INT, { ...CHANNEL, doc: 'Set which MIDI channel the pads play on.', ex: ['10', 'plays the pads on channel 10, the GM drum channel'],
        argDocs: { channel: CHANNEL_LINES },
        notes: ['Default: 10.'] }),
      v('rows', 'rows', INT, { min: 1, max: 8, doc: 'Set how many rows of pads the grid has.', ex: ['2', 'makes the grid two rows high'],
        argDocs: { rows: 'Rows.\nRange: 1 ↔ 8, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Pads beyond the grid keep what `note()` and the others set for them.', 'Default: 4.'] }),
      v('cols', 'cols', INT, { min: 1, max: 8, doc: 'Set how many pads a row has.', ex: ['8', 'puts eight pads in a row'],
        argDocs: { cols: 'Pads to a row.\nRange: 1 ↔ 8, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 4.'] }),
      v('origin', 'origin', ENUM, { doc: 'Set which corner of the grid pad 1 sits in.', ex: ['"topLeft"', 'numbers the pads in reading order'],
        argDocs: { origin: '"bottomLeft": as hardware grids, row 1 at the bottom.\n"topLeft": in reading order.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "bottomLeft".'] }),
      v('velocityFrom', 'velocityFrom', ENUM, { doc: 'Set where a hit\'s velocity comes from.', ex: ['"centre"', 'strikes hardest in the middle of a pad'],
        argDocs: { velocityFrom: '"fixed": `velocity()`.\n"position": how high up the pad it lands, 10 at the bottom to 127 at the top.\n"centre": `velocity()` in the middle, down to 28% of it at the edges.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "fixed".'] }),
      v('echo', 'echo', BOOL, { toggle: true, doc: 'Outline the pads of the notes held on the MIDI input.',
        argDocs: { echo: `true: a pad is outlined while its note is held on the input.\nfalse: not.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('echoChannel', 'echoChannel', INT, { min: 0, max: 16, doc: 'Set which MIDI channel the echo listens to.', ex: ['10', 'outlines the notes held on channel 10 only'],
        argDocs: { echoChannel: ECHO_CHANNEL_LINES },
        notes: ['Only while `echo()` is on.', 'Default: 0, any channel.'] }),
      // The per-pad overrides. `pads` is index-aligned with the grid and SPARSE — anything omitted
      // falls back to the generated map — so these carry `count` (how many pads there are, whatever
      // the stored array's length) and `resolve` (what a pad actually plays, read through the
      // component's own resolver rather than reported as a hole).
      v('note', 'pads', ITEM, { item: 'note', kind: INT, ...NOTE, ...PADS, doc: 'Set the note one pad plays, by its number.', ex: ['3, 38', 'makes pad 3 play 38, the GM snare'],
        argDocs: { note: 'MIDI note.\nRange: 0 ↔ 127, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['`read(target, "note", 3)` gives the note pad 3 plays, from the map when none is set.'] }),
      v('label', 'pads', ITEM, { item: 'label', kind: STR, ...PADS, doc: 'Set the name one pad shows, by its number.', ex: ['3, "SNARE"', 'names pad 3 SNARE'],
        argDocs: { label: 'The name.\n"": the name the map gives it.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('choke', 'pads', ITEM, { item: 'choke', kind: INT, min: 0, max: 8, ...PADS, doc: 'Put one pad in a choke group, by its number.', ex: ['3, 1', 'puts pad 3 in choke group 1'],
        argDocs: { choke: 'Choke group: a hit silences the other pads in the same group.\n0: none.\nRange: 0 ↔ 8, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['With `map()` "gm", the hi-hats start in group 1.'] }),
      // A colour is read as set() reads one, by the shared component writer (panelRuntime's
      // writeComponentFields), because `pads.*.colour` is a colour field (scriptColours.LIST_ITEMS).
      v('colour', 'pads', ITEM, { item: 'colour', kind: STR, ...PADS, doc: 'Set the colour of one pad, by its number.', ex: ['3, "red"', 'colours pad 3 red'],
        argDocs: { colour: 'A colour, as `set()` takes one: a name, or "RRGGBB" or "AARRGGBB", with or without "#".\n"": the grid\'s accent.\nNot a colour: rejected with a console error.\nLeft out: rejected with a console error.' } }),
      // ROLL — a pad restrikes for as long as it is on. Per-pad, because a kick that buzzed every
      // time you leant on it would be unplayable.
      v('roll', 'pads', ITEM, { item: 'roll', kind: BOOL, ...PADS, doc: 'Make one pad roll, by its number: it strikes again and again while it is on.', ex: ['2, true', 'makes pad 2 roll'],
        argDocs: { roll: `true: it rolls while held, or while toggled on.\nfalse: one strike.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Not in "oneShot" mode: the pad stops at its gate.'] }),
      v('rollRate', 'rollRate', ENUM, { doc: 'Set how fast a rolling pad strikes, as a note value against the Transport.', ex: ['"1/32"', 'rolls in 32nd notes'],
        notes: ['While `rollSync()` is on and the Transport has a tempo; otherwise `rollHz()`.', 'Default: "1/16".'] }),
      v('rollSync', 'rollSync', BOOL, { toggle: true, doc: 'Roll in time with the Transport, or at a fixed speed.',
        argDocs: { rollSync: `true: at \`rollRate()\` against the Transport's tempo.\nfalse: at \`rollHz()\`.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['With no tempo to follow: `rollHz()` either way.', 'Default: true.'] }),
      v('rollHz', 'rollHz', NUM, { min: 0.5, max: 50, doc: 'Set how fast a rolling pad strikes while it is not synced.', ex: ['12', 'rolls at 12 strikes a second'],
        argDocs: { rollHz: 'Strikes per second.\nRange: 0.5 ↔ 50.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 8.'] }),
      v('rollDelay', 'rollDelay', INT, { min: 0, max: 4000, doc: 'Set how long a pad is held before its roll begins.', ex: ['250', 'starts the roll after a quarter of a second'],
        argDocs: { rollDelay: 'Milliseconds.\n0: it rolls from the first strike.\nRange: 0 ↔ 4000, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.'] }),
      v('rollVelocity', 'rollVelocity', NUM, { ...UNIT, doc: 'Set how hard a roll strikes after the first hit.', ex: ['0.5', 'strikes the repeats at half the first hit\'s velocity'],
        argDocs: { rollVelocity: 'Part of the first hit\'s velocity.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.75.'] }),
      // CORNER ZONES — a second vocabulary under the same pads. Grid-level: a corner is a gesture
      // the hand learns once.
      v('zones', 'zones', BOOL, { toggle: true, doc: 'Let the corners of every pad do their own actions.',
        argDocs: { zones: `true: a hit in a corner does what its corner command says.\nfalse: every hit is a plain hit.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('cornerSize', 'cornerSize', NUM, { min: 0.05, max: 0.45, doc: 'Set how much of a pad each corner covers.', ex: ['0.2', 'makes each corner a fifth of the pad each way'],
        argDocs: { cornerSize: 'Part of the pad\'s width and of its height, in from the corner.\nRange: 0.05 ↔ 0.45: the middle is always a plain hit.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.28.'] }),
      ...PAD_CORNERS.map((corner) => v(cornerField(corner), cornerField(corner), ENUM, {
        doc: `Set what a hit in the ${PAD_CORNER_LABELS[corner].toLowerCase()} corner of a pad does.`,
        ex: ['"flam"', `plays a flam from the ${PAD_CORNER_LABELS[corner].toLowerCase()} corner`],
        argDocs: { [cornerField(corner)]: PAD_CORNER_ACTIONS },
        notes: ['Only while `zones()` is on.', 'Default: "none".'] })),
      v('flamMs', 'flamMs', INT, { min: 1, max: 500, doc: 'Set how long before the main hit a flam\'s grace note lands.', ex: ['30', 'lands the grace note 30 ms early'],
        argDocs: { flamMs: 'Milliseconds.\nRange: 1 ↔ 500, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 22.'] }),
      v('ghostVelocity', 'ghostVelocity', NUM, { ...UNIT, doc: 'Set how hard a ghost hit, and a flam\'s grace note, is struck.', ex: ['0.2', 'strikes ghost notes at a fifth of the velocity'],
        argDocs: { ghostVelocity: 'Part of the velocity the hit would have had.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.35.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the pads be struck by touch, or not.',
        argDocs: { editable: `true: a hit plays a pad; a drag across the grid rolls through them.\nfalse: hits do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showNotes', 'showNotes', BOOL, { toggle: true, doc: 'Show or hide the MIDI note number on each pad.', notes: ['Default: shown.'] }),
      v('showLabels', 'showLabels', BOOL, { toggle: true, doc: 'Show or hide the name on each pad.',
        notes: ['A pad too small for its name shows none either way.', 'Default: shown.'] }),
      v('showHeader', 'showHeader', BOOL, { toggle: true, doc: 'Show or hide the strip above the pads: the map, the grid and the last hit.', notes: ['Default: shown.'] }),
    ],
  },

  /* ------------------------------------------------------------------- moving sources */
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.turing"): what turingLayout.js and the preview's ticker do with each.
    id: 'turing', section: 'Turing', prefix: 'turing', label: 'Turing Machine', sample: 'Turing',
    summary: 'Run a loop of stepped values that can change as it comes round: its speed, length, randomness, output levels and gate, and each step.',
    readNotes: ['`read(target, "phase")`: where it is now.', '`read(target, "step")`: every step; `read(target, "step", 3)`: one.'],
    verbs: [
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the sequence.', ex: ['false', 'stops it on the step it is at'],
        argDocs: { run: `true: it advances.\nfalse: it holds its step.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Synced: it advances only while the Transport runs.', 'Default: true.'] }),
      v('rate', 'rate', NUM, { ...RATE, doc: 'Set how many steps a second it advances, while not synced.', ex: ['4', 'advances four steps a second'],
        argDocs: { rate: 'Steps per second.\nRange: 0.1 ↔ 40.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While synced to the Transport: no effect; `division()` sets the step.', 'The inspector stops at 30.', 'Default: 2.'] }),
      v('division', 'division', ENUM, { doc: 'Set how long a step is while synced to the Transport.', ex: ['"1/16"', 'advances a step every sixteenth note'],
        notes: ['Only while `sync()` is on.', 'Default: "1/8".'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Follow the Transport, or run at its own rate.',
        argDocs: { sync: `true: a step every \`division()\`, where the Transport's position puts it.\nfalse: at \`rate()\`.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      // The engine's 2 (turingLength): 1 was stored and played as 2.
      v('length', 'length', INT, { min: 2, max: 64, doc: 'Set how many steps the loop has.', ex: ['16', 'makes the loop sixteen steps long'],
        argDocs: { length: 'Steps.\nRange: 2 ↔ 64, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A step added by a longer loop starts at 0.', 'Default: 8.'] }),
      v('randomness', 'randomness', NUM, { ...UNIT, doc: 'Set how likely a step is to change as the loop comes round to it.', ex: ['0.1', 'lets the loop change slowly'],
        argDocs: { randomness: 'Chance a step is given a new value, each time it is reached.\n0: a locked loop.\n1: a new value every step.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.25.'] }),
      v('quantize', 'quantizeLevels', INT, { min: 0, max: 32, doc: 'Set how many levels each step\'s output is snapped to.', ex: ['2', 'makes every step\'s output on or off'],
        argDocs: { quantize: 'Levels, spread evenly from 0 to 1.\n0 or 1: not snapped.\n2: 0 or 1.\nRange: 0 ↔ 32, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The output only: the steps keep their own values.', 'The inspector stops at 24.', 'Default: 0.'] }),
      v('gate', 'gateThreshold', NUM, { ...UNIT, doc: 'Set the level at which a step opens the gate.', ex: ['0.7', 'opens the gate only at the higher steps'],
        argDocs: { gate: 'Level: the gate output is 1 at a step at or above it, 0 below.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.5.'] }),
      v('step', 'steps', CELL, { ...UNIT, doc: 'Set the value of one step, by its number.', ex: ['3, 0.75', 'sets step 3 to 0.75'],
        argDocs: { value: 'Value.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A running loop goes on from the steps as they now are; `randomness()` can change them as it comes round.'] }),
      // As the arp's (its item 6): the preview keeps the position, so this is a seek
      // (stores/componentPhases.js), where it wrote a number a running preview did not read again.
      v('phase', 'phase', NUM, { ...UNIT, seek: { clock: 'syncToTransport' }, doc: 'Move the loop to a point in its sequence.',
        ex: ['0.5', 'moves it halfway through its loop'],
        argDocs: { phase: ['Where in the loop: 0 the start, 0.5 halfway.', '1: the start again.', 'Range: 0 ↔ 1.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Running: it advances from there. Stopped: it starts from there.',
          'While synced: no effect; the Transport\'s position decides.', '`read(target, "phase")` gives where it is now.',
          'Nothing is written to the panel.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the steps be drawn by dragging, or not.',
        argDocs: { editable: `true: a drag across the bars sets the steps.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showGate', 'showGate', BOOL, { toggle: true, doc: 'Show or hide the row of gate dots under the steps.', notes: ['Default: shown.'] }),
      v('showDivisions', 'showDivisions', BOOL, { toggle: true, doc: 'Show or hide the level lines across the steps.',
        notes: ['How many: set in the inspector, under Divisions.', 'Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.looper"): what looperLayout.js, LooperRenderer and the preview's ticker do.
    id: 'looper', section: 'Looper', prefix: 'looper', label: 'Looper',
    summary: 'Loop movements recorded by hand, each lane sending its value round the loop: the loop\'s length and sync, and each lane.',
    readNotes: ['`read(target, "phase")`: where it is now.', '`read(target, "laneRest")`: every lane\'s; `read(target, "laneRest", 2)`: one.'],
    verbs: [
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the loop.', ex: ['false', 'stops the loop where it is'],
        argDocs: { run: `true: it plays.\nfalse: it stops where it is.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Synced: it plays only while the Transport runs.', 'Default: true.'] }),
      v('seconds', 'loopSeconds', NUM, { min: 0.05, max: 600, doc: 'Set how long the loop is while not synced.', ex: ['8', 'makes the loop eight seconds long'],
        argDocs: { seconds: 'Seconds.\nRange: 0.05 ↔ 600.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While synced to the Transport: no effect; `bars()` sets the loop.', 'The inspector takes 0.1 to 60.', 'Default: 4.'] }),
      // The engine's range (looperLoopBars), in quarters as the inspector's: whole bars 1 to 64
      // could not set the 0.25 to 1 it plays.
      v('bars', 'loopBars', NUM, { min: LOOP_MIN_BARS, max: LOOP_MAX_BARS, doc: 'Set how many bars the loop is while synced to the Transport.', ex: ['4', 'makes the loop four bars long'],
        argDocs: { bars: `Bars: 0.25 is one beat in 4/4.\nRange: ${LOOP_MIN_BARS} ↔ ${LOOP_MAX_BARS}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Only while `sync()` is on.', 'Default: 2.'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Follow the Transport, or loop in its own time.',
        argDocs: { sync: `true: the loop is \`bars()\` long, and starts on the bar line.\nfalse: \`seconds()\` long.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Synced: the grid in each lane marks the bars and beats.', 'Default: false.'] }),
      v('quantize', 'quantizeLoop', BOOL, { toggle: true, doc: 'Round the loop\'s length to whole beats at the panel\'s tempo, or not.',
        argDocs: { quantize: `true: \`seconds()\` is played to the nearest whole beat, one beat at least.\nfalse: as set.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['While not synced; `seconds()` keeps the number set.', 'Default: false.'] }),
      v('lane', 'lanes', ITEM, { item: 'enabled', kind: BOOL, doc: 'Switch one lane on or off, by its number.', ex: ['2, false', 'holds lane 2 at its rest value'],
        argDocs: { enabled: `true: it plays its recording.\nfalse: it sends its rest value, and is drawn faded.\nLeft out: toggles.\n${OFF_RULE}` } }),
      v('laneRest', 'lanes', ITEM, { item: 'rest', kind: NUM, ...UNIT, doc: 'Set the value one lane sends while it has no recording or is off, by its number.', ex: ['1, 0.5', 'makes lane 1 send 0.5 until something is recorded'],
        argDocs: { rest: 'Value.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A recording is made by dragging across the lane: left to right is the loop, the height the value.'] }),
      // As the arp's (its item 6): the preview keeps the position, so this is a seek
      // (stores/componentPhases.js), where it wrote a number a running preview did not read again.
      v('phase', 'phase', NUM, { ...UNIT, seek: { clock: 'syncToTransport' }, doc: 'Move the loop to a point in its length.',
        ex: ['0', 'moves the loop back to its start'],
        argDocs: { phase: ['Where in the loop: 0 the start, 0.5 halfway.', '1: the start again.', 'Range: 0 ↔ 1.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Running: it plays on from there. Stopped: it starts from there, and its lanes send their values there.',
          'While synced: no effect; the Transport\'s position decides.', '`read(target, "phase")` gives where it is now.',
          'Nothing is written to the panel.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let a lane be recorded by dragging, or not.',
        argDocs: { editable: `true: a drag across a lane records it, replacing what it had.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showPlayhead', 'showPlayhead', BOOL, { toggle: true, doc: 'Show or hide the line that moves across the lanes as the loop plays.', notes: ['Default: shown.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the time lines across the lanes.',
        notes: ['Quarters of the loop; while synced, its bars and beats.', 'Default: shown.'] }),
      v('showDivisions', 'showDivisions', BOOL, { toggle: true, doc: 'Show or hide the level lines across each lane.',
        notes: ['How many: set in the inspector, under Major and Minor.', 'Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.orbit"): what orbitLayout.js, OrbitRenderer and the preview's ticker do with each.
    id: 'orbit', section: 'Orbit', prefix: 'orbit', label: 'Orbit',
    summary: 'Turn satellites round a centre as modulation sources, each sending a value from where it is: their speed, and each one\'s orbit and depth.',
    readNotes: ['`read(target, "phase")`: where it is now.', '`read(target, "nodeRadius")`: every node\'s; `read(target, "nodeRadius", 2)`: one.'],
    verbs: [
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the satellites.', ex: ['false', 'stops the satellites where they are'],
        argDocs: { run: `true: they turn.\nfalse: they stop where they are.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Synced: they turn only while the Transport runs.', 'Default: true.'] }),
      v('rate', 'rate', NUM, { ...RATE, doc: 'Set how many cycles a second it turns, while not synced.', ex: ['0.5', 'turns once every two seconds'],
        argDocs: { rate: 'Cycles per second. In one cycle a node turns as many times as `nodeRatio()` says.\nRange: 0.1 ↔ 40.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While synced to the Transport: no effect; `bars()` sets the cycle.', 'The inspector stops at 10.', 'Default: 0.25.'] }),
      // The engine's range (orbitCycleBars), in quarters as the Transport's loop: whole bars 1 to 64
      // could not set the 0.25 to 1 the engine plays.
      v('bars', 'cycleBars', NUM, { min: LOOP_MIN_BARS, max: LOOP_MAX_BARS, doc: 'Set how many bars one cycle takes while synced to the Transport.', ex: ['2', 'turns once every two bars'],
        argDocs: { bars: `Bars: 0.25 is one beat in 4/4.\nRange: ${LOOP_MIN_BARS} ↔ ${LOOP_MAX_BARS}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Only while `sync()` is on.', 'Default: 4.'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Follow the Transport, or turn at its own rate.',
        argDocs: { sync: `true: a cycle every \`bars()\`, where the Transport's position puts it.\nfalse: at \`rate()\`.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      // As the arp's (its item 6): the preview keeps the position, so this is a seek
      // (stores/componentPhases.js), where it wrote a number a running preview did not read again.
      v('phase', 'phase', NUM, { ...UNIT, seek: { clock: 'syncToTransport' }, doc: 'Move the satellites to a point in their cycle.',
        ex: ['0', 'puts every satellite back where its angle starts it'],
        argDocs: { phase: ['Where in the cycle: 0 the start, 0.5 halfway.', '1: the start again.', 'Range: 0 ↔ 1.',
          'Outside the range: the nearest end.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Running: they turn on from there. Stopped: they start from there.',
          'While synced: no effect; the Transport\'s position decides.', '`read(target, "phase")` gives where it is now.',
          'Nothing is written to the panel.'] }),
      v('node', 'nodes', ITEM, { item: 'enabled', kind: BOOL, doc: 'Switch one node on or off, by its number.', ex: ['2, false', 'silences node 2'],
        argDocs: { enabled: `true: it turns and sends.\nfalse: it sends 0 and is drawn as an outline.\nLeft out: toggles.\n${OFF_RULE}` } }),
      v('nodeRadius', 'nodes', ITEM, { item: 'radius', kind: NUM, ...UNIT, doc: 'Set how far from the centre one node turns, by its number.', ex: ['1, 0.5', 'puts node 1 halfway out'],
        argDocs: { radius: 'Distance: 0 the centre, 1 the edge.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A node that sends its radius sends this; one that sends its place across or its height swings wider at a larger radius.'] }),
      v('nodeAngle', 'nodes', ITEM, { item: 'angle', kind: NUM, min: -360, max: 360, doc: 'Set where one node starts its orbit, by its number.', ex: ['1, 90', 'starts node 1 at the top'],
        argDocs: { angle: 'Degrees, counter-clockwise: 0 the right, 90 the top.\nBelow 0: clockwise; -90 is 270.\nRange: -360 ↔ 360.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Where it is at phase 0; a drag sets it too.'] }),
      v('nodeRatio', 'nodes', ITEM, { item: 'ratio', kind: NUM, min: -16, max: 16, doc: 'Set how many turns one node makes in a cycle, by its number.', ex: ['3, -2', 'turns node 3 twice a cycle, clockwise'],
        argDocs: { ratio: 'Turns per cycle.\nAbove 0: counter-clockwise. Below 0: clockwise.\n0: it stands still.\nRange: -16 ↔ 16.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A whole number comes back to where it started every cycle.', 'The inspector stops at -8 and 8.'] }),
      // The engine's range (orbitNodes clamps depth to 0..1): -1 to 0 was taken and sent 0.
      v('nodeDepth', 'nodes', ITEM, { item: 'depth', kind: NUM, ...UNIT, doc: 'Set how much of its value one node sends, by its number.', ex: ['2, 0.5', 'sends half of node 2\'s value'],
        argDocs: { depth: 'Part of the value: 1 all of it, 0.5 half.\n0: nothing.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['What a node sends, and whether it is turned upside down, is set in the inspector, under Satellites.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the satellites be dragged, or not.',
        argDocs: { editable: `true: a drag moves a satellite to a new radius and angle.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showTrails', 'showTrails', BOOL, { toggle: true, doc: 'Show or hide the trail behind each satellite.', notes: ['Default: shown.'] }),
      v('showSpokes', 'showSpokes', BOOL, { toggle: true, doc: 'Show or hide the line from the centre to each satellite.', notes: ['Default: shown.'] }),
      v('showRings', 'showRings', BOOL, { toggle: true, doc: 'Show or hide the ring each satellite turns on.', notes: ['Default: shown.'] }),
      v('showValues', 'showValues', BOOL, { toggle: true, doc: 'Show or hide each satellite\'s value, as a percentage, above it.', notes: ['Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.kinetic"): what kineticLayout.js and the preview's ticker do with each.
    id: 'kinetic', section: 'Kinetic', prefix: 'kinetic', label: 'Kinetic',
    summary: 'Bounce a ball round a box as a modulation source: its gravity, bounce and drag, and where and how hard it is thrown.',
    verbs: [
      v('run', 'running', BOOL, { toggle: true, doc: 'Start or stop the ball.', ex: ['false', 'stops the ball where it is'],
        argDocs: { run: `true: it moves.\nfalse: it stops where it is.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Move the ball in the Transport\'s time, or in its own.',
        argDocs: { sync: `true: a faster tempo speeds it up, and a stopped Transport holds it.\nfalse: in real time.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('gravity', 'gravity', NUM, { ...FIELD('Kinetic', 'gravity'), doc: 'Set how hard the ball is pulled down.', ex: ['1', 'lets the ball fall and settle'],
        argDocs: { gravity: 'Pull, in boxes a second, a second.\n0: none.\nRange: 0 ↔ 4.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.'] }),
      v('bounce', 'restitution', NUM, { ...FIELD('Kinetic', 'restitution'), doc: 'Set how much of its speed the ball keeps at a wall.', ex: ['0.5', 'halves its speed at every wall'],
        argDocs: { bounce: 'Part kept: 1 all of it, 0 none.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.92.'] }),
      v('friction', 'friction', NUM, { ...FIELD('Kinetic', 'friction'), doc: 'Set how fast the ball slows as it moves.', ex: ['0.2', 'slows the ball sooner'],
        argDocs: { friction: 'Drag through the air.\n0: none.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.04.'] }),
      v('keepAlive', 'keepAlive', NUM, { ...FIELD('Kinetic', 'keepAlive'), doc: 'Set how hard the ball is kicked when it nearly stops.', ex: ['0', 'lets the ball settle'],
        argDocs: { keepAlive: 'Strength of a kick in a random direction.\n0: none; it settles.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.35.'] }),
      // Both write the launch, which a running ball now reads again: the preview throws it anew from
      // a launch that changes (where it read the launch only before its first frame).
      v('launch', 'initial', XY, { fx: 'x', fy: 'y', ...UNIT, args: ['x', 'y'], doc: 'Put the ball at a point and throw it from there.',
        ex: ['0.5, 0.9', 'throws the ball from the top middle of the box'],
        argDocs: { x: 'Across the box: 0 the left, 1 the right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.', y: 'Up the box: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.' },
        notes: ['With the speed `velocity()` sets. A running ball is thrown again at once.', 'Default: 0.5, 0.7.'] }),
      v('velocity', 'initial', XY, { fx: 'vx', fy: 'vy', min: -4, max: 4, args: ['vx', 'vy'], doc: 'Set how fast, and which way, the ball is thrown.',
        ex: ['1, 0.5', 'throws the ball to the right and up'],
        argDocs: { vx: 'Boxes a second across: below 0 to the left.\nRange: -4 ↔ 4.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.', vy: 'Boxes a second up: below 0 down.\nRange: -4 ↔ 4.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.' },
        notes: ['Its speed stops at 2.5 boxes a second.', 'A running ball is thrown again at once, from where `launch()` puts it.', 'Default: 0.6, 0.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the ball be thrown by dragging, or not.',
        argDocs: { editable: `true: a drag throws it.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showTrail', 'showTrail', BOOL, { toggle: true, doc: 'Show or hide the trail behind the ball.', notes: ['Default: shown.'] }),
      v('showWalls', 'showWalls', BOOL, { toggle: true, doc: 'Show or hide the walls of the box.', notes: ['Default: shown.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.constellation"): what constellationLayout.js and the preview do with each.
    id: 'constellation', section: 'Constellation', prefix: 'constellation', label: 'Constellation',
    summary: 'Move a probe over a map of presets, each a star with a value for every target, and send the presets\' values from where it is: the probe, how it blends, and its wander.',
    verbs: [
      v('probe', '', XY, { fx: 'probeX', fy: 'probeY', ...UNIT, flat: true, doc: 'Move the probe to a point on the map.',
        ex: ['0.25, 0.75', 'moves the probe to the upper left'],
        argDocs: { x: 'Across the map: 0 the left, 1 the right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.',
          y: 'Up the map: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.' },
        notes: ['Every target is sent its value from there, as `mode()` says.', 'While `run()` is on, the wander places the probe; it comes back here when it stops.', 'Default: 0.5, 0.5.'] }),
      v('mode', 'mode', ENUM, { doc: 'Set whether the probe recalls the nearest preset or blends them.', ex: ['"snap"', 'sends the nearest preset\'s values exactly'],
        argDocs: { mode: '"blend": a mix of every preset\'s values, the nearer the more.\n"snap": the nearest preset\'s values, and `onRecall` when that changes.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "blend".'] }),
      // The engine's floor (blendWeights takes 0.5 at least): 0.1 to 0.5 was taken and blended as 0.5.
      v('blend', 'blendPower', NUM, { min: 0.5, max: 16, doc: 'Set how strongly the nearer presets win in a blend.', ex: ['6', 'lets the nearest preset take over sooner'],
        argDocs: { blend: 'Power of the distance.\nLow: an even mix. High: the nearest preset wins.\nRange: 0.5 ↔ 16.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `mode()` is "blend".', 'The inspector takes 1 to 6.', 'Default: 2.'] }),
      v('run', 'running', BOOL, { toggle: true, doc: 'Let the probe wander over the map on its own, or not.',
        argDocs: { run: `true: it wanders, in a loop across the map.\nfalse: it stays where \`probe()\` puts it.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['A drag moves the probe all the same.', 'Default: false.'] }),
      v('rate', 'wanderRate', NUM, { min: 0, max: 4, doc: 'Set how many times a second the wander goes round, while not synced.', ex: ['0.05', 'goes round once in twenty seconds'],
        argDocs: { rate: 'Times round per second.\n0: it stands still.\nRange: 0 ↔ 4.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While synced to the Transport: no effect; `bars()` sets it.', 'The inspector takes 0.01 to 2.', 'Default: 0.08.'] }),
      v('sync', 'syncToTransport', BOOL, { toggle: true, doc: 'Time the wander by the Transport, or by its own rate.',
        argDocs: { sync: `true: once round every \`bars()\`, where the Transport's position puts it.\nfalse: at \`rate()\`.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      // The engine's range (constellationWanderBars), in quarters: whole bars could not set below 1.
      v('bars', 'wanderBars', NUM, { min: LOOP_MIN_BARS, max: LOOP_MAX_BARS, doc: 'Set how many bars the wander takes to go round, while synced to the Transport.', ex: ['16', 'goes round once in sixteen bars'],
        argDocs: { bars: `Bars: 0.25 is one beat in 4/4.\nRange: ${LOOP_MIN_BARS} ↔ ${LOOP_MAX_BARS}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Only while `sync()` is on.', 'Default: 8.'] }),
      v('links', 'linkCount', INT, { min: 0, max: 16, doc: 'Set how many lines each preset draws to the presets that sound most like it.', ex: ['3', 'links each preset to its three closest'],
        argDocs: { links: 'Presets, by how close their values are.\n0: no lines.\nRange: 0 ↔ 16, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Drawn while `showLinks()` is on.', 'The inspector takes 1 to 6.', 'Default: 2.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the probe and the presets be dragged, or not.',
        argDocs: { editable: `true: a drag on a preset moves it; anywhere else, it moves the probe.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showLinks', 'showLinks', BOOL, { toggle: true, doc: 'Show or hide the lines between presets that sound alike.', notes: ['How many: `links()`.', 'Default: shown.'] }),
      v('showField', 'showField', BOOL, { toggle: true, doc: 'Show or hide the glow round each preset.', notes: ['Default: shown.'] }),
      v('showLabels', 'showLabels', BOOL, { toggle: true, doc: 'Show or hide the presets\' names.',
        notes: ['The nearest preset\'s is always shown; the others\' only while there are 8 or fewer.', 'Default: shown.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.timbre"): what timbreLayout.js and TimbreRenderer do with each.
    id: 'timbre', section: 'Timbre', prefix: 'timbre', label: 'Timbre Pad',
    summary: 'Move a puck over anchors, each a patch with a value for every target, and send their values blended by how near it is: the puck, the blend and each anchor.',
    verbs: [
      v('move', '', XY, { fx: 'x', fy: 'y', ...UNIT, flat: true, doc: 'Move the puck to a point on the pad.', ex: ['0.8, 0.8', 'moves the puck to the upper right'],
        argDocs: { x: 'Across the pad: 0 the left, 1 the right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.',
          y: 'Up the pad: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.' },
        notes: ['Every target is sent a mix of the anchors\' values, the nearer the more.', 'Default: 0.5, 0.5.'] }),
      // The engine's floor (anchorWeights takes 0.5 at least): 0.1 to 0.5 was taken and blended as 0.5.
      v('power', 'power', NUM, { min: 0.5, max: 16, doc: 'Set how strongly the nearer anchors win the blend.', ex: ['6', 'lets the nearest anchor take over sooner'],
        argDocs: { power: 'Power of the distance.\nLow: an even mix. High: the nearest anchor wins.\nRange: 0.5 ↔ 16.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The inspector takes 1 to 6.', 'Default: 2.'] }),
      v('anchorX', 'anchors', ITEM, { item: 'x', kind: NUM, ...UNIT, doc: 'Move one anchor across the pad, by its number.', ex: ['2, 0.9', 'moves anchor 2 to the right edge'],
        argDocs: { x: 'Across the pad: 0 the left, 1 the right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('anchorY', 'anchors', ITEM, { item: 'y', kind: NUM, ...UNIT, doc: 'Move one anchor up or down the pad, by its number.', ex: ['2, 0.1', 'moves anchor 2 near the bottom'],
        argDocs: { y: 'Up the pad: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('axisX', 'axisX', STR, { doc: 'Set the name written along the bottom, for what the pad changes from left to right.', ex: ['"dark → bright"', 'writes dark → bright along the bottom'],
        argDocs: { axisX: 'The name.\n"": none.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Default: "dark → bright".'] }),
      v('axisY', 'axisY', STR, { doc: 'Set the name written up the left side, for what the pad changes from bottom to top.', ex: ['"soft → aggressive"', 'writes soft → aggressive up the left side'],
        argDocs: { axisY: 'The name.\n"": none.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Default: "soft → aggressive".'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the puck and the anchors be dragged, or not.',
        argDocs: { editable: `true: a drag on an anchor moves it; anywhere else, it moves the puck.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showField', 'showField', BOOL, { toggle: true, doc: 'Show or hide the coloured glow round each anchor.', notes: ['Default: shown.'] }),
      v('showAnchors', 'showAnchors', BOOL, { toggle: true, doc: 'Show or hide the anchors and their names.', notes: ['Hidden, they still blend.', 'Default: shown.'] }),
      v('showReadout', 'showReadout', BOOL, { toggle: true, doc: 'Show or hide how many targets are bound to a parameter, as "2/3 MIDI" at the top right.', notes: ['Default: shown.'] }),
    ],
  },

  /* ------------------------------------------------------------------- modulation maps */
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.router"): what routerLayout.js does with each.
    id: 'router', section: 'Router', prefix: 'router', label: 'Router',
    summary: 'Take a signal from the MIDI input or a control, shape it through a curve, and send it to several destinations, each with its own depth.',
    verbs: [
      v('source', 'source', ENUM, { doc: 'Set the signal it follows.', ex: ['"aftertouch"', 'follows channel aftertouch'],
        argDocs: { source: ['"modwheel": CC 1.', '"aftertouch": channel aftertouch.', '"polyAftertouch": per-note aftertouch, one note\'s, as `poly()` picks it.',
          '"breath": CC 2.', '"expression": CC 11.', '"foot": CC 4.', '"velocity": the velocity of the last note played.', '"cc": the CC set by `cc()`.',
          '"link": the control set by `sourceControl()`.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['From the MIDI input on `channel()`; until one arrives, `input()` stands in.', 'Default: "modwheel".'] }),
      v('cc', 'ccNumber', INT, { min: 0, max: 127, doc: 'Set the CC it follows while `source()` is "cc".', ex: ['74', 'follows CC 74'],
        argDocs: { cc: 'Controller number.\nRange: 0 ↔ 127, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `source()` is "cc".', 'Default: 1.'] }),
      v('channel', 'inputChannel', INT, { min: 0, max: 16, doc: 'Set which MIDI channel it listens to.', ex: ['2', 'follows channel 2 only'],
        argDocs: { channel: ECHO_CHANNEL_LINES },
        notes: ['Default: 0, any channel.'] }),
      v('poly', 'polyMode', ENUM, { doc: 'Set which note\'s aftertouch it follows while `source()` is "polyAftertouch".', ex: ['"last"', 'follows the note pressed last'],
        argDocs: { poly: '"highest": the note pressed hardest.\n"last": the note pressed last.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "highest".'] }),
      v('invert', 'invert', BOOL, { toggle: true, doc: 'Turn the signal upside down before the curve.',
        argDocs: { invert: `true: 0 becomes 1 and 1 becomes 0.\nfalse: as it comes.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Before `deadzone()`.', 'Default: false.'] }),
      v('deadzone', 'deadzone', NUM, { ...UNIT, doc: 'Set how much of the bottom of the signal is ignored.', ex: ['0.1', 'ignores the bottom tenth of the signal'],
        argDocs: { deadzone: 'Part of the signal, from 0: 0 up to it gives 0, and the rest is spread over 0 to 1.\n0: none.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.'] }),
      v('input', 'testInput', NUM, { ...UNIT, doc: 'Set the signal it uses until the MIDI input sends one.', ex: ['0.8', 'drives it at 80% until a controller moves'],
        argDocs: { input: 'Signal: 0 ↔ 1.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Not used once the source has arrived, or while `source()` is "link".', 'Default: 0.5.'] }),
      v('dest', 'destinations', ITEM, { item: 'enabled', kind: BOOL, doc: 'Switch one destination on or off, by its number.', ex: ['2, false', 'stops sending to destination 2'],
        argDocs: { enabled: `true: it is sent to.\nfalse: not.\nLeft out: toggles.\n${OFF_RULE}` } }),
      v('destDepth', 'destinations', ITEM, { item: 'depth', kind: NUM, min: -1, max: 1, doc: 'Set how strongly one destination follows, by its number.', ex: ['1, -0.5', 'sends half of the curve, upside down, to destination 1'],
        argDocs: { depth: 'Part of the curve: 1 all of it, 0.5 half.\nBelow 0: the curve upside down.\n0: nothing.\nRange: -1 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The result is spread over the destination\'s own range, set in the inspector.'] }),
      // The transfer curve, sampled by envValueAt as an envelope is: its points keep to their
      // neighbours, as the Envelope's do.
      v('curveX', 'curve', ITEM, { item: 'x', kind: NUM, ...UNIT, itemRange: (c, at) => curvePointRange(c?.curve, at),
        doc: 'Move one point of the curve along the signal axis, by its number.', ex: ['2, 0.3', 'moves point 2 to a signal of 0.3'],
        argDocs: { x: 'Signal: 0 ↔ 1.\nRange: between the points either side; the first point at 0, the last at 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('curveY', 'curve', ITEM, { item: 'y', kind: NUM, ...UNIT, doc: 'Set the output of one point of the curve, by its number.', ex: ['2, 0.8', 'sends 0.8 at point 2'],
        argDocs: { y: 'Output: 0 ↔ 1.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('curveShape', 'curve', ITEM, { item: 'curve', kind: ENUM, doc: 'Set the shape of the segment of the curve that ends at one point, by its number.', ex: ['2, "exp"', 'curves the segment into point 2'],
        argDocs: { curve: '"linear": straight.\n"exp": slow, then fast.\n"log": fast, then slow.\n"scurve": slow at both ends.\n"hold": flat, then a jump at the point.\nCase-insensitive.\nInvalid: rejected with a console error.' } }),
      v('sourceControl', 'sourceControlId', LINK, { sourceKind: 'range', doc: 'Name the control it follows while `source()` is "link".',
        ex: ['"Expression"', 'makes the control called Expression the signal'], linkRule: 'Its range is the signal\'s 0 to 1.' }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the curve\'s points be dragged, or not.',
        argDocs: { editable: `true: a drag moves a point.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the grid behind the curve.', notes: ['Default: shown.'] }),
      v('showDivisions', 'showDivisions', BOOL, { toggle: true, doc: 'Show or hide the level lines across the curve.', notes: ['Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.macro"): what macroLayout.js and MacroRenderer do with each.
    id: 'macro', section: 'Macro', prefix: 'macro', label: 'Macro',
    summary: 'Turn one knob that drives several parameters, each slot with its own depth, curve and range.',
    verbs: [
      v('value', 'value', NUM, { ...UNIT, doc: 'Turn the knob.', ex: ['0.75', 'turns the knob three quarters of the way'],
        argDocs: { value: 'Position: 0 fully left, 1 fully right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Every slot that is on is sent its value from there.', 'Default: 0.28.'] }),
      v('slot', 'slots', ITEM, { item: 'enabled', kind: BOOL, doc: 'Switch one slot on or off, by its number.', ex: ['2, false', 'stops slot 2 following the knob'],
        argDocs: { enabled: `true: it follows the knob.\nfalse: it sends 0.\nLeft out: toggles.\n${OFF_RULE}` } }),
      v('slotDepth', 'slots', ITEM, { item: 'depth', kind: NUM, min: -1, max: 1, doc: 'Set how much of the knob\'s turn one slot follows, by its number.', ex: ['3, -0.5', 'makes slot 3 fall half as far as the knob turns'],
        argDocs: { depth: 'Part of the turn: 1 all of it, 0.5 half.\nBelow 0: it goes down as the knob turns up.\n0: it stays at `slotMin()`.\nRange: -1 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('slotCurve', 'slots', ITEM, { item: 'curve', kind: ENUM, doc: 'Set how one slot follows the turn, by its number.', ex: ['1, "exp"', 'makes slot 1 change slowly at first'],
        argDocs: { curve: '"linear": evenly.\n"exp": slowly, then fast.\n"log": fast, then slowly.\n"scurve": slowly at both ends.\nCase-insensitive.\nInvalid: rejected with a console error.' } }),
      v('slotMin', 'slots', ITEM, { item: 'min', kind: NUM, ...UNIT, doc: 'Set the value one slot sends with the knob at 0, by its number.', ex: ['1, 0.2', 'keeps slot 1 at 0.2 or more'],
        argDocs: { min: 'Value.\nAbove `slotMax()`: the slot runs the other way.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('slotMax', 'slots', ITEM, { item: 'max', kind: NUM, ...UNIT, doc: 'Set the value one slot sends with the knob at 1, by its number.', ex: ['1, 0.8', 'keeps slot 1 at 0.8 or less'],
        argDocs: { max: 'Value.\nBelow `slotMin()`: the slot runs the other way.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' } }),
      v('label', 'label', STR, { doc: 'Set the caption above the knob.', ex: ['"TONE"', 'captions the knob TONE'],
        argDocs: { label: 'The caption, drawn in capitals.\n"": none.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Default: "Macro".'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the knob be turned by dragging, or not.',
        argDocs: { editable: `true: a drag up turns it up.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showLanes', 'showLanes', BOOL, { toggle: true, doc: 'Show or hide a lane for each slot beside the knob.', notes: ['Hidden, the knob fills the control.', 'Default: shown.'] }),
      v('showValues', 'showValues', BOOL, { toggle: true, doc: 'Show or hide the knob\'s value and each slot\'s.', notes: ['Default: shown.'] }),
      v('showDivisions', 'showDivisions', BOOL, { toggle: true, doc: 'Show or hide the level lines along each slot\'s lane.',
        notes: ['How many: set in the inspector, under Major and Minor.', 'Default: hidden.'] }),
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
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.constraint"): what constraintLayout.js and the preview's drag do with each.
    id: 'constraint', section: 'Constraint', prefix: 'constraint', label: 'Constraint',
    summary: 'Keep several values to a rule as one of them moves: adding up to 1, in order, in proportion, or mirrored.',
    verbs: [
      v('mode', 'mode', ENUM, { doc: 'Set the rule the members keep.', ex: ['"order"', 'keeps each member at or above the one before'],
        argDocs: { mode: '"sum": they add up to 1; the others share what is left, as they stood.\n"order": each at or above the one before, by `gap()` at least.\n"ratio": all scaled together, keeping their proportions.\n"mirror": member 2 is 1 minus member 1; the others are free.\n"free": no rule.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Kept from the next move on: the values are not changed now.', 'Default: "sum".'] }),
      v('gap', 'minGap', NUM, { ...UNIT, doc: 'Set the least space between members, while `mode()` is "order".', ex: ['0.1', 'keeps each member 0.1 above the one before'],
        argDocs: { gap: 'Space.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `mode()` is "order".', 'Default: 0.'] }),
      // The rule, as a drag keeps it (applyConstraint): the verb wrote the one value and left the
      // others, so "sum" members added up to 1.3.
      v('member', 'members', ITEM, { item: 'value', kind: NUM, ...UNIT, doc: 'Move one member, by its number; the others move to keep the rule.', ex: ['1, 0.8', 'sets member 1 to 0.8, and the others share 0.2 under "sum"'],
        solve: (list, c, at, value) => {
          const values = applyConstraint((Array.isArray(c.members) ? c.members : []).map((m) => m?.value), c.mode ?? 'sum', at, value, { minGap: c.minGap });
          return list.map((m, i) => ({ ...m, value: values[i] }));
        },
        argDocs: { value: 'Value.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['As a drag moves it: under "ratio", a member at 0 moves alone.', '`fill(target, "member", …)` writes every value as given, without the rule.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the members be dragged, or not.',
        argDocs: { editable: `true: a drag on a bar moves that member, and the others keep the rule.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showValues', 'showValues', BOOL, { toggle: true, doc: 'Show or hide each member\'s value.', notes: ['Default: shown.'] }),
      v('showBadge', 'showBadge', BOOL, { toggle: true, doc: 'Show or hide the rule\'s sign, such as "Σ = 100%".', notes: ['Default: shown.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.envelope"): what envelopeLayout.js and EnvelopeRenderer do with each.
    id: 'envelope', section: 'Envelope', prefix: 'envelope', label: 'Envelope',
    summary: 'Shape an envelope from its points: a preset, each point\'s place, level and curve, the sustain point, the loop and the playhead.',
    verbs: [
      // The inspector's Preset seeds the shape (applyPreset); the verb wrote the name and left the
      // shape, which the canvas then read with the new preset's locks.
      v('preset', 'preset', ENUM, { doc: 'Give the envelope a preset shape.', ex: ['"ad"', 'makes the envelope an attack and a decay'],
        alsoWrites: (name) => {
          const seeded = envelopePreset(name);
          return { points: seeded.points.map((p, i) => ({ id: `e${i}`, x: p.x, y: p.y, curve: p.curve ?? 'linear', tension: 0 })), sustainIndex: seeded.sustainIndex };
        },
        argDocs: { preset: ['"adsr": attack, decay, sustain, release; the sustain at point 3.', '"ad": attack and decay.', '"ar": attack and release.',
          '"dahdsr": delay, attack, hold, decay, sustain, release; the sustain at point 5.', '"mseg" or "free": five points, every one free to move.',
          'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n') },
        notes: ['Its points and sustain point are replaced, as the inspector\'s Preset does.', 'Default: "adsr".'] }),
      // Between its neighbours, the first at 0 and the last at 1, as a drag on the canvas keeps it
      // (envDragNode): a script could put point 1 after point 2, and the points were drawn re-sorted
      // under the numbers the script went on using.
      v('pointX', 'points', ITEM, { item: 'x', kind: NUM, ...UNIT, itemRange: envelopePointRange,
        doc: 'Move one point along the time axis, by its number.', ex: ['2, 0.1', 'moves point 2 to a tenth of the way along'],
        argDocs: { x: 'Part of the time axis: 0 the start, 1 the end.\nRange: between the points either side; the first point at 0, the last at 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['1 on the time axis is `timeMax()` milliseconds.'] }),
      v('pointY', 'points', ITEM, { item: 'y', kind: NUM, ...UNIT,
        doc: 'Set the level of one point, by its number.', ex: ['3, 0.6', 'puts point 3 at 60%'],
        argDocs: { y: 'Level: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The canvas keeps the levels a preset fixes, such as an ADSR\'s first and last at 0; a script can move them.'] }),
      v('pointCurve', 'points', ITEM, { item: 'curve', kind: ENUM,
        doc: 'Set the shape of the segment that ends at one point, by its number.', ex: ['2, "exp"', 'curves the rise into point 2'],
        argDocs: { curve: '"linear": straight.\n"exp": slow, then fast.\n"log": fast, then slow.\n"scurve": slow at both ends.\n"hold": flat, then a jump at the point.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Point 1 starts the envelope: its curve is not drawn.'] }),
      v('sustain', 'sustainIndex', INT, { min: -1, max: 64, oneBased: true, rangeFrom: (c) => ({ max: envelopePointCount(c) }),
        doc: 'Set which point holds while a note is held.', ex: ['3', 'holds at point 3'],
        argDocs: { sustain: 'Point number, counted from 1.\n0 or -1: no sustain point.\nRange: -1 ↔ the number of points, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 3, as "adsr" puts it.'] }),
      v('loop', 'loopEnabled', BOOL, { toggle: true, doc: 'Mark a loop on the curve, from `loopStart()` to `loopEnd()`, or not.',
        argDocs: { loop: `true: marked.\nfalse: not.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      // Counted from 1 to the points there are: 0 was taken, and stored as -1, which read back as 0.
      v('loopStart', 'loopStart', INT, { min: 1, max: 64, oneBased: true, rangeFrom: (c) => ({ max: envelopePointCount(c) }),
        doc: 'Set the point the loop starts at.', ex: ['2', 'starts the loop at point 2'],
        argDocs: { loopStart: 'Point number, counted from 1.\nRange: 1 ↔ the number of points, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 1.'] }),
      v('loopEnd', 'loopEnd', INT, { min: 1, max: 64, oneBased: true, rangeFrom: (c) => ({ max: envelopePointCount(c) }),
        doc: 'Set the point the loop ends at.', ex: ['3', 'ends the loop at point 3'],
        argDocs: { loopEnd: 'Point number, counted from 1.\nRange: 1 ↔ the number of points, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 1.'] }),
      v('timeMax', 'timeMax', NUM, { min: 1, max: 600000, doc: 'Set how many milliseconds the whole time axis stands for.', ex: ['2000', 'makes the time axis two seconds long'],
        argDocs: { timeMax: 'Milliseconds, at 1 on the time axis.\nRange: 1 ↔ 600000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The times read out only: it does not change the shape.', 'Default: 1000.'] }),
      v('phase', 'phase', NUM, { ...UNIT, doc: 'Put the playhead at a point along the time axis.', ex: ['0.5', 'puts the playhead halfway along'],
        argDocs: { phase: 'Part of the time axis: 0 the start, 1 the end.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Shown while `showPlayhead()` is on.', 'While `phaseSource()` links a control, that control places it.', 'Default: 0.'] }),
      v('addOnDoubleClick', 'addOnDoubleClick', BOOL, { toggle: true, doc: 'Let a double-click on the curve add a point, or not.',
        argDocs: { addOnDoubleClick: `true: a double-click adds a point there.\nfalse: it does nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('snapX', 'snapX', NUM, { min: 0, max: 1, doc: 'Set the step a dragged point snaps to along the time axis.', ex: ['0.125', 'snaps points to eighths of the time axis'],
        argDocs: { snapX: 'Part of the time axis.\n0: no snap.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Dragging only: `pointX()` is not snapped.', 'Default: 0.'] }),
      v('snapY', 'snapY', NUM, { min: 0, max: 1, doc: 'Set the step a dragged point snaps to in level.', ex: ['0.25', 'snaps points to quarters of the level'],
        argDocs: { snapY: 'Part of the level.\n0: no snap.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Dragging only: `pointY()` is not snapped.', 'Default: 0.'] }),
      v('fillUnder', 'fillUnder', BOOL, { toggle: true, doc: 'Shade the area under the curve, or not.', notes: ['Default: on.'] }),
      v('phaseSource', 'phaseSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that places the playhead.',
        ex: ['"Position"', 'makes the control called Position move the playhead'], linkRule: 'Its range sets 0 to 1.' }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the points be dragged, added and removed by touch, or not.',
        argDocs: { editable: `true: they can be.\nfalse: touches do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Only touch is locked: the commands still work.', 'Default: true.'] }),
      v('showPlayhead', 'showPlayhead', BOOL, { toggle: true, doc: 'Show or hide the playhead: a dot on the curve at `phase()`.', notes: ['Default: hidden.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the grid behind the curve.', notes: ['Its divisions are set in the inspector. Default: shown.'] }),
    ],
  },

  /* -------------------------------------------------------------------- hands-on values */
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.ribbon"): what ribbonLayout.js and the preview do with each. A Pitch Wheel and
    // a Mod Wheel are Ribbons with other defaults.
    id: 'ribbon', section: 'Ribbon', prefix: 'ribbon', label: 'Ribbon',
    summary: 'Drive a touch strip or wheel, such as a pitch or mod wheel: its value, its style, and where it goes when let go.',
    verbs: [
      v('value', 'value', NUM, { ...FIELD('Ribbon', 'value'), doc: 'Set its position.', ex: ['0.75', 'puts it three quarters of the way'],
        argDocs: { value: 'Position: 0 the start, 1 the end.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['`snap()` steps a drag, not this.', 'Default: 0.5; a Mod Wheel\'s: 0.'] }),
      v('bipolar', 'bipolar', BOOL, { toggle: true, doc: 'Send its value as -1 to 1, as a pitch wheel does, or as 0 to 1.',
        argDocs: { bipolar: `true: -1 at the start, 0 in the middle, 1 at the end; filled from the middle.\nfalse: 0 to 1.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['The readout shows it the same way.', 'Default: false; a Pitch Wheel\'s: true.'] }),
      ...returnVerbs('Ribbon', { rest: 'the position', restLines: 'Position: 0 the start, 1 the end.', min: 'the start', max: 'the end', centre: 'the middle' }),
      v('snap', 'snap', NUM, { ...FIELD('Ribbon', 'snap'), doc: 'Set the step a drag snaps to.', ex: ['0.25', 'snaps a drag to quarters'],
        argDocs: { snap: 'Part of the travel.\n0: no snap.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A drag only: `value()` is not snapped.', 'Default: 0.'] }),
      v('orientation', 'orientation', ENUM, { doc: 'Set which way it runs.', ex: ['"horizontal"', 'runs it from left to right'],
        argDocs: { orientation: '"vertical": from the bottom up.\n"horizontal": from left to right.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "vertical".'] }),
      v('style', 'style', ENUM, { doc: 'Set how it looks: a strip, a flat wheel, or a wheel drawn in 3D.', ex: ['"wheel3d"', 'draws it as a wheel in 3D'],
        argDocs: { style: '"ribbon": a touch strip.\n"wheel": a flat wheel.\n"wheel3d": a wheel drawn in 3D.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "ribbon"; a Pitch or Mod Wheel\'s: "wheel".'] }),
      v('label', 'label', STR, { doc: 'Set the caption under it.', ex: ['"PITCH"', 'captions it PITCH'],
        argDocs: { label: 'The caption.\n"": none.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('valuePrecision', 'valuePrecision', INT, { min: 0, max: 6, doc: 'Set how many decimal places the readout shows.', ex: ['0', 'shows the readout as a whole number'],
        argDocs: { valuePrecision: 'Decimal places.\nRange: 0 ↔ 6, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The readout shows while `showValue()` is on.', 'Default: 2.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let it be dragged, or not.',
        argDocs: { editable: `true: a drag moves it.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showGlow', 'showGlow', BOOL, { toggle: true, doc: 'Show or hide the glow while it is held.', notes: ['Default: shown.'] }),
      v('showValue', 'showValue', BOOL, { toggle: true, doc: 'Show or hide the readout: its value as a number.',
        notes: ['-1 to 1 while `bipolar()` is on.', 'Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.crossfader"): what crossfaderLayout.js and returnToRest.js do with each.
    id: 'crossfader', section: 'Crossfader', prefix: 'crossfader', label: 'Crossfader',
    summary: 'Blend between two sides, A and B: the blend, how the two levels follow it, its centre snap, and where it goes when let go.',
    verbs: [
      v('mix', 'mix', NUM, { ...FIELD('Crossfader', 'mix'), doc: 'Set the blend between A and B.', ex: ['0.25', 'blends mostly A, a quarter B'],
        argDocs: { mix: 'Position: 0 all A, 0.5 the middle, 1 all B.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['`detent()` snaps a drag, not this.', 'Default: 0.5.'] }),
      v('law', 'law', ENUM, { doc: 'Set how the levels of A and B follow the blend.', ex: ['"linear"', 'makes the two levels add up to the whole'],
        argDocs: { law: '"equalPower": constant loudness; each side at 71% (-3 dB) in the middle.\n"linear": the two add up to 1; each side at half (-6 dB) in the middle.\n"sharp": both full through the middle; a side cut only towards the far end.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "equalPower".'] }),
      v('bipolar', 'bipolar', BOOL, { toggle: true, doc: 'Send the Mix output as -1 to 1, or as 0 to 1.',
        argDocs: { bipolar: `true: -1 all A, 0 the middle, 1 all B.\nfalse: 0 to 1.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['The A and B outputs, the two levels, are 0 to 1 either way.', 'Default: false.'] }),
      v('detent', 'detent', NUM, { ...FIELD('Crossfader', 'detent'), doc: 'Set how near the middle a drag snaps to it.', ex: ['0.05', 'snaps a drag within 5% of the middle to it'],
        argDocs: { detent: 'Distance from the middle, as part of the whole travel.\n0: no snap.\n0.5 or more: every drag lands in the middle.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A drag only: `mix()` is not snapped.', 'The inspector stops at 0.5.', 'Default: 0.03.'] }),
      ...returnVerbs('Crossfader', { rest: 'the blend', restLines: 'Position: 0 all A, 1 all B.', min: 'all A', max: 'all B', centre: 'the middle' }),
      v('orientation', 'orientation', ENUM, { doc: 'Set which way the fader runs.', ex: ['"vertical"', 'puts A at the bottom and B at the top'],
        argDocs: { orientation: '"horizontal": A at the left.\n"vertical": A at the bottom.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "horizontal".'] }),
      v('labelA', 'labelA', STR, { doc: 'Set the name shown at the A end.', ex: ['"DRY"', 'names the A end DRY'],
        argDocs: { labelA: 'The name.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Shown while `showLabels()` is on.', 'Default: "A".'] }),
      v('labelB', 'labelB', STR, { doc: 'Set the name shown at the B end.', ex: ['"WET"', 'names the B end WET'],
        argDocs: { labelB: 'The name.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Shown while `showLabels()` is on.', 'Default: "B".'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the handle be dragged, or not.',
        argDocs: { editable: `true: a drag moves it.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showLabels', 'showLabels', BOOL, { toggle: true, doc: 'Show or hide the names at the two ends.', notes: ['Default: shown.'] }),
      v('showGains', 'showGains', BOOL, { toggle: true, doc: 'Show or hide a bar for each side\'s level.', notes: ['Default: hidden.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.joystick"): what joystickLayout.js and returnToRest.js do with each.
    id: 'joystick', section: 'Joystick', prefix: 'joystick', label: 'Vector Joystick',
    summary: 'Move a puck over a square, sending where it is on each axis and how near it is to each corner, and where it goes when let go.',
    verbs: [
      v('move', '', XY, { fx: 'x', fy: 'y', ...UNIT, flat: true, doc: 'Move the puck to a point.', ex: ['0.25, 0.75', 'moves the puck to the upper left'],
        argDocs: { x: 'Across: 0 the left, 1 the right.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.',
          y: 'Up: 0 the bottom, 1 the top.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.' },
        notes: ['Sends x and y as `bipolar()` says, and each corner how near the puck is to it: 0 to 1, the four adding up to 1.', 'Default: 0.5, 0.5.'] }),
      v('bipolar', 'bipolar', BOOL, { toggle: true, doc: 'Send x and y as -1 to 1, or as 0 to 1.',
        argDocs: { bipolar: `true: -1 at the left or bottom, 0 in the middle, 1 at the right or top.\nfalse: 0 to 1.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['The corners send 0 to 1 either way.', 'Default: true.'] }),
      ...returnVerbs('Joystick', { rest: 'the position', restLines: 'Position on each axis that goes back: 0 the left or bottom, 1 the right or top.',
        min: '0 on each axis that goes back', max: '1 on each axis that goes back', centre: 'the middle',
        ranges: { returnValue: { min: 0, max: 1 }, returnTime: { min: 0, max: 5000 } } }),
      v('returnAxes', 'returnAxes', ENUM, { doc: 'Set which axes go back when the puck is let go.', ex: ['"x"', 'sends the puck back across, and leaves its height'],
        argDocs: { returnAxes: '"both": both, in a straight line.\n"x": across only.\n"y": up and down only.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Only while `returnMode()` is not "none".', 'Default: "both".'] }),
      // A corner by number, as joystickCornerLabels orders them: the text said "clockwise from the top
      // left", and the third is the bottom LEFT.
      v('cornerLabel', 'cornerLabels', LINE, { doc: 'Name one corner, by its number.', ex: ['4, "Brass"', 'names the bottom right corner Brass'],
        argDocs: { index: 'Corner: 1 the top left, 2 the top right, 3 the bottom left, 4 the bottom right.\nA fraction: rounded.\nNot one of the corners: rejected with a console error.',
          text: 'The name.\n"": none.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Drawn while `showCorners()` is on.', 'Default: "A", "B", "C" and "D".'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the puck be dragged, or not.',
        argDocs: { editable: `true: a drag moves it.\nfalse: drags do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the grid behind the puck.', notes: ['How many lines: set in the inspector, under Divisions.', 'Default: shown.'] }),
      v('showCrosshair', 'showCrosshair', BOOL, { toggle: true, doc: 'Show or hide the lines through the puck.', notes: ['Default: shown.'] }),
      v('showCorners', 'showCorners', BOOL, { toggle: true, doc: 'Show or hide the corners\' marks and names.', notes: ['Default: shown.'] }),
      v('showTrail', 'showTrail', BOOL, { toggle: true, doc: 'Show or hide the fading trail behind the puck.', notes: ['Default: hidden.'] }),
    ],
  },
  {
    // The owner's review, done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.meter"): what MeterRenderer and meterLayout.js draw for each.
    id: 'meter', section: 'Meter', prefix: 'meter', label: 'Meter',
    summary: 'Show a level on a bar or an arc: its value and range, scale, colour zones, peak marker, caption and readout.',
    verbs: [
      v('value', 'value', NUM, { min: -1e9, max: 1e9, doc: 'Set the level shown, in the meter\'s own units.', ex: ['0.5', 'fills the meter halfway while its range is 0 to 1'],
        argDocs: { value: 'The level, between `valueMin()` and `valueMax()`.\nOutside them: drawn at the nearest end; the readout shows it as it is.\nInvalid: rejected with a console error.' },
        notes: [METER_SOURCE_WINS] }),
      v('scale', 'scale', ENUM, { doc: 'Set how the level is placed along the meter: in proportion, or in decibels.', ex: ['"db"', 'places the level in decibels'],
        argDocs: { scale: '"linear": in proportion to the value.\n"db": the value\'s part of its range as a level in decibels, the top of the range being 0 dB, placed between `dbFloor()` and `dbCeil()`.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "linear".'] }),
      v('peakHold', 'peakHold', BOOL, { toggle: true, doc: 'Show or hide the peak marker: a line at the highest recent level.',
        argDocs: { peakHold: `true: shown; it holds for \`holdMs()\`, then falls at \`decay()\`.\nfalse: hidden.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: hidden.'] }),
      v('holdMs', 'peakHoldMs', NUM, { min: 0, max: 60000, doc: 'Set how long the peak marker holds before it falls.', ex: ['2000', 'holds the peak for two seconds'],
        argDocs: { holdMs: 'Milliseconds.\n0: it falls at once.\nRange: 0 ↔ 60000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 1200.'] }),
      v('decay', 'peakDecayPerSec', NUM, { min: 0, max: 100, doc: 'Set how fast the peak marker falls.', ex: ['1', 'drops the peak the meter\'s whole length in a second'],
        argDocs: { decay: 'Lengths of the meter per second.\n0: it does not fall.\nRange: 0 ↔ 100.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.4.'] }),
      // As the LCD's valueMin and valueMax, kept as they were merged (its item 5): not checked
      // against each other, and the text says what each order draws.
      v('valueMin', 'valueMin', NUM, { min: -1e9, max: 1e9, doc: 'Set the value at which the meter is empty.', ex: ['-1', 'empties the meter at -1'],
        argDocs: { valueMin: 'The value at the empty end.\nEqual to `valueMax()`: the meter stays empty.\nAbove it: the meter fills the other way.\nRange: -1000000000 ↔ 1000000000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: [METER_SOURCE_WINS, 'Default: 0.'] }),
      v('valueMax', 'valueMax', NUM, { min: -1e9, max: 1e9, doc: 'Set the value at which the meter is full.', ex: ['127', 'fills the meter at 127'],
        argDocs: { valueMax: 'The value at the full end.\nEqual to `valueMin()`: the meter stays empty.\nBelow it: the meter fills the other way.\nRange: -1000000000 ↔ 1000000000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: [METER_SOURCE_WINS, 'Default: 1.'] }),
      v('dbFloor', 'dbFloor', NUM, { min: -200, max: 0, doc: 'Set the level in decibels at which the meter is empty, on a dB scale.', ex: ['-48', 'empties the meter at -48 dB'],
        argDocs: { dbFloor: 'Decibels.\nRange: -200 ↔ 0.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `scale()` is "db".', 'Default: -60.'] }),
      v('dbCeil', 'dbCeil', NUM, { min: -200, max: 60, doc: 'Set the level in decibels at which the meter is full, on a dB scale.', ex: ['0', 'fills the meter at 0 dB, the top of the value\'s range'],
        argDocs: { dbCeil: 'Decibels.\nAbove 0: the meter is not full at the top of the value\'s range.\nEqual to `dbFloor()`: the meter stays empty; below it: the meter fills the other way.\nRange: -200 ↔ 60.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `scale()` is "db".', 'Default: 6.'] }),
      v('orientation', 'orientation', ENUM, { doc: 'Set which way the meter runs: across, up, or round an arc.', ex: ['"vertical"', 'fills the meter from the bottom up'],
        argDocs: { orientation: '"horizontal": left to right.\n"vertical": bottom to top.\n"arc": clockwise round an arc; its angles are set in the inspector, under Arc.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "horizontal".'] }),
      v('gradient', 'gradient', BOOL, { toggle: true, doc: 'Blend the zone colours into each other, or step from one to the next.',
        argDocs: { gradient: `true: blended.\nfalse: each zone in its own colour.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: on; a Progress Bar\'s: off.'] }),
      v('label', 'label', STR, { doc: 'Set the caption shown with the meter.', ex: ['"OUT"', 'captions the meter OUT'],
        argDocs: { label: 'The caption.\nShown above or below the meter, as `labelPosition()` says.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      // The caption is drawn only where this says, and it was the inspector's alone: a script's
      // label() on a new meter showed nothing (labelPosition "none").
      v('labelPosition', 'labelPosition', ENUM, { doc: 'Set where the caption sits.', ex: ['"below"', 'puts the caption under the meter'],
        argDocs: { labelPosition: '"none": hidden.\n"above": above the meter.\n"below": below it.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Default: "none".'] }),
      v('valuePrecision', 'valuePrecision', INT, { ...FIELD('Meter', 'valuePrecision'), doc: 'Set how many decimal places the readout shows.', ex: ['2', 'shows the readout with two decimal places'],
        argDocs: { valuePrecision: 'Decimal places.\nRange: 0 ↔ 6, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: [METER_READOUT, 'Default: 0.'] }),
      v('valuePrefix', 'valuePrefix', STR, { doc: 'Set the text before the number in the readout and the scale labels.', ex: ['"Gain "', 'shows the readout as Gain 1'],
        argDocs: { valuePrefix: 'The text.\nOn a dB scale, the scale labels say "dB" instead.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('valueSuffix', 'valueSuffix', STR, { doc: 'Set the text after the number in the readout and the scale labels.', ex: ['" ms"', 'writes ms after the number'],
        argDocs: { valueSuffix: 'The text.\nOn a dB scale, the scale labels say "dB" instead.\nA number: written as text.\nLeft out: rejected with a console error.' } }),
      v('zoneAt', 'zones', ITEM, { item: 'from', kind: NUM, ...UNIT, doc: 'Set where a colour zone starts along the meter, by its number.', ex: ['2, 0.8', 'starts zone 2 at 80% of the meter'],
        argDocs: { from: 'Part of the meter\'s length: 0 the empty end, 1 the full end.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['A zone colours the fill from its start up to the next zone\'s; the lowest also from 0.', 'Their colours are set in the inspector, under Zones.'] }),
      v('source', 'valueSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the level.', ex: ['"Volume"', 'makes the control called Volume drive the meter'],
        linkRule: 'Its value and range are the meter\'s.' }),
      // The three flags, declared rather than derived (derivedFlagVerbs), for what each draws.
      v('showTicks', 'showTicks', BOOL, { toggle: true, doc: 'Show or hide the tick marks along the meter.',
        notes: ['How many divisions: set in the inspector, under Scale & readout. Default: 4.', 'Default: hidden.'] }),
      v('showScaleLabels', 'showScaleLabels', BOOL, { toggle: true, doc: 'Show or hide the values at the tick marks.',
        notes: ['On a dB scale in decibels; otherwise with `valuePrefix()` and `valueSuffix()`.', 'Default: hidden.'] }),
      v('showValue', 'showValue', BOOL, { toggle: true, doc: 'Show or hide the readout: the value as a number.',
        notes: ['Written with `valuePrecision()`, `valuePrefix()` and `valueSuffix()`, as the value is: not in decibels.', 'Default: hidden; a Progress Bar\'s: shown.'] }),
    ],
  },

  /* -------------------------------------------------------------------------- the rest */
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.transport"). The ranges are the clock's own (utils/transportLayout.js): a script
    // could set a tempo of 400, a swing below 0, a loop of 9999 bars from bar 9999 and a count-in of
    // 16, and the clock played 300, 0, 64 bars from bar 999 and 8.
    id: 'transport', section: 'Transport', prefix: 'transport', label: 'Transport',
    summary: 'Set the panel\'s clock: its tempo, swing, time signature, loop and count-in, where it follows, and its MIDI clock out. Reading it is ce.time.',
    verbs: [
      v('bpm', 'bpm', NUM, { min: MIN_BPM, max: MAX_BPM, doc: 'Set the tempo.', ex: ['128', 'sets the tempo to 128 beats a minute'],
        argDocs: { bpm: `Beats a minute; a beat is a quarter note.\nRange: ${MIN_BPM} ↔ ${MAX_BPM}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['The position does not jump: only what comes after the current beat speeds up or slows down.', TRANSPORT_FOLLOWING, 'Default: 120.'] }),
      v('swing', 'swing', NUM, { ...UNIT, doc: 'Set how far every second step is delayed, for every component following the clock.', ex: ['0.5', 'delays every second step by a quarter of a step'],
        argDocs: { swing: 'Part of half a step: 1 delays every second step by half a step.\n0: straight.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['An Arp with `swingSource()` "own" plays its own instead.', 'Default: 0.'] }),
      v('source', 'source', ENUM, { doc: 'Set which clock the panel follows: its own, a MIDI clock, or the host.', ex: ['"host"', 'follows the DAW\'s playhead'],
        argDocs: { source: '"internal": its own, at `bpm()`.\n"external": a MIDI clock arriving on the input.\n"host": the DAW\'s playhead, in a plug-in.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Following, `bpm()` is ignored, tapping sets nothing and no clock is sent.', 'Default: "internal".'] }),
      v('beatsPerBar', 'beatsPerBar', INT, { min: 1, max: 32, doc: 'Set how many beats a bar has: the time signature\'s upper number.', ex: ['3', 'makes each bar three beats long'],
        argDocs: { beatsPerBar: 'Beats.\nRange: 1 ↔ 32, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Sets the bar for the position, the loop and the count-in, and where the downbeat falls.', 'Default: 4.'] }),
      // Not an enum: the transport clamps ANY integer here, so a list of six refused 3, 12 and
      // every other unit it accepts.
      v('beatUnit', 'beatUnit', INT, { min: 1, max: 32, doc: 'Set the time signature\'s lower number.', ex: ['8', 'shows the time signature over 8'],
        argDocs: { beatUnit: 'The note value of a beat in the time signature: 4 a quarter, 8 an eighth.\nRange: 1 ↔ 32, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Shown only: a beat is a quarter note whatever it says.', 'Default: 4.'] }),
      v('loop', 'loopEnabled', BOOL, { toggle: true, doc: 'Switch the loop on or off.',
        argDocs: { loop: `true: the position runs from \`loopStart()\` for \`loopBars()\` and back, over and over.\nfalse: it runs on.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Before the loop\'s first bar, the position runs into it.', 'Default: false.'] }),
      v('loopStart', 'loopStartBar', INT, { min: 1, max: MAX_LOOP_BAR, doc: 'Set the bar the loop starts on.', ex: ['5', 'starts the loop at bar 5'],
        argDocs: { loopStart: `Bar, counted from 1.\nRange: 1 ↔ ${MAX_LOOP_BAR}, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Default: 1.'] }),
      // Bars, in quarters: the inspector's Length takes 0.25, one beat in 4/4; this was whole bars only.
      v('loopBars', 'loopLengthBars', NUM, { min: LOOP_MIN_BARS, max: LOOP_MAX_BARS, doc: 'Set how long the loop is.', ex: ['0.5', 'loops half a bar'],
        argDocs: { loopBars: `Bars: 0.25 is one beat in 4/4.\nRange: ${LOOP_MIN_BARS} ↔ ${LOOP_MAX_BARS}.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Default: 4.'] }),
      v('countIn', 'countInBars', INT, { min: 0, max: MAX_COUNT_IN_BARS, doc: 'Set how many bars of silence come before the clock runs.', ex: ['1', 'counts one bar in'],
        argDocs: { countIn: `Bars.\n0: none.\nRange: 0 ↔ ${MAX_COUNT_IN_BARS}, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.` },
        notes: ['Every component following the clock holds and is quiet until it ends.', 'Default: 0.'] }),
      v('clockOut', 'clockOut', BOOL, { toggle: true, doc: 'Send MIDI clock, start, stop and song position, so hardware follows the panel.',
        argDocs: { clockOut: `true: sent to \`clockDevice()\`, 24 clocks a quarter note.\nfalse: not sent.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: [TRANSPORT_FOLLOWING, 'Default: false.'] }),
      v('clockDevice', 'clockDevice', STR, { doc: 'Set which device the MIDI clock is sent to.', ex: ['"Drum Machine"', 'sends the clock to the device called Drum Machine'],
        argDocs: { clockDevice: 'The device\'s name, as the panel\'s devices list it.\n"": the panel\'s own device, when it has exactly one; otherwise none.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Default: "".'] }),
      v('runOnLoad', 'runOnLoad', BOOL, { toggle: true, doc: 'Start the clock as soon as the panel opens.',
        argDocs: { runOnLoad: `true: running from the start, as an exported plug-in is.\nfalse: stopped until played.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: false.'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the Transport be played and tapped by touch, or not.',
        argDocs: { editable: `true: its play button and tap tempo work.\nfalse: touches do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('showPosition', 'showPosition', BOOL, { toggle: true, doc: 'Show or hide the position, as bar.beat.tick, and the beat pulse.', notes: ['Default: shown.'] }),
      v('showTap', 'showTap', BOOL, { toggle: true, doc: 'Let a tap on the face set the tempo, or not.',
        notes: ['Not while following another clock.', 'Default: on.'] }),
    ],
  },
  {
    // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
    // "ce.components.panic"): what panicLayout.js and the preview's firePanic send.
    id: 'panic', section: 'Panic', prefix: 'panicSet', label: 'Panic',
    summary: 'Set what a Panic button sends when pressed: which channels, and whether it also resets the controllers, centres pitch bend and stops the panel\'s own notes.',
    verbs: [
      v('scope', 'scope', ENUM, { doc: 'Set whether the button silences every channel or one.', ex: ['"channel"', 'silences only the channel `channel()` sets'],
        argDocs: { scope: '"all": channels 1 to 16.\n"channel": the channel `channel()` sets.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Each channel is sent All Sound Off (CC 120), then All Notes Off (CC 123).', 'Default: "all".'] }),
      v('channel', 'channel', INT, { ...CHANNEL, doc: 'Set the channel the button silences while `scope()` is "channel".', ex: ['10', 'silences channel 10'],
        argDocs: { channel: 'MIDI channel.\nRange: 1 ↔ 16, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Only while `scope()` is "channel".', 'Default: 1.'] }),
      v('resetControllers', 'resetControllers', BOOL, { toggle: true, doc: 'Also send Reset All Controllers (CC 121), or not.',
        argDocs: { resetControllers: `true: sent, after the notes are stopped; a mod wheel or pedal left up is released.\nfalse: not sent.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('centreBend', 'centreBend', BOOL, { toggle: true, doc: 'Also put pitch bend back to the centre, or not.',
        argDocs: { centreBend: `true: a centred pitch bend is sent on each channel.\nfalse: not sent.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('clearLocal', 'clearLocal', BOOL, { toggle: true, doc: 'Also stop the notes this panel\'s own controls are playing, or not.',
        argDocs: { clearLocal: `true: the Chord Pads, Keyboards, Arps, Note Ribbons, Drum Pads and the panel's other note controls stop.\nfalse: they play on.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Default: true.'] }),
      v('label', 'label', STR, { doc: 'Set the text on the button.', ex: ['"ALL OFF"', 'writes ALL OFF on the button'],
        argDocs: { label: 'The text.\n"": PANIC.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['Default: "PANIC".'] }),
      v('editable', 'editable', BOOL, { toggle: true, doc: 'Let the button be pressed, or not.',
        argDocs: { editable: `true: a press sends it.\nfalse: presses do nothing.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['The panic key, Escape unless the panel sets another, works either way, and sends the most: every channel, every message.', 'Default: true.'] }),
      v('showSummary', 'showSummary', BOOL, { toggle: true, doc: 'Show or hide the line under the label that says what the button sends.',
        notes: ['Drawn only on a button 46 pixels tall or more.', 'Default: shown.'] }),
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
        argDocs: { control: SOURCE_BY_NAME },
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
    // Item 14 of the owner's review: "Screen" in the examples, as the LCD's, and read's texts for
    // what this family reads: its elements by name, and the layout showing.
    id: 'pixel', section: 'Pixel', prefix: 'pixel', label: 'Pixel Display', sample: 'Screen',
    summary: 'Draw on a pixel screen by named elements: what each is, shows and where, plus its layouts, backlight, brightness and animation.',
    // Its read takes a name, never a number: an element is reached by name (pixelElements.js).
    readIndexKind: STR,
    readIndex: ['For an element verb, such as "text": the element\'s name. Case-insensitive.', 'Left out: every element\'s, by name.',
      'Not an element of the display: rejected with a console error.'],
    readNotes: ['`read(target, "text")`: every element\'s, by name; `read(target, "text", "Title")`: one element\'s.',
      '`read(target, "layout")`: the number of the layout showing.'],
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
      // Which kinds draw each, and what the built-in font cannot (pixelFont.js), at the owner's word
      // (item 3 of the pixel's review). Stored on any kind, and not checked against the font: as the
      // LCD's zoneText and zoneLabel.
      v('text', 'elements', ELEM, { item: 'text', kind: STR, doc: 'Set the text of a "static" element, by its name.',
        ex: ['"Title", "INIT VOICE"', 'writes INIT VOICE in the element called Title'],
        argDocs: { text: ['The text.', 'Shown by "static", between its prefix and suffix.',
          'Shown by "name" while it has no label and no control, and by "edit" while its control has no text.',
          '"\\n": a new line while the element wraps; a blank otherwise.',
          `${PIXEL_NO_GLYPH} The built-in font has none for $ & ^ \` { | } ~ and letters with accents.`,
          'A number: written as text.', 'Left out: rejected with a console error.'].join('\n') } }),
      v('label', 'elements', ELEM, { item: 'label', kind: STR, doc: 'Set an element\'s caption, or the name a "name" element shows, by its name.',
        ex: ['"Cutoff", "CUT"', 'shows CUT under the element called Cutoff'],
        argDocs: { label: ['The text.', '"name": shown in place of its control\'s name; "": the control\'s name.',
          '"hbar", "vbar", "hslider", "vslider", "needle", "wave", "scope" and "adsr": a caption 7 pixels high, centred under it, or above it when there is no room below; "": none.',
          'Other kinds: not shown.', PIXEL_NO_GLYPH, 'A number: written as text.', 'Left out: rejected with a console error.'].join('\n') } }),
      // An element without `visible` is drawn, so it counts as shown (`absent`) and a toggle starts
      // from there: the first show() on one wrote the true it already was (item 1 of the owner's
      // review of the pixel). One without `blink` is steady, so read answers false, not nil.
      v('show', 'elements', ELEM, { item: 'visible', arg: 'on', kind: BOOL, absent: true, doc: 'Show or hide an element, by its name.',
        ex: ['"Title"', 'hides the element called Title if it is shown, and shows it if it is hidden'],
        argDocs: { on: `true: shown.\nfalse: hidden.\nLeft out: toggles.\n${OFF_RULE}` } }),
      // The rate is the renderer's (PixelDisplayRenderer's blinkPhase, the LCD cursor's): one clock
      // for every element, so they blink in step.
      v('blink', 'elements', ELEM, { item: 'blink', arg: 'on', kind: BOOL, absent: false, doc: 'Make an element blink, by its name.',
        ex: ['"Title"', 'makes the element called Title blink if it is steady, and steady if it blinks'],
        argDocs: { on: `true: blinks: 530 ms shown, 530 ms hidden.\nfalse: steady.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['Every blinking element blinks in step. A hidden element does not blink.'] }),
      // Position and size in GRID pixels, which is what the inspector's X/Y/W/H columns are. The
      // range is wider than any panel in both directions on purpose: sliding an element off the
      // left edge and back is how a script animates one in, and clamping that to 0 would park it.
      // What each draws is the renderer's (PixelDisplayRenderer.svelte, pixelFont.pixelTextMetrics),
      // written down at the owner's word (item 2 of the pixel's review).
      v('x', 'elements', ELEM, { item: 'x', kind: INT, min: -4096, max: 4096, doc: 'Set an element\'s left edge, by its name.',
        ex: ['"Title", 10', 'puts the element called Title 10 pixels from the screen\'s left edge'],
        argDocs: { x: `Pixels of the grid, from the screen's left edge; 0: at the edge.\n${PIXEL_RANGE(-4096)}` },
        notes: [PIXEL_OFF_SCREEN] }),
      v('y', 'elements', ELEM, { item: 'y', kind: INT, min: -4096, max: 4096, doc: 'Set an element\'s top edge, by its name.',
        ex: ['"Title", 20', 'puts the element called Title 20 pixels below the screen\'s top edge'],
        argDocs: { y: `Pixels of the grid, from the screen's top edge; 0: at the edge.\n${PIXEL_RANGE(-4096)}` },
        notes: [PIXEL_OFF_SCREEN] }),
      v('w', 'elements', ELEM, { item: 'w', kind: INT, min: 0, max: 4096, doc: 'Set an element\'s width, by its name.',
        ex: ['"Title", 64', 'makes the element called Title 64 pixels wide'],
        argDocs: { w: ['Pixels of the grid.', 'A text kind: the box its text is aligned and cut in; 0: as wide as the text.',
          'Any other kind: its width; drawn at least 1 wide, 4 for "anim".', PIXEL_RANGE(0)].join('\n') },
        notes: [PIXEL_TEXT_KINDS_NOTE, 'A text kind 0 wide is not wrapped or scrolled.'] }),
      v('h', 'elements', ELEM, { item: 'h', kind: INT, min: 0, max: 4096, doc: 'Set an element\'s height, by its name.',
        ex: ['"Title", 16', 'draws the text of the element called Title at twice the size'],
        argDocs: { h: ['Pixels of the grid.', 'A text kind: the size of its letters. The built-in font: 1× below 16, 2× from 16, 3× from 24, and on by 8. A custom font: by its glyph height.',
          'Any other kind: its height; drawn at least 1 high, 4 for "anim".', PIXEL_RANGE(0)].join('\n') },
        notes: [PIXEL_TEXT_KINDS_NOTE] }),
      // What an element is and what drives it, as the LCD's zoneKind and zoneSource (item 4 of the
      // owner's review of the pixel). They were left out as authoring choices; the LCD's zones got
      // both by name, and the two displays should not differ. `colour` stays out: styling, which
      // this file does not cross. So do "wave"'s and "adsr"'s further sources.
      v('kind', 'elements', ELEM, { item: 'kind', kind: ENUM, doc: 'Set what an element is, by its name.',
        ex: ['"Cutoff", "vbar"', 'makes the element called Cutoff a vertical bar'],
        notes: ['Its other settings are kept: its place, size, text and source.'] }),
      v('source', 'elements', ELEM, { item: 'sourceId', arg: 'control', kind: STR, link: true, doc: 'Link an element to a control, by its name.',
        ex: ['"Cutoff", "Resonance"', 'makes the element called Cutoff show the control called Resonance'],
        argDocs: { control: SOURCE_BY_NAME },
        notes: ['Shown by the text kinds but "static", "icon" and "clock"; drives the bars, sliders and "needle", "wave"\'s level and "scope". Not used by "adsr", "anim" or "bitmap".',
          '"wave"\'s cutoff, resonance, LFO and pitch, and "adsr"\'s four: set in the inspector.',
          '`read(target, "source", "Cutoff")` gives the control\'s name.'] }),

      // The on-screen editable field, as on the LCD: the buffer an `edit` element bound to '@edit'
      // shows. It was reachable by typing at the screen and by a device binding, and by nothing
      // else — so no script could read the patch name the user had just entered. A script's text is
      // stored as given, as the LCD's: the field's character set and length govern typing.
      v('editText', 'editText', STR, { doc: 'Set the text in the display\'s editable field.', ex: ['"INIT VOICE"', 'puts INIT VOICE in the field'],
        argDocs: { editText: 'The text in the field.\nShown by an "edit" element linked to "@edit".\nNot held to the field\'s characters or length: those apply to typing.\nA number: written as text.\nLeft out: rejected with a console error.' },
        notes: ['`read(target, "editText")` gives what is in the field, typed at the screen or set here.', 'Default: "INIT".'] }),
      // Items 5 to 12 of the owner's review of the pixel, the screen as a whole: what the canvas
      // (LcdGraphicCanvas.svelte) and the renderer (PixelDisplayRenderer.svelte) do with each.
      v('backlight', 'backlightOn', BOOL, { toggle: true, doc: 'Switch the backlight on or off.',
        argDocs: { backlight: `true: the backlight colour washes the screen.\nfalse: off.\nLeft out: toggles.\n${OFF_RULE}` },
        notes: ['While `backlightSource()` links a control, that control switches it.', 'Default: on.'] }),
      // Lit dots are drawn at 10% + 90% of the brightness, through the gamma: 0 is dim, not dark.
      v('brightness', 'brightness', NUM, { min: 0, max: 100, doc: 'Set how bright the lit pixels are.', ex: ['80', 'sets the brightness to 80'],
        argDocs: { brightness: 'How bright the lit pixels are.\nRange: 0 ↔ 100.\n0: the dimmest, still lit: a tenth as bright.\nShaped by `gamma()`.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['While `brightnessSource()` links a control, that control sets the brightness.', 'Default: 100.'] }),
      // Unlit dots at half the contrast, never below 3%; the backlight wash at 35% + 50% of it.
      v('contrast', 'contrast', NUM, { min: 0, max: 100, doc: 'Set the contrast: how visible the unlit pixels are.', ex: ['55', 'sets the contrast to 55'],
        argDocs: { contrast: 'How visible the unlit pixels are.\nAlso how strongly the backlight glows.\nRange: 0 ↔ 100.\n0: the unlit pixels at their faintest, still visible.\n100: the unlit pixels half opaque.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['The unlit pixels show only while `showGhost()` is on.', 'Default: 55.'] }),
      // The canvas reads the gamma as 0.2 to 4, and so does the inspector: 0.1 was stored and drawn
      // as 0.2 (item 6).
      v('gamma', 'gamma', NUM, { min: 0.2, max: 4, doc: 'Set the brightness curve.', ex: ['2', 'lifts the dimmer brightnesses'],
        argDocs: { gamma: 'The curve between `brightness()` and how bright the lit pixels are drawn.\n1: straight.\nAbove 1: the lower brightnesses lifted.\nBelow 1: lowered.\nRange: 0.2 ↔ 4.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 1.'] }),
      // A halo under each lit dot, its radius 1 + 1.6 × glow times the dot's, at 28% × glow of its brightness.
      v('glow', 'glow', NUM, { ...UNIT, doc: 'Set the glow: a halo around the lit pixels.', ex: ['0.5', 'gives the lit pixels a halo'],
        argDocs: { glow: 'How large and strong the halo is.\n0: none.\n1: the largest, 2.6 times a pixel\'s size.\nRange: 0 ↔ 1.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 0.'] }),
      // The animation layer behind the elements, the LCD's engine: its texts, as approved there.
      v('anim', 'animMode', ENUM, { doc: 'Set the animation behind the elements: off, a file, or a preset.', ex: ['"preset"', 'plays the chosen preset animation'],
        notes: ['The file is chosen in the inspector.', 'Default: "off".'] }),
      v('animPreset', 'animPreset', ENUM, { doc: 'Choose the preset animation.', ex: ['"rain"', 'plays the rain animation'],
        notes: ['Plays while `anim()` is "preset".', 'Default: "wave".'] }),
      v('animSpeed', 'animSpeed', NUM, { min: 0.1, max: 5, doc: 'Set the speed of the preset animation, as a multiple of its normal speed.', ex: ['2', 'plays the preset animation at twice its normal speed'],
        argDocs: { animSpeed: 'Speed factor.\nRange: 0.1 ↔ 5.\n1: normal.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 1.'] }),
      v('animLoop', 'animLoop', BOOL, { toggle: true, doc: 'Switch looping of the animation on or off.',
        argDocs: { animLoop: `Left out: toggles.\nfalse: the last frame holds.\n${OFF_RULE}` },
        notes: ['Default: on.'] }),
      v('animFps', 'animFps', NUM, { min: 1, max: 120, doc: 'Set the frame rate of a sprite-sheet animation.', ex: ['24', 'plays the sheet at 24 frames per second'],
        argDocs: { animFps: 'Frames per second.\nOnly for a sprite sheet: a GIF or APNG plays at its own speed.\nRange: 1 ↔ 120.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['Default: 12.'] }),
      // The renderer's CSS transition on a change of layout (item 9); the inspector's 0 to 2000 ms,
      // where a script could set 5000.
      v('layoutTransition', 'layoutTransition', ENUM, { doc: 'Set how a layout comes in when it is shown.', ex: ['"fade"', 'fades each layout in'],
        argDocs: { layoutTransition: '"none": at once.\n"fade": faded in.\n"slide": faded in, sliding from the right.\nCase-insensitive.\nInvalid: rejected with a console error.' },
        notes: ['Over `transitionMs()`.', 'Default: "none".'] }),
      v('transitionMs', 'transitionMs', INT, { min: 0, max: 2000, doc: 'Set how long a layout takes to come in.', ex: ['500', 'brings each layout in over half a second'],
        argDocs: { transitionMs: 'Milliseconds.\n0: at once.\nRange: 0 ↔ 2000, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.' },
        notes: ['With `layoutTransition()` "none": no effect.', 'Default: 250.'] }),
      v('brightnessSource', 'brightnessSourceId', LINK, { sourceKind: 'range', doc: 'Name the control that drives the brightness.',
        ex: ['"Cutoff"', 'makes the control called Cutoff drive the brightness'], linkRule: 'Its range sets 0 to 100.' }),
      v('backlightSource', 'backlightSourceId', LINK, { sourceKind: 'any', doc: 'Name the control that drives the backlight.',
        ex: ['"Light"', 'makes the control called Light switch the backlight'], linkRule: 'On while the control is on, or past halfway.' }),
      v('layout', 'layouts', LAYOUT, { flat: 'its elements', doc: 'Show one of the display\'s layouts.', ex: ['2', 'shows layout 2'],
        notes: ['Shown until an overlay or the Selector changes it.'] }),
      // The four overlays, declared as the LCD's are (item 12). The grid is the editor's only.
      v('showGlass', 'showGlass', BOOL, { toggle: true, doc: 'Show or hide the glass: a sheen across the screen.',
        notes: ['Its tint is set in the inspector, under Screen colours ▸ Glass. Default: shown.'] }),
      v('showGhost', 'showGhost', BOOL, { toggle: true, doc: 'Show or hide the ghost: the faint unlit pixels behind the elements.',
        notes: ['How faint is set by `contrast()`. Default: shown.'] }),
      v('showScanlines', 'showScanlines', BOOL, { toggle: true, doc: 'Show or hide the scanlines: thin horizontal lines across the screen.',
        notes: ['Default: hidden.'] }),
      v('showGrid', 'showGrid', BOOL, { toggle: true, doc: 'Show or hide the design grid: lines every few pixels, in the editor only.',
        notes: ['Not drawn in the preview or an exported plug-in.', 'Its spacing is the inspector\'s Snap: 8 pixels while that is 0.', 'Default: hidden.'] }),
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
    // What read takes and gives, where the family says (the arp's).
    readIndex: fam.readIndex,
    readNotes: fam.readNotes,
    readIndexKind: fam.readIndexKind,
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
  const value = verb.readValue && given !== undefined && given !== null ? verb.readValue(given, c && typeof c === 'object' ? c : {}) : given;
  return { spec, value };
}

/** An item verb's range for element `at`, where it depends on the element (an envelope point lies
 *  between its neighbours, `itemRange`); otherwise the verb's own. */
function itemSpec(verb, c, at) {
  return verb.itemRange ? { ...verb, ...verb.itemRange(c && typeof c === 'object' ? c : {}, at) } : verb;
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
      const patch = stored === c[verb.f] ? {} : { [verb.f]: stored };
      // What else the setting writes, as the inspector writes it with it (the envelope's preset seeds
      // its shape); only what differs, so the same preset on the same shape is already that way.
      for (const [field, value2] of Object.entries(verb.alsoWrites?.(next, c) ?? {})) {
        if (JSON.stringify(value2) !== JSON.stringify(c[field])) patch[field] = value2;
      }
      return patch;
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
      const next = coerce(verb.kind, b, itemSpec(verb, c, at), current);
      // A value the component cannot use as written (a glyph it cannot draw) is refused, not stored.
      if (next === null || next === current || verb.refuseValue?.(next)) return {};
      const written = list.map((x, i) => (i === at ? { ...row, [verb.item]: next } : x));
      // What else the change moves, as a drag moves it: a Constraint's other members keep its rule.
      return { [verb.f]: verb.solve ? verb.solve(written, c, at, next) : written };
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
    case LINE: return lcdLines(verb) ? ['at'] : (verb.clear ? [] : ['index']);
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
        return valueOf(verb.kind, b);
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
  else if (verb.k === ITEM && (verb.kind === NUM || verb.kind === INT)) {
    const length = verb.itemRange ? itemListLength(verb, cfg ?? {}) : null;
    const at = length === null ? null : indexOf(args[0], length);
    given.push([names[1], args[1], null, at === null ? null : itemSpec(verb, cfg ?? {}, at)]);
  }
  else if (verb.k === CELL && !verb.clear) given.push(verb.grid ? ['amount', args[2]] : [names[1], args[1]]);
  else if (verb.k === XY) given.push([names[0], args[0], verb.fx], [names[1], args[1], verb.fy]);
  // An element's number (pixel.x and the rest) was clamped without a word (item 2 of the owner's
  // review of the pixel). A name the display has not got is refused, and used nothing.
  else if (verb.k === ELEM && (verb.kind === NUM || verb.kind === INT)) {
    if (cfg && !elementSites(cfg, args[0], verb.list ?? 'elements').length) return null;
    given.push([names[1], args[1]]);
  }
  for (const [name, value, field, itemRange] of given) {
    if (value === undefined || value === null || typeof value === 'boolean') continue;
    const n = Number(value);
    if (!isFinite_(n)) continue;
    const spec = itemRange ?? (field ? axisRange(verb, field, cfg) : scalarCall(verb, cfg, value).spec);
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
    case LINE: return lcdLines(verb) ? (verb.clear ? ['at'] : ['at', 'text']) : (verb.clear ? [] : ['index', 'text']);
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
    case READ: return [STR, verb.readIndexKind ?? INT];
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
  if (verb.k === READ && verb.readNotes) return [all, ...verb.readNotes];
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
    // A link that takes one kind of control names it: the arp's link reads back the Chord Pad's name.
    case LINK: return [...own, ...RETURNS_SET, '`read(target, "' + verb.v + '")` gives the ' + (verb.sourceKind === 'chordPad' ? 'Chord Pad' : 'control') + '\'s name.'];
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
      if (name === 'index') return indexLines(noun, `${noun}s`);
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
      if (name === 'name') return 'The element\'s name, as given in the element table. Case-insensitive.\nEvery element with that name, on every layout.\nNot an element of the display: rejected with a console error.';
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
      if (verb.readIndex) return verb.readIndex.join('\n');
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
