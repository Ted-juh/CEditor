// panelPackage.js — a panel you can hand to somebody else.
//
// THE PROBLEM, stated as a user hits it. You build a panel, you send the `.cepanel` to a friend, and
// their copy has no images. Custom components have had a package format for a long time
// (`customComponentPackage.js`, embedding its own assets); panels never did, so a `.cepanel` is a
// document full of ABSOLUTE PATHS into the machine that made it. On the author's disk it looks
// perfect, which is why it survived: the failure only exists on the second computer.
//
// `docs/known-issues.md` recorded it, and `beta-readiness-review` §3.5 lists it under "no way in, no
// way out". This is the way out.
//
// THREE PLACES a panel points outside itself, and they were found by reading the model rather than
// by guessing (a fourth appearing later is why `collectPanelAssetRefs` is one function and every
// caller goes through it):
//
//   panel.bgImage                                  the panel's own backdrop
//   <control>.Background._children.Fill.imageSrc   any control with an image fill
//   <control>.Text.path                            a font, where one is given by path
//
// THE SHAPE IS DELIBERATELY THE CUSTOM-COMPONENT ONE. Same `format`/`formatVersion`/`compatibility`
// envelope, same idea of an asset map keyed by a content hash. Not for tidiness: it means the
// version-refusal behaviour, and a reader's expectations, are already established. A second
// convention for the same job is a second thing to explain.
//
// WHAT THIS MODULE DOES NOT DO: touch the filesystem. Reading and writing bytes belongs to the
// bridge, which differs between the editor and a browser, so both are injected. That is also what
// makes the whole thing testable here rather than only on Windows.

import { deepClone } from './deepClone.js';

export const PANEL_PACKAGE_FORMAT = 'ceditor-panel';
export const PANEL_PACKAGE_VERSION = 1;

/** Where an asset reference lives, so it can be read AND rewritten through one description. */
const REF_KIND = {
  panelBackground: 'panelBackground',
  controlImage: 'controlImage',
  controlFont: 'controlFont',
};

const text = (value) => String(value ?? '').trim();

/**
 * A stable id for an asset's bytes.
 *
 * Content-addressed, so the same image referenced by three controls is stored once and a panel that
 * is packaged twice produces the same ids — which is what makes two packages of an unchanged panel
 * diffable. FNV-1a because it only has to be stable and well-spread, not cryptographic; the same
 * reasoning (and the same constants) as `guidFromName` in the QA generator.
 */
export function assetIdFor(bytes, hint = '') {
  let h = 0x811c9dc5;
  const data = typeof bytes === 'string' ? bytes : String(bytes ?? '');
  for (let i = 0; i < data.length; i += 1) {
    h = Math.imul(h ^ data.charCodeAt(i), 0x01000193) >>> 0;
  }
  const ext = (hint.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase();
  return `a${h.toString(16).padStart(8, '0')}${ext ? `.${ext}` : ''}`;
}

/**
 * Every external file a panel points at, each with enough information to rewrite it later.
 *
 * One function, because the list of places is the thing most likely to grow — a new section with an
 * image field would otherwise be embedded by the packager and missed by the opener, which is a
 * package that works until it doesn't.
 */
export function collectPanelAssetRefs(panel) {
  const refs = [];

  const bg = text(panel?.bgImage);
  if (bg) refs.push({ kind: REF_KIND.panelBackground, path: bg, controlId: null });

  for (const control of panel?.controls ?? []) {
    const id = control?._children?.Core?.id ?? null;

    const imageSrc = text(control?._children?.Background?._children?.Fill?.imageSrc);
    if (imageSrc) refs.push({ kind: REF_KIND.controlImage, path: imageSrc, controlId: id });

    const fontPath = text(control?._children?.Text?.path);
    if (fontPath) refs.push({ kind: REF_KIND.controlFont, path: fontPath, controlId: id });
  }

  return refs;
}

/** The distinct files behind those references — the same image used twice is one asset. */
export function panelAssetPaths(panel) {
  return [...new Set(collectPanelAssetRefs(panel).map((ref) => ref.path))];
}

/** Rewrite one reference in place. Paired with the collector above so the two cannot disagree. */
function applyRef(panel, ref, value) {
  if (ref.kind === REF_KIND.panelBackground) {
    panel.bgImage = value;
    return;
  }
  const control = (panel.controls ?? []).find((c) => c?._children?.Core?.id === ref.controlId);
  if (!control) return;
  if (ref.kind === REF_KIND.controlImage) {
    const fill = control._children?.Background?._children?.Fill;
    if (fill) fill.imageSrc = value;
  } else if (ref.kind === REF_KIND.controlFont) {
    if (control._children?.Text) control._children.Text.path = value;
  }
}

/**
 * Package a panel with its assets embedded.
 *
 * `readAsset(path)` returns the file's bytes as a base64 string, or null when it cannot be read.
 * A missing file is NOT fatal: an author who moved an image should still get a package, with the
 * reference left alone and the file named in `missing`. Refusing outright would mean one stale path
 * blocks sharing an otherwise complete panel — and the author is the one person who can still find
 * that file.
 */
export async function createPanelPackage(panel, { readAsset, metadata = {}, now = null } = {}) {
  if (typeof readAsset !== 'function') throw new TypeError('createPanelPackage needs a readAsset(path) function');

  // deepClone, not structuredClone: a panel handed in from the editor is a Svelte $state proxy, and
  // structuredClone throws DataCloneError on one — taking out the render or store update around it.
  // `deepCloneProxySafety.test.js` caught this here, which is what it is for.
  const doc = deepClone(panel);
  const refs = collectPanelAssetRefs(doc);
  const assets = {};
  const missing = [];
  const byPath = new Map();

  for (const ref of refs) {
    if (!byPath.has(ref.path)) {
      const data = await readAsset(ref.path);
      if (data == null) {
        missing.push(ref.path);
        byPath.set(ref.path, null);
      } else {
        const id = assetIdFor(data, ref.path);
        assets[id] = { id, data, originalPath: ref.path, bytes: data.length };
        byPath.set(ref.path, id);
      }
    }
    const id = byPath.get(ref.path);
    // `asset:` rather than a bare id, so a reference into the package is distinguishable at a glance
    // from a path — including by a human reading the JSON, who is the one debugging it.
    if (id) applyRef(doc, ref, `asset:${id}`);
  }

  return {
    format: PANEL_PACKAGE_FORMAT,
    formatVersion: PANEL_PACKAGE_VERSION,
    compatibility: { minimumFormatVersion: PANEL_PACKAGE_VERSION },
    exportedAt: now ?? new Date().toISOString(),
    metadata: {
      name: text(metadata.name) || text(panel?.name) || 'Panel',
      author: text(metadata.author),
      description: text(metadata.description),
      version: text(metadata.version) || '1.0.0',
    },
    panel: doc,
    assets,
    missing,
  };
}

/** What is wrong with a package, in the order a reader would hit it. Empty means it will open. */
export function validatePanelPackage(envelope) {
  const issues = [];
  const warnings = [];

  if (envelope?.format !== PANEL_PACKAGE_FORMAT) {
    issues.push(`Not a panel package (format is ${JSON.stringify(envelope?.format ?? null)}).`);
    return { ok: false, issues, warnings };
  }

  const version = Number(envelope.formatVersion ?? 0);
  if (!Number.isFinite(version) || version < 1) issues.push('Package has no usable formatVersion.');
  // Newer than us is a refusal, not a warning: opening it would mean guessing at fields we do not
  // know, and a panel that half-opens is worse than one that does not.
  if (version > PANEL_PACKAGE_VERSION) {
    issues.push(`Package format ${version} is newer than this build understands (${PANEL_PACKAGE_VERSION}).`);
  }

  if (!envelope.panel || typeof envelope.panel !== 'object') issues.push('Package carries no panel.');
  else if (!Array.isArray(envelope.panel.controls)) issues.push('Package panel has no controls array.');

  // Dangling references are the failure this format exists to prevent, so they are checked rather
  // than discovered when the panel renders blank.
  const assets = envelope.assets ?? {};
  for (const ref of collectPanelAssetRefs(envelope.panel ?? {})) {
    if (!ref.path.startsWith('asset:')) continue;
    const id = ref.path.slice('asset:'.length);
    if (!assets[id]) issues.push(`Panel references asset "${id}", which is not in the package.`);
  }

  const referenced = new Set(collectPanelAssetRefs(envelope.panel ?? {})
    .filter((r) => r.path.startsWith('asset:'))
    .map((r) => r.path.slice('asset:'.length)));
  for (const id of Object.keys(assets)) {
    if (!referenced.has(id)) warnings.push(`Package carries asset "${id}" that nothing references.`);
  }

  if (envelope.missing?.length) {
    warnings.push(`${envelope.missing.length} asset(s) could not be read when this was packaged: `
      + envelope.missing.join(', '));
  }

  return { ok: issues.length === 0, issues, warnings };
}

/**
 * Open a package back into a panel.
 *
 * `writeAsset(id, base64, originalPath)` returns the path the bytes now live at — a real file in the
 * editor, a blob or data URI in a browser. Returning null leaves the `asset:` reference in place,
 * which keeps the panel loadable and makes the gap visible rather than silently blank.
 */
export async function openPanelPackage(envelope, { writeAsset } = {}) {
  const validation = validatePanelPackage(envelope);
  if (!validation.ok) return { ok: false, ...validation, panel: null };
  if (typeof writeAsset !== 'function') throw new TypeError('openPanelPackage needs a writeAsset(id, data, path) function');

  const panel = deepClone(envelope.panel);   // see the note in createPanelPackage
  const assets = envelope.assets ?? {};
  const resolved = new Map();
  const unresolved = [];

  for (const ref of collectPanelAssetRefs(panel)) {
    if (!ref.path.startsWith('asset:')) continue;
    const id = ref.path.slice('asset:'.length);
    if (!resolved.has(id)) {
      const asset = assets[id];
      const written = asset ? await writeAsset(id, asset.data, asset.originalPath ?? '') : null;
      resolved.set(id, written ?? null);
      if (!written) unresolved.push(id);
    }
    const target = resolved.get(id);
    if (target) applyRef(panel, ref, target);
  }

  return { ok: true, panel, issues: [], warnings: validation.warnings, unresolved };
}
