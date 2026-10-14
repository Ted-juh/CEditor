// Unit test for ceditor::PanelValueModel — the C++ "full mirror" used by the window-closed script
// runtime. Verifies its get/set path resolution matches the WebView JS runtime (panelRuntime.js /
// controlTreeUtils.js): shorthands, explicit section paths, per-section search, value channels,
// lookup by id, write round-trips, and the name index staying true across renames.

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

// Three controls for the name index: the second's id is the first's name, and the third sits inside
// the second, which is a container.
const char* kIndexPanel = R"JSON({
  "name": "Index",
  "controls": [
    { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "id_a", "name": "shared" },
        "Value": { "_type": "Value", "value": 1 },
        "Background": { "_type": "Background", "_children": { "Fill": { "_type": "Fill", "colour": "FF112233" } } } } },
    { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "shared", "name": "b" },
        "Value": { "_type": "Value", "value": 2 },
        "Children": { "_type": "Children", "_children": {
          "id_inner": { "_type": "Control", "_children": {
            "Core": { "_type": "Core", "id": "id_inner", "name": "inner" },
            "Value": { "_type": "Value", "value": 3 } } } } } } }
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

    // --- a name never contains a dot ----------------------------------------------------------------
    // The name is a path's first segment and splitScriptPath ends it at the first dot, so a script
    // renaming a control to "osc.pitch" would make it unreachable by its own new name.
    check (model.setValue ("cutoff.name", juce::var ("osc.pitch")), "setValue name with a dot");
    check (model.getValue ("c1.name").toString() == "osc_pitch", "  stored with underscores");
    check ((int) model.getValue ("osc_pitch.value") == 99, "  and reachable by that name");
    check (model.getValue ("cutoff.value").isVoid(), "  and no longer by the old one");

    // --- the name index -------------------------------------------------------------------------------
    // Lookups answer from an index built on first use. These are the ways a write can change what a
    // name finds; each has to show up on the very next lookup, and the first control in document
    // order has to keep winning, whether it matched by name or by id.
    {
        ceditor::PanelValueModel m;
        check (m.loadFromJson (kIndexPanel), "Parsed the name-index panel");
        check ((int) m.getValue ("shared.value") == 1, "index: a name beats a later control's id");
        check ((int) m.getValue ("id_a.value") == 1, "index: an id finds its control");
        check ((int) m.getValue ("B.VALUE") == 2, "index: case-insensitive");
        check ((int) m.getValue ("inner.value") == 3, "index: a control inside a container");

        check (m.setValue ("id_a.name", juce::var ("renamed")), "index: rename the first control");
        check ((int) m.getValue ("renamed.value") == 1, "  found by its new name");
        check ((int) m.getValue ("shared.value") == 2, "  and the old name now finds the later control's id");

        check (m.setValue ("b.core.id", juce::var ("fresh")), "index: change an id through its section");
        check ((int) m.getValue ("fresh.value") == 2, "  found by its new id");
        check (m.getValue ("shared.value").isVoid(), "  and nothing answers to the old one");

        check (m.setValue ("inner.name", juce::var ("nested")), "index: rename a nested control");
        check ((int) m.getValue ("nested.value") == 3, "  found by its new name");

        // A whole Core section, spelled out, renames a control as surely as Core.name does.
        auto* core = new juce::DynamicObject();
        core->setProperty ("_type", "Core");
        core->setProperty ("id", "id_c");
        core->setProperty ("name", "whole");
        check (m.setValue ("renamed.core", juce::var (core)), "index: write a whole Core section");
        check ((int) m.getValue ("whole.value") == 1, "  found by the name inside it");
        check (m.getValue ("renamed.value").isVoid(), "  and not by the name it replaced");
        check (m.getValue ("id_a.value").isVoid(), "  nor by the id");

        // And a write anywhere else still lands.
        check (m.setValue ("whole.background.fill.colour", juce::var ("FF000000")), "index: an ordinary write");
        check (m.getValue ("whole.fill.colour").toString() == "FF000000", "  reads back");

        // Loading another document starts the index again.
        check (m.loadFromJson (kPanel), "index: load a different panel");
        check (m.getValue ("whole.value").isVoid(), "  the old names are gone");
        check ((int) m.getValue ("cutoff.value") == 42, "  the new ones are there");
    }

    std::cout << "--------------------\n" << (failures == 0 ? "ALL PASS" : (juce::String (failures) + " FAILED").toRawUTF8()) << std::endl;
    return failures == 0 ? 0 : 1;
}
