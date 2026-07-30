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
-- {{x, y}, …} sorted by x. Accepts pairs and {x=, y=} tables, so a panel can write either.
local function __points(points)
  local out = {}
  if type(points) == "table" then
    for _, p in ipairs(points) do
      local x, y
      if type(p) == "table" then x = p.x or p[1] y = p.y or p[2] end
      x, y = tonumber(x), tonumber(y)
      if x ~= nil and y ~= nil then out[#out + 1] = { x, y } end
    end
  end
  table.sort(out, function(p, q) return p[1] < q[1] end)
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
    if n < x1 and x1 ~= x0 then return y0 + (n - x0) * (y1 - y0) / (x1 - x0) end
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
-- In takes "RRGGBB", "AARRGGBB" or "#RRGGBB" - the last six characters are the colour. Out is
-- "#RRGGBB", which CSS, SVG and a panel property all accept. The ONE exception is alpha(), which
-- returns the panel's AARRGGBB: CSS's #RRGGBBAA is the same bytes the other way round, and that is
-- a trap worth one asymmetry to avoid.
local function __cchan(hex)
  local h = string.gsub(tostring(hex == nil and "" or hex), "#", "")
  h = string.sub(h, -6)
  if #h ~= 6 or string.match(h, "^%x%x%x%x%x%x$") == nil then return nil end
  return tonumber(string.sub(h, 1, 2), 16), tonumber(string.sub(h, 3, 4), 16), tonumber(string.sub(h, 5, 6), 16)
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
  local r, g, b = __cchan(hex)
  if r == nil then return nil end
  return { r = r, g = g, b = b }
end
function lighten(hex, amount)
  local r, g, b = __cchan(hex)
  if r == nil then return nil end
  local f = tonumber(amount)
  if f == nil then f = 0.4 end
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
end
function darken(hex, amount)
  local r, g, b = __cchan(hex)
  if r == nil then return nil end
  local f = tonumber(amount)
  if f == nil then f = 0.55 end
  return rgbToHex(r * f, g * f, b * f)
end
-- NOT an app algorithm, and said so: lerp() per channel in plain RGB.
function mixColour(a, b, t)
  local r1, g1, b1 = __cchan(a)
  local r2, g2, b2 = __cchan(b)
  if r1 == nil or r2 == nil then return nil end
  local f = tonumber(t) or 0
  if f < 0 then f = 0 elseif f > 1 then f = 1 end
  return rgbToHex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f)
end
-- The PANEL's form: AARRGGBB, no leading #, which is what a stored colour property holds.
function colourAlpha(hex, a)
  local r, g, b = __cchan(hex)
  if r == nil then return nil end
  local f = tonumber(a)
  if f == nil then f = 1 end
  if f < 0 then f = 0 elseif f > 1 then f = 1 end
  return string.upper(string.format("%02x", math.floor(f * 255 + 0.5)) .. string.sub(rgbToHex(r, g, b), 2))
end
function hexToHsl(hex)
  local r, g, b = __cchan(hex)
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
__CE_EASINGS["outCubic"] = {0.215,0.61,0.355,1}
-- @module ce.music
-- END GENERATED music tables

-- Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
-- or a name ("C4"), the way sendNote does. An unknown scale or chord name returns nil rather than
-- guessing "major" — a script that asked for something this build does not know should find out.
-- noteNumber is nil for a name it cannot read; __pitch feeds scaleNotes and friends, where a nil
-- root would turn one bad string into an unexplained nil list. noteNumber itself stays honest.
local function __pitch(v) if type(v) == "string" then return noteNumber(v) or 0 end return math.floor(tonumber(v) or 0) end
local function __steps(tbl, name, fallback)
  local s = tbl[name == nil and fallback or tostring(name)]
  return s
end
function scaleNotes(root, scale)
  local s = __steps(__CE_SCALES, scale, "major")
  if s == nil then return nil end
  local base, out = __pitch(root), {}
  for i = 1, #s do out[i] = base + s[i] end
  return out
end
function chordNotes(root, chordType)
  local s = __steps(__CE_CHORDS, chordType, "major")
  if s == nil then return nil end
  local base, out = __pitch(root), {}
  for i = 1, #s do out[i] = base + s[i] end
  return out
end
function quantizeNote(note, root, scale)
  local s = __steps(__CE_SCALES, scale, "major")
  if s == nil then return nil end
  local n, base = __pitch(note), __pitch(root)
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
  if __CE_SCALES[nm] == nil then return nil end
  local pc = __m12(__pitch(root))
  -- Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
  if __CE_MINOR_SCALES[nm] then pc = __m12(pc + 3) end
  return __CE_FLAT_KEYS[pc] == true
end
function inScale(note, root, scale)
  local s = __steps(__CE_SCALES, scale, "major")
  if s == nil then return nil end
  local base, pc = __m12(__pitch(root)), __m12(__pitch(note))
  for i = 1, #s do if __m12(base + s[i]) == pc then return true end end
  return false
end
-- 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets nil rather
-- than the nearest one — rounding here turns a wrong note into a plausible chord, and quantizeNote
-- is the verb that rounds on purpose.
function scaleDegree(note, root, scale)
  local s = __steps(__CE_SCALES, scale, "major")
  if s == nil then return nil end
  local base, pc = __m12(__pitch(root)), __m12(__pitch(note))
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
  local s = __CE_SCALES[nm]
  if s == nil or #s == 0 then return nil end
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
function checksum(kind, bytes, opts)
  if bytes == nil then bytes = kind; kind = "roland" end
  local id = __CE_CKSUM_ALIAS[string.lower(tostring(kind or ""))]
  if id == nil then
    logError('ce.midi.checksum("' .. tostring(kind) .. '"): no such algorithm.')
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
  "panelOrder","panelBatch","panelEntries","panelEntry","panelDefine","panelUndefine","panelPatch",
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
  "arpLatch","arpKey","arpScale","arpDegree","arpChordType","arpVelocity","arpChannel","arpEuclid",
  "arpEuclidSteps","arpEuclidPulses","arpEuclidRotate","arpPhase","arpMute","arpInputChannel",
  "arpBaseOctave","arpSource","arpRead",
-- @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadChordType","chordPadVoicing",
  "chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel","chordPadStrum",
  "chordPadLatch","chordPadRead",
-- @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonBaseNote","noteRibbonOctaves",
  "noteRibbonBendRange","noteRibbonVelocity","noteRibbonChannel","noteRibbonLatch","noteRibbonRead",
-- @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols","drumPadsOrigin","drumPadsVelocityFrom",
  "drumPadsEditable","drumPadsEcho","drumPadsEchoChannel","drumPadsShowNotes","drumPadsShowLabels",
  "drumPadsShowHeader","drumPadsNote","drumPadsLabel","drumPadsChoke","drumPadsColour",
  "drumPadsRead","drumPadsSize","drumPadsFill",
-- @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep","turingPhase","turingRead","turingSize","turingFill",
-- @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest","looperPhase","looperRead","looperSize","looperFill","looperInsert",
  "looperRemove",
-- @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth","orbitRead","orbitSize","orbitFill",
  "orbitInsert","orbitRemove",
-- @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity","kineticRead",
-- @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
  "constellationRead",
-- @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY","timbreRead","timbreSize","timbreFill",
  "timbreInsert","timbreRemove",
-- @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth","routerRead","routerSize","routerFill",
  "routerInsert","routerRemove",
-- @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
  "macroRead","macroSize","macroFill","macroInsert","macroRemove",
-- @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep","matrixRead","matrixSize","matrixFill",
-- @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember","constraintRead","constraintSize",
  "constraintFill","constraintInsert","constraintRemove",
-- @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
  "envelopeRead","envelopeSize","envelopeFill","envelopeInsert","envelopeRemove",
-- @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnRate",
  "ribbonSnap","ribbonRead",
-- @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnToCenter",
  "crossfaderReturnRate","crossfaderRead",
-- @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnToCenter","joystickReturnAxes",
  "joystickReturnRate","joystickRead",
-- @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay","meterValueMin",
  "meterValueMax","meterDbFloor","meterDbCeil","meterRead",
-- @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
  "transportRead",
-- @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal","panicSetRead",
-- @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue","lcdRead","lcdSize","lcdFill",
-- @module ce.components.pixel
  "pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow","pixelAnim",
  "pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop","pixelRead",
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
local function __ch(c) c = math.floor(tonumber(c) or 1); if c < 1 then c = 1 elseif c > 16 then c = 16 end return c - 1 end
local function __7(v) v = math.floor(tonumber(v) or 0); if v < 0 then v = 0 elseif v > 127 then v = 127 end return v end
-- noteNumber is nil for an unreadable name; a MIDI message still needs a BYTE, so it becomes 0
-- here rather than a nil slipping into a message.
local function __note(n) if type(n) == "string" then return noteNumber(n) or 0 end return __7(n) end

-- A duration schedules the note off. Every script that plays a note was otherwise hand-rolling a
-- timer for it, and getting that wrong means a hung voice — the one MIDI mistake you hear rather
-- than read. A panel cannot play a note at all.
function sendNote(channel, note, velocity, ms)
  local n = __note(note)
  sendMidi({0x90 | __ch(channel), n, __7(velocity)})
  if ms ~= nil and ms > 0 then
    after(ms, function() sendMidi({0x80 | __ch(channel), n, 0}) end)
  end
end
function sendRPN(channel, msb, lsb, value)
  -- RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range (0,0),
  -- fine tuning (0,1) and coarse tuning (0,2).
  local s = 0xB0 | __ch(channel)
  local v = math.floor(tonumber(value) or 0); if v < 0 then v = 0 elseif v > 16383 then v = 16383 end
  sendMidi({s, 0x65, __7(msb), s, 0x64, __7(lsb), s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F})
end
-- Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
function sendSongPosition(beats)
  local b = math.floor(tonumber(beats) or 0); if b < 0 then b = 0 elseif b > 16383 then b = 16383 end
  sendMidi({0xF2, b & 0x7F, (b >> 7) & 0x7F})
end
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
function beatsToMs(beats, bpm)
  bpm = bpm or tempo()
  if bpm == nil or bpm <= 0 then return nil end
  return (tonumber(beats) or 0) * 60000 / bpm
end
function msToBeats(ms, bpm)
  bpm = bpm or tempo()
  if bpm == nil or bpm <= 0 then return nil end
  return (tonumber(ms) or 0) * bpm / 60000
end

-- startTimer / stopTimer are HOST bindings; these wrap them so the prelude knows which timers
-- exist (runningTimers) and which follow the tempo (syncTimer). Captured first, or the wrapper
-- would call itself.
local __hostStartTimer, __hostStopTimer = startTimer, stopTimer
local __timerIds, __syncFollow = {}, {}
function startTimer(id, ms)
  local key = tostring(id == nil and "" or id)
  if key == "" then return end
  -- An explicit millisecond interval REPLACES a musical one: this is a script asking for
  -- milliseconds, not beats.
  __syncFollow[key] = nil
  __timerIds[key] = true
  __hostStartTimer(key, math.floor((tonumber(ms) or 0) + 0.5))
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
  local ms = beatsToMs(beats)
  if ms == nil then
    log("syncTimer(\"" .. tostring(id) .. "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.")
    return
  end
  startTimer(key, ms)                                     -- clears any previous follow…
  if not (opts ~= nil and opts.follow == false) then
    __syncFollow[key] = tonumber(beats) or 0              -- …and this puts it back on purpose
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
    if ms ~= nil then startTimer(key, ms) __syncFollow[key] = beats end
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
function after(ms, fn)
  if type(fn) ~= "function" then
    log("after(ms, fn) needs a function to run — nothing was scheduled")
    return nil
  end
  __afterN = __afterN + 1
  local id = "__after:" .. tostring(__afterN)
  __after[id] = fn
  startTimer(id, ms)
  return id
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
  local ms = beatsToMs(beats)
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
function beatsPerDivision(name) return __CE_DIVISIONS[tostring(name)] end
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
  local perBar = __tnum(beatsPerBar, 4); if perBar < 1 then perBar = 1 end
  local b = __tnum(beats, 0); if b < 0 then b = 0 end
  local bar = math.floor(b / perBar) + 1
  local beat = math.floor(b % perBar) + 1
  local tick = math.floor((b % 1) * __CE_TIME.ppqn)
  return { bar = bar, beat = beat, tick = tick,
           text = tostring(bar) .. "." .. tostring(beat) .. "." .. string.format("%02d", tick) }
end

function stepAt(beats, division)
  local per = __CE_DIVISIONS[tostring(division)]
  if per == nil then return nil end
  local b = __tnum(beats, 0); if b < 0 then b = 0 end
  return math.floor(b / per)
end

-- The step boundaries crossed between two readings. A stalled frame must FIRE the steps it slept
-- through rather than drop them — the difference between a stutter and a hole in the bar. Capped so
-- returning from a long stall does not dump hundreds of notes, and what was dropped is REPORTED. On
-- an overrun the most RECENT steps are kept: catching up to now beats replaying where you were.
function stepsBetween(fromBeats, toBeats, division, maxSteps)
  local per = __CE_DIVISIONS[tostring(division)]
  if per == nil then return nil end
  local from = __tnum(fromBeats, 0); if from < 0 then from = 0 end
  local to = __tnum(toBeats, 0); if to < 0 then to = 0 end
  if to <= from then return { steps = {}, dropped = 0 } end
  local first = math.floor(from / per) + 1
  local last = math.floor(to / per)
  if last < first then return { steps = {}, dropped = 0 } end
  local total = last - first + 1
  local cap = math.floor(__tnum(maxSteps, 16) + 0.5); if cap < 1 then cap = 1 end
  local kept = total < cap and total or cap
  local steps = {}
  for i = last - kept + 1, last do steps[#steps + 1] = i end
  return { steps = steps, dropped = total - kept }
end

-- The panel's shuffle: every odd step later by up to half a step, in BEATS. Two sequencers at "the
-- same" swing are only the same swing if they compute it the same way.
function swingOffset(step, amount, division)
  local per = __CE_DIVISIONS[tostring(division)]
  if per == nil then return nil end
  local s = __tclamp(amount, 0, 1)
  if math.abs(math.floor(__tnum(step, 0) + 0.5)) % 2 == 1 then return s * 0.5 * per end
  return 0
end

-- For anything whose rate is a LOOP LENGTH in bars rather than a step. Derived from the position,
-- never accumulated, so a cycle running for an hour is still exactly on the bar line.
local function __cycleBeats(bars, beatsPerBar)
  local perBar = __tnum(beatsPerBar, 4); if perBar < 1 then perBar = 1 end
  local len = __tclamp(bars, 0.25, 64) * perBar
  if len < 0.01 then return 0.01 end
  return len
end
function cycleAt(beats, bars, beatsPerBar)
  local len = __cycleBeats(bars, beatsPerBar)
  local b = __tnum(beats, 0); if b < 0 then b = 0 end
  return { phase = ((b / len) % 1 + 1) % 1, count = math.floor(b / len), length = len }
end

-- Fold a timeline position into a loop. Before the loop start the position is untouched — you can
-- run IN to a loop from earlier in the song. `pass` is which time round, -1 before the loop is
-- reached; watching it for CHANGES is how you see a wrap without a handler that can miss one.
function loopedBeats(beats, startBeats, lengthBeats)
  local b = __tnum(beats, 0); if b < 0 then b = 0 end
  local st = __tnum(startBeats, 0); if st < 0 then st = 0 end
  local len = __tnum(lengthBeats, 0.01); if len < 0.01 then len = 0.01 end
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
local __animDone, __animGroup, __animGroupN = {}, {}, 0

-- An envelope's shape is SAMPLED here, with map() — ce.math's, which is the Envelope component's
-- own envValueAt — and the host interpolates the samples. That is what lets the host engine run an
-- envelope at all: map()'s per-point curves live in this prelude, not in C++.
local __ANIM_SAMPLES = 1024
local function __animSample(points)
  local out = {}
  for i = 0, __ANIM_SAMPLES do
    local y = tonumber(map(i / __ANIM_SAMPLES, points))
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
    if list ~= nil then
      __animGroupN = __animGroupN + 1
      local gid = __animGroupN
      __animGroup[gid] = opts.done
      o.group = gid
    else
      __animDone[tostring(path)] = opts.done
    end
  end
  __animate(kind, list ~= nil and list or tostring(path), tonumber(target) or 0, o)
end

function animateTo(path, target, opts) __animStart("to", path, target, opts) end
function animateSpring(path, target, opts) __animStart("spring", path, target, opts) end
-- envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
-- `to` has one destination; an envelope goes up before it comes down, which is the single most
-- obvious thing a synth panel animates and the one thing `to` cannot express.
function animateEnvelope(path, points, opts)
  if type(points) ~= "table" or #points < 2 then
    log("ce.anim.envelope(path, points): needs at least two points, each { x = , y = } in 0..1 — nothing was started.")
    return false
  end
  local o = {}
  if opts ~= nil then for k, v in pairs(opts) do o[k] = v end end
  o.samples = __animSample(points)
  o.from = tonumber(o.from) or 0
  local to = tonumber(o.to) or 1
  o.to = nil
  __animStart("envelope", path, to, o)
  return true
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
on("*", "__animDone", function(info)
  if info == nil then return end
  if info.group ~= nil then
    local fn = __animGroup[info.group]
    __animGroup[info.group] = nil
    if fn ~= nil then fn({ paths = info.paths, completed = info.completed == true }) end
    return
  end
  local key = tostring(info.path or "")
  local fn = __animDone[key]
  __animDone[key] = nil
  if fn ~= nil then fn({ path = key, completed = info.completed == true }) end
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
-- quietly becomes a shared one, and a typo in a scope name would be the way it happened.
function __storageScope(opts)
  local raw
  if type(opts) == "string" then raw = opts
  elseif type(opts) == "table" then raw = opts.scope end
  if raw == nil or raw == "" then return "panel" end
  local scope = tostring(raw)
  for _, known in ipairs(__CE_SCOPES) do if known == scope then return scope end end
  logError('ce.storage: "' .. scope .. '" is not a scope. One of: panel, script, local.')
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
  local scope = __storageScope(opts)
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
  local scope = __storageScope(opts)
  if scope == nil then return fallback end
  local v = __loadSetting(__storageKeyFor(scope, key), __storageStore(scope))
  if v == nil then return fallback end
  return v
end

-- settings() lists every saved key; forget() deletes one and says whether there was one.
function listSettings(opts)
  local scope = __storageScope(opts)
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
  local scope = __storageScope(opts)
  if scope == nil then return false end
  return __forgetSetting(__storageKeyFor(scope, key), __storageStore(scope)) == true
end

-- Every setting as a table — the read every other module got. Listing keys and looping to fetch each
-- one was the only way before.
function allSettings(opts)
  local scope = __storageScope(opts)
  if scope == nil then return {} end
  local out = {}
  for _, k in ipairs(listSettings(opts)) do out[k] = loadSetting(k, nil, opts) end
  return out
end

-- Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
-- keys alone: "clear my settings" must not mean "clear everybody's".
function clearSettings(opts)
  local gone = 0
  for _, k in ipairs(listSettings(opts)) do if forgetSetting(k, opts) then gone = gone + 1 end end
  return gone
end

-- Which store a scope is talking to, and what is in it. `available` is the honest field: false means
-- writes in this scope will not stick, which is worth saying once rather than per key.
function storageInfo(opts)
  local scope = __storageScope(opts)
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
-- BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
-- on top. ce.core is global: its members are never namespaced, so they appear here only for
-- discoverability (ce.core.set is the same function as set).
local __CE_MODULES = {
  ["ce.core"] = { action = "defineAction", compute = "compute", emit = "emit", error = "logError", get = "get", intercept = "intercept", log = "log", noTransmit = "noTransmit", off = "off", on = "on", run = "run", set = "set", transmit = "transmit", warn = "logWarn", watch = "watch" },
  ["ce.midi"] = { checksum = "checksum", denibblize = "denibblize", feed = "feedMidi", from14bit = "from14bit", from7bit = "from7bit", fromAscii = "fromAscii", fromNibbles = "fromNibbles", fromOffset = "fromOffset", fromSigned = "fromSigned", interceptIn = "interceptMidiIn", interceptOut = "interceptMidiOut", nibblize = "nibblize", panic = "panic", route = "routeMidi", sendAftertouch = "sendAftertouch", sendCC = "sendCC", sendClock = "sendClock", sendMidi = "sendMidi", sendNRPN = "sendNRPN", sendNote = "sendNote", sendNoteOff = "sendNoteOff", sendPitchBend = "sendPitchBend", sendProgramChange = "sendProgramChange", sendRPN = "sendRPN", sendSongPosition = "sendSongPosition", sendSysex = "sendSysex", sendTransport = "sendTransport", to14bit = "to14bit", to7bit = "to7bit", toAscii = "toAscii", toNibbles = "toNibbles", toOffset = "toOffset", toSigned = "toSigned" },
  ["ce.device"] = { applyDump = "applyDump", bind = "deviceBind", buildDump = "buildDump", connected = "deviceConnected", defineDump = "deviceDefineDump", defineParameter = "deviceDefineParameter", parameter = "deviceParameter", parameters = "deviceParameters", ports = "devicePorts", profile = "deviceProfile", read = "deviceRead", requestDump = "requestDump", sendDump = "sendDump", unbind = "deviceUnbind", write = "deviceWrite" },
  ["ce.math"] = { almost = "almost", alpha = "colourAlpha", angle = "angleOf", approach = "approach", bipolar = "bipolar", blend = "blend", blendBy = "blendBy", chance = "randomBool", choice = "randomChoice", clamp = "clamp", crossfade = "crossfade", curve = "curve", darken = "darken", dbPosition = "dbPosition", dbToGain = "dbToGain", deadzone = "deadzone", degrees = "toDegrees", denorm = "denorm", distance = "distance", euclid = "euclid", fold = "fold", fromHsl = "hslToHex", gainToDb = "gainToDb", gaussian = "randomGaussian", hex = "rgbToHex", hsl = "hexToHsl", hysteresis = "hysteresis", index = "indexOfRange", lerp = "lerp", lighten = "lighten", map = "mapCurve", max = "maxOf", mean = "meanOf", median = "median", min = "minOf", mix = "mixColour", norm = "norm", polar = "polar", quantize = "quantizeTo", radians = "toRadians", random = "random", randomFloat = "randomFloat", rgb = "hexToRgb", round = "round", roundTo = "roundTo", scale = "scale", seed = "randomSeed", shape = "shapeCurve", shuffle = "shuffle", smooth = "smooth", snap = "snap", stream = "randomStream", sum = "sumOf", ticks = "tickStops", unipolar = "unipolar", unshape = "unshape", walk = "randomWalk", weights = "weightsFor", wrap = "wrap" },
  ["ce.music"] = { arp = "arpOrder", chord = "chordNotes", degree = "scaleDegree", degreeChord = "degreeChord", inScale = "inScale", lead = "voiceLead", name = "noteName", number = "noteNumber", octaves = "expandOctaves", quality = "chordQuality", quantize = "quantizeNote", scale = "scaleNotes", spelling = "noteSpelling" },
  ["ce.time"] = { after = "after", afterBeats = "afterBeats", beatsToMs = "beatsToMs", clockTempo = "clockTempo", cycle = "cycleAt", division = "beatsPerDivision", divisions = "divisionNames", looped = "loopedBeats", msToBeats = "msToBeats", now = "nowMs", playing = "isPlaying", position = "barBeatAt", startTimer = "startTimer", step = "stepAt", steps = "stepsBetween", stopTimer = "stopTimer", swing = "swingOffset", syncTimer = "syncTimer", tap = "tapTempo", tempo = "tempo", timers = "runningTimers", transport = "transportInfo" },
  ["ce.anim"] = { envelope = "animateEnvelope", finish = "animateFinish", list = "animateList", pause = "animatePause", resume = "animateResume", reverse = "animateReverse", running = "animateRunning", spring = "animateSpring", stop = "animateStop", to = "animateTo", value = "animateValue" },
  ["ce.ui"] = { choose = "uiChoose", copy = "uiCopy", dialog = "uiDialog", dismiss = "uiDismiss", notify = "uiNotify", prompt = "uiPrompt", state = "uiState", status = "uiStatus", update = "uiUpdate" },
  ["ce.draw"] = { arc = "drawArc", batch = "drawBatch", blend = "drawBlend", circle = "drawCircle", clear = "drawClear", clip = "drawClip", curve = "drawCurve", ellipse = "drawEllipse", fill = "drawFill", gradient = "drawGradient", grid = "drawGrid", image = "drawImage", line = "drawLine", lines = "drawLines", measure = "drawMeasure", opacity = "drawOpacity", path = "drawPath", pixelText = "drawPixelText", points = "drawPoints", polygon = "drawPolygon", rect = "drawRect", redraw = "drawRedraw", restore = "drawRestore", save = "drawSave", stroke = "drawStroke", text = "drawText", transform = "drawTransform" },
  ["ce.panel"] = { align = "panelAlign", batch = "panelBatch", circle = "panelCircle", clone = "panelClone", create = "panelCreate", define = "panelDefine", destroy = "panelDestroy", distribute = "panelDistribute", each = "panelEach", entries = "panelEntries", entry = "panelEntry", find = "panelFind", flip = "panelFlip", grid = "panelGrid", info = "panelInfo", match = "panelMatch", order = "panelOrder", parent = "panelParent", patch = "panelPatch", rect = "panelRect", restore = "panelRestore", snapshot = "panelSnapshot", types = "panelTypes", undefine = "panelUndefine" },
  ["ce.storage"] = { all = "allSettings", clear = "clearSettings", decode = "decodeJson", encode = "encodeJson", forget = "forgetSetting", info = "storageInfo", loadSetting = "loadSetting", saveSetting = "saveSetting", settings = "listSettings", state = "state" },
  ["ce.image"] = { asset = "imageAsset", assets = "imageAssets", clear = "imageClear", embed = "imageEmbed", icon = "imageIcon", load = "imageLoad", read = "imageRead", set = "imageSet" },
  ["ce.text"] = { axis = "textAxis", fit = "textFit", font = "textFont", fonts = "textFonts", measure = "textMeasure", read = "textRead", style = "textStyle" },
  ["ce.components.split"] = { channel = "splitChannel", mute = "splitMute", point = "splitPoint", preset = "splitPreset", read = "splitRead", transpose = "splitTranspose" },
  ["ce.components.phrase"] = { cell = "phraseCell", clear = "phraseClear", direction = "phraseDirection", key = "phraseKey", read = "phraseRead", run = "phraseRun", scale = "phraseScale", seed = "phraseSeed", transpose = "phraseTranspose" },
  ["ce.components.recorder"] = { bars = "recorderBars", clear = "recorderClear", countIn = "recorderCountIn", load = "recorderLoad", nudge = "recorderNudge", play = "recorderPlay", quantize = "recorderQuantize", read = "recorderRead", record = "recorderRecord", shift = "recorderShift", source = "recorderSource", stop = "recorderStop", store = "recorderStore", transpose = "recorderTranspose", undo = "recorderUndo" },
  ["ce.components.harmony"] = { channel = "harmonyChannel", degree = "harmonyDegree", inversion = "harmonyInversion", keepPlayed = "harmonyKeepPlayed", key = "harmonyKey", mode = "harmonyMode", octave = "harmonyOctave", outOfKey = "harmonyOutOfKey", read = "harmonyRead", scale = "harmonyScale", shape = "harmonyShape", size = "harmonySize", strum = "harmonyStrum", voiceLeading = "harmonyVoiceLeading", voicing = "harmonyVoicing" },
  ["ce.components.setlist"] = { crossfade = "setlistCrossfade", enable = "setlistEnable", jump = "setlistGoto", next = "setlistNext", prev = "setlistPrev", read = "setlistRead", wrap = "setlistWrap" },
  ["ce.components.arp"] = { baseOctave = "arpBaseOctave", channel = "arpChannel", chordType = "arpChordType", degree = "arpDegree", division = "arpDivision", euclid = "arpEuclid", euclidPulses = "arpEuclidPulses", euclidRotate = "arpEuclidRotate", euclidSteps = "arpEuclidSteps", gate = "arpGate", inputChannel = "arpInputChannel", key = "arpKey", latch = "arpLatch", mute = "arpMute", octaves = "arpOctaves", pattern = "arpPattern", phase = "arpPhase", rate = "arpRate", read = "arpRead", run = "arpRun", scale = "arpScale", source = "arpSource", swing = "arpSwing", sync = "arpSync", velocity = "arpVelocity" },
  ["ce.components.chordpad"] = { channel = "chordPadChannel", chordType = "chordPadChordType", inversion = "chordPadInversion", key = "chordPadKey", latch = "chordPadLatch", mode = "chordPadMode", octave = "chordPadOctave", read = "chordPadRead", scale = "chordPadScale", strum = "chordPadStrum", velocity = "chordPadVelocity", voicing = "chordPadVoicing" },
  ["ce.components.noteribbon"] = { baseNote = "noteRibbonBaseNote", bendRange = "noteRibbonBendRange", channel = "noteRibbonChannel", key = "noteRibbonKey", latch = "noteRibbonLatch", mode = "noteRibbonMode", octaves = "noteRibbonOctaves", read = "noteRibbonRead", scale = "noteRibbonScale", velocity = "noteRibbonVelocity" },
  ["ce.components.drumpads"] = { baseNote = "drumPadsBaseNote", channel = "drumPadsChannel", choke = "drumPadsChoke", colour = "drumPadsColour", cols = "drumPadsCols", echo = "drumPadsEcho", echoChannel = "drumPadsEchoChannel", editable = "drumPadsEditable", fill = "drumPadsFill", gate = "drumPadsGate", label = "drumPadsLabel", map = "drumPadsMap", mode = "drumPadsMode", note = "drumPadsNote", origin = "drumPadsOrigin", read = "drumPadsRead", rows = "drumPadsRows", showHeader = "drumPadsShowHeader", showLabels = "drumPadsShowLabels", showNotes = "drumPadsShowNotes", size = "drumPadsSize", velocity = "drumPadsVelocity", velocityFrom = "drumPadsVelocityFrom" },
  ["ce.components.turing"] = { division = "turingDivision", fill = "turingFill", gate = "turingGate", length = "turingLength", phase = "turingPhase", quantize = "turingQuantize", randomness = "turingRandomness", rate = "turingRate", read = "turingRead", run = "turingRun", size = "turingSize", step = "turingStep", sync = "turingSync" },
  ["ce.components.looper"] = { bars = "looperBars", fill = "looperFill", insert = "looperInsert", lane = "looperLane", laneRest = "looperLaneRest", phase = "looperPhase", quantize = "looperQuantize", read = "looperRead", remove = "looperRemove", run = "looperRun", seconds = "looperSeconds", size = "looperSize", sync = "looperSync" },
  ["ce.components.orbit"] = { bars = "orbitBars", fill = "orbitFill", insert = "orbitInsert", node = "orbitNode", nodeAngle = "orbitNodeAngle", nodeDepth = "orbitNodeDepth", nodeRadius = "orbitNodeRadius", nodeRatio = "orbitNodeRatio", phase = "orbitPhase", rate = "orbitRate", read = "orbitRead", remove = "orbitRemove", run = "orbitRun", size = "orbitSize", sync = "orbitSync" },
  ["ce.components.kinetic"] = { bounce = "kineticBounce", friction = "kineticFriction", gravity = "kineticGravity", keepAlive = "kineticKeepAlive", launch = "kineticLaunch", read = "kineticRead", run = "kineticRun", sync = "kineticSync", velocity = "kineticVelocity" },
  ["ce.components.constellation"] = { bars = "constellationBars", blend = "constellationBlend", links = "constellationLinks", mode = "constellationMode", probe = "constellationProbe", rate = "constellationRate", read = "constellationRead", run = "constellationRun", sync = "constellationSync" },
  ["ce.components.timbre"] = { anchorX = "timbreAnchorX", anchorY = "timbreAnchorY", fill = "timbreFill", insert = "timbreInsert", move = "timbreMove", power = "timbrePower", read = "timbreRead", remove = "timbreRemove", size = "timbreSize" },
  ["ce.components.router"] = { cc = "routerCc", channel = "routerChannel", deadzone = "routerDeadzone", dest = "routerDest", destDepth = "routerDestDepth", fill = "routerFill", input = "routerInput", insert = "routerInsert", invert = "routerInvert", poly = "routerPoly", read = "routerRead", remove = "routerRemove", size = "routerSize", source = "routerSource" },
  ["ce.components.macro"] = { fill = "macroFill", insert = "macroInsert", read = "macroRead", remove = "macroRemove", size = "macroSize", slot = "macroSlot", slotCurve = "macroSlotCurve", slotDepth = "macroSlotDepth", slotMax = "macroSlotMax", slotMin = "macroSlotMin", value = "macroValue" },
  ["ce.components.matrix"] = { bipolar = "matrixBipolar", cell = "matrixCell", clear = "matrixClear", fill = "matrixFill", read = "matrixRead", size = "matrixSize", step = "matrixStep" },
  ["ce.components.constraint"] = { fill = "constraintFill", gap = "constraintGap", insert = "constraintInsert", member = "constraintMember", mode = "constraintMode", read = "constraintRead", remove = "constraintRemove", size = "constraintSize" },
  ["ce.components.envelope"] = { fill = "envelopeFill", insert = "envelopeInsert", loop = "envelopeLoop", loopEnd = "envelopeLoopEnd", loopStart = "envelopeLoopStart", phase = "envelopePhase", pointCurve = "envelopePointCurve", pointX = "envelopePointX", pointY = "envelopePointY", preset = "envelopePreset", read = "envelopeRead", remove = "envelopeRemove", size = "envelopeSize", sustain = "envelopeSustain", timeMax = "envelopeTimeMax" },
  ["ce.components.ribbon"] = { bipolar = "ribbonBipolar", read = "ribbonRead", returnMode = "ribbonReturnMode", returnRate = "ribbonReturnRate", returnValue = "ribbonReturnValue", snap = "ribbonSnap", value = "ribbonValue" },
  ["ce.components.crossfader"] = { bipolar = "crossfaderBipolar", detent = "crossfaderDetent", law = "crossfaderLaw", mix = "crossfaderMix", read = "crossfaderRead", returnRate = "crossfaderReturnRate", returnToCenter = "crossfaderReturnToCenter" },
  ["ce.components.joystick"] = { bipolar = "joystickBipolar", move = "joystickMove", read = "joystickRead", returnAxes = "joystickReturnAxes", returnRate = "joystickReturnRate", returnToCenter = "joystickReturnToCenter" },
  ["ce.components.meter"] = { dbCeil = "meterDbCeil", dbFloor = "meterDbFloor", decay = "meterDecay", holdMs = "meterHoldMs", peakHold = "meterPeakHold", read = "meterRead", scale = "meterScale", value = "meterValue", valueMax = "meterValueMax", valueMin = "meterValueMin" },
  ["ce.components.transport"] = { beatUnit = "transportBeatUnit", beatsPerBar = "transportBeatsPerBar", bpm = "transportBpm", clockOut = "transportClockOut", countIn = "transportCountIn", loop = "transportLoop", loopBars = "transportLoopBars", loopStart = "transportLoopStart", read = "transportRead", source = "transportSource", swing = "transportSwing" },
  ["ce.components.panic"] = { centreBend = "panicSetCentreBend", channel = "panicSetChannel", clearLocal = "panicSetClearLocal", read = "panicSetRead", resetControllers = "panicSetResetControllers", scope = "panicSetScope" },
  ["ce.components.lcd"] = { backlight = "lcdBacklight", blink = "lcdBlink", brightness = "lcdBrightness", clear = "lcdClear", contrast = "lcdContrast", cursor = "lcdCursor", cursorAt = "lcdCursorAt", fill = "lcdFill", read = "lcdRead", scroll = "lcdScroll", scrollSpeed = "lcdScrollSpeed", size = "lcdSize", text = "lcdText", value = "lcdValue" },
  ["ce.components.pixel"] = { anim = "pixelAnim", animLoop = "pixelAnimLoop", animPreset = "pixelAnimPreset", animSpeed = "pixelAnimSpeed", backlight = "pixelBacklight", brightness = "pixelBrightness", contrast = "pixelContrast", gamma = "pixelGamma", glow = "pixelGlow", read = "pixelRead" },
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

        // optionsFromOpts: turn a Lua opts table {transmit=...} into a juce::var for the host.
        auto buildOptions = [this] (sol::optional<sol::table> opts) -> juce::var
        {
            if (! opts) return {};
            auto* o = new juce::DynamicObject();
            sol::object t = (*opts)["transmit"];
            if (t.valid() && t.get_type() == sol::type::boolean) o->setProperty ("transmit", t.as<bool>());
            return juce::var (o);
        };

        // set() runs this script set's intercept() filters before the host sees the value, so a
        // rule like "this knob only takes even numbers" holds for every write instead of being
        // re-checked at each call site.
        g.set_function ("set", [this, buildOptions] (std::string path, sol::object value, sol::optional<sol::table> opts)
        {
            auto v = solToVar (value);
            if (! runFilters (juce::String (path), v)) return;
            host->setValue (juce::String (path), v, buildOptions (opts));
        });
        g.set_function ("get", [this] (std::string path, sol::optional<std::string> form)
            { return varToSol (lua, host->getValue (juce::String (path), form ? juce::String (*form) : juce::String ("value"))); });

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
            { host->startAnimation (juce::String (kind), solToVar (path), target,
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
        self.set_function ("set", [this, prefix] (std::string p, sol::object v) { host->setValue (prefix (p), solToVar (v), juce::var()); });
        self.set_function ("get", [this, prefix] (std::string p, sol::optional<std::string> form)
            { return varToSol (lua, host->getValue (prefix (p), form ? juce::String (*form) : juce::String ("value"))); });
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
        for (auto& l : listeners)
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

    bool applyIntercepts (const juce::String& path, juce::var& value, const ScriptErrorSink&) override
    {
        return runFilters (path, value);
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
