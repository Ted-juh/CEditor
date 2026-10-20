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

/** set()'s third argument for the host: its options table, as { transmit }, or the value form as
    text, which the host reads as the WebView runtime does (BridgeScriptHost::setValue). Taken as a
    table only, text never reached the host, so set("cutoff", 0.5, "normalizedValue") wrote 0.5 as
    it was, and a form that is not one was dropped without a word. */
juce::var setOptionsOf (const sol::object& opts)
{
    if (opts.get_type() == sol::type::string) return juce::var (juce::String (opts.as<std::string>()));
    if (opts.get_type() != sol::type::table) return {};
    auto* o = new juce::DynamicObject();
    sol::object t = opts.as<sol::table>()["transmit"];
    if (t.valid() && t.get_type() == sol::type::boolean) o->setProperty ("transmit", t.as<bool>());
    return juce::var (o);
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
-- A whole number prints as one ("9", not Lua's "9.0" for a float), as it does in the other runtimes.
local function __shown(n)
  if type(n) == "number" and n == math.floor(n) and math.abs(n) < 2 ^ 53 then return string.format("%d", math.floor(n)) end
  return tostring(n)
end
-- How a refusal shows a value the script passed, in the same words in every runtime (the WebView
-- runtime's shownValue): "nothing" for nil, NaN and Infinity as JavaScript writes them, a whole
-- number without ".0", text in quotes, "a list" for a table.
local function __shownValue(v)
  if v == nil then return "nothing" end
  local t = type(v)
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v then return "NaN" end
    if v == math.huge then return "Infinity" end
    if v == -math.huge then return "-Infinity" end
    return __shown(v)
  end
  if t == "string" then return '"' .. v .. '"' end
  if t == "function" then return "a function" end
  return "a list"
end
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
  else
    -- A shape the list does not have used to return v in SILENCE, which reads as a curve that does
    -- nothing rather than as a name that was never applied.
    if shape ~= "linear" and shape ~= "" then
      log("curve(v, \"" .. tostring(shape) .. "\"): unknown shape — using linear. The names are "
          .. "\"linear\", \"exp\", \"log\" and \"s\"; for any other shape use map(v, points).")
    end
    return v
  end
end
-- wrap(v, lo, hi) — bring a value round into a HALF-OPEN range, so wrap(12, 0, 12) is 0.
--
-- This exists because the five runtimes disagree about `%`. (-1) % 12 is 11 here and in Python, and
-- -1 in JavaScript, C++, C# and Java — so the ordinary way to write a pitch class already gives two
-- different answers depending on which engine the panel is running in. The floored form below is
-- written identically in every prelude, which is the only thing that stops that being true.
function wrap(v, lo, hi)
  local a, b, n = tonumber(lo) or 0, tonumber(hi) or 0, tonumber(v) or 0
  local span = b - a
  -- An empty or inverted range has exactly one answer.
  if not (span > 0) then return a end
  return a + (((n - a) % span) + span) % span
end
-- A point's x, y, curve and tension as written: by its names, and failing those by its numbered
-- entries, counted from 1 as Lua counts, or from 0 when the table has an entry 0. The WebView
-- runtime counts the same way (animEnvelope.js envelopePointParts), so a point is the same point
-- in the editor and here.
local function __pointParts(p)
  local from = 1
  if p[0] ~= nil then from = 0 end
  local x, y, c, t = p.x, p.y, p.curve, p.tension
  if x == nil then x = p[from] end
  if y == nil then y = p[from + 1] end
  if c == nil then c = p[from + 2] end
  if t == nil then t = p[from + 3] end
  return x, y, c, t
end
-- {{x, y}, …} sorted by x. Accepts pairs and {x=, y=} tables, so a panel can write either.
local function __points(points)
  local out = {}
  if type(points) == "table" then
    for _, p in ipairs(points) do
      local x, y, c, t
      if type(p) == "table" then x, y, c, t = __pointParts(p) end
      x, y = tonumber(x), tonumber(y)
      -- The third element is the arrival index: table.sort is UNSTABLE (unlike JS sort), and a
      -- step curve's two points at the same x must keep their written order or the "steps TO"
      -- rule reads the wrong side. The fourth and fifth are the curve of the segment that ends at
      -- the point, and its tension.
      if x ~= nil and y ~= nil then out[#out + 1] = { x, y, #out + 1, c, t } end
    end
  end
  table.sort(out, function(p, q)
    if p[1] ~= q[1] then return p[1] < q[1] end
    return p[3] < q[3]
  end)
  return out
end
-- map(v, points) — straight lines through breakpoints: a response curve of the panel's own shape,
-- which is what curve()'s closed set of four names cannot express. Outside the outermost points the
-- value is HELD rather than extrapolated, because a curve drawn between 0 and 1 that runs away past
-- 1 is never what the author drew.
function mapCurve(v, points)
  local list = __points(points)
  if #list == 0 then return tonumber(v) or 0 end
  local n = tonumber(v)
  if n == nil then return list[1][2] end
  -- An exact hit on a breakpoint takes the LAST point with that x. That is what makes two points
  -- sharing an x a STEP rather than a divide by zero, and it settles which side of the step the
  -- breakpoint itself belongs to — the value it steps TO.
  for i = #list, 1, -1 do if list[i][1] == n then return list[i][2] end end
  if n < list[1][1] then return list[1][2] end
  local last = list[#list]
  if n > last[1] then return last[2] end
  for i = 2, #list do
    local x0, y0 = list[i - 1][1], list[i - 1][2]
    local x1, y1 = list[i][1], list[i][2]
    if n < x1 and x1 ~= x0 then
      -- The segment's own shape, from the point it ends at, as the WebView runtime's mapCurve and
      -- the Envelope component take it. Read for straight lines alone, a point's curve played as a
      -- line here and as a curve in the editor.
      if list[i][4] ~= nil then
        return y0 + shapeCurve((n - x0) / (x1 - x0), list[i][4], list[i][5]) * (y1 - y0)
      end
      return y0 + (n - x0) * (y1 - y0) / (x1 - x0)
    end
  end
  return last[2]
end
local function __numbers(values)
  local out = {}
  if type(values) == "table" then
    for _, x in ipairs(values) do
      local n = tonumber(x)
      if n ~= nil then out[#out + 1] = n end
    end
  end
  return out
end
-- quantizeTo(v, values) — nearest entry in a LIST rather than a regular step. A tie goes to the
-- LOWER value, so the answer never depends on how the two distances happened to round.
function quantizeTo(v, values)
  local list = __numbers(values)
  if #list == 0 then return tonumber(v) or 0 end
  local n = tonumber(v)
  if n == nil then return list[1] end
  local best, bestD = list[1], math.abs(n - list[1])
  for _, c in ipairs(list) do
    local d = math.abs(n - c)
    if d < bestD or (d == bestD and c < best) then best, bestD = c, d end
  end
  return best
end
-- dbToGain / gainToDb. Neither Lua nor JavaScript has them, and a level control that reads in dB
-- and sends a linear value needs them on every move. A gain of zero or less is the 24-bit noise
-- floor rather than negative infinity, which is a number nothing here can put on a label.
local __MIN_DB = -144
function dbToGain(db) return 10 ^ ((tonumber(db) or 0) / 20) end
function gainToDb(gain)
  local g = tonumber(gain) or 0
  if g <= 0 then return __MIN_DB end
  local db = 20 * math.log(g, 10)
  if db < __MIN_DB then return __MIN_DB end
  return db
end
-- The rest of the arithmetic a synth panel actually does. Nothing here duplicates the language's
-- own scalar maths (math.min/max/abs/floor all exist); what IS here is domain-specific,
-- list-shaped (math.min takes varargs, which is unusable over a long table), or has to be
-- identical in five runtimes to be worth anything.
local function __num(v, fallback) local x = tonumber(v) if x == nil then return fallback or 0 end return x end
-- norm/denorm CLAMP. scale(v, lo, hi, 0, 1) is the hand-rolled version and does not, so a value
-- past the end came out past 1 and stayed wrong all the way down the chain.
function norm(v, lo, hi)
  local a, b = __num(lo), __num(hi)
  if a == b then return 0 end
  local t = (__num(v) - a) / (b - a)
  if t < 0 then return 0 elseif t > 1 then return 1 end
  return t
end
function denorm(t, lo, hi)
  local a, b, x = __num(lo), __num(hi), __num(t)
  if x < 0 then x = 0 elseif x > 1 then x = 1 end
  return a + x * (b - a)
end
function bipolar(t) return __num(t) * 2 - 1 end
function unipolar(v) return (__num(v) + 1) / 2 end
-- fold comes back OFF the end instead of round it. wrap() jumps top to bottom, which is right for
-- a pitch class and wrong for a modulation depth — a fold reflects, so movement stays continuous.
function fold(v, lo, hi)
  local a, b = __num(lo), __num(hi)
  local span = b - a
  if not (span > 0) then return a end
  local t = math.abs(__num(v) - a) % (span * 2)
  if t > span then return a + span * 2 - t end
  return a + t
end
-- 0..1 to one of `count`, zero-based. The hand-rolled floor(t * count) returns `count` itself at
-- exactly 1.0 — one past the end of the list it addresses, and only when a knob is fully up.
function indexOfRange(t, count)
  local n = math.floor(__num(count))
  if n <= 0 then return 0 end
  local i = math.floor(norm(t, 0, 1) * n)
  if i >= n then return n - 1 end
  return i
end
-- The Crossfader component's three laws, which a script could not compute. equalPower is the one
-- that matters: a linear fade between two sounds dips in the middle, audibly.
function crossfade(a, b, t, law)
  local x, from, to = norm(t, 0, 1), __num(a), __num(b)
  law = tostring(law or "linear"):lower()
  if law == "equalpower" then
    local angle = x * math.pi / 2
    return from * math.cos(angle) + to * math.sin(angle)
  elseif law == "sharp" then
    local g = x * x * (3 - 2 * x)
    return from * (1 - g) + to * g
  end
  return from + (to - from) * x
end
-- A rate limit with no state of its own, so it works from any handler without a timer. ce.anim owns
-- motion the RUNTIME drives; this is the one a script drives itself, per incoming message.
function approach(current, target, maxStep)
  local from, to, step = __num(current), __num(target), math.abs(__num(maxStep))
  if not (step > 0) then return to end
  local delta = to - from
  if math.abs(delta) <= step then return to end
  if delta > 0 then return from + step end
  return from - step
end
function roundTo(v, decimals)
  local d = math.floor(__num(decimals))
  if d < 0 then d = 0 end
  local f = 10 ^ d
  return round(__num(v) * f) / f
end
function almost(a, b, epsilon)
  local tol = math.abs(__num(epsilon, 1e-9))
  if tol == 0 then tol = 1e-9 end
  return math.abs(__num(a) - __num(b)) <= tol
end
local function __nums(values)
  local out = {}
  if type(values) == "table" then
    for _, x in ipairs(values) do
      local n = tonumber(x)
      if n ~= nil then out[#out + 1] = n end
    end
  end
  return out
end
function minOf(values)
  local l = __nums(values)
  if #l == 0 then return nil end
  local best = l[1]
  for _, n in ipairs(l) do if n < best then best = n end end
  return best
end
function maxOf(values)
  local l = __nums(values)
  if #l == 0 then return nil end
  local best = l[1]
  for _, n in ipairs(l) do if n > best then best = n end end
  return best
end
function sumOf(values)
  local total = 0
  for _, n in ipairs(__nums(values)) do total = total + n end
  return total
end
function meanOf(values)
  local l = __nums(values)
  if #l == 0 then return nil end
  return sumOf(l) / #l
end
-- Morph one list into another, which is what a snapshot morph IS. The SHORTER list decides the
-- length: padding with zeros would drag the missing entries to nothing, and on a patch that is a
-- set of parameters slammed to their minimum.
function blend(a, b, t)
  local from, to, x = __nums(a), __nums(b), __num(t)
  local n = math.min(#from, #to)
  local out = {}
  for i = 1, n do out[i] = from[i] + (to[i] - from[i]) * x end
  return out
end
-- Every random below draws a FIXED number of times, so a seed replays the sequence whichever of
-- them a panel used.
function randomFloat(lo, hi)
  local a, b = __num(lo), __num(hi, 1)
  return a + random() * (b - a)
end
-- A bell rather than a slab: humanising velocity with a uniform random is what sounds mechanical.
-- Box-Muller, always two draws — it deliberately does NOT cache the second value the way the
-- textbook version does, because a varying draw count would break seed replay.
function randomGaussian(mean, sd)
  local u1 = random()
  if u1 < 1e-12 then u1 = 1e-12 end
  local u2 = random()
  local z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
  return __num(mean) + z * __num(sd, 1)
end
-- Folded rather than clamped: a walk that clamps sticks to the end it hit and stops moving.
function randomWalk(current, step, lo, hi)
  -- nextValue, not next: shadowing Lua's builtin `next` inside the function is legal and reads
  -- like a bug to anyone who scans past it.
  local nextValue = __num(current) + (random() * 2 - 1) * math.abs(__num(step))
  if lo == nil or hi == nil then return nextValue end
  return fold(nextValue, __num(lo), __num(hi))
end
function randomBool(chance) return random() < __num(chance, 0.5) end
function shuffle(values)
  local out = {}
  if type(values) == "table" then for i, x in ipairs(values) do out[i] = x end end
  for i = #out, 2, -1 do
    local j = math.floor(random() * i) + 1
    out[i], out[j] = out[j], out[i]
  end
  return out
end
-- Geometry, in ce.draw's convention: DEGREES, 0 at twelve o'clock, clockwise. Rebuilding that from
-- atan2 by hand is where a knob pointer ends up running backwards or a quadrant out.
function toDegrees(radians) return __num(radians) * 180 / math.pi end
function toRadians(degrees) return __num(degrees) * math.pi / 180 end
function distance(x1, y1, x2, y2)
  local dx, dy = __num(x2) - __num(x1), __num(y2) - __num(y1)
  return math.sqrt(dx * dx + dy * dy)
end
function angleOf(x1, y1, x2, y2)
  local dx, dy = __num(x2) - __num(x1), __num(y2) - __num(y1)
  local a = toDegrees(math.atan(dx, -dy))
  if a < 0 then return a + 360 end
  return a
end
function polar(angle, radius)
  local a, r = toRadians(__num(angle)), __num(radius)
  return { x = math.sin(a) * r, y = -math.cos(a) * r }
end
-- The transforms the Properties panel itself applies, matched exactly rather than approximated.
-- The panel does not only store constants; it CONFIGURES value transforms, and a script could not
-- reproduce any of them — so it could not compute what its own panel was about to display.
-- shape() is NOT curve(): curve() is the older family (exp = v^2, log = sqrt v, s-curve spelled
-- "s"), while the panel spells it "scurve", has a "hold", and computes exp/log from a tension
-- exponent whose default is 1.6 rather than 0. Odd in the app, and matched here on purpose.
function shapeCurve(v, curve, tension)
  local t = norm(v, 0, 1)
  local ten = __num(tension, 0)
  if ten == 0 then ten = 1.6 end
  local k = 1 + math.max(0, ten)
  local name = tostring(curve)
  if name == "exp" then return t ^ k
  elseif name == "log" then return 1 - (1 - t) ^ k
  elseif name == "scurve" or name == "s" then return t * t * (3 - 2 * t)
  elseif name == "hold" then if t >= 1 then return 1 else return 0 end
  end
  return t
end
-- The Expression Router's input shaping. Below the threshold the value is zero and the REMAINING
-- range rescales to fill 0..1, so response starts at the edge of the dead zone rather than
-- stepping up from it — the rescale is the part a hand-rolled version leaves out.
function deadzone(v, amount, invert)
  local x = norm(v, 0, 1)
  if invert == true then x = 1 - x end
  local dz = norm(amount, 0, 1)
  if dz > 0 then
    if x <= dz then x = 0 else x = (x - dz) / (1 - dz) end
  end
  return norm(x, 0, 1)
end
-- The inverse-distance blend a Timbre Space and a Preset Constellation use, normalised to sum to 1.
function weightsFor(points, x, y, power)
  local out, raw, total = {}, {}, 0
  if type(points) ~= "table" then return out end
  local px, py = norm(x, 0, 1), norm(y, 0, 1)
  local p = math.max(0.5, __num(power, 2))
  for i, pt in ipairs(points) do
    local dx, dy = __num(pt.x) - px, __num(pt.y) - py
    local w = 1 / ((dx * dx + dy * dy) ^ (p / 2) + 1e-6)
    raw[i] = w
    total = total + w
  end
  for i, w in ipairs(raw) do
    if total > 0 then out[i] = w / total else out[i] = 1 / #raw end
  end
  return out
end
-- A weighted average: what weightsFor is for, and what a morph pad IS.
function blendBy(values, weights)
  local v, w = __nums(values), __nums(weights)
  local n = math.min(#v, #w)
  local sum, total = 0, 0
  for i = 1, n do sum = sum + v[i] * w[i] total = total + w[i] end
  if total > 0 then return sum / total end
  return 0
end
-- The 0..1 stop positions a slider's scale is drawn from. Reinventing the minor spacing puts the
-- minors visibly out of step with the ones the app draws beside them.
function tickStops(major, minor)
  local majorCount = math.max(2, round(__num(major, 11)))
  local minorCount = math.max(0, round(__num(minor, 0)))
  local out = { major = {}, minor = {} }
  for index = 0, majorCount - 1 do
    local normalized = index / (majorCount - 1)
    out.major[#out.major + 1] = normalized
    if index < majorCount - 1 and minorCount > 0 then
      for m = 1, minorCount do
        out.minor[#out.minor + 1] = normalized + (m / (minorCount + 1)) * (1 / (majorCount - 1))
      end
    end
  end
  return out
end
-- Where a level sits on a dB meter. gainToDb says how many dB it is; this says how far up it goes,
-- which is the question a script drawing a meter is asking.
function dbPosition(fraction, floorDb, ceilDb)
  local frac = norm(fraction, 0, 1)
  local floor, ceil = __num(floorDb, -60), __num(ceilDb, 6)
  if ceil == floor then return 0 end
  local db = 20 * math.log(math.max(frac, 1e-4), 10)
  return norm((db - floor) / (ceil - floor), 0, 1)
end
-- Taming what arrives on the wire. A controller does not send tidy numbers: it jitters, crosses a
-- threshold repeatedly, spikes once, and has already been through a taper.
-- smooth is NOT approach: approach moves a FIXED step (a rate limit), this moves a PROPORTION of
-- what is left, which settles fast then creeps. It is lerp underneath; the reasons it is a member
-- are the coefficient clamp and that it ARRIVES. A one-pole is asymptotic, so left alone it sits
-- at 0.9999 forever and a control smoothed with it transmits forever.
function smooth(current, target, coefficient, epsilon)
  local from, to = __num(current), __num(target)
  local k = norm(coefficient, 0, 1)
  local tol = math.abs(__num(epsilon, 1e-4))
  if tol == 0 then tol = 1e-4 end
  if math.abs(to - from) <= tol then return to end
  return from + (to - from) * k
end
-- A Schmitt trigger: on at `high`, off at `low`, HOLDS between. A plain threshold chatters - a CC
-- hovering on the line flips a switch dozens of times a second, and on a bound control that is
-- dozens of MIDI messages a second.
function hysteresis(value, on, low, high)
  local v, lo, hi = __num(value), __num(low), __num(high)
  if lo > hi then lo, hi = hi, lo end
  if on == true then return v > lo end
  return v >= hi
end
-- A mean SMEARS a spike across the result; a median rejects it. On a noisy controller reading that
-- is the difference between a glitch you can hear and one you cannot.
function median(values)
  local l = __nums(values)
  if #l == 0 then return nil end
  table.sort(l)
  local mid = math.floor(#l / 2)
  if #l % 2 == 1 then return l[mid + 1] end
  return (l[mid] + l[mid + 1]) / 2
end
-- The inverse of shape(), for going device -> panel THROUGH a taper. The same k as shape(),
-- including the 1.6 default: an inverse computed against a different exponent inverts nothing.
-- A Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`. The app's own
-- algorithm (utils/arpLayout.js). The Arpeggiator has used it for its rest pattern since it
-- shipped, and a script could set the Arp's euclid settings but never COMPUTE a pattern - so a step
-- sequencer, a gate or an LFO mask had to reinvent it, and the hand-rolled version is almost never
-- the stable spread. Bresenham rather than recursive Bjorklund: same output, no recursion to port
-- five times.
function euclid(steps, pulses, rotation)
  local n = math.max(1, math.min(64, round(__num(steps, 1))))
  local k = math.max(0, math.min(n, round(__num(pulses, 0))))
  local out = {}
  if k <= 0 then for i = 1, n do out[i] = false end return out end
  if k >= n then for i = 1, n do out[i] = true end return out end
  local bucket = 0
  for i = 1, n do
    bucket = bucket + k
    if bucket >= n then bucket = bucket - n out[i] = true else out[i] = false end
  end
  local rot = ((round(__num(rotation, 0)) % n) + n) % n
  if rot == 0 then return out end
  local turned = {}
  for i = 1, n do turned[i] = out[((i - 1 + rot) % n) + 1] end
  return turned
end
function unshape(y, curve, tension)
  local v = norm(y, 0, 1)
  local ten = __num(tension, 0)
  if ten == 0 then ten = 1.6 end
  local k = 1 + math.max(0, ten)
  local name = tostring(curve)
  if name == "exp" then return v ^ (1 / k)
  elseif name == "log" then return 1 - (1 - v) ^ (1 / k)
  -- The closed-form inverse of smoothstep. Solving the cubic numerically would be slower and would
  -- not agree to the last bit across five runtimes.
  elseif name == "scurve" or name == "s" then return 0.5 - math.sin(math.asin(1 - 2 * v) / 3)
  -- hold is a step: many inputs give one output, so this returns the EARLIEST that produces it,
  -- which is the only answer that is a function.
  elseif name == "hold" then if v >= 1 then return 1 else return 0 end
  end
  return v
end
-- @module ce.math
-- A seeded xorshift32, masked to 32 bits at every step and written identically in every prelude.
-- Seeded is the whole point: the language's own math.random cannot promise the same sequence in
-- five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
-- different in the editor and in the export.
local __RND_DEFAULT = 0x9E3779B9
-- ONE GENERATOR PER (SCRIPT, STREAM). This prelude runs ONCE into shared globals, so a single
-- upvalue here was one generator for every Lua script in the panel — while the JS and Python
-- engines give each script its own engine or namespace and were already per script. A panel with
-- two generative scripts therefore behaved differently depending on the language it was written
-- in, and differently again between the editor and the export. `__scriptId` is set by the engine
-- around every load and dispatch, which is what lets a global function tell the scripts apart.
local __rndStates = {}
local __streamOverride = nil
local function __rndKey()
  return tostring(__scriptId or "") .. "\0" .. (__streamOverride or "")
end
function randomSeed(n)
  local v = math.floor(tonumber(n) or 0) & 0xFFFFFFFF
  -- 0 is a DEAD state for xorshift — it would return zero forever — so it means "the default"
  -- rather than "a generator that never moves".
  if v == 0 then v = __RND_DEFAULT end
  __rndStates[__rndKey()] = v
end
-- Draws inside the block come from a generator of their own, so two generative elements in one
-- script stop interfering. A block rather than a name argument on nine verbs, the shape routeMidi
-- already uses: the stream is a decision about a RUN of draws. Restored in a pcall-guarded finally
-- so a throw inside cannot leave every later draw pointed at the wrong stream.
function randomStream(name, fn)
  if type(fn) ~= "function" then
    log("stream(name, fn) needs a block to run — nothing was drawn")
    return
  end
  local previous = __streamOverride
  __streamOverride = tostring(name or "")
  local ok, err = pcall(fn)
  __streamOverride = previous
  if not ok then error(err, 0) end
end
function random(lo, hi)
  local key = __rndKey()
  local x = __rndStates[key] or __RND_DEFAULT
  x = (x ~ (x << 13)) & 0xFFFFFFFF
  x = x ~ (x >> 17)
  x = (x ~ (x << 5)) & 0xFFFFFFFF
  __rndStates[key] = x
  local r = x / 4294967296.0
  if lo == nil or hi == nil then return r end
  local a, b = math.floor(tonumber(lo) or 0), math.floor(tonumber(hi) or 0)
  local low, high = math.min(a, b), math.max(a, b)
  -- Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
  return low + math.floor(r * (high - low + 1))
end
-- randomChoice(values [, weights]) — a pick from the SEEDED generator, so a randomised patch
-- replays. Exactly ONE number is drawn in every branch, weighted or not: a weighted pick consuming
-- a different amount of the sequence would change what everything after it picked, and "the same
-- seed replays the same sequence" would quietly stop being true.
function randomChoice(values, weights)
  if type(values) ~= "table" or #values == 0 then return nil end
  local r = random()
  local total, w = 0, {}
  if type(weights) == "table" then
    for i, x in ipairs(weights) do
      local n = tonumber(x) or 0
      if n < 0 then n = 0 end
      w[i] = n
      total = total + n
    end
  end
  if not (total > 0) then return values[math.floor(r * #values) + 1] end
  local ticket = r * total
  for i = 1, #values do
    ticket = ticket - (w[i] or 0)
    if ticket < 0 then return values[i] end
  end
  return values[#values]
end

-- @module ce.math
-- Colour arithmetic. The app's own (utils/colorHelpers.js, utils/colorMath.js), ported for the same
-- reason every table here is: a script lightening a colour and the border renderer lightening the
-- same colour have to agree, or a script-drawn highlight sits a shade off the one beside it.
--
-- In takes what a colour property takes, read as if what the property would store had been given:
-- "RRGGBB", "AARRGGBB" or "#RRGGBB" as written (6 hex digits are RRGGBB, 8 are AARRGGBB with the
-- alpha set aside, one leading "#" either way), and CSS's short forms written out first, as the
-- WebView writes them out (scriptColours.js's storedColour): "#RGB", a name from the generated
-- table below, rgb(), rgba(), hsl() and hsla(), so "red" is "#FF0000" and rgba(255, 0, 0, 0.5) is
-- "80FF0000". Out is "#RRGGBB", which CSS, SVG and a panel property all accept. The ONE exception
-- is alpha(), which returns the panel's AARRGGBB: CSS's #RRGGBBAA is the same bytes the other way
-- round, and that is a trap worth one asymmetry to avoid.
--
-- Anything else is refused, where it used to be read from its last six characters ("x5B9BD5" and
-- the number 0xFF0000 were colours). So is an amount outside 0..1, which used to be used as it was
-- (lighten by 40 was white) or clamped (alpha 128 was solid). In the words of the WebView runtime's
-- colourChannels and colourUnit (scripting/scriptColours.js), which scriptPreludeAgreement.test.js
-- checks; __realNumber is its realNumber, and ce.anim's targets are read by it too.
-- BEGIN GENERATED colour names — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- @module ce.math
-- CSS's named colours (scriptColours.CSS_NAMED_COLOURS), as RRGGBB: what a colour
-- property writes "red" out as, and what the ce.math colour helpers read it as.
__CE_CSS_COLOURS = {
  aliceblue = "F0F8FF", antiquewhite = "FAEBD7", aqua = "00FFFF", aquamarine = "7FFFD4",
  azure = "F0FFFF", beige = "F5F5DC", bisque = "FFE4C4", black = "000000",
  blanchedalmond = "FFEBCD", blue = "0000FF", blueviolet = "8A2BE2", brown = "A52A2A",
  burlywood = "DEB887", cadetblue = "5F9EA0", chartreuse = "7FFF00", chocolate = "D2691E",
  coral = "FF7F50", cornflowerblue = "6495ED", cornsilk = "FFF8DC", crimson = "DC143C",
  cyan = "00FFFF", darkblue = "00008B", darkcyan = "008B8B", darkgoldenrod = "B8860B",
  darkgray = "A9A9A9", darkgreen = "006400", darkgrey = "A9A9A9", darkkhaki = "BDB76B",
  darkmagenta = "8B008B", darkolivegreen = "556B2F", darkorange = "FF8C00", darkorchid = "9932CC",
  darkred = "8B0000", darksalmon = "E9967A", darkseagreen = "8FBC8F", darkslateblue = "483D8B",
  darkslategray = "2F4F4F", darkslategrey = "2F4F4F", darkturquoise = "00CED1",
  darkviolet = "9400D3", deeppink = "FF1493", deepskyblue = "00BFFF", dimgray = "696969",
  dimgrey = "696969", dodgerblue = "1E90FF", firebrick = "B22222", floralwhite = "FFFAF0",
  forestgreen = "228B22", fuchsia = "FF00FF", gainsboro = "DCDCDC", ghostwhite = "F8F8FF",
  gold = "FFD700", goldenrod = "DAA520", gray = "808080", green = "008000", greenyellow = "ADFF2F",
  grey = "808080", honeydew = "F0FFF0", hotpink = "FF69B4", indianred = "CD5C5C", indigo = "4B0082",
  ivory = "FFFFF0", khaki = "F0E68C", lavender = "E6E6FA", lavenderblush = "FFF0F5",
  lawngreen = "7CFC00", lemonchiffon = "FFFACD", lightblue = "ADD8E6", lightcoral = "F08080",
  lightcyan = "E0FFFF", lightgoldenrodyellow = "FAFAD2", lightgray = "D3D3D3",
  lightgreen = "90EE90", lightgrey = "D3D3D3", lightpink = "FFB6C1", lightsalmon = "FFA07A",
  lightseagreen = "20B2AA", lightskyblue = "87CEFA", lightslategray = "778899",
  lightslategrey = "778899", lightsteelblue = "B0C4DE", lightyellow = "FFFFE0", lime = "00FF00",
  limegreen = "32CD32", linen = "FAF0E6", magenta = "FF00FF", maroon = "800000",
  mediumaquamarine = "66CDAA", mediumblue = "0000CD", mediumorchid = "BA55D3",
  mediumpurple = "9370DB", mediumseagreen = "3CB371", mediumslateblue = "7B68EE",
  mediumspringgreen = "00FA9A", mediumturquoise = "48D1CC", mediumvioletred = "C71585",
  midnightblue = "191970", mintcream = "F5FFFA", mistyrose = "FFE4E1", moccasin = "FFE4B5",
  navajowhite = "FFDEAD", navy = "000080", oldlace = "FDF5E6", olive = "808000",
  olivedrab = "6B8E23", orange = "FFA500", orangered = "FF4500", orchid = "DA70D6",
  palegoldenrod = "EEE8AA", palegreen = "98FB98", paleturquoise = "AFEEEE",
  palevioletred = "DB7093", papayawhip = "FFEFD5", peachpuff = "FFDAB9", peru = "CD853F",
  pink = "FFC0CB", plum = "DDA0DD", powderblue = "B0E0E6", purple = "800080",
  rebeccapurple = "663399", red = "FF0000", rosybrown = "BC8F8F", royalblue = "4169E1",
  saddlebrown = "8B4513", salmon = "FA8072", sandybrown = "F4A460", seagreen = "2E8B57",
  seashell = "FFF5EE", sienna = "A0522D", silver = "C0C0C0", skyblue = "87CEEB",
  slateblue = "6A5ACD", slategray = "708090", slategrey = "708090", snow = "FFFAFA",
  springgreen = "00FF7F", steelblue = "4682B4", tan = "D2B48C", teal = "008080", thistle = "D8BFD8",
  tomato = "FF6347", turquoise = "40E0D0", violet = "EE82EE", wheat = "F5DEB3", white = "FFFFFF",
  whitesmoke = "F5F5F5", yellow = "FFFF00", yellowgreen = "9ACD32",
}
-- END GENERATED colour names
local __CFORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS colour name, rgb() or hsl()'
-- A number as JavaScript prints it, for the numbers a script writes: whole ones without ".0".
local function __cshown(n)
  if n == math.floor(n) and math.abs(n) < 2 ^ 53 then return string.format("%d", math.floor(n)) end
  return tostring(n)
end
-- n / 100 to four places with the trailing zeros dropped, as Number(x.toFixed(4)) prints it.
local function __cfour(x)
  local s = string.format("%.4f", x)
  s = string.gsub(s, "0+$", "")
  s = string.gsub(s, "%.$", "")
  return s
end
local function __chint(v)
  if type(v) == "number" then
    if v ~= v or v ~= math.floor(v) or v < 0 or v > 0xFFFFFFFF then return "" end
    local text
    if v <= 0xFFFFFF then text = string.format("#%06X", math.floor(v)) else text = string.format("%08X", math.floor(v)) end
    return " As text, " .. __cshown(v) .. ' is "' .. text .. '".'
  end
  if type(v) ~= "string" then return "" end
  local p, d = string.match(v, "^(#?)(%x+)$")
  if d == nil or (#d ~= 3 and #d ~= 4) then return "" end
  d = string.upper(d)
  local function two(i) local c = string.sub(d, i, i) return c .. c end
  if #d == 3 then return ' Write "' .. p .. two(1) .. two(2) .. two(3) .. '".' end
  return ' Write "' .. two(4) .. two(1) .. two(2) .. two(3) .. '".'
end
local function __realNumber(v)
  if type(v) == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return nil end
    return v
  end
  if type(v) ~= "string" then return nil end
  local t = string.match(v, "^%s*(.-)%s*$")
  local mantissa = string.match(t, "^(.-)[eE][+-]?%d+$") or t
  if string.match(mantissa, "^[+-]?%d+%.?%d*$") == nil and string.match(mantissa, "^[+-]?%.%d+$") == nil then
    return nil
  end
  local n = tonumber(t)
  if n == nil or n ~= n or n == math.huge or n == -math.huge then return nil end
  return n
end
local function __cunit(verb, what, v, fallback)
  if v == nil and fallback ~= nil then return fallback end
  local n = __realNumber(v)
  if n ~= nil and n >= 0 and n <= 1 then return n end
  local shown
  if v == nil then shown = "none was given"
  elseif type(v) == "string" then shown = '"' .. v .. '" is not'
  elseif type(v) == "number" and __realNumber(v) ~= nil then shown = __cshown(v) .. " is not"
  else shown = "the value given is not" end
  local hint = ""
  if n ~= nil and n / 100 >= 0 and n / 100 <= 1 then
    hint = " If you meant " .. __cshown(n) .. " out of 100, write " .. __cfour(n / 100) .. "."
  end
  logError(verb .. ": " .. what .. " is a number from 0 to 1, and " .. shown .. ", so there is no answer." .. hint)
  return nil
end
-- CSS's short forms, read as scriptColours.js reads them (cssChannels, panelFormOf, longForm and
-- cssHint). It reads them with four regular expressions, which Lua patterns cannot write (they have
-- no alternation and no optional groups), so this reads the same grammar a token at a time. Every
-- number goes through what JavaScript does to it: Number(), Math.round (a half goes up, toward
-- +infinity), and `%`, which keeps the sign of what it divides, as math.fmod does and Lua's % does not.
--
-- What JavaScript calls white space, for trim() and \s: the six ASCII ones and the Unicode spaces,
-- as UTF-8. The length of the one that starts at i, or 0.
local function __cwsAt(s, i)
  local c, c2, c3 = string.byte(s, i, i + 2)
  if c == nil then return 0 end
  if c == 32 or (c >= 9 and c <= 13) then return 1 end
  if c == 194 then if c2 == 160 then return 2 end return 0 end
  if c3 == nil then return 0 end
  if c == 226 and c2 == 128 and ((c3 >= 128 and c3 <= 138) or c3 == 168 or c3 == 169 or c3 == 175) then return 3 end
  if (c == 226 and c2 == 129 and c3 == 159) or (c == 225 and c2 == 154 and c3 == 128)
      or (c == 227 and c2 == 128 and c3 == 128) or (c == 239 and c2 == 187 and c3 == 191) then
    return 3
  end
  return 0
end
local function __cskip(s, i)
  local n = __cwsAt(s, i)
  while n > 0 do i = i + n; n = __cwsAt(s, i) end
  return i
end
-- JavaScript's trim().
local function __ctrim(s)
  local i, j = __cskip(s, 1), #s
  while j >= i do
    if __cwsAt(s, j) == 1 then j = j - 1
    elseif j - 1 >= i and __cwsAt(s, j - 1) == 2 then j = j - 2
    elseif j - 2 >= i and __cwsAt(s, j - 2) == 3 then j = j - 3
    else break end
  end
  return string.sub(s, i, j)
end
-- JavaScript's Math.round, which Lua does not have: a half goes up, so 2.5 is 3 and -2.5 is -2.
local function __cround(x)
  local r = math.floor(x)
  if x - r >= 0.5 then return r + 1 end
  return r
end
local function __cclamp(v, lo, hi) return math.min(hi, math.max(lo, v)) end
-- A number as the expressions write one, [+-] digits [. digits] [e [+-] digits], starting at i:
-- its value as a float and where it ends, or nil. tonumber reads this grammar as Number() does.
local function __cnumAt(s, i)
  local _, e = string.find(s, "^[+-]?%d+%.?%d*", i)
  if e == nil then _, e = string.find(s, "^[+-]?%.%d+", i) end
  if e == nil then return nil end
  local _, x = string.find(s, "^[eE][+-]?%d+", e + 1)
  e = x or e
  return tonumber(string.sub(s, i, e)) * 1.0, e + 1
end
-- rgb(), rgba(), hsl() or hsla(), with commas or with spaces and a slash before the alpha, as the
-- four expressions read them: r, g, b, a, or nil. The function and a hue's unit in any case; three
-- values, and a fourth after "," or "/"; "%" on any rgb value, and on both of hsl's with commas.
local function __cfunction(s)
  local l = string.lower(s)
  local name = string.match(l, "^(%a+)%(")
  local hsl = name == "hsl" or name == "hsla"
  if not hsl and name ~= "rgb" and name ~= "rgba" then return nil end
  local i = __cskip(l, #name + 2)
  local v, p, unit, legacy = {}, {}, 1, false
  for k = 1, 3 do
    v[k], i = __cnumAt(l, i)
    if v[k] == nil then return nil end
    if hsl and k == 1 then
      local u3, u4 = string.sub(l, i, i + 2), string.sub(l, i, i + 3)
      if u3 == "deg" then unit = 1; i = i + 3
      elseif u4 == "grad" then unit = 0.9; i = i + 4
      elseif u3 == "rad" then unit = 180 / math.pi; i = i + 3
      elseif u4 == "turn" then unit = 360; i = i + 4 end
    elseif string.sub(l, i, i) == "%" then p[k] = true; i = i + 1
    elseif hsl and legacy then return nil end
    if k < 3 then
      local j = __cskip(l, i)
      if k == 1 then legacy = string.sub(l, j, j) == "," end
      if legacy then
        if string.sub(l, j, j) ~= "," then return nil end
        i = __cskip(l, j + 1)
      elseif j == i then return nil
      else i = j end
    end
  end
  i = __cskip(l, i)
  local a, ap = nil, false
  if string.sub(l, i, i) == (legacy and "," or "/") then
    a, i = __cnumAt(l, __cskip(l, i + 1))
    if a == nil then return nil end
    if string.sub(l, i, i) == "%" then ap = true; i = i + 1 end
    i = __cskip(l, i)
  end
  if i ~= #l or string.sub(l, i, i) ~= ")" then return nil end
  if a == nil then a = 1 else a = __cclamp(a / (ap and 100 or 1), 0, 1) end
  if not hsl then
    local function channel(k) return __cclamp(__cround(v[k] * (p[k] and 2.55 or 1)), 0, 255) end
    return channel(1), channel(2), channel(3), a
  end
  -- A hue too large to be a number has no angle, and is not a colour.
  local turned = v[1] * unit
  if turned ~= turned or turned == math.huge or turned == -math.huge then return nil end
  local h = math.fmod(math.fmod(turned, 360) + 360, 360)
  local sat = __cclamp(v[2], 0, 100) / 100
  local light = __cclamp(v[3], 0, 100) / 100
  local amp = sat * math.min(light, 1 - light)
  local function f(n)
    local k = math.fmod(n + h / 30, 12)
    return __cround(255 * (light - amp * math.max(-1, math.min(k - 3, 9 - k, 1))))
  end
  return f(0), f(8), f(4), a
end
-- A CSS colour as r, g, b (0-255) and a (0-1), or nil. A name in any case: JavaScript's
-- toLowerCase turns the Kelvin sign into "k", and Lua's string.lower turns only ASCII.
local function __ccss(text)
  local s = __ctrim(text)
  local lower = string.lower((string.gsub(s, "\226\132\170", "k")))
  if lower == "transparent" then return 0, 0, 0, 0 end
  local named = __CE_CSS_COLOURS[lower]
  if named ~= nil then
    return tonumber(string.sub(named, 1, 2), 16), tonumber(string.sub(named, 3, 4), 16), tonumber(string.sub(named, 5, 6), 16), 1
  end
  local d = string.match(s, "^#(%x+)$")
  if d ~= nil and (#d == 3 or #d == 4 or #d == 6 or #d == 8) then
    if #d <= 4 then d = string.gsub(d, ".", "%0%0") end
    local function byte(i) return tonumber(string.sub(d, i, i + 1), 16) end
    local a = 1
    if #d == 8 then a = byte(7) / 255 end
    return byte(1), byte(3), byte(5), a
  end
  return __cfunction(s)
end
-- The same colour in the panel's form: #RRGGBB when solid, AARRGGBB when it is not.
local function __cpanelForm(r, g, b, a)
  local rgb = string.format("%02X%02X%02X", r, g, b)
  if a >= 1 then return "#" .. rgb end
  return string.format("%02X", __cround(a * 255)) .. rgb
end
-- Does the panel read this text as a colour? 6 or 8 hex digits, with or without one "#".
local function __cpanelHex(s)
  local h = string.match(s, "^#?(%x+)$")
  return h ~= nil and (#h == 6 or #h == 8)
end
-- CSS's short forms written out, as a property stores them, or nil: not text with space around it,
-- "#" only with three digits ("#" with four is RGBA to CSS and ARGB here), and nothing CSS cannot read.
local function __clong(value)
  if type(value) ~= "string" or __ctrim(value) ~= value then return nil end
  if string.sub(value, 1, 1) == "#" and string.match(value, "^#%x%x%x$") == nil then return nil end
  local r, g, b, a = __ccss(value)
  if r == nil then return nil end
  return __cpanelForm(r, g, b, a)
end
-- For a refusal: what CSS text with space around it is in the panel's form, or "". Text that is the
-- panel's own form once the space is gone is that text, read as the panel reads it.
local function __ccssHint(value)
  if type(value) ~= "string" or __cpanelHex(value) then return "" end
  local trimmed = __ctrim(value)
  if trimmed ~= value and __cpanelHex(trimmed) then return ' Write "' .. trimmed .. '".' end
  local r, g, b, a = __ccss(value)
  if r == nil then return "" end
  return ' Write "' .. __cpanelForm(r, g, b, a) .. '".'
end
local function __cchan(verb, hex)
  local stored
  if type(hex) == "string" then
    if __cpanelHex(hex) then stored = hex else stored = __clong(hex) end
  end
  if stored ~= nil then
    local h = string.sub(stored, -6)
    return tonumber(string.sub(h, 1, 2), 16), tonumber(string.sub(h, 3, 4), 16), tonumber(string.sub(h, 5, 6), 16)
  end
  local why
  if hex == nil then why = "no colour was given"
  elseif type(hex) == "string" then why = '"' .. hex .. '" is not a colour'
  elseif type(hex) == "number" and __realNumber(hex) ~= nil then why = __cshown(hex) .. " is not a colour"
  else why = "the colour given is not text" end
  local hint = __chint(hex)
  if hint == "" then hint = __ccssHint(hex) end
  logError(verb .. ": " .. why .. ", so there is no answer. " .. __CFORMS .. "." .. hint)
  return nil
end
local function __cbyte(v)
  local n = math.floor((tonumber(v) or 0) + 0.5)
  if n < 0 then return 0 elseif n > 255 then return 255 end
  return n
end
function rgbToHex(r, g, b)
  return string.upper(string.format("#%02x%02x%02x", __cbyte(r), __cbyte(g), __cbyte(b)))
end
function hexToRgb(hex)
  local r, g, b = __cchan("ce.math.rgb", hex)
  if r == nil then return nil end
  return { r = r, g = g, b = b }
end
function lighten(hex, amount)
  local r, g, b = __cchan("ce.math.lighten", hex)
  if r == nil then return nil end
  local f = __cunit("ce.math.lighten", "the amount", amount, 0.4)
  if f == nil then return nil end
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
end
function darken(hex, amount)
  local r, g, b = __cchan("ce.math.darken", hex)
  if r == nil then return nil end
  local f = __cunit("ce.math.darken", "the amount", amount, 0.55)
  if f == nil then return nil end
  return rgbToHex(r * f, g * f, b * f)
end
-- NOT an app algorithm, and said so: lerp() per channel in plain RGB.
function mixColour(a, b, t)
  local r1, g1, b1 = __cchan("ce.math.mix", a)
  if r1 == nil then return nil end
  local r2, g2, b2 = __cchan("ce.math.mix", b)
  if r2 == nil then return nil end
  local f = tonumber(t) or 0
  if f < 0 then f = 0 elseif f > 1 then f = 1 end
  return rgbToHex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f)
end
-- The PANEL's form: AARRGGBB, no leading #, which is what a stored colour property holds.
function colourAlpha(hex, a)
  local r, g, b = __cchan("ce.math.alpha", hex)
  if r == nil then return nil end
  local f = __cunit("ce.math.alpha", "the alpha", a)
  if f == nil then return nil end
  return string.upper(string.format("%02x", math.floor(f * 255 + 0.5)) .. string.sub(rgbToHex(r, g, b), 2))
end
-- A colour written with its alpha first (fromARGB) or last (fromRGBA), in the form every reader
-- reads one way: "#RRGGBB" when solid, AARRGGBB when not. scriptColours.orderedColour's reading,
-- in the WebView runtime's colourFromOrder words.
local __CORDER = {
  argb = 'Write 8 hex digits with the alpha first, such as "80123456" or "#80123456", or 4, such as "#8123". With 6 or 3 there is no alpha.',
  rgba = 'Write 8 hex digits with the alpha last, such as "12345680" or "#12345680", or 4, such as "#1238". With 6 or 3 there is no alpha.',
}
local function __corder(verb, order, value)
  if type(value) == "string" then
    local d = string.match(value, "^#?(%x+)$")
    if d ~= nil and (#d == 3 or #d == 4 or #d == 6 or #d == 8) then
      if #d <= 4 then d = (string.gsub(d, "(%x)", "%1%1")) end
      d = string.upper(d)
      local aa, rgb = "FF", d
      if #d == 8 then
        if order == "argb" then aa, rgb = string.sub(d, 1, 2), string.sub(d, 3)
        else aa, rgb = string.sub(d, 7, 8), string.sub(d, 1, 6) end
      end
      if aa == "FF" then return "#" .. rgb end
      return aa .. rgb
    end
  end
  local why
  if value == nil then why = "no colour was given"
  elseif type(value) == "string" then
    why = '"' .. value .. '" is not a colour written ' .. (order == "argb" and "AARRGGBB" or "RRGGBBAA")
  elseif type(value) == "number" and __realNumber(value) ~= nil then why = __cshown(value) .. " is a number, not text"
  else why = "the colour given is not text" end
  logError(verb .. ": " .. why .. ", so there is no answer. " .. __CORDER[order])
  return nil
end
function colourFromArgb(colour) return __corder("ce.math.fromARGB", "argb", colour) end
function colourFromRgba(colour) return __corder("ce.math.fromRGBA", "rgba", colour) end
function hexToHsl(hex)
  local r, g, b = __cchan("ce.math.hsl", hex)
  if r == nil then return nil end
  r = r / 255; g = g / 255; b = b / 255
  local mx = math.max(r, g, b)
  local mn = math.min(r, g, b)
  local h, s = 0, 0
  local l = (mx + mn) / 2
  if mx ~= mn then
    local d = mx - mn
    if l > 0.5 then s = d / (2 - mx - mn) else s = d / (mx + mn) end
    if mx == r then
      local off = 0
      if g < b then off = 6 end
      h = ((g - b) / d + off) * 60
    elseif mx == g then h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60 end
  end
  return { h = h, s = s * 100, l = l * 100 }
end
function hslToHex(hue, sat, light)
  local h = tonumber(hue) or 0
  local s = (tonumber(sat) or 0) / 100
  local l = (tonumber(light) or 0) / 100
  local a = s * math.min(l, 1 - l)
  local function f(n)
    local k = (n + h / 30) % 12
    return l - a * math.max(-1, math.min(k - 3, 9 - k, 1))
  end
  return rgbToHex(math.floor(f(0) * 255 + 0.5), math.floor(f(8) * 255 + 0.5), math.floor(f(4) * 255 + 0.5))
end

-- @module ce.music
local NOTE_NAMES = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"}
local function __m12(n) return (math.floor(n) % 12 + 12) % 12 end
-- A flat lowers below the LETTER, so Cb is the B under C — one octave down, not up.
local __FLAT_LETTER = { C = 11, D = 1, E = 3, F = 4, G = 6, A = 8, B = 10 }
-- Two spellings, chosen by whether the second argument is there at all. Omitted: this module's
-- plain-ASCII names (C#4), what noteNumber has always round-tripped. Given: the PANEL's names, from
-- the same generated table the Chord Pad and Harmoniser print from — true "E♭4", false "C♯4".
function noteName(n, flats)
  n = math.floor(n)
  local tbl = NOTE_NAMES
  if flats ~= nil then if flats then tbl = __CE_NOTE_FLAT else tbl = __CE_NOTE_SHARP end end
  return tbl[__m12(n) + 1] .. tostring(math.floor(n / 12) - 1)
end
-- Reads all four spellings: C4, C#4, C♯4, Db4, D♭4. An unreadable name is NIL, not 0 — 0 is a real
-- MIDI note (C-1), so returning it for "Eb4" meant a typo played a wrong note in silence.
function noteNumber(name)
  local s = string.gsub(tostring(name), "♯", "#")
  s = string.gsub(s, "♭", "b")
  local letter, acc, oct = string.match(s, "^([A-G])([#b]?)(-?%d+)$")
  if not letter then return nil end
  local pc = nil
  if acc == "b" then
    pc = __FLAT_LETTER[letter]
  else
    for i, nm in ipairs(NOTE_NAMES) do if nm == (letter .. acc) then pc = i - 1 break end end
  end
  if pc == nil then return nil end
  local o = tonumber(oct) + 1
  if acc == "b" and letter == "C" then o = o - 1 end
  return o * 12 + pc
end

-- BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- @module ce.music
__CE_SCALES = {}
__CE_SCALES["major"] = {0,2,4,5,7,9,11}
__CE_SCALES["minor"] = {0,2,3,5,7,8,10}
__CE_SCALES["harmonicMinor"] = {0,2,3,5,7,8,11}
__CE_SCALES["melodicMinor"] = {0,2,3,5,7,9,11}
__CE_SCALES["dorian"] = {0,2,3,5,7,9,10}
__CE_SCALES["phrygian"] = {0,1,3,5,7,8,10}
__CE_SCALES["lydian"] = {0,2,4,6,7,9,11}
__CE_SCALES["mixolydian"] = {0,2,4,5,7,9,10}
__CE_SCALES["locrian"] = {0,1,3,5,6,8,10}
__CE_SCALES["pentatonicMaj"] = {0,2,4,7,9}
__CE_SCALES["pentatonicMin"] = {0,3,5,7,10}
__CE_SCALES["blues"] = {0,3,5,6,7,10}
__CE_CHORDS = {}
__CE_CHORDS["major"] = {0,4,7}
__CE_CHORDS["minor"] = {0,3,7}
__CE_CHORDS["dim"] = {0,3,6}
__CE_CHORDS["aug"] = {0,4,8}
__CE_CHORDS["sus2"] = {0,2,7}
__CE_CHORDS["sus4"] = {0,5,7}
__CE_CHORDS["power"] = {0,7}
__CE_CHORDS["maj6"] = {0,4,7,9}
__CE_CHORDS["min6"] = {0,3,7,9}
__CE_CHORDS["dom7"] = {0,4,7,10}
__CE_CHORDS["maj7"] = {0,4,7,11}
__CE_CHORDS["min7"] = {0,3,7,10}
__CE_CHORDS["minMaj7"] = {0,3,7,11}
__CE_CHORDS["dim7"] = {0,3,6,9}
__CE_CHORDS["m7b5"] = {0,3,6,10}
__CE_CHORDS["aug7"] = {0,4,8,10}
__CE_CHORDS["add9"] = {0,4,7,14}
__CE_CHORDS["dom9"] = {0,4,7,10,14}
__CE_CHORDS["maj9"] = {0,4,7,11,14}
__CE_CHORDS["min9"] = {0,3,7,10,14}
__CE_NOTE_SHARP = {"C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"}
__CE_NOTE_FLAT = {"C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"}
__CE_FLAT_KEYS = {}
__CE_FLAT_KEYS[5] = true
__CE_FLAT_KEYS[10] = true
__CE_FLAT_KEYS[3] = true
__CE_FLAT_KEYS[8] = true
__CE_FLAT_KEYS[1] = true
__CE_FLAT_KEYS[6] = true
__CE_MINOR_SCALES = {}
__CE_MINOR_SCALES["dorian"] = true
__CE_MINOR_SCALES["harmonicMinor"] = true
__CE_MINOR_SCALES["locrian"] = true
__CE_MINOR_SCALES["melodicMinor"] = true
__CE_MINOR_SCALES["minor"] = true
__CE_MINOR_SCALES["pentatonicMin"] = true
__CE_MINOR_SCALES["phrygian"] = true
__CE_QUALITY_SUFFIX = {}
__CE_QUALITY_SUFFIX["maj"] = ""
__CE_QUALITY_SUFFIX["min"] = "m"
__CE_QUALITY_SUFFIX["dim"] = "°"
__CE_QUALITY_SUFFIX["aug"] = "+"
__CE_QUALITY_SUFFIX["sus2"] = "sus2"
__CE_QUALITY_SUFFIX["sus4"] = "sus4"
__CE_QUALITY_SUFFIX["maj7"] = "maj7"
__CE_QUALITY_SUFFIX["dom7"] = "7"
__CE_QUALITY_SUFFIX["min7"] = "m7"
__CE_QUALITY_SUFFIX["m7b5"] = "m7♭5"
__CE_QUALITY_SUFFIX["dim7"] = "°7"
__CE_QUALITY_SUFFIX["minMaj7"] = "mMaj7"
__CE_ROMAN = {"I","II","III","IV","V","VI","VII"}
__CE_MINOR_QUALITIES = {}
__CE_MINOR_QUALITIES["dim"] = true
__CE_MINOR_QUALITIES["dim7"] = true
__CE_MINOR_QUALITIES["m7b5"] = true
__CE_MINOR_QUALITIES["min"] = true
__CE_MINOR_QUALITIES["min7"] = true
__CE_MINOR_QUALITIES["minMaj7"] = true
__CE_SCALE_NAMES = {"major","minor","harmonicMinor","melodicMinor","dorian","phrygian","lydian","mixolydian","locrian","pentatonicMaj","pentatonicMin","blues"}
__CE_CHORD_NAMES = {"major","minor","dim","aug","sus2","sus4","power","maj6","min6","dom7","maj7","min7","minMaj7","dim7","m7b5","aug7","add9","dom9","maj9","min9"}
-- @module ce.time
__CE_DIVISIONS = {}
__CE_DIVISIONS["1/1"] = 4
__CE_DIVISIONS["1/2"] = 2
__CE_DIVISIONS["1/4"] = 1
__CE_DIVISIONS["1/8"] = 0.5
__CE_DIVISIONS["1/16"] = 0.25
__CE_DIVISIONS["1/32"] = 0.125
__CE_DIVISIONS["1/2D"] = 3
__CE_DIVISIONS["1/4D"] = 1.5
__CE_DIVISIONS["1/8D"] = 0.75
__CE_DIVISIONS["1/16D"] = 0.375
__CE_DIVISIONS["1/2T"] = 1.3333333333333333
__CE_DIVISIONS["1/4T"] = 0.6666666666666666
__CE_DIVISIONS["1/8T"] = 0.3333333333333333
__CE_DIVISIONS["1/16T"] = 0.16666666666666666
__CE_DIVISION_LABELS = {}
__CE_DIVISION_LABELS["1/1"] = "Whole"
__CE_DIVISION_LABELS["1/2"] = "Half"
__CE_DIVISION_LABELS["1/4"] = "Quarter"
__CE_DIVISION_LABELS["1/8"] = "8th"
__CE_DIVISION_LABELS["1/16"] = "16th"
__CE_DIVISION_LABELS["1/32"] = "32nd"
__CE_DIVISION_LABELS["1/2D"] = "Half ·"
__CE_DIVISION_LABELS["1/4D"] = "Quarter ·"
__CE_DIVISION_LABELS["1/8D"] = "8th ·"
__CE_DIVISION_LABELS["1/16D"] = "16th ·"
__CE_DIVISION_LABELS["1/2T"] = "Half T"
__CE_DIVISION_LABELS["1/4T"] = "Quarter T"
__CE_DIVISION_LABELS["1/8T"] = "8th T"
__CE_DIVISION_LABELS["1/16T"] = "16th T"
__CE_DIVISION_NAMES = {"1/1","1/2","1/4","1/8","1/16","1/32","1/2D","1/4D","1/8D","1/16D","1/2T","1/4T","1/8T","1/16T"}
__CE_TIME = {}
__CE_TIME["ppqn"] = 24
__CE_TIME["minBpm"] = 20
__CE_TIME["maxBpm"] = 300
-- @module ce.anim
__CE_EASINGS = {}
__CE_EASINGS["inQuad"] = {0.55,0.085,0.68,0.53}
__CE_EASINGS["outQuad"] = {0.25,0.46,0.45,0.94}
__CE_EASINGS["inOutQuad"] = {0.455,0.03,0.515,0.955}
__CE_EASINGS["inCubic"] = {0.55,0.055,0.675,0.19}
__CE_EASINGS["outCubic"] = {0.215,0.61,0.355,1}
__CE_EASINGS["inOutCubic"] = {0.645,0.045,0.355,1}
__CE_EASINGS["inBack"] = {0.6,-0.28,0.735,0.045}
__CE_EASINGS["outBack"] = {0.175,0.885,0.32,1.275}
__CE_EASINGS["inOutBack"] = {0.68,-0.55,0.265,1.55}
-- @module ce.music
-- END GENERATED music tables

-- Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
-- or a name ("C4"), the way sendNote does. An unknown scale or chord name returns nil rather than
-- guessing "major" — a script that asked for something this build does not know should find out.
-- It found out only by getting nil, and an unreadable note NAME was worse: __pitch made it 0, so
-- scaleNotes("c4") answered with the scale on C-1. Both now answer nil and say why, through
-- __setOf and __pitchOf, in the words of the WebView runtime's musicSetOf and musicPitchOf. Each
-- helper checks its scale or chord first, then its notes in argument order, and stops at the first.
-- A number has to be a finite one: NaN, true or a table rooted the answer at C-1 just as an
-- unreadable name had. The answer itself may pass 127 (a chord on G9 does); a sender refuses that.
local function __pitch(v)
  if type(v) == "string" then return noteNumber(v) end
  if type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge then return math.floor(v) end
  return nil
end
local function __steps(tbl, name, fallback)
  local s = tbl[name == nil and fallback or tostring(name)]
  return s
end
local function __pitchOf(verb, v)
  -- A note left out altogether used to go the numeric way and become 0, the scale on C-1 again.
  if v == nil then
    logError(verb .. ': no note was given, so there is no answer. A note is a MIDI number or a name, such as 60 or "C4".')
    return nil
  end
  local n = __pitch(v)
  if n == nil then
    if type(v) == "string" then
      logError(verb .. ': "' .. v .. '" is not a note name, so there is no answer. A name is '
        .. 'a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".')
    else
      logError(verb .. ': ' .. __shownValue(v) .. ' is not a note, so there is no answer. A note is a MIDI '
        .. 'number or a name, such as 60 or "C4".')
    end
  end
  return n
end
local function __setOf(verb, kind, name)
  local s = __steps(kind == "chord" and __CE_CHORDS or __CE_SCALES, name, "major")
  if s == nil then
    logError(verb .. ': "' .. tostring(name) .. '" is not a ' .. kind .. ', so there is no answer. The '
      .. kind .. 's are ' .. table.concat(kind == "chord" and __CE_CHORD_NAMES or __CE_SCALE_NAMES, ", ") .. '.')
  end
  return s
end
function scaleNotes(root, scale)
  local s = __setOf("ce.music.scale", "scale", scale)
  if s == nil then return nil end
  local base, out = __pitchOf("ce.music.scale", root), {}
  if base == nil then return nil end
  for i = 1, #s do out[i] = base + s[i] end
  return out
end
function chordNotes(root, chordType)
  local s = __setOf("ce.music.chord", "chord", chordType)
  if s == nil then return nil end
  local base, out = __pitchOf("ce.music.chord", root), {}
  if base == nil then return nil end
  for i = 1, #s do out[i] = base + s[i] end
  return out
end
function quantizeNote(note, root, scale)
  local s = __setOf("ce.music.quantize", "scale", scale)
  if s == nil then return nil end
  local n = __pitchOf("ce.music.quantize", note)
  if n == nil then return nil end
  local base = __pitchOf("ce.music.quantize", root)
  if base == nil then return nil end
  local inKey = {}
  for i = 1, #s do inKey[(base + s[i]) % 12] = true end
  -- Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested before
  -- the -d one, so a note exactly between two scale tones lands on the same one in every runtime.
  for d = 0, 6 do
    if inKey[(n + d) % 12] then return n + d end
    if inKey[(n - d) % 12] then return n - d end
  end
  return n
end

-- Key, degree and voicing. Everything above answers a question about a note or a shape on its own;
-- these answer questions about a note IN A KEY, which is what the Chord Pad, the Harmoniser and the
-- Arpeggiator each work out for themselves. Same algorithms, not second opinions: a script naming a
-- chord and the panel labelling the same chord have to agree or the panel contradicts itself.
-- A count argument that is not a finite number falls back to its default. Written out rather than
-- leaning on falsiness, because `0 or 3` is 3 in JavaScript and Python and 0 in Lua.
local function __count(v, fallback)
  local n = tonumber(v)
  if n == nil or n ~= n or n == math.huge or n == -math.huge then return fallback end
  return math.floor(n)
end
local function __sortedNotes(list)
  local out = {}
  if type(list) == "table" then
    for i = 1, #list do local v = tonumber(list[i]) if v then out[#out + 1] = v end end
  end
  table.sort(out)
  return out
end
function noteSpelling(root, scale)
  local nm = (scale == nil) and "major" or tostring(scale)
  if __setOf("ce.music.spelling", "scale", scale) == nil then return nil end
  local pitch = __pitchOf("ce.music.spelling", root)
  if pitch == nil then return nil end
  local pc = __m12(pitch)
  -- Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
  if __CE_MINOR_SCALES[nm] then pc = __m12(pc + 3) end
  return __CE_FLAT_KEYS[pc] == true
end
function inScale(note, root, scale)
  local s = __setOf("ce.music.inScale", "scale", scale)
  if s == nil then return nil end
  local n = __pitchOf("ce.music.inScale", note)
  if n == nil then return nil end
  local r = __pitchOf("ce.music.inScale", root)
  if r == nil then return nil end
  local base, pc = __m12(r), __m12(n)
  for i = 1, #s do if __m12(base + s[i]) == pc then return true end end
  return false
end
-- 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets nil rather
-- than the nearest one — rounding here turns a wrong note into a plausible chord, and quantizeNote
-- is the verb that rounds on purpose.
function scaleDegree(note, root, scale)
  local s = __setOf("ce.music.degree", "scale", scale)
  if s == nil then return nil end
  local n = __pitchOf("ce.music.degree", note)
  if n == nil then return nil end
  local r = __pitchOf("ce.music.degree", root)
  if r == nil then return nil end
  local base, pc = __m12(r), __m12(n)
  for i = 1, #s do if __m12(base + s[i]) == pc then return i end end
  return nil
end
-- Name a chord from the notes in it, reading intervals above the lowest one: the inverse of
-- chordNotes, in the vocabulary the Chord Pad labels with.
function chordQuality(notes)
  if type(notes) ~= "table" or #notes == 0 then return nil end
  local list = {}
  for i = 1, #notes do local v = tonumber(notes[i]) if v then list[#list + 1] = v end end
  if #list == 0 then return nil end
  table.sort(list)
  local iv = {}
  for i = 1, #list do iv[__m12(list[i] - list[1])] = true end
  local third = iv[3] and "min" or iv[4] and "maj" or iv[2] and "sus2" or iv[5] and "sus4" or ""
  local fifth = iv[7] and "p5" or iv[6] and "d5" or iv[8] and "a5" or ""
  local seventh = iv[10] and "m7" or iv[11] and "M7" or ((iv[9] and fifth == "d5") and "d7") or ""
  if third == "min" and fifth == "d5" then
    if seventh == "m7" then return "m7b5" elseif seventh == "d7" then return "dim7" else return "dim" end
  end
  if third == "maj" and fifth == "a5" then return "aug" end
  if third == "min" then
    if seventh == "m7" then return "min7" elseif seventh == "M7" then return "minMaj7" else return "min" end
  end
  if third == "maj" then
    if seventh == "m7" then return "dom7" elseif seventh == "M7" then return "maj7" else return "maj" end
  end
  if third == "sus2" then return "sus2" end
  if third == "sus4" then return "sus4" end
  return "maj"
end
-- A roman numeral for a chord root, spelled against the MAJOR scale so borrowed degrees read as
-- ♭III / ♭VI / ♭VII the way the Chord Pad's wheel labels them.
local function __roman(rootSemitone, quality)
  local semi = __m12(rootSemitone)
  local best, acc = 1, ""
  for d = 1, 7 do
    local diff = __m12(semi - __CE_SCALES["major"][d])
    if diff == 0 then best = d acc = "" break end
    if diff == 11 then best = d acc = "♭"
    elseif diff == 1 and acc == "" then best = d acc = "♯" end
  end
  local r = __CE_ROMAN[best]
  if __CE_MINOR_QUALITIES[quality] then r = string.lower(r) end
  if quality == "dim" or quality == "dim7" or quality == "m7b5" then r = r .. "°" end
  if quality == "aug" then r = r .. "+" end
  return acc .. r
end
-- The chord the key builds ON a degree, by stacking scale thirds. Degrees are 1-based like
-- scaleDegree's. Past the top of the scale the stack keeps going an octave up rather than failing.
function degreeChord(root, scale, degree, size)
  local nm = (scale == nil) and "major" or tostring(scale)
  local s = __setOf("ce.music.degreeChord", "scale", scale)
  if s == nil or #s == 0 then return nil end
  if __pitchOf("ce.music.degreeChord", root) == nil then return nil end
  local n = #s
  local d = __count(degree, 1) - 1
  local sz = math.max(2, __count(size, 3))
  local offsets = {}
  for k = 0, sz - 1 do
    local idx = d + k * 2
    offsets[k + 1] = s[(idx % n) + 1] + math.floor(idx / n) * 12
  end
  local base = __pitch(root)
  local quality = chordQuality(offsets)
  local tbl = noteSpelling(root, nm) and __CE_NOTE_FLAT or __CE_NOTE_SHARP
  local notes, names = {}, {}
  for i = 1, #offsets do
    notes[i] = base + offsets[i]
    names[i] = tbl[__m12(notes[i]) + 1]
  end
  return {
    degree = d + 1, rootNote = notes[1], quality = quality,
    name = names[1] .. (__CE_QUALITY_SUFFIX[quality] or ""),
    roman = __roman(offsets[1], quality),
    offsets = offsets, notes = notes, names = names,
  }
end
-- Each voice to its NEAREST note in the other chord — voice counts differ (a triad following a
-- seventh), so pairing by index would compare nonsense.
local function __motion(a, b)
  local sum = 0
  for i = 1, #a do
    local best = math.huge
    for j = 1, #b do local d = math.abs(a[i] - b[j]) if d < best then best = d end end
    sum = sum + best
  end
  return sum
end
-- Re-voice a chord so it moves as little as possible from the one before it — the Harmoniser's
-- voice leading. "closest" minimises total movement, "smooth" the TOP voice only (which holds a
-- melody still), "off" returns root position. No previous chord means nothing to lead from.
function voiceLead(notes, previous, mode)
  local chord, prev = __sortedNotes(notes), __sortedNotes(previous)
  local how = (mode == nil) and "closest" or tostring(mode)
  if #chord == 0 or #prev == 0 or how == "off" then return chord end
  local cands = { chord }
  local span = math.max(1, #chord - 1) * 2
  local cur = chord
  for _ = 1, span do
    local nx = {}
    for i = 2, #cur do nx[#nx + 1] = cur[i] end
    nx[#nx + 1] = cur[1] + 12
    table.sort(nx) cands[#cands + 1] = nx cur = nx
  end
  cur = chord
  for _ = 1, span do
    local nx = { cur[#cur] - 12 }
    for i = 1, #cur - 1 do nx[#nx + 1] = cur[i] end
    table.sort(nx) cands[#cands + 1] = nx cur = nx
  end
  local best, bestScore = chord, math.huge
  for c = 1, #cands do
    local cand = cands[c]
    local ok = true
    for i = 1, #cand do if cand[i] < 0 or cand[i] > 127 then ok = false break end end
    if ok then
      local score
      if how == "smooth" then score = math.abs(cand[#cand] - prev[#prev]) else score = __motion(cand, prev) end
      -- Strictly less, so a tie keeps the earlier (lower) candidate in every runtime.
      if score < bestScore then bestScore = score best = cand end
    end
  end
  return best
end
-- The Arpeggiator's octave expansion. Anything landing above 127 is DROPPED rather than clamped:
-- clamping stacks strays on one pitch, which sounds like a stuck key rather than like nothing.
function expandOctaves(notes, octaves)
  local base = __sortedNotes(notes)
  local oc = math.max(1, math.min(4, __count(octaves, 1)))
  local out = {}
  for o = 0, oc - 1 do
    for i = 1, #base do
      local v = math.floor(base[i])
      if v < 0 then v = 0 elseif v > 127 then v = 127 end
      v = v + o * 12
      if v <= 127 then out[#out + 1] = v end
    end
  end
  return out
end
-- The walk a pattern describes, as a list of STEPS — each step a list of notes, so "chord" (one
-- step, everything at once) has the same shape as the rest. Notes are taken in the order given,
-- which is what makes "asPlayed" mean anything. "random" returns the input order, exactly as the
-- panel's arpeggiator does; for a shuffled WALK there is shuffle(), which is seeded.
function arpOrder(notes, pattern)
  local asc = {}
  if type(notes) == "table" then for i = 1, #notes do asc[i] = notes[i] end end
  local n = #asc
  if n == 0 then return {} end
  local p = tostring(pattern)
  if p == "chord" then return { asc } end
  local seq = {}
  if p == "down" then
    for i = n, 1, -1 do seq[#seq + 1] = asc[i] end
  elseif p == "updown" then
    for i = 1, n do seq[#seq + 1] = asc[i] end
    for i = n - 1, 2, -1 do seq[#seq + 1] = asc[i] end       -- no repeated endpoints
  elseif p == "downup" then
    for i = n, 1, -1 do seq[#seq + 1] = asc[i] end
    for i = 2, n - 1 do seq[#seq + 1] = asc[i] end
  else
    for i = 1, n do seq[#seq + 1] = asc[i] end
  end
  local out = {}
  for i = 1, #seq do out[i] = { seq[i] } end
  return out
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
-- checksum(type, bytes [, opts]) — eleven algorithms, the same table checksums.js holds and the
-- device profile engine reads (design doc §48). This used to know three and fall through to Roland
-- for anything else, so a typo came back as a plausible number from a different algorithm.
--
-- Lua integers are 64-bit, so the CRCs need masking but not the unsigned gymnastics JavaScript does.
__CE_CKSUM_ALIAS = {
  ["sum"] = "sum-7bit", ["sum-7bit"] = "sum-7bit",
  ["roland"] = "roland-7bit", ["yamaha"] = "roland-7bit", ["roland-7bit"] = "roland-7bit",
  ["twos-complement-7bit"] = "roland-7bit",
  ["ones"] = "ones-complement-7bit", ["ones-complement"] = "ones-complement-7bit",
  ["ones-complement-7bit"] = "ones-complement-7bit",
  ["xor"] = "xor-7bit", ["xor-7bit"] = "xor-7bit",
  ["offset"] = "offset-7bit", ["kawai"] = "offset-7bit", ["offset-7bit"] = "offset-7bit",
  ["sum-8bit"] = "sum-8bit",
  ["twos-complement"] = "twos-complement-8bit", ["twos-complement-8bit"] = "twos-complement-8bit",
  ["crc8"] = "crc8",
  ["crc16"] = "crc16-ccitt", ["crc16-ccitt"] = "crc16-ccitt", ["crc16-modbus"] = "crc16-modbus",
  ["crc32"] = "crc32",
}
function __ce_crc_msb(bytes, poly, init, xorOut, bits)
  local top = 1 << (bits - 1)
  local mask = (1 << bits) - 1
  local crc = init
  for i = 1, #bytes do
    crc = crc ~ ((math.floor(bytes[i]) % 256) << (bits - 8))
    for _ = 1, 8 do
      if (crc & top) ~= 0 then crc = ((crc << 1) ~ poly) & mask else crc = (crc << 1) & mask end
    end
    crc = crc & mask
  end
  return (crc ~ xorOut) & mask
end
function __ce_crc_ref(bytes, poly, init, xorOut, bits)
  local mask = (1 << bits) - 1
  local crc = init
  for i = 1, #bytes do
    crc = crc ~ (math.floor(bytes[i]) % 256)
    for _ = 1, 8 do
      if (crc & 1) ~= 0 then crc = ((crc >> 1) ~ poly) & mask else crc = (crc >> 1) & mask end
    end
  end
  return (crc ~ xorOut) & mask
end
-- One hex byte: one or two hex digits, with or without 0x. nil when the text is not one byte.
local function __hexByte(token)
  local digits = (token:gsub("^0[xX]", ""))
  if #digits < 1 or #digits > 2 or digits:find("[^%x]") then return nil end
  return tonumber(digits, 16)
end
-- A script's bytes, read the way every runtime reads them (the WebView runtime's scriptBytes,
-- BridgeScriptHost's bytesFromScript). Hex text is split on spaces, tabs, line breaks, form and
-- vertical tab (Lua's %s) and commas, and each token is one byte. A list's items are bytes: a whole
-- number from 0 to 255, or text that is one hex byte. Anything else is refused, naming what and
-- where, and nil comes back; nothing given is an empty list, for the caller to judge.
local function __scriptBytes(verb, input, outcome)
  if input == nil then return {} end
  if type(input) == "string" then
    local out = {}
    for token in string.gmatch(input, "[^%s,]+") do
      local b = __hexByte(token)
      if b == nil then
        local message = verb .. ': "' .. token .. '" is not one byte, so ' .. outcome .. '. '
        if not token:find("[^%x]") and #token % 2 == 0 then
          local pairs_ = {}
          for i = 1, #token, 2 do pairs_[#pairs_ + 1] = token:sub(i, i + 1) end
          message = message .. 'Put a space between the bytes: "' .. table.concat(pairs_, " ") .. '".'
        else
          message = message .. 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".'
        end
        logError(message)
        return nil
      end
      out[#out + 1] = b
    end
    return out
  end
  if type(input) ~= "table" then
    logError(verb .. ": " .. __shownValue(input) .. " is not a list of bytes, so " .. outcome .. ".")
    return nil
  end
  local out = {}
  for i = 1, #input do
    local v, b = input[i], nil
    if type(v) == "number" and v >= 0 and v <= 255 and v == math.floor(v) then b = math.floor(v)
    elseif type(v) == "string" then b = __hexByte(v) end
    if b == nil then
      logError(verb .. ": " .. __shownValue(v) .. " at position " .. (i - 1) .. " is not a byte, so " .. outcome
        .. '. A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".')
      return nil
    end
    out[i] = b
  end
  return out
end
function checksum(kind, bytes, opts)
  local verb = "ce.midi.checksum"
  if bytes == nil then
    -- checksum("roland") with the bytes left out: the name is a name, and what is missing is the bytes.
    if kind == nil or (type(kind) == "string" and __CE_CKSUM_ALIAS[string.lower(kind)] ~= nil) then
      logError(verb .. ": no bytes given, so there is no checksum.")
      return nil
    end
    bytes = kind; kind = "roland"
  end
  bytes = __scriptBytes(verb, bytes, "there is no checksum")
  if bytes == nil then return nil end
  local id = type(kind) == "string" and __CE_CKSUM_ALIAS[string.lower(kind)] or nil
  if id == nil then
    -- The names it does accept, sorted, as the WebView runtime lists them (checksumNames).
    local names = {}
    for name in pairs(__CE_CKSUM_ALIAS) do names[#names + 1] = name end
    table.sort(names)
    local which = kind == nil and ": no algorithm given" or ("(" .. __shownValue(kind) .. "): no such algorithm")
    logError("ce.midi.checksum" .. which .. ". One of: " .. table.concat(names, ", ") .. ".")
    return nil
  end
  local sum7, sum8, x = 0, 0, 0
  for i = 1, #bytes do
    local b = math.floor(bytes[i]) % 256
    sum7 = (sum7 + b) % 128
    sum8 = (sum8 + b) % 256
    x = (x ~ b) & 0x7f
  end
  if id == "sum-7bit" then return sum7 end
  if id == "roland-7bit" then return (128 - sum7) % 128 end
  if id == "ones-complement-7bit" then return (127 - sum7) % 128 end
  if id == "xor-7bit" then return x end
  if id == "offset-7bit" then
    local k = 0xa5
    if opts ~= nil and opts.offset ~= nil then k = math.floor(opts.offset) end
    return (sum7 + k) % 128
  end
  if id == "sum-8bit" then return sum8 end
  if id == "twos-complement-8bit" then return (256 - sum8) % 256 end
  if id == "crc8" then return __ce_crc_msb(bytes, 0x07, 0x00, 0x00, 8) end
  if id == "crc16-ccitt" then return __ce_crc_msb(bytes, 0x1021, 0xffff, 0x0000, 16) end
  if id == "crc16-modbus" then return __ce_crc_ref(bytes, 0xa001, 0xffff, 0x0000, 16) end
  return __ce_crc_ref(bytes, 0xedb88320, 0xffffffff, 0xffffffff, 32)
end

-- Byte lists: what JUCE's MemoryBlock does, over the lists scripts already pass bytes in
-- (docs/design/script-bytes.md). Ported from the WebView runtime's "byte lists" block rule for rule
-- and message for message, which scriptPreludeAgreement.test.js checks. Offsets and bit positions
-- count from 0 here too, as dump layouts do, though Lua's own lists start at 1. A list may be hex
-- text, and a list's items are bytes (0 to 255, or one hex byte), both read by __scriptBytes; a
-- mistake answers nil and says why; every list returned is new.
local __BIT_RANGE = "start must be a whole number from 0, and count one from 1 to 32"
local __WRITE_START = "Writing can run past the end, but not start beyond it."
local __B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function __whole(n) return type(n) == "number" and n == math.floor(n) and n > -math.huge and n < math.huge end
local function __plural(n, word) return n .. " " .. word .. (n == 1 and "" or "s") end
local function __span(word, a, b)
  if a == b then return word .. " " .. a .. " is past" end
  return word .. "s " .. a .. " to " .. b .. " run past"
end
local function __refuse(verb, why, tail)
  logError(verb .. ": " .. why .. ", so there is no answer." .. (tail and (" " .. tail) or ""))
  return nil
end
local function __bytesIn(verb, input)
  if input == nil then return __refuse(verb, "no bytes given") end
  return __scriptBytes(verb, input, "there is no answer")
end
-- Why a value to write cannot be written in `bits` bits, or nil when it can.
local function __doesNotFit(v, bits)
  if v == nil then return "the value to write is missing" end
  if not __whole(v) then return __shownValue(v) .. " is not a whole number" end
  if v < 0 or v >= 2 ^ bits then return __shown(v) .. " does not fit in " .. __plural(bits, "bit") end
  return nil
end
local function __shape(verb, opts)
  local bits, order = 7, "msb"
  if type(opts) == "table" then
    if opts.bits ~= nil then bits = opts.bits end
    if opts.order ~= nil then order = opts.order end
  end
  if bits ~= 7 and bits ~= 8 then return __refuse(verb, "bits must be 7 or 8") end
  if order ~= "msb" and order ~= "lsb" then return __refuse(verb, 'order must be "msb" or "lsb"') end
  return { bits = math.floor(bits), order = order }
end
function getBits(value, start, count)
  local verb = "ce.midi.getBits"
  if not __whole(start) or start < 0 or not __whole(count) or count < 1 or count > 32 then return __refuse(verb, __BIT_RANGE) end
  start = math.floor(start); count = math.floor(count)
  if type(value) == "number" then
    if value ~= value or value == math.huge or value == -math.huge then return __refuse(verb, __shownValue(value) .. " is not a finite number") end
    if start + count > 32 then
      return __refuse(verb, __span("bit", start, start + count - 1) .. " the 32 bits a number holds here")
    end
    return (math.floor(value) >> start) & ((1 << count) - 1)
  end
  local bytes = __bytesIn(verb, value)
  if bytes == nil then return nil end
  if start + count > #bytes * 8 then
    return __refuse(verb, __span("bit", start, start + count - 1) .. " the end of " .. __plural(#bytes, "byte"))
  end
  local out = 0
  for k = 0, count - 1 do
    local at = start + k
    out = out | (((bytes[at // 8 + 1] >> (at % 8)) & 1) << k)
  end
  return out
end
function setBits(value, start, count, bits)
  local verb = "ce.midi.setBits"
  if not __whole(start) or start < 0 or not __whole(count) or count < 1 or count > 32 then return __refuse(verb, __BIT_RANGE) end
  start = math.floor(start); count = math.floor(count)
  local unfit = __doesNotFit(bits, count)
  if unfit then return __refuse(verb, unfit) end
  bits = math.floor(bits)
  if type(value) == "number" then
    if value ~= value or value == math.huge or value == -math.huge then return __refuse(verb, __shownValue(value) .. " is not a finite number") end
    if start + count > 32 then
      return __refuse(verb, __span("bit", start, start + count - 1) .. " the 32 bits a number holds here")
    end
    return (math.floor(value) & ~(((1 << count) - 1) << start)) | (bits << start)
  end
  local bytes = __bytesIn(verb, value)
  if bytes == nil then return nil end
  if start + count > #bytes * 8 then
    return __refuse(verb, __span("bit", start, start + count - 1) .. " the end of " .. __plural(#bytes, "byte"))
  end
  for k = 0, count - 1 do
    local at = start + k
    local i, bit = at // 8 + 1, 1 << (at % 8)
    if (bits >> k) & 1 == 1 then bytes[i] = bytes[i] | bit else bytes[i] = bytes[i] & ~bit end
  end
  return bytes
end
function bytesRead(bytes, offset, count, opts)
  local verb = "ce.midi.read"
  local list = __bytesIn(verb, bytes)
  if list == nil then return nil end
  if not __whole(offset) or offset < 0 then return __refuse(verb, "offset must be a whole number from 0") end
  if not __whole(count) or count < 1 or count > 4 then return __refuse(verb, "count must be a whole number from 1 to 4") end
  offset = math.floor(offset); count = math.floor(count)
  local shape = __shape(verb, opts)
  if shape == nil then return nil end
  if offset + count > #list then
    return __refuse(verb, __span("byte", offset, offset + count - 1) .. " the end of " .. __plural(#list, "byte"))
  end
  local v, base = 0, 1 << shape.bits
  for k = 0, count - 1 do
    local i = (shape.order == "msb") and (offset + k + 1) or (offset + count - k)
    v = v * base + (list[i] % base)
  end
  return v
end
function bytesWrite(bytes, offset, count, value, opts)
  local verb = "ce.midi.write"
  local list = __bytesIn(verb, bytes)
  if list == nil then return nil end
  if not __whole(offset) or offset < 0 then return __refuse(verb, "offset must be a whole number from 0") end
  if not __whole(count) or count < 1 or count > 4 then return __refuse(verb, "count must be a whole number from 1 to 4") end
  offset = math.floor(offset); count = math.floor(count)
  local shape = __shape(verb, opts)
  if shape == nil then return nil end
  local unfit = __doesNotFit(value, shape.bits * count)
  if unfit then return __refuse(verb, unfit) end
  if offset > #list then return __refuse(verb, "offset " .. offset .. " is past the end of " .. __plural(#list, "byte"), __WRITE_START) end
  local v, base, digits = math.floor(value), 1 << shape.bits, {}
  for k = 1, count do digits[k] = v % base; v = v // base end
  for k = 1, count do list[offset + k] = (shape.order == "msb") and digits[count - k + 1] or digits[k] end
  return list
end
function bytesSlice(bytes, offset, count)
  local verb = "ce.midi.slice"
  local list = __bytesIn(verb, bytes)
  if list == nil then return nil end
  if not __whole(offset) or offset < 0 then return __refuse(verb, "offset must be a whole number from 0") end
  offset = math.floor(offset)
  local last
  if count == nil then
    if offset > #list then return __refuse(verb, "offset " .. offset .. " is past the end of " .. __plural(#list, "byte")) end
    last = #list
  else
    if not __whole(count) or count < 0 then return __refuse(verb, "count must be a whole number from 0") end
    count = math.floor(count)
    if offset + count > #list then
      if count == 0 then return __refuse(verb, "offset " .. offset .. " is past the end of " .. __plural(#list, "byte")) end
      return __refuse(verb, __span("byte", offset, offset + count - 1) .. " the end of " .. __plural(#list, "byte"))
    end
    last = offset + count
  end
  local out = {}
  for i = offset + 1, last do out[#out + 1] = list[i] end
  return out
end
function bytesPut(bytes, offset, values)
  local verb = "ce.midi.put"
  local list = __bytesIn(verb, bytes)
  if list == nil then return nil end
  if not __whole(offset) or offset < 0 then return __refuse(verb, "offset must be a whole number from 0") end
  offset = math.floor(offset)
  local part = __bytesIn(verb, values)
  if part == nil then return nil end
  if offset > #list then return __refuse(verb, "offset " .. offset .. " is past the end of " .. __plural(#list, "byte"), __WRITE_START) end
  for k = 1, #part do list[offset + k] = part[k] end
  return list
end
function bytesFind(bytes, pattern, from)
  local verb = "ce.midi.find"
  local list = __bytesIn(verb, bytes)
  if list == nil then return nil end
  local wanted = __bytesIn(verb, pattern)
  if wanted == nil then return nil end
  if #wanted == 0 then return __refuse(verb, "the pattern is empty") end
  local first = (from == nil) and 0 or from
  if not __whole(first) or first < 0 then return __refuse(verb, "from must be a whole number from 0") end
  -- Not found is an answer, not a mistake: nil comes back and nothing is said.
  for i = math.floor(first), #list - #wanted do
    local j = 1
    while j <= #wanted and list[i + j] == wanted[j] do j = j + 1 end
    if j > #wanted then return i end
  end
  return nil
end
function bytesToHex(bytes)
  local list = __bytesIn("ce.midi.toHex", bytes)
  if list == nil then return nil end
  local parts = {}
  for i = 1, #list do parts[i] = string.format("%02X", list[i]) end
  return table.concat(parts, " ")
end
function bytesFromHex(text)
  local verb = "ce.midi.fromHex"
  if text == nil then return __refuse(verb, "no hex text given") end
  if type(text) ~= "string" then return __refuse(verb, __shownValue(text) .. " is not hex text") end
  return __bytesIn(verb, text)
end
function bytesToBase64(bytes)
  local list = __bytesIn("ce.midi.toBase64", bytes)
  if list == nil then return nil end
  local out = {}
  for i = 1, #list, 3 do
    local a, b, c = list[i], list[i + 1], list[i + 2]
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    local function ch(k) return __B64:sub(k + 1, k + 1) end
    out[#out + 1] = ch((n >> 18) & 63) .. ch((n >> 12) & 63)
      .. (b == nil and "=" or ch((n >> 6) & 63)) .. (c == nil and "=" or ch(n & 63))
  end
  return table.concat(out)
end
function bytesFromBase64(text)
  local verb = "ce.midi.fromBase64"
  if text == nil then return __refuse(verb, "no base64 text given") end
  local clean = (type(text) == "string") and (text:gsub("[ \t\r\n]", "")) or nil
  if clean == nil or #clean % 4 ~= 0 or not clean:match("^[A-Za-z0-9+/]*=?=?$") then
    return __refuse(verb, "that is not base64", "Base64 is groups of four characters from A-Z, a-z, 0-9, + and /, with = only as padding at the end.")
  end
  local out = {}
  for i = 1, #clean, 4 do
    local group, n, pad = clean:sub(i, i + 3), 0, 0
    for j = 1, 4 do
      local c = group:sub(j, j)
      if c == "=" then pad = pad + 1; n = n * 64 else n = n * 64 + (__B64:find(c, 1, true) - 1) end
    end
    out[#out + 1] = (n >> 16) & 255
    if pad < 2 then out[#out + 1] = (n >> 8) & 255 end
    if pad < 1 then out[#out + 1] = n & 255 end
  end
  return out
end

-- The numbers a channel message carries, checked before anything is sent: the WebView runtime's
-- MIDI_ARGS and midiArg, word for word. An address (channel, controller, program, bank, parameter
-- number) outside its range is refused, since clamping it picks a different message; a value past
-- the end of its range is clamped, as before; anything that is not a number, or is missing where
-- there is no default, is refused. A fraction rounds half up (this floored it, the editor rounded).
local __MIDI_ARGS = {
  channel = { "channel", "a channel", 1, 16, true, "A channel is a whole number from 1 to 16." },
  controller = { "controller number", "a controller number", 0, 127, true, "A controller number is a whole number from 0 to 127." },
  program = { "program", "a program", 0, 127, true, "A program is a whole number from 0 to 127." },
  bank = { "bank number", "a bank number", 0, 127, true, "A bank number is a whole number from 0 to 127." },
  msb = { "MSB", "an MSB", 0, 127, true, "An MSB is a whole number from 0 to 127." },
  lsb = { "LSB", "an LSB", 0, 127, true, "An LSB is a whole number from 0 to 127." },
  value = { "value", "a value", 0, 127, false, "A value is a number from 0 to 127." },
  velocity = { "velocity", "a velocity", 0, 127, false, "A velocity is a number from 0 to 127." },
  pressure = { "pressure", "a pressure", 0, 127, false, "A pressure is a number from 0 to 127." },
  value14 = { "value", "a value", 0, 16383, false, "A value is a number from 0 to 16383." },
  bend = { "bend", "a bend", 0, 16383, false, "A bend is a number from 0 to 16383, and 8192 is the centre." },
  position = { "song position", "a song position", 0, 16383, false, "A song position is a number of MIDI beats from 0 to 16383." },
}
local __edgeWarned = {}
local function __midiArg(verb, kind, v)
  local a = __MIDI_ARGS[kind]
  if v == nil then
    logError(verb .. ": no " .. a[1] .. " given, so nothing was sent.")
    return nil
  end
  local r = __realNumber(v)   -- text that is a number ("64") is read as one, as it always was
  local n = r ~= nil and math.floor(r + 0.5) or nil
  if n == nil or (a[5] and (n < a[3] or n > a[4])) then
    logError(verb .. ": " .. __shownValue(v) .. " is not " .. a[2] .. ", so nothing was sent. " .. a[6])
    return nil
  end
  if n >= a[3] and n <= a[4] then return n end
  -- A value past the end of its range is sent as the nearest end, and said once per command.
  local sent = n < a[3] and a[3] or a[4]
  if not __edgeWarned[verb] then
    __edgeWarned[verb] = true
    logWarn(verb .. ": the " .. a[1] .. " " .. __shownValue(v) .. " is outside " .. a[3] .. " to " .. a[4]
      .. ", so " .. sent .. " was sent. This is said only the first time.")
  end
  return sent
end

-- panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
-- order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
-- out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
function panic(opts)
  opts = opts or {}
  local reset = opts.resetControllers ~= false
  local first, last = 1, 16
  -- A channel that is not one ("all", 17) is refused; leaving it out is how every channel is named.
  if opts.channel ~= nil then
    first = __midiArg("panic", "channel", opts.channel)
    if first == nil then return end
    last = first
  end
  for ch = first, last do
    sendCC(ch, 120, 0)
    sendCC(ch, 123, 0)
    if reset then sendCC(ch, 121, 0) end
  end
end

-- @module -
-- Every member declared runtime:'webview' in panelApi.js. The components are modelled and rendered
-- in the panel view; there is no C++ counterpart to drive with the window closed. Defining them
-- here as explaining stubs means a script that strays across the boundary says so, instead of
-- dying on an undefined global. The list below is GENERATED — 248 names maintained by hand in
-- three files is 744 chances to mistype one, and a mistyped stub is a missing name in one engine.
-- BEGIN GENERATED webview-only stubs — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
local WEBVIEW_ONLY = {
-- @module ce.device
  "deviceBind","deviceUnbind",
-- @module ce.anim
  "animatePlay",
-- @module ce.ui
  "uiNotify","uiStatus","uiDialog","uiPrompt","uiChoose","uiDismiss","uiUpdate","uiState","uiCopy",
-- @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawGradient","drawOpacity","drawTransform","drawEllipse","drawPixelText","drawMeasure",
  "drawBatch","drawGrid","drawLines","drawPoints","drawCurve","drawPolygon","drawImage","drawClip",
  "drawBlend","drawSave","drawRestore","drawText","drawRedraw",
-- @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
  "panelAlign","panelDistribute","panelMatch","panelGrid","panelCircle","panelFlip","panelRect",
  "panelOrder","panelBatch","panelKeep","panelEntries","panelEntry","panelDefine","panelUndefine",
  "panelPatch",
-- @module ce.image
  "imageAssets","imageAsset","imageSet","imageClear","imageRead","imageIcon","imageEmbed",
  "imageLoad",
-- @module ce.text
  "textFonts","textFont","textStyle","textAxis","textRead","textMeasure","textFit",
-- @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint","splitRead",
-- @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell","phraseRead",
-- @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn","recorderRead",
-- @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree","harmonyRead",
-- @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
  "setlistRead",
-- @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpFollowPanelKey","arpDegree","arpChordType","arpVelocity",
  "arpChannel","arpEuclid","arpEuclidSteps","arpEuclidPulses","arpEuclidRotate","arpPhase",
  "arpMute","arpInputChannel","arpBaseOctave","arpSource","arpLink","arpEditable","arpShowNotes",
  "arpShowHeader","arpRead",
-- @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadFollowPanelKey","chordPadChordType",
  "chordPadVoicing","chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel",
  "chordPadStrum","chordPadLatch","chordPadLayout","chordPadBaseOctave","chordPadNoteSpan",
  "chordPadGridCols","chordPadEcho","chordPadEchoChannel","chordPadEditable","chordPadShowPiano",
  "chordPadShowRomans","chordPadRead",
-- @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonFollowPanelKey",
  "noteRibbonBaseNote","noteRibbonOctaves","noteRibbonBendRange","noteRibbonVelocity",
  "noteRibbonChannel","noteRibbonLatch","noteRibbonOrientation","noteRibbonVelocityFrom",
  "noteRibbonModAxis","noteRibbonModCc","noteRibbonEcho","noteRibbonEchoChannel",
  "noteRibbonEditable","noteRibbonShowNames","noteRibbonShowHeader","noteRibbonRead",
-- @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols","drumPadsOrigin","drumPadsVelocityFrom",
  "drumPadsEcho","drumPadsEchoChannel","drumPadsNote","drumPadsLabel","drumPadsChoke",
  "drumPadsColour","drumPadsRoll","drumPadsRollRate","drumPadsRollSync","drumPadsRollHz",
  "drumPadsRollDelay","drumPadsRollVelocity","drumPadsZones","drumPadsCornerSize",
  "drumPadsCornerTopLeft","drumPadsCornerTopRight","drumPadsCornerBottomLeft",
  "drumPadsCornerBottomRight","drumPadsFlamMs","drumPadsGhostVelocity","drumPadsEditable",
  "drumPadsShowNotes","drumPadsShowLabels","drumPadsShowHeader","drumPadsRead","drumPadsSize",
  "drumPadsFill",
-- @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep","turingPhase","turingEditable","turingShowGate",
  "turingShowDivisions","turingRead","turingSize","turingFill",
-- @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest","looperPhase","looperEditable","looperShowPlayhead","looperShowGrid",
  "looperShowDivisions","looperRead","looperSize","looperFill","looperInsert","looperRemove",
-- @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth","orbitEditable","orbitShowTrails",
  "orbitShowSpokes","orbitShowRings","orbitShowValues","orbitRead","orbitSize","orbitFill",
  "orbitInsert","orbitRemove",
-- @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity","kineticEditable","kineticShowTrail","kineticShowWalls",
  "kineticRead",
-- @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
  "constellationEditable","constellationShowLinks","constellationShowField",
  "constellationShowLabels","constellationRead",
-- @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY","timbreAxisX","timbreAxisY",
  "timbreEditable","timbreShowField","timbreShowAnchors","timbreShowReadout","timbreRead",
  "timbreSize","timbreFill","timbreInsert","timbreRemove",
-- @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth","routerCurveX","routerCurveY","routerCurveShape",
  "routerSourceControl","routerEditable","routerShowGrid","routerShowDivisions","routerRead",
  "routerSize","routerFill","routerInsert","routerRemove",
-- @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
  "macroLabel","macroEditable","macroShowLanes","macroShowValues","macroShowDivisions","macroRead",
  "macroSize","macroFill","macroInsert","macroRemove",
-- @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep","matrixCellStyle","matrixEditable",
  "matrixShowLabels","matrixShowValues","matrixRead","matrixSize","matrixFill",
-- @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember","constraintEditable","constraintShowValues",
  "constraintShowBadge","constraintRead","constraintSize","constraintFill","constraintInsert",
  "constraintRemove",
-- @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
  "envelopeAddOnDoubleClick","envelopeSnapX","envelopeSnapY","envelopeFillUnder",
  "envelopePhaseSource","envelopeEditable","envelopeShowPlayhead","envelopeShowGrid","envelopeRead",
  "envelopeSize","envelopeFill","envelopeInsert","envelopeRemove",
-- @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnTime",
  "ribbonReturnCurve","ribbonSnap","ribbonOrientation","ribbonStyle","ribbonLabel",
  "ribbonValuePrecision","ribbonEditable","ribbonShowGlow","ribbonShowValue","ribbonRead",
-- @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnMode",
  "crossfaderReturnValue","crossfaderReturnTime","crossfaderReturnCurve","crossfaderOrientation",
  "crossfaderLabelA","crossfaderLabelB","crossfaderEditable","crossfaderShowLabels",
  "crossfaderShowGains","crossfaderRead",
-- @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnMode","joystickReturnValue","joystickReturnAxes",
  "joystickReturnTime","joystickReturnCurve","joystickCornerLabel","joystickEditable",
  "joystickShowGrid","joystickShowCrosshair","joystickShowCorners","joystickShowTrail",
  "joystickRead","joystickSize","joystickFill",
-- @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay","meterValueMin",
  "meterValueMax","meterDbFloor","meterDbCeil","meterOrientation","meterGradient","meterLabel",
  "meterValuePrecision","meterValuePrefix","meterValueSuffix","meterZoneAt","meterSource",
  "meterShowTicks","meterShowScaleLabels","meterShowValue","meterRead","meterSize","meterFill",
  "meterInsert","meterRemove",
-- @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
  "transportClockDevice","transportRunOnLoad","transportEditable","transportShowPosition",
  "transportShowTap","transportRead",
-- @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal","panicSetLabel","panicSetEditable","panicSetShowSummary","panicSetRead",
-- @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue","lcdAnim","lcdAnimPreset","lcdAnimSpeed",
  "lcdAnimFps","lcdAnimLoop","lcdScrollMode","lcdScrollRepeat","lcdBlinkRate","lcdCursorBlink",
  "lcdValueMin","lcdValueMax","lcdValuePrecision","lcdValuePrefix","lcdValueSuffix",
  "lcdValueSource","lcdBrightnessSource","lcdBacklightSource","lcdGlyph","lcdEditText",
  "lcdShowGlass","lcdShowGhost","lcdShowScanlines","lcdShowGrid","lcdRead","lcdSize","lcdFill",
-- @module ce.components.pixel
  "pixelText","pixelLabel","pixelShow","pixelBlink","pixelX","pixelY","pixelW","pixelH",
  "pixelEditText","pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow",
  "pixelAnim","pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop","pixelAnimFps",
  "pixelLayoutTransition","pixelTransitionMs","pixelBrightnessSource","pixelBacklightSource",
  "pixelShowGlass","pixelShowGhost","pixelShowScanlines","pixelShowGrid","pixelRead",
}
-- @module -
for _, name in ipairs(WEBVIEW_ONLY) do
  _G[name] = function()
    log("[panel] " .. name .. "() needs the panel window open — that component is drawn and modelled in the panel view, so there is nothing to drive while the window is closed.")
    -- An explicit "return nil", NOT a bare return. A Lua function with no return statement yields
    -- ZERO values, so tostring(stub()) raises "value expected" rather than printing "nil". It went
    -- unnoticed while every webview-only member was a void command; ce.panel.create() is the first
    -- one whose RESULT a script reads, and it found it immediately. Same fix as the module gate.
    return nil
  end
end
-- END GENERATED webview-only stubs

-- @module ce.ui
-- dialog() is the one webview-only verb that owes its caller something. A script asks a question
-- and waits in the callback; if the callback never runs, that script waits forever. So window-
-- closed it answers the only honest answer there is — nobody is here — and says so in the return
-- value, which is `false`: no dialog was shown, and your callback has already been called.
function uiDialog(opts, onChoice)
  log("[panel] dialog() needs the panel window open — there is nobody to ask with the window closed, so it counts as dismissed.")
  if type(onChoice) == "function" then onChoice(nil) end
  return false
end

-- @module ce.midi
-- MIDI channel messages. All of them are arithmetic over sendMidi, the way panic() is over sendCC,
-- which is what makes them work identically in every runtime and every exported language.
-- `note` accepts a MIDI number or a name ("C3"), because a script that reads musically should be
-- allowed to say so.
-- A note: a MIDI number from 0 to 127, rounded, or a name such as "C4" whose number is in that
-- range. An unreadable name used to become note 0, so "c4" played C-1 with nothing to say why; a
-- name past the top, "C10", put 132 in the data byte, which a synth reads as a status byte; NaN or a
-- table played C-1 by the numeric path. __badNote refuses each in the WebView runtime's words.
local function __note(n)
  local v = nil
  if type(n) == "string" then v = noteNumber(n)
  elseif type(n) == "number" and n == n and n ~= math.huge and n ~= -math.huge then v = math.floor(n + 0.5) end
  if v ~= nil and v >= 0 and v <= 127 then return v end
  return nil
end
local function __badNote(verb, note)
  local range = "MIDI notes run from 0 to 127, which is C-1 to G9."
  local why
  if note == nil then
    why = 'no note was given, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".'
  elseif type(note) == "string" then
    if noteNumber(note) == nil then
      why = '"' .. note .. '" is not a note name, so nothing was sent. A name is a capital letter, then # or b if it '
        .. 'has one, then the octave: "C4", "Eb3", "F#-1".'
    else
      why = '"' .. note .. '" is outside the MIDI notes, so nothing was sent. ' .. range
    end
  elseif type(note) == "number" and note == note and note ~= math.huge and note ~= -math.huge then
    why = __shown(note) .. " is outside the MIDI notes, so nothing was sent. " .. range
  else
    why = __shownValue(note) .. ' is not a note, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".'
  end
  logError(verb .. ": " .. why)
end
-- sendNote's `ms`: left out (false here), the script sends the note off itself; given, it must be
-- a length. "500ms", NaN or -5 sent the note on and never the note off, a hung voice.
local function __noteLength(verb, ms)
  if ms == nil then return false end
  local length = __realNumber(ms)   -- "500" is what sendNote has always read
  if length ~= nil and length > 0 then return length end
  logError(verb .. ": " .. __shownValue(ms) .. " is not a length in milliseconds, so nothing was sent. "
    .. "Give a number above 0, or leave it out to send the note off yourself.")
  return nil
end
-- sendCC and sendNRPN are host bindings; what a script passes is checked here first, as the editor
-- checks it, and only numbers that are a message reach the host.
local __hostSendCC, __hostSendNRPN = sendCC, sendNRPN
function sendCC(channel, cc, value)
  local c = __midiArg("sendCC", "channel", channel); if c == nil then return end
  local n = __midiArg("sendCC", "controller", cc); if n == nil then return end
  local v = __midiArg("sendCC", "value", value); if v == nil then return end
  __hostSendCC(c, n, v)
end
function sendNRPN(channel, msb, lsb, value)
  local c = __midiArg("sendNRPN", "channel", channel); if c == nil then return end
  local m = __midiArg("sendNRPN", "msb", msb); if m == nil then return end
  local l = __midiArg("sendNRPN", "lsb", lsb); if l == nil then return end
  local v = __midiArg("sendNRPN", "value14", value); if v == nil then return end
  __hostSendNRPN(c, m, l, v)
end

-- A duration schedules the note off. Every script that plays a note was otherwise hand-rolling a
-- timer for it, and getting that wrong means a hung voice — the one MIDI mistake you hear rather
-- than read. A panel cannot play a note at all.
function sendNote(channel, note, velocity, ms)
  local c = __midiArg("sendNote", "channel", channel); if c == nil then return end
  local n = __note(note)
  if n == nil then return __badNote("sendNote", note) end
  local v = __midiArg("sendNote", "velocity", velocity); if v == nil then return end
  local length = __noteLength("sendNote", ms); if length == nil then return end
  sendMidi({0x90 | (c - 1), n, v})
  if length then
    __oneShot(length, function() sendMidi({0x80 | (c - 1), n, 0}) end)
  end
end
function sendRPN(channel, msb, lsb, value)
  -- RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range (0,0),
  -- fine tuning (0,1) and coarse tuning (0,2).
  local c = __midiArg("sendRPN", "channel", channel); if c == nil then return end
  local m = __midiArg("sendRPN", "msb", msb); if m == nil then return end
  local l = __midiArg("sendRPN", "lsb", lsb); if l == nil then return end
  local v = __midiArg("sendRPN", "value14", value); if v == nil then return end
  local s = 0xB0 | (c - 1)
  sendMidi({s, 0x65, m, s, 0x64, l, s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F})
end
-- Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
function sendSongPosition(beats)
  local b = __midiArg("sendSongPosition", "position", beats); if b == nil then return end
  sendMidi({0xF2, b & 0x7F, (b >> 7) & 0x7F})
end
function sendNoteOff(channel, note, velocity)
  local c = __midiArg("sendNoteOff", "channel", channel); if c == nil then return end
  local n = __note(note)
  if n == nil then return __badNote("sendNoteOff", note) end
  local v = __midiArg("sendNoteOff", "velocity", velocity == nil and 0 or velocity); if v == nil then return end
  sendMidi({0x80 | (c - 1), n, v})
end
function sendProgramChange(channel, program, bankMsb, bankLsb)
  local verb = "sendProgramChange"
  local c = __midiArg(verb, "channel", channel); if c == nil then return end
  local p = __midiArg(verb, "program", program); if p == nil then return end
  local msb, lsb = false, false
  if bankMsb ~= nil then msb = __midiArg(verb, "bank", bankMsb); if msb == nil then return end end
  if bankLsb ~= nil then lsb = __midiArg(verb, "bank", bankLsb); if lsb == nil then return end end
  -- Bank select first: a device applies the bank that was in force when the program change lands.
  if msb then sendCC(c, 0, msb) end
  if lsb then sendCC(c, 32, lsb) end
  sendMidi({0xC0 | (c - 1), p})
end
function sendPitchBend(channel, value)
  local c = __midiArg("sendPitchBend", "channel", channel); if c == nil then return end
  local v = __midiArg("sendPitchBend", "bend", value == nil and 8192 or value); if v == nil then return end
  sendMidi({0xE0 | (c - 1), v % 128, (v // 128) % 128})
end
function sendAftertouch(channel, pressure, note)
  local c = __midiArg("sendAftertouch", "channel", channel); if c == nil then return end
  if note == nil then
    local p = __midiArg("sendAftertouch", "pressure", pressure); if p == nil then return end
    return sendMidi({0xD0 | (c - 1), p})
  end
  local n = __note(note)
  if n == nil then return __badNote("sendAftertouch", note) end
  local p = __midiArg("sendAftertouch", "pressure", pressure); if p == nil then return end
  sendMidi({0xA0 | (c - 1), n, p})
end
function sendClock() sendMidi({0xF8}) end
-- Any action but stop and continue used to send Start, so "pause" started the sequencer.
function sendTransport(action)
  local actions = 'The actions are "start", "continue" and "stop".'
  if action == nil then
    logError("sendTransport: no action given, so nothing was sent. " .. actions)
    return
  end
  local status = nil
  if type(action) == "string" then
    status = ({ start = 0xFA, ["continue"] = 0xFB, stop = 0xFC })[string.lower(action)]
  end
  if status == nil then
    logError("sendTransport: " .. __shownValue(action) .. " is not a transport action, so nothing was sent. " .. actions)
    return
  end
  sendMidi({status})
end

-- @module ce.time
-- Musical time. One host primitive, __transportState, behind tempo() / isPlaying() /
-- transportInfo(), so the three can never disagree — and beatsToMs/msToBeats/syncTimer are pure
-- arithmetic on top, which is what keeps a delay-time calculation identical in every runtime.
--
-- Nothing here STARTS or STOPS the transport. A panel does not own the DAW's playhead, and
-- pretending otherwise is how a panel ends up fighting its host.
local function __transport()
  local t = __transportState()
  if t == nil then
    return { playing = false, bpm = nil, beats = 0, beatsPerBar = 4, source = "none", valid = false }
  end
  return t
end
function transportInfo()
  local t = __transport()
  local bpb = t.beatsPerBar or 4
  if bpb < 1 then bpb = 4 end
  local beats = t.beats or 0
  return {
    playing = t.playing == true, bpm = t.bpm, beats = beats,
    bar = math.floor(beats / bpb) + 1,
    beat = math.floor(beats % bpb) + 1,
    beatsPerBar = bpb, source = t.source or "none", valid = t.valid == true,
  }
end
function tempo() local t = __transport() if t.bpm and t.bpm > 0 then return t.bpm end return nil end
function isPlaying() return __transport().playing == true end
-- A helper's number argument as the transport reads it, with one not used as written said once
-- per helper and argument, in the words of the WebView runtime's timeWords.js. A position before
-- the start is the start, a bar of no beats is a bar of one, and text that is not a number is the
-- argument's default; each gave an answer for a number nobody wrote, without a word. For each
-- argument: what is used for one that is not a number, the least and the most it is read as, and
-- whether it is rounded first; a bpm falls back to the transport's tempo.
local __TIME_NUMBERS = {
  barBeatAt = { "ce.time.position", { beats = { fallback = 0, min = 0 }, beatsPerBar = { fallback = 4, min = 1 } } },
  stepAt = { "ce.time.step", { beats = { fallback = 0, min = 0 } } },
  stepsBetween = { "ce.time.steps", { from = { fallback = 0, min = 0 }, to = { fallback = 0, min = 0 }, max = { fallback = 16, min = 1, round = true } } },
  swingOffset = { "ce.time.swing", { step = { fallback = 0 }, amount = { fallback = 0, min = 0, max = 1 } } },
  cycleAt = { "ce.time.cycle", { beats = { fallback = 0, min = 0 }, bars = { fallback = 0.25, min = 0.25, max = 64 }, beatsPerBar = { fallback = 4, min = 1 } } },
  loopedBeats = { "ce.time.looped", { beats = { fallback = 0, min = 0 }, startBeats = { fallback = 0, min = 0 }, lengthBeats = { fallback = 0.01, min = 0.01 } } },
  beatsToMs = { "ce.time.beatsToMs", { beats = { fallback = 0 }, bpm = { tempo = true } } },
  msToBeats = { "ce.time.msToBeats", { ms = { fallback = 0 }, bpm = { tempo = true } } },
}
local __timeWarned = {}
local function __tread(fn, name, v)
  local helper = __TIME_NUMBERS[fn]
  local s = helper[2][name]
  if v == nil then
    if s.tempo then return nil end
    return s.fallback
  end
  local read = __realNumber(v)
  local n, why, used
  if s.tempo then
    if read ~= nil and read > 0 then return read end
    why = read == nil and "not a number" or "not above 0"
    used = "the transport's tempo"
  elseif read == nil then
    why = "not a number"; n = s.fallback; used = __shown(n)
  else
    n = read
    if s.round then n = math.floor(read + 0.5) end
    if s.min ~= nil and n < s.min then why = "less than " .. __shown(s.min); n = s.min; used = __shown(n)
    elseif s.max ~= nil and n > s.max then why = "more than " .. __shown(s.max); n = s.max; used = __shown(n)
    else return n end
  end
  local key = fn .. " " .. name
  if not __timeWarned[key] then
    __timeWarned[key] = true
    logWarn(helper[1] .. ": " .. name .. " is " .. __shownValue(v) .. ", which is " .. why .. ", so " .. used
      .. " was used. This is said only the first time.")
  end
  return n
end
-- A bpm that is not above 0, or not a number, is the transport's tempo, and says so (__tread). It
-- gave nothing here, where the WebView used the tempo, and "fast" raised an error.
function beatsToMs(beats, bpm)
  local b = __tread("beatsToMs", "beats", beats)
  local rate = __tread("beatsToMs", "bpm", bpm) or tempo()
  if rate == nil or rate <= 0 then return nil end
  return b * 60000 / rate
end
function msToBeats(ms, bpm)
  local m = __tread("msToBeats", "ms", ms)
  local rate = __tread("msToBeats", "bpm", bpm) or tempo()
  if rate == nil or rate <= 0 then return nil end
  return m * rate / 60000
end

-- startTimer / stopTimer are HOST bindings; these wrap them so the prelude knows which timers
-- exist (runningTimers) and which follow the tempo (syncTimer). Captured first, or the wrapper
-- would call itself.
local __hostStartTimer, __hostStopTimer = startTimer, stopTimer
local __timerIds, __syncFollow = {}, {}
-- An interval or a delay a script got wrong is refused, in the WebView runtime's words (timeRefused
-- there). `tonumber(ms) or 0` made startTimer(id, "fast"), startTimer(id) and startTimer(id, -100) a
-- timer at the host's 5 ms floor, and after("1s", fn) ran at once. A repeating interval is a number
-- above 0; a one-shot's delay a number from 0, where 0 is "as soon as the handler has returned".
-- Text is refused, "250" included. Returns true when it refused.
local function __timeRefused(call, value, unit, what, positive, outcome)
  local why
  if value == nil then why = "no " .. what .. " was given"
  elseif type(value) == "string" then why = '"' .. value .. '" is not a number of ' .. unit
  elseif type(value) ~= "number" then why = "the " .. what .. " is not a number of " .. unit
  elseif value ~= value or value == math.huge or value == -math.huge then
    why = "the " .. what .. " is not a finite number of " .. unit
  elseif positive and value <= 0 then why = __shown(value) .. " is not more than 0 " .. unit
  elseif not positive and value < 0 then why = __shown(value) .. " is less than 0 " .. unit end
  if why == nil then return false end
  logError(call .. ": " .. why .. ", so " .. outcome .. ".")
  return true
end
-- A number of beats, or a division's name ("1/16" is a quarter of a beat), any case. nil when
-- refused. The WebView runtime's beatsOf.
local function __beatsOf(call, value, positive, outcome)
  if type(value) == "string" then
    local wanted = string.lower(value)
    for i = 1, #__CE_DIVISION_NAMES do
      local id = __CE_DIVISION_NAMES[i]
      if string.lower(id) == wanted then return __CE_DIVISIONS[id] end
    end
    logError(call .. ': "' .. value .. '" is neither a number of beats nor a division, so ' .. outcome
      .. ". The divisions are " .. table.concat(__CE_DIVISION_NAMES, ", ") .. ".")
    return nil
  end
  if __timeRefused(call, value, "beats", "number of beats", positive, outcome) then return nil end
  return value
end
-- Start or re-time a timer whose interval the caller checked or worked out itself.
local function __armTimer(key, ms)
  -- An explicit millisecond interval REPLACES a musical one: this is a script asking for
  -- milliseconds, not beats.
  __syncFollow[key] = nil
  __timerIds[key] = true
  __hostStartTimer(key, math.floor((tonumber(ms) or 0) + 0.5))
end
function startTimer(id, ms)
  local key = tostring(id == nil and "" or id)
  if key == "" then return end
  if __timeRefused('ce.time.startTimer("' .. key .. '")', ms, "milliseconds", "interval", true, "no timer was started") then
    return
  end
  __armTimer(key, ms)
end
function stopTimer(id)
  local key = tostring(id == nil and "" or id)
  __syncFollow[key] = nil
  __timerIds[key] = nil
  __hostStopTimer(key)
end
-- The ids a script started BY NAME. One-shots are left out, all of them: after() hands back its id
-- already, and the note-off sendNote schedules is not a script's to cancel.
function runningTimers()
  local out = {}
  for k in pairs(__timerIds) do
    if string.sub(k, 1, 8) ~= "__after:" then out[#out + 1] = k end
  end
  table.sort(out)
  return out
end

-- syncTimer(id, beats [, opts]) — a timer whose interval is MUSICAL, and which FOLLOWS the tempo.
-- The first version computed the interval once and then kept firing at the old rate forever; a verb
-- called sync that silently desyncs is the wrong default. { follow = false } keeps that behaviour.
-- Re-arming RESETS THE PHASE, which is a hiccup at the moment of a tempo change and beats a timer
-- that is permanently at the wrong rate.
function syncTimer(id, beats, opts)
  local key = tostring(id == nil and "" or id)
  local length = __beatsOf('ce.time.syncTimer("' .. key .. '")', beats, true, "no timer was started")
  if length == nil then return end
  local ms = beatsToMs(length)
  if ms == nil then
    log("syncTimer(\"" .. tostring(id) .. "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.")
    return
  end
  __armTimer(key, ms)                                     -- clears any previous follow…
  if not (opts ~= nil and opts.follow == false) then
    __syncFollow[key] = length                            -- …and this puts it back on purpose
  end
end
-- Re-time every following sync timer. Armed from the prelude's own onTransport listener below, so
-- it belongs to no script and survives every reload of them.
local function __reArmSyncTimers()
  local pending = {}
  for k, v in pairs(__syncFollow) do pending[k] = v end
  for key, beats in pairs(pending) do
    local ms = beatsToMs(beats)
    -- No tempo any more: leave it running at the last one rather than stopping the music.
    if ms ~= nil then __armTimer(key, ms) __syncFollow[key] = beats end
  end
end
local __lastSyncBpm = nil
on("*", "onTransport", function(t)
  local bpm = t ~= nil and t.bpm or nil
  if bpm ~= __lastSyncBpm then
    __lastSyncBpm = bpm
    if bpm ~= nil then __reArmSyncTimers() end
  end
end)

-- after(ms, fn) — run fn ONCE, ms from now. Built on startTimer rather than on anything new: the
-- one-shot is a normal timer that removes itself, so stopTimer(id) cancels it like anything else.
--
-- The order inside the tick is why this exists instead of every panel hand-rolling it. The entry is
-- removed and the timer stopped BEFORE fn runs, so a callback that throws cannot leave a one-shot
-- repeating forever — which is precisely what the hand-rolled version does.
local __after, __afterN = {}, 0
-- The one-shot itself, unchecked: sendNote's duration works out its own delay. Global, because
-- sendNote is written above this and a local declared here would not be visible to it.
function __oneShot(ms, fn)
  __afterN = __afterN + 1
  local id = "__after:" .. tostring(__afterN)
  __after[id] = fn
  __armTimer(id, ms)
  return id
end
function after(ms, fn)
  if type(fn) ~= "function" then
    log("after(ms, fn) needs a function to run — nothing was scheduled")
    return nil
  end
  if __timeRefused("ce.time.after", ms, "milliseconds", "delay", false, "nothing was scheduled") then return nil end
  return __oneShot(ms, fn)
end
-- Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
-- A one-shot is NOT a timer the panel declared, so it is swallowed here rather than surfacing as
-- onTimer — otherwise every script with an onTimer handler would have to filter ids it never made.
on("*", "onTimer", function(info)
  local id = info ~= nil and info.id or nil
  if id == nil then return end
  local fn = __after[id]
  if fn == nil then return end
  __after[id] = nil
  stopTimer(id)
  fn()
end)

-- afterBeats(beats, fn) — after() with a MUSICAL delay. startTimer had syncTimer and the one-shot
-- had nothing, so "play this in half a bar" meant working the milliseconds out by hand. A one-shot
-- fires once, so the delay is computed WHEN YOU CALL IT and does not follow a later tempo change.
function afterBeats(beats, fn)
  local length = __beatsOf("ce.time.afterBeats", beats, false, "nothing was scheduled")
  if length == nil then return nil end
  local ms = beatsToMs(length)
  if ms == nil then
    log("afterBeats(): no tempo is being reported, so there is no delay to compute. Use after() with milliseconds, or wait for onTransport.")
    return nil
  end
  return after(ms, fn)
end

-- The grid, the clock and the transport's own arithmetic. Everything above answers "where is the
-- transport NOW" or "how long is a beat"; none of it answered where an ARBITRARY position falls,
-- what the grid is, or what the panel's own clock decided. Transliterated from
-- utils/transportLayout.js, which the WebView calls directly — including its coercions, because a
-- fallback that differs by one is a sequencer a step out.
local function __tnum(v, fallback)
  local n = tonumber(v)
  if n == nil or n ~= n or n == math.huge or n == -math.huge then return fallback end
  return n
end
local function __tclamp(v, lo, hi) local n = __tnum(v, lo) if n < lo then return lo elseif n > hi then return hi end return n end

-- A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and
-- only DIFFERENCES mean anything. It exists because this engine opens base, math, string and table
-- and NOT os, so until now a Lua script could not read a clock at all.
function nowMs() return __nowMs() end

-- The panel's division vocabulary, in both directions. An unknown name returns nil rather than the
-- component's 1/16 fallback: a component has to keep running, a script that mistyped should find out.
-- It found out only by getting nil, so __division says so as well, in the words of the WebView
-- runtime's divisionId. Any case is read: "1/8t" is "1/8T", because the names differ only by D and
-- T and nothing is ambiguous.
local function __division(verb, name)
  if type(name) == "string" then
    local wanted = string.lower(name)
    for i = 1, #__CE_DIVISION_NAMES do
      local id = __CE_DIVISION_NAMES[i]
      if string.lower(id) == wanted then return __CE_DIVISIONS[id] end
    end
  end
  logError(verb .. ": " .. (name == nil and "no division given" or (__shownValue(name) .. " is not a division"))
    .. ", so there is no answer. The divisions are " .. table.concat(__CE_DIVISION_NAMES, ", ") .. ".")
  return nil
end
function beatsPerDivision(name) return __division("ce.time.division", name) end
function divisionNames()
  local out = {}
  for i = 1, #__CE_DIVISION_NAMES do
    local id = __CE_DIVISION_NAMES[i]
    out[i] = { id = id, label = __CE_DIVISION_LABELS[id], beats = __CE_DIVISIONS[id] }
  end
  return out
end

-- Where a beat position falls musically — for ANY position, not only the transport's. Bars and
-- beats count from 1 as musicians do; `text` is the Transport component's own readout.
function barBeatAt(beats, beatsPerBar)
  local b = __tread("barBeatAt", "beats", beats)
  local perBar = __tread("barBeatAt", "beatsPerBar", beatsPerBar)
  local bar = math.floor(b / perBar) + 1
  local beat = math.floor(b % perBar) + 1
  local tick = math.floor((b % 1) * __CE_TIME.ppqn)
  return { bar = bar, beat = beat, tick = tick,
           text = tostring(bar) .. "." .. tostring(beat) .. "." .. string.format("%02d", tick) }
end

function stepAt(beats, division)
  local per = __division("ce.time.step", division)
  if per == nil then return nil end
  return math.floor(__tread("stepAt", "beats", beats) / per)
end

-- The step boundaries crossed between two readings. A stalled frame must FIRE the steps it slept
-- through rather than drop them — the difference between a stutter and a hole in the bar. Capped so
-- returning from a long stall does not dump hundreds of notes, and what was dropped is REPORTED. On
-- an overrun the most RECENT steps are kept: catching up to now beats replaying where you were.
function stepsBetween(fromBeats, toBeats, division, maxSteps)
  local per = __division("ce.time.steps", division)
  if per == nil then return nil end
  local from = __tread("stepsBetween", "from", fromBeats)
  local to = __tread("stepsBetween", "to", toBeats)
  local cap = __tread("stepsBetween", "max", maxSteps)
  if to <= from then return { steps = {}, dropped = 0 } end
  local first = math.floor(from / per) + 1
  local last = math.floor(to / per)
  if last < first then return { steps = {}, dropped = 0 } end
  local total = last - first + 1
  local kept = total < cap and total or cap
  local steps = {}
  for i = last - kept + 1, last do steps[#steps + 1] = i end
  return { steps = steps, dropped = total - kept }
end

-- The panel's shuffle: every odd step later by up to half a step, in BEATS. Two sequencers at "the
-- same" swing are only the same swing if they compute it the same way.
function swingOffset(step, amount, division)
  local per = __division("ce.time.swing", division)
  if per == nil then return nil end
  local n = __tread("swingOffset", "step", step)
  local s = __tread("swingOffset", "amount", amount)
  if math.abs(math.floor(n + 0.5)) % 2 == 1 then return s * 0.5 * per end
  return 0
end

-- For anything whose rate is a LOOP LENGTH in bars rather than a step. Derived from the position,
-- never accumulated, so a cycle running for an hour is still exactly on the bar line.
function cycleAt(beats, bars, beatsPerBar)
  local b = __tread("cycleAt", "beats", beats)
  local n = __tread("cycleAt", "bars", bars)
  local len = n * __tread("cycleAt", "beatsPerBar", beatsPerBar)
  if len < 0.01 then len = 0.01 end
  return { phase = ((b / len) % 1 + 1) % 1, count = math.floor(b / len), length = len }
end

-- Fold a timeline position into a loop. Before the loop start the position is untouched — you can
-- run IN to a loop from earlier in the song. `pass` is which time round, -1 before the loop is
-- reached; watching it for CHANGES is how you see a wrap without a handler that can miss one.
function loopedBeats(beats, startBeats, lengthBeats)
  local b = __tread("loopedBeats", "beats", beats)
  local st = __tread("loopedBeats", "startBeats", startBeats)
  local len = __tread("loopedBeats", "lengthBeats", lengthBeats)
  if b < st then return { beats = b, pass = -1 } end
  return { beats = st + ((b - st) % len), pass = math.floor((b - st) / len) }
end

-- Tempo from tap times, in the milliseconds nowMs() reports. Taps more than resetMs apart start a
-- NEW measurement rather than averaging across the pause — the thing every hand-rolled tap gets
-- wrong, because the first tap after a break poisons the average.
function tapTempo(timestamps, resetMs)
  if type(timestamps) ~= "table" then return nil end
  local list = {}
  for i = 1, #timestamps do local v = __tnum(timestamps[i], 0) if v > 0 then list[#list + 1] = v end end
  if #list < 2 then return nil end
  local limit = __tnum(resetMs, 2000)
  local sum, count = 0, 0
  for i = #list, 2, -1 do
    local gap = list[i] - list[i - 1]
    if gap <= 0 or gap > limit then break end
    sum = sum + gap; count = count + 1
  end
  if count == 0 then return nil end
  return __tclamp(60000 / (sum / count), __CE_TIME.minBpm, __CE_TIME.maxBpm)
end

-- Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note). The MEDIAN, not the
-- mean: one late pulse from a USB hiccup drags an average around, and a wobbling readout is worse
-- than a slightly stale one.
function clockTempo(intervalsMs)
  if type(intervalsMs) ~= "table" then return nil end
  local list = {}
  for i = 1, #intervalsMs do local v = __tnum(intervalsMs[i], 0) if v > 0 then list[#list + 1] = v end end
  if #list == 0 then return nil end
  table.sort(list)
  local mid = math.floor(#list / 2)
  local median
  if #list % 2 == 1 then median = list[mid + 1] else median = (list[mid] + list[mid + 1]) / 2 end
  if median <= 0 then return nil end
  return __tclamp(60000 / (median * __CE_TIME.ppqn), __CE_TIME.minBpm, __CE_TIME.maxBpm)
end

-- @module ce.anim
-- Values that move over time. The engine lives in the host (ScriptRuntime) so ONE list exists and
-- the position is a pure function of elapsed time — an incremental integrator in each runtime
-- would drift apart from the others within a second.
--
-- `done` is a FUNCTION the script owns, so the host cannot call it: the engine emits __animDone and
-- this routes it to the function stored here. Exactly how after()'s one-shot works, and the reason
-- a completion callback can be a plain argument in every language.
--
-- Each move with a done gets a token of its own ("lua:3"), handed to the host as `__done` and
-- emitted back with the result, and its function is stored under that. It was stored under the
-- path, or for a list under a number the host counted separately, so replacing a move called the
-- new move's done for the old one, and two lists from two scripts or engines crossed their dones
-- (ScriptRuntime::fireAnimationDone says how). The prelude is shared by every Lua script, so one
-- count keeps the tokens apart.
local __animDone, __animSeq = {}, 0

-- An envelope's shape is SAMPLED here, with mapCurve() — ce.math.map, the Envelope component's
-- own envValueAt — and the host interpolates the samples. That is what lets the host engine run
-- an envelope at all: mapCurve()'s per-point curves live in this prelude, not in C++. This called
-- map(), which no prelude defines, so Lua and JavaScript stopped with an error and Python's own
-- map() made every sample 0.
local __ANIM_SAMPLES = 1024
local function __animSample(points)
  local out = {}
  for i = 0, __ANIM_SAMPLES do
    local y = tonumber(mapCurve(i / __ANIM_SAMPLES, points))
    out[i + 1] = y or 0
  end
  return out
end

local function __animPaths(path)
  if type(path) == "table" then
    local out = {}
    for i = 1, #path do local p = tostring(path[i]) if p ~= "" then out[#out + 1] = p end end
    return out
  end
  return nil
end

local function __animStart(kind, path, target, opts)
  opts = opts or {}
  local list = __animPaths(path)
  local o = {}
  for k, v in pairs(opts) do o[k] = v end
  o.done = nil
  if type(opts.done) == "function" then
    __animSeq = __animSeq + 1
    local token = "lua:" .. tostring(__animSeq)
    __animDone[token] = opts.done
    o.__done = token
  end
  -- The host answers whether the move started: not when a colour property is the path or one of a
  -- list's paths, and then nothing in the list starts and its done is never called, so it is let go.
  local started = __animate(kind, list ~= nil and list or tostring(path), tonumber(target) or 0, o) == true
  if not started and o.__done ~= nil then __animDone[o.__done] = nil end
  return started
end

-- to and spring move to a number, and only a number. A target that is not one ("full", "100px",
-- "#FF0000") used to move the value to 0; text that is a number ("100") is read as one, as it always
-- was. In the words of the WebView runtime's animationTarget.
local function __animTarget(verb, target)
  local n = __realNumber(target)
  if n ~= nil then return n end
  local why
  if target == nil then why = "no number to move to was given"
  elseif type(target) == "string" then why = '"' .. target .. '" is not a number'
  else why = "the target given is not a number" end
  logError(verb .. ": " .. why .. ", so nothing was started.")
  return nil
end
function animateTo(path, target, opts)
  local n = __animTarget("ce.anim.to", target)
  if n == nil then return false end
  return __animStart("to", path, n, opts)
end
function animateSpring(path, target, opts)
  local n = __animTarget("ce.anim.spring", target)
  if n == nil then return false end
  return __animStart("spring", path, n, opts)
end
-- envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
-- `to` has one destination; an envelope goes up before it comes down, which is the single most
-- obvious thing a synth panel animates and the one thing `to` cannot express.
--
-- A point is { x = , y = } or the two as a pair, each a number or text that is one. One that is not,
-- or whose x is not from 0 to 1, starts nothing and says why, in the words of the WebView runtime's
-- envelopeRefusal (CE/web/src/CE_Application/scripting/animEnvelope.js): the sampler dropped a point
-- it could not read, and never reached one whose x is past 0 to 1, both without a word. A y past 0
-- to 1 is a level past `from` or `to`, and is read as it is.
function animateEnvelope(path, points, opts)
  if type(points) ~= "table" or #points < 2 then
    log("ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.")
    return false
  end
  local function written(v)
    if v == nil then return "none was given" end
    if type(v) == "string" then return '"' .. v .. '" is not' end
    if type(v) == "number" and __realNumber(v) ~= nil then return __cshown(v) .. " is not" end
    return "the value given is not"
  end
  local count = #points
  for i = 1, count do
    local p, which = points[i], "point " .. i .. " of " .. count
    if type(p) ~= "table" then
      logError("ce.anim.envelope: " .. which .. " is { x, y } or the two as a pair, and " .. written(p) .. ", so nothing was started.")
      return false
    end
    local x, y = __pointParts(p)
    local nx = __realNumber(x)
    if nx == nil or nx < 0 or nx > 1 then
      local hint = ""
      if nx ~= nil and nx / 100 >= 0 and nx / 100 <= 1 then
        hint = " If you meant " .. __cshown(nx) .. " out of 100, write " .. __cfour(nx / 100) .. "."
      end
      logError("ce.anim.envelope: the x of " .. which .. " is a number from 0 to 1, and " .. written(x) .. ", so nothing was started." .. hint)
      return false
    end
    if __realNumber(y) == nil then
      logError("ce.anim.envelope: the y of " .. which .. " is a number, and " .. written(y) .. ", so nothing was started.")
      return false
    end
  end
  local o = {}
  if opts ~= nil then for k, v in pairs(opts) do o[k] = v end end
  o.samples = __animSample(points)
  o.from = tonumber(o.from) or 0
  local to = tonumber(o.to) or 1
  o.to = nil
  return __animStart("envelope", path, to, o)
end
function animateStop(path) __animateStop(path == nil and "" or tostring(path)) end
function animateRunning(path) return __animateRunning(path == nil and "" or tostring(path)) end
function animateValue(path) return __animateValue(path == nil and "" or tostring(path)) end
function animateList() return __animateList() end
function animatePause(path) return __animatePause(path == nil and "" or tostring(path)) end
function animateResume(path) return __animateResume(path == nil and "" or tostring(path)) end
function animateReverse(path) return __animateReverse(path == nil and "" or tostring(path)) end
function animateFinish(path) return __animateFinish(path == nil and "" or tostring(path)) end

-- Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
-- done(completed): one argument, true or false, for one path and for a list alike. It was handed a
-- table, { path, completed } or { paths, completed }, and a table is always true, so
-- `if completed then` read a cancelled move as a finished one.
on("*", "__animDone", function(info)
  if info == nil or info.token == nil then return end
  local fn = __animDone[info.token]
  __animDone[info.token] = nil
  if fn ~= nil then fn(info.completed == true) end
end)

-- @module ce.device
-- Device READS. All four are arithmetic-free wrappers over one host primitive, __deviceQuery,
-- the way the channel messages are over sendMidi: the SHAPE a script sees is assembled here, so
-- no engine can invent a different parameter descriptor. Without a device host __deviceQuery
-- returns nil and the host has already said why, so these hand back nil / an empty list rather
-- than pretending the synth has nothing.
local function __role(r) if r == nil or r == "" then return "mainSynth" end return tostring(r) end
-- @module ce.panel
-- snapshot / restore. The only two ce.panel verbs that are NOT panel-view only: creating a control
-- needs a renderer, reading and writing a value does not — and "put the panel back how it was
-- before the solo" is a footswitch action in a DAW with the window shut.
--
-- A control with no value of its own is LEFT OUT rather than recorded as nothing, so restoring a
-- snapshot cannot blank a label by writing nil over it.
-- each(fn) — fn(name) for every control, containers included, in document order.
function panelEach(fn)
  if type(fn) ~= "function" then
    log("each(fn) needs a function to call — nothing was walked")
    return 0
  end
  local names = __panelQuery("controls", nil)
  if names == nil then return 0 end
  local n = 0
  for _, name in ipairs(names) do fn(name) n = n + 1 end
  return n
end
function panelSnapshot()
  local out = {}
  local names = __panelQuery("controls", nil)
  if names == nil then return out end
  for _, name in ipairs(names) do
    local v = get(name .. ".value")
    if v ~= nil then out[name] = v end
  end
  return out
end
function panelRestore(snap)
  if type(snap) ~= "table" then return 0 end
  local n = 0
  for name, v in pairs(snap) do
    -- A name the panel no longer has is skipped rather than failing the whole restore: a snapshot
    -- taken before an edit is still worth most of what it holds.
    if get(name .. ".value") ~= nil then set(name .. ".value", v) n = n + 1 end
  end
  return n
end

-- @module ce.device
function deviceProfile(role) return __deviceQuery("profile", { role = __role(role) }) end
-- read / write. `read` is the LAST KNOWN value — what the synth most recently told us — not a live
-- query: asking the synth is asynchronous and this verb is not. `write` encodes through the device
-- profile and sends; it returns whether the message went out, not whether the synth accepted it.
function deviceRead(id, role) return __deviceQuery("read", { role = __role(role), id = tostring(id) }) end
function deviceWrite(id, value, role) return __deviceWrite(tostring(id), value, __role(role)) end
function deviceConnected(role) return __deviceQuery("connected", { role = __role(role) }) == true end
-- Preset recall, through the profile's own action. The slot is the device-global number the
-- profile's banks partition, not a program number.
function recallPreset(slot, opts) return __deviceQuery("recallPreset", { role = __role(opts and opts.role), slot = tonumber(slot) }) end
function preset(role) return __deviceQuery("preset", { role = __role(role) }) end
-- The profile DOCUMENT, rather than the catalogue row profile() answers from. `variables` is what
-- every recipe interpolates ($channel, $deviceId), so it decides what every message the panel sends
-- looks like; `coverage` is what the profile claims it can do, in its own words.
function deviceVariables(role) return __deviceQuery("variables", { role = __role(role) }) end
function deviceTiming(role) return __deviceQuery("timing", { role = __role(role) }) end
function deviceCoverage(feature, role)
  return __deviceQuery("coverage", { role = __role(role), feature = feature and tostring(feature) or nil })
end
function deviceRecipes(role) return __deviceQuery("recipes", { role = __role(role) }) or {} end
function deviceRequests(role) return __deviceQuery("requests", { role = __role(role) }) or {} end
-- The two writes. They land on THIS PROJECT's override, never on the shared profile.
function deviceSetVariable(name, value, role)
  return __deviceSet("variable", tostring(name), value, __role(role)) == true
end
function deviceSetTiming(name, ms, role)
  return __deviceSet("timing", tostring(name), ms, __role(role)) == true
end
function deviceParameters(opts)
  opts = opts or {}
  local q = { role = __role(opts.role), query = opts.query, group = opts.group,
              type = opts.type, access = opts.access, limit = opts.limit }
  local r = __deviceQuery("parameters", q)
  if r == nil then return {} end
  return r
end
function deviceParameter(id, role)
  return __deviceQuery("parameter", { role = __role(role), id = tostring(id) })
end
-- ports() — what is actually plugged in. connected(role) only answers yes/no for a role somebody
-- configured in advance; this enumerates the real ports, so a panel can offer a choice or notice a
-- device that showed up.
function devicePorts(opts)
  opts = opts or {}
  local r = __deviceQuery("ports", { direction = opts.direction })
  if r == nil then return {} end
  return r
end
-- defineParameter / defineDump — teaching the app a synth it was not shipped knowing. The ROLE
-- rides inside the spec rather than as a fourth host argument, the way it rides inside
-- __deviceQuery's payload: one ABI slot, and adding a field later changes no engine's signature.
local function __define(what, id, spec, role)
  spec = spec or {}
  if role ~= nil and role ~= "" then spec.role = tostring(role) end
  return __deviceDefine(what, tostring(id), spec) == true
end
function deviceDefineParameter(id, spec, role) return __define("parameter", id, spec, role) end
function deviceDefineDump(kind, spec, role) return __define("dump", kind, spec, role) end

-- requestDump(kind [, fn [, opts]]) — closing the loop. Fire-and-forget was the odd one out:
-- deviceRead answers where it is called, and a dump's answer turned up at onDumpReceived with
-- nothing tying it to the request.
--
-- Assembled here rather than in the host for the same reason after() is: the callback is a language
-- value, and a host holding one would need a per-engine way to call it back. The waiter is removed
-- BEFORE the callback runs, so a throw inside it cannot leave one armed for the next dump.
local __dumpWaiters = {}
local function __resolveDumps(kind, role, values, err)
  local i = 1
  while i <= #__dumpWaiters do
    local w = __dumpWaiters[i]
    if not w.done and (w.kind == "" or w.kind == kind) then
      w.done = true
      table.remove(__dumpWaiters, i)
      local ok, e = pcall(w.fn, values, { ok = err == nil, kind = kind, role = role or "", error = err or "" })
      if not ok then log("requestDump callback failed: " .. tostring(e)) end
    else
      i = i + 1
    end
  end
end
function requestDump(kind, fn, opts)
  kind = tostring(kind or "")
  if type(fn) == "function" then
    local ms = 3000
    if opts ~= nil and tonumber(opts.timeout) ~= nil and tonumber(opts.timeout) > 0 then ms = tonumber(opts.timeout) end
    local waiter = { kind = kind, fn = fn, done = false }
    table.insert(__dumpWaiters, waiter)
    -- Resolved rather than left hanging: a synth that is off, or that does not answer this
    -- request, is the common case and not the exotic one.
    after(ms, function()
      if waiter.done then return end
      __resolveDumps(kind, "", nil, "no dump arrived within " .. tostring(math.floor(ms)) .. "ms")
    end)
  end
  __requestDump(kind)
end
-- Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
-- AFTER the declared events, so "the dump arrived" and "the dump I asked for arrived" cannot
-- observe the panel in two different states.
on("*", "onDumpReceived", function(info)
  __resolveDumps(info ~= nil and tostring(info.kind or "") or "",
                 info ~= nil and tostring(info.role or "") or "",
                 info ~= nil and info.values or {}, nil)
end)

-- @module ce.storage
-- ce.storage. `state` is a plain table: each script runs in its own sol::environment, which lives
-- as long as the script is loaded, so it persists between handler calls without any host help.
-- Settings go through the host, because they outlive the session.
state = {}

-- Three scopes, differing in who sees a value and where it lives (design doc §43):
--   panel  — shared by every script on the panel, in the document, travels with it. The default,
--            and exactly what settings have always been.
--   script — private to the calling script, the way `state` already is.
--   local  — THIS MACHINE only, never written into the document.
-- script scope is a key prefix on the panel store rather than a store of its own: a private setting
-- should persist and travel exactly like a shared one, and only its visibility differs.
local __CE_SCOPES = { "panel", "script", "local" }
-- U+0001 and not U+0000: a key travels through juce::String, which is NUL-terminated and would
-- truncate there, and then the editor and the export would disagree about what a private key is
-- even called. All four runtimes spell the prefix this way.
local __CE_SCRIPT_PREFIX = "\001script:"

-- The scope asked for, or nothing when it is not one this build knows. Refusing rather than falling
-- back to "panel": storing a value in a scope the caller did not ask for is how a private setting
-- quietly becomes a shared one, and a typo in a scope name would be the way it happened. A typo in
-- the KEY ({ scop = "script" }) is the same leak, so any key but `scope` is refused as well, sorted
-- because pairs() has no order and every runtime must name them in one. A key that is a number is
-- a list entry and is left alone. `verb` is the call's namespaced path; the WebView runtime's
-- storageScopeOf says the same words.
function __storageScope(opts, verb)
  local raw
  if type(opts) == "string" then raw = opts
  elseif type(opts) == "table" then
    local unknown = {}
    for k in pairs(opts) do
      if type(k) == "string" and k ~= "scope" and not k:match("^%d+$") then unknown[#unknown + 1] = k end
    end
    if #unknown > 0 then
      table.sort(unknown)
      local quoted = {}
      for i, k in ipairs(unknown) do quoted[i] = '"' .. k .. '"' end
      local listed = quoted[1]
      if #quoted > 1 then
        listed = table.concat(quoted, ", ", 1, #quoted - 1) .. " and " .. quoted[#quoted]
      end
      logError(verb .. ": " .. listed .. (#unknown == 1 and " is not one of its options" or " are not among its options")
        .. ", so nothing was done. Its only option is scope.")
      return nil
    end
    raw = opts.scope
  end
  if raw == nil or raw == "" then return "panel" end
  local scope = tostring(raw)
  for _, known in ipairs(__CE_SCOPES) do if known == scope then return scope end end
  logError(verb .. ': "' .. scope .. '" is not a scope, so nothing was done. One of: panel, script, local.')
  return nil
end

-- Which of the host's two real stores a scope lives in.
function __storageStore(scope) if scope == "local" then return "local" end return "panel" end

-- The key a scope actually stores under.
function __storageKeyFor(scope, key)
  local k = key == nil and "" or tostring(key)
  if scope == "script" then return __CE_SCRIPT_PREFIX .. tostring(__scriptId or "") .. ":" .. k end
  return k
end

-- …and back, for listing: nothing when the stored key does not belong to this scope.
function __storageKeyFrom(scope, stored)
  if scope == "script" then
    local prefix = __CE_SCRIPT_PREFIX .. tostring(__scriptId or "") .. ":"
    if stored:sub(1, #prefix) == prefix then return stored:sub(#prefix + 1) end
    return nil
  end
  -- A panel listing hides other scripts' private keys rather than showing an unusable spelling.
  if stored:sub(1, #__CE_SCRIPT_PREFIX) == __CE_SCRIPT_PREFIX then return nil end
  return stored
end

function saveSetting(key, value, opts)
  local scope = __storageScope(opts, "ce.storage.saveSetting")
  if scope == nil then return false end
  local store = __storageStore(scope)
  if __settingsAvailable(store) ~= true then
    logError('saveSetting("' .. tostring(key) .. '"): the ' .. scope .. ' store is unavailable '
             .. "here, so nothing was saved. ce.storage.info() says which stores are available.")
    return false
  end
  __saveSetting(__storageKeyFor(scope, key), value, store)
  return true
end

function loadSetting(key, fallback, opts)
  local scope = __storageScope(opts, "ce.storage.loadSetting")
  if scope == nil then return fallback end
  local v = __loadSetting(__storageKeyFor(scope, key), __storageStore(scope))
  if v == nil then return fallback end
  return v
end

-- settings() lists every saved key; forget() deletes one and says whether there was one.
function listSettings(opts)
  local scope = __storageScope(opts, "ce.storage.settings")
  if scope == nil then return {} end
  local raw = __listSettings(__storageStore(scope)) or {}
  local out = {}
  for _, stored in ipairs(raw) do
    local k = __storageKeyFrom(scope, tostring(stored))
    if k ~= nil then out[#out + 1] = k end
  end
  return out
end

function forgetSetting(key, opts)
  local scope = __storageScope(opts, "ce.storage.forget")
  if scope == nil then return false end
  return __forgetSetting(__storageKeyFor(scope, key), __storageStore(scope)) == true
end

-- Every setting as a table — the read every other module got. Listing keys and looping to fetch each
-- one was the only way before.
function allSettings(opts)
  local scope = __storageScope(opts, "ce.storage.all")
  if scope == nil then return {} end
  local out = {}
  for _, k in ipairs(listSettings(opts)) do out[k] = loadSetting(k, nil, opts) end
  return out
end

-- Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
-- keys alone: "clear my settings" must not mean "clear everybody's".
function clearSettings(opts)
  -- Checked here first, so a refusal names clear rather than the settings() it calls.
  if __storageScope(opts, "ce.storage.clear") == nil then return 0 end
  local gone = 0
  for _, k in ipairs(listSettings(opts)) do if forgetSetting(k, opts) then gone = gone + 1 end end
  return gone
end

-- Which store a scope is talking to, and what is in it. `available` is the honest field: false means
-- writes in this scope will not stick, which is worth saying once rather than per key.
function storageInfo(opts)
  local scope = __storageScope(opts, "ce.storage.info")
  if scope == nil then return nil end
  local contents = allSettings(opts)
  local count = 0
  for _ in pairs(contents) do count = count + 1 end
  local text = encodeJson(contents)
  return {
    scope = scope,
    -- What the store IS, rather than what it is called: in the player, panel-scope settings live in
    -- the DAW project state and machine-local ones do not.
    backing = scope == "local" and "machine" or "project",
    available = __settingsAvailable(__storageStore(scope)) == true,
    count = count,
    bytes = text == nil and -1 or #text,
  }
end

-- JSON. A Q10 exception, and the same one now() was: this engine opens base, math, string and table
-- and there is NO json module, while JavaScript and Python each have their own with different names
-- and different edge cases. "Use the language's own" was never available to a cross-runtime script,
-- so all four grow one spelling here — and this one is the reason the module exists.

-- A number the way JavaScript and Python spell it. Lua's own tostring gives "1.0" where both of the
-- others give "1", and "%.14g" gives 0.33333333333333 where both give 0.3333333333333333, so
-- neither can be used directly.
local function __jsonExp(s)
  -- C pads the exponent to two digits ("1e-07"); JavaScript does not ("1e-7").
  return (s:gsub("[eE]([-+])0*(%d)", "e%1%2"))
end

local function __jsonNumber(v)
  if v ~= v then return "null" end                            -- NaN, as JSON.stringify spells it
  if v == math.huge or v == -math.huge then return "null" end
  if v == 0 then return "0" end                               -- and -0, which JavaScript spells "0"
  local a = v < 0 and -v or v
  -- An integral value below 1e21 prints as digits in JavaScript, however it is stored here.
  if v == math.floor(v) and a < 1e21 then return string.format("%.0f", v) end
  -- The band where C and JavaScript disagree about notation: C goes exponential below 1e-4,
  -- JavaScript below 1e-6.
  if a < 1e-4 and a >= 1e-6 then
    for p = 1, 20 do
      local s = string.format("%." .. p .. "f", v)
      if tonumber(s) == v then return s end
    end
  end
  -- Otherwise the shortest spelling that reads back as the same double — which is what JavaScript
  -- and Python both print, and the only way three languages spell one float alike.
  for p = 1, 17 do
    local s = string.format("%." .. p .. "g", v)
    if tonumber(s) == v then return __jsonExp(s) end
  end
  return __jsonExp(string.format("%.17g", v))
end

local __JSON_ESCAPES = {
  ['"'] = '\\"', ["\\"] = "\\\\", ["\b"] = "\\b", ["\f"] = "\\f",
  ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t",
}

local function __jsonString(s)
  -- Control characters and the two structural ones only. Bytes above 0x7F pass through, so UTF-8
  -- text stays UTF-8 — which is what JSON.stringify does and what Python does with
  -- ensure_ascii=False.
  return '"' .. (s:gsub('[\0-\31\\"]', function(c)
    return __JSON_ESCAPES[c] or string.format("\\u%04x", c:byte())
  end)) .. '"'
end

-- A table with keys exactly 1..n is an array; anything else is an object. An EMPTY table is both at
-- once in Lua, and the whole API already reads it as the empty list.
local function __jsonIsArray(t)
  local n, count = 0, 0
  for k in pairs(t) do
    count = count + 1
    if math.type(k) ~= "integer" or k < 1 then return false, 0 end
    if k > n then n = k end
  end
  return count == n, n
end

local function __jsonEnc(v, indent, depth, seen)
  local t = type(v)
  if v == nil then return "null" end
  if t == "boolean" then return v and "true" or "false" end
  if t == "number" then return __jsonNumber(v) end
  if t == "string" then return __jsonString(v) end
  if t ~= "table" then return nil end        -- a function, a userdata: no JSON form, as in JS
  if seen[v] then error("cycle", 0) end       -- the whole encode fails, the way JSON.stringify does
  seen[v] = true

  local nl, pad, padIn, colon = "", "", "", ":"
  if indent > 0 then
    nl = "\n"
    pad = string.rep(" ", indent * depth)
    padIn = string.rep(" ", indent * (depth + 1))
    colon = ": "
  end

  local isArray, n = __jsonIsArray(v)
  local parts = {}
  if isArray then
    if n == 0 then seen[v] = nil; return "[]" end
    for i = 1, n do
      -- An element with no JSON form is null in JavaScript, not a dropped element.
      parts[#parts + 1] = padIn .. (__jsonEnc(v[i], indent, depth + 1, seen) or "null")
    end
    seen[v] = nil
    return "[" .. nl .. table.concat(parts, "," .. nl) .. nl .. pad .. "]"
  end

  -- Keys come out SORTED, in every runtime. Not a stylistic choice: a Lua table has no insertion
  -- order to preserve, so sorted is the only ordering all four runtimes are able to produce — and
  -- it is the ordering that makes two encodings of the same structure comparable.
  local keys, byName = {}, {}
  for k in pairs(v) do
    local name = tostring(k)
    keys[#keys + 1] = name
    byName[name] = v[k]
  end
  table.sort(keys)
  for _, name in ipairs(keys) do
    -- A member with no JSON form is dropped, the way JSON.stringify drops it.
    local s = __jsonEnc(byName[name], indent, depth + 1, seen)
    if s ~= nil then parts[#parts + 1] = padIn .. __jsonString(name) .. colon .. s end
  end
  seen[v] = nil
  if #parts == 0 then return "{}" end
  return "{" .. nl .. table.concat(parts, "," .. nl) .. nl .. pad .. "}"
end

function encodeJson(value, opts)
  if value == nil then return nil end
  local indent = 0
  if type(opts) == "table" then
    local n = tonumber(opts.indent)
    if n ~= nil and n > 0 then indent = math.floor(n) end
  end
  local ok, res = pcall(__jsonEnc, value, indent, 0, {})
  if not ok then return nil end
  return res
end

-- The decoder. `null` reads as NOTHING — an absent member, a skipped element — because a Lua table
-- cannot hold one, and a value the four runtimes cannot all hold is not a value this API has.
local __JSON_NULL = {}

local function __utf8Char(cp)
  if cp < 0x80 then return string.char(cp) end
  if cp < 0x800 then return string.char(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)) end
  if cp < 0x10000 then
    return string.char(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
  end
  return string.char(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                     0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
end

local function __jsonSpace(s, i)
  local _, j = s:find("^[ \t\n\r]*", i)
  return j + 1
end

local __jsonValue     -- forward declaration: the three parsers below are mutually recursive

local function __jsonParseString(s, i)
  if s:sub(i, i) ~= '"' then error("string", 0) end
  i = i + 1
  local out = {}
  while true do
    local c = s:sub(i, i)
    if c == "" then error("eof", 0) end
    if c == '"' then return table.concat(out), i + 1 end
    if c == "\\" then
      local e = s:sub(i + 1, i + 1)
      i = i + 2
      if e == "n" then out[#out + 1] = "\n"
      elseif e == "t" then out[#out + 1] = "\t"
      elseif e == "r" then out[#out + 1] = "\r"
      elseif e == "b" then out[#out + 1] = "\b"
      elseif e == "f" then out[#out + 1] = "\f"
      elseif e == "/" or e == "\\" or e == '"' then out[#out + 1] = e
      elseif e == "u" then
        local hex = s:sub(i, i + 3)
        if #hex < 4 then error("escape", 0) end
        local cp = tonumber(hex, 16)
        if cp == nil then error("escape", 0) end
        i = i + 4
        -- A surrogate pair is one character, not two: 😀 is U+1F600.
        if cp >= 0xD800 and cp <= 0xDBFF and s:sub(i, i + 1) == "\\u" then
          local low = tonumber(s:sub(i + 2, i + 5), 16)
          if low ~= nil and low >= 0xDC00 and low <= 0xDFFF then
            cp = 0x10000 + (cp - 0xD800) * 0x400 + (low - 0xDC00)
            i = i + 6
          end
        end
        out[#out + 1] = __utf8Char(cp)
      else error("escape", 0) end
    else
      out[#out + 1] = c
      i = i + 1
    end
  end
end

local function __jsonParseArray(s, i)
  i = __jsonSpace(s, i + 1)
  local out = {}
  if s:sub(i, i) == "]" then return out, i + 1 end
  while true do
    local v
    v, i = __jsonValue(s, i)
    -- null is skipped rather than stored: a hole in a Lua array is not a value any runtime can read
    -- back, so [1, null, 2] is {1, 2} everywhere.
    if v ~= __JSON_NULL then out[#out + 1] = v end
    i = __jsonSpace(s, i)
    local c = s:sub(i, i)
    if c == "," then i = __jsonSpace(s, i + 1)
    elseif c == "]" then return out, i + 1
    else error("array", 0) end
  end
end

local function __jsonParseObject(s, i)
  i = __jsonSpace(s, i + 1)
  local out = {}
  if s:sub(i, i) == "}" then return out, i + 1 end
  while true do
    local key
    key, i = __jsonParseString(s, i)
    i = __jsonSpace(s, i)
    if s:sub(i, i) ~= ":" then error("object", 0) end
    local v
    v, i = __jsonValue(s, __jsonSpace(s, i + 1))
    if v ~= __JSON_NULL then out[key] = v end
    i = __jsonSpace(s, i)
    local c = s:sub(i, i)
    if c == "," then i = __jsonSpace(s, i + 1)
    elseif c == "}" then return out, i + 1
    else error("object", 0) end
  end
end

__jsonValue = function(s, i)
  i = __jsonSpace(s, i)
  local c = s:sub(i, i)
  if c == "{" then return __jsonParseObject(s, i) end
  if c == "[" then return __jsonParseArray(s, i) end
  if c == '"' then return __jsonParseString(s, i) end
  if s:sub(i, i + 3) == "true" then return true, i + 4 end
  if s:sub(i, i + 4) == "false" then return false, i + 5 end
  if s:sub(i, i + 3) == "null" then return __JSON_NULL, i + 4 end
  -- JSON's number grammar exactly, so that what this reads and what JSON.parse reads are the same
  -- set of strings: no "1." and no ".5", and no leading zero (checked below, where the grammar
  -- cannot say it).
  local num = s:match("^%-?%d+%.%d+[eE][-+]?%d+", i)
           or s:match("^%-?%d+%.%d+", i)
           or s:match("^%-?%d+[eE][-+]?%d+", i)
           or s:match("^%-?%d+", i)
  if num ~= nil and num ~= "" then
    local digits = num:match("^%-?(%d+)")
    if #digits > 1 and digits:sub(1, 1) == "0" then error("number", 0) end
    local n = tonumber(num)
    if n ~= nil then return n, i + #num end
  end
  error("value", 0)
end

function decodeJson(text)
  local s = text == nil and "" or tostring(text)
  local ok, value, rest = pcall(__jsonValue, s, 1)
  if not ok then return nil end
  -- Trailing junk is malformed, not "the prefix parsed": telling a bad config from an empty one is
  -- the whole point of returning nothing.
  if __jsonSpace(s, rest) <= #s then return nil end
  if value == __JSON_NULL then return nil end
  return value
end

-- @module -
-- BEGIN GENERATED option keys — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- An options table holding a key its member does not take REFUSES the call: nothing is done, the
-- console names the keys and the options the member has, and the call answers what the member
-- answers for any other refusal. The WebView runtime does the same from the same lists in
-- panelApi.js (panelRuntime.js, applyOptionChecks), in the same words. A key that is a number is a
-- list entry, not an option. The keys are named sorted, in every runtime, because a table keeps no
-- order a message could follow.
local __CE_OPTIONS = {
  ["set"] = { path = "set", at = 3, refusal = "nothing", names = { "transmit" } },
  ["requestDump"] = { path = "ce.device.requestDump", at = 3, refusal = "false", names = { "timeout" } },
  ["recallPreset"] = { path = "ce.device.recallPreset", at = 2, refusal = "result", names = { "role" } },
  ["animateTo"] = { path = "ce.anim.to", at = 3, refusal = "false", names = { "duration", "beats", "sync", "curve", "damping", "frequency", "from", "delay", "stagger", "repeat", "pingpong", "done" } },
  ["animateSpring"] = { path = "ce.anim.spring", at = 3, refusal = "false", names = { "duration", "damping", "frequency", "from", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done" } },
  ["animateEnvelope"] = { path = "ce.anim.envelope", at = 3, refusal = "false", names = { "from", "to", "duration", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done" } },
  ["syncTimer"] = { path = "ce.time.syncTimer", at = 3, refusal = "nothing", names = { "follow" } },
  ["deviceParameters"] = { path = "ce.device.parameters", at = 1, refusal = "empty list", names = { "role", "query", "group", "type", "access", "limit" } },
  ["deviceDefineParameter"] = { path = "ce.device.defineParameter", at = 2, refusal = "false", names = { "name", "group", "type", "min", "max", "access", "choices", "trueValue", "falseValue", "cc", "nrpn", "sysex", "channel", "encoding", "nibbles", "checksum", "variables", "length", "pad" }, nested = { ["nrpn"] = { names = { "msb", "lsb" } } } },
  ["deviceDefineDump"] = { path = "ce.device.defineDump", at = 2, refusal = "false", names = { "name", "request", "match", "prefix", "suffix", "offset", "size", "checksum", "fields" }, nested = { ["match"] = { names = { "prefix", "suffix" } } } },
  ["devicePorts"] = { path = "ce.device.ports", at = 1, refusal = "empty list", names = { "direction" } },
  ["checksum"] = { path = "ce.midi.checksum", at = 3, refusal = "nothing", names = { "offset" } },
  ["panic"] = { path = "ce.midi.panic", at = 1, refusal = "nothing", names = { "channel", "resetControllers" } },
  ["encodeJson"] = { path = "ce.storage.encode", at = 2, refusal = "nothing", names = { "indent" } },
  ["bytesRead"] = { path = "ce.midi.read", at = 4, refusal = "nothing", names = { "bits", "order" } },
  ["bytesWrite"] = { path = "ce.midi.write", at = 5, refusal = "nothing", names = { "bits", "order" } },
}
-- Byte order, which is what JavaScript's sort and Python's sorted() give these names. table.sort's
-- own < compares with the C library's collation, which a locale can change.
local function __ce_optionLess(a, b)
  for i = 1, math.min(#a, #b) do
    local x, y = string.byte(a, i), string.byte(b, i)
    if x ~= y then return x < y end
  end
  return #a < #b
end
local function __ce_optionShape(shape)
  shape.known = {}
  for _, name in ipairs(shape.names) do shape.known[name] = true end
  for _, inner in pairs(shape.nested or {}) do __ce_optionShape(inner) end
end
-- The keys `opts` holds that `shape` does not list, in groups: its own, then those inside each
-- option that lists fields of its own, in the contract's order.
local function __ce_unknownOptions(opts, shape, parent, out)
  local unknown = {}
  for k in pairs(opts) do
    if type(k) == "string" and not shape.known[k] and not string.match(k, "^%d+$") then unknown[#unknown + 1] = k end
  end
  if #unknown > 0 then
    table.sort(unknown, __ce_optionLess)
    out[#out + 1] = { parent = parent, keys = unknown, shape = shape }
  end
  for _, name in ipairs(shape.names) do
    local inner = shape.nested and shape.nested[name]
    if inner ~= nil and type(opts[name]) == "table" then
      __ce_unknownOptions(opts[name], inner, parent == "" and name or (parent .. "." .. name), out)
    end
  end
  return out
end
local function __ce_optionsLine(path, group)
  local p = group.parent
  local quoted = {}
  for i, k in ipairs(group.keys) do quoted[i] = '"' .. (p == "" and "" or (p .. ".")) .. k .. '"' end
  local what
  if #quoted == 1 then what = quoted[1] .. " is not one of its options, so nothing was done."
  else what = table.concat(quoted, ", ", 1, #quoted - 1) .. " and " .. quoted[#quoted] .. " are not among its options, so nothing was done." end
  local names, listed = group.shape.names, nil
  if #names == 1 then listed = (p == "" and "Its only option" or ("The only option of " .. p)) .. " is " .. names[1] .. "."
  else listed = (p == "" and "Its options" or ("The options of " .. p)) .. " are: " .. table.concat(names, ", ") .. "." end
  return path .. ": " .. what .. " " .. listed
end
local function __ce_refused(refusal, lines)
  if refusal == "false" then return false end
  if refusal == "zero" then return 0 end
  if refusal == "empty list" then return {} end
  if refusal == "result" then return { ok = false, error = table.concat(lines, " ") } end
  return nil
end
for __id, __spec in pairs(__CE_OPTIONS) do
  local __fn = _G[__id]
  if type(__fn) == "function" then
    __ce_optionShape(__spec)
    _G[__id] = function(...)
      local __opts = (select(__spec.at, ...))
      if type(__opts) == "table" then
        local __groups = __ce_unknownOptions(__opts, __spec, "", {})
        if #__groups > 0 then
          local __lines = {}
          for __i, __group in ipairs(__groups) do
            __lines[__i] = __ce_optionsLine(__spec.path, __group)
            logError(__lines[__i])
          end
          return __ce_refused(__spec.refusal, __lines)
        end
      end
      return __fn(...)
    end
  end
end
-- END GENERATED option keys
-- BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
-- on top. ce.core is global: its members are never namespaced, so they appear here only for
-- discoverability (ce.core.set is the same function as set).
local __CE_MODULES = {
  ["ce.core"] = { action = "defineAction", compute = "compute", emit = "emit", error = "logError", get = "get", intercept = "intercept", log = "log", noTransmit = "noTransmit", off = "off", on = "on", run = "run", set = "set", transmit = "transmit", warn = "logWarn", watch = "watch" },
  ["ce.midi"] = { checksum = "checksum", denibblize = "denibblize", feed = "feedMidi", find = "bytesFind", from14bit = "from14bit", from7bit = "from7bit", fromAscii = "fromAscii", fromBase64 = "bytesFromBase64", fromHex = "bytesFromHex", fromNibbles = "fromNibbles", fromOffset = "fromOffset", fromSigned = "fromSigned", getBits = "getBits", interceptIn = "interceptMidiIn", interceptOut = "interceptMidiOut", nibblize = "nibblize", panic = "panic", put = "bytesPut", read = "bytesRead", route = "routeMidi", sendAftertouch = "sendAftertouch", sendCC = "sendCC", sendClock = "sendClock", sendMidi = "sendMidi", sendNRPN = "sendNRPN", sendNote = "sendNote", sendNoteOff = "sendNoteOff", sendPitchBend = "sendPitchBend", sendProgramChange = "sendProgramChange", sendRPN = "sendRPN", sendSongPosition = "sendSongPosition", sendSysex = "sendSysex", sendTransport = "sendTransport", setBits = "setBits", slice = "bytesSlice", to14bit = "to14bit", to7bit = "to7bit", toAscii = "toAscii", toBase64 = "bytesToBase64", toHex = "bytesToHex", toNibbles = "toNibbles", toOffset = "toOffset", toSigned = "toSigned", write = "bytesWrite" },
  ["ce.device"] = { applyDump = "applyDump", bind = "deviceBind", buildDump = "buildDump", connected = "deviceConnected", coverage = "deviceCoverage", defineDump = "deviceDefineDump", defineParameter = "deviceDefineParameter", parameter = "deviceParameter", parameters = "deviceParameters", ports = "devicePorts", preset = "preset", profile = "deviceProfile", read = "deviceRead", recallPreset = "recallPreset", recipes = "deviceRecipes", requestDump = "requestDump", requests = "deviceRequests", sendDump = "sendDump", setTiming = "deviceSetTiming", setVariable = "deviceSetVariable", timing = "deviceTiming", unbind = "deviceUnbind", variables = "deviceVariables", write = "deviceWrite" },
  ["ce.math"] = { almost = "almost", alpha = "colourAlpha", angle = "angleOf", approach = "approach", bipolar = "bipolar", blend = "blend", blendBy = "blendBy", chance = "randomBool", choice = "randomChoice", clamp = "clamp", crossfade = "crossfade", curve = "curve", darken = "darken", dbPosition = "dbPosition", dbToGain = "dbToGain", deadzone = "deadzone", degrees = "toDegrees", denorm = "denorm", distance = "distance", euclid = "euclid", fold = "fold", fromARGB = "colourFromArgb", fromHsl = "hslToHex", fromRGBA = "colourFromRgba", gainToDb = "gainToDb", gaussian = "randomGaussian", hex = "rgbToHex", hsl = "hexToHsl", hysteresis = "hysteresis", index = "indexOfRange", lerp = "lerp", lighten = "lighten", map = "mapCurve", max = "maxOf", mean = "meanOf", median = "median", min = "minOf", mix = "mixColour", norm = "norm", polar = "polar", quantize = "quantizeTo", radians = "toRadians", random = "random", randomFloat = "randomFloat", rgb = "hexToRgb", round = "round", roundTo = "roundTo", scale = "scale", seed = "randomSeed", shape = "shapeCurve", shuffle = "shuffle", smooth = "smooth", snap = "snap", stream = "randomStream", sum = "sumOf", ticks = "tickStops", unipolar = "unipolar", unshape = "unshape", walk = "randomWalk", weights = "weightsFor", wrap = "wrap" },
  ["ce.music"] = { arp = "arpOrder", chord = "chordNotes", degree = "scaleDegree", degreeChord = "degreeChord", inScale = "inScale", lead = "voiceLead", name = "noteName", number = "noteNumber", octaves = "expandOctaves", quality = "chordQuality", quantize = "quantizeNote", scale = "scaleNotes", spelling = "noteSpelling" },
  ["ce.time"] = { after = "after", afterBeats = "afterBeats", beatsToMs = "beatsToMs", clockTempo = "clockTempo", cycle = "cycleAt", division = "beatsPerDivision", divisions = "divisionNames", looped = "loopedBeats", msToBeats = "msToBeats", now = "nowMs", playing = "isPlaying", position = "barBeatAt", startTimer = "startTimer", step = "stepAt", steps = "stepsBetween", stopTimer = "stopTimer", swing = "swingOffset", syncTimer = "syncTimer", tap = "tapTempo", tempo = "tempo", timers = "runningTimers", transport = "transportInfo" },
  ["ce.anim"] = { envelope = "animateEnvelope", finish = "animateFinish", list = "animateList", pause = "animatePause", play = "animatePlay", resume = "animateResume", reverse = "animateReverse", running = "animateRunning", spring = "animateSpring", stop = "animateStop", to = "animateTo", value = "animateValue" },
  ["ce.ui"] = { choose = "uiChoose", copy = "uiCopy", dialog = "uiDialog", dismiss = "uiDismiss", notify = "uiNotify", prompt = "uiPrompt", state = "uiState", status = "uiStatus", update = "uiUpdate" },
  ["ce.draw"] = { arc = "drawArc", batch = "drawBatch", blend = "drawBlend", circle = "drawCircle", clear = "drawClear", clip = "drawClip", curve = "drawCurve", ellipse = "drawEllipse", fill = "drawFill", gradient = "drawGradient", grid = "drawGrid", image = "drawImage", line = "drawLine", lines = "drawLines", measure = "drawMeasure", opacity = "drawOpacity", path = "drawPath", pixelText = "drawPixelText", points = "drawPoints", polygon = "drawPolygon", rect = "drawRect", redraw = "drawRedraw", restore = "drawRestore", save = "drawSave", stroke = "drawStroke", text = "drawText", transform = "drawTransform" },
  ["ce.panel"] = { align = "panelAlign", batch = "panelBatch", circle = "panelCircle", clone = "panelClone", create = "panelCreate", define = "panelDefine", destroy = "panelDestroy", distribute = "panelDistribute", each = "panelEach", entries = "panelEntries", entry = "panelEntry", find = "panelFind", flip = "panelFlip", grid = "panelGrid", info = "panelInfo", keep = "panelKeep", match = "panelMatch", order = "panelOrder", parent = "panelParent", patch = "panelPatch", rect = "panelRect", restore = "panelRestore", snapshot = "panelSnapshot", types = "panelTypes", undefine = "panelUndefine" },
  ["ce.storage"] = { all = "allSettings", clear = "clearSettings", decode = "decodeJson", encode = "encodeJson", forget = "forgetSetting", info = "storageInfo", loadSetting = "loadSetting", saveSetting = "saveSetting", settings = "listSettings", state = "state" },
  ["ce.image"] = { asset = "imageAsset", assets = "imageAssets", clear = "imageClear", embed = "imageEmbed", icon = "imageIcon", load = "imageLoad", read = "imageRead", set = "imageSet" },
  ["ce.text"] = { axis = "textAxis", fit = "textFit", font = "textFont", fonts = "textFonts", measure = "textMeasure", read = "textRead", style = "textStyle" },
  ["ce.components.split"] = { channel = "splitChannel", mute = "splitMute", point = "splitPoint", preset = "splitPreset", read = "splitRead", transpose = "splitTranspose" },
  ["ce.components.phrase"] = { cell = "phraseCell", clear = "phraseClear", direction = "phraseDirection", key = "phraseKey", read = "phraseRead", run = "phraseRun", scale = "phraseScale", seed = "phraseSeed", transpose = "phraseTranspose" },
  ["ce.components.recorder"] = { bars = "recorderBars", clear = "recorderClear", countIn = "recorderCountIn", load = "recorderLoad", nudge = "recorderNudge", play = "recorderPlay", quantize = "recorderQuantize", read = "recorderRead", record = "recorderRecord", shift = "recorderShift", source = "recorderSource", stop = "recorderStop", store = "recorderStore", transpose = "recorderTranspose", undo = "recorderUndo" },
  ["ce.components.harmony"] = { channel = "harmonyChannel", degree = "harmonyDegree", inversion = "harmonyInversion", keepPlayed = "harmonyKeepPlayed", key = "harmonyKey", mode = "harmonyMode", octave = "harmonyOctave", outOfKey = "harmonyOutOfKey", read = "harmonyRead", scale = "harmonyScale", shape = "harmonyShape", size = "harmonySize", strum = "harmonyStrum", voiceLeading = "harmonyVoiceLeading", voicing = "harmonyVoicing" },
  ["ce.components.setlist"] = { crossfade = "setlistCrossfade", enable = "setlistEnable", jump = "setlistGoto", next = "setlistNext", prev = "setlistPrev", read = "setlistRead", wrap = "setlistWrap" },
  ["ce.components.arp"] = { baseOctave = "arpBaseOctave", channel = "arpChannel", chordType = "arpChordType", degree = "arpDegree", division = "arpDivision", editable = "arpEditable", euclid = "arpEuclid", euclidPulses = "arpEuclidPulses", euclidRotate = "arpEuclidRotate", euclidSteps = "arpEuclidSteps", followPanelKey = "arpFollowPanelKey", gate = "arpGate", inputChannel = "arpInputChannel", key = "arpKey", latch = "arpLatch", link = "arpLink", mute = "arpMute", octaves = "arpOctaves", pattern = "arpPattern", phase = "arpPhase", rate = "arpRate", read = "arpRead", run = "arpRun", scale = "arpScale", showHeader = "arpShowHeader", showNotes = "arpShowNotes", source = "arpSource", swing = "arpSwing", sync = "arpSync", velocity = "arpVelocity" },
  ["ce.components.chordpad"] = { baseOctave = "chordPadBaseOctave", channel = "chordPadChannel", chordType = "chordPadChordType", echo = "chordPadEcho", echoChannel = "chordPadEchoChannel", editable = "chordPadEditable", followPanelKey = "chordPadFollowPanelKey", gridCols = "chordPadGridCols", inversion = "chordPadInversion", key = "chordPadKey", latch = "chordPadLatch", layout = "chordPadLayout", mode = "chordPadMode", noteSpan = "chordPadNoteSpan", octave = "chordPadOctave", read = "chordPadRead", scale = "chordPadScale", showPiano = "chordPadShowPiano", showRomans = "chordPadShowRomans", strum = "chordPadStrum", velocity = "chordPadVelocity", voicing = "chordPadVoicing" },
  ["ce.components.noteribbon"] = { baseNote = "noteRibbonBaseNote", bendRange = "noteRibbonBendRange", channel = "noteRibbonChannel", echo = "noteRibbonEcho", echoChannel = "noteRibbonEchoChannel", editable = "noteRibbonEditable", followPanelKey = "noteRibbonFollowPanelKey", key = "noteRibbonKey", latch = "noteRibbonLatch", modAxis = "noteRibbonModAxis", modCc = "noteRibbonModCc", mode = "noteRibbonMode", octaves = "noteRibbonOctaves", orientation = "noteRibbonOrientation", read = "noteRibbonRead", scale = "noteRibbonScale", showHeader = "noteRibbonShowHeader", showNames = "noteRibbonShowNames", velocity = "noteRibbonVelocity", velocityFrom = "noteRibbonVelocityFrom" },
  ["ce.components.drumpads"] = { baseNote = "drumPadsBaseNote", channel = "drumPadsChannel", choke = "drumPadsChoke", colour = "drumPadsColour", cols = "drumPadsCols", cornerBottomLeft = "drumPadsCornerBottomLeft", cornerBottomRight = "drumPadsCornerBottomRight", cornerSize = "drumPadsCornerSize", cornerTopLeft = "drumPadsCornerTopLeft", cornerTopRight = "drumPadsCornerTopRight", echo = "drumPadsEcho", echoChannel = "drumPadsEchoChannel", editable = "drumPadsEditable", fill = "drumPadsFill", flamMs = "drumPadsFlamMs", gate = "drumPadsGate", ghostVelocity = "drumPadsGhostVelocity", label = "drumPadsLabel", map = "drumPadsMap", mode = "drumPadsMode", note = "drumPadsNote", origin = "drumPadsOrigin", read = "drumPadsRead", roll = "drumPadsRoll", rollDelay = "drumPadsRollDelay", rollHz = "drumPadsRollHz", rollRate = "drumPadsRollRate", rollSync = "drumPadsRollSync", rollVelocity = "drumPadsRollVelocity", rows = "drumPadsRows", showHeader = "drumPadsShowHeader", showLabels = "drumPadsShowLabels", showNotes = "drumPadsShowNotes", size = "drumPadsSize", velocity = "drumPadsVelocity", velocityFrom = "drumPadsVelocityFrom", zones = "drumPadsZones" },
  ["ce.components.turing"] = { division = "turingDivision", editable = "turingEditable", fill = "turingFill", gate = "turingGate", length = "turingLength", phase = "turingPhase", quantize = "turingQuantize", randomness = "turingRandomness", rate = "turingRate", read = "turingRead", run = "turingRun", showDivisions = "turingShowDivisions", showGate = "turingShowGate", size = "turingSize", step = "turingStep", sync = "turingSync" },
  ["ce.components.looper"] = { bars = "looperBars", editable = "looperEditable", fill = "looperFill", insert = "looperInsert", lane = "looperLane", laneRest = "looperLaneRest", phase = "looperPhase", quantize = "looperQuantize", read = "looperRead", remove = "looperRemove", run = "looperRun", seconds = "looperSeconds", showDivisions = "looperShowDivisions", showGrid = "looperShowGrid", showPlayhead = "looperShowPlayhead", size = "looperSize", sync = "looperSync" },
  ["ce.components.orbit"] = { bars = "orbitBars", editable = "orbitEditable", fill = "orbitFill", insert = "orbitInsert", node = "orbitNode", nodeAngle = "orbitNodeAngle", nodeDepth = "orbitNodeDepth", nodeRadius = "orbitNodeRadius", nodeRatio = "orbitNodeRatio", phase = "orbitPhase", rate = "orbitRate", read = "orbitRead", remove = "orbitRemove", run = "orbitRun", showRings = "orbitShowRings", showSpokes = "orbitShowSpokes", showTrails = "orbitShowTrails", showValues = "orbitShowValues", size = "orbitSize", sync = "orbitSync" },
  ["ce.components.kinetic"] = { bounce = "kineticBounce", editable = "kineticEditable", friction = "kineticFriction", gravity = "kineticGravity", keepAlive = "kineticKeepAlive", launch = "kineticLaunch", read = "kineticRead", run = "kineticRun", showTrail = "kineticShowTrail", showWalls = "kineticShowWalls", sync = "kineticSync", velocity = "kineticVelocity" },
  ["ce.components.constellation"] = { bars = "constellationBars", blend = "constellationBlend", editable = "constellationEditable", links = "constellationLinks", mode = "constellationMode", probe = "constellationProbe", rate = "constellationRate", read = "constellationRead", run = "constellationRun", showField = "constellationShowField", showLabels = "constellationShowLabels", showLinks = "constellationShowLinks", sync = "constellationSync" },
  ["ce.components.timbre"] = { anchorX = "timbreAnchorX", anchorY = "timbreAnchorY", axisX = "timbreAxisX", axisY = "timbreAxisY", editable = "timbreEditable", fill = "timbreFill", insert = "timbreInsert", move = "timbreMove", power = "timbrePower", read = "timbreRead", remove = "timbreRemove", showAnchors = "timbreShowAnchors", showField = "timbreShowField", showReadout = "timbreShowReadout", size = "timbreSize" },
  ["ce.components.router"] = { cc = "routerCc", channel = "routerChannel", curveShape = "routerCurveShape", curveX = "routerCurveX", curveY = "routerCurveY", deadzone = "routerDeadzone", dest = "routerDest", destDepth = "routerDestDepth", editable = "routerEditable", fill = "routerFill", input = "routerInput", insert = "routerInsert", invert = "routerInvert", poly = "routerPoly", read = "routerRead", remove = "routerRemove", showDivisions = "routerShowDivisions", showGrid = "routerShowGrid", size = "routerSize", source = "routerSource", sourceControl = "routerSourceControl" },
  ["ce.components.macro"] = { editable = "macroEditable", fill = "macroFill", insert = "macroInsert", label = "macroLabel", read = "macroRead", remove = "macroRemove", showDivisions = "macroShowDivisions", showLanes = "macroShowLanes", showValues = "macroShowValues", size = "macroSize", slot = "macroSlot", slotCurve = "macroSlotCurve", slotDepth = "macroSlotDepth", slotMax = "macroSlotMax", slotMin = "macroSlotMin", value = "macroValue" },
  ["ce.components.matrix"] = { bipolar = "matrixBipolar", cell = "matrixCell", cellStyle = "matrixCellStyle", clear = "matrixClear", editable = "matrixEditable", fill = "matrixFill", read = "matrixRead", showLabels = "matrixShowLabels", showValues = "matrixShowValues", size = "matrixSize", step = "matrixStep" },
  ["ce.components.constraint"] = { editable = "constraintEditable", fill = "constraintFill", gap = "constraintGap", insert = "constraintInsert", member = "constraintMember", mode = "constraintMode", read = "constraintRead", remove = "constraintRemove", showBadge = "constraintShowBadge", showValues = "constraintShowValues", size = "constraintSize" },
  ["ce.components.envelope"] = { addOnDoubleClick = "envelopeAddOnDoubleClick", editable = "envelopeEditable", fill = "envelopeFill", fillUnder = "envelopeFillUnder", insert = "envelopeInsert", loop = "envelopeLoop", loopEnd = "envelopeLoopEnd", loopStart = "envelopeLoopStart", phase = "envelopePhase", phaseSource = "envelopePhaseSource", pointCurve = "envelopePointCurve", pointX = "envelopePointX", pointY = "envelopePointY", preset = "envelopePreset", read = "envelopeRead", remove = "envelopeRemove", showGrid = "envelopeShowGrid", showPlayhead = "envelopeShowPlayhead", size = "envelopeSize", snapX = "envelopeSnapX", snapY = "envelopeSnapY", sustain = "envelopeSustain", timeMax = "envelopeTimeMax" },
  ["ce.components.ribbon"] = { bipolar = "ribbonBipolar", editable = "ribbonEditable", label = "ribbonLabel", orientation = "ribbonOrientation", read = "ribbonRead", returnCurve = "ribbonReturnCurve", returnMode = "ribbonReturnMode", returnTime = "ribbonReturnTime", returnValue = "ribbonReturnValue", showGlow = "ribbonShowGlow", showValue = "ribbonShowValue", snap = "ribbonSnap", style = "ribbonStyle", value = "ribbonValue", valuePrecision = "ribbonValuePrecision" },
  ["ce.components.crossfader"] = { bipolar = "crossfaderBipolar", detent = "crossfaderDetent", editable = "crossfaderEditable", labelA = "crossfaderLabelA", labelB = "crossfaderLabelB", law = "crossfaderLaw", mix = "crossfaderMix", orientation = "crossfaderOrientation", read = "crossfaderRead", returnCurve = "crossfaderReturnCurve", returnMode = "crossfaderReturnMode", returnTime = "crossfaderReturnTime", returnValue = "crossfaderReturnValue", showGains = "crossfaderShowGains", showLabels = "crossfaderShowLabels" },
  ["ce.components.joystick"] = { bipolar = "joystickBipolar", cornerLabel = "joystickCornerLabel", editable = "joystickEditable", fill = "joystickFill", move = "joystickMove", read = "joystickRead", returnAxes = "joystickReturnAxes", returnCurve = "joystickReturnCurve", returnMode = "joystickReturnMode", returnTime = "joystickReturnTime", returnValue = "joystickReturnValue", showCorners = "joystickShowCorners", showCrosshair = "joystickShowCrosshair", showGrid = "joystickShowGrid", showTrail = "joystickShowTrail", size = "joystickSize" },
  ["ce.components.meter"] = { dbCeil = "meterDbCeil", dbFloor = "meterDbFloor", decay = "meterDecay", fill = "meterFill", gradient = "meterGradient", holdMs = "meterHoldMs", insert = "meterInsert", label = "meterLabel", orientation = "meterOrientation", peakHold = "meterPeakHold", read = "meterRead", remove = "meterRemove", scale = "meterScale", showScaleLabels = "meterShowScaleLabels", showTicks = "meterShowTicks", showValue = "meterShowValue", size = "meterSize", source = "meterSource", value = "meterValue", valueMax = "meterValueMax", valueMin = "meterValueMin", valuePrecision = "meterValuePrecision", valuePrefix = "meterValuePrefix", valueSuffix = "meterValueSuffix", zoneAt = "meterZoneAt" },
  ["ce.components.transport"] = { beatUnit = "transportBeatUnit", beatsPerBar = "transportBeatsPerBar", bpm = "transportBpm", clockDevice = "transportClockDevice", clockOut = "transportClockOut", countIn = "transportCountIn", editable = "transportEditable", loop = "transportLoop", loopBars = "transportLoopBars", loopStart = "transportLoopStart", read = "transportRead", runOnLoad = "transportRunOnLoad", showPosition = "transportShowPosition", showTap = "transportShowTap", source = "transportSource", swing = "transportSwing" },
  ["ce.components.panic"] = { centreBend = "panicSetCentreBend", channel = "panicSetChannel", clearLocal = "panicSetClearLocal", editable = "panicSetEditable", label = "panicSetLabel", read = "panicSetRead", resetControllers = "panicSetResetControllers", scope = "panicSetScope", showSummary = "panicSetShowSummary" },
  ["ce.components.lcd"] = { anim = "lcdAnim", animFps = "lcdAnimFps", animLoop = "lcdAnimLoop", animPreset = "lcdAnimPreset", animSpeed = "lcdAnimSpeed", backlight = "lcdBacklight", backlightSource = "lcdBacklightSource", blink = "lcdBlink", blinkRate = "lcdBlinkRate", brightness = "lcdBrightness", brightnessSource = "lcdBrightnessSource", clear = "lcdClear", contrast = "lcdContrast", cursor = "lcdCursor", cursorAt = "lcdCursorAt", cursorBlink = "lcdCursorBlink", editText = "lcdEditText", fill = "lcdFill", glyph = "lcdGlyph", read = "lcdRead", scroll = "lcdScroll", scrollMode = "lcdScrollMode", scrollRepeat = "lcdScrollRepeat", scrollSpeed = "lcdScrollSpeed", showGhost = "lcdShowGhost", showGlass = "lcdShowGlass", showGrid = "lcdShowGrid", showScanlines = "lcdShowScanlines", size = "lcdSize", text = "lcdText", value = "lcdValue", valueMax = "lcdValueMax", valueMin = "lcdValueMin", valuePrecision = "lcdValuePrecision", valuePrefix = "lcdValuePrefix", valueSource = "lcdValueSource", valueSuffix = "lcdValueSuffix" },
  ["ce.components.pixel"] = { anim = "pixelAnim", animFps = "pixelAnimFps", animLoop = "pixelAnimLoop", animPreset = "pixelAnimPreset", animSpeed = "pixelAnimSpeed", backlight = "pixelBacklight", backlightSource = "pixelBacklightSource", blink = "pixelBlink", brightness = "pixelBrightness", brightnessSource = "pixelBrightnessSource", contrast = "pixelContrast", editText = "pixelEditText", gamma = "pixelGamma", glow = "pixelGlow", h = "pixelH", label = "pixelLabel", layoutTransition = "pixelLayoutTransition", read = "pixelRead", show = "pixelShow", showGhost = "pixelShowGhost", showGlass = "pixelShowGlass", showGrid = "pixelShowGrid", showScanlines = "pixelShowScanlines", text = "pixelText", transitionMs = "pixelTransitionMs", w = "pixelW", x = "pixelX", y = "pixelY" },
}
local __CE_ORDER = { "ce.core", "ce.midi", "ce.device", "ce.math", "ce.music", "ce.time", "ce.anim", "ce.ui", "ce.draw", "ce.panel", "ce.storage", "ce.image", "ce.text", "ce.components.split", "ce.components.phrase", "ce.components.recorder", "ce.components.harmony", "ce.components.setlist", "ce.components.arp", "ce.components.chordpad", "ce.components.noteribbon", "ce.components.drumpads", "ce.components.turing", "ce.components.looper", "ce.components.orbit", "ce.components.kinetic", "ce.components.constellation", "ce.components.timbre", "ce.components.router", "ce.components.macro", "ce.components.matrix", "ce.components.constraint", "ce.components.envelope", "ce.components.ribbon", "ce.components.crossfader", "ce.components.joystick", "ce.components.meter", "ce.components.transport", "ce.components.panic", "ce.components.lcd", "ce.components.pixel" }
local __CE_META = {
  { id = "ce.core", version = "1.1", runtime = "any" },
  { id = "ce.midi", version = "1.3", runtime = "any" },
  { id = "ce.device", version = "1.3", runtime = "any" },
  { id = "ce.math", version = "1.8", runtime = "any" },
  { id = "ce.music", version = "1.2", runtime = "any" },
  { id = "ce.time", version = "1.3", runtime = "any" },
  { id = "ce.anim", version = "1.1", runtime = "any" },
  { id = "ce.ui", version = "1.2", runtime = "webview" },
  { id = "ce.draw", version = "1.2", runtime = "webview" },
  { id = "ce.panel", version = "1.4", runtime = "any" },
  { id = "ce.storage", version = "1.2", runtime = "any" },
  { id = "ce.image", version = "1.0", runtime = "webview" },
  { id = "ce.text", version = "1.0", runtime = "webview" },
  { id = "ce.components.split", version = "1.0", runtime = "webview" },
  { id = "ce.components.phrase", version = "1.0", runtime = "webview" },
  { id = "ce.components.recorder", version = "1.0", runtime = "webview" },
  { id = "ce.components.harmony", version = "1.0", runtime = "webview" },
  { id = "ce.components.setlist", version = "1.0", runtime = "webview" },
  { id = "ce.components.arp", version = "1.0", runtime = "webview" },
  { id = "ce.components.chordpad", version = "1.0", runtime = "webview" },
  { id = "ce.components.noteribbon", version = "1.0", runtime = "webview" },
  { id = "ce.components.drumpads", version = "1.0", runtime = "webview" },
  { id = "ce.components.turing", version = "1.0", runtime = "webview" },
  { id = "ce.components.looper", version = "1.0", runtime = "webview" },
  { id = "ce.components.orbit", version = "1.0", runtime = "webview" },
  { id = "ce.components.kinetic", version = "1.0", runtime = "webview" },
  { id = "ce.components.constellation", version = "1.0", runtime = "webview" },
  { id = "ce.components.timbre", version = "1.0", runtime = "webview" },
  { id = "ce.components.router", version = "1.0", runtime = "webview" },
  { id = "ce.components.macro", version = "1.0", runtime = "webview" },
  { id = "ce.components.matrix", version = "1.0", runtime = "webview" },
  { id = "ce.components.constraint", version = "1.0", runtime = "webview" },
  { id = "ce.components.envelope", version = "1.0", runtime = "webview" },
  { id = "ce.components.ribbon", version = "1.0", runtime = "webview" },
  { id = "ce.components.crossfader", version = "1.0", runtime = "webview" },
  { id = "ce.components.joystick", version = "1.0", runtime = "webview" },
  { id = "ce.components.meter", version = "1.0", runtime = "webview" },
  { id = "ce.components.transport", version = "1.0", runtime = "webview" },
  { id = "ce.components.panic", version = "1.0", runtime = "webview" },
  { id = "ce.components.lcd", version = "1.0", runtime = "webview" },
  { id = "ce.components.pixel", version = "1.0", runtime = "webview" },
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
    -- An explicit "return nil", NOT a bare return: a Lua function with no return statement
    -- yields ZERO values, so tostring(gatedRead()) errors with "value expected" rather than
    -- printing "nil". Void commands never showed it; a gated read shows it on the first call.
    return nil
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

        // set() runs this script set's intercept() filters before the host sees the value, so a
        // rule like "this knob only takes even numbers" holds for every write instead of being
        // re-checked at each call site. Its third argument is the options table or the value form
        // (setOptionsOf).
        g.set_function ("set", [this] (std::string path, sol::object value, sol::object opts)
        {
            auto v = solToVar (value);
            if (! runFilters (juce::String (path), v)) return;
            host->setValue (juce::String (path), v, setOptionsOf (opts));
        });
        g.set_function ("get", [this] (std::string path, sol::optional<std::string> form)
            { return varToSol (lua, scriptGet (juce::String (path), form ? juce::String (*form) : juce::String ("value"))); });

        g.set_function ("sendCC",   [this] (int ch, int cc, sol::object v) { host->sendCC (ch, cc, solToVar (v)); });
        g.set_function ("sendNRPN", [this] (int ch, int msb, int lsb, sol::object v) { host->sendNRPN (ch, msb, lsb, solToVar (v)); });
        g.set_function ("sendSysex", [this] (sol::object bytes) { host->sendSysex (solToVar (bytes)); });
        g.set_function ("sendMidi",  [this] (sol::object bytes) { host->sendMidi (solToVar (bytes)); });
        // __requestDump, not requestDump: the script-facing verb takes an optional callback and is
        // therefore assembled in the prelude, over this.
        g.set_function ("__requestDump", [this] (std::string kind) { host->requestDump (juce::String (kind)); });
        g.set_function ("__deviceDefine", [this] (std::string what, std::string id, sol::optional<sol::table> spec)
            { return host->deviceDefine (juce::String (what), juce::String (id),
                                         spec ? solToVar (*spec) : juce::var()); });
        g.set_function ("applyDump",  [this] (sol::object bytes) { host->applyDump (solToVar (bytes)); });
        g.set_function ("sendDump",   [this] (std::string kind) { host->sendDump (juce::String (kind)); });
        g.set_function ("buildDump",  [this] (std::string kind) { return varToSol (lua, host->buildDump (juce::String (kind))); });
        // `path` is a string OR a table of strings — one call, one shape, one completion — so the
        // binding takes an object and lets solToVar decide which it was.
        g.set_function ("__animate", [this] (std::string kind, sol::object path, double target, sol::optional<sol::table> opts)
            { return host->startAnimation (juce::String (kind), solToVar (path), target,
                                           opts ? solToVar (*opts) : juce::var()); });
        g.set_function ("__animateStop", [this] (std::string path) { host->stopAnimation (juce::String (path)); });
        g.set_function ("__animateRunning", [this] (std::string path) { return host->animationRunning (juce::String (path)); });
        g.set_function ("__animateValue", [this] (std::string path) { return varToSol (lua, host->animationValue (juce::String (path))); });
        g.set_function ("__animateList", [this] () { return varToSol (lua, host->animationList()); });
        g.set_function ("__animatePause", [this] (std::string path) { return host->animationPause (juce::String (path)); });
        g.set_function ("__animateResume", [this] (std::string path) { return host->animationResume (juce::String (path)); });
        g.set_function ("__animateReverse", [this] (std::string path) { return host->animationReverse (juce::String (path)); });
        g.set_function ("__animateFinish", [this] (std::string path) { return host->animationFinish (juce::String (path)); });
        g.set_function ("__transportState", [this] () { return varToSol (lua, host->transportState()); });
        g.set_function ("__nowMs", [this] () { return host->nowMs(); });
        g.set_function ("__deviceQuery", [this] (std::string kind, sol::optional<sol::table> payload)
            { return varToSol (lua, host->deviceQuery (juce::String (kind),
                                                       payload ? solToVar (*payload) : juce::var())); });

        g.set_function ("__panelQuery", [this] (std::string kind, sol::optional<sol::table> payload)
            { return varToSol (lua, host->panelQuery (juce::String (kind),
                                                      payload ? solToVar (*payload) : juce::var())); });

        g.set_function ("__deviceWrite", [this] (std::string id, sol::object value, std::string role)
            { return host->deviceWrite (juce::String (id), solToVar (value), juce::String (role)); });

        g.set_function ("__deviceSet", [this] (std::string kind, std::string name,
                                               sol::object value, std::string role)
            { return host->deviceSet (juce::String (kind), juce::String (name),
                                      solToVar (value), juce::String (role)); });

        g.set_function ("startTimer", [this] (std::string id, sol::optional<int> ms) { host->startTimer (juce::String (id), ms ? *ms : 0); });
        g.set_function ("stopTimer",  [this] (std::string id) { host->stopTimer (juce::String (id)); });

        // The store argument is "panel" or "local" — the two places a setting can actually live.
        // ce.storage's third scope, "script", is a key prefix on the panel store, resolved in the
        // prelude so all four runtimes spell a private key the same way.
        g.set_function ("__saveSetting", [this] (std::string key, sol::object v, std::string store)
            { host->saveSetting (juce::String (key), solToVar (v), juce::String (store)); });
        g.set_function ("__loadSetting", [this] (std::string key, std::string store)
            { return varToSol (lua, host->loadSetting (juce::String (key), juce::String (store))); });
        g.set_function ("__listSettings", [this] (std::string store)
            { return varToSol (lua, host->listSettings (juce::String (store))); });
        g.set_function ("__forgetSetting", [this] (std::string key, std::string store)
            { return host->forgetSetting (juce::String (key), juce::String (store)); });
        g.set_function ("__settingsAvailable", [this] (std::string store)
            { return host->settingsAvailable (juce::String (store)); });

        g.set_function ("run",  [this] (std::string target, sol::optional<sol::object> args)
            { return varToSol (lua, host->runAction (juce::String (target), args ? solToVar (*args) : juce::var())); });
        g.set_function ("emit", [this] (std::string name, sol::optional<sol::object> data)
            { host->emitEvent (juce::String (name), data ? solToVar (*data) : juce::var()); });
        g.set_function ("log",  [this] (std::string msg, sol::optional<sol::object> v)
            { host->log (juce::String (msg), v ? solToVar (*v) : juce::var()); });
        // logWarn / logError, NOT warn / error. A global `error` would shadow Lua's builtin — the
        // standard way to raise — and turn it into a print, which is the quietest possible way to
        // break a script. The readable spellings are ce.core.warn / ce.core.error.
        g.set_function ("logWarn", [this] (std::string msg, sol::optional<sol::object> v)
            { host->logAt ("warn", juce::String (msg), v ? solToVar (*v) : juce::var()); });
        g.set_function ("logError", [this] (std::string msg, sol::optional<sol::object> v)
            { host->logAt ("error", juce::String (msg), v ? solToVar (*v) : juce::var()); });

        // noTransmit/transmit blocks — wrap the user function in a transmit override.
        g.set_function ("noTransmit", [this] (sol::protected_function fn)
            { host->beginTransmitOverride (false); auto r = fn(); host->endTransmitOverride(); if (! r.valid()) reportPF (r); });
        g.set_function ("transmit", [this] (sol::protected_function fn)
            { host->beginTransmitOverride (true); auto r = fn(); host->endTransmitOverride(); if (! r.valid()) reportPF (r); });

        // routeMidi(role, fn) — sends inside the block go to a named device instead of the default.
        // Same block shape as noTransmit: the destination is a decision about a RUN of sends.
        g.set_function ("routeMidi", [this] (std::string role, sol::protected_function fn)
        {
            host->beginRouteOverride (juce::String (role));
            auto r = fn();
            host->endRouteOverride();
            if (! r.valid()) reportPF (r);
        });

        // feedMidi(bytes) — inject as if the hardware had sent it, so the panel's OWN bindings,
        // note input and transport all act on it.
        g.set_function ("feedMidi", [this] (sol::object bytes) { host->feedMidi (solToVar (bytes)); });

        // interceptMidiIn / interceptMidiOut — filter the WIRE, as opposed to ce.core.intercept
        // which filters a model path. Held here; the HOST calls applyMidiFilter, because inbound
        // reaches the bindings long before any script sees it.
        g.set_function ("interceptMidiIn", [this] (sol::protected_function fn)
            { putFilter (midiIn, currentScriptId, std::move (fn)); });
        g.set_function ("interceptMidiOut", [this] (sol::protected_function fn)
            { putFilter (midiOut, currentScriptId, std::move (fn)); });

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

        /* --- the reactive core: watch / compute / intercept / defineAction ---------------------
         * The verbs that do what setting a property cannot. A property is a CONSTANT chosen at
         * design time; each of these is a RULE the runtime keeps applying. Tagged with the
         * registering script exactly as on() is, so reloading a script replaces its rules rather
         * than stacking a second copy beside them. */

        // watch(path, fn) — fn(value, previous) whenever ANY model path moves, not just the
        // events somebody enumerated in advance. Seeded with the current value so registering is
        // not itself reported as a change.
        g.set_function ("watch", [this] (std::string path, sol::protected_function fn)
        {
            const juce::String p (path);
            putRule (watchers, { currentScriptId, p, std::move (fn),
                                 signatureOf (host->getValue (p, "value")), juce::var(), false });
        });

        // compute(path, fn) — the property becomes a formula. The runtime owns the re-evaluation,
        // so it cannot fall out of step with an event the author forgot to hook.
        g.set_function ("compute", [this] (std::string path, sol::protected_function fn)
            { putRule (computeds, { currentScriptId, juce::String (path), std::move (fn), {}, juce::var(), false }); });

        // intercept(path, fn) — middleware in front of every write to that path.
        g.set_function ("intercept", [this] (std::string path, sol::protected_function fn)
            { putRule (filters, { currentScriptId, juce::String (path), std::move (fn), {}, juce::var(), false }); });

        // defineAction(name, fn) — a named verb the panel can be built out of, callable by
        // run("name") from a script in any language.
        g.set_function ("defineAction", [this] (std::string name, sol::protected_function fn)
        {
            const juce::String id = juce::String (name).trim();
            if (id.isEmpty()) return;
            const auto key = id.toLowerCase();
            auto existing = actions.find (key);
            if (existing != actions.end() && existing->second.scriptId != currentScriptId)
            {
                // Reported rather than silently overwritten: two scripts claiming one name is a
                // real conflict, and load order deciding it is the worst way to resolve it.
                host->logAt ("error", "defineAction(\"" + id + "\") — already defined by another script. "
                                      "The later definition is ignored.", juce::var());
                return;
            }
            actions[key] = { currentScriptId, id, std::move (fn) };
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
        // self.set took no third argument at all, so its options and its form were both dropped;
        // the WebView's self.set reads them as set() does.
        self.set_function ("set", [this, prefix] (std::string p, sol::object v, sol::object opts)
            { host->setValue (prefix (p), solToVar (v), setOptionsOf (opts)); });
        self.set_function ("get", [this, prefix] (std::string p, sol::optional<std::string> form)
            { return varToSol (lua, scriptGet (prefix (p), form ? juce::String (*form) : juce::String ("value"))); });
        env["self"] = self;

        const Watchdog guard (*this); // top-level statements obey the instruction budget too
        currentScriptId = def.id;
        lua["__scriptId"] = def.id.toStdString();   // the seeded generator is per script
        auto result = lua.safe_script (def.source.toStdString(), env, sol::script_pass_on_error);
        currentScriptId = {};
        lua["__scriptId"] = "";
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
        lua["__scriptId"] = scriptId.toStdString();
        auto r = f (varToSol (lua, payload));
        currentScriptId = {};
        lua["__scriptId"] = "";
        if (! r.valid()) { sol::error e = r; onError (scriptId, juce::String (e.what())); return {}; }
        return r.return_count() > 0 ? solToVar (r) : juce::var();
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        const Watchdog guard (*this);
        // A handler may call on()/off(). Iterating the live vector would let push_back reallocate
        // it or erase invalidate the current iterator. A delivery sees the subscription set that
        // existed when it began; mutations take effect on the next event.
        const auto listenersAtStart = listeners;
        for (const auto& l : listenersAtStart)
        {
            if (l.event != event) continue;
            if (l.target != target && l.target != "*" && ! (l.target == "self")) continue;
            // The listener belongs to the script that REGISTERED it, and until now nothing said so
            // during the call: currentScriptId was left empty here while it is set around a load and
            // a dispatch. Anything script-scoped read inside an on() handler therefore fell into a
            // shared bucket — which the per-script generator would have inherited on day one.
            currentScriptId = l.scriptId;
            lua["__scriptId"] = l.scriptId.toStdString();
            auto r = l.fn (varToSol (lua, payload));
            currentScriptId = {};
            lua["__scriptId"] = "";
            if (! r.valid()) { sol::error e = r; onError ("on:" + event, juce::String (e.what())); }
        }
    }

    void reset() override
    {
        envs.clear();
        listeners.clear();
        watchers.clear(); computeds.clear(); filters.clear(); actions.clear();
        midiIn.clear(); midiOut.clear();
    }

    /* --------------------------------------------------------------- the reactive core */

    /** Settle the formulas, then report the changes.
     *
     * Computes run to a fixpoint FIRST so watchers see a settled model: a watcher that fired on
     * the intermediate state would report a value the panel never actually held. Then the filters
     * get a pass over their own paths, which is how a change that did not come through set() —
     * the user moving a control, inbound MIDI, a dump landing — still obeys its rule.
     */
    void runReactive (const ScriptErrorSink& onError) override
    {
        if (watchers.empty() && computeds.empty() && filters.empty()) return;
        if (reactiveDepth > 0) return;                 // a rule's own set() must not re-enter this
        const ScopedDepth guard (reactiveDepth);
        const Watchdog watchdog (*this);

        for (int pass = 0; pass < kMaxSettlePasses; ++pass)
        {
            bool wrote = false;
            for (auto& c : computeds)
            {
                if (c.failed) continue;
                auto r = c.fn();
                if (! r.valid()) { sol::error e = r; onError ("compute:" + c.path, juce::String (e.what())); c.failed = true; continue; }
                if (r.return_count() == 0) continue;
                auto next = solToVar (r);
                if (signatureOf (next) == signatureOf (host->getValue (c.path, "value"))) continue;
                host->setValue (c.path, next, juce::var());
                wrote = true;
            }
            if (! wrote) break;
            if (pass == kMaxSettlePasses - 1)
                host->logAt ("error", "compute(): still changing after " + juce::String (kMaxSettlePasses)
                             + " passes — two formulas are feeding each other. They are left at the "
                               "last value rather than looped on.", juce::var());
        }

        // A filter has to be idempotent for this to settle (f(f(x)) == f(x)) — snapping, clamping
        // and quantising all are. One that is not keeps correcting, and is cut off by the same
        // pass limit above on the next tick rather than spinning here.
        for (auto& f : filters)
        {
            auto current = host->getValue (f.path, "value");
            if (current.isVoid()) continue;
            auto decided = current;
            if (! runFilters (f.path, decided)) continue;   // a veto has nothing to revert to
            if (signatureOf (decided) != signatureOf (current))
                host->setValue (f.path, decided, juce::var());
        }

        for (auto& w : watchers)
        {
            auto value = host->getValue (w.path, "value");
            const auto sig = signatureOf (value);
            if (sig == w.last) continue;
            auto previous = w.lastValue;
            w.last = sig;
            w.lastValue = value;
            auto r = w.fn (varToSol (lua, value), varToSol (lua, previous));
            if (! r.valid()) { sol::error e = r; onError ("watch:" + w.path, juce::String (e.what())); }
        }
    }

    bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError) override
    {
        auto& chain = inbound ? midiIn : midiOut;
        if (chain.empty()) return true;
        const Watchdog guard (*this);
        for (auto& f : chain)
        {
            auto r = f.fn (varToSol (lua, bytes));
            // A throwing filter passes the message through UNCHANGED. A broken script must not be
            // able to silence a synth: report it and keep the MIDI flowing.
            if (! r.valid()) { sol::error e = r; onError (f.scriptId, juce::String (e.what())); continue; }
            if (r.return_count() == 0) continue;
            auto out = solToVar (r);
            if (out.isBool() && ! (bool) out) return false;      // swallowed
            if (out.isArray() && out.getArray()->size() > 0) bytes = out;
        }
        return true;
    }

    bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                     const ScriptErrorSink& onError) override
    {
        auto it = actions.find (name.toLowerCase());
        if (it == actions.end()) return false;
        const Watchdog guard (*this);
        auto r = it->second.fn (varToSol (lua, args));
        if (! r.valid()) { sol::error e = r; onError ("action:" + name, juce::String (e.what())); return true; }
        result = r.return_count() > 0 ? solToVar (r) : juce::var();
        return true;
    }

    juce::StringArray registeredActions() const override
    {
        juce::StringArray out;
        for (auto& a : actions) out.add (a.second.name);
        return out;
    }

private:
    struct Listener { juce::String scriptId, target, event; sol::protected_function fn; };

    /** One shape for all three rule kinds — they differ only in when they are called. `last`/
        `lastValue` are used by watchers, `failed` by computes; carrying the unused fields is
        cheaper than three near-identical structs that drift apart. */
    struct Rule
    {
        juce::String scriptId, path;
        sol::protected_function fn;
        juce::String last;
        juce::var lastValue;
        bool failed;
    };
    struct ActionDef { juce::String scriptId, name; sol::protected_function fn; };
    struct MidiFilter { juce::String scriptId; sol::protected_function fn; };

    /** One filter per script per direction — a second registration replaces the first rather than
        stacking, the same rule the value rules follow. */
    static void putFilter (std::vector<MidiFilter>& list, const juce::String& scriptId, sol::protected_function&& fn)
    {
        for (auto& f : list)
            if (f.scriptId == scriptId) { f.fn = std::move (fn); return; }
        list.push_back ({ scriptId, std::move (fn) });
    }

    /** A rule replaces the same script's rule for the same path rather than stacking beside it.
        Two filters on one path would make the result depend on registration order — the kind of
        thing that works until the scripts load in a different order. */
    static void putRule (std::vector<Rule>& list, Rule&& rule)
    {
        for (auto& r : list)
            if (r.scriptId == rule.scriptId && r.path == rule.path) { r = std::move (rule); return; }
        list.push_back (std::move (rule));
    }

    /** A script's own get(): the value, and when there is none because the control or the path is
        not there, the host's line saying so (ScriptHostApi::whyNoValue). watch, compute and the
        filters read through host->getValue and stay quiet, as the editor's do. */
    juce::var scriptGet (const juce::String& path, const juce::String& form)
    {
        auto value = host->getValue (path, form);
        if (value.isVoid())
            if (const auto why = host->whyNoValue (path, form); why.isNotEmpty())
                host->logAt ("error", why, juce::var());
        return value;
    }

    /** Run every filter registered for `path`. False = a filter rejected the write outright;
        nil/no return = no opinion, keep what we had; anything else replaces the value. */
    bool runFilters (const juce::String& path, juce::var& value)
    {
        if (filters.empty() || filterDepth > 0) return true;   // a filter's own set() must not re-enter
        const ScopedDepth guard (filterDepth);
        for (auto& f : filters)
        {
            if (f.path != path) continue;
            auto r = f.fn (varToSol (lua, value), varToSol (lua, value));
            if (! r.valid()) { reportPF (r); continue; }
            if (r.return_count() == 0) continue;
            auto out = solToVar (r);
            if (out.isBool() && ! (bool) out) return false;
            if (out.isVoid()) continue;
            value = out;
        }
        return true;
    }

    /** A stable comparison signature — arrays and objects compare by content, not identity. */
    static juce::String signatureOf (const juce::var& v)
    {
        return v.isVoid() ? juce::String ("\1void") : juce::JSON::toString (v, true);
    }

    struct ScopedDepth
    {
        explicit ScopedDepth (int& d) : depth (d) { ++depth; }
        ~ScopedDepth() { --depth; }
        int& depth;
    };

    static constexpr int kMaxSettlePasses = 8;

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
    std::vector<Rule> watchers, computeds, filters;
    std::vector<MidiFilter> midiIn, midiOut;
    std::map<juce::String, ActionDef> actions;   // key = lower-cased name
    int reactiveDepth = 0;                       // >0 inside runReactive
    int filterDepth = 0;                         // >0 inside a filter
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
