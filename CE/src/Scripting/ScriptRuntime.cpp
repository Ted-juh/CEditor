#include "ScriptRuntime.h"

#include <juce_events/juce_events.h>

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

void ScriptRuntime::reportError (const juce::String& scriptId, const juce::String& message)
{
    auto line = "[script " + scriptId + "] " + message;
    if (errorLogger) errorLogger (line);
    else juce::Logger::writeToLog (line);
}

void ScriptRuntime::loadScripts (const juce::var& scriptArray)
{
    assertMessageThread();
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
