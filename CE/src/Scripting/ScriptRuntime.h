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
#include <array>
#include <functional>
#include <map>
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

    // routeMidi(role, fn) blocks. Sends inside the block go to `role` instead of the default
    // device. A block override rather than a role argument on thirteen senders: the destination is
    // a decision about a RUN of sends, and threading it through every signature in four runtimes
    // would be the same decision written thirteen times.
    virtual void beginRouteOverride (const juce::String& role) { juce::ignoreUnused (role); }
    virtual void endRouteOverride() {}

    /** feedMidi(bytes) — inject as if the hardware had sent it, so the panel's own bindings, note
        input and transport all act on it. set() moves a control directly and bypasses every
        binding; this is the other thing. Default no-op: a host with no MIDI input to speak of has
        nothing to inject into. */
    virtual void feedMidi (const juce::var& bytes) { juce::ignoreUnused (bytes); }

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

    /** SET a device parameter on the synth, by parameter id. Separate from deviceQuery because it
        is not a query: the device profile encodes the value and the message goes out. Returns
        whether it was dispatched — not whether the synth accepted it, which nothing here can know.
        False with no device host, which is what makes the verb report itself rather than lie. */
    virtual bool deviceWrite (const juce::String& parameterId, const juce::var& value,
                              const juce::String& role)
    { juce::ignoreUnused (parameterId, value, role); return false; }

    /** DECLARE structure the app was not shipped knowing: `what` is "parameter" or "dump", `id` is
        the parameter id or the dump kind, `spec` carries the wire format. Routes to ScriptRuntime,
        which owns the declarations, for the same reason ce.anim does — two hosts each keeping their
        own copy of the same declaration is two synths' worth of drift waiting to happen.

        Returns whether it was accepted. A refusal has already been reported by then. */
    virtual bool deviceDefine (const juce::String& what, const juce::String& id, const juce::var& spec)
    { juce::ignoreUnused (what, id, spec); return false; }

    /** ce.anim — start/stop/query. These route to ScriptRuntime, which owns the animation list;
        a host only forwards. `path` is a string OR a list of strings: one call, one shape, one
        completion, which is what makes `stagger` worth having. */
    virtual void startAnimation (const juce::String& kind, const juce::var& path,
                                 double target, const juce::var& opts)
    { juce::ignoreUnused (kind, path, target, opts); }
    virtual void stopAnimation (const juce::String& path) { juce::ignoreUnused (path); }
    virtual bool animationRunning (const juce::String& path) { juce::ignoreUnused (path); return false; }
    /** Where an animation IS, and everything running. running() answers whether; these answer how
        far, which is what a progress read or a decision to interrupt actually needs. */
    virtual juce::var animationValue (const juce::String& path) { juce::ignoreUnused (path); return {}; }
    virtual juce::var animationList() { return {}; }
    /** Hold / carry on / turn around / land it. stop() is a cancel and always was; these are the
        four things a script wanted that a cancel is not. */
    virtual bool animationPause (const juce::String& path) { juce::ignoreUnused (path); return false; }
    virtual bool animationResume (const juce::String& path) { juce::ignoreUnused (path); return false; }
    virtual bool animationReverse (const juce::String& path) { juce::ignoreUnused (path); return false; }
    virtual bool animationFinish (const juce::String& path) { juce::ignoreUnused (path); return false; }

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

    /** A monotonic millisecond reading, behind ce.time.now(). NOT a wall clock: the origin is
        arbitrary and only differences mean anything, which is deliberate — a wall clock jumps when
        the machine syncs its time, and a script measuring an interval across that jump measures the
        jump instead of the interval.

        Unlike everything else on this interface this has a REAL default rather than a void one,
        because it is platform code and not app state: there is nothing a host could know about the
        passage of time that juce::Time does not. A host may still override it (a test that wants a
        clock it controls), but none has to.

        It exists at all because the Lua engine opens base, math, string and table and NOT os, so a
        Lua script has no clock whatsoever; and Date/time.time() in the other two disagree about
        both epoch and unit, so "use the language's own" was never available here either. */
    virtual double nowMs() { return juce::Time::getMillisecondCounterHiRes(); }

    /** Ask the panel document about itself. `kind` "controls" returns an array of control NAMES, in
        document order — what ce.panel.snapshot walks. Kept as one query verb rather than a method
        per question for the same reason deviceQuery is: a host that cannot answer returns nothing,
        and adding a question later does not change the interface every host has to implement. */
    virtual juce::var panelQuery (const juce::String& kind, const juce::var& payload)
    { juce::ignoreUnused (kind, payload); return {}; }

    // Flow / composition (Q6). run() is host-dispatched (works cross-language).
    virtual juce::var runAction (const juce::String& target, const juce::var& args) = 0;
    virtual void      emitEvent (const juce::String& name, const juce::var& data) = 0;

    // Debug (Q11).
    virtual void log (const juce::String& message, const juce::var& value) = 0;

    /** log() at a LEVEL. `kind` is "log" | "warn" | "error" — the levels the console already
        renders differently, which a script could not reach until now. Defaults to log() so a host
        written before this still compiles and still prints; overriding it is what makes a warning
        look like a warning. */
    virtual void logAt (const juce::String& kind, const juce::String& message, const juce::var& value)
    { juce::ignoreUnused (kind); log (message, value); }

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
    /** Every saved key, as an array of strings. Empty means nothing written — not unavailable. */
    virtual juce::var listSettings() { return juce::var (juce::Array<juce::var>()); }
    /** Delete one. True when there WAS one, so a script can tell "cleaned up" from "nothing there". */
    virtual bool forgetSetting (const juce::String& key) { juce::ignoreUnused (key); return false; }
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

    /** Re-evaluate this engine's compute() formulas and fire its watch() callbacks.

        The reactive rules are language-native closures, so they can only live inside the engine
        that made them — the runtime owns WHEN they run, the engine owns WHAT runs. Called after
        every dispatch, because that is when the model has just moved.

        Default no-op: an engine with no reactive verbs (the native-handler engine, whose modules
        are compiled and cannot register a closure at runtime) has nothing to settle. */
    virtual void runReactive (const ScriptErrorSink& onError) { juce::ignoreUnused (onError); }

    /** Run this engine's intercept() filters for `path`.

        Returns false when a filter rejected the write outright; otherwise `value` carries whatever
        the filters made of it — possibly unchanged. Engine-local, because `set` is bound inside the
        engine and this has to sit between that binding and the host.

        Default: accept unchanged. An engine with no filters must not be able to block a write. */
    virtual bool applyIntercepts (const juce::String& path, juce::var& value, const ScriptErrorSink& onError)
    {
        juce::ignoreUnused (path, value, onError);
        return true;
    }

    /** Call a defineAction()-registered action, if this engine has one by that name.

        Returns false when it has not, so the caller can go on looking in the other engines — an
        action defined in Lua has to be callable from a JavaScript script, which is the whole point
        of naming it rather than calling a function directly. */
    virtual bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                             const ScriptErrorSink& onError)
    {
        juce::ignoreUnused (name, args, result, onError);
        return false;
    }

    /** The action names this engine has registered, for the editor's binding UI and for the
        "no such action" message, which is far more use naming what DOES exist. */
    virtual juce::StringArray registeredActions() const { return {}; }

    /** Run this engine's interceptMidiIn / interceptMidiOut filters over one message.

        `inbound` picks the chain. Returns false when a filter swallowed the message; otherwise
        `bytes` carries whatever the filters made of it. Unlike the value filters, this one is
        called by the HOST rather than by a binding inside the engine: inbound reaches the panel's
        bindings, the note input and the transport long before any script sees it, and outbound
        leaves from a control's own binding as often as from a sendCC. Filtering only where scripts
        happen to look would be a rule that holds for scripts and not for the panel.

        A throwing filter passes the message through UNCHANGED rather than dropping it — a broken
        script must not be able to silence a synth. */
    virtual bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError)
    {
        juce::ignoreUnused (inbound, bytes, onError);
        return true;
    }

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

    /** Phase 5 — the loaded SCRIPTS are going away, which is not the same as the window closing.
        A plugin whose editor is shut is still playing: `onPanelClose` says the view went, this
        says the scripts themselves are being torn down (panel switched, script set replaced,
        plugin unloaded). It is the last thing they run, and everything still works while it does.

        Fires at most ONCE per loaded set, and `loadScripts` calls it for you before replacing an
        existing set — so a host only has to call it explicitly at real shutdown. It is deliberately
        NOT called from the destructor: running arbitrary script code against a host that may
        already be half torn down is the one thing a teardown hook must never do. */
    void onPanelDestroy();

    void onDawSaveState (juce::var& store);       // scripts write into `store`
    void onDawRestoreState (const juce::var& store);

    // --- Events / phase 3 (task 5) ---
    /** Fire `event` for `target`. Scripts whose (event,target/scope) match are dispatched.
        `payload` is passed to the handler.

        Guarded against feedback loops (anti-flood, redesign §7): a handler that emits an
        event which dispatches a handler that emits again … is cut off (and reported) once
        the nesting exceeds a fixed depth, instead of recursing until the stack dies. */
    void dispatchEvent (const juce::String& event, const juce::String& target, const juce::var& payload);

    /** Run every engine's interceptMidiIn / interceptMidiOut chain over one message.

        The HOST calls this — from wherever inbound MIDI arrives, before the bindings act on it, and
        from wherever outbound MIDI leaves, after the bindings have produced it. That placement is
        the whole point: a filter applied only where scripts listen would be a rule that holds for
        scripts and not for the panel.

        Returns false when a filter swallowed the message (do not deliver / do not send); otherwise
        `bytes` carries whatever the filters made of it. */
    bool filterMidi (bool inbound, juce::var& bytes);

    // --- ce.anim: values that move over time (design doc §6 phase 6) -------------------------
    /** Start (or replace) an animation on `path`.

        `kind` is "to" (eased ramp) or "spring" (damped oscillation). `opts` carries duration,
        curve/damping/frequency and an optional `from`. Starting a second animation on the same
        path REPLACES the first — a value has one destination.

        The position is a pure function of elapsed time, never an accumulated step: two runtimes
        integrating independently drift apart, two runtimes evaluating the same formula at the same
        elapsed time cannot. animationValueAt() below is that formula, and it is the thing the
        WebView runtime has to match. */
    void startAnimation (const juce::String& kind, const juce::var& path,
                         double target, const juce::var& opts = {});

    /** Stop one animation, or every one when `path` is empty. The value stays where it got to, and
        the completion callback fires with completed = false — a cancel is an outcome. */
    void stopAnimation (const juce::String& path = {});

    /** Is `path` animating? With an empty path, is anything? */
    bool animationRunning (const juce::String& path = {}) const;

    /** Where it is: { path, kind, value, progress, from, to, elapsed, remaining, paused, cycle,
        sync }, or void when nothing is running on the path. `elapsed`/`remaining` are void for a
        transport-synced animation — how long it has left depends on a tempo nobody has played. */
    juce::var animationValue (const juce::String& path) const;
    /** Every animation running, in path order, each as animationValue describes it. */
    juce::var animationList() const;

    bool animationPause (const juce::String& path);    ///< Hold where it is, without ending it.
    bool animationResume (const juce::String& path);   ///< Carry on — continuing, not restarting.
    bool animationReverse (const juce::String& path);  ///< Turn around, back at the same rate.
    bool animationFinish (const juce::String& path);   ///< Land on the target and complete.

    /** Advance every animation to `nowMs` and write the values. The host calls this from whatever
        timer it already runs. */
    void tickAnimations (double nowMs);

    /** The easing curves, exposed for testing and shared by every runtime. `known` reports whether
        the name was recognised — an unknown curve used to be silently linear, including for the
        names the Properties panel itself offers. */
    static double animationEase (double progress, const juce::String& curve, bool* known = nullptr);
    static double animationSpring (double progress, double damping, double frequency);
    /** A CSS cubic-bezier evaluated numerically, so a script animating with "outCubic" traces the
        path the panel's transition does rather than a lookalike. Fixed iteration counts: four
        runtimes have to produce the same double, and a loop that stops on a tolerance stops after a
        different number of steps the moment one of them rounds differently. */
    static double cubicBezierEase (double t, double x1, double y1, double x2, double y2);

    // --- ce.device: declaring what the app was not shipped knowing (design doc §29) -----------
    /** A parameter or a dump layout a SCRIPT declared, for a synth the app has no profile for.
        Held here rather than in the host because the declaration IS the codec: the same bytes have
        to go out from a scripted write and from a bound control's write, and the same layout has to
        decode an arriving dump. One owner, one answer.

        Declarations are script-lifetime — clearDeviceDefinitions() runs before every onPanelBuild,
        which is what makes a build idempotent and what stops one leaking into the saved document.

        `spec` is the same shape the WebView runtime accepts (deviceDefinitions.js); the two are
        pinned against each other by CE/tests/ScriptRuntimeTests.cpp and deviceDefinitions.test.js. */
    bool defineDeviceParameter (const juce::String& role, const juce::String& id, const juce::var& spec);
    bool defineDeviceDump      (const juce::String& role, const juce::String& kind, const juce::var& spec);

    bool hasDeviceParameter (const juce::String& role, const juce::String& id) const;
    bool hasDeviceDump      (const juce::String& role, const juce::String& kind) const;

    /** The declared descriptors, in the shape a profile-backed one has plus `defined = true`. */
    juce::var declaredDeviceParameters (const juce::String& role) const;
    juce::var declaredDeviceParameter  (const juce::String& role, const juce::String& id) const;

    /** The bytes that SET a declared parameter, or void when the parameter is not declared here —
        which is how the caller knows to fall through to the device profile. */
    juce::var encodeDeviceParameter (const juce::String& role, const juce::String& id,
                                     const juce::var& value) const;

    /** The bytes that ASK for a declared dump. Empty when the layout declared no request. */
    juce::var deviceDumpRequest (const juce::String& role, const juce::String& kind) const;

    /** Try every declared layout against a message that just arrived. Returns
        { kind, name, values } on a match, and void when nothing matched OR nothing is declared —
        the caller leaves the message alone either way, which is what keeps a panel that never
        called defineDump behaving exactly as it did. */
    juce::var matchDeviceDump (const juce::String& role, const juce::var& bytes) const;

    /** Drop every declaration. Called wherever generated controls are cleared, for the same reason. */
    void clearDeviceDefinitions();

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
    /** Raise onError in every script that declares it. `phase` is "load" or "dispatch". */
    void dispatchErrorHook (const juce::String& scriptId, const juce::String& message,
                            const juce::String& phase);
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
        juce::String kind;     // "to" | "spring" | "envelope"
        juce::String path;
        double from = 0.0, to = 0.0;
        std::vector<double> samples;   // envelope only: the drawn shape, pre-sampled by the prelude
        double startMs = 0.0, duration = 300.0, delay = 0.0;
        double startBeats = 0.0, syncBeats = 0.0;
        bool sync = false;             // position derived from transport beats, not the wall clock
        juce::String curve = "linear";
        double damping = 6.0, frequency = 12.0;
        int repeat = 0, cycle = 0;     // repeat < 0 runs until stopped
        bool pingpong = false, paused = false;
        double heldProgress = 0.0;
        int groupId = 0;               // 0 = alone; otherwise one completion for the whole call
    };
    std::vector<Animation> animations;
    struct AnimationGroup { int remaining = 0; bool completed = true; juce::StringArray paths; };
    std::map<int, AnimationGroup> animationGroups;
    int animationGroupSeq = 0;
    /** Progress, value, and the completion emit — shared by the tick and by the four verbs that
        need to know where an animation is without advancing it. */
    double animationProgressOf (const Animation& a, double nowMs, double beats) const;
    double animationValueOf (const Animation& a, double progress) const;
    void   fireAnimationDone (const Animation& a, bool completed);
    juce::var animationDescribe (const Animation& a) const;
    double animationBeatsNow();
    double transportBpm();
    double beatsToMs (double beats);
    Animation* animationFor (const juce::String& path);
    double animationNowMs = 0.0;   // the last tick, so a new animation starts from a known moment
    // Whether a tick has EVER happened — not `animationNowMs == 0`, because zero is a perfectly
    // good tick time when the caller drives the clock, which is the only way to test an animation
    // without waiting on a real one.
    bool animationTicked = false;

    // ce.device declarations. Two flat vectors per role rather than maps: a panel declares tens of
    // parameters, not thousands, and keeping declaration ORDER is what makes parameters() list them
    // the way the script wrote them.
    struct DeclaredParameter
    {
        juce::String id, name, group, type { "number" }, access { "readWrite" };
        juce::String wireKind, encoding { "u7" }, checksumKind { "roland" };
        double min = 0.0, max = 127.0;
        int cc = 0, channel = 1, msb = 0, lsb = 0;
        int nibbles = 2, length = 0, pad = 32, trueValue = 1, falseValue = 0;
        juce::StringArray tmpl;                       // sysex template tokens
        juce::NamedValueSet variables;
        juce::Array<juce::var> choices;               // { id, value } pairs
        juce::var descriptor() const;
    };

    struct DeclaredDump
    {
        juce::String id, name, checksumType;
        juce::Array<int> prefix, suffix, request;
        int offset = 0, size = 0;
        int checksumFrom = -1, checksumTo = -1, checksumAt = -1;
        juce::StringArray fieldParameters;
        juce::Array<int> fieldOffsets;
    };

    struct DeviceDeclarations
    {
        std::vector<DeclaredParameter> parameters;
        std::vector<DeclaredDump> dumps;
    };

    std::map<juce::String, DeviceDeclarations> deviceDeclarations;

    const DeclaredParameter* findDeclaredParameter (const juce::String& role, const juce::String& id) const;
    const DeclaredDump*      findDeclaredDump      (const juce::String& role, const juce::String& kind) const;
    /** The number a value becomes on the wire — the parameter's own units, clamped to what fits. */
    static int declaredParameterNumber (const DeclaredParameter& p, const juce::var& value);
    /** Decode one declared layout against one message. Void unless it matched cleanly. */
    juce::var decodeDeclaredDump (const juce::String& role, const DeclaredDump& dump,
                                  const juce::Array<int>& bytes) const;

    int inboundDepth = 0;      // >0 while reacting to inbound MIDI/dump → setValue is silent by default
    int transmitOverride = -1; // -1 none, 0 force-silent (noTransmit), 1 force-loud (transmit)
    std::vector<int> transmitStack; // nested noTransmit/transmit blocks

    static constexpr int maxDispatchDepth = 16; // emit→dispatch→emit feedback-loop backstop
    int dispatchDepth = 0;

    // onError. `inErrorHook` is the re-entry guard: an error raised while reporting an error is
    // logged and NOT re-dispatched, or a broken reporter loops until the stack dies.
    // `deferErrors` holds load-time errors until every script is loaded — a script that fails
    // first would otherwise be reported to an onError that does not exist yet.
    bool inErrorHook = false;
    bool deferErrors = false;
    std::vector<std::pair<juce::String, juce::String>> deferredErrors;

    // onPanelDestroy fires at most once per loaded set. Set by loadScripts, cleared by the
    // dispatch — so a host that calls onPanelDestroy() at shutdown after a reload already sent
    // one does not send a second, and a script cannot be told twice that it is going away.
    bool destroyPending = false;

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
