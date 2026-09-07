#include "Ctrl49RackDisplay.h"

namespace ceditor::ctrl49
{

namespace
{
    void appendString (Bytes& out, const std::string& s)
    {
        const auto length = s.size() > 255 ? std::size_t { 255 } : s.size();
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

} // namespace ceditor::ctrl49
