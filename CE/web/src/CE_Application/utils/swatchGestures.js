/**
 * What each gesture on a swatch cell MEANS — one table, so the three tabs that
 * host the grid cannot drift apart and no gesture can quietly acquire a second
 * job.
 *
 * THE TRAP THIS ENDS. The cell used to answer to three gestures at once on a
 * 14px target: click stored-or-applied, double-click cleared the cell
 * permanently with no undo, right-click overwrote it. Two of the three were
 * destructive and silent, and double-click is the gesture an unsteady hand
 * produces by accident. Worse, the meanings changed per tab, so the muscle
 * memory built in the Colors tab was wrong in the Gradient tab.
 *
 * The rule now: the gesture a stray hand can produce is the harmless one.
 * Destruction has to be asked for by name (the cell menu or the Delete key)
 * and can always be taken back — see `undoFor` / `applyUndo`.
 */

/**
 * @param {string} gesture — 'click' | 'dblclick' | 'contextmenu' | 'delete'
 * @param {{hasColour: boolean}} cell
 * @returns {'use'|'store'|'menu'|'clear'|'none'}
 */
export function swatchAction(gesture, { hasColour } = {}) {
  switch (gesture) {
    case 'click':       return hasColour ? 'use' : 'store';
    case 'contextmenu': return 'menu';
    case 'delete':      return hasColour ? 'clear' : 'none';
    // Explicitly nothing. It used to be the destructive one; leaving it
    // unhandled would invite the next person to give it a job again.
    case 'dblclick':    return 'none';
    default:            return 'none';
  }
}

/** The cell menu's items, in order. `id` maps onto the actions above. */
export function swatchMenuItems(hasColour) {
  return [
    { id: 'use', label: hasColour ? 'Use this colour' : 'Store current colour', danger: false, disabled: false },
    { id: 'replace', label: 'Replace with current colour', danger: false, disabled: false },
    { id: 'clear', label: 'Clear', danger: true, disabled: !hasColour },
  ];
}

/** Tooltip text. Says what the gestures are, because they are no longer guessable. */
export function swatchTitle(swatch) {
  return swatch
    ? `#${swatch} — click to use, right-click for replace and clear`
    : 'Click to store the current colour';
}

/** Snapshot one cell before something destructive happens to it. */
export function undoFor(swatches, index) {
  return { kind: 'cell', index, colour: swatches?.[index] ?? null };
}

/**
 * Put a snapshot back. Mutates the array in place on purpose: the grid is
 * handed the parent tab's `$state` array and writes into it directly, exactly
 * as GradientTab does when it stores a stop colour. Returns the array so
 * callers can assert on it.
 */
export function applyUndo(swatches, undo) {
  if (!undo || undo.kind !== 'cell' || !swatches) return swatches;
  swatches[undo.index] = undo.colour;
  return swatches;
}
