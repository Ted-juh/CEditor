// legalNotices.test.js — the two sentences the program has to say about itself.
//
// This exists because of a specific failure: RELEASE-NOTES.md said "the app states this in About
// and on the Export tab" about both the AGPL obligation and the missing code-signing certificate,
// and neither sentence existed anywhere in the program. About was a `window.alert` with a commit
// hash in it. The claim was written before the feature and nothing could catch it.
//
// So the test is not "does the module export strings" — it is "do both surfaces actually read
// them", checked structurally against the components, which is the only thing that would have
// failed before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LICENCE_NOTICE, SIGNING_NOTICE, aboutText } from '../src/CE_Application/utils/legalNotices.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('both notices say what they are, briefly and at length', () => {
  for (const notice of [LICENCE_NOTICE, SIGNING_NOTICE]) {
    assert.ok(notice.title.length > 0);
    assert.ok(notice.short.length > 20, 'the short form has to be a sentence, not a label');
    assert.ok(notice.detail.length > notice.short.length, 'the long form has to add something');
  }
});

test('the licence notice says the obligation follows the exported plugin', () => {
  // The whole point. "CEditor is AGPL" alone would let someone conclude their exported plugin is
  // theirs to close, and JUCE is linked into it.
  assert.match(LICENCE_NOTICE.detail, /export/i);
  assert.match(LICENCE_NOTICE.detail, /source/i);
  assert.match(LICENCE_NOTICE.detail, /JUCE/);
});

test('the signing notice says the warning is expected, not a fault', () => {
  assert.match(SIGNING_NOTICE.detail, /SmartScreen/);
  assert.match(SIGNING_NOTICE.detail, /not a sign anything is wrong/i);
  assert.match(SIGNING_NOTICE.detail, /1\.0/, 'and when it is expected to change');
});

test('About reads both notices out of the module rather than restating them', () => {
  const source = read('CE_Application/layout/AboutOverlay.svelte');
  assert.match(source, /from '\.\.\/utils\/legalNotices\.js'/);
  assert.match(source, /LICENCE_NOTICE/);
  assert.match(source, /SIGNING_NOTICE/);
});

test('the Export tab reads both notices out of the same module', () => {
  // The claim that failed. If someone deletes this section, this test is what says so.
  const source = read('CE_Application/panels/PanelCardContent.svelte');
  assert.match(source, /from '\.\.\/utils\/legalNotices\.js'/);
  assert.match(source, /LICENCE_NOTICE/);
  assert.match(source, /SIGNING_NOTICE/);
});

test('About is a dialog, not a window.alert with a commit hash in it', () => {
  const menu = read('CE_Application/layout/MenuBar.svelte');
  const aboutRow = menu.slice(menu.indexOf("label: 'About CEditor'"));
  assert.ok(aboutRow.length > 0, 'the About menu row disappeared');
  assert.ok(!aboutRow.slice(0, 200).includes('window.alert'),
    'About went back to an alert — an OS modal cannot be read beside the Export tab it is about');
});

test('the About text carries the build stamp and both notices', () => {
  const text = aboutText({ version: '0.2.0', sha: 'abc1234', branch: 'main', time: '2026-08-23 10:00 UTC' });
  assert.match(text, /0\.2\.0/);
  assert.match(text, /abc1234/);
  assert.ok(text.includes(LICENCE_NOTICE.detail));
  assert.ok(text.includes(SIGNING_NOTICE.detail));
});

test('a missing build stamp degrades to "unknown" rather than "undefined"', () => {
  const text = aboutText();
  assert.ok(!text.includes('undefined'));
  assert.match(text, /unknown/);
});
