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
import { shownValue } from './shownValue.js';

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
  splitPreset: { family: 'split', section: 'SplitZone', action: 'preset', args: (preset, lowNote, highNote) => ({ preset, lowNote, highNote }), kinds: ['word'] },
  splitMute: { family: 'split', section: 'SplitZone', action: 'mute', args: (zone, enabled) => ({ zone, enabled: enabled !== false }), kinds: ['index'] },
  splitChannel: { family: 'split', section: 'SplitZone', action: 'channel', args: (zone, channel) => ({ zone, channel }), kinds: ['index'] },
  splitTranspose: { family: 'split', section: 'SplitZone', action: 'transpose', args: (zone, semitones) => ({ zone, transpose: semitones }), kinds: ['index'] },
  splitPoint: { family: 'split', section: 'SplitZone', action: 'splitPoint', args: (zone, note) => ({ zone, note }), kinds: ['index'] },
  phraseSeed: { family: 'phrase', section: 'Phrase', action: 'seed', args: (seed) => ({ seed }), kinds: ['word'] },
  phraseKey: { family: 'phrase', section: 'Phrase', action: 'key', args: (key) => ({ key }), kinds: ['word'] },
  phraseDirection: { family: 'phrase', section: 'Phrase', action: 'direction', args: (direction) => ({ direction }), kinds: ['word'] },
  phraseCell: { family: 'phrase', section: 'Phrase', action: 'cell', args: (step, row, on) => ({ step, row, on }), kinds: ['index', 'index'] },
  recorderSource: { family: 'recorder', section: 'Recorder', action: 'source', args: (source) => ({ source }), kinds: ['word'] },
  recorderStore: { family: 'recorder', section: 'Recorder', action: 'store', args: (slot, name) => ({ slot, name }), kinds: ['index'] },
  recorderLoad: { family: 'recorder', section: 'Recorder', action: 'load', args: (slot) => ({ slot }), kinds: ['index'] },
  harmonyMode: { family: 'harmoniser', section: 'Harmoniser', action: 'mode', args: (mode) => ({ mode }), kinds: ['word'] },
  harmonyKey: { family: 'harmoniser', section: 'Harmoniser', action: 'key', args: (key) => ({ key }), kinds: ['word'] },
  harmonyShape: { family: 'harmoniser', section: 'Harmoniser', action: 'shape', args: (shape) => ({ shape, preset: shape }), kinds: ['word'] },
  harmonyVoicing: { family: 'harmoniser', section: 'Harmoniser', action: 'voicing', args: (voicing) => ({ voicing }), kinds: ['word'] },
  harmonyOutOfKey: { family: 'harmoniser', section: 'Harmoniser', action: 'outOfKey', args: (mode) => ({ outOfKey: mode }), kinds: ['word'] },
  harmonyVoiceLeading: { family: 'harmoniser', section: 'Harmoniser', action: 'voiceLeading', args: (mode) => ({ voiceLeading: mode }), kinds: ['word'] },
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
    if (list.includes(value)) return null;
    return { at: 0, reason: `One of: ${list.join(', ')}${family === 'harmoniser' && action === 'shape' ? ', or a list of intervals in semitones' : ''}.` };
  }
  if (action === 'key' && (family === 'phrase' || family === 'harmoniser')) {
    return Number.isFinite(Number(a.key)) && a.key !== null && a.key !== '' && typeof a.key !== 'boolean'
      ? null : { at: 0, reason: 'A key is a pitch class, a number from 0 to 11 where 0 is C.' };
  }
  if (family === 'split') { const r = splitZoneRefusal(c.zones, a.zone); return r ? { at: 0, reason: r } : null; }
  if (family === 'phrase' && action === 'cell') return phraseCellRefusal(c, a.step, a.row);
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
  if (family === 'setlist' && (action === 'goto' || action === 'enable')) {
    const r = sceneRefusal(c, a.scene);
    return r ? { at: 0, reason: r } : null;
  }
  return null;
}

/** A hand-written verb's `args`, once handWrittenRefusal has passed them, as its reducer indexes
 *  them: a script's zone and phrase cell count from 1, and the reducers' from 0. */
export function reducerArgs(family, action, cfg, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (family === 'split' && 'zone' in a) return { ...a, zone: scriptZoneIndex(cfg?.zones, a.zone) };
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
