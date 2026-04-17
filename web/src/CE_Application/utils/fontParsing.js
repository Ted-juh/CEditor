function readTag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readFixed16_16(view, offset) {
  return view.getInt32(offset, false) / 65536;
}

function decodeNameString(bytes, platformId) {
  if (platformId === 0 || platformId === 3) {
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out.replace(/\0/g, '').trim();
  }

  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out.replace(/\0/g, '').trim();
}

function getPreferredName(candidates, preferredIds) {
  for (const nameId of preferredIds) {
    const preferred =
      candidates.find(item => item.nameId === nameId && item.platformId === 3 && item.languageId === 0x0409) ||
      candidates.find(item => item.nameId === nameId) ||
      null;

    if (preferred?.value) return preferred.value;
  }

  return null;
}

function parseTableDirectory(view) {
  const signature = readTag(view, 0);
  const rawSignature = view.getUint32(0, false);

  const isSfnt = rawSignature === 0x00010000 || signature === 'OTTO' || signature === 'true';
  if (!isSfnt) {
    return { format: signature, tables: new Map(), parseSupported: false };
  }

  const numTables = view.getUint16(4, false);
  const tables = new Map();

  for (let i = 0; i < numTables; i++) {
    const base = 12 + i * 16;
    const tag = readTag(view, base);
    const offset = view.getUint32(base + 8, false);
    const length = view.getUint32(base + 12, false);
    tables.set(tag, { offset, length });
  }

  return { format: signature, tables, parseSupported: true };
}

function parseNameTable(view, tables) {
  const table = tables.get('name');
  if (!table) return { family: null, styleName: null };

  const base = table.offset;
  const count = view.getUint16(base + 2, false);
  const stringOffset = view.getUint16(base + 4, false);

  const candidates = [];

  for (let i = 0; i < count; i++) {
    const record = base + 6 + i * 12;
    const platformId = view.getUint16(record, false);
    const languageId = view.getUint16(record + 4, false);
    const nameId = view.getUint16(record + 6, false);
    const length = view.getUint16(record + 8, false);
    const offset = view.getUint16(record + 10, false);
    const start = base + stringOffset + offset;
    const end = start + length;

    if (end > view.byteLength) continue;

    if (nameId === 16 || nameId === 1 || nameId === 17 || nameId === 2) {
      const bytes = new Uint8Array(view.buffer, start, length);
      const value = decodeNameString(bytes, platformId);
      if (value) {
        candidates.push({
          value,
          nameId,
          platformId,
          languageId,
        });
      }
    }
  }

  return {
    family: getPreferredName(candidates, [16, 1]),
    styleName: getPreferredName(candidates, [17, 2]),
  };
}

function parseFvarTable(view, tables) {
  const table = tables.get('fvar');
  if (!table) return null;

  const base = table.offset;
  const offsetToData = view.getUint16(base + 4, false);
  const axisCount = view.getUint16(base + 8, false);
  const axisSize = view.getUint16(base + 10, false);

  const axes = [];
  for (let i = 0; i < axisCount; i++) {
    const axisOffset = base + offsetToData + i * axisSize;
    const tag = readTag(view, axisOffset);
    const minValue = readFixed16_16(view, axisOffset + 4);
    const defaultValue = readFixed16_16(view, axisOffset + 8);
    const maxValue = readFixed16_16(view, axisOffset + 12);
    axes.push({ tag, minValue, defaultValue, maxValue });
  }

  return axes;
}

function parseOs2Weight(view, tables) {
  const table = tables.get('OS/2');
  if (!table) return null;
  const offset = table.offset + 4;
  if (offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, false);
}

function parseHeadMacStyle(view, tables) {
  const table = tables.get('head');
  if (!table) return null;
  const offset = table.offset + 44;
  if (offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, false);
}

function parseFeatureTagsFromLayoutTable(view, tables, tableTag) {
  const table = tables.get(tableTag);
  if (!table) return [];

  const base = table.offset;
  if (base + 8 > view.byteLength) return [];

  const featureListOffset = view.getUint16(base + 6, false);
  if (!featureListOffset) return [];

  const featureListBase = base + featureListOffset;
  if (featureListBase + 2 > view.byteLength) return [];

  const featureCount = view.getUint16(featureListBase, false);
  const tags = [];

  for (let i = 0; i < featureCount; i += 1) {
    const record = featureListBase + 2 + i * 6;
    if (record + 6 > view.byteLength) break;
    tags.push(readTag(view, record));
  }

  return tags;
}

function parseOpenTypeFeatureTags(view, tables) {
  const tags = new Set([
    ...parseFeatureTagsFromLayoutTable(view, tables, 'GSUB'),
    ...parseFeatureTagsFromLayoutTable(view, tables, 'GPOS'),
  ]);
  return [...tags].filter((tag) => String(tag).length === 4).sort();
}

export async function parseFontMetadataFromDataUrl(dataUrl, fallbackFamily = '') {
  const response = await fetch(dataUrl);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const { format, tables, parseSupported } = parseTableDirectory(view);

  const names = parseSupported ? parseNameTable(view, tables) : { family: fallbackFamily, styleName: null };
  const family = parseSupported ? (names.family || fallbackFamily) : fallbackFamily;
  const axes = parseSupported ? parseFvarTable(view, tables) : null;
  const weightAxis = axes?.find(axis => axis.tag === 'wght') ?? null;
  const staticWeight = parseSupported ? parseOs2Weight(view, tables) : null;
  const macStyle = parseSupported ? parseHeadMacStyle(view, tables) : null;
  const supportedFeatures = parseSupported ? parseOpenTypeFeatureTags(view, tables) : [];
  const styleName = names.styleName || '';
  const isItalic = /italic|oblique/i.test(styleName) || ((macStyle ?? 0) & 0x0002) !== 0;

  return {
    format,
    parseSupported,
    featureSupportKnown: parseSupported === true,
    family,
    styleName,
    fontStyle: isItalic ? 'italic' : 'normal',
    supportsWeight: !!weightAxis,
    supportedFeatures,
    axes: Array.isArray(axes)
      ? axes.map((axis) => ({
        tag: axis.tag,
        min: axis ? Math.round(axis.minValue) : 0,
        default: axis ? Math.round(axis.defaultValue) : 0,
        max: axis ? Math.round(axis.maxValue) : 0,
      }))
      : [],
    weightAxis: weightAxis ? {
      min: Math.round(weightAxis.minValue),
      default: Math.round(weightAxis.defaultValue),
      max: Math.round(weightAxis.maxValue),
    } : null,
    staticWeight: staticWeight ?? null,
  };
}
