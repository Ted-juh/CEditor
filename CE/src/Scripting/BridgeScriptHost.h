#pragma once
//
// BridgeScriptHost — the concrete ScriptHostApi the app installs. It forwards each API call to an
// app-supplied callback, and computes the transmit-by-default (Q2) from the ScriptRuntime's origin
// state. The app wires the callbacks to ValueTreeBridge (values) + DeviceProfileService (MIDI/dumps)
// with the real schemas — keeping the schema knowledge in the app, not guessed here.
//
// Wiring order (see Scripting/README.md):
//   BridgeScriptHost host { callbacks };
//   ScriptRuntime runtime { host };
//   host.attachRuntime (&runtime);   // so setValue can read the transmit default
//
// THREADING: all calls happen on the message thread, inside a dispatch.

#include "ScriptRuntime.h"
#include <map>

namespace ceditor::scripting
{

class BridgeScriptHost final : public ScriptHostApi
{
public:
    struct Callbacks
    {
        // Values (path = "control.value" style; form = value|normalizedValue|midiValue).
        std::function<juce::var (const juce::String& path, const juce::String& form)> getValue;
        // `form` is the value representation the script asked for: "value" (default) or
        // "normalizedValue". The app maps it, because only the app knows the control's range.
        std::function<void (const juce::String& path, const juce::var& value, bool transmit,
                            const juce::String& form)> setValue;
        // Device / MIDI.
        std::function<void (int ch, int cc, const juce::var& value)> sendCC;
        std::function<void (int ch, int msb, int lsb, const juce::var& value)> sendNRPN;
        std::function<void (const juce::var& bytes)> sendSysex;
        std::function<void (const juce::var& bytes)> sendMidi;   // raw bytes, no wrapping
        // routeMidi(role, fn) blocks and feedMidi(bytes). Left unset by a host that has neither,
        // in which case the verbs report rather than pretending — see the overrides below.
        std::function<void (const juce::String& role)> beginRoute;
        std::function<void()> endRoute;
        std::function<void (const juce::var& bytes)> feedMidi;
        std::function<void (const juce::String& kind)> requestDump;
        std::function<void (const juce::var& bytes)> applyDump;   // host should run inside an InboundScope
        std::function<void (const juce::String& kind)> sendDump;
        std::function<juce::var (const juce::String& kind)> buildDump;
        // Reads against the device profile — what the synth IS and what parameters it has.
        // Unset means "no device host": the members report that rather than returning a quiet
        // nothing, which is the rule requiresDeviceHost has followed since it was introduced.
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> deviceQuery;
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> panelQuery;
        std::function<bool (const juce::String& parameterId, const juce::var& value,
                            const juce::String& role)> deviceWrite;
        // The transport snapshot behind tempo() / isPlaying() / transportInfo(). Unset means
        // nothing is reporting one, and the prelude reports valid=false rather than guessing.
        std::function<juce::var()> transportState;
        // ce.ui — unset in the shipped plugin, which has no surface to show anything on.
        std::function<void (const juce::String& message, const juce::var& opts)> uiNotify;
        std::function<void (const juce::String& message)> uiStatus;
        // Flow / debug. runAction and emitEvent are OPTIONAL: left unset, they fall through to the
        // ScriptRuntime, which resolves them against the loaded script set. That is the right
        // default — cross-script calls need the script set, not app state — so only override them
        // if the app has actions of its own to expose.
        std::function<juce::var (const juce::String& target, const juce::var& args)> runAction;
        std::function<void (const juce::String& name, const juce::var& data)> emitEvent;
        std::function<void (const juce::String& message, const juce::var& value)> log;
        // Timers.
        std::function<void (const juce::String& id, int intervalMs)> startTimer;
        std::function<void (const juce::String& id)> stopTimer;
        // Settings that outlive the session (ce.storage). Optional: unset means the panel simply
        // has nowhere to persist, and loadSetting always returns the fallback.
        std::function<void (const juce::String& key, const juce::var& value)> saveSetting;
        std::function<juce::var (const juce::String& key)> loadSetting;
    };

    explicit BridgeScriptHost (Callbacks cb) : callbacks (std::move (cb)) {}

    void attachRuntime (ScriptRuntime* r) { runtime = r; }

    // The script currently running — exposed so callbacks can resolve scope-relative paths if needed.
    const ScriptContext& currentScript() const { return context; }

    /** Split a trailing value accessor off a path. The accessor may be a SUFFIX
        ("cutoff.normalizedValue") or an explicit `form` ARGUMENT — both spellings are documented,
        and an explicit argument wins. `.value` is left on the path: it is the shorthand that
        already resolves to the value, so stripping it would leave nothing to resolve. */
    static std::pair<juce::String, juce::String> splitAccessor (const juce::String& path,
                                                                const juce::String& explicitForm)
    {
        const bool explicitIsDerived = explicitForm == "normalizedValue" || explicitForm == "midiValue";
        const auto tail = path.fromLastOccurrenceOf (".", false, false);
        if (tail == "normalizedValue" || tail == "midiValue")
            return { path.upToLastOccurrenceOf (".", false, false), explicitIsDerived ? explicitForm : tail };
        return { path, explicitIsDerived ? explicitForm : juce::String ("value") };
    }

    /** Does this path write a read-only property of the panel document? Mirrors
        PANEL_READONLY_PROPERTIES in panelApi.js — panelApiParity.test.js checks the two agree. */
    static bool isPanelReadOnlyPath (const juce::String& path)
    {
        if (! path.upToFirstOccurrenceOf (".", false, false).equalsIgnoreCase ("panel")) return false;
        const auto property = path.fromFirstOccurrenceOf (".", false, false)
                                  .upToFirstOccurrenceOf (".", false, false);
        static const char* readOnly[] = { "id", "panelGuid", "scriptId", "filePath", "controls", "scripts" };
        for (auto* r : readOnly) if (property.equalsIgnoreCase (r)) return true;
        return false;
    }

    // -- ScriptHostApi --
    void enterScript (const ScriptContext& c) override { context = c; }
    void exitScript() override { context = {}; }
    void beginTransmitOverride (bool transmit) override { if (runtime) runtime->pushTransmit (transmit); }
    void endTransmitOverride() override { if (runtime) runtime->popTransmit(); }

    juce::var getValue (const juce::String& path, const juce::String& form) override
    {
        const auto addressed = splitAccessor (path, form);
        if (addressed.second == "midiValue")
        {
            reportNeedsDeviceHost ("get(.midiValue)", addressed.first);
            return {};
        }
        return callbacks.getValue ? callbacks.getValue (addressed.first, addressed.second) : juce::var();
    }

    void setValue (const juce::String& path, const juce::var& value, const juce::var& options) override
    {
        const auto addressed = splitAccessor (path, {});
        if (addressed.second == "midiValue")
        {
            reportNeedsDeviceHost ("set(.midiValue)", addressed.first);
            return;
        }
        // `panel` is a reserved first segment addressing the document; a few of its properties are
        // its identity or its structure and writing them would detach the document from itself.
        // The refusal is REPORTED here rather than swallowed by the value model, because the web
        // runtime explains it and a script must get the same answer from both.
        if (isPanelReadOnlyPath (addressed.first))
        {
            const auto property = addressed.first.fromFirstOccurrenceOf (".", false, false);
            if (callbacks.log)
                callbacks.log ("set(\"panel." + property + "\", …) is read-only — it is the panel's identity or its "
                               "structure, and writing it would detach the document from itself.", juce::var());
            return;
        }

        bool transmit = runtime ? runtime->defaultTransmit() : true;
        if (auto* o = options.getDynamicObject())
            if (o->hasProperty ("transmit")) transmit = (bool) o->getProperty ("transmit");
        // Under a MIDI flood the value still applies locally — only the synth send is dropped.
        if (transmit && ! midiSendAllowed())
            transmit = false;
        if (callbacks.setValue) callbacks.setValue (addressed.first, value, transmit, addressed.second);
    }

    void sendCC (int ch, int cc, const juce::var& v) override        { if (callbacks.sendCC && midiSendAllowed()) callbacks.sendCC (ch, cc, v); }
    void sendNRPN (int ch, int msb, int lsb, const juce::var& v) override { if (callbacks.sendNRPN && midiSendAllowed()) callbacks.sendNRPN (ch, msb, lsb, v); }
    void sendSysex (const juce::var& bytes) override                 { if (callbacks.sendSysex && midiSendAllowed()) callbacks.sendSysex (bytes); }
    void sendMidi (const juce::var& bytes) override                  { if (callbacks.sendMidi && midiSendAllowed()) callbacks.sendMidi (bytes); }
    // routeMidi / feedMidi. A host that wires neither gets the honest failure rather than the quiet
    // one: the block still RUNS (its sends go to the default device, which is what they did before
    // routing existed), and feedMidi says it could not. Silence here is exactly the defect the
    // window-closed audit kept finding — an API that reads as working and does nothing.
    void beginRouteOverride (const juce::String& role) override
    {
        if (callbacks.beginRoute) { callbacks.beginRoute (role); routeWired = true; return; }
        routeWired = false;
        logAt ("warn", "routeMidi(\"" + role + "\"): this host has no MIDI routing, so the block's sends "
                       "go to the default device.", juce::var());
    }
    void endRouteOverride() override { if (routeWired && callbacks.endRoute) callbacks.endRoute(); }

    void feedMidi (const juce::var& bytes) override
    {
        if (callbacks.feedMidi) { callbacks.feedMidi (bytes); return; }
        logAt ("error", "feedMidi(): this host has no MIDI input to inject into — nothing was fed.", juce::var());
    }
    // A layout the SCRIPT declared carries its own request bytes, so asking for it is a raw send
    // and needs no profile at all — which is the case defineDump exists for. Checked BEFORE the
    // host callback, so a declaration can also stand in for a profile request the host gets wrong.
    void requestDump (const juce::String& kind) override
    {
        if (runtime != nullptr && runtime->hasDeviceDump (defaultDeviceRole, kind))
        {
            const auto bytes = runtime->deviceDumpRequest (defaultDeviceRole, kind);
            if (auto* arr = bytes.getArray(); arr != nullptr && ! arr->isEmpty())
            {
                sendMidi (bytes);
                return;
            }
            logAt ("error", "requestDump(\"" + kind + "\"): the declared layout has no request bytes, so there "
                            "is nothing to send. Add `request` to defineDump, or wait for the synth to send it "
                            "unasked.", juce::var());
            return;
        }
        if (callbacks.requestDump) callbacks.requestDump (kind);
    }
    void applyDump (const juce::var& bytes) override                 { if (callbacks.applyDump) callbacks.applyDump (bytes); }
    void sendDump (const juce::String& kind) override                { if (callbacks.sendDump) callbacks.sendDump (kind); }
    juce::var buildDump (const juce::String& kind) override          { return callbacks.buildDump ? callbacks.buildDump (kind) : juce::var(); }

    /**
     * The reads, with the script's own declarations folded in.
     *
     * The merge lives here rather than in each prelude for the reason the preludes exist at all:
     * three copies of "profile first, declarations last" is three chances for one engine to answer
     * a different question. Declarations come LAST so a declared id overrides a profile one, which
     * is what lets a script correct a single wrong parameter without redeclaring the rest.
     */
    juce::var deviceQuery (const juce::String& kind, const juce::var& payload) override
    {
        const auto fromHost = callbacks.deviceQuery ? callbacks.deviceQuery (kind, payload) : juce::var();
        if (runtime == nullptr || (kind != "parameters" && kind != "parameter")) return fromHost;

        auto* p = payload.getDynamicObject();
        auto role = p != nullptr ? p->getProperty ("role").toString() : juce::String();
        if (role.isEmpty()) role = defaultDeviceRole;

        if (kind == "parameter")
        {
            const auto id = p != nullptr ? p->getProperty ("id").toString() : juce::String();
            const auto declared = runtime->declaredDeviceParameter (role, id);
            return declared.isVoid() ? fromHost : declared;
        }

        const auto declared = runtime->declaredDeviceParameters (role);
        auto* declaredArr = declared.getArray();
        if (declaredArr == nullptr || declaredArr->isEmpty()) return fromHost;

        juce::Array<juce::var> merged;
        if (auto* hostArr = fromHost.getArray())
            for (const auto& item : *hostArr)
            {
                bool overridden = false;
                if (auto* o = item.getDynamicObject())
                    for (const auto& d : *declaredArr)
                        if (auto* dObj = d.getDynamicObject())
                            if (dObj->getProperty ("id").toString() == o->getProperty ("id").toString())
                            { overridden = true; break; }
                if (! overridden) merged.add (item);
            }
        merged.addArray (*declaredArr);
        return juce::var (merged);
    }

    /** The role rides INSIDE the spec, the way it rides inside deviceQuery's payload — so adding a
        role did not add a fourth argument to an ABI slot every engine has to match. */
    bool deviceDefine (const juce::String& what, const juce::String& id, const juce::var& spec) override
    {
        if (runtime == nullptr) return false;
        juce::String role = defaultDeviceRole;
        if (auto* o = spec.getDynamicObject())
            if (o->getProperty ("role").toString().isNotEmpty()) role = o->getProperty ("role").toString();
        if (what == "parameter") return runtime->defineDeviceParameter (role, id, spec);
        if (what == "dump")      return runtime->defineDeviceDump (role, id, spec);
        return false;
    }

    juce::var panelQuery (const juce::String& kind, const juce::var& payload) override
    { return callbacks.panelQuery ? callbacks.panelQuery (kind, payload) : juce::var(); }

    /** A parameter the SCRIPT declared carries its own wire format, so it is compiled here and sent
        as raw bytes. That is the whole reason defineParameter exists: this path needs no profile,
        and so it works on a synth the app has never heard of. */
    bool deviceWrite (const juce::String& parameterId, const juce::var& value,
                      const juce::String& role) override
    {
        if (runtime != nullptr)
        {
            const auto bytes = runtime->encodeDeviceParameter (role.isEmpty() ? defaultDeviceRole : role,
                                                               parameterId, value);
            if (auto* arr = bytes.getArray(); arr != nullptr && ! arr->isEmpty())
            {
                sendMidi (bytes);
                return true;
            }
        }
        return callbacks.deviceWrite && callbacks.deviceWrite (parameterId, value, role);
    }
    juce::var transportState() override
    { return callbacks.transportState ? callbacks.transportState() : juce::var(); }
    // ce.anim routes to the runtime, never to a callback: the animation list has to live in ONE
    // place or two hosts would each run their own copy of the same sweep.
    void startAnimation (const juce::String& kind, const juce::var& path,
                         double target, const juce::var& opts) override
    { if (runtime) runtime->startAnimation (kind, path, target, opts); }
    void stopAnimation (const juce::String& path) override
    { if (runtime) runtime->stopAnimation (path); }
    bool animationRunning (const juce::String& path) override
    { return runtime && runtime->animationRunning (path); }
    juce::var animationValue (const juce::String& path) override
    { return runtime ? runtime->animationValue (path) : juce::var(); }
    juce::var animationList() override
    { return runtime ? runtime->animationList() : juce::var(); }
    bool animationPause (const juce::String& path) override
    { return runtime && runtime->animationPause (path); }
    bool animationResume (const juce::String& path) override
    { return runtime && runtime->animationResume (path); }
    bool animationReverse (const juce::String& path) override
    { return runtime && runtime->animationReverse (path); }
    bool animationFinish (const juce::String& path) override
    { return runtime && runtime->animationFinish (path); }
    // ce.ui is panel-view only; a host with a surface supplies these, the shipped plugin does not.
    void uiNotify (const juce::String& message, const juce::var& opts) override
    { if (callbacks.uiNotify) callbacks.uiNotify (message, opts); }
    void uiStatus (const juce::String& message) override
    { if (callbacks.uiStatus) callbacks.uiStatus (message); }
    juce::var runAction (const juce::String& target, const juce::var& args) override
    {
        if (callbacks.runAction) return callbacks.runAction (target, args);
        return runtime ? runtime->runAction (target, args) : juce::var();
    }

    void emitEvent (const juce::String& name, const juce::var& data) override
    {
        if (callbacks.emitEvent) { callbacks.emitEvent (name, data); return; }
        // A custom event is just an event: it reaches on(name, …) listeners and any script whose
        // handler is named for it. dispatchEvent carries the loop backstop.
        if (runtime) runtime->dispatchEvent (name, juce::String(), data);
    }
    void log (const juce::String& message, const juce::var& value) override { if (callbacks.log) callbacks.log (message, value); }
    void startTimer (const juce::String& id, int intervalMs) override { if (callbacks.startTimer) callbacks.startTimer (id, intervalMs); }
    void stopTimer  (const juce::String& id) override { if (callbacks.stopTimer) callbacks.stopTimer (id); }
    void saveSetting (const juce::String& key, const juce::var& value) override
    { if (callbacks.saveSetting) callbacks.saveSetting (key, value); }
    juce::var loadSetting (const juce::String& key) override
    { return callbacks.loadSetting ? callbacks.loadSetting (key) : juce::var(); }

private:
    // The role every device verb means when a script does not name one. Matches DEFAULT_DEVICE_ROLE
    // in the web runtime; panelApiParity keeps the spelling honest.
    static constexpr const char* defaultDeviceRole = "mainSynth";

    // Whether the host actually wired routing, so endRouteOverride does not unbalance a host
    // that never began one.
    bool routeWired = false;

    // Scope (Q7) is NOT enforced here, and that is a decision rather than an omission. The
    // Device/MIDI verbs used to declare device/panel/project scope; enforcing that list denied a
    // COMPONENT script — a per-control script — the ability to send a CC, which is the ordinary
    // thing a panel control does. The list was aspirational, so panelApi.js now declares those
    // verbs 'any' and the only genuinely scoped members left are the panel-component verbs, which
    // need a component to exist. Those are webview-only: the C++ engines define them as stubs that
    // explain themselves, which is the enforcement. scriptValidate flags the misuse at edit time.

    // `.midiValue` is what the DPD codec would put on the wire, and the codec is the device host's,
    // not the panel's. Say so once and clearly rather than returning a quiet nothing and leaving the
    // author to work out which of several things went wrong.
    void reportNeedsDeviceHost (const juce::String& member, const juce::String& path)
    {
        if (callbacks.log)
            callbacks.log (member + " on '" + path + "' needs the device host — the MIDI encoding belongs to the "
                           "device profile, not the panel. Use .value or .normalizedValue.", juce::var());
    }

    // Anti-flood backstop (scripting-redesign §7 keep-list): scripts may not push
    // more than this many MIDI messages (CC/NRPN/sysex + transmitting setValues)
    // per rolling second. Excess sends are dropped — local value writes still
    // apply — and one notice per burst goes to the log so the author finds out.
    // Generous by design: a dump→panel pass sends a few hundred messages; only a
    // runaway send loop hits this.
    static constexpr int maxMidiSendsPerSecond = 1000;

    bool midiSendAllowed()
    {
        const double now = juce::Time::getMillisecondCounterHiRes();
        if (now - floodWindowStartMs >= 1000.0)
        {
            floodWindowStartMs = now;
            floodSendsInWindow = 0;
            floodNoticeSent = false;
        }
        if (++floodSendsInWindow <= maxMidiSendsPerSecond)
            return true;
        if (! floodNoticeSent)
        {
            floodNoticeSent = true;
            if (callbacks.log)
                callbacks.log ("[guard] MIDI flood from script '" + (context.id.isNotEmpty() ? context.id : juce::String ("<unknown>"))
                               + "': over " + juce::String (maxMidiSendsPerSecond)
                               + " sends/second — dropping further sends this second", juce::var());
        }
        return false;
    }

    Callbacks callbacks;
    ScriptRuntime* runtime = nullptr;
    ScriptContext context;

    double floodWindowStartMs = 0.0;
    int    floodSendsInWindow = 0;
    bool   floodNoticeSent = false;
};

} // namespace ceditor::scripting
