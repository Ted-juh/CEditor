/** IndexedDB cache for recovery snapshots and the component library.
 * Use native transactions: Dexie's Promise zone patches conflict with SES lockdown.
 * Keep the database, schema and records compatible with existing installations.
 */
const DATABASE_NAME = 'ceditor';
// Dexie version(1) creates native IndexedDB version 10.
const DATABASE_VERSION = 10;
let database = null;
let unavailable = false;

export function browserDatabase() {
  if (database) return database;
  if (unavailable || typeof indexedDB === 'undefined') return null;
  try {
    const factory = indexedDB;
    let connection = null;
    let opening = null;
    const open = () => {
      if (connection) return Promise.resolve(connection);
      if (!opening) {
        opening = new Promise((resolve, reject) => {
          const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('records')) {
              request.result.createObjectStore('records', { keyPath: 'key' });
            }
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            connection = request.result;
            connection.onversionchange = () => {
              connection?.close();
              connection = null;
              opening = null;
            };
            resolve(connection);
          };
        }).catch(error => { opening = null; throw error; });
      }
      return opening;
    };
    const transact = async (mode, operation) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('records', mode);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
        // Request errors normally abort the transaction; report only once it finishes.
        try {
          const request = operation(transaction.objectStore('records'));
          request.onsuccess = () => { result = request.result; };
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    };
    database = {
      records: {
        get: key => transact('readonly', store => store.get(key)),
        put: row => transact('readwrite', store => store.put(row)),
        delete: key => transact('readwrite', store => store.delete(key)),
      },
      async delete() {
        if (opening) await opening.catch(() => {});
        connection?.close();
        connection = null;
        opening = null;
        await new Promise((resolve, reject) => {
          const request = factory.deleteDatabase(DATABASE_NAME);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      },
    };
    return database;
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
