// Single source of truth for a panel's exported plugin identity. Mirrors the C++
// PanelExportIdentity (deriveIdentity in CE/src/Export/PanelExportIdentity.h) EXACTLY: a stable GUID
// is hashed (FNV-1a/64) into the per-panel VST3 plugin code + AU subtype, so identically-named
// panels still get distinct FUIDs (the Ctrlr collision fix). Used by the editor's Export settings
// UI (live derived-code preview) AND by tools/scripts/export-panel-vst3.mjs (the actual build), so
// what the UI shows is what gets built. The .mjs runs a self-check against the canonical C++ output.
//
// Browser-safe: uses TextEncoder (not Node's Buffer) for UTF-8 bytes — identical byte sequence, so
// the hash is identical in both runtimes.

const MASK = (1n << 64n) - 1n;
const FNV_OFFSET = 1469598103934665603n;
const FNV_PRIME = 1099511628211n;
const utf8 = new TextEncoder();

function fnv1a(str, salt) {
  let h = (FNV_OFFSET ^ salt) & MASK;
  for (const b of utf8.encode(str)) {
    h = (h ^ BigInt(b)) & MASK;
    h = (h * FNV_PRIME) & MASK;
  }
  return h;
}

function code4(h) {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = upper[Number(h % 26n)];
  h /= 26n;
  for (let i = 0; i < 3; i++) {
    out += alnum[Number(h % 62n)];
    h /= 62n;
  }
  return out;
}

function slug(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Derive the full plugin identity from a panel's stable GUID + metadata.
 * @returns {{guid, productName, vendor, mfrCode, version, pluginCode, auSubtype, clapId}}
 */
export function deriveIdentity(guid, name, vendor, mfrCode, version) {
  const pluginCode = code4(fnv1a(guid, 0x9E3779B97F4A7C15n));
  const auSubtype = code4(fnv1a(guid, 0xC2B2AE3D27D4EB4Fn));
  const shortGuid = ((fnv1a(guid, 0n) >> 32n) & 0xFFFFFFFFn).toString(16).padStart(8, '0');
  const clapId = `com.${slug(vendor || 'ceditor')}.${slug(name) ? slug(name) + '.' : ''}${shortGuid}`;
  return { guid, productName: name || 'CEditor Panel', vendor, mfrCode, version, pluginCode, auSubtype, clapId };
}
