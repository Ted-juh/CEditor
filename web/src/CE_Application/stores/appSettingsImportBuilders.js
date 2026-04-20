import { parseFontMetadataFromDataUrl } from '../utils/fontParsing.js';
import {
  createFontId,
  createIconId,
  inferFontMimeTypeFromFileName,
  inferIconMimeTypeFromFileName,
  isSupportedFontFileName,
  isSupportedIconFileName,
  normalizeFontEntry,
  normalizeIconEntry,
  normalizeFamilyName,
  stripExtension,
} from './appSettingsSchema.js';

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

export { isSupportedFontFileName, isSupportedIconFileName };

export async function buildLocalFontEntryFromFile(file) {
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

export async function buildLocalIconEntryFromFile(file) {
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
