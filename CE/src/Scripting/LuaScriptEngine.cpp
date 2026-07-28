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
-- @module ce.math
-- A seeded xorshift32, masked to 32 bits at every step and written identically in every prelude.
-- Seeded is the whole point: the language's own math.random cannot promise the same sequence in
-- five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
-- different in the editor and in the export.
local __RND_DEFAULT = 0x9E3779B9
local __rnd = __RND_DEFAULT
function randomSeed(n)
  local v = math.floor(tonumber(n) or 0) & 0xFFFFFFFF
  -- 0 is a DEAD state for xorshift — it would return zero forever — so it means "the default"
  -- rather than "a generator that never moves".
  if v == 0 then v = __RND_DEFAULT end
  __rnd = v
end
function random(lo, hi)
  local x = __rnd
  x = (x ~ (x << 13)) & 0xFFFFFFFF
  x = x ~ (x >> 17)
  x = (x ~ (x << 5)) & 0xFFFFFFFF
  __rnd = x
  local r = x / 4294967296.0
  if lo == nil or hi == nil then return r end
  local a, b = math.floor(tonumber(lo) or 0), math.floor(tonumber(hi) or 0)
  local low, high = math.min(a, b), math.max(a, b)
  -- Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
  return low + math.floor(r * (high - low + 1))
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

-- BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- @module ce.music
__CE_SCALES = {}
__CE_CHORDS = {}
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
-- END GENERATED music tables

-- Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
-- or a name ("C4"), the way sendNote does. An unknown scale or chord name returns nil rather than
-- guessing "major" — a script that asked for something this build does not know should find out.
local function __pitch(v) if type(v) == "string" then return noteNumber(v) end return math.floor(tonumber(v) or 0) end
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

-- @module -
-- Every member declared runtime:'webview' in panelApi.js. The components are modelled and rendered
-- in the panel view; there is no C++ counterpart to drive with the window closed. Defining them
-- here as explaining stubs means a script that strays across the boundary says so, instead of
-- dying on an undefined global. The list below is GENERATED — 248 names maintained by hand in
-- three files is 744 chances to mistype one, and a mistyped stub is a missing name in one engine.
-- BEGIN GENERATED webview-only stubs — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
local WEBVIEW_ONLY = {
-- @module ce.ui
  "uiNotify","uiStatus","uiDialog",
-- @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawText","drawRedraw",
-- @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
-- @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
-- @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell",
-- @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn",
-- @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree",
-- @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
-- @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpDegree","arpChordType","arpVelocity","arpChannel","arpEuclid",
  "arpEuclidSteps","arpEuclidPulses","arpEuclidRotate",
-- @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadChordType","chordPadVoicing",
  "chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel","chordPadStrum",
  "chordPadLatch",
-- @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonBaseNote","noteRibbonOctaves",
  "noteRibbonBendRange","noteRibbonVelocity","noteRibbonChannel","noteRibbonLatch",
-- @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols",
-- @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep",
-- @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest",
-- @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth",
-- @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity",
-- @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
-- @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY",
-- @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth",
-- @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
-- @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep",
-- @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember",
-- @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
-- @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnRate",
  "ribbonSnap",
-- @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnToCenter",
  "crossfaderReturnRate",
-- @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnToCenter","joystickReturnAxes",
  "joystickReturnRate",
-- @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay",
-- @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
-- @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal",
-- @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue",
-- @module ce.components.pixel
  "pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow","pixelAnim",
  "pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop",
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
local function __note(n) if type(n) == "string" then return noteNumber(n) end return __7(n) end

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
function syncTimer(id, beats)
  local ms = beatsToMs(beats)
  if ms == nil then
    log("syncTimer(\"" .. tostring(id) .. "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.")
    return
  end
  startTimer(id, math.floor(ms + 0.5))
end

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

-- @module ce.anim
-- Values that move over time. The engine lives in the host (ScriptRuntime) so ONE list exists and
-- the position is a pure function of elapsed time — an incremental integrator in each runtime
-- would drift apart from the others within a second.
function animateTo(path, target, opts) __animate("to", tostring(path), tonumber(target) or 0, opts or {}) end
function animateSpring(path, target, opts) __animate("spring", tostring(path), tonumber(target) or 0, opts or {}) end
function animateStop(path) __animateStop(path == nil and "" or tostring(path)) end
function animateRunning(path) return __animateRunning(path == nil and "" or tostring(path)) end

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
  ["ce.core"] = { action = "defineAction", compute = "compute", emit = "emit", error = "logError", get = "get", intercept = "intercept", log = "log", noTransmit = "noTransmit", off = "off", on = "on", run = "run", set = "set", transmit = "transmit", warn = "logWarn", watch = "watch" },
  ["ce.midi"] = { checksum = "checksum", denibblize = "denibblize", feed = "feedMidi", from14bit = "from14bit", from7bit = "from7bit", fromAscii = "fromAscii", fromNibbles = "fromNibbles", fromOffset = "fromOffset", fromSigned = "fromSigned", interceptIn = "interceptMidiIn", interceptOut = "interceptMidiOut", nibblize = "nibblize", panic = "panic", route = "routeMidi", sendAftertouch = "sendAftertouch", sendCC = "sendCC", sendClock = "sendClock", sendMidi = "sendMidi", sendNRPN = "sendNRPN", sendNote = "sendNote", sendNoteOff = "sendNoteOff", sendPitchBend = "sendPitchBend", sendProgramChange = "sendProgramChange", sendRPN = "sendRPN", sendSongPosition = "sendSongPosition", sendSysex = "sendSysex", sendTransport = "sendTransport", to14bit = "to14bit", to7bit = "to7bit", toAscii = "toAscii", toNibbles = "toNibbles", toOffset = "toOffset", toSigned = "toSigned" },
  ["ce.device"] = { applyDump = "applyDump", buildDump = "buildDump", connected = "deviceConnected", parameter = "deviceParameter", parameters = "deviceParameters", profile = "deviceProfile", read = "deviceRead", requestDump = "requestDump", sendDump = "sendDump", write = "deviceWrite" },
  ["ce.math"] = { clamp = "clamp", curve = "curve", lerp = "lerp", random = "random", round = "round", scale = "scale", seed = "randomSeed", snap = "snap" },
  ["ce.music"] = { chord = "chordNotes", name = "noteName", number = "noteNumber", quantize = "quantizeNote", scale = "scaleNotes" },
  ["ce.time"] = { after = "after", beatsToMs = "beatsToMs", msToBeats = "msToBeats", playing = "isPlaying", startTimer = "startTimer", stopTimer = "stopTimer", syncTimer = "syncTimer", tempo = "tempo", transport = "transportInfo" },
  ["ce.anim"] = { running = "animateRunning", spring = "animateSpring", stop = "animateStop", to = "animateTo" },
  ["ce.ui"] = { dialog = "uiDialog", notify = "uiNotify", status = "uiStatus" },
  ["ce.draw"] = { arc = "drawArc", circle = "drawCircle", clear = "drawClear", fill = "drawFill", line = "drawLine", path = "drawPath", rect = "drawRect", redraw = "drawRedraw", stroke = "drawStroke", text = "drawText" },
  ["ce.panel"] = { clone = "panelClone", create = "panelCreate", destroy = "panelDestroy", each = "panelEach", find = "panelFind", info = "panelInfo", parent = "panelParent", restore = "panelRestore", snapshot = "panelSnapshot", types = "panelTypes" },
  ["ce.storage"] = { forget = "forgetSetting", loadSetting = "loadSetting", saveSetting = "saveSetting", settings = "listSettings", state = "state" },
  ["ce.components.split"] = { channel = "splitChannel", mute = "splitMute", point = "splitPoint", preset = "splitPreset", transpose = "splitTranspose" },
  ["ce.components.phrase"] = { cell = "phraseCell", clear = "phraseClear", direction = "phraseDirection", key = "phraseKey", run = "phraseRun", scale = "phraseScale", seed = "phraseSeed", transpose = "phraseTranspose" },
  ["ce.components.recorder"] = { bars = "recorderBars", clear = "recorderClear", countIn = "recorderCountIn", load = "recorderLoad", nudge = "recorderNudge", play = "recorderPlay", quantize = "recorderQuantize", record = "recorderRecord", shift = "recorderShift", source = "recorderSource", stop = "recorderStop", store = "recorderStore", transpose = "recorderTranspose", undo = "recorderUndo" },
  ["ce.components.harmony"] = { channel = "harmonyChannel", degree = "harmonyDegree", inversion = "harmonyInversion", keepPlayed = "harmonyKeepPlayed", key = "harmonyKey", mode = "harmonyMode", octave = "harmonyOctave", outOfKey = "harmonyOutOfKey", scale = "harmonyScale", shape = "harmonyShape", size = "harmonySize", strum = "harmonyStrum", voiceLeading = "harmonyVoiceLeading", voicing = "harmonyVoicing" },
  ["ce.components.setlist"] = { crossfade = "setlistCrossfade", enable = "setlistEnable", jump = "setlistGoto", next = "setlistNext", prev = "setlistPrev", wrap = "setlistWrap" },
  ["ce.components.arp"] = { channel = "arpChannel", chordType = "arpChordType", degree = "arpDegree", division = "arpDivision", euclid = "arpEuclid", euclidPulses = "arpEuclidPulses", euclidRotate = "arpEuclidRotate", euclidSteps = "arpEuclidSteps", gate = "arpGate", key = "arpKey", latch = "arpLatch", octaves = "arpOctaves", pattern = "arpPattern", rate = "arpRate", run = "arpRun", scale = "arpScale", swing = "arpSwing", sync = "arpSync", velocity = "arpVelocity" },
  ["ce.components.chordpad"] = { channel = "chordPadChannel", chordType = "chordPadChordType", inversion = "chordPadInversion", key = "chordPadKey", latch = "chordPadLatch", mode = "chordPadMode", octave = "chordPadOctave", scale = "chordPadScale", strum = "chordPadStrum", velocity = "chordPadVelocity", voicing = "chordPadVoicing" },
  ["ce.components.noteribbon"] = { baseNote = "noteRibbonBaseNote", bendRange = "noteRibbonBendRange", channel = "noteRibbonChannel", key = "noteRibbonKey", latch = "noteRibbonLatch", mode = "noteRibbonMode", octaves = "noteRibbonOctaves", scale = "noteRibbonScale", velocity = "noteRibbonVelocity" },
  ["ce.components.drumpads"] = { baseNote = "drumPadsBaseNote", channel = "drumPadsChannel", cols = "drumPadsCols", gate = "drumPadsGate", map = "drumPadsMap", mode = "drumPadsMode", rows = "drumPadsRows", velocity = "drumPadsVelocity" },
  ["ce.components.turing"] = { division = "turingDivision", gate = "turingGate", length = "turingLength", quantize = "turingQuantize", randomness = "turingRandomness", rate = "turingRate", run = "turingRun", step = "turingStep", sync = "turingSync" },
  ["ce.components.looper"] = { bars = "looperBars", lane = "looperLane", laneRest = "looperLaneRest", quantize = "looperQuantize", run = "looperRun", seconds = "looperSeconds", sync = "looperSync" },
  ["ce.components.orbit"] = { bars = "orbitBars", node = "orbitNode", nodeAngle = "orbitNodeAngle", nodeDepth = "orbitNodeDepth", nodeRadius = "orbitNodeRadius", nodeRatio = "orbitNodeRatio", phase = "orbitPhase", rate = "orbitRate", run = "orbitRun", sync = "orbitSync" },
  ["ce.components.kinetic"] = { bounce = "kineticBounce", friction = "kineticFriction", gravity = "kineticGravity", keepAlive = "kineticKeepAlive", launch = "kineticLaunch", run = "kineticRun", sync = "kineticSync", velocity = "kineticVelocity" },
  ["ce.components.constellation"] = { bars = "constellationBars", blend = "constellationBlend", links = "constellationLinks", mode = "constellationMode", probe = "constellationProbe", rate = "constellationRate", run = "constellationRun", sync = "constellationSync" },
  ["ce.components.timbre"] = { anchorX = "timbreAnchorX", anchorY = "timbreAnchorY", move = "timbreMove", power = "timbrePower" },
  ["ce.components.router"] = { cc = "routerCc", channel = "routerChannel", deadzone = "routerDeadzone", dest = "routerDest", destDepth = "routerDestDepth", input = "routerInput", invert = "routerInvert", poly = "routerPoly", source = "routerSource" },
  ["ce.components.macro"] = { slot = "macroSlot", slotCurve = "macroSlotCurve", slotDepth = "macroSlotDepth", slotMax = "macroSlotMax", slotMin = "macroSlotMin", value = "macroValue" },
  ["ce.components.matrix"] = { bipolar = "matrixBipolar", cell = "matrixCell", clear = "matrixClear", step = "matrixStep" },
  ["ce.components.constraint"] = { gap = "constraintGap", member = "constraintMember", mode = "constraintMode" },
  ["ce.components.envelope"] = { loop = "envelopeLoop", loopEnd = "envelopeLoopEnd", loopStart = "envelopeLoopStart", phase = "envelopePhase", pointCurve = "envelopePointCurve", pointX = "envelopePointX", pointY = "envelopePointY", preset = "envelopePreset", sustain = "envelopeSustain", timeMax = "envelopeTimeMax" },
  ["ce.components.ribbon"] = { bipolar = "ribbonBipolar", returnMode = "ribbonReturnMode", returnRate = "ribbonReturnRate", returnValue = "ribbonReturnValue", snap = "ribbonSnap", value = "ribbonValue" },
  ["ce.components.crossfader"] = { bipolar = "crossfaderBipolar", detent = "crossfaderDetent", law = "crossfaderLaw", mix = "crossfaderMix", returnRate = "crossfaderReturnRate", returnToCenter = "crossfaderReturnToCenter" },
  ["ce.components.joystick"] = { bipolar = "joystickBipolar", move = "joystickMove", returnAxes = "joystickReturnAxes", returnRate = "joystickReturnRate", returnToCenter = "joystickReturnToCenter" },
  ["ce.components.meter"] = { decay = "meterDecay", holdMs = "meterHoldMs", peakHold = "meterPeakHold", scale = "meterScale", value = "meterValue" },
  ["ce.components.transport"] = { beatUnit = "transportBeatUnit", beatsPerBar = "transportBeatsPerBar", bpm = "transportBpm", clockOut = "transportClockOut", countIn = "transportCountIn", loop = "transportLoop", loopBars = "transportLoopBars", loopStart = "transportLoopStart", source = "transportSource", swing = "transportSwing" },
  ["ce.components.panic"] = { centreBend = "panicSetCentreBend", channel = "panicSetChannel", clearLocal = "panicSetClearLocal", resetControllers = "panicSetResetControllers", scope = "panicSetScope" },
  ["ce.components.lcd"] = { backlight = "lcdBacklight", blink = "lcdBlink", brightness = "lcdBrightness", clear = "lcdClear", contrast = "lcdContrast", cursor = "lcdCursor", cursorAt = "lcdCursorAt", scroll = "lcdScroll", scrollSpeed = "lcdScrollSpeed", text = "lcdText", value = "lcdValue" },
  ["ce.components.pixel"] = { anim = "pixelAnim", animLoop = "pixelAnimLoop", animPreset = "pixelAnimPreset", animSpeed = "pixelAnimSpeed", backlight = "pixelBacklight", brightness = "pixelBrightness", contrast = "pixelContrast", gamma = "pixelGamma", glow = "pixelGlow" },
}
local __CE_ORDER = { "ce.core", "ce.midi", "ce.device", "ce.math", "ce.music", "ce.time", "ce.anim", "ce.ui", "ce.draw", "ce.panel", "ce.storage", "ce.components.split", "ce.components.phrase", "ce.components.recorder", "ce.components.harmony", "ce.components.setlist", "ce.components.arp", "ce.components.chordpad", "ce.components.noteribbon", "ce.components.drumpads", "ce.components.turing", "ce.components.looper", "ce.components.orbit", "ce.components.kinetic", "ce.components.constellation", "ce.components.timbre", "ce.components.router", "ce.components.macro", "ce.components.matrix", "ce.components.constraint", "ce.components.envelope", "ce.components.ribbon", "ce.components.crossfader", "ce.components.joystick", "ce.components.meter", "ce.components.transport", "ce.components.panic", "ce.components.lcd", "ce.components.pixel" }
local __CE_META = {
  { id = "ce.core", version = "1.1", runtime = "any" },
  { id = "ce.midi", version = "1.3", runtime = "any" },
  { id = "ce.device", version = "1.2", runtime = "any" },
  { id = "ce.math", version = "1.1", runtime = "any" },
  { id = "ce.music", version = "1.1", runtime = "any" },
  { id = "ce.time", version = "1.2", runtime = "any" },
  { id = "ce.anim", version = "1.0", runtime = "any" },
  { id = "ce.ui", version = "1.1", runtime = "webview" },
  { id = "ce.draw", version = "1.1", runtime = "webview" },
  { id = "ce.panel", version = "1.2", runtime = "any" },
  { id = "ce.storage", version = "1.1", runtime = "any" },
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
        g.set_function ("requestDump", [this] (std::string kind) { host->requestDump (juce::String (kind)); });
        g.set_function ("applyDump",  [this] (sol::object bytes) { host->applyDump (solToVar (bytes)); });
        g.set_function ("sendDump",   [this] (std::string kind) { host->sendDump (juce::String (kind)); });
        g.set_function ("buildDump",  [this] (std::string kind) { return varToSol (lua, host->buildDump (juce::String (kind))); });
        g.set_function ("__animate", [this] (std::string kind, std::string path, double target, sol::optional<sol::table> opts)
            { host->startAnimation (juce::String (kind), juce::String (path), target,
                                    opts ? solToVar (*opts) : juce::var()); });
        g.set_function ("__animateStop", [this] (std::string path) { host->stopAnimation (juce::String (path)); });
        g.set_function ("__animateRunning", [this] (std::string path) { return host->animationRunning (juce::String (path)); });
        g.set_function ("__transportState", [this] () { return varToSol (lua, host->transportState()); });
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

        g.set_function ("saveSetting", [this] (std::string key, sol::object v)
            { host->saveSetting (juce::String (key), solToVar (v)); });
        g.set_function ("__loadSetting", [this] (std::string key)
            { return varToSol (lua, host->loadSetting (juce::String (key))); });
        g.set_function ("listSettings", [this] () { return varToSol (lua, host->listSettings()); });
        g.set_function ("forgetSetting", [this] (std::string key)
            { return host->forgetSetting (juce::String (key)); });

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
