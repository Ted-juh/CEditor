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

#include <map>
#include <memory>

namespace ceditor::scripting
{
namespace
{

const char* kJsPrelude = R"JS(
// Wrap the native bridge as globals + pure-math helpers + event registry + self.
var __listeners = [];
function on(target, event, fn) { __listeners.push({ t: target, e: event, fn: fn }); }
function __deliver(target, event, payload) {
  for (var i = 0; i < __listeners.length; i++) {
    var l = __listeners[i];
    if (l.e === event && (l.t === target || l.t === "*" || l.t === "self")) { try { l.fn(payload); } catch (err) { log("on " + event + ": " + err); } }
  }
}
function set(path, value, opts) { return __api.set(path, value, opts || null); }
function get(path, form) { return __api.get(path, form || "value"); }
function sendCC(ch, cc, v) { return __api.sendCC(ch, cc, v); }
function sendNRPN(ch, msb, lsb, v) { return __api.sendNRPN(ch, msb, lsb, v); }
function sendSysex(bytes) { return __api.sendSysex(bytes); }
function requestDump(kind) { return __api.requestDump(kind); }
function applyDump(bytes) { return __api.applyDump(bytes); }
function sendDump(kind) { return __api.sendDump(kind); }
function buildDump(kind) { return __api.buildDump(kind); }
function run(target, args) { return __api.run(target, args || null); }
function emit(name, data) { return __api.emit(name, data || null); }
function log(msg, v) { return __api.log(String(msg), v === undefined ? null : v); }
function noTransmit(fn) { __api.beginTransmit(false); try { fn(); } finally { __api.endTransmit(); } }
function transmit(fn) { __api.beginTransmit(true); try { fn(); } finally { __api.endTransmit(); } }

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function round(v) { return Math.round(v); }
function scale(v, inLo, inHi, outLo, outHi) { return inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo); }
function snap(v, step) { return step === 0 ? v : Math.round(v / step) * step; }
function lerp(a, b, t) { return a + (b - a) * t; }
function curve(v, shape) { shape = shape || "linear"; if (shape === "exp") return v * v; if (shape === "log") return Math.sqrt(Math.max(0, v)); if (shape === "s") return v * v * (3 - 2 * v); return v; }
var __NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteName(n) { n = Math.floor(n); return __NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
function noteNumber(name) { var m = /^([A-G]#?)(-?\d+)$/.exec(name); if (!m) return 0; var i = __NOTES.indexOf(m[1]); return i < 0 ? 0 : (parseInt(m[2], 10) + 1) * 12 + i; }
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
)JS";

// Build the native "__api" object the prelude wraps.
juce::DynamicObject::Ptr makeApi (ScriptHostApi* host, const juce::String& owner)
{
    using Args = juce::var::NativeFunctionArgs;
    auto api = new juce::DynamicObject();
    juce::ignoreUnused (owner); // owner-relative resolution is applied via `self` in the prelude (future)

    auto arg = [] (const Args& a, int i) -> juce::var { return i < a.numArguments ? a.arguments[i] : juce::var(); };

    api->setMethod ("set", [host, arg] (const Args& a) -> juce::var
        { host->setValue (arg (a, 0).toString(), arg (a, 1), arg (a, 2)); return {}; });
    api->setMethod ("get", [host, arg] (const Args& a) -> juce::var
        { return host->getValue (arg (a, 0).toString(), arg (a, 1).toString()); });
    api->setMethod ("sendCC", [host, arg] (const Args& a) -> juce::var
        { host->sendCC ((int) arg (a, 0), (int) arg (a, 1), arg (a, 2)); return {}; });
    api->setMethod ("sendNRPN", [host, arg] (const Args& a) -> juce::var
        { host->sendNRPN ((int) arg (a, 0), (int) arg (a, 1), (int) arg (a, 2), arg (a, 3)); return {}; });
    api->setMethod ("sendSysex", [host, arg] (const Args& a) -> juce::var { host->sendSysex (arg (a, 0)); return {}; });
    api->setMethod ("requestDump", [host, arg] (const Args& a) -> juce::var { host->requestDump (arg (a, 0).toString()); return {}; });
    api->setMethod ("applyDump", [host, arg] (const Args& a) -> juce::var { host->applyDump (arg (a, 0)); return {}; });
    api->setMethod ("sendDump", [host, arg] (const Args& a) -> juce::var { host->sendDump (arg (a, 0).toString()); return {}; });
    api->setMethod ("buildDump", [host, arg] (const Args& a) -> juce::var { return host->buildDump (arg (a, 0).toString()); });
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
        eng->registerNativeObject ("__api", makeApi (host, def.owner).get());

        // Inject owner + prelude + the user source (or transpiled JS for TypeScript).
        juce::String boot = "var __owner = " + def.owner.quoted() + ";\n";
        auto r1 = eng->execute (boot + juce::String (kJsPrelude));
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
    std::map<juce::String, std::unique_ptr<juce::JavascriptEngine>> engines;
    ScriptHostApi* host = nullptr;
};

} // namespace

std::unique_ptr<ScriptEngine> createJsEngine() { return std::make_unique<JsScriptEngine>(); }

} // namespace ceditor::scripting
