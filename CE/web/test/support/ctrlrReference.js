// ctrlrReference.js — the bytes Ctrlr sends for a modulator's value, by Ctrlr's own procedure.
//
// A test reference, NOT part of the importer: an independent port of CtrlrX's byte-building code,
// so the importer's profiles can be held to it value by value. The importer translates a modulator
// into a device-profile recipe; this does what Ctrlr does with the modulator directly. If the two
// ever differ, the profile would send something Ctrlr does not.
//
// Ported from CtrlrX (github.com/damiensellier/CtrlrX, the maintained fork of Ctrlr):
//
//   CtrlrModulatorProcessor::getValueForMidiMessage   value list, then the forward formula, cut to int
//   CtrlrSysexProcessor::sysexMessageFromString       one byte per token: getHexValue32, capped at 255
//   CtrlrSysexProcessor::sysExIdentifyToken / sysExProcessToken / the five checksum functions
//   CtrlrUtilities midiMessageExfromString            a Multi list's parts
//   juce::MidiMessage::controllerEvent                status | channel, number & 127, value & 127
//
// The formula evaluator and the value-list reader are shared with the importer (expression.js,
// harvest.js readValueList): both are direct ports with tests of their own. Everything about BYTES
// is ported again here, separately, on purpose.

import { compileForwardExpression } from '../../src/CE_Application/ctrlrImport/expression.js';
import { componentValueList } from '../../src/CE_Application/ctrlrImport/harvest.js';
import { messageTypeName } from '../../src/CE_Application/ctrlrImport/read.js';

const attr = (node, name, fallback = '') => node?.attributes?.[name] ?? fallback;
const child = (node, ...names) => (node?.children ?? []).find((c) => names.includes(c.name)) ?? null;
const number = (node, name, fallback) => {
  const text = String(attr(node, name, '')).trim();
  const value = Number(text);
  return text === '' || !Number.isFinite(value) ? fallback : value;
};

/** JUCE StringArray::addTokens: empty tokens between consecutive break characters are KEPT. */
function juceTokens(text, breaks) {
  const out = [];
  if (!text) return out;
  let current = '';
  let quote = '';
  for (const c of text) {
    if (quote) { current += c; if (c === quote) quote = ''; continue; }
    if (c === '"') { quote = c; current += c; continue; }
    if (breaks.includes(c)) { out.push(current); current = ''; continue; }
    current += c;
  }
  out.push(current);
  return out;
}

/** JUCE String::getHexValue32: every hex digit in the string, others ignored. */
function hexValue32(text) {
  let value = 0;
  for (const c of text) {
    const digit = Number.parseInt(c, 16);
    if (Number.isNaN(digit)) continue;
    value = ((value << 4) | digit) >>> 0;
  }
  return value;
}

/** JUCE String::getIntValue. */
const intValue = (text) => {
  const match = /^\s*([-+]?\d+)/.exec(text);
  return match ? Number.parseInt(match[1], 10) : 0;
};

function identify(s) {
  if (s === 'xx') return ['ByteValue'];
  if (s.endsWith('y') && !s.startsWith('y')) return ['ByteChannel4Bit', Number.parseInt(s.slice(0, 1), 16) || 0];
  if (s.startsWith('z')) return ['ChecksumRoland', intValue(s.slice(1).trim())];
  if (s.startsWith('O') && /\d/.test(s[1] ?? '')) return ['ChecksumOnes', intValue(s.slice(1).trim())];
  if (s.startsWith('w')) return ['ChecksumSum', intValue(s.slice(1).trim())];
  if (s.startsWith('X') && /\d/.test(s[1] ?? '')) return ['ChecksumXor', intValue(s.slice(1).trim())];
  if (s.startsWith('u')) return ['LUAToken'];
  if (s.startsWith('v')) return ['FormulaToken'];
  if (s === 'yy') return ['ByteChannel'];
  if (s === 'LS') return ['LSB7bitValue'];
  if (s === 'MS') return ['MSB7bitValue'];
  if (s === 'ii') return ['Ignore'];
  if (s === 'ls') return ['LSB4bitValue'];
  if (s === 'ms') return ['MSB4bitValue'];
  if (/^r[1-4]$/.test(s)) return [`RolandSplit${s[1]}`];
  if (s === 'tp' || s === 'tb') return ['Current'];
  if (s === 'tc') return ['ChecksumTechnics'];
  if (/^q[0-3]$/.test(s)) return [`NibbleLsb${s[1]}`];
  if (/^Q[0-3]$/.test(s)) return [`NibbleMsb${s[1]}`];
  if (/^[kpno]/.test(s)) return ['GlobalVariable', intValue(s.slice(1).trim())];
  return ['NoToken'];
}

function rolandSplit(value, byteNum) {
  // getRolandSplit: integer division first, then doubles, then cast — nibbles, high first.
  const result4 = Math.trunc(value / 16);
  const reminder4 = value % 16;
  const result3 = result4 / 16;
  const reminder3 = result4 % 16;
  const result2 = result3 / 16;
  const reminder2 = result3 % 16;
  const reminder1 = result2 % 16;
  const pick = [reminder1, reminder2, reminder3, reminder4][byteNum - 1];
  return Math.min(127, Math.max(0, Math.trunc(pick) & 0xff));
}

/** A SysEx formula, a value and a channel → the bytes, as CtrlrSysexProcessor writes them. */
export function sysexBytes(formula, value, channel, globals = []) {
  // Trimmed: a formula typed with a trailing space gives JUCE's tokenizer an empty last token, and
  // Ctrlr then sends a stray 00 AFTER the F7. It is not part of the message, and a profile should
  // not reproduce it. (Doubled spaces inside a formula are kept: those zeros are inside it.)
  const text = String(formula ?? '').trim();
  const bytes = juceTokens(text, ' ;:').map((t) => Math.min(hexValue32(t), 255));
  const tokens = juceTokens(text, ' :;').map(identify);
  if (tokens.length !== bytes.length) return bytes;
  const ch = Math.min(15, Math.max(0, channel - 1));
  tokens.forEach(([type, extra], i) => {
    switch (type) {
      case 'ByteValue': bytes[i] = value & 0xff; break;
      case 'ByteChannel': bytes[i] = ch; break;
      case 'LSB7bitValue': bytes[i] = value & 127; break;
      case 'MSB7bitValue': bytes[i] = (value & 0x3fff) >> 7; break;
      case 'ByteChannel4Bit': bytes[i] = (((extra & 7) << 4) | ch) & 0x7f; break;
      case 'GlobalVariable': if ((globals[extra] ?? -1) >= 0) bytes[i] = globals[extra] & 0xff; break;
      case 'LSB4bitValue': bytes[i] = value & 0xf; break;
      case 'MSB4bitValue': bytes[i] = (value >> 4) & 0xf; break;
      case 'RolandSplit1': case 'RolandSplit2': case 'RolandSplit3': case 'RolandSplit4':
        bytes[i] = rolandSplit(value, Number(type.at(-1))); break;
      case 'NibbleLsb0': bytes[i] = value & 0xf; break;
      case 'NibbleLsb1': bytes[i] = (value >> 4) & 0xf; break;
      case 'NibbleLsb2': bytes[i] = (value >> 8) & 0xf; break;
      case 'NibbleLsb3': bytes[i] = (value >> 12) & 0xf; break;
      case 'NibbleMsb0': bytes[i] = (value >> 12) & 0xf; break;
      case 'NibbleMsb1': bytes[i] = (value >> 8) & 0xf; break;
      case 'NibbleMsb2': bytes[i] = (value >> 4) & 0xf; break;
      case 'NibbleMsb3': bytes[i] = value & 0xf; break;
      default: break;
    }
  });
  tokens.forEach(([type, extra], i) => {
    if (type.startsWith('Checksum') && type !== 'ChecksumTechnics' && i - extra < 0) return;   // reads before the message: undefined in Ctrlr
    const sumOver = (from) => {
      let total = 0;
      for (let k = from; k < i; k += 1) total = (total + bytes[k]) & 0xff;
      return total;
    };
    if (type === 'ChecksumRoland') bytes[i] = ((~sumOver(i - extra) + 1) & 0xff) & 0x7f;
    else if (type === 'ChecksumOnes') bytes[i] = (~sumOver(i - extra) & 0xff) & 0x7f;
    else if (type === 'ChecksumSum') bytes[i] = sumOver(i - extra) & 0x7f;
    else if (type === 'ChecksumXor') {
      let x = 0;
      for (let k = i - extra; k < i; k += 1) x ^= bytes[k];
      bytes[i] = x & 0x7f;
    } else if (type === 'ChecksumTechnics') {
      if (i > 1) {
        let x = bytes[1];
        for (let k = 2; k < i; k += 1) x ^= bytes[k];
        bytes[i] = x & 0xff;
      }
    }
  });
  return bytes;
}

const indirect = (op, value) => (op === 'MSB7bitValue' ? (value & 0x3fff) >> 7
  : op === 'LSB7bitValue' ? value & 127 : op === 'MSB4bitValue' ? (value >> 4) & 0xf
    : op === 'LSB4bitValue' ? value & 0xf : value);

/**
 * The value the modulator's message carries for the control's value `value`
 * (CtrlrModulatorProcessor::getValueForMidiMessage).
 */
export function midiValueFor(modulator, value) {
  const component = child(modulator, 'component', 'uiComponent');
  const list = componentValueList(component);
  const formula = compileForwardExpression(attr(modulator, 'modulatorValueExpression', ''), {
    min: number(modulator, 'modulatorMin', 0), max: number(modulator, 'modulatorMax', 127),
  });
  if (list.length) return formula.identity ? list[value].value : formula.forward(value);
  return formula.forward(value);
}

/**
 * Every message, as byte arrays, that Ctrlr sends when this modulator's control takes `value`.
 * `panel`: read.js panel details (outputChannel, globals).
 */
export function ctrlrMessages(modulator, panel, value) {
  const midi = child(modulator, 'midi');
  const type = messageTypeName(attr(midi, 'midiMessageType'));
  const v = midiValueFor(modulator, value);
  const channel = attr(midi, 'midiMessageChannelOverride') === '1' || attr(midi, 'midiMessageChannelOverride') === 'true'
    ? number(midi, 'midiMessageChannel', 1) : (panel?.outputChannel ?? 1);
  const status = 0xb0 | ((channel - 1) & 0xf);
  const controllerNumber = number(midi, 'midiMessageCtrlrNumber', 0);
  if (type === 'CC') return [[status, controllerNumber & 127, v & 127]];
  if (type === 'SysEx') return [sysexBytes(attr(midi, 'midiMessageSysExFormula', ''), v, channel, panel?.globals ?? [])];
  if (type === 'Multi') {
    return String(attr(midi, 'midiMessageMultiList', '')).trim().split(':').filter((p) => p.trim()).map((part) => {
      const fields = part.trim().split(',').map((f) => f.trim());
      let finalNumber = controllerNumber;
      if (fields.length >= 4) {
        if (fields[3].includes('-2-32')) finalNumber = controllerNumber - 32;
        else if (intValue(fields[3]) !== -2) finalNumber = intValue(fields[3]);
      }
      const override = fields.length > 4 ? intValue(fields[4]) : -1;
      const base = override === -2 ? controllerNumber : override === -1 ? v : override;
      return [status, finalNumber & 127, indirect(fields[2], base) & 127];
    });
  }
  return [];
}
