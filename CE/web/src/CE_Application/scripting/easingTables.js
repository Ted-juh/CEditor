// easingTables.js — the named easing curves ce.anim animates along, in one place.
//
// Same rule as musicTheory.js and timeTables.js, and here it bites hardest. The Properties panel's
// Animations section offers `linear | inQuad | outQuad | inOutQuad | outCubic`, and stores them as
// CSS cubic-bezier control points — there is no numeric evaluator anywhere in the app, because a
// CSS transition does not need one.
//
// ce.anim DOES need one: it writes values, not stylesheets. So the choice was between adopting the
// panel's NAMES with lookalike formulas (1 - (1-t)^2 for outQuad, which is not what
// cubic-bezier(0.25, 0.46, 0.45, 0.94) traces) or adopting the panel's CURVES. A lookalike is a
// second curve wearing the same name: an author who sets outCubic in the Properties panel and
// writes curve = "outCubic" in the script beside it would get two different motions and no way to
// tell. So the control points are re-exported from the component runtime, generated into the three
// C++ preludes, and every runtime solves the same bezier.
//
// Before this, a script asking for "outCubic" got LINEAR — the ease() fall-through — in every
// runtime, silently.

import { EASING_BEZIERS, EASING_NAMES } from '../utils/interactionRuntime.js';

export { EASING_BEZIERS, EASING_NAMES };

/**
 * The four shapes ce.math.curve() offers, which ce.anim has always accepted. Kept as a separate
 * list from the panel's because they are a different vocabulary with a different history, and
 * pretending otherwise would suggest `exp` and `inQuad` are the same curve. They are close
 * relatives — exp is t², inQuad is a bezier that looks like t² — and not the same numbers.
 */
export const CURVE_NAMES = ['linear', 'exp', 'log', 's'];

/** Every curve name ce.anim accepts, for the docs and for the "did you mean" report. */
export const ANIM_CURVE_NAMES = [...CURVE_NAMES, ...Object.keys(EASING_BEZIERS)];
