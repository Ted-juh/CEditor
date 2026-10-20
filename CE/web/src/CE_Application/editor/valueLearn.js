// valueLearn.js — what the Values tab writes when a control is moved on the instrument, and what it
// hands the Ports tab to send: the pure half of a row's Learn and Send (ValuesSidebar.svelte).
//
// Learn takes what the MIDI tab's learn chips take (utils/midiLearnChips.js), one chip, the first
// of the kind the call can use: a CC's controller and channel for ce.midi.sendCC, an NRPN's or RPN's
// numbers and channel for sendNRPN and sendRPN, and a parameter the profile names for a device
// parameter's id. A chip dragged from the MIDI tab onto the row is taken the same way. The numbers
// it writes are written over the arguments they replace, the text between them kept, in one edit,
// so one undo takes a learn back.
//
// Send takes the bytes a sendMidi or sendSysex row shows, the ones the runtime would send, to the
// Ports tab's Send raw MIDI box: that box checks them, shows the device they go to and sends them
// when its Send is pressed, and says what the backend did with them. Nothing is sent from a row.

import { midiControlParameterShape } from '../utils/midiControlBindings.js';

const LEARNS = {
  sendCC: { want: 'cc', names: ['channel', 'cc'], learnFrom: ['channel', 'cc'] },
  sendNRPN: { want: 'nrpn', names: ['channel', 'msb', 'lsb'], learnFrom: ['channel', 'msb', 'lsb'] },
  sendRPN: { want: 'rpn', names: ['channel', 'msb', 'lsb'], learnFrom: ['channel', 'msb', 'lsb'] },
};

const isNumberLiteral = (arg) => Boolean(arg?.literal) && typeof arg.value === 'number';

/**
 * What a row's Learn writes into its call: { want, args, label } — `want` the chip it takes ('cc',
 * 'nrpn', 'rpn' or 'parameter'), `args` the arguments it writes over, in order — or null for a row
 * with none. The arguments must be written as numbers (an id as text) for the learn to replace.
 */
export function learnFor(call, arg) {
  if (!call || !arg) return null;
  if (arg.kind === 'deviceParameter') {
    return arg.literal && typeof arg.value === 'string' ? { want: 'parameter', args: [arg], label: 'a parameter the profile names' } : null;
  }
  const spec = LEARNS[call.memberId];
  if (!spec || !spec.learnFrom.includes(arg.param?.name ?? arg.name)) return null;
  const args = spec.names.map((name) => call.args.find((a) => (a.param?.name ?? a.name) === name));
  if (!args.every(isNumberLiteral)) return null;
  return { want: spec.want, args, label: spec.want === 'cc' ? 'a controller (CC)' : `an ${spec.want.toUpperCase()}` };
}

/**
 * A learn chip, or a chip's drag payload (chipDragPayload's), as the few things a learn writes: the
 * message that moved (`kind`: 'cc', 'nrpn', 'rpn', or another the MIDI tab reads) with its numbers
 * and channel, and the parameter the profile names it as, when it does. A CC the profile names is
 * both, so a sendCC's Learn takes its controller and a device parameter's Learn its name.
 */
export function learnedOf(chipOrPayload) {
  const c = chipOrPayload ?? {};
  if (c.kind === 'ceditor.deviceParameter') {
    const m = c.midi ?? {};
    return { kind: m.message ?? 'parameter', parameterId: String(c.parameter?.id ?? ''), controller: m.controller, channel: m.channel,
      msb: m.parameterMsb, lsb: m.parameterLsb };
  }
  if (c.kind === 'ceditor.midiControl') {
    return { kind: c.message, parameterId: '', controller: c.controller, channel: c.channel, msb: c.parameterMsb, lsb: c.parameterLsb };
  }
  return { kind: c.origin, parameterId: String(c.parameterId ?? ''), controller: c.controller, channel: c.channel,
    msb: c.numbered?.parameterMsb, lsb: c.numbered?.parameterLsb };
}

/** Whether a learn takes this chip (or payload). */
export function learnTakes(spec, chipOrPayload) {
  const got = learnedOf(chipOrPayload);
  if (spec?.want === 'parameter') return Boolean(got.parameterId);
  if (spec?.want === 'cc') return got.kind === 'cc' && Number.isInteger(Number(got.controller)) && Number.isInteger(Number(got.channel));
  if (spec?.want === 'nrpn' || spec?.want === 'rpn') {
    return got.kind === spec.want && [got.msb, got.lsb, got.channel].every((n) => Number.isInteger(Number(n)));
  }
  return false;
}

/**
 * The one edit a learn makes: { start, end, text } over the source, the learned numbers in place of
 * the arguments and the text between them as it was, or null when the chip is not one it takes.
 * `writeText(arg, value)` writes an id as the script's language writes text (writeValue's text).
 */
export function learnedEdit(source, spec, chipOrPayload, writeText) {
  if (!learnTakes(spec, chipOrPayload)) return null;
  const got = learnedOf(chipOrPayload);
  if (spec.want === 'parameter') {
    const [arg] = spec.args;
    return { start: arg.range.start, end: arg.range.end, text: writeText(arg, got.parameterId) };
  }
  const values = spec.want === 'cc' ? [got.channel, got.controller] : [got.channel, got.msb, got.lsb];
  const { args } = spec;
  let text = '';
  args.forEach((arg, i) => {
    text += String(Math.round(Number(values[i])));
    if (i < args.length - 1) text += source.slice(arg.range.end, args[i + 1].range.start);
  });
  return { start: args[0].range.start, end: args[args.length - 1].range.end, text };
}

/** What a learn says it is waiting for, and what it wrote. */
export function learnWords(spec, chipOrPayload = null) {
  if (!chipOrPayload) return `Move a control on the instrument: the first ${spec.label} the MIDI tab sees is written here. Click Learn again to stop.`;
  const got = learnedOf(chipOrPayload);
  if (spec.want === 'parameter') return `Learned "${got.parameterId}".`;
  if (spec.want === 'cc') return `Learned CC ${got.controller} on channel ${got.channel}.`;
  return `Learned ${midiControlParameterShape({ message: got.kind, parameterMsb: got.msb, parameterLsb: got.lsb }).name} on channel ${got.channel}.`;
}

/** The bytes a row hands the Ports tab to send, as hex, or null: sendMidi's and sendSysex's, read
 *  without a problem, as the runtime sends them (a SysEx wrapped in F0 … F7). */
export function sendableHex(call, arg) {
  if (!call || !arg || arg.kind !== 'bytes' || arg.problem) return null;
  if (call.memberId !== 'sendMidi' && call.memberId !== 'sendSysex') return null;
  const m = arg.meaning ?? {};
  return m.sent ?? m.hex ?? null;
}
