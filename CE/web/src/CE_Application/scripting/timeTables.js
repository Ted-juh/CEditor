// timeTables.js — the transport's own vocabulary, in one place, for the same reason musicTheory.js
// exists.
//
// Fourteen note divisions, each a fraction of a beat, hand-copied into Lua, JavaScript, Python and
// the WebView is fifty-six chances to mistype one — and a mistyped DIVISION is silent. It does not
// fail to load; a sequencer just runs at the wrong rate, in one runtime, for one division, and the
// panel is subtly out of time in the exported plugin and fine in the editor. So the table is data,
// `tools/scripts/gen-script-modules.mjs` emits it into all three C++ preludes, and the WebView
// imports it directly.
//
// Everything here is RE-EXPORTED from the Transport's own module rather than restated. A script
// asking for "1/8T" and an Arpeggiator set to "1/8T" have to mean the same third of a beat, and the
// only way to guarantee that is for there to be one table.

import { DIVISIONS, DIVISION_LABELS, PPQN, MIN_BPM, MAX_BPM } from '../utils/transportLayout.js';

export { DIVISIONS, DIVISION_LABELS, PPQN, MIN_BPM, MAX_BPM };

/** Division ids in the order the table declares them — the order a picker shows. */
export const DIVISION_NAMES = Object.keys(DIVISIONS);

/**
 * The table's own id for a division written in any case ("1/8t" is "1/8T"), or undefined. The
 * names differ only by D and T, so nothing is ambiguous. ce.time reads a division by this, and the
 * script editor's Values sidebar checks one by it.
 */
export function divisionIdOf(name) {
  const wanted = typeof name === 'string' ? name.toLowerCase() : null;
  return DIVISION_NAMES.find((d) => d.toLowerCase() === wanted);
}
