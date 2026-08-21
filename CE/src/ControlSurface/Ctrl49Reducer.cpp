#include "Ctrl49Reducer.h"

namespace ceditor::ctrl49
{

namespace
{
    Ctrl49Action makeAction (std::string text, bool render)
    {
        Ctrl49Action action;
        action.text   = std::move (text);
        action.render = render;
        return action;
    }
} // namespace

Ctrl49Reducer::Ctrl49Reducer()
{
    for (auto& pageValues : values_)
        for (auto& value : pageValues)
            value = 64;
}

void Ctrl49Reducer::setPageCount (int count)
{
    pageCount_ = count < 1 ? 1 : (count > kPageCount ? kPageCount : count);
    if (page_ >= pageCount_)
        page_ = pageCount_ - 1;
}

int Ctrl49Reducer::clamp (int value)
{
    return value < 0 ? 0 : (value > 127 ? 127 : value);
}

int Ctrl49Reducer::delta (int value)
{
    // Proven relative encoding: 0x01 clockwise +1, 0x7F counter-clockwise -1.
    return value == 127 ? -1 : value;
}

std::optional<Ctrl49Action> Ctrl49Reducer::process (const std::uint8_t* data, std::size_t size)
{
    if (data == nullptr || size < 3)
        return std::nullopt;

    const int status = data[0] & 0xF0;
    const int data1  = data[1];
    const int data2  = data[2];

    // Poly pressure from a held pad is very dense; the strike/release CC remains the
    // state-changing event. SysEx replies (keepalive, 02/3D acks) never reach here as
    // 3-byte messages, but the status filter drops them regardless.
    if (status == 0xA0)
        return std::nullopt;
    if (status != 0xB0)
        return std::nullopt;

    if (data1 >= 1 && data1 <= 8)  // pad strike/release
    {
        lastPad_      = data1;
        lastVelocity_ = data2;
        Ctrl49Action action = makeAction (
            "Pad " + std::to_string (data1) + " / Bank " + std::string (1, static_cast<char> ('A' + padBank_))
                + (data2 == 0 ? " released" : " velocity " + std::to_string (data2)),
            true);
        action.padChanged = true;
        action.pad        = data1;
        action.velocity   = data2;
        return action;
    }

    if (data1 >= 11 && data1 <= 18)  // encoder turn
    {
        const int slot = data1 - 11;
        activeSlot_ = slot;
        values_[page_][slot] = clamp (values_[page_][slot] + delta (data2));
        return makeAction ("Encoder " + std::to_string (slot + 1) + " = "
                               + std::to_string (values_[page_][slot]),
                           true);
    }

    if (data1 >= 19 && data1 <= 26)  // encoder switch (or Time Division choice while held)
    {
        if (data2 != 127)
            return std::nullopt;
        const int slot = data1 - 19;
        activeSlot_ = slot;
        if (timeDivisionDown_)
        {
            division_ = slot + 1;
            return makeAction ("Time Division " + std::to_string (division_) + " selected", true);
        }
        switches_[page_][slot] = ! switches_[page_][slot];
        return makeAction ("Switch " + std::to_string (slot + 1)
                               + (switches_[page_][slot] ? " ON" : " OFF"),
                           true);
    }

    if (data1 == 34)  // data dial adjusts the active slot
    {
        values_[page_][activeSlot_] = clamp (values_[page_][activeSlot_] + delta (data2));
        return makeAction ("Data Dial / slot " + std::to_string (activeSlot_ + 1) + " = "
                               + std::to_string (values_[page_][activeSlot_]),
                           true);
    }

    if (data1 >= 35 && data1 <= 38 && data2 == 127)  // Main/Browser/Control/Multi -> pages 1..4
    {
        const int requested = data1 - 35;
        if (requested >= pageCount_)
            return std::nullopt;  // no such page in this host
        page_ = requested;
        return makeAction ("Mode button selected page " + std::to_string (page_ + 1), true);
    }

    if (data1 == 39 && data2 == 127)  // Page Left
    {
        page_ = (page_ + pageCount_ - 1) % pageCount_;
        return makeAction ("Page Left -> page " + std::to_string (page_ + 1), true);
    }

    if (data1 == 40 && data2 == 127)  // Page Right
    {
        page_ = (page_ + 1) % pageCount_;
        return makeAction ("Page Right -> page " + std::to_string (page_ + 1), true);
    }

    if (data1 >= 42 && data1 <= 45 && data2 == 127 && shiftDown_)  // Shift + Pad Bank A..D
    {
        padBank_ = data1 - 42;
        Ctrl49Action action = makeAction (
            "Pad Bank " + std::string (1, static_cast<char> ('A' + padBank_)) + " selected", true);
        action.bankChanged = true;
        action.bank        = padBank_;
        return action;
    }

    if (data1 == 57)  // Time Division held-state
    {
        timeDivisionDown_ = data2 == 127;
        return makeAction (timeDivisionDown_ ? "Time Division held; press an encoder switch"
                                             : "Time Division released",
                           false);
    }

    if (data1 == 58)  // Shift held-state
    {
        shiftDown_ = data2 == 127;
        return makeAction (shiftDown_ ? "Shift held; press Pad Bank A/B/C/D"
                                      : "Shift released",
                           false);
    }

    return std::nullopt;
}

Bytes Ctrl49Reducer::displayArguments() const
{
    Bytes result (22);
    result[0] = static_cast<std::uint8_t> (page_);
    result[1] = static_cast<std::uint8_t> (activeSlot_);
    result[2] = static_cast<std::uint8_t> (padBank_);
    result[3] = static_cast<std::uint8_t> (lastPad_);
    result[4] = static_cast<std::uint8_t> (lastVelocity_);
    result[5] = static_cast<std::uint8_t> (division_);
    for (int slot = 0; slot < kSlotCount; ++slot)
    {
        result[6 + static_cast<std::size_t> (slot)]  = static_cast<std::uint8_t> (values_[page_][slot]);
        result[14 + static_cast<std::size_t> (slot)] = switches_[page_][slot] ? 1 : 0;
    }
    return result;
}

} // namespace ceditor::ctrl49
