// Ctrl49PanelScanTests — the panel scan's logic (Ctrl49PanelScan.h), where no plug-in and no
// window are needed: sections from units and from names, the finder's boxes, the diff's patches
// and the animation mask, the overlay kinds, reading order and pages, the fit on the keyboard's
// screen, and the PNG the tool writes. docs/design/ctrl49-panel-scan.md is the spec.

#include "ControlSurface/Ctrl49PanelScan.h"
#include "ControlSurface/Ctrl49PanelScanFixture.h"

#include <iostream>
#include <string>

namespace
{
namespace scan = ceditor::ctrl49::panelscan;

int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

scan::Param param (std::uint32_t id, const std::string& title, std::int32_t unit = 0, int steps = 0, std::uint32_t flags = 0)
{
    scan::Param p;
    p.id = id; p.title = title; p.unitId = unit; p.stepCount = steps; p.flags = flags;
    return p;
}

std::vector<std::string> names (const scan::Grouped& g)
{
    std::vector<std::string> out;
    for (auto& s : g.sections) out.push_back (s.name);
    return out;
}

void fillRect (scan::Image& img, int x, int y, int w, int h, std::uint32_t c)
{
    for (int yy = y; yy < y + h; ++yy)
        for (int xx = x; xx < x + w; ++xx)
            img.at (xx, yy) = c;
}
} // namespace

int main()
{
    std::cout << "CTRL49 panel scan" << std::endl;

    {   // --- words -------------------------------------------------------------------------
        const auto w = scan::titleWords ("Osc 1 Wave");
        check (w.size() == 2 && w[0] == "Osc 1" && w[1] == "Wave", "a number stays with the word before it");
        const auto v = scan::titleWords ("OSC1_Wave");
        check (v.size() == 2 && v[0] == "OSC1", "underscore splits, OSC1 is one word");
        check (scan::titleWords ("Env.Attack:Time").size() == 3, "'.' and ':' split");
        check (scan::titleWords ("  ").empty(), "nothing but separators is no words");
        check (scan::titleWords ("1 Cutoff").front() == "1", "a leading number is a word of its own");
    }

    {   // --- what counts as a control ------------------------------------------------------
        check (scan::isControl (param (1, "Cutoff")), "an ordinary parameter is a control");
        check (! scan::isControl (param (1, "Meter", 0, 0, scan::kIsReadOnly)), "read-only is not");
        check (! scan::isControl (param (1, "x", 0, 0, scan::kIsHidden)), "hidden is not");
        check (! scan::isControl (param (1, "Program", 0, 0, scan::kIsProgramChange)), "program change is not");
        check (! scan::isControl (param (1, "Bypass", 0, 1, scan::kIsBypass)), "bypass is not");
    }

    {   // --- sections from units ----------------------------------------------------------
        std::vector<scan::Param> controls { param (1, "a", 1), param (2, "b", 1), param (3, "c", 4),
                                            param (4, "d", 2), param (5, "e", 0), param (6, "f", 9) };
        std::vector<scan::Unit> units { { 0, -1, "Root" }, { 1, 0, "Osc" }, { 2, 0, "Filter" },
                                        { 3, 0, "Amp" }, { 4, 3, "Env" } };
        const auto g = scan::groupSections (controls, units);
        check (g.how == scan::Grouping::units, "two or more units: units decide");
        check ((names (g) == std::vector<std::string> { "Osc", "Amp / Env", "Filter", "Root", "Unit 9" }),
               "in order of first appearance; a nested unit is Parent / Child; root keeps its name; an unknown unit is Unit n");
        check (g.sections[0].members == std::vector<std::size_t> { 0, 1 }, "members are control indices, in order");

        std::vector<scan::Unit> noRootName { { 1, 0, "Osc" } };
        const auto h = scan::groupSections ({ param (1, "a", 0), param (2, "b", 1) }, noRootName);
        check (h.sections[0].name == "Main", "the root unit without a name is Main");
    }

    {   // --- sections from names ----------------------------------------------------------
        std::vector<scan::Param> controls { param (1, "Filter Cutoff"), param (2, "Osc 1 Wave"), param (3, "Filter Reso"),
                                            param (4, "OSC 1 Pitch"), param (5, "Volume"), param (6, "Pan") };
        const auto g = scan::groupSections (controls, { { 0, -1, "Root" } });
        check (g.how == scan::Grouping::names, "every control in the root unit: names decide");
        check ((names (g) == std::vector<std::string> { "Filter", "Osc 1", "Other" }),
               "first words group, any case; groups of one go to Other, last");
        check ((g.sections[2].members == std::vector<std::size_t> { 4, 5 }), "Other keeps the plug-in's order");

        // Surge-style: everything starts with the scene letter, so the big group splits again.
        std::vector<scan::Param> surge;
        for (int i = 0; i < 20; ++i) surge.push_back (param ((std::uint32_t) i, "A Osc 1 P" + std::to_string (i)));
        for (int i = 0; i < 20; ++i) surge.push_back (param ((std::uint32_t) (100 + i), "A Filter 1 P" + std::to_string (i)));
        const auto s = scan::groupSections (surge, {});
        check ((names (s) == std::vector<std::string> { "A Osc 1", "A Filter 1" }),
               "a group of more than 24 splits by its next word");

        // A group of 30 that the next word cannot divide stays one.
        std::vector<scan::Param> flat;
        for (int i = 0; i < 30; ++i) flat.push_back (param ((std::uint32_t) i, "Macro"));
        flat.push_back (param (99, "Gain X")); flat.push_back (param (98, "Gain Y"));
        const auto f = scan::groupSections (flat, {});
        check (f.how == scan::Grouping::names && f.sections.size() == 2 && f.sections[0].members.size() == 30,
               "a big group the next word cannot divide stays whole");
    }

    {   // --- sections by order -------------------------------------------------------------
        std::vector<scan::Param> controls;
        for (int i = 0; i < 19; ++i) controls.push_back (param ((std::uint32_t) i, "P" + std::to_string (i)));
        const auto g = scan::groupSections (controls, {});
        check (g.how == scan::Grouping::order, "names that never repeat: the plug-in's order");
        check ((names (g) == std::vector<std::string> { "Parameters 1", "Parameters 2", "Parameters 3" })
               && g.sections[2].members.size() == 3, "8 at a time");
        check (scan::groupSections ({}, {}).sections.empty(), "no controls, no sections");
    }

    {   // --- the finder's boxes ------------------------------------------------------------
        scan::FinderGrid grid (40, 40, 4);   // 10 x 10 cells
        for (int r = 1; r <= 3; ++r) for (int c = 1; c <= 4; ++c) grid.at (c, r) = 7;   // the knob
        grid.at (9, 9) = 7;                                                              // a display naming it too
        grid.at (6, 6) = 8;
        const auto boxes = scan::boxesFromFinder (grid);
        check (boxes.at (7) == (scan::Box { 4, 4, 16, 12 }), "the largest patch, in pixels, cells widened to the step");
        check (boxes.at (8) == (scan::Box { 24, 24, 4, 4 }), "a single point is one cell");
        check (boxes.size() == 2, "nothing for parameters never named");
    }

    {   // --- the diff ------------------------------------------------------------------------
        const int W = 200, H = 100;
        scan::Image before (W, H, 0x202020), after (W, H, 0x202020);
        fillRect (after, 10, 10, 6, 6, 0xFFFFFF);    // the knob's pointer
        fillRect (after, 18, 12, 4, 4, 0xFFFFFF);    // 2 px away: the same patch
        fillRect (after, 150, 80, 3, 3, 0xFFFFFF);   // far away and off-line: a display elsewhere
        const auto changed = scan::changedMask (before, after);
        const auto patches = scan::findPatches (changed, W, H);
        check (patches.size() == 2, "pixels within 3 px are one patch");
        const auto d = scan::classifyDiff (changed, W, H);
        check (d.result == scan::DiffResult::placed && d.box == (scan::Box { 10, 10, 12, 6 }),
               "the control is the largest patch; an off-line patch elsewhere is not joined");

        // A fader's cap at three places in one column joins into the whole travel.
        scan::Image fader (W, H, 0x202020);
        fillRect (fader, 100, 10, 12, 6, 0xFFFFFF);
        fillRect (fader, 100, 40, 12, 6, 0xFFFFFF);
        fillRect (fader, 100, 70, 12, 6, 0xFFFFFF);
        const auto f = scan::classifyDiff (scan::changedMask (before, fader), W, H);
        check (f.box == (scan::Box { 100, 10, 12, 66 }), "patches in one column join: a fader's whole travel");

        // Small differences are not changes.
        scan::Image dim (W, H, 0x202020 + 0x101010);
        check (scan::findPatches (scan::changedMask (before, dim), W, H).empty(), "a change of 16 per channel is below the threshold");

        // The animation mask: what moved with nothing touched is masked as an area.
        scan::Image frameA (W, H, 0x202020), frameB (W, H, 0x202020);
        fillRect (frameA, 120, 10, 2, 2, 0x00FF00);
        fillRect (frameB, 170, 50, 2, 2, 0x00FF00);
        const auto noise = scan::fillPatchBoxes (scan::changedMask (frameA, frameB), W, H, 60);
        scan::Image withScope = after;
        fillRect (withScope, 140, 30, 3, 3, 0x00FF00);   // another frame of the scope, between the two
        const auto masked = scan::without (scan::changedMask (before, withScope), noise);
        check (scan::classifyDiff (masked, W, H).box == (scan::Box { 10, 10, 12, 6 }),
               "the scope's next frame, inside the masked area, is not taken for the control");

        scan::Image wide (W, H, 0x202020);
        fillRect (wide, 0, 0, 120, 60, 0xFFFFFF);
        check (scan::classifyDiff (scan::changedMask (before, wide), W, H).result == scan::DiffResult::tooWide,
               "a box over a quarter of the editor is too wide");
        check (scan::classifyDiff (scan::changedMask (before, before), W, H).result == scan::DiffResult::nothing,
               "no change, nothing placed");

        check ((scan::probeValues (0.2) == std::array<double, 3> { 1.0, 0.0, 0.5 }), "from below the middle: the top first, then the bottom, then the middle");
        check ((scan::probeValues (0.5) == std::array<double, 3> { 0.0, 1.0, 0.5 }), "from the middle up: the bottom first");

        check (scan::squareAround ({ 10, 20, 30, 10 }, 100, 100) == (scan::Box { 10, 10, 30, 30 }), "a swept area becomes the square on its longer side, same centre");
        check (scan::squareAround ({ 0, 0, 10, 30 }, 100, 100) == (scan::Box { 0, 0, 30, 30 }), "kept inside the editor at the edge");
    }

    {   // --- blank pictures ---------------------------------------------------------------
        scan::Image black (10, 10, 0xFF000000);
        check (scan::isBlank (black), "one colour is blank");
        black.at (3, 3) = 0x010101;
        check (! scan::isBlank (black), "one pixel different is not");
        scan::Image alphaOnly (2, 1, 0x00000000);
        alphaOnly.at (1, 0) = 0xFF000000;
        check (scan::isBlank (alphaOnly), "alpha does not count");
        check (scan::isBlank ({}), "no picture is blank");
    }

    {   // --- overlays ---------------------------------------------------------------------------
        check (scan::overlayFor (param (1, "x", 0, 1), scan::Box { 0, 0, 10, 100 }) == scan::Overlay::button, "one step: a button, whatever its shape");
        check (scan::overlayFor (param (1, "x", 0, 3), std::nullopt) == scan::Overlay::selector, "more steps: a selector");
        check (scan::overlayFor (param (1, "x"), scan::Box { 0, 0, 20, 44 }) == scan::Overlay::vfader, "tall (2.2x): a vertical fader");
        check (scan::overlayFor (param (1, "x"), scan::Box { 0, 0, 20, 43 }) == scan::Overlay::knob, "just under 2.2x: a knob");
        check (scan::overlayFor (param (1, "x"), scan::Box { 0, 0, 66, 30 }) == scan::Overlay::hfader, "wide: a horizontal fader");
        check (scan::overlayFor (param (1, "x"), std::nullopt) == scan::Overlay::knob, "unplaced and continuous: a knob");
    }

    {   // --- reading order and pages ---------------------------------------------------------
        std::vector<std::optional<scan::Box>> boxes {
            scan::Box { 200, 12, 40, 40 },   // 0: top row, right
            scan::Box { 10, 10, 40, 40 },    // 1: top row, left
            scan::Box { 100, 100, 40, 40 },  // 2: second row
            std::nullopt,                    // 3: unplaced
            scan::Box { 120, 25, 40, 40 },   // 4: top row, a little lower but sharing over half its height
            scan::Box { 300, 14, 20, 10 },   // 5: a small one inside the first row's height
        };
        const auto order = scan::readingOrder ({ 0, 1, 2, 3, 4, 5 }, boxes);
        check ((order == std::vector<std::size_t> { 1, 4, 0, 5, 2, 3 }), "rows top to bottom, left to right, unplaced last");

        std::vector<std::optional<scan::Box>> many;
        std::vector<std::size_t> members;
        for (int i = 0; i < 11; ++i) { many.push_back (scan::Box { 10 + i * 50, 10, 40, 40 }); members.push_back ((std::size_t) i); }
        const auto pages = scan::layoutPages (members, many, 555, 300);
        check (pages.size() == 2 && pages[0].members.size() == 8 && pages[1].members.size() == 3, "11 controls: 8 and 3");
        check (pages[0].box == (scan::Box { 2, 2, 406, 56 }), "a page's picture: its controls' box, 8 px wider, kept inside");
        check (pages[1].box == (scan::Box { 402, 2, 153, 56 }), "the last page's box is clipped to the editor's right edge");

        const auto none = scan::layoutPages ({ 0 }, { std::nullopt }, 100, 100);
        check (none.size() == 1 && ! none[0].box, "a page with nothing placed has no picture");
    }

    {   // --- the fit on the keyboard --------------------------------------------------------
        const auto area = scan::pictureArea (false);
        check (area == (scan::Box { 0, 24, 480, 248 }), "under the 24 px title bar");
        check (scan::pictureArea (true).h == 208, "above the 40 px strip when controls are unplaced");

        const auto wide = scan::fitInto (960, 248, area);
        check (wide.scale == 0.5 && wide.at == (scan::Box { 0, 24 + 62, 480, 124 }), "a wide picture: full width, centred");
        const auto small = scan::fitInto (60, 40, area);
        check (small.scale == 2.0 && small.at.w == 120 && small.at.h == 80, "a small one is enlarged at most 2x");
        check (small.at.x == 180 && small.at.y == 24 + 84, "and centred");
    }

    {   // --- output -----------------------------------------------------------------------------
        check (scan::jsonString ("a\"b\\c\n\x01") == "\"a\\\"b\\\\c\\n\\u0001\"", "JSON strings are escaped");
        check (scan::jsonBox ({ 1, 2, 3, 4 }) == "[1, 2, 3, 4]", "a box is [x, y, w, h]");
        check (scan::fileSafe ("Diva: Filter/Amp?") == "Diva FilterAmp", "file names lose what Windows refuses");
        check (scan::fileSafe ("???") == "unnamed", "and are never empty");

        scan::Image img (3, 2, 0x112233);
        img.at (2, 1) = 0xFF0000;
        const auto png = scan::encodePng (img);
        check (png.size() > 8 && png[1] == 'P' && png[2] == 'N' && png[3] == 'G', "a PNG signature");
        const std::uint8_t iend[] { 'I', 'E', 'N', 'D' };
        check (scan::detail::crc32 (iend, 4) == 0xAE426082u, "the CRC is PNG's (IEND's is AE426082)");
        // IHDR: width 3, height 2, 8-bit RGB.
        check (png[16 + 3] == 3 && png[20 + 3] == 2 && png[24] == 8 && png[25] == 2, "IHDR says 3 x 2, 8-bit RGB");
        // The last pixel's bytes sit just before the stored block's Adler-32, then IDAT's CRC.
        const auto idatEnd = png.size() - 12 /* IEND */ - 4 /* CRC */ - 4 /* adler */;
        check (png[idatEnd - 3] == 0xFF && png[idatEnd - 2] == 0 && png[idatEnd - 1] == 0, "pixels are stored R, G, B");
    }

    {   // --- the self-test plug-in's layout is one the scan can read -------------------------
        namespace fx = scan::fixture;
        std::vector<scan::Param> controls;
        std::vector<scan::Unit> units;
        for (auto& u : fx::kUnits) units.push_back ({ u.id, u.parentId, u.name });
        for (auto& c : fx::kControls) controls.push_back (param (c.id, c.title, c.unitId, c.stepCount));
        const auto g = scan::groupSections (controls, units);
        bool same = g.how == scan::Grouping::units && g.sections.size() == fx::kExpectedSections.size();
        for (std::size_t i = 0; same && i < g.sections.size(); ++i)
            same = g.sections[i].name == fx::kExpectedSections[i].name
                && (int) g.sections[i].members.size() == fx::kExpectedSections[i].controls;
        check (same, "the fixture's units give the sections the self-test expects");

        bool kinds = true;
        for (auto& c : fx::kControls)
        {
            std::optional<scan::Box> b;
            if (c.shape != fx::Shape::nowhere) b = scan::Box { c.x, c.y, c.w, c.h };
            kinds = kinds && std::string (scan::overlayName (scan::overlayFor (param (c.id, c.title, c.unitId, c.stepCount), b))) == c.kind;
        }
        check (kinds, "and its drawn shapes give the overlays it expects");

        bool apart = true;
        const scan::Box scope { fx::kScopeX, fx::kScopeY, fx::kScopeW, fx::kScopeH };
        for (auto& c : fx::kControls)
        {
            const scan::Box b { c.x, c.y, c.w, c.h };
            apart = apart && (b.right() <= scope.x || b.x >= scope.right() || b.bottom() <= scope.y || b.y >= scope.bottom());
        }
        check (apart, "no control overlaps the animated scope");
    }

    std::cout << (failures == 0 ? "All passed" : std::to_string (failures) + " failed") << std::endl;
    return failures == 0 ? 0 : 1;
}
