#include "ScriptRuntime.h"

namespace ceditor::scripting
{

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

void ScriptRuntime::reportError (const juce::String& scriptId, const juce::String& message)
{
    auto line = "[script " + scriptId + "] " + message;
    if (errorLogger) errorLogger (line);
    else juce::Logger::writeToLog (line);
}

void ScriptRuntime::loadScripts (const juce::var& scriptArray)
{
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

    const ScriptErrorSink onError = [this] (const juce::String& id, const juce::String& msg) { reportError (id, msg); };

    if (auto* arr = scriptArray.getArray())
    {
        for (auto& item : *arr)
        {
            auto def = ScriptDefinition::fromVar (item);
            if (! def.enabled) continue;
            if (auto* eng = engineFor (def.language))
            {
                if (eng->loadScript (def, onError))
                    scripts.push_back (def);
            }
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
    for (auto& s : scripts) if (s.event == "onPanelLoad") dispatchTo (s, "onPanelLoad", juce::var());
}

void ScriptRuntime::onPanelReady (bool firstTime)
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("firstTime", firstTime);
    const juce::var info (o);
    for (auto& s : scripts) if (s.event == "onPanelReady") dispatchTo (s, "onPanelReady", info);
}

void ScriptRuntime::onPanelClose()
{
    for (auto& s : scripts) if (s.event == "onPanelClose") dispatchTo (s, "onPanelClose", juce::var());
}

void ScriptRuntime::onDawSaveState (juce::var& store)
{
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

} // namespace ceditor::scripting
