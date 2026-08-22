import { derived, writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

/**
 * recentFiles.js — one MRU list of everything this app can re-open.
 *
 * Review finding D6: "File has no Recent Files (panels track `filePath`; a recent list exists
 * for scripts only)." That script list is per-document (`scriptWorkspace.js:154-156` keeps a
 * `recentFiles` array *inside* each script document), so it can only ever answer "what did this
 * workspace load", never "what was I working on yesterday" — and a panel, a component package
 * or a device profile could not appear in it at all.
 *
 * So: one store, four kinds, single source of truth. The open/save call sites live in
 * panels.js / scriptWorkspace.js / componentWorkspace.js / deviceProfiles.js, which each call
 * `rememberRecentFile` once and know nothing else about the list.
 *
 * Two things here are deliberate and easy to undo by accident:
 *
 * 1. IDENTITY IS NOT THE RAW PATH. The same file reaches us spelled differently depending on
 *    which side produced it — the save handler echoes the native `C:\Panels\Kit.cepanel`, the
 *    session-restore path list has been round-tripped as `C:/Panels/kit.cepanel`. Compared
 *    literally those are two entries for one file, and the menu would list it twice. Identity is
 *    the separator- and case-folded path (Windows is the shipping platform and its filesystem is
 *    case-insensitive); the *display* keeps whatever spelling arrived last.
 * 2. THERE IS A PER-KIND CAP AS WELL AS A TOTAL. Without it, opening a dozen panels in a row
 *    evicts every script workspace and device profile from a list whose whole job is to be the
 *    way back to them.
 */

const STORAGE_KEY = 'ce.recentFiles';

/** Everything a tab can be. Anything else is dropped on the way in. */
export const RECENT_FILE_KINDS = ['panel', 'component', 'deviceProfile', 'script'];

/** Total entries kept. Deep history is a file dialog's job, not a menu's. */
export const MAX_RECENT_FILES = 20;

/** ...and no one kind may fill the list on its own (see note 2 above). */
export const MAX_RECENT_PER_KIND = 8;

/** How many of one kind a menu should show before it stops being a menu. */
export const RECENT_MENU_LIMIT = 6;

const KIND_LABELS = {
  panel: 'Panel',
  component: 'Component',
  deviceProfile: 'Device Profile',
  script: 'Script Workspace',
};

/** Human label for a kind — used for the submenu's group headers. */
export function recentKindLabel(kind) {
  return KIND_LABELS[kind] ?? 'Document';
}

function foldPath(path) {
  return String(path)
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * The dedupe key. Path-backed documents (panels, script workspaces) are the file they came from;
 * library-backed ones (component packages, device profiles) have no path at all and are the id
 * their store already keys them by.
 */
export function recentFileKey(entry) {
  if (!entry) return '';
  const kind = String(entry.kind ?? '');
  const path = String(entry.path ?? '').trim();
  if (path) return `${kind}\u0000path:${foldPath(path)}`;
  const id = String(entry.id ?? '').trim();
  return id ? `${kind}\u0000id:${id}` : '';
}

/** Basename for display; falls back to the stored name, then to the whole path. */
export function recentFileLabel(entry) {
  const name = String(entry?.name ?? '').trim();
  if (name) return name;
  const path = String(entry?.path ?? '').trim();
  if (!path) return String(entry?.id ?? '').trim() || 'Untitled';
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Coerce anything a call site hands us into a stored entry, or null if it could never be
 * re-opened. A recent entry with neither a path nor an id is a menu item that does nothing.
 */
export function normalizeRecentFile(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const kind = String(entry.kind ?? '');
  if (!RECENT_FILE_KINDS.includes(kind)) return null;

  const path = String(entry.path ?? '').trim();
  const id = String(entry.id ?? '').trim();
  if (!path && !id) return null;

  const name = String(entry.name ?? '').trim();
  const openedAt = typeof entry.openedAt === 'string' && entry.openedAt
    ? entry.openedAt
    : new Date().toISOString();

  const normalized = { kind, openedAt };
  if (path) normalized.path = path;
  if (id) normalized.id = id;
  normalized.name = name || recentFileLabel({ path, id });
  return normalized;
}

/** Apply both caps, newest first, without disturbing relative order. */
function applyCaps(list) {
  const perKind = new Map();
  const kept = [];
  for (const entry of list) {
    const used = perKind.get(entry.kind) ?? 0;
    if (used >= MAX_RECENT_PER_KIND) continue;
    perKind.set(entry.kind, used + 1);
    kept.push(entry);
    if (kept.length >= MAX_RECENT_FILES) break;
  }
  return kept;
}

function readInitial() {
  const stored = readStoredJson(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return [];
  const seen = new Set();
  const entries = [];
  for (const raw of stored) {
    const entry = normalizeRecentFile(raw);
    if (!entry) continue;
    const key = recentFileKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return applyCaps(entries);
}

export const recentFiles = writable(readInitial());

/**
 * Record one opened or saved document. Idempotent per file: re-opening something already in the
 * list moves it to the front and refreshes its display name and path spelling rather than
 * appending a second row.
 *
 * @param {{kind: string, path?: string, id?: string, name?: string, openedAt?: string}} entry
 * @returns the stored entry, or null if it was not re-openable
 */
export function rememberRecentFile(entry) {
  const normalized = normalizeRecentFile(entry);
  if (!normalized) return null;
  const key = recentFileKey(normalized);
  recentFiles.update((list) => {
    const next = applyCaps([normalized, ...list.filter((item) => recentFileKey(item) !== key)]);
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
  return normalized;
}

/** Drop one entry — for a file the backend has just told us is gone. */
export function forgetRecentFile(entryOrKey) {
  const key = typeof entryOrKey === 'string' ? entryOrKey : recentFileKey(entryOrKey);
  if (!key) return;
  recentFiles.update((list) => {
    const next = list.filter((item) => recentFileKey(item) !== key);
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
}

export function clearRecentFiles() {
  recentFiles.set([]);
  writeStoredJson(STORAGE_KEY, []);
}

/** Newest-first slice of one kind. Pure, so the menu can be tested without a store. */
export function recentFilesByKind(list, kind, limit = RECENT_MENU_LIMIT) {
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => entry?.kind === kind).slice(0, Math.max(0, limit));
}

/**
 * The list grouped for a menu: kinds in a fixed order so the submenu does not reshuffle itself
 * under the pointer, and empty groups dropped so it never shows a header with nothing under it.
 */
export function groupRecentFiles(list, limit = RECENT_MENU_LIMIT) {
  return RECENT_FILE_KINDS
    .map((kind) => ({ kind, label: recentKindLabel(kind), entries: recentFilesByKind(list, kind, limit) }))
    .filter((group) => group.entries.length > 0);
}

/** Ready-grouped for the File menu. */
export const recentFileGroups = derived(recentFiles, ($list) => groupRecentFiles($list));

/** Test seam: the store is module state, and a test that cannot reset it can only run once. */
export function resetRecentFilesForTest(entries = []) {
  const seeded = applyCaps(entries.map(normalizeRecentFile).filter(Boolean));
  recentFiles.set(seeded);
  writeStoredJson(STORAGE_KEY, seeded);
}

export const RECENT_FILES_STORAGE_KEY = STORAGE_KEY;
