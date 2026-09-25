// Ctrl49ScreenLabTests — what the CTRL49 screen lab sends its two pages (Ctrl49ScreenLab.h).
// No keyboard: the payloads' shapes, the maths the device cannot do, and one golden envelope
// that the browser preview (CE/web/browser-checks/ctrl49ScreenLab.mjs) asserts too, so the
// preview renders exactly the bytes the tool sends.

#include "ControlSurface/Ctrl49ScreenLab.h"

#include <iostream>
#include <string>

namespace
{
namespace lab = ceditor::ctrl49::lab;

int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

// buildEnvelope (32, 64, 80, 40): shared with the browser check. If this changes on purpose,
// change it there too — the two are the proof that preview and hardware get the same bytes.
const ceditor::ctrl49::Bytes kGoldenEnvelope {
    0, 41, 69, 89, 102, 111, 118, 122, 125, 127, 129, 130, 121, 114, 109, 104, 100, 97, 94, 92, 91,
    89, 88, 87, 86, 86, 85, 85, 85, 84, 84, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 61, 45, 33, 24, 18, 13, 10, 7, 5, 4, 3, 2, 11, 30, 97, 83, 5, 49, 48, 32,
    109, 115, 6, 49, 48, 52, 32, 109, 115, 4, 54, 51, 32, 37, 5, 49, 56, 32, 109, 115 };
} // namespace

int main()
{
    std::cout << "CTRL49 screen lab payloads" << std::endl;

    {   // --- the showcase frame ------------------------------------------------------------
        const auto frame = lab::buildShowcaseFrame (2, 300, { 0, 10, 127, 200, -5, 64, 64, 64 },
                                                    3, 7, 12, 99, 0b10000001);
        check (frame.size() == 15, "a showcase frame is 15 bytes");
        check (frame[0] == 2 && frame[1] == (300 & 0xFF), "page, then the frame counter's low byte");
        check (frame[2] == 0 && frame[4] == 127 && frame[5] == 127 && frame[6] == 0,
               "encoders are clamped to 0..127");
        check (frame[10] == 3 && frame[11] == 7, "then the last encoder moved and the playhead");
        check (frame[13] == lab::kVuFrames - 1, "a needle frame past the strip is pinned to its last frame");
        check (frame[14] == 0b10000001, "and the lit pads as a bitmask");
        check (lab::buildShowcaseFrame (9, 0, {}, 0, 0, 0, 0, 0)[0] == lab::kShowcasePages - 1,
               "and a page past the end is the last page");
    }

    {   // --- the envelope ------------------------------------------------------------------
        check (lab::buildEnvelope (32, 64, 80, 40) == kGoldenEnvelope,
               "the envelope for (32, 64, 80, 40) is the golden the browser check also asserts");

        const auto env = lab::buildEnvelope (20, 60, 100, 50);
        bool inRange = true;
        for (int c = 0; c < lab::kEnvelopeColumns; ++c)
            inRange = inRange && env[(std::size_t) c] <= lab::kEnvelopeTop;
        check (inRange, "every column fits the graph");
        const int attackEnd = env[110], decayEnd = env[111], releaseStart = env[112], sustain = env[113];
        check (0 < attackEnd && attackEnd < decayEnd && decayEnd < releaseStart
                 && releaseStart < lab::kEnvelopeColumns,
               "the breakpoints come in order: attack, decay, release");
        bool rising = true;
        for (int c = 1; c < attackEnd; ++c)
            rising = rising && env[(std::size_t) c] >= env[(std::size_t) c - 1];
        check (rising, "the attack only rises");
        check (sustain == (int) std::lround (100 / 127.0 * lab::kEnvelopeTop)
                 && env[(std::size_t) decayEnd + 2] == sustain,
               "the sustain holds at its level");
        check (env[lab::kEnvelopeColumns - 1] < 10, "and the release falls back towards zero");

        const auto slow = lab::buildEnvelope (127, 127, 64, 127);
        check (slow[110] < slow[111] && slow[111] < slow[112],
               "the longest stages still fit, in order, with room left for the sustain");

        check (lab::envelopeTimeText (0) == "1 ms" && lab::envelopeTimeText (127) == "10.0 s",
               "stage times run from 1 ms to 10 s");
        check (lab::envelopeMilliseconds (64) > 90.0 && lab::envelopeMilliseconds (64) < 120.0,
               "exponentially, so the middle of the knob is about a tenth of a second");
    }

    {   // --- the meters --------------------------------------------------------------------
        check (lab::vuFrame (0.0) == 0 && lab::vuFrame (1.0e-6) == 0, "silence rests the needle");
        check (lab::vuFrame (1.0) == 41, "0 dB sits most of the way up, as on a VU");
        check (lab::vuFrame (10.0) == lab::kVuFrames - 1, "and too much pins it");
        bool moves = false;
        for (int f = 1; f < 40; ++f)
            moves = moves || lab::vuFrame (lab::demoLevel (0, f, 90)) != lab::vuFrame (lab::demoLevel (0, 0, 90));
        check (moves, "the demo signal moves the needle");
        check (lab::demoLevel (0, 7, 0) == 0.0, "and gain 0 silences it");
    }

    {   // --- the stress page ---------------------------------------------------------------
        const auto load = lab::stressLoad ({ 127, 127, 127, 127, 127, 127, 0, 0 });
        check (load.rects == 2032 && load.images == 1016 && load.texts == 127,
               "the encoders reach 2032 rects, 1016 sprites and 127 texts per redraw");
        check (load.fullScreens == 7 && load.memoryBlocks == lab::kStressMemoryBlocks && load.fps == 30,
               "7 full-screen blits, every memory block, 30 redraws per second");
        const auto idle = lab::stressLoad ({ 0, 0, 0, 0, 0, 0, 0, 0 });
        check (idle.rects == 0 && idle.memoryBlocks == 0 && idle.fps == 1, "and at rest, nothing at 1 per second");
        check (lab::stressLoad ({ 0, 0, 0, 0, 0, 39, 0, 0 }).fps == 9, "the lab starts at about 10 per second");

        const auto frame = lab::buildStressFrame (load, 0x1234);
        check (frame.size() == 8 && frame[0] == 127 && frame[1] == 127 && frame[6] == 0x12 && frame[7] == 0x34,
               "a stress frame carries the load in units the page multiplies back, and a 16-bit counter");
        check (lab::describe (load).find ("2032 rects") != std::string::npos
                 && lab::describe (load).find ("95460 draw calls/s") != std::string::npos,
               "and the console line says what the screen was asked for");
    }

    std::cout << "-------------------" << std::endl;
    std::cout << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
