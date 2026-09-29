/**
 * customComponentSourceLink.js — a placed custom component against the library package it came from.
 *
 * `Designer.sourcePackage` has recorded where an instance came from since packages existed, and the
 * Public API card compared fingerprints with it — but all it could ever say was "edited since source
 * package load", and it said it about nearly every instance on a real panel, because the fingerprint
 * hashes the whole control and a placed instance has been given a position, a layer and a name
 * (customComponentFingerprint.test.js pins that a resize IS a change to the fingerprint, and it is
 * right to: the fingerprint is the package's content address, not an instance comparison).
 *
 * This module is the instance comparison. It sorts every difference into one of four kinds:
 *
 *   ignored     editor state that is nobody's edit: the control id, the provenance stamps, and the
 *               designer's own UI memory (which layer is selected, the preview mode, ...).
 *   instance    what belongs to this copy by definition: where it sits (Transform position and size),
 *               what it is called and addressed as, its layer, its variant, its device bindings, and its
 *               panel routes (the `Links` entries that point at another control). A package never owns
 *               these.
 *   override    what the author PUBLISHED for instances to change: published input channels and
 *               editable-property paths, plus every channel's `currentValue`, which is state.
 *   design      everything else — parts, hit zones, behaviours, generators, assets, channel shapes,
 *               the public contract itself. This is what the package owns.
 *
 * and, when it can find the exact package version the instance was placed from, tells apart a design
 * difference that happened IN THE LIBRARY from one that happened ON THIS COPY. That is what makes an
 * update safe: an update takes the library's design, keeps the copy's instance fields and published
 * overrides, and REFUSES — it does not silently win — when the copy carries design edits of its own.
 *
 * The base version is found by fingerprint, not by id: `saveControl` overwrites an entry with the same
 * name@version, so an id can outlive the content it named. When the base is gone, the comparison is
 * two-way and every design difference is reported with an unknown origin, which blocks a plain update
 * in exactly the same way a local edit does.
 */
import { deepClone } from './deepClone.js';
import {
  customComponentPackageProvenance,
  normalizeCustomComponentEnvelope,
} from './customComponentPackage.js';

const IGNORED_DESIGNER_KEYS = new Set([
  'packageName', 'packageVersion', 'packageId', 'packageFingerprint', 'packageImportedAt', 'sourcePackage',
  'designWidth', 'designHeight',
  'mode', 'authoringStage', 'selectedAssistantContext', 'selectedLayer', 'selectedValueChannel',
  'selectedBehavior', 'selectedHitZone', 'selectedGenerator', 'selectedAsset', 'selectedState',
  'selectedPart', 'preview', 'focusSection', 'focusApiMode',
]);

const INSTANCE_CORE_KEYS = new Set([
  'name', 'layer', 'zIndex', 'visible', 'enabled', 'locked', 'alwaysOnTop', 'tooltip', 'screenReaderText',
  // The host parameter ids this copy's channels keep from the panel knobs they were made from
  // (customComponentFromControls.js, exportParameters.keepHostParameterIds). A DAW's automation
  // belongs to this copy, not to the package.
  'hostParameters',
]);

const INSTANCE_TRANSFORM_KEYS = new Set([
  'x', 'y', 'width', 'height', 'anchor', 'affectsFit', 'rotation', 'scale', 'opacity',
]);

const PANEL_ROUTE_TYPES = new Set(['external-output', 'route-value', 'mirror']);

const SECTION_LABELS = {
  Core: 'Core',
  Transform: 'Size & position',
  Background: 'Background',
  Effects: 'Effects',
  Mouse: 'Mouse',
  Designer: 'Designer',
  Parts: 'Parts',
  Assets: 'Assets',
  ValueChannels: 'Value channels',
  Behaviors: 'Behaviours',
  HitZones: 'Hit zones',
  Generators: 'Generators',
  Bindings: 'Bindings',
  Links: 'Links',
  States: 'States',
  Animations: 'Animations',
  DeviceBindings: 'Device bindings',
  PublishedProperties: 'Public API',
  ExternalAPI: 'Public API',
  Variants: 'Variants',
  Scripts: 'Scripts',
};

function stableStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether a `Links` child is a panel route — wiring from this instance to ANOTHER control on the panel.
 * Those are made on the panel, per instance; a package can never contain a correct one.
 */
export function isPanelRouteLink(link) {
  if (!isPlainObject(link)) return false;
  const type = String(link.type ?? '').trim().toLowerCase();
  if (!PANEL_ROUTE_TYPES.has(type)) return false;
  return !!String(link.targetControlId ?? link.targetComponentId ?? '').trim()
    || /^[^.:/]+[.:/][^.:/]+$/.test(String(link.target ?? '').trim());
}

/**
 * Flatten a control into `path → leaf value`, in the same dotted notation `valueAtPath` reads
 * (`_children` levels are transparent, `_type` markers are dropped). Arrays are leaves: a list of
 * bindings or points is compared whole, which is also how an author thinks about it.
 */
export function flattenControl(control) {
  const out = new Map();
  const walk = (value, path) => {
    if (!isPlainObject(value)) {
      if (path) out.set(path, value);
      return;
    }
    const keys = Object.keys(value).filter((key) => key !== '_type');
    if (!keys.length) {
      if (path) out.set(path, value);
      return;
    }
    for (const key of keys) {
      if (key === '_children') {
        const children = value._children;
        if (isPlainObject(children) && Object.keys(children).length) walk(children, path);
        continue;
      }
      walk(value[key], path ? `${path}.${key}` : key);
    }
  };
  walk(control?._children ?? {}, '');
  return out;
}

/**
 * What the instance may change without editing the component, as a list of path prefixes. Read from
 * BOTH controls' PublishedProperties: a property the new source stops publishing is still one this
 * copy was allowed to set, and the report has to be able to say it is being dropped.
 */
export function publishedOverridePaths(...controls) {
  const paths = new Set();
  for (const control of controls) {
    const published = control?._children?.PublishedProperties ?? {};
    for (const entry of Object.values(published.inputs ?? {})) {
      if (!entry || entry.enabled === false) continue;
      const channel = String(entry.channel ?? '').trim();
      if (!channel) continue;
      paths.add(`ValueChannels.${channel}.defaultValue`);
      paths.add(`ValueChannels.${channel}.currentValue`);
    }
    for (const entry of Object.values(published.editableProperties ?? {})) {
      if (!entry || entry.enabled === false) continue;
      const path = String(entry.path ?? '').trim();
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

function matchesPrefix(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

/** The kind of a flattened path — see the header. `routeNames` are this instance's panel routes. */
export function classifySourcePath(path, { overridePaths = [], routeNames = new Set() } = {}) {
  const [section, key, sub] = path.split('.');
  if (section === 'Core') {
    if (key === 'id' || key === 'controlType') return 'ignored';
    if (INSTANCE_CORE_KEYS.has(key)) return 'instance';
  }
  if (section === 'Designer') {
    if (IGNORED_DESIGNER_KEYS.has(key)) return 'ignored';
    if (key === 'activeVariant') return 'instance';
  }
  if (section === 'Transform' && INSTANCE_TRANSFORM_KEYS.has(key)) return 'instance';
  // Filled in at placement when the author left it blank (instantiateCustomComponentPackageControl),
  // and it is the name scripts address THIS copy by.
  if (section === 'ExternalAPI' && key === 'addressableName') return 'instance';
  if (section === 'DeviceBindings' || section === 'Children') return 'instance';
  if (section === 'Variants' && key === 'active') return 'instance';
  if (section === 'Links' && routeNames.has(key)) return 'instance';
  if (section === 'ValueChannels' && sub === 'currentValue') return 'override';
  if (matchesPrefix(path, overridePaths)) return 'override';
  return 'design';
}

function routeNamesOf(...controls) {
  const names = new Set();
  for (const control of controls) {
    for (const [name, link] of Object.entries(control?._children?.Links?._children ?? {})) {
      if (isPanelRouteLink(link)) names.add(name);
    }
  }
  return names;
}

/**
 * Every leaf that differs between two controls, as `{ path, left, right }`. `undefined` on one side
 * means the path exists only on the other.
 */
function differingPaths(left, right) {
  const a = flattenControl(left);
  const b = flattenControl(right);
  const out = [];
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const l = a.get(path);
    const r = b.get(path);
    if (!sameValue(l, r)) out.push({ path, left: l, right: r });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

// ---------------------------------------------------------------------------------------------------
// Finding the source

/** The package family — the slug before `@` in a package id (`macro-knob@1-2-0` → `macro-knob`). */
export function packageFamily(packageId) {
  const id = String(packageId ?? '').trim();
  if (!id) return '';
  const at = id.lastIndexOf('@');
  return at > 0 ? id.slice(0, at) : id;
}

function versionParts(version) {
  return String(version ?? '').split(/[^0-9]+/).filter(Boolean).map(Number);
}

/** Semver-ish, numeric segment by segment; `1.10.0` is newer than `1.9.0`. */
export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function entryFamily(entry) {
  return packageFamily(entry?.id ?? '');
}

function entryTime(entry) {
  const time = Date.parse(entry?.savedAt ?? entry?.envelope?.exportedAt ?? '');
  return Number.isFinite(time) ? time : 0;
}

/**
 * The library entries this instance relates to: its family's versions, newest first; `latest`, the
 * one an update would take; and `base`, the exact entry it was placed from (by fingerprint), if the
 * library still holds it.
 */
export function findSourceEntries(control, libraryEntries = []) {
  const designer = control?._children?.Designer ?? {};
  const source = designer.sourcePackage ?? null;
  const packageId = String(source?.id ?? designer.packageId ?? '').trim();
  const family = packageFamily(packageId);
  const fingerprint = String(source?.fingerprint ?? designer.packageFingerprint ?? '').trim();
  if (!family) return { linked: false, family: '', packageId: '', fingerprint, versions: [], latest: null, base: null };

  const versions = (Array.isArray(libraryEntries) ? libraryEntries : [])
    .filter((entry) => entry?.component?._children && entryFamily(entry) === family)
    .sort((a, b) => compareVersions(b.version, a.version) || entryTime(b) - entryTime(a));
  const base = fingerprint ? versions.find((entry) => entry.fingerprint === fingerprint) ?? null : null;
  return { linked: true, family, packageId, fingerprint, versions, latest: versions[0] ?? null, base };
}

// ---------------------------------------------------------------------------------------------------
// The diff

function labelFor(path) {
  const [section, ...rest] = path.split('.');
  const head = SECTION_LABELS[section] ?? section;
  return rest.length ? `${head} › ${rest.join(' › ')}` : head;
}

function groupFor(path) {
  const [section, name] = path.split('.');
  const collection = ['Parts', 'HitZones', 'Behaviors', 'Generators', 'ValueChannels', 'States', 'Animations', 'Links'];
  if (collection.includes(section) && name) return `${SECTION_LABELS[section] ?? section} › ${name}`;
  return SECTION_LABELS[section] ?? section;
}

/**
 * Compare an instance with its library source.
 *
 * Returns:
 *   status        'unlinked' | 'missing' | 'current' | 'edited' | 'update' | 'diverged'
 *                 missing  — linked, but nothing of its family is in this library
 *                 current  — the source is what it was placed from, and the copy has no design edits
 *                 edited   — the copy has design edits of its own; the library has nothing newer
 *                 update   — the library has a different version and the copy has no design edits
 *                 diverged — both: an update would have to discard this copy's edits
 *   baseKnown     whether the placed-from version was found (three-way) or not (two-way)
 *   design        [{ path, label, group, instance, source, base, origin }] against `latest`; origin is
 *                 'library' | 'local' | 'both' | 'unknown'
 *   overrides     [{ path, label, instance, source, carried }] published values this copy sets;
 *                 `carried` false when the latest source no longer publishes that path
 *   instance      count of instance-field differences (placement, name, routes) — never a conflict
 *   localEdits    design differences that are this copy's own (or of unknown origin)
 *   libraryChanges design differences that came from the library
 */
export function diffCustomComponentAgainstSource(control, libraryEntries = []) {
  const found = findSourceEntries(control, libraryEntries);
  const empty = {
    ...found, status: found.linked ? 'missing' : 'unlinked', baseKnown: false,
    design: [], overrides: [], instance: 0, localEdits: 0, libraryChanges: 0, groups: [],
  };
  if (!found.linked || !found.latest) return empty;

  const latest = found.latest.component;
  const base = found.base?.component ?? null;
  const overridePaths = publishedOverridePaths(control, latest, base);
  const routeNames = routeNamesOf(control, latest, base);
  const context = { overridePaths, routeNames };

  const baseFlat = base ? flattenControl(base) : null;
  const instanceFlat = flattenControl(control);
  const design = [];
  const overrides = [];
  let instanceCount = 0;
  let defaultChanges = 0;
  const latestPublished = new Set(publishedOverridePaths(latest));

  for (const { path, left, right } of differingPaths(control, latest)) {
    const kind = classifySourcePath(path, context);
    if (kind === 'ignored') continue;
    if (kind === 'instance') { instanceCount += 1; continue; }
    if (kind === 'override') {
      // A running value that nobody published is state, not a customisation worth a line.
      if (path.endsWith('.currentValue') && !matchesPrefix(path, overridePaths)) continue;
      // A published value this copy never touched is not its override: the difference is the
      // library changing the default, and an update is how the copy gets it.
      if (baseFlat && sameValue(left, baseFlat.get(path))) {
        defaultChanges += 1;
        design.push({ path, label: labelFor(path), group: groupFor(path), instance: left, source: right, base: left, origin: 'library' });
        continue;
      }
      overrides.push({
        path,
        label: labelFor(path),
        instance: left,
        source: right,
        carried: matchesPrefix(path, [...latestPublished]) || path.endsWith('.currentValue'),
      });
      continue;
    }
    let origin = 'unknown';
    if (baseFlat) {
      const was = baseFlat.get(path);
      const local = !sameValue(left, was);
      const library = !sameValue(right, was);
      origin = local && library ? 'both' : (local ? 'local' : 'library');
    }
    design.push({ path, label: labelFor(path), group: groupFor(path), instance: left, source: right, base: baseFlat?.get(path), origin });
  }

  // Counted against the BASE when it is known, not read off `design`: a copy whose edit the library
  // later made too shows no difference from the latest, and is still a copy that was edited — but an
  // update would not lose anything, so only edits that still DIFFER from the latest can block one.
  const designPaths = (left, right) => differingPaths(left, right)
    .filter(({ path }) => classifySourcePath(path, context) === 'design');
  const latestFlat = flattenControl(latest);
  let localEdits;
  let libraryChanges;
  if (baseFlat) {
    localEdits = designPaths(control, base)
      .filter(({ path }) => !sameValue(instanceFlat.get(path), latestFlat.get(path))).length;
    libraryChanges = designPaths(base, latest).length + defaultChanges;
  } else {
    // Two-way: nothing can be attributed, so every difference counts against an update.
    localEdits = design.length;
    libraryChanges = design.length;
  }

  let status;
  if (!design.length && !localEdits) status = 'current';
  else if (!libraryChanges || (baseFlat && found.base.fingerprint === found.latest.fingerprint)) status = 'edited';
  else status = localEdits ? 'diverged' : 'update';

  const groups = [];
  for (const row of design) {
    let group = groups.find((entry) => entry.group === row.group);
    if (!group) { group = { group: row.group, rows: [] }; groups.push(group); }
    group.rows.push(row);
  }

  return {
    ...found,
    status,
    baseKnown: !!found.base,
    design,
    overrides,
    instance: instanceCount,
    localEdits,
    libraryChanges,
    groups,
  };
}

/** One line a person can act on: "Library 1.2.0 changes 3 things in Parts › handle and Hit zones". */
export function describeSourceDiff(report) {
  if (!report) return '';
  const version = report.latest?.version ?? '';
  const areas = [...new Set(report.design.map((row) => row.group.split(' › ')[0]))];
  const where = areas.length > 3 ? `${areas.slice(0, 3).join(', ')} and ${areas.length - 3} more` : areas.join(' and ');
  switch (report.status) {
    case 'unlinked': return 'Not linked to a library package.';
    case 'missing': return 'The source package is not in this library.';
    case 'current':
      if (report.base && report.base !== report.latest && report.base.fingerprint !== report.latest.fingerprint) {
        return `Nothing in library ${version} changes this copy — it only changes values this copy sets itself.`;
      }
      return report.overrides.length
      ? `Up to date with ${version}; ${report.overrides.length} published value${report.overrides.length === 1 ? '' : 's'} set on this copy.`
      : `Up to date with ${version}.`;
    case 'edited': return `${report.localEdits} design edit${report.localEdits === 1 ? '' : 's'} on this copy, in ${where}.`;
    case 'update': return `Library ${version} changes ${report.libraryChanges || report.design.length} thing${(report.libraryChanges || report.design.length) === 1 ? '' : 's'}${where ? ` in ${where}` : ''}.`;
    case 'diverged': return report.baseKnown
      ? `Library ${version} changed, and this copy has ${report.localEdits} design edit${report.localEdits === 1 ? '' : 's'} of its own.`
      : `${report.design.length} design difference${report.design.length === 1 ? '' : 's'} from library ${version}; the version this copy was placed from is no longer in the library, so their origin is unknown.`;
    default: return '';
  }
}

// ---------------------------------------------------------------------------------------------------
// Operations

function stampProvenance(designer, entry, importedAt) {
  const provenance = customComponentPackageProvenance(entry.envelope ?? entry, importedAt);
  return {
    ...designer,
    packageName: provenance?.name ?? entry.name ?? '',
    packageVersion: provenance?.version ?? entry.version ?? '1.0.0',
    packageId: provenance?.id ?? entry.id ?? '',
    packageFingerprint: provenance?.fingerprint ?? entry.fingerprint ?? '',
    packageImportedAt: provenance?.importedAt ?? importedAt,
    sourcePackage: provenance,
  };
}

function setAtPath(control, path, value) {
  const segments = path.split('.');
  let node = control._children;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const holder = isPlainObject(node?._children) && node._children[key] !== undefined ? node._children : node;
    if (!isPlainObject(holder?.[key])) return false;
    node = holder[key];
  }
  const last = segments[segments.length - 1];
  const holder = isPlainObject(node?._children) && node._children[last] !== undefined ? node._children : node;
  if (!isPlainObject(holder)) return false;
  holder[last] = deepClone(value);
  return true;
}

/**
 * Rebuild an instance on a library entry: the entry's design, this copy's instance fields, and — unless
 * `keepOverrides` is false — this copy's published values.
 *
 * Refuses (returns `{ refused }` and no control) when the copy carries design edits of its own and
 * `discardLocalEdits` is not set. That is the whole point of the operation: an update that quietly
 * throws away the work it was supposed to keep is worse than no update.
 *
 * Returns `{ control, carried: [paths], dropped: [paths], discarded: n }`.
 */
export function rebaseCustomComponentOnSource(control, entry, options = {}) {
  const { report = null, discardLocalEdits = false, keepOverrides = true, importedAt = new Date().toISOString() } = options;
  if (!control?._children || !entry?.component?._children) return { refused: 'No source to update from.' };
  const localEdits = report?.localEdits ?? 0;
  if (localEdits && !discardLocalEdits) {
    return { refused: `This copy has ${localEdits} design edit${localEdits === 1 ? '' : 's'} an update would discard.` };
  }

  const envelope = normalizeCustomComponentEnvelope(entry.envelope ?? entry);
  const source = deepClone(envelope?.component ?? entry.component);
  const next = { ...deepClone(control), _children: source._children };
  const children = next._children;
  const mine = control._children;

  // Instance fields — the same set the diff calls `instance`.
  children.Core = { ...(children.Core ?? {}), _type: 'Core', id: mine.Core?.id, controlType: 'CustomComponent' };
  for (const key of INSTANCE_CORE_KEYS) {
    if (mine.Core && key in mine.Core) children.Core[key] = deepClone(mine.Core[key]);
  }
  const sourceTransform = children.Transform ?? {};
  children.Transform = { ...sourceTransform, _type: 'Transform' };
  for (const key of INSTANCE_TRANSFORM_KEYS) {
    if (mine.Transform && key in mine.Transform) children.Transform[key] = deepClone(mine.Transform[key]);
  }
  if (mine.DeviceBindings) children.DeviceBindings = deepClone(mine.DeviceBindings);
  if (mine.ExternalAPI && 'addressableName' in mine.ExternalAPI) {
    children.ExternalAPI = { ...(children.ExternalAPI ?? { _type: 'ExternalAPI' }), addressableName: mine.ExternalAPI.addressableName };
  }
  // Controls nested inside this one belong to the panel, not the package.
  if (mine.Children) children.Children = deepClone(mine.Children);
  if (mine.Variants && 'active' in mine.Variants && children.Variants) {
    const variants = children.Variants._children ?? children.Variants.variants ?? {};
    const active = mine.Variants.active;
    if (!active || active === 'default' || Object.prototype.hasOwnProperty.call(variants, active)) children.Variants.active = active;
  }

  // Panel routes survive; the package's own links come from the package.
  const routes = Object.entries(mine.Links?._children ?? {}).filter(([, link]) => isPanelRouteLink(link));
  if (routes.length) {
    children.Links = { _type: 'Links', enabled: true, ...(children.Links ?? {}) };
    children.Links._children = { ...(children.Links._children ?? {}) };
    for (const [name, link] of routes) children.Links._children[name] = deepClone(link);
  }

  // Designer: the package's, with this copy's provenance and the workspace memory it had.
  const designer = { ...(children.Designer ?? {}), _type: 'Designer' };
  for (const key of IGNORED_DESIGNER_KEYS) {
    if (mine.Designer && key in mine.Designer) designer[key] = deepClone(mine.Designer[key]);
  }
  if (mine.Designer && 'activeVariant' in mine.Designer) designer.activeVariant = mine.Designer.activeVariant;
  designer.designWidth = Number(sourceTransform.width) || designer.designWidth;
  designer.designHeight = Number(sourceTransform.height) || designer.designHeight;
  children.Designer = stampProvenance(designer, entry, importedAt);

  const carried = [];
  const dropped = [];
  if (keepOverrides) {
    const mineFlat = flattenControl(control);
    const baseFlat = report?.base?.component ? flattenControl(report.base.component) : null;
    const newPublished = publishedOverridePaths(next);
    const nextFlat = flattenControl(next);
    for (const path of publishedOverridePaths(control)) {
      for (const [leaf, value] of mineFlat) {
        if (leaf !== path && !leaf.startsWith(`${path}.`)) continue;
        // An override is a value this copy set. With the placed-from version known that is exact;
        // without it, anything that differs from the new source is kept, which errs toward the user.
        const wasSet = baseFlat ? !sameValue(value, baseFlat.get(leaf)) : !sameValue(value, nextFlat.get(leaf));
        if (!wasSet) continue;
        if (!matchesPrefix(leaf, newPublished) || !nextFlat.has(leaf)) { dropped.push(leaf); continue; }
        if (setAtPath(next, leaf, value)) carried.push(leaf);
        else dropped.push(leaf);
      }
    }
    // Running values of channels both sides have are state; keep them so a knob does not jump — but
    // only where the copy has moved off its source, or a new default would never show.
    for (const [name, channel] of Object.entries(mine.ValueChannels?._children ?? {})) {
      const leaf = `ValueChannels.${name}.currentValue`;
      const target = children.ValueChannels?._children?.[name];
      if (!target || !channel || !('currentValue' in channel) || carried.includes(leaf)) continue;
      if (baseFlat && sameValue(channel.currentValue, baseFlat.get(leaf))) continue;
      target.currentValue = deepClone(channel.currentValue);
    }
  }

  return { control: next, carried, dropped, discarded: discardLocalEdits ? localEdits : 0 };
}

/**
 * Stop being an instance: keep everything as it is and drop the link. Returns a patch for
 * `applyControlPatch` — the provenance stamps, emptied — rather than a control, because nothing else
 * about the component changes.
 */
export function detachCustomComponentPatch() {
  return {
    'Designer.sourcePackage': null,
    'Designer.packageId': '',
    'Designer.packageFingerprint': '',
    'Designer.packageImportedAt': '',
  };
}

// ---------------------------------------------------------------------------------------------------
// Push: this copy's design, back to the library as the next version

/** The next minor version no entry in `versions` has: 1.2.0 → 1.3.0, skipping any already taken. */
export function nextPackageVersion(versions = []) {
  const taken = new Set(versions.map((entry) => String(entry?.version ?? '')));
  const newest = [...versions].sort((a, b) => compareVersions(b?.version, a?.version))[0]?.version ?? '1.0.0';
  const [major = 1, minor = 0] = versionParts(newest);
  let next = minor + 1;
  while (taken.has(`${major}.${next}.0`)) next += 1;
  return `${major}.${next}.0`;
}

/**
 * The component a push saves: this copy's DESIGN on top of the library version it came from.
 *
 * Push is only offered when the report says 'edited' — the copy has design edits and the library has
 * not moved on — so the base IS the latest, and nothing in the library is lost by saving over it. What
 * belongs to the copy stays the copy's: its position and size, name, layer, addressable name, device
 * bindings, panel routes, variant, and the published values it set (a label, an accent). The package
 * keeps its own for all of those, so pushing one copy's edits does not make its CUTOFF legend every
 * copy's default.
 *
 * Returns `{ component, version, metadata }`, or `{ refused }` saying why not.
 */
export function pushCustomComponentToSource(control, report) {
  if (!control?._children) return { refused: 'Nothing to save.' };
  if (report?.status !== 'edited' || !report.base?.component?._children) {
    return {
      refused: report?.status === 'diverged'
        ? 'The library has a newer version too. Update this copy (or reset it) first, so its changes are not saved over the library\'s.'
        : 'This copy has no design edits of its own to save.',
    };
  }
  const base = report.base.component._children;
  const component = deepClone(control);
  const children = component._children;

  // Instance fields: the package's own, not this copy's.
  for (const key of INSTANCE_CORE_KEYS) {
    if (base.Core && key in base.Core) children.Core[key] = deepClone(base.Core[key]);
    else delete children.Core[key];
  }
  children.Transform = { ...(children.Transform ?? {}), _type: 'Transform' };
  for (const key of INSTANCE_TRANSFORM_KEYS) {
    if (base.Transform && key in base.Transform) children.Transform[key] = deepClone(base.Transform[key]);
  }
  if (base.DeviceBindings) children.DeviceBindings = deepClone(base.DeviceBindings);
  else delete children.DeviceBindings;
  if (children.ExternalAPI) {
    children.ExternalAPI = { ...children.ExternalAPI, addressableName: base.ExternalAPI?.addressableName ?? '' };
  }
  if (base.Children) children.Children = deepClone(base.Children);
  else delete children.Children;
  if (children.Variants && base.Variants && 'active' in base.Variants) children.Variants.active = base.Variants.active;
  if (children.Links?._children) {
    const own = Object.fromEntries(Object.entries(children.Links._children).filter(([, link]) => !isPanelRouteLink(link)));
    const theirs = Object.fromEntries(Object.entries(base.Links?._children ?? {}).filter(([, link]) => isPanelRouteLink(link)));
    children.Links = { ...children.Links, _children: { ...own, ...theirs } };
  }

  // Published values: the package's defaults, not what this copy set them to.
  const baseFlat = flattenControl(report.base.component);
  for (const path of publishedOverridePaths(control)) {
    for (const [leaf] of flattenControl(component)) {
      if (leaf !== path && !leaf.startsWith(`${path}.`)) continue;
      if (baseFlat.has(leaf)) setAtPath(component, leaf, baseFlat.get(leaf));
    }
  }
  for (const [name, channel] of Object.entries(children.ValueChannels?._children ?? {})) {
    const leaf = `ValueChannels.${name}.currentValue`;
    if (channel && baseFlat.has(leaf)) channel.currentValue = deepClone(baseFlat.get(leaf));
  }

  // Designer: no provenance of its own — the export stamps the package's.
  if (children.Designer) {
    for (const key of ['packageName', 'packageVersion', 'packageId', 'packageFingerprint', 'packageImportedAt', 'sourcePackage']) {
      delete children.Designer[key];
    }
  }

  const version = nextPackageVersion(report.versions ?? []);
  const metadata = { ...(report.latest?.envelope?.metadata ?? {}), version };
  return { component, version, metadata };
}

/**
 * Re-point a copy at a library entry without changing anything else about it — used after a push,
 * when the copy's design IS that entry's. Returns a patch for `applyControlPatch`.
 */
export function relinkCustomComponentPatch(control, entry, importedAt = new Date().toISOString()) {
  const designer = stampProvenance({ ...(control?._children?.Designer ?? {}) }, entry, importedAt);
  return {
    'Designer.packageName': designer.packageName,
    'Designer.packageVersion': designer.packageVersion,
    'Designer.packageId': designer.packageId,
    'Designer.packageFingerprint': designer.packageFingerprint,
    'Designer.packageImportedAt': designer.packageImportedAt,
    'Designer.sourcePackage': designer.sourcePackage,
  };
}
