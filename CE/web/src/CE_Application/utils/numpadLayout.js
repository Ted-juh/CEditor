// numpadLayout.js — where a Numpad's keys are, and what typing on it does.
//
// Pure: no DOM, no store. The renderer draws what `numpadKeys` returns and the interaction feeds
// `numpadPress`, so the picture and the behaviour cannot disagree about which key is where — which
// is the failure mode for any component whose hit-testing is written twice.
//
// THE ENTRY MODEL, and the reason it is not "a knob that snaps to integers".
//
// Typing 1, then 2, then 7 must not recall preset 1, then 12, then 127 on the way past. That is
// three patch changes for one intended change, two of them wrong, and on a real synth audible. So a
// press builds a PENDING string and nothing is emitted until Enter — `numpadPress` returns the new
// pending state plus, only on a commit, the value to emit.
//
// The display offset is the other thing worth stating. A machine whose front panel calls its first
// preset 1 while the wire calls it 0 is the common case, so what is TYPED and what is EMITTED are
// not the same number: typed − displayOffset = emitted. Getting that backwards is an off-by-one on
// every recall, which is why the conversion lives here once rather than in the renderer and the
// interaction separately.

import { numberOr } from './primitives.js';

/** The keypad, in reading order: three columns, digits 1-9, then Clear / 0 / Enter. */
export const NUMPAD_KEYS = [
  { id: '1', kind: 'digit', digit: 1, label: '1' },
  { id: '2', kind: 'digit', digit: 2, label: '2' },
  { id: '3', kind: 'digit', digit: 3, label: '3' },
  { id: '4', kind: 'digit', digit: 4, label: '4' },
  { id: '5', kind: 'digit', digit: 5, label: '5' },
  { id: '6', kind: 'digit', digit: 6, label: '6' },
  { id: '7', kind: 'digit', digit: 7, label: '7' },
  { id: '8', kind: 'digit', digit: 8, label: '8' },
  { id: '9', kind: 'digit', digit: 9, label: '9' },
  { id: 'clear', kind: 'clear', label: 'C' },
  { id: '0', kind: 'digit', digit: 0, label: '0' },
  { id: 'enter', kind: 'enter', label: '↵' },
];

const COLUMNS = 3;
const ROWS = 4;

/** The section, with every default applied. */
export function numpadConfig(control) {
  const c = control?._children?.Numpad ?? {};
  const min = Math.round(numberOr(c.min, 0));
  const max = Math.round(numberOr(c.max, 127));
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    digits: Math.max(1, Math.min(6, Math.round(numberOr(c.digits, 3)))),
    commitOnLength: c.commitOnLength === true,
    placeholder: String(c.placeholder ?? 'value'),
    showDisplay: c.showDisplay !== false,
    showClear: c.showClear !== false,
    showEnter: c.showEnter !== false,
    displayOffset: Math.round(numberOr(c.displayOffset, 0)),
    editable: c.editable !== false,
    gap: Math.max(0, numberOr(c.gap, 4)),
    keyColour: String(c.keyColour ?? 'FF1B1B1B'),
    keyDownColour: String(c.keyDownColour ?? 'FF2E2E2E'),
    keyLabelColour: String(c.keyLabelColour ?? 'FFE8E8E8'),
    actionColour: String(c.actionColour ?? 'FF243040'),
    displayColour: String(c.displayColour ?? 'FF0B0B0B'),
    displayTextColour: String(c.displayTextColour ?? 'FF7FD8B4'),
    borderColour: String(c.borderColour ?? 'FF000000'),
  };
}

/**
 * Key rectangles for a box of this size, plus the readout's.
 *
 * The readout takes a fixed slice off the top and the keys share what is left, so a short pad loses
 * key height rather than losing its display — a keypad you cannot read is worse than one with
 * cramped keys.
 */
export function numpadKeys(width, height, config) {
  const cfg = config ?? {};
  const gap = Math.max(0, numberOr(cfg.gap, 4));
  const w = Math.max(0, numberOr(width, 0));
  const h = Math.max(0, numberOr(height, 0));

  const displayH = cfg.showDisplay === false ? 0 : Math.min(Math.max(22, h * 0.16), Math.max(0, h - gap));
  const display = cfg.showDisplay === false ? null
    : { x: 0, y: 0, width: w, height: displayH };

  const gridY = displayH > 0 ? displayH + gap : 0;
  const gridH = Math.max(0, h - gridY);
  const keyW = COLUMNS > 0 ? Math.max(0, (w - gap * (COLUMNS - 1)) / COLUMNS) : 0;
  const keyH = ROWS > 0 ? Math.max(0, (gridH - gap * (ROWS - 1)) / ROWS) : 0;

  const keys = NUMPAD_KEYS.map((key, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      ...key,
      hidden: (key.kind === 'clear' && cfg.showClear === false)
        || (key.kind === 'enter' && cfg.showEnter === false),
      x: column * (keyW + gap),
      y: gridY + row * (keyH + gap),
      width: keyW,
      height: keyH,
    };
  });

  return { display, keys };
}

/** Which key is under a point in the control's own space, or null. */
export function numpadKeyAt(x, y, width, height, config) {
  const { keys } = numpadKeys(width, height, config);
  const px = numberOr(x, 0);
  const py = numberOr(y, 0);
  for (const key of keys) {
    if (key.hidden) continue;
    if (px >= key.x && px <= key.x + key.width && py >= key.y && py <= key.y + key.height) return key;
  }
  return null;
}

/** What the readout shows: the pending entry while typing, else the committed value. */
export function numpadDisplayText(pending, value, config) {
  const cfg = config ?? {};
  if (pending) return pending;
  if (cfg.placeholder === 'blank') return '';
  const committed = Math.round(numberOr(value, cfg.min ?? 0));
  return String(committed + Math.round(numberOr(cfg.displayOffset, 0)));
}

/**
 * A key press.
 *
 * @returns {{pending: string, commit: number|null, rejected: string}}
 *   `pending` is the entry so far; `commit` is the value to EMIT, non-null only when this press
 *   committed one; `rejected` names why a press did nothing, for a renderer that wants to flash.
 */
export function numpadPress(key, pending, config) {
  const cfg = numpadConfigLike(config);
  const current = String(pending ?? '');

  if (!key || cfg.editable === false) return { pending: current, commit: null, rejected: 'readOnly' };

  if (key.kind === 'clear') return { pending: '', commit: null, rejected: '' };

  if (key.kind === 'enter') {
    if (!current) return { pending: '', commit: null, rejected: 'empty' };
    return commitOf(current, cfg);
  }

  if (key.kind !== 'digit') return { pending: current, commit: null, rejected: 'unknownKey' };

  // A leading zero is dropped rather than counted, so "0" then "4" is 4 and not a wasted digit on a
  // two-digit pad — EXCEPT at fixed width, where the zero is how you enter it. On a 3-digit pad in
  // commitOnLength mode, 047 is the entry for 47; dropping the zero would leave the entry one digit
  // short of the width it commits at, so it could never commit at all.
  const dropLeadingZero = current === '0' && !cfg.commitOnLength;
  const next = dropLeadingZero ? String(key.digit) : current + String(key.digit);
  if (next.length > cfg.digits) return { pending: current, commit: null, rejected: 'tooLong' };

  if (cfg.commitOnLength && next.length === cfg.digits) return commitOf(next, cfg);
  return { pending: next, commit: null, rejected: '' };
}

/** Enter with `pending` typed: in range → commit and clear; out of range → keep it and say so. */
function commitOf(pending, cfg) {
  const typed = Number.parseInt(pending, 10);
  if (!Number.isFinite(typed)) return { pending: '', commit: null, rejected: 'empty' };
  const value = typed - cfg.displayOffset;
  // REFUSED, not clamped. Clamping 999 to 127 would recall a preset nobody asked for, and the
  // person typing would have no way to tell it apart from the one they meant.
  if (value < cfg.min || value > cfg.max) return { pending, commit: null, rejected: 'outOfRange' };
  return { pending: '', commit: value, rejected: '' };
}

/** Accepts either a raw section or an already-resolved config. */
function numpadConfigLike(config) {
  if (config && '_type' in config) return numpadConfig({ _children: { Numpad: config } });
  return {
    min: 0, max: 127, digits: 3, commitOnLength: false, displayOffset: 0, editable: true,
    ...(config ?? {}),
  };
}
