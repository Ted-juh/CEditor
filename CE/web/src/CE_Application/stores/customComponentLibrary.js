// customComponentLibrary.js — the author's saved components.
//
// Kept in IndexedDB (utils/browserDatabase.js) as one ordered record. It lived in localStorage,
// where every entry's thumbnail and full component plan counted against the same ~5 MB as every
// other preference, and a library of a few dozen components could fill it. A library an older
// build left there is picked up on start and moved on the first save.
import { writable, get } from 'svelte/store';
import { readStoredJson, removeStoredValue, writeStoredJson } from '../utils/localStorageState.js';
import { browserDatabase, readRecord, writeRecord } from '../utils/browserDatabase.js';
import {
  createCustomComponentExportEnvelope,
  customComponentPackageId,
  normalizeCustomComponentEnvelope,
} from '../utils/customComponentPackage.js';

const STORAGE_KEY = 'ce.customComponentLibrary.v1';
const RECORD_KEY = 'componentLibrary';

function normalizeEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const envelope = normalizeCustomComponentEnvelope(entry);
      if (!envelope) return null;
      return {
        id: entry.id ?? customComponentPackageId(envelope),
        savedAt: entry.savedAt ?? envelope.exportedAt,
        lastUsedAt: entry.lastUsedAt ?? '',
        useCount: Number.isFinite(Number(entry.useCount)) ? Number(entry.useCount) : 0,
        pinned: entry.pinned === true,
        name: envelope.metadata.name,
        version: envelope.metadata.version,
        author: envelope.metadata.author,
        description: envelope.metadata.description,
        category: envelope.metadata.category,
        license: envelope.metadata.license,
        homepage: envelope.metadata.homepage,
        tags: envelope.metadata.tags,
        publicApi: envelope.publicApi,
        publicApiSummary: envelope.publicApiSummary,
        validation: envelope.validation,
        readiness: envelope.readiness,
        summary: envelope.summary,
        thumbnail: envelope.thumbnail,
        capabilities: envelope.capabilities,
        fingerprint: envelope.fingerprint,
        component: envelope.component,
        envelope,
      };
    })
    .filter(Boolean);
}

function createEntry(envelope, savedAt = new Date().toISOString()) {
  if (!envelope) return null;
  return {
    id: customComponentPackageId(envelope),
    savedAt,
    lastUsedAt: '',
    useCount: 0,
    pinned: false,
    name: envelope.metadata.name,
    version: envelope.metadata.version,
    author: envelope.metadata.author,
    description: envelope.metadata.description,
    category: envelope.metadata.category,
    license: envelope.metadata.license,
    homepage: envelope.metadata.homepage,
    tags: envelope.metadata.tags,
    validation: envelope.validation,
    readiness: envelope.readiness,
    summary: envelope.summary,
    thumbnail: envelope.thumbnail,
    capabilities: envelope.capabilities,
    fingerprint: envelope.fingerprint,
    publicApi: envelope.publicApi,
    publicApiSummary: envelope.publicApiSummary,
    component: envelope.component,
    envelope,
  };
}

function createLibraryStore() {
  // What an older build left in localStorage, shown at once; the database's copy replaces it as
  // soon as it has been read (below).
  const store = writable(normalizeEntries(readStoredJson(STORAGE_KEY, [])));
  let changedBeforeLoad = false;
  let writes = Promise.resolve();

  function persist(entries) {
    changedBeforeLoad = true;
    if (!browserDatabase()) {
      writeStoredJson(STORAGE_KEY, entries);
      return entries;
    }
    // In order, one after another, each after the first read: a save made in the first moments
    // after start-up must not be overwritten by the load, nor land before it.
    writes = writes.then(() => ready).then(async () => {
      if (await writeRecord(RECORD_KEY, entries)) removeStoredValue(STORAGE_KEY);
      else writeStoredJson(STORAGE_KEY, entries);
    });
    return entries;
  }

  const ready = (async () => {
    if (!browserDatabase()) return;
    const stored = await readRecord(RECORD_KEY, null);
    if (!Array.isArray(stored)) {
      // Nothing in the database yet. A library an older build left in localStorage moves now, not
      // at the next change to it — that could be never, and the space is wanted back.
      const legacy = readStoredJson(STORAGE_KEY, null);
      if (Array.isArray(legacy) && legacy.length && await writeRecord(RECORD_KEY, legacy)) removeStoredValue(STORAGE_KEY);
      return;
    }
    const loaded = normalizeEntries(stored);
    // Anything saved while the read was in flight stays, in front; the rest comes from the database.
    store.update((current) => {
      if (!changedBeforeLoad) return loaded;
      const ids = new Set(current.map((entry) => entry.id));
      return [...current, ...loaded.filter((entry) => !ids.has(entry.id))];
    });
  })();

  return {
    subscribe: store.subscribe,
    /** Resolves once the library has been read from the database (immediately where there is none). */
    ready: () => ready,
    /** Tests only: resolves once every write so far has committed. */
    settled: () => writes,
    saveControl(control, metadata = {}) {
      if (!control?._children?.Core?.id) return null;
      const envelope = createCustomComponentExportEnvelope(control, metadata);
      const entry = createEntry(envelope, envelope.exportedAt);
      store.update((entries) => persist([entry, ...entries.filter((item) => item.id !== entry.id)]));
      return entry;
    },
    importEnvelope(value) {
      const envelope = normalizeCustomComponentEnvelope(value);
      if (!envelope) return null;
      const entry = createEntry(envelope);
      store.update((entries) => persist([entry, ...entries.filter((item) => item.id !== entry.id)]));
      return entry;
    },
    updateMetadata(id, metadata = {}) {
      let updated = null;
      store.update((entries) => {
        const current = entries.find((entry) => entry.id === id);
        if (!current?.envelope) return entries;
        const envelope = normalizeCustomComponentEnvelope({
          ...current.envelope,
          metadata: {
            ...current.envelope.metadata,
            ...metadata,
          },
        });
        updated = createEntry(envelope, current.savedAt);
        return persist([updated, ...entries.filter((entry) => entry.id !== id && entry.id !== updated.id)]);
      });
      return updated;
    },
    duplicate(id, metadata = {}) {
      let duplicated = null;
      store.update((entries) => {
        const current = entries.find((entry) => entry.id === id);
        if (!current?.envelope) return entries;
        const envelope = normalizeCustomComponentEnvelope({
          ...current.envelope,
          exportedAt: new Date().toISOString(),
          metadata: {
            ...current.envelope.metadata,
            name: `${current.name} Copy`,
            id: `${current.envelope.metadata?.id ?? current.name}-copy-${Date.now().toString(36)}`,
            ...metadata,
          },
        });
        duplicated = createEntry(envelope);
        return persist([duplicated, ...entries]);
      });
      return duplicated;
    },
    remove(id) {
      store.update((entries) => persist(entries.filter((entry) => entry.id !== id)));
    },
    markUsed(id) {
      let updated = null;
      store.update((entries) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index < 0) return entries;
        updated = {
          ...entries[index],
          lastUsedAt: new Date().toISOString(),
          useCount: Number(entries[index].useCount ?? 0) + 1,
        };
        const next = [...entries];
        next[index] = updated;
        return persist(next);
      });
      return updated;
    },
    togglePinned(id) {
      let updated = null;
      store.update((entries) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index < 0) return entries;
        updated = {
          ...entries[index],
          pinned: entries[index].pinned !== true,
        };
        const next = [...entries];
        next[index] = updated;
        return persist(next);
      });
      return updated;
    },
    clear() {
      store.set(persist([]));
    },
    snapshot() {
      return get(store);
    },
  };
}

export const customComponentLibrary = createLibraryStore();
