// Ctrl49ScreenLab — the host half of the CTRL49 screen lab (tools/ctrl49/screen-lab).
//
// The lab answers two questions the screen's design has left open since the first knob test:
// how far pre-rendered PNGs can take the look beyond flat rectangles, and how much the device
// can draw before it stutters or its watchdog gives up. Two Lua pages ask them — a showcase
// and a stress test — and this file is everything the host sends them: the payloads, and the
// maths the device cannot do (it has no exp, no sqrt, and no need for either).
//
// Pure std, no I/O, header-only: the Windows tool (Ctrl49ScreenLab.cpp) sends these bytes, the
// portable tests check them, and the browser preview renders the pages from the same bytes, so
// what you see in the preview is what the keyboard is sent.

#pragma once

#include "Ctrl49Protocol.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>

namespace ceditor::ctrl49::lab
{

// --- the showcase ------------------------------------------------------------------------------

inline constexpr int kShowcasePages = 5;   // faders, pads, sequencer, envelope, meters
inline constexpr const char* kShowcasePageNames[kShowcasePages] {
    "FADERS", "PADS", "SEQUENCER", "ENVELOPE", "METERS" };

// The envelope graph's geometry, shared with Hostage_Showcase.lua: 110 columns of 4 px.
inline constexpr int kEnvelopeWidth   = 440;
inline constexpr int kEnvelopeHeight  = 140;
inline constexpr int kEnvelopeColumns = kEnvelopeWidth / 4;
inline constexpr int kEnvelopeTop     = kEnvelopeHeight - 8;   // the peak's height in pixels

inline constexpr int kVuFrames = 48;       // frames in vu_needle.png

/** Everything that moves on the showcase, once a frame:
    [page][frame][e1..e8][lastEncoder][playhead][vuLeft][vuRight][padsLit]. Encoders are
    0..127, lastEncoder 0..7, playhead 0..15, the VU values are needle frames, padsLit has bit
    N set for pad N+1. */
inline Bytes buildShowcaseFrame (int page, int frame, const std::array<int, 8>& encoders,
                                 int lastEncoder, int playhead, int vuLeft, int vuRight,
                                 std::uint8_t padsLit)
{
    Bytes out;
    out.push_back ((std::uint8_t) std::clamp (page, 0, kShowcasePages - 1));
    out.push_back ((std::uint8_t) (frame & 0xFF));
    for (const auto value : encoders)
        out.push_back ((std::uint8_t) std::clamp (value, 0, 127));
    out.push_back ((std::uint8_t) std::clamp (lastEncoder, 0, 7));
    out.push_back ((std::uint8_t) std::clamp (playhead, 0, 15));
    out.push_back ((std::uint8_t) std::clamp (vuLeft, 0, kVuFrames - 1));
    out.push_back ((std::uint8_t) std::clamp (vuRight, 0, kVuFrames - 1));
    out.push_back (padsLit);
    return out;
}

/** An envelope stage time for an encoder value: 1 ms at 0 to 10 s at 127, exponential, the way
    every synth's envelope knob feels. */
inline double envelopeMilliseconds (int value)
{
    return std::pow (10000.0, std::clamp (value, 0, 127) / 127.0);
}

inline std::string envelopeTimeText (int value)
{
    const auto ms = envelopeMilliseconds (value);
    char text[16];
    if (ms < 1000.0)
        std::snprintf (text, sizeof text, "%d ms", (int) std::lround (ms));
    else
        std::snprintf (text, sizeof text, "%.1f s", ms / 1000.0);
    return text;
}

/** The envelope page's picture, computed where exp() exists:
    [110 column heights 0..132][attackCol][decayEndCol][releaseStartCol][sustainHeight]
    then four length-prefixed ASCII readouts (attack, decay, sustain, release).

    Width is proportional to each stage's LOGARITHMIC time, so every knob position moves the
    picture — a linear time axis would squash the first 90% of a knob's travel into a sliver. */
inline Bytes buildEnvelope (int attack, int decay, int sustain, int release)
{
    const auto stageWidth = [] (int value) { return 8.0 + std::clamp (value, 0, 127) * 1.1; };
    auto a = stageWidth (attack), d = stageWidth (decay), r = stageWidth (release);
    const auto room = (double) kEnvelopeWidth - 40.0;           // the sustain keeps 40 px at least
    if (const auto total = a + d + r; total > room)
    {
        a *= room / total; d *= room / total; r *= room / total;
    }
    const auto hold = kEnvelopeWidth - a - d - r;
    const auto level = std::clamp (sustain, 0, 127) / 127.0;

    Bytes out;
    for (int column = 0; column < kEnvelopeColumns; ++column)
    {
        const auto x = column * 4.0;
        double v;
        if (x < a)                  v = 1.0 - std::exp (-4.0 * x / a);
        else if (x < a + d)         v = level + (1.0 - level) * std::exp (-4.0 * (x - a) / d);
        else if (x < a + d + hold)  v = level;
        else                        v = level * std::exp (-4.0 * (x - a - d - hold) / r);
        out.push_back ((std::uint8_t) std::lround (std::clamp (v, 0.0, 1.0) * kEnvelopeTop));
    }
    const auto column = [] (double x) { return (std::uint8_t) std::clamp ((int) std::lround (x / 4.0), 0, kEnvelopeColumns - 1); };
    out.push_back (column (a));
    out.push_back (column (a + d));
    out.push_back (column (a + d + hold));
    out.push_back ((std::uint8_t) std::lround (level * kEnvelopeTop));

    const auto text = [&out] (const std::string& s)
    {
        out.push_back ((std::uint8_t) s.size());
        out.insert (out.end(), s.begin(), s.end());
    };
    text (envelopeTimeText (attack));
    text (envelopeTimeText (decay));
    text (std::to_string ((int) std::lround (level * 100.0)) + " %");
    text (envelopeTimeText (release));
    return out;
}

/** A needle frame for a level 0..1. The scale is a VU's: the needle's travel is not linear in
    amplitude, so the level is mapped through dB (-20 dB at rest, +3 dB at the peg). */
inline int vuFrame (double level)
{
    const auto db = 20.0 * std::log10 (std::max (level, 1.0e-4));
    const auto position = std::clamp ((db + 20.0) / 23.0, 0.0, 1.0);
    return (int) std::lround (position * (kVuFrames - 1));
}

/** Something for the meters to show when the lab has no audio: two channels of pseudo program
    material — a slow swell with a beat on it — deterministic per frame, scaled by gain 0..127. */
inline double demoLevel (int channel, int frame, int gain)
{
    const auto t = frame / 10.0;
    const auto swell = 0.55 + 0.25 * std::sin (t * 0.7 + channel * 0.9);
    const auto beat = (frame % 5 == 0) ? 0.25 : 0.0;
    return std::clamp ((swell + beat) * (std::clamp (gain, 0, 127) / 100.0), 0.0, 1.5);
}

// --- the stress test ---------------------------------------------------------------------------

/** How hard the stress page works, from its encoders. Every quantity is a count per redraw.
    E1 rectangles (x16), E2 sprite blits (x8), E3 text boxes, E4 full-screen image blits (0-7),
    E5 1 MB memory blocks decoded (0-8, and never un-decoded: the device has no free), E6 the
    redraw rate (1-30 per second). E7 and E8 are unused. */
struct StressLoad
{
    int rects = 0;
    int images = 0;
    int texts = 0;
    int fullScreens = 0;
    int memoryBlocks = 0;
    int fps = 10;
};

inline constexpr int kStressMemoryBlocks = 8;

inline StressLoad stressLoad (const std::array<int, 8>& e)
{
    StressLoad load;
    load.rects        = std::clamp (e[0], 0, 127) * 16;
    load.images       = std::clamp (e[1], 0, 127) * 8;
    load.texts        = std::clamp (e[2], 0, 127);
    load.fullScreens  = std::clamp (e[3], 0, 127) / 16;
    load.memoryBlocks = std::clamp (e[4], 0, 127) * kStressMemoryBlocks / 127;
    load.fps          = 1 + std::clamp (e[5], 0, 127) * 29 / 127;
    return load;
}

/** [rects/16][images/8][texts][fullScreens][memoryBlocks][fps][frameHi][frameLo] */
inline Bytes buildStressFrame (const StressLoad& load, int frame)
{
    return { (std::uint8_t) (load.rects / 16), (std::uint8_t) (load.images / 8),
             (std::uint8_t) load.texts, (std::uint8_t) load.fullScreens,
             (std::uint8_t) load.memoryBlocks, (std::uint8_t) load.fps,
             (std::uint8_t) ((frame >> 8) & 0xFF), (std::uint8_t) (frame & 0xFF) };
}

/** One line for the console — what to write down when the screen starts to stutter. */
inline std::string describe (const StressLoad& load)
{
    return std::to_string (load.rects) + " rects, " + std::to_string (load.images) + " sprites, "
         + std::to_string (load.texts) + " texts, " + std::to_string (load.fullScreens)
         + " full-screen blits, " + std::to_string (load.memoryBlocks) + " MB extra decoded, "
         + std::to_string (load.fps) + " redraws/s ("
         + std::to_string ((load.rects + load.images + load.texts + load.fullScreens) * load.fps)
         + " draw calls/s)";
}

} // namespace ceditor::ctrl49::lab
