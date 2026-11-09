// The Z-Core tone: one block tree that the FANTOM-6/7/8 and the AX-Edge print alike.
//
// FANTOM-6/7/8 MIDI Implementation 1.00 (Nov 1 2020), p15, "[Z-Core Tone]"; AX-Edge MIDI
// Implementation 1.01 (Jul 1 2020), p6, "[Tone]". The same 33 entries at the same offsets:
//
//   00 00 00  Tone Common              00 2C 00 - 00 2F 00  Partial Amp Env 1-4
//   00 01 00  Tone MFX                 00 30 00 - 00 36 00  Partial LFO 1-4     (two LFOs each)
//   00 10 00  Tone PMT                 00 38 00 - 00 3B 00  Partial EQ 1-4
//   00 20 00 - 00 23 00  Tone Partial 1-4          00 3C 00  Synth Common
//   00 24 00 - 00 27 00  Partial Pitch Env 1-4     00 3D 00  Synth PMT
//   00 28 00 - 00 2B 00  Partial Filter Env 1-4    00 3E 00 - 00 41 00  Synth Partial 1-4
//
// Only the envelope tables' headings differ: the FANTOM shares them with its drum instruments and
// heads them "[Partial Pitch Env] / [Inst Pitch Env]", the AX-Edge "[Partial Pitch Env]". So the
// caller says what they are called. This file is outside synths/ because every .mjs there is a synth.

const PARTIALS = [1, 2, 3, 4];

/**
 * The blocks of one Z-Core tone.
 *
 * @param {object} tone
 * @param {string} tone.root   the top-table entry the tone sits at, e.g. 'Temporary Tone (01)'
 * @param {string} tone.id     block-id prefix, e.g. 'tone1'
 * @param {string} tone.label  group prefix, e.g. 'Tone 1'
 * @param {(kind: 'Pitch'|'Filter'|'Amp') => string} [tone.envTable]  the envelope tables' names in this map
 */
export function zCoreTone({ root, id, label, envTable = (kind) => `[Partial ${kind} Env]` }) {
  const at = (entry) => [root, entry];
  const perPartial = (make) => PARTIALS.map(make);
  return [
    { id: `${id}.common`, table: '[Tone Common]', path: at('Tone Common'), group: `${label} · Common`, strip: /^Tone\s+/ },
    { id: `${id}.mfx`, table: '[MFX]', path: at('Tone MFX'), group: `${label} · MFX`, strip: /^MFX\s+/ },
    { id: `${id}.pmt`, table: '[Tone PMT(Partial Mix Table)]', path: at('Tone PMT'), group: `${label} · Partial Mix`, strip: /^PMT\s+/ },
    ...perPartial((n) => ({ id: `${id}.partial${n}`, table: '[Tone Partial]', path: at(`Tone Partial ${n}`), group: `${label} · Partial ${n}` })),
    ...perPartial((n) => ({
      id: `${id}.pitchEnv${n}`, table: envTable('Pitch'), path: at(`Partial Pitch Env ${n}`), group: `${label} · Partial ${n} · Pitch Env`, strip: /^Pitch Env\s+/,
    })),
    ...perPartial((n) => ({
      id: `${id}.filterEnv${n}`, table: envTable('Filter'), path: at(`Partial Filter Env ${n}`), group: `${label} · Partial ${n} · Filter Env`, strip: /^TVF Env\s+/,
    })),
    ...perPartial((n) => ({
      id: `${id}.ampEnv${n}`, table: envTable('Amp'), path: at(`Partial Amp Env ${n}`), group: `${label} · Partial ${n} · Amp Env`, strip: /^TVA Env\s+/,
    })),
    // Each block holds the partial's two LFOs, printed one after the other with the same row names.
    ...perPartial((n) => ({ id: `${id}.lfo${n}`, table: '[Partial LFO]', path: at(`Partial LFO ${n}`), group: `${label} · Partial ${n} · LFO 1 & 2` })),
    ...perPartial((n) => ({ id: `${id}.eq${n}`, table: '[Partial EQ]', path: at(`Partial EQ ${n}`), group: `${label} · Partial ${n} · EQ`, strip: /^EQ\s+/ })),
    { id: `${id}.synth`, table: '[Tone Synth Common]', path: at('Synth Common'), group: `${label} · Synth Common` },
    { id: `${id}.synthPmt`, table: '[Tone Synth PMT]', path: at('Synth PMT'), group: `${label} · Synth Structure` },
    ...perPartial((n) => ({ id: `${id}.synthPartial${n}`, table: '[Tone Synth Partial]', path: at(`Synth Partial ${n}`), group: `${label} · Synth Partial ${n}` })),
  ];
}
