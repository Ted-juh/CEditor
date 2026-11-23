// parallelSlots.mjs — how the browser runs go side by side.
//
// The browser checks (runAll.mjs) and the component harness (componentBehavior.mjs) ran one browser
// at a time, and on a machine with cores to spare that was most of their time: the harness's 96
// cases took seventeen minutes in a row. Each now runs on several workers at once, and this is what
// a worker is: a number, a dev-server port and a Vite dependency cache of its own.
//
// The port, because the app's vite.config.js asks for 5173 strictly, and Vite reads a port of 0 as
// "the configured one" rather than "any": two dev servers started at once on the app's config, one
// failed with "Port 5173 is already in use". It also keeps the tests off a dev server already
// running on 5173.
//
// The cache, because every dev server shares node_modules/.vite and rebuilds it when the config or
// the dependencies differ from what it holds: two servers on different configs, started at once,
// would rebuild it under each other. A worker's own cache is warm from its last run.
//
// Both reach Vite through two variables vite.config.js and browser-checks/vite.config.mjs read:
// CEDITOR_DEV_PORT and CEDITOR_VITE_CACHE_DIR. Unset, everything is as it was.
//
// How many workers: CEDITOR_TEST_JOBS, else half the logical processors, at most eight. Each is a
// browser and a dev server, and the checks wait on the page more than they compute, but they also
// time out: half leaves room on a shared runner (2 on CI's four cores). CEDITOR_TEST_JOBS=1 runs
// everything one at a time, as before.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_WORKERS = 8;

export function workerCount() {
  const asked = Number.parseInt(process.env.CEDITOR_TEST_JOBS ?? '', 10);
  if (Number.isInteger(asked) && asked > 0) return asked;
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(MAX_WORKERS, Math.floor(cores / 2)));
}

/**
 * What a worker's processes get in their environment. `base` keeps the two runners on ports of their
 * own (the checks from 5300, the harness from 5400), so running both at once does not collide either.
 */
export function slotEnv(slot, { base, cacheName }) {
  return {
    CEDITOR_DEV_PORT: String(base + slot),
    CEDITOR_VITE_CACHE_DIR: path.join(WEB_ROOT, 'node_modules', `.vite-${cacheName}-${slot}`),
  };
}

/** Run `work(item, slot)` over `items`, `workers` at a time, each slot one worker's. */
export async function runPool(items, workers, work) {
  let next = 0;
  const slots = Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, async (_, slot) => {
    while (next < items.length) await work(items[next++], slot);
  });
  await Promise.all(slots);
}
