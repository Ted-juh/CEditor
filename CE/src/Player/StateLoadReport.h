#pragma once

namespace ceditor
{

/**
 * Whether the last setStateInformation recognised the state it was handed.
 *
 * JUCE's setStateInformation returns nothing, so a plug-in format that can report a failed load has
 * nobody to ask. CLAP can (its state.load returns a bool), and the vendored wrapper asks the
 * processor through this (clap-juce-wrapper.cpp, stateLoad; VENDORED.md). Without it every load
 * read as a success, random bytes included, and clap-validator's state-invalid-random said so.
 *
 * Unrecognised still means ignored: the instance keeps what it had. This only stops the host being
 * told a session was restored when it was not.
 */
struct ReportsStateLoad
{
    virtual ~ReportsStateLoad() = default;
    virtual bool lastStateLoadAccepted() const noexcept = 0;
};

} // namespace ceditor
