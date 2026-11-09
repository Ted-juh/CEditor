// profileCatalogue.test.js — docs/device-profile-library.md lists the profiles that exist.
//
// The page's catalogue is written by tools/profiles/catalogue.mjs from CE/profiles/test. A list
// that is kept by hand is believed long after it stops being true; this fails the moment a profile
// is added, removed or renamed without the page being regenerated.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { PAGE, render } from '../../../tools/profiles/catalogue.mjs';

test('the device profile library page lists every profile there is', () => {
  const page = readText(PAGE);
  assert.equal(render(page), page, 'stale — run: node tools/profiles/catalogue.mjs');
});
