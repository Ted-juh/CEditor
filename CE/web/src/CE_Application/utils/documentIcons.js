/**
 * documentIcons.js — the icons a panel carries, so its controls show them wherever it is opened.
 *
 * An icon lives in the author's icon library (Settings → Icons), and a control only refers to it:
 * `Icon.assetId`, with `Icon.name` as a fallback. The editor that holds the library draws it; nothing
 * else can. The exported plug-in's player has no settings at all, and a panel shared with someone
 * whose library lacks the icon opens with an empty space where it was. The same gap fonts had
 * (utils/documentFonts.js), and closed the same way.
 *
 * A panel leaving the editor — packaged to share, or prepared for export, which is the same path
 * (stores/panelSharing.js) — carries the library icons it uses, as `panel.icons`:
 *
 *   [{ id, name, dataUrl, mimeType?, isVector?, width?, height? }]
 *
 * `id` and `name` are the library entry's, so the control's reference finds it unchanged. Wherever
 * the panel is opened, `setDocumentIcons` makes them available, and `resolveIcon` looks them up
 * after the library's own entry by id and before any match by name: the library still wins when it
 * has the very icon, a carried icon wins over a different library icon that happens to share the
 * name.
 *
 * WHICH ICONS. The ones the panel can show: every Icon section and every `Icon.*` state patch, each
 * resolved exactly as the renderer resolves it, plus any library icon a script names in quotes —
 * `ce.image.icon("Play", "pause")` switches to an icon no control shows yet, and the player has no
 * library to find it in. Only enabled icons with a picture: a disabled one is not drawn in the editor
 * either. A reference that resolves to nothing is broken already and is left alone, not reported —
 * it must not stop an export that worked before icons travelled.
 */
import { writable, get } from 'svelte/store';

const ICON_SECTION = 'Icon';

/** One icon reference: `{ assetId, name }`, from a section or a state patch. */
function referenceFrom(source, assetId, name) {
  if (source === 'none') return null;
  const id = typeof assetId === 'string' ? assetId.trim() : '';
  const label = typeof name === 'string' ? name.trim() : '';
  return id || label ? { assetId: id, name: label } : null;
}

/** Whether `node`, reached under `key`, is a section of that type. A saved or shared document writes
 *  each control as a difference from its defaults, and `_type` is a default: there the section is
 *  known only by the key it sits under in `_children`. */
const isSection = (node, key, type) => node._type === type || key === type;

/**
 * Every icon reference in a panel's controls: Icon sections (`{ assetId, name }`), and state
 * patches, which write the same fields as paths (`{ 'Icon.assetId': …, 'Icon.name': … }`, also
 * inside a part's patch map).
 */
export function panelIconReferences(panel) {
  const refs = [];
  const walk = (node, key = '') => {
    if (Array.isArray(node)) { node.forEach((item) => walk(item)); return; }
    if (!node || typeof node !== 'object') return;
    if (isSection(node, key, ICON_SECTION)) {
      const ref = referenceFrom(node.source, node.assetId, node.name);
      if (ref) refs.push(ref);
    }
    const patchKeys = Object.keys(node).filter((key) => /(^|\.)Icon\.(assetId|name)$/.test(key));
    if (patchKeys.length) {
      // Grouped by what precedes `Icon.`, so a part's patch and the component's stay two references.
      const groups = new Map();
      for (const key of patchKeys) {
        const prefix = key.slice(0, key.lastIndexOf('Icon.'));
        if (!groups.has(prefix)) groups.set(prefix, {});
        groups.get(prefix)[key.slice(key.lastIndexOf('.') + 1)] = node[key];
      }
      for (const [prefix, fields] of groups) {
        const ref = referenceFrom(node[`${prefix}Icon.source`], fields.assetId, fields.name);
        if (ref) refs.push(ref);
      }
    }
    for (const [childKey, value] of Object.entries(node)) {
      if (value && typeof value === 'object') walk(value, childKey);
    }
  };
  walk(panel?.controls ?? []);
  return refs;
}

/** Every string a panel's scripts hold — source text, compiled text, a visual script's arguments. */
function panelScriptText(panel) {
  const strings = [];
  const collect = (node) => {
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (node && typeof node === 'object') Object.values(node).forEach(collect);
  };
  collect(panel?.scripts ?? []);
  const walk = (node, key = '') => {
    if (Array.isArray(node)) { node.forEach((item) => walk(item)); return; }
    if (!node || typeof node !== 'object') return;
    if (isSection(node, key, 'Scripts')) { collect(node.scripts ?? []); return; }
    for (const [childKey, value] of Object.entries(node)) {
      if (value && typeof value === 'object') walk(value, childKey);
    }
  };
  walk(panel?.controls ?? []);
  return strings;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a script names this text: as a whole string value, or in quotes inside source text. */
function scriptsName(strings, text) {
  const wanted = String(text ?? '').trim();
  if (!wanted) return false;
  const lower = wanted.toLowerCase();
  const quoted = new RegExp(`["'\`]${escapeRegExp(wanted)}["'\`]`, 'i');
  return strings.some((s) => s.trim().toLowerCase() === lower || quoted.test(s));
}

/** An icon that can be drawn: enabled, with a picture. */
function drawable(entry) {
  return entry && entry.enabled !== false && typeof entry.dataUrl === 'string' && entry.dataUrl.startsWith('data:');
}

/** A carried icon as the document stores it. */
export function validDocumentIcon(icon) {
  return icon && typeof icon.id === 'string' && icon.id.trim()
    && typeof icon.name === 'string'
    && typeof icon.dataUrl === 'string' && icon.dataUrl.startsWith('data:image/');
}

/**
 * The picture a reference shows, or null. The renderer's order: the library's entry by id, the
 * document's by id, then the same two by name. `library` is the icon library (settings entries);
 * `carried` the icons open documents bring with them.
 */
export function resolveIcon(ref, library, carried = []) {
  const libraryIcons = (Array.isArray(library) ? library : []).filter(drawable);
  const documentIcons = (Array.isArray(carried) ? carried : []).filter(validDocumentIcon);
  const assetId = String(ref?.assetId ?? '');
  if (assetId) {
    const found = libraryIcons.find((entry) => entry.id === assetId)
      ?? documentIcons.find((entry) => entry.id === assetId);
    if (found) return found;
  }
  const name = String(ref?.name ?? '');
  if (!name) return null;
  return libraryIcons.find((entry) => entry.name === name)
    ?? documentIcons.find((entry) => entry.name === name)
    ?? null;
}

function carriedForm(entry) {
  return {
    id: String(entry.id),
    name: String(entry.name ?? ''),
    dataUrl: entry.dataUrl,
    ...(entry.mimeType ? { mimeType: String(entry.mimeType) } : {}),
    ...(entry.isVector === true ? { isVector: true } : {}),
    ...(Number(entry.width) > 0 ? { width: Number(entry.width) } : {}),
    ...(Number(entry.height) > 0 ? { height: Number(entry.height) } : {}),
  };
}

/**
 * The icons to carry for a panel. `storedIcons` is the icon library; icons the panel already carries
 * — it arrived from someone else — count as well, so a panel passed on keeps the icons it came with.
 */
export function embedPanelIcons(panel, storedIcons) {
  const alreadyCarried = (Array.isArray(panel?.icons) ? panel.icons : []).filter(validDocumentIcon);
  const chosen = new Map();
  const keep = (entry) => { if (entry && !chosen.has(entry.id)) chosen.set(entry.id, carriedForm(entry)); };

  for (const ref of panelIconReferences(panel)) keep(resolveIcon(ref, storedIcons, alreadyCarried));

  // Icons only a script reaches. ce.image.icon finds by id, then by name ignoring case
  // (utils/imageLayers.js findAsset), so a quoted name in any case counts.
  const strings = panelScriptText(panel);
  if (strings.length) {
    const candidates = [...(storedIcons ?? []).filter(drawable), ...alreadyCarried];
    for (const entry of candidates) {
      if (chosen.has(entry.id)) continue;
      if (scriptsName(strings, entry.id) || scriptsName(strings, entry.name)) keep(entry);
    }
  }
  return [...chosen.values()];
}

/** A panel with the icons it uses carried in it (a copy; `icons` replaced, or removed when none). */
export function withEmbeddedIcons(panel, storedIcons) {
  const icons = embedPanelIcons(panel, storedIcons);
  const next = { ...panel };
  if (icons.length) next.icons = icons;
  else delete next.icons;
  return next;
}

// --- Opening a panel that carries icons ------------------------------------------------------------

/**
 * The icons every open document carries — the editor's open panels (stores/documentIconSources.js),
 * or the one panel the player shows. Replaced as a whole, so a closed panel's icons stop answering.
 */
export const documentIcons = writable([]);

export function setDocumentIcons(icons) {
  const seen = new Set();
  const list = [];
  for (const icon of Array.isArray(icons) ? icons : []) {
    if (!validDocumentIcon(icon) || seen.has(icon.id)) continue;
    seen.add(icon.id);
    list.push(icon);
  }
  const current = get(documentIcons);
  const same = current.length === list.length
    && current.every((icon, i) => icon.id === list[i].id && icon.dataUrl === list[i].dataUrl);
  if (!same) documentIcons.set(list);
}
