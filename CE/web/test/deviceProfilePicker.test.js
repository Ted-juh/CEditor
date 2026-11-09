// deviceProfilePicker.test.js — choosing one of ninety-odd device profiles.
//
// The picker (layout/DeviceProfilePicker.svelte) replaced four plain lists of every profile,
// sorted by internal id: Settings › MIDI, the Device tool, the tab bar's Open Device Profile and
// File › New Panel from Device Profile. It lists profiles by brand and family, narrows them by a
// brand row and a search box, pins the panel's own profile and the recent ones, and describes the
// one you are on. What it says about a profile comes from a summary the C++ engine sends with each
// profile (DeviceProfileEngine::getCatalogSummary), or from summaryFromProfile here for one the
// local engine holds; the two must agree, and the cases below are the ones the C++ test checks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { get } from 'svelte/store';

import {
  SUPERSEDED_PROFILES, brandChips, capabilities, catalogEntries, filterCatalog, groupCatalog, summaryFromProfile,
} from '../src/CE_Application/utils/profileCatalog.js';
import { deviceProfiles } from '../src/CE_Application/stores/deviceProfileStores.js';
import {
  closeProfilePicker, openProfilePicker, profilePickerRequest, recentDeviceProfiles, recordProfileUse,
} from '../src/CE_Application/stores/deviceProfilePicker.js';
import DeviceProfilePicker from '../src/CE_Application/layout/DeviceProfilePicker.svelte';
import DeviceProfileTrigger from '../src/CE_Application/components/DeviceProfileTrigger.svelte';
import { readText } from './support/readText.mjs';

const DIR = fileURLToPath(new URL('../../profiles/test/', import.meta.url));
const PROFILES = readdirSync(DIR).filter((f) => f.endsWith('.ceditor-device.json')).map((f) => JSON.parse(readFileSync(DIR + f, 'utf8')));
const SUMMARIES = PROFILES.map(summaryFromProfile);
const ENTRIES = catalogEntries(SUMMARIES);
const byId = (id) => ENTRIES.find((e) => e.id === id);

test('the summary says what the C++ engine says, for the same four profiles its test checks', () => {
  const cases = [
    ['roland-jd-xi', 'Roland', 6199, 'sysex', true, true, true],
    ['roland-jp-08', 'Roland', 85, 'cc', false, true, false],
    ['sequential-prophet-6', 'Sequential', 876, 'nrpn', false, true, true],
    ['sequential-prophet-rev2', 'Sequential', 1961, 'nrpn', false, false, true],
  ];
  for (const [id, maker, parameters, kind, readsBack, presets, identifies] of cases) {
    const summary = SUMMARIES.find((s) => s.id === id);
    assert.deepEqual(
      [summary.manufacturer, summary.parameterCount, summary.messageKinds, summary.readsBack, summary.presetRecall, summary.identifies, summary.verifiedOnHardware],
      [maker, parameters, [kind], readsBack, presets, identifies, false],
      id,
    );
    assert.ok(summary.source.length > 0, `${id} names no source`);
  }
});

test('the older GAIA profiles and the internal test profiles are not offered, unless asked for', () => {
  for (const [id, { by }] of Object.entries(SUPERSEDED_PROFILES)) {
    assert.ok(byId(id), `${id} is not a profile`);
    assert.ok(byId(by) && !byId(by).hidden, `${id} names ${by} as its replacement, which is not offered`);
    assert.equal(byId(id).hidden, true);
  }
  const offered = filterCatalog(ENTRIES).map((e) => e.id);
  assert.ok(!offered.includes('roland-gaia') && !offered.includes('roland-gaia-dpd'));
  assert.ok(offered.includes('roland-gaia-sh01'));
  assert.ok(!offered.some((id) => id.startsWith('test-')), 'an internal test profile is offered');
  const all = filterCatalog(ENTRIES, { showHidden: true }).map((e) => e.id);
  assert.ok(all.includes('roland-gaia') && all.includes('test-cc-synth'));
  assert.equal(byId('roland-gaia-sh01').name, 'Roland GAIA SH-01', 'the GAIA profile that is offered still says "(full)"');
});

test('the brand row: most profiles first, Generic last, every offered profile counted once', () => {
  const chips = brandChips(ENTRIES);
  assert.equal(chips[0].id, '');
  assert.equal(chips[0].label, 'All brands');
  const brands = chips.slice(1);
  assert.equal(brands.at(-1).id, 'Generic');
  for (let i = 1; i < brands.length - 1; i++) assert.ok(brands[i - 1].count >= brands[i].count, `${brands[i - 1].id} before ${brands[i].id}`);
  assert.deepEqual(brands.slice(0, 3).map((c) => c.id), ['Roland', 'Korg', 'Sequential']);
  assert.equal(brands.reduce((n, c) => n + c.count, 0), chips[0].count);
  assert.equal(chips[0].count, filterCatalog(ENTRIES).length);
});

test('search: every word somewhere in the model, brand or family; a brand narrows it', () => {
  assert.deepEqual(filterCatalog(ENTRIES, { query: 'rd 88' }).map((e) => e.id).sort(), ['roland-rd-88', 'roland-rd-88ex']);
  assert.deepEqual(filterCatalog(ENTRIES, { query: 'dsi mopho' }).map((e) => e.id).sort(),
    ['sequential-mopho', 'sequential-mopho-keyboard', 'sequential-mopho-x4']);
  assert.ok(filterCatalog(ENTRIES, { query: 'prophet', brand: 'Sequential' }).every((e) => e.maker === 'Sequential'));
  assert.ok(filterCatalog(ENTRIES, { query: 'prophet', brand: 'Dave Smith Instruments' }).some((e) => e.id === 'sequential-prophet-08'));
  assert.deepEqual(filterCatalog(ENTRIES, { query: 'no such synth' }), []);
});

test('grouped by brand, then family, models in number order, and named without the brand', () => {
  const groups = groupCatalog(filterCatalog(ENTRIES));
  assert.deepEqual(groups.map((g) => g.maker), brandChips(ENTRIES).slice(1).map((c) => c.id));
  const rd = groups.find((g) => g.maker === 'Roland').families.find((f) => f.family === 'RD').entries.map((e) => e.shortName);
  assert.deepEqual(rd.slice(0, 4), ['RD-08', 'RD-88', 'RD-88EX', 'RD-300GX']);
  assert.equal(byId('roland-jd-xi').shortName, 'JD-Xi');
  assert.equal(byId('sequential-mopho').shortName, 'Mopho');
  assert.equal(byId('generic-cc-dpd').shortName, 'Generic MIDI CC (from DPD)');
});

test('the detail pane says what a CC-only profile cannot do', () => {
  const caps = capabilities(byId('roland-jp-08'));
  assert.deepEqual(caps.map((c) => c.yes), [true, false, true, false]);
  assert.match(caps[1].text, /Cannot read the synth back/);
});

test('recent profiles: most recent first, no repeats, five at most', () => {
  recentDeviceProfiles.set([]);
  for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g']) recordProfileUse(id);
  assert.deepEqual(get(recentDeviceProfiles), ['g', 'f', 'e', 'd', 'a']);
  recentDeviceProfiles.set([]);
});

test('the picker lists brands, pins the panel\'s profile, and hides the older GAIA ones', () => {
  deviceProfiles.set(SUMMARIES);
  openProfilePicker({ title: 'Device profile', subtitle: 'for mainSynth', panelProfileIds: ['roland-gaia-sh01'], actionLabel: 'Use for mainSynth' });
  try {
    const { body } = render(DeviceProfilePicker, { props: {} });
    assert.match(body, /role="dialog"/);
    assert.match(body, /aria-label="Brand"/);
    for (const brand of ['All brands', 'Roland', 'Sequential', 'Dave Smith Instruments', 'Yamaha', 'Generic']) {
      assert.ok(body.includes(`aria-label="${brand},`), `no ${brand} chip`);
    }
    assert.match(body, />This panel</);
    assert.match(body, /Roland GAIA SH-01/);
    assert.doesNotMatch(body, /from DPD\)<\/span>[\s\S]*GAIA|GAIA SH-01 \(from DPD\)/, 'an older GAIA profile is offered');
    assert.match(body, /Show older and internal profiles/);
  } finally {
    closeProfilePicker();
    deviceProfiles.set([]);
  }
  assert.equal(get(profilePickerRequest), null);
});

test('the closed picker names the profile, what kind it is, and is labelled for a screen reader', () => {
  deviceProfiles.set(SUMMARIES);
  try {
    const { body } = render(DeviceProfileTrigger, { props: { profileId: 'sequential-prophet-6', role: 'mainSynth' } });
    assert.match(body, /aria-label="Device profile"/);
    assert.match(body, /Sequential Prophet-6/);
    assert.match(body, /Prophet family/);
    assert.match(body, /876 parameters/);
    assert.match(body, />NRPN</);
  } finally {
    deviceProfiles.set([]);
  }
});

test('every place that chooses a profile uses the picker, and the app mounts it once', () => {
  const source = (file) => readText(fileURLToPath(new URL(`../src/${file}`, import.meta.url)));
  assert.match(source('App.svelte'), /<DeviceProfilePicker \/>/);
  assert.match(source('CE_Application/settings/MidiSettings.svelte'), /<DeviceProfileTrigger/);
  assert.match(source('CE_Application/components/ParameterBrowserTab.svelte'), /<DeviceProfileTrigger/);
  assert.match(source('CE_Application/editor/TabBar.svelte'), /openProfilePicker\(/);
  const menu = source('CE_Application/layout/MenuBar.svelte');
  assert.match(menu, /openProfilePicker\(/);
  assert.match(menu, /Choose from all \$\{listed\} profiles…/);
});
