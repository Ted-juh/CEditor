// test-everything.mjs — `npm run test:everything`: the three test runs CI makes of the web side, one
// after the other, in a single command.
//
//   test:all                 the node suite and the script-export validation (CI's web-tests job)
//   test:browser             the browser checks over the built bundle (CI's browser-checks job)
//   test:component-behavior  each control edited, played, saved and reopened (CI's longest job)
//
// Each runs whatever the one before it did, so a red run names every part that failed rather than the
// first; then a summary. The exit code is 1 when any part failed. Name parts to run only those:
// `npm run test:everything -- browser component-behavior`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = ['all', 'browser', 'component-behavior'];

const asked = process.argv.slice(2).map((name) => name.replace(/^test:/, ''));
const unknown = asked.filter((name) => !PARTS.includes(name));
if (unknown.length) {
  console.error(`Unknown part: ${unknown.join(', ')}. The parts are: ${PARTS.join(', ')}.`);
  process.exit(2);
}
const chosen = asked.length ? PARTS.filter((name) => asked.includes(name)) : PARTS;

const results = [];
for (const name of chosen) {
  console.log(`\n=== npm run test:${name} ===\n`);
  const t0 = Date.now();
  // shell: npm is npm.cmd on Windows, which spawn cannot start without one.
  const run = spawnSync('npm', ['run', `test:${name}`], { cwd: WEB, stdio: 'inherit', shell: true });
  results.push({ name, ok: run.status === 0, minutes: ((Date.now() - t0) / 60000).toFixed(1) });
}

console.log('\n=== Summary ===');
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  test:${r.name} (${r.minutes} min)`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} failed: scroll up to its "=== npm run test:${failed[0].name} ===" for what.`
  : `\nAll ${results.length} passed.`);
process.exit(failed.length ? 1 : 0);
