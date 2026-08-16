/**
 * Normalize corner data from the ValueTree. The Corners section has two
 * shapes:
 *   - linked: the root itself carries all the per-corner props (topLeft etc
 *     are ignored)
 *   - unlinked: four per-slot objects (topLeft/topRight/bottomRight/bottomLeft)
 *
 * `normalizeCorner(corners, pos)` returns a fully-defaulted corner object
 * regardless of which shape the input is in.
 */

export const CORNER_DEFAULT = Object.freeze({
  radius: 0,
  borderEnabled: true,
  style: 'rounded',
  direction: 'outward',
  borderStyle: 'solid',
  thickness: 2,
  dotRadius: 2,
  doubleGap: 2,
  doubleAnchor: 'center',
  doubleDirection: 'outward',
  colour: 'FFFFFFFF',
});

const POS_TO_KEY = {
  tl: 'topLeft',
  tr: 'topRight',
  br: 'bottomRight',
  bl: 'bottomLeft',
};

// Apply per-field defaults. Note the specific fallback operators:
//   `||`    for number fields (0 becomes default — existing behavior)
//   `??`    for doubleGap (0 is a valid explicit value)
//   `!== false` for borderEnabled (true by default)
function applyDefaults(c) {
  return {
    radius: c.radius || 0,
    borderEnabled: c.borderEnabled !== false,
    style: c.style || 'rounded',
    direction: c.direction || 'outward',
    borderStyle: c.borderStyle || 'solid',
    thickness: c.thickness || 2,
    dotRadius: c.dotRadius || 2,
    doubleGap: c.doubleGap ?? 2,
    doubleAnchor: c.doubleAnchor || 'center',
    doubleDirection: c.doubleDirection || 'outward',
    colour: c.colour || 'FFFFFFFF',
  };
}

/**
 * Read normalized corner data for a given position ('tl'|'tr'|'br'|'bl')
 * from a corners section. Returns a fresh object every call (safe to mutate).
 */
export function normalizeCorner(corners, pos) {
  if (!corners) return { ...CORNER_DEFAULT };
  // `!== false`, not truthiness — the same tri-state read borderEnabled uses above, and for the
  // same reason: the model's default is `true`, so ABSENT has to mean linked.
  //
  // Truthiness here meant a Corners object that had simply not mentioned `linked` took the
  // unlinked branch, found no per-corner data, and came back with radius 0. It cost forty
  // knobs, every LED lamp and every tick mark their roundness, with `radius: 999` sitting in the
  // document the whole time — the shape of bug where the data is right and the read is wrong.
  if (corners.linked !== false) return applyDefaults(corners);
  const c = corners[POS_TO_KEY[pos]];
  if (!c) return { ...CORNER_DEFAULT };
  return applyDefaults(c);
}
