// Screen Builder documents: the "assignments, not layouts" model in the editor. A screen
// document is pages of encoder-slot -> device-parameter bindings; exportAssignment emits
// the same JSON the native CTRL49 host consumes (tools/ctrl49/*.assignment.json), keeping
// the editor and the hardware path in lockstep.
//
// Classic writable/derived stores, matching stores/componentWorkspace.js.

import { derived, get, writable } from 'svelte/store';
import { openTypedDocument, saveTypedDocument, saveTypedDocumentAs, typedDocumentNameFromFile } from './typedDocuments.js';
import { notify } from './scriptUi.js';

export const screenDocuments = writable([]);
export const activeScreenDocumentId = writable(null);

export const activeScreenDocument = derived(
  [screenDocuments, activeScreenDocumentId],
  ([$documents, $activeId]) => $documents.find((doc) => doc.id === $activeId) ?? null
);

function uniqueScreenDocumentId() {
  return `ctrl_screen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// A sensible GAIA filter starter so a new screen shows real bindings immediately.
const STARTER_SLOTS = [
  { label: 'CUTOFF',  param: 'filter.cutoff' },
  { label: 'RESO',    param: 'filter.resonance' },
  { label: 'ENV DEP', param: 'filter.envDepth' },
  { label: 'KEYFOL',  param: 'filter.cutoffKeyfollow' },
  { label: 'ATTACK',  param: 'filter.envAttack' },
  { label: 'DECAY',   param: 'filter.envDecay' },
  { label: 'SUSTAIN', param: 'filter.envSustain' },
  { label: 'RELEASE', param: 'filter.envRelease' },
];

function emptySlots() {
  return Array.from({ length: 8 }, () => ({ label: '', param: '' }));
}

function starterPage(title = 'FILTER') {
  return { title, slots: STARTER_SLOTS.map((slot) => ({ ...slot })) };
}

export function createScreenDocument({
  name = 'Untitled Screen', starter = true, pages = null, deviceRole = 'mainSynth',
  profilePath = '../../CE/profiles/test/roland-gaia.ceditor-device.json', filePath = '',
} = {}) {
  const id = uniqueScreenDocumentId();
  const document = {
    id,
    name,
    modified: false,
    // Where it was saved or opened from: Save writes there, and the tab and the quit check know it
    // can be saved without a dialog. Empty until then.
    filePath,
    deviceRole,
    profilePath,
    pages: pages ?? [starter ? starterPage() : { title: 'PAGE 1', slots: emptySlots() }],
  };
  screenDocuments.update((documents) => [...documents, document]);
  activeScreenDocumentId.set(id);
  return document;
}

function mutate(id, mutator) {
  screenDocuments.update((documents) =>
    documents.map((doc) => (doc.id === id ? { ...mutator(doc), modified: true } : doc)));
}

export function renameScreenDocument(id, name) {
  mutate(id, (doc) => ({ ...doc, name }));
}

export function setScreenDocumentField(id, field, value) {
  mutate(id, (doc) => ({ ...doc, [field]: value }));
}

export function addScreenPage(id) {
  mutate(id, (doc) => ({
    ...doc,
    pages: [...doc.pages, { title: `PAGE ${doc.pages.length + 1}`, slots: emptySlots() }],
  }));
}

export function removeScreenPage(id, pageIndex) {
  mutate(id, (doc) => ({
    ...doc,
    pages: doc.pages.length > 1 ? doc.pages.filter((_, i) => i !== pageIndex) : doc.pages,
  }));
}

export function setScreenPageTitle(id, pageIndex, title) {
  mutate(id, (doc) => ({
    ...doc,
    pages: doc.pages.map((page, i) => (i === pageIndex ? { ...page, title } : page)),
  }));
}

export function setScreenSlot(id, pageIndex, slotIndex, patch) {
  mutate(id, (doc) => ({
    ...doc,
    pages: doc.pages.map((page, i) =>
      i !== pageIndex ? page : {
        ...page,
        slots: page.slots.map((slot, s) => (s === slotIndex ? { ...slot, ...patch } : slot)),
      }),
  }));
}

export function closeScreenDocument(id) {
  screenDocuments.update((documents) => documents.filter((doc) => doc.id !== id));
  if (get(activeScreenDocumentId) === id) activeScreenDocumentId.set(null);
}

export function setActiveScreenDocument(id) {
  activeScreenDocumentId.set(id);
}

// The assignment JSON the native host consumes.
export function exportAssignment(doc) {
  return {
    name: doc.name,
    profile: doc.profilePath,
    role: doc.deviceRole,
    pages: doc.pages.map((page) => ({
      title: page.title,
      slots: page.slots.map((slot) => ({ label: slot.label || slot.param, param: slot.param })),
    })),
  };
}

// --- Files ---------------------------------------------------------------------------------------
// A screen is saved as its assignment: the JSON above, in a `.assignment.json` file, which is what
// the native bridge loads (Ctrl49Bridge.exe my.assignment.json). One file is the document and what
// the keyboard runs, so there is no second format to keep in step with the first.

const SCREEN_KIND = 'ctrl49Screen';
const SLOT_COUNT = 8;

/**
 * A screen document's fields from an assignment file's text, or null when it is not one. Every
 * page has at least the eight encoder slots the editor shows; a file with more keeps them. A label
 * the export filled in from the parameter (exportAssignment writes `label || param`) comes back
 * empty, as it was.
 */
export function screenDocumentFromAssignment(text) {
  let parsed;
  try { parsed = JSON.parse(String(text ?? '')); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pages)) return null;
  const pages = parsed.pages.map((page, i) => {
    const slots = (Array.isArray(page?.slots) ? page.slots : []).map((slot) => {
      const param = String(slot?.param ?? '');
      const label = String(slot?.label ?? '');
      return { label: label === param ? '' : label, param };
    });
    while (slots.length < SLOT_COUNT) slots.push({ label: '', param: '' });
    return { title: String(page?.title ?? `PAGE ${i + 1}`), slots };
  });
  if (!pages.length) pages.push({ title: 'PAGE 1', slots: emptySlots() });
  return {
    name: String(parsed.name ?? '').trim(),
    deviceRole: String(parsed.role ?? 'mainSynth'),
    profilePath: String(parsed.profile ?? ''),
    pages,
  };
}

/** The file text a screen saves as. */
export function screenDocumentText(doc) {
  return `${JSON.stringify(exportAssignment(doc), null, 2)}\n`;
}

/**
 * Save a screen: to its file, or through a dialog the first time and for Save As. Resolves to
 * whether it was written. Marked saved only if nothing changed while the file was being written.
 */
export async function saveScreenDocument(id, { saveAs = false } = {}) {
  const doc = get(screenDocuments).find((entry) => entry.id === id);
  if (!doc) return false;
  const text = screenDocumentText(doc);
  const result = !saveAs && doc.filePath
    ? await saveTypedDocument(SCREEN_KIND, doc.filePath, text)
    : await saveTypedDocumentAs(SCREEN_KIND, doc.name, text);
  if (result.cancelled) return false;
  if (!result.ok) {
    notify(`Could not save "${doc.name}"${result.filePath ? ` to ${result.filePath}` : ''}. Your changes are still here; try Save As to another folder.`, { kind: 'error', duration: 0 });
    return false;
  }
  screenDocuments.update((documents) => documents.map((entry) => {
    if (entry.id !== id) return entry;
    const unchanged = screenDocumentText(entry) === text;
    const named = saveAs || !entry.filePath;
    return {
      ...entry,
      filePath: result.filePath || entry.filePath,
      name: named && result.name ? typedDocumentNameFromFile(SCREEN_KIND, result.name) || entry.name : entry.name,
      modified: unchanged ? false : entry.modified,
    };
  }));
  if (result.downloaded) notify(`"${doc.name}" downloaded as ${result.name}.`, { kind: 'info' });
  return true;
}

/** Open a saved screen in a tab of its own; one already open from that file is brought forward. */
export async function openScreenDocumentFromFile() {
  const result = await openTypedDocument(SCREEN_KIND);
  if (!result.ok) {
    if (!result.cancelled) notify(`Could not read ${result.filePath || 'that file'}.`, { kind: 'error' });
    return null;
  }
  if (result.filePath) {
    const open = get(screenDocuments).find((entry) => entry.filePath === result.filePath);
    if (open) { activeScreenDocumentId.set(open.id); return open; }
  }
  const fields = screenDocumentFromAssignment(result.data);
  if (!fields) {
    notify(`${result.name || 'That file'} is not a CTRL49 screen: it has no pages.`, { kind: 'error' });
    return null;
  }
  return createScreenDocument({
    ...fields,
    name: fields.name || typedDocumentNameFromFile(SCREEN_KIND, result.name) || 'Screen',
    filePath: result.filePath,
  });
}
