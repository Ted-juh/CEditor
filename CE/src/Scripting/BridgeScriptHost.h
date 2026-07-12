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

namespace ceditor::scripting
{

class BridgeScriptHost final : public ScriptHostApi
{
public:
    struct Callbacks
    {
        // Values (path = "control.value" style; form = value|normalizedValue|midiValue).
        std::function<juce::var (const juce::String& path, const juce::String& form)> getValue;
        std::function<void (const juce::String& path, const juce::var& value, bool transmit)> setValue;
        // Device / MIDI.
        std::function<void (int ch, int cc, const juce::var& value)> sendCC;
        std::function<void (int ch, int msb, int lsb, const juce::var& value)> sendNRPN;
        std::function<void (const juce::var& bytes)> sendSysex;
        std::function<void (const juce::String& kind)> requestDump;
        std::function<void (const juce::var& bytes)> applyDump;   // host should run inside an InboundScope
        std::function<void (const juce::String& kind)> sendDump;
        std::function<juce::var (const juce::String& kind)> buildDump;
        // Flow / debug.
        std::function<juce::var (const juce::String& target, const juce::var& args)> runAction;
        std::function<void (const juce::String& name, const juce::var& data)> emitEvent;
        std::function<void (const juce::String& message, const juce::var& value)> log;
        // Timers.
        std::function<void (const juce::String& id, int intervalMs)> startTimer;
        std::function<void (const juce::String& id)> stopTimer;
    };

    explicit BridgeScriptHost (Callbacks cb) : callbacks (std::move (cb)) {}

    void attachRuntime (ScriptRuntime* r) { runtime = r; }

    // The script currently running — exposed so callbacks can resolve scope-relative paths if needed.
    const ScriptContext& currentScript() const { return context; }

    // -- ScriptHostApi --
    void enterScript (const ScriptContext& c) override { context = c; }
    void exitScript() override { context = {}; }
    void beginTransmitOverride (bool transmit) override { if (runtime) runtime->pushTransmit (transmit); }
    void endTransmitOverride() override { if (runtime) runtime->popTransmit(); }

    juce::var getValue (const juce::String& path, const juce::String& form) override
    { return callbacks.getValue ? callbacks.getValue (path, form) : juce::var(); }

    void setValue (const juce::String& path, const juce::var& value, const juce::var& options) override
    {
        bool transmit = runtime ? runtime->defaultTransmit() : true;
        if (auto* o = options.getDynamicObject())
            if (o->hasProperty ("transmit")) transmit = (bool) o->getProperty ("transmit");
        if (callbacks.setValue) callbacks.setValue (path, value, transmit);
    }

    void sendCC (int ch, int cc, const juce::var& v) override        { if (callbacks.sendCC) callbacks.sendCC (ch, cc, v); }
    void sendNRPN (int ch, int msb, int lsb, const juce::var& v) override { if (callbacks.sendNRPN) callbacks.sendNRPN (ch, msb, lsb, v); }
    void sendSysex (const juce::var& bytes) override                 { if (callbacks.sendSysex) callbacks.sendSysex (bytes); }
    void requestDump (const juce::String& kind) override             { if (callbacks.requestDump) callbacks.requestDump (kind); }
    void applyDump (const juce::var& bytes) override                 { if (callbacks.applyDump) callbacks.applyDump (bytes); }
    void sendDump (const juce::String& kind) override                { if (callbacks.sendDump) callbacks.sendDump (kind); }
    juce::var buildDump (const juce::String& kind) override          { return callbacks.buildDump ? callbacks.buildDump (kind) : juce::var(); }
    juce::var runAction (const juce::String& target, const juce::var& args) override { return callbacks.runAction ? callbacks.runAction (target, args) : juce::var(); }
    void emitEvent (const juce::String& name, const juce::var& data) override { if (callbacks.emitEvent) callbacks.emitEvent (name, data); }
    void log (const juce::String& message, const juce::var& value) override { if (callbacks.log) callbacks.log (message, value); }
    void startTimer (const juce::String& id, int intervalMs) override { if (callbacks.startTimer) callbacks.startTimer (id, intervalMs); }
    void stopTimer  (const juce::String& id) override { if (callbacks.stopTimer) callbacks.stopTimer (id); }

private:
    Callbacks callbacks;
    ScriptRuntime* runtime = nullptr;
    ScriptContext context;
};

} // namespace ceditor::scripting
