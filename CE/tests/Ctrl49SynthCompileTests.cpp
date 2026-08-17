// Phase 4 integration point: the DeviceProfile intent compiler turns an encoder value
// into the exact bytes a real synth expects. This locks that seam without hardware — it
// loads the shipped GAIA SH-01 profile and checks that a cutoff change compiles to the
// Roland DT1 SysEx the SH-01 MIDI implementation documents.
//
// Reference (GAIA MIDI impl, DT1): model 00 00 41, deviceId 0x7F (profile variable),
// roland-7bit checksum over address..data. filter.cutoff address = 10 00 01 0C.
//   value 64 (0x40): checksum = 128 - ((0x10+0x00+0x01+0x0C+0x40) % 128) = 0x23
//   => F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7

#include "DeviceProfile/DeviceProfileEngine.h"

#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

juce::File profileFile()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT).getChildFile ("CE").getChildFile ("profiles")
        .getChildFile ("test").getChildFile ("roland-gaia.ceditor-device.json");
   #else
    return juce::File::getCurrentWorkingDirectory()
        .getChildFile ("CE").getChildFile ("profiles").getChildFile ("test")
        .getChildFile ("roland-gaia.ceditor-device.json");
   #endif
}
} // namespace

int main()
{
    using ceditor::device::DeviceProfileEngine;

    std::cout << "Ctrl49 synth-compile test\n-------------------------\n";

    DeviceProfileEngine engine;
    juce::String error;
    const bool loaded = engine.loadFromFile (profileFile(), error);
    check (loaded, "GAIA SH-01 profile loads (" + (loaded ? juce::String ("ok") : error) + ")");
    if (! loaded)
    {
        std::cout << "-------------------------\n1 FAILED" << std::endl;
        return 1;
    }

    check (engine.getProfileName().isNotEmpty(), "profile has a name: " + engine.getProfileName());

    // The core Phase-4 seam: encoder value -> exact synth bytes.
    const auto cutoff64 = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, false);
    check (cutoff64.ok, "filter.cutoff = 64 compiles (" + cutoff64.error + ")");
    if (cutoff64.ok)
    {
        const juce::String hex = DeviceProfileEngine::transactionToHex (cutoff64.transaction);
        check (hex == "F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7",
               "cutoff 64 -> Roland DT1 SysEx with correct checksum");
        if (hex != "F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7")
            std::cout << "          got: " << hex << std::endl;
    }

    // A second value exercises the checksum path again.
    const auto cutoff0 = engine.compileSetParameter ("mainSynth", "filter.cutoff", 0, false);
    check (cutoff0.ok, "filter.cutoff = 0 compiles");
    if (cutoff0.ok)
    {
        // checksum = 128 - ((0x10+0x01+0x0C+0x00) % 128) = 128 - 0x1D = 0x63
        const juce::String hex = DeviceProfileEngine::transactionToHex (cutoff0.transaction);
        check (hex == "F0 41 7F 00 00 41 12 10 00 01 0C 00 63 F7",
               "cutoff 0 -> Roland DT1 SysEx with correct checksum");
        if (hex != "F0 41 7F 00 00 41 12 10 00 01 0C 00 63 F7")
            std::cout << "          got: " << hex << std::endl;
    }

    // Out-of-range must be rejected, not silently clamped into a wrong byte.
    const auto tooBig = engine.compileSetParameter ("mainSynth", "filter.cutoff", 200, false);
    check (! tooBig.ok, "cutoff = 200 (out of 0..127 range) is rejected");

    std::cout << "-------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures).toStdString() + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
