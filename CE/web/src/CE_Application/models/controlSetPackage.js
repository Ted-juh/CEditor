// A control set as a FILE — `<name>.ceditor-controlset.json`.
//
// The same envelope idea as a custom-component package (utils/customComponentPackage.js): a
// format id and version so a reader can refuse what it does not understand, metadata a person
// reads (name, version, author, licence), a fingerprint of the payload so "changed since import"
// is answerable, and the payload itself — one set, as models/controlSets.js defines it. A set is
// small (kilobytes; it has no bitmaps), so a file is one set and a library is a folder of them.

import { normalizeControlSetDefinition } from './controlSets.js';
import { deepClone } from '../utils/deepClone.js';

export const CONTROL_SET_PACKAGE_FORMAT = 'ceditor-controlset';
export const CONTROL_SET_PACKAGE_VERSION = 1;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// FNV-1a, as customComponentPackage.js hashes with: eight hex digits, stable across runs, and
// enough to tell "this file changed" from "this file did not".
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slugify(value, fallback = 'set') {
  return String(value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

/** The fingerprint covers the set and only the set — not the metadata, not the export time. */
export function fingerprintControlSet(set) {
  const normalized = normalizeControlSetDefinition(set);
  return normalized ? hashString(stableStringify(normalized)) : '';
}

export function controlSetFileName(set) {
  return `${slugify(set?.name ?? set?.id)}.ceditor-controlset.json`;
}

/** A set, wrapped for the file. `metadata` overrides what the set itself says. */
export function createControlSetEnvelope(set, metadata = {}) {
  const normalized = normalizeControlSetDefinition(set);
  if (!normalized) return null;
  return {
    format: CONTROL_SET_PACKAGE_FORMAT,
    formatVersion: CONTROL_SET_PACKAGE_VERSION,
    // A caller that wants a reproducible file (the committed sets in CE/sets) passes the stamp.
    exportedAt: String(metadata.exportedAt ?? new Date().toISOString()),
    metadata: {
      id: normalized.id,
      name: normalized.name,
      description: normalized.description,
      version: String(metadata.version ?? set?.version ?? '1.0.0'),
      author: String(metadata.author ?? set?.author ?? ''),
      license: String(metadata.license ?? set?.license ?? ''),
      homepage: String(metadata.homepage ?? set?.homepage ?? ''),
    },
    fingerprint: fingerprintControlSet(normalized),
    set: deepClone(normalized),
  };
}

/**
 * A parsed file (or the JSON text of one) as an envelope, or `null` for anything that is not a
 * control-set package this build can read. A newer format version is refused rather than half
 * read: a set that arrives missing its families would silently be a worse set.
 */
export function normalizeControlSetEnvelope(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object' || raw.format !== CONTROL_SET_PACKAGE_FORMAT) return null;
  const formatVersion = Number(raw.formatVersion ?? 1);
  if (!Number.isFinite(formatVersion) || formatVersion > CONTROL_SET_PACKAGE_VERSION) return null;
  const set = normalizeControlSetDefinition(raw.set);
  if (!set) return null;
  return {
    format: CONTROL_SET_PACKAGE_FORMAT,
    formatVersion,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    metadata: {
      id: set.id,
      name: String(raw.metadata?.name ?? set.name),
      description: String(raw.metadata?.description ?? set.description),
      version: String(raw.metadata?.version ?? '1.0.0'),
      author: String(raw.metadata?.author ?? ''),
      license: String(raw.metadata?.license ?? ''),
      homepage: String(raw.metadata?.homepage ?? ''),
    },
    fingerprint: fingerprintControlSet(set),
    // What the file claimed, kept beside what was computed so a reader can tell a hand-edited
    // file from an exported one.
    declaredFingerprint: typeof raw.fingerprint === 'string' ? raw.fingerprint : '',
    set,
  };
}
