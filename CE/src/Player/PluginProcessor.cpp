#include "PluginProcessor.h"

juce::AudioProcessorEditor* PlayerAudioProcessor::createEditor()
{
    return new PlayerAudioProcessorEditor (*this);
}

// JUCE plugin entry point.
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PlayerAudioProcessor();
}
