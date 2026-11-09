// The layout the FANTOM-06/07/08 and the FANTOM EX 6/7/8 share.
//
// Both are FANTOM-6/7/8 descendants and print its address map with tone kinds added and taken away
// (FANTOM-06/07/08 MIDI Implementation 1.00, Feb 1 2022, pp14-16; FANTOM EX 6/7/8 MIDI
// Implementation 1.00, Nov 1 2023, pp15-19):
//
//   00 00 00 00  System                          common, control, master comp and EQ, input EQ,
//                                                input reverb, TFX, input MFX
//   01 00 00 00  Setup  /  01 00 02 00  Vocoder
//   02 00 00 00  Temporary Scene                 common, chorus, reverb, two IFX, a Zone, Zone EQ
//                                                and Zone Control for each of 16 zones, controllers
//                                                (and, on the EX, the analog filter)
//   02 1z 00 00  Temporary Z-Core Tone (zone z)        layouts/fantom-tone.mjs, as the FANTOM's
//   02 30 00 00  Temporary Drum Kit (zone 1)           ... + 02 00 00 a zone
//   03 00 00 00  Temporary Drum Kit Inst Set (zone 1)  ... + 04 00 00 a zone
//   04 0z 00 00  Temporary SN-A Tone (zone z)
//   04 40 00 00  Temporary VTW Tone                    one: the map prints no zone for it
//   05 0z 00 00  Temporary EXSN Tone (zone z)
//   05 2z 00 00  Temporary Model Tone (zone z)
//
// The EX adds the V-Piano (04 20 00 00, as on the FANTOM-6/7/8), n/zyme (05 4z 00 00) and JD-800
// (05 6z 00 00) tones; those are in synths/fantom-ex.mjs. Every block below sits at the same
// offsets with the same table in both maps; where a table's ROWS differ (output assigns, pedal 3,
// the S3 switch, CV/Gate, the MFX and reverb type counts) the map carries the difference and
// nothing here needs to know. This file is outside synths/ because every .mjs there is a synth.

export const ZONES = Array.from({ length: 16 }, (unused, i) => i + 1);

/**
 * Both maps share their envelope tables between a Z-Core tone's partials and a drum kit's
 * instruments and head each with both names (FANTOM-06 p40-42, FANTOM EX p47-48).
 */
export const ENV = {
  Pitch: '[Partial Pitch Env] / [Inst Pitch Env]',
  Filter: '[Partial Filter Env] / [Inst Filter Env]',
  Amp: '[Partial Amp Env] / [Inst Amp Env]',
};

/** A drum kit has a partial and a partial EQ on every key from 21 (A0) to 108 (C8). */
export const KIT_KEYS = Array.from({ length: 88 }, (unused, i) => 21 + i);

const MFX = /^MFX\s+/;

/**
 * System and Setup. The FANTOM-06/07/08 has one audio input ("Input EQ", "Input MFX"); the EX has
 * two of each ("Input EQ 1", "Input EQ 2", …). `inputs` is the map's own suffixes: [''] or [1, 2].
 */
export function systemBlocks({ inputs }) {
  const input = (kind, n) => (n === '' ? kind : `${kind} ${n}`);
  const idOf = (kind, n) => `${kind}${n}`;
  return [
    { id: 'setup', table: '[Setup]', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: '[System Common]', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    // The [System] offset table calls this entry "System Controller"; the table it points at is
    // headed "[System Control]" — in both manuals, as in the FANTOM-6/7/8's.
    { id: 'systemControl', table: '[System Control]', path: ['System', 'System Controller'], group: 'System · Control', system: true },
    { id: 'masterComp', table: '[Master Comp]', path: ['System', 'Master Comp'], group: 'System · Master Comp', system: true },
    { id: 'masterEq', table: '[Master EQ]', path: ['System', 'Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    ...inputs.map((n) => ({
      id: idOf('inputEq', n), table: '[Input EQ]', path: ['System', input('Input EQ', n)], group: `System · ${input('Input EQ', n)}`, strip: /^EQ\s+/, system: true,
    })),
    { id: 'inputReverb', table: '[Reverb]', path: ['System', 'Input Reverb'], group: 'System · Input Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'tfx', table: '[MFX]', path: ['System', 'TFX'], group: 'System · TFX', strip: MFX, system: true },
    ...inputs.map((n) => ({
      id: idOf('inputMfx', n), table: '[MFX]', path: ['System', input('Input MFX', n)], group: `System · ${input('Input MFX', n)}`, strip: MFX, system: true,
    })),
  ];
}

const scene = (entry) => ['Temporary Scene', entry];

/** The vocoder setting and the temporary scene, with every zone's scene-level blocks. */
export function sceneBlocks({ analogFilter }) {
  return [
    { id: 'vocoder', table: '[Vocoder]', path: ['Vocoder'], group: 'Vocoder', strip: /^Vocoder\s+/ },

    { id: 'scene', table: '[Scene Common]', path: scene('Scene Common'), group: 'Scene', strip: /^Scene\s+/ },
    { id: 'chorus', table: '[Chorus]', path: scene('Scene Chorus'), group: 'Scene · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: '[Reverb]', path: scene('Scene Reverb'), group: 'Scene · Reverb', strip: /^Reverb\s+/ },
    ...[1, 2].map((n) => ({ id: `ifx${n}`, table: '[MFX]', path: scene(`Scene IFX ${n}`), group: `Scene · IFX ${n}`, strip: MFX })),
    ...ZONES.map((z) => ({ id: `zone${z}`, table: '[Scene Zone]', path: scene(`Scene Zone (Zone ${z})`), group: `Zone ${z}`, strip: /^Zone\s+/ })),
    ...ZONES.map((z) => ({ id: `zone${z}.eq`, table: '[Zone EQ]', path: scene(`Scene Zone EQ (Zone ${z})`), group: `Zone ${z} · EQ`, strip: /^EQ\s+/ })),
    // "External Mono/Poly (CC#126/127)" names two controllers; the id keeps neither.
    ...ZONES.map((z) => ({
      id: `zone${z}.control`, table: '[Zone Control]', path: scene(`Scene Zone Control (Zone ${z})`), group: `Zone ${z} · Control`, strip: /^Control\s+|\s*\(CC#126\/127\)/g,
    })),
    { id: 'controller', table: '[Scene Controller]', path: scene('Scene Controller'), group: 'Scene · Controllers' },
    // The FANTOM-06/07/08 has no analog filter, and its [Scene] table has no entry for one (p14).
    ...(analogFilter
      ? [{ id: 'analogFilter', table: '[Analog Filter]', path: scene('Scene Analog Filter'), group: 'Scene · Analog Filter', strip: /^Analog Filter\s+/ }]
      : []),
  ];
}

/** Zone z's SN-A (SuperNATURAL acoustic) tone: common and MFX. */
export const snaTone = (z) => {
  const root = `Temporary SN-A Tone (zone ${z})`;
  return [
    { id: `sna${z}.common`, table: '[SN-A Tone Common]', path: [root, 'SN-A Tone Common'], group: `Zone ${z} SN-A · Common` },
    { id: `sna${z}.mfx`, table: '[MFX]', path: [root, 'SN-A Tone MFX'], group: `Zone ${z} SN-A · MFX`, strip: MFX },
  ];
};

/** Zone z's EXSN (expansion SuperNATURAL) tone: common and MFX. */
export const exsnTone = (z) => {
  const root = `Temporary EXSN Tone (zone ${z})`;
  return [
    { id: `exsn${z}.common`, table: '[EXSN Tone Common]', path: [root, 'EXSN Tone Common'], group: `Zone ${z} EXSN · Common` },
    { id: `exsn${z}.mfx`, table: '[MFX]', path: [root, 'EXSN Tone MFX'], group: `Zone ${z} EXSN · MFX`, strip: MFX },
  ];
};

/**
 * The VTW (virtual tone wheel) organ. The map has one Temporary VTW Tone and does not say which
 * zone it serves, so its ids carry no zone number.
 */
export const vtwTone = () => {
  const root = 'Temporary VTW Tone';
  return [
    { id: 'vtw.common', table: '[VTW Tone Common]', path: [root, 'VTW Tone Common'], group: 'VTW · Common' },
    { id: 'vtw.modify', table: '[VTW Tone Modify]', path: [root, 'VTW Tone Modify'], group: 'VTW · Harmonic Bars & Percussion' },
    { id: 'vtw.overdrive', table: '[VTW Overdrive]', path: [root, 'VTW Tone Overdrive'], group: 'VTW · Overdrive', strip: /^Overdrive\s+/ },
    { id: 'vtw.rotary', table: '[VTW Rotary]', path: [root, 'VTW Tone Rotary'], group: 'VTW · Rotary', strip: /^Rotary\s+/ },
    { id: 'vtw.mfx', table: '[MFX]', path: [root, 'VTW Tone MFX'], group: 'VTW · MFX', strip: MFX },
  ];
};

/**
 * Zone z's Model tone: one flat parameter block, its MFX, and "Model Tone Common" (the name and
 * category). `Model Tone Common` is also an entry of the EX's n/zyme and JD-800 tones, so the
 * path names its table.
 */
export const modelTone = (z) => {
  const root = `Temporary Model Tone (zone ${z})`;
  return [
    { id: `model${z}`, table: '[Model Tone Prm]', path: [root, 'Model Tone Parameter'], group: `Zone ${z} Model` },
    { id: `model${z}.mfx`, table: '[MFX]', path: [root, 'Model Tone MFX'], group: `Zone ${z} Model · MFX`, strip: MFX },
    { id: `model${z}.common`, table: '[Model Tone Com]', path: [root, '[Model Tone]::Model Tone Common'], group: `Zone ${z} Model · Common` },
  ];
};

/**
 * Zone z's drum kit: common, MFX, six compressors, a partial and a partial EQ on every key, and —
 * for `instKeys` only — each key's instrument (Inst Common and its three envelopes, 164
 * parameters a key), which lives in the zone's Drum Kit Inst Set.
 */
export function drumKit(z, { instKeys }) {
  const kit = `Temporary Drum Kit (zone ${z})`;
  const instSet = `Temporary Drum Kit Inst Set (zone ${z})`;
  const id = `kit${z}`;
  const label = `Zone ${z} Kit`;
  return [
    { id: `${id}.common`, table: '[Drum Kit Common]', path: [kit, 'Drum Kit Common'], group: `${label} · Common` },
    { id: `${id}.mfx`, table: '[MFX]', path: [kit, 'Drum Kit MFX'], group: `${label} · MFX`, strip: MFX },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `${id}.comp${n}`, table: '[Drum Kit Comp]', path: [kit, `Drum Kit Comp ${n}`], group: `${label} · Comp ${n}`, strip: /^Comp\s+/ })),
    ...KIT_KEYS.map((key) => ({ id: `${id}.key${key}`, table: '[Drum Kit Partial]', path: [kit, `Drum Kit Partial (Key# ${key})`], group: `${label} · Key ${key}` })),
    ...KIT_KEYS.map((key) => ({
      id: `${id}.key${key}.eq`, table: '[Partial EQ]', path: [kit, `Drum Kit Partial EQ (Key# ${key})`], group: `${label} · Key ${key} · EQ`, strip: /^EQ\s+/,
    })),
    ...instKeys.flatMap((key) => {
      const inst = (entry) => [instSet, `Drum Kit Inst (Key# ${key})`, entry];
      return [
        { id: `${id}.key${key}.inst`, table: '[Inst Common]', path: inst('Inst Common'), group: `${label} · Key ${key} · Inst` },
        { id: `${id}.key${key}.pitchEnv`, table: ENV.Pitch, path: inst('Inst Pitch Env'), group: `${label} · Key ${key} · Pitch Env`, strip: /^Pitch Env\s+/ },
        { id: `${id}.key${key}.filterEnv`, table: ENV.Filter, path: inst('Inst Filter Env'), group: `${label} · Key ${key} · Filter Env`, strip: /^TVF Env\s+/ },
        { id: `${id}.key${key}.ampEnv`, table: ENV.Amp, path: inst('Inst Amp Env'), group: `${label} · Key ${key} · Amp Env`, strip: /^TVA Env\s+/ },
      ];
    }),
  ];
}

/**
 * Bank Select (p1 of both manuals), Scenes: MSB 85, LSB 0 is A001-A128, LSB 1 is B001-B128, and
 * then the table goes on with ":" and does not say where it stops. Only the two printed banks are
 * here. Tones and drum kits are selected per zone and are not a scene browser's banks.
 */
export const scenePresets = {
  banks: [
    { id: 'scene-a', label: 'Scene A', role: 'user', writable: true, startSlot: 0, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 0 },
    { id: 'scene-b', label: 'Scene B', role: 'user', writable: true, startSlot: 128, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 1 },
  ],
  recall: { kind: 'bankPc' },
};

/** The manual's one worked SysEx message, which both print in the same words and bytes. */
export const sceneLevelExample = (where) => ({
  name: 'Setting scene level to 74 (DT1)',
  where,
  parameter: 'scene.level',
  value: 74,
  expectedHex: 'F0 41 10 00 00 00 5B 12 02 00 00 10 4A 24 F7',
});

export const sharedCoverage = {
  scenePresets: 'Scene banks A and B only: the Bank Select table (p1) continues past B with ":" and does not say how far',
  effectParameterMeanings: 'type-dependent: MFX/IFX/TFX, chorus, reverb, VTW overdrive and rotary parameters are Roland\'s 4-nibble container '
    + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
  inboundControllers: 'not modelled: what the front panel transmits (CC, RPN) is not in the address map',
};
