// Layer 3 — contribution flywheel curation logic (the doc's "most determinative gap").
// The community backend needs a server; this is the pure, testable curation core: one canonical
// profile per id, submissions as proposed changes, round-trip as a hard gate, confirmation vs.
// fork, partial-accrete, conflict -> new version / variant, versioning + revert + pin, reputation.
import { resolveParams, encodeValue, decodeValue } from './dpd.mjs';

// ---- structured, id-keyed diff of two model profiles (domain language, not byte noise) ----
const paramKey = (p) => JSON.stringify({ a: p.address ?? null, t: p.valueType, e: p.enum ?? null, r: p.range ?? null, w: p.wires ?? null, rx: p.rxLive ?? null });
function paramsOf(profile) {
  const out = {};
  for (const sc of Object.values(profile.scopes ?? {})) for (const p of sc.parameters ?? []) out[p.id] = p;
  return out;
}
export function structuredDiff(base, next) {
  const a = paramsOf(base), b = paramsOf(next);
  const added = [], removed = [], changed = [];
  for (const id of Object.keys(b)) if (!(id in a)) added.push(id);
  for (const id of Object.keys(a)) if (!(id in b)) removed.push(id);
  for (const id of Object.keys(a)) if (id in b && paramKey(a[id]) !== paramKey(b[id])) changed.push(id);
  return { added, removed, changed, identical: !added.length && !removed.length && !changed.length };
}

// ---- round-trip gate: a profile that doesn't pack/unpack never enters the library ----
export function roundTripCheck(profile) {
  const failures = [];
  let params;
  try { params = resolveParams(profile); } catch (e) { return { ok: false, failures: ['resolve: ' + e.message] }; }
  for (const p of params) {
    const enc = p.encoding ?? { type: 'u7' };
    const probe = p.valueType === 'enum' ? (p.enum ?? []).map((e) => e.wire)
      : [p.range?.min ?? 0, Math.round(((p.range?.min ?? 0) + (p.range?.max ?? 127)) / 2), p.range?.max ?? 127];
    for (const v of probe) {
      try { if (decodeValue(enc, encodeValue(enc, v)) !== v) failures.push(`${p.resolvedId}=${v}`); }
      catch (e) { failures.push(`${p.resolvedId}=${v}: ${e.message}`); }
    }
  }
  return { ok: failures.length === 0, failures };
}

const bump = (v, part = 'minor') => {
  const [maj, min, pat] = v.split('.').map(Number);
  return part === 'major' ? `${maj + 1}.0.0` : part === 'patch' ? `${maj}.${min}.${pat + 1}` : `${maj}.${min + 1}.0`;
};

// ---- the canonical library + flywheel ----
export class Library {
  constructor() { this.entries = new Map(); /* id -> {versions:[{version,profile,...}], pinned} */ this.reputation = new Map(); }

  rep(user) { return this.reputation.get(user) ?? 0; }
  _addRep(user, n) { this.reputation.set(user, this.rep(user) + n); }
  canonical(id) { const e = this.entries.get(id); return e ? e.versions[e.versions.length - 1] : null; }
  versionList(id) { return (this.entries.get(id)?.versions ?? []).map((v) => v.version); }

  // Submit a profile from `user`. Returns { status, ... }. Round-trip is a hard prerequisite.
  submit(profile, user, { hardwareVerified = false } = {}) {
    const rt = roundTripCheck(profile);
    if (!rt.ok) return { status: 'rejected', reason: 'round-trip failed', failures: rt.failures };

    const id = profile.id;
    const e = this.entries.get(id);
    if (!e) {
      this.entries.set(id, { versions: [{ version: profile.version, profile, contributors: [user], confirmations: 1, hardwareVerified }] });
      this._addRep(user, 1);
      return { status: 'created', id, version: profile.version };
    }

    const cur = this.canonical(id);
    const diff = structuredDiff(cur.profile, profile);

    if (diff.identical) { // confirmation, not a fork
      if (!cur.contributors.includes(user)) cur.contributors.push(user);
      cur.confirmations += 1;
      cur.hardwareVerified = cur.hardwareVerified || hardwareVerified;
      this._addRep(user, 1);
      return { status: 'confirmed', id, version: cur.version, confirmations: cur.confirmations };
    }

    if (diff.added.length && !diff.changed.length && !diff.removed.length) { // partial accrete -> new version
      const merged = structuredClone(cur.profile);
      const incoming = paramsOf(profile);
      const scope = Object.values(merged.scopes)[0]; // simplistic: append to first scope
      for (const aid of diff.added) scope.parameters.push(structuredClone(incoming[aid]));
      const version = bump(cur.version, 'minor');
      e.versions.push({ version, profile: { ...merged, version }, contributors: [...new Set([...cur.contributors, user])], confirmations: 1, hardwareVerified });
      this._addRep(user, 1);
      return { status: 'merged', id, version, addedParams: diff.added };
    }

    // genuine conflict (changed/removed): high-rep or hardware-verified -> new canonical version;
    // otherwise held as a proposal against the safe baseline (never a live mutation).
    if (hardwareVerified || this.rep(user) >= 5) {
      const version = bump(cur.version, 'patch');
      e.versions.push({ version, profile: { ...profile, version }, contributors: [user], confirmations: 1, hardwareVerified });
      this._addRep(user, 2);
      return { status: 'new-version', id, version, resolved: 'corrected', diff };
    }
    (e.proposals ??= []).push({ profile, user, diff });
    return { status: 'conflict-held', id, baseline: cur.version, suggestion: 'maybe a different variant?', diff };
  }

  revert(id, version) { // selecting a prior known-good version, not a recovery op
    const e = this.entries.get(id); const v = e?.versions.find((x) => x.version === version);
    if (!v) return { status: 'unknown-version' };
    e.versions.push({ ...structuredClone(v), version: bump(this.canonical(id).version, 'patch'), revertedFrom: version });
    return { status: 'reverted', to: version, asVersion: this.canonical(id).version };
  }
  pin(id, version) { const e = this.entries.get(id); if (e) e.pinned = version; return { status: 'pinned', id, version }; }
  resolvedFor(user, id) { const e = this.entries.get(id); return e?.pinned ?? this.canonical(id)?.version; }

  // Downloader caution: round-trip-only, single-source, hw-unverified -> gate risky ops once.
  cautionFor(id, op) {
    const cur = this.canonical(id); if (!cur) return null;
    const risky = op === 'bulkSend' || op === 'fullDumpWrite';
    if (risky && cur.confirmations < 2 && !cur.hardwareVerified)
      return `This profile hasn't been confirmed by other owners yet — ${op} anyway?`;
    return null;
  }
}
