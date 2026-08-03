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

#include <juce_events/juce_events.h>   // Timer::callAfterDelay for sendNote's scheduled note-off

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
        // Notes.
        std::function<void (int ch, int note, int velocity)> sendNoteOn;
        std::function<void (int ch, int note)> sendNoteOff;
        // Transport snapshot ({ playing, bpm, beats, beat, bar, beatsPerBar }).
        std::function<juce::var()> getTransport;
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
        std::function<void (const juce::String& id, int intervalMs, bool once)> startTimer;
        std::function<void (const juce::String& id)> stopTimer;
        // Script key/value state (panel-scoped persistence).
        std::function<void (const juce::String& key, const juce::var& value)> stateSet;
        std::function<juce::var (const juce::String& key)> stateGet;
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
        // Under a MIDI flood the value still applies locally — only the synth send is dropped.
        if (transmit && ! midiSendAllowed())
            transmit = false;
        if (callbacks.setValue) callbacks.setValue (path, value, transmit);
    }

    void sendNoteOn (int ch, int note, int velocity) override
    { if (callbacks.sendNoteOn && midiSendAllowed()) callbacks.sendNoteOn (ch, note, velocity); }

    void sendNoteOff (int ch, int note) override
    { if (callbacks.sendNoteOff && midiSendAllowed()) callbacks.sendNoteOff (ch, note); }

    void sendNote (int ch, int note, int velocity, int durationMs) override
    {
        sendNoteOn (ch, note, velocity);
        // Capture a copy of the note-off function (not `this`) so a scheduled off outliving the
        // host is harmless. The note-off bypasses the flood guard — hanging notes are worse.
        const int ms = juce::jlimit (1, 60000, durationMs);
        juce::Timer::callAfterDelay (ms, [off = callbacks.sendNoteOff, ch, note] { if (off) off (ch, note); });
    }

    juce::var getTransport() override
    { return callbacks.getTransport ? callbacks.getTransport() : ScriptHostApi::getTransport(); }

    void sendCC (int ch, int cc, const juce::var& v) override        { if (callbacks.sendCC && midiSendAllowed()) callbacks.sendCC (ch, cc, v); }
    void sendNRPN (int ch, int msb, int lsb, const juce::var& v) override { if (callbacks.sendNRPN && midiSendAllowed()) callbacks.sendNRPN (ch, msb, lsb, v); }
    void sendSysex (const juce::var& bytes) override                 { if (callbacks.sendSysex && midiSendAllowed()) callbacks.sendSysex (bytes); }
    void requestDump (const juce::String& kind) override             { if (callbacks.requestDump) callbacks.requestDump (kind); }
    void applyDump (const juce::var& bytes) override                 { if (callbacks.applyDump) callbacks.applyDump (bytes); }
    void sendDump (const juce::String& kind) override                { if (callbacks.sendDump) callbacks.sendDump (kind); }
    juce::var buildDump (const juce::String& kind) override          { return callbacks.buildDump ? callbacks.buildDump (kind) : juce::var(); }
    juce::var runAction (const juce::String& target, const juce::var& args) override { return callbacks.runAction ? callbacks.runAction (target, args) : juce::var(); }
    void emitEvent (const juce::String& name, const juce::var& data) override { if (callbacks.emitEvent) callbacks.emitEvent (name, data); }
    void log (const juce::String& message, const juce::var& value) override { if (callbacks.log) callbacks.log (message, value); }
    void startTimer (const juce::String& id, int intervalMs, bool once) override { if (callbacks.startTimer) callbacks.startTimer (id, intervalMs, once); }
    void stopTimer  (const juce::String& id) override { if (callbacks.stopTimer) callbacks.stopTimer (id); }
    void stateSet (const juce::String& key, const juce::var& value) override { if (callbacks.stateSet) callbacks.stateSet (key, value); }
    juce::var stateGet (const juce::String& key) override { return callbacks.stateGet ? callbacks.stateGet (key) : juce::var(); }

private:
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
