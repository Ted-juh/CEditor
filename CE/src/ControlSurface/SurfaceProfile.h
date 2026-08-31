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

/** One physical control, where it sits on the box and whether the runtime can address it.

    Positions are normalised 0..1 against the unit's own bounding box, so the drawing scales to
    whatever space it is given and no pixel size is ever baked in.

    `index` is the load-bearing field. A surface has controls CEditor cannot map — faders that
    speak a protocol we do not, buttons the firmware keeps for itself — and drawing them is
    still right, because the picture is of the instrument in front of you, not of the subset we
    happen to drive. -1 means exactly that: drawn, labelled, and honestly inert. Anything else
    is what the runtime calls this control (encoders 0..7 as Ctrl49Reducer reports them, pads
    1..8 as buildPadRgb addresses them), which is what makes clicking the picture reach the
    right knob rather than the one that looks right. */
struct SurfaceControl
{
    juce::String controlId;   // stable within the profile: "encoder-1", "pad-3", "fader-master"
    juce::String kind;        // "encoder" | "pad" | "fader" | "button" | "wheel" | "keys" | "display"
    juce::String label;
    float x = 0.0f, y = 0.0f, w = 0.0f, h = 0.0f;   // 0..1 of the unit's bounding box
    int index = -1;           // what the runtime calls it; -1 = drawn but not addressable
};

/** Where everything is. Optional: a profile without one still works, and the UI falls back to
    a generic drawing built from the capability counts — a row of N encoders, a grid of N pads.
    That fallback is the point. A picture hardcoded to one controller in the UI would undo the
    reason this registry exists, so the layout is DATA a profile supplies, or nothing. */
struct SurfaceLayout
{
    float aspect = 0.0f;      // width / height of the unit, so proportions survive any size
    juce::Array<SurfaceControl> controls;

    bool isEmpty() const      { return controls.isEmpty(); }

    /** Controls of one kind that the runtime can actually address. The capability counts must
        agree with this, never with the raw control count — see the conformance check. */
    int addressableCount (const juce::String& kind) const;
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
    SurfaceLayout layout;        // optional; empty means "draw it generically from the counts"
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

    /** Structural checks on a profile's layout, if it has one: ids unique, every control
        inside the unit box, no two controls of a kind claiming the same runtime index, and the
        capability counts agreeing with what the drawing says it can ADDRESS. Public and static
        so a profile can be checked before it is ever registered. */
    static juce::StringArray checkLayout (const SurfaceProfile& profile);

private:
    SurfaceProfileRegistry() = default;
    std::vector<SurfaceProfile> profiles;
};

/** Registers the CTRL49 profile. Called once at startup; safe to call twice. */
void registerCtrl49Profile();

} // namespace ceditor::ctrl49
