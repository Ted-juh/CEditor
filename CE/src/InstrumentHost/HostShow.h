#pragma once

#include "RackModel.h"

#include <juce_core/juce_core.h>
#include <map>

// HostShow — a show, as a file (docs/design/hostage-creator-editor-player.md, step 3).
//
// A show is what a player needs to run one evening without its editor: the rack (parts and their
// sounds, effects, mixer, macros, control pages and CTRL49 screens, scenes, songs, the setlist,
// captured hardware patches), every sound-library record that rack points at, the controller
// description and the CTRL49 stage pages. It names the plug-ins it needs and never carries them:
// their licences forbid it, and a player says what is missing instead.
//
//   { "format": "hostage-show", "version": 1, "name": "Friday at the Paradiso",
//     "savedAtMs": …, "rack": <Performance with plug-in states>,
//     "library": <Library JSON form, the records the rack needs>,
//     "controller": { "name", "encoders", "faders", "pads" }, "stagePages": { … },
//     "requires": { "plugins": [ { "ceId", "name", "vendor" } ] } }
//
// The rack is the same Performance a session file holds, so a show opens through the same
// restore a session does. What is here is the part that needs no service: names, and walking a
// rack for what it refers to. juce_core and the rack model only, so a plain test can prove it.

namespace ceditor::host::show
{

inline constexpr const char* formatName = "hostage-show";
inline constexpr int formatVersion = 1;

inline juce::String extension() { return ".hostageshow"; }

/** The file a show of this name is kept in, or empty when the name leaves nothing a file system
    accepts. "Friday: Paradiso" -> "Friday Paradiso.hostageshow". */
inline juce::String fileNameFor (const juce::String& showName)
{
    // Leading dots too: "../x" has its slash removed by createLegalFileName and would otherwise
    // leave "..x", which isShowFileName then refuses to open.
    const auto legal = juce::File::createLegalFileName (showName.trim()).trim()
                           .trimCharactersAtStart (".").trim();
    return legal.isEmpty() ? juce::String() : legal + extension();
}

/** A bare show file name, as the page names one: the extension, and no folder in it. Anything
    else (a path, "..") is refused before it reaches the file system. */
inline bool isShowFileName (const juce::String& fileName)
{
    return fileName.endsWithIgnoreCase (extension())
        && fileName.length() > extension().length()
        && ! fileName.containsAnyOf ("/\\:")
        && ! fileName.startsWith ("..");
}

struct PluginNeed
{
    juce::String ceId, name, vendor;
};

/** Every plug-in a rack loads: each part's instrument and every effect chain. Keyed by the
    catalogue's class identity, which is what the player looks up. */
inline void collectPlugins (const Performance& performance, std::map<juce::String, PluginNeed>& into)
{
    const auto add = [&into] (const juce::String& ceId, const juce::String& name, const juce::String& vendor)
    {
        if (ceId.isNotEmpty() && into.find (ceId) == into.end())
            into[ceId] = { ceId, name, vendor };
    };
    const auto chain = [&add] (const juce::Array<EffectSlot>& effects)
    {
        for (const auto& effect : effects)
            add (effect.pluginCeId, effect.pluginName, effect.pluginVendor);
    };

    for (const auto& part : performance.parts)
    {
        add (part.pluginCeId, part.pluginName, part.pluginVendor);
        chain (part.effects);
    }
    chain (performance.masterEffects);
    for (const auto& ret : performance.returns)
        chain (ret.effects);
    for (const auto& bus : performance.buses)
        chain (bus.effects);
}

/** Every sound-library record a rack points at by id: the sound each part last loaded, both
    ends of a morph, the sound a control page belongs to, and a song's own rack. Those five are
    the only references the rack model has; a show carries each, or the songs and morphs that
    need them arrive broken. */
inline void collectRecordIds (const Performance& performance, juce::StringArray& into)
{
    const auto add = [&into] (const juce::String& id)
    {
        if (id.isNotEmpty())
            into.addIfNotAlreadyThere (id);
    };
    for (const auto& part : performance.parts)
    {
        add (part.lastPresetRecordId);
        add (part.morphRecordIdA);
        add (part.morphRecordIdB);
    }
    for (const auto& page : performance.pages)
        add (page.presetRecordId);
    for (const auto& item : performance.setlist.items)
        add (item.rackRecordId);
}

/** Points the same five references at other ids: where a show's sound is already in this
    library under an id of its own, the rack is pointed at that one rather than at a copy. */
inline void remapRecordIds (Performance& performance, const std::map<juce::String, juce::String>& to)
{
    const auto swap = [&to] (juce::String& id)
    {
        if (const auto found = to.find (id); found != to.end())
            id = found->second;
    };
    for (auto& part : performance.parts)
    {
        swap (part.lastPresetRecordId);
        swap (part.morphRecordIdA);
        swap (part.morphRecordIdB);
    }
    for (auto& page : performance.pages)
        swap (page.presetRecordId);
    for (auto& item : performance.setlist.items)
        swap (item.rackRecordId);
}

/** A setlist item's notes are "what the player needs to read on stage": somebody's own words,
    and the only personal prose in a rack (see factoryPerformance in build-host-product.mjs). A
    show built into a product leaves them out unless the Host Project asks for them. */
inline void stripStageNotes (Performance& performance)
{
    for (auto& item : performance.setlist.items)
        item.notes = {};
}

} // namespace ceditor::host::show
