#pragma once

#include <string>
#include <vector>

// SurfaceBrowse — browsing the library with your hands on the keys.
//
// This is the thing the product this succeeds did that no plug-in browser matched: you never
// touched the mouse. Turn an encoder, the list moves; push, the sound loads. It worked on two
// keyboards, both made by the company that wrote it, and that was its cage — your controller
// browsed or it did not, and you could not fix it.
//
// So nothing here names a device. A surface arrives as four numbers (encoders, pads, and the
// size of its screen if it has one) and this decides what browsing looks like on THAT surface.
// Sixteen encoders get more filters. One encoder scrolls and nothing else. No screen at all
// still gets the pads, and is TOLD it has no list rather than being quietly half-supported —
// the same rule the drawn surface already follows: a control that cannot be driven says so.
//
// Pure std, no JUCE, no I/O — same tier as the protocol library, for the same reason: the
// windowing arithmetic below is the part that is easy to get subtly wrong (a cursor that walks
// off the end, a list that jitters by a row on every turn) and it should be provable anywhere.

namespace ceditor::surface
{

/** What the connected surface actually offers, read off its profile's capabilities. */
struct BrowseSurface
{
    int encoders = 0;
    int pads = 0;
    bool hasDisplay = false;
    int displayRows = 0;       // how many list rows fit; 0 with no display
    int displayColumns = 0;    // characters per row, for truncating names
};

/** One result, as the hardware needs it: a name, a word about where it came from, and the two
    facts that change what pressing it does. */
struct BrowseEntry
{
    std::string name;
    std::string detail;        // "STAGE KEYS", "HW · JUNO-106", "CHAIN"
    bool available = true;     // false: pressing it cannot work, and it says so
    bool instant = false;      // a stored preview answers immediately
};

/** A filter an encoder can turn through. `values` is what that encoder cycles; `selected` is
    where it currently sits, -1 meaning "no opinion" (the first detent past the end). */
struct BrowseFacet
{
    std::string label;                  // "TYPE", "CHARACTER", "SOURCE"
    std::vector<std::string> values;
    int selected = -1;
};

/** Where the browser is. Held by the caller between turns; every function here is pure. */
struct BrowseCursor
{
    int index = 0;             // into the whole result list
    int firstVisible = 0;      // the top row on screen
};

/** Moves the cursor by `delta` and drags the window after it.

    Two rules, and both are what separates a list you can browse blind from one you cannot.
    The cursor STOPS at the ends rather than wrapping: a wrap while you are turning fast puts
    you at the other end of twelve thousand sounds with no way to know it happened. And the
    window only moves when the cursor would leave it, keeping a one-row margin where there is
    room — a list that re-centres on every turn is a list whose rows are never where you last
    saw them. */
BrowseCursor browseScroll (BrowseCursor cursor, int delta, int total, int visibleRows);

/** The rows to draw, from `firstVisible`, clipped to the list and to the screen. */
std::vector<BrowseEntry> browseWindow (const std::vector<BrowseEntry>& all,
                                       const BrowseCursor& cursor, int visibleRows);

/** What one encoder does. `role` is "scroll", "facet" or "" for an encoder this browser has
    nothing to give — drawn and labelled and honestly inert, exactly as the surface drawing
    treats a control the runtime cannot address. */
struct EncoderAssignment
{
    std::string role;
    std::string label;   // what to print above it
    std::string value;   // what it currently reads
    int facetIndex = -1; // which facet it turns, for the caller to apply a delta to
};

/** Encoder 0 always scrolls: it is the one control every browser needs, and a surface with a
    single encoder must still be able to move through the list. The rest take facets in order
    until either runs out. */
std::vector<EncoderAssignment> assignBrowseEncoders (const BrowseSurface& surface,
                                                     const std::vector<BrowseFacet>& facets,
                                                     int total, int index);

/** The results the pads hold — the top of the list, so a pad press is always a sound you can
    see. Fewer pads means fewer; no pads means none, and the caller says so rather than
    pretending the hardware can do something it cannot. */
std::vector<BrowseEntry> assignBrowsePads (const BrowseSurface& surface,
                                           const std::vector<BrowseEntry>& all);

/** The line across the top of the screen: what is being browsed and how much of it there is. */
std::string browseTitle (const std::vector<BrowseFacet>& facets, int index, int total);

/** What this surface cannot do, in a sentence, or empty when it can do all of it. Shown once
    where the surface is set up — being told beats discovering it by pressing something. */
std::string browseLimitations (const BrowseSurface& surface, int facetCount);

/** ASCII, trimmed to the screen's width with an ellipsis where a name does not fit. A screen
    that silently clips reads as damage; one that says "Glass Cathedr…" reads as a long name. */
std::string fitToColumns (const std::string& text, int columns);

} // namespace ceditor::surface
