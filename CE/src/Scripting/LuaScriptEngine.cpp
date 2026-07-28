// LuaScriptEngine — Lua 5.4 via Sol3. One sol::state; each script gets its own sol::environment
// so handler names (onValueChanged, …) and `self` never clash across scripts.
//
// Native API (crosses to the C++ host): set/get, sendCC/sendNRPN/sendSysex, requestDump/applyDump/
// sendDump/buildDump, run/emit, log, noTransmit/transmit, on. Pure-math helpers (scale/clamp/…,
// MIDI encoding) are defined in a Lua prelude (kept in sync with the JS prelude + panelApi.js).
//
// Requires Sol3 + Lua (added by CMake behind the CEDITOR_SCRIPTING option). UNVERIFIED until built.

#include "ScriptRuntime.h"

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include <algorithm>
#include <cmath>
#include <map>
#include <vector>

namespace ceditor::scripting
{
namespace
{

juce::var solToVar (const sol::object& o)
{
    switch (o.get_type())
    {
        case sol::type::boolean: return juce::var (o.as<bool>());
        case sol::type::number:
        {
            double d = o.as<double>();
            if (d == (double) (juce::int64) d) return juce::var ((juce::int64) d);
            return juce::var (d);
        }
        case sol::type::string: return juce::var (juce::String (o.as<std::string>()));
        case sol::type::table:
        {
            sol::table t = o.as<sol::table>();
            // Decide array vs object by checking for a contiguous 1..n integer keyset.
            bool isArray = true;
            std::size_t count = 0;
            for (auto& kv : t) { ++count; if (kv.first.get_type() != sol::type::number) { isArray = false; break; } }
            if (isArray && count > 0)
            {
                juce::Array<juce::var> arr;
                for (std::size_t i = 1; i <= count; ++i) arr.add (solToVar (t[i]));
                return juce::var (arr);
            }
            auto* obj = new juce::DynamicObject();
            for (auto& kv : t)
                obj->setProperty (juce::Identifier (juce::String (kv.first.as<std::string>())), solToVar (kv.second));
            return juce::var (obj);
        }
        default: return juce::var(); // nil / nullptr / function → void
    }
}

sol::object varToSol (sol::state_view lua, const juce::var& v)
{
    if (v.isVoid() || v.isUndefined()) return sol::make_object (lua, sol::nil);
    if (v.isBool())   return sol::make_object (lua, (bool) v);
    // Lua 5.4 has a real integer subtype: hand an integer across as one. Widening to double made
    // every whole number arrive as a float, so tostring(64) read "64.0" in Lua while the same
    // payload printed "64" in JS and Python — and a value used as a table index had to be floored
    // first. The subtype is what keeps the three runtimes agreeing on what a number looks like.
    if (v.isInt() || v.isInt64()) return sol::make_object (lua, (lua_Integer) (juce::int64) v);
    if (v.isDouble())
    {
        // solToVar already folds an integral Lua number back to an int64 on the way out; do the
        // same on the way in, or a whole number that reached us through JS (where 21 is a double)
        // arrives in Lua as 21.0 and prints that way. Symmetry here is what makes a value survive
        // a round trip between two scripts written in different languages.
        const double d = (double) v;
        if (d == std::floor (d) && std::abs (d) < 9.0e15)
            return sol::make_object (lua, (lua_Integer) (juce::int64) d);
        return sol::make_object (lua, d);
    }
    if (v.isString()) return sol::make_object (lua, v.toString().toStdString());
    if (auto* arr = v.getArray())
    {
        sol::table t = lua.create_table();
        for (int i = 0; i < arr->size(); ++i) t[i + 1] = varToSol (lua, (*arr)[i]);
        return t;
    }
    if (auto* obj = v.getDynamicObject())
    {
        sol::table t = lua.create_table();
        for (auto& prop : obj->getProperties())
            t[prop.name.toString().toStdString()] = varToSol (lua, prop.value);
        return t;
    }
    return sol::make_object (lua, sol::nil);
}

const char* kPrelude = R"LUA(
-- @module ce.math
-- Pure-math helpers (no host). Keep in sync with the JS prelude + panelApi.js.
function clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi else return v end end
function round(v) return math.floor(v + 0.5) end
function scale(v, inLo, inHi, outLo, outHi)
  if inHi == inLo then return outLo end
  return outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)
end
function snap(v, step) if step == 0 then return v end return round(v / step) * step end
function lerp(a, b, t) return a + (b - a) * t end
function curve(v, shape)
  shape = shape or "linear"
  if shape == "exp" then return v * v
  elseif shape == "log" then return math.sqrt(math.max(0, v))
  elseif shape == "s" then return v * v * (3 - 2 * v)
  else return v end
end
-- @module ce.music
local NOTE_NAMES = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"}
function noteName(n) n = math.floor(n) return NOTE_NAMES[(n % 12) + 1] .. tostring(math.floor(n / 12) - 1) end
function noteNumber(name)
  local note, oct = string.match(name, "^([A-G]#?)(-?%d+)$")
  if not note then return 0 end
  for i, nm in ipairs(NOTE_NAMES) do if nm == note then return (tonumber(oct) + 1) * 12 + (i - 1) end end
  return 0
end
-- @module ce.midi
function to14bit(v) v = math.floor(v) return { msb = math.floor(v / 128) % 128, lsb = v % 128 } end
function from14bit(msb, lsb) return msb * 128 + lsb end
function to7bit(v, count, order)
  count = count or 2; order = order or "msb"; v = math.floor(v)
  local out = {}
  for i = 1, count do out[i] = v % 128; v = math.floor(v / 128) end
  if order == "msb" then local r = {} for i = count, 1, -1 do r[#r + 1] = out[i] end return r end
  return out
end
function from7bit(bytes, order)
  order = order or "msb"; local v = 0
  if order == "msb" then for i = 1, #bytes do v = v * 128 + bytes[i] end
  else for i = #bytes, 1, -1 do v = v * 128 + bytes[i] end end
  return v
end
function toNibbles(b) b = math.floor(b) return { hi = math.floor(b / 16) % 16, lo = b % 16 } end
function fromNibbles(hi, lo) return hi * 16 + lo end
function nibblize(bytes) local o = {} for i = 1, #bytes do local n = toNibbles(bytes[i]) o[#o+1] = n.hi; o[#o+1] = n.lo end return o end
function denibblize(bytes) local o = {} for i = 1, #bytes, 2 do o[#o+1] = fromNibbles(bytes[i], bytes[i+1] or 0) end return o end
function toAscii(str, length) local o = {} for i = 1, #str do o[i] = string.byte(str, i) end if length then for i = #str + 1, length do o[i] = 32 end end return o end
function fromAscii(bytes) local s = "" for i = 1, #bytes do s = s .. string.char(bytes[i]) end return s end
function toOffset(v, center) return v + center end
function fromOffset(b, center) return b - center end
function toSigned(v, bits) local m = 2 ^ bits; if v < 0 then return v + m end return v end
function fromSigned(b, bits) local m = 2 ^ bits; if b >= m / 2 then return b - m end return b end

-- checksum(kind, bytes) — "roland"/"yamaha" are the same two's-complement 7-bit sum; "sum" is the
-- plain 7-bit sum; "xor" is the running XOR. The one-argument form checksum(bytes) defaults to
-- roland (the spelling panels shipped with before the contract was enforced).
function checksum(kind, bytes)
  if bytes == nil then bytes = kind; kind = "roland" end
  kind = string.lower(tostring(kind or "roland"))
  local sum, x = 0, 0
  for i = 1, #bytes do
    local b = math.floor(bytes[i]) % 256
    sum = (sum + b) % 128
    x = (x ~ b) & 0x7f
  end
  if kind == "xor" then return x end
  if kind == "sum" then return sum end
  return (128 - sum) % 128
end

-- panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
-- order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
-- out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
function panic(opts)
  opts = opts or {}
  local reset = opts.resetControllers ~= false
  local first, last = 1, 16
  if opts.channel then first = math.floor(opts.channel); last = first end
  for ch = first, last do
    sendCC(ch, 120, 0)
    sendCC(ch, 123, 0)
    if reset then sendCC(ch, 121, 0) end
  end
end

-- @module ce.components
-- Panel-component verbs (panelApi.js PANEL_COMMANDS). The Zone Splitter, Phrase Sequencer,
-- Recorder, Harmoniser and Setlist are modelled and rendered in the panel view; there is no C++
-- counterpart to drive with the window closed. Defining them here as explaining stubs means a
-- script that strays across the boundary says so, instead of dying on a nil global.
local WEBVIEW_ONLY = {
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection","phraseRun","phraseCell",
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift","recorderStore",
  "recorderLoad","recorderCountIn",
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing","harmonyInversion",
  "harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel","harmonyVoiceLeading","harmonyStrum",
  "harmonyDegree",
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
}
for _, name in ipairs(WEBVIEW_ONLY) do
  _G[name] = function()
    log("[panel] " .. name .. "() needs the panel window open — that component is drawn and modelled in the panel view, so there is nothing to drive while the window is closed.")
  end
end

-- @module ce.midi
-- MIDI channel messages. All of them are arithmetic over sendMidi, the way panic() is over sendCC,
-- which is what makes them work identically in every runtime and every exported language.
-- `note` accepts a MIDI number or a name ("C3"), because a script that reads musically should be
-- allowed to say so.
local function __ch(c) c = math.floor(tonumber(c) or 1); if c < 1 then c = 1 elseif c > 16 then c = 16 end return c - 1 end
local function __7(v) v = math.floor(tonumber(v) or 0); if v < 0 then v = 0 elseif v > 127 then v = 127 end return v end
local function __note(n) if type(n) == "string" then return noteNumber(n) end return __7(n) end

function sendNote(channel, note, velocity) sendMidi({0x90 | __ch(channel), __note(note), __7(velocity)}) end
function sendNoteOff(channel, note, velocity) sendMidi({0x80 | __ch(channel), __note(note), __7(velocity or 0)}) end
function sendProgramChange(channel, program, bankMsb, bankLsb)
  -- Bank select first: a device applies the bank that was in force when the program change lands.
  if bankMsb ~= nil then sendCC(channel, 0, __7(bankMsb)) end
  if bankLsb ~= nil then sendCC(channel, 32, __7(bankLsb)) end
  sendMidi({0xC0 | __ch(channel), __7(program)})
end
function sendPitchBend(channel, value)
  local v = math.floor(tonumber(value) or 8192)
  if v < 0 then v = 0 elseif v > 16383 then v = 16383 end
  sendMidi({0xE0 | __ch(channel), v % 128, math.floor(v / 128) % 128})
end
function sendAftertouch(channel, pressure, note)
  if note ~= nil then sendMidi({0xA0 | __ch(channel), __note(note), __7(pressure)})
  else sendMidi({0xD0 | __ch(channel), __7(pressure)}) end
end
function sendClock() sendMidi({0xF8}) end
function sendTransport(action)
  action = string.lower(tostring(action or "start"))
  if action == "stop" then sendMidi({0xFC})
  elseif action == "continue" then sendMidi({0xFB})
  else sendMidi({0xFA}) end
end

-- @module ce.storage
-- ce.storage. `state` is a plain table: each script runs in its own sol::environment, which lives
-- as long as the script is loaded, so it persists between handler calls without any host help.
-- Settings go through the host, because they outlive the session.
state = {}
function loadSetting(key, fallback)
  local v = __loadSetting(key)
  if v == nil then return fallback end
  return v
end

-- @module -
-- BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
-- on top. ce.core is global: its members are never namespaced, so they appear here only for
-- discoverability (ce.core.set is the same function as set).
local __CE_MODULES = {
  ["ce.core"] = { emit = "emit", get = "get", log = "log", noTransmit = "noTransmit", off = "off", on = "on", run = "run", set = "set", transmit = "transmit" },
  ["ce.midi"] = { checksum = "checksum", denibblize = "denibblize", from14bit = "from14bit", from7bit = "from7bit", fromAscii = "fromAscii", fromNibbles = "fromNibbles", fromOffset = "fromOffset", fromSigned = "fromSigned", nibblize = "nibblize", panic = "panic", sendAftertouch = "sendAftertouch", sendCC = "sendCC", sendClock = "sendClock", sendMidi = "sendMidi", sendNRPN = "sendNRPN", sendNote = "sendNote", sendNoteOff = "sendNoteOff", sendPitchBend = "sendPitchBend", sendProgramChange = "sendProgramChange", sendSysex = "sendSysex", sendTransport = "sendTransport", to14bit = "to14bit", to7bit = "to7bit", toAscii = "toAscii", toNibbles = "toNibbles", toOffset = "toOffset", toSigned = "toSigned" },
  ["ce.device"] = { applyDump = "applyDump", buildDump = "buildDump", requestDump = "requestDump", sendDump = "sendDump" },
  ["ce.math"] = { clamp = "clamp", curve = "curve", lerp = "lerp", round = "round", scale = "scale", snap = "snap" },
  ["ce.music"] = { noteName = "noteName", noteNumber = "noteNumber" },
  ["ce.time"] = { startTimer = "startTimer", stopTimer = "stopTimer" },
  ["ce.storage"] = { loadSetting = "loadSetting", saveSetting = "saveSetting", state = "state" },
  ["ce.components.split"] = { channel = "splitChannel", mute = "splitMute", point = "splitPoint", preset = "splitPreset", transpose = "splitTranspose" },
  ["ce.components.phrase"] = { cell = "phraseCell", clear = "phraseClear", direction = "phraseDirection", key = "phraseKey", run = "phraseRun", scale = "phraseScale", seed = "phraseSeed", transpose = "phraseTranspose" },
  ["ce.components.recorder"] = { bars = "recorderBars", clear = "recorderClear", countIn = "recorderCountIn", load = "recorderLoad", nudge = "recorderNudge", play = "recorderPlay", quantize = "recorderQuantize", record = "recorderRecord", shift = "recorderShift", source = "recorderSource", stop = "recorderStop", store = "recorderStore", transpose = "recorderTranspose", undo = "recorderUndo" },
  ["ce.components.harmony"] = { channel = "harmonyChannel", degree = "harmonyDegree", inversion = "harmonyInversion", keepPlayed = "harmonyKeepPlayed", key = "harmonyKey", mode = "harmonyMode", octave = "harmonyOctave", outOfKey = "harmonyOutOfKey", scale = "harmonyScale", shape = "harmonyShape", size = "harmonySize", strum = "harmonyStrum", voiceLeading = "harmonyVoiceLeading", voicing = "harmonyVoicing" },
  ["ce.components.setlist"] = { crossfade = "setlistCrossfade", enable = "setlistEnable", jump = "setlistGoto", next = "setlistNext", prev = "setlistPrev", wrap = "setlistWrap" },
}
local __CE_ORDER = { "ce.core", "ce.midi", "ce.device", "ce.math", "ce.music", "ce.time", "ce.storage", "ce.components.split", "ce.components.phrase", "ce.components.recorder", "ce.components.harmony", "ce.components.setlist" }
local __CE_META = {
  { id = "ce.core", version = "1.0", runtime = "any" },
  { id = "ce.midi", version = "1.1", runtime = "any" },
  { id = "ce.device", version = "1.0", runtime = "any" },
  { id = "ce.math", version = "1.0", runtime = "any" },
  { id = "ce.music", version = "1.0", runtime = "any" },
  { id = "ce.time", version = "1.0", runtime = "any" },
  { id = "ce.storage", version = "1.0", runtime = "any" },
  { id = "ce.components.split", version = "1.0", runtime = "webview" },
  { id = "ce.components.phrase", version = "1.0", runtime = "webview" },
  { id = "ce.components.recorder", version = "1.0", runtime = "webview" },
  { id = "ce.components.harmony", version = "1.0", runtime = "webview" },
  { id = "ce.components.setlist", version = "1.0", runtime = "webview" },
}
local __CE_VALUES = { ["state"] = true }
local __CE_GATE_MSG = "{member}() needs the {module} module, which this panel has not enabled. Add \"{module}\" to the panel's Scripting Modules (Export tab) — or clear the list to let it follow the scripts automatically."
-- The real implementation of every member, captured before anything is gated, so turning a module
-- back on restores the function rather than leaving the stub in place.
local __CE_REAL = {}

local function __ce_gate(__member, __module)
  return function()
    local __m = string.gsub(__CE_GATE_MSG, "{member}", __member)
    __m = string.gsub(__m, "{module}", __module)
    log(__m)
  end
end

-- __ce_apply_modules(enabled) — enabled is an array of module ids, or nil for "everything on".
-- The host calls this with the panel's resolved list; a member of a module that is not on becomes
-- a stub that names the module instead of a call that quietly works.
function __ce_apply_modules(enabled)
  local __on = nil
  if enabled ~= nil then
    __on = { ["ce.core"] = true }
    for _, __id in ipairs(enabled) do __on[__id] = true end
  end
  ce = {}
  for _, __path in ipairs(__CE_ORDER) do
    local __live = (__on == nil) or (__on[__path] == true)
    local __node = ce
    for __seg in string.gmatch(string.sub(__path, 4), "[^.]+") do
      __node[__seg] = __node[__seg] or {}
      __node = __node[__seg]
    end
    for __short, __global in pairs(__CE_MODULES[__path]) do
      if __CE_REAL[__global] == nil then __CE_REAL[__global] = _G[__global] end
      local __v = __CE_REAL[__global]
      if (not __live) and (not __CE_VALUES[__global]) then __v = __ce_gate(__global, __path) end
      _G[__global] = __v
      __node[__short] = __v
    end
  end
  ce.version = "1.0"
  ce.runtime = "player"
  ce.language = "lua"
  ce.modules = {}
  for _, __m in ipairs(__CE_META) do
    if (__on == nil) or (__on[__m.id] == true) then
      ce.modules[#ce.modules + 1] = { id = __m.id, version = __m.version, runtime = __m.runtime }
    end
  end
  ce.has = function(__id)
    for _, __m in ipairs(ce.modules) do
      if __m.id == __id then return __m.runtime == "any" or __m.runtime == ce.runtime end
    end
    return false
  end
end

-- __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
-- (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
-- prelude first, so its globals already exist by the time this runs; re-applying the gate then
-- treats it exactly like anything else. An extension needs no machinery of its own — that is the
-- whole point of giving it the same shape.
function __ce_register_module(path, members, version, runtime)
  if __CE_MODULES[path] == nil then __CE_ORDER[#__CE_ORDER + 1] = path end
  __CE_MODULES[path] = members
  for _, __m in ipairs(__CE_META) do
    if __m.id == path then __m.version = version; __m.runtime = runtime; return end
  end
  __CE_META[#__CE_META + 1] = { id = path, version = version, runtime = runtime }
end

__ce_apply_modules(nil)
-- END GENERATED module namespace
)LUA";

// --------------------------------------------------------------------------------------------

class LuaScriptEngine final : public ScriptEngine
{
public:
    LuaScriptEngine() { lua.open_libraries (sol::lib::base, sol::lib::math, sol::lib::string, sol::lib::table); }

    juce::String language() const override { return "lua"; }

    // Anti-flood / loop guard (scripting-redesign §7 keep-list): a count hook
    // aborts any single entry into Lua after a generous instruction budget, so
    // `while true do end` in a handler errors out instead of freezing the DAW.
    // The budget is per outermost entry; nested entries (a handler that emits an
    // event which dispatches back into Lua) share the outer installation.
    static constexpr int kInstructionBudget = 20'000'000;

    struct Watchdog
    {
        explicit Watchdog (LuaScriptEngine& engineIn) : engine (engineIn)
        {
            if (engine.watchdogDepth++ == 0)
                lua_sethook (engine.lua.lua_state(), &Watchdog::onBudgetExceeded, LUA_MASKCOUNT, kInstructionBudget);
        }

        ~Watchdog()
        {
            if (--engine.watchdogDepth == 0)
                lua_sethook (engine.lua.lua_state(), nullptr, 0, 0);
        }

        static void onBudgetExceeded (lua_State* L, lua_Debug*)
        {
            luaL_error (L, "script exceeded its instruction budget (possible infinite loop) — aborted by the runtime guard");
        }

        LuaScriptEngine& engine;
    };

    bool installApi (ScriptHostApi& h) override
    {
        host = &h;
        auto g = lua.globals();

        // optionsFromOpts: turn a Lua opts table {transmit=...} into a juce::var for the host.
        auto buildOptions = [this] (sol::optional<sol::table> opts) -> juce::var
        {
            if (! opts) return {};
            auto* o = new juce::DynamicObject();
            sol::object t = (*opts)["transmit"];
            if (t.valid() && t.get_type() == sol::type::boolean) o->setProperty ("transmit", t.as<bool>());
            return juce::var (o);
        };

        g.set_function ("set", [this, buildOptions] (std::string path, sol::object value, sol::optional<sol::table> opts)
            { host->setValue (juce::String (path), solToVar (value), buildOptions (opts)); });
        g.set_function ("get", [this] (std::string path, sol::optional<std::string> form)
            { return varToSol (lua, host->getValue (juce::String (path), form ? juce::String (*form) : juce::String ("value"))); });

        g.set_function ("sendCC",   [this] (int ch, int cc, sol::object v) { host->sendCC (ch, cc, solToVar (v)); });
        g.set_function ("sendNRPN", [this] (int ch, int msb, int lsb, sol::object v) { host->sendNRPN (ch, msb, lsb, solToVar (v)); });
        g.set_function ("sendSysex", [this] (sol::object bytes) { host->sendSysex (solToVar (bytes)); });
        g.set_function ("sendMidi",  [this] (sol::object bytes) { host->sendMidi (solToVar (bytes)); });
        g.set_function ("requestDump", [this] (std::string kind) { host->requestDump (juce::String (kind)); });
        g.set_function ("applyDump",  [this] (sol::object bytes) { host->applyDump (solToVar (bytes)); });
        g.set_function ("sendDump",   [this] (std::string kind) { host->sendDump (juce::String (kind)); });
        g.set_function ("buildDump",  [this] (std::string kind) { return varToSol (lua, host->buildDump (juce::String (kind))); });

        g.set_function ("startTimer", [this] (std::string id, sol::optional<int> ms) { host->startTimer (juce::String (id), ms ? *ms : 0); });
        g.set_function ("stopTimer",  [this] (std::string id) { host->stopTimer (juce::String (id)); });

        g.set_function ("saveSetting", [this] (std::string key, sol::object v)
            { host->saveSetting (juce::String (key), solToVar (v)); });
        g.set_function ("__loadSetting", [this] (std::string key)
            { return varToSol (lua, host->loadSetting (juce::String (key))); });

        g.set_function ("run",  [this] (std::string target, sol::optional<sol::object> args)
            { return varToSol (lua, host->runAction (juce::String (target), args ? solToVar (*args) : juce::var())); });
        g.set_function ("emit", [this] (std::string name, sol::optional<sol::object> data)
            { host->emitEvent (juce::String (name), data ? solToVar (*data) : juce::var()); });
        g.set_function ("log",  [this] (std::string msg, sol::optional<sol::object> v)
            { host->log (juce::String (msg), v ? solToVar (*v) : juce::var()); });

        // noTransmit/transmit blocks — wrap the user function in a transmit override.
        g.set_function ("noTransmit", [this] (sol::protected_function fn)
            { host->beginTransmitOverride (false); auto r = fn(); host->endTransmitOverride(); if (! r.valid()) reportPF (r); });
        g.set_function ("transmit", [this] (sol::protected_function fn)
            { host->beginTransmitOverride (true); auto r = fn(); host->endTransmitOverride(); if (! r.valid()) reportPF (r); });

        // on(target, event, fn) — register a listener, tagged with the script registering it.
        // One sol::state is shared by every Lua script, so without the tag off() could not tell
        // whose listener it was removing (QuickJS gets an engine per script, so its prelude can
        // filter locally instead).
        g.set_function ("on", [this] (std::string target, std::string event, sol::protected_function fn)
            { listeners.push_back ({ currentScriptId, juce::String (target), juce::String (event), std::move (fn) }); });

        // off(target, event) — drop THIS script's listeners for that pair. Unknown pairs are a no-op.
        g.set_function ("off", [this] (std::string target, std::string event)
        {
            const juce::String t (target), e (event);
            listeners.erase (std::remove_if (listeners.begin(), listeners.end(),
                [this, &t, &e] (const Listener& l)
                { return l.scriptId == currentScriptId && l.target == t && l.event == e; }),
                listeners.end());
        });

        lua.script (kPrelude);
        installExtensions();
        applyModuleGates();
        return true;
    }

    // One sol::state is shared by every Lua script, so the gate is applied once here rather than
    // per script the way the JS/Python engines have to.
    void setEnabledModules (const juce::StringArray& moduleIds) override
    {
        enabledModules = moduleIds;
        applyModuleGates();
    }

    void setExtensionModules (const juce::var& modules) override
    {
        extensions = modules;
        installExtensions();
    }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        sol::environment env (lua, sol::create, lua.globals());

        // `self` — convenience proxy bound to the script's owner (Q7). Methods prefix the owner.
        // `self` is the element the script is attached to: the control for a component script, and
        // THE PANEL for a panel script. The panel half was documented from the start but never
        // resolved — self.set("width", 800) landed on a control called "width" and reported it
        // missing, because there was no way to address the panel at all.
        const juce::String owner = resolveSelfOwner (def);
        auto prefix = [owner] (const std::string& p) -> juce::String
        {
            if (owner.isEmpty()) return juce::String (p);
            return owner + "." + juce::String (p);
        };
        sol::table self = lua.create_table();
        self.set_function ("set", [this, prefix] (std::string p, sol::object v) { host->setValue (prefix (p), solToVar (v), juce::var()); });
        self.set_function ("get", [this, prefix] (std::string p, sol::optional<std::string> form)
            { return varToSol (lua, host->getValue (prefix (p), form ? juce::String (*form) : juce::String ("value"))); });
        env["self"] = self;

        const Watchdog guard (*this); // top-level statements obey the instruction budget too
        currentScriptId = def.id;
        auto result = lua.safe_script (def.source.toStdString(), env, sol::script_pass_on_error);
        currentScriptId = {};
        if (! result.valid())
        {
            sol::error err = result;
            onError (def.id, juce::String ("load error: ") + err.what());
            return false;
        }
        envs[def.id] = std::move (env);
        return true;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        auto it = envs.find (scriptId);
        if (it == envs.end()) return false;
        sol::object f = it->second[fn.toStdString()];
        return f.valid() && f.get_type() == sol::type::function;
    }

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        auto it = envs.find (scriptId);
        if (it == envs.end()) return {};
        sol::protected_function f = it->second[fn.toStdString()];
        if (! f.valid()) return {};
        const Watchdog guard (*this);
        currentScriptId = scriptId;
        auto r = f (varToSol (lua, payload));
        currentScriptId = {};
        if (! r.valid()) { sol::error e = r; onError (scriptId, juce::String (e.what())); return {}; }
        return r.return_count() > 0 ? solToVar (r) : juce::var();
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        const Watchdog guard (*this);
        for (auto& l : listeners)
        {
            if (l.event != event) continue;
            if (l.target != target && l.target != "*" && ! (l.target == "self")) continue;
            auto r = l.fn (varToSol (lua, payload));
            if (! r.valid()) { sol::error e = r; onError ("on:" + event, juce::String (e.what())); }
        }
    }

    void reset() override { envs.clear(); listeners.clear(); }

private:
    struct Listener { juce::String scriptId, target, event; sol::protected_function fn; };

    void reportPF (const sol::protected_function_result& r)
    {
        sol::error e = r; juce::Logger::writeToLog (juce::String ("[lua block] ") + e.what());
    }

    /** Evaluate each installed ce.ext.* module's Lua prelude, then register it into the same
        tables the built-in modules live in. Third-party top-level code runs under the SAME
        instruction budget as a user script — a runaway loop in somebody's module must not be able
        to hang the DAW any more than a runaway loop in a handler can. */
    void installExtensions()
    {
        auto* arr = extensions.getArray();
        if (arr == nullptr) return;

        sol::protected_function reg = lua["__ce_register_module"];
        if (! reg.valid()) return;   // prelude not installed yet

        for (const auto& item : *arr)
        {
            auto* obj = item.getDynamicObject();
            if (obj == nullptr) continue;
            const auto id = obj->getProperty ("id").toString();
            if (id.isEmpty()) continue;

            juce::String source;
            if (auto* prelude = obj->getProperty ("prelude").getDynamicObject())
                source = prelude->getProperty ("lua").toString();
            // A module may legitimately ship JS and no Lua. Skipping is right; the members simply
            // never appear in this engine, and ce.has() reports the truth for whoever asks.
            if (source.isEmpty()) continue;

            {
                const Watchdog guard (*this);
                auto r = lua.safe_script (source.toStdString(), sol::script_pass_on_error);
                if (! r.valid())
                {
                    sol::error e = r;
                    juce::Logger::writeToLog ("[module " + id + "] load error: " + juce::String (e.what()));
                    continue;   // a broken module is skipped, never half-registered
                }
            }

            sol::table members = lua.create_table();
            if (auto* list = obj->getProperty ("members").getArray())
            {
                for (const auto& m : *list)
                {
                    auto* mo = m.getDynamicObject();
                    if (mo == nullptr) continue;
                    const auto memberId = mo->getProperty ("id").toString();
                    if (memberId.isEmpty()) continue;
                    auto shortName = mo->getProperty ("name").toString();
                    if (shortName.isEmpty()) shortName = memberId;
                    members[shortName.toStdString()] = memberId.toStdString();
                }
            }

            auto version = obj->getProperty ("version").toString();
            auto runtime = obj->getProperty ("runtime").toString();
            if (runtime.isEmpty()) runtime = "any";
            auto rr = reg (id.toStdString(), members, version.toStdString(), runtime.toStdString());
            if (! rr.valid()) reportPF (rr);
        }
    }

    /** Hand the prelude the panel's module list — or nil, meaning "declared nothing, all on". */
    void applyModuleGates()
    {
        sol::protected_function apply = lua["__ce_apply_modules"];
        if (! apply.valid()) return;   // prelude not installed yet

        sol::protected_function_result r;
        if (enabledModules.isEmpty())
        {
            r = apply (sol::nil);
        }
        else
        {
            sol::table t = lua.create_table();
            for (int i = 0; i < enabledModules.size(); ++i) t[i + 1] = enabledModules[i].toStdString();
            r = apply (t);
        }
        if (! r.valid()) reportPF (r);
    }

    sol::state lua;
    std::map<juce::String, sol::environment> envs;
    std::vector<Listener> listeners;
    ScriptHostApi* host = nullptr;
    int watchdogDepth = 0;
    // Which script is executing, so on()/off() can tag and match listeners. Set around
    // both load (top-level on() calls) and dispatch (a handler subscribing later).
    juce::String currentScriptId;
    juce::StringArray enabledModules;   // empty = the panel declared nothing = every module on
    juce::var extensions;               // ce.ext.* modules the panel carries
};

} // namespace

std::unique_ptr<ScriptEngine> createLuaEngine() { return std::make_unique<LuaScriptEngine>(); }

} // namespace ceditor::scripting
