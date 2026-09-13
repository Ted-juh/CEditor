#pragma once
#include "RackModel.h"
#include <functional>

namespace ceditor::host
{
// Reference checks only: neither loading processors nor sending MIDI is part of this pass.
inline juce::StringArray soundcheckReferences (const Performance& rig, const perf::SetlistItem& item,
    const std::function<juce::String (const juce::String&)>& pluginIssue,
    const juce::StringArray& midiOutputs)
{
    juce::StringArray issues;
    const auto plugin = [&] (const juce::String& ceId, const juce::String& name) {
        if (ceId.isEmpty()) return;
        if (const auto why = pluginIssue (ceId); why.isNotEmpty())
            issues.addIfNotAlreadyThere ((name.isNotEmpty() ? name : ceId) + ": " + why);
    };
    const auto effects = [&] (const auto& slots) {
        for (const auto& slot : slots) plugin (slot.pluginCeId, slot.pluginName);
    };
    for (const auto& part : rig.parts)
    {
        if (! part.hardware) plugin (part.pluginCeId, part.pluginName);
        else if (part.midiOutputId.isEmpty() || ! midiOutputs.contains (part.midiOutputId))
            issues.addIfNotAlreadyThere ("MIDI output unavailable: "
                + (part.midiOutputName.isNotEmpty() ? part.midiOutputName : juce::String ("no port selected")));
        effects (part.effects);
        if (part.midiSourcePartId.isNotEmpty() && rig.findPart (part.midiSourcePartId) == nullptr)
            issues.addIfNotAlreadyThere ("MIDI source part is missing: " + part.midiSourcePartId);
        if (part.destinationBusId.isNotEmpty() && rig.findBus (part.destinationBusId) == nullptr)
            issues.addIfNotAlreadyThere ("Destination bus is missing: " + part.destinationBusId);
    }
    effects (rig.masterEffects);
    for (const auto& bus : rig.buses)
    {
        effects (bus.effects);
        if (bus.destinationBusId.isNotEmpty() && rig.findBus (bus.destinationBusId) == nullptr)
            issues.addIfNotAlreadyThere ("Destination bus is missing: " + bus.destinationBusId);
    }
    for (const auto& chain : rig.returns) effects (chain.effects);
    if (item.pageId.isNotEmpty() && rig.findPage (item.pageId) == nullptr)
        issues.add ("Control page is missing: " + item.pageId);
    if (item.sceneId.isNotEmpty())
    {
        const auto* scene = rig.findScene (item.sceneId);
        if (scene == nullptr) issues.add ("Scene is missing: " + item.sceneId);
        else
        {
            if (scene->focusPartId.isNotEmpty() && rig.findPart (scene->focusPartId) == nullptr)
                issues.addIfNotAlreadyThere ("Scene focus part is missing: " + scene->focusPartId);
            for (const auto& macro : scene->macros)
                if (rig.findMacro (macro.macroId) == nullptr)
                    issues.addIfNotAlreadyThere ("Scene macro is missing: " + macro.macroId);
            for (const auto& parameter : scene->parameters)
            {
                const auto* part = rig.findPart (parameter.targetId);
                const auto* effect = rig.findEffect (parameter.targetId);
                if (part == nullptr && effect == nullptr)
                    issues.addIfNotAlreadyThere ("Scene parameter target is missing: " + parameter.targetId);
                else if (parameter.targetCeId.isNotEmpty()
                         && parameter.targetCeId != (part != nullptr ? part->pluginCeId : effect->pluginCeId))
                    issues.addIfNotAlreadyThere ("Scene parameter plug-in has changed: " + parameter.targetId);
            }
            if (scene->pageId.isNotEmpty() && rig.findPage (scene->pageId) == nullptr)
                issues.addIfNotAlreadyThere ("Scene control page is missing: " + scene->pageId);
            for (const auto& part : scene->slots)
                if (rig.findPart (part.partId) == nullptr)
                    issues.addIfNotAlreadyThere ("Scene part is missing: " + part.partId);
            for (const auto& clipId : scene->clipIds)
            {
                const auto* clip = rig.findClip (clipId);
                if (clip == nullptr) issues.addIfNotAlreadyThere ("Scene clip is missing: " + clipId);
                else if (rig.findPattern (clip->patternId) == nullptr)
                    issues.addIfNotAlreadyThere ("Clip pattern is missing: " + clip->patternId);
            }
        }
    }
    return issues;
}
}
