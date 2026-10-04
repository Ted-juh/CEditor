/**
 * assetReferences.js — what uses each asset, so changing one is not a guess.
 *
 * A custom component's images and filmstrips live in name-keyed maps (`Assets.images`,
 * `Assets.filmstrips`), and nothing recorded what pointed at them. So an asset could not be renamed
 * (`docs/design/assets-tab-design.md`, "One thing deliberately not built"), removing one broke its
 * users silently, and "replace this everywhere" had no "everywhere" to work from. This module is that
 * index. It is pure — a document in, a description out — so it runs under `node --test` and the
 * Assets tab, a rename and a replace can all ask the same question and get the same answer.
 *
 * WHAT COUNTS AS A USE. Measured from the code that reads assets, not assumed:
 *
 * - `generator`  A filmstrip generator's `assetName` (`customComponentMaterializer.js`,
 *                `materializeFilmstrips`). Counted even when the generator is disabled: it renders
 *                nothing today and the name is still a link a rename would have to follow.
 * - `fallback`   The same generator with no `assetName`, or one naming a filmstrip that is gone.
 *                The materializer then quietly draws the FIRST filmstrip. That is a real use — remove
 *                that filmstrip and the knob changes picture — and an invisible one, which is why it
 *                is its own kind. A missing name is also reported in `dangling`.
 * - `path`       Any string that is a property path into an asset: `Assets.images.<name>…` or
 *                `Assets.filmstrips.<name>…`. Bindings, animation targets and published properties
 *                all write these. Found by shape, not by a list of fields, because the list of
 *                fields is what grows — a new section with a target path would otherwise be missed
 *                here and found by a user after a rename.
 * - `copy`       A string equal to the asset's source, anywhere outside the asset itself: the Assets
 *                tab's Fill and Overlay copy an image's source into a part (`imageSrc`,
 *                `overlaySrc`), and a copy is a use that will not follow a replacement. Searched
 *                across the whole panel when one is given, since a source pasted into another
 *                control is the same picture.
 * - `duplicate`  Another asset, here or on another control, holding identical bytes. Not a use, but
 *                the same question ("where else is this picture?") and the first thing a dedupe needs.
 *
 * WHAT IT CANNOT SEE. Script source. A script that builds `'Assets.images.' + name` at run time is
 * not a string anywhere in the document, and reading code to guess at it would report uses that are
 * not there. The `Designer` section is skipped as well: `selectedAsset` is where the editor's
 * cursor is, not something that depends on the asset.
 */

import { ASSET_KINDS, ASSET_MAP_BY_KIND, assetKey } from './assetsModel.js';
import { flatControls } from './containment.js';

const FILMSTRIP_GENERATOR_TYPES = new Set(['filmstrip-frames', 'filmstrip']);
const ASSET_PATH = /^Assets\.(images|filmstrips)\.([^.[\]]+)(?:[.[]|$)/;
const KIND_BY_MAP = Object.fromEntries(Object.entries(ASSET_MAP_BY_KIND).map(([kind, map]) => [map, kind]));

/** Sections that are not a use when they mention an asset. `Assets` is scanned separately. */
const NOT_A_USE = new Set(['Assets', 'Designer']);

const text = (value) => String(value ?? '').trim();
const coreOf = (control) => control?._children?.Core ?? {};
const controlIdOf = (control) => coreOf(control).id ?? null;
const controlNameOf = (control) => coreOf(control).name || coreOf(control).controlType || '';

/**
 * "Generators › filmstripFrame › assetName" from `['Generators', '_children', 'filmstripFrame',
 * 'assetName']`. The `_children` hops are storage, not names anybody reads.
 */
export function referenceLabel(location) {
  return location.filter((step) => step !== '_children').map(String).join(' › ');
}

/** Every string in `value`, with where it is. */
function walkStrings(value, location, visit) {
  if (typeof value === 'string') {
    visit(value, location);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) walkStrings(child, [...location, key], visit);
}

/**
 * A control's sections, minus `Children`: a container keeps its members there, and each member is
 * scanned as itself, so its uses are reported against it and not twice against its container.
 */
const sectionsOf = (control) => Object.entries(control?._children ?? {}).filter(([section]) => section !== 'Children');

/** The assets a control owns, each with its key, kind, name and source. */
export function ownedAssets(control) {
  const assets = control?._children?.Assets ?? {};
  const out = [];
  for (const kind of ASSET_KINDS) {
    for (const [name, asset] of Object.entries(assets[ASSET_MAP_BY_KIND[kind]] ?? {})) {
      out.push({ key: assetKey(kind, name), kind, name, source: text(asset?.source) });
    }
  }
  return out;
}

/**
 * Who uses each of `control`'s assets.
 *
 * Returns `{ byAsset, dangling }`. `byAsset` maps every asset key the control owns (`image:knob`,
 * `filmstrip:knobFrames`) to its references — present, possibly empty, for every asset, so "unused"
 * is an answer rather than a missing entry. `dangling` holds references to names the control does not
 * have: generators and paths that point at nothing.
 *
 * Each reference is `{ via, controlId, controlName, location, label, enabled }`. `location` is the
 * path from that control's `_children` — or, for the panel's own background, from the panel, with
 * `controlId` null — which is what a rename needs to rewrite it. `external` marks a reference on
 * another control or on the panel.
 *
 * `panel` is optional. Without it only the control itself is searched — enough for the Assets tab's
 * count, and what a component on its own (a package, a library entry) can answer.
 */
export function componentAssetReferences(control, { panel = null } = {}) {
  const owned = ownedAssets(control);
  const byAsset = new Map(owned.map((asset) => [asset.key, []]));
  const dangling = [];
  const ownerId = controlIdOf(control);
  const ownerName = controlNameOf(control);
  const ref = (via, location, { controlId = ownerId, controlName = ownerName, external = false, enabled = true } = {}) =>
    ({ via, controlId, controlName, external, location, label: referenceLabel(location), enabled });
  const add = (key, reference) => {
    if (byAsset.has(key)) byAsset.get(key).push(reference);
    else dangling.push({ ...reference, key });
  };

  const children = control?._children ?? {};
  const filmstripNames = Object.keys(children.Assets?.filmstrips ?? {});

  // Generators: by name, and the silent first-filmstrip fallback.
  for (const [name, generator] of Object.entries(children.Generators?._children ?? {})) {
    if (!FILMSTRIP_GENERATOR_TYPES.has(text(generator?.type).toLowerCase())) continue;
    const enabled = generator?.enabled !== false;
    const location = ['Generators', '_children', name, 'assetName'];
    const wanted = text(generator?.assetName);
    if (wanted) add(assetKey('filmstrip', wanted), ref('generator', location, { enabled }));
    if ((!wanted || !filmstripNames.includes(wanted)) && filmstripNames.length) {
      byAsset.get(assetKey('filmstrip', filmstripNames[0])).push(ref('fallback', location, { enabled }));
    }
  }

  // Paths into an asset, anywhere in the control's own sections.
  for (const [section, value] of sectionsOf(control)) {
    if (NOT_A_USE.has(section)) continue;
    walkStrings(value, [section], (string, location) => {
      const match = ASSET_PATH.exec(string.trim());
      if (!match) return;
      // A generator's `assetName` is never a path, so a path in Generators is something else's.
      add(assetKey(KIND_BY_MAP[match[1]], match[2]), ref('path', location));
    });
  }

  // Copies and duplicates: the same source, found by value.
  const bySource = new Map();
  for (const asset of owned) {
    if (!asset.source) continue;
    if (!bySource.has(asset.source)) bySource.set(asset.source, []);
    bySource.get(asset.source).push(asset.key);
  }
  if (bySource.size) {
    const others = panel ? flatControls(panel.controls ?? []).filter((other) => other !== control) : [];
    const searched = [{ owner: control, isOwner: true }, ...others.map((owner) => ({ owner, isOwner: false }))];

    for (const { owner, isOwner } of searched) {
      const who = { controlId: controlIdOf(owner), controlName: controlNameOf(owner), external: !isOwner };
      for (const [section, value] of sectionsOf(owner)) {
        if (section === 'Designer') continue;
        walkStrings(value, [section], (string, location) => {
          const keys = bySource.get(string.trim());
          if (!keys) return;
          if (section !== 'Assets') {
            for (const key of keys) byAsset.get(key).push(ref('copy', location, who));
            return;
          }
          // In an Assets map: a duplicate, unless it is the asset's own source.
          const [, map, name, field] = location;
          if (field !== 'source' || !KIND_BY_MAP[map]) return;
          const here = assetKey(KIND_BY_MAP[map], name);
          for (const key of keys) {
            if (!(isOwner && key === here)) byAsset.get(key).push(ref('duplicate', location, who));
          }
        });
      }
    }

    // The panel's own background and texture.
    for (const field of ['bgImage', 'bgTexture']) {
      const keys = bySource.get(text(panel?.[field]));
      for (const key of keys ?? []) byAsset.get(key).push(ref('copy', [field], { controlId: null, controlName: 'Panel', external: true }));
    }
  }

  return { byAsset, dangling };
}

/** References a rename or removal would break: everything except duplicates, which stand alone. */
export function dependentReferences(references) {
  return (references ?? []).filter((reference) => reference.via !== 'duplicate');
}

const VIA_WORDS = { path: 'path', copy: 'copy', duplicate: 'same picture' };

/**
 * One line per reference, for a list or a confirmation. A generator is named by its own name —
 * "generator frames" says more than the path to its `assetName` field.
 */
export function describeReference(reference) {
  const off = reference.enabled === false ? ' (disabled)' : '';
  if (reference.via === 'generator' || reference.via === 'fallback') {
    const first = reference.via === 'fallback' ? ', as the first filmstrip' : '';
    return `generator ${reference.location[2]}${first}${off}`;
  }
  const where = reference.external ? `${reference.controlName || reference.controlId || 'another control'}: ` : '';
  return `${VIA_WORDS[reference.via] ?? reference.via} — ${where}${reference.label}${off}`;
}
