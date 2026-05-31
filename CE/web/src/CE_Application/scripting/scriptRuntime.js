import { commandDescriptor } from './scriptCommandRegistry.js';
import { evaluateExpression } from './scriptExpressions.js';

const DEFAULT_GUARDRAILS = {
  maxCommandsPerEvent: 512,
  allowRawCode: false,
  allowSettingsWrite: false,
  allowDirectTreeMutation: false,
  allowFilesystem: false,
  allowNetwork: false,
};

export function createScriptContext(overrides = {}) {
  return {
    event: {
      name: 'onValueChanged',
      target: 'macroControl',
      value: 0.72,
      phase: 'preview',
      origin: 'pointer.drag',
      ...(overrides.event ?? {}),
    },
    values: {
      cutoff: { value: 80 },
      resonance: { value: 0.1 },
      drive: { value: 0.35 },
      macroControl: { value: 0.72 },
      ...(overrides.values ?? {}),
    },
    state: overrides.state ?? {},
    device: { ready: true, ...(overrides.device ?? {}) },
    guardrails: {
      ...DEFAULT_GUARDRAILS,
      ...(overrides.guardrails ?? {}),
    },
  };
}

function nowStamp(index) {
  return `12:01:32.${String(123 + index).padStart(3, '0')}`;
}

function formatValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (Array.isArray(value)) return value.map((item) => Number(item).toString(16).padStart(2, '0').toUpperCase()).join(' ');
  return String(value);
}

function midiValue(value, min = 0, max = 127) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function to14Bit(value) {
  const number = midiValue(value, 0, 16383);
  return { value: number, msb: (number >> 7) & 0x7F, lsb: number & 0x7F };
}

function rolandChecksum(bytes = []) {
  const sum = bytes.reduce((total, byte) => total + (Number(byte) & 0x7F), 0);
  return (128 - (sum % 128)) & 0x7F;
}

function runStep(step, context, output, index) {
  const command = String(step?.command ?? step?.cmd ?? '');
  const descriptor = commandDescriptor(command);
  if (!descriptor) {
    output.trace.push({ time: nowStamp(index), type: 'ERROR', message: `Unknown command: ${command}` });
    return;
  }

  if (step?.disabled === true) {
    output.trace.push({ time: nowStamp(index), type: 'SKIP', message: `${command} disabled` });
    return;
  }

  const args = step.args ?? {};
  const phase = args.phase ?? step.phase ?? 'preview';
  const shouldEmit = phase !== 'commit' || context.event.phase === 'commit';

  if (command === 'setValue') {
    const target = String(args.target ?? '');
    const value = evaluateExpression(args.value, context);
    output.patches.push({ target, value, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'PATCH', message: `${target} -> ${formatValue(value)}` });
    return;
  }

  if (command === 'routeValue') {
    const source = String(args.from ?? '');
    const target = String(args.to ?? '');
    const value = args.transform == null
      ? evaluateExpression({ ref: source }, context)
      : evaluateExpression(args.transform, context);
    output.patches.push({ target, value, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'PATCH', message: `${source} -> ${target} = ${formatValue(value)}` });
    return;
  }

  if (command === 'setPartColor') {
    const part = String(args.part ?? '');
    const color = String(args.color ?? '#FFFFFF');
    output.patches.push({ target: `${part}.color`, value: color, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'PATCH', message: `${part}.color -> ${color}` });
    return;
  }

  if (command === 'setState') {
    const target = String(args.target ?? 'panel');
    const state = String(args.state ?? '');
    output.patches.push({ target: `${target}.state`, value: state, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'STATE', message: `${target} -> ${state}` });
    return;
  }

  if (command === 'setPanelState') {
    const state = String(args.state ?? '');
    output.patches.push({ target: 'panel.state', value: state, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'STATE', message: `panel -> ${state}` });
    return;
  }

  if (command === 'setVisible' || command === 'showGroup' || command === 'hideGroup') {
    const target = String(args.target ?? args.group ?? '');
    const visible = command === 'hideGroup' ? false : command === 'showGroup' ? true : args.visible !== false;
    output.patches.push({ target: `${target}.visible`, value: visible, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'PATCH', message: `${target}.visible -> ${visible}` });
    return;
  }

  if (command === 'setAnimation') {
    const target = String(args.target ?? '');
    const animation = String(args.animation ?? '');
    const enabled = args.enabled !== false;
    output.patches.push({ target: `${target}.animation`, value: { animation, enabled }, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'ANIM', message: `${target} ${enabled ? 'start' : 'stop'} ${animation}` });
    return;
  }

  if (command === 'startTimer' || command === 'stopTimer') {
    const id = String(args.id ?? '');
    const timer = { id, ms: Number(args.ms ?? 0), running: command === 'startTimer' };
    output.timers.push(timer);
    output.trace.push({ time: nowStamp(index), type: 'TIMER', message: `${command} ${id}${timer.ms ? ` ${timer.ms}ms` : ''}` });
    return;
  }

  if (command === 'emitEvent') {
    const event = {
      name: String(args.event ?? ''),
      target: String(args.target ?? context.event.target ?? ''),
      value: args.value == null ? context.event.value : evaluateExpression(args.value, context),
      phase: context.event.phase,
    };
    output.events.push(event);
    output.trace.push({ time: nowStamp(index), type: 'EVENT', message: `emit ${event.name} ${event.target} value=${formatValue(event.value)}` });
    return;
  }

  if (command === 'sendCC') {
    const value = evaluateExpression(args.value, context);
    const message = {
      type: 'cc',
      channel: Number(args.channel ?? 1),
      cc: Number(args.cc ?? 0),
      value: midiValue(value),
      phase,
      queued: !shouldEmit,
    };
    output.deviceMessages.push(message);
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `CC ch${message.channel} cc${message.cc} value${message.value}${message.queued ? ' queued until commit' : ''}` });
    return;
  }

  if (command === 'sendNRPN') {
    const value = to14Bit(evaluateExpression(args.value, context));
    const message = {
      type: 'nrpn',
      channel: Number(args.channel ?? 1),
      parameterMsb: midiValue(args.parameterMsb),
      parameterLsb: midiValue(args.parameterLsb),
      value: value.value,
      msb: value.msb,
      lsb: value.lsb,
      phase,
      queued: !shouldEmit,
    };
    output.deviceMessages.push(message);
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `NRPN ch${message.channel} ${message.parameterMsb}/${message.parameterLsb} value${message.value}${message.queued ? ' queued until commit' : ''}` });
    return;
  }

  if (command === 'to14Bit') {
    const split = to14Bit(evaluateExpression(args.value, context));
    output.patches.push({ target: args.target ?? 'midi.14bit', value: split, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `14bit ${split.value} msb=${split.msb} lsb=${split.lsb}` });
    return;
  }

  if (command === 'buildSysex') {
    const bytes = Array.isArray(args.bytes) ? args.bytes.map((byte) => Number(evaluateExpression(byte, context)) & 0xFF) : [];
    output.patches.push({ target: args.target ?? 'device.sysex.bytes', value: bytes, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `buildSysEx ${formatValue(bytes)}` });
    return;
  }

  if (command === 'checksum') {
    const bytes = Array.isArray(args.bytes) ? args.bytes : [];
    const checksum = String(args.type ?? '').toLowerCase().includes('roland') ? rolandChecksum(bytes) : midiValue(bytes.reduce((sum, byte) => sum + Number(byte), 0));
    output.patches.push({ target: args.target ?? 'device.sysex.checksum', value: checksum, command, phase: context.event.phase });
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `checksum ${formatValue(checksum)}` });
    return;
  }

  if (command === 'sendSysex') {
    const bytes = Array.isArray(args.bytes) ? args.bytes.map((byte) => Number(byte) & 0xFF) : [];
    output.deviceMessages.push({ type: 'sysex', bytes, phase, queued: !shouldEmit });
    output.trace.push({ time: nowStamp(index), type: 'MIDI', message: `SysEx ${formatValue(bytes)}` });
    return;
  }

  if (command === 'log') {
    const value = args.value == null ? '' : ` ${formatValue(evaluateExpression(args.value, context))}`;
    output.trace.push({ time: nowStamp(index), type: 'LOG', message: `${args.message ?? 'log'}${value}` });
    return;
  }

  output.trace.push({ time: nowStamp(index), type: 'STEP', message: descriptor.label });
}

export function executeScript(script, context = createScriptContext()) {
  const guardrails = {
    ...DEFAULT_GUARDRAILS,
    ...(context.guardrails ?? {}),
  };
  const output = {
    event: context.event,
    patches: [],
    deviceMessages: [],
    events: [],
    timers: [],
    blocked: [],
    trace: [
      {
        time: nowStamp(0),
        type: 'EVENT',
        message: `${script?.event ?? context.event.name} ${script?.target ?? context.event.target} value=${formatValue(context.event.value)}`,
      },
    ],
  };

  const steps = Array.isArray(script?.steps) ? script.steps : [];
  if (script?.rawLanguage && guardrails.allowRawCode !== true) {
    output.blocked.push({ reason: 'raw-code-disabled', scriptId: script.id ?? '' });
    output.trace.push({ time: nowStamp(1), type: 'BLOCKED', message: `Raw ${script.rawLanguage} code is disabled by sandbox guardrails.` });
    return output;
  }

  const maxCommands = Math.max(1, Number(guardrails.maxCommandsPerEvent) || DEFAULT_GUARDRAILS.maxCommandsPerEvent);
  if (steps.length > maxCommands) {
    output.blocked.push({ reason: 'max-commands', maxCommands, actual: steps.length });
    output.trace.push({ time: nowStamp(1), type: 'BLOCKED', message: `Script has ${steps.length} commands; guardrail limit is ${maxCommands}.` });
    return output;
  }

  steps.forEach((step, index) => runStep(step, { ...context, guardrails }, output, index + 1));
  return output;
}

export function validateScript(script) {
  const issues = [];
  const steps = Array.isArray(script?.steps) ? script.steps : [];
  if (!script?.id) issues.push({ level: 'warning', code: 'missing-id', path: 'id', message: 'Script has no stable id.', quickFix: 'Assign a unique script id.' });
  if (!script?.event) issues.push({ level: 'error', code: 'missing-event', path: 'event', message: 'Script needs an event.', quickFix: 'Choose an event such as onValueChanged.' });
  if (script?.rawLanguage) {
    issues.push({ level: 'warning', code: 'raw-language', path: 'rawLanguage', message: `Raw ${script.rawLanguage} code is not portable.`, quickFix: 'Convert raw code into command graph steps.' });
  }
  for (const [index, step] of steps.entries()) {
    const command = String(step?.command ?? step?.cmd ?? '');
    const descriptor = commandDescriptor(command);
    if (!descriptor) {
      issues.push({ level: 'error', code: 'unknown-command', path: `steps.${index}.command`, message: `Step ${index + 1} uses unknown command "${command}".`, quickFix: 'Replace it with a command from the command library.' });
      continue;
    }
    for (const arg of descriptor.args ?? []) {
      if (!arg.required) continue;
      const hasArg = Object.prototype.hasOwnProperty.call(step.args ?? {}, arg.name);
      if (!hasArg) issues.push({ level: 'error', code: 'missing-arg', path: `steps.${index}.args.${arg.name}`, message: `Step ${index + 1} ${descriptor.label} is missing ${arg.name}.`, quickFix: `Add the ${arg.name} argument.` });
    }
  }
  return issues;
}
