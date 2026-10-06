// The HoSTage keyboard page's knob pages (tools/ctrl49/Hostage_MultiKnob.lua), run in Lua against
// a recording stand-in for the firmware: what each knob says (the plug-in's value, else its
// position), a knob with nothing on it, the symbols drawn for the host's ASCII marks, the bottom
// strip, and easing, which happens only once the keyboard has shown that it redraws when asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rackLabelPayload, rackStatePayload, performanceLabelPayload, performanceStatePayload, browseSlotViews, browseStatePayload,
  metersPayload, livePayload,
} from '../src/CE_Application/screen/ctrl49Payloads.js';

const source = fs.readFileSync(new URL('../../../tools/ctrl49/Hostage_MultiKnob.lua', import.meta.url), 'utf8');
const SYMBOL_ROW = 80;          // make_symbols.py: the symbols sit under the 80 px logo
const LOGO_DECODED = 0x0211, KNOBS_DECODED = 0x0201, FRAME = 64;

async function page() {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  let calls = [], dirty = 0;
  const texts = new Map();
  let next = 1;
  lua.global.set('draw_rect', (x, y, w, h, c) => { calls.push({ kind: 'rect', x, y, w, h, c }); });
  lua.global.set('draw_image', (t, id, x, y, sx, sy, sw, sh, c) => { calls.push({ kind: 'image', id, x, y, sx, sy, sw, sh, c }); });
  lua.global.set('decode_image', () => {});
  lua.global.set('text_data', {
    new: () => { const h = next++; texts.set(h, {}); return h; },
    set: (h, p) => { Object.assign(texts.get(h), p); },
  });
  lua.global.set('draw_text', (h, x, y, w, hh) => { calls.push({ kind: 'text', text: String(texts.get(h).text), size: texts.get(h).font_size, x, y }); });
  lua.global.set('set_hook_enabled', () => {});
  lua.global.set('lua_widget_make_dirty', () => { dirty++; });
  await lua.doString(source);
  await lua.doString(`
    function get_byte(a, i) local b = string.byte(a, i + 1); if b == nil then return 0 else return b end end
    function __invoke(name, t) local s = ""; for i = 1, #t do s = s .. string.char(t[i]) end; _G[name](s) end`);
  const invoke = lua.global.get('__invoke');
  invoke('init', []);
  invoke('set_mode', [1]);
  return {
    call: (name, bytes) => invoke(name, bytes),
    draw() { calls = []; invoke('draw', []); return calls; },
    asked: () => dirty,
    close: () => lua.global.close(),
  };
}

const said = (calls) => calls.filter((c) => c.kind === 'text').map((c) => c.text);
const frameOf = (calls, slot) => {        // the knob filmstrip's frame drawn for a slot, 0-based
  const knobs = calls.filter((c) => c.kind === 'image' && c.id === KNOBS_DECODED);
  return knobs[slot].sy / FRAME;
};
const symbols = (calls) => calls.filter((c) => c.kind === 'image' && c.id === LOGO_DECODED && c.sy >= SYMBOL_ROW);

const slot = (label, position, valueText, extra = {}) => ({ label, position, valueText, assigned: true, resolved: true, ...extra });
const SLOTS = [slot('Cutoff', 88, '2.40 kHz'), slot('Resonance', 34, '27 %'), slot('Type', 0, '', { resolved: false }),
  { label: '', position: 0, assigned: false }, slot('Mix', 100, '')];

test('a control page shows each value as the plug-in writes it, and the page it is', async () => {
  const p = await page();
  p.call('set_labels', rackLabelPayload('Diva Filter', SLOTS));
  p.call('set_values', rackStatePayload(0, SLOTS, { number: 2, count: 5 }));
  const texts = said(p.draw());
  assert.ok(texts.includes('2.40 kHz') && texts.includes('27 %'), 'the plug-in\'s own values');
  assert.ok(texts.includes('100'), 'a slot the plug-in gave no text shows its position');
  assert.ok(texts.includes('Cutoff   2.40 kHz') && texts.includes('PAGE 2 / 5'), 'the bottom strip: the knob, and the page');
  assert.ok(!texts.includes('!Type') && texts.includes('Type'), 'the "!" mark is not written out');
  assert.equal(symbols(p.draw()).length, 1, 'it is drawn as one warning symbol');
  p.close();
});

test('a knob with nothing on it is a faint ring, with no number', async () => {
  const p = await page();
  p.call('set_labels', rackLabelPayload('Page', SLOTS));
  p.call('set_values', rackStatePayload(0, SLOTS, { number: 1, count: 1 }));
  const calls = p.draw();
  const texts = said(calls);
  assert.equal(texts.filter((t) => t === '0').length, 1, 'only the unconnected Type shows 0; the empty slots 4, 6-8 show nothing');
  const empty = calls.filter((c) => c.kind === 'image' && c.id === KNOBS_DECODED && c.c === 0xFF1A202A);
  assert.equal(empty.length, 4, 'four empty rings, in the faint colour');
  p.close();
});

test('without the extension, the page reads the plain nine bytes as before', async () => {
  const p = await page();
  p.call('set_labels', rackLabelPayload('Page', SLOTS));
  p.call('set_values', rackStatePayload(0, SLOTS));
  const texts = said(p.draw());
  assert.ok(texts.includes('88') && !texts.includes('2.40 kHz'), 'positions, as an older host sends');
  assert.ok(!texts.some((t) => t.startsWith('PAGE ')), 'and no bottom strip');
  p.close();
});

test('the browser draws no numbers on its rings, the cursor full, and the current sound in the strip', async () => {
  const p = await page();
  const rows = [{ name: 'Wool Pad' }, { name: 'Glass Choir' }, { name: 'Lost Lead', available: false }];
  const views = browseSlotViews(rows, 1, 12);
  p.call('set_labels', rackLabelPayload('SOUNDS - 2/40', views));
  p.call('set_values', browseStatePayload(1, views, 'Glass Choir - DIVA'));
  for (let i = 0; i < 6; i++) p.draw();      // let any easing finish: the browser must not ease
  const calls = p.draw();
  const texts = said(calls);
  assert.ok(!texts.includes('127') && !texts.includes('0'), 'no 127 under the cursor, no 0 under the others');
  assert.ok(texts.includes('Glass Choir - DIVA'), 'the strip: the sound under the cursor');
  assert.ok(texts.includes('Lost Lead') && !texts.includes('!Lost Lead'), 'one that cannot load loses its "!"');
  assert.equal(symbols(calls).length, 1, 'and shows the warning symbol instead');
  assert.equal(frameOf(calls, 1), 127, 'the cursor row is a full ring');
  // scrolling moves the full ring at once: the cursor is where you scrolled to, not on its way
  p.call('set_values', browseStatePayload(2, browseSlotViews(rows, 2, 12), 'Lost Lead - DIVA'));
  const next = p.draw();
  assert.equal(frameOf(next, 2), 127, 'the new cursor row is full on the first draw');
  assert.equal(frameOf(next, 1), 0, 'and the old one empty');
  assert.ok(!said(next).some((t) => t.startsWith('PAGE ')), 'the browser has no page number');
  p.close();
});

test('the performance page draws play and the clip states as symbols', async () => {
  const p = await page();
  const transport = { playing: true, bar: 3, beat: 2, tempo: 122, beatsPerBar: 4 };
  const clips = [{ name: 'Bass A', active: true, phase: 0.4 }, { name: 'Bass B', pending: true }, { name: 'Keys' }];
  p.call('set_labels', performanceLabelPayload(transport, clips));
  p.call('set_values', performanceStatePayload(0, clips, transport));
  const calls = p.draw();
  const texts = said(calls);
  assert.ok(texts.includes('3.2 122') && !texts.some((t) => t.startsWith('>') || t.startsWith('*')), 'no ASCII marks left');
  assert.ok(texts.includes('Bass A') && texts.includes('Bass B'), 'the clip names without them');
  const drawn = symbols(calls).map((c) => c.sx);
  assert.deepEqual(drawn.sort((a, b) => a - b), [0, 28, 42], 'play (x 0), a running clip (28), a waiting one (42)');
  p.close();
});

test('rings ease only once the keyboard has shown it redraws when asked, and always arrive', async () => {
  const p = await page();
  const at = (v) => [slot('A', v, '')];
  p.call('set_labels', rackLabelPayload('Page', at(0)));
  p.call('set_values', rackStatePayload(0, at(0), { number: 1, count: 1 }));
  p.draw();
  assert.equal(p.asked(), 1, 'the first knob draw asks for a redraw, to find out');
  p.call('set_values', rackStatePayload(0, at(120), { number: 1, count: 1 }));
  assert.equal(frameOf(p.draw(), 0), 120, 'before any proof, a jump is drawn at once');
  assert.equal(p.asked(), 2, 'and it asks again: the host spoke first, which proves nothing');

  // The redraw it asked for arrives with nothing new: now the page knows asking works.
  p.draw();
  p.call('set_values', rackStatePayload(0, at(0), { number: 1, count: 1 }));
  const frames = [frameOf(p.draw(), 0)];
  for (let i = 0; i < 10 && frames.at(-1) !== 0; i++) frames.push(frameOf(p.draw(), 0));
  assert.ok(frames[0] > 0 && frames[0] < 120, `a jump now sweeps (${frames.join(', ')})`);
  assert.equal(frames.at(-1), 0, 'and lands on the value');
  assert.ok(frames.length <= 6, 'within a few redraws');

  p.call('set_values', rackStatePayload(0, at(5), { number: 1, count: 1 }));
  assert.equal(frameOf(p.draw(), 0), 5, 'turning a knob a little is immediate');
  p.close();
});

test('METERS draws each part\'s level and fader, holds the peak, lights a clip and keeps the master\'s history', async () => {
  const p = await page();
  const view = (left, master = 0.5) => metersPayload({
    parts: [{ name: 'Bass', left, right: left / 2, volume: 1 }, { name: 'Keys', left: 0.1, right: 0.1, volume: 0.5, muted: true }],
    touched: 0, masterLeft: master, masterRight: master, masterVolume: 1,
  });
  p.call('set_meters', view(1.2));        // over 0 dB: a clip
  let calls = p.draw();
  let texts = said(calls);
  assert.ok(texts[0] === 'METERS' && texts.some((t) => t.startsWith('Bass')), 'the title, and the loudest part');
  assert.ok(texts.includes('MASTER') && texts.includes('MUTED'), 'the master strip, and a muted part says so');
  assert.ok(texts.includes('0.0'), 'the fader at unity reads 0.0');
  const clip = (cs) => cs.filter((c) => c.kind === 'rect' && c.c === 0xFFFF4D6A);
  assert.ok(clip(calls).length >= 2, 'a clip lamp and a red bar');
  // quieter: the peak holds, the clip lamp stays lit for a while
  p.call('set_meters', view(0.1));
  calls = p.draw();
  texts = said(calls);
  assert.ok(texts.includes('+1.5'), 'the held peak (+1.6 dB, in half decibels) is still written under the strip');
  assert.ok(clip(calls).length >= 1, 'and the clip lamp is still lit');
  // a redraw without news does not age the hold
  for (let i = 0; i < 20; i++) p.draw();
  assert.ok(said(p.draw()).includes('+1.5'), 'redraws alone do not move the hold');
  for (let i = 0; i < 20; i++) p.call('set_meters', view(0.1));
  texts = said(p.draw());
  assert.ok(!texts.includes('+1.5') && texts.includes('-20.0'), 'twenty frames later it has fallen to the level');
  const history = p.draw().filter((c) => c.kind === 'rect' && c.w === 2);
  assert.ok(history.length >= 20, 'the master history has a column a frame');
  p.close();
});

test('LIVE draws the lane with its playhead, the zones, the held keys and the arp\'s notes', async () => {
  const p = await page();
  const steps = Array.from({ length: 16 }, (_, i) => ({ velocity: i % 4 === 3 ? 0 : 100, octave: i === 2 ? 1 : 0,
                                                       ratchet: i === 4 ? 3 : 1, chance: i === 5 ? 60 : 100 }));
  p.call('set_live', livePayload({
    part: 'Pluck', arpOn: true, mode: 0, stepsPerBeat: 4, gate: 50, lane: true, steps, cursor: 2, playing: 4, tempo: 112,
    zones: [{ name: 'Bass', keyLow: 36, keyHigh: 54 }, { name: 'Pluck', keyLow: 55, keyHigh: 84 }],
    focused: 1, held: [40, 60, 64], arpNotes: [64],
  }));
  const calls = p.draw();
  const texts = said(calls);
  assert.ok(texts[0] === 'LIVE' && texts.some((t) => t.includes('ARP UP 1/16') && t.includes('112 BPM')), 'the title says the arp');
  assert.ok(texts.includes('+1') && texts.includes('60%'), 'an octave and a chance that are not the plain ones');
  assert.ok(texts.includes('3 / 16') && texts.includes('+1') && texts.includes('UP') && texts.includes('50%'),
    'the cells: the step picked, its octave, the mode and the gate');
  assert.ok(texts.includes('PADS TURN STEPS ON AND OFF'), 'with a lane drawn, what the pads do');
  const ORANGE = 0xFFFF9408, TEAL = 0xFF2DD4BF;
  const rects = calls.filter((c) => c.kind === 'rect');
  assert.ok(rects.some((c) => c.c === TEAL && c.h === 48), 'held keys in the colour of their part, the arp\'s in the part shown');
  assert.ok(rects.some((c) => c.c === ORANGE && c.h === 48), 'the bass key held lights in the bass part\'s colour');
  const dots = rects.filter((c) => c.w === 3 && c.h === 3);
  assert.equal(dots.length, 12 + 2, 'a ratchet dot per hit on the twelve steps that play, three on step five; none on a rest');
  p.call('set_live', livePayload({ part: 'Pluck', steps, arpOn: false, zones: [] }));
  assert.ok(said(p.draw()).some((t) => t.includes('ARP OFF')), 'with the arp off the title says so');
  p.close();
});
