// Ctrl49RackDisplay — Hostage rack display payloads for the CTRL49.
//
// The proven multiknob Lua page takes two calls: set_labels ([titleLen][title][8x[len][label]],
// ASCII) and set_values (the 22-byte state the reducer documents). For the RACK surface the
// value truth lives in the parameter model, not the reducer — so this builds both payloads
// from the host's slot views: labels from display names, knob positions from the bindings'
// 0..1 positions, switches marking unresolved slots so a broken binding is visible on the
// hardware instead of a knob that silently does nothing.
//
// Pure std, no I/O, no JUCE — same tier as the protocol library, testable everywhere. The
// diffing lives here too: a display update is worth sending only when the payload actually
// changed, and "did it change" is a byte compare the caller shouldn't reinvent.

#pragma once

#include "Ctrl49Protocol.h"

#include <array>
#include <string>

namespace ceditor::ctrl49
{

struct RackSlotView
{
    std::string label;        // display name; shown under the knob, ASCII-sanitized, capped
    int position = 0;         // 0..127 knob position (the binding's mapped position)
    bool assigned = false;
    bool resolved = false;
};

using RackSlotViews = std::array<RackSlotView, 8>;

/** set_labels payload: [titleLen][title][ 8x [labelLen][label] ]. Non-ASCII bytes become
    '?', labels cap at 255 (the length byte), an unassigned slot shows an empty label. */
Bytes buildRackLabelPayload (const std::string& title, const RackSlotViews& slots);

/** The 22-byte set_values state in the reducer's documented shape:
    [page][activeSlot][padBank][lastPad][lastVelocity][division][values x8][switches x8].
    Values come from the slot positions; the switch flags light unresolved-but-assigned
    slots. The pad/velocity/division bytes are zeroed — the rack page does not use them. */
Bytes buildRackStatePayload (int activeSlot, const RackSlotViews& slots);

} // namespace ceditor::ctrl49
