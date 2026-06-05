// Layer 4 matching: MIDI Universal Device Inquiry -> profile id, with graceful degradation.
// Run: node CE/dpd/tools/match.mjs   (self-test)
import { hexToBytes, bytesToHex, loadProfile } from './dpd.mjs';

// The Universal Device Inquiry request (broadcast). Most synths reply with an Identity Reply.
export const INQUIRY = 'F0 7E 7F 06 01 F7';
export function buildInquiry() { return INQUIRY; }

// Parse a Universal Identity Reply:
//   F0 7E <dev> 06 02 <mfr(1 or 3)> <familyLSB familyMSB> <memberLSB memberMSB> <ver*4> F7
export function parseIdentityReply(hex) {
  const b = hexToBytes(hex);
  if (b[0] !== 0xf0 || b[1] !== 0x7e || b[3] !== 0x06 || b[4] !== 0x02 || b[b.length - 1] !== 0xf7) {
    return { ok: false, error: 'not a Universal Identity Reply' };
  }
  let i = 5;
  const mfrLen = b[i] === 0x00 ? 3 : 1;
  const manufacturerId = bytesToHex(b.slice(i, i + mfrLen)); i += mfrLen;
  const family = bytesToHex(b.slice(i, i + 2)); i += 2;
  const member = bytesToHex(b.slice(i, i + 2)); i += 2;
  const version = bytesToHex(b.slice(i, i + 4));
  return { ok: true, deviceId: bytesToHex([b[2]]), manufacturerId, family, member, version };
}

// Resolve an Identity Reply to a profile. Degrades: model -> manufacturer -> none.
export function matchProfile(reply, profiles) {
  if (!reply.ok) return { level: 'none', reason: reply.error };
  const mfr = profiles.find((p) => p.kind === 'manufacturer'
    && (p.identity?.manufacturerId ?? p.manufacturerId) === reply.manufacturerId);

  const models = profiles.filter((p) => (p.kind === 'model' || p.kind === 'variant')
    && p.identity && p.identity.family === reply.family && p.identity.member === reply.member);
  // variant wins over model when firmware matches
  const variant = models.find((p) => p.kind === 'variant' && p.identity.firmware
    && reply.version.startsWith(p.identity.firmware));
  const model = variant ?? models.find((p) => p.kind === 'model') ?? models[0];

  if (model) {
    return { level: 'model', profileId: model.id, manufacturerId: mfr?.id ?? null,
             label: model.label, candidates: models.map((m) => m.id) };
  }
  if (mfr) {
    return { level: 'manufacturer', profileId: mfr.id, label: mfr.label,
             handoff: `Recognized ${mfr.label} — pick the exact model, or profile it fresh with ${mfr.label} conventions already loaded.` };
  }
  return { level: 'none',
           handoff: "Don't recognize this device yet — start a new profile from the closest family." };
}

// ---- self-test ----
if (process.argv[1]?.endsWith('match.mjs')) {
  let pass = 0, fail = 0;
  const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log(`  ✗ ${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); } };

  eq(buildInquiry(), 'F0 7E 7F 06 01 F7', 'inquiry message');

  // A Roland identity reply (structure is real; these family/member codes are illustrative).
  const replyHex = 'F0 7E 10 06 02 41 02 01 00 00 01 00 00 00 F7';
  const reply = parseIdentityReply(replyHex);
  eq(reply.ok, true, 'reply parses');
  eq(reply.manufacturerId, '41', 'reply manufacturerId');
  eq(reply.family, '02 01', 'reply family');
  eq(reply.member, '00 00', 'reply member');

  const roland = loadProfile('roland');
  const gaia = loadProfile('roland.gaia');

  // GAIA has no identity codes yet -> degrades to manufacturer (honest; codes need a hw capture).
  const deg = matchProfile(reply, [roland, gaia]);
  eq(deg.level, 'manufacturer', 'degrades to manufacturer when model identity unknown');
  eq(deg.profileId, 'roland', 'degraded match = roland');

  // A model that DOES declare identity codes -> full model match.
  const modelWithId = { kind: 'model', id: 'roland.example', label: 'Example',
    identity: { manufacturerId: '41', family: '02 01', member: '00 00' } };
  const m = matchProfile(reply, [roland, modelWithId]);
  eq(m.level, 'model', 'model match when identity codes present');
  eq(m.profileId, 'roland.example', 'model match id');

  // Variant resolution by firmware.
  const variant = { kind: 'variant', id: 'roland.example.fw1', inherits: 'roland.example',
    identity: { manufacturerId: '41', family: '02 01', member: '00 00', firmware: '01 00' } };
  const mv = matchProfile(reply, [roland, modelWithId, variant]);
  eq(mv.profileId, 'roland.example.fw1', 'variant wins on firmware match');

  // Unknown manufacturer -> no-match handoff into contribution.
  const unknown = parseIdentityReply('F0 7E 10 06 02 43 00 00 00 00 00 00 00 00 F7');
  const none = matchProfile(unknown, [roland, gaia]);
  eq(none.level, 'none', 'unknown manufacturer -> none');
  if (none.level === 'none') pass++; // handoff present
  else fail++;

  console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
