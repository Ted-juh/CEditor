import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGE_SAFE_COMMANDS } from '../src/CE_Application/utils/stageLock.js';

// The host decides what Stage Lock allows; the browser preview keeps a copy so the demo behaves
// like the app. The copy had drifted by ten commands. This reads the host's own list.
const source = readFileSync(new URL('../../src/InstrumentHost/InstrumentHostService.cpp', import.meta.url), 'utf8');
const block = source.match(/bool isStageSafeCommand[\s\S]*?safeCommands \{([\s\S]*?)\};/)?.[1] ?? '';
const native = new Set([...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]));
// Read-only requests the browser makes that never reach the lock on the native side.
const BROWSER_ONLY = new Set(['getState']);

test('the host list was found', () => {
  assert.ok(native.size > 60, `read ${native.size} commands from isStageSafeCommand`);
});

test('every command the host allows on stage, the preview allows too', () => {
  assert.deepEqual([...native].filter((cmd) => !STAGE_SAFE_COMMANDS.has(cmd)).sort(), []);
});

test('and the preview allows nothing the host would refuse', () => {
  assert.deepEqual([...STAGE_SAFE_COMMANDS].filter((cmd) => !native.has(cmd) && !BROWSER_ONLY.has(cmd)).sort(), []);
});
