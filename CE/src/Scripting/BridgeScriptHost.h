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
        std::function<void (const juce::String& kind)> requestDump;
        std::function<void (const juce::var& bytes)> applyDump;   // host should run inside an InboundScope
        std::function<void (const juce::String& kind)> sendDump;
        std::function<juce::var (const juce::String& kind)> buildDump;
        // Reads against the device profile — what the synth IS and what parameters it has.
        // Unset means "no device host": the members report that rather than returning a quiet
        // nothing, which is the rule requiresDeviceHost has followed since it was introduced.
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> deviceQuery;
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> panelQuery;
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
    void requestDump (const juce::String& kind) override             { if (callbacks.requestDump) callbacks.requestDump (kind); }
    void applyDump (const juce::var& bytes) override                 { if (callbacks.applyDump) callbacks.applyDump (bytes); }
    void sendDump (const juce::String& kind) override                { if (callbacks.sendDump) callbacks.sendDump (kind); }
    juce::var buildDump (const juce::String& kind) override          { return callbacks.buildDump ? callbacks.buildDump (kind) : juce::var(); }
    juce::var deviceQuery (const juce::String& kind, const juce::var& payload) override
    { return callbacks.deviceQuery ? callbacks.deviceQuery (kind, payload) : juce::var(); }

    juce::var panelQuery (const juce::String& kind, const juce::var& payload) override
    { return callbacks.panelQuery ? callbacks.panelQuery (kind, payload) : juce::var(); }
    juce::var transportState() override
    { return callbacks.transportState ? callbacks.transportState() : juce::var(); }
    // ce.anim routes to the runtime, never to a callback: the animation list has to live in ONE
    // place or two hosts would each run their own copy of the same sweep.
    void startAnimation (const juce::String& kind, const juce::String& path,
                         double target, const juce::var& opts) override
    { if (runtime) runtime->startAnimation (kind, path, target, opts); }
    void stopAnimation (const juce::String& path) override
    { if (runtime) runtime->stopAnimation (path); }
    bool animationRunning (const juce::String& path) override
    { return runtime && runtime->animationRunning (path); }
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
