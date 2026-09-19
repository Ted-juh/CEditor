import { getCustomArpeggiator, syncCustomArpeggiatorValues, noteNameFromMidi, revealArpeggiatorNote, selectArpeggiatorNote } from './customComponentArpeggiator.js';
import { snapCustomChannelValue, normalizeCustomChannelValue } from './customComponentInteraction.js';
import { displayScale, toDisplay, fromDisplay } from './valueDisplayScale.js';

export function customNumericFields(control, values = {}) {
  const fields = {};
  const parts = Object.values(control?._children?.Parts?._children ?? {});
  const part = parts.find(p => p.role === 'customValueField');
  const channel = control?._children?.ValueChannels?._children?.value;
  if (part && channel) {
    const raw = values.value ?? channel.currentValue ?? channel.defaultValue;
    const scale = displayScale(channel.format, channel.min, channel.max);
    fields.customValueField = {
      value: part.meta?.zeroLabel && Number(raw) === 0 ? part.meta.zeroLabel : String(toDisplay(scale, raw)),
      ariaLabel: `${control._children.Core.name} value`,
      channel, scale, zeroLabel: part.meta?.zeroLabel,
    };
  }
  if (control?._children?.Designer?.arpeggiator?.numericFields) {
    const arp = getCustomArpeggiator(control, values);
    const block = arp.blocks.find(b => b.id === arp.selectedBlock);
    fields.arpPitchField = { value: block ? noteNameFromMidi(block.note) : '—', ariaLabel: 'Selected note pitch (note name or MIDI number)', inputMode: 'text', disabled: !block, blockId: block?.id };
    fields.arpStartField = { value: block ? String(block.step + 1) : '—', ariaLabel: 'Selected note start step', disabled: !block, blockId: block?.id };
    fields.arpLengthField = { value: block ? String(block.length) : '—', ariaLabel: 'Selected note length in steps', disabled: !block, blockId: block?.id };
    fields.arpVelocityField = { value: block ? String(block.velocity) : '—', ariaLabel: 'Selected note velocity', disabled: !block, blockId: block?.id };
  }
  return fields;
}

function pitchNumber(text) {
  const match = /^([a-g])([#b♯♭]?)(-?\d+)$/i.exec(text);
  if (!match) return Number(text);
  const accidental = ['#', '♯'].includes(match[2]) ? 1 : ['b', '♭'].includes(match[2].toLowerCase()) ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()] + accidental;
}

export function customNumericPatch(control, values, role, input, expectedBlockId) {
  const field = customNumericFields(control, values)[role];
  if (!field || field.disabled) return null;
  const text = String(input).trim();
  const n = role === 'arpPitchField' ? pitchNumber(text) : field.zeroLabel && text.toUpperCase() === field.zeroLabel ? 0 : Number(text);
  if (!text || !Number.isFinite(n)) return null;
  if (role === 'customValueField') {
    const value = snapCustomChannelValue(field.channel, fromDisplay(field.scale, n));
    return { customValues: { ...values, value }, customNormalizedValue: normalizeCustomChannelValue(field.channel, value), valueOverrideEnabled: true, valueOverride: value };
  }
  // A selection changed while typing must never apply an old draft to a different note.
  if (expectedBlockId !== field.blockId) return null;
  const arp = getCustomArpeggiator(control, values);
  const blocks = arp.blocks.map(b => {
    if (b.id !== field.blockId) return b;
    if (role === 'arpPitchField') return { ...b, note: Math.max(0, Math.min(127, Math.round(n))) };
    // Preserve duration when moving: clamp the start, never silently shorten a note.
    if (role === 'arpStartField') return { ...b, step: Math.max(0, Math.min(arp.stepCount - b.length, Math.round(n) - 1)) };
    if (role === 'arpLengthField') return { ...b, length: Math.max(1, Math.min(arp.stepCount - b.step, Math.round(n))) };
    return { ...b, velocity: Math.max(1, Math.min(127, Math.round(n))) };
  });
  const updated = revealArpeggiatorNote({ ...arp, blocks }, blocks.find(b => b.id === field.blockId).note);
  return { customValues: syncCustomArpeggiatorValues(control, { ...values, __arpeggiator: updated }) };
}

/** Only the focused grid owns these shortcuts; text inputs keep their normal caret/Tab keys. */
export function customArpeggiatorKeyPatch(control, values, event) {
  if (!control?._children?.Designer?.arpeggiator?.numericFields || event.ctrlKey || event.metaKey || event.altKey) return null;
  const arp = getCustomArpeggiator(control, values);
  const direction = { '[': 'previous', ']': 'next', Home: 'first', End: 'last' }[event.key];
  if (direction) return { customValues: syncCustomArpeggiatorValues(control, { ...values, __arpeggiator: selectArpeggiatorNote(arp, direction) }) };
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return null;
  const block = arp.blocks.find(b => b.id === arp.selectedBlock);
  if (!block) return {};
  const pitch = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  const delta = (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * (pitch && event.shiftKey ? 12 : 1);
  return customNumericPatch(control, values, pitch ? 'arpPitchField' : 'arpStartField', (pitch ? block.note : block.step + 1) + delta, block.id);
}
