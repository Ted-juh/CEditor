// nativeHandlerModuleCommand.test.js — the command that builds a panel's C++ handler module.
//
// The exporter and the C++ verifiers share it (tools/scripts/nativeHandlers/cpp/moduleCommand.mjs).
// Before they did, the verifiers passed while every export with a C++ handler failed on Linux:
// `-shared -static` asks the linker to put the static C library in a shared object.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cppModuleCommand } from '../../../tools/scripts/nativeHandlers/cpp/moduleCommand.mjs';

const build = (platform, extra = {}) => cppModuleCommand({ cxx: 'cc', glue: 'g.cpp', out: 'm.so', includeDirs: ['abi', 'rt'], platform, ...extra });

test('Linux builds position-independent code with the C++ runtime linked in, never -static', () => {
  const command = build('linux');
  assert.match(command, / -shared -fPIC -static-libstdc\+\+ -static-libgcc /);
  assert.doesNotMatch(command, / -static /);
});

test('the bundled MinGW clang links its runtime into the DLL, on whatever host it runs', () => {
  for (const platform of ['win32', 'linux']) assert.match(build(platform, { targetsWindows: true }), / -shared -static -O2 /);
});

test('clang targeting MSVC gets neither -fPIC, which it refuses, nor -static', () => {
  const command = build('win32');
  assert.doesNotMatch(command, /-fPIC|-static/);
});

test('macOS builds position-independent code against the system libc++', () => {
  assert.match(build('darwin'), / -shared -fPIC -O2 /);
});

test('every platform keeps the flags the preview depends on, and quotes its paths', () => {
  for (const platform of ['linux', 'win32', 'darwin']) {
    const command = build(platform);
    assert.match(command, /-std=c\+\+20 .*-ffp-contract=off -fvisibility=hidden -I "abi" -I "rt" "g\.cpp" -o "m\.so"$/);
    assert.ok(command.startsWith('"cc" '));
  }
});
