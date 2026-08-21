// A preset bank: a named list of patches (name + bank/program address) for one synth, plus
// its MIDI-out port and channel. This is the data the on-screen preset browser lists and,
// on select, loads via buildPresetSelect. Authored as JSON (like the assignment) so it works
// for any synth — including ones whose patch names can't be read over SysEx.
//
// Uses juce::var; host-side glue, compiled only by the preset host and its test.

#pragma once

#include "Ctrl49Preset.h"

#include <juce_core/juce_core.h>

#include <vector>

namespace ceditor::ctrl49
{

struct PresetEntry
{
    juce::String name;
    PresetAddress address;
};

struct PresetBank
{
    juce::String name;        // shown in the browser header (e.g. the synth name)
    juce::String portName;    // synth MIDI-out port
    int channel = 0;          // 0-based MIDI channel
    std::vector<PresetEntry> patches;

    static bool fromJson (const juce::String& json, PresetBank& out, juce::String& error);
    static bool fromFile (const juce::File& file, PresetBank& out, juce::String& error);

    // The load sequence for patch `index` (Bank Select + Program Change on this bank's channel).
    std::vector<Bytes> selectSequence (int index) const;
};

} // namespace ceditor::ctrl49
