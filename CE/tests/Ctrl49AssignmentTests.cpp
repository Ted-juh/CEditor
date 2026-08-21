// Phase 5: the assignment model and its bindings. Loads the shipped GAIA assignment,
// checks its shape, and verifies every bound parameter on every page compiles to real
// synth bytes through the profile it names. No hardware.

#include "ControlSurface/Ctrl49Assignment.h"
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

    std::cout << "Ctrl49 assignment test\n----------------------\n";

    const juce::File file = sourceRoot().getChildFile ("tools").getChildFile ("ctrl49")
        .getChildFile ("gaia-filter-amp.assignment.json");

    Assignment assignment;
    juce::String error;
    const bool loaded = Assignment::fromFile (file, assignment, error);
    check (loaded, "assignment loads (" + (loaded ? juce::String ("ok") : error) + ")");
    if (! loaded) { std::cout << "----------------------\n1 FAILED" << std::endl; return 1; }

    check (assignment.name.isNotEmpty(), "assignment has a name: " + assignment.name);
    check (assignment.pages.size() >= 1, "assignment has at least one page");
    check (assignment.deviceRole.isNotEmpty(), "assignment has a device role");

    // Labels default to the parameter id when omitted; here they are all explicit.
    bool everySlotLabelled = true;
    for (const auto& page : assignment.pages)
        for (const auto& slot : page.slots)
            if (! slot.parameterId.isEmpty() && slot.label.isEmpty())
                everySlotLabelled = false;
    check (everySlotLabelled, "every bound slot has a label");

    // The profile the assignment names must load.
    DeviceProfileEngine engine;
    const juce::File profile = assignment.resolvedProfile (file.getParentDirectory());
    const bool profileOk = engine.loadFromFile (profile, error);
    check (profileOk, "named profile loads (" + (profileOk ? juce::String ("ok") : error) + ")");
    if (! profileOk) { std::cout << "----------------------\n" << (failures + 1) << " FAILED" << std::endl; return 1; }

    // Every bound parameter on every page compiles to bytes at a mid value.
    int boundSlots = 0, compiled = 0;
    for (const auto& page : assignment.pages)
        for (const auto& slot : page.slots)
        {
            if (slot.parameterId.isEmpty()) continue;
            ++boundSlots;
            const auto result = engine.compileSetParameter (assignment.deviceRole, slot.parameterId, 64, false);
            if (result.ok && ! result.transaction.messages.isEmpty())
                ++compiled;
            else
                std::cout << "          '" << slot.parameterId << "' failed: " << result.error << std::endl;
        }
    check (boundSlots > 0, "assignment binds at least one parameter (" + juce::String (boundSlots) + ")");
    check (compiled == boundSlots,
           "every bound parameter compiles to synth bytes (" + juce::String (compiled)
           + "/" + juce::String (boundSlots) + ")");

    // A malformed assignment is rejected, not silently accepted.
    Assignment bad;
    const bool rejected = ! Assignment::fromJson ("{ \"name\": \"x\" }", file.getParentDirectory(), bad, error);
    check (rejected, "assignment with no profile/pages is rejected");

    std::cout << "----------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures).toStdString() + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
