// learn.js — what a Ctrlr control's Lua sends, learned by running it, and made a parameter.
//
// On many panels a control has no MIDI of its own: its luaModulatorValueChange method builds the
// message and sends it. The method is code, but what the importer needs from it is not the code —
// it is the BYTES, for each value the control can take. So each such control is run, in CEditor's
// own Lua against a stand-in for Ctrlr (ctrlrLua.js), through every value, and what it sent is
// recorded. Where those bytes follow from the control's value alone, they are described the way a
// Ctrlr panel describes its own MIDI — a SysEx formula, a CC, a Multi list — and become a
// device-profile parameter through the same harvest as any other modulator (harvest.js), held to
// the recorded bytes for every value.
//
// Where they do not — the method failed, used something the stand-in does not reproduce, read
// another control or a global variable, sent different shapes for different values, or sends
// differently once another control has moved — the control is not learned, and the report says
// which of those it was. Nothing here guesses.
//
// The Lua engine is passed in (`createEngine`): wasmoon's LuaFactory, which the editor loads
// with its own wasm URL and node loads from the package.

import { attr, attrNumber } from './xml.js';
import { addParameters, buildParameter, componentValueList, NO_METHOD } from './harvest.js';
import { CTRLR_LUA_PRELUDE, CTRLR_LUA_STANDIN, luaLiteral } from './ctrlrLua.js';
import { CTRLR_DEFAULTS } from './ctrlrDefaults.js';
import { checksumBytes } from '../utils/checksums.js';
import { localCompileParameter } from '../stores/deviceProfileLocalEngine.js';

const child = (node, ...names) => (node?.children ?? []).find((c) => names.includes(c.name)) ?? null;
const MAX_RUN_VALUES = 4096;

function modulatorsOf(root) {
  const out = [];
  const collect = (node) => {
    for (const c of node.children ?? []) {
      if (c.name === 'modulator') out.push(c);
      collect(c);
    }
  };
  collect(root);
  return out;
}

/** The values a control takes, as Ctrlr passes them to luaModulatorValueChange. */
export function controlValues(node) {
  const component = child(node, 'component', 'uiComponent');
  const list = componentValueList(component);
  if (list.length) return list.map((_, i) => i);
  const min = attrNumber(node, 'modulatorMin', 0);
  const max = attrNumber(node, 'modulatorMax', 127);
  if (!(max >= min) || !Number.isInteger(min) || !Number.isInteger(max)) return [];
  const step = Math.abs(attrNumber(component, 'uiSliderInterval', 1)) || 1;
  if (!Number.isInteger(step)) return [];
  const out = [];
  for (let v = min; v <= max; v += step) out.push(v);
  return out;
}

function sendsOwnMidi(node) {
  const midi = child(node, 'midi');
  if (!midi) return false;
  const type = String(attr(midi, 'midiMessageType', '')).trim();
  if (['', '9', '9.0', 'None'].includes(type)) return false;
  if (['5', '5.0', 'SysEx'].includes(type)) return Boolean(attr(midi, 'midiMessageSysExFormula', '').trim());
  if (['6', '6.0', 'Multi'].includes(type)) return Boolean(attr(midi, 'midiMessageMultiList', '').trim());
  return true;
}

/** The panel as the stand-in sees it: `__CTRLR_PANEL`, as Lua source. */
export function panelLiteral(read, { channel } = {}) {
  const modulators = modulatorsOf(read.root).map((node, index) => {
    const component = child(node, 'component', 'uiComponent');
    const midi = child(node, 'midi');
    const list = componentValueList(component);
    const values = controlValues(node);
    const rect = String(attr(component, 'componentRectangle', '')).trim().split(/[\s,]+/).map(Number);
    const value = attrNumber(node, 'modulatorValue', values[0] ?? 0);
    return {
      name: attr(node, 'name') || attr(node, 'modulatorName') || `unnamed ${index + 1}`,
      value: Number.isFinite(value) ? value : 0,
      min: values.length ? values[0] : attrNumber(node, 'modulatorMin', 0),
      max: values.length ? values.at(-1) : attrNumber(node, 'modulatorMax', 127),
      ...(list.length ? { list: list.map((entry) => entry.value) } : {}),
      props: { ...(node.attributes ?? {}) },
      compProps: { ...(component?.attributes ?? {}) },
      midiProps: { ...(midi?.attributes ?? {}) },
      sends: sendsOwnMidi(node),
      lua: !NO_METHOD.has(attr(node, 'luaModulatorValueChange', '').trim()),
      vstIndex: attrNumber(node, 'vstIndex', -1),
      ...(rect.length === 4 && rect.every(Number.isFinite) ? { width: rect[2], height: rect[3] } : {}),
    };
  });
  const props = { ...(read.root.attributes ?? {}) };
  if (channel) {
    props.panelMidiOutputChannelDevice = String(channel);
    props.panelMidiOutputChannelHost = String(channel);
  }
  return `__CTRLR_DEFAULTS = ${luaLiteral(CTRLR_DEFAULTS)}\n__CTRLR_PANEL = ${luaLiteral({ props, globals: read.panel.globals ?? [], modulators })}`;
}

/**
 * A method's source as Lua 5.4 compiles what Lua 5.1 and LuaJIT accepted: an escape that 5.4
 * refuses inside a quoted string ("\I", "\%") was the character itself in 5.1, so the backslash
 * goes. Long strings and comments are left as they are.
 */
export function lua51Source(source) {
  const text = String(source ?? '');
  const valid = new Set(['a', 'b', 'f', 'n', 'r', 't', 'v', '\\', '"', "'", '\n', '\r', 'x', 'z', 'u', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  let out = '';
  let i = 0;
  const longOpen = (at) => {
    const m = /^\[(=*)\[/.exec(text.slice(at, at + 64));
    return m ? m[1].length : -1;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      const level = longOpen(i + 2);
      const end = level >= 0 ? text.indexOf(`]${'='.repeat(level)}]`, i + 4 + level) : text.indexOf('\n', i);
      const stop = end < 0 ? text.length : (level >= 0 ? end + level + 2 : end);
      out += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '[') {
      const level = longOpen(i);
      if (level >= 0) {
        const end = text.indexOf(`]${'='.repeat(level)}]`, i + 2 + level);
        const stop = end < 0 ? text.length : end + level + 2;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      out += c;
      i += 1;
      while (i < text.length && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\' && i + 1 < text.length) {
          const next = text[i + 1];
          out += valid.has(next) ? `\\${next}` : next;
          i += 2;
          continue;
        }
        out += text[i];
        i += 1;
      }
      if (i < text.length) { out += text[i]; i += 1; }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function parseRun(text) {
  return String(text ?? '').split('\n').filter(Boolean).map((line) => {
    const [value, sent, unknown, ui, reads, writes, tainted, error] = line.split('|');
    const list = (s) => (s ? s.split(',') : []);
    return {
      value: Number(value),
      messages: list(sent).map((hex) => hex.split(' ').filter(Boolean).map((h) => Number.parseInt(h, 16))),
      unknown: list(unknown),
      ui: list(ui),
      reads: list(reads),
      writes: list(writes),
      tainted: tainted === '1',
      error: error ?? '',
    };
  });
}

/** A few values to probe a control at: its ends and its middle. */
const probeOf = (values) => [...new Set([values[0], values[Math.floor(values.length / 2)], values.at(-1)])].filter((v) => v !== undefined);

/** Spread values for a range too wide to run whole: both ends, the start and end runs, a spread. */
function sampled(values) {
  if (values.length <= MAX_RUN_VALUES) return values;
  const picked = new Set([...values.slice(0, 200), ...values.slice(-200)]);
  for (let i = 0; i < 600; i += 1) picked.add(values[Math.floor((i * values.length) / 600)]);
  return [...picked].sort((a, b) => a - b);
}

/**
 * Run a panel's Lua: load every method, call the load hooks, then run each control that has a
 * luaModulatorValueChange through its values. `{ ok, load: {errors}, controls: [{ index, name,
 * method, values, runs, stateDependent }] }`.
 */
export async function runPanelLua(read, { createEngine, channel, nudge = true, methodSource = null } = {}) {
  if (!read?.ok) return { ok: false, error: 'The panel could not be read.' };
  const nodes = modulatorsOf(read.root);
  const targets = nodes.map((node, index) => ({ node, index, method: attr(node, 'luaModulatorValueChange', '').trim() }))
    .filter((t) => !NO_METHOD.has(t.method));
  if (!targets.length) return { ok: true, load: { errors: [], notRead: [] }, controls: [] };

  const lua = await createEngine();
  try {
    lua.doStringSync(CTRLR_LUA_PRELUDE);
    lua.doStringSync(panelLiteral(read, { channel }));
    lua.doStringSync(CTRLR_LUA_STANDIN);
    const call = (name, ...args) => lua.global.get(name)(...args);

    // A method can keep its code in a file beside the panel (luaMethodSource 1, luaMethodSourcePath):
    // the caller says where to find it, or it is counted as not read.
    const loadErrors = [];
    const notRead = [];
    for (const method of read.luaMethods) {
      let source = String(method.source ?? '');
      if (!source.trim() && method.file) {
        source = (methodSource ? methodSource(method) : null) ?? '';
        if (!source) { notRead.push(method.name); continue; }
      }
      const error = call('__ctrlr_load', method.name || '(unnamed)', lua51Source(source));
      if (error) loadErrors.push(`${method.name}: ${error}`);
    }
    const hook = (property, restore, bootstrap) => {
      const name = String(attr(read.root, property, '')).trim();
      if (NO_METHOD.has(name)) return;
      const error = call('__ctrlr_hook', name, restore, bootstrap);
      if (error && error !== 'missing') loadErrors.push(`${property} (${name}): ${error}`);
    };
    hook('luaPanelBeforeLoad', true, false);
    hook('luaPanelLoaded', false, true);
    // The panel's first seconds: the timers it started while loading fire.
    const timerErrors = call('__ctrlr_fire_timers', 5);
    if (timerErrors) loadErrors.push(...String(timerErrors).split('\n'));

    call('__ctrlr_loaded');

    // In the editor this runs on the page's thread: give it back every few tens of milliseconds.
    let last = Date.now();
    const breathe = async () => {
      if (Date.now() - last < 50) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      last = Date.now();
    };
    const controls = [];
    for (const t of targets) {
      const values = sampled(controlValues(t.node));
      const runs = values.length ? parseRun(call('__ctrlr_learn', t.index + 1, t.method, values.join(','), false, 0)) : [];
      controls.push({
        index: t.index, node: t.node, name: attr(t.node, 'name') || `unnamed ${t.index + 1}`, method: t.method,
        values, sampled: values.length < controlValues(t.node).length, runs, channelRuns: [], stateDependent: false,
      });
      await breathe();
    }

    // Which bytes carry the MIDI channel: the same values again, with the panel on another channel.
    const base = Math.min(16, Math.max(1, read.panel.outputChannel ?? 1));
    const other = (base % 16) + 1;
    for (const c of controls) {
      if (!c.runs.some((r) => r.messages.length)) continue;
      c.channels = [base, other];
      c.channelRuns = parseRun(call('__ctrlr_learn', c.index + 1, c.method, probeOf(c.values).join(','), false, other));
    }

    // Does what a control sends depend on where the OTHER controls are? Move every other
    // Lua-driven control somewhere else, then run each control again at a few values, from there.
    if (nudge && controls.length > 1) {
      for (const c of controls) {
        const all = controlValues(c.node);
        if (all.length > 1) call('__ctrlr_nudge', c.index + 1, c.method, all.at(-1) !== attrNumber(c.node, 'modulatorValue', all[0]) ? all.at(-1) : all[0]);
      }
      call('__ctrlr_shift_all');
      for (const c of controls) {
        if (!c.runs.length) continue;
        const again = parseRun(call('__ctrlr_learn', c.index + 1, c.method, probeOf(c.values).join(','), true, 0));
        for (const run of again) {
          const first = c.runs.find((r) => r.value === run.value);
          const same = first && JSON.stringify(first.messages) === JSON.stringify(run.messages);
          if (!same) { c.stateDependent = true; break; }
        }
      }
    }
    return { ok: true, load: { errors: loadErrors, notRead }, controls };
  } finally {
    lua.global.close();
  }
}

// --- From what was sent to a parameter -----------------------------------------------------------

const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, '0');

/** One send can hold several MIDI messages (Ctrlr builds them from raw bytes): split by status. */
export function splitMessages(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const status = bytes[i];
    if (status === 0xf0) {
      const end = bytes.indexOf(0xf7, i);
      const stop = end < 0 ? bytes.length : end + 1;
      out.push(bytes.slice(i, stop));
      i = stop;
    } else if (status >= 0x80 && status < 0xf0) {
      const length = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 2 : 3;
      out.push(bytes.slice(i, i + length));
      i += length;
    } else {
      out.push(bytes.slice(i, i + 1));
      i += 1;
    }
  }
  return out;
}

/**
 * Why a control's runs cannot be learned, or '' when they can. `conditional` lists what the bytes
 * were seen to depend on beyond the control's own value (other controls, the panel's variables):
 * such a control is learned as the panel loads, and the notes say what it read.
 */
export function judgeRuns(c) {
  const runs = c.runs;
  if (!runs.length) return { reason: 'it has no values to run' };
  const failed = runs.find((r) => r.error);
  if (failed) return { reason: `its Lua stopped with an error: ${failed.error}` };
  const unknown = [...new Set(runs.flatMap((r) => r.unknown))];
  if (unknown.length) return { reason: `its Lua uses ${unknown.slice(0, 3).join(', ')}, which the import does not reproduce` };
  if (runs.some((r) => r.tainted)) return { reason: 'its Lua builds the message from something the import does not reproduce' };
  const cascades = [...new Set(runs.flatMap((r) => r.writes).filter((w) => w.startsWith('sends ') || w.startsWith('lua ')))];
  if (cascades.length) return { reason: `its Lua moves ${cascades.slice(0, 3).map((w) => `"${w.replace(/^(sends|lua) /, '')}"`).join(', ')}, which sends MIDI of its own` };
  if (runs.every((r) => !r.messages.length)) return { silent: true, reason: 'its Lua sends nothing' };
  if (runs.some((r) => !r.messages.length)) return { reason: 'its Lua sends for some values and not for others' };
  // What else it read is only a dependence if moving those changed what it sends.
  const reads = [...new Set(runs.flatMap((r) => r.reads))];
  return { reason: '', reads, conditional: c.stateDependent ? { reads } : null };
}

/** Which positions of a message carry the channel: compare the runs on the two channels. */
function channelPositions(c, index) {
  const [chA, chB] = c.channels ?? [1, 2];
  const found = new Map();
  for (const run of c.channelRuns) {
    const main = c.runs.find((r) => r.value === run.value);
    if (!main) continue;
    const a = splitMessages(main.messages.flat())[index];
    const b = splitMessages(run.messages.flat())[index];
    if (!a || !b || a.length !== b.length) return null;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      if (a[i] === chA - 1 && b[i] === chB - 1) found.set(i, 'yy');
      else if ((a[i] & 0x0f) === chA - 1 && (b[i] & 0x0f) === chB - 1 && (a[i] >> 4) === (b[i] >> 4)) found.set(i, `${(a[i] >> 4).toString(16)}y`);
      else return null;
    }
  }
  return found;
}

const VALUE_SPLITS = [
  { codes: ['xx'], wire: ([a]) => a },
  { codes: ['MS', 'LS'], wire: ([a, b]) => a * 128 + b },
  { codes: ['ms', 'ls'], wire: ([a, b]) => a * 16 + b, nibbles: true },
  { codes: ['LS', 'MS'], wire: ([a, b]) => b * 128 + a },
  { codes: ['r2', 'r3', 'r4'], wire: ([a, b, c]) => a * 256 + b * 16 + c, nibbles: true },
  { codes: ['r1', 'r2', 'r3', 'r4'], wire: ([a, b, c, d]) => a * 4096 + b * 256 + c * 16 + d, nibbles: true },
];
const CHECKSUMS = [
  { type: 'roland-7bit', code: 'z' }, { type: 'ones-complement-7bit', code: 'O' },
  { type: 'sum-7bit', code: 'w' }, { type: 'xor-7bit', code: 'X' },
];
const isLinear = (domain, wires) => {
  if (domain.length < 2) return true;
  const scale = (wires[1] - wires[0]) / (domain[1] - domain[0]);
  return domain.every((v, i) => wires[i] === wires[0] + scale * (v - domain[0]));
};

/** One SysEx message, the same length for every value, as a Ctrlr formula and the wire of each value. */
function fitSysex(c, perValue, channels, checksumBytes) {
  const length = perValue[0].length;
  const varying = [];
  for (let i = 0; i < length; i += 1) if (perValue.some((m) => m[i] !== perValue[0][i])) varying.push(i);
  if (varying.some((i) => channels.has(i))) return { reason: 'the channel byte also moves with the value' };

  // The checksum: a varying byte that is a checksum of the bytes before it, for every value.
  let checksum = null;
  for (const p of [...varying].reverse()) {
    for (const kind of CHECKSUMS) {
      for (let span = 1; span < p; span += 1) {
        const ok = perValue.every((m) => {
          const expected = checksumBytes(kind.type, m.slice(p - span, p));
          return expected && expected.length === 1 && expected[0] === m[p];
        });
        const covers = varying.filter((i) => i !== p).every((i) => i >= p - span && i < p);
        if (ok && covers) { checksum = { at: p, span, ...kind }; break; }
      }
      if (checksum) break;
    }
    if (checksum) break;
  }
  const valueAt = varying.filter((i) => i !== checksum?.at);
  if (valueAt.length && valueAt.at(-1) - valueAt[0] !== valueAt.length - 1) return { reason: 'the value is split around other bytes' };

  let split = null;
  let wires = [];
  if (valueAt.length) {
    const candidates = VALUE_SPLITS.filter((s) => s.codes.length === valueAt.length)
      .filter((s) => !s.nibbles || perValue.every((m) => valueAt.every((i) => m[i] < 16)));
    if (!candidates.length) return { reason: `the value is written in ${valueAt.length} bytes, which a device profile cannot write` };
    const fits = candidates.map((s) => ({ s, wires: perValue.map((m) => s.wire(valueAt.map((i) => m[i]))) }));
    const linear = fits.find((f) => isLinear(c.values, f.wires));
    ({ s: split, wires } = linear ?? fits[0]);
  }
  const tokens = [];
  for (let i = 0; i < length; i += 1) {
    if (checksum && i === checksum.at) tokens.push(`${checksum.code}${checksum.span}`);
    else if (valueAt.includes(i)) tokens.push(split.codes[i - valueAt[0]]);
    else if (channels.has(i)) tokens.push(channels.get(i));
    else tokens.push(hex2(perValue[0][i]));
  }
  return { type: 'SysEx', formula: tokens.join(' '), wires: valueAt.length ? wires : perValue.map(() => 0), fixedChannel: channels.size === 0 };
}

/** CCs on one status byte, one or several: a CC, or a Multi list Ctrlr would write for them. */
function fitControllers(c, perValueMessages, channels) {
  const count = perValueMessages[0].length;
  const numbers = perValueMessages[0].map((m) => m[1]);
  if (perValueMessages.some((msgs) => msgs.some((m, i) => m[1] !== numbers[i]))) return { reason: 'the controller number moves with the value' };
  const moving = [];
  for (let i = 0; i < count; i += 1) if (perValueMessages.some((msgs) => msgs[i][2] !== perValueMessages[0][i][2])) moving.push(i);
  const channel = (perValueMessages[0][0][0] & 0x0f) + 1;
  const fixedChannel = !channels.has(0);
  if (count === 1) {
    return { type: 'CC', number: numbers[0], wires: perValueMessages.map((msgs) => msgs[0][2]), fixedChannel, channelNumber: channel };
  }
  if (moving.length > 2) return { reason: 'the value moves in more than two controllers' };
  let ops = moving.length === 1 ? ['ByteValue'] : ['MSB7bitValue', 'LSB7bitValue'];
  let wires = moving.length === 0 ? perValueMessages.map(() => 0)
    : moving.length === 1 ? perValueMessages.map((msgs) => msgs[moving[0]][2])
      : perValueMessages.map((msgs) => msgs[moving[0]][2] * 128 + msgs[moving[1]][2]);
  if (moving.length === 2 && !isLinear(c.values, wires)) {
    const swapped = perValueMessages.map((msgs) => msgs[moving[1]][2] * 128 + msgs[moving[0]][2]);
    if (isLinear(c.values, swapped)) { ops = ['LSB7bitValue', 'MSB7bitValue']; wires = swapped; }
  }
  const parts = perValueMessages[0].map((m, i) => {
    const at = moving.indexOf(i);
    return at < 0 ? `CC,Default,Default,${m[1]},${m[2]}` : `CC,Default,${ops[at]},${m[1]},-1`;
  });
  return { type: 'Multi', multiList: parts.join(':'), number: numbers[0], wires, fixedChannel, channelNumber: channel };
}

/** What a control was seen to send, as a message description buildParameter takes; or a reason. */
export function fitObserved(c, { checksumBytes }) {
  const perValue = c.runs.map((r) => splitMessages(r.messages.flat()));
  const shape = (msgs) => msgs.map((m) => `${m[0] === 0xf0 ? 'F0' : (m[0] & 0xf0).toString(16)}:${m.length}`).join(' ');
  const first = shape(perValue[0]);
  if (perValue.some((msgs) => shape(msgs) !== first)) return { reason: 'it sends messages of different shapes for different values' };
  const kinds = new Set(perValue[0].map((m) => (m[0] === 0xf0 ? 'sysex' : (m[0] & 0xf0) === 0xb0 ? 'cc' : 'other')));
  if (kinds.has('other')) return { reason: 'it sends a message that is not a controller or SysEx' };
  if (kinds.has('sysex')) {
    if (perValue[0].length > 1) return { reason: 'it sends several messages, SysEx among them' };
    const channels = channelPositions(c, 0);
    if (!channels) return { reason: 'the channel is written in a way a device profile cannot write' };
    if (perValue.some((msgs) => msgs[0].at(-1) !== 0xf7)) return { reason: 'the SysEx message does not end with F7' };
    return fitSysex(c, perValue.map((msgs) => msgs[0]), channels, checksumBytes);
  }
  const status = perValue[0][0][0];
  if (perValue.some((msgs) => msgs.some((m) => m[0] !== status))) return { reason: 'its controllers go out on different channels' };
  const channels = channelPositions(c, 0);
  if (!channels) return { reason: 'the channel is written in a way a device profile cannot write' };
  return fitControllers(c, perValue, channels);
}

// --- Learning, end to end ------------------------------------------------------------------------

/** The bytes the device-profile engine sends for one value of one built parameter. */
function compiledBytes(built, read, value) {
  const profile = {
    schemaVersion: 1,
    id: 'ctrlr.learn.check',
    variables: { deviceId: 16, channel: read.panel.outputChannel ?? 1, ...built.variables },
    parameters: [{ ...built.parameter, messageRecipe: 'learned' }],
    messageRecipes: [{ id: 'learned', ...built.recipe }],
  };
  const compiled = localCompileParameter(profile, { parameterId: built.parameter.id, value });
  return compiled.ok ? compiled.transaction.messages.flatMap((m) => m.bytes) : null;
}

/**
 * Learn what the panel's Lua sends, and add every control it can describe to the harvest
 * (harvest.js `addParameters`), each checked: the profile has to send exactly what the Lua sent,
 * for every value that was run. Returns `{ ok, learned: [{ name, method, parameterId, reads? }],
 * notLearned: [{ name, method, reason }], silent, load }`; the harvest is changed in place.
 */
export async function learnFromLua(read, harvest, { createEngine, methodSource = null, group = 'Imported' } = {}) {
  const run = await runPanelLua(read, { createEngine, methodSource });
  if (!run.ok) return { ok: false, error: run.error };
  const learned = [];
  const notLearned = [];
  let silent = 0;
  const entries = [];
  const owned = new Set([...harvest.parameterIdOf.keys()]);

  for (const c of run.controls) {
    // A control that sends MIDI of its own keeps what harvest.js made of it (or the reason it made
    // nothing): Ctrlr sends that AND whatever the Lua sends, so a parameter learned from the Lua
    // alone would send half of it.
    if (owned.has(c.node) || sendsOwnMidi(c.node)) continue;
    if (run.load.notRead.includes(c.method)) {
      notLearned.push({ name: c.name, method: c.method, reason: `its Lua method ${c.method} is kept in a file beside the panel, which the import was not given` });
      continue;
    }
    const judged = judgeRuns(c);
    if (judged.silent) { silent += 1; continue; }
    if (judged.reason) { notLearned.push({ name: c.name, method: c.method, reason: judged.reason }); continue; }
    const fit = fitObserved(c, { checksumBytes });
    if (fit.reason) { notLearned.push({ name: c.name, method: c.method, reason: fit.reason }); continue; }
    if (c.sampled && !isLinear(c.values, fit.wires)) {
      notLearned.push({ name: c.name, method: c.method, reason: 'its range is too wide to run whole, and what it sends follows no straight rule' });
      continue;
    }

    const component = child(c.node, 'component', 'uiComponent');
    const list = componentValueList(component);
    const label = attr(component, 'componentVisibleName') || attr(component, 'uiLabelText') || c.name;
    const id = `${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || `modulator.${c.index + 1}`}`;
    const wireOf = new Map(c.values.map((v, i) => [v, fit.wires[i]]));
    const rawValue = attrNumber(c.node, 'modulatorValue', c.values[0]);
    const defaultValue = Math.min(c.values.at(-1), Math.max(c.values[0], Math.round(Number.isFinite(rawValue) ? rawValue : c.values[0])));
    const reads = judged.conditional ? judged.conditional.reads : null;
    const readsOnly = !judged.conditional && judged.reads.length ? judged.reads : null;
    const built = buildParameter({
      id, name: c.name, label, group, type: fit.type,
      number: fit.number ?? -1, formula: fit.formula ?? '', multiList: fit.multiList ?? '',
      fixedChannel: fit.fixedChannel, channelNumber: fit.channelNumber ?? read.panel.outputChannel ?? 1, globals: read.panel.globals,
      list, domain: c.values, wires: fit.wires,
      wireAt: (v) => (wireOf.has(v) ? wireOf.get(v) : Number.NaN),
      expression: { identity: false, source: `the Lua method ${c.method}`, raw: (v) => wireOf.get(v) },
      defaultValue, step: Math.abs(attrNumber(component, 'uiSliderInterval', 1)) || 1,
      uiType: String(attr(component, 'uiType', '')).toLowerCase(),
      ctrlr: {
        modulator: c.name,
        messageType: 'Lua',
        learnedFrom: c.method,
        ...(reads ? { learnedAsLoaded: reads.length ? reads : ['other controls'] } : {}),
        ...(readsOnly ? { readsWithoutEffect: readsOnly } : {}),
        vstIndex: attrNumber(c.node, 'vstIndex', -1),
      },
      inbound: false,
    });
    if (!built.ok) { notLearned.push({ name: c.name, method: c.method, reason: built.reason }); continue; }

    // The standard: the profile sends exactly what the Lua sent, value for value.
    const choiceId = (v) => built.parameter.choices?.[v]?.id;
    const differs = c.runs.find((r) => {
      const value = built.parameter.type === 'choice' ? choiceId(r.value) : r.value;
      const bytes = compiledBytes(built, read, value);
      return !bytes || bytes.join(',') !== r.messages.flat().join(',');
    });
    if (differs) {
      notLearned.push({ name: c.name, method: c.method, reason: `the profile could not send what the Lua sent for ${differs.value}` });
      continue;
    }
    entries.push({
      node: c.node,
      built,
      learned: { name: c.name, method: c.method, ...(reads ? { reads: reads.length ? reads : ['other controls'] } : {}), ...(readsOnly ? { readsOnly } : {}) },
    });
  }
  addParameters(harvest, entries);
  for (const entry of entries) learned.push({ ...entry.learned, parameterId: harvest.parameterIdOf.get(entry.node) });
  // `controls`: every run, for a tool that wants to hold them to something else (Ctrlr itself).
  return { ok: true, learned, notLearned, silent, load: run.load, controls: run.controls };
}
