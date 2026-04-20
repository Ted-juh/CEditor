import { writable, derived, get } from 'svelte/store';
import {
  isJuceAvailable,
  loadAppSettings as bridgeLoadAppSettings,
  updateAppSettings as bridgeUpdateAppSettings,
  importFonts as bridgeImportFonts,
  requestFileData,
  onFileData,
  onAppSettingsLoaded,
  onFontsImported,
} from '../bridge/bridge.js';
import { parseFontMetadataFromDataUrl } from '../utils/fontParsing.js';
import { createPerfDebugTimer, logPerfDebug } from '../utils/perfDebug.js';
import {
  DEFAULT_GENERAL_SETTINGS,
  applyGeneralSettingsToRuntime,
  reopenLastSession,
  autosaveEnabled,
  autosaveIntervalSeconds,
  restoreUnsavedWork,
  defaultSnapToGrid,
  defaultGridSize,
  showRulers,
  showGuides,
  showDistances,
  showPreviewSelectionRing,
  insertOffset,
  duplicateOffset,
  keyboardNudgeSmall,
  keyboardNudgeLarge,
} from './runtimePreferences.js';
import { restoreSessionFromPreferences } from './panels.js';
import {
  buildFontFaceSource,
  createDefaultSettings,
  createFontId,
  getBuiltinFonts,
  normalizeFamilyName,
  normalizeFontEntry,
  normalizeGeneralSettings,
  normalizeSettings,
  normalizeSupportedFeatures,
  sanitizeSettingsForPersistence,
  shouldCompactPersistedSettings,
} from './appSettingsSchema.js';
import {
  buildLocalFontEntryFromFile,
  buildLocalIconEntryFromFile,
  isSupportedFontFileName,
  isSupportedIconFileName,
} from './appSettingsImportBuilders.js';

export { WEIGHT_OPTIONS } from './appSettingsSchema.js';

function dataUrlToArrayBuffer(dataUrl) {
  const value = String(dataUrl ?? '');
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid data URL');
  }

  const binary = atob(value.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function dataUrlToObjectUrl(dataUrl, mimeType = '') {
  const key = `${mimeType}|${dataUrl}`;
  const existing = localFontObjectUrls.get(key) || googleFontObjectUrls.get(key);
  if (existing) return existing;

  const blob = new Blob([dataUrlToArrayBuffer(dataUrl)], { type: mimeType || 'font/ttf' });
  const objectUrl = URL.createObjectURL(blob);

  if (mimeType.startsWith('font/')) {
    localFontObjectUrls.set(key, objectUrl);
  } else {
    googleFontObjectUrls.set(key, objectUrl);
  }

  return objectUrl;
}

export const appSettings = writable(createDefaultSettings());
export const fontRuntimeStatus = writable({});

export const storedFonts = derived(appSettings, ($settings) => $settings.fonts ?? []);
export const storedIcons = derived(appSettings, ($settings) => $settings.icons ?? []);
export const generalSettings = derived(appSettings, ($settings) => $settings.general ?? { ...DEFAULT_GENERAL_SETTINGS });

export const availableFonts = derived(appSettings, ($settings) => {
  const merged = [];
  const seen = new Set();
  const importedFontCounts = new Map();

  for (const font of $settings.fonts ?? []) {
    if (!font.enabled || !font.family) continue;
    const countKey = font.family.toLowerCase();
    importedFontCounts.set(countKey, (importedFontCounts.get(countKey) ?? 0) + 1);
  }

  for (const family of getBuiltinFonts()) {
    const key = family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      value: family,
      label: family,
      sourceType: 'builtin',
      supportsWeight: false,
      supportedFeatures: [],
      featureSupportKnown: false,
    });
  }

  for (const font of $settings.fonts ?? []) {
    if (!font.enabled || !font.family) continue;
    const key = String(font.cssFamily || font.family).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const duplicateFamily = (importedFontCounts.get(font.family.toLowerCase()) ?? 0) > 1;
    const familyLabel = duplicateFamily && font.styleName
      ? `${font.family} (${font.styleName})`
      : font.family;
    merged.push({
      id: font.id,
      value: font.cssFamily || font.family,
      label: font.supportsWeight ? `${familyLabel} [W]` : familyLabel,
      sourceType: font.sourceType,
      supportsWeight: font.supportsWeight === true,
      axes: Array.isArray(font.axes) ? font.axes : [],
      weightAxis: font.weightAxis ?? null,
      supportedFeatures: normalizeSupportedFeatures(font.supportedFeatures),
      featureSupportKnown: font.featureSupportKnown === true,
      family: font.family,
      cssFamily: font.cssFamily || font.family,
      googleFamily: font.googleFamily,
      filePath: font.filePath,
      fileName: font.fileName,
      cachedFaces: Array.isArray(font.cachedFaces) ? font.cachedFaces : [],
      localDataUrl: font.localDataUrl,
      fileFormat: font.fileFormat,
      fontStyle: font.fontStyle,
      staticWeight: font.staticWeight,
      enabled: font.enabled,
      styleName: font.styleName || '',
    });
  }

  return merged;
});

export const availableIcons = derived(appSettings, ($settings) =>
  ($settings.icons ?? [])
    .filter((icon) => icon.enabled && icon.dataUrl)
    .map((icon) => ({
      value: icon.id,
      label: icon.name,
      name: icon.name,
      dataUrl: icon.dataUrl,
      mimeType: icon.mimeType,
      isVector: icon.isVector === true,
      width: icon.width ?? 0,
      height: icon.height ?? 0,
    }))
);

let listenersInitialized = false;
let settingsLoaded = false;
let fontRequestCounter = 0;
const pendingFontRequests = new Map();
const pendingLocalFontLoads = new Set();
const pendingGoogleFontLoads = new Set();
const pendingGoogleStylesheetLoads = new Map();
const loadedLocalFonts = new Set();
const injectedGoogleFonts = new Set();
const loadedGoogleFonts = new Set();
const pendingFeatureSupportBackfills = new Set();
const scheduledFeatureSupportBackfills = new Set();
const localFontObjectUrls = new Map();
const googleFontObjectUrls = new Map();
let settingsCompactionScheduled = false;

function setFontStatus(id, status, detail = '') {
  if (!id) return;
  fontRuntimeStatus.update((current) => ({
    ...current,
    [id]: { status, detail },
  }));
}

function persistSettings() {
  if (!settingsLoaded || !isJuceAvailable()) return;
  bridgeUpdateAppSettings(sanitizeSettingsForPersistence(get(appSettings)));
}

function runScheduledTask(callback, delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => {
      void callback();
    }, delayMs);
    return;
  }

  void callback();
}

function scheduleSettingsCompaction(settings) {
  if (!settingsLoaded || !isJuceAvailable()) return;
  if (!shouldCompactPersistedSettings(settings)) return;
  if (settingsCompactionScheduled) return;

  settingsCompactionScheduled = true;
  runScheduledTask(() => {
    settingsCompactionScheduled = false;
    bridgeUpdateAppSettings(sanitizeSettingsForPersistence(settings));
  }, 2500);
}

function buildGoogleFontHref(family) {
  const trimmed = normalizeFamilyName(family);
  const encoded = encodeURIComponent(trimmed).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function fontDebugLabel(font) {
  return String(font?.fileName || font?.family || font?.id || 'font');
}

function escapeCssFontFamily(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function buildAliasedGoogleFontCss(cssText, familyAlias) {
  const quotedAlias = `'${escapeCssFontFamily(familyAlias)}'`;
  return String(cssText ?? '').replace(/font-family\s*:\s*([^;]+);/gi, `font-family: ${quotedAlias};`);
}

function fontLoadDescriptor(family, { style = 'normal', weight = '400' } = {}) {
  return `${style} ${weight} 16px "${String(family ?? '').replace(/"/g, '\\"')}"`;
}

async function waitForBrowserFont(family, descriptors = {}) {
  if (typeof document === 'undefined' || !document.fonts || !family) return;

  const descriptor = fontLoadDescriptor(family, descriptors);
  await document.fonts.load(descriptor);

  if (!document.fonts.check(descriptor)) {
    throw new Error(`Browser did not load ${family}`);
  }
}

function extractCssProperty(block, propertyName) {
  const match = block.match(new RegExp(`${propertyName}\\s*:\\s*([^;]+);`, 'i'));
  return match ? match[1].trim() : '';
}

function normalizeQuotedCssValue(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function inferFontMimeType(url, format, contentType = '') {
  const lowerType = String(contentType ?? '').toLowerCase();
  if (lowerType.startsWith('font/')) return lowerType;
  if (lowerType.includes('woff2')) return 'font/woff2';
  if (lowerType.includes('woff')) return 'font/woff';
  if (lowerType.includes('opentype') || lowerType.includes('otf')) return 'font/otf';
  if (lowerType.includes('truetype') || lowerType.includes('ttf')) return 'font/ttf';

  const lowerFormat = String(format ?? '').toLowerCase();
  if (lowerFormat.includes('woff2')) return 'font/woff2';
  if (lowerFormat.includes('woff')) return 'font/woff';
  if (lowerFormat.includes('opentype')) return 'font/otf';
  if (lowerFormat.includes('truetype')) return 'font/ttf';

  const cleanUrl = String(url ?? '').split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.woff2')) return 'font/woff2';
  if (cleanUrl.endsWith('.woff')) return 'font/woff';
  if (cleanUrl.endsWith('.otf')) return 'font/otf';
  return 'font/ttf';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function parseGoogleCssFaces(cssText) {
  const blocks = String(cssText ?? '').match(/@font-face\s*{[^}]*}/gms) ?? [];
  const faces = [];

  for (const block of blocks) {
    const src = extractCssProperty(block, 'src');
    const urlMatch = src.match(/url\((['"]?)([^)'"]+)\1\)(?:\s*format\((['"]?)([^)'"]+)\3\))?/i);
    if (!urlMatch?.[2]) continue;

    faces.push({
      family: normalizeQuotedCssValue(extractCssProperty(block, 'font-family')),
      style: normalizeQuotedCssValue(extractCssProperty(block, 'font-style') || 'normal'),
      weight: normalizeQuotedCssValue(extractCssProperty(block, 'font-weight') || '400'),
      unicodeRange: normalizeQuotedCssValue(extractCssProperty(block, 'unicode-range')),
      url: urlMatch[2],
      format: normalizeQuotedCssValue(urlMatch[4] || ''),
    });
  }

  return faces;
}

function deriveGoogleFontMetadata(faces) {
  const exactWeights = new Set();
  const ranges = [];

  for (const face of faces) {
    const value = String(face?.weight ?? '').trim();
    const rangeMatch = value.match(/^(\d{3})\s+(\d{3})$/);
    if (rangeMatch) {
      ranges.push({
        min: Number.parseInt(rangeMatch[1], 10),
        max: Number.parseInt(rangeMatch[2], 10),
      });
      continue;
    }

    const exactMatch = value.match(/^(\d{3})$/);
    if (exactMatch) {
      exactWeights.add(Number.parseInt(exactMatch[1], 10));
    }
  }

  if (ranges.length > 0) {
    const min = Math.min(...ranges.map((range) => range.min));
    const max = Math.max(...ranges.map((range) => range.max));
    const defaultWeight = min <= 400 && max >= 400 ? 400 : min;
    return {
      supportsWeight: true,
      axes: [{ tag: 'wght', min, default: defaultWeight, max }],
      weightAxis: { min, default: defaultWeight, max },
      staticWeight: defaultWeight,
    };
  }

  const exactList = [...exactWeights].sort((left, right) => left - right);
  if (exactList.length > 1) {
    return {
      supportsWeight: true,
      axes: [{ tag: 'wght', min: exactList[0], default: exactList.includes(400) ? 400 : exactList[0], max: exactList[exactList.length - 1] }],
      weightAxis: null,
      staticWeight: exactList.includes(400) ? 400 : exactList[0],
    };
  }

  return {
    supportsWeight: false,
    axes: [],
    weightAxis: null,
    staticWeight: exactList[0] ?? null,
  };
}

async function fetchGoogleFontPackage(family) {
  let cssResponse;

  try {
    cssResponse = await fetch(buildGoogleFontHref(family));
  } catch (error) {
    return { ok: false, reason: 'verification-failed' };
  }

  if (!cssResponse.ok) {
    return {
      ok: false,
      reason: cssResponse.status === 400 || cssResponse.status === 404 ? 'not-found' : 'verification-failed',
    };
  }

  const cssText = await cssResponse.text();
  const faceDefinitions = parseGoogleCssFaces(cssText);
  if (faceDefinitions.length === 0) {
    return { ok: false, reason: 'not-found' };
  }

  const cachedFaces = [];

  for (const faceDefinition of faceDefinitions) {
    let faceResponse;

    try {
      faceResponse = await fetch(faceDefinition.url);
    } catch (error) {
      return { ok: false, reason: 'download-failed' };
    }

    if (!faceResponse.ok) {
      return { ok: false, reason: 'download-failed' };
    }

    const buffer = await faceResponse.arrayBuffer();
    const mimeType = inferFontMimeType(
      faceDefinition.url,
      faceDefinition.format,
      faceResponse.headers.get('content-type')
    );

    cachedFaces.push({
      dataUrl: `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`,
      format: faceDefinition.format,
      style: faceDefinition.style || 'normal',
      weight: faceDefinition.weight || '400',
      unicodeRange: faceDefinition.unicodeRange || '',
    });
  }

  const metadata = deriveGoogleFontMetadata(faceDefinitions);
  let parsedMetadata = null;

  if (cachedFaces[0]?.dataUrl) {
    try {
      parsedMetadata = await parseFontMetadataFromDataUrl(cachedFaces[0].dataUrl, faceDefinitions[0]?.family || family);
    } catch (error) {
      parsedMetadata = null;
    }
  }

  return {
    ok: true,
    family: parsedMetadata?.family || faceDefinitions[0]?.family || family,
    cachedFaces,
    supportsWeight: metadata.supportsWeight,
    axes: metadata.axes ?? [],
    weightAxis: metadata.weightAxis,
    staticWeight: metadata.staticWeight,
    supportedFeatures: parsedMetadata?.supportedFeatures ?? [],
    featureSupportKnown: parsedMetadata?.featureSupportKnown === true,
    featureSupportScanned: cachedFaces.length > 0,
  };
}

function ensureGoogleFontStylesheetLoaded(entry) {
  if (typeof document === 'undefined' || !entry?.family) return;
  if (loadedGoogleFonts.has(entry.id) || pendingGoogleStylesheetLoads.has(entry.id)) return;

  const elementId = `google-font-${entry.id}`;
  const targetFamily = entry.cssFamily || entry.family;
  const expectedHref = buildGoogleFontHref(entry.googleFamily || entry.family);
  const existing = document.getElementById(elementId);
  if (existing?.dataset?.fontFamilyAlias === targetFamily) {
    injectedGoogleFonts.add(entry.id);
    return;
  }

  if (existing) existing.remove();

  const loadPromise = (async () => {
    setFontStatus(entry.id, 'loading');

    try {
      const cssResponse = await fetch(expectedHref);
      if (!cssResponse.ok) {
        throw new Error(`Google stylesheet request failed (${cssResponse.status})`);
      }

      const cssText = await cssResponse.text();
      const style = document.createElement('style');
      style.id = elementId;
      style.dataset.fontFamilyAlias = targetFamily;
      style.textContent = buildAliasedGoogleFontCss(cssText, targetFamily);
      document.head.appendChild(style);

      injectedGoogleFonts.add(entry.id);
      await waitForBrowserFont(targetFamily, {
        style: entry.fontStyle || 'normal',
        weight: entry.staticWeight ? String(entry.staticWeight) : '400',
      });
      loadedGoogleFonts.add(entry.id);
      setFontStatus(entry.id, 'loaded');
    } catch (error) {
      injectedGoogleFonts.delete(entry.id);
      if (!Array.isArray(entry.cachedFaces) || entry.cachedFaces.length === 0) {
        setFontStatus(entry.id, 'failed', error?.message ?? 'stylesheet load failed');
      }
      console.error('[appSettings] Failed to load Google stylesheet font', entry.family, error);
    } finally {
      pendingGoogleStylesheetLoads.delete(entry.id);
    }
  })();

  pendingGoogleStylesheetLoads.set(entry.id, loadPromise);
}

async function ensureCachedGoogleFontLoaded(entry) {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  if (!entry?.family || loadedGoogleFonts.has(entry.id)) return;
  if (!Array.isArray(entry.cachedFaces) || entry.cachedFaces.length === 0) return;
  setFontStatus(entry.id, 'loading');

  try {
    for (const face of entry.cachedFaces) {
      const descriptors = {
        style: face.style || 'normal',
        weight: face.weight || '400',
      };

      if (face.unicodeRange) {
        descriptors.unicodeRange = face.unicodeRange;
      }

      const mimeType = inferFontMimeType('', face.format, '');

      try {
        // Loading directly from the data URL avoids a large JS-side base64 decode
        // on startup for every cached face.
        const fontFace = new FontFace(
          entry.cssFamily || entry.family,
          buildFontFaceSource(face.dataUrl, mimeType),
          descriptors
        );
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (directError) {
        const objectUrl = dataUrlToObjectUrl(face.dataUrl, mimeType);
        const fontFace = new FontFace(entry.cssFamily || entry.family, buildFontFaceSource(objectUrl, mimeType), descriptors);
        await fontFace.load();
        document.fonts.add(fontFace);
      }
    }

    loadedGoogleFonts.add(entry.id);
    setFontStatus(entry.id, 'loaded');
  } catch (error) {
    setFontStatus(entry.id, 'failed', error?.message ?? 'load failed');
    throw error;
  }
}

async function loadLocalFontFace(entry, dataUrl) {
  if (typeof FontFace === 'undefined' || !entry?.family || !dataUrl) return;
  setFontStatus(entry.id, 'loading');
  const descriptors = {
    style: entry.fontStyle || 'normal',
    weight: entry.staticWeight ? String(entry.staticWeight) : '400',
  };
  const mimeType = entry.fileFormat || inferFontMimeTypeFromFileName(entry.fileName);

  try {
    try {
      const directFace = new FontFace(
        entry.cssFamily || entry.family,
        buildFontFaceSource(dataUrl, mimeType),
        descriptors
      );
      await directFace.load();
      document.fonts.add(directFace);
    } catch (directError) {
      const objectUrl = dataUrlToObjectUrl(dataUrl, mimeType);
      const fallbackFace = new FontFace(entry.cssFamily || entry.family, buildFontFaceSource(objectUrl, mimeType), descriptors);
      await fallbackFace.load();
      document.fonts.add(fallbackFace);
    }

    loadedLocalFonts.add(entry.id);
    setFontStatus(entry.id, 'loaded');
  } catch (error) {
    setFontStatus(entry.id, 'failed', error?.message ?? 'load failed');
    throw error;
  }
}

function updateStoredFont(id, updater) {
  let changed = false;

  appSettings.update((current) => {
    const nextFonts = (current.fonts ?? []).map((font) => {
      if (font.id !== id) return font;
      changed = true;
      return normalizeFontEntry(updater(font));
    });

    return { ...current, fonts: nextFonts };
  });

  if (changed) persistSettings();
}

function syncGeneralSettingValue(key, value) {
  appSettings.update((current) => {
    const nextGeneral = normalizeGeneralSettings({
      ...(current.general ?? DEFAULT_GENERAL_SETTINGS),
      [key]: value,
    });

    return {
      ...current,
      general: nextGeneral,
    };
  });

  persistSettings();
}

[
  ['reopenLastSession', reopenLastSession],
  ['autosaveEnabled', autosaveEnabled],
  ['autosaveIntervalSeconds', autosaveIntervalSeconds],
  ['restoreUnsavedWork', restoreUnsavedWork],
  ['defaultSnapToGrid', defaultSnapToGrid],
  ['defaultGridSize', defaultGridSize],
  ['showRulers', showRulers],
  ['showGuides', showGuides],
  ['showDistances', showDistances],
  ['showPreviewSelectionRing', showPreviewSelectionRing],
  ['insertOffset', insertOffset],
  ['duplicateOffset', duplicateOffset],
  ['keyboardNudgeSmall', keyboardNudgeSmall],
  ['keyboardNudgeLarge', keyboardNudgeLarge],
].forEach(([key, store]) => {
  store.subscribe((value) => {
    if (!settingsLoaded) return;
    syncGeneralSettingValue(key, value);
  });
});

function mergeImportedFonts(importedFonts) {
  appSettings.update((current) => {
    const nextFonts = [...(current.fonts ?? [])];
    const existingPaths = new Set(nextFonts.map((font) => font.filePath).filter(Boolean));
    const existingNames = new Set(nextFonts.map((font) => font.fileName.toLowerCase()).filter(Boolean));

    for (const imported of importedFonts) {
      const font = normalizeFontEntry({
        ...imported,
        sourceType: 'local',
        enabled: true,
      });

      if (!font.family) continue;
      if (font.filePath && existingPaths.has(font.filePath)) continue;
      if (font.fileName && existingNames.has(font.fileName.toLowerCase())) continue;

      existingPaths.add(font.filePath);
      if (font.fileName) existingNames.add(font.fileName.toLowerCase());
      nextFonts.push(font);
    }

    return { ...current, fonts: nextFonts };
  });

  persistSettings();
}

function updateStoredFontMetadata(id, metadata) {
  updateStoredFont(id, (font) => ({
    ...font,
    family: metadata.family || font.family,
    supportsWeight: metadata.supportsWeight === true,
    axes: metadata.axes ?? [],
    weightAxis: metadata.weightAxis ?? null,
    staticWeight: metadata.staticWeight ?? null,
    parseSupported: metadata.parseSupported !== false,
    supportedFeatures: metadata.supportedFeatures ?? [],
    featureSupportKnown: metadata.featureSupportKnown === true,
    featureSupportScanned: true,
    fontStyle: metadata.fontStyle || font.fontStyle,
    styleName: metadata.styleName || font.styleName,
  }));
}

function cacheLocalFontData(id, dataUrl, filePath = '') {
  updateStoredFont(id, (font) => ({
    ...font,
    filePath: filePath || font.filePath,
    localDataUrl: (filePath || font.filePath) ? '' : (dataUrl || font.localDataUrl),
    fileFormat: font.fileFormat || inferFontMimeTypeFromFileName(font.fileName),
  }));
}

async function backfillFontFeatureSupport(font) {
  if (!font?.id || pendingFeatureSupportBackfills.has(font.id)) return;
  const sourceData = String(font.localDataUrl || font.cachedFaces?.[0]?.dataUrl || '');
  if (!sourceData) return;

  pendingFeatureSupportBackfills.add(font.id);
  try {
    const metadata = await parseFontMetadataFromDataUrl(sourceData, font.family);
    updateStoredFontMetadata(font.id, metadata);
  } catch (error) {
    updateStoredFont(font.id, (current) => ({
      ...current,
      featureSupportKnown: false,
      featureSupportScanned: true,
    }));
  } finally {
    pendingFeatureSupportBackfills.delete(font.id);
  }
}

function scheduleFontFeatureSupportBackfill(font, delayMs = 5000) {
  if (!font?.id) return;
  if (scheduledFeatureSupportBackfills.has(font.id) || pendingFeatureSupportBackfills.has(font.id)) return;
  const sourceData = String(font.localDataUrl || font.cachedFaces?.[0]?.dataUrl || '');
  if (!sourceData) return;

  scheduledFeatureSupportBackfills.add(font.id);
  runScheduledTask(async () => {
    scheduledFeatureSupportBackfills.delete(font.id);
    await backfillFontFeatureSupport(font);
  }, delayMs);
}

export function ensureStoredFontLoaded(font, { allowFeatureBackfill = false, delayMs = 0 } = {}) {
  if (!font?.enabled || !font?.family) return;
  if (font.sourceType !== 'google' && font.sourceType !== 'local') return;

  if (allowFeatureBackfill && font.featureSupportScanned !== true && (font.localDataUrl || font.cachedFaces?.[0]?.dataUrl)) {
    scheduleFontFeatureSupportBackfill(font, 3000);
  }

  if (font.sourceType === 'google') {
    ensureGoogleFontStylesheetLoaded(font);

    if (!Array.isArray(font.cachedFaces) || font.cachedFaces.length === 0) {
      return;
    }

    if (loadedGoogleFonts.has(font.id) || pendingGoogleFontLoads.has(font.id)) {
      return;
    }

    pendingGoogleFontLoads.add(font.id);
    runScheduledTask(async () => {
      try {
        await ensureCachedGoogleFontLoaded(font);
      } catch (error) {
        console.error('[appSettings] Failed to load cached Google font', font.family, error);
      } finally {
        pendingGoogleFontLoads.delete(font.id);
      }
    }, delayMs);
    return;
  }

  if (font.localDataUrl) {
    if (loadedLocalFonts.has(font.id) || pendingLocalFontLoads.has(font.id)) {
      return;
    }

    pendingLocalFontLoads.add(font.id);
    runScheduledTask(async () => {
      try {
        await loadLocalFontFace(font, font.localDataUrl);
      } catch (error) {
        console.error('[appSettings] Failed to load cached local font', font.family, error);
      } finally {
        pendingLocalFontLoads.delete(font.id);
      }
    }, delayMs);
    return;
  }

  if (!font.filePath || loadedLocalFonts.has(font.id)) return;
  if (!isJuceAvailable()) return;
  if ([...pendingFontRequests.values()].some((pending) => pending?.font?.id === font.id)) return;

  const requestId = `font_${++fontRequestCounter}`;
  logPerfDebug(`font file request ${fontDebugLabel(font)}`, `id=${font.id} path=${font.filePath}`);
  pendingFontRequests.set(requestId, {
    font,
    stopTimer: createPerfDebugTimer(`font file load ${fontDebugLabel(font)}`),
  });
  runScheduledTask(() => {
    requestFileData(requestId, font.filePath);
  }, delayMs);
}

export function initAppSettingsBridge() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  onAppSettingsLoaded((payload) => {
    const stopTimer = createPerfDebugTimer('bridge app settings load');
    const normalized = normalizeSettings(payload ?? createDefaultSettings());
    appSettings.set(normalized);
    applyGeneralSettingsToRuntime(normalized.general);
    settingsLoaded = true;
    restoreSessionFromPreferences();
    scheduleSettingsCompaction(normalized);
    stopTimer(`fonts=${normalized.fonts.length} icons=${normalized.icons.length}`);
  });

  onFontsImported((payload) => {
    const imported = Array.isArray(payload) ? payload : payload?.toJSON?.() ?? [];
    mergeImportedFonts(imported);
  });

  onFileData(async (payload) => {
    const pending = pendingFontRequests.get(payload?.requestId);
    const font = pending?.font;
    if (!font) return;

    pendingFontRequests.delete(payload.requestId);

    try {
      await loadLocalFontFace(font, payload.data);
      cacheLocalFontData(font.id, payload.data, font.filePath);
      const metadata = await parseFontMetadataFromDataUrl(payload.data, font.family);
      updateStoredFontMetadata(font.id, metadata);
      pending?.stopTimer?.(
        `bytes=${formatBytes(payload?.byteSize)} read=${Number(payload?.readMs || 0).toFixed(1)}ms encode=${Number(payload?.encodeMs || 0).toFixed(1)}ms`
      );
    } catch (error) {
      pending?.stopTimer?.(`errored=${error?.message ?? 'unknown'}`);
      console.error('[appSettings] Failed to load font', font.family, error);
    }
  });

  bridgeLoadAppSettings();
}

export function updateGeneralSettings(updates) {
  if (!updates || typeof updates !== 'object') return;

  appSettings.update((current) => ({
    ...current,
    general: normalizeGeneralSettings({
      ...(current.general ?? DEFAULT_GENERAL_SETTINGS),
      ...updates,
    }),
  }));

  const general = get(appSettings).general ?? { ...DEFAULT_GENERAL_SETTINGS };
  applyGeneralSettingsToRuntime(general);
  persistSettings();
}

export function importLocalFonts() {
  bridgeImportFonts();
}

export async function importLocalFontFiles(fileList) {
  const files = Array.from(fileList ?? []).filter((file) => isSupportedFontFileName(file?.name));
  if (files.length === 0) {
    return { ok: false, reason: 'no-supported-files' };
  }

  const existingNames = new Set(
    get(appSettings).fonts
      .map((font) => font.fileName.toLowerCase())
      .filter(Boolean)
  );

  const importedFonts = [];
  let skippedCount = 0;

  for (const file of files) {
    const fileName = String(file?.name ?? '');
    if (!fileName || existingNames.has(fileName.toLowerCase())) {
      skippedCount += 1;
      continue;
    }

    const font = await buildLocalFontEntryFromFile(file);
    existingNames.add(fileName.toLowerCase());
    importedFonts.push(font);
  }

  if (importedFonts.length === 0) {
    return { ok: false, reason: skippedCount > 0 ? 'duplicates-only' : 'read-failed' };
  }

  appSettings.update((current) => ({
    ...current,
    fonts: [...(current.fonts ?? []), ...importedFonts],
  }));

  persistSettings();
  return { ok: true, importedCount: importedFonts.length, skippedCount };
}

export async function importLocalIconFiles(fileList) {
  const files = Array.from(fileList ?? []).filter((file) => isSupportedIconFileName(file?.name));
  if (files.length === 0) {
    return { ok: false, reason: 'no-supported-files' };
  }

  const existingNames = new Set(
    (get(appSettings).icons ?? [])
      .map((icon) => icon.fileName.toLowerCase())
      .filter(Boolean)
  );

  const importedIcons = [];
  let skippedCount = 0;

  for (const file of files) {
    const fileName = String(file?.name ?? '');
    if (!fileName || existingNames.has(fileName.toLowerCase())) {
      skippedCount += 1;
      continue;
    }

    const icon = await buildLocalIconEntryFromFile(file);
    existingNames.add(fileName.toLowerCase());
    importedIcons.push(icon);
  }

  if (importedIcons.length === 0) {
    return { ok: false, reason: skippedCount > 0 ? 'duplicates-only' : 'read-failed' };
  }

  appSettings.update((current) => ({
    ...current,
    icons: [...(current.icons ?? []), ...importedIcons],
  }));

  persistSettings();
  return { ok: true, importedCount: importedIcons.length, skippedCount };
}

export async function addGoogleFont(family) {
  const trimmed = normalizeFamilyName(family);
  if (!trimmed) return { ok: false, reason: 'empty' };

  const existing = get(appSettings).fonts.some((font) =>
    font.sourceType === 'google' && normalizeFamilyName(font.family).toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return { ok: false, reason: 'duplicate' };

  const cachedFont = await fetchGoogleFontPackage(trimmed);
  if (!cachedFont.ok) return cachedFont;

  appSettings.update((current) => ({
    ...current,
    fonts: [
      ...(current.fonts ?? []),
      normalizeFontEntry({
        id: createFontId('gfont'),
        family: cachedFont.family || trimmed,
        googleFamily: trimmed,
        sourceType: 'google',
        enabled: true,
        supportsWeight: cachedFont.supportsWeight,
        axes: cachedFont.axes ?? [],
        weightAxis: cachedFont.weightAxis,
        staticWeight: cachedFont.staticWeight,
        cachedFaces: cachedFont.cachedFaces,
        supportedFeatures: cachedFont.supportedFeatures ?? [],
        featureSupportKnown: cachedFont.featureSupportKnown === true,
        featureSupportScanned: cachedFont.featureSupportScanned === true,
      }),
    ],
  }));

  persistSettings();
  return { ok: true };
}

export function toggleFontEnabled(id) {
  appSettings.update((current) => ({
    ...current,
    fonts: (current.fonts ?? []).map((font) =>
      font.id === id ? { ...font, enabled: !font.enabled } : font
    ),
  }));

  persistSettings();
}

export function removeStoredFont(id) {
  appSettings.update((current) => ({
    ...current,
    fonts: (current.fonts ?? []).filter((font) => font.id !== id),
  }));

  persistSettings();
}

export function toggleIconEnabled(id) {
  appSettings.update((current) => ({
    ...current,
    icons: (current.icons ?? []).map((icon) =>
      icon.id === id ? { ...icon, enabled: !icon.enabled } : icon
    ),
  }));

  persistSettings();
}

export function removeStoredIcon(id) {
  appSettings.update((current) => ({
    ...current,
    icons: (current.icons ?? []).filter((icon) => icon.id !== id),
  }));

  persistSettings();
}
