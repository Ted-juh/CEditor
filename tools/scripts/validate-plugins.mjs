// validate-plugins.mjs — run the hosts' own conformance suites against exported plug-ins.
//
//   node tools/scripts/validate-plugins.mjs [plugin ...] [--strictness 5] [--skip-gui] [--require]
//                                           [--report <file.json>] [--timeout-ms 120000]
//
// With no paths it validates everything in export-out/: each .vst3 and .lv2 with pluginval
// (Tracktion, GPLv3 — run as a separate program, never linked) and each .clap with clap-validator
// (free-audio, MIT). Exit code 0 means every plug-in that was checked passed; 1 means one failed;
// 2 means nothing could be checked at all.
//
// WHY THIS EXISTS. Until this script, nothing checked an exported plug-in. exportValidation.mjs
// checks that the panel's scripts can be built; that says nothing about whether a DAW can load the
// result, save and restore its state, survive a sample-rate change, or call processBlock from a
// thread the plug-in did not expect. Those are the things hosts do and pluginval does, and they are
// the bugs a user finds after the export has already been shipped to somebody else.
// docs/design/open-source-landscape.md item 9 recommended it; docs/plugin-validation.md is the page
// for people.
//
// FINDING THE VALIDATORS. Neither is vendored: pluginval is GPLv3 and the release binaries are
// tens of MB. In order: $PLUGINVAL / $CLAP_VALIDATOR, then tools/validators/<name>[.exe] (ignored
// by git, where docs/plugin-validation.md says to put them), then PATH. A validator that cannot be
// found is reported as not run — never as a pass — and --require turns that into a failure, which
// is what a CI step should use.
//
// GUI TESTS. pluginval opens the editor, which for a CEditor plug-in is a WebView. On a machine
// with no display that cannot work, so the GUI tests are skipped automatically when there is no
// $DISPLAY off Windows and macOS, and always with --skip-gui.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Which validator checks a plug-in, by its extension. null for anything neither can load. */
export function validatorFor(pluginPath) {
  const ext = path.extname(String(pluginPath)).toLowerCase();
  if (ext === '.vst3' || ext === '.lv2') return 'pluginval';
  if (ext === '.clap') return 'clap-validator';
  return null;
}

export function parseArgs(argv) {
  const options = { paths: [], strictness: 5, skipGui: null, require: false, report: null, timeoutMs: 120000, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--strictness') options.strictness = Number(value());
    else if (arg === '--skip-gui') options.skipGui = true;
    else if (arg === '--with-gui') options.skipGui = false;
    else if (arg === '--require') options.require = true;
    else if (arg === '--report') options.report = value();
    else if (arg === '--timeout-ms') options.timeoutMs = Number(value());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.paths.push(arg);
  }
  if (!Number.isInteger(options.strictness) || options.strictness < 1 || options.strictness > 10) {
    throw new Error('--strictness must be a whole number from 1 to 10');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  return options;
}

/** The plug-ins an export folder holds: bundles and .clap files, one level deep. */
export function findPlugins(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && validatorFor(name))
    .map((name) => path.join(dir, name))
    .sort();
}

function onPath(name, env) {
  const dirs = String(env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
  for (const dir of dirs) for (const candidate of names) {
    const full = path.join(dir, candidate);
    try { if (statSync(full).isFile()) return full; } catch { /* next */ }
  }
  return null;
}

/** Where a validator is, or null: the environment variable, then tools/validators/, then PATH. */
export function locateValidator(name, { env = process.env, repo = REPO } = {}) {
  const variable = name === 'pluginval' ? 'PLUGINVAL' : 'CLAP_VALIDATOR';
  if (env[variable]) return existsSync(env[variable]) ? env[variable] : null;
  for (const candidate of [name, `${name}.exe`]) {
    const local = path.join(repo, 'tools', 'validators', candidate);
    if (existsSync(local)) return local;
  }
  return onPath(name, env);
}

export function shouldSkipGui(explicit, { platform = process.platform, env = process.env } = {}) {
  if (explicit !== null && explicit !== undefined) return explicit;
  if (platform === 'win32' || platform === 'darwin') return false;
  return !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

export function pluginvalArgs(pluginPath, { strictness, skipGui, timeoutMs, outputDir }) {
  return [
    '--strictness-level', String(strictness),
    '--timeout-ms', String(timeoutMs),
    ...(skipGui ? ['--skip-gui-tests'] : []),
    ...(outputDir ? ['--output-dir', outputDir] : []),
    '--validate', pluginPath,
  ];
}

export function clapValidatorArgs(pluginPath) {
  return ['validate', '--json', '--hide-output', pluginPath];
}

/**
 * clap-validator's --json report, reduced to what a person needs: how many tests ran and the ones
 * that failed, with their reasons. The report (0.4) is `{ results: [{ test: { <kind>: { test } },
 * status: { code, details } }] }`, kind being plugin-library or plugin-instance. "skipped" is the
 * validator's own verdict for an extension the plug-in does not implement, not a failure; "warning"
 * is reported but passes. Returns null when the text is not a report (the validator died first).
 */
export function summariseClapReport(text) {
  const start = String(text ?? '').indexOf('{');
  if (start < 0) return null;
  let report;
  try { report = JSON.parse(String(text).slice(start)); } catch { return null; }
  if (!Array.isArray(report?.results)) return null;
  const named = report.results.map((result) => {
    const inner = Object.values(result?.test ?? {})[0] ?? {};
    return {
      name: String(inner.test ?? 'unknown test'),
      code: String(result?.status?.code ?? '').toLowerCase(),
      details: result?.status?.details ?? '',
    };
  });
  const count = (code) => named.filter((test) => test.code === code).length;
  return {
    total: named.length,
    passed: count('success'),
    skipped: count('skipped'),
    warnings: named.filter((test) => test.code === 'warning').map(({ name, details }) => ({ name, details })),
    failed: named.filter((test) => test.code === 'failed' || test.code === 'crashed')
      .map(({ name, code, details }) => ({ name, status: code, details })),
  };
}

function run(tool, args, timeoutMs) {
  // The validator's own timeout covers a silent test; this one covers a validator that hangs
  // outright (a plug-in deadlocking in its destructor, say), with room for the whole suite.
  const result = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs * 20 });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Validate one plug-in. Returns { plugin, validator, outcome: 'passed'|'failed'|'not-run', ... }. */
export function validatePlugin(pluginPath, options, tools) {
  const validator = validatorFor(pluginPath);
  const base = { plugin: pluginPath, validator };
  if (!validator) return { ...base, outcome: 'not-run', reason: 'not a plug-in format either validator checks' };
  const tool = tools[validator];
  if (!tool) return { ...base, outcome: 'not-run', reason: `${validator} not found (see docs/plugin-validation.md)` };

  if (validator === 'pluginval') {
    const outputDir = options.logDir ? path.join(options.logDir, path.basename(pluginPath)) : null;
    if (outputDir) mkdirSync(outputDir, { recursive: true });
    const result = run(tool, pluginvalArgs(pluginPath, { ...options, outputDir }), options.timeoutMs);
    const log = `${result.stdout}${result.stderr}`;
    const failures = log.split(/\r?\n/).filter((line) => /!!! (Test \d+ failed|FAILED)|\*\*\* FAILED/.test(line));
    const outcome = result.status === 0 ? 'passed' : 'failed';
    return {
      ...base,
      outcome,
      exitCode: result.status,
      ...(result.signal ? { signal: result.signal } : {}),
      ...(result.error ? { reason: result.error } : {}),
      failures,
      logTail: outcome === 'failed' ? log.split(/\r?\n/).slice(-60).join('\n') : undefined,
    };
  }

  const result = run(tool, clapValidatorArgs(pluginPath), options.timeoutMs);
  const summary = summariseClapReport(result.stdout);
  // clap-validator exits non-zero when a test fails; a report with failures is a failure whatever the
  // exit code says, and no report at all is a failure too (the validator could not load the file).
  const outcome = summary && summary.total > 0 && !summary.failed.length && result.status === 0 ? 'passed' : 'failed';
  return {
    ...base,
    outcome,
    exitCode: result.status,
    ...(result.error ? { reason: result.error } : {}),
    summary,
    logTail: outcome === 'failed' ? `${result.stdout}${result.stderr}`.split(/\r?\n/).slice(-60).join('\n') : undefined,
  };
}

/** Exit code for a set of results: 1 on any failure, 2 when nothing ran (or a required one did not). */
export function exitCodeFor(results, { require = false } = {}) {
  if (results.some((result) => result.outcome === 'failed')) return 1;
  const ran = results.filter((result) => result.outcome === 'passed');
  if (!ran.length) return 2;
  if (require && results.some((result) => result.outcome === 'not-run')) return 2;
  return 0;
}

export function validatePlugins(paths, options = {}) {
  const tools = options.tools ?? {
    pluginval: locateValidator('pluginval'),
    'clap-validator': locateValidator('clap-validator'),
  };
  const resolved = { strictness: 5, timeoutMs: 120000, ...options, skipGui: shouldSkipGui(options.skipGui ?? null) };
  return paths.map((pluginPath) => validatePlugin(pluginPath, resolved, tools));
}

function describe(result) {
  const name = path.basename(result.plugin);
  if (result.outcome === 'not-run') return `  -  ${name}: not run (${result.reason})`;
  if (result.outcome === 'passed') {
    const summary = result.summary;
    const extra = summary ? ` — ${summary.passed} passed, ${summary.skipped} not applicable, ${summary.warnings.length} warning(s)` : '';
    const lines = [`  ✓  ${name}: ${result.validator} passed${extra}`];
    for (const warning of summary?.warnings ?? []) lines.push(`       warning ${warning.name}: ${String(warning.details).replace(/\s+/g, ' ')}`);
    return lines.join('\n');
  }
  const lines = [`  ✗  ${name}: ${result.validator} FAILED (exit ${result.exitCode ?? result.signal ?? '?'})`];
  for (const failure of result.summary?.failed ?? []) lines.push(`       ${failure.name}: ${failure.status} — ${failure.details}`);
  for (const failure of result.failures ?? []) lines.push(`       ${failure.trim()}`);
  if (result.reason) lines.push(`       ${result.reason}`);
  return lines.join('\n');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (options.help) {
    console.log(readUsage());
    return;
  }
  const paths = options.paths.length ? options.paths.map((p) => path.resolve(p)) : findPlugins(path.join(REPO, 'export-out'));
  if (!paths.length) {
    console.error('No plug-ins to validate: pass paths, or export a panel into export-out/ first.');
    process.exit(2);
  }
  const logDir = options.report ? path.join(path.dirname(path.resolve(options.report)), 'pluginval-logs') : null;
  const skipGui = shouldSkipGui(options.skipGui);
  console.log(`Validating ${paths.length} plug-in(s) at strictness ${options.strictness}${skipGui ? ', GUI tests skipped' : ''}`);
  const results = validatePlugins(paths, { ...options, skipGui, logDir });
  for (const result of results) console.log(describe(result));
  if (options.report) {
    writeFileSync(options.report, JSON.stringify({ strictness: options.strictness, skipGui, results }, null, 2));
    console.log(`Report: ${options.report}`);
  }
  const code = exitCodeFor(results, options);
  if (code === 2) console.error('Nothing was validated — a missing validator is not a pass.');
  process.exit(code);
}

function readUsage() {
  return [
    'Usage: node tools/scripts/validate-plugins.mjs [plugin ...] [options]',
    '',
    '  With no plug-ins, validates every .vst3, .clap and .lv2 in export-out/.',
    '',
    '  --strictness <1-10>   pluginval strictness (default 5, the level hosts are tested at)',
    '  --skip-gui            skip tests that open the editor (automatic with no display)',
    '  --with-gui            run them even with no display detected',
    '  --timeout-ms <n>      pluginval per-test silence timeout (default 120000)',
    '  --report <file>       write a JSON report; pluginval logs go beside it',
    '  --require             a validator that is missing fails the run (use in CI)',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
