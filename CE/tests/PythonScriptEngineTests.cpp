// PythonScriptEngineTests — smoke test for the REAL embedded CPython engine (CEDITOR_PYTHON).
//
// Verifies the native interpreter actually runs window-closed Python through the same ScriptEngine
// path as Lua/JS:
//   • a python script loads + executes, log()/set() cross to the host
//   • the shared helpers work (scale)
//   • event dispatch routes by language to the python handler
//   • THE FULL-STDLIB CLAIM: `import json` / `import re` work (this is the whole point of native CPython)
//   • per-script namespace isolation (two scripts, same handler name, no clash)
//
// Build with -DCEDITOR_SCRIPTING=ON -DCEDITOR_PYTHON=ON, then run ./CEditorPythonScriptTests.
// Requires the bundled/installed stdlib to be discoverable (env CEDITOR_PYTHONHOME or a dev install).

#include "Scripting/ScriptRuntime.h"
#include <juce_core/juce_core.h>
#include <iostream>

using namespace ceditor::scripting;

class TestHost : public ScriptHostApi
{
public:
    std::map<juce::String, juce::var> values;
    juce::StringArray logs;

    juce::var getValue (const juce::String& path, const juce::String&) override
    { auto it = values.find (path); return it != values.end() ? it->second : juce::var(); }
    void setValue (const juce::String& path, const juce::var& value, const juce::var&) override
    { values[path] = value; }
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
    runtime.loadScripts (juce::var (scripts));

    runtime.dispatchEvent ("onValueChanged", "panel", juce::var (64));

    const double cutoff = (double) host.values["cutoff.value"];
    check (cutoff > 50.0 && cutoff < 51.0, "Python ran: set(cutoff.value) via scale() => ~50.4 (got " + juce::String (cutoff) + ")");
    check (host.logs.contains ("py got 64"), "Python ran: log(\"py got 64\")");
    check (host.logs.contains ("second 128"), "Isolation: py2.onValueChanged fired independently (second 128)");

    runtime.onPanelReady (true);
    check (host.logs.contains ("stdlib 7 42"), "FULL STDLIB: import json + re worked window-closed");

    std::cout << "-----------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
