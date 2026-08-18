#include "Ctrl49PresetBank.h"

namespace ceditor::ctrl49
{

bool PresetBank::fromJson (const juce::String& json, PresetBank& out, juce::String& error)
{
    juce::var root;
    const auto parseResult = juce::JSON::parse (json, root);
    if (parseResult.failed())
    {
        error = "preset-bank JSON parse error: " + parseResult.getErrorMessage();
        return false;
    }
    auto* obj = root.getDynamicObject();
    if (obj == nullptr) { error = "preset-bank root is not an object"; return false; }

    out = PresetBank {};
    out.name = obj->getProperty ("name").toString();
    out.portName = obj->getProperty ("port").toString();
    if (obj->hasProperty ("channel"))
        out.channel = static_cast<int> (obj->getProperty ("channel")) - 1;  // JSON is 1-based
    if (out.channel < 0) out.channel = 0;

    const juce::var patches = obj->getProperty ("patches");
    const auto* arr = patches.getArray();
    if (arr == nullptr || arr->isEmpty()) { error = "preset bank has no 'patches'"; return false; }

    for (const auto& p : *arr)
    {
        auto* po = p.getDynamicObject();
        if (po == nullptr) continue;
        PresetEntry entry;
        entry.name = po->getProperty ("name").toString();
        entry.address.bankMsb = static_cast<int> (po->getProperty ("bankMsb"));
        entry.address.bankLsb = static_cast<int> (po->getProperty ("bankLsb"));
        entry.address.program = static_cast<int> (po->getProperty ("program"));
        if (entry.name.isEmpty())
            entry.name = "PATCH " + juce::String (out.patches.size() + 1).paddedLeft ('0', 3);
        out.patches.push_back (entry);
    }
    return true;
}

bool PresetBank::fromFile (const juce::File& file, PresetBank& out, juce::String& error)
{
    if (! file.existsAsFile()) { error = "preset-bank file not found: " + file.getFullPathName(); return false; }
    return fromJson (file.loadFileAsString(), out, error);
}

std::vector<Bytes> PresetBank::selectSequence (int index) const
{
    if (index < 0 || index >= static_cast<int> (patches.size()))
        return {};
    return buildPresetSelect (channel, patches[static_cast<std::size_t> (index)].address);
}

} // namespace ceditor::ctrl49
