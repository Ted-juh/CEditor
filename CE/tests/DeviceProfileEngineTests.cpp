#include "../src/DeviceProfile/DeviceProfileEngine.h"

#include <iostream>

namespace
{
juce::File profileRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT)
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #else
    return juce::File::getCurrentWorkingDirectory()
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #endif
}

int runProfileTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;

    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": " << error << "\n";
        for (const auto& message : engine.getValidationMessages())
            std::cerr << "  " << message.path << ": " << message.message << "\n";
        return 1;
    }

    auto results = engine.runTests();
    if (results.isEmpty())
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": no tests found\n";
        return 1;
    }

    auto failures = 0;
    for (const auto& result : results)
    {
        if (result.passed)
        {
            std::cout << "[PASS] " << engine.getProfileId() << " :: " << result.name << "\n";
            continue;
        }

        ++failures;
        std::cerr << "[FAIL] " << engine.getProfileId() << " :: " << result.name << "\n"
                  << "  " << result.error << "\n"
                  << "  expected: " << result.expectedHex << "\n"
                  << "  actual:   " << result.actualHex << "\n";
    }

    return failures;
}

int runPolicyTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
        return 1;

    auto result = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, true);
    if (! result.ok)
    {
        std::cerr << "[FAIL] policy test compile: " << result.error << "\n";
        return 1;
    }

    if (result.transaction.sendPolicyMode != "continuous"
        || ! result.transaction.coalesce
        || result.transaction.minIntervalMs != 20
        || ! result.transaction.realtimeSafe)
    {
        std::cerr << "[FAIL] policy metadata was not preserved on compiled transaction\n";
        return 1;
    }

    std::cout << "[PASS] test-cc-synth :: Send policy metadata\n";
    return 0;
}
}

int main()
{
    const auto root = profileRoot();
    const juce::Array<juce::File> profiles {
        root.getChildFile ("test-cc-synth.ceditor-device.json"),
        root.getChildFile ("test-sysex-synth.ceditor-device.json"),
        root.getChildFile ("test-nrpn-synth.ceditor-device.json")
    };

    auto failures = 0;
    for (const auto& profile : profiles)
        failures += runProfileTests (profile);

    failures += runPolicyTests (root.getChildFile ("test-cc-synth.ceditor-device.json"));

    if (failures == 0)
    {
        std::cout << "Device Profile Engine tests passed.\n";
        return 0;
    }

    std::cerr << failures << " Device Profile Engine test(s) failed.\n";
    return 1;
}
