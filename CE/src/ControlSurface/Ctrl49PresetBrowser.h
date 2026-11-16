#pragma once

#include <juce_core/juce_core.h>
#include <algorithm>
#include <map>
#include <set>
#include <vector>

namespace ceditor::ctrl49
{
struct BrowserPreset
{
    juce::String id, name, bank, folder;
    std::vector<juce::StringArray> categories;
};

class PresetBrowser
{
public:
    using Path = std::vector<juce::String>;
    struct Row { juce::String label, id, group; int count = 0; };

    void open (const std::vector<BrowserPreset>& sounds, const juce::String& loaded, const Path& remembered)
    {
        nodes.clear();
        rows.clear();
        Path firstMatch;
        const bool categorized = std::any_of (sounds.begin(), sounds.end(),
            [] (const auto& sound) { return ! sound.categories.empty(); });
        for (const auto& sound : sounds)
        {
            auto index = [&] (Path path)
            {
                auto& node = nodes[path];
                if (node.sounds.empty() || node.sounds.back().id != sound.id)
                    node.sounds.push_back ({ sound.name, sound.id, {} });
                if (firstMatch.empty() && sound.id == loaded) firstMatch = path;
                while (path.size() > 1)
                {
                    const auto child = path.back();
                    path.pop_back();
                    nodes[path].children.insert (child);
                    auto& members = nodes[path].sounds;
                    if (members.empty() || members.back().id != sound.id)
                        members.push_back ({ sound.name, sound.id, {} });
                }
            };
            for (const auto& category : sound.categories)
            {
                Path path { "Categories" };
                for (const auto& level : category) path.push_back (level);
                index (path);
            }
            if (categorized && sound.categories.empty()) index ({ "Categories", "Uncategorized" });
            if (sound.bank.isNotEmpty()) index ({ "Banks", sound.bank });
            if (sound.folder.isNotEmpty()) index ({ "Folders", sound.folder });
            Path all { "All presets" };
            if (sounds.size() > 100)
            {
                auto letter = sound.name.trimStart().substring (0, 1).toUpperCase();
                all.push_back (letter.isEmpty() ? "#" : letter);
            }
            index (all);
        }
        Path start = firstMatch.empty() ? Path { "All presets" } : firstMatch;
        if (! remembered.empty())
        {
            auto lookup = remembered;
            if (lookup.back().isEmpty()) lookup.pop_back();
            auto i = nodes.find (lookup);
            if (i != nodes.end() && std::any_of (i->second.sounds.begin(), i->second.sounds.end(),
                [&] (const auto& sound) { return sound.id == loaded; })) start = remembered;
        }
        if (! start.back().isEmpty() && ! nodes[start].children.empty()) start.push_back ({});
        show (start);
        for (int i = 0; i < size(); ++i)
            if (rows[i].id == loaded) cursor = i;
    }

    void show (Path next)
    {
        path = std::move (next);
        rows.clear();
        if (path.empty())
        {
            for (auto name : { "Categories", "Banks", "Folders", "All presets" })
                if (auto it = nodes.find ({ name }); it != nodes.end())
                    rows.push_back ({ name, {}, name, int (juce::String (name) == "All presets"
                        ? it->second.sounds.size() : it->second.children.size()) });
        }
        else
        {
            auto key = path;
            const bool all = key.back().isEmpty();
            if (all) key.pop_back();
            const auto& node = nodes.at (key);
            if (all || node.children.empty()) rows = node.sounds;
            else
            {
                if (key.size() > 1 || key.front() == "All presets")
                    rows.push_back ({ "All " + (key.size() == 1 ? juce::String ("presets") : key.back()),
                                      {}, {}, int (node.sounds.size()) });
                for (const auto& name : node.children)
                {
                    auto child = key;
                    child.push_back (name);
                    rows.push_back ({ name, {}, name, int (nodes.at (child).sounds.size()) });
                }
            }
        }
        cursor = rows.empty() ? -1 : 0;
    }

    juce::String select()
    {
        if (cursor < 0) return {};
        const auto row = rows[cursor];
        if (row.id.isNotEmpty()) return row.id;
        auto next = path;
        next.push_back (row.group);
        show (next);
        return {};
    }

    bool back()
    {
        if (path.empty()) return false;
        auto parent = path;
        const auto child = parent.back();
        parent.pop_back();
        show (parent);
        for (int i = 0; i < size(); ++i)
            if (rows[i].group == child) cursor = i;
        return true;
    }
    int size() const { return static_cast<int> (rows.size()); }
    int cursor = -1;
    Path path;
    std::vector<Row> rows;
private:
    struct Node { std::set<juce::String> children; std::vector<Row> sounds; };
    std::map<Path, Node> nodes;
};
}
