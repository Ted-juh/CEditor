// Integration test for the window-closed script path in the exported plugin (Model 2). It wires the
// SAME pieces PluginProcessor.h does — PanelValueModel (full mirror) + gatherPanelScripts +
// BridgeScriptHost + ScriptRuntime — and dispatches onValueChanged exactly as the window-closed timer
// would, then asserts the panel's real JS script ran (its log() + sendCC() crossed back to the host).
// This proves the end-to-end chain without a DAW: panel -> gathered scripts -> engine -> dispatch ->
// API callbacks. (The APVTS/timer/MIDI-port plumbing around it is compile-verified separately.)

#include "Player/PanelValueModel.h"
#include "Scripting/BridgeScriptHost.h"
#include <iostream>

using namespace ceditor;
using namespace ceditor::scripting;

namespace
{
int failures = 0;
void check (bool ok, const juce::String& name)
{
    std::cout << (ok ? "  PASS  " : "  FAIL  ") << name << "\n";
    if (! ok) ++failures;
}

// A panel mirroring the Stage-6 test export: one control + a panel-scope onValueChanged JS script
// that logs and sends a distinctive CC 80 (the exact source shipped in gaia-scripted-test.cepanel).
const char* kPanel = R"JSON({
  "name": "WC",
  "scripting": { "enabled": true, "runInPreview": true, "runOnExport": true },
  "scripts": [
    { "id": "wc1", "name": "cc80", "language": "javascript", "scope": "panel", "event": "onValueChanged", "target": "*", "enabled": true,
      "source": "function onValueChanged(value){ log('onValueChanged window-closed', value); sendCC(1, 80, Math.round(Number(value) || 0)); }" }
  ],
  "controls": [
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
      "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 200 },
      "Value": { "_type": "Value", "value": 0 }
    } }
  ]
})JSON";

// A control WITH a numeric range, so .normalizedValue has something to normalise against, plus a
// component-scope script that reaches for a device-scope command.
const char* kAccessorPanel = R"JSON({
  "name": "Accessors",
  "width": 600,
  "height": 400,
  "scripting": { "enabled": true, "runOnExport": true },
  "scripts": [
    { "id": "acc", "name": "acc", "language": "lua", "scope": "panel", "event": "onReadBack", "target": "*", "enabled": true,
      "source": "function onReadBack()\n  set(\"cutoff.value\", 50)\n  log(\"norm \" .. tostring(get(\"cutoff.normalizedValue\")))\n  log(\"arg \" .. tostring(get(\"cutoff\", \"normalizedValue\")))\n  set(\"cutoff.normalizedValue\", 0.5)\n  log(\"after \" .. tostring(get(\"cutoff.value\")))\n  log(\"bare \" .. tostring(get(\"cutoff\")))\nend\nfunction onMidiForm()\n  local m = get(\"cutoff.midiValue\")\n  log(\"midi \" .. tostring(m))\nend\nfunction onPanelProps()\n  log(\"w \" .. tostring(get(\"panel.width\")))\n  log(\"n \" .. tostring(get(\"panel.name\")))\n  set(\"panel.width\", 900)\n  log(\"w2 \" .. tostring(get(\"panel.width\")))\n  set(\"panel.height\", 480)\n  log(\"self \" .. tostring(self.get(\"height\")))\n  log(\"count \" .. tostring(get(\"panel.controlCount\")))\n  set(\"panel.id\", 999)\nend\n" }
  ],
  "controls": [
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
      "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 200 },
      "Value": { "_type": "Value", "value": 0 }
    } }
  ]
})JSON";
} // namespace

int main()
{
    std::cout << "Player window-closed script integration test\n--------------------------------------------\n";

    PanelValueModel model;
    check (model.loadFromJson (kPanel), "loaded panel");

    const auto gathered = gatherPanelScripts (model.panel());
    check (gathered.size() == 1, "gatherPanelScripts found the source script (got " + juce::String (gathered.size()) + ")");

    // Record what the script asks the host to do (the plugin routes these to MIDI / the log file).
    int ccCh = -1, ccNum = -1, ccVal = -1;
    juce::StringArray logs;

    BridgeScriptHost::Callbacks cb;
    cb.getValue = [&] (const juce::String& path, const juce::String& form) { return model.getValue (path, form); };
    cb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form) { model.setValue (path, v, form); };
    cb.sendCC   = [&] (int ch, int cc, const juce::var& v) { ccCh = ch; ccNum = cc; ccVal = (int) v; };
    cb.log      = [&] (const juce::String& m, const juce::var& v) { logs.add (m + " " + v.toString()); };
    cb.sendNRPN = [] (int, int, int, const juce::var&) {};
    cb.sendSysex = [] (const juce::var&) {};
    cb.requestDump = [] (const juce::String&) {};
    cb.applyDump = [] (const juce::var&) {};
    cb.sendDump = [] (const juce::String&) {};
    cb.buildDump = [] (const juce::String&) { return juce::var(); };
    // runAction / emitEvent left unset: BridgeScriptHost routes them to the ScriptRuntime.

    BridgeScriptHost host (std::move (cb));
    ScriptRuntime runtime (host);
    host.attachRuntime (&runtime);
    runtime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
    runtime.loadScripts (gathered);

    // Exactly what PluginProcessor's window-closed timer does when DAW automation moves the control.
    runtime.dispatchEvent ("onValueChanged", "cutoff", juce::var (64));

    check (ccNum == 80, "script sent CC 80 (got " + juce::String (ccNum) + ")");
    check (ccVal == 64, "CC value == automation value 64 (got " + juce::String (ccVal) + ")");
    check (ccCh  == 1,  "CC channel == 1");
    check (logs.size() == 1 && logs[0].startsWith ("onValueChanged window-closed"), "script log() fired with the value");

    // A second automation step dispatches again (the timer is change-detected, but dispatch itself is stateless).
    runtime.dispatchEvent ("onValueChanged", "cutoff", juce::var (100));
    check (ccVal == 100, "second step ran: CC value == 100 (got " + juce::String (ccVal) + ")");

    // --- value representations (Q8), window-closed ------------------------------------------
    // Both spellings of the accessor, and the arithmetic behind them, against the control's own
    // Behavior.min/max. This is the layer that used to drop `form` on the floor entirely.
    {
        PanelValueModel accModel;
        check (accModel.loadFromJson (kAccessorPanel), "loaded the accessor panel");

        juce::StringArray accLogs;
        BridgeScriptHost::Callbacks acb;
        acb.getValue = [&] (const juce::String& path, const juce::String& form) { return accModel.getValue (path, form); };
        acb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form) { accModel.setValue (path, v, form); };
        acb.log      = [&] (const juce::String& m, const juce::var&) { accLogs.add (m); };
        acb.sendCC   = [] (int, int, const juce::var&) {};
        acb.sendNRPN = [] (int, int, int, const juce::var&) {};
        acb.sendSysex = [] (const juce::var&) {};
        acb.requestDump = [] (const juce::String&) {};
        acb.applyDump = [] (const juce::var&) {};
        acb.sendDump = [] (const juce::String&) {};
        acb.buildDump = [] (const juce::String&) { return juce::var(); };

        BridgeScriptHost accHost (std::move (acb));
        ScriptRuntime accRuntime (accHost);
        accHost.attachRuntime (&accRuntime);
        accRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        accRuntime.loadScripts (gatherPanelScripts (accModel.panel()));

        accRuntime.dispatchEvent ("onReadBack", "panel", juce::var());
        // value 50 of 0..200 is 0.25 either way it is asked for.
        check (accLogs.contains ("norm 0.25"), "get(\"cutoff.normalizedValue\") — path suffix");
        check (accLogs.contains ("arg 0.25"),  "get(\"cutoff\", \"normalizedValue\") — form argument");
        // Writing 0.5 as a position lands at 100 of 0..200.
        check (accLogs.contains ("after 100"), "set(.normalizedValue) maps the position onto the range");
        check (accLogs.contains ("bare 100"),  "get(\"cutoff\") means the control's value");

        // The panel itself is addressable: `panel` is a reserved first segment, and `self` in a
        // panel-scope script means the panel. Before this, the first segment was always a control
        // name, so the panel's own size and name were invisible to every script.
        accLogs.clear();
        accRuntime.runAction ("onPanelProps", juce::var());
        check (accLogs.contains ("w 600"),    "get(\"panel.width\") reads the document");
        check (accLogs.contains ("n Accessors"), "get(\"panel.name\") reads the document");
        check (accLogs.contains ("w2 900"),   "set(\"panel.width\", …) writes the document");
        check (accLogs.contains ("self 480"), "self.get(\"height\") in a panel script means the panel");
        check (accLogs.contains ("count 1"),  "panel.controlCount counts the controls");
        check (accLogs.joinIntoString ("\n").contains ("read-only"),
               "writing panel.id is refused with a reason");

        accLogs.clear();
        accRuntime.runAction ("onMidiForm", juce::var());
        check (accLogs.joinIntoString ("\n").contains ("needs the device host"),
               ".midiValue explains itself rather than returning a quiet nothing");
    }

    std::cout << "--------------------------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
