// Layer 2/4 — MIDI-CI Property Exchange importer (logic).
// Modern gear publishes a JSON parameter/controller map over SysEx (resources like ChCtrlList +
// ProgramList) plus device identity from CI Discovery. The live handshake needs MIDI 2.0 hardware;
// turning a captured PE response into a native profile is pure. Lands as 'partial' (names + CCs +
// identity, but no SysEx/packing structure). Run: node CE/dpd/tools/import-midici.mjs (self-test)
import { validateProfile } from './validate.mjs';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hex = (arr) => (arr ?? []).map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join(' ');

export function midiCiToProfile(pe) {
  const ctrls = pe.channelControllers ?? pe.allControllers ?? [];
  const parameters = ctrls.filter((c) => (c.ctrlType ?? 'cc') === 'cc').map((c) => ({
    id: slug(c.title), name: c.title, group: 'MIDI-CI', valueType: 'continuous',
    range: { min: 0, max: 127 }, encoding: { type: 'u7' },
    access: { read: true, write: true },
    wires: [
      { dir: 'write', msg: 'cc', cc: c.ctrlIndex?.[0] ?? 0 },
      { dir: 'rxLive', msg: 'cc', cc: c.ctrlIndex?.[0] ?? 0 },
    ],
    ui: { preferredComponent: 'Slider' },
  }));

  const di = pe.deviceInfo ?? {};
  const profile = {
    schemaVersion: 1,
    id: 'imported.' + slug([hex(di.manufacturerId), hex(di.family), hex(di.model)].filter(Boolean).join(' ') || 'midici-device'),
    version: '1.0.0',
    kind: 'model',
    label: pe.name ?? 'MIDI-CI device',
    identity: {
      manufacturerId: hex(di.manufacturerId) || undefined,
      family: hex(di.family) || undefined,
      member: hex(di.model) || undefined,
      firmware: hex(di.version) || undefined,
    },
    scopes: { global: { kind: 'global', label: 'Controllers', instances: 1, parameters } },
    imported: { presets: (pe.programList ?? []).map((p) => ({ name: p.title, bankPC: p.bankPC })) },
    provenance: {
      source: 'imported', verifiedRoundTrip: false, verifiedFullDump: false,
      verifiedOnHardware: null, confirmations: 0, contributors: [], importedFrom: 'midi-ci',
    },
    completeness: 'partial',
  };
  // strip undefined identity fields
  for (const k of Object.keys(profile.identity)) if (profile.identity[k] === undefined) delete profile.identity[k];

  const summary = {
    cameThrough: [`${parameters.length} controllers (CC)`, `${profile.imported.presets.length} presets`, `device identity (mfr/family/model/version)`],
    needsYou: ['SysEx addresses / bit-packing / checksums / dump layouts (MIDI-CI does not expose these)'],
  };
  return { profile, summary };
}

// Normalise the RAW MIDI-CI Property Exchange resources (as the C++ MidiCiSession surfaces them) into
// the input shape midiCiToProfile() expects. The PE "DeviceInfo" common resource uses byte-array ids
// `manufacturerId`/`familyId`/`modelId`/`versionId` plus display-name strings `manufacturer`/`family`/
// `model`; the controller map is "AllCtrlList" (or per-channel "ChCtrlList") and presets are
// "ProgramList". This bridges those spec names to the importer's fields.
export function peToImporterInput({ deviceInfo = {}, allCtrlList, chCtrlList, programList, channelList } = {}) {
  const di = deviceInfo ?? {};
  const nameParts = [di.manufacturer, di.model].filter((s) => typeof s === 'string' && s.length);
  return {
    name: nameParts.length ? nameParts.join(' ') : (typeof di.model === 'string' ? di.model : 'MIDI-CI device'),
    deviceInfo: {
      // byte-array ids; tolerate both spec (`familyId`) and already-normalised (`family`) inputs
      manufacturerId: di.manufacturerId,
      family: di.familyId ?? (Array.isArray(di.family) ? di.family : undefined),
      model: di.modelId ?? (Array.isArray(di.model) ? di.model : undefined),
      version: di.versionId ?? (Array.isArray(di.version) ? di.version : undefined),
    },
    channelControllers: Array.isArray(allCtrlList) ? allCtrlList
      : Array.isArray(chCtrlList) ? chCtrlList : [],
    programList: Array.isArray(programList) ? programList : [],
    channelList, // carried through for future use (channels/programs); importer ignores it for now
  };
}

// One-call convenience for the live path: raw PE resources -> { profile, summary }.
export function midiCiPropertiesToProfile(rawPe) {
  return midiCiToProfile(peToImporterInput(rawPe));
}

// ---- self-test (Node only; guarded so the module is browser-safe when bundled) ----
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('import-midici.mjs')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
  const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

  const pe = {
    name: 'Example CI Synth',
    deviceInfo: { manufacturerId: [0, 33, 9], family: [2, 1], model: [0, 0], version: [1, 0, 0, 0] },
    channelControllers: [
      { title: 'Volume', ctrlType: 'cc', ctrlIndex: [7] },
      { title: 'Pan', ctrlType: 'cc', ctrlIndex: [10] },
      { title: 'Filter Cutoff', ctrlType: 'cc', ctrlIndex: [74] },
      { title: 'Mod Depth', ctrlType: 'nrpn', ctrlIndex: [1, 8] },
    ],
    programList: [{ title: 'Init', bankPC: [0, 0, 0] }, { title: 'Lead', bankPC: [0, 0, 1] }],
  };

  const { profile, summary } = midiCiToProfile(pe);
  const { ok: valid, errors } = validateProfile(profile);
  ok(valid, 'PE import validates' + (errors.length ? ' :: ' + errors.join('; ') : ''));
  eq(profile.scopes.global.parameters.length, 3, 'imports 3 CC controllers (NRPN skipped)');
  eq(profile.scopes.global.parameters.find((p) => p.id === 'filter-cutoff').wires[0].cc, 74, 'Filter Cutoff -> CC 74');
  eq(profile.identity.manufacturerId, '00 21 09', 'identity manufacturerId from device info');
  eq(profile.identity.family, '02 01', 'identity family');
  eq(profile.imported.presets.length, 2, '2 presets imported');
  eq(profile.completeness, 'partial', 'completeness = partial');
  eq(profile.provenance.importedFrom, 'midi-ci', 'source = midi-ci');

  // ---- raw MIDI-CI PE resources (spec field names, as the C++ MidiCiSession surfaces them) ----
  const rawPe = {
    deviceInfo: { manufacturerId: [0, 33, 9], familyId: [2, 1], modelId: [0, 0], versionId: [1, 0, 0, 0], manufacturer: 'Acme', model: 'Polysynth' },
    allCtrlList: [
      { title: 'Volume', ctrlType: 'cc', ctrlIndex: [7] },
      { title: 'Filter Cutoff', ctrlType: 'cc', ctrlIndex: [74] },
    ],
    programList: [{ title: 'Init', bankPC: [0, 0, 0] }],
    channelList: { channelList: [{ title: 'Main', channel: 1 }] },
  };
  const mapped = peToImporterInput(rawPe);
  eq(mapped.deviceInfo.family, [2, 1], 'mapper: spec familyId -> importer family bytes');
  eq(mapped.deviceInfo.model, [0, 0], 'mapper: spec modelId -> importer model bytes');
  eq(mapped.channelControllers.length, 2, 'mapper: AllCtrlList -> channelControllers');
  eq(mapped.name, 'Acme Polysynth', 'mapper: name from manufacturer + model name strings');

  const { profile: rawProfile } = midiCiPropertiesToProfile(rawPe);
  const { ok: rawValid, errors: rawErrors } = validateProfile(rawProfile);
  ok(rawValid, 'raw-PE import validates' + (rawErrors.length ? ' :: ' + rawErrors.join('; ') : ''));
  eq(rawProfile.identity.family, '02 01', 'raw-PE identity family from familyId bytes');
  eq(rawProfile.scopes.global.parameters.length, 2, 'raw-PE imports 2 CC controllers');
  eq(rawProfile.scopes.global.parameters.find((p) => p.id === 'filter-cutoff').wires[0].cc, 74, 'raw-PE Filter Cutoff -> CC 74');

  console.log('  came through: ' + summary.cameThrough.join(' · '));
  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
