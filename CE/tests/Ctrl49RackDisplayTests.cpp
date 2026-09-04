// Ctrl49RackDisplayTests — the rack surface's display payloads and the reducer's normalized
// Hostage control events.
//
// The payloads follow contracts proven live on hardware — set_labels' length-prefixed ASCII
// strings and the 22-byte set_values state — so what these tests pin is byte positions, caps
// and sanitization, plus the additive Ctrl49Action fields a rack host consumes: the raw
// encoder delta before the reducer's own bookkeeping absorbs it, and the page-changed flag.

#include "ControlSurface/Ctrl49RackDisplay.h"
#include "ControlSurface/Ctrl49PerformanceDisplay.h"
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
    slots[1].resolved = false;   // assigned but unresolved: the label must say so
    slots[0].position = 200;     // out of range: clamps, never wraps
    // The knob page's contract, pinned against CEditor_MultiKnob.lua's set_values: nine
    // bytes, [activeSlot][v0..v7]. The first hardware run found the old 22-byte set_state
    // shape here — the BRIDGE page's format — which put the active slot on knob 1 and
    // every value six knobs late. This test now speaks for the page that actually renders.
    const auto state = buildRackStatePayload (1, slots);
    check (state.size() == 9, "the state payload is the knob page's nine bytes");
    check (state[0] == 1, "the active slot leads");
    check (state[1] == 127 && state[2] == 0, "positions follow immediately, clamped");

    const auto marked = buildRackLabelPayload ("t", slots);
    // [1]['t'][len]... — slot 2's label (index 1) carries the unresolved mark.
    std::size_t cursor = 2;                              // past title len+body
    const auto len0 = marked[cursor]; cursor += 1 + std::size_t (len0);   // slot 1
    check (marked[cursor] >= 1 && marked[cursor + 1] == '!',
           "an unresolved binding is marked in its label — the page has no switch row");

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

    // -- the Stage 6 performance page ------------------------------------------------------
    // The transport line a player reads at a glance, and clip pads that show intent before
    // the engine acts on it.
    {
        using namespace ceditor::ctrl49;

        PerformanceTransportView transport;
        transport.playing = true;
        transport.tempo = 128.4;
        transport.bar = 3;
        transport.beat = 2;
        check (buildPerformanceTitle (transport) == "> 3.2 128",
               "the transport line reads run state, bar.beat and tempo");

        transport.playing = false;
        transport.externalClock = true;
        check (buildPerformanceTitle (transport) == "# 3.2 128 EXT",
               "external clock is shown");
        transport.clockLost = true;
        check (buildPerformanceTitle (transport) == "# 3.2 128 NO CLK",
               "and a master that went quiet is named, not guessed at");

        PerformanceClipViews clips {};
        clips[0] = { "Verse", true, false, 0.5f };
        clips[1] = { "Chorus", false, true, 0.0f };
        clips[2] = { "Bridge", false, false, 0.0f };

        const auto labels = buildPerformanceLabelPayload (transport, clips);
        const std::string flat (labels.begin(), labels.end());
        check (flat.find ("Verse") != std::string::npos
                 && flat.find (">Chorus") != std::string::npos,
               "a clip waiting for its boundary is marked on the hardware");

        const auto state = buildPerformanceStatePayload (0, clips);
        check (state.size() == 9, "the state payload is the knob page's nine bytes");
        check (state[1] == 63, "phase becomes a knob position, right after the active byte");

        PerformanceClipViews empty {};
        const auto emptyState = buildPerformanceStatePayload (0, empty);
        check (emptyState.size() == 9, "an empty bank still builds a valid payload");
        for (std::size_t i = 1; i < 9; ++i)
            check (emptyState[i] == 0, "with nothing turning");
    }

    std::printf (failures == 0 ? "\nALL PASSED\n" : "\nFAILURES: %d\n", failures);
    return failures == 0 ? 0 : 1;
}
