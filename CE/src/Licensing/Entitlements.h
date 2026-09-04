#pragma once

#include "Licence.h"

// Entitlements — one table, and a list of things it is forbidden to contain (§20, §26.3).
//
// The baseline does not leave the edition split to taste. §20 names what Pro adds, §26.3 names
// what Core must keep, and the second list is the one with teeth:
//
//   "Do not make basic screen integration, VST3 hosting, preset browsing or ordinary mappings
//    Pro-only. Owners should not have to pay the higher tier merely to use the defining
//    controls of their keyboard."
//
//   "Pro should be differentiated by advanced creation and performance systems, not by
//    disabling half of the customer's keyboard."
//
// So this file has two halves. The table says what each edition allows. The `neverGated` list
// says what no edition may ever withhold, and a test walks every edition against it — the day
// somebody moves the CTRL49 display or the preset browser behind Pro, that test fails and the
// commit does not land. A rule that only lives in a document gets broken by the third person
// who reads it in a hurry.
//
// THE FREE TIER IS A PRODUCT, NOT A NAG. §26.2 spells out what it must do: detect the
// hardware, test every control, drive the display convincingly, route MIDI, load "a limited
// demo instrument, one plug-in, or a restricted session", and export diagnostics for support.
// Its only limit here is the one the baseline states — one plug-in part — and specifically NOT
// the display, the pages, the mappings or the diagnostics.

namespace ceditor::licensing
{

/** The features an edition may withhold. Everything not on this list is unconditional. */
enum class Feature
{
    /** §20: "Full Pattern Engine beyond basic arp" and "Clip launching". The per-part
        arpeggiator is NOT here — §20 says beyond a basic arp, and §31 leaves whether the first
        paid release even has one as an open question, so gating it would answer a question the
        baseline deliberately left open. */
    patternEngine,
    /** §20: "Advanced setlists, songs and scenes". */
    scenesAndSetlists,
    /** §20: "Advanced routing graph" — the return buses and the explicit multi-output pairs.
        Insert effects on a part are ordinary hosting and stay out of this. */
    advancedRouting,
    /** §20: "Advanced scripting and package development". */
    advancedScripting
};

juce::String featureName (Feature feature);
/** The sentence shown when something is refused: what it is, and what would allow it. */
juce::String featureRefusal (Feature feature, Edition current);

struct Entitlements
{
    Edition edition = Edition::free;

    /** How many parts may hold a plug-in. §26.2's free tier gets "one plug-in"; every paid
        edition is unlimited, which is represented as a large number rather than a special
        case so the comparison at the call site has no second branch to get wrong. */
    int maxLoadedParts = 1;

    bool allows (Feature feature) const;

    /** The display name for the badge in the workspace. */
    juce::String label() const;
};

Entitlements entitlementsFor (Edition edition);

/** Everything §26.3 and §20 protect, by name. Nothing here may be gated by any edition, and
    EntitlementsTests walks this list against every edition to make sure nothing ever is.
    These are descriptions rather than enum values on purpose: an unconditional capability has
    no business having a Feature id, because a Feature id is a thing that can be switched off. */
juce::StringArray neverGated();

} // namespace ceditor::licensing
