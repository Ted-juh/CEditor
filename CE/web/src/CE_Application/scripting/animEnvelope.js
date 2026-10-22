// animEnvelope.js — how ce.anim.envelope reads its points, and the words it refuses them in.
//
// One reader for the WebView runtime (panelRuntime's startEnvelopeImpl) and the script editor's
// Values tab (scriptValueKinds' readEnvelope), so a row says what the runtime will say. The Lua,
// JavaScript and Python preludes read the points again in their own language, in the same words
// (each one's animateEnvelope), and scriptPreludeAgreement.test.js runs all four on the same cases.
//
// A point is { x, y } (Lua's { x = 0, y = 1 }, Python's {"x": 0, "y": 1}) or the two as a pair
// ({ 0, 1 }, [0, 1], (0, 1)). x is how far through the move and y the level, each a number or text
// that is one, as the timing options are read (realNumber). The shape is sampled from 0 to 1, so a
// point whose x is outside that is never reached: written in milliseconds or out of 100, the shape
// played was a sliver of the one written, without a word. A point that could not be read was dropped
// as silently, and with fewer than two left the move was a flat line or, with none, a straight ramp
// from `from` to `to`. Each of these now starts nothing and says why. A y outside 0 to 1 is read as
// it is: past `to` above 1 and past `from` below 0, as a target past a control's range is for
// ce.anim.to, and an overshoot is a shape someone may well mean.

import { realNumber, unitProblem } from './scriptColours.js';

/** What every runtime writes, as a note, for points that are not a list of at least two. */
export const ENVELOPE_TOO_FEW = 'ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.';

/**
 * A point's x, y, curve and tension as written, unread, or null when it is not a point at all (a
 * number, text, nothing). A pair is a list: x, y, then the curve and its tension. Anything else that
 * is a table is read by its names, and failing those by its numbered entries, counted from 0 when it
 * has an entry 0 (an object a JavaScript or Python script wrote that way) and from 1 when it does
 * not (a Lua table: wasmoon hands `{ 0, 1, curve = "exp" }` over as an object with keys "1", "2"
 * and "curve"). It read entry 1 before entry 0, so `{ 0: 0.2, 1: 0.8 }` was a point at x 0.8.
 *
 * The one reading of a point: panelRuntime's toBreakpoints samples by it (ce.anim.envelope and
 * ce.math.map), and each prelude's own reader counts the same way (scriptPreludeAgreement.test.js).
 */
export function envelopePointParts(point) {
  if (Array.isArray(point)) return { x: point[0], y: point[1], curve: point[2], tension: point[3], pair: true };
  if (point && typeof point === 'object') {
    const from = Object.prototype.hasOwnProperty.call(point, '0') ? 0 : 1;
    return {
      x: point.x ?? point[from],
      y: point.y ?? point[from + 1],
      curve: point.curve ?? point[from + 2],
      tension: point.tension ?? point[from + 3],
      pair: false,
    };
  }
  return null;
}

/** How a refusal shows what was written where a number goes: unitProblem's words, for every one. */
function shownWritten(value) {
  if (value === undefined || value === null) return 'none was given';
  if (typeof value === 'string') return `"${value}" is not`;
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} is not`;
  return 'the value given is not';
}

/**
 * Why ce.anim.envelope starts nothing for `points`, in its words, or null when it starts.
 * `index` is the point the message is about (from 0), or -1 for the list as a whole. Every one is
 * an error in the console: fewer than two points was a plain line, until the owner asked for it
 * to be rejected as every other call is.
 *
 * @returns {{ message: string, index: number }|null}
 */
export function envelopeRefusal(points) {
  if (!Array.isArray(points) || points.length < 2) return { message: ENVELOPE_TOO_FEW, index: -1 };
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const which = `point ${i + 1} of ${n}`;
    const parts = envelopePointParts(points[i]);
    if (!parts) {
      return { message: `ce.anim.envelope: ${which} is { x, y } or the two as a pair, and ${shownWritten(points[i])}, so nothing was started.`, index: i };
    }
    const x = unitProblem(`the x of ${which}`, parts.x);
    if (x) return { message: `ce.anim.envelope: ${x.why}, so nothing was started.${x.hint}`, index: i };
    if (realNumber(parts.y) === undefined) {
      return { message: `ce.anim.envelope: the y of ${which} is a number, and ${shownWritten(parts.y)}, so nothing was started.`, index: i };
    }
  }
  return null;
}
