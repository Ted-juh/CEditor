// ctrlrLua.js — a Ctrlr panel's Lua, run in CEditor's own Lua (5.4) against a stand-in for Ctrlr.
//
// Ctrlr runs a panel's methods in LuaJIT (CtrlrX; Lua 5.1 in the original), against objects its C++
// binds with luabind: the panel, its modulators and components, CtrlrMidiMessage, MemoryBlock and
// a few hundred more. This file is the Lua half of a stand-in for those objects, written from
// CtrlrX's own bindings (Source/Lua/CtrlrLuaManager.cpp, Source/MIDI/CtrlrMidiMessage.cpp,
// Source/Lua/JuceClasses/LMemory.cpp), so the panel's code runs as written. Two parts:
//
//   PRELUDE   what Lua 5.1 and LuaJIT have and 5.4 does not, or does differently: unpack,
//             loadstring, the `bit` library (LuaJIT's BitOp, signed 32-bit results), and integer
//             arguments truncated where 5.4 refuses a number with a fraction (string.format's %d,
//             string.char, string.sub…).
//   STAND-IN  the Ctrlr objects, with a RECORDER: what a call sends, and everything it touched
//             that the stand-in does not reproduce or that another control could change.
//
// Its first use is LEARNING (learn.js): each control whose MIDI Ctrlr sends from Lua is run
// through every value it can take, and what it sends becomes a device-profile parameter where the
// bytes follow from that control's value alone. So the recorder is strict about what it cannot
// vouch for: an API it does not implement, a read of another control or of a global variable, a
// write that would make another control send, an error. Any of those and the control is not
// learned; nothing is guessed.

import { CTRLR_BOUND, CTRLR_VALUE_METHODS } from './ctrlrBindings.js';

/** Lua 5.1 / LuaJIT behaviour on Lua 5.4. */
export const CTRLR_LUA_PRELUDE = String.raw`
local math_type, tointeger, floor, ceil = math.type, math.tointeger, math.floor, math.ceil

-- A number as the integer 5.1 would have used: truncated toward zero, as a C cast does.
local function toint(x)
  if type(x) ~= 'number' then return x end
  if math_type(x) == 'integer' then return x end
  if x ~= x or x == math.huge or x == -math.huge then return 0 end
  return tointeger(x >= 0 and floor(x) or ceil(x)) or 0
end
__ctrlr_toint = toint

-- LuaJIT has one kind of number and writes it with %.14g: 32 whether it came from 64 / 2 or not.
-- Lua 5.4 writes a float as "32.0". (Joining one into text with .. still gives "32.0" here; no
-- function reaches that.)
do
  local tostring54, tonumber54, format = tostring, tonumber, string.format
  tostring = function(x)
    if math_type(x) == 'float' then return format('%.14g', x) end
    return tostring54(x)
  end
  -- With a base, LuaJIT reads a number as its text: tonumber(10, 16) is 16. Lua 5.4 refuses it.
  tonumber = function(x, base)
    if base == nil then return tonumber54(x) end
    if type(x) == 'number' then x = tostring(x) end
    return tonumber54(x, base)
  end
end

unpack = unpack or table.unpack
loadstring = loadstring or load
do
  -- table.concat writes a number as tostring does: LuaJIT's way, above.
  local concat = table.concat
  table.concat = function(t, sep, i, j)
    local a, b = toint(i or 1), toint(j or #t)
    local float = false
    for k = a, b do if math_type(t[k]) == 'float' then float = true break end end
    if not float then return concat(t, sep, a, b) end
    local copy = {}
    for k = a, b do local v = t[k] if math_type(v) == 'float' then v = tostring(v) end copy[k - a + 1] = v end
    return concat(copy, sep, 1, b - a + 1)
  end
end
table.getn = table.getn or function(t) return #t end
table.setn = table.setn or function() end
table.maxn = table.maxn or function(t) local n = 0 for k in pairs(t) do if type(k) == 'number' and k > n then n = k end end return n end
math.pow = math.pow or function(a, b) return a ^ b end
math.mod = math.mod or math.fmod
math.ldexp = math.ldexp or function(m, e) return m * 2.0 ^ e end
math.log10 = math.log10 or function(x) return math.log(x, 10) end
string.gfind = string.gfind or string.gmatch

-- 5.4 refuses a float with a fraction where an integer is wanted; 5.1 truncated it.
local function wrapInts(fn, positions)
  return function(...)
    local args = table.pack(...)
    for _, i in ipairs(positions) do args[i] = toint(args[i]) end
    return fn(table.unpack(args, 1, args.n))
  end
end
-- (An error inside these wrappers names the Lua function: 'sub', 'format' and so on.)
do
  local sub, byte, rep = string.sub, string.byte, string.rep
  string.sub = wrapInts(sub, { 2, 3 })
  string.byte = wrapInts(byte, { 2, 3 })
  string.rep = wrapInts(rep, { 2 })
end
do
  local char = string.char
  string.char = function(...)
    local args = table.pack(...)
    for i = 1, args.n do args[i] = toint(args[i]) end
    return char(table.unpack(args, 1, args.n))
  end
  -- LuaJIT's table.insert and table.remove (lib_table.c): raw, as LuaJIT's table functions are,
  -- and with no check on the position. Lua 5.4 goes through __index and stops with "position out
  -- of bounds" where LuaJIT inserts there, or removes nothing.
  local function checkTable(t, name)
    if type(t) ~= 'table' then error("bad argument #1 to '" .. name .. "' (table expected, got " .. type(t) .. ')', 3) end
  end
  table.insert = function(t, ...)
    checkTable(t, 'insert')
    local n = select('#', ...)
    if n == 1 then rawset(t, rawlen(t) + 1, (...)) return end
    if n ~= 2 then error("wrong number of arguments to 'insert'", 2) end
    local pos, value = ...
    pos = toint(pos)
    local i = rawlen(t) + 1
    while i > pos do rawset(t, i, rawget(t, i - 1)) i = i - 1 end
    rawset(t, pos, value)
  end
  table.remove = function(t, pos)
    checkTable(t, 'remove')
    local len = rawlen(t)
    if pos == nil then
      if len ~= 0 then local old = rawget(t, len) rawset(t, len, nil) return old end
      return
    end
    pos = toint(pos)
    if pos >= 1 and pos <= len then
      local old = rawget(t, pos)
      for i = pos + 1, len do rawset(t, i - 1, rawget(t, i)) end
      rawset(t, len, nil)
      return old
    end
  end
  -- ipairs reads raw in LuaJIT and stops at the first nil. Lua 5.4's goes through __index, so a
  -- table whose __index invents a value for any key (a JD-990 panel's list of tones) never ends.
  ipairs = function(t)
    checkTable(t, 'ipairs')
    return function(tt, i)
      i = i + 1
      local v = rawget(tt, i)
      if v ~= nil then return i, v end
    end, t, 0
  end
  local format = string.format
  string.format = function(fmt, ...)
    local args = table.pack(...)
    local i = 0
    for flags, conv in tostring(fmt):gmatch('%%([-+ #0]*%d*%.?%d*)([%a%%])') do
      if conv ~= '%' then
        i = i + 1
        if (conv == 'd' or conv == 'i' or conv == 'x' or conv == 'X' or conv == 'o' or conv == 'c' or conv == 'u')
            and type(args[i]) == 'number' then
          args[i] = toint(args[i])
        elseif conv == 's' and math_type(args[i]) == 'float' then
          args[i] = tostring(args[i])
        end
      end
    end
    fmt = tostring(fmt):gsub('%%([-+ #0]*%d*%.?%d*)u', '%%%1d')
    return format(fmt, table.unpack(args, 1, args.n))
  end
end

-- LuaJIT's BitOp: arguments rounded to integers, results signed 32-bit.
do
  local function norm(x)
    if math_type(x) ~= 'integer' then
      x = tonumber(x) or 0
      local r = floor(x)
      local d = x - r
      if d > 0.5 or (d == 0.5 and r % 2 == 1) then r = r + 1 end
      x = tointeger(r) or 0
    end
    x = x & 0xFFFFFFFF
    if x >= 0x80000000 then x = x - 0x100000000 end
    return x
  end
  local u = function(x) return norm(x) & 0xFFFFFFFF end
  bit = {
    tobit = norm,
    band = function(a, ...) local r = u(a) for _, b in ipairs({ ... }) do r = r & u(b) end return norm(r) end,
    bor = function(a, ...) local r = u(a) for _, b in ipairs({ ... }) do r = r | u(b) end return norm(r) end,
    bxor = function(a, ...) local r = u(a) for _, b in ipairs({ ... }) do r = r ~ u(b) end return norm(r) end,
    bnot = function(a) return norm(~u(a)) end,
    lshift = function(a, n) return norm(u(a) << (u(n) & 31)) end,
    rshift = function(a, n) return norm(u(a) >> (u(n) & 31)) end,
    arshift = function(a, n) local v, s = norm(a), u(n) & 31 if v >= 0 then return v >> s end return norm(~((~v) >> s)) end,
    rol = function(a, n) local s = u(n) & 31 local v = u(a) return norm(((v << s) | (v >> (32 - s))) & 0xFFFFFFFF) end,
    ror = function(a, n) local s = u(n) & 31 local v = u(a) return norm(((v >> s) | (v << (32 - s))) & 0xFFFFFFFF) end,
    bswap = function(a) local v = u(a) return norm(((v & 0xFF) << 24) | ((v & 0xFF00) << 8) | ((v >> 8) & 0xFF00) | (v >> 24)) end,
    tohex = function(a, n)
      n = n or 8
      local upper = n < 0
      if upper then n = -n end
      local s = string.format(upper and '%0' .. n .. 'X' or '%0' .. n .. 'x', u(a))
      return s:sub(-n)
    end,
  }
  bit32 = bit32 or {
    band = function(...) return bit.band(...) & 0xFFFFFFFF end,
    bor = function(...) return bit.bor(...) & 0xFFFFFFFF end,
    bxor = function(...) return bit.bxor(...) & 0xFFFFFFFF end,
    bnot = function(a) return bit.bnot(a) & 0xFFFFFFFF end,
    lshift = function(a, n) return bit.lshift(a, n) & 0xFFFFFFFF end,
    rshift = function(a, n) return bit.rshift(a, n) & 0xFFFFFFFF end,
    extract = function(a, f, w) w = w or 1 return (u(a) >> f) & ((1 << w) - 1) end,
  }
end
`;

/**
 * The Ctrlr objects, with the recorder. The panel itself is `__CTRLR_PANEL`, a table the caller
 * defines before this runs (see `panelLiteral`).
 */
export const CTRLR_LUA_STANDIN = `__CTRLR_BOUND = ${luaLiteral(CTRLR_BOUND)}
__CTRLR_VALUE_METHODS = ${luaLiteral(CTRLR_VALUE_METHODS)}
` + String.raw`
local toint = __ctrlr_toint
local P = __CTRLR_PANEL

-- The recorder. One per run; nil outside a run (loading, between runs).
local REC = nil
local function rec(kind, name)
  if not REC then return end
  local t = REC[kind]
  t[name] = (t[name] or 0) + 1
end

-- Something the stand-in does not reproduce. It absorbs every use, so the method runs on and the
-- recorder can say what was missing; if one of these ever reaches the bytes, the run is tainted.
local Absorb = {}
local function absorber(name) return setmetatable({ __absorb = name }, Absorb) end
__ctrlr_absorber = absorber
Absorb.__index = function(t, k)
  local name = rawget(t, '__absorb') .. ':' .. tostring(k)
  return function(...) rec('unknown', name) return absorber(name) end
end
Absorb.__call = function(t, ...) rec('unknown', rawget(t, '__absorb') .. '()') return absorber(rawget(t, '__absorb')) end
Absorb.__tostring = function(t) rec('unknown', rawget(t, '__absorb') .. ' as text') return '' end
Absorb.__concat = function(a, b) rec('unknown', 'joined text') return '' end
for _, op in ipairs({ '__add', '__sub', '__mul', '__div', '__mod', '__unm', '__idiv', '__band', '__bor', '__bxor', '__shl', '__shr', '__pow' }) do
  Absorb[op] = function() rec('unknown', 'arithmetic on an unknown value') if REC then REC.tainted = true end return 0 end
end
Absorb.__eq = function() return false end
Absorb.__lt = function() return false end
Absorb.__le = function() return false end
Absorb.__len = function() return 0 end

-- A panel's Lua is somebody else's code. It gets no files, no processes and nothing loaded from
-- disk: io, os (but its clocks), require, dofile, loadfile absorb and are recorded, and load and
-- loadstring take source text only, never precompiled chunks.
do
  local sethook = debug.sethook
  __ctrlr_sethook = sethook
  __ctrlr_traceback = debug.traceback
  local os_time, os_clock, os_date, os_difftime = os.time, os.clock, os.date, os.difftime
  local rawload = load
  -- Files fail as a missing file fails, so a panel's own "could not open" branch runs.
  io = setmetatable({
    lines = function() rec('unknown', 'io.lines') return function() return nil end end,
  }, { __index = function(_, k) local name = 'io.' .. tostring(k) return function() rec('unknown', name) return nil, 'no files here' end end })
  os = setmetatable({ time = os_time, clock = os_clock, date = os_date, difftime = os_difftime }, {
    __index = function(_, k) local name = 'os.' .. tostring(k) return function() rec('unknown', name) return nil end end,
  })
  package = { preload = {}, path = '', cpath = '' }
  package.loaded = { _G = _G, math = math, string = string, table = table, coroutine = coroutine,
                     utf8 = utf8, bit = bit, bit32 = bit32, os = os, io = io, debug = debug, package = package }
  -- Lua 5.1's module(): the module's table, made global. (Without setfenv the functions it defines
  -- become globals too, which the panels that use it never notice.)
  module = function(name)
    local t = package.loaded[name] or _G[name] or {}
    _G[name] = t
    package.loaded[name] = t
    return t
  end
  -- A module that is not here fails as Lua fails, so pcall(require, 'ffi') says false.
  require = function(name)
    if package.loaded[name] ~= nil then return package.loaded[name] end
    error("module '" .. tostring(name) .. "' not found", 2)
  end
  dofile = function() rec('unknown', 'dofile') return nil end
  loadfile = function() rec('unknown', 'loadfile') return nil end
  string.dump = nil
  -- What debugging helpers read, harmless: no hooks, no locals, no upvalues.
  debug = {
    getinfo = function() return { short_src = '', source = '', currentline = 0, what = 'Lua', name = '' } end,
    traceback = function(m) return tostring(m or '') end,
    sethook = function() end, gethook = function() return nil end,
    getlocal = function() return nil end, getupvalue = function() return nil end,
  }
  load = function(chunk, name, mode, ...)
    if select('#', ...) > 0 then return rawload(chunk, name, 't', ...) end
    return rawload(chunk, name, 't')
  end
  loadstring = function(source, name) return rawload(source, name, 't') end
end

-- A class. A method it does not have is nil, as in Ctrlr for a name CtrlrX does not bind: "if
-- block.getRawAddress then" takes the path that works, and a call fails with the method's name in
-- the error. A class Ctrlr draws (a component, the canvas) names the lists in ctrlrBindings.js it
-- has from CtrlrX; a method on those that the stand-in leaves undone is absorbed, recorded as
-- "Class:method": as drawing, or, if it reads or moves a value, as not reproduced. A class of data
-- (data = true: JUCE's String) absorbs nothing as drawing.
local VALUE_METHODS = {}
for _, k in ipairs(__CTRLR_VALUE_METHODS) do VALUE_METHODS[k] = true end
local function class(name, lists, data)
  local c = {}
  c.__name = name
  local bound = {}
  for _, list in ipairs(lists or {}) do for _, k in ipairs(__CTRLR_BOUND[list]) do bound[k] = true end end
  c.__index = function(t, k)
    local m = rawget(c, k)
    if m ~= nil then return m end
    if not bound[k] then return nil end
    local full = name .. ':' .. tostring(k)
    local kind = (data or VALUE_METHODS[k]) and 'unknown' or 'ui'
    return function(...) rec(kind, full) return absorber(full) end
  end
  return c
end

-- ---- MemoryBlock (LMemoryBlock) ------------------------------------------------------------------
local MemoryBlock = class('MemoryBlock')
local function newBlock(bytes) return setmetatable({ b = bytes or {} }, MemoryBlock) end
local function hexBytes(text)
  local out = {}
  text = tostring(text):gsub('[^%x]', '')
  for i = 1, #text - 1, 2 do out[#out + 1] = tonumber(text:sub(i, i + 1), 16) end
  return out
end
local function tableBytes(t)
  local out = {}
  for _, v in ipairs(t) do
    if type(v) ~= 'number' then if REC then REC.tainted = true end v = 0 end
    out[#out + 1] = toint(v) & 0xFF
  end
  return out
end
local function bytesOf(x)
  if type(x) == 'table' and getmetatable(x) == MemoryBlock then return x.b end
  if type(x) == 'table' and rawget(x, '__absorb') then if REC then REC.tainted = true end return {} end
  if type(x) == 'table' then return tableBytes(x) end
  if type(x) == 'string' then return hexBytes(x) end
  return {}
end
__ctrlr_bytesOf = bytesOf
function MemoryBlock.new(a, b)
  if a == nil then return newBlock({}) end
  if type(a) == 'number' then local t = {} for i = 1, toint(a) do t[i] = 0 end return newBlock(t) end
  local copy = {}
  for i, v in ipairs(bytesOf(a)) do copy[i] = v end
  return newBlock(copy)
end
MemoryBlock.getByte = function(self, i) return self.b[toint(i) + 1] or 0 end
MemoryBlock.setByte = function(self, i, v)
  i = toint(i)
  if i >= 0 and i <= #self.b then
    if type(v) ~= 'number' then if REC then REC.tainted = true end v = 0 end
    self.b[i + 1] = toint(v) & 0xFF
  end
end
MemoryBlock.getSize = function(self) return #self.b end
MemoryBlock.setSize = function(self, n, zero)
  n = toint(n)
  for i = #self.b + 1, n do self.b[i] = 0 end
  for i = #self.b, n + 1, -1 do self.b[i] = nil end
end
MemoryBlock.ensureSize = function(self, n) if #self.b < toint(n) then self:setSize(n) end end
MemoryBlock.fillWith = function(self, v) for i = 1, #self.b do self.b[i] = toint(v) & 0xFF end end
MemoryBlock.append = function(self, other) for _, v in ipairs(bytesOf(other)) do self.b[#self.b + 1] = v end end
MemoryBlock.replaceWith = function(self, other) local copy = {} for i, v in ipairs(bytesOf(other)) do copy[i] = v end self.b = copy end
MemoryBlock.insert = function(self, other, a, b)
  local src = bytesOf(other)
  local count, at = #src, toint(a)
  if b ~= nil then count, at = toint(a), toint(b) end
  for i = count, 1, -1 do table.insert(self.b, math.min(at, #self.b) + 1, src[i]) end
end
MemoryBlock.removeSection = function(self, start, size)
  start, size = toint(start), toint(size)
  for _ = 1, size do if self.b[start + 1] ~= nil then table.remove(self.b, start + 1) end end
end
MemoryBlock.getRange = function(self, start, size)
  start, size = toint(start), toint(size)
  local out = {}
  if #self.b >= start + size then for i = 1, size do out[i] = self.b[start + i] end end
  return newBlock(out)
end
MemoryBlock.copyFrom = function(self, other, offset, size)
  local src = bytesOf(other)
  offset, size = toint(offset), toint(size or #src)
  for i = 1, size do if offset + i <= #self.b then self.b[offset + i] = src[i] or 0 end end
end
MemoryBlock.copyTo = function(self, other, offset, size)
  offset, size = toint(offset), toint(size)
  if getmetatable(other) == MemoryBlock then for i = 1, size do other.b[i] = self.b[offset + i] or 0 end end
end
MemoryBlock.toHexString = function(self, group)
  group = toint(group or 1)
  local parts = {}
  for i, v in ipairs(self.b) do
    parts[#parts + 1] = string.format('%02x', v)
    if group > 0 and i % group == 0 and i < #self.b then parts[#parts + 1] = ' ' end
  end
  return table.concat(parts)
end
MemoryBlock.loadFromHexString = function(self, text) self.b = hexBytes(text) end
MemoryBlock.createFromTable = function(self, t) for _, v in ipairs(tableBytes(t)) do self.b[#self.b + 1] = v end end
MemoryBlock.insertIntoTable = function(self, t) for i, v in ipairs(self.b) do t[i] = v end end
MemoryBlock.toLuaTable = MemoryBlock.insertIntoTable
MemoryBlock.getBitRange = function(self, start, count)
  start, count = toint(start), toint(count)
  local value = 0
  for i = 0, count - 1 do
    local bitIndex = start + i
    local byte = self.b[(bitIndex >> 3) + 1] or 0
    if (byte >> (bitIndex & 7)) & 1 == 1 then value = value | (1 << i) end
  end
  return value
end
MemoryBlock.setBitRange = function(self, start, count, value)
  start, count, value = toint(start), toint(count), toint(value)
  for i = 0, count - 1 do
    local bitIndex = start + i
    local at = (bitIndex >> 3) + 1
    local byte = self.b[at] or 0
    if (value >> i) & 1 == 1 then byte = byte | (1 << (bitIndex & 7)) else byte = byte & ~(1 << (bitIndex & 7)) end
    if at <= #self.b then self.b[at] = byte end
  end
end
MemoryBlock.toString = function(self) local t = {} for i, v in ipairs(self.b) do t[i] = string.char(v) end return table.concat(t) end
MemoryBlock.getData = function(self) return self end
setmetatable(MemoryBlock, { __call = function(_, ...) return MemoryBlock.new(...) end })
-- LMemoryBlock's static makers: from a table of bytes, or from a string's own bytes (not hex).
-- Called with a dot or a colon, as CtrlrX's overloads allow.
local function staticArg(a, b) if a == MemoryBlock then return b end return a end
MemoryBlock.fromLuaTable = function(a, b) return MemoryBlock.new(staticArg(a, b)) end
local function stringBytes(text) local t = {} text = tostring(text) for i = 1, #text do t[i] = string.byte(text, i) end return newBlock(t) end
MemoryBlock.fromLuaString = function(a, b) return stringBytes(staticArg(a, b)) end
MemoryBlock.fromLuaBinaryString = MemoryBlock.fromLuaString
_G.MemoryBlock = MemoryBlock

-- ---- CtrlrMidiMessage --------------------------------------------------------------------------
local Midi = class('CtrlrMidiMessage')
local function newMidi(bytes, props) return setmetatable({ data = newBlock(bytes), props = props or {} }, Midi) end
_G.CtrlrMidiMessage = setmetatable({
  CC = 0, Aftertouch = 1, ChannelPressure = 2, NoteOn = 3, NoteOff = 4, SysEx = 5, Multi = 6,
  ProgramChange = 7, PitchWheel = 8, None = 9,
}, { __call = function(_, x)
  if x == nil then return newMidi({}) end
  local copy = {}
  for i, v in ipairs(bytesOf(type(x) == 'table' and getmetatable(x) == Midi and x.data or x)) do copy[i] = v end
  return newMidi(copy)
end })
Midi.getData = function(self) return self.data end
Midi.getLuaData = Midi.getData
Midi.getSize = function(self) return #self.data.b end
Midi.toString = function(self) return self.data:toHexString(1) end
Midi.getProperty = function(self, k) return self.props[k] end
Midi.setProperty = function(self, k, v) self.props[k] = v end
Midi.getChannel = function(self) local s = self.data.b[1] or 0 return (s & 15) + 1 end
Midi.setChannel = function(self, ch) local s = self.data.b[1] if s and s < 0xF0 then self.data.b[1] = (s & 0xF0) | ((toint(ch) - 1) & 15) end end
Midi.getNumber = function(self) return self.data.b[2] or 0 end
Midi.setNumber = function(self, n) if self.data.b[2] then self.data.b[2] = toint(n) & 0x7F end end
Midi.getValue = function(self) return self.data.b[3] or 0 end
Midi.setValue = function(self, v) if self.data.b[3] then self.data.b[3] = toint(v) & 0x7F end end
Midi.getType = function(self) local s = self.data.b[1] or 0 if s == 0xF0 then return 5 elseif s >= 0xB0 and s < 0xC0 then return 0 elseif s >= 0xC0 and s < 0xD0 then return 7 end return 9 end
Midi.getMidiMessageType = Midi.getType

local function send(x)
  if not REC then return end
  local bytes
  if type(x) == 'table' and getmetatable(x) == Midi then bytes = x.data.b
  elseif type(x) == 'string' then bytes = hexBytes(x)
  else bytes = bytesOf(x) end
  local copy = {}
  for i, v in ipairs(bytes) do copy[i] = v end
  REC.sends[#REC.sends + 1] = copy
end

-- ---- Components and modulators -----------------------------------------------------------------
local Component = class('CtrlrComponent', { 'component', 'ctrlrComponent' })
local Modulator = class('CtrlrModulator')
local mods, modByName = {}, {}
local function component(m)
  if not rawget(m, 'comp') then
    rawset(m, 'comp', setmetatable({ mod = m, props = rawget(m, 'compProps') or {}, width = rawget(m, 'width'), height = rawget(m, 'height') }, Component))
  end
  return rawget(m, 'comp')
end
-- What a file leaves out, Ctrlr's constructors had set (ctrlrDefaults.js).
local D = __CTRLR_DEFAULTS or { component = {}, types = {}, modulator = {}, midi = {} }
local function propValue(props, k, kind, uiType)
  local v = props[k]
  if v ~= nil then return v end
  if kind == 'component' then
    local t = D.types[uiType or '']
    if t and t[k] ~= nil then return t[k] end
    return D.component[k]
  end
  return (D[kind] or {})[k]
end

-- What the current run may read freely: the control being run.
local function readOf(m) if REC and m ~= REC.self then rec('reads', 'modulator ' .. m.name) end end
local function writeOf(m, midi, kind)
  if not REC then return end
  if m == REC.self then return end
  rec('writes', (midi and (rawget(m, 'sends') and 'sends' or (rawget(m, 'lua') and 'lua' or 'quiet')) or 'quiet') .. ' ' .. m.name)
end
local function mapped(m, v)
  local list = rawget(m, 'list')
  if list and #list > 0 then
    local entry = list[toint(v) + 1]
    if entry then return entry end
  end
  return v
end

Modulator.getValue = function(self) readOf(self) return self.value end
Modulator.getModulatorValue = Modulator.getValue
Modulator.getValueNonMapped = Modulator.getValue
-- std::round: halves away from zero.
local function round(v) if v >= 0 then return math.floor(v + 0.5) end return -math.floor(-v + 0.5) end
Modulator.getValueInt = function(self) readOf(self) return round(self.value) end
Modulator.getModulatorValueInt = Modulator.getValueInt
Modulator.getValueNonMappedInt = function(self) readOf(self) return math.floor(self.value) end
Modulator.getValueMapped = function(self) readOf(self) return mapped(self, self.value) end
Modulator.getValueMappedInt = function(self) readOf(self) return math.floor(mapped(self, self.value)) end
Modulator.getMaxModulatorValue = function(self) return self.max end
Modulator.getMinModulatorValue = function(self) return self.min end
Modulator.getMaxModulatorValueInt = function(self) return math.ceil(self.max) end
Modulator.getMinModulatorValueInt = function(self) return math.floor(self.min) end
Modulator.getMaxNonMapped = Modulator.getMaxModulatorValue
Modulator.getMinNonMapped = Modulator.getMinModulatorValue
Modulator.getMaxNonMappedInt = Modulator.getMaxModulatorValueInt
Modulator.getMinNonMappedInt = Modulator.getMinModulatorValueInt
Modulator.getMaxMapped = function(self) local l = rawget(self, 'list') if l and #l > 0 then local m = l[1] for _, v in ipairs(l) do if v > m then m = v end end return m end return self.max end
Modulator.getMinMapped = function(self) local l = rawget(self, 'list') if l and #l > 0 then local m = l[1] for _, v in ipairs(l) do if v < m then m = v end end return m end return self.min end
Modulator.getMaxMappedInt = function(self) return math.floor(self:getMaxMapped()) end
Modulator.getMinMappedInt = function(self) return math.floor(self:getMinMapped()) end
Modulator.setValue = function(self, v, force, mute) writeOf(self, not mute) if type(v) == 'number' then self.value = toint(v) end end
Modulator.setValueNonMapped = Modulator.setValue
Modulator.setValueMapped = function(self, v, force, mute)
  writeOf(self, not mute)
  local l = rawget(self, 'list')
  if l then for i, entry in ipairs(l) do if entry == v then self.value = i - 1 return end end end
  if type(v) == 'number' then self.value = toint(v) end
end
Modulator.setModulatorValue = function(self, v, vst, midi, ui) writeOf(self, midi) if type(v) == 'number' then self.value = toint(v) end end
Modulator.getName = function(self) return self.name end
Modulator.getModulatorName = Modulator.getName
Modulator.getLuaName = Modulator.getName
Modulator.getVstIndex = function(self) return rawget(self, 'vstIndex') or -1 end
Modulator.getComponent = function(self) return component(self) end
Modulator.getRestoreState = function(self) return false end
Modulator.isRestoring = Modulator.getRestoreState
Modulator.setRestoreState = function() end
Modulator.getMidiMessage = function(self) return newMidi({}, rawget(self, 'midiProps') or {}) end
Modulator.getProperty = function(self, k)
  if k == 'modulatorValue' then readOf(self) return self.value end
  local v = self.props[k]
  local midiProps = rawget(self, 'midiProps')
  if v == nil and midiProps then v = midiProps[k] end
  if v == nil then v = propValue(self.props, k, 'modulator') end
  if v == nil then v = propValue({}, k, 'midi') end
  return v
end
Modulator.getPropertyString = function(self, k) local v = self:getProperty(k) return v == nil and '' or tostring(v) end
Modulator.getPropertyInt = function(self, k) return toint(tonumber(self:getProperty(k)) or 0) end
Modulator.getPropertyDouble = function(self, k) return tonumber(self:getProperty(k)) or 0 end
Modulator.setProperty = function(self, k, v)
  if k == 'modulatorValue' then writeOf(self, true) self.value = toint(tonumber(v) or self.value) return end
  self.props[k] = v
end
Modulator.setPropertyString = Modulator.setProperty
Modulator.setPropertyInt = Modulator.setProperty
Modulator.setPropertyDouble = Modulator.setProperty
Modulator.setPropertyColour = Modulator.setProperty
Modulator.removeProperty = function(self, k) self.props[k] = nil end

Component.getOwner = function(self) return self.mod end
Component.getProperty = function(self, k) return propValue(self.props, k, 'component', self.props.uiType) end
Component.getPropertyString = function(self, k) local v = self:getProperty(k) return v == nil and '' or tostring(v) end
Component.getPropertyInt = function(self, k) return toint(tonumber(self:getProperty(k)) or 0) end
Component.getPropertyDouble = function(self, k) return tonumber(self:getProperty(k)) or 0 end
Component.setProperty = function(self, k, v) self.props[k] = v end
Component.setPropertyString = Component.setProperty
Component.setPropertyInt = Component.setProperty
Component.setPropertyDouble = Component.setProperty
Component.setPropertyColour = Component.setProperty
Component.removeProperty = function(self, k) self.props[k] = nil end
Component.getText = function(self) return tostring(self.props.uiLabelText or '') end
Component.setText = function(self, t) self.props.uiLabelText = t end
Component.getComponentText = Component.getText
Component.setComponentText = Component.setText
Component.getComponentValue = function(self) return self.mod:getValue() end
Component.setComponentValue = function(self, v, notify) self.mod:setValue(v, true, not notify) end
Component.getValue = Component.getComponentValue
Component.setValue = Component.setComponentValue
-- A combo box, as JUCE numbers it: item ids from 1, indexes from 0; the control's value is the index.
Component.getSelectedId = function(self) return toint(self.mod:getValue()) + 1 end
Component.getSelectedItemIndex = function(self) return toint(self.mod:getValue()) end
-- A button is on when its value is not 0.
Component.getToggleState = function(self) return toint(self.mod:getValue()) ~= 0 end
-- The JUCE box inside a CtrlrCombo: its items are the control's list.
local ComboBox = class('ComboBox', { 'component', 'comboBox' })
Component.getOwnedComboBox = function(self) return setmetatable({ mod = self.mod }, ComboBox) end
ComboBox.getNumItems = function(self) local l = rawget(self.mod, 'texts') return l and #l or 0 end
ComboBox.getItemId = function(self, i) return toint(i) + 1 end
ComboBox.indexOfItemId = function(self, id) return toint(id) - 1 end
ComboBox.getItemText = function(self, i) local l = rawget(self.mod, 'texts') return l and l[toint(i) + 1] or '' end
ComboBox.getSelectedId = Component.getSelectedId
ComboBox.getSelectedItemIndex = Component.getSelectedItemIndex
ComboBox.getText = function(self) return ComboBox.getItemText(self, self.mod:getValue()) end
Component.getWidth = function(self) return rawget(self, 'width') or 0 end
Component.getHeight = function(self) return rawget(self, 'height') or 0 end
Component.isVisible = function(self) return self.props.componentVisibility ~= '0' end
for _, name in ipairs({ 'repaint', 'setVisible', 'setEnabled', 'setColour', 'setBounds', 'toFront', 'toBack',
                        'grabKeyboardFocus', 'setAlpha', 'resized', 'setSize', 'setTopLeftPosition' }) do
  Component[name] = function() end
end

for i, m in ipairs(P.modulators) do
  m.props = m.props or {}
  m.compProps = m.compProps or {}
  setmetatable(m, Modulator)
  mods[i] = m
  if modByName[m.name] == nil then modByName[m.name] = m end
end

-- ---- The panel ---------------------------------------------------------------------------------
local Panel = class('CtrlrPanel')
local Layer = class('CtrlrPanelCanvasLayer', { 'component', 'layer' })
local Canvas = class('CtrlrPanelCanvas', { 'component', 'canvas' })
local state = { bootstrap = false, restore = false, program = false }
local panel = setmetatable({ props = P.props or {}, globals = P.globals or {} }, Panel)
__ctrlr_state = state

local function byName(name) return modByName[tostring(name)] end
Panel.getModulatorByName = function(self, name) return byName(name) end
Panel.getModulator = Panel.getModulatorByName
Panel.getModulatorByIndex = function(self, i) return mods[toint(i) + 1] end
Panel.getNumModulators = function() return #mods end
Panel.getModulatorWithProperty = function(self, k, v)
  for _, m in ipairs(mods) do if tostring(m.props[k]) == tostring(v) then return m end end
  return nil
end
Panel.getModulatorsWithProperty = function(self, k, v)
  local out = {}
  for _, m in ipairs(mods) do if tostring(m.props[k]) == tostring(v) then out[#out + 1] = m end end
  return out
end
Panel.getComponent = function(self, name) local m = byName(name) return m and component(m) end
for _, kind in ipairs({ 'Button', 'Combo', 'FileListBox', 'FixedImageSlider', 'FixedSlider', 'ImageButton', 'ImageSlider',
                        'LCDLabel', 'Label', 'ListBox', 'Slider', 'ToggleButton', 'Waveform' }) do
  Panel['get' .. kind] = Panel.getComponent
  Panel['get' .. kind .. 'Component'] = Panel.getComponent
end
Panel.sendMidiMessageNow = function(self, m) send(m) end
Panel.sendMidi = function(self, m) send(m) end
Panel.getGlobalVariable = function(self, i) rec('reads', 'global variable ' .. tostring(i)) return self.globals[toint(i) + 1] or 0 end
Panel.setGlobalVariable = function(self, i, v) rec('writes', 'quiet global variable ' .. tostring(i)) self.globals[toint(i) + 1] = v end
Panel.getBootstrapState = function() return state.bootstrap end
Panel.getRestoreState = function() return state.restore end
Panel.isRestoring = Panel.getRestoreState
Panel.getProgramState = function() return state.program end
Panel.setProgramState = function(self, v) state.program = v end
Panel.setRestoreState = function(self, v) state.restore = v end
Panel.isLoading = function() return state.bootstrap or state.restore or state.program end
Panel.getProperty = function(self, k) return self.props[k] end
Panel.getPropertyString = function(self, k) local v = self.props[k] return v == nil and '' or tostring(v) end
Panel.getPropertyInt = function(self, k) return toint(tonumber(self.props[k]) or 0) end
Panel.getPropertyDouble = function(self, k) return tonumber(self.props[k]) or 0 end
Panel.setProperty = function(self, k, v) self.props[k] = v end
Panel.setPropertyString = Panel.setProperty
Panel.setPropertyInt = Panel.setProperty
Panel.getCanvas = function() return setmetatable({}, Canvas) end
Panel.getPanelEditor = function() return setmetatable({}, class('CtrlrPanelEditor', { 'editor' })) end
Panel.getInputComparator = function() return setmetatable({}, class('CtrlrMidiInputComparator')) end
Canvas.getLayerByName = function() return setmetatable({}, Layer) end
Canvas.getLayer = Canvas.getLayerByName
Layer.setProperty = function() end
Layer.setPropertyInt = Layer.setProperty
Layer.setPropertyString = Layer.setProperty
Layer.getProperty = function() return nil end
_G.panel = panel

-- ---- Globals Ctrlr provides ---------------------------------------------------------------------
_G.console = function() end
_G._DBG, _G._INF, _G._WRN, _G._ERR, _G._LERR = console, console, console, console, console
_G.J = function(s) return tostring(s) end
_G.L = function(s) return tostring(s) end
_G.sleep = function() rec('ui', 'sleep') end
-- CtrlrLuaMultiTimer: callbacks by id, started and stopped. They fire only when the stand-in says
-- time has passed (__ctrlr_fire_timers): after the panel loads, as Ctrlr's do in its first seconds,
-- so a panel that sets a "loading" flag and clears it from a timer is ready afterwards, as in Ctrlr.
local Timer = class('CtrlrLuaMultiTimer')
local timers = {}
local function timerOf(id) id = toint(id) timers[id] = timers[id] or { id = id } return timers[id] end
Timer.setCallback = function(self, id, fn) timerOf(id).fn = fn end
Timer.startTimer = function(self, id, ms) rec('ui', 'timer:startTimer') local t = timerOf(id) t.running = true t.ms = tonumber(ms) or 0 end
Timer.stopTimer = function(self, id) timerOf(id).running = false end
Timer.isTimerRunning = function(self, id) return timerOf(id).running == true end
Timer.isRegistered = function(self, id) return timerOf(id).fn ~= nil end
Timer.getTimerInterval = function(self, id) return timerOf(id).ms or 0 end
_G.timer = setmetatable({}, Timer)
-- CtrlrLuaUtils (Source/Lua/CtrlrLuaUtils.cpp): static functions, called with a dot
-- (utils.infoWindow(...)). Its dialogs are UI: they answer as a person who closes them would (no,
-- nothing typed, no file chosen).
local Utils = class('CtrlrLuaUtils')
Utils.getVersionMajor = function() return 5 end
Utils.getVersionMinor = function() return 6 end
Utils.getVersionRevision = function() return 36 end
Utils.getVersionString = function() return '5.6.36' end
Utils.getPi = function() return math.pi end
Utils.get8bitSigned = function(v) v = toint(v) & 0xFF if v >= 0x80 then return v - 0x100 end return v end
Utils.get16bitSigned = function(v) v = toint(v) & 0xFFFF if v >= 0x8000 then return v - 0x10000 end return v end
Utils.getMidiInputDevices = function() return {} end
Utils.getMidiOutputDevices = function() return {} end
Utils.infoWindow = function() rec('ui', 'utils.infoWindow') end
Utils.warnWindow = function() rec('ui', 'utils.warnWindow') end
Utils.questionWindow = function() rec('ui', 'utils.questionWindow') return false end
Utils.askForTextInputWindow = function() rec('ui', 'utils.askForTextInputWindow') return '' end
for _, name in ipairs({ 'openFileWindow', 'saveFileWindow', 'getDirectoryWindow', 'openMultipleFilesWindow' }) do
  Utils[name] = function() rec('unknown', 'utils.' .. name) return absorber('File') end
end
-- DSI packing (Sequential panels): every 7 bytes become 8, the first carrying their top bits.
Utils.packDsiData = function(block)
  local src, out = bytesOf(block), {}
  for i = 1, #src, 7 do
    local high, chunk = 0, {}
    for j = 0, 6 do
      local b = src[i + j]
      if b ~= nil then high = high | (((b >> 7) & 1) << j) chunk[#chunk + 1] = b & 0x7F end
    end
    out[#out + 1] = high
    for _, b in ipairs(chunk) do out[#out + 1] = b end
  end
  return newBlock(out)
end
Utils.unpackDsiData = function(block)
  local src, out = bytesOf(block), {}
  for i = 1, #src, 8 do
    local high = src[i] or 0
    for j = 1, 7 do
      local b = src[i + j]
      if b ~= nil then out[#out + 1] = b | (((high >> (j - 1)) & 1) << 7) end
    end
  end
  return newBlock(out)
end
do
  local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  Utils.base64_encode = function(text)
    text = tostring(text)
    return ((text:gsub('.', function(x)
      local r, b = '', x:byte()
      for i = 8, 1, -1 do r = r .. (b % 2 ^ i - b % 2 ^ (i - 1) > 0 and '1' or '0') end
      return r
    end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
      if #x < 6 then return '' end
      local c = 0
      for i = 1, 6 do c = c + (x:sub(i, i) == '1' and 2 ^ (6 - i) or 0) end
      return alphabet:sub(c + 1, c + 1)
    end) .. ({ '', '==', '=' })[#text % 3 + 1])
  end
  Utils.base64_decode = function(data)
    data = tostring(data):gsub('[^' .. alphabet .. '=]', '')
    return (data:gsub('.', function(x)
      if x == '=' then return '' end
      local r, f = '', (alphabet:find(x, 1, true) - 1)
      for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and '1' or '0') end
      return r
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
      if #x ~= 8 then return '' end
      local c = 0
      for i = 1, 8 do c = c + (x:sub(i, i) == '1' and 2 ^ (8 - i) or 0) end
      return string.char(c)
    end))
  end
end
_G.utils = setmetatable({}, Utils)

-- juce::BigInteger, as panels use it: a field of bits (up to 64 here).
local Big = class('BigInteger')
local function newBig(v) return setmetatable({ v = toint(tonumber(v) or 0) }, Big) end
Big.setBit = function(self, i, value) i = toint(i) if value == false then self.v = self.v & ~(1 << i) else self.v = self.v | (1 << i) end return self end
Big.clearBit = function(self, i) self.v = self.v & ~(1 << toint(i)) return self end
Big.getBitRangeAsInt = function(self, start, count) start, count = toint(start), toint(count) return (self.v >> start) & ((1 << count) - 1) end
Big.getBitRange = function(self, start, count) return newBig(Big.getBitRangeAsInt(self, start, count)) end
Big.setBitRangeAsInt = function(self, start, count, value)
  start, count, value = toint(start), toint(count), toint(value)
  local mask = ((1 << count) - 1) << start
  self.v = (self.v & ~mask) | ((value << start) & mask)
  return self
end
Big.setRange = function(self, start, count, on)
  start, count = toint(start), toint(count)
  local mask = ((1 << count) - 1) << start
  if on then self.v = self.v | mask else self.v = self.v & ~mask end
  return self
end
Big.clear = function(self) self.v = 0 return self end
Big.isZero = function(self) return self.v == 0 end
Big.isOne = function(self) return self.v == 1 end
Big.isNegative = function(self) return self.v < 0 end
Big.toInteger = function(self) local v = self.v & 0xFFFFFFFF if v >= 0x80000000 then v = v - 0x100000000 end return v end
Big.getHighestBit = function(self) local h = -1 for i = 0, 63 do if (self.v >> i) & 1 == 1 then h = i end end return h end
Big.countNumberOfSetBits = function(self) local n = 0 for i = 0, 63 do if (self.v >> i) & 1 == 1 then n = n + 1 end end return n end
Big.findNextSetBit = function(self, i) for b = toint(i), 63 do if (self.v >> b) & 1 == 1 then return b end end return -1 end
Big.findNextClearBit = function(self, i) for b = toint(i), 63 do if (self.v >> b) & 1 == 0 then return b end end return -1 end
Big.shiftBits = function(self, n, start)
  n, start = toint(n), toint(start or 0)
  local low = self.v & ((1 << start) - 1)
  local high = self.v >> start
  high = n >= 0 and (high << n) or (high >> -n)
  self.v = low | (high << start)
  return self
end
Big.toString = function(self, base, minLength)
  base, minLength = toint(base or 16), toint(minLength or 1)
  local digits, v, out = '0123456789abcdef', self.v, ''
  repeat local d = v % base out = digits:sub(d + 1, d + 1) .. out v = v // base until v == 0
  while #out < minLength do out = '0' .. out end
  return out
end
Big.parseString = function(self, text, base) self.v = toint(tonumber(tostring(text), toint(base or 16)) or 0) return self end
Big.toMemoryBlock = function(self) local out, v = {}, self.v for i = 1, 8 do out[i] = v & 0xFF v = v >> 8 end while #out > 1 and out[#out] == 0 do out[#out] = nil end return newBlock(out) end
Big.loadFromMemoryBlock = function(self, block) local v = 0 for i, b in ipairs(bytesOf(block)) do if i <= 8 then v = v | (b << ((i - 1) * 8)) end end self.v = v return self end
setmetatable(Big, { __call = function(_, v) return newBig(v) end })
_G.BigInteger = Big
_G.CtrlrLuaBigInteger = Big
for _, name in ipairs({ 'Colour', 'Colours', 'Justification', 'Font', 'Rectangle', 'Image', 'Path', 'PathStrokeType',
                        'AffineTransform', 'AlertWindow', 'PopupMenu', 'KeyPress', 'ColourGradient', 'Point', 'Line' }) do
  _G[name] = absorber(name)
end
_G.jlimit = function(lo, hi, v) if v < lo then return lo elseif v > hi then return hi end return v end
_G.jmax = function(...) return math.max(...) end
_G.jmin = function(...) return math.min(...) end

-- CtrlrPanel's enums, as CtrlrX binds them (CtrlrLuaManager.cpp; the values are CtrlrMacros.h's).
_G.CtrlrPanel = setmetatable({
  PanelFileXML = 0, PanelFileXMLCompressed = 1, PanelFileBinary = 2, PanelFileBinaryCompressed = 3, PanelFileExport = 4,
  NotifySuccess = 0, NotifyFailure = 1, NotifyInformation = 2, NotifyWarning = 3,
  EncodeNormal = 0, Encode7bitMSBFirst = 1, Encode7bitLSBFirst = 2, EncodeMSBFirst = 1, EncodeLSBFirst = 2,
  Encode4bitMsbFirst = 3, Encode4bitLsbFirst = 4, EncodeMsbFirst = 3, EncodeLsbFirst = 4,
  EncodeNibbleMsbFirst = 3, EncodeNibbleLsbFirst = 4, EncodeSignedNibbleMsbFirst = 5, EncodeSignedNibbleLsbFirst = 6,
  Encode16bitLsbFirst = 7, Encode16bitMsbFirst = 8,
  SplitNone = 0, Split4Bits = 1, Split7Bits = 2, Split8Bits = 3,
}, {})

-- What CtrlrX gives every panel besides panel, utils and timer: its resources (pictures, fonts).
_G.resources = setmetatable({}, class('CtrlrPanelResourceManager', { 'resources' }))
_G.CtrlrLuaComponentAnimator = function() return setmetatable({}, class('CtrlrLuaComponentAnimator', { 'animator' })) end
_G.BubbleMessageComponent = function() return setmetatable({}, class('BubbleMessageComponent', { 'component', 'bubble' })) end

-- juce::String as CtrlrX binds it: made from text, or from a number as JUCE writes one (%g, or so
-- many decimals); its methods count from 0 and hand back Lua strings, as CtrlrX's converter does.
-- It has + but no .. and no tostring, as in Ctrlr.
local JString = class('String', { 'string' }, true)
local function jtext(x)
  if type(x) == 'table' and getmetatable(x) == JString then return x.s end
  if type(x) == 'number' then return tostring(x) end
  return x
end
local function newJString(a, b)
  local s
  if a == nil then s = ''
  elseif type(a) == 'number' then
    if b ~= nil and toint(b) > 0 then s = string.format('%.' .. toint(b) .. 'f', a) else s = string.format('%g', a) end
  elseif type(a) == 'string' then s = a if type(b) == 'number' then s = s:sub(1, toint(b)) end
  elseif type(a) == 'table' and getmetatable(a) == JString then s = a.s
  else error('No matching overload found for String(' .. type(a) .. ')', 2) end
  return setmetatable({ s = s }, JString)
end
JString.__add = function(a, b) return tostring(jtext(a)) .. tostring(jtext(b)) end
local function plainFind(s, t, from) return string.find(s, t, from or 1, true) end
JString.length = function(self) return #self.s end
JString.isEmpty = function(self) return self.s == '' end
JString.isNotEmpty = function(self) return self.s ~= '' end
JString.startsWith = function(self, t) t = jtext(t) return self.s:sub(1, #t) == t end
JString.endsWith = function(self, t) t = jtext(t) return t == '' or self.s:sub(-#t) == t end
JString.startsWithIgnoreCase = function(self, t) t = jtext(t):lower() return self.s:lower():sub(1, #t) == t end
JString.contains = function(self, t) return plainFind(self.s, jtext(t)) ~= nil end
JString.containsIgnoreCase = function(self, t) return plainFind(self.s:lower(), jtext(t):lower()) ~= nil end
JString.equalsIgnoreCase = function(self, t) return self.s:lower() == jtext(t):lower() end
JString.indexOf = function(self, t) local at = plainFind(self.s, jtext(t)) return at and at - 1 or -1 end
JString.lastIndexOf = function(self, t)
  t = jtext(t)
  local last, from = -1, 1
  while true do local at = plainFind(self.s, t, from) if not at then return last end last, from = at - 1, at + 1 end
end
JString.substring = function(self, a, b)
  local len = #self.s
  a = math.max(0, toint(a))
  b = b == nil and len or math.min(len, toint(b))
  if b <= a then return '' end
  return self.s:sub(a + 1, b)
end
JString.toUpperCase = function(self) return self.s:upper() end
JString.toLowerCase = function(self) return self.s:lower() end
JString.trim = function(self) return (self.s:gsub('^%s+', ''):gsub('%s+$', '')) end
JString.trimStart = function(self) return (self.s:gsub('^%s+', '')) end
JString.trimEnd = function(self) return (self.s:gsub('%s+$', '')) end
JString.getIntValue = function(self) local n = self.s:match('^%s*([%+%-]?%d+)') return n and toint(tonumber(n)) or 0 end
JString.getDoubleValue = function(self) local n = self.s:match('^%s*([%+%-]?%d*%.?%d+[eE]?[%+%-]?%d*)') return n and tonumber(n) or 0 end
JString.getFloatValue = JString.getDoubleValue
-- Every hex digit in the text, whatever is between them, as JUCE reads it; 32 bits, signed.
JString.getHexValue32 = function(self)
  local v = 0
  for d in self.s:gmatch('%x') do v = ((v << 4) | tonumber(d, 16)) & 0xFFFFFFFF end
  if v >= 0x80000000 then v = v - 0x100000000 end
  return v
end
JString.replace = function(self, a, b)
  a, b = jtext(a), jtext(b)
  if a == '' then return self.s end
  local out, from = {}, 1
  while true do
    local at = plainFind(self.s, a, from)
    if not at then out[#out + 1] = self.s:sub(from) break end
    out[#out + 1] = self.s:sub(from, at - 1) .. b
    from = at + #a
  end
  return table.concat(out)
end
JString.upToFirstOccurrenceOf = function(self, t, include)
  t = jtext(t)
  local at = plainFind(self.s, t)
  if not at then return self.s end
  return self.s:sub(1, include and at + #t - 1 or at - 1)
end
JString.fromFirstOccurrenceOf = function(self, t, include)
  t = jtext(t)
  local at = plainFind(self.s, t)
  if not at then return '' end
  return self.s:sub(include and at or at + #t)
end
JString.dropLastCharacters = function(self, n) return self.s:sub(1, math.max(0, #self.s - toint(n))) end
JString.getLastCharacters = function(self, n) n = toint(n) if n <= 0 then return '' end return self.s:sub(-n) end
JString.paddedLeft = function(self, c, n) c = jtext(c):sub(1, 1) return string.rep(c, math.max(0, toint(n) - #self.s)) .. self.s end
JString.paddedRight = function(self, c, n) c = jtext(c):sub(1, 1) return self.s .. string.rep(c, math.max(0, toint(n) - #self.s)) end
setmetatable(JString, { __call = function(_, ...) return newJString(...) end })
_G.String = JString

-- juce::StringArray: counted from 0; an index past the end of set() appends, as JUCE's Array does.
local JStringArray = class('StringArray', { 'stringArray' }, true)
_G.StringArray = setmetatable(JStringArray, { __call = function(_, ...)
  local a = setmetatable({ items = {} }, JStringArray)
  for _, v in ipairs({ ... }) do if type(v) == 'table' and v.items then for _, x in ipairs(v.items) do a.items[#a.items + 1] = x end end end
  return a
end })
JStringArray.size = function(self) return #self.items end
JStringArray.add = function(self, t) self.items[#self.items + 1] = tostring(jtext(t)) end
JStringArray.set = function(self, i, t)
  i = toint(i)
  if i >= 0 and i < #self.items then self.items[i + 1] = tostring(jtext(t)) elseif i >= 0 then self.items[#self.items + 1] = tostring(jtext(t)) end
end
JStringArray.get = function(self, i) return self.items[toint(i) + 1] or '' end
JStringArray.clear = function(self) self.items = {} end
JStringArray.joinIntoString = function(self, sep, start, count)
  start = toint(start or 0)
  local last = count and math.min(#self.items, start + toint(count)) or #self.items
  local part = {}
  for i = start + 1, last do part[#part + 1] = self.items[i] end
  return table.concat(part, jtext(sep) or ' ')
end
JStringArray.addLines = function(self, text)
  text = tostring(jtext(text))
  for line in (text .. '\n'):gmatch('(.-)\r?\n') do self.items[#self.items + 1] = line end
  if text:sub(-1) == '\n' then self.items[#self.items] = nil end
end
JStringArray.contains = function(self, t) t = jtext(t) for _, x in ipairs(self.items) do if x == t then return true end end return false end
JStringArray.indexOf = function(self, t) t = jtext(t) for i, x in ipairs(self.items) do if x == t then return i - 1 end end return -1 end
JStringArray.remove = function(self, i) i = toint(i) if i >= 0 and i < #self.items then table.remove(self.items, i + 1) end end

-- Ctrlr's old wrapper for a Lua table handed to C++: the table, with getObject().
_G.CtrlrLuaObjectWrapper = function(t)
  local copy = {}
  if type(t) == 'table' then for k, v in pairs(t) do copy[k] = v end end
  return setmetatable(copy, { __index = { getObject = function(self) return self end } })
end

-- juce::File, as a panel sees the files around it: none exist here. Asking where things are and
-- whether they exist is harmless; reading or writing one is recorded, so a control whose bytes
-- would come from a file is not learned.
local File = class('File')
local function newFile(path) return setmetatable({ path = tostring(path or '') }, File) end
File.exists = function() return false end
File.existsAsFile = File.exists
File.isDirectory = function() return false end
File.hasWriteAccess = function() return false end
File.getFullPathName = function(self) return self.path end
File.getFileName = function(self) return (self.path:match('[^/\\]*$')) end
File.getFileNameWithoutExtension = function(self) return (self:getFileName():gsub('%.[^.]*$', '')) end
File.getFileExtension = function(self) return self.path:match('%.[^./\\]*$') or '' end
File.getParentDirectory = function(self) return newFile(self.path:match('^(.*)[/\\]') or '') end
File.getChildFile = function(self, name) return newFile(self.path .. '/' .. tostring(name)) end
File.getSiblingFile = function(self, name) return self:getParentDirectory():getChildFile(name) end
File.withFileExtension = function(self, ext) return newFile((self.path:gsub('%.[^./\\]*$', '')) .. (tostring(ext):sub(1, 1) == '.' and '' or '.') .. tostring(ext)) end
File.getSize = function() return 0 end
File.findChildFiles = function() return 0 end
File.getNumberOfChildFiles = function() return 0 end
File.isValid = function() return false end
for _, name in ipairs({ 'loadFileAsString', 'loadFileAsData', 'replaceWithText', 'replaceWithData', 'appendText', 'appendData',
                        'create', 'createDirectory', 'deleteFile', 'copyFileTo', 'moveFileTo', 'createInputStream', 'createOutputStream' }) do
  File[name] = function() rec('unknown', 'File:' .. name) return false end
end
File.loadFileAsString = function() rec('unknown', 'File:loadFileAsString') return '' end
File.getSpecialLocation = function() return newFile('/ctrlr') end
File.getCurrentWorkingDirectory = function() return newFile('/ctrlr') end
File.createFileWithoutCheckingPath = function(path) return newFile(path) end
setmetatable(File, { __call = function(_, path) return newFile(path) end })
_G.File = File

-- ---- Running -----------------------------------------------------------------------------------
-- Instructions per call: a runaway loop is an error, not a hang. A panel's load hooks build its
-- tables and get more than a control's run.
local LIMIT, LOAD_LIMIT = 20000000, 200000000
local sethook, traceback = __ctrlr_sethook, __ctrlr_traceback
-- An error says where in the PANEL'S code it happened: the first frame in one of its methods (whose
-- chunks are named after them), when the error itself is raised somewhere else.
local function located(e)
  local message = tostring(e)
  local tb = traceback(message, 2)
  for line in tb:gmatch('[^\n]+') do
    local where = line:match('^%s*([^%[%s][^:]*:%d+):')
    if where and not message:find(where, 1, true) then return message .. ' [in ' .. where .. ']' end
    if where then break end
  end
  return message
end
local function guardedWith(limit, fn, ...)
  local count = 0
  sethook(function() count = count + 1000 if count > limit then sethook() error('ran for too long', 2) end end, '', 1000)
  local ok, err = xpcall(fn, located, ...)
  sethook()
  return ok, err
end
local function guarded(fn, ...) return guardedWith(LIMIT, fn, ...) end

local function fresh(self)
  return { sends = {}, unknown = {}, ui = {}, reads = {}, writes = {}, tainted = false, self = self }
end

local function keys(t) local out = {} for k, n in pairs(t) do out[#out + 1] = k end table.sort(out) return out end
local function hex(bytes) local t = {} for i, v in ipairs(bytes) do t[i] = string.format('%02X', v) end return table.concat(t, ' ') end
local function clean(s) return (tostring(s):gsub('[\r\n\t|;]', ' ')) end

-- One method's code, as Ctrlr loads it: it runs once, defining its functions. '' or the error.
function __ctrlr_load(name, source)
  local chunk, err = load(source, '=' .. name, 't')
  if not chunk then return 'compile: ' .. clean(err) end
  local ok, e = guardedWith(LOAD_LIMIT, chunk)
  return ok and '' or ('run: ' .. clean(e))
end

-- A panel hook (luaPanelBeforeLoad, luaPanelLoaded) under the state Ctrlr calls it in.
function __ctrlr_hook(name, restore, bootstrap)
  local fn = _G[name]
  if type(fn) ~= 'function' then return 'missing' end
  state.restore, state.bootstrap = restore, bootstrap
  local ok, err = guardedWith(LOAD_LIMIT, fn, 0)
  state.restore, state.bootstrap = false, false
  return ok and '' or clean(err)
end

-- The panel's state as loaded: every control's value, the panel's variables and properties, and
-- the scalar globals the panel's Lua keeps. Each control is learned from it, so what one control's
-- run changes (a mute switch, the active edit buffer) does not silence the next.
-- A panel's own tables count as well (a table of flags, the last value each page sent): every plain
-- table its globals reach is copied, and put back in place, so what refers to it still does.
local LIBRARIES = { _G = true, package = true, string = true, table = true, math = true, io = true, os = true,
                    coroutine = true, debug = true, utf8 = true, bit = true, bit32 = true }
local TABLE_ENTRIES = 200000
local function isPlain(v) return type(v) == 'table' and getmetatable(v) == nil end
local function panelTable(k, v)
  return type(k) == 'string' and not LIBRARIES[k] and k:sub(1, 7):lower() ~= '__ctrlr' and isPlain(v)
end
local function copyTables()
  local copies, count = {}, 0
  local function walk(t)
    if copies[t] then return end
    local c = {}
    copies[t] = c
    for k, v in pairs(t) do
      count = count + 1
      c[k] = v
      if isPlain(v) then walk(v) end
    end
  end
  local roots = {}
  for k, v in pairs(_G) do if panelTable(k, v) then roots[k] = v walk(v) end end
  -- Too much to copy before every control: the tables are left as the runs leave them.
  if count > TABLE_ENTRIES then copies = {} end
  return { roots = roots, copies = copies }
end
local function putTablesBack(s)
  for k, v in pairs(_G) do if panelTable(k, v) and s.roots[k] == nil then _G[k] = nil end end
  for k, v in pairs(s.roots) do _G[k] = v end
  for t, c in pairs(s.copies) do
    for k in pairs(t) do if c[k] == nil then t[k] = nil end end
    for k, v in pairs(c) do t[k] = v end
  end
end

local function snapshot()
  local values, globals, plain = {}, {}, {}
  for i, m in ipairs(mods) do values[i] = m.value end
  for k, v in pairs(_G) do
    local t = type(v)
    if type(k) == 'string' and (t == 'number' or t == 'string' or t == 'boolean') and k:sub(1, 8) ~= '__ctrlr_' then globals[k] = v end
  end
  for k, v in pairs(panel.props) do plain[k] = v end
  local vars = {}
  for i, v in pairs(panel.globals) do vars[i] = v end
  return { values = values, globals = globals, props = plain, vars = vars, tables = copyTables() }
end
local function restore(s)
  for i, m in ipairs(mods) do m.value = s.values[i] end
  for k, v in pairs(_G) do
    local t = type(v)
    if type(k) == 'string' and (t == 'number' or t == 'string' or t == 'boolean') and s.globals[k] == nil and k:sub(1, 8) ~= '__ctrlr_' then _G[k] = nil end
  end
  for k, v in pairs(s.globals) do _G[k] = v end
  putTablesBack(s.tables)
  panel.props = {}
  for k, v in pairs(s.props) do panel.props[k] = v end
  panel.globals = {}
  for i, v in pairs(s.vars) do panel.globals[i] = v end
end
local LOADED = nil
function __ctrlr_loaded() LOADED = snapshot() end

-- Time passes: every running timer fires, shortest interval first, Ctrlr's way (callback(timerId)),
-- for up to that many rounds: a repeating timer ticks that many times. '' or the errors.
function __ctrlr_fire_timers(rounds)
  local errors = {}
  for _ = 1, toint(rounds or 3) do
    local due = {}
    for _, t in pairs(timers) do if t.running and t.fn then due[#due + 1] = t end end
    if #due == 0 then break end
    table.sort(due, function(a, b) return (a.ms or 0) < (b.ms or 0) end)
    for _, t in ipairs(due) do
      if t.running then
        local ok, err = guardedWith(LOAD_LIMIT, t.fn, t.id)
        if not ok then errors[#errors + 1] = 'timer ' .. t.id .. ': ' .. clean(err) t.running = false end
      end
    end
  end
  return table.concat(errors, '\n')
end

-- One control through a list of values: luaModulatorValueChange(mod, value, source) for each, as
-- Ctrlr calls it when a hand moves the control (changedByGUI), from the state as loaded. With a
-- channel, the panel's MIDI channel is that one for these runs. One line per value:
--   value | sent messages (hex, ',' between) | unknown | ui | reads | writes | tainted | error
-- Locals, so restoring the panel as it loaded before each control does not undo them.
local HOOK_DISABLED, HOOK_ERRORS = false, {}
function __ctrlr_hook_errors() return table.concat(HOOK_ERRORS, '\n') end

function __ctrlr_learn(modIndex, methodName, valuesText, keep, channel)
  local m = mods[toint(modIndex)]
  local fn = _G[methodName]
  local lines = {}
  if LOADED and not keep then restore(LOADED) end
  if channel and channel ~= 0 then
    panel.props.panelMidiOutputChannelDevice = tostring(channel)
    panel.props.panelMidiOutputChannelHost = tostring(channel)
  end
  local before = m.value
  -- Ctrlr calls the panel's luaPanelModulatorValueChanged(mod, value) when any control's value
  -- changes, before the control's own method (CtrlrPanel::modulatorValueChanged). Some panels send
  -- from there, by the control's name. Like any callback, it is disabled after its first error,
  -- for the rest of the session; the control's own method runs regardless.
  local hookName = panel.props.luaPanelModulatorValueChanged
  local hook = type(hookName) == 'string' and rawget(_G, hookName) or nil
  if type(hook) ~= 'function' or HOOK_DISABLED then hook = nil end
  for v in tostring(valuesText):gmatch('[^,]+') do
    local value = tonumber(v)
    REC = fresh(m)
    m.value = value
    local ok, err = true, nil
    if hook and not HOOK_DISABLED then
      local hookOk, hookErr = guarded(hook, m, value)
      if not hookOk then
        HOOK_DISABLED = true
        HOOK_ERRORS[#HOOK_ERRORS + 1] = 'luaPanelModulatorValueChanged (' .. hookName .. '), moving ' .. tostring(m.name) .. ': ' .. clean(hookErr) .. '; Ctrlr disables it after this'
      end
    end
    if type(fn) ~= 'function' then ok, err = false, 'the method ' .. methodName .. ' is not defined' else ok, err = guarded(fn, m, value, 4) end
    local sent = {}
    for i, s in ipairs(REC.sends) do sent[i] = hex(s) end
    lines[#lines + 1] = table.concat({
      v, table.concat(sent, ','), table.concat(keys(REC.unknown), ','), table.concat(keys(REC.ui), ','),
      table.concat(keys(REC.reads), ','), table.concat(keys(REC.writes), ','), REC.tainted and '1' or '', ok and '' or clean(err),
    }, '|')
    REC = nil
  end
  if not keep then
    m.value = before
    if LOADED then restore(LOADED) end
  end
  return table.concat(lines, '\n')
end

-- Move every control and every panel variable somewhere else, without running anything: a control
-- whose bytes are the same afterwards does not depend on them, whatever it read.
function __ctrlr_shift_all()
  for _, m in ipairs(mods) do
    if m.max ~= m.min then m.value = (m.value ~= m.max) and m.max or m.min end
  end
  for i, v in pairs(panel.globals) do panel.globals[i] = (v == 0) and 1 or 0 end
end

-- Move a control without recording, so a later run can see whether anything it sends depends on it.
function __ctrlr_nudge(modIndex, methodName, value)
  local m = mods[toint(modIndex)]
  local fn = _G[methodName]
  m.value = tonumber(value)
  if type(fn) == 'function' then guarded(fn, m, m.value, 4) end
end
`;

/** A JS value as a Lua literal: strings quoted safely, arrays as lists, objects as tables. */
export function luaLiteral(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'string') {
    return `"${value.replace(/[\\"\n\r\0]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\0': '\\0' }[c]))
      // Three digits always: "\1" followed by "23" would read as "\123".
      .replace(/[\u0001-\u001f\u007f]/g, (c) => `\\${String(c.charCodeAt(0)).padStart(3, '0')}`)}"`;
  }
  if (Array.isArray(value)) return `{${value.map(luaLiteral).join(',')}}`;
  return `{${Object.entries(value).map(([k, v]) => `[${luaLiteral(k)}]=${luaLiteral(v)}`).join(',')}}`;
}
