// componentIndexWords.js — what the hand-written component verbs say of an index that addresses
// nothing, in one place: the runtime (panelRuntime.js) says it when it refuses the call, and the
// script editor's Values tab says it in the row of the index, in the same words.
//
// The generated verbs say theirs from componentVerbs.js (componentRefusalReason). These are the
// Zone Splitter's zones, the Phrase Sequencer's cells and the Phrase Recorder's slots, which their
// reducers took and silently ignored: a zone that is not one was logged as though it had been set,
// a cell off the grid said "nothing to change", and a slot that holds no take said only "refused".
//
// A zone and a cell are counted from 0, and a slot from 1, as each reducer always counted them; the
// sentences say so, because the panel labels its zones "Zone 1", "Zone 2", and the zone 1 a script
// names is the second of them.

import { zoneIndexOf } from '../utils/splitZoneLayout.js';
import { MAX_SLOTS, isRecordingState } from '../utils/noteRecorderLayout.js';
import { MIN_STEPS, MAX_STEPS, MIN_ROWS, MAX_ROWS } from '../utils/phraseLayout.js';
import { shownValue } from './shownValue.js';

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const quoted = (names) => names.map((n) => `"${n}"`).join(', ');

/** The Zone Splitter's zone `which` (its number from 0, or its name), or why there is none. */
export function splitZoneRefusal(zones, which) {
  const list = Array.isArray(zones) ? zones : [];
  if (zoneIndexOf(list, which) >= 0) return null;
  if (!list.length) return 'It has no zones.';
  const names = list.map((z, i) => String(z?.label ?? `Zone ${i + 1}`));
  return `There is no zone ${shownValue(which)}: a zone is its number counted from 0, here 0 to ${list.length - 1}, `
    + `or its name, ${quoted(names)}.`;
}

/** The Phrase Sequencer's grid, as its reducer reads it: { steps, rows }. */
export function phraseGrid(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return { steps: clampInt(c.steps ?? 16, MIN_STEPS, MAX_STEPS, 16), rows: clampInt(c.rows ?? 8, MIN_ROWS, MAX_ROWS, 8) };
}

/** One cell of the Phrase Sequencer's grid, or why it is off the grid. */
export function phraseCellRefusal(cfg, step, row) {
  const { steps, rows } = phraseGrid(cfg);
  const off = (value, count, word) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 && n < count ? null
      : `There is no ${word} ${shownValue(value)}: the ${word}s are 0 to ${count - 1}, counted from 0.`;
  };
  return off(step, steps, 'step') ?? off(row, rows, 'row');
}

/** A Phrase Recorder slot to store into or load from, counted from 1, or why it cannot be. */
export function recorderSlotRefusal(cfg, action, slot) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  if (isRecordingState(String(c.state))) return 'It is recording; a take is stored or loaded once it stops.';
  const n = Math.round(Number(slot));
  if (action === 'store') {
    return Number.isFinite(n) && n >= 1 && n <= MAX_SLOTS ? null
      : `There is no slot ${shownValue(slot)}: the slots are 1 to ${MAX_SLOTS}.`;
  }
  const held = Math.min(Array.isArray(c.slots) ? c.slots.length : 0, MAX_SLOTS);
  return Number.isFinite(n) && n >= 1 && n <= held ? null
    : `There is no take in slot ${shownValue(slot)}: ${held ? `slots 1 to ${held} hold takes` : 'no slot holds one yet'}.`;
}

/** A hand-written verb's refusal line, as the runtime writes it: the call, then why. */
export function sectionRefusalLine(family, target, action, args, reason) {
  return `${family} ${target}: ${action} ${JSON.stringify(args ?? {})} — refused, nothing changed${reason ? `. ${reason}` : ''}`;
}

// The hand-written verbs that address an element, each with the section it reads, the action its
// reducer takes and the arguments it hands that reducer, built from the call's own. The runtime
// builds them here, so a Values row writes the same refusal line the console does.
export const HAND_WRITTEN_INDEXES = {
  splitMute: { family: 'split', section: 'SplitZone', action: 'mute', args: (zone, enabled) => ({ zone, enabled: enabled !== false }) },
  splitChannel: { family: 'split', section: 'SplitZone', action: 'channel', args: (zone, channel) => ({ zone, channel }) },
  splitTranspose: { family: 'split', section: 'SplitZone', action: 'transpose', args: (zone, semitones) => ({ zone, transpose: semitones }) },
  splitPoint: { family: 'split', section: 'SplitZone', action: 'splitPoint', args: (zone, note) => ({ zone, note }) },
  phraseCell: { family: 'phrase', section: 'Phrase', action: 'cell', args: (step, row, on) => ({ step, row, on }) },
  recorderStore: { family: 'recorder', section: 'Recorder', action: 'store', args: (slot, name) => ({ slot, name }) },
  recorderLoad: { family: 'recorder', section: 'Recorder', action: 'load', args: (slot) => ({ slot }) },
};

/** Why a hand-written verb's element is not one, from its section and the arguments it builds. */
export function handWrittenIndexRefusal(memberId, cfg, args) {
  const spec = HAND_WRITTEN_INDEXES[memberId];
  if (!spec) return null;
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  if (spec.family === 'split') return splitZoneRefusal(c.zones, args.zone);
  if (spec.family === 'phrase') return phraseCellRefusal(c, args.step, args.row);
  return recorderSlotRefusal(c, spec.action, args.slot);
}
