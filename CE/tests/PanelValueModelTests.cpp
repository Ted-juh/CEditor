// Unit test for ceditor::PanelValueModel — the C++ "full mirror" used by the window-closed script
// runtime. Verifies its get/set path resolution matches the WebView JS runtime (panelRuntime.js /
// controlTreeUtils.js): shorthands, explicit section paths, per-section search, value channels,
// lookup by id, and write round-trips.

#include "Player/PanelValueModel.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

const char* kPanel = R"JSON({
  "name": "Test",
  "controls": [
    {
      "_type": "Control",
      "_children": {
        "Core": { "_type": "Core", "id": "c1", "name": "cutoff", "visible": true, "enabled": true, "zIndex": 3 },
        "Transform": { "_type": "Transform", "x": 10, "y": 20, "width": 60, "height": 40 },
        "Value": { "_type": "Value", "value": 42 },
        "Background": { "_type": "Background", "_children": { "Fill": { "_type": "Fill", "colour": "FF112233" } } },
        "ValueChannels": { "_type": "ValueChannels", "_children": { "cv": { "_type": "Channel", "currentValue": 7, "min": 0, "max": 127 } } }
      }
    }
  ]
})JSON";
}

int main()
{
    std::cout << "PanelValueModel test\n--------------------\n";

    ceditor::PanelValueModel model;
    check (model.loadFromJson (kPanel), "Parsed sample .cepanel JSON");

    // --- reads: shorthands -----------------------------------------------------------------------
    check ((int)  model.getValue ("cutoff.value")   == 42,   "value shorthand -> Value.value (42)");
    check ((bool) model.getValue ("cutoff.visible") == true, "visible shorthand -> Core.visible (true)");
    check ((int)  model.getValue ("cutoff.x")       == 10,   "x shorthand -> Transform.x (10)");
    check ((int)  model.getValue ("cutoff.zindex")  == 3,    "zindex shorthand -> Core.zIndex (case-folded)");

    // --- reads: explicit section path + per-section search (case-insensitive) ---------------------
    check (model.getValue ("cutoff.background.fill.colour").toString() == "FF112233", "explicit section path Background.Fill.colour");
    check (model.getValue ("cutoff.fill.colour").toString()           == "FF112233", "bare 'fill.colour' found by section search");

    // --- reads: lookup by id, value channel (channelize -> .currentValue) -------------------------
    check ((int) model.getValue ("c1.value")  == 42, "control resolved by id");
    check ((int) model.getValue ("cutoff.cv") == 7,  "value channel -> .currentValue (7)");

    // --- writes round-trip ------------------------------------------------------------------------
    check (model.setValue ("cutoff.value", juce::var (99)), "setValue cutoff.value");
    check ((int) model.getValue ("cutoff.value") == 99, "  read back 99");

    check (model.setValue ("cutoff.cv", juce::var (64)), "setValue value channel cutoff.cv");
    check ((int) model.getValue ("cutoff.cv") == 64, "  read back channel 64");

    check (model.setValue ("cutoff.background.fill.colour", juce::var ("FFAABBCC")), "setValue nested Background.Fill.colour");
    check (model.getValue ("cutoff.background.fill.colour").toString() == "FFAABBCC", "  read back FFAABBCC");

    // --- graceful misses --------------------------------------------------------------------------
    check (model.getValue ("missing.value").isVoid(), "unknown control -> void");
    check (! model.setValue ("missing.value", juce::var (1)), "setValue on unknown control -> false");
    check (model.getValue ("cutoff.nope").isVoid(), "unknown property -> void");

    std::cout << "--------------------\n" << (failures == 0 ? "ALL PASS" : (juce::String (failures) + " FAILED").toRawUTF8()) << std::endl;
    return failures == 0 ? 0 : 1;
}
