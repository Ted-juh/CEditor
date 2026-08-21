// Phase 7: multi-synth "whole rig" — a single assignment whose pages target different
// synths. Verifies per-page device resolution and that each page's parameters compile to
// the correct bytes through its own profile (GAIA page -> GAIA SysEx; SH-201 page -> SH-201
// SysEx). No hardware.

#include "ControlSurface/Ctrl49Assignment.h"
#include "DeviceProfile/DeviceProfileEngine.h"

#include <iostream>
#include <map>

namespace
{
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
    using ceditor::ctrl49::Assignment;
    using ceditor::device::DeviceProfileEngine;

    std::cout << "Ctrl49 multi-synth test\n-----------------------\n";

    const juce::File file = sourceRoot().getChildFile ("tools").getChildFile ("ctrl49")
        .getChildFile ("multi-synth-rig.assignment.json");
    const juce::File baseDir = file.getParentDirectory();

    Assignment rig;
    juce::String error;
    const bool loaded = Assignment::fromFile (file, rig, error);
    check (loaded, "multi-synth assignment loads (" + (loaded ? juce::String ("ok") : error) + ")");
    if (! loaded) { std::cout << "-----------------------\n1 FAILED" << std::endl; return 1; }

    check (rig.pages.size() == 2, "rig has two pages");

    // Page 0 inherits the default (GAIA); page 1 overrides to SH-201 with its own role/port.
    check (rig.pageProfile (0, baseDir).getFileName() == "roland-gaia.ceditor-device.json",
           "page 0 resolves to the GAIA profile");
    check (rig.pageProfile (1, baseDir).getFileName() == "roland-sh-201.ceditor-device.json",
           "page 1 overrides to the SH-201 profile");
    check (rig.pageRole (0) == "gaia" && rig.pageRole (1) == "sh201",
           "per-page roles resolve (gaia / sh201)");
    check (rig.pagePort (1) == "SH-201", "page 1 carries its own synth port name");

    // Two distinct profiles across the rig -> one engine each.
    const juce::StringArray distinct = rig.distinctProfilePaths (baseDir);
    check (distinct.size() == 2, "rig spans two distinct device profiles");

    // Load an engine per distinct profile (as the multi-synth host will).
    std::map<juce::String, std::unique_ptr<DeviceProfileEngine>> engines;
    for (const auto& path : distinct)
    {
        auto engine = std::make_unique<DeviceProfileEngine>();
        juce::String err;
        if (engine->loadFromFile (juce::File (path), err))
            engines[path] = std::move (engine);
        else
            std::cout << "          profile load failed: " << err << std::endl;
    }
    check (engines.size() == 2, "both device profiles load");

    // Every bound parameter on every page compiles through THAT page's engine.
    int bound = 0, compiled = 0;
    for (int p = 0; p < static_cast<int> (rig.pages.size()); ++p)
    {
        auto* engine = engines[rig.pageProfile (p, baseDir).getFullPathName()].get();
        for (const auto& slot : rig.pages[static_cast<std::size_t> (p)].slots)
        {
            if (slot.parameterId.isEmpty()) continue;
            ++bound;
            if (engine != nullptr)
            {
                const auto r = engine->compileSetParameter (rig.pageRole (p), slot.parameterId, 64, false);
                if (r.ok && ! r.transaction.messages.isEmpty()) ++compiled;
                else std::cout << "          '" << slot.parameterId << "' failed: " << r.error << std::endl;
            }
        }
    }
    check (compiled == bound, "every param compiles through its page's synth ("
           + juce::String (compiled) + "/" + juce::String (bound) + ")");

    // The two synths produce DIFFERENT bytes for the same encoder value: distinct model ids
    // and addresses. GAIA filter.cutoff vs SH-201 upper.filter.cutoff at value 64.
    auto* gaia = engines[rig.pageProfile (0, baseDir).getFullPathName()].get();
    auto* sh201 = engines[rig.pageProfile (1, baseDir).getFullPathName()].get();
    const auto gaiaCut = gaia->compileSetParameter ("gaia", "filter.cutoff", 64, false);
    const auto shCut = sh201->compileSetParameter ("sh201", "upper.filter.cutoff", 64, false);
    check (gaiaCut.ok && shCut.ok, "both cutoffs compile");
    const juce::String gaiaHex = DeviceProfileEngine::transactionToHex (gaiaCut.transaction);
    const juce::String shHex = DeviceProfileEngine::transactionToHex (shCut.transaction);
    check (gaiaHex == "F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7",
           "GAIA cutoff -> GAIA SysEx (model 41, dev 7F)");
    check (gaiaHex != shHex, "same encoder value produces different bytes per synth");
    if (gaiaHex == shHex)
        std::cout << "          gaia=" << gaiaHex << "  sh201=" << shHex << std::endl;
    else
        std::cout << "          gaia=" << gaiaHex << "\n          sh201=" << shHex << std::endl;

    std::cout << "-----------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures).toStdString() + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
