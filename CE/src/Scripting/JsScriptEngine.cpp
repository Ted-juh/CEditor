// JsScriptEngine — JavaScript via juce::JavascriptEngine (QuickJS, juce_javascript module).
//
// ONE juce::JavascriptEngine per panel, shared by every JavaScript script on it. Each script runs as
// the body of a function, so what it declares is its own and two scripts can both define onClick;
// what the prelude keeps per script (listeners, rules, timers, `state`, `self`) is switched in on
// every entry. The top of the prelude says how, and what an engine per script used to cost. Native
// calls go through a registered "__api" object; helpers / on / emit / self / noTransmit are defined
// in a JS prelude (kept in sync with the Lua prelude + panelApi.js).
//
// A new name a script assigns without declaring it, or puts on the global object by name
// (`globalThis.x = 1`, `this.x = 1` at its top level), is the script's own too, as it is in the WebView,
// where each script has a QuickJS context and a global of its own: the prelude keeps it in the script's
// context and answers for it from behind the global object (the top of the prelude says how). What a
// shared engine does NOT isolate is a write onto something that already exists on the global: a
// built-in (Math, Array.prototype), `ce`, a function of the prelude. None of the 236 scripts in the
// tree does any of these.
//
// NOTE: juce::JavascriptEngine's exact surface (registerNativeObject / callFunction / NativeFunctionArgs)
// should be confirmed against the JUCE 8 headers during the build — this is the less-certain engine.
// Requires juce::juce_javascript linked (CMake, behind CEDITOR_SCRIPTING). UNVERIFIED until built.

#include "ScriptRuntime.h"
#include <juce_javascript/juce_javascript.h>

#include <cmath>
#include <memory>
#include <set>

namespace ceditor::scripting
{
namespace
{

const char* kJsPrelude = R"JS(
// @module -
// Wrap the native bridge as globals + pure-math helpers + event registry + self.
//
// ONE ENGINE PER PANEL, ONE CONTEXT PER SCRIPT. This prelude runs once, and every JavaScript script
// on the panel shares the engine it runs in. It used to run once per script, each in an engine of
// its own, and that cost 650 KB a script where the engine itself is 75 KB: a panel of 232 scripts
// held 150 MB of identical copies of this file. What a script owns is not this code but a handful
// of tables (its listeners, rules, actions, timers, `state`, its `self`), and __CE_OWN lists them.
// Each script gets its own copy, and the names below are accessors onto whichever script is
// running (__ceCur). The host enters a script only through __ceAdd, __ceCall and __ceIn, which
// switch __ceCur and put it back, so the rest of this file is written as if it served one script,
// and it does, one at a time.
var __ceGlobal = (typeof globalThis !== 'undefined') ? globalThis : this;
var __ceCur = {
  __owner: "", __scriptId: "", self: null, state: {},
  __listeners: [], __watchers: [], __computeds: [], __filters: [], __actions: {},
  __filterDepth: 0, __reactiveDepth: 0, __timerIds: {}, __syncFollow: {},
  __rndStates: {}, __streamOverride: "", __midiIn: [], __midiOut: [], __lastSyncBpm: null,
  __after: {}, __afterN: 0, __animDone: {}, __dumpWaiters: [],
  __globals: {}
};
var __CE_OWN = Object.keys(__ceCur);
// The prelude's own context, current while this file loads. What the prelude registers for itself
// (the on("*", ...) listeners further down, above all) lands here, and every script starts from a
// copy of it, as each script's private engine used to start from a freshly run prelude.
var __cePrelude = __ceCur;
for (var __ceI = 0; __ceI < __CE_OWN.length; __ceI++) {
  (function (name) {
    // An identity set on the global before this file runs (an embedding that runs one script and
    // injects __scriptId, as the host's boot string used to) becomes the prelude context's own.
    if (Object.prototype.hasOwnProperty.call(__ceGlobal, name)) __ceCur[name] = __ceGlobal[name];
    Object.defineProperty(__ceGlobal, name, {
      get: function () { return __ceCur[name]; },
      set: function (v) { __ceCur[name] = v; },
      enumerable: false, configurable: false
    });
  })(__CE_OWN[__ceI]);
}
__ceCur.self = __ceMakeSelf();

// A name a script assigns without ever declaring it. In an engine of its own that made a global only
// that script could see; here it would make one every script sees, and two scripts using the same
// undeclared name would write into each other. So it is kept in the script's context (__globals),
// from behind the global object: a proxy goes into the global's prototype chain, between it and
// Object.prototype. Everything that IS on the global — the prelude, the built-ins, `ce`, anything a
// module declares — is found on the global itself and never reaches the proxy, so it costs nothing.
// Only a lookup that finds nothing there does:
//   - an assignment to such a name lands in the running script's __globals rather than on the
//     global, which is what a sloppy-mode assignment to an unknown name would otherwise create. So
//     does `globalThis.x = 1` for a new x: the global's own [[Set]] asks its prototype about a name
//     it does not have, the trap cannot tell the two apart, and in the WebView a script's global is
//     its own anyway, so that is the same rule;
//   - a read finds the running script's own, and for a name the script never set the proxy says it
//     has nothing, so the read throws "not defined" and `typeof` says 'undefined', exactly as in an
//     engine of its own.
// Code that runs as the prelude's own context — this file and the modules, at their top level — is
// not a script, and keeps the old rule: its undeclared assignments make real globals.
(function () {
  var base = Object.create(Object.getPrototypeOf(__ceGlobal));
  var owned = function (k) {
    return typeof k === "string" && __ceCur !== __cePrelude && Object.prototype.hasOwnProperty.call(__ceCur.__globals, k);
  };
  Object.setPrototypeOf(__ceGlobal, new Proxy(base, {
    has: function (t, k) { return owned(k) || Reflect.has(t, k); },
    get: function (t, k, r) { return owned(k) ? __ceCur.__globals[k] : Reflect.get(t, k, r); },
    set: function (t, k, v, r) {
      if (typeof k === "string" && __ceCur !== __cePrelude && !Reflect.has(t, k)) { __ceCur.__globals[k] = v; return true; }
      return Reflect.set(t, k, v, r);
    }
  }));
})();

// A script's starting context: a copy of the prelude's, with its own identity, `self` and `state`.
// Arrays and tables are copied one level deep, which is as deep as anything here is shared: a
// listener or rule entry is replaced, never edited in place.
function __ceFresh(owner, scriptId) {
  var ctx = {};
  for (var i = 0; i < __CE_OWN.length; i++) {
    var k = __CE_OWN[i], v = __cePrelude[k];
    if (Array.isArray(v)) ctx[k] = v.slice();
    else if (v !== null && typeof v === "object") {
      var o = {};
      for (var p in v) if (Object.prototype.hasOwnProperty.call(v, p)) o[p] = v[p];
      ctx[k] = o;
    } else ctx[k] = v;
  }
  ctx.__owner = owner; ctx.__scriptId = scriptId; ctx.self = __ceMakeSelf(); ctx.state = {};
  return ctx;
}
var __ceScripts = {};
// Load a script. `body` is the script's source wrapped in a function by the host, so its top-level
// declarations are its own, and it returns the resolver its handlers are looked up through. A
// script whose top level throws is not added: nothing it registered can be reached afterwards.
function __ceAdd(id, owner, body) {
  var ctx = __ceFresh(owner, id), prev = __ceCur;
  __ceCur = ctx;
  try { ctx.__resolve = body(); } finally { __ceCur = prev; }
  __ceScripts[id] = ctx;
}
// A handler, looked up by name in the script's own scope as `typeof name === 'function'` used to
// be asked of its private engine, so a handler can be a function declaration, a var or a
// let/const at the script's top level.
function __ceHandler(ctx, name) {
  if (typeof ctx.__resolve !== "function" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return undefined;
  var f;
  try { f = ctx.__resolve("typeof " + name + " === 'function' ? " + name + " : undefined"); }
  catch (err) { return undefined; }
  return typeof f === "function" ? f : undefined;
}
function __ceHas(id, name) {
  var ctx = __ceScripts[id];
  return ctx !== undefined && __ceHandler(ctx, name) !== undefined;
}
// Call a script's handler, inside its context.
function __ceCall(id, name, payload) {
  var ctx = __ceScripts[id];
  if (ctx === undefined) return undefined;
  var prev = __ceCur;
  __ceCur = ctx;
  try {
    var f = __ceHandler(ctx, name);
    return f === undefined ? undefined : f(payload);
  } finally { __ceCur = prev; }
}
// Run one of this prelude's own entry points (__deliver, __runReactive, ...) for one script.
function __ceIn(id, name, args) {
  var ctx = __ceScripts[id];
  if (ctx === undefined) return undefined;
  var prev = __ceCur;
  __ceCur = ctx;
  try { return __ceGlobal[name].apply(undefined, args || []); } finally { __ceCur = prev; }
}

function on(target, event, fn) { __listeners.push({ t: target, e: event, fn: fn }); }
// off(target, event) — __listeners is the calling script's own list (__CE_OWN), so filtering here
// is already scoped to it.
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
 * than in C++, for the same reason on()/off() do: these arrays are the calling script's own
 * (__CE_OWN at the top of this file), so they need no tagging. */

function __sig(v) { return v === undefined ? "\u0000void" : JSON.stringify(v); }
// A rule REPLACES the same path's rule rather than stacking beside it: two filters on one path
// would make the result depend on the order they happened to register in.
function __putRule(list, rule) {
  for (var i = 0; i < list.length; i++) if (list[i].path === rule.path) { list[i] = rule; return; }
  list.push(rule);
}
function watch(path, fn) { __putRule(__watchers, { path: path, fn: fn, last: __sig(__read(path)), prev: undefined }); }
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
        if (__sig(next) === __sig(__read(c.path))) continue;
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
      var cur = __read(__filters[f].path);
      if (cur === undefined) continue;
      var d = __applyIntercepts(__filters[f].path, cur);
      if (d.reject) continue;                       // a veto has nothing to revert to
      if (__sig(d.value) !== __sig(cur)) set(__filters[f].path, d.value);
    }
    for (var w = 0; w < __watchers.length; w++) {
      var rule = __watchers[w], v = __read(rule.path), s = __sig(v);
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
// A script's own get() says why it has no answer when the control or the path is not there, in the
// editor's words (ScriptHostApi::whyNoValue asks the app). __read is the quiet read the prelude's
// own watch, compute and snapshot use, as the editor's do: a watch on a path that is not there yet
// would otherwise say so on every pass.
function __read(path) { return __api.get(path, "value"); }
function __scriptGet(path, form) {
  var v = __api.get(path, form || "value");
  if (v === undefined || v === null) {
    var why = __api.whyNoValue(path, form || "value");
    if (why) logError(why);
  }
  return v;
}
function get(path, form) { return __scriptGet(path, form); }

// `self` — owner-relative set/get (Q7), parity with the Lua/Python preludes. __owner is the running
// script's (__CE_OWN), and each script gets its own `self` from __ceMakeSelf. Plain object literal
// (not an ES class) so it works in QuickJS configs without class support. Empty/"self"/"*" owner =>
// no prefix.
function __ownerPrefix(p) {
  var o = (typeof __owner !== 'undefined' && __owner) ? __owner : "";
  return !o ? p : (o + "." + p);
}
function __ceMakeSelf() {
  return {
    set: function (p, value, opts) { return __api.set(__ownerPrefix(p), value, opts || null); },
    get: function (p, form) { return __scriptGet(__ownerPrefix(p), form); }
  };
}
// @module ce.midi
// sendCC and sendNRPN are host bindings; what a script passes is checked here first (__midiArg, in
// the ce.midi section), as the editor checks it, and only numbers that are a message reach the host.
function sendCC(ch, cc, v) {
  var c = __midiArg("sendCC", "channel", ch); if (c === undefined) return;
  var n = __midiArg("sendCC", "controller", cc); if (n === undefined) return;
  var value = __midiArg("sendCC", "value", v); if (value === undefined) return;
  __api.sendCC(c, n, value);
}
function sendNRPN(ch, msb, lsb, v) {
  var c = __midiArg("sendNRPN", "channel", ch); if (c === undefined) return;
  var m = __midiArg("sendNRPN", "msb", msb); if (m === undefined) return;
  var l = __midiArg("sendNRPN", "lsb", lsb); if (l === undefined) return;
  var value = __midiArg("sendNRPN", "value14", v); if (value === undefined) return;
  __api.sendNRPN(c, m, l, value);
}
function sendSysex(bytes) { return __api.sendSysex(bytes); }
// @module ce.device
// requestDump is assembled further down, over __api.requestDump: it takes an optional callback,
// which is a language value the host has no way to call back.
function applyDump(bytes) { return __api.applyDump(bytes); }
function sendDump(kind) { return __api.sendDump(kind); }
function buildDump(kind) { return __api.buildDump(kind); }
// @module ce.time
// The prelude tracks which timers exist (runningTimers) and which follow the tempo (syncTimer), so
// these are more than a pass-through to the host. Both tables, __timerIds and __syncFollow, are the
// running script's own (__CE_OWN).
// An interval or a delay a script got wrong is refused, in the WebView runtime's words (timeRefused
// there). `Number(ms) || 0` made startTimer(id, "fast"), startTimer(id) and startTimer(id, -100) a
// timer at the host's 5 ms floor, and after("1s", fn) ran at once. A repeating interval is a number
// above 0; a one-shot's delay a number from 0, where 0 is "as soon as the handler has returned".
// Text is refused, "250" included. Returns true when it refused.
function __timeRefused(call, value, unit, what, positive, outcome) {
  var why = null;
  if (value === undefined || value === null) why = "no " + what + " was given";
  else if (typeof value === "string") why = '"' + value + '" is not a number of ' + unit;
  else if (typeof value !== "number") why = "the " + what + " is not a number of " + unit;
  else if (!isFinite(value)) why = "the " + what + " is not a finite number of " + unit;
  else if (positive && value <= 0) why = String(value) + " is not more than 0 " + unit;
  else if (!positive && value < 0) why = String(value) + " is less than 0 " + unit;
  if (why === null) return false;
  logError(call + ": " + why + ", so " + outcome + ".");
  return true;
}
// A number of beats, or a division's name ("1/16" is a quarter of a beat), any case. Nothing when
// refused. The WebView runtime's beatsOf.
function __beatsOf(call, value, positive, outcome) {
  if (typeof value === "string") {
    var wanted = value.toLowerCase();
    for (var i = 0; i < __CE_DIVISION_NAMES.length; i++) {
      if (__CE_DIVISION_NAMES[i].toLowerCase() === wanted) return __CE_DIVISIONS[__CE_DIVISION_NAMES[i]];
    }
    logError(call + ': "' + value + '" is neither a number of beats nor a division, so ' + outcome
      + ". The divisions are " + __CE_DIVISION_NAMES.join(", ") + ".");
    return undefined;
  }
  return __timeRefused(call, value, "beats", "number of beats", positive, outcome) ? undefined : value;
}
// Start or re-time a timer whose interval the caller checked or worked out itself.
function __armTimer(key, ms) {
  // An explicit millisecond interval REPLACES a musical one: this is a script asking for
  // milliseconds, not beats.
  delete __syncFollow[key];
  __timerIds[key] = true;
  return __api.startTimer(key, Math.round(Number(ms) || 0));
}
function startTimer(id, ms) {
  var key = String(id === undefined || id === null ? "" : id);
  if (!key) {
    logError("ce.time.startTimer: no id was given, so no timer was started.");
    return undefined;
  }
  if (__timeRefused('ce.time.startTimer("' + key + '")', ms, "milliseconds", "interval", true, "no timer was started"))
    return undefined;
  return __armTimer(key, ms);
}
function stopTimer(id) {
  var key = String(id === undefined || id === null ? "" : id);
  if (!key) {
    logError("ce.time.stopTimer: no id was given, so nothing was stopped.");
    return undefined;
  }
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
function snap(v, step) {
  var n = __mnum("ce.math.snap", "the value", v);
  if (n === undefined) return undefined;
  var s = __mnum("ce.math.snap", "the step", step);
  if (s === undefined) return undefined;
  return s === 0 ? n : Math.round(n / s) * s;
}
function lerp(a, b, t) {
  var x = __mnum("ce.math.lerp", "a", a);
  if (x === undefined) return undefined;
  var y = __mnum("ce.math.lerp", "b", b);
  if (y === undefined) return undefined;
  var f = __mnum("ce.math.lerp", "t", t);
  if (f === undefined) return undefined;
  return x + (y - x) * f;
}
function curve(v, shape) {
  shape = shape || "linear";
  // A name in any case, as every word from a list is read: "EXP" is "exp".
  var name = String(shape).trim().toLowerCase();
  if (name === "exp") return v * v;
  if (name === "log") return Math.sqrt(Math.max(0, v));
  if (name === "s") return v * v * (3 - 2 * v);
  // A shape the list does not have used to return v in SILENCE, which reads as a curve that does
  // nothing rather than as a name that was never applied.
  if (name !== "linear" && name !== "")
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
// A point's [x, y, curve, tension] as written, or null when it is no point: a pair is a list of
// them in that order; an object is read by its names, and failing those by its numbered entries,
// counted from 0 when it has an entry 0 and from 1 when it does not. The WebView runtime reads a
// point the same way (animEnvelope.js envelopePointParts), so it is one point in both.
function __pointParts(p) {
  if (p === null || typeof p !== "object") return null;
  if (p.length !== undefined) return [p[0], p[1], p[2], p[3]];
  var from = Object.prototype.hasOwnProperty.call(p, "0") ? 0 : 1;
  var named = function (key, at) { return p[key] !== undefined && p[key] !== null ? p[key] : p[from + at]; };
  return [named("x", 0), named("y", 1), named("curve", 2), named("tension", 3)];
}
// [[x, y, curve, tension], …] sorted by x. Accepts pairs and { x: , y: } objects, so a panel can
// write either; a point's curve shapes the segment that ends at it (mapCurve).
function __points(points) {
  var out = [];
  if (points && points.length !== undefined) {
    for (var i = 0; i < points.length; i++) {
      var parts = __pointParts(points[i]);
      if (!parts) continue;
      var x = Number(parts[0]), y = Number(parts[1]);
      if (isFinite(x) && isFinite(y)) out.push([x, y, parts[2], parts[3]]);
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
    if (n < x1 && x1 !== x0) {
      // The segment's own shape, from the point it ends at, as the WebView runtime's mapCurve and
      // the Envelope component take it. Read for straight lines alone, a point's curve played as a
      // line here and as a curve in the editor.
      if (list[i][2] !== undefined && list[i][2] !== null) {
        return y0 + shapeCurve((n - x0) / (x1 - x0), list[i][2], list[i][3]) * (y1 - y0);
      }
      return y0 + (n - x0) * (y1 - y0) / (x1 - x0);
    }
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
  law = String(law === undefined || law === null ? "linear" : law).trim().toLowerCase();
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
  // One number alone is the top of a range from 0, not the bottom of one up to 1.
  var alone = hi === undefined || hi === null;
  var a = alone ? 0 : __num(lo), b = alone ? __num(lo, 1) : __num(hi);
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
  // The same point twice has no direction: 0, in every runtime. atan2 answered 180 for it here.
  if (dx === 0 && dy === 0) return 0;
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
  var name = String(curve).trim().toLowerCase();   // in any case: "SCurve" is "scurve"
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
  var name = String(curve).trim().toLowerCase();
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
// ONE GENERATOR PER STREAM. __rndStates is the running script's own (__CE_OWN), so the key only has
// to separate streams within one script, where a single state meant shuffle() advanced what
// gaussian() read, and seeding one element reset the other. __streamOverride is per script too.
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
  var a = __mnum("ce.math.random", "lo", lo);
  if (a === undefined) return undefined;
  var b = __mnum("ce.math.random", "hi", hi);
  if (b === undefined) return undefined;
  // Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step — and
  // only those inside the range: the ends were floored, so random(1.5, 3.5) could give 1.
  var low = Math.ceil(Math.min(a, b)), high = Math.floor(Math.max(a, b));
  if (high < low) {
    logError("ce.math.random: there is no whole number from " + __shownValue(a) + " to " + __shownValue(b) + ", so there is no answer.");
    return undefined;
  }
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
// In takes what a colour property takes, read as if what the property would store had been given:
// "RRGGBB", "AARRGGBB" or "#RRGGBB" as written (6 hex digits are RRGGBB, 8 are AARRGGBB with the
// alpha set aside, one leading "#" either way), and CSS's short forms written out first, as the
// WebView writes them out (scriptColours.js's storedColour): "#RGB", a name from the generated
// table below, rgb(), rgba(), hsl() and hsla(), so "red" is "#FF0000" and rgba(255, 0, 0, 0.5) is
// "80FF0000". Out is "#RRGGBB", which CSS, SVG and a panel property all accept. The ONE exception
// is alpha(), which returns the panel's AARRGGBB: CSS's #RRGGBBAA is the same bytes the other way
// round.
//
// Anything else is refused, where it used to be read from its last six characters ("x5B9BD5" and
// the number 0xFF0000 were colours). So is an amount outside 0..1, which used to be used as it was
// (lighten by 40 was white) or clamped (alpha 128 was solid). In the words of the WebView runtime's
// colourChannels and colourUnit (scripting/scriptColours.js), which scriptPreludeAgreement.test.js
// checks; __realNumber is its realNumber, and ce.anim's targets are read by it too.
// BEGIN GENERATED colour names — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// @module ce.math
// CSS's named colours (scriptColours.CSS_NAMED_COLOURS), as RRGGBB: what a colour
// property writes "red" out as, and what the ce.math colour helpers read it as.
var __CE_CSS_COLOURS = {
  aliceblue: "F0F8FF", antiquewhite: "FAEBD7", aqua: "00FFFF", aquamarine: "7FFFD4",
  azure: "F0FFFF", beige: "F5F5DC", bisque: "FFE4C4", black: "000000", blanchedalmond: "FFEBCD",
  blue: "0000FF", blueviolet: "8A2BE2", brown: "A52A2A", burlywood: "DEB887", cadetblue: "5F9EA0",
  chartreuse: "7FFF00", chocolate: "D2691E", coral: "FF7F50", cornflowerblue: "6495ED",
  cornsilk: "FFF8DC", crimson: "DC143C", cyan: "00FFFF", darkblue: "00008B", darkcyan: "008B8B",
  darkgoldenrod: "B8860B", darkgray: "A9A9A9", darkgreen: "006400", darkgrey: "A9A9A9",
  darkkhaki: "BDB76B", darkmagenta: "8B008B", darkolivegreen: "556B2F", darkorange: "FF8C00",
  darkorchid: "9932CC", darkred: "8B0000", darksalmon: "E9967A", darkseagreen: "8FBC8F",
  darkslateblue: "483D8B", darkslategray: "2F4F4F", darkslategrey: "2F4F4F",
  darkturquoise: "00CED1", darkviolet: "9400D3", deeppink: "FF1493", deepskyblue: "00BFFF",
  dimgray: "696969", dimgrey: "696969", dodgerblue: "1E90FF", firebrick: "B22222",
  floralwhite: "FFFAF0", forestgreen: "228B22", fuchsia: "FF00FF", gainsboro: "DCDCDC",
  ghostwhite: "F8F8FF", gold: "FFD700", goldenrod: "DAA520", gray: "808080", green: "008000",
  greenyellow: "ADFF2F", grey: "808080", honeydew: "F0FFF0", hotpink: "FF69B4", indianred: "CD5C5C",
  indigo: "4B0082", ivory: "FFFFF0", khaki: "F0E68C", lavender: "E6E6FA", lavenderblush: "FFF0F5",
  lawngreen: "7CFC00", lemonchiffon: "FFFACD", lightblue: "ADD8E6", lightcoral: "F08080",
  lightcyan: "E0FFFF", lightgoldenrodyellow: "FAFAD2", lightgray: "D3D3D3", lightgreen: "90EE90",
  lightgrey: "D3D3D3", lightpink: "FFB6C1", lightsalmon: "FFA07A", lightseagreen: "20B2AA",
  lightskyblue: "87CEFA", lightslategray: "778899", lightslategrey: "778899",
  lightsteelblue: "B0C4DE", lightyellow: "FFFFE0", lime: "00FF00", limegreen: "32CD32",
  linen: "FAF0E6", magenta: "FF00FF", maroon: "800000", mediumaquamarine: "66CDAA",
  mediumblue: "0000CD", mediumorchid: "BA55D3", mediumpurple: "9370DB", mediumseagreen: "3CB371",
  mediumslateblue: "7B68EE", mediumspringgreen: "00FA9A", mediumturquoise: "48D1CC",
  mediumvioletred: "C71585", midnightblue: "191970", mintcream: "F5FFFA", mistyrose: "FFE4E1",
  moccasin: "FFE4B5", navajowhite: "FFDEAD", navy: "000080", oldlace: "FDF5E6", olive: "808000",
  olivedrab: "6B8E23", orange: "FFA500", orangered: "FF4500", orchid: "DA70D6",
  palegoldenrod: "EEE8AA", palegreen: "98FB98", paleturquoise: "AFEEEE", palevioletred: "DB7093",
  papayawhip: "FFEFD5", peachpuff: "FFDAB9", peru: "CD853F", pink: "FFC0CB", plum: "DDA0DD",
  powderblue: "B0E0E6", purple: "800080", rebeccapurple: "663399", red: "FF0000",
  rosybrown: "BC8F8F", royalblue: "4169E1", saddlebrown: "8B4513", salmon: "FA8072",
  sandybrown: "F4A460", seagreen: "2E8B57", seashell: "FFF5EE", sienna: "A0522D", silver: "C0C0C0",
  skyblue: "87CEEB", slateblue: "6A5ACD", slategray: "708090", slategrey: "708090", snow: "FFFAFA",
  springgreen: "00FF7F", steelblue: "4682B4", tan: "D2B48C", teal: "008080", thistle: "D8BFD8",
  tomato: "FF6347", turquoise: "40E0D0", violet: "EE82EE", wheat: "F5DEB3", white: "FFFFFF",
  whitesmoke: "F5F5F5", yellow: "FFFF00", yellowgreen: "9ACD32",
};
// END GENERATED colour names
var __CFORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS colour name, rgb() or hsl()';
function __chex(n, width) { var s = n.toString(16).toUpperCase(); while (s.length < width) s = "0" + s; return s; }
function __chint(v) {
  if (typeof v === "number") {
    if (!isFinite(v) || Math.floor(v) !== v || v < 0 || v > 0xFFFFFFFF) return "";
    return " As text, " + String(v) + ' is "' + (v <= 0xFFFFFF ? "#" + __chex(v, 6) : __chex(v, 8)) + '".';
  }
  if (typeof v !== "string") return "";
  var m = /^(#?)([0-9a-fA-F]{3,4})$/.exec(v);
  if (!m) return "";
  var d = m[2].toUpperCase();
  var two = function (i) { return d.charAt(i) + d.charAt(i); };
  return d.length === 3 ? ' Write "' + m[1] + two(0) + two(1) + two(2) + '".'
                        : ' Write "' + two(3) + two(0) + two(1) + two(2) + '".';
}
function __realNumber(v) {
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  if (typeof v !== "string" || !/^\s*[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\s*$/.test(v)) return undefined;
  var n = Number(v);
  return isFinite(n) ? n : undefined;
}
// A number a ce.math command was given, or undefined after an error in the console. Left out, it
// is the fallback when there is one. The WebView runtime's mathNumber, word for word.
function __mnum(verb, what, v, fallback) {
  if ((v === undefined || v === null) && fallback !== undefined) return fallback;
  var n = __realNumber(v);
  if (n !== undefined) return n;
  logError(v === undefined || v === null
    ? verb + ": " + what + " is a number, and none was given, so there is no answer."
    : verb + ": " + what + " is a number, and " + __shownValue(v) + " is not, so there is no answer.");
  return undefined;
}
function __cunit(verb, what, v, fallback) {
  if ((v === undefined || v === null) && fallback !== undefined) return fallback;
  var n = __realNumber(v);
  if (n !== undefined && n >= 0 && n <= 1) return n;
  var shown = v === undefined || v === null ? "none was given"
    : (typeof v === "string" ? '"' + v + '" is not'
      : (typeof v === "number" && isFinite(v) ? String(v) + " is not" : "the value given is not"));
  var hint = n !== undefined && n / 100 >= 0 && n / 100 <= 1
    ? " If you meant " + String(n) + " out of 100, write " + String(Number((n / 100).toFixed(4))) + "." : "";
  logError(verb + ": " + what + " is a number from 0 to 1, and " + shown + ", so there is no answer." + hint);
  return undefined;
}
// CSS's short forms, read as scriptColours.js reads them: its cssChannels, panelFormOf, longForm and
// cssHint, with its four expressions, written out again because a prelude cannot import them.
var __CSS_NUM = "[+-]?(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?";
var __CSS_ALPHA_LEGACY = "(?:,\\s*(" + __CSS_NUM + ")(%?)\\s*)?";
var __CSS_ALPHA_MODERN = "(?:\\/\\s*(" + __CSS_NUM + ")(%?)\\s*)?";
var __CSS_RGB_LEGACY = new RegExp("^rgba?\\(\\s*(" + __CSS_NUM + ")(%?)\\s*,\\s*(" + __CSS_NUM + ")(%?)\\s*,\\s*("
  + __CSS_NUM + ")(%?)\\s*" + __CSS_ALPHA_LEGACY + "\\)$", "i");
var __CSS_RGB_MODERN = new RegExp("^rgba?\\(\\s*(" + __CSS_NUM + ")(%?)\\s+(" + __CSS_NUM + ")(%?)\\s+("
  + __CSS_NUM + ")(%?)\\s*" + __CSS_ALPHA_MODERN + "\\)$", "i");
var __CSS_HSL_LEGACY = new RegExp("^hsla?\\(\\s*(" + __CSS_NUM + ")(deg|grad|rad|turn)?\\s*,\\s*(" + __CSS_NUM
  + ")()%\\s*,\\s*(" + __CSS_NUM + ")()%\\s*" + __CSS_ALPHA_LEGACY + "\\)$", "i");
var __CSS_HSL_MODERN = new RegExp("^hsla?\\(\\s*(" + __CSS_NUM + ")(deg|grad|rad|turn)?\\s+(" + __CSS_NUM
  + ")(%?)\\s+(" + __CSS_NUM + ")(%?)\\s*" + __CSS_ALPHA_MODERN + "\\)$", "i");
var __CSS_TURN = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
function __cclamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function __calpha(value, percent) { return value === undefined ? 1 : __cclamp(Number(value) / (percent ? 100 : 1), 0, 1); }
// A CSS colour as { r, g, b, a } (0-255, 0-1), or null. An own name only, so "constructor" is none.
function __ccss(text) {
  var s = String(text).trim();
  var lower = s.toLowerCase();
  if (lower === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (Object.prototype.hasOwnProperty.call(__CE_CSS_COLOURS, lower)) {
    var named = __CE_CSS_COLOURS[lower];
    return { r: parseInt(named.slice(0, 2), 16), g: parseInt(named.slice(2, 4), 16), b: parseInt(named.slice(4, 6), 16), a: 1 };
  }
  var m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    var d = m[1].length <= 4 ? m[1].replace(/./g, function (c) { return c + c; }) : m[1];
    var byte = function (i) { return parseInt(d.slice(i, i + 2), 16); };
    return { r: byte(0), g: byte(2), b: byte(4), a: d.length === 8 ? byte(6) / 255 : 1 };
  }
  m = __CSS_RGB_LEGACY.exec(s) || __CSS_RGB_MODERN.exec(s);
  if (m) {
    var channel = function (i) { return __cclamp(Math.round(Number(m[i]) * (m[i + 1] ? 2.55 : 1)), 0, 255); };
    return { r: channel(1), g: channel(3), b: channel(5), a: __calpha(m[7], m[8]) };
  }
  m = __CSS_HSL_LEGACY.exec(s) || __CSS_HSL_MODERN.exec(s);
  if (m) {
    // A hue too large to be a number has no angle, and is not a colour.
    var turned = Number(m[1]) * __CSS_TURN[(m[2] || "deg").toLowerCase()];
    if (!isFinite(turned)) return null;
    var h = (turned % 360 + 360) % 360;
    var sat = __cclamp(Number(m[3]), 0, 100) / 100;
    var light = __cclamp(Number(m[5]), 0, 100) / 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var amp = sat * Math.min(light, 1 - light);
    var f = function (n) { return Math.round(255 * (light - amp * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))); };
    return { r: f(0), g: f(8), b: f(4), a: __calpha(m[7], m[8]) };
  }
  return null;
}
// The same colour in the panel's form: #RRGGBB when solid, AARRGGBB when it is not.
function __cpanelForm(c) {
  var rgb = __chex(c.r, 2) + __chex(c.g, 2) + __chex(c.b, 2);
  return c.a >= 1 ? "#" + rgb : __chex(Math.round(c.a * 255), 2) + rgb;
}
// Does the panel read this as a colour? 6 or 8 hex digits, with or without one "#".
function __cpanelHex(v) { return typeof v === "string" && /^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v); }
// CSS's short forms written out, as a property stores them, or "": not text with space around it,
// "#" only with three digits ("#" with four is RGBA to CSS and ARGB here), and nothing CSS cannot read.
function __clong(value) {
  if (typeof value !== "string" || value !== value.trim()) return "";
  if (value.charAt(0) === "#" && !/^#[0-9a-f]{3}$/i.test(value)) return "";
  var c = __ccss(value);
  return c ? __cpanelForm(c) : "";
}
// For a refusal: what CSS text with space around it is in the panel's form, or "". Text that is the
// panel's own form once the space is gone is that text, read as the panel reads it.
function __ccssHint(value) {
  if (typeof value !== "string" || __cpanelHex(value)) return "";
  var trimmed = value.trim();
  if (trimmed !== value && __cpanelHex(trimmed)) return ' Write "' + trimmed + '".';
  var c = __ccss(value);
  return c ? ' Write "' + __cpanelForm(c) + '".' : "";
}
function __cchan(verb, hex) {
  var stored = typeof hex === "string" ? (__cpanelHex(hex) ? hex : __clong(hex)) : "";
  if (stored) {
    var h = stored.slice(-6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  var why = hex === undefined || hex === null ? "no colour was given"
    : (typeof hex === "string" ? '"' + hex + '" is not a colour'
      : (typeof hex === "number" && isFinite(hex) ? String(hex) + " is not a colour" : "the colour given is not text"));
  logError(verb + ": " + why + ", so there is no answer. " + __CFORMS + "." + (__chint(hex) || __ccssHint(hex)));
  return null;
}
function __cbyte(v) {
  var n = Math.round(Number(v) || 0);
  return n < 0 ? 0 : (n > 255 ? 255 : n);
}
function rgbToHex(r, g, b) {
  var rr = __mnum("ce.math.hex", "the red part", r, 0);
  if (rr === undefined) return undefined;
  var gg = __mnum("ce.math.hex", "the green part", g, 0);
  if (gg === undefined) return undefined;
  var bb = __mnum("ce.math.hex", "the blue part", b, 0);
  if (bb === undefined) return undefined;
  var c = function (v) { var s = __cbyte(v).toString(16); return s.length < 2 ? "0" + s : s; };
  return ("#" + c(rr) + c(gg) + c(bb)).toUpperCase();
}
function hexToRgb(hex) {
  var c = __cchan("ce.math.rgb", hex);
  return c === null ? undefined : { r: c[0], g: c[1], b: c[2] };
}
function lighten(hex, amount) {
  var c = __cchan("ce.math.lighten", hex);
  if (c === null) return undefined;
  var f = __cunit("ce.math.lighten", "the amount", amount, 0.4);
  if (f === undefined) return undefined;
  return rgbToHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f);
}
function darken(hex, amount) {
  var c = __cchan("ce.math.darken", hex);
  if (c === null) return undefined;
  var f = __cunit("ce.math.darken", "the amount", amount, 0.55);
  if (f === undefined) return undefined;
  return rgbToHex(c[0] * f, c[1] * f, c[2] * f);
}
// NOT an app algorithm, and said so: lerp() per channel in plain RGB.
function mixColour(a, b, t) {
  var x = __cchan("ce.math.mix", a);
  if (x === null) return undefined;
  var y = __cchan("ce.math.mix", b);
  if (y === null) return undefined;
  var n = __mnum("ce.math.mix", "t", t, 0);
  if (n === undefined) return undefined;
  var f = Math.min(1, Math.max(0, n));
  return rgbToHex(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f);
}
// The PANEL's form: AARRGGBB, no leading #, which is what a stored colour property holds.
// A colour written with its alpha first (fromARGB) or last (fromRGBA), in the form every reader
// reads one way: "#RRGGBB" when solid, AARRGGBB when not. scriptColours.orderedColour's reading,
// in the WebView runtime's colourFromOrder words.
var __CORDER = {
  argb: 'Write 8 hex digits with the alpha first, such as "80123456" or "#80123456", or 4, such as "#8123". With 6 or 3 there is no alpha.',
  rgba: 'Write 8 hex digits with the alpha last, such as "12345680" or "#12345680", or 4, such as "#1238". With 6 or 3 there is no alpha.'
};
function __corder(verb, order, value) {
  if (typeof value === "string") {
    var m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
    if (m) {
      var d = (m[1].length <= 4 ? m[1].replace(/[0-9a-fA-F]/g, function (c) { return c + c; }) : m[1]).toUpperCase();
      var first = order === "argb";
      var aa = d.length === 8 ? (first ? d.slice(0, 2) : d.slice(6)) : "FF";
      var rgb = d.length === 8 ? (first ? d.slice(2) : d.slice(0, 6)) : d;
      return aa === "FF" ? "#" + rgb : aa + rgb;
    }
  }
  var why = value === undefined || value === null ? "no colour was given"
    : (typeof value === "string" ? '"' + value + '" is not a colour written ' + (order === "argb" ? "AARRGGBB" : "RRGGBBAA")
      : (typeof value === "number" && isFinite(value) ? String(value) + " is a number, not text" : "the colour given is not text"));
  logError(verb + ": " + why + ", so there is no answer. " + __CORDER[order]);
  return undefined;
}
function colourFromArgb(colour) { return __corder("ce.math.fromARGB", "argb", colour); }
function colourFromRgba(colour) { return __corder("ce.math.fromRGBA", "rgba", colour); }
function colourAlpha(hex, a) {
  var c = __cchan("ce.math.alpha", hex);
  if (c === null) return undefined;
  var f = __cunit("ce.math.alpha", "the alpha", a);
  if (f === undefined) return undefined;
  var aa = Math.round(f * 255).toString(16);
  if (aa.length < 2) aa = "0" + aa;
  return (aa + rgbToHex(c[0], c[1], c[2]).slice(1)).toUpperCase();
}
function hexToHsl(hex) {
  var c = __cchan("ce.math.hsl", hex);
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
  var h = __mnum("ce.math.fromHsl", "the hue", hue, 0);
  if (h === undefined) return undefined;
  var s = __mnum("ce.math.fromHsl", "the saturation", sat, 0);
  if (s === undefined) return undefined;
  var l = __mnum("ce.math.fromHsl", "the lightness", light, 0);
  if (l === undefined) return undefined;
  // A hue goes round: -120 is 240. JavaScript's % keeps the sign, so a negative hue gave the wrong
  // colour here and the right one in Lua and Python. The saturation and the lightness are held at 0
  // and 100.
  h = h - 360 * Math.floor(h / 360);
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
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
  // In any case: "c4", "eb4" and "BB3" (a B, then a flat) are C4, E♭4 and B♭3.
  var m = /^([A-Ga-g])([#bB]?)(-?\d+)$/.exec(String(name).split("♯").join("#").split("♭").join("b").trim());
  if (!m) return undefined;
  var letter = m[1].toUpperCase(), acc = m[2] === "B" ? "b" : m[2];
  var pc = acc === "b" ? __FLAT_LETTER[letter] : __NOTES.indexOf(letter + acc);
  if (pc === undefined || pc < 0) return undefined;
  var oct = parseInt(m[3], 10) + ((acc === "b" && letter === "C") ? 0 : 1);
  return oct * 12 + pc;
}

// BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// @module ce.music
var __CE_SCALES, __CE_CHORDS, __CE_NOTE_SHARP, __CE_NOTE_FLAT, __CE_FLAT_KEYS, __CE_MINOR_SCALES, __CE_QUALITY_SUFFIX, __CE_ROMAN, __CE_MINOR_QUALITIES, __CE_SCALE_NAMES, __CE_CHORD_NAMES, __CE_DIVISIONS, __CE_DIVISION_LABELS, __CE_DIVISION_NAMES, __CE_TIME, __CE_EASINGS;
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
__CE_SCALE_NAMES = ["major","minor","harmonicMinor","melodicMinor","dorian","phrygian","lydian","mixolydian","locrian","pentatonicMaj","pentatonicMin","blues"];
__CE_CHORD_NAMES = ["major","minor","dim","aug","sus2","sus4","power","maj6","min6","dom7","maj7","min7","minMaj7","dim7","m7b5","aug7","add9","dom9","maj9","min9"];
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
__CE_EASINGS["inCubic"] = [0.55,0.055,0.675,0.19];
__CE_EASINGS["outCubic"] = [0.215,0.61,0.355,1];
__CE_EASINGS["inOutCubic"] = [0.645,0.045,0.355,1];
__CE_EASINGS["inBack"] = [0.6,-0.28,0.735,0.045];
__CE_EASINGS["outBack"] = [0.175,0.885,0.32,1.275];
__CE_EASINGS["inOutBack"] = [0.68,-0.55,0.265,1.55];
// @module ce.music
// END GENERATED music tables

// Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
// or a name ("C4"), the way sendNote does. An unknown scale or chord name returns undefined rather
// than guessing "major" — a script that asked for something this build does not know should find out.
// It found out only by getting undefined, and an unreadable note NAME was worse: __pitch made it 0,
// so scaleNotes("c4") answered with the scale on C-1. Both now answer undefined and say why, through
// __setOf and __pitchOf, in the words of the WebView runtime's musicSetOf and musicPitchOf. Each
// helper checks its scale or chord first, then its notes in argument order, and stops at the first.
// A number has to be a finite one: NaN, true or a table rooted the answer at C-1 just as an
// unreadable name had. The answer itself may pass 127 (a chord on G9 does); a sender refuses that.
function __pitch(v) {
  if (typeof v === "string") return noteNumber(v);
  return typeof v === "number" && isFinite(v) ? Math.floor(v) : undefined;
}
// A word from a list, in any case and with spaces around it, as the list spells it (an array's
// entries, or an object's keys), or undefined: "Dorian" is "dorian", "MAJ7" is "maj7".
function __word(list, name) {
  if (typeof name !== "string") return undefined;
  var want = name.trim().toLowerCase(), keys = Array.isArray(list) ? list : Object.keys(list);
  for (var i = 0; i < keys.length; i++) if (String(keys[i]).toLowerCase() === want) return keys[i];
  return undefined;
}
function __steps(tbl, name, fallback) {
  if (name === undefined || name === null) return tbl[fallback];
  var key = __word(tbl, String(name));
  return key === undefined ? undefined : tbl[key];
}
function __pitchOf(verb, v) {
  // A note left out altogether used to go the numeric way and become 0, the scale on C-1 again.
  if (v === undefined || v === null) {
    logError(verb + ': no note was given, so there is no answer. A note is a MIDI number or a name, such as 60 or "C4".');
    return undefined;
  }
  var n = __pitch(v);
  if (n === undefined) {
    logError(typeof v === "string"
      ? verb + ': "' + v + '" is not a note name, so there is no answer. A name is '
        + 'a letter from A to G, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".'
      : verb + ': ' + __shownValue(v) + ' is not a note, so there is no answer. A note is a MIDI '
        + 'number or a name, such as 60 or "C4".');
  }
  return n;
}
function __setOf(verb, kind, name) {
  var s = __steps(kind === "chord" ? __CE_CHORDS : __CE_SCALES, name, "major");
  if (!s) {
    logError(verb + ': "' + String(name) + '" is not a ' + kind + ', so there is no answer. The ' + kind
      + 's are ' + (kind === "chord" ? __CE_CHORD_NAMES : __CE_SCALE_NAMES).join(", ") + '.');
  }
  return s;
}
function scaleNotes(root, scale) {
  var s = __setOf("ce.music.scale", "scale", scale); if (!s) return undefined;
  var base = __pitchOf("ce.music.scale", root); if (base === undefined) return undefined;
  var out = []; for (var i = 0; i < s.length; i++) out.push(base + s[i]); return out;
}
function chordNotes(root, chordType) {
  var s = __setOf("ce.music.chord", "chord", chordType); if (!s) return undefined;
  var base = __pitchOf("ce.music.chord", root); if (base === undefined) return undefined;
  var out = []; for (var i = 0; i < s.length; i++) out.push(base + s[i]); return out;
}
function quantizeNote(note, root, scale) {
  var s = __setOf("ce.music.quantize", "scale", scale); if (!s) return undefined;
  var n = __pitchOf("ce.music.quantize", note); if (n === undefined) return undefined;
  var base = __pitchOf("ce.music.quantize", root); if (base === undefined) return undefined;
  var inKey = {};
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
  var nm = (scale === undefined || scale === null) ? "major" : (__word(__CE_SCALES, String(scale)) || String(scale));
  if (!__setOf("ce.music.spelling", "scale", scale)) return undefined;
  var pitch = __pitchOf("ce.music.spelling", root); if (pitch === undefined) return undefined;
  var pc = __m12(pitch);
  // Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
  if (__CE_MINOR_SCALES[nm] === true) pc = __m12(pc + 3);
  return __CE_FLAT_KEYS[pc] === true;
}
function inScale(note, root, scale) {
  var s = __setOf("ce.music.inScale", "scale", scale); if (!s) return undefined;
  var n = __pitchOf("ce.music.inScale", note); if (n === undefined) return undefined;
  var r = __pitchOf("ce.music.inScale", root); if (r === undefined) return undefined;
  var base = __m12(r), pc = __m12(n);
  for (var i = 0; i < s.length; i++) if (__m12(base + s[i]) === pc) return true;
  return false;
}
// 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets undefined
// rather than the nearest one — rounding here turns a wrong note into a plausible chord, and
// quantizeNote is the verb that rounds on purpose.
function scaleDegree(note, root, scale) {
  var s = __setOf("ce.music.degree", "scale", scale); if (!s) return undefined;
  var n = __pitchOf("ce.music.degree", note); if (n === undefined) return undefined;
  var r = __pitchOf("ce.music.degree", root); if (r === undefined) return undefined;
  var base = __m12(r), pc = __m12(n);
  for (var i = 0; i < s.length; i++) if (__m12(base + s[i]) === pc) return i + 1;
  return undefined;
}
// Name a chord from the notes in it, reading intervals above the lowest one: the inverse of
// chordNotes, in the vocabulary the Chord Pad labels with.
function chordQuality(notes) {
  var read = __noteList("chordQuality", "notes", notes);
  if (!read || !read.length) return undefined;
  var list = __sortedNotes(read);
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
  var nm = (scale === undefined || scale === null) ? "major" : (__word(__CE_SCALES, String(scale)) || String(scale));
  var s = __setOf("ce.music.degreeChord", "scale", scale);
  if (!s || !s.length) return undefined;
  if (__pitchOf("ce.music.degreeChord", root) === undefined) return undefined;
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
// ce.music's lists of notes, read as the WebView reads them (noteLists.js): a number, a note name
// or text that is a number, and one that is neither refuses the call, saying where it is. They were
// read with Number(), so a chord written by name was an empty one, and true was a note. null for a
// list refused, and the same sentences in all four runtimes.
var __NOTE_LISTS = {
  chordQuality: ["ce.music.quality", "there is no answer"], voiceLead: ["ce.music.lead", "the answer is an empty list"],
  expandOctaves: ["ce.music.octaves", "the answer is an empty list"], arpOrder: ["ce.music.arp", "the answer is an empty list"]
};
function __noteListItem(v) {
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  var n = noteNumber(v);
  if (n !== undefined && n !== null) return n;
  return __realNumber(v);
}
function __noteList(fn, name, list, mayBeAbsent) {
  var spec = __NOTE_LISTS[fn];
  function say(why, more) { logError(spec[0] + ": " + why + ", so " + spec[1] + "." + (more || "")); return null; }
  if (list === undefined || list === null) return mayBeAbsent ? [] : say("no " + name + " were given");
  if (!Array.isArray(list)) return say(__shownValue(list) + " is not a list of notes");
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var n = __noteListItem(list[i]);
    if (n === undefined) {
      var where = __shownValue(list[i]) + " at position " + (i + 1) + " of " + name;
      return typeof list[i] === "string" ? say(where + " is not a note name", ' A name is a letter from A to G, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".')
        : say(where + " is not a note", ' A note is a MIDI number or a name, such as 60 or "C4".');
    }
    out.push(n);
  }
  return out;
}
function __sortedNotes(list) { return list.slice().sort(function (a, b) { return a - b; }); }
// A word or a count used as its default, said once (noteLists.js).
var __musicWarned = {};
function __musicSaid(text) {
  if (!text || __musicWarned[text]) return;
  __musicWarned[text] = true;
  logWarn(text + " This is said only the first time.");
}
var __VOICE_LEAD_MODES = ["closest", "smooth", "off"];
var __ARP_ORDER_PATTERNS = ["up", "down", "updown", "downup", "asPlayed", "random", "chord"];
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
  var read = __noteList("voiceLead", "notes", notes);
  var before = read && __noteList("voiceLead", "previous", previous, true);
  if (!read || !before) return [];
  var chord = __sortedNotes(read), prev = __sortedNotes(before);
  var how = (mode === undefined || mode === null) ? "closest" : (__word(__VOICE_LEAD_MODES, String(mode)) || String(mode));
  if (__VOICE_LEAD_MODES.indexOf(how) < 0) {
    __musicSaid("ce.music.lead: " + __shownValue(mode) + ' is not a mode, so "closest" was used. One of: closest, smooth, off.');
    how = "closest";
  }
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
  var read = __noteList("expandOctaves", "notes", notes);
  if (!read) return [];
  var base = __sortedNotes(read);
  var oc = 1;
  if (octaves !== undefined && octaves !== null) {
    var say = function (why, used) { __musicSaid("ce.music.octaves: octaves is " + __shownValue(octaves) + ", which is " + why + ", so " + used + " was used."); return used; };
    var r = __realNumber(octaves);
    if (r === undefined) oc = say("not a number", 1);
    else if (Math.floor(r) < 1) oc = say("less than 1", 1);
    else if (Math.floor(r) > 4) oc = say("more than 4", 4);
    else if (Math.floor(r) !== r) oc = say("not a whole number", Math.floor(r));
    else oc = Math.floor(r);
  }
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
  var asc = __noteList("arpOrder", "notes", notes);
  if (!asc) return [];
  var p, seq, i;
  if (pattern === undefined || pattern === null) {
    __musicSaid('ce.music.arp: no pattern was given, so "up" was used. One of: up, down, updown, downup, asPlayed, random, chord.');
    p = "up";
  } else if (__word(__ARP_ORDER_PATTERNS, String(pattern)) === undefined) {
    __musicSaid("ce.music.arp: " + __shownValue(pattern) + ' is not a pattern, so "up" was used. One of: up, down, updown, downup, asPlayed, random, chord.');
    p = "up";
  } else p = __word(__ARP_ORDER_PATTERNS, String(pattern));
  if (!asc.length) return [];
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
function to7bit(v, count, order) { count = count || 2; order = String(order || "msb").trim().toLowerCase(); v = Math.floor(v); var out = []; for (var i = 0; i < count; i++) { out.push(v % 128); v = Math.floor(v / 128); } return order === "msb" ? out.reverse() : out; }
function from7bit(bytes, order) { order = String(order || "msb").trim().toLowerCase(); var v = 0; var b = order === "msb" ? bytes : bytes.slice().reverse(); for (var i = 0; i < b.length; i++) v = v * 128 + b[i]; return v; }
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
// How a refusal shows a value the script passed, in the same words in every runtime (the WebView
// runtime's shownValue): "nothing" for undefined or null, text in quotes, "a list" for any list.
function __shownValue(v) {
  if (v === undefined || v === null) return "nothing";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return v !== v ? "NaN" : isFinite(v) ? String(v) : (v > 0 ? "Infinity" : "-Infinity");
  if (typeof v === "string") return '"' + v + '"';
  return typeof v === "function" ? "a function" : "a list";
}
function __hexByte(token) { return /^(0x)?[0-9a-f]{1,2}$/i.test(token) ? parseInt(token, 16) : undefined; }
// A script's bytes, read the way every runtime reads them (the WebView runtime's scriptBytes,
// BridgeScriptHost's bytesFromScript). Hex text is split on spaces, tabs, line breaks, form and
// vertical tab and commas (not \s, which would also take a no-break space), and each token is one
// byte. A list's items are bytes: a whole number from 0 to 255, or text that is one hex byte. A typed
// array is a list. Anything else is refused, naming what and where, and undefined comes back;
// nothing given is an empty list, for the caller to judge.
function __scriptBytes(verb, input, outcome) {
  if (input === undefined || input === null) return [];
  if (typeof input === "string") {
    var tokens = input.split(/[ \t\r\n\f\v,]+/).filter(function (t) { return t !== ""; });
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var b = __hexByte(token);
      if (b === undefined) {
        var spaced = /^[0-9a-f]+$/i.test(token) && token.length % 2 === 0 ? token.match(/../g).join(" ") : "";
        logError(verb + ': "' + token + '" is not one byte, so ' + outcome + '. '
          + (spaced ? 'Put a space between the bytes: "' + spaced + '".'
            : 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".'));
        return undefined;
      }
      out.push(b);
    }
    return out;
  }
  if (typeof input !== "object") {
    logError(verb + ": " + __shownValue(input) + " is not a list of bytes, so " + outcome + ".");
    return undefined;
  }
  var items = typeof input.length === "number" ? Array.prototype.slice.call(input)
    : Object.keys(input).map(function (k) { return input[k]; });
  var bytes = [];
  for (var j = 0; j < items.length; j++) {
    var v = items[j];
    var byte = typeof v === "number" ? (__whole(v) && v >= 0 && v <= 255 ? v : undefined)
      : typeof v === "string" ? __hexByte(v) : undefined;
    if (byte === undefined) {
      logError(verb + ": " + __shownValue(v) + " at position " + j + " is not a byte, so " + outcome
        + '. A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".');
      return undefined;
    }
    bytes.push(byte);
  }
  return bytes;
}
function checksum(kind, bytes, opts) {
  var verb = "ce.midi.checksum";
  if (bytes === undefined || bytes === null) {
    // checksum("roland") with the bytes left out: the name is a name, and what is missing is the bytes.
    if (kind === undefined || kind === null
        || (typeof kind === "string" && Object.prototype.hasOwnProperty.call(__CE_CKSUM_ALIAS, kind.trim().toLowerCase()))) {
      logError(verb + ": no bytes given, so there is no checksum.");
      return undefined;
    }
    bytes = kind; kind = "roland";
  }
  bytes = __scriptBytes(verb, bytes, "there is no checksum");
  if (bytes === undefined) return undefined;
  // An own key only: "constructor" or "toString" would otherwise be found on Object's prototype.
  var id = typeof kind === "string" && Object.prototype.hasOwnProperty.call(__CE_CKSUM_ALIAS, kind.trim().toLowerCase())
    ? __CE_CKSUM_ALIAS[kind.trim().toLowerCase()] : undefined;
  if (id === undefined) {
    // The names it does accept, sorted, as the WebView runtime lists them (checksumNames).
    var which = kind === undefined || kind === null ? ": no algorithm given" : "(" + __shownValue(kind) + "): no such algorithm";
    logError("ce.midi.checksum" + which + ". One of: " + Object.keys(__CE_CKSUM_ALIAS).sort().join(", ") + ".");
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

// Byte lists: what JUCE's MemoryBlock does, over the lists scripts already pass bytes in
// (docs/design/script-bytes.md). Ported from the WebView runtime's "byte lists" block rule for rule
// and message for message, which scriptPreludeAgreement.test.js checks. Offsets and bit positions
// count from 0. A list may be hex text or a typed array such as Uint8Array, and its items must be
// bytes (0 to 255, or one hex byte), both read by __scriptBytes; a mistake answers undefined and says
// why; every list returned is new.
var __BIT_RANGE = "start must be a whole number from 0, and count one from 1 to 32";
var __WRITE_START = "Writing can run past the end, but not start beyond it.";
var __B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function __whole(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
function __plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
function __span(word, a, b) { return a === b ? word + " " + a + " is past" : word + "s " + a + " to " + b + " run past"; }
function __refuse(verb, why, tail) {
  logError(verb + ": " + why + ", so there is no answer." + (tail ? " " + tail : ""));
  return undefined;
}
function __bytesIn(verb, input) {
  if (input === undefined || input === null) return __refuse(verb, "no bytes given");
  return __scriptBytes(verb, input, "there is no answer");
}
// Why a value to write cannot be written in `bits` bits, or "" when it can.
function __doesNotFit(v, bits) {
  if (v === undefined || v === null) return "the value to write is missing";
  if (!__whole(v)) return __shownValue(v) + " is not a whole number";
  return v < 0 || v >= Math.pow(2, bits) ? v + " does not fit in " + __plural(bits, "bit") : "";
}
function __shape(verb, opts) {
  var bits = 7, order = "msb";
  if (opts && typeof opts === "object") {
    if (opts.bits !== undefined && opts.bits !== null) bits = opts.bits;
    if (opts.order !== undefined && opts.order !== null) order = opts.order;
  }
  // In any case, as every word from a list is read: "MSB" is "msb".
  if (typeof order === "string") order = order.trim().toLowerCase();
  if (bits !== 7 && bits !== 8) return __refuse(verb, "bits must be 7 or 8");
  if (order !== "msb" && order !== "lsb") return __refuse(verb, 'order must be "msb" or "lsb"');
  return { bits: bits, order: order };
}
function getBits(value, start, count) {
  var verb = "ce.midi.getBits";
  if (!__whole(start) || start < 0 || !__whole(count) || count < 1 || count > 32) return __refuse(verb, __BIT_RANGE);
  if (typeof value === "number") {
    if (!isFinite(value)) return __refuse(verb, __shownValue(value) + " is not a finite number");
    if (start + count > 32) return __refuse(verb, __span("bit", start, start + count - 1) + " the 32 bits a number holds here");
    var m = Math.pow(2, count);
    return ((Math.floor(Math.floor(value) / Math.pow(2, start)) % m) + m) % m;
  }
  var bytes = __bytesIn(verb, value);
  if (bytes === undefined) return undefined;
  if (start + count > bytes.length * 8) {
    return __refuse(verb, __span("bit", start, start + count - 1) + " the end of " + __plural(bytes.length, "byte"));
  }
  var out = 0;
  for (var k = 0; k < count; k++) {
    var at = start + k;
    out += (Math.floor(bytes[Math.floor(at / 8)] / Math.pow(2, at % 8)) % 2) * Math.pow(2, k);
  }
  return out;
}
function setBits(value, start, count, bits) {
  var verb = "ce.midi.setBits";
  if (!__whole(start) || start < 0 || !__whole(count) || count < 1 || count > 32) return __refuse(verb, __BIT_RANGE);
  var unfit = __doesNotFit(bits, count);
  if (unfit) return __refuse(verb, unfit);
  if (typeof value === "number") {
    if (!isFinite(value)) return __refuse(verb, __shownValue(value) + " is not a finite number");
    if (start + count > 32) return __refuse(verb, __span("bit", start, start + count - 1) + " the 32 bits a number holds here");
    var v = Math.floor(value), m = Math.pow(2, count);
    var old = ((Math.floor(v / Math.pow(2, start)) % m) + m) % m;
    return v - old * Math.pow(2, start) + bits * Math.pow(2, start);
  }
  var bytes = __bytesIn(verb, value);
  if (bytes === undefined) return undefined;
  if (start + count > bytes.length * 8) {
    return __refuse(verb, __span("bit", start, start + count - 1) + " the end of " + __plural(bytes.length, "byte"));
  }
  for (var k = 0; k < count; k++) {
    var at = start + k, i = Math.floor(at / 8), mask = Math.pow(2, at % 8);
    var now = Math.floor(bytes[i] / mask) % 2, want = Math.floor(bits / Math.pow(2, k)) % 2;
    bytes[i] += (want - now) * mask;
  }
  return bytes;
}
function bytesRead(bytes, offset, count, opts) {
  var verb = "ce.midi.read";
  var list = __bytesIn(verb, bytes);
  if (list === undefined) return undefined;
  if (!__whole(offset) || offset < 0) return __refuse(verb, "offset must be a whole number from 0");
  if (!__whole(count) || count < 1 || count > 4) return __refuse(verb, "count must be a whole number from 1 to 4");
  var shape = __shape(verb, opts);
  if (shape === undefined) return undefined;
  if (offset + count > list.length) {
    return __refuse(verb, __span("byte", offset, offset + count - 1) + " the end of " + __plural(list.length, "byte"));
  }
  var base = Math.pow(2, shape.bits), v = 0;
  for (var k = 0; k < count; k++) {
    var i = shape.order === "msb" ? offset + k : offset + count - 1 - k;
    v = v * base + (list[i] % base);
  }
  return v;
}
function bytesWrite(bytes, offset, count, value, opts) {
  var verb = "ce.midi.write";
  var list = __bytesIn(verb, bytes);
  if (list === undefined) return undefined;
  if (!__whole(offset) || offset < 0) return __refuse(verb, "offset must be a whole number from 0");
  if (!__whole(count) || count < 1 || count > 4) return __refuse(verb, "count must be a whole number from 1 to 4");
  var shape = __shape(verb, opts);
  if (shape === undefined) return undefined;
  var unfit = __doesNotFit(value, shape.bits * count);
  if (unfit) return __refuse(verb, unfit);
  if (offset > list.length) return __refuse(verb, "offset " + offset + " is past the end of " + __plural(list.length, "byte"), __WRITE_START);
  var base = Math.pow(2, shape.bits), v = value, digits = [];
  for (var k = 0; k < count; k++) { digits.push(v % base); v = Math.floor(v / base); }
  if (shape.order === "msb") digits.reverse();
  for (var j = 0; j < count; j++) list[offset + j] = digits[j];
  return list;
}
function bytesSlice(bytes, offset, count) {
  var verb = "ce.midi.slice";
  var list = __bytesIn(verb, bytes);
  if (list === undefined) return undefined;
  if (!__whole(offset) || offset < 0) return __refuse(verb, "offset must be a whole number from 0");
  if (count === undefined || count === null) {
    if (offset > list.length) return __refuse(verb, "offset " + offset + " is past the end of " + __plural(list.length, "byte"));
    return list.slice(offset);
  }
  if (!__whole(count) || count < 0) return __refuse(verb, "count must be a whole number from 0");
  if (offset + count > list.length) {
    return __refuse(verb, count === 0 ? "offset " + offset + " is past the end of " + __plural(list.length, "byte")
      : __span("byte", offset, offset + count - 1) + " the end of " + __plural(list.length, "byte"));
  }
  return list.slice(offset, offset + count);
}
function bytesPut(bytes, offset, values) {
  var verb = "ce.midi.put";
  var list = __bytesIn(verb, bytes);
  if (list === undefined) return undefined;
  if (!__whole(offset) || offset < 0) return __refuse(verb, "offset must be a whole number from 0");
  var part = __bytesIn(verb, values);
  if (part === undefined) return undefined;
  if (offset > list.length) return __refuse(verb, "offset " + offset + " is past the end of " + __plural(list.length, "byte"), __WRITE_START);
  for (var k = 0; k < part.length; k++) list[offset + k] = part[k];
  return list;
}
function bytesFind(bytes, pattern, from) {
  var verb = "ce.midi.find";
  var list = __bytesIn(verb, bytes);
  if (list === undefined) return undefined;
  var wanted = __bytesIn(verb, pattern);
  if (wanted === undefined) return undefined;
  if (!wanted.length) return __refuse(verb, "the pattern is empty");
  var first = (from === undefined || from === null) ? 0 : from;
  if (!__whole(first) || first < 0) return __refuse(verb, "from must be a whole number from 0");
  // Not found is an answer, not a mistake: undefined comes back and nothing is said.
  for (var i = first; i + wanted.length <= list.length; i++) {
    var j = 0;
    while (j < wanted.length && list[i + j] === wanted[j]) j++;
    if (j === wanted.length) return i;
  }
  return undefined;
}
function bytesToHex(bytes) {
  var list = __bytesIn("ce.midi.toHex", bytes);
  if (list === undefined) return undefined;
  return list.map(function (b) { var h = b.toString(16).toUpperCase(); return h.length < 2 ? "0" + h : h; }).join(" ");
}
function bytesFromHex(text) {
  var verb = "ce.midi.fromHex";
  if (text === undefined || text === null) return __refuse(verb, "no hex text given");
  if (typeof text !== "string") return __refuse(verb, __shownValue(text) + " is not hex text");
  return __bytesIn(verb, text);
}
function bytesToBase64(bytes) {
  var list = __bytesIn("ce.midi.toBase64", bytes);
  if (list === undefined) return undefined;
  var out = "";
  for (var i = 0; i < list.length; i += 3) {
    var a = list[i], b = list[i + 1], c = list[i + 2];
    var n = a * 65536 + (b === undefined ? 0 : b) * 256 + (c === undefined ? 0 : c);
    out += __B64.charAt(Math.floor(n / 262144) % 64) + __B64.charAt(Math.floor(n / 4096) % 64)
      + (b === undefined ? "=" : __B64.charAt(Math.floor(n / 64) % 64))
      + (c === undefined ? "=" : __B64.charAt(n % 64));
  }
  return out;
}
function bytesFromBase64(text) {
  var verb = "ce.midi.fromBase64";
  if (text === undefined || text === null) return __refuse(verb, "no base64 text given");
  var clean = typeof text === "string" ? text.replace(/[ \t\r\n]/g, "") : null;
  if (clean === null || clean.length % 4 !== 0 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(clean)) {
    return __refuse(verb, "that is not base64", "Base64 is groups of four characters from A-Z, a-z, 0-9, + and /, with = only as padding at the end.");
  }
  var out = [];
  for (var i = 0; i < clean.length; i += 4) {
    var n = 0, pad = 0;
    for (var j = 0; j < 4; j++) {
      var c = clean.charAt(i + j);
      if (c === "=") { pad++; n = n * 64; } else n = n * 64 + __B64.indexOf(c);
    }
    out.push(Math.floor(n / 65536) % 256);
    if (pad < 2) out.push(Math.floor(n / 256) % 256);
    if (pad < 1) out.push(n % 256);
  }
  return out;
}

// panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
// order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
// out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
function panic(opts) {
  opts = opts || {};
  var reset = opts.resetControllers !== false;
  var first = 1, last = 16;
  // A channel that is not one ("all", 17) is refused; leaving it out is how every channel is named.
  if (opts.channel !== undefined && opts.channel !== null) {
    first = __midiArg("panic", "channel", opts.channel);
    if (first === undefined) return;
    last = first;
  }
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
// @module ce.anim
  "animatePlay",
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
  "panelOrder","panelBatch","panelKeep","panelEntries","panelEntry","panelDefine","panelUndefine",
  "panelPatch",
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
  "arpSwingSource","arpLatch","arpKey","arpScale","arpFollowPanelKey","arpDegree","arpChordType",
  "arpVelocity","arpChannel","arpEuclid","arpEuclidSteps","arpEuclidPulses","arpEuclidRotate",
  "arpPhase","arpMute","arpInputChannel","arpBaseOctave","arpSource","arpLink","arpEditable",
  "arpShowNotes","arpShowHeader","arpRead",
// @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadFollowPanelKey","chordPadChordType",
  "chordPadVoicing","chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel",
  "chordPadStrum","chordPadLatch","chordPadLayout","chordPadBaseOctave","chordPadNoteSpan",
  "chordPadGridCols","chordPadEcho","chordPadEchoChannel","chordPadEditable","chordPadShowPiano",
  "chordPadShowRomans","chordPadRead",
// @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonFollowPanelKey",
  "noteRibbonBaseNote","noteRibbonOctaves","noteRibbonBendRange","noteRibbonVelocity",
  "noteRibbonChannel","noteRibbonLatch","noteRibbonOrientation","noteRibbonVelocityFrom",
  "noteRibbonModAxis","noteRibbonModCc","noteRibbonEcho","noteRibbonEchoChannel",
  "noteRibbonEditable","noteRibbonShowNames","noteRibbonShowHeader","noteRibbonRead",
// @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols","drumPadsOrigin","drumPadsVelocityFrom",
  "drumPadsEcho","drumPadsEchoChannel","drumPadsNote","drumPadsLabel","drumPadsChoke",
  "drumPadsColour","drumPadsRoll","drumPadsRollRate","drumPadsRollSync","drumPadsRollHz",
  "drumPadsRollDelay","drumPadsRollVelocity","drumPadsZones","drumPadsCornerSize",
  "drumPadsCornerTopLeft","drumPadsCornerTopRight","drumPadsCornerBottomLeft",
  "drumPadsCornerBottomRight","drumPadsFlamMs","drumPadsGhostVelocity","drumPadsEditable",
  "drumPadsShowNotes","drumPadsShowLabels","drumPadsShowHeader","drumPadsRead","drumPadsSize",
  "drumPadsFill",
// @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep","turingPhase","turingEditable","turingShowGate",
  "turingShowDivisions","turingRead","turingSize","turingFill",
// @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest","looperPhase","looperEditable","looperShowPlayhead","looperShowGrid",
  "looperShowDivisions","looperRead","looperSize","looperFill","looperInsert","looperRemove",
// @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth","orbitEditable","orbitShowTrails",
  "orbitShowSpokes","orbitShowRings","orbitShowValues","orbitRead","orbitSize","orbitFill",
  "orbitInsert","orbitRemove",
// @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity","kineticEditable","kineticShowTrail","kineticShowWalls",
  "kineticRead",
// @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
  "constellationEditable","constellationShowLinks","constellationShowField",
  "constellationShowLabels","constellationRead",
// @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY","timbreAxisX","timbreAxisY",
  "timbreEditable","timbreShowField","timbreShowAnchors","timbreShowReadout","timbreRead",
  "timbreSize","timbreFill","timbreInsert","timbreRemove",
// @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth","routerCurveX","routerCurveY","routerCurveShape",
  "routerSourceControl","routerEditable","routerShowGrid","routerShowDivisions","routerRead",
  "routerSize","routerFill","routerInsert","routerRemove",
// @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
  "macroLabel","macroEditable","macroShowLanes","macroShowValues","macroShowDivisions","macroRead",
  "macroSize","macroFill","macroInsert","macroRemove",
// @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep","matrixCellStyle","matrixEditable",
  "matrixShowLabels","matrixShowValues","matrixRead","matrixSize","matrixFill",
// @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember","constraintEditable","constraintShowValues",
  "constraintShowBadge","constraintRead","constraintSize","constraintFill","constraintInsert",
  "constraintRemove",
// @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
  "envelopeAddOnDoubleClick","envelopeSnapX","envelopeSnapY","envelopeFillUnder",
  "envelopePhaseSource","envelopeEditable","envelopeShowPlayhead","envelopeShowGrid","envelopeRead",
  "envelopeSize","envelopeFill","envelopeInsert","envelopeRemove",
// @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnTime",
  "ribbonReturnCurve","ribbonSnap","ribbonOrientation","ribbonStyle","ribbonLabel",
  "ribbonValuePrecision","ribbonEditable","ribbonShowGlow","ribbonShowValue","ribbonRead",
// @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnMode",
  "crossfaderReturnValue","crossfaderReturnTime","crossfaderReturnCurve","crossfaderOrientation",
  "crossfaderLabelA","crossfaderLabelB","crossfaderEditable","crossfaderShowLabels",
  "crossfaderShowGains","crossfaderRead",
// @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnMode","joystickReturnValue","joystickReturnAxes",
  "joystickReturnTime","joystickReturnCurve","joystickCornerLabel","joystickEditable",
  "joystickShowGrid","joystickShowCrosshair","joystickShowCorners","joystickShowTrail",
  "joystickRead","joystickSize","joystickFill",
// @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay","meterValueMin",
  "meterValueMax","meterDbFloor","meterDbCeil","meterOrientation","meterGradient","meterLabel",
  "meterLabelPosition","meterValuePrecision","meterValuePrefix","meterValueSuffix","meterZoneAt",
  "meterSource","meterShowTicks","meterShowScaleLabels","meterShowValue","meterRead","meterSize",
  "meterFill","meterInsert","meterRemove",
// @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
  "transportClockDevice","transportRunOnLoad","transportEditable","transportShowPosition",
  "transportShowTap","transportRead",
// @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal","panicSetLabel","panicSetEditable","panicSetShowSummary","panicSetRead",
// @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue","lcdAnim","lcdAnimPreset","lcdAnimSpeed",
  "lcdAnimFps","lcdAnimLoop","lcdScrollMode","lcdScrollRepeat","lcdBlinkRate","lcdCursorBlink",
  "lcdValueMin","lcdValueMax","lcdValuePrecision","lcdValuePrefix","lcdValueSuffix",
  "lcdValueSource","lcdBrightnessSource","lcdBacklightSource","lcdGlyph","lcdEditText",
  "lcdZoneText","lcdZoneLabel","lcdZoneShow","lcdZoneAt","lcdZoneSource","lcdZoneKind","lcdLayout",
  "lcdShowGlass","lcdShowGhost","lcdShowScanlines","lcdShowGrid","lcdRead","lcdSize","lcdFill",
// @module ce.components.pixel
  "pixelText","pixelLabel","pixelShow","pixelBlink","pixelX","pixelY","pixelW","pixelH","pixelKind",
  "pixelSource","pixelEditText","pixelBacklight","pixelBrightness","pixelContrast","pixelGamma",
  "pixelGlow","pixelAnim","pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop","pixelAnimFps",
  "pixelLayoutTransition","pixelTransitionMs","pixelBrightnessSource","pixelBacklightSource",
  "pixelLayout","pixelShowGlass","pixelShowGhost","pixelShowScanlines","pixelShowGrid","pixelRead",
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
// The numbers a channel message carries, checked before anything is sent: the WebView runtime's
// MIDI_ARGS and midiArg, word for word. An address (channel, controller, program, bank, parameter
// number) outside its range is refused, since clamping it picks a different message; a value past
// the end of its range is clamped, as before; anything that is not a number, or is missing where
// there is no default, is refused. A fraction rounds half up (this floored it, the editor rounded).
var __MIDI_ARGS = {
  channel: ["channel", "a channel", 1, 16, true, "A channel is a whole number from 1 to 16."],
  controller: ["controller number", "a controller number", 0, 127, true, "A controller number is a whole number from 0 to 127."],
  program: ["program", "a program", 0, 127, true, "A program is a whole number from 0 to 127."],
  bank: ["bank number", "a bank number", 0, 127, true, "A bank number is a whole number from 0 to 127."],
  msb: ["MSB", "an MSB", 0, 127, true, "An MSB is a whole number from 0 to 127."],
  lsb: ["LSB", "an LSB", 0, 127, true, "An LSB is a whole number from 0 to 127."],
  value: ["value", "a value", 0, 127, false, "A value is a number from 0 to 127."],
  velocity: ["velocity", "a velocity", 0, 127, false, "A velocity is a number from 0 to 127."],
  pressure: ["pressure", "a pressure", 0, 127, false, "A pressure is a number from 0 to 127."],
  value14: ["value", "a value", 0, 16383, false, "A value is a number from 0 to 16383."],
  bend: ["bend", "a bend", 0, 16383, false, "A bend is a number from 0 to 16383, and 8192 is the centre."],
  position: ["song position", "a song position", 0, 16383, false, "A song position is a number of MIDI beats from 0 to 16383."]
};
var __edgeWarned = {};
function __midiArg(verb, kind, v) {
  var a = __MIDI_ARGS[kind];
  if (v === undefined || v === null) { logError(verb + ": no " + a[0] + " given, so nothing was sent."); return undefined; }
  var r = __realNumber(v);   // text that is a number ("64") is read as one, as it always was
  var n = r === undefined ? undefined : Math.floor(r + 0.5);
  if (n === undefined || (a[4] && (n < a[2] || n > a[3]))) {
    logError(verb + ": " + __shownValue(v) + " is not " + a[1] + ", so nothing was sent. " + a[5]);
    return undefined;
  }
  if (n >= a[2] && n <= a[3]) return n;
  // A value past the end of its range is sent as the nearest end, and said once per command.
  var sent = n < a[2] ? a[2] : a[3];
  if (!__edgeWarned[verb]) {
    __edgeWarned[verb] = true;
    logWarn(verb + ": the " + a[0] + " " + __shownValue(v) + " is outside " + a[2] + " to " + a[3]
      + ", so " + sent + " was sent. This is said only the first time.");
  }
  return sent;
}
// A note: a MIDI number from 0 to 127, rounded, or a name such as "C4" whose number is in that
// range. An unreadable name used to become note 0, so "c4" played C-1 with nothing to say why; a
// name past the top, "C10", put 132 in the data byte, which a synth reads as a status byte; NaN or a
// table played C-1 by the numeric path. __badNote refuses each in the WebView runtime's words.
function __note(n) {
  var v = typeof n === "string" ? noteNumber(n) : (typeof n === "number" && isFinite(n) ? Math.floor(n + 0.5) : undefined);
  return v !== undefined && v >= 0 && v <= 127 ? v : undefined;
}
function __badNote(verb, note) {
  var range = "MIDI notes run from 0 to 127, which is C-1 to G9.";
  var why;
  if (note === undefined || note === null) {
    why = 'no note was given, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".';
  } else if (typeof note === "string") {
    why = noteNumber(note) === undefined
      ? '"' + note + '" is not a note name, so nothing was sent. A name is a letter from A to G, then # or b if it '
        + 'has one, then the octave: "C4", "Eb3", "F#-1".'
      : '"' + note + '" is outside the MIDI notes, so nothing was sent. ' + range;
  } else if (typeof note === "number" && isFinite(note)) {
    why = note + " is outside the MIDI notes, so nothing was sent. " + range;
  } else {
    why = __shownValue(note) + ' is not a note, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".';
  }
  logError(verb + ": " + why);
}
// sendNote's `ms`: left out (null here), the script sends the note off itself; given, it must be a
// length. "500ms", NaN or -5 sent the note on and never the note off, a hung voice.
function __noteLength(verb, ms) {
  if (ms === undefined || ms === null) return null;
  var length = __realNumber(ms);   // "500" is what sendNote has always read
  if (length !== undefined && length > 0) return length;
  logError(verb + ": " + __shownValue(ms) + " is not a length in milliseconds, so nothing was sent. "
    + "Give a number above 0, or leave it out to send the note off yourself.");
  return undefined;
}

// A duration schedules the note off — otherwise every script that plays a note hand-rolls a timer,
// and getting that wrong means a hung voice, the one MIDI mistake you hear rather than read.
function sendNote(channel, note, velocity, ms) {
  var c = __midiArg("sendNote", "channel", channel); if (c === undefined) return;
  var n = __note(note);
  if (n === undefined) return __badNote("sendNote", note);
  var v = __midiArg("sendNote", "velocity", velocity); if (v === undefined) return;
  var length = __noteLength("sendNote", ms); if (length === undefined) return;
  sendMidi([0x90 | (c - 1), n, v]);
  if (length !== null) __oneShot(length, function () { sendMidi([0x80 | (c - 1), n, 0]); });
}
// routeMidi / feedMidi / the wire filters. interceptMidiIn|Out filter the WIRE, as opposed to
// ce.core.intercept which filters a model path: inbound reaches the panel's bindings, the note
// input and the transport long before any script sees it, so the HOST runs these chains.
function routeMidi(role, fn) { __api.beginRoute(String(role || "")); try { fn(); } finally { __api.endRoute(); } }
function feedMidi(bytes) { return __api.feedMidi(bytes); }
// __midiIn and __midiOut are the running script's own (__CE_OWN).
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
  var c = __midiArg("sendRPN", "channel", channel); if (c === undefined) return;
  var m = __midiArg("sendRPN", "msb", msb); if (m === undefined) return;
  var l = __midiArg("sendRPN", "lsb", lsb); if (l === undefined) return;
  var v = __midiArg("sendRPN", "value14", value); if (v === undefined) return;
  var s = 0xB0 | (c - 1);
  sendMidi([s, 0x65, m, s, 0x64, l, s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F]);
}
// Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
function sendSongPosition(beats) {
  var b = __midiArg("sendSongPosition", "position", beats); if (b === undefined) return;
  sendMidi([0xF2, b & 0x7F, (b >> 7) & 0x7F]);
}
function sendNoteOff(channel, note, velocity) {
  var c = __midiArg("sendNoteOff", "channel", channel); if (c === undefined) return;
  var n = __note(note);
  if (n === undefined) return __badNote("sendNoteOff", note);
  var v = __midiArg("sendNoteOff", "velocity", velocity === undefined || velocity === null ? 0 : velocity);
  if (v === undefined) return;
  sendMidi([0x80 | (c - 1), n, v]);
}
function sendProgramChange(channel, program, bankMsb, bankLsb) {
  var verb = "sendProgramChange";
  var c = __midiArg(verb, "channel", channel); if (c === undefined) return;
  var p = __midiArg(verb, "program", program); if (p === undefined) return;
  var msb = null, lsb = null;
  if (bankMsb !== undefined && bankMsb !== null) { msb = __midiArg(verb, "bank", bankMsb); if (msb === undefined) return; }
  if (bankLsb !== undefined && bankLsb !== null) { lsb = __midiArg(verb, "bank", bankLsb); if (lsb === undefined) return; }
  // Bank select first: a device applies the bank that was in force when the program change lands.
  if (msb !== null) sendCC(c, 0, msb);
  if (lsb !== null) sendCC(c, 32, lsb);
  sendMidi([0xC0 | (c - 1), p]);
}
function sendPitchBend(channel, value) {
  var c = __midiArg("sendPitchBend", "channel", channel); if (c === undefined) return;
  var v = __midiArg("sendPitchBend", "bend", value === undefined || value === null ? 8192 : value);
  if (v === undefined) return;
  sendMidi([0xE0 | (c - 1), v % 128, Math.floor(v / 128) % 128]);
}
function sendAftertouch(channel, pressure, note) {
  var c = __midiArg("sendAftertouch", "channel", channel); if (c === undefined) return;
  var p;
  if (note === undefined || note === null) {
    p = __midiArg("sendAftertouch", "pressure", pressure); if (p === undefined) return;
    return sendMidi([0xD0 | (c - 1), p]);
  }
  var n = __note(note);
  if (n === undefined) return __badNote("sendAftertouch", note);
  p = __midiArg("sendAftertouch", "pressure", pressure); if (p === undefined) return;
  sendMidi([0xA0 | (c - 1), n, p]);
}
function sendClock() { sendMidi([0xF8]); }
// Any action but stop and continue used to send Start, so "pause" started the sequencer.
function sendTransport(action) {
  var actions = 'The actions are "start", "continue" and "stop".';
  if (action === undefined || action === null) {
    logError("sendTransport: no action given, so nothing was sent. " + actions);
    return;
  }
  var status = typeof action === "string" ? { start: 0xFA, "continue": 0xFB, stop: 0xFC }[action.trim().toLowerCase()] : undefined;
  if (status === undefined) {
    logError("sendTransport: " + __shownValue(action) + " is not a transport action, so nothing was sent. " + actions);
    return;
  }
  sendMidi([status]);
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
// A bpm that is not above 0, or not a number, is the transport's tempo, and says so (__tread). It
// gave nothing here, where the WebView used the tempo, and "fast" gave NaN.
function beatsToMs(beats, bpm) {
  var b = __tread("beatsToMs", "beats", beats);
  if (b === undefined) return undefined;
  var rate = __tread("beatsToMs", "bpm", bpm);
  if (rate === undefined) rate = tempo();
  if (!rate || rate <= 0) return null;
  return b * 60000 / rate;
}
function msToBeats(ms, bpm) {
  var m = __tread("msToBeats", "ms", ms);
  if (m === undefined) return undefined;
  var rate = __tread("msToBeats", "bpm", bpm);
  if (rate === undefined) rate = tempo();
  if (!rate || rate <= 0) return null;
  return m * rate / 60000;
}
// syncTimer(id, beats [, opts]) — a timer whose interval is MUSICAL, and which FOLLOWS the tempo.
// The first version computed the interval once and then kept firing at the old rate forever; a verb
// called sync that silently desyncs is the wrong default. { follow: false } keeps that behaviour.
// Re-arming RESETS THE PHASE, which is a hiccup at the moment of a tempo change and beats a timer
// that is permanently at the wrong rate.
function syncTimer(id, beats, opts) {
  var key = String(id === undefined || id === null ? "" : id);
  if (!key) {
    logError("ce.time.syncTimer: no id was given, so no timer was started.");
    return;
  }
  var length = __beatsOf('ce.time.syncTimer("' + key + '")', beats, true, "no timer was started");
  if (length === undefined) return;
  var ms = beatsToMs(length);
  if (ms === null) {
    logError('ce.time.syncTimer("' + key + '"): no tempo is being reported, so no timer was started. Use startTimer with a millisecond interval, or wait for onTransport.');
    return;
  }
  __armTimer(key, ms);                                    // clears any previous follow…
  if (!(opts && opts.follow === false)) __syncFollow[key] = length;   // …put back on purpose
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
    __armTimer(k, ms);
    __syncFollow[k] = pending[k];
  }
}
// __lastSyncBpm is per script (__CE_OWN), and so is this listener: every script starts with a copy.
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
// repeating forever — which is precisely what the hand-rolled version does. __after and __afterN
// are the running script's own (__CE_OWN).
function after(ms, fn) {
  if (typeof fn !== "function") {
    logError("ce.time.after: fn is " + __shownValue(fn) + ", not a function, so nothing was scheduled.");
    return undefined;
  }
  if (__timeRefused("ce.time.after", ms, "milliseconds", "delay", false, "nothing was scheduled")) return undefined;
  return __oneShot(ms, fn);
}
// The one-shot itself, unchecked: sendNote's duration works out its own delay.
function __oneShot(ms, fn) {
  __afterN += 1;
  var id = "__after:" + __afterN;
  __after[id] = fn;
  __armTimer(id, ms);
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
  if (typeof fn !== "function") {
    logError("ce.time.afterBeats: fn is " + __shownValue(fn) + ", not a function, so nothing was scheduled.");
    return undefined;
  }
  var length = __beatsOf("ce.time.afterBeats", beats, false, "nothing was scheduled");
  if (length === undefined) return undefined;
  var ms = beatsToMs(length);
  if (ms === null) {
    logError("ce.time.afterBeats: no tempo is being reported, so nothing was scheduled. Use after() with milliseconds, or wait for onTransport.");
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
// A helper's number argument as the transport reads it, with one not used as written said once
// per helper and argument, in the words of the WebView runtime's timeWords.js. A position before
// the start is the start, a bar of no beats is a bar of one, and text that is not a number is the
// argument's default; each gave an answer for a number nobody wrote, without a word. For each
// argument: what is used for one that is not a number, the least and the most it is read as, and
// whether it is rounded first; a bpm falls back to the transport's tempo.
// Each argument: [fallback, min, max, round, optional]. An argument the helper cannot do without,
// left out, is rejected: it was the default without a word (position() was bar 1).
var __TIME_NUMBERS = {
  barBeatAt: ["ce.time.position", { beats: [0, 0], beatsPerBar: [4, 1, undefined, false, true] }],
  stepAt: ["ce.time.step", { beats: [0, 0] }],
  stepsBetween: ["ce.time.steps", { from: [0, 0], to: [0, 0], max: [16, 1, undefined, true, true] }],
  swingOffset: ["ce.time.swing", { step: [0], amount: [0, 0, 1] }],
  cycleAt: ["ce.time.cycle", { beats: [0, 0], bars: [0.25, 0.25, 64], beatsPerBar: [4, 1, undefined, false, true] }],
  loopedBeats: ["ce.time.looped", { beats: [0, 0], startBeats: [0, 0], lengthBeats: [0.01, 0.01] }],
  beatsToMs: ["ce.time.beatsToMs", { beats: [0], bpm: ["tempo"] }],
  msToBeats: ["ce.time.msToBeats", { ms: [0], bpm: ["tempo"] }]
};
var __timeWarned = {};
function __tread(fn, name, v) {
  var helper = __TIME_NUMBERS[fn], s = helper[1][name], tempo = s[0] === "tempo";
  if (v === undefined || v === null) {
    if (tempo || s[4]) return tempo ? undefined : s[0];
    logError(helper[0] + ": " + name + " was not given, so there is no answer.");
    return undefined;
  }
  var read = __realNumber(v), n, why, used;
  if (tempo) {
    if (read !== undefined && read > 0) return read;
    why = read === undefined ? "not a number" : "not above 0";
    used = "the transport's tempo";
  } else if (read === undefined) {
    why = "not a number"; n = used = s[0];
  } else {
    n = s[3] ? Math.round(read) : read;
    if (s[1] !== undefined && n < s[1]) { why = "less than " + s[1]; n = used = s[1]; }
    else if (s[2] !== undefined && n > s[2]) { why = "more than " + s[2]; n = used = s[2]; }
    else return n;
  }
  var key = fn + " " + name;
  if (!__timeWarned[key]) {
    __timeWarned[key] = true;
    logWarn(helper[0] + ": " + name + " is " + __shownValue(v) + ", which is " + why + ", so " + used
      + " was used. This is said only the first time.");
  }
  return n;
}

// A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and
// only DIFFERENCES mean anything, so a machine syncing its clock cannot corrupt an interval.
function nowMs() { return __api.nowMs(); }

// The panel's division vocabulary, in both directions. An unknown name returns undefined rather
// than the component's 1/16 fallback: a component has to keep running, a script that mistyped a
// division should find out. It found out only by getting undefined, so __division says so as well,
// in the words of the WebView runtime's divisionId. Any case is read: "1/8t" is "1/8T", because the
// names differ only by D and T and nothing is ambiguous.
function __division(verb, name) {
  if (typeof name === "string") {
    var wanted = name.toLowerCase();
    for (var i = 0; i < __CE_DIVISION_NAMES.length; i++) {
      var id = __CE_DIVISION_NAMES[i];
      if (id.toLowerCase() === wanted) return __CE_DIVISIONS[id];
    }
  }
  logError(verb + ": " + (name === undefined || name === null ? "no division given" : __shownValue(name) + " is not a division")
    + ", so there is no answer. The divisions are " + __CE_DIVISION_NAMES.join(", ") + ".");
  return undefined;
}
function beatsPerDivision(name) { return __division("ce.time.division", name); }
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
  var b = __tread("barBeatAt", "beats", beats);
  if (b === undefined) return undefined;
  var perBar = __tread("barBeatAt", "beatsPerBar", beatsPerBar);
  var bar = Math.floor(b / perBar) + 1;
  var beat = Math.floor(b % perBar) + 1;
  var tick = Math.floor((b % 1) * __CE_TIME.ppqn);
  var t = String(tick);
  while (t.length < 2) t = "0" + t;
  return { bar: bar, beat: beat, tick: tick, text: bar + "." + beat + "." + t };
}

function stepAt(beats, division) {
  var per = __division("ce.time.step", division);
  if (per === undefined) return undefined;
  var b = __tread("stepAt", "beats", beats);
  return b === undefined ? undefined : Math.floor(b / per);
}

// The step boundaries crossed between two readings. A stalled frame must FIRE the steps it slept
// through rather than drop them — the difference between a stutter and a hole in the bar. Capped so
// returning from a long stall does not dump hundreds of notes, and what was dropped is REPORTED. On
// an overrun the most RECENT steps are kept: catching up to now beats replaying where you were.
function stepsBetween(fromBeats, toBeats, division, maxSteps) {
  var per = __division("ce.time.steps", division);
  if (per === undefined) return undefined;
  var from = __tread("stepsBetween", "from", fromBeats);
  if (from === undefined) return undefined;
  var to = __tread("stepsBetween", "to", toBeats);
  if (to === undefined) return undefined;
  var cap = __tread("stepsBetween", "max", maxSteps);
  if (to <= from) return { steps: [], dropped: 0 };
  var first = Math.floor(from / per) + 1;
  var last = Math.floor(to / per);
  if (last < first) return { steps: [], dropped: 0 };
  var total = last - first + 1;
  var kept = total < cap ? total : cap;
  var steps = [];
  for (var i = last - kept + 1; i <= last; i++) steps.push(i);
  return { steps: steps, dropped: total - kept };
}

// The panel's shuffle: every odd step later by up to half a step, in BEATS. Two sequencers at "the
// same" swing are only the same swing if they compute it the same way.
function swingOffset(step, amount, division) {
  var per = __division("ce.time.swing", division);
  if (per === undefined) return undefined;
  var n = __tread("swingOffset", "step", step);
  if (n === undefined) return undefined;
  var s = __tread("swingOffset", "amount", amount);
  if (s === undefined) return undefined;
  return (Math.abs(Math.round(n)) % 2 === 1) ? s * 0.5 * per : 0;
}

// For anything whose rate is a LOOP LENGTH in bars rather than a step. Derived from the position,
// never accumulated, so a cycle running for an hour is still exactly on the bar line.
function cycleAt(beats, bars, beatsPerBar) {
  var b = __tread("cycleAt", "beats", beats);
  if (b === undefined) return undefined;
  var n = __tread("cycleAt", "bars", bars);
  if (n === undefined) return undefined;
  var len = n * __tread("cycleAt", "beatsPerBar", beatsPerBar);
  if (len < 0.01) len = 0.01;
  return { phase: (((b / len) % 1) + 1) % 1, count: Math.floor(b / len), length: len };
}

// Fold a timeline position into a loop. Before the loop start the position is untouched — you can
// run IN to a loop from earlier in the song. `pass` is which time round, -1 before the loop is
// reached; watching it for CHANGES is how you see a wrap without a handler that can miss one.
function loopedBeats(beats, startBeats, lengthBeats) {
  var b = __tread("loopedBeats", "beats", beats);
  if (b === undefined) return undefined;
  var st = __tread("loopedBeats", "startBeats", startBeats);
  if (st === undefined) return undefined;
  var len = __tread("loopedBeats", "lengthBeats", lengthBeats);
  if (len === undefined) return undefined;
  if (b < st) return { beats: b, pass: -1 };
  return { beats: st + ((b - st) % len), pass: Math.floor((b - st) / len) };
}

// Tempo from tap times, in the milliseconds now() reports. Taps more than resetMs apart start a NEW
// measurement rather than averaging across the pause — the thing every hand-rolled tap gets wrong,
// because the first tap after a break poisons the average.
// The times, and clockTempo's gaps, are the numbers above 0 in a list, with one that is not said
// once; a list that is not one, or left out, is refused. Each was done in silence, and a list that
// was not one gave no result as if the taps were too few.
function __timeList(verb, name, what, value) {
  if (value === undefined || value === null) {
    logError(verb + ": " + name + " was not given, so there is no answer.");
    return undefined;
  }
  if (typeof value !== "object") {
    logError(verb + ": " + name + " is " + __shownValue(value) + ", not a list, so there is no answer.");
    return undefined;
  }
  var items = Array.isArray(value) ? value : Object.keys(value).map(function (k) { return value[k]; });
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var n = __realNumber(items[i]);
    if (n !== undefined && n > 0) { out.push(n); continue; }
    var key = verb + " " + name;
    if (!__timeWarned[key]) {
      __timeWarned[key] = true;
      logWarn(verb + ": " + __shownValue(items[i]) + " at position " + (i + 1) + " of " + name + " is not " + what
        + " above 0, so it was left out. This is said only the first time.");
    }
  }
  return out;
}
function tapTempo(timestamps, resetMs) {
  var list = __timeList("ce.time.tap", "times", "a tap time in milliseconds", timestamps);
  if (list === undefined) return undefined;
  // A pause that is not a number above 0 gave nothing (every gap was "after a pause") or 2000, in
  // silence; it is 2000, said once.
  var reset = __realNumber(resetMs);
  if (resetMs !== undefined && resetMs !== null && !(reset > 0) && !__timeWarned["tapTempo resetMs"]) {
    __timeWarned["tapTempo resetMs"] = true;
    logWarn("ce.time.tap: resetMs is " + __shownValue(resetMs) + ", which is " + (reset === undefined ? "not a number" : "not above 0")
      + ", so 2000 was used. This is said only the first time.");
  }
  if (list.length < 2) return undefined;
  var limit = reset > 0 ? reset : 2000, sum = 0, count = 0, i;
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
  var list = __timeList("ce.time.clockTempo", "intervalsMs", "a gap in milliseconds", intervalsMs);
  if (list === undefined || !list.length) return undefined;
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
// a completion callback can be a plain argument in every language. __animDone is the running
// script's own (__CE_OWN).
//
// Each move with a done gets a token of its own ("js:3"), handed to the host as `__done` and emitted
// back with the result, and its function is stored under that. It was stored under the path, or for
// a list under a number the host counted separately, so replacing a move called the new move's done
// for the old one, and two lists from two scripts or engines crossed their dones
// (ScriptRuntime::fireAnimationDone says how). __animSeq is the engine's, not a script's, so no two
// scripts hand out the same token.
var __animSeq = 0;

// An envelope's shape is SAMPLED here, with mapCurve() — ce.math.map, the Envelope component's
// own envValueAt — and the host interpolates the samples. That is what lets the host engine run
// an envelope at all: mapCurve()'s per-point curves live in this prelude, not in C++. This called
// map(), which no prelude defines, so Lua and JavaScript stopped with an error and Python's own
// map() made every sample 0.
var __ANIM_SAMPLES = 1024;
function __animSample(points) {
  var out = [];
  for (var i = 0; i <= __ANIM_SAMPLES; i++) {
    var y = Number(mapCurve(i / __ANIM_SAMPLES, points));
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
    __animSeq += 1;
    var token = "js:" + __animSeq;
    __animDone[token] = opts.done;
    o.__done = token;
  } else if (opts.done != null) {
    o.__badDone = opts.done;   // not a function: the host says so, once, and the move goes ahead
  }
  // The host answers whether the move started: not when a colour property is the path or one of a
  // list's paths, and then nothing in the list starts and its done is never called, so it is let go.
  // A missing path is passed as empty, which the host says is no path, not as the text "undefined".
  var started = __api.animate(kind, list ? list : (path == null ? "" : String(path)), Number(target) || 0, o) === true;
  if (!started && o.__done !== undefined) delete __animDone[o.__done];
  return started;
}

// to and spring move to a number, and only a number. A target that is not one ("full", "100px",
// "#FF0000") used to move the value to 0; text that is a number ("100") is read as one, as it always
// was. In the words of the WebView runtime's animationTarget.
function __animTarget(verb, target) {
  var n = __realNumber(target);
  if (n !== undefined) return n;
  var why = target === undefined || target === null ? "no number to move to was given"
    : (typeof target === "string" ? '"' + target + '" is not a number' : "the target given is not a number");
  logError(verb + ": " + why + ", so nothing was started.");
  return undefined;
}
function animateTo(path, target, opts) {
  var n = __animTarget("ce.anim.to", target);
  return n === undefined ? false : __animStart("to", path, n, opts);
}
function animateSpring(path, target, opts) {
  var n = __animTarget("ce.anim.spring", target);
  return n === undefined ? false : __animStart("spring", path, n, opts);
}
// envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
// `to` has one destination; an envelope goes up before it comes down, which is the single most
// obvious thing a synth panel animates and the one thing `to` cannot express.
//
// A point is { x, y } or the two as a pair, each a number or text that is one. One that is not, or
// whose x is not from 0 to 1, starts nothing and says why, in the words of the WebView runtime's
// envelopeRefusal (CE/web/src/CE_Application/scripting/animEnvelope.js): the sampler dropped a point
// it could not read, and never reached one whose x is past 0 to 1, both without a word. A y past 0
// to 1 is a level past `from` or `to`, and is read as it is. The points are a list, as there: text
// has a length too, and was read as a list of its characters.
function animateEnvelope(path, points, opts) {
  if (!Array.isArray(points) || points.length < 2) {
    logError("ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.");
    return false;
  }
  var written = function (v) {
    if (v === undefined || v === null) return "none was given";
    if (typeof v === "string") return '"' + v + '" is not';
    if (typeof v === "number" && isFinite(v)) return String(v) + " is not";
    return "the value given is not";
  };
  for (var i = 0; i < points.length; i++) {
    var p = points[i], which = "point " + (i + 1) + " of " + points.length;
    if (p === null || typeof p !== "object") {
      logError("ce.anim.envelope: " + which + " is { x, y } or the two as a pair, and " + written(p) + ", so nothing was started.");
      return false;
    }
    var parts = __pointParts(p), x = parts[0], y = parts[1];
    var nx = __realNumber(x);
    if (nx === undefined || nx < 0 || nx > 1) {
      var hint = nx !== undefined && nx / 100 >= 0 && nx / 100 <= 1
        ? " If you meant " + String(nx) + " out of 100, write " + String(Number((nx / 100).toFixed(4))) + "." : "";
      logError("ce.anim.envelope: the x of " + which + " is a number from 0 to 1, and " + written(x) + ", so nothing was started." + hint);
      return false;
    }
    if (__realNumber(y) === undefined) {
      logError("ce.anim.envelope: the y of " + which + " is a number, and " + written(y) + ", so nothing was started.");
      return false;
    }
  }
  var o = {}, k;
  if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
  o.samples = __animSample(points);
  // from and to: a number, or text that is one, or the default, which the host says (__badFrom,
  // __badTo). Number() read "abc" as 0 and true as 1, in silence.
  var from = __realNumber(o.from);
  if (o.from != null && from === undefined) o.__badFrom = o.from;
  o.from = from === undefined ? 0 : from;
  var to = __realNumber(o.to);
  if (o.to != null && to === undefined) o.__badTo = o.to;
  o.to = undefined;
  return __animStart("envelope", path, to === undefined ? 1 : to, o);
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
// done(completed): one argument, true or false, for one path and for a list alike. It was handed an
// object, { path, completed } or { paths, completed }, and an object is always truthy, so
// `if (completed)` read a cancelled move as a finished one.
on("*", "__animDone", function (info) {
  if (!info || info.token === undefined || info.token === null) return;
  var fn = __animDone[info.token];
  delete __animDone[info.token];
  if (fn) fn(info.completed === true);
});

// @module ce.device
// Device READS — four wrappers over one host primitive, __api.deviceQuery, so the shape a script
// sees is assembled here rather than per engine. Without a device host the query returns null and
// the host has already said why; these hand back null / an empty list rather than pretending.
function __role(r) { return (r === undefined || r === null || r === "") ? "mainSynth" : String(r); }
function __deviceQuery(kind, payload) { return __api.deviceQuery(kind, payload || null); }
function __deviceSet(kind, name, value, role) { return __api.deviceSet(kind, name, value, role); }
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
    var v = __read(names[i] + ".value");
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
    var cur = __read(name + ".value");
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
// Preset recall, through the profile's own action — a Program Change, a Bank Select pair plus one,
// or a SysEx template. The slot is the device-global number the profile's banks partition, not a
// program number: on a machine whose second bank starts at 64, slot 64 is that bank's first preset.
function recallPreset(slot, opts) { return __deviceQuery("recallPreset", { role: __role(opts && opts.role), slot: Number(slot) }); }
function preset(role) { return __deviceQuery("preset", { role: __role(role) }); }
// The profile DOCUMENT, rather than the catalogue row profile() answers from. `variables` is what
// every recipe interpolates ($channel, $deviceId), so it decides what every message the panel sends
// looks like; `coverage` is what the profile claims it can do, in its own words.
function deviceVariables(role) { return __deviceQuery("variables", { role: __role(role) }); }
function deviceTiming(role) { return __deviceQuery("timing", { role: __role(role) }); }
function deviceCoverage(feature, role) {
  return __deviceQuery("coverage", { role: __role(role), feature: feature == null ? "" : String(feature) });
}
function deviceRecipes(role) { return __deviceQuery("recipes", { role: __role(role) }) || []; }
function deviceRequests(role) { return __deviceQuery("requests", { role: __role(role) }) || []; }
// The two writes. They land on THIS PROJECT's override, never on the shared profile.
function deviceSetVariable(name, value, role) {
  return __deviceSet("variable", String(name), value, __role(role)) === true;
}
function deviceSetTiming(name, ms, role) {
  return __deviceSet("timing", String(name), ms, __role(role)) === true;
}
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
// the next dump — the same rule after() follows, for the same reason. __dumpWaiters is the running
// script's own (__CE_OWN).
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
    // A request's answer arrives under the dump it answers with ("requestSystem" brings "system"),
    // so that is what the callback waits for; waiting for the request's own id, it heard only the
    // timeout.
    var answer = __deviceQuery("answers", { role: "mainSynth", request: kind });
    var waitFor = typeof answer === "string" && answer ? answer : kind;
    var waiter = { kind: waitFor, fn: fn, done: false };
    __dumpWaiters.push(waiter);
    // Resolved rather than left hanging: a synth that is off, or that does not answer this
    // request, is the common case and not the exotic one.
    after(ms, function() {
      if (waiter.done) return;
      __resolveDumps(waitFor, "", undefined, "no dump arrived within " + Math.floor(ms) + "ms");
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
// ce.storage. `state` is a plain object, the running script's own (__CE_OWN), which lives as long as
// the script is loaded, so it persists between handler calls with no host help. Settings go through
// the host, because they outlive the session.

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
 * quietly becomes a shared one, and a typo in a scope name would be the way it happened. A typo in
 * the KEY ({ scop: "script" }) is the same leak, so any key but `scope` is refused as well, sorted so
 * every runtime names them in one order. A key that is a number is a list entry and is left alone.
 * `verb` is the call's namespaced path. The WebView runtime's storageScopeOf says the same words. */
function __storageScope(opts, verb) {
  if (opts !== null && typeof opts === "object" && !Array.isArray(opts)) {
    var unknown = [];
    for (var key in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, key) && key !== "scope" && !/^\d+$/.test(key)) unknown.push(key);
    }
    if (unknown.length) {
      unknown.sort();
      var quoted = [];
      for (var i = 0; i < unknown.length; i++) quoted.push('"' + unknown[i] + '"');
      var listed = quoted.length < 2 ? quoted.join("")
        : quoted.slice(0, -1).join(", ") + " and " + quoted[quoted.length - 1];
      logError(verb + ": " + listed + (unknown.length === 1 ? " is not one of its options" : " are not among its options")
               + ", so nothing was done. Its only option is scope.");
      return undefined;
    }
  }
  var raw = (typeof opts === "string") ? opts : (opts ? opts.scope : undefined);
  if (raw === undefined || raw === null || raw === "") return "panel";
  // In any case, as every word from a list is read: "Local" is "local".
  var scope = String(raw).trim().toLowerCase();
  if (__CE_SCOPES.indexOf(scope) >= 0) return scope;
  logError(verb + ': "' + String(raw) + '" is not a scope, so nothing was done. One of: ' + __CE_SCOPES.join(", ") + ".");
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
  var scope = __storageScope(opts, "ce.storage.saveSetting");
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
  var scope = __storageScope(opts, "ce.storage.loadSetting");
  if (!scope) return fallback;
  var v = __api.loadSetting(__storageKeyFor(scope, key), __storageStore(scope));
  return (v === undefined || v === null) ? fallback : v;
}
// settings() lists every saved key; forget() deletes one and says whether there was one.
function listSettings(opts) {
  var scope = __storageScope(opts, "ce.storage.settings");
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
  var scope = __storageScope(opts, "ce.storage.forget");
  if (!scope) return false;
  return __api.forgetSetting(__storageKeyFor(scope, key), __storageStore(scope)) === true;
}
// Every setting as a table — the read every other module got. Listing keys and looping to fetch each
// one was the only way before.
function allSettings(opts) {
  var scope = __storageScope(opts, "ce.storage.all");
  if (!scope) return {};
  var keys = listSettings(opts), out = {};
  for (var i = 0; i < keys.length; i++) out[keys[i]] = loadSetting(keys[i], undefined, opts);
  return out;
}
// Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
// keys alone: "clear my settings" must not mean "clear everybody's".
function clearSettings(opts) {
  // Checked here first, so a refusal names clear rather than the settings() it calls.
  if (!__storageScope(opts, "ce.storage.clear")) return 0;
  var keys = listSettings(opts), gone = 0;
  for (var i = 0; i < keys.length; i++) if (forgetSetting(keys[i], opts)) gone++;
  return gone;
}
// Which store a scope is talking to, and what is in it. `available` is the honest field: false means
// writes in this scope will not stick, which is worth saying once rather than per key.
function storageInfo(opts) {
  var scope = __storageScope(opts, "ce.storage.info");
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
// BEGIN GENERATED option keys — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// An options table holding a key its member does not take REFUSES the call: nothing is done, the
// console names the keys and the options the member has, and the call answers what the member
// answers for any other refusal. The WebView runtime does the same from the same lists in
// panelApi.js (panelRuntime.js, applyOptionChecks), in the same words. A key that is a number is a
// list entry, not an option. The keys are named sorted, in every runtime, because a table keeps no
// order a message could follow.
var __CE_OPTIONS = {
  "set": { path: "set", at: 2, refusal: "nothing", names: ["transmit"] },
  "requestDump": { path: "ce.device.requestDump", at: 2, refusal: "false", names: ["timeout"] },
  "recallPreset": { path: "ce.device.recallPreset", at: 1, refusal: "result", names: ["role"] },
  "animateTo": { path: "ce.anim.to", at: 2, refusal: "false", names: ["duration", "beats", "sync", "curve", "damping", "frequency", "from", "delay", "stagger", "repeat", "pingpong", "done"] },
  "animateSpring": { path: "ce.anim.spring", at: 2, refusal: "false", names: ["duration", "damping", "frequency", "from", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done"] },
  "animateEnvelope": { path: "ce.anim.envelope", at: 2, refusal: "false", names: ["from", "to", "duration", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done"] },
  "syncTimer": { path: "ce.time.syncTimer", at: 2, refusal: "nothing", names: ["follow"] },
  "deviceParameters": { path: "ce.device.parameters", at: 0, refusal: "empty list", names: ["role", "query", "group", "type", "access", "limit"] },
  "deviceDefineParameter": { path: "ce.device.defineParameter", at: 1, refusal: "false", names: ["name", "group", "type", "min", "max", "access", "choices", "trueValue", "falseValue", "cc", "nrpn", "sysex", "channel", "encoding", "nibbles", "checksum", "variables", "length", "pad"], nested: { "nrpn": { names: ["msb", "lsb"] } } },
  "deviceDefineDump": { path: "ce.device.defineDump", at: 1, refusal: "false", names: ["name", "request", "match", "prefix", "suffix", "offset", "size", "checksum", "fields"], nested: { "match": { names: ["prefix", "suffix"] } } },
  "devicePorts": { path: "ce.device.ports", at: 0, refusal: "empty list", names: ["direction"] },
  "checksum": { path: "ce.midi.checksum", at: 2, refusal: "nothing", names: ["offset"] },
  "panic": { path: "ce.midi.panic", at: 0, refusal: "nothing", names: ["channel", "resetControllers"] },
  "encodeJson": { path: "ce.storage.encode", at: 1, refusal: "nothing", names: ["indent"] },
  "bytesRead": { path: "ce.midi.read", at: 3, refusal: "nothing", names: ["bits", "order"] },
  "bytesWrite": { path: "ce.midi.write", at: 4, refusal: "nothing", names: ["bits", "order"] },
};
function __ce_isOptions(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    && !(typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(v));
}
// The keys `opts` holds that `shape` does not list, in groups: its own, then those inside each
// option that lists fields of its own, in the contract's order.
function __ce_unknownOptions(opts, shape, parent, out) {
  var unknown = [];
  for (var key in opts) {
    if (Object.prototype.hasOwnProperty.call(opts, key) && shape.names.indexOf(key) < 0 && !/^\d+$/.test(key)) unknown.push(key);
  }
  if (unknown.length) { unknown.sort(); out.push({ parent: parent, keys: unknown, shape: shape }); }
  for (var i = 0; i < shape.names.length; i++) {
    var name = shape.names[i], inner = shape.nested ? shape.nested[name] : undefined;
    if (inner && Object.prototype.hasOwnProperty.call(opts, name) && __ce_isOptions(opts[name]))
      __ce_unknownOptions(opts[name], inner, parent ? parent + "." + name : name, out);
  }
  return out;
}
function __ce_optionsLine(path, group) {
  var p = group.parent, quoted = [];
  for (var i = 0; i < group.keys.length; i++) quoted.push('"' + (p ? p + "." : "") + group.keys[i] + '"');
  var what = quoted.length === 1 ? quoted[0] + " is not one of its options, so nothing was done."
    : quoted.slice(0, -1).join(", ") + " and " + quoted[quoted.length - 1] + " are not among its options, so nothing was done.";
  var names = group.shape.names;
  var listed = names.length === 1 ? (p ? "The only option of " + p : "Its only option") + " is " + names[0] + "."
    : (p ? "The options of " + p : "Its options") + " are: " + names.join(", ") + ".";
  return path + ": " + what + " " + listed;
}
function __ce_refused(refusal, lines) {
  if (refusal === "false") return false;
  if (refusal === "zero") return 0;
  if (refusal === "empty list") return [];
  if (refusal === "result") return { ok: false, error: lines.join(" ") };
  return undefined;
}
(function () {
  var __g = (typeof globalThis !== 'undefined') ? globalThis : this;
  for (var id in __CE_OPTIONS) {
    if (!Object.prototype.hasOwnProperty.call(__CE_OPTIONS, id) || typeof __g[id] !== "function") continue;
    __g[id] = (function (fn, spec) {
      return function () {
        var opts = arguments[spec.at];
        if (__ce_isOptions(opts)) {
          var groups = __ce_unknownOptions(opts, spec, "", []);
          if (groups.length) {
            var lines = [];
            for (var i = 0; i < groups.length; i++) { lines.push(__ce_optionsLine(spec.path, groups[i])); logError(lines[i]); }
            return __ce_refused(spec.refusal, lines);
          }
        }
        return fn.apply(this, arguments);
      };
    })(__g[id], __CE_OPTIONS[id]);
  }
})();
// END GENERATED option keys
// BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
// on top. ce.core is global: its members are never namespaced, so they appear here only for
// discoverability (ce.core.set is the same function as set).
var __CE_MODULES = {
  "ce.core": { "action": "defineAction", "compute": "compute", "emit": "emit", "error": "logError", "get": "get", "intercept": "intercept", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit", "warn": "logWarn", "watch": "watch" },
  "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "feed": "feedMidi", "find": "bytesFind", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromBase64": "bytesFromBase64", "fromHex": "bytesFromHex", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "getBits": "getBits", "interceptIn": "interceptMidiIn", "interceptOut": "interceptMidiOut", "nibblize": "nibblize", "panic": "panic", "put": "bytesPut", "read": "bytesRead", "route": "routeMidi", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendRPN": "sendRPN", "sendSongPosition": "sendSongPosition", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "setBits": "setBits", "slice": "bytesSlice", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toBase64": "bytesToBase64", "toHex": "bytesToHex", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned", "write": "bytesWrite" },
  "ce.device": { "applyDump": "applyDump", "bind": "deviceBind", "buildDump": "buildDump", "connected": "deviceConnected", "coverage": "deviceCoverage", "defineDump": "deviceDefineDump", "defineParameter": "deviceDefineParameter", "parameter": "deviceParameter", "parameters": "deviceParameters", "ports": "devicePorts", "preset": "preset", "profile": "deviceProfile", "read": "deviceRead", "recallPreset": "recallPreset", "recipes": "deviceRecipes", "requestDump": "requestDump", "requests": "deviceRequests", "sendDump": "sendDump", "setTiming": "deviceSetTiming", "setVariable": "deviceSetVariable", "timing": "deviceTiming", "unbind": "deviceUnbind", "variables": "deviceVariables", "write": "deviceWrite" },
  "ce.math": { "almost": "almost", "alpha": "colourAlpha", "angle": "angleOf", "approach": "approach", "bipolar": "bipolar", "blend": "blend", "blendBy": "blendBy", "chance": "randomBool", "choice": "randomChoice", "clamp": "clamp", "crossfade": "crossfade", "curve": "curve", "darken": "darken", "dbPosition": "dbPosition", "dbToGain": "dbToGain", "deadzone": "deadzone", "degrees": "toDegrees", "denorm": "denorm", "distance": "distance", "euclid": "euclid", "fold": "fold", "fromARGB": "colourFromArgb", "fromHsl": "hslToHex", "fromRGBA": "colourFromRgba", "gainToDb": "gainToDb", "gaussian": "randomGaussian", "hex": "rgbToHex", "hsl": "hexToHsl", "hysteresis": "hysteresis", "index": "indexOfRange", "lerp": "lerp", "lighten": "lighten", "map": "mapCurve", "max": "maxOf", "mean": "meanOf", "median": "median", "min": "minOf", "mix": "mixColour", "norm": "norm", "polar": "polar", "quantize": "quantizeTo", "radians": "toRadians", "random": "random", "randomFloat": "randomFloat", "rgb": "hexToRgb", "round": "round", "roundTo": "roundTo", "scale": "scale", "seed": "randomSeed", "shape": "shapeCurve", "shuffle": "shuffle", "smooth": "smooth", "snap": "snap", "stream": "randomStream", "sum": "sumOf", "ticks": "tickStops", "unipolar": "unipolar", "unshape": "unshape", "walk": "randomWalk", "weights": "weightsFor", "wrap": "wrap" },
  "ce.music": { "arp": "arpOrder", "chord": "chordNotes", "degree": "scaleDegree", "degreeChord": "degreeChord", "inScale": "inScale", "lead": "voiceLead", "name": "noteName", "number": "noteNumber", "octaves": "expandOctaves", "quality": "chordQuality", "quantize": "quantizeNote", "scale": "scaleNotes", "spelling": "noteSpelling" },
  "ce.time": { "after": "after", "afterBeats": "afterBeats", "beatsToMs": "beatsToMs", "clockTempo": "clockTempo", "cycle": "cycleAt", "division": "beatsPerDivision", "divisions": "divisionNames", "looped": "loopedBeats", "msToBeats": "msToBeats", "now": "nowMs", "playing": "isPlaying", "position": "barBeatAt", "startTimer": "startTimer", "step": "stepAt", "steps": "stepsBetween", "stopTimer": "stopTimer", "swing": "swingOffset", "syncTimer": "syncTimer", "tap": "tapTempo", "tempo": "tempo", "timers": "runningTimers", "transport": "transportInfo" },
  "ce.anim": { "envelope": "animateEnvelope", "finish": "animateFinish", "list": "animateList", "pause": "animatePause", "play": "animatePlay", "resume": "animateResume", "reverse": "animateReverse", "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo", "value": "animateValue" },
  "ce.ui": { "choose": "uiChoose", "copy": "uiCopy", "dialog": "uiDialog", "dismiss": "uiDismiss", "notify": "uiNotify", "prompt": "uiPrompt", "state": "uiState", "status": "uiStatus", "update": "uiUpdate" },
  "ce.draw": { "arc": "drawArc", "batch": "drawBatch", "blend": "drawBlend", "circle": "drawCircle", "clear": "drawClear", "clip": "drawClip", "curve": "drawCurve", "ellipse": "drawEllipse", "fill": "drawFill", "gradient": "drawGradient", "grid": "drawGrid", "image": "drawImage", "line": "drawLine", "lines": "drawLines", "measure": "drawMeasure", "opacity": "drawOpacity", "path": "drawPath", "pixelText": "drawPixelText", "points": "drawPoints", "polygon": "drawPolygon", "rect": "drawRect", "redraw": "drawRedraw", "restore": "drawRestore", "save": "drawSave", "stroke": "drawStroke", "text": "drawText", "transform": "drawTransform" },
  "ce.panel": { "align": "panelAlign", "batch": "panelBatch", "circle": "panelCircle", "clone": "panelClone", "create": "panelCreate", "define": "panelDefine", "destroy": "panelDestroy", "distribute": "panelDistribute", "each": "panelEach", "entries": "panelEntries", "entry": "panelEntry", "find": "panelFind", "flip": "panelFlip", "grid": "panelGrid", "info": "panelInfo", "keep": "panelKeep", "match": "panelMatch", "order": "panelOrder", "parent": "panelParent", "patch": "panelPatch", "rect": "panelRect", "restore": "panelRestore", "snapshot": "panelSnapshot", "types": "panelTypes", "undefine": "panelUndefine" },
  "ce.storage": { "all": "allSettings", "clear": "clearSettings", "decode": "decodeJson", "encode": "encodeJson", "forget": "forgetSetting", "info": "storageInfo", "loadSetting": "loadSetting", "saveSetting": "saveSetting", "settings": "listSettings", "state": "state" },
  "ce.image": { "asset": "imageAsset", "assets": "imageAssets", "clear": "imageClear", "embed": "imageEmbed", "icon": "imageIcon", "load": "imageLoad", "read": "imageRead", "set": "imageSet" },
  "ce.text": { "axis": "textAxis", "fit": "textFit", "font": "textFont", "fonts": "textFonts", "measure": "textMeasure", "read": "textRead", "style": "textStyle" },
  "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "read": "splitRead", "transpose": "splitTranspose" },
  "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "read": "phraseRead", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
  "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "read": "recorderRead", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
  "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "read": "harmonyRead", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
  "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "read": "setlistRead", "wrap": "setlistWrap" },
  "ce.components.arp": { "baseOctave": "arpBaseOctave", "channel": "arpChannel", "chordType": "arpChordType", "degree": "arpDegree", "division": "arpDivision", "editable": "arpEditable", "euclid": "arpEuclid", "euclidPulses": "arpEuclidPulses", "euclidRotate": "arpEuclidRotate", "euclidSteps": "arpEuclidSteps", "followPanelKey": "arpFollowPanelKey", "gate": "arpGate", "inputChannel": "arpInputChannel", "key": "arpKey", "latch": "arpLatch", "link": "arpLink", "mute": "arpMute", "octaves": "arpOctaves", "pattern": "arpPattern", "phase": "arpPhase", "rate": "arpRate", "read": "arpRead", "run": "arpRun", "scale": "arpScale", "showHeader": "arpShowHeader", "showNotes": "arpShowNotes", "source": "arpSource", "swing": "arpSwing", "swingSource": "arpSwingSource", "sync": "arpSync", "velocity": "arpVelocity" },
  "ce.components.chordpad": { "baseOctave": "chordPadBaseOctave", "channel": "chordPadChannel", "chordType": "chordPadChordType", "echo": "chordPadEcho", "echoChannel": "chordPadEchoChannel", "editable": "chordPadEditable", "followPanelKey": "chordPadFollowPanelKey", "gridCols": "chordPadGridCols", "inversion": "chordPadInversion", "key": "chordPadKey", "latch": "chordPadLatch", "layout": "chordPadLayout", "mode": "chordPadMode", "noteSpan": "chordPadNoteSpan", "octave": "chordPadOctave", "read": "chordPadRead", "scale": "chordPadScale", "showPiano": "chordPadShowPiano", "showRomans": "chordPadShowRomans", "strum": "chordPadStrum", "velocity": "chordPadVelocity", "voicing": "chordPadVoicing" },
  "ce.components.noteribbon": { "baseNote": "noteRibbonBaseNote", "bendRange": "noteRibbonBendRange", "channel": "noteRibbonChannel", "echo": "noteRibbonEcho", "echoChannel": "noteRibbonEchoChannel", "editable": "noteRibbonEditable", "followPanelKey": "noteRibbonFollowPanelKey", "key": "noteRibbonKey", "latch": "noteRibbonLatch", "modAxis": "noteRibbonModAxis", "modCc": "noteRibbonModCc", "mode": "noteRibbonMode", "octaves": "noteRibbonOctaves", "orientation": "noteRibbonOrientation", "read": "noteRibbonRead", "scale": "noteRibbonScale", "showHeader": "noteRibbonShowHeader", "showNames": "noteRibbonShowNames", "velocity": "noteRibbonVelocity", "velocityFrom": "noteRibbonVelocityFrom" },
  "ce.components.drumpads": { "baseNote": "drumPadsBaseNote", "channel": "drumPadsChannel", "choke": "drumPadsChoke", "colour": "drumPadsColour", "cols": "drumPadsCols", "cornerBottomLeft": "drumPadsCornerBottomLeft", "cornerBottomRight": "drumPadsCornerBottomRight", "cornerSize": "drumPadsCornerSize", "cornerTopLeft": "drumPadsCornerTopLeft", "cornerTopRight": "drumPadsCornerTopRight", "echo": "drumPadsEcho", "echoChannel": "drumPadsEchoChannel", "editable": "drumPadsEditable", "fill": "drumPadsFill", "flamMs": "drumPadsFlamMs", "gate": "drumPadsGate", "ghostVelocity": "drumPadsGhostVelocity", "label": "drumPadsLabel", "map": "drumPadsMap", "mode": "drumPadsMode", "note": "drumPadsNote", "origin": "drumPadsOrigin", "read": "drumPadsRead", "roll": "drumPadsRoll", "rollDelay": "drumPadsRollDelay", "rollHz": "drumPadsRollHz", "rollRate": "drumPadsRollRate", "rollSync": "drumPadsRollSync", "rollVelocity": "drumPadsRollVelocity", "rows": "drumPadsRows", "showHeader": "drumPadsShowHeader", "showLabels": "drumPadsShowLabels", "showNotes": "drumPadsShowNotes", "size": "drumPadsSize", "velocity": "drumPadsVelocity", "velocityFrom": "drumPadsVelocityFrom", "zones": "drumPadsZones" },
  "ce.components.turing": { "division": "turingDivision", "editable": "turingEditable", "fill": "turingFill", "gate": "turingGate", "length": "turingLength", "phase": "turingPhase", "quantize": "turingQuantize", "randomness": "turingRandomness", "rate": "turingRate", "read": "turingRead", "run": "turingRun", "showDivisions": "turingShowDivisions", "showGate": "turingShowGate", "size": "turingSize", "step": "turingStep", "sync": "turingSync" },
  "ce.components.looper": { "bars": "looperBars", "editable": "looperEditable", "fill": "looperFill", "insert": "looperInsert", "lane": "looperLane", "laneRest": "looperLaneRest", "phase": "looperPhase", "quantize": "looperQuantize", "read": "looperRead", "remove": "looperRemove", "run": "looperRun", "seconds": "looperSeconds", "showDivisions": "looperShowDivisions", "showGrid": "looperShowGrid", "showPlayhead": "looperShowPlayhead", "size": "looperSize", "sync": "looperSync" },
  "ce.components.orbit": { "bars": "orbitBars", "editable": "orbitEditable", "fill": "orbitFill", "insert": "orbitInsert", "node": "orbitNode", "nodeAngle": "orbitNodeAngle", "nodeDepth": "orbitNodeDepth", "nodeRadius": "orbitNodeRadius", "nodeRatio": "orbitNodeRatio", "phase": "orbitPhase", "rate": "orbitRate", "read": "orbitRead", "remove": "orbitRemove", "run": "orbitRun", "showRings": "orbitShowRings", "showSpokes": "orbitShowSpokes", "showTrails": "orbitShowTrails", "showValues": "orbitShowValues", "size": "orbitSize", "sync": "orbitSync" },
  "ce.components.kinetic": { "bounce": "kineticBounce", "editable": "kineticEditable", "friction": "kineticFriction", "gravity": "kineticGravity", "keepAlive": "kineticKeepAlive", "launch": "kineticLaunch", "read": "kineticRead", "run": "kineticRun", "showTrail": "kineticShowTrail", "showWalls": "kineticShowWalls", "sync": "kineticSync", "velocity": "kineticVelocity" },
  "ce.components.constellation": { "bars": "constellationBars", "blend": "constellationBlend", "editable": "constellationEditable", "links": "constellationLinks", "mode": "constellationMode", "probe": "constellationProbe", "rate": "constellationRate", "read": "constellationRead", "run": "constellationRun", "showField": "constellationShowField", "showLabels": "constellationShowLabels", "showLinks": "constellationShowLinks", "sync": "constellationSync" },
  "ce.components.timbre": { "anchorX": "timbreAnchorX", "anchorY": "timbreAnchorY", "axisX": "timbreAxisX", "axisY": "timbreAxisY", "editable": "timbreEditable", "fill": "timbreFill", "insert": "timbreInsert", "move": "timbreMove", "power": "timbrePower", "read": "timbreRead", "remove": "timbreRemove", "showAnchors": "timbreShowAnchors", "showField": "timbreShowField", "showReadout": "timbreShowReadout", "size": "timbreSize" },
  "ce.components.router": { "cc": "routerCc", "channel": "routerChannel", "curveShape": "routerCurveShape", "curveX": "routerCurveX", "curveY": "routerCurveY", "deadzone": "routerDeadzone", "dest": "routerDest", "destDepth": "routerDestDepth", "editable": "routerEditable", "fill": "routerFill", "input": "routerInput", "insert": "routerInsert", "invert": "routerInvert", "poly": "routerPoly", "read": "routerRead", "remove": "routerRemove", "showDivisions": "routerShowDivisions", "showGrid": "routerShowGrid", "size": "routerSize", "source": "routerSource", "sourceControl": "routerSourceControl" },
  "ce.components.macro": { "editable": "macroEditable", "fill": "macroFill", "insert": "macroInsert", "label": "macroLabel", "read": "macroRead", "remove": "macroRemove", "showDivisions": "macroShowDivisions", "showLanes": "macroShowLanes", "showValues": "macroShowValues", "size": "macroSize", "slot": "macroSlot", "slotCurve": "macroSlotCurve", "slotDepth": "macroSlotDepth", "slotMax": "macroSlotMax", "slotMin": "macroSlotMin", "value": "macroValue" },
  "ce.components.matrix": { "bipolar": "matrixBipolar", "cell": "matrixCell", "cellStyle": "matrixCellStyle", "clear": "matrixClear", "editable": "matrixEditable", "fill": "matrixFill", "read": "matrixRead", "showLabels": "matrixShowLabels", "showValues": "matrixShowValues", "size": "matrixSize", "step": "matrixStep" },
  "ce.components.constraint": { "editable": "constraintEditable", "fill": "constraintFill", "gap": "constraintGap", "insert": "constraintInsert", "member": "constraintMember", "mode": "constraintMode", "read": "constraintRead", "remove": "constraintRemove", "showBadge": "constraintShowBadge", "showValues": "constraintShowValues", "size": "constraintSize" },
  "ce.components.envelope": { "addOnDoubleClick": "envelopeAddOnDoubleClick", "editable": "envelopeEditable", "fill": "envelopeFill", "fillUnder": "envelopeFillUnder", "insert": "envelopeInsert", "loop": "envelopeLoop", "loopEnd": "envelopeLoopEnd", "loopStart": "envelopeLoopStart", "phase": "envelopePhase", "phaseSource": "envelopePhaseSource", "pointCurve": "envelopePointCurve", "pointX": "envelopePointX", "pointY": "envelopePointY", "preset": "envelopePreset", "read": "envelopeRead", "remove": "envelopeRemove", "showGrid": "envelopeShowGrid", "showPlayhead": "envelopeShowPlayhead", "size": "envelopeSize", "snapX": "envelopeSnapX", "snapY": "envelopeSnapY", "sustain": "envelopeSustain", "timeMax": "envelopeTimeMax" },
  "ce.components.ribbon": { "bipolar": "ribbonBipolar", "editable": "ribbonEditable", "label": "ribbonLabel", "orientation": "ribbonOrientation", "read": "ribbonRead", "returnCurve": "ribbonReturnCurve", "returnMode": "ribbonReturnMode", "returnTime": "ribbonReturnTime", "returnValue": "ribbonReturnValue", "showGlow": "ribbonShowGlow", "showValue": "ribbonShowValue", "snap": "ribbonSnap", "style": "ribbonStyle", "value": "ribbonValue", "valuePrecision": "ribbonValuePrecision" },
  "ce.components.crossfader": { "bipolar": "crossfaderBipolar", "detent": "crossfaderDetent", "editable": "crossfaderEditable", "labelA": "crossfaderLabelA", "labelB": "crossfaderLabelB", "law": "crossfaderLaw", "mix": "crossfaderMix", "orientation": "crossfaderOrientation", "read": "crossfaderRead", "returnCurve": "crossfaderReturnCurve", "returnMode": "crossfaderReturnMode", "returnTime": "crossfaderReturnTime", "returnValue": "crossfaderReturnValue", "showGains": "crossfaderShowGains", "showLabels": "crossfaderShowLabels" },
  "ce.components.joystick": { "bipolar": "joystickBipolar", "cornerLabel": "joystickCornerLabel", "editable": "joystickEditable", "fill": "joystickFill", "move": "joystickMove", "read": "joystickRead", "returnAxes": "joystickReturnAxes", "returnCurve": "joystickReturnCurve", "returnMode": "joystickReturnMode", "returnTime": "joystickReturnTime", "returnValue": "joystickReturnValue", "showCorners": "joystickShowCorners", "showCrosshair": "joystickShowCrosshair", "showGrid": "joystickShowGrid", "showTrail": "joystickShowTrail", "size": "joystickSize" },
  "ce.components.meter": { "dbCeil": "meterDbCeil", "dbFloor": "meterDbFloor", "decay": "meterDecay", "fill": "meterFill", "gradient": "meterGradient", "holdMs": "meterHoldMs", "insert": "meterInsert", "label": "meterLabel", "labelPosition": "meterLabelPosition", "orientation": "meterOrientation", "peakHold": "meterPeakHold", "read": "meterRead", "remove": "meterRemove", "scale": "meterScale", "showScaleLabels": "meterShowScaleLabels", "showTicks": "meterShowTicks", "showValue": "meterShowValue", "size": "meterSize", "source": "meterSource", "value": "meterValue", "valueMax": "meterValueMax", "valueMin": "meterValueMin", "valuePrecision": "meterValuePrecision", "valuePrefix": "meterValuePrefix", "valueSuffix": "meterValueSuffix", "zoneAt": "meterZoneAt" },
  "ce.components.transport": { "beatUnit": "transportBeatUnit", "beatsPerBar": "transportBeatsPerBar", "bpm": "transportBpm", "clockDevice": "transportClockDevice", "clockOut": "transportClockOut", "countIn": "transportCountIn", "editable": "transportEditable", "loop": "transportLoop", "loopBars": "transportLoopBars", "loopStart": "transportLoopStart", "read": "transportRead", "runOnLoad": "transportRunOnLoad", "showPosition": "transportShowPosition", "showTap": "transportShowTap", "source": "transportSource", "swing": "transportSwing" },
  "ce.components.panic": { "centreBend": "panicSetCentreBend", "channel": "panicSetChannel", "clearLocal": "panicSetClearLocal", "editable": "panicSetEditable", "label": "panicSetLabel", "read": "panicSetRead", "resetControllers": "panicSetResetControllers", "scope": "panicSetScope", "showSummary": "panicSetShowSummary" },
  "ce.components.lcd": { "anim": "lcdAnim", "animFps": "lcdAnimFps", "animLoop": "lcdAnimLoop", "animPreset": "lcdAnimPreset", "animSpeed": "lcdAnimSpeed", "backlight": "lcdBacklight", "backlightSource": "lcdBacklightSource", "blink": "lcdBlink", "blinkRate": "lcdBlinkRate", "brightness": "lcdBrightness", "brightnessSource": "lcdBrightnessSource", "clear": "lcdClear", "contrast": "lcdContrast", "cursor": "lcdCursor", "cursorAt": "lcdCursorAt", "cursorBlink": "lcdCursorBlink", "editText": "lcdEditText", "fill": "lcdFill", "glyph": "lcdGlyph", "layout": "lcdLayout", "read": "lcdRead", "scroll": "lcdScroll", "scrollMode": "lcdScrollMode", "scrollRepeat": "lcdScrollRepeat", "scrollSpeed": "lcdScrollSpeed", "showGhost": "lcdShowGhost", "showGlass": "lcdShowGlass", "showGrid": "lcdShowGrid", "showScanlines": "lcdShowScanlines", "size": "lcdSize", "text": "lcdText", "value": "lcdValue", "valueMax": "lcdValueMax", "valueMin": "lcdValueMin", "valuePrecision": "lcdValuePrecision", "valuePrefix": "lcdValuePrefix", "valueSource": "lcdValueSource", "valueSuffix": "lcdValueSuffix", "zoneAt": "lcdZoneAt", "zoneKind": "lcdZoneKind", "zoneLabel": "lcdZoneLabel", "zoneShow": "lcdZoneShow", "zoneSource": "lcdZoneSource", "zoneText": "lcdZoneText" },
  "ce.components.pixel": { "anim": "pixelAnim", "animFps": "pixelAnimFps", "animLoop": "pixelAnimLoop", "animPreset": "pixelAnimPreset", "animSpeed": "pixelAnimSpeed", "backlight": "pixelBacklight", "backlightSource": "pixelBacklightSource", "blink": "pixelBlink", "brightness": "pixelBrightness", "brightnessSource": "pixelBrightnessSource", "contrast": "pixelContrast", "editText": "pixelEditText", "gamma": "pixelGamma", "glow": "pixelGlow", "h": "pixelH", "kind": "pixelKind", "label": "pixelLabel", "layout": "pixelLayout", "layoutTransition": "pixelLayoutTransition", "read": "pixelRead", "show": "pixelShow", "showGhost": "pixelShowGhost", "showGlass": "pixelShowGlass", "showGrid": "pixelShowGrid", "showScanlines": "pixelShowScanlines", "source": "pixelSource", "text": "pixelText", "transitionMs": "pixelTransitionMs", "w": "pixelW", "x": "pixelX", "y": "pixelY" },
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

// The gate above builds the namespace once for the panel, which is right for functions. A VALUE
// member (ce.storage.state) is different: it is the same object as the global it mirrors, and that
// global is the running script's own (__CE_OWN). So after every application of the gate, a value
// member becomes an accessor onto the running script, and ce.storage.state stays `state`.
function __ceOwnValues() {
  for (var path in __CE_MODULES) {
    if (!Object.prototype.hasOwnProperty.call(__CE_MODULES, path)) continue;
    var node = ce, segs = path.split('.').slice(1);
    for (var s = 0; s < segs.length && node; s++) node = node[segs[s]];
    if (!node) continue;
    var members = __CE_MODULES[path];
    for (var key in members) {
      if (!Object.prototype.hasOwnProperty.call(members, key)) continue;
      if (__CE_VALUES[members[key]] === true && __CE_OWN.indexOf(members[key]) >= 0)
        __ceOwnValue(node, key, members[key]);
    }
  }
}
function __ceOwnValue(node, key, name) {
  Object.defineProperty(node, key, {
    get: function () { return __ceCur[name]; },
    set: function (v) { __ceCur[name] = v; },
    enumerable: true, configurable: true
  });
}
var __ceApplyModules = __ce_apply_modules;
__ce_apply_modules = function (enabled) { __ceApplyModules(enabled); __ceOwnValues(); };
__ceOwnValues();
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
    // get's form is text or it is no form, as in the WebView runtime: a table or a number where the
    // form goes means the value, rather than the text a var makes of it, which the host would now
    // refuse as a form that is not one (BridgeScriptHost::formRefusal).
    auto formOf = [arg] (const Args& a, int i) -> juce::String
    {
        const auto form = arg (a, i);
        return form.isString() ? form.toString() : juce::String ("value");
    };
    api->setMethod ("get", [host, arg, formOf] (const Args& a) -> juce::var
        { return host->getValue (arg (a, 0).toString(), formOf (a, 1)); });
    api->setMethod ("whyNoValue", [host, arg, formOf] (const Args& a) -> juce::var
        { const auto why = host->whyNoValue (arg (a, 0).toString(), formOf (a, 1));
          return why.isEmpty() ? juce::var() : juce::var (why); });
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
        { return juce::var (host->startAnimation (arg (a, 0).toString(), arg (a, 1), (double) arg (a, 2), arg (a, 3))); });
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
    api->setMethod ("deviceSet", [host, arg] (const Args& a) -> juce::var
        { return host->deviceSet (arg (a, 0).toString(), arg (a, 1).toString(),
                                  arg (a, 2), arg (a, 3).toString()); });
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

    // One engine serves every script (see the top of the prelude), so the gate goes on once and
    // covers them all. Stored as well, for the engine the first script creates.
    void setEnabledModules (const juce::StringArray& moduleIds) override
    {
        enabledModules = moduleIds;
        if (engine != nullptr) engine->execute (moduleGateCall());
    }

    // Likewise installed once into the shared engine. A module added mid-session is usable by every
    // loaded script without a reload. A module whose prelude registers listeners at its own top level
    // registers them in the prelude's context, so scripts loaded after it start with them and scripts
    // already loaded do not; no shipped module does either.
    void setExtensionModules (const juce::var& modules) override
    {
        extensions = modules;
        const auto boot = extensionBoot();
        if (engine != nullptr && boot.isNotEmpty()) engine->execute (boot);
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

        if (! ensureEngine())
        {
            onError (def.id, "prelude error: " + preludeError);
            return false;
        }

        // The script becomes the body of a function, so what it declares at its top level is its own
        // and two scripts can both define onClick, which is the isolation an engine apiece used to
        // buy. The function returns a resolver evaluated in the script's scope, which is how a
        // handler is found by name. Everything else the script names resolves to the prelude's
        // globals, the gated ones included.
        //
        // The source starts on the wrapper's first line, so an error's line number is the script's
        // own. resolveSelfOwner: a panel script's `self` is the panel, a component script's is its
        // control.
        const auto r = engine->execute ("__ceAdd(" + jsString (def.id) + "," + jsString (resolveSelfOwner (def))
                                        + ",function(){" + code
                                        + "\n;return function(__ceName){return eval(__ceName);};});");
        if (r.failed()) { onError (def.id, "load error: " + withoutWrapperFrames (r.getErrorMessage(), true)); return false; }

        loaded.insert (def.id);
        return true;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        if (engine == nullptr || loaded.count (scriptId) == 0) return false;
        juce::Result err = juce::Result::ok();
        const juce::var args[] = { scriptId, fn };
        auto v = engine->callFunction ("__ceHas", juce::var::NativeFunctionArgs (juce::var(), args, 2), &err);
        return err.wasOk() && (bool) v;
    }

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        if (engine == nullptr || loaded.count (scriptId) == 0) return {};
        juce::Result err = juce::Result::ok();
        const juce::var args[] = { scriptId, fn, payload };
        auto result = engine->callFunction ("__ceCall", juce::var::NativeFunctionArgs (juce::var(), args, 3), &err);
        if (err.failed()) onError (scriptId, withoutWrapperFrames (err.getErrorMessage()));
        return result;
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        for (const auto& id : loaded)
        {
            juce::Result err = juce::Result::ok();
            callIn (id, "__deliver", { target, event, payload }, err);
            if (err.failed()) onError ("on:" + event, withoutWrapperFrames (err.getErrorMessage()));
        }
    }

    /* --------------------------------------------------------------- the reactive core
     * The rules live in the prelude (see __runReactive there), in each script's own tables, so the
     * C++ side is only the caller. Every script gets a pass: a formula in one script has to settle
     * whatever moved in another. */
    void runReactive (const ScriptErrorSink& onError) override
    {
        for (const auto& id : loaded)
        {
            juce::Result err = juce::Result::ok();
            callIn (id, "__runReactive", {}, err);
            if (err.failed()) onError ("compute/watch", withoutWrapperFrames (err.getErrorMessage()));
        }
    }

    bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError) override
    {
        for (const auto& id : loaded)
        {
            juce::Result err = juce::Result::ok();
            auto out = callIn (id, "__applyMidiFilter", { inbound, bytes }, err);
            if (err.failed()) { onError ("interceptMidi", withoutWrapperFrames (err.getErrorMessage())); continue; }
            if (auto* o = out.getDynamicObject())
            {
                if (o->hasProperty ("swallow")) return false;
                if (o->hasProperty ("bytes")) bytes = o->getProperty ("bytes");
            }
        }
        return true;
    }

    bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                     const ScriptErrorSink& onError) override
    {
        for (const auto& id : loaded)
        {
            juce::Result err = juce::Result::ok();
            auto out = callIn (id, "__callAction", { name, args }, err);
            if (err.failed()) { onError ("action:" + name, withoutWrapperFrames (err.getErrorMessage())); continue; }
            if (auto* o = out.getDynamicObject())
                if ((bool) o->getProperty ("found")) { result = o->getProperty ("value"); return true; }
        }
        return false;
    }

    juce::StringArray registeredActions() const override
    {
        juce::StringArray out;
        for (const auto& id : loaded)
        {
            juce::Result err = juce::Result::ok();
            auto names = callIn (id, "__actionNames", {}, err);
            if (err.failed()) continue;
            if (auto* arr = names.getArray())
                for (auto& n : *arr) out.addIfNotAlreadyThere (n.toString());
        }
        return out;
    }

    void reset() override
    {
        engine.reset();
        loaded.clear();
        preludeError.clear();
    }

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

    /** The shared engine, made with the first script: the prelude, then the installed modules, then
        the gate, in the order each script's private engine used to boot. A panel with no JavaScript
        never pays for it. A failed prelude is remembered and reported for every script until reset. */
    bool ensureEngine()
    {
        if (engine != nullptr) return true;
        if (preludeError.isNotEmpty()) return false;

        auto eng = std::make_unique<juce::JavascriptEngine>();
        // Anti-flood / loop guard (scripting-redesign §7 keep-list): QuickJS's interrupt handler
        // aborts any evaluate/callFunction that runs longer than this, so `while (true) {}` in a
        // handler can't freeze the DAW. Per call, as before, now that every call shares one engine.
        eng->maximumExecutionTime = juce::RelativeTime::seconds (2.0);
        eng->registerNativeObject ("__api", makeApi (host, {}).get());
        // fromUTF8, NOT String(const char*): the prelude contains ♭/♯ literals, and the plain
        // constructor reads bytes as single characters — every non-ASCII glyph arrives mangled.
        const auto r = eng->execute (juce::String::fromUTF8 (kJsPrelude) + "\n" + extensionBoot() + moduleGateCall());
        if (r.failed())
        {
            preludeError = r.getErrorMessage();
            return false;
        }
        engine = std::move (eng);
        return true;
    }

    /** One of the prelude's entry points, run for one script inside its context (__ceIn). */
    juce::var callIn (const juce::String& id, const char* fn, juce::Array<juce::var> args, juce::Result& err) const
    {
        const juce::var a[] = { id, juce::String (fn), juce::var (std::move (args)) };
        return engine->callFunction ("__ceIn", juce::var::NativeFunctionArgs (juce::var(), a, 3), &err);
    }

    /** A QuickJS error without the frames of the entry points every call now passes through
        (__ceAdd, __ceCall, __ceIn), and for a load error without the statement that wrapped the
        script, so what a panel author reads names their code and nothing of the plumbing. */
    static juce::String withoutWrapperFrames (const juce::String& message, bool loading = false)
    {
        juce::StringArray lines;
        lines.addLines (message);
        juce::StringArray kept;
        for (const auto& line : lines)
            if (! line.trimStart().startsWith ("at __ce")) kept.add (line);
        if (loading)
            for (int i = kept.size(); --i >= 0;)
                if (kept[i].trim().isNotEmpty())
                {
                    if (kept[i].trimStart().startsWith ("at <eval>")) kept.remove (i);
                    break;
                }
        return kept.joinIntoString ("\n");
    }

    /** A JS string literal, escaped: an id or a control name is data, not source. */
    static juce::String jsString (const juce::String& s) { return juce::JSON::toString (juce::var (s)); }

    std::unique_ptr<juce::JavascriptEngine> engine;
    std::set<juce::String> loaded;      // sorted by id, the order scripts were always visited in: it decides
                                        // which script's action answers a run() first
    juce::String preludeError;
    ScriptHostApi* host = nullptr;
    juce::StringArray enabledModules;
    juce::var extensions;               // ce.ext.* modules the panel carries
};

} // namespace

std::unique_ptr<ScriptEngine> createJsEngine() { return std::make_unique<JsScriptEngine>(); }

} // namespace ceditor::scripting
