/**
 * browserDatabase.js — the editor's IndexedDB database, through Dexie.
 *
 * WHY NOT localStorage. It holds about 5 MB per origin, it stores strings only, and every write is
 * a synchronous JSON.stringify of the whole value on the main thread. Two things the editor keeps
 * outgrew it:
 *
 *   - the unsaved-work recovery snapshot, which is whole documents — and documents now carry inline
 *     images and fonts. utils/localStorageState.js had to learn to give up on a key that was
 *     refused for size, because the GAIA panel's snapshot never fitted; recovery for a large panel
 *     simply did not happen, with a warning;
 *   - the component library, whose entries each carry a thumbnail and a full component plan.
 *
 * IndexedDB stores structured values (no stringify), is asynchronous, and is limited by disk rather
 * than by a fixed 5 MB. Dexie (Apache-2.0) is a thin layer over it that makes versioned schemas and
 * transactions readable; nothing here depends on anything Dexie does beyond that.
 *
 * WHAT THIS IS NOT: the record. A saved .cepanel is the document; browser storage belongs to one
 * WebView2 profile on one machine and is cleared with it. Everything kept here is a cache, a
 * convenience or a safety net, and the code that uses it treats a missing database as "nothing was
 * kept" rather than as an error.
 *
 * One table, `records`: key → value, one row per thing — the recovery snapshot is one row, the
 * component library another (its order is part of it: most recently saved first).
 */
import Dexie from 'dexie';

const DATABASE_NAME = 'ceditor';

let database = null;
let unavailable = false;

/** The database, or null where IndexedDB does not exist (node without a shim, a locked-down profile). */
export function browserDatabase() {
  if (database) return database;
  if (unavailable || typeof indexedDB === 'undefined') return null;
  try {
    // The factory is passed rather than left to Dexie, which captures the global when it is first
    // imported: the tests install an in-memory IndexedDB after that, per test.
    const db = new Dexie(DATABASE_NAME, { indexedDB, IDBKeyRange: globalThis.IDBKeyRange });
    db.version(1).stores({ records: 'key' });
    database = db;
    return db;
  } catch (error) {
    unavailable = true;
    console.warn('[browserDatabase] IndexedDB is not available', error);
    return null;
  }
}

/** A stored value, or `fallback` when there is none or the database cannot be read. */
export async function readRecord(key, fallback = null) {
  const db = browserDatabase();
  if (!db) return fallback;
  try {
    const row = await db.records.get(key);
    return row === undefined ? fallback : row.value;
  } catch (error) {
    console.warn(`[browserDatabase] could not read "${key}"`, error);
    return fallback;
  }
}

/** Store a value. Resolves true when it is committed, false when it could not be. */
export async function writeRecord(key, value) {
  const db = browserDatabase();
  if (!db) return false;
  try {
    try {
      await db.records.put({ key, value });
    } catch (error) {
      // Structured clone refuses what JSON accepts in one case that matters here: a Svelte 5
      // `$state` proxy that found its way into a document. A JSON copy is the same data.
      if (error?.name !== 'DataCloneError' && error?.inner?.name !== 'DataCloneError') throw error;
      await db.records.put({ key, value: JSON.parse(JSON.stringify(value)) });
    }
    return true;
  } catch (error) {
    console.warn(`[browserDatabase] could not write "${key}"`, error);
    return false;
  }
}

export async function removeRecord(key) {
  const db = browserDatabase();
  if (!db) return;
  try {
    await db.records.delete(key);
  } catch (error) {
    console.warn(`[browserDatabase] could not remove "${key}"`, error);
  }
}

/** Tests only: drop the handle so the next call opens a fresh database (after the shim is reset). */
export async function resetBrowserDatabaseForTests() {
  if (database) await database.delete();
  database = null;
  unavailable = false;
}
