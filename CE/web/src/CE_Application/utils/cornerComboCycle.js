/**
 * Corner-shape combo logic for BorderCornerWidget's center picker.
 *
 * A "combo" is one of the five user-facing corner shapes:
 *   'straight' | 'round-out' | 'round-in' | 'chamfer' | 'notch'
 *
 * Combos belong to two "sides" of the picker:
 *   straight side: straight → notch → chamfer → (cycle)
 *   rounded side:  round-out → round-in → (cycle)
 */

export const SHAPE_CYCLES = {
  straight: ['straight', 'notch', 'chamfer'],
  rounded:  ['round-out', 'round-in'],
};

/**
 * Convert a combo key to the underlying { style, direction } data stored
 * on the corners section.
 */
export function cornerComboToData(combo) {
  switch (combo) {
    case 'straight':  return { style: 'straight', direction: 'outward' };
    case 'round-out': return { style: 'rounded',  direction: 'outward' };
    case 'round-in':  return { style: 'rounded',  direction: 'inward' };
    case 'chamfer':   return { style: 'chamfer',  direction: 'outward' };
    case 'notch':     return { style: 'notch',    direction: 'outward' };
    default:          return { style: 'straight', direction: 'outward' };
  }
}

/**
 * Derive the current combo key from a corners section. Falls back to
 * 'round-out' for a missing section. When unlinked, reads from topLeft
 * first so all four corners stay synced on the picker display.
 */
export function comboFromCorners(corners) {
  if (!corners) return 'round-out';
  const style = corners.linked
    ? (corners.style || 'rounded')
    : (corners.topLeft?.style || corners.style || 'rounded');
  const dir = corners.linked
    ? (corners.direction || 'outward')
    : (corners.topLeft?.direction || corners.direction || 'outward');
  if (style === 'rounded') return dir === 'inward' ? 'round-in' : 'round-out';
  if (style === 'chamfer') return 'chamfer';
  if (style === 'notch') return 'notch';
  return 'straight';
}

/**
 * Which side ('rounded' | 'straight') a combo lives on.
 */
export function sideForCombo(combo) {
  return SHAPE_CYCLES.rounded.includes(combo) ? 'rounded' : 'straight';
}

/**
 * Compute the next combo when the user clicks a side button.
 * - Clicking the side that's already active advances to the next state
 *   in that side's cycle.
 * - Clicking the other side resets to the first state of that cycle.
 */
export function nextCombo(currentCombo, clickedSide) {
  const cycle = SHAPE_CYCLES[clickedSide];
  if (sideForCombo(currentCombo) !== clickedSide) return cycle[0];
  const idx = cycle.indexOf(currentCombo);
  return cycle[(idx + 1) % cycle.length];
}
