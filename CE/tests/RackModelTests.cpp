// RackModelTests — the persistent Performance → InstrumentRack → Part document (VIP-successor
// Stage 1).
//
// What must hold, because every later stage leans on it: partId is identity and reordering
// never touches it; a full JSON round trip loses nothing (this document later travels inside
// Host Projects, session files and the outer VST3's DAW state); and loading is forgiving on
// numbers but strict on structure — clamped ranges load, duplicate identities refuse.
//
// juce_core only; runs anywhere.

#include "InstrumentHost/RackModel.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::Performance;
using ceditor::host::RackPart;

void testStructure()
{
    std::cout << "\nstructure and identity" << std::endl;

    auto perf = Performance::create();
    check (perf.performanceId.isNotEmpty(), "create mints a performance id");

    const auto a = perf.addPart();
    const auto b = perf.addPart();
    const auto c = perf.addPart();
    check (a != b && b != c, "every part gets its own id");
    check (perf.focusedPartId == a, "the first part added becomes focused");

    check (perf.movePart (c, 0), "movePart accepts a valid part");
    check (perf.parts.getReference (0).partId == c && perf.parts.getReference (1).partId == a,
           "reorder changes the array order");
    check (perf.focusedPartId == a, "and never the identities or the focus");

    check (perf.removePart (a), "removePart accepts a valid part");
    check (perf.findPart (a) == nullptr && perf.parts.size() == 2, "and the part is gone");
    check (perf.focusedPartId == c, "removing the focused part refocuses the first remaining");

    check (! perf.removePart ("no-such-part"), "an unknown part is refused");
    check (! perf.movePart ("no-such-part", 0), "for moving too");
}

void testRoundTrip()
{
    std::cout << "\nJSON round trip" << std::endl;

    auto perf = Performance::create();
    perf.name = "Stage Rig";
    const auto a = perf.addPart();
    const auto b = perf.addPart();

    auto* partA = perf.findPart (a);
    partA->pluginCeId = "VST3-sample-synth";
    partA->pluginModulePath = "C:\\VST3\\Sample.vst3";
    partA->pluginName = "Sample Synth";
    partA->pluginVendor = "Sample Audio";
    partA->stateBlobBase64 = "AAECAw==";
    partA->midi.channel = 2;
    partA->midi.keyLow = 36;
    partA->midi.keyHigh = 59;
    partA->midi.velocityLow = 10;
    partA->midi.velocityHigh = 100;
    partA->midi.transpose = -12;
    partA->mute = true;
    partA->solo = true;
    partA->volume = 0.5f;
    partA->pan = -0.25f;
    partA->editorOpen = true;
    perf.findPart (b)->enabled = false;
    perf.focusedPartId = b;

    // Through actual JSON text, because that is the trip the document really makes.
    const auto json = juce::JSON::toString (perf.toVar());
    Performance restored;
    check (Performance::fromVar (juce::JSON::parse (json), restored), "the JSON parses back");

    check (restored.performanceId == perf.performanceId && restored.name == "Stage Rig",
           "performance identity and name survive");
    check (restored.focusedPartId == b, "focus survives");
    check (restored.parts.size() == 2, "every part survives");

    const auto* ra = restored.findPart (a);
    check (ra != nullptr, "part identity survives");
    check (ra != nullptr
             && ra->pluginCeId == "VST3-sample-synth"
             && ra->pluginModulePath == "C:\\VST3\\Sample.vst3"
             && ra->stateBlobBase64 == "AAECAw==",
           "plugin identity and state blob survive");
    check (ra != nullptr
             && ra->midi.channel == 2 && ra->midi.keyLow == 36 && ra->midi.keyHigh == 59
             && ra->midi.velocityLow == 10 && ra->midi.velocityHigh == 100
             && ra->midi.transpose == -12,
           "MIDI rules survive");
    check (ra != nullptr && ra->mute && ra->solo && ra->editorOpen
             && juce::approximatelyEqual (ra->volume, 0.5f)
             && juce::approximatelyEqual (ra->pan, -0.25f),
           "mixer and editor state survive");
    check (restored.findPart (b) != nullptr && ! restored.findPart (b)->enabled,
           "enabled survives");
}

void testValidation()
{
    std::cout << "\nvalidation on load" << std::endl;

    Performance out;
    check (! Performance::fromVar (juce::var(), out), "a non-object refuses");
    check (! Performance::fromVar (juce::JSON::parse (R"({"name":"x"})"), out),
           "a missing performanceId refuses");
    check (! Performance::fromVar (juce::JSON::parse (R"({"performanceId":"p"})"), out),
           "missing parts refuse");

    check (! Performance::fromVar (juce::JSON::parse (
               R"({"performanceId":"p","parts":[{"partId":"x"},{"partId":"x"}]})"), out),
           "duplicate part ids refuse — that is structural damage");
    check (! Performance::fromVar (juce::JSON::parse (
               R"({"performanceId":"p","parts":[{"partId":""}]})"), out),
           "an empty part id refuses");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "focusedPartId":"gone",
               "parts":[{"partId":"x","channel":99,"keyLow":90,"keyHigh":10,
                          "velocityLow":300,"velocityHigh":-5,"transpose":900,
                          "volume":50,"pan":-9}]})"), out),
           "out-of-range numbers load rather than refuse");

    const auto* p = out.findPart ("x");
    check (p != nullptr && p->midi.channel == 16, "channel clamps");
    check (p != nullptr && p->midi.keyLow == 10 && p->midi.keyHigh == 90,
           "an inverted key range is swapped");
    check (p != nullptr && p->midi.velocityLow == 1 && p->midi.velocityHigh == 127,
           "velocity clamps then orders");
    check (p != nullptr && p->midi.transpose == 60, "transpose clamps");
    check (p != nullptr && juce::approximatelyEqual (p->volume, 2.0f)
             && juce::approximatelyEqual (p->pan, -1.0f),
           "mixer values clamp");
    check (out.focusedPartId.isEmpty(), "a focus naming no part is cleared, not fatal");
}
} // namespace

int main()
{
    std::cout << "RackModel tests" << std::endl;

    testStructure();
    testRoundTrip();
    testValidation();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
