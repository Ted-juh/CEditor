// updateCheck.test.js — "is there a newer CEditor than this one?"
//
// There has never been an update check, so the release notes have had to say "watch the
// repository", which nobody does. The feature is one HTTP GET and a version comparison; the GET
// needs Windows and a network, and this is everything else.
//
// TWO FAILURES, and they are not symmetric. A build that quietly believes it is up to date is
// silent and defeats the whole feature, so anything unreadable becomes a visible error rather than
// "no update". A build that nags about a release older than itself is loud and teaches people to
// ignore the notice, which costs the real one later.
//
// THE THIRD THING pinned here is consent. A check tells GitHub this machine's IP address. That is
// unremarkable and it is still not something a program should do on its own the first time somebody
// starts it, so the setting defaults to off — with `=== true` rather than the `!== false` idiom
// every other flag in that file uses, which is exactly the sort of line that gets "tidied" into
// opting everyone in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  compareVersions,
  isNewerVersion,
  parseVersion,
  readLatestRelease,
  updateCheckIsAllowed,
  updateCheckSummary,
} from '../src/CE_Application/utils/updateCheck.js';
import { DEFAULT_GENERAL_SETTINGS } from '../src/CE_Application/stores/runtimePreferences.js';
import { normalizeGeneralSettings } from '../src/CE_Application/stores/appSettingsSchema.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CPP = readFileSync(join(REPO, 'CE/src/UpdateCheck.h'), 'utf8');
const HANDLERS = readFileSync(join(REPO, 'CE/src/ValueTreeBridgeHandlers.cpp'), 'utf8');
const STORE = readFileSync(join(REPO, 'CE/web/src/CE_Application/stores/updateChannel.js'), 'utf8');

test('a version parses in the shapes a tag actually arrives in', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion('v0.2.0'), { major: 0, minor: 2, patch: 0 });
  assert.deepEqual(parseVersion('1.2'), { major: 1, minor: 2, patch: 0 });
  // Dropped rather than ordered — this project has never tagged a pre-release, and inventing a
  // comparison for a case that does not exist is how the first real one gets the wrong answer.
  assert.deepEqual(parseVersion('1.2.3-beta.1'), { major: 1, minor: 2, patch: 3 });
  for (const junk of ['', '   ', 'latest', 'v', '1.x.3', 'one.two', null]) {
    assert.equal(parseVersion(junk), null, String(junk));
  }
});

test('0.10 is newer than 0.2 — not string order', () => {
  assert.equal(compareVersions('0.10.0', '0.2.0'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
});

test('an unreadable version never nags', () => {
  assert.equal(isNewerVersion('nonsense', '0.2.0'), false);
  assert.equal(isNewerVersion('9.9.9', 'nonsense'), false);
  assert.equal(isNewerVersion('0.1.0', '0.2.0'), false);
  assert.equal(isNewerVersion('0.3.0', '0.2.0'), true);
});

test('a normal release is understood', () => {
  const result = readLatestRelease({
    tag_name: 'v0.3.0',
    html_url: 'https://example.com/r',
    published_at: '2026-09-01T10:00:00Z',
  }, '0.2.0');
  assert.equal(result.ok, true);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, '0.3.0', 'the tag\'s v is stripped');
  assert.equal(result.releaseUrl, 'https://example.com/r');
});

test('"understood" and "there is an update" are different answers', () => {
  // Conflating them makes "you are up to date" and "the check failed" the same outcome, which is
  // the silent failure this whole feature exists to prevent.
  const same = readLatestRelease({ tag_name: 'v0.2.0' }, '0.2.0');
  assert.equal(same.ok, true);
  assert.equal(same.updateAvailable, false);
});

test('anything unreadable is an error the user can see, never "up to date"', () => {
  for (const reply of [null, undefined, 'a string', [], {}, { tag_name: '' }, { tag_name: 'latest' }, { name: 'The Big One' }]) {
    const result = readLatestRelease(reply, '0.2.0');
    assert.equal(result.ok, false, JSON.stringify(reply));
    assert.equal(result.updateAvailable, false, JSON.stringify(reply));
    assert.ok(result.error.length > 10, `no readable reason for ${JSON.stringify(reply)}`);
  }
});

test('drafts and pre-releases are refused', () => {
  // The endpoint is documented not to return them. That is GitHub's promise rather than ours, and
  // shipping a draft's version number to every user would be a bad way to find out it changed.
  for (const flag of ['draft', 'prerelease']) {
    const result = readLatestRelease({ tag_name: 'v9.9.9', [flag]: true }, '0.2.0');
    assert.equal(result.ok, false, flag);
    assert.equal(result.updateAvailable, false, flag);
  }
});

test('a version in the name is a fallback, not a second chance to be wrong', () => {
  assert.equal(readLatestRelease({ tag_name: 'release', name: '0.4.0' }, '0.2.0').latestVersion, '0.4.0');
  assert.equal(readLatestRelease({ tag_name: 'release', name: 'The Big One' }, '0.2.0').ok, false);
});

// --- consent -----------------------------------------------------------------------------------

test('the startup check is off unless somebody turned it on', () => {
  assert.equal(DEFAULT_GENERAL_SETTINGS.checkForUpdatesOnStartup, false);
  // The line that matters: `=== true`, not the `!== false` idiom every other flag here uses. An
  // absent setting — which is every existing installation — must read as off.
  assert.equal(normalizeGeneralSettings({}).checkForUpdatesOnStartup, false);
  assert.equal(normalizeGeneralSettings(undefined).checkForUpdatesOnStartup, false);
  assert.equal(normalizeGeneralSettings({ checkForUpdatesOnStartup: true }).checkForUpdatesOnStartup, true);
});

test('asking is consent; not asking with the setting off is not', () => {
  assert.equal(updateCheckIsAllowed(false, false), false);
  assert.equal(updateCheckIsAllowed(false, true), true);
  assert.equal(updateCheckIsAllowed(true, false), true);
});

test('the store makes the caller state whether a person asked', () => {
  // A defaulted argument here is how a startup check quietly becomes unconditional.
  assert.match(STORE, /runUpdateCheck\(\{ userAsked \}\)/);
  assert.match(STORE, /updateCheckIsAllowed\(enabled, userAsked\)/);
  assert.match(STORE, /runStartupUpdateCheck[\s\S]{0,200}userAsked: false/);
});

// --- the two implementations -------------------------------------------------------------------

test('the C++ and JS rules agree about what they refuse', () => {
  // Both sides parse a version, because the C++ side needs it for its own use and the JS side
  // decides the answer. Two copies eventually disagree; these are the clauses that must not.
  for (const clause of ['draft', 'prerelease', 'tag_name', 'html_url', 'published_at']) {
    assert.ok(CPP.includes(`"${clause}"`), `UpdateCheck.h does not read "${clause}"`);
  }
  assert.match(CPP, /Ted-juh\/CEditor\/releases\/latest/);
});

test('the fetch happens off the message thread and cannot outlive the bridge', () => {
  // Eight seconds of blocked socket with the UI frozen behind it would be a worse experience than
  // no update check at all — and a window can be closed inside those eight seconds.
  const handler = HANDLERS.slice(HANDLERS.indexOf('"checkForUpdates"'), HANDLERS.indexOf('"revealFile"'));
  assert.match(handler, /juce::Thread::launch/, 'the GET must not run on the message thread');
  assert.match(handler, /stillAlive->load\(\)/, 'the completion callback must check the bridge is still there');
  assert.match(handler, /User-Agent: CEditor/, 'GitHub rejects requests without a User-Agent');
});

test('every outcome has a sentence, including the ones that are not news', () => {
  assert.match(updateCheckSummary(null, '0.2.0'), /No update check/);
  assert.match(updateCheckSummary({ ok: false, error: 'No network.' }, '0.2.0'), /No network/);
  assert.match(updateCheckSummary({ ok: true, updateAvailable: false }, '0.2.0'), /newest release/);
  assert.match(updateCheckSummary({ ok: true, updateAvailable: true, latestVersion: '0.3.0' }, '0.2.0'), /0\.3\.0 is available/);
});
