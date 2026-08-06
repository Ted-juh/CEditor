// The persisted preset librarian: named user banks of captured patches, kept per device profile in
// localStorage. This is the "operations" half of the preset story — the DPD preset model
// (profile.presets) says what a slot IS (factory/ROM vs writable user); this store holds what the
// user KEEPS (scanned names, captured dumps, renamed/organized banks) and performs recall / send-back,
// refusing to write ROM slots. See docs/preset-model.md and docs/midi-workbench.md §6.
import { writable, get } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import { isJuceAvailable, triggerRawMidiAction } from '../bridge/bridge.js';
import {
  localCompilePresetRecall,
  parseRawMidiHexText,
  presetSlotInfo,
} from './deviceProfileLocalEngine.js';
import { startBulkDumpSend } from './devicePresetJobs.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

import { deepClone } from '../utils/deepClone.js';
const STORAGE_KEY = 'ce.presetLibrarian.v1';

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const slot = Number(entry.slot);
  if (!Number.isInteger(slot) || slot < 0) return null;
  return {
    slot,
    name: String(entry.name ?? ''),
    source: ['scan', 'dump', 'manual'].includes(entry.source) ? entry.source : 'manual',
    // Captured patch data as hex SysEx message(s) — what "send back to the device" replays.
    hex: String(entry.hex ?? ''),
    capturedAt: String(entry.capturedAt ?? ''),
    notes: String(entry.notes ?? ''),
  };
}

function normalizeBank(bank) {
  if (!bank || typeof bank !== 'object' || !bank.id) return null;
  return {
    id: String(bank.id),
    label: String(bank.label ?? bank.id),
    createdAt: String(bank.createdAt ?? ''),
    updatedAt: String(bank.updatedAt ?? ''),
    entries: (Array.isArray(bank.entries) ? bank.entries : []).map(normalizeEntry).filter(Boolean),
  };
}

function normalizeLibrary(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [profileId, library] of Object.entries(value)) {
    const banks = (Array.isArray(library?.banks) ? library.banks : []).map(normalizeBank).filter(Boolean);
    if (banks.length) out[profileId] = { banks };
  }
  return out;
}

// Whole library, keyed by engine profileId: { [profileId]: { banks: [{ id, label, entries }] } }.
export const presetLibrary = writable(normalizeLibrary(readStoredJson(STORAGE_KEY, {})));

function updateLibrary(mutate) {
  presetLibrary.update((library) => {
    const next = mutate(deepClone(library)) ?? library;
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
}

function bankOf(library, profileId, bankId) {
  return library[profileId]?.banks?.find((bank) => bank.id === bankId) ?? null;
}

let bankCounter = 0;
function mintBankId() {
  bankCounter += 1;
  return `bank_${Date.now().toString(36)}_${bankCounter}`;
}

export function createLibraryBank(profileId, { label = 'New bank' } = {}) {
  const id = mintBankId();
  const now = new Date().toISOString();
  updateLibrary((library) => {
    (library[profileId] ??= { banks: [] }).banks.push({ id, label: String(label), createdAt: now, updatedAt: now, entries: [] });
    return library;
  });
  return id;
}

export function renameLibraryBank(profileId, bankId, label) {
  updateLibrary((library) => {
    const bank = bankOf(library, profileId, bankId);
    if (bank) { bank.label = String(label); bank.updatedAt = new Date().toISOString(); }
    return library;
  });
}

export function removeLibraryBank(profileId, bankId) {
  updateLibrary((library) => {
    const entry = library[profileId];
    if (entry) {
      entry.banks = entry.banks.filter((bank) => bank.id !== bankId);
      if (!entry.banks.length) delete library[profileId];
    }
    return library;
  });
}

// Capture a completed (or partial) preset-list scan as a library bank: one entry per slot that
// resolved a name. Slots that captured a dump keep its hex so the patch itself can be sent back.
export function captureScanToLibrary(profileId, scan, { label = 'Scanned presets', bankId = '' } = {}) {
  const entries = (Array.isArray(scan?.entries) ? scan.entries : [])
    .filter((entry) => String(entry?.name ?? '').trim() || entry?.dumpCollection)
    .map((entry) => normalizeEntry({
      slot: entry.slot,
      name: String(entry.name ?? '').trim() || `Slot ${entry.slot}`,
      source: entry.dumpCollection ? 'dump' : 'scan',
      hex: collectionHex(entry.dumpCollection),
      capturedAt: new Date().toISOString(),
    }))
    .filter(Boolean);
  if (!entries.length) return { ok: false, error: 'Scan has no named entries to capture.', bankId: '' };

  const id = bankId || mintBankId();
  const now = new Date().toISOString();
  updateLibrary((library) => {
    const banks = (library[profileId] ??= { banks: [] }).banks;
    let bank = banks.find((candidate) => candidate.id === id);
    if (!bank) {
      bank = { id, label: String(label), createdAt: now, updatedAt: now, entries: [] };
      banks.push(bank);
    }
    for (const entry of entries) {
      const existing = bank.entries.findIndex((candidate) => candidate.slot === entry.slot);
      if (existing >= 0) bank.entries.splice(existing, 1, { ...bank.entries[existing], ...entry });
      else bank.entries.push(entry);
    }
    bank.entries.sort((a, b) => a.slot - b.slot);
    bank.updatedAt = now;
    return library;
  });
  return { ok: true, bankId: id, captured: entries.length };
}

function collectionHex(dumpCollection) {
  const messages = dumpCollection?.messages;
  if (!Array.isArray(messages)) return '';
  return messages.map((message) => String(message?.hex ?? '')).filter(Boolean).join('\n');
}

export function renameLibraryEntry(profileId, bankId, slot, name) {
  updateLibrary((library) => {
    const entry = bankOf(library, profileId, bankId)?.entries?.find((candidate) => candidate.slot === Number(slot));
    if (entry) entry.name = String(name);
    return library;
  });
}

export function removeLibraryEntry(profileId, bankId, slot) {
  updateLibrary((library) => {
    const bank = bankOf(library, profileId, bankId);
    if (bank) bank.entries = bank.entries.filter((entry) => entry.slot !== Number(slot));
    return library;
  });
}

export function attachEntryData(profileId, bankId, slot, hex) {
  updateLibrary((library) => {
    const entry = bankOf(library, profileId, bankId)?.entries?.find((candidate) => candidate.slot === Number(slot));
    if (entry) {
      entry.hex = String(hex ?? '');
      entry.source = 'dump';
      entry.capturedAt = new Date().toISOString();
    }
    return library;
  });
}

// ── Slot-map gate: the model decides, the librarian obeys ──

export function canWriteSlot(profile, slot) {
  const info = presetSlotInfo(profile, slot);
  if (!info.inBank && Array.isArray(profile?.presets?.banks) && profile.presets.banks.length) {
    return { ok: false, error: `Slot ${slot} is not inside any preset bank.`, info };
  }
  if (!info.writable) {
    return { ok: false, error: `Slot ${slot} is read-only (${info.bankLabel || 'factory'} ROM).`, info };
  }
  return { ok: true, error: '', info };
}

// ── Operations: recall a slot, send a captured patch back ──

// Compile the profile's recall action for a slot and send it (one raw message per send — bankPc is a
// CC0/CC32/PC sequence). Without the bridge this is a dry run: the compiled messages are returned.
export function recallPreset(profile, { slot, deviceRole = DEFAULT_DEVICE_ROLE, dryRun = false } = {}) {
  const compiled = localCompilePresetRecall(profile, { slot, deviceRole });
  if (!compiled.ok) return compiled;
  const live = !dryRun && isJuceAvailable();
  if (live) {
    for (const message of compiled.messages) {
      triggerRawMidiAction({ deviceRole, actionId: `preset_recall_${slot}`, message: message.hex, dryRun: false });
    }
  }
  return { ...compiled, sent: live, local: !live };
}

// Send a captured patch (its stored dump hex) back to the device. Target slot defaults to the
// entry's own slot; whichever slot is targeted must be writable in the profile's slot map — this is
// where "the librarian may not overwrite ROM" is enforced.
export function sendEntryToDevice(profile, entry, { slot, deviceRole = DEFAULT_DEVICE_ROLE, dryRun = true } = {}) {
  const targetSlot = Number(slot ?? entry?.slot);
  const gate = canWriteSlot(profile, targetSlot);
  if (!gate.ok) return { ok: false, error: gate.error, blocked: true, slot: targetSlot };
  const hex = String(entry?.hex ?? '').trim();
  if (!hex) return { ok: false, error: 'This entry has no captured patch data (name only).', slot: targetSlot };
  startBulkDumpSend({
    deviceRole,
    profileId: profile?.id ?? '',
    hex: hex.split('\n').join(' '),
    label: `Send "${entry?.name ?? 'preset'}" to slot ${targetSlot}`,
    dryRun,
  });
  return { ok: true, error: '', slot: targetSlot, dryRun };
}

// ── Export / import: JSON banks and raw .syx bytes ──

export function exportLibraryBankJson(profileId, bankId) {
  const bank = bankOf(get(presetLibrary), profileId, bankId);
  if (!bank) return null;
  return {
    kind: 'ceditor-preset-bank',
    version: 1,
    profileId,
    exportedAt: new Date().toISOString(),
    bank: deepClone(bank),
  };
}

export function importLibraryBankJson(profileId, payload) {
  const bank = normalizeBank(payload?.bank);
  if (payload?.kind !== 'ceditor-preset-bank' || !bank) {
    return { ok: false, error: 'Not a CEditor preset bank export.', bankId: '' };
  }
  const id = mintBankId(); // re-mint so imports never collide with existing banks
  updateLibrary((library) => {
    (library[profileId] ??= { banks: [] }).banks.push({ ...bank, id, updatedAt: new Date().toISOString() });
    return library;
  });
  return { ok: true, error: '', bankId: id };
}

// All captured dump bytes in a bank, concatenated in slot order — a standard .syx file body.
export function exportLibraryBankSyx(profileId, bankId) {
  const bank = bankOf(get(presetLibrary), profileId, bankId);
  if (!bank) return { ok: false, error: 'Bank not found.', bytes: [] };
  const bytes = [];
  let messages = 0;
  for (const entry of bank.entries) {
    for (const line of String(entry.hex ?? '').split('\n')) {
      if (!line.trim()) continue;
      const parsed = parseRawMidiHexText(line);
      if (!parsed.ok) return { ok: false, error: `Slot ${entry.slot}: ${parsed.error}`, bytes: [] };
      bytes.push(...parsed.bytes);
      messages += 1;
    }
  }
  if (!messages) return { ok: false, error: 'No captured patch data in this bank.', bytes: [] };
  return { ok: true, error: '', bytes, messages };
}

// ── Display: one name per slot, best source wins ──

// Precedence: what the user keeps (library) > what the device said (scan) > the shipped catalog.
export function displayNameForSlot(profile, slot, { scan = null, bank = null } = {}) {
  const libraryEntry = bank?.entries?.find((entry) => entry.slot === Number(slot));
  if (libraryEntry?.name) return { name: libraryEntry.name, source: 'library' };
  const scanEntry = (Array.isArray(scan?.entries) ? scan.entries : []).find((entry) => Number(entry?.slot) === Number(slot));
  if (String(scanEntry?.name ?? '').trim()) return { name: String(scanEntry.name).trim(), source: 'scan' };
  const catalogName = presetSlotInfo(profile, slot).catalogName;
  if (catalogName) return { name: catalogName, source: 'catalog' };
  return { name: '', source: 'none' };
}
