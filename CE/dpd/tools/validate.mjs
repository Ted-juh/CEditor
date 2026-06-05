// Shared structural validator for DPD profiles. The formal contract is dpd.schema.json
// (usable by ajv / editors); this is the dependency-free check the tools run.
export function validateProfile(profile) {
  const errs = [];
  if (profile.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(profile.id ?? '')) errs.push('bad id');
  if (!/^\d+\.\d+\.\d+$/.test(profile.version ?? '')) errs.push('bad version');
  if (!['manufacturer', 'model', 'variant', 'component'].includes(profile.kind)) errs.push('bad kind');
  if (profile.kind === 'model' && !profile.scopes) errs.push('model needs scopes');
  if (profile.kind === 'variant' && !profile.inherits) errs.push('variant needs inherits');
  for (const [sk, sc] of Object.entries(profile.scopes ?? {})) {
    for (const p of sc.parameters ?? []) {
      if (!p.id) errs.push(`${sk}: param missing id`);
      if (!['continuous', 'signed', 'enum', 'toggle', 'trigger'].includes(p.valueType)) errs.push(`${sk}.${p.id}: bad valueType`);
      if (p.valueType === 'enum' && !Array.isArray(p.enum)) errs.push(`${sk}.${p.id}: enum needs entries`);
      if (p.address && !/^([0-9A-Fa-f]{2})(\s[0-9A-Fa-f]{2})*$/.test(p.address)) errs.push(`${sk}.${p.id}: bad address`);
      for (const w of [p.rxLive, ...(p.wires ?? [])].filter(Boolean)) {
        if (!['write', 'read', 'rxLive'].includes(w.dir)) errs.push(`${sk}.${p.id}: bad wire dir ${w.dir}`);
        if (!['dt1', 'rq1', 'cc', 'nrpn', 'raw'].includes(w.msg)) errs.push(`${sk}.${p.id}: bad wire msg ${w.msg}`);
      }
    }
  }
  if (profile.provenance && !['official', 'community', 'imported', 'learn'].includes(profile.provenance.source))
    errs.push('bad provenance.source');
  if (profile.completeness && !['full', 'partial', 'structural-only'].includes(profile.completeness))
    errs.push('bad completeness');
  return { ok: errs.length === 0, errors: errs };
}
