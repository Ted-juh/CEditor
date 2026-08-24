// keyboardLayout.js — an on-screen piano keyboard.
//
// The backlog listed this as one of the two pieces of "substantial new work" left, on the grounds
// that it needs "white/black key layout + hit detection; a keyboard renderer". Two of those three
// already existed: `splitZoneLayout.js` grew `keyRect`, `whiteKeyCount`, `isBlackKey` and
// `noteAtPoint` for the Zone Splitter's keyboard strip, and geometry does not care what it is
// drawn for. Reusing it is not a shortcut — a second implementation would put two keyboards on one
// panel that disagree about where middle C is.
//
// So what is actually here is the part a splitter never needed: which keys are HELD, what a click
// emits, how a key is shaded when it is out of the panel's key, and the sustain and glissando
// behaviour that make an on-screen keyboard playable rather than a picture of one.
//
// PURE. The renderer draws what this returns and the preview surface sends what it says to send.

import {
  isBlackKey, keyRect, noteAtPoint, splitGeometry, whiteKeyCount,
} from './splitZoneLayout.js';
import { isInScale, normalizeContext } from './musicalContext.js';

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clampInt = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(value, lo))));

/** Note names, for the C labels a keyboard needs to be readable at all. */
export const OCTAVE_LABEL_PC = 0;

export function keyboardConfig(control) {
  return control?._children?.Keyboard ?? {};
}

/**
 * The note range, clamped and ordered.
 *
 * A range that ends below where it starts is a typo, not an instruction, and rendering it produces
 * a keyboard of negative width that swallows the rest of the panel.
 */
export function keyboardRange(control) {
  const config = keyboardConfig(control);
  const low = clampInt(config.lowNote ?? 48, 0, 127);
  const high = clampInt(config.highNote ?? 72, 0, 127);
  return low <= high ? { lowNote: low, highNote: high } : { lowNote: high, highNote: low };
}

/** Geometry, borrowed wholesale from the splitter's keyboard strip — there is only one piano. */
export function keyboardGeometry(width, height, control) {
  const config = keyboardConfig(control);
  const pad = num(config.padding, 6);
  // No header and no zone bands: this is a keyboard, not a splitter, so the keys get the whole box.
  return splitGeometry(num(width, 0), num(height, 0), pad, 0, 0);
}

/** Every key in the range, with its rectangle and its state. Whites first, so blacks draw on top. */
export function keyboardKeys(control, width, height, { held = [], context = null } = {}) {
  const { lowNote, highNote } = keyboardRange(control);
  const geom = keyboardGeometry(width, height, control);
  const heldSet = held instanceof Set ? held : new Set(held ?? []);
  const key = context ? normalizeContext(context) : null;
  // Only `refuse` makes a key inert. Under `off` and `quantize` an out-of-key key still sounds
  // something, so shading it is information; marking it dead would be a lie about what a press does.
  const refusing = String(keyboardConfig(control).scaleLock ?? 'off') === 'refuse';

  const keys = [];
  for (let note = lowNote; note <= highNote; note += 1) {
    keys.push({
      note,
      black: isBlackKey(note),
      rect: keyRect(geom, note, lowNote, highNote),
      held: heldSet.has(note),
      // Out-of-key shading is the whole reason the keyboard reads the panel's musical context. A
      // scale-locked keyboard that simply refused the note would leave the player wondering whether
      // the click registered; shading says "that one is not in the key" before they press it.
      inKey: key ? isInScale(note, key) : true,
      // Pressing this key sends nothing. The shading above says "not in the key"; this says "and
      // this one will not sound", which is the difference between information and a dead key. A
      // player finding that out by silence assumes the panel is broken.
      refused: refusing && key ? !isInScale(note, key) : false,
      label: note % 12 === OCTAVE_LABEL_PC ? `C${Math.floor(note / 12) - 1}` : '',
    });
  }
  // Blacks last: they overlap the whites, and painter's order is the only thing that decides which
  // one you see.
  return [...keys.filter((k) => !k.black), ...keys.filter((k) => k.black)];
}

/** The note under a point, or null. */
export function keyboardNoteAt(control, width, height, px, py) {
  const { lowNote, highNote } = keyboardRange(control);
  return noteAtPoint(keyboardGeometry(width, height, control), px, py, lowNote, highNote);
}

/**
 * What pressing a key actually sends.
 *
 * Returns `null` for a key the scale lock rejects rather than a silently transposed note: moving
 * somebody's finger to the nearest in-key note without telling them is the kind of help that reads
 * as a bug. `quantize` is the opt-in for the other behaviour.
 */
export function keyboardPress(control, note, { context = null, velocity = null } = {}) {
  const config = keyboardConfig(control);
  const key = context ? normalizeContext(context) : null;
  const scaleLock = String(config.scaleLock ?? 'off');

  let sounded = clampInt(note, 0, 127);
  if (key && scaleLock !== 'off' && !isInScale(sounded, key)) {
    if (scaleLock === 'refuse') return null;
    if (scaleLock === 'quantize') {
      // Nearest in-key note. Ties go down, the same way `quantizeToScale` decides them, so the
      // keyboard and the arpeggiator cannot disagree about which way a borderline note goes.
      for (let distance = 1; distance <= 6; distance += 1) {
        if (isInScale(sounded - distance, key)) { sounded -= distance; break; }
        if (isInScale(sounded + distance, key)) { sounded += distance; break; }
      }
    }
  }

  return {
    note: clampInt(sounded + num(config.transpose, 0) + num(config.octave, 0) * 12, 0, 127),
    velocity: clampInt(velocity ?? config.velocity ?? 100, 1, 127),
    channel: clampInt(config.channel ?? 1, 1, 16),
  };
}

/**
 * Held notes after a press, honouring latch and sustain.
 *
 * `latch` makes a key stay down until it is pressed again, which is what makes a keyboard usable
 * with one mouse pointer — you cannot hold a chord otherwise, and a chord is most of the point.
 */
export function keyboardHold(held, note, { latch = false, down = true } = {}) {
  const next = new Set(held ?? []);
  if (latch) {
    if (next.has(note)) next.delete(note);
    else next.add(note);
    return next;
  }
  if (down) next.add(note);
  else next.delete(note);
  return next;
}

/**
 * A glissando: dragging across the keys.
 *
 * Returns what to release and what to press, rather than a new set, because the caller has to emit
 * note-offs before note-ons or a fast drag leaves notes hanging. Getting that order wrong is how an
 * on-screen keyboard ends up with six stuck notes after one swipe.
 */
export function keyboardGlide(held, note, { legato = true } = {}) {
  const current = new Set(held ?? []);
  if (note === null || note === undefined) return { release: [...current], press: [], held: new Set() };
  if (current.has(note) && current.size === 1) return { release: [], press: [], held: current };

  const release = legato ? [...current].filter((n) => n !== note) : [...current];
  const press = current.has(note) && legato ? [] : [note];
  return { release, press, held: new Set([note]) };
}

/** How wide the keyboard wants to be — a key narrower than about 9px cannot be hit reliably. */
export function keyboardMinWidth(control, { minWhiteKey = 9 } = {}) {
  const { lowNote, highNote } = keyboardRange(control);
  const config = keyboardConfig(control);
  return whiteKeyCount(lowNote, highNote) * minWhiteKey + num(config.padding, 6) * 2;
}

/**
 * The keyboard's bindable ports.
 *
 * `note` and `velocity` rather than one value: a keyboard emits a pair, and a binding that could
 * only reach the note would leave velocity unmappable — which on a synth is half the expression.
 */
export function keyboardPorts(control, parameterTypes = null) {
  const types = parameterTypes ?? {};
  const numeric = [types.INTEGER ?? 'integer', types.FLOAT ?? 'float'].filter(Boolean);
  return [
    { id: 'note', label: 'Note', accepts: numeric, defaultBindingMode: 'continuous' },
    { id: 'velocity', label: 'Velocity', accepts: numeric, defaultBindingMode: 'continuous' },
  ];
}
