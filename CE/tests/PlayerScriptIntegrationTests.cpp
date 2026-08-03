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

// Slice 2, window-closed: the ce.midi channel-message verbs and the ce.storage pair. The script
// reaches for them through the MODULE namespace (ce.midi.sendNote, ce.storage.saveSetting) rather
// than the bare globals, so this also proves the generated `ce.*` block survives the export path.
const char* kModulePanel = R"JSON({
  "name": "Modules",
  "scripting": { "enabled": true, "runOnExport": true },
  "scripts": [
    { "id": "mod", "name": "mod", "language": "lua", "scope": "panel", "event": "onReadBack", "target": "*", "enabled": true,
      "source": "function onNotes()\n  ce.midi.sendNote(1, \"C4\", 100)\n  ce.midi.sendProgramChange(2, 5)\n  ce.midi.sendPitchBend(1, 8192)\n  ce.midi.sendClock()\nend\nfunction onSettings()\n  local n = ce.storage.loadSetting(\"count\", 0)\n  ce.storage.saveSetting(\"count\", n + 1)\n  log(\"count \" .. tostring(ce.storage.loadSetting(\"count\", 0)))\n  log(\"missing \" .. tostring(ce.storage.loadSetting(\"nope\", \"fallback\")))\n  ce.storage.state.seen = (ce.storage.state.seen or 0) + 1\n  log(\"seen \" .. tostring(state.seen))\nend\n" }
  ],
  "controls": [
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
      "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 127 },
      "Value": { "_type": "Value", "value": 0 }
    } }
  ]
})JSON";

juce::String hex (const juce::Array<int>& bytes)
{
    juce::StringArray out;
    for (auto b : bytes) out.add (juce::String::toHexString (b).paddedLeft ('0', 2).toUpperCase());
    return out.joinIntoString (" ");
}
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

    // --- slice 2: ce.midi channel messages + ce.storage, window-closed -----------------------
    {
        PanelValueModel modModel;
        check (modModel.loadFromJson (kModulePanel), "loaded the module panel");

        juce::StringArray modLogs, midiOut;
        // Stand in for PluginProcessor's `scriptSettings` NamedValueSet, which it now writes into
        // the DAW session as a ScriptSettings child. Same shape, same lifetime within a session.
        juce::NamedValueSet settings;

        BridgeScriptHost::Callbacks mcb;
        mcb.getValue = [&] (const juce::String& p, const juce::String& f) { return modModel.getValue (p, f); };
        mcb.setValue = [&] (const juce::String& p, const juce::var& v, bool, const juce::String& f) { modModel.setValue (p, v, f); };
        mcb.log      = [&] (const juce::String& m, const juce::var&) { modLogs.add (m); };
        mcb.sendCC   = [] (int, int, const juce::var&) {};
        mcb.sendNRPN = [] (int, int, int, const juce::var&) {};
        mcb.sendSysex = [] (const juce::var&) {};
        mcb.requestDump = [] (const juce::String&) {};
        mcb.applyDump = [] (const juce::var&) {};
        mcb.sendDump = [] (const juce::String&) {};
        mcb.buildDump = [] (const juce::String&) { return juce::var(); };
        // Byte-for-byte what PluginProcessor's cb.sendMidi clamps and forwards to the MIDI port.
        mcb.sendMidi = [&] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr) b.add (juce::jlimit (0, 255, (int) x));
            if (! b.isEmpty()) midiOut.add (hex (b));
        };
        mcb.saveSetting = [&] (const juce::String& k, const juce::var& v, const juce::String&) { settings.set (k, v); };
        mcb.loadSetting = [&] (const juce::String& k, const juce::String&) { return settings.getWithDefault (k, juce::var()); };

        BridgeScriptHost modHost (std::move (mcb));
        ScriptRuntime modRuntime (modHost);
        modHost.attachRuntime (&modRuntime);
        modRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        modRuntime.loadScripts (gatherPanelScripts (modModel.panel()));

        modRuntime.runAction ("onNotes", juce::var());
        check (midiOut.size() == 4, "four channel messages reached the host (got " + juce::String (midiOut.size()) + ")");
        check (midiOut[0] == "90 3C 64", "sendNote(1, \"C4\", 100) -> 90 3C 64 (got " + midiOut[0] + ")");
        check (midiOut[1] == "C1 05",    "sendProgramChange(2, 5) -> C1 05 (got " + midiOut[1] + ")");
        check (midiOut[2] == "E0 00 40", "sendPitchBend centre -> E0 00 40 (got " + midiOut[2] + ")");
        check (midiOut[3] == "F8",       "sendClock -> F8 (got " + midiOut[3] + ")");

        modRuntime.runAction ("onSettings", juce::var());
        check (modLogs.contains ("count 1"), "saveSetting/loadSetting round-trip through the host store");
        check (modLogs.contains ("missing fallback"), "loadSetting returns the fallback for an unset key");
        check (modLogs.contains ("seen 1"), "state is per-script scratch, reachable bare and via ce.storage");
        check ((int) settings.getWithDefault ("count", juce::var (0)) == 1,
               "the setting landed in the host's own store, not just the script's");

        // Second dispatch: the setting persists across calls, and so does `state` until reload.
        modLogs.clear();
        modRuntime.runAction ("onSettings", juce::var());
        check (modLogs.contains ("count 2"), "the saved setting survives the next dispatch");
        check (modLogs.contains ("seen 2"), "state survives the next dispatch");

        // Reloading the scripts is what clears `state` — the settings store is untouched.
        modLogs.clear();
        modRuntime.loadScripts (gatherPanelScripts (modModel.panel()));
        modRuntime.runAction ("onSettings", juce::var());
        check (modLogs.contains ("seen 1"), "reloading the scripts clears state");
        check (modLogs.contains ("count 3"), "reloading the scripts does NOT clear saved settings");
    }

    // ---------------------------------------------------------------------------------------
    // The wire filters, as the PLAYER uses them.
    //
    // The engine-level test in ScriptRuntimeTests calls runtime.filterMidi() directly. That proves
    // the chain works; it does NOT prove anything calls it — and for one commit, nothing did. The
    // verbs were in the contract, the engines held the closures, and the exported plugin ran none
    // of it. So this test asserts the thing that was actually missing: a send goes THROUGH the
    // filter on its way out, and an inbound message goes through on its way in.
    {
        const char* kWirePanel = R"JSON({
          "name": "Wire",
          "scripting": { "enabled": true, "runOnExport": true },
          "scripts": [
            { "id": "w1", "name": "wire", "language": "lua", "scope": "panel", "event": "onPanelLoad", "target": "*", "enabled": true,
              "source": "function onPanelLoad()\n  interceptMidiOut(function(b) if b[2] == 74 then return false end b[3] = 127 return b end)\n  interceptMidiIn(function(b) b[2] = b[2] + 12 return b end)\nend\nfunction onCcIn(e) log(\"cc \" .. e.cc) end\nfunction blast() sendCC(1, 80, 5) sendCC(1, 74, 5) end" }
          ],
          "controls": []
        })JSON";

        PanelValueModel wireModel;
        wireModel.loadFromJson (kWirePanel);

        juce::StringArray wireLogs, wireOut;
        BridgeScriptHost::Callbacks wcb;
        wcb.log = [&wireLogs] (const juce::String& m, const juce::var&) { wireLogs.add (m); };
        wcb.getValue = [] (const juce::String&, const juce::String&) { return juce::var(); };
        wcb.setValue = [] (const juce::String&, const juce::var&, bool, const juce::var&) {};
        wcb.sendCC = [&wireOut] (int ch, int cc, const juce::var& v)
            { wireOut.add (juce::String (ch) + ":" + juce::String (cc) + ":" + v.toString()); };

        BridgeScriptHost wireHost (wcb);
        ScriptRuntime wireRuntime (wireHost);
        wireRuntime.loadScripts (gatherPanelScripts (wireModel.panel()));
        wireRuntime.dispatchEvent ("onPanelLoad", "*", juce::var());

        // Outbound: the player funnels every send through filterMidi before the wire.
        juce::var outCc (juce::Array<juce::var> { 0xB0, 80, 5 });
        check (wireRuntime.filterMidi (false, outCc), "player path: CC 80 survives the outbound filter");
        check ((int) (*outCc.getArray())[2] == 127, "player path: and the filter rewrote its value");

        juce::var blocked (juce::Array<juce::var> { 0xB0, 74, 5 });
        check (! wireRuntime.filterMidi (false, blocked), "player path: CC 74 is swallowed outright");

        // Inbound: the same, on the way in — before onCcIn or any binding sees it.
        juce::var inNote (juce::Array<juce::var> { 0x90, 60, 100 });
        check (wireRuntime.filterMidi (true, inNote), "player path: an inbound note passes");
        check ((int) (*inNote.getArray())[1] == 72, "player path: transposed before any handler ran");
    }

    // ce.device declared, through the REAL BridgeScriptHost (design doc §29).
    //
    // ScriptRuntimeTests pins the registry and the preludes; what only shows up here is the
    // host's own behaviour: a declared parameter overriding a profile one in parameters(), a
    // write falling through to the profile when the parameter is NOT declared, and requestDump
    // choosing between the declared request and the profile's sync.
    {
        static constexpr const char* kDevPanel = R"JSON({
          "id": "dev", "name": "Dev",
          "scripting": { "modules": ["ce.core", "ce.device", "ce.time"] },
          "scripts": [
            { "id": "d1", "name": "dev", "language": "lua", "scope": "panel", "event": "onPanelLoad", "target": "*", "enabled": true,
              "source": "function onPanelLoad()\n  ce.device.defineParameter(\"cutoff\", { name = \"Mine\", min = 0, max = 127, cc = 74 })\nend\nfunction onList()\n  for _, p in ipairs(ce.device.parameters()) do log(\"p \" .. p.id .. \" \" .. p.name) end\nend\nfunction onMine() ce.device.write(\"cutoff\", 9) end\nfunction onTheirs() ce.device.write(\"reso\", 9) end\nfunction onAsk() requestDump(\"patch\") end" }
          ],
          "controls": []
        })JSON";

        PanelValueModel devModel;
        devModel.loadFromJson (kDevPanel);

        juce::StringArray devLogs, devMidi, devWrites, devRequests;
        BridgeScriptHost::Callbacks dcb;
        dcb.getValue = [] (const juce::String&, const juce::String&) { return juce::var(); };
        dcb.setValue = [] (const juce::String&, const juce::var&, bool, const juce::String&) {};
        dcb.log      = [&devLogs] (const juce::String& m, const juce::var&) { devLogs.add (m); };
        dcb.sendCC   = [] (int, int, const juce::var&) {};
        dcb.sendNRPN = [] (int, int, int, const juce::var&) {};
        dcb.sendSysex = [] (const juce::var&) {};
        dcb.sendMidi = [&devMidi] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray()) for (const auto& x : *arr) b.add ((int) x);
            devMidi.add (hex (b));
        };
        dcb.requestDump = [&devRequests] (const juce::String& kind) { devRequests.add (kind); };
        dcb.applyDump = [] (const juce::var&) {};
        dcb.sendDump = [] (const juce::String&) {};
        dcb.buildDump = [] (const juce::String&) { return juce::var(); };
        dcb.deviceWrite = [&devWrites] (const juce::String& id, const juce::var& v, const juce::String&)
        { devWrites.add (id + "=" + v.toString()); return true; };
        // A two-parameter profile, one of whose ids the script also declares.
        dcb.deviceQuery = [] (const juce::String& kind, const juce::var&) -> juce::var
        {
            if (kind != "parameters") return {};
            auto make = [] (const char* id, const char* name)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("id", id);
                o->setProperty ("name", name);
                return juce::var (o);
            };
            return juce::var (juce::Array<juce::var> { make ("cutoff", "Profile Cutoff"), make ("reso", "Profile Reso") });
        };

        BridgeScriptHost devHost (std::move (dcb));
        ScriptRuntime devRuntime (devHost);
        devHost.attachRuntime (&devRuntime);
        devRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        devRuntime.loadScripts (gatherPanelScripts (devModel.panel()));
        devRuntime.dispatchEvent ("onPanelLoad", "*", juce::var());

        // parameters() answers from BOTH sources, and a declared id wins — which is what lets a
        // script correct one wrong parameter without redeclaring the rest.
        devRuntime.runAction ("onList", juce::var());
        check (devLogs.contains ("p reso Profile Reso"), "parameters(): the profile's own entries are still there");
        check (devLogs.contains ("p cutoff Mine"), "parameters(): a declared id overrides the profile's");
        check (! devLogs.contains ("p cutoff Profile Cutoff"), "…and the overridden one is not listed twice");

        // write() splits on where the parameter came from.
        devRuntime.runAction ("onMine", juce::var());
        check (devMidi.contains ("B0 4A 09"), "writing a declared parameter sends its own bytes");
        check (devWrites.isEmpty(), "…and never reaches the profile's encoder");
        devRuntime.runAction ("onTheirs", juce::var());
        check (devWrites.contains ("reso=9"), "writing a profile parameter still goes through the profile");

        // requestDump with nothing declared for that kind falls through to the profile's sync.
        devRuntime.runAction ("onAsk", juce::var());
        check (devRequests.contains ("patch"), "requestDump falls through when no layout is declared");
    }

    // A set() that writes nothing has to be observable window-closed too (design doc §31).
    //
    // PluginProcessor's cb.setValue logs when this returns false. What is pinned here is the
    // primitive that reporting rests on: PanelValueModel has to be able to SAY a path led nowhere,
    // or the player is back to the silent write the panel view just stopped doing.
    {
        check (model.setValue ("cutoff.value", 64), "a real path reports that it wrote");
        check (! model.setValue ("cutoff.NoSuchSection.whatever", 1),
               "a path that leads nowhere reports that it did NOT write");
        check (! model.setValue ("noSuchControl.value", 1),
               "…and so does a control the panel does not have");
        // The exact shape that fooled the analysis in the panel view: the last three segments of a
        // state patch are ONE map key, not three path steps.
        check (! model.setValue ("cutoff.States.Hover.patches.component.Background.Fill.colour", 1),
               "a state patch key is not a path, and saying so is the point");
    }

    std::cout << "--------------------------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
