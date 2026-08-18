// Preset bank: loads the shipped sample bank and verifies that selecting a patch produces
// the correct Bank Select + Program Change bytes, including a patch in a second bank. No
// hardware.

#include "ControlSurface/Ctrl49PresetBank.h"

#include <iostream>

namespace
{
using ceditor::ctrl49::Bytes;
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

juce::File sourceRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT);
   #else
    return juce::File::getCurrentWorkingDirectory();
   #endif
}
} // namespace

int main()
{
    using ceditor::ctrl49::PresetBank;

    std::cout << "Ctrl49 preset-bank test\n-----------------------\n";

    const juce::File file = sourceRoot().getChildFile ("tools").getChildFile ("ctrl49")
        .getChildFile ("gaia-patches.presetbank.json");

    PresetBank bank;
    juce::String error;
    const bool loaded = PresetBank::fromFile (file, bank, error);
    check (loaded, "preset bank loads (" + (loaded ? juce::String ("ok") : error) + ")");
    if (! loaded) { std::cout << "-----------------------\n1 FAILED" << std::endl; return 1; }

    check (bank.name == "GAIA PATCHES", "bank name: " + bank.name);
    check (bank.channel == 0, "channel 1 (JSON) -> 0-based 0");
    check (bank.patches.size() == 12, "12 patches loaded");
    check (bank.patches[2].name == "SUPER SAW LEAD", "patch 3 name");

    // Selecting patch index 2 (program 2, bank 0/0) on channel 0.
    const auto seq2 = bank.selectSequence (2);
    check (seq2.size() == 3, "select is a 3-message sequence");
    check (seq2[0] == Bytes ({ 0xB0, 0x00, 0x00 }) && seq2[1] == Bytes ({ 0xB0, 0x20, 0x00 })
               && seq2[2] == Bytes ({ 0xC0, 0x02 }),
           "patch 3 -> Bank 0/0 + Program 2");

    // Patch index 10 (USER 001) is in bank LSB 1, program 0.
    const auto seq10 = bank.selectSequence (10);
    check (seq10[1] == Bytes ({ 0xB0, 0x20, 0x01 }) && seq10[2] == Bytes ({ 0xC0, 0x00 }),
           "USER 001 -> Bank LSB 1 + Program 0");

    // Out-of-range index yields no messages (host must guard).
    check (bank.selectSequence (999).empty(), "out-of-range index -> empty sequence");

    std::cout << "-----------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures).toStdString() + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
