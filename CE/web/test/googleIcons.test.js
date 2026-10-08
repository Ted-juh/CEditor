// googleIcons.test.js — Google's icons (Material Symbols) fetched by name into the icon library.
//
// The fetch itself is Google's; what is pinned here is everything around it: that the address is
// the one fonts.gstatic.com serves for each style, fill and weight, that a typo or an HTML error
// page can never be stored as an icon, that the same look is never added twice, and that what lands
// in the library is an ordinary icon entry the renderer and scripts already understand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { get } from 'svelte/store';
import { render } from 'svelte/server';

import {
  GOOGLE_ICON_SUGGESTIONS, colourIconSvg, fetchGoogleIconSvg, googleIconKey, googleIconLabel,
  googleIconUrl, googleIconVariant, isUsableIconSvg, normalizeGoogleIconName,
  normalizeGoogleIconRequest, searchGoogleIconNames, svgToDataUrl,
} from '../src/CE_Application/utils/googleIcons.js';
import { GOOGLE_ICON_NAMES } from '../src/CE_Application/generated/googleIconNames.js';
import { parseCodepoints } from '../scripts/generate-google-icon-names.mjs';
import { addGoogleIcons, appSettings } from '../src/CE_Application/stores/appSettings.js';
import { normalizeIconEntry } from '../src/CE_Application/stores/appSettingsSchema.js';
import { assetCatalogue } from '../src/CE_Application/utils/imageLayers.js';
import IconsSettings from '../src/CE_Application/settings/IconsSettings.svelte';

const here = dirname(fileURLToPath(import.meta.url));

// What fonts.gstatic.com sends for home, Outlined, default — trimmed of nothing.
const HOME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24">'
  + '<path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Z"/></svg>';

/** A fetch that answers like Google: an SVG for names it knows, a 404 page for the rest. */
function fakeGoogle(known = ['home', 'tune', 'piano']) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const name = url.split('/').at(-3);
    if (!known.includes(name)) {
      return { ok: false, status: 404, text: async () => '<!DOCTYPE html><title>Error 404 (Not Found)!!1</title>' };
    }
    return { ok: true, status: 200, text: async () => HOME_SVG };
  };
  return { fetchImpl, calls };
}

function withIcons(icons, fn) {
  const before = get(appSettings);
  appSettings.set({ ...before, icons });
  return Promise.resolve(fn()).finally(() => appSettings.set(before));
}

const decodeDataUrl = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf8');

/* ------------------------------------------------------------------ the name list */

test('the bundled name list is Google\'s list: thousands of unique, sorted, snake_case names', () => {
  assert.ok(GOOGLE_ICON_NAMES.length > 3000, `only ${GOOGLE_ICON_NAMES.length} names`);
  assert.deepEqual([...GOOGLE_ICON_NAMES].sort(), GOOGLE_ICON_NAMES, 'not sorted');
  assert.equal(new Set(GOOGLE_ICON_NAMES).size, GOOGLE_ICON_NAMES.length, 'a name is listed twice');
  for (const name of GOOGLE_ICON_NAMES) assert.match(name, /^[a-z0-9_]+$/, name);
});

test('every suggestion shown before anything is typed is a real icon name', () => {
  for (const name of GOOGLE_ICON_SUGGESTIONS) {
    assert.ok(GOOGLE_ICON_NAMES.includes(name), `"${name}" is suggested but Google has no such icon`);
  }
});

test('the generator reads Google\'s codepoints file: one name per line, junk ignored', () => {
  assert.deepEqual(parseCodepoints('tune e429\r\nhome e88a\n\nhome e88a\nNot A Name x\n10k e951\n'),
    ['10k', 'home', 'tune']);
});

/* ------------------------------------------------------------------ names, looks and addresses */

test('a name is written the way Google writes it', () => {
  assert.equal(normalizeGoogleIconName('Volume Up'), 'volume_up');
  assert.equal(normalizeGoogleIconName('  keyboard-arrow-up '), 'keyboard_arrow_up');
  assert.equal(normalizeGoogleIconName('play_arrow!'), 'play_arrow');
  assert.equal(normalizeGoogleIconName(''), '');
});

test('the address is the one fonts.gstatic.com serves for each style, fill and weight', () => {
  const base = 'https://fonts.gstatic.com/s/i/short-term/release/';
  assert.equal(googleIconUrl({ name: 'home' }), `${base}materialsymbolsoutlined/home/default/24px.svg`);
  assert.equal(googleIconUrl({ name: 'home', style: 'rounded', fill: true }),
    `${base}materialsymbolsrounded/home/fill1/24px.svg`);
  assert.equal(googleIconUrl({ name: 'home', style: 'sharp', weight: 700 }),
    `${base}materialsymbolssharp/home/wght700/24px.svg`);
  assert.equal(googleIconVariant({ fill: true, weight: 300 }), 'wght300fill1');
  assert.equal(googleIconVariant({}), 'default');
});

test('an out-of-range request is brought into range rather than sent as asked', () => {
  const r = normalizeGoogleIconRequest({ name: 'Home', style: 'bold', weight: 280, colour: 'pink' });
  assert.deepEqual(r, { name: 'home', style: 'outlined', fill: false, weight: 300, colour: 'white' });
});

test('every look is its own icon, and the label says which look it is', () => {
  const keys = new Set([
    googleIconKey({ name: 'home' }),
    googleIconKey({ name: 'home', fill: true }),
    googleIconKey({ name: 'home', style: 'rounded' }),
    googleIconKey({ name: 'home', weight: 700 }),
    googleIconKey({ name: 'home', colour: 'black' }),
  ]);
  assert.equal(keys.size, 5);
  assert.equal(googleIconLabel({ name: 'home' }), 'home');
  assert.equal(googleIconLabel({ name: 'home', style: 'rounded', fill: true, weight: 300, colour: 'black' }),
    'home (rounded, filled, 300, black)');
});

test('search puts the exact name first, then names that start with it, then the rest', () => {
  const names = ['arrow_back', 'keyboard_arrow_up', 'arrow', 'volume_up', 'up_volume'];
  assert.deepEqual(searchGoogleIconNames(names, 'arrow'), ['arrow', 'arrow_back', 'keyboard_arrow_up']);
  assert.deepEqual(searchGoogleIconNames(names, 'volume up'), ['volume_up', 'up_volume']);
  assert.deepEqual(searchGoogleIconNames(names, ''), []);
  assert.equal(searchGoogleIconNames(GOOGLE_ICON_NAMES, 'a', 60).length, 60);
});

/* ------------------------------------------------------------------ what is accepted */

test('only an SVG is accepted, and nothing in it may run', () => {
  assert.equal(isUsableIconSvg(HOME_SVG), true);
  assert.equal(isUsableIconSvg('<!DOCTYPE html><title>Error 404</title>'), false);
  assert.equal(isUsableIconSvg('<svg><script>alert(1)</script></svg>'), false);
  assert.equal(isUsableIconSvg('<svg onload="x()"><path/></svg>'), false);
  assert.equal(isUsableIconSvg('<svg><a href="javascript:x()"/></svg>'), false);
});

test('the colour goes on the root, which Google\'s shapes inherit', () => {
  assert.match(colourIconSvg(HOME_SVG, 'white'), /^<svg fill="#FFFFFF" xmlns=/);
  assert.match(colourIconSvg('<svg fill="#123456" height="24"><path/></svg>', 'black'), /^<svg fill="#000000" height=/);
  assert.equal(decodeDataUrl(svgToDataUrl(HOME_SVG)), HOME_SVG);
});

test('a fetch reports what went wrong instead of throwing', async () => {
  const { fetchImpl } = fakeGoogle();
  const ok = await fetchGoogleIconSvg({ name: 'home' }, fetchImpl);
  assert.equal(ok.ok, true);
  assert.match(ok.svg, /fill="#FFFFFF"/, 'stored white unless asked otherwise');
  assert.deepEqual(await fetchGoogleIconSvg({ name: 'no_such_icon' }, fetchImpl), { ok: false, reason: 'not-found' });
  assert.deepEqual(await fetchGoogleIconSvg({ name: '' }, fetchImpl), { ok: false, reason: 'empty' });
  assert.deepEqual(await fetchGoogleIconSvg({ name: 'home' }, async () => { throw new Error('offline'); }),
    { ok: false, reason: 'network' });
  assert.deepEqual(await fetchGoogleIconSvg({ name: 'home' }, async () => ({ ok: true, status: 200, text: async () => '<html></html>' })),
    { ok: false, reason: 'invalid' });
});

/* ------------------------------------------------------------------ into the library */

test('added icons are ordinary library entries the renderer and scripts already use', () => withIcons([], async () => {
  const { fetchImpl } = fakeGoogle();
  const result = await addGoogleIcons([{ name: 'home' }, { name: 'tune', style: 'rounded', colour: 'black' }], { fetchImpl });
  assert.deepEqual(result, { ok: true, added: ['home', 'tune'], skipped: [], failed: [] });

  const icons = get(appSettings).icons;
  assert.equal(icons.length, 2);
  const home = icons[0];
  assert.equal(home.name, 'home');
  assert.equal(home.sourceType, 'google');
  assert.equal(home.mimeType, 'image/svg+xml');
  assert.equal(home.isVector, true);
  assert.deepEqual(home.google, { name: 'home', style: 'outlined', fill: false, weight: 400, colour: 'white' });
  assert.match(decodeDataUrl(home.dataUrl), /^<svg fill="#FFFFFF"/);
  assert.equal(icons[1].name, 'tune (rounded, black)');
  assert.match(decodeDataUrl(icons[1].dataUrl), /^<svg fill="#000000"/);

  // A library entry goes through the same normalisation when settings are loaded again.
  assert.deepEqual(normalizeIconEntry(home), home);
  // …and scripts see it in the catalogue, by name, as a Google icon.
  const seen = assetCatalogue(icons).find((a) => a.name === 'home');
  assert.equal(seen.source, 'google');
  assert.equal(seen.vector, true);
}));

test('the same look is never added twice, but another look of the same icon is', () => withIcons([], async () => {
  const { fetchImpl, calls } = fakeGoogle();
  await addGoogleIcons([{ name: 'home' }], { fetchImpl });
  const again = await addGoogleIcons([{ name: 'Home' }, { name: 'home', fill: true }], { fetchImpl });
  assert.deepEqual(again.skipped, ['home']);
  assert.deepEqual(again.added, ['home']);
  assert.equal(get(appSettings).icons.length, 2);
  assert.equal(calls.length, 2, 'a skipped icon is not fetched');
}));

test('a name Google does not have is reported, and the rest are still added', () => withIcons([], async () => {
  const { fetchImpl } = fakeGoogle();
  const result = await addGoogleIcons([{ name: 'piano' }, { name: 'no_such_icon' }], { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.added, ['piano']);
  assert.deepEqual(result.failed, [{ name: 'no_such_icon', reason: 'not-found' }]);
  const nothing = await addGoogleIcons([{ name: 'no_such_icon' }], { fetchImpl });
  assert.equal(nothing.ok, false);
  assert.equal(get(appSettings).icons.length, 1);
}));

test('a Google icon does not block importing a file of the same name', () => withIcons([], async () => {
  const { fetchImpl } = fakeGoogle();
  await addGoogleIcons([{ name: 'home' }], { fetchImpl });
  // importLocalIconFiles skips a file name already in the library; a Google icon's is never home.svg.
  assert.notEqual(get(appSettings).icons[0].fileName.toLowerCase(), 'home.svg');
}));

/* ------------------------------------------------------------------ the page */

test('Settings → Icons offers Google icons beside the file import', () => {
  const html = render(IconsSettings).body;
  assert.match(html, /Add Google Icons/);
  assert.match(html, /Import Local Icons/);
  for (const label of ['Outlined', 'Rounded', 'Sharp', 'Filled', 'Weight', 'White', 'Black', 'Add to library']) {
    assert.ok(html.includes(label), `the Google card has no "${label}"`);
  }
  // Before anything is typed it shows the suggestions, drawn from Google.
  assert.ok(html.includes('materialsymbolsoutlined/play_arrow/default/24px.svg'));
});

test('the Google import guards its async completion like the other imports', () => {
  const text = readFileSync(resolve(here, '..', 'src', 'CE_Application', 'settings', 'IconsSettings.svelte'), 'utf8');
  assert.match(text, /googleGeneration \+= 1/);
  assert.match(text, /const generation = \+\+googleGeneration/);
  assert.match(text, /try \{[\s\S]*?result = await addGoogleIcons\([\s\S]*?\} catch \(error\)/);
});
