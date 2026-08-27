// Ctrl49RackDisplayTests — the rack surface's display payloads and the reducer's normalized
// control events (VIP-successor Stage 3).
//
// The payloads follow contracts proven live on hardware — set_labels' length-prefixed ASCII
// strings and the 22-byte set_values state — so what these tests pin is byte positions, caps
// and sanitization, plus the additive Ctrl49Action fields a rack host consumes: the raw
// encoder delta before the reducer's own bookkeeping absorbs it, and the page-changed flag.

#include "ControlSurface/Ctrl49RackDisplay.h"
#include "ControlSurface/Ctrl49Reducer.h"

#include <cstdio>
#include <string>

namespace
{
int failures = 0;

void check (bool cond, const std::string& label)
{
    std::printf ("  %s  %s\n", cond ? "PASS" : "FAIL", label.c_str());
    if (! cond) ++failures;
}

using namespace ceditor::ctrl49;
} // namespace

int main()
{
    std::printf ("Ctrl49 rack display tests\n");

    // --- labels ------------------------------------------------------------------------
    RackSlotViews slots {};
    slots[0] = { "Cutoff", 64, true, true };
    slots[1] = { std::string ("R\xC3\xA9so"), 0, true, true };   // UTF-8 é must not reach the wire
    slots[2] = { "Ghost", 0, false, false };                     // unassigned: label suppressed

    const auto labels = buildRackLabelPayload ("Good Synth", slots);
    check (labels[0] == 10 && labels[1] == 'G', "the title leads, length-prefixed");
    std::size_t at = 1 + 10;
    check (labels[at] == 6 && labels[at + 1] == 'C', "slot labels follow in order");
    at += 1 + 6;
    check (labels[at] == 5 && labels[at + 1] == 'R' && labels[at + 2] == '?' && labels[at + 3] == '?',
           "non-ASCII bytes become '?' instead of raw UTF-8 on the wire");
    at += 1 + 5;
    check (labels[at] == 0, "an unassigned slot sends an empty label");

    RackSlotViews longSlots {};
    longSlots[0] = { std::string (300, 'x'), 0, true, true };
    const auto capped = buildRackLabelPayload ("t", longSlots);
    check (capped[2] == 255, "a runaway label caps at the length byte's reach");

    // --- the 22-byte state -------------------------------------------------------------
    slots[1].resolved = false;   // assigned but unresolved: the switch flag must light
    slots[0].position = 200;     // out of range: clamps, never wraps
    const auto state = buildRackStatePayload (2, 1, slots);
    check (state.size() == 22, "the state payload keeps the proven shape");
    check (state[0] == 2 && state[1] == 1, "page and active slot lead");
    check (state[6] == 127 && state[7] == 0, "positions land in the value bytes, clamped");
    check (state[14] == 0 && state[15] == 1 && state[16] == 0,
           "the switch flags mark exactly the assigned-but-unresolved slots");
    check (state[3] == 0 && state[4] == 0 && state[5] == 0,
           "pad, velocity and division stay zero — the rack page does not use them");

    // --- the reducer's normalized events -----------------------------------------------
    Ctrl49Reducer reducer;
    reducer.setPageCount (2);

    const std::uint8_t turnUp[]   = { 0xB0, 13, 0x01 };
    const std::uint8_t turnDown[] = { 0xB0, 13, 0x7F };
    auto action = reducer.process (turnUp, 3);
    check (action && action->encoderMoved && action->encoderSlot == 2 && action->encoderDelta == 1,
           "an encoder turn reports its slot and signed delta");
    action = reducer.process (turnDown, 3);
    check (action && action->encoderDelta == -1, "counter-clockwise reports -1");

    const std::uint8_t dial[] = { 0xB0, 34, 0x01 };
    action = reducer.process (dial, 3);
    check (action && action->encoderMoved && action->encoderSlot == 2,
           "the data dial reports the active slot");

    const std::uint8_t pageRight[] = { 0xB0, 40, 0x7F };
    action = reducer.process (pageRight, 3);
    check (action && action->pageChanged && reducer.page() == 1, "page navigation says so");

    const std::uint8_t pad[] = { 0xB0, 3, 0x60 };
    action = reducer.process (pad, 3);
    check (action && ! action->encoderMoved && ! action->pageChanged,
           "a pad strike is neither an encoder nor a page event");

    std::printf (failures == 0 ? "\nALL PASSED\n" : "\nFAILURES: %d\n", failures);
    return failures == 0 ? 0 : 1;
}
