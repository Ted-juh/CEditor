// Preset selection primitive: Bank Select + Program Change bytes, and the data-dial browser
// index math. No hardware; no profile dependency.

#include "ControlSurface/Ctrl49Preset.h"

#include <iostream>
#include <string>

namespace
{
using ceditor::ctrl49::Bytes;
int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}
} // namespace

int main()
{
    using namespace ceditor::ctrl49;

    std::cout << "Ctrl49 preset test\n------------------\n";

    // Channel 1 (index 0), bank 0/2, program 5.
    const auto seq = buildPresetSelect (0, PresetAddress { 0, 2, 5 });
    check (seq.size() == 3, "preset select is a 3-message sequence");
    check (seq[0] == Bytes ({ 0xB0, 0x00, 0x00 }), "Bank Select MSB (CC0 = 0)");
    check (seq[1] == Bytes ({ 0xB0, 0x20, 0x02 }), "Bank Select LSB (CC32 = 2)");
    check (seq[2] == Bytes ({ 0xC0, 0x05 }), "Program Change 5");

    // Channel 10 (index 9) sets the low nibble of the status bytes.
    const auto ch10 = buildPresetSelect (9, PresetAddress { 1, 0, 40 });
    check (ch10[0][0] == 0xB9 && ch10[2][0] == 0xC9, "channel 10 encodes in the status byte");
    check (ch10[0][2] == 0x01 && ch10[2][1] == 0x28, "bank MSB 1 and program 40 carried");

    // Out-of-range values clamp to 0..127.
    const auto clamped = buildPresetSelect (0, PresetAddress { 999, -5, 200 });
    check (clamped[0][2] == 0x7F && clamped[1][2] == 0x00 && clamped[2][1] == 0x7F,
           "bank/program values clamp to 0..127");

    // --- browser index math -----------------------------------------------------------------------
    PresetBrowser browser (300);
    check (browser.index() == 0 && browser.count() == 300, "browser starts at 0 of 300");
    browser.move (1);
    check (browser.index() == 1, "data-dial +1 advances");
    browser.move (-1);
    browser.move (-1);
    check (browser.index() == 299, "wrap below 0 -> last (299)");
    browser.move (1);
    check (browser.index() == 0, "wrap above end -> first");

    browser.setIndex (200);
    const auto addr = browser.addressForIndex();
    check (addr.program == 200 % 128 && addr.bankLsb == 200 / 128,
           "index 200 -> program 72, bank LSB 1 (128-patch banks)");

    std::cout << "------------------\n"
              << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
