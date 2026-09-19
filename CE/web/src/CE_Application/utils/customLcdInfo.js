// A custom instrument's main channel is not a native Behavior range. LCD readouts
// must read its preview channel (including inbound MIDI), not a fabricated zero.
export function formatLcdInfo(info, meta = {}) {
  if (!info) return info;
  if (meta.label) info = { ...info, name: meta.label };
  if (meta.display && !meta.choices?.length && info.max !== info.min) {
    const { min, max, precision = 0, unit = '' } = meta.display;
    const value = min + (info.value - info.min) / (info.max - info.min) * (max - min);
    return { ...info, min, max, value, text: value.toFixed(precision) + (unit ? ' ' + unit : '') };
  }
  return info;
}
export function customLcdInfo(control, values = {}) {
  if (control?._children?.Core?.controlType !== 'CustomComponent') return null;
  const channels = control?._children?.ValueChannels?._children;
  if (!channels) return null;
  const meta = control._children.Designer?.lcdReadout ?? {};
  const key = meta.channel ?? (channels.mainValue ? 'mainValue' : Object.keys(channels)[0]);
  const channel = channels[key];
  if (!channel || channel.type === 'array') return null;
  const value = Number(values[key] ?? channel.currentValue ?? channel.defaultValue);
  if (!Number.isFinite(value)) return null;
  const choice = meta.choices?.find(row => Number(row.value) === value);
  const boolean = channel.type === 'bool';
  const text = choice ? choice.label : boolean ? (value ? 'On' : 'Off')
    : meta.special?.[value] ?? String(value + Number(meta.offset ?? 0)) + (channel.format?.unit ? ' ' + channel.format.unit : '');
  return formatLcdInfo({ present: true, name: meta.label ?? control._children.Core.name,
    value: value + Number(meta.offset ?? 0), min: Number(channel.min ?? 0) + Number(meta.offset ?? 0),
    max: Number(channel.max ?? 127) + Number(meta.offset ?? 0), text, on: value !== 0, selector: String(value),
    address: control._children.DeviceBindings?.bindings?.find(b => b.port === key)?.parameterId ?? '',
    kind: meta.choices?.length ? 'choice' : boolean ? 'switch' : 'value' }, meta);
}
