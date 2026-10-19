// Unit test for ceditor::PanelValueModel — the C++ "full mirror" used by the window-closed script
// runtime. Verifies its get/set path resolution matches the WebView JS runtime (panelRuntime.js /
// controlTreeUtils.js): shorthands, explicit section paths, per-section search, value channels,
// lookup by id, write round-trips, and the name index staying true across renames.

#include "Player/PanelValueModel.h"
#include <iostream>
#include <thread>
#include <vector>

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

// Arrays on the way to a value: a control's list of items, and a panel property with a nested object.
const char* kArrayPanel = R"JSON({
  "name": "Arrays",
  "bgGradient": { "angle": 90, "name": "dusk" },
  "controls": [
    { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "l1", "name": "list" },
        "Items": { "_type": "Items", "items": [ { "label": "A" }, { "label": "B" } ] } } }
  ]
})JSON";

// An export payload whose controls share a drawing (stores/documentDrawings.js): written once in
// `drawings`, referred to by name, over the same defaults as above.
const char* kDrawingsPanel = R"JSON({
  "name": "Drawings",
  "documentForm": "export",
  "controls": [
    { "_type": "Control", "_children": {
        "Core": { "id": "a", "name": "twinA", "controlType": "CustomComponent" },
        "Parts": { "_drawing": "d1" } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "b", "name": "twinB", "controlType": "CustomComponent" },
        "Parts": { "_drawing": "d1" } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "e", "name": "extra", "controlType": "CustomComponent" },
        "Parts": { "_drawing": "d1", "_children": {
          "badge": { "_type": "Part", "name": "badge", "_children": { "Layout": { "x": 9 } } } } } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "l", "name": "lost", "controlType": "CustomComponent" },
        "Parts": { "_drawing": "nowhere" } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "k", "name": "knobbed", "controlType": "Knob" },
        "Parts": { "_drawing": "d1" } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "box", "name": "box", "controlType": "Container" },
        "Children": { "_children": {
          "i": { "_type": "Control", "_children": {
            "Core": { "id": "i", "name": "inner", "controlType": "CustomComponent" },
            "Parts": { "_drawing": "d1" } } } } } } }
  ],
  "drawings": {
    "d1": { "_children": {
      "cap": { "_type": "Part", "name": "cap", "_children": {
        "Background": { "_type": "Background" },
        "Layout": { "x": 4 } } } } }
  },
  "controlDefaults": {
    "types": {
      "Knob": { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "", "name": "", "controlType": "Knob" },
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

// An export payload whose list entries are written as a diff against baselines it carries in
// controlDefaults.entries (documentEntries.js). One entry of each kind; a channel that removes
// fields; one that is a diff against its type's own entry, not the baseline; a list the payload has
// no baseline for; and a container's child whose channel removes one, which must stay removed.
const char* kEntriesPanel = R"JSON({
  "name": "Entries",
  "documentForm": "export",
  "controls": [
    { "_type": "Control", "_children": {
        "Core": { "id": "s1", "name": "seq", "controlType": "Custom" },
        "ValueChannels": { "_children": {
          "level": { "_type": "ValueChannel", "name": "level", "max": 127 },
          "pattern": { "_type": "ValueChannel", "name": "pattern", "type": "array", "items": [], "_removed": ["currentValue", "snap"] },
          "mainValue": { "currentValue": 0.25 },
          "_removed": ["mode"] } },
        "HitZones": { "_children": {
          "grab": { "_type": "HitZone", "name": "grab", "bounds": { "width": 50 } },
          "other": { "_type": "HitZone", "name": "other", "cursor": "move" } } },
        "Value": { "rows": [ { "id": "a", "displayText": "A" }, { "id": "b", "enabled": false, "_removed": ["visualOverrides"] } ] },
        "DeviceBindings": { "bindings": [ { "parameterId": "cutoff" } ] },
        "Bindings": { "_children": { "led": { "_type": "Binding", "name": "led", "target": "x" } } } } },
    { "_type": "Control", "_children": {
        "Core": { "id": "box", "name": "box", "controlType": "Custom" },
        "Children": { "_children": {
          "inner": { "_type": "Control", "_children": {
            "Core": { "id": "inner", "name": "inner", "controlType": "Custom" },
            "ValueChannels": { "_children": {
              "steps": { "_type": "ValueChannel", "name": "steps", "_removed": ["currentValue"] } } } } } } } } }
  ],
  "controlDefaults": {
    "types": {
      "Custom": { "_type": "Control", "_children": {
        "Core": { "_type": "Core", "id": "", "name": "", "controlType": "Custom" },
        "ValueChannels": { "_type": "ValueChannels", "_children": {
          "mainValue": { "_type": "ValueChannel", "name": "mainValue", "min": 0, "max": 1, "currentValue": 0.5 },
          "mode": { "_type": "ValueChannel", "name": "mode", "currentValue": "A" } } },
        "HitZones": { "_type": "HitZones", "_children": {} },
        "Bindings": { "_type": "Bindings", "_children": {} },
        "Value": { "_type": "Value", "value": 0, "rows": [] },
        "DeviceBindings": { "_type": "DeviceBindings", "bindings": [] },
        "Children": { "_type": "Children", "_children": {} } } }
    },
    "entries": {
      "HitZones": { "_type": "HitZone", "name": "", "shape": "rectangle", "cursor": "pointer",
                    "bounds": { "x": 0, "y": 0, "width": 100, "height": 100 }, "meta": {} },
      "ValueChannels": { "_type": "ValueChannel", "name": "", "type": "float", "min": 0, "max": 1, "currentValue": 0,
                         "snap": { "enabled": true } },
      "Value": { "id": "", "displayText": "", "enabled": true, "visualOverrides": {} },
      "DeviceBindings": { "kind": "deviceParameter", "parameterId": "", "feedback": { "receiveUpdates": true } }
    }
  }
})JSON";

// The colour rule, window shut: a Label with a fill, a border and a font, a Meter with two zones, and
// a control that has made none of its sections. The panel names a set it carries, as an export does.
const char* kColourPanel = R"JSON({
  "name": "Colours",
  "bgColour": "FF000000",
  "controlSet": { "id": "mine" },
  "controlSets": [ { "id": "mine", "name": "Mine", "tokens": { "brand": "FF123456" } } ],
  "controls": [
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "l1", "name": "lbl", "controlType": "Label" },
      "Behavior": { "_type": "Behavior", "min": 0, "max": 255 },
      "Background": { "_type": "Background", "_children": {
        "Fill": { "_type": "Fill", "colour": "FF112233", "mode": "solid" },
        "Border": { "_type": "Border", "top": { "style": "solid", "thickness": 1, "colour": "FF000000" } } } },
      "Text": { "_type": "Text", "content": "Hi", "_children": {
        "Font": { "_type": "Font", "colour": "FFFFFFFF", "underlineColour": "" } } } } },
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "m1", "name": "meter", "controlType": "Meter" },
      "Meter": { "_type": "Meter", "zones": [ { "from": 0, "colour": "FF00FF00" }, { "from": 0.8, "colour": "FFFF0000" } ] } } },
    { "_type": "Control", "_children": { "Core": { "_type": "Core", "id": "b1", "name": "bare" } } }
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

    // --- an export payload with drawings written once: each control that names one has it --------
    {
        ceditor::PanelValueModel m;
        check (m.loadFromJson (kDrawingsPanel), "Parsed the payload with drawings");
        const auto fill = [&m] (const char* control) { return m.getValue (juce::String (control) + ".Parts.cap.Background.Fill.colour").toString(); };
        check ((int) m.getValue ("twinA.Parts.cap.Layout.x") == 4 && fill ("twinA") == "FFFFFFFF"
                   && (int) m.getValue ("twinB.Parts.cap.Layout.x") == 4 && fill ("twinB") == "FFFFFFFF",
               "drawings: both controls that name the drawing have it, rebuilt over the defaults");
        check ((int) m.getValue ("extra.Parts.cap.Layout.x") == 4 && (int) m.getValue ("extra.Parts.badge.Layout.x") == 9,
               "drawings: a reference's own keys go over the drawing");
        check (m.getValue ("lost.Parts.cap").isVoid(), "drawings: a control naming a drawing the payload lacks opens without it");
        check ((int) m.getValue ("inner.Parts.cap.Layout.x") == 4, "drawings: a container's child has its drawing too");
        check (! m.getValue ("knobbed.Parts.track").isVoid() && m.getValue ("twinA.Parts.track").isVoid()
                   && (int) m.getValue ("knobbed.Parts.cap.Layout.x") == 4,
               "drawings: one drawing over two types is rebuilt over each (the knob keeps the part its type ships)");
        check (m.getValue ("panel.drawings").isVoid(), "drawings: the table is not part of the panel a script sees");

        check (m.setValue ("twinA.Parts.cap.Background.Fill.colour", juce::var ("FF00FF00")) && fill ("twinA") == "FF00FF00",
               "drawings: a write into a shared drawing's part lands");
        check (fill ("twinB") == "FFFFFFFF" && fill ("inner") == "FFFFFFFF" && fill ("extra") == "FFFFFFFF" && fill ("knobbed") == "FFFFFFFF",
               "  and reaches no other control that shares the drawing, rebuilt or carried");
        check (m.setValue ("twinB.Parts.cap.Layout.x", juce::var (7)) && (int) m.getValue ("twinB.Parts.cap.Layout.x") == 7
                   && (int) m.getValue ("twinA.Parts.cap.Layout.x") == 4 && (int) m.getValue ("inner.Parts.cap.Layout.x") == 4,
               "drawings: so does one into the twin");

        ceditor::PanelValueModel again;
        check (again.loadFromJson (kDrawingsPanel)
                   && again.getValue ("twinA.Parts.cap.Background.Fill.colour").toString() == "FFFFFFFF"
                   && (int) again.getValue ("twinB.Parts.cap.Layout.x") == 4,
               "drawings: a second model of the same payload starts from the drawing, not from the first one's writes");
    }

    // --- an export payload's list entries, put back over the baselines it carries ----------------
    // Read as the complete form had them; written to without reaching another entry that shares a
    // baseline's node, or another model; and a payload from before payloads carried baselines read
    // as it came, its entries whole.
    {
        const auto keysOf = [] (const juce::var& v)
        {
            juce::StringArray names;
            if (auto* o = v.getDynamicObject())
                for (const auto& p : o->getProperties()) names.add (p.name.toString());
            return names.joinIntoString (",");
        };
        const auto shared = ceditor::PanelValueModel::share (juce::JSON::parse (kEntriesPanel));
        ceditor::PanelValueModel m, other;
        m.load (shared);
        other.load (shared);

        check ((int) m.getValue ("seq.ValueChannels.level.max") == 127 && m.getValue ("seq.ValueChannels.level.type").toString() == "float"
                   && (bool) m.getValue ("seq.ValueChannels.level.snap.enabled"),
               "entries: a channel is its diff over the baseline");
        check (! m.getValue ("seq.level").isVoid() && (int) m.getValue ("seq.level") == 0,
               "entries: a script reads a channel by its name, the baseline's currentValue");
        check (m.getValue ("seq.ValueChannels.pattern.currentValue").isVoid() && m.getValue ("seq.ValueChannels.pattern.snap").isVoid()
                   && m.getValue ("seq.ValueChannels.pattern.type").toString() == "array",
               "entries: what an entry removed from the baseline stays removed");
        check ((double) m.getValue ("seq.ValueChannels.mainValue.currentValue") == 0.25 && (int) m.getValue ("seq.ValueChannels.mainValue.max") == 1
                   && m.getValue ("seq.ValueChannels.mainValue.snap").isVoid(),
               "entries: one that is a diff against its type's own entry is rebuilt over that, not the baseline");
        check (m.getValue ("seq.ValueChannels.mode").isVoid(), "entries: an entry of the type's the author deleted stays deleted");
        check ((int) m.getValue ("seq.HitZones.grab.bounds.width") == 50 && (int) m.getValue ("seq.HitZones.grab.bounds.height") == 100
                   && m.getValue ("seq.HitZones.grab.cursor").toString() == "pointer",
               "entries: a grab area, nested defaults included");
        check (keysOf (m.getValue ("seq.HitZones.grab")) == "_type,name,shape,cursor,bounds,meta"
                   && keysOf (m.getValue ("seq.HitZones.grab.bounds")) == "x,y,width,height",
               "entries: keys in the baseline's order, as the WebView has them");
        check ((bool) m.getValue ("seq.Value.rows.0.enabled") && m.getValue ("seq.Value.rows.0.visualOverrides").isObject()
                   && ! (bool) m.getValue ("seq.Value.rows.1.enabled") && m.getValue ("seq.Value.rows.1.visualOverrides").isVoid()
                   && m.getValue ("seq.Value.rows.1.displayText").toString().isEmpty(),
               "entries: each choice of a list, with what it removed left out");
        check (m.getValue ("seq.DeviceBindings.bindings.0.kind").toString() == "deviceParameter"
                   && m.getValue ("seq.DeviceBindings.bindings.0.parameterId").toString() == "cutoff"
                   && (bool) m.getValue ("seq.DeviceBindings.bindings.0.feedback.receiveUpdates"),
               "entries: a device binding");
        check (m.getValue ("seq.Bindings.led.target").toString() == "x" && m.getValue ("seq.Bindings.led.enabled").isVoid(),
               "entries: a list the payload has no baseline for is left as it came");
        check (m.getValue ("inner.ValueChannels.steps.currentValue").isVoid() && (int) m.getValue ("inner.ValueChannels.steps.max") == 1,
               "entries: a container's child is put back once (twice would bring back what it removed)");
        check (m.getValue ("panel.controlDefaults").isVoid(), "entries: the baselines are not part of the panel a script sees");

        check (m.setValue ("seq.HitZones.grab.bounds.height", juce::var (40)) && (int) m.getValue ("seq.HitZones.grab.bounds.height") == 40,
               "entries: a write into a default an entry shares with its baseline lands");
        check ((int) m.getValue ("seq.HitZones.other.bounds.height") == 100 && (int) other.getValue ("seq.HitZones.grab.bounds.height") == 100,
               "  and reaches neither the other entry sharing that node nor another model");
        check (m.setValue ("seq.DeviceBindings.bindings.0.feedback.receiveUpdates", juce::var (false))
                   && ! (bool) m.getValue ("seq.DeviceBindings.bindings.0.feedback.receiveUpdates")
                   && (bool) other.getValue ("seq.DeviceBindings.bindings.0.feedback.receiveUpdates"),
               "entries: so does one through an array's entry");
        check (m.setValue ("seq.level", juce::var (64)) && (int) m.getValue ("seq.level") == 64 && (int) other.getValue ("seq.level") == 0,
               "entries: and a channel's value written by its name");

        ceditor::PanelValueModel before;
        check (before.loadFromJson (juce::String (kEntriesPanel).replace ("\"entries\"", "\"unrelated\"")), "entries: parsed a payload without baselines");
        check (before.getValue ("seq.HitZones.grab.cursor").isVoid() && (int) before.getValue ("seq.HitZones.grab.bounds.width") == 50
                   && before.getValue ("seq.HitZones.grab.bounds.height").isVoid(),
               "  its entries are read as they came, as a payload written before baselines travelled has them whole");
    }

    // --- one document, two models: two instances of a panel in one DAW --------------------------
    // The document is parsed and rebuilt once and shared (SharedPanelDocument); each model owns
    // only what it writes, so neither sees the other's writes and the shared document stays as it was.
    {
        const auto shared = ceditor::PanelValueModel::share (juce::JSON::parse (kExportPanel));
        ceditor::PanelValueModel a, b;
        a.load (shared);
        b.load (shared);
        const auto node = [] (const ceditor::PanelValueModel& m, const char* name) { return (const void*) m.controlByName (name).getDynamicObject(); };
        check (node (a, "first") == node (b, "first") && node (a, "inner") == node (b, "inner"),
               "shared: two models of one document read the same controls; nothing was copied for either");

        check (a.setValue ("first.Transform.x", juce::var (33)) && (int) a.getValue ("first.Transform.x") == 33,
               "shared: a write in one model lands there");
        check ((int) b.getValue ("first.Transform.x") == 10, "  and the other model does not see it");
        check (node (a, "first") != node (b, "first") && node (a, "second") == node (b, "second"),
               "  the control it reached is the writer's own now, and the rest are still shared");
        ceditor::PanelValueModel later;
        later.load (shared);
        check ((int) later.getValue ("first.Transform.x") == 10,
               "  and a model loaded after it starts from the shared document, not from the write");

        check (b.setValue ("inner.value", juce::var (0.25)) && (double) b.getValue ("inner.value") == 0.25
                   && (double) a.getValue ("inner.value") == 0.75 && (double) later.getValue ("inner.value") == 0.75,
               "shared: a write into a container's child stays in the model that made it");
        check (node (b, "box") != node (a, "box") && node (a, "box") == node (later, "box"),
               "  the container on the way became that model's own too");

        check (a.setValue ("custom.Parts.cap.Background.Fill.colour", juce::var ("FF0000FF"))
                   && b.getValue ("custom.Parts.cap.Background.Fill.colour").toString() == "FFFFFFFF",
               "shared: a write into a part's defaulted section reaches neither the defaults nor the other model");

        check (a.setValue ("panel.name", juce::var ("Renamed")) && a.getValue ("panel.name").toString() == "Renamed"
                   && b.getValue ("panel.name").toString() == "Export",
               "shared: a panel property written in one model only");

        check (a.setValue ("first.name", juce::var ("primo")) && ! a.controlByName ("primo").isVoid() && a.controlByName ("first").isVoid()
                   && ! b.controlByName ("first").isVoid() && b.controlByName ("primo").isVoid(),
               "shared: a rename in one model leaves the other's names as they were");
        check ((int) a.getValue ("primo.Transform.x") == 33, "  and the renamed control is still the one it wrote into");
    }

    // --- through an array: the copy has to go into the document ----------------------------------
    // JUCE's setProperty skips a value equal to the one there, and compares arrays by their items, so
    // a copy of an array (the same items) was never put in, and a write through it went nowhere.
    {
        const auto shared = ceditor::PanelValueModel::share (juce::JSON::parse (kArrayPanel));
        ceditor::PanelValueModel a, b;
        a.load (shared);
        b.load (shared);
        check (a.setValue ("list.Items.items.1.label", juce::var ("B2")) && a.getValue ("list.Items.items.1.label").toString() == "B2",
               "arrays: a write through an item of a shared array lands");
        check (b.getValue ("list.Items.items.1.label").toString() == "B" && a.getValue ("list.Items.items.0.label").toString() == "A",
               "  in the writer only, and the item beside it is untouched");
        check (a.setValue ("panel.bgGradient.angle", juce::var (45)) && (int) a.getValue ("panel.bgGradient.angle") == 45
                   && (int) b.getValue ("panel.bgGradient.angle") == 90 && b.getValue ("panel.bgGradient.name").toString() == "dusk",
               "arrays: a nested panel property written in one model only");
    }

    // --- one document per panel file, for every caller on any thread -----------------------------
    // Hosts build plug-in instances on threads of their own choosing, sometimes several at once.
    {
        const auto file = juce::File::createTempFile (".cepanel");
        file.replaceWithText (kExportPanel);
        std::vector<std::shared_ptr<const ceditor::SharedPanelDocument>> got (8);
        std::vector<std::thread> threads;
        for (size_t i = 0; i < got.size(); ++i)
            threads.emplace_back ([&got, &file, i] { got[i] = ceditor::PanelValueModel::sharedForFile (file); });
        for (auto& t : threads) t.join();
        bool same = got[0] != nullptr;
        for (const auto& g : got) same = same && g == got[0];
        check (same, "file: eight threads asking at once get one document");
        check (ceditor::PanelValueModel::sharedForFile (file) == got[0], "  and so does a caller while it is held");

        const std::weak_ptr<const ceditor::SharedPanelDocument> held = got[0];
        got.clear();
        check (held.expired(), "file: nobody holding it, it is gone (the cache keeps no document alive)");

        juce::Thread::sleep (20);
        file.replaceWithText (juce::String (kExportPanel).replace ("\"Export\"", "\"Changed\""));
        check (ceditor::PanelValueModel::sharedForFile (file)->doc.getProperty ("name", {}).toString() == "Changed",
               "file: a file that changed is read again");
        file.deleteFile();
    }

    // --- colours: the editor's rule, case for case ---------------------------------------------------
    // CE/web/test/fixtures/colourPropertyCases.json is what colourPropertyCases.test.js runs through
    // the editor's scriptColours.js. Every case must be stored, written out or refused here exactly as
    // there, in the same words; every field case typed the same; every reference resolved the same.
    {
        namespace colours = ceditor::scripting::colours;
        const auto fixture = juce::File (__FILE__).getParentDirectory()   // CE/tests
                                 .getParentDirectory()                     // CE
                                 .getChildFile ("web/test/fixtures/colourPropertyCases.json");
        const auto cases = juce::JSON::parse (fixture.loadFileAsString());
        check (cases.isObject(), "colours: the shared cases are where colourPropertyCases.test.js reads them ("
                                     + fixture.getFullPathName() + ")");

        juce::StringArray names;
        if (auto* list = cases.getProperty ("controlSetNames", {}).getArray())
            for (const auto& n : *list) names.add (n.toString());
        const colours::ResolvesToken resolves = [&names] (const juce::String& name) { return names.contains (name); };
        auto fieldOf = [&cases] (const juce::var& kind)
        {
            const auto f = cases.getProperty ("fields", {}).getProperty (juce::Identifier (kind.toString()), {});
            return colours::Field { (bool) f.getProperty ("empty", false), (bool) f.getProperty ("tokens", false) };
        };
        auto shown = [] (const juce::var& v) { return v.isVoid() ? juce::String ("null") : juce::JSON::toString (v, true); };

        int count = 0, wrong = 0;
        if (auto* list = cases.getProperty ("cases", {}).getArray())
            for (const auto& c : *list)
            {
                ++count;
                const auto value = c.getProperty ("value", {});
                const auto read = colours::panelColour (value, fieldOf (c.getProperty ("field", {})), resolves);
                const bool stored = c.getDynamicObject()->hasProperty ("stored");
                const bool agrees = stored
                    ? read.ok && read.colour.isString() && read.colour.toString() == c.getProperty ("stored", {}).toString()
                    : ! read.ok && read.why == c.getProperty ("why", {}).toString() && read.advice == c.getProperty ("advice", {}).toString();
                if (agrees) continue;
                ++wrong;
                check (false, "colours: " + c.getProperty ("case", {}).toString() + ", " + shown (value) + ": got "
                                  + (read.ok ? "stored " + read.colour.toString() : read.why + " | " + read.advice));
            }
        check (count > 100 && wrong == 0, "colours: all " + juce::String (count)
                                              + " property cases stored or refused as the editor does, in its words");

        count = 0;
        wrong = 0;
        const auto roots = cases.getProperty ("roots", {});
        if (auto* list = cases.getProperty ("fieldCases", {}).getArray())
            for (const auto& c : *list)
            {
                ++count;
                const auto root = roots.getProperty (juce::Identifier (c.getProperty ("root", {}).toString()), {});
                const auto found = colours::colourFieldAt (root, c.getProperty ("path", {}).toString());
                const auto want = c.getProperty ("field", {});
                const bool agrees = want.isObject()
                    ? found && found->empty == (bool) want.getProperty ("empty", false) && found->tokens == (bool) want.getProperty ("tokens", false)
                    : ! found.has_value();
                if (agrees) continue;
                ++wrong;
                check (false, "colours: " + c.getProperty ("case", {}).toString() + ": got "
                                  + (found ? juce::String (found->empty ? "empty " : "") + (found->tokens ? "tokens" : "colour") : juce::String ("not a colour")));
            }
        check (count > 20 && wrong == 0, "colours: all " + juce::String (count) + " field cases typed as the editor types them");

        count = 0;
        wrong = 0;
        if (auto* list = cases.getProperty ("controlSetCases", {}).getArray())
            for (const auto& c : *list)
            {
                ++count;
                const bool got = colours::controlSetResolves (c.getProperty ("panel", {}), c.getProperty ("name", {}).toString());
                if (got == (bool) c.getProperty ("resolves", {})) continue;
                ++wrong;
                check (false, "colours: " + c.getProperty ("case", {}).toString() + ": got " + (got ? "resolves" : "does not resolve"));
            }
        check (count > 20 && wrong == 0, "colours: all " + juce::String (count)
                                             + " references resolved on their panel as the editor resolves them");

        // JavaScript's numbers, which the refusals print and the CSS forms are read and rounded by.
        check (colours::jsNumber (0.30000000000000004) == "0.30000000000000004" && colours::jsNumber (-0.0) == "0"
                   && colours::jsNumber (5e-324) == "5e-324" && colours::jsNumber (1e-6) == "0.000001"
                   && colours::jsNumber (1.23e-18) == "1.23e-18" && colours::jsNumber (-1234.5) == "-1234.5"
                   && colours::jsNumber (1e20) == "100000000000000000000" && colours::jsNumber (2.5e21) == "2.5e+21",
               "colours: a number prints as String() prints it in JavaScript");
        check (colours::jsRound (0.49999999999999994) == 0.0 && colours::jsRound (-0.5) == 0.0 && colours::jsRound (2.5) == 3.0
                   && colours::jsRound (-2.5) == -2.0 && colours::jsRound (127.49999999999999) == 127.0,
               "colours: a half rounds up, toward +infinity, as Math.round rounds it, and only a half");

        // Through the window-shut model, as BridgeScriptHost asks it for every engine's set().
        ceditor::PanelValueModel colourModel;
        check (colourModel.loadFromJson (kColourPanel), "colours: loaded the colour panel");
        auto write = [&colourModel] (const juce::String& path, const juce::var& value, const juce::String& form = "value")
        { return colourModel.colourWrites ("set(\"" + path + "\")", path, value, form); };
        const juce::String forms = "A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without \"#\", or \"#RGB\", "
                                   "a CSS colour name, rgb() or hsl()";

        const auto red = write ("lbl.background.fill.colour", "red");
        check (! red.refused && red.value.toString() == "#FF0000" && red.lines.isEmpty(),
               "colours: a name is written out, without a word");
        check (write ("lbl.background.fill.colour", "FF5B9BD5").value.toString() == "FF5B9BD5"
                   && write ("lbl.Background.Fill.colour", "#abc").value.toString() == "#AABBCC",
               "colours: the panel's own form is stored as written, and \"#RGB\" written out");
        const auto redd = write ("lbl.background.fill.colour", "redd");
        check (redd.refused && redd.lines.size() == 1
                   && redd.lines[0] == "set(\"lbl.background.fill.colour\"): \"redd\" is not a colour the panel can read, so "
                                       "nothing was set. " + forms + ".",
               "colours: what the panel cannot read is refused in set()'s sentence (got " + redd.lines.joinIntoString (" / ") + ")");
        const auto number = write ("lbl.background.fill.colour", 16711680);
        check (number.refused && number.lines[0].endsWith (" As text, 16711680 is \"#FF0000\"."),
               "colours: a number is refused, with how it reads as text");

        // A section or a list written whole: each colour field in it, and nothing written over one.
        auto* topObject = new juce::DynamicObject();
        topObject->setProperty ("style", "solid");
        topObject->setProperty ("thickness", 3);
        topObject->setProperty ("colour", "#0008");
        const auto whole = write ("lbl.background.border.top", juce::var (topObject));
        check (whole.refused && whole.lines.size() == 1
                   && whole.lines[0] == "set(\"lbl.background.border.top\"): at colour, \"#0008\" is not a colour the panel can "
                                        "read, so nothing was set. " + forms + ". Write \"88000000\".",
               "colours: a section written whole names the field it refused (got " + whole.lines.joinIntoString (" / ") + ")");
        const auto top = juce::JSON::parse (R"({ "style": "solid", "thickness": 3, "colour": "red" })");
        const auto topWritten = write ("lbl.background.border.top", top);
        check (! topWritten.refused && topWritten.value.getProperty ("colour", {}).toString() == "#FF0000"
                   && (int) topWritten.value.getProperty ("thickness", {}) == 3
                   && top.getProperty ("colour", {}).toString() == "red" && topWritten.value.getDynamicObject() != top.getDynamicObject(),
               "colours: and one it can read is written out, in a copy, the script's own table as it wrote it");
        const auto plain = juce::JSON::parse (R"({ "colour": "FF000000", "thickness": 2 })");
        check (write ("lbl.background.border.top", plain).value.getDynamicObject() == plain.getDynamicObject(),
               "colours: a section with nothing to write out is the very value given");
        const auto zones = juce::JSON::parse (R"([ { "from": 0, "colour": "lime" }, { "from": 0.8, "colour": "FFFF0000" } ])");
        const auto zonesWritten = write ("meter.meter.zones", zones);
        check (! zonesWritten.refused && zonesWritten.value[0].getProperty ("colour", {}).toString() == "#00FF00"
                   && zonesWritten.value[1].getDynamicObject() == zones[1].getDynamicObject()
                   && zones[0].getProperty ("colour", {}).toString() == "lime",
               "colours: a list, at every position, copied only where something changed");
        check (write ("meter.meter.zones.3.colour", "notacolour").refused,
               "colours: a fourth zone the document lacks is typed by the template's first");

        check (! write ("lbl.text.font.underlineColour", "").refused && write ("lbl.background.fill.colour", "").refused,
               "colours: \"\" only where the property has no colour of its own");
        check (! write ("lbl.background.fill.colour", "{brand}").refused && ! write ("lbl.background.fill.colour", "{accent}").refused,
               "colours: a reference to the panel's own set, and to the base set behind it");
        const auto nosuch = write ("lbl.background.fill.colour", "{nosuch}");
        check (nosuch.refused && nosuch.lines[0].endsWith (". The panel's control set has no colour called \"nosuch\"."),
               "colours: a reference the panel's sets lack is refused, naming it");

        check (write ("lbl.text.content", "red").value.toString() == "red" && ! write ("lbl.text.content", "red").refused,
               "colours: a property that is not a colour is left alone, whatever it holds");
        check (write ("panel.bgColour", "redd").value.toString() == "redd" && ! write ("panel.bgColour", "redd").refused,
               "colours: the panel document is not read, as the editor's set() does not read it");
        check (! write ("nosuch.background.fill.colour", "redd").refused,
               "colours: a control that is not there is left for setValue to report");
        check (write ("bare.background.fill.colour", "redd").refused && write ("bare.icon.tint", "{accent}").refused,
               "colours: a section the control has not made yet is typed by its template");
        const auto position = write ("lbl.background.fill.colour", 0.5, "normalizedValue");
        check (position.refused && position.lines[0].startsWith ("set(\"lbl.background.fill.colour\"): 127.5 is not a colour"),
               "colours: a position is refused as the number it stands for (got " + position.lines.joinIntoString (" / ") + ")");

        check (colourModel.isColourProperty ("lbl.background.fill.colour") && colourModel.isColourProperty ("LBL.Background.Fill.COLOUR")
                   && colourModel.isColourProperty ("bare.icon.tint") && colourModel.isColourProperty ("meter.meter.zones.5.colour"),
               "colours: ce.anim's question, a colour property, found as set() finds it");
        check (! colourModel.isColourProperty ("lbl.text.content") && ! colourModel.isColourProperty ("lbl.transform.x")
                   && ! colourModel.isColourProperty ("panel.bgColour") && ! colourModel.isColourProperty ("nosuch.background.fill.colour")
                   && ! colourModel.isColourProperty ("lbl"),
               "colours: and not where it is not one, or not a control's");
    }

    std::cout << "--------------------\n" << (failures == 0 ? "ALL PASS" : (juce::String (failures) + " FAILED").toRawUTF8()) << std::endl;
    return failures == 0 ? 0 : 1;
}
