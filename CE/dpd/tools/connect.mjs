// Layer 4 — the recognition cascade ("one recognition outcome, method invisible"):
// inquiry -> MIDI-CI/Property-Exchange -> fingerprint -> warm no-match handoff. The live MIDI I/O
// needs the device; the orchestration over match.mjs + import-midici.mjs is pure and simulatable.
// `device` stands in for the connected gear: { inquiryReply, peResponse, sysexHeader }.
// Run: node CE/dpd/tools/connect.mjs   (self-test with simulated devices)
import { parseIdentityReply, matchProfile } from './match.mjs';
import { midiCiToProfile } from './import-midici.mjs';
import { loadProfile } from './dpd.mjs';

export function connect(device, profiles) {
  let manufacturerDegrade = null;

  // 1. Universal Device Inquiry
  if (device.inquiryReply) {
    const reply = parseIdentityReply(device.inquiryReply);
    const m = matchProfile(reply, profiles);
    if (m.level === 'model') return { method: 'inquiry', outcome: 'recognized', profileId: m.profileId, label: m.label };
    if (m.level === 'manufacturer') manufacturerDegrade = { method: 'inquiry', outcome: 'manufacturer', profileId: m.profileId, label: m.label };
  }

  // 2. MIDI-CI Property Exchange auto-population (stronger than inquiry-then-lookup)
  if (device.peResponse) {
    const { profile, summary } = midiCiToProfile(device.peResponse);
    return { method: 'midi-ci', outcome: 'auto-populated', profileId: profile.id, profile, summary };
  }

  if (manufacturerDegrade) return manufacturerDegrade;

  // 3. Fingerprint: match an observed SysEx header to a manufacturer layer
  if (device.sysexHeader) {
    const mfrId = device.sysexHeader.trim().split(/\s+/)[1];
    const mfr = profiles.find((p) => p.kind === 'manufacturer' && p.manufacturerId === mfrId);
    if (mfr) return { method: 'fingerprint', outcome: 'manufacturer', profileId: mfr.id, label: mfr.label };
  }

  // 4. No match -> warm handoff into contribution (Layer 3)
  return { method: 'none', outcome: 'unrecognized', handoff: "Don't recognize this device yet — start a new profile from the closest family." };
}

// ---- self-test with simulated devices ----
if (process.argv[1]?.endsWith('connect.mjs')) {
  let pass = 0, fail = 0;
  const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log(`  ✗ ${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); } };

  const roland = loadProfile('roland'), gaia = loadProfile('roland.gaia');
  const lib = [roland, gaia];

  // GAIA answers inquiry but has no identity codes yet -> manufacturer-level recognition
  const g = connect({ inquiryReply: 'F0 7E 10 06 02 41 02 01 00 00 01 00 00 00 F7' }, lib);
  eq(g.outcome, 'manufacturer', 'GAIA inquiry -> manufacturer-level (codes not captured yet)');
  eq(g.profileId, 'roland', 'degraded to roland');

  // a model that declares identity codes -> full recognition
  const model = { kind: 'model', id: 'roland.example', label: 'Example', identity: { manufacturerId: '41', family: '02 01', member: '00 00' } };
  const r = connect({ inquiryReply: 'F0 7E 10 06 02 41 02 01 00 00 01 00 00 00 F7' }, [roland, model]);
  eq(r.outcome, 'recognized', 'inquiry + identity codes -> recognized');
  eq(r.profileId, 'roland.example', 'recognized model id');

  // MIDI-CI device (no inquiry match) -> Property Exchange auto-populate
  const ci = connect({ peResponse: { name: 'CI Synth', deviceInfo: { manufacturerId: [0, 33, 9], family: [2, 1], model: [0, 0], version: [1, 0, 0, 0] }, channelControllers: [{ title: 'Cutoff', ctrlType: 'cc', ctrlIndex: [74] }] } }, lib);
  eq(ci.outcome, 'auto-populated', 'MIDI-CI PE -> auto-populated');
  eq(ci.profile.scopes.global.parameters.length, 1, 'PE auto-populated 1 controller');

  // fingerprint a SysEx header to the manufacturer
  const fp = connect({ sysexHeader: 'F0 41 10 00 00 41 12 10 00 01 0C 40 23 F7' }, lib);
  eq(fp.outcome, 'manufacturer', 'SysEx header fingerprint -> manufacturer');
  eq(fp.profileId, 'roland', 'fingerprint -> roland');

  // unknown device -> warm handoff
  const none = connect({}, lib);
  eq(none.outcome, 'unrecognized', 'unknown -> unrecognized');
  if (none.handoff) pass++; else fail++;

  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
