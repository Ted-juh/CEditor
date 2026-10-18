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
#include <juce_core/juce_core.h>
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
    void sendCC (int, int, const juce::var&) override {}
    void sendNRPN (int, int, int, const juce::var&) override {}
    void sendSysex (const juce::var&) override {}
    void requestDump (const juce::String&) override {}
    void applyDump (const juce::var&) override {}
    void sendDump (const juce::String&) override {}
    juce::var buildDump (const juce::String&) override { return {}; }
    juce::var runAction (const juce::String&, const juce::var&) override { return {}; }
    void emitEvent (const juce::String&, const juce::var&) override {}
    void log (const juce::String& message, const juce::var&) override { logs.add (message); }

    juce::StringArray rawSends;   // sendMidi, as "90 3C 64"
    void sendMidi (const juce::var& bytes) override
    {
        juce::StringArray hex;
        if (auto* arr = bytes.getArray())
            for (const auto& b : *arr) hex.add (juce::String::toHexString ((int) b).paddedLeft ('0', 2).toUpperCase());
        rawSends.add (hex.joinIntoString (" "));
    }
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
