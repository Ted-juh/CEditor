#include "ScriptRuntime.h"

#include <juce_events/juce_events.h>

#include "../DeviceProfile/ProfileChecksums.h"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <optional>

namespace ceditor::scripting
{

// Every public ScriptRuntime method must run on the JUCE message thread (see the header). This
// catches violations in debug builds. Headless tests without a MessageManager are exempt; in the
// app/plugin one always exists long before scripts load.
static void assertMessageThread()
{
    [[maybe_unused]] auto* mm = juce::MessageManager::getInstanceWithoutCreating();
    jassert (mm == nullptr || mm->isThisTheMessageThread());
}

ScriptDefinition ScriptDefinition::fromVar (const juce::var& v)
{
    ScriptDefinition d;
    if (auto* o = v.getDynamicObject())
    {
        d.id       = o->getProperty ("id").toString();
        d.name     = o->getProperty ("name").toString();
        d.language = o->getProperty ("language").toString();
        d.source   = o->getProperty ("source").toString();
        if (o->hasProperty ("compiledJs")) d.compiledSource = o->getProperty ("compiledJs").toString();
        d.scope    = o->getProperty ("scope").toString();
        d.event    = o->getProperty ("event").toString();
        d.owner    = o->getProperty ("target").toString(); // "target" in the JS model = the owner / "self"
        if (o->hasProperty ("owner")) d.owner = o->getProperty ("owner").toString();
        d.enabled  = ! o->hasProperty ("enabled") || (bool) o->getProperty ("enabled");
    }
    if (d.language.isEmpty()) d.language = "lua";
    if (d.scope.isEmpty())    d.scope = "component";
    return d;
}

// ----------------------------------------------------------------------------------------------

ScriptRuntime::ScriptRuntime (ScriptHostApi& h) : host (h)
{
    lua = createLuaEngine();
    js  = createJsEngine();
   #if CEDITOR_PYTHON
    python = createPythonEngine();   // real embedded CPython (full stdlib), window-closed only
   #endif
   #if CEDITOR_NATIVE_HANDLERS
    native = createNativeHandlerEngine(); // C++/C#/Java handlers compiled to native modules at export
   #endif
}

ScriptRuntime::~ScriptRuntime() = default;

ScriptEngine* ScriptRuntime::engineFor (const juce::String& language)
{
    // TypeScript ships as JS: the editor transpiles it to def.compiledSource, which the JS engine runs.
    if (language == "javascript" || language == "typescript") return js.get();
    if (language == "python")     return python.get(); // null if not built → python scripts no-op
    // C++/C#/Java are compiled to a native module at export and loaded by the native engine.
    if (language == "cpp" || language == "csharp" || language == "java") return native.get(); // null if not built → no-op
    return lua.get(); // default + "lua"
}

juce::StringArray ScriptRuntime::modulesFromPanel (const juce::var& panel)
{
    juce::StringArray out;
    auto* obj = panel.getDynamicObject();
    if (obj == nullptr) return out;
    auto scripting = obj->getProperty ("scripting");
    auto* s = scripting.getDynamicObject();
    if (s == nullptr) return out;
    if (auto* arr = s->getProperty ("modules").getArray())
        for (const auto& id : *arr)
            if (id.toString().isNotEmpty()) out.addIfNotAlreadyThere (id.toString());
    return out;
}

juce::var ScriptRuntime::extensionsFromPanel (const juce::var& panel)
{
    auto* obj = panel.getDynamicObject();
    if (obj == nullptr) return {};
    auto scripting = obj->getProperty ("scripting");
    auto* s = scripting.getDynamicObject();
    if (s == nullptr) return {};
    auto list = s->getProperty ("extensions");
    return list.isArray() ? list : juce::var();
}

void ScriptRuntime::setEnabledModules (const juce::StringArray& moduleIds)
{
    assertMessageThread();
    enabledModuleIds = moduleIds;
    applyModuleGates();
}

void ScriptRuntime::setExtensionModules (const juce::var& modules)
{
    assertMessageThread();
    extensionModules = modules;
    applyExtensionModules();
    applyModuleGates();   // a module that just arrived has to be gated like everything else
}

void ScriptRuntime::applyExtensionModules()
{
    if (! extensionModules.isArray()) return;
    if (lua)    lua->setExtensionModules (extensionModules);
    if (js)     js->setExtensionModules (extensionModules);
    if (python) python->setExtensionModules (extensionModules);
    if (native) native->setExtensionModules (extensionModules);
}

void ScriptRuntime::applyModuleGates()
{
    if (lua)    lua->setEnabledModules (enabledModuleIds);
    if (js)     js->setEnabledModules (enabledModuleIds);
    if (python) python->setEnabledModules (enabledModuleIds);
    if (native) native->setEnabledModules (enabledModuleIds);
}

// --- ce.anim ------------------------------------------------------------------------------------
// The position is a PURE FUNCTION of elapsed time. That is the whole design: the WebView runtime
// evaluates the same two formulas, so an animation started in the editor and an animation started
// in the shipped plugin pass through identical values at identical moments. An incremental
// integrator would have been easier to write and impossible to hold to that.

// BEGIN GENERATED animation tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// The Properties panel's named easings, as the cubic-bezier control points it stores. Generated so
// the host engine, the three preludes and the WebView all animate along ONE set of numbers.
static const std::map<juce::String, std::array<double, 4>>& animEasings()
{
    static const std::map<juce::String, std::array<double, 4>> table = {
    { "inQuad", { 0.550000, 0.085000, 0.680000, 0.530000 } },
    { "outQuad", { 0.250000, 0.460000, 0.450000, 0.940000 } },
    { "inOutQuad", { 0.455000, 0.030000, 0.515000, 0.955000 } },
    { "inCubic", { 0.550000, 0.055000, 0.675000, 0.190000 } },
    { "outCubic", { 0.215000, 0.610000, 0.355000, 1.000000 } },
    { "inOutCubic", { 0.645000, 0.045000, 0.355000, 1.000000 } },
    { "inBack", { 0.600000, -0.280000, 0.735000, 0.045000 } },
    { "outBack", { 0.175000, 0.885000, 0.320000, 1.275000 } },
    { "inOutBack", { 0.680000, -0.550000, 0.265000, 1.550000 } },
    };
    return table;
}
// An envelope is sampled into this many segments before it is handed to the engine; the same
// number in every runtime is what makes the sampled shape identical rather than merely similar.
static constexpr int kAnimSamples = 1024;
// END GENERATED animation tables

double ScriptRuntime::cubicBezierEase (double t, double x1, double y1, double x2, double y2)
{
    const double x = juce::jlimit (0.0, 1.0, t);
    if (x1 == y1 && x2 == y2) return x;        // the identity curve is a straight line
    if (x <= 0.0) return 0.0;
    if (x >= 1.0) return 1.0;

    auto at = [] (double s, double a, double b)
    { return (((1.0 - 3.0 * b + 3.0 * a) * s + (3.0 * b - 6.0 * a)) * s + (3.0 * a)) * s; };
    auto slope = [] (double s, double a, double b)
    { return 3.0 * (1.0 - 3.0 * b + 3.0 * a) * s * s + 2.0 * (3.0 * b - 6.0 * a) * s + 3.0 * a; };

    // Newton-Raphson on the x polynomial, then bisection to finish. Newton alone wanders where the
    // slope is near zero (an ease-out's tail); bisection alone is slow. FIXED counts, because four
    // runtimes have to land on the same double.
    double s = x;
    for (int i = 0; i < 8; ++i)
    {
        const double d = slope (s, x1, x2);
        if (d == 0.0) break;
        s -= (at (s, x1, x2) - x) / d;
    }
    if (! (s >= 0.0) || ! (s <= 1.0))
    {
        double lo = 0.0, hi = 1.0;
        s = x;
        for (int i = 0; i < 24; ++i)
        {
            if (at (s, x1, x2) < x) lo = s; else hi = s;
            s = (lo + hi) / 2.0;
        }
    }
    return at (s, y1, y2);
}

double ScriptRuntime::animationEase (double progress, const juce::String& curve, bool* known)
{
    const double v = juce::jlimit (0.0, 1.0, progress);
    if (known != nullptr) *known = true;
    // The four shapes ce.math.curve() offers, computed the same way, so an author who knows one
    // knows the other.
    if (curve.isEmpty() || curve == "linear") return v;
    if (curve == "exp") return v * v;
    if (curve == "log") return std::sqrt (v);
    if (curve == "s")   return v * v * (3.0 - 2.0 * v);
    // …and the Properties panel's, as the beziers the panel actually stores. A lookalike formula
    // would be a second curve wearing the same name, and the author would have no way to tell.
    const auto& table = animEasings();
    const auto it = table.find (curve);
    if (it != table.end()) return cubicBezierEase (v, it->second[0], it->second[1], it->second[2], it->second[3]);
    // The Animation tab's spring, at its default feel: the same formula ce.anim.spring uses, so
    // curve = "spring" on ce.anim.to and ce.anim.spring are one motion. A spring's own damping and
    // frequency come from the animation's opts, which this function does not see.
    if (curve == "spring") return animationSpring (v, 6.0, 12.0);
    if (known != nullptr) *known = false;
    return v;
}

bool ScriptRuntime::drawnCurve (const juce::var& value, std::array<double, 4>& out)
{
    juce::Array<juce::var> list;
    if (auto* arr = value.getArray())
        list = *arr;
    else if (auto* obj = value.getDynamicObject())
    {
        // Named keys are read by name; a Lua table's pairs have no order to read them in.
        if (! obj->hasProperty ("x1")) return false;
        for (const char* key : { "x1", "y1", "x2", "y2" })
            list.add (obj->getProperty (key));
    }
    if (list.size() != 4) return false;
    for (int i = 0; i < 4; ++i)
    {
        const auto& v = list.getReference (i);
        if (! (v.isDouble() || v.isInt() || v.isInt64())) return false;
        out[(size_t) i] = (double) v;
        if (! std::isfinite (out[(size_t) i])) return false;
    }
    if (out[0] < 0.0 || out[0] > 1.0 || out[2] < 0.0 || out[2] > 1.0) return false;
    if (out[1] < -2.0 || out[1] > 3.0 || out[3] < -2.0 || out[3] > 3.0) return false;
    return true;
}

double ScriptRuntime::animationSpring (double progress, double damping, double frequency)
{
    const double x = juce::jlimit (0.0, 1.0, progress);
    if (x >= 1.0) return 1.0;   // pinned, so a spring ALWAYS finishes exactly on its target
    return 1.0 - std::exp (-damping * x) * std::cos (frequency * x);
}

double ScriptRuntime::animationBeatsNow()
{
    const auto t = host.transportState();
    if (auto* o = t.getDynamicObject())
        if (o->hasProperty ("valid") && (bool) o->getProperty ("valid"))
            return (double) o->getProperty ("beats");
    return 0.0;
}

double ScriptRuntime::animationProgressOf (const Animation& a, double nowMs, double beats) const
{
    if (a.paused) return a.heldProgress;
    if (a.sync)
    {
        const double span = a.syncBeats > 0.0 ? a.syncBeats : 1.0;
        return juce::jlimit (0.0, 1.0, (beats - a.startBeats) / span);
    }
    return juce::jlimit (0.0, 1.0, (nowMs - a.startMs) / a.duration);
}

double ScriptRuntime::animationValueOf (const Animation& a, double progress) const
{
    if (a.kind == "envelope")
    {
        // The shape was SAMPLED by the prelude with ce.math.map — the Envelope component's own
        // lookup — and is read linearly between samples here. Sampling is what lets this engine run
        // an envelope at all: map()'s per-point curves live in the preludes, and the alternative
        // was a fifth implementation of them in this file.
        if (a.samples.empty()) return a.from;
        const double x = juce::jlimit (0.0, 1.0, progress) * (double) (a.samples.size() - 1);
        const auto i = (size_t) std::floor (x);
        const double shaped = (i >= a.samples.size() - 1)
            ? a.samples.back()
            : a.samples[i] + (a.samples[i + 1] - a.samples[i]) * (x - (double) i);
        return a.from + (a.to - a.from) * shaped;
    }
    const double eased = (a.kind == "spring" || a.curve == "spring")
                             ? animationSpring (progress, a.damping, a.frequency)
                             : a.hasBezier ? cubicBezierEase (progress, a.bezier[0], a.bezier[1], a.bezier[2], a.bezier[3])
                                           : animationEase (progress, a.curve);
    return a.from + (a.to - a.from) * eased;
}

// The completion callback lives in the SCRIPT, so the host cannot call it: it emits, and each
// prelude routes the emit to the function it stored. Exactly how after()'s one-shot already works,
// and the reason `done` can be a plain function argument in every language.
//
// The emit is { token, completed }: the token the prelude gave the move when it stored its done
// (`__done` in the options), and the prelude calls done(completed) with that boolean alone, as the
// contract says and the WebView's fireAnimationDone does. It used to hand the script this table,
// { path, completed } or { paths, completed }, and a table is always true, so `if completed then`
// read a cancelled move as a finished one. A move started without a done has no token and emits
// nothing.
//
// The token is the prelude's, and is never the same twice in one script set: each prelude counts
// its own and names its engine ("lua:3", "js:3", and "py:<script id>:3", since every Python script
// runs a prelude of its own). The emit used to carry the PATH, or for a list a group number counted
// here, and each prelude looked the function up by that. A path is not one move: replacing a move
// with one that had a done of its own stored the new function first, so the replaced move's emit
// called the NEW one with false, and the replaced one's never ran; and a path animated from two
// scripts found both functions. The group number was counted here and in each prelude separately,
// so as soon as two scripts, or a Lua and a JavaScript one, started a list, they disagreed: a list's
// done ran when another list ended, or never.
//
// A prelude counts from 1 again whenever the script set is loaded (loadScripts rebuilds it), and a
// move can outlive the set that started it. Its done went with that set, so a move started before
// the last load emits nothing, rather than calling whatever the new set stored under its token.
void ScriptRuntime::fireAnimationDone (const Animation& a, bool completed)
{
    juce::String token = a.doneToken;
    if (a.groupId != 0)
    {
        const auto it = animationGroups.find (a.groupId);
        if (it == animationGroups.end()) return;
        it->second.remaining -= 1;
        if (! completed) it->second.completed = false;
        if (it->second.remaining > 0) return;
        token = it->second.token;
        completed = it->second.completed;
        animationGroups.erase (it);
    }
    if (token.isEmpty() || a.scriptSet != animationScriptSet) return;
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("token", token);
    obj->setProperty ("completed", completed);
    host.emitEvent ("__animDone", juce::var (obj));
}

juce::var ScriptRuntime::animationDescribe (const Animation& a) const
{
    auto* obj = new juce::DynamicObject();
    const double progress = animationProgressOf (a, animationNowMs, 0.0);
    obj->setProperty ("path", a.path);
    obj->setProperty ("kind", a.kind);
    obj->setProperty ("value", animationValueOf (a, progress));
    obj->setProperty ("progress", progress);
    obj->setProperty ("from", a.from);
    obj->setProperty ("to", a.to);
    // Void for a synced animation: how long it has left depends on a tempo nobody has played yet,
    // and a number invented from the current one would be wrong the moment the tempo moved.
    if (! a.sync)
    {
        obj->setProperty ("elapsed", a.duration * progress);
        obj->setProperty ("remaining", juce::jmax (0.0, a.duration * (1.0 - progress)));
    }
    obj->setProperty ("paused", a.paused);
    obj->setProperty ("cycle", a.cycle);
    obj->setProperty ("sync", a.sync);
    return juce::var (obj);
}

// A number, or text that is one, as the WebView's realNumber reads it ("3", " -1 ", "2e1", ".5");
// anything else, true and nothing included, is no number. A plain (double) cast reads "abc",
// nothing and false as 0, and "1/4" as 1, which is how a duration of "1/4" became a 1 ms jump here
// while the WebView moved it in its default 300.
static bool animationNumber (const juce::var& v, double& out)
{
    if (v.isInt() || v.isInt64() || v.isDouble())
    {
        out = (double) v;
        return std::isfinite (out);
    }
    if (! v.isString()) return false;
    const auto t = v.toString().trim();
    int i = 0, digits = 0;
    if (t[i] == '+' || t[i] == '-') ++i;
    while (juce::CharacterFunctions::isDigit (t[i])) { ++i; ++digits; }
    if (t[i] == '.') { ++i; while (juce::CharacterFunctions::isDigit (t[i])) { ++i; ++digits; } }
    if (digits == 0) return false;
    if (t[i] == 'e' || t[i] == 'E')
    {
        ++i;
        if (t[i] == '+' || t[i] == '-') ++i;
        if (! juce::CharacterFunctions::isDigit (t[i])) return false;
        while (juce::CharacterFunctions::isDigit (t[i])) ++i;
    }
    if (i != t.length()) return false;
    out = t.getDoubleValue();
    return std::isfinite (out);
}

// How many times a move runs IN ALL, from its `repeat` option, as the WebView's startAnimationImpl
// reads it: a number, or text that is one; anything else, or no option, is the default single run.
// A plain (double) cast would read "abc", nothing and false as 0, and 0 means until stopped.
static double animationRuns (const juce::DynamicObject* o)
{
    if (o == nullptr || ! o->hasProperty ("repeat")) return 1.0;
    double d = 0.0;
    return animationNumber (o->getProperty ("repeat"), d) ? d : 1.0;
}

// A value in a warning, as the WebView's shownValue writes it.
static juce::String animationShown (const juce::var& v)
{
    if (v.isVoid() || v.isUndefined()) return "nothing";
    if (v.isBool()) return static_cast<bool> (v) ? "true" : "false";
    if (v.isInt() || v.isInt64()) return juce::String (static_cast<juce::int64> (v));
    if (v.isDouble())
    {
        const double d = v;
        if (std::isnan (d)) return "NaN";
        if (std::isinf (d)) return d > 0 ? "Infinity" : "-Infinity";
        if (d == std::floor (d) && std::abs (d) < 9007199254740992.0) return juce::String (static_cast<juce::int64> (d));
        return juce::String (d);
    }
    if (v.isString()) return "\"" + v.toString() + "\"";
    if (v.isMethod()) return "a function";
    return "a list";
}

ScriptRuntime::Animation* ScriptRuntime::animationFor (const juce::String& path)
{
    for (auto& a : animations) if (a.path == path) return &a;
    return nullptr;
}

bool ScriptRuntime::startAnimation (const juce::String& kind, const juce::var& path,
                                    double target, const juce::var& opts)
{
    assertMessageThread();

    auto* o = opts.getDynamicObject();
    auto flag = [o] (const char* key)
    { return o != nullptr && o->hasProperty (key) && (bool) o->getProperty (key); };

    // A colour property is not moved: every tick would write a number into it, and set() refuses
    // each. Said in the words of the WebView runtime's animatesColour. The preludes have already
    // refused a target that is not a number, which comes first.
    const juce::String verb = kind == "spring" ? "spring" : (kind == "envelope" ? "envelope" : "to");
    const juce::String call = "ce.anim." + verb;

    // A move's timing, as the WebView's animTiming and animBeats read it: a number, or text that is
    // one. A duration or a delay that cannot be read, or is below 0, and beats that are not a number
    // above 0, are said once per command, and the move goes ahead as it always did: a duration in
    // its default time, or 1 ms below 0; a delay of none; the length its duration gives.
    auto warnTiming = [this, &call] (const char* name, const juce::String& said)
    {
        if (animationTimingWarned.insert (call + " " + name).second)
            host.logAt ("warn", call + ": " + said + " This is said only the first time.", juce::var());
    };
    auto timing = [o, &warnTiming] (const char* name, double fallback)
    {
        if (o == nullptr || ! o->hasProperty (name)) return fallback;
        const auto v = o->getProperty (name);
        if (v.isVoid() || v.isUndefined()) return fallback;
        const bool duration = juce::String (name) == "duration";
        double n = 0.0;
        if (! animationNumber (v, n))
        {
            const bool beatsLike = duration && v.isString() && v.toString().containsChar ('/');
            warnTiming (name, animationShown (v) + " is not a number of milliseconds, so the move "
                                + (duration ? "takes " + juce::String (juce::roundToInt (fallback)) + " ms, as it does when no duration is given."
                                            : juce::String ("starts at once, as it does when no delay is given."))
                                + (beatsLike ? " For a length in beats, give beats, a number." : ""));
            return fallback;
        }
        if (n < 0.0)
        {
            warnTiming (name, "a " + juce::String (name) + " of " + animationShown (juce::var (n)) + " is less than 0, so the move "
                                + (duration ? "takes 1 ms: it jumps." : "starts at once."));
            return duration ? 1.0 : 0.0;
        }
        return n;
    };
    // stagger, damping and frequency, as the WebView's animOption reads them: what is not a number
    // is said, and the default used. A number below 0 is used as it is.
    auto option = [o, &warnTiming] (const char* name, double fallback, const juce::String& words)
    {
        if (o == nullptr || ! o->hasProperty (name)) return fallback;
        const auto v = o->getProperty (name);
        if (v.isVoid() || v.isUndefined()) return fallback;
        double n = 0.0;
        if (animationNumber (v, n)) return n;
        warnTiming (name, animationShown (v) + " is " + words);
        return fallback;
    };
    auto beatsOf = [o, &warnTiming]() -> double
    {
        if (o == nullptr || ! o->hasProperty ("beats")) return 0.0;
        const auto v = o->getProperty ("beats");
        if (v.isVoid() || v.isUndefined()) return 0.0;
        double n = 0.0;
        if (! animationNumber (v, n))
            warnTiming ("beats", animationShown (v) + " is not a number of beats, so the move's length is its duration.");
        else if (n <= 0.0)
            warnTiming ("beats", animationShown (juce::var (n)) + " beats is not more than 0, so the move's length is its duration.");
        else return n;
        return 0.0;
    };
    // A control the panel does not have, said in the words of the WebView's animatesNoControl.
    // The move used to start: it answered true, every tick's write was refused, and done was
    // called with true at the end.
    auto refusesMissing = [this, &verb] (const juce::String& key)
    {
        if (! host.namesMissingControl (key)) return false;
        host.logAt ("error", "ce.anim." + verb + ": control \"" + key.upToFirstOccurrenceOf (".", false, false)
                             + "\" not found on the active panel, so nothing was started.", juce::var());
        return true;
    };
    auto refusesColour = [this, &verb] (const juce::String& key)
    {
        if (! host.isColourProperty (key)) return false;
        host.logAt ("error", "ce.anim." + verb + ": \"" + key + "\" is a colour, and ce.anim moves numbers, so nothing "
                             "was started.", juce::var());
        return true;
    };

    // A `done` that is not a function: the preludes own the functions and strip `done` before the
    // call, so they pass one that is not a function on as __badDone, and it is said here, once,
    // as the WebView's animDone says it. It was dropped without a word.
    if (o != nullptr && o->hasProperty ("__badDone"))
        warnTiming ("done", animationShown (o->getProperty ("__badDone")) + " is not a function, so nothing is called when the move ends.");

    // A LIST of paths is one call, one shape, one completion — and `stagger` is why the list is
    // worth having rather than a loop at the call site.
    if (auto* list = path.getArray())
    {
        juce::StringArray paths;
        for (const auto& p : *list) { const auto str = p.toString(); if (str.isNotEmpty()) paths.add (str); }
        if (paths.isEmpty())
        {
            host.logAt ("error", "ce.anim." + verb + ": the list has no paths, so nothing was started.", juce::var());
            return false;
        }

        // A colour among them, or a control the panel does not have, refuses the whole call, each
        // one named, and nothing starts, as the WebView's startAnimationImpl refuses it. The colour
        // alone was refused and the rest moved, and the list's done waited for a path that never
        // started, so it was never called.
        bool refused = false;
        for (const auto& p : paths) refused = refusesMissing (p) || refusesColour (p) || refused;
        if (refused) return false;

        double stagger = option ("stagger", 0.0, "not a number of milliseconds, so the moves start together, as they do when no stagger is given.");
        if (stagger < 0.0)
        {
            // Each path's delay went below 0, held at 0 and said as a delay; it is 0 now, and said
            // as a stagger, as the WebView's animOption says it.
            warnTiming ("stagger", "a stagger of " + animationShown (juce::var (stagger))
                                   + " is less than 0, so the moves start together, as they do when no stagger is given.");
            stagger = 0.0;
        }
        const double baseDelay = juce::jmax (0.0, timing ("delay", 0.0));
        int groupId = 0;
        if (const auto token = o != nullptr ? o->getProperty ("__done").toString() : juce::String(); token.isNotEmpty())
        {
            animationGroupSeq += 1;
            groupId = animationGroupSeq;
            AnimationGroup g;
            g.remaining = paths.size();
            g.token = token;
            animationGroups[groupId] = g;
        }
        for (int i = 0; i < paths.size(); ++i)
        {
            auto* each = o != nullptr ? new juce::DynamicObject (*o) : new juce::DynamicObject();
            each->setProperty ("delay", baseDelay + stagger * (double) i);
            each->removeProperty ("__done");   // the list's, not each path's
            each->removeProperty ("__badDone");   // said once above
            each->setProperty ("__group", groupId);
            startAnimation (kind, juce::var (paths[i]), target, juce::var (each));
        }
        return true;
    }

    const auto key = path.toString();
    if (key.isEmpty())
    {
        // An empty path used to answer false without a word. The preludes pass a missing one
        // (nil, undefined, None) as empty, not as the text "nil".
        host.logAt ("error", "ce.anim." + verb + ": no path was given, so nothing was started.", juce::var());
        return false;
    }

    // Asked here, where every engine's ce.anim arrives, a list's paths after the list has been
    // asked. Nothing starts, so nothing ends and no done is called, as in the WebView.
    if (refusesMissing (key) || refusesColour (key)) return false;

    Animation a;
    a.kind = verb;
    a.path = key;
    a.groupId = (o != nullptr && o->hasProperty ("__group")) ? (int) o->getProperty ("__group") : 0;
    if (o != nullptr) a.doneToken = o->getProperty ("__done").toString();
    a.scriptSet = animationScriptSet;

    // A curve that cannot be used is said once per command, as every other option is (warnTiming),
    // and the move is linear. It was a line on every call, and a curve that was neither a name nor
    // numbers (curve = 5) was linear without a word. The WebView's startAnimationImpl says the same.
    const auto curveVar = o != nullptr ? o->getProperty ("curve") : juce::var();
    if (curveVar.isArray() || curveVar.isObject())
    {
        // A curve drawn by hand — four numbers, see drawnCurve — which is how a script moves along
        // the same custom curve an animation in the Animation tab uses.
        a.hasBezier = drawnCurve (curveVar, a.bezier);
        if (a.hasBezier) a.curve = "custom";
        else warnTiming ("curve", juce::String (juce::CharPointer_UTF8 ("a drawn curve is four numbers, x1, y1, x2, y2 (a list, or named), "
                                                                        "with x1 and x2 between 0 and 1 — animating linear.")));
    }
    else if (curveVar.isString())
    {
        const auto name = curveVar.toString();
        bool known = true;
        animationEase (0.5, name, &known);
        // An unknown curve REPORTS rather than silently animating linear. "outCubic" is a name the
        // Properties panel offers three feet away, and it was linear here in every runtime.
        if (! known) warnTiming ("curve", "\"" + name + juce::String (juce::CharPointer_UTF8 ("\" is not a curve this build knows — animating linear.")));
        else a.curve = name;
    }
    else if (! curveVar.isVoid() && ! curveVar.isUndefined())
    {
        warnTiming ("curve", animationShown (curveVar) + juce::String (juce::CharPointer_UTF8 (" is not a curve: a name, or four numbers, x1, y1, x2, y2 — animating linear.")));
    }

    if (a.kind == "envelope")
        if (auto* pts = (o != nullptr ? o->getProperty ("samples").getArray() : nullptr))
            for (const auto& v : *pts) a.samples.push_back ((double) v);

    const double defaultMs = a.kind == "spring" ? 600.0 : 300.0;
    a.duration = juce::jmax (1.0, timing ("duration", defaultMs));
    a.damping = option ("damping", 6.0, "not a number, so the spring's damping is 6, as it is when none is given.");
    if (a.damping < 0.0)
    {
        // Below 0 the spring grows instead of settling (a move from 0 to 100 at -2 is at -161
        // halfway), so it is the default, and said, as the WebView's animOption says it.
        warnTiming ("damping", "a damping of " + animationShown (juce::var (a.damping))
                               + " is less than 0, so the spring would grow instead of settling: its damping is 6, as it is when none is given.");
        a.damping = 6.0;
    }
    a.frequency = option ("frequency", 12.0, "not a number, so the spring's frequency is 12, as it is when none is given.");
    a.delay = juce::jmax (0.0, timing ("delay", 0.0));
    a.pingpong = flag ("pingpong");
    // `repeat` is how many times the move runs in all: 1 (the default) once, 3 three times, 0 or
    // less until it is stopped, rounded to a whole number. This read it as runs AFTER the first, so
    // repeat = 1 ran twice and repeat = 0 once, where the contract always said otherwise. Held as
    // the runs left after this one, -1 for until stopped; clamped first, because llround of a number
    // past what it can hold is undefined.
    // A repeat that is not a number of runs is said, and the move runs once (animationRuns).
    if (o != nullptr && o->hasProperty ("repeat"))
    {
        const auto v = o->getProperty ("repeat");
        double n = 0.0;
        if (! v.isVoid() && ! v.isUndefined() && ! animationNumber (v, n))
            warnTiming ("repeat", animationShown (v) + " is not a number of runs, so the move runs once, as it does when no repeat is given.");
    }
    const auto runs = std::llround (juce::jlimit (-1.0, 2147483647.0, animationRuns (o)));
    a.repeat = runs <= 0 ? -1 : (int) (runs - 1);

    // `beats` gives the duration a musical length; `sync` is the stronger thing — the position is
    // derived from the transport's beat count, so the animation FREEZES when the transport stops
    // and stretches when the tempo drops, which is what every synced component in the panel does.
    a.sync = flag ("sync");
    const double beats = beatsOf();
    if (beats > 0.0)
    {
        a.syncBeats = beats;
        if (const auto ms = beatsToMs (beats); ms > 0.0) a.duration = juce::jmax (1.0, ms);
    }
    else if (a.sync)
    {
        const double bpm = transportBpm();
        a.syncBeats = bpm > 0.0 ? (a.duration * bpm / 60000.0) : 1.0;
    }

    // Nothing has ticked yet on a freshly constructed runtime, so seed the origin from the same
    // clock the host ticks with — otherwise the first animation measures against zero and is
    // already finished by its first tick. The WebView runtime does exactly this.
    if (! animationTicked) { animationNowMs = (double) juce::Time::getMillisecondCounterHiRes(); animationTicked = true; }
    a.startMs = animationNowMs + a.delay;
    a.startBeats = animationBeatsNow();
    if (a.sync && a.delay > 0.0)
    {
        const double bpm = transportBpm();
        if (bpm > 0.0) a.startBeats += a.delay * bpm / 60000.0;
    }

    // `from` defaults to where the value IS, so an animation always starts from the truth rather
    // than from wherever the last one happened to end. A number, or text that is one
    // (animationNumber), or after saying why not, that default: the (double) cast read "abc" as 0
    // and true as 1, in silence. As the WebView's startAnimationImpl reads it.
    bool fromGiven = false;
    if (o != nullptr && o->hasProperty ("from"))
    {
        const auto v = o->getProperty ("from");
        if (! v.isVoid() && ! v.isUndefined())
        {
            double n = 0.0;
            if (animationNumber (v, n)) { a.from = n; fromGiven = true; }
            else warnTiming ("from", animationShown (v) + " is not a number, so the move starts from the value as it is now, as it does when no from is given.");
        }
    }
    if (! fromGiven) a.from = (double) host.getValue (key, "value");
    if (! std::isfinite (a.from)) a.from = 0.0;
    a.to = target;

    stopAnimation (key);   // a value has one destination, and the replaced one did not finish
    animations.push_back (a);
    return true;
}

double ScriptRuntime::transportBpm()
{
    const auto t = host.transportState();
    if (auto* o = t.getDynamicObject())
    {
        const double bpm = (double) o->getProperty ("bpm");
        if (std::isfinite (bpm) && bpm > 0.0) return bpm;
    }
    return 0.0;
}

double ScriptRuntime::beatsToMs (double beats)
{
    const double bpm = transportBpm();
    return bpm > 0.0 ? beats * 60000.0 / bpm : 0.0;
}

void ScriptRuntime::stopAnimation (const juce::String& path)
{
    if (path.isEmpty())
    {
        const auto snapshot = animations;
        animations.clear();
        for (const auto& a : snapshot) fireAnimationDone (a, false);
        return;
    }
    for (size_t i = 0; i < animations.size(); ++i)
    {
        if (animations[i].path != path) continue;
        const auto copy = animations[i];
        animations.erase (animations.begin() + (long) i);
        fireAnimationDone (copy, false);
        return;
    }
}

bool ScriptRuntime::animationRunning (const juce::String& path) const
{
    if (path.isEmpty()) return ! animations.empty();
    for (const auto& a : animations) if (a.path == path) return true;
    return false;
}

juce::var ScriptRuntime::animationValue (const juce::String& path) const
{
    for (const auto& a : animations) if (a.path == path) return animationDescribe (a);
    return {};
}

juce::var ScriptRuntime::animationList() const
{
    juce::StringArray order;
    for (const auto& a : animations) order.add (a.path);
    order.sort (false);
    juce::Array<juce::var> out;
    for (const auto& p : order) out.add (animationValue (p));
    return juce::var (out);
}

bool ScriptRuntime::animationPause (const juce::String& path)
{
    auto* a = animationFor (path);
    if (a == nullptr || a->paused) return false;
    a->heldProgress = animationProgressOf (*a, animationNowMs, animationBeatsNow());
    a->paused = true;
    return true;
}

bool ScriptRuntime::animationResume (const juce::String& path)
{
    auto* a = animationFor (path);
    if (a == nullptr || ! a->paused) return false;
    // Re-anchor so the held progress reads the same at the moment of resuming: it carries on rather
    // than restarting, which is the whole difference from stop-and-start-again.
    a->startMs = animationNowMs - a->heldProgress * a->duration;
    a->startBeats = animationBeatsNow() - a->heldProgress * (a->syncBeats > 0.0 ? a->syncBeats : 1.0);
    a->paused = false;
    return true;
}

bool ScriptRuntime::animationReverse (const juce::String& path)
{
    auto* a = animationFor (path);
    if (a == nullptr) return false;
    const double progress = animationProgressOf (*a, animationNowMs, animationBeatsNow());
    std::swap (a->from, a->to);
    // An envelope reverses its SHAPE as well as its direction.
    std::reverse (a->samples.begin(), a->samples.end());
    a->heldProgress = 1.0 - progress;
    a->startMs = animationNowMs - (1.0 - progress) * a->duration;
    a->startBeats = animationBeatsNow() - (1.0 - progress) * (a->syncBeats > 0.0 ? a->syncBeats : 1.0);
    return true;
}

bool ScriptRuntime::animationFinish (const juce::String& path)
{
    auto* a = animationFor (path);
    if (a == nullptr) return false;
    const auto copy = *a;
    host.setValue (copy.path, juce::var (animationValueOf (copy, 1.0)), juce::var());
    for (size_t i = 0; i < animations.size(); ++i)
        if (animations[i].path == path) { animations.erase (animations.begin() + (long) i); break; }
    fireAnimationDone (copy, true);
    return true;
}

void ScriptRuntime::tickAnimations (double nowMs)
{
    animationNowMs = nowMs;
    animationTicked = true;
    if (animations.empty()) return;

    const double beats = animationBeatsNow();
    // Iterate a copy: a set() can run a script that starts or stops an animation, and mutating the
    // list mid-walk is how that turns into a dangling iterator.
    const auto snapshot = animations;
    for (const auto& a : snapshot)
    {
        if (a.paused) continue;
        auto* live = animationFor (a.path);
        if (live == nullptr) continue;            // stopped or replaced mid-walk

        const double progress = animationProgressOf (*live, nowMs, beats);
        host.setValue (a.path, juce::var (animationValueOf (*live, progress)), juce::var());
        if (progress < 1.0) continue;

        live = animationFor (a.path);
        if (live == nullptr) continue;            // the set() above removed it

        if (live->repeat != 0)
        {
            if (live->repeat > 0) live->repeat -= 1;
            live->cycle += 1;
            // ping-pong swaps the ends so the NEXT cycle comes back — the only way to express a
            // continuous modulator without a second verb that means the same thing.
            if (live->pingpong) { std::swap (live->from, live->to); }
            live->startMs = nowMs;
            live->startBeats = beats;
            continue;
        }
        const auto copy = *live;
        for (size_t i = 0; i < animations.size(); ++i)
            if (animations[i].path == copy.path) { animations.erase (animations.begin() + (long) i); break; }
        fireAnimationDone (copy, true);
    }
}

void ScriptRuntime::reportError (const juce::String& scriptId, const juce::String& message)
{
    // The log ALWAYS happens. onError is in addition to it, never instead of it — a panel whose
    // error handler is itself broken must not go silent.
    auto line = "[script " + scriptId + "] " + message;
    if (errorLogger) errorLogger (line);
    else juce::Logger::writeToLog (line);

    if (deferErrors) { deferredErrors.emplace_back (scriptId, message); return; }
    dispatchErrorHook (scriptId, message, "dispatch");
}

void ScriptRuntime::dispatchErrorHook (const juce::String& scriptId, const juce::String& message,
                                       const juce::String& phase)
{
    if (inErrorHook) return;   // an error inside onError is logged and stops there

    // Name the failing script, so the handler can say WHICH one rather than quote an opaque id.
    // A script that failed to LOAD is not in `scripts` at all — it is in `failed` — so both are
    // searched, and `event` is always present (empty when unknown) rather than sometimes absent.
    juce::String name = scriptId, event;
    bool named = false;
    for (const auto& s : scripts)
        if (s.id == scriptId) { if (s.name.isNotEmpty()) name = s.name; event = s.event; named = true; break; }
    if (! named)
        for (const auto& f : failed)
            if (f.id == scriptId) { if (f.name.isNotEmpty()) name = f.name; break; }

    auto* info = new juce::DynamicObject();
    info->setProperty ("scriptId", scriptId);
    info->setProperty ("script", name);
    info->setProperty ("event", event);
    info->setProperty ("phase", phase);
    info->setProperty ("message", message);
    // ONE var for the whole loop. Constructing juce::var(info) per iteration would let the first
    // temporary take — and then drop — the only reference, deleting the object under the loop.
    const juce::var payload (info);

    inErrorHook = true;
    for (const auto& def : scripts)
    {
        auto* eng = engineFor (def.language);
        if (eng == nullptr || ! eng->hasHandler (def.id, "onError")) continue;
        const ScriptErrorSink swallow = [this] (const juce::String& id, const juce::String& msg)
        {
            // Reported, never re-dispatched: this IS the error path.
            auto l = "[script " + id + "] (in onError) " + msg;
            if (errorLogger) errorLogger (l); else juce::Logger::writeToLog (l);
        };
        host.enterScript (def.context());
        eng->dispatch (def.id, "onError", payload, swallow);
        host.exitScript();
    }
    inErrorHook = false;
}

void ScriptRuntime::loadScripts (const juce::var& scriptArray)
{
    assertMessageThread();

    // The outgoing set is being torn down, so tell it — while it still has engines, timers and
    // state to say goodbye with. This is what makes onPanelDestroy fire on a panel switch and on
    // a script-set reload, not only at shutdown, without every host having to remember to call it.
    onPanelDestroy();
    // A move the outgoing set started may still be running, and its done is about to go with the
    // set's preludes. See fireAnimationDone.
    animationScriptSet += 1;
    animationTimingWarned.clear();

    scripts.clear();
    // Runtime device declarations belong to the script set that made them: a parameter declared by
    // the panel being torn down would otherwise answer parameters() for the panel replacing it, and
    // a reload would stack a second copy of every declaration the same script makes again.
    deviceDeclarations.clear();
    if (lua)    lua->reset();
    if (js)     js->reset();
    if (python) python->reset();
    if (native) native->reset();

    // Install the API into each engine once.
    if (lua)    lua->installApi (host);
    if (js)     js->installApi (host);
    if (python) python->installApi (host);
    if (native) native->installApi (host);

    // Then, in this order and for a reason: installApi is what (re)builds the prelude, so the
    // extensions have to be re-installed on top of the fresh prelude, and only then can the gate
    // be applied — a module that is not installed cannot be enabled, and both have to be settled
    // BEFORE any script's top-level code runs.
    applyExtensionModules();
    applyModuleGates();

    failed.clear();

    // Hold load errors until every script is loaded. A script that fails to compile FIRST would
    // otherwise be reported to an onError handler that does not exist yet — which is precisely
    // when a panel most wants to be told.
    deferErrors = true;
    deferredErrors.clear();

    if (auto* arr = scriptArray.getArray())
    {
        for (auto& item : *arr)
        {
            auto def = ScriptDefinition::fromVar (item);
            if (! def.enabled) continue;

            auto* eng = engineFor (def.language);
            if (eng == nullptr)
            {
                auto msg = "language '" + def.language + "' is not available in this build — script is inactive";
                failed.push_back ({ def.id, def.name, def.language, msg });
                reportError (def.id, msg);
                continue;
            }

            // Capture the engine's load-error detail so failedScripts() can carry it to the UI.
            juce::String loadError;
            const ScriptErrorSink onLoadError = [this, &loadError] (const juce::String& id, const juce::String& msg)
            {
                loadError = msg;
                reportError (id, msg);
            };

            if (eng->loadScript (def, onLoadError))
                scripts.push_back (def);
            else
                failed.push_back ({ def.id, def.name, def.language,
                                    loadError.isNotEmpty() ? loadError : juce::String ("failed to load") });
        }
    }

    deferErrors = false;
    const auto pending = std::move (deferredErrors);
    deferredErrors.clear();
    for (const auto& [id, message] : pending) dispatchErrorHook (id, message, "load");

    // Armed only if something actually loaded. Loading nothing has nothing to destroy, and firing
    // a destroy for an empty set would make "exactly once per loaded set" a lie.
    destroyPending = ! scripts.empty();
}

void ScriptRuntime::dispatchTo (const ScriptDefinition& def, const juce::String& fn, const juce::var& payload)
{
    auto* eng = engineFor (def.language);
    if (eng == nullptr) return;
    if (! eng->hasHandler (def.id, fn)) return;

    const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
    host.enterScript (def.context());
    eng->dispatch (def.id, fn, payload, onError);
    host.exitScript();
}

// --- Lifecycle ---------------------------------------------------------------------------------

void ScriptRuntime::onPanelLoad()
{
    assertMessageThread();
    for (auto& s : scripts) if (s.event == "onPanelLoad") dispatchTo (s, "onPanelLoad", juce::var());
    if (activityCallback) activityCallback();
}

void ScriptRuntime::onPanelReady (bool firstTime)
{
    assertMessageThread();
    auto* o = new juce::DynamicObject();
    o->setProperty ("firstTime", firstTime);
    const juce::var info (o);
    for (auto& s : scripts) if (s.event == "onPanelReady") dispatchTo (s, "onPanelReady", info);
    if (activityCallback) activityCallback();
}

void ScriptRuntime::onPanelClose()
{
    assertMessageThread();
    for (auto& s : scripts) if (s.event == "onPanelClose") dispatchTo (s, "onPanelClose", juce::var());
    if (activityCallback) activityCallback();
}

void ScriptRuntime::onPanelDestroy()
{
    assertMessageThread();
    if (! destroyPending) return;   // already told them, or there was never a set to tell
    destroyPending = false;

    // Dispatched BEFORE anything is torn down, on purpose: a handler restoring the synth needs
    // set(), sendCC() and its own `state` to still work. Whatever it throws is reported the normal
    // way (log + onError) and the teardown carries on — a failing teardown handler must not be
    // able to keep the old script set alive.
    for (auto& s : scripts) if (s.event == "onPanelDestroy") dispatchTo (s, "onPanelDestroy", juce::var());
    if (activityCallback) activityCallback();
}

void ScriptRuntime::onDawSaveState (juce::var& store)
{
    assertMessageThread();
    if (store.getDynamicObject() == nullptr) store = juce::var (new juce::DynamicObject());
    auto* dest = store.getDynamicObject();
    for (auto& s : scripts)
    {
        if (s.event != "onDawSaveState") continue;
        auto* eng = engineFor (s.language);
        if (eng == nullptr || ! eng->hasHandler (s.id, "onDawSaveState")) continue;
        const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
        host.enterScript (s.context());
        // Handlers return an object whose keys are merged into the shared store.
        auto result = eng->dispatch (s.id, "onDawSaveState", store, onError);
        host.exitScript();
        if (auto* ro = result.getDynamicObject())
            for (auto& prop : ro->getProperties())
                dest->setProperty (prop.name, prop.value);
    }
}

void ScriptRuntime::onDawRestoreState (const juce::var& store)
{
    assertMessageThread();
    for (auto& s : scripts) if (s.event == "onDawRestoreState") dispatchTo (s, "onDawRestoreState", store);
    if (activityCallback) activityCallback();
}

// --- Events / phase 3 --------------------------------------------------------------------------

static bool matchesTarget (const ScriptDefinition& def, const juce::String& target)
{
    if (def.owner == "*" || def.owner.isEmpty()) return def.scope == "panel" || def.scope == "project" || target.isEmpty();
    if (def.owner == target) return true;
    if (def.owner == "self") return true; // owner not resolved to a concrete name → treat as self
    return false;
}

void ScriptRuntime::dispatchEvent (const juce::String& event, const juce::String& target, const juce::var& payload)
{
    assertMessageThread();

    // Feedback-loop backstop: a handler that emit()s an event whose handler emit()s again …
    // gets cut off (and reported) at a fixed depth instead of recursing until the stack dies.
    if (dispatchDepth >= maxDispatchDepth)
    {
        reportError ("runtime", "event '" + event + "' dropped: dispatch depth exceeded "
                     + juce::String (maxDispatchDepth) + " (emit/dispatch feedback loop?)");
        return;
    }
    ++dispatchDepth;
    struct DepthScope { int& d; ~DepthScope() { --d; } } depthScope { dispatchDepth };

    // 1) Named-function handlers: a script that runs on `event` and is attached to `target`.
    for (auto& s : scripts)
        if (s.event == event && matchesTarget (s, target))
            dispatchTo (s, event, payload);

    // 2) Explicit on(target, event, fn) listeners registered inside scripts.
    const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
    if (lua)    lua->deliverEvent (target, event, payload, onError);
    if (js)     js->deliverEvent (target, event, payload, onError);
    if (python) python->deliverEvent (target, event, payload, onError);
    if (native) native->deliverEvent (target, event, payload, onError);

    // 3) The reactive rules settle LAST, and only at the outermost dispatch: compute() re-evaluates
    //    its formulas, intercept() corrects anything that changed without going through set(), and
    //    watch() reports what actually moved. Running them inside a nested dispatch would let a
    //    watcher see a half-applied model.
    if (dispatchDepth == 1)
    {
        if (lua)    lua->runReactive (onError);
        if (js)     js->runReactive (onError);
        if (python) python->runReactive (onError);
        if (native) native->runReactive (onError);
        if (activityCallback) activityCallback();
    }
}

bool ScriptRuntime::filterMidi (bool inbound, juce::var& bytes)
{
    assertMessageThread();
    const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
    for (auto* eng : { lua.get(), js.get(), python.get(), native.get() })
        if (eng != nullptr && ! eng->applyMidiFilter (inbound, bytes, onError))
        {
            if (activityCallback) activityCallback();
            return false;                       // the first swallow wins; nothing downstream runs
        }
    if (activityCallback) activityCallback();
    return true;
}

// ----------------------------------------------------------------------------------------------
// ce.device — declaring what the app was not shipped knowing (design doc §29).
//
// The WebView runtime's twin is deviceDefinitions.js. Every rule below is stated there too, and the
// two suites pin the same cases, because "a synth with no profile" is exactly the panel a user
// takes to a gig with the plugin window shut.
//
// A definition is checked when it is made, and one that is wrong is refused with a message and not
// defined. These parsers used to clamp, drop and guess, differently from the editor's: "F07D00F7"
// as a request became one number and went out as 00 (FF from the editor), "100" in a template was
// FF here and 64 there, a template's 0x41 was read back as hex 65, an unknown checksum was Roland
// and an unknown $token 00. The refusals are deviceDefinitions.js's, word for word.

namespace
{
    juce::var propOr (const juce::var& spec, const char* key, const juce::var& fallback = {})
    {
        auto* o = spec.getDynamicObject();
        if (o == nullptr || ! o->hasProperty (key)) return fallback;
        return o->getProperty (key);
    }
    bool hasProp (const juce::var& spec, const char* key)
    {
        auto* o = spec.getDynamicObject();
        return o != nullptr && o->hasProperty (key) && ! o->getProperty (key).isVoid();
    }

    // -- what went wrong, in deviceDefinitions.js's words ------------------------------------

    const juce::String parameterRefused { "the parameter was not defined" };
    const juce::String dumpRefused      { "the dump was not defined" };
    const juce::String notSent          { "nothing was sent" };

    juce::String refusal (const juce::String& call, const juce::String& what, const juce::String& outcome,
                          const juce::String& advice = {})
    {
        return call + ": " + what + ", so " + outcome + "." + (advice.isNotEmpty() ? " " + advice : juce::String());
    }

    bool isNothing (const juce::var& v) { return v.isVoid() || v.isUndefined(); }
    bool isNumber (const juce::var& v)  { return v.isInt() || v.isInt64() || v.isDouble(); }
    bool isWhole (const juce::var& v)
    {
        if (! isNumber (v)) return false;
        const double d = (double) v;
        return std::isfinite (d) && d == std::floor (d);
    }
    // A list is a list in every engine; an object is anything with properties, an empty Lua table
    // included (the Lua bridge turns {} into an object), which reads as an empty list where a list
    // is wanted. deviceDefinitions.js's isList/isObject/listOf draw the same lines.
    bool isList (const juce::var& v)   { return v.isArray(); }
    bool isObject (const juce::var& v) { return v.getDynamicObject() != nullptr; }
    bool listOf (const juce::var& v, juce::Array<juce::var>& out)
    {
        if (auto* arr = v.getArray()) { out = *arr; return true; }
        if (auto* o = v.getDynamicObject(); o != nullptr && o->getProperties().isEmpty()) { out.clear(); return true; }
        return false;
    }

    /** A number as JavaScript prints it, for the cases a script writes: whole numbers bare, others
        in the shortest form that reads back the same. */
    juce::String shownNumber (double d)
    {
        if (std::isnan (d)) return "NaN";
        if (std::isinf (d)) return d > 0 ? "Infinity" : "-Infinity";
        if (d == std::floor (d) && std::abs (d) < 1.0e15) return juce::String ((juce::int64) d);
        char text[64];
        const auto written = std::to_chars (text, text + sizeof (text), d);
        return juce::String (text, (size_t) (written.ptr - text));
    }

    /** A value as a message shows it: a number as the script wrote it, text in double quotes, and
        nil, undefined or None as "nothing". deviceDefinitions.js's shown(). */
    juce::String shownValue (const juce::var& v)
    {
        if (isNothing (v)) return "nothing";
        if (v.isString()) return "\"" + v.toString() + "\"";
        if (v.isBool()) return (bool) v ? "true" : "false";
        if (isNumber (v)) return shownNumber ((double) v);
        if (v.isMethod()) return "a function";
        return isList (v) ? "a list" : "an object";
    }

    /** Text as JavaScript's String() gives it, for a choice id. */
    juce::String textOf (const juce::var& v)
    {
        if (isNothing (v)) return {};
        if (v.isBool()) return (bool) v ? "true" : "false";
        if (isNumber (v)) return shownNumber ((double) v);
        return v.toString();
    }

    /** "a", "a and b", "a, b and c". */
    juce::String listWords (const juce::StringArray& items)
    {
        if (items.size() < 2) return items.joinIntoString ("");
        juce::StringArray head (items);
        head.remove (head.size() - 1);
        return head.joinIntoString (", ") + " and " + items[items.size() - 1];
    }

    /** A whole number from lo to hi, or what was wrong with it, worded to follow "<call>: ". */
    juce::String wholeIn (const juce::String& name, const juce::var& v, juce::int64 lo, juce::int64 hi)
    {
        if (isWhole (v) && (double) v >= (double) lo && (double) v <= (double) hi) return {};
        return name + " is " + shownValue (v) + ", not a whole number from " + juce::String (lo) + " to " + juce::String (hi);
    }

    // -- bytes, by one rule --------------------------------------------------------------------
    // The rule every send reads hex text by (firstTokenNotOneByte in BridgeScriptHost.h, scriptBytes
    // in panelRuntime.js), and its words. Text: a token is one byte, one or two hex digits in any
    // case with or without 0x, separated by spaces, tabs, line breaks or commas and nothing else. A
    // list: each item a whole number from 0 to 255, or text that is one such token.

    juce::StringArray byteTokens (const juce::String& text)
    {
        auto tokens = juce::StringArray::fromTokens (text, " \t\r\n\f\v,", "");
        tokens.removeEmptyStrings();
        return tokens;
    }
    bool isHexByte (const juce::String& token)
    {
        const auto digits = token.startsWithIgnoreCase ("0x") ? token.substring (2) : token;
        return digits.isNotEmpty() && digits.length() <= 2 && digits.containsOnly ("0123456789abcdefABCDEF");
    }
    int hexByteOf (const juce::String& token)
    { return (token.startsWithIgnoreCase ("0x") ? token.substring (2) : token).getHexValue32(); }
    /** A byte as the template carries it: two lower-case hex digits. */
    juce::String hex2 (int byte) { return juce::String::toHexString (byte).paddedLeft ('0', 2); }

    /** notOneByteMessage's advice, word for word. */
    juce::String oneByteAdvice (const juce::String& token)
    {
        if (token.containsOnly ("0123456789abcdefABCDEF") && token.length() % 2 == 0)
        {
            juce::StringArray pairs;
            for (int i = 0; i < token.length(); i += 2) pairs.add (token.substring (i, i + 2));
            return "Put a space between the bytes: \"" + pairs.joinIntoString (" ") + "\".";
        }
        return "Each byte is one or two hex digits, with spaces between the bytes: \"F0 41 10 F7\".";
    }

    /** The bytes a definition was given: `items` as two hex digits each, or a `$name` where `tokens`
        allows them (the caller checks the name), or `what` and `advice` saying what was wrong. */
    struct ReadBytes
    {
        juce::StringArray items;
        juce::String what, advice;
    };

    ReadBytes readBytes (const juce::var& input, const juce::String& field, bool tokens)
    {
        ReadBytes read;
        if (isNothing (input)) return read;
        if (input.isString())
        {
            for (const auto& token : byteTokens (input.toString()))
            {
                if (tokens && token.startsWith ("$")) read.items.add (token);
                else if (isHexByte (token)) read.items.add (hex2 (hexByteOf (token)));
                else
                {
                    read.what = "in the " + field + ", \"" + token + "\" is not one byte";
                    read.advice = oneByteAdvice (token);
                    return read;
                }
            }
            return read;
        }
        juce::Array<juce::var> list;
        if (! listOf (input, list))
        {
            read.what = "the " + field + " is " + shownValue (input) + ", not a list of bytes or hex text";
            return read;
        }
        for (int i = 0; i < list.size(); ++i)
        {
            const auto& item = list.getReference (i);
            const auto one = item.isString() ? byteTokens (item.toString()) : juce::StringArray();
            if (isWhole (item) && (double) item >= 0 && (double) item <= 255) read.items.add (hex2 ((int) (double) item));
            else if (one.size() == 1 && tokens && one[0].startsWith ("$")) read.items.add (one[0]);
            else if (one.size() == 1 && isHexByte (one[0])) read.items.add (hex2 (hexByteOf (one[0])));
            else
            {
                read.what = "in the " + field + ", " + shownValue (item) + " at position " + juce::String (i) + " is not a byte";
                return read;
            }
        }
        return read;
    }

    // -- the vocabularies ------------------------------------------------------------------------

    const juce::StringArray deviceTypes { "boolean", "choice", "enum", "integer", "number", "text" };
    /** Every spelling `encoding` accepts, in the order a refusal lists them, and what each means. */
    const juce::StringArray encodingNames { "boolean-u7", "nibbled", "to14bit", "u14", "u7" };
    juce::String encodingFor (const juce::String& name)
    {
        if (name == "to14bit") return "u14";
        return encodingNames.contains (name) ? name : juce::String();
    }
    const juce::StringArray templateTokens { "$value", "$deviceId", "$channel", "$checksumStart", "$checksum" };
    const juce::StringArray builtInNames { "value", "encodedValue", "deviceId", "channel", "checksumStart", "checksum" };
    const juce::StringArray patternTokens { "$deviceId", "$channel" };
    int patternValue (const juce::String& token) { return token == "$deviceId" ? 16 : 1; }

    /** What the wire can carry, and the words for it. Nothing in this codec sends a negative number. */
    struct Capacity { juce::int64 max; juce::String carrier; };
    Capacity capacityOf (const juce::String& wireKind, const juce::String& encoding, int nibbles)
    {
        if (wireKind == "cc")   return { 127, "a CC carries 0 to 127" };
        if (wireKind == "nrpn") return { 16383, "an NRPN carries 0 to 16383" };
        if (encoding == "u14")  return { 16383, "two SysEx data bytes carry 0 to 16383" };
        if (encoding == "nibbled")
        {
            const auto max = ((juce::int64) 1 << (4 * nibbles)) - 1;
            return { max, nibbles == 1 ? juce::String ("one nibble carries 0 to 15")
                                       : juce::String (nibbles) + " nibbles carry 0 to " + juce::String (max) };
        }
        return { 127, "a SysEx data byte carries 0 to 127" };
    }

    // -- what a write may give ------------------------------------------------------------------

    /** A number as a write may give one: a number, true or false, or decimal text such as "64". */
    std::optional<double> numberOf (const juce::var& v)
    {
        if (isNumber (v)) { const double d = (double) v; return std::isfinite (d) ? std::optional<double> (d) : std::nullopt; }
        if (v.isBool()) return (bool) v ? 1.0 : 0.0;
        if (! v.isString()) return std::nullopt;
        // ^[+-]?[0-9]+(\.[0-9]+)?$ — deviceDefinitions.js's DECIMAL.
        const auto text = v.toString();
        int i = (text.startsWithChar ('+') || text.startsWithChar ('-')) ? 1 : 0;
        const int digitsFrom = i;
        while (i < text.length() && juce::CharacterFunctions::isDigit (text[i])) ++i;
        if (i == digitsFrom) return std::nullopt;
        if (i < text.length() && text[i] == '.')
        {
            const int fractionFrom = ++i;
            while (i < text.length() && juce::CharacterFunctions::isDigit (text[i])) ++i;
            if (i == fractionFrom) return std::nullopt;
        }
        if (i != text.length()) return std::nullopt;
        return text.getDoubleValue();
    }

    /** On or off: true/false, a number (0 is off), or "on"/"off"/"true"/"false" in any case. */
    std::optional<bool> switchOf (const juce::var& v)
    {
        if (v.isBool()) return (bool) v;
        if (isNumber (v)) { const double d = (double) v; return std::isfinite (d) ? std::optional<bool> (d != 0) : std::nullopt; }
        const auto word = v.isString() ? v.toString().toLowerCase() : juce::String();
        if (word == "on" || word == "true") return true;
        if (word == "off" || word == "false") return false;
        return std::nullopt;
    }
}

juce::var ScriptRuntime::DeclaredParameter::descriptor() const
{
    auto* out = new juce::DynamicObject();
    out->setProperty ("id", id);
    out->setProperty ("name", name);
    out->setProperty ("group", group);
    out->setProperty ("type", type);
    out->setProperty ("min", min);
    out->setProperty ("max", max);
    out->setProperty ("access", access);
    // The one field that says where a descriptor came from. Everything else matches a
    // profile-backed one, because a script that discovered a parameter should not have to care.
    out->setProperty ("defined", true);
    return juce::var (out);
}

bool ScriptRuntime::defineDeviceParameter (const juce::String& role, const juce::String& id,
                                           const juce::var& spec)
{
    assertMessageThread();
    if (id.isEmpty())
    {
        reportError ("runtime", "defineParameter(id, spec): a parameter id is required.");
        return false;
    }
    const auto call = "defineParameter(\"" + id + "\")";
    auto refuse = [this, &call] (const juce::String& what, const juce::String& advice = {})
    {
        reportError ("runtime", refusal (call, what, parameterRefused, advice));
        return false;
    };

    DeclaredParameter p;
    p.id = id;
    p.name = propOr (spec, "name", id).toString();
    p.group = propOr (spec, "group", "Script").toString();
    p.access = propOr (spec, "access", "readWrite").toString();

    // Names are read in any case, the way divisions and checksums are.
    const auto typeVar = propOr (spec, "type");
    p.type = isNothing (typeVar) ? juce::String ("number") : typeVar.isString() ? typeVar.toString().toLowerCase() : juce::String();
    if (! deviceTypes.contains (p.type))
        return refuse (shownValue (typeVar) + " is not a type", "One of: " + deviceTypes.joinIntoString (", ") + ".");

    p.encoding = p.type == "boolean" ? "boolean-u7" : "u7";
    if (const auto encodingVar = propOr (spec, "encoding"); ! isNothing (encodingVar))
    {
        p.encoding = encodingFor (encodingVar.isString() ? encodingVar.toString().toLowerCase() : juce::String());
        if (p.encoding.isEmpty())
            return refuse (shownValue (encodingVar) + " is not an encoding", "One of: " + encodingNames.joinIntoString (", ") + ".");
    }
    p.nibbles = 2;
    if (const auto nibbles = propOr (spec, "nibbles"); ! isNothing (nibbles))
    {
        if (const auto wrong = wholeIn ("nibbles", nibbles, 1, 8); wrong.isNotEmpty()) return refuse (wrong);
        p.nibbles = (int) (double) nibbles;
    }
    p.channel = 1;
    if (const auto channel = propOr (spec, "channel"); ! isNothing (channel))
    {
        if (const auto wrong = wholeIn ("channel", channel, 1, 16); wrong.isNotEmpty()) return refuse (wrong);
        p.channel = (int) (double) channel;
    }

    if (hasProp (spec, "cc"))
    {
        const auto cc = propOr (spec, "cc");
        if (const auto wrong = wholeIn ("cc", cc, 0, 127); wrong.isNotEmpty()) return refuse (wrong);
        p.wireKind = "cc";
        p.cc = (int) (double) cc;
    }
    else if (hasProp (spec, "nrpn"))
    {
        // { msb, lsb }, or the two as a list.
        const auto n = propOr (spec, "nrpn");
        if (! isList (n) && ! isObject (n)) return refuse ("the nrpn is " + shownValue (n) + ", not { msb, lsb }");
        juce::Array<juce::var> pair;
        if (isList (n)) listOf (n, pair);
        const auto msb = isList (n) ? pair[0] : propOr (n, "msb");
        const auto lsb = isList (n) ? pair[1] : propOr (n, "lsb");
        auto wrong = wholeIn ("nrpn.msb", msb, 0, 127);
        if (wrong.isEmpty()) wrong = wholeIn ("nrpn.lsb", lsb, 0, 127);
        if (wrong.isNotEmpty()) return refuse (wrong);
        p.wireKind = "nrpn";
        p.msb = (int) (double) msb;
        p.lsb = (int) (double) lsb;
    }
    else if (hasProp (spec, "sysex"))
    {
        const auto read = readBytes (propOr (spec, "sysex"), "sysex template", true);
        if (read.what.isNotEmpty()) return refuse (read.what, read.advice);
        if (read.items.isEmpty())
        {
            reportError ("runtime", call + ": the sysex template is empty — it needs the bytes to send, with $value "
                                    "where the value goes.");
            return false;
        }
        // Every variable is a byte the template can put on the wire, so each is read by the byte
        // rule. In name order, so the first one reported does not depend on how a table iterates.
        if (auto* declared = propOr (spec, "variables").getDynamicObject())
        {
            juce::StringArray names;
            for (const auto& entry : declared->getProperties()) names.add (entry.name.toString());
            std::sort (names.begin(), names.end(), [] (const juce::String& a, const juce::String& b) { return a.compare (b) < 0; });
            for (const auto& name : names)
            {
                const auto value = declared->getProperty (juce::Identifier (name));
                const auto one = value.isString() ? byteTokens (value.toString()) : juce::StringArray();
                if (isWhole (value) && (double) value >= 0 && (double) value <= 255) p.variables.set (name, (int) (double) value);
                else if (one.size() == 1 && isHexByte (one[0])) p.variables.set (name, hexByteOf (one[0]));
                else return refuse ("in the variables, " + name + " = " + shownValue (value) + " is not a byte");
            }
        }
        juce::StringArray own;
        for (const auto& entry : p.variables)
            if (! builtInNames.contains (entry.name.toString())) own.add (entry.name.toString());
        std::sort (own.begin(), own.end(), [] (const juce::String& a, const juce::String& b) { return a.compare (b) < 0; });
        for (const auto& token : read.items)
        {
            if (! token.startsWith ("$") || token == "$encodedValue" || templateTokens.contains (token)
                || own.contains (token.substring (1)))
                continue;
            const auto tokens = "The tokens are " + listWords (templateTokens);
            juce::StringArray named;
            for (const auto& name : own) named.add ("$" + name);
            return refuse ("in the sysex template, \"" + token + "\" is not a token",
                           own.isEmpty() ? tokens + ", and any $name you list in variables."
                                         : tokens + ", and the variable" + (own.size() == 1 ? "" : "s") + " "
                                               + listWords (named) + ".");
        }
        const auto checksumVar = propOr (spec, "checksum");
        p.checksumKind = ce::checksums::canonicalName (isNothing (checksumVar) ? juce::String ("roland")
                                                       : checksumVar.isString() ? checksumVar.toString() : juce::String());
        if (p.checksumKind.isEmpty())
            return refuse (shownValue (checksumVar) + " is not a checksum",
                           "One of: " + ce::checksums::acceptedNames().joinIntoString (", ") + ".");
        p.wireKind = "sysex";
        p.tmpl = read.items;            // normalised: 0x41 and "41" are both "41" by now
    }
    else
    {
        // Refusing is deliberate. A descriptor with no wire enumerates fine and sends nothing, so
        // the panel LOOKS built — which is a worse failure than an error, and a much later one.
        reportError ("runtime", call + ": no wire format — give it { cc = 74 }, "
                     "{ nrpn = { msb = 1, lsb = 2 } } or { sysex = { … } }, or nothing will be sent.");
        return false;
    }

    const auto capacity = capacityOf (p.wireKind, p.encoding, p.nibbles);
    const auto negative = "A negative number cannot be sent. Declare the numbers the synth receives, such as "
                          "min = 0 and max = " + juce::String (capacity.max)
                        + ", and add the offset in your script with ce.midi.toOffset(value, 64).";

    // Choices are a choice parameter's: a name each, worth its position plus min, or { id, value }.
    p.min = hasProp (spec, "min") ? (double) propOr (spec, "min") : 0.0;
    int named = 0;
    if ((p.type == "choice" || p.type == "enum") && hasProp (spec, "choices"))
    {
        const auto choicesVar = propOr (spec, "choices");
        juce::Array<juce::var> list;
        if (! listOf (choicesVar, list)) return refuse ("the choices are " + shownValue (choicesVar) + ", not a list");
        for (int i = 0; i < list.size(); ++i)
        {
            const auto& c = list.getReference (i);
            auto* choice = new juce::DynamicObject();
            const juce::var owned (choice);
            if (c.isString())
            {
                choice->setProperty ("id", c.toString());
                choice->setProperty ("value", p.min + i);
                ++named;
            }
            else if (isObject (c))
            {
                const auto choiceId = textOf (hasProp (c, "id") ? propOr (c, "id") : propOr (c, "name"));
                const auto value = propOr (c, "value");
                if (! isWhole (value))
                    return refuse ("the value of choice \"" + choiceId + "\" is " + shownValue (value) + ", not a whole number");
                choice->setProperty ("id", choiceId);
                choice->setProperty ("value", value);
            }
            else return refuse ("in the choices, " + shownValue (c) + " at position " + juce::String (i) + " is not a choice",
                                "A choice is its name, or { id, value }.");
            p.choices.add (owned);
        }
    }

    const double widthMax = p.encoding == "u14" ? 16383.0 : 127.0;
    p.max = hasProp (spec, "max") ? (double) propOr (spec, "max")
          : p.type == "boolean" ? 1.0
          : (named > 0 && named == p.choices.size()) ? p.min + p.choices.size() - 1
          : juce::jmin (widthMax, (double) capacity.max);

    p.trueValue = 1;
    p.falseValue = 0;
    if (p.type != "text")
    {
        for (const auto& [name, value] : { std::pair<const char*, double> { "min", p.min }, { "max", p.max } })
        {
            if (value < 0) return refuse (juce::String (name) + " is " + shownNumber (value) + ", and " + capacity.carrier, negative);
            if (value > (double) capacity.max) return refuse (juce::String (name) + " is " + shownNumber (value) + ", and " + capacity.carrier);
        }
        for (const auto& c : p.choices)
        {
            const double value = (double) propOr (c, "value");
            if (value < 0 || value > (double) capacity.max)
                return refuse ("the value of choice \"" + propOr (c, "id").toString() + "\" is " + shownNumber (value)
                               + ", and " + capacity.carrier);
        }
        for (const char* name : { "trueValue", "falseValue" })
        {
            const auto value = propOr (spec, name);
            if (isNothing (value)) continue;
            if (! isWhole (value)) return refuse (juce::String (name) + " is " + shownValue (value) + ", not a whole number");
            const double d = (double) value;
            if (d < 0 || d > (double) capacity.max)
                return refuse (juce::String (name) + " is " + shownNumber (d) + ", and " + capacity.carrier, d < 0 ? negative : juce::String());
            (juce::String (name) == "trueValue" ? p.trueValue : p.falseValue) = (int) d;
        }
    }
    p.length = hasProp (spec, "length") ? juce::jmax (0, (int) propOr (spec, "length")) : 0;
    p.pad    = hasProp (spec, "pad") ? (int) propOr (spec, "pad") : 32;

    if (p.wireKind == "sysex")
    {
        // A Roland template (41 straight after F0) whose $checksum has no $checksumStart sums the
        // header too, and a Roland synth rejects the message without a word. The marker is not
        // inferred (see encodeDeviceParameter), so the definition stands, with a warning in the
        // words of rolandChecksumWarning in deviceDefinitions.js. The template is normalised by now,
        // so one written as numbers ({ 0xF0, 0x41, … }) is recognised too.
        const auto first = p.tmpl[0] == "f0" ? p.tmpl[1] : p.tmpl[0];
        if (first == "41" && p.tmpl.contains ("$checksum") && ! p.tmpl.contains ("$checksumStart"))
            host.logAt ("warn", "defineParameter(\"" + id + "\"): this is a Roland template (41 after F0) with $checksum "
                                "and no $checksumStart, so the checksum includes the header, and a Roland synth "
                                "ignores the message. Put $checksumStart where the address begins.", juce::var());
    }

    auto& slot = deviceDeclarations[role.isEmpty() ? juce::String ("mainSynth") : role];
    for (auto& existing : slot.parameters)
        if (existing.id == id) { existing = p; return true; }   // redeclaring replaces, it does not stack
    slot.parameters.push_back (std::move (p));
    return true;
}

bool ScriptRuntime::defineDeviceDump (const juce::String& role, const juce::String& kind,
                                      const juce::var& spec)
{
    assertMessageThread();
    if (kind.isEmpty())
    {
        reportError ("runtime", "defineDump(kind, spec): a dump kind is required.");
        return false;
    }
    const auto call = "defineDump(\"" + kind + "\")";
    auto refuse = [this, &call] (const juce::String& what, const juce::String& advice = {})
    {
        reportError ("runtime", refusal (call, what, dumpRefused, advice));
        return false;
    };

    const auto resolvedRole = role.isEmpty() ? juce::String ("mainSynth") : role;
    auto* fields = propOr (spec, "fields").getArray();
    if (fields == nullptr || fields->isEmpty())
    {
        reportError ("runtime", call + ": no fields — a layout with nothing in it decodes to nothing.");
        return false;
    }

    DeclaredDump dump;
    dump.id = kind;
    dump.name = propOr (spec, "name", kind).toString();
    for (const auto& field : *fields)
    {
        const auto parameterId = propOr (field, "parameter", propOr (field, "id")).toString().trim();
        if (parameterId.isEmpty())
        {
            reportError ("runtime", call + ": a field has no parameter — every field names the parameter it carries.");
            return false;
        }
        // Refused here rather than at decode time: a layout naming a parameter that does not exist
        // decodes to fewer values than the author thinks, months later, in front of an audience.
        if (findDeclaredParameter (resolvedRole, parameterId) == nullptr)
        {
            reportError ("runtime", call + ": \"" + parameterId + "\" is not a defined "
                         "parameter. Call defineParameter(\"" + parameterId + "\", …) first — the layout "
                         "describes where a parameter sits, so the parameter has to exist to sit anywhere.");
            return false;
        }
        dump.fieldParameters.add (parameterId);
        dump.fieldOffsets.add (juce::jmax (0, (int) propOr (field, "offset", 0)));
    }

    // A prefix or suffix: bytes, and the two tokens the editor's decoder resolves ($deviceId as 16,
    // $channel as 1). They used to match ANY byte here, so the two runtimes matched different dumps.
    const auto match = propOr (spec, "match");
    auto readPattern = [&] (const char* key, const juce::String& field, juce::Array<int>& out) -> bool
    {
        const auto read = readBytes (hasProp (match, key) ? propOr (match, key) : propOr (spec, key), field, true);
        if (read.what.isNotEmpty()) return refuse (read.what, read.advice);
        for (const auto& item : read.items)
        {
            if (item.startsWith ("$") && ! patternTokens.contains (item))
                return refuse ("in the " + field + ", \"" + item + "\" is not a token",
                               "The tokens are " + listWords (patternTokens) + ".");
            out.add (item.startsWith ("$") ? patternValue (item) : item.getHexValue32());
        }
        return true;
    };
    if (! readPattern ("prefix", "prefix", dump.prefix)) return false;
    if (dump.prefix.isEmpty())
    {
        reportError ("runtime", call + ": no prefix — a layout with nothing to recognise it by would decode every SysEx "
                                "that arrives. Give it match = { prefix = { \"F0\", … } }, the bytes the dump starts with.");
        return false;
    }
    if (! readPattern ("suffix", "suffix", dump.suffix)) return false;
    const auto request = readBytes (propOr (spec, "request"), "request", false);
    if (request.what.isNotEmpty()) return refuse (request.what, request.advice);
    for (const auto& item : request.items) dump.request.add (item.getHexValue32());

    dump.offset = juce::jmax (0, (int) propOr (spec, "offset", 0));
    dump.size   = juce::jmax (0, (int) propOr (spec, "size", 0));

    // A checksum is a name, placed where a SysEx dump keeps it, or { type, fromOffset, toOffset,
    // byteOffset }; an offset left out takes the name's default, placed per message (decodeDeclaredDump).
    if (const auto cs = propOr (spec, "checksum"); ! isNothing (cs))
    {
        const bool object = isObject (cs);
        if (! cs.isString() && ! object)
            return refuse ("the checksum is " + shownValue (cs) + ", not a name such as \"roland\" or "
                           "{ type, fromOffset, toOffset, byteOffset }");
        const auto type = object ? (hasProp (cs, "type") ? propOr (cs, "type") : juce::var ("roland-7bit")) : cs;
        dump.checksumType = type.isString() ? ce::checksums::canonicalName (type.toString()) : juce::String();
        if (dump.checksumType.isEmpty())
            return refuse (shownValue (type) + " is not a checksum",
                           "One of: " + ce::checksums::acceptedNames().joinIntoString (", ") + ".");
        dump.checksumWidth = ce::checksums::widthOf (dump.checksumType);
        for (const auto& [name, target] : { std::pair<const char*, int*> { "fromOffset", &dump.checksumFrom },
                                          { "toOffset", &dump.checksumTo }, { "byteOffset", &dump.checksumAt } })
        {
            if (! object || ! hasProp (cs, name)) continue;
            const auto value = propOr (cs, name);
            if (! isWhole (value) || (double) value < 0)
                return refuse ("checksum." + juce::String (name) + " is " + shownValue (value) + ", not a whole number of 0 or more");
            *target = (int) (double) value;
        }
    }

    auto& slot = deviceDeclarations[resolvedRole];
    for (auto& existing : slot.dumps)
        if (existing.id == kind) { existing = dump; return true; }
    slot.dumps.push_back (std::move (dump));
    return true;
}

const ScriptRuntime::DeclaredParameter*
ScriptRuntime::findDeclaredParameter (const juce::String& role, const juce::String& id) const
{
    const auto it = deviceDeclarations.find (role.isEmpty() ? juce::String ("mainSynth") : role);
    if (it == deviceDeclarations.end()) return nullptr;
    for (const auto& p : it->second.parameters) if (p.id == id) return &p;
    return nullptr;
}

const ScriptRuntime::DeclaredDump*
ScriptRuntime::findDeclaredDump (const juce::String& role, const juce::String& kind) const
{
    const auto it = deviceDeclarations.find (role.isEmpty() ? juce::String ("mainSynth") : role);
    if (it == deviceDeclarations.end()) return nullptr;
    for (const auto& d : it->second.dumps) if (d.id == kind) return &d;
    return nullptr;
}

bool ScriptRuntime::hasDeviceParameter (const juce::String& role, const juce::String& id) const
{ return findDeclaredParameter (role, id) != nullptr; }

bool ScriptRuntime::hasDeviceDump (const juce::String& role, const juce::String& kind) const
{ return findDeclaredDump (role, kind) != nullptr; }

juce::var ScriptRuntime::declaredDeviceParameters (const juce::String& role) const
{
    juce::Array<juce::var> out;
    const auto it = deviceDeclarations.find (role.isEmpty() ? juce::String ("mainSynth") : role);
    if (it != deviceDeclarations.end())
        for (const auto& p : it->second.parameters) out.add (p.descriptor());
    return juce::var (out);
}

juce::var ScriptRuntime::declaredDeviceParameter (const juce::String& role, const juce::String& id) const
{
    if (auto* p = findDeclaredParameter (role, id)) return p->descriptor();
    return {};
}

bool ScriptRuntime::declaredParameterNumber (const DeclaredParameter& p, const juce::var& value,
                                             juce::int64& number, juce::String& error)
{
    if (p.type == "text")
    {
        error = "a text parameter is read out of a dump and cannot be written on its own, so " + notSent + ".";
        return false;
    }
    if (p.type == "boolean")
    {
        const auto on = switchOf (value);
        if (! on.has_value())
        {
            error = shownValue (value) + " is not on or off, so " + notSent + ". Write true or false, a number "
                    "(0 is off, any other number is on), or \"on\", \"off\", \"true\" or \"false\".";
            return false;
        }
        number = *on ? p.trueValue : p.falseValue;
        return true;
    }
    if (p.type == "choice" || p.type == "enum")
    {
        // A name is matched in any case, the way divisions are; a number is the value itself.
        if (value.isString())
        {
            const auto wanted = value.toString();
            const juce::var* match = nullptr;
            for (const auto& c : p.choices) if (propOr (c, "id").toString() == wanted) { match = &c; break; }
            if (match == nullptr)
                for (const auto& c : p.choices) if (propOr (c, "id").toString().equalsIgnoreCase (wanted)) { match = &c; break; }
            if (match != nullptr) { number = (juce::int64) (double) propOr (*match, "value"); return true; }
        }
        if (! numberOf (value).has_value())
        {
            juce::StringArray ids;
            for (const auto& c : p.choices) ids.add ("\"" + propOr (c, "id").toString() + "\"");
            const auto list = ids.isEmpty() ? juce::String ("It has no choices.")
                            : ids.size() == 1 ? "The only choice is " + ids[0] + "."
                            : "The choices are " + listWords (ids) + ".";
            error = shownValue (value) + " is not one of its choices, so " + notSent + ". " + list;
            return false;
        }
    }
    const auto n = numberOf (value);
    if (! n.has_value())
    {
        error = shownValue (value) + " is not a number, so " + notSent + ".";
        return false;
    }
    const double lo = juce::jmin (p.min, p.max);
    const double hi = juce::jmax (p.min, p.max);
    number = std::llround (*n < lo ? lo : *n > hi ? hi : *n);
    return true;
}

juce::var ScriptRuntime::encodeDeviceParameter (const juce::String& role, const juce::String& id,
                                                const juce::var& value) const
{
    const auto* p = findDeclaredParameter (role, id);
    if (p == nullptr) return {};      // not ours — the caller falls through to the device profile

    juce::int64 number = 0;
    juce::String error;
    if (! declaredParameterNumber (*p, value, number, error))
    {
        host.logAt ("error", "deviceWrite(\"" + id + "\"): " + error, juce::var());
        return {};
    }

    juce::Array<int> bytes;
    if (p->wireKind == "cc")
    {
        bytes.addArray ({ 0xb0 | (p->channel - 1), p->cc, (int) number });
    }
    else if (p->wireKind == "nrpn")
    {
        const int status = 0xb0 | (p->channel - 1);
        bytes.addArray ({ status, 99, p->msb, status, 98, p->lsb,
                          status, 6, (int) ((number >> 7) & 0x7f), status, 38, (int) (number & 0x7f) });
    }
    else
    {
        juce::Array<int> valueBytes;
        if (p->encoding == "u14") valueBytes.addArray ({ (int) ((number >> 7) & 0x7f), (int) (number & 0x7f) });
        else if (p->encoding == "nibbled")
            for (int i = p->nibbles - 1; i >= 0; --i) valueBytes.add ((int) ((number >> (i * 4)) & 0x0f));
        else valueBytes.add ((int) number);

        int sumFrom = -1;
        for (const auto& token : p->tmpl)
        {
            if (token == "$checksumStart") { sumFrom = bytes.size(); continue; }
            if (token == "$checksum")
            {
                // The marker is documented rather than inferred: a Roland checksum covers the
                // ADDRESS AND DATA, and no rule read off a template can know where the header stops.
                const int from = sumFrom >= 0 ? sumFrom : (bytes.size() > 0 && bytes[0] == 0xf0 ? 1 : 0);
                juce::Array<int> covered;
                for (int i = from; i < bytes.size(); ++i) covered.add (bytes[i]);
                bytes.addArray (ce::checksums::toBytes (p->checksumKind, covered));
                continue;
            }
            if (token == "$value" || token == "$encodedValue") { bytes.addArray (valueBytes); continue; }
            if (token.startsWith ("$"))
            {
                const auto name = token.substring (1);
                bytes.add (p->variables.contains (juce::Identifier (name)) ? (int) p->variables[juce::Identifier (name)]
                           : name == "channel" ? p->channel : 16);
                continue;
            }
            bytes.add (token.getHexValue32());
        }
        if (bytes.isEmpty()) return {};
        if (bytes[0] != 0xf0) bytes.insert (0, 0xf0);
        if (bytes[bytes.size() - 1] != 0xf7) bytes.add (0xf7);
    }

    juce::Array<juce::var> out;
    for (const auto b : bytes) out.add (b);
    return juce::var (out);
}

juce::var ScriptRuntime::deviceDumpRequest (const juce::String& role, const juce::String& kind) const
{
    juce::Array<juce::var> out;
    if (auto* d = findDeclaredDump (role, kind))
        for (const auto b : d->request) out.add (b);
    return juce::var (out);
}

juce::var ScriptRuntime::decodeDeclaredDump (const juce::String& role, const DeclaredDump& dump,
                                             const juce::Array<int>& bytes) const
{
    for (int i = 0; i < dump.prefix.size(); ++i)
        if (i >= bytes.size() || bytes[i] != dump.prefix[i]) return {};
    for (int i = 0; i < dump.suffix.size(); ++i)
    {
        const int at = bytes.size() - dump.suffix.size() + i;
        if (at < 0 || bytes[at] != dump.suffix[i]) return {};
    }

    // A checksum named alone sits just before the suffix (at the end when there is none) and covers
    // every byte from the end of the prefix up to it — deviceDefinitions.js's placedChecksum. The
    // whole table is used: anything but sum-7bit used to be checked as Roland, and a name with no
    // byteOffset was never checked at all.
    if (dump.checksumType.isNotEmpty())
    {
        const int width = dump.checksumWidth;
        const int at = dump.checksumAt >= 0 ? dump.checksumAt : bytes.size() - dump.suffix.size() - width;
        const int from = dump.checksumFrom >= 0 ? dump.checksumFrom : dump.prefix.size();
        const int to = dump.checksumTo >= 0 ? dump.checksumTo : at - 1;
        if (at < 0 || at + width > bytes.size() || from < 0 || from > to || to >= bytes.size()) return {};
        juce::Array<int> covered;
        for (int i = from; i <= to; ++i) covered.add (bytes[i]);
        const auto expected = ce::checksums::toBytes (dump.checksumType, covered);
        if (expected.size() != width) return {};
        for (int i = 0; i < width; ++i)
            if (bytes[at + i] != expected[i]) return {};
    }

    // Owned from the start: every malformed-dump path below returns {} before `values` is wrapped
    // in a var, and a raw DynamicObject nobody references is never freed.
    juce::DynamicObject::Ptr values = new juce::DynamicObject();
    for (int i = 0; i < dump.fieldParameters.size(); ++i)
    {
        const auto* p = findDeclaredParameter (role, dump.fieldParameters[i]);
        if (p == nullptr) return {};
        const int at = dump.offset + dump.fieldOffsets[i];
        if (at < 0 || at >= bytes.size()) return {};

        if (p->type == "text")
        {
            const int length = juce::jmax (1, p->length);
            if (at + length > bytes.size()) return {};
            juce::String text;
            for (int c = 0; c < length; ++c)
            {
                const int byte = bytes[at + c];
                if (byte < 32 || byte > 127) return {};
                text += (juce::juce_wchar) byte;
            }
            values->setProperty (juce::Identifier (p->id), text.trimEnd());
            continue;
        }

        int numeric = bytes[at];
        if (p->encoding == "u14")
        {
            if (at + 1 >= bytes.size()) return {};
            numeric = ((bytes[at] & 0x7f) << 7) | (bytes[at + 1] & 0x7f);
        }
        else if (p->encoding == "nibbled")
        {
            if (at + p->nibbles > bytes.size()) return {};
            numeric = 0;
            for (int n = 0; n < p->nibbles; ++n) numeric = (numeric << 4) | (bytes[at + n] & 0x0f);
        }

        if (p->type == "boolean")
        {
            values->setProperty (juce::Identifier (p->id), numeric == p->trueValue);
            continue;
        }
        if (p->type == "choice" || p->type == "enum")
        {
            bool named = false;
            for (const auto& choice : p->choices)
                if ((int) propOr (choice, "value", -1) == numeric)
                {
                    values->setProperty (juce::Identifier (p->id), propOr (choice, "id").toString());
                    named = true;
                    break;
                }
            if (named) continue;
        }
        values->setProperty (juce::Identifier (p->id), numeric);
    }

    auto* out = new juce::DynamicObject();
    out->setProperty ("kind", dump.id);
    out->setProperty ("name", dump.name);
    out->setProperty ("values", juce::var (values.get()));
    return juce::var (out);
}

juce::var ScriptRuntime::matchDeviceDump (const juce::String& role, const juce::var& bytes) const
{
    const auto it = deviceDeclarations.find (role.isEmpty() ? juce::String ("mainSynth") : role);
    if (it == deviceDeclarations.end() || it->second.dumps.empty()) return {};

    juce::Array<int> raw;
    if (auto* arr = bytes.getArray()) for (const auto& b : *arr) raw.add ((int) b);
    else
    {
        const auto read = readBytes (bytes, "message", false);
        if (read.what.isNotEmpty()) return {};
        for (const auto& item : read.items) raw.add (item.getHexValue32());
    }
    if (raw.isEmpty()) return {};

    for (const auto& dump : it->second.dumps)
    {
        const auto decoded = decodeDeclaredDump (role, dump, raw);
        if (! decoded.isVoid()) return decoded;
    }
    return {};
}

juce::var ScriptRuntime::runAction (const juce::String& ref, const juce::var& args)
{
    assertMessageThread();

    // Same backstop as dispatchEvent: run() calling a handler that run()s back is a loop, and a
    // loop that recurses through C++ frames takes the process down rather than reporting.
    if (dispatchDepth >= maxDispatchDepth)
    {
        reportError ("runtime", "run('" + ref + "') dropped: dispatch depth exceeded "
                     + juce::String (maxDispatchDepth) + " (run/emit feedback loop?)");
        return {};
    }
    ++dispatchDepth;
    struct DepthScope { int& d; ~DepthScope() { --d; } } depthScope { dispatchDepth };

    // Split on the LAST dot, testing for one first: upToLastOccurrenceOf returns the WHOLE string
    // when the separator is absent, so a bare "action" would come back as owner "action" and match
    // no script — silently breaking the documented bare form while "owner.action" kept working.
    const int dot = ref.lastIndexOfChar ('.');
    const juce::String owner  = dot > 0 ? ref.substring (0, dot) : juce::String();
    const juce::String action = dot >= 0 ? ref.substring (dot + 1) : ref;
    if (action.isEmpty()) return {};

    // A defineAction()-registered action wins over a handler that happens to share the name: the
    // registration is a deliberate declaration, the coincidence is not, and the deliberate one
    // should not lose to it. An owner-qualified ref skips this — that spelling is asking for a
    // particular script's function by name.
    if (owner.isEmpty())
    {
        const ScriptErrorSink onActionError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
        juce::var result;
        for (auto* eng : { lua.get(), js.get(), python.get(), native.get() })
            if (eng != nullptr && eng->callAction (action, args, result, onActionError))
                return result;
    }

    for (auto& s : scripts)
    {
        // A bare "action" matches any script; "owner.action" must match the script's owner.
        if (owner.isNotEmpty() && s.owner != owner) continue;
        auto* eng = engineFor (s.language);
        if (eng == nullptr || ! eng->hasHandler (s.id, action)) continue;

        const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
        host.enterScript (s.context());
        auto result = eng->dispatch (s.id, action, args, onError);
        host.exitScript();
        return result;
    }

    juce::StringArray defined;
    for (auto* eng : { lua.get(), js.get(), python.get(), native.get() })
        if (eng != nullptr) defined.addArray (eng->registeredActions());
    reportError ("runtime", "run('" + ref + "') found no script defining " + action + "()"
                 + (defined.isEmpty() ? juce::String() : ". Registered actions: " + defined.joinIntoString (", ")));
    return {};
}

} // namespace ceditor::scripting
