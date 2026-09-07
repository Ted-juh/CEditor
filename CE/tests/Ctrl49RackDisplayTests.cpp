// Ctrl49RackDisplayTests — the rack surface's display payloads and the reducer's normalized
// Hostage control events.
//
// The payloads follow contracts proven live on hardware — set_labels' length-prefixed ASCII
// strings and the 22-byte set_values state — so what these tests pin is byte positions, caps
// and sanitization, plus the additive Ctrl49Action fields a rack host consumes: the raw
// encoder delta before the reducer's own bookkeeping absorbs it, and the page-changed flag.

#include "ControlSurface/Ctrl49RackDisplay.h"
#include "ControlSurface/SurfaceBrowse.h"
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

    // -- browsing the library from the hardware ------------------------------------------
    //
    // The product this succeeds did this on two keyboards, both made by the company that wrote
    // it, and that was its cage. Nothing here names a device: a surface arrives as four numbers
    // and this decides what browsing looks like on it. What must hold is that the arithmetic
    // never puts the cursor somewhere the screen is not, and that a surface which cannot do
    // something is TOLD so rather than quietly half-supported.
    {
        using namespace ceditor::surface;

        BrowseSurface ctrl49;
        ctrl49.encoders = 8;
        ctrl49.pads = 8;
        ctrl49.hasDisplay = true;
        ctrl49.displayRows = 5;
        ctrl49.displayColumns = 16;

        std::vector<BrowseEntry> results;
        for (int i = 0; i < 40; ++i)
            results.push_back ({ "Sound " + std::to_string (i), "STAGE KEYS", true, i % 2 == 0 });

        // The cursor stops at the ends. Wrapping while somebody is turning fast puts them at the
        // other end of twelve thousand sounds with nothing on screen to say it happened.
        auto cursor = browseScroll ({}, -5, (int) results.size(), ctrl49.displayRows);
        check (cursor.index == 0 && cursor.firstVisible == 0, "turning back from the top stops");
        cursor = browseScroll ({ 39, 35 }, +5, (int) results.size(), ctrl49.displayRows);
        check (cursor.index == 39, "and turning on from the end stops too");

        // The window follows only when the cursor would leave it, keeping a one-row margin.
        cursor = {};
        for (int i = 0; i < 3; ++i)
            cursor = browseScroll (cursor, +1, (int) results.size(), ctrl49.displayRows);
        check (cursor.index == 3 && cursor.firstVisible == 0,
               "the list does not move while the cursor still has room in it");
        cursor = browseScroll (cursor, +1, (int) results.size(), ctrl49.displayRows);
        check (cursor.index == 4 && cursor.firstVisible == 1,
               "and then follows by one row, rather than re-centring under your hand");

        const auto window = browseWindow (results, cursor, ctrl49.displayRows);
        check ((int) window.size() == ctrl49.displayRows, "the screen draws its own number of rows");
        check (window.front().name == "Sound 1", "starting where the window says");

        cursor = browseScroll ({ 39, 35 }, 0, (int) results.size(), ctrl49.displayRows);
        check ((int) browseWindow (results, cursor, ctrl49.displayRows).size() == 5,
               "and the last page is a full page, not a ragged one");

        // Encoder 0 always scrolls; the rest take filters until either runs out.
        std::vector<BrowseFacet> facets {
            { "TYPE", { "Pad", "Bass", "Lead" }, 0 },
            { "CHARACTER", { "Warm", "Bright" }, -1 },
        };

        const auto knobs = assignBrowseEncoders (ctrl49, facets, (int) results.size(), 4);
        check ((int) knobs.size() == 8, "one assignment per encoder the surface has");
        check (knobs[0].role == "scroll" && knobs[0].value == "5/40",
               "the first scrolls, and says where in the list you are");
        check (knobs[1].role == "facet" && knobs[1].label == "TYPE" && knobs[1].value == "Pad",
               "the next turns a filter and reads what it is set to");
        check (knobs[2].value == "any", "an unset filter reads as no opinion, not as a value");
        check (knobs[3].role.empty() && knobs[3].label == "—",
               "and an encoder this browser has nothing for is drawn, labelled and inert");

        // A one-encoder surface still scrolls: that is the control every browser needs.
        BrowseSurface minimal;
        minimal.encoders = 1;
        minimal.pads = 0;
        const auto oneKnob = assignBrowseEncoders (minimal, facets, 40, 0);
        check (oneKnob.size() == 1 && oneKnob[0].role == "scroll",
               "one encoder scrolls rather than filtering");
        check (assignBrowseEncoders ({}, facets, 40, 0).empty(),
               "and a surface with none gets none rather than a phantom");

        // The pads hold the top of the list, so a pad press is always a sound you can see.
        check ((int) assignBrowsePads (ctrl49, results).size() == 8, "eight pads hold eight");
        BrowseSurface fourPads = ctrl49;
        fourPads.pads = 4;
        check ((int) assignBrowsePads (fourPads, results).size() == 4, "four hold four");
        check (assignBrowsePads (minimal, results).empty(), "and none hold none");
        check (assignBrowsePads (ctrl49, {}).empty(), "an empty result set fills no pads");

        check (browseTitle (facets, 4, 40) == "SOUNDS · Pad · 5/40",
               "the title says what is being browsed and how much of it there is");
        check (browseTitle ({}, 0, 0) == "SOUNDS · none", "and says so when there is nothing");

        // Being told beats discovering it by pressing something.
        check (browseLimitations (ctrl49, 2).empty(),
               "a surface that can do all of it is told nothing");
        check (browseLimitations (ctrl49, 12).find ("7 of 12") != std::string::npos,
               "one with too few encoders is told how many filters fit");
        const auto blind = browseLimitations (minimal, 2);
        check (blind.find ("no screen") != std::string::npos
                 && blind.find ("no pads") != std::string::npos,
               "and one with no screen and no pads is told both, rather than half-supported");

        // A screen that silently clips reads as damage.
        check (fitToColumns ("Glass Cathedral", 16) == "Glass Cathedral", "a name that fits fits");
        check (fitToColumns ("Glass Cathedral Extended", 16) == "Glass Cathedral.",
               "and one that does not ends in a dot rather than vanishing mid-word");
        check (fitToColumns ("Caf\xC3\xA9 Pad", 16).find ('?') != std::string::npos,
               "a byte these character cells cannot draw becomes one that is visible");
        check (fitToColumns ("anything", 0).empty(), "no columns, nothing to draw");
    }

    // The browser as this page's eight slots — no new wire format, no new page on the device.
    {
        std::printf ("\n-- the browser on the knob page\n");
        using namespace ceditor::surface;

        const std::vector<BrowseEntry> rows {
            { "Wool Pad", "STAGE KEYS", true, true },
            { "Glass Cathedral Extended", "STAGE KEYS", true, false },
            { "Lost Lead", "DIVA", false, false },
        };

        const auto views = browseSlotViews (rows, 1, 12);

        check (views[0].label == "Wool Pad" && views[0].assigned && views[0].resolved,
               "a result becomes a slot with its name on it");
        check (views[1].label == "Glass Cathe." && views[1].label.size() == 12,
               "trimmed to the screen, ending in a dot rather than vanishing mid-word");
        check (! views[2].resolved && views[2].assigned,
               "one that cannot be loaded comes back unresolved, which this page already marks");
        check (views[3].label.empty() && ! views[3].assigned,
               "and a slot past the end of the list holds nothing rather than repeating");

        // There is no other way to say "this one" on a page made of knobs.
        check (views[1].position == 127 && views[0].position == 0 && views[2].position == 0,
               "the row under the cursor takes a full knob and the rest take none");

        const auto labels = buildRackLabelPayload (browseTitle ({}, 1, 3), views);
        const std::string asText (labels.begin(), labels.end());
        check (asText.find ("Wool Pad") != std::string::npos
                 && asText.find ("SOUNDS") != std::string::npos,
               "and the whole thing is the label payload the page already reads");
        check (asText.find ("!Lost Lead") != std::string::npos,
               "with an unloadable result marked the way an unresolved binding is");

        const auto state = buildRackStatePayload (1, views);
        check (state.size() == 9 && state[0] == 1 && state[2] == 127,
               "beside the nine-byte value payload, cursor row full");

        check (browseSlotViews ({}, 0, 12)[0].label.empty(),
               "an empty list draws an empty page rather than nothing at all");
    }

    std::printf (failures == 0 ? "\nALL PASSED\n" : "\nFAILURES: %d\n", failures);
    return failures == 0 ? 0 : 1;
}
