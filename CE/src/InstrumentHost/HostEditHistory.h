#pragma once
#include <juce_core/juce_core.h>
#include <vector>

namespace ceditor::host
{
// Session-local checkpoints. No files or plug-ins are owned by this container.
struct HostEditHistory
{
    struct Entry { juce::String state, label, group; double time = 0; };
    std::vector<Entry> undo, redo;
    juce::String expectedModel;
    static constexpr size_t maxEntries = 20;
    static constexpr size_t maxBytes = 64 * 1024 * 1024;

    void clear() { undo.clear(); redo.clear(); expectedModel.clear(); }
    void trim()
    {
        auto bytes = [this] {
            size_t total = 0;
            for (const auto& e : undo) total += e.state.getNumBytesAsUTF8();
            for (const auto& e : redo) total += e.state.getNumBytesAsUTF8();
            return total;
        };
        while (undo.size() + redo.size() > maxEntries || bytes() > maxBytes)
        {
            if (! undo.empty()) undo.erase (undo.begin());
            else if (! redo.empty()) redo.erase (redo.begin());
            else break;
        }
    }
    void record (Entry entry)
    {
        const bool branching = ! redo.empty();
        redo.clear();
        if (! branching && ! entry.group.isEmpty() && ! undo.empty() && undo.back().group == entry.group
            && entry.time - undo.back().time < 600.0)
            undo.back().time = entry.time;
        else
            undo.push_back (std::move (entry));
        trim();
    }
};
}
