/**
 * fontWorkerClient.js — the page's side of workers/fontWorker.js.
 *
 * Every call has a fallback that does the same work here, on the page, and the fallback is taken
 * whenever the worker is not there to ask: no `Worker` (node, the tests), a worker that failed to
 * start (a WebView that refuses module workers from its scheme — WebKitGTK serves the app from a
 * custom one), or one that died. A worker is an optimisation; it must never be the reason text
 * does not outline or a panel does not package.
 *
 * One worker, started on first use and kept.
 */
import * as Comlink from 'comlink';

let connection = null;
let unavailable = false;

function connect() {
  if (unavailable || typeof Worker === 'undefined') return null;
  if (connection) return connection;
  try {
    const worker = new Worker(new URL('../workers/fontWorker.js', import.meta.url), { type: 'module' });
    // Comlink has no notion of a worker that never started: its calls would simply never settle.
    // A load error rejects this instead, and every call races it.
    const failed = new Promise((_, reject) => {
      worker.addEventListener('error', (event) => {
        unavailable = true;
        connection = null;
        reject(new Error(event?.message || 'the font worker could not start'));
      }, { once: true });
    });
    failed.catch(() => {});
    connection = { api: Comlink.wrap(worker), failed };
    return connection;
  } catch (error) {
    unavailable = true;
    console.warn('[fontWorker] not available, working on the page instead', error);
    return null;
  }
}

async function call(method, args, fallback) {
  const worker = connect();
  if (!worker) return fallback();
  try {
    return await Promise.race([worker.api[method](...args), worker.failed]);
  } catch (error) {
    console.warn(`[fontWorker] ${method} failed in the worker, doing it on the page`, error);
    return fallback();
  }
}

/** A glyph atlas built in the worker from the face's bytes, or on the page (fontWorker.buildAtlas). */
export function buildAtlasInWorker(sfnt, meta, weight) {
  return call('buildAtlas', [sfnt, meta, weight], async () => {
    const { fontWorkerApi } = await import('../workers/fontWorker.js');
    return fontWorkerApi.buildAtlas(sfnt, meta, weight);
  });
}

/** A carried face subset in the worker, or on the page (utils/fontSubset.js). */
export function subsetFontInWorker(dataUrl, codePoints) {
  return call('subset', [dataUrl, codePoints], async () => {
    const { subsetFontDataUrl } = await import('./fontSubset.js');
    return subsetFontDataUrl(dataUrl, codePoints);
  });
}

/** Where the next call will run: 'worker', 'page' (no worker here, or it failed), or 'not started'. */
export function fontWorkerStatus() {
  if (unavailable || typeof Worker === 'undefined') return 'page';
  return connection ? 'worker' : 'not started';
}
