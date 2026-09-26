// Hidden-input reducer for the CTRL49 VIP control layer — a direct C++ port of the
// reducer proven live in the PowerShell unified demonstrator (Ctrl49UnifiedStateV1).
//
// The physical controls arrive as raw MIDI on the hidden cable-2 input and are stateless;
// the host owns every interpretation: Shift and Time Division held-state, the active pad
// bank (pads emit CC 1-8 in every bank), relative encoder deltas, page focus, and
// per-page values. Pure logic, no I/O.

#pragma once

#include "Ctrl49Protocol.h"

#include <array>
#include <optional>
#include <string>
#include <vector>

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
    // The normalized control event the Hostage mapping runtime consumes: the
    // raw relative movement, before the reducer's own 0..127 bookkeeping absorbs it. A rack
    // host applies the delta to ITS value model (the parameter position) and builds its own
    // display payload — the internal values_ then only serve hosts without one.
    bool encoderMoved = false; // encoder turn or data dial
    int  encoderSlot  = -1;    // 0..7 when encoderMoved
    int  encoderDelta = 0;     // signed detents when encoderMoved
    bool pageChanged  = false; // page navigation (mode buttons, Page Left/Right)
    // One of the eight small buttons above the pads (CC 19..26, printed 1/4 .. 1/32T), pressed
    // or released — not while Time Division is held, when they choose a division instead. The
    // release is reported so a host can tell a long press from a short one.
    bool switchChanged = false;
    int  switchSlot    = -1;   // 0..7 when switchChanged
    bool switchDown    = false;
    std::string text;          // human-readable description for logging
};

class Ctrl49Reducer
{
public:
    // The page count a fresh reducer starts with: the four mode buttons' worth the VIP layer
    // was proven with. It is a default, not a ceiling — a host with more pages says so.
    static constexpr int kDefaultPageCount = 4;
    static constexpr int kSlotCount = 8;

    // Bounds Page Left/Right and mode-button navigation to [0, count), so a host never lands
    // on a page it does not have. Any count of at least one is taken as given: the rack's
    // control pages are the user's, and the keyboard reaching only the first few of them was
    // a limit nobody chose. Per-page values/switches grow to cover it and are kept when the
    // count shrinks, so a page that comes back keeps what it had.
    void setPageCount (int count);
    int pageCount() const   { return pageCount_; }
    /** Programmatic recall used by a scene or setlist item. Returns true only when the page
        actually changed; physical Page Left/Right continues from the recalled page. */
    bool setPage (int page);

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

    struct PageState
    {
        std::array<int, kSlotCount>  values;
        std::array<bool, kSlotCount> switches {};
        PageState() { values.fill (64); }
    };

    std::vector<PageState> pages_;
    PageState&       current()       { return pages_[(std::size_t) page_]; }
    const PageState& current() const { return pages_[(std::size_t) page_]; }
    bool shiftDown_        = false;
    bool timeDivisionDown_ = false;
    int  pageCount_    = kDefaultPageCount;
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
