// presetWords.js — what a preset slot and a program number are on the synth a script talks to, and
// what recallPreset says of a slot it cannot recall, in one place: the runtime (panelRuntime.js)
// says it, the plug-in (CE/src/Player/PluginProcessor.h) says the same, and the Values tab's rows
// say which patch a number reaches.
//
// A slot counts presets across every bank the profile describes (the profile's `presets.banks`,
// read by deviceProfileLocalEngine's presetSlotInfo, as a recall reads it), and a program number is
// MIDI's, 0 to 127, which most synths show counted from 1. Both were numbers in a row with nothing
// beside them, so slot 12 on a GAIA did not say it was the 13th User Patch, and program 12 did not
// say a synth that counts from 1 calls it 13.
//
// recallPreset for a role with no profile answered { ok: false } without a word, in the editor and
// in the plug-in; the plug-in said nothing of any failure.

import { presetSlotInfo, presetModelSlots } from '../stores/deviceProfileLocalEngine.js';

/** recallPreset for a role no device profile is chosen for: nothing recalled. */
export function recallNoProfileWords(slot, role) {
  return `recallPreset(${slot}): no device profile is chosen for ${role}, so nothing was recalled.`;
}

const banksOf = (presets) => (Array.isArray(presets?.banks) ? presets.banks : []);
const intOr = (v, fallback) => (Number.isInteger(Number(v)) ? Number(v) : fallback);

// A bank select byte a call sends: one written out. The runtime sends CC 0 only when bankMsb is
// given and CC 32 only when bankLsb is, so a byte left out is whatever the synth last had.
const sent = (n) => n !== undefined && n !== null && Number.isFinite(Number(n));
const selectedBySelect = (b) => b?.bankMsb !== undefined || b?.bankLsb !== undefined;

/** The name a slot has: the profile's catalogue's, which recallPreset answers with, else the one the
 *  user's library keeps for it (`library`: slot → name). */
function slotName(info, slot, library) {
  if (info.catalogName) return { name: info.catalogName, mine: false };
  const kept = library instanceof Map ? library.get(slot) : library?.[slot];
  return kept ? { name: String(kept), mine: true } : { name: '', mine: false };
}

/** A slot, as a person finds it on the synth: its bank and place in it, and its name. */
function slotWords(info, presets, slot, library) {
  const bank = banksOf(presets).find((b) => String(b?.id ?? '') === info.bankId);
  const place = intOr(slot, 0) - intOr(bank?.startSlot, 0) + 1;
  const { name, mine } = slotName(info, slot, library);
  const named = name ? `, "${name}"${mine ? ' in your library' : ''}` : '';
  return `${info.bankLabel} ${place} of ${intOr(bank?.slotCount, place)}${named}`;
}

/** The banks, as a refusal lists them: "User Patch 0–63, Preset Patch 64–127". */
function banksWords(presets) {
  return banksOf(presets).map((b) => {
    const start = intOr(b?.startSlot, 0);
    return `${String(b?.label ?? b?.id ?? '')} ${start}–${start + Math.max(1, intOr(b?.slotCount, 1)) - 1}`;
  }).join(', ');
}

/**
 * recallPreset's slot, read against the role's profile: { meaning, problem } with the hint, the
 * slots there are as a dropdown, and the runtime's refusal when it recalls nothing. `profile` is
 * the role's ({ presets } from its document; `presets` false for a document with none, null while
 * it loads), or null for a role no profile is chosen for.
 */
export function readPresetSlot(value, { profile, role = 'mainSynth', library = null, known = true } = {}) {
  const meaning = { role };
  const number = Math.round(Number(value));
  // Read as the runtime reads it: Math.round(Number(slot)), so text that is a number is one.
  if (value === null || value === undefined || typeof value === 'boolean' || !Number.isFinite(number) || number < 0) {
    return { meaning, problem: { severity: 'error', message: 'recallPreset(slot): slot must be an integer >= 0.' } };
  }
  if (!profile) {
    meaning.noProfile = true;
    return { meaning, problem: known ? { severity: 'error', message: recallNoProfileWords(number, role) } : null };
  }
  const presets = profile.presets;
  if (presets === null || presets === undefined) return { meaning, problem: null };
  if (presets === false || typeof presets !== 'object') {
    return { meaning, problem: { severity: 'error', message: `recallPreset(${number}): Profile has no preset model (presets block).` } };
  }
  const slots = presetModelSlots(presets);
  if (slots.length) {
    meaning.choices = slots.map(String);
    meaning.choiceNames = Object.fromEntries(slots.map((s) => [String(s), slotWords(presetSlotInfo({ presets }, s), presets, s, library)]));
  }
  const info = presetSlotInfo({ presets }, number);
  if (banksOf(presets).length && !info.inBank) {
    meaning.hint = `the banks are ${banksWords(presets)}`;
    return { meaning, problem: { severity: 'error', message: `recallPreset(${number}): Slot ${number} is not inside any preset bank.` } };
  }
  if (info.inBank) meaning.hint = slotWords(info, presets, number, library);
  return { meaning, problem: null };
}

/**
 * sendProgramChange's program, and the bank its bankMsb and bankLsb select, said as a person finds
 * them: the number a synth that counts from 1 shows, and the slot of the role's profile it reaches
 * when the profile's banks say. `presets` the main synth profile's, or null.
 */
export function programWords(program, { msb, lsb, presets = null, library = null } = {}) {
  const p = Math.round(Number(program));
  if (!Number.isFinite(p) || p < 0 || p > 127) return null;
  const counted = `program ${p}, which a synth that counts from 1 shows as ${p + 1}`;
  const hasBank = sent(msb) || sent(lsb);
  const reaches = banksOf(presets).filter((b) => {
    const base = intOr(b?.programBase, 0);
    if (p < base || p >= base + intOr(b?.slotCount, 0)) return false;
    // A bank the profile selects with bank select is reached only by its own; one with none by a
    // program change alone.
    if (!hasBank) return !selectedBySelect(b);
    return selectsBank(b, msb, lsb);
  });
  if (reaches.length !== 1) return counted;
  const bank = reaches[0];
  const slot = intOr(bank.startSlot, 0) + (p - intOr(bank.programBase, 0));
  return `${counted} · slot ${slot}, ${slotWords(presetSlotInfo({ presets }, slot), presets, slot, library)}`;
}

/**
 * The bank a bankMsb and bankLsb select on the role's profile, or null. With one of them left out
 * and a bank of the profile's told apart by it, what the synth does instead: it keeps the one it
 * last had, so which bank is not known here.
 */
export function bankWords(msb, lsb, presets) {
  if (!sent(msb) && !sent(lsb)) return null;
  const banks = banksOf(presets);
  const bank = banks.find((b) => selectsBank(b, msb, lsb));
  if (bank) return `bank ${[msb, lsb].filter(sent).map((n) => intOr(n, 0)).join('/')} is ${String(bank.label ?? bank.id ?? '')}`;
  const missing = !sent(msb) ? 'bankMsb' : !sent(lsb) ? 'bankLsb' : null;
  const needs = missing === 'bankMsb' ? (b) => b?.bankMsb !== undefined : (b) => b?.bankLsb !== undefined;
  if (missing && banks.some((b) => selectedBySelect(b) && needs(b))) {
    return `${missing} is not sent, so the synth keeps the one it last had, and which bank this selects is not known here`;
  }
  return null;
}

/** Whether the bank select bytes a call sends reach profile bank `b`: each byte the bank names must
 *  be sent and match, since one left out is not known; a byte the bank does not name is 0 to it. */
function selectsBank(b, msb, lsb) {
  if (!selectedBySelect(b)) return false;
  if ((b.bankMsb !== undefined && !sent(msb)) || (b.bankLsb !== undefined && !sent(lsb))) return false;
  return (!sent(msb) || intOr(b.bankMsb, 0) === intOr(msb, 0)) && (!sent(lsb) || intOr(b.bankLsb, 0) === intOr(lsb, 0));
}
