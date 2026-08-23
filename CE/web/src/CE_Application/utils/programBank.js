// programBank.js — turning a librarian bank into the exported plugin's program list.
//
// TOTAL RECALL S4. The exported plugin reported one nameless program, so a DAW's program menu was
// empty and there was no host-automatable way to change patch. Meanwhile the preset librarian has
// had persisted banks, captured patch data, ROM-write blocking and recall for a long time — in
// browser storage, where neither the exporter (which runs in Node) nor the plugin can reach it.
//
// So the bank is BAKED into the panel document at author time. That is not only a plumbing
// convenience: a plugin should not scan an instrument's memory on every project load, and the
// alternative to baking is exactly that. The honest limit follows, and the Export tab says it — a
// panel-authored bank is a list somebody curated, not a live view of what is in the synth now.
//
// The read side is `CE/src/Player/ProgramBank.h`, and the two have to agree about the shape. What
// keeps them honest is `programBankSetting.test.js`, which reads both.

/** Hosts index programs from 0 and most show a bounded menu; past this a menu stops being usable. */
export const MAX_PROGRAMS = 128;

const text = (value) => String(value ?? '').trim();

/**
 * One librarian entry -> one program, or null when it cannot be one.
 *
 * A librarian entry can be name-only (a scan found a patch called "Big Saw" in slot 12 and never
 * captured it). That is still a usable program: recall sends the profile's own action for the slot
 * and the synth loads whatever it has there. What cannot be a program is an entry with no slot,
 * because there is nothing for either kind of recall to address.
 */
export function programFromEntry(entry) {
  const slot = Number(entry?.slot);
  if (!Number.isInteger(slot) || slot < 0) return null;
  return {
    slot,
    name: text(entry?.name) || `Slot ${slot}`,
    // Newlines out: the librarian stores multi-message captures line-separated, and the document
    // this ends up in is JSON that a person reads when something goes wrong.
    hex: text(entry?.hex).split('\n').join(' ').replace(/\s+/g, ' '),
  };
}

/**
 * A librarian bank -> the document form the plugin reads.
 *
 * Programs come out in SLOT order rather than the librarian's own, because a DAW's program menu is
 * a numbered list and a user reading it against the synth's front panel expects those to line up.
 * The librarian's order is a capture order, which is not meaningful here.
 *
 * Returns null for a bank with nothing usable in it — baking an empty `programBank` key would make
 * a panel claim a feature it does not have.
 */
export function bakeProgramBank(bank, { maxPrograms = MAX_PROGRAMS } = {}) {
  const entries = Array.isArray(bank?.entries) ? bank.entries : [];
  const programs = entries
    .map(programFromEntry)
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot);

  if (programs.length === 0) return null;

  return {
    label: text(bank?.label) || text(bank?.id) || 'Programs',
    // Truncation is reported by the caller rather than hidden here — see `bakeReport`.
    programs: programs.slice(0, maxPrograms),
  };
}

/**
 * What baking a bank would produce, and what it would cost, before it is done.
 *
 * The counts exist so the Export tab can say them. A bank of 200 patches silently becoming 128
 * programs is the kind of quiet truncation that reads as a bug in the DAW.
 */
export function bakeReport(bank, options = {}) {
  const entries = Array.isArray(bank?.entries) ? bank.entries : [];
  const usable = entries.map(programFromEntry).filter(Boolean);
  const baked = bakeProgramBank(bank, options);
  const withData = usable.filter((p) => p.hex).length;

  return {
    ok: !!baked,
    bank: baked,
    total: entries.length,
    usable: usable.length,
    unusable: entries.length - usable.length,
    withData,
    nameOnly: usable.length - withData,
    dropped: Math.max(0, usable.length - (baked?.programs.length ?? 0)),
    bytes: JSON.stringify(baked ?? {}).length,
  };
}

/** The baked bank on a panel, in the same forgiving spirit as the C++ reader. */
export function programBankFromPanel(panel) {
  const declared = panel?.programBank;
  if (!declared || typeof declared !== 'object' || !Array.isArray(declared.programs)) return null;
  const programs = declared.programs.map(programFromEntry).filter(Boolean);
  return programs.length ? { label: text(declared.label) || 'Programs', programs } : null;
}
