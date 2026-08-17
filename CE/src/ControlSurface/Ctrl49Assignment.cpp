#include "Ctrl49Assignment.h"

namespace ceditor::ctrl49
{

bool Assignment::fromJson (const juce::String& json, const juce::File& baseDir,
                           Assignment& out, juce::String& error)
{
    juce::ignoreUnused (baseDir);

    juce::var root;
    const auto parseResult = juce::JSON::parse (json, root);
    if (parseResult.failed())
    {
        error = "assignment JSON parse error: " + parseResult.getErrorMessage();
        return false;
    }
    auto* obj = root.getDynamicObject();
    if (obj == nullptr)
    {
        error = "assignment root is not an object";
        return false;
    }

    out = Assignment {};
    out.name = obj->getProperty ("name").toString();
    out.profilePath = obj->getProperty ("profile").toString();
    if (out.profilePath.isEmpty())
    {
        error = "assignment is missing 'profile'";
        return false;
    }
    if (obj->hasProperty ("role"))
        out.deviceRole = obj->getProperty ("role").toString();
    out.portName = obj->getProperty ("port").toString();

    const juce::var pages = obj->getProperty ("pages");
    const auto* pageArray = pages.getArray();
    if (pageArray == nullptr || pageArray->isEmpty())
    {
        error = "assignment has no 'pages'";
        return false;
    }

    for (const auto& pageVar : *pageArray)
    {
        auto* pageObj = pageVar.getDynamicObject();
        if (pageObj == nullptr)
        {
            error = "a page is not an object";
            return false;
        }

        AssignmentPage page;
        page.title = pageObj->getProperty ("title").toString();
        page.profilePath = pageObj->getProperty ("profile").toString();  // optional per-page device
        page.deviceRole = pageObj->getProperty ("role").toString();
        page.portName = pageObj->getProperty ("port").toString();

        const juce::var slots = pageObj->getProperty ("slots");
        const auto* slotArray = slots.getArray();
        if (slotArray == nullptr)
        {
            error = "page '" + page.title + "' has no 'slots' array";
            return false;
        }
        if (slotArray->size() > 8)
        {
            error = "page '" + page.title + "' has more than 8 slots";
            return false;
        }

        for (int i = 0; i < slotArray->size(); ++i)
        {
            const juce::var& slotVar = slotArray->getReference (i);
            auto* slotObj = slotVar.getDynamicObject();
            if (slotObj == nullptr)
                continue;  // null slot => unassigned, leave empty
            SlotBinding binding;
            binding.parameterId = slotObj->getProperty ("param").toString();
            binding.label = slotObj->getProperty ("label").toString();
            if (binding.label.isEmpty())
                binding.label = binding.parameterId;
            page.slots[static_cast<std::size_t> (i)] = binding;
        }

        out.pages.push_back (page);
    }

    return true;
}

bool Assignment::fromFile (const juce::File& file, Assignment& out, juce::String& error)
{
    if (! file.existsAsFile())
    {
        error = "assignment file not found: " + file.getFullPathName();
        return false;
    }
    return fromJson (file.loadFileAsString(), file.getParentDirectory(), out, error);
}

juce::File Assignment::resolvedProfile (const juce::File& baseDir) const
{
    if (juce::File::isAbsolutePath (profilePath))
        return juce::File (profilePath);
    return baseDir.getChildFile (profilePath);
}

juce::File Assignment::pageProfile (int pageIndex, const juce::File& baseDir) const
{
    juce::String path = profilePath;
    if (pageIndex >= 0 && pageIndex < static_cast<int> (pages.size()))
        if (const juce::String& perPage = pages[static_cast<std::size_t> (pageIndex)].profilePath; perPage.isNotEmpty())
            path = perPage;
    if (juce::File::isAbsolutePath (path))
        return juce::File (path);
    return baseDir.getChildFile (path);
}

juce::String Assignment::pageRole (int pageIndex) const
{
    if (pageIndex >= 0 && pageIndex < static_cast<int> (pages.size()))
        if (const juce::String& perPage = pages[static_cast<std::size_t> (pageIndex)].deviceRole; perPage.isNotEmpty())
            return perPage;
    return deviceRole;
}

juce::String Assignment::pagePort (int pageIndex) const
{
    if (pageIndex >= 0 && pageIndex < static_cast<int> (pages.size()))
        if (const juce::String& perPage = pages[static_cast<std::size_t> (pageIndex)].portName; perPage.isNotEmpty())
            return perPage;
    return portName;
}

juce::StringArray Assignment::distinctProfilePaths (const juce::File& baseDir) const
{
    juce::StringArray paths;
    for (int i = 0; i < static_cast<int> (pages.size()); ++i)
        paths.addIfNotAlreadyThere (pageProfile (i, baseDir).getFullPathName());
    return paths;
}

} // namespace ceditor::ctrl49
