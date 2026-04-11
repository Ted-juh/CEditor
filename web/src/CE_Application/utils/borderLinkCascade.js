/**
 * Unlink cascade for the Border and Corners sections.
 *
 * On unlink, the root section's current values are copied down into every
 * child slot (top/right/bottom/left for Border, topLeft/... for Corners)
 * so the per-slot editors start from the same visual state as the linked one.
 *
 * The fallback operators (`||` for numbers, `??` for doubleGap, `!== false`
 * for borderEnabled) are preserved verbatim from the original component —
 * changing any of them could silently alter behavior for existing panels.
 */

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

export const BORDER_UNLINK_PROPS = [
  ['style',           r => r.style || 'solid'],
  ['thickness',       r => r.thickness || 1],
  ['dotRadius',       r => r.dotRadius || 2],
  ['doubleGap',       r => r.doubleGap || 2],
  ['doubleAnchor',    r => r.doubleAnchor || 'center'],
  ['doubleDirection', r => r.doubleDirection || 'outward'],
  ['colour',          r => r.colour || 'FF888888'],
];

export const CORNER_UNLINK_PROPS = [
  ['radius',          r => r.radius || 0],
  ['style',           r => r.style || 'rounded'],
  ['direction',       r => r.direction || 'outward'],
  ['borderStyle',     r => r.borderStyle || 'solid'],
  ['thickness',       r => r.thickness || 2],
  ['dotRadius',       r => r.dotRadius || 2],
  ['doubleGap',       r => r.doubleGap ?? 2],
  ['doubleAnchor',    r => r.doubleAnchor || 'center'],
  ['doubleDirection', r => r.doubleDirection || 'outward'],
  ['colour',          r => r.colour || 'FFFFFFFF'],
  ['borderEnabled',   r => r.borderEnabled !== false],
];

/**
 * Fan the root section's values out to every child slot by calling `set`
 * once per (slot, prop) pair. Caller supplies the `set(path, value)` writer.
 *
 *   sectionPath — e.g. 'Background.Border' or 'Background.Corners'
 *   root        — the section data (root or linked object)
 *   keys        — SIDES or CORNERS
 *   propSpec    — BORDER_UNLINK_PROPS or CORNER_UNLINK_PROPS
 *   set         — (path, value) => void  (the component's store writer)
 */
export function cascadeUnlink(sectionPath, root, keys, propSpec, set) {
  for (const key of keys) {
    for (const [prop, resolve] of propSpec) {
      set(`${sectionPath}.${key}.${prop}`, resolve(root));
    }
  }
}
