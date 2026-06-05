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

// ---- self-test ----
if (process.argv[1]?.endsWith('import-midici.mjs')) {
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

  console.log('  came through: ' + summary.cameThrough.join(' · '));
  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
