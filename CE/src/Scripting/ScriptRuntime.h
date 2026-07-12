#pragma once
//
// ScriptRuntime — the C++ host-side scripting engine for CEditor panels (Milestone 1, tasks 5–7).
//
// Model 2: scripts ALWAYS run here, in the C++ host, on the MESSAGE THREAD (never the audio
// thread). The WebView is only a view. One engine per language (Sol3 Lua + juce_javascript),
// no conversion between languages — a script is stored and run in the language it was written in.
//
// Architecture (decoupled so it compiles independently of the rest of the app):
//   • ScriptHostApi  — what a script can DO (set/get values, send MIDI, dumps, emit/run, log).
//                      The app implements this once, adapting ValueTreeBridge + DeviceProfileService.
//   • ScriptEngine   — one per language; loads sources, dispatches handler calls. Per-script
//                      isolation (each script its own environment) so handler names never clash.
//   • ScriptRuntime  — owns the engines + the script set; routes lifecycle hooks and events to the
//                      right scripts; tracks inbound origin for transmit-by-default (Q2); logs errors.
//
// Spec: tools/docs/panel-api-spec.md (Q1–Q11). The JS side of the API surface lives in
// CE/web/src/CE_Application/scripting/panelApi.js — keep the two in sync.
//
// THREADING: every public method here must be called on the JUCE message thread. The audio thread
// marshals incoming MIDI to the message thread before dispatching (DeviceProfileService already
// uses MessageManager::callAsync for its event callback).

#include <juce_core/juce_core.h>
#include <functional>
#include <memory>
#include <vector>

namespace ceditor::scripting
{

/** Identifies the script currently executing, so the host can resolve scope-relative paths
    (a component script sees only its own parts) and apply origin-based transmit rules. */
struct ScriptContext
{
    juce::String id;       // unique script id
    juce::String scope;    // "component" | "panel" | "device" | "project"
    juce::String owner;    // the control/component name the script is attached to (for `self` + relative paths)
};

/** One stored, source-based script (mirrors web/scripting/scriptModel.js). */
struct ScriptDefinition
{
    juce::String id;
    juce::String name;
    juce::String language;  // "lua" | "javascript"
    juce::String source;    // the real code
    juce::String scope;     // component | panel | device | project
    juce::String event;     // the lifecycle hook / event handler name it runs on (e.g. "onValueChanged")
    juce::String owner;     // attached control/component name ("" for panel/project)
    bool enabled = true;

    ScriptContext context() const { return { id, scope, owner }; }
    static ScriptDefinition fromVar (const juce::var& v);
};

/** Reported when a script throws or a guard trips. Never crashes the panel (Q11). */
using ScriptErrorSink = std::function<void (const juce::String& scriptId, const juce::String& message)>;

// ----------------------------------------------------------------------------------------------
/** What a script can ask the host to do. Implemented by the app once (BridgeScriptHost), adapting
    ValueTreeBridge (values) + DeviceProfileService (MIDI/dumps). All calls happen on the message
    thread, inside a dispatch, with the current ScriptContext set via enterScript/exitScript. */
class ScriptHostApi
{
public:
    virtual ~ScriptHostApi() = default;

    // Context — set around every handler call so the host can resolve relative paths + origin.
    virtual void enterScript (const ScriptContext&) {}
    virtual void exitScript() {}

    // noTransmit()/transmit() blocks (Q2). The engine wraps the user block in these.
    // `transmit=false` => the block's writes never reach the synth; `true` => force send.
    virtual void beginTransmitOverride (bool transmit) { juce::ignoreUnused (transmit); }
    virtual void endTransmitOverride() {}

    // Values (Q1, Q2, Q8). `form` is "value" (default) | "normalizedValue" | "midiValue".
    // `transmit`: whether to also send to the synth (the runtime computes the default from origin).
    virtual juce::var getValue (const juce::String& path, const juce::String& form) = 0;
    // `options` may carry { transmit: bool }. If absent, the host applies the origin-based default
    // (loud, unless inbound or inside a noTransmit block) via ScriptRuntime::defaultTransmit().
    virtual void      setValue (const juce::String& path, const juce::var& value, const juce::var& options) = 0;

    // Device / MIDI (Q9).
    virtual void sendCC   (int channel, int cc, const juce::var& value) = 0;
    virtual void sendNRPN (int channel, int msb, int lsb, const juce::var& value) = 0;
    virtual void sendSysex (const juce::var& bytes) = 0;
    virtual void requestDump (const juce::String& kind) = 0;
    virtual void applyDump  (const juce::var& bytes) = 0;   // fills the panel; runs in inbound origin (silent)
    virtual void sendDump   (const juce::String& kind) = 0;
    virtual juce::var buildDump (const juce::String& kind) = 0;

    // Flow / composition (Q6). run() is host-dispatched (works cross-language).
    virtual juce::var runAction (const juce::String& target, const juce::var& args) = 0;
    virtual void      emitEvent (const juce::String& name, const juce::var& data) = 0;

    // Debug (Q11).
    virtual void log (const juce::String& message, const juce::var& value) = 0;

    // Timers. startTimer(id, ms) starts a repeating timer that fires `onTimer` ({ id }) every ms
    // until stopTimer(id). Default no-op so alternative hosts need not implement them.
    virtual void startTimer (const juce::String& id, int intervalMs) { juce::ignoreUnused (id, intervalMs); }
    virtual void stopTimer  (const juce::String& id) { juce::ignoreUnused (id); }
};

// ----------------------------------------------------------------------------------------------
/** One language engine. Each script is loaded into its own isolated environment so two scripts
    can both define `onValueChanged` without clashing, and `self` is per-script. */
class ScriptEngine
{
public:
    virtual ~ScriptEngine() = default;

    virtual juce::String language() const = 0;

    /** Install the panel API (global functions calling back into `host`) into the engine. */
    virtual bool installApi (ScriptHostApi& host) = 0;

    /** Load a script's source into its own environment. Returns false (and reports) on a load error. */
    virtual bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) = 0;

    /** Does this script define a function with the given name? */
    virtual bool hasHandler (const juce::String& scriptId, const juce::String& fn) const = 0;

    /** Call scriptId's `fn(payload)`. Caught errors are reported via onError; never throws out. */
    virtual juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                                const juce::var& payload, const ScriptErrorSink& onError) = 0;

    /** Fire any on(target,event,fn) listeners registered (in this engine's scripts) for (target,event).
        Default no-op for engines that only support named handlers. */
    virtual void deliverEvent (const juce::String& target, const juce::String& event,
                               const juce::var& payload, const ScriptErrorSink& onError)
    { juce::ignoreUnused (target, event, payload, onError); }

    /** Drop all loaded scripts/environments. */
    virtual void reset() = 0;
};

std::unique_ptr<ScriptEngine> createLuaEngine();
std::unique_ptr<ScriptEngine> createJsEngine();
std::unique_ptr<ScriptEngine> createPythonEngine();   // only linked when CEDITOR_PYTHON is built

// ----------------------------------------------------------------------------------------------
/** Owns the engines + the script set; routes lifecycle and events to the right scripts. */
class ScriptRuntime
{
public:
    explicit ScriptRuntime (ScriptHostApi& host);
    ~ScriptRuntime();

    /** Where caught errors go (editor console / log file). */
    void setErrorLogger (std::function<void (const juce::String&)> logger) { errorLogger = std::move (logger); }

    /** Replace the loaded scripts from a JSON array of ScriptDefinitions (from the panel's Scripts
        sections). Re-installs the API and reloads every enabled script. */
    void loadScripts (const juce::var& scriptArray);

    // --- Lifecycle (task 6) ---
    void onPanelLoad();
    void onPanelReady (bool firstTime);
    void onPanelClose();
    void onDawSaveState (juce::var& store);       // scripts write into `store`
    void onDawRestoreState (const juce::var& store);

    // --- Events / phase 3 (task 5) ---
    /** Fire `event` for `target`. Scripts whose (event,target/scope) match are dispatched.
        `payload` is passed to the handler. */
    void dispatchEvent (const juce::String& event, const juce::String& target, const juce::var& payload);

    // --- Origin tracking for transmit-by-default (Q2) ---
    bool isInbound() const { return inboundDepth > 0; }

    /** Whether a setValue happening right now should transmit to the synth:
        an explicit noTransmit/transmit block wins; otherwise loud unless we're inbound. */
    bool defaultTransmit() const
    {
        if (transmitOverride == 0) return false;  // inside noTransmit(...)
        if (transmitOverride == 1) return true;   // inside transmit(...)
        return inboundDepth == 0;                  // loud by default, silent while inbound
    }

    void pushInbound()  { ++inboundDepth; }
    void popInbound()   { if (inboundDepth > 0) --inboundDepth; }
    void pushTransmit (bool transmit) { transmitStack.push_back (transmitOverride); transmitOverride = transmit ? 1 : 0; }
    void popTransmit()  { if (! transmitStack.empty()) { transmitOverride = transmitStack.back(); transmitStack.pop_back(); } else transmitOverride = -1; }

private:
    friend class InboundScope;

    ScriptEngine* engineFor (const juce::String& language);
    void dispatchTo (const ScriptDefinition& def, const juce::String& fn, const juce::var& payload);
    void reportError (const juce::String& scriptId, const juce::String& message);

    ScriptHostApi& host;
    std::unique_ptr<ScriptEngine> lua;
    std::unique_ptr<ScriptEngine> js;
    std::unique_ptr<ScriptEngine> python;   // null unless CEDITOR_PYTHON — python scripts no-op if absent
    std::vector<ScriptDefinition> scripts;
    std::function<void (const juce::String&)> errorLogger;

    int inboundDepth = 0;      // >0 while reacting to inbound MIDI/dump → setValue is silent by default
    int transmitOverride = -1; // -1 none, 0 force-silent (noTransmit), 1 force-loud (transmit)
    std::vector<int> transmitStack; // nested noTransmit/transmit blocks

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ScriptRuntime)
};

/** RAII: marks an inbound region (incoming MIDI/dump). setValue inside is silent by default. */
class InboundScope
{
public:
    explicit InboundScope (ScriptRuntime& r) : rt (r) { ++rt.inboundDepth; }
    ~InboundScope() { --rt.inboundDepth; }
private:
    ScriptRuntime& rt;
};

} // namespace ceditor::scripting
