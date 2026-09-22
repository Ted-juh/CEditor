import { flatControls } from './containment.js';
import { customLcdInfo } from './customLcdInfo.js';

export function parameterStatusDesignModel(controls) {
  const items = flatControls(controls ?? []).flatMap(control => {
    const s = control._children, binding = s.DeviceBindings?.bindings?.find(b => b.kind === 'deviceParameter');
    const channel = s.ValueChannels?._children?.[binding?.port], info = customLcdInfo(control);
    if (!binding || !channel || !info) return [];
    return [{ id: s.Core.id, parameterId: binding.parameterId, title: info.name.replace(/^TONE \d+\s*\/\s*/i, ''),
      value: channel.currentValue ?? channel.defaultValue, min: channel.min ?? 0, max: channel.max ?? 127, step: 1,
      displayValue: info.text, displayNumber: info.value, displayMin: info.min, displayMax: info.max,
      choices: s.Designer?.lcdReadout?.choices ?? [], group: parameterGroup(binding.parameterId), accent: parameterAccent(binding.parameterId),
      disabled: true, feedback: {text:'DESIGN PREVIEW',colour:'#9cabb9'} }];
  });
  return { items, activeId: items.find(i=>i.parameterId==='tone1.filter.cutoff')?.id ?? items[0]?.id,
    recent: [], graphs: [], ui: {}, select() {}, write() {}, updateUi() {}, design: true };
}

export function parameterGroup(parameterId = '') {
  const parts = parameterId.split('.');
  return /^tone\d$/.test(parts[0]) ? parts.slice(0, 2).join('.') : parts[0];
}

export function parameterFeedback(binding, value, feedback = {}) {
  const state = feedback[binding?.deviceRole] ?? {};
  const read = state.received?.[binding?.parameterId], write = state.writes?.[binding?.parameterId];
  const canonical = value => ['true','on'].includes(String(value).toLowerCase()) ? 1
    : ['false','off'].includes(String(value).toLowerCase()) ? 0 : value;
  const same = (left, right) => { const a=canonical(left), b=canonical(right);
    return String(a) === String(b) || (a !== '' && b !== '' && Number.isFinite(Number(a)) && Number(a) === Number(b)); };
  if (write?.state === 'error' && (!read || read.sequence < write.sequence)) return { text: 'SEND ERROR', colour: '#ff8585', detail: write.error };
  if (read && same(read.value, value) && (!write || read.sequence > write.sequence)) return { text: 'HARDWARE CONFIRMED', colour: '#83d6a2' };
  if (write || read) return { text: 'LOCAL / UNCONFIRMED', colour: '#edc36e' };
  return { text: 'NOT READ FROM SYNTH', colour: '#9cabb9' };
}

export function parameterAccent(id = '') {
  return id.startsWith('tone1.') ? '#76c9ff' : id.startsWith('tone2.') ? '#c3a1ff'
    : id.startsWith('tone3.') ? '#6cdec8' : '#eac571';
}
