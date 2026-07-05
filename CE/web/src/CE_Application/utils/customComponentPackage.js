import { deepClone } from './deepClone.js';
import { materializedCustomComponentSnapshot } from './customComponentMaterializer.js';
import { summarizeCustomArpeggiator } from './customComponentArpeggiator.js';
import { migrateCustomComponentPlan } from './customComponentMigrations.js';
import { numberOr } from './primitives.js';

export const CUSTOM_COMPONENT_PACKAGE_FORMAT = 'ceditor-component';
export const CUSTOM_COMPONENT_PACKAGE_VERSION = 1;
export const CUSTOM_COMPONENT_LIBRARY_FORMAT = 'ceditor-component-library';
export const CUSTOM_COMPONENT_LIBRARY_VERSION = 1;
export const CUSTOM_COMPONENT_COMPATIBILITY_VERSION = 1;
export const CUSTOM_COMPONENT_ASSET_WARNING_BYTES = 2 * 1024 * 1024;
export const CUSTOM_COMPONENT_PACKAGE_ASSET_WARNING_BYTES = 8 * 1024 * 1024;

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slugify(value, fallback = 'component') {
  return String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || fallback;
}

function objectChildren(section) {
  return section?._children ?? {};
}

function resolveUnit(value, unit, total) {
  const numeric = numberOr(value, 0);
  return String(unit ?? 'px') === 'percent' ? (total * numeric) / 100 : numeric;
}

function anchorOffset(anchor, size) {
  switch (String(anchor ?? 'center')) {
    case 'left':
    case 'top':
      return 0;
    case 'right':
    case 'bottom':
      return size;
    default:
      return size / 2;
  }
}

function cssColour(value, fallback = '#5B9BD5') {
  const hex = String(value ?? '').replace(/^#/, '').trim();
  if (/^[0-9a-f]{8}$/i.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  return fallback;
}

function partThumbnailEntry(part, componentWidth, componentHeight) {
  const layout = part?._children?.Layout ?? {};
  const fill = part?._children?.Background?._children?.Fill ?? {};
  const valueArc = part?.meta?.valueArc ?? null;
  const corners = part?._children?.Background?._children?.Corners ?? {};
  const text = part?._children?.Text ?? null;
  const mode = String(layout.mode ?? 'absolute');
  const width = mode === 'fill' ? componentWidth : resolveUnit(layout.width, layout.widthUnit, componentWidth);
  const height = mode === 'fill' ? componentHeight : resolveUnit(layout.height, layout.heightUnit, componentHeight);
  const x = mode === 'fill' ? 0 : resolveUnit(layout.x, layout.xUnit, componentWidth) - anchorOffset(layout.anchorX, width) + numberOr(layout.offsetX, 0);
  const y = mode === 'fill' ? 0 : resolveUnit(layout.y, layout.yUnit, componentHeight) - anchorOffset(layout.anchorY, height) + numberOr(layout.offsetY, 0);
  return {
    name: part?.name ?? '',
    kind: part?.kind ?? part?.role ?? 'rectangle',
    x: Math.round((x / Math.max(1, componentWidth)) * 1000) / 10,
    y: Math.round((y / Math.max(1, componentHeight)) * 1000) / 10,
    width: Math.round((width / Math.max(1, componentWidth)) * 1000) / 10,
    height: Math.round((height / Math.max(1, componentHeight)) * 1000) / 10,
    rotation: Math.round(numberOr(layout.rotation, 0) * 10) / 10,
    radius: Math.round(numberOr(corners.radius, 0)),
    colour: cssColour(valueArc?.colour ?? fill.colour, part?.kind === 'text' ? '#E8EEF4' : '#5B9BD5'),
    text: text ? String(text.content ?? '').slice(0, 10) : '',
    zIndex: numberOr(part?.zIndex, 0),
  };
}

function editablePropertyPathIssue(path, sections) {
  const targetPath = String(path ?? '').trim();
  if (!targetPath) return 'has no target path';
  const partMatch = targetPath.match(/^Parts\.([^.[\]]+)(?:\.|$)/);
  if (partMatch) {
    const part = objectChildren(sections.Parts)[partMatch[1]];
    if (!part) return `targets missing part "${partMatch[1]}"`;
    return '';
  }
  if (targetPath.startsWith('Designer.')) {
    return sections.Designer ? '' : 'targets missing Designer section';
  }
  if (targetPath.startsWith('ValueChannels.')) {
    const channelMatch = targetPath.match(/^ValueChannels\.([^.[\]]+)(?:\.|$)/);
    if (channelMatch && !objectChildren(sections.ValueChannels)[channelMatch[1]]) {
      return `targets missing value channel "${channelMatch[1]}"`;
    }
    return '';
  }
  if (targetPath.startsWith('Core.')) {
    return sections.Core ? '' : 'targets missing Core section';
  }
  if (targetPath.startsWith('Assets.')) {
    const imageMatch = targetPath.match(/^Assets\.images\.([^.[\]]+)(?:\.|$)/);
    if (imageMatch && !(sections.Assets?.images ?? {})[imageMatch[1]]) {
      return `targets missing image asset "${imageMatch[1]}"`;
    }
    const filmstripMatch = targetPath.match(/^Assets\.filmstrips\.([^.[\]]+)(?:\.|$)/);
    if (filmstripMatch && !(sections.Assets?.filmstrips ?? {})[filmstripMatch[1]]) {
      return `targets missing filmstrip asset "${filmstripMatch[1]}"`;
    }
    return sections.Assets ? '' : 'targets missing Assets section';
  }
  return '';
}

function referencedCustomChannels(source) {
  const text = String(source ?? '').trim();
  if (!text) return [];
  const names = [];
  for (const match of text.matchAll(/(?:^|[^A-Za-z0-9_$])channel\.([A-Za-z_$][\w$]*)\.(?:raw|normalized|display|bool|enum)(?:$|[^A-Za-z0-9_$])/g)) {
    names.push(match[1]);
  }
  return uniqueList(names);
}

function simpleReferenceName(value) {
  const text = String(value ?? '').trim();
  return /^[A-Za-z_$][\w$]*$/.test(text) ? text : '';
}

function isLiteralLinkSource(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  const text = String(value).trim();
  return text === 'true' || text === 'false' || Number.isFinite(Number(text));
}

function normalizedTypeSet(entries = []) {
  return new Set(entries.map((entry) => String(entry?.type ?? entry?.role ?? entry?.kind ?? '').trim().toLowerCase()).filter(Boolean));
}

function capabilityLabelsFromControl(control) {
  const sections = control?._children ?? {};
  const values = objectChildren(sections.ValueChannels);
  const behaviors = objectChildren(sections.Behaviors);
  const hitZones = objectChildren(sections.HitZones);
  const generators = objectChildren(sections.Generators);
  const assets = sections.Assets ?? {};
  const links = objectChildren(sections.Links);
  const behaviorTypes = normalizedTypeSet(Object.entries(behaviors).map(([name, entry]) => ({
    type: entry?.type ?? entry?.role ?? name,
  })));
  const generatorTypes = normalizedTypeSet(Object.entries(generators).map(([name, entry]) => ({
    type: entry?.type ?? entry?.role ?? name,
  })));
  const labels = [];
  const arpeggiator = summarizeCustomArpeggiator(control);

  const channelCount = Object.keys(values).length;
  const behaviorCount = Object.keys(behaviors).length;
  const hitZoneCount = Object.keys(hitZones).length;
  const linkCount = Object.keys(links).length;
  const filmstripCount = Object.keys(assets.filmstrips ?? {}).length;

  if ([...behaviorTypes].some((type) => type.includes('button') || type === 'cycle' || type === 'toggle')) labels.push('button');
  if ([...behaviorTypes].some((type) => type.includes('slider') || type.includes('range'))) labels.push('slider');
  if ([...behaviorTypes].some((type) => type.includes('xy'))) labels.push('xy');
  if (arpeggiator.enabled) labels.push('arpeggiator', 'sequencer');
  if ([...behaviorTypes, ...generatorTypes].some((type) => type.includes('piano'))) labels.push('piano');
  if ([...generatorTypes].some((type) => type.includes('grid'))) labels.push('grid');
  if ([...generatorTypes].some((type) => type.includes('tick') || type.includes('radial'))) labels.push('ticks');
  if ([...generatorTypes].some((type) => type.includes('ring'))) labels.push('ring');
  if (filmstripCount > 0 || [...generatorTypes].some((type) => type.includes('filmstrip'))) labels.push('filmstrip');
  if (linkCount > 0) labels.push('linked');
  if (channelCount >= 2 || behaviorCount >= 2 || hitZoneCount >= 2) labels.push('multi');
  if (!labels.length) labels.push('custom');

  return uniqueList(labels);
}

export function inferCustomComponentCapabilities(control) {
  const labels = capabilityLabelsFromControl(control);
  const primaryKind = labels.includes('arpeggiator') ? 'arpeggiator'
    : labels.includes('piano') ? 'piano'
      : labels.includes('grid') || labels.includes('xy') ? 'grid'
        : labels.includes('filmstrip') ? 'filmstrip'
          : labels.includes('multi') ? 'multi'
            : labels.includes('slider') ? 'slider'
              : labels.includes('button') ? 'button'
                : 'custom';
  return {
    primaryKind,
    labels,
  };
}

export function summarizeCustomComponent(control) {
  const sections = control?._children ?? {};
  const assets = sections.Assets ?? {};
  const published = sections.PublishedProperties ?? {};
  const materialized = materializedCustomComponentSnapshot(control, {});
  const materializedParts = objectChildren(materialized?._children?.Parts);
  const materializedHitZones = objectChildren(materialized?._children?.HitZones);
  const arpeggiator = summarizeCustomArpeggiator(control);
  const generatedPartEntries = Object.entries(materializedParts)
    .filter(([, part]) => part?.generated === true || part?.meta?.generated === true);
  const generatedHitZoneEntries = Object.entries(materializedHitZones)
    .filter(([, zone]) => zone?.generated === true || zone?.meta?.generated === true);
  const generatedSources = new Set(
    [...generatedPartEntries, ...generatedHitZoneEntries]
      .map(([, entry]) => String(entry?.meta?.generatedBy ?? '').trim())
      .filter(Boolean)
  );
  return {
    parts: Object.keys(objectChildren(sections.Parts)).length,
    materializedParts: Object.keys(materializedParts).length,
    generatedParts: generatedPartEntries.length,
    valueChannels: Object.keys(objectChildren(sections.ValueChannels)).length,
    behaviors: Object.keys(objectChildren(sections.Behaviors)).length,
    hitZones: Object.keys(objectChildren(sections.HitZones)).length,
    materializedHitZones: Object.keys(materializedHitZones).length,
    generatedHitZones: generatedHitZoneEntries.length,
    generatedSources: generatedSources.size,
    generators: Object.keys(objectChildren(sections.Generators)).length,
    links: Object.keys(objectChildren(sections.Links)).length,
    bindings: Object.keys(objectChildren(sections.Bindings)).length,
    animations: Object.keys(objectChildren(sections.Animations)).length,
    variants: Object.keys(objectChildren(sections.Variants)).length,
    images: Object.keys(assets.images ?? {}).length,
    filmstrips: Object.keys(assets.filmstrips ?? {}).length,
    publicInputs: Object.values(published.inputs ?? {}).filter((entry) => entry?.enabled !== false).length,
    publicOutputs: Object.values(published.outputs ?? {}).filter((entry) => entry?.enabled !== false).length,
    editableProperties: Object.values(published.editableProperties ?? {}).filter((entry) => entry?.enabled !== false).length,
    arpeggiator: arpeggiator.enabled,
    arpeggiatorSteps: arpeggiator.stepCount,
    arpeggiatorBlocks: arpeggiator.blockCount,
    arpeggiatorNotes: arpeggiator.usedNotes.length,
    arpeggiatorMaxPolyphony: arpeggiator.maxPolyphony,
  };
}

function definedEntryPairs(entry, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => entry?.[key] !== undefined && entry?.[key] !== '')
      .map((key) => [key, deepClone(entry[key])])
  );
}

function compactPublicInputEntry(name, entry) {
  return {
    name,
    label: String(entry?.label ?? name).trim() || name,
    type: String(entry?.type ?? 'float').trim() || 'float',
    channel: String(entry?.channel ?? '').trim(),
    ...definedEntryPairs(entry, ['min', 'max', 'step', 'defaultValue', 'values']),
  };
}

function compactPublicOutputEntry(name, entry) {
  return {
    name,
    label: String(entry?.label ?? name).trim() || name,
    type: String(entry?.type ?? 'float').trim() || 'float',
    channel: String(entry?.channel ?? '').trim(),
    ...definedEntryPairs(entry, ['min', 'max', 'step', 'defaultValue', 'values']),
  };
}

function compactEditablePropertyEntry(name, entry) {
  return {
    name,
    label: String(entry?.label ?? name).trim() || name,
    type: String(entry?.type ?? 'text').trim() || 'text',
    path: String(entry?.path ?? '').trim(),
    part: String(entry?.part ?? '').trim(),
    ...definedEntryPairs(entry, ['min', 'max', 'step', 'defaultValue', 'values']),
  };
}

function enabledEntries(entries = {}) {
  return Object.entries(entries).filter(([, entry]) => entry?.enabled !== false);
}

function hasOwnValue(entry, key) {
  return entry && Object.prototype.hasOwnProperty.call(entry, key) && entry[key] !== undefined && entry[key] !== '';
}

function dataUrlMimeType(value) {
  const match = String(value ?? '').match(/^data:([^;,]+)[;,]/);
  return match?.[1] ?? '';
}

function embeddedSourceByteEstimate(value) {
  const source = String(value ?? '');
  if (!source) return 0;
  const commaIndex = source.indexOf(',');
  if (source.startsWith('data:') && commaIndex >= 0) {
    const header = source.slice(0, commaIndex);
    const body = source.slice(commaIndex + 1);
    if (header.includes(';base64')) {
      const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
      return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
    }
    return decodeURIComponent(body).length;
  }
  return source.length;
}

function publishedEntryWarnings(kind, name, entry, channel = null) {
  const warnings = [];
  const type = String(entry?.type ?? channel?.type ?? 'float').trim().toLowerCase();
  const label = `${kind} "${name}"`;
  const isNumeric = ['float', 'int', 'integer', 'number', 'note'].includes(type);
  const isEnum = ['enum', 'choice', 'select'].includes(type);
  const min = Number(entry?.min ?? channel?.min);
  const max = Number(entry?.max ?? channel?.max);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);

  if (channel && entry?.type && channel?.type && String(entry.type).toLowerCase() !== String(channel.type).toLowerCase()) {
    warnings.push(`${label} type "${entry.type}" differs from channel type "${channel.type}".`);
  }

  if (isNumeric) {
    if (!hasMin || !hasMax) {
      warnings.push(`${label} has no complete public min/max range.`);
    } else if (min === max) {
      warnings.push(`${label} min and max are the same.`);
    } else if (min > max) {
      warnings.push(`${label} min is greater than max.`);
    }
    if (hasOwnValue(entry, 'defaultValue')) {
      const defaultValue = Number(entry.defaultValue);
      if (Number.isFinite(defaultValue) && hasMin && hasMax && (defaultValue < Math.min(min, max) || defaultValue > Math.max(min, max))) {
        warnings.push(`${label} default value is outside its public range.`);
      }
    } else {
      warnings.push(`${label} has no package default value.`);
    }
  }

  if (isEnum) {
    const values = Array.isArray(entry?.values) && entry.values.length
      ? entry.values
      : (Array.isArray(channel?.values) ? channel.values : []);
    if (!values.length) {
      warnings.push(`${label} has no public enum values.`);
    }
    if (hasOwnValue(entry, 'defaultValue') && values.length && !values.map(String).includes(String(entry.defaultValue))) {
      warnings.push(`${label} default value is not in its public enum values.`);
    }
  }

  return warnings;
}

export function summarizeCustomComponentPublicApi(control) {
  const published = control?._children?.PublishedProperties ?? {};
  const inputs = enabledEntries(published.inputs ?? {}).map(([name, entry]) => compactPublicInputEntry(name, entry));
  const outputs = enabledEntries(published.outputs ?? {}).map(([name, entry]) => compactPublicOutputEntry(name, entry));
  const properties = enabledEntries(published.editableProperties ?? {}).map(([name, entry]) => compactEditablePropertyEntry(name, entry));
  return {
    inputs,
    outputs,
    properties,
    counts: {
      inputs: inputs.length,
      outputs: outputs.length,
      properties: properties.length,
      total: inputs.length + outputs.length + properties.length,
    },
  };
}

export function summarizeCustomComponentAssets(control) {
  const assets = control?._children?.Assets ?? {};
  const images = Object.entries(assets.images ?? {}).map(([name, image]) => ({
    name,
    sourceType: String(image?.sourceType ?? (image?.source ? 'embedded' : 'empty')).trim() || 'embedded',
    mimeType: String(image?.mimeType ?? dataUrlMimeType(image?.source)).trim(),
    width: numberOr(image?.width, 0),
    height: numberOr(image?.height, 0),
    bytes: embeddedSourceByteEstimate(image?.source),
    hasSource: !!image?.source,
    sourceFileName: String(image?.sourceFileName ?? '').trim(),
    importedAt: String(image?.importedAt ?? '').trim(),
  }));
  const filmstrips = Object.entries(assets.filmstrips ?? {}).map(([name, filmstrip]) => ({
    name,
    sourceType: String(filmstrip?.sourceType ?? (filmstrip?.source ? 'embedded' : 'empty')).trim() || 'embedded',
    mimeType: String(filmstrip?.mimeType ?? dataUrlMimeType(filmstrip?.source)).trim(),
    width: numberOr(filmstrip?.width, 0),
    height: numberOr(filmstrip?.height, 0),
    frameWidth: numberOr(filmstrip?.frameWidth, 0),
    frameHeight: numberOr(filmstrip?.frameHeight, 0),
    frameCount: numberOr(filmstrip?.frameCount, 0),
    orientation: String(filmstrip?.orientation ?? 'vertical').trim() || 'vertical',
    valueSource: String(filmstrip?.valueSource ?? '').trim(),
    bytes: embeddedSourceByteEstimate(filmstrip?.source),
    hasSource: !!filmstrip?.source,
    sourceFileName: String(filmstrip?.sourceFileName ?? '').trim(),
    importedAt: String(filmstrip?.importedAt ?? '').trim(),
  }));
  const totalBytes = [...images, ...filmstrips].reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
  return {
    images,
    filmstrips,
    counts: {
      images: images.length,
      filmstrips: filmstrips.length,
      total: images.length + filmstrips.length,
    },
    totalBytes,
  };
}

function readinessStep(id, label, done, detail, target = 'overview', severity = 'info') {
  return {
    id,
    label,
    done: Boolean(done),
    detail,
    target,
    severity,
  };
}

export function analyzeCustomComponentReadiness(control) {
  const summary = summarizeCustomComponent(control);
  const validation = validateCustomComponentPackage(control);
  const publicApiCount = (summary.publicInputs ?? 0) + (summary.publicOutputs ?? 0);
  const runtimeSurface = (summary.hitZones ?? 0) + (summary.generatedHitZones ?? 0) + (summary.arpeggiator ? 1 : 0);
  const motionRules = (summary.bindings ?? 0) + (summary.animations ?? 0) + (summary.links ?? 0) + (summary.arpeggiator ? 1 : 0);
  const reusableSurface = publicApiCount + (summary.editableProperties ?? 0);
  const steps = [
    readinessStep('visuals', 'Visual Layers', (summary.parts ?? 0) > 0 || (summary.generatedParts ?? 0) > 0, `${(summary.parts ?? 0) + (summary.generatedParts ?? 0)} authored/runtime layer(s)`, 'shapes', 'required'),
    readinessStep('values', 'Value Model', (summary.valueChannels ?? 0) > 0, `${summary.valueChannels ?? 0} value channel(s)`, 'overview', 'required'),
    readinessStep('interaction', 'Interaction', (summary.behaviors ?? 0) > 0 || runtimeSurface > 0, `${summary.behaviors ?? 0} behavior(s), ${runtimeSurface} hit surface(s)`, 'movement', 'recommended'),
    readinessStep('motion', 'Motion Rules', motionRules > 0, `${summary.bindings ?? 0} binding(s), ${summary.animations ?? 0} animation(s), ${summary.links ?? 0} link(s)`, 'movement', 'optional'),
    readinessStep('publicApi', 'Panel API', publicApiCount > 0, `${summary.publicInputs ?? 0} input(s), ${summary.publicOutputs ?? 0} output(s)`, 'links', 'recommended'),
    readinessStep('properties', 'Editable Properties', (summary.editableProperties ?? 0) > 0, `${summary.editableProperties ?? 0} published property control(s)`, 'states', 'recommended'),
    readinessStep('assets', 'Packaged Assets', (summary.images ?? 0) + (summary.filmstrips ?? 0) > 0, `${summary.images ?? 0} image(s), ${summary.filmstrips ?? 0} filmstrip(s)`, 'assets', 'optional'),
    readinessStep('validPackage', 'Package Validity', validation.ok, validation.ok ? 'No blocking package issues' : `${validation.issues.length} blocking issue(s)`, 'overview', 'required'),
  ];
  const requiredSteps = steps.filter((step) => step.severity === 'required');
  const doneCount = steps.filter((step) => step.done).length;
  return {
    ok: validation.ok && requiredSteps.every((step) => step.done),
    score: Math.round((doneCount / Math.max(1, steps.length)) * 100),
    doneCount,
    totalCount: steps.length,
    requiredOpenCount: requiredSteps.filter((step) => !step.done).length,
    recommendedOpenCount: steps.filter((step) => step.severity === 'recommended' && !step.done).length,
    optionalOpenCount: steps.filter((step) => step.severity === 'optional' && !step.done).length,
    steps,
    validation,
  };
}

export function createCustomComponentThumbnail(control, options = {}) {
  const materialized = materializedCustomComponentSnapshot(control, {});
  const transform = materialized?._children?.Transform ?? {};
  const width = Math.max(1, numberOr(options.width ?? transform.width, 260));
  const height = Math.max(1, numberOr(options.height ?? transform.height, 120));
  const parts = Object.values(objectChildren(materialized?._children?.Parts))
    .filter((part) => part?.visible !== false)
    .sort((a, b) => numberOr(a?.zIndex, 0) - numberOr(b?.zIndex, 0))
    .slice(-18)
    .map((part) => partThumbnailEntry(part, width, height));
  return {
    width,
    height,
    aspectRatio: Math.round((width / height) * 1000) / 1000,
    parts,
  };
}

export function fingerprintCustomComponent(control) {
  const clone = deepClone(control ?? {});
  if (clone?._children?.Core) {
    delete clone._children.Core.id;
  }
  return hashString(stableStringify(clone));
}

export function normalizeCustomComponentMetadata(control, metadata = {}) {
  const core = control?._children?.Core ?? {};
  const api = control?._children?.ExternalAPI ?? {};
  const designer = control?._children?.Designer ?? {};
  const name = String(metadata.name ?? core.name ?? api.addressableName ?? 'Custom Component').trim() || 'Custom Component';
  const version = String(metadata.version ?? designer.packageVersion ?? '1.0.0').trim() || '1.0.0';
  const rawId = String(metadata.id ?? '').trim()
    || String(api.addressableName ?? '').trim()
    || name;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : String(metadata.tags ?? 'custom-component').split(',');

  return {
    name,
    id: slugify(rawId),
    author: String(metadata.author ?? designer.author ?? '').trim(),
    version,
    description: String(metadata.description ?? designer.notes ?? '').trim(),
    category: String(metadata.category ?? designer.category ?? 'custom').trim() || 'custom',
    tags: [...new Set(tags.map((tag) => String(tag ?? '').trim()).filter(Boolean))],
    license: String(metadata.license ?? designer.license ?? '').trim(),
    homepage: String(metadata.homepage ?? designer.homepage ?? '').trim(),
  };
}

export function validateCustomComponentPackage(control) {
  const issues = [];
  const warnings = [];
  const sections = control?._children ?? {};
  const core = sections.Core ?? {};
  const values = objectChildren(sections.ValueChannels);
  const behaviors = objectChildren(sections.Behaviors);
  const hitZones = objectChildren(sections.HitZones);
  const published = sections.PublishedProperties ?? {};
  const assets = sections.Assets ?? {};
  const parts = objectChildren(sections.Parts);
  const animations = objectChildren(sections.Animations);
  const bindings = objectChildren(sections.Bindings);
  const generators = objectChildren(sections.Generators);
  const links = objectChildren(sections.Links);
  const materialized = materializedCustomComponentSnapshot(control, {});
  const materializedHitZones = objectChildren(materialized?._children?.HitZones);
  const arpeggiator = summarizeCustomArpeggiator(control);

  if (String(core.controlType ?? '') !== 'CustomComponent') {
    issues.push('Package root is not a CustomComponent.');
  }
  if (!Object.keys(sections.Parts?._children ?? {}).length) {
    issues.push('Component has no visual parts.');
  }
  if (!Object.keys(values).length) {
    issues.push('Component has no value channels.');
  }
  if (!Object.keys(published.inputs ?? {}).some((name) => published.inputs[name]?.enabled !== false)
    && !Object.keys(published.outputs ?? {}).some((name) => published.outputs[name]?.enabled !== false)) {
    warnings.push('No published inputs or outputs are enabled.');
  }
  if (arpeggiator.enabled) {
    const requiredChannels = ['arpCurrentStep', 'arpNote', 'arpVelocity', 'arpGate'];
    for (const channelName of requiredChannels) {
      if (!values[channelName]) issues.push(`Arpeggiator is missing value channel "${channelName}".`);
    }
    if (arpeggiator.blockCount <= 0) warnings.push('Arpeggiator pattern has no note blocks yet.');
    for (const outputName of ['arpNote', 'arpVelocity', 'arpGate']) {
      const publishedOutput = published.outputs?.[outputName]
        ?? Object.values(published.outputs ?? {}).find((entry) => String(entry?.channel ?? '') === outputName);
      if (!publishedOutput || publishedOutput.enabled === false) {
        warnings.push(`Arpeggiator output "${outputName}" is not published.`);
      }
    }
    const stepInput = published.inputs?.arpCurrentStep
      ?? Object.values(published.inputs ?? {}).find((entry) => String(entry?.channel ?? '') === 'arpCurrentStep');
    if (!stepInput || stepInput.enabled === false) warnings.push('Arpeggiator current step input is not published.');
  }

  for (const [name, entry] of Object.entries(published.inputs ?? {})) {
    if (entry?.enabled === false || !entry?.channel) continue;
    if (!values[entry.channel]) {
      issues.push(`Published input "${name}" targets missing value channel "${entry.channel}".`);
    } else {
      warnings.push(...publishedEntryWarnings('Published input', name, entry, values[entry.channel]));
    }
  }

  for (const [name, entry] of Object.entries(published.outputs ?? {})) {
    if (entry?.enabled === false || !entry?.channel) continue;
    if (!values[entry.channel]) {
      issues.push(`Published output "${name}" targets missing value channel "${entry.channel}".`);
    } else {
      warnings.push(...publishedEntryWarnings('Published output', name, entry, values[entry.channel]));
    }
  }

  for (const [name, entry] of Object.entries(published.editableProperties ?? {})) {
    if (entry?.enabled === false) continue;
    const pathIssue = editablePropertyPathIssue(entry?.path, sections);
    if (pathIssue) {
      issues.push(`Editable property "${name}" ${pathIssue}.`);
    } else {
      warnings.push(...publishedEntryWarnings('Editable property', name, entry));
      const propertyType = String(entry?.type ?? 'text').trim().toLowerCase();
      const numericProperty = ['float', 'int', 'integer', 'number', 'note'].includes(propertyType);
      if (!numericProperty && !hasOwnValue(entry, 'defaultValue')) {
        warnings.push(`Editable property "${name}" has no package default value.`);
      }
    }
  }

  for (const [name, behavior] of Object.entries(behaviors)) {
    if (behavior?.enabled === false) continue;
    if (behavior?.valueChannel && !values[behavior.valueChannel]) {
      issues.push(`Behavior "${name}" targets missing value channel "${behavior.valueChannel}".`);
    }
  }

  for (const [name, zone] of Object.entries({ ...hitZones, ...materializedHitZones })) {
    if (zone?.enabled === false) continue;
    if (zone?.targetBehavior && !behaviors[zone.targetBehavior]) {
      issues.push(`Hit zone "${name}" targets missing behavior "${zone.targetBehavior}".`);
    }
    if (zone?.targetValueChannel && !values[zone.targetValueChannel]) {
      issues.push(`Hit zone "${name}" targets missing value channel "${zone.targetValueChannel}".`);
    }
    if (zone?.targetValueChannelY && !values[zone.targetValueChannelY]) {
      issues.push(`Hit zone "${name}" targets missing Y value channel "${zone.targetValueChannelY}".`);
    }
  }

  for (const [name, generator] of Object.entries(generators)) {
    if (generator?.enabled === false) continue;
    const type = String(generator?.type ?? '').trim().toLowerCase();
    if (generator?.targetBehavior && !behaviors[generator.targetBehavior]) {
      issues.push(`Generator "${name}" targets missing behavior "${generator.targetBehavior}".`);
    }
    if (generator?.targetValueChannel && !values[generator.targetValueChannel]) {
      issues.push(`Generator "${name}" targets missing value channel "${generator.targetValueChannel}".`);
    }
    const yChannel = generator?.targetValueChannelY ?? generator?.targetYValueChannel;
    if (yChannel && !values[yChannel]) {
      issues.push(`Generator "${name}" targets missing Y value channel "${yChannel}".`);
    }
    if (type === 'filmstrip' || type === 'filmstrip-frames') {
      const assetName = String(generator?.assetName ?? '').trim();
      const filmstrips = assets.filmstrips ?? {};
      if (assetName && !filmstrips[assetName]) {
        issues.push(`Generator "${name}" targets missing filmstrip asset "${assetName}".`);
      } else if (!assetName && !Object.keys(filmstrips).length) {
        warnings.push(`Filmstrip generator "${name}" has no filmstrip asset to render yet.`);
      }
    }
  }

  for (const [name, binding] of Object.entries(bindings)) {
    if (binding?.enabled === false) continue;
    const source = String(binding?.source ?? '').trim();
    if (!source) {
      issues.push(`Binding "${name}" has no source signal.`);
    }
    for (const channelName of referencedCustomChannels(source)) {
      if (!values[channelName]) {
        issues.push(`Binding "${name}" references missing value channel "${channelName}".`);
      }
    }
    const targetIssue = editablePropertyPathIssue(binding?.target, sections);
    if (targetIssue) {
      issues.push(`Binding "${name}" ${targetIssue}.`);
    }
  }

  for (const [name, link] of Object.entries(links)) {
    if (link?.enabled === false) continue;
    const target = String(link?.target ?? '').trim();
    if (!target) {
      issues.push(`Link "${name}" has no target.`);
    } else {
      const targetIssue = editablePropertyPathIssue(target, sections);
      const targetName = simpleReferenceName(target);
      if (targetIssue && target.includes('.')) {
        issues.push(`Link "${name}" ${targetIssue}.`);
      } else if (targetName && !values[targetName]) {
        issues.push(`Link "${name}" targets missing value channel "${targetName}".`);
      }
    }

    for (const channelName of referencedCustomChannels(link?.source)) {
      if (!values[channelName]) {
        issues.push(`Link "${name}" references missing value channel "${channelName}".`);
      }
    }
    const sourceName = simpleReferenceName(link?.source);
    if (sourceName && !values[sourceName] && !isLiteralLinkSource(link?.source)) {
      warnings.push(`Link "${name}" reads unknown source "${sourceName}".`);
    }
  }

  for (const [name, image] of Object.entries(assets.images ?? {})) {
    if (!image?.source) warnings.push(`Image "${name}" has no embedded source yet.`);
    const bytes = embeddedSourceByteEstimate(image?.source);
    if (bytes > CUSTOM_COMPONENT_ASSET_WARNING_BYTES) {
      warnings.push(`Image "${name}" is ${Math.round(bytes / 104857.6) / 10} MB embedded; consider optimizing it before sharing.`);
    }
    if (image?.source && (!Number(image?.width) || !Number(image?.height))) {
      warnings.push(`Image "${name}" has no captured width/height metadata.`);
    }
  }

  for (const [name, filmstrip] of Object.entries(assets.filmstrips ?? {})) {
    if (!filmstrip?.source) warnings.push(`Filmstrip "${name}" has no embedded source yet.`);
    const bytes = embeddedSourceByteEstimate(filmstrip?.source);
    if (bytes > CUSTOM_COMPONENT_ASSET_WARNING_BYTES) {
      warnings.push(`Filmstrip "${name}" is ${Math.round(bytes / 104857.6) / 10} MB embedded; consider baking fewer frames or optimizing it before sharing.`);
    }
    if (!(Number(filmstrip?.frameCount) > 0)) issues.push(`Filmstrip "${name}" needs a valid frame count.`);
    if (filmstrip?.valueSource && !values[filmstrip.valueSource]) {
      issues.push(`Filmstrip "${name}" reads missing value channel "${filmstrip.valueSource}".`);
    }
  }

  const assetManifest = summarizeCustomComponentAssets(control);
  if (assetManifest.totalBytes > CUSTOM_COMPONENT_PACKAGE_ASSET_WARNING_BYTES) {
    warnings.push(`Embedded assets total ${Math.round(assetManifest.totalBytes / 104857.6) / 10} MB; consider optimizing images or filmstrips before publishing.`);
  }

  for (const [name, animation] of Object.entries(animations)) {
    if (animation?.enabled === false) continue;
    for (const target of animation?.targets ?? []) {
      const path = String(target?.path ?? '').trim();
      if (!path) {
        issues.push(`Animation "${name}" has an empty target path.`);
        continue;
      }
      const partMatch = path.match(/^Parts\.([^.[\]]+)/);
      if (partMatch && !parts[partMatch[1]]) {
        issues.push(`Animation "${name}" targets missing part "${partMatch[1]}".`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function compatibilityWarningList(envelope = {}) {
  const warnings = [];
  const formatVersion = Number(envelope.formatVersion ?? CUSTOM_COMPONENT_PACKAGE_VERSION);
  const compatibilityVersion = Number(envelope.compatibility?.customComponentVersion ?? formatVersion);
  if (Number.isFinite(formatVersion) && formatVersion > CUSTOM_COMPONENT_PACKAGE_VERSION) {
    warnings.push(`Package format version ${formatVersion} is newer than supported version ${CUSTOM_COMPONENT_PACKAGE_VERSION}.`);
  }
  if (Number.isFinite(compatibilityVersion) && compatibilityVersion > CUSTOM_COMPONENT_COMPATIBILITY_VERSION) {
    warnings.push(`Package compatibility version ${compatibilityVersion} is newer than supported version ${CUSTOM_COMPONENT_COMPATIBILITY_VERSION}.`);
  }
  return warnings;
}

function mergeValidationWithCompatibility(validation, envelope) {
  return {
    ok: validation?.ok === true,
    issues: [...(validation?.issues ?? [])],
    warnings: uniqueList([...(validation?.warnings ?? []), ...compatibilityWarningList(envelope)]),
  };
}

export function createCustomComponentExportEnvelope(control, metadata = {}) {
  const normalizedMetadata = normalizeCustomComponentMetadata(control, metadata);
  const validation = validateCustomComponentPackage(control);
  const summary = summarizeCustomComponent(control);
  const fingerprint = fingerprintCustomComponent(control);
  const thumbnail = createCustomComponentThumbnail(control);
  const capabilities = inferCustomComponentCapabilities(control);
  const readiness = analyzeCustomComponentReadiness(control);
  const publicApiSummary = summarizeCustomComponentPublicApi(control);
  const assetManifest = summarizeCustomComponentAssets(control);
  return {
    format: CUSTOM_COMPONENT_PACKAGE_FORMAT,
    formatVersion: CUSTOM_COMPONENT_PACKAGE_VERSION,
    compatibility: {
      customComponentVersion: CUSTOM_COMPONENT_COMPATIBILITY_VERSION,
      minimumFormatVersion: CUSTOM_COMPONENT_PACKAGE_VERSION,
    },
    exportedAt: new Date().toISOString(),
    metadata: normalizedMetadata,
    fingerprint,
    summary,
    readiness,
    thumbnail,
    capabilities,
    publicApiSummary,
    assetManifest,
    validation,
    publicApi: deepClone(control?._children?.PublishedProperties ?? {}),
    externalApi: deepClone(control?._children?.ExternalAPI ?? {}),
    component: deepClone(control),
    assets: deepClone(control?._children?.Assets ?? {}),
  };
}

export function normalizeCustomComponentEnvelope(value) {
  const rawEnvelope = value?.format === CUSTOM_COMPONENT_PACKAGE_FORMAT ? value : value?.envelope;
  if (!rawEnvelope || rawEnvelope.format !== CUSTOM_COMPONENT_PACKAGE_FORMAT || !rawEnvelope.component?._children) {
    return null;
  }
  // Upgrade older plan versions before deriving anything from the component.
  const migration = migrateCustomComponentPlan(rawEnvelope.component);
  const envelope = migration.component === rawEnvelope.component
    ? rawEnvelope
    : { ...rawEnvelope, component: migration.component };
  const validation = validateCustomComponentPackage(envelope.component);
  validation.warnings = uniqueList([...(validation.warnings ?? []), ...migration.warnings]);
  const summary = summarizeCustomComponent(envelope.component);
  const fingerprint = fingerprintCustomComponent(envelope.component);
  const thumbnail = createCustomComponentThumbnail(envelope.component);
  const capabilities = inferCustomComponentCapabilities(envelope.component);
  const readiness = analyzeCustomComponentReadiness(envelope.component);
  const publicApiSummary = summarizeCustomComponentPublicApi(envelope.component);
  const assetManifest = summarizeCustomComponentAssets(envelope.component);
  return {
    ...envelope,
    migration: {
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      applied: migration.applied,
      warnings: migration.warnings,
    },
    formatVersion: Number(envelope.formatVersion ?? CUSTOM_COMPONENT_PACKAGE_VERSION),
    compatibility: {
      ...(envelope.compatibility ?? {}),
      customComponentVersion: Number(envelope.compatibility?.customComponentVersion ?? envelope.formatVersion ?? CUSTOM_COMPONENT_COMPATIBILITY_VERSION),
      minimumFormatVersion: Number(envelope.compatibility?.minimumFormatVersion ?? CUSTOM_COMPONENT_PACKAGE_VERSION),
    },
    metadata: normalizeCustomComponentMetadata(envelope.component, envelope.metadata ?? {}),
    fingerprint,
    summary,
    readiness,
    thumbnail,
    capabilities,
    publicApiSummary,
    assetManifest,
    validation: mergeValidationWithCompatibility(validation, envelope),
    publicApi: deepClone(envelope.component?._children?.PublishedProperties ?? envelope.publicApi ?? {}),
    externalApi: deepClone(envelope.component?._children?.ExternalAPI ?? envelope.externalApi ?? {}),
    assets: deepClone(envelope.component?._children?.Assets ?? envelope.assets ?? {}),
  };
}

function packageCandidatesFromLibrary(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.packages)) return value.packages;
  return [];
}

export function createCustomComponentLibraryEnvelope(packages = []) {
  const normalizedPackages = packages
    .map((entry) => normalizeCustomComponentEnvelope(entry?.envelope ?? entry))
    .filter(Boolean);
  return {
    format: CUSTOM_COMPONENT_LIBRARY_FORMAT,
    formatVersion: CUSTOM_COMPONENT_LIBRARY_VERSION,
    exportedAt: new Date().toISOString(),
    packageCount: normalizedPackages.length,
    packages: normalizedPackages,
  };
}

export function normalizeCustomComponentLibraryEnvelope(value) {
  const candidates = packageCandidatesFromLibrary(value);
  const packages = candidates
    .map((entry) => normalizeCustomComponentEnvelope(entry?.envelope ?? entry))
    .filter(Boolean);
  if (!packages.length) return null;
  return {
    format: CUSTOM_COMPONENT_LIBRARY_FORMAT,
    formatVersion: CUSTOM_COMPONENT_LIBRARY_VERSION,
    exportedAt: value?.exportedAt ?? new Date().toISOString(),
    packageCount: packages.length,
    rejected: Math.max(0, candidates.length - packages.length),
    packages,
  };
}

export function customComponentPackageProvenance(envelope, importedAt = new Date().toISOString()) {
  const normalized = normalizeCustomComponentEnvelope(envelope);
  if (!normalized) return null;
  return {
    id: customComponentPackageId(normalized),
    name: normalized.metadata?.name ?? 'Custom Component',
    version: normalized.metadata?.version ?? '1.0.0',
    author: normalized.metadata?.author ?? '',
    category: normalized.metadata?.category ?? 'custom',
    license: normalized.metadata?.license ?? '',
    homepage: normalized.metadata?.homepage ?? '',
    fingerprint: normalized.fingerprint,
    importedAt,
    capabilities: deepClone(normalized.capabilities ?? { primaryKind: 'custom', labels: ['custom'] }),
    readiness: {
      ok: normalized.readiness?.ok === true,
      score: normalized.readiness?.score ?? 0,
      requiredOpenCount: normalized.readiness?.requiredOpenCount ?? 0,
    },
    publicApiSummary: deepClone(normalized.publicApiSummary ?? summarizeCustomComponentPublicApi(normalized.component)),
    assetManifest: deepClone(normalized.assetManifest ?? summarizeCustomComponentAssets(normalized.component)),
  };
}

export function instantiateCustomComponentPackageControl(value, options = {}) {
  const envelope = normalizeCustomComponentEnvelope(value?.envelope ?? value);
  if (!envelope?.component?._children) return null;
  const control = deepClone(envelope.component);
  const children = control._children;
  const provenance = customComponentPackageProvenance(envelope, options.importedAt);
  children.Core = {
    ...(children.Core ?? {}),
    _type: 'Core',
    id: String(options.id ?? children.Core?.id ?? '').trim() || `ctrl_${Date.now()}`,
    controlType: 'CustomComponent',
    name: String(options.name ?? children.Core?.name ?? envelope.metadata?.name ?? 'Custom Component').trim() || 'Custom Component',
  };
  children.Designer = {
    ...(children.Designer ?? {}),
    packageName: envelope.metadata?.name ?? children.Core.name,
    packageVersion: envelope.metadata?.version ?? '1.0.0',
    packageId: provenance?.id ?? '',
    packageFingerprint: envelope.fingerprint ?? '',
    packageImportedAt: provenance?.importedAt ?? '',
    sourcePackage: provenance,
  };
  children.ExternalAPI = {
    ...(children.ExternalAPI ?? {}),
    addressableName: String(children.ExternalAPI?.addressableName ?? envelope.metadata?.id ?? '').trim() || envelope.metadata?.id || '',
  };
  children.Transform = {
    _type: 'Transform',
    x: 0,
    y: 0,
    width: 260,
    height: 120,
    ...(children.Transform ?? {}),
    ...(options.Transform ?? options.transform ?? {}),
  };
  return control;
}

export function customComponentPackageId(envelope) {
  const metadata = normalizeCustomComponentMetadata(envelope?.component, envelope?.metadata ?? {});
  return `${slugify(metadata.id ?? metadata.name)}@${slugify(metadata.version, '1-0-0')}`;
}
