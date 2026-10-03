// easingTables.js — the named easing curves ce.anim animates along, in one place.
//
// Same rule as musicTheory.js and timeTables.js, and here it bites hardest. The panel's Animations
// store their easing as a NAME, and the runtime hands it to CSS as cubic-bezier control points — a
// CSS transition needs no numeric evaluator. (The Animation tab offers ten names today, and a curve
// you draw and a spring besides; those two are the panel's own and ce.anim does not take them.)
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

// From utils/easing.js, where the table lives — the same object interactionRuntime.js re-exports, so
// scriptAnim.test.js's identity check holds — without loading the whole component runtime to get
// it. panelApi.js reads ANIM_CURVE_NAMES from here for the documented `curve` option, and a file the
// contract imports has to stay light.
import { EASING_BEZIERS, EASING_NAMES } from '../utils/easing.js';

export { EASING_BEZIERS, EASING_NAMES };

/**
 * The four shapes ce.math.curve() offers, which ce.anim has always accepted. Kept as a separate
 * list from the panel's because they are a different vocabulary with a different history, and
 * pretending otherwise would suggest `exp` and `inQuad` are the same curve. They are close
 * relatives — exp is t², inQuad is a bezier that looks like t² — and not the same numbers.
 */
export const CURVE_NAMES = ['linear', 'exp', 'log', 's'];

/**
 * Every curve NAME ce.anim accepts, for the docs and for the "did you mean" report: ce.math.curve's
 * four, the panel's named beziers, and "spring" — the Animation tab's spring, which is
 * ce.anim.spring's formula, its feel taken from the animation's damping and frequency. A curve drawn
 * by hand is not a name; it is passed as four numbers (panelRuntime.js, drawnCurve).
 */
export const ANIM_CURVE_NAMES = [...CURVE_NAMES, ...Object.keys(EASING_BEZIERS), 'spring'];
