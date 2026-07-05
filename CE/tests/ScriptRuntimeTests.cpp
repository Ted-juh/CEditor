// ScriptRuntimeTests — a standalone smoke test for the scripting runtime (Milestone 1, tasks 5-7).
//
// Verifies the engine actually RUNS scripts, independent of any app wiring:
//   • Lua (Sol3) loads + executes, helpers work, set() crosses to the host
//   • JavaScript (juce_javascript) loads + executes, log() crosses to the host
//   • event dispatch routes to the right handlers, payloads pass through
//   • lifecycle hooks fire (onPanelReady with firstTime)
//
// Build with -DCEDITOR_SCRIPTING=ON, then run ./CEditorScriptingTests.
// Prints PASS/FAIL per check and returns non-zero on any failure.

#include "Scripting/ScriptRuntime.h"
#include <juce_core/juce_core.h>
#include <iostream>

using namespace ceditor::scripting;

// A host that just records what scripts ask it to do.
class TestHost : public ScriptHostApi
{
public:
    ScriptRuntime* runtime = nullptr; // set after construction so emit() can re-dispatch (feedback-loop test)
    std::map<juce::String, juce::var> values;
    juce::StringArray logs;
    juce::StringArray ccSends;

    juce::var getValue (const juce::String& path, const juce::String&) override
    { auto it = values.find (path); return it != values.end() ? it->second : juce::var(); }

    void setValue (const juce::String& path, const juce::var& value, const juce::var&) override
    { values[path] = value; }

    void sendCC (int ch, int cc, const juce::var& v) override
    { ccSends.add (juce::String (ch) + ":" + juce::String (cc) + ":" + v.toString()); }

    void sendNRPN (int, int, int, const juce::var&) override {}
    void sendSysex (const juce::var&) override {}
    void requestDump (const juce::String&) override {}
    void applyDump (const juce::var&) override {}
    void sendDump (const juce::String&) override {}
    juce::var buildDump (const juce::String&) override { return {}; }
    juce::var runAction (const juce::String&, const juce::var&) override { return {}; }
    void emitEvent (const juce::String& name, const juce::var& data) override
    { if (runtime != nullptr) runtime->dispatchEvent (name, "panel", data); }
    void log (const juce::String& message, const juce::var&) override { logs.add (message); }
};

static int failures = 0;
static void check (bool ok, const juce::String& name)
{
    std::cout << (ok ? "  PASS  " : "  FAIL  ") << name << "\n";
    if (! ok) ++failures;
}

static juce::var makeScript (const char* id, const char* lang, const char* scope,
                             const char* event, const char* target, const juce::String& source,
                             const juce::String& compiledJs = {})
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("id", id);
    o->setProperty ("name", id);
    o->setProperty ("language", lang);
    o->setProperty ("scope", scope);
    o->setProperty ("event", event);
    o->setProperty ("target", target);
    o->setProperty ("source", source);
    if (compiledJs.isNotEmpty()) o->setProperty ("compiledJs", compiledJs);
    o->setProperty ("enabled", true);
    return juce::var (o);
}

int main()
{
    std::cout << "ScriptRuntime smoke test\n------------------------\n";

    TestHost host;
    ScriptRuntime runtime (host);
    host.runtime = &runtime;
    juce::StringArray errors;
    runtime.setErrorLogger ([&errors] (const juce::String& line)
        { errors.add (line); std::cout << "  [error] " << line << "\n"; });

    juce::Array<juce::var> scripts;
    scripts.add (makeScript ("lua1", "lua", "panel", "onValueChanged", "*",
        "function onValueChanged(value)\n  set(\"cutoff.value\", scale(value, 0, 127, 0, 100))\nend\n"));
    scripts.add (makeScript ("js1", "javascript", "panel", "onValueChanged", "*",
        "function onValueChanged(value) { log(\"js got \" + value) }"));
    scripts.add (makeScript ("lua2", "lua", "panel", "onPanelReady", "*",
        "function onPanelReady(info)\n  if info.firstTime then log(\"ready-first\") end\nend\n"));
    // TypeScript ships as the JS the editor transpiled (compiledJs). The host has no TS compiler:
    // it must run compiledJs through the JS engine, NOT the raw TS in `source` (which is unparseable).
    scripts.add (makeScript ("ts1", "typescript", "panel", "onValueChanged", "*",
        "function onValueChanged(value: number): void { log(\"ts \" + value); }",
        "function onValueChanged(value) { log(\"ts got \" + value); }"));
    // A TypeScript script with NO compiledJs is an editor/build error: it must be skipped, never
    // fed as raw TS to QuickJS (its handler must not run).
    scripts.add (makeScript ("ts2", "typescript", "panel", "onValueChanged", "*",
        "function onValueChanged(value: number): void { log(\"ts2 ran\"); }"));
    runtime.loadScripts (juce::var (scripts));

    // 1) event dispatch -> both Lua and JS handlers fire on the same event
    runtime.dispatchEvent ("onValueChanged", "panel", juce::var (64));

    const double cutoff = (double) host.values["cutoff.value"];
    check (cutoff > 50.0 && cutoff < 51.0, "Lua ran: set(cutoff.value) via scale() => ~50.4 (got " + juce::String (cutoff) + ")");
    check (host.logs.contains ("js got 64"), "JS ran: log(\"js got 64\")");
    check (host.logs.contains ("ts got 64"), "TS ran via compiledJs: log(\"ts got 64\")");
    check (! host.logs.contains ("ts2 ran"), "TS without compiledJs skipped (raw TS not fed to QuickJS)");

    // 2) lifecycle hook with firstTime
    runtime.onPanelReady (true);
    check (host.logs.contains ("ready-first"), "Lifecycle: onPanelReady(firstTime) fired");

    // 3) firstTime=false should NOT re-log (guard works)
    host.logs.clear();
    runtime.onPanelReady (false);
    check (! host.logs.contains ("ready-first"), "Lifecycle: onPanelReady(firstTime=false) guarded");

    // 4) anti-flood / loop guards (redesign §7 keep-list) -----------------------------------
    juce::Array<juce::var> guardScripts;
    guardScripts.add (makeScript ("lualoop", "lua", "panel", "onRunaway", "*",
        "function onRunaway()\n  while true do end\nend\n"));
    guardScripts.add (makeScript ("jsloop", "javascript", "panel", "onRunawayJs", "*",
        "function onRunawayJs() { while (true) {} }"));
    guardScripts.add (makeScript ("luaping", "lua", "panel", "onPing", "*",
        "function onPing(v)\n  emit(\"onPing\", v)\nend\n"));
    runtime.loadScripts (juce::var (guardScripts));

    // A runaway Lua loop must be aborted by the instruction-count hook, not hang the host.
    errors.clear();
    runtime.dispatchEvent ("onRunaway", "panel", juce::var());
    check (errors.joinIntoString ("\n").contains ("instruction budget"),
           "Guard: runaway Lua loop aborted by the instruction budget");

    // A runaway JS loop must be aborted by the QuickJS execution-time limit (~2s).
    errors.clear();
    runtime.dispatchEvent ("onRunawayJs", "panel", juce::var());
    check (errors.joinIntoString ("\n").contains ("jsloop"),
           "Guard: runaway JS loop aborted by maximumExecutionTime");

    // An emit()->dispatch feedback loop must be cut off at the depth backstop.
    errors.clear();
    runtime.dispatchEvent ("onPing", "panel", juce::var (1));
    check (errors.joinIntoString ("\n").contains ("dispatch depth"),
           "Guard: emit/dispatch feedback loop cut off at max depth");

    std::cout << "------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
