import { flatControls } from './containment.js';
import { customLcdInfo } from './customLcdInfo.js';

/**
 * The device-parameter bindings a Parameter Editor lists for one control, each with its item id.
 *
 * The first binding keeps the control's own id — every existing item, focus and recent list is keyed
 * by it, so nothing that works today changes. A custom component's FURTHER bindings, each on a channel
 * of its own, get `controlId::channel`: until these existed a component with `cutoff` and `resonance`
 * bound to two synth parameters listed only the first, though it drives (and exports) both.
 */
export function parameterEntries(control) {
  const s = control?._children;
  const id = String(s?.Core?.id ?? '');
  const bindings = (s?.DeviceBindings?.bindings ?? []).filter((b) => b?.kind === 'deviceParameter');
  if (!id || !bindings.length) return [];
  const out = [{ id, binding: bindings[0] }];
  const channels = s?.ValueChannels?._children;
  if (!channels) return out;
  const seen = new Set([String(bindings[0].port ?? '')]);
  for (const binding of bindings.slice(1)) {
    const port = String(binding.port ?? '');
    if (!port || seen.has(port) || !channels[port]) continue;
    seen.add(port);
    out.push({ id: `${id}::${port}`, binding });
  }
  return out;
}

/** `ctrl_7::resonance` → { controlId: 'ctrl_7', port: 'resonance' }; a plain id has no port. */
export function splitParameterItemId(itemId) {
  const text = String(itemId ?? '');
  const at = text.indexOf('::');
  return at < 0 ? { controlId: text, port: '' } : { controlId: text.slice(0, at), port: text.slice(at + 2) };
}

/** The binding an item id names on this control, or null. */
export function parameterBindingFor(control, itemId) {
  return parameterEntries(control).find((entry) => entry.id === String(itemId ?? ''))?.binding ?? null;
}

export function parameterStatusDesignModel(controls) {
  const items = flatControls(controls ?? []).flatMap(control => {
    const s = control._children, info = customLcdInfo(control);
    return parameterEntries(control).flatMap(({ id, binding }, index) => {
      const channel = s.ValueChannels?._children?.[binding?.port];
      if (!channel || !info) return [];
      const value = channel.currentValue ?? channel.defaultValue;
      // The component's own readout describes its first parameter; a further channel speaks for itself.
      const own = index === 0;
      return [{ id, parameterId: binding.parameterId,
        title: own ? info.name.replace(/^TONE \d+\s*\/\s*/i, '') : String(channel.label || binding.port),
        value, min: channel.min ?? 0, max: channel.max ?? 127, step: 1,
        displayValue: own ? info.text : String(value ?? ''), displayNumber: own ? info.value : Number(value),
        displayMin: own ? info.min : (channel.min ?? 0), displayMax: own ? info.max : (channel.max ?? 127),
        choices: own ? (s.Designer?.lcdReadout?.choices ?? []) : [], group: parameterGroup(binding.parameterId), accent: parameterAccent(binding.parameterId),
        disabled: true, feedback: {text:'DESIGN PREVIEW',colour:'#9cabb9'} }];
    });
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
