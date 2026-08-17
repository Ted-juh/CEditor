// Golden-byte tests for ceditor::ctrl49 — the CTRL49 vendor SysEx protocol library.
//
// Expected byte strings come from the reverse-engineering handoff
// (CTRL49_CEditor_Complete_Engineering_Handoff.md): frames either proven live on the
// physical keyboard or decoded exactly from the captured VIP replay. Vectors marked
// "derived" follow the documented layouts/algorithms but were not printed verbatim in
// the handoff.

#include "ControlSurface/Ctrl49Protocol.h"

#include <iomanip>
#include <iostream>
#include <sstream>

namespace
{
using ceditor::ctrl49::Bytes;

int failures = 0;

std::string hex (const Bytes& bytes)
{
    std::ostringstream out;
    for (std::size_t i = 0; i < bytes.size(); ++i)
        out << (i ? " " : "") << std::uppercase << std::hex << std::setw (2)
            << std::setfill ('0') << static_cast<int> (bytes[i]);
    return out.str();
}

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

void checkBytes (const Bytes& actual, const Bytes& expected, const std::string& label)
{
    const bool ok = actual == expected;
    check (ok, label);
    if (! ok)
    {
        std::cout << "          expected: " << hex (expected) << "\n";
        std::cout << "          actual:   " << hex (actual) << std::endl;
    }
}

template <typename Fn>
void checkThrows (Fn&& fn, const std::string& label)
{
    bool threw = false;
    try { fn(); }
    catch (const std::invalid_argument&) { threw = true; }
    check (threw, label);
}
} // namespace

int main()
{
    using namespace ceditor::ctrl49;

    std::cout << "Ctrl49 protocol test\n--------------------\n";

    // --- base-128 ---------------------------------------------------------------------------------
    checkBytes (encodeBase128 (160, 2), { 0x01, 0x20 }, "base-128: 160 -> 01 20");
    checkBytes (encodeBase128 (44, 2),  { 0x00, 0x2C }, "base-128: 44 -> 00 2C");
    checkBytes (encodeBase128 (3406, 4), { 0x00, 0x00, 0x1A, 0x4E }, "base-128: 3406 -> 00 00 1A 4E");
    check (decodeBase128 (Bytes { 0x01, 0x20 }.data(), 2) == 160, "base-128 decode: 01 20 -> 160");
    check (decodeBase128 (Bytes { 0x02, 0x01 }.data(), 2) == 0x0101, "base-128 decode: 02 01 -> 0x0101");
    checkThrows ([] { encodeBase128 (0x4000, 2); }, "base-128: 0x4000 does not fit two digits");

    // --- MIDI-7 bitstream -------------------------------------------------------------------------
    checkBytes (encodeMidi7 ({ 0xFF }), { 0x7F, 0x01 }, "MIDI-7: FF -> 7F 01 (derived)");
    checkBytes (encodeMidi7 ({ 0x69, 0x6E, 0x69, 0x74 }), { 0x69, 0x5C, 0x25, 0x23, 0x07 },
                "MIDI-7: 'init' -> 69 5C 25 23 07 (derived)");
    check (encodeMidi7 (Bytes (512, 0x55)).size() == 586, "MIDI-7: 512 raw bytes -> 586 encoded");
    check (encodeMidi7 ({}).empty(), "MIDI-7: empty in, empty out");

    {   // round-trip with deterministic pseudo-random data across chunk-relevant sizes
        bool ok = true;
        std::uint32_t seed = 0x12345678;
        for (const std::size_t size : { std::size_t (1), std::size_t (7), std::size_t (8),
                                        std::size_t (334), std::size_t (512) })
        {
            Bytes raw (size);
            for (auto& b : raw)
            {
                seed = seed * 1664525u + 1013904223u;
                b = static_cast<std::uint8_t> (seed >> 24);
            }
            if (decodeMidi7 (encodeMidi7 (raw), raw.size()) != raw)
                ok = false;
        }
        check (ok, "MIDI-7: encode/decode round-trips (1, 7, 8, 334, 512 bytes)");
    }

    // --- session frames (PROVEN-LIVE) -------------------------------------------------------------
    checkBytes (buildIdentityQuery(),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x03, 0x08, 0x00, 0x00, 0xF7 },
                "identity query 03/08");
    checkBytes (buildKeepalive(),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x03, 0x00, 0x00, 0x00, 0xF7 },
                "keepalive 03/00");

    // --- display runtime frames (PROVEN-LIVE / PROVEN-REPLAY) --------------------------------------
    checkBytes (buildBindLua (2, 0x0101),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x3A, 0x00, 0x05,
                  0x02, 0x02, 0x10, 0x02, 0x01, 0xF7 },
                "bind target 2 to Lua 0x0101 (02/3A)");
    checkBytes (buildSetLayerPosition (0x20, 2, 0, 0),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x0E, 0x00, 0x08,
                  0x20, 0x0D, 0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0xF7 },
                "position target 2 at (0,0), group 0x20 (02/0E)");
    checkBytes (buildSetLayerPosition (0x21, 6, 160, 44),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x0E, 0x00, 0x08,
                  0x21, 0x0D, 0x02, 0x06, 0x01, 0x20, 0x00, 0x2C, 0xF7 },
                "position target 6 at (160,44), group 0x21 (02/0E)");
    checkBytes (buildCreateTarget (2),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x39, 0x00, 0x02, 0x02, 0x02, 0xF7 },
                "create target 2 (02/39)");
    checkBytes (buildSceneBegin (0x20),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x0D, 0x00, 0x02, 0x20, 0x01, 0xF7 },
                "scene begin group 0x20 (02/0D)");
    checkBytes (buildSceneActivate (0x20),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x10, 0x00, 0x01, 0x20, 0xF7 },
                "scene activate group 0x20 (02/10)");

    // --- Lua call / draw (documented layout; encoded name derived) ---------------------------------
    checkBytes (buildLuaCall (2, "init", {}),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x3C, 0x00, 0x0F,
                  0x02, 0x02,
                  0x00, 0x04, 0x00, 0x05, 0x69, 0x5C, 0x25, 0x23, 0x07,
                  0x00, 0x00, 0x00, 0x00, 0xF7 },
                "Lua call init() on target 2 (02/3C, derived)");
    checkBytes (buildDraw (2, { 0x01 }),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x02, 0x3B, 0x00, 0x08,
                  0x02, 0x02, 0x00, 0x01, 0x00, 0x02, 0x01, 0x00, 0xF7 },
                "draw([01]) on target 2 (02/3B, derived)");

    // --- LEDs and pad RGB (PROVEN-LIVE) ------------------------------------------------------------
    checkBytes (buildLedLevel (kLedPadBankA, kLedOn),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x04, 0x05, 0x00, 0x02, 0x2A, 0x7F, 0xF7 },
                "bank A LED on (04/05)");
    checkBytes (buildPadRgb (1, 255, 165, 0),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x04, 0x06, 0x00, 0x09,
                  0x01, 0x00, 0x00, 0x01, 0x7F, 0x01, 0x25, 0x00, 0x00, 0xF7 },
                "pad 1 RGB orange 255,165,0 (04/06)");
    checkThrows ([] { buildPadRgb (0, 1, 2, 3); }, "pad RGB rejects pad ID 0");
    checkThrows ([] { buildPadRgb (9, 1, 2, 3); }, "pad RGB rejects pad ID 9");

    // --- object upload (documented layout) ---------------------------------------------------------
    const ObjectKey landingLua { kObjectTypeLua, 0x0101 };
    checkBytes (objectKeyBytes (landingLua), { 0x00, 0x10, 0x02, 0x01 },
                "object key Lua 0x0101 -> 00 10 02 01");
    checkBytes (buildObjectBegin (landingLua, 3406),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x05, 0x00, 0x00, 0x09,
                  0x00, 0x10, 0x02, 0x01, 0x00, 0x00, 0x1A, 0x4E, 0x04, 0xF7 },
                "object begin: Lua 0x0101, 3406 raw bytes, flags 04 (05/00, derived)");
    checkBytes (buildObjectEnd (landingLua),
                { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08, 0x05, 0x0B, 0x00, 0x05,
                  0x00, 0x10, 0x02, 0x01, 0x01, 0xF7 },
                "object end: status 1 (05/0B, derived)");

    {   // The proven minimal-loader shape: 3,406 raw bytes (3,405 source + NUL) uploads as
        // one begin, seven <=512-byte chunks, one end — nine frames total.
        Bytes raw (3406, 0x2A);
        const auto frames = buildObjectUpload (landingLua, raw);
        check (frames.size() == 9, "upload of 3406 bytes -> 9 frames (begin + 7 chunks + end)");

        // Chunk frame layout: header(8) + length(2) + key(4) + rawSize(4) + offset(4)
        // + encodedSize(2) + encoded data + F7. A full 512-byte chunk encodes to 586.
        check (frames[1].size() == 8 + 2 + 4 + 4 + 4 + 2 + 586 + 1,
               "first chunk frame: 512 raw -> 586 encoded bytes");

        // Last chunk carries the remainder: 3406 - 6*512 = 334 raw -> 382 encoded.
        check (frames[7].size() == 8 + 2 + 4 + 4 + 4 + 2 + 382 + 1,
               "last chunk frame: 334 raw -> 382 encoded bytes");

        // Every byte of every frame between F0 and F7 must be MIDI-safe.
        bool safe = true;
        for (const auto& frame : frames)
            for (std::size_t i = 1; i + 1 < frame.size(); ++i)
                if (frame[i] >= 0x80)
                    safe = false;
        check (safe, "all upload frame bytes are MIDI-safe (< 0x80)");
    }

    // --- frame validation -------------------------------------------------------------------------
    checkThrows ([] { buildFrame (0x02, 0x3B, { 0x80 }); }, "frame rejects payload byte >= 0x80");
    checkThrows ([] { buildFrame (0x02, 0x3B, Bytes (0x4000, 0x00)); },
                 "frame rejects payload > 0x3FFF bytes");

    std::cout << "--------------------\n"
              << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
