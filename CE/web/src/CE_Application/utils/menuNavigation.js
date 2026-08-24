/**
 * menuNavigation.js — the keyboard half of a menu bar.
 *
 * Review finding D3, last clause: "No mnemonics, no Escape-to-close, no ARIA." Escape landed in
 * the third round; this file is the rest of it. The icon rail already gets the ARIA side right
 * (`IconPanel.svelte` — aria-haspopup/aria-expanded on the drawer buttons, Escape on the window),
 * so the menu bar copies that pattern rather than inventing one, and adds what a menu *bar*
 * additionally owes a keyboard user: roving focus, wrap-around arrows, Home/End, and access keys.
 *
 * Everything here is pure so it can be tested without a DOM — the component measures nothing and
 * decides nothing, it just moves focus where these functions say.
 *
 * Two deliberate choices, both from the WAI-ARIA menu pattern and both easy to "fix" wrongly:
 *
 * - DISABLED ITEMS STILL TAKE FOCUS. Skipping them would hide the existence of a command from
 *   the only users who cannot see the greyed-out row. Arrow keys walk onto them; Enter does
 *   nothing there.
 * - SEPARATORS AND HEADERS NEVER TAKE FOCUS. They are not commands. The Insert menu is one long
 *   list of category headers, so a walker that stopped on them would need a dozen extra presses
 *   to cross it.
 */

/** Rows a keyboard can land on: everything that is not a divider or a category caption. */
export function isFocusableMenuRow(item) {
  const type = item?.type;
  return type !== 'separator' && type !== 'header';
}

export function firstFocusableIndex(items) {
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) if (isFocusableMenuRow(list[i])) return i;
  return -1;
}

export function lastFocusableIndex(items) {
  const list = Array.isArray(items) ? items : [];
  for (let i = list.length - 1; i >= 0; i -= 1) if (isFocusableMenuRow(list[i])) return i;
  return -1;
}

/**
 * The next focusable row in `step` direction, wrapping. `from` may be -1 ("nothing focused yet"),
 * in which case a downward step lands on the first row and an upward step on the last — which is
 * what pressing Down or Up on a just-opened menu should do.
 */
export function nextFocusableIndex(items, from, step) {
  const list = Array.isArray(items) ? items : [];
  const count = list.length;
  if (count === 0) return -1;
  const direction = step < 0 ? -1 : 1;
  if (from == null || from < 0 || from >= count) {
    return direction > 0 ? firstFocusableIndex(list) : lastFocusableIndex(list);
  }
  for (let hop = 1; hop <= count; hop += 1) {
    const index = (((from + direction * hop) % count) + count) % count;
    if (isFocusableMenuRow(list[index])) return index;
  }
  return -1;
}

const MNEMONIC_CHAR = /[a-z0-9]/;

/**
 * Pick one access key per label, never colliding inside the same menu.
 *
 * Preference order is the one every desktop menu uses and users read without being told: the
 * first letter, then the first letter of a later word, then any remaining letter. A label whose
 * every letter is already spoken for gets none — a duplicated access key is worse than a missing
 * one, because pressing it does something arbitrary.
 *
 * @param labels array of strings (non-string entries — separators — yield null)
 * @returns array of `{ key, index } | null`, positionally matching `labels`
 */
export function assignMnemonics(labels) {
  const used = new Set();
  const list = Array.isArray(labels) ? labels : [];

  const claim = (label) => {
    if (typeof label !== 'string' || !label) return null;
    const lower = label.toLowerCase();

    const wordStarts = [];
    const rest = [];
    for (let i = 0; i < lower.length; i += 1) {
      if (!MNEMONIC_CHAR.test(lower[i])) continue;
      const isWordStart = i === 0 || !MNEMONIC_CHAR.test(lower[i - 1]);
      (isWordStart ? wordStarts : rest).push(i);
    }

    for (const index of [...wordStarts, ...rest]) {
      const key = lower[index];
      if (used.has(key)) continue;
      used.add(key);
      return { key, index };
    }
    return null;
  };

  return list.map(claim);
}

/**
 * Split a label around its access key so the view can underline exactly one character without
 * hunting for it again (and without underlining every "S" in "Save As...").
 */
export function splitLabelForMnemonic(label, mnemonic) {
  const text = String(label ?? '');
  const index = mnemonic?.index;
  if (!Number.isInteger(index) || index < 0 || index >= text.length) {
    return { before: text, letter: '', after: '' };
  }
  return { before: text.slice(0, index), letter: text[index], after: text.slice(index + 1) };
}

/**
 * Type-ahead: the next row after `from` whose access key is `key`, wrapping. Returns -1 for no
 * match. Cycling rather than always returning the first match is what lets two items that could
 * not both get a unique key still be reachable by repeated presses.
 */
export function matchMnemonicIndex(items, mnemonics, key, from = -1) {
  const list = Array.isArray(items) ? items : [];
  const keys = Array.isArray(mnemonics) ? mnemonics : [];
  const wanted = String(key ?? '').toLowerCase();
  if (!wanted || wanted.length !== 1) return -1;
  const count = list.length;
  for (let hop = 1; hop <= count; hop += 1) {
    const index = (((from + hop) % count) + count) % count;
    if (!isFocusableMenuRow(list[index])) continue;
    if (keys[index]?.key === wanted) return index;
  }
  return -1;
}

/** Wrap-around move along the menu bar itself (ArrowLeft / ArrowRight between File, Edit, ...). */
export function stepMenuName(names, current, step) {
  const list = Array.isArray(names) ? names : [];
  if (list.length === 0) return null;
  const at = list.indexOf(current);
  if (at < 0) return list[step < 0 ? list.length - 1 : 0];
  const direction = step < 0 ? -1 : 1;
  return list[(((at + direction) % list.length) + list.length) % list.length];
}
