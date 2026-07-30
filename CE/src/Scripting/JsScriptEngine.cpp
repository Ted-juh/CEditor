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
// The prelude tracks which timers exist (runningTimers) and which follow the tempo (syncTimer), so
// these are more than a pass-through to the host.
var __timerIds = {}, __syncFollow = {};
function startTimer(id, ms) {
  var key = String(id === undefined || id === null ? "" : id);
  if (!key) return undefined;
  // An explicit millisecond interval REPLACES a musical one: this is a script asking for
  // milliseconds, not beats.
  delete __syncFollow[key];
  __timerIds[key] = true;
  return __api.startTimer(key, Math.round(Number(ms) || 0));
}
function stopTimer(id) {
  var key = String(id === undefined || id === null ? "" : id);
  delete __syncFollow[key];
  delete __timerIds[key];
  return __api.stopTimer(key);
}
// The ids a script started BY NAME. One-shots are left out, all of them: after() hands back its id
// already, and the note-off sendNote schedules is not a script's to cancel.
function runningTimers() {
  var out = [];
  for (var k in __timerIds) {
    if (Object.prototype.hasOwnProperty.call(__timerIds, k) && k.indexOf("__after:") !== 0) out.push(k);
  }
  return out.sort();
}
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
// A Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`. The app's own
// algorithm - the Arpeggiator has used it since it shipped and a script could never compute one.
// Bresenham rather than recursive Bjorklund: same output, no recursion to port five times.
function euclid(steps, pulses, rotation) {
  var n = Math.max(1, Math.min(64, Math.round(__num(steps, 1))));
  var k = Math.max(0, Math.min(n, Math.round(__num(pulses, 0))));
  var out = [], i;
  if (k <= 0) { for (i = 0; i < n; i++) out.push(false); return out; }
  if (k >= n) { for (i = 0; i < n; i++) out.push(true); return out; }
  var bucket = 0;
  for (i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) { bucket -= n; out.push(true); } else out.push(false);
  }
  var rot = ((Math.round(__num(rotation, 0)) % n) + n) % n;
  return out.slice(rot).concat(out.slice(0, rot));
}
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
// ONE GENERATOR PER STREAM. QuickJS gives every script its own engine, so this table is already
// per script and the key only has to separate streams within one — where a single state meant
// shuffle() advanced what gaussian() read, and seeding one element reset the other.
var __rndStates = {};
var __streamOverride = "";
function randomSeed(n) {
  var v = (Math.floor(Number(n) || 0)) >>> 0;
  // 0 is a DEAD state for xorshift — it would return zero forever — so it means "the default"
  // rather than "a generator that never moves".
  __rndStates[__streamOverride] = v === 0 ? __RND_DEFAULT : v;
}
// Draws inside the block come from a generator of their own. A block rather than a name argument
// on nine verbs, the shape routeMidi already uses: the stream is a decision about a RUN of draws.
// Restored in a finally, so a throw inside cannot leave every later draw on the wrong stream.
function randomStream(name, fn) {
  if (typeof fn !== "function") {
    log("stream(name, fn) needs a block to run — nothing was drawn");
    return;
  }
  var previous = __streamOverride;
  __streamOverride = String(name === undefined || name === null ? "" : name);
  try { fn(); } finally { __streamOverride = previous; }
}
function random(lo, hi) {
  var x = __rndStates[__streamOverride];
  if (x === undefined) x = __RND_DEFAULT;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  __rndStates[__streamOverride] = x;
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

// @module ce.math
// Colour arithmetic. The app's own (utils/colorHelpers.js, utils/colorMath.js), ported for the same
// reason every table here is: a script lightening a colour and the border renderer lightening the
// same colour have to agree, or a script-drawn highlight sits a shade off the one beside it.
//
// In takes "RRGGBB", "AARRGGBB" or "#RRGGBB" — the last six characters are the colour. Out is
// "#RRGGBB", which CSS, SVG and a panel property all accept. The ONE exception is alpha(), which
// returns the panel's AARRGGBB: CSS's #RRGGBBAA is the same bytes the other way round.
function __cchan(hex) {
  var h = String(hex === undefined || hex === null ? "" : hex).split("#").join("");
  h = h.slice(-6);
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function __cbyte(v) {
  var n = Math.round(Number(v) || 0);
  return n < 0 ? 0 : (n > 255 ? 255 : n);
}
function rgbToHex(r, g, b) {
  var c = function (v) { var s = __cbyte(v).toString(16); return s.length < 2 ? "0" + s : s; };
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}
function hexToRgb(hex) {
  var c = __cchan(hex);
  return c === null ? undefined : { r: c[0], g: c[1], b: c[2] };
}
function lighten(hex, amount) {
  var c = __cchan(hex);
  if (c === null) return undefined;
  var f = isFinite(Number(amount)) ? Number(amount) : 0.4;
  return rgbToHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f);
}
function darken(hex, amount) {
  var c = __cchan(hex);
  if (c === null) return undefined;
  var f = isFinite(Number(amount)) ? Number(amount) : 0.55;
  return rgbToHex(c[0] * f, c[1] * f, c[2] * f);
}
// NOT an app algorithm, and said so: lerp() per channel in plain RGB.
function mixColour(a, b, t) {
  var x = __cchan(a), y = __cchan(b);
  if (x === null || y === null) return undefined;
  var f = Math.min(1, Math.max(0, Number(t) || 0));
  return rgbToHex(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f);
}
// The PANEL's form: AARRGGBB, no leading #, which is what a stored colour property holds.
function colourAlpha(hex, a) {
  var c = __cchan(hex);
  if (c === null) return undefined;
  var f = Math.min(1, Math.max(0, isFinite(Number(a)) ? Number(a) : 1));
  var aa = Math.round(f * 255).toString(16);
  if (aa.length < 2) aa = "0" + aa;
  return (aa + rgbToHex(c[0], c[1], c[2]).slice(1)).toUpperCase();
}
function hexToHsl(hex) {
  var c = __cchan(hex);
  if (c === null) return undefined;
  var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  var h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h: h, s: s * 100, l: l * 100 };
}
function hslToHex(hue, sat, light) {
  var h = Number(hue) || 0, s = (Number(sat) || 0) / 100, l = (Number(light) || 0) / 100;
  var a = s * Math.min(l, 1 - l);
  var f = function (n) {
    var k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

// @module ce.music
var __NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function __m12(n) { return ((Math.floor(n) % 12) + 12) % 12; }
// A flat lowers below the LETTER, so Cb is the B under C — one octave down, not up.
var __FLAT_LETTER = { C: 11, D: 1, E: 3, F: 4, G: 6, A: 8, B: 10 };
// Two spellings, chosen by whether the second argument is there at all. Omitted: this module's
// plain-ASCII names (C#4), what noteNumber has always round-tripped. Given: the PANEL's names, from
// the same generated table the Chord Pad and Harmoniser print from — true "E♭4", false "C♯4".
function noteName(n, flats) {
  n = Math.floor(n);
  var tbl = (flats === undefined || flats === null) ? __NOTES : (flats ? __CE_NOTE_FLAT : __CE_NOTE_SHARP);
  return tbl[__m12(n)] + (Math.floor(n / 12) - 1);
}
// Reads all four spellings: C4, C#4, C♯4, Db4, D♭4. An unreadable name is UNDEFINED, not 0 — 0 is a
// real MIDI note (C-1), so returning it for "Eb4" meant a typo played a wrong note in silence.
function noteNumber(name) {
  var m = /^([A-G])([#b]?)(-?\d+)$/.exec(String(name).split("♯").join("#").split("♭").join("b"));
  if (!m) return undefined;
  var pc = m[2] === "b" ? __FLAT_LETTER[m[1]] : __NOTES.indexOf(m[1] + m[2]);
  if (pc === undefined || pc < 0) return undefined;
  var oct = parseInt(m[3], 10) + ((m[2] === "b" && m[1] === "C") ? 0 : 1);
  return oct * 12 + pc;
}

// BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// @module ce.music
var __CE_SCALES, __CE_CHORDS, __CE_NOTE_SHARP, __CE_NOTE_FLAT, __CE_FLAT_KEYS, __CE_MINOR_SCALES, __CE_QUALITY_SUFFIX, __CE_ROMAN, __CE_MINOR_QUALITIES, __CE_DIVISIONS, __CE_DIVISION_LABELS, __CE_DIVISION_NAMES, __CE_TIME, __CE_EASINGS;
__CE_SCALES = {};
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
__CE_CHORDS = {};
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
__CE_NOTE_SHARP = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
__CE_NOTE_FLAT = ["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"];
__CE_FLAT_KEYS = {};
__CE_FLAT_KEYS[5] = true;
__CE_FLAT_KEYS[10] = true;
__CE_FLAT_KEYS[3] = true;
__CE_FLAT_KEYS[8] = true;
__CE_FLAT_KEYS[1] = true;
__CE_FLAT_KEYS[6] = true;
__CE_MINOR_SCALES = {};
__CE_MINOR_SCALES["dorian"] = true;
__CE_MINOR_SCALES["harmonicMinor"] = true;
__CE_MINOR_SCALES["locrian"] = true;
__CE_MINOR_SCALES["melodicMinor"] = true;
__CE_MINOR_SCALES["minor"] = true;
__CE_MINOR_SCALES["pentatonicMin"] = true;
__CE_MINOR_SCALES["phrygian"] = true;
__CE_QUALITY_SUFFIX = {};
__CE_QUALITY_SUFFIX["maj"] = "";
__CE_QUALITY_SUFFIX["min"] = "m";
__CE_QUALITY_SUFFIX["dim"] = "°";
__CE_QUALITY_SUFFIX["aug"] = "+";
__CE_QUALITY_SUFFIX["sus2"] = "sus2";
__CE_QUALITY_SUFFIX["sus4"] = "sus4";
__CE_QUALITY_SUFFIX["maj7"] = "maj7";
__CE_QUALITY_SUFFIX["dom7"] = "7";
__CE_QUALITY_SUFFIX["min7"] = "m7";
__CE_QUALITY_SUFFIX["m7b5"] = "m7♭5";
__CE_QUALITY_SUFFIX["dim7"] = "°7";
__CE_QUALITY_SUFFIX["minMaj7"] = "mMaj7";
__CE_ROMAN = ["I","II","III","IV","V","VI","VII"];
__CE_MINOR_QUALITIES = {};
__CE_MINOR_QUALITIES["dim"] = true;
__CE_MINOR_QUALITIES["dim7"] = true;
__CE_MINOR_QUALITIES["m7b5"] = true;
__CE_MINOR_QUALITIES["min"] = true;
__CE_MINOR_QUALITIES["min7"] = true;
__CE_MINOR_QUALITIES["minMaj7"] = true;
// @module ce.time
__CE_DIVISIONS = {};
__CE_DIVISIONS["1/1"] = 4;
__CE_DIVISIONS["1/2"] = 2;
__CE_DIVISIONS["1/4"] = 1;
__CE_DIVISIONS["1/8"] = 0.5;
__CE_DIVISIONS["1/16"] = 0.25;
__CE_DIVISIONS["1/32"] = 0.125;
__CE_DIVISIONS["1/2D"] = 3;
__CE_DIVISIONS["1/4D"] = 1.5;
__CE_DIVISIONS["1/8D"] = 0.75;
__CE_DIVISIONS["1/16D"] = 0.375;
__CE_DIVISIONS["1/2T"] = 1.3333333333333333;
__CE_DIVISIONS["1/4T"] = 0.6666666666666666;
__CE_DIVISIONS["1/8T"] = 0.3333333333333333;
__CE_DIVISIONS["1/16T"] = 0.16666666666666666;
__CE_DIVISION_LABELS = {};
__CE_DIVISION_LABELS["1/1"] = "Whole";
__CE_DIVISION_LABELS["1/2"] = "Half";
__CE_DIVISION_LABELS["1/4"] = "Quarter";
__CE_DIVISION_LABELS["1/8"] = "8th";
__CE_DIVISION_LABELS["1/16"] = "16th";
__CE_DIVISION_LABELS["1/32"] = "32nd";
__CE_DIVISION_LABELS["1/2D"] = "Half ·";
__CE_DIVISION_LABELS["1/4D"] = "Quarter ·";
__CE_DIVISION_LABELS["1/8D"] = "8th ·";
__CE_DIVISION_LABELS["1/16D"] = "16th ·";
__CE_DIVISION_LABELS["1/2T"] = "Half T";
__CE_DIVISION_LABELS["1/4T"] = "Quarter T";
__CE_DIVISION_LABELS["1/8T"] = "8th T";
__CE_DIVISION_LABELS["1/16T"] = "16th T";
__CE_DIVISION_NAMES = ["1/1","1/2","1/4","1/8","1/16","1/32","1/2D","1/4D","1/8D","1/16D","1/2T","1/4T","1/8T","1/16T"];
__CE_TIME = {};
__CE_TIME["ppqn"] = 24;
__CE_TIME["minBpm"] = 20;
__CE_TIME["maxBpm"] = 300;
// @module ce.anim
__CE_EASINGS = {};
__CE_EASINGS["inQuad"] = [0.55,0.085,0.68,0.53];
__CE_EASINGS["outQuad"] = [0.25,0.46,0.45,0.94];
__CE_EASINGS["inOutQuad"] = [0.455,0.03,0.515,0.955];
__CE_EASINGS["outCubic"] = [0.215,0.61,0.355,1];
// @module ce.music
// END GENERATED music tables

// Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
// or a name ("C4"), the way sendNote does. An unknown scale or chord name returns undefined rather
// than guessing "major" — a script that asked for something this build does not know should find out.
// noteNumber is undefined for a name it cannot read; __pitch feeds scaleNotes and friends, where an
// undefined root would turn one bad string into an unexplained undefined list.
function __pitch(v) { if (typeof v !== "string") return Math.floor(Number(v) || 0); var n = noteNumber(v); return n === undefined ? 0 : n; }
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

// Key, degree and voicing. Everything above answers a question about a note or a shape on its own;
// these answer questions about a note IN A KEY, which is what the Chord Pad, the Harmoniser and the
// Arpeggiator each work out for themselves. Same algorithms, not second opinions: a script naming a
// chord and the panel labelling the same chord have to agree or the panel contradicts itself.
function noteSpelling(root, scale) {
  var nm = (scale === undefined || scale === null) ? "major" : String(scale);
  if (!__CE_SCALES[nm]) return undefined;
  var pc = __m12(__pitch(root));
  // Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
  if (__CE_MINOR_SCALES[nm] === true) pc = __m12(pc + 3);
  return __CE_FLAT_KEYS[pc] === true;
}
function inScale(note, root, scale) {
  var s = __steps(__CE_SCALES, scale, "major"); if (!s) return undefined;
  var base = __m12(__pitch(root)), pc = __m12(__pitch(note));
  for (var i = 0; i < s.length; i++) if (__m12(base + s[i]) === pc) return true;
  return false;
}
// 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets undefined
// rather than the nearest one — rounding here turns a wrong note into a plausible chord, and
// quantizeNote is the verb that rounds on purpose.
function scaleDegree(note, root, scale) {
  var s = __steps(__CE_SCALES, scale, "major"); if (!s) return undefined;
  var base = __m12(__pitch(root)), pc = __m12(__pitch(note));
  for (var i = 0; i < s.length; i++) if (__m12(base + s[i]) === pc) return i + 1;
  return undefined;
}
// Name a chord from the notes in it, reading intervals above the lowest one: the inverse of
// chordNotes, in the vocabulary the Chord Pad labels with.
function chordQuality(notes) {
  var list = __sortedNotes(notes);
  if (!list.length) return undefined;
  var iv = {};
  for (var i = 0; i < list.length; i++) iv[__m12(list[i] - list[0])] = true;
  var has = function (a) { return iv[a] === true; };
  var third = has(3) ? "min" : has(4) ? "maj" : has(2) ? "sus2" : has(5) ? "sus4" : "";
  var fifth = has(7) ? "p5" : has(6) ? "d5" : has(8) ? "a5" : "";
  var seventh = has(10) ? "m7" : has(11) ? "M7" : (has(9) && fifth === "d5") ? "d7" : "";
  if (third === "min" && fifth === "d5") return seventh === "m7" ? "m7b5" : seventh === "d7" ? "dim7" : "dim";
  if (third === "maj" && fifth === "a5") return "aug";
  if (third === "min") return seventh === "m7" ? "min7" : seventh === "M7" ? "minMaj7" : "min";
  if (third === "maj") return seventh === "m7" ? "dom7" : seventh === "M7" ? "maj7" : "maj";
  if (third === "sus2") return "sus2";
  if (third === "sus4") return "sus4";
  return "maj";
}
// A roman numeral for a chord root, spelled against the MAJOR scale so borrowed degrees read as
// ♭III / ♭VI / ♭VII the way the Chord Pad's wheel labels them.
function __roman(rootSemitone, quality) {
  var semi = __m12(rootSemitone), best = 0, acc = "";
  for (var d = 0; d < 7; d++) {
    var diff = __m12(semi - __CE_SCALES["major"][d]);
    if (diff === 0) { best = d; acc = ""; break; }
    if (diff === 11) { best = d; acc = "♭"; }
    else if (diff === 1 && acc === "") { best = d; acc = "♯"; }
  }
  var r = __CE_ROMAN[best];
  if (__CE_MINOR_QUALITIES[quality] === true) r = r.toLowerCase();
  if (quality === "dim" || quality === "dim7" || quality === "m7b5") r += "°";
  if (quality === "aug") r += "+";
  return acc + r;
}
// The chord the key builds ON a degree, by stacking scale thirds. Degrees are 1-based like
// scaleDegree's. Past the top of the scale the stack keeps going an octave up rather than failing.
function degreeChord(root, scale, degree, size) {
  var nm = (scale === undefined || scale === null) ? "major" : String(scale);
  var s = __CE_SCALES[nm];
  if (!s || !s.length) return undefined;
  var n = s.length;
  var d = __count(degree, 1) - 1;
  var sz = Math.max(2, __count(size, 3));
  var offsets = [];
  for (var k = 0; k < sz; k++) {
    var idx = d + k * 2;
    offsets.push(s[(((idx % n) + n) % n)] + Math.floor(idx / n) * 12);
  }
  var base = __pitch(root);
  var quality = chordQuality(offsets);
  var tbl = noteSpelling(root, nm) ? __CE_NOTE_FLAT : __CE_NOTE_SHARP;
  var notes = [], names = [];
  for (var i = 0; i < offsets.length; i++) { notes.push(base + offsets[i]); names.push(tbl[__m12(base + offsets[i])]); }
  return {
    degree: d + 1, rootNote: notes[0], quality: quality,
    name: names[0] + (__CE_QUALITY_SUFFIX[quality] || ""),
    roman: __roman(offsets[0], quality),
    offsets: offsets, notes: notes, names: names
  };
}
// A count argument that is not a finite number falls back to its default. Written out rather than
// leaning on falsiness, because `0 || 3` is 3 in JavaScript and Python and 0 in Lua.
function __count(v, fallback) { var n = Number(v); return isFinite(n) ? Math.floor(n) : fallback; }
function __sortedNotes(list) {
  var out = [];
  if (list && list.length !== undefined) {
    for (var i = 0; i < list.length; i++) { var v = Number(list[i]); if (isFinite(v)) out.push(v); }
  }
  return out.sort(function (a, b) { return a - b; });
}
// Each voice to its NEAREST note in the other chord — voice counts differ (a triad following a
// seventh), so pairing by index would compare nonsense.
function __motion(a, b) {
  var sum = 0;
  for (var i = 0; i < a.length; i++) {
    var best = Infinity;
    for (var j = 0; j < b.length; j++) { var d = Math.abs(a[i] - b[j]); if (d < best) best = d; }
    sum += best;
  }
  return sum;
}
// Re-voice a chord so it moves as little as possible from the one before it — the Harmoniser's
// voice leading. "closest" minimises total movement, "smooth" the TOP voice only (which holds a
// melody still), "off" returns root position. No previous chord means nothing to lead from.
function voiceLead(notes, previous, mode) {
  var chord = __sortedNotes(notes), prev = __sortedNotes(previous);
  var how = (mode === undefined || mode === null) ? "closest" : String(mode);
  if (!chord.length || !prev.length || how === "off") return chord;
  var cands = [chord], span = Math.max(1, chord.length - 1) * 2, cur = chord, i, nx;
  for (i = 0; i < span; i++) {
    nx = cur.slice(1); nx.push(cur[0] + 12); nx.sort(function (a, b) { return a - b; });
    cands.push(nx); cur = nx;
  }
  cur = chord;
  for (i = 0; i < span; i++) {
    nx = [cur[cur.length - 1] - 12].concat(cur.slice(0, -1)); nx.sort(function (a, b) { return a - b; });
    cands.push(nx); cur = nx;
  }
  var best = chord, bestScore = Infinity;
  for (var c = 0; c < cands.length; c++) {
    var cand = cands[c], ok = true;
    for (i = 0; i < cand.length; i++) if (cand[i] < 0 || cand[i] > 127) { ok = false; break; }
    if (!ok) continue;
    var score = how === "smooth"
      ? Math.abs(cand[cand.length - 1] - prev[prev.length - 1])
      : __motion(cand, prev);
    // Strictly less, so a tie keeps the earlier (lower) candidate in every runtime.
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  return best;
}
// The Arpeggiator's octave expansion. Anything landing above 127 is DROPPED rather than clamped:
// clamping stacks strays on one pitch, which sounds like a stuck key rather than like nothing.
function expandOctaves(notes, octaves) {
  var base = __sortedNotes(notes);
  var oc = Math.max(1, Math.min(4, __count(octaves, 1)));
  var out = [];
  for (var o = 0; o < oc; o++) {
    for (var i = 0; i < base.length; i++) {
      var v = Math.floor(base[i]);
      v = v < 0 ? 0 : (v > 127 ? 127 : v);
      v += o * 12;
      if (v <= 127) out.push(v);
    }
  }
  return out;
}
// The walk a pattern describes, as a list of STEPS — each step a list of notes, so "chord" (one
// step, everything at once) has the same shape as the rest. Notes are taken in the order given,
// which is what makes "asPlayed" mean anything. "random" returns the input order, exactly as the
// panel's arpeggiator does; for a shuffled WALK there is shuffle(), which is seeded.
function arpOrder(notes, pattern) {
  var asc = (notes && notes.length !== undefined) ? Array.prototype.slice.call(notes) : [];
  if (!asc.length) return [];
  var p = String(pattern), seq, i;
  if (p === "chord") return [asc];
  if (p === "down") { seq = asc.slice().reverse(); }
  else if (p === "updown") { seq = asc.concat(asc.slice(1, -1).reverse()); }   // no repeated endpoints
  else if (p === "downup") { var desc = asc.slice().reverse(); seq = desc.concat(desc.slice(1, -1).reverse()); }
  else { seq = asc.slice(); }
  var out = [];
  for (i = 0; i < seq.length; i++) out.push([seq[i]]);
  return out;
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
// checksum(type, bytes [, opts]) — eleven algorithms, the same table checksums.js holds and the
// device profile engine reads (design doc §48). This knew three and fell through to Roland for
// anything else, so a typo came back as a plausible number from a different algorithm.
var __CE_CKSUM_ALIAS = {
  "sum": "sum-7bit", "sum-7bit": "sum-7bit",
  "roland": "roland-7bit", "yamaha": "roland-7bit", "roland-7bit": "roland-7bit",
  "twos-complement-7bit": "roland-7bit",
  "ones": "ones-complement-7bit", "ones-complement": "ones-complement-7bit",
  "ones-complement-7bit": "ones-complement-7bit",
  "xor": "xor-7bit", "xor-7bit": "xor-7bit",
  "offset": "offset-7bit", "kawai": "offset-7bit", "offset-7bit": "offset-7bit",
  "sum-8bit": "sum-8bit",
  "twos-complement": "twos-complement-8bit", "twos-complement-8bit": "twos-complement-8bit",
  "crc8": "crc8",
  "crc16": "crc16-ccitt", "crc16-ccitt": "crc16-ccitt", "crc16-modbus": "crc16-modbus",
  "crc32": "crc32"
};
// >>> 0 after every step: JavaScript's bitwise operators are 32-bit SIGNED, so a 32-bit CRC turns
// negative at the first shift that touches the top bit. This is the one place the four runtimes
// genuinely need different code for the same arithmetic.
function __ce_crc_msb(bytes, poly, init, xorOut, bits) {
  var top = 1 << (bits - 1);
  var mask = bits === 32 ? 0xffffffff : ((1 << bits) - 1);
  var crc = init;
  for (var i = 0; i < bytes.length; i++) {
    crc = (crc ^ ((Math.floor(bytes[i]) & 0xff) << (bits - 8))) >>> 0;
    for (var b = 0; b < 8; b++) {
      crc = ((crc & top) !== 0 ? ((crc << 1) ^ poly) : (crc << 1)) >>> 0;
      crc = (crc & mask) >>> 0;
    }
  }
  return ((crc ^ xorOut) & mask) >>> 0;
}
function __ce_crc_ref(bytes, poly, init, xorOut, bits) {
  var mask = bits === 32 ? 0xffffffff : ((1 << bits) - 1);
  var crc = init >>> 0;
  for (var i = 0; i < bytes.length; i++) {
    crc = (crc ^ (Math.floor(bytes[i]) & 0xff)) >>> 0;
    for (var b = 0; b < 8; b++) {
      crc = ((crc & 1) !== 0 ? ((crc >>> 1) ^ poly) : (crc >>> 1)) >>> 0;
      crc = (crc & mask) >>> 0;
    }
  }
  return ((crc ^ xorOut) & mask) >>> 0;
}
function checksum(kind, bytes, opts) {
  if (bytes === undefined || bytes === null) { bytes = kind; kind = "roland"; }
  var id = __CE_CKSUM_ALIAS[String(kind === undefined || kind === null ? "" : kind).toLowerCase()];
  if (id === undefined) {
    logError('ce.midi.checksum("' + String(kind) + '"): no such algorithm.');
    return undefined;
  }
  var sum7 = 0, sum8 = 0, x = 0;
  for (var i = 0; i < bytes.length; i++) {
    var b = Math.floor(bytes[i]) & 0xff;
    sum7 = (sum7 + b) % 128;
    sum8 = (sum8 + b) % 256;
    x = (x ^ b) & 0x7f;
  }
  if (id === "sum-7bit") return sum7;
  if (id === "roland-7bit") return (128 - sum7) % 128;
  if (id === "ones-complement-7bit") return (127 - sum7) % 128;
  if (id === "xor-7bit") return x;
  if (id === "offset-7bit") {
    var k = (opts && opts.offset !== undefined && opts.offset !== null) ? Math.floor(opts.offset) : 0xa5;
    return (sum7 + k) % 128;
  }
  if (id === "sum-8bit") return sum8;
  if (id === "twos-complement-8bit") return (256 - sum8) % 256;
  if (id === "crc8") return __ce_crc_msb(bytes, 0x07, 0x00, 0x00, 8);
  if (id === "crc16-ccitt") return __ce_crc_msb(bytes, 0x1021, 0xffff, 0x0000, 16);
  if (id === "crc16-modbus") return __ce_crc_ref(bytes, 0xa001, 0xffff, 0x0000, 16);
  return __ce_crc_ref(bytes, 0xedb88320, 0xffffffff, 0xffffffff, 32);
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
  "uiNotify","uiStatus","uiDialog","uiPrompt","uiChoose","uiDismiss","uiUpdate","uiState","uiCopy",
// @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawGradient","drawOpacity","drawTransform","drawEllipse","drawPixelText","drawMeasure",
  "drawBatch","drawGrid","drawLines","drawPoints","drawCurve","drawPolygon","drawImage","drawClip",
  "drawBlend","drawSave","drawRestore","drawText","drawRedraw",
// @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
  "panelAlign","panelDistribute","panelMatch","panelGrid","panelCircle","panelFlip","panelRect",
  "panelOrder","panelBatch","panelEntries","panelEntry","panelDefine","panelUndefine","panelPatch",
// @module ce.image
  "imageAssets","imageAsset","imageSet","imageClear","imageRead","imageIcon","imageEmbed",
  "imageLoad",
// @module ce.text
  "textFonts","textFont","textStyle","textAxis","textRead","textMeasure","textFit",
// @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint","splitRead",
// @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell","phraseRead",
// @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn","recorderRead",
// @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree","harmonyRead",
// @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
  "setlistRead",
// @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpDegree","arpChordType","arpVelocity","arpChannel","arpEuclid",
  "arpEuclidSteps","arpEuclidPulses","arpEuclidRotate","arpPhase","arpMute","arpInputChannel",
  "arpBaseOctave","arpSource","arpRead",
// @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadChordType","chordPadVoicing",
  "chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel","chordPadStrum",
  "chordPadLatch","chordPadRead",
// @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonBaseNote","noteRibbonOctaves",
  "noteRibbonBendRange","noteRibbonVelocity","noteRibbonChannel","noteRibbonLatch","noteRibbonRead",
// @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols","drumPadsOrigin","drumPadsVelocityFrom",
  "drumPadsEditable","drumPadsEcho","drumPadsEchoChannel","drumPadsShowNotes","drumPadsShowLabels",
  "drumPadsShowHeader","drumPadsNote","drumPadsLabel","drumPadsChoke","drumPadsColour",
  "drumPadsRead","drumPadsSize","drumPadsFill",
// @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep","turingPhase","turingRead","turingSize","turingFill",
// @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest","looperPhase","looperRead","looperSize","looperFill","looperInsert",
  "looperRemove",
// @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth","orbitRead","orbitSize","orbitFill",
  "orbitInsert","orbitRemove",
// @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity","kineticRead",
// @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
  "constellationRead",
// @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY","timbreRead","timbreSize","timbreFill",
  "timbreInsert","timbreRemove",
// @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth","routerRead","routerSize","routerFill",
  "routerInsert","routerRemove",
// @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
  "macroRead","macroSize","macroFill","macroInsert","macroRemove",
// @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep","matrixRead","matrixSize","matrixFill",
// @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember","constraintRead","constraintSize",
  "constraintFill","constraintInsert","constraintRemove",
// @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
  "envelopeRead","envelopeSize","envelopeFill","envelopeInsert","envelopeRemove",
// @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnRate",
  "ribbonSnap","ribbonRead",
// @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnToCenter",
  "crossfaderReturnRate","crossfaderRead",
// @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnToCenter","joystickReturnAxes",
  "joystickReturnRate","joystickRead",
// @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay","meterValueMin",
  "meterValueMax","meterDbFloor","meterDbCeil","meterRead",
// @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
  "transportRead",
// @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal","panicSetRead",
// @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue","lcdRead","lcdSize","lcdFill",
// @module ce.components.pixel
  "pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow","pixelAnim",
  "pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop","pixelRead",
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
// noteNumber is undefined for an unreadable name; a MIDI message still needs a BYTE, so it becomes
// 0 here rather than an undefined slipping into a message.
function __note(n) { return typeof n === "string" ? (noteNumber(n) === undefined ? 0 : noteNumber(n)) : __7(n); }

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
// syncTimer(id, beats [, opts]) — a timer whose interval is MUSICAL, and which FOLLOWS the tempo.
// The first version computed the interval once and then kept firing at the old rate forever; a verb
// called sync that silently desyncs is the wrong default. { follow: false } keeps that behaviour.
// Re-arming RESETS THE PHASE, which is a hiccup at the moment of a tempo change and beats a timer
// that is permanently at the wrong rate.
function syncTimer(id, beats, opts) {
  var key = String(id === undefined || id === null ? "" : id);
  var ms = beatsToMs(beats);
  if (ms === null) {
    log("syncTimer(\"" + id + "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.");
    return;
  }
  startTimer(key, ms);                                    // clears any previous follow…
  if (!(opts && opts.follow === false)) __syncFollow[key] = Number(beats) || 0;   // …put back on purpose
}
// Re-time every following sync timer. Armed from the prelude's own onTransport listener, so it
// belongs to no script and survives every reload of them.
function __reArmSyncTimers() {
  var pending = {}, k;
  for (k in __syncFollow) if (Object.prototype.hasOwnProperty.call(__syncFollow, k)) pending[k] = __syncFollow[k];
  for (k in pending) {
    if (!Object.prototype.hasOwnProperty.call(pending, k)) continue;
    var ms = beatsToMs(pending[k]);
    // No tempo any more: leave it running at the last one rather than stopping the music.
    if (ms === null) continue;
    startTimer(k, ms);
    __syncFollow[k] = pending[k];
  }
}
var __lastSyncBpm = null;
on("*", "onTransport", function (t) {
  var bpm = t && t.bpm !== undefined ? t.bpm : null;
  if (bpm === __lastSyncBpm) return;
  __lastSyncBpm = bpm;
  if (bpm !== null && bpm !== undefined) __reArmSyncTimers();
});

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

// afterBeats(beats, fn) — after() with a MUSICAL delay. startTimer had syncTimer and the one-shot
// had nothing, so "play this in half a bar" meant working the milliseconds out by hand. A one-shot
// fires once, so the delay is computed WHEN YOU CALL IT and does not follow a later tempo change.
function afterBeats(beats, fn) {
  var ms = beatsToMs(beats);
  if (ms === null) {
    log("afterBeats(): no tempo is being reported, so there is no delay to compute. Use after() with milliseconds, or wait for onTransport.");
    return undefined;
  }
  return after(ms, fn);
}

// The grid, the clock and the transport's own arithmetic. Everything above answers "where is the
// transport NOW" or "how long is a beat"; none of it answered where an ARBITRARY position falls,
// what the grid is, or what the panel's own clock decided. Transliterated from
// utils/transportLayout.js, which the WebView calls directly — including its coercions, because a
// fallback that differs by one is a sequencer a step out.
function __tnum(v, fallback) { var n = Number(v); return isFinite(n) ? n : fallback; }
function __tclamp(v, lo, hi) { var n = __tnum(v, lo); return n < lo ? lo : (n > hi ? hi : n); }

// A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and
// only DIFFERENCES mean anything, so a machine syncing its clock cannot corrupt an interval.
function nowMs() { return __api.nowMs(); }

// The panel's division vocabulary, in both directions. An unknown name returns undefined rather
// than the component's 1/16 fallback: a component has to keep running, a script that mistyped a
// division should find out.
function beatsPerDivision(name) { return __CE_DIVISIONS[String(name)]; }
function divisionNames() {
  var out = [];
  for (var i = 0; i < __CE_DIVISION_NAMES.length; i++) {
    var id = __CE_DIVISION_NAMES[i];
    out.push({ id: id, label: __CE_DIVISION_LABELS[id], beats: __CE_DIVISIONS[id] });
  }
  return out;
}

// Where a beat position falls musically — for ANY position, not only the transport's. Bars and
// beats count from 1 as musicians do; `text` is the Transport component's own readout.
function barBeatAt(beats, beatsPerBar) {
  var perBar = __tnum(beatsPerBar, 4); if (perBar < 1) perBar = 1;
  var b = __tnum(beats, 0); if (b < 0) b = 0;
  var bar = Math.floor(b / perBar) + 1;
  var beat = Math.floor(b % perBar) + 1;
  var tick = Math.floor((b % 1) * __CE_TIME.ppqn);
  var t = String(tick);
  while (t.length < 2) t = "0" + t;
  return { bar: bar, beat: beat, tick: tick, text: bar + "." + beat + "." + t };
}

function stepAt(beats, division) {
  var per = __CE_DIVISIONS[String(division)];
  if (per === undefined) return undefined;
  var b = __tnum(beats, 0); if (b < 0) b = 0;
  return Math.floor(b / per);
}

// The step boundaries crossed between two readings. A stalled frame must FIRE the steps it slept
// through rather than drop them — the difference between a stutter and a hole in the bar. Capped so
// returning from a long stall does not dump hundreds of notes, and what was dropped is REPORTED. On
// an overrun the most RECENT steps are kept: catching up to now beats replaying where you were.
function stepsBetween(fromBeats, toBeats, division, maxSteps) {
  var per = __CE_DIVISIONS[String(division)];
  if (per === undefined) return undefined;
  var from = __tnum(fromBeats, 0); if (from < 0) from = 0;
  var to = __tnum(toBeats, 0); if (to < 0) to = 0;
  if (to <= from) return { steps: [], dropped: 0 };
  var first = Math.floor(from / per) + 1;
  var last = Math.floor(to / per);
  if (last < first) return { steps: [], dropped: 0 };
  var total = last - first + 1;
  var cap = Math.round(__tnum(maxSteps, 16)); if (cap < 1) cap = 1;
  var kept = total < cap ? total : cap;
  var steps = [];
  for (var i = last - kept + 1; i <= last; i++) steps.push(i);
  return { steps: steps, dropped: total - kept };
}

// The panel's shuffle: every odd step later by up to half a step, in BEATS. Two sequencers at "the
// same" swing are only the same swing if they compute it the same way.
function swingOffset(step, amount, division) {
  var per = __CE_DIVISIONS[String(division)];
  if (per === undefined) return undefined;
  var s = __tclamp(amount, 0, 1);
  return (Math.abs(Math.round(__tnum(step, 0))) % 2 === 1) ? s * 0.5 * per : 0;
}

// For anything whose rate is a LOOP LENGTH in bars rather than a step. Derived from the position,
// never accumulated, so a cycle running for an hour is still exactly on the bar line.
function __cycleBeats(bars, beatsPerBar) {
  var perBar = __tnum(beatsPerBar, 4); if (perBar < 1) perBar = 1;
  var len = __tclamp(bars, 0.25, 64) * perBar;
  return len < 0.01 ? 0.01 : len;
}
function cycleAt(beats, bars, beatsPerBar) {
  var len = __cycleBeats(bars, beatsPerBar);
  var b = __tnum(beats, 0); if (b < 0) b = 0;
  return { phase: (((b / len) % 1) + 1) % 1, count: Math.floor(b / len), length: len };
}

// Fold a timeline position into a loop. Before the loop start the position is untouched — you can
// run IN to a loop from earlier in the song. `pass` is which time round, -1 before the loop is
// reached; watching it for CHANGES is how you see a wrap without a handler that can miss one.
function loopedBeats(beats, startBeats, lengthBeats) {
  var b = __tnum(beats, 0); if (b < 0) b = 0;
  var st = __tnum(startBeats, 0); if (st < 0) st = 0;
  var len = __tnum(lengthBeats, 0.01); if (len < 0.01) len = 0.01;
  if (b < st) return { beats: b, pass: -1 };
  return { beats: st + ((b - st) % len), pass: Math.floor((b - st) / len) };
}

// Tempo from tap times, in the milliseconds now() reports. Taps more than resetMs apart start a NEW
// measurement rather than averaging across the pause — the thing every hand-rolled tap gets wrong,
// because the first tap after a break poisons the average.
function tapTempo(timestamps, resetMs) {
  if (!timestamps || timestamps.length === undefined) return undefined;
  var list = [], i;
  for (i = 0; i < timestamps.length; i++) { var v = __tnum(timestamps[i], 0); if (v > 0) list.push(v); }
  if (list.length < 2) return undefined;
  var limit = __tnum(resetMs, 2000), sum = 0, count = 0;
  for (i = list.length - 1; i > 0; i--) {
    var gap = list[i] - list[i - 1];
    if (gap <= 0 || gap > limit) break;
    sum += gap; count++;
  }
  if (!count) return undefined;
  return __tclamp(60000 / (sum / count), __CE_TIME.minBpm, __CE_TIME.maxBpm);
}

// Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note). The MEDIAN, not the
// mean: one late pulse from a USB hiccup drags an average around, and a wobbling readout is worse
// than a slightly stale one.
function clockTempo(intervalsMs) {
  if (!intervalsMs || intervalsMs.length === undefined) return undefined;
  var list = [];
  for (var i = 0; i < intervalsMs.length; i++) { var v = __tnum(intervalsMs[i], 0); if (v > 0) list.push(v); }
  if (!list.length) return undefined;
  list.sort(function (a, b) { return a - b; });
  var mid = Math.floor(list.length / 2);
  var median = (list.length % 2) ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  if (median <= 0) return undefined;
  return __tclamp(60000 / (median * __CE_TIME.ppqn), __CE_TIME.minBpm, __CE_TIME.maxBpm);
}

// @module ce.anim
// Values that move over time. The engine lives in the host so ONE list exists and the position is
// a pure function of elapsed time — an incremental integrator per runtime would drift.
//
// `done` is a FUNCTION the script owns, so the host cannot call it: the engine emits __animDone and
// this routes it to the function stored here. Exactly how after()'s one-shot works, and the reason
// a completion callback can be a plain argument in every language.
var __animDone = {}, __animGroup = {}, __animGroupN = 0;

// An envelope's shape is SAMPLED here, with map() — ce.math's, which is the Envelope component's
// own envValueAt — and the host interpolates the samples. That is what lets the host engine run an
// envelope at all: map()'s per-point curves live in this prelude, not in C++.
var __ANIM_SAMPLES = 1024;
function __animSample(points) {
  var out = [];
  for (var i = 0; i <= __ANIM_SAMPLES; i++) {
    var y = Number(map(i / __ANIM_SAMPLES, points));
    out.push(isFinite(y) ? y : 0);
  }
  return out;
}

function __animPaths(path) {
  if (!path || typeof path === "string" || path.length === undefined) return null;
  var out = [];
  for (var i = 0; i < path.length; i++) { var p = String(path[i]); if (p) out.push(p); }
  return out;
}

function __animStart(kind, path, target, opts) {
  opts = opts || {};
  var list = __animPaths(path), o = {}, k;
  for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
  o.done = undefined;
  if (typeof opts.done === "function") {
    if (list) {
      __animGroupN += 1;
      __animGroup[__animGroupN] = opts.done;
      o.group = __animGroupN;
    } else {
      __animDone[String(path)] = opts.done;
    }
  }
  __api.animate(kind, list ? list : String(path), Number(target) || 0, o);
}

function animateTo(path, target, opts) { __animStart("to", path, target, opts); }
function animateSpring(path, target, opts) { __animStart("spring", path, target, opts); }
// envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
// `to` has one destination; an envelope goes up before it comes down, which is the single most
// obvious thing a synth panel animates and the one thing `to` cannot express.
function animateEnvelope(path, points, opts) {
  if (!points || points.length === undefined || points.length < 2) {
    log("ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.");
    return false;
  }
  var o = {}, k;
  if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
  o.samples = __animSample(points);
  o.from = Number(o.from) || 0;
  var to = o.to === undefined || o.to === null ? 1 : Number(o.to);
  o.to = undefined;
  __animStart("envelope", path, to, o);
  return true;
}
function animateStop(path) { __api.animateStop(path === undefined || path === null ? "" : String(path)); }
function animateRunning(path) { return __api.animateRunning(path === undefined || path === null ? "" : String(path)); }
function animateValue(path) { return __api.animateValue(path === undefined || path === null ? "" : String(path)); }
function animateList() { return __api.animateList(); }
function animatePause(path) { return __api.animatePause(path === undefined || path === null ? "" : String(path)); }
function animateResume(path) { return __api.animateResume(path === undefined || path === null ? "" : String(path)); }
function animateReverse(path) { return __api.animateReverse(path === undefined || path === null ? "" : String(path)); }
function animateFinish(path) { return __api.animateFinish(path === undefined || path === null ? "" : String(path)); }

// Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
on("*", "__animDone", function (info) {
  if (!info) return;
  if (info.group !== undefined && info.group !== null) {
    var g = __animGroup[info.group];
    delete __animGroup[info.group];
    if (g) g({ paths: info.paths, completed: info.completed === true });
    return;
  }
  var key = String(info.path === undefined ? "" : info.path);
  var fn = __animDone[key];
  delete __animDone[key];
  if (fn) fn({ path: key, completed: info.completed === true });
});

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

/* Three scopes, differing in who sees a value and where it lives (design doc §43):
 *   panel  — shared by every script on the panel, in the document, travels with it. The default,
 *            and exactly what settings have always been.
 *   script — private to the calling script, the way `state` already is.
 *   local  — THIS MACHINE only, never written into the document.
 * script scope is a key prefix on the panel store rather than a store of its own: a private setting
 * should persist and travel exactly like a shared one, and only its visibility differs. */
var __CE_SCOPES = ["panel", "script", "local"];

/* The scope asked for, or nothing when it is not one this build knows. Refusing rather than falling
 * back to "panel": storing a value in a scope the caller did not ask for is how a private setting
 * quietly becomes a shared one, and a typo in a scope name would be the way it happened. */
function __storageScope(opts) {
  var raw = (typeof opts === "string") ? opts : (opts ? opts.scope : undefined);
  if (raw === undefined || raw === null || raw === "") return "panel";
  var scope = String(raw);
  if (__CE_SCOPES.indexOf(scope) >= 0) return scope;
  logError('ce.storage: "' + scope + '" is not a scope. One of: ' + __CE_SCOPES.join(", ") + ".");
  return undefined;
}
// Which of the host's two real stores a scope lives in.
function __storageStore(scope) { return scope === "local" ? "local" : "panel"; }
// The key a scope actually stores under. The prefix is chosen to be one a hand-written key could
// not collide with by accident — U+0001 and not U+0000, because a key travels through
// juce::String, which is NUL-terminated and would truncate there.
function __storageKeyFor(scope, key) {
  var k = String(key === undefined || key === null ? "" : key);
  return scope === "script" ? "\u0001script:" + String(__scriptId || "") + ":" + k : k;
}
// …and back, for listing: nothing when the stored key does not belong to this scope.
function __storageKeyFrom(scope, stored) {
  var prefix = "\u0001script:" + String(__scriptId || "") + ":";
  if (scope === "script")
    return stored.indexOf(prefix) === 0 ? stored.slice(prefix.length) : undefined;
  // A panel listing hides other scripts' private keys rather than showing an unusable spelling.
  return stored.indexOf("\u0001script:") === 0 ? undefined : stored;
}

function saveSetting(key, value, opts) {
  var scope = __storageScope(opts);
  if (!scope) return false;
  var store = __storageStore(scope);
  if (__api.settingsAvailable(store) !== true) {
    logError('saveSetting("' + key + '"): the ' + scope + ' store is unavailable here, so nothing '
             + "was saved. ce.storage.info() says which stores are available.");
    return false;
  }
  __api.saveSetting(__storageKeyFor(scope, key), value, store);
  return true;
}
function loadSetting(key, fallback, opts) {
  var scope = __storageScope(opts);
  if (!scope) return fallback;
  var v = __api.loadSetting(__storageKeyFor(scope, key), __storageStore(scope));
  return (v === undefined || v === null) ? fallback : v;
}
// settings() lists every saved key; forget() deletes one and says whether there was one.
function listSettings(opts) {
  var scope = __storageScope(opts);
  if (!scope) return [];
  var raw = __api.listSettings(__storageStore(scope)) || [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var k = __storageKeyFrom(scope, String(raw[i]));
    if (k !== undefined) out.push(k);
  }
  return out;
}
function forgetSetting(key, opts) {
  var scope = __storageScope(opts);
  if (!scope) return false;
  return __api.forgetSetting(__storageKeyFor(scope, key), __storageStore(scope)) === true;
}
// Every setting as a table — the read every other module got. Listing keys and looping to fetch each
// one was the only way before.
function allSettings(opts) {
  var scope = __storageScope(opts);
  if (!scope) return {};
  var keys = listSettings(opts), out = {};
  for (var i = 0; i < keys.length; i++) out[keys[i]] = loadSetting(keys[i], undefined, opts);
  return out;
}
// Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
// keys alone: "clear my settings" must not mean "clear everybody's".
function clearSettings(opts) {
  var keys = listSettings(opts), gone = 0;
  for (var i = 0; i < keys.length; i++) if (forgetSetting(keys[i], opts)) gone++;
  return gone;
}
// Which store a scope is talking to, and what is in it. `available` is the honest field: false means
// writes in this scope will not stick, which is worth saying once rather than per key.
function storageInfo(opts) {
  var scope = __storageScope(opts);
  if (!scope) return undefined;
  var store = __storageStore(scope);
  var contents = allSettings(opts);
  var text = encodeJson(contents);
  return {
    scope: scope,
    // What the store IS, rather than what it is called: in the player, panel-scope settings live in
    // the DAW project state and machine-local ones do not.
    backing: scope === "local" ? "machine" : "project",
    available: __api.settingsAvailable(store) === true,
    count: Object.keys(contents).length,
    bytes: text === undefined ? -1 : text.length,
  };
}

/* JSON. A Q10 exception, and the same one now() was: the Lua engine opens base, math, string and
 * table and has no json module, while JavaScript and Python each have their own with different
 * names and different edge cases. "Use the language's own" was never available to a cross-runtime
 * script, so all four grow one spelling here.
 *
 * Keys come out SORTED, everywhere. Not a stylistic choice: a Lua table has no insertion order to
 * preserve, so sorted is the only ordering all four runtimes are able to produce — and it is the
 * ordering that makes two encodings of the same structure comparable. */
function __jsonKeys(value, out, seen) {
  if (!value || typeof value !== "object") return out;
  for (var s = 0; s < seen.length; s++) if (seen[s] === value) return out;  // a cycle: stop here
  seen.push(value);
  if (Array.isArray(value)) { for (var i = 0; i < value.length; i++) __jsonKeys(value[i], out, seen); }
  else {
    var ks = Object.keys(value);
    for (var j = 0; j < ks.length; j++) {
      if (out.indexOf(ks[j]) < 0) out.push(ks[j]);
      __jsonKeys(value[ks[j]], out, seen);
    }
  }
  return out;
}
function encodeJson(value, opts) {
  try {
    var indent = opts ? Number(opts.indent) : NaN;
    var keys = __jsonKeys(value, [], []).sort();
    return JSON.stringify(value, keys.length ? keys : undefined,
                          (isFinite(indent) && indent > 0) ? indent : undefined);
  } catch (e) {
    // A cycle, or a value with no JSON form. Nothing back rather than a string that is not the
    // value — the same rule every "cannot read that" in this API follows.
    return undefined;
  }
}
/* JSON null reads as NOTHING: an absent member, a skipped element. Not a preference — a Lua table
 * cannot hold a null, and a value the four runtimes cannot all hold is not a value this API has. */
function __jsonStripNulls(v) {
  if (Array.isArray(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) if (v[i] !== null) out.push(__jsonStripNulls(v[i]));
    return out;
  }
  if (v && typeof v === "object") {
    var o = {}, ks = Object.keys(v);
    for (var j = 0; j < ks.length; j++)
      if (v[ks[j]] !== null) o[ks[j]] = __jsonStripNulls(v[ks[j]]);
    return o;
  }
  return v;
}
function decodeJson(text) {
  try {
    var v = JSON.parse(String(text === undefined || text === null ? "" : text));
    return v === null ? undefined : __jsonStripNulls(v);
  } catch (e) { return undefined; }
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
  "ce.math": { "almost": "almost", "alpha": "colourAlpha", "angle": "angleOf", "approach": "approach", "bipolar": "bipolar", "blend": "blend", "blendBy": "blendBy", "chance": "randomBool", "choice": "randomChoice", "clamp": "clamp", "crossfade": "crossfade", "curve": "curve", "darken": "darken", "dbPosition": "dbPosition", "dbToGain": "dbToGain", "deadzone": "deadzone", "degrees": "toDegrees", "denorm": "denorm", "distance": "distance", "euclid": "euclid", "fold": "fold", "fromHsl": "hslToHex", "gainToDb": "gainToDb", "gaussian": "randomGaussian", "hex": "rgbToHex", "hsl": "hexToHsl", "hysteresis": "hysteresis", "index": "indexOfRange", "lerp": "lerp", "lighten": "lighten", "map": "mapCurve", "max": "maxOf", "mean": "meanOf", "median": "median", "min": "minOf", "mix": "mixColour", "norm": "norm", "polar": "polar", "quantize": "quantizeTo", "radians": "toRadians", "random": "random", "randomFloat": "randomFloat", "rgb": "hexToRgb", "round": "round", "roundTo": "roundTo", "scale": "scale", "seed": "randomSeed", "shape": "shapeCurve", "shuffle": "shuffle", "smooth": "smooth", "snap": "snap", "stream": "randomStream", "sum": "sumOf", "ticks": "tickStops", "unipolar": "unipolar", "unshape": "unshape", "walk": "randomWalk", "weights": "weightsFor", "wrap": "wrap" },
  "ce.music": { "arp": "arpOrder", "chord": "chordNotes", "degree": "scaleDegree", "degreeChord": "degreeChord", "inScale": "inScale", "lead": "voiceLead", "name": "noteName", "number": "noteNumber", "octaves": "expandOctaves", "quality": "chordQuality", "quantize": "quantizeNote", "scale": "scaleNotes", "spelling": "noteSpelling" },
  "ce.time": { "after": "after", "afterBeats": "afterBeats", "beatsToMs": "beatsToMs", "clockTempo": "clockTempo", "cycle": "cycleAt", "division": "beatsPerDivision", "divisions": "divisionNames", "looped": "loopedBeats", "msToBeats": "msToBeats", "now": "nowMs", "playing": "isPlaying", "position": "barBeatAt", "startTimer": "startTimer", "step": "stepAt", "steps": "stepsBetween", "stopTimer": "stopTimer", "swing": "swingOffset", "syncTimer": "syncTimer", "tap": "tapTempo", "tempo": "tempo", "timers": "runningTimers", "transport": "transportInfo" },
  "ce.anim": { "envelope": "animateEnvelope", "finish": "animateFinish", "list": "animateList", "pause": "animatePause", "resume": "animateResume", "reverse": "animateReverse", "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo", "value": "animateValue" },
  "ce.ui": { "choose": "uiChoose", "copy": "uiCopy", "dialog": "uiDialog", "dismiss": "uiDismiss", "notify": "uiNotify", "prompt": "uiPrompt", "state": "uiState", "status": "uiStatus", "update": "uiUpdate" },
  "ce.draw": { "arc": "drawArc", "batch": "drawBatch", "blend": "drawBlend", "circle": "drawCircle", "clear": "drawClear", "clip": "drawClip", "curve": "drawCurve", "ellipse": "drawEllipse", "fill": "drawFill", "gradient": "drawGradient", "grid": "drawGrid", "image": "drawImage", "line": "drawLine", "lines": "drawLines", "measure": "drawMeasure", "opacity": "drawOpacity", "path": "drawPath", "pixelText": "drawPixelText", "points": "drawPoints", "polygon": "drawPolygon", "rect": "drawRect", "redraw": "drawRedraw", "restore": "drawRestore", "save": "drawSave", "stroke": "drawStroke", "text": "drawText", "transform": "drawTransform" },
  "ce.panel": { "align": "panelAlign", "batch": "panelBatch", "circle": "panelCircle", "clone": "panelClone", "create": "panelCreate", "define": "panelDefine", "destroy": "panelDestroy", "distribute": "panelDistribute", "each": "panelEach", "entries": "panelEntries", "entry": "panelEntry", "find": "panelFind", "flip": "panelFlip", "grid": "panelGrid", "info": "panelInfo", "match": "panelMatch", "order": "panelOrder", "parent": "panelParent", "patch": "panelPatch", "rect": "panelRect", "restore": "panelRestore", "snapshot": "panelSnapshot", "types": "panelTypes", "undefine": "panelUndefine" },
  "ce.storage": { "all": "allSettings", "clear": "clearSettings", "decode": "decodeJson", "encode": "encodeJson", "forget": "forgetSetting", "info": "storageInfo", "loadSetting": "loadSetting", "saveSetting": "saveSetting", "settings": "listSettings", "state": "state" },
  "ce.image": { "asset": "imageAsset", "assets": "imageAssets", "clear": "imageClear", "embed": "imageEmbed", "icon": "imageIcon", "load": "imageLoad", "read": "imageRead", "set": "imageSet" },
  "ce.text": { "axis": "textAxis", "fit": "textFit", "font": "textFont", "fonts": "textFonts", "measure": "textMeasure", "read": "textRead", "style": "textStyle" },
  "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "read": "splitRead", "transpose": "splitTranspose" },
  "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "read": "phraseRead", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
  "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "read": "recorderRead", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
  "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "read": "harmonyRead", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
  "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "read": "setlistRead", "wrap": "setlistWrap" },
  "ce.components.arp": { "baseOctave": "arpBaseOctave", "channel": "arpChannel", "chordType": "arpChordType", "degree": "arpDegree", "division": "arpDivision", "euclid": "arpEuclid", "euclidPulses": "arpEuclidPulses", "euclidRotate": "arpEuclidRotate", "euclidSteps": "arpEuclidSteps", "gate": "arpGate", "inputChannel": "arpInputChannel", "key": "arpKey", "latch": "arpLatch", "mute": "arpMute", "octaves": "arpOctaves", "pattern": "arpPattern", "phase": "arpPhase", "rate": "arpRate", "read": "arpRead", "run": "arpRun", "scale": "arpScale", "source": "arpSource", "swing": "arpSwing", "sync": "arpSync", "velocity": "arpVelocity" },
  "ce.components.chordpad": { "channel": "chordPadChannel", "chordType": "chordPadChordType", "inversion": "chordPadInversion", "key": "chordPadKey", "latch": "chordPadLatch", "mode": "chordPadMode", "octave": "chordPadOctave", "read": "chordPadRead", "scale": "chordPadScale", "strum": "chordPadStrum", "velocity": "chordPadVelocity", "voicing": "chordPadVoicing" },
  "ce.components.noteribbon": { "baseNote": "noteRibbonBaseNote", "bendRange": "noteRibbonBendRange", "channel": "noteRibbonChannel", "key": "noteRibbonKey", "latch": "noteRibbonLatch", "mode": "noteRibbonMode", "octaves": "noteRibbonOctaves", "read": "noteRibbonRead", "scale": "noteRibbonScale", "velocity": "noteRibbonVelocity" },
  "ce.components.drumpads": { "baseNote": "drumPadsBaseNote", "channel": "drumPadsChannel", "choke": "drumPadsChoke", "colour": "drumPadsColour", "cols": "drumPadsCols", "echo": "drumPadsEcho", "echoChannel": "drumPadsEchoChannel", "editable": "drumPadsEditable", "fill": "drumPadsFill", "gate": "drumPadsGate", "label": "drumPadsLabel", "map": "drumPadsMap", "mode": "drumPadsMode", "note": "drumPadsNote", "origin": "drumPadsOrigin", "read": "drumPadsRead", "rows": "drumPadsRows", "showHeader": "drumPadsShowHeader", "showLabels": "drumPadsShowLabels", "showNotes": "drumPadsShowNotes", "size": "drumPadsSize", "velocity": "drumPadsVelocity", "velocityFrom": "drumPadsVelocityFrom" },
  "ce.components.turing": { "division": "turingDivision", "fill": "turingFill", "gate": "turingGate", "length": "turingLength", "phase": "turingPhase", "quantize": "turingQuantize", "randomness": "turingRandomness", "rate": "turingRate", "read": "turingRead", "run": "turingRun", "size": "turingSize", "step": "turingStep", "sync": "turingSync" },
  "ce.components.looper": { "bars": "looperBars", "fill": "looperFill", "insert": "looperInsert", "lane": "looperLane", "laneRest": "looperLaneRest", "phase": "looperPhase", "quantize": "looperQuantize", "read": "looperRead", "remove": "looperRemove", "run": "looperRun", "seconds": "looperSeconds", "size": "looperSize", "sync": "looperSync" },
  "ce.components.orbit": { "bars": "orbitBars", "fill": "orbitFill", "insert": "orbitInsert", "node": "orbitNode", "nodeAngle": "orbitNodeAngle", "nodeDepth": "orbitNodeDepth", "nodeRadius": "orbitNodeRadius", "nodeRatio": "orbitNodeRatio", "phase": "orbitPhase", "rate": "orbitRate", "read": "orbitRead", "remove": "orbitRemove", "run": "orbitRun", "size": "orbitSize", "sync": "orbitSync" },
  "ce.components.kinetic": { "bounce": "kineticBounce", "friction": "kineticFriction", "gravity": "kineticGravity", "keepAlive": "kineticKeepAlive", "launch": "kineticLaunch", "read": "kineticRead", "run": "kineticRun", "sync": "kineticSync", "velocity": "kineticVelocity" },
  "ce.components.constellation": { "bars": "constellationBars", "blend": "constellationBlend", "links": "constellationLinks", "mode": "constellationMode", "probe": "constellationProbe", "rate": "constellationRate", "read": "constellationRead", "run": "constellationRun", "sync": "constellationSync" },
  "ce.components.timbre": { "anchorX": "timbreAnchorX", "anchorY": "timbreAnchorY", "fill": "timbreFill", "insert": "timbreInsert", "move": "timbreMove", "power": "timbrePower", "read": "timbreRead", "remove": "timbreRemove", "size": "timbreSize" },
  "ce.components.router": { "cc": "routerCc", "channel": "routerChannel", "deadzone": "routerDeadzone", "dest": "routerDest", "destDepth": "routerDestDepth", "fill": "routerFill", "input": "routerInput", "insert": "routerInsert", "invert": "routerInvert", "poly": "routerPoly", "read": "routerRead", "remove": "routerRemove", "size": "routerSize", "source": "routerSource" },
  "ce.components.macro": { "fill": "macroFill", "insert": "macroInsert", "read": "macroRead", "remove": "macroRemove", "size": "macroSize", "slot": "macroSlot", "slotCurve": "macroSlotCurve", "slotDepth": "macroSlotDepth", "slotMax": "macroSlotMax", "slotMin": "macroSlotMin", "value": "macroValue" },
  "ce.components.matrix": { "bipolar": "matrixBipolar", "cell": "matrixCell", "clear": "matrixClear", "fill": "matrixFill", "read": "matrixRead", "size": "matrixSize", "step": "matrixStep" },
  "ce.components.constraint": { "fill": "constraintFill", "gap": "constraintGap", "insert": "constraintInsert", "member": "constraintMember", "mode": "constraintMode", "read": "constraintRead", "remove": "constraintRemove", "size": "constraintSize" },
  "ce.components.envelope": { "fill": "envelopeFill", "insert": "envelopeInsert", "loop": "envelopeLoop", "loopEnd": "envelopeLoopEnd", "loopStart": "envelopeLoopStart", "phase": "envelopePhase", "pointCurve": "envelopePointCurve", "pointX": "envelopePointX", "pointY": "envelopePointY", "preset": "envelopePreset", "read": "envelopeRead", "remove": "envelopeRemove", "size": "envelopeSize", "sustain": "envelopeSustain", "timeMax": "envelopeTimeMax" },
  "ce.components.ribbon": { "bipolar": "ribbonBipolar", "read": "ribbonRead", "returnMode": "ribbonReturnMode", "returnRate": "ribbonReturnRate", "returnValue": "ribbonReturnValue", "snap": "ribbonSnap", "value": "ribbonValue" },
  "ce.components.crossfader": { "bipolar": "crossfaderBipolar", "detent": "crossfaderDetent", "law": "crossfaderLaw", "mix": "crossfaderMix", "read": "crossfaderRead", "returnRate": "crossfaderReturnRate", "returnToCenter": "crossfaderReturnToCenter" },
  "ce.components.joystick": { "bipolar": "joystickBipolar", "move": "joystickMove", "read": "joystickRead", "returnAxes": "joystickReturnAxes", "returnRate": "joystickReturnRate", "returnToCenter": "joystickReturnToCenter" },
  "ce.components.meter": { "dbCeil": "meterDbCeil", "dbFloor": "meterDbFloor", "decay": "meterDecay", "holdMs": "meterHoldMs", "peakHold": "meterPeakHold", "read": "meterRead", "scale": "meterScale", "value": "meterValue", "valueMax": "meterValueMax", "valueMin": "meterValueMin" },
  "ce.components.transport": { "beatUnit": "transportBeatUnit", "beatsPerBar": "transportBeatsPerBar", "bpm": "transportBpm", "clockOut": "transportClockOut", "countIn": "transportCountIn", "loop": "transportLoop", "loopBars": "transportLoopBars", "loopStart": "transportLoopStart", "read": "transportRead", "source": "transportSource", "swing": "transportSwing" },
  "ce.components.panic": { "centreBend": "panicSetCentreBend", "channel": "panicSetChannel", "clearLocal": "panicSetClearLocal", "read": "panicSetRead", "resetControllers": "panicSetResetControllers", "scope": "panicSetScope" },
  "ce.components.lcd": { "backlight": "lcdBacklight", "blink": "lcdBlink", "brightness": "lcdBrightness", "clear": "lcdClear", "contrast": "lcdContrast", "cursor": "lcdCursor", "cursorAt": "lcdCursorAt", "fill": "lcdFill", "read": "lcdRead", "scroll": "lcdScroll", "scrollSpeed": "lcdScrollSpeed", "size": "lcdSize", "text": "lcdText", "value": "lcdValue" },
  "ce.components.pixel": { "anim": "pixelAnim", "animLoop": "pixelAnimLoop", "animPreset": "pixelAnimPreset", "animSpeed": "pixelAnimSpeed", "backlight": "pixelBacklight", "brightness": "pixelBrightness", "contrast": "pixelContrast", "gamma": "pixelGamma", "glow": "pixelGlow", "read": "pixelRead" },
};
var __CE_ORDER = ["ce.core","ce.midi","ce.device","ce.math","ce.music","ce.time","ce.anim","ce.ui","ce.draw","ce.panel","ce.storage","ce.image","ce.text","ce.components.split","ce.components.phrase","ce.components.recorder","ce.components.harmony","ce.components.setlist","ce.components.arp","ce.components.chordpad","ce.components.noteribbon","ce.components.drumpads","ce.components.turing","ce.components.looper","ce.components.orbit","ce.components.kinetic","ce.components.constellation","ce.components.timbre","ce.components.router","ce.components.macro","ce.components.matrix","ce.components.constraint","ce.components.envelope","ce.components.ribbon","ce.components.crossfader","ce.components.joystick","ce.components.meter","ce.components.transport","ce.components.panic","ce.components.lcd","ce.components.pixel"];
var __CE_META = [{"id":"ce.core","version":"1.1","runtime":"any"},{"id":"ce.midi","version":"1.3","runtime":"any"},{"id":"ce.device","version":"1.3","runtime":"any"},{"id":"ce.math","version":"1.8","runtime":"any"},{"id":"ce.music","version":"1.2","runtime":"any"},{"id":"ce.time","version":"1.3","runtime":"any"},{"id":"ce.anim","version":"1.1","runtime":"any"},{"id":"ce.ui","version":"1.2","runtime":"webview"},{"id":"ce.draw","version":"1.2","runtime":"webview"},{"id":"ce.panel","version":"1.4","runtime":"any"},{"id":"ce.storage","version":"1.2","runtime":"any"},{"id":"ce.image","version":"1.0","runtime":"webview"},{"id":"ce.text","version":"1.0","runtime":"webview"},{"id":"ce.components.split","version":"1.0","runtime":"webview"},{"id":"ce.components.phrase","version":"1.0","runtime":"webview"},{"id":"ce.components.recorder","version":"1.0","runtime":"webview"},{"id":"ce.components.harmony","version":"1.0","runtime":"webview"},{"id":"ce.components.setlist","version":"1.0","runtime":"webview"},{"id":"ce.components.arp","version":"1.0","runtime":"webview"},{"id":"ce.components.chordpad","version":"1.0","runtime":"webview"},{"id":"ce.components.noteribbon","version":"1.0","runtime":"webview"},{"id":"ce.components.drumpads","version":"1.0","runtime":"webview"},{"id":"ce.components.turing","version":"1.0","runtime":"webview"},{"id":"ce.components.looper","version":"1.0","runtime":"webview"},{"id":"ce.components.orbit","version":"1.0","runtime":"webview"},{"id":"ce.components.kinetic","version":"1.0","runtime":"webview"},{"id":"ce.components.constellation","version":"1.0","runtime":"webview"},{"id":"ce.components.timbre","version":"1.0","runtime":"webview"},{"id":"ce.components.router","version":"1.0","runtime":"webview"},{"id":"ce.components.macro","version":"1.0","runtime":"webview"},{"id":"ce.components.matrix","version":"1.0","runtime":"webview"},{"id":"ce.components.constraint","version":"1.0","runtime":"webview"},{"id":"ce.components.envelope","version":"1.0","runtime":"webview"},{"id":"ce.components.ribbon","version":"1.0","runtime":"webview"},{"id":"ce.components.crossfader","version":"1.0","runtime":"webview"},{"id":"ce.components.joystick","version":"1.0","runtime":"webview"},{"id":"ce.components.meter","version":"1.0","runtime":"webview"},{"id":"ce.components.transport","version":"1.0","runtime":"webview"},{"id":"ce.components.panic","version":"1.0","runtime":"webview"},{"id":"ce.components.lcd","version":"1.0","runtime":"webview"},{"id":"ce.components.pixel","version":"1.0","runtime":"webview"}];
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
        { host->startAnimation (arg (a, 0).toString(), arg (a, 1), (double) arg (a, 2), arg (a, 3)); return {}; });
    api->setMethod ("animateStop", [host, arg] (const Args& a) -> juce::var
        { host->stopAnimation (arg (a, 0).toString()); return {}; });
    api->setMethod ("animateRunning", [host, arg] (const Args& a) -> juce::var
        { return host->animationRunning (arg (a, 0).toString()); });
    api->setMethod ("animateValue", [host, arg] (const Args& a) -> juce::var
        { return host->animationValue (arg (a, 0).toString()); });
    api->setMethod ("animateList", [host] (const Args&) -> juce::var { return host->animationList(); });
    api->setMethod ("animatePause", [host, arg] (const Args& a) -> juce::var
        { return host->animationPause (arg (a, 0).toString()); });
    api->setMethod ("animateResume", [host, arg] (const Args& a) -> juce::var
        { return host->animationResume (arg (a, 0).toString()); });
    api->setMethod ("animateReverse", [host, arg] (const Args& a) -> juce::var
        { return host->animationReverse (arg (a, 0).toString()); });
    api->setMethod ("animateFinish", [host, arg] (const Args& a) -> juce::var
        { return host->animationFinish (arg (a, 0).toString()); });
    api->setMethod ("transportState", [host] (const Args&) -> juce::var { return host->transportState(); });
    api->setMethod ("nowMs", [host] (const Args&) -> juce::var { return host->nowMs(); });
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
    api->setMethod ("saveSetting", [host, arg] (const Args& a) -> juce::var
        { host->saveSetting (arg (a, 0).toString(), arg (a, 1), arg (a, 2).toString()); return {}; });
    api->setMethod ("loadSetting", [host, arg] (const Args& a) -> juce::var
        { return host->loadSetting (arg (a, 0).toString(), arg (a, 1).toString()); });
    api->setMethod ("settingsAvailable", [host, arg] (const Args& a) -> juce::var
        { return host->settingsAvailable (arg (a, 0).toString()); });
    api->setMethod ("listSettings", [host, arg] (const Args& a) -> juce::var
        { return host->listSettings (arg (a, 0).toString()); });
    api->setMethod ("forgetSetting", [host, arg] (const Args& a) -> juce::var
        { return host->forgetSetting (arg (a, 0).toString(), arg (a, 1).toString()); });
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
        // __scriptId as well as __owner: ce.storage's "script" scope spells a private key with the
        // owning script's id in it, so the prelude has to be able to read it.
        juce::String boot = "var __owner = " + resolveSelfOwner (def).quoted() + ";\n"
                          + "var __scriptId = " + def.id.quoted() + ";\n";
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
