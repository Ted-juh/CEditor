#pragma once

#include "HostRuntimeShared.h"
#include "PluginEditorHost.h"

// HostPluginProcessor — the generated product's outer VST3 (VIP-successor Stage 1).
//
// The whole rack as one synth plug-in inside a DAW: MIDI in, stereo out, inner VST3
// instruments hosted through the same InstrumentHostService the standalone and the editor's
// preview use. The wrapper differs from the standalone in exactly the three ways the service's
// wrapper-context API exists for:
//
//   AUDIO is the DAW's. enableAudio stays false — no device manager, no player; processBlock
//   delegates straight to the rack's graph, prepared with whatever rate and block the host
//   announced. Topology edits from the message thread meet the audio thread under the graph's
//   own callback lock (UpdateKind::sync), the same contract the standalone runs on.
//
//   THE SESSION is the DAW's. persistSession stays false — the rack travels in the project
//   file through get/setStateInformation as the same JSON the session file would hold, so a
//   project reopened on another machine asks the catalogue there for its instruments and
//   reports what is missing instead of pretending. The catalogue and scan paths are still the
//   product's own per-user data, shared with the standalone: what you scanned is what both
//   see.
//
//   THE EDITOR WINDOW is the DAW's. It opens and closes the plug-in view at will, so the
//   editor component attaches the real pane hooks on construction and detaches on
//   destruction; which part's editor was open is service state and survives the gap
//   (reassertEditorPane re-shows it when the window comes back).
//
// setStateInformation may arrive off the message thread during a project load; the service is
// controlling-thread-only, so the parsed var is marshalled across with the alive-token guard
// this codebase already uses for callbacks that can outlive their target.
//
// STAGE 7 hardens this wrapper into the mature generated product (§18.9.3) without cloning
// anything:
//
//   THE DAW'S CLOCK IS THE CLOCK. Each block reads the playhead and hands the host's tempo,
//   signature, position and play state to the SAME transport the standalone runs on, which
//   then follows it exactly as it follows a MIDI master. One transport, three sources.
//
//   AUTOMATION IS CURATED, NOT EXHAUSTIVE. Sixteen macro parameters, a scene selector and the
//   Performance fader — index-stable, so a project's automation lane still means what it meant
//   after the rack is edited. Exposing every inner plug-in parameter would make a DAW project
//   unmanageable and would break the moment an instrument was swapped, which is precisely what
//   the baseline forbids.
//
//   THE PUMP LIVES ON THE PROCESSOR, not the editor: automation, captured notes and scene
//   landings have to be applied whether or not the DAW's plug-in window happens to be open.
//
//   LATENCY, TAIL AND OFFLINE RENDER are reported and honoured: the worst chain latency goes
//   to the host, the longest loaded tail keeps a bounce from truncating a reverb, and a
//   non-real-time render releases hardware MIDI ports so a bounce cannot spray notes at a
//   synth that is not part of it.

namespace ceditor::host
{

class HostPluginProcessor final : public juce::AudioProcessor,
                                  private juce::Timer
{
public:
    HostPluginProcessor();
    ~HostPluginProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override                       { return true; }

    const juce::String getName() const override;
    bool acceptsMidi() const override                     { return true; }
    bool producesMidi() const override                    { return false; }
    bool isMidiEffect() const override                    { return false; }
    double getTailLengthSeconds() const override;

    int getNumPrograms() override                         { return 1; }
    int getCurrentProgram() override                      { return 0; }
    void setCurrentProgram (int) override                 {}
    const juce::String getProgramName (int) override      { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    InstrumentHostService& getService()                   { return *service; }

private:
    void timerCallback() override;
    /** Builds the curated automation set once, in a fixed order that never changes. */
    void addProductParameters();
    /** Applies any exposed parameter the host has moved, and refreshes the ones the rack has
        moved itself. Message thread only. */
    void syncProductParameters();

    // The curated surface. Raw pointers are owned by the AudioProcessor base once added.
    std::array<juce::AudioParameterFloat*, InstrumentHostService::exposedMacroCount> macroParams {};
    std::array<float, InstrumentHostService::exposedMacroCount> lastMacroValues {};
    juce::AudioParameterInt* sceneParam = nullptr;
    juce::AudioParameterFloat* masterLevelParam = nullptr;
    int lastSceneParamValue = 0;
    float lastMasterLevel = 1.0f;
    int lastReportedLatency = -1;
    bool lastOfflineState = false;

    juce::AudioPluginFormatManager formatManager;
    std::unique_ptr<juce::FileChooser> fileChooser;
    std::unique_ptr<InstrumentHostService> service;

    // Guards the setStateInformation marshal: cleared in the destructor so a project-load
    // callAsync that outlives this processor returns without touching a corpse.
    std::shared_ptr<std::atomic<bool>> alive { std::make_shared<std::atomic<bool>> (true) };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostPluginProcessor)
};

} // namespace ceditor::host
