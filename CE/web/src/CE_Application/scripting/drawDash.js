// drawDash.js — the dash pattern a script gives ce.draw.stroke (`{ dash = { 3, 3 } }`), and the cap
// and join beside it, read once: for the WebView runtime, which draws with them (panelRuntime's
// drawStroke), and for the script editor's Values tab, which shows them (scriptValueKinds' readDash
// and ENUM_REFUSALS), so the row says what the drawing does in the words the console says it in.
//
// It is the only reader there is. ce.draw is panel-view only: the plug-in's window runs this same
// runtime (playerScriptHost.js), and with the window shut the C++ engines' preludes answer
// drawStroke with their webview-only stub.
//
// A dash is a list of lengths in pixels, drawn and skipped in turn, handed to the overlay as SVG's
// stroke-dasharray (ScriptDrawOverlay.svelte). What the drawing does with what is not quite that:
//
//  · A length below 0, or one that is not a number, is drawn as 0, and said. It always was drawn as
//    0, without a word, so `{ 3, -3 }` drew a solid line with nothing to say why. (SVG would drop the
//    whole pattern for that one length, as a canvas's setLineDash ignores it.) Text that is a number
//    is read as one, as it always was.
//  · A dash that is not a list is no pattern, and the line is solid, which is said. A number was
//    dropped without a word, and text was taken apart character by character: "3 3" drew 6 and
//    skipped 6, and "10 5" drew 1 and skipped 5. `false` is no dash, as it is when none is given, so
//    a Lua `recording and { 4, 2 }` is not a mistake.
//  · An empty list draws a solid line, and so does one whose lengths are all 0 (SVG's rule for a
//    pattern with no length). Neither is a mistake worth a word: no dash asked for is a solid line.
//  · An odd number of lengths is repeated to make it even, as SVG and every drawing API repeat it:
//    { 3, 2, 1 } draws 3, skips 2, draws 1, skips 3, draws 2, skips 1.
//
// Each message starts "ce.draw.stroke: ", and the runtime says each once (onDraw runs on every
// redraw), adding that it is said only the first time.

import { realNumber } from './scriptColours.js';

/** A value as a message shows it, as panelRuntime's shownValue shows one. */
function shown(value) {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    return Number.isFinite(value) ? String(value) : value > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof value === 'string') return `"${value}"`;
  return typeof value === 'function' ? 'a function' : 'a list';
}

/**
 * What ce.draw.stroke draws for `dash`.
 *
 * @param {*} dash  `opts.dash` as the script gave it: a list (a JS array, or a Lua table over the
 *   wasmoon bridge, an object keyed "1", "2", …), or anything else.
 * @returns {{ dasharray: string|null, lengths: number[]|null,
 *   problem: { severity: 'error'|'warning', message: string }|null }}
 *   `dasharray` is what the overlay is handed (null: a solid line); `lengths` the numbers drawn, after
 *   a length that is not one has been made 0, or null for no list; `problem` the first thing said.
 */
export function dashPattern(dash) {
  if (dash === undefined || dash === null || dash === false) return { dasharray: null, lengths: null, problem: null };
  if (typeof dash !== 'object') {
    return {
      dasharray: null, lengths: null,
      problem: { severity: 'error', message: `ce.draw.stroke: the dash is ${shown(dash)}, not a list of lengths, so the line is solid. `
        + 'A dash is a list of lengths in pixels, drawn and skipped in turn.' },
    };
  }
  const list = Array.isArray(dash) ? dash : Object.values(dash);
  let problem = null;
  const lengths = list.map((value, i) => {
    const n = realNumber(value);
    if (n !== undefined && n >= 0) return n;
    const why = n === undefined ? 'which is not a length in pixels' : 'which is less than 0';
    problem ??= { severity: 'warning', message: `ce.draw.stroke: length ${i + 1} of the dash is ${shown(n ?? value)}, ${why}, so 0 was used.` };
    return 0;
  });
  return { dasharray: lengths.length ? lengths.join(' ') : null, lengths, problem };
}

// A cap or a join is one of three words, in that spelling: the overlay hands it to SVG as
// stroke-linecap or stroke-linejoin, which takes no other. Any other word drew the default, "butt"
// or "miter", without a word, so `cap = "sausage"` and `join = "Round"` drew square ends and sharp
// corners with nothing to say why. Nothing given, or `false`, is the default, and no mistake.
export const STROKE_ENDS = {
  cap: { values: ['butt', 'round', 'square'], otherwise: 'butt' },
  join: { values: ['miter', 'round', 'bevel'], otherwise: 'miter' },
};

/**
 * What ce.draw.stroke draws for its `cap` or `join` option.
 *
 * @param {'cap'|'join'} name
 * @param {*} value  the option as the script gave it.
 * @returns {{ value: string|null, problem: { severity: 'error', message: string }|null }}
 *   `value` is what the overlay is handed (null: the default); `problem` what is said of it.
 */
export function strokeEnd(name, value) {
  const { values, otherwise } = STROKE_ENDS[name];
  if (value === undefined || value === null || value === false) return { value: null, problem: null };
  if (values.includes(value)) return { value, problem: null };
  const list = values.map((v) => `"${v}"`);
  return {
    value: null,
    problem: { severity: 'error', message: `ce.draw.stroke: the ${name} is ${shown(value)}, not ${list[0]}, ${list[1]} or ${list[2]}, so "${otherwise}" is drawn.` },
  };
}
