/**
 * assetEdits.js — renaming and replacing an asset, with every reference following.
 *
 * `assetReferences.js` answers "what uses this asset". This is what that answer is for. A rename is
 * a move with references to follow (the Assets tab refused to offer one until the references could
 * be found); a replace is a new picture that the parts which copied the old one must take up too.
 * Both are PLANNED here, as a set of patches over the document, and APPLIED by the tab in one
 * store update — `applyControlPatchesById` writes every control in one `panels.update`, which is
 * one undo step however many controls it touches.
 *
 * Pure, like the index: a document in, patches out, so the rules are tested under `node --test`
 * and the tab does nothing but apply them.
 *
 * WHAT A RENAME REWRITES. The asset's own map entry (the key IS the name, so the map is rebuilt
 * with the key changed and the order kept), every filmstrip generator that names it, and every
 * `Assets.<map>.<name>…` path. Copies and duplicates are by value and do not change. A generator
 * with no name keeps drawing the first filmstrip, which is still the same strip because the order
 * is kept.
 *
 * WHAT A REPLACE REWRITES. The asset's `source` and what describes it (size, file name, when), and
 * every copy of the old source, on this control, other controls or the panel's own background.
 * Paths and generators point at the name and need nothing. Duplicates — other assets holding the
 * same bytes — are their own assets and are left alone; the plan names them so the tab can say so.
 *
 * ONE THING UNDO CANNOT FOLLOW. The panel's `bgImage` and `bgTexture` are kept out of history
 * snapshots on purpose (`history.js`: a background swap is not something undo reverts). So a copy
 * there is rewritten through `updatePanel` and the plan flags it as `outsideUndo`, for the tab to
 * say rather than hide.
 *
 * BAKED FILMSTRIPS GO STALE. A filmstrip the tab baked from this component (`generated: true`) is a
 * picture of the component's parts and generators, and those may use the replaced asset. The plan
 * lists every other baked strip on the control as `staleBakes`, each with the options to bake it
 * again from its own record, when the replaced asset was used by the component at all. Baking is
 * asynchronous and longer than the history debounce, so a re-bake is a second undo step, not part
 * of the replace.
 */

import { ASSET_MAP_BY_KIND, assetKey } from './assetsModel.js';
import { componentAssetReferences } from './assetReferences.js';

const text = (value) => String(value ?? '').trim();

/**
 * A name a path can carry. Names are keys in `Assets.<map>` and segments of `Assets.<map>.<name>`
 * paths, so a dot or a bracket would split the path somewhere else; `safeAssetFileName` allows
 * dots for file names and that is the one place this is stricter.
 */
export const ASSET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** The `updateControlProperty` path for a reference's location: the storage hops dropped. */
export function referencePatchPath(location) {
  return location.filter((step) => step !== '_children').join('.');
}

/** `Assets.images.old` → `Assets.images.new` inside a longer path string, and only that prefix. */
function renamedPath(value, map, oldName, newName) {
  const prefix = `Assets.${map}.${oldName}`;
  const trimmed = value.trim();
  if (trimmed !== prefix && !trimmed.startsWith(`${prefix}.`) && !trimmed.startsWith(`${prefix}[`)) return null;
  return value.replace(prefix, `Assets.${map}.${newName}`);
}

/** The map with one key renamed in place, order kept, and the asset's own `name` field with it. */
function renamedMap(map, oldName, newName) {
  const out = {};
  for (const [key, asset] of Object.entries(map)) {
    if (key === oldName) out[newName] = { ...asset, name: newName };
    else out[key] = asset;
  }
  return out;
}

function addPatch(patches, controlId, path, value) {
  if (!patches.has(controlId)) patches.set(controlId, {});
  patches.get(controlId)[path] = value;
}

/**
 * Plan a rename.
 *
 * Returns `{ ok, error }` when refused — an empty, unchanged, taken or unpathable name — else
 * `{ ok: true, key, patchesByControlId, rewritten, label }`. `rewritten` lists the references
 * the patches change, for the status line.
 */
export function planAssetRename(control, kind, oldName, newName, { panel = null } = {}) {
  const map = ASSET_MAP_BY_KIND[kind];
  const assets = control?._children?.Assets?.[map] ?? null;
  const next = text(newName);
  if (!map || !assets || !assets[oldName]) return { ok: false, error: 'No such asset.' };
  if (!next) return { ok: false, error: 'A name is needed.' };
  if (next === oldName) return { ok: false, error: 'That is its name already.' };
  if (!ASSET_NAME_PATTERN.test(next)) return { ok: false, error: 'Letters, digits, - and _ only: the name is a path segment.' };
  if (assets[next]) return { ok: false, error: `There is already a ${kind} called ${next}.` };

  const ownerId = control._children.Core?.id ?? null;
  const patches = new Map();
  addPatch(patches, ownerId, `Assets.${map}`, renamedMap(assets, oldName, next));

  const references = componentAssetReferences(control, { panel }).byAsset.get(assetKey(kind, oldName)) ?? [];
  const rewritten = [];
  for (const reference of references) {
    if (reference.via === 'generator') {
      addPatch(patches, reference.controlId, referencePatchPath(reference.location), next);
      rewritten.push(reference);
    } else if (reference.via === 'path') {
      const current = valueAt(control, reference.location);
      const updated = typeof current === 'string' ? renamedPath(current, map, oldName, next) : null;
      if (updated == null) continue;
      addPatch(patches, reference.controlId, referencePatchPath(reference.location), updated);
      rewritten.push(reference);
    }
    // 'fallback', 'copy' and 'duplicate' are by position or by value: nothing to write.
  }

  return { ok: true, key: assetKey(kind, next), patchesByControlId: patches, rewritten, label: `Rename ${oldName} → ${next}` };
}

/** The string at a location, read the way the index walked to it. */
function valueAt(control, location) {
  let node = control?._children;
  for (const step of location) {
    if (node == null) return undefined;
    node = node[step];
  }
  return node;
}

/** The options `bakeCustomComponentFilmstrip` needs to make a baked strip again, from its record. */
export function rebakeOptionsFor(asset) {
  if (asset?.generated !== true) return null;
  const bake = asset.bake ?? {};
  return {
    name: asset.name,
    frameCount: asset.frameCount,
    frameWidth: bake.logicalFrameWidth ?? asset.frameWidth,
    frameHeight: bake.logicalFrameHeight ?? asset.frameHeight,
    orientation: asset.orientation,
    outputScale: bake.outputScale ?? 1,
    valueSource: asset.valueSource,
    interpolation: asset.interpolation,
  };
}

/**
 * Plan a replace: a new source for an existing asset, and every copy of the old one with it.
 *
 * `replacement` is `{ source, width, height, fileName }` as the import path measures it. Returns
 * `{ ok: true, patchesByControlId, panelUpdates, copies, outsideUndo, duplicates, staleBakes, label }`,
 * or `{ ok: false, error }`.
 */
export function planAssetReplace(control, kind, name, replacement, { panel = null } = {}) {
  const map = ASSET_MAP_BY_KIND[kind];
  const asset = control?._children?.Assets?.[map]?.[name] ?? null;
  const source = text(replacement?.source);
  if (!map || !asset) return { ok: false, error: 'No such asset.' };
  if (!source) return { ok: false, error: 'The replacement has no source.' };
  if (source === text(asset.source)) return { ok: false, error: 'That is the same picture.' };

  const ownerId = control._children.Core?.id ?? null;
  const patches = new Map();

  // The whole asset, not field by field: a baked strip replaced by a file is not baked any more,
  // and the only way to drop `generated`, `generator`, `generatedAt` and `bake` through a patch is
  // to write the object without them.
  const { generated, generator, generatedAt, bake, ...kept } = asset;
  addPatch(patches, ownerId, `Assets.${map}.${name}`, {
    ...kept,
    source,
    width: Math.max(0, Math.round(Number(replacement.width) || 0)),
    height: Math.max(0, Math.round(Number(replacement.height) || 0)),
    sourceFileName: text(replacement.fileName),
    importedAt: new Date().toISOString(),
  });

  const references = componentAssetReferences(control, { panel }).byAsset.get(assetKey(kind, name)) ?? [];
  const copies = [];
  const duplicates = [];
  const panelUpdates = {};
  let usedByComponent = false;
  for (const reference of references) {
    if (reference.via === 'duplicate') { duplicates.push(reference); continue; }
    if (reference.controlId === ownerId) usedByComponent = true;
    if (reference.via !== 'copy') continue;
    copies.push(reference);
    if (reference.controlId == null) panelUpdates[reference.location[0]] = source;
    else addPatch(patches, reference.controlId, referencePatchPath(reference.location), source);
  }

  const staleBakes = [];
  if (usedByComponent) {
    for (const [stripName, strip] of Object.entries(control._children.Assets?.filmstrips ?? {})) {
      if (stripName === name && kind === 'filmstrip') continue;
      const options = rebakeOptionsFor(strip);
      if (options) staleBakes.push({ name: stripName, options });
    }
  }

  return {
    ok: true,
    patchesByControlId: patches,
    panelUpdates,
    copies,
    outsideUndo: Object.keys(panelUpdates),
    duplicates,
    staleBakes,
    label: `Replace ${name}`,
  };
}
