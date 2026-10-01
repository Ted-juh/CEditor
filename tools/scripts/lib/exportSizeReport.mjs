// exportSizeReport.mjs — what an exported panel's bytes are made of.
//
// An export log said "EXPORTED: … (127.5 MB)" and nothing else, and the number was assumed to be
// artwork. Measured on the GAIA panel it was not: the document carried no embedded image or font at
// all. 94 MB on disk was 28 MB of JSON written with two-space indentation, and 15 MB of the 28 was
// the `Background` section of 3,398 custom-component parts, each carrying its complete defaults
// because the plug-in cannot rebuild them. Nothing in the pipeline could have said so. This can.
//
// What it reports, in the order a reader can act on it:
//   - the file against its compact form (indentation is free to drop; the plug-in only parses it);
//   - the top-level fields by size;
//   - controls by type, with the heaviest section inside custom-component parts named;
//   - every embedded data URL, by type, with the largest named and repeats found by content hash
//     (the same picture pasted into three parts is carried three times);
//   - the carried fonts, which are already cut to the panel's characters by the time they are here.
//
// Pure and dependency-free (node built-ins only), so the installed exporter — which ships these
// scripts and no node_modules — can run it too. Fed the COMPLETE document, after
// completeExportDocument: a sparse one would report the defaults it does not carry as savings.

import { createHash } from 'node:crypto';

const DATA_URL = /^data:([a-z0-9][a-z0-9/+.-]*);base64,([A-Za-z0-9+/=\s]*)$/i;

const compactBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** Decoded size of a base64 payload, from its length and padding, without decoding it. */
function base64Bytes(payload) {
  const text = payload.replace(/\s+/g, '');
  if (!text) return 0;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.floor((text.length * 3) / 4) - padding;
}

/** `Parts.knob.Background.Fill.imageSrc` from a location, storage hops dropped. */
const labelOf = (location) => location.filter((step) => step !== '_children').join('.');

function walk(value, location, visit) {
  if (typeof value === 'string') { visit(value, location); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) walk(child, [...location, key], visit);
}

function childControls(control) {
  const map = control?._children?.Children?._children;
  return map && typeof map === 'object' ? Object.values(map).filter((c) => c?._children?.Core) : [];
}

/**
 * Measure a complete export document.
 *
 * `fileBytes` is the size the document was (or will be) written at, so the report can say what
 * indentation costs; omit it and that line is left out. Returns plain data; `formatExportSizeReport`
 * turns it into lines.
 */
export function exportSizeReport(doc, { fileBytes = null, top = 5 } = {}) {
  const compact = compactBytes(doc);

  const fields = Object.entries(doc ?? {})
    .map(([name, value]) => ({ name, bytes: compactBytes(value) }))
    .sort((a, b) => b.bytes - a.bytes);

  // Controls by type, and inside custom components, parts by section.
  const byType = new Map();
  const partSections = new Map();
  let controls = 0;
  let parts = 0;
  const visitControl = (control) => {
    controls += 1;
    const type = String(control?._children?.Core?.controlType ?? 'unknown');
    const entry = byType.get(type) ?? { type, count: 0, bytes: 0 };
    entry.count += 1;
    // A control's own bytes: a container's members are counted as themselves, below, so a
    // container row that included them would exceed the document (GAIA: 33 containers, "45 MB" of 28).
    const { Children: _members, ...own } = control._children;
    entry.bytes += compactBytes({ ...control, _children: own });
    byType.set(type, entry);
    for (const part of Object.values(control?._children?.Parts?._children ?? {})) {
      parts += 1;
      for (const [section, value] of Object.entries(part?._children ?? {})) {
        partSections.set(section, (partSections.get(section) ?? 0) + compactBytes(value));
      }
    }
    for (const child of childControls(control)) visitControl(child);
  };
  for (const control of doc?.controls ?? []) if (control?._children?.Core) visitControl(control);

  // Embedded media: every data URL, wherever it is, with repeats by content. The carried fonts are
  // data URLs too and are reported on their own line below, so they are not walked here.
  const media = [];
  const seen = new Map();
  const { fonts: _fonts, ...withoutFonts } = doc ?? {};
  walk(withoutFonts, [], (string, location) => {
    const match = DATA_URL.exec(string);
    if (!match) return;
    const [, mime, payload] = match;
    const bytes = base64Bytes(payload);
    const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
    const label = labelOf(location);
    const first = seen.get(hash);
    if (first) first.repeats.push(label);
    const item = { label, mime: mime.toLowerCase(), bytes, hash, repeats: [] };
    if (!first) seen.set(hash, item);
    media.push(item);
  });
  media.sort((a, b) => b.bytes - a.bytes);
  const mediaByType = new Map();
  for (const item of media) {
    const entry = mediaByType.get(item.mime) ?? { mime: item.mime, count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += item.bytes;
    mediaByType.set(item.mime, entry);
  }
  const repeated = [...seen.values()].filter((item) => item.repeats.length)
    .map((item) => ({ ...item, carried: item.repeats.length + 1, wasted: item.bytes * item.repeats.length }))
    .sort((a, b) => b.wasted - a.wasted);

  const fonts = (Array.isArray(doc?.fonts) ? doc.fonts : []).map((font) => ({
    family: String(font?.family ?? ''),
    weight: String(font?.weight ?? ''),
    bytes: typeof font?.data === 'string' ? base64Bytes(font.data.replace(/^data:[^,]*,/, '')) : 0,
  })).sort((a, b) => b.bytes - a.bytes);

  const scripts = Array.isArray(doc?.scripts) ? doc.scripts : [];

  return {
    fileBytes,
    compactBytes: compact,
    fields,
    controls: { count: controls, parts, byType: [...byType.values()].sort((a, b) => b.bytes - a.bytes) },
    partSections: [...partSections.entries()].map(([section, bytes]) => ({ section, bytes })).sort((a, b) => b.bytes - a.bytes),
    media: { items: media.slice(0, top), count: media.length, bytes: media.reduce((sum, m) => sum + m.bytes, 0), byType: [...mediaByType.values()].sort((a, b) => b.bytes - a.bytes), repeated },
    fonts,
    scripts: { count: scripts.length, bytes: compactBytes(scripts) },
    top,
  };
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB`;
const kb = (bytes) => (bytes >= 1048576 ? mb(bytes) : `${Math.round(bytes / 1024)} KB`);
const pct = (part, whole) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '0%');

/** The report as the lines an export log prints. */
export function formatExportSizeReport(report) {
  const lines = [];
  const total = report.compactBytes;
  if (report.fileBytes != null && report.fileBytes > total * 1.05) {
    lines.push(`Panel document: ${kb(report.fileBytes)} on disk, ${kb(total)} compact — ${pct(report.fileBytes - total, report.fileBytes)} is indentation`);
  } else {
    lines.push(`Panel document: ${kb(total)}`);
  }

  const fields = report.fields.filter((f) => f.bytes >= total * 0.02).slice(0, 4);
  if (fields.length) lines.push(`  by field: ${fields.map((f) => `${f.name} ${kb(f.bytes)} (${pct(f.bytes, total)})`).join(', ')}`);

  const { count, parts, byType } = report.controls;
  if (count) {
    const types = byType.slice(0, 4).map((t) => `${t.count} ${t.type} ${kb(t.bytes)}`).join(', ');
    lines.push(`  ${count} controls${parts ? `, ${parts} parts` : ''}: ${types}`);
    const heaviest = report.partSections[0];
    if (heaviest && parts && heaviest.bytes >= total * 0.1) {
      lines.push(`  parts' ${heaviest.section} sections: ${kb(heaviest.bytes)} (${pct(heaviest.bytes, total)}), ${kb(Math.round(heaviest.bytes / parts))} per part — the complete form carries every default`);
    }
  }

  if (report.media.count) {
    const types = report.media.byType.map((t) => `${t.count} ${t.mime} ${kb(t.bytes)}`).join(', ');
    lines.push(`  embedded media: ${kb(report.media.bytes)} (${pct(report.media.bytes, total)}) — ${types}`);
    for (const item of report.media.items) lines.push(`    ${kb(item.bytes).padStart(7)}  ${item.label}`);
    for (const item of report.media.repeated.slice(0, 3)) {
      lines.push(`    repeated ${item.carried}×: ${item.label} (+${item.repeats.length} more), ${kb(item.wasted)} carried again`);
    }
  } else {
    lines.push('  embedded media: none');
  }

  if (report.fonts.length) {
    const sum = report.fonts.reduce((s, f) => s + f.bytes, 0);
    lines.push(`  carried fonts: ${report.fonts.length}, ${kb(sum)} after subsetting — ${report.fonts.slice(0, 4).map((f) => `${f.family} ${f.weight} ${kb(f.bytes)}`).join(', ')}`);
  }
  if (report.scripts.count) lines.push(`  scripts: ${report.scripts.count}, ${kb(report.scripts.bytes)}`);
  return lines;
}
