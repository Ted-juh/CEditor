// validatePlugins.test.js — tools/scripts/validate-plugins.mjs, without the real validators.
//
// The validators themselves are external programs (docs/plugin-validation.md); what is tested here
// is everything around them: which one checks what, finding them, reading clap-validator's report,
// and — the part that matters most — that a validator which is missing or dies is never a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  clapValidatorArgs, exitCodeFor, findPlugins, locateValidator, parseArgs, pluginvalArgs,
  shouldSkipGui, summariseClapReport, validatePlugin, validatorFor,
} from '../../../tools/scripts/validate-plugins.mjs';

const scratch = () => mkdtempSync(path.join(tmpdir(), 'validate-plugins-'));
const isWindows = process.platform === 'win32';

test('each format goes to the validator that understands it', () => {
  assert.equal(validatorFor('A.vst3'), 'pluginval');
  assert.equal(validatorFor('/x/B.LV2'), 'pluginval');
  assert.equal(validatorFor('C.clap'), 'clap-validator');
  assert.equal(validatorFor('D.cepanel'), null);
});

test('arguments', () => {
  assert.deepEqual(parseArgs([]).paths, []);
  const options = parseArgs(['a.vst3', '--strictness', '7', '--skip-gui', '--require', '--report', 'r.json']);
  assert.deepEqual(options.paths, ['a.vst3']);
  assert.equal(options.strictness, 7);
  assert.equal(options.skipGui, true);
  assert.equal(options.require, true);
  assert.equal(options.report, 'r.json');
  assert.throws(() => parseArgs(['--strictness', '11']), /1 to 10/);
  assert.throws(() => parseArgs(['--strictness']), /needs a value/);
  assert.throws(() => parseArgs(['--frobnicate']), /Unknown option/);
});

test('an export folder is searched one level deep, hidden staging folders skipped', () => {
  const dir = scratch();
  for (const name of ['B.vst3', 'A.clap', 'C.lv2', '.export-123', 'D.cepanel']) mkdirSync(path.join(dir, name));
  assert.deepEqual(findPlugins(dir).map((p) => path.basename(p)), ['A.clap', 'B.vst3', 'C.lv2']);
  assert.deepEqual(findPlugins(path.join(dir, 'missing')), []);
});

test('validators are found by variable, then tools/validators, then PATH — and a wrong variable is not silently ignored', () => {
  const repo = scratch();
  const bin = scratch();
  const exe = isWindows ? 'clap-validator.exe' : 'clap-validator';
  writeFileSync(path.join(bin, exe), '');
  assert.equal(locateValidator('clap-validator', { env: { PATH: bin }, repo }), path.join(bin, exe));

  mkdirSync(path.join(repo, 'tools', 'validators'), { recursive: true });
  writeFileSync(path.join(repo, 'tools', 'validators', 'clap-validator'), '');
  assert.equal(locateValidator('clap-validator', { env: { PATH: bin }, repo }), path.join(repo, 'tools', 'validators', 'clap-validator'));

  const explicit = path.join(bin, exe);
  assert.equal(locateValidator('clap-validator', { env: { CLAP_VALIDATOR: explicit, PATH: '' }, repo }), explicit);
  assert.equal(locateValidator('clap-validator', { env: { CLAP_VALIDATOR: '/nope', PATH: bin }, repo }), null,
    'a variable naming a missing file is an error to report, not a hint to go looking elsewhere');
  assert.equal(locateValidator('pluginval', { env: { PATH: '' }, repo: scratch() }), null);
});

test('GUI tests are skipped only where there is no display', () => {
  assert.equal(shouldSkipGui(null, { platform: 'win32', env: {} }), false);
  assert.equal(shouldSkipGui(null, { platform: 'linux', env: {} }), true);
  assert.equal(shouldSkipGui(null, { platform: 'linux', env: { DISPLAY: ':0' } }), false);
  assert.equal(shouldSkipGui(false, { platform: 'linux', env: {} }), false, 'an explicit choice wins');
});

test('command lines', () => {
  assert.deepEqual(pluginvalArgs('/p/A.vst3', { strictness: 5, skipGui: true, timeoutMs: 1000, outputDir: null }),
    ['--strictness-level', '5', '--timeout-ms', '1000', '--skip-gui-tests', '--validate', '/p/A.vst3']);
  assert.deepEqual(clapValidatorArgs('/p/A.clap'), ['validate', '--json', '--hide-output', '/p/A.clap']);
});

// Trimmed from a real clap-validator 0.4.1 run over an export.
const REPORT = JSON.stringify({
  results: [
    { test: { 'plugin-library': { test: 'scan-time', path: 'x' } }, status: { code: 'success', details: null } },
    { test: { 'plugin-instance': { test: 'features-categories', path: 'x', plugin_id: 'id' } },
      status: { code: 'failed', details: 'The plugin needs to have at least one of the following plugin category features' } },
    { test: { 'plugin-instance': { test: 'note-ports-config', path: 'x', plugin_id: 'id' } }, status: { code: 'skipped', details: 'n/a' } },
    { test: { 'plugin-instance': { test: 'process-audio-denormals', path: 'x', plugin_id: 'id' } }, status: { code: 'warning', details: 'slow' } },
  ],
});

test("clap-validator's report is read into passed, not applicable, warnings and failures", () => {
  const summary = summariseClapReport(`some log noise\n${REPORT}`);
  assert.equal(summary.total, 4);
  assert.equal(summary.passed, 1);
  assert.equal(summary.skipped, 1);
  assert.deepEqual(summary.warnings.map((w) => w.name), ['process-audio-denormals']);
  assert.deepEqual(summary.failed.map((f) => f.name), ['features-categories']);
  assert.equal(summariseClapReport('panicked at src/cli.rs'), null);
  assert.equal(summariseClapReport('{"not":"a report"}'), null);
});

function fakeTool(dir, name, script) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

test('a plug-in passes only on a clean exit AND, for CLAP, a report with no failures', { skip: isWindows && 'uses sh scripts' }, () => {
  const dir = scratch();
  const options = { strictness: 5, skipGui: true, timeoutMs: 5000 };
  const passing = fakeTool(dir, 'pv-pass', 'echo "ALL TESTS PASSED"; exit 0');
  const failing = fakeTool(dir, 'pv-fail', 'echo "!!! Test 1 failed: state"; exit 1');
  const crashed = fakeTool(dir, 'pv-crash', 'kill -SEGV $$');
  assert.equal(validatePlugin('/a/A.vst3', options, { pluginval: passing }).outcome, 'passed');

  const failed = validatePlugin('/a/A.vst3', options, { pluginval: failing });
  assert.equal(failed.outcome, 'failed');
  assert.deepEqual(failed.failures, ['!!! Test 1 failed: state']);
  assert.equal(validatePlugin('/a/A.lv2', options, { pluginval: crashed }).outcome, 'failed', 'a crash is a failure');

  const reportFile = path.join(dir, 'report.json');
  writeFileSync(reportFile, REPORT);
  const clapWithFailure = fakeTool(dir, 'cv-fail', `cat "${reportFile}"; exit 0`);
  assert.equal(validatePlugin('/a/A.clap', options, { 'clap-validator': clapWithFailure }).outcome, 'failed',
    'a failed test in the report fails the plug-in whatever the exit code says');
  const clapPanic = fakeTool(dir, 'cv-panic', 'echo "thread panicked"; exit 101');
  assert.equal(validatePlugin('/a/A.clap', options, { 'clap-validator': clapPanic }).outcome, 'failed');
});

test('a missing validator is "not run", and never makes a run green', () => {
  const result = validatePlugin('/a/A.vst3', { strictness: 5 }, { pluginval: null });
  assert.equal(result.outcome, 'not-run');
  assert.equal(exitCodeFor([result]), 2, 'nothing validated');
  const passed = { outcome: 'passed' };
  assert.equal(exitCodeFor([passed, result]), 0);
  assert.equal(exitCodeFor([passed, result], { require: true }), 2, '--require makes a gap a failure');
  assert.equal(exitCodeFor([passed, { outcome: 'failed' }]), 1);
});
