import { luaToBlocks, blocksToLua, sameMeaning, countRaw } from './roundtrip.mjs';

// Realistic CEditor panel scripts, written against the real ce.* API surface.
const CASES = {
  'onValueChanged — the commonest script there is': `
function onValueChanged(e)
  set("cutoff.value", e.value)
  log("cutoff is now " .. e.value)
end`,

  'conditional with elseif, and a nested call': `
function onValueChanged(e)
  if e.value > 100 then
    set("led.colour", "FFFF0000")
    sendCC(1, 74, 127)
  elseif e.value > 50 then
    set("led.colour", "FFFFAA00")
  else
    set("led.colour", "FF333333")
  end
end`,

  'a loop that fans a value across eight controls': `
function onPanelReady()
  local base = get("master.value")
  for i = 1, 8 do
    set("voice" .. i .. ".value", base * i / 8)
  end
end`,

  'inbound MIDI, namespaced calls, boolean logic': `
function onCcIn(m)
  if m.cc == 74 and m.channel == 1 then
    ce.device.write("filter.cutoff", m.value)
    ce.ui.flash("cutoffLed")
  end
end`,

  'while loop, unary not, early return': `
function drain(q)
  while not q.empty do
    local item = q.pop()
    if item == nil then
      return false
    end
    ce.midi.sendMidi(item.bytes)
  end
  return true
end`,

  'HOSTILE — coroutines, metatables, varargs, goto': `
local mt = setmetatable({}, { __index = function(t, k) return k * 2 end })
local co = coroutine.create(function(...)
  local args = {...}
  coroutine.yield(#args)
end)
function onPanelReady()
  set("a.value", mt[21])
  coroutine.resume(co, 1, 2, 3)
end`,
};

let pass = 0, fail = 0;
for (const [label, src] of Object.entries(CASES)) {
  const code = src.trim();
  let blocks, out, ok, err = null;
  try {
    blocks = luaToBlocks(code);
    out = blocksToLua(blocks);
    ok = sameMeaning(code, out);
  } catch (e) { ok = false; err = e.message; }
  const r = blocks ? countRaw(blocks) : null;
  const raws = r ? `${r.stmts} statement + ${r.exprs} expression` : "-";
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`      top-level blocks: ${blocks ? blocks.length : '-'}   raw-Lua fallbacks: ${raws}${err ? '   error: ' + err : ''}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);

// Show one regenerated script in full, to prove the output is real Lua a human would accept.
console.log('\n--- regenerated from blocks (case 2) ---');
console.log(blocksToLua(luaToBlocks(CASES['conditional with elseif, and a nested call'].trim())));
