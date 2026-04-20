import { DEFAULT_GENERAL_SETTINGS } from './runtimePreferences.js';

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

export function getBuiltinFonts() {
  return BUILTIN_FONTS;
}

export function createDefaultSettings() {
  return { general: { ...DEFAULT_GENERAL_SETTINGS }, fonts: [], icons: [] };
}

export function createFontId(prefix = 'font') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createIconId(prefix = 'icon') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createCssFamily(id) {
  return `ce_font_${String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function normalizeFamilyName(value) {
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

export function normalizeSupportedFeatures(features) {
  return Array.isArray(features)
    ? features
      .map((feature) => String(feature ?? '').slice(0, 4))
      .filter((feature) => feature.length === 4)
    : [];
}

export function stripExtension(name) {
  return String(name ?? '').replace(/\.[^.]+$/, '');
}

function getExtension(name) {
  const lower = String(name ?? '').toLowerCase();
  const index = lower.lastIndexOf('.');
  return index >= 0 ? lower.slice(index) : '';
}

export function isSupportedFontFileName(name) {
  return ['.ttf', '.otf', '.woff', '.woff2'].includes(getExtension(name));
}

export function isSupportedIconFileName(name) {
  return ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(getExtension(name));
}

export function inferFontMimeTypeFromFileName(name) {
  const extension = getExtension(name);
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.woff') return 'font/woff';
  if (extension === '.otf') return 'font/otf';
  return 'font/ttf';
}

export function inferIconMimeTypeFromFileName(name) {
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

export function buildFontFaceSource(dataUrl, mimeType = '') {
  const format = cssFormatFromMimeType(mimeType);
  return format ? `url(${dataUrl}) format('${format}')` : `url(${dataUrl})`;
}

export function normalizeFontEntry(entry) {
  const id = String(entry?.id ?? createFontId(entry?.sourceType === 'google' ? 'gfont' : 'font'));
  const family = normalizeFamilyName(entry?.family ?? entry?.fileName ?? '');
  const filePath = String(entry?.filePath ?? '');
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
    filePath,
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
    localDataUrl: filePath ? '' : String(entry?.localDataUrl ?? ''),
    fileFormat: String(entry?.fileFormat ?? ''),
    fontStyle: String(entry?.fontStyle ?? 'normal'),
    styleName: String(entry?.styleName ?? ''),
  };
}

export function normalizeIconEntry(entry) {
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

export function normalizeGeneralSettings(general) {
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
    showPreviewSelectionRing: general?.showPreviewSelectionRing !== false,
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

export function normalizeSettings(data) {
  const general = normalizeGeneralSettings(data?.general);
  const fonts = Array.isArray(data?.fonts)
    ? data.fonts.map(normalizeFontEntry).filter((font) => font.family)
    : [];
  const icons = Array.isArray(data?.icons)
    ? data.icons.map(normalizeIconEntry).filter((icon) => icon.name && icon.dataUrl)
    : [];

  return { general, fonts, icons };
}

export function sanitizeSettingsForPersistence(settings) {
  return {
    ...(settings ?? createDefaultSettings()),
    fonts: Array.isArray(settings?.fonts)
      ? settings.fonts.map((font) => {
        const nextFont = { ...font };
        if (nextFont.filePath) {
          nextFont.localDataUrl = '';
        }

        if (nextFont.sourceType === 'google') {
          nextFont.cachedFaces = [];
        }

        return nextFont;
      })
      : [],
    icons: Array.isArray(settings?.icons) ? settings.icons : [],
  };
}

export function shouldCompactPersistedSettings(settings) {
  return Array.isArray(settings?.fonts) && settings.fonts.some((font) =>
    (font?.filePath && font?.localDataUrl)
    || (font?.sourceType === 'google' && Array.isArray(font.cachedFaces) && font.cachedFaces.length > 0)
  );
}
