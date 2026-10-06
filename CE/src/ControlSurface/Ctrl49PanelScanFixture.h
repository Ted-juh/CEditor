#pragma once

// The panel scan's test plug-in (Ctrl49PanelScanFixture.cpp): an editor whose layout is known,
// so `Ctrl49PanelScan selftest` can check what the scan found against what was built. Shared by
// the plug-in, which draws it, and the tool, which checks it. Pure std.

#include <array>
#include <cstdint>

namespace ceditor::ctrl49::panelscan::fixture
{

constexpr int kEditorWidth = 640, kEditorHeight = 400;

enum class Shape { knob, vfader, button, selector, nowhere };

struct Control
{
    std::uint32_t id;
    const char* title;
    std::int32_t unitId;
    int stepCount;
    double value;            // starting, normalised
    Shape shape;
    int x, y, w, h;          // where it is drawn
    bool finder;             // whether the editor's IParameterFinder names it
    const char* kind;        // the overlay the scan should pick
    const char* how;         // and how it should find it
};

struct UnitDef
{
    std::int32_t id, parentId;
    const char* name;
};

inline constexpr std::array<UnitDef, 5> kUnits { {
    { 0, -1, "Root" },
    { 1, 0, "Osc" },
    { 2, 0, "Filter" },
    { 3, 0, "Amp" },
    { 4, 3, "Env" },
} };

inline constexpr std::array<Control, 10> kControls { {
    { 100, "Osc Wave",  1, 3, 0.0,  Shape::selector, 20,  40,  200, 30,  true,  "selector", "finder" },
    { 101, "Osc Pitch", 1, 0, 0.5,  Shape::knob,     240, 30,  60,  60,  true,  "knob",     "finder" },
    { 102, "Osc Sync",  1, 1, 0.0,  Shape::button,   20,  90,  60,  24,  true,  "button",   "finder" },
    { 200, "Cutoff",    2, 0, 0.7,  Shape::knob,     20,  170, 60,  60,  false, "knob",     "diff" },
    { 201, "Resonance", 2, 0, 0.2,  Shape::knob,     100, 170, 60,  60,  false, "knob",     "diff" },
    { 202, "Drive",     2, 0, 0.5,  Shape::vfader,   190, 150, 24,  110, false, "vfader",   "diff" },
    { 300, "Level",     3, 0, 0.8,  Shape::vfader,   580, 40,  24,  140, true,  "vfader",   "finder" },
    { 400, "Attack",    4, 0, 0.1,  Shape::knob,     360, 290, 50,  50,  false, "knob",     "diff" },
    { 401, "Release",   4, 0, 0.6,  Shape::knob,     440, 290, 50,  50,  false, "knob",     "diff" },
    { 500, "Mod Depth", 2, 0, 0.5,  Shape::nowhere,  0,   0,   0,   0,   false, "knob",     "none" },
} };

// Not controls: the scan must leave these out.
constexpr std::uint32_t kMeterId = 900;    // read-only
constexpr std::uint32_t kBypassId = 901;   // bypass

// Animates by itself, every 40 ms: the scan must not take it for any control.
constexpr int kScopeX = 330, kScopeY = 40, kScopeW = 200, kScopeH = 110;

// The sections the scan should find, in order, and how many controls each.
struct ExpectedSection { const char* name; int controls; };
inline constexpr std::array<ExpectedSection, 4> kExpectedSections { {
    { "Osc", 3 }, { "Filter", 4 }, { "Amp", 1 }, { "Amp / Env", 2 },
} };

} // namespace ceditor::ctrl49::panelscan::fixture
