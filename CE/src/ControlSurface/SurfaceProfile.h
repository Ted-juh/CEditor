#pragma once

#include <juce_core/juce_core.h>
#include <functional>
#include <vector>

// SurfaceProfile — how a controller family joins the product (VIP-successor Stage 7, §18.9.5).
//
// The baseline's rule for new hardware is a process, not a feature: capture the protocol, add
// a transport only if the device needs one, define a profile and a page renderer, run
// conformance, then map the EXISTING neutral pages, focus and library/Performance commands.
// The sentence that matters is the last one — "No new controller gets a private parameter or
// preset system." This file is that rule made structural: a profile describes what a surface
// can do and how to render a page onto it, and everything it drives is the Stage 2 parameter
// model, the Stage 3 pages and the Stage 6 performance surface that already exist.
//
// So adding the Advance or the VX49 is: fill one of these in, register it, pass conformance.
// It is deliberately NOT possible to register a profile that carries its own parameter store —
// there is nowhere to put one.
//
// Pure juce_core: a profile is data plus two render callbacks, so the registry is testable
// without a device attached, which is the only way any of this can be verified off Windows.

namespace ceditor::ctrl49
{

/** What a surface can physically do. A page compiler consults this instead of assuming: a
    controller with no display still gets pages, it just cannot show their names. */
struct SurfaceCapabilities
{
    int encoders = 0;         // relative encoders (the neutral page's slots map onto these)
    int faders = 0;
    int pads = 0;
    int padBanks = 1;
    bool hasDisplay = false;
    int displayColumns = 0;   // characters per label, 0 when there is no display
    bool hasTransportButtons = false;
    bool relativeEncoders = true;   // absolute-only surfaces need value feedback to avoid jumps
};

/** The two payloads a surface needs to show a page, built from views the host already has.
    A profile that cannot display anything leaves both null and still works. */
struct SurfaceRenderers
{
    // The neutral control page (Stage 3): labels and knob positions.
    std::function<std::vector<std::uint8_t> (const juce::String& title,
                                             const juce::StringArray& labels)> renderLabels;
    // The performance page (Stage 6): transport line, clip names, phases and lit states.
    std::function<std::vector<std::uint8_t> (const juce::String& title,
                                             const juce::StringArray& labels,
                                             const juce::Array<float>& values,
                                             const juce::Array<bool>& lit)> renderState;
};

struct SurfaceProfile
{
    juce::String profileId;      // stable identity, e.g. "akai-ctrl49"
    juce::String displayName;
    juce::String vendor;
    SurfaceCapabilities capabilities;
    SurfaceRenderers renderers;
    /** Conformance: the checks this profile must pass before support is CLAIMED (§18.9.5's
        step 4, and §18.9.10's refusal to promise controllers on paper). Returns the failures;
        empty means conformant. */
    std::function<juce::StringArray()> conformance;
};

/** The registry. A process-wide list, populated at startup; lookups are by profileId so a
    saved Performance can name the surface it was authored on without embedding its bytes. */
class SurfaceProfileRegistry
{
public:
    static SurfaceProfileRegistry& instance();

    void registerProfile (SurfaceProfile profile);
    const SurfaceProfile* find (const juce::String& profileId) const;
    juce::StringArray profileIds() const;
    int size() const { return (int) profiles.size(); }

    /** Runs every registered profile's conformance and reports what failed, profile by
        profile. A profile with no conformance function is reported as unverified rather than
        as passing — "it compiles" is not support (§18.9.7's phrasing, applied to hardware). */
    juce::StringArray runConformance() const;

private:
    SurfaceProfileRegistry() = default;
    std::vector<SurfaceProfile> profiles;
};

/** Registers the CTRL49 profile. Called once at startup; safe to call twice. */
void registerCtrl49Profile();

} // namespace ceditor::ctrl49
