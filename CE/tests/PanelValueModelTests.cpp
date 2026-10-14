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

// An export payload (documentForm "export"): each control a diff against its type, and the defaults
// it is against carried in controlDefaults. Two knobs on one type, a container holding a third, and a
// custom component with an authored part whose Background is a marker only, at its defaults.
const char* kExportPanel = R"JSON({
  "name": "Export",
  "documentForm": "export",
  "controls": [
    { "_type": "Control", "_children": {
        "Core": { "id": "k1", "name": "first", "controlType": "Knob" },
        "Transform": { "x": 10 },
        "Value": { "steps": [1, 2] } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "k2", "name": "second", "controlType": "Knob", "tooltip": null },
        "States": { "_children": { "_removed": ["Hover"] } } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "box", "name": "box", "controlType": "Container" },
        "Children": { "_children": {
          "k3": { "_type": "Control", "_children": {
            "Core": { "id": "k3", "name": "inner", "controlType": "Knob" },
            "Value": { "value": 0.75 } } } } } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "c1", "name": "custom", "controlType": "CustomComponent" },
        "Parts": { "_children": {
          "cap": { "_type": "Part", "name": "cap", "_children": {
            "Background": { "_type": "Background" },
            "Layout": { "x": 4 } } } } } } }
  ],
  "controlDefaults": {
    "types": {
      "Knob": { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "", "name": "", "controlType": "Knob", "tooltip": "turn me" },
        "Transform": { "_type": "Transform", "x": 0, "y": 0 },
        "Value": { "_type": "Value", "value": 0.5, "steps": [0] },
        "Background": { "_type": "Background", "_children": { "Fill": { "_type": "Fill", "colour": "FF000000" } } },
        "States": { "_type": "States", "_children": { "Normal": { "_type": "State" }, "Hover": { "_type": "State" } } },
        "Parts": { "_type": "Parts", "_children": { "track": { "_type": "Part", "name": "track", "_children": {} } } } } },
      "Container": { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "", "name": "", "controlType": "Container" },
        "Children": { "_type": "Children", "_children": {} } } },
      "CustomComponent": { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "", "name": "", "controlType": "CustomComponent" },
        "Parts": { "_type": "Parts", "_children": {} } } }
    },
    "part": { "_type": "Part", "name": "", "_children": { "Layout": { "_type": "Layout", "x": 0, "y": 0 } } },
    "partSections": {
      "Background": { "_type": "Background", "_children": { "Fill": { "_type": "Fill", "colour": "FFFFFFFF" } } }
    }
  }
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

    // --- an export payload: controls rebuilt from the defaults it carries ---------------------------
    // Reads answer as the complete form would; a write reaches the control written to and nothing
    // that shares its defaults; the old complete form still loads as it is (everything above).
    {
        ceditor::PanelValueModel m;
        check (m.loadFromJson (kExportPanel), "Parsed the export payload");
        check ((int) m.getValue ("first.x") == 10 && (int) m.getValue ("first.y") == 0,
               "export: the diff over its type's defaults (x written, y the default)");
        check ((double) m.getValue ("second.value") == 0.5, "export: a section the diff never mentions");
        check (m.getValue ("second.background.fill.colour").toString() == "FF000000", "export: a nested default");
        check (m.getValue ("first.value.steps").getArray() != nullptr && m.getValue ("first.value.steps").getArray()->size() == 2,
               "export: an array is the diff's, whole");
        check (! m.getValue ("first.States.Hover").isVoid() && m.getValue ("second.States.Hover").isVoid(),
               "export: a default the author deleted stays deleted, and only where they deleted it");
        check (m.getValue ("first.tooltip").toString() == "turn me" && m.getValue ("second.tooltip").isVoid(),
               "export: a JSON null in the diff is the value, not a gap to fill");
        check ((double) m.getValue ("inner.value") == 0.75 && (int) m.getValue ("inner.x") == 0,
               "export: a container's child is rebuilt over its own type");
        check (m.getValue ("custom.Parts.cap.Background.Fill.colour").toString() == "FFFFFFFF"
                   && (int) m.getValue ("custom.Parts.cap.Layout.x") == 4,
               "export: an authored part's section, a marker in the file, reads its defaults (and its own Layout)");
        check (m.getValue ("panel.controlDefaults").isVoid(), "export: the table is not part of the panel a script sees");

        check (m.setValue ("first.background.fill.colour", juce::var ("FF123456")), "export: write a default-valued colour");
        check (m.getValue ("first.background.fill.colour").toString() == "FF123456", "  the control has it");
        check (m.getValue ("second.background.fill.colour").toString() == "FF000000"
                   && m.getValue ("inner.background.fill.colour").toString() == "FF000000",
               "  and the other knobs, which share those defaults' nodes, do not");
        check (m.setValue ("inner.y", juce::var (33)) && (int) m.getValue ("inner.y") == 33 && (int) m.getValue ("first.y") == 0,
               "export: a write inside a container's child stays in that child");
        check (m.setValue ("custom.Parts.cap.Background.Fill.colour", juce::var ("FF00FF00"))
                   && m.getValue ("custom.Parts.cap.Background.Fill.colour").toString() == "FF00FF00",
               "export: a write into an authored part's defaulted section lands (it was refused when the part was sparse)");

    }

    std::cout << "--------------------\n" << (failures == 0 ? "ALL PASS" : (juce::String (failures) + " FAILED").toRawUTF8()) << std::endl;
    return failures == 0 ? 0 : 1;
}
