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

    reportError ("runtime", "run('" + ref + "') found no script defining " + action + "()");
    return {};
}

} // namespace ceditor::scripting
