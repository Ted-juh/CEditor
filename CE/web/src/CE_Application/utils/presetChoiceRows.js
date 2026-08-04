// Preset choice rows: turn a device profile's preset model (profile.presets) — and optionally a
// live preset-list scan — into the Value-row shape every selector (Listbox, Combobox, radio,
// cascading) already consumes. Pure; the sync store decides where the rows go (Listbox._presetRows
// live-swap, or materialized into Value.rows).
//
// Row contract: sendValue carries the DEVICE SLOT (what recall needs); internalValue/id are
// 'slot_<n>' (stable keys); displayText is the best-known name; bank headers use isHeader rows.
import { presetSlotInfo } from '../stores/deviceProfileLocalEngine.js';

function bankHeaderRow(bank) {
  return {
    id: `bank_${bank.id}`,
    displayText: String(bank.label || bank.id),
    internalValue: `bank_${bank.id}`,
    sendValue: '',
    receiveValue: '',
    enabled: true,
    isHeader: true,
  };
}

function slotRow(profile, slot, name) {
  const info = presetSlotInfo(profile, slot);
  return {
    id: `slot_${slot}`,
    displayText: name || `Slot ${slot}`,
    internalValue: `slot_${slot}`,
    sendValue: slot,
    receiveValue: slot,
    enabled: true,
    subtitle: '',
    badge: info.inBank && !info.writable ? 'ROM' : '',
    swatch: '',
    isHeader: false,
  };
}

function scanNameBySlot(scan) {
  const out = new Map();
  for (const entry of Array.isArray(scan?.entries) ? scan.entries : []) {
    const slot = Number(entry?.slot);
    const name = String(entry?.name ?? '').trim();
    if (Number.isInteger(slot) && name) out.set(slot, name);
  }
  return out;
}

// The slot the selector would recall for a row, or null for headers/non-preset rows.
export function presetRowSlot(row) {
  const slot = Number(row?.sendValue);
  return row?.isHeader !== true && Number.isInteger(slot) && slot >= 0 && String(row?.id ?? '').startsWith('slot_')
    ? slot
    : null;
}

// Build selector rows from the preset model.
//   source 'factoryCatalog' — the shipped names only: banks that carry a `names` catalog.
//   source 'devicePresets'  — every mapped slot, best name wins: scan > catalog > "Slot N".
//                             Without a slot map, the scan's own entries are the list.
export function buildPresetChoiceRows(profile, { source = 'devicePresets', scan = null, headers = true } = {}) {
  const banks = Array.isArray(profile?.presets?.banks) ? profile.presets.banks : [];
  const names = scanNameBySlot(source === 'devicePresets' ? scan : null);
  const rows = [];

  const eligible = source === 'factoryCatalog'
    ? banks.filter((bank) => Array.isArray(bank?.names) && bank.names.length)
    : banks;

  for (const bank of eligible) {
    const start = Number(bank?.startSlot);
    const count = Number(bank?.slotCount);
    if (!Number.isInteger(start) || !Number.isInteger(count) || count < 1) continue;
    const catalog = Array.isArray(bank?.names) ? bank.names : [];
    const bankRows = [];
    for (let index = 0; index < count; index += 1) {
      const slot = start + index;
      const catalogName = String(catalog[index] ?? '').trim();
      if (source === 'factoryCatalog') {
        if (catalogName) bankRows.push(slotRow(profile, slot, catalogName));
        continue;
      }
      bankRows.push(slotRow(profile, slot, names.get(slot) || catalogName));
    }
    if (!bankRows.length) continue;
    if (headers && eligible.length > 1) rows.push(bankHeaderRow(bank));
    rows.push(...bankRows);
  }

  // No slot map: the live scan is all we know — list its named slots directly.
  if (!rows.length && source === 'devicePresets') {
    for (const [slot, name] of [...names.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(slotRow(profile, slot, name));
    }
  }

  return rows;
}

// Inject preset rows into every preset-sourced Listbox of a panel document, returning a NEW panel
// (input untouched) and the number of listboxes updated. Pure — the editor patches via the controls
// store instead; this is for wholesale-replace contexts (the Player owns its panel object).
// Nested child controls live inside `_children` alongside sections (they carry a Core section),
// so one `_children` walk covers containers too.
export function injectPresetRowsIntoPanel(panel, profile, scan = null) {
  if (!panel || !Array.isArray(panel.controls) || !profile?.presets) return { panel, updated: 0 };
  let updated = 0;
  const walk = (node) => {
    const children = node?._children;
    if (!children || typeof children !== 'object') return node;
    let changed = false;
    const nextChildren = {};
    for (const [key, child] of Object.entries(children)) {
      let next = walk(child);
      if (key === 'Listbox') {
        const source = String(child?.choiceSource ?? '');
        if (source === 'devicePresets' || source === 'factoryCatalog') {
          const rows = buildPresetChoiceRows(profile, { source, scan });
          // Deep-equal rows leave the node untouched, so a caller can re-run this on every
          // scan/source event and only see a new panel object when the rows really changed.
          if (rows.length && JSON.stringify(child?._presetRows ?? null) !== JSON.stringify(rows)) {
            next = { ...(next === child ? child : next), _presetRows: rows };
            updated += 1;
          }
        }
      }
      if (next !== child) changed = true;
      nextChildren[key] = next;
    }
    return changed ? { ...node, _children: nextChildren } : node;
  };
  const nextControls = panel.controls.map(walk);
  const changed = nextControls.some((control, index) => control !== panel.controls[index]);
  return { panel: changed ? { ...panel, controls: nextControls } : panel, updated };
}
