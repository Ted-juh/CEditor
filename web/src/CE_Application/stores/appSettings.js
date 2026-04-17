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
  insertOffset,
  duplicateOffset,
  keyboardNudgeSmall,
  keyboardNudgeLarge,
} from './runtimePreferences.js';
import { restoreSessionFromPreferences } from './panels.js';

const BUILTIN_FONTS = [
  'Arial',
  'Verdana',
  'Helvetica',
  'Tahoma',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Consolas',
  'Segoe UI',
  'Trebuchet MS',
  'Impact',
];

export const WEIGHT_OPTIONS = [
  { value: 100, label: '100 Thin' },
  { value: 200, label: '200 Extra Light' },
  { value: 300, label: '300 Light' },
  { value: 400, label: '400 Regular' },
  { value: 500, label: '500 Medium' },
  { value: 600, label: '600 Semi Bold' },
  { value: 700, label: '700 Bold' },
  { value: 800, label: '800 Extra Bold' },
  { value: 900, label: '900 Black' },
];

function createDefaultSettings() {
  return { general: { ...DEFAULT_GENERAL_SETTINGS }, fonts: [], icons: [] };
}

function createFontId(prefix = 'font') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createIconId(prefix = 'icon') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createCssFamily(id) {
  return `ce_font_${String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function normalizeFamilyName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCachedFace(face) {
  return {
    dataUrl: String(face?.dataUrl ?? ''),
    format: String(face?.format ?? ''),
    style: String(face?.style ?? 'normal'),
    weight: String(face?.weight ?? '400'),
    unicodeRange: String(face?.unicodeRange ?? ''),
  };
}

function normalizeSupportedFeatures(features) {
  return Array.isArray(features)
    ? features
      .map((feature) => String(feature ?? '').slice(0, 4))
      .filter((feature) => feature.length === 4)
    : [];
}

function stripExtension(name) {
  return String(name ?? '').replace(/\.[^.]+$/, '');
}

function getExtension(name) {
  const lower = String(name ?? '').toLowerCase();
  const index = lower.lastIndexOf('.');
  return index >= 0 ? lower.slice(index) : '';
}

function isSupportedFontFileName(name) {
  return ['.ttf', '.otf', '.woff', '.woff2'].includes(getExtension(name));
}

function isSupportedIconFileName(name) {
  return ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(getExtension(name));
}

function inferFontMimeTypeFromFileName(name) {
  const extension = getExtension(name);
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.otf') return 'font/otf';
  return 'font/ttf';
}

function inferIconMimeTypeFromFileName(name) {
  const extension = getExtension(name);
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function cssFormatFromMimeType(mimeType) {
  const lower = String(mimeType ?? '').toLowerCase();
  if (lower.includes('woff2')) return 'woff2';
  if (lower.includes('woff')) return 'woff';
  if (lower.includes('otf') || lower.includes('opentype')) return 'opentype';
  if (lower.includes('ttf') || lower.includes('truetype')) return 'truetype';
  return '';
}

function buildFontFaceSource(dataUrl, mimeType = '') {
  const format = cssFormatFromMimeType(mimeType);
  return format ? `url(${dataUrl}) format('${format}')` : `url(${dataUrl})`;
}

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

function normalizeFontEntry(entry) {
  const id = String(entry?.id ?? createFontId(entry?.sourceType === 'google' ? 'gfont' : 'font'));
  const family = normalizeFamilyName(entry?.family ?? entry?.fileName ?? '');
  const supportsWeight = entry?.supportsWeight === true
    || (entry?.sourceType === 'google' && entry?.supportsWeight == null);
  const cachedFaces = Array.isArray(entry?.cachedFaces)
    ? entry.cachedFaces.map(normalizeCachedFace).filter((face) => face.dataUrl)
    : [];

  return {
    id,
    family,
    cssFamily: String(entry?.cssFamily ?? createCssFamily(id)),
    enabled: entry?.enabled !== false,
    sourceType: entry?.sourceType === 'google' ? 'google' : 'local',
    filePath: String(entry?.filePath ?? ''),
    fileName: String(entry?.fileName ?? ''),
    googleFamily: String(entry?.googleFamily ?? family),
    supportsWeight,
    axes: Array.isArray(entry?.axes)
      ? entry.axes
        .map((axis) => ({
          tag: String(axis?.tag ?? '').slice(0, 4),
          min: Number.isFinite(Number(axis?.min)) ? Number(axis.min) : 0,
          default: Number.isFinite(Number(axis?.default)) ? Number(axis.default) : 0,
          max: Number.isFinite(Number(axis?.max)) ? Number(axis.max) : 0,
        }))
        .filter((axis) => axis.tag.length === 4)
      : [],
    weightAxis: entry?.weightAxis ?? null,
    staticWeight: entry?.staticWeight ?? null,
    parseSupported: entry?.parseSupported !== false,
    supportedFeatures: normalizeSupportedFeatures(entry?.supportedFeatures),
    featureSupportKnown: entry?.featureSupportKnown === true,
    featureSupportScanned: entry?.featureSupportScanned === true || entry?.featureSupportKnown === true,
    cachedFaces,
    localDataUrl: String(entry?.localDataUrl ?? ''),
    fileFormat: String(entry?.fileFormat ?? ''),
    fontStyle: String(entry?.fontStyle ?? 'normal'),
    styleName: String(entry?.styleName ?? ''),
  };
}

function normalizeIconEntry(entry) {
  const id = String(entry?.id ?? createIconId('icon'));
  const fileName = String(entry?.fileName ?? '');
  const name = normalizeFamilyName(entry?.name ?? stripExtension(fileName));
  const mimeType = String(entry?.mimeType ?? inferIconMimeTypeFromFileName(fileName));

  return {
    id,
    name,
    enabled: entry?.enabled !== false,
    sourceType: entry?.sourceType === 'builtin' ? 'builtin' : 'local',
    fileName,
    filePath: String(entry?.filePath ?? ''),
    mimeType,
    dataUrl: String(entry?.dataUrl ?? ''),
    isVector: entry?.isVector === true || mimeType.includes('svg'),
    width: Number.isFinite(Number(entry?.width)) ? Number(entry.width) : 0,
    height: Number.isFinite(Number(entry?.height)) ? Number(entry.height) : 0,
  };
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeGeneralSettings(general) {
  return {
    reopenLastSession: general?.reopenLastSession !== false,
    autosaveEnabled: general?.autosaveEnabled !== false,
    autosaveIntervalSeconds: clampInteger(
      general?.autosaveIntervalSeconds,
      DEFAULT_GENERAL_SETTINGS.autosaveIntervalSeconds,
      5,
      600
    ),
    restoreUnsavedWork: general?.restoreUnsavedWork !== false,
    defaultSnapToGrid: general?.defaultSnapToGrid !== false,
    defaultGridSize: clampInteger(
      general?.defaultGridSize,
      DEFAULT_GENERAL_SETTINGS.defaultGridSize,
      1,
      400
    ),
    showRulers: general?.showRulers !== false,
    showGuides: general?.showGuides !== false,
    showDistances: general?.showDistances !== false,
    insertOffset: clampInteger(general?.insertOffset, DEFAULT_GENERAL_SETTINGS.insertOffset, 0, 400),
    duplicateOffset: clampInteger(general?.duplicateOffset, DEFAULT_GENERAL_SETTINGS.duplicateOffset, 0, 400),
    keyboardNudgeSmall: clampInteger(
      general?.keyboardNudgeSmall,
      DEFAULT_GENERAL_SETTINGS.keyboardNudgeSmall,
      1,
      200
    ),
    keyboardNudgeLarge: clampInteger(
      general?.keyboardNudgeLarge,
      DEFAULT_GENERAL_SETTINGS.keyboardNudgeLarge,
      1,
      400
    ),
  };
}

function normalizeSettings(data) {
  const general = normalizeGeneralSettings(data?.general);
  const fonts = Array.isArray(data?.fonts)
    ? data.fonts.map(normalizeFontEntry).filter((font) => font.family)
    : [];
  const icons = Array.isArray(data?.icons)
    ? data.icons.map(normalizeIconEntry).filter((icon) => icon.name && icon.dataUrl)
    : [];
  return { general, fonts, icons };
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

  for (const family of BUILTIN_FONTS) {
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
const loadedLocalFonts = new Set();
const injectedGoogleFonts = new Set();
const loadedGoogleFonts = new Set();
const pendingGoogleCacheRequests = new Set();
const pendingFeatureSupportBackfills = new Set();
const localFontObjectUrls = new Map();
const googleFontObjectUrls = new Map();

function setFontStatus(id, status, detail = '') {
  if (!id) return;
  fontRuntimeStatus.update((current) => ({
    ...current,
    [id]: { status, detail },
  }));
}

function persistSettings() {
  if (!settingsLoaded || !isJuceAvailable()) return;
  bridgeUpdateAppSettings(get(appSettings));
}

function buildGoogleFontHref(family) {
  const trimmed = normalizeFamilyName(family);
  const encoded = encodeURIComponent(trimmed).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
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
  if (injectedGoogleFonts.has(entry.id)) return;

  const existing = document.getElementById(`google-font-${entry.id}`);
  if (existing) {
    injectedGoogleFonts.add(entry.id);
    return;
  }

  const link = document.createElement('link');
  link.id = `google-font-${entry.id}`;
  link.rel = 'stylesheet';
  link.href = buildGoogleFontHref(entry.googleFamily || entry.family);
  document.head.appendChild(link);
  injectedGoogleFonts.add(entry.id);
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
        const fontFace = new FontFace(entry.cssFamily || entry.family, dataUrlToArrayBuffer(face.dataUrl), descriptors);
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (binaryError) {
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
  const fontBuffer = dataUrlToArrayBuffer(dataUrl);
  const mimeType = entry.fileFormat || inferFontMimeTypeFromFileName(entry.fileName);

  try {
    try {
      const binaryFace = new FontFace(entry.cssFamily || entry.family, fontBuffer, descriptors);
      await binaryFace.load();
      document.fonts.add(binaryFace);
    } catch (binaryError) {
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

function readBrowserFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file?.name ?? 'file'}`));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !dataUrl) {
      resolve({ width: 0, height: 0 });
      return;
    }

    const image = new Image();
    image.onload = () => resolve({
      width: Number.isFinite(image.naturalWidth) ? image.naturalWidth : 0,
      height: Number.isFinite(image.naturalHeight) ? image.naturalHeight : 0,
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

async function buildLocalFontEntryFromFile(file) {
  const localDataUrl = await readBrowserFileAsDataUrl(file);
  const fallbackFamily = normalizeFamilyName(String(file?.name ?? '').replace(/\.[^.]+$/, ''));
  const metadata = await parseFontMetadataFromDataUrl(localDataUrl, fallbackFamily);

  return normalizeFontEntry({
    id: createFontId('font'),
    family: metadata.family || fallbackFamily,
    sourceType: 'local',
    enabled: true,
    fileName: String(file?.name ?? ''),
    supportsWeight: metadata.supportsWeight === true,
    axes: metadata.axes ?? [],
    weightAxis: metadata.weightAxis ?? null,
    staticWeight: metadata.staticWeight ?? null,
    parseSupported: metadata.parseSupported !== false,
    supportedFeatures: metadata.supportedFeatures ?? [],
    featureSupportKnown: metadata.featureSupportKnown === true,
    featureSupportScanned: true,
    localDataUrl,
    fileFormat: inferFontMimeTypeFromFileName(file?.name),
    fontStyle: metadata.fontStyle || 'normal',
    styleName: metadata.styleName || '',
  });
}

async function buildLocalIconEntryFromFile(file) {
  const dataUrl = await readBrowserFileAsDataUrl(file);
  const mimeType = String(file?.type || inferIconMimeTypeFromFileName(file?.name));
  const dimensions = await loadImageDimensions(dataUrl);

  return normalizeIconEntry({
    id: createIconId('icon'),
    name: stripExtension(String(file?.name ?? 'Icon')),
    sourceType: 'local',
    enabled: true,
    fileName: String(file?.name ?? ''),
    mimeType,
    dataUrl,
    isVector: mimeType.includes('svg'),
    width: dimensions.width,
    height: dimensions.height,
  });
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

async function primeGoogleFontCache(font) {
  if (!font?.id || pendingGoogleCacheRequests.has(font.id)) return;
  pendingGoogleCacheRequests.add(font.id);

  try {
    const result = await fetchGoogleFontPackage(font.googleFamily || font.family);
    if (!result.ok) return;

    updateStoredFont(font.id, (current) => ({
      ...current,
      family: result.family || current.family,
      googleFamily: current.googleFamily || font.family,
      supportsWeight: result.supportsWeight,
      axes: result.axes ?? [],
      weightAxis: result.weightAxis,
      staticWeight: result.staticWeight,
      cachedFaces: result.cachedFaces,
      parseSupported: true,
      supportedFeatures: result.supportedFeatures ?? [],
      featureSupportKnown: result.featureSupportKnown === true,
      featureSupportScanned: result.featureSupportScanned === true,
      fontStyle: current.fontStyle || 'normal',
      styleName: current.styleName || '',
    }));
  } finally {
    pendingGoogleCacheRequests.delete(font.id);
  }
}

function syncFontLibrary(settings) {
  for (const font of settings.fonts ?? []) {
    if (!font.enabled || !font.family) continue;

    if (font.featureSupportScanned !== true && (font.localDataUrl || font.cachedFaces?.[0]?.dataUrl)) {
      backfillFontFeatureSupport(font);
    }

    if (font.sourceType === 'google') {
      if (Array.isArray(font.cachedFaces) && font.cachedFaces.length > 0) {
        ensureCachedGoogleFontLoaded(font).catch((error) => {
          console.error('[appSettings] Failed to load cached Google font', font.family, error);
        });
      } else {
        primeGoogleFontCache(font);
        ensureGoogleFontStylesheetLoaded(font);
      }
      continue;
    }

    if (font.localDataUrl && !loadedLocalFonts.has(font.id)) {
      loadLocalFontFace(font, font.localDataUrl).catch((error) => {
        console.error('[appSettings] Failed to load cached local font', font.family, error);
      });
      continue;
    }

    if (!font.filePath || loadedLocalFonts.has(font.id)) continue;
    if (!isJuceAvailable()) continue;
    if ([...pendingFontRequests.values()].some((pending) => pending.id === font.id)) continue;

    const requestId = `font_${++fontRequestCounter}`;
    pendingFontRequests.set(requestId, font);
    requestFileData(requestId, font.filePath);
  }
}

appSettings.subscribe((settings) => {
  syncFontLibrary(settings);
});

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
    localDataUrl: dataUrl || font.localDataUrl,
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

export function initAppSettingsBridge() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  onAppSettingsLoaded((payload) => {
    appSettings.set(normalizeSettings(payload ?? createDefaultSettings()));
    applyGeneralSettingsToRuntime(get(appSettings).general);
    settingsLoaded = true;
    restoreSessionFromPreferences();
  });

  onFontsImported((payload) => {
    const imported = Array.isArray(payload) ? payload : payload?.toJSON?.() ?? [];
    mergeImportedFonts(imported);
  });

  onFileData(async (payload) => {
    const font = pendingFontRequests.get(payload?.requestId);
    if (!font) return;

    pendingFontRequests.delete(payload.requestId);

    try {
      await loadLocalFontFace(font, payload.data);
      cacheLocalFontData(font.id, payload.data, font.filePath);
      const metadata = await parseFontMetadataFromDataUrl(payload.data, font.family);
      updateStoredFontMetadata(font.id, metadata);
    } catch (error) {
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
