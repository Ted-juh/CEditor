import { getCustomArpeggiator, syncCustomArpeggiatorValues, revealArpeggiatorNote } from './customComponentArpeggiator.js';
import { gaiaPatternFingerprint, gaiaExpectedArpValues } from './gaiaSyncStatus.js';

export const hasGaiaPatternEditing = control => control?._children?.Designer?.patternEditing?.kind === 'gaia';
const clone = value => JSON.parse(JSON.stringify(value));
export function patternSnapshot(control, values) {
  return { __arpeggiator: getCustomArpeggiator(control, values), arpEndStep: values.arpEndStep ?? 32,
    __arpPatternSource: values.__arpPatternSource ?? null };
}
const signature = snap => JSON.stringify([gaiaPatternFingerprint(snap.__arpeggiator.blocks), snap.arpEndStep, snap.__arpPatternSource]);

/** Per-grid history, coalesced for a complete pointer gesture. Selection alone is not an edit. */
export class GaiaPatternHistory {
  undo = []; redo = []; gesture = false; revision = 0;
  record(control, before, after, dragging = false) {
    const previous = patternSnapshot(control, before), next = patternSnapshot(control, after);
    if (signature(previous) !== signature(next)) {
      if (!this.gesture) { this.undo.push(clone(previous)); this.undo = this.undo.slice(-100); }
      this.redo = []; this.revision++;
      this.gesture = dragging;
    }
    if (!dragging) this.gesture = false;
  }
  restore(direction, control, values) {
    const from = direction === 'undo' ? this.undo : this.redo;
    const to = direction === 'undo' ? this.redo : this.undo;
    if (!from.length) return null;
    to.push(clone(patternSnapshot(control, values)));
    this.gesture = false; this.revision++;
    return syncCustomArpeggiatorValues(control, { ...values, ...from.pop() });
  }
  flags() { return { undo: this.undo.length > 0, redo: this.redo.length > 0 }; }
}

export function editSelectedPatternNote(control, values, action) {
  const arp = getCustomArpeggiator(control, values);
  const selected = arp.blocks.find(b => b.id === arp.selectedBlock);
  if (!selected) return { error: 'Select a note first.' };
  let blocks, selectedBlock;
  if (action === 'delete') {
    blocks = arp.blocks.filter(b => b.id !== selected.id);
    selectedBlock = blocks[0]?.id ?? '';
  } else {
    const candidates = Array.from({ length: arp.stepCount }, (_, i) => (selected.step + selected.length + i) % arp.stepCount);
    const step = candidates.find(s => s + selected.length <= arp.stepCount && !arp.blocks.some(b =>
      b.note === selected.note && s < b.step + b.length && s + selected.length > b.step));
    if (step == null) return { error: 'No free space for a same-pitch copy; shorten or move the note first.' };
    let index = 1;
    while (arp.blocks.some(b => b.id === `arp_copy_${index}`)) index++;
    selectedBlock = `arp_copy_${index}`;
    blocks = [...arp.blocks, { ...selected, id: selectedBlock, step }];
  }
  const next = { ...arp, blocks, selectedBlock }, active = blocks.find(b => b.id === selectedBlock);
  return { values: syncCustomArpeggiatorValues(control, { ...values, __arpeggiator: active ? revealArpeggiatorNote(next, active.note) : next }) };
}

export const gaiaPatternReadGroups = [
  { request: 'requestArpeggioCommon', ids: ['arp.endStep'] },
  ...Array.from({ length: 16 }, (_, i) => ({ request: `requestArpPattern${i + 1}`,
    ids: [`arpPattern.note${i + 1}.originalNote`, ...Array.from({ length: 32 }, (_, s) => `arpPattern.note${i + 1}.step${s + 1}Data`)] })),
];

/** Decode only a complete, valid snapshot. No guessed velocity for orphan/wrapping ties. */
export function decodeGaiaPattern(raw) {
  for (const { ids } of gaiaPatternReadGroups) for (const id of ids) {
    const value = raw[id];
    const valid = Number.isInteger(value) && (id === 'arp.endStep' ? value >= 1 && value <= 32 : value >= 0 && value <= 128);
    if (!valid) throw new Error(`Incomplete or invalid pattern: ${id}`);
  }
  const blocks = [];
  for (let lane = 1; lane <= 16; lane++) {
    const prefix = `arpPattern.note${lane}`, note = raw[`${prefix}.originalNote`];
    if (note === 128) continue;
    let active = null;
    for (let step = 0; step < 32; step++) {
      const value = raw[`${prefix}.step${step + 1}Data`];
      if (value === 128) {
        if (!active) throw new Error(`Lane ${lane} has an orphan/wrapping tie at step ${step + 1}; editor left unchanged.`);
        active.length++;
      } else if (value) {
        active = { id: `gaia_read_${lane}_${step}`, note, step, length: 1, velocity: value };
        blocks.push(active);
      } else active = null;
    }
  }
  return { blocks, endStep: raw['arp.endStep'], source: { kind: 'hardware', fingerprint: gaiaPatternFingerprint(blocks), raw: { ...raw } } };
}

export function patternValuesForSend(control, values) {
  const arp = getCustomArpeggiator(control, values);
  // An untouched import retains the exact hardware lane ordering and unused lane data.
  if (values.__arpPatternSource?.fingerprint === gaiaPatternFingerprint(arp.blocks) && values.__arpPatternSource?.raw) {
    decodeGaiaPattern(values.__arpPatternSource.raw);
    return { ...values.__arpPatternSource.raw, 'arp.endStep': values.arpEndStep ?? 32 };
  }
  const { expected, dropped } = gaiaExpectedArpValues(control, values);
  if (dropped.length) throw new Error('Not sent: GAIA supports at most 16 distinct pitches.');
  for (let i = 0; i < arp.blocks.length; i++) for (const other of arp.blocks.slice(i + 1)) {
    const b = arp.blocks[i];
    if (b.note === other.note && b.step < other.step + other.length && b.step + b.length > other.step)
      throw new Error('Not sent: same-pitch notes overlap. Move or shorten them first.');
  }
  return expected;
}

export function patternEditingShortcut(event) {
  if (event.altKey) return '';
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    if (key === 'd') return 'duplicate';
  } else if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
  return '';
}
