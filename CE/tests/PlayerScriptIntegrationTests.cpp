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

// A script that paints a long list and then moves a bound control, in that order — the GAIA preset
// list's load in miniature. 1,500 label writes are well past the 1,000-sends-a-second flood guard.
const char* kPaintPanel = R"JSON({
  "name": "Paint",
  "scripting": { "enabled": true, "runOnExport": true },
  "scripts": [
    { "id": "paint", "name": "paint", "language": "javascript", "scope": "panel", "event": "onPaint", "target": "*", "enabled": true,
      "source": "function onPaint(){ for (var i = 0; i < 1500; i++) set('lbl.text.content', 'row ' + i); set('cutoff.value', 50); }\nfunction onFlood(){ for (var i = 0; i < 1500; i++) set('cutoff.value', i % 128); }" }
  ],
  "controls": [
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
      "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 127 },
      "Value": { "_type": "Value", "value": 0 }
    } },
    { "_type": "Control", "_children": {
      "Core": { "_type": "Core", "id": "l1", "name": "lbl" },
      "Text": { "_type": "Text", "content": "" }
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

    // --- get() of something that is not there, window-closed --------------------------------
    // set() always said "nothing was written" for a path that led nowhere; get() returned the
    // nothing an unset value returns, so a misspelled control or property read as an empty one. It
    // says why now, in the WebView runtime's words (PanelValueModel::whyNoAnswer, wired the way
    // PluginProcessor wires it), from a script's own get() in Lua and in JavaScript, and still
    // returns nothing. A watch on a path that is not there stays quiet, as the editor's does.
    {
        const char* kGetPanel = R"JSON({
          "name": "Gets",
          "scripting": { "enabled": true, "runOnExport": true },
          "scripts": [
            { "id": "gl", "name": "gl", "language": "lua", "scope": "panel", "event": "onGetsLua", "target": "*", "enabled": true,
              "source": "function onGetsLua()\n  watch(\"ghost.value\", function() end)\n  local a = get(\"ghost.value\")\n  local b = get(\"cutoff.vlaue\")\n  log(\"lua \" .. tostring(get(\"cutoff.value\")) .. \" \" .. tostring(a) .. \" \" .. tostring(b))\nend\n" },
            { "id": "gj", "name": "gj", "language": "javascript", "scope": "panel", "event": "onGetsJs", "target": "*", "enabled": true,
              "source": "function onGetsJs(){ watch('ghost.value', function(){}); var a = get('ghost.value'); var b = get('cutoff.vlaue.normalizedValue'); log('js ' + get('cutoff.value') + ' ' + a + ' ' + b); }" }
          ],
          "controls": [
            { "_type": "Control", "_children": {
              "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
              "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 200 },
              "Value": { "_type": "Value", "value": 40 }
            } }
          ]
        })JSON";

        PanelValueModel getModel;
        check (getModel.loadFromJson (kGetPanel), "loaded the get panel");
        juce::StringArray getLogs;
        BridgeScriptHost::Callbacks gcb;
        gcb.getValue = [&] (const juce::String& path, const juce::String& form) { return getModel.getValue (path, form); };
        gcb.whyNoValue = [&] (const juce::String& path) { return getModel.whyNoAnswer (path); };
        gcb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form) { getModel.setValue (path, v, form); };
        gcb.log = [&] (const juce::String& m, const juce::var&) { getLogs.add (m); };
        BridgeScriptHost getHost (std::move (gcb));
        ScriptRuntime getRuntime (getHost);
        getHost.attachRuntime (&getRuntime);
        getRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        getRuntime.loadScripts (gatherPanelScripts (getModel.panel()));

        const juce::String ghost = "get: control \"ghost\" not found on the active panel, so there is no answer.";
        const juce::String vlaue = "get(\"cutoff.vlaue\"): \"vlaue\" does not lead anywhere on \"cutoff\", so there is no answer.";
        for (const char* lang : { "Lua", "Js" })
        {
            getLogs.clear();
            getRuntime.runAction (juce::String ("onGets") + lang, juce::var());
            const juce::String tag (lang);
            // Three lines and no more: the watch on the same missing path said nothing, and the
            // missing path answered nothing (nil, or null from JavaScript), not a plausible 0.
            const bool nothing = getLogs.size() == 3
                && (getLogs[2] == "lua 40 nil nil" || getLogs[2] == "js 40 null null");
            check (getLogs.size() == 3 && getLogs[0] == ghost && getLogs[1] == vlaue && nothing,
                   tag + ": get() names the missing control and the path that leads nowhere, once each, and a watch "
                         "says nothing (got: " + getLogs.joinIntoString (" | ") + ")");
        }
        check (getModel.whyNoAnswer ("cutoff.value").isEmpty() && getModel.whyNoAnswer ("panel.anything").isEmpty()
                   && getModel.whyNoAnswer ("cutoff.Value.value").isEmpty(),
               "whyNoAnswer is silent for a path that is there, and for the panel document");
    }

    // --- an explicit form that is not one of the three, window-closed ------------------------
    // get(path, form) and set(path, value, form): a form that was not value, normalizedValue or
    // midiValue was dropped without a word (BridgeScriptHost::splitAccessor), so get("cutoff",
    // "normalisedValue") answered the raw value. And set's text form never arrived at all: Lua's
    // set took only a table there and self.set no third argument, and the host read only options
    // from it, so set("cutoff", 0.5, "normalizedValue") wrote 0.5 as it was, where the WebView
    // runtime wrote 100 of 0..200. A form that is not one now refuses the call in the WebView's
    // words (scriptGetReports.test.js), naming the form meant, and a right one works in every spelling.
    {
        const char* kFormPanel = R"JSON({
          "name": "Forms",
          "scripting": { "enabled": true, "runOnExport": true },
          "scripts": [
            { "id": "fl", "name": "fl", "language": "lua", "scope": "panel", "owner": "cutoff", "event": "onFormsLua", "target": "*", "enabled": true,
              "source": "function onFormsLua()\n  log(\"a \" .. tostring(get(\"cutoff\", \"normalisedValue\")))\n  set(\"cutoff\", 0.5, \"normalisedValue\")\n  log(\"b \" .. tostring(get(\"cutoff\")))\n  log(\"c \" .. tostring(get(\"cutoff\", \"NormalizedValue\")))\n  set(\"cutoff\", 50, \"percent\")\n  self.set(\"value\", 1, \"Normalized\")\n  log(\"d \" .. tostring(self.get(\"value\", \".normalizedValue\")))\n  log(\"e \" .. tostring(get(\"cutoff\")))\n  set(\"cutoff\", 0.25, \"normalizedValue\")\n  log(\"f \" .. tostring(get(\"cutoff\")))\n  self.set(\"value\", 0.75, \"normalizedValue\")\n  log(\"g \" .. tostring(get(\"cutoff\", \"normalizedValue\")))\n  set(\"cutoff\", 120, { transmit = false })\n  log(\"h \" .. tostring(get(\"cutoff\", { transmit = false })))\nend\n" },
            { "id": "fj", "name": "fj", "language": "javascript", "scope": "panel", "owner": "cutoff", "event": "onFormsJs", "target": "*", "enabled": true,
              "source": "function onFormsJs(){ log('a ' + get('cutoff', 'normalisedValue')); set('cutoff', 0.5, 'normalisedValue'); log('b ' + get('cutoff')); log('c ' + get('cutoff', 'NormalizedValue')); set('cutoff', 50, 'percent'); self.set('value', 1, 'Normalized'); log('d ' + self.get('value', '.normalizedValue')); log('e ' + get('cutoff')); set('cutoff', 0.25, 'normalizedValue'); log('f ' + get('cutoff')); self.set('value', 0.75, 'normalizedValue'); log('g ' + get('cutoff', 'normalizedValue')); set('cutoff', 120, { transmit: false }); log('h ' + get('cutoff', { transmit: false })); }" }
          ],
          "controls": [
            { "_type": "Control", "_children": {
              "Core": { "_type": "Core", "id": "c1", "name": "cutoff" },
              "Behavior": { "_type": "Behavior", "family": "range", "role": "knob", "min": 0, "max": 200 },
              "Value": { "_type": "Value", "value": 100 }
            } }
          ]
        })JSON";

        const juce::String forms = " The forms are value, normalizedValue and midiValue.";
        const juce::StringArray expectedRefusals {
            "get(\"cutoff\"): \"normalisedValue\" is not a value form, so there is no answer." + forms + " Write normalizedValue.",
            "set(\"cutoff\"): \"normalisedValue\" is not a value form, so nothing was set." + forms + " Write normalizedValue.",
            "get(\"cutoff\"): \"NormalizedValue\" is not a value form, so there is no answer." + forms + " Write normalizedValue.",
            "set(\"cutoff\"): \"percent\" is not a value form, so nothing was set." + forms,
            "set(\"cutoff.value\"): \"Normalized\" is not a value form, so nothing was set." + forms,
            "get(\"cutoff.value\"): \".normalizedValue\" is not a value form, so there is no answer." + forms + " Write normalizedValue.",
        };

        for (const char* lang : { "Lua", "Js" })
        {
            PanelValueModel formModel;
            check (formModel.loadFromJson (kFormPanel), "loaded the form panel");
            juce::StringArray formLogs;
            BridgeScriptHost::Callbacks fcb;
            fcb.getValue = [&] (const juce::String& path, const juce::String& form) { return formModel.getValue (path, form); };
            fcb.whyNoValue = [&] (const juce::String& path) { return formModel.whyNoAnswer (path); };
            fcb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form) { formModel.setValue (path, v, form); };
            fcb.log = [&] (const juce::String& m, const juce::var&) { formLogs.add (m); };
            BridgeScriptHost formHost (std::move (fcb));
            ScriptRuntime formRuntime (formHost);
            formHost.attachRuntime (&formRuntime);
            formRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
            formRuntime.loadScripts (gatherPanelScripts (formModel.panel()));
            formRuntime.runAction (juce::String ("onForms") + lang, juce::var());

            const juce::String tag (lang);
            const juce::String nothing = tag == "Lua" ? "nil" : "null";
            const juce::StringArray expected {
                expectedRefusals[0], "a " + nothing,
                expectedRefusals[1],
                "b 100",
                expectedRefusals[2], "c " + nothing,
                expectedRefusals[3],
                expectedRefusals[4],
                expectedRefusals[5], "d " + nothing,
                "e 100",
                "f 50",
                "g 0.75",
                "h 120",
            };
            check (formLogs == expected,
                   tag + ": a form that is not one refuses get and set in the WebView's words, writes nothing, and the "
                         "right one works by set, self.set and get (got: " + formLogs.joinIntoString (" | ") + ")");
        }
        // The host's own reading, without an engine: what a native handler reaches.
        check (BridgeScriptHost::formMeant ("normalised") == "" && BridgeScriptHost::formMeant (" Normalisedvalue ") == "normalizedValue"
                   && BridgeScriptHost::formMeant ("MIDIVALUE") == "midiValue" && BridgeScriptHost::formMeant (".value") == "value"
                   && BridgeScriptHost::formRefusal ("get(\"x\")", "there is no answer", "normalizedValue").isEmpty()
                   && BridgeScriptHost::formRefusal ("get(\"x\")", "there is no answer", "").isEmpty(),
               "formMeant names the form written another way, and formRefusal passes a form and no form");
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
              "source": "function onPanelLoad()\n  ce.device.defineParameter(\"cutoff\", { name = \"Mine\", min = 0, max = 127, cc = 74 })\nend\nfunction onList()\n  for _, p in ipairs(ce.device.parameters()) do log(\"p \" .. p.id .. \" \" .. p.name) end\nend\nfunction onMine() ce.device.write(\"cutoff\", 9) end\nfunction onTheirs() ce.device.write(\"reso\", 9) end\nfunction onAsk() requestDump(\"patch\") end\nfunction onRefused() ce.device.write(\"cutoff\", \"abc\") end" }
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
        // A declared parameter's write that the runtime refuses ends there. It used to fall through
        // to the profile, whose own "cutoff" then sent whatever it means by that.
        devWrites.clear();
        devMidi.clear();
        devRuntime.runAction ("onRefused", juce::var());
        check (devWrites.isEmpty() && devMidi.isEmpty(), "a refused write to a declared parameter reaches neither encoder (got "
                   + devWrites.joinIntoString (" | ") + " / " + devMidi.joinIntoString (" | ") + ")");

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

    // --- the MIDI flood guard counts only writes that could send ----------------------------
    // Before: every set() spent the budget, so painting 1,500 labels used it up and the bound
    // control's write right after lost its MIDI. With transmitsTo, only bound paths count.
    {
        auto run = [] (bool withTransmitsTo, const juce::String& action, int& sentWrites, int& lastTransmit)
        {
            PanelValueModel paintModel;
            paintModel.loadFromJson (kPaintPanel);
            sentWrites = 0;
            lastTransmit = -1;
            BridgeScriptHost::Callbacks pcb;
            pcb.getValue = [&] (const juce::String& p, const juce::String& f) { return paintModel.getValue (p, f); };
            pcb.setValue = [&] (const juce::String& p, const juce::var& v, bool transmit, const juce::String& f)
            {
                paintModel.setValue (p, v, f);
                if (p.startsWith ("cutoff")) { lastTransmit = transmit ? 1 : 0; if (transmit) ++sentWrites; }
            };
            if (withTransmitsTo)
                pcb.transmitsTo = [] (const juce::String& p) { return p.startsWith ("cutoff"); };
            pcb.log = [] (const juce::String&, const juce::var&) {};
            BridgeScriptHost paintHost (std::move (pcb));
            ScriptRuntime paintRuntime (paintHost);
            paintHost.attachRuntime (&paintRuntime);
            paintRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
            paintRuntime.loadScripts (gatherPanelScripts (paintModel.panel()));
            paintRuntime.runAction (action, juce::var());
        };

        int sent = 0, last = -1;
        run (false, "onPaint", sent, last);
        check (last == 0, "without transmitsTo, 1,500 label writes spend the budget and the bound write loses its MIDI (the old behaviour)");
        run (true, "onPaint", sent, last);
        check (last == 1, "with transmitsTo, label writes spend nothing and the bound write still sends");
        run (true, "onFlood", sent, last);
        check (sent == 1000, "a real flood of bound writes is still cut at 1,000 a second (sent " + juce::String (sent) + ")");
    }

    // --- SysEx hex text is read a byte at a time -----------------------------------------------
    // "F0411000" was one number to PluginProcessor's parser, which kept the low byte and sent
    // F0 00 F7 (the WebView runtime clamped it to F0 FF F7). BridgeScriptHost now refuses a token
    // that is not one byte, in the WebView runtime's words, and hands the callback a list.
    {
        juce::StringArray sysexLogs, sysexOut, otherOut;
        // What each callback was handed, as the bytes or as "text:…" if text got through.
        auto shown = [] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr) b.add (juce::jlimit (0, 255, (int) x));
            return bytes.isString() ? "text:" + bytes.toString() : hex (b);
        };
        BridgeScriptHost::Callbacks scb;
        scb.log = [&] (const juce::String& m, const juce::var&) { sysexLogs.add (m); };
        scb.sendSysex = [&] (const juce::var& bytes) { sysexOut.add (shown (bytes)); };
        scb.sendMidi  = [&] (const juce::var& bytes) { otherOut.add ("midi " + shown (bytes)); };
        scb.feedMidi  = [&] (const juce::var& bytes) { otherOut.add ("feed " + shown (bytes)); };
        scb.applyDump = [&] (const juce::var& bytes) { otherOut.add ("dump " + shown (bytes)); };
        BridgeScriptHost sysexHost (std::move (scb));
        ScriptRuntime sysexRuntime (sysexHost);
        sysexHost.attachRuntime (&sysexRuntime);
        sysexRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });

        auto script = [] (const char* id, const char* language, const char* event, const char* source)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("id", id);
            o->setProperty ("name", id);
            o->setProperty ("language", language);
            o->setProperty ("scope", "panel");
            o->setProperty ("event", event);
            o->setProperty ("target", "*");
            o->setProperty ("enabled", true);
            o->setProperty ("source", source);
            return juce::var (o);
        };
        juce::Array<juce::var> scripts;
        scripts.add (script ("sxlua", "lua", "onSysexLua",
            "function onSysexLua()\n"
            "  sendSysex(\"F0411000\")\n"
            "  sendSysex(\"F0 41 zz F7\")\n"
            "  sendSysex(\"F0 41 10 00 F7\")\n"
            "  sendSysex(\"0xF0,0x41\\n10 0 F7\")\n"     // 0x, commas, a newline and a one-digit byte
            "  sendSysex({ 0xF0, 0x41, 0x10, 0x00, 0xF7 })\n"
            "end\n"));
        scripts.add (script ("sxjs", "javascript", "onSysexJs",
            "function onSysexJs() { ce.midi.sendSysex('903C64'); }"));
        // sendMidi, feedMidi and applyDump took text in the editor only: the player's sendMidi
        // dropped it without a word. They read it now, by the same rule, refusing the same way.
        scripts.add (script ("textlua", "lua", "onTextLua",
            "function onTextLua()\n"
            "  sendMidi(\"90 3C 64\")\n"
            "  sendMidi(\"903C64\")\n"
            "  feedMidi(\"0x90,0x3C,0x40\")\n"
            "  applyDump(\"F0 7D 01 40 F7\")\n"
            "  applyDump(\"F07D0140F7\")\n"
            "  sendMidi({ 0x80, 0x3C, 0 })\n"
            "end\n"));
        // Nothing to send: the editor says "no bytes given"; the player used to hand the empty list
        // on and send nothing without a word.
        scripts.add (script ("emptylua", "lua", "onEmptyLua",
            "function onEmptyLua()\n"
            "  sendMidi(\"\")\n"
            "  sendSysex({})\n"
            "  feedMidi(\"  \")\n"
            "  sendMidi()\n"
            "end\n"));
        sysexRuntime.loadScripts (juce::var (scripts));

        sysexRuntime.runAction ("onSysexLua", juce::var());
        check (sysexOut.size() == 3, "two refused, three sent (got " + sysexOut.joinIntoString (" | ") + ")");
        for (const auto& sent : sysexOut)
            check (sent == "F0 41 10 00 F7", "hex text reaches the callback as a list of the bytes written (got " + sent + ")");
        check (sysexLogs.contains ("sendSysex: \"F0411000\" is not one byte, so nothing was sent. "
                                   "Put a space between the bytes: \"F0 41 10 00\"."),
               "an unspaced run is refused, with the spaced form to copy");
        check (sysexLogs.contains ("sendSysex: \"zz\" is not one byte, so nothing was sent. "
                                   "Each byte is one or two hex digits, with spaces between the bytes: \"F0 41 10 F7\"."),
               "a token that is not hex is refused");

        sysexOut.clear();
        sysexLogs.clear();
        sysexRuntime.runAction ("onSysexJs", juce::var());
        check (sysexOut.isEmpty() && sysexLogs.size() == 1 && sysexLogs[0].startsWith ("sendSysex: \"903C64\" is not one byte"),
               "the same refusal from JavaScript (got " + sysexLogs.joinIntoString (" | ") + ")");

        sysexLogs.clear();
        sysexRuntime.runAction ("onTextLua", juce::var());
        check (otherOut.joinIntoString (" | ") == "midi 90 3C 64 | feed 90 3C 40 | dump F0 7D 01 40 F7 | midi 80 3C 00",
               "sendMidi, feedMidi and applyDump read hex text as lists, and lists as before (got "
                   + otherOut.joinIntoString (" | ") + ")");
        check (sysexLogs.size() == 2
                   && sysexLogs[0] == "sendMidi: \"903C64\" is not one byte, so nothing was sent. Put a space between the bytes: \"90 3C 64\"."
                   && sysexLogs[1] == "applyDump: \"F07D0140F7\" is not one byte, so nothing was decoded. Put a space between the bytes: \"F0 7D 01 40 F7\".",
               "and refuse an unspaced run in the WebView runtime's words (got " + sysexLogs.joinIntoString (" | ") + ")");

        otherOut.clear();
        sysexOut.clear();
        sysexLogs.clear();
        sysexRuntime.runAction ("onEmptyLua", juce::var());
        check (otherOut.isEmpty() && sysexOut.isEmpty(), "empty text, an empty table or nothing reaches no callback (got "
                   + otherOut.joinIntoString (" | ") + sysexOut.joinIntoString (" | ") + ")");
        check (sysexLogs.joinIntoString (" | ")
                   == "sendMidi: no bytes given | sendSysex: no bytes given | feedMidi: no bytes given | sendMidi: no bytes given",
               "and each says so in the editor's words (got " + sysexLogs.joinIntoString (" | ") + ")");
    }

    // --- One byte rule for lists, and the channel messages checked before they reach the host ---
    // A list item was clamped by the callbacks (300 went out as FF, a System Reset inside a SysEx)
    // and a text item read as decimal; QuickJS's Uint8Array arrived as an object and was "no bytes
    // given". The engines' sendCC, notes and transport clamped or guessed: CC 200 was CC 127, "C10"
    // put 132 in a data byte, "pause" sent Start. Each is refused now, in the WebView runtime's words.
    {
        juce::StringArray logs, out;
        auto bytesOf = [] (const juce::var& bytes)
        {
            juce::Array<int> b;
            if (auto* arr = bytes.getArray())
                for (const auto& x : *arr) b.add ((int) x);
            return hex (b);
        };
        BridgeScriptHost::Callbacks rcb;
        rcb.log = [&] (const juce::String& m, const juce::var&) { logs.add (m); };
        rcb.sendSysex = [&] (const juce::var& bytes) { out.add ("sysex " + bytesOf (bytes)); };
        rcb.sendMidi  = [&] (const juce::var& bytes) { out.add ("midi " + bytesOf (bytes)); };
        rcb.applyDump = [&] (const juce::var& bytes) { out.add (bytes.getDynamicObject() != nullptr && ! bytes.isArray()
                                                                   ? "dump map" : "dump " + bytesOf (bytes)); };
        rcb.sendCC = [&] (int ch, int cc, const juce::var& v) { out.add ("cc " + juce::String (ch) + " " + juce::String (cc) + " " + v.toString()); };
        BridgeScriptHost ruleHost (std::move (rcb));
        ScriptRuntime ruleRuntime (ruleHost);
        ruleHost.attachRuntime (&ruleRuntime);

        auto script = [] (const char* id, const char* language, const char* event, const char* source)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("id", id);
            o->setProperty ("name", id);
            o->setProperty ("language", language);
            o->setProperty ("scope", "panel");
            o->setProperty ("event", event);
            o->setProperty ("target", "*");
            o->setProperty ("enabled", true);
            o->setProperty ("source", source);
            return juce::var (o);
        };
        juce::Array<juce::var> scripts;
        scripts.add (script ("rulelua", "lua", "onRuleLua",
            "function onRuleLua()\n"
            "  sendSysex({ 0x41, 0x10, 300 })\n"
            "  sendSysex({ \"F0\", \"41\", \"0xF7\" })\n"
            "  sendMidi(42)\n"
            "  sendSysex(\"F0\\f41 F7\")\n"
            "  applyDump({ cutoff = 5 })\n"
            "  sendCC(1, 200, 5)\n"
            "  sendCC(1, 7, 64.5)\n"
            "  sendNote(1, \"C10\", 100)\n"
            "  sendNote(1, 60)\n"
            "  sendTransport(\"pause\")\n"
            "end\n"));
        scripts.add (script ("rulejs", "javascript", "onRuleJs",
            "function onRuleJs() {\n"
            "  sendSysex(new Uint8Array([0xF0, 0x41, 0xF7]));\n"
            "  sendMidi([0x90, 60, 1.5]);\n"
            "  sendCC(0, 7, 5);\n"
            "  sendCC(16, 7.4, 64.5);\n"
            "  panic({ channel: 'all' });\n"
            "}\n"));
        ruleRuntime.loadScripts (juce::var (scripts));

        ruleRuntime.runAction ("onRuleLua", juce::var());
        check (out.joinIntoString (" | ") == "sysex F0 41 F7 | sysex F0 41 F7 | dump map | cc 1 7 65",
               "text items are hex bytes, a form feed separates, a decoded map is not bytes, a fraction rounds half up (got "
                   + out.joinIntoString (" | ") + ")");
        check (logs.joinIntoString (" | ") ==
                   "sendSysex: 300 at position 2 is not a byte, so nothing was sent. A byte is a whole number from 0 to 255, "
                   "or one or two hex digits such as \"F7\". | "
                   "sendMidi: 42 is not a list of bytes, so nothing was sent. | "
                   "sendCC: 200 is not a controller number, so nothing was sent. A controller number is a whole number from 0 to 127. | "
                   "sendNote: \"C10\" is outside the MIDI notes, so nothing was sent. MIDI notes run from 0 to 127, which is C-1 to G9. | "
                   "sendNote: no velocity given, so nothing was sent. | "
                   "sendTransport: \"pause\" is not a transport action, so nothing was sent. The actions are \"start\", \"continue\" and \"stop\".",
               "and the rest are refused in the WebView runtime's words (got " + logs.joinIntoString (" | ") + ")");

        out.clear();
        logs.clear();
        ruleRuntime.runAction ("onRuleJs", juce::var());
        check (out.joinIntoString (" | ") == "sysex F0 41 F7 | cc 16 7 65",
               "a Uint8Array is a list, and JavaScript rounds as the others do (got " + out.joinIntoString (" | ") + ")");
        check (logs.joinIntoString (" | ") ==
                   "sendMidi: 1.5 at position 2 is not a byte, so nothing was sent. A byte is a whole number from 0 to 255, "
                   "or one or two hex digits such as \"F7\". | "
                   "sendCC: 0 is not a channel, so nothing was sent. A channel is a whole number from 1 to 16. | "
                   "panic: \"all\" is not a channel, so nothing was sent. A channel is a whole number from 1 to 16.",
               "and JavaScript refuses in the same words (got " + logs.joinIntoString (" | ") + ")");

        // A native handler's sendCC reaches the host without passing through a prelude, so the host
        // makes the same check, in the same words.
        out.clear();
        logs.clear();
        ruleHost.sendCC (1, 200, juce::var (5));
        ruleHost.sendCC (2, 7, juce::var ("loud"));
        ruleHost.sendCC (2, 7, juce::var (64.5));
        ruleHost.sendCC (2, 7, juce::var (" 64 "));   // text that is a number, as a script may pass
        check (out.joinIntoString (" | ") == "cc 2 7 65 | cc 2 7 64", "the host passes a valid CC on, rounded (got " + out.joinIntoString (" | ") + ")");
        check (logs.joinIntoString (" | ") ==
                   "sendCC: 200 is not a controller number, so nothing was sent. A controller number is a whole number from 0 to 127. | "
                   "sendCC: \"loud\" is not a value, so nothing was sent. A value is a number from 0 to 127.",
               "and refuses the rest itself (got " + logs.joinIntoString (" | ") + ")");

        // A value past its end is sent as the nearest end, and said the first time only.
        out.clear();
        logs.clear();
        ruleHost.sendCC (2, 7, juce::var (200));
        ruleHost.sendCC (2, 7, juce::var (300));
        check (out.joinIntoString (" | ") == "cc 2 7 127 | cc 2 7 127", "a value past its end is sent as the end (got "
                   + out.joinIntoString (" | ") + ")");
        check (logs.joinIntoString (" | ") == "sendCC: the value 200 is outside 0 to 127, so 127 was sent. This is said only the first time.",
               "and said once, in the preludes' words (got " + logs.joinIntoString (" | ") + ")");
    }

    // ce.anim in the player: `repeat` is the runs in all, and done(completed) gets one boolean,
    // through BridgeScriptHost as PluginProcessor wires it: the host forwards the move to the
    // runtime, and the completion's emit falls through to it. ScriptRuntimeTests.cpp §39b and
    // PythonScriptEngineTests.cpp run the full set of moves in each language.
    {
        juce::StringArray animLogs;
        BridgeScriptHost::Callbacks acb;
        acb.log = [&] (const juce::String& m, const juce::var&) { animLogs.add (m); };
        BridgeScriptHost animHost (std::move (acb));
        ScriptRuntime animRuntime (animHost);
        animHost.attachRuntime (&animRuntime);
        animRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });

        auto script = [] (const char* id, const char* language, const char* source)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("id", id);
            o->setProperty ("name", id);
            o->setProperty ("language", language);
            o->setProperty ("scope", "panel");
            o->setProperty ("event", "onMove");
            o->setProperty ("target", "*");
            o->setProperty ("enabled", true);
            o->setProperty ("source", source);
            return juce::var (o);
        };
        juce::Array<juce::var> scripts;
        scripts.add (script ("animlua", "lua",
            "function onMove()\n"
            "  ce.anim.to('cutoff', 100, { duration = 100, from = 0, ['repeat'] = 2,\n"
            "    done = function(c, extra) log('lua ' .. type(c) .. ' ' .. tostring(c) .. ' ' .. tostring(extra)) end })\n"
            "end\n"));
        scripts.add (script ("animjs", "javascript",
            "function onMove() {\n"
            "  ce.anim.to(['reso', 'drive'], 100, { duration: 100, from: 0, repeat: 1,\n"
            "    done: function (c) { log('js ' + arguments.length + ' ' + typeof c + ' ' + c); } });\n"
            "  ce.anim.to('pan', 100, { duration: 100, from: 0, repeat: 0,\n"
            "    done: function (c) { log('pan ' + typeof c + ' ' + c); } });\n"
            "}\n"));
        animRuntime.loadScripts (juce::var (scripts));
        animRuntime.tickAnimations (0.0);
        animRuntime.dispatchEvent ("onMove", "panel", juce::var());

        animRuntime.tickAnimations (100.0);
        check (animLogs.joinIntoString (" | ") == "js 1 boolean true",
               "ce.anim: repeat = 1 is one run, and a list's done gets one boolean (got " + animLogs.joinIntoString (" | ") + ")");
        check (animRuntime.animationRunning ("cutoff"), "ce.anim: repeat = 2 is still on its second run");
        animLogs.clear();
        animRuntime.tickAnimations (200.0);
        check (animLogs.joinIntoString (" | ") == "lua boolean true nil",
               "ce.anim: …which ends there, with done(true) and nothing else (got " + animLogs.joinIntoString (" | ") + ")");
        animLogs.clear();
        animRuntime.tickAnimations (1000.0);
        check (animRuntime.animationRunning ("pan") && animLogs.isEmpty(), "ce.anim: repeat = 0 runs until it is stopped");
        animRuntime.stopAnimation ("pan");
        check (animLogs.joinIntoString (" | ") == "pan boolean false",
               "ce.anim: …and stopping it is done(false) (got " + animLogs.joinIntoString (" | ") + ")");
    }

    // A colour written window shut is read by the editor's rule (Scripting/ScriptColours.h), whichever
    // door it came through: a Lua and a JavaScript set(), Lua's self.set, a whole section, and ce.anim,
    // which refuses a colour property as its path. Wired as PluginProcessor wires it: the model's
    // colourWrites and isColourProperty behind BridgeScriptHost's callbacks, its setValue behind that.
    {
        const char* kColourPanel = R"JSON({
          "name": "Colours",
          "scripting": { "enabled": true, "runOnExport": true },
          "scripts": [
            { "id": "cl", "name": "cl", "language": "lua", "scope": "panel", "event": "onColoursLua", "target": "*", "enabled": true,
              "source": "function onColoursLua()\n  set(\"lbl.background.fill.colour\", \"red\")\n  log(\"lua \" .. tostring(get(\"lbl.background.fill.colour\")))\n  set(\"lbl.background.fill.colour\", \"redd\")\n  set(\"lbl.background.fill.colour\", 16711680)\n  log(\"lua kept \" .. tostring(get(\"lbl.background.fill.colour\")))\n  set(\"lbl.background.border.top\", { style = \"solid\", thickness = 3, colour = \"#0008\" })\n  log(\"lua top \" .. tostring(get(\"lbl.background.border.top.thickness\")))\n  set(\"lbl.text.content\", \"red\")\n  log(\"lua text \" .. tostring(get(\"lbl.text.content\")))\nend\n" },
            { "id": "cj", "name": "cj", "language": "javascript", "scope": "panel", "event": "onColoursJs", "target": "*", "enabled": true,
              "source": "function onColoursJs(){ set('lbl.background.fill.colour', 'rgb(0, 128, 255)'); log('js ' + get('lbl.background.fill.colour')); set('lbl.text.font.underlineColour', ''); log('js underline [' + get('lbl.text.font.underlineColour') + ']'); set('lbl.background.border.top', { colour: 'hsl(120, 100%, 25%)', thickness: 4 }); log('js top ' + get('lbl.background.border.top.colour') + ' ' + get('lbl.background.border.top.thickness')); }\nfunction onMovesJs(){ ce.anim.to('lbl.background.fill.colour', 1, { duration: 10 }); ce.anim.spring(['lbl.transform.x', 'lbl.background.border.top.colour'], 50, { duration: 10 }); log('js moving ' + ce.anim.running('lbl.background.fill.colour') + ' ' + ce.anim.running('lbl.transform.x') + ' ' + ce.anim.running('lbl.background.border.top.colour')); }" },
            { "id": "cs", "name": "cs", "language": "lua", "scope": "component", "event": "onColoursSelf", "target": "lbl", "enabled": true,
              "source": "function onColoursSelf()\n  self.set(\"background.fill.colour\", \"#abc\")\n  log(\"self \" .. tostring(self.get(\"background.fill.colour\")))\n  self.set(\"background.fill.colour\", \"#abcd\")\nend\n" }
          ],
          "controls": [
            { "_type": "Control", "_children": {
              "Core": { "_type": "Core", "id": "l1", "name": "lbl", "controlType": "Label" },
              "Transform": { "_type": "Transform", "x": 0, "y": 0, "width": 100, "height": 40 },
              "Background": { "_type": "Background", "_children": {
                "Fill": { "_type": "Fill", "colour": "FF112233" },
                "Border": { "_type": "Border", "top": { "style": "solid", "thickness": 1, "colour": "FF000000" } } } },
              "Text": { "_type": "Text", "content": "Hi", "_children": {
                "Font": { "_type": "Font", "colour": "FFFFFFFF", "underlineColour": "FF00FF00" } } }
            } }
          ]
        })JSON";

        PanelValueModel colourModel;
        check (colourModel.loadFromJson (kColourPanel), "loaded the colour panel");
        juce::StringArray colourLogs;
        BridgeScriptHost::Callbacks ccb;
        ccb.getValue = [&] (const juce::String& path, const juce::String& form) { return colourModel.getValue (path, form); };
        ccb.colourWrites = [&] (const juce::String& call, const juce::String& path, const juce::var& value, const juce::String& form)
        { return colourModel.colourWrites (call, path, value, form); };
        ccb.isColourProperty = [&] (const juce::String& path) { return colourModel.isColourProperty (path); };
        ccb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form) { colourModel.setValue (path, v, form); };
        ccb.log = [&] (const juce::String& m, const juce::var&) { colourLogs.add (m); };
        BridgeScriptHost colourHost (std::move (ccb));
        ScriptRuntime colourRuntime (colourHost);
        colourHost.attachRuntime (&colourRuntime);
        colourRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        colourRuntime.loadScripts (gatherPanelScripts (colourModel.panel()));

        const juce::String forms = "A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without \"#\", or \"#RGB\", "
                                   "a CSS colour name, rgb() or hsl()";
        colourRuntime.runAction ("onColoursLua", juce::var());
        check (colourLogs.joinIntoString (" | ") ==
                   "lua #FF0000 | "
                   "set(\"lbl.background.fill.colour\"): \"redd\" is not a colour the panel can read, so nothing was set. " + forms + ". | "
                   "set(\"lbl.background.fill.colour\"): 16711680 is not a colour the panel can read, so nothing was set. " + forms
                       + ". As text, 16711680 is \"#FF0000\". | "
                   "lua kept #FF0000 | "
                   "set(\"lbl.background.border.top\"): at colour, \"#0008\" is not a colour the panel can read, so nothing was set. "
                       + forms + ". Write \"88000000\". | "
                   "lua top 1 | "
                   "lua text red",
               "Lua's set(): a name written out, the rest refused in the editor's words, a whole section with it, and text "
               "left alone (got " + colourLogs.joinIntoString (" | ") + ")");

        colourLogs.clear();
        colourRuntime.runAction ("onColoursJs", juce::var());
        check (colourLogs.joinIntoString (" | ") == "js #0080FF | js underline [] | js top #008000 4",
               "JavaScript's set(): rgb() written out, \"\" where the property has no colour of its own, and a section's "
               "colour written out as it is stored (got " + colourLogs.joinIntoString (" | ") + ")");

        colourLogs.clear();
        colourRuntime.runAction ("onColoursSelf", juce::var());
        check (colourLogs.joinIntoString (" | ") ==
                   "self #AABBCC | "
                   "set(\"lbl.background.fill.colour\"): \"#abcd\" is not a colour the panel can read, so nothing was set. " + forms
                       + ". Write \"DDAABBCC\".",
               "Lua's self.set reads a colour as set() does (got " + colourLogs.joinIntoString (" | ") + ")");

        // A native handler's set() (NativeHandlerEngine's host_set, through the C ABI) and Python's are
        // this same call on the host, with no prelude in front of it.
        colourLogs.clear();
        colourHost.setValue ("lbl.background.fill.colour", juce::var ("RebeccaPurple"), juce::var());
        const auto purple = colourModel.getValue ("lbl.background.fill.colour").toString();
        colourHost.setValue ("lbl.background.fill.colour", juce::var (1.5), juce::var());
        check (purple == "#663399" && colourModel.getValue ("lbl.background.fill.colour").toString() == "#663399"
                   && colourLogs.joinIntoString (" | ") == "set(\"lbl.background.fill.colour\"): 1.5 is not a colour the panel can "
                                                           "read, so nothing was set. " + forms + ".",
               "the host's own setValue, a native handler's door, reads a colour the same way (got "
                   + colourLogs.joinIntoString (" | ") + ")");
        colourHost.setValue ("lbl.background.fill.colour", juce::var ("#abc"), juce::var());

        colourLogs.clear();
        colourRuntime.tickAnimations (0.0);
        colourRuntime.runAction ("onMovesJs", juce::var());
        check (colourLogs.joinIntoString (" | ") ==
                   "ce.anim.to: \"lbl.background.fill.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                   "ce.anim.spring: \"lbl.background.border.top.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                   "js moving false true false",
               "ce.anim refuses a colour property as its path, in the editor's words, and moves the number beside it in the "
               "same list (got " + colourLogs.joinIntoString (" | ") + ")");
        // An envelope arrives at the same place from every prelude. Started there directly: the
        // preludes' own envelope sampling is not what this is about.
        colourLogs.clear();
        auto* envelopeOpts = new juce::DynamicObject();
        envelopeOpts->setProperty ("samples", juce::Array<juce::var> { 0.0, 1.0 });
        colourHost.startAnimation ("envelope", juce::var ("lbl.background.fill.colour"), 1.0, juce::var (envelopeOpts));
        check (colourLogs.joinIntoString (" | ") ==
                   "ce.anim.envelope: \"lbl.background.fill.colour\" is a colour, and ce.anim moves numbers, so nothing was started."
                   && ! colourRuntime.animationRunning ("lbl.background.fill.colour"),
               "ce.anim.envelope refuses a colour too (got " + colourLogs.joinIntoString (" | ") + ")");
        colourRuntime.tickAnimations (1000.0);
        check (colourModel.getValue ("lbl.background.fill.colour").toString() == "#AABBCC"
                   && colourModel.getValue ("lbl.background.border.top.colour").toString() == "#008000"
                   && (double) colourModel.getValue ("lbl.transform.x") == 50.0,
               "so no tick wrote a number into a colour, and the number moved");
    }

    std::cout << "--------------------------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
