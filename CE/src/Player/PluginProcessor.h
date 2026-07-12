#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <map>
#include <vector>
#include "PlayerHost.h"

#ifndef CEDITOR_PLAYER_PANEL_PATH
 #define CEDITOR_PLAYER_PANEL_PATH ""
#endif

#ifndef CEDITOR_VALUE_LAYER
 #define CEDITOR_VALUE_LAYER 0
#endif

#ifndef CEDITOR_SCRIPTING
 #define CEDITOR_SCRIPTING 0
#endif

#if CEDITOR_VALUE_LAYER
 #include "PanelParameters.h"
#endif

#if CEDITOR_SCRIPTING
 #include "PanelValueModel.h"
 #include "Scripting/BridgeScriptHost.h"
 #include "Scripting/TimerManager.h"
#endif

/**
 * Phase C — wrap the standalone player runtime as a plugin.
 *
 * The AudioProcessor is intentionally minimal (audio passthrough). The real product is the
 * editor, which hosts the SAME PlayerHost component the standalone uses — so a panel renders
 * and drives MIDI identically whether run standalone or as a VST3. For this hand-built proof
 * the panel is loaded from a fixed path; Phase D bakes it per-panel with a unique identity.
 */
class PlayerAudioProcessor : public juce::AudioProcessor
                          #if CEDITOR_VALUE_LAYER
                           , private juce::Timer
                          #endif
{
public:
    PlayerAudioProcessor()
        : juce::AudioProcessor (BusesProperties()
              .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
              .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
#if CEDITOR_VALUE_LAYER
        , panelParams (ce::parseExportParameters (juce::File (CEDITOR_PLAYER_PANEL_PATH)))
        , apvts (*this, nullptr, "CEDITOR_PARAMS", ce::buildParameterLayout (panelParams))
#endif
    {
        scriptMidiCollector.reset (44100.0);  // valid before prepareToPlay; the host resets with the real rate
#if CEDITOR_VALUE_LAYER
        // Window-CLOSED automation -> MIDI: a message-thread timer that sends bound parameters to the
        // synth when there is no editor (when open, the WebView/JS does the sending). The MIDI service
        // lives here on the processor, so it persists across the editor window being closed.
        startTimerHz (30);
#endif
#if CEDITOR_SCRIPTING
        setupScripting();   // window-closed: load the panel's scripts + fire onPanelLoad
#endif
    }

#if CEDITOR_VALUE_LAYER
    ~PlayerAudioProcessor() override
    {
        stopTimer();
       #if CEDITOR_SCRIPTING
        deviceService.setEventCallback (nullptr);  // stop device events reaching the about-to-die runtime
        scriptTimers.stopAll();                    // stop script timers before the runtime is destroyed
       #endif
    }
#endif

    void prepareToPlay (double sampleRate, int) override { scriptMidiCollector.reset (sampleRate); }
    void releaseResources() override {}
    // The plugin PRODUCES MIDI on its output bus; the DAW routes that track to the synth's port (the
    // standard VST3 path — no in-plugin port picker). Drain whatever the panel queued on the message
    // thread (script sendCC/NRPN/Sysex) into the host's MIDI buffer here.
    void processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override
    {
        scriptMidiCollector.removeNextBlockOfMessages (midi, buffer.getNumSamples());
    }

    // Script-emitted MIDI is queued here on the message thread and drained into the host's output bus
    // in processBlock (above). Lives outside the value/scripting #ifs so processBlock always has it.
    juce::MidiMessageCollector scriptMidiCollector;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "CEditor Player VST"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    // DAW session save/restore: the APVTS state (every parameter value) AND the device role→port
    // mapping, so a reopened project restores control positions AND reconnects to the synth (the
    // hardware drives automation window-closed without reopening the editor).
    void getStateInformation (juce::MemoryBlock& destData) override
    {
#if CEDITOR_VALUE_LAYER
        juce::XmlElement root ("CEDITOR_PLUGIN_STATE");
        if (auto apvtsXml = apvts.copyState().createXml())
            root.addChildElement (apvtsXml.release());
        root.createNewChildElement ("DeviceMappings")
            ->addTextElement (juce::JSON::toString (deviceService.exportRoleMappings()));
       #if CEDITOR_SCRIPTING
        if (scriptRuntime != nullptr)
        {
            juce::var store (new juce::DynamicObject());   // scripts write their persisted state here
            scriptRuntime->onDawSaveState (store);
            root.createNewChildElement ("ScriptState")->addTextElement (juce::JSON::toString (store));
        }
       #endif
        copyXmlToBinary (root, destData);
#else
        juce::ignoreUnused (destData);
#endif
    }

    void setStateInformation (const void* data, int sizeInBytes) override
    {
#if CEDITOR_VALUE_LAYER
        auto xml = getXmlFromBinary (data, sizeInBytes);
        if (xml == nullptr) return;
        if (xml->hasTagName ("CEDITOR_PLUGIN_STATE"))
        {
            if (auto* apvtsXml = xml->getChildByName (apvts.state.getType()))
                apvts.replaceState (juce::ValueTree::fromXml (*apvtsXml));
            if (auto* dev = xml->getChildByName ("DeviceMappings"))
                deviceService.importRoleMappings (juce::JSON::parse (dev->getAllSubText()));
           #if CEDITOR_SCRIPTING
            if (scriptRuntime != nullptr)
                if (auto* sx = xml->getChildByName ("ScriptState"))
                    scriptRuntime->onDawRestoreState (juce::JSON::parse (sx->getAllSubText()));
           #endif
        }
        else if (xml->hasTagName (apvts.state.getType())) // backward-compat: APVTS-only state
        {
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
        }
#else
        juce::ignoreUnused (data, sizeInBytes);
#endif
    }

    bool isBusesLayoutSupported (const BusesLayout&) const override { return true; }

    juce::File panelFile() const { return juce::File (CEDITOR_PLAYER_PANEL_PATH); }

#if CEDITOR_VALUE_LAYER
    juce::AudioProcessorValueTreeState& parameters() { return apvts; }
    const juce::Array<ce::PanelParameter>& parameterDescriptors() const { return panelParams; }

    // The panel UI moved a control -> drive the matching host parameter with a gesture so the DAW
    // records the automation. Called on the message thread from the editor.
    void setParamFromUi (const juce::String& parameterId, float value)
    {
        if (auto* p = apvts.getParameter (parameterId))
        {
            p->beginChangeGesture();
            p->setValueNotifyingHost (p->convertTo0to1 (value));
            p->endChangeGesture();
        }
    }

    // The processor owns the MIDI engine so it survives the editor window closing. The editor's
    // PlayerHost shares this instance (so the WebView still drives it window-open).
    ceditor::device::DeviceProfileService& getDeviceService() { return deviceService; }
#endif

private:
#if CEDITOR_VALUE_LAYER
    // Window-closed automation -> MIDI. While the editor is open the WebView/JS sends (and we skip,
    // to avoid double-sends); when it closes we re-send current values then stream changes.
    void timerCallback() override
    {
        const bool windowOpen = getActiveEditor() != nullptr;
       #if CEDITOR_SCRIPTING
        if (scriptRuntime != nullptr)
        {
            // GUI lifecycle edges: scripts keep running window-closed; these fire only on open/close.
            if (windowOpen && ! scriptWindowWasOpen)      { scriptRuntime->onPanelReady (! scriptReadyFired); scriptReadyFired = true; }
            else if (! windowOpen && scriptWindowWasOpen) { scriptRuntime->onPanelClose(); installScriptDeviceCallback(); } // PlayerHost nulled it on close — reclaim
            scriptWindowWasOpen = windowOpen;
        }
       #endif
        if (windowOpen) { wasWindowOpen = true; return; }
        if (wasWindowOpen) { lastSentMidi.clear(); wasWindowOpen = false; } // just closed -> resend all
        for (const auto& desc : panelParams)
        {
            if (desc.deviceParameterId.isEmpty()) continue;
            if (auto* raw = apvts.getRawParameterValue (desc.id))
            {
                const float v = raw->load();
                auto it = lastSentMidi.find (desc.id);
                if (it == lastSentMidi.end() || it->second != v)
                {
                    lastSentMidi[desc.id] = v;
                    sendParamMidi (desc, v);
                }
            }
        }
       #if CEDITOR_SCRIPTING
        // Window-closed value events: when a bound parameter changes (DAW automation), update the
        // mirror and dispatch onValueChanged so scripts react with the GUI closed (window-open the JS
        // runtime does this). Change-detected so it fires once per move, not every tick.
        if (scriptRuntime != nullptr)
            for (const auto& desc : panelParams)
            {
                if (desc.path.isEmpty()) continue;
                auto* raw = apvts.getRawParameterValue (desc.id);
                if (raw == nullptr) continue;
                const float v = raw->load();
                const auto it = lastScriptValue.find (desc.id);
                if (it != lastScriptValue.end() && it->second == v) continue;
                lastScriptValue[desc.id] = v;
                scriptValues.setValue (desc.path, v);
                scriptRuntime->dispatchEvent ("onValueChanged", desc.path.upToFirstOccurrenceOf (".", false, false), juce::var (v));
            }
       #endif
    }

    void sendParamMidi (const ce::PanelParameter& desc, float value)
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("deviceRole", desc.deviceRole.isNotEmpty() ? desc.deviceRole : juce::String ("mainSynth"));
        payload->setProperty ("parameterId", desc.deviceParameterId);
        payload->setProperty ("value", value);
        payload->setProperty ("dryRun", false);
        deviceService.compileParameterMessage (juce::var (payload), true);
    }

    juce::Array<ce::PanelParameter> panelParams;  // declared before apvts (init order matters)
    juce::AudioProcessorValueTreeState apvts;
    ceditor::device::DeviceProfileService deviceService;
    std::map<juce::String, float> lastSentMidi;
    bool wasWindowOpen = false;
#endif

#if CEDITOR_SCRIPTING
    // Window-closed script runtime (Model 2). The full-mirror value model (scriptValues) backs
    // get/set so a script behaves identically whether the GUI is open (WebView/JS) or closed (here).
    // Stage 3 wires instantiation + lifecycle + DAW state; Stage 4 (script MIDI sends) now transmits
    // via the plugin's MIDI output bus (scriptMidiCollector -> processBlock). JS<->C++ value sync for
    // UNBOUND controls (Stage 5) is still TODO. Declared after deviceService and in this order so the
    // runtime (holds host&) tears down before the host, and scriptValues outlives both.

    // Script log()/errors append here, so window-closed activity is observable without a debugger
    // or MIDI monitor: tail %TEMP%\ceditor-player-scripts.log.
    static void scriptLogLine (const juce::String& line)
    {
        auto f = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("ceditor-player-scripts.log");
        f.appendText (juce::Time::getCurrentTime().toString (true, true, true, true) + "  " + line + juce::newLine);
    }

   #if CEDITOR_VALUE_LAYER
    // Send raw MIDI from a script by queueing it onto the plugin's MIDI OUTPUT BUS (drained in
    // processBlock). The DAW routes that track to the synth's hardware port — the plugin never opens a
    // port itself (that's the standalone's job; a plugin opening hardware ports fights the host and is
    // not portable). `bytes` may be a multi-message stream (e.g. NRPN = 4 CCs); we split it.
    void scriptSendRawMidi (const juce::String& actionId, const juce::Array<int>& bytes)
    {
        if (bytes.isEmpty()) return;
        std::vector<juce::uint8> raw;
        raw.reserve ((size_t) bytes.size());
        for (const int b : bytes) raw.push_back ((juce::uint8) (b & 0xff));

        int pos = 0; juce::uint8 status = 0;
        while (pos < (int) raw.size())
        {
            int used = 0;
            juce::MidiMessage m (raw.data() + pos, (int) raw.size() - pos, used, status, 0.0, false);
            if (used <= 0) break;
            if (raw[(size_t) pos] >= 0x80) status = raw[(size_t) pos];
            scriptMidiCollector.addMessageToQueue (m);
            pos += used;
        }

        juce::StringArray hex;
        for (const int b : bytes) hex.add (juce::String::toHexString (b & 0xff).paddedLeft ('0', 2).toUpperCase());
        scriptLogLine ("midi out  [" + actionId + "]  " + hex.joinIntoString (" "));
    }

    // Receive device events window-CLOSED and route them to the C++ runtime. PlayerHost owns the
    // single service callback while the window is open (routing to JS); it nulls it on close, so we
    // reclaim it here (at setup + on each close edge). The window check is belt-and-braces.
    void installScriptDeviceCallback()
    {
        deviceService.setEventCallback ([this] (const juce::String& name, const juce::var& payload)
        {
            if (getActiveEditor() != nullptr || scriptRuntime == nullptr) return;  // window open -> JS handles it
            auto* o = payload.getDynamicObject();

            // Raw inbound taps (observational). onMidiIn for every message; onCcIn/onSysexIn refine it.
            if (name == "midiInputMessage")
            {
                if (o == nullptr) return;
                const auto bytes = hexToByteVarArray (o->getProperty ("hex").toString());
                const juce::String messageType = o->getProperty ("messageType").toString();
                const int status = bytes.size() > 0 ? (int) bytes.getReference (0) : 0;

                auto* mo = new juce::DynamicObject();
                mo->setProperty ("bytes", juce::var (bytes));
                mo->setProperty ("status", status);
                mo->setProperty ("channel", status != 0 ? (status & 0x0F) : 0);
                scriptRuntime->dispatchEvent ("onMidiIn", "", juce::var (mo));

                if (messageType == "cc" && bytes.size() >= 3)
                {
                    auto* co = new juce::DynamicObject();
                    co->setProperty ("channel", ((int) bytes.getReference (0)) & 0x0F);
                    co->setProperty ("cc", (int) bytes.getReference (1));
                    co->setProperty ("value", (int) bytes.getReference (2));
                    scriptRuntime->dispatchEvent ("onCcIn", "", juce::var (co));
                }
                return;
            }

            if (name == "sysexInputMessage")
            {
                if (o == nullptr) return;
                const auto bytes = hexToByteVarArray (o->getProperty ("hex").toString());
                scriptRuntime->dispatchEvent ("onSysexIn", "", juce::var (bytes));  // bare byte array
                return;
            }

            if (name != "dumpMessageParsed") return;
            if (o == nullptr) return;

            const auto values = o->getProperty ("values");
            juce::String role = o->getProperty ("deviceRole").toString();
            if (role.isEmpty()) role = "mainSynth";
            juce::String kind = o->getProperty ("dumpId").toString();
            if (kind.isEmpty()) kind = o->getProperty ("dumpName").toString();

            // Fill the mirror: decoded { deviceParameterId: value } -> control path -> value.
            if (auto* vobj = values.getDynamicObject())
                for (const auto& prop : vobj->getProperties())
                {
                    const auto it = scriptDumpParamPaths.find (prop.name.toString());
                    if (it != scriptDumpParamPaths.end()) scriptValues.setValue (it->second, prop.value);
                }

            // Inbound: set()s inside these handlers are silent by default.
            ceditor::scripting::InboundScope inbound (*scriptRuntime);

            // onDumpReceived({ values, kind, role }).
            auto* sp = new juce::DynamicObject();
            sp->setProperty ("values", values);
            sp->setProperty ("kind", kind);
            sp->setProperty ("role", role);
            scriptRuntime->dispatchEvent ("onDumpReceived", "", juce::var (sp));

            // onParameterReceived({ parameter, value }) — one per decoded parameter (the DPD payoff).
            if (auto* vobj = values.getDynamicObject())
                for (const auto& prop : vobj->getProperties())
                {
                    auto* pp = new juce::DynamicObject();
                    pp->setProperty ("parameter", prop.name.toString());
                    pp->setProperty ("value", prop.value);
                    scriptRuntime->dispatchEvent ("onParameterReceived", "", juce::var (pp));
                }
        });
    }

    // Parse a hex string (spaced or unspaced, e.g. "B0 4A 64") into an array of byte values.
    static juce::Array<juce::var> hexToByteVarArray (const juce::String& hexIn)
    {
        juce::Array<juce::var> out;
        const juce::String h = hexIn.removeCharacters (" ");
        for (int i = 0; i + 1 < h.length(); i += 2)
            out.add ((int) h.substring (i, i + 2).getHexValue32());
        return out;
    }
   #endif

    void setupScripting()
    {
        const auto json = juce::File (CEDITOR_PLAYER_PANEL_PATH).loadFileAsString();
        if (json.isEmpty() || ! scriptValues.loadFromJson (json)) return;

        using namespace ceditor::scripting;
        BridgeScriptHost::Callbacks cb;
        cb.getValue = [this] (const juce::String& path, const juce::String&) { return scriptValues.getValue (path); };
        cb.setValue = [this] (const juce::String& path, const juce::var& value, bool transmit)
        {
           #if CEDITOR_VALUE_LAYER
            // A bound control: drive the host parameter so the DAW records automation AND the M2 timer
            // transmits it to the synth window-closed. Unbound controls live only in the mirror.
            const auto it = scriptBoundParamByPath.find (path);
            if (transmit && it != scriptBoundParamByPath.end()) setParamFromUi (it->second, (float) value);
           #else
            juce::ignoreUnused (transmit);
           #endif
            scriptValues.setValue (path, value);   // mirror always (immediate read-back, drives unbound)
        };
       #if CEDITOR_VALUE_LAYER
        // Raw CC/NRPN/Sysex mirror the byte construction in panelRuntime.js so a script transmits
        // identically whether it runs window-open (JS) or window-closed (here). Role = "mainSynth".
        cb.sendCC = [this] (int ch, int cc, const juce::var& v)
        {
            const int c = juce::jlimit (1, 16, ch) - 1, n = juce::jlimit (0, 127, cc);
            scriptSendRawMidi ("cc_" + juce::String (n), { 0xB0 | c, n, juce::jlimit (0, 127, (int) v) });
        };
        cb.sendNRPN = [this] (int ch, int msb, int lsb, const juce::var& v)
        {
            const int s = 0xB0 | (juce::jlimit (1, 16, ch) - 1);
            const int m = juce::jlimit (0, 127, msb), l = juce::jlimit (0, 127, lsb), val = juce::jlimit (0, 16383, (int) v);
            scriptSendRawMidi ("nrpn_" + juce::String (m) + "_" + juce::String (l),
                               { s, 0x63, m, s, 0x62, l, s, 0x06, (val >> 7) & 0x7f, s, 0x26, val & 0x7f });
        };
        cb.sendSysex = [this] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr) b.add (juce::jlimit (0, 255, (int) x));
            else if (bytes.isString())
                for (const auto& tok : juce::StringArray::fromTokens (bytes.toString(), " ,", ""))
                    if (tok.isNotEmpty()) b.add (tok.getHexValue32() & 0xff);
            if (b.isEmpty()) return;
            if (b.getFirst() != 0xF0) b.insert (0, 0xF0);
            if (b.getLast()  != 0xF7) b.add (0xF7);
            scriptSendRawMidi ("sysex", b);
        };
        cb.requestDump = [this] (const juce::String& kind)
        {
            auto* p = new juce::DynamicObject();
            p->setProperty ("deviceRole", "mainSynth");
            p->setProperty ("request", kind);
            deviceService.startDeviceSync (juce::var (p));
        };
        cb.applyDump = [this] (const juce::var& bytes)
        {
            juce::String hex;
            if (auto* arr = bytes.getArray())
            {
                juce::StringArray hp;
                for (const auto& x : *arr) hp.add (juce::String::toHexString (juce::jlimit (0, 255, (int) x)).paddedLeft ('0', 2));
                hex = hp.joinIntoString (" ");
            }
            else hex = bytes.toString();
            if (hex.isEmpty()) return;
            auto* p = new juce::DynamicObject();
            p->setProperty ("deviceRole", "mainSynth");
            p->setProperty ("message", hex);
            deviceService.parseDumpMessage (juce::var (p), true);   // decode (panel fill arrives via Stage 5 sync)
        };
        cb.sendDump = [this] (const juce::String& kind)
        {
            auto* p = new juce::DynamicObject();
            p->setProperty ("deviceRole", "mainSynth");
            p->setProperty ("expectedDumpId", kind);
            p->setProperty ("dryRun", false);
            deviceService.startBulkDumpSend (juce::var (p));
        };
       #else
        cb.sendCC     = [] (int, int, const juce::var&) {};
        cb.sendNRPN   = [] (int, int, int, const juce::var&) {};
        cb.sendSysex  = [] (const juce::var&) {};
        cb.requestDump = [] (const juce::String&) {};
        cb.applyDump  = [] (const juce::var&) {};
        cb.sendDump   = [] (const juce::String&) {};
       #endif
        cb.buildDump  = [] (const juce::String&) { return juce::var(); };
        cb.runAction  = [] (const juce::String&, const juce::var&) { return juce::var(); };
        cb.emitEvent  = [] (const juce::String&, const juce::var&) {};
        cb.log = [] (const juce::String& msg, const juce::var& value)
        {
            scriptLogLine ("[script] " + msg + (value.isVoid() ? juce::String() : " " + juce::JSON::toString (value)));
        };
        cb.startTimer = [this] (const juce::String& id, int intervalMs) { scriptTimers.start (id, intervalMs); };
        cb.stopTimer  = [this] (const juce::String& id) { scriptTimers.stop (id); };

        scriptHost = std::make_unique<BridgeScriptHost> (std::move (cb));
        scriptRuntime = std::make_unique<ScriptRuntime> (*scriptHost);
        scriptHost->attachRuntime (scriptRuntime.get());
        scriptRuntime->setErrorLogger ([] (const juce::String& line) { scriptLogLine ("[script-error] " + line); });

        // Fire onTimer({ id }) on the message thread when a script timer elapses.
        scriptTimers.setFireCallback ([this] (const juce::String& id)
        {
            if (scriptRuntime == nullptr) return;
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", id);
            scriptRuntime->dispatchEvent ("onTimer", "", juce::var (info));
        });

       #if CEDITOR_VALUE_LAYER
        // Map control script-path <-> bound parameter, both directions: setValue routes bound writes to
        // the APVTS; an incoming dump fills the mirror by deviceParameterId. Built once from the panel.
        for (const auto& desc : panelParams)
        {
            if (desc.path.isNotEmpty()) scriptBoundParamByPath[desc.path] = desc.id;
            if (desc.deviceParameterId.isNotEmpty() && desc.path.isNotEmpty())
                scriptDumpParamPaths[desc.deviceParameterId] = desc.path;
        }
        installScriptDeviceCallback();   // receive window-closed device events (PlayerHost owns it open)
       #endif

        const auto loaded = ceditor::gatherPanelScripts (scriptValues.panel());
        scriptRuntime->loadScripts (loaded);
        scriptRuntime->onPanelLoad();   // window-closed init phase (before any GUI exists)
        scriptLogLine ("runtime ready — " + juce::String (loaded.size()) + " script(s) loaded (window-closed active)");
    }

    ceditor::PanelValueModel scriptValues;
    std::unique_ptr<ceditor::scripting::BridgeScriptHost> scriptHost;
    std::unique_ptr<ceditor::scripting::ScriptRuntime> scriptRuntime;
    // Declared after scriptRuntime so it is destroyed FIRST (stops its juce::Timer before the
    // runtime the fire callback references goes away).
    ceditor::scripting::TimerManager scriptTimers;
    std::map<juce::String, juce::String> scriptBoundParamByPath;  // control path -> APVTS param id (bound)
    std::map<juce::String, juce::String> scriptDumpParamPaths;    // deviceParameterId -> control path (dump fill)
    std::map<juce::String, float> lastScriptValue;                // change-detect for window-closed onValueChanged
    bool scriptWindowWasOpen = false;
    bool scriptReadyFired = false;
#endif
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessor)
};

class PlayerAudioProcessorEditor : public juce::AudioProcessorEditor
                                #if CEDITOR_VALUE_LAYER
                                 , private juce::Timer
                                #endif
{
public:
    explicit PlayerAudioProcessorEditor (PlayerAudioProcessor& p)
        : juce::AudioProcessorEditor (&p),
         #if CEDITOR_VALUE_LAYER
          host (p.panelFile(), &p.getDeviceService()),
          processor (p)
         #else
          host (p.panelFile())
         #endif
    {
        addAndMakeVisible (host);
        setResizable (true, true);
        setSize (800, 480);

       #if CEDITOR_VALUE_LAYER
        // UI -> host parameter: the user moved a control, so record automation.
        host.onUiParamChange = [&p] (const juce::String& id, float value) { p.setParamFromUi (id, value); };
        // UI is ready -> force a full re-push of current parameter values on the next tick.
        host.onResyncRequest = [this] { lastPushed.clear(); };
        // host parameter -> UI: poll the (atomic) parameter values and push changes to the panel so
        // automation playback moves the on-screen controls. Polling keeps us off the audio thread.
        startTimerHz (30);
       #endif
    }

   #if CEDITOR_VALUE_LAYER
    ~PlayerAudioProcessorEditor() override { stopTimer(); }
   #endif

    void resized() override { host.setBounds (getLocalBounds()); }

private:
    PlayerHost host;

   #if CEDITOR_VALUE_LAYER
    void timerCallback() override
    {
        for (const auto& desc : processor.parameterDescriptors())
        {
            if (auto* raw = processor.parameters().getRawParameterValue (desc.id))
            {
                const float value = raw->load();
                auto it = lastPushed.find (desc.id);
                if (it == lastPushed.end() || it->second != value)
                {
                    lastPushed[desc.id] = value;
                    host.pushParamToUi (desc.id, value);
                }
            }
        }
    }

    PlayerAudioProcessor& processor;
    std::map<juce::String, float> lastPushed;
   #endif

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessorEditor)
};
