// profileCatalog.js — the device profile picker's view of the profile library.
//
// Ninety-odd profiles, and more to come, do not fit a dropdown. The picker lists them by brand and
// family, filters by brand, searches by model, and describes the one you are on. Everything it
// shows comes from the summary DeviceProfileService::listProfiles sends with each profile
// (DeviceProfileEngine::getCatalogSummary), or from `summaryFromProfile` below for a profile the
// local engine holds; nothing here opens a profile's parameters.
//
// Pure functions, no stores: DeviceProfilePicker.svelte and its tests both call these.

/**
 * Profiles kept for the panels and tests that name them, but not offered when you choose one: each
 * is an earlier, smaller version of a profile that does the whole job. A panel that still uses one
 * still shows it (as "This panel"), and "Show older and internal profiles" lists them all.
 */
export const SUPERSEDED_PROFILES = Object.freeze({
  'roland-gaia': { by: 'roland-gaia-sh01', note: 'The first GAIA SH-01 profile: 15 parameters, made by hand.' },
  'roland-gaia-dpd': { by: 'roland-gaia-sh01', note: "The Device Profile Designer's own GAIA SH-01 profile: 40 parameters." },
});

const INTERNAL_FAMILY = 'Internal Test';
const KIND_LABEL = { sysex: 'SysEx', nrpn: 'NRPN', rpn: 'RPN', cc: 'CC' };
const KIND_WORDS = { SysEx: 'SysEx', NRPN: 'NRPN', RPN: 'RPN', CC: 'Control change' };
const MAKER_PREFIX = { 'Dave Smith Instruments': ['Dave Smith Instruments ', 'DSI '] };

/** The summary the C++ engine sends, worked out from a whole profile (for local and draft profiles). */
export function summaryFromProfile(profile) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const kinds = [...new Set(list(profile?.messageRecipes).map((r) => String(r?.kind ?? '')).filter(Boolean))];
  return {
    id: profile?.id,
    name: profile?.name,
    manufacturer: profile?.manufacturer ?? '',
    family: profile?.family ?? '',
    status: profile?.status ?? '',
    parameterCount: list(profile?.parameters).length,
    messageKinds: kinds,
    readsBack: list(profile?.dumpDefinitions).length > 0 && list(profile?.requests).length > 0,
    presetRecall: list(profile?.presets?.banks).length > 0 && typeof profile?.presets?.recall === 'object' && profile.presets.recall !== null,
    identifies: list(profile?.identity?.familyCode).length > 0,
    source: String(profile?.sources?.[0]?.title ?? ''),
    verifiedOnHardware: profile?.coverage?.verifiedOnHardware === true,
  };
}

/** `Roland JD-Xi` under Roland reads `JD-Xi`; the full name stays where the brand is not beside it. */
function shortName(name, maker) {
  if (maker === 'Generic' || maker === 'Other') return name;
  const prefixes = MAKER_PREFIX[maker] ?? (maker ? [`${maker} `] : []);
  for (const prefix of prefixes) if (name.startsWith(prefix) && name.length > prefix.length) return name.slice(prefix.length);
  return name;
}

/** One picker row's worth of facts about a listed profile. */
export function catalogEntry(profile) {
  const id = String(profile?.id ?? '');
  const name = String(profile?.name || id);
  const maker = String(profile?.manufacturer || '').trim() || 'Other';
  const kinds = Array.isArray(profile?.messageKinds) ? profile.messageKinds : [];
  const kind = KIND_LABEL[kinds.find((k) => k === 'sysex') ?? kinds.find((k) => k === 'nrpn') ?? kinds[0]] ?? '';
  const superseded = SUPERSEDED_PROFILES[id] ?? null;
  const internal = profile?.family === INTERNAL_FAMILY;
  return {
    id,
    name,
    shortName: shortName(name, maker),
    maker,
    family: String(profile?.family || '').trim(),
    kind,
    speaks: KIND_WORDS[kind] ?? 'Unknown',
    parameterCount: Number.isInteger(profile?.parameterCount) ? profile.parameterCount : null,
    readsBack: profile?.readsBack === true,
    presetRecall: profile?.presetRecall === true,
    identifies: profile?.identifies === true,
    source: String(profile?.source ?? ''),
    verified: profile?.verifiedOnHardware === true,
    hidden: !!superseded || internal,
    hiddenReason: superseded?.note ?? (internal ? 'A profile the test suite uses, not an instrument.' : ''),
    supersededBy: superseded?.by ?? '',
    profile,
  };
}

export function catalogEntries(profiles) {
  return (Array.isArray(profiles) ? profiles : []).filter((p) => p?.id).map(catalogEntry);
}

/**
 * The brand row: every brand with a listed profile, most profiles first. "Generic" and "Other"
 * go last whatever their count: nobody's synth is called Generic.
 */
export function brandChips(entries, { showHidden = false } = {}) {
  const visible = entries.filter((e) => showHidden || !e.hidden);
  const counts = new Map();
  for (const e of visible) counts.set(e.maker, (counts.get(e.maker) ?? 0) + 1);
  const last = (maker) => (maker === 'Generic' || maker === 'Other' ? 1 : 0);
  const brands = [...counts].sort((a, b) => last(a[0]) - last(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]));
  return [{ id: '', label: 'All brands', count: visible.length }, ...brands.map(([maker, count]) => ({ id: maker, label: maker, count }))];
}

/** Every word of the query somewhere in the name, brand or family, in any order. */
export function matchesQuery(entry, query) {
  const words = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${entry.name} ${entry.shortName} ${entry.maker} ${entry.family}`.toLowerCase();
  return words.every((word) => hay.includes(word));
}

export function filterCatalog(entries, { query = '', brand = '', showHidden = false } = {}) {
  return entries.filter((e) => (showHidden || !e.hidden) && (!brand || e.maker === brand) && matchesQuery(e, query));
}

const byName = (a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true, sensitivity: 'base' });

/** Brand, then family, then model, the way the brand row orders brands. */
export function groupCatalog(entries) {
  const order = brandChips(entries, { showHidden: true }).slice(1).map((chip) => chip.id);
  const makers = new Map();
  for (const e of entries) {
    if (!makers.has(e.maker)) makers.set(e.maker, new Map());
    const families = makers.get(e.maker);
    const family = e.family || 'Other';
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(e);
  }
  return order.filter((maker) => makers.has(maker)).map((maker) => {
    const families = [...makers.get(maker)]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
      .map(([family, list]) => ({ family, entries: [...list].sort(byName) }));
    return { maker, count: families.reduce((n, f) => n + f.entries.length, 0), families };
  });
}

/** What the detail pane says the profile can and cannot do, in that order. */
export function capabilities(entry) {
  return [
    { yes: true, text: 'Sends every parameter it lists' },
    { yes: entry.readsBack, text: entry.readsBack ? 'Reads the synth’s sound back (Pull)' : 'Cannot read the synth back' },
    { yes: entry.presetRecall, text: entry.presetRecall ? 'Recalls presets by bank and program' : 'No preset recall' },
    { yes: entry.identifies, text: entry.identifies ? 'Recognises the synth when it is connected' : 'Cannot tell which synth is connected' },
  ];
}
