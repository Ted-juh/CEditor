// Assignment model for the CTRL49 control surface: pages of encoder-slot -> device
// parameter bindings. This is the "assignments, not layouts" core of the Screen Builder
// (design record: tools/docs/screen-builder-design.md) in its first, file-loaded form —
// the seed of the Screen document that the editor UI will later produce.
//
// Uses juce::var for JSON, so it is host-side glue: only the synth hosts and its test
// compile it. The protocol/session/reducer core stays JUCE-free.

#pragma once

#include <juce_core/juce_core.h>

#include <array>
#include <vector>

namespace ceditor::ctrl49
{

struct SlotBinding
{
    juce::String label;        // shown under the knob (falls back to parameterId)
    juce::String parameterId;  // empty = unassigned slot
};

struct AssignmentPage
{
    juce::String title;
    std::array<SlotBinding, 8> slots;  // encoders 1..8
};

struct Assignment
{
    juce::String name;
    juce::String profilePath;   // path to the .ceditor-device.json, relative to the file or absolute
    juce::String deviceRole = "mainSynth";
    std::vector<AssignmentPage> pages;

    // Parses the JSON assignment. `error` is set and false returned on malformed input.
    // `baseDir` resolves a relative profilePath (typically the assignment file's folder).
    static bool fromJson (const juce::String& json, const juce::File& baseDir,
                          Assignment& out, juce::String& error);

    static bool fromFile (const juce::File& file, Assignment& out, juce::String& error);

    // Resolved absolute profile file (profilePath against baseDir if relative).
    juce::File resolvedProfile (const juce::File& baseDir) const;
};

} // namespace ceditor::ctrl49
