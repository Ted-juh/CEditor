// noteLists.js — how ce.music's four helpers that take a list of notes read it, and what they say
// of one they cannot read, in one place: the WebView runtime (panelRuntime.js) says it, and the
// script editor's Values tab says it in the list's row. The Lua, JavaScript and Python preludes say
// the same sentences (scriptPreludeAgreement.test.js holds the four to them).
//
// chordQuality, voiceLead and expandOctaves read their lists as numbers and dropped anything that
// was not one, so a chord written by name, ["C4", "E4", "G4"], was an empty chord and voiceLead gave
// back nothing at all, without a word. Each runtime dropped something different: true was a note in
// JavaScript and not in Lua or Python, and "inf" was one in Python. arpOrder kept the names as it was
// given them. Each item is read now as every other ce.music helper reads a note, a number or a name,
// and text that is a number as that number; one that is neither refuses the call, naming where it is.
//
// The words each helper takes were read the same way and never said: a voice-leading mode or an
// arpeggio pattern there is none of was the default without a word, and so was an octave count that
// is not a whole number from 1 to 4. Each is said once now, as ce.time's helpers say theirs.

import { realNumber } from './scriptColours.js';
import { shownValue as shown } from './shownValue.js';
import { noteNumberOf as noteNumber } from './musicTheory.js';

// Each helper: the call as a script writes it, the lists it takes (by argument), and what it gives
// back when it cannot read one.
export const NOTE_LISTS = {
  chordQuality: { verb: 'ce.music.quality', lists: ['notes'], outcome: 'there is no answer' },
  voiceLead: { verb: 'ce.music.lead', lists: ['notes', 'previous'], outcome: 'the answer is an empty list' },
  expandOctaves: { verb: 'ce.music.octaves', lists: ['notes'], outcome: 'the answer is an empty list' },
  arpOrder: { verb: 'ce.music.arp', lists: ['notes'], outcome: 'the answer is an empty list' },
};

// A list that may be left out: voiceLead's previous chord, which is none to lead from.
const MAY_BE_ABSENT = { voiceLead: ['previous'] };

/** One item of a list of notes as a MIDI number: a number, a note name, or text that is a number. */
export function noteListItem(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const named = noteNumber(v);
  if (named !== undefined && named !== null) return named;
  return realNumber(v);
}

/**
 * A helper's list of notes as it reads it: `notes`, the numbers, in the order given, and `refused`,
 * the sentence for a list it cannot read, or null.
 */
export function noteList(memberId, name, list) {
  const spec = NOTE_LISTS[memberId];
  const say = (why, more = '') => ({ notes: [], refused: `${spec.verb}: ${why}, so ${spec.outcome}.${more}` });
  if (list === undefined || list === null) {
    return (MAY_BE_ABSENT[memberId] ?? []).includes(name) ? { notes: [], refused: null } : say(`no ${name} were given`);
  }
  if (!Array.isArray(list)) return say(`${shown(list)} is not a list of notes`);
  const notes = [];
  for (let i = 0; i < list.length; i += 1) {
    const n = noteListItem(list[i]);
    if (n !== undefined) { notes.push(n); continue; }
    const where = `${shown(list[i])} at position ${i + 1} of ${name}`;
    return typeof list[i] === 'string'
      ? say(`${where} is not a note name`, ' A name is a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".')
      : say(`${where} is not a note`, ' A note is a MIDI number or a name, such as 60 or "C4".');
  }
  return { notes, refused: null };
}

/* --------------------------------------------------------------------- the words they take */

export const VOICE_LEAD_MODES = ['closest', 'smooth', 'off'];
export const ARP_ORDER_PATTERNS = ['up', 'down', 'updown', 'downup', 'asPlayed', 'random', 'chord'];

/** voiceLead's mode as it reads it: `how`, and `said` for one it has none of (none given is "closest"). */
export function voiceLeadMode(mode) {
  if (mode === undefined || mode === null) return { how: 'closest', said: null };
  const how = String(mode);
  if (VOICE_LEAD_MODES.includes(how)) return { how, said: null };
  return { how: 'closest', said: `ce.music.lead: ${shown(mode)} is not a mode, so "closest" was used. One of: ${VOICE_LEAD_MODES.join(', ')}.` };
}

/** arpOrder's pattern as it reads it: `which`, and `said` for one it has none of. */
export function arpOrderPattern(pattern) {
  if (pattern === undefined || pattern === null) {
    return { which: 'up', said: `ce.music.arp: no pattern was given, so "up" was used. One of: ${ARP_ORDER_PATTERNS.join(', ')}.` };
  }
  const which = String(pattern);
  if (ARP_ORDER_PATTERNS.includes(which)) return { which, said: null };
  return { which: 'up', said: `ce.music.arp: ${shown(pattern)} is not a pattern, so "up" was used. One of: ${ARP_ORDER_PATTERNS.join(', ')}.` };
}

/** expandOctaves' count as it reads it, a whole number from 1 to 4 (none given is 1), and `said`. */
export function octaveCount(octaves) {
  if (octaves === undefined || octaves === null) return { n: 1, said: null };
  const say = (why, used) => ({ n: used, said: `ce.music.octaves: octaves is ${shown(octaves)}, which is ${why}, so ${used} was used.` });
  const read = realNumber(octaves);
  if (read === undefined) return say('not a number', 1);
  const whole = Math.floor(read);
  if (whole < 1) return say('less than 1', 1);
  if (whole > 4) return say('more than 4', 4);
  if (whole !== read) return say('not a whole number', whole);
  return { n: whole, said: null };
}
