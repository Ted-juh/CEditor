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
    juce::String language;  // "lua" | "javascript" | "typescript"
    juce::String source;    // the real code (the language the user wrote)
    juce::String compiledSource; // for "typescript": the editor-transpiled JS the JS engine runs (empty otherwise)
    juce::String scope;     // component | panel | device | project
    juce::String event;     // the lifecycle hook / event handler name it runs on (e.g. "onValueChanged")
    juce::String owner;     // attached control/component name ("" for panel/project)
    bool enabled = true;

    ScriptContext context() const { return { id, scope, owner }; }
    static ScriptDefinition fromVar (const juce::var& v);
};

/** What `self` resolves against, for any engine building a script's `self` proxy.

    `self` is the element the script is attached to: the CONTROL for a component script, and THE
    PANEL for a panel script. The panel half was documented from the start ("control, panel, or
    custom-component instance") but never worked — there was no way to address the panel at all,
    so self.set("width", 800) landed on a control named "width" and reported it missing.

    Returns an empty string when `self` should add no prefix (a project-scope script, or one whose
    owner is the wildcard), in which case a relative path is just a global path. */
inline juce::String resolveSelfOwner (const ScriptDefinition& def)
{
    if (def.owner.isNotEmpty() && def.owner != "self" && def.owner != "*") return def.owner;
    return def.scope == "panel" ? juce::String ("panel") : juce::String();
}

/** Reported when a script throws or a guard trips. Never crashes the panel (Q11). */
using ScriptErrorSink = std::function<void (const juce::String& scriptId, const juce::String& message)>;

/** A script that failed to load (or has no engine in this build) and is therefore inactive.
    Kept by ScriptRuntime so hosts can tell the user instead of degrading silently. */
struct FailedScript
{
    juce::String id;
    juce::String name;
    juce::String language;
    juce::String message;
};

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
    /** Raw MIDI bytes, exactly as given — no F0/F7 wrapping, no channel maths. Notes, program
        changes, pitch bend, aftertouch and clock are all prelude arithmetic over this one call, the
        way panic() is over sendCC, which is what keeps them portable to every runtime. */
    virtual void sendMidi (const juce::var& bytes) { juce::ignoreUnused (bytes); }
    virtual void requestDump (const juce::String& kind) = 0;
    virtual void applyDump  (const juce::var& bytes) = 0;   // fills the panel; runs in inbound origin (silent)
    virtual void sendDump   (const juce::String& kind) = 0;
    virtual juce::var buildDump (const juce::String& kind) = 0;

    /** READ the device profile. One primitive behind four script verbs (ce.device.profile /
        .parameters / .parameter / .connected), the way sendMidi sits behind every channel message:
        the shape a script sees is assembled in the prelude, so no engine can invent a different
        parameter descriptor.

        `kind` is "profile" | "parameters" | "parameter" | "connected"; `payload` carries the role
        and any narrowing (query/group/type/access/limit/id). Returns void when there is no device
        host, which is what makes the members report themselves as unavailable rather than lie. */
    virtual juce::var deviceQuery (const juce::String& kind, const juce::var& payload)
    { juce::ignoreUnused (kind, payload); return {}; }

    /** ce.anim — start/stop/query. These route to ScriptRuntime, which owns the animation list;
        a host does not implement them itself. */
    virtual void startAnimation (const juce::String& kind, const juce::String& path,
                                 double target, const juce::var& opts)
    { juce::ignoreUnused (kind, path, target, opts); }
    virtual void stopAnimation (const juce::String& path) { juce::ignoreUnused (path); }
    virtual bool animationRunning (const juce::String& path) { juce::ignoreUnused (path); return false; }

    /** ce.ui — tell whoever is using the panel something. Panel view only, so the default is a
        no-op and the C++ engines stub the verbs; this exists for a host that DOES have a surface
        (the editor's WebView bridge) rather than for the shipped plugin. */
    virtual void uiNotify (const juce::String& message, const juce::var& opts)
    { juce::ignoreUnused (message, opts); }
    virtual void uiStatus (const juce::String& message) { juce::ignoreUnused (message); }

    /** The transport, as one snapshot: { playing, bpm, beats, beatsPerBar, source, valid }.
        `beats` counts quarter notes from the transport origin. One primitive behind tempo(),
        isPlaying() and transportInfo(), so the three can never disagree with each other.

        Void when nothing is reporting a transport, which is what makes `valid` false rather than
        the panel inventing 120bpm and calling it a measurement. */
    virtual juce::var transportState() { return {}; }

    // Flow / composition (Q6). run() is host-dispatched (works cross-language).
    virtual juce::var runAction (const juce::String& target, const juce::var& args) = 0;
    virtual void      emitEvent (const juce::String& name, const juce::var& data) = 0;

    // Debug (Q11).
    virtual void log (const juce::String& message, const juce::var& value) = 0;

    // Timers. startTimer(id, ms) starts a repeating timer that fires `onTimer` ({ id }) every ms
    // until stopTimer(id). Default no-op so alternative hosts need not implement them.
    virtual void startTimer (const juce::String& id, int intervalMs) { juce::ignoreUnused (id, intervalMs); }
    virtual void stopTimer  (const juce::String& id) { juce::ignoreUnused (id); }

    /** Settings that outlive the session. Where they land is the host's business: the editor keeps
        them with the panel so they travel with it, the exported plugin puts them in the DAW project
        state. `state` (a per-script scratchpad) needs no host at all — the script's own environment
        already persists for as long as it is loaded. */
    virtual void saveSetting (const juce::String& key, const juce::var& value) { juce::ignoreUnused (key, value); }
    virtual juce::var loadSetting (const juce::String& key) { juce::ignoreUnused (key); return {}; }
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

    /** Gate the API down to the modules this panel declared (design doc §5, "Opt-in and cost").
        The list is module ids — "ce.midi", "ce.storage". An EMPTY list means "not declared":
        every module stays on, so a panel written before modules existed is unaffected.
        `ce.core` is always on regardless.

        Members of a module that is off are replaced by a stub that names the module rather than
        removed. `attempt to call a nil value` is the failure mode this whole layer exists to
        avoid; a call that explains itself is the point.

        Default no-op: an engine that has no prelude (the native-handler engine) has nothing to
        gate — a compiled module's calls go through the vtable, which the host already checks. */
    virtual void setEnabledModules (const juce::StringArray& moduleIds) { juce::ignoreUnused (moduleIds); }

    /** Install third-party modules (ce.ext.*) into this engine (design doc §8).

        `modules` is an array of { id, version, runtime, members: [{ id, name }], prelude: {...} }.
        The engine evaluates its own language's prelude — which defines the module's globals — and
        then hands the member map to the generated `__ce_register_module`, after which the module
        is indistinguishable from a built-in one: same namespace table, same gate, same ce.has().

        A module whose prelude carries nothing for this language is skipped, not an error: a module
        may legitimately ship Lua and JavaScript and no Python.

        Default no-op: the native-handler engine has no prelude to append to. That is a real limit
        and it is stated in NativeHandlerAbi.h rather than left to be discovered. */
    virtual void setExtensionModules (const juce::var& modules) { juce::ignoreUnused (modules); }

    /** Drop all loaded scripts/environments. */
    virtual void reset() = 0;
};

std::unique_ptr<ScriptEngine> createLuaEngine();
std::unique_ptr<ScriptEngine> createJsEngine();
std::unique_ptr<ScriptEngine> createPythonEngine();   // only linked when CEDITOR_PYTHON is built
std::unique_ptr<ScriptEngine> createNativeHandlerEngine(); // C++/C#/Java compiled-at-export modules; only when CEDITOR_NATIVE_HANDLERS is built

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

    /** The modules the panel declared, from `scripting.modules`. Empty = not declared = all on.
        Call BEFORE loadScripts: the gate has to be in place before a script's top-level code runs,
        or a module-gated call at load time would slip through. */
    void setEnabledModules (const juce::StringArray& moduleIds);

    /** Third-party modules this panel carries, from `scripting.extensions`. Also before
        loadScripts, and before setEnabledModules has to mean anything: a module that is not
        installed cannot be enabled. */
    void setExtensionModules (const juce::var& modules);

    /** Read `scripting.extensions` off a panel document — the copies the exporter baked in. A
        shipped plugin has no CEditor install to read a module from, so the export carries it. */
    static juce::var extensionsFromPanel (const juce::var& panel);

    /** What the gate is currently set to. Empty means ungated. */
    const juce::StringArray& enabledModules() const { return enabledModuleIds; }

    /** Read `scripting.modules` off a panel document. Absent or not an array -> empty (ungated):
        the editor resolves `auto` and BAKES the result into the exported panel, so by the time a
        document reaches this runtime the list is either explicit or deliberately absent. */
    static juce::StringArray modulesFromPanel (const juce::var& panel);

    /** Scripts that were enabled but did NOT load (compile error, missing engine in this build).
        They receive no events; surface these to the user rather than failing silently. */
    const std::vector<FailedScript>& failedScripts() const { return failed; }

    /** Number of scripts that loaded successfully and are live. */
    int loadedScriptCount() const { return (int) scripts.size(); }

    // --- Lifecycle (task 6) ---
    void onPanelLoad();
    void onPanelReady (bool firstTime);
    void onPanelClose();
    void onDawSaveState (juce::var& store);       // scripts write into `store`
    void onDawRestoreState (const juce::var& store);

    // --- Events / phase 3 (task 5) ---
    /** Fire `event` for `target`. Scripts whose (event,target/scope) match are dispatched.
        `payload` is passed to the handler.

        Guarded against feedback loops (anti-flood, redesign §7): a handler that emits an
        event which dispatches a handler that emits again … is cut off (and reported) once
        the nesting exceeds a fixed depth, instead of recursing until the stack dies. */
    void dispatchEvent (const juce::String& event, const juce::String& target, const juce::var& payload);

    // --- ce.anim: values that move over time (design doc §6 phase 6) -------------------------
    /** Start (or replace) an animation on `path`.

        `kind` is "to" (eased ramp) or "spring" (damped oscillation). `opts` carries duration,
        curve/damping/frequency and an optional `from`. Starting a second animation on the same
        path REPLACES the first — a value has one destination.

        The position is a pure function of elapsed time, never an accumulated step: two runtimes
        integrating independently drift apart, two runtimes evaluating the same formula at the same
        elapsed time cannot. animationValueAt() below is that formula, and it is the thing the
        WebView runtime has to match. */
    void startAnimation (const juce::String& kind, const juce::String& path,
                         double target, const juce::var& opts);

    /** Stop one animation, or every one when `path` is empty. The value stays where it got to. */
    void stopAnimation (const juce::String& path = {});

    /** Is `path` animating? With an empty path, is anything? */
    bool animationRunning (const juce::String& path = {}) const;

    /** Advance every animation to `nowMs` and write the values. The host calls this from whatever
        message-thread timer it already runs — 30Hz in the player, which is what the beat events
        use too. Nothing here touches the audio thread. */
    void tickAnimations (double nowMs);

    /** THE position formula, shared by every runtime. Exposed so tests can pin it directly.
        `progress` is elapsed/duration, already clamped to 0..1 by the caller. */
    static double animationEase (double progress, const juce::String& curve);
    static double animationSpring (double progress, double damping, double frequency);

    /** run("target.action" [, args]) — call a named function defined by another script.
        `ref` is "owner.action" (the action on the script attached to `owner`) or a bare "action"
        (the first script that defines it, whatever it is attached to). Returns the handler's
        return value, or void if nothing matched.

        Host-dispatched on purpose: the caller and the callee can be written in different
        languages, so the call goes through the runtime rather than the language's own scope.
        Lives here, not in the app's callbacks, because the runtime is what owns the script set —
        wiring it per-host is how the exported player ended up with run() as a silent no-op. */
    juce::var runAction (const juce::String& ref, const juce::var& args);

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
    void applyModuleGates();
    void applyExtensionModules();

    ScriptHostApi& host;
    std::unique_ptr<ScriptEngine> lua;
    std::unique_ptr<ScriptEngine> js;
    std::unique_ptr<ScriptEngine> python;   // null unless CEDITOR_PYTHON — python scripts no-op if absent
    std::unique_ptr<ScriptEngine> native;   // null unless CEDITOR_NATIVE_HANDLERS — cpp/csharp/java no-op if absent
    std::vector<ScriptDefinition> scripts;
    std::vector<FailedScript> failed;
    std::function<void (const juce::String&)> errorLogger;
    juce::StringArray enabledModuleIds;   // empty = the panel declared nothing = every module on
    juce::var extensionModules;           // ce.ext.* copies the panel carries (void = none)

    struct Animation
    {
        juce::String kind;     // "to" | "spring"
        juce::String path;
        double from = 0.0, to = 0.0;
        double startMs = 0.0, duration = 300.0;
        juce::String curve = "linear";
        double damping = 6.0, frequency = 12.0;
    };
    std::vector<Animation> animations;
    double animationNowMs = 0.0;   // the last tick, so a new animation starts from a known moment
    // Whether a tick has EVER happened — not `animationNowMs == 0`, because zero is a perfectly
    // good tick time when the caller drives the clock, which is the only way to test an animation
    // without waiting on a real one.
    bool animationTicked = false;

    int inboundDepth = 0;      // >0 while reacting to inbound MIDI/dump → setValue is silent by default
    int transmitOverride = -1; // -1 none, 0 force-silent (noTransmit), 1 force-loud (transmit)
    std::vector<int> transmitStack; // nested noTransmit/transmit blocks

    static constexpr int maxDispatchDepth = 16; // emit→dispatch→emit feedback-loop backstop
    int dispatchDepth = 0;

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
