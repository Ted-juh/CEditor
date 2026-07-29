// JsScriptEngine — JavaScript via juce::JavascriptEngine (QuickJS, juce_javascript module).
//
// Isolation: ONE juce::JavascriptEngine PER script (QuickJS has a single global scope per engine),
// so handler names + `self` never clash. Native calls go through a registered "__api" object;
// helpers / on / emit / self / noTransmit are defined in a JS prelude (kept in sync with the Lua
// prelude + panelApi.js).
//
// NOTE: juce::JavascriptEngine's exact surface (registerNativeObject / callFunction / NativeFunctionArgs)
// should be confirmed against the JUCE 8 headers during the build — this is the less-certain engine.
// Requires juce::juce_javascript linked (CMake, behind CEDITOR_SCRIPTING). UNVERIFIED until built.

#include "ScriptRuntime.h"
#include <juce_javascript/juce_javascript.h>

#include <cmath>
#include <map>
#include <memory>

namespace ceditor::scripting
{
namespace
{

const char* kJsPrelude = R"JS(
// @module -
// Wrap the native bridge as globals + pure-math helpers + event registry + self.
var __listeners = [];
function on(target, event, fn) { __listeners.push({ t: target, e: event, fn: fn }); }
// off(target, event) — this engine instance holds one script's listeners (QuickJS gives each script
// its own engine), so filtering here is already scoped to the calling script.
function off(target, event) {
  var kept = [];
  for (var i = 0; i < __listeners.length; i++) {
    var l = __listeners[i];
    if (!(l.t === target && l.e === event)) kept.push(l);
  }
  __listeners = kept;
}
function __deliver(target, event, payload) {
  for (var i = 0; i < __listeners.length; i++) {
    var l = __listeners[i];
    if (l.e === event && (l.t === target || l.t === "*" || l.t === "self")) { try { l.fn(payload); } catch (err) { log("on " + event + ": " + err); } }
  }
}
// @module ce.core
/* --- the reactive core: watch / compute / intercept / defineAction ---------------------------
 * The verbs that do what setting a property cannot: a property is a CONSTANT chosen at design
 * time, each of these is a RULE the runtime keeps applying. In JS they live in the prelude rather
 * than in C++, for the same reason on()/off() do — QuickJS gives each script its own engine, so
 * these arrays are already scoped to one script and need no tagging. */
var __watchers = [], __computeds = [], __filters = [], __actions = {};
var __filterDepth = 0, __reactiveDepth = 0;

function __sig(v) { return v === undefined ? "\u0000void" : JSON.stringify(v); }
// A rule REPLACES the same path's rule rather than stacking beside it: two filters on one path
// would make the result depend on the order they happened to register in.
function __putRule(list, rule) {
  for (var i = 0; i < list.length; i++) if (list[i].path === rule.path) { list[i] = rule; return; }
  list.push(rule);
}
function watch(path, fn) { __putRule(__watchers, { path: path, fn: fn, last: __sig(get(path)), prev: undefined }); }
function compute(path, fn) { __putRule(__computeds, { path: path, fn: fn, failed: false }); }
function intercept(path, fn) { __putRule(__filters, { path: path, fn: fn }); }
function defineAction(name, fn) {
  var id = String(name == null ? "" : name).replace(/^\s+|\s+$/g, "");
  if (!id || typeof fn !== "function") return;
  __actions[id.toLowerCase()] = { name: id, fn: fn };
}
function __actionNames() { var out = []; for (var k in __actions) out.push(__actions[k].name); return out; }
function __callAction(name, args) {
  var a = __actions[String(name).toLowerCase()];
  if (!a) return { found: false };
  try { return { found: true, value: a.fn(args) }; }
  catch (err) { logError("action " + name + ": " + err); return { found: true }; }
}
/* Run the filters for one path. Returns { reject } or { value }. */
function __applyIntercepts(path, value) {
  if (!__filters.length || __filterDepth > 0) return { value: value };   // no re-entry from a filter's own set()
  __filterDepth++;
  try {
    for (var i = 0; i < __filters.length; i++) {
      if (__filters[i].path !== path) continue;
      var out;
      try { out = __filters[i].fn(value, value); } catch (err) { logError("intercept " + path + ": " + err); continue; }
      if (out === false) return { reject: true };
      if (out === undefined || out === null) continue;   // no opinion — keep what we had
      value = out;
    }
  } finally { __filterDepth--; }
  return { value: value };
}
/* Settle the formulas, then correct anything a filter owns, then report the changes. Computes go
 * first so a watcher never sees an intermediate value the panel did not actually hold. */
var __MAX_SETTLE = 8;
function __runReactive() {
  if (!__watchers.length && !__computeds.length && !__filters.length) return;
  if (__reactiveDepth > 0) return;
  __reactiveDepth++;
  try {
    for (var pass = 0; pass < __MAX_SETTLE; pass++) {
      var wrote = false;
      for (var i = 0; i < __computeds.length; i++) {
        var c = __computeds[i];
        if (c.failed) continue;
        var next;
        try { next = c.fn(); } catch (err) { logError("compute " + c.path + ": " + err); c.failed = true; continue; }
        if (next === undefined) continue;
        if (__sig(next) === __sig(get(c.path))) continue;
        set(c.path, next); wrote = true;
      }
      if (!wrote) break;
      if (pass === __MAX_SETTLE - 1)
        logError("compute(): still changing after " + __MAX_SETTLE + " passes — two formulas are feeding "
                 + "each other. They are left at the last value rather than looped on.");
    }
    // Changes that never came through set() — the user moving a control, inbound MIDI, a dump
    // landing — still obey their filter. Needs an idempotent filter to settle, which snapping,
    // clamping and quantising all are.
    for (var f = 0; f < __filters.length; f++) {
      var cur = get(__filters[f].path);
      if (cur === undefined) continue;
      var d = __applyIntercepts(__filters[f].path, cur);
      if (d.reject) continue;                       // a veto has nothing to revert to
      if (__sig(d.value) !== __sig(cur)) set(__filters[f].path, d.value);
    }
    for (var w = 0; w < __watchers.length; w++) {
      var rule = __watchers[w], v = get(rule.path), s = __sig(v);
      if (s === rule.last) continue;
      var previous = rule.prev;
      rule.last = s; rule.prev = v;
      try { rule.fn(v, previous); } catch (err) { logError("watch " + rule.path + ": " + err); }
    }
  } finally { __reactiveDepth--; }
}
// @module -
// set() runs this script's intercept() filters before the host sees the value, so the rule holds
// for every write instead of being re-checked at each call site.
function set(path, value, opts) {
  var d = __applyIntercepts(path, value);
  if (d.reject) return undefined;
  return __api.set(path, d.value, opts || null);
}
function get(path, form) { return __api.get(path, form || "value"); }

// `self` — owner-relative set/get (Q7), parity with the Lua/Python preludes. __owner is injected per
// script (boot string below). Plain object literal (not an ES class) so it works in QuickJS configs
// without class support. Empty/"self"/"*" owner => no prefix.
function __ownerPrefix(p) {
  var o = (typeof __owner !== 'undefined' && __owner) ? __owner : "";
  return !o ? p : (o + "." + p);
}
var self = {
  set: function (p, value, opts) { return __api.set(__ownerPrefix(p), value, opts || null); },
  get: function (p, form) { return __api.get(__ownerPrefix(p), form || "value"); }
};
// @module ce.midi
function sendCC(ch, cc, v) { return __api.sendCC(ch, cc, v); }
function sendNRPN(ch, msb, lsb, v) { return __api.sendNRPN(ch, msb, lsb, v); }
function sendSysex(bytes) { return __api.sendSysex(bytes); }
// @module ce.device
// requestDump is assembled further down, over __api.requestDump: it takes an optional callback,
// which is a language value the host has no per-engine way to call back.
function applyDump(bytes) { return __api.applyDump(bytes); }
function sendDump(kind) { return __api.sendDump(kind); }
function buildDump(kind) { return __api.buildDump(kind); }
// @module ce.time
function startTimer(id, ms) { return __api.startTimer(id, ms || 0); }
function stopTimer(id) { return __api.stopTimer(id); }
// @module -
function run(target, args) { return __api.run(target, args || null); }
function emit(name, data) { return __api.emit(name, data || null); }
function log(msg, v) { return __api.log(String(msg), v === undefined ? null : v); }
function noTransmit(fn) { __api.beginTransmit(false); try { fn(); } finally { __api.endTransmit(); } }
function transmit(fn) { __api.beginTransmit(true); try { fn(); } finally { __api.endTransmit(); } }

// @module ce.math
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function round(v) { return Math.round(v); }
function scale(v, inLo, inHi, outLo, outHi) { return inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo); }
function snap(v, step) { return step === 0 ? v : Math.round(v / step) * step; }
function lerp(a, b, t) { return a + (b - a) * t; }
function curve(v, shape) {
  shape = shape || "linear";
  if (shape === "exp") return v * v;
  if (shape === "log") return Math.sqrt(Math.max(0, v));
  if (shape === "s") return v * v * (3 - 2 * v);
  // A shape the list does not have used to return v in SILENCE, which reads as a curve that does
  // nothing rather than as a name that was never applied.
  if (shape !== "linear" && shape !== "")
    log("curve(v, \"" + shape + "\"): unknown shape — using linear. The names are \"linear\", "
        + "\"exp\", \"log\" and \"s\"; for any other shape use map(v, points).");
  return v;
}
// wrap(v, lo, hi) — bring a value round into a HALF-OPEN range, so wrap(12, 0, 12) is 0.
//
// This exists because the five runtimes disagree about `%`. (-1) % 12 is -1 here and in C++, C# and
// Java, and 11 in Lua and Python — so the ordinary way to write a pitch class already gives two
// different answers depending on which engine the panel is running in. The floored form below is
// written identically in every prelude, which is the only thing that stops that being true.
function wrap(v, lo, hi) {
  var a = Number(lo) || 0, b = Number(hi) || 0, n = Number(v) || 0;
  var span = b - a;
  // An empty or inverted range has exactly one answer.
  if (!(span > 0)) return a;
  return a + (((n - a) % span) + span) % span;
}
// [[x, y], …] sorted by x. Accepts pairs and { x: , y: } objects, so a panel can write either.
function __points(points) {
  var out = [];
  if (points && points.length !== undefined) {
    for (var i = 0; i < points.length; i++) {
      var p = points[i], x, y;
      if (p && p.length !== undefined) { x = p[0]; y = p[1]; }
      else if (p) { x = p.x; y = p.y; }
      x = Number(x); y = Number(y);
      if (isFinite(x) && isFinite(y)) out.push([x, y]);
    }
  }
  out.sort(function(p, q) { return p[0] - q[0]; });
  return out;
}
// map(v, points) — straight lines through breakpoints: a response curve of the panel's own shape,
// which is what curve()'s closed set of four names cannot express. Outside the outermost points the
// value is HELD rather than extrapolated, because a curve drawn between 0 and 1 that runs away past
// 1 is never what the author drew.
function mapCurve(v, points) {
  var list = __points(points);
  if (list.length === 0) return Number(v);
  var n = Number(v);
  if (!isFinite(n)) return list[0][1];
  // An exact hit on a breakpoint takes the LAST point with that x. That is what makes two points
  // sharing an x a STEP rather than a divide by zero, and it settles which side of the step the
  // breakpoint itself belongs to — the value it steps TO.
  for (var k = list.length - 1; k >= 0; k--) if (list[k][0] === n) return list[k][1];
  if (n < list[0][0]) return list[0][1];
  var last = list[list.length - 1];
  if (n > last[0]) return last[1];
  for (var i = 1; i < list.length; i++) {
    var x0 = list[i - 1][0], y0 = list[i - 1][1], x1 = list[i][0], y1 = list[i][1];
    if (n < x1 && x1 !== x0) return y0 + (n - x0) * (y1 - y0) / (x1 - x0);
  }
  return last[1];
}
function __numbers(values) {
  var out = [];
  if (values && values.length !== undefined)
    for (var i = 0; i < values.length; i++) {
      var n = Number(values[i]);
      if (isFinite(n)) out.push(n);
    }
  return out;
}
// quantizeTo(v, values) — nearest entry in a LIST rather than a regular step. A tie goes to the
// LOWER value, so the answer never depends on how the two distances happened to round.
function quantizeTo(v, values) {
  var list = __numbers(values);
  if (list.length === 0) return Number(v);
  var n = Number(v);
  if (!isFinite(n)) return list[0];
  var best = list[0], bestD = Math.abs(n - best);
  for (var i = 0; i < list.length; i++) {
    var d = Math.abs(n - list[i]);
    if (d < bestD || (d === bestD && list[i] < best)) { best = list[i]; bestD = d; }
  }
  return best;
}
// dbToGain / gainToDb. Neither Lua nor JavaScript has them, and a level control that reads in dB
// and sends a linear value needs them on every move. A gain of zero or less is the 24-bit noise
// floor rather than negative infinity, which is a number nothing here can put on a label.
var __MIN_DB = -144;
function dbToGain(db) { return Math.pow(10, (Number(db) || 0) / 20); }
function gainToDb(gain) {
  var g = Number(gain) || 0;
  if (g <= 0) return __MIN_DB;
  var db = 20 * Math.log(g) / Math.LN10;
  return db < __MIN_DB ? __MIN_DB : db;
}
// The rest of the arithmetic a synth panel actually does. Nothing here duplicates the language's
// own scalar maths (Math.min/max/abs/floor all exist); what IS here is domain-specific,
// list-shaped (a spread over a long list has the same limit Lua's varargs do), or has to be
// identical in five runtimes to be worth anything.
function __num(v, fallback) { var x = Number(v); return isFinite(x) ? x : (fallback === undefined ? 0 : fallback); }
// norm/denorm CLAMP. scale(v, lo, hi, 0, 1) is the hand-rolled version and does not, so a value
// past the end came out past 1 and stayed wrong all the way down the chain.
function norm(v, lo, hi) {
  var a = __num(lo), b = __num(hi);
  if (a === b) return 0;
  var t = (__num(v) - a) / (b - a);
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}
function denorm(t, lo, hi) {
  var a = __num(lo), b = __num(hi), x = __num(t);
  return a + (x < 0 ? 0 : (x > 1 ? 1 : x)) * (b - a);
}
function bipolar(t) { return __num(t) * 2 - 1; }
function unipolar(v) { return (__num(v) + 1) / 2; }
// fold comes back OFF the end instead of round it. wrap() jumps top to bottom, which is right for
// a pitch class and wrong for a modulation depth — a fold reflects, so movement stays continuous.
function fold(v, lo, hi) {
  var a = __num(lo), b = __num(hi), span = b - a;
  if (!(span > 0)) return a;
  var t = Math.abs(__num(v) - a) % (span * 2);
  return a + (t > span ? span * 2 - t : t);
}
// 0..1 to one of `count`, zero-based. The hand-rolled floor(t * count) returns `count` itself at
// exactly 1.0 — one past the end of the list it addresses, and only when a knob is fully up.
function indexOfRange(t, count) {
  var n = Math.floor(__num(count));
  if (n <= 0) return 0;
  var i = Math.floor(norm(t, 0, 1) * n);
  return i >= n ? n - 1 : i;
}
// The Crossfader component's three laws, which a script could not compute. equalPower is the one
// that matters: a linear fade between two sounds dips in the middle, audibly.
function crossfade(a, b, t, law) {
  var x = norm(t, 0, 1), from = __num(a), to = __num(b);
  law = String(law === undefined || law === null ? "linear" : law).toLowerCase();
  if (law === "equalpower") {
    var angle = x * Math.PI / 2;
    return from * Math.cos(angle) + to * Math.sin(angle);
  }
  if (law === "sharp") {
    var g = x * x * (3 - 2 * x);
    return from * (1 - g) + to * g;
  }
  return from + (to - from) * x;
}
// A rate limit with no state of its own, so it works from any handler without a timer. ce.anim owns
// motion the RUNTIME drives; this is the one a script drives itself, per incoming message.
function approach(current, target, maxStep) {
  var from = __num(current), to = __num(target), step = Math.abs(__num(maxStep));
  if (!(step > 0)) return to;
  var delta = to - from;
  if (Math.abs(delta) <= step) return to;
  return from + (delta > 0 ? step : -step);
}
function roundTo(v, decimals) {
  var d = Math.floor(__num(decimals));
  var f = Math.pow(10, d < 0 ? 0 : d);
  return Math.round(__num(v) * f) / f;
}
function almost(a, b, epsilon) {
  var tol = Math.abs(__num(epsilon, 1e-9)) || 1e-9;
  return Math.abs(__num(a) - __num(b)) <= tol;
}
function __nums(values) {
  var out = [];
  if (values && values.length !== undefined)
    for (var i = 0; i < values.length; i++) {
      var n = Number(values[i]);
      if (isFinite(n)) out.push(n);
    }
  return out;
}
function minOf(values) {
  var l = __nums(values);
  if (!l.length) return undefined;
  var best = l[0];
  for (var i = 0; i < l.length; i++) if (l[i] < best) best = l[i];
  return best;
}
function maxOf(values) {
  var l = __nums(values);
  if (!l.length) return undefined;
  var best = l[0];
  for (var i = 0; i < l.length; i++) if (l[i] > best) best = l[i];
  return best;
}
function sumOf(values) {
  var l = __nums(values), total = 0;
  for (var i = 0; i < l.length; i++) total += l[i];
  return total;
}
function meanOf(values) {
  var l = __nums(values);
  return l.length ? sumOf(l) / l.length : undefined;
}
// Morph one list into another, which is what a snapshot morph IS. The SHORTER list decides the
// length: padding with zeros would drag the missing entries to nothing, and on a patch that is a
// set of parameters slammed to their minimum.
function blend(a, b, t) {
  var from = __nums(a), to = __nums(b), x = __num(t), out = [];
  var n = Math.min(from.length, to.length);
  for (var i = 0; i < n; i++) out.push(from[i] + (to[i] - from[i]) * x);
  return out;
}
// Every random below draws a FIXED number of times, so a seed replays the sequence whichever of
// them a panel used.
function randomFloat(lo, hi) {
  var a = __num(lo), b = __num(hi, 1);
  return a + random() * (b - a);
}
// A bell rather than a slab: humanising velocity with a uniform random is what sounds mechanical.
// Box-Muller, always two draws — it deliberately does NOT cache the second value the way the
// textbook version does, because a varying draw count would break seed replay.
function randomGaussian(mean, sd) {
  var u1 = random();
  if (u1 < 1e-12) u1 = 1e-12;
  var u2 = random();
  var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return __num(mean) + z * __num(sd, 1);
}
// Folded rather than clamped: a walk that clamps sticks to the end it hit and stops moving.
function randomWalk(current, step, lo, hi) {
  var nextValue = __num(current) + (random() * 2 - 1) * Math.abs(__num(step));
  if (lo === undefined || lo === null || hi === undefined || hi === null) return nextValue;
  return fold(nextValue, __num(lo), __num(hi));
}
function randomBool(chance) { return random() < __num(chance, 0.5); }
function shuffle(values) {
  var out = [];
  if (values && values.length !== undefined) for (var k = 0; k < values.length; k++) out.push(values[k]);
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
// Geometry, in ce.draw's convention: DEGREES, 0 at twelve o'clock, clockwise. Rebuilding that from
// atan2 by hand is where a knob pointer ends up running backwards or a quadrant out.
function toDegrees(radians) { return __num(radians) * 180 / Math.PI; }
function toRadians(degrees) { return __num(degrees) * Math.PI / 180; }
function distance(x1, y1, x2, y2) {
  var dx = __num(x2) - __num(x1), dy = __num(y2) - __num(y1);
  return Math.sqrt(dx * dx + dy * dy);
}
function angleOf(x1, y1, x2, y2) {
  var dx = __num(x2) - __num(x1), dy = __num(y2) - __num(y1);
  var a = toDegrees(Math.atan2(dx, -dy));
  return a < 0 ? a + 360 : a;
}
function polar(angle, radius) {
  var a = toRadians(__num(angle)), r = __num(radius);
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}
// The transforms the Properties panel itself applies, matched exactly rather than approximated.
// shape() is NOT curve(): curve() is the older family (exp = v*v, log = sqrt v, s-curve spelled
// "s"), while the panel spells it "scurve", has a "hold", and computes exp/log from a tension
// exponent whose default is 1.6 rather than 0. Odd in the app, and matched here on purpose.
function shapeCurve(v, curve, tension) {
  var t = norm(v, 0, 1);
  var ten = __num(tension, 0) || 1.6;
  var k = 1 + Math.max(0, ten);
  var name = String(curve);
  if (name === "exp") return Math.pow(t, k);
  if (name === "log") return 1 - Math.pow(1 - t, k);
  if (name === "scurve" || name === "s") return t * t * (3 - 2 * t);
  if (name === "hold") return t >= 1 ? 1 : 0;
  return t;
}
// The Expression Router's input shaping. Below the threshold the value is zero and the REMAINING
// range rescales to fill 0-1, so response starts at the edge of the dead zone.
function deadzone(v, amount, invert) {
  var x = norm(v, 0, 1);
  if (invert === true) x = 1 - x;
  var dz = norm(amount, 0, 1);
  if (dz > 0) x = x <= dz ? 0 : (x - dz) / (1 - dz);
  return norm(x, 0, 1);
}
// The inverse-distance blend a Timbre Space and a Preset Constellation use, normalised to sum to 1.
function weightsFor(points, x, y, power) {
  var raw = [], out = [], total = 0;
  if (!points || points.length === undefined) return out;
  var px = norm(x, 0, 1), py = norm(y, 0, 1);
  var p = Math.max(0.5, __num(power, 2));
  for (var i = 0; i < points.length; i++) {
    var dx = __num(points[i].x) - px, dy = __num(points[i].y) - py;
    var w = 1 / (Math.pow(dx * dx + dy * dy, p / 2) + 1e-6);
    raw.push(w);
    total += w;
  }
  for (var j = 0; j < raw.length; j++) out.push(total > 0 ? raw[j] / total : 1 / raw.length);
  return out;
}
// A weighted average: what weightsFor is for, and what a morph pad IS.
function blendBy(values, weights) {
  var v = __nums(values), w = __nums(weights);
  var n = Math.min(v.length, w.length), sum = 0, total = 0;
  for (var i = 0; i < n; i++) { sum += v[i] * w[i]; total += w[i]; }
  return total > 0 ? sum / total : 0;
}
// The 0-1 stop positions a slider's scale is drawn from.
function tickStops(major, minor) {
  var majorCount = Math.max(2, Math.round(__num(major, 11)));
  var minorCount = Math.max(0, Math.round(__num(minor, 0)));
  var out = { major: [], minor: [] };
  for (var index = 0; index < majorCount; index++) {
    var normalized = index / (majorCount - 1);
    out.major.push(normalized);
    if (index >= majorCount - 1 || minorCount <= 0) continue;
    for (var m = 1; m <= minorCount; m++)
      out.minor.push(normalized + (m / (minorCount + 1)) * (1 / (majorCount - 1)));
  }
  return out;
}
// Where a level sits on a dB meter, which is a different question from how many dB it is.
function dbPosition(fraction, floorDb, ceilDb) {
  var frac = norm(fraction, 0, 1);
  var floor = __num(floorDb, -60), ceil = __num(ceilDb, 6);
  if (ceil === floor) return 0;
  var db = 20 * Math.log(Math.max(frac, 1e-4)) / Math.LN10;
  return norm((db - floor) / (ceil - floor), 0, 1);
}
// Taming what arrives on the wire. smooth is NOT approach: approach moves a FIXED step (a rate
// limit), this moves a PROPORTION of what is left, which settles fast then creeps. It is lerp
// underneath; the reasons it is a member are the coefficient clamp and that it ARRIVES - a
// one-pole is asymptotic, so left alone it sits at 0.9999 and the control transmits forever.
function smooth(current, target, coefficient, epsilon) {
  var from = __num(current), to = __num(target);
  var k = norm(coefficient, 0, 1);
  var tol = Math.abs(__num(epsilon, 1e-4)) || 1e-4;
  if (Math.abs(to - from) <= tol) return to;
  return from + (to - from) * k;
}
// A Schmitt trigger: on at `high`, off at `low`, HOLDS between. A plain threshold chatters, and on
// a bound control that is dozens of MIDI messages a second.
function hysteresis(value, on, low, high) {
  var v = __num(value), lo = __num(low), hi = __num(high);
  if (lo > hi) { var t = lo; lo = hi; hi = t; }
  return on === true ? v > lo : v >= hi;
}
// A mean SMEARS a spike across the result; a median rejects it.
function median(values) {
  var l = __nums(values).slice().sort(function (a, b) { return a - b; });
  if (!l.length) return undefined;
  var mid = l.length >> 1;
  return l.length % 2 ? l[mid] : (l[mid - 1] + l[mid]) / 2;
}
// The inverse of shape(), for going device -> panel THROUGH a taper. The same k as shape().
function unshape(y, curve, tension) {
  var v = norm(y, 0, 1);
  var ten = __num(tension, 0) || 1.6;
  var k = 1 + Math.max(0, ten);
  var name = String(curve);
  if (name === "exp") return Math.pow(v, 1 / k);
  if (name === "log") return 1 - Math.pow(1 - v, 1 / k);
  // The closed-form inverse of smoothstep; a numeric solve would not agree to the last bit.
  if (name === "scurve" || name === "s") return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
  // hold is a step, so this returns the EARLIEST input that produces the output.
  if (name === "hold") return v >= 1 ? 1 : 0;
  return v;
}
// @module ce.math
// A seeded xorshift32, masked to 32 bits at every step and written identically in every prelude.
// Seeded is the whole point: the language's own Math.random cannot promise the same sequence in
// five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
// different in the editor and in the export.
var __RND_DEFAULT = 0x9E3779B9;
var __rnd = __RND_DEFAULT;
function randomSeed(n) {
  var v = (Math.floor(Number(n) || 0)) >>> 0;
  // 0 is a DEAD state for xorshift — it would return zero forever — so it means "the default"
  // rather than "a generator that never moves".
  __rnd = v === 0 ? __RND_DEFAULT : v;
}
function random(lo, hi) {
  var x = __rnd;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  __rnd = x;
  var r = x / 4294967296;
  if (lo === undefined || lo === null || hi === undefined || hi === null) return r;
  var a = Math.floor(Number(lo) || 0), b = Math.floor(Number(hi) || 0);
  var low = Math.min(a, b), high = Math.max(a, b);
  // Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
  return low + Math.floor(r * (high - low + 1));
}
// randomChoice(values [, weights]) — a pick from the SEEDED generator, so a randomised patch
// replays. Exactly ONE number is drawn in every branch, weighted or not: a weighted pick consuming
// a different amount of the sequence would change what everything after it picked, and "the same
// seed replays the same sequence" would quietly stop being true.
function randomChoice(values, weights) {
  if (!values || values.length === undefined || values.length === 0) return undefined;
  var r = random();
  var w = [], total = 0;
  if (weights && weights.length !== undefined)
    for (var i = 0; i < weights.length; i++) {
      var n = Number(weights[i]) || 0;
      if (n < 0) n = 0;
      w[i] = n;
      total += n;
    }
  if (!(total > 0)) return values[Math.floor(r * values.length)];
  var ticket = r * total;
  for (var j = 0; j < values.length; j++) {
    ticket -= w[j] || 0;
    if (ticket < 0) return values[j];
  }
  return values[values.length - 1];
}

// @module ce.music
var __NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteName(n) { n = Math.floor(n); return __NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
function noteNumber(name) { var m = /^([A-G]#?)(-?\d+)$/.exec(name); if (!m) return 0; var i = __NOTES.indexOf(m[1]); return i < 0 ? 0 : (parseInt(m[2], 10) + 1) * 12 + i; }

// BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// @module ce.music
var __CE_SCALES = {};
var __CE_CHORDS = {};
__CE_SCALES["major"] = [0,2,4,5,7,9,11];
__CE_SCALES["minor"] = [0,2,3,5,7,8,10];
__CE_SCALES["harmonicMinor"] = [0,2,3,5,7,8,11];
__CE_SCALES["melodicMinor"] = [0,2,3,5,7,9,11];
__CE_SCALES["dorian"] = [0,2,3,5,7,9,10];
__CE_SCALES["phrygian"] = [0,1,3,5,7,8,10];
__CE_SCALES["lydian"] = [0,2,4,6,7,9,11];
__CE_SCALES["mixolydian"] = [0,2,4,5,7,9,10];
__CE_SCALES["locrian"] = [0,1,3,5,6,8,10];
__CE_SCALES["pentatonicMaj"] = [0,2,4,7,9];
__CE_SCALES["pentatonicMin"] = [0,3,5,7,10];
__CE_SCALES["blues"] = [0,3,5,6,7,10];
__CE_CHORDS["major"] = [0,4,7];
__CE_CHORDS["minor"] = [0,3,7];
__CE_CHORDS["dim"] = [0,3,6];
__CE_CHORDS["aug"] = [0,4,8];
__CE_CHORDS["sus2"] = [0,2,7];
__CE_CHORDS["sus4"] = [0,5,7];
__CE_CHORDS["power"] = [0,7];
__CE_CHORDS["maj6"] = [0,4,7,9];
__CE_CHORDS["min6"] = [0,3,7,9];
__CE_CHORDS["dom7"] = [0,4,7,10];
__CE_CHORDS["maj7"] = [0,4,7,11];
__CE_CHORDS["min7"] = [0,3,7,10];
__CE_CHORDS["minMaj7"] = [0,3,7,11];
__CE_CHORDS["dim7"] = [0,3,6,9];
__CE_CHORDS["m7b5"] = [0,3,6,10];
__CE_CHORDS["aug7"] = [0,4,8,10];
__CE_CHORDS["add9"] = [0,4,7,14];
__CE_CHORDS["dom9"] = [0,4,7,10,14];
__CE_CHORDS["maj9"] = [0,4,7,11,14];
__CE_CHORDS["min9"] = [0,3,7,10,14];
// END GENERATED music tables

// Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
// or a name ("C4"), the way sendNote does. An unknown scale or chord name returns undefined rather
// than guessing "major" — a script that asked for something this build does not know should find out.
function __pitch(v) { return typeof v === "string" ? noteNumber(v) : Math.floor(Number(v) || 0); }
function __steps(tbl, name, fallback) { return tbl[name === undefined || name === null ? fallback : String(name)]; }
function scaleNotes(root, scale) {
  var s = __steps(__CE_SCALES, scale, "major"); if (!s) return undefined;
  var base = __pitch(root); var out = []; for (var i = 0; i < s.length; i++) out.push(base + s[i]); return out;
}
function chordNotes(root, chordType) {
  var s = __steps(__CE_CHORDS, chordType, "major"); if (!s) return undefined;
  var base = __pitch(root); var out = []; for (var i = 0; i < s.length; i++) out.push(base + s[i]); return out;
}
function quantizeNote(note, root, scale) {
  var s = __steps(__CE_SCALES, scale, "major"); if (!s) return undefined;
  var n = __pitch(note), base = __pitch(root), inKey = {};
  for (var i = 0; i < s.length; i++) inKey[(((base + s[i]) % 12) + 12) % 12] = true;
  // Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested before
  // the -d one, so a note exactly between two scale tones lands on the same one in every runtime.
  for (var d = 0; d <= 6; d++) {
    if (inKey[(((n + d) % 12) + 12) % 12]) return n + d;
    if (inKey[(((n - d) % 12) + 12) % 12]) return n - d;
  }
  return n;
}
// @module ce.midi
function to14bit(v) { v = Math.floor(v); return { msb: Math.floor(v / 128) % 128, lsb: v % 128 }; }
function from14bit(msb, lsb) { return msb * 128 + lsb; }
function to7bit(v, count, order) { count = count || 2; order = order || "msb"; v = Math.floor(v); var out = []; for (var i = 0; i < count; i++) { out.push(v % 128); v = Math.floor(v / 128); } return order === "msb" ? out.reverse() : out; }
function from7bit(bytes, order) { order = order || "msb"; var v = 0; var b = order === "msb" ? bytes : bytes.slice().reverse(); for (var i = 0; i < b.length; i++) v = v * 128 + b[i]; return v; }
function toNibbles(b) { b = Math.floor(b); return { hi: Math.floor(b / 16) % 16, lo: b % 16 }; }
function fromNibbles(hi, lo) { return hi * 16 + lo; }
function nibblize(bytes) { var o = []; for (var i = 0; i < bytes.length; i++) { var n = toNibbles(bytes[i]); o.push(n.hi, n.lo); } return o; }
function denibblize(bytes) { var o = []; for (var i = 0; i < bytes.length; i += 2) o.push(fromNibbles(bytes[i], bytes[i + 1] || 0)); return o; }
function toAscii(str, length) { var o = []; for (var i = 0; i < str.length; i++) o.push(str.charCodeAt(i)); if (length) while (o.length < length) o.push(32); return o; }
function fromAscii(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
function toOffset(v, center) { return v + center; }
function fromOffset(b, center) { return b - center; }
function toSigned(v, bits) { var m = Math.pow(2, bits); return v < 0 ? v + m : v; }
function fromSigned(b, bits) { var m = Math.pow(2, bits); return b >= m / 2 ? b - m : b; }

// checksum(kind, bytes) — "roland"/"yamaha" are the same two's-complement 7-bit sum; "sum" is the
// plain 7-bit sum; "xor" is the running XOR. The one-argument form checksum(bytes) defaults to
// roland (the spelling panels shipped with before the contract was enforced).
function checksum(kind, bytes) {
  if (bytes === undefined || bytes === null) { bytes = kind; kind = "roland"; }
  kind = String(kind === undefined || kind === null ? "roland" : kind).toLowerCase();
  var sum = 0, x = 0;
  for (var i = 0; i < bytes.length; i++) {
    var b = Math.floor(bytes[i]) & 0xff;
    sum = (sum + b) % 128;
    x = (x ^ b) & 0x7f;
  }
  if (kind === "xor") return x;
  if (kind === "sum") return sum;
  return (128 - sum) % 128;
}

// panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
// order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
// out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
function panic(opts) {
  opts = opts || {};
  var reset = opts.resetControllers !== false;
  var first = 1, last = 16;
  if (opts.channel !== undefined && opts.channel !== null) { first = Math.floor(opts.channel); last = first; }
  for (var ch = first; ch <= last; ch++) {
    sendCC(ch, 120, 0);
    sendCC(ch, 123, 0);
    if (reset) sendCC(ch, 121, 0);
  }
}

// @module -
// Every member declared runtime:'webview' in panelApi.js. The components are modelled and rendered
// in the panel view; there is no C++ counterpart to drive with the window closed. Defining them
// here as explaining stubs means a script that strays across the boundary says so, instead of dying on an undefined global.
// The list below is GENERATED — 248 names maintained by hand in three files is 744 chances to
// mistype one, and a mistyped stub is a missing name in exactly one engine.
// BEGIN GENERATED webview-only stubs — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
var __WEBVIEW_ONLY = [
// @module ce.device
  "deviceBind","deviceUnbind",
// @module ce.ui
  "uiNotify","uiStatus","uiDialog",
// @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawText","drawRedraw",
// @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
  "panelEntries","panelEntry","panelDefine","panelUndefine","panelPatch",
// @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
// @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell",
// @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn",
// @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree",
// @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
// @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpDegree","arpChordType","arpVelocity","arpChannel","arpEuclid",
  "arpEuclidSteps","arpEuclidPulses","arpEuclidRotate",
// @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadChordType","chordPadVoicing",
  "chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel","chordPadStrum",
  "chordPadLatch",
// @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonBaseNote","noteRibbonOctaves",
  "noteRibbonBendRange","noteRibbonVelocity","noteRibbonChannel","noteRibbonLatch",
// @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols",
// @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep",
// @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest",
// @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth",
// @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity",
// @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
// @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY",
// @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth",
// @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
// @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep",
// @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember",
// @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
// @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnRate",
  "ribbonSnap",
// @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnToCenter",
  "crossfaderReturnRate",
// @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnToCenter","joystickReturnAxes",
  "joystickReturnRate",
// @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay",
// @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
// @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal",
// @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue",
// @module ce.components.pixel
  "pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow","pixelAnim",
  "pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop",
];
// @module -
var __global = (typeof globalThis !== 'undefined') ? globalThis : this;
for (var __i = 0; __i < __WEBVIEW_ONLY.length; __i++) {
  __global[__WEBVIEW_ONLY[__i]] = (function (name) {
    return function () {
      log("[panel] " + name + "() needs the panel window open — that component is drawn and modelled in the panel view, so there is nothing to drive while the window is closed.");
      // undefined, explicitly — the JS engine has no zero-value hazard, but a stub whose result a
      // script reads has to read as "nothing", the same as the Lua and Python ones.
      return undefined;
    };
  })(__WEBVIEW_ONLY[__i]);
}
// END GENERATED webview-only stubs

// @module ce.ui
// dialog() is the one webview-only verb that owes its caller something. A script asks a question
// and waits in the callback; if the callback never runs, that script waits forever. So window-
// closed it answers the only honest answer there is — nobody is here — and says so in the return
// value, which is `false`: no dialog was shown, and your callback has already been called.
// Assigned, NOT declared. A `function uiDialog()` declaration is hoisted to the top of the script,
// so the stub loop above would run afterwards and overwrite it. An assignment executes in order.
__global.uiDialog = function (opts, onChoice) {
  log("[panel] dialog() needs the panel window open — there is nobody to ask with the window closed, so it counts as dismissed.");
  if (typeof onChoice === 'function') onChoice(undefined);
  return false;
};

// @module ce.midi
// MIDI channel messages — arithmetic over sendMidi, the way panic() is over sendCC, which is what
// makes them work identically in every runtime and every exported language. `note` accepts a MIDI
// number or a name ("C3"), because a script that reads musically should be allowed to say so.
// @module ce.core
// Levels the console already renders differently, which a script could not reach until now.
// Both PRINT — neither throws; a script wanting to stop uses `throw`.
// logWarn / logError, NOT warn / error — a global `error` would shadow Lua's builtin in the
// sibling engine, and the flat names have to be the same in every language.
function logWarn(message, value) { return __api.logAt("warn", String(message), value); }
function logError(message, value) { return __api.logAt("error", String(message), value); }

// @module ce.midi
function sendMidi(bytes) { return __api.sendMidi(bytes); }
function __ch(c) { c = Math.floor(Number(c) || 1); return (c < 1 ? 1 : (c > 16 ? 16 : c)) - 1; }
function __7(v) { v = Math.floor(Number(v) || 0); return v < 0 ? 0 : (v > 127 ? 127 : v); }
function __note(n) { return typeof n === "string" ? noteNumber(n) : __7(n); }

// A duration schedules the note off — otherwise every script that plays a note hand-rolls a timer,
// and getting that wrong means a hung voice, the one MIDI mistake you hear rather than read.
function sendNote(channel, note, velocity, ms) {
  var n = __note(note);
  sendMidi([0x90 | __ch(channel), n, __7(velocity)]);
  if (ms !== undefined && ms !== null && ms > 0)
    after(ms, function () { sendMidi([0x80 | __ch(channel), n, 0]); });
}
// routeMidi / feedMidi / the wire filters. interceptMidiIn|Out filter the WIRE, as opposed to
// ce.core.intercept which filters a model path: inbound reaches the panel's bindings, the note
// input and the transport long before any script sees it, so the HOST runs these chains.
function routeMidi(role, fn) { __api.beginRoute(String(role || "")); try { fn(); } finally { __api.endRoute(); } }
function feedMidi(bytes) { return __api.feedMidi(bytes); }
var __midiIn = [], __midiOut = [];
function interceptMidiIn(fn) { __midiIn = [fn]; }
function interceptMidiOut(fn) { __midiOut = [fn]; }
function __applyMidiFilter(inbound, bytes) {
  var chain = inbound ? __midiIn : __midiOut;
  for (var i = 0; i < chain.length; i++) {
    var out;
    // A throwing filter passes the message through UNCHANGED: a broken script must not be able to
    // silence a synth.
    try { out = chain[i](bytes); } catch (err) { logError("interceptMidi: " + err); continue; }
    if (out === false) return { swallow: true };
    if (out === undefined || out === null) continue;
    if (out.length) bytes = out;
  }
  return { bytes: bytes };
}
function sendRPN(channel, msb, lsb, value) {
  // RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range (0,0),
  // fine tuning (0,1) and coarse tuning (0,2).
  var s = 0xB0 | __ch(channel);
  var v = Math.floor(Number(value) || 0); v = v < 0 ? 0 : (v > 16383 ? 16383 : v);
  sendMidi([s, 0x65, __7(msb), s, 0x64, __7(lsb), s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F]);
}
// Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
function sendSongPosition(beats) {
  var b = Math.floor(Number(beats) || 0); b = b < 0 ? 0 : (b > 16383 ? 16383 : b);
  sendMidi([0xF2, b & 0x7F, (b >> 7) & 0x7F]);
}
function sendNoteOff(channel, note, velocity) { sendMidi([0x80 | __ch(channel), __note(note), __7(velocity || 0)]); }
function sendProgramChange(channel, program, bankMsb, bankLsb) {
  // Bank select first: a device applies the bank that was in force when the program change lands.
  if (bankMsb !== undefined && bankMsb !== null) sendCC(channel, 0, __7(bankMsb));
  if (bankLsb !== undefined && bankLsb !== null) sendCC(channel, 32, __7(bankLsb));
  sendMidi([0xC0 | __ch(channel), __7(program)]);
}
function sendPitchBend(channel, value) {
  var v = Math.floor(Number(value)); if (!isFinite(v)) v = 8192;
  if (v < 0) v = 0; else if (v > 16383) v = 16383;
  sendMidi([0xE0 | __ch(channel), v % 128, Math.floor(v / 128) % 128]);
}
function sendAftertouch(channel, pressure, note) {
  if (note !== undefined && note !== null) sendMidi([0xA0 | __ch(channel), __note(note), __7(pressure)]);
  else sendMidi([0xD0 | __ch(channel), __7(pressure)]);
}
function sendClock() { sendMidi([0xF8]); }
function sendTransport(action) {
  action = String(action === undefined || action === null ? "start" : action).toLowerCase();
  if (action === "stop") sendMidi([0xFC]);
  else if (action === "continue") sendMidi([0xFB]);
  else sendMidi([0xFA]);
}

// @module ce.time
// Musical time. One host primitive behind tempo() / isPlaying() / transportInfo(), so the three
// can never disagree; the conversions are pure arithmetic on top. Nothing here starts or stops the
// transport — a panel does not own the DAW's playhead.
function __transport() {
  var t = __api.transportState();
  if (t === null || t === undefined) {
    return { playing: false, bpm: null, beats: 0, beatsPerBar: 4, source: "none", valid: false };
  }
  return t;
}
function transportInfo() {
  var t = __transport();
  var bpb = t.beatsPerBar || 4;
  if (bpb < 1) bpb = 4;
  var beats = t.beats || 0;
  return {
    playing: t.playing === true, bpm: t.bpm, beats: beats,
    bar: Math.floor(beats / bpb) + 1,
    beat: Math.floor(beats % bpb) + 1,
    beatsPerBar: bpb, source: t.source || "none", valid: t.valid === true
  };
}
function tempo() { var t = __transport(); return (t.bpm && t.bpm > 0) ? t.bpm : null; }
function isPlaying() { return __transport().playing === true; }
function beatsToMs(beats, bpm) {
  bpm = bpm || tempo();
  if (!bpm || bpm <= 0) return null;
  return (Number(beats) || 0) * 60000 / bpm;
}
function msToBeats(ms, bpm) {
  bpm = bpm || tempo();
  if (!bpm || bpm <= 0) return null;
  return (Number(ms) || 0) * bpm / 60000;
}
function syncTimer(id, beats) {
  var ms = beatsToMs(beats);
  if (ms === null) {
    log("syncTimer(\"" + id + "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.");
    return;
  }
  startTimer(id, Math.round(ms));
}

// after(ms, fn) — run fn ONCE, ms from now. Built on startTimer rather than on anything new (there
// is no setTimeout in QuickJS): the one-shot is a normal timer that removes itself, so stopTimer(id)
// cancels it like anything else.
//
// The order inside the tick is why this exists instead of every panel hand-rolling it. The entry is
// removed and the timer stopped BEFORE fn runs, so a callback that throws cannot leave a one-shot
// repeating forever — which is precisely what the hand-rolled version does.
var __after = {}, __afterN = 0;
function after(ms, fn) {
  if (typeof fn !== "function") {
    log("after(ms, fn) needs a function to run — nothing was scheduled");
    return undefined;
  }
  __afterN += 1;
  var id = "__after:" + __afterN;
  __after[id] = fn;
  startTimer(id, ms);
  return id;
}
// Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
// A one-shot is NOT a timer the panel declared, so it is swallowed here rather than surfacing as
// onTimer — otherwise every script with an onTimer handler would have to filter ids it never made.
on("*", "onTimer", function (info) {
  var id = info ? info.id : undefined;
  if (id === undefined || id === null) return;
  var fn = __after[id];
  if (!fn) return;
  delete __after[id];
  stopTimer(id);
  fn();
});

// @module ce.anim
// Values that move over time. The engine lives in the host so ONE list exists and the position is
// a pure function of elapsed time — an incremental integrator per runtime would drift.
function animateTo(path, target, opts) { __api.animate("to", String(path), Number(target) || 0, opts || null); }
function animateSpring(path, target, opts) { __api.animate("spring", String(path), Number(target) || 0, opts || null); }
function animateStop(path) { __api.animateStop(path === undefined || path === null ? "" : String(path)); }
function animateRunning(path) { return __api.animateRunning(path === undefined || path === null ? "" : String(path)); }

// @module ce.device
// Device READS — four wrappers over one host primitive, __api.deviceQuery, so the shape a script
// sees is assembled here rather than per engine. Without a device host the query returns null and
// the host has already said why; these hand back null / an empty list rather than pretending.
function __role(r) { return (r === undefined || r === null || r === "") ? "mainSynth" : String(r); }
function __deviceQuery(kind, payload) { return __api.deviceQuery(kind, payload || null); }
// @module ce.panel
// snapshot / restore. The only two ce.panel verbs that are NOT panel-view only: creating a control
// needs a renderer, reading and writing a value does not — and "put the panel back how it was
// before the solo" is a footswitch action in a DAW with the window shut.
//
// A control with no value of its own is LEFT OUT rather than recorded as nothing, so restoring a
// snapshot cannot blank a label by writing null over it.
function __panelQuery(kind, payload) { return __api.panelQuery(kind, payload || null); }
// each(fn) — fn(name) for every control, containers included, in document order.
function panelEach(fn) {
  if (typeof fn !== "function") {
    log("each(fn) needs a function to call — nothing was walked");
    return 0;
  }
  var names = __panelQuery("controls", null);
  if (!names) return 0;
  for (var i = 0; i < names.length; i++) fn(names[i]);
  return names.length;
}
function panelSnapshot() {
  var out = {}, names = __panelQuery("controls", null);
  if (!names) return out;
  for (var i = 0; i < names.length; i++) {
    var v = get(names[i] + ".value");
    if (v !== undefined && v !== null) out[names[i]] = v;
  }
  return out;
}
function panelRestore(snap) {
  if (!snap || typeof snap !== "object") return 0;
  var n = 0;
  for (var name in snap) {
    if (!Object.prototype.hasOwnProperty.call(snap, name)) continue;
    // A name the panel no longer has is skipped rather than failing the whole restore: a snapshot
    // taken before an edit is still worth most of what it holds.
    var cur = get(name + ".value");
    if (cur !== undefined && cur !== null) { set(name + ".value", snap[name]); n += 1; }
  }
  return n;
}

// @module ce.device
function deviceProfile(role) { return __deviceQuery("profile", { role: __role(role) }); }
// read / write. `read` is the LAST KNOWN value — what the synth most recently told us — not a live
// query: asking the synth is asynchronous and this verb is not. `write` encodes through the device
// profile and sends; it returns whether the message went out, not whether the synth accepted it.
function deviceRead(id, role) { return __deviceQuery("read", { role: __role(role), id: String(id) }); }
function deviceWrite(id, value, role) { return __api.deviceWrite(String(id), value, __role(role)) === true; }
function deviceConnected(role) { return __deviceQuery("connected", { role: __role(role) }) === true; }
// An undefined property must not be SENT. juce::var::undefined() stringifies to "undefined", so
// an omitted filter reached the host as the literal filter value "undefined" and matched nothing,
// while the Lua prelude simply has no key there. Omitting matches Lua and Python exactly.
function __devOpts(role, opts) {
  var q = { role: __role(role) };
  var keys = ["query", "group", "type", "access", "limit"];
  for (var i = 0; i < keys.length; i++) {
    var v = opts[keys[i]];
    if (v !== undefined && v !== null) q[keys[i]] = v;
  }
  return q;
}
function deviceParameters(opts) {
  opts = opts || {};
  var r = __deviceQuery("parameters", __devOpts(opts.role, opts));
  return r || [];
}
function deviceParameter(id, role) {
  return __deviceQuery("parameter", { role: __role(role), id: String(id) });
}
// ports() — what is actually plugged in. connected(role) only answers yes/no for a role somebody
// configured in advance; this enumerates the real ports, so a panel can offer a choice or notice a
// device that showed up.
function devicePorts(opts) {
  opts = opts || {};
  var q = {};
  if (opts.direction !== undefined && opts.direction !== null) q.direction = opts.direction;
  return __deviceQuery("ports", q) || [];
}
// defineParameter / defineDump — teaching the app a synth it was not shipped knowing. The ROLE
// rides inside the spec rather than as a fourth host argument, the way it rides inside
// __deviceQuery's payload: one ABI slot, and adding a field later changes no engine's signature.
function __define(what, id, spec, role) {
  spec = spec || {};
  if (role !== undefined && role !== null && role !== "") spec.role = String(role);
  return __api.deviceDefine(what, String(id), spec) === true;
}
function deviceDefineParameter(id, spec, role) { return __define("parameter", id, spec, role); }
function deviceDefineDump(kind, spec, role) { return __define("dump", kind, spec, role); }

// requestDump(kind [, fn [, opts]]) — closing the loop. Fire-and-forget was the odd one out:
// deviceRead answers where it is called, and a dump's answer turned up at onDumpReceived with
// nothing tying it to the request.
//
// The waiter is removed BEFORE the callback runs, so a throw inside it cannot leave one armed for
// the next dump — the same rule after() follows, for the same reason.
var __dumpWaiters = [];
function __resolveDumps(kind, role, values, err) {
  for (var i = 0; i < __dumpWaiters.length;) {
    var w = __dumpWaiters[i];
    if (!w.done && (w.kind === "" || w.kind === kind)) {
      w.done = true;
      __dumpWaiters.splice(i, 1);
      try { w.fn(values, { ok: !err, kind: kind, role: role || "", error: err || "" }); }
      catch (e) { log("requestDump callback failed: " + e); }
    } else i++;
  }
}
function requestDump(kind, fn, opts) {
  kind = String(kind === undefined || kind === null ? "" : kind);
  if (typeof fn === "function") {
    var ms = opts && Number(opts.timeout) > 0 ? Number(opts.timeout) : 3000;
    var waiter = { kind: kind, fn: fn, done: false };
    __dumpWaiters.push(waiter);
    // Resolved rather than left hanging: a synth that is off, or that does not answer this
    // request, is the common case and not the exotic one.
    after(ms, function() {
      if (waiter.done) return;
      __resolveDumps(kind, "", undefined, "no dump arrived within " + Math.floor(ms) + "ms");
    });
  }
  return __api.requestDump(kind);
}
// Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
// AFTER the declared events, so "the dump arrived" and "the dump I asked for arrived" cannot
// observe the panel in two different states.
on("*", "onDumpReceived", function(info) {
  __resolveDumps(info ? String(info.kind || "") : "", info ? String(info.role || "") : "",
                 info ? info.values : {}, null);
});

// @module ce.storage
// ce.storage. `state` is a plain object: QuickJS gives each script its own engine, whose globals
// live as long as the script is loaded, so it persists between handler calls with no host help.
// Settings go through the host, because they outlive the session.
var state = {};
function saveSetting(key, value) { return __api.saveSetting(String(key), value); }
// settings() lists every saved key; forget() deletes one and says whether there was one.
function listSettings() { return __api.listSettings() || []; }
function forgetSetting(key) { return __api.forgetSetting(String(key)) === true; }
function loadSetting(key, fallback) {
  var v = __api.loadSetting(String(key));
  return (v === undefined || v === null) ? fallback : v;
}

// @module -
// BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
// on top. ce.core is global: its members are never namespaced, so they appear here only for
// discoverability (ce.core.set is the same function as set).
var __CE_MODULES = {
  "ce.core": { "action": "defineAction", "compute": "compute", "emit": "emit", "error": "logError", "get": "get", "intercept": "intercept", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit", "warn": "logWarn", "watch": "watch" },
  "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "feed": "feedMidi", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "interceptIn": "interceptMidiIn", "interceptOut": "interceptMidiOut", "nibblize": "nibblize", "panic": "panic", "route": "routeMidi", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendRPN": "sendRPN", "sendSongPosition": "sendSongPosition", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned" },
  "ce.device": { "applyDump": "applyDump", "bind": "deviceBind", "buildDump": "buildDump", "connected": "deviceConnected", "defineDump": "deviceDefineDump", "defineParameter": "deviceDefineParameter", "parameter": "deviceParameter", "parameters": "deviceParameters", "ports": "devicePorts", "profile": "deviceProfile", "read": "deviceRead", "requestDump": "requestDump", "sendDump": "sendDump", "unbind": "deviceUnbind", "write": "deviceWrite" },
  "ce.math": { "almost": "almost", "angle": "angleOf", "approach": "approach", "bipolar": "bipolar", "blend": "blend", "blendBy": "blendBy", "chance": "randomBool", "choice": "randomChoice", "clamp": "clamp", "crossfade": "crossfade", "curve": "curve", "dbPosition": "dbPosition", "dbToGain": "dbToGain", "deadzone": "deadzone", "degrees": "toDegrees", "denorm": "denorm", "distance": "distance", "fold": "fold", "gainToDb": "gainToDb", "gaussian": "randomGaussian", "hysteresis": "hysteresis", "index": "indexOfRange", "lerp": "lerp", "map": "mapCurve", "max": "maxOf", "mean": "meanOf", "median": "median", "min": "minOf", "norm": "norm", "polar": "polar", "quantize": "quantizeTo", "radians": "toRadians", "random": "random", "randomFloat": "randomFloat", "round": "round", "roundTo": "roundTo", "scale": "scale", "seed": "randomSeed", "shape": "shapeCurve", "shuffle": "shuffle", "smooth": "smooth", "snap": "snap", "sum": "sumOf", "ticks": "tickStops", "unipolar": "unipolar", "unshape": "unshape", "walk": "randomWalk", "weights": "weightsFor", "wrap": "wrap" },
  "ce.music": { "chord": "chordNotes", "name": "noteName", "number": "noteNumber", "quantize": "quantizeNote", "scale": "scaleNotes" },
  "ce.time": { "after": "after", "beatsToMs": "beatsToMs", "msToBeats": "msToBeats", "playing": "isPlaying", "startTimer": "startTimer", "stopTimer": "stopTimer", "syncTimer": "syncTimer", "tempo": "tempo", "transport": "transportInfo" },
  "ce.anim": { "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo" },
  "ce.ui": { "dialog": "uiDialog", "notify": "uiNotify", "status": "uiStatus" },
  "ce.draw": { "arc": "drawArc", "circle": "drawCircle", "clear": "drawClear", "fill": "drawFill", "line": "drawLine", "path": "drawPath", "rect": "drawRect", "redraw": "drawRedraw", "stroke": "drawStroke", "text": "drawText" },
  "ce.panel": { "clone": "panelClone", "create": "panelCreate", "define": "panelDefine", "destroy": "panelDestroy", "each": "panelEach", "entries": "panelEntries", "entry": "panelEntry", "find": "panelFind", "info": "panelInfo", "parent": "panelParent", "patch": "panelPatch", "restore": "panelRestore", "snapshot": "panelSnapshot", "types": "panelTypes", "undefine": "panelUndefine" },
  "ce.storage": { "forget": "forgetSetting", "loadSetting": "loadSetting", "saveSetting": "saveSetting", "settings": "listSettings", "state": "state" },
  "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "transpose": "splitTranspose" },
  "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
  "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
  "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
  "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "wrap": "setlistWrap" },
  "ce.components.arp": { "channel": "arpChannel", "chordType": "arpChordType", "degree": "arpDegree", "division": "arpDivision", "euclid": "arpEuclid", "euclidPulses": "arpEuclidPulses", "euclidRotate": "arpEuclidRotate", "euclidSteps": "arpEuclidSteps", "gate": "arpGate", "key": "arpKey", "latch": "arpLatch", "octaves": "arpOctaves", "pattern": "arpPattern", "rate": "arpRate", "run": "arpRun", "scale": "arpScale", "swing": "arpSwing", "sync": "arpSync", "velocity": "arpVelocity" },
  "ce.components.chordpad": { "channel": "chordPadChannel", "chordType": "chordPadChordType", "inversion": "chordPadInversion", "key": "chordPadKey", "latch": "chordPadLatch", "mode": "chordPadMode", "octave": "chordPadOctave", "scale": "chordPadScale", "strum": "chordPadStrum", "velocity": "chordPadVelocity", "voicing": "chordPadVoicing" },
  "ce.components.noteribbon": { "baseNote": "noteRibbonBaseNote", "bendRange": "noteRibbonBendRange", "channel": "noteRibbonChannel", "key": "noteRibbonKey", "latch": "noteRibbonLatch", "mode": "noteRibbonMode", "octaves": "noteRibbonOctaves", "scale": "noteRibbonScale", "velocity": "noteRibbonVelocity" },
  "ce.components.drumpads": { "baseNote": "drumPadsBaseNote", "channel": "drumPadsChannel", "cols": "drumPadsCols", "gate": "drumPadsGate", "map": "drumPadsMap", "mode": "drumPadsMode", "rows": "drumPadsRows", "velocity": "drumPadsVelocity" },
  "ce.components.turing": { "division": "turingDivision", "gate": "turingGate", "length": "turingLength", "quantize": "turingQuantize", "randomness": "turingRandomness", "rate": "turingRate", "run": "turingRun", "step": "turingStep", "sync": "turingSync" },
  "ce.components.looper": { "bars": "looperBars", "lane": "looperLane", "laneRest": "looperLaneRest", "quantize": "looperQuantize", "run": "looperRun", "seconds": "looperSeconds", "sync": "looperSync" },
  "ce.components.orbit": { "bars": "orbitBars", "node": "orbitNode", "nodeAngle": "orbitNodeAngle", "nodeDepth": "orbitNodeDepth", "nodeRadius": "orbitNodeRadius", "nodeRatio": "orbitNodeRatio", "phase": "orbitPhase", "rate": "orbitRate", "run": "orbitRun", "sync": "orbitSync" },
  "ce.components.kinetic": { "bounce": "kineticBounce", "friction": "kineticFriction", "gravity": "kineticGravity", "keepAlive": "kineticKeepAlive", "launch": "kineticLaunch", "run": "kineticRun", "sync": "kineticSync", "velocity": "kineticVelocity" },
  "ce.components.constellation": { "bars": "constellationBars", "blend": "constellationBlend", "links": "constellationLinks", "mode": "constellationMode", "probe": "constellationProbe", "rate": "constellationRate", "run": "constellationRun", "sync": "constellationSync" },
  "ce.components.timbre": { "anchorX": "timbreAnchorX", "anchorY": "timbreAnchorY", "move": "timbreMove", "power": "timbrePower" },
  "ce.components.router": { "cc": "routerCc", "channel": "routerChannel", "deadzone": "routerDeadzone", "dest": "routerDest", "destDepth": "routerDestDepth", "input": "routerInput", "invert": "routerInvert", "poly": "routerPoly", "source": "routerSource" },
  "ce.components.macro": { "slot": "macroSlot", "slotCurve": "macroSlotCurve", "slotDepth": "macroSlotDepth", "slotMax": "macroSlotMax", "slotMin": "macroSlotMin", "value": "macroValue" },
  "ce.components.matrix": { "bipolar": "matrixBipolar", "cell": "matrixCell", "clear": "matrixClear", "step": "matrixStep" },
  "ce.components.constraint": { "gap": "constraintGap", "member": "constraintMember", "mode": "constraintMode" },
  "ce.components.envelope": { "loop": "envelopeLoop", "loopEnd": "envelopeLoopEnd", "loopStart": "envelopeLoopStart", "phase": "envelopePhase", "pointCurve": "envelopePointCurve", "pointX": "envelopePointX", "pointY": "envelopePointY", "preset": "envelopePreset", "sustain": "envelopeSustain", "timeMax": "envelopeTimeMax" },
  "ce.components.ribbon": { "bipolar": "ribbonBipolar", "returnMode": "ribbonReturnMode", "returnRate": "ribbonReturnRate", "returnValue": "ribbonReturnValue", "snap": "ribbonSnap", "value": "ribbonValue" },
  "ce.components.crossfader": { "bipolar": "crossfaderBipolar", "detent": "crossfaderDetent", "law": "crossfaderLaw", "mix": "crossfaderMix", "returnRate": "crossfaderReturnRate", "returnToCenter": "crossfaderReturnToCenter" },
  "ce.components.joystick": { "bipolar": "joystickBipolar", "move": "joystickMove", "returnAxes": "joystickReturnAxes", "returnRate": "joystickReturnRate", "returnToCenter": "joystickReturnToCenter" },
  "ce.components.meter": { "decay": "meterDecay", "holdMs": "meterHoldMs", "peakHold": "meterPeakHold", "scale": "meterScale", "value": "meterValue" },
  "ce.components.transport": { "beatUnit": "transportBeatUnit", "beatsPerBar": "transportBeatsPerBar", "bpm": "transportBpm", "clockOut": "transportClockOut", "countIn": "transportCountIn", "loop": "transportLoop", "loopBars": "transportLoopBars", "loopStart": "transportLoopStart", "source": "transportSource", "swing": "transportSwing" },
  "ce.components.panic": { "centreBend": "panicSetCentreBend", "channel": "panicSetChannel", "clearLocal": "panicSetClearLocal", "resetControllers": "panicSetResetControllers", "scope": "panicSetScope" },
  "ce.components.lcd": { "backlight": "lcdBacklight", "blink": "lcdBlink", "brightness": "lcdBrightness", "clear": "lcdClear", "contrast": "lcdContrast", "cursor": "lcdCursor", "cursorAt": "lcdCursorAt", "scroll": "lcdScroll", "scrollSpeed": "lcdScrollSpeed", "text": "lcdText", "value": "lcdValue" },
  "ce.components.pixel": { "anim": "pixelAnim", "animLoop": "pixelAnimLoop", "animPreset": "pixelAnimPreset", "animSpeed": "pixelAnimSpeed", "backlight": "pixelBacklight", "brightness": "pixelBrightness", "contrast": "pixelContrast", "gamma": "pixelGamma", "glow": "pixelGlow" },
};
var __CE_ORDER = ["ce.core","ce.midi","ce.device","ce.math","ce.music","ce.time","ce.anim","ce.ui","ce.draw","ce.panel","ce.storage","ce.components.split","ce.components.phrase","ce.components.recorder","ce.components.harmony","ce.components.setlist","ce.components.arp","ce.components.chordpad","ce.components.noteribbon","ce.components.drumpads","ce.components.turing","ce.components.looper","ce.components.orbit","ce.components.kinetic","ce.components.constellation","ce.components.timbre","ce.components.router","ce.components.macro","ce.components.matrix","ce.components.constraint","ce.components.envelope","ce.components.ribbon","ce.components.crossfader","ce.components.joystick","ce.components.meter","ce.components.transport","ce.components.panic","ce.components.lcd","ce.components.pixel"];
var __CE_META = [{"id":"ce.core","version":"1.1","runtime":"any"},{"id":"ce.midi","version":"1.3","runtime":"any"},{"id":"ce.device","version":"1.3","runtime":"any"},{"id":"ce.math","version":"1.5","runtime":"any"},{"id":"ce.music","version":"1.1","runtime":"any"},{"id":"ce.time","version":"1.2","runtime":"any"},{"id":"ce.anim","version":"1.0","runtime":"any"},{"id":"ce.ui","version":"1.1","runtime":"webview"},{"id":"ce.draw","version":"1.1","runtime":"webview"},{"id":"ce.panel","version":"1.3","runtime":"any"},{"id":"ce.storage","version":"1.1","runtime":"any"},{"id":"ce.components.split","version":"1.0","runtime":"webview"},{"id":"ce.components.phrase","version":"1.0","runtime":"webview"},{"id":"ce.components.recorder","version":"1.0","runtime":"webview"},{"id":"ce.components.harmony","version":"1.0","runtime":"webview"},{"id":"ce.components.setlist","version":"1.0","runtime":"webview"},{"id":"ce.components.arp","version":"1.0","runtime":"webview"},{"id":"ce.components.chordpad","version":"1.0","runtime":"webview"},{"id":"ce.components.noteribbon","version":"1.0","runtime":"webview"},{"id":"ce.components.drumpads","version":"1.0","runtime":"webview"},{"id":"ce.components.turing","version":"1.0","runtime":"webview"},{"id":"ce.components.looper","version":"1.0","runtime":"webview"},{"id":"ce.components.orbit","version":"1.0","runtime":"webview"},{"id":"ce.components.kinetic","version":"1.0","runtime":"webview"},{"id":"ce.components.constellation","version":"1.0","runtime":"webview"},{"id":"ce.components.timbre","version":"1.0","runtime":"webview"},{"id":"ce.components.router","version":"1.0","runtime":"webview"},{"id":"ce.components.macro","version":"1.0","runtime":"webview"},{"id":"ce.components.matrix","version":"1.0","runtime":"webview"},{"id":"ce.components.constraint","version":"1.0","runtime":"webview"},{"id":"ce.components.envelope","version":"1.0","runtime":"webview"},{"id":"ce.components.ribbon","version":"1.0","runtime":"webview"},{"id":"ce.components.crossfader","version":"1.0","runtime":"webview"},{"id":"ce.components.joystick","version":"1.0","runtime":"webview"},{"id":"ce.components.meter","version":"1.0","runtime":"webview"},{"id":"ce.components.transport","version":"1.0","runtime":"webview"},{"id":"ce.components.panic","version":"1.0","runtime":"webview"},{"id":"ce.components.lcd","version":"1.0","runtime":"webview"},{"id":"ce.components.pixel","version":"1.0","runtime":"webview"}];
var __CE_VALUES = {"state":true};
var __CE_GATE_MSG = "{member}() needs the {module} module, which this panel has not enabled. Add \"{module}\" to the panel's Scripting Modules (Export tab) — or clear the list to let it follow the scripts automatically.";
// The real implementation of every member, captured before anything is gated, so turning a module
// back on restores the function rather than leaving the stub in place.
var __CE_REAL = {};
var ce = {};

function __ce_gate(member, module) {
  return function () {
    log(__CE_GATE_MSG.split("{member}").join(member).split("{module}").join(module));
  };
}

// __ce_apply_modules(enabled) — enabled is an array of module ids, or null for "everything on".
// The host calls this with the panel's resolved list; a member of a module that is not on becomes
// a stub that names the module instead of a call that quietly works.
function __ce_apply_modules(enabled) {
  var __g = (typeof globalThis !== 'undefined') ? globalThis : this;
  var on = null;
  if (enabled !== undefined && enabled !== null) {
    on = {};
    on["ce.core"] = true;
    for (var i = 0; i < enabled.length; i++) on[enabled[i]] = true;
  }
  ce = {};
  for (var p = 0; p < __CE_ORDER.length; p++) {
    var path = __CE_ORDER[p];
    var live = (on === null) || (on[path] === true);
    var segs = path.split('.').slice(1);
    var node = ce;
    for (var s = 0; s < segs.length; s++) {
      if (!node[segs[s]]) node[segs[s]] = {};
      node = node[segs[s]];
    }
    var members = __CE_MODULES[path];
    for (var short in members) {
      if (!Object.prototype.hasOwnProperty.call(members, short)) continue;
      var global = members[short];
      if (!Object.prototype.hasOwnProperty.call(__CE_REAL, global)) __CE_REAL[global] = __g[global];
      var v = __CE_REAL[global];
      if (!live && __CE_VALUES[global] !== true) v = __ce_gate(global, path);
      __g[global] = v;
      node[short] = v;
    }
  }
  ce.version = "1.0";
  ce.runtime = "player";
  ce.language = "javascript";
  ce.modules = [];
  for (var m = 0; m < __CE_META.length; m++) {
    if (on === null || on[__CE_META[m].id] === true) ce.modules.push(__CE_META[m]);
  }
  ce.has = function (id) {
    for (var k = 0; k < ce.modules.length; k++) {
      if (ce.modules[k].id === id) {
        return ce.modules[k].runtime === "any" || ce.modules[k].runtime === ce.runtime;
      }
    }
    return false;
  };
  __g.ce = ce;
}

// __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
// (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
// prelude first, so its globals already exist by the time this runs; re-applying the gate then
// treats it exactly like anything else.
function __ce_register_module(path, members, version, runtime) {
  if (!Object.prototype.hasOwnProperty.call(__CE_MODULES, path)) __CE_ORDER.push(path);
  __CE_MODULES[path] = members;
  for (var i = 0; i < __CE_META.length; i++) {
    if (__CE_META[i].id === path) { __CE_META[i].version = version; __CE_META[i].runtime = runtime; return; }
  }
  __CE_META.push({ id: path, version: version, runtime: runtime });
}

__ce_apply_modules(null);
// END GENERATED module namespace
)JS";

// Build the native "__api" object the prelude wraps.
juce::DynamicObject::Ptr makeApi (ScriptHostApi* host, const juce::String& owner)
{
    using Args = juce::var::NativeFunctionArgs;
    auto api = new juce::DynamicObject();
    juce::ignoreUnused (owner); // owner-relative resolution is applied via `self`/__owner in the prelude

    // Every JS number is a double, so `sendCC(1, 74, 100)` handed the host 100.0 where Lua and
    // Python hand it 100 — the same integer/float asymmetry solToVar/varToSol already fold for Lua.
    // Numerically it never mattered (the host casts to int), but anything that STRINGIFIES a script
    // value — log(), JSON state — printed "100.0" from JS and "100" from the other two. Fold it
    // here, at the one point every JS argument crosses.
    auto arg = [] (const Args& a, int i) -> juce::var
    {
        if (i >= a.numArguments) return {};
        const auto& v = a.arguments[i];
        if (v.isDouble())
        {
            const double d = (double) v;
            if (d == std::floor (d) && std::abs (d) < 9.0e15) return juce::var ((juce::int64) d);
        }
        return v;
    };

    api->setMethod ("set", [host, arg] (const Args& a) -> juce::var
        { host->setValue (arg (a, 0).toString(), arg (a, 1), arg (a, 2)); return {}; });
    api->setMethod ("get", [host, arg] (const Args& a) -> juce::var
        { return host->getValue (arg (a, 0).toString(), arg (a, 1).toString()); });
    api->setMethod ("sendCC", [host, arg] (const Args& a) -> juce::var
        { host->sendCC ((int) arg (a, 0), (int) arg (a, 1), arg (a, 2)); return {}; });
    api->setMethod ("sendNRPN", [host, arg] (const Args& a) -> juce::var
        { host->sendNRPN ((int) arg (a, 0), (int) arg (a, 1), (int) arg (a, 2), arg (a, 3)); return {}; });
    api->setMethod ("sendSysex", [host, arg] (const Args& a) -> juce::var { host->sendSysex (arg (a, 0)); return {}; });
    api->setMethod ("sendMidi", [host, arg] (const Args& a) -> juce::var { host->sendMidi (arg (a, 0)); return {}; });
    api->setMethod ("requestDump", [host, arg] (const Args& a) -> juce::var { host->requestDump (arg (a, 0).toString()); return {}; });
    api->setMethod ("applyDump", [host, arg] (const Args& a) -> juce::var { host->applyDump (arg (a, 0)); return {}; });
    api->setMethod ("sendDump", [host, arg] (const Args& a) -> juce::var { host->sendDump (arg (a, 0).toString()); return {}; });
    api->setMethod ("buildDump", [host, arg] (const Args& a) -> juce::var { return host->buildDump (arg (a, 0).toString()); });
    api->setMethod ("animate", [host, arg] (const Args& a) -> juce::var
        { host->startAnimation (arg (a, 0).toString(), arg (a, 1).toString(), (double) arg (a, 2), arg (a, 3)); return {}; });
    api->setMethod ("animateStop", [host, arg] (const Args& a) -> juce::var
        { host->stopAnimation (arg (a, 0).toString()); return {}; });
    api->setMethod ("animateRunning", [host, arg] (const Args& a) -> juce::var
        { return host->animationRunning (arg (a, 0).toString()); });
    api->setMethod ("transportState", [host] (const Args&) -> juce::var { return host->transportState(); });
    api->setMethod ("deviceQuery", [host, arg] (const Args& a) -> juce::var
        { return host->deviceQuery (arg (a, 0).toString(), arg (a, 1)); });
    api->setMethod ("deviceDefine", [host, arg] (const Args& a) -> juce::var
        { return host->deviceDefine (arg (a, 0).toString(), arg (a, 1).toString(), arg (a, 2)); });
    api->setMethod ("panelQuery", [host, arg] (const Args& a) -> juce::var
        { return host->panelQuery (arg (a, 0).toString(), arg (a, 1)); });
    api->setMethod ("deviceWrite", [host, arg] (const Args& a) -> juce::var
        { return host->deviceWrite (arg (a, 0).toString(), arg (a, 1), arg (a, 2).toString()); });
    api->setMethod ("startTimer", [host, arg] (const Args& a) -> juce::var { host->startTimer (arg (a, 0).toString(), (int) arg (a, 1)); return {}; });
    api->setMethod ("stopTimer", [host, arg] (const Args& a) -> juce::var { host->stopTimer (arg (a, 0).toString()); return {}; });
    api->setMethod ("saveSetting", [host, arg] (const Args& a) -> juce::var { host->saveSetting (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("loadSetting", [host, arg] (const Args& a) -> juce::var { return host->loadSetting (arg (a, 0).toString()); });
    api->setMethod ("listSettings", [host] (const Args&) -> juce::var { return host->listSettings(); });
    api->setMethod ("forgetSetting", [host, arg] (const Args& a) -> juce::var { return host->forgetSetting (arg (a, 0).toString()); });
    api->setMethod ("run", [host, arg] (const Args& a) -> juce::var { return host->runAction (arg (a, 0).toString(), arg (a, 1)); });
    api->setMethod ("emit", [host, arg] (const Args& a) -> juce::var { host->emitEvent (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("log", [host, arg] (const Args& a) -> juce::var { host->log (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("logAt", [host, arg] (const Args& a) -> juce::var
        { host->logAt (arg (a, 0).toString(), arg (a, 1).toString(), arg (a, 2)); return {}; });
    api->setMethod ("beginTransmit", [host, arg] (const Args& a) -> juce::var { host->beginTransmitOverride ((bool) arg (a, 0)); return {}; });
    api->setMethod ("beginRoute", [host, arg] (const Args& a) -> juce::var { host->beginRouteOverride (arg (a, 0).toString()); return {}; });
    api->setMethod ("endRoute",   [host]      (const Args&)   -> juce::var { host->endRouteOverride(); return {}; });
    api->setMethod ("feedMidi",   [host, arg] (const Args& a) -> juce::var { host->feedMidi (arg (a, 0)); return {}; });
    api->setMethod ("endTransmit", [host] (const Args&) -> juce::var { host->endTransmitOverride(); return {}; });
    return api;
}

class JsScriptEngine final : public ScriptEngine
{
public:
    juce::String language() const override { return "javascript"; }

    bool installApi (ScriptHostApi& h) override { host = &h; return true; }

    // Stored, not applied: every script gets its own QuickJS engine, so the gate goes on at load.
    // Changing the set after scripts are loaded re-gates the engines that already exist, which is
    // what makes toggling a module in the editor take effect without a reload.
    void setEnabledModules (const juce::StringArray& moduleIds) override
    {
        enabledModules = moduleIds;
        for (auto& [id, eng] : engines)
        {
            juce::ignoreUnused (id);
            eng->execute (moduleGateCall());
        }
    }

    // Also stored rather than applied: QuickJS gives each script its own engine, so a module has to
    // be installed into each of them. Re-installing into engines that already exist keeps a module
    // added mid-session usable without reloading every script.
    void setExtensionModules (const juce::var& modules) override
    {
        extensions = modules;
        const auto boot = extensionBoot();
        if (boot.isEmpty()) return;
        for (auto& [id, eng] : engines)
        {
            juce::ignoreUnused (id);
            eng->execute (boot);
        }
    }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        // TypeScript runs as the JS the editor already transpiled (compiledSource). Raw TS — type
        // annotations, interfaces — won't parse in QuickJS, so a TS script with no compiledSource
        // is an editor/build error: report and skip rather than feed unparseable source in.
        const bool isTs = def.language.equalsIgnoreCase ("typescript");
        if (isTs && def.compiledSource.isEmpty())
        {
            onError (def.id, "typescript script has no compiled JS (transpile failed) — skipping");
            return false;
        }
        const juce::String code = def.compiledSource.isNotEmpty() ? def.compiledSource : def.source;

        auto eng = std::make_unique<juce::JavascriptEngine>();
        // Anti-flood / loop guard (scripting-redesign §7 keep-list): QuickJS's
        // interrupt handler aborts any evaluate/callFunction that runs longer
        // than this, so `while (true) {}` in a handler can't freeze the DAW.
        eng->maximumExecutionTime = juce::RelativeTime::seconds (2.0);
        eng->registerNativeObject ("__api", makeApi (host, def.owner).get());

        // Inject owner + prelude + the user source (or transpiled JS for TypeScript).
        // resolveSelfOwner: a panel script's `self` is the panel, a component script's is its control.
        juce::String boot = "var __owner = " + resolveSelfOwner (def).quoted() + ";\n";
        // …then gate the API down to the panel's declared modules. QuickJS gives every script its
        // own engine, so the gate is applied per script here rather than once for the language.
        auto r1 = eng->execute (boot + juce::String (kJsPrelude) + "\n" + extensionBoot() + moduleGateCall());
        if (r1.failed()) { onError (def.id, "prelude error: " + r1.getErrorMessage()); return false; }

        auto r2 = eng->execute (code);
        if (r2.failed()) { onError (def.id, "load error: " + r2.getErrorMessage()); return false; }

        engines[def.id] = std::move (eng);
        return true;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        auto it = engines.find (scriptId);
        if (it == engines.end()) return false;
        juce::Result err = juce::Result::ok();
        auto v = it->second->evaluate ("typeof " + fn + " === 'function'", &err);
        return err.wasOk() && (bool) v;
    }

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        auto it = engines.find (scriptId);
        if (it == engines.end()) return {};
        juce::Result err = juce::Result::ok();
        const juce::var args[] = { payload };
        auto result = it->second->callFunction (juce::Identifier (fn),
                                                juce::var::NativeFunctionArgs (juce::var(), args, 1), &err);
        if (err.failed()) onError (scriptId, err.getErrorMessage());
        return result;
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            const juce::var args[] = { target, event, payload };
            kv.second->callFunction (juce::Identifier ("__deliver"),
                                     juce::var::NativeFunctionArgs (juce::var(), args, 3), &err);
            if (err.failed()) onError ("on:" + event, err.getErrorMessage());
        }
    }

    /* --------------------------------------------------------------- the reactive core
     * The rules live in each engine's prelude (see __runReactive there), because QuickJS gives
     * every script its own engine — so the arrays are already scoped to one script and the C++
     * side is only the caller. Every engine gets a pass: a formula in one script has to settle
     * whatever moved in another. */
    void runReactive (const ScriptErrorSink& onError) override
    {
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            kv.second->callFunction (juce::Identifier ("__runReactive"),
                                     juce::var::NativeFunctionArgs (juce::var(), nullptr, 0), &err);
            if (err.failed()) onError ("compute/watch", err.getErrorMessage());
        }
    }

    bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError) override
    {
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            const juce::var args[] = { inbound, bytes };
            auto out = kv.second->callFunction (juce::Identifier ("__applyMidiFilter"),
                                                juce::var::NativeFunctionArgs (juce::var(), args, 2), &err);
            if (err.failed()) { onError ("interceptMidi", err.getErrorMessage()); continue; }
            if (auto* o = out.getDynamicObject())
            {
                if (o->hasProperty ("swallow")) return false;
                if (o->hasProperty ("bytes")) bytes = o->getProperty ("bytes");
            }
        }
        return true;
    }

    bool applyIntercepts (const juce::String& path, juce::var& value, const ScriptErrorSink& onError) override
    {
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            const juce::var args[] = { path, value };
            auto out = kv.second->callFunction (juce::Identifier ("__applyIntercepts"),
                                                juce::var::NativeFunctionArgs (juce::var(), args, 2), &err);
            if (err.failed()) { onError ("intercept:" + path, err.getErrorMessage()); continue; }
            if (auto* o = out.getDynamicObject())
            {
                if (o->hasProperty ("reject")) return false;
                if (o->hasProperty ("value")) value = o->getProperty ("value");
            }
        }
        return true;
    }

    bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                     const ScriptErrorSink& onError) override
    {
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            const juce::var a[] = { name, args };
            auto out = kv.second->callFunction (juce::Identifier ("__callAction"),
                                                juce::var::NativeFunctionArgs (juce::var(), a, 2), &err);
            if (err.failed()) { onError ("action:" + name, err.getErrorMessage()); continue; }
            if (auto* o = out.getDynamicObject())
                if ((bool) o->getProperty ("found")) { result = o->getProperty ("value"); return true; }
        }
        return false;
    }

    juce::StringArray registeredActions() const override
    {
        juce::StringArray out;
        for (auto& kv : engines)
        {
            juce::Result err = juce::Result::ok();
            auto names = kv.second->callFunction (juce::Identifier ("__actionNames"),
                                                  juce::var::NativeFunctionArgs (juce::var(), nullptr, 0), &err);
            if (err.failed()) continue;
            if (auto* arr = names.getArray())
                for (auto& n : *arr) out.addIfNotAlreadyThere (n.toString());
        }
        return out;
    }

    void reset() override { engines.clear(); }

private:
    /** Each installed ce.ext.* module's JS prelude, followed by its registration call. Emitted as
        one string because a QuickJS engine is fed source, not objects. A module that ships no
        JavaScript contributes nothing here — its members simply never appear in this engine. */
    juce::String extensionBoot() const
    {
        auto* arr = extensions.getArray();
        if (arr == nullptr) return {};

        juce::String out;
        for (const auto& item : *arr)
        {
            auto* obj = item.getDynamicObject();
            if (obj == nullptr) continue;
            const auto id = obj->getProperty ("id").toString();
            if (id.isEmpty()) continue;

            juce::String source;
            if (auto* prelude = obj->getProperty ("prelude").getDynamicObject())
                source = prelude->getProperty ("javascript").toString();
            if (source.isEmpty()) continue;

            juce::StringArray pairs;
            if (auto* list = obj->getProperty ("members").getArray())
            {
                for (const auto& m : *list)
                {
                    auto* mo = m.getDynamicObject();
                    if (mo == nullptr) continue;
                    const auto memberId = mo->getProperty ("id").toString();
                    if (memberId.isEmpty()) continue;
                    auto shortName = mo->getProperty ("name").toString();
                    if (shortName.isEmpty()) shortName = memberId;
                    pairs.add (shortName.quoted() + ":" + memberId.quoted());
                }
            }

            auto version = obj->getProperty ("version").toString();
            auto runtime = obj->getProperty ("runtime").toString();
            if (runtime.isEmpty()) runtime = "any";

            out << source << "\n"
                << "__ce_register_module(" << id.quoted() << ",{" << pairs.joinIntoString (",") << "},"
                << version.quoted() << "," << runtime.quoted() << ");\n";
        }
        return out;
    }

    /** `__ce_apply_modules([...])`, or `(null)` for "the panel declared nothing — everything on". */
    juce::String moduleGateCall() const
    {
        if (enabledModules.isEmpty()) return "__ce_apply_modules(null);";
        juce::StringArray quoted;
        for (const auto& id : enabledModules) quoted.add (id.quoted());
        return "__ce_apply_modules([" + quoted.joinIntoString (",") + "]);";
    }

    std::map<juce::String, std::unique_ptr<juce::JavascriptEngine>> engines;
    ScriptHostApi* host = nullptr;
    juce::StringArray enabledModules;
    juce::var extensions;               // ce.ext.* modules the panel carries
};

} // namespace

std::unique_ptr<ScriptEngine> createJsEngine() { return std::make_unique<JsScriptEngine>(); }

} // namespace ceditor::scripting
