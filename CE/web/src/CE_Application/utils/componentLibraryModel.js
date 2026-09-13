/**
 * componentLibraryModel.js — the pure half of the Library tab.
 *
 * No Svelte, no DOM: filtering, sorting and the thumbnail-loss report over the saved-component
 * library. `docs/design/library-tab-design.md` has the argument.
 *
 * THIS IS NOT A SPACE CANDIDATE, and the design record says so. Measured, `CustomPackageLibrary` is
 * 459px empty and 647px with packages in it, and it STOPS THERE — the card grid is capped at 282px
 * with a scrollbar, so twelve saved components render in the same height as three. The case for a
 * tab rests on what the two existing surfaces cannot do between them:
 *
 *   * `CustomPackageLibrary` shows a picture of each package and full metadata, and its only use
 *     action is `applyLibraryEntryToCurrent` — which OVERWRITES the component you have selected. It
 *     never calls `addCustomComponentPackage`. You cannot place a saved component from the library.
 *   * `InsertPanel` can place one, by click or by drag, and shows `entries.slice(0, 6)` with no
 *     query — six, out of however many you have saved, with nothing saying it is truncating — and
 *     draws them as name rows with no picture at all.
 *
 * So the surface with the pictures cannot place, and the surface that places has no pictures and
 * shows six.
 *
 * AND THE PICTURE IS A SECOND RENDERER. `createCustomComponentThumbnail` reduces a component to at
 * most 18 coloured rectangles; the card then draws the first 14 of those. Measured on a 22-part
 * component: the envelope keeps parts 4-21 (`.slice(-18)` after an ascending z-index sort, so the
 * BOTTOM of the stack goes first — the background) and the card draws parts 4-17 (so the top four
 * go too). Fourteen of twenty-two, missing from both ends. The entry carries `envelope.component`,
 * the whole control, so the real renderer can draw it — which is the argument `EffectPreview`
 * already records for effects.
 */

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The caps the shipped code applies, named so the loss report can quote them. */
export const ENVELOPE_PART_CAP = 18;
export const CARD_PART_CAP = 14;

/** How the grid can be ordered. `recent` is the store's own order, most recently saved first. */
export const LIBRARY_SORTS = [
  { key: 'recent', label: 'Recent', hint: 'Most recently saved first.' },
  { key: 'name', label: 'Name', hint: 'Alphabetical.' },
  { key: 'used', label: 'Most used', hint: 'How often you have placed it.' },
  { key: 'ready', label: 'Readiness', hint: "The package's own readiness score." },
];

export const LIBRARY_SORT_KEYS = LIBRARY_SORTS.map((entry) => entry.key);

/** One library entry, reduced to what the grid and the detail column read. */
export function describeEntry(entry, index = 0) {
  const summary = entry?.summary ?? {};
  return {
    id: String(entry?.id ?? ''),
    index,
    name: String(entry?.name ?? 'Untitled'),
    version: String(entry?.version ?? '1.0.0'),
    author: String(entry?.author ?? ''),
    category: String(entry?.category ?? ''),
    description: String(entry?.description ?? ''),
    tags: Array.isArray(entry?.tags) ? entry.tags.filter(Boolean).map(String) : [],
    pinned: entry?.pinned === true,
    useCount: Math.max(0, Math.round(numberOr(entry?.useCount, 0))),
    savedAt: String(entry?.savedAt ?? ''),
    lastUsedAt: String(entry?.lastUsedAt ?? ''),
    readiness: Math.max(0, Math.round(numberOr(entry?.readiness?.score, 0))),
    valid: entry?.validation?.ok !== false,
    issues: Array.isArray(entry?.validation?.issues) ? entry.validation.issues : [],
    fingerprint: String(entry?.fingerprint ?? ''),
    parts: Math.max(0, Math.round(numberOr(summary.parts, 0))),
    valueChannels: Math.max(0, Math.round(numberOr(summary.valueChannels, 0))),
    publicInputs: Math.max(0, Math.round(numberOr(summary.publicInputs, 0))),
    publicOutputs: Math.max(0, Math.round(numberOr(summary.publicOutputs, 0))),
    editableProperties: Math.max(0, Math.round(numberOr(summary.editableProperties, 0))),
    thumbnailParts: Array.isArray(entry?.thumbnail?.parts) ? entry.thumbnail.parts.length : 0,
    component: entry?.component ?? null,
    envelope: entry?.envelope ?? null,
    entry,
  };
}

export function describeLibrary(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => describeEntry(entry, index));
}

/**
 * How much of a component its saved picture actually shows.
 *
 * `null` when nothing is lost. The two caps are applied in different files and neither says
 * anything when it bites, so the report names both and what fell off which end.
 */
export function thumbnailLoss(row) {
  const total = Math.max(0, Math.round(numberOr(row?.parts, 0)));
  if (!total) return null;
  const kept = Math.min(total, ENVELOPE_PART_CAP);
  const drawn = Math.min(kept, CARD_PART_CAP);
  if (drawn >= total) return null;
  return {
    total,
    kept,
    drawn,
    // The envelope sorts by z-index ascending and keeps the LAST 18, so what it throws away is the
    // bottom of the stack — the background before anything else.
    lostFromBottom: total - kept,
    // The card then takes the first 14 of what survived, which is the top of the stack.
    lostFromTop: kept - drawn,
    message: `${drawn} of ${total} parts`,
  };
}

/** Case- and diacritic-insensitive enough for a search box over names, tags and authors. */
function haystack(row) {
  return [row.name, row.author, row.category, row.description, ...row.tags].join(' ').toLowerCase();
}

export function filterLibrary(rows, query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [...(rows ?? [])];
  const terms = q.split(/\s+/).filter(Boolean);
  return (rows ?? []).filter((row) => {
    const text = haystack(row);
    return terms.every((term) => text.includes(term));
  });
}

/**
 * Sorted rows, pinned first.
 *
 * Pinned always leads, whatever the sort, because pinning is the user saying "this one, always" and
 * a sort that buried a pinned entry would make the pin decorative. Ties break on name so the order
 * is total.
 */
export function sortLibrary(rows, sort = 'recent') {
  const key = LIBRARY_SORT_KEYS.includes(sort) ? sort : 'recent';
  const rank = (row) => {
    if (key === 'name') return null;
    if (key === 'used') return -row.useCount;
    if (key === 'ready') return -row.readiness;
    return row.index;
  };
  return [...(rows ?? [])].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (key !== 'name') {
      const a = rank(left);
      const b = rank(right);
      if (a !== b) return a - b;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      || left.id.localeCompare(right.id);
  });
}

/** Every distinct tag in the library, with how many entries carry it, most used first. */
export function libraryTags(rows) {
  const counts = new Map();
  for (const row of (rows ?? [])) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

export function libraryCounts(rows) {
  const list = rows ?? [];
  return {
    total: list.length,
    pinned: list.filter((row) => row.pinned).length,
    invalid: list.filter((row) => !row.valid).length,
    unused: list.filter((row) => row.useCount === 0).length,
  };
}

/** A short, honest "saved 3 days ago" for a card. */
export function relativeTime(iso, now = Date.now()) {
  const then = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/**
 * Every label this tab can edit or filter by.
 *
 * Same purpose as the other tabs' versions: the properties panel's search index is built from the
 * rows it draws, so the day these rows leave the panel the search has to be fed from here.
 */
export function allLibraryFieldLabels() {
  const labels = new Set(['Name', 'Version', 'Author', 'Category', 'Tags', 'Pinned']);
  for (const sort of LIBRARY_SORTS) labels.add(sort.label);
  return [...labels];
}
