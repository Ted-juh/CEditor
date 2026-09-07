#include "SurfaceBrowse.h"

#include <algorithm>

namespace ceditor::surface
{

namespace
{

int clampTo (int value, int low, int high)
{
    return value < low ? low : (value > high ? high : value);
}

} // namespace

BrowseCursor browseScroll (BrowseCursor cursor, int delta, int total, int visibleRows)
{
    if (total <= 0)
        return {};

    const auto rows = std::max (1, visibleRows);

    // Stops at the ends rather than wrapping. Wrapping while somebody is turning fast puts them
    // at the other end of twelve thousand sounds with nothing on screen to say it happened.
    cursor.index = clampTo (cursor.index + delta, 0, total - 1);

    // The window follows only when the cursor would leave it, and keeps a one-row margin where
    // there is room to have one — a list that re-centres on every turn is a list whose rows are
    // never where you last saw them.
    const auto margin = rows >= 4 ? 1 : 0;
    const auto lastVisible = cursor.firstVisible + rows - 1;

    if (cursor.index - margin < cursor.firstVisible)
        cursor.firstVisible = cursor.index - margin;
    else if (cursor.index + margin > lastVisible)
        cursor.firstVisible = cursor.index + margin - rows + 1;

    cursor.firstVisible = clampTo (cursor.firstVisible, 0, std::max (0, total - rows));
    return cursor;
}

std::vector<BrowseEntry> browseWindow (const std::vector<BrowseEntry>& all,
                                       const BrowseCursor& cursor, int visibleRows)
{
    std::vector<BrowseEntry> out;
    if (all.empty() || visibleRows <= 0)
        return out;

    const auto first = clampTo (cursor.firstVisible, 0, (int) all.size() - 1);
    const auto last = std::min ((int) all.size(), first + visibleRows);
    for (int i = first; i < last; ++i)
        out.push_back (all[(size_t) i]);
    return out;
}

std::vector<EncoderAssignment> assignBrowseEncoders (const BrowseSurface& surface,
                                                     const std::vector<BrowseFacet>& facets,
                                                     int total, int index)
{
    std::vector<EncoderAssignment> out;
    if (surface.encoders <= 0)
        return out;

    // Encoder 0 scrolls, always. It is the one control every browser needs, and a surface with
    // exactly one encoder must still be able to move through the list.
    EncoderAssignment scroll;
    scroll.role = "scroll";
    scroll.label = "SCROLL";
    scroll.value = total > 0 ? std::to_string (clampTo (index, 0, total - 1) + 1) + "/"
                                 + std::to_string (total)
                             : std::string ("none");
    out.push_back (std::move (scroll));

    for (int i = 1; i < surface.encoders; ++i)
    {
        const auto facetIndex = i - 1;
        EncoderAssignment assignment;

        if (facetIndex < (int) facets.size())
        {
            const auto& facet = facets[(size_t) facetIndex];
            assignment.role = "facet";
            assignment.label = facet.label;
            assignment.facetIndex = facetIndex;
            assignment.value = facet.selected >= 0 && facet.selected < (int) facet.values.size()
                                 ? facet.values[(size_t) facet.selected]
                                 : std::string ("any");
        }
        else
        {
            // Drawn, labelled and honestly inert — the same answer the surface drawing gives a
            // control the runtime cannot address.
            assignment.label = "—";
            assignment.value = "";
        }

        out.push_back (std::move (assignment));
    }

    return out;
}

std::vector<BrowseEntry> assignBrowsePads (const BrowseSurface& surface,
                                           const std::vector<BrowseEntry>& all)
{
    std::vector<BrowseEntry> out;
    const auto count = std::min ((int) all.size(), std::max (0, surface.pads));
    for (int i = 0; i < count; ++i)
        out.push_back (all[(size_t) i]);
    return out;
}

std::string browseTitle (const std::vector<BrowseFacet>& facets, int index, int total)
{
    std::string title = "SOUNDS";
    for (const auto& facet : facets)
        if (facet.selected >= 0 && facet.selected < (int) facet.values.size())
        {
            title += " · ";
            title += facet.values[(size_t) facet.selected];
        }

    if (total <= 0)
        return title + " · none";

    return title + " · " + std::to_string (clampTo (index, 0, total - 1) + 1) + "/"
             + std::to_string (total);
}

std::string browseLimitations (const BrowseSurface& surface, int facetCount)
{
    std::vector<std::string> missing;

    if (! surface.hasDisplay || surface.displayRows <= 0)
        missing.push_back ("no screen, so the list stays on the computer — the pads still load");
    if (surface.pads <= 0)
        missing.push_back ("no pads, so there is nothing to press: the encoder pushes instead");
    if (surface.encoders <= 0)
        missing.push_back ("no encoders, so nothing here can scroll");
    else if (surface.encoders - 1 < facetCount)
        missing.push_back ("only " + std::to_string (std::max (0, surface.encoders - 1))
                             + " of " + std::to_string (facetCount)
                             + " filters fit on its encoders");

    if (missing.empty())
        return {};

    std::string out = missing[0];
    for (size_t i = 1; i < missing.size(); ++i)
        out += "; " + missing[i];
    return out;
}

std::string fitToColumns (const std::string& text, int columns)
{
    if (columns <= 0)
        return {};

    // ASCII only: these screens are character cells, and a byte that is not one draws as
    // whatever the firmware feels like. '?' is the same substitution the label payloads make.
    std::string ascii;
    ascii.reserve (text.size());
    for (const auto c : text)
        ascii += (c >= 32 && c < 127) ? c : '?';

    if ((int) ascii.size() <= columns)
        return ascii;
    if (columns == 1)
        return ".";

    // A screen that silently clips reads as damage; one that ends in a dot reads as a long name.
    return ascii.substr (0, (size_t) columns - 1) + ".";
}

} // namespace ceditor::surface
