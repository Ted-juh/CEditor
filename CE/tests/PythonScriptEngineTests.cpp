// PythonScriptEngineTests — smoke test for the REAL embedded CPython engine (CEDITOR_PYTHON).
//
// Verifies the native interpreter actually runs window-closed Python through the same ScriptEngine
// path as Lua/JS:
//   • a python script loads + executes, log()/set() cross to the host
//   • the shared helpers work (scale)
//   • event dispatch routes by language to the python handler
//   • THE FULL-STDLIB CLAIM: `import json` / `import re` work (this is the whole point of native CPython)
//   • per-script namespace isolation (two scripts, same handler name, no clash)
//   • per-INSTANCE isolation: two runtimes (two copies of a panel, or two panels, in one process)
//     share no module, no builtin and no host — each has an interpreter of its own
//
// Build with -DCEDITOR_SCRIPTING=ON -DCEDITOR_PYTHON=ON, then run ./CEditorPythonScriptTests.
// Requires the bundled/installed stdlib to be discoverable (env CEDITOR_PYTHONHOME or a dev install).

#include "Scripting/ScriptRuntime.h"
#include "Scripting/BridgeScriptHost.h"
#include <juce_core/juce_core.h>
#include <algorithm>
#include <functional>
#include <iostream>

using namespace ceditor::scripting;

class TestHost : public ScriptHostApi
{
public:
    std::map<juce::String, juce::var> values;
    juce::StringArray logs;

    std::function<void (const juce::String&)> onSet;   // lets a test reach into another instance mid-call

    juce::var getValue (const juce::String& path, const juce::String&) override
    { auto it = values.find (path); return it != values.end() ? it->second : juce::var(); }
    void setValue (const juce::String& path, const juce::var& value, const juce::var&) override
    { values[path] = value; if (onSet) onSet (path); }
    juce::StringArray ccSends;    // sendCC, as "1 7 65"
    void sendCC (int ch, int cc, const juce::var& v) override { ccSends.add (juce::String (ch) + " " + juce::String (cc) + " " + v.toString()); }
    void sendNRPN (int, int, int, const juce::var&) override {}
    void sendSysex (const juce::var&) override {}
    void requestDump (const juce::String&) override {}
    void applyDump (const juce::var&) override {}
    void sendDump (const juce::String&) override {}
    juce::var buildDump (const juce::String&) override { return {}; }
    juce::var runAction (const juce::String&, const juce::var&) override { return {}; }
    void emitEvent (const juce::String&, const juce::var&) override {}
    void log (const juce::String& message, const juce::var&) override { logs.add (message); }

    // A host that can say why a read found nothing, the way BridgeScriptHost asks the app.
    juce::String whyNoValue (const juce::String& path, const juce::String&) override
    { return path.startsWith ("ghost") ? "get: control \"ghost\" not found on the active panel, so there is no answer." : juce::String(); }

    juce::StringArray timerStarts;
    void startTimer (const juce::String& id, int) override { timerStarts.add (id); }

    juce::StringArray rawSends;   // sendMidi, as "90 3C 64"
    void sendMidi (const juce::var& bytes) override
    {
        juce::StringArray hex;
        if (auto* arr = bytes.getArray())
            for (const auto& b : *arr) hex.add (juce::String::toHexString ((int) b).paddedLeft ('0', 2).toUpperCase());
        rawSends.add (hex.joinIntoString (" "));
    }
};

// ce.anim through the Python prelude: the host forwards to the runtime, the way BridgeScriptHost
// does, and an emitted event comes back into it, so a move's done() reaches the script.
class AnimHost : public TestHost
{
public:
    ScriptRuntime* runtime = nullptr;
    bool startAnimation (const juce::String& kind, const juce::var& path, double target, const juce::var& opts) override
    { return runtime != nullptr && runtime->startAnimation (kind, path, target, opts); }
    void stopAnimation (const juce::String& path) override { if (runtime != nullptr) runtime->stopAnimation (path); }
    bool animationRunning (const juce::String& path) override { return runtime != nullptr && runtime->animationRunning (path); }
    bool animationFinish (const juce::String& path) override { return runtime != nullptr && runtime->animationFinish (path); }
    void emitEvent (const juce::String& name, const juce::var& data) override
    { if (runtime != nullptr) runtime->dispatchEvent (name, "panel", data); }
    // A stand-in for the panel model's question: here a path ending in ".colour" is a colour.
    bool isColourProperty (const juce::String& path) override { return path.endsWithIgnoreCase (".colour"); }
    // …and here a control called "nosuch" is the one the panel does not have.
    bool namesMissingControl (const juce::String& path) override
    { return path.upToFirstOccurrenceOf (".", false, false).equalsIgnoreCase ("nosuch"); }
};

static int failures = 0;
static void check (bool ok, const juce::String& name)
{
    std::cout << (ok ? "  PASS  " : "  FAIL  ") << name << "\n";
    if (! ok) ++failures;
}

static juce::var makeScript (const char* id, const char* event, const char* target, const juce::String& source)
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("id", id);
    o->setProperty ("name", id);
    o->setProperty ("language", "python");
    o->setProperty ("scope", "panel");
    o->setProperty ("event", event);
    o->setProperty ("target", target);
    o->setProperty ("source", source);
    o->setProperty ("enabled", true);
    return juce::var (o);
}

int main()
{
    std::cout << "PythonScriptEngine smoke test\n-----------------------------\n";

    TestHost host;
    ScriptRuntime runtime (host);
    runtime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });

    juce::Array<juce::var> scripts;
    scripts.add (makeScript ("py1", "onValueChanged", "*",
        "def onValueChanged(value):\n"
        "    set(\"cutoff.value\", scale(value, 0, 127, 0, 100))\n"
        "    log(\"py got \" + str(value))\n"));
    scripts.add (makeScript ("pyStd", "onPanelReady", "*",
        "import json, re\n"
        "def onPanelReady(info):\n"
        "    data = json.loads('{\"ok\": 7}')\n"
        "    m = re.match(r'(\\d+)', '42abc')\n"
        "    log(\"stdlib \" + str(data['ok']) + \" \" + m.group(1))\n"));
    // Same handler name as py1 — must not clash (separate namespace).
    scripts.add (makeScript ("py2", "onValueChanged", "*",
        "def onValueChanged(value):\n"
        "    log(\"second \" + str(value * 2))\n"));
    // round() is a superset of the prelude's 1-arg helper: 1-arg = half-up int (Lua/JS parity),
    // 2-arg = Python's builtin (ported code calling round(x, 2) must not raise TypeError).
    scripts.add (makeScript ("pyRound", "onValueChanged", "*",
        "def onValueChanged(value):\n"
        "    set(\"r1\", round(2.5))\n"
        "    set(\"r2\", round(3.14159, 2))\n"));
    runtime.loadScripts (juce::var (scripts));

    runtime.dispatchEvent ("onValueChanged", "panel", juce::var (64));

    const double cutoff = (double) host.values["cutoff.value"];
    check (cutoff > 50.0 && cutoff < 51.0, "Python ran: set(cutoff.value) via scale() => ~50.4 (got " + juce::String (cutoff) + ")");
    check (host.logs.contains ("py got 64"), "Python ran: log(\"py got 64\")");
    check (host.logs.contains ("second 128"), "Isolation: py2.onValueChanged fired independently (second 128)");
    check ((int) host.values["r1"] == 3, "round(2.5) -> 3 (1-arg half-up int, Lua/JS parity)");
    { const double r2 = (double) host.values["r2"]; check (r2 > 3.13 && r2 < 3.15, "round(3.14159, 2) -> ~3.14 (2-arg builtin, no TypeError)"); }

    runtime.onPanelReady (true);
    check (host.logs.contains ("stdlib 7 42"), "FULL STDLIB: import json + re worked window-closed");

    // Anti-flood guard: a runaway Python loop must be aborted by the watchdog (it raises
    // ceditor.TimeLimit in the instance's interpreter) instead of hanging the host.
    juce::StringArray errors;
    runtime.setErrorLogger ([&errors] (const juce::String& line)
        { errors.add (line); std::cout << "  [error] " << line << "\n"; });
    juce::Array<juce::var> guardScripts;
    guardScripts.add (makeScript ("pyloop", "onRunaway", "*",
        "def onRunaway(value):\n"
        "    while True:\n"
        "        pass\n"));
    guardScripts.add (makeScript ("pyAfter", "onAfter", "*",
        "def onAfter(value):\n"
        "    log(\"after ok\")\n"));
    runtime.loadScripts (juce::var (guardScripts));

    runtime.dispatchEvent ("onRunaway", "panel", juce::var());
    check (errors.joinIntoString ("\n").contains ("pyloop"),
           "Guard: runaway Python loop aborted by the execution watchdog");

    // The interrupt must not leak into the next, well-behaved dispatch.
    host.logs.clear();
    runtime.dispatchEvent ("onAfter", "panel", juce::var());
    check (host.logs.contains ("after ok"), "Guard: next dispatch runs clean after a watchdog trip");

    // A script's top-level statements are on the clock too, so a runaway one is stopped as it loads.
    // The app's prelude before them is not (loadScript says why), so it cannot use up their time.
    {
        errors.clear();
        juce::Array<juce::var> topLevel;
        topLevel.add (makeScript ("pyTop", "onTop", "*", "while True:\n    pass\n"));
        runtime.loadScripts (juce::var (topLevel));
        const auto said = errors.joinIntoString ("\n");
        check (said.contains ("pyTop") && said.contains ("load error") && said.contains ("script stopped"),
               "Guard: a runaway top-level loop is stopped as the script loads, as a load error");
        runtime.loadScripts (juce::var (guardScripts));
    }

    // A note name the senders cannot read is refused, not sent as note 0 (C-1). The Lua and JS
    // preludes and the WebView runtime refuse it in the same words.
    {
        juce::Array<juce::var> noteScripts;
        noteScripts.add (makeScript ("pyNotes", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    sendNote(1, 'c4', 100)\n"
            "    sendNoteOff(1, 'c4')\n"
            "    sendAftertouch(1, 90, 'c4')\n"
            "    sendNote(1, 'C-1', 100)\n"));
        runtime.loadScripts (juce::var (noteScripts));
        host.rawSends.clear();
        host.logs.clear();
        runtime.onPanelReady (true);
        check (host.rawSends.size() == 1 && host.rawSends[0] == "90 00 64",
               "Notes: an unreadable name sends nothing; C-1 by name still plays (got "
                   + host.rawSends.joinIntoString (" | ") + ")");
        for (const auto* verb : { "sendNote", "sendNoteOff", "sendAftertouch" })
            check (host.logs.contains (juce::String (verb) + ": \"c4\" is not a note name, so nothing was sent. "
                                       "A name is a capital letter, then # or b if it has one, then the octave: "
                                       "\"C4\", \"Eb3\", \"F#-1\"."),
                   juce::String ("Notes: ") + verb + " names the note it refused");
    }

    // self.set and self.get, a script's own get() of something that is not there, and the intervals
    // and storage option keys a script got wrong.
    //  - self's methods called out through `__api`, which a class body MANGLES to `_Self__api`, so
    //    both raised NameError on every call in the exported plug-in.
    //  - get() asks the host why it found nothing, as every engine's does; watch() does not.
    //  - startTimer(id, "fast") reached the host as 0 ms, and saveSetting(k, v, {"scop": "script"})
    //    saved into the shared store. Both are refused in the words the other engines use.
    {
        juce::Array<juce::var> mistakeScripts;
        mistakeScripts.add (makeScript ("pyMistakes", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    self.set('selfPath', 5)\n"
            "    log('self ' + str(self.get('selfPath')))\n"
            "    watch('ghost.value', lambda v, p: None)\n"
            "    log('ghost ' + str(get('ghost.value')))\n"
            "    startTimer('t', 'fast')\n"
            "    startTimer('t', True)\n"
            "    saveSetting('k', 1, {'scop': 'script'})\n"
            "    after(-5, lambda: None)\n"
            "    startTimer('ok', 250)\n"));
        runtime.loadScripts (juce::var (mistakeScripts));
        host.logs.clear();
        host.timerStarts.clear();
        runtime.onPanelReady (true);
        const auto logged = host.logs.joinIntoString (" | ");
        check (host.logs.contains ("self 5"), "self.set and self.get work (they raised NameError before; got " + logged + ")");
        check (host.logs.contains ("ghost None")
                   && host.logs.indexOf ("get: control \"ghost\" not found on the active panel, so there is no answer.")
                          == host.logs.indexOf ("ghost None") - 1,
               "get() of a missing control says so once, and the watch on it says nothing (got " + logged + ")");
        check (host.timerStarts.size() == 1 && host.timerStarts[0] == "ok",
               "only the 250 ms timer reaches the host (got " + host.timerStarts.joinIntoString (", ") + ")");
        for (const auto* line : {
                 "ce.time.startTimer(\"t\"): \"fast\" is not a number of milliseconds, so no timer was started.",
                 "ce.time.startTimer(\"t\"): the interval is not a number of milliseconds, so no timer was started.",
                 "ce.storage.saveSetting: \"scop\" is not one of its options, so nothing was done. Its only option is scope.",
                 "ce.time.after: -5 is less than 0 milliseconds, so nothing was scheduled." })
            check (host.logs.contains (line), juce::String ("refused in Python: ") + line);
    }

    // An option key a call does not take refuses it, before the host sees anything, by the check
    // gen-script-modules.mjs writes into the prelude, in the words of the other engines; the call
    // answers what the member answers for any other refusal. In Python the options can be passed by
    // the parameter's name too, and are checked there as well.
    {
        juce::Array<juce::var> optionScripts;
        optionScripts.add (makeScript ("pyOptions", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    set('refused', 5, {'transmit': False, 'quiet': True})\n"
            "    set('byName', 6, opts={'quiet': True})\n"
            "    syncTimer('s', 1, {'folow': False})\n"
            "    log('to ' + str(ce.anim.to('K.value', 1, {'easing': 'outBack'})))\n"
            "    log('define ' + str(ce.device.defineParameter('cut', {'cc': 74, 'nrpn': {'mbs': 1}})))\n"
            "    log('recall ' + str(recallPreset(0, {'rol': 'mainSynth'})['ok']))\n"
            "    log('params ' + str(ce.device.parameters({'grp': 'Filter'})))\n"
            "    log('read ' + str(ce.midi.read([1, 2], 0, 2, {'ordr': 'lsb', 1: 'a list entry'})))\n"
            "    log('goodRead ' + str(ce.midi.read([1, 2], 0, 2, {'order': 'lsb'})))\n"
            "    log('write ' + str(ce.midi.write([1, 2], 0, 2, 300, {'bit': 8})))\n"
            "    log('byName ' + str(ce.midi.write([1, 2], 0, 2, 300, opts={'bit': 8})))\n"
            "    log('goodWrite ' + str(ce.midi.write([0, 0], 0, 2, 300, {'bits': 8})))\n"
            "    set('good', 7, {'transmit': False})\n"));
        runtime.loadScripts (juce::var (optionScripts));
        host.logs.clear();
        host.timerStarts.clear();
        runtime.onPanelReady (true);
        const auto logged = host.logs.joinIntoString (" | ");
        check (host.values.find ("refused") == host.values.end() && host.values.find ("byName") == host.values.end()
                   && (int) host.values["good"] == 7,
               "Options: a refused set() writes nothing, by position or by name, and the right one writes");
        check (! host.timerStarts.contains ("s"), "Options: the refused sync timer is not started");
        for (const auto* line : { "to False", "define False", "recall False", "params []", "read None", "goodRead 257",
                                  "write None", "byName None", "goodWrite [1, 44]" })
            check (host.logs.contains (line), juce::String ("Options: logs ") + line + " (got " + logged + ")");
        for (const auto* line : {
                 "set: \"quiet\" is not one of its options, so nothing was done. Its only option is transmit.",
                 "ce.time.syncTimer: \"folow\" is not one of its options, so nothing was done. Its only option is follow.",
                 "ce.anim.to: \"easing\" is not one of its options, so nothing was done. Its options are: duration, beats, "
                     "sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done.",
                 "ce.device.defineParameter: \"nrpn.mbs\" is not one of its options, so nothing was done. The options of "
                     "nrpn are: msb, lsb.",
                 "ce.device.recallPreset: \"rol\" is not one of its options, so nothing was done. Its only option is role.",
                 "ce.device.parameters: \"grp\" is not one of its options, so nothing was done. Its options are: role, "
                     "query, group, type, access, limit.",
                 "ce.midi.read: \"ordr\" is not one of its options, so nothing was done. Its options are: bits, order.",
                 "ce.midi.write: \"bit\" is not one of its options, so nothing was done. Its options are: bits, order." })
            check (host.logs.contains (line), juce::String ("Options, refused in Python: ") + line);
        const auto writeRefusals = std::count (host.logs.begin(), host.logs.end(),
            juce::String ("ce.midi.write: \"bit\" is not one of its options, so nothing was done. Its options are: bits, order."));
        check (writeRefusals == 2, "Options: ce.midi.write by the parameter's name is refused as well (got " + logged + ")");
        const auto setRefusals = std::count (host.logs.begin(), host.logs.end(),
            juce::String ("set: \"quiet\" is not one of its options, so nothing was done. Its only option is transmit."));
        check (setRefusals == 2, "Options: set() by the parameter's name is refused as well (got " + logged + ")");
    }

    // get(path, form) and set(path, value, form) through BridgeScriptHost, the exported plug-in's
    // host: a form that is not one refuses the call in the WebView runtime's words
    // (scriptGetReports.test.js), naming the form meant, and nothing reaches the app; a right one
    // reaches it with its form. Python's set always handed text on; it is the host that now reads it.
    {
        juce::StringArray formLogs, reached;
        BridgeScriptHost::Callbacks fcb;
        fcb.getValue = [&] (const juce::String& path, const juce::String& form)
            { reached.add ("get " + path + " " + form); return juce::var (0.5); };
        fcb.setValue = [&] (const juce::String& path, const juce::var& v, bool, const juce::String& form)
            { reached.add ("set " + path + " " + v.toString() + " " + form); };
        fcb.log = [&] (const juce::String& m, const juce::var&) { formLogs.add (m); };
        BridgeScriptHost formHost (std::move (fcb));
        ScriptRuntime formRuntime (formHost);
        formHost.attachRuntime (&formRuntime);
        formRuntime.setErrorLogger ([] (const juce::String& line) { std::cout << "  [error] " << line << "\n"; });
        auto formScript = makeScript ("pyForms", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    log('a ' + str(get('cutoff', 'normalisedValue')))\n"
            "    set('cutoff', 0.5, 'normalisedValue')\n"
            "    self.set('value', 1, 'Normalized')\n"
            "    log('b ' + str(self.get('value', '.normalizedValue')))\n"
            "    log('c ' + str(get('cutoff', 'normalizedValue')))\n"
            "    set('cutoff', 0.25, 'normalizedValue')\n"
            "    set('cutoff', 120, {'transmit': False})\n");
        formScript.getDynamicObject()->setProperty ("owner", "cutoff");   // self is the control
        juce::Array<juce::var> formScripts;
        formScripts.add (formScript);
        formRuntime.loadScripts (juce::var (formScripts));
        formRuntime.onPanelReady (true);

        const juce::String forms = " The forms are value, normalizedValue and midiValue.";
        const juce::StringArray expectedLogs {
            "get(\"cutoff\"): \"normalisedValue\" is not a value form, so there is no answer." + forms + " Write normalizedValue.",
            "a None",
            "set(\"cutoff\"): \"normalisedValue\" is not a value form, so nothing was set." + forms + " Write normalizedValue.",
            "set(\"cutoff.value\"): \"Normalized\" is not a value form, so nothing was set." + forms,
            "get(\"cutoff.value\"): \".normalizedValue\" is not a value form, so there is no answer." + forms + " Write normalizedValue.",
            "b None",
            "c 0.5",
        };
        check (formLogs == expectedLogs,
               "Forms: a form that is not one refuses get and set in Python, in the WebView's words (got "
                   + formLogs.joinIntoString (" | ") + ")");
        check (reached == juce::StringArray { "get cutoff normalizedValue", "set cutoff 0.25 normalizedValue", "set cutoff 120 value" },
               "Forms: nothing refused reaches the app, and a right form, or set's options, does (got "
                   + reached.joinIntoString (" | ") + ")");
    }

    // ce.midi byte lists in the embedded interpreter, with Python's own bytes and bytearray read as
    // lists (scriptPreludeAgreement.test.js compares the arithmetic across engines).
    {
        juce::Array<juce::var> byteScripts;
        byteScripts.add (makeScript ("pyBytes", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    msg = ce.midi.write(bytearray([0xF0, 0, 0, 0xF7]), 1, 2, 200)\n"
            "    log('py ' + ce.midi.toHex(msg) + ' ' + str(ce.midi.getBits(b'\\x00\\xb4', 12, 3)) + ' ' + ce.midi.toBase64(b'\\xf0\\x41\\x10\\x42'))\n"));
        runtime.loadScripts (juce::var (byteScripts));
        host.logs.clear();
        runtime.onPanelReady (true);
        check (host.logs.contains ("py F0 01 48 F7 3 8EEQQg=="), "Bytes: ce.midi byte helpers answer in Python, reading bytes and bytearray (got "
                   + host.logs.joinIntoString (" | ") + ")");
    }

    // Channel messages are checked in the prelude before they reach the host: an address outside its
    // range is refused (CC 200 used to be CC 127), a fraction rounds half up as in the editor (this
    // floored it), and a left-out argument is refused where Python raised a TypeError.
    {
        juce::Array<juce::var> sendScripts;
        sendScripts.add (makeScript ("pySends", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    sendCC(1, 200, 5)\n"
            "    sendCC(1, 7, 64.5)\n"
            "    sendNote(1, 60)\n"
            "    sendNote(1)\n"
            "    sendTransport('pause')\n"
            "    ce.midi.put([1, 2], 1)\n"
            "    log('py ' + str(ce.midi.toHex([300])))\n"));
        runtime.loadScripts (juce::var (sendScripts));
        host.logs.clear();
        host.ccSends.clear();
        host.rawSends.clear();
        runtime.onPanelReady (true);
        check (host.ccSends.joinIntoString (" | ") == "1 7 65" && host.rawSends.isEmpty(),
               "Sends: only the valid CC reaches the host, rounded half up (got " + host.ccSends.joinIntoString (" | ")
                   + " / " + host.rawSends.joinIntoString (" | ") + ")");
        check (host.logs.joinIntoString (" | ") ==
                   "sendCC: 200 is not a controller number, so nothing was sent. A controller number is a whole number from 0 to 127. | "
                   "sendNote: no velocity given, so nothing was sent. | "
                   "sendNote: no note was given, so nothing was sent. A note is a MIDI number or a name, such as 60 or \"C4\". | "
                   "sendTransport: \"pause\" is not a transport action, so nothing was sent. The actions are \"start\", \"continue\" and \"stop\". | "
                   "ce.midi.put: no bytes given, so there is no answer. | "
                   "ce.midi.toHex: 300 at position 0 is not a byte, so there is no answer. A byte is a whole number from 0 to 255, "
                   "or one or two hex digits such as \"F7\". | "
                   "py None",
               "Sends: the rest are refused in the WebView runtime's words, a left-out argument included (got "
                   + host.logs.joinIntoString (" | ") + ")");
    }

    // ce.math's colours and amounts, and ce.anim's target, in the embedded interpreter. An alpha left
    // out raised TypeError here, a target of "100px" raised ValueError, and "#000" was refused with
    // no word; scriptPreludeAgreement.test.js compares the words across engines. CSS's short forms
    // are read as a colour property stores them ("#000" is "#000000" now, as it is for set()), by the
    // prelude's own port with the generated names table: the rounding is JavaScript's half up (30% of
    // 255 is 76.5, which is 77, where round() gives 76), and what a property refuses is refused.
    {
        juce::Array<juce::var> visualScripts;
        visualScripts.add (makeScript ("pyVisual", "onPanelReady", "*",
            "def onPanelReady(info):\n"
            "    log('py ' + str(ce.math.hsl('#0008')) + ' ' + ce.math.lighten('336699', '0.5') + ' ' + str(ce.math.alpha('336699')))\n"
            "    log('py css ' + ce.math.lighten('Red', 0.2) + ' ' + ce.math.alpha('#abc', 0.5) + ' '\n"
            "        + str(ce.math.rgb('rgba(255, 0, 0, 0.5)')['r']) + ' ' + ce.math.mix('hsl(0, 0%, 30%)', 'transparent', 0)\n"
            "        + ' ' + ce.math.darken('rgb(2.5 300 -4)', 1) + ' ' + str(ce.math.hsl('#000')['l']) + ' ' + str(ce.math.rgb(' red ')))\n"
            "    ce.anim.to('cutoff', '100px')\n"
            "    log('py done')\n"));
        runtime.loadScripts (juce::var (visualScripts));
        host.logs.clear();
        runtime.onPanelReady (true);
        const auto got = " (got " + host.logs.joinIntoString (" | ") + ")";
        check (host.logs.contains ("py None #99B3CC None"), "Colours: ce.math refuses in Python, and reads text that is a number" + got);
        check (host.logs.contains ("py css #FF3333 80AABBCC 255 #4D4D4D #03FF00 0.0 None"),
               "Colours: ce.math reads CSS's short forms in Python" + got);
        check (host.logs.contains ("py done"), "Colours: a refusal is a message, not an exception" + got);
        for (const auto* line : {
                 "ce.math.hsl: \"#0008\" is not a colour, so there is no answer. A colour is 6 hex digits (RRGGBB) "
                 "or 8 (AARRGGBB), with or without \"#\", or \"#RGB\", a CSS colour name, rgb() or hsl(). Write \"88000000\".",
                 "ce.math.rgb: \" red \" is not a colour, so there is no answer. A colour is 6 hex digits (RRGGBB) "
                 "or 8 (AARRGGBB), with or without \"#\", or \"#RGB\", a CSS colour name, rgb() or hsl(). Write \"#FF0000\".",
                 "ce.math.alpha: the alpha is a number from 0 to 1, and none was given, so there is no answer.",
                 "ce.anim.to: \"100px\" is not a number, so nothing was started." })
            check (host.logs.contains (line), juce::String ("Colours: refused in the WebView runtime's words: ") + line);
    }

    // ce.anim's `repeat` is the runs in all, and done(completed) gets one argument, True or False:
    // the same moves as ScriptRuntimeTests.cpp §39b runs through the Lua and JavaScript preludes.
    // done was handed a dict, { "path", "completed" } or { "paths", "completed" }, and a dict that is
    // not empty is always true, so `if completed:` read a cancelled move as a finished one.
    {
        AnimHost animHost;
        ScriptRuntime anim (animHost);
        animHost.runtime = &anim;
        juce::StringArray animErrors;
        anim.setErrorLogger ([&animErrors] (const juce::String& line)
            { animErrors.add (line); std::cout << "  [error] " << line << "\n"; });
        juce::Array<juce::var> animScripts;
        animScripts.add (makeScript ("pyDone", "onDone", "*",
            "def say(name):\n"
            "    def done(*args):\n"
            "        log(name + ' ' + str(len(args)) + ' ' + type(args[0]).__name__ + ' ' + str(args[0]))\n"
            "    return done\n"
            "def onDone(value=None):\n"
            "    ce.anim.to('a', 1, { 'duration': 100, 'from': 0, 'done': say('a') })\n"
            "    ce.anim.to('b', 1, { 'duration': 100, 'from': 0, 'done': say('b') })\n"
            "    ce.anim.to('c', 1, { 'duration': 100, 'from': 0, 'done': say('c') })\n"
            "    ce.anim.to(['d', 'e'], 1, { 'duration': 100, 'from': 0, 'stagger': 50, 'repeat': 2, 'done': say('d,e') })\n"
            "    ce.anim.to(['f', 'g'], 1, { 'duration': 100, 'from': 0, 'done': say('f,g') })\n"
            "    ce.anim.to('h', 1, { 'duration': 100, 'from': 0, 'repeat': 3, 'done': say('h') })\n"
            "    ce.anim.to('i', 1, { 'duration': 100, 'from': 0, 'repeat': 0, 'done': say('i') })\n"
            "    ce.anim.to('j', 1, { 'duration': 100, 'from': 0, 'done': say('j') })\n"
            "    ce.anim.stop('b')\n"
            "    ce.anim.finish('c')\n"
            "    ce.anim.stop('f')\n"
            "    ce.anim.to('j', 5, { 'duration': 100 })\n"));
        anim.loadScripts (juce::var (animScripts));
        auto steps = [&animHost] { const auto line = animHost.logs.joinIntoString (" | "); animHost.logs.clear(); return line; };
        anim.tickAnimations (0.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onDone", "panel", juce::var());
        const auto atStart = steps();
        check (atStart == "b 1 bool False | c 1 bool True | j 1 bool False",
               "ce.anim: stopped is done(False), finished done(True), replaced done(False), one argument each (got " + atStart + ")");
        anim.tickAnimations (100.0);
        const auto at100 = steps();
        check (at100 == "a 1 bool True | f,g 1 bool False",
               "ce.anim: arrived is done(True); a list with one stopped is done(False) once, after the last (got " + at100 + ")");
        anim.tickAnimations (150.0);
        anim.tickAnimations (200.0);
        const auto at200 = steps();
        check (at200.isEmpty() && ! anim.animationRunning ("d") && anim.animationRunning ("e") && anim.animationRunning ("h"),
               "ce.anim: repeat = 2 is two runs; the staggered one is still on its second, so no done yet (got " + at200 + ")");
        anim.tickAnimations (250.0);
        anim.tickAnimations (300.0);
        const auto at300 = steps();
        check (at300 == "d,e 1 bool True | h 1 bool True",
               "ce.anim: the list's done comes once; repeat = 3 ends on the third (got " + at300 + ")");
        anim.tickAnimations (1300.0);
        check (anim.animationRunning ("i"), "ce.anim: repeat = 0 runs until it is stopped");
        anim.stopAnimation();
        const auto atStop = steps();
        check (atStop == "i 1 bool False", "ce.anim: ...and stopping it is done(False) (got " + atStop + ")");
        check (animErrors.isEmpty(), "ce.anim: no script raised doing any of it");

        // Two Python scripts each run this prelude in a namespace of their own, so each counted its
        // lists from 1 and the host counted its own: the first list's end called both dones, and the
        // second's called none. And a path replaced by a move with its own done called the new one.
        juce::Array<juce::var> twoScripts;
        twoScripts.add (makeScript ("pyA", "onGo", "*",
            "def onGo(value=None):\n"
            "    ce.anim.to(['p', 'q'], 1, { 'duration': 100, 'from': 0, 'done': lambda c: log('A list ' + str(c)) })\n"
            "    ce.anim.to('x', 1, { 'duration': 100, 'from': 0, 'done': lambda c: log('A x ' + str(c)) })\n"));
        twoScripts.add (makeScript ("pyB", "onGo", "*",
            "def onGo(value=None):\n"
            "    ce.anim.to(['r', 's'], 1, { 'duration': 200, 'from': 0, 'done': lambda c: log('B list ' + str(c)) })\n"
            "    ce.anim.to('x', 2, { 'duration': 100, 'from': 0, 'done': lambda c: log('B x ' + str(c)) })\n"));
        anim.loadScripts (juce::var (twoScripts));
        anim.tickAnimations (2000.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onGo", "panel", juce::var());
        const auto twoStart = steps();
        check (twoStart == "A x False", "ce.anim: the replaced move's own done gets False (got " + twoStart + ")");
        anim.tickAnimations (2100.0);
        const auto two100 = steps();
        check (two100 == "A list True | B x True", "ce.anim: one script's list ends its own done only (got " + two100 + ")");
        anim.tickAnimations (2200.0);
        const auto two200 = steps();
        check (two200 == "B list True", "ce.anim: …and the other's ends its (got " + two200 + ")");
        check (animErrors.isEmpty(), "ce.anim: no script raised doing that either");

        // An envelope's shape is sampled in the prelude with mapCurve(). The sampler called map(),
        // which here is Python's own: float() of a map object raised, the guard read it as 0, and
        // every sample was 0, so the value sat at `from` for the whole move without a word.
        juce::Array<juce::var> envelopeScripts;
        envelopeScripts.add (makeScript ("pyEnvelope", "onEnvelope", "*",
            "def onEnvelope(value=None):\n"
            "    ok = ce.anim.envelope('e', [{ 'x': 0, 'y': 0 }, { 'x': 0.5, 'y': 1 }, { 'x': 1, 'y': 0 }],\n"
            "                          { 'duration': 1000, 'from': 0, 'to': 100 })\n"
            "    log('started ' + str(ok))\n"));
        anim.loadScripts (juce::var (envelopeScripts));
        anim.tickAnimations (3000.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onEnvelope", "panel", juce::var());
        const auto envelopeStart = steps();
        check (envelopeStart == "started True", "ce.anim.envelope starts a move (got " + envelopeStart + ")");
        anim.tickAnimations (3250.0);
        check (std::abs ((double) animHost.values["e"] - 50.0) < 0.5,
               "ce.anim.envelope: the prelude samples the shape, so the value climbs: 50 a quarter of the way in (got "
                   + animHost.values["e"].toString() + ")");
        anim.tickAnimations (3500.0);
        check (std::abs ((double) animHost.values["e"] - 100.0) < 0.5, "ce.anim.envelope: …peaks halfway");
        anim.tickAnimations (4000.0);
        check (std::abs ((double) animHost.values["e"]) < 0.5, "ce.anim.envelope: …and comes back down to 0");
        check (animErrors.isEmpty(), "ce.anim.envelope: no script raised");

        // A point the sampler cannot place starts nothing, in the WebView runtime's words: an x
        // written out of 100 was never reached, and a y that is not a number was dropped, both
        // without a word. Too few points is the note it always was, in those words too.
        juce::Array<juce::var> refusedScripts;
        refusedScripts.add (makeScript ("pyEnvelopeRefused", "onRefused", "*",
            "def onRefused(value=None):\n"
            "    a = ce.anim.envelope('e', [{ 'x': 0, 'y': 0 }, { 'x': 50, 'y': 1 }])\n"
            "    b = ce.anim.envelope('e', [(0, 0), (1, 'high')])\n"
            "    c = ce.anim.envelope('e', [(0, 0)])\n"
            "    log('answers ' + str(a) + ' ' + str(b) + ' ' + str(c))\n"));
        anim.loadScripts (juce::var (refusedScripts));
        animHost.logs.clear();
        anim.dispatchEvent ("onRefused", "panel", juce::var());
        const auto refused = steps();
        check (refused == "ce.anim.envelope: the x of point 2 of 2 is a number from 0 to 1, and 50 is not, so nothing was started. "
                          "If you meant 50 out of 100, write 0.5. | "
                          "ce.anim.envelope: the y of point 2 of 2 is a number, and \"high\" is not, so nothing was started. | "
                          "ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started. | "
                          "answers False False False",
               "ce.anim.envelope: a point it cannot place is refused in the WebView's words (got " + refused + ")");
        check (! anim.animationRunning ("e") && animErrors.isEmpty(), "ce.anim.envelope: …nothing started, and nothing raised");

        // A list with a colour property in it is refused whole, in every verb: each colour named in
        // the words one path is refused in, nothing started, the list's done never called, and the
        // call answers False, as it does for a target that is not a number. The colour alone was
        // refused and the rest moved, and the list's done waited for a path that never started.
        juce::Array<juce::var> listScripts;
        listScripts.add (makeScript ("pyList", "onList", "*",
            "def onList(value=None):\n"
            "    a = ce.anim.to(['m', 'lbl.colour', 'n', 'top.colour'], 1, { 'duration': 100, 'from': 0, 'done': lambda c: log('to done ' + str(c)) })\n"
            "    b = ce.anim.spring(['m', 'lbl.colour'], 1, { 'duration': 100, 'from': 0, 'done': lambda c: log('spring done ' + str(c)) })\n"
            "    c = ce.anim.envelope(['m', 'lbl.colour'], [{ 'x': 0, 'y': 0 }, { 'x': 1, 'y': 1 }], { 'duration': 100, 'done': lambda c: log('envelope done ' + str(c)) })\n"
            "    d = ce.anim.to('m', 'wide')\n"
            "    e = ce.anim.to(['m', 'n'], 1, { 'duration': 100, 'from': 0, 'done': lambda c: log('numbers done ' + str(c)) })\n"
            "    log('answers ' + str(a) + ' ' + str(b) + ' ' + str(c) + ' ' + str(d) + ' ' + str(e))\n"));
        anim.loadScripts (juce::var (listScripts));
        anim.tickAnimations (5000.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onList", "panel", juce::var());
        const auto listStart = steps();
        check (listStart == "ce.anim.to: \"lbl.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                            "ce.anim.to: \"top.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                            "ce.anim.spring: \"lbl.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                            "ce.anim.envelope: \"lbl.colour\" is a colour, and ce.anim moves numbers, so nothing was started. | "
                            "ce.anim.to: \"wide\" is not a number, so nothing was started. | "
                            "answers False False False False True",
               "ce.anim: a list with a colour in it is refused whole, each colour named, and answers False (got " + listStart + ")");
        anim.tickAnimations (5100.0);
        const auto listEnd = steps();
        check (listEnd == "numbers done True",
               "ce.anim: only the list that started calls its done (got " + listEnd + ")");
        check (animErrors.isEmpty(), "ce.anim: no script raised refusing a list");

        // A control the panel does not have used to start a move that wrote a refused set() on
        // every tick and called done with True; an empty path answered False without a word, and a
        // missing one reached the host as the text "None". Each is rejected with an error now, a
        // list with a missing control in it whole, and nothing starts, as in the WebView.
        juce::Array<juce::var> missingScripts;
        missingScripts.add (makeScript ("pyMissing", "onMissing", "*",
            "def onMissing(value=None):\n"
            "    a = ce.anim.to('nosuch', 1, { 'duration': 100, 'done': lambda c: log('missing done ' + str(c)) })\n"
            "    b = ce.anim.spring(['m', 'nosuch.value'], 1, { 'duration': 100, 'done': lambda c: log('list done ' + str(c)) })\n"
            "    c = ce.anim.to('', 1)\n"
            "    d = ce.anim.to(None, 1)\n"
            "    e = ce.anim.envelope([], [(0, 0), (1, 1)])\n"
            "    log('answers ' + str(a) + ' ' + str(b) + ' ' + str(c) + ' ' + str(d) + ' ' + str(e))\n"));
        anim.loadScripts (juce::var (missingScripts));
        anim.tickAnimations (6000.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onMissing", "panel", juce::var());
        const auto missing = steps();
        check (missing == "ce.anim.to: control \"nosuch\" not found on the active panel, so nothing was started. | "
                          "ce.anim.spring: control \"nosuch\" not found on the active panel, so nothing was started. | "
                          "ce.anim.to: no path was given, so nothing was started. | "
                          "ce.anim.to: no path was given, so nothing was started. | "
                          "ce.anim.envelope: the list has no paths, so nothing was started. | "
                          "answers False False False False False",
               "ce.anim: a missing control, an empty path and an empty list are rejected with an error (got " + missing + ")");
        anim.tickAnimations (6200.0);
        check (steps().isEmpty() && ! anim.animationRunning ("m"), "ce.anim: …nothing started, so no done is called");
        check (animErrors.isEmpty(), "ce.anim: no script raised on a missing path");

        // A done that is not a function: the prelude passes it on as __badDone, the runtime says so
        // once, and the move goes ahead. It was dropped without a word.
        juce::Array<juce::var> badDoneScripts;
        badDoneScripts.add (makeScript ("pyBadDone", "onBadDone", "*",
            "def onBadDone(value=None):\n"
            "    log('started ' + str(ce.anim.to('m', 1, { 'duration': 100, 'from': 0, 'done': 'x' })))\n"));
        anim.loadScripts (juce::var (badDoneScripts));
        anim.tickAnimations (7000.0);
        animHost.logs.clear();
        anim.dispatchEvent ("onBadDone", "panel", juce::var());
        const auto badDone = steps();
        check (badDone == "ce.anim.to: \"x\" is not a function, so nothing is called when the move ends. This is said only the first time. | started True",
               "ce.anim: a done that is not a function is said, and the move goes ahead (got " + badDone + ")");
        check (animErrors.isEmpty(), "ce.anim: no script raised on a done that is not a function");
    }

    // ---- Two instances in one process ------------------------------------------------------------
    // What the user asked for: every instance of a panel is on its own, even two copies of the same
    // panel. Each runtime is one instance (one plug-in, one standalone window).
    {
        TestHost hostA, hostB;
        juce::StringArray errorsA, errorsB;
        auto runtimeA = std::make_unique<ScriptRuntime> (hostA);
        auto runtimeB = std::make_unique<ScriptRuntime> (hostB);
        runtimeA->setErrorLogger ([&errorsA] (const juce::String& line) { errorsA.add (line); std::cout << "  [A error] " << line << "\n"; });
        runtimeB->setErrorLogger ([&errorsB] (const juce::String& line) { errorsB.add (line); std::cout << "  [B error] " << line << "\n"; });

        // The same panel twice: identical scripts, identical ids.
        const auto samePanel = [] (const char* extra)
        {
            juce::Array<juce::var> list;
            list.add (makeScript ("counter", "onTick", "*",
                "count = 0\n"
                "def onTick(value):\n"
                "    global count\n"
                "    count += 1\n"
                "    set(\"count\", count)\n"));
            list.add (makeScript ("modules", "onCheck", "*", extra));
            list.add (makeScript ("poker", "onPoke", "*",
                "def onPoke(value):\n"
                "    set(\"poke\", 1)\n"
                "    set(\"after\", \"mine\")\n"));
            list.add (makeScript ("threads", "onThread", "*",
                "import threading\n"
                "def onThread(value):\n"
                "    threading.Thread(target=lambda: None).start()\n"));
            return juce::var (list);
        };
        // A changes a module and a builtin at load; B, the same panel, looks for the change.
        runtimeA->loadScripts (samePanel (
            "import json, builtins\n"
            "json.tag = 'set by A'\n"
            "builtins.leak = 1\n"
            "def onCheck(value):\n"
            "    pass\n"));
        runtimeB->loadScripts (samePanel (
            "import json, builtins\n"
            "def onCheck(value):\n"
            "    set(\"tag\", str(getattr(json, 'tag', None)))\n"
            "    set(\"leak\", hasattr(builtins, 'leak'))\n"));

        runtimeA->dispatchEvent ("onTick", "panel", juce::var());
        runtimeA->dispatchEvent ("onTick", "panel", juce::var());
        runtimeB->dispatchEvent ("onTick", "panel", juce::var());
        check ((int) hostA.values["count"] == 2 && (int) hostB.values["count"] == 1,
               "Two copies of one panel keep their own variables (A counted 2, B 1)");

        runtimeB->dispatchEvent ("onCheck", "panel", juce::var());
        check (hostB.values["tag"].toString() == "None",
               "A module one instance changes is not changed for the other (got " + hostB.values["tag"].toString() + ")");
        check (hostB.values.count ("leak") == 1 && ! (bool) hostB.values["leak"],
               "A builtin one instance adds is not there for the other");

        // A's script, mid-call, causes B's script to run (through A's host), then carries on: its
        // next call must still reach A's host. With one process-wide host pointer it reached B's.
        hostA.onSet = [&] (const juce::String& path) { if (path == "poke") runtimeB->dispatchEvent ("onPoke", "panel", juce::var()); };
        runtimeA->dispatchEvent ("onPoke", "panel", juce::var());
        hostA.onSet = nullptr;
        check (hostA.values["after"].toString() == "mine" && hostB.values["after"].toString() == "mine",
               "Each instance's script reaches its own host, even with the other's call inside its own");

        runtimeA->dispatchEvent ("onThread", "panel", juce::var());
        check (errorsA.joinIntoString ("\n").contains ("thread"),
               "A script cannot start a thread, which would outlive its instance (as in Pyodide)");

        // A runaway loop in A is stopped in A; B is not touched.
        juce::Array<juce::var> loop;
        loop.add (makeScript ("spin", "onSpin", "*", "def onSpin(value):\n    while True:\n        pass\n"));
        juce::Array<juce::var> bye;
        bye.add (makeScript ("bye", "onTick", "*",
            "import atexit\n"
            "atexit.register(lambda: set(\"bye\", 1))\n"
            "def onTick(value):\n"
            "    set(\"ticked\", 1)\n"));
        runtimeB->loadScripts (juce::var (bye));
        runtimeA->loadScripts (juce::var (loop));
        errorsA.clear();
        runtimeA->dispatchEvent ("onSpin", "panel", juce::var());
        runtimeB->dispatchEvent ("onTick", "panel", juce::var());
        check (errorsA.joinIntoString ("\n").contains ("spin") && (int) hostB.values["ticked"] == 1 && errorsB.isEmpty(),
               "A runaway loop in one instance is stopped there, and the other runs on");

        // Closing B ends its interpreter: what runs as it ends reaches no host, and A carries on.
        runtimeB.reset();
        check (hostB.values.count ("bye") == 0, "A closed instance's last code reaches no host");
        juce::Array<juce::var> after;
        after.add (makeScript ("still", "onTick", "*", "def onTick(value):\n    set(\"still\", 1)\n"));
        runtimeA->loadScripts (juce::var (after));
        runtimeA->dispatchEvent ("onTick", "panel", juce::var());
        check ((int) hostA.values["still"] == 1, "The other instance runs on after one is closed");
    }

    std::cout << "-----------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
