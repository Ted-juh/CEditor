#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include <map>
#include <vector>
#include "PlayerHost.h"

#ifndef CEDITOR_PLAYER_PANEL_PATH
 #define CEDITOR_PLAYER_PANEL_PATH ""
#endif

#ifndef CEDITOR_SIDECAR_IDENTITY
 #define CEDITOR_SIDECAR_IDENTITY 0
#endif

#if CEDITOR_SIDECAR_IDENTITY
 #include "Export/PanelIdentitySidecar.h"
#endif

/**
 * The panel this build loads.
 *
 * A per-panel build bakes the path and this is that path, exactly as before. A TEMPLATE build --
 * one prebuilt binary copied per panel rather than relinked -- has no meaningful path baked in and
 * finds the panel sitting beside itself instead. See CE/src/Export/PanelIdentitySidecar.h.
 *
 * Behind the guard so a build that does not opt in cannot start reading files next to itself.
 */
static inline juce::File ceditorPlayerPanelFile()
{
   #if CEDITOR_SIDECAR_IDENTITY
    return ceditor::exporter::resolvePlayerPanelFile (CEDITOR_PLAYER_PANEL_PATH);
   #else
    return juce::File (CEDITOR_PLAYER_PANEL_PATH);
   #endif
}

#ifndef CEDITOR_VALUE_LAYER
 #define CEDITOR_VALUE_LAYER 0
#endif

#ifndef CEDITOR_SCRIPTING
 #define CEDITOR_SCRIPTING 0
#endif

#if CEDITOR_VALUE_LAYER
 #include "PanelParameters.h"
 #include "RestorePolicy.h"
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
        , panelParams (ce::parseExportParameters (ceditorPlayerPanelFile()))
        , apvts (*this, nullptr, "CEDITOR_PARAMS", ce::buildParameterLayout (panelParams))
#endif
    {
        scriptMidiCollector.reset (44100.0);  // valid before prepareToPlay; the host resets with the real rate
#if CEDITOR_VALUE_LAYER
        // The panel author's restore policy, read once. Absent means Ask, which is the conservative
        // reading: a panel exported before this setting existed pushed nothing at all.
        restorePolicy = ce::readPanelRestorePolicy (
            juce::JSON::parse (ceditorPlayerPanelFile().loadFileAsString()));
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
       #if CEDITOR_SCRIPTING
        // FIRST, while everything a teardown handler needs still works: its timers, its state, the
        // device service, set() and sendCC(). This is the plugin being unloaded — the real end of
        // the scripts, as distinct from the window closing (onPanelClose), which they survive.
        if (scriptRuntime != nullptr) scriptRuntime->onPanelDestroy();
       #endif
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
        captureHostPosition();
    }

    // --- Host playhead (transport "Host / DAW" source) --------------------------------
    // getPlayHead() is only valid inside processBlock, so the position is read HERE, on the
    // audio thread, into plain atomics -- no allocation, no locking, nothing that could
    // block. The editor's existing 30Hz timer reads them back on the message thread and
    // pushes to the panel. Same shape as the parameter polling below it, and for the same
    // reason: the audio thread must not touch the WebView.
    //
    // Hosts disagree about what they report and when (no tempo until playback starts, no
    // ppq at all in some offline renders), so each field carries its own validity flag
    // rather than a magic value -- the JS side treats "missing" and "zero" differently.
    struct HostPositionSnapshot
    {
        bool  valid = false;         // the host gave us a position at all
        bool  playing = false;
        bool  recording = false;
        bool  hasTempo = false;
        bool  hasPpq = false;
        bool  hasTimeSig = false;
        double bpm = 0.0;
        double ppqPosition = 0.0;
        int   timeSigNumerator = 0;
        int   timeSigDenominator = 0;
    };

    HostPositionSnapshot hostPosition() const noexcept
    {
        HostPositionSnapshot s;
        s.valid = hostPosValid.load (std::memory_order_relaxed);
        s.playing = hostPosPlaying.load (std::memory_order_relaxed);
        s.recording = hostPosRecording.load (std::memory_order_relaxed);
        s.hasTempo = hostPosHasTempo.load (std::memory_order_relaxed);
        s.hasPpq = hostPosHasPpq.load (std::memory_order_relaxed);
        s.hasTimeSig = hostPosHasTimeSig.load (std::memory_order_relaxed);
        s.bpm = hostPosBpm.load (std::memory_order_relaxed);
        s.ppqPosition = hostPosPpq.load (std::memory_order_relaxed);
        s.timeSigNumerator = hostPosTimeSigNum.load (std::memory_order_relaxed);
        s.timeSigDenominator = hostPosTimeSigDen.load (std::memory_order_relaxed);
        return s;
    }

private:
    void captureHostPosition() noexcept
    {
        auto* ph = getPlayHead();
        if (ph == nullptr)
        {
            hostPosValid.store (false, std::memory_order_relaxed);
            return;
        }

        const auto pos = ph->getPosition();
        if (! pos.hasValue())
        {
            hostPosValid.store (false, std::memory_order_relaxed);
            return;
        }

        if (const auto bpm = pos->getBpm())
        {
            hostPosBpm.store (*bpm, std::memory_order_relaxed);
            hostPosHasTempo.store (*bpm > 0.0, std::memory_order_relaxed);
        }
        else
        {
            hostPosHasTempo.store (false, std::memory_order_relaxed);
        }

        if (const auto ppq = pos->getPpqPosition())
        {
            hostPosPpq.store (*ppq, std::memory_order_relaxed);
            hostPosHasPpq.store (true, std::memory_order_relaxed);
        }
        else
        {
            hostPosHasPpq.store (false, std::memory_order_relaxed);
        }

        if (const auto sig = pos->getTimeSignature())
        {
            hostPosTimeSigNum.store (sig->numerator, std::memory_order_relaxed);
            hostPosTimeSigDen.store (sig->denominator, std::memory_order_relaxed);
            hostPosHasTimeSig.store (sig->numerator > 0 && sig->denominator > 0, std::memory_order_relaxed);
        }
        else
        {
            hostPosHasTimeSig.store (false, std::memory_order_relaxed);
        }

        hostPosPlaying.store (pos->getIsPlaying(), std::memory_order_relaxed);
        hostPosRecording.store (pos->getIsRecording(), std::memory_order_relaxed);
        hostPosValid.store (true, std::memory_order_relaxed);
    }

    std::atomic<bool>   hostPosValid { false };
    std::atomic<bool>   hostPosPlaying { false };
    std::atomic<bool>   hostPosRecording { false };
    std::atomic<bool>   hostPosHasTempo { false };
    std::atomic<bool>   hostPosHasPpq { false };
    std::atomic<bool>   hostPosHasTimeSig { false };
    std::atomic<double> hostPosBpm { 0.0 };
    std::atomic<double> hostPosPpq { 0.0 };
    std::atomic<int>    hostPosTimeSigNum { 0 };
    std::atomic<int>    hostPosTimeSigDen { 0 };

public:

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
        // The answer to "restore the hardware from this session?", if it has been given. Saved with
        // the project rather than globally: the decision was made about THIS session's patch and
        // this session's synth, and a different project is a different question.
        if (restoreAnswer.isNotEmpty())
            root.createNewChildElement ("RestoreAnswer")->addTextElement (restoreAnswer);

        // S3: the whole patch, as bytes, beside the automation list.
        //
        // The APVTS is NOT the patch and was never going to be. buildParameterLayout builds one
        // parameter per entry in `exportParameters` — the controls the author chose to expose to the
        // host — and a sensible panel exposes a few dozen of a synth's several hundred. Restoring
        // only those is a patch with the other four hundred left wherever the instrument had them.
        //
        // Read from a cache the message-thread timer maintains rather than built here: the host may
        // call this from any thread, and assembling two dumps means walking the profile and running
        // the shared encoder over every parameter in it.
        {
            const juce::SpinLock::ScopedLockType lock (capturedDumpsLock);
            if (capturedDumps.isNotEmpty())
                root.createNewChildElement ("DeviceDumps")->addTextElement (capturedDumps);
        }
       #if CEDITOR_SCRIPTING
        if (scriptRuntime != nullptr)
        {
            juce::var store (new juce::DynamicObject());   // scripts write their persisted state here
            scriptRuntime->onDawSaveState (store);
            root.createNewChildElement ("ScriptState")->addTextElement (juce::JSON::toString (store));
            // ce.storage settings ride along separately: they are the runtime's, not any one
            // script's, so merging them into `store` would let a script overwrite another's key.
            auto* settings = new juce::DynamicObject();
            for (int i = 0; i < scriptSettings.size(); ++i)
                settings->setProperty (scriptSettings.getName (i), scriptSettings.getValueAt (i));
            root.createNewChildElement ("ScriptSettings")->addTextElement (juce::JSON::toString (juce::var (settings)));
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
            if (auto* answer = xml->getChildByName ("RestoreAnswer"))
                restoreAnswer = answer->getAllSubText().trim();
            restoredDumps = juce::var();
            if (auto* dumps = xml->getChildByName ("DeviceDumps"))
                restoredDumps = juce::JSON::parse (dumps->getAllSubText());

            // ARM THE RESTORE PUSH — do not send here. This call can arrive before the ports are
            // open, before prepareToPlay, and on a thread with no business emitting SysEx. The
            // message-thread timer picks it up when the device says it is ready.
            //
            // Without this the whole feature was: values restored, ports reconnected, and the synth
            // left on whatever patch it happened to be on. The state was known and not transmitted,
            // which from the user's chair is the same as not having been saved.
            armRestorePush();
           #if CEDITOR_SCRIPTING
            // Settings first: a script's onDawRestoreState may well read one back.
            if (auto* sset = xml->getChildByName ("ScriptSettings"))
            {
                scriptSettings.clear();
                if (auto* obj = juce::JSON::parse (sset->getAllSubText()).getDynamicObject())
                    for (const auto& p : obj->getProperties()) scriptSettings.set (p.name, p.value);
            }
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

    juce::File panelFile() const { return ceditorPlayerPanelFile(); }

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
   #if CEDITOR_SCRIPTING
    // ce.time events, raised from this same 30Hz message-thread timer. That polling rate is the
    // honest limit: a beat at 120bpm is 500ms, so onBeat lands within a frame of it — right for
    // lighting an LED or stepping a sequencer, and NEVER to be used to time audio. Only
    // TRANSITIONS are raised, so a stopped transport is silent rather than repeating itself.
    int  lastScriptBeat = -1;
    int  lastScriptBar = -1;
    bool lastScriptPlaying = false;
    double lastScriptBpm = 0.0;

    void dispatchScriptTimeEvents()
    {
        if (scriptRuntime == nullptr) return;
        const auto pos = hostPosition();

        const bool playing = pos.valid && pos.playing;
        const double bpm = pos.valid && pos.hasTempo ? pos.bpm : 0.0;
        const int beatsPerBar = pos.valid && pos.hasTimeSig && pos.timeSigNumerator > 0
                                  ? pos.timeSigNumerator : 4;

        auto makePayload = [&] (int bar, int beat)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("playing", playing);
            if (bpm > 0.0) o->setProperty ("bpm", bpm);
            o->setProperty ("beats", pos.valid && pos.hasPpq ? pos.ppqPosition : 0.0);
            o->setProperty ("bar", bar);
            o->setProperty ("beat", beat);
            o->setProperty ("beatsPerBar", beatsPerBar);
            o->setProperty ("source", "host");
            return juce::var (o);
        };

        // Transport edges: started, stopped, or the tempo moved enough to matter.
        if (playing != lastScriptPlaying || std::abs (bpm - lastScriptBpm) > 0.001)
        {
            lastScriptPlaying = playing;
            lastScriptBpm = bpm;
            scriptRuntime->dispatchEvent ("onTransport", "panel", makePayload (0, 0));
        }

        if (! playing || ! pos.valid || ! pos.hasPpq)
        {
            // Stopped or position-less: forget where we were, so restarting raises the first beat
            // again instead of swallowing it as "no change".
            lastScriptBeat = -1;
            lastScriptBar = -1;
            return;
        }

        const int absoluteBeat = (int) std::floor (pos.ppqPosition);
        if (absoluteBeat == lastScriptBeat) return;
        lastScriptBeat = absoluteBeat;

        const int bar = absoluteBeat / juce::jmax (1, beatsPerBar) + 1;
        const int beat = absoluteBeat % juce::jmax (1, beatsPerBar) + 1;
        scriptRuntime->dispatchEvent ("onBeat", "panel", makePayload (bar, beat));
        if (bar != lastScriptBar)
        {
            lastScriptBar = bar;
            scriptRuntime->dispatchEvent ("onBar", "panel", makePayload (bar, beat));
        }
    }
   #endif

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
        // BEFORE the window-open early return, deliberately: a project reopened with the editor
        // showing still has a synth sitting on the wrong patch, and the restore is exactly as due
        // then as it is with the window closed. It is also the only state in which the question can
        // be asked at all.
        serviceRestorePush (windowOpen);
        serviceDumpCapture();

        if (windowOpen) { wasWindowOpen = true; return; }
        if (wasWindowOpen) { lastSentMidi.clear(); wasWindowOpen = false; } // just closed -> resend all
        for (const auto& desc : panelParams)
        {
            // A raw-MIDI-bound control has no deviceParameterId and still has something to send.
            // Skipping it here is what made every CC / NRPN / aftertouch binding automate in the DAW
            // and reach the synth only while the window was open.
            if (desc.deviceParameterId.isEmpty() && ! desc.hasMidiControl) continue;
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
        // ce.anim, from the same message-thread timer as everything else. The engine lives in
        // ScriptRuntime so ONE list exists; this only hands it the clock. 30Hz means a 300ms ramp
        // gets ~9 steps, which is right for a value and would be wrong for audio — nothing here
        // touches the audio thread.
        if (scriptRuntime != nullptr)
            scriptRuntime->tickAnimations ((double) juce::Time::getMillisecondCounterHiRes());
        dispatchScriptTimeEvents();
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

    // --- Total Recall S2: pushing a restored patch back at the hardware --------------------------
    //
    // The rules are in RestorePolicy.h and are a pure function, so every ordering they encode is
    // driven by RestorePolicyTests on any machine. What is here is the wiring: arming the flag,
    // asking the service whether the device is ready, raising the question, and doing the send.

    /** Called from setStateInformation. Never sends — see the comment there for why. */
    void armRestorePush()
    {
        restorePending = true;
        restorePromptSent = false;
        restoreArmedAtMs = juce::Time::getMillisecondCounterHiRes();
    }

    /** Is any role this panel actually binds reporting `ready`? */
    bool anyBoundDeviceReady() const
    {
        const auto session = deviceService.getSessionState();
        auto* sessionObj = session.getDynamicObject();
        if (sessionObj == nullptr) return false;

        juce::StringArray roles;
        for (const auto& desc : panelParams)
            if (desc.deviceParameterId.isNotEmpty())
                roles.addIfNotAlreadyThere (desc.deviceRole.isNotEmpty() ? desc.deviceRole : juce::String ("mainSynth"));

        // A panel of purely raw-MIDI bindings names no role. Those go out on the plugin's MIDI bus
        // rather than through a profile, so there is no port to be ready — the host is the route,
        // and it is there.
        if (roles.isEmpty()) return true;

        for (const auto& role : roles)
        {
            auto* record = sessionObj->getProperty (role).getDynamicObject();
            if (record != nullptr && record->getProperty ("state").toString() == "ready")
                return true;
        }
        return false;
    }

    /** Anything at all to push? A panel that binds nothing must not raise a question about it. */
    bool hasRestorableParameters() const
    {
        for (const auto& desc : panelParams)
            if (desc.deviceParameterId.isNotEmpty() || desc.hasMidiControl)
                return true;
        return false;
    }

    /**
     * Keep the captured-dump cache roughly current, cheaply.
     *
     * Every four seconds, and only when the patch has actually moved. A dump is a walk over the
     * whole profile, and a knob being dragged would otherwise rebuild it thirty times a second for
     * a save that may never come. Four seconds of staleness costs at most the last few knob moves
     * before a save, and the APVTS values — which restore after the dump — carry those anyway.
     */
    void serviceDumpCapture()
    {
        const auto now = juce::Time::getMillisecondCounterHiRes();
        if (now - dumpsLastCapturedMs < 4000.0) return;

        // Cheap change detection off the same map the send loop keeps. An unchanged patch is the
        // common case — a project sitting open — and it must cost nothing.
        bool changed = capturedDumps.isEmpty();
        for (const auto& desc : panelParams)
        {
            if (desc.deviceParameterId.isEmpty()) continue;
            auto* raw = apvts.getRawParameterValue (desc.id);
            if (raw == nullptr) continue;
            const float v = raw->load();
            const auto it = lastCapturedValue.find (desc.id);
            if (it == lastCapturedValue.end() || it->second != v) { changed = true; }
            lastCapturedValue[desc.id] = v;
        }
        if (! changed) return;

        dumpsLastCapturedMs = now;
        refreshCapturedDumps();
    }

    void serviceRestorePush (bool windowOpen)
    {
        if (! restorePending) return;

        // Not thirty times a second. A pending restore under Ask with the window closed waits
        // indefinitely and correctly, and asking the service to build a whole session-state object
        // at 30Hz for the entire life of that project would be a real cost for no extra
        // responsiveness — half a second is imperceptible against a device that takes seconds to
        // come up and a question that waits on a person.
        const auto now = juce::Time::getMillisecondCounterHiRes();
        if (now - restoreLastCheckedMs < 500.0) return;
        restoreLastCheckedMs = now;

        // The window that was carrying the question went away with it unanswered. Ask again when
        // one comes back: closing a plugin window is not an answer, and the patch is still not on
        // the synth. Without this the bar is shown once ever, and a user who closed the window
        // before reading it never sees the question again.
        if (restorePromptSent && ! windowOpen) restorePromptSent = false;

        ce::RestoreSituation situation;
        situation.policy = restorePolicy;
        situation.rememberedAnswer = restoreAnswer;
        situation.deviceReady = anyBoundDeviceReady();
        situation.windowOpen = windowOpen;
        situation.promptAlreadySent = restorePromptSent;
        situation.waitedMs = juce::Time::getMillisecondCounterHiRes() - restoreArmedAtMs;
        situation.hasParametersToSend = hasRestorableParameters();

        const auto verdict = ce::decideRestore (situation);

        switch (verdict.action)
        {
            case ce::RestoreAction::Wait:
                return;

            case ce::RestoreAction::Abandon:
                // Logged, always. A restore that silently did not happen is the failure this whole
                // feature exists to prevent, so "it did not, and here is why" is part of the deal.
                restorePending = false;
                scriptLogLine ("[restore] not pushing: " + verdict.reason);
                return;

            case ce::RestoreAction::Ask:
                // No callback means no window has claimed the question yet — the editor sets it in
                // its constructor. Marking it sent here would leave the restore pending forever
                // with nothing on screen, which is the silent no-restore this feature exists to
                // prevent. Try again on the next tick instead.
                if (onRestorePrompt == nullptr) return;
                restorePromptSent = true;
                scriptLogLine ("[restore] " + verdict.reason);
                onRestorePrompt (restorePromptDeviceName());
                return;

            case ce::RestoreAction::Send:
                restorePending = false;
                runRestorePush (verdict.reason);
                return;
        }
    }

    /**
     * What to call the instrument in the question.
     *
     * "Send this session's values to the connected device?" is a question nobody can answer with
     * confidence — the whole risk being guarded against is that the thing plugged in today is not
     * the thing the session was saved against, and a generic noun hides exactly that. So: the port
     * the role is actually bound to, then the profile it is bound as, then the generic.
     *
     * The session record has no `deviceName`; it has `midiDestination` (which carries the port's
     * name) and `profileId`. `pendingRequests` is a sibling of the role entries rather than one of
     * them, and is skipped by name.
     */
    juce::String restorePromptDeviceName() const
    {
        const auto session = deviceService.getSessionState();
        auto* sessionObj = session.getDynamicObject();
        if (sessionObj == nullptr) return "the connected device";

        juce::String profileFallback;
        for (const auto& property : sessionObj->getProperties())
        {
            if (property.name.toString() == "pendingRequests") continue;
            auto* record = property.value.getDynamicObject();
            if (record == nullptr) continue;
            if (record->getProperty ("state").toString() != "ready") continue;

            const auto port = record->getProperty ("midiDestination").getProperty ("name", juce::var()).toString();
            if (port.isNotEmpty()) return port;
            if (profileFallback.isEmpty()) profileFallback = record->getProperty ("profileId").toString();
        }
        return profileFallback.isNotEmpty() ? profileFallback : juce::String ("the connected device");
    }

    // --- Total Recall S3: the whole patch, not just the automation list ---------------------------
    //
    // The APVTS holds `exportParameters` — the controls the author exposed to the host, a few dozen
    // of a synth's several hundred. A restore built only from those puts the automatable values
    // back and leaves everything else wherever the instrument happened to be, which is a patch
    // nobody saved. The dump is the patch.
    //
    // Two layers on restore, in this order: send the DUMP (the whole thing, exactly), then apply
    // the VALUES (the automation-visible ones, which the host may have moved since the dump was
    // captured). Dump first — the same rule the Setlist follows when it sends MIDI before values,
    // and for the same reason: the stored values belong to the patch being restored, so the patch
    // has to land first or they are overwritten by it.

    /** Semantic values for every device-bound parameter, keyed by parameter id, out of the APVTS. */
    juce::var boundParameterValues() const
    {
        auto* values = new juce::DynamicObject();
        for (const auto& desc : panelParams)
        {
            if (desc.deviceParameterId.isEmpty()) continue;
            if (auto* raw = apvts.getRawParameterValue (desc.id))
                values->setProperty (desc.deviceParameterId, (double) raw->load());
        }
        return juce::var (values);
    }

    /**
     * Rebuild the captured-dump cache. Message thread only.
     *
     * Not done inside getStateInformation, because a host may call that from any thread and this
     * walks the profile and runs the shared encoder over every parameter in every dump. The cache
     * is a string under a spin lock; the lock is held only for the swap.
     */
    void refreshCapturedDumps()
    {
        auto* engine = deviceService.engineForRole ({});
        if (engine == nullptr) return;

        const auto ids = engine->dumpDefinitionIds();
        if (ids.isEmpty()) return;

        const auto values = boundParameterValues();
        auto* built = new juce::DynamicObject();
        for (const auto& id : ids)
        {
            const auto result = engine->buildDumpMessage (id, values);
            // A dump that will not build is skipped rather than aborting the others: a profile can
            // declare a dump this panel binds nothing in, and one unbuildable block should not cost
            // the user the block that would have worked.
            if (result.ok && result.hex.isNotEmpty())
                built->setProperty (id, result.hex);
        }

        auto json = juce::JSON::toString (juce::var (built), true);
        const juce::SpinLock::ScopedLockType lock (capturedDumpsLock);
        capturedDumps = built->getProperties().size() > 0 ? json : juce::String();
    }

    /**
     * Send the restored dumps, in the profile's declared order.
     *
     * Order is the profile's own and it matters: a device with a common block and per-part blocks
     * wants the common block first, and the profile author is the only one who knows which is
     * which. Returns how many were sent, for the log.
     */
    int sendRestoredDumps()
    {
        auto* stored = restoredDumps.getDynamicObject();
        if (stored == nullptr) return 0;

        auto* engine = deviceService.engineForRole ({});
        // Order from the profile when there is one to ask; otherwise whatever the saved object
        // holds, which at least sends them.
        juce::StringArray order = engine != nullptr ? engine->dumpDefinitionIds() : juce::StringArray();
        if (order.isEmpty())
            for (const auto& property : stored->getProperties())
                order.add (property.name.toString());

        int sent = 0;
        for (const auto& id : order)
        {
            const auto hex = stored->getProperty (id).toString();
            if (hex.isEmpty()) continue;

            juce::Array<int> bytes;
            for (const auto& token : juce::StringArray::fromTokens (hex, " ", ""))
                if (token.isNotEmpty())
                    bytes.add (token.getHexValue32() & 0xff);

            if (bytes.isEmpty()) continue;
            sendRawMidiBytes ("restore_dump_" + id, bytes);
            ++sent;
        }
        return sent;
    }

    /**
     * Send every bound parameter's restored value.
     *
     * `lastSentMidi` is cleared first, which is what makes this a full push rather than a diff: the
     * map holds what was sent to a synth that is no longer the one in front of us, and a restore
     * that skipped every value matching a stale cache entry would leave exactly those parameters
     * wrong. Pacing is the engine's job — compileParameterMessage goes through the same paced
     * transaction path a `syncDirection: push` already uses.
     */
    void runRestorePush (const juce::String& reason)
    {
        // THE DUMP FIRST. The values below belong to the patch this dump IS, so sending them first
        // would have the dump overwrite them a moment later — the same ordering rule the Setlist
        // follows when it sends MIDI before values.
        const int dumps = sendRestoredDumps();

        lastSentMidi.clear();

        int sent = 0;
        for (const auto& desc : panelParams)
        {
            if (desc.deviceParameterId.isEmpty() && ! desc.hasMidiControl) continue;
            if (auto* raw = apvts.getRawParameterValue (desc.id))
            {
                const float v = raw->load();
                lastSentMidi[desc.id] = v;
                sendParamMidi (desc, v);
                ++sent;
            }
        }

        scriptLogLine ("[restore] pushed " + juce::String (dumps) + " dump(s) and "
                       + juce::String (sent) + " parameter(s) to the device (" + reason + ")");
        // The instrument is now on the restored patch, so the cache should describe that rather
        // than whatever it held from the previous project.
        refreshCapturedDumps();
    }

public:
    /**
     * The user's answer to the restore question: "always" or "never".
     *
     * Remembered for the session and saved with the project, so the question is asked once. Called
     * from the editor on the message thread; the push itself still happens on the next timer tick,
     * through the same decision path as every other route into it.
     */
    void answerRestorePrompt (const juce::String& answer)
    {
        const auto a = answer.trim().toLowerCase();
        if (a != "always" && a != "never") return;
        restoreAnswer = a;
        updateHostDisplay();   // the project is dirty: this choice is saved with it
    }

    /** True while a restore is armed and unresolved — the editor shows the question off this. */
    bool isRestorePending() const { return restorePending; }

    /** Raised when the question needs asking. The editor wires this to the panel UI. */
    std::function<void (const juce::String& deviceName)> onRestorePrompt;

private:
    void sendParamMidi (const ce::PanelParameter& desc, float value)
    {
        if (desc.deviceParameterId.isEmpty() && desc.hasMidiControl)
        {
            sendParamRawMidi (desc, value);
            return;
        }

        auto* payload = new juce::DynamicObject();
        payload->setProperty ("deviceRole", desc.deviceRole.isNotEmpty() ? desc.deviceRole : juce::String ("mainSynth"));
        payload->setProperty ("parameterId", desc.deviceParameterId);
        payload->setProperty ("value", value);
        payload->setProperty ("dryRun", false);
        deviceService.compileParameterMessage (juce::var (payload), true);
    }

    /**
     * A raw-MIDI-bound parameter, automated with the window closed.
     *
     * MIRRORS utils/midiControlBindings.js midiControlMessage() byte for byte, including the two
     * things about it that look like oversights and are not:
     *
     *   - the value is clamped, NOT scaled. A raw binding carries three bytes and no range, so the
     *     control's own value is already in MIDI units; scaling here and not in the editor would
     *     make the exported plugin send different numbers from the panel it was exported from.
     *   - Bank Select is not folded into a program change. It is CC 0 and CC 32, which the cc kind
     *     already sends, and a bank pair baked silently into every program change is a message the
     *     user did not ask for going to a synth that may not want it.
     *
     * Out through sendRawMidiBytes, the same funnel every raw send uses, so a script's
     * ce.midi.interceptOut sees these too.
     */
    void sendParamRawMidi (const ce::PanelParameter& desc, float value)
    {
        const auto& midi = desc.midiControl;
        const int channel = juce::jlimit (1, 16, midi.channel > 0 ? midi.channel : 1);
        const int status = 0xb0 + channel - 1;
        const int number = juce::roundToInt (value);

        juce::Array<int> bytes;

        if (midi.kind == "aftertouch")
        {
            bytes.add (0xd0 + channel - 1);
            bytes.add (juce::jlimit (0, 127, number));
        }
        else if (midi.kind == "programChange")
        {
            bytes.add (0xc0 + channel - 1);
            bytes.add (juce::jlimit (0, 127, number));
        }
        else if (midi.kind == "nrpn" || midi.kind == "rpn")
        {
            const bool isRpn = midi.kind == "rpn";
            const int selectMsb = isRpn ? 101 : 99;
            const int selectLsb = isRpn ? 100 : 98;
            const bool wide = midi.valueResolution == 14;
            const int v = juce::jlimit (0, wide ? 16383 : 127, number);

            bytes.addArray ({ status, selectMsb, juce::jlimit (0, 127, midi.parameterMsb) });
            bytes.addArray ({ status, selectLsb, juce::jlimit (0, 127, midi.parameterLsb) });
            bytes.addArray ({ status, 6, wide ? ((v >> 7) & 0x7f) : v });
            if (wide) bytes.addArray ({ status, 38, v & 0x7f });
            if (midi.nullAfterSend)
            {
                bytes.addArray ({ status, selectMsb, 127 });
                bytes.addArray ({ status, selectLsb, 127 });
            }
        }
        else    // cc
        {
            bytes.addArray ({ status, midi.controller & 0x7f, juce::jlimit (0, 127, number) });
        }

        if (! bytes.isEmpty())
            sendRawMidiBytes ("automation_" + desc.id, bytes);
    }

    juce::Array<ce::PanelParameter> panelParams;  // declared before apvts (init order matters)
    juce::AudioProcessorValueTreeState apvts;
    ceditor::device::DeviceProfileService deviceService;
    std::map<juce::String, float> lastSentMidi;

    // Total Recall S2. `restorePolicy` is the panel author's default, read once at construction;
    // `restoreAnswer` is the user's decision, which outranks it and is saved with the project.
    ce::RestorePolicy restorePolicy = ce::RestorePolicy::Ask;
    juce::String restoreAnswer;          // "", "always" or "never"
    bool restorePending = false;
    bool restorePromptSent = false;
    double restoreArmedAtMs = 0.0;
    double restoreLastCheckedMs = 0.0;

    // S3. `capturedDumps` is a JSON object of dumpId -> hex, rebuilt on the message thread and read
    // by getStateInformation, which the host may call from another one — hence the lock, held only
    // for the swap. `restoredDumps` is what came back out of the project file.
    juce::String capturedDumps;
    juce::SpinLock capturedDumpsLock;
    juce::var restoredDumps;
    double dumpsLastCapturedMs = 0.0;
    std::map<juce::String, float> lastCapturedValue;
    // What preset each role is on, as far as anything has said — a recall going out or a Program
    // Change coming in. Not a reading of the instrument: a synth does not announce its patch, so
    // "unknown" (-1) is a real answer a script can act on rather than a confident wrong one.
    std::map<juce::String, int> currentPresetSlot;
    std::map<juce::String, juce::String> currentPresetSource;
    /**
     * THE ONE FUNNEL every raw MIDI send leaves through, script or not.
     *
     * Queues the bytes onto the plugin's MIDI OUTPUT BUS (drained in processBlock). The DAW routes
     * that track to the synth's hardware port — the plugin never opens a port itself; that is the
     * standalone's job, and a plugin opening hardware ports fights the host and is not portable.
     * `bytes` may be a multi-message stream (an NRPN is four CCs), so it is split into messages.
     *
     * IT LIVES HERE, NOT IN THE SCRIPTING BLOCK, and that is the whole point of this shape. It used
     * to be `scriptSendRawMidi`, defined under `#if CEDITOR_SCRIPTING`. The automation path calls it
     * too — a raw-MIDI-bound control moved by the host — and that call sits under CEDITOR_VALUE_LAYER
     * alone. The two flags are independent, so a build with the value layer ON and scripting OFF had
     * the call and not the callee: `error C3861: 'scriptSendRawMidi': identifier not found`. It
     * compiled everywhere scripting happened to be on, which is every configuration anyone had run.
     */
    void sendRawMidiBytes (const juce::String& actionId, const juce::Array<int>& bytesIn)
    {
        if (bytesIn.isEmpty()) return;

        juce::Array<int> bytes = bytesIn;

       #if CEDITOR_SCRIPTING
        // interceptMidiOut runs HERE, at the funnel, so a filter sees the assembled bytes rather
        // than each verb's arguments — and so it sees AUTOMATION sends as well as script ones, which
        // is the reason the automation path was routed through here in the first place. A filter
        // that swallows the message stops it dead: nothing reaches the collector, nothing is
        // reported as sent.
        if (scriptRuntime != nullptr)
        {
            juce::Array<juce::var> asVar;
            for (const int b : bytes) asVar.add (b);
            juce::var payload (asVar);
            if (! scriptRuntime->filterMidi (false, payload)) return;    // swallowed by a script
            if (auto* arr = payload.getArray())
            {
                bytes.clearQuick();
                for (const auto& x : *arr) bytes.add (juce::jlimit (0, 255, (int) x));
            }
            if (bytes.isEmpty()) return;
        }
       #endif

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

       #if CEDITOR_SCRIPTING
        juce::StringArray hex;
        for (const int b : bytes) hex.add (juce::String::toHexString (b & 0xff).paddedLeft ('0', 2).toUpperCase());
        // The routed role is logged, not applied: in the plugin every send leaves through the
        // plugin's own MIDI output bus, and which synth that reaches is the DAW's routing decision,
        // not ours. Saying so in the log is honest; silently accepting a role we cannot honour is the
        // failure mode this whole audit keeps finding. routeMidi() is fully applied in the panel
        // view, where sends are addressed to a device role directly.
        scriptLogLine ("midi out  [" + actionId + "]"
                       + (scriptRouteRole.isNotEmpty() ? "  {route " + scriptRouteRole + ", DAW-routed here}" : juce::String())
                       + "  " + hex.joinIntoString (" "));
       #else
        juce::ignoreUnused (actionId);
       #endif
    }

    bool wasWindowOpen = false;
#endif

    // Window-closed activity, appended to a file, so it is observable without a debugger or a MIDI
    // monitor: tail %TEMP%\ceditor-player-scripts.log.
    //
    // OUTSIDE BOTH GUARDS, for the reason written up on sendRawMidiBytes below: it used to live
    // under `#if CEDITOR_SCRIPTING`, and the restore push (CEDITOR_VALUE_LAYER) logs through it
    // too. The two flags are independent, so a build with the value layer on and scripting off had
    // the call and not the callee — the exact `C3861: identifier not found` that bit once already.
    static void scriptLogLine (const juce::String& line)
    {
        auto f = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("ceditor-player-scripts.log");
        f.appendText (juce::Time::getCurrentTime().toString (true, true, true, true) + "  " + line + juce::newLine);
    }

#if CEDITOR_SCRIPTING
    // Window-closed script runtime (Model 2). The full-mirror value model (scriptValues) backs
    // get/set so a script behaves identically whether the GUI is open (WebView/JS) or closed (here).
    // Stage 3 wires instantiation + lifecycle + DAW state; Stage 4 (script MIDI sends) now transmits
    // via the plugin's MIDI output bus (scriptMidiCollector -> processBlock). JS<->C++ value sync for
    // UNBOUND controls (Stage 5) is still TODO. Declared after deviceService and in this order so the
    // runtime (holds host&) tears down before the host, and scriptValues outlives both.

   #if CEDITOR_VALUE_LAYER
    // The role a routeMidi(role, fn) block is in force for, empty outside one.
    juce::String scriptRouteRole;

    // Receive device events window-CLOSED and route them to the C++ runtime. PlayerHost owns the
    // single service callback while the window is open (routing to JS); it nulls it on close, so we
    // reclaim it here (at setup + on each close edge). The window check is belt-and-braces.
    /** Deliver one inbound MIDI message to the scripts: interceptMidiIn first, then
        onMidiIn / onCcIn / onNoteIn|onNoteOffIn. Named rather than inline because feedMidi() has to
        mean EXACTLY this — same filters, same events, same order — and two copies of that ordering
        would be two chances for a fed message to behave unlike a real one. */
    void deliverInboundMidi (const juce::var& message)
    {
        auto* o = message.getDynamicObject();
        if (o == nullptr || scriptRuntime == nullptr) return;

        auto bytes = hexToByteVarArray (o->getProperty ("hex").toString());
        const juce::String messageType = o->getProperty ("messageType").toString();

        // interceptMidiIn runs BEFORE any of the three events below, so a filter that transposes or
        // remaps is seen by every handler rather than by whichever one happened to be dispatched
        // first — and a filter that swallows means no events at all.
        {
            juce::var filtered (bytes);
            if (! scriptRuntime->filterMidi (true, filtered)) return;
            if (auto* arr = filtered.getArray())
            {
                bytes.clearQuick();
                for (const auto& x : *arr) bytes.add ((int) x);
            }
            if (bytes.isEmpty()) return;
        }

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

        // A Program Change is the instrument saying which preset it is on. Raised as its own event
        // rather than left to onMidiIn, because it carries the PROFILE's reading of that slot — the
        // name, the bank, whether it is writable — which is a different thing from "a 0xC0 arrived".
        // Same shape and same reasoning as panelRuntime.js's inbound path.
        if ((status & 0xF0) == 0xC0 && bytes.size() >= 2)
        {
            auto role = o->getProperty ("deviceRole").toString();
            if (role.isEmpty()) role = "mainSynth";
            const int program = ((int) bytes.getReference (1)) & 0x7f;
            const auto previous = currentPresetSlot.find (role);
            // Change-detected, so a device echoing its own Program Change back does not raise twice.
            if (previous == currentPresetSlot.end() || previous->second != program
                || currentPresetSource[role] != "device")
            {
                currentPresetSlot[role] = program;
                currentPresetSource[role] = "device";

                auto* po = new juce::DynamicObject();
                po->setProperty ("role", role);
                po->setProperty ("slot", program);
                po->setProperty ("source", "device");
                auto* engine = deviceService.engineForRole (role);
                const auto info = engine != nullptr
                    ? engine->presetSlotInfo (program)
                    : ceditor::device::DeviceProfileEngine::PresetSlotInfo{};
                po->setProperty ("program", info.program);
                po->setProperty ("name", info.catalogName);
                po->setProperty ("category", info.category);
                po->setProperty ("bankId", info.bankId);
                po->setProperty ("bankLabel", info.bankLabel);
                po->setProperty ("writable", info.writable);
                scriptRuntime->dispatchEvent ("onPresetChange", "", juce::var (po));
            }
        }

        // Notes. Classified from the STATUS BYTE rather than from messageType, so this and the
        // WebView (panelRuntime noteEventFor) cannot decide differently — and because only the
        // status byte settles the case below.
        if (bytes.size() >= 3)
        {
            const int kind = status & 0xF0;
            if (kind == 0x90 || kind == 0x80)
            {
                auto* no = new juce::DynamicObject();
                // 1-16, matching sendNote, so onNoteIn -> sendNote echoes correctly.
                no->setProperty ("channel", (status & 0x0F) + 1);
                no->setProperty ("note", (int) bytes.getReference (1));
                no->setProperty ("velocity", (int) bytes.getReference (2));
                // A note-on with velocity 0 IS a note-off. Devices using running status send them
                // constantly, and a panel that treated one as a note-on would hang a voice on every
                // key release.
                const bool off = (kind == 0x80) || ((int) bytes.getReference (2) == 0);
                scriptRuntime->dispatchEvent (off ? "onNoteOffIn" : "onNoteIn", "", juce::var (no));
            }
        }
    }


    void installScriptDeviceCallback()
    {
        deviceService.setEventCallback ([this] (const juce::String& name, const juce::var& payload)
        {
            if (getActiveEditor() != nullptr || scriptRuntime == nullptr) return;  // window open -> JS handles it
            auto* o = payload.getDynamicObject();

            // Raw inbound taps. onMidiIn for every message; onCcIn/onNoteIn refine it.
            if (name == "midiInputMessage") { deliverInboundMidi (payload); return; }

            if (name == "sysexInputMessage")
            {
                if (o == nullptr) return;
                const auto bytes = hexToByteVarArray (o->getProperty ("hex").toString());
                scriptRuntime->dispatchEvent ("onSysexIn", "", juce::var (bytes));  // bare byte array

                // …and then the layouts the SCRIPT declared (ce.device.defineDump). onSysexIn fires
                // either way: a declared layout ADDS a decoded reading, it does not take the raw one
                // away, and a panel that handles both must see both. matchDeviceDump returns void
                // when nothing is declared, so a panel that never called defineDump is untouched.
                juce::String role = o->getProperty ("deviceRole").toString();
                if (role.isEmpty()) role = "mainSynth";
                const auto declared = scriptRuntime->matchDeviceDump (role, juce::var (bytes));
                if (auto* d = declared.getDynamicObject())
                    dispatchDumpReceived (d->getProperty ("values"), d->getProperty ("kind").toString(), role);
                return;
            }

            if (name != "dumpMessageParsed") return;
            if (o == nullptr) return;

            juce::String role = o->getProperty ("deviceRole").toString();
            if (role.isEmpty()) role = "mainSynth";
            juce::String kind = o->getProperty ("dumpId").toString();
            if (kind.isEmpty()) kind = o->getProperty ("dumpName").toString();
            dispatchDumpReceived (o->getProperty ("values"), kind, role);
        });
    }

    /** One decoded dump, however it was decoded: by the device profile's codec, or by a layout the
        script declared. Shared so the two cannot fill the panel or raise events differently — the
        second decoder is the point at which "nearly the same" becomes a bug nobody can reproduce. */
    void dispatchDumpReceived (const juce::var& values, const juce::String& kind, const juce::String& role)
    {
        if (scriptRuntime == nullptr) return;

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

    /** The `{ ok: false, error }` shape a script-facing callback returns when it cannot answer. */
    static juce::var errorVar (const juce::String& message)
    {
        auto* out = new juce::DynamicObject();
        out->setProperty ("ok", false);
        out->setProperty ("error", message);
        return juce::var (out);
    }

    void setupScripting()
    {
        const auto json = ceditorPlayerPanelFile().loadFileAsString();
        if (json.isEmpty() || ! scriptValues.loadFromJson (json)) return;

        using namespace ceditor::scripting;
        BridgeScriptHost::Callbacks cb;
        // `form` is honoured, not dropped: PanelValueModel maps "normalizedValue" against the
        // control's own Behavior.min/max, so get("cutoff.normalizedValue") answers window-closed
        // exactly as it does in the panel view.
        cb.getValue = [this] (const juce::String& path, const juce::String& form) { return scriptValues.getValue (path, form); };
        cb.setValue = [this] (const juce::String& path, const juce::var& value, bool transmit, const juce::String& form)
        {
           #if CEDITOR_VALUE_LAYER
            // A bound control: drive the host parameter so the DAW records automation AND the M2 timer
            // transmits it to the synth window-closed. Unbound controls live only in the mirror.
            const auto it = scriptBoundParamByPath.find (path);
            if (transmit && it != scriptBoundParamByPath.end()) setParamFromUi (it->second, (float) value);
           #else
            juce::ignoreUnused (transmit);
           #endif
            // mirror always (immediate read-back, drives unbound) — and SAY so when the path led
            // nowhere. A write that vanishes is the defect the panel-view runtime spent a round
            // removing, and it read exactly the same here: the contract's headline is that coverage
            // is total, so a path that resolves to nothing has to report rather than disappear.
            if (! scriptValues.setValue (path, value, form))
                scriptLogLine ("[script] set(\"" + path + "\"): nothing was written — that path does "
                               "not lead anywhere on this panel. A state patch key like "
                               "\"Background.Fill.colour\" is ONE map key rather than three path steps.");
        };
       #if CEDITOR_VALUE_LAYER
        // Raw CC/NRPN/Sysex mirror the byte construction in panelRuntime.js so a script transmits
        // identically whether it runs window-open (JS) or window-closed (here). Role = "mainSynth".
        cb.sendCC = [this] (int ch, int cc, const juce::var& v)
        {
            const int c = juce::jlimit (1, 16, ch) - 1, n = juce::jlimit (0, 127, cc);
            sendRawMidiBytes ("cc_" + juce::String (n), { 0xB0 | c, n, juce::jlimit (0, 127, (int) v) });
        };
        cb.sendNRPN = [this] (int ch, int msb, int lsb, const juce::var& v)
        {
            const int s = 0xB0 | (juce::jlimit (1, 16, ch) - 1);
            const int m = juce::jlimit (0, 127, msb), l = juce::jlimit (0, 127, lsb), val = juce::jlimit (0, 16383, (int) v);
            sendRawMidiBytes ("nrpn_" + juce::String (m) + "_" + juce::String (l),
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
            sendRawMidiBytes ("sysex", b);
        };
        // Raw bytes straight out — notes, program change, bend, aftertouch, clock all arrive here
        // already assembled by the prelude, so the host does no interpretation.
        cb.sendMidi = [this] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr) b.add (juce::jlimit (0, 255, (int) x));
            if (b.isEmpty()) return;
            sendRawMidiBytes ("raw", b);
        };
        // routeMidi(role, fn): the role in force for the block's sends. Stored rather than pushed
        // through every sender, and restored by endRoute — a throw inside the block unwinds through
        // the engine's own finally, so the override cannot outlive it.
        cb.beginRoute = [this] (const juce::String& role) { scriptRouteRole = role; };
        cb.endRoute   = [this] { scriptRouteRole.clear(); };

        // feedMidi(bytes): inject as if the hardware had sent it. With the window closed there is no
        // panel view to drive, so "as if received" means exactly what a real message means here —
        // the same three script events, through the same inbound filters, in the same order.
        cb.feedMidi = [this] (const juce::var& bytes)
        {
            juce::StringArray hex;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr)
                    hex.add (juce::String::toHexString (juce::jlimit (0, 255, (int) x)).paddedLeft ('0', 2));
            if (hex.isEmpty()) return;
            const int status = bytes.getArray() != nullptr && bytes.getArray()->size() > 0
                             ? juce::jlimit (0, 255, (int) bytes.getArray()->getReference (0)) : 0;
            auto* fo = new juce::DynamicObject();
            fo->setProperty ("hex", hex.joinIntoString (" "));
            fo->setProperty ("messageType", (status & 0xF0) == 0xB0 ? "cc" : "raw");
            deliverInboundMidi (juce::var (fo));
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
        // buildDump — the encode direction, and the counterpart to the requestDump/onDumpReceived
        // pair above. It returned an empty var for a long time, which meant a script could read a
        // patch out of an instrument and had no way to assemble one to send back.
        //
        // Values come from the panel itself. Every mapping in a dump definition names a device
        // PARAMETER, and `panelParams` already knows which control drives which parameter (its
        // `deviceParameterId`, derived at export), so the control's current value in `scriptValues`
        // is the value that parameter should carry. Parameters no control is bound to are simply not
        // supplied, and the engine leaves the definition's default bytes in place and says which
        // they were — the ordinary case for a panel that covers part of a dump.
        cb.buildDump = [this] (const juce::String& kind) -> juce::var
        {
            auto* engine = deviceService.engineForRole ({});
            if (engine == nullptr)
                return errorVar ("No device profile is loaded");

            auto* values = new juce::DynamicObject();
            for (const auto& desc : panelParams)
            {
                if (desc.deviceParameterId.isEmpty())
                    continue;
                const auto value = scriptValues.getValue (desc.path, {});
                if (! value.isVoid())
                    values->setProperty (desc.deviceParameterId, value);
            }

            const auto built = engine->buildDumpMessage (kind, juce::var (values));
            if (! built.ok)
                return errorVar (built.error);

            // The shape a script gets back: the bytes to send, plus what was and was not covered.
            // `unmapped` is the interesting field — it is how a script can tell it is about to send
            // a patch with forty of sixty parameters left at their defaults.
            auto* out = new juce::DynamicObject();
            out->setProperty ("ok", true);
            out->setProperty ("dumpId", built.dumpId);
            out->setProperty ("hex", built.hex);
            out->setProperty ("checksum", built.checksumStatus);
            juce::Array<juce::var> byteVars;
            for (const auto byte : built.bytes)
                byteVars.add (byte);
            out->setProperty ("bytes", byteVars);
            out->setProperty ("unmapped", juce::var (built.unmappedParameters.joinIntoString (",")));
            return juce::var (out);
        };
        // ce.device reads. Window-CLOSED these are synchronous calls straight into
        // DeviceProfileService, so a script gets the complete answer on the first call — unlike
        // the editor, where the parameter table arrives over the async bridge (documented there).
        // What the panel document holds. One query verb, like deviceQuery, so a later question does
        // not change the interface every host implements. "controls" is what ce.panel.snapshot walks.
        cb.panelQuery = [this] (const juce::String& kind, const juce::var&) -> juce::var
        {
            if (kind != "controls") return {};
            juce::Array<juce::var> names;
            for (const auto& n : scriptValues.controlNames()) names.add (n);
            return juce::var (names);
        };

        cb.deviceWrite = [this] (const juce::String& parameterId, const juce::var& value,
                                 const juce::String& roleIn) -> bool
        {
            if (parameterId.isEmpty()) return false;
            auto* req = new juce::DynamicObject();
            req->setProperty ("deviceRole", roleIn.isEmpty() ? juce::String ("mainSynth") : roleIn);
            req->setProperty ("parameterId", parameterId);
            req->setProperty ("value", value);
            req->setProperty ("dryRun", false);      // actually send it
            const auto result = deviceService.compileParameterMessage (juce::var (req), true);
            auto* obj = result.getDynamicObject();
            return obj != nullptr && (bool) obj->getProperty ("ok");
        };

        // setVariable / setTiming. The override goes onto this project's ROLE MAPPING, merged over
        // the profile's defaults on the way to every recipe — a profile is a shared document and
        // two panels driving two units of the same synth must not have to edit it to disagree
        // about a device id.
        cb.deviceSet = [this] (const juce::String& kind, const juce::String& name,
                               const juce::var& value, const juce::String& roleIn) -> bool
        {
            if (name.isEmpty()) return false;
            const auto role = roleIn.isEmpty() ? juce::String ("mainSynth") : roleIn;
            const bool wantVars = kind == "variable";
            if (! wantVars && kind != "timing") return false;

            const auto session = deviceService.getSessionState();
            auto* sessionObj = session.getDynamicObject();
            const auto record = sessionObj != nullptr ? sessionObj->getProperty (role) : juce::var();
            auto* recordObj = record.getDynamicObject();
            const auto profileId = recordObj != nullptr ? recordObj->getProperty ("profileId").toString()
                                                        : juce::String();
            if (profileId.isEmpty()) return false;   // nothing mapped — say so rather than pretend

            // Carried forward whole: setDeviceRoleMapping replaces the mapping, so dropping the
            // ports here would silently unplug the device this call is about.
            auto* req = new juce::DynamicObject();
            req->setProperty ("role", role);
            req->setProperty ("profileId", profileId);
            if (recordObj != nullptr)
                for (const char* key : { "midiDestination", "midiInput", "syncDirection" })
                    req->setProperty (key, recordObj->getProperty (key));

            const char* slot = wantVars ? "variables" : "timingOverrides";
            auto* merged = new juce::DynamicObject();
            if (recordObj != nullptr)
                if (auto* existing = recordObj->getProperty (slot).getDynamicObject())
                    for (const auto& e : existing->getProperties())
                        merged->setProperty (e.name, e.value);
            merged->setProperty (juce::Identifier (name), value);
            req->setProperty (slot, juce::var (merged));
            if (recordObj != nullptr)
                req->setProperty (wantVars ? "timingOverrides" : "variables",
                                  recordObj->getProperty (wantVars ? "timingOverrides" : "variables"));

            const auto result = deviceService.setDeviceRoleMapping (juce::var (req));
            auto* obj = result.getDynamicObject();
            return obj == nullptr || (bool) obj->getProperty ("ok");
        };

        cb.deviceQuery = [this] (const juce::String& kind, const juce::var& payload) -> juce::var
        {
            auto* p = payload.getDynamicObject();
            auto role = p != nullptr ? p->getProperty ("role").toString() : juce::String();
            if (role.isEmpty()) role = "mainSynth";

            const auto session = deviceService.getSessionState();
            auto* sessionObj = session.getDynamicObject();
            const auto record = sessionObj != nullptr ? sessionObj->getProperty (role) : juce::var();
            auto* recordObj = record.getDynamicObject();
            const auto state = recordObj != nullptr ? recordObj->getProperty ("state").toString() : juce::String();
            const bool ready = state == "ready";

            if (kind == "connected")
                return juce::var (ready);

            // ports() — what is actually plugged in. connected(role) only answers yes/no for a role
            // somebody configured in advance; this enumerates the real ports, so a panel can offer
            // a choice or notice a device that showed up. Both directions come back as one flat
            // list with a `direction` field, because "everything I could reach" is the question,
            // and `opts.direction` narrows it.
            if (kind == "ports")
            {
                const auto wanted = p != nullptr ? p->getProperty ("direction").toString().toLowerCase()
                                                 : juce::String();
                juce::Array<juce::var> out;

                const auto addAll = [&] (const juce::var& list, const char* dir, const char* mappingKey)
                {
                    auto* arr = list.getArray();
                    if (arr == nullptr) return;
                    for (const auto& item : *arr)
                    {
                        auto* src = item.getDynamicObject();
                        if (src == nullptr) continue;
                        const auto id = src->getProperty ("id").toString();
                        const auto type = src->getProperty ("type").toString();

                        // Which role is currently using this port, or "". A field rather than a
                        // cross-reference the script has to build for itself.
                        juce::String usedBy;
                        if (auto* sessionRoles = session.getDynamicObject())
                            for (const auto& entry : sessionRoles->getProperties())
                                if (auto* rec = entry.value.getDynamicObject())
                                    if (auto* port = rec->getProperty (mappingKey).getDynamicObject())
                                        if (port->getProperty ("id").toString() == id)
                                        { usedBy = entry.name.toString(); break; }

                        auto* o = new juce::DynamicObject();
                        o->setProperty ("id", id);
                        o->setProperty ("name", src->getProperty ("name").toString());
                        o->setProperty ("direction", dir);
                        o->setProperty ("type", type);
                        // The placeholder rows the service always lists are choices, not hardware.
                        // Both are reported — they are what a mapping can be set to — but a script
                        // asking "did a device show up" wants this flag, not a list of magic
                        // type strings to compare against.
                        o->setProperty ("hardware", type != "none" && type != "previewOnly");
                        o->setProperty ("role", usedBy);
                        out.add (juce::var (o));
                    }
                };

                if (wanted != "out" && wanted != "output")
                    addAll (deviceService.listMidiInputs(), "in", "midiInput");
                if (wanted != "in" && wanted != "input")
                    addAll (deviceService.listMidiDestinations(), "out", "midiDestination");
                return juce::var (out);
            }

            // The LAST KNOWN value — what the synth most recently told us, from a dump or a
            // parameter message. Not a live query: asking the synth is asynchronous and this verb
            // is not. Void when it has never been reported, which is not the same as zero.
            if (kind == "read")
            {
                const auto id = p != nullptr ? p->getProperty ("id").toString() : juce::String();
                if (id.isEmpty()) return {};
                auto* runtime = deviceService.getRuntimeState().getDynamicObject();
                if (runtime == nullptr) return {};
                auto* forRole = runtime->getProperty (role).getDynamicObject();
                if (forRole == nullptr) return {};
                const juce::Identifier key (id);
                return forRole->hasProperty (key) ? forRole->getProperty (key) : juce::var();
            }

            // Preset recall and readback. `recallPreset` goes through the service, which compiles
            // the profile's own action and sends it — the same door the editor's librarian uses, so
            // a preset recalled window-closed addresses the patch a preset recalled window-open
            // does. `preset` answers from what has been SEEN (a recall going out, a Program Change
            // coming in) rather than by asking the instrument, which almost none can be asked.
            if (kind == "recallPreset")
            {
                auto* request = new juce::DynamicObject();
                request->setProperty ("deviceRole", role);
                request->setProperty ("slot", p != nullptr ? p->getProperty ("slot") : juce::var (0));
                request->setProperty ("dryRun", false);
                auto result = deviceService.compilePresetRecallAction (juce::var (request), true);

                if (auto* answered = result.getDynamicObject())
                    if (answered->getProperty ("ok").equals (juce::var (true)))
                    {
                        currentPresetSlot[role] = static_cast<int> (answered->getProperty ("slot"));
                        currentPresetSource[role] = "panel";
                    }
                return result;
            }

            if (kind == "preset")
            {
                const auto slotIt = currentPresetSlot.find (role);
                const int slot = slotIt != currentPresetSlot.end() ? slotIt->second : -1;
                auto* out = new juce::DynamicObject();
                out->setProperty ("role", role);
                out->setProperty ("slot", slot);
                const auto sourceIt = currentPresetSource.find (role);
                out->setProperty ("source", sourceIt != currentPresetSource.end() ? sourceIt->second : juce::String());
                // -1 means nothing has told us yet, and the name/bank fields would be a guess.
                if (slot < 0)
                {
                    out->setProperty ("program", -1);
                    out->setProperty ("name", juce::String());
                    out->setProperty ("category", juce::String());
                    out->setProperty ("bankId", juce::String());
                    out->setProperty ("bankLabel", juce::String());
                    out->setProperty ("writable", true);
                    return juce::var (out);
                }

                auto* engine = deviceService.engineForRole (role);
                const auto info = engine != nullptr
                    ? engine->presetSlotInfo (slot)
                    : ceditor::device::DeviceProfileEngine::PresetSlotInfo{};
                out->setProperty ("program", info.program);
                out->setProperty ("name", info.catalogName);
                out->setProperty ("category", info.category);
                out->setProperty ("bankId", info.bankId);
                out->setProperty ("bankLabel", info.bankLabel);
                out->setProperty ("writable", info.writable);
                return juce::var (out);
            }

            if (kind == "profile")
            {
                const auto profileId = recordObj != nullptr ? recordObj->getProperty ("profileId").toString()
                                                            : juce::String();
                if (profileId.isEmpty()) return {};   // no profile mapped — nil, not an empty object

                juce::String name = profileId;
                if (auto* list = deviceService.listProfiles().getArray())
                    for (const auto& item : *list)
                        if (auto* o = item.getDynamicObject())
                            if (o->getProperty ("id").toString() == profileId)
                                name = o->getProperty ("name").toString();

                auto* out = new juce::DynamicObject();
                out->setProperty ("id", profileId);
                out->setProperty ("name", name);
                out->setProperty ("role", role);
                out->setProperty ("connected", ready);
                out->setProperty ("state", state.isNotEmpty() ? state : juce::String ("unknown"));
                return juce::var (out);
            }

            // The profile DOCUMENT, rather than the catalogue row `profile` answers from. Every
            // question below needs the authored JSON: what the recipes interpolate, what the
            // profile claims it can do, what messages it can build.
            const auto profileDocument = [&] () -> juce::var
            {
                const auto profileId = recordObj != nullptr ? recordObj->getProperty ("profileId").toString()
                                                            : juce::String();
                if (profileId.isEmpty()) return {};
                auto* q = new juce::DynamicObject();
                q->setProperty ("profileId", profileId);
                const auto got = deviceService.getProfileSource (juce::var (q));
                auto* gotObj = got.getDynamicObject();
                if (gotObj == nullptr) return {};
                const auto text = gotObj->getProperty ("source").toString();
                if (text.isEmpty()) return {};
                return juce::JSON::parse (text);
            };

            // variables / timing read as their EFFECTIVE values: the profile's defaults with this
            // project's role-mapping overrides on top. That precedence is the send path's own —
            // a write goes to the mapping, never to the profile, because a profile is shared.
            if (kind == "variables" || kind == "timing")
            {
                const bool wantVars = kind == "variables";
                const auto doc = profileDocument();
                auto* docObj = doc.getDynamicObject();
                if (docObj == nullptr && recordObj == nullptr) return {};

                auto* out = new juce::DynamicObject();
                const auto merge = [&] (const juce::var& src)
                {
                    if (auto* o = src.getDynamicObject())
                        for (const auto& e : o->getProperties())
                            out->setProperty (e.name, e.value);
                };
                if (docObj != nullptr) merge (docObj->getProperty (wantVars ? "variables" : "timing"));
                if (recordObj != nullptr)
                    merge (recordObj->getProperty (wantVars ? "variables" : "timingOverrides"));
                return juce::var (out);
            }

            // What the profile says it can do, in ITS OWN WORDS. Not a boolean: real profiles
            // answer "complete", "partial" and "notImplemented" but also "filter-block-rq1", so a
            // yes/no would be a guess wearing the clothes of a fact.
            if (kind == "coverage")
            {
                const auto doc = profileDocument();
                auto* docObj = doc.getDynamicObject();
                if (docObj == nullptr) return {};
                const auto coverage = docObj->getProperty ("coverage");
                auto* covObj = coverage.getDynamicObject();
                if (covObj == nullptr) return {};

                const auto feature = p != nullptr ? p->getProperty ("feature").toString() : juce::String();
                if (feature.isEmpty()) return coverage;
                for (const auto& e : covObj->getProperties())
                    if (e.name.toString().equalsIgnoreCase (feature)) return e.value;
                return {};
            }

            // The ids of what a profile can build or ask for.
            if (kind == "recipes" || kind == "requests")
            {
                const auto doc = profileDocument();
                auto* docObj = doc.getDynamicObject();
                juce::Array<juce::var> out;
                if (docObj != nullptr)
                    if (auto* arr = docObj->getProperty (kind == "recipes" ? "messageRecipes" : "requests").getArray())
                        for (const auto& item : *arr)
                            if (auto* o = item.getDynamicObject())
                            {
                                const auto id = o->getProperty ("id").toString();
                                if (id.isNotEmpty()) out.add (juce::var (id));
                            }
                return juce::var (out);
            }

            if (kind == "parameters" || kind == "parameter")
            {
                auto* query = new juce::DynamicObject();
                query->setProperty ("deviceRole", role);
                // listProfileParameters pages; a script asking "what does this synth have" wants
                // the lot, so ask for the service's maximum rather than its default page.
                query->setProperty ("limit", 500);
                if (p != nullptr)
                {
                    for (const char* key : { "query", "group", "type", "access" })
                        if (p->getProperty (key).isString())
                            query->setProperty (juce::Identifier (key), p->getProperty (key));
                    if (kind == "parameters" && p->getProperty ("limit").isInt())
                        query->setProperty ("limit", p->getProperty ("limit"));
                }

                const auto result = deviceService.listProfileParameters (juce::var (query));
                auto* resultObj = result.getDynamicObject();
                if (resultObj == nullptr || ! (bool) resultObj->getProperty ("ok"))
                    return kind == "parameters" ? juce::var (juce::Array<juce::var>()) : juce::var();

                const auto parameters = resultObj->getProperty ("parameters");
                if (kind == "parameters") return parameters;

                const auto wanted = p != nullptr ? p->getProperty ("id").toString() : juce::String();
                if (auto* arr = parameters.getArray())
                    for (const auto& item : *arr)
                        if (auto* o = item.getDynamicObject())
                            if (o->getProperty ("id").toString() == wanted)
                                return item;
                return {};   // no such parameter — nil, which is what the contract promises
            }

            return {};
        };
        // runAction / emitEvent are left unset on purpose: BridgeScriptHost routes them to the
        // ScriptRuntime, which resolves them against the loaded scripts. Stubbing them here is
        // what made run() and emit() silent no-ops in the shipped plugin.
        cb.log = [] (const juce::String& msg, const juce::var& value)
        {
            scriptLogLine ("[script] " + msg + (value.isVoid() ? juce::String() : " " + juce::JSON::toString (value)));
        };
        // ce.storage settings. The plugin has no .cepanel to write, so they live in memory and ride
        // along in the DAW project state the processor already saves (see getStateInformation).
        // ce.time. The playhead is already captured on the audio thread into plain atomics
        // (captureHostPosition); this just reshapes the snapshot into the contract's vocabulary.
        // `valid` is the host's own answer, so a DAW that reports no position gives the script
        // valid=false rather than a plausible-looking 120bpm it never measured.
        cb.transportState = [this] () -> juce::var
        {
            const auto pos = hostPosition();
            auto* o = new juce::DynamicObject();
            o->setProperty ("valid", pos.valid);
            o->setProperty ("playing", pos.valid && pos.playing);
            o->setProperty ("recording", pos.valid && pos.recording);
            if (pos.valid && pos.hasTempo) o->setProperty ("bpm", pos.bpm);
            o->setProperty ("beats", pos.valid && pos.hasPpq ? pos.ppqPosition : 0.0);
            o->setProperty ("beatsPerBar", pos.valid && pos.hasTimeSig && pos.timeSigNumerator > 0
                                             ? pos.timeSigNumerator : 4);
            o->setProperty ("source", "host");
            return juce::var (o);
        };
        // "panel" scope rides in the DAW project state (scriptSettings, saved with the session);
        // "local" scope goes to the plugin's own settings file, which the project does not carry.
        cb.saveSetting = [this] (const juce::String& key, const juce::var& value, const juce::String& store)
        {
            if (store != "local") { scriptSettings.set (key, value); return; }
            loadLocalSettings();
            localSettings.set (key, value);
            // Written through immediately: a machine-local setting has no "save the project" moment
            // to ride along with, and the DAW may never close this instance politely.
            localStore()->setValue (localKey (key), juce::JSON::toString (value));
            localStore()->saveIfNeeded();
        };
        cb.loadSetting = [this] (const juce::String& key, const juce::String& store)
        {
            if (store != "local") return scriptSettings.getWithDefault (key, juce::var());
            loadLocalSettings();
            return localSettings.getWithDefault (key, juce::var());
        };
        cb.listSettings = [this] (const juce::String& store)
        {
            if (store == "local") loadLocalSettings();
            const auto& set = (store == "local" ? localSettings : scriptSettings);
            juce::Array<juce::var> keys;
            for (int i = 0; i < set.size(); ++i) keys.add (set.getName (i).toString());
            return juce::var (keys);
        };
        cb.forgetSetting = [this] (const juce::String& key, const juce::String& store)
        {
            if (store == "local") loadLocalSettings();
            auto& set = (store == "local" ? localSettings : scriptSettings);
            if (! set.contains (key)) return false;      // so "cleaned up" reads differently from
            set.remove (key);                            // "there was nothing there"
            if (store == "local")
            {
                localStore()->removeValue (localKey (key));
                localStore()->saveIfNeeded();
            }
            return true;
        };
        // Both stores are real here: the project state carries one and a properties file beside the
        // app's own preferences carries the other.
        cb.settingsAvailable = [] (const juce::String&) { return true; };
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

        // Third-party modules FIRST — a module that is not installed cannot be enabled, and the
        // exporter bundles a copy of each one this panel uses into the document precisely because
        // a shipped plugin has no CEditor install to read them from.
        const auto extensions = ceditor::scripting::ScriptRuntime::extensionsFromPanel (scriptValues.panel());
        if (extensions.isArray())
        {
            scriptRuntime->setExtensionModules (extensions);
            juce::StringArray ids;
            for (const auto& e : *extensions.getArray())
                if (auto* o = e.getDynamicObject())
                    ids.add (o->getProperty ("id").toString() + "@" + o->getProperty ("version").toString());
            scriptLogLine ("bundled modules: " + ids.joinIntoString (", "));
        }

        // Then the panel's declared modules, still BEFORE loadScripts — a script's top-level code
        // runs during the load, so the gate has to already be in place. The exporter resolves
        // `auto` and bakes an explicit list into the panel, so what arrives here is either a real
        // list or nothing (nothing = every module on, which is what an unmigrated panel gets).
        const auto declaredModules = ceditor::scripting::ScriptRuntime::modulesFromPanel (scriptValues.panel());
        scriptRuntime->setEnabledModules (declaredModules);
        if (! declaredModules.isEmpty())
            scriptLogLine ("scripting modules: " + declaredModules.joinIntoString (", "));

        const auto loaded = ceditor::gatherPanelScripts (scriptValues.panel());
        scriptRuntime->loadScripts (loaded);
        for (const auto& f : scriptRuntime->failedScripts())
            scriptLogLine ("[script-error] script '" + (f.name.isNotEmpty() ? f.name : f.id)
                           + "' (" + f.language + ") is INACTIVE — " + f.message);
        scriptRuntime->onPanelLoad();   // window-closed init phase (before any GUI exists)
        const auto failedCount = (int) scriptRuntime->failedScripts().size();
        scriptLogLine ("runtime ready — " + juce::String (scriptRuntime->loadedScriptCount()) + " script(s) loaded"
                       + (failedCount > 0 ? ", " + juce::String (failedCount) + " FAILED" : juce::String())
                       + " (window-closed active)");
    }

    ceditor::PanelValueModel scriptValues;
    std::unique_ptr<ceditor::scripting::BridgeScriptHost> scriptHost;
    std::unique_ptr<ceditor::scripting::ScriptRuntime> scriptRuntime;
    // Declared after scriptRuntime so it is destroyed FIRST (stops its juce::Timer before the
    // runtime the fire callback references goes away).
    ceditor::scripting::TimerManager scriptTimers;
    // ce.storage settings. The plugin cannot write the .cepanel, so these live here and are saved
    // with the DAW project alongside the scripts' own onDawSaveState data.
    juce::NamedValueSet scriptSettings;
    // …and "local" scope, which is deliberately NOT saved with the project: a session handed to
    // somebody else should carry the patch, not the sender's MIDI port choice. It goes to a
    // properties file beside the app's own preferences instead, so it outlives the instance the way
    // a machine-local setting is supposed to — "this machine only", not "this session only".
    juce::NamedValueSet localSettings;

    /** The properties file behind "local" scope, opened on first use.

        Lazily, because most panels never touch local scope and opening a file per plugin instance
        for nothing is not free. One file for the plugin as a whole, keys prefixed by panel id, so
        two panels loaded in one session do not read each other's. */
    juce::PropertiesFile* localStore()
    {
        if (localProps == nullptr)
        {
            juce::PropertiesFile::Options options;
            options.applicationName     = "CEditor";
            options.filenameSuffix      = ".scriptlocal";
            options.folderName          = "CEditor";
            options.osxLibrarySubFolder = "Application Support";
            localProps = std::make_unique<juce::PropertiesFile> (options);
        }
        return localProps.get();
    }

    /** The panel this instance loaded, as a string to hang local settings off. */
    juce::String localPanelId() const
    {
        if (auto* obj = scriptValues.panel().getDynamicObject())
        {
            const auto id = obj->getProperty ("id").toString();
            if (id.isNotEmpty()) return id;
            const auto name = obj->getProperty ("name").toString();
            if (name.isNotEmpty()) return name;
        }
        return "panel";
    }

    /** The file key for a script key: the panel id, so two panels do not share a namespace. */
    juce::String localKey (const juce::String& key) const { return localPanelId() + "/" + key; }

    /** Read the file's keys for this panel back into localSettings, once. */
    void loadLocalSettings()
    {
        if (localLoaded) return;
        localLoaded = true;
        auto* props = localStore();
        const auto prefix = localPanelId() + "/";
        for (const auto& name : props->getAllProperties().getAllKeys())
            if (name.startsWith (prefix))
                localSettings.set (name.substring (prefix.length()),
                                   juce::JSON::parse (props->getValue (name)));
    }

    std::unique_ptr<juce::PropertiesFile> localProps;
    bool localLoaded = false;
    std::map<juce::String, juce::String> scriptBoundParamByPath;  // control path -> APVTS param id (bound)
    std::map<juce::String, juce::String> scriptDumpParamPaths;    // deviceParameterId -> control path (dump fill)
    std::map<juce::String, float> lastScriptValue;                // change-detect for window-closed onValueChanged
    bool scriptWindowWasOpen = false;
    bool scriptReadyFired = false;
#endif
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessor)
};

class PlayerAudioProcessorEditor : public juce::AudioProcessorEditor
                                 , private juce::Timer
{
public:
    explicit PlayerAudioProcessorEditor (PlayerAudioProcessor& p)
        : juce::AudioProcessorEditor (&p),
         #if CEDITOR_VALUE_LAYER
          host (p.panelFile(), &p.getDeviceService()),
         #else
          host (p.panelFile()),
         #endif
          processor (p)
    {
        addAndMakeVisible (host);
        setResizable (true, true);
        setSize (800, 480);

        // The DAW playhead -> panel push runs whether or not the value layer is compiled
        // in: a Transport set to "Host / DAW" needs it, and that has nothing to do with
        // host parameters. startTimerHz is idempotent, so the value-layer block below
        // asking for the same rate is harmless.
        startTimerHz (30);

       #if CEDITOR_VALUE_LAYER
        // UI -> host parameter: the user moved a control, so record automation.
        host.onUiParamChange = [&p] (const juce::String& id, float value) { p.setParamFromUi (id, value); };
        // UI is ready -> force a full re-push of current parameter values on the next tick.
        host.onResyncRequest = [this] { lastPushed.clear(); };
        // Total Recall S2: the processor decides WHEN to ask, the panel is WHERE the question goes.
        // Both directions are set here rather than in PlayerHost, because the processor is the only
        // thing that outlives the window and the answer has to be remembered by something that does.
        p.onRestorePrompt = [this] (const juce::String& deviceName) { host.showRestorePrompt (deviceName); };
        host.onRestoreAnswer = [&p] (const juce::String& answer) { p.answerRestorePrompt (answer); };
        // host parameter -> UI: poll the (atomic) parameter values and push changes to the panel so
        // automation playback moves the on-screen controls. Polling keeps us off the audio thread.
        startTimerHz (30);
       #endif
    }

    ~PlayerAudioProcessorEditor() override
    {
        stopTimer();
       #if CEDITOR_VALUE_LAYER
        // The processor outlives this window and is holding a lambda that captures `this`. Leaving
        // it set means the next restore prompt calls into a destroyed editor — and the prompt is
        // raised precisely when a window has just been noticed, so it would be a live path rather
        // than a theoretical one. host.onRestoreAnswer needs no such care: it lives on `host`,
        // which is a member and dies here.
        processor.onRestorePrompt = nullptr;
       #endif
    }

    void resized() override { host.setBounds (getLocalBounds()); }

private:
    PlayerHost host;

    void timerCallback() override
    {
        pushHostTransportIfChanged();

       #if CEDITOR_VALUE_LAYER
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
       #endif
    }

    // 30 pushes a second while the DAW rolls is fine; 30 a second while it sits stopped at
    // the same bar is not, so a snapshot identical to the last one is dropped. Position is
    // compared exactly rather than with an epsilon: a playing host changes ppq every block,
    // and a stopped one repeats the same double bit-for-bit.
    void pushHostTransportIfChanged()
    {
        const auto snap = processor.hostPosition();
        if (! snap.valid)
        {
            // Nothing from the host. Tell the panel once so a Transport following it can
            // drop its lock indicator, then stay quiet.
            if (! sentHostUnavailable)
            {
                sentHostUnavailable = true;
                hasLastHostSnap = false;
                host.pushHostTransport ({});
            }
            return;
        }
        sentHostUnavailable = false;

        if (hasLastHostSnap
            && lastHostSnap.playing == snap.playing
            && lastHostSnap.recording == snap.recording
            && lastHostSnap.hasTempo == snap.hasTempo
            && lastHostSnap.hasPpq == snap.hasPpq
            && lastHostSnap.hasTimeSig == snap.hasTimeSig
            && lastHostSnap.bpm == snap.bpm
            && lastHostSnap.ppqPosition == snap.ppqPosition
            && lastHostSnap.timeSigNumerator == snap.timeSigNumerator
            && lastHostSnap.timeSigDenominator == snap.timeSigDenominator)
            return;

        lastHostSnap = snap;
        hasLastHostSnap = true;

        PlayerHost::HostTransport t;
        t.playing = snap.playing;
        t.recording = snap.recording;
        t.hasTempo = snap.hasTempo;
        t.hasPpq = snap.hasPpq;
        t.hasTimeSig = snap.hasTimeSig;
        t.bpm = snap.bpm;
        t.ppqPosition = snap.ppqPosition;
        t.timeSigNumerator = snap.timeSigNumerator;
        t.timeSigDenominator = snap.timeSigDenominator;
        host.pushHostTransport (t);
    }

    PlayerAudioProcessor& processor;
    PlayerAudioProcessor::HostPositionSnapshot lastHostSnap {};
    bool hasLastHostSnap = false;
    bool sentHostUnavailable = false;

   #if CEDITOR_VALUE_LAYER
    std::map<juce::String, float> lastPushed;
   #endif

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessorEditor)
};
