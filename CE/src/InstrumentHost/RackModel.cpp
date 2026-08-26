#include "RackModel.h"

namespace ceditor::host
{

namespace
{
    // Small clamp-on-read helpers keep the parse below readable.
    int intOf (const juce::var& parent, const char* key, int def, int lo, int hi)
    {
        return juce::jlimit (lo, hi, (int) parent.getProperty (key, def));
    }

    float floatOf (const juce::var& parent, const char* key, float def, float lo, float hi)
    {
        return juce::jlimit (lo, hi, (float) (double) parent.getProperty (key, def));
    }
}

Performance Performance::create()
{
    Performance p;
    p.performanceId = juce::Uuid().toDashedString();
    return p;
}

juce::String Performance::addPart()
{
    RackPart part;
    part.partId = juce::Uuid().toDashedString();
    parts.add (part);

    if (focusedPartId.isEmpty())
        focusedPartId = part.partId;

    return part.partId;
}

bool Performance::removePart (const juce::String& partId)
{
    const auto index = indexOfPart (partId);
    if (index < 0)
        return false;

    parts.remove (index);

    if (focusedPartId == partId)
        focusedPartId = parts.isEmpty() ? juce::String() : parts.getReference (0).partId;

    return true;
}

bool Performance::movePart (const juce::String& partId, int newIndex)
{
    const auto index = indexOfPart (partId);
    if (index < 0)
        return false;

    parts.move (index, juce::jlimit (0, parts.size() - 1, newIndex));
    return true;
}

RackPart* Performance::findPart (const juce::String& partId)
{
    const auto index = indexOfPart (partId);
    return index >= 0 ? &parts.getReference (index) : nullptr;
}

const RackPart* Performance::findPart (const juce::String& partId) const
{
    const auto index = indexOfPart (partId);
    return index >= 0 ? &parts.getReference (index) : nullptr;
}

int Performance::indexOfPart (const juce::String& partId) const
{
    for (int i = 0; i < parts.size(); ++i)
        if (parts.getReference (i).partId == partId)
            return i;
    return -1;
}

juce::var Performance::toVar() const
{
    juce::Array<juce::var> partVars;

    for (const auto& part : parts)
    {
        auto* p = new juce::DynamicObject();
        p->setProperty ("partId",           part.partId);
        p->setProperty ("pluginCeId",       part.pluginCeId);
        p->setProperty ("pluginModulePath", part.pluginModulePath);
        p->setProperty ("pluginName",       part.pluginName);
        p->setProperty ("pluginVendor",     part.pluginVendor);
        p->setProperty ("stateBlob",        part.stateBlobBase64);
        p->setProperty ("channel",          part.midi.channel);
        p->setProperty ("keyLow",           part.midi.keyLow);
        p->setProperty ("keyHigh",          part.midi.keyHigh);
        p->setProperty ("velocityLow",      part.midi.velocityLow);
        p->setProperty ("velocityHigh",     part.midi.velocityHigh);
        p->setProperty ("transpose",        part.midi.transpose);
        p->setProperty ("enabled",          part.enabled);
        p->setProperty ("mute",             part.mute);
        p->setProperty ("solo",             part.solo);
        p->setProperty ("volume",           part.volume);
        p->setProperty ("pan",              part.pan);
        p->setProperty ("editorOpen",       part.editorOpen);
        partVars.add (juce::var (p));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("performanceId", performanceId);
    root->setProperty ("name",          name);
    root->setProperty ("focusedPartId", focusedPartId);
    root->setProperty ("parts",         partVars);
    return juce::var (root);
}

bool Performance::fromVar (const juce::var& stored, Performance& out)
{
    out = Performance();

    if (! stored.isObject())
        return false;

    Performance parsed;
    parsed.performanceId = stored.getProperty ("performanceId", {}).toString();
    parsed.name          = stored.getProperty ("name", {}).toString();
    parsed.focusedPartId = stored.getProperty ("focusedPartId", {}).toString();

    if (parsed.performanceId.isEmpty())
        return false;

    const auto* partArray = stored.getProperty ("parts", {}).getArray();
    if (partArray == nullptr)
        return false;

    juce::StringArray seenIds;

    for (const auto& p : *partArray)
    {
        RackPart part;
        part.partId = p.getProperty ("partId", {}).toString();

        if (part.partId.isEmpty() || seenIds.contains (part.partId))
            return false;
        seenIds.add (part.partId);

        part.pluginCeId       = p.getProperty ("pluginCeId", {}).toString();
        part.pluginModulePath = p.getProperty ("pluginModulePath", {}).toString();
        part.pluginName       = p.getProperty ("pluginName", {}).toString();
        part.pluginVendor     = p.getProperty ("pluginVendor", {}).toString();
        part.stateBlobBase64  = p.getProperty ("stateBlob", {}).toString();

        part.midi.channel      = intOf (p, "channel", 0, 0, 16);
        part.midi.keyLow       = intOf (p, "keyLow", 0, 0, 127);
        part.midi.keyHigh      = intOf (p, "keyHigh", 127, 0, 127);
        part.midi.velocityLow  = intOf (p, "velocityLow", 1, 1, 127);
        part.midi.velocityHigh = intOf (p, "velocityHigh", 127, 1, 127);
        part.midi.transpose    = intOf (p, "transpose", 0, -60, 60);

        if (part.midi.keyLow > part.midi.keyHigh)
            std::swap (part.midi.keyLow, part.midi.keyHigh);
        if (part.midi.velocityLow > part.midi.velocityHigh)
            std::swap (part.midi.velocityLow, part.midi.velocityHigh);

        part.enabled    = (bool) p.getProperty ("enabled", true);
        part.mute       = (bool) p.getProperty ("mute", false);
        part.solo       = (bool) p.getProperty ("solo", false);
        part.volume     = floatOf (p, "volume", 1.0f, 0.0f, 2.0f);
        part.pan        = floatOf (p, "pan", 0.0f, -1.0f, 1.0f);
        part.editorOpen = (bool) p.getProperty ("editorOpen", false);

        parsed.parts.add (std::move (part));
    }

    if (parsed.focusedPartId.isNotEmpty() && parsed.indexOfPart (parsed.focusedPartId) < 0)
        parsed.focusedPartId = {};

    out = std::move (parsed);
    return true;
}

} // namespace ceditor::host
