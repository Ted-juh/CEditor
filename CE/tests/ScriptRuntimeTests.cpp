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

    // Raw byte sends, recorded as hex so a test can assert the exact wire bytes — which is where a
    // status nibble or an lsb/msb swap actually hides.
    juce::StringArray rawSends;
    void sendMidi (const juce::var& bytes) override
    {
        juce::StringArray hex;
        if (auto* arr = bytes.getArray())
            for (const auto& b : *arr) hex.add (juce::String::toHexString ((int) b).paddedLeft ('0', 2).toUpperCase());
        rawSends.add (hex.joinIntoString (" "));
    }

    std::map<juce::String, juce::var> settings;
    void saveSetting (const juce::String& key, const juce::var& value) override { settings[key] = value; }
    juce::var loadSetting (const juce::String& key) override
    { auto it = settings.find (key); return it != settings.end() ? it->second : juce::var(); }
    void sendSysex (const juce::var&) override {}
    void requestDump (const juce::String&) override {}
    void applyDump (const juce::var&) override {}
    void sendDump (const juce::String&) override {}
    juce::var buildDump (const juce::String&) override { return {}; }
    // Delegated to the runtime, the way BridgeScriptHost does when the app supplies no callback:
    // run() resolves against the loaded script set, which is what makes it work cross-language.
    juce::var runAction (const juce::String& ref, const juce::var& args) override
    { return runtime != nullptr ? runtime->runAction (ref, args) : juce::var(); }
    void emitEvent (const juce::String& name, const juce::var& data) override
    { if (runtime != nullptr) runtime->dispatchEvent (name, "panel", data); }
    void log (const juce::String& message, const juce::var&) override { logs.add (message); }

    juce::StringArray timerOps;
    void startTimer (const juce::String& id, int ms) override
    { timerOps.add ("start:" + id + ":" + juce::String (ms)); }
    void stopTimer (const juce::String& id) override { timerOps.add ("stop:" + id); }
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

    // 5) run("owner.action") — cross-language, host-dispatched ------------------------------
    // run() used to be wired per-host, and the exported player wired it to a stub, so it was a
    // silent no-op in every shipped plugin. It belongs to the runtime, which owns the script set.
    juce::Array<juce::var> runScripts;
    runScripts.add (makeScript ("provider", "lua", "component", "onValueChanged", "filter",
        "function boost(amount)\n  log(\"boost \" .. tostring(amount))\n  return amount * 2\nend\n"
        "function onValueChanged(v) end\n"));
    // The caller is JavaScript and the callee Lua: run() has to cross the language boundary.
    runScripts.add (makeScript ("caller", "javascript", "panel", "onCallOut", "*",
        "function onCallOut() { log(\"got \" + run(\"filter.boost\", 21)); }"));
    runtime.loadScripts (juce::var (runScripts));

    host.logs.clear();
    errors.clear();
    runtime.dispatchEvent ("onCallOut", "panel", juce::var());
    check (host.logs.contains ("boost 21"), "run(): reached the Lua action from a JS script");
    check (host.logs.contains ("got 42"), "run(): the return value crossed back to the caller");

    // A bare action name matches any script; an unknown one reports instead of failing silently.
    host.logs.clear();
    errors.clear();
    runtime.runAction ("nosuch.action", juce::var());
    check (errors.joinIntoString ("\n").contains ("no script defining"),
           "run(): an unresolved action is reported, not swallowed");

    // 6) checksum() — declared in panelApi.js, previously implemented in no engine ------------
    juce::Array<juce::var> csScripts;
    csScripts.add (makeScript ("cslua", "lua", "device", "onSum", "*",
        "function onSum()\n"
        "  log(\"roland \" .. tostring(checksum(\"roland\", {1, 2, 3})))\n"
        "  log(\"xor \" .. tostring(checksum(\"xor\", {1, 2, 3})))\n"
        "  log(\"short \" .. tostring(checksum({1, 2, 3})))\n"
        "end\n"));
    csScripts.add (makeScript ("csjs", "javascript", "device", "onSumJs", "*",
        "function onSumJs() { log(\"roland \" + checksum(\"roland\", [1, 2, 3])); }"));
    runtime.loadScripts (juce::var (csScripts));

    host.logs.clear();
    runtime.dispatchEvent ("onSum", "", juce::var());
    check (host.logs.contains ("roland 122"), "checksum(): Lua two's-complement 7-bit");
    check (host.logs.contains ("xor 0"), "checksum(): the type argument selects the algorithm");
    check (host.logs.contains ("short 122"), "checksum(): the one-argument form defaults to roland");

    host.logs.clear();
    runtime.dispatchEvent ("onSumJs", "", juce::var());
    check (host.logs.contains ("roland 122"), "checksum(): JS agrees with Lua");

    // 7) timers reach the host from every engine ---------------------------------------------
    juce::Array<juce::var> timerScripts;
    timerScripts.add (makeScript ("tlua", "lua", "panel", "onArm", "*",
        "function onArm()\n  startTimer(\"blink\", 250)\n  stopTimer(\"blink\")\nend\n"));
    runtime.loadScripts (juce::var (timerScripts));
    host.timerOps.clear();
    runtime.dispatchEvent ("onArm", "panel", juce::var());
    check (host.timerOps.contains ("start:blink:250"), "startTimer() crossed to the host");
    check (host.timerOps.contains ("stop:blink"), "stopTimer() crossed to the host");

    // 8) panel verbs explain themselves rather than erroring ----------------------------------
    // The Zone Splitter and friends live in the panel view. Window-closed, the name must still
    // exist and say why it did nothing — an undefined global would abort the whole handler.
    juce::Array<juce::var> verbScripts;
    verbScripts.add (makeScript ("verblua", "lua", "panel", "onVerb", "*",
        "function onVerb()\n  setlistNext(\"Songs\")\n  log(\"still running\")\nend\n"));
    runtime.loadScripts (juce::var (verbScripts));
    host.logs.clear();
    errors.clear();
    runtime.dispatchEvent ("onVerb", "panel", juce::var());
    check (host.logs.joinIntoString ("\n").contains ("needs the panel window open"),
           "Panel verb: logged an explanation window-closed");
    check (host.logs.contains ("still running"), "Panel verb: the handler continued past the call");
    check (errors.isEmpty(), "Panel verb: no error raised");

    // 9) panic() expands to the CC sequence, in order -----------------------------------------
    juce::Array<juce::var> panicScripts;
    panicScripts.add (makeScript ("panic1", "lua", "device", "onPanic", "*",
        "function onPanic()\n  panic({ channel = 3 })\nend\n"));
    runtime.loadScripts (juce::var (panicScripts));
    host.ccSends.clear();
    runtime.dispatchEvent ("onPanic", "", juce::var());
    check (host.ccSends.size() == 3 && host.ccSends[0] == "3:120:0"
           && host.ccSends[1] == "3:123:0" && host.ccSends[2] == "3:121:0",
           "panic(): all-sound-off, then all-notes-off, then reset-all-controllers");

    // 10) off() — on() with no counterpart meant a listener lived until a full reload ------------
    juce::Array<juce::var> offScripts;
    offScripts.add (makeScript ("offlua", "lua", "panel", "onArmListener", "*",
        "function onArmListener()\n  on(\"*\", \"ping\", function(v) log(\"lua heard \" .. tostring(v)) end)\nend\n"
        "function onDropListener()\n  off(\"*\", \"ping\")\nend\n"));
    offScripts.add (makeScript ("offjs", "javascript", "panel", "onArmJs", "*",
        "function onArmJs() { on(\"*\", \"ping\", function (v) { log(\"js heard \" + v); }); }\n"
        "function onDropJs() { off(\"*\", \"ping\"); }"));
    runtime.loadScripts (juce::var (offScripts));

    runtime.dispatchEvent ("onArmListener", "panel", juce::var());
    runtime.dispatchEvent ("onArmJs", "panel", juce::var());
    host.logs.clear();
    runtime.dispatchEvent ("ping", "panel", juce::var (1));
    check (host.logs.contains ("lua heard 1"), "on(): the Lua listener fired");
    check (host.logs.contains ("js heard 1"), "on(): the JS listener fired");

    // runAction, not dispatchEvent: a script only receives the event it DECLARES, and these two
    // declare the arming event. run() calls a function by name, which is what a real script would
    // do to reach a helper that is not itself a handler.
    runtime.runAction ("onDropListener", juce::var());
    runtime.runAction ("onDropJs", juce::var());
    host.logs.clear();
    runtime.dispatchEvent ("ping", "panel", juce::var (2));
    check (! host.logs.contains ("lua heard 2"), "off(): the Lua listener stopped");
    check (! host.logs.contains ("js heard 2"), "off(): the JS listener stopped");

    // off() must only drop the CALLER's listeners — one script silently unsubscribing another's
    // handlers would be impossible to debug from the script that stopped working.
    juce::Array<juce::var> shareScripts;
    shareScripts.add (makeScript ("keeper", "lua", "panel", "onArmKeeper", "*",
        "function onArmKeeper()\n  on(\"*\", \"shared\", function() log(\"keeper heard\") end)\nend\n"));
    shareScripts.add (makeScript ("dropper", "lua", "panel", "onDropOther", "*",
        "function onDropOther()\n  off(\"*\", \"shared\")\nend\n"));
    runtime.loadScripts (juce::var (shareScripts));
    runtime.dispatchEvent ("onArmKeeper", "panel", juce::var());
    runtime.dispatchEvent ("onDropOther", "panel", juce::var());
    host.logs.clear();
    runtime.dispatchEvent ("shared", "panel", juce::var());
    check (host.logs.contains ("keeper heard"), "off(): only removes the calling script's listeners");

    // 11) the ce.* module namespace ------------------------------------------------------------
    // Generated into each prelude from panelApi.js by tools/scripts/gen-script-modules.mjs. Every
    // member keeps its flat name as an alias, so both spellings must reach the same function.
    juce::Array<juce::var> moduleScripts;
    moduleScripts.add (makeScript ("modlua", "lua", "panel", "onModules", "*",
        "function onModules()\n"
        "  log(\"same \" .. tostring(ce.midi.sendCC == sendCC))\n"
        "  log(\"clamp \" .. tostring(ce.math.clamp(5, 0, 3)))\n"
        "  log(\"sum \" .. tostring(ce.midi.checksum(\"roland\", {1, 2, 3})))\n"
        "  log(\"core \" .. type(ce.core.set))\n"
        "  log(\"verb \" .. type(ce.components.setlist.next))\n"
        "  ce.midi.sendCC(2, 11, 64)\n"
        "end\n"));
    moduleScripts.add (makeScript ("modjs", "javascript", "panel", "onModulesJs", "*",
        "function onModulesJs() {\n"
        "  log('js same ' + (ce.midi.sendCC === sendCC));\n"
        "  log('js clamp ' + ce.math.clamp(5, 0, 3));\n"
        "  ce.midi.sendCC(3, 12, 100);\n"
        "}"));
    runtime.loadScripts (juce::var (moduleScripts));

    host.logs.clear();
    host.ccSends.clear();
    errors.clear();
    runtime.dispatchEvent ("onModules", "panel", juce::var());
    check (host.logs.contains ("same true"), "ce.midi.sendCC is the same function as sendCC (Lua)");
    check (host.logs.contains ("clamp 3"),   "ce.math.clamp works through the namespace");
    check (host.logs.contains ("sum 122"),   "ce.midi.checksum works through the namespace");
    check (host.logs.contains ("core function"), "ce.core mirrors the global verbs");
    check (host.logs.contains ("verb function"), "ce.components.setlist.next is the panel-verb stub");
    check (host.ccSends.contains ("2:11:64"), "a namespaced call reaches the host (Lua)");

    host.logs.clear();
    host.ccSends.clear();
    runtime.dispatchEvent ("onModulesJs", "panel", juce::var());
    check (host.logs.contains ("js same true"), "ce.midi.sendCC is the same function as sendCC (JS)");
    check (host.logs.contains ("js clamp 3"),   "ce.math.clamp works through the namespace (JS)");
    check (host.ccSends.contains ("3:12:100"),  "a namespaced call reaches the host (JS)");
    check (errors.isEmpty(), "the generated namespace block loaded without error");

    // 12) ce.midi channel messages ---------------------------------------------------------------
    // A script could turn a knob but not make a sound until these landed. Assert the exact bytes:
    // a swapped pitch-bend lsb/msb or a wrong status nibble is silent until a synth misbehaves.
    juce::Array<juce::var> noteScripts;
    noteScripts.add (makeScript ("notes", "lua", "panel", "onNotes", "*",
        "function onNotes()\n"
        "  sendNote(1, 60, 100)\n"
        "  sendNote(2, \"C4\", 64)\n"        // a note NAME, not a number (middle C is C4)
        "  sendNoteOff(1, 60)\n"
        "  sendProgramChange(3, 5)\n"
        "  sendPitchBend(1, 8192)\n"
        "  sendPitchBend(1, 0)\n"
        "  sendAftertouch(1, 90)\n"
        "  sendAftertouch(1, 90, 64)\n"
        "  sendClock()\n"
        "  sendTransport(\"stop\")\n"
        "end\n"
        "function onBankChange()\n  sendProgramChange(1, 7, 2, 3)\nend\n"));
    noteScripts.add (makeScript ("notesjs", "javascript", "panel", "onNotesJs", "*",
        "function onNotesJs() { ce.midi.sendNote(1, 60, 100); ce.midi.sendPitchBend(1, 0); }"));
    runtime.loadScripts (juce::var (noteScripts));

    host.rawSends.clear();
    host.ccSends.clear();
    errors.clear();
    runtime.dispatchEvent ("onNotes", "panel", juce::var());
    check (host.rawSends[0] == "90 3C 64", "sendNote: note on, channel 1 (got " + host.rawSends[0] + ")");
    check (host.rawSends[1] == "91 3C 40", "sendNote: a note NAME resolves, channel 2 (got " + host.rawSends[1] + ")");
    check (host.rawSends[2] == "80 3C 00", "sendNoteOff: release velocity defaults to 0");
    check (host.rawSends[3] == "C2 05",    "sendProgramChange: status C2 for channel 3");
    check (host.rawSends[4] == "E0 00 40", "sendPitchBend: centre 8192 is lsb 0, msb 64");
    check (host.rawSends[5] == "E0 00 00", "sendPitchBend: 0 is fully down");
    check (host.rawSends[6] == "D0 5A",    "sendAftertouch: channel pressure");
    check (host.rawSends[7] == "A0 40 5A", "sendAftertouch: poly pressure when a note is given");
    check (host.rawSends[8] == "F8",       "sendClock");
    check (host.rawSends[9] == "FC",       "sendTransport(stop)");

    // Bank select must precede the program change — a device applies the bank in force when the PC
    // lands, so the other order selects from the previous bank.
    host.rawSends.clear();
    host.ccSends.clear();
    runtime.runAction ("onBankChange", juce::var());
    check (host.ccSends.size() == 2 && host.ccSends[0] == "1:0:2" && host.ccSends[1] == "1:32:3",
           "sendProgramChange: bank MSB then LSB, both before the program change");
    check (host.rawSends.size() == 1 && host.rawSends[0] == "C0 07", "…then the program change itself");

    host.rawSends.clear();
    runtime.dispatchEvent ("onNotesJs", "panel", juce::var());
    check (host.rawSends[0] == "90 3C 64", "ce.midi.sendNote assembles the same bytes in JS");
    check (host.rawSends[1] == "E0 00 00", "ce.midi.sendPitchBend agrees across engines");
    check (errors.isEmpty(), "no errors from the message verbs");

    // 13) ce.storage ------------------------------------------------------------------------------
    juce::Array<juce::var> storeScripts;
    storeScripts.add (makeScript ("store", "lua", "panel", "onStore", "*",
        "function onStore()\n"
        "  state.count = (state.count or 0) + 1\n"
        "  log(\"count \" .. tostring(state.count))\n"
        "  saveSetting(\"lastPatch\", 42)\n"
        "  log(\"read \" .. tostring(loadSetting(\"lastPatch\")))\n"
        "  log(\"fallback \" .. tostring(loadSetting(\"never\", \"none\")))\n"
        "end\n"));
    runtime.loadScripts (juce::var (storeScripts));

    host.logs.clear();
    host.settings.clear();
    runtime.dispatchEvent ("onStore", "panel", juce::var());
    check (host.logs.contains ("count 1"), "state starts empty");
    check (host.logs.contains ("read 42"), "saveSetting/loadSetting round-trip through the host");
    check (host.logs.contains ("fallback none"), "loadSetting returns the fallback for an unknown key");

    // state must SURVIVE the next dispatch — that is the whole point of it.
    host.logs.clear();
    runtime.dispatchEvent ("onStore", "panel", juce::var());
    check (host.logs.contains ("count 2"), "state persists between handler calls");

    // …and must NOT survive a reload, or a re-edited script inherits stale state.
    runtime.loadScripts (juce::var (storeScripts));
    host.logs.clear();
    runtime.dispatchEvent ("onStore", "panel", juce::var());
    check (host.logs.contains ("count 1"), "state is cleared when the script reloads");

    // 14) module opt-in (slice 3) -----------------------------------------------------------------
    // A panel declares the modules it uses. Members of a module it did not declare are STUBS that
    // name the module — not missing globals. Both spellings are gated together: the namespaced
    // ce.midi.sendCC and the flat alias sendCC are the same function object either way.
    {
        const char* gateSource =
            "function onGated()\n"
            "  sendCC(1, 74, 100)\n"                       // ce.midi — gated below
            "  ce.midi.sendNote(1, 60, 100)\n"             // same module, namespaced spelling
            "  log(\"clamped \" .. tostring(clamp(5, 0, 3)))\n"   // ce.math — declared, must work
            "  set(\"cutoff\", 10)\n"                      // ce.core — never gated
            "  log(\"has-midi \" .. tostring(ce.has(\"ce.midi\")))\n"
            "  log(\"has-math \" .. tostring(ce.has(\"ce.math\")))\n"
            "  log(\"modules \" .. tostring(#ce.modules))\n"
            "end\n";
        juce::Array<juce::var> gateScripts;
        gateScripts.add (makeScript ("gate", "lua", "panel", "onGated", "*", gateSource));

        // Declared: ce.math only. ce.core comes along because it is never gated.
        runtime.setEnabledModules ({ "ce.math" });
        runtime.loadScripts (juce::var (gateScripts));

        host.logs.clear(); host.ccSends.clear(); host.rawSends.clear();
        runtime.runAction ("onGated", juce::var());

        check (host.ccSends.isEmpty(), "a gated verb does not reach the host");
        check (host.rawSends.isEmpty(), "the namespaced spelling is gated with the flat one");
        const auto joined = host.logs.joinIntoString ("\n");
        check (joined.contains ("sendCC() needs the ce.midi module"),
               "the gated call explains itself and names the module");
        check (joined.contains ("Scripting Modules"), "…and says where to turn it on");
        check (host.logs.contains ("clamped 3"), "a declared module still works");
        check (host.logs.contains ("has-midi false"), "ce.has() reports a module the panel left off");
        check (host.logs.contains ("has-math true"), "ce.has() reports a module the panel declared");
        check (host.logs.contains ("modules 2"), "ce.modules lists only what is enabled (ce.core + ce.math)");

        // Turning the module back on restores the REAL function, not a second stub.
        runtime.setEnabledModules ({ "ce.math", "ce.midi" });
        host.logs.clear(); host.ccSends.clear();
        runtime.runAction ("onGated", juce::var());
        check (host.ccSends.size() == 1 && host.ccSends[0] == "1:74:100",
               "enabling the module restores the real implementation");
        check (host.logs.contains ("has-midi true"), "…and ce.has() agrees");

        // Declaring nothing is NOT declaring none: a panel written before modules existed, or one
        // whose list was never filled in, keeps the whole surface.
        runtime.setEnabledModules ({});
        host.logs.clear(); host.ccSends.clear();
        runtime.runAction ("onGated", juce::var());
        check (host.ccSends.size() == 1, "an empty declaration leaves every module on");

        // The same gate, in the other engine. JS gets one QuickJS engine per script, so this proves
        // the per-script application path rather than Lua's shared-state one.
        juce::Array<juce::var> jsGate;
        jsGate.add (makeScript ("gatejs", "javascript", "panel", "onGatedJs", "*",
            "function onGatedJs(){ sendCC(1, 74, 100); log('has-midi ' + ce.has('ce.midi')); }"));
        runtime.setEnabledModules ({ "ce.math" });
        runtime.loadScripts (juce::var (jsGate));
        host.logs.clear(); host.ccSends.clear();
        runtime.runAction ("onGatedJs", juce::var());
        check (host.ccSends.isEmpty(), "the JS engine gates an undeclared module too");
        check (host.logs.joinIntoString ("\n").contains ("needs the ce.midi module"),
               "…with the same sentence the Lua engine uses");
        check (host.logs.contains ("has-midi false"), "…and the same ce.has() answer");

        runtime.setEnabledModules ({});   // leave the runtime ungated for anything after this
    }

    // modulesFromPanel: the panel document is where the list comes from.
    {
        auto panel = juce::JSON::parse (R"({ "scripting": { "modules": ["ce.midi", "ce.time"] } })");
        const auto ids = ScriptRuntime::modulesFromPanel (panel);
        check (ids.size() == 2 && ids[0] == "ce.midi" && ids[1] == "ce.time",
               "modulesFromPanel reads scripting.modules");
        check (ScriptRuntime::modulesFromPanel (juce::JSON::parse (R"({ "scripting": {} })")).isEmpty(),
               "a panel with no module list reads as ungated, not as none");
        check (ScriptRuntime::modulesFromPanel (juce::var()).isEmpty(),
               "so does a panel that isn't an object at all");
    }

    std::cout << "------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
