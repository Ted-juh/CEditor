// Screen Builder documents: the "assignments, not layouts" model in the editor. A screen
// document is pages of encoder-slot -> device-parameter bindings; exportAssignment emits
// the same JSON the native CTRL49 host consumes (tools/ctrl49/*.assignment.json), keeping
// the editor and the hardware path in lockstep.
//
// Classic writable/derived stores, matching stores/componentWorkspace.js.

import { derived, get, writable } from 'svelte/store';

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

export function createScreenDocument({ name = 'Untitled Screen', starter = true } = {}) {
  const id = uniqueScreenDocumentId();
  const document = {
    id,
    name,
    modified: false,
    deviceRole: 'mainSynth',
    profilePath: '../../CE/profiles/test/roland-gaia.ceditor-device.json',
    pages: [starter ? starterPage() : { title: 'PAGE 1', slots: emptySlots() }],
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
