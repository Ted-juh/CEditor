#pragma once

// Ctrl49PanelScan — the logic of the panel scan (docs/design/ctrl49-panel-scan.md): a plug-in's
// sections, each control's place on its GUI, the overlay it gets, and the keyboard pages they
// make. Pure std, header-only, tested off Windows by CEditorCtrl49PanelScanTests; the Windows
// tool (Ctrl49PanelScan.cpp) only loads the plug-in, takes the pictures and draws the results.

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace ceditor::ctrl49::panelscan
{

// --- geometry --------------------------------------------------------------------------------

struct Box
{
    int x = 0, y = 0, w = 0, h = 0;

    bool empty() const noexcept               { return w <= 0 || h <= 0; }
    int right() const noexcept                { return x + w; }
    int bottom() const noexcept               { return y + h; }
    long long area() const noexcept           { return empty() ? 0 : (long long) w * h; }
    double centreX() const noexcept           { return x + w / 2.0; }
    double centreY() const noexcept           { return y + h / 2.0; }
    bool operator== (const Box&) const = default;
};

inline Box unite (const Box& a, const Box& b)
{
    if (a.empty()) return b;
    if (b.empty()) return a;
    const int l = std::min (a.x, b.x), t = std::min (a.y, b.y);
    return { l, t, std::max (a.right(), b.right()) - l, std::max (a.bottom(), b.bottom()) - t };
}

/** The box grown by pad on every side, then kept inside 0..width, 0..height. */
inline Box inflateWithin (const Box& b, int pad, int width, int height)
{
    const int l = std::max (0, b.x - pad), t = std::max (0, b.y - pad);
    const int r = std::min (width, b.right() + pad), btm = std::min (height, b.bottom() + pad);
    return { l, t, std::max (0, r - l), std::max (0, btm - t) };
}

// --- what the plug-in declares ---------------------------------------------------------------

/** VST3's ParameterInfo flags, the ones the scan reads (ivsteditcontroller.h). */
enum ParamFlags : std::uint32_t
{
    kCanAutomate     = 1u << 0,
    kIsReadOnly      = 1u << 1,
    kIsWrapAround    = 1u << 2,
    kIsList          = 1u << 3,
    kIsHidden        = 1u << 4,
    kIsProgramChange = 1u << 15,
    kIsBypass        = 1u << 16,
};

constexpr std::int32_t kRootUnitId = 0;
constexpr std::int32_t kNoParentUnitId = -1;

struct Param
{
    std::uint32_t id = 0;
    std::string title, shortTitle, units;
    int stepCount = 0;                 // 0 continuous, 1 on/off, n: n + 1 positions
    double defaultValue = 0.0;         // normalised
    std::int32_t unitId = kRootUnitId;
    std::uint32_t flags = 0;
};

struct Unit
{
    std::int32_t id = kRootUnitId;
    std::int32_t parentId = kNoParentUnitId;
    std::string name;
};

/** A parameter a person turns: not read-only, hidden, a program change or a bypass. */
inline bool isControl (const Param& p)
{
    return (p.flags & (kIsReadOnly | kIsHidden | kIsProgramChange | kIsBypass)) == 0;
}

// --- 1. sections -----------------------------------------------------------------------------

enum class Grouping { units, names, order };

inline const char* groupingName (Grouping g)
{
    switch (g)
    {
        case Grouping::units: return "units";
        case Grouping::names: return "names";
        case Grouping::order: return "order";
    }
    return "?";
}

struct Section
{
    std::string name;
    std::vector<std::size_t> members;   // indices into the controls, in the plug-in's order
};

struct Grouped
{
    Grouping how = Grouping::order;
    std::vector<Section> sections;
};

constexpr std::size_t kSplitAbove = 24;      // a name group larger than this splits by its next word
constexpr std::size_t kMaxNameSections = 48; // more than this is not a grouping, it is noise
constexpr std::size_t kKnobsPerPage = 8;

inline std::string lower (std::string s)
{
    for (auto& c : s) c = (char) std::tolower ((unsigned char) c);
    return s;
}

/** A title split into words: on space, '_', '-', ':', '.', '/', with a number kept with the
    word before it, so "Osc 1 Wave" and "OSC1 Wave" both begin with one word. */
inline std::vector<std::string> titleWords (const std::string& title)
{
    std::vector<std::string> raw;
    std::string current;
    for (char c : title)
    {
        if (c == ' ' || c == '_' || c == '-' || c == ':' || c == '.' || c == '/' || c == '\t')
        {
            if (! current.empty()) raw.push_back (current);
            current.clear();
        }
        else
            current += c;
    }
    if (! current.empty()) raw.push_back (current);

    std::vector<std::string> words;
    for (auto& w : raw)
    {
        const bool number = std::all_of (w.begin(), w.end(), [] (char c) { return std::isdigit ((unsigned char) c) != 0; });
        if (number && ! words.empty())
            words.back() += " " + w;
        else
            words.push_back (w);
    }
    return words;
}

namespace detail
{
inline std::string joinWords (const std::vector<std::string>& words, std::size_t count)
{
    std::string s;
    for (std::size_t i = 0; i < std::min (count, words.size()); ++i)
        s += (i ? " " : "") + words[i];
    return s;
}

// Groups members by their first `depth` words; a group above kSplitAbove that its next word
// still divides is split again. Appends to out in order of first appearance.
inline void groupByWords (const std::vector<std::size_t>& members,
                          const std::vector<std::vector<std::string>>& words,
                          std::size_t depth, std::vector<Section>& out)
{
    std::vector<std::string> order;
    std::map<std::string, Section> groups;
    for (auto m : members)
    {
        const auto key = lower (joinWords (words[m], depth));
        auto [it, inserted] = groups.try_emplace (key);
        if (inserted)
        {
            order.push_back (key);
            it->second.name = joinWords (words[m], depth);
        }
        it->second.members.push_back (m);
    }

    for (const auto& key : order)
    {
        auto& g = groups[key];
        if (g.members.size() > kSplitAbove && depth < 4)
        {
            std::map<std::string, int> next;
            for (auto m : g.members) next[lower (joinWords (words[m], depth + 1))]++;
            if (next.size() > 1)
            {
                groupByWords (g.members, words, depth + 1, out);
                continue;
            }
        }
        out.push_back (std::move (g));
    }
}

inline std::vector<Section> byOrder (std::size_t count)
{
    std::vector<Section> out;
    for (std::size_t i = 0; i < count; ++i)
    {
        if (i % kKnobsPerPage == 0)
            out.push_back ({ "Parameters " + std::to_string (i / kKnobsPerPage + 1), {} });
        out.back().members.push_back (i);
    }
    return out;
}
} // namespace detail

/** The plug-in's sections: its units when the controls sit in two or more, else its parameter
    names, else its own order 8 at a time. `controls` are the parameters isControl() kept, in the
    plug-in's order. */
inline Grouped groupSections (const std::vector<Param>& controls, const std::vector<Unit>& units)
{
    Grouped result;
    if (controls.empty())
        return result;

    // Units.
    {
        std::vector<std::int32_t> order;
        std::map<std::int32_t, std::vector<std::size_t>> byUnit;
        for (std::size_t i = 0; i < controls.size(); ++i)
        {
            auto& v = byUnit[controls[i].unitId];
            if (v.empty()) order.push_back (controls[i].unitId);
            v.push_back (i);
        }

        if (byUnit.size() >= 2)
        {
            std::map<std::int32_t, const Unit*> known;
            for (const auto& u : units) known[u.id] = &u;

            const auto nameOf = [&] (std::int32_t id) -> std::string
            {
                const auto it = known.find (id);
                if (it == known.end())
                    return id == kRootUnitId ? "Main" : "Unit " + std::to_string (id);

                const auto& u = *it->second;
                std::string own = u.name.empty() ? (id == kRootUnitId ? "Main" : "Unit " + std::to_string (id)) : u.name;
                if (id == kRootUnitId || u.parentId == kRootUnitId || u.parentId == kNoParentUnitId)
                    return own;
                const auto parent = known.find (u.parentId);
                if (parent == known.end() || parent->second->name.empty())
                    return own;
                return parent->second->name + " / " + own;
            };

            result.how = Grouping::units;
            for (auto id : order)
                result.sections.push_back ({ nameOf (id), byUnit[id] });
            return result;
        }
    }

    // Names.
    {
        std::vector<std::vector<std::string>> words;
        std::vector<std::size_t> all;
        for (std::size_t i = 0; i < controls.size(); ++i)
        {
            words.push_back (titleWords (controls[i].title));
            all.push_back (i);
        }

        std::vector<Section> groups;
        detail::groupByWords (all, words, 1, groups);

        std::vector<Section> kept;
        Section other { "Other", {} };
        for (auto& g : groups)
        {
            if (g.members.size() == 1) other.members.push_back (g.members.front());
            else kept.push_back (std::move (g));
        }
        std::sort (other.members.begin(), other.members.end());
        if (! other.members.empty()) kept.push_back (std::move (other));

        if (kept.size() >= 2 && kept.size() <= kMaxNameSections)
        {
            result.how = Grouping::names;
            result.sections = std::move (kept);
            return result;
        }
    }

    result.how = Grouping::order;
    result.sections = detail::byOrder (controls.size());
    return result;
}

// --- 2a. the finder's answers ------------------------------------------------------------------

/** The parameter the plug-in named at each grid point, or -1. Point (c, r) was asked at
    (c * step + step / 2, r * step + step / 2). */
struct FinderGrid
{
    int step = 4, cols = 0, rows = 0;
    std::vector<std::int64_t> cells;

    FinderGrid() = default;
    FinderGrid (int width, int height, int stepPx)
        : step (stepPx), cols ((width + stepPx - 1) / stepPx), rows ((height + stepPx - 1) / stepPx),
          cells ((std::size_t) cols * (std::size_t) rows, -1) {}

    std::int64_t& at (int c, int r) { return cells[(std::size_t) r * (std::size_t) cols + (std::size_t) c]; }
    std::int64_t at (int c, int r) const { return cells[(std::size_t) r * (std::size_t) cols + (std::size_t) c]; }
};

/** Each parameter's box: the largest 4-connected patch of grid points that named it. */
inline std::map<std::uint32_t, Box> boxesFromFinder (const FinderGrid& grid)
{
    std::map<std::uint32_t, Box> boxes;
    std::map<std::uint32_t, std::size_t> best;
    std::vector<char> seen (grid.cells.size(), 0);
    std::vector<std::pair<int, int>> stack;

    for (int r = 0; r < grid.rows; ++r)
        for (int c = 0; c < grid.cols; ++c)
        {
            const auto id = grid.at (c, r);
            const auto idx = (std::size_t) r * (std::size_t) grid.cols + (std::size_t) c;
            if (id < 0 || seen[idx]) continue;

            int minC = c, maxC = c, minR = r, maxR = r;
            std::size_t count = 0;
            stack.assign (1, { c, r });
            seen[idx] = 1;
            while (! stack.empty())
            {
                auto [cc, rr] = stack.back();
                stack.pop_back();
                ++count;
                minC = std::min (minC, cc); maxC = std::max (maxC, cc);
                minR = std::min (minR, rr); maxR = std::max (maxR, rr);
                const int dc[] { 1, -1, 0, 0 }, dr[] { 0, 0, 1, -1 };
                for (int k = 0; k < 4; ++k)
                {
                    const int nc = cc + dc[k], nr = rr + dr[k];
                    if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
                    const auto nidx = (std::size_t) nr * (std::size_t) grid.cols + (std::size_t) nc;
                    if (seen[nidx] || grid.cells[nidx] != id) continue;
                    seen[nidx] = 1;
                    stack.push_back ({ nc, nr });
                }
            }

            const auto pid = (std::uint32_t) id;
            if (count > best[pid])
            {
                best[pid] = count;
                boxes[pid] = { minC * grid.step, minR * grid.step,
                               (maxC - minC + 1) * grid.step, (maxR - minR + 1) * grid.step };
            }
        }
    return boxes;
}

// --- 2b. watching the plug-in ------------------------------------------------------------------

/** A picture, 0xAARRGGBB per pixel (alpha ignored), rows top to bottom. */
struct Image
{
    int width = 0, height = 0;
    std::vector<std::uint32_t> pixels;

    Image() = default;
    Image (int w, int h, std::uint32_t fill = 0) : width (w), height (h), pixels ((std::size_t) w * (std::size_t) h, fill) {}
    bool valid() const noexcept { return width > 0 && height > 0 && pixels.size() == (std::size_t) width * (std::size_t) height; }
    std::uint32_t& at (int x, int y) { return pixels[(std::size_t) y * (std::size_t) width + (std::size_t) x]; }
    std::uint32_t at (int x, int y) const { return pixels[(std::size_t) y * (std::size_t) width + (std::size_t) x]; }
};

/** True when every pixel has the same colour (or there are none): what a plug-in that ignored
    the capture hands back. */
inline bool isBlank (const Image& image)
{
    if (! image.valid()) return true;
    const auto first = image.pixels.front() & 0xFFFFFFu;
    return std::all_of (image.pixels.begin(), image.pixels.end(), [&] (std::uint32_t p) { return (p & 0xFFFFFFu) == first; });
}

using Mask = std::vector<std::uint8_t>;

constexpr int kChangeThreshold = 24;  // per channel, of 255
constexpr int kJoinDistance = 3;      // changed pixels this close belong to one patch
constexpr int kNoiseGrow = 2;         // the animation mask is widened by this much

/** 1 where any channel differs by more than threshold. Both pictures must be the same size. */
inline Mask changedMask (const Image& a, const Image& b, int threshold = kChangeThreshold)
{
    Mask m (a.pixels.size(), 0);
    if (a.width != b.width || a.height != b.height) return m;
    for (std::size_t i = 0; i < a.pixels.size(); ++i)
    {
        const auto p = a.pixels[i], q = b.pixels[i];
        for (int s = 0; s < 24; s += 8)
        {
            const int d = (int) ((p >> s) & 0xFF) - (int) ((q >> s) & 0xFF);
            if (d > threshold || -d > threshold) { m[i] = 1; break; }
        }
    }
    return m;
}

/** Every set pixel widened to a (2r + 1) square. */
inline Mask grow (const Mask& m, int width, int height, int radius)
{
    if (radius <= 0) return m;
    Mask horizontal (m.size(), 0), out (m.size(), 0);
    for (int y = 0; y < height; ++y)
    {
        int last = -1000000;
        for (int x = 0; x < width; ++x)
            if (m[(std::size_t) y * width + x]) last = x;
            else if (x - last <= radius) horizontal[(std::size_t) y * width + x] = 1;
        int nextSet = 1000000;
        for (int x = width - 1; x >= 0; --x)
        {
            if (m[(std::size_t) y * width + x]) { nextSet = x; horizontal[(std::size_t) y * width + x] = 1; }
            else if (nextSet - x <= radius) horizontal[(std::size_t) y * width + x] = 1;
        }
    }
    for (int x = 0; x < width; ++x)
    {
        int last = -1000000;
        for (int y = 0; y < height; ++y)
            if (horizontal[(std::size_t) y * width + x]) { last = y; out[(std::size_t) y * width + x] = 1; }
            else if (y - last <= radius) out[(std::size_t) y * width + x] = 1;
        int nextSet = 1000000;
        for (int y = height - 1; y >= 0; --y)
            if (horizontal[(std::size_t) y * width + x]) nextSet = y;
            else if (nextSet - y <= radius) out[(std::size_t) y * width + x] = 1;
    }
    return out;
}

/** m with every pixel of noise cleared. */
inline Mask without (Mask m, const Mask& noise)
{
    for (std::size_t i = 0; i < m.size() && i < noise.size(); ++i)
        if (noise[i]) m[i] = 0;
    return m;
}

inline void addInto (Mask& into, const Mask& m)
{
    if (into.size() < m.size()) into.resize (m.size(), 0);
    for (std::size_t i = 0; i < m.size(); ++i)
        if (m[i]) into[i] = 1;
}

struct Patch
{
    std::size_t count = 0;   // set pixels in it
    Box box;                 // their extent (not the joining's)
};

/** The patches of set pixels, joining pixels within joinDistance of each other. */
inline std::vector<Patch> findPatches (const Mask& m, int width, int height, int joinDistance = kJoinDistance)
{
    const auto joined = grow (m, width, height, joinDistance);
    std::vector<int> label (m.size(), -1);
    struct Extent { std::size_t count = 0; int minX = 1 << 30, minY = 1 << 30, maxX = -1, maxY = -1; };
    std::vector<Extent> extents;
    std::vector<std::size_t> stack;

    for (std::size_t start = 0; start < m.size(); ++start)
    {
        if (! joined[start] || label[start] >= 0) continue;
        const int id = (int) extents.size();
        extents.push_back ({});
        auto& e = extents.back();
        stack.assign (1, start);
        label[start] = id;
        while (! stack.empty())
        {
            const auto i = stack.back();
            stack.pop_back();
            const int x = (int) (i % (std::size_t) width), y = (int) (i / (std::size_t) width);
            if (m[i])
            {
                ++e.count;
                e.minX = std::min (e.minX, x); e.maxX = std::max (e.maxX, x);
                e.minY = std::min (e.minY, y); e.maxY = std::max (e.maxY, y);
            }
            const int dx[] { 1, -1, 0, 0 }, dy[] { 0, 0, 1, -1 };
            for (int k = 0; k < 4; ++k)
            {
                const int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const auto n = (std::size_t) ny * (std::size_t) width + (std::size_t) nx;
                if (! joined[n] || label[n] >= 0) continue;
                label[n] = id;
                stack.push_back (n);
            }
        }
    }

    std::vector<Patch> out;
    for (const auto& e : extents)
        if (e.count > 0)
            out.push_back ({ e.count, { e.minX, e.minY, e.maxX - e.minX + 1, e.maxY - e.minY + 1 } });
    return out;
}

/** The noise mask: every patch's whole box filled, so an animated scope is masked as an area,
    not pixel by pixel (its next frame lights other pixels of the same area). */
inline Mask fillPatchBoxes (const Mask& m, int width, int height, int joinDistance = kJoinDistance)
{
    Mask out (m.size(), 0);
    for (const auto& p : findPatches (m, width, height, joinDistance))
        for (int y = p.box.y; y < p.box.bottom(); ++y)
            for (int x = p.box.x; x < p.box.right(); ++x)
                out[(std::size_t) y * (std::size_t) width + (std::size_t) x] = 1;
    return grow (out, width, height, kNoiseGrow);
}

namespace detail
{
// How much two ranges overlap, as a share of the shorter one.
inline double overlapShare (int a0, int a1, int b0, int b1)
{
    const int o = std::min (a1, b1) - std::max (a0, b0);
    const int shorter = std::min (a1 - a0, b1 - b0);
    return shorter <= 0 ? 0.0 : std::max (0, o) / (double) shorter;
}

inline int gapBetween (int a0, int a1, int b0, int b1)
{
    return std::max (0, std::max (a0, b0) - std::min (a1, b1));
}
} // namespace detail

/** One control's box from the patches its parameter changed: the largest, plus every patch in
    line with it (sharing at least half its column or row) and no further off than twice its
    longer side. That joins a fader's cap at both ends of its travel, or a selector's lit
    segments, and leaves out a display elsewhere that also redrew. */
inline std::optional<Box> controlBox (std::vector<Patch> patches)
{
    if (patches.empty()) return std::nullopt;
    std::stable_sort (patches.begin(), patches.end(), [] (const Patch& a, const Patch& b) { return a.count > b.count; });
    Box box = patches.front().box;
    std::vector<char> used (patches.size(), 0);
    used[0] = 1;

    for (bool grew = true; grew; )
    {
        grew = false;
        for (std::size_t i = 1; i < patches.size(); ++i)
        {
            if (used[i]) continue;
            const auto& b = patches[i].box;
            const int reach = 2 * std::max (box.w, box.h);
            const bool column = detail::overlapShare (box.x, box.right(), b.x, b.right()) >= 0.5
                             && detail::gapBetween (box.y, box.bottom(), b.y, b.bottom()) <= reach;
            const bool row = detail::overlapShare (box.y, box.bottom(), b.y, b.bottom()) >= 0.5
                          && detail::gapBetween (box.x, box.right(), b.x, b.right()) <= reach;
            if (column || row)
            {
                box = unite (box, b);
                used[i] = 1;
                grew = true;
            }
        }
    }
    return box;
}

enum class DiffResult { placed, nothing, tooWide };

inline const char* diffResultName (DiffResult r)
{
    switch (r)
    {
        case DiffResult::placed:  return "placed";
        case DiffResult::nothing: return "nothing changed";
        case DiffResult::tooWide: return "too wide";
    }
    return "?";
}

struct DiffOutcome
{
    DiffResult result = DiffResult::nothing;
    Box box;
};

/** What one parameter's changed pixels (the animation mask already taken out) say. A box over a
    quarter of the editor is a redraw of something bigger than one control. */
inline DiffOutcome classifyDiff (const Mask& changed, int width, int height)
{
    const auto box = controlBox (findPatches (changed, width, height));
    if (! box) return { DiffResult::nothing, {} };
    if (box->area() * 4 > (long long) width * height) return { DiffResult::tooWide, *box };
    return { DiffResult::placed, *box };
}

/** The values a parameter is moved to: the end of its range furthest from where it is, the
    other end, then the middle. Both ends show a fader's cap at either end of its travel; the
    middle puts a pointer knob's pointer straight up, so the three pointers span the knob. */
inline std::array<double, 3> probeValues (double current)
{
    return current < 0.5 ? std::array<double, 3> { 1.0, 0.0, 0.5 } : std::array<double, 3> { 0.0, 1.0, 0.5 };
}

/** A knob found by watching is the area its pointer swept, which is narrower than the knob and
    off its centre by a little: the square on its longer side, same centre, kept inside the
    editor, is closer to the knob itself. */
inline Box squareAround (const Box& b, int width, int height)
{
    const int side = std::max (b.w, b.h);
    Box sq { b.x + (b.w - side) / 2, b.y + (b.h - side) / 2, side, side };
    sq.x = std::clamp (sq.x, 0, std::max (0, width - side));
    sq.y = std::clamp (sq.y, 0, std::max (0, height - side));
    return { sq.x, sq.y, std::min (side, width), std::min (side, height) };
}

// --- 3. overlays -------------------------------------------------------------------------------

enum class Overlay { knob, vfader, hfader, button, selector };

inline const char* overlayName (Overlay o)
{
    switch (o)
    {
        case Overlay::knob:     return "knob";
        case Overlay::vfader:   return "vfader";
        case Overlay::hfader:   return "hfader";
        case Overlay::button:   return "button";
        case Overlay::selector: return "selector";
    }
    return "?";
}

inline Overlay overlayFor (const Param& p, const std::optional<Box>& box)
{
    if (p.stepCount == 1) return Overlay::button;
    if (p.stepCount >= 2) return Overlay::selector;
    if (box && ! box->empty())
    {
        if (box->h * 10 >= box->w * 22) return Overlay::vfader;
        if (box->w * 10 >= box->h * 22) return Overlay::hfader;
    }
    return Overlay::knob;
}

/** A knob's own colours, read off the scan's picture, so the keyboard page can paint over the
    plug-in's pointer (frozen in the picture where it was when the scan took it) and draw one of
    its own at the live value. `cap` is the middle, by brightness, of eight samples a quarter of
    the knob's side out from its centre: the pointer covers at most one or two of them, so it
    cannot win. `pointer` is the pixel within 0.4 of the side that differs most from the cap
    (bright on a dark cap, dark on a light one). The page paints a disc of 0.44 of the side in
    `cap`. Nothing for a box under 8 px or outside the picture. */
struct KnobColours
{
    std::uint32_t cap = 0, pointer = 0;   // 0xRRGGBB
};

inline std::optional<KnobColours> knobColours (const Image& image, const Box& box)
{
    const int side = std::min (box.w, box.h);
    if (! image.valid() || side < 8 || box.x < 0 || box.y < 0 || box.right() > image.width || box.bottom() > image.height)
        return std::nullopt;
    const double cx = box.x + box.w / 2.0, cy = box.y + box.h / 2.0;
    const auto rgb = [&] (int x, int y) { return image.at (std::clamp (x, 0, image.width - 1), std::clamp (y, 0, image.height - 1)) & 0xFFFFFFu; };
    const auto sum = [] (std::uint32_t c) { return (int) ((c >> 16) & 0xFF) + (int) ((c >> 8) & 0xFF) + (int) (c & 0xFF); };

    std::array<std::uint32_t, 8> samples {};
    const double r = side / 4.0;
    for (int k = 0; k < 8; ++k)
    {
        const double a = k * 3.14159265358979323846 / 4.0;
        samples[(std::size_t) k] = rgb ((int) std::lround (cx + r * std::cos (a)), (int) std::lround (cy + r * std::sin (a)));
    }
    std::stable_sort (samples.begin(), samples.end(), [&] (auto a, auto b) { return sum (a) < sum (b); });
    KnobColours out;
    out.cap = samples[4];

    const auto distance = [&] (std::uint32_t c)
    {
        int d = 0;
        for (int s = 0; s < 24; s += 8) d += std::abs ((int) ((c >> s) & 0xFF) - (int) ((out.cap >> s) & 0xFF));
        return d;
    };
    const double reach = side * 0.4;
    int best = -1;
    for (int y = (int) std::floor (cy - reach); y <= (int) std::ceil (cy + reach); ++y)
        for (int x = (int) std::floor (cx - reach); x <= (int) std::ceil (cx + reach); ++x)
        {
            const double dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            if (dx * dx + dy * dy > reach * reach) continue;
            const auto c = rgb (x, y);
            if (const int d = distance (c); d > best) { best = d; out.pointer = c; }
        }
    return out;
}

inline std::string jsonColour (std::uint32_t rgb)
{
    char text[8];
    std::snprintf (text, sizeof text, "#%06X", (unsigned) (rgb & 0xFFFFFFu));
    return std::string ("\"") + text + "\"";
}

// --- 4. pages ------------------------------------------------------------------------------------

struct Page
{
    std::vector<std::size_t> members;   // control indices, knob 1 first
    std::optional<Box> box;             // the picture; none when no member is placed
};

constexpr int kPagePad = 8;

/** A section's members in reading order: placed ones by rows (top to bottom, a box joins the
    current row when at least half its height, or the row's, overlaps the row), left to right, then the unplaced in the plug-in's
    order. boxes is indexed by control index. */
inline std::vector<std::size_t> readingOrder (const std::vector<std::size_t>& members,
                                              const std::vector<std::optional<Box>>& boxes)
{
    std::vector<std::size_t> placed, unplaced;
    for (auto m : members)
        (m < boxes.size() && boxes[m] ? placed : unplaced).push_back (m);

    std::stable_sort (placed.begin(), placed.end(), [&] (auto a, auto b) { return boxes[a]->centreY() < boxes[b]->centreY(); });

    std::vector<std::vector<std::size_t>> rows;
    int rowTop = 0, rowBottom = 0;   // the current row's vertical extent
    for (auto m : placed)
    {
        const auto& b = *boxes[m];
        if (! rows.empty() && detail::overlapShare (rowTop, rowBottom, b.y, b.bottom()) >= 0.5)
        {
            rows.back().push_back (m);
            rowTop = std::min (rowTop, b.y);
            rowBottom = std::max (rowBottom, b.bottom());
            continue;
        }
        rows.push_back ({ m });
        rowTop = b.y;
        rowBottom = b.bottom();
    }

    std::vector<std::size_t> out;
    for (auto& row : rows)
    {
        std::stable_sort (row.begin(), row.end(), [&] (auto a, auto b) { return boxes[a]->centreX() < boxes[b]->centreX(); });
        out.insert (out.end(), row.begin(), row.end());
    }
    out.insert (out.end(), unplaced.begin(), unplaced.end());
    return out;
}

inline std::vector<Page> layoutPages (const std::vector<std::size_t>& members,
                                      const std::vector<std::optional<Box>>& boxes,
                                      int editorWidth, int editorHeight)
{
    const auto ordered = readingOrder (members, boxes);
    std::vector<Page> pages;
    for (std::size_t i = 0; i < ordered.size(); ++i)
    {
        if (i % kKnobsPerPage == 0) pages.push_back ({});
        pages.back().members.push_back (ordered[i]);
    }
    for (auto& page : pages)
    {
        Box all;
        for (auto m : page.members)
            if (m < boxes.size() && boxes[m]) all = unite (all, *boxes[m]);
        if (! all.empty())
            page.box = inflateWithin (all, kPagePad, editorWidth, editorHeight);
    }
    return pages;
}

// The keyboard's screen, and where a page's picture goes on it.
constexpr int kScreenWidth = 480, kScreenHeight = 272;
constexpr int kTitleHeight = 24, kStripHeight = 40;
constexpr double kMaxEnlarge = 2.0;

struct Fit
{
    double scale = 1.0;
    Box at;   // where the picture lands
};

/** src scaled to fit inside area with its aspect kept, never enlarged more than kMaxEnlarge,
    centred. */
inline Fit fitInto (int srcWidth, int srcHeight, const Box& area)
{
    if (srcWidth <= 0 || srcHeight <= 0 || area.empty()) return { 0.0, {} };
    double s = std::min ((double) area.w / srcWidth, (double) area.h / srcHeight);
    s = std::min (s, kMaxEnlarge);
    const int w = std::max (1, (int) (srcWidth * s + 0.5)), h = std::max (1, (int) (srcHeight * s + 0.5));
    return { s, { area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h } };
}

/** The picture area of a keyboard page: under the title bar, above the strip when there are
    unplaced controls. */
inline Box pictureArea (bool hasUnplaced)
{
    return { 0, kTitleHeight, kScreenWidth, kScreenHeight - kTitleHeight - (hasUnplaced ? kStripHeight : 0) };
}

// --- output ------------------------------------------------------------------------------------

inline std::string jsonString (const std::string& s)
{
    std::string out = "\"";
    for (unsigned char c : s)
    {
        switch (c)
        {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) { char buf[8]; std::snprintf (buf, sizeof buf, "\\u%04x", c); out += buf; }
                else out += (char) c;
        }
    }
    return out + "\"";
}

inline std::string jsonBox (const Box& b)
{
    return "[" + std::to_string (b.x) + ", " + std::to_string (b.y) + ", " + std::to_string (b.w) + ", " + std::to_string (b.h) + "]";
}

/** A name fit for a file: letters, digits, space, '-', '_' and '.' kept, the rest dropped. */
inline std::string fileSafe (const std::string& s)
{
    std::string out;
    for (unsigned char c : s)
        if (std::isalnum (c) || c == ' ' || c == '-' || c == '_' || c == '.') out += (char) c;
    while (! out.empty() && (out.back() == ' ' || out.back() == '.')) out.pop_back();
    return out.empty() ? "unnamed" : out;
}

namespace detail
{
inline std::uint32_t crc32 (const std::uint8_t* data, std::size_t size, std::uint32_t crc = 0)
{
    static const auto table = []
    {
        std::array<std::uint32_t, 256> t {};
        for (std::uint32_t n = 0; n < 256; ++n)
        {
            std::uint32_t c = n;
            for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            t[n] = c;
        }
        return t;
    }();
    crc = ~crc;
    for (std::size_t i = 0; i < size; ++i) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    return ~crc;
}

inline void put32 (std::vector<std::uint8_t>& out, std::uint32_t v)
{
    out.push_back ((std::uint8_t) (v >> 24)); out.push_back ((std::uint8_t) (v >> 16));
    out.push_back ((std::uint8_t) (v >> 8));  out.push_back ((std::uint8_t) v);
}

inline void chunk (std::vector<std::uint8_t>& out, const char* type, const std::vector<std::uint8_t>& data)
{
    put32 (out, (std::uint32_t) data.size());
    const auto start = out.size();
    out.insert (out.end(), type, type + 4);
    out.insert (out.end(), data.begin(), data.end());
    put32 (out, crc32 (out.data() + start, out.size() - start));
}
} // namespace detail

/** The picture as an RGB PNG. Deflate's stored blocks: no compression, nothing to get wrong, and
    a 1000 × 700 editor is 2 MB, which is fine for a lab tool. */
inline std::vector<std::uint8_t> encodePng (const Image& image)
{
    std::vector<std::uint8_t> out { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
    if (! image.valid()) return {};

    std::vector<std::uint8_t> ihdr;
    detail::put32 (ihdr, (std::uint32_t) image.width);
    detail::put32 (ihdr, (std::uint32_t) image.height);
    ihdr.insert (ihdr.end(), { 8, 2, 0, 0, 0 });   // 8-bit, RGB, deflate, no filter set, no interlace
    detail::chunk (out, "IHDR", ihdr);

    std::vector<std::uint8_t> raw;
    raw.reserve ((std::size_t) image.height * ((std::size_t) image.width * 3 + 1));
    for (int y = 0; y < image.height; ++y)
    {
        raw.push_back (0);   // filter: none
        for (int x = 0; x < image.width; ++x)
        {
            const auto p = image.at (x, y);
            raw.push_back ((std::uint8_t) (p >> 16)); raw.push_back ((std::uint8_t) (p >> 8)); raw.push_back ((std::uint8_t) p);
        }
    }

    std::vector<std::uint8_t> z { 0x78, 0x01 };
    std::uint32_t a = 1, b = 0;
    for (auto v : raw) { a = (a + v) % 65521; b = (b + a) % 65521; }
    for (std::size_t pos = 0; pos < raw.size() || raw.empty(); )
    {
        const auto n = std::min<std::size_t> (65535, raw.size() - pos);
        const bool last = pos + n >= raw.size();
        z.push_back (last ? 1 : 0);
        z.push_back ((std::uint8_t) n); z.push_back ((std::uint8_t) (n >> 8));
        z.push_back ((std::uint8_t) ~n); z.push_back ((std::uint8_t) (~n >> 8));
        z.insert (z.end(), raw.begin() + (std::ptrdiff_t) pos, raw.begin() + (std::ptrdiff_t) (pos + n));
        pos += n;
        if (last) break;
    }
    detail::put32 (z, (b << 16) | a);
    detail::chunk (out, "IDAT", z);
    detail::chunk (out, "IEND", {});
    return out;
}

} // namespace ceditor::ctrl49::panelscan
