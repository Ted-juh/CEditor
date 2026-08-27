#include "Entitlements.h"

namespace ceditor::licensing
{

juce::String featureName (Feature feature)
{
    switch (feature)
    {
        case Feature::patternEngine:     return "patternEngine";
        case Feature::scenesAndSetlists: return "scenesAndSetlists";
        case Feature::advancedRouting:   return "advancedRouting";
        case Feature::advancedScripting: return "advancedScripting";
    }
    return {};
}

juce::String featureRefusal (Feature feature, Edition current)
{
    const auto what = [feature]() -> juce::String
    {
        switch (feature)
        {
            case Feature::patternEngine:     return "Patterns and clips";
            case Feature::scenesAndSetlists: return "Scenes and setlists";
            case Feature::advancedRouting:   return "Return buses and extra outputs";
            case Feature::advancedScripting: return "Script actions";
        }
        return "This";
    }();

    // Names the edition rather than the price, and says what still works — a refusal that
    // only says no is the kind that makes somebody uninstall instead of upgrade.
    return what + " are part of Pro. You are on " + editionName (current)
             + ", where the rack, its plug-ins, the pages, the mappings and the whole keyboard "
               "keep working.";
}

Entitlements entitlementsFor (Edition edition)
{
    Entitlements out;
    out.edition = edition;

    // §26.2: the free edition loads "a limited demo instrument, one plug-in, or a restricted
    // session". One plug-in is the reading that leaves the most of the keyboard working, which
    // is what the same section asks for two paragraphs later.
    out.maxLoadedParts = editionRank (edition) >= 1 ? 1024 : 1;
    return out;
}

bool Entitlements::allows (Feature feature) const
{
    switch (feature)
    {
        case Feature::patternEngine:
        case Feature::scenesAndSetlists:
        case Feature::advancedRouting:
        case Feature::advancedScripting:
            return editionRank (edition) >= editionRank (Edition::pro);
    }
    return true;
}

juce::String Entitlements::label() const
{
    switch (edition)
    {
        case Edition::founder: return "Founder";
        case Edition::core:    return "Core";
        case Edition::pro:     return "Pro";
        case Edition::free:    break;
    }
    return "Free";
}

juce::StringArray neverGated()
{
    return {
        // §26.3, verbatim in substance.
        "Full supported-hardware display communication",
        "Normal control pages",
        "VST3 hosting",
        "Preset browsing",
        "Editable mappings",
        "Basic splits, layers and multis",
        "Saving and recalling complete setups",
        // §20's closing sentence, and §26.2's free-tier list.
        "Basic screen integration",
        "Ordinary mappings",
        "Hardware detection and control testing",
        "Basic MIDI routing",
        "Diagnostic export for support",
        // §27: the one that outranks all of them.
        "Running the application at all, whatever the update entitlement says",
    };
}

} // namespace ceditor::licensing
