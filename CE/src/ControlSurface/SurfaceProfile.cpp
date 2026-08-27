#include "SurfaceProfile.h"
#include "Ctrl49RackDisplay.h"
#include "Ctrl49PerformanceDisplay.h"

namespace ceditor::ctrl49
{

SurfaceProfileRegistry& SurfaceProfileRegistry::instance()
{
    static SurfaceProfileRegistry registry;
    return registry;
}

void SurfaceProfileRegistry::registerProfile (SurfaceProfile profile)
{
    if (profile.profileId.isEmpty())
        return;

    for (auto& existing : profiles)
        if (existing.profileId == profile.profileId)
        {
            existing = std::move (profile);   // re-registering replaces rather than duplicates
            return;
        }

    profiles.push_back (std::move (profile));
}

const SurfaceProfile* SurfaceProfileRegistry::find (const juce::String& profileId) const
{
    for (const auto& profile : profiles)
        if (profile.profileId == profileId)
            return &profile;
    return nullptr;
}

juce::StringArray SurfaceProfileRegistry::profileIds() const
{
    juce::StringArray ids;
    for (const auto& profile : profiles)
        ids.add (profile.profileId);
    return ids;
}

juce::StringArray SurfaceProfileRegistry::runConformance() const
{
    juce::StringArray failures;

    for (const auto& profile : profiles)
    {
        if (profile.conformance == nullptr)
        {
            failures.add (profile.profileId + ": unverified — no conformance checks registered");
            continue;
        }

        for (const auto& failure : profile.conformance())
            failures.add (profile.profileId + ": " + failure);
    }

    return failures;
}

void registerCtrl49Profile()
{
    SurfaceProfile profile;
    profile.profileId = "akai-ctrl49";
    profile.displayName = "Akai Advance CTRL49";
    profile.vendor = "Akai";

    profile.capabilities.encoders = 8;
    profile.capabilities.faders = 0;
    profile.capabilities.pads = 8;
    profile.capabilities.padBanks = 4;
    profile.capabilities.hasDisplay = true;
    profile.capabilities.displayColumns = 16;
    profile.capabilities.hasTransportButtons = true;
    profile.capabilities.relativeEncoders = true;

    profile.renderers.renderLabels = [] (const juce::String& title, const juce::StringArray& labels)
    {
        RackSlotViews views {};
        for (int i = 0; i < juce::jmin (8, labels.size()); ++i)
            views[(std::size_t) i] = { labels[i].toStdString(), 0, labels[i].isNotEmpty(), true };
        return buildRackLabelPayload (title.toStdString(), views);
    };

    profile.renderers.renderState = [] (const juce::String& title, const juce::StringArray& labels,
                                        const juce::Array<float>& values, const juce::Array<bool>& lit)
    {
        juce::ignoreUnused (title);
        PerformanceClipViews clips {};
        for (int i = 0; i < 8; ++i)
            clips[(std::size_t) i] = { i < labels.size() ? labels[i].toStdString() : std::string(),
                                       i < lit.size() && lit[i], false,
                                       i < values.size() ? values[i] : 0.0f };
        return buildPerformanceStatePayload (0, 0, clips);
    };

    // Conformance is about the payloads this profile promises to build, which is exactly what
    // can be verified without the device on the desk. Anything that needs the hardware itself
    // stays a hardware test, and support is claimed only after that passes too.
    profile.conformance = []
    {
        juce::StringArray failures;

        RackSlotViews views {};
        views[0] = { "Cutoff", 64, true, true };
        const auto labels = buildRackLabelPayload ("Page", views);
        if (labels.empty() || labels[0] != 4)
            failures.add ("label payload does not start with the title length");

        const auto state = buildRackStatePayload (0, 0, views);
        if (state.size() != 22)
            failures.add ("state payload is not the documented 22 bytes");
        if (state.size() == 22 && state[6] != 64)
            failures.add ("knob position did not reach its value byte");

        PerformanceClipViews clips {};
        clips[0] = { "Verse", true, false, 1.0f };
        const auto performance = buildPerformanceStatePayload (0, 0, clips);
        if (performance.size() != 22 || performance[14] != 1)
            failures.add ("performance payload does not light a running clip");

        return failures;
    };

    SurfaceProfileRegistry::instance().registerProfile (std::move (profile));
}

} // namespace ceditor::ctrl49
