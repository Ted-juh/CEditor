// vendoredJuceHelpers.test.js — the vendored JUCE binaries must stay committable.
//
// CI was red at CMake configure for days with an error that read like a
// corrupt JUCE install: "the imported target juce::juce_lv2_helper references
// the file ... but this file does not exist". Nothing was corrupt. .gitignore
// carried a blanket `*.exe`, JUCE/bin/JUCE-8.0.7 was therefore never committed
// while JUCE/include and JUCE/lib were, and find_package(JUCE) failed on the
// half-install. ci.yml's own header comment claimed the opposite — "vendored
// JUCE 8.0.7 install incl. juceaide" — so the file that ran the build
// described a repository state that did not exist.
//
// This test guards the ignore rule rather than the binaries themselves: it has
// to pass both before and after someone commits them, or it would block the
// very fix it exists to enable. What it refuses is a .gitignore that would
// silently drop them again.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const HELPERS = [
  'JUCE/bin/JUCE-8.0.7/juceaide.exe',
  'JUCE/bin/JUCE-8.0.7/juce_lv2_helper.exe',
  'JUCE/bin/JUCE-8.0.7/juce_vst3_helper.exe',
];

/** git check-ignore exits 0 when the path IS ignored, 1 when it is not. */
function isIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

test('the vendored JUCE helpers are not excluded by .gitignore', () => {
  for (const helper of HELPERS) {
    assert.equal(isIgnored(helper), false,
      `${helper} is ignored, so it cannot be committed. find_package(JUCE) hard-fails without `
      + 'it and CI cannot configure. Keep the "!JUCE/bin/**" exception in .gitignore.');
  }
});

test('the blanket *.exe rule still applies everywhere else', () => {
  // The exception must be a scalpel. Dropping `*.exe` altogether would start
  // tracking every build artifact in the tree.
  assert.equal(isIgnored('CE/build/CEditor.exe'), true,
    '*.exe is no longer ignored outside JUCE/bin — build artifacts will start showing up in '
    + 'git status and, eventually, in commits');
});

test('CMakeLists checks for the helpers before find_package(JUCE)', () => {
  // The preflight is what turns a confusing generated-import-file error into a
  // sentence naming the missing files. If find_package moves above it, the
  // confusing error comes back.
  const cmake = readFileSync(join(repoRoot, 'CMakeLists.txt'), 'utf8');
  const preflight = cmake.indexOf('JUCE_REQUIRED_HELPERS');
  const findPackage = cmake.indexOf('find_package(JUCE');
  assert.notEqual(preflight, -1, 'the vendored-helper preflight is gone from CMakeLists.txt');
  assert.ok(preflight < findPackage,
    'find_package(JUCE) now runs before the helper check, so a missing helper fails inside '
    + "JUCE's generated import file again instead of with a message that says what to do");
});
