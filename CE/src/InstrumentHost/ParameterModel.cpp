#include "ParameterModel.h"

namespace ceditor::host
{

// The group path comes from the parameter tree, which is optional and shallow or deep as the
// plug-in likes; the walk records the path to every parameter it finds so lookup is O(1) per
// descriptor afterwards.
static void collectGroups (const juce::AudioProcessorParameterGroup& group,
                           const juce::String& prefix,
                           std::map<const juce::AudioProcessorParameter*, juce::String>& into)
{
    const auto path = prefix.isEmpty()
                        ? group.getName()
                        : (group.getName().isEmpty() ? prefix : prefix + " / " + group.getName());

    for (const auto* node : group)
    {
        if (const auto* parameter = node->getParameter())
            into[parameter] = path;
        else if (const auto* child = node->getGroup())
            collectGroups (*child, path, into);
    }
}

ParameterInventory describeParameters (juce::AudioProcessor& processor)
{
    ParameterInventory inventory;

    std::map<const juce::AudioProcessorParameter*, juce::String> groups;
    collectGroups (processor.getParameterTree(), {}, groups);

    juce::StringArray seen;
    for (auto* parameter : processor.getParameters())
    {
        ParameterDescriptor d;
        d.index = parameter->getParameterIndex();

        // The plug-in's own ID is the identity that survives sessions and updates; the index
        // is only what this build of this plug-in happens to expose it at. JUCE's hosted VST3
        // parameters implement AudioProcessorParameterWithID, so real instruments take the
        // first branch.
        if (const auto* withId = dynamic_cast<const juce::AudioProcessorParameterWithID*> (parameter))
            d.definitionId = withId->paramID;
        if (d.definitionId.isEmpty())
            d.definitionId = "#" + juce::String (d.index);

        if (seen.contains (d.definitionId))
        {
            inventory.warnings.add ("duplicate parameter ID \"" + d.definitionId
                                    + "\" — index " + juce::String (d.index)
                                    + " addressed as \"" + d.definitionId + "#" + juce::String (d.index) + "\"");
            d.definitionId += "#" + juce::String (d.index);
        }
        seen.add (d.definitionId);

        d.name          = parameter->getName (128);
        d.label         = parameter->getLabel();
        d.defaultValue  = parameter->getDefaultValue();
        d.numSteps      = parameter->getNumSteps();
        d.discrete      = parameter->isDiscrete();
        d.boolean       = parameter->isBoolean();
        d.automatable   = parameter->isAutomatable();
        d.metaParameter = parameter->isMetaParameter();

        if (const auto it = groups.find (parameter); it != groups.end())
            d.group = it->second;

        inventory.descriptors.add (std::move (d));
    }

    return inventory;
}

juce::Array<ControlPage> generateControlPages (const juce::String& partId,
                                               const juce::String& pluginCeId,
                                               const juce::String& pluginName,
                                               const ParameterInventory& inventory,
                                               int slotsPerPage)
{
    slotsPerPage = juce::jmax (1, slotsPerPage);

    // Candidates in registry order, bucketed by group in first-appearance order. Excluded:
    // non-automatable parameters (meters and read-only displays present themselves this
    // way), meta parameters (a plug-in's own macro layer — controlling the macro's targets
    // through the macro AND directly invites fights), and any id carrying "#" — the
    // fallback and collision cases, whose identity is too weak to put on a control page.
    juce::StringArray groupOrder;
    std::map<juce::String, juce::Array<const ParameterDescriptor*>> byGroup;
    for (const auto& d : inventory.descriptors)
    {
        if (! d.automatable || d.metaParameter || d.name.trim().isEmpty()
            || d.definitionId.containsChar ('#'))
            continue;

        if (! groupOrder.contains (d.group))
            groupOrder.add (d.group);
        byGroup[d.group].add (&d);
    }

    juce::Array<ControlPage> pages;
    for (const auto& group : groupOrder)
    {
        const auto& members = byGroup[group];
        const auto chunks = (members.size() + slotsPerPage - 1) / slotsPerPage;
        for (int chunk = 0; chunk < chunks; ++chunk)
        {
            auto page = ControlPage::create ({}, slotsPerPage);
            const auto base = group.isNotEmpty() ? group
                                                 : (pluginName.isNotEmpty() ? pluginName
                                                                            : juce::String ("Main"));
            page.name = chunks > 1 ? base + " " + juce::String (chunk + 1) : base;
            page.generated = true;
            page.generatedForPartId = partId;

            for (int i = 0; i < slotsPerPage; ++i)
            {
                const auto index = chunk * slotsPerPage + i;
                if (index >= members.size())
                    break;

                ControlBinding binding;
                binding.partId = partId;
                binding.pluginCeId = pluginCeId;
                binding.parameterId = members[index]->definitionId;
                page.slots.getReference (i).binding = std::move (binding);
            }

            pages.add (std::move (page));
        }
    }

    return pages;
}

} // namespace ceditor::host
