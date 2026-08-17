// Hidden-input reducer for the CTRL49 VIP control layer — a direct C++ port of the
// reducer proven live in the PowerShell unified demonstrator (Ctrl49UnifiedStateV1).
//
// The physical controls arrive as raw MIDI on the hidden cable-2 input and are stateless;
// the host owns every interpretation: Shift and Time Division held-state, the active pad
// bank (pads emit CC 1-8 in every bank), relative encoder deltas, page focus, and
// per-page values. Pure logic, no I/O.

#pragma once

#include "Ctrl49Protocol.h"

#include <optional>
#include <string>

namespace ceditor::ctrl49
{

// What one processed input message asks the host to do.
struct Ctrl49Action
{
    bool render      = false;  // display state changed; schedule a coalesced redraw
    bool bankChanged = false;  // pad bank selected (Shift + Bank A..D)
    int  bank        = -1;     // 0..3 when bankChanged
    bool padChanged  = false;  // pad strike or release
    int  pad         = -1;     // 1..8 when padChanged
    int  velocity    = -1;     // strike velocity, 0 on release
    std::string text;          // human-readable description for logging
};

class Ctrl49Reducer
{
public:
    static constexpr int kPageCount = 4;
    static constexpr int kSlotCount = 8;

    // Processes one complete MIDI message from the hidden input. Returns the resulting
    // action, or nullopt for messages that change nothing (poly pressure, SysEx replies,
    // unknown CCs, releases that carry no state).
    std::optional<Ctrl49Action> process (const std::uint8_t* data, std::size_t size);

    // The 22-byte set_state payload for the demo Lua page:
    // [page][activeSlot][padBank][lastPad][lastVelocity][division][values x8][switches x8]
    Bytes displayArguments() const;

    int page() const        { return page_; }
    int activeSlot() const  { return activeSlot_; }
    int padBank() const     { return padBank_; }
    int division() const    { return division_; }

private:
    static int clamp (int value);
    static int delta (int value);

    int  values_[kPageCount][kSlotCount] {};
    bool switches_[kPageCount][kSlotCount] {};
    bool shiftDown_        = false;
    bool timeDivisionDown_ = false;
    int  page_         = 0;
    int  activeSlot_   = 0;
    int  padBank_      = 0;
    int  lastPad_      = 0;
    int  lastVelocity_ = 0;
    int  division_     = 0;

public:
    Ctrl49Reducer();
};

} // namespace ceditor::ctrl49
