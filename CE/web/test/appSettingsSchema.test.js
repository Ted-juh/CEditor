import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGeneralSettings,
  normalizeSettings,
  sanitizeSettingsForPersistence,
} from '../src/CE_Application/stores/appSettingsSchema.js';

test('normalizeGeneralSettings clamps numeric runtime preferences', () => {
  const normalized = normalizeGeneralSettings({
    autosaveIntervalSeconds: 9999,
    defaultGridSize: -5,
    insertOffset: 999,
    keyboardNudgeSmall: 0,
    showPreviewSelectionRing: false,
  });

  assert.equal(normalized.autosaveIntervalSeconds, 600);
  assert.equal(normalized.defaultGridSize, 1);
  assert.equal(normalized.insertOffset, 400);
  assert.equal(normalized.keyboardNudgeSmall, 1);
  assert.equal(normalized.showPreviewSelectionRing, false);
});

test('a component file is imported when chosen only when the setting says so', () => {
  // Off unless set: File then puts the file in the import box, to read before Import.
  assert.equal(normalizeGeneralSettings({}).importComponentFileAtOnce, false);
  assert.equal(normalizeGeneralSettings({ importComponentFileAtOnce: 'yes' }).importComponentFileAtOnce, false);
  assert.equal(normalizeGeneralSettings({ importComponentFileAtOnce: true }).importComponentFileAtOnce, true);
});

test('the interface size is one of the sizes Settings offers, 100% otherwise', () => {
  assert.equal(normalizeGeneralSettings({}).interfaceZoom, 100);
  assert.equal(normalizeGeneralSettings({ interfaceZoom: 125 }).interfaceZoom, 125);
  assert.equal(normalizeGeneralSettings({ interfaceZoom: '150' }).interfaceZoom, 150, 'a select hands back text');
  assert.equal(normalizeGeneralSettings({ interfaceZoom: 133 }).interfaceZoom, 100, 'not a size on offer');
  assert.equal(normalizeGeneralSettings({ interfaceZoom: 5 }).interfaceZoom, 100);
});

test('normalizeSettings filters invalid assets', () => {
  const normalized = normalizeSettings({
    general: {},
    fonts: [{ family: 'Example', enabled: true }],
    icons: [{ name: 'Bad icon', dataUrl: '' }, { name: 'Good icon', dataUrl: 'data:image/png;base64,AA==' }],
  });

  assert.equal(normalized.fonts.length, 1);
  assert.equal(normalized.icons.length, 1);
  assert.equal(normalized.icons[0].name, 'Good icon');
});

test('sanitizeSettingsForPersistence strips heavy cached blobs', () => {
  const compacted = sanitizeSettingsForPersistence({
    fonts: [
      {
        id: 'local',
        filePath: 'C:/font.ttf',
        localDataUrl: 'data:font/ttf;base64,AA==',
        sourceType: 'local',
      },
      {
        id: 'google',
        sourceType: 'google',
        cachedFaces: [{ dataUrl: 'data:font/woff2;base64,AA==' }],
      },
    ],
    icons: [],
  });

  assert.equal(compacted.fonts[0].localDataUrl, '');
  assert.deepEqual(compacted.fonts[1].cachedFaces, []);
});
