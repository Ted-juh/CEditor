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
function set(path, value, opts) { return __api.set(path, value, opts || null); }
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
function requestDump(kind) { return __api.requestDump(kind); }
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
function curve(v, shape) { shape = shape || "linear"; if (shape === "exp") return v * v; if (shape === "log") return Math.sqrt(Math.max(0, v)); if (shape === "s") return v * v * (3 - 2 * v); return v; }
// @module ce.music
var __NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteName(n) { n = Math.floor(n); return __NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
function noteNumber(name) { var m = /^([A-G]#?)(-?\d+)$/.exec(name); if (!m) return 0; var i = __NOTES.indexOf(m[1]); return i < 0 ? 0 : (parseInt(m[2], 10) + 1) * 12 + i; }
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

// @module ce.components
// Panel-component verbs (panelApi.js PANEL_COMMANDS). The Zone Splitter, Phrase Sequencer,
// Recorder, Harmoniser and Setlist are modelled and rendered in the panel view; there is no C++
// counterpart to drive with the window closed. Defining them here as explaining stubs means a
// script that strays across the boundary says so, instead of dying on an undefined global.
var __WEBVIEW_ONLY = [
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection","phraseRun","phraseCell",
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift","recorderStore",
  "recorderLoad","recorderCountIn",
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing","harmonyInversion",
  "harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel","harmonyVoiceLeading","harmonyStrum",
  "harmonyDegree",
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade"
];
var __global = (typeof globalThis !== 'undefined') ? globalThis : this;
for (var __i = 0; __i < __WEBVIEW_ONLY.length; __i++) {
  __global[__WEBVIEW_ONLY[__i]] = (function (name) {
    return function () {
      log("[panel] " + name + "() needs the panel window open — that component is drawn and modelled in the panel view, so there is nothing to drive while the window is closed.");
    };
  })(__WEBVIEW_ONLY[__i]);
}

// @module ce.midi
// MIDI channel messages — arithmetic over sendMidi, the way panic() is over sendCC, which is what
// makes them work identically in every runtime and every exported language. `note` accepts a MIDI
// number or a name ("C3"), because a script that reads musically should be allowed to say so.
function sendMidi(bytes) { return __api.sendMidi(bytes); }
function __ch(c) { c = Math.floor(Number(c) || 1); return (c < 1 ? 1 : (c > 16 ? 16 : c)) - 1; }
function __7(v) { v = Math.floor(Number(v) || 0); return v < 0 ? 0 : (v > 127 ? 127 : v); }
function __note(n) { return typeof n === "string" ? noteNumber(n) : __7(n); }

function sendNote(channel, note, velocity) { sendMidi([0x90 | __ch(channel), __note(note), __7(velocity)]); }
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

// @module ce.device
// Device READS — four wrappers over one host primitive, __api.deviceQuery, so the shape a script
// sees is assembled here rather than per engine. Without a device host the query returns null and
// the host has already said why; these hand back null / an empty list rather than pretending.
function __role(r) { return (r === undefined || r === null || r === "") ? "mainSynth" : String(r); }
function __deviceQuery(kind, payload) { return __api.deviceQuery(kind, payload || null); }
function deviceProfile(role) { return __deviceQuery("profile", { role: __role(role) }); }
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

// @module ce.storage
// ce.storage. `state` is a plain object: QuickJS gives each script its own engine, whose globals
// live as long as the script is loaded, so it persists between handler calls with no host help.
// Settings go through the host, because they outlive the session.
var state = {};
function saveSetting(key, value) { return __api.saveSetting(String(key), value); }
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
  "ce.core": { "emit": "emit", "get": "get", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit" },
  "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "nibblize": "nibblize", "panic": "panic", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned" },
  "ce.device": { "applyDump": "applyDump", "buildDump": "buildDump", "connected": "deviceConnected", "parameter": "deviceParameter", "parameters": "deviceParameters", "profile": "deviceProfile", "requestDump": "requestDump", "sendDump": "sendDump" },
  "ce.math": { "clamp": "clamp", "curve": "curve", "lerp": "lerp", "round": "round", "scale": "scale", "snap": "snap" },
  "ce.music": { "noteName": "noteName", "noteNumber": "noteNumber" },
  "ce.time": { "startTimer": "startTimer", "stopTimer": "stopTimer" },
  "ce.storage": { "loadSetting": "loadSetting", "saveSetting": "saveSetting", "state": "state" },
  "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "transpose": "splitTranspose" },
  "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
  "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
  "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
  "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "wrap": "setlistWrap" },
};
var __CE_ORDER = ["ce.core","ce.midi","ce.device","ce.math","ce.music","ce.time","ce.storage","ce.components.split","ce.components.phrase","ce.components.recorder","ce.components.harmony","ce.components.setlist"];
var __CE_META = [{"id":"ce.core","version":"1.0","runtime":"any"},{"id":"ce.midi","version":"1.1","runtime":"any"},{"id":"ce.device","version":"1.1","runtime":"any"},{"id":"ce.math","version":"1.0","runtime":"any"},{"id":"ce.music","version":"1.0","runtime":"any"},{"id":"ce.time","version":"1.0","runtime":"any"},{"id":"ce.storage","version":"1.0","runtime":"any"},{"id":"ce.components.split","version":"1.0","runtime":"webview"},{"id":"ce.components.phrase","version":"1.0","runtime":"webview"},{"id":"ce.components.recorder","version":"1.0","runtime":"webview"},{"id":"ce.components.harmony","version":"1.0","runtime":"webview"},{"id":"ce.components.setlist","version":"1.0","runtime":"webview"}];
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
    api->setMethod ("deviceQuery", [host, arg] (const Args& a) -> juce::var
        { return host->deviceQuery (arg (a, 0).toString(), arg (a, 1)); });
    api->setMethod ("startTimer", [host, arg] (const Args& a) -> juce::var { host->startTimer (arg (a, 0).toString(), (int) arg (a, 1)); return {}; });
    api->setMethod ("stopTimer", [host, arg] (const Args& a) -> juce::var { host->stopTimer (arg (a, 0).toString()); return {}; });
    api->setMethod ("saveSetting", [host, arg] (const Args& a) -> juce::var { host->saveSetting (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("loadSetting", [host, arg] (const Args& a) -> juce::var { return host->loadSetting (arg (a, 0).toString()); });
    api->setMethod ("run", [host, arg] (const Args& a) -> juce::var { return host->runAction (arg (a, 0).toString(), arg (a, 1)); });
    api->setMethod ("emit", [host, arg] (const Args& a) -> juce::var { host->emitEvent (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("log", [host, arg] (const Args& a) -> juce::var { host->log (arg (a, 0).toString(), arg (a, 1)); return {}; });
    api->setMethod ("beginTransmit", [host, arg] (const Args& a) -> juce::var { host->beginTransmitOverride ((bool) arg (a, 0)); return {}; });
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
