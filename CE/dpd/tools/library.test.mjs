// Tests for the L3 flywheel curation logic. Run: node CE/dpd/tools/library.test.mjs
import { Library, roundTripCheck } from './library.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const mk = (id, params, version = '1.0.0') => ({ schemaVersion: 1, id, version, kind: 'model',
  scopes: { main: { kind: 'global', instances: 1, parameters: params } } });
const cutoff = { id: 'cutoff', valueType: 'continuous', address: '00 00 00 0C', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { read: true, write: true } };
const reso = { id: 'reso', valueType: 'continuous', address: '00 00 00 0F', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { read: true, write: true } };

// round-trip gate
ok(roundTripCheck(mk('t', [cutoff])).ok, 'good profile round-trips');
ok(!roundTripCheck(mk('t', [{ ...cutoff, range: { min: 0, max: 200 } }])).ok, 'out-of-range u7 fails round-trip (gate)');
const packed = { id: 'pitch', valueType: 'continuous', address: '00 00 00 20', range: { min: 0, max: 65535 }, encoding: { type: 'packed8to7', bytes: 2, packOrder: 'msb-high-first' }, access: { read: true, write: true } };
ok(roundTripCheck(mk('k', [packed])).ok, 'packed8to7 (Korg) profile passes the round-trip gate — was blocked (C1)');

const lib = new Library();
eq(lib.submit(mk('x.bad', [{ ...cutoff, range: { min: 0, max: 200 } }]), '@a').status, 'rejected', 'broken profile rejected by gate');
eq(lib.submit(mk('x.syn', [cutoff]), '@a').status, 'created', 'first submit -> created');
eq(lib.canonical('x.syn').confirmations, 1, 'created confirmations = 1');

const c = lib.submit(mk('x.syn', [cutoff]), '@b');
eq(c.status, 'confirmed', 'identical resubmit -> confirmed (not a fork)');
eq(c.confirmations, 2, 'confirmations raised to 2');
ok(lib.rep('@b') >= 1, '@b gains reputation on confirmation');
eq(lib.versionList('x.syn'), ['1.0.0'], 'confirmation does not create a version');

const m = lib.submit(mk('x.syn', [cutoff, reso]), '@c');
eq(m.status, 'merged', 'superset -> merged (partial accrete)');
eq(m.addedParams, ['main::reso'], 'merged added [main::reso] (scope-qualified)');
ok(lib.versionList('x.syn').includes('1.1.0'), 'merge created version 1.1.0');

const held = lib.submit(mk('x.syn', [{ ...cutoff, address: '00 00 00 0D' }, reso]), '@d');
eq(held.status, 'conflict-held', 'low-rep conflicting change -> held proposal (safe baseline)');
eq(lib.canonical('x.syn').version, '1.1.0', 'held proposal does not mutate canonical');

const nv = lib.submit(mk('x.syn', [{ ...cutoff, address: '00 00 00 0D' }, reso]), '@e', { hardwareVerified: true });
eq(nv.status, 'new-version', 'hardware-verified conflict -> new canonical version');
ok(lib.rep('@e') >= 2, 'corrector gains more reputation');

lib.pin('x.syn', '1.0.0');
eq(lib.resolvedFor('@x', 'x.syn'), '1.0.0', 'pin to a known-good version');
eq(lib.revert('x.syn', '1.0.0').to, '1.0.0', 'revert selects a prior version');

const lib2 = new Library();
lib2.submit(mk('y.syn', [cutoff]), '@a');
ok(lib2.cautionFor('y.syn', 'bulkSend'), 'unconfirmed -> caution on bulk send');
ok(!lib2.cautionFor('y.syn', 'read'), 'no caution on read (low-risk)');
lib2.submit(mk('y.syn', [cutoff]), '@b');
ok(!lib2.cautionFor('y.syn', 'bulkSend'), 'confirmed (2 owners) -> no caution');

// scope-aware merge (C5): same id in two scopes must not collapse; accrete into the right scope
const ms = (extra = []) => ({ schemaVersion: 1, id: 'm.scope', version: '1.0.0', kind: 'model',
  scopes: { partA: { kind: 'part', parameters: [cutoff] }, partB: { kind: 'part', parameters: [{ ...cutoff }, ...extra] } } });
const lib3 = new Library();
lib3.submit(ms(), '@a');
const b4 = lib3.canonical('m.scope').profile;
ok(b4.scopes.partA.parameters.length === 1 && b4.scopes.partB.parameters.length === 1, 'same id in two scopes preserved (no collapse)');
const ms2 = lib3.submit(ms([reso]), '@b');
eq(ms2.status, 'merged', 'add a param to a non-first scope -> merged');
const af = lib3.canonical('m.scope').profile;
ok(af.scopes.partB.parameters.some((p) => p.id === 'reso'), 'reso accreted into partB (its own scope)');
ok(!af.scopes.partA.parameters.some((p) => p.id === 'reso'), 'reso did NOT land in partA (the first scope)');

// verifiedFullDump (C2): earned via dumps.mjs round-trip, recorded on the canonical version
const reso100 = { id: 'reso', valueType: 'continuous', address: '00 00 00 10', range: { min: 0, max: 100 }, encoding: { type: 'u7' }, access: { read: true, write: true } };
const dumpDev = (good) => ({ schemaVersion: 1, id: 'd.syn', version: '1.0.0', kind: 'model', deviceId: '10',
  scopes: { patch: { kind: 'global', instances: 1, parameters: [cutoff, reso100] } },
  dumps: [{ id: 'p', kind: 'patch', spans: ['patch'],
    message: { matcher: { prefix: ['F0', '7D', '$deviceId'], suffix: ['F7'] }, payload: { offset: 3, size: good ? 2 : 1 } },
    // good: distinct offsets; broken: cutoff & reso collide at offset 0 (different max values expose it)
    layout: [{ param: 'patch.cutoff', offset: 0 }, { param: 'patch.reso', offset: good ? 1 : 0 }] }] });
const libD = new Library();
eq(libD.submit(dumpDev(true), '@a').status, 'created', 'dumped profile submits');
eq(libD.canonical('d.syn').verifiedFullDump, true, 'good dump -> verifiedFullDump true');
const libD2 = new Library();
libD2.submit(dumpDev(false), '@a');
eq(libD2.canonical('d.syn').verifiedFullDump, false, 'colliding dump layout -> verifiedFullDump false');
const libD3 = new Library();
libD3.submit(mk('nd.syn', [cutoff]), '@a');
eq(libD3.canonical('nd.syn').verifiedFullDump, null, 'no dumps -> verifiedFullDump null (nothing to verify)');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
