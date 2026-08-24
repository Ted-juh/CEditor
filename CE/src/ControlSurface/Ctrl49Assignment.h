// Assignment model for the CTRL49 control surface: pages of encoder-slot -> device
// parameter bindings. This is the "assignments, not layouts" core of the Screen Builder
// (design record: docs/design/screen-builder-design.md) in its first, file-loaded form —
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

    // Per-page device overrides for the multi-synth "whole rig" case: a page can target a
    // different synth than the assignment default. Empty = inherit the Assignment's values.
    juce::String profilePath;   // this page's device profile (overrides Assignment.profilePath)
    juce::String deviceRole;    // this page's device role (overrides Assignment.deviceRole)
    juce::String portName;      // this page's synth MIDI-out port name (overrides Assignment.portName)
};

struct Assignment
{
    juce::String name;
    juce::String profilePath;   // default device profile path, relative to the file or absolute
    juce::String deviceRole = "mainSynth";
    juce::String portName;      // default synth MIDI-out port name (a page may override it)
    std::vector<AssignmentPage> pages;

    // Parses the JSON assignment. `error` is set and false returned on malformed input.
    // `baseDir` resolves a relative profilePath (typically the assignment file's folder).
    static bool fromJson (const juce::String& json, const juce::File& baseDir,
                          Assignment& out, juce::String& error);

    static bool fromFile (const juce::File& file, Assignment& out, juce::String& error);

    // Resolved absolute default profile file (profilePath against baseDir if relative).
    juce::File resolvedProfile (const juce::File& baseDir) const;

    // Per-page resolved device, applying page overrides then falling back to the defaults.
    juce::File   pageProfile (int pageIndex, const juce::File& baseDir) const;
    juce::String pageRole (int pageIndex) const;
    juce::String pagePort (int pageIndex) const;

    // Distinct resolved profile paths across all pages — one engine per distinct profile.
    juce::StringArray distinctProfilePaths (const juce::File& baseDir) const;
};

} // namespace ceditor::ctrl49
