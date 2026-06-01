#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PlayerHost.h"

#ifndef CEDITOR_PLAYER_PANEL_PATH
 #define CEDITOR_PLAYER_PANEL_PATH ""
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
{
public:
    PlayerAudioProcessor()
        : juce::AudioProcessor (BusesProperties()
              .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
              .withOutput ("Output", juce::AudioChannelSet::stereo(), true)) {}

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}

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

    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    bool isBusesLayoutSupported (const BusesLayout&) const override { return true; }

    juce::File panelFile() const { return juce::File (CEDITOR_PLAYER_PANEL_PATH); }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessor)
};

class PlayerAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit PlayerAudioProcessorEditor (PlayerAudioProcessor& p)
        : juce::AudioProcessorEditor (&p), host (p.panelFile())
    {
        addAndMakeVisible (host);
        setResizable (true, true);
        setSize (800, 480);
    }

    void resized() override { host.setBounds (getLocalBounds()); }

private:
    PlayerHost host;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PlayerAudioProcessorEditor)
};
