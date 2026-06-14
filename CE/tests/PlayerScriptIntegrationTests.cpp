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
      "Value": { "_type": "Value", "value": 0 }
    } }
  ]
})JSON";
}

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
    cb.getValue = [&] (const juce::String& path, const juce::String&) { return model.getValue (path); };
    cb.setValue = [&] (const juce::String& path, const juce::var& v, bool) { model.setValue (path, v); };
    cb.sendCC   = [&] (int ch, int cc, const juce::var& v) { ccCh = ch; ccNum = cc; ccVal = (int) v; };
    cb.log      = [&] (const juce::String& m, const juce::var& v) { logs.add (m + " " + v.toString()); };
    cb.sendNRPN = [] (int, int, int, const juce::var&) {};
    cb.sendSysex = [] (const juce::var&) {};
    cb.requestDump = [] (const juce::String&) {};
    cb.applyDump = [] (const juce::var&) {};
    cb.sendDump = [] (const juce::String&) {};
    cb.buildDump = [] (const juce::String&) { return juce::var(); };
    cb.runAction = [] (const juce::String&, const juce::var&) { return juce::var(); };
    cb.emitEvent = [] (const juce::String&, const juce::var&) {};

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

    std::cout << "--------------------------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
