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
    for (const auto& slot : slots)
        appendString (out, slot.assigned ? slot.label : std::string());
    return out;
}

Bytes buildRackStatePayload (int page, int activeSlot, const RackSlotViews& slots)
{
    Bytes result (22, 0);
    result[0] = static_cast<std::uint8_t> (clamp127 (page));
    result[1] = static_cast<std::uint8_t> (clamp127 (activeSlot));
    for (std::size_t slot = 0; slot < slots.size(); ++slot)
    {
        result[6 + slot]  = static_cast<std::uint8_t> (clamp127 (slots[slot].position));
        result[14 + slot] = slots[slot].assigned && ! slots[slot].resolved ? 1 : 0;
    }
    return result;
}

} // namespace ceditor::ctrl49
