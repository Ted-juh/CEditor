#pragma once

#include <juce_core/juce_core.h>

// PlatformMatrix — what "supported" means, and how it is checked (Stage 7, §18.9.7).
//
// The baseline is blunt about this: "A platform is supported only after a defined
// compatibility matrix passes. 'It compiles' is not product support." So the matrix is a
// declared list of capabilities with a runnable check behind each one, and a platform's
// support status is computed from it rather than asserted in a README.
//
// A row is one thing a product needs from the platform it runs on — a plug-in format that
// loads, a place to put per-user data, a MIDI stack, a WebView runtime, a way to parent a
// native editor. Each says whether it is required for support and whether it is present here.
// The result is honest by construction: a platform where a required row fails is reported as
// unsupported on this machine, with the row named, which is exactly the diagnostic a port
// needs on day one.
//
// juce_core only, so the matrix runs anywhere — including in a test, which is the point.

namespace ceditor::host
{

struct PlatformRow
{
    juce::String id;
    juce::String description;
    bool required = true;
    bool present = false;
    juce::String detail;      // why it is missing, or what was found
};

struct PlatformReport
{
    juce::String platformName;
    juce::Array<PlatformRow> rows;

    bool supported() const
    {
        for (const auto& row : rows)
            if (row.required && ! row.present)
                return false;
        return true;
    }

    juce::StringArray missingRequirements() const
    {
        juce::StringArray missing;
        for (const auto& row : rows)
            if (row.required && ! row.present)
                missing.add (row.id + " — " + row.description);
        return missing;
    }
};

/** Runs the matrix on the machine this is called from. `dataDirectory` is the product's
    per-user directory, checked for real writability rather than assumed. */
PlatformReport checkPlatformSupport (const juce::File& dataDirectory);

} // namespace ceditor::host
