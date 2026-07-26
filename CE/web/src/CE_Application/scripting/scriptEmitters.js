import { SCRIPT_TARGETS, commandDescriptor, portabilityForScript } from './scriptCommandRegistry.js';
import { panicCcMessages } from '../utils/panicLayout.js';
import { expressionToText } from './scriptExpressions.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

function indent(text, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return String(text).split('\n').map((line) => line ? `${pad}${line}` : line).join('\n');
}

function valueText(value, target) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return expressionToText(value, target);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function quoted(value) {
  return JSON.stringify(String(value ?? ''));
}

function luaBool(value) {
  return value ? 'true' : 'false';
}

function luaBytes(bytes = []) {
  return `{${(bytes ?? []).map((byte) => Number(byte) || 0).join(', ')}}`;
}

function luaExpression(value) {
  if (value == null) return 'nil';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return luaBool(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return luaBytes(value);
  if (typeof value !== 'object') return String(value);
  if (value.ref) {
    const ref = String(value.ref);
    if (ref === 'event.value') return 'event.value';
    return `getValue(${quoted(ref)})`;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'literal')) {
    return typeof value.literal === 'string' ? quoted(value.literal) : luaExpression(value.literal);
  }

  const op = String(value.op ?? '');
  const args = Array.isArray(value.args) ? value.args.map(luaExpression) : [];
  if (['*', '+', '-', '/'].includes(op)) return `(${args.join(` ${op} `)})`;
  if (['>', '>=', '<', '<=', '=='].includes(op)) return `(${args.join(` ${op} `)})`;
  if (op === '!=') return `(${args.join(' ~= ')})`;
  if (op === 'equals') return `(${args[0] ?? 'nil'} == ${args[1] ?? 'nil'})`;
  if (op === 'notEquals') return `(${args[0] ?? 'nil'} ~= ${args[1] ?? 'nil'})`;
  if (op === 'and') return `(${args.join(' and ')})`;
  if (op === 'or') return `(${args.join(' or ')})`;
  if (op === 'not') return `(not ${args[0] ?? 'false'})`;
  if (op === 'round') return `round(${args[0] ?? '0'})`;
  if (op === 'scale') return `scale(${args.join(', ')})`;
  if (op === 'clamp') return `clamp(${args.join(', ')})`;
  if (op === 'curve') return `curve(${args[0] ?? '0'}, ${value.from ?? args[1] ?? 0}, ${value.to ?? args[2] ?? 1}, ${quoted(value.shape ?? 'linear')})`;
  if (op === 'to14Bit' || op === 'split14bit') return `to14Bit(${args.join(', ')})`;
  return valueText(value, 'lua');
}

function luaCondition(condition) {
  if (condition == null || condition === '') return 'true';
  if (typeof condition === 'boolean') return luaBool(condition);
  if (typeof condition === 'string') {
    const text = condition.trim();
    if (!text || text.toLowerCase() === 'always') return 'true';
    if (text.toLowerCase() === 'never') return 'false';
    return text;
  }
  return luaExpression(condition);
}

function emitLuaStep(step, lines) {
  const command = step.command ?? step.cmd;
  const args = step.args ?? {};
  if (command === 'setValue') lines.push(`  setValue(${quoted(args.target)}, ${luaExpression(args.value)})`);
  else if (command === 'routeValue') lines.push(`  setValue(${quoted(args.to)}, ${args.transform ? luaExpression(args.transform) : `getValue(${quoted(args.from)})`})`);
  else if (command === 'setState') lines.push(`  setState(${quoted(args.target)}, ${quoted(args.state)})`);
  else if (command === 'setPartColor') lines.push(`  setPartColor(${quoted(args.part)}, ${quoted(args.color)})`);
  else if (command === 'setVisible') lines.push(`  setVisible(${quoted(args.target)}, ${luaBool(args.visible !== false)})`);
  else if (command === 'showGroup') lines.push(`  showGroup(${quoted(args.group)})`);
  else if (command === 'hideGroup') lines.push(`  hideGroup(${quoted(args.group)})`);
  else if (command === 'setPanelState') lines.push(`  setPanelState(${quoted(args.state)})`);
  else if (command === 'setAnimation') lines.push(`  setAnimation(${quoted(args.target)}, ${quoted(args.animation)}, ${luaBool(args.enabled !== false)})`);
  else if (command === 'startTimer') lines.push(`  startTimer(${quoted(args.id)}, ${Number(args.ms) || 0})`);
  else if (command === 'stopTimer') lines.push(`  stopTimer(${quoted(args.id)})`);
  else if (command === 'emitEvent') lines.push(`  emitEvent(${quoted(args.event)}, ${quoted(args.target ?? '')}, ${luaExpression(args.value ?? { ref: 'event.value' })})`);
  else if (command === 'panic') { for (const m of panicStepMessages(args)) lines.push(`  sendCC(${m.channel}, ${m.cc}, 0)`); }
  else if (command === 'split') lines.push(`  ${splitCall(args, 'lua')}`);
  else if (command === 'phrase') lines.push(`  ${phraseCall(args, 'lua')}`);
  else if (command === 'recorder') lines.push(`  ${recorderCall(args, 'lua')}`);
  else if (command === 'harmony') lines.push(`  ${harmonyCall(args, 'lua')}`);
  else if (command === 'setlist') lines.push(`  ${setlistCall(args, 'lua')}`);
  else if (command === 'sendCC') lines.push(`  sendCC(${args.channel}, ${args.cc}, ${luaExpression(args.value)})`);
  else if (command === 'sendNRPN') lines.push(`  sendNRPN(${args.channel}, ${args.parameterMsb}, ${args.parameterLsb}, ${luaExpression(args.value)})`);
  else if (command === 'sendSysex') lines.push(`  sendSysex(${luaBytes(args.bytes)})`);
  else if (command === 'requestDeviceDump') lines.push(`  requestDeviceDump(${quoted(args.request)}, ${quoted(args.profileId ?? '')}, ${quoted(args.deviceRole ?? DEFAULT_DEVICE_ROLE)})`);
  else if (command === 'buildSysex') {
    const expression = `buildSysex(${luaBytes(args.bytes)})`;
    lines.push(args.target ? `  setValue(${quoted(args.target)}, ${expression})` : `  local sysexBytes = ${expression}`);
  } else if (command === 'checksum') {
    const expression = `checksumBytes(${quoted(args.type)}, ${luaBytes(args.bytes)})`;
    lines.push(args.target ? `  setValue(${quoted(args.target)}, ${expression})` : `  local checksum = ${expression}`);
  } else if (command === 'to14Bit') {
    const expression = `to14Bit(${luaExpression(args.value)})`;
    lines.push(args.target ? `  setValue(${quoted(args.target)}, ${expression})` : `  local value14 = ${expression}`);
  } else if (command === 'log') lines.push(`  trace(${quoted(args.message ?? 'log')}, ${luaExpression(args.value ?? { literal: '' })})`);
  else if (command === 'if') lines.push(`  if not (${luaCondition(args.condition)}) then return end`);
  else lines.push(`  -- ${ceStep(step)}`);
}

// One builder for every dialect, so lua/js/text can't drift about what a split
// step actually does. The argument set is deliberately narrow: whichever fields
// the chosen action uses, and nothing else on the line to read past.
function splitCall(args, dialect) {
  const t = String(args.target ?? '');
  const zone = args.zone === '' || args.zone == null ? '' : args.zone;
  const q = (v) => (dialect === 'ce' ? String(v) : JSON.stringify(String(v)));
  const z = () => (typeof zone === 'number' || /^\d+$/.test(String(zone)) ? Number(zone) : q(zone));
  const sep = dialect === 'ce' ? ' ' : ', ';
  const call = (name, rest) => (dialect === 'ce'
    ? `${name} ${[q(t), ...rest].join(sep)}`
    : `${name}(${[q(t), ...rest].join(sep)})`);
  switch (String(args.action ?? 'preset')) {
    case 'mute': return call('splitMute', [z(), String(args.enabled !== false)]);
    case 'channel': return call('splitChannel', [z(), Number(args.channel) || 1]);
    case 'transpose': return call('splitTranspose', [z(), Number(args.transpose) || 0]);
    case 'splitPoint': return call('splitPoint', [z(), Number(args.note) || 60]);
    case 'preset':
    default: return call('splitPreset', [q(args.preset ?? 'classic')]);
  }
}

// The Phrase Sequencer's equivalent. Same rule: only the arguments the chosen
// action actually uses reach the line.
function phraseCall(args, dialect) {
  const q = (v) => (dialect === 'ce' ? String(v) : JSON.stringify(String(v)));
  const t = q(String(args.target ?? ''));
  const sep = dialect === 'ce' ? ' ' : ', ';
  const call = (name, rest = []) => (dialect === 'ce'
    ? `${name} ${[t, ...rest].join(sep)}`
    : `${name}(${[t, ...rest].join(sep)})`);
  switch (String(args.action ?? 'seed')) {
    case 'clear': return call('phraseClear');
    case 'key': return call('phraseKey', [Number(args.key) || 0]);
    case 'scale': return call('phraseScale', [q(args.scale ?? 'minor')]);
    case 'transpose': return call('phraseTranspose', [Number(args.transpose) || 0]);
    case 'direction': return call('phraseDirection', [q(args.direction ?? 'forward')]);
    case 'run': return call('phraseRun', [String(args.running !== false)]);
    case 'cell': return call('phraseCell', [Number(args.step) || 0, Number(args.row) || 0]);
    case 'seed':
    default: return call('phraseSeed', [q(args.seed ?? 'riff')]);
  }
}

// The three newest components. Same rule as splitCall/phraseCall: only the
// arguments the chosen action actually uses reach the line.
function recorderCall(args, dialect) {
  const q = (v) => (dialect === 'ce' ? String(v) : JSON.stringify(String(v)));
  const t = q(String(args.target ?? ''));
  const sep = dialect === 'ce' ? ' ' : ', ';
  const call = (name, rest = []) => (dialect === 'ce'
    ? `${name} ${[t, ...rest].join(sep)}`
    : `${name}(${[t, ...rest].join(sep)})`);
  switch (String(args.action ?? 'record')) {
    case 'stop': return call('recorderStop');
    case 'play': return call('recorderPlay', [String(args.on !== false)]);
    case 'clear': return call('recorderClear');
    case 'undo': return call('recorderUndo');
    case 'quantize': return call('recorderQuantize', [Number(args.grid) || 16, Number(args.strength) || 0]);
    case 'transpose': return call('recorderTranspose', [Number(args.transpose) || 0]);
    case 'bars': return call('recorderBars', [Number(args.bars) || 2]);
    case 'source': return call('recorderSource', [q(args.source ?? 'both')]);
    case 'record':
    default: return call('recorderRecord', [String(args.on !== false)]);
  }
}
function harmonyCall(args, dialect) {
  const q = (v) => (dialect === 'ce' ? String(v) : JSON.stringify(String(v)));
  const t = q(String(args.target ?? ''));
  const sep = dialect === 'ce' ? ' ' : ', ';
  const call = (name, rest = []) => (dialect === 'ce'
    ? `${name} ${[t, ...rest].join(sep)}`
    : `${name}(${[t, ...rest].join(sep)})`);
  switch (String(args.action ?? 'key')) {
    case 'mode': return call('harmonyMode', [q(args.mode ?? 'diatonic')]);
    case 'scale': return call('harmonyScale', [q(args.scale ?? 'major')]);
    case 'size': return call('harmonySize', [Number(args.size) || 3]);
    case 'shape': return call('harmonyShape', [q(args.shape ?? 'major')]);
    case 'voicing': return call('harmonyVoicing', [q(args.voicing ?? 'close')]);
    case 'inversion': return call('harmonyInversion', [Number(args.inversion) || 0]);
    case 'octave': return call('harmonyOctave', [Number(args.octave) || 0]);
    case 'outOfKey': return call('harmonyOutOfKey', [q(args.outOfKey ?? 'pass')]);
    case 'keepPlayed': return call('harmonyKeepPlayed', [String(args.on !== false)]);
    case 'channel': return call('harmonyChannel', [Number(args.channel) || 1]);
    case 'key':
    default: return call('harmonyKey', [Number(args.key) || 0]);
  }
}
function setlistCall(args, dialect) {
  const q = (v) => (dialect === 'ce' ? String(v) : JSON.stringify(String(v)));
  const t = q(String(args.target ?? ''));
  const scene = args.scene === '' || args.scene == null ? '' : args.scene;
  const sc = () => (typeof scene === 'number' || /^\d+$/.test(String(scene)) ? Number(scene) : q(scene));
  const sep = dialect === 'ce' ? ' ' : ', ';
  const call = (name, rest = []) => (dialect === 'ce'
    ? `${name} ${[t, ...rest].join(sep)}`
    : `${name}(${[t, ...rest].join(sep)})`);
  switch (String(args.action ?? 'next')) {
    case 'prev': return call('setlistPrev');
    case 'goto': return call('setlistGoto', [sc()]);
    case 'enable': return call('setlistEnable', [sc(), String(args.enabled !== false)]);
    case 'wrap': return call('setlistWrap', [String(args.wrap !== false)]);
    case 'next':
    default: return call('setlistNext');
  }
}

function ceStep(step) {
  const command = step.command ?? step.cmd;
  const args = step.args ?? {};
  if (command === 'setValue') return `setValue ${args.target} = ${valueText(args.value, 'ce')}`;
  if (command === 'routeValue') return `routeValue ${args.from} -> ${args.to}${args.transform ? ` via ${valueText(args.transform, 'ce')}` : ''}`;
  if (command === 'setPartColor') return `setPartColor ${args.part} = ${args.color}`;
  if (command === 'setState') return `setState ${args.target} = ${args.state}`;
  if (command === 'setVisible') return `setVisible ${args.target} = ${args.visible !== false}`;
  if (command === 'showGroup') return `showGroup ${args.group}`;
  if (command === 'hideGroup') return `hideGroup ${args.group}`;
  if (command === 'setPanelState') return `setPanelState ${args.state}`;
  if (command === 'setAnimation') return `setAnimation ${args.target} ${args.animation} enabled=${args.enabled !== false}`;
  if (command === 'startTimer') return `startTimer ${args.id} ${args.ms}ms`;
  if (command === 'stopTimer') return `stopTimer ${args.id}`;
  if (command === 'emitEvent') return `emitEvent ${args.event} target=${args.target ?? ''} value=${valueText(args.value ?? { ref: 'event.value' }, 'ce')}`;
  if (command === 'panic') return panicStepMessages(args).map((m) => `sendCC channel=${m.channel} cc=${m.cc} value=0`).join('\n  ');
  if (command === 'split') return splitCall(args, 'ce');
  if (command === 'phrase') return phraseCall(args, 'ce');
  if (command === 'recorder') return recorderCall(args, 'ce');
  if (command === 'harmony') return harmonyCall(args, 'ce');
  if (command === 'setlist') return setlistCall(args, 'ce');
  if (command === 'sendCC') return `sendCC channel=${args.channel} cc=${args.cc} value=${valueText(args.value, 'ce')}`;
  if (command === 'sendNRPN') return `sendNRPN channel=${args.channel} param=${args.parameterMsb}/${args.parameterLsb} value=${valueText(args.value, 'ce')}`;
  if (command === 'sendSysex') return `sendSysex bytes=[${(args.bytes ?? []).join(', ')}]`;
  if (command === 'requestDeviceDump') return `requestDeviceDump request=${args.request} profile=${args.profileId ?? ''} role=${args.deviceRole ?? DEFAULT_DEVICE_ROLE}`;
  if (command === 'buildSysex') return `buildSysex bytes=[${(args.bytes ?? []).join(', ')}]`;
  if (command === 'checksum') return `checksum ${args.type} bytes=[${(args.bytes ?? []).join(', ')}]`;
  if (command === 'to14Bit') return `to14Bit ${valueText(args.value, 'ce')}`;
  if (command === 'log') return `log ${JSON.stringify(args.message ?? '')}`;
  return `${command} ${JSON.stringify(args)}`;
}

function emitCe(script) {
  return [
    `on ${script.target ?? 'target'}.${script.event ?? 'changed'}:`,
    ...((script.steps ?? []).map((step) => `  ${ceStep(step)}`)),
  ].join('\n');
}

function emitJsLike(script, target) {
  const jsName = target === 'typescript'
    ? `function ${script.event ?? 'onEvent'}(target: string, event: { value: number; phase?: string }) {`
    : `function ${script.event ?? 'onEvent'}(${script.target ?? 'target'}, event) {`;
  const lines = [jsName, '  const v = event.value;'];
  if (script.condition) lines.push(`  if (!(${valueText(script.condition, target)})) return;`);
  for (const step of script.steps ?? []) {
    const command = step.command ?? step.cmd;
    const args = step.args ?? {};
    if (command === 'setValue') lines.push(`  setValue("${args.target}", ${valueText(args.value, target)});`);
    else if (command === 'routeValue') lines.push(`  setValue("${args.to}", ${args.transform ? valueText(args.transform, target) : `getValue("${args.from}")`});`);
    else if (command === 'setPartColor') lines.push(`  setPartColor("${args.part}", "${args.color}");`);
    else if (command === 'setState') lines.push(`  setState("${args.target}", "${args.state}");`);
    else if (command === 'setVisible') lines.push(`  setVisible("${args.target}", ${args.visible !== false});`);
    else if (command === 'showGroup') lines.push(`  showGroup("${args.group}");`);
    else if (command === 'hideGroup') lines.push(`  hideGroup("${args.group}");`);
    else if (command === 'setPanelState') lines.push(`  setPanelState("${args.state}");`);
    else if (command === 'setAnimation') lines.push(`  setAnimation("${args.target}", "${args.animation}", ${args.enabled !== false});`);
    else if (command === 'startTimer') lines.push(`  startTimer("${args.id}", ${Number(args.ms) || 0});`);
    else if (command === 'stopTimer') lines.push(`  stopTimer("${args.id}");`);
    else if (command === 'emitEvent') lines.push(`  emitEvent("${args.event}", { target: "${args.target ?? ''}", value: ${valueText(args.value ?? { ref: 'event.value' }, target)} });`);
    else if (command === 'panic') { for (const m of panicStepMessages(args)) lines.push(`  sendCC({ channel: ${m.channel}, cc: ${m.cc}, value: 0 });`); }
    else if (command === 'split') lines.push(`  ${splitCall(args, 'js')};`);
    else if (command === 'phrase') lines.push(`  ${phraseCall(args, 'js')};`);
    else if (command === 'recorder') lines.push(`  ${recorderCall(args, 'js')};`);
    else if (command === 'harmony') lines.push(`  ${harmonyCall(args, 'js')};`);
    else if (command === 'setlist') lines.push(`  ${setlistCall(args, 'js')};`);
    else if (command === 'sendCC') lines.push(`  sendCC({ channel: ${args.channel}, cc: ${args.cc}, value: ${valueText(args.value, target)} });`);
    else if (command === 'sendNRPN') lines.push(`  sendNRPN({ channel: ${args.channel}, parameterMsb: ${args.parameterMsb}, parameterLsb: ${args.parameterLsb}, value: ${valueText(args.value, target)} });`);
    else if (command === 'sendSysex') lines.push(`  sendSysex([${(args.bytes ?? []).join(', ')}]);`);
    else if (command === 'requestDeviceDump') lines.push(`  requestDeviceDump({ request: "${args.request ?? ''}", profileId: "${args.profileId ?? ''}", deviceRole: "${args.deviceRole ?? DEFAULT_DEVICE_ROLE}" });`);
    else if (command === 'buildSysex') lines.push(`  const sysexBytes = buildSysex([${(args.bytes ?? []).join(', ')}]);`);
    else if (command === 'checksum') lines.push(`  const checksum = checksumBytes("${args.type}", [${(args.bytes ?? []).join(', ')}]);`);
    else if (command === 'to14Bit') lines.push(`  const value14 = split14Bit(${valueText(args.value, target)});`);
    else if (command === 'log') lines.push(`  trace(${JSON.stringify(args.message ?? 'log')});`);
    else if (command === 'if') lines.push(`  if (!(${valueText(args.condition, target)})) return;`);
    else lines.push(`  // ${command} is not emitted yet`);
  }
  lines.push('}');
  return lines.join('\n');
}

function emitLua(script) {
  const lines = [`function ${script.event ?? 'on_event'}(event)`, '  local v = event.value'];
  if (script.condition) lines.push(`  if not (${luaCondition(script.condition)}) then return end`);
  for (const step of script.steps ?? []) emitLuaStep(step, lines);
  lines.push('end');
  return lines.join('\n');
}

function emitPython(script) {
  const lines = [`def ${script.event ?? 'on_event'}(event):`, '    v = event.value'];
  for (const step of script.steps ?? []) {
    const args = step.args ?? {};
    if (step.command === 'setValue') lines.push(`    set_value("${args.target}", ${valueText(args.value, 'python')})`);
    else if (step.command === 'routeValue') lines.push(`    set_value("${args.to}", ${args.transform ? valueText(args.transform, 'python') : `get_value("${args.from}")`})`);
    else if (step.command === 'set_visible') lines.push(`    set_visible("${args.target}", ${args.visible !== false})`);
    else if (step.command === 'setVisible') lines.push(`    set_visible("${args.target}", ${args.visible !== false})`);
    else if (step.command === 'showGroup') lines.push(`    show_group("${args.group}")`);
    else if (step.command === 'hideGroup') lines.push(`    hide_group("${args.group}")`);
    else if (step.command === 'setPanelState') lines.push(`    set_panel_state("${args.state}")`);
    else if (step.command === 'panic') { for (const m of panicStepMessages(args)) lines.push(`    send_cc(channel=${m.channel}, cc=${m.cc}, value=0)`); }
    else if (step.command === 'sendCC') lines.push(`    send_cc(channel=${args.channel}, cc=${args.cc}, value=${valueText(args.value, 'python')})`);
    else if (step.command === 'sendNRPN') lines.push(`    send_nrpn(channel=${args.channel}, parameter_msb=${args.parameterMsb}, parameter_lsb=${args.parameterLsb}, value=${valueText(args.value, 'python')})`);
    else if (step.command === 'sendSysex') lines.push(`    send_sysex([${(args.bytes ?? []).join(', ')}])`);
    else if (step.command === 'requestDeviceDump') lines.push(`    request_device_dump(request="${args.request ?? ''}", profile_id="${args.profileId ?? ''}", device_role="${args.deviceRole ?? DEFAULT_DEVICE_ROLE}")`);
    else lines.push(`    # ${ceStep(step)}`);
  }
  return lines.join('\n');
}

function hexByte(byte) {
  return `0x${Number(byte).toString(16).padStart(2, '0').toUpperCase()}`;
}

function nativeNumber(value, target) {
  if (Number.isInteger(value) && ['kotlin', 'rust', 'swift'].includes(target)) return `${value}.0`;
  return String(value);
}

function functionNameFromEvent(script, target) {
  const raw = String(script?.event ?? 'onEvent').replace(/[^a-zA-Z0-9_]/g, '_');
  if (target === 'rust') return raw.replace(/[A-Z]/g, (letter, index) => `${index ? '_' : ''}${letter.toLowerCase()}`);
  if (target === 'go' || target === 'csharp') return raw.charAt(0).toUpperCase() + raw.slice(1);
  return raw;
}

function nativeConfig(target, script) {
  const name = functionNameFromEvent(script, target);
  const configs = {
    cpp: {
      signature: `void ${name}(CeContext& ctx, const CeEvent& event)`,
      eventValue: 'event.value',
      valueDecl: (eventValue) => `const double v = ${eventValue};`,
      lineEnd: ';',
      setValue: 'ctx.setValue',
      getValue: 'ctx.getValue',
      setVisible: 'ctx.setVisible',
      showGroup: 'ctx.showGroup',
      hideGroup: 'ctx.hideGroup',
      setPanelState: 'ctx.setPanelState',
      setPartColor: 'ctx.setPartColor',
      setAnimation: 'ctx.setAnimation',
      startTimer: 'ctx.startTimer',
      stopTimer: 'ctx.stopTimer',
      emitEvent: 'ctx.emitEvent',
      sendCC: 'ctx.midi().sendCC',
      sendNRPN: 'ctx.midi().sendNRPN',
      sendSysex: 'ctx.midi().sendSysex',
      requestDeviceDump: 'ctx.device().requestDump',
      buildSysex: 'ctx.midi().buildSysex',
      checksum: 'ctx.midi().checksum',
      to14Bit: 'ctx.midi().to14Bit',
      log: 'ctx.trace',
      scale: 'ce::scale',
      clamp: 'ce::clamp',
      curve: 'ce::curve',
      round: (value) => `std::lround(${value})`,
      bytes: (bytes) => `{ ${(bytes ?? []).map(hexByte).join(', ')} }`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `auto ${name} = ${value};`,
    },
    csharp: {
      signature: `void ${name}(CeEvent evt)`,
      eventValue: 'evt.Value',
      valueDecl: (eventValue) => `var v = ${eventValue};`,
      lineEnd: ';',
      setValue: 'SetValue',
      getValue: 'GetValue',
      setVisible: 'SetVisible',
      showGroup: 'ShowGroup',
      hideGroup: 'HideGroup',
      setPanelState: 'SetPanelState',
      setPartColor: 'SetPartColor',
      setAnimation: 'SetAnimation',
      startTimer: 'StartTimer',
      stopTimer: 'StopTimer',
      emitEvent: 'EmitEvent',
      sendCC: 'SendCC',
      sendNRPN: 'SendNRPN',
      sendSysex: 'SendSysex',
      requestDeviceDump: 'RequestDeviceDump',
      buildSysex: 'BuildSysex',
      checksum: 'Checksum',
      to14Bit: 'To14Bit',
      log: 'Trace',
      scale: 'Scale',
      clamp: 'Clamp',
      curve: 'Curve',
      round: (value) => `(int)Math.Round(${value})`,
      bytes: (bytes) => `new byte[] { ${(bytes ?? []).map(hexByte).join(', ')} }`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `var ${name} = ${value};`,
    },
    swift: {
      signature: `func ${name}(_ event: CeEvent)`,
      eventValue: 'event.value',
      valueDecl: (eventValue) => `let _ = ${eventValue}`,
      lineEnd: '',
      setValue: 'setValue',
      getValue: 'getValue',
      setVisible: 'setVisible',
      showGroup: 'showGroup',
      hideGroup: 'hideGroup',
      setPanelState: 'setPanelState',
      setPartColor: 'setPartColor',
      setAnimation: 'setAnimation',
      startTimer: 'startTimer',
      stopTimer: 'stopTimer',
      emitEvent: 'emitEvent',
      sendCC: 'sendCC',
      sendNRPN: 'sendNRPN',
      sendSysex: 'sendSysex',
      requestDeviceDump: 'requestDeviceDump',
      buildSysex: 'buildSysex',
      checksum: 'checksum',
      to14Bit: 'to14Bit',
      log: 'trace',
      scale: 'scale',
      clamp: 'clamp',
      curve: 'curve',
      round: (value) => `Int(round(${value}))`,
      bytes: (bytes) => `[${(bytes ?? []).map(hexByte).join(', ')}]`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `let ${name} = ${value}`,
    },
    go: {
      signature: `func ${name}(event ce.Event)`,
      eventValue: 'event.Value',
      valueDecl: (eventValue) => `_ = ${eventValue}`,
      lineEnd: '',
      setValue: 'ce.SetValue',
      getValue: 'ce.GetValue',
      setVisible: 'ce.SetVisible',
      showGroup: 'ce.ShowGroup',
      hideGroup: 'ce.HideGroup',
      setPanelState: 'ce.SetPanelState',
      setPartColor: 'ce.SetPartColor',
      setAnimation: 'ce.SetAnimation',
      startTimer: 'ce.StartTimer',
      stopTimer: 'ce.StopTimer',
      emitEvent: 'ce.EmitEvent',
      sendCC: 'midi.SendCC',
      sendNRPN: 'midi.SendNRPN',
      sendSysex: 'midi.SendSysex',
      requestDeviceDump: 'device.RequestDump',
      buildSysex: 'midi.BuildSysex',
      checksum: 'midi.Checksum',
      to14Bit: 'midi.To14Bit',
      log: 'ce.Trace',
      scale: 'ce.Scale',
      clamp: 'ce.Clamp',
      curve: 'ce.Curve',
      round: (value) => `int(math.Round(${value}))`,
      bytes: (bytes) => `[]byte{${(bytes ?? []).map(hexByte).join(', ')}}`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `${name} := ${value}`,
    },
    kotlin: {
      signature: `fun ${name}(event: CeEvent)`,
      eventValue: 'event.value',
      valueDecl: (eventValue) => `@Suppress("UNUSED_VARIABLE")\n  val v = ${eventValue}`,
      lineEnd: '',
      setValue: 'setValue',
      getValue: 'getValue',
      setVisible: 'setVisible',
      showGroup: 'showGroup',
      hideGroup: 'hideGroup',
      setPanelState: 'setPanelState',
      setPartColor: 'setPartColor',
      setAnimation: 'setAnimation',
      startTimer: 'startTimer',
      stopTimer: 'stopTimer',
      emitEvent: 'emitEvent',
      sendCC: 'sendCC',
      sendNRPN: 'sendNRPN',
      sendSysex: 'sendSysex',
      requestDeviceDump: 'requestDeviceDump',
      buildSysex: 'buildSysex',
      checksum: 'checksum',
      to14Bit: 'to14Bit',
      log: 'trace',
      scale: 'scale',
      clamp: 'clamp',
      curve: 'curve',
      round: (value) => `round(${value}).toInt()`,
      bytes: (bytes) => `byteArrayOf(${(bytes ?? []).map((byte) => `${hexByte(byte)}.toByte()`).join(', ')})`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `val ${name} = ${value}`,
    },
    rust: {
      signature: `fn ${name}(ctx: &mut ce::Context, event: ce::Event)`,
      eventValue: 'event.value',
      valueDecl: (eventValue) => `let _ = ${eventValue};`,
      lineEnd: ';',
      setValue: 'ctx.set_value',
      getValue: 'ctx.value',
      setVisible: 'ctx.set_visible',
      showGroup: 'ctx.show_group',
      hideGroup: 'ctx.hide_group',
      setPanelState: 'ctx.set_panel_state',
      setPartColor: 'ctx.set_part_color',
      setAnimation: 'ctx.set_animation',
      startTimer: 'ctx.start_timer',
      stopTimer: 'ctx.stop_timer',
      emitEvent: 'ctx.emit_event',
      sendCC: 'ctx.midi().send_cc',
      sendNRPN: 'ctx.midi().send_nrpn',
      sendSysex: 'ctx.midi().send_sysex',
      requestDeviceDump: 'ctx.device().request_dump',
      buildSysex: 'ctx.midi().build_sysex',
      checksum: 'ctx.midi().checksum',
      to14Bit: 'ctx.midi().to_14_bit',
      log: 'ctx.trace',
      scale: 'ce::scale',
      clamp: 'ce::clamp',
      curve: 'ce::curve',
      round: (value) => `(${value}).round() as i32`,
      bytes: (bytes) => `&[${(bytes ?? []).map(hexByte).join(', ')}]`,
      bool: (value) => value ? 'true' : 'false',
      string: (value) => JSON.stringify(String(value ?? '')),
      declare: (name, value) => `let ${name} = ${value};`,
    },
  };
  return configs[target] ?? configs.cpp;
}

function nativeExpression(value, cfg, target) {
  if (value == null) return 'null';
  if (typeof value === 'number') return nativeNumber(value, target);
  if (typeof value === 'boolean') return cfg.bool(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return cfg.bytes(value);
  if (typeof value !== 'object') return String(value);
  if (value.ref) {
    const ref = String(value.ref);
    if (ref === 'event.value') return cfg.eventValue;
    return `${cfg.getValue}(${cfg.string(ref)})`;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'literal')) {
    return typeof value.literal === 'string' ? cfg.string(value.literal) : nativeExpression(value.literal, cfg, target);
  }
  const op = String(value.op ?? '');
  const args = Array.isArray(value.args) ? value.args.map((arg) => nativeExpression(arg, cfg, target)) : [];
  if (['*', '+', '-', '/'].includes(op)) return `(${args.join(` ${op} `)})`;
  if (['>', '>=', '<', '<=', '==', '!='].includes(op)) return `(${args.join(` ${op} `)})`;
  if (op === 'equals') return `(${args[0] ?? '0'} == ${args[1] ?? '0'})`;
  if (op === 'notEquals') return `(${args[0] ?? '0'} != ${args[1] ?? '0'})`;
  if (op === 'and') return `(${args.join(' && ')})`;
  if (op === 'or') return `(${args.join(' || ')})`;
  if (op === 'not') return `(!${args[0] ?? 'false'})`;
  if (op === 'round') return cfg.round(args[0] ?? '0');
  if (op === 'scale') return `${cfg.scale}(${args.join(', ')})`;
  if (op === 'clamp') return `${cfg.clamp}(${args.join(', ')})`;
  if (op === 'curve') return `${cfg.curve}(${args[0] ?? '0'}, ${value.from ?? args[1] ?? 0}, ${value.to ?? args[2] ?? 1}, ${cfg.string(value.shape ?? 'linear')})`;
  if (op === 'to14Bit' || op === 'split14bit') return `${cfg.to14Bit}(${args.join(', ')})`;
  return valueText(value, target);
}

function emitNative(script, target) {
  const cfg = nativeConfig(target, script);
  const lines = [`${cfg.signature} {`, `  ${cfg.valueDecl(cfg.eventValue)}`];
  if (script.condition) lines.push(`  if (!(${nativeExpression(script.condition, cfg, target)})) return${cfg.lineEnd}`);
  for (const step of script.steps ?? []) {
    const args = step.args ?? {};
    if (step.command === 'setValue') lines.push(`  ${cfg.setValue}(${cfg.string(args.target)}, ${nativeExpression(args.value, cfg, target)})${cfg.lineEnd}`);
    else if (step.command === 'routeValue') lines.push(`  ${cfg.setValue}(${cfg.string(args.to)}, ${args.transform ? nativeExpression(args.transform, cfg, target) : `${cfg.getValue}(${cfg.string(args.from)})`})${cfg.lineEnd}`);
    else if (step.command === 'setVisible') lines.push(`  ${cfg.setVisible}(${cfg.string(args.target)}, ${cfg.bool(args.visible !== false)})${cfg.lineEnd}`);
    else if (step.command === 'showGroup') lines.push(`  ${cfg.showGroup}(${cfg.string(args.group)})${cfg.lineEnd}`);
    else if (step.command === 'hideGroup') lines.push(`  ${cfg.hideGroup}(${cfg.string(args.group)})${cfg.lineEnd}`);
    else if (step.command === 'setPanelState') lines.push(`  ${cfg.setPanelState}(${cfg.string(args.state)})${cfg.lineEnd}`);
    else if (step.command === 'setPartColor') lines.push(`  ${cfg.setPartColor}(${cfg.string(args.part)}, ${cfg.string(args.color)})${cfg.lineEnd}`);
    else if (step.command === 'setAnimation') lines.push(`  ${cfg.setAnimation}(${cfg.string(args.target)}, ${cfg.string(args.animation)}, ${cfg.bool(args.enabled !== false)})${cfg.lineEnd}`);
    else if (step.command === 'startTimer') lines.push(`  ${cfg.startTimer}(${cfg.string(args.id)}, ${Number(args.ms) || 0})${cfg.lineEnd}`);
    else if (step.command === 'stopTimer') lines.push(`  ${cfg.stopTimer}(${cfg.string(args.id)})${cfg.lineEnd}`);
    else if (step.command === 'emitEvent') lines.push(`  ${cfg.emitEvent}(${cfg.string(args.event)}, ${cfg.string(args.target ?? '')}, ${nativeExpression(args.value ?? { ref: 'event.value' }, cfg, target)})${cfg.lineEnd}`);
    else if (step.command === 'panic') { for (const m of panicStepMessages(args)) lines.push(`  ${cfg.sendCC}(${m.channel}, ${m.cc}, 0)${cfg.lineEnd}`); }
    else if (step.command === 'sendCC') lines.push(`  ${cfg.sendCC}(${Number(args.channel) || 1}, ${Number(args.cc) || 0}, ${nativeExpression(args.value, cfg, target)})${cfg.lineEnd}`);
    else if (step.command === 'sendNRPN') lines.push(`  ${cfg.sendNRPN}(${Number(args.channel) || 1}, ${Number(args.parameterMsb) || 0}, ${Number(args.parameterLsb) || 0}, ${nativeExpression(args.value, cfg, target)})${cfg.lineEnd}`);
    else if (step.command === 'sendSysex') lines.push(`  ${cfg.sendSysex}(${cfg.bytes(args.bytes ?? [])})${cfg.lineEnd}`);
    else if (step.command === 'requestDeviceDump') lines.push(`  ${cfg.requestDeviceDump}(${cfg.string(args.request ?? '')}, ${cfg.string(args.profileId ?? '')}, ${cfg.string(args.deviceRole ?? DEFAULT_DEVICE_ROLE)})${cfg.lineEnd}`);
    else if (step.command === 'buildSysex') lines.push(`  ${cfg.declare('sysexBytes', `${cfg.buildSysex}(${cfg.bytes(args.bytes ?? [])})`)}`);
    else if (step.command === 'checksum') lines.push(`  ${cfg.declare('checksum', `${cfg.checksum}(${cfg.string(args.type)}, ${cfg.bytes(args.bytes ?? [])})`)}`);
    else if (step.command === 'to14Bit') lines.push(`  ${cfg.declare('value14', `${cfg.to14Bit}(${nativeExpression(args.value, cfg, target)})`)}`);
    else if (step.command === 'log') lines.push(`  ${cfg.log}(${cfg.string(args.message ?? 'log')}, ${nativeExpression(args.value ?? { ref: 'event.value' }, cfg, target)})${cfg.lineEnd}`);
    else if (step.command === 'if') lines.push(`  if (!(${nativeExpression(args.condition, cfg, target)})) return${cfg.lineEnd}`);
    else lines.push(`  // ${ceStep(step)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function emitHtml(script) {
  return `<section data-ce-script="${script.id}">\n${indent(emitCe(script), 2)}\n</section>`;
}

function emitCss(script) {
  return `.ce-script-${script.id} {\n  --script-event: "${script.event}";\n  --script-target: "${script.target}";\n}`;
}

// Every code target knows sendCC and nothing else, so `panic` is emitted as the
// CC sequence it stands for rather than as a call no host would define. Keeps
// the command export-safe on all of them.
function panicStepMessages(args) {
  return panicCcMessages({
    scope: args?.scope, channel: args?.channel, resetControllers: args?.resetControllers !== false,
  });
}

export function exportWarningsForScript(script) {
  const warnings = [];
  const seen = new Set();
  const addWarning = (message) => {
    if (seen.has(message)) return;
    seen.add(message);
    warnings.push(message);
  };
  for (const step of script?.steps ?? []) {
    const descriptor = commandDescriptor(step.command ?? step.cmd);
    if (!descriptor) addWarning(`${step.command ?? step.cmd} is unknown and cannot be exported safely.`);
    else if (descriptor.portable === false) addWarning(`${descriptor.label} uses device-specific behavior.`);
    else if (descriptor.exportSafe === false) addWarning(`${descriptor.label} is runtime-only and may not export cleanly.`);
  }
  return warnings;
}

export function emitScript(script, targetId = 'ce') {
  const target = SCRIPT_TARGETS.find((item) => item.id === targetId) ?? SCRIPT_TARGETS[0];
  if (target.id === 'json') return JSON.stringify(script, null, 2);
  if (target.id === 'ce') return emitCe(script);
  if (target.id === 'javascript' || target.id === 'typescript') return emitJsLike(script, target.id);
  if (target.id === 'lua') return emitLua(script);
  if (target.id === 'python') return emitPython(script);
  if (['cpp', 'csharp', 'swift', 'go', 'kotlin', 'rust'].includes(target.id)) return emitNative(script, target.id);
  if (target.id === 'html') return emitHtml(script);
  if (target.id === 'css') return emitCss(script);
  return emitCe(script);
}

export function buildExportSummary(script) {
  const portability = portabilityForScript(script);
  return {
    portability,
    warnings: exportWarningsForScript(script),
    targets: SCRIPT_TARGETS.map((target) => ({ ...target, code: emitScript(script, target.id) })),
  };
}
