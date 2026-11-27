// runAll.mjs — the browser checks `npm run test:browser` runs (after building dist-scenery), each in a
// process of its own, every one of them whatever the others did, then a summary.
//
// It used to be one `&&` chain in package.json, which stopped at the first failure: a red run named
// one check and said nothing about the rest, and the chain's first broken link (playerIcons, for a
// day) hid every check after it. CI runs this, so a failure there names all of them.
//
// They run side by side, on as many workers as parallelSlots.mjs says (CEDITOR_TEST_JOBS=1 for one at
// a time): each check is still a process of its own, on its worker's dev-server port and Vite cache.
// A check's lines are printed when it ends, so two checks' output never interleaves.
//
// Run:  node browser-checks/runAll.mjs [name ...]   (names, without .mjs, run just those)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPool, slotEnv, workerCount } from './parallelSlots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CHECKS = [
  'run', 'textPlacement', 'playerInbound', 'playerHostKeys', 'playerKeys', 'playerIcons', 'learnChips', 'effectsTab', 'assetsTab',
  'screenTab', 'apiTab', 'libraryTab', 'sourceLink', 'fromSelection', 'animationTab', 'animationDesigner', 'scenePlayback', 'shapeClip', 'panelMotion',
  'designerTab', 'profileDesigner', 'dockOpeners', 'propertyFilter', 'panelStrip', 'insertFlyout', 'panelShot',
  'releaseWorkflow', 'numberCellSelection', 'displayGapReview', 'ctrl49Screen', 'noteModules',
  'hostWorkspace', 'performanceTools', 'soundsPage', 'stageScreen', 'pluginPresets', 'songsPage',
  'templateLabels', 'macroSetKnob', 'setSwatches', 'anatomyForms', 'panelFile', 'valuesSidebar',
  'valueCompletion', 'pictureColour', 'vectorArtwork', 'scene3d', 'pictureExport', 'accessCheck', 'showcases', 'choiceGroup', 'knobShowcase', 'sliderShowcase', 'buttonShowcase', 'choiceShowcase',
];

// The checks launch the browser CHROMIUM_PATH names, or else the one this repo's Linux containers
// have, which a Windows machine does not: every check there failed at launch with "executable doesn't
// exist at /opt/pw-browsers/...". CI's Windows job sets CHROMIUM_PATH to Chrome or Edge itself; on a
// Windows machine with neither set, the same two are looked for here, in the same order, so that
// `npm run test:browser` runs as it is.
if (!process.env.CHROMIUM_PATH && process.platform === 'win32') {
  const found = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((candidate) => existsSync(candidate));
  if (found) {
    process.env.CHROMIUM_PATH = found;
    console.log(`Browser: ${found} (set CHROMIUM_PATH to use another)`);
  } else {
    console.log('No Chrome or Edge found where they install; set CHROMIUM_PATH to a Chromium browser.');
  }
}

// A check that hangs (a browser that never answers) fails rather than holding the run forever.
const PER_CHECK_MS = 15 * 60 * 1000;

const only = process.argv.slice(2);
const chosen = only.length ? CHECKS.filter((name) => only.includes(name)) : CHECKS;
const failed = [];
const started = Date.now();
const workers = workerCount();
if (workers > 1) console.log(`${workers} workers (CEDITOR_TEST_JOBS=1 for one at a time)`);

/** One check in a process of its own; resolves with what spawnSync used to return. */
function runCheck(name, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, `${name}.mjs`)], {
      cwd: path.resolve(HERE, '..'), env: { ...process.env, ...env },
    });
    let stdout = '', stderr = '', error = null;
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      error = new Error(`timed out after ${PER_CHECK_MS / 60000} min`);
      child.kill();
    }, PER_CHECK_MS);
    child.on('error', (e) => { error = e; });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status: error ? null : status, signal, error, stdout, stderr });
    });
  });
}

await runPool(chosen, workers, async (name, slot) => {
  const t0 = Date.now();
  const run = await runCheck(name, workers > 1 ? slotEnv(slot, { base: 5300, cacheName: 'checks' }) : {});
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd();
  const lastLine = output.split('\n').filter(Boolean).pop() ?? '';
  if (run.status === 0) {
    console.log(`ok    ${name} (${seconds} s) ${lastLine.slice(0, 160)}`);
  } else {
    const why = run.error ? run.error.message : `exit ${run.status ?? run.signal}`;
    // The end of its output, where a check says what it found; the whole of it would bury the rest.
    console.log(`FAIL  ${name} (${seconds} s, ${why})\n`
      + output.split('\n').slice(-40).map((line) => `      ${line}`).join('\n'));
    failed.push(name);
  }
});

const minutes = ((Date.now() - started) / 60000).toFixed(1);
const inOrder = chosen.filter((name) => failed.includes(name));
console.log(failed.length
  ? `\n${failed.length} of ${chosen.length} browser checks failed (${minutes} min): ${inOrder.join(', ')}`
  : `\nAll ${chosen.length} browser checks passed (${minutes} min).`);
process.exit(failed.length ? 1 : 0);
