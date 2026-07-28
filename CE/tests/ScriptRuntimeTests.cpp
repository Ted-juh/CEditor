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

    // A stand-in device profile, so ce.device's reads have something real to read. `deviceHost`
    // off means "no device host attached", which is what the requiresDeviceHost members have to
    // report rather than quietly answering "this synth has nothing".
    bool deviceHost = true;
    juce::StringArray deviceQueries;
    juce::var deviceQuery (const juce::String& kind, const juce::var& payload) override
    {
        auto* p = payload.getDynamicObject();
        const auto role = p != nullptr ? p->getProperty ("role").toString() : juce::String();
        deviceQueries.add (kind + ":" + role);
        if (! deviceHost) return {};

        if (kind == "connected") return juce::var (role == "mainSynth");
        if (kind == "profile")
        {
            if (role != "mainSynth") return {};
            auto* o = new juce::DynamicObject();
            o->setProperty ("id", "test-cc-synth");
            o->setProperty ("name", "Test CC Synth");
            o->setProperty ("role", role);
            o->setProperty ("connected", true);
            return juce::var (o);
        }
        if (kind == "parameters" || kind == "parameter")
        {
            auto make = [] (const char* id, const char* name, const char* group, int max)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("id", id); o->setProperty ("name", name);
                o->setProperty ("group", group); o->setProperty ("type", "continuous");
                o->setProperty ("min", 0); o->setProperty ("max", max);
                return juce::var (o);
            };
            juce::Array<juce::var> all;
            all.add (make ("cutoff", "Filter Cutoff", "Filter", 127));
            all.add (make ("resonance", "Filter Resonance", "Filter", 127));
            all.add (make ("attack", "Amp Attack", "Envelope", 100));

            if (kind == "parameters")
            {
                const auto group = p != nullptr ? p->getProperty ("group").toString() : juce::String();
                if (group.isEmpty()) return juce::var (all);
                juce::Array<juce::var> hit;
                for (const auto& v : all)
                    if (v.getDynamicObject()->getProperty ("group").toString() == group) hit.add (v);
                return juce::var (hit);
            }
            const auto wanted = p != nullptr ? p->getProperty ("id").toString() : juce::String();
            for (const auto& v : all)
                if (v.getDynamicObject()->getProperty ("id").toString() == wanted) return v;
            return {};
        }
        return {};
    }
    // Delegated to the runtime, the way BridgeScriptHost does when the app supplies no callback:
    // run() resolves against the loaded script set, which is what makes it work cross-language.
    juce::var runAction (const juce::String& ref, const juce::var& args) override
    { return runtime != nullptr ? runtime->runAction (ref, args) : juce::var(); }
    void emitEvent (const juce::String& name, const juce::var& data) override
    { if (runtime != nullptr) runtime->dispatchEvent (name, "panel", data); }
    void log (const juce::String& message, const juce::var&) override { logs.add (message); }

    // A stand-in transport, so ce.time's reads have something real to read. All of them go through
    // this one snapshot, which is the point: tempo(), isPlaying() and transportInfo() cannot
    // disagree with each other because there is only one thing to disagree about.
    bool  transportValid = true;
    bool  transportPlaying = true;
    double transportBpm = 120.0;
    double transportBeats = 0.0;
    int   transportBeatsPerBar = 4;
    juce::var transportState() override
    {
        if (! transportValid) return {};
        auto* o = new juce::DynamicObject();
        o->setProperty ("valid", true);
        o->setProperty ("playing", transportPlaying);
        if (transportBpm > 0.0) o->setProperty ("bpm", transportBpm);
        o->setProperty ("beats", transportBeats);
        o->setProperty ("beatsPerBar", transportBeatsPerBar);
        o->setProperty ("source", "host");
        return juce::var (o);
    }

    // ce.anim routes to the runtime, the way BridgeScriptHost does — the animation list has to
    // live in ONE place, so a host forwards rather than keeping its own.
    void startAnimation (const juce::String& kind, const juce::String& path,
                         double target, const juce::var& opts) override
    { if (runtime != nullptr) runtime->startAnimation (kind, path, target, opts); }
    void stopAnimation (const juce::String& path) override
    { if (runtime != nullptr) runtime->stopAnimation (path); }
    bool animationRunning (const juce::String& path) override
    { return runtime != nullptr && runtime->animationRunning (path); }

    juce::StringArray uiMessages;
    void uiNotify (const juce::String& m, const juce::var&) override { uiMessages.add ("notify:" + m); }
    void uiStatus (const juce::String& m) override { uiMessages.add ("status:" + m); }

    juce::StringArray timerOps;
    // The ids alone, too: after() generates its own and a test needs to read it back rather than
    // reconstruct the "start:<id>:<ms>" string it was recorded in.
    juce::StringArray timerStarts, timerStops;
    void startTimer (const juce::String& id, int ms) override
    { timerOps.add ("start:" + id + ":" + juce::String (ms)); timerStarts.add (id); }
    void stopTimer (const juce::String& id) override { timerOps.add ("stop:" + id); timerStops.add (id); }
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

    // 15) third-party modules — ce.ext.* (design doc §8) ------------------------------------------
    // A module installs into the app and the exporter bakes a copy into the panel, so the shipped
    // plugin needs no install to read from. Here it arrives the way it arrives in the player: as
    // `scripting.extensions` on the panel document, handed to setExtensionModules.
    {
        auto ext = juce::JSON::parse (R"JSON([{
          "id": "ce.ext.roland_sysex",
          "version": "1.0",
          "runtime": "any",
          "requires": ["ce.core", "ce.midi"],
          "summary": "Roland address/checksum helpers.",
          "members": [
            { "id": "rolandAddress", "name": "address", "signature": "rolandAddress(a,b,c,d)" },
            { "id": "rolandPack",    "name": "pack",    "signature": "rolandPack(addr, data)" }
          ],
          "prelude": {
            "lua": "function rolandAddress(a,b,c,d) return {a,b,c,d} end\nfunction rolandPack(addr, data)\n  local body = {}\n  for i=1,#addr do body[#body+1] = addr[i] end\n  for i=1,#data do body[#body+1] = data[i] end\n  body[#body+1] = checksum(\"roland\", body)\n  return body\nend\n",
            "javascript": "function rolandAddress(a,b,c,d){ return [a,b,c,d]; }\nfunction rolandPack(addr, data){ var body = addr.concat(data); body.push(checksum('roland', body)); return body; }\n"
          }
        }])JSON");

        juce::Array<juce::var> extScripts;
        extScripts.add (makeScript ("ext", "lua", "panel", "onExt", "*",
            "function onExt()\n"
            "  local a = ce.ext.roland_sysex.address(0x19, 0x01, 0x00, 0x00)\n"
            "  log(\"addr \" .. tostring(#a) .. \" \" .. tostring(a[1]))\n"
            "  local body = rolandPack(a, {0x40})\n"
            "  log(\"packed \" .. tostring(#body) .. \" sum \" .. tostring(body[#body]))\n"
            "  log(\"has \" .. tostring(ce.has(\"ce.ext.roland_sysex\")))\n"
            "end\n"));

        runtime.setExtensionModules (ext);
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (extScripts));

        host.logs.clear();
        runtime.runAction ("onExt", juce::var());
        check (host.logs.contains ("addr 4 25"), "an installed module's members answer at ce.ext.<id>.<name>");
        // 0x19+0x01+0x00+0x00+0x40 = 0x5A; the Roland checksum is (128 - 90) % 128 = 38.
        check (host.logs.contains ("packed 6 sum 38"),
               "…and the flat spelling works too, and it can call a built-in (checksum) from ce.midi");
        check (host.logs.contains ("has true"), "ce.has() reports an installed module");

        // The gate applies to a third-party module exactly as it does to a built-in one.
        runtime.setEnabledModules ({ "ce.midi" });
        host.logs.clear();
        runtime.runAction ("onExt", juce::var());
        check (host.logs.joinIntoString ("\n").contains ("needs the ce.ext.roland_sysex module"),
               "a module the panel did not enable is gated like any other");

        runtime.setEnabledModules ({ "ce.midi", "ce.ext.roland_sysex" });
        host.logs.clear();
        runtime.runAction ("onExt", juce::var());
        check (host.logs.contains ("packed 6 sum 38"), "enabling it restores the real implementation");

        // The same module, in the other engine. Its JS prelude is separate source, so this is what
        // proves a module really is cross-runtime rather than Lua-shaped.
        juce::Array<juce::var> jsExt;
        jsExt.add (makeScript ("extjs", "javascript", "panel", "onExtJs", "*",
            "function onExtJs(){ var b = ce.ext.roland_sysex.pack([0x19,1,0,0],[0x40]); "
            "log('js ' + b.length + ' sum ' + b[b.length-1]); }"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (jsExt));
        host.logs.clear();
        runtime.runAction ("onExtJs", juce::var());
        check (host.logs.contains ("js 6 sum 38"), "the same module computes the same bytes in JS");

        // A module that ships no Python is SKIPPED there, not an error — and the engines that do
        // carry it are unaffected. (Python is not built into this test binary; the equivalent for
        // an engine with no source is asserted by the skip path being taken for it above.)
        auto luaOnly = juce::JSON::parse (R"JSON([{
          "id": "ce.ext.lua_only", "version": "1.0", "runtime": "any",
          "members": [ { "id": "luaOnlyThing", "name": "thing" } ],
          "prelude": { "lua": "function luaOnlyThing() return 7 end\n" }
        }])JSON");
        runtime.setExtensionModules (luaOnly);
        juce::Array<juce::var> mixed;
        mixed.add (makeScript ("m1", "lua", "panel", "onLua", "*",
            "function onLua() log(\"lua \" .. tostring(ce.ext.lua_only.thing())) end\n"));
        mixed.add (makeScript ("m2", "javascript", "panel", "onJs", "*",
            "function onJs(){ log('js ' + (typeof ce.ext === 'undefined' || !ce.ext.lua_only ? 'absent' : 'present')); }"));
        runtime.loadScripts (juce::var (mixed));
        host.logs.clear();
        runtime.runAction ("onLua", juce::var());
        runtime.runAction ("onJs", juce::var());
        check (host.logs.contains ("lua 7"), "a module runs in the language it ships");
        check (host.logs.contains ("js absent"), "…and is honestly absent from the one it does not");

        // A broken module is skipped, and does not take the rest of the prelude down with it.
        auto broken = juce::JSON::parse (R"JSON([{
          "id": "ce.ext.broken", "version": "1.0", "runtime": "any",
          "members": [ { "id": "brokenThing", "name": "thing" } ],
          "prelude": { "lua": "function brokenThing( -- unclosed\n" }
        }])JSON");
        runtime.setExtensionModules (broken);
        juce::Array<juce::var> after;
        after.add (makeScript ("a1", "lua", "panel", "onAfter", "*",
            "function onAfter() log(\"still \" .. tostring(clamp(9, 0, 3))) end\n"));
        runtime.loadScripts (juce::var (after));
        host.logs.clear();
        runtime.runAction ("onAfter", juce::var());
        check (host.logs.contains ("still 3"), "a module that will not parse is skipped, not fatal");

        runtime.setExtensionModules (juce::var());   // leave the runtime clean for anything after
    }

    // The SHIPPED reference module, loaded from the actual .cemodule file rather than a copy
    // pasted in here. CE/web/test/extensionModules.test.js runs the same file through the WebView
    // runtime and asserts the same bytes, so one artifact is checked in three of the four runtimes.
    // (__FILE__ resolves the repo layout without needing a build-system define.)
    {
        const auto moduleFile = juce::File (__FILE__).getParentDirectory()   // CE/tests
                                    .getParentDirectory()                     // CE
                                    .getChildFile ("profiles").getChildFile ("modules")
                                    .getChildFile ("ce.ext.roland_sysex.cemodule");
        if (! moduleFile.existsAsFile())
        {
            check (false, "the reference module is where the docs say it is ("
                          + moduleFile.getFullPathName() + ")");
        }
        else
        {
            juce::Array<juce::var> one;
            one.add (juce::JSON::parse (moduleFile.loadFileAsString()));
            runtime.setExtensionModules (juce::var (one));
            runtime.setEnabledModules ({});

            juce::Array<juce::var> refScripts;
            refScripts.add (makeScript ("ref", "lua", "panel", "onRef", "*",
                "function onRef()\n"
                "  local a = ce.ext.roland_sysex.address(0x19, 0x01, 0x00, 0x00)\n"
                "  local body = ce.ext.roland_sysex.pack(a, {0x40})\n"
                "  log(\"lua \" .. table.concat(body, \",\"))\n"
                "  local back = ce.ext.roland_sysex.unpack(body)\n"
                "  log(\"valid \" .. tostring(back.valid) .. \" data \" .. tostring(back.data[1]))\n"
                "end\n"));
            refScripts.add (makeScript ("refjs", "javascript", "panel", "onRefJs", "*",
                "function onRefJs(){ var b = ce.ext.roland_sysex.pack("
                "ce.ext.roland_sysex.address(0x19,1,0,0), [0x40]); log('js ' + b.join(',')); }"));
            runtime.loadScripts (juce::var (refScripts));

            host.logs.clear();
            runtime.runAction ("onRef", juce::var());
            runtime.runAction ("onRefJs", juce::var());
            // 0x19 + 0x01 + 0x40 = 90; the Roland checksum is (128 - 90) % 128 = 38.
            check (host.logs.contains ("lua 25,1,0,0,64,38"),
                   "the shipped ce.ext.roland_sysex packs the documented bytes in Lua");
            check (host.logs.contains ("js 25,1,0,0,64,38"),
                   "…and the identical bytes in JavaScript, from the same file");
            check (host.logs.contains ("valid true data 64"), "…and reads its own message back");

            runtime.setExtensionModules (juce::var());
        }
    }

    // 16) ce.device reads (design doc §6 phase 2) -------------------------------------------------
    // Four verbs over ONE host primitive, so the shape a script sees is assembled in the prelude
    // and no engine can invent a different parameter descriptor.
    {
        juce::Array<juce::var> devScripts;
        devScripts.add (makeScript ("dev", "lua", "panel", "onDev", "*",
            "function onDev()\n"
            "  local p = ce.device.profile()\n"
            "  log(\"profile \" .. tostring(p and p.name))\n"
            "  log(\"connected \" .. tostring(ce.device.connected()))\n"
            "  log(\"other \" .. tostring(ce.device.connected(\"aux\")))\n"
            "  local all = ce.device.parameters() or {}\n"
            "  log(\"count \" .. tostring(#all) .. \" first \" .. tostring(all[1] and all[1].id))\n"
            "  local filt = ce.device.parameters({ group = \"Filter\" }) or {}\n"
            "  log(\"filter \" .. tostring(#filt))\n"
            "  local one = ce.device.parameter(\"resonance\")\n"
            "  log(\"one \" .. tostring(one and one.name) .. \" max \" .. tostring(one and one.max))\n"
            "  log(\"absent \" .. tostring(ce.device.parameter(\"nope\") == nil))\n"
            "end\n"));
        devScripts.add (makeScript ("devjs", "javascript", "panel", "onDevJs", "*",
            "function onDevJs(){\n"
            "  var p = ce.device.profile();\n"
            "  log('js profile ' + (p ? p.name : 'nil'));\n"
            "  log('js count ' + ce.device.parameters().length);\n"
            "  log('js one ' + ce.device.parameter('cutoff').name);\n"
            "  log('js absent ' + (ce.device.parameter('nope') === null || ce.device.parameter('nope') === undefined));\n"
            "  log('js connected ' + ce.device.connected());\n"
            "}"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (devScripts));

        host.logs.clear(); host.deviceQueries.clear();
        runtime.runAction ("onDev", juce::var());
        check (host.logs.contains ("profile Test CC Synth"), "ce.device.profile() reads the mapped profile");
        check (host.logs.contains ("connected true"), "ce.device.connected() answers for the default role");
        check (host.logs.contains ("other false"), "…and for a role that is not ready");
        check (host.logs.contains ("count 3 first cutoff"), "ce.device.parameters() returns the descriptors");
        check (host.logs.contains ("filter 2"), "…and narrows by group");
        check (host.logs.contains ("one Filter Resonance max 127"), "ce.device.parameter() finds one by id");
        check (host.logs.contains ("absent true"), "…and returns nil for one the profile does not have");
        check (host.deviceQueries.contains ("profile:mainSynth"),
               "the role defaults to mainSynth rather than being left empty");

        host.logs.clear();
        runtime.runAction ("onDevJs", juce::var());
        check (host.logs.contains ("js profile Test CC Synth"), "the same reads in JavaScript");
        check (host.logs.contains ("js count 3"), "…returning the same descriptors");
        check (host.logs.contains ("js one Filter Cutoff"), "…and the same lookup");
        check (host.logs.contains ("js absent true"), "…and the same nil for an unknown id");
        check (host.logs.contains ("js connected true"), "…and the same connection answer");

        // No device host: the reads must degrade to nil / empty, NOT to a plausible-looking lie.
        host.deviceHost = false;
        host.logs.clear();
        runtime.runAction ("onDev", juce::var());
        check (host.logs.contains ("profile nil"), "with no device host, profile() is nil");
        check (host.logs.contains ("connected false"), "…connected() is false");
        check (host.logs.contains ("count 0 first nil"),
               "…and parameters() is an EMPTY LIST, so iterating it is still safe");
        host.deviceHost = true;

        // And they are gated like any other ce.device member. A gated call returns nil — the
        // module is off, so there is no answer to give, and the notice says which module to turn
        // on. (That is why the documented "returns an empty list" holds only while it is enabled.)
        juce::Array<juce::var> gatedDev;
        gatedDev.add (makeScript ("devgate", "lua", "panel", "onDevGate", "*",
            "function onDevGate()\n"
            "  log(\"gated \" .. tostring(ce.device.profile()))\n"
            "end\n"));
        runtime.setEnabledModules ({ "ce.midi" });
        runtime.loadScripts (juce::var (gatedDev));
        host.logs.clear();
        runtime.runAction ("onDevGate", juce::var());
        check (host.logs.contains ("gated nil"),
               "a gated read yields nil rather than no value at all — tostring() of it must not throw");
        check (host.logs.joinIntoString ("\n").contains ("deviceProfile() needs the ce.device module"),
               "…and says which module to enable");
        runtime.setEnabledModules ({});
    }

    // 17) ce.time (design doc §6 phase 3) ---------------------------------------------------------
    // Reads plus pure arithmetic on top of one transport snapshot. The conversions are the point:
    // beatsToMs is the delay-time calculation a synth panel needs most, and it has to give the same
    // number in every runtime or a panel exported from the editor drifts.
    {
        juce::Array<juce::var> timeScripts;
        timeScripts.add (makeScript ("time", "lua", "panel", "onTime", "*",
            "function onTime()\n"
            "  log(\"bpm \" .. tostring(tempo()))\n"
            "  log(\"playing \" .. tostring(isPlaying()))\n"
            "  local t = ce.time.transport()\n"
            "  log(\"bar \" .. tostring(t.bar) .. \" beat \" .. tostring(t.beat) .. \" of \" .. tostring(t.beatsPerBar))\n"
            "  log(\"valid \" .. tostring(t.valid) .. \" src \" .. tostring(t.source))\n"
            "  local function fmt(v) if v == nil then return \"nil\" end return string.format(\"%.3f\", v) end\n"
            "  log(\"dotted \" .. fmt(beatsToMs(0.75)))\n"
            "  log(\"back \" .. fmt(msToBeats(375)))\n"
            "  log(\"at90 \" .. fmt(beatsToMs(1, 90)))\n"
            "  ce.time.syncTimer(\"step\", 0.25)\n"
            "end\n"));
        timeScripts.add (makeScript ("timejs", "javascript", "panel", "onTimeJs", "*",
            "function onTimeJs(){\n"
            "  var t = ce.time.transport();\n"
            "  log('js bar ' + t.bar + ' beat ' + t.beat);\n"
            "  log('js dotted ' + beatsToMs(0.75).toFixed(3));\n"
            "  log('js bpm ' + tempo() + ' playing ' + isPlaying());\n"
            "}"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (timeScripts));

        // 120bpm, 4/4, sitting on beat 3 of bar 2 (beats counts quarter notes from the origin).
        host.transportBeats = 6.0;
        host.logs.clear(); host.timerOps.clear();
        runtime.runAction ("onTime", juce::var());
        check (host.logs.contains ("bpm 120"), "tempo() reads the reported BPM");
        check (host.logs.contains ("playing true"), "isPlaying() reads the transport");
        check (host.logs.contains ("bar 2 beat 3 of 4"),
               "transport() derives a 1-based bar and beat from the beat position");
        check (host.logs.contains ("valid true src host"), "…and reports where the position came from");
        // A dotted eighth at 120bpm is 0.75 * 500ms = 375ms. This is THE number a delay-time
        // control needs, and it has to be identical in every runtime.
        check (host.logs.contains ("dotted 375.000"), "beatsToMs: a dotted eighth at 120bpm is 375ms");
        check (host.logs.contains ("back 0.750"), "msToBeats is its exact inverse");
        check (host.logs.contains ("at90 666.667"), "…and an explicit bpm overrides the reported one");
        check (host.timerOps.contains ("start:step:125"),
               "syncTimer arms a real timer with the musical interval (a sixteenth at 120bpm = 125ms)");

        host.logs.clear();
        runtime.runAction ("onTimeJs", juce::var());
        check (host.logs.contains ("js bar 2 beat 3"), "the same derivation in JavaScript");
        check (host.logs.contains ("js dotted 375.000"),
               "…and the same delay time, to the millisecond (formatted identically on purpose: "
               "Lua renders a float as 375.0 and JS as 375, and it is the VALUE that has to agree)");
        check (host.logs.contains ("js bpm 120 playing true"), "…and the same reads");

        // NOTHING REPORTING A TRANSPORT. The panel must not be handed an invented 120bpm: tempo()
        // is nil, the conversions are nil, and syncTimer says why it did not arm.
        host.transportValid = false;
        host.logs.clear(); host.timerOps.clear();
        runtime.runAction ("onTime", juce::var());
        check (host.logs.contains ("bpm nil"), "with no transport, tempo() is nil rather than a guess");
        check (host.logs.contains ("playing false"), "…isPlaying() is false");
        check (host.logs.contains ("valid false src none"), "…and transport() says the position is not a measurement");
        check (host.logs.contains ("dotted nil"), "…the conversions are nil, not a number computed from nothing");
        check (host.timerOps.isEmpty(), "…and syncTimer arms nothing");
        check (host.logs.joinIntoString ("\n").contains ("no tempo is being reported"),
               "…having said so");
        host.transportValid = true;

        // A stopped transport still has a tempo and a position — stopped is not unknown.
        host.transportPlaying = false;
        host.logs.clear();
        runtime.runAction ("onTime", juce::var());
        check (host.logs.contains ("playing false") && host.logs.contains ("bpm 120"),
               "a stopped transport still reports its tempo");
        host.transportPlaying = true;

        // The time events are declared and dispatchable — the runtime routes them like any other.
        // One script per event: dispatchEvent routes by the script's DECLARED event, so a single
        // script declaring onBeat would never receive onBar however many functions it defines.
        juce::Array<juce::var> beatScripts;
        beatScripts.add (makeScript ("beat", "lua", "panel", "onBeat", "*",
            "function onBeat(t) log(\"beat \" .. tostring(t.bar) .. \":\" .. tostring(t.beat)) end\n"));
        beatScripts.add (makeScript ("bar", "lua", "panel", "onBar", "*",
            "function onBar(t) log(\"bar \" .. tostring(t.bar)) end\n"));
        beatScripts.add (makeScript ("tr", "lua", "panel", "onTransport", "*",
            "function onTransport(t) log(\"transport \" .. tostring(t.playing)) end\n"));
        runtime.loadScripts (juce::var (beatScripts));
        host.logs.clear();
        {
            // ONE var, reused. juce::DynamicObject is reference-counted and starts at zero, so each
            // temporary juce::var(o) would take the last reference with it and free the object —
            // the second dispatch would then read freed memory.
            auto* o = new juce::DynamicObject();
            o->setProperty ("bar", 3); o->setProperty ("beat", 1); o->setProperty ("playing", true);
            const juce::var payload (o);
            runtime.dispatchEvent ("onBeat", "panel", payload);
            runtime.dispatchEvent ("onBar", "panel", payload);
            runtime.dispatchEvent ("onTransport", "panel", payload);
        }
        check (host.logs.contains ("beat 3:1"), "onBeat reaches a handler that declares it");
        check (host.logs.contains ("bar 3"), "onBar too");
        check (host.logs.contains ("transport true"), "and onTransport");
    }

    // 18) ce.panel structure (design doc §6 phase 4) ----------------------------------------------
    // Panel view only, and not by choice: creating a control needs a renderer. Window-closed the
    // verbs must EXPLAIN that rather than being undefined globals, and onPanelBuild must never
    // fire here at all — a build phase that half-ran with no renderer is worse than one that
    // did not run.
    {
        juce::Array<juce::var> structScripts;
        structScripts.add (makeScript ("struct", "lua", "panel", "onStruct", "*",
            "function onStruct()\n"
            "  ce.panel.create(\"Knob\", { name = \"osc1\" })\n"
            "  log(\"created \" .. tostring(ce.panel.create(\"Knob\", { name = \"osc2\" })))\n"
            "  log(\"found \" .. tostring(ce.panel.find()))\n"
            "end\n"));
        structScripts.add (makeScript ("build", "lua", "panel", "onPanelBuild", "*",
            "function onPanelBuild() log(\"BUILD RAN\") end\n"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (structScripts));

        host.logs.clear();
        runtime.runAction ("onStruct", juce::var());
        const auto said = host.logs.joinIntoString ("\n");
        check (said.contains ("panel window open"),
               "a structure verb window-closed says it needs the panel view");
        check (said.contains ("created nil"),
               "…and returns nil, so a script that checks the result sees the truth");

        // onPanelBuild is declared webview-only, so the window-closed runtime must not have it in
        // its handler list at all — not fire-and-do-nothing, never fire.
        host.logs.clear();
        runtime.onPanelLoad();
        runtime.onPanelReady (true);
        check (! host.logs.contains ("BUILD RAN"),
               "onPanelBuild never fires window-closed — the lifecycle there has no build phase");
    }

    // 19) ce.draw (design doc §6 phase 5) ---------------------------------------------------------
    // Drawing needs a surface, and there is none with the window shut. Window-closed the verbs must
    // EXPLAIN that rather than being undefined globals, and onDraw must never fire here at all.
    {
        juce::Array<juce::var> drawScripts;
        drawScripts.add (makeScript ("draw", "lua", "component", "onDrawTest", "screen",
            "function onDrawTest()\n"
            "  ce.draw.clear()\n"
            "  ce.draw.stroke(\"#5B9BD5\", 2)\n"
            "  log(\"line \" .. tostring(ce.draw.line(0, 0, 100, 0)))\n"
            "end\n"));
        drawScripts.add (makeScript ("ondraw", "lua", "component", "onDraw", "screen",
            "function onDraw(info) log(\"DRAW RAN\") end\n"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (drawScripts));

        host.logs.clear();
        runtime.runAction ("onDrawTest", juce::var());
        const auto drew = host.logs.joinIntoString ("\n");
        check (drew.contains ("panel window open"),
               "a draw verb window-closed says it needs the panel view");
        check (host.logs.contains ("line nil"),
               "…and returns nil, so a script that checks the result sees the truth");

        // onDraw never fires window-closed. That guarantee is "no runtime RAISES it" — the
        // lifecycle does not, and no event source does — rather than "the dispatcher refuses it":
        // ScriptRuntime::dispatchEvent routes purely by a script's declared event and knows
        // nothing about which hooks are webview-only. So the thing to assert is that running the
        // whole window-closed lifecycle leaves the handler untouched.
        host.logs.clear();
        runtime.onPanelLoad();
        runtime.onPanelReady (true);
        runtime.onPanelClose();
        check (! host.logs.contains ("DRAW RAN"),
               "the window-closed lifecycle never raises onDraw — there is no surface to paint on");
    }

    // 20) ce.anim + ce.ui (design doc §6 phase 6) --------------------------------------------------
    // ce.anim is CROSS-RUNTIME: a sweep triggered by a note has to work with the panel shut. The
    // WebView runs the same two formulas, and the fixture below is the one both are pinned to —
    // CE/web/test/scriptAnim.test.js asserts these exact numbers.
    {
        // The formulas first, directly. If these drift from the JS pair, every animation drifts.
        check (std::abs (ScriptRuntime::animationEase (0.5, "linear") - 0.5) < 1e-9, "ease linear(0.5) = 0.5");
        check (std::abs (ScriptRuntime::animationEase (0.5, "exp") - 0.25) < 1e-9, "ease exp(0.5) = 0.25");
        check (std::abs (ScriptRuntime::animationEase (0.25, "log") - 0.5) < 1e-9, "ease log(0.25) = 0.5");
        check (std::abs (ScriptRuntime::animationEase (0.5, "s") - 0.5) < 1e-9, "ease s(0.5) = 0.5");
        check (std::abs (ScriptRuntime::animationEase (2.0, "linear") - 1.0) < 1e-9, "progress is clamped past the end");
        check (std::abs (ScriptRuntime::animationSpring (1.0, 6.0, 12.0) - 1.0) < 1e-12,
               "a spring lands EXACTLY on its target, never near it");

        juce::Array<juce::var> animScripts;
        animScripts.add (makeScript ("anim", "lua", "panel", "onSweep", "*",
            "function onSweep()\n"
            "  ce.anim.to(\"cutoff\", 100, { duration = 1000, curve = \"linear\", from = 0 })\n"
            "  log(\"running \" .. tostring(ce.anim.running(\"cutoff\")))\n"
            "  log(\"other \" .. tostring(ce.anim.running(\"resonance\")))\n"
            "end\n"
            "function onCancel() ce.anim.stop(\"cutoff\") end\n"));
        runtime.setEnabledModules ({});
        runtime.loadScripts (juce::var (animScripts));

        host.logs.clear();
        runtime.tickAnimations (0.0);          // establish the clock before anything starts
        runtime.runAction ("onSweep", juce::var());
        check (host.logs.contains ("running true"), "ce.anim.running() sees the animation it just started");
        check (host.logs.contains ("other false"), "…and only that one");

        // A linear 0 -> 100 over 1000ms. These are the numbers the WebView is pinned to as well.
        runtime.tickAnimations (250.0);
        check (std::abs ((double) host.values["cutoff"] - 25.0) < 1e-9, "linear ramp: 25% in, value is 25");
        runtime.tickAnimations (500.0);
        check (std::abs ((double) host.values["cutoff"] - 50.0) < 1e-9, "…50% in, value is 50");
        runtime.tickAnimations (1000.0);
        check (std::abs ((double) host.values["cutoff"] - 100.0) < 1e-9, "…and it ends exactly on the target");
        check (! runtime.animationRunning ("cutoff"), "a finished animation stops running");

        // Starting a second animation on the same path REPLACES the first — a value has one
        // destination, and two writers on one path is a fight nobody wins.
        runtime.tickAnimations (2000.0);
        runtime.startAnimation ("to", "cutoff", 0.0, juce::var());
        runtime.startAnimation ("to", "cutoff", 50.0, juce::var());
        runtime.tickAnimations (2000.0 + 300.0);   // 300ms is the default duration
        check (std::abs ((double) host.values["cutoff"] - 50.0) < 1e-9,
               "the second animation replaced the first rather than fighting it");

        // stop() leaves the value where it got to — it does not snap to the target or revert.
        runtime.tickAnimations (3000.0);
        host.values["cutoff"] = juce::var (0.0);
        runtime.startAnimation ("to", "cutoff", 100.0, juce::JSON::parse (R"JSON({"duration":1000,"from":0})JSON"));
        runtime.tickAnimations (3400.0);
        const double atStop = (double) host.values["cutoff"];
        runtime.runAction ("onCancel", juce::var());
        runtime.tickAnimations (3900.0);
        check (std::abs ((double) host.values["cutoff"] - atStop) < 1e-9,
               "stop() leaves the value where it got to");
        check (! runtime.animationRunning(), "…and nothing is running afterwards");

        // ce.ui is webview-only: window-closed the verbs must explain themselves.
        juce::Array<juce::var> uiScripts;
        uiScripts.add (makeScript ("ui", "lua", "panel", "onSay", "*",
            "function onSay() ce.ui.notify(\"hello\") ce.ui.status(\"busy\") end\n"));
        runtime.loadScripts (juce::var (uiScripts));
        host.logs.clear(); host.uiMessages.clear();
        runtime.runAction ("onSay", juce::var());
        check (host.uiMessages.isEmpty(), "ce.ui does nothing window-closed…");
        check (host.logs.joinIntoString ("\n").contains ("panel window open"),
               "…and says why rather than being an undefined global");
    }

    // 21) onError (design doc §6 phase 4) ---------------------------------------------------------
    // A panel reporting its own failures. Two rules that the tests below pin, because both are easy
    // to lose in a refactor: the LOG always happens (onError is in addition, never instead), and an
    // error raised inside onError is logged once and NOT re-dispatched.
    {
        juce::Array<juce::var> errScripts;
        errScripts.add (makeScript ("boom", "lua", "panel", "onBoom", "*",
            "function onBoom() error(\"kaboom\") end\n"));
        errScripts.add (makeScript ("watch", "lua", "panel", "onError", "*",
            "function onError(info)\n"
            "  log(\"CAUGHT \" .. info.script .. \"|\" .. info.scriptId .. \"|\" .. info.phase\n"
            "      .. \"|\" .. info.event .. \"|\" .. tostring(string.find(info.message, \"kaboom\") ~= nil))\n"
            "end\n"));
        runtime.loadScripts (juce::var (errScripts));

        host.logs.clear(); errors.clear();
        runtime.runAction ("onBoom", juce::var());
        const auto caught = host.logs.joinIntoString ("\n");
        check (caught.contains ("CAUGHT "), "onError reached a handler that declares it");
        check (caught.contains ("|boom|dispatch|"),
               "…carrying the failing script's id and the phase it failed in");
        check (caught.contains ("|onBoom|true"),
               "…the event it was raised from, and the message that was logged");
        check (errors.joinIntoString ("\n").contains ("kaboom"),
               "the error is STILL logged — onError is in addition to the log, never instead of it");

        // The re-entry guard. A reporter that throws is logged once and never re-dispatched: were
        // it re-dispatched, the second failure would call the same broken reporter, and so on.
        juce::Array<juce::var> loopScripts;
        loopScripts.add (makeScript ("boom", "lua", "panel", "onBoom", "*",
            "function onBoom() error(\"kaboom\") end\n"));
        loopScripts.add (makeScript ("bad", "lua", "panel", "onError", "*",
            "function onError(info) log(\"REPORTING\") error(\"reporter is broken\") end\n"));
        runtime.loadScripts (juce::var (loopScripts));

        host.logs.clear(); errors.clear();
        runtime.runAction ("onBoom", juce::var());
        int reported = 0;
        for (const auto& l : host.logs) if (l.contains ("REPORTING")) ++reported;
        check (reported == 1, "a broken onError runs ONCE — it is not re-entered by its own failure");
        check (errors.joinIntoString ("\n").contains ("(in onError)"),
               "…and its failure is logged, marked as having come from the reporter");

        // Load-time errors are DEFERRED. The script that fails to compile is listed first on
        // purpose: dispatched eagerly, it would be reported to an onError that does not exist yet.
        juce::Array<juce::var> loadScripts;
        loadScripts.add (makeScript ("brokenload", "lua", "panel", "onNever", "*",
            "function ( -- unclosed\n"));
        loadScripts.add (makeScript ("watch", "lua", "panel", "onError", "*",
            "function onError(info) log(\"LOADFAIL \" .. info.scriptId .. \"|\" .. info.phase) end\n"));
        host.logs.clear();
        runtime.loadScripts (juce::var (loadScripts));
        check (host.logs.joinIntoString ("\n").contains ("LOADFAIL brokenload|load"),
               "a load failure is held until every script is loaded, then reported with phase 'load'");

        // No onError anywhere is not an error: the log is the whole contract in that case.
        juce::Array<juce::var> quiet;
        quiet.add (makeScript ("boom", "lua", "panel", "onBoom", "*",
            "function onBoom() error(\"kaboom\") end\n"));
        runtime.loadScripts (juce::var (quiet));
        host.logs.clear(); errors.clear();
        runtime.runAction ("onBoom", juce::var());
        check (errors.joinIntoString ("\n").contains ("kaboom"),
               "with no onError declared anywhere, the failure is still logged");

        // The hook is not Lua's. It is dispatched by handler presence, so a JS script watching a
        // Lua script's failure — the mixed-language case a real panel actually has — must work.
        juce::Array<juce::var> mixed;
        mixed.add (makeScript ("boom", "lua", "panel", "onBoom", "*",
            "function onBoom() error(\"kaboom\") end\n"));
        mixed.add (makeScript ("watchjs", "javascript", "panel", "onError", "*",
            "function onError(info) { log(\"JSCAUGHT \" + info.scriptId + \"|\" + info.phase); }"));
        runtime.loadScripts (juce::var (mixed));
        host.logs.clear(); errors.clear();
        runtime.runAction ("onBoom", juce::var());
        check (host.logs.joinIntoString ("\n").contains ("JSCAUGHT boom|dispatch"),
               "a JavaScript onError sees a Lua script's failure — the hook is the runtime's, not one engine's");
    }

    // 22) onPanelDestroy (design doc §6 phase 4 lifecycle, §17) -----------------------------------
    // Phase 5, and the whole point is that it is NOT onPanelClose. Closing is the view going away
    // while the scripts keep running — a plugin with its window shut is still playing. Destroying
    // is the scripts themselves going away.
    {
        juce::Array<juce::var> teardown;
        teardown.add (makeScript ("bye", "lua", "panel", "onPanelDestroy", "*",
            "function onPanelDestroy() log(\"BYE\") sendCC(1, 7, 0) end\n"));
        teardown.add (makeScript ("shut", "lua", "panel", "onPanelClose", "*",
            "function onPanelClose() log(\"SHUT\") end\n"));
        runtime.loadScripts (juce::var (teardown));

        // Closing the window does NOT destroy: the scripts go on running afterwards.
        host.logs.clear();
        runtime.onPanelClose();
        check (host.logs.contains ("SHUT"), "onPanelClose still fires when the view goes away");
        check (! host.logs.contains ("BYE"),
               "…and does NOT raise onPanelDestroy — a plugin with its window shut is still playing");

        // Destroying does. Everything still works while it runs: the CC below has to reach the host.
        host.logs.clear(); host.ccSends.clear();
        runtime.onPanelDestroy();
        check (host.logs.contains ("BYE"), "onPanelDestroy reaches a handler that declares it");
        check (host.ccSends.contains ("1:7:0"), "…and the host is still there to receive what it sends");

        // Exactly once per loaded set. A host that calls it at shutdown after something already
        // destroyed the set must not tell the scripts they are going away a second time.
        host.logs.clear();
        runtime.onPanelDestroy();
        check (! host.logs.contains ("BYE"), "a second call is a no-op — a set is destroyed once");

        // A reload destroys the outgoing set before loading the new one, so a panel switch raises
        // it without every host having to remember the call.
        runtime.loadScripts (juce::var (teardown));
        host.logs.clear();
        runtime.loadScripts (juce::var (teardown));
        check (host.logs.contains ("BYE"), "loading a new set destroys the old one first");

        // …and the newly loaded set is armed again rather than being considered already destroyed.
        host.logs.clear();
        runtime.onPanelDestroy();
        check (host.logs.contains ("BYE"), "…leaving the incoming set armed, not pre-destroyed");

        // Never opening the window is not a reason to skip the teardown: something that was never
        // shown was still loaded, and still holds whatever it took at load time.
        juce::Array<juce::var> neverShown;
        neverShown.add (makeScript ("bye", "lua", "panel", "onPanelDestroy", "*",
            "function onPanelDestroy() log(\"BYE\") end\n"));
        runtime.loadScripts (juce::var (neverShown));
        host.logs.clear();
        runtime.onPanelDestroy();
        check (host.logs.contains ("BYE"), "a window that never opened never closed — but it is still destroyed");

        // Loading nothing has nothing to destroy: firing for an empty set would make
        // "exactly once per loaded set" a lie the first time a panel has no scripts.
        runtime.loadScripts (juce::var (juce::Array<juce::var>()));
        host.logs.clear();
        runtime.onPanelDestroy();
        check (host.logs.isEmpty(), "an empty script set raises nothing");

        // A throw in the teardown is reported and the teardown completes — a failing handler must
        // not be able to keep the old set alive.
        juce::Array<juce::var> badBye;
        badBye.add (makeScript ("throws", "lua", "panel", "onPanelDestroy", "*",
            "function onPanelDestroy() error(\"teardown blew up\") end\n"));
        badBye.add (makeScript ("bye", "lua", "panel", "onPanelDestroy", "*",
            "function onPanelDestroy() log(\"BYE\") end\n"));
        runtime.loadScripts (juce::var (badBye));
        host.logs.clear(); errors.clear();
        runtime.onPanelDestroy();
        check (errors.joinIntoString ("\n").contains ("teardown blew up"), "a throw in teardown is reported");
        check (host.logs.contains ("BYE"), "…and the other scripts are still told");
        host.logs.clear();
        runtime.onPanelDestroy();
        check (host.logs.isEmpty(), "…and the set is still marked destroyed, not left half-alive");
    }

    // 23) ce.ui.dialog (design doc §18) -----------------------------------------------------------
    // The one webview-only verb that owes its caller something. A script asks a question and waits
    // in the callback; a callback that never runs leaves it waiting forever. So window-closed the
    // verb answers the only honest answer there is — nobody is here — rather than going quiet.
    {
        juce::Array<juce::var> askScripts;
        askScripts.add (makeScript ("ask", "lua", "panel", "onAsk", "*",
            "function onAsk()\n"
            "  local shown = ce.ui.dialog({ title = \"Overwrite?\", buttons = { \"Yes\", \"No\" } }, function(choice)\n"
            "    log(\"ANSWER \" .. tostring(choice))\n"
            "  end)\n"
            "  log(\"SHOWN \" .. tostring(shown))\n"
            "end\n"));
        askScripts.add (makeScript ("askjs", "javascript", "panel", "onAskJs", "*",
            "function onAskJs() {\n"
            "  var shown = ce.ui.dialog({ title: 'Overwrite?' }, function (choice) {\n"
            "    log('JS ANSWER ' + (choice === undefined ? 'nil' : choice));\n"
            "  });\n"
            "  log('JS SHOWN ' + shown);\n"
            "}"));
        askScripts.add (makeScript ("asknone", "lua", "panel", "onAskNone", "*",
            "function onAskNone() log(\"RET \" .. tostring(ce.ui.dialog({ title = \"Hi\" }))) end\n"));
        runtime.loadScripts (juce::var (askScripts));

        host.logs.clear(); errors.clear();
        runtime.runAction ("onAsk", juce::var());
        check (host.logs.joinIntoString ("\n").contains ("panel window open"),
               "dialog() window-closed says why it did nothing");
        check (host.logs.contains ("ANSWER nil"),
               "…and STILL calls the callback, with no answer — a script waiting on one is not left waiting");
        check (host.logs.contains ("SHOWN false"),
               "…and returns false, so a script can tell 'nobody answered' from 'nobody was asked'");

        // The callback ordering matters: it runs before dialog() returns here, because there is
        // nothing to wait for. A script must not assume otherwise, which is why it is asserted.
        const auto order = host.logs.indexOf ("ANSWER nil") < host.logs.indexOf ("SHOWN false");
        check (order, "the callback runs before the call returns when there is nobody to ask");

        host.logs.clear();
        runtime.runAction ("onAskJs", juce::var());
        check (host.logs.contains ("JS ANSWER nil"), "the JavaScript engine answers the same way");
        check (host.logs.contains ("JS SHOWN false"), "…and returns the same false");

        // Omitting the callback entirely must not throw — it is optional.
        host.logs.clear(); errors.clear();
        runtime.runAction ("onAskNone", juce::var());
        check (host.logs.contains ("RET false"), "the callback is optional");
        check (errors.isEmpty(), "…and leaving it out raises nothing");
    }

    // 24) phase 7 — the other twenty-three component families (design doc §19) -------------------
    // 182 verbs, generated into every prelude from one spec. Window-closed they are stubs, like
    // every other component verb, and what matters here is that they EXIST and explain themselves:
    // a missing name is an undefined-global crash in one engine only, which is exactly the failure
    // a generated list is meant to make impossible.
    {
        juce::Array<juce::var> compScripts;
        compScripts.add (makeScript ("comp", "lua", "panel", "onComp", "*",
            "function onComp()\n"
            "  log(\"flat \" .. type(arpRate))\n"
            "  log(\"ns \" .. type(ce.components.arp.rate))\n"
            "  log(\"same \" .. tostring(ce.components.arp.rate == arpRate))\n"
            "  log(\"lcd \" .. type(ce.components.lcd.text))\n"
            "  log(\"matrix \" .. type(ce.components.matrix.cell))\n"
            "  log(\"ret \" .. tostring(ce.components.arp.rate(\"x\", 4)))\n"
            "end\n"));
        compScripts.add (makeScript ("compjs", "javascript", "panel", "onCompJs", "*",
            "function onCompJs() {\n"
            "  log('js flat ' + typeof arpRate);\n"
            "  log('js same ' + (ce.components.arp.rate === arpRate));\n"
            "  log('js orbit ' + typeof ce.components.orbit.nodeRadius);\n"
            "}"));
        runtime.loadScripts (juce::var (compScripts));

        host.logs.clear(); errors.clear();
        runtime.runAction ("onComp", juce::var());
        check (host.logs.contains ("flat function"), "a phase-7 verb exists as a flat global");
        check (host.logs.contains ("ns function"), "…and at ce.components.<family>.<verb>");
        check (host.logs.contains ("same true"), "…and the two spellings are the SAME function");
        check (host.logs.contains ("lcd function"), "so does a family whose section is not its name (lcd -> Display)");
        check (host.logs.contains ("matrix function"), "…and one with a grid verb");
        check (host.logs.contains ("ret nil"),
               "a stub returns nil, not zero values — tostring() of the result must not throw");
        check (host.logs.joinIntoString ("\n").contains ("panel window open"),
               "…having explained why it did nothing");

        host.logs.clear();
        runtime.runAction ("onCompJs", juce::var());
        check (host.logs.contains ("js flat function"), "the JavaScript engine defines them too");
        check (host.logs.contains ("js same true"), "…with the same identity");
        check (host.logs.contains ("js orbit function"), "…including the item-shaped verbs");
        check (errors.isEmpty(), "no engine raised an error defining 182 new stubs");

        // Gating still holds: a family the panel did not enable is a gate stub, not a name that
        // silently works. This is the phase-3 promise applied to twenty-three new modules at once.
        runtime.setEnabledModules ({ "ce.core", "ce.components.arp" });
        juce::Array<juce::var> gateScripts;
        gateScripts.add (makeScript ("gate", "lua", "panel", "onGate", "*",
            "function onGate()\n"
            "  local listed = {}\n"
            "  for _, m in ipairs(ce.modules) do listed[m.id] = true end\n"
            "  log(\"listed \" .. tostring(listed[\"ce.components.arp\"] == true))\n"
            "  log(\"unlisted \" .. tostring(listed[\"ce.components.orbit\"] == true))\n"
            "  log(\"has \" .. tostring(ce.has(\"ce.components.arp\")))\n"
            "  log(\"gated \" .. tostring(orbitRate(\"x\", 1)))\n"
            "end\n"));
        runtime.loadScripts (juce::var (gateScripts));
        host.logs.clear();
        runtime.runAction ("onGate", juce::var());
        check (host.logs.contains ("listed true"), "a declared family appears in ce.modules");
        check (host.logs.contains ("unlisted false"), "…and an undeclared one does not");
        // ce.has() answers "can I use this HERE", not "did the panel declare it". Every phase-7
        // family is panel-view only, so the honest answer window-closed is false even for one the
        // panel turned on — which is the whole reason ce.has exists rather than a list lookup.
        check (host.logs.contains ("has false"),
               "…while ce.has() still says no, because a component verb cannot work window-closed");
        check (host.logs.contains ("gated nil"), "a gated verb yields nil rather than no value at all");
        check (host.logs.joinIntoString ("\n").contains ("ce.components.orbit"),
               "…and the gate names the module to turn on");
        runtime.setEnabledModules ({});
    }

    // 25) ce.music — scales, chords, snap-to-key (design doc §20) ---------------------------------
    // Pure arithmetic over tables GENERATED into every prelude, so the numbers below are the same
    // fixtures CE/web/test/scriptMusic.test.js runs. If one engine disagrees, a panel quantises
    // differently with the window open and shut, which is the failure this pinning exists to catch.
    {
        juce::Array<juce::var> musicScripts;
        musicScripts.add (makeScript ("mus", "lua", "panel", "onMusic", "*",
            "local function j(t) if t == nil then return \"nil\" end\n"
            "  local s = \"\" for i, v in ipairs(t) do s = s .. (i > 1 and \",\" or \"\") .. tostring(v) end return s end\n"
            "function onMusic()\n"
            "  log(\"cmaj \" .. j(ce.music.scale(60)))\n"
            "  log(\"amin \" .. j(ce.music.scale(\"A3\", \"minor\")))\n"
            "  log(\"pent \" .. j(ce.music.scale(60, \"pentatonicMin\")))\n"
            "  log(\"dm7 \" .. j(ce.music.chord(62, \"min7\")))\n"
            "  log(\"add9 \" .. j(ce.music.chord(60, \"add9\")))\n"
            "  log(\"q61 \" .. tostring(ce.music.quantize(61, 60, \"major\")))\n"
            "  log(\"q63 \" .. tostring(ce.music.quantize(63, 60, \"major\")))\n"
            "  log(\"q73 \" .. tostring(ce.music.quantize(73, 60, \"major\")))\n"
            "  log(\"qblues \" .. tostring(ce.music.quantize(61, 60, \"blues\")))\n"
            "  log(\"bad \" .. tostring(ce.music.scale(60, \"lokrian\")))\n"
            "  log(\"badchord \" .. tostring(ce.music.chord(60, \"nope\")))\n"
            "  log(\"badq \" .. tostring(ce.music.quantize(61, 60, \"nope\")))\n"
            "end\n"));
        musicScripts.add (makeScript ("musjs", "javascript", "panel", "onMusicJs", "*",
            "function onMusicJs() {\n"
            "  log('js cmaj ' + ce.music.scale(60).join(','));\n"
            "  log('js amin ' + ce.music.scale('A3', 'minor').join(','));\n"
            "  log('js dm7 ' + ce.music.chord(62, 'min7').join(','));\n"
            "  log('js q61 ' + ce.music.quantize(61, 60, 'major'));\n"
            "  log('js q73 ' + ce.music.quantize(73, 60, 'major'));\n"
            "  log('js bad ' + (ce.music.scale(60, 'lokrian') === undefined));\n"
            "}"));
        runtime.loadScripts (juce::var (musicScripts));

        host.logs.clear(); errors.clear();
        runtime.runAction ("onMusic", juce::var());
        check (host.logs.contains ("cmaj 60,62,64,65,67,69,71"), "scale(): C major from middle C, root not repeated");
        check (host.logs.contains ("amin 57,59,60,62,64,65,67"), "…and it takes a note NAME for the root");
        check (host.logs.contains ("pent 60,63,65,67,70"), "…a pentatonic is five notes, not seven");
        check (host.logs.contains ("dm7 62,65,69,72"), "chord(): Dm7");
        check (host.logs.contains ("add9 60,64,67,74"), "…and add9 puts the 9th above the octave");
        // The tie rule. C# is one semitone from C and one from D; without a stated rule each engine
        // would pick its own and a panel would quantise differently window-open and window-closed.
        check (host.logs.contains ("q61 62"), "quantize(): a tie goes UP");
        check (host.logs.contains ("q63 64"), "…and otherwise it takes the nearer note");
        check (host.logs.contains ("q73 74"), "…keeping the octave it was given, not folding to one");
        check (host.logs.contains ("qblues 60"), "…and it moves DOWN when down is nearer");
        check (host.logs.contains ("bad nil"), "an unknown scale is nil, not a silent 'major'");
        check (host.logs.contains ("badchord nil"), "…so is an unknown chord");
        check (host.logs.contains ("badq nil"), "…and quantize does not pass the note through");
        check (errors.isEmpty(), "no errors from the music verbs");

        host.logs.clear();
        runtime.runAction ("onMusicJs", juce::var());
        check (host.logs.contains ("js cmaj 60,62,64,65,67,69,71"), "the JavaScript engine agrees, note for note");
        check (host.logs.contains ("js amin 57,59,60,62,64,65,67"), "…including the name-as-root form");
        check (host.logs.contains ("js dm7 62,65,69,72"), "…and the chords");
        check (host.logs.contains ("js q61 62"), "…and the tie rule");
        check (host.logs.contains ("js q73 74"), "…and the octave");
        check (host.logs.contains ("js bad true"), "…and an unknown name is undefined there too");
    }

    // 26) onNoteIn / onNoteOffIn --------------------------------------------------------------------
    // Declared cross-runtime, so a script can react to played notes in a DAW with the window shut.
    // The classification itself lives in PluginProcessor (it decodes the inbound MIDI); what is
    // asserted here is that the runtime raises the events at all, to a handler that declares them.
    {
        juce::Array<juce::var> noteScripts2;
        noteScripts2.add (makeScript ("noteon", "lua", "panel", "onNoteIn", "*",
            "function onNoteIn(n) log(\"ON \" .. n.channel .. \"/\" .. n.note .. \"/\" .. n.velocity) end\n"));
        noteScripts2.add (makeScript ("noteoff", "lua", "panel", "onNoteOffIn", "*",
            "function onNoteOffIn(n) log(\"OFF \" .. n.channel .. \"/\" .. n.note) end\n"));
        runtime.loadScripts (juce::var (noteScripts2));

        host.logs.clear();
        {
            auto* n = new juce::DynamicObject();
            n->setProperty ("channel", 6); n->setProperty ("note", 64); n->setProperty ("velocity", 96);
            runtime.dispatchEvent ("onNoteIn", "", juce::var (n));
        }
        {
            auto* n = new juce::DynamicObject();
            n->setProperty ("channel", 6); n->setProperty ("note", 64); n->setProperty ("velocity", 0);
            runtime.dispatchEvent ("onNoteOffIn", "", juce::var (n));
        }
        check (host.logs.contains ("ON 6/64/96"), "onNoteIn reaches a handler that declares it");
        check (host.logs.contains ("OFF 6/64"), "…and so does onNoteOffIn");

        // The channel is 1-16, matching sendNote, so the obvious thing to do with the event works.
        juce::Array<juce::var> echoScripts;
        echoScripts.add (makeScript ("echo", "lua", "panel", "onNoteIn", "*",
            "function onNoteIn(n) sendNote(n.channel, n.note, n.velocity) end\n"));
        runtime.loadScripts (juce::var (echoScripts));
        host.rawSends.clear();
        {
            auto* n = new juce::DynamicObject();
            n->setProperty ("channel", 6); n->setProperty ("note", 64); n->setProperty ("velocity", 96);
            runtime.dispatchEvent ("onNoteIn", "", juce::var (n));
        }
        // 0x95 = note-on, channel nibble 5 = channel 6. If the event reported 0-based like onCcIn
        // does, this would come back as 0x94 and every echo panel would be off by one.
        check (host.rawSends.contains ("95 40 60"),
               "echoing onNoteIn straight back through sendNote lands on the SAME channel");
    }

    // 27) ce.time.after — a one-shot delay (design doc §21) ---------------------------------------
    // Built on startTimer, so the host's timer machinery drives it and stopTimer cancels it. The
    // TestHost records timer calls rather than running a real clock, so the tick is delivered by
    // hand below — which is also the only way to assert the ORDER inside it.
    {
        juce::Array<juce::var> afterScripts;
        afterScripts.add (makeScript ("aft", "lua", "panel", "onArm", "*",
            "ARMED = nil\n"
            "function onArm() ARMED = after(40, function() log(\"FIRED\") end) log(\"id \" .. tostring(ARMED)) end\n"
            "function onArmBad() log(\"bad \" .. tostring(after(40))) end\n"
            "function onArmChain()\n"
            "  after(10, function() log(\"ONE\") after(10, function() log(\"TWO\") end) end)\n"
            "end\n"
            "function onArmThrow() after(10, function() log(\"RAN\") error(\"boom in the delay\") end) end\n"));
        runtime.loadScripts (juce::var (afterScripts));

        host.logs.clear(); host.timerStarts.clear(); errors.clear();
        runtime.runAction ("onArm", juce::var());
        check (host.timerStarts.size() == 1, "after() arms exactly one host timer");
        const auto armedId = host.timerStarts[0];
        check (armedId.startsWith ("__after:"), "…under an id of its own, not one the panel could collide with");
        check (host.logs.contains ("id " + armedId), "…and hands that id back, so stopTimer can cancel it");

        // The tick. A one-shot must fire its callback and NOT surface as onTimer — a one-shot is
        // not a timer the panel declared, and every onTimer handler would have to filter it out.
        host.logs.clear(); host.timerStops.clear();
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", armedId);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (host.logs.contains ("FIRED"), "the tick runs the callback");
        check (host.timerStops.contains (armedId), "…and stops the timer, so it does not repeat");

        // Ticking the same id again does nothing: the entry was removed before the callback ran.
        host.logs.clear();
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", armedId);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (! host.logs.contains ("FIRED"), "a second tick for the same id fires nothing");

        // Chaining: a callback scheduling the next one. This only works because the entry is
        // cleared BEFORE the callback runs — otherwise the inner after() would be cancelled by the
        // outer one's own stop. It is what a settle-then-send sequence looks like.
        host.logs.clear(); host.timerStarts.clear();
        runtime.runAction ("onArmChain", juce::var());
        const auto first = host.timerStarts[0];
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", first);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (host.logs.contains ("ONE"), "the first one-shot ran");
        check (host.timerStarts.size() == 2 && host.timerStarts[1] != first,
               "…and scheduled a SECOND, under a new id");
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", host.timerStarts[1]);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (host.logs.contains ("TWO"), "…which fires in its turn");

        // A callback that throws must not leave the one-shot repeating — the exact failure mode of
        // the hand-rolled self-cancelling timer this verb exists to replace.
        host.logs.clear(); host.timerStarts.clear(); host.timerStops.clear(); errors.clear();
        runtime.runAction ("onArmThrow", juce::var());
        const auto boomId = host.timerStarts[0];
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", boomId);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (host.logs.contains ("RAN"), "the throwing callback ran");
        check (host.timerStops.contains (boomId), "…and the timer was stopped BEFORE it threw");
        check (errors.joinIntoString ("\n").contains ("boom in the delay"), "…and the throw is reported");
        host.logs.clear();
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", boomId);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (! host.logs.contains ("RAN"), "…and it is gone, not left armed forever");

        // No function, nothing scheduled — and it says so rather than failing silently.
        host.logs.clear(); host.timerStarts.clear();
        runtime.runAction ("onArmBad", juce::var());
        check (host.timerStarts.isEmpty(), "after() with no function schedules nothing");
        check (host.logs.contains ("bad nil"), "…and returns nil");
        check (host.logs.joinIntoString ("\n").contains ("needs a function"), "…having explained why");

        // The JavaScript engine has no setTimeout either — same construction, same behaviour.
        juce::Array<juce::var> afterJs;
        afterJs.add (makeScript ("aftjs", "javascript", "panel", "onArmJs", "*",
            "function onArmJs() { log('jsid ' + after(40, function () { log('JSFIRED'); })); }"));
        runtime.loadScripts (juce::var (afterJs));
        host.logs.clear(); host.timerStarts.clear();
        runtime.runAction ("onArmJs", juce::var());
        check (host.timerStarts.size() == 1, "the JavaScript engine arms a timer too");
        {
            auto* info = new juce::DynamicObject();
            info->setProperty ("id", host.timerStarts[0]);
            runtime.dispatchEvent ("onTimer", "", juce::var (info));
        }
        check (host.logs.contains ("JSFIRED"), "…and fires the callback on the tick");
    }

    // extensionsFromPanel: the panel document is where the copies come from.
    {
        auto panel = juce::JSON::parse (R"JSON({ "scripting": { "extensions": [ { "id": "ce.ext.x" } ] } })JSON");
        check (ScriptRuntime::extensionsFromPanel (panel).size() == 1,
               "extensionsFromPanel reads scripting.extensions");
        check (! ScriptRuntime::extensionsFromPanel (juce::JSON::parse (R"({ "scripting": {} })")).isArray(),
               "a panel carrying no modules reads as none");
    }

    std::cout << "------------------------\n"
              << (failures == 0 ? "ALL PASS" : juce::String (failures) + " FAILURE(S)").toStdString() << "\n";
    return failures == 0 ? 0 : 1;
}
