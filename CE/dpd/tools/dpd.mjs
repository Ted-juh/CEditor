// DPD Node entry: file loading + inheritance orchestration + message builder.
// Pure codecs live in ../codecs.mjs; pure resolution in ../resolve.mjs. Both are re-exported
// here so existing importers are unchanged, and the browser UI imports them directly.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToBytes, bytesToHex, checksumOf } from '../codecs.mjs';
import { applyOverrides, mergeIncludes } from '../resolve.mjs';

export * from '../codecs.mjs';
export * from '../resolve.mjs';
export * from '../dumps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LIB_DIR = join(HERE, '..', 'library');

export function loadProfile(id, libDir = LIB_DIR) {
  return JSON.parse(readFileSync(join(libDir, `${id}.json`), 'utf8'));
}

// Resolve: inherit parent conventions, compose includes (mixins), apply overrides.
export function resolveProfile(id, libDir = LIB_DIR) {
  const profile = loadProfile(id, libDir);
  let merged = profile;
  if (profile.inherits) {
    const parent = resolveProfile(profile.inherits, libDir);
    merged = {
      ...parent, ...profile,
      manufacturerId: profile.manufacturerId ?? parent.manufacturerId,
      deviceId: profile.deviceId ?? parent.deviceId,
      identity: profile.identity ?? parent.identity,
      checksum: profile.checksum ?? parent.checksum,
      byteOrder: profile.byteOrder ?? parent.byteOrder,
      messageShapes: profile.messageShapes ?? parent.messageShapes,
      provenance: profile.provenance ?? parent.provenance,
      scopes: profile.scopes ?? structuredClone(parent.scopes),
    };
  }
  if (Array.isArray(merged.includes) && merged.includes.length) {
    merged = mergeIncludes(merged, merged.includes.map((ref) => resolveProfile(ref.split('@')[0], libDir)));
  }
  if (Array.isArray(merged.overrides) && merged.overrides.length) {
    merged = applyOverrides(merged, merged.overrides);
  }
  return merged;
}

// Expand a messageShape template into wire bytes (with checksum).
export function buildMessage(resolved, shapeId, { addressHex, valueBytes = [], size = 1 }) {
  const shape = (resolved.messageShapes ?? []).find((s) => s.id === shapeId);
  if (!shape) throw new Error(`no messageShape '${shapeId}'`);
  const sizeBytes = hexToBytes(addressHex).map((_, i, arr) => (i === arr.length - 1 ? size : 0));
  const expand = (tok) => {
    if (tok === '$deviceId') return hexToBytes(resolved.deviceId);
    if (tok === '$modelId') return hexToBytes(resolved.modelId);
    if (tok === '$address') return hexToBytes(addressHex);
    if (tok === '$encodedValue') return valueBytes;
    if (tok === '$size') return sizeBytes;
    if (tok === '$checksum') return ['CK'];
    return [parseInt(tok, 16)];
  };
  let bytes = [];
  const marks = {};
  for (const tok of shape.template) {
    if (tok === shape.checksum?.from) marks.from = bytes.length;
    const seg = expand(tok);
    if (seg[0] === 'CK') { marks.ck = bytes.length; bytes.push('CK'); }
    else bytes.push(...seg);
    if (tok === shape.checksum?.to) marks.to = bytes.length - 1;
  }
  if (shape.checksum && shape.checksum.type !== 'none') bytes[marks.ck] = checksumOf(shape.checksum.type, bytes.slice(marks.from, marks.to + 1));
  return bytesToHex(bytes);
}
