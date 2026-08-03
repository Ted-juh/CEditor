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
    if (v.isInt() || v.isInt64()) return sol::make_object (lua, (double) (juce::int64) v);
    if (v.isDouble()) return sol::make_object (lua, (double) v);
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
local NOTE_NAMES = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"}
function noteName(n) n = math.floor(n) return NOTE_NAMES[(n % 12) + 1] .. tostring(math.floor(n / 12) - 1) end
function noteNumber(name)
  local note, oct = string.match(name, "^([A-G]#?)(-?%d+)$")
  if not note then return 0 end
  for i, nm in ipairs(NOTE_NAMES) do if nm == note then return (tonumber(oct) + 1) * 12 + (i - 1) end end
  return 0
end
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
        g.set_function ("requestDump", [this] (std::string kind) { host->requestDump (juce::String (kind)); });
        g.set_function ("applyDump",  [this] (sol::object bytes) { host->applyDump (solToVar (bytes)); });
        g.set_function ("sendDump",   [this] (std::string kind) { host->sendDump (juce::String (kind)); });
        g.set_function ("buildDump",  [this] (std::string kind) { return varToSol (lua, host->buildDump (juce::String (kind))); });

        g.set_function ("noteOn",  [this] (int ch, int note, sol::optional<int> vel) { host->sendNoteOn (ch, note, vel ? *vel : 100); });
        g.set_function ("noteOff", [this] (int ch, int note) { host->sendNoteOff (ch, note); });
        g.set_function ("sendNote", [this] (int ch, int note, sol::optional<int> vel, sol::optional<int> ms)
            { host->sendNote (ch, note, vel ? *vel : 100, ms ? *ms : 200); });
        g.set_function ("transport", [this] () { return varToSol (lua, host->getTransport()); });

        // startTimer(id, ms), or startTimer(id, { ms | beats, once }) — beats convert via the
        // current tempo (fixed at start; restart after a tempo change, or follow onBeat
        // instead); once fires a single time and removes itself.
        g.set_function ("startTimer", [this] (std::string id, sol::optional<sol::object> arg)
        {
            double ms = 0;
            bool once = false;
            if (arg)
            {
                if (arg->is<double>()) ms = arg->as<double>();
                else if (arg->is<sol::table>())
                {
                    auto t = arg->as<sol::table>();
                    once = t.get_or ("once", false);
                    const double beats = t.get_or ("beats", 0.0);
                    if (beats > 0)
                    {
                        double bpm = 120.0;
                        if (auto* o = host->getTransport().getDynamicObject())
                            if (const double b = (double) o->getProperty ("bpm"); b > 0) bpm = b;
                        ms = beats * 60000.0 / bpm;
                    }
                    else ms = t.get_or ("ms", 0.0);
                }
            }
            host->startTimer (juce::String (id), (int) std::llround (ms), once);
        });
        g.set_function ("stateSet", [this] (std::string key, sol::object v) { host->stateSet (juce::String (key), solToVar (v)); });
        g.set_function ("stateGet", [this] (std::string key, sol::optional<sol::object> fallback) -> sol::object
        {
            auto v = host->stateGet (juce::String (key));
            if (v.isVoid() && fallback) return *fallback;
            return varToSol (lua, v);
        });
        g.set_function ("stopTimer",  [this] (std::string id) { host->stopTimer (juce::String (id)); });

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

        // on(target, event, fn) — register a listener. The 2-arg form on(name, fn) listens for a
        // custom emit()ted event on any target (spec Q6).
        g.set_function ("on", sol::overload (
            [this] (std::string target, std::string event, sol::protected_function fn)
                { listeners.push_back ({ juce::String (target), juce::String (event), std::move (fn) }); },
            [this] (std::string name, sol::protected_function fn)
                { listeners.push_back ({ "*", juce::String (name), std::move (fn) }); }));

        lua.script (kPrelude);
        return true;
    }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        sol::environment env (lua, sol::create, lua.globals());

        // `self` — convenience proxy bound to the script's owner (Q7). Methods prefix the owner.
        const juce::String owner = def.owner;
        auto prefix = [owner] (const std::string& p) -> juce::String
        {
            if (owner.isEmpty() || owner == "self" || owner == "*") return juce::String (p);
            return owner + "." + juce::String (p);
        };
        sol::table self = lua.create_table();
        self.set_function ("set", [this, prefix] (std::string p, sol::object v) { host->setValue (prefix (p), solToVar (v), juce::var()); });
        self.set_function ("get", [this, prefix] (std::string p, sol::optional<std::string> form)
            { return varToSol (lua, host->getValue (prefix (p), form ? juce::String (*form) : juce::String ("value"))); });
        env["self"] = self;

        const Watchdog guard (*this); // top-level statements obey the instruction budget too
        auto result = lua.safe_script (def.source.toStdString(), env, sol::script_pass_on_error);
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
        auto r = f (varToSol (lua, payload));
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
    struct Listener { juce::String target, event; sol::protected_function fn; };

    void reportPF (const sol::protected_function_result& r)
    {
        sol::error e = r; juce::Logger::writeToLog (juce::String ("[lua block] ") + e.what());
    }

    sol::state lua;
    std::map<juce::String, sol::environment> envs;
    std::vector<Listener> listeners;
    ScriptHostApi* host = nullptr;
    int watchdogDepth = 0;
};

} // namespace

std::unique_ptr<ScriptEngine> createLuaEngine() { return std::make_unique<LuaScriptEngine>(); }

} // namespace ceditor::scripting
