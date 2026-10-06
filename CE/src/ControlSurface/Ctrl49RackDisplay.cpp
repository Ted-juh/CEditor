#include "Ctrl49RackDisplay.h"

namespace ceditor::ctrl49
{

namespace
{
    void appendString (Bytes& out, const std::string& s, std::size_t cap = kMaxLabelCharacters)
    {
        const auto length = s.size() > cap ? cap : s.size();
        out.push_back (static_cast<std::uint8_t> (length));
        for (std::size_t i = 0; i < length; ++i)
        {
            const auto byte = static_cast<std::uint8_t> (s[i]);
            out.push_back (byte < 0x80 ? byte : static_cast<std::uint8_t> ('?'));
        }
    }

    int clamp127 (int value)
    {
        return value < 0 ? 0 : (value > 127 ? 127 : value);
    }
} // namespace

Bytes buildRackLabelPayload (const std::string& title, const RackSlotViews& slots)
{
    Bytes out;
    appendString (out, title);
    // An unresolved binding is marked in its label — the knob page has no switch row, so
    // the flag the old 22-byte payload carried moves to where this page can show it.
    for (const auto& slot : slots)
        appendString (out, ! slot.assigned ? std::string()
                          : slot.resolved  ? slot.label
                                           : "!" + slot.label);
    return out;
}

Bytes buildRackStatePayload (int activeSlot, const RackSlotViews& slots)
{
    // Exactly what CEditor_MultiKnob.lua's set_values reads: 9 bytes, [activeSlot][v0..v7].
    // The first hardware run of the broker found the old 22-byte set_state layout here —
    // the BRIDGE page's format — which put the active slot on knob 1 and every value six
    // knobs late. The page's contract is the contract; this builder now speaks it.
    Bytes result (9, 0);
    result[0] = static_cast<std::uint8_t> (clamp127 (activeSlot));
    for (std::size_t slot = 0; slot < slots.size() && slot < 8; ++slot)
        result[1 + slot] = static_cast<std::uint8_t> (clamp127 (slots[slot].position));
    return result;
}

Bytes buildRackStatePayload (int activeSlot, const RackSlotViews& slots, int pageNumber, int pageCount)
{
    auto result = buildRackStatePayload (activeSlot, slots);
    result.push_back (0);       // [9] a control page
    result.push_back (0);       // [10] [11] the performance page's beat and beats per bar
    result.push_back (4);
    result.push_back (static_cast<std::uint8_t> (clamp127 (pageNumber)));
    result.push_back (static_cast<std::uint8_t> (clamp127 (pageCount)));
    for (const auto& slot : slots)
        appendString (result, slot.assigned ? slot.valueText : std::string(), kMaxValueCharacters);
    return result;
}

RackSlotViews browseSlotViews (const std::vector<surface::BrowseEntry>& rows,
                               int cursorRowInWindow, int columns)
{
    RackSlotViews views {};

    for (std::size_t i = 0; i < views.size() && i < rows.size(); ++i)
    {
        const auto& row = rows[i];
        views[i].label = surface::fitToColumns (row.name, columns > 0 ? columns : 12);
        views[i].assigned = true;
        views[i].resolved = row.available;
        // The cursor row takes a full knob and the others take none. There is no other way to
        // say "this one" on a page made of knobs, and a row you cannot pick out is a list you
        // have to look at the computer to read — which is the thing this stage exists to stop.
        views[i].position = (int) i == cursorRowInWindow ? 127 : 0;
    }

    return views;
}

Bytes buildBrowseStatePayload (int cursorRow, const RackSlotViews& slots, const std::string& current)
{
    auto result = buildRackStatePayload (cursorRow, slots);
    result.insert (result.end(), { 7, 0, 4, 0, 0 });    // [9] the browser, beat bytes, no page
    for (std::size_t slot = 0; slot < 8; ++slot)
        result.push_back (0);                              // no value texts: no numbers
    appendString (result, current, kMaxBrowseLineCharacters);
    return result;
}

std::string browseLineForDisplay (const surface::BrowseEntry& entry)
{
    return browseTitleForDisplay (entry.detail.empty() ? entry.name : entry.name + " \xC2\xB7 " + entry.detail);
}

std::string browseTitleForDisplay (const std::string& title)
{
    static const std::string dot = " \xC2\xB7 ";
    std::string out = title;
    for (auto at = out.find (dot); at != std::string::npos; at = out.find (dot, at + 3))
        out.replace (at, dot.size(), " - ");
    return out;
}

} // namespace ceditor::ctrl49
