// runAll.mjs — the browser checks `npm run test:browser` runs (after building dist-scenery), each in a
// process of its own, every one of them whatever the others did, then a summary.
//
// It used to be one `&&` chain in package.json, which stopped at the first failure: a red run named
// one check and said nothing about the rest, and the chain's first broken link (playerIcons, for a
// day) hid every check after it. CI runs this, so a failure there names all of them.
//
// Run:  node browser-checks/runAll.mjs [name ...]   (names, without .mjs, run just those)
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CHECKS = [
  'run', 'textPlacement', 'playerInbound', 'playerHostKeys', 'playerIcons', 'learnChips', 'effectsTab', 'assetsTab',
  'screenTab', 'apiTab', 'libraryTab', 'sourceLink', 'fromSelection', 'animationTab', 'panelMotion',
  'designerTab', 'dockOpeners', 'propertyFilter', 'panelStrip', 'insertFlyout', 'panelShot',
  'releaseWorkflow', 'numberCellSelection', 'displayGapReview', 'ctrl49Screen', 'noteModules',
  'hostWorkspace', 'performanceTools', 'soundsPage', 'stageScreen', 'pluginPresets', 'songsPage',
  'templateLabels', 'macroSetKnob', 'setSwatches', 'anatomyForms', 'panelFile', 'valuesSidebar',
  'valueCompletion', 'componentBehavior',
];

// componentBehavior.mjs is the component acceptance harness, and only one of its cases runs here: a
// script's write to a source reaches its bound parameter once, and a drag is not sent twice
// (half a minute). The whole file takes sixteen, and on 2026-10-26 twenty-one of its ninety-five
// cases failed, every one of them already failing before that case was added (the Meter's geometry
// and readouts, the Slider's and Knob's readouts and drags, and others), so the rest is still run
// by hand. Its screenshots and results go to a temporary folder rather than work/.
const CASES = {
  componentBehavior: 'A script write to a source reaches its bound parameter',
};

// A check that hangs (a browser that never answers) fails rather than holding the run forever.
const PER_CHECK_MS = 15 * 60 * 1000;

const only = process.argv.slice(2);
const chosen = only.length ? CHECKS.filter((name) => only.includes(name)) : CHECKS;
const failed = [];
const started = Date.now();

for (const name of chosen) {
  const t0 = Date.now();
  const env = CASES[name] ? {
    ...process.env,
    CEDITOR_BEHAVIOR_CASE: CASES[name],
    CEDITOR_BEHAVIOR_OUT: path.join(os.tmpdir(), 'ceditor-component-behavior'),
  } : process.env;
  const run = spawnSync(process.execPath, [path.join(HERE, `${name}.mjs`)], {
    cwd: path.resolve(HERE, '..'), env, encoding: 'utf8', timeout: PER_CHECK_MS, maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd();
  const lastLine = output.split('\n').filter(Boolean).pop() ?? '';
  if (run.status === 0) {
    console.log(`ok    ${name} (${seconds} s) ${lastLine.slice(0, 160)}`);
  } else {
    const why = run.error ? run.error.message : `exit ${run.status ?? run.signal}`;
    console.log(`FAIL  ${name} (${seconds} s, ${why})`);
    // The end of its output, where a check says what it found; the whole of it would bury the rest.
    console.log(output.split('\n').slice(-40).map((line) => `      ${line}`).join('\n'));
    failed.push(name);
  }
}

const minutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(failed.length
  ? `\n${failed.length} of ${chosen.length} browser checks failed (${minutes} min): ${failed.join(', ')}`
  : `\nAll ${chosen.length} browser checks passed (${minutes} min).`);
process.exit(failed.length ? 1 : 0);
