#include "ScriptRuntime.h"

#include <juce_events/juce_events.h>

#include <algorithm>
#include <cmath>

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

double ScriptRuntime::animationEase (double progress, const juce::String& curve)
{
    const double v = juce::jlimit (0.0, 1.0, progress);
    // Deliberately the same four shapes ce.math.curve() offers, computed the same way, so an
    // author who knows one knows the other.
    if (curve == "exp") return v * v;
    if (curve == "log") return std::sqrt (v);
    if (curve == "s")   return v * v * (3.0 - 2.0 * v);
    return v;
}

double ScriptRuntime::animationSpring (double progress, double damping, double frequency)
{
    const double x = juce::jlimit (0.0, 1.0, progress);
    if (x >= 1.0) return 1.0;   // pinned, so a spring ALWAYS finishes exactly on its target
    return 1.0 - std::exp (-damping * x) * std::cos (frequency * x);
}

void ScriptRuntime::startAnimation (const juce::String& kind, const juce::String& path,
                                    double target, const juce::var& opts)
{
    assertMessageThread();
    if (path.isEmpty()) return;

    auto* o = opts.getDynamicObject();
    auto number = [o] (const char* key, double fallback)
    {
        if (o == nullptr || ! o->hasProperty (key)) return fallback;
        const double v = (double) o->getProperty (key);
        return std::isfinite (v) ? v : fallback;
    };

    Animation a;
    a.kind = kind == "spring" ? "spring" : "to";
    a.path = path;
    a.to = target;
    a.duration = juce::jmax (1.0, number ("duration", a.kind == "spring" ? 600.0 : 300.0));
    a.damping = number ("damping", 6.0);
    a.frequency = number ("frequency", 12.0);
    if (o != nullptr && o->hasProperty ("curve")) a.curve = o->getProperty ("curve").toString();
    // Nothing has ticked yet on a freshly constructed runtime, so seed the origin from the same
    // clock the host ticks with — otherwise the first animation measures against zero and is
    // already finished by its first tick. The WebView runtime does exactly this.
    if (! animationTicked) { animationNowMs = (double) juce::Time::getMillisecondCounterHiRes(); animationTicked = true; }
    a.startMs = animationNowMs;

    // `from` defaults to where the value IS, so an animation always starts from the truth rather
    // than from wherever the last one happened to end.
    a.from = (o != nullptr && o->hasProperty ("from")) ? (double) o->getProperty ("from")
                                                       : (double) host.getValue (path, "value");
    if (! std::isfinite (a.from)) a.from = 0.0;

    stopAnimation (path);   // a value has one destination
    animations.push_back (a);
}

void ScriptRuntime::stopAnimation (const juce::String& path)
{
    if (path.isEmpty()) { animations.clear(); return; }
    animations.erase (std::remove_if (animations.begin(), animations.end(),
                                      [&path] (const Animation& a) { return a.path == path; }),
                      animations.end());
}

bool ScriptRuntime::animationRunning (const juce::String& path) const
{
    if (path.isEmpty()) return ! animations.empty();
    for (const auto& a : animations) if (a.path == path) return true;
    return false;
}

void ScriptRuntime::tickAnimations (double nowMs)
{
    animationNowMs = nowMs;
    animationTicked = true;
    if (animations.empty()) return;

    // Iterate a copy: a set() can run a script that starts or stops an animation, and mutating the
    // list mid-walk is how that turns into a dangling iterator.
    const auto snapshot = animations;
    for (const auto& a : snapshot)
    {
        const double progress = juce::jlimit (0.0, 1.0, (nowMs - a.startMs) / a.duration);
        const double eased = a.kind == "spring" ? animationSpring (progress, a.damping, a.frequency)
                                                : animationEase (progress, a.curve);
        host.setValue (a.path, juce::var (a.from + (a.to - a.from) * eased), juce::var());
        if (progress >= 1.0) stopAnimation (a.path);
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
}

void ScriptRuntime::onPanelReady (bool firstTime)
{
    assertMessageThread();
    auto* o = new juce::DynamicObject();
    o->setProperty ("firstTime", firstTime);
    const juce::var info (o);
    for (auto& s : scripts) if (s.event == "onPanelReady") dispatchTo (s, "onPanelReady", info);
}

void ScriptRuntime::onPanelClose()
{
    assertMessageThread();
    for (auto& s : scripts) if (s.event == "onPanelClose") dispatchTo (s, "onPanelClose", juce::var());
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
    }
}

bool ScriptRuntime::filterMidi (bool inbound, juce::var& bytes)
{
    assertMessageThread();
    const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };
    for (auto* eng : { lua.get(), js.get(), python.get(), native.get() })
        if (eng != nullptr && ! eng->applyMidiFilter (inbound, bytes, onError))
            return false;                       // the first swallow wins; nothing downstream runs
    return true;
}

// ----------------------------------------------------------------------------------------------
// ce.device — declaring what the app was not shipped knowing (design doc §29).
//
// The WebView runtime's twin is deviceDefinitions.js. Every rule below is stated there too, and the
// two suites pin the same cases, because "a synth with no profile" is exactly the panel a user
// takes to a gig with the plugin window shut.

namespace
{
    int clamp7 (double v, int lo = 0, int hi = 127)
    {
        const int n = (int) std::lround (v);
        return n < lo ? lo : n > hi ? hi : n;
    }

    /** A byte list as a script may write it: an array of numbers, or "f0 41 10" hex text. */
    juce::Array<int> varToByteList (const juce::var& v)
    {
        juce::Array<int> out;
        if (auto* arr = v.getArray())
        {
            for (const auto& item : *arr)
            {
                if (item.isString())
                {
                    const auto text = item.toString().trim();
                    out.add (text.startsWith ("$") ? -1 : (int) text.getHexValue32());
                }
                else out.add (clamp7 ((double) item, 0, 255));
            }
            return out;
        }
        if (v.isString())
            for (const auto& token : juce::StringArray::fromTokens (v.toString(), " ,", ""))
                if (token.isNotEmpty()) out.add ((int) token.getHexValue32());
        return out;
    }

    juce::StringArray varToTokens (const juce::var& v)
    {
        if (auto* arr = v.getArray())
        {
            juce::StringArray out;
            for (const auto& item : *arr) out.add (item.toString().trim());
            return out;
        }
        if (v.isString()) return juce::StringArray::fromTokens (v.toString(), " ,", "");
        return {};
    }

    int checksumOver (const juce::String& kind, const juce::Array<int>& bytes, int from, int toInclusive)
    {
        int sum = 0, x = 0;
        for (int i = juce::jmax (0, from); i <= juce::jmin (toInclusive, bytes.size() - 1); ++i)
        {
            sum = (sum + (bytes[i] & 0xff)) % 128;
            x = (x ^ (bytes[i] & 0xff)) & 0x7f;
        }
        const auto k = kind.toLowerCase();
        if (k == "xor") return x;
        if (k == "sum" || k == "sum-7bit") return sum;
        return (128 - sum) % 128;                       // roland / yamaha / two's complement
    }

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

    DeclaredParameter p;
    p.id = id;
    p.name = propOr (spec, "name", id).toString();
    p.group = propOr (spec, "group", "Script").toString();
    p.type = propOr (spec, "type", "number").toString();
    p.access = propOr (spec, "access", "readWrite").toString();

    const auto declaredEncoding = propOr (spec, "encoding").toString();
    p.encoding = (declaredEncoding == "u7" || declaredEncoding == "u14" || declaredEncoding == "nibbled"
                  || declaredEncoding == "boolean-u7")
                 ? declaredEncoding : (p.type == "boolean" ? juce::String ("boolean-u7") : juce::String ("u7"));
    const double widthMax = p.encoding == "u14" ? 16383.0 : 127.0;

    p.min = hasProp (spec, "min") ? (double) propOr (spec, "min") : 0.0;
    p.max = hasProp (spec, "max") ? (double) propOr (spec, "max")
                                  : (p.type == "boolean" ? 1.0 : widthMax);
    p.channel = juce::jlimit (1, 16, hasProp (spec, "channel") ? (int) propOr (spec, "channel") : 1);
    p.nibbles = hasProp (spec, "nibbles") ? juce::jmax (1, (int) propOr (spec, "nibbles")) : 2;
    p.length  = hasProp (spec, "length") ? juce::jmax (0, (int) propOr (spec, "length")) : 0;
    p.pad     = hasProp (spec, "pad") ? (int) propOr (spec, "pad") : 32;
    p.trueValue  = hasProp (spec, "trueValue") ? (int) propOr (spec, "trueValue") : 1;
    p.falseValue = hasProp (spec, "falseValue") ? (int) propOr (spec, "falseValue") : 0;
    if (auto* choices = propOr (spec, "choices").getArray()) p.choices = *choices;
    if (auto* vars = propOr (spec, "variables").getDynamicObject()) p.variables = vars->getProperties();

    if (hasProp (spec, "cc"))
    {
        p.wireKind = "cc";
        p.cc = clamp7 ((double) propOr (spec, "cc"));
    }
    else if (hasProp (spec, "nrpn"))
    {
        const auto n = propOr (spec, "nrpn");
        p.wireKind = "nrpn";
        p.msb = clamp7 ((double) propOr (n, "msb"));
        p.lsb = clamp7 ((double) propOr (n, "lsb"));
    }
    else if (hasProp (spec, "sysex"))
    {
        p.tmpl = varToTokens (propOr (spec, "sysex"));
        if (p.tmpl.isEmpty())
        {
            reportError ("runtime", "defineParameter(\"" + id + "\"): the sysex template is empty — it needs the "
                         "bytes to send, with $value where the value goes.");
            return false;
        }
        p.wireKind = "sysex";
        p.checksumKind = propOr (spec, "checksum", "roland").toString();
    }
    else
    {
        // Refusing is deliberate. A descriptor with no wire enumerates fine and sends nothing, so
        // the panel LOOKS built — which is a worse failure than an error, and a much later one.
        reportError ("runtime", "defineParameter(\"" + id + "\"): no wire format — give it { cc = 74 }, "
                     "{ nrpn = { msb = 1, lsb = 2 } } or { sysex = { … } }, or nothing will be sent.");
        return false;
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

    const auto resolvedRole = role.isEmpty() ? juce::String ("mainSynth") : role;
    auto* fields = propOr (spec, "fields").getArray();
    if (fields == nullptr || fields->isEmpty())
    {
        reportError ("runtime", "defineDump(\"" + kind + "\"): no fields — a layout with nothing in it "
                     "decodes to nothing.");
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
            reportError ("runtime", "defineDump(\"" + kind + "\"): a field has no parameter — every field "
                         "names the parameter it carries.");
            return false;
        }
        // Refused here rather than at decode time: a layout naming a parameter that does not exist
        // decodes to fewer values than the author thinks, months later, in front of an audience.
        if (findDeclaredParameter (resolvedRole, parameterId) == nullptr)
        {
            reportError ("runtime", "defineDump(\"" + kind + "\"): \"" + parameterId + "\" is not a defined "
                         "parameter. Call defineParameter(\"" + parameterId + "\", …) first — the layout "
                         "describes where a parameter sits, so the parameter has to exist to sit anywhere.");
            return false;
        }
        dump.fieldParameters.add (parameterId);
        dump.fieldOffsets.add (juce::jmax (0, (int) propOr (field, "offset", 0)));
    }

    const auto match = propOr (spec, "match");
    dump.prefix = varToByteList (hasProp (match, "prefix") ? propOr (match, "prefix") : propOr (spec, "prefix"));
    dump.suffix = varToByteList (hasProp (match, "suffix") ? propOr (match, "suffix") : propOr (spec, "suffix"));
    dump.offset = juce::jmax (0, (int) propOr (spec, "offset", 0));
    dump.size   = juce::jmax (0, (int) propOr (spec, "size", 0));
    dump.request = varToByteList (propOr (spec, "request"));

    if (hasProp (spec, "checksum"))
    {
        const auto cs = propOr (spec, "checksum");
        dump.checksumType = propOr (cs, "type", "roland-7bit").toString();
        dump.checksumFrom = juce::jmax (0, (int) propOr (cs, "fromOffset", 0));
        dump.checksumTo   = hasProp (cs, "toOffset") ? (int) propOr (cs, "toOffset") : -1;
        dump.checksumAt   = hasProp (cs, "byteOffset") ? (int) propOr (cs, "byteOffset") : -1;
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

int ScriptRuntime::declaredParameterNumber (const DeclaredParameter& p, const juce::var& value)
{
    if (p.type == "boolean")
    {
        const bool on = value.isBool() ? (bool) value
                                       : value.toString().trim().toLowerCase() == "true"
                                         || value.toString() == "1" || value.toString().toLowerCase() == "on";
        return on ? p.trueValue : p.falseValue;
    }
    if (p.type == "choice" || p.type == "enum")
        for (const auto& choice : p.choices)
            if (propOr (choice, "id").toString() == value.toString())
                return (int) propOr (choice, "value", 0);

    const double lo = juce::jmin (p.min, p.max);
    const double hi = juce::jmax (p.min, p.max);
    const double n = (double) value;
    return (int) std::lround (n < lo ? lo : n > hi ? hi : n);
}

juce::var ScriptRuntime::encodeDeviceParameter (const juce::String& role, const juce::String& id,
                                                const juce::var& value) const
{
    const auto* p = findDeclaredParameter (role, id);
    if (p == nullptr) return {};      // not ours — the caller falls through to the device profile

    const int number = declaredParameterNumber (*p, value);
    juce::Array<int> valueBytes;
    if (p->encoding == "u14") { valueBytes.add ((number >> 7) & 0x7f); valueBytes.add (number & 0x7f); }
    else if (p->encoding == "nibbled")
        for (int i = p->nibbles - 1; i >= 0; --i) valueBytes.add ((number >> (i * 4)) & 0x0f);
    else valueBytes.add (clamp7 ((double) number));

    juce::Array<int> bytes;
    if (p->wireKind == "cc")
    {
        bytes.add (0xb0 | (p->channel - 1));
        bytes.add (p->cc);
        bytes.add (clamp7 ((double) number));
    }
    else if (p->wireKind == "nrpn")
    {
        const int status = 0xb0 | (p->channel - 1);
        const int hi = p->encoding == "u14" ? valueBytes[0] : ((number >> 7) & 0x7f);
        const int lo = p->encoding == "u14" ? valueBytes[1] : (number & 0x7f);
        bytes.addArray ({ status, 99, p->msb, status, 98, p->lsb, status, 6, hi, status, 38, lo });
    }
    else
    {
        int sumFrom = -1;
        for (const auto& token : p->tmpl)
        {
            if (token == "$checksumStart") { sumFrom = bytes.size(); continue; }
            if (token == "$checksum")
            {
                // The marker is documented rather than inferred: a Roland checksum covers the
                // ADDRESS AND DATA, and no rule read off a template can know where the header stops.
                const int from = sumFrom >= 0 ? sumFrom : (bytes.size() > 0 && bytes[0] == 0xf0 ? 1 : 0);
                bytes.add (checksumOver (p->checksumKind, bytes, from, bytes.size() - 1));
                continue;
            }
            if (token == "$value" || token == "$encodedValue") { bytes.addArray (valueBytes); continue; }
            if (token.startsWith ("$"))
            {
                bytes.add (clamp7 ((double) p->variables.getWithDefault (
                    juce::Identifier (token.substring (1)), 0), 0, 255));
                continue;
            }
            bytes.add ((int) token.getHexValue32());
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
        if (i >= bytes.size() || (dump.prefix[i] >= 0 && bytes[i] != dump.prefix[i])) return {};
    for (int i = 0; i < dump.suffix.size(); ++i)
    {
        const int at = bytes.size() - dump.suffix.size() + i;
        if (at < 0 || (dump.suffix[i] >= 0 && bytes[at] != dump.suffix[i])) return {};
    }

    if (dump.checksumAt >= 0)
    {
        const int to = dump.checksumTo >= 0 ? dump.checksumTo : bytes.size() - 2;
        if (dump.checksumAt >= bytes.size() || dump.checksumFrom > to) return {};
        const auto kind = dump.checksumType == "sum-7bit" ? juce::String ("sum") : juce::String ("roland");
        if (bytes[dump.checksumAt] != checksumOver (kind, bytes, dump.checksumFrom, to)) return {};
    }

    auto* values = new juce::DynamicObject();
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
    out->setProperty ("values", juce::var (values));
    return juce::var (out);
}

juce::var ScriptRuntime::matchDeviceDump (const juce::String& role, const juce::var& bytes) const
{
    const auto it = deviceDeclarations.find (role.isEmpty() ? juce::String ("mainSynth") : role);
    if (it == deviceDeclarations.end() || it->second.dumps.empty()) return {};

    juce::Array<int> raw;
    if (auto* arr = bytes.getArray()) for (const auto& b : *arr) raw.add ((int) b);
    else raw = varToByteList (bytes);
    if (raw.isEmpty()) return {};

    for (const auto& dump : it->second.dumps)
    {
        const auto decoded = decodeDeclaredDump (role, dump, raw);
        if (! decoded.isVoid()) return decoded;
    }
    return {};
}

void ScriptRuntime::clearDeviceDefinitions()
{
    assertMessageThread();
    deviceDeclarations.clear();
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
