// handWrittenVerbs.js — what the hand-written component verbs (the Zone Splitter, the Phrase
// Sequencer, the Phrase Recorder, the Harmoniser and the Setlist) say of an argument they cannot
// use, in one place: the runtime (panelRuntime.js) says it when it refuses the call, and the script
// editor's Values tab says it in that argument's row, in the same words.
//
// The generated verbs say theirs from componentVerbs.js (componentRefusalReason). These took an
// argument they could not use and said nothing useful about it:
//   · a zone that is not one was logged as though it had been set, and nothing changed; an unknown
//     split preset replaced every zone with one whole-keyboard zone;
//   · the Phrase Sequencer said "nothing to change" for a cell off its grid, an unknown seed or
//     direction, and a key that is not a pitch class;
//   · the Phrase Recorder, the Harmoniser and the Setlist said "refused, nothing changed" for an
//     unknown word, a slot with no take in it, a degree past the scale or a scene they do not have,
//     without saying which there are.
//
// A zone, a phrase cell, a slot, a degree and a scene are all counted from 1, as the panel labels
// them. A zone and a phrase cell were counted from 0, as their reducers index them, so the zone 1 a
// script named was the one the panel labels "Zone 2"; reducerArgs is now the one place a script's
// number becomes the reducer's index.

import { scriptZoneIndex, SPLIT_PRESETS } from '../utils/splitZoneLayout.js';
import { MAX_SLOTS, RECORDER_SOURCES, isRecordingState } from '../utils/noteRecorderLayout.js';
import { MIN_STEPS, MAX_STEPS, MIN_ROWS, MAX_ROWS, PHRASE_SEEDS, PHRASE_DIRECTIONS } from '../utils/phraseLayout.js';
import { HARMONY_MODES, VOICINGS, OUT_OF_KEY, VOICE_LEADING, MEMORY_PRESETS } from '../utils/harmoniserLayout.js';
import { setlistScenes } from '../utils/setlistLayout.js';
import { SCALES } from '../utils/chordPadLayout.js';
import { SCALE_NAMES, pitchClassOf, noteNumberOf } from './musicTheory.js';
import { realNumber } from './scriptColours.js';
import { shownValue } from './shownValue.js';
import { listWord } from '../utils/wordLists.js';

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const quoted = (names) => names.map((n) => `"${n}"`).join(', ');

// Each verb: its family as the console names it, the section it reads, the action its reducer takes,
// the arguments it hands that reducer (built from the call's own; the runtime builds them here
// too), and the kind of each argument the Values tab reads: an `index` (a zone, a cell, a slot, a
// degree, a scene) or a `word` from a closed list (words names it).
export const HAND_WRITTEN = {
  splitPreset: { family: 'split', section: 'SplitZone', action: 'preset', args: (preset, lowNote, highNote) => ({ preset: asWord('split preset', preset), lowNote, highNote }), kinds: ['word'] },
  splitMute: { family: 'split', section: 'SplitZone', action: 'mute', args: (zone, enabled) => ({ zone, enabled: enabled !== false }), kinds: ['index'] },
  splitChannel: { family: 'split', section: 'SplitZone', action: 'channel', args: (zone, channel) => ({ zone, channel }), kinds: ['index'] },
  splitTranspose: { family: 'split', section: 'SplitZone', action: 'transpose', args: (zone, semitones) => ({ zone, transpose: semitones }), kinds: ['index'] },
  splitPoint: { family: 'split', section: 'SplitZone', action: 'splitPoint', args: (zone, note) => ({ zone, note }), kinds: ['index'] },
  phraseSeed: { family: 'phrase', section: 'Phrase', action: 'seed', args: (seed) => ({ seed: asWord('phrase seed', seed) }), kinds: ['word'] },
  phraseKey: { family: 'phrase', section: 'Phrase', action: 'key', args: (key) => ({ key: keyOf(key) }), kinds: ['word'] },
  phraseDirection: { family: 'phrase', section: 'Phrase', action: 'direction', args: (direction) => ({ direction: asWord('phrase direction', direction) }), kinds: ['word'] },
  phraseCell: { family: 'phrase', section: 'Phrase', action: 'cell', args: (step, row, on) => ({ step, row, on }), kinds: ['index', 'index'] },
  recorderSource: { family: 'recorder', section: 'Recorder', action: 'source', args: (source) => ({ source: asWord('recorder source', source) }), kinds: ['word'] },
  recorderStore: { family: 'recorder', section: 'Recorder', action: 'store', args: (slot, name) => ({ slot, name }), kinds: ['index'] },
  recorderLoad: { family: 'recorder', section: 'Recorder', action: 'load', args: (slot) => ({ slot }), kinds: ['index'] },
  harmonyMode: { family: 'harmoniser', section: 'Harmoniser', action: 'mode', args: (mode) => ({ mode: asWord('harmoniser mode', mode) }), kinds: ['word'] },
  harmonyKey: { family: 'harmoniser', section: 'Harmoniser', action: 'key', args: (key) => ({ key: keyOf(key) }), kinds: ['word'] },
  harmonyShape: { family: 'harmoniser', section: 'Harmoniser', action: 'shape', args: (shape) => ({ shape: asWord('harmoniser shape', shape), preset: asWord('harmoniser shape', shape) }), kinds: ['word'] },
  harmonyVoicing: { family: 'harmoniser', section: 'Harmoniser', action: 'voicing', args: (voicing) => ({ voicing: asWord('harmoniser voicing', voicing) }), kinds: ['word'] },
  harmonyOutOfKey: { family: 'harmoniser', section: 'Harmoniser', action: 'outOfKey', args: (mode) => ({ outOfKey: asWord('harmoniser outOfKey', mode) }), kinds: ['word'] },
  harmonyVoiceLeading: { family: 'harmoniser', section: 'Harmoniser', action: 'voiceLeading', args: (mode) => ({ voiceLeading: asWord('harmoniser voiceLeading', mode) }), kinds: ['word'] },
  harmonyDegree: { family: 'harmoniser', section: 'Harmoniser', action: 'degree', args: (degree, chord) => ({ degree, chord }), kinds: ['index', 'word'] },
  setlistGoto: { family: 'setlist', section: 'Setlist', action: 'goto', args: (scene) => ({ scene }), kinds: ['index'] },
  setlistEnable: { family: 'setlist', section: 'Setlist', action: 'enable', args: (scene, enabled) => ({ scene, enabled: enabled !== false }), kinds: ['index'] },
};

// The closed lists, by family and action: the words a reducer takes, nothing else.
const WORDS = {
  'split preset': () => SPLIT_PRESETS.map((p) => p.id),
  'phrase seed': () => PHRASE_SEEDS.map((s) => s.id),
  'phrase direction': () => PHRASE_DIRECTIONS,
  'recorder source': () => RECORDER_SOURCES,
  'harmoniser mode': () => HARMONY_MODES,
  'harmoniser voicing': () => VOICINGS,
  'harmoniser outOfKey': () => OUT_OF_KEY,
  'harmoniser voiceLeading': () => VOICE_LEADING,
  'harmoniser shape': () => MEMORY_PRESETS.map((p) => p.id),
};
const WORD_ARG = { preset: 'preset', seed: 'seed', direction: 'direction', source: 'source', mode: 'mode',
  voicing: 'voicing', outOfKey: 'outOfKey', voiceLeading: 'voiceLeading', shape: 'shape' };

/** A word from one of those lists in any case (utils/wordLists.js), as the list spells it, so the
 *  reducer and the refusal see "up" for "Up"; anything else as given, for the refusal to name. A
 *  zone's or a scene's name is the author's, and is matched as written. */
function asWord(key, value) {
  return typeof value === 'string' ? listWord(WORDS[key](), value) ?? value : value;
}

/** The words a hand-written verb's argument takes, or null when it takes no closed list. */
export function handWrittenWords(memberId) {
  const spec = HAND_WRITTEN[memberId];
  return spec ? WORDS[`${spec.family} ${spec.action}`]?.() ?? null : null;
}

/** The Phrase Sequencer's grid, as its reducer reads it: { steps, rows }. */
export function phraseGrid(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return { steps: clampInt(c.steps ?? 16, MIN_STEPS, MAX_STEPS, 16), rows: clampInt(c.rows ?? 8, MIN_ROWS, MAX_ROWS, 8) };
}

/** The Zone Splitter's zone `which` (its number from 1, or its name), or why there is none. */
export function splitZoneRefusal(zones, which) {
  const list = Array.isArray(zones) ? zones : [];
  if (scriptZoneIndex(list, which) >= 0) return null;
  if (!list.length) return 'It has no zones.';
  const names = list.map((z, i) => String(z?.label ?? `Zone ${i + 1}`));
  return `There is no zone ${shownValue(which)}: a zone is its number from 1 to ${list.length}, or its name, ${quoted(names)}.`;
}

function phraseCellRefusal(cfg, step, row) {
  const { steps, rows } = phraseGrid(cfg);
  const off = (value, count, word) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= count ? null : `There is no ${word} ${shownValue(value)}: the ${word}s are 1 to ${count}.`;
  };
  const s = off(step, steps, 'step');
  if (s) return { at: 0, reason: s };
  const r = off(row, rows, 'row');
  return r ? { at: 1, reason: r } : null;
}

function recorderSlotRefusal(cfg, action, slot) {
  if (isRecordingState(String(cfg.state))) return 'It is recording; a take is stored or loaded once it stops.';
  const n = Math.round(Number(slot));
  if (action === 'store') {
    return Number.isFinite(n) && n >= 1 && n <= MAX_SLOTS ? null : `There is no slot ${shownValue(slot)}: the slots are 1 to ${MAX_SLOTS}.`;
  }
  const held = Math.min(Array.isArray(cfg.slots) ? cfg.slots.length : 0, MAX_SLOTS);
  return Number.isFinite(n) && n >= 1 && n <= held ? null
    : `There is no take in slot ${shownValue(slot)}: ${held ? `slots 1 to ${held} hold takes` : 'no slot holds one yet'}.`;
}

const KEY_REASON = 'A key is a note\'s name, such as "F#", in any case, or a number round the octave, 0 being C.';
/** A key as the arp reads one (its review, item 8): a note's name in any case, or a number round the
 *  octave; given back as it came when it is neither, for the refusal to name it. */
const keyOf = (key) => pitchClassOf(key) ?? key;
const NOTE_REASON = 'A note is a MIDI number from 0 to 127, or a name such as "C4".';
/** A note as the Zone Splitter takes one: a number, or text that is one, or a note's name; else undefined. */
function splitNote(v) {
  if (typeof v === 'boolean' || v === null || v === undefined) return undefined;
  const n = realNumber(v);
  if (n !== undefined) return Math.round(n);
  return typeof v === 'string' ? noteNumberOf(v) : undefined;
}
/** A preset's bottom and top notes, given: notes, or why not. They were stored as given: "x" as no
 *  note at all, 200 past the keyboard. */
function splitPresetNotesRefusal(a) {
  if (a.lowNote !== undefined && a.lowNote !== null && splitNote(a.lowNote) === undefined) return { at: 1, reason: NOTE_REASON };
  if (a.highNote !== undefined && a.highNote !== null && splitNote(a.highNote) === undefined) return { at: 2, reason: NOTE_REASON };
  return null;
}

// The take-editing actions refuse while recording (the live take is committed when it stops) and
// with no take to edit; they said "refused, nothing changed" and not why.
const TAKE_ACTIONS = ['clear', 'undo', 'quantize', 'nudge', 'shift'];
function recorderTakeRefusal(cfg) {
  if (isRecordingState(String(cfg.state))) return 'It is recording; the take can be changed once it stops.';
  const events = Array.isArray(cfg.take?.events) ? cfg.take.events : [];
  return events.length ? null : 'It has no take: record one first.';
}

/** recorder.quantize's grid, scale and key, read; or why not. A grid as text ("1/16") was 1 division,
 *  a scale it does not have no scale, and a key's name C, each without a word. */
export function recorderQuantizeArgs({ grid, strength, scale, key }) {
  const g = grid === undefined || grid === null ? undefined : realNumberOf(grid);
  if (g === null) return { reason: 'A grid is a number of divisions per loop, from 1 to 64: 16 over one bar is sixteenth notes.' };
  const word = scale === undefined || scale === null ? undefined : (listWord(SCALE_NAMES, String(scale)) ?? null);
  if (word === null) return { reason: `One of: ${SCALE_NAMES.join(', ')}.` };
  const pc = key === undefined || key === null ? undefined : pitchClassOf(key);
  if (pc === null) return { reason: KEY_REASON };
  return { args: { grid: g, strength, scale: word, key: pc } };
}
const realNumberOf = (v) => (typeof v === 'boolean' ? null : (realNumber(v) ?? null));

function sceneRefusal(cfg, scene) {
  const scenes = setlistScenes({ _children: { Setlist: cfg } });
  if (!scenes.length) return 'It has no scenes.';
  const byNumber = scene !== undefined && scene !== null && Number.isFinite(Number(scene));
  const at = byNumber ? Math.round(Number(scene)) - 1 : scenes.findIndex((s) => s.name === String(scene ?? '') || s.id === String(scene ?? ''));
  if (at >= 0 && at < scenes.length) return null;
  return `There is no scene ${shownValue(scene)}: a scene is its number from 1 to ${scenes.length}, or its name, ${quoted(scenes.map((s) => s.name))}.`;
}

/** Whether a hand-written verb's `args` (as it builds them) are usable: null, or { at, reason } with
 *  `at` the call argument after the control that the reason is about. */
export function handWrittenRefusal(family, action, cfg, args) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const a = args && typeof args === 'object' ? args : {};
  const word = WORDS[`${family} ${action}`];
  if (word) {
    const value = a[WORD_ARG[action]];
    if (family === 'harmoniser' && action === 'shape' && Array.isArray(value)) return null;
    const list = word();
    if (list.includes(value)) return family === 'split' && action === 'preset' ? splitPresetNotesRefusal(a) : null;
    return { at: 0, reason: `One of: ${list.join(', ')}${family === 'harmoniser' && action === 'shape' ? ', or a list of intervals in semitones' : ''}.` };
  }
  if (action === 'key' && (family === 'phrase' || family === 'harmoniser')) {
    return pitchClassOf(a.key) !== null ? null : { at: 0, reason: KEY_REASON };
  }
  if (family === 'split') {
    const r = splitZoneRefusal(c.zones, a.zone);
    if (r) return { at: 0, reason: r };
    // A number that is not one was taken as the bottom of its range, without a word: a transpose of
    // "x" was -48, a split point of "x" the zone's lowest note (the Zone Splitter's review).
    if (action === 'channel' && realNumber(a.channel) === undefined) return { at: 1, reason: 'A channel is a number from 1 to 16.' };
    if (action === 'transpose' && realNumber(a.transpose) === undefined) return { at: 1, reason: 'A transpose is a number of semitones: 12 is an octave up, -12 down.' };
    if (action === 'splitPoint' && splitNote(a.note) === undefined) return { at: 1, reason: NOTE_REASON };
    return null;
  }
  if (family === 'phrase' && action === 'cell') return phraseCellRefusal(c, a.step, a.row);
  if (family === 'recorder' && TAKE_ACTIONS.includes(action)) {
    const r = recorderTakeRefusal(c);
    return r ? { at: 0, reason: r } : null;
  }
  if (family === 'recorder' && (action === 'store' || action === 'load')) {
    const r = recorderSlotRefusal(c, action, a.slot);
    return r ? { at: 0, reason: r } : null;
  }
  if (family === 'harmoniser' && action === 'degree') {
    const degrees = (SCALES[String(c.scale ?? 'major')] ?? SCALES.major).length;
    const d = Number(a.degree);
    if (!Number.isFinite(d) || Math.round(d) < 1 || Math.round(d) > degrees) {
      return { at: 0, reason: `There is no degree ${shownValue(a.degree)}: the scale has ${degrees}, 1 to ${degrees}.` };
    }
    const ok = a.chord === null || a.chord === 'clear' || (Array.isArray(a.chord) && a.chord.some((n) => Number.isFinite(Number(n))));
    return ok ? null : { at: 1, reason: 'A chord is a list of intervals in semitones, such as { 0, 4, 7 }, or "clear" to take the override away.' };
  }
  // At either end of the set, with wrap off, next and prev were refused and said nothing more.
  if (family === 'setlist' && (action === 'next' || action === 'prev')) {
    if (!setlistScenes({ _children: { Setlist: c } }).length) return { at: 0, reason: 'It has no scenes.' };
    return { at: 0, reason: action === 'next' ? 'It is at the last scene it plays, and `wrap()` is off.' : 'It is at the first scene it plays, and `wrap()` is off.' };
  }
  if (family === 'setlist' && (action === 'goto' || action === 'enable')) {
    const r = sceneRefusal(c, a.scene);
    return r ? { at: 0, reason: r } : null;
  }
  // A number a command needs that is not one, or a scale there is none of: refused, and now said why
  // (the hand-written families' reviews). It said "refused, nothing changed" and no more.
  for (const [key, why] of NUMBER_ARGS) {
    if (key in a && (typeof a[key] === 'boolean' || realNumber(a[key]) === undefined)) return { at: 0, reason: why };
  }
  if ('scale' in a && a.scale !== undefined && !listWord(SCALE_NAMES, String(a.scale ?? ''))) return { at: 0, reason: `One of: ${SCALE_NAMES.join(', ')}.` };
  return null;
}
const NUMBER_ARGS = [
  ['channel', 'A channel is a number from 1 to 16.'], ['size', 'A size is a number of notes, from 2 to 6.'],
  ['ms', 'A time is a number of milliseconds.'], ['transpose', 'A transpose is a number of semitones: 12 is an octave up, -12 down.'],
  ['semitones', 'Semitones are a number: 12 is an octave up, -12 down.'], ['bars', 'Bars are a number.'],
  ['inversion', 'An inversion is a number: 0 is root position.'], ['octave', 'An octave is a number: 1 is an octave up, -1 down.'],
  ['by', 'A nudge is a part of the loop, a number: 0.01 is a hundredth later.'],
];

/** A hand-written verb's `args`, once handWrittenRefusal has passed them, as its reducer indexes
 *  them: a script's zone and phrase cell count from 1, and the reducers' from 0. */
export function reducerArgs(family, action, cfg, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (family === 'split' && action === 'preset') {
    // Read as notes, held to the keyboard, lowest first.
    const lo = a.lowNote === undefined || a.lowNote === null ? 36 : Math.min(127, Math.max(0, splitNote(a.lowNote)));
    const hi = a.highNote === undefined || a.highNote === null ? 96 : Math.min(127, Math.max(0, splitNote(a.highNote)));
    return { ...a, lowNote: Math.min(lo, hi), highNote: Math.max(lo, hi) };
  }
  if (family === 'split' && 'zone' in a) {
    const zone = scriptZoneIndex(cfg?.zones, a.zone);
    if (action === 'channel') return { ...a, zone, channel: realNumber(a.channel) };
    if (action === 'transpose') return { ...a, zone, transpose: realNumber(a.transpose) };
    if (action === 'splitPoint') return { ...a, zone, note: splitNote(a.note) };
    return { ...a, zone };
  }
  if (family === 'phrase' && action === 'cell') return { ...a, step: Math.round(Number(a.step)) - 1, row: Math.round(Number(a.row)) - 1 };
  return a;
}

// The hand-written families' read(field): the field names their section has, in any case, and what
// read says of one it has not (panelRuntime's sectionRead).
export const READ_FIELDS = {
  splitRead: { section: 'SplitZone', label: 'split' }, phraseRead: { section: 'Phrase', label: 'phrase' },
  recorderRead: { section: 'Recorder', label: 'recorder' }, harmonyRead: { section: 'Harmoniser', label: 'harmony' },
  setlistRead: { section: 'Setlist', label: 'setlist' },
};

/** The fields read(field) reads of a section, sorted as its refusal lists them. */
export function sectionFields(cfg) {
  return Object.keys(cfg && typeof cfg === 'object' ? cfg : {}).filter((k) => !k.startsWith('_')).sort();
}

/** What read says of a field the section has not, or null. */
export function sectionFieldRefusal(label, cfg, field) {
  const name = String(field);
  const key = Object.keys(cfg && typeof cfg === 'object' ? cfg : {}).find((k) => k.toLowerCase() === name.toLowerCase());
  if (key !== undefined && !key.startsWith('_')) return null;
  return `${label}.read: "${field}" is not a field of this component. One of: ${sectionFields(cfg).join(', ')}.`;
}

/** A hand-written verb's refusal line, as the runtime writes it: the call, then why. */
export function sectionRefusalLine(family, target, action, args, reason) {
  return `${family} ${target}: ${action} ${JSON.stringify(args ?? {})} — refused, nothing changed${reason ? `. ${reason}` : ''}`;
}
